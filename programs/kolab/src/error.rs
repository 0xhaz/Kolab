use anchor_lang::prelude::*;

#[error_code]
pub enum KolabError {
    #[msg("Signer is not the configured admin")]
    NotAdmin,
    #[msg("Signer is not the configured verifier")]
    NotVerifier,
    #[msg("Signer is not the campaign brand")]
    NotBrand,
    #[msg("Signer is not the enrolled creator")]
    NotCreator,
    #[msg("Mint is not on the stablecoin allowlist")]
    MintNotAllowed,
    #[msg("Allowlist is full")]
    AllowlistFull,
    #[msg("Fee is above the maximum")]
    FeeTooHigh,
    #[msg("Invalid campaign parameters")]
    InvalidCampaignParams,
    #[msg("Too many slots in the schedule")]
    TooManySlots,
    #[msg("Campaign is not active")]
    CampaignNotActive,
    #[msg("Campaign has ended")]
    CampaignEnded,
    #[msg("Campaign has not ended yet")]
    CampaignNotEnded,
    #[msg("Campaign is full")]
    CampaignFull,
    #[msg("Not enough uncommitted funds in the vault")]
    InsufficientFunds,
    #[msg("Enrollment is not in the required state")]
    InvalidEnrollmentState,
    #[msg("Shipping window has not elapsed")]
    ShippingWindowOpen,
    #[msg("Shipping window has elapsed")]
    ShippingWindowClosed,
    #[msg("Slot index is outside the campaign schedule")]
    InvalidSlotIndex,
    #[msg("Slot is not in the required state")]
    InvalidSlotState,
    #[msg("Slot deadline (due + grace) has passed")]
    SlotPastDeadline,
    #[msg("Slot is not past its deadline yet")]
    SlotNotDue,
    #[msg("No resubmissions left")]
    NoResubmitsLeft,
    #[msg("Review window is still open")]
    ReviewWindowOpen,
    #[msg("Automated checks failed; brand must decide")]
    ChecksFailed,
    #[msg("Slot has no holdback to settle")]
    NoHoldback,
    #[msg("Campaign is not a per-sale campaign")]
    NotPerSale,
    #[msg("Nothing to claim")]
    NothingToClaim,
    #[msg("Demo clock is not available in this build")]
    DemoClockDisabled,
    #[msg("Arithmetic overflow")]
    MathOverflow,
    #[msg("The brand has not approved this creator for the campaign")]
    NotApproved,
}
