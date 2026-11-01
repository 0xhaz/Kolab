import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC } from './public.decorator.js';
import { PrivyService } from './privy.service.js';
import { UsersService } from '../users/users.service.js';

/** Verifies the Privy access token and attaches the Kolab `users` row as `req.user`. */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly privy: PrivyService,
    private readonly users: UsersService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw new UnauthorizedException('Missing access token');

    let privyId: string;
    try {
      privyId = await this.privy.verify(token);
    } catch {
      throw new UnauthorizedException('Invalid access token');
    }

    req.user = await this.users.findOrCreate(privyId);
    return true;
  }
}
