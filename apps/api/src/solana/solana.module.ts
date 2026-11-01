import { Global, Module } from '@nestjs/common';
import { SolanaService } from './solana.service.js';
import { ProgramService } from './program.service.js';

@Global()
@Module({
  providers: [SolanaService, ProgramService],
  exports: [SolanaService, ProgramService],
})
export class SolanaModule {}
