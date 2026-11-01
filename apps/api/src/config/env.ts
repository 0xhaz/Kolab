import { z } from 'zod';

const keypairBytes = z
  .string()
  .min(1)
  .transform((s, ctx) => {
    try {
      const bytes = JSON.parse(s) as unknown;
      if (Array.isArray(bytes) && bytes.length === 64) return Uint8Array.from(bytes as number[]);
    } catch {
      // fall through
    }
    ctx.addIssue({ code: 'custom', message: 'must be a 64-byte JSON array' });
    return z.NEVER;
  });

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.url(),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((s) => s.split(',').map((o) => o.trim())),
  PRIVY_APP_ID: z.string().min(1),
  PRIVY_APP_SECRET: z.string().min(1),
  AI_PROVIDER: z.enum(['gemini', 'mock']).default('mock'),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().optional(),
  RPC_URL: z.url().default('https://api.devnet.solana.com'),
  RPC_WS_URL: z.url().default('wss://api.devnet.solana.com'),
  SOLANA_CLUSTER: z.enum(['devnet', 'localnet', 'mainnet-beta']).default('devnet'),
  /** Fee-payer keypair as a JSON byte array (solana-keygen format). Devnet only. */
  FEE_PAYER_SECRET: keypairBytes,
  /** Verifier keypair: signs attest_checks / attest_live / record_sale. Devnet only. */
  VERIFIER_SECRET: keypairBytes,
  /** Config admin + test-USDC mint authority (keys/admin.json). Demo faucet / clock only. */
  DEMO_ADMIN_SECRET: keypairBytes.optional(),
  MOCK_BASE_URL: z.url().default('http://localhost:4100'),
  /** Shared with the store (mock in demo) for HMAC-signed sale webhooks. */
  STORE_WEBHOOK_SECRET: z.string().min(16),
  /** Still-live check runs this long after a post slot is released (architecture: +7 days). */
  /** 32-byte hex key: shipping addresses are AES-256-GCM encrypted at rest (never on-chain). */
  /** UGC files: Cloudinary when all three are set, otherwise local disk (dev). */
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  UPLOAD_DIR: z.string().default('storage/uploads'),
  ADDRESS_ENC_KEY: z.string().regex(/^[0-9a-f]{64}$/, 'must be 64 hex chars'),
  STILL_LIVE_AFTER_SECS: z.coerce.number().int().min(0).default(7 * 24 * 3600),
  PROGRAM_ID: z.string().min(32).max(44),
  USDC_MINT: z.string().min(32).max(44),
  INDEXER_POLL_MS: z.coerce.number().int().min(500).default(4000),
  /** Background loops (indexer poll, crank). Off in tests. */
  WORKERS_ENABLED: z
    .enum(['0', '1'])
    .default('1')
    .transform((v) => v === '1'),
  DEMO_MODE: z
    .enum(['0', '1'])
    .default('0')
    .transform((v) => v === '1'),
  /** Cross-chain funding: `simulated` on devnet (Aurora Intents is mainnet-only), `aurora` on mainnet. */
  AURORA_MODE: z.enum(['simulated', 'aurora']).default('simulated'),
  AURORA_API_KEY: z.string().optional(),
  AURORA_API_URL: z.url().default('https://intents-api.aurora.dev'),
  AURORA_CONNECT_URL: z.url().default('https://intents-connect-api.aurora.dev'),
  /** Kolab's integrator fee on cross-chain flows (Aurora pays 60% of it to the integrator). */
  AURORA_APP_FEE_BPS: z.coerce.number().int().min(0).max(500).default(50),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

export const ENV = Symbol('ENV');
