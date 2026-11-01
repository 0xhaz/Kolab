use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount},
};

use crate::{
    clock::now,
    constants::*,
    error::KolabError,
    events,
    state::*,
    vault::{bps_of, fee_for, refund_committed, release_with_fee, with_fee},
};

/// Last moment a slot can be delivered: received/enrolled time + due offset + grace.
fn deadline(campaign: &Campaign, enrollment: &Enrollment, slot: &Slot) -> Result<i64> {
    require!(enrollment.status == EnrollmentStatus::Active, KolabError::InvalidEnrollmentState);
    enrollment
        .received_ts
        .checked_add(slot.due_offset)
        .and_then(|d| d.checked_add(campaign.grace_secs))
        .ok_or(KolabError::MathOverflow.into())
}

fn review_ends(campaign: &Campaign, slot: &Slot) -> Result<i64> {
    slot.submitted_ts
        .checked_add(campaign.review_window_secs)
        .ok_or(KolabError::MathOverflow.into())
}

// ---------------------------------------------------------------- non-money slot actions

#[derive(Accounts)]
pub struct SubmitDeliverable<'info> {
    pub creator: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    pub campaign: Account<'info, Campaign>,
    #[account(has_one = campaign, has_one = creator @ KolabError::NotCreator)]
    pub enrollment: Account<'info, Enrollment>,
    #[account(mut, has_one = enrollment)]
    pub slot: Account<'info, Slot>,
}

pub fn handle_submit_deliverable(ctx: Context<SubmitDeliverable>, content_hash: [u8; 32]) -> Result<()> {
    let t = now(&ctx.accounts.config)?;
    let last = deadline(&ctx.accounts.campaign, &ctx.accounts.enrollment, &ctx.accounts.slot)?;
    require!(t <= last, KolabError::SlotPastDeadline);

    let slot = &mut ctx.accounts.slot;
    match slot.status {
        SlotStatus::Open => {}
        SlotStatus::Rejected => {
            require!(slot.resubmits_left > 0, KolabError::NoResubmitsLeft);
            slot.resubmits_left -= 1;
        }
        _ => return err!(KolabError::InvalidSlotState),
    }
    slot.status = SlotStatus::Submitted;
    slot.checks = CheckStatus::Pending;
    slot.content_hash = content_hash;
    slot.submitted_ts = t;
    emit!(events::Submitted { slot: slot.key(), content_hash });
    Ok(())
}

#[derive(Accounts)]
pub struct AttestChecks<'info> {
    pub verifier: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = verifier @ KolabError::NotVerifier)]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub slot: Account<'info, Slot>,
}

pub fn handle_attest_checks(ctx: Context<AttestChecks>, passed: bool) -> Result<()> {
    let slot = &mut ctx.accounts.slot;
    require!(slot.status == SlotStatus::Submitted, KolabError::InvalidSlotState);
    slot.checks = if passed { CheckStatus::Passed } else { CheckStatus::Failed };
    emit!(events::ChecksAttested { slot: slot.key(), passed });
    Ok(())
}

#[derive(Accounts)]
pub struct RejectSlot<'info> {
    pub brand: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(has_one = brand @ KolabError::NotBrand)]
    pub campaign: Account<'info, Campaign>,
    #[account(has_one = campaign)]
    pub enrollment: Account<'info, Enrollment>,
    #[account(mut, has_one = enrollment)]
    pub slot: Account<'info, Slot>,
}

/// Only inside the review window: once it lapses the creator is owed an auto-release.
pub fn handle_reject(ctx: Context<RejectSlot>, reason_code: u8) -> Result<()> {
    let t = now(&ctx.accounts.config)?;
    let slot = &mut ctx.accounts.slot;
    require!(slot.status == SlotStatus::Submitted, KolabError::InvalidSlotState);
    require!(t < review_ends(&ctx.accounts.campaign, slot)?, KolabError::InvalidSlotState);
    slot.status = SlotStatus::Rejected;
    slot.decided_ts = t;
    emit!(events::Rejected { slot: slot.key(), reason_code });
    Ok(())
}

// ---------------------------------------------------------------- money-moving slot actions

/// Accounts for every instruction that pays out or refunds a slot.
#[derive(Accounts)]
pub struct Settle<'info> {
    /// Pays rent for any token account that doesn't exist yet (sponsor or crank).
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, has_one = mint, has_one = vault)]
    pub campaign: Box<Account<'info, Campaign>>,
    pub mint: Box<Account<'info, Mint>>,
    #[account(mut)]
    pub vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, has_one = campaign)]
    pub enrollment: Box<Account<'info, Enrollment>>,
    #[account(mut, has_one = enrollment)]
    pub slot: Box<Account<'info, Slot>>,
    /// CHECK: must be the enrolled creator; only used as the token account owner.
    #[account(address = enrollment.creator)]
    pub creator: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = creator,
        associated_token::token_program = token_program,
    )]
    pub creator_token: Box<Account<'info, TokenAccount>>,
    /// CHECK: must be the configured treasury; only used as the token account owner.
    #[account(address = config.treasury)]
    pub treasury: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = treasury,
        associated_token::token_program = token_program,
    )]
    pub treasury_token: Box<Account<'info, TokenAccount>>,
    /// CHECK: must be the campaign brand; only used as the token account owner for refunds.
    #[account(address = campaign.brand)]
    pub brand: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = brand,
        associated_token::token_program = token_program,
    )]
    pub brand_token: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

