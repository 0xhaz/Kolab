import { afterEach, describe, expect, it, vi } from 'vitest';
import { FUNDING_SOURCES } from '@kolab/shared';
import type { Env } from '../config/env.js';
import { AuroraClient, EXECUTION_STATUS, SWAP_FUNDING_STATUS, SWAP_STATUS, simulatedCashoutQuote, simulatedDepositAddress, simulatedQuote } from './aurora.client.js';

describe('funding simulation', () => {
  it('gives each chain an address in its own format, stable per brand + campaign', () => {
    expect(simulatedDepositAddress('base', 'a')).toMatch(/^0x[0-9a-f]{40}$/);
    expect(simulatedDepositAddress('tron', 'a')).toMatch(/^T[1-9A-Za-z]{30,}$/);
    expect(simulatedDepositAddress('btc', 'a')).toMatch(/^bc1q/);
    expect(simulatedDepositAddress('sol', 'a')).toBe(simulatedDepositAddress('sol', 'a'));
    expect(simulatedDepositAddress('sol', 'a')).not.toBe(simulatedDepositAddress('sol', 'b'));
    for (const s of FUNDING_SOURCES) expect(simulatedDepositAddress(s.chain, 'x').length).toBeGreaterThan(20);
  });

  it('quotes the source amount including the integrator fee and route cost', () => {
    const q = simulatedQuote('tron', 'USDT', 100, 50);
    expect(q.amountIn).toBe('100.75');
    expect(q.amountInUsd).toBe(100.75);
    expect(Number(simulatedQuote('eth', 'ETH', 3_200, 0).amountIn)).toBeCloseTo(1.0025, 6);
  });

  it('maps every Aurora execution status onto the funding timeline', () => {
    expect(EXECUTION_STATUS.SUCCESS).toBe('completed');
    expect(EXECUTION_STATUS.DEPOSIT_FAILED).toBe('refunded');
    expect(EXECUTION_STATUS.OPERATION_PROCESSING).toBe('funding_escrow');
  });
});

describe('cash-out simulation', () => {
  it('deducts the integrator fee and route cost from what arrives', () => {
    const q = simulatedCashoutQuote('tron', 'USDT', 100, 50);
    expect(q.amountOut).toBe('99.25');
    expect(q.amountOutUsd).toBe(99.25);
  });

  it('maps Swap API statuses onto the cash-out timeline', () => {
    expect(SWAP_STATUS.PROCESSING).toBe('swapping');
    expect(SWAP_STATUS.SUCCESS).toBe('completed');
    expect(SWAP_STATUS.REFUNDED).toBe('refunded');
  });
});

describe('Aurora Swap API client (hybrid / mainnet)', () => {
  const env = { AURORA_API_KEY: 'k', AURORA_API_URL: 'https://intents-api.aurora.dev', AURORA_CONNECT_URL: 'https://c' } as Env;
  const tokens = [
    { assetId: 'nep141:sol-usdc', blockchain: 'sol', symbol: 'USDC', decimals: 6, price: 1 },
    { assetId: 'nep245:ton-native', blockchain: 'ton', symbol: 'GRAM', decimals: 9, price: 5 },
    { assetId: 'nep141:wrap.near', blockchain: 'near', symbol: 'wNEAR', decimals: 24, price: 3 },
  ];
  afterEach(() => vi.unstubAllGlobals());

  it('reads the { tokens } envelope and resolves native TON and NEAR through their aliases', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ tokens, asset_stats: [] })));
    vi.stubGlobal('fetch', fetchMock);
    const aurora = new AuroraClient(env);
    expect((await aurora.asset('sol', 'USDC')).assetId).toBe('nep141:sol-usdc');
    expect((await aurora.asset('ton', 'TON')).assetId).toBe('nep245:ton-native');
    expect((await aurora.asset('near', 'NEAR')).assetId).toBe('nep141:wrap.near');
    expect(fetchMock).toHaveBeenCalledTimes(1); // cached
    expect(fetchMock.mock.calls[0]![0]).toBe('https://intents-api.aurora.dev/api/tokens/k');
  });

  it('sends a fully specified quote request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ quote: { amountIn: '1', amountOut: '1', timeEstimate: 30 } })));
    vi.stubGlobal('fetch', fetchMock);
    await new AuroraClient(env).quote({ dry: true, swapType: 'EXACT_OUTPUT', originAsset: 'a', destinationAsset: 'b', amount: '5000000', recipient: 'r', refundTo: 'f', deadline: 'd' });
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe('https://intents-api.aurora.dev/api/quote/k');
    expect(JSON.parse(String(init.body))).toMatchObject({
      dry: true,
      swapType: 'EXACT_OUTPUT',
      depositType: 'ORIGIN_CHAIN',
      refundType: 'ORIGIN_CHAIN',
      recipientType: 'DESTINATION_CHAIN',
      slippageTolerance: 100,
    });
  });

  it('hands a successful swap to the relay top-up instead of completing it', () => {
    expect(SWAP_FUNDING_STATUS.SUCCESS).toBe('funding_escrow');
    expect(SWAP_FUNDING_STATUS.KNOWN_DEPOSIT_TX).toBe('deposit_detected');
    expect(SWAP_FUNDING_STATUS.REFUNDED).toBe('refunded');
  });
});
