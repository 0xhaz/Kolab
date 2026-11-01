import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { address, createNoopSigner, type Address, type Instruction } from '@solana/kit';
import { findAssociatedTokenPda, TOKEN_PROGRAM_ADDRESS } from '@solana-program/token';
import {
  fetchConfig,
  findApprovalPda,
  findEnrollmentPda,
  OPEN_INVITE,
  getApproveCreatorInstructionAsync,
  findSlotPda,
  getApproveInstructionAsync,
  getCancelEnrollmentInstructionAsync,
  getClaimSalesInstructionAsync,
  getConfirmReceivedInstructionAsync,
  getMarkShippedInstructionAsync,
  getReportNotReceivedInstructionAsync,
  getCreateCampaignInstructionAsync,
  getEnrollCreatorInstructionAsync,
  getFundCampaignInstruction,
  getInitSlotInstruction,
  getRejectInstructionAsync,
  getSubmitDeliverableInstructionAsync,
} from '@kolab/sdk';
import type { SlotTemplateDto } from '@kolab/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProgramService } from '../solana/program.service.js';
import { SolanaService } from '../solana/solana.service.js';
import { TxService } from '../tx/tx.service.js';
import type { User } from '../generated/prisma/client.js';
import { chainCampaignType, chainSlotKind } from '../indexer/mapping.js';
import { CampaignsService } from './campaigns.service.js';

const sha256 = (s: string) => createHash('sha256').update(s).digest();

