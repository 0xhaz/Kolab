import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { address } from '@solana/kit';
import { findAssociatedTokenPda, getCreateAssociatedTokenIdempotentInstructionAsync, getMintToCheckedInstruction, TOKEN_PROGRAM_ADDRESS } from '@solana-program/token';
import { fetchMaybeCampaign, getTopUpCampaignInstruction, TOP_UP_CAMPAIGN_DISCRIMINATOR } from '@kolab/sdk';
import { CreateFundingSchema, fromBaseUnits, toBaseUnits, type CreateFunding, type FundingDto, type FundingQuoteDto, type FundingStatus } from '@kolab/shared';
import { ENV, type Env } from '../config/env.js';
import type { FundingIntent, User } from '../generated/prisma/client.js';
import { IndexerService } from '../indexer/indexer.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { ProgramService } from '../solana/program.service.js';
import { SolanaService } from '../solana/solana.service.js';
import { TxService } from '../tx/tx.service.js';
import { CampaignsService } from '../campaigns/campaigns.service.js';
import { AuroraClient, EXECUTION_STATUS, simulatedDepositAddress, simulatedQuote, type SolanaStep } from './aurora.client.js';

const TERMINAL: FundingStatus[] = ['completed', 'failed', 'refunded', 'expired'];
const SIM_EXPIRY_MS = 30 * 60_000;
const SIM_STEP_MS = 2_500;
const POLL_MS = 15_000;

export function toFundingDto(f: FundingIntent): FundingDto {
  return {
    id: f.id,
    campaignId: f.campaignId,
    mode: f.mode as FundingDto['mode'],
    sourceChain: f.sourceChain as FundingDto['sourceChain'],
    sourceAsset: f.sourceAsset,
    amountIn: f.amountIn,
    amountInUsd: f.amountInUsd,
    amountOut: f.amountOut.toString(),
    appFeeBps: f.appFeeBps,
    estimatedSecs: f.estimatedSecs,
    status: f.status as FundingStatus,
    depositAddress: f.depositAddress,
    depositMemo: f.depositMemo,
    refundAddress: f.refundAddress,
    escrowTx: f.escrowTx,
    failureReason: f.failureReason,
    createdAt: f.createdAt.toISOString(),
    updatedAt: f.updatedAt.toISOString(),
    expiresAt: f.expiresAt.toISOString(),
  };
}

/**
 * "Fund from any chain": the brand pays with whatever it holds (USDT on Tron, ETH on Base, BTC…),
 * Aurora Intents swaps it into USDC on Solana and its intermediary calls `top_up_campaign`, so the
 * deposit and the escrow funding are one flow. On devnet the same timeline is simulated and the
 * demo admin plays the intermediary (mints the "bridged" test USDC and tops up the real escrow).
 */
