/** Pure mappings from on-chain enums / timestamps to the Postgres mirror. */
import {
  CampaignStatus as ChainCampaignStatus,
  CampaignType as ChainCampaignType,
  CheckStatus as ChainCheckStatus,
  EnrollmentStatus as ChainEnrollmentStatus,
  SlotKind as ChainSlotKind,
  SlotStatus as ChainSlotStatus,
  type SlotTemplate,
} from '@kolab/sdk';
import type {
  CampaignStatus,
  CampaignType,
  CheckStatus,
  EnrollmentStatus,
  SlotKind,
  SlotStatus,
} from '../generated/prisma/enums.js';
import type { SlotTemplateDto } from '@kolab/shared';

export const campaignType: Record<ChainCampaignType, CampaignType> = {
  [ChainCampaignType.PerPost]: 'per_post',
  [ChainCampaignType.Monthly]: 'monthly',
  [ChainCampaignType.PerSale]: 'per_sale',
  [ChainCampaignType.Ugc]: 'ugc',
};
export const chainCampaignType: Record<CampaignType, ChainCampaignType> = {
  per_post: ChainCampaignType.PerPost,
  monthly: ChainCampaignType.Monthly,
  per_sale: ChainCampaignType.PerSale,
  ugc: ChainCampaignType.Ugc,
};

export const campaignStatus: Record<ChainCampaignStatus, CampaignStatus> = {
  [ChainCampaignStatus.Draft]: 'draft',
  [ChainCampaignStatus.Active]: 'active',
  [ChainCampaignStatus.Closed]: 'closed',
};

export const enrollmentStatus: Record<ChainEnrollmentStatus, EnrollmentStatus> = {
  [ChainEnrollmentStatus.AwaitingShipment]: 'awaiting_shipment',
  [ChainEnrollmentStatus.InTransit]: 'in_transit',
  [ChainEnrollmentStatus.Active]: 'active',
  [ChainEnrollmentStatus.NotReceived]: 'not_received',
  [ChainEnrollmentStatus.Cancelled]: 'cancelled',
};

export const slotStatus: Record<ChainSlotStatus, SlotStatus> = {
  [ChainSlotStatus.Open]: 'open',
  [ChainSlotStatus.Submitted]: 'submitted',
  [ChainSlotStatus.Rejected]: 'rejected',
  [ChainSlotStatus.Released]: 'released',
  [ChainSlotStatus.HoldbackReleased]: 'holdback_released',
  [ChainSlotStatus.Missed]: 'missed',
  [ChainSlotStatus.HoldbackForfeited]: 'holdback_forfeited',
};

export const slotKind: Record<ChainSlotKind, SlotKind> = {
  [ChainSlotKind.Post]: 'post',
  [ChainSlotKind.Ugc]: 'ugc',
};
export const chainSlotKind: Record<SlotKind, ChainSlotKind> = {
  post: ChainSlotKind.Post,
  ugc: ChainSlotKind.Ugc,
};

export const checkStatus: Record<ChainCheckStatus, CheckStatus> = {
  [ChainCheckStatus.Pending]: 'pending',
  [ChainCheckStatus.Passed]: 'passed',
  [ChainCheckStatus.Failed]: 'failed',
};

/** Program timestamps are unix seconds in program time (wall clock + demo offset). */
export const tsToDate = (ts: bigint): Date | null => (ts > 0n ? new Date(Number(ts) * 1000) : null);

export function templatesToDto(slots: SlotTemplate[], count: number): SlotTemplateDto[] {
  return slots.slice(0, count).map((s) => ({
    kind: slotKind[s.kind],
    amount: s.amount.toString(),
    dueOffsetSecs: Number(s.dueOffset),
  }));
}

/** Short deterministic voucher shown to per-sale creators (the chain stores only its hash). */
export function voucherFor(enrollment: string): string {
  return `KOLAB-${enrollment.slice(0, 6).toUpperCase()}`;
}
