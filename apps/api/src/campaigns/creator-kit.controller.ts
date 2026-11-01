import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  CaptionRequestSchema,
  PrecheckRequestSchema,
  postRequirements,
  precheckCaption,
  type CaptionRequest,
} from '@kolab/shared';
import { z } from 'zod';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ZodPipe } from '../common/zod.pipe.js';
import type { User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AiService } from '../ai/ai.service.js';

const MAX_AUDIO_BYTES = 15 * 1024 * 1024;
const HooksRequestSchema = z.object({ language: z.enum(['en', 'ms', 'id']).optional() });

/** Creator kit: caption builder + pre-post check for one of the creator's own slots. */
@Controller('slots/:id')
export class CreatorKitController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  private async mySlot(user: User, slotId: string) {
    const slot = await this.prisma.slot.findUnique({ where: { id: slotId }, include: { enrollment: { include: { campaign: true } } } });
    if (!slot) throw new NotFoundException({ code: 'slot_not_found' });
    if (slot.enrollment.creatorId !== user.id) throw new ForbiddenException({ code: 'not_slot_creator' });
    const camp = slot.enrollment.campaign;
    return { slot, camp, req: postRequirements(camp, slot.enrollment.voucherCode) };
  }

  @Post('caption')
  async caption(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(CaptionRequestSchema)) body: CaptionRequest,
  ) {
    const { camp, req } = await this.mySlot(user, id);
    const out = await this.ai.caption({
      brief: camp.briefMd,
      product: req.product,
      brandTag: req.brandTag,
      disclosure: req.disclosure,
      voucher: req.voucher,
      language: body.language ?? 'en',
      vibe: body.vibe ?? 'casual',
      notes: body.notes,
    });
    return { ...out, requirements: req, checks: precheckCaption(out.caption, req) };
  }

  /** Three on-screen opening hooks for the video editor. */
  @Post('hooks')
  async hooks(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(HooksRequestSchema)) body: z.infer<typeof HooksRequestSchema>,
  ) {
    const { camp, req } = await this.mySlot(user, id);
    return this.ai.hooks({ brief: camp.briefMd, product: req.product, language: body.language ?? 'en' });
  }

  /**
   * Auto-captions: the editor exports the timeline's audio (trimmed, in order) and we return timed
   * caption segments. The audio is not stored.
   */
  @Post('transcribe')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_AUDIO_BYTES, files: 1 } }))
  async transcribe(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('durationMs') durationMs: string | undefined,
  ) {
    await this.mySlot(user, id);
    if (!file) throw new BadRequestException({ code: 'file_required' });
    if (!/^audio\/(mp4|m4a|x-m4a|aac|mpeg|wav)$/.test(file.mimetype)) throw new BadRequestException({ code: 'unsupported_type', mime: file.mimetype });
    const ms = Number(durationMs);
    if (!Number.isFinite(ms) || ms <= 0 || ms > 5 * 60_000) throw new BadRequestException({ code: 'bad_duration' });
    const mimeType = file.mimetype === 'audio/x-m4a' || file.mimetype === 'audio/m4a' ? 'audio/mp4' : file.mimetype;
    return this.ai.transcribe({ mimeType, data: new Uint8Array(file.buffer), durationMs: ms });
  }

  @Post('precheck')
  async precheck(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(PrecheckRequestSchema)) body: z.infer<typeof PrecheckRequestSchema>,
  ) {
    const { req } = await this.mySlot(user, id);
    return { requirements: req, checks: precheckCaption(body.caption, req) };
  }
}
