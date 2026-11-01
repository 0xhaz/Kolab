#![allow(dead_code)]
//! LiteSVM harness: one funded campaign world per test, with helpers that build each Kolab
//! instruction from the Anchor-generated `instruction::*` / `accounts::*` types.

use anchor_lang::{
    prelude::{Clock, Pubkey},
    solana_program::instruction::Instruction,
    InstructionData, ToAccountMetas,
};
use anchor_spl::associated_token::get_associated_token_address;
use kolab::{
    state::{CampaignType, SlotKind, SlotTemplate},
    CreateCampaignArgs,
};
use litesvm::LiteSVM;
use litesvm_token::{
    get_spl_account, spl_token::state::Account as SplAccount, CreateAssociatedTokenAccount,
    CreateMint, MintTo,
};
use solana_keypair::Keypair;
use solana_message::{Message, VersionedMessage};
use solana_signer::Signer;
use solana_transaction::versioned::VersionedTransaction;

pub const USDC: u64 = 1_000_000; // 6 decimals
pub const HOUR: i64 = 3_600;
pub const DAY: i64 = 24 * HOUR;
pub const START: i64 = 1_800_000_000;

pub const FEE_BPS: u16 = 500; // 5%
pub const HOLDBACK_BPS: u16 = 3_000; // 30%
pub const REVIEW: i64 = 72 * HOUR;
pub const GRACE: i64 = 48 * HOUR;
pub const SHIP_WINDOW: i64 = 14 * DAY;

pub fn post(amount_usdc: u64, due_days: i64) -> SlotTemplate {
    SlotTemplate { kind: SlotKind::Post, amount: amount_usdc * USDC, due_offset: due_days * DAY }
}
pub fn ugc(amount_usdc: u64, due_days: i64) -> SlotTemplate {
    SlotTemplate { kind: SlotKind::Ugc, amount: amount_usdc * USDC, due_offset: due_days * DAY }
}

pub fn monthly(slots: Vec<SlotTemplate>) -> CreateCampaignArgs {
    CreateCampaignArgs {
        campaign_id: 1,
        campaign_type: CampaignType::Monthly,
        start_ts: START,
        end_ts: START + 60 * DAY,
        review_window_secs: REVIEW,
        grace_secs: GRACE,
        holdback_bps: HOLDBACK_BPS,
        requires_shipping: false,
        shipping_window_secs: 0,
        per_sale_amount: 0,
        max_creators: 10,
        slots,
    }
}

pub struct World {
    pub svm: LiteSVM,
    pub admin: Keypair,
    pub verifier: Keypair,
    pub treasury: Keypair,
    pub brand: Keypair,
    pub creator: Keypair,
    /// Sponsor / fee payer, like the backend in production.
    pub payer: Keypair,
    pub mint: Pubkey,
    pub config: Pubkey,
}

pub fn config_pda() -> Pubkey {
    Pubkey::find_program_address(&[kolab::CONFIG_SEED], &kolab::id()).0
}
pub fn campaign_pda(brand: &Pubkey, id: u64) -> Pubkey {
    Pubkey::find_program_address(&[kolab::CAMPAIGN_SEED, brand.as_ref(), &id.to_le_bytes()], &kolab::id()).0
}
pub fn enrollment_pda(campaign: &Pubkey, creator: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[kolab::ENROLLMENT_SEED, campaign.as_ref(), creator.as_ref()], &kolab::id()).0
}
pub fn approval_pda(campaign: &Pubkey, creator: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[kolab::APPROVAL_SEED, campaign.as_ref(), creator.as_ref()], &kolab::id()).0
}
pub fn slot_pda(enrollment: &Pubkey, period: u16, idx: u8) -> Pubkey {
    Pubkey::find_program_address(
        &[kolab::SLOT_SEED, enrollment.as_ref(), &period.to_le_bytes(), &[idx]],
        &kolab::id(),
    )
    .0
}
pub fn sale_pda(enrollment: &Pubkey, ref_hash: &[u8; 32]) -> Pubkey {
    Pubkey::find_program_address(&[kolab::SALE_SEED, enrollment.as_ref(), ref_hash], &kolab::id()).0
}

