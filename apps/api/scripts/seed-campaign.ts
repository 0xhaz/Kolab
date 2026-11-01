/**
 * Creates a funded campaign owned by a script-held demo brand (keys/demo-brand.json), so the
 * creator app has something to join before the brand dashboard exists.
 *
 *   pnpm --filter @kolab/api seed:campaign                 4-post monthly package, 10 USDC each
 *   pnpm --filter @kolab/api seed:campaign -- --shipping   same, product shipped first (MY → ID)
 *   pnpm --filter @kolab/api seed:campaign -- --per-sale   5 USDC per confirmed sale
 */
import 'dotenv/config';
process.env.WORKERS_ENABLED = '0';
process.env.DEMO_MODE = '1';

import { NestFactory } from '@nestjs/core';
import {
  getBase64EncodedWireTransaction,
  getBase64Encoder,
  getTransactionDecoder,
  partiallySignTransaction,
} from '@solana/kit';
import type { CreateCampaign } from '@kolab/shared';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { CampaignsService } from '../src/campaigns/campaigns.service.js';
import { CampaignTxService } from '../src/campaigns/campaign-tx.service.js';
import { TxService } from '../src/tx/tx.service.js';
import { IndexerService } from '../src/indexer/indexer.service.js';
import { DemoService } from '../src/demo/demo.service.js';
import { keypair } from './lib.js';
import { demoCampaigns } from '../src/demo/seed-templates.js';

const shipping = process.argv.includes('--shipping');
const perSale = process.argv.includes('--per-sale');

const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
const prisma = app.get(PrismaService);
const brandKey = await keypair('demo-brand', true);
const brand = await prisma.user.upsert({
  where: { walletPubkey: brandKey.address },
  create: { privyId: `script:${brandKey.address}`, walletPubkey: brandKey.address, role: 'brand', displayName: 'Glow Lab MY', email: 'brand@glowlab.test' },
  update: {},
});

await app.get(DemoService).faucet(brandKey.address, 200);

const t = demoCampaigns();
const input: CreateCampaign = perSale ? t.perSale : shipping ? t.shipping : t.monthly;

const draft = await app.get(CampaignsService).create(brand, input);
const { transaction } = await app.get(CampaignTxService).createAndFund(brand, draft.id);
const tx = getTransactionDecoder().decode(getBase64Encoder().encode(transaction));
const signed = getBase64EncodedWireTransaction(await partiallySignTransaction([brandKey.keyPair], tx));
const sig = await app.get(TxService).submit(signed, brandKey.address);
await app.get(IndexerService).ingest(sig);

const row = await prisma.campaign.findUniqueOrThrow({ where: { id: draft.id } });
console.log(`\n${row.title}\n  id      ${row.id}\n  status  ${row.status}, funded ${Number(row.totalFunded) / 1e6} USDC\n  link    kolab://campaign/${row.id}`);
await app.close();
process.exit(0);
