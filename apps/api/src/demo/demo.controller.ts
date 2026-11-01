import { Body, Controller, ForbiddenException, Get, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ZodPipe } from '../common/zod.pipe.js';
import type { User } from '../generated/prisma/client.js';
import { CrankService } from '../crank/crank.service.js';
import { DemoService } from './demo.service.js';

const IdSchema = z.object({ id: z.uuid() });
const ClockSchema = z.object({ offsetSecs: z.number().int().min(0).max(365 * 86_400) });

/** Demo control panel endpoints (architecture §9.1). Every route is DEMO_MODE only. */
@Controller('demo')
export class DemoController {
  constructor(
    private readonly demo: DemoService,
    private readonly crank: CrankService,
  ) {}

  /** 1,000 test USDC to the caller's wallet. */
  @Post('faucet')
  faucet(@CurrentUser() user: User) {
    if (!user.walletPubkey) throw new ForbiddenException({ code: 'wallet_not_ready' });
    return this.demo.faucet(user.walletPubkey);
  }

  /** auto_release / mark_missed / confirm_received / still-live now instead of on the minute tick. */
  @Post('crank')
  runCrank() {
    this.demo.assertDemo();
    return this.crank.sweep();
  }

  @Get('clock')
  readClock() {
    return this.demo.readClock();
  }

  @Post('clock')
  clock(@Body(new ZodPipe(ClockSchema)) body: z.infer<typeof ClockSchema>) {
    return this.demo.setClock(body.offsetSecs);
  }

  @Post('fire-sale')
  fireSale(@Body(new ZodPipe(IdSchema)) body: z.infer<typeof IdSchema>) {
    return this.demo.fireSale(body.id);
  }

  @Post('delete-post')
  deletePost(@Body(new ZodPipe(IdSchema)) body: z.infer<typeof IdSchema>) {
    return this.demo.deletePost(body.id);
  }

  @Post('deliver-parcel')
  deliverParcel(@Body(new ZodPipe(IdSchema)) body: z.infer<typeof IdSchema>) {
    return this.demo.deliverParcel(body.id);
  }

  @Post('still-live')
  stillLive() {
    return this.demo.stillLiveNow();
  }

  /** Glow Lab demo campaigns for the signed-in brand (returns transactions to sign). */
  @Post('seed')
  seed(@CurrentUser() user: User) {
    return this.demo.seedForBrand(user);
  }

  @Post('reset')
  reset() {
    return this.demo.reset();
  }
}
