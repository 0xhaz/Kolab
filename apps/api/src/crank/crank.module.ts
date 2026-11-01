import { Module } from '@nestjs/common';
import { CampaignsModule } from '../campaigns/campaigns.module.js';
import { TxModule } from '../tx/tx.module.js';
import { VerifierModule } from '../verifier/verifier.module.js';
import { CrankService } from './crank.service.js';

@Module({
  imports: [CampaignsModule, TxModule, VerifierModule],
  providers: [CrankService],
  exports: [CrankService],
})
export class CrankModule {}
