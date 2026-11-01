import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { BrandKitDto, BrandKitInput } from '@kolab/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../uploads/storage.service.js';
import { UploadLinksService } from '../uploads/upload-links.service.js';
import type { User } from '../generated/prisma/client.js';

/**
 * Brand kit: logo, product photos, colours and notes a seller provides for joined creators.
 * The kit itself unlocks only after joining; the "brand kit ready" status and the cover are public.
 */
@Injectable()
export class KitService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly links: UploadLinksService,
  ) {}

  async set(brand: User, campaignId: string, input: BrandKitInput) {
    const c = await this.prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!c) throw new NotFoundException({ code: 'campaign_not_found' });
    if (c.brandId !== brand.id) throw new ForbiddenException({ code: 'not_campaign_brand' });

    const ids = [input.logoUploadId, ...input.productUploadIds];
    const uploads = await this.prisma.upload.findMany({ where: { id: { in: ids } } });
    if (uploads.length !== new Set(ids).size || uploads.some((u) => u.userId !== brand.id || !u.mime.startsWith('image/'))) {
      throw new BadRequestException({ code: 'kit_uploads_invalid' });
    }

    await this.prisma.$transaction([
      this.prisma.brandAsset.deleteMany({ where: { campaignId } }),
      this.prisma.brandAsset.createMany({
        data: [
          { campaignId, uploadId: input.logoUploadId, kind: 'logo', sort: 0 },
          ...input.productUploadIds.map((uploadId, i) => ({ campaignId, uploadId, kind: 'product', sort: i + 1 })),
        ],
      }),
      this.prisma.campaign.update({
        where: { id: campaignId },
        data: {
          kitReady: true,
          kitColors: input.colors,
          kitNotes: input.notes ?? null,
          kitRightsAt: new Date(),
          kitAssetCount: ids.length,
          coverUploadId: input.productUploadIds[0],
        },
      }),
    ]);
    return { ok: true, assets: ids.length };
  }

  /** The campaign's brand, or a creator who joined it. Everyone else sees "kit_locked". */
  async get(user: User, campaignId: string): Promise<BrandKitDto> {
    const c = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      include: { brandAssets: { orderBy: { sort: 'asc' } }, enrollments: { where: { creatorId: user.id }, select: { id: true } } },
    });
    if (!c) throw new NotFoundException({ code: 'campaign_not_found' });
    if (c.brandId !== user.id && c.enrollments.length === 0) throw new ForbiddenException({ code: 'kit_locked' });

    const uploads = await this.prisma.upload.findMany({ where: { id: { in: c.brandAssets.map((a) => a.uploadId) } } });
    const byId = new Map(uploads.map((u) => [u.id, u]));
    const assets = c.brandAssets.flatMap((a) => {
      const up = byId.get(a.uploadId);
      return up ? [{ id: a.id, kind: a.kind as 'logo' | 'product', url: this.links.link(up), mime: up.mime }] : [];
    });
    return {
      logo: assets.find((a) => a.kind === 'logo') ?? null,
      products: assets.filter((a) => a.kind === 'product'),
      colors: c.kitColors,
      notes: c.kitNotes,
      brandName: c.brandName,
    };
  }

  /** Public cover for Discover (a marketing image the brand chose to show). */
  async cover(campaignId: string) {
    const c = await this.prisma.campaign.findUnique({ where: { id: campaignId }, select: { coverUploadId: true } });
    const up = c?.coverUploadId ? await this.prisma.upload.findUnique({ where: { id: c.coverUploadId } }) : null;
    if (!up) throw new NotFoundException({ code: 'no_cover' });
    return { up, access: this.storage.access({ storage: up.storage as 'local' | 'cloudinary', storageKey: up.storageKey }) };
  }

  /** Stores raw image bytes as one of the brand's uploads (used by the demo kit generator). */
  async storeImage(brand: User, bytes: Buffer, mime: 'image/png' | 'image/jpeg') {
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const stored = await this.storage.put(sha256, bytes, mime);
    return this.prisma.upload.create({ data: { userId: brand.id, sha256, size: bytes.length, mime, ...stored } });
  }
}
