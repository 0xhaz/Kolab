import { Controller, ForbiddenException, Get } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProgramService } from '../solana/program.service.js';

const DELIVERED = ['released', 'holdback_released', 'holdback_forfeited'] as const;

/** Brand-only views across all of a brand's campaigns. */
@Controller()
export class BrandController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly program: ProgramService,
  ) {}

  private brand(user: User) {
    if (user.role !== 'brand') throw new ForbiddenException({ code: 'brand_only' });
    return { brandId: user.id, programId: this.program.programAddress };
  }

  /** Submissions waiting for a decision, oldest first, with the verifier's check results. */
  @Get('review')
  async review(@CurrentUser() user: User) {
    const scope = this.brand(user);
    const slots = await this.prisma.slot.findMany({
      where: { status: 'submitted', enrollment: { campaign: scope } },
      orderBy: { submittedAt: 'asc' },
      include: {
        enrollment: {
          include: {
            campaign: { select: { id: true, title: true, reviewWindowSecs: true } },
            creator: { select: { id: true, displayName: true, email: true, walletPubkey: true } },
          },
        },
        submissions: { orderBy: { submittedAt: 'desc' }, take: 1, include: { checkResults: true } },
      },
    });
    return slots.map(({ enrollment, submissions, ...slot }) => ({
      slot,
      campaign: enrollment.campaign,
      creator: enrollment.creator,
      submission: submissions[0] ?? null,
      reviewEndsAt: slot.submittedAt
        ? new Date(slot.submittedAt.getTime() + enrollment.campaign.reviewWindowSecs * 1000).toISOString()
        : null,
    }));
  }

  /** Creators who joined this brand's campaigns, with their on-chain track record (architecture §5.6). */
  @Get('creators')
  async creators(@CurrentUser() user: User) {
    const scope = this.brand(user);
    const enrollments = await this.prisma.enrollment.findMany({
      where: { campaign: scope },
      include: { creator: { select: { id: true, displayName: true, email: true, walletPubkey: true } } },
    });
    const ids = [...new Set(enrollments.map((e) => e.creatorId))];
    // Reliability counts every Kolab slot the creator has, not just this brand's.
    const slots = await this.prisma.slot.findMany({
      where: { enrollment: { creatorId: { in: ids }, campaign: { programId: scope.programId } } },
      select: { status: true, enrollment: { select: { creatorId: true } } },
    });
    return ids.map((id) => {
      const mine = slots.filter((s) => s.enrollment.creatorId === id);
      const delivered = mine.filter((s) => (DELIVERED as readonly string[]).includes(s.status)).length;
      const missed = mine.filter((s) => s.status === 'missed').length;
      const deleted = mine.filter((s) => s.status === 'holdback_forfeited').length;
      const decided = delivered + missed;
      const withBrand = enrollments.filter((e) => e.creatorId === id);
      return {
        creator: withBrand[0]!.creator,
        campaigns: withBrand.length,
        earnedWithBrand: withBrand.reduce((sum, e) => sum + e.earnedTotal, 0n).toString(),
        delivered,
        missed,
        deleted,
        onTimeRate: decided ? delivered / decided : null,
      };
    });
  }
}
