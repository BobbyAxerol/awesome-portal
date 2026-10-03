import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const script = fileURLToPath(new URL('./preview.sh', import.meta.url));
function probe({ direct, port = '8095' }) {
  const temporary = mkdtempSync(join(tmpdir(), 'p22-source-stamps-test-'));
  try {
    const bin = join(temporary, 'bin'), home = join(temporary, 'home');
    mkdirSync(bin); mkdirSync(home);
    writeFileSync(join(home, 'preview.env'), `PORTAL_HTTP_PORT=${port}\n`, { mode: 0o600 });
    writeFileSync(join(bin, 'docker'), `#!/bin/bash\nif [[ "$1" == info ]]; then exit ${direct ? 0 : 1}; fi\nprintf '%s\\n' "$@"\nprintf 'stamp=%s\\n' "$PORTAL_BUILD_COMMIT"\n`, { mode: 0o700 });
    writeFileSync(join(bin, 'sudo'), '#!/bin/bash\nif [[ "$*" == "-n docker info" ]]; then exit 0; fi\nprintf "%s\\n" "$@"\n', { mode: 0o700 });
    return spawnSync('bash', [script, 'compose', 'build', 'control-api'], { encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:/usr/bin:/bin`, RESEARCH_PREVIEW_HOME: home,
        PORTAL_BUILD_COMMIT: '2cf6b904ae79f096f23a312ee548cc34fa958247', PORTAL_BUILD_DIRTY: 'false' } });
  } finally { rmSync(temporary, { recursive: true }); }
}
test('sudo fallback forwards exactly the two source stamps, not a generic preserved environment', () => {
  const result = probe({ direct: false });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /-n\nenv\nPORTAL_BUILD_COMMIT=2cf6b904ae79f096f23a312ee548cc34fa958247\nPORTAL_BUILD_DIRTY=false\ndocker\ncompose/);
  assert(!result.stdout.includes('--preserve-env'));
  assert.match(result.stdout, /portal-research-preview\n--project-directory\n/);
  assert.match(result.stdout, /build\ncontrol-api\n$/);
});
test('direct Docker still receives caller source stamp', () => {
  const result = probe({ direct: true });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /stamp=2cf6b904ae79f096f23a312ee548cc34fa958247/);
  assert(!result.stdout.includes('\nenv\n'));
});
test('existing wrong-stack port protection is unchanged', () => {
  const result = probe({ direct: false, port: '18081' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /belongs to another stack/);
});
