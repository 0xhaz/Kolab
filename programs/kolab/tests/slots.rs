//! Every slot path from architecture §4.3, with exact token amounts.
//! Post slot = 100 USDC, holdback 30%. The brand pays a 5% fee on top of released money only;
//! the creator always receives the full slot amount.

mod common;
use common::*;
use kolab::{error::KolabError, state::*};
use solana_keypair::Keypair;
use solana_signer::Signer;

fn slot0(enrollment: &anchor_lang::prelude::Pubkey) -> anchor_lang::prelude::Pubkey {
    slot_pda(enrollment, 0, 0)
}

#[test]
fn approve_pays_70_percent_minus_fee_then_holdback_on_still_live() {
    let mut w = World::new();
    let (c, e) = w.setup_monthly(vec![post(100, 7)], 1_000);
    let s = slot0(&e);
    let brand_before = w.balance(&w.brand.pubkey());

    w.submit(c, e, s).unwrap();
    let brand = w.brand.insecure_clone();
    w.approve(c, e, s, &brand).unwrap();

    // 70 released to the creator in full; fee 3.5 on top to the treasury
    assert_eq!(w.balance(&w.creator.pubkey()), 70 * USDC);
    assert_eq!(w.balance(&w.treasury.pubkey()), 3_500_000);
    let slot: Slot = w.account(&s);
    assert_eq!(slot.status, SlotStatus::Released);
    assert_eq!(slot.holdback, 30 * USDC);

    let v = w.verifier.insecure_clone();
    w.attest_live(c, e, s, true, &v).unwrap();
    // holdback 30 to the creator, fee 1.5 on top
    assert_eq!(w.balance(&w.creator.pubkey()), 100 * USDC);
    assert_eq!(w.balance(&w.treasury.pubkey()), 5 * USDC);
    assert_eq!(w.account::<Slot>(&s).status, SlotStatus::HoldbackReleased);
    assert_eq!(w.balance(&w.brand.pubkey()), brand_before, "brand pays nothing extra");

    let camp: Campaign = w.account(&c);
    assert_eq!(camp.total_committed, 0);
    assert_eq!(camp.total_released, 105 * USDC);
    assert_eq!(camp.total_fees, 5 * USDC);
    assert_eq!(w.vault_balance(&c), 895 * USDC);
    let en: Enrollment = w.account(&e);
    assert_eq!(en.outstanding, 0);
    assert_eq!(en.earned_total, 100 * USDC);
}

#[test]
fn ugc_slot_has_no_holdback() {
    let mut w = World::new();
    let (c, e) = w.setup_monthly(vec![ugc(200, 10)], 1_000);
    let s = slot0(&e);
    w.submit(c, e, s).unwrap();
    let brand = w.brand.insecure_clone();
    w.approve(c, e, s, &brand).unwrap();
    assert_eq!(w.balance(&w.creator.pubkey()), 200 * USDC);
    assert_eq!(w.balance(&w.treasury.pubkey()), 10 * USDC);
    assert_eq!(w.account::<Slot>(&s).holdback, 0);
    let v = w.verifier.insecure_clone();
    assert_kolab_err(w.attest_live(c, e, s, true, &v), KolabError::NoHoldback);
}

#[test]
fn auto_release_only_after_review_window() {
    let mut w = World::new();
    let (c, e) = w.setup_monthly(vec![post(100, 7)], 1_000);
    let s = slot0(&e);
    w.submit(c, e, s).unwrap();

    w.advance(REVIEW - 1);
    assert_kolab_err(w.auto_release(c, e, s), KolabError::ReviewWindowOpen);
    w.advance(1);
    w.auto_release(c, e, s).unwrap(); // permissionless: only the sponsor signs
    assert_eq!(w.balance(&w.creator.pubkey()), 70 * USDC);
    assert_eq!(w.account::<Slot>(&s).status, SlotStatus::Released);
}

