import { Body, Controller, ForbiddenException, Get, Inject, Post } from '@nestjs/common';
import { findAssociatedTokenPda, TOKEN_PROGRAM_ADDRESS } from '@solana-program/token';
import { ProgramService } from '../solana/program.service.js';
import { address, createNoopSigner } from '@solana/kit';
import { getAddMemoInstruction } from '@solana-program/memo';
import {
  MemoTxSchema,
  SubmitTxSchema,
  type MemoTx,
  type SubmitTx,
  type SubmittedTx,
  type UnsignedTx,
} from '@kolab/shared';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { ENV, type Env } from '../config/env.js';
import { SolanaService } from '../solana/solana.service.js';
import type { User } from '../generated/prisma/client.js';
import { TxService } from './tx.service.js';
import { IndexerService } from '../indexer/indexer.service.js';

function requireWallet(user: User): string {
  if (!user.walletPubkey) throw new ForbiddenException({ code: 'wallet_not_ready' });
  return user.walletPubkey;
}

@Controller('tx')
export class TxController {
  constructor(
    private readonly tx: TxService,
    private readonly solana: SolanaService,
    private readonly indexer: IndexerService,
    private readonly program: ProgramService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** The caller's test-USDC balance on the configured deployment (base units as a string). */
  @Get('balance')
  async balance(@CurrentUser() user: User) {
    const owner = address(requireWallet(user));
    const [ata] = await findAssociatedTokenPda({ owner, mint: this.program.usdcMint, tokenProgram: TOKEN_PROGRAM_ADDRESS });
    try {
      const { value } = await this.solana.rpc.getTokenAccountBalance(ata).send();
      return { usdc: value.amount, mint: this.program.usdcMint };
    } catch {
      return { usdc: '0', mint: this.program.usdcMint };
    }
  }

  /** Smoke test for the sponsored signing flow (demo mode only): a memo signed by the user. */
  @Post('memo')
  async memo(
    @CurrentUser() user: User,
    @Body(new ZodPipe(MemoTxSchema)) body: MemoTx,
  ): Promise<UnsignedTx> {
    if (!this.env.DEMO_MODE) throw new ForbiddenException({ code: 'demo_only' });
    const signer = createNoopSigner(address(requireWallet(user)));
    const ix = getAddMemoInstruction({ memo: body.memo, signers: [signer] });
    return { transaction: await this.tx.buildSponsored([ix]) };
  }

  @Post('submit')
  async submit(
    @CurrentUser() user: User,
    @Body(new ZodPipe(SubmitTxSchema)) body: SubmitTx,
  ): Promise<SubmittedTx> {
    const signature = await this.tx.submit(body.transaction, requireWallet(user));
    // Mirror the result right away so the next GET reflects it (the poll is only a backstop).
    await this.indexer.ingest(signature).catch(() => undefined);
    return { signature, explorerUrl: this.solana.explorerTxUrl(signature) };
  }
}
