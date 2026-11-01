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
    vault::{fee_for, release_with_fee},
};

#[derive(Accounts)]
#[instruction(ref_hash: [u8; 32])]
pub struct RecordSale<'info> {
    pub verifier: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = verifier @ KolabError::NotVerifier)]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub campaign: Account<'info, Campaign>,
    #[account(mut, has_one = campaign)]
    pub enrollment: Account<'info, Enrollment>,
    /// One per order ref: a replayed webhook fails here instead of paying twice.
    #[account(
        init,
        payer = payer,
        space = 8 + SaleReceipt::INIT_SPACE,
        seeds = [SALE_SEED, enrollment.key().as_ref(), &ref_hash],
        bump
    )]
    pub sale_receipt: Account<'info, SaleReceipt>,
    pub system_program: Program<'info, System>,
}

pub fn handle_record_sale(ctx: Context<RecordSale>, _ref_hash: [u8; 32]) -> Result<()> {
    let t = now(&ctx.accounts.config)?;
    let campaign = &mut ctx.accounts.campaign;
    require!(campaign.campaign_type == CampaignType::PerSale, KolabError::NotPerSale);
    require!(campaign.status == CampaignStatus::Active, KolabError::CampaignNotActive);
    require!(
        ctx.accounts.enrollment.status == EnrollmentStatus::Active,
        KolabError::InvalidEnrollmentState
    );
    let amount = campaign.per_sale_amount;
    let fee = fee_for(amount, campaign.fee_bps)?;
    let reserve = amount.checked_add(fee).ok_or(KolabError::MathOverflow)?;
    require!(
        campaign.available().ok_or(KolabError::MathOverflow)? >= reserve,
        KolabError::InsufficientFunds
    );
    campaign.total_committed =
        campaign.total_committed.checked_add(reserve).ok_or(KolabError::MathOverflow)?;

    let e = &mut ctx.accounts.enrollment;
    e.sales_accrued = e.sales_accrued.checked_add(amount).ok_or(KolabError::MathOverflow)?;
    e.sales_fees_accrued = e.sales_fees_accrued.checked_add(fee).ok_or(KolabError::MathOverflow)?;
    ctx.accounts.sale_receipt.set_inner(SaleReceipt { enrollment: e.key(), amount, recorded_ts: t });
    emit!(events::SaleRecorded { enrollment: e.key(), amount, sales_accrued: e.sales_accrued });
    Ok(())
}

#[derive(Accounts)]
pub struct ClaimSales<'info> {
    pub creator: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, has_one = mint, has_one = vault)]
    pub campaign: Box<Account<'info, Campaign>>,
    pub mint: Box<Account<'info, Mint>>,
    #[account(mut)]
    pub vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, has_one = campaign, has_one = creator @ KolabError::NotCreator)]
    pub enrollment: Box<Account<'info, Enrollment>>,
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
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_claim_sales(ctx: Context<ClaimSales>) -> Result<()> {
    let amount = ctx.accounts.enrollment.sales_accrued;
    let fee = ctx.accounts.enrollment.sales_fees_accrued;
    require!(amount > 0, KolabError::NothingToClaim);
    release_with_fee(
        &ctx.accounts.token_program,
        &mut ctx.accounts.campaign,
        &ctx.accounts.vault,
        &ctx.accounts.mint,
        ctx.accounts.creator_token.to_account_info(),
        ctx.accounts.treasury_token.to_account_info(),
        amount,
        fee,
    )?;
    let e = &mut ctx.accounts.enrollment;
    e.sales_accrued = 0;
    e.sales_fees_accrued = 0;
    e.earned_total = e.earned_total.checked_add(amount).ok_or(KolabError::MathOverflow)?;
    emit!(events::SalesClaimed { enrollment: e.key(), creator_amount: amount, fee });
    Ok(())
}
