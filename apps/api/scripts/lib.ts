// Shared helpers for the devnet scripts (chain-setup, seed). Not part of the API build.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  appendTransactionMessageInstructions,
  assertIsTransactionWithBlockhashLifetime,
  assertIsTransactionWithinSizeLimit,
  createKeyPairSignerFromBytes,
  createSolanaRpcFromTransport,
  createSolanaRpcSubscriptions,
  createTransactionMessage,
  generateKeyPairSigner,
  getSignatureFromTransaction,
  pipe,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Instruction,
  type KeyPairSigner,
  type TransactionSigner,
} from '@solana/kit';

import { createRetryingTransport } from '../src/solana/retrying-transport.js';

// Works from scripts/ (tsx) and dist-scripts/scripts/ (compiled): walk up to the workspace root.
function findRepo(dir: string): string {
  while (!existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
    const up = path.dirname(dir);
    if (up === dir) throw new Error('workspace root not found');
    dir = up;
  }
  return dir;
}
export const REPO = findRepo(path.dirname(fileURLToPath(import.meta.url)));
export const KEYS = path.join(REPO, 'keys');

export type Target = 'hosted' | 'demo';
export function parseTarget(argv = process.argv): Target {
  const i = argv.indexOf('--target');
  const t = i >= 0 ? argv[i + 1] : 'hosted';
  if (t !== 'hosted' && t !== 'demo') throw new Error('--target must be hosted or demo');
  return t;
}

export const RPC_URL = process.env.RPC_URL ?? 'https://api.devnet.solana.com';
export const WS_URL = process.env.RPC_WS_URL ?? 'wss://api.devnet.solana.com';
export const rpc = createSolanaRpcFromTransport(createRetryingTransport(RPC_URL));
export const rpcSubscriptions = createSolanaRpcSubscriptions(WS_URL);
const sendAndConfirm = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });

/** Loads keys/<name>.json (solana-keygen format), creating it if `create` is set. */
export async function keypair(name: string, create = false): Promise<KeyPairSigner> {
  const file = path.join(KEYS, `${name}.json`);
  if (!existsSync(file)) {
    if (!create) throw new Error(`Missing ${file}`);
    mkdirSync(KEYS, { recursive: true });
    const signer = await generateKeyPairSigner(true);
    const secret = new Uint8Array(await crypto.subtle.exportKey('pkcs8', signer.keyPair.privateKey));
    const pub = new Uint8Array(await crypto.subtle.exportKey('raw', signer.keyPair.publicKey));
    // pkcs8 Ed25519: last 32 bytes are the seed; solana-keygen stores seed || pubkey.
    writeFileSync(file, JSON.stringify([...secret.slice(-32), ...pub]));
  }
  return createKeyPairSignerFromBytes(new Uint8Array(JSON.parse(readFileSync(file, 'utf8'))));
}

export async function accountExists(address: string): Promise<boolean> {
  const { value } = await rpc.getAccountInfo(address as never, { encoding: 'base64' }).send();
  return value !== null;
}

export async function send(feePayer: TransactionSigner, instructions: Instruction[], label: string) {
  const { value: blockhash } = await rpc.getLatestBlockhash({ commitment: 'confirmed' }).send();
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(feePayer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
    (m) => appendTransactionMessageInstructions(instructions, m),
  );
  const tx = await signTransactionMessageWithSigners(message);
  assertIsTransactionWithinSizeLimit(tx);
  assertIsTransactionWithBlockhashLifetime(tx);
  await sendAndConfirm(tx, { commitment: 'confirmed' });
  const sig = getSignatureFromTransaction(tx);
  console.log(`  ✓ ${label}  ${sig}`);
  return sig;
}

export function writeJson(file: string, data: unknown) {
  writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}
