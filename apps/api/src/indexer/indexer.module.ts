import { Global, Module } from '@nestjs/common';
import { IndexerService } from './indexer.service.js';
import { MirrorService } from './mirror.service.js';

@Global()
@Module({
  providers: [IndexerService, MirrorService],
  exports: [IndexerService, MirrorService],
})
export class IndexerModule {}
