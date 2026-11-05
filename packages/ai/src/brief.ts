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
  /** The brand already chose the structure: write the title and brief for it, and keep it as is. */
  setup?: BriefSetup;
}

export interface BriefSetup {
  campaignType: Brief['campaignType'];
  slots: Brief['slots'];
  perSaleUsdc: number;
  maxCreators: number;
}

const TYPE_LABEL: Record<Brief['campaignType'], string> = {
  per_post: 'per post',
  monthly: 'monthly package',
  per_sale: 'per sale',
  ugc: 'UGC delivery',
};

function describeSetup(setup: BriefSetup): string {
  const deliverables =
    setup.campaignType === 'per_sale'
      ? `pays ${setup.perSaleUsdc} USDC per confirmed sale`
      : setup.slots.map((s, i) => `#${i + 1} ${s.kind === 'ugc' ? 'UGC video' : 'post'}, ${s.amountUsdc} USDC, due day ${s.dueDays}`).join('; ');
  return `Fixed setup (do not change it): type ${setup.campaignType}; ${deliverables}; up to ${setup.maxCreators} creators.`;
}

/** Keeps the brand's structure whatever the writer returned; only the words are drafted. */
function applySetup(brief: Brief, setup: BriefSetup | undefined): Brief {
  if (!setup) return brief;
  return {
    ...brief,
    campaignType: setup.campaignType,
    slots: setup.campaignType === 'per_sale' ? [] : setup.slots,
    perSaleUsdc: setup.campaignType === 'per_sale' ? setup.perSaleUsdc : 0,
    suggestedCreators: Math.min(50, Math.max(1, setup.maxCreators)),
  };
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
    input.setup ? describeSetup(input.setup) + ' Write the title and brief for exactly these deliverables.' : '',
  ]
    .filter(Boolean)
    .join('\n');
  return applySetup(await ai.complete({ schema: BriefSchema, system: SYSTEM, prompt }), input.setup);
}

/**
 * Offline draft used when no model is configured (AI_PROVIDER=mock): deterministic, sized to the
 * budget, so the demo never depends on a live model call.
 */
export function templateBrief(input: BriefInput): Brief {
  const name = (input.productText.split(/[.\n]/)[0] ?? 'your product').trim().slice(0, 60) || 'your product';
  if (input.setup) return setupBrief(name, input.setup);
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

const WORDS = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight'];

/** Template wording for a structure the brand set by hand. */
function setupBrief(name: string, setup: BriefSetup): Brief {
  const rules = 'Say the product name in the first 3 seconds, tag #ad and the brand, keep posts live for at least 7 days. No competitor products in frame.';
  const label = TYPE_LABEL[setup.campaignType];
  let title: string;
  let briefMd: string;
  if (setup.campaignType === 'per_sale') {
    title = `${name}: earn per sale`;
    briefMd = `Show ${name} in your everyday routine and share your personal voucher code in the caption and pinned comment. You earn ${setup.perSaleUsdc} USDC for every confirmed sale. Mention one real benefit you noticed. Tag #ad. No medical or "guaranteed results" claims.`;
  } else {
    const n = setup.slots.length;
    const ugc = setup.slots.every((s) => s.kind === 'ugc');
    const noun = ugc ? 'UGC video' : 'TikTok post';
    const count = `${WORDS[n - 1] ?? n} ${noun}${n === 1 ? '' : 's'}`;
    const ideas = ['unboxing and first impressions', 'how you use it day to day', 'a quick before and after', 'honest results'];
    const plan = setup.slots
      .map((s, i) => {
        const idea = n === 1 ? 'show it in use and share an honest first impression' : i === n - 1 ? ideas[3] : ideas[Math.min(i, 2)];
        return `${ugc ? 'Video' : 'Post'} ${i + 1} (by day ${s.dueDays}): ${idea}.`;
      })
      .join(' ');
    title = `${name}: ${n} ${noun}${n === 1 ? '' : 's'}`;
    briefMd = ugc
      ? `${count} featuring ${name} for the brand to use in its own ads. ${plan} Vertical 9:16, good light, clear audio. No competitor products in frame.`
      : `${count} featuring ${name}. ${plan} ${rules}`;
  }
  return {
    title,
    briefMd,
    campaignType: setup.campaignType,
    slots: setup.campaignType === 'per_sale' ? [] : setup.slots,
    perSaleUsdc: setup.campaignType === 'per_sale' ? setup.perSaleUsdc : 0,
    suggestedCreators: Math.min(50, Math.max(1, setup.maxCreators)),
    rationale: `Rewritten for your setup: ${label}, up to ${setup.maxCreators} creator${setup.maxCreators === 1 ? '' : 's'}.`,
  };
}
