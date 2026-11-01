import './common/bigint-json.js';
import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from './config/config.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { SolanaModule } from './solana/solana.module.js';
import { TxModule } from './tx/tx.module.js';
import { RealtimeModule } from './realtime/realtime.module.js';
import { IndexerModule } from './indexer/indexer.module.js';
import { JobsModule } from './jobs/jobs.module.js';
import { CampaignsModule } from './campaigns/campaigns.module.js';
import { CrankModule } from './crank/crank.module.js';
import { DemoModule } from './demo/demo.module.js';
import { VerifierModule } from './verifier/verifier.module.js';
import { AiModule } from './ai/ai.module.js';
import { UploadsModule } from './uploads/uploads.module.js';
import { KitModule } from './kit/kit.module.js';
import { FundingModule } from './funding/funding.module.js';
import { AccountModule } from './account/account.module.js';
import { HealthController } from './health/health.controller.js';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV === 'production' ? undefined : { target: 'pino-pretty' },
        // Never log tokens (techstacks §13).
        redact: ['req.headers.authorization', 'req.headers.cookie'],
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    ConfigModule,
    PrismaModule,
    AuthModule,
    UsersModule,
    SolanaModule,
    TxModule,
    RealtimeModule,
    IndexerModule,
    JobsModule,
    CampaignsModule,
    CrankModule,
    VerifierModule,
    AiModule,
    UploadsModule,
    KitModule,
    FundingModule,
    AccountModule,
    DemoModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
