/**
 * Attaches the generated Glow Lab brand kit to every Glow Lab demo campaign that has none.
 *   pnpm --filter @kolab/api demo:kits
 */
import 'dotenv/config';
process.env.WORKERS_ENABLED = '0';
process.env.DEMO_MODE = '1';

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { DemoService } from '../src/demo/demo.service.js';
import { demoCampaigns } from '../src/demo/seed-templates.js';

const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
const prisma = app.get(PrismaService);
const titles = Object.values(demoCampaigns()).map((t) => t.title);
const brands = await prisma.user.findMany({ where: { campaigns: { some: { title: { in: titles }, kitReady: false } } } });
for (const b of brands) {
  const n = await app.get(DemoService).attachDemoKits(b);
  console.log(`${b.email ?? b.id}: brand kit added to ${n} campaign(s)`);
}
if (brands.length === 0) console.log('All Glow Lab demo campaigns already have a brand kit.');
await app.close();
process.exit(0);
