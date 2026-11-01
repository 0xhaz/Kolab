use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount},
};

use crate::{
    clock::now,
    constants::*,
    error::KolabError,
    events::*,
    state::*,
    vault::refund_committed,
};

#[derive(Accounts)]
pub struct EnrollCreator<'info> {
    pub creator: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub campaign: Account<'info, Campaign>,
    /// The brand's approval for this creator, or the campaign's open invite.
    #[account(
        seeds = [APPROVAL_SEED, campaign.key().as_ref(), approval.creator.as_ref()],
        bump = approval.bump,
        constraint = approval.campaign == campaign.key() @ KolabError::NotApproved,
        constraint = approval.creator == creator.key() || approval.creator == Pubkey::default() @ KolabError::NotApproved,
    )]
    pub approval: Account<'info, Approval>,
    #[account(
        init,
        payer = payer,
        space = 8 + Enrollment::INIT_SPACE,
        seeds = [ENROLLMENT_SEED, campaign.key().as_ref(), creator.key().as_ref()],
        bump
    )]
    pub enrollment: Account<'info, Enrollment>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(creator: Pubkey)]
pub struct ApproveCreator<'info> {
    pub brand: Signer<'info>,
    /// Sponsor: pays rent so brands never need SOL.
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(has_one = brand @ KolabError::NotBrand)]
    pub campaign: Account<'info, Campaign>,
    #[account(
        init,
        payer = payer,
        space = 8 + Approval::INIT_SPACE,
        seeds = [APPROVAL_SEED, campaign.key().as_ref(), creator.as_ref()],
        bump
    )]
    pub approval: Account<'info, Approval>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RevokeApproval<'info> {
    pub brand: Signer<'info>,
    /// Receives the approval account's rent back (the sponsor that paid it).
    /// CHECK: any account; only receives lamports.
    #[account(mut)]
    pub rent_receiver: UncheckedAccount<'info>,
    #[account(has_one = brand @ KolabError::NotBrand)]
    pub campaign: Account<'info, Campaign>,
    #[account(mut, close = rent_receiver, has_one = campaign)]
    pub approval: Account<'info, Approval>,
}

/// Brand picks a creator (or `Pubkey::default()` to let anyone join). Without an approval,
/// `enroll_creator` fails, so a stranger with the link can't lock the brand's budget.
pub fn handle_approve_creator(ctx: Context<ApproveCreator>, creator: Pubkey) -> Result<()> {
    let t = Clock::get()?.unix_timestamp;
    let campaign = &ctx.accounts.campaign;
    require!(campaign.status != CampaignStatus::Closed, KolabError::CampaignNotActive);
    ctx.accounts.approval.set_inner(Approval {
        campaign: campaign.key(),
        creator,
        approved_ts: t,
        bump: ctx.bumps.approval,
    });
    emit!(CreatorApproved { campaign: campaign.key(), creator });
    Ok(())
}

/// Withdraws an approval that hasn't been used yet. Existing enrollments are unaffected.
pub fn handle_revoke_approval(ctx: Context<RevokeApproval>) -> Result<()> {
    emit!(ApprovalRevoked { campaign: ctx.accounts.campaign.key(), creator: ctx.accounts.approval.creator });
    Ok(())
}

/// Locks this creator's full slot schedule out of the vault, so they know the money exists.
pub fn handle_enroll_creator(ctx: Context<EnrollCreator>, voucher_hash: [u8; 32]) -> Result<()> {
    let t = now(&ctx.accounts.config)?;
    let campaign = &mut ctx.accounts.campaign;
    require!(campaign.status == CampaignStatus::Active, KolabError::CampaignNotActive);
    require!(t < campaign.end_ts, KolabError::CampaignEnded);
    require!(campaign.enrolled_count < campaign.max_creators, KolabError::CampaignFull);

    let commitment = campaign.per_creator_commitment().ok_or(KolabError::MathOverflow)?;
    let available = campaign.available().ok_or(KolabError::MathOverflow)?;
    require!(available >= commitment, KolabError::InsufficientFunds);
    campaign.total_committed =
        campaign.total_committed.checked_add(commitment).ok_or(KolabError::MathOverflow)?;
    campaign.enrolled_count += 1;

    let shipped = campaign.requires_shipping;
    ctx.accounts.enrollment.set_inner(Enrollment {
        campaign: campaign.key(),
        creator: ctx.accounts.creator.key(),
        status: if shipped { EnrollmentStatus::AwaitingShipment } else { EnrollmentStatus::Active },
        enrolled_ts: t,
        tracking_hash: [0; 32],
        shipped_ts: 0,
        // Without shipping, slot due dates count from enrollment.
        received_ts: if shipped { 0 } else { t },
        voucher_hash,
        outstanding: commitment,
        sales_accrued: 0,
        sales_fees_accrued: 0,
        earned_total: 0,
        bump: ctx.bumps.enrollment,
    });
    emit!(CreatorEnrolled {
        campaign: campaign.key(),
        enrollment: ctx.accounts.enrollment.key(),
        creator: ctx.accounts.creator.key(),
        committed: commitment,
    });
    Ok(())
}

#[derive(Accounts)]
#[instruction(slot_idx: u8)]
pub struct InitSlot<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub campaign: Account<'info, Campaign>,
    #[account(has_one = campaign)]
    pub enrollment: Account<'info, Enrollment>,
    #[account(
        init,
        payer = payer,
        space = 8 + Slot::INIT_SPACE,
        seeds = [
            SLOT_SEED,
            enrollment.key().as_ref(),
            &campaign.period_index.to_le_bytes(),
            &[slot_idx],
        ],
        bump
    )]
    pub slot: Account<'info, Slot>,
    pub system_program: Program<'info, System>,
}

