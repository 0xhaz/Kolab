import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import {
  AddSampleSchema,
  ApplySchema,
  UpdateProfileSchema,
  type AddSample,
  type Apply,
  type UnsignedTx,
  type UpdateProfile,
} from '@kolab/shared';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ZodPipe } from '../common/zod.pipe.js';
import type { User } from '../generated/prisma/client.js';
import { ApplicationsService } from './applications.service.js';
import { CampaignsService } from './campaigns.service.js';
import { ProfileService } from './profile.service.js';

/** Creator profiles, applications to selective campaigns, and two-sided reputation. */
@Controller()
export class ProfilesController {
  constructor(
    private readonly profiles: ProfileService,
    private readonly applications: ApplicationsService,
    private readonly campaigns: CampaignsService,
  ) {}

  @Get('me/profile')
  async myProfile(@CurrentUser() user: User) {
    return (await this.profiles.profiles([user.id]))[0];
  }

  @Put('me/profile')
  updateProfile(@CurrentUser() user: User, @Body(new ZodPipe(UpdateProfileSchema)) body: UpdateProfile) {
    return this.profiles.update(user, body);
  }

  @Post('me/samples')
  addSample(@CurrentUser() user: User, @Body(new ZodPipe(AddSampleSchema)) body: AddSample) {
    return this.profiles.addSample(user, body);
  }

  @Delete('me/samples/:id')
  removeSample(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.profiles.removeSample(user, id);
  }

  @Post('campaigns/:id/apply')
  apply(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(ApplySchema)) body: Apply) {
    return this.applications.apply(user, id, body);
  }

  @Get('campaigns/:id/application')
  myApplication(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.applications.mine(user, id);
  }

  @Get('campaigns/:id/applications')
  forCampaign(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.applications.forCampaign(user, id);
  }

  @Post('applications/:id/tx/accept')
  accept(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string): Promise<UnsignedTx> {
    return this.applications.acceptTx(user, id);
  }

  @Post('applications/:id/decline')
  decline(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.applications.decline(user, id);
  }

  /** Shown to creators before they apply: how this brand has treated creators so far. */
  @Get('campaigns/:id/brand-reputation')
  async brandReputation(@Param('id', ParseUUIDPipe) id: string) {
    const c = await this.campaigns.get(id);
    return this.profiles.brandReputation(c.brandId);
  }
}