/// Asserts a failed tx carries the given Kolab error (Anchor custom errors start at 6000).
pub fn assert_kolab_err(res: Result<(), String>, err: kolab::error::KolabError) {
    let code = 6000 + err as u32;
    match res {
        Ok(()) => panic!("expected {err:?} ({code}), tx succeeded"),
        Err(e) => assert!(e.contains(&format!("Custom({code})")), "expected {err:?} ({code}), got {e}"),
    }
}

impl World {
    pub fn new() -> Self {
        let mut svm = LiteSVM::new();
        let bytes = include_bytes!(concat!(env!("CARGO_TARGET_TMPDIR"), "/../deploy/kolab.so"));
        svm.add_program(kolab::id(), bytes).unwrap();

        let [admin, verifier, treasury, brand, creator, payer] =
            std::array::from_fn(|_| Keypair::new());
        for k in [&admin, &verifier, &payer] {
            svm.airdrop(&k.pubkey(), 100_000_000_000).unwrap();
        }
        let mint = CreateMint::new(&mut svm, &admin).decimals(6).send().unwrap();

        let mut w = World { svm, admin, verifier, treasury, brand, creator, payer, mint, config: config_pda() };
        w.set_time(START);

        let brand_ata = w.create_ata(&w.brand.pubkey());
        MintTo::new(&mut w.svm, &w.admin, &w.mint, &brand_ata, 10_000 * USDC).send().unwrap();

        let ix = Instruction {
            program_id: kolab::id(),
            accounts: kolab::accounts::InitConfig {
                admin: w.admin.pubkey(),
                config: w.config,
                system_program: anchor_lang::system_program::ID,
            }
            .to_account_metas(None),
            data: kolab::instruction::InitConfig {
                treasury: w.treasury.pubkey(),
                verifier: w.verifier.pubkey(),
                fee_bps: FEE_BPS,
            }
            .data(),
        };
        w.send(&[ix], &[]).unwrap();
        let ix = w.allow_mint_ix(w.mint);
        w.send(&[ix], &[]).unwrap();
        w
    }

    // ------------------------------------------------------------------ plumbing

