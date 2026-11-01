/**
 * Devnet integration check for the day 6–7 milestone ("a slot goes submit → auto-release driven
 * from the API"). Boots the real Nest services with local keypairs standing in for the Privy
 * wallets, and goes through the same build → user-sign → submit → index path the apps use.
 *
 *   pnpm --filter @kolab/api devnet:flow
 */
import 'dotenv/config';
process.env.WORKERS_ENABLED = '0';
process.env.DEMO_MODE = '1';

import { NestFactory } from '@nestjs/core';
import {
  generateKeyPairSigner,
  getBase64EncodedWireTransaction,
  getBase64Encoder,
  getTransactionDecoder,
  partiallySignTransaction,
  type KeyPairSigner,
} from '@solana/kit';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { CampaignsService } from '../src/campaigns/campaigns.service.js';
import { CampaignTxService } from '../src/campaigns/campaign-tx.service.js';
import { TxService } from '../src/tx/tx.service.js';
import { IndexerService } from '../src/indexer/indexer.service.js';
import { CrankService } from '../src/crank/crank.service.js';
import { DemoService } from '../src/demo/demo.service.js';
import { SolanaService } from '../src/solana/solana.service.js';
import { VerifierService } from '../src/verifier/verifier.service.js';
import { findAssociatedTokenPda, TOKEN_PROGRAM_ADDRESS } from '@solana-program/token';
import type { Address } from '@solana/kit';
import { createHash, randomBytes } from 'node:crypto';
import { UploadsController } from '../src/uploads/uploads.controller.js';
import { ProfileService } from '../src/campaigns/profile.service.js';
import { ApplicationsService } from '../src/campaigns/applications.service.js';
import { FundingService } from '../src/funding/funding.service.js';
import { CashoutService } from '../src/funding/cashout.service.js';
import { AccountService } from '../src/account/account.service.js';

const REVIEW_SECS = 60;
const step = (s: string) => console.log(`\n▸ ${s}`);

async function sign(wire: string, signer: KeyPairSigner) {
  const tx = getTransactionDecoder().decode(getBase64Encoder().encode(wire));
  return getBase64EncodedWireTransaction(await partiallySignTransaction([signer.keyPair], tx));
}

const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
const prisma = app.get(PrismaService);
const campaigns = app.get(CampaignsService);
const campaignTx = app.get(CampaignTxService);
const tx = app.get(TxService);
const indexer = app.get(IndexerService);
const crank = app.get(CrankService);
const demo = app.get(DemoService);
const solana = app.get(SolanaService);
const verifier = app.get(VerifierService);
const profiles = app.get(ProfileService);
const applications = app.get(ApplicationsService);
const funding = app.get(FundingService);
const cashouts = app.get(CashoutService);
const account = app.get(AccountService);
const MOCK = process.env.MOCK_BASE_URL ?? 'http://localhost:4110';
const results: Array<[string, boolean]> = [];
const check = (label: string, ok: boolean) => {
  results.push([label, ok]);
  console.log(`  ${ok ? '✓' : '✗'} ${label}`);
};
async function usdc(owner: Address): Promise<number> {
  // the configured program's test USDC mint (never another deployment's)
  const [ata] = await findAssociatedTokenPda({ owner, mint: process.env.USDC_MINT as Address, tokenProgram: TOKEN_PROGRAM_ADDRESS });
  try {
    const { value } = await solana.rpc.getTokenAccountBalance(ata).send();
    return Number(value.amount) / 1e6;
  } catch {
    return 0;
  }
}

const brandKey = await generateKeyPairSigner();
const creatorKey = await generateKeyPairSigner();
const tag = brandKey.address.slice(0, 6);
const brand = await prisma.user.create({
  data: { privyId: `script:${brandKey.address}`, walletPubkey: brandKey.address, role: 'brand', email: `brand-${tag}@kolab.test` },
});
const creator = await prisma.user.create({
  data: { privyId: `script:${creatorKey.address}`, walletPubkey: creatorKey.address, role: 'creator', email: `creator-${tag}@kolab.test` },
});

