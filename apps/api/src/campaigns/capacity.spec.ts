import { budgetForCreators, creatorsCovered, DEFAULT_FEE_BPS, perCreatorCommitment, toBaseUnits } from '@kolab/shared';

const posts = (n: number, usdc: number) => Array.from({ length: n }, () => ({ amountUsdc: usdc }));

describe('campaign capacity (matches the program per_creator_commitment)', () => {
  it('adds the 5% fee per slot, like the program test enroll_requires_funding_for_the_full_schedule', () => {
    // programs/kolab/tests/campaign.rs: 2 × 100 USDC needs 210 USDC available
    expect(perCreatorCommitment(posts(2, 100))).toBe(toBaseUnits(210));
    expect(DEFAULT_FEE_BPS).toBe(500);
  });

  it('floors the fee on each slot separately', () => {
    // 0.01 USDC = 10_000 base units, fee 500 base units each
    expect(perCreatorCommitment(posts(3, 0.01))).toBe(3n * 10_500n);
    // 0.07 USDC slot: 70_000 + 3_500
    expect(perCreatorCommitment([{ amountUsdc: 0.07 }])).toBe(73_500n);
  });

  it('counts how many creators a budget covers', () => {
    expect(creatorsCovered(1000, posts(2, 50))).toBe(9); // 105 each
    expect(creatorsCovered(1050, posts(2, 50))).toBe(10);
    expect(creatorsCovered(1049.99, posts(2, 50))).toBe(9);
    expect(creatorsCovered(120, posts(4, 10))).toBe(2); // 42 each
    expect(creatorsCovered(210, posts(4, 10))).toBe(5);
    expect(creatorsCovered(50, posts(2, 50))).toBe(0);
  });

  it('returns null when a creator reserves nothing up front (per sale)', () => {
    expect(creatorsCovered(100, [])).toBeNull();
  });

  it('suggests the smallest budget that fills every spot, rounded up to the cent', () => {
    expect(budgetForCreators(posts(2, 50), 10)).toBe(1050);
    expect(budgetForCreators(posts(4, 10), 5)).toBe(210);
    // 3 × (0.07 + 0.0035) = 0.2205 → 0.23
    expect(budgetForCreators([{ amountUsdc: 0.07 }], 3)).toBe(0.23);
    // the suggested budget always covers the requested spots
    for (const [usdc, n] of [[7.33, 3], [19.99, 7], [0.01, 11]] as const) {
      const slots = posts(2, usdc);
      expect(creatorsCovered(budgetForCreators(slots, n), slots)).toBeGreaterThanOrEqual(n);
    }
  });
});
