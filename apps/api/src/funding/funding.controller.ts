import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { CreateFundingSchema, FUNDING_SOURCES, type CreateFunding } from '@kolab/shared';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ZodPipe } from '../common/zod.pipe.js';
import type { User } from '../generated/prisma/client.js';
import { FundingService } from './funding.service.js';

/** Fund a campaign escrow from any chain (Aurora Intents). */
@Controller()
export class FundingController {
  constructor(private readonly funding: FundingService) {}

  @Get('funding/config')
  async config() {
    return { ...(await this.funding.config()), sources: FUNDING_SOURCES };
  }

  @Post('campaigns/:id/funding/quote')
  quote(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(CreateFundingSchema)) body: CreateFunding) {
    return this.funding.quote(user, id, body);
  }

  @Post('campaigns/:id/funding')
  create(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(CreateFundingSchema)) body: CreateFunding) {
    return this.funding.create(user, id, body);
  }

  @Get('campaigns/:id/funding')
  list(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.funding.list(user, id);
  }

  @Get('funding/:id')
  get(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.funding.get(user, id);
  }

  /** Devnet demo only: the cross-chain deposit "arrives". */
  @Post('funding/:id/simulate-deposit')
  simulate(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.funding.simulateDeposit(user, id);
  }
}
