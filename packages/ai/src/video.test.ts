import { describe, expect, it } from 'vitest';
import { MockProvider } from './mock.js';
import { generateHooks, templateHooks, tidySegments, transcribeCaptions } from './video.js';

describe('hooks', () => {
  it('templates give three hooks per language', () => {
    for (const language of ['en', 'ms', 'id'] as const) {
      expect(templateHooks({ brief: '', product: 'Glow Lab Serum', language }).hooks).toHaveLength(3);
    }
  });

  it('model output is schema-checked', async () => {
    const ai = new MockProvider({ 'Write three different': { hooks: ['a hook', 'b hook', 'c hook'] } });
    expect((await generateHooks(ai, { brief: 'b', product: 'p', language: 'en' })).hooks[2]).toBe('c hook');
  });
});

describe('captions from speech', () => {
  it('clamps to the audio, drops overlaps and empties', () => {
    const out = tidySegments(
      [
        { startMs: 1200, endMs: 2500, text: 'second line' },
        { startMs: 0, endMs: 1500, text: 'first line' },
        { startMs: 2600, endMs: 9999, text: 'runs past the end' },
        { startMs: 2700, endMs: 2750, text: '  ' },
      ],
      4000,
    );
    expect(out).toEqual([
      { startMs: 0, endMs: 1500, text: 'first line' },
      { startMs: 1500, endMs: 2500, text: 'second line' },
      { startMs: 2600, endMs: 4000, text: 'runs past the end' },
    ]);
  });

  it('passes audio through the provider', async () => {
    const ai = new MockProvider({ 'Transcribe the speech': { segments: [{ startMs: 0, endMs: 900, text: 'hi guys' }] } });
    const out = await transcribeCaptions(ai, { mimeType: 'audio/mp4', data: new Uint8Array([1, 2]), durationMs: 2000 });
    expect(out.segments).toEqual([{ startMs: 0, endMs: 900, text: 'hi guys' }]);
  });
});
