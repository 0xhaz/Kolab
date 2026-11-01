import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './auth.guard.js';
import { PrivyModule } from './privy.module.js';
import { UsersModule } from '../users/users.module.js';

@Module({
  imports: [PrivyModule, UsersModule],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
export class AuthModule {}
