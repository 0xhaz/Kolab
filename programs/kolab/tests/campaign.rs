//! Campaign lifecycle, enrollment commitments, shipping, per-sale and closing.

mod common;
use common::*;
use kolab::{error::KolabError, state::*};
use solana_keypair::Keypair;
use solana_signer::Signer;

#[test]
fn rejects_mint_not_on_allowlist() {
    let mut w = World::new();
    let other = litesvm_token::CreateMint::new(&mut w.svm, &w.admin).decimals(6).send().unwrap();
    w.mint = other;
    assert_kolab_err(w.create_campaign(monthly(vec![post(100, 7)])).map(|_| ()), KolabError::MintNotAllowed);
}

#[test]
fn rejects_bad_campaign_params() {
    let mut w = World::new();
    let mut args = monthly(vec![post(100, 7)]);
    args.holdback_bps = 10_001;
    assert_kolab_err(w.create_campaign(args).map(|_| ()), KolabError::InvalidCampaignParams);
    let args = monthly(vec![post(1, 1); 9]);
    assert_kolab_err(w.create_campaign(args).map(|_| ()), KolabError::TooManySlots);
}

#[test]
fn enroll_requires_funding_for_the_full_schedule() {
    let mut w = World::new();
    let c = w.create_campaign(monthly(vec![post(100, 7), post(100, 14)])).unwrap();
    let creator = w.creator.insecure_clone();
    assert_kolab_err(w.enroll(c, &creator, [0; 32]).map(|_| ()), KolabError::CampaignNotActive);

    // 2 × 100 plus the 5% fee on top = 210 must be available
    w.fund(c, 200 * USDC).unwrap();
    assert_kolab_err(w.enroll(c, &creator, [0; 32]).map(|_| ()), KolabError::InsufficientFunds);
    w.fund(c, 10 * USDC).unwrap();
    let e = w.enroll(c, &creator, [0; 32]).unwrap();
    assert_eq!(w.account::<Enrollment>(&e).outstanding, 210 * USDC);

    // a second creator can't be promised money that's already committed
    let second = Keypair::new();
    assert_kolab_err(w.enroll(c, &second, [0; 32]).map(|_| ()), KolabError::InsufficientFunds);
}

#[test]
fn shipping_due_dates_start_when_product_is_received() {
    let mut w = World::new();
    let mut args = monthly(vec![post(100, 7)]);
    args.requires_shipping = true;
    args.shipping_window_secs = SHIP_WINDOW;
    let c = w.create_campaign(args).unwrap();
    w.fund(c, 1_000 * USDC).unwrap();
    let creator = w.creator.insecure_clone();
    let e = w.enroll(c, &creator, [0; 32]).unwrap();
    let s = slot_pda(&e, 0, 0);

    assert_eq!(w.account::<Enrollment>(&e).status, EnrollmentStatus::AwaitingShipment);
    assert_kolab_err(w.submit(c, e, s), KolabError::InvalidEnrollmentState);

    w.mark_shipped(c, e).unwrap();
    w.advance(10 * DAY); // slow customs
    w.confirm_received(c, e, &creator).unwrap();

    // 7d + grace counts from received, not from enrollment
    w.advance(7 * DAY);
    w.submit(c, e, s).unwrap();
}

#[test]
fn anyone_confirms_receipt_only_after_shipping_window() {
    let mut w = World::new();
    let mut args = monthly(vec![post(100, 7)]);
    args.requires_shipping = true;
    args.shipping_window_secs = SHIP_WINDOW;
    let c = w.create_campaign(args).unwrap();
    w.fund(c, 1_000 * USDC).unwrap();
    let creator = w.creator.insecure_clone();
    let e = w.enroll(c, &creator, [0; 32]).unwrap();
    w.mark_shipped(c, e).unwrap();

    let crank = w.payer.insecure_clone();
    w.advance(SHIP_WINDOW - 1);
    assert_kolab_err(w.confirm_received(c, e, &crank), KolabError::ShippingWindowOpen);
    w.advance(1);
    w.confirm_received(c, e, &crank).unwrap();
    assert_eq!(w.account::<Enrollment>(&e).status, EnrollmentStatus::Active);
}

