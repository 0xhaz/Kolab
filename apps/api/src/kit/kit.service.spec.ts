import { ForbiddenException } from '@nestjs/common';
import { KitService } from './kit.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { StorageService } from '../uploads/storage.service.js';
import type { UploadLinksService } from '../uploads/upload-links.service.js';
import type { User } from '../generated/prisma/client.js';

const campaign = (enrolled: boolean) => ({
  id: 'c1',
  brandId: 'brand-1',
  brandName: 'Glow Lab MY',
  kitColors: ['#F97316', '#7C3AED'],
  kitNotes: null,
  brandAssets: [
    { id: 'a1', uploadId: 'u1', kind: 'logo', sort: 0 },
    { id: 'a2', uploadId: 'u2', kind: 'product', sort: 1 },
  ],
  enrollments: enrolled ? [{ id: 'e1' }] : [],
});

function service(enrolled: boolean) {
  const prisma = {
    campaign: { findUnique: vi.fn(async () => campaign(enrolled)) },
    upload: {
      findMany: vi.fn(async () => [
        { id: 'u1', storage: 'local', storageKey: 'a.png', mime: 'image/png' },
        { id: 'u2', storage: 'local', storageKey: 'b.jpg', mime: 'image/jpeg' },
      ]),
    },
  } as unknown as PrismaService;
  const links = { link: (u: { id: string }) => `/uploads/${u.id}/raw?sig=x` } as unknown as UploadLinksService;
  return new KitService(prisma, {} as StorageService, links);
}

describe('KitService.get (kit unlocks only after joining)', () => {
  it('lets a creator who joined see the kit with signed links', async () => {
    const kit = await service(true).get({ id: 'creator-1' } as User, 'c1');
    expect(kit.logo?.url).toBe('/uploads/u1/raw?sig=x');
    expect(kit.products).toHaveLength(1);
  });

  it('lets the brand see its own kit', async () => {
    await expect(service(false).get({ id: 'brand-1' } as User, 'c1')).resolves.toMatchObject({ colors: ['#F97316', '#7C3AED'] });
  });

  it('locks the kit for a creator who has not joined', async () => {
    await expect(service(false).get({ id: 'creator-2' } as User, 'c1')).rejects.toBeInstanceOf(ForbiddenException);
  });
});
