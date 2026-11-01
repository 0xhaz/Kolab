import { z } from 'zod';
import type { AiProvider } from './provider.js';

// ---------------------------------------------------------------- hooks

export const HooksSchema = z.object({ hooks: z.array(z.string().min(3).max(90)).min(3).max(3) });
export type Hooks = z.infer<typeof HooksSchema>;

export interface HooksInput {
  brief: string;
  product: string;
  language: 'en' | 'ms' | 'id';
}

const HOOK_LANG = { en: 'English', ms: 'Bahasa Malaysia (casual)', id: 'Bahasa Indonesia (casual)' } as const;

const HOOKS_SYSTEM = `Write three different on-screen opening hooks for a micro-creator's short video (TikTok/Reels) in a paid brand campaign.
Each hook is shown as big text in the first 3 seconds: max 8 words, curiosity or relatability, no medical or "guaranteed" claims, no hashtags.
Vary the angle: one question, one bold statement, one personal "POV"/story. Return JSON only.`;

export async function generateHooks(ai: AiProvider, input: HooksInput): Promise<Hooks> {
  const prompt = [`Language: ${HOOK_LANG[input.language]}`, `Product: ${input.product}`, `Brief: ${input.brief.slice(0, 1200)}`].join('\n');
  return ai.complete({ schema: HooksSchema, system: HOOKS_SYSTEM, prompt });
}

const HOOK_TEMPLATES = {
  en: (p: string) => [`Is ${p} actually worth it?`, `I didn’t expect this from ${p}`, `POV: you finally found your holy grail`],
  ms: (p: string) => [`${p} ni berbaloi ke?`, `Tak sangka ${p} macam ni`, `POV: akhirnya jumpa yang ngam`],
  id: (p: string) => [`${p} worth it nggak sih?`, `Nggak nyangka ${p} sebagus ini`, `POV: akhirnya nemu yang cocok`],
} as const;

/** Offline hooks when no model is configured. */
export function templateHooks(input: HooksInput): Hooks {
  return { hooks: HOOK_TEMPLATES[input.language](input.product.slice(0, 40)) };
}

// ---------------------------------------------------------------- transcript → captions

export const TranscriptSchema = z.object({
  segments: z
    .array(
      z.object({
        startMs: z.number().int().min(0),
        endMs: z.number().int().min(0),
        text: z.string().min(1).max(120),
      }),
    )
    .max(200),
});
export type Transcript = z.infer<typeof TranscriptSchema>;

const TRANSCRIBE_SYSTEM = `Transcribe the speech in this short social-video audio into on-screen caption segments.
Each segment: 2 to 7 words, matching when they are spoken (startMs/endMs from the start of the audio, in milliseconds).
Keep the speaker's language and slang; fix obvious filler ("um", "uh"). If there is no speech, return an empty list. Return JSON only.`;

/**
 * Speech → timed caption segments. Model timestamps are clamped to the audio length and made
 * non-overlapping, since they are burned into the video as-is.
 */
export async function transcribeCaptions(ai: AiProvider, audio: { mimeType: string; data: Uint8Array; durationMs: number }): Promise<Transcript> {
  const out = await ai.complete({
    schema: TranscriptSchema,
    system: TRANSCRIBE_SYSTEM,
    prompt: `Audio length: ${Math.round(audio.durationMs)} ms.`,
    media: { mimeType: audio.mimeType, data: audio.data },
  });
  return { segments: tidySegments(out.segments, audio.durationMs) };
}

export function tidySegments(segments: Transcript['segments'], durationMs: number): Transcript['segments'] {
  const sorted = [...segments].sort((a, b) => a.startMs - b.startMs);
  const out: Transcript['segments'] = [];
  for (const s of sorted) {
    const start = Math.max(0, Math.min(s.startMs, durationMs), out.at(-1)?.endMs ?? 0);
    const end = Math.min(Math.max(s.endMs, start + 400), durationMs);
    if (end - start >= 200 && s.text.trim()) out.push({ startMs: start, endMs: end, text: s.text.trim() });
  }
  return out;
}