#[test]
fn auto_release_blocked_when_checks_failed_but_brand_can_still_approve() {
    let mut w = World::new();
    let (c, e) = w.setup_monthly(vec![post(100, 7)], 1_000);
    let s = slot0(&e);
    w.submit(c, e, s).unwrap();
    let v = w.verifier.insecure_clone();
    w.attest_checks(s, false, &v).unwrap();
    w.advance(REVIEW);
    assert_kolab_err(w.auto_release(c, e, s), KolabError::ChecksFailed);
    let brand = w.brand.insecure_clone();
    w.approve(c, e, s, &brand).unwrap();
}

#[test]
fn reject_then_resubmit_once() {
    let mut w = World::new();
    let (c, e) = w.setup_monthly(vec![post(100, 7)], 1_000);
    let s = slot0(&e);
    w.submit(c, e, s).unwrap();
    w.reject(c, e, s).unwrap();
    assert_eq!(w.account::<Slot>(&s).status, SlotStatus::Rejected);

    w.submit(c, e, s).unwrap(); // the one resubmission
    w.reject(c, e, s).unwrap();
    assert_kolab_err(w.submit(c, e, s), KolabError::NoResubmitsLeft);
}

#[test]
fn reject_not_allowed_after_review_window() {
    let mut w = World::new();
    let (c, e) = w.setup_monthly(vec![post(100, 7)], 1_000);
    let s = slot0(&e);
    w.submit(c, e, s).unwrap();
    w.advance(REVIEW);
    assert_kolab_err(w.reject(c, e, s), KolabError::InvalidSlotState);
}

#[test]
fn missed_slot_refunds_amount_and_fee_reservation_to_brand() {
    let mut w = World::new();
    let (c, e) = w.setup_monthly(vec![post(100, 7)], 1_000);
    let s = slot0(&e);
    let brand_before = w.balance(&w.brand.pubkey());

    w.advance(7 * DAY + GRACE);
    assert_kolab_err(w.mark_missed(c, e, s), KolabError::SlotNotDue);
    w.advance(1);
    assert_kolab_err(w.submit(c, e, s), KolabError::SlotPastDeadline);
    w.mark_missed(c, e, s).unwrap();

    assert_eq!(w.balance(&w.brand.pubkey()), brand_before + 105 * USDC);
    assert_eq!(w.balance(&w.treasury.pubkey()), 0);
    assert_eq!(w.account::<Slot>(&s).status, SlotStatus::Missed);
    assert_eq!(w.account::<Campaign>(&c).total_committed, 0);
}

#[test]
fn rejected_and_never_fixed_becomes_missed() {
    let mut w = World::new();
    let (c, e) = w.setup_monthly(vec![post(100, 7)], 1_000);
    let s = slot0(&e);
    w.submit(c, e, s).unwrap();
    w.reject(c, e, s).unwrap();
    w.advance(7 * DAY + GRACE + 1);
    w.mark_missed(c, e, s).unwrap();
    assert_eq!(w.account::<Slot>(&s).status, SlotStatus::Missed);
}

#[test]
fn submitted_slot_cannot_be_marked_missed() {
    let mut w = World::new();
    let (c, e) = w.setup_monthly(vec![post(100, 7)], 1_000);
    let s = slot0(&e);
    w.submit(c, e, s).unwrap();
    w.advance(30 * DAY);
    assert_kolab_err(w.mark_missed(c, e, s), KolabError::InvalidSlotState);
}

#[test]
fn deleted_post_forfeits_holdback_to_brand() {
    let mut w = World::new();
    let (c, e) = w.setup_monthly(vec![post(100, 7)], 1_000);
    let s = slot0(&e);
    let brand_before = w.balance(&w.brand.pubkey());
    w.submit(c, e, s).unwrap();
    let brand = w.brand.insecure_clone();
    w.approve(c, e, s, &brand).unwrap();
    let v = w.verifier.insecure_clone();
    w.attest_live(c, e, s, false, &v).unwrap();

    assert_eq!(w.balance(&w.creator.pubkey()), 70 * USDC);
    assert_eq!(w.balance(&w.brand.pubkey()), brand_before + 31_500_000, "holdback + its fee back");
    assert_eq!(w.balance(&w.treasury.pubkey()), 3_500_000, "no fee on forfeited holdback");
    assert_eq!(w.account::<Slot>(&s).status, SlotStatus::HoldbackForfeited);
}

