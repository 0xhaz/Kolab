use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount, TransferChecked},
};

use crate::{
    clock::now,
    constants::*,
    error::KolabError,
    events::*,
    state::*,
    vault::transfer_from_vault,
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CreateCampaignArgs {
    pub campaign_id: u64,
    pub campaign_type: CampaignType,
    pub start_ts: i64,
    pub end_ts: i64,
    pub review_window_secs: i64,
    pub grace_secs: i64,
    pub holdback_bps: u16,
    pub requires_shipping: bool,
    pub shipping_window_secs: i64,
    pub per_sale_amount: u64,
    pub max_creators: u16,
    pub slots: Vec<SlotTemplate>,
}

#[derive(Accounts)]
#[instruction(args: CreateCampaignArgs)]
pub struct CreateCampaign<'info> {
    pub brand: Signer<'info>,
    /// Sponsor: pays rent so brands never need SOL.
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        init,
        payer = payer,
        space = 8 + Campaign::INIT_SPACE,
        seeds = [CAMPAIGN_SEED, brand.key().as_ref(), &args.campaign_id.to_le_bytes()],
        bump
    )]
    pub campaign: Account<'info, Campaign>,
    #[account(constraint = config.is_mint_allowed(&mint.key()) @ KolabError::MintNotAllowed)]
    pub mint: Account<'info, Mint>,
    #[account(
        init,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = campaign,
        associated_token::token_program = token_program,
    )]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_create_campaign(ctx: Context<CreateCampaign>, args: CreateCampaignArgs) -> Result<()> {
    require!(args.slots.len() <= MAX_SLOTS, KolabError::TooManySlots);
    require!(args.end_ts > args.start_ts, KolabError::InvalidCampaignParams);
    require!(args.review_window_secs > 0 && args.grace_secs >= 0, KolabError::InvalidCampaignParams);
    require!(args.holdback_bps as u64 <= BPS, KolabError::InvalidCampaignParams);
    require!(args.max_creators > 0, KolabError::InvalidCampaignParams);
    require!(
        !args.requires_shipping || args.shipping_window_secs > 0,
        KolabError::InvalidCampaignParams
    );
    match args.campaign_type {
        CampaignType::PerSale => require!(args.per_sale_amount > 0, KolabError::InvalidCampaignParams),
        _ => require!(!args.slots.is_empty(), KolabError::InvalidCampaignParams),
    }
    for s in &args.slots {
        require!(s.amount > 0 && s.due_offset > 0, KolabError::InvalidCampaignParams);
    }

    let mut slots = [SlotTemplate::default(); MAX_SLOTS];
    slots[..args.slots.len()].copy_from_slice(&args.slots);

    let campaign = &mut ctx.accounts.campaign;
    campaign.set_inner(Campaign {
        brand: ctx.accounts.brand.key(),
        campaign_id: args.campaign_id,
        campaign_type: args.campaign_type,
        mint: ctx.accounts.mint.key(),
        vault: ctx.accounts.vault.key(),
        status: CampaignStatus::Draft,
        period_index: 0,
        start_ts: args.start_ts,
        end_ts: args.end_ts,
        review_window_secs: args.review_window_secs,
        grace_secs: args.grace_secs,
        holdback_bps: args.holdback_bps,
        fee_bps: ctx.accounts.config.fee_bps,
        requires_shipping: args.requires_shipping,
        shipping_window_secs: args.shipping_window_secs,
        per_sale_amount: args.per_sale_amount,
        max_creators: args.max_creators,
        enrolled_count: 0,
        slot_count: args.slots.len() as u8,
        slots,
        total_funded: 0,
        total_committed: 0,
        total_released: 0,
        total_refunded: 0,
        total_fees: 0,
        bump: ctx.bumps.campaign,
    });
    emit!(CampaignCreated { campaign: campaign.key(), brand: campaign.brand });
    Ok(())
}

