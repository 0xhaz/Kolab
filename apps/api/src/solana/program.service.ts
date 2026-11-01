import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { address, createKeyPairSignerFromBytes, type Address, type KeyPairSigner } from '@solana/kit';
import { fetchMaybeConfig, findConfigPda } from '@kolab/sdk';
import { ENV, type Env } from '../config/env.js';
import { SolanaService } from './solana.service.js';

/** Which Kolab deployment this API talks to, plus the backend's program-level signers. */
@Injectable()
export class ProgramService implements OnModuleInit {
  private readonly logger = new Logger(ProgramService.name);
  readonly programAddress: Address;
  readonly usdcMint: Address;
  verifier!: KeyPairSigner;
  /** Config admin and test-USDC mint authority; only loaded in demo mode. */
  demoAdmin: KeyPairSigner | null = null;
  config!: Address;
  private demoOffset = 0;
  private offsetReadAt = 0;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly solana: SolanaService,
  ) {
    this.programAddress = address(env.PROGRAM_ID);
    this.usdcMint = address(env.USDC_MINT);
  }

  async onModuleInit() {
    this.verifier = await createKeyPairSignerFromBytes(this.env.VERIFIER_SECRET);
    if (this.env.DEMO_MODE && this.env.DEMO_ADMIN_SECRET) {
      this.demoAdmin = await createKeyPairSignerFromBytes(this.env.DEMO_ADMIN_SECRET);
    }
    [this.config] = await findConfigPda({ programAddress: this.programAddress });
  }

  /** Program clock in unix seconds: wall clock + Config.demo_offset (0 on the release build). */
  async chainNow(): Promise<number> {
    if (Date.now() - this.offsetReadAt > 10_000) {
      try {
        const cfg = await fetchMaybeConfig(this.solana.rpc, this.config);
        this.demoOffset = cfg.exists ? Number(cfg.data.demoOffset) : 0;
        this.offsetReadAt = Date.now();
      } catch (err) {
        this.logger.warn({ err }, 'could not read demo offset; using last known');
      }
    }
    return Math.floor(Date.now() / 1000) + this.demoOffset;
  }

  /** Forces the next `chainNow()` to re-read the offset (after the demo panel moves the clock). */
  invalidateClock() {
    this.offsetReadAt = 0;
  }
}
