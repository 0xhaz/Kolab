import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Me, UpdateMe } from '@kolab/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { PrivyService } from '../auth/privy.service.js';
import type { User } from '../generated/prisma/client.js';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly privy: PrivyService,
  ) {}

  /**
   * Maps a verified Privy user to our `users` row. Email and wallet always come from Privy,
   * never from the client (design rule: identity comes from the authenticated session).
   */
  async findOrCreate(privyId: string): Promise<User> {
    const existing = await this.prisma.user.findUnique({ where: { privyId } });
    // The embedded wallet is created right after first login, so keep syncing until we have it.
    if (existing?.walletPubkey) return existing;

    // A deleted account's token can outlive the Privy user; treat it as signed out.
    const identity = await this.privy.identity(privyId).catch(() => {
      throw new UnauthorizedException({ code: 'account_not_found' });
    });
    return this.prisma.user.upsert({
      where: { privyId },
      create: { privyId, email: identity.email, walletPubkey: identity.solanaAddress },
      update: { email: identity.email, walletPubkey: identity.solanaAddress },
    });
  }

  async update(user: User, patch: UpdateMe): Promise<User> {
    // Role is chosen once; switching later would let a creator act as a brand (and vice versa).
    if (patch.role && user.role && patch.role !== user.role) {
      throw new ConflictException({ code: 'role_already_set', role: user.role });
    }
    return this.prisma.user.update({ where: { id: user.id }, data: patch });
  }

  toMe(user: User): Me {
    return {
      id: user.id,
      role: user.role,
      displayName: user.displayName,
      email: user.email,
      walletPubkey: user.walletPubkey,
      locale: user.locale,
    };
  }
}