    pub fn send(&mut self, ixs: &[Instruction], extra_signers: &[&Keypair]) -> Result<(), String> {
        let mut signers: Vec<&Keypair> = vec![&self.payer];
        for k in extra_signers {
            if !signers.iter().any(|s| s.pubkey() == k.pubkey()) {
                signers.push(k);
            }
        }
        // admin signs config instructions; include when present in the accounts list
        if ixs.iter().any(|ix| ix.accounts.iter().any(|a| a.is_signer && a.pubkey == self.admin.pubkey()))
            && !signers.iter().any(|s| s.pubkey() == self.admin.pubkey())
        {
            signers.push(&self.admin);
        }
        let msg = Message::new_with_blockhash(ixs, Some(&self.payer.pubkey()), &self.svm.latest_blockhash());
        let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &signers).map_err(|e| e.to_string())?;
        let res = self.svm.send_transaction(tx).map(|_| ()).map_err(|e| format!("{:?} {:?}", e.err, e.meta.logs));
        self.svm.expire_blockhash();
        res
    }

    pub fn set_time(&mut self, ts: i64) {
        let mut clock: Clock = self.svm.get_sysvar();
        clock.unix_timestamp = ts;
        self.svm.set_sysvar(&clock);
    }
    pub fn now(&self) -> i64 {
        self.svm.get_sysvar::<Clock>().unix_timestamp
    }
    pub fn advance(&mut self, secs: i64) {
        let t = self.now();
        self.set_time(t + secs);
    }

    pub fn create_ata(&mut self, owner: &Pubkey) -> Pubkey {
        CreateAssociatedTokenAccount::new(&mut self.svm, &self.payer, &self.mint).owner(owner).send().unwrap()
    }
    pub fn ata(&self, owner: &Pubkey) -> Pubkey {
        get_associated_token_address(owner, &self.mint)
    }
    /// Token balance of `owner`'s ATA (0 if it doesn't exist).
    pub fn balance(&self, owner: &Pubkey) -> u64 {
        get_spl_account::<SplAccount>(&self.svm, &self.ata(owner)).map(|a| a.amount).unwrap_or(0)
    }

    pub fn account<T: anchor_lang::AccountDeserialize>(&self, key: &Pubkey) -> T {
        let acc = self.svm.get_account(key).expect("account missing");
        T::try_deserialize(&mut acc.data.as_slice()).unwrap()
    }

    // ------------------------------------------------------------------ instruction builders

    pub fn allow_mint_ix(&self, mint: Pubkey) -> Instruction {
        Instruction {
            program_id: kolab::id(),
            accounts: kolab::accounts::AllowMint { admin: self.admin.pubkey(), config: self.config, mint }
                .to_account_metas(None),
            data: kolab::instruction::AllowMint {}.data(),
        }
    }

    pub fn create_campaign(&mut self, args: CreateCampaignArgs) -> Result<Pubkey, String> {
        let campaign = campaign_pda(&self.brand.pubkey(), args.campaign_id);
        let ix = Instruction {
            program_id: kolab::id(),
            accounts: kolab::accounts::CreateCampaign {
                brand: self.brand.pubkey(),
                payer: self.payer.pubkey(),
                config: self.config,
                campaign,
                mint: self.mint,
                vault: get_associated_token_address(&campaign, &self.mint),
                token_program: anchor_spl::token::ID,
                associated_token_program: anchor_spl::associated_token::ID,
                system_program: anchor_lang::system_program::ID,
            }
            .to_account_metas(None),
            data: kolab::instruction::CreateCampaign { args }.data(),
        };
        let brand = self.brand.insecure_clone();
        self.send(&[ix], &[&brand])?;
        Ok(campaign)
    }

    pub fn fund(&mut self, campaign: Pubkey, amount: u64) -> Result<(), String> {
        let ix = Instruction {
            program_id: kolab::id(),
            accounts: kolab::accounts::FundCampaign {
                brand: self.brand.pubkey(),
                campaign,
                mint: self.mint,
                vault: get_associated_token_address(&campaign, &self.mint),
                brand_token: self.ata(&self.brand.pubkey()),
                token_program: anchor_spl::token::ID,
            }
            .to_account_metas(None),
            data: kolab::instruction::FundCampaign { amount }.data(),
        };
        let brand = self.brand.insecure_clone();
        self.send(&[ix], &[&brand])
    }

    /// Any wallet tops up a campaign (cross-chain funding: Aurora's intermediary is the funder).
    pub fn top_up(&mut self, campaign: Pubkey, funder: &Keypair, amount: u64) -> Result<(), String> {
        let ix = Instruction {
            program_id: kolab::id(),
            accounts: kolab::accounts::TopUpCampaign {
                funder: funder.pubkey(),
                campaign,
                mint: self.mint,
                vault: get_associated_token_address(&campaign, &self.mint),
                funder_token: self.ata(&funder.pubkey()),
                token_program: anchor_spl::token::ID,
            }
            .to_account_metas(None),
            data: kolab::instruction::TopUpCampaign { amount }.data(),
        };
        self.send(&[ix], &[funder])
    }

    /// Brand approves `creator` (Pubkey::default() = open invite).
    pub fn approve_creator(&mut self, campaign: Pubkey, creator: Pubkey) -> Result<Pubkey, String> {
        let approval = approval_pda(&campaign, &creator);
        let brand = self.brand.insecure_clone();
        self.approve_creator_as(campaign, creator, &brand)?;
        Ok(approval)
    }

    pub fn approve_creator_as(&mut self, campaign: Pubkey, creator: Pubkey, signer: &Keypair) -> Result<(), String> {
        let ix = Instruction {
            program_id: kolab::id(),
            accounts: kolab::accounts::ApproveCreator {
                brand: signer.pubkey(),
                payer: self.payer.pubkey(),
                campaign,
                approval: approval_pda(&campaign, &creator),
                system_program: anchor_lang::system_program::ID,
            }
            .to_account_metas(None),
            data: kolab::instruction::ApproveCreator { creator }.data(),
        };
        self.send(&[ix], &[signer])
    }

    pub fn revoke_approval(&mut self, campaign: Pubkey, creator: Pubkey) -> Result<(), String> {
        let ix = Instruction {
            program_id: kolab::id(),
            accounts: kolab::accounts::RevokeApproval {
                brand: self.brand.pubkey(),
                rent_receiver: self.payer.pubkey(),
                campaign,
                approval: approval_pda(&campaign, &creator),
            }
            .to_account_metas(None),
            data: kolab::instruction::RevokeApproval {}.data(),
        };
        let brand = self.brand.insecure_clone();
        self.send(&[ix], &[&brand])
    }

    /// Approves the creator if needed, then enrolls (the common happy path).
    pub fn enroll(&mut self, campaign: Pubkey, creator: &Keypair, voucher_hash: [u8; 32]) -> Result<Pubkey, String> {
        let open = approval_pda(&campaign, &Pubkey::default());
        let own = approval_pda(&campaign, &creator.pubkey());
        if self.svm.get_account(&open).is_none() && self.svm.get_account(&own).is_none() {
            self.approve_creator(campaign, creator.pubkey())?;
        }
        let approval = if self.svm.get_account(&own).is_some() { own } else { open };
        self.enroll_with(campaign, creator, approval, voucher_hash)
    }

    /// enroll_creator + one init_slot per template slot, in one tx (as the API will build it).
    pub fn enroll_with(&mut self, campaign: Pubkey, creator: &Keypair, approval: Pubkey, voucher_hash: [u8; 32]) -> Result<Pubkey, String> {
        let enrollment = enrollment_pda(&campaign, &creator.pubkey());
        let slot_count: kolab::state::Campaign = self.account(&campaign);
        let mut ixs = vec![Instruction {
            program_id: kolab::id(),
            accounts: kolab::accounts::EnrollCreator {
                creator: creator.pubkey(),
                payer: self.payer.pubkey(),
                config: self.config,
                campaign,
                approval,
                enrollment,
                system_program: anchor_lang::system_program::ID,
            }
            .to_account_metas(None),
            data: kolab::instruction::EnrollCreator { voucher_hash }.data(),
        }];
        for idx in 0..slot_count.slot_count {
            ixs.push(self.init_slot_ix(campaign, enrollment, slot_count.period_index, idx));
        }
        self.send(&ixs, &[creator])?;
        Ok(enrollment)
    }

    pub fn init_slot_ix(&self, campaign: Pubkey, enrollment: Pubkey, period: u16, idx: u8) -> Instruction {
        Instruction {
            program_id: kolab::id(),
            accounts: kolab::accounts::InitSlot {
                payer: self.payer.pubkey(),
                campaign,
                enrollment,
                slot: slot_pda(&enrollment, period, idx),
                system_program: anchor_lang::system_program::ID,
            }
            .to_account_metas(None),
            data: kolab::instruction::InitSlot { slot_idx: idx }.data(),
        }
    }

    pub fn mark_shipped(&mut self, campaign: Pubkey, enrollment: Pubkey) -> Result<(), String> {
        let ix = Instruction {
            program_id: kolab::id(),
            accounts: kolab::accounts::MarkShipped { brand: self.brand.pubkey(), config: self.config, campaign, enrollment }
                .to_account_metas(None),
            data: kolab::instruction::MarkShipped { tracking_hash: [7; 32] }.data(),
        };
        let brand = self.brand.insecure_clone();
        self.send(&[ix], &[&brand])
    }

    pub fn confirm_received(&mut self, campaign: Pubkey, enrollment: Pubkey, signer: &Keypair) -> Result<(), String> {
        let ix = Instruction {
            program_id: kolab::id(),
            accounts: kolab::accounts::ConfirmReceived { signer: signer.pubkey(), config: self.config, campaign, enrollment }
                .to_account_metas(None),
            data: kolab::instruction::ConfirmReceived {}.data(),
        };
        self.send(&[ix], &[signer])
    }

    pub fn report_not_received(&mut self, campaign: Pubkey, enrollment: Pubkey) -> Result<(), String> {
        let ix = Instruction {
            program_id: kolab::id(),
            accounts: kolab::accounts::ReportNotReceived { creator: self.creator.pubkey(), config: self.config, campaign, enrollment }
                .to_account_metas(None),
            data: kolab::instruction::ReportNotReceived {}.data(),
        };
        let creator = self.creator.insecure_clone();
        self.send(&[ix], &[&creator])
    }

    pub fn cancel_enrollment(&mut self, campaign: Pubkey, enrollment: Pubkey) -> Result<(), String> {
        let ix = Instruction {
            program_id: kolab::id(),
            accounts: kolab::accounts::CancelEnrollment {
                brand: self.brand.pubkey(),
                payer: self.payer.pubkey(),
                campaign,
                mint: self.mint,
                vault: get_associated_token_address(&campaign, &self.mint),
                enrollment,
                brand_token: self.ata(&self.brand.pubkey()),
                token_program: anchor_spl::token::ID,
                associated_token_program: anchor_spl::associated_token::ID,
                system_program: anchor_lang::system_program::ID,
            }
            .to_account_metas(None),
            data: kolab::instruction::CancelEnrollment {}.data(),
        };
        let brand = self.brand.insecure_clone();
        self.send(&[ix], &[&brand])
    }

    pub fn submit(&mut self, campaign: Pubkey, enrollment: Pubkey, slot: Pubkey) -> Result<(), String> {
        let ix = Instruction {
            program_id: kolab::id(),
            accounts: kolab::accounts::SubmitDeliverable {
                creator: self.creator.pubkey(),
                config: self.config,
                campaign,
                enrollment,
                slot,
            }
            .to_account_metas(None),
            data: kolab::instruction::SubmitDeliverable { content_hash: [9; 32] }.data(),
        };
        let creator = self.creator.insecure_clone();
        self.send(&[ix], &[&creator])
    }

    pub fn attest_checks(&mut self, slot: Pubkey, passed: bool, signer: &Keypair) -> Result<(), String> {
        let ix = Instruction {
            program_id: kolab::id(),
            accounts: kolab::accounts::AttestChecks { verifier: signer.pubkey(), config: self.config, slot }
                .to_account_metas(None),
            data: kolab::instruction::AttestChecks { passed }.data(),
        };
        self.send(&[ix], &[signer])
    }

    pub fn reject(&mut self, campaign: Pubkey, enrollment: Pubkey, slot: Pubkey) -> Result<(), String> {
        let ix = Instruction {
            program_id: kolab::id(),
            accounts: kolab::accounts::RejectSlot { brand: self.brand.pubkey(), config: self.config, campaign, enrollment, slot }
                .to_account_metas(None),
            data: kolab::instruction::Reject { reason_code: 1 }.data(),
        };
        let brand = self.brand.insecure_clone();
        self.send(&[ix], &[&brand])
    }

    fn settle(&self, campaign: Pubkey, enrollment: Pubkey, slot: Pubkey) -> kolab::accounts::Settle {
        kolab::accounts::Settle {
            payer: self.payer.pubkey(),
            config: self.config,
            campaign,
            mint: self.mint,
            vault: get_associated_token_address(&campaign, &self.mint),
            enrollment,
            slot,
            creator: self.creator.pubkey(),
            creator_token: self.ata(&self.creator.pubkey()),
            treasury: self.treasury.pubkey(),
            treasury_token: self.ata(&self.treasury.pubkey()),
            brand: self.brand.pubkey(),
            brand_token: self.ata(&self.brand.pubkey()),
            token_program: anchor_spl::token::ID,
            associated_token_program: anchor_spl::associated_token::ID,
            system_program: anchor_lang::system_program::ID,
        }
    }

    pub fn approve(&mut self, campaign: Pubkey, enrollment: Pubkey, slot: Pubkey, signer: &Keypair) -> Result<(), String> {
        let ix = Instruction {
            program_id: kolab::id(),
            accounts: kolab::accounts::Approve { brand_signer: signer.pubkey(), settle: self.settle(campaign, enrollment, slot) }
                .to_account_metas(None),
            data: kolab::instruction::Approve {}.data(),
        };
        self.send(&[ix], &[signer])
    }

    pub fn auto_release(&mut self, campaign: Pubkey, enrollment: Pubkey, slot: Pubkey) -> Result<(), String> {
        let ix = Instruction {
            program_id: kolab::id(),
            accounts: kolab::accounts::Crank { settle: self.settle(campaign, enrollment, slot) }.to_account_metas(None),
            data: kolab::instruction::AutoRelease {}.data(),
        };
        self.send(&[ix], &[])
    }

    pub fn mark_missed(&mut self, campaign: Pubkey, enrollment: Pubkey, slot: Pubkey) -> Result<(), String> {
        let ix = Instruction {
            program_id: kolab::id(),
            accounts: kolab::accounts::Crank { settle: self.settle(campaign, enrollment, slot) }.to_account_metas(None),
            data: kolab::instruction::MarkMissed {}.data(),
        };
        self.send(&[ix], &[])
    }

    pub fn attest_live(&mut self, campaign: Pubkey, enrollment: Pubkey, slot: Pubkey, still_live: bool, signer: &Keypair) -> Result<(), String> {
        let ix = Instruction {
            program_id: kolab::id(),
            accounts: kolab::accounts::AttestLive { verifier: signer.pubkey(), settle: self.settle(campaign, enrollment, slot) }
                .to_account_metas(None),
            data: kolab::instruction::AttestLive { still_live }.data(),
        };
        self.send(&[ix], &[signer])
    }

    pub fn record_sale(&mut self, campaign: Pubkey, enrollment: Pubkey, ref_hash: [u8; 32], signer: &Keypair) -> Result<(), String> {
        let ix = Instruction {
            program_id: kolab::id(),
            accounts: kolab::accounts::RecordSale {
                verifier: signer.pubkey(),
                payer: self.payer.pubkey(),
                config: self.config,
                campaign,
                enrollment,
                sale_receipt: sale_pda(&enrollment, &ref_hash),
                system_program: anchor_lang::system_program::ID,
            }
            .to_account_metas(None),
            data: kolab::instruction::RecordSale { ref_hash }.data(),
        };
        self.send(&[ix], &[signer])
    }

    pub fn claim_sales(&mut self, campaign: Pubkey, enrollment: Pubkey) -> Result<(), String> {
        let ix = Instruction {
            program_id: kolab::id(),
            accounts: kolab::accounts::ClaimSales {
                creator: self.creator.pubkey(),
                payer: self.payer.pubkey(),
                config: self.config,
                campaign,
                mint: self.mint,
                vault: get_associated_token_address(&campaign, &self.mint),
                enrollment,
                creator_token: self.ata(&self.creator.pubkey()),
                treasury: self.treasury.pubkey(),
                treasury_token: self.ata(&self.treasury.pubkey()),
                token_program: anchor_spl::token::ID,
                associated_token_program: anchor_spl::associated_token::ID,
                system_program: anchor_lang::system_program::ID,
            }
            .to_account_metas(None),
            data: kolab::instruction::ClaimSales {}.data(),
        };
        let creator = self.creator.insecure_clone();
        self.send(&[ix], &[&creator])
    }

    pub fn close_campaign(&mut self, campaign: Pubkey) -> Result<(), String> {
        let ix = Instruction {
            program_id: kolab::id(),
            accounts: kolab::accounts::CloseCampaign {
                brand: self.brand.pubkey(),
                payer: self.payer.pubkey(),
                config: self.config,
                campaign,
                mint: self.mint,
                vault: get_associated_token_address(&campaign, &self.mint),
                brand_token: self.ata(&self.brand.pubkey()),
                token_program: anchor_spl::token::ID,
                associated_token_program: anchor_spl::associated_token::ID,
                system_program: anchor_lang::system_program::ID,
            }
            .to_account_metas(None),
            data: kolab::instruction::CloseCampaign {}.data(),
        };
        let brand = self.brand.insecure_clone();
        self.send(&[ix], &[&brand])
    }

    // ------------------------------------------------------------------ scenario shortcuts

    /// Funded monthly campaign with the given slots and one enrolled creator.
    pub fn setup_monthly(&mut self, slots: Vec<SlotTemplate>, fund_usdc: u64) -> (Pubkey, Pubkey) {
        let campaign = self.create_campaign(monthly(slots)).unwrap();
        self.fund(campaign, fund_usdc * USDC).unwrap();
        let creator = self.creator.insecure_clone();
        let enrollment = self.enroll(campaign, &creator, [0; 32]).unwrap();
        (campaign, enrollment)
    }

    pub fn vault_balance(&self, campaign: &Pubkey) -> u64 {
        self.balance(campaign)
    }
}
