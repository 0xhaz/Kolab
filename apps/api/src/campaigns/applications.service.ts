import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ApplySchema, type ApplicationDto, type Apply } from '@kolab/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import type { Application, User } from '../generated/prisma/client.js';
import { CampaignTxService } from './campaign-tx.service.js';
import { CampaignsService } from './campaigns.service.js';
import { ProfileService } from './profile.service.js';

export function toApplicationDto(a: Application): ApplicationDto {
  return {
    id: a.id,
    campaignId: a.campaignId,
    status: a.status,
    pitch: a.pitch,
    createdAt: a.createdAt.toISOString(),
    decidedAt: a.decidedAt?.toISOString() ?? null,
  };
}

/**
 * Selective campaigns: creators apply with their profile, the brand picks. Accepting is an
 * on-chain approve_creator signed by the brand; the indexer flips the application to accepted.
 */
@Injectable()
export class ApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly campaigns: CampaignsService,
    private readonly tx: CampaignTxService,
    private readonly profiles: ProfileService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async apply(creator: User, campaignId: string, raw: Apply): Promise<ApplicationDto> {
    if (creator.role !== 'creator') throw new ForbiddenException({ code: 'creator_only' });
    const { pitch } = ApplySchema.parse(raw);
    const c = await this.campaigns.get(campaignId);
    if (c.status !== 'active') throw new ConflictException({ code: 'campaign_not_active' });
    if (!c.selective) throw new BadRequestException({ code: 'campaign_is_open' });
    const [profile] = await this.profiles.profiles([creator.id]);
    if (!profile?.complete) throw new BadRequestException({ code: 'profile_incomplete' });

    const existing = await this.prisma.application.findUnique({
      where: { campaignId_creatorId: { campaignId, creatorId: creator.id } },
    });
    if (existing && existing.status !== 'declined') throw new ConflictException({ code: 'already_applied' });
    const app = existing
      ? await this.prisma.application.update({ where: { id: existing.id }, data: { pitch, status: 'pending', decidedAt: null } })
      : await this.prisma.application.create({ data: { campaignId, creatorId: creator.id, pitch } });
    this.realtime.emit([`user:${c.brandId}`, `campaign:${c.id}`], 'application.updated', { campaignId, applicationId: app.id });
    return toApplicationDto(app);
  }

  mine(creator: User, campaignId: string) {
    return this.prisma.application
      .findUnique({ where: { campaignId_creatorId: { campaignId, creatorId: creator.id } } })
      .then((a) => (a ? toApplicationDto(a) : null));
  }

  /** Brand view: applicants with full profiles and on-chain track records, pending first. */
  async forCampaign(brand: User, campaignId: string): Promise<ApplicationDto[]> {
    await this.campaigns.ownedBy(brand, campaignId);
    const apps = await this.prisma.application.findMany({ where: { campaignId }, orderBy: { createdAt: 'asc' } });
    const profiles = await this.profiles.profiles(apps.map((a) => a.creatorId));
    const order = { pending: 0, accepted: 1, declined: 2 } as const;
    return apps
      .map((a) => ({ ...toApplicationDto(a), creator: profiles.find((p) => p.userId === a.creatorId) }))
      .sort((a, b) => order[a.status] - order[b.status]);
  }

  private async owned(brand: User, id: string) {
    const app = await this.prisma.application.findUnique({ where: { id }, include: { creator: true } });
    if (!app) throw new NotFoundException({ code: 'application_not_found' });
    await this.campaigns.ownedBy(brand, app.campaignId);
    return app;
  }

  async acceptTx(brand: User, id: string) {
    const app = await this.owned(brand, id);
    if (app.status === 'accepted') throw new ConflictException({ code: 'already_accepted' });
    if (!app.creator.walletPubkey) throw new BadRequestException({ code: 'creator_wallet_not_ready' });
    return this.tx.approveCreator(brand, app.campaignId, app.creator.walletPubkey);
  }

  async decline(brand: User, id: string): Promise<ApplicationDto> {
    const app = await this.owned(brand, id);
    if (app.status === 'accepted') throw new ConflictException({ code: 'already_accepted' });
    const updated = await this.prisma.application.update({ where: { id }, data: { status: 'declined', decidedAt: new Date() } });
    this.realtime.emit([`user:${app.creatorId}`], 'application.updated', { campaignId: app.campaignId, applicationId: id });
    return toApplicationDto(updated);
  }
}
