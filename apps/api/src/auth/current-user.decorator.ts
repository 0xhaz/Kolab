import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { User } from '../generated/prisma/client.js';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): User => ctx.switchToHttp().getRequest().user,
);