async function userSubmit(wire: string, signer: KeyPairSigner, label: string) {
  const sig = await tx.submit(await sign(wire, signer), signer.address);
  const events = await indexer.ingest(sig);
  console.log(`  ✓ ${label}: ${events.map((e) => e.name).join(', ') || '(no events)'}  ${solana.explorerTxUrl(sig)}`);
  return sig;
}

step('faucet: 100 test USDC to brand');
const f = await demo.faucet(brandKey.address, 100);
console.log(`  ✓ ${f.explorerUrl}`);

step('brand creates draft (1 post slot, 10 USDC, 60s review window)');
const draft = await campaigns.create(brand, {
  title: `Devnet flow ${tag}`,
  type: 'per_post',
  budgetUsdc: 20,
  slots: [{ kind: 'post', amountUsdc: 10, dueDays: 3 }],
  reviewWindowSecs: REVIEW_SECS,
  graceSecs: 3600,
  holdbackPct: 30,
  durationDays: 7,
});
console.log(`  ✓ draft ${draft.id} → PDA ${draft.onchainPubkey}`);

step('brand signs create_campaign + fund_campaign');
await userSubmit((await campaignTx.createAndFund(brand, draft.id)).transaction, brandKey, 'create+fund');

step('selective campaign: joining before the brand approves is refused');
await campaignTx.enroll(creator, draft.id).then(
  () => {
    throw new Error('enroll should require approval');
  },
  (e: { response?: { code?: string } }) => {
    if (e.response?.code !== 'not_approved') throw e;
    console.log('  ✓ not_approved');
  },
);

step('creator fills in a profile and applies');
await profiles.update(creator, { niches: ['Skincare'], channels: [{ platform: 'tiktok', handle: `@flow${tag}`, followers: 4200 }] });
await profiles.addSample(creator, { url: `https://www.tiktok.com/@flow${tag}/video/1` });
const application = await applications.apply(creator, draft.id, { pitch: 'Daily skincare routines for oily skin in Malaysia.' });
console.log(`  ✓ application ${application.id} ${application.status}`);

step('brand accepts: approve_creator on-chain, indexer marks it accepted');
await userSubmit((await applications.acceptTx(brand, application.id)).transaction, brandKey, 'approve_creator');
const accepted = await prisma.application.findUniqueOrThrow({ where: { id: application.id } });
if (accepted.status !== 'accepted') throw new Error(`application is ${accepted.status}`);
console.log('  ✓ accepted');

step('creator enrolls (enroll_creator + init_slot) with the approval');
await userSubmit((await campaignTx.enroll(creator, draft.id)).transaction, creatorKey, 'enroll');
const slot = await prisma.slot.findFirstOrThrow({ where: { enrollment: { creatorId: creator.id } } });
console.log(`  ✓ slot ${slot.id} status=${slot.status} due=${slot.dueAt?.toISOString()}`);

step('creator submits a post URL');
await userSubmit((await campaignTx.submit(creator, slot.id, { url: `https://www.tiktok.com/@flow${tag}/video/${tag}` })).transaction, creatorKey, 'submit');

step('brand stays silent; crank before the window closes');
const early = await crank.sweep();
console.log(`  ✓ sweep: ${JSON.stringify(early)} (expect autoReleased 0)`);

step(`waiting ${REVIEW_SECS + 5}s for the review window`);
await new Promise((r) => setTimeout(r, (REVIEW_SECS + 5) * 1000));

step('crank sweep');
const swept = await crank.sweep();
console.log(`  ✓ sweep: ${JSON.stringify(swept)}`);

