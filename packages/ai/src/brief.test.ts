import { describe, expect, it } from 'vitest';
import { BriefSchema, generateBrief, templateBrief } from './brief.js';
import { MockProvider } from './mock.js';

const input = { productText: 'Glow Lab Vitamin C Serum. Brightening serum, 30ml.', budgetUsdc: 120, markets: ['MY', 'ID'] };

describe('templateBrief', () => {
  it('produces a valid monthly brief that fits the budget with the fee on top', () => {
    const b = templateBrief(input);
    expect(BriefSchema.parse(b)).toBeTruthy();
    const perCreator = b.slots.reduce((s, x) => s + x.amountUsdc, 0) * 1.05;
    expect(perCreator * b.suggestedCreators).toBeLessThanOrEqual(120 + 1e-6);
    expect(b.title).toContain('Glow Lab Vitamin C Serum');
  });

  it('switches to per-sale for a sales goal', () => {
    const b = templateBrief({ ...input, goal: 'sales' });
    expect(b.campaignType).toBe('per_sale');
    expect(b.perSaleUsdc).toBeGreaterThan(0);
  });
});

const setup = {
  campaignType: 'per_post' as const,
  slots: [
    { kind: 'post' as const, amountUsdc: 10, dueDays: 7 },
    { kind: 'post' as const, amountUsdc: 10, dueDays: 14 },
  ],
  perSaleUsdc: 0,
  maxCreators: 5,
};

describe('templateBrief with a fixed setup', () => {
  it('writes the brief for the chosen deliverables and keeps the structure', () => {
    const b = templateBrief({ ...input, setup });
    expect(BriefSchema.parse(b)).toBeTruthy();
    expect(b.campaignType).toBe('per_post');
    expect(b.slots).toEqual(setup.slots);
    expect(b.suggestedCreators).toBe(5);
    expect(b.title).toBe('Glow Lab Vitamin C Serum: 2 TikTok posts');
    expect(b.briefMd).toMatch(/^Two TikTok posts/);
    expect(b.briefMd).toContain('Post 2 (by day 14)');
    expect(b.briefMd).not.toMatch(/four|monthly/i);
  });

  it('handles per-sale and UGC setups', () => {
    const sale = templateBrief({ ...input, setup: { ...setup, campaignType: 'per_sale', slots: [], perSaleUsdc: 3 } });
    expect(sale.slots).toEqual([]);
    expect(sale.briefMd).toContain('3 USDC for every confirmed sale');
    const ugc = templateBrief({ ...input, setup: { ...setup, campaignType: 'ugc', slots: [{ kind: 'ugc', amountUsdc: 40, dueDays: 10 }] } });
    expect(ugc.briefMd).toMatch(/^One UGC video/);
  });
});

describe('generateBrief', () => {
  it('keeps the fixed setup even if the model changes it', async () => {
    const ai = new MockProvider({ 'Draft campaign brief': templateBrief(input) });
    const b = await generateBrief(ai, { ...input, setup });
    expect(b.campaignType).toBe('per_post');
    expect(b.slots).toEqual(setup.slots);
    expect(b.suggestedCreators).toBe(5);
  });

  it('validates the model output against the schema', async () => {
    const ai = new MockProvider({ 'Draft campaign brief': templateBrief(input) });
    await expect(generateBrief(ai, input)).resolves.toMatchObject({ campaignType: 'monthly' });
  });
});
