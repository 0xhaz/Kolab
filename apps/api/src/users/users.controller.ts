import { Body, Controller, Get, Patch } from '@nestjs/common';
import { UpdateMeSchema, type Me, type UpdateMe } from '@kolab/shared';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { UsersService } from './users.service.js';
import type { User } from '../generated/prisma/client.js';

@Controller('me')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  me(@CurrentUser() user: User): Me {
    return this.users.toMe(user);
  }

  @Patch()
  async update(
    @CurrentUser() user: User,
    @Body(new ZodPipe(UpdateMeSchema)) body: UpdateMe,
  ): Promise<Me> {
    return this.users.toMe(await this.users.update(user, body));
  }
}
