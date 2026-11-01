import { Injectable, Logger } from '@nestjs/common';
import { address, type Address } from '@solana/kit';
import {
  fetchAllMaybeSlot,
  fetchMaybeCampaign,
  fetchMaybeEnrollment,
  fetchMaybeSlot,
  findSlotPda,
  type Campaign as ChainCampaign,
} from '@kolab/sdk';
import { PrismaService } from '../prisma/prisma.service.js';
import { SolanaService } from '../solana/solana.service.js';
import { ProgramService } from '../solana/program.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import {
  campaignStatus,
  campaignType,
  checkStatus,
  enrollmentStatus,
  slotKind,
  slotStatus,
  templatesToDto,
  tsToDate,
  voucherFor,
} from './mapping.js';

export interface Touched {
  campaignId?: string;
  brandId?: string;
  creatorId?: string;
  enrollmentId?: string;
  slotId?: string;
}

/**
 * Copies on-chain accounts into Postgres. On-chain state is the source of truth; the mirror can be
 * rebuilt from the program at any time (architecture §7), including campaigns created outside the app.
 */
@Injectable()
export class MirrorService {
  private readonly logger = new Logger(MirrorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly solana: SolanaService,
    private readonly program: ProgramService,
  ) {}

  /** Users we only know by wallet (e.g. a campaign created by another client). */
  private async userByWallet(wallet: Address, role: 'brand' | 'creator') {
    return this.prisma.user.upsert({
      where: { walletPubkey: wallet },
      create: { privyId: `wallet:${wallet}`, walletPubkey: wallet, role },
      update: {},
    });
  }

  async campaign(pubkey: Address): Promise<Touched | null> {
    const acc = await fetchMaybeCampaign(this.solana.rpc, pubkey);
    if (!acc.exists) return null;
    const c = acc.data;
    const brand = await this.userByWallet(c.brand, 'brand');
    const chainFields = this.campaignFields(c);
    const row = await this.prisma.campaign.upsert({
      where: { onchainPubkey: pubkey },
      create: {
        ...chainFields,
        onchainPubkey: pubkey,
        onchainId: c.campaignId,
        programId: this.program.programAddress,
        brandId: brand.id,
        title: `On-chain campaign ${pubkey.slice(0, 6)}`,
        budget: c.totalFunded,
      },
      update: chainFields,
    });
    if (!row.onchainAt) await this.prisma.campaign.update({ where: { id: row.id }, data: { onchainAt: new Date() } });
    return { campaignId: row.id, brandId: row.brandId };
  }

  private campaignFields(c: ChainCampaign) {
    return {
      type: campaignType[c.campaignType],
      status: campaignStatus[c.status],
      mint: c.mint,
      startAt: tsToDate(c.startTs) ?? new Date(),
      endAt: tsToDate(c.endTs) ?? new Date(),
      reviewWindowSecs: Number(c.reviewWindowSecs),
      graceSecs: Number(c.graceSecs),
      holdbackBps: c.holdbackBps,
      requiresShipping: c.requiresShipping,
      shippingWindowSecs: Number(c.shippingWindowSecs),
      perSaleAmount: c.perSaleAmount,
      maxCreators: c.maxCreators,
      slotsJson: templatesToDto(c.slots, c.slotCount) as unknown as Prisma.InputJsonValue,
      totalFunded: c.totalFunded,
      totalReleased: c.totalReleased,
      totalRefunded: c.totalRefunded,
      totalFees: c.totalFees,
    } satisfies Partial<Prisma.CampaignUncheckedCreateInput>;
  }

  /** Mirrors an enrollment and all of its current-period slots. */
  async enrollment(pubkey: Address): Promise<Touched | null> {
    const acc = await fetchMaybeEnrollment(this.solana.rpc, pubkey);
    if (!acc.exists) return null;
    const e = acc.data;
    const touchedCampaign = await this.campaign(e.campaign);
    if (!touchedCampaign?.campaignId) return null;
    const creator = await this.userByWallet(e.creator, 'creator');
    const campaign = await this.prisma.campaign.findUniqueOrThrow({
      where: { id: touchedCampaign.campaignId },
    });

    const data = {
      status: enrollmentStatus[e.status],
      shippedAt: tsToDate(e.shippedTs),
      receivedAt: tsToDate(e.receivedTs),
      salesAccrued: e.salesAccrued,
      earnedTotal: e.earnedTotal,
    };
    const row = await this.prisma.enrollment.upsert({
      where: { onchainPubkey: pubkey },
      create: {
        ...data,
        onchainPubkey: pubkey,
        campaignId: campaign.id,
        creatorId: creator.id,
        voucherCode: campaign.type === 'per_sale' ? voucherFor(pubkey) : null,
      },
      update: data,
    });

    const templates = campaign.slotsJson as unknown as { length: number };
    await this.slots(pubkey, row.id, templates.length, e.receivedTs);
    return { ...touchedCampaign, creatorId: creator.id, enrollmentId: row.id };
  }

  private async slots(enrollment: Address, enrollmentId: string, count: number, receivedTs: bigint) {
    if (count === 0) return;
    const pdas = await Promise.all(
      Array.from({ length: count }, (_, i) =>
        findSlotPda({ enrollment, periodIndex: 0, slotIdx: i }, { programAddress: this.program.programAddress }),
      ),
    );
    const accounts = await fetchAllMaybeSlot(this.solana.rpc, pdas.map(([p]) => p));
    for (const acc of accounts) {
      if (!acc.exists) continue;
      const s = acc.data;
      const data = {
        kind: slotKind[s.kind],
        amount: s.amount,
        dueOffsetSecs: Number(s.dueOffset),
        dueAt: receivedTs > 0n ? tsToDate(receivedTs + s.dueOffset) : null,
        status: slotStatus[s.status],
        checks: checkStatus[s.checks],
        contentHash: s.submittedTs > 0n ? Buffer.from(s.contentHash).toString('hex') : null,
        submittedAt: tsToDate(s.submittedTs),
        decidedAt: tsToDate(s.decidedTs),
        holdback: s.holdback,
      };
      await this.prisma.slot.upsert({
        where: { onchainPubkey: acc.address },
        create: { ...data, onchainPubkey: acc.address, enrollmentId, periodIndex: s.periodIndex, idx: s.slotIdx },
        update: data,
      });
    }
  }

  /** Re-mirrors the enrollment (and so the campaign + all its slots) that owns a slot. */
  async slot(pubkey: Address): Promise<Touched | null> {
    const row = await this.prisma.slot.findUnique({
      where: { onchainPubkey: pubkey },
      include: { enrollment: true },
    });
    let enrollmentPubkey = row?.enrollment.onchainPubkey ?? null;
    if (!enrollmentPubkey) {
      const acc = await fetchMaybeSlot(this.solana.rpc, pubkey);
      if (!acc.exists) return null;
      enrollmentPubkey = acc.data.enrollment;
    }
    const touched = await this.enrollment(address(enrollmentPubkey));
    const slot = await this.prisma.slot.findUnique({ where: { onchainPubkey: pubkey } });
    return touched ? { ...touched, slotId: slot?.id } : null;
  }
}