#[test]
fn not_received_refunds_every_slot_to_brand() {
    let mut w = World::new();
    let mut args = monthly(vec![post(100, 7), post(150, 14)]);
    args.requires_shipping = true;
    args.shipping_window_secs = SHIP_WINDOW;
    let c = w.create_campaign(args).unwrap();
    w.fund(c, 1_000 * USDC).unwrap();
    let creator = w.creator.insecure_clone();
    let e = w.enroll(c, &creator, [0; 32]).unwrap();
    let brand_before = w.balance(&w.brand.pubkey());

    w.mark_shipped(c, e).unwrap();
    w.advance(5 * DAY);
    w.report_not_received(c, e).unwrap();
    w.cancel_enrollment(c, e).unwrap();

    assert_eq!(w.balance(&w.brand.pubkey()), brand_before + 262_500_000); // 250 + fee reservation
    assert_eq!(w.account::<Enrollment>(&e).status, EnrollmentStatus::Cancelled);
    assert_eq!(w.account::<Campaign>(&c).total_committed, 0);
    // a cancelled enrollment can't be delivered against
    assert_kolab_err(w.submit(c, e, slot_pda(&e, 0, 0)), KolabError::InvalidEnrollmentState);
}

#[test]
fn brand_cannot_cancel_after_product_arrived() {
    let mut w = World::new();
    let (c, e) = w.setup_monthly(vec![post(100, 7)], 1_000);
    assert_kolab_err(w.cancel_enrollment(c, e), KolabError::InvalidEnrollmentState);
}

fn per_sale(w: &mut World) -> (anchor_lang::prelude::Pubkey, anchor_lang::prelude::Pubkey) {
    let mut args = monthly(vec![]);
    args.campaign_id = 2;
    args.campaign_type = CampaignType::PerSale;
    args.per_sale_amount = 10 * USDC;
    let c = w.create_campaign(args).unwrap();
    w.fund(c, 25 * USDC).unwrap();
    let creator = w.creator.insecure_clone();
    let e = w.enroll(c, &creator, [5; 32]).unwrap();
    (c, e)
}

#[test]
fn per_sale_is_idempotent_and_claims_with_fee() {
    let mut w = World::new();
    let (c, e) = per_sale(&mut w);
    let v = w.verifier.insecure_clone();

    w.record_sale(c, e, [1; 32], &v).unwrap();
    w.record_sale(c, e, [2; 32], &v).unwrap();
    // same order ref replayed: second receipt can't be created
    assert!(w.record_sale(c, e, [1; 32], &v).is_err());
    assert_eq!(w.account::<Enrollment>(&e).sales_accrued, 20 * USDC);

    // vault has 25, 21 reserved (2 × (10 + 0.5 fee)): a third sale exceeds what's available
    assert_kolab_err(w.record_sale(c, e, [3; 32], &v), KolabError::InsufficientFunds);

    w.claim_sales(c, e).unwrap();
    assert_eq!(w.balance(&w.creator.pubkey()), 20 * USDC);
    assert_eq!(w.balance(&w.treasury.pubkey()), 1 * USDC);
    assert_kolab_err(w.claim_sales(c, e), KolabError::NothingToClaim);
}

#[test]
fn only_verifier_records_sales() {
    let mut w = World::new();
    let (c, e) = per_sale(&mut w);
    let creator = w.creator.insecure_clone();
    assert_kolab_err(w.record_sale(c, e, [1; 32], &creator), KolabError::NotVerifier);
}

#[test]
fn close_returns_only_uncommitted_funds() {
    let mut w = World::new();
    let (c, e) = w.setup_monthly(vec![post(100, 7)], 1_000);
    assert_kolab_err(w.close_campaign(c), KolabError::CampaignNotEnded);

    let brand_before = w.balance(&w.brand.pubkey());
    w.submit(c, e, slot_pda(&e, 0, 0)).unwrap();
    w.set_time(START + 60 * DAY);
    w.close_campaign(c).unwrap();

    // 895 back; the submitted slot's 100 + 5 fee stays so the creator can still be paid
    assert_eq!(w.balance(&w.brand.pubkey()), brand_before + 895 * USDC);
    assert_eq!(w.vault_balance(&c), 105 * USDC);
    w.auto_release(c, e, slot_pda(&e, 0, 0)).unwrap();
    assert_eq!(w.balance(&w.creator.pubkey()), 70 * USDC);
}

