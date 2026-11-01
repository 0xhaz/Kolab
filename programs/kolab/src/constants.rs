use anchor_lang::prelude::*;

#[constant]
pub const CONFIG_SEED: &[u8] = b"config";
#[constant]
pub const CAMPAIGN_SEED: &[u8] = b"campaign";
#[constant]
pub const ENROLLMENT_SEED: &[u8] = b"enroll";
#[constant]
pub const SLOT_SEED: &[u8] = b"slot";
#[constant]
pub const SALE_SEED: &[u8] = b"sale";
#[constant]
pub const APPROVAL_SEED: &[u8] = b"approval";

/// Basis-point denominator for fee and holdback maths.
pub const BPS: u64 = 10_000;
/// Max deliverables per creator per period (keeps Campaign a fixed size).
pub const MAX_SLOTS: usize = 8;
/// Max stablecoins on the payout allowlist.
pub const MAX_MINTS: usize = 4;
/// Platform fee ceiling the admin can configure (10%).
pub const MAX_FEE_BPS: u16 = 1_000;
