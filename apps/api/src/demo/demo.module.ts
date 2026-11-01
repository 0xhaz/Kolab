import { Module } from '@nestjs/common';
import { TxModule } from '../tx/tx.module.js';
import { CrankModule } from '../crank/crank.module.js';
import { VerifierModule } from '../verifier/verifier.module.js';
import { CampaignsModule } from '../campaigns/campaigns.module.js';
import { KitModule } from '../kit/kit.module.js';
import { DemoController } from './demo.controller.js';
import { DemoService } from './demo.service.js';

@Module({
  imports: [TxModule, CrankModule, VerifierModule, CampaignsModule, KitModule],
  controllers: [DemoController],
  providers: [DemoService],
  exports: [DemoService],
})
export class DemoModule {}
