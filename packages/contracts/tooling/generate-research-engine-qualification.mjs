/** Additive actual engine metadata; never admission/default authority. */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
for (const name of ['research-progress', 'research-evidence', 'research-split', 'research-search', 'research-freeze']) {
  const path = `${root}openapi/${name}.openapi.json`;
  const old = readFileSync(path, 'utf8');
  const next = old.replace(/("engine_version"\s*:\s*\{\s*(?:"anyOf"\s*:\s*\[\s*\{\s*)?)"const"\s*:\s*"1\.1\.1"/g,
    '$1"enum": ["1.1.0", "1.1.1"]');
  JSON.parse(next);
  if (process.argv.includes('--check')) {
    if (old !== next) throw new Error(`Engine metadata contract drift: ${name}`);
  } else if (old !== next) writeFileSync(path, next);
}
