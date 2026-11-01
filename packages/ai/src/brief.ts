import { z } from 'zod';
import type { AiProvider } from './provider.js';

/** What the brief builder returns; maps 1:1 onto the dashboard's campaign form. */
export const BriefSchema = z.object({
  title: z.string().min(3).max(120),
  briefMd: z.string().min(20).max(4000),
  campaignType: z.enum(['per_post', 'monthly', 'per_sale', 'ugc']),
  slots: z
    .array(z.object({ kind: z.enum(['post', 'ugc']), amountUsdc: z.number().positive(), dueDays: z.number().positive() }))
    .max(8),
  perSaleUsdc: z.number().nonnegative(),
  suggestedCreators: z.number().int().min(1).max(50),
  rationale: z.string().max(600),
});
export type Brief = z.infer<typeof BriefSchema>;

export interface BriefInput {
  productText: string;
  productUrl?: string;
  budgetUsdc: number;
  markets: string[];
  goal?: 'awareness' | 'sales' | 'ugc';
}

const SYSTEM = `Draft campaign brief for Kolab, a marketplace where Southeast Asian online sellers hire micro-creators (1k–20k followers).
Write for creators in plain English. Keep the brief under 120 words: what to show, must-mention points, required tags (#ad plus the brand handle if known), and dos/don'ts.
Choose a campaign type: "monthly" (a package of weekly posts), "per_post", "per_sale" (pays per confirmed order via voucher code), or "ugc" (video files the brand uses in ads).
Size the slots so one creator's total plus a 5% platform fee fits the budget at least once; micro-creator rates in MY/ID are typically 10–60 USD per post and 30–120 USD per UGC video.
Never include wallet addresses or payment instructions. Return JSON only.`;

export async function generateBrief(ai: AiProvider, input: BriefInput): Promise<Brief> {
  const prompt = [
    `Product: ${input.productText.slice(0, 4000)}`,
    input.productUrl ? `Product link: ${input.productUrl}` : '',
    `Budget: ${input.budgetUsdc} USDC total`,
    `Markets: ${input.markets.join(', ') || 'MY'}`,
    input.goal ? `Goal: ${input.goal}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  return ai.complete({ schema: BriefSchema, system: SYSTEM, prompt });
}

/**
 * Offline draft used when no model is configured (AI_PROVIDER=mock): deterministic, sized to the
 * budget, so the demo never depends on a live model call.
 */
export function templateBrief(input: BriefInput): Brief {
  const name = (input.productText.split(/[.\n]/)[0] ?? 'your product').trim().slice(0, 60) || 'your product';
  const goal = input.goal ?? 'awareness';
  if (goal === 'sales') {
    return {
      title: `${name}: earn per sale`,
      briefMd: `Show ${name} in your everyday routine and share your personal voucher code in the caption and pinned comment. Mention one real benefit you noticed. Tag #ad. No medical or "guaranteed results" claims.`,
      campaignType: 'per_sale',
      slots: [],
      perSaleUsdc: Math.max(2, Math.round(input.budgetUsdc / 40)),
      suggestedCreators: 5,
      rationale: 'Sales goal: paying per confirmed order keeps spend tied to results.',
    };
  }
  const perPost = Math.max(5, Math.min(40, Math.floor((input.budgetUsdc / 1.05 / 4) * 100) / 100));
  const creators = Math.max(1, Math.floor(input.budgetUsdc / (perPost * 4 * 1.05)));
  return {
    title: `${name}: monthly creator package`,
    briefMd: `Four TikTok posts over four weeks featuring ${name}. Week 1: unboxing and first impressions. Weeks 2–3: how you use it day to day. Week 4: honest results. Say the product name in the first 3 seconds, tag #ad and the brand, keep posts live for at least 7 days. No competitor products in frame.`,
    campaignType: 'monthly',
    slots: [1, 2, 3, 4].map((w) => ({ kind: 'post' as const, amountUsdc: perPost, dueDays: w * 7 })),
    perSaleUsdc: 0,
    suggestedCreators: creators,
    rationale: `A weekly cadence builds familiarity; ${perPost} USDC per post fits ${creators} creator${creators === 1 ? '' : 's'} within the budget including the 5% fee.`,
  };
}
