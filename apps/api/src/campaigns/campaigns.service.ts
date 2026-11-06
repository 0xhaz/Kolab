import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { address } from '@solana/kit';
import { findCampaignPda } from '@kolab/sdk';
import {
  CreateCampaignSchema,
  toBaseUnits,
  type CampaignDto,
  type CreateCampaign,
  type ShippingAddress,
  type SlotTemplateDto,
} from '@kolab/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProgramService } from '../solana/program.service.js';
import type { Campaign, Prisma, User } from '../generated/prisma/client.js';
import { ENV, type Env } from '../config/env.js';
import { openAddress, sealAddress } from './address-crypto.js';

const DAY = 86_400;

export function toCampaignDto(c: Campaign & { _count?: { applications: number } }): CampaignDto {
  return {
    id: c.id,
    onchainPubkey: c.onchainPubkey,
    title: c.title,
    brandName: c.brandName,
    coverUrl: c.coverUploadId ? `/campaigns/${c.id}/cover` : c.coverUrl,
    hasBrandKit: c.kitReady,
    kitAssetCount: c.kitAssetCount,
    selective: c.selective,
    onChain: !!c.onchainAt || c.status !== 'draft',
    ...(c._count ? { pendingApplications: c._count.applications } : {}),
    briefMd: c.briefMd,
    type: c.type,
    status: c.status,
    brandId: c.brandId,
    startAt: c.startAt.toISOString(),
    endAt: c.endAt.toISOString(),
    reviewWindowSecs: c.reviewWindowSecs,
    graceSecs: c.graceSecs,
    holdbackBps: c.holdbackBps,
    requiresShipping: c.requiresShipping,
    perSaleAmount: c.perSaleAmount.toString(),
    maxCreators: c.maxCreators,
    slots: c.slotsJson as unknown as SlotTemplateDto[],
    budget: c.budget.toString(),
    totalFunded: c.totalFunded.toString(),
    totalReleased: c.totalReleased.toString(),
    totalRefunded: c.totalRefunded.toString(),
    totalFees: c.totalFees.toString(),
  };
}

@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly program: ProgramService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  get programId() {
    return this.program.programAddress;
  }

  /** Creator stores their shipping address: encrypted at rest, visible only to this campaign's brand. */
  async saveAddress(creator: User, enrollmentId: string, address: ShippingAddress) {
    const e = await this.prisma.enrollment.findUnique({ where: { id: enrollmentId } });
    if (!e || e.creatorId !== creator.id) throw new ForbiddenException({ code: 'not_enrollment_creator' });
    const sealed = sealAddress(JSON.stringify(address), this.env.ADDRESS_ENC_KEY, e.id);
    await this.prisma.enrollment.update({ where: { id: e.id }, data: { shippingAddressSealed: new Uint8Array(sealed) } });
    return { saved: true };
  }

  async readAddress(user: User, enrollmentId: string): Promise<ShippingAddress | null> {
    const e = await this.prisma.enrollment.findUnique({ where: { id: enrollmentId }, include: { campaign: true } });
    if (!e || (e.creatorId !== user.id && e.campaign.brandId !== user.id)) {
      throw new ForbiddenException({ code: 'not_allowed' });
    }
    if (!e.shippingAddressSealed) return null;
    return JSON.parse(openAddress(e.shippingAddressSealed, this.env.ADDRESS_ENC_KEY, e.id)) as ShippingAddress;
  }

  /** Off-chain draft. The on-chain campaign is created + funded by the brand's first tx. */
  async create(brand: User, raw: CreateCampaign): Promise<Campaign> {
    if (brand.role !== 'brand') throw new ForbiddenException({ code: 'brand_only' });
    if (!brand.walletPubkey) throw new ForbiddenException({ code: 'wallet_not_ready' });
    const input = CreateCampaignSchema.parse(raw);

    const now = await this.program.chainNow();
    const slots: SlotTemplateDto[] = input.slots.map((s) => ({
      kind: s.kind,
      amount: toBaseUnits(s.amountUsdc).toString(),
      dueOffsetSecs: Math.round(s.dueDays * DAY),
    }));

    const draft = await this.prisma.campaign.create({
      data: {
        brandId: brand.id,
        programId: this.program.programAddress,
        mint: this.program.usdcMint,
        type: input.type,
        title: input.title,
        brandName: input.brandName ?? brand.displayName ?? brand.email?.split('@')[0] ?? null,
        coverUrl: input.coverUrl ?? null,
        briefMd: input.briefMd,
        shipsTo: input.shipsTo,
        startAt: new Date(now * 1000),
        endAt: new Date((now + input.durationDays * DAY) * 1000),
        reviewWindowSecs: input.reviewWindowSecs,
        graceSecs: input.graceSecs,
        holdbackBps: Math.round(input.holdbackPct * 100),
        requiresShipping: input.requiresShipping,
        selective: input.selective,
        shippingWindowSecs: input.requiresShipping ? input.shippingWindowDays * DAY : 0,
        perSaleAmount: toBaseUnits(input.perSaleUsdc),
        maxCreators: input.maxCreators,
        slotsJson: slots as unknown as Prisma.InputJsonValue,
        budget: toBaseUnits(input.budgetUsdc),
      },
    });
    const [pda] = await findCampaignPda(
      { brand: address(brand.walletPubkey), campaignId: draft.onchainId },
      { programAddress: this.program.programAddress },
    );
    return this.prisma.campaign.update({ where: { id: draft.id }, data: { onchainPubkey: pda } });
  }

  /** Brands see their own campaigns; creators see live ones plus the ones they joined. */
  list(user: User): Promise<Campaign[]> {
    // Only the deployment this API is configured for (hosted vs demo-clock share a database schema).
    const programId = this.program.programAddress;
    const where: Prisma.CampaignWhereInput =
      user.role === 'brand'
        ? { programId, brandId: user.id }
        : {
            programId,
            OR: [
              // Campaigns the indexer found on-chain from another client have no brand account here,
              // so nobody could approve or review them: keep them out of Discover.
              { status: 'active', NOT: { brand: { privyId: { startsWith: 'wallet:' } } } },
              { enrollments: { some: { creatorId: user.id } } },
            ],
          };
    return this.prisma.campaign.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      ...(user.role === 'brand' && { include: { _count: { select: { applications: { where: { status: 'pending' } } } } } }),
    });
  }

  async get(id: string): Promise<Campaign> {
    const c = await this.prisma.campaign.findFirst({ where: { id, programId: this.program.programAddress } });
    if (!c) throw new NotFoundException({ code: 'campaign_not_found' });
    return c;
  }

  async ownedBy(brand: User, id: string): Promise<Campaign> {
    const c = await this.get(id);
    if (c.brandId !== brand.id) throw new ForbiddenException({ code: 'not_campaign_brand' });
    return c;
  }

  detail(id: string) {
    return this.prisma.campaign.findFirst({
      where: { id, programId: this.program.programAddress },
      include: {
        enrollments: {
          include: {
            creator: { select: { id: true, displayName: true, email: true, walletPubkey: true } },
            slots: {
              orderBy: { idx: 'asc' },
              include: { submissions: { orderBy: { submittedAt: 'desc' }, take: 1, select: { url: true, fileKey: true, submittedAt: true } } },
            },
          },
        },
      },
    });
  }
}
