// TEST_ONLY configuration/orchestration checks. No Docker daemon, listener,
// grant, provider, migration or source custody is installed by this suite.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = fileURLToPath(new URL('../../', import.meta.url)).replace(/\/$/, '');
const script = readFileSync(new URL('./preview.sh', import.meta.url), 'utf8');
const fixedHome = '/home/bobby/.config/portal-research-preview';
const nativeOverlay = join(root, 'deploy/research-preview/compose.native-review.yaml');
const currentOverlay = join(root, 'deploy/research-preview/compose.native-current.yaml');
const overlay = readFileSync(currentOverlay, 'utf8');
const sentinel = 'TEST_ONLY-private-environment-content-must-not-be-printed';
const pins = {
  RESEARCH_NATIVE_ROOT_CONFIG_SHA256: 'a'.repeat(64),
  RESEARCH_NATIVE_CURRENT_CONFIG_SHA256: 'b'.repeat(64),
  RESEARCH_NATIVE_CURRENT_VIEW_CONFIG_SHA256: 'c'.repeat(64),
};

function withHarness(fn, { current = true, native = true, store = true, fixture = false } = {}) {
  const temporary = mkdtempSync(join(tmpdir(), 'research-native-current-config-'));
  try {
    const home = join(temporary, 'home'), bin = join(temporary, 'bin'), copy = join(temporary, 'preview.sh');
    mkdirSync(home); mkdirSync(bin); mkdirSync(join(home, 'execution-native'));
    writeFileSync(join(home, 'preview.env'), `PORTAL_HTTP_PORT=8095\nTEST_ONLY_PRIVATE=${sentinel}\n`, { mode: 0o600 });
    writeFileSync(join(home, 'execution-native/runtime.env'), `TEST_ONLY_PRIVATE=${sentinel}\n`, { mode: 0o600 });
    for (const [enabled, name] of [[current, 'execution-native-current.enabled'], [native, 'execution-native.enabled'],
      [store, 'execution-store.enabled'], [fixture, 'fixture-bff.enabled']])
      if (enabled) writeFileSync(join(home, name), '', { mode: 0o600 });
    // Exercise the actual shell through a fake Docker. Relocate only its fixed
    // host path and checkout root in this throwaway copy; never touch the real
    // Research marker/config directory. A separate negative checks the fence.
    assert(script.includes(fixedHome));
    writeFileSync(copy, script.replaceAll(fixedHome, home).replace(/^ROOT=.*$/m, `ROOT='${root}'`));
    writeFileSync(join(bin, 'docker'), '#!/usr/bin/env bash\nif [[ "$1" == info ]]; then exit 0; fi\nprintf "%s\\n" "$@"\n', { mode: 0o700 });
    const run = (extra = {}) => spawnSync('bash', [copy, 'compose', 'config', '--format', 'json'], {
      encoding: 'utf8', env: { ...process.env, PATH: `${bin}:/usr/bin:/bin`, RESEARCH_PREVIEW_HOME: home, ...extra },
    });
    return fn({ run, home, bin, temporary });
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}

test('CURRENT overlay changes only six explicitly pinned loader environment keys', () => {
  const entries = [...overlay.matchAll(/^      ([A-Z0-9_]+): (.+)$/gm)].map((match) => [match[1], match[2]]);
  assert.deepEqual(entries, [
    ['CONTROL_API_NATIVE_ROOT_CONFIG_FILE', '/run/secrets/research-native/root-runtime.json'],
    ['CONTROL_API_NATIVE_ROOT_CONFIG_SHA256', '${RESEARCH_NATIVE_ROOT_CONFIG_SHA256:?Pinned Research ROOT manifest is required}'],
    ['CONTROL_API_NATIVE_CURRENT_CONFIG_FILE', '/run/secrets/research-native/current-runtime.json'],
    ['CONTROL_API_NATIVE_CURRENT_CONFIG_SHA256', '${RESEARCH_NATIVE_CURRENT_CONFIG_SHA256:?Pinned Research CURRENT manifest is required}'],
    ['CONTROL_API_CURRENT_VIEW_CONFIG_FILE', '/run/secrets/research-native/current-view-runtime.json'],
    ['CONTROL_API_CURRENT_VIEW_CONFIG_SHA256', '${RESEARCH_NATIVE_CURRENT_VIEW_CONFIG_SHA256:?Pinned Research CurrentView manifest is required}'],
  ]);
  assert.deepEqual([...overlay.matchAll(/^  ([a-z][a-z0-9-]*):$/gm)].map(match => match[1]), ['control-api']);
  assert.deepEqual([...overlay.matchAll(/^    ([a-z_]+):$/gm)].map(match => match[1]), ['environment']);
  assert.doesNotMatch(overlay, /^      (?:FEATURE_|EXECUTION_READ_PROFILE|DATABASE_URL|AUTH_MODE|.*STREAM|.*COMMAND)/m);
});

test('existing native review does not implicitly enable CURRENT', () => withHarness(({ run }) => {
  const result = run(); assert.equal(result.status, 0, result.stderr);
  assert(result.stdout.includes(nativeOverlay)); assert(!result.stdout.includes(currentOverlay));
  assert(!result.stdout.includes(sentinel));
}, { current: false }));

test('explicit CURRENT opt-in follows native review and precedes fixture, using the already checked runtime.env', () =>
  withHarness(({ run, home }) => {
    const result = run(); assert.equal(result.status, 0, result.stderr);
    const args = result.stdout.trim().split('\n');
    assert(args.indexOf(nativeOverlay) < args.indexOf(currentOverlay));
    assert(args.indexOf(currentOverlay) < args.indexOf(join(root, 'deploy/research-preview/compose.fixture-bff.yaml')));
    assert(args.includes(join(home, 'execution-native/runtime.env')));
    assert.equal(args.filter(value => value === '--env-file').length, 2);
    assert(!result.stdout.includes(sentinel)); assert(!result.stderr.includes(sentinel));
  }, { fixture: true }));

for (const missing of ['native', 'store'])
  test(`CURRENT refuses missing ${missing} dependency instead of falling back`, () =>
    withHarness(({ run }) => {
      const result = run(); assert.notEqual(result.status, 0);
      assert.match(result.stderr, /requires the fixed isolated/);
      assert(!result.stdout.includes(currentOverlay));
    }, { [missing]: false }));

for (const kind of ['public', 'symlink', 'dangling-symlink', 'directory', 'foreign-owner'])
  test(`CURRENT refuses ${kind} opt-in marker`, () => withHarness(({ run, home, bin }) => {
    const marker = join(home, 'execution-native-current.enabled');
    if (kind === 'public') chmodSync(marker, 0o644);
    else if (kind === 'foreign-owner') writeFileSync(join(bin, 'stat'),
      `#!/usr/bin/env bash\nif [[ "$1" == -c && "$2" == %u && "$3" == '${marker}' ]]; then printf '999999\\n'; else exec /usr/bin/stat "$@"; fi\n`, { mode: 0o700 });
    else {
      rmSync(marker);
      if (kind === 'directory') mkdirSync(marker);
      else symlinkSync(join(home, kind === 'symlink' ? 'execution-native.enabled' : 'missing'), marker);
    }
    const result = run(); assert.notEqual(result.status, 0);
    assert.match(result.stderr, /owner-only regular Research opt-in marker/);
    assert(!result.stdout.includes(currentOverlay));
  }));

for (const kind of ['public', 'symlink', 'missing'])
  test(`CURRENT preserves native runtime.env ${kind} rejection`, () => withHarness(({ run, home }) => {
    const environment = join(home, 'execution-native/runtime.env');
    if (kind === 'public') chmodSync(environment, 0o644);
    else {
      rmSync(environment);
      if (kind === 'symlink') symlinkSync(join(home, 'preview.env'), environment);
    }
    const result = run(); assert.notEqual(result.status, 0);
    assert.match(result.stderr, /owner-only Research environment file/);
    assert(!result.stdout.includes(currentOverlay)); assert(!result.stderr.includes(sentinel));
  }));

test('CURRENT cannot select an arbitrary preview directory', () => withHarness(({ run, temporary }) => {
  const other = join(temporary, 'other'); mkdirSync(other);
  writeFileSync(join(other, 'preview.env'), 'PORTAL_HTTP_PORT=8095\n');
  writeFileSync(join(other, 'execution-native-current.enabled'), '', { mode: 0o600 });
  const result = run({ RESEARCH_PREVIEW_HOME: other });
  assert.notEqual(result.status, 0); assert.match(result.stderr, /requires the fixed isolated Research native review/);
  assert(!result.stdout.includes(currentOverlay));
}));

// `docker compose config` is client-side rendering only, not Docker info/up/run
// and not a source qualification. Do not require/pull/build any container image.
const composeAvailable = spawnSync('docker', ['compose', 'version', '--short'], { encoding: 'utf8' }).status === 0;
function render(overrides = {}) {
  const temporary = mkdtempSync(join(tmpdir(), 'research-native-current-render-'));
  try {
    const base = join(temporary, 'base.yaml'), env = join(temporary, 'compose.env');
    writeFileSync(base, 'services:\n  control-api:\n    image: example.invalid/TEST_ONLY/not-started:never\n');
    writeFileSync(env, 'RESEARCH_NATIVE_WORKSPACE_ID=TEST_ONLY-research\nRESEARCH_NATIVE_EDGE_ORIGIN=https://127.0.0.1:1\nRESEARCH_NATIVE_CORE_CONFIG_SHA256=' + 'd'.repeat(64) + '\n');
    return spawnSync('docker', ['compose', '--project-name', 'test-only-native-current-config', '--project-directory', temporary,
      '--env-file', env, '-f', base, '-f', nativeOverlay, '-f', currentOverlay, 'config', '--format', 'json'], {
      encoding: 'utf8', env: { ...process.env, ...pins, ...overrides }, timeout: 10_000,
    });
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}

test('rendered composition preserves native review flags and reuses its read-only mount', {
  skip: composeAvailable ? false : 'Compose CLI unavailable; no daemon is required or probed',
}, () => {
  const result = render(); assert.equal(result.status, 0, result.stderr);
  const services = JSON.parse(result.stdout).services;
  assert.deepEqual(Object.keys(services), ['control-api']);
  const control = services['control-api'], env = control.environment;
  assert.equal(env.EXECUTION_READ_PROFILE, 'native_manager_review_v1');
  for (const gate of ['REALTIME_SSE', 'COMMAND_RELAY', 'CURRENT_SOURCE_SANDBOX', 'CURRENT_SOURCE_LIVE'])
    assert.equal(env[`FEATURE_EXECUTION_${gate}`], 'false');
  for (const [name, value] of Object.entries(pins)) {
    const output = name === 'RESEARCH_NATIVE_CURRENT_VIEW_CONFIG_SHA256'
      ? 'CONTROL_API_CURRENT_VIEW_CONFIG_SHA256' : name.replace('RESEARCH_', 'CONTROL_API_');
    assert.equal(env[output], value);
  }
  assert.deepEqual(control.volumes, [{ type: 'bind', source: `${fixedHome}/execution-native/runtime`,
    target: '/run/secrets/research-native', read_only: true, bind: {} }]);
});

for (const pin of Object.keys(pins))
  test(`rendering refuses absent ${pin} independently`, {
    skip: composeAvailable ? false : 'Compose CLI unavailable; required substitutions also checked statically',
  }, () => {
    const result = render({ [pin]: '' }); assert.notEqual(result.status, 0);
    assert.match(result.stderr, new RegExp(pin));
  });
