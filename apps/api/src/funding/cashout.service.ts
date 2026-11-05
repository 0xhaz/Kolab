import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { address, createNoopSigner, signature as toSignature } from '@solana/kit';
import {
  fetchMaybeToken,
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstructionAsync,
  getTransferCheckedInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from '@solana-program/token';
import { CreateCashoutSchema, fromBaseUnits, toBaseUnits, type CashoutDto, type CashoutQuoteDto, type CashoutStatus, type CreateCashout } from '@kolab/shared';
import { ENV, type Env } from '../config/env.js';
import type { Cashout, User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { ProgramService } from '../solana/program.service.js';
import { SolanaService } from '../solana/solana.service.js';
import { TxService } from '../tx/tx.service.js';
import { AuroraClient, SWAP_STATUS, simulatedCashoutQuote } from './aurora.client.js';
import { RelayService } from './relay.service.js';

const TERMINAL: CashoutStatus[] = ['completed', 'refunded', 'failed', 'expired'];
const QUOTE_TTL_MS = 15 * 60_000;
const SIM_STEP_MS = 2_500;
const POLL_MS = 15_000;

export function toCashoutDto(c: Cashout): CashoutDto {
  return {
    id: c.id,
    mode: c.mode as CashoutDto['mode'],
    status: c.status as CashoutStatus,
    destChain: c.destChain as CashoutDto['destChain'],
    destAsset: c.destAsset,
    recipient: c.recipient,
    amountIn: c.amountIn.toString(),
    amountOut: c.amountOut,
    amountOutUsd: c.amountOutUsd,
    appFeeBps: c.appFeeBps,
    estimatedSecs: c.estimatedSecs,
    depositAddress: c.depositAddress,
    depositTx: c.depositTx,
    destinationTx: c.destinationTx,
    destinationExplorerUrl: c.destinationExplorerUrl,
    relayTx: c.relayTx,
    failureReason: c.failureReason,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    expiresAt: c.expiresAt.toISOString(),
  };
}

/**
 * "Cash out to any chain": USDC leaves the user's Kolab wallet (a sponsored transfer they sign) to
 * an Aurora Swap API deposit address, and arrives as the asset they chose on the chain they chose.
 * On devnet the transfer is real but goes to a stand-in account; the swap leg is simulated.
 *
 * Hybrid (PoC): the user's devnet USDC goes to the stand-in account, then Kolab's mainnet relay
 * pays the same amount of real USDC into a real Aurora swap to the user's chosen chain. If Aurora
 * refunds or fails, the relay gets its USDC back and the user gets their devnet USDC back.
 */
@Injectable()
export class CashoutService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CashoutService.name);
  private poller: NodeJS.Timeout | null = null;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly solana: SolanaService,
    private readonly program: ProgramService,
    private readonly tx: TxService,
    private readonly realtime: RealtimeGateway,
    private readonly aurora: AuroraClient,
    private readonly relay: RelayService,
  ) {}

  private get mode() {
    return this.env.AURORA_MODE;
  }

  onModuleInit() {
    if (this.env.WORKERS_ENABLED) this.poller = setInterval(() => void this.poll(), POLL_MS);
  }

  onModuleDestroy() {
    if (this.poller) clearInterval(this.poller);
  }

  private wallet(user: User) {
    if (!user.walletPubkey) throw new ForbiddenException({ code: 'wallet_not_ready' });
    return address(user.walletPubkey);
  }

  private async balance(user: User) {
    const [ata] = await findAssociatedTokenPda({ owner: this.wallet(user), mint: this.program.usdcMint, tokenProgram: TOKEN_PROGRAM_ADDRESS });
    const acc = await fetchMaybeToken(this.solana.rpc, ata);
    return acc.exists ? acc.data.amount : 0n;
  }

  private async auroraQuote(user: User, input: CreateCashout, dry: boolean) {
    const [usdc, dest] = await Promise.all([this.aurora.asset('sol', 'USDC'), this.aurora.asset(input.destChain, input.destAsset)]);
    return this.aurora.quote({
      dry,
      swapType: 'EXACT_INPUT',
      originAsset: usdc.assetId,
      destinationAsset: dest.assetId,
      amount: toBaseUnits(input.amountUsdc).toString(),
      recipient: input.recipient,
      refundTo: this.wallet(user),
      deadline: new Date(Date.now() + QUOTE_TTL_MS).toISOString(),
    });
  }

  /** Hybrid: real Swap API quote from the relay's mainnet USDC to the user's destination. */
  private async hybridQuote(input: CreateCashout, dry: boolean, amount = toBaseUnits(input.amountUsdc)) {
    const [usdc, dest] = await Promise.all([this.aurora.asset('sol', 'USDC'), this.aurora.asset(input.destChain, input.destAsset)]);
    return this.aurora.quote({
      dry,
      swapType: 'EXACT_INPUT',
      originAsset: usdc.assetId,
      destinationAsset: dest.assetId,
      amount: amount.toString(),
      recipient: input.recipient,
      refundTo: this.relay.address,
      deadline: new Date(Date.now() + QUOTE_TTL_MS).toISOString(),
    });
  }

  /** Hybrid pays out real money from the relay for free test USDC, so it is capped per flow and per user per day. */
  private async capHybrid(user: User, amountIn: bigint) {
    const allow = this.env.HYBRID_CASHOUT_ALLOWLIST;
    if (allow.length && !allow.includes((user.email ?? '').toLowerCase())) throw new ForbiddenException({ code: 'hybrid_not_allowed' });
    const max = toBaseUnits(this.env.HYBRID_MAX_USDC);
    if (amountIn > max) throw new BadRequestException({ code: 'hybrid_amount_cap', max: this.env.HYBRID_MAX_USDC });
    const recent = await this.prisma.cashout.aggregate({
      where: { userId: user.id, mode: 'hybrid', createdAt: { gt: new Date(Date.now() - 86_400_000) }, status: { notIn: ['failed', 'refunded', 'expired'] } },
      _sum: { amountIn: true },
    });
    if ((recent._sum.amountIn ?? 0n) + amountIn > max) throw new BadRequestException({ code: 'hybrid_daily_cap', max: this.env.HYBRID_MAX_USDC });
    const { usdc } = await this.relay.balances();
    if (usdc < amountIn) throw new ConflictException({ code: 'relay_insufficient', available: fromBaseUnits(usdc) });
  }

  async quote(user: User, raw: CreateCashout): Promise<CashoutQuoteDto> {
    const input = CreateCashoutSchema.parse(raw);
    const base = { destChain: input.destChain, destAsset: input.destAsset, amountIn: toBaseUnits(input.amountUsdc).toString(), appFeeBps: this.env.AURORA_APP_FEE_BPS };
    if (this.mode === 'hybrid') {
      const allow = this.env.HYBRID_CASHOUT_ALLOWLIST;
      if (allow.length && !allow.includes((user.email ?? '').toLowerCase())) throw new ForbiddenException({ code: 'hybrid_not_allowed' });
      if (input.amountUsdc > this.env.HYBRID_MAX_USDC) throw new BadRequestException({ code: 'hybrid_amount_cap', max: this.env.HYBRID_MAX_USDC });
      const q = await this.hybridQuote(input, true);
      return { ...base, amountOut: q.amountOutFormatted, amountOutUsd: Number(q.amountOutUsd), estimatedSecs: q.timeEstimate, mode: 'hybrid' };
    }
    if (this.mode === 'aurora') {
      const q = await this.auroraQuote(user, input, true);
      return { ...base, amountOut: q.amountOutFormatted, amountOutUsd: Number(q.amountOutUsd), estimatedSecs: q.timeEstimate, mode: 'aurora' };
    }
    return { ...base, ...simulatedCashoutQuote(input.destChain, input.destAsset, input.amountUsdc, this.env.AURORA_APP_FEE_BPS), mode: 'simulated' };
  }

  async create(user: User, raw: CreateCashout): Promise<CashoutDto> {
    const input = CreateCashoutSchema.parse(raw);
    const amountIn = toBaseUnits(input.amountUsdc);
    const have = await this.balance(user);
    if (have < amountIn) throw new BadRequestException({ code: 'insufficient_usdc', needed: amountIn.toString(), have: have.toString() });

    let data: Omit<Cashout, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'depositTx' | 'destinationTx' | 'destinationExplorerUrl' | 'failureReason'>;
    const common = { userId: user.id, mode: this.mode, destChain: input.destChain, destAsset: input.destAsset, recipient: input.recipient, amountIn, appFeeBps: this.env.AURORA_APP_FEE_BPS };
    const bridge = { bridgeDepositAddress: null, bridgeDepositMemo: null, relayTx: null };
    if (this.mode === 'hybrid') {
      await this.capHybrid(user, amountIn);
      const sink = this.program.demoAdmin;
      if (!sink) throw new ConflictException({ code: 'simulation_disabled' });
      const q = await this.hybridQuote(input, true, amountIn);
      data = {
        ...common,
        ...bridge,
        amountOut: q.amountOutFormatted,
        amountOutUsd: Number(q.amountOutUsd),
        estimatedSecs: q.timeEstimate,
        // The user's devnet USDC goes to the stand-in account; the relay pays the real leg on mainnet.
        depositAddress: sink.address,
        depositMemo: null,
        expiresAt: new Date(Date.now() + QUOTE_TTL_MS),
      };
    } else if (this.mode === 'aurora') {
      const q = await this.auroraQuote(user, input, false);
      if (!q.depositAddress) throw new ConflictException({ code: 'aurora_no_deposit_address' });
      data = {
        ...common,
        ...bridge,
        amountOut: q.amountOutFormatted,
        amountOutUsd: Number(q.amountOutUsd),
        estimatedSecs: q.timeEstimate,
        depositAddress: q.depositAddress,
        depositMemo: q.depositMemo ?? null,
        expiresAt: q.deadline ? new Date(q.deadline) : new Date(Date.now() + QUOTE_TTL_MS),
      };
    } else {
      // The demo admin stands in for Aurora's deposit account: the user's USDC really leaves their wallet.
      const sink = this.program.demoAdmin;
      if (!sink || !this.env.DEMO_MODE) throw new ConflictException({ code: 'simulation_disabled' });
      data = {
        ...common,
        ...bridge,
        ...simulatedCashoutQuote(input.destChain, input.destAsset, input.amountUsdc, this.env.AURORA_APP_FEE_BPS),
        depositAddress: sink.address,
        depositMemo: null,
        expiresAt: new Date(Date.now() + QUOTE_TTL_MS),
      };
    }
    return toCashoutDto(await this.prisma.cashout.create({ data }));
  }

  private async mine(user: User, id: string) {
    const row = await this.prisma.cashout.findUnique({ where: { id } });
    if (!row || row.userId !== user.id) throw new NotFoundException({ code: 'cashout_not_found' });
    return row;
  }

  /** Sponsored USDC transfer from the user's wallet to the deposit address (user signs, Kolab pays fees). */
  async buildTx(user: User, id: string) {
    const row = await this.mine(user, id);
    if (row.status !== 'awaiting_signature') throw new ConflictException({ code: 'cashout_already_sent' });
    if (row.expiresAt < new Date()) throw new ConflictException({ code: 'quote_expired' });
    const owner = this.wallet(user);
    const mint = this.program.usdcMint;
    const depositOwner = address(row.depositAddress);
    const [source] = await findAssociatedTokenPda({ owner, mint, tokenProgram: TOKEN_PROGRAM_ADDRESS });
    const [destination] = await findAssociatedTokenPda({ owner: depositOwner, mint, tokenProgram: TOKEN_PROGRAM_ADDRESS });
    const transaction = await this.tx.buildSponsored([
      await getCreateAssociatedTokenIdempotentInstructionAsync({ payer: this.solana.sponsor, owner: depositOwner, mint }),
      getTransferCheckedInstruction({ source, mint, destination, authority: createNoopSigner(owner), amount: row.amountIn, decimals: 6 }),
    ]);
    return { transaction };
  }

  /** The client submitted the transfer; confirm it on-chain, then follow the swap. */
  async sent(user: User, id: string, sig: string): Promise<CashoutDto> {
    const row = await this.mine(user, id);
    if (row.status !== 'awaiting_signature') throw new ConflictException({ code: 'cashout_already_sent' });
    const tx = await this.solana.rpc.getTransaction(toSignature(sig), { commitment: 'confirmed', maxSupportedTransactionVersion: 0, encoding: 'json' }).send();
    if (!tx || tx.meta?.err) throw new BadRequestException({ code: 'deposit_tx_not_confirmed' });
    const [destination] = await findAssociatedTokenPda({ owner: address(row.depositAddress), mint: this.program.usdcMint, tokenProgram: TOKEN_PROGRAM_ADDRESS });
    if (!tx.transaction.message.accountKeys.includes(destination)) throw new BadRequestException({ code: 'deposit_tx_mismatch' });

    if (row.mode === 'hybrid') {
      // Claim the transition so a double submit can't make the relay pay twice.
      const claimed = await this.prisma.cashout.updateMany({ where: { id: row.id, status: 'awaiting_signature' }, data: { status: 'deposit_sent', depositTx: sig } });
      if (claimed.count !== 1) throw new ConflictException({ code: 'cashout_already_sent' });
      const fresh = await this.prisma.cashout.findUniqueOrThrow({ where: { id: row.id } });
      void this.relayOut(fresh);
      return this.publish(fresh, sig);
    }
    const dto = await this.setStatus(row, 'deposit_sent', { depositTx: sig });
    if (row.mode === 'aurora') {
      await this.aurora.submitDeposit(sig, row.depositAddress, row.depositMemo ?? undefined).catch((err) => this.logger.warn({ err }, 'deposit submit failed'));
    } else {
      void this.simulate(row.id);
    }
    return dto;
  }

  private async simulate(id: string) {
    const wait = () => new Promise((r) => setTimeout(r, SIM_STEP_MS));
    await wait();
    await this.setStatus(await this.prisma.cashout.findUniqueOrThrow({ where: { id } }), 'swapping');
    await wait();
    const row = await this.prisma.cashout.findUniqueOrThrow({ where: { id } });
    const fakeHash = `sim-${createHash('sha256').update(`${row.id}:${row.recipient}`).digest('hex').slice(0, 32)}`;
    await this.setStatus(row, 'completed', { destinationTx: fakeHash });
  }

  /** Hybrid: a fresh real quote, then the relay pays mainnet USDC into Aurora's deposit address. */
  private async relayOut(start: Cashout) {
    let row = start;
    try {
      const q = await this.hybridQuote({ amountUsdc: fromBaseUnits(row.amountIn), destChain: row.destChain as CreateCashout['destChain'], destAsset: row.destAsset, recipient: row.recipient }, false, row.amountIn);
      if (!q.depositAddress) throw new Error('Aurora returned no deposit address');
      row = await this.prisma.cashout.update({
        where: { id: row.id },
        data: { bridgeDepositAddress: q.depositAddress, bridgeDepositMemo: q.depositMemo ?? null, amountOut: q.amountOutFormatted, amountOutUsd: Number(q.amountOutUsd), estimatedSecs: q.timeEstimate },
      });
      const sig = await this.relay.sendUsdc(q.depositAddress, row.amountIn);
      row = await this.prisma.cashout.update({ where: { id: row.id }, data: { relayTx: sig } });
      this.publish(row);
      await this.aurora.submitDeposit(sig, q.depositAddress, q.depositMemo).catch((err) => this.logger.warn({ err }, 'deposit submit failed'));
    } catch (err) {
      const code = (err as { response?: { code?: string } }).response?.code;
      if (code === 'relay_tx_confirm_timeout') {
        // The transfer may still land; the poller follows Aurora's status for this deposit address.
        this.logger.warn({ id: row.id }, 'relay transfer unconfirmed; leaving it to the poller');
        return;
      }
      this.logger.error({ err, id: row.id }, 'hybrid cash-out relay failed');
      await this.finish(row, 'failed', { failureReason: `Cash-out couldn’t start on mainnet: ${err instanceof Error ? err.message : 'unknown error'}. Your USDC was returned.` });
    }
  }

  /** Terminal transition (once); hybrid failures also hand the user's devnet USDC back. */
  private async finish(row: Cashout, status: CashoutStatus, extra: Partial<Pick<Cashout, 'destinationTx' | 'destinationExplorerUrl' | 'failureReason'>> = {}) {
    const claimed = await this.prisma.cashout.updateMany({ where: { id: row.id, status: { notIn: TERMINAL } }, data: { status, ...extra } });
    if (claimed.count !== 1) return;
    const updated = await this.prisma.cashout.findUniqueOrThrow({ where: { id: row.id } });
    this.publish(updated);
    if (updated.mode === 'hybrid' && (status === 'failed' || status === 'refunded')) await this.refundDevnet(updated);
  }

  private async refundDevnet(row: Cashout) {
    const sink = this.program.demoAdmin;
    const user = await this.prisma.user.findUnique({ where: { id: row.userId } });
    if (!sink || !user?.walletPubkey) return;
    try {
      const mint = this.program.usdcMint;
      const owner = address(user.walletPubkey);
      const [source] = await findAssociatedTokenPda({ owner: sink.address, mint, tokenProgram: TOKEN_PROGRAM_ADDRESS });
      const [destination] = await findAssociatedTokenPda({ owner, mint, tokenProgram: TOKEN_PROGRAM_ADDRESS });
      await this.tx.sendServer([
        await getCreateAssociatedTokenIdempotentInstructionAsync({ payer: this.solana.sponsor, owner, mint }),
        getTransferCheckedInstruction({ source, mint, destination, authority: sink, amount: row.amountIn, decimals: 6 }),
      ]);
    } catch (err) {
      this.logger.error({ err, id: row.id }, 'hybrid: devnet USDC refund failed');
    }
  }

  list(user: User) {
    return this.prisma.cashout.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 20 }).then((rows) => rows.map(toCashoutDto));
  }

  get(user: User, id: string) {
    return this.mine(user, id).then(toCashoutDto);
  }

  private async poll() {
    try {
      const open = await this.prisma.cashout.findMany({ where: { status: { notIn: TERMINAL } }, take: 50 });
      for (const row of open) {
        if (row.status === 'awaiting_signature') {
          if (row.expiresAt < new Date()) await this.setStatus(row, 'expired');
          continue;
        }
        if (row.mode === 'simulated') continue;
        // Hybrid follows the relay's deposit (none yet means the relay hasn't paid in).
        const deposit = row.mode === 'hybrid' ? row.bridgeDepositAddress : row.depositAddress;
        if (!deposit) continue;
        const memo = (row.mode === 'hybrid' ? row.bridgeDepositMemo : row.depositMemo) ?? undefined;
        const s = await this.aurora.swapStatus(deposit, memo);
        const next = SWAP_STATUS[s.status];
        if (next === row.status) continue;
        const dest = s.swapDetails?.destinationChainTxHashes?.[0];
        const extra = dest ? { destinationTx: dest.hash, destinationExplorerUrl: dest.explorerUrl } : {};
        if (TERMINAL.includes(next)) await this.finish(row, next, { ...extra, ...(s.swapDetails?.refundReason ? { failureReason: s.swapDetails.refundReason } : {}) });
        else await this.setStatus(row, next, extra);
      }
    } catch (err) {
      this.logger.warn({ err }, 'cashout poll failed');
    }
  }

  private async setStatus(row: Cashout, status: CashoutStatus, extra: Partial<Pick<Cashout, 'depositTx' | 'destinationTx' | 'destinationExplorerUrl' | 'failureReason'>> = {}) {
    const updated = await this.prisma.cashout.update({ where: { id: row.id }, data: { status, ...extra } });
    return this.publish(updated, extra.depositTx ?? undefined);
  }

  private publish(row: Cashout, tx?: string) {
    const dto = toCashoutDto(row);
    this.realtime.emit([`user:${row.userId}`], 'cashout.updated', { cashout: dto }, tx);
    this.logger.log({ id: row.id, status: row.status, mode: row.mode, usdc: fromBaseUnits(row.amountIn) }, 'cashout status');
    return dto;
  }
}
