import { z } from 'zod';

export const USDC_BASE = 1_000_000;
/** Decimal USDC (max 2dp from forms) → base-unit string. */
export const toBaseUnits = (usdc: number) => BigInt(Math.round(usdc * 100)) * 10_000n;
export const fromBaseUnits = (base: bigint | string) => Number(BigInt(base)) / USDC_BASE;

export const CampaignTypeSchema = z.enum(['per_post', 'monthly', 'per_sale', 'ugc']);
export type CampaignTypeName = z.infer<typeof CampaignTypeSchema>;

export const SlotTemplateInputSchema = z.object({
  kind: z.enum(['post', 'ugc']),
  amountUsdc: z.number().positive().max(100_000),
  dueDays: z.number().positive().max(120),
});

export const CreateCampaignSchema = z
  .object({
    title: z.string().min(3).max(120),
    brandName: z.string().min(1).max(60).optional(),
    coverUrl: z.url().startsWith('https://').max(500).optional(),
    briefMd: z.string().max(10_000).default(''),
    type: CampaignTypeSchema,
    /** Total USDC the brand funds into escrow when the campaign goes live. */
    budgetUsdc: z.number().positive().max(1_000_000),
    slots: z.array(SlotTemplateInputSchema).max(8).default([]),
    perSaleUsdc: z.number().nonnegative().max(10_000).default(0),
    maxCreators: z.number().int().min(1).max(500).default(10),
    durationDays: z.number().int().min(1).max(365).default(30),
    /** Short windows are allowed so the hosted (non-demo-clock) program can be demoed live. */
    reviewWindowSecs: z.number().int().min(60).default(72 * 3600),
    graceSecs: z.number().int().min(0).default(48 * 3600),
    holdbackPct: z.number().min(0).max(100).default(30),
    requiresShipping: z.boolean().default(false),
    shippingWindowDays: z.number().int().min(1).max(60).default(14),
    shipsTo: z.array(z.enum(['MY', 'ID', 'PH', 'TH'])).default([]),
    /** true: creators apply and the brand approves each one on-chain; false: anyone with the link joins. */
    selective: z.boolean().default(true),
  })
  .refine((c) => (c.type === 'per_sale' ? c.perSaleUsdc > 0 : c.slots.length > 0), {
    message: 'Per-sale campaigns need perSaleUsdc; other types need at least one slot',
  });
export type CreateCampaign = z.input<typeof CreateCampaignSchema>;

export interface SlotTemplateDto {
  kind: 'post' | 'ugc';
  /** base units */
  amount: string;
  dueOffsetSecs: number;
}

export interface CampaignDto {
  id: string;
  onchainPubkey: string | null;
  title: string;
  brandName: string | null;
  /** https URL, or an API path (prefix with the API base) for a brand-kit cover */
  coverUrl: string | null;
  /** Seller provided a brand kit (logo + product photos) for joined creators. */
  hasBrandKit: boolean;
  kitAssetCount: number;
  /** Creators apply and the brand picks; otherwise anyone with the link can join. */
  selective: boolean;
  /** The escrow account exists on Solana (it can be topped up, e.g. from another chain). */
  onChain: boolean;
  /** Brand's own list only: applications waiting for a decision. */
  pendingApplications?: number;
  briefMd: string;
  type: CampaignTypeName;
  status: 'draft' | 'active' | 'cancelling' | 'closed';
  brandId: string;
  startAt: string;
  endAt: string;
  reviewWindowSecs: number;
  graceSecs: number;
  holdbackBps: number;
  requiresShipping: boolean;
  perSaleAmount: string;
  maxCreators: number;
  slots: SlotTemplateDto[];
  budget: string;
  totalFunded: string;
  totalReleased: string;
  totalRefunded: string;
  totalFees: string;
}

/** A post is submitted by link; a UGC file by the id of a verified upload (its SHA-256 goes on-chain). */
export const SubmitSlotSchema = z.union([z.object({ url: z.url().max(500) }), z.object({ uploadId: z.uuid() })]);
export type SubmitSlot = z.infer<typeof SubmitSlotSchema>;

export const MarkShippedSchema = z.object({
  courier: z.string().min(2).max(40),
  trackingRef: z.string().min(4).max(60),
});
export type MarkShipped = z.infer<typeof MarkShippedSchema>;

export const RejectSlotSchema = z.object({
  reasonCode: z.number().int().min(0).max(255).default(0),
});
export type RejectSlot = z.input<typeof RejectSlotSchema>;

export const ShippingAddressSchema = z.object({
  name: z.string().min(2).max(80),
  line1: z.string().min(3).max(120),
  line2: z.string().max(120).default(''),
  city: z.string().min(2).max(60),
  postcode: z.string().min(3).max(12),
  country: z.enum(['MY', 'ID', 'PH', 'TH']),
  phone: z.string().min(6).max(20),
});
export type ShippingAddress = z.infer<typeof ShippingAddressSchema>;

export type SlotStatusName =
  | 'open'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'released'
  | 'holdback_released'
  | 'missed'
  | 'holdback_forfeited';

export type EnrollmentStatusName = 'awaiting_shipment' | 'in_transit' | 'active' | 'not_received' | 'cancelled' | 'completed';

/** Slot as returned by the API (amounts are base-unit strings, times ISO strings in program time). */
export interface SlotDto {
  id: string;
  onchainPubkey: string | null;
  enrollmentId: string;
  periodIndex: number;
  idx: number;
  kind: 'post' | 'ugc';
  dueAt: string | null;
  amount: string;
  dueOffsetSecs: number;
  status: SlotStatusName;
  checks: 'pending' | 'passed' | 'failed';
  submittedAt: string | null;
  decidedAt: string | null;
  holdback: string;
}

export interface EnrollmentDto {
  id: string;
  onchainPubkey: string | null;
  campaignId: string;
  creatorId: string;
  status: EnrollmentStatusName;
  voucherCode: string | null;
  trackingRef: string | null;
  shippedAt: string | null;
  receivedAt: string | null;
  salesAccrued: string;
  earnedTotal: string;
  createdAt: string;
  hasAddress: boolean;
  slots: SlotDto[];
}

export interface MyEnrollmentDto extends EnrollmentDto {
  campaign: CampaignDto;
}

export interface CampaignDetailDto extends CampaignDto {
  enrollments: EnrollmentDto[];
}
