use anchor_lang::prelude::*;

use crate::constants::{MAX_MINTS, MAX_SLOTS};

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    /// Fee recipient; fees go to this wallet's token account for the campaign mint.
    pub treasury: Pubkey,
    /// Backend attestor for facts the chain can't see (post live, checks, sales).
    pub verifier: Pubkey,
    pub fee_bps: u16,
    pub allowed_mints: [Pubkey; MAX_MINTS],
    pub allowed_mint_count: u8,
    /// Seconds added to the cluster clock. Only settable in `demo-clock` builds.
    pub demo_offset: i64,
    pub bump: u8,
}

impl Config {
    pub fn is_mint_allowed(&self, mint: &Pubkey) -> bool {
        self.allowed_mints[..self.allowed_mint_count as usize].contains(mint)
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum CampaignType {
    PerPost,
    Monthly,
    PerSale,
    Ugc,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum CampaignStatus {
    Draft,
    Active,
    Closed,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum SlotKind {
    Post,
    Ugc,
}

/// One deliverable in the per-creator schedule. `due_offset` counts from the enrollment's
/// start (enrollment for unshipped campaigns, product received for shipped ones).
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub struct SlotTemplate {
    pub kind: SlotKind,
    pub amount: u64,
    pub due_offset: i64,
}

impl Default for SlotTemplate {
    fn default() -> Self {
        Self { kind: SlotKind::Post, amount: 0, due_offset: 0 }
    }
}

#[account]
#[derive(InitSpace)]
pub struct Campaign {
    pub brand: Pubkey,
    pub campaign_id: u64,
    pub campaign_type: CampaignType,
    pub mint: Pubkey,
    pub vault: Pubkey,
    pub status: CampaignStatus,
    pub period_index: u16,
    pub start_ts: i64,
    pub end_ts: i64,
    pub review_window_secs: i64,
    pub grace_secs: i64,
    pub holdback_bps: u16,
    /// Copied from Config at creation so later fee changes don't alter agreed terms.
    pub fee_bps: u16,
    pub requires_shipping: bool,
    pub shipping_window_secs: i64,
    pub per_sale_amount: u64,
    pub max_creators: u16,
    pub enrolled_count: u16,
    pub slot_count: u8,
    pub slots: [SlotTemplate; MAX_SLOTS],
    pub total_funded: u64,
    /// Promised but not yet paid or refunded: slot amounts + accrued sales, each with its fee.
    pub total_committed: u64,
    /// Paid out of the vault for delivered work (creator amounts + fees).
    pub total_released: u64,
    pub total_refunded: u64,
    pub total_fees: u64,
    pub bump: u8,
}

impl Campaign {
    /// Everything one creator's schedule can cost the brand: each slot amount plus its fee.
    pub fn per_creator_commitment(&self) -> Option<u64> {
        self.slots[..self.slot_count as usize].iter().try_fold(0u64, |acc, s| {
            let fee = (s.amount as u128 * self.fee_bps as u128 / crate::constants::BPS as u128) as u64;
            acc.checked_add(s.amount)?.checked_add(fee)
        })
    }

    /// Tokens in the vault: funded minus everything that left it.
    pub fn vault_balance(&self) -> Option<u64> {
        self.total_funded.checked_sub(self.total_released)?.checked_sub(self.total_refunded)
    }

    /// Funds not yet promised to anyone.
    pub fn available(&self) -> Option<u64> {
        self.vault_balance()?.checked_sub(self.total_committed)
    }
}

/// The brand's permission for a creator to join (and lock part of the budget).
/// `creator == Pubkey::default()` is an open invite: anyone may join.
#[account]
#[derive(InitSpace)]
pub struct Approval {
    pub campaign: Pubkey,
    pub creator: Pubkey,
    pub approved_ts: i64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum EnrollmentStatus {
    AwaitingShipment,
    InTransit,
    Active,
    NotReceived,
    Cancelled,
}

#[account]
#[derive(InitSpace)]
pub struct Enrollment {
    pub campaign: Pubkey,
    pub creator: Pubkey,
    pub status: EnrollmentStatus,
    pub enrolled_ts: i64,
    pub tracking_hash: [u8; 32],
    pub shipped_ts: i64,
    /// Slot due dates count from here; 0 until the product is received (shipped campaigns).
    pub received_ts: i64,
    pub voucher_hash: [u8; 32],
    /// Slot money (with fees) not yet paid or refunded for this creator.
    pub outstanding: u64,
    /// Sales earnings owed to the creator (paid in full on claim).
    pub sales_accrued: u64,
    /// Fees reserved for `sales_accrued`, paid to the treasury on claim.
    pub sales_fees_accrued: u64,
    /// Total paid to the creator. Fees are on top, never deducted.
    pub earned_total: u64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum SlotStatus {
    Open,
    Submitted,
    Rejected,
    /// Paid except the holdback (holdback may be 0, e.g. UGC files).
    Released,
    HoldbackReleased,
    Missed,
    HoldbackForfeited,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum CheckStatus {
    Pending,
    Passed,
    Failed,
}

#[account]
#[derive(InitSpace)]
pub struct Slot {
    pub enrollment: Pubkey,
    pub period_index: u16,
    pub slot_idx: u8,
    pub kind: SlotKind,
    pub amount: u64,
    pub due_offset: i64,
    pub status: SlotStatus,
    pub checks: CheckStatus,
    /// hash(post URL) or SHA-256 of the UGC file.
    pub content_hash: [u8; 32],
    pub submitted_ts: i64,
    pub decided_ts: i64,
    pub resubmits_left: u8,
    /// Portion kept back at release until the still-live check.
    pub holdback: u64,
    /// Fee reserved for the holdback (slot fee minus the fee already paid), settled with it.
    pub holdback_fee: u64,
    pub bump: u8,
}

/// Exists once per (enrollment, order ref): makes `record_sale` idempotent.
#[account]
#[derive(InitSpace)]
pub struct SaleReceipt {
    pub enrollment: Pubkey,
    pub amount: u64,
    pub recorded_ts: i64,
}