#[test]
fn release_build_cannot_shift_the_clock() {
    let mut w = World::new();
    let ix = anchor_lang::solana_program::instruction::Instruction {
        program_id: kolab::id(),
        accounts: anchor_lang::ToAccountMetas::to_account_metas(
            &kolab::accounts::AdminConfig { admin: w.admin.pubkey(), config: w.config },
            None,
        ),
        data: anchor_lang::InstructionData::data(&kolab::instruction::SetDemoOffset { offset_secs: 3 * DAY }),
    };
    assert_kolab_err(w.send(&[ix], &[]), KolabError::DemoClockDisabled);
}

#[test]
fn selective_campaign_only_admits_approved_creators() {
    let mut w = World::new();
    let c = w.create_campaign(monthly(vec![post(100, 7)])).unwrap();
    w.fund(c, 1_000 * USDC).unwrap();
    let picked = w.creator.insecure_clone();
    let stranger = Keypair::new();

    // no approval at all: the creator's own approval PDA doesn't exist
    let none = approval_pda(&c, &stranger.pubkey());
    assert!(w.enroll_with(c, &stranger, none, [0; 32]).is_err());

    // the brand approves one creator; a stranger can't reuse that approval
    let approval = w.approve_creator(c, picked.pubkey()).unwrap();
    assert_kolab_err(w.enroll_with(c, &stranger, approval, [0; 32]).map(|_| ()), KolabError::NotApproved);
    let a: Approval = w.account(&approval);
    assert_eq!((a.campaign, a.creator), (c, picked.pubkey()));

    w.enroll_with(c, &picked, approval, [0; 32]).unwrap();
    assert_eq!(w.account::<Campaign>(&c).enrolled_count, 1);
}

#[test]
fn only_the_brand_can_approve_and_revoke() {
    let mut w = World::new();
    let c = w.create_campaign(monthly(vec![post(100, 7)])).unwrap();
    w.fund(c, 1_000 * USDC).unwrap();
    let creator = w.creator.insecure_clone();

    // a creator can't approve themselves
    assert_kolab_err(w.approve_creator_as(c, creator.pubkey(), &creator), KolabError::NotBrand);

    // revoked approvals can't be used
    let approval = w.approve_creator(c, creator.pubkey()).unwrap();
    w.revoke_approval(c, creator.pubkey()).unwrap();
    assert!(w.svm.get_account(&approval).map_or(true, |a| a.lamports == 0));
    assert!(w.enroll_with(c, &creator, approval, [0; 32]).is_err());
}

#[test]
fn open_invite_lets_anyone_join() {
    let mut w = World::new();
    let c = w.create_campaign(monthly(vec![post(100, 7)])).unwrap();
    w.fund(c, 1_000 * USDC).unwrap();
    let open = w.approve_creator(c, anchor_lang::prelude::Pubkey::default()).unwrap();
    for _ in 0..2 {
        let anyone = Keypair::new();
        w.enroll_with(c, &anyone, open, [0; 32]).unwrap();
    }
    assert_eq!(w.account::<Campaign>(&c).enrolled_count, 2);
}

#[test]
fn anyone_can_top_up_a_campaign_escrow() {
    let mut w = World::new();
    let c = w.create_campaign(monthly(vec![post(100, 7)])).unwrap();
    // e.g. the cross-chain intermediary, holding USDC that just bridged in
    let funder = Keypair::new();
    let funder_ata = w.create_ata(&funder.pubkey());
    litesvm_token::MintTo::new(&mut w.svm, &w.admin, &w.mint, &funder_ata, 500 * USDC).send().unwrap();

    w.top_up(c, &funder, 210 * USDC).unwrap();
    let camp: Campaign = w.account(&c);
    assert_eq!((camp.total_funded, camp.status), (210 * USDC, CampaignStatus::Active));
    assert_eq!(w.balance(&funder.pubkey()), 290 * USDC);

    // the funded escrow behaves like any other: a creator can be committed against it
    let creator = w.creator.insecure_clone();
    w.enroll(c, &creator, [0; 32]).unwrap();
    assert_kolab_err(w.top_up(c, &funder, 0), KolabError::InvalidCampaignParams);
}
