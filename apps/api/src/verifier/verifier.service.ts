import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { address, type Instruction } from '@solana/kit';
import {
  findSaleReceiptPda,
  getAttestChecksInstructionAsync,
  getAttestLiveInstructionAsync,
  getRecordSaleInstructionAsync,
} from '@kolab/sdk';
import { ENV, type Env } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProgramService } from '../solana/program.service.js';
import { SolanaService } from '../solana/solana.service.js';
import { TxService } from '../tx/tx.service.js';
import { IndexerService } from '../indexer/indexer.service.js';
import { JobsService } from '../jobs/jobs.service.js';
import { CampaignTxService } from '../campaigns/campaign-tx.service.js';
import { platformFromUrl, runChecks, type CheckOutcome, type OEmbed } from './checks.js';

/**
 * The centralised attestor for facts the chain can't see (architecture §4.4, §5.1): post exists,
 * is on time and disclosed; post is still live; a sale happened. Signs with the verifier key.
 */
@Injectable()
export class VerifierService implements OnModuleInit {
  private readonly logger = new Logger(VerifierService.name);

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly program: ProgramService,
    private readonly solana: SolanaService,
    private readonly tx: TxService,
    private readonly indexer: IndexerService,
    private readonly jobs: JobsService,
    private readonly campaignTx: CampaignTxService,
  ) {}

  onModuleInit() {
    this.jobs.register<{ slotId: string }>('verify-submission', ({ slotId }) => this.verifySubmission(slotId).then(() => undefined));
    this.indexer.onEvent((event, touched) => {
      if (event.name !== 'Submitted' || !touched?.slotId) return;
      const slotId = touched.slotId;
      void this.jobs.send('verify-submission', { slotId }, { singletonKey: `verify:${slotId}:${Date.now()}` }).then((id) => {
        if (id === null) void this.verifySubmission(slotId).catch((err) => this.logger.warn({ err, slotId }, 'verify failed'));
      });
    });
  }

  /** Same interface as a real oEmbed endpoint; the demo points it at apps/mock. */
  private async oembed(url: string): Promise<OEmbed | null> {
    try {
      const res = await fetch(`${this.env.MOCK_BASE_URL}/oembed?url=${encodeURIComponent(url)}`);
      return res.ok ? ((await res.json()) as OEmbed) : null;
    } catch (err) {
      this.logger.warn({ err, url }, 'oEmbed unreachable');
      throw err; // retry later instead of attesting a false negative
    }
  }

  private async send(ixs: Instruction[]) {
    const sig = await this.tx.sendServer(ixs);
    await this.indexer.ingest(sig);
    return sig;
  }

  async verifySubmission(slotId: string) {
    const slot = await this.prisma.slot.findUnique({
      where: { id: slotId },
      include: {
        enrollment: { include: { creator: { include: { socialAccounts: true } } } },
        submissions: { orderBy: { submittedAt: 'desc' }, take: 1 },
      },
    });
    const submission = slot?.submissions[0];
    if (!slot || slot.status !== 'submitted' || slot.checks !== 'pending' || (!submission?.url && !submission?.fileKey)) return null;

    const outcomes = submission.fileKey
      ? await this.fileChecks(submission.fileKey, slot.contentHash)
      : runChecks({
          oembed: await this.oembed(submission.url!),
          linkedHandle:
            slot.enrollment.creator.socialAccounts.find((a) => a.platform === platformFromUrl(submission.url!))?.handle ?? null,
          enrolledAt: slot.enrollment.createdAt,
          now: new Date((await this.program.chainNow()) * 1000),
        });
    const passed = outcomes.every((o) => o.passed);

    const sig = await this.send([
      await getAttestChecksInstructionAsync(
        { verifier: this.program.verifier, slot: address(slot.onchainPubkey!), passed },
        { programAddress: this.program.programAddress },
      ),
    ]);
    await this.prisma.checkResult.createMany({
      data: outcomes.map((o) => ({
        submissionId: submission.id,
        checkType: o.checkType,
        passed: o.passed,
        detailsJson: { detail: o.detail },
        attestedTx: sig,
      })),
    });
    this.logger.log({ slotId, passed, sig }, 'attest_checks');
    return { passed, outcomes, signature: sig };
  }

  /** UGC deliveries: the file arrived, its SHA-256 matches the hash on-chain, and it's a video. */
  private async fileChecks(uploadId: string, onchainHash: string | null): Promise<CheckOutcome[]> {
    const up = await this.prisma.upload.findUnique({ where: { id: uploadId } });
    if (!up) return [{ checkType: 'exists', passed: false, detail: 'File not found' }];
    return [
      { checkType: 'exists', passed: true, detail: `File received (${(up.size / 1_048_576).toFixed(1)} MB)` },
      { checkType: 'hash', passed: !!onchainHash && onchainHash === up.sha256, detail: 'SHA-256 matches the hash recorded on-chain' },
      { checkType: 'format', passed: up.mime.startsWith('video/'), detail: `Format ${up.mime}` },
    ];
  }

  /** Released post slots still holding a holdback whose wait is over (or all of them, for the demo). */
  async dueStillLive(ignoreWait = false) {
    const now = (await this.program.chainNow()) * 1000;
    const slots = await this.prisma.slot.findMany({
      where: { status: 'released', holdback: { gt: 0 }, decidedAt: { not: null } },
      select: { id: true, decidedAt: true },
    });
    return slots.filter((s) => ignoreWait || s.decidedAt!.getTime() + this.env.STILL_LIVE_AFTER_SECS * 1000 <= now).map((s) => s.id);
  }

  async stillLive(slotId: string) {
    const slot = await this.prisma.slot.findUnique({
      where: { id: slotId },
      include: {
        enrollment: { include: { campaign: true, creator: true } },
        submissions: { orderBy: { submittedAt: 'desc' }, take: 1 },
      },
    });
    const url = slot?.submissions[0]?.url;
    if (!slot || slot.status !== 'released' || !url) return null;
    const live = (await this.oembed(url)) !== null;
    const campaign = slot.enrollment.campaign;
    const brand = await this.prisma.user.findUniqueOrThrow({ where: { id: campaign.brandId } });
    const sig = await this.send([
      await getAttestLiveInstructionAsync(
        {
          verifier: this.program.verifier,
          payer: this.solana.sponsor,
          campaign: address(campaign.onchainPubkey!),
          mint: this.program.usdcMint,
          vault: await this.campaignTx.vault(campaign.onchainPubkey!),
          enrollment: address(slot.enrollment.onchainPubkey!),
          slot: address(slot.onchainPubkey!),
          creator: address(slot.enrollment.creator.walletPubkey!),
          treasury: await this.campaignTx.treasury(),
          brand: address(brand.walletPubkey!),
          stillLive: live,
        },
        { programAddress: this.program.programAddress },
      ),
    ]);
    this.logger.log({ slotId, live, sig }, 'attest_live');
    return { stillLive: live, signature: sig };
  }

  /** Store sale → record_sale. Idempotent per order ref: a replay finds the receipt and stops. */
  async recordSale(orderRef: string, voucher: string) {
    const enrollment = await this.prisma.enrollment.findUnique({ where: { voucherCode: voucher }, include: { campaign: true } });
    if (!enrollment?.onchainPubkey) return { recorded: false, reason: 'unknown_voucher' as const };
    const refHash = createHash('sha256').update(orderRef).digest();
    const opts = { programAddress: this.program.programAddress };
    const [receipt] = await findSaleReceiptPda({ enrollment: address(enrollment.onchainPubkey), refHash }, opts);
    const { value } = await this.solana.rpc.getAccountInfo(receipt, { encoding: 'base64' }).send();
    if (value) return { recorded: false, reason: 'duplicate' as const };

    const sig = await this.send([
      await getRecordSaleInstructionAsync(
        {
          verifier: this.program.verifier,
          payer: this.solana.sponsor,
          campaign: address(enrollment.campaign.onchainPubkey!),
          enrollment: address(enrollment.onchainPubkey),
          saleReceipt: receipt,
          refHash,
        },
        opts,
      ),
    ]);
    await this.prisma.sale.upsert({
      where: { orderRef },
      create: { orderRef, enrollmentId: enrollment.id, amount: enrollment.campaign.perSaleAmount, recordedTx: sig },
      update: {},
    });
    return { recorded: true, signature: sig };
  }
}