/** Builds the sponsored, partially signed transactions for brand and creator actions. */
@Injectable()
export class CampaignTxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly solana: SolanaService,
    private readonly program: ProgramService,
    private readonly tx: TxService,
    private readonly campaigns: CampaignsService,
  ) {}

  private wallet(user: User): Address {
    if (!user.walletPubkey) throw new ForbiddenException({ code: 'wallet_not_ready' });
    return address(user.walletPubkey);
  }

  private get opts() {
    return { programAddress: this.program.programAddress };
  }

  private build(ixs: Instruction[]) {
    return this.tx.buildSponsored(ixs).then((transaction) => ({ transaction }));
  }

  /** create_campaign + fund_campaign(budget) in one tx; `fund: false` creates an empty escrow (funded cross-chain). */
  async createAndFund(brand: User, campaignId: string, fund = true) {
    const c = await this.campaigns.ownedBy(brand, campaignId);
    if (c.status !== 'draft') throw new ConflictException({ code: 'campaign_already_on_chain' });
    const wallet = this.wallet(brand);
    const brandSigner = createNoopSigner(wallet);

    const [brandToken] = await findAssociatedTokenPda({
      owner: wallet,
      mint: this.program.usdcMint,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });
    const balance = fund ? await this.tokenBalance(brandToken) : c.budget;
    if (balance < c.budget) {
      throw new BadRequestException({ code: 'insufficient_usdc', needed: c.budget.toString(), have: balance.toString() });
    }

    const slots = (c.slotsJson as unknown as SlotTemplateDto[]).map((s) => ({
      kind: chainSlotKind[s.kind],
      amount: BigInt(s.amount),
      dueOffset: BigInt(s.dueOffsetSecs),
    }));
    const create = await getCreateCampaignInstructionAsync(
      {
        brand: brandSigner,
        payer: this.solana.sponsor,
        campaign: address(c.onchainPubkey!),
        mint: this.program.usdcMint,
        campaignId: c.onchainId,
        campaignType: chainCampaignType[c.type],
        startTs: BigInt(Math.floor(c.startAt.getTime() / 1000)),
        endTs: BigInt(Math.floor(c.endAt.getTime() / 1000)),
        reviewWindowSecs: BigInt(c.reviewWindowSecs),
        graceSecs: BigInt(c.graceSecs),
        holdbackBps: c.holdbackBps,
        requiresShipping: c.requiresShipping,
        shippingWindowSecs: BigInt(c.shippingWindowSecs),
        perSaleAmount: c.perSaleAmount,
        maxCreators: c.maxCreators,
        slots,
      },
      this.opts,
    );
    const [vault] = await findAssociatedTokenPda({
      owner: address(c.onchainPubkey!),
      mint: this.program.usdcMint,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });
    const fundIx = getFundCampaignInstruction(
      { brand: brandSigner, campaign: address(c.onchainPubkey!), mint: this.program.usdcMint, vault, brandToken, amount: c.budget },
      this.opts,
    );
    const ixs: Instruction[] = fund ? [create, fundIx] : [create];
    // Open campaigns: one open invite so anyone with the link can join (enroll needs an approval).
    if (!c.selective) ixs.push(await this.approvalIx(brandSigner, c.onchainPubkey!, OPEN_INVITE));
    return this.build(ixs);
  }

  private async approvalIx(brand: ReturnType<typeof createNoopSigner>, campaign: string, creator: Address) {
    const [approval] = await findApprovalPda({ campaign: address(campaign), creator }, this.opts);
    return getApproveCreatorInstructionAsync(
      { brand, payer: this.solana.sponsor, campaign: address(campaign), approval, creator },
      this.opts,
    );
  }

  /** Brand accepts an application: approve_creator(creator wallet) on-chain. */
  async approveCreator(brand: User, campaignId: string, creatorWallet: string) {
    const c = await this.campaigns.ownedBy(brand, campaignId);
    if (c.status !== 'active') throw new ConflictException({ code: 'campaign_not_active' });
    const ix = await this.approvalIx(createNoopSigner(this.wallet(brand)), c.onchainPubkey!, address(creatorWallet));
    return this.build([ix]);
  }

  /** enroll_creator + one init_slot per template slot. */
  async enroll(creator: User, campaignId: string) {
    if (creator.role !== 'creator') throw new ForbiddenException({ code: 'creator_only' });
    const c = await this.campaigns.get(campaignId);
    if (c.status !== 'active') throw new ConflictException({ code: 'campaign_not_active' });
    const wallet = this.wallet(creator);
    const campaign = address(c.onchainPubkey!);
    const [enrollment] = await findEnrollmentPda({ campaign, creator: wallet }, this.opts);
    if (c.selective) {
      const app = await this.prisma.application.findUnique({
        where: { campaignId_creatorId: { campaignId: c.id, creatorId: creator.id } },
      });
      if (app?.status !== 'accepted') throw new ForbiddenException({ code: 'not_approved' });
    }
    const [approval] = await findApprovalPda({ campaign, creator: c.selective ? wallet : OPEN_INVITE }, this.opts);

    const voucherHash = sha256(`voucher:${enrollment}`);
    const ixs: Instruction[] = [
      await getEnrollCreatorInstructionAsync(
        { creator: createNoopSigner(wallet), payer: this.solana.sponsor, campaign, approval, enrollment, voucherHash },
        this.opts,
      ),
    ];
    const count = (c.slotsJson as unknown as SlotTemplateDto[]).length;
    for (let i = 0; i < count; i++) {
      const [slot] = await findSlotPda({ enrollment, periodIndex: 0, slotIdx: i }, this.opts);
      ixs.push(getInitSlotInstruction({ payer: this.solana.sponsor, campaign, enrollment, slot, slotIdx: i }, this.opts));
    }
    return this.build(ixs);
  }

  private async slotFor(slotId: string) {
    const slot = await this.prisma.slot.findUnique({
      where: { id: slotId },
      include: { enrollment: { include: { campaign: true } } },
    });
    if (!slot?.onchainPubkey || !slot.enrollment.onchainPubkey) throw new NotFoundException({ code: 'slot_not_found' });
    return slot;
  }

  /** Post → hash of its URL; UGC file → the verified SHA-256 of the uploaded file. */
  async submit(creator: User, slotId: string, input: { url: string } | { uploadId: string }) {
    const slot = await this.slotFor(slotId);
    if (slot.enrollment.creatorId !== creator.id) throw new ForbiddenException({ code: 'not_slot_creator' });
    let contentHash: Buffer;
    if ('uploadId' in input) {
      const upload = await this.prisma.upload.findUnique({ where: { id: input.uploadId } });
      if (!upload || upload.userId !== creator.id) throw new ForbiddenException({ code: 'upload_not_found' });
      contentHash = Buffer.from(upload.sha256, 'hex');
      await this.prisma.submission.create({ data: { slotId, fileKey: upload.id, contentHash: upload.sha256 } });
    } else {
      contentHash = sha256(input.url);
      await this.prisma.submission.create({ data: { slotId, url: input.url, contentHash: contentHash.toString('hex') } });
    }
    return this.build([
      await getSubmitDeliverableInstructionAsync(
        {
          creator: createNoopSigner(this.wallet(creator)),
          campaign: address(slot.enrollment.campaign.onchainPubkey!),
          enrollment: address(slot.enrollment.onchainPubkey!),
          slot: address(slot.onchainPubkey!),
          contentHash,
        },
        this.opts,
      ),
    ]);
  }

  private async brandSlot(brand: User, slotId: string) {
    const slot = await this.slotFor(slotId);
    if (slot.enrollment.campaign.brandId !== brand.id) throw new ForbiddenException({ code: 'not_campaign_brand' });
    return slot;
  }

  async approve(brand: User, slotId: string) {
    const slot = await this.brandSlot(brand, slotId);
    const creatorWallet = await this.creatorWallet(slot.enrollment.creatorId);
    return this.build([
      await getApproveInstructionAsync(
        {
          brandSigner: createNoopSigner(this.wallet(brand)),
          payer: this.solana.sponsor,
          campaign: address(slot.enrollment.campaign.onchainPubkey!),
          mint: this.program.usdcMint,
          vault: await this.vault(slot.enrollment.campaign.onchainPubkey!),
          enrollment: address(slot.enrollment.onchainPubkey!),
          slot: address(slot.onchainPubkey!),
          creator: creatorWallet,
          treasury: await this.treasury(),
          brand: this.wallet(brand),
        },
        this.opts,
      ),
    ]);
  }

  async reject(brand: User, slotId: string, reasonCode: number) {
    const slot = await this.brandSlot(brand, slotId);
    return this.build([
      await getRejectInstructionAsync(
        {
          brand: createNoopSigner(this.wallet(brand)),
          campaign: address(slot.enrollment.campaign.onchainPubkey!),
          enrollment: address(slot.enrollment.onchainPubkey!),
          slot: address(slot.onchainPubkey!),
          reasonCode,
        },
        this.opts,
      ),
    ]);
  }

  // ---------------------------------------------------------------- enrollment actions

  private async enrollmentFor(enrollmentId: string) {
    const e = await this.prisma.enrollment.findUnique({ where: { id: enrollmentId }, include: { campaign: true } });
    if (!e?.onchainPubkey) throw new NotFoundException({ code: 'enrollment_not_found' });
    return e;
  }

  private async creatorEnrollment(creator: User, enrollmentId: string) {
    const e = await this.enrollmentFor(enrollmentId);
    if (e.creatorId !== creator.id) throw new ForbiddenException({ code: 'not_enrollment_creator' });
    return e;
  }

  private async brandEnrollment(brand: User, enrollmentId: string) {
    const e = await this.enrollmentFor(enrollmentId);
    if (e.campaign.brandId !== brand.id) throw new ForbiddenException({ code: 'not_campaign_brand' });
    return e;
  }

  /** Brand ships: only hash(courier + tracking ref) goes on-chain; the ref stays in Postgres. */
  async markShipped(brand: User, enrollmentId: string, courier: string, trackingRef: string) {
    const e = await this.brandEnrollment(brand, enrollmentId);
    await this.prisma.enrollment.update({ where: { id: e.id }, data: { trackingRef } });
    return this.build([
      await getMarkShippedInstructionAsync(
        {
          brand: createNoopSigner(this.wallet(brand)),
          campaign: address(e.campaign.onchainPubkey!),
          enrollment: address(e.onchainPubkey!),
          trackingHash: sha256(`${courier}:${trackingRef}`),
        },
        this.opts,
      ),
    ]);
  }

  async confirmReceived(creator: User, enrollmentId: string) {
    const e = await this.creatorEnrollment(creator, enrollmentId);
    return this.build([
      await getConfirmReceivedInstructionAsync(
        { signer: createNoopSigner(this.wallet(creator)), campaign: address(e.campaign.onchainPubkey!), enrollment: address(e.onchainPubkey!) },
        this.opts,
      ),
    ]);
  }

  async reportNotReceived(creator: User, enrollmentId: string) {
    const e = await this.creatorEnrollment(creator, enrollmentId);
    return this.build([
      await getReportNotReceivedInstructionAsync(
        { creator: createNoopSigner(this.wallet(creator)), campaign: address(e.campaign.onchainPubkey!), enrollment: address(e.onchainPubkey!) },
        this.opts,
      ),
    ]);
  }

  async cancelEnrollment(brand: User, enrollmentId: string) {
    const e = await this.brandEnrollment(brand, enrollmentId);
    return this.build([
      await getCancelEnrollmentInstructionAsync(
        {
          brand: createNoopSigner(this.wallet(brand)),
          payer: this.solana.sponsor,
          campaign: address(e.campaign.onchainPubkey!),
          mint: this.program.usdcMint,
          vault: await this.vault(e.campaign.onchainPubkey!),
          enrollment: address(e.onchainPubkey!),
        },
        this.opts,
      ),
    ]);
  }

  async claimSales(creator: User, enrollmentId: string) {
    const e = await this.creatorEnrollment(creator, enrollmentId);
    return this.build([
      await getClaimSalesInstructionAsync(
        {
          creator: createNoopSigner(this.wallet(creator)),
          payer: this.solana.sponsor,
          campaign: address(e.campaign.onchainPubkey!),
          mint: this.program.usdcMint,
          vault: await this.vault(e.campaign.onchainPubkey!),
          enrollment: address(e.onchainPubkey!),
          treasury: await this.treasury(),
        },
        this.opts,
      ),
    ]);
  }

  // ---------------------------------------------------------------- helpers shared with the crank

  async vault(campaign: string): Promise<Address> {
    const [vault] = await findAssociatedTokenPda({
      owner: address(campaign),
      mint: this.program.usdcMint,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });
    return vault;
  }

  private treasuryAddress: Address | null = null;
  async treasury(): Promise<Address> {
    this.treasuryAddress ??= (await fetchConfig(this.solana.rpc, this.program.config)).data.treasury;
    return this.treasuryAddress;
  }

  async creatorWallet(userId: string): Promise<Address> {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return address(u.walletPubkey!);
  }

  private async tokenBalance(account: Address): Promise<bigint> {
    try {
      const { value } = await this.solana.rpc.getTokenAccountBalance(account).send();
      return BigInt(value.amount);
    } catch {
      return 0n; // account doesn't exist yet
    }
  }
}