@Injectable()
export class FundingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FundingService.name);
  private poller: NodeJS.Timeout | null = null;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly campaigns: CampaignsService,
    private readonly solana: SolanaService,
    private readonly program: ProgramService,
    private readonly tx: TxService,
    private readonly indexer: IndexerService,
    private readonly realtime: RealtimeGateway,
    private readonly aurora: AuroraClient,
  ) {}

  get mode() {
    return this.env.AURORA_MODE;
  }

  onModuleInit() {
    if (this.env.WORKERS_ENABLED) this.poller = setInterval(() => void this.poll(), POLL_MS);
  }

  onModuleDestroy() {
    if (this.poller) clearInterval(this.poller);
  }

  config() {
    return { mode: this.mode, appFeeBps: this.env.AURORA_APP_FEE_BPS, simulateDeposits: this.mode === 'simulated' && this.env.DEMO_MODE };
  }

  /** The escrow has to exist on-chain before anyone (here: Aurora's intermediary) can top it up. */
  private async onchainCampaign(brand: User, campaignId: string) {
    const c = await this.campaigns.ownedBy(brand, campaignId);
    const account = c.onchainPubkey ? await fetchMaybeCampaign(this.solana.rpc, address(c.onchainPubkey)) : null;
    if (!account?.exists) throw new ConflictException({ code: 'campaign_not_on_chain' });
    if (c.status === 'closed') throw new ConflictException({ code: 'campaign_closed' });
    return c;
  }

  async quote(brand: User, campaignId: string, raw: CreateFunding): Promise<FundingQuoteDto> {
    const input = CreateFundingSchema.parse(raw);
    await this.campaigns.ownedBy(brand, campaignId);
    const amountOut = toBaseUnits(input.amountUsdc);
    if (this.mode === 'aurora') {
      const exec = await this.auroraExecution(brand, campaignId, input, true);
      return {
        sourceChain: input.sourceChain,
        sourceAsset: input.sourceAsset,
        amountIn: exec.quote?.amountIn ?? '0',
        amountInUsd: Number(exec.quote?.amountInUsd ?? 0),
        amountOut: amountOut.toString(),
        appFeeBps: this.env.AURORA_APP_FEE_BPS,
        estimatedSecs: exec.details?.estimatedTime ?? 120,
        mode: 'aurora',
      };
    }
    const q = simulatedQuote(input.sourceChain, input.sourceAsset, input.amountUsdc, this.env.AURORA_APP_FEE_BPS);
    return { ...q, sourceChain: input.sourceChain, sourceAsset: input.sourceAsset, amountOut: amountOut.toString(), appFeeBps: this.env.AURORA_APP_FEE_BPS, mode: 'simulated' };
  }

  async create(brand: User, campaignId: string, raw: CreateFunding): Promise<FundingDto> {
    const input = CreateFundingSchema.parse(raw);
    const c = await this.onchainCampaign(brand, campaignId);
    if (this.mode === 'aurora' && !input.refundAddress) throw new BadRequestException({ code: 'refund_address_required' });

    const base = {
      campaignId: c.id,
      brandId: brand.id,
      mode: this.mode,
      sourceChain: input.sourceChain,
      sourceAsset: input.sourceAsset,
      amountOut: toBaseUnits(input.amountUsdc),
      appFeeBps: this.env.AURORA_APP_FEE_BPS,
      refundAddress: input.refundAddress || null,
    };
    let row: FundingIntent;
    if (this.mode === 'aurora') {
      const exec = await this.auroraExecution(brand, campaignId, input, false);
      if (!exec.quote?.depositAddress) throw new ConflictException({ code: 'aurora_no_deposit_address' });
      row = await this.prisma.fundingIntent.create({
        data: {
          ...base,
          amountIn: exec.quote.amountIn ?? '0',
          amountInUsd: Number(exec.quote.amountInUsd ?? 0),
          estimatedSecs: exec.details?.estimatedTime ?? 120,
          depositAddress: exec.quote.depositAddress,
          depositMemo: exec.quote.depositMemo ?? null,
          executionId: exec.id,
          status: EXECUTION_STATUS[exec.status],
          expiresAt: exec.quote.deadline ? new Date(exec.quote.deadline) : new Date(Date.now() + SIM_EXPIRY_MS),
        },
      });
    } else {
      const q = simulatedQuote(input.sourceChain, input.sourceAsset, input.amountUsdc, this.env.AURORA_APP_FEE_BPS);
      row = await this.prisma.fundingIntent.create({
        data: {
          ...base,
          ...q,
          depositAddress: simulatedDepositAddress(input.sourceChain, `${brand.id}:${c.id}`),
          expiresAt: new Date(Date.now() + SIM_EXPIRY_MS),
        },
      });
    }
    return toFundingDto(row);
  }

  async list(brand: User, campaignId: string) {
    await this.campaigns.ownedBy(brand, campaignId);
    const rows = await this.prisma.fundingIntent.findMany({ where: { campaignId }, orderBy: { createdAt: 'desc' }, take: 20 });
    return rows.map(toFundingDto);
  }

  async get(brand: User, id: string) {
    const row = await this.prisma.fundingIntent.findUnique({ where: { id } });
    if (!row || row.brandId !== brand.id) throw new NotFoundException({ code: 'funding_not_found' });
    return toFundingDto(row);
  }

  /**
   * Devnet only: pretend the brand's cross-chain deposit arrived, then walk the same timeline Aurora
   * reports (detected → swapping → executing) and really top up the escrow on devnet.
   */
  async simulateDeposit(brand: User, id: string) {
    if (this.mode !== 'simulated' || !this.env.DEMO_MODE) throw new ConflictException({ code: 'simulation_disabled' });
    const row = await this.prisma.fundingIntent.findUnique({ where: { id } });
    if (!row || row.brandId !== brand.id) throw new NotFoundException({ code: 'funding_not_found' });
    if (row.status !== 'awaiting_deposit') throw new ConflictException({ code: 'funding_not_awaiting_deposit' });
    const dto = await this.setStatus(row, 'deposit_detected');
    void this.runSimulation(row.id);
    return dto;
  }

  private async runSimulation(id: string) {
    const wait = () => new Promise((r) => setTimeout(r, SIM_STEP_MS));
    try {
      await wait();
      let row = await this.prisma.fundingIntent.findUniqueOrThrow({ where: { id } });
      await this.setStatus(row, 'swapping');
      await wait();
      row = await this.prisma.fundingIntent.findUniqueOrThrow({ where: { id } });
      await this.setStatus(row, 'funding_escrow');
      const sig = await this.simulatedIntermediaryTopUp(row);
      row = await this.prisma.fundingIntent.findUniqueOrThrow({ where: { id } });
      await this.setStatus(row, 'completed', { escrowTx: sig });
    } catch (err) {
      this.logger.error({ err, id }, 'simulated funding failed');
      const row = await this.prisma.fundingIntent.findUnique({ where: { id } });
      if (row) await this.setStatus(row, 'failed', { failureReason: err instanceof Error ? err.message : 'Simulation failed' });
    }
  }

  /** Stand-in for Aurora's intermediary: receive the "bridged" USDC, then top_up_campaign. */
  private async simulatedIntermediaryTopUp(row: FundingIntent) {
    const intermediary = this.program.demoAdmin;
    if (!intermediary) throw new Error('Demo admin key missing');
    const c = await this.prisma.campaign.findUniqueOrThrow({ where: { id: row.campaignId } });
    const mint = this.program.usdcMint;
    const [funderToken] = await findAssociatedTokenPda({ owner: intermediary.address, mint, tokenProgram: TOKEN_PROGRAM_ADDRESS });
    const [vault] = await findAssociatedTokenPda({ owner: address(c.onchainPubkey!), mint, tokenProgram: TOKEN_PROGRAM_ADDRESS });
    const sig = await this.tx.sendServer([
      await getCreateAssociatedTokenIdempotentInstructionAsync({ payer: this.solana.sponsor, owner: intermediary.address, mint }),
      getMintToCheckedInstruction({ mint, token: funderToken, mintAuthority: intermediary, amount: row.amountOut, decimals: 6 }),
      getTopUpCampaignInstruction(
        { funder: intermediary, campaign: address(c.onchainPubkey!), mint, vault, funderToken, amount: row.amountOut },
        { programAddress: this.program.programAddress },
      ),
    ]);
    await this.indexer.ingest(sig);
    return sig;
  }

  /** Builds the Intents Connect request whose Solana step is our top_up_campaign. */
  private async auroraExecution(brand: User, campaignId: string, input: CreateFunding, dry: boolean) {
    if (!input.refundAddress) throw new BadRequestException({ code: 'refund_address_required' });
    const c = await this.onchainCampaign(brand, campaignId);
    const [origin, usdc] = await Promise.all([this.aurora.asset(input.sourceChain, input.sourceAsset), this.aurora.asset('sol', 'USDC')]);
    const amount = toBaseUnits(input.amountUsdc).toString();
    const quote = { originAsset: origin.assetId, destinationAsset: usdc.assetId, amount, swapType: 'EXACT_OUTPUT', slippageTolerance: 100, recipient: '{INTERMEDIARY}' };
    const metadata = { app: 'kolab', campaignId: c.id, appFeeBps: this.env.AURORA_APP_FEE_BPS };

    // The step needs the intermediary's USDC account, so learn the intermediary from a dry run first.
    // TODO(mainnet): confirm against the live API (placeholders only cover the intermediary itself).
    const probe = await this.aurora.createExecution(input.refundAddress, { quote, steps: [], dry: true, metadata });
    const intermediary = probe.details?.intermediaryAddress;
    if (!intermediary || dry) return probe;

    // On mainnet USDC_MINT is real USDC, the same token Aurora delivers.
    const mint = this.program.usdcMint;
    const [funderToken] = await findAssociatedTokenPda({ owner: address(intermediary), mint, tokenProgram: TOKEN_PROGRAM_ADDRESS });
    const [vault] = await findAssociatedTokenPda({ owner: address(c.onchainPubkey!), mint, tokenProgram: TOKEN_PROGRAM_ADDRESS });
    const step: SolanaStep = {
      programId: this.program.programAddress,
      accounts: [
        { pubkey: '{INTERMEDIARY}', isSigner: true, isWritable: false },
        { pubkey: c.onchainPubkey!, isSigner: false, isWritable: true },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: vault, isSigner: false, isWritable: true },
        { pubkey: funderToken, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ADDRESS, isSigner: false, isWritable: false },
      ],
      discriminator: Buffer.from(TOP_UP_CAMPAIGN_DISCRIMINATOR).toString('hex'),
      args: [{ name: 'amount', type: 'u64', value: '{MIN_AMOUNT_OUT}' }],
    };
    return this.aurora.createExecution(input.refundAddress, { quote, steps: [step], metadata });
  }

  /** Mainnet: follow Aurora's execution status; everywhere: expire stale unpaid intents. */
  private async poll() {
    try {
      const open = await this.prisma.fundingIntent.findMany({ where: { status: { notIn: TERMINAL } }, take: 50 });
      for (const row of open) {
        if (row.status === 'awaiting_deposit' && row.expiresAt < new Date()) {
          await this.setStatus(row, 'expired');
          continue;
        }
        if (row.mode !== 'aurora' || !row.executionId || !row.refundAddress) continue;
        const exec = await this.aurora.getExecution(row.refundAddress, row.executionId);
        if (exec && EXECUTION_STATUS[exec.status] !== row.status) await this.setStatus(row, EXECUTION_STATUS[exec.status]);
      }
    } catch (err) {
      this.logger.warn({ err }, 'funding poll failed');
    }
  }

  private async setStatus(row: FundingIntent, status: FundingStatus, extra: { escrowTx?: string; failureReason?: string } = {}) {
    const updated = await this.prisma.fundingIntent.update({ where: { id: row.id }, data: { status, ...extra } });
    const dto = toFundingDto(updated);
    this.realtime.emit([`user:${row.brandId}`, `campaign:${row.campaignId}`], 'funding.updated', { campaignId: row.campaignId, funding: dto }, extra.escrowTx);
    this.logger.log({ id: row.id, status, usdc: fromBaseUnits(row.amountOut) }, 'funding status');
    return dto;
  }
}
