import { describe, expect, it } from 'vitest';
import { enforceRequired, generateCaption, templateCaption } from './caption.js';
import { MockProvider } from './mock.js';

const base = {
  brief: 'Morning routine with the serum',
  product: 'Glow Lab serum',
  brandTag: '#GlowLabMY',
  disclosure: '#ad',
  voucher: null,
  language: 'en' as const,
  vibe: 'casual' as const,
};

describe('caption builder', () => {
  it('template captions always carry the required tags', () => {
    for (const language of ['en', 'ms', 'id'] as const) {
      const c = templateCaption({ ...base, language, voucher: 'KOLAB-ABC123' });
      expect(c.caption).toContain('#ad');
      expect(c.caption).toContain('#GlowLabMY');
      expect(c.caption).toContain('KOLAB-ABC123');
    }
  });

  it('adds tags a model forgot', async () => {
    const ai = new MockProvider({ 'Write caption': { caption: 'Loving this serum so much right now', hook: 'Wait for it' } });
    const c = await generateCaption(ai, base);
    expect(c.caption).toMatch(/#ad/);
    expect(c.caption).toMatch(/#GlowLabMY/);
  });

  it('does not duplicate tags already present', () => {
    expect(enforceRequired('So good #ad #glowlabmy', base)).toBe('So good #ad #glowlabmy');
  });
});
