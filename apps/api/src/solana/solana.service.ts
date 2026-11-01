import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  createKeyPairSignerFromBytes,
  createSolanaRpcFromTransport,
  createSolanaRpcSubscriptions,
  type KeyPairSigner,
} from '@solana/kit';
import { ENV, type Env } from '../config/env.js';
import { createRetryingTransport } from './retrying-transport.js';

@Injectable()
export class SolanaService implements OnModuleInit {
  readonly rpc;
  readonly rpcSubscriptions;
  /** Pays fees for every user transaction (design rule: users never need SOL). */
  sponsor!: KeyPairSigner;

  constructor(@Inject(ENV) private readonly env: Env) {
    this.rpc = createSolanaRpcFromTransport(createRetryingTransport(env.RPC_URL));
    this.rpcSubscriptions = createSolanaRpcSubscriptions(env.RPC_WS_URL);
  }

  async onModuleInit() {
    this.sponsor = await createKeyPairSignerFromBytes(this.env.FEE_PAYER_SECRET);
  }

  explorerTxUrl(signature: string): string {
    const cluster =
      this.env.SOLANA_CLUSTER === 'localnet'
        ? 'custom&customUrl=http%3A%2F%2Flocalhost%3A8899'
        : this.env.SOLANA_CLUSTER;
    return `https://explorer.solana.com/tx/${signature}?cluster=${cluster}`;
  }
}
