import type { CreateCampaign } from '@kolab/shared';

/** The Glow Lab demo campaigns (architecture §9 demo script), used by the dashboard seed and scripts/seed-campaign. */
export const DEMO_BRAND_NAME = 'Glow Lab MY';

const BRIEF =
  'Four TikTok posts showing your morning routine with the Glow Lab vitamin C serum. Say the product name in the first 3 seconds, tag #ad and @glowlab.my, and keep posts live for 7 days.';

export const demoCampaigns = (brandName = DEMO_BRAND_NAME): Record<'monthly' | 'shipping' | 'perSale' | 'ugc', CreateCampaign> => ({
  monthly: {
    title: 'Glow Lab serum: October package',
    brandName,
    briefMd: BRIEF,
    type: 'monthly',
    budgetUsdc: 120,
    slots: [1, 2, 3, 4].map((week) => ({ kind: 'post' as const, amountUsdc: 10, dueDays: week * 7 })),
    reviewWindowSecs: 72 * 3600,
    graceSecs: 48 * 3600,
    holdbackPct: 30,
    durationDays: 45,
    shipsTo: ['MY', 'ID'],
    maxCreators: 5,
  },
  shipping: {
    title: 'Glow Lab serum: October package (product shipped)',
    brandName,
    briefMd: `${BRIEF} We ship you the full-size serum first; your deadlines start when it arrives.`,
    type: 'monthly',
    budgetUsdc: 120,
    slots: [1, 2, 3, 4].map((week) => ({ kind: 'post' as const, amountUsdc: 10, dueDays: week * 7 })),
    reviewWindowSecs: 72 * 3600,
    graceSecs: 48 * 3600,
    holdbackPct: 30,
    durationDays: 45,
    requiresShipping: true,
    shippingWindowDays: 21,
    shipsTo: ['MY', 'ID'],
    maxCreators: 5,
  },
  ugc: {
    title: 'Glow Lab serum: UGC videos for ads',
    brandName,
    briefMd:
      'Two 20–30 s vertical videos for our TikTok and Meta ads: (1) unboxing + first impression, (2) morning routine with the serum. Natural light, no music, no other brands in frame. Deliver the raw MP4 here; we run it on our own accounts for 12 months.',
    type: 'ugc',
    budgetUsdc: 110,
    slots: [
      { kind: 'ugc' as const, amountUsdc: 25, dueDays: 7 },
      { kind: 'ugc' as const, amountUsdc: 25, dueDays: 14 },
    ],
    reviewWindowSecs: 72 * 3600,
    graceSecs: 48 * 3600,
    holdbackPct: 0,
    durationDays: 30,
    shipsTo: ['MY', 'ID'],
    maxCreators: 2,
  },
  perSale: {
    title: 'Glow Lab serum: earn per sale',
    brandName,
    briefMd: 'Share your voucher code in your caption and pinned comment. You earn 5 USDC for every confirmed order.',
    type: 'per_sale',
    budgetUsdc: 100,
    perSaleUsdc: 5,
    durationDays: 30,
  },
});
