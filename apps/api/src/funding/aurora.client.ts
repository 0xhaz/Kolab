import { BadGatewayException, Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { CashoutStatus, FundingChain, FundingStatus } from '@kolab/shared';
import { ENV, type Env } from '../config/env.js';

/** One instruction for Intents Connect to run on Solana after bridging in (signed by its intermediary). */
export interface SolanaStep {
  programId: string;
  accounts: { pubkey: string; isSigner: boolean; isWritable: boolean }[];
  /** Hex-encoded Anchor discriminator. */
  discriminator: string;
  args: { name: string; type: 'u64' | 'pubkey' | 'bool' | 'u8' | 'bytes' | 'string'; value: string }[];
}

export interface AuroraToken {
  assetId: string;
  decimals: number;
  blockchain: string;
  symbol: string;
  price: number;
}

export interface AuroraExecution {
  id: string;
  status:
    | 'CREATED'
    | 'DEPOSIT_PENDING'
    | 'DEPOSIT_PROCESSING'
    | 'OPERATION_PENDING'
    | 'OPERATION_PROCESSING'
    | 'SUCCESS'
    | 'DEPOSIT_FAILED'
    | 'OPERATION_FAILED'
    | 'EXPIRED';
  details?: { intermediaryAddress?: string; estimatedTime?: number };
  quote?: { amountIn?: string; amountInUsd?: string; amountOut?: string; depositAddress?: string; depositMemo?: string; deadline?: string };
}

export interface SwapQuote {
  /** Absent on dry quotes. */
  depositAddress?: string;
  depositMemo?: string;
  amountIn: string;
  amountInFormatted: string;
  amountInUsd: string;
  minAmountIn?: string;
  amountOut: string;
  amountOutFormatted: string;
  amountOutUsd: string;
  minAmountOut?: string;
  deadline?: string;
  timeEstimate: number;
}

export interface SwapTx {
  hash: string;
  explorerUrl: string;
}

export interface SwapStatusResponse {
  status: SwapStatus;
  updatedAt?: string;
  swapDetails?: {
    amountOut?: string;
    originChainTxHashes?: SwapTx[];
    destinationChainTxHashes?: SwapTx[];
    refundedAmountFormatted?: string;
    refundReason?: string;
  };
}

export type SwapStatus = 'KNOWN_DEPOSIT_TX' | 'PENDING_DEPOSIT' | 'INCOMPLETE_DEPOSIT' | 'PROCESSING' | 'SUCCESS' | 'REFUNDED' | 'FAILED';

/** Aurora lists a few native assets under another symbol (native TON is GRAM, NEAR is wNEAR). */
const SYMBOL_ALIAS: Record<string, string> = { 'ton:TON': 'GRAM', 'near:NEAR': 'wNEAR' };

/** Swap API status → the funding timeline (hybrid mode; SUCCESS hands over to the relay's escrow top-up). */
export const SWAP_FUNDING_STATUS: Record<SwapStatus, FundingStatus> = {
  PENDING_DEPOSIT: 'awaiting_deposit',
  KNOWN_DEPOSIT_TX: 'deposit_detected',
  INCOMPLETE_DEPOSIT: 'deposit_detected',
  PROCESSING: 'swapping',
  SUCCESS: 'funding_escrow',
  REFUNDED: 'refunded',
  FAILED: 'failed',
};

/** Swap API status → the cash-out timeline (once the user's USDC transfer is on-chain). */
export const SWAP_STATUS: Record<SwapStatus, CashoutStatus> = {
  PENDING_DEPOSIT: 'deposit_sent',
  KNOWN_DEPOSIT_TX: 'deposit_sent',
  INCOMPLETE_DEPOSIT: 'failed',
  PROCESSING: 'swapping',
  SUCCESS: 'completed',
  REFUNDED: 'refunded',
  FAILED: 'failed',
};

/** Simulated cash-out: what the recipient gets for `usdc` after the integrator fee and route cost. */
export function simulatedCashoutQuote(chain: FundingChain, asset: string, usdc: number, appFeeBps: number) {
  const usd = usdc * (1 - (appFeeBps + SIM_ROUTE_BPS) / 10_000);
  return { amountOut: (usd / (SIM_PRICE[asset] ?? 1)).toFixed(SIM_DECIMALS[asset] ?? 6), amountOutUsd: Math.round(usd * 100) / 100, estimatedSecs: SIM_SECS[chain] };
}

/** Aurora execution status → the funding timeline the brand sees. */
export const EXECUTION_STATUS: Record<AuroraExecution['status'], FundingStatus> = {
  CREATED: 'awaiting_deposit',
  DEPOSIT_PENDING: 'awaiting_deposit',
  DEPOSIT_PROCESSING: 'deposit_detected',
  OPERATION_PENDING: 'swapping',
  OPERATION_PROCESSING: 'funding_escrow',
  SUCCESS: 'completed',
  DEPOSIT_FAILED: 'refunded',
  OPERATION_FAILED: 'failed',
  EXPIRED: 'expired',
};

// Devnet simulation only: indicative prices, so the quote screen shows realistic numbers.
const SIM_PRICE: Record<string, number> = { USDT: 1, USDC: 1, ETH: 3_200, BNB: 600, SOL: 160, TON: 5.2, BTC: 68_000, NEAR: 3.1 };
const SIM_DECIMALS: Record<string, number> = { USDT: 2, USDC: 2, ETH: 6, BNB: 5, SOL: 4, TON: 3, BTC: 8, NEAR: 3 };
const SIM_SECS: Record<FundingChain, number> = { tron: 60, bsc: 45, eth: 150, base: 40, arb: 40, sol: 30, ton: 60, btc: 1_500, near: 30 };
/** Route cost modelled on top of the integrator fee in simulation. */
const SIM_ROUTE_BPS = 25;

/** Deterministic, clearly fake deposit addresses in each chain's format (simulation only). */
export function simulatedDepositAddress(chain: FundingChain, seed: string): string {
  const hex = createHash('sha256').update(`kolab-sim:${chain}:${seed}`).digest('hex');
  const b58 = Buffer.from(hex, 'hex')
    .toString('base64')
    .replace(/[+/=0OIl]/g, '')
    .slice(0, 40);
  switch (chain) {
    case 'eth':
    case 'base':
    case 'arb':
    case 'bsc':
      return `0x${hex.slice(0, 40)}`;
    case 'tron':
      return `T${b58.slice(0, 33)}`;
    case 'btc':
      return `bc1q${hex.slice(0, 38)}`;
    case 'ton':
      return `UQ${b58.slice(0, 46).padEnd(46, 'A')}`;
    case 'near':
      return `${hex.slice(0, 64)}`;
    case 'sol':
      return b58.slice(0, 44);
  }
}

export function simulatedQuote(chain: FundingChain, asset: string, amountOutUsdc: number, appFeeBps: number) {
  const usd = amountOutUsdc * (1 + (appFeeBps + SIM_ROUTE_BPS) / 10_000);
  const price = SIM_PRICE[asset] ?? 1;
  return {
    amountIn: (usd / price).toFixed(SIM_DECIMALS[asset] ?? 6),
    amountInUsd: Math.round(usd * 100) / 100,
    estimatedSecs: SIM_SECS[chain],
  };
}

/**
 * Thin client for Aurora Intents (NEAR Intents underneath). Aurora is mainnet-only: `hybrid` mode
 * uses the Swap API for real with Kolab's relay wallet, `simulated` uses the helpers above.
 */
@Injectable()
export class AuroraClient {
  private readonly logger = new Logger(AuroraClient.name);
  private tokens: { at: number; list: AuroraToken[] } | null = null;

  constructor(@Inject(ENV) private readonly env: Env) {}

  private key() {
    if (!this.env.AURORA_API_KEY) throw new ServiceUnavailableException({ code: 'aurora_not_configured' });
    return this.env.AURORA_API_KEY;
  }

  private async call<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, {
      ...init,
      headers: { 'content-type': 'application/json', 'x-api-key': this.key(), ...init?.headers },
      signal: AbortSignal.timeout(20_000),
    });
    const body = (await res.json().catch(() => undefined)) as T & { message?: string; error?: string };
    if (!res.ok) {
      this.logger.warn({ url: url.replace(this.key(), '***'), status: res.status, body }, 'aurora request failed');
      throw new BadGatewayException({ code: 'aurora_error', status: res.status, message: body?.message ?? body?.error });
    }
    return body;
  }

  /** Supported tokens, cached for 5 minutes. The API returns `{ tokens, asset_stats }`. */
  async listTokens(): Promise<AuroraToken[]> {
    if (this.tokens && Date.now() - this.tokens.at < 300_000) return this.tokens.list;
    const body = await this.call<{ tokens: AuroraToken[] } | AuroraToken[]>(`${this.env.AURORA_API_URL}/api/tokens/${this.key()}`);
    const list = Array.isArray(body) ? body : body.tokens;
    this.tokens = { at: Date.now(), list };
    return list;
  }

  async asset(chain: string, symbol: string): Promise<AuroraToken> {
    const want = SYMBOL_ALIAS[`${chain}:${symbol}`] ?? symbol;
    const match = (await this.listTokens()).filter((t) => t.blockchain === chain && t.symbol === want);
    if (match.length !== 1) throw new BadGatewayException({ code: 'aurora_asset_unresolved', chain, symbol, matches: match.length });
    return match[0]!;
  }

  /**
   * Bridge-in to Solana followed by our program instructions: the brand deposits on `wallet`'s
   * chain, Aurora swaps into USDC on Solana and its intermediary signs `steps` (top_up_campaign).
   */
  createExecution(wallet: string, body: { quote: Record<string, unknown>; steps: SolanaStep[]; dry?: boolean; metadata?: Record<string, unknown> }) {
    return this.call<{ result: AuroraExecution }>(`${this.env.AURORA_CONNECT_URL}/api/v1/executions/${encodeURIComponent(wallet)}`, {
      method: 'POST',
      body: JSON.stringify({ type: 'solana', ...body }),
    }).then((r) => r.result);
  }

  /**
   * Swap API quote. `dry: true` only prices the route; `dry: false` reserves a deposit address.
   * Both addresses are on real chains (DESTINATION_CHAIN / ORIGIN_CHAIN).
   */
  quote(body: {
    dry: boolean;
    swapType: 'EXACT_INPUT' | 'EXACT_OUTPUT';
    originAsset: string;
    destinationAsset: string;
    amount: string;
    recipient: string;
    refundTo: string;
    deadline: string;
  }): Promise<SwapQuote> {
    return this.call<{ quote: SwapQuote }>(`${this.env.AURORA_API_URL}/api/quote/${this.key()}`, {
      method: 'POST',
      body: JSON.stringify({
        ...body,
        slippageTolerance: 100,
        depositType: 'ORIGIN_CHAIN',
        refundType: 'ORIGIN_CHAIN',
        recipientType: 'DESTINATION_CHAIN',
        // Integrator fee is configured per API key in Aurora's Client Portal (AURORA_APP_FEE_BPS mirrors it).
      }),
    }).then((r) => r.quote);
  }

  /** Optional nudge so Aurora picks up the deposit faster. */
  submitDeposit(txHash: string, depositAddress: string, memo?: string) {
    return this.call(`${this.env.AURORA_API_URL}/api/deposit/submit/${this.key()}`, {
      method: 'POST',
      body: JSON.stringify({ txHash, depositAddress, ...(memo ? { memo } : {}) }),
    });
  }

  swapStatus(depositAddress: string, memo?: string) {
    const q = new URLSearchParams({ depositAddress, ...(memo ? { depositMemo: memo } : {}) });
    return this.call<SwapStatusResponse>(`${this.env.AURORA_API_URL}/api/status/${this.key()}?${q}`);
  }

  getExecution(wallet: string, id: string) {
    return this.call<{ result: AuroraExecution[] }>(
      `${this.env.AURORA_CONNECT_URL}/api/v1/executions/${encodeURIComponent(wallet)}?id=${encodeURIComponent(id)}`,
    ).then((r) => r.result[0] ?? null);
  }
}