impl<'info> Settle<'info> {
    /// Pays the slot in full minus its holdback (posts only; UGC files are final). The fee is
    /// computed once on the whole slot and split, so the parts always add up exactly.
    fn release(&mut self, t: i64, auto: bool) -> Result<()> {
        let amount = self.slot.amount;
        let holdback = match self.slot.kind {
            SlotKind::Post => bps_of(amount, self.campaign.holdback_bps)?,
            SlotKind::Ugc => 0,
        };
        let pay = amount.checked_sub(holdback).ok_or(KolabError::MathOverflow)?;
        let slot_fee = fee_for(amount, self.campaign.fee_bps)?;
        let pay_fee = if holdback == 0 { slot_fee } else { fee_for(pay, self.campaign.fee_bps)? };
        let holdback_fee = slot_fee.checked_sub(pay_fee).ok_or(KolabError::MathOverflow)?;

        release_with_fee(
            &self.token_program,
            &mut self.campaign,
            &self.vault,
            &self.mint,
            self.creator_token.to_account_info(),
            self.treasury_token.to_account_info(),
            pay,
            pay_fee,
        )?;
        let e = &mut self.enrollment;
        e.outstanding = e
            .outstanding
            .checked_sub(pay.checked_add(pay_fee).ok_or(KolabError::MathOverflow)?)
            .ok_or(KolabError::MathOverflow)?;
        e.earned_total = e.earned_total.checked_add(pay).ok_or(KolabError::MathOverflow)?;
        let slot = &mut self.slot;
        slot.status = SlotStatus::Released;
        slot.holdback = holdback;
        slot.holdback_fee = holdback_fee;
        slot.decided_ts = t;
        emit!(events::Released { slot: slot.key(), creator_amount: pay, fee: pay_fee, holdback, auto });
        Ok(())
    }

    fn refund_to_brand(&mut self, amount: u64) -> Result<()> {
        refund_committed(
            &self.token_program,
            &mut self.campaign,
            &self.vault,
            &self.mint,
            self.brand_token.to_account_info(),
            amount,
        )?;
        let e = &mut self.enrollment;
        e.outstanding = e.outstanding.checked_sub(amount).ok_or(KolabError::MathOverflow)?;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Approve<'info> {
    #[account(address = settle.campaign.brand @ KolabError::NotBrand)]
    pub brand_signer: Signer<'info>,
    pub settle: Settle<'info>,
}

pub fn handle_approve(ctx: Context<Approve>) -> Result<()> {
    let s = &mut ctx.accounts.settle;
    require!(s.slot.status == SlotStatus::Submitted, KolabError::InvalidSlotState);
    let t = now(&s.config)?;
    s.release(t, false)
}

#[derive(Accounts)]
pub struct Crank<'info> {
    pub settle: Settle<'info>,
}

/// Permissionless: brand silent past the review window → pay the creator. Blocked only if the
/// verifier explicitly failed the automated checks (then the brand must decide).
pub fn handle_auto_release(ctx: Context<Crank>) -> Result<()> {
    let s = &mut ctx.accounts.settle;
    require!(s.slot.status == SlotStatus::Submitted, KolabError::InvalidSlotState);
    require!(s.slot.checks != CheckStatus::Failed, KolabError::ChecksFailed);
    let t = now(&s.config)?;
    require!(t >= review_ends(&s.campaign, &s.slot)?, KolabError::ReviewWindowOpen);
    s.release(t, true)
}

/// Permissionless: nothing (accepted) delivered by due + grace → slot money back to the brand.
pub fn handle_mark_missed(ctx: Context<Crank>) -> Result<()> {
    let s = &mut ctx.accounts.settle;
    require!(
        matches!(s.slot.status, SlotStatus::Open | SlotStatus::Rejected),
        KolabError::InvalidSlotState
    );
    let t = now(&s.config)?;
    require!(t > deadline(&s.campaign, &s.enrollment, &s.slot)?, KolabError::SlotNotDue);
    let refund = with_fee(s.slot.amount, s.campaign.fee_bps)?;
    s.refund_to_brand(refund)?;
    s.slot.status = SlotStatus::Missed;
    s.slot.decided_ts = t;
    emit!(events::Missed { slot: s.slot.key(), refunded: refund });
    Ok(())
}

#[derive(Accounts)]
pub struct AttestLive<'info> {
    #[account(address = settle.config.verifier @ KolabError::NotVerifier)]
    pub verifier: Signer<'info>,
    pub settle: Settle<'info>,
}

/// Still-live check result: holdback to the creator (with fee) or back to the brand (no fee).
pub fn handle_attest_live(ctx: Context<AttestLive>, still_live: bool) -> Result<()> {
    let s = &mut ctx.accounts.settle;
    require!(s.slot.status == SlotStatus::Released, KolabError::InvalidSlotState);
    let holdback = s.slot.holdback;
    let holdback_fee = s.slot.holdback_fee;
    require!(holdback > 0, KolabError::NoHoldback);

    if still_live {
        release_with_fee(
            &s.token_program,
            &mut s.campaign,
            &s.vault,
            &s.mint,
            s.creator_token.to_account_info(),
            s.treasury_token.to_account_info(),
            holdback,
            holdback_fee,
        )?;
        let e = &mut s.enrollment;
        e.outstanding = e
            .outstanding
            .checked_sub(holdback.checked_add(holdback_fee).ok_or(KolabError::MathOverflow)?)
            .ok_or(KolabError::MathOverflow)?;
        e.earned_total = e.earned_total.checked_add(holdback).ok_or(KolabError::MathOverflow)?;
        s.slot.status = SlotStatus::HoldbackReleased;
    } else {
        s.refund_to_brand(holdback.checked_add(holdback_fee).ok_or(KolabError::MathOverflow)?)?;
        s.slot.status = SlotStatus::HoldbackForfeited;
    }
    emit!(events::HoldbackSettled { slot: s.slot.key(), still_live, amount: holdback });
    Ok(())
}
