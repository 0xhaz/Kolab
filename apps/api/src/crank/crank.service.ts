import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { address, type Instruction } from '@solana/kit';
import {
  getAutoReleaseInstructionAsync,
  getConfirmReceivedInstructionAsync,
  getMarkMissedInstructionAsync,
} from '@kolab/sdk';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProgramService } from '../solana/program.service.js';
import { SolanaService } from '../solana/solana.service.js';
import { TxService } from '../tx/tx.service.js';
import { IndexerService } from '../indexer/indexer.service.js';
import { JobsService } from '../jobs/jobs.service.js';
import { CampaignTxService } from '../campaigns/campaign-tx.service.js';
import { VerifierService } from '../verifier/verifier.service.js';

export interface SweepResult {
  autoReleased: number;
  missed: number;
  received: number;
  stillLive: number;
  failed: number;
}

/**
 * Time-based cranks (architecture §5.2). The program checks every condition itself, so a wrong
 * candidate just fails; anyone could run these, the backend only saves creators the trouble.
 */
@Injectable()
export class CrankService implements OnModuleInit {
  private readonly logger = new Logger(CrankService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly program: ProgramService,
    private readonly solana: SolanaService,
    private readonly tx: TxService,
    private readonly indexer: IndexerService,
    private readonly jobs: JobsService,
    private readonly campaignTx: CampaignTxService,
    private readonly verifier: VerifierService,
  ) {}

  onModuleInit() {
    this.jobs.register('crank-sweep', () => this.sweep().then(() => undefined), '* * * * *');
  }

  async sweep(): Promise<SweepResult> {
    const now = new Date((await this.program.chainNow()) * 1000);
    const result: SweepResult = { autoReleased: 0, missed: 0, received: 0, stillLive: 0, failed: 0 };

    const submitted = await this.prisma.slot.findMany({
      where: { status: 'submitted', checks: { not: 'failed' }, submittedAt: { not: null } },
      include: { enrollment: { include: { campaign: true, creator: true } } },
    });
    for (const slot of submitted) {
      const due = slot.submittedAt!.getTime() + slot.enrollment.campaign.reviewWindowSecs * 1000;
      if (due > now.getTime()) continue;
      if (await this.run('auto_release', slot.id, () => this.settleIx('auto', slot))) result.autoReleased++;
      else result.failed++;
    }

    const open = await this.prisma.slot.findMany({
      where: { status: { in: ['open', 'rejected'] }, dueAt: { not: null }, enrollment: { status: 'active' } },
      include: { enrollment: { include: { campaign: true, creator: true } } },
    });
    for (const slot of open) {
      const deadline = slot.dueAt!.getTime() + slot.enrollment.campaign.graceSecs * 1000;
      if (deadline >= now.getTime()) continue;
      if (await this.run('mark_missed', slot.id, () => this.settleIx('missed', slot))) result.missed++;
      else result.failed++;
    }

    const inTransit = await this.prisma.enrollment.findMany({
      where: { status: 'in_transit', shippedAt: { not: null } },
      include: { campaign: true },
    });
    for (const e of inTransit) {
      const deadline = e.shippedAt!.getTime() + e.campaign.shippingWindowSecs * 1000;
      if (deadline > now.getTime()) continue;
      const ok = await this.run('confirm_received', e.id, async () => [
        await getConfirmReceivedInstructionAsync(
          { signer: this.solana.sponsor, campaign: address(e.campaign.onchainPubkey!), enrollment: address(e.onchainPubkey!) },
          { programAddress: this.program.programAddress },
        ),
      ]);
      if (ok) result.received++;
      else result.failed++;
    }

    // Holdbacks: still-live check once the wait after release is over (verifier-signed).
    for (const slotId of await this.verifier.dueStillLive()) {
      try {
        if (await this.verifier.stillLive(slotId)) result.stillLive++;
      } catch (err) {
        this.logger.warn({ err, slotId }, 'still-live failed');
        result.failed++;
      }
    }

    if (result.autoReleased + result.missed + result.received + result.stillLive + result.failed > 0) {
      this.logger.log(result, 'crank sweep');
    }
    return result;
  }

  private async settleIx(
    kind: 'auto' | 'missed',
    slot: {
      onchainPubkey: string | null;
      enrollment: { onchainPubkey: string | null; creator: { walletPubkey: string | null }; campaign: { onchainPubkey: string | null; brandId: string } };
    },
  ): Promise<Instruction[]> {
    const campaign = slot.enrollment.campaign;
    const brand = await this.prisma.user.findUniqueOrThrow({ where: { id: campaign.brandId } });
    const input = {
      payer: this.solana.sponsor,
      campaign: address(campaign.onchainPubkey!),
      mint: this.program.usdcMint,
      vault: await this.campaignTx.vault(campaign.onchainPubkey!),
      enrollment: address(slot.enrollment.onchainPubkey!),
      slot: address(slot.onchainPubkey!),
      creator: address(slot.enrollment.creator.walletPubkey!),
      treasury: await this.campaignTx.treasury(),
      brand: address(brand.walletPubkey!),
    };
    const opts = { programAddress: this.program.programAddress };
    return [
      kind === 'auto'
        ? await getAutoReleaseInstructionAsync(input, opts)
        : await getMarkMissedInstructionAsync(input, opts),
    ];
  }

  private async run(label: string, id: string, build: () => Promise<Instruction[]>): Promise<boolean> {
    try {
      const sig = await this.tx.sendServer(await build());
      await this.indexer.ingest(sig);
      this.logger.log({ id, sig }, `${label} sent`);
      return true;
    } catch (err) {
      this.logger.warn({ err, id }, `${label} failed`);
      return false;
    }
  }
}
