import { describe, expect, it } from 'vitest';
import { address, getBase64Decoder } from '@solana/kit';
import {
  KOLAB_PROGRAM_ADDRESS,
  findCampaignPda,
  getReleasedEventEncoder,
  parseKolabEventLogs,
} from './index.js';

const slot = address('9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin');

function releasedLog() {
  const bytes = getReleasedEventEncoder().encode({
    slot,
    creatorAmount: 66_500_000n,
    fee: 3_500_000n,
    holdback: 30_000_000n,
    auto: true,
  });
  return `Program data: ${getBase64Decoder().decode(bytes)}`;
}

describe('parseKolabEventLogs', () => {
  it('decodes events emitted by the Kolab program', () => {
    const logs = [
      `Program ${KOLAB_PROGRAM_ADDRESS} invoke [1]`,
      'Program log: Instruction: AutoRelease',
      `Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA invoke [2]`,
      `Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA success`,
      releasedLog(),
      `Program ${KOLAB_PROGRAM_ADDRESS} success`,
    ];
    const events = parseKolabEventLogs(logs);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ name: 'Released', data: { slot, fee: 3_500_000n, auto: true } });
  });

  it('ignores identical payloads emitted by another program', () => {
    const forger = 'Forger1111111111111111111111111111111111111';
    const logs = [`Program ${forger} invoke [1]`, releasedLog(), `Program ${forger} success`];
    expect(parseKolabEventLogs(logs)).toEqual([]);
  });
});

describe('findCampaignPda', () => {
  it('is deterministic per brand + id', async () => {
    const brand = address('6KWUdgA3ddNFX6xSMm9HAGBn68aKZtMu5gyJDMS8pM1M');
    const [a] = await findCampaignPda({ brand, campaignId: 1n });
    const [b] = await findCampaignPda({ brand, campaignId: 1 });
    const [c] = await findCampaignPda({ brand, campaignId: 2n });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});