#[derive(Accounts)]
pub struct FundCampaign<'info> {
    pub brand: Signer<'info>,
    #[account(
        mut,
        has_one = brand @ KolabError::NotBrand,
        has_one = mint,
        has_one = vault,
    )]
    pub campaign: Account<'info, Campaign>,
    pub mint: Account<'info, Mint>,
    #[account(mut)]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut, token::mint = mint, token::authority = brand)]
    pub brand_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

/// Anyone can add money to a campaign's escrow: used by cross-chain funding (Aurora Intents
/// Connect's intermediary signs this after bridging in). Topping up can't harm the brand: funds
/// only ever leave the vault through the slot rules or back to the brand on close.
#[derive(Accounts)]
pub struct TopUpCampaign<'info> {
    pub funder: Signer<'info>,
    #[account(mut, has_one = mint, has_one = vault)]
    pub campaign: Account<'info, Campaign>,
    pub mint: Account<'info, Mint>,
    #[account(mut)]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut, token::mint = mint, token::authority = funder)]
    pub funder_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

pub fn handle_top_up_campaign(ctx: Context<TopUpCampaign>, amount: u64) -> Result<()> {
    require!(amount > 0, KolabError::InvalidCampaignParams);
    require!(ctx.accounts.campaign.status != CampaignStatus::Closed, KolabError::CampaignNotActive);
    token::transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            TransferChecked {
                from: ctx.accounts.funder_token.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.funder.to_account_info(),
            },
        ),
        amount,
        ctx.accounts.mint.decimals,
    )?;
    let campaign = &mut ctx.accounts.campaign;
    campaign.total_funded = campaign.total_funded.checked_add(amount).ok_or(KolabError::MathOverflow)?;
    campaign.status = CampaignStatus::Active;
    emit!(CampaignFunded { campaign: campaign.key(), amount, total_funded: campaign.total_funded });
    Ok(())
}

pub fn handle_fund_campaign(ctx: Context<FundCampaign>, amount: u64) -> Result<()> {
    require!(amount > 0, KolabError::InvalidCampaignParams);
    require!(
        ctx.accounts.campaign.status != CampaignStatus::Closed,
        KolabError::CampaignNotActive
    );
    token::transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            TransferChecked {
                from: ctx.accounts.brand_token.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.brand.to_account_info(),
            },
        ),
        amount,
        ctx.accounts.mint.decimals,
    )?;
    let campaign = &mut ctx.accounts.campaign;
    campaign.total_funded = campaign.total_funded.checked_add(amount).ok_or(KolabError::MathOverflow)?;
    campaign.status = CampaignStatus::Active;
    emit!(CampaignFunded { campaign: campaign.key(), amount, total_funded: campaign.total_funded });
    Ok(())
}

#[derive(Accounts)]
pub struct CloseCampaign<'info> {
    pub brand: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, has_one = brand @ KolabError::NotBrand, has_one = mint, has_one = vault)]
    pub campaign: Account<'info, Campaign>,
    pub mint: Account<'info, Mint>,
    #[account(mut)]
    pub vault: Account<'info, TokenAccount>,
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

/// After the end date: returns every token not owed to a creator. Outstanding slots and
/// accrued sales stay in the vault so creators can still be paid.
pub fn handle_close_campaign(ctx: Context<CloseCampaign>) -> Result<()> {
    let t = now(&ctx.accounts.config)?;
    require!(t >= ctx.accounts.campaign.end_ts, KolabError::CampaignNotEnded);
    let refund = ctx.accounts.campaign.available().ok_or(KolabError::MathOverflow)?;
    transfer_from_vault(
        &ctx.accounts.token_program,
        &ctx.accounts.campaign,
        &ctx.accounts.vault,
        &ctx.accounts.mint,
        ctx.accounts.brand_token.to_account_info(),
        refund,
    )?;
    let campaign = &mut ctx.accounts.campaign;
    campaign.total_refunded = campaign.total_refunded.checked_add(refund).ok_or(KolabError::MathOverflow)?;
    campaign.status = CampaignStatus::Closed;
    emit!(CampaignClosed { campaign: campaign.key(), refunded: refund });
    Ok(())
}
