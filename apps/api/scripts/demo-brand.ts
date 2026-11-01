/**
 * Acts as the seeded demo brand (keys/demo-brand.json) until the brand dashboard exists, so the
 * creator app can be tested end to end.
 *
 *   pnpm --filter @kolab/api demo:brand -- list
 *   pnpm --filter @kolab/api demo:brand -- ship <enrollmentId> [trackingRef]
 *   pnpm --filter @kolab/api demo:brand -- approve <slotId>
 *   pnpm --filter @kolab/api demo:brand -- reject <slotId>
 */
import 'dotenv/config';
process.env.WORKERS_ENABLED = '0';

import { NestFactory } from '@nestjs/core';
import {
  getBase64EncodedWireTransaction,
  getBase64Encoder,
  getTransactionDecoder,
  partiallySignTransaction,
} from '@solana/kit';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { CampaignTxService } from '../src/campaigns/campaign-tx.service.js';
import { TxService } from '../src/tx/tx.service.js';
import { IndexerService } from '../src/indexer/indexer.service.js';
import { SolanaService } from '../src/solana/solana.service.js';
import { keypair } from './lib.js';

const [cmd, id, extra] = process.argv.slice(2).filter((a) => a !== '--');
const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
const prisma = app.get(PrismaService);
const brandKey = await keypair('demo-brand');
const brand = await prisma.user.findUniqueOrThrow({ where: { walletPubkey: brandKey.address } });

async function sign(transaction: string) {
  const tx = getTransactionDecoder().decode(getBase64Encoder().encode(transaction));
  const signed = getBase64EncodedWireTransaction(await partiallySignTransaction([brandKey.keyPair], tx));
  const sig = await app.get(TxService).submit(signed, brandKey.address);
  const events = await app.get(IndexerService).ingest(sig);
  console.log(`✓ ${events.map((e) => e.name).join(', ')}  ${app.get(SolanaService).explorerTxUrl(sig)}`);
}

const txs = app.get(CampaignTxService);
if (cmd === 'ship') {
  await sign((await txs.markShipped(brand, id!, 'J&T Express', extra ?? `JT${Date.now().toString().slice(-8)}`)).transaction);
} else if (cmd === 'approve') {
  await sign((await txs.approve(brand, id!)).transaction);
} else if (cmd === 'reject') {
  await sign((await txs.reject(brand, id!, 1)).transaction);
} else {
  const rows = await prisma.enrollment.findMany({
    where: { campaign: { brandId: brand.id } },
    include: { campaign: true, creator: true, slots: { orderBy: { idx: 'asc' } } },
  });
  if (rows.length === 0) console.log('No creators have joined the demo brand’s campaigns yet.');
  for (const e of rows) {
    console.log(`\n${e.campaign.title}\n  enrollment ${e.id}  ${e.status}  creator ${e.creator.email ?? e.creator.walletPubkey}`);
    for (const s of e.slots) console.log(`  slot ${s.id}  #${s.idx + 1} ${s.status}${s.checks !== 'pending' ? ` (checks ${s.checks})` : ''}`);
  }
}
await app.close();
process.exit(0);