// The running API's own crank may have released it first; wait until the mirror shows it.
let after = await prisma.slot.findUniqueOrThrow({ where: { id: slot.id } });
for (let i = 0; i < 20 && after.status === 'submitted'; i++) {
  await indexer.poll();
  await new Promise((r) => setTimeout(r, 1500));
  after = await prisma.slot.findUniqueOrThrow({ where: { id: slot.id } });
}
const camp = await prisma.campaign.findUniqueOrThrow({ where: { id: draft.id } });
console.log(`\nResult: slot ${after.status}, holdback ${Number(after.holdback) / 1e6} USDC, creator ${await usdc(creatorKey.address)} USDC`);
console.log(`Campaign totals: funded ${Number(camp.totalFunded) / 1e6}, released ${Number(camp.totalReleased) / 1e6}, fees ${Number(camp.totalFees) / 1e6}`);
check('crank did nothing before the review window closed', early.autoReleased === 0);
check('auto-release paid the creator the full 7 USDC (70% of 10; fee on top)', after.status === 'released' && (await usdc(creatorKey.address)) === 7);

// ------------------------------------------------------------------ phase 2: verifier + holdback
step('verifier: submission checks were attested on-chain');
const checks = await prisma.checkResult.findMany({ where: { submission: { slotId: slot.id } } });
console.log(`  ${checks.map((c) => `${c.checkType}=${c.passed ? 'pass' : 'fail'}`).join(', ')}`);
check('checks passed and attested (slot.checks = passed)', after.checks === 'passed' && checks.length >= 4 && checks.every((c) => c.passed && !!c.attestedTx));

step('demo: creator deletes the post → still-live check');
const brandBefore = await usdc(brandKey.address);
await demo.deletePost(slot.id);
const live = await verifier.stillLive(slot.id);
const forfeited = await prisma.slot.findUniqueOrThrow({ where: { id: slot.id } });
console.log(`  attest_live(still_live=${live?.stillLive}) ${live ? solana.explorerTxUrl(live.signature) : ''}`);
check('deleted post returns the 3 USDC holdback + 0.15 fee reservation to the brand', forfeited.status === 'holdback_forfeited' && Math.abs((await usdc(brandKey.address)) - brandBefore - 3.15) < 1e-9);

// ------------------------------------------------------------------ phase 3: per-sale via webhook
step('per-sale campaign: 5 USDC per sale, funded 20');
const ps = await campaigns.create(brand, { title: `Per-sale ${tag}`, type: 'per_sale', budgetUsdc: 20, perSaleUsdc: 5, durationDays: 7, selective: false });
await userSubmit((await campaignTx.createAndFund(brand, ps.id)).transaction, brandKey, 'create+fund');
await userSubmit((await campaignTx.enroll(creator, ps.id)).transaction, creatorKey, 'enroll');
const enr = await prisma.enrollment.findFirstOrThrow({ where: { campaignId: ps.id, creatorId: creator.id } });
console.log(`  voucher ${enr.voucherCode}`);

step('mock store order → signed webhook → running API → record_sale');
const order = (await (await fetch(`${MOCK}/store/orders`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ voucher: enr.voucherCode }),
})).json()) as { ref: string; webhook: string };
console.log(`  order ${order.ref}, webhook ${order.webhook}`);
let accrued = 0;
for (let i = 0; i < 30 && accrued === 0; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  accrued = Number((await prisma.enrollment.findUniqueOrThrow({ where: { id: enr.id } })).salesAccrued) / 1e6;
}
check('webhook accepted and sale accrued on-chain (5 USDC)', order.webhook === 'sent' && accrued === 5);
const replay = await verifier.recordSale(order.ref, enr.voucherCode!);
check('replayed order ref is not paid twice', replay.recorded === false && replay.reason === 'duplicate');

step('creator claims sales');
const creatorBefore = await usdc(creatorKey.address);
await userSubmit((await campaignTx.claimSales(creator, enr.id)).transaction, creatorKey, 'claim_sales');
check('claim paid the creator the full 5 USDC', Math.abs((await usdc(creatorKey.address)) - creatorBefore - 5) < 1e-9);

