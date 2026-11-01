/**
 * Sets the demo-clock offset on a program deployment and reads it back.
 *   pnpm --filter @kolab/api demo:clock -- --target demo --offset 259200   (+72h)
 * The release (hosted) program rejects this with DemoClockDisabled.
 */
import { fetchConfig, findConfigPda, getSetDemoOffsetInstructionAsync, KOLAB_PROGRAM_IDS } from '@kolab/sdk';
import { keypair, parseTarget, rpc, send } from './lib.js';

const target = parseTarget();
const i = process.argv.indexOf('--offset');
const offset = BigInt(i >= 0 ? process.argv[i + 1]! : '0');
const programAddress = KOLAB_PROGRAM_IDS[target];
const feePayer = await keypair('fee-payer');
const admin = await keypair('admin');

await send(feePayer, [await getSetDemoOffsetInstructionAsync({ admin, offsetSecs: offset }, { programAddress })], `set_demo_offset(${offset})`);
const [config] = await findConfigPda({ programAddress });
const cfg = await fetchConfig(rpc, config);
console.log(`demo_offset on ${target}: ${cfg.data.demoOffset}s`);
process.exit(0);
