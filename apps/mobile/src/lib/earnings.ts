import type { MyEnrollmentDto, SlotDto } from '@kolab/shared';

/** Earnings rollup from mirrored on-chain state (all base units as bigint). */
export function summarize(enrollments: MyEnrollmentDto[]) {
  let paid = 0n;
  let holdbackPending = 0n;
  let salesToClaim = 0n;
  let upcoming = 0n;
  for (const e of enrollments) {
    paid += BigInt(e.earnedTotal);
    salesToClaim += BigInt(e.salesAccrued);
    for (const s of e.slots) {
      if (s.status === 'released') holdbackPending += BigInt(s.holdback);
      if (s.status === 'open' || s.status === 'submitted' || s.status === 'rejected') upcoming += BigInt(s.amount);
    }
  }
  return { paid, holdbackPending, salesToClaim, upcoming };
}

/** Reliability as the profile shows it: on-chain outcomes only (architecture §5.6). */
export function reliability(enrollments: MyEnrollmentDto[]) {
  const slots = enrollments.flatMap((e) => e.slots);
  const delivered = slots.filter((s) => ['released', 'holdback_released', 'holdback_forfeited'].includes(s.status)).length;
  const missed = slots.filter((s) => s.status === 'missed').length;
  const stayedLive = slots.filter((s) => s.status === 'holdback_released').length;
  const deleted = slots.filter((s) => s.status === 'holdback_forfeited').length;
  return { delivered, missed, decided: delivered + missed, stayedLive, deleted };
}

export const slotTitle = (s: SlotDto) => `${s.kind === 'ugc' ? 'UGC video' : 'Post'} #${s.idx + 1}`;

export function slotsNeedingWork(enrollments: MyEnrollmentDto[]) {
  return enrollments
    .flatMap((e) => e.slots.map((slot) => ({ slot, enrollment: e })))
    .filter(({ slot, enrollment }) => enrollment.status === 'active' && (slot.status === 'open' || slot.status === 'rejected'))
    .sort((a, b) => (a.slot.dueAt ?? '').localeCompare(b.slot.dueAt ?? ''));
}
