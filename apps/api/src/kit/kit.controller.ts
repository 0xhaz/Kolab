import { Body, Controller, Get, Param, ParseUUIDPipe, Put, Res } from '@nestjs/common';
import type { Response } from 'express';
import { BrandKitSchema, type BrandKitInput } from '@kolab/shared';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { Public } from '../auth/public.decorator.js';
import { ZodPipe } from '../common/zod.pipe.js';
import type { User } from '../generated/prisma/client.js';
import { KitService } from './kit.service.js';

@Controller('campaigns/:id')
export class KitController {
  constructor(private readonly kit: KitService) {}

  @Put('kit')
  set(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(BrandKitSchema)) body: BrandKitInput) {
    return this.kit.set(user, id, body);
  }

  @Get('kit')
  get(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.kit.get(user, id);
  }

  @Public()
  @Get('cover')
  async cover(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const { up, access } = await this.kit.cover(id);
    if (access.kind === 'redirect') return res.redirect(access.url);
    res.setHeader('content-type', up.mime);
    res.setHeader('cache-control', 'public, max-age=3600');
    access.stream.pipe(res);
  }
}
