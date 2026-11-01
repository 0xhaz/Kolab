import { Global, Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway.js';
import { UsersModule } from '../users/users.module.js';

@Global()
@Module({
  imports: [UsersModule],
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
