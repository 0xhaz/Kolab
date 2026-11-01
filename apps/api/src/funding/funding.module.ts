import { Module } from '@nestjs/common';
import { CampaignsModule } from '../campaigns/campaigns.module.js';
import { TxModule } from '../tx/tx.module.js';
import { IndexerModule } from '../indexer/indexer.module.js';
import { AuroraClient } from './aurora.client.js';
import { FundingController } from './funding.controller.js';
import { FundingService } from './funding.service.js';
import { CashoutController } from './cashout.controller.js';
import { CashoutService } from './cashout.service.js';

@Module({
  imports: [CampaignsModule, TxModule, IndexerModule],
  controllers: [FundingController, CashoutController],
  providers: [AuroraClient, FundingService, CashoutService],
})
export class FundingModule {}
