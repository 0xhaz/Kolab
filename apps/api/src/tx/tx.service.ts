import { BadRequestException, Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import {
  address,
  appendTransactionMessageInstructions,
  assertIsTransactionWithinSizeLimit,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  getBase64Encoder,
  getPublicKeyFromAddress,
  getSignatureFromTransaction,
  getTransactionDecoder,
  partiallySignTransactionMessageWithSigners,
  signTransactionMessageWithSigners,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  verifySignature,
  type Address,
  type Base64EncodedWireTransaction,
  type Instruction,
  type Signature,
  type SignatureBytes,
  type TransactionMessageBytes,
} from '@solana/kit';
import { SolanaService } from '../solana/solana.service.js';
import { txErrorBody } from './program-error.js';

const CONFIRM_TIMEOUT_MS = 45_000;

@Injectable()
export class TxService {
  private readonly logger = new Logger(TxService.name);

  constructor(private readonly solana: SolanaService) {}

  /**
   * Builds a v0 transaction with the sponsor as fee payer and signs it as the sponsor only.
   * The user's signature slot is left empty for Privy to fill in on the device.
   */
  async buildSponsored(instructions: Instruction[]): Promise<Base64EncodedWireTransaction> {
    const { value: blockhash } = await this.solana.rpc
      .getLatestBlockhash({ commitment: 'confirmed' })
      .send();

    const message = pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayerSigner(this.solana.sponsor, m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
      (m) => appendTransactionMessageInstructions(instructions, m),
    );

    const tx = await partiallySignTransactionMessageWithSigners(message);
    assertIsTransactionWithinSizeLimit(tx);
    return getBase64EncodedWireTransaction(tx);
  }

  /**
   * For transactions only the backend signs (crank, verifier, demo faucet): every signer is a
   * KeyPairSigner embedded in the instructions; the sponsor pays. Sends and confirms.
   */
  async sendServer(instructions: Instruction[]): Promise<Signature> {
    const { value: blockhash } = await this.solana.rpc
      .getLatestBlockhash({ commitment: 'confirmed' })
      .send();
    const message = pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayerSigner(this.solana.sponsor, m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
      (m) => appendTransactionMessageInstructions(instructions, m),
    );
    const tx = await signTransactionMessageWithSigners(message);
    assertIsTransactionWithinSizeLimit(tx);
    const signature = getSignatureFromTransaction(tx);
    try {
      await this.solana.rpc
        .sendTransaction(getBase64EncodedWireTransaction(tx), {
          encoding: 'base64',
          preflightCommitment: 'confirmed',
        })
        .send();
    } catch (err) {
      throw new UnprocessableEntityException(txErrorBody(err, 'tx_send_failed'));
    }
    await this.confirm(signature);
    return signature;
  }

  /**
   * Accepts a transaction we built (proved by our own fee-payer signature over the exact message
   * bytes) once the expected user has signed it, then sends and confirms it.
   */
  async submit(wireBase64: string, userWallet: string): Promise<Signature> {
    let tx;
    try {
      tx = getTransactionDecoder().decode(getBase64Encoder().encode(wireBase64));
    } catch {
      throw new BadRequestException({ code: 'tx_malformed' });
    }

    const sponsor = this.solana.sponsor.address;
    const user = address(userWallet);
    await this.assertSignedBy(tx.messageBytes, tx.signatures, sponsor, 'tx_not_sponsored');
    await this.assertSignedBy(tx.messageBytes, tx.signatures, user, 'tx_missing_user_signature');
    for (const [signer, sig] of Object.entries(tx.signatures)) {
      if (!sig) throw new BadRequestException({ code: 'tx_missing_signature', signer });
    }

    const signature = getSignatureFromTransaction(tx);
    const wire = getBase64EncodedWireTransaction(tx);
    try {
      await this.solana.rpc
        .sendTransaction(wire, { encoding: 'base64', preflightCommitment: 'confirmed' })
        .send();
    } catch (err) {
      this.logger.warn({ err, signature }, 'sendTransaction failed');
      throw new UnprocessableEntityException(txErrorBody(err, 'tx_send_failed'));
    }

    await this.confirm(signature);
    return signature;
  }

  private async assertSignedBy(
    messageBytes: TransactionMessageBytes,
    signatures: Readonly<Record<Address, SignatureBytes | null>>,
    signer: Address,
    code: string,
  ) {
    const sig = signatures[signer];
    if (!sig) throw new BadRequestException({ code });
    const key = await getPublicKeyFromAddress(signer);
    if (!(await verifySignature(key, sig, messageBytes))) {
      throw new BadRequestException({ code });
    }
  }

  private async confirm(signature: Signature) {
    const deadline = Date.now() + CONFIRM_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const { value } = await this.solana.rpc.getSignatureStatuses([signature]).send();
      const status = value[0];
      if (status?.err) {
        throw new UnprocessableEntityException({ code: 'tx_failed', signature, err: status.err });
      }
      if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') {
        return;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new UnprocessableEntityException({ code: 'tx_confirm_timeout', signature });
  }
}
