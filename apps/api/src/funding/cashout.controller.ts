import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { CashoutSentSchema, CreateCashoutSchema, type CreateCashout, type UnsignedTx } from '@kolab/shared';
import { z } from 'zod';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ZodPipe } from '../common/zod.pipe.js';
import type { User } from '../generated/prisma/client.js';
import { CashoutService } from './cashout.service.js';

/** Cash out USDC to any chain/asset (Aurora Intents Swap API). Creators and brands alike. */
@Controller('cashouts')
export class CashoutController {
  constructor(private readonly cashouts: CashoutService) {}

  @Post('quote')
  quote(@CurrentUser() user: User, @Body(new ZodPipe(CreateCashoutSchema)) body: CreateCashout) {
    return this.cashouts.quote(user, body);
  }

  @Post()
  create(@CurrentUser() user: User, @Body(new ZodPipe(CreateCashoutSchema)) body: CreateCashout) {
    return this.cashouts.create(user, body);
  }

  @Get()
  list(@CurrentUser() user: User) {
    return this.cashouts.list(user);
  }

  @Get(':id')
  get(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.cashouts.get(user, id);
  }

  /** The USDC transfer to Aurora's deposit address, for the user's wallet to sign. */
  @Post(':id/tx')
  tx(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string): Promise<UnsignedTx> {
    return this.cashouts.buildTx(user, id);
  }

  @Post(':id/sent')
  sent(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(CashoutSentSchema)) body: z.infer<typeof CashoutSentSchema>) {
    return this.cashouts.sent(user, id, body.signature);
  }
}
