// Regenerates src/generated from the Anchor IDL. Run after `anchor build` (pnpm --filter @kolab/sdk generate).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createFromRoot } from 'codama';
import { rootNodeFromAnchor } from '@codama/nodes-from-anchor';
import { renderVisitor } from '@codama/renderers-js';

const here = path.dirname(fileURLToPath(import.meta.url));
const idl = JSON.parse(readFileSync(path.join(here, '../../../target/idl/kolab.json'), 'utf8'));
const codama = createFromRoot(rootNodeFromAnchor(idl));
// The renderer treats the path as a package root and writes <root>/src/generated.
await codama.accept(
  renderVisitor(path.join(here, '..'), {
    deleteFolderBeforeRendering: true,
    importExtension: 'js', // NodeNext ESM
    kitImportStrategy: 'rootOnly', // import everything from @solana/kit
    syncPackageJson: false, // deps are managed by hand in package.json
  }),
);
console.log('Generated @kolab/sdk client from target/idl/kolab.json');
