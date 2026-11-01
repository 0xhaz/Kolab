use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};

use crate::{
    constants::{BPS, CAMPAIGN_SEED},
    error::KolabError,
    state::Campaign,
};

/// Platform fee on a release: `amount * fee_bps / 10_000`, rounded down.
pub fn fee_for(amount: u64, fee_bps: u16) -> Result<u64> {
    let fee = (amount as u128)
        .checked_mul(fee_bps as u128)
        .ok_or(KolabError::MathOverflow)?
        / BPS as u128;
    Ok(fee as u64)
}

/// Basis-point share of an amount, rounded down (used for holdback).
pub fn bps_of(amount: u64, bps: u16) -> Result<u64> {
    fee_for(amount, bps)
}

/// Moves tokens out of the campaign vault, signed by the campaign PDA.
pub fn transfer_from_vault<'info>(
    token_program: &Program<'info, Token>,
    campaign: &Account<'info, Campaign>,
    vault: &Account<'info, TokenAccount>,
    mint: &Account<'info, Mint>,
    to: AccountInfo<'info>,
    amount: u64,
) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    let id_bytes = campaign.campaign_id.to_le_bytes();
    let seeds: &[&[u8]] = &[CAMPAIGN_SEED, campaign.brand.as_ref(), &id_bytes, &[campaign.bump]];
    let signer = &[seeds];
    token::transfer_checked(
        CpiContext::new_with_signer(
            token_program.key(),
            TransferChecked {
                from: vault.to_account_info(),
                mint: mint.to_account_info(),
                to,
                authority: campaign.to_account_info(),
            },
            signer,
        ),
        amount,
        mint.decimals,
    )
}

/// An obligation plus the platform fee the brand pays on top of it (architecture §1.2:
/// creators receive their full rate; the brand pays 5% only on money actually released).
pub fn with_fee(amount: u64, fee_bps: u16) -> Result<u64> {
    amount.checked_add(fee_for(amount, fee_bps)?).ok_or(KolabError::MathOverflow.into())
}

/// Pays `creator_amount` in full to the creator and `fee` to the treasury, both out of funds the
/// brand committed. Updates the campaign totals.
#[allow(clippy::too_many_arguments)]
pub fn release_with_fee<'info>(
    token_program: &Program<'info, Token>,
    campaign: &mut Account<'info, Campaign>,
    vault: &Account<'info, TokenAccount>,
    mint: &Account<'info, Mint>,
    creator_token: AccountInfo<'info>,
    treasury_token: AccountInfo<'info>,
    creator_amount: u64,
    fee: u64,
) -> Result<()> {
    transfer_from_vault(token_program, campaign, vault, mint, creator_token, creator_amount)?;
    transfer_from_vault(token_program, campaign, vault, mint, treasury_token, fee)?;

    let gross = creator_amount.checked_add(fee).ok_or(KolabError::MathOverflow)?;
    campaign.total_committed =
        campaign.total_committed.checked_sub(gross).ok_or(KolabError::MathOverflow)?;
    campaign.total_released =
        campaign.total_released.checked_add(gross).ok_or(KolabError::MathOverflow)?;
    campaign.total_fees = campaign.total_fees.checked_add(fee).ok_or(KolabError::MathOverflow)?;
    Ok(())
}

/// Returns committed money (including its unused fee reservation) to the brand. No fee is charged.
pub fn refund_committed<'info>(
    token_program: &Program<'info, Token>,
    campaign: &mut Account<'info, Campaign>,
    vault: &Account<'info, TokenAccount>,
    mint: &Account<'info, Mint>,
    brand_token: AccountInfo<'info>,
    amount: u64,
) -> Result<()> {
    transfer_from_vault(token_program, campaign, vault, mint, brand_token, amount)?;
    campaign.total_committed =
        campaign.total_committed.checked_sub(amount).ok_or(KolabError::MathOverflow)?;
    campaign.total_refunded =
        campaign.total_refunded.checked_add(amount).ok_or(KolabError::MathOverflow)?;
    Ok(())
}
