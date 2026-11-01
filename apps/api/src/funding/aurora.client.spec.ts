import { describe, expect, it } from 'vitest';
import { FUNDING_SOURCES } from '@kolab/shared';
import { EXECUTION_STATUS, SWAP_STATUS, simulatedCashoutQuote, simulatedDepositAddress, simulatedQuote } from './aurora.client.js';

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
