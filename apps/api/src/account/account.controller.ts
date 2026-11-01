import { Body, Controller, Delete, Get, Post } from '@nestjs/common';
import { DeleteAccountSchema, WithdrawSchema, type UnsignedTx, type Withdraw } from '@kolab/shared';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ZodPipe } from '../common/zod.pipe.js';
import type { User } from '../generated/prisma/client.js';
import { AccountService } from './account.service.js';

@Controller()
export class AccountController {
  constructor(private readonly account: AccountService) {}

  /** Plain USDC send to any Solana address (the store-safe "withdraw"). */
  @Post('tx/withdraw')
  withdraw(@CurrentUser() user: User, @Body(new ZodPipe(WithdrawSchema)) body: Withdraw): Promise<UnsignedTx> {
    return this.account.withdraw(user, body);
  }

  @Get('me/deletion')
  deletionCheck(@CurrentUser() user: User) {
    return this.account.deletionCheck(user);
  }

  /** In-app account deletion (Apple 5.1.1(v), Google Play). Body: { confirm: "DELETE" }. */
  @Delete('me')
  delete(@CurrentUser() user: User, @Body(new ZodPipe(DeleteAccountSchema)) _body: unknown) {
    return this.account.delete(user);
  }
}
