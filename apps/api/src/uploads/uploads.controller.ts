import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Query,
  UnauthorizedException,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { createHash } from 'node:crypto';
import type { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from './storage.service.js';
import { Public } from '../auth/public.decorator.js';
import { UploadLinksService } from './upload-links.service.js';

const MAX_BYTES = 150 * 1024 * 1024;
const ALLOWED = /^(video\/(mp4|quicktime|webm)|image\/(jpeg|png|heic|webp))$/;

@Controller('uploads')
export class UploadsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly links: UploadLinksService,
  ) {}

  private async canRead(user: User, id: string) {
    const up = await this.prisma.upload.findUnique({ where: { id } });
    if (!up) throw new NotFoundException({ code: 'upload_not_found' });
    if (up.userId === user.id) return up;
    // a brand reading a file delivered to its campaign
    const asBrand = await this.prisma.submission.findFirst({
      where: { fileKey: id, slot: { enrollment: { campaign: { brandId: user.id } } } },
      select: { id: true },
    });
    if (asBrand) return up;
    // a joined creator reading the campaign's brand kit
    const kit = await this.prisma.brandAsset.findFirst({
      where: { uploadId: id, campaign: { OR: [{ brandId: user.id }, { enrollments: { some: { creatorId: user.id } } }] } },
      select: { id: true },
    });
    if (!kit) throw new ForbiddenException({ code: 'not_allowed' });
    return up;
  }

  /** A short-lived link a browser/video player can open without our auth header (10 minutes). */
  @Get(':id/link')
  async link(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    const up = await this.canRead(user, id);
    return { url: this.links.link(up), mime: up.mime };
  }

  @Public()
  @Get(':id/raw')
  async raw(@Param('id', ParseUUIDPipe) id: string, @Query('exp') exp: string, @Query('sig') sig: string, @Res() res: Response) {
    if (!this.links.verify(id, Number(exp), sig)) throw new UnauthorizedException({ code: 'link_expired' });
    const up = await this.prisma.upload.findUnique({ where: { id } });
    if (!up) throw new NotFoundException({ code: 'upload_not_found' });
    const access = this.storage.access({ storage: up.storage as 'local' | 'cloudinary', storageKey: up.storageKey });
    if (access.kind === 'redirect') return res.redirect(access.url);
    res.setHeader('content-type', up.mime);
    access.stream.pipe(res);
  }

  /**
   * Creator uploads a UGC file. The client sends the SHA-256 it computed; we recompute it and refuse
   * a mismatch, because that hash is what gets recorded on-chain for the slot.
   */
  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BYTES, files: 1 } }))
  async upload(
    @CurrentUser() user: User,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Headers('x-content-sha256') claimed: string | undefined,
  ) {
    if (user.role !== 'creator' && user.role !== 'brand') throw new ForbiddenException({ code: 'not_allowed' });
    if (!file) throw new BadRequestException({ code: 'file_required' });
    if (!ALLOWED.test(file.mimetype)) throw new BadRequestException({ code: 'unsupported_type', mime: file.mimetype });
    if (user.role === 'brand' && !file.mimetype.startsWith('image/')) {
      throw new BadRequestException({ code: 'brand_kit_images_only' });
    }
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    if (claimed && claimed.toLowerCase() !== sha256) throw new BadRequestException({ code: 'hash_mismatch' });

    const stored = await this.storage.put(sha256, file.buffer, file.mimetype);
    const row = await this.prisma.upload.create({
      data: { userId: user.id, sha256, size: file.size, mime: file.mimetype, ...stored },
    });
    return { uploadId: row.id, sha256, size: row.size, mime: row.mime };
  }

  /** The uploader, or the brand of a campaign it was submitted to, can fetch the file. */
  @Get(':id/file')
  async file(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const up = await this.canRead(user, id);
    const access = this.storage.access({ storage: up.storage as 'local' | 'cloudinary', storageKey: up.storageKey });
    if (access.kind === 'redirect') return res.redirect(access.url);
    res.setHeader('content-type', up.mime);
    res.setHeader('cache-control', 'private, max-age=600');
    access.stream.pipe(res);
  }
}
