import { Module } from '@nestjs/common';
import { TxModule } from '../tx/tx.module.js';
import { CampaignsModule } from '../campaigns/campaigns.module.js';
import { VerifierService } from './verifier.service.js';
import { WebhooksController } from './webhooks.controller.js';

@Module({
  imports: [TxModule, CampaignsModule],
  controllers: [WebhooksController],
  providers: [VerifierService],
  exports: [VerifierService],
})
export class VerifierModule {}
