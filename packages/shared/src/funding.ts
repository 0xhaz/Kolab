import { z } from 'zod';

/**
 * Cross-chain campaign funding (Aurora Intents, powered by NEAR Intents): a brand pays with whatever
 * it holds on another chain and the money lands as USDC in the campaign escrow on Solana.
 * `simulated` mirrors the flow on devnet (Aurora only runs on mainnet); `hybrid` runs the Aurora leg
 * for real on mainnet into Kolab's relay wallet, which tops up the devnet escrow; `aurora` is all mainnet.
 */
export type AuroraMode = 'simulated' | 'hybrid' | 'aurora';
export const FUNDING_SOURCES = [
  { chain: 'tron', label: 'Tron', assets: ['USDT'], color: '#EF4444' },
  { chain: 'bsc', label: 'BNB Chain', assets: ['USDT', 'USDC', 'BNB'], color: '#F59E0B' },
  { chain: 'eth', label: 'Ethereum', assets: ['USDC', 'USDT', 'ETH'], color: '#818CF8' },
  { chain: 'base', label: 'Base', assets: ['USDC', 'ETH'], color: '#3B82F6' },
  { chain: 'arb', label: 'Arbitrum', assets: ['USDC', 'ETH'], color: '#38BDF8' },
  { chain: 'sol', label: 'Solana', assets: ['SOL', 'USDT'], color: '#A78BFA' },
  { chain: 'ton', label: 'TON', assets: ['USDT', 'TON'], color: '#22D3EE' },
  { chain: 'btc', label: 'Bitcoin', assets: ['BTC'], color: '#FB923C' },
  { chain: 'near', label: 'NEAR', assets: ['USDC', 'NEAR'], color: '#34D399' },
] as const;

export type FundingChain = (typeof FUNDING_SOURCES)[number]['chain'];
export const FundingChainSchema = z.enum(FUNDING_SOURCES.map((s) => s.chain) as [FundingChain, ...FundingChain[]]);

export const CreateFundingSchema = z
  .object({
    /** USDC that should land in escrow (the brand pays whatever that costs in the source asset). */
    amountUsdc: z.number().positive().max(1_000_000),
    sourceChain: FundingChainSchema,
    sourceAsset: z.string().min(2).max(10),
    /** Where Aurora refunds if the swap can't complete (required on mainnet). */
    refundAddress: z.string().trim().max(120).optional(),
  })
  .refine((v) => FUNDING_SOURCES.find((s) => s.chain === v.sourceChain)?.assets.some((a) => a === v.sourceAsset), {
    message: 'Unsupported asset for this chain',
    path: ['sourceAsset'],
  });
export type CreateFunding = z.infer<typeof CreateFundingSchema>;

export const FUNDING_STATUSES = [
  'awaiting_deposit',
  'deposit_detected',
  'swapping',
  'funding_escrow',
  'completed',
  'failed',
  'refunded',
  'expired',
] as const;
export type FundingStatus = (typeof FUNDING_STATUSES)[number];

export interface FundingQuoteDto {
  sourceChain: FundingChain;
  sourceAsset: string;
  /** Source asset the brand sends, as a decimal string. */
  amountIn: string;
  amountInUsd: number;
  /** USDC (base units) that lands in escrow. */
  amountOut: string;
  /** Kolab's integrator fee on the cross-chain flow (Aurora shares 60% of it with Kolab). */
  appFeeBps: number;
  estimatedSecs: number;
  mode: AuroraMode;
}

export interface FundingDto extends FundingQuoteDto {
  id: string;
  campaignId: string;
  status: FundingStatus;
  depositAddress: string;
  depositMemo: string | null;
  refundAddress: string | null;
  /** Solana tx that moved the bridged USDC into the escrow vault. */
  escrowTx: string | null;
  /** Aurora: explorer link for the brand's deposit on the source chain. */
  originTxUrl: string | null;
  /** Aurora: explorer link for the USDC delivered on Solana (to Kolab's relay in hybrid mode). */
  bridgeTxUrl: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}
