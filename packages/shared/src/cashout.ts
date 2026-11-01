import { z } from 'zod';
import { FUNDING_SOURCES, FundingChainSchema, type FundingChain } from './funding.js';

/**
 * "Cash out to any chain" (Aurora Intents Swap API): a creator or brand moves USDC from their Kolab
 * wallet on Solana to any supported chain/asset, e.g. USDT on Tron. Same chains as funding.
 */
export const CASHOUT_DESTINATIONS = FUNDING_SOURCES;

/** Format check only (catches paste mistakes); the chain itself is the final judge. */
const ADDRESS: Record<FundingChain, RegExp> = {
  eth: /^0x[0-9a-fA-F]{40}$/,
  base: /^0x[0-9a-fA-F]{40}$/,
  arb: /^0x[0-9a-fA-F]{40}$/,
  bsc: /^0x[0-9a-fA-F]{40}$/,
  tron: /^T[1-9A-HJ-NP-Za-km-z]{33}$/,
  sol: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
  btc: /^(bc1[02-9ac-hj-np-z]{11,71}|[13][1-9A-HJ-NP-Za-km-z]{25,34})$/,
  ton: /^(EQ|UQ|kQ|0Q)[A-Za-z0-9_-]{46}$/,
  near: /^([a-z0-9_-]+\.)*[a-z0-9_-]+\.(near|tg)$|^[0-9a-f]{64}$/,
};

export function isValidAddress(chain: FundingChain, address: string): boolean {
  return ADDRESS[chain].test(address.trim());
}

export const CreateCashoutSchema = z
  .object({
    /** USDC leaving the Kolab wallet (EXACT_INPUT). */
    amountUsdc: z.number().min(1).max(1_000_000),
    destChain: FundingChainSchema,
    destAsset: z.string().min(2).max(10),
    recipient: z.string().trim().min(10).max(120),
  })
  .refine((v) => FUNDING_SOURCES.find((s) => s.chain === v.destChain)?.assets.some((a) => a === v.destAsset), {
    message: 'Unsupported asset for this chain',
    path: ['destAsset'],
  })
  .refine((v) => isValidAddress(v.destChain, v.recipient), { message: 'That doesn’t look like an address on this chain', path: ['recipient'] });
export type CreateCashout = z.infer<typeof CreateCashoutSchema>;

export const CASHOUT_STATUSES = ['awaiting_signature', 'deposit_sent', 'swapping', 'completed', 'refunded', 'failed', 'expired'] as const;
export type CashoutStatus = (typeof CASHOUT_STATUSES)[number];

export interface CashoutQuoteDto {
  destChain: FundingChain;
  destAsset: string;
  /** USDC base units leaving the wallet. */
  amountIn: string;
  /** Destination asset received, as a decimal string. */
  amountOut: string;
  amountOutUsd: number;
  appFeeBps: number;
  estimatedSecs: number;
  mode: 'simulated' | 'aurora';
}

export interface CashoutDto extends CashoutQuoteDto {
  id: string;
  status: CashoutStatus;
  recipient: string;
  depositAddress: string;
  /** Solana tx that sent the USDC to Aurora. */
  depositTx: string | null;
  destinationTx: string | null;
  destinationExplorerUrl: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

export const CashoutSentSchema = z.object({ signature: z.string().min(64).max(100) });
