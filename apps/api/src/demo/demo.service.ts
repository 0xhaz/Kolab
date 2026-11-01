import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { address } from '@solana/kit';
import {
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstructionAsync,
  getMintToCheckedInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from '@solana-program/token';
import { getSetDemoOffsetInstructionAsync } from '@kolab/sdk';
import { toBaseUnits } from '@kolab/shared';
import { ENV, type Env } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProgramService } from '../solana/program.service.js';
import { SolanaService } from '../solana/solana.service.js';
import { TxService } from '../tx/tx.service.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { VerifierService } from '../verifier/verifier.service.js';
import { CampaignsService } from '../campaigns/campaigns.service.js';
import { CampaignTxService } from '../campaigns/campaign-tx.service.js';
import type { User } from '../generated/prisma/client.js';
import { demoCampaigns } from './seed-templates.js';
import { KitService } from '../kit/kit.service.js';
import { GLOW_LAB_COLORS, renderGlowLabKit } from './kit-art.js';

/** Demo control panel actions (architecture §9.1). DEMO_MODE only; test USDC has no value. */
@Injectable()
export class DemoService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly program: ProgramService,
    private readonly solana: SolanaService,
    private readonly tx: TxService,
    private readonly realtime: RealtimeGateway,
    private readonly verifier: VerifierService,
    private readonly campaigns: CampaignsService,
    private readonly campaignTx: CampaignTxService,
    private readonly kit: KitService,
  ) {}

  assertDemo() {
    if (!this.env.DEMO_MODE) throw new ForbiddenException({ code: 'demo_only' });
  }

  private admin() {
    this.assertDemo();
    if (!this.program.demoAdmin) throw new ForbiddenException({ code: 'demo_admin_missing' });
    return this.program.demoAdmin;
  }

  private async mock(path: string, body: unknown) {
    const res = await fetch(`${this.env.MOCK_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new BadRequestException({ code: 'mock_error', status: res.status });
    return res.json();
  }

  /** Mints test USDC to a wallet (creates its token account if needed). */
  async faucet(wallet: string, usdc = 1_000) {
    const admin = this.admin();
    const owner = address(wallet);
    const [ata] = await findAssociatedTokenPda({ owner, mint: this.program.usdcMint, tokenProgram: TOKEN_PROGRAM_ADDRESS });
    const signature = await this.tx.sendServer([
      await getCreateAssociatedTokenIdempotentInstructionAsync({ payer: this.solana.sponsor, owner, mint: this.program.usdcMint }),
      getMintToCheckedInstruction({
        mint: this.program.usdcMint,
        token: ata,
        mintAuthority: admin,
        amount: toBaseUnits(usdc),
        decimals: 6,
      }),
    ]);
    return { signature, amount: toBaseUnits(usdc).toString(), explorerUrl: this.solana.explorerTxUrl(signature) };
  }

  /** Current offset and program time (seconds); the release program always reports 0. */
  async readClock() {
    this.assertDemo();
    this.program.invalidateClock();
    const now = await this.program.chainNow();
    return { offsetSecs: now - Math.floor(Date.now() / 1000), chainNow: new Date(now * 1000).toISOString() };
  }

  /**
   * Gives a brand the Glow Lab demo campaigns: tops up test USDC, creates the three drafts and returns
   * their create + fund transactions for the brand's own wallet to sign (Kolab never holds brand keys).
   * Also retires unjoined campaigns of the script-only demo brand so the creator app shows one Glow Lab.
   */
  async seedForBrand(brand: User) {
    this.admin();
    if (brand.role !== 'brand' || !brand.walletPubkey) throw new ForbiddenException({ code: 'brand_only' });
    // Only the demo campaigns this brand doesn't have yet (safe to press again).
    const existing = new Set(
      (await this.prisma.campaign.findMany({ where: { brandId: brand.id, programId: this.program.programAddress }, select: { title: true } })).map((c) => c.title),
    );
    const templates = Object.values(demoCampaigns()).filter((t) => !existing.has(t.title));
    if (templates.length === 0) {
      await this.attachDemoKits(brand);
      return [];
    }
    const needed = templates.reduce((s, t) => s + t.budgetUsdc, 0);
    await this.faucet(brand.walletPubkey, needed + 60);

    const out = [];
    for (const t of templates) {
      const draft = await this.campaigns.create(brand, t);
      const { transaction } = await this.campaignTx.createAndFund(brand, draft.id);
      out.push({ campaignId: draft.id, title: draft.title, transaction });
    }

    await this.prisma.campaign.deleteMany({
      where: { brand: { privyId: { startsWith: 'script:' } }, enrollments: { none: {} }, programId: this.program.programAddress },
    });
    await this.attachDemoKits(brand);
    return out;
  }

  /** Gives every Glow Lab demo campaign of this brand the generated brand kit, if it has none. */
  async attachDemoKits(brand: User) {
    const titles = Object.values(demoCampaigns()).map((t) => t.title);
    const bare = await this.prisma.campaign.findMany({ where: { brandId: brand.id, title: { in: titles }, kitReady: false } });
    if (bare.length === 0) return 0;
    const art = await renderGlowLabKit();
    const logo = await this.kit.storeImage(brand, art.logo, 'image/png');
    const products = await Promise.all(art.products.map((p) => this.kit.storeImage(brand, p, 'image/jpeg')));
    for (const c of bare) {
      await this.kit.set(brand, c.id, {
        logoUploadId: logo.id,
        productUploadIds: products.map((p) => p.id),
        colors: [...GLOW_LAB_COLORS],
        notes: 'Use the logo on a light or blurred area, keep the bottle label readable, and don’t recolour the logo.',
        rightsConfirmed: true,
      });
    }
    return bare.length;
  }

  /** Shifts program time (demo-clock build only; the release program rejects it). */
  async setClock(offsetSecs: number) {
    const admin = this.admin();
    const signature = await this.tx.sendServer([
      await getSetDemoOffsetInstructionAsync({ admin, offsetSecs: BigInt(offsetSecs) }, { programAddress: this.program.programAddress }),
    ]);
    this.program.invalidateClock();
    this.realtime.emit(['demo'], 'demo.clock', { offsetSecs }, signature);
    return { offsetSecs, signature };
  }

  /** "Fire mock sale": the mock store creates an order and sends the signed webhook. */
  async fireSale(enrollmentId: string) {
    this.assertDemo();
    const e = await this.prisma.enrollment.findUnique({ where: { id: enrollmentId } });
    if (!e?.voucherCode) throw new NotFoundException({ code: 'no_voucher' });
    return this.mock('/store/orders', { voucher: e.voucherCode });
  }

  /** "Delete creator post": oEmbed starts returning 404 for the slot's latest submission. */
  async deletePost(slotId: string) {
    this.assertDemo();
    const sub = await this.prisma.submission.findFirst({ where: { slotId }, orderBy: { submittedAt: 'desc' } });
    if (!sub?.url) throw new NotFoundException({ code: 'no_submission' });
    return this.mock('/posts/delete', { url: sub.url });
  }

  /** "Mark parcel delivered" at the courier (the creator still confirms receipt in the app). */
  async deliverParcel(enrollmentId: string) {
    this.assertDemo();
    const e = await this.prisma.enrollment.findUnique({ where: { id: enrollmentId } });
    if (!e?.trackingRef) throw new NotFoundException({ code: 'no_tracking_ref' });
    return this.mock(`/tracking/${encodeURIComponent(e.trackingRef)}/deliver`, {});
  }

  /** Still-live checks for every released post slot, without waiting the 7 days. */
  async stillLiveNow() {
    this.assertDemo();
    const results = [];
    for (const slotId of await this.verifier.dueStillLive(true)) {
      results.push({ slotId, ...(await this.verifier.stillLive(slotId)) });
    }
    return results;
  }

  /**
   * Clears off-chain demo data (campaigns, enrollments, slots, submissions, sales) and the mock.
   * Chain state stays; the next demo run creates fresh campaigns. Users and wallets are kept.
   */
  async reset() {
    this.assertDemo();
    await this.prisma.$transaction([
      this.prisma.checkResult.deleteMany(),
      this.prisma.submission.deleteMany(),
      this.prisma.sale.deleteMany(),
      this.prisma.slot.deleteMany(),
      this.prisma.enrollment.deleteMany(),
      this.prisma.campaign.deleteMany(),
    ]);
    await this.mock('/reset', {}).catch(() => undefined);
    return { ok: true };
  }
}
