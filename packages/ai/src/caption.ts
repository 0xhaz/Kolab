import { z } from 'zod';
import type { AiProvider } from './provider.js';

export const CaptionSchema = z.object({
  caption: z.string().min(10).max(2200),
  hook: z.string().max(120),
});
export type Caption = z.infer<typeof CaptionSchema>;

export interface CaptionInput {
  brief: string;
  product: string;
  brandTag: string;
  disclosure: string;
  voucher: string | null;
  language: 'en' | 'ms' | 'id';
  vibe: 'casual' | 'honest review' | 'tutorial' | 'hype';
  notes?: string;
}

const LANG = { en: 'English', ms: 'Bahasa Malaysia (casual Malaysian social style)', id: 'Bahasa Indonesia (casual)' } as const;

const SYSTEM = `Write caption for a micro-creator's TikTok post for a paid brand campaign.
Sound like a real person, not an ad: short lines, one or two emoji at most, no "guaranteed results" or medical claims.
Always include the disclosure tag, the brand hashtag and (if given) the voucher code exactly as provided.
Also return a 3-second opening hook line the creator can say on camera. Return JSON only.`;

/** Model output is never trusted to include the required tags: they are appended if missing. */
export function enforceRequired(caption: string, input: Pick<CaptionInput, 'disclosure' | 'brandTag' | 'voucher'>): string {
  let out = caption.trim();
  const missing = [input.disclosure, input.brandTag].filter((t) => !out.toLowerCase().includes(t.toLowerCase()));
  if (input.voucher && !out.includes(input.voucher)) out += `\nCode: ${input.voucher}`;
  if (missing.length) out += `\n${missing.join(' ')}`;
  return out.slice(0, 2200);
}

export async function generateCaption(ai: AiProvider, input: CaptionInput): Promise<Caption> {
  const prompt = [
    `Language: ${LANG[input.language]}`,
    `Tone: ${input.vibe}`,
    `Product: ${input.product}`,
    `Brief: ${input.brief.slice(0, 1500)}`,
    `Disclosure tag: ${input.disclosure}`,
    `Brand hashtag: ${input.brandTag}`,
    input.voucher ? `Voucher code: ${input.voucher}` : '',
    input.notes ? `Creator's notes: ${input.notes}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  const out = await ai.complete({ schema: CaptionSchema, system: SYSTEM, prompt });
  return { ...out, caption: enforceRequired(out.caption, input) };
}

const TEMPLATES = {
  en: {
    casual: (p: string) => [`Okay I didn’t expect to like ${p} this much 😅`, `Been using it every morning and my skin actually looks brighter.`],
    'honest review': (p: string) => [`Honest review: ${p}, two weeks in.`, `What I liked, what I didn’t, and whether I’d buy it again 👇`],
    tutorial: (p: string) => [`How I use ${p} in my morning routine:`, `1. Cleanse  2. Two drops  3. Moisturiser + SPF`],
    hype: (p: string) => [`${p} is my new favourite thing ✨`, `If you’ve been on the fence, this is your sign.`],
  },
  ms: {
    casual: (p: string) => [`Tak sangka suka gila dengan ${p} 😅`, `Pakai setiap pagi, kulit nampak lebih cerah.`],
    'honest review': (p: string) => [`Review jujur: ${p} lepas 2 minggu.`, `Apa yang best, apa yang kurang, dan beli lagi ke tak 👇`],
    tutorial: (p: string) => [`Cara saya guna ${p} waktu pagi:`, `1. Cuci muka  2. Dua titik  3. Pelembap + SPF`],
    hype: (p: string) => [`${p} memang favourite baru saya ✨`, `Kalau tengah fikir nak cuba, ni tanda dia.`],
  },
  id: {
    casual: (p: string) => [`Nggak nyangka bakal suka banget sama ${p} 😅`, `Dipakai tiap pagi, kulit kelihatan lebih cerah.`],
    'honest review': (p: string) => [`Review jujur: ${p} setelah 2 minggu.`, `Yang aku suka, yang kurang, dan bakal beli lagi atau nggak 👇`],
    tutorial: (p: string) => [`Cara aku pakai ${p} di rutinitas pagi:`, `1. Cuci muka  2. Dua tetes  3. Pelembap + SPF`],
    hype: (p: string) => [`${p} jadi favorit baruku ✨`, `Kalau masih ragu, ini tandanya.`],
  },
} as const;

/** Offline caption when no model is configured. */
export function templateCaption(input: CaptionInput): Caption {
  const lines: string[] = TEMPLATES[input.language][input.vibe](input.product);
  const hook = lines[0] ?? input.product;
  const body = lines[1] ?? '';
  const caption = enforceRequired(`${hook}\n${body}`, input);
  return { caption, hook };
}
