//! Kolab escrow: brands lock stablecoins per campaign; creators are paid slot by slot as work is
//! verified, auto-released if the brand goes quiet, refunded to the brand if work isn't delivered.

pub mod clock;
pub mod constants;
pub mod error;
pub mod events;
pub mod instructions;
pub mod state;
pub mod vault;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

// Two deployments of the same code (workplan §0.3): the demo-clock build used for the local
// presentation and the release build the hosted app and README point at.
#[cfg(not(feature = "demo-clock"))]
declare_id!("5JeZ2i6VAPZDpdnwu6GgpXjrXYhodQibSrh6QwmXTQxD");
#[cfg(feature = "demo-clock")]
declare_id!("7hTBC9iCNxZ3pmfk1EHstbB4hmxu2iRrNMZ4UhhChQfv");

#[program]
pub mod kolab {
    use super::*;

    // admin
    pub fn init_config(ctx: Context<InitConfig>, treasury: Pubkey, verifier: Pubkey, fee_bps: u16) -> Result<()> {
        admin::handle_init_config(ctx, treasury, verifier, fee_bps)
    }
    pub fn allow_mint(ctx: Context<AllowMint>) -> Result<()> {
        admin::handle_allow_mint(ctx)
    }
    pub fn set_verifier(ctx: Context<AdminConfig>, verifier: Pubkey) -> Result<()> {
        admin::handle_set_verifier(ctx, verifier)
    }
    /// Errors with `DemoClockDisabled` unless built with `--features demo-clock`.
    pub fn set_demo_offset(ctx: Context<AdminConfig>, offset_secs: i64) -> Result<()> {
        admin::handle_set_demo_offset(ctx, offset_secs)
    }

    // campaign
    pub fn create_campaign(ctx: Context<CreateCampaign>, args: CreateCampaignArgs) -> Result<()> {
        campaign::handle_create_campaign(ctx, args)
    }
    pub fn fund_campaign(ctx: Context<FundCampaign>, amount: u64) -> Result<()> {
        campaign::handle_fund_campaign(ctx, amount)
    }
    pub fn top_up_campaign(ctx: Context<TopUpCampaign>, amount: u64) -> Result<()> {
        campaign::handle_top_up_campaign(ctx, amount)
    }
    pub fn close_campaign(ctx: Context<CloseCampaign>) -> Result<()> {
        campaign::handle_close_campaign(ctx)
    }

    // enrollment + shipping
    pub fn approve_creator(ctx: Context<ApproveCreator>, creator: Pubkey) -> Result<()> {
        enroll::handle_approve_creator(ctx, creator)
    }
    pub fn revoke_approval(ctx: Context<RevokeApproval>) -> Result<()> {
        enroll::handle_revoke_approval(ctx)
    }
    pub fn enroll_creator(ctx: Context<EnrollCreator>, voucher_hash: [u8; 32]) -> Result<()> {
        enroll::handle_enroll_creator(ctx, voucher_hash)
    }
    pub fn init_slot(ctx: Context<InitSlot>, slot_idx: u8) -> Result<()> {
        enroll::handle_init_slot(ctx, slot_idx)
    }
    pub fn mark_shipped(ctx: Context<MarkShipped>, tracking_hash: [u8; 32]) -> Result<()> {
        enroll::handle_mark_shipped(ctx, tracking_hash)
    }
    pub fn confirm_received(ctx: Context<ConfirmReceived>) -> Result<()> {
        enroll::handle_confirm_received(ctx)
    }
    pub fn report_not_received(ctx: Context<ReportNotReceived>) -> Result<()> {
        enroll::handle_report_not_received(ctx)
    }
    pub fn cancel_enrollment(ctx: Context<CancelEnrollment>) -> Result<()> {
        enroll::handle_cancel_enrollment(ctx)
    }

    // slots
    pub fn submit_deliverable(ctx: Context<SubmitDeliverable>, content_hash: [u8; 32]) -> Result<()> {
        slot::handle_submit_deliverable(ctx, content_hash)
    }
    pub fn attest_checks(ctx: Context<AttestChecks>, passed: bool) -> Result<()> {
        slot::handle_attest_checks(ctx, passed)
    }
    pub fn reject(ctx: Context<RejectSlot>, reason_code: u8) -> Result<()> {
        slot::handle_reject(ctx, reason_code)
    }
    pub fn approve(ctx: Context<Approve>) -> Result<()> {
        slot::handle_approve(ctx)
    }
    pub fn auto_release(ctx: Context<Crank>) -> Result<()> {
        slot::handle_auto_release(ctx)
    }
    pub fn mark_missed(ctx: Context<Crank>) -> Result<()> {
        slot::handle_mark_missed(ctx)
    }
    pub fn attest_live(ctx: Context<AttestLive>, still_live: bool) -> Result<()> {
        slot::handle_attest_live(ctx, still_live)
    }

    // per-sale
    pub fn record_sale(ctx: Context<RecordSale>, ref_hash: [u8; 32]) -> Result<()> {
        sales::handle_record_sale(ctx, ref_hash)
    }
    pub fn claim_sales(ctx: Context<ClaimSales>) -> Result<()> {
        sales::handle_claim_sales(ctx)
    }
}
