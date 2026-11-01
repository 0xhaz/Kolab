import { Module } from '@nestjs/common';
import { TxModule } from '../tx/tx.module.js';
import { AccountController } from './account.controller.js';
import { AccountService } from './account.service.js';

@Module({ imports: [TxModule], controllers: [AccountController], providers: [AccountService] })
export class AccountModule {}
