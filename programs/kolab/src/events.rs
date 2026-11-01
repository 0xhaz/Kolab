use anchor_lang::prelude::*;

#[event]
pub struct CampaignCreated {
    pub campaign: Pubkey,
    pub brand: Pubkey,
}
#[event]
pub struct CampaignFunded {
    pub campaign: Pubkey,
    pub amount: u64,
    pub total_funded: u64,
}
#[event]
pub struct CreatorApproved {
    pub campaign: Pubkey,
    /// Pubkey::default() for an open invite.
    pub creator: Pubkey,
}
#[event]
pub struct ApprovalRevoked {
    pub campaign: Pubkey,
    pub creator: Pubkey,
}
#[event]
pub struct CreatorEnrolled {
    pub campaign: Pubkey,
    pub enrollment: Pubkey,
    pub creator: Pubkey,
    pub committed: u64,
}
#[event]
pub struct Shipped {
    pub enrollment: Pubkey,
}
#[event]
pub struct Received {
    pub enrollment: Pubkey,
    pub received_ts: i64,
}
#[event]
pub struct NotReceived {
    pub enrollment: Pubkey,
}
#[event]
pub struct EnrollmentCancelled {
    pub enrollment: Pubkey,
    pub refunded: u64,
}
#[event]
pub struct Submitted {
    pub slot: Pubkey,
    pub content_hash: [u8; 32],
}
#[event]
pub struct ChecksAttested {
    pub slot: Pubkey,
    pub passed: bool,
}
#[event]
pub struct Rejected {
    pub slot: Pubkey,
    pub reason_code: u8,
}
#[event]
pub struct Released {
    pub slot: Pubkey,
    pub creator_amount: u64,
    pub fee: u64,
    pub holdback: u64,
    pub auto: bool,
}
#[event]
pub struct HoldbackSettled {
    pub slot: Pubkey,
    pub still_live: bool,
    pub amount: u64,
}
#[event]
pub struct Missed {
    pub slot: Pubkey,
    pub refunded: u64,
}
#[event]
pub struct SaleRecorded {
    pub enrollment: Pubkey,
    pub amount: u64,
    pub sales_accrued: u64,
}
#[event]
pub struct SalesClaimed {
    pub enrollment: Pubkey,
    pub creator_amount: u64,
    pub fee: u64,
}
#[event]
pub struct CampaignClosed {
    pub campaign: Pubkey,
    pub refunded: u64,
}
