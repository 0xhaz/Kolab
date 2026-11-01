import { Module } from '@nestjs/common';
import { TxModule } from '../tx/tx.module.js';
import { CampaignsController } from './campaigns.controller.js';
import { BrandController } from './brand.controller.js';
import { CreatorKitController } from './creator-kit.controller.js';
import { AiModule } from '../ai/ai.module.js';
import { CampaignsService } from './campaigns.service.js';
import { CampaignTxService } from './campaign-tx.service.js';
import { ProfileService } from './profile.service.js';
import { ApplicationsService } from './applications.service.js';
import { ProfilesController } from './profiles.controller.js';

@Module({
  imports: [TxModule, AiModule],
  controllers: [CampaignsController, BrandController, CreatorKitController, ProfilesController],
  providers: [CampaignsService, CampaignTxService, ProfileService, ApplicationsService],
  exports: [CampaignsService, CampaignTxService, ProfileService],
})
export class CampaignsModule {}