#[test]
fn only_brand_approves_and_only_verifier_attests() {
    let mut w = World::new();
    let (c, e) = w.setup_monthly(vec![post(100, 7)], 1_000);
    let s = slot0(&e);
    w.submit(c, e, s).unwrap();

    let stranger = Keypair::new();
    w.svm.airdrop(&stranger.pubkey(), 1_000_000_000).unwrap();
    assert_kolab_err(w.approve(c, e, s, &stranger), KolabError::NotBrand);
    assert_kolab_err(w.attest_checks(s, true, &stranger), KolabError::NotVerifier);
    let creator = w.creator.insecure_clone();
    assert_kolab_err(w.approve(c, e, s, &creator), KolabError::NotBrand);

    let brand = w.brand.insecure_clone();
    w.approve(c, e, s, &brand).unwrap();
    assert_kolab_err(w.attest_live(c, e, s, false, &stranger), KolabError::NotVerifier);
}

#[test]
fn four_slot_package_demo_script() {
    // architecture §9 demo: approve, auto-release, missed, deleted post
    let mut w = World::new();
    let (c, e) = w.setup_monthly(vec![post(100, 7), post(100, 14), post(100, 21), post(100, 28)], 1_000);
    let [s1, s2, s3, s4] = [0u8, 1, 2, 3].map(|i| slot_pda(&e, 0, i));
    let brand = w.brand.insecure_clone();
    let v = w.verifier.insecure_clone();
    let brand_before = w.balance(&w.brand.pubkey());

    w.submit(c, e, s1).unwrap();
    w.approve(c, e, s1, &brand).unwrap();
    w.submit(c, e, s2).unwrap();
    w.submit(c, e, s4).unwrap();
    w.approve(c, e, s4, &brand).unwrap();
    w.advance(REVIEW);
    w.auto_release(c, e, s2).unwrap();
    w.advance(21 * DAY + GRACE);
    w.mark_missed(c, e, s3).unwrap();
    w.attest_live(c, e, s1, true, &v).unwrap();
    w.attest_live(c, e, s2, true, &v).unwrap();
    w.attest_live(c, e, s4, false, &v).unwrap();

    // creator: 100 + 100 + 70; brand back: 105 (missed) + 31.5 (forfeit); fees: 5 + 5 + 3.5
    assert_eq!(w.balance(&w.creator.pubkey()), 270 * USDC);
    assert_eq!(w.balance(&w.brand.pubkey()), brand_before + 136_500_000);
    assert_eq!(w.balance(&w.treasury.pubkey()), 13_500_000);
    let camp: Campaign = w.account(&c);
    assert_eq!(camp.total_committed, 0);
    assert_eq!(w.vault_balance(&c), 580 * USDC);
    assert_eq!(camp.available(), Some(580 * USDC));
}

#[test]
fn fee_split_leaves_no_dust_on_odd_amounts() {
    // 33.333333 USDC with 30% holdback: pay/holdback fees must add up to the slot fee exactly
    let mut w = World::new();
    let odd = SlotTemplate { kind: SlotKind::Post, amount: 33_333_333, due_offset: 7 * DAY };
    let (c, e) = w.setup_monthly(vec![odd], 1_000);
    let s = slot0(&e);
    w.submit(c, e, s).unwrap();
    let brand = w.brand.insecure_clone();
    w.approve(c, e, s, &brand).unwrap();
    let v = w.verifier.insecure_clone();
    w.attest_live(c, e, s, true, &v).unwrap();
    assert_eq!(w.balance(&w.creator.pubkey()), 33_333_333);
    assert_eq!(w.balance(&w.treasury.pubkey()), 1_666_666); // floor(33_333_333 × 5%)
    let camp: Campaign = w.account(&c);
    assert_eq!(camp.total_committed, 0, "nothing left reserved");
    assert_eq!(w.account::<Enrollment>(&e).outstanding, 0);
}
