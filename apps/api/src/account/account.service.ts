import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { address, createNoopSigner } from '@solana/kit';
import {
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstructionAsync,
  getTransferCheckedInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from '@solana-program/token';
import { fromBaseUnits, toBaseUnits, type DeletionCheckDto, type Withdraw } from '@kolab/shared';
import { PrivyService } from '../auth/privy.service.js';
import type { User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProgramService } from '../solana/program.service.js';
import { SolanaService } from '../solana/solana.service.js';
import { TxService } from '../tx/tx.service.js';
import { StorageService } from '../uploads/storage.service.js';

/**
 * Account lifecycle required by the app stores: withdraw to any Solana address, and in-app account
 * deletion (Apple 5.1.1(v), Google Play). Deleting removes personal data and the Privy user (which
 * destroys the embedded wallet's keys), so it is refused while the account still has money.
 */
@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly solana: SolanaService,
    private readonly program: ProgramService,
    private readonly tx: TxService,
    private readonly privy: PrivyService,
    private readonly storage: StorageService,
  ) {}

  private wallet(user: User) {
    if (!user.walletPubkey) throw new ConflictException({ code: 'wallet_not_ready' });
    return address(user.walletPubkey);
  }

  private async usdcBalance(user: User): Promise<bigint> {
    if (!user.walletPubkey) return 0n;
    const [ata] = await findAssociatedTokenPda({ owner: address(user.walletPubkey), mint: this.program.usdcMint, tokenProgram: TOKEN_PROGRAM_ADDRESS });
    try {
      return BigInt((await this.solana.rpc.getTokenAccountBalance(ata).send()).value.amount);
    } catch {
      return 0n;
    }
  }

  /** Sponsored USDC transfer to another Solana address (user signs). */
  async withdraw(user: User, input: Withdraw) {
    const owner = this.wallet(user);
    const to = address(input.to);
    if (to === owner) throw new BadRequestException({ code: 'withdraw_to_self' });
    const amount = toBaseUnits(input.amountUsdc);
    if ((await this.usdcBalance(user)) < amount) throw new BadRequestException({ code: 'insufficient_usdc' });
    const mint = this.program.usdcMint;
    const [source] = await findAssociatedTokenPda({ owner, mint, tokenProgram: TOKEN_PROGRAM_ADDRESS });
    const [destination] = await findAssociatedTokenPda({ owner: to, mint, tokenProgram: TOKEN_PROGRAM_ADDRESS });
    const transaction = await this.tx.buildSponsored([
      await getCreateAssociatedTokenIdempotentInstructionAsync({ payer: this.solana.sponsor, owner: to, mint }),
      getTransferCheckedInstruction({ source, mint, destination, authority: createNoopSigner(owner), amount, decimals: 6 }),
    ]);
    return { transaction };
  }

  async deletionCheck(user: User): Promise<DeletionCheckDto> {
    const blockers: DeletionCheckDto['blockers'] = [];
    const balance = await this.usdcBalance(user);
    if (balance > 0n) blockers.push({ code: 'wallet_not_empty', detail: `Your wallet still holds ${fromBaseUnits(balance).toFixed(2)} USDC. Withdraw it first.` });

    const programId = this.program.programAddress;
    const liveCampaigns = await this.prisma.campaign.count({
      where: { brandId: user.id, programId, status: { in: ['active', 'cancelling'] }, totalFunded: { gt: 0 } },
    });
    if (liveCampaigns > 0) blockers.push({ code: 'active_campaigns', detail: `${liveCampaigns} campaign${liveCampaigns === 1 ? ' is' : 's are'} still live. Close ${liveCampaigns === 1 ? 'it' : 'them'} so leftover escrow is refunded.` });

    const unpaid = await this.prisma.slot.count({
      where: { status: { in: ['open', 'submitted', 'approved', 'rejected', 'released'] }, enrollment: { creatorId: user.id, campaign: { programId } } },
    });
    if (unpaid > 0) blockers.push({ code: 'unpaid_work', detail: `${unpaid} deliverable${unpaid === 1 ? ' is' : 's are'} still in progress or awaiting payment to your wallet.` });

    return { canDelete: blockers.length === 0, blockers };
  }

  /**
   * Removes personal data (profile, channels, samples, addresses, applications) and the Privy user.
   * Money records (campaigns, enrollments, slots, sales) stay, because they are the other party's
   * records and mirror on-chain state; they are no longer linked to an email or a login.
   */
  async delete(user: User) {
    const check = await this.deletionCheck(user);
    if (!check.canDelete) throw new ConflictException({ code: 'account_not_deletable', blockers: check.blockers });

    const samples = await this.prisma.portfolioItem.findMany({ where: { userId: user.id, uploadId: { not: null } }, select: { uploadId: true } });
    const sampleUploads = await this.prisma.upload.findMany({ where: { id: { in: samples.map((s) => s.uploadId!) } } });

    await this.prisma.$transaction([
      this.prisma.portfolioItem.deleteMany({ where: { userId: user.id } }),
      this.prisma.socialAccount.deleteMany({ where: { userId: user.id } }),
      this.prisma.creatorProfile.deleteMany({ where: { userId: user.id } }),
      this.prisma.brandProfile.deleteMany({ where: { userId: user.id } }),
      this.prisma.application.deleteMany({ where: { creatorId: user.id, status: { not: 'accepted' } } }),
      this.prisma.enrollment.updateMany({ where: { creatorId: user.id }, data: { shippingAddressSealed: null } }),
      this.prisma.upload.deleteMany({ where: { id: { in: sampleUploads.map((u) => u.id) } } }),
      this.prisma.user.update({
        where: { id: user.id },
        data: { privyId: `deleted:${user.id}`, email: null, displayName: 'Deleted account', walletPubkey: null, deletedAt: new Date() },
      }),
    ]);
    for (const u of sampleUploads) {
      // Content-addressed: another upload (e.g. the same file delivered to a brand) may share it.
      if (await this.prisma.upload.count({ where: { storageKey: u.storageKey } })) continue;
      await this.storage.remove({ storage: u.storage as 'local' | 'cloudinary', storageKey: u.storageKey }).catch((err) => this.logger.warn({ err, id: u.id }, 'sample file not removed'));
    }
    await this.privy.deleteUser(user.privyId);
    this.logger.log({ userId: user.id }, 'account deleted');
    return { deleted: true };
  }
}