// ------------------------------------------------------------------ phase 4: UGC file delivery
step('UGC campaign: 1 video, 25 USDC, 60s review');
const ugc = await campaigns.create(brand, {
  title: `UGC ${tag}`,
  type: 'ugc',
  budgetUsdc: 30,
  slots: [{ kind: 'ugc', amountUsdc: 25, dueDays: 7 }],
  reviewWindowSecs: REVIEW_SECS,
  holdbackPct: 0,
  durationDays: 7,
  selective: false,
});
await userSubmit((await campaignTx.createAndFund(brand, ugc.id)).transaction, brandKey, 'create+fund');
await userSubmit((await campaignTx.enroll(creator, ugc.id)).transaction, creatorKey, 'enroll');
const ugcSlot = await prisma.slot.findFirstOrThrow({ where: { enrollment: { campaignId: ugc.id, creatorId: creator.id } } });

step('creator uploads a video (server re-hashes) and submits by uploadId');
const bytes = Buffer.concat([Buffer.from('fake-mp4-'), randomBytes(2048)]);
const sha = createHash('sha256').update(bytes).digest('hex');
const file = { buffer: bytes, mimetype: 'video/mp4', size: bytes.length, originalname: 'ugc.mp4' } as Express.Multer.File;
const uploads = app.get(UploadsController);
let mismatchRejected = false;
try {
  await uploads.upload(creator, file, 'f'.repeat(64));
} catch {
  mismatchRejected = true;
}
check('upload with a wrong client hash is rejected', mismatchRejected);
const up = await uploads.upload(creator, file, sha);
await userSubmit((await campaignTx.submit(creator, ugcSlot.id, { uploadId: up.uploadId })).transaction, creatorKey, 'submit (file)');
const mirrored = await prisma.slot.findUniqueOrThrow({ where: { id: ugcSlot.id } });
check('on-chain content hash equals the file SHA-256', mirrored.contentHash === sha);
const ugcChecks = await verifier.verifySubmission(ugcSlot.id);
console.log(`  ${ugcChecks?.outcomes.map((o) => `${o.checkType}=${o.passed ? 'pass' : 'fail'}`).join(', ')}`);
check('verifier attests file received + hash match + video', ugcChecks?.passed === true);
const link = await uploads.link(creator, up.uploadId);
const fetched = await fetch(`http://localhost:${process.env.PORT ?? 4000}${link.url}`).catch(() => null);
check('signed link serves the exact file', !!fetched && fetched.ok && createHash('sha256').update(Buffer.from(await fetched.arrayBuffer())).digest('hex') === sha);

// Balance before the wait: the running API's own crank may release it first, which is fine.
const beforeUgc = await usdc(creatorKey.address);
step(`waiting ${REVIEW_SECS + 5}s, then crank`);
await new Promise((r) => setTimeout(r, (REVIEW_SECS + 5) * 1000));
await crank.sweep();
check('UGC auto-release pays the full 25 USDC (no holdback on files)', Math.abs((await usdc(creatorKey.address)) - beforeUgc - 25) < 1e-9);

// ------------------------------------------------------------------ phase 5: fund from any chain
if (funding.mode === 'simulated' && process.env.DEMO_MODE === '1') {
  step('fund from any chain (Aurora Intents, simulated on devnet): create an empty escrow');
  const anyChain = await campaigns.create(brand, { title: `Any-chain ${tag}`, type: 'per_post', budgetUsdc: 40, slots: [{ kind: 'post', amountUsdc: 20, dueDays: 3 }], durationDays: 7 });
  await userSubmit((await campaignTx.createAndFund(brand, anyChain.id, false)).transaction, brandKey, 'create (no funds)');

  step('brand pays 40 USDC worth of USDT on Tron; deposit "arrives"; intermediary tops up the escrow');
  const intent = await funding.create(brand, anyChain.id, { amountUsdc: 40, sourceChain: 'tron', sourceAsset: 'USDT', refundAddress: 'TExampleRefundAddress' });
  console.log(`  ✓ deposit address ${intent.depositAddress} · send ${intent.amountIn} USDT`);
  await funding.simulateDeposit(brand, intent.id);
  let final = intent.status;
  for (let i = 0; i < 40 && !['completed', 'failed'].includes(final); i++) {
    await new Promise((r) => setTimeout(r, 1000));
    final = (await funding.get(brand, intent.id)).status;
  }
  const funded = await prisma.campaign.findUniqueOrThrow({ where: { id: anyChain.id } });
  check('cross-chain funding completes and the escrow holds 40 USDC on-chain', final === 'completed' && funded.totalFunded === 40_000_000n && funded.status === 'active');
}