/// Creates one slot from the campaign template. Permissionless: contents are fully determined
/// by the template, so the tx builder appends these right after `enroll_creator`.
pub fn handle_init_slot(ctx: Context<InitSlot>, slot_idx: u8) -> Result<()> {
    let campaign = &ctx.accounts.campaign;
    require!(slot_idx < campaign.slot_count, KolabError::InvalidSlotIndex);
    require!(
        ctx.accounts.enrollment.status != EnrollmentStatus::Cancelled,
        KolabError::InvalidEnrollmentState
    );
    let template = campaign.slots[slot_idx as usize];
    ctx.accounts.slot.set_inner(Slot {
        enrollment: ctx.accounts.enrollment.key(),
        period_index: campaign.period_index,
        slot_idx,
        kind: template.kind,
        amount: template.amount,
        due_offset: template.due_offset,
        status: SlotStatus::Open,
        checks: CheckStatus::Pending,
        content_hash: [0; 32],
        submitted_ts: 0,
        decided_ts: 0,
        resubmits_left: 1,
        holdback: 0,
        holdback_fee: 0,
        bump: ctx.bumps.slot,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct MarkShipped<'info> {
    pub brand: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(has_one = brand @ KolabError::NotBrand)]
    pub campaign: Account<'info, Campaign>,
    #[account(mut, has_one = campaign)]
    pub enrollment: Account<'info, Enrollment>,
}

/// Records hash(courier + tracking ref); the address and tracking number stay off-chain.
pub fn handle_mark_shipped(ctx: Context<MarkShipped>, tracking_hash: [u8; 32]) -> Result<()> {
    let t = now(&ctx.accounts.config)?;
    require!(ctx.accounts.campaign.requires_shipping, KolabError::InvalidEnrollmentState);
    let e = &mut ctx.accounts.enrollment;
    require!(
        matches!(e.status, EnrollmentStatus::AwaitingShipment | EnrollmentStatus::NotReceived),
        KolabError::InvalidEnrollmentState
    );
    e.status = EnrollmentStatus::InTransit;
    e.tracking_hash = tracking_hash;
    e.shipped_ts = t;
    emit!(Shipped { enrollment: e.key() });
    Ok(())
}

#[derive(Accounts)]
pub struct ConfirmReceived<'info> {
    /// The creator any time, or anyone once the shipping window has passed.
    pub signer: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    pub campaign: Account<'info, Campaign>,
    #[account(mut, has_one = campaign)]
    pub enrollment: Account<'info, Enrollment>,
}

pub fn handle_confirm_received(ctx: Context<ConfirmReceived>) -> Result<()> {
    let t = now(&ctx.accounts.config)?;
    let window = ctx.accounts.campaign.shipping_window_secs;
    let e = &mut ctx.accounts.enrollment;
    require!(e.status == EnrollmentStatus::InTransit, KolabError::InvalidEnrollmentState);
    if ctx.accounts.signer.key() != e.creator {
        let deadline = e.shipped_ts.checked_add(window).ok_or(KolabError::MathOverflow)?;
        require!(t >= deadline, KolabError::ShippingWindowOpen);
    }
    e.status = EnrollmentStatus::Active;
    e.received_ts = t;
    emit!(Received { enrollment: e.key(), received_ts: t });
    Ok(())
}

#[derive(Accounts)]
pub struct ReportNotReceived<'info> {
    pub creator: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    pub campaign: Account<'info, Campaign>,
    #[account(mut, has_one = campaign, has_one = creator @ KolabError::NotCreator)]
    pub enrollment: Account<'info, Enrollment>,
}

pub fn handle_report_not_received(ctx: Context<ReportNotReceived>) -> Result<()> {
    let t = now(&ctx.accounts.config)?;
    let window = ctx.accounts.campaign.shipping_window_secs;
    let e = &mut ctx.accounts.enrollment;
    require!(e.status == EnrollmentStatus::InTransit, KolabError::InvalidEnrollmentState);
    let deadline = e.shipped_ts.checked_add(window).ok_or(KolabError::MathOverflow)?;
    require!(t < deadline, KolabError::ShippingWindowClosed);
    e.status = EnrollmentStatus::NotReceived;
    emit!(NotReceived { enrollment: e.key() });
    Ok(())
}

#[derive(Accounts)]
pub struct CancelEnrollment<'info> {
    pub brand: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, has_one = brand @ KolabError::NotBrand, has_one = mint, has_one = vault)]
    pub campaign: Account<'info, Campaign>,
    pub mint: Account<'info, Mint>,
    #[account(mut)]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut, has_one = campaign)]
    pub enrollment: Account<'info, Enrollment>,
    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = brand,
        associated_token::token_program = token_program,
    )]
    pub brand_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

/// Product never shipped or never arrived: every slot goes back to the brand. No creator
/// penalty; reputation only counts slot outcomes.
pub fn handle_cancel_enrollment(ctx: Context<CancelEnrollment>) -> Result<()> {
    require!(
        matches!(
            ctx.accounts.enrollment.status,
            EnrollmentStatus::AwaitingShipment | EnrollmentStatus::NotReceived
        ),
        KolabError::InvalidEnrollmentState
    );
    let refund = ctx.accounts.enrollment.outstanding;
    refund_committed(
        &ctx.accounts.token_program,
        &mut ctx.accounts.campaign,
        &ctx.accounts.vault,
        &ctx.accounts.mint,
        ctx.accounts.brand_token.to_account_info(),
        refund,
    )?;
    let e = &mut ctx.accounts.enrollment;
    e.outstanding = 0;
    e.status = EnrollmentStatus::Cancelled;
    emit!(EnrollmentCancelled { enrollment: e.key(), refunded: refund });
    Ok(())
}
