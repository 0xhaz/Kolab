import { ConflictException } from '@nestjs/common';
import { UsersService } from './users.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { PrivyService } from '../auth/privy.service.js';
import type { User } from '../generated/prisma/client.js';

function setup(role: User['role']) {
  const user = { id: 'u1', role } as User;
  const update = vi.fn(async ({ data }) => ({ ...user, ...data }));
  const prisma = { user: { update } } as unknown as PrismaService;
  return { service: new UsersService(prisma, {} as PrivyService), user, update };
}

describe('UsersService.update role', () => {
  it('lets a new user pick a role', async () => {
    const { service, user } = setup(null);
    await expect(service.update(user, { role: 'brand' })).resolves.toMatchObject({ role: 'brand' });
  });

  it('accepts re-sending the same role', async () => {
    const { service, user } = setup('creator');
    await expect(service.update(user, { role: 'creator' })).resolves.toMatchObject({
      role: 'creator',
    });
  });

  it('refuses to switch an existing role', async () => {
    const { service, user, update } = setup('creator');
    await expect(service.update(user, { role: 'brand' })).rejects.toBeInstanceOf(ConflictException);
    expect(update).not.toHaveBeenCalled();
  });
});
