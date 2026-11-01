import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AddSampleSchema,
  UpdateProfileSchema,
  type AddSample,
  type BrandReputationDto,
  type CreatorProfileDto,
  type CreatorTrackRecord,
  type Platform,
  type SampleDto,
  type UpdateProfile,
} from '@kolab/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProgramService } from '../solana/program.service.js';
import { UploadLinksService } from '../uploads/upload-links.service.js';
import type { User } from '../generated/prisma/client.js';

const DELIVERED = ['released', 'holdback_released', 'holdback_forfeited'];
const MAX_SAMPLES = 6;

/**
 * Creator profiles (niches, channels, samples) and the two-sided track records brands and creators
 * see before working together (architecture §5.6). Records come from on-chain outcomes only.
 */
@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly program: ProgramService,
    private readonly links: UploadLinksService,
  ) {}

  private creatorOnly(user: User) {
    if (user.role !== 'creator') throw new ForbiddenException({ code: 'creator_only' });
  }

  async update(user: User, raw: UpdateProfile): Promise<CreatorProfileDto> {
    this.creatorOnly(user);
    const input = UpdateProfileSchema.parse(raw);
    await this.prisma.$transaction([
      this.prisma.creatorProfile.upsert({
        where: { userId: user.id },
        create: { userId: user.id, bio: input.bio, country: input.country ?? null, niches: input.niches },
        update: { bio: input.bio, country: input.country ?? null, niches: input.niches },
      }),
      this.prisma.socialAccount.deleteMany({ where: { userId: user.id } }),
      this.prisma.socialAccount.createMany({
        data: input.channels.map((ch) => ({ userId: user.id, platform: ch.platform, handle: ch.handle, followers: ch.followers })),
      }),
    ]);
    return (await this.profiles([user.id]))[0]!;
  }

  async addSample(user: User, raw: AddSample) {
    this.creatorOnly(user);
    const input = AddSampleSchema.parse(raw);
    const count = await this.prisma.portfolioItem.count({ where: { userId: user.id } });
    if (count >= MAX_SAMPLES) throw new BadRequestException({ code: 'too_many_samples', max: MAX_SAMPLES });
    if ('uploadId' in input) {
      const up = await this.prisma.upload.findUnique({ where: { id: input.uploadId } });
      if (!up || up.userId !== user.id) throw new BadRequestException({ code: 'upload_not_found' });
      const kind = up.mime.startsWith('video/') ? 'video' : 'image';
      await this.prisma.portfolioItem.create({
        data: { userId: user.id, kind, uploadId: up.id, caption: input.caption ?? null, sort: count },
      });
    } else {
      await this.prisma.portfolioItem.create({
        data: { userId: user.id, kind: 'link', url: input.url, caption: input.caption ?? null, sort: count },
      });
    }
    return (await this.profiles([user.id]))[0]!;
  }

  async removeSample(user: User, id: string) {
    const item = await this.prisma.portfolioItem.findUnique({ where: { id } });
    if (!item || item.userId !== user.id) throw new NotFoundException({ code: 'sample_not_found' });
    await this.prisma.portfolioItem.delete({ where: { id } });
    return (await this.profiles([user.id]))[0]!;
  }

  /** Full profiles for a set of creators, in the order given. */
  async profiles(userIds: string[]): Promise<CreatorProfileDto[]> {
    if (userIds.length === 0) return [];
    const [users, records] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: userIds } },
        include: {
          creatorProfile: true,
          socialAccounts: true,
          samples: { orderBy: { sort: 'asc' } },
        },
      }),
      this.trackRecords(userIds),
    ]);
    const uploads = await this.prisma.upload.findMany({
      where: { id: { in: users.flatMap((u) => u.samples.map((s) => s.uploadId).filter((x): x is string => !!x)) } },
    });
    const byUpload = new Map(uploads.map((u) => [u.id, u]));

    return userIds.flatMap((id) => {
      const u = users.find((x) => x.id === id);
      if (!u) return [];
      const channels = u.socialAccounts
        .map((s) => ({ platform: s.platform as Platform, handle: s.handle, followers: s.followers, source: s.verifiedAt ? ('platform' as const) : ('self' as const) }))
        .sort((a, b) => b.followers - a.followers);
      const samples = u.samples.flatMap((s): SampleDto[] => {
        if (s.kind === 'link') return [{ id: s.id, kind: 'link' as const, url: s.url!, caption: s.caption }];
        const up = s.uploadId ? byUpload.get(s.uploadId) : undefined;
        return up ? [{ id: s.id, kind: s.kind as 'image' | 'video', url: this.links.link(up), caption: s.caption }] : [];
      });
      const niches = u.creatorProfile?.niches ?? [];
      return [
        {
          userId: u.id,
          displayName: u.displayName ?? u.email?.split('@')[0] ?? null,
          bio: u.creatorProfile?.bio ?? '',
          country: u.creatorProfile?.country ?? null,
          niches,
          channels,
          totalFollowers: channels.reduce((sum, c) => sum + c.followers, 0),
          samples,
          record: records.get(u.id)!,
          complete: niches.length > 0 && channels.length > 0 && samples.length > 0,
        },
      ];
    });
  }

  /** Reliability across all of Kolab (not one brand), so a brand's rating can't override it. */
  async trackRecords(userIds: string[]): Promise<Map<string, CreatorTrackRecord>> {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { creatorId: { in: userIds }, campaign: { programId: this.program.programAddress } },
      select: { creatorId: true, earnedTotal: true, slots: { select: { status: true } } },
    });
    return new Map(
      userIds.map((id) => {
        const mine = enrollments.filter((e) => e.creatorId === id);
        const statuses = mine.flatMap((e) => e.slots.map((s) => s.status as string));
        const delivered = statuses.filter((s) => DELIVERED.includes(s)).length;
        const missed = statuses.filter((s) => s === 'missed').length;
        const removed = statuses.filter((s) => s === 'holdback_forfeited').length;
        const decided = delivered + missed;
        return [
          id,
          {
            campaigns: mine.length,
            delivered,
            missed,
            removed,
            onTimeRate: decided ? delivered / decided : null,
            earned: mine.reduce((sum, e) => sum + e.earnedTotal, 0n).toString(),
          },
        ];
      }),
    );
  }

  /** What creators see about a brand: how it has actually treated creators, from on-chain outcomes. */
  async brandReputation(brandId: string): Promise<BrandReputationDto> {
    const scope = { brandId, programId: this.program.programAddress };
    const [campaigns, slots, enrollments] = await Promise.all([
      this.prisma.campaign.count({ where: { ...scope, status: { not: 'draft' } } }),
      this.prisma.slot.findMany({
        where: { enrollment: { campaign: scope } },
        select: { status: true, submittedAt: true, decidedAt: true, autoReleased: true },
      }),
      this.prisma.enrollment.findMany({ where: { campaign: scope }, select: { creatorId: true, earnedTotal: true } }),
    ]);
    // Decisions the brand made itself (approve or reject), vs. slots the crank auto-released.
    const decided = slots.filter((s) => s.submittedAt && s.decidedAt && !s.autoReleased && s.status !== 'missed');
    const reviewed = slots.filter((s) => s.submittedAt && s.decidedAt && s.status !== 'missed');
    const rejected = slots.filter((s) => s.status === 'rejected').length;
    const hours = decided.map((s) => (s.decidedAt!.getTime() - s.submittedAt!.getTime()) / 3_600_000);
    const paid = new Set(enrollments.filter((e) => e.earnedTotal > 0n).map((e) => e.creatorId));
    return {
      campaigns,
      creatorsPaid: paid.size,
      paidOut: enrollments.reduce((sum, e) => sum + e.earnedTotal, 0n).toString(),
      decidedInTimeRate: reviewed.length ? decided.length / reviewed.length : null,
      avgDecisionHours: hours.length ? hours.reduce((a, b) => a + b, 0) / hours.length : null,
      rejectionRate: reviewed.length ? rejected / reviewed.length : null,
      refundedForMissed: slots.filter((s) => s.status === 'missed').length,
    };
  }
}
