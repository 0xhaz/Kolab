import { Module } from '@nestjs/common';
import { TxController } from './tx.controller.js';
import { TxService } from './tx.service.js';

@Module({
  controllers: [TxController],
  providers: [TxService],
  exports: [TxService],
})
export class TxModule {}
