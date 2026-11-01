import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { signature as toSignature, type Signature } from '@solana/kit';
import { OPEN_INVITE, parseKolabEventLogs, type ParsedKolabEvent } from '@kolab/sdk';
import type { SocketEvent } from '@kolab/shared';
import { ENV, type Env } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SolanaService } from '../solana/solana.service.js';
import { ProgramService } from '../solana/program.service.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { MirrorService, type Touched } from './mirror.service.js';

export type EventListener = (event: ParsedKolabEvent, touched: Touched | null, sig: string) => void;

const SOCKET_EVENT: Partial<Record<ParsedKolabEvent['name'], SocketEvent>> = {
  CampaignFunded: 'campaign.funded',
  CreatorEnrolled: 'enrollment.created',
  Shipped: 'enrollment.shipped',
  Received: 'enrollment.received',
  Submitted: 'slot.submitted',
  ChecksAttested: 'slot.checks',
  Rejected: 'slot.rejected',
  Released: 'slot.released',
  HoldbackSettled: 'slot.holdback',
  Missed: 'slot.missed',
  SaleRecorded: 'sale.recorded',
  SalesClaimed: 'payout.claimed',
  CreatorApproved: 'application.updated',
  ApprovalRevoked: 'application.updated',
};

/**
 * Keeps Postgres in sync with the program: every confirmed Kolab tx is ingested once (by our own
 * submit path immediately, and by a signature poll for anything else, e.g. third-party cranks).
 */
@Injectable()
export class IndexerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IndexerService.name);
  private timer: NodeJS.Timeout | null = null;
  private polling = false;
  private readonly listeners: EventListener[] = [];

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly solana: SolanaService,
    private readonly program: ProgramService,
    private readonly mirror: MirrorService,
    private readonly realtime: RealtimeGateway,
  ) {}

  onModuleInit() {
    if (!this.env.WORKERS_ENABLED) return;
    this.timer = setInterval(() => void this.poll(), this.env.INDEXER_POLL_MS);
    void this.poll();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Called after each applied event (e.g. the verifier reacts to `Submitted`). */
  onEvent(listener: EventListener) {
    this.listeners.push(listener);
  }

  /** Applies one confirmed transaction. Safe to call repeatedly for the same signature. */
  async ingest(sig: string): Promise<ParsedKolabEvent[]> {
    if (await this.prisma.processedSignature.findUnique({ where: { signature: sig } })) return [];
    const tx = await this.solana.rpc
      .getTransaction(toSignature(sig), {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
        encoding: 'json',
      })
      .send();
    if (!tx) return []; // not visible yet; the poll retries
    const events =
      tx.meta && !tx.meta.err ? parseKolabEventLogs(tx.meta.logMessages ?? [], this.program.programAddress) : [];

    for (const event of events) {
      try {
        const touched = await this.apply(event);
        this.notify(event, touched, sig);
        for (const l of this.listeners) l(event, touched, sig);
      } catch (err) {
        this.logger.error({ err, sig, event: event.name }, 'failed to apply event');
        throw err; // leave unprocessed so the poll retries
      }
    }
    await this.prisma.processedSignature.upsert({
      where: { signature: sig },
      create: { signature: sig, slot: tx.slot },
      update: {},
    });
    return events;
  }

  private apply(event: ParsedKolabEvent): Promise<Touched | null> {
    switch (event.name) {
      case 'CampaignCreated':
      case 'CampaignFunded':
      case 'CampaignClosed':
        return this.mirror.campaign(event.data.campaign);
      case 'CreatorEnrolled':
      case 'EnrollmentCancelled':
      case 'Shipped':
      case 'Received':
      case 'NotReceived':
      case 'SaleRecorded':
      case 'SalesClaimed':
        return this.mirror.enrollment(event.data.enrollment);
      case 'Released':
        return this.mirror.slot(event.data.slot).then(async (t) => {
          if (t?.slotId && event.data.auto) await this.prisma.slot.update({ where: { id: t.slotId }, data: { autoReleased: true } });
          return t;
        });
      case 'Submitted':
      case 'ChecksAttested':
      case 'Rejected':
      case 'HoldbackSettled':
      case 'Missed':
        return this.mirror.slot(event.data.slot);
      case 'CreatorApproved':
        return this.approval(event.data.campaign, event.data.creator, true);
      case 'ApprovalRevoked':
        return this.approval(event.data.campaign, event.data.creator, false);
    }
  }

  /** Brand approved (or revoked) a creator on-chain; the default address is the open invite. */
  private async approval(campaignPubkey: string, creatorWallet: string, approved: boolean): Promise<Touched | null> {
    const campaign = await this.prisma.campaign.findUnique({ where: { onchainPubkey: campaignPubkey } });
    if (!campaign) return null;
    if (creatorWallet === OPEN_INVITE) {
      await this.prisma.campaign.update({ where: { id: campaign.id }, data: { selective: !approved } });
      return { campaignId: campaign.id, brandId: campaign.brandId };
    }
    const creator = await this.prisma.user.findUnique({ where: { walletPubkey: creatorWallet } });
    if (!creator) return null;
    const data = approved ? { status: 'accepted' as const, decidedAt: new Date() } : { status: 'pending' as const, decidedAt: null };
    await this.prisma.application.upsert({
      where: { campaignId_creatorId: { campaignId: campaign.id, creatorId: creator.id } },
      create: { campaignId: campaign.id, creatorId: creator.id, pitch: 'Invited by the brand', ...data },
      update: data,
    });
    return { campaignId: campaign.id, brandId: campaign.brandId, creatorId: creator.id };
  }

  private notify(event: ParsedKolabEvent, touched: Touched | null, sig: string) {
    const name = SOCKET_EVENT[event.name];
    if (!name || !touched) return;
    const rooms = [
      touched.campaignId && `campaign:${touched.campaignId}`,
      touched.brandId && `user:${touched.brandId}`,
      touched.creatorId && `user:${touched.creatorId}`,
    ].filter((r): r is string => !!r);
    this.realtime.emit(rooms, name, { ...touched, event: event.name }, sig);
  }

  /** Pulls program signatures newer than the newest one we've applied. */
  async poll() {
    if (this.polling) return;
    this.polling = true;
    try {
      const newest = await this.prisma.processedSignature.findFirst({ orderBy: { slot: 'desc' } });
      const sigs = await this.solana.rpc
        .getSignaturesForAddress(this.program.programAddress, {
          limit: 100,
          commitment: 'confirmed',
          ...(newest ? { until: toSignature(newest.signature) } : {}),
        })
        .send();
      for (const s of [...sigs].reverse()) {
        await this.ingest(s.signature as Signature);
      }
    } catch (err) {
      this.logger.warn({ err }, 'indexer poll failed');
    } finally {
      this.polling = false;
    }
  }
}
