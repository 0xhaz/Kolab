import { Body, Controller, ForbiddenException, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import {
  CreateCampaignSchema,
  MarkShippedSchema,
  ShippingAddressSchema,
  RejectSlotSchema,
  SubmitSlotSchema,
  type CampaignDto,
  type CreateCampaign,
  type MarkShipped,
  type ShippingAddress,
  type RejectSlot,
  type SubmitSlot,
  type UnsignedTx,
} from '@kolab/shared';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ZodPipe } from '../common/zod.pipe.js';
import type { User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CampaignsService, toCampaignDto } from './campaigns.service.js';
import { CampaignTxService } from './campaign-tx.service.js';

@Controller()
export class CampaignsController {
  constructor(
    private readonly campaigns: CampaignsService,
    private readonly tx: CampaignTxService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('campaigns')
  async create(
    @CurrentUser() user: User,
    @Body(new ZodPipe(CreateCampaignSchema)) body: CreateCampaign,
  ): Promise<CampaignDto> {
    return toCampaignDto(await this.campaigns.create(user, body));
  }

  @Get('campaigns')
  async list(@CurrentUser() user: User): Promise<CampaignDto[]> {
    return (await this.campaigns.list(user)).map(toCampaignDto);
  }

  /** Brand sees every enrollment; a creator sees the campaign plus only their own enrollment. */
  @Get('campaigns/:id')
  async detail(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    const c = await this.campaigns.detail(id);
    if (!c) throw new ForbiddenException({ code: 'campaign_not_found' });
    const isBrand = c.brandId === user.id;
    if (!isBrand && c.status === 'draft') throw new ForbiddenException({ code: 'campaign_not_found' });
    const enrollments = (isBrand ? c.enrollments : c.enrollments.filter((e) => e.creatorId === user.id)).map(
      ({ shippingAddressSealed, ...e }) => ({ ...e, hasAddress: !!shippingAddressSealed }),
    );
    return { ...toCampaignDto(c), enrollments };
  }

  @Get('me/enrollments')
  async myEnrollments(@CurrentUser() user: User) {
    const rows = await this.prisma.enrollment.findMany({
      where: { creatorId: user.id, campaign: { programId: this.campaigns.programId } },
      include: { campaign: true, slots: { orderBy: { idx: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(({ shippingAddressSealed, campaign, ...e }) => ({
      ...e,
      hasAddress: !!shippingAddressSealed,
      campaign: toCampaignDto(campaign),
    }));
  }

  @Post('campaigns/:id/tx/create-and-fund')
  createAndFund(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string): Promise<UnsignedTx> {
    return this.tx.createAndFund(user, id);
  }

  /** Creates the on-chain escrow without funding it (it is then funded from any chain). */
  @Post('campaigns/:id/tx/create')
  createOnly(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string): Promise<UnsignedTx> {
    return this.tx.createAndFund(user, id, false);
  }

  @Post('campaigns/:id/tx/enroll')
  enroll(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string): Promise<UnsignedTx> {
    return this.tx.enroll(user, id);
  }

  @Put('enrollments/:id/address')
  saveAddress(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(ShippingAddressSchema)) body: ShippingAddress,
  ) {
    return this.campaigns.saveAddress(user, id, body);
  }

  @Get('enrollments/:id/address')
  readAddress(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.campaigns.readAddress(user, id);
  }

  @Post('enrollments/:id/tx/mark-shipped')
  markShipped(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(MarkShippedSchema)) body: MarkShipped,
  ): Promise<UnsignedTx> {
    return this.tx.markShipped(user, id, body.courier, body.trackingRef);
  }

  @Post('enrollments/:id/tx/confirm-received')
  confirmReceived(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string): Promise<UnsignedTx> {
    return this.tx.confirmReceived(user, id);
  }

  @Post('enrollments/:id/tx/report-not-received')
  reportNotReceived(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string): Promise<UnsignedTx> {
    return this.tx.reportNotReceived(user, id);
  }

  @Post('enrollments/:id/tx/cancel')
  cancelEnrollment(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string): Promise<UnsignedTx> {
    return this.tx.cancelEnrollment(user, id);
  }

  @Post('enrollments/:id/tx/claim-sales')
  claimSales(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string): Promise<UnsignedTx> {
    return this.tx.claimSales(user, id);
  }

  @Post('slots/:id/tx/submit')
  submit(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(SubmitSlotSchema)) body: SubmitSlot,
  ): Promise<UnsignedTx> {
    return this.tx.submit(user, id, body);
  }

  @Post('slots/:id/tx/approve')
  approve(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string): Promise<UnsignedTx> {
    return this.tx.approve(user, id);
  }

  @Post('slots/:id/tx/reject')
  reject(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(RejectSlotSchema)) body: RejectSlot,
  ): Promise<UnsignedTx> {
    return this.tx.reject(user, id, body.reasonCode ?? 0);
  }
}
