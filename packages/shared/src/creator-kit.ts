import { z } from 'zod';

/** What every post for a campaign must contain. Same rules for the caption builder, pre-check and verifier. */
export interface PostRequirements {
  disclosure: string;
  brandTag: string;
  product: string;
  voucher: string | null;
}

export function postRequirements(campaign: { title: string; brandName: string | null }, voucherCode?: string | null): PostRequirements {
  const brand = campaign.brandName ?? campaign.title.split(':')[0] ?? 'brand';
  return {
    disclosure: '#ad',
    brandTag: `#${brand.replace(/[^A-Za-z0-9]/g, '')}`,
    product: (campaign.title.split(':')[0] ?? campaign.title).trim(),
    voucher: voucherCode ?? null,
  };
}

export const CaptionLanguageSchema = z.enum(['en', 'ms', 'id']);
export type CaptionLanguage = z.infer<typeof CaptionLanguageSchema>;

export const CaptionRequestSchema = z.object({
  language: CaptionLanguageSchema.default('en'),
  vibe: z.enum(['casual', 'honest review', 'tutorial', 'hype']).default('casual'),
  notes: z.string().max(300).optional(),
});
export type CaptionRequest = z.input<typeof CaptionRequestSchema>;

export const PrecheckRequestSchema = z.object({ caption: z.string().max(2200) });

export interface PrecheckItem {
  key: 'disclosure' | 'brandTag' | 'product' | 'voucher' | 'length';
  label: string;
  passed: boolean;
  fix?: string;
}

const DISCLOSURE = /#(ad|ads|iklan|sponsored|spon|paidpartnership)\b|paid partnership|kerjasama berbayar/i;

/** Deterministic pre-check a creator runs before posting (mirrors what the verifier checks after). */
export function precheckCaption(caption: string, req: PostRequirements): PrecheckItem[] {
  const lower = caption.toLowerCase();
  const items: PrecheckItem[] = [
    { key: 'disclosure', label: 'Paid-partnership disclosure', passed: DISCLOSURE.test(caption), fix: `Add ${req.disclosure}` },
    { key: 'brandTag', label: `Brand tag ${req.brandTag}`, passed: lower.includes(req.brandTag.toLowerCase()), fix: `Add ${req.brandTag}` },
    {
      key: 'product',
      label: `Mentions ${req.product}`,
      passed: req.product
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 2)
        .every((w) => lower.includes(w)),
      fix: `Name the product: ${req.product}`,
    },
  ];
  if (req.voucher) {
    items.push({ key: 'voucher', label: `Voucher ${req.voucher}`, passed: caption.includes(req.voucher), fix: `Add your code ${req.voucher}` });
  }
  items.push({ key: 'length', label: 'Fits TikTok’s caption limit', passed: caption.length <= 2200, fix: 'Shorten to 2,200 characters' });
  return items;
}

export const BrandKitSchema = z.object({
  logoUploadId: z.uuid(),
  productUploadIds: z.array(z.uuid()).min(1).max(6),
  colors: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).length(2),
  notes: z.string().max(600).optional(),
  /** Seller confirms they own the assets and allow joined creators to use them for this campaign. */
  rightsConfirmed: z.literal(true),
});
export type BrandKitInput = z.infer<typeof BrandKitSchema>;

export interface BrandKitAsset {
  id: string;
  kind: 'logo' | 'product';
  /** Short-lived link (absolute https, or an API path to prefix with the API base). */
  url: string;
  mime: string;
}

export interface BrandKitDto {
  logo: BrandKitAsset | null;
  products: BrandKitAsset[];
  colors: string[];
  notes: string | null;
  brandName: string | null;
}
