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

describe('generateBrief', () => {
  it('validates the model output against the schema', async () => {
    const ai = new MockProvider({ 'Draft campaign brief': templateBrief(input) });
    await expect(generateBrief(ai, input)).resolves.toMatchObject({ campaignType: 'monthly' });
  });
});
