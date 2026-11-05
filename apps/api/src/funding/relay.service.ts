import { Inject, Injectable, Logger, ServiceUnavailableException, UnprocessableEntityException, type OnModuleInit } from '@nestjs/common';
import {
  address,
  appendTransactionMessageInstructions,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type KeyPairSigner,
  type Signature,
} from '@solana/kit';
import {
  fetchMaybeToken,
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstructionAsync,
  getTransferCheckedInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from '@solana-program/token';
import { ENV, type Env } from '../config/env.js';

const CONFIRM_TIMEOUT_MS = 60_000;

/**
 * Hybrid mode only. Kolab's relay wallet on Solana **mainnet**: it is the recipient of real Aurora
 * swaps when a brand funds a campaign from another chain, and the sender of real Aurora swaps when a
 * creator cashes out. The escrow itself stays on devnet, so the relay is the bridge between a real
 * Aurora leg and the devnet PoC. Its balance caps how much real money can move.
 */
@Injectable()
export class RelayService implements OnModuleInit {
  private readonly logger = new Logger(RelayService.name);
  private signer: KeyPairSigner | null = null;
  readonly rpc;
  readonly mint;

  constructor(@Inject(ENV) private readonly env: Env) {
    this.rpc = createSolanaRpc(env.MAINNET_RPC_URL);
    this.mint = address(env.MAINNET_USDC_MINT);
  }

  async onModuleInit() {
    if (this.env.RELAY_SECRET) {
      this.signer = await createKeyPairSignerFromBytes(this.env.RELAY_SECRET);
      if (this.env.AURORA_MODE === 'hybrid') this.logger.log({ relay: this.signer.address }, 'hybrid Aurora relay ready (mainnet)');
    }
  }

  get address(): string {
    return this.wallet().address;
  }

  private wallet() {
    if (!this.signer) throw new ServiceUnavailableException({ code: 'relay_not_configured' });
    return this.signer;
  }

  /** Mainnet USDC (base units) and SOL (lamports) the relay holds. */
  async balances() {
    const owner = this.wallet().address;
    const [ata] = await findAssociatedTokenPda({ owner, mint: this.mint, tokenProgram: TOKEN_PROGRAM_ADDRESS });
    const [token, sol] = await Promise.all([fetchMaybeToken(this.rpc, ata), this.rpc.getBalance(owner, { commitment: 'confirmed' }).send()]);
    return { usdc: token.exists ? token.data.amount : 0n, lamports: sol.value };
  }

  /** Sends real mainnet USDC from the relay to `to` (creating its token account if needed). */
  async sendUsdc(to: string, amount: bigint): Promise<Signature> {
    const relay = this.wallet();
    const owner = address(to);
    const [source] = await findAssociatedTokenPda({ owner: relay.address, mint: this.mint, tokenProgram: TOKEN_PROGRAM_ADDRESS });
    const [destination] = await findAssociatedTokenPda({ owner, mint: this.mint, tokenProgram: TOKEN_PROGRAM_ADDRESS });
    const instructions = [
      await getCreateAssociatedTokenIdempotentInstructionAsync({ payer: relay, owner, mint: this.mint }),
      getTransferCheckedInstruction({ source, mint: this.mint, destination, authority: relay, amount, decimals: 6 }),
    ];
    const { value: blockhash } = await this.rpc.getLatestBlockhash({ commitment: 'confirmed' }).send();
    const message = pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayerSigner(relay, m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
      (m) => appendTransactionMessageInstructions(instructions, m),
    );
    const tx = await signTransactionMessageWithSigners(message);
    const signature = getSignatureFromTransaction(tx);
    await this.rpc.sendTransaction(getBase64EncodedWireTransaction(tx), { encoding: 'base64', preflightCommitment: 'confirmed' }).send();
    await this.confirm(signature);
    this.logger.log({ signature, to, usdc: Number(amount) / 1e6 }, 'relay sent mainnet USDC');
    return signature;
  }

  private async confirm(signature: Signature) {
    const deadline = Date.now() + CONFIRM_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const { value } = await this.rpc.getSignatureStatuses([signature]).send();
      const status = value[0];
      if (status?.err) throw new UnprocessableEntityException({ code: 'relay_tx_failed', signature, err: status.err });
      if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') return;
      await new Promise((r) => setTimeout(r, 1500));
    }
    throw new UnprocessableEntityException({ code: 'relay_tx_confirm_timeout', signature });
  }
}

export const solscanTx = (sig: string) => `https://solscan.io/tx/${sig}`;