// ------------------------------------------------------------------ phase 6: cash out to any chain
if (process.env.AURORA_MODE !== 'aurora' && process.env.DEMO_MODE === '1') {
  step('creator cashes out 5 USDC to USDT on Tron (Swap API, simulated): signs a real devnet transfer');
  const before = await usdc(creatorKey.address);
  const out = await cashouts.create(creator, { amountUsdc: 5, destChain: 'tron', destAsset: 'USDT', recipient: 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf' });
  console.log(`  ✓ quote: 5 USDC → ${out.amountOut} USDT · deposit ${out.depositAddress}`);
  const sig = await userSubmit((await cashouts.buildTx(creator, out.id)).transaction, creatorKey, 'transfer to deposit address');
  await cashouts.sent(creator, out.id, sig);
  let state = (await cashouts.get(creator, out.id)).status;
  for (let i = 0; i < 20 && state !== 'completed'; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    state = (await cashouts.get(creator, out.id)).status;
  }
  check('cash-out completes and 5 USDC left the creator wallet', state === 'completed' && Math.abs(before - (await usdc(creatorKey.address)) - 5) < 1e-9);
  await prisma.cashout.deleteMany({ where: { userId: creator.id } });
}

// ------------------------------------------------------------------ phase 7: withdraw + deletion check
step('creator withdraws 1 USDC to another Solana address (store-safe withdraw)');
const beforeWithdraw = await usdc(creatorKey.address);
await userSubmit((await account.withdraw(creator, { to: brandKey.address, amountUsdc: 1 })).transaction, creatorKey, 'withdraw');
check('withdraw moved 1 USDC out of the creator wallet', Math.abs(beforeWithdraw - (await usdc(creatorKey.address)) - 1) < 1e-9);
const brandCheck = await account.deletionCheck(brand);
check('account deletion is blocked while money is involved', !brandCheck.canDelete && brandCheck.blockers.some((b) => b.code === 'wallet_not_empty'));

// Remove this run's rows from the mirror so test campaigns never show up in the apps.
// (Chain state stays on devnet; nothing re-mirrors it unless it gets new transactions.)
const testUsers = [brand.id, creator.id];
const enrollmentIds = (await prisma.enrollment.findMany({ where: { OR: [{ creatorId: { in: testUsers } }, { campaign: { brandId: { in: testUsers } } }] }, select: { id: true } })).map((e) => e.id);
await prisma.$transaction([
  prisma.checkResult.deleteMany({ where: { submission: { slot: { enrollmentId: { in: enrollmentIds } } } } }),
  prisma.submission.deleteMany({ where: { slot: { enrollmentId: { in: enrollmentIds } } } }),
  prisma.slot.deleteMany({ where: { enrollmentId: { in: enrollmentIds } } }),
  prisma.sale.deleteMany({ where: { enrollmentId: { in: enrollmentIds } } }),
  prisma.enrollment.deleteMany({ where: { id: { in: enrollmentIds } } }),
  prisma.campaign.deleteMany({ where: { brandId: { in: testUsers } } }),
  prisma.upload.deleteMany({ where: { userId: { in: testUsers } } }),
  prisma.user.deleteMany({ where: { id: { in: testUsers } } }),
]);
console.log('\n(test campaigns removed from the mirror)');

const failed = results.filter(([, ok]) => !ok);
console.log(failed.length === 0 ? `\nPASS: ${results.length}/${results.length} checks` : `\nFAIL: ${failed.map(([l]) => l).join('; ')}`);
await app.close();
process.exit(failed.length === 0 ? 0 : 1);
