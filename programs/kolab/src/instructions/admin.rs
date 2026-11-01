use anchor_lang::prelude::*;
use anchor_spl::token::Mint;

use crate::{constants::*, error::KolabError, state::Config};

#[derive(Accounts)]
pub struct InitConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(init, payer = admin, space = 8 + Config::INIT_SPACE, seeds = [CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,
    pub system_program: Program<'info, System>,
}

pub fn handle_init_config(
    ctx: Context<InitConfig>,
    treasury: Pubkey,
    verifier: Pubkey,
    fee_bps: u16,
) -> Result<()> {
    require!(fee_bps <= MAX_FEE_BPS, KolabError::FeeTooHigh);
    let config = &mut ctx.accounts.config;
    config.admin = ctx.accounts.admin.key();
    config.treasury = treasury;
    config.verifier = verifier;
    config.fee_bps = fee_bps;
    config.allowed_mints = [Pubkey::default(); MAX_MINTS];
    config.allowed_mint_count = 0;
    config.demo_offset = 0;
    config.bump = ctx.bumps.config;
    Ok(())
}

#[derive(Accounts)]
pub struct AdminConfig<'info> {
    pub admin: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ KolabError::NotAdmin)]
    pub config: Account<'info, Config>,
}

#[derive(Accounts)]
pub struct AllowMint<'info> {
    pub admin: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ KolabError::NotAdmin)]
    pub config: Account<'info, Config>,
    /// Classic SPL Token mints only (`Account<Mint>` checks the owner), so Token-2022
    /// transfer-fee / hook mints can never be allowlisted.
    pub mint: Account<'info, Mint>,
}

pub fn handle_allow_mint(ctx: Context<AllowMint>) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let mint = ctx.accounts.mint.key();
    if config.is_mint_allowed(&mint) {
        return Ok(());
    }
    let n = config.allowed_mint_count as usize;
    require!(n < MAX_MINTS, KolabError::AllowlistFull);
    config.allowed_mints[n] = mint;
    config.allowed_mint_count += 1;
    Ok(())
}

pub fn handle_set_verifier(ctx: Context<AdminConfig>, verifier: Pubkey) -> Result<()> {
    ctx.accounts.config.verifier = verifier;
    Ok(())
}

pub fn handle_set_demo_offset(ctx: Context<AdminConfig>, offset_secs: i64) -> Result<()> {
    #[cfg(feature = "demo-clock")]
    {
        ctx.accounts.config.demo_offset = offset_secs;
        Ok(())
    }
    #[cfg(not(feature = "demo-clock"))]
    {
        let _ = (ctx, offset_secs);
        err!(KolabError::DemoClockDisabled)
    }
}
