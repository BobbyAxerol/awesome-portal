/** Coherent, bounded generation target for the approved expansion. */
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
// Runtime recipe views must precede contract/build consumers. Both bindings
// and registry are immutable inputs; avoid building a new registry with stale
// generated TS/Python lookup tables.
execFileSync(process.execPath,['tooling/generate-research-execution-recipes.mjs'],{cwd:root,stdio:'inherit'});
for(const file of ['generate-research-expanded-trial-contracts.mjs','generate-research-native-contracts.mjs','generate-research-run-setup.mjs','generate-research-fixed-replay-companion.mjs'])
 execFileSync(process.execPath,[`tooling/${file}`],{cwd:root,stdio:'inherit'});
for(const name of ['dataset-index','preflight','run-create','progress','evidence','split','search','freeze','replay','report','foundation','attempt-lineage','run-library','current-source','run-setup','fixed-replay-companion'])
 execFileSync(fileURLToPath(new URL('../node_modules/.bin/openapi-typescript',import.meta.url)),[`openapi/research-${name}.openapi.json`,'-o',`generated/research-${name}.d.ts`],{cwd:root,stdio:'inherit'});
