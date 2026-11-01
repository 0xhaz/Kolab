/**
 * One-time devnet setup per program deployment (workplan §0.3):
 *   test USDC mint (6 decimals) → init_config(treasury, verifier, 5%) → allow_mint.
 * Idempotent; writes keys/chain-<target>.json and prints the API env lines.
 *
 *   pnpm --filter @kolab/api chain:setup -- --target hosted|demo
 */
import { lamports } from '@solana/kit';
import { getCreateAccountInstruction, getTransferSolInstruction } from '@solana-program/system';
import { getInitializeMint2Instruction, getMintSize, TOKEN_PROGRAM_ADDRESS } from '@solana-program/token';
import {
  KOLAB_PROGRAM_IDS,
  fetchConfig,
  fetchMaybeConfig,
  findConfigPda,
  getAllowMintInstructionAsync,
  getInitConfigInstructionAsync,
} from '@kolab/sdk';
import path from 'node:path';
import { KEYS, accountExists, keypair, parseTarget, rpc, send, writeJson } from './lib.js';

const FEE_BPS = 500;
const target = parseTarget();
const programAddress = KOLAB_PROGRAM_IDS[target];

const feePayer = await keypair('fee-payer');
const admin = await keypair('admin', true);
const treasury = await keypair('treasury');
const verifier = await keypair('verifier');
const mint = await keypair(`usdc-mint-${target}`, true);

console.log(`Kolab chain setup — target ${target}, program ${programAddress}`);

if (!(await accountExists(programAddress))) {
  throw new Error(`Program ${programAddress} is not deployed on this cluster yet`);
}

// Admin pays for init_config; top it up from the sponsor.
const { value: adminBalance } = await rpc.getBalance(admin.address).send();
if (adminBalance < 50_000_000n) {
  await send(
    feePayer,
    [getTransferSolInstruction({ source: feePayer, destination: admin.address, amount: lamports(100_000_000n) })],
    'fund admin 0.1 SOL',
  );
}

if (!(await accountExists(mint.address))) {
  const space = BigInt(getMintSize());
  const rent = await rpc.getMinimumBalanceForRentExemption(space).send();
  await send(
    feePayer,
    [
      getCreateAccountInstruction({
        payer: feePayer,
        newAccount: mint,
        lamports: rent,
        space,
        programAddress: TOKEN_PROGRAM_ADDRESS,
      }),
      getInitializeMint2Instruction({ mint: mint.address, decimals: 6, mintAuthority: admin.address }),
    ],
    `create test USDC mint ${mint.address}`,
  );
}

const [config] = await findConfigPda({ programAddress });
const existing = await fetchMaybeConfig(rpc, config);
if (!existing.exists) {
  await send(
    feePayer,
    [
      await getInitConfigInstructionAsync(
        { admin, treasury: treasury.address, verifier: verifier.address, feeBps: FEE_BPS },
        { programAddress },
      ),
    ],
    'init_config',
  );
}

const cfg = await fetchConfig(rpc, config);
const allowed = cfg.data.allowedMints.slice(0, cfg.data.allowedMintCount);
if (!allowed.includes(mint.address)) {
  await send(feePayer, [await getAllowMintInstructionAsync({ admin, mint: mint.address }, { programAddress })], 'allow_mint');
}

const out = {
  target,
  programId: programAddress,
  config,
  usdcMint: mint.address,
  admin: admin.address,
  treasury: treasury.address,
  verifier: verifier.address,
  feeBps: FEE_BPS,
};
writeJson(path.join(KEYS, `chain-${target}.json`), out);
console.log(`\nWrote keys/chain-${target}.json. API env:\n  PROGRAM_ID=${programAddress}\n  USDC_MINT=${mint.address}`);
