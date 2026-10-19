// FIXTURE_LAB lane. NOT acceptance evidence.
//
// Static checks for the fixture BFF overlay of the isolated Research preview. Nothing here starts,
// builds or deploys anything: `docker compose config` and `nginx -t/-T` only read configuration, and
// the docker-backed tests skip themselves when Docker (or the pinned nginx image) is not available.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const script = fileURLToPath(new URL('./preview.sh', import.meta.url));
const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (relative) => readFileSync(join(root, relative), 'utf8');

const BANNER = 'FIXTURE DATA - sample data for UI/UX review, not real data, not acceptance evidence';
const V2_MANIFEST = 'fleet,archived,portfolios,alpha,workbench,account,ops,profile,overview,cockpit,shell,compare,blotter,admin,users,replay';
const NGINX_IMAGE = 'nginx:1.29-alpine@sha256:5616878291a2eed594aee8db4dade5878cf7edcb475e59193904b198d9b830de';
const SECRET_SENTINEL = 'SENTINEL-SECRET-must-never-be-printed';

// ── a fake docker that records every call and a throwaway preview home ────────────────────────────

function withHome(fn, { marker = false, env = '' } = {}) {
  const temporary = mkdtempSync(join(tmpdir(), 'fixture-bff-config-'));
  try {
    const bin = join(temporary, 'bin'), home = join(temporary, 'home'), log = join(temporary, 'docker.log');
    mkdirSync(bin); mkdirSync(home);
    writeFileSync(join(home, 'preview.env'),
      `PORTAL_HTTP_PORT=8095\nPORTAL_SECRET_TOKEN=${SECRET_SENTINEL}\n${env}`, { mode: 0o600 });
    if (marker) writeFileSync(join(home, 'fixture-bff.enabled'), '');
    writeFileSync(join(bin, 'docker'),
      `#!/bin/bash\nif [[ "$1" == info ]]; then exit 0; fi\nprintf '%s\\n' "$*" >>'${log}'\nprintf '%s\\n' "$@"\n`, { mode: 0o700 });
    const run = (...args) => spawnSync('bash', [script, ...args], { encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:/usr/bin:/bin`, RESEARCH_PREVIEW_HOME: home } });
    return fn({ run, home, log, temporary });
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}
const dockerCalls = (log) => (existsSync(log) ? readFileSync(log, 'utf8').trim() : '');

const BASE_ARGS = (home) => [
  'compose', '-p', 'portal-research-preview', '--project-directory', root.replace(/\/$/, ''),
  '--env-file', join(home, 'preview.env'),
  '-f', `${root}compose.yaml`,
  '-f', `${root}deploy/compose.research-progress.yaml`,
  '-f', `${root}deploy/research-preview/compose.research-preview.yaml`,
];

// ── preview.sh: marker, subcommand, rails ─────────────────────────────────────────────────────────

test('marker absent: the compose argument vector is byte-for-byte the one preview.sh always had', () => {
  withHome(({ run, home }) => {
    const result = run('compose', 'config');
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, [...BASE_ARGS(home), 'config'].join('\n') + '\n');
    assert(!result.stdout.includes('compose.fixture-bff'));
  });
});

test('marker present: exactly one extra -f, the fixture overlay, appended after the base files', () => {
  withHome(({ run, home }) => {
    const result = run('compose', 'config');
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout,
      [...BASE_ARGS(home), '-f', `${root}deploy/research-preview/compose.fixture-bff.yaml`, 'config'].join('\n') + '\n');
  }, { marker: true });
});

test('fixture on/off/status only touch the marker, never call docker, never print the env file', () => {
  withHome(({ run, home, log }) => {
    const marker = join(home, 'fixture-bff.enabled');
    assert.match(run('fixture', 'status').stdout, /fixture-bff: off/);

    const on = run('fixture', 'on');
    assert.equal(on.status, 0, on.stderr);
    assert(existsSync(marker));
    assert.match(on.stdout, /next: .*preview\.sh build portal-web portal-fixture-bff && .*preview\.sh up/);
    assert.match(run('fixture', 'status').stdout, /fixture-bff: on/);

    const off = run('fixture', 'off');
    assert.equal(off.status, 0, off.stderr);
    assert(!existsSync(marker));
    assert.match(off.stdout, /next: .*preview\.sh up/);
    assert.match(off.stdout, /docker rm -f portal-research-preview-portal-fixture-bff-1/);

    for (const result of [on, off, run('fixture', 'status')]) {
      assert(!result.stdout.includes(SECRET_SENTINEL) && !result.stderr.includes(SECRET_SENTINEL));
    }
    assert.equal(dockerCalls(log), '', 'fixture subcommand must not run docker');
    assert.equal(run('fixture', 'bogus').status, 2);
  });
});

test('fixture on warns when the V2 manifest is empty and counts it when set', () => {
  withHome(({ run }) => {
    const empty = run('fixture', 'on');
    assert.match(empty.stderr, /PORTAL_EXECUTION_V2_SCREENS is empty/);
  });
  withHome(({ run }) => {
    const full = run('fixture', 'on');
    assert.match(full.stdout, /lists 16 screen\(s\)/);
    assert.doesNotMatch(full.stderr, /is empty/);
    assert(!full.stdout.includes(V2_MANIFEST), 'the value itself is not echoed');
  }, { env: `PORTAL_EXECUTION_V2_SCREENS=${V2_MANIFEST}\n` });
});

test('the safety rails are unchanged with the marker set: forbidden port, project name', () => {
  for (const port of ['8080', '8081', '8090', '18081']) {
    withHome(({ run, home }) => {
      writeFileSync(join(home, 'preview.env'), `PORTAL_HTTP_PORT=${port}\n`, { mode: 0o600 });
      const result = run('compose', 'config');
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /belongs to another stack/);
    }, { marker: true });
  }
  const source = read('scripts/research-preview/preview.sh');
  assert.match(source, /PROJECT="portal-research-preview"/);
  assert.match(source, /FORBIDDEN_PORTS=" 8080 8081 8090 18081 "/);
});

test('build adds the fixture image only while the marker is set; up/identity accept it', () => {
  withHome(({ run, log }) => {
    const wheel = join(root, 'vendor/hmd-reader/primus_historical_market_data-0.1.0rc3-py3-none-any.whl');
    if (!existsSync(wheel)) return; // build refuses without the staged wheel; the argument shape is covered below
    run('build');
    assert.match(dockerCalls(log), /build .*portal-fixture-bff/);
  }, { marker: true });
  const source = read('scripts/research-preview/preview.sh');
  assert.match(source, /if \[\[ \$# -eq 0 && -f "\$FIXTURE_MARKER" \]\]; then services\+=\(portal-fixture-bff\); fi/);
  assert.match(source, /\[\[ "\$service" == portal-fixture-bff && -f "\$FIXTURE_MARKER" \]\] && continue/);
  withHome(({ run }) => {
    const result = run('build', 'portal-fixture-bff');
    assert.notEqual(result.status, 0, 'marker absent: the fixture image is not a supported build service');
  });
});

// ── overlay and nginx fragment: text-level ────────────────────────────────────────────────────────

const overlay = read('deploy/research-preview/compose.fixture-bff.yaml');
const fragment = read('deploy/research-preview/nginx/fixture-bff/fixture-bff.conf');
const proxyInc = read('deploy/research-preview/nginx/fixture-bff/proxy.inc');
const portalConf = read('deploy/nginx/portal.conf');

test('overlay: the fixture service is private, read-only and capped', () => {
  const raw = overlay.match(/^  portal-fixture-bff:\n([\s\S]*?)(?=^  portal-web:)/m)?.[1];
  assert(raw, 'portal-fixture-bff service missing');
  const service = raw.replace(/^\s*#.*$/gm, '');
  assert.match(service, /^    read_only: true$/m);
  assert.match(service, /^    cap_drop:\n      - ALL$/m);
  assert.match(service, /^      - no-new-privileges:true$/m);
  assert.match(service, /^    mem_limit: 256m$/m);
  assert.match(service, /^    pids_limit: 64$/m);
  assert.match(service, /^    cpus: 0\.5$/m);
  assert.match(service, /^    restart: unless-stopped$/m);
  assert.match(service, /^    healthcheck:$/m);
  assert.doesNotMatch(service, /^    ports:/m);
  assert.doesNotMatch(service, /FIXTURE_LANE_LABEL/);
  assert.match(service, /^      FIXTURE_WRITES: \$\{FIXTURE_WRITES:-refuse\}$/m, 'writes are refused unless the operator opts in');
  assert.doesNotMatch(service, /(?:PASSWORD|SECRET|TOKEN|KEY)/i);
});

test('fragment: the banner text and the seven fixture locations are present', () => {
  assert(fragment.includes(BANNER));
  const locations = [...fragment.matchAll(/^location (\S+(?: \S+)?) \{$/gm)].map((match) => match[1]);
  assert.deepEqual(locations, [
    '^~ /api/v1/execution/',
    '= /api/admin/access/self',
    '= /api/admin/profile-access/v2/effective',
    '= /api/admin/accounts',
    '^~ /api/admin/accounts/',
    '= /api/admin/step-up',
    '^~ /__fixture/',
    '= /__fixture-banner.css',
  ]);
  for (const proxied of locations.slice(0, 7)) {
    const block = fragment.match(new RegExp(`^location ${proxied.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{\\n([\\s\\S]*?)^\\}`, 'm'))?.[1];
    assert(block?.includes('include /etc/nginx/fixture/proxy.inc;'), `${proxied} must use the shared proxy settings`);
  }
});

test('fragment: nothing under /api/auth or /api/v1/portal (or any other real service) reaches the fixture server', () => {
  assert.match(proxyInc, /^proxy_pass http:\/\/portal-fixture-bff:4100;$/m);
  assert.match(proxyInc, /^add_header X-Fixture-Overlay on always;$/m);
  const withoutComments = fragment.replace(/^\s*#.*$/gm, '');
  for (const real of ['/api/auth', '/api/v1/portal', '/api/v1/research', '/api/v1/quantbt', '/api/v1/alphas',
    '/api/runs', '/api/health', '/api/ready', '/roadmap-task-board/api']) {
    assert(!withoutComments.includes(real), `${real} must stay on the real services`);
  }
  assert.doesNotMatch(withoutComments, /location (?:~\*? |\/ |\/api\/ )/, 'no regex, root or /api/ catch-all location');
  assert.doesNotMatch(withoutComments, /proxy_pass/, 'proxy_pass lives only in the shared include');
  // The profile-access matches are exact, so the legacy matrix and /activity are not caught.
  assert(!/location \^~ \/api\/admin\/profile-access/.test(fragment));
  assert(!/location \^~ \/api\/admin\/ \{/.test(fragment));
});

test('fragment: the banner is fixed, above everything, pushes the page down and cannot be dismissed', () => {
  const css = fragment.match(/return 200 '([\s\S]*?)';/)?.[1];
  assert(css, 'banner stylesheet missing');
  assert.match(css, /#fixture-banner \{[^}]*position: fixed;[^}]*top: 0;[^}]*z-index: 2147483647;/);
  assert.match(css, /body \{ padding-top: var\(--fixture-banner-h\); \}/);
  assert.match(css, /--fixture-banner-h: 28px/);
  assert.match(css, /@media \(max-width: 720px\) \{ :root \{ --fixture-banner-h: 52px; \} \}/);
  assert.match(css, /body \.portal-topbar \{ top: var\(--fixture-banner-h\); \}/);
  // Token-neutral: literal colours, no app custom property for colour.
  assert.match(css, /background: #ffd400; color: #111111;/);
  // Same-origin stylesheet plus plain markup: valid under a CSP without 'unsafe-inline' (script or style).
  const subs = [...fragment.matchAll(/^sub_filter '([^']*)' '([^']*)';$/gm)];
  assert.equal(subs.length, 2);
  const injected = subs.map((match) => match[2]).join('');
  assert(injected.includes('href="/__fixture-banner.css"'));
  assert(injected.includes(`<div id="fixture-banner" role="note">${BANNER}</div>`));
  assert.doesNotMatch(injected, /<script|<style|style=|onclick|<button|<a /i);
  assert.match(fragment, /^sub_filter_once on;$/m);
  assert.match(fragment, /^sub_filter_types text\/html;$/m);
});

test('the markers sub_filter needs exist in both HTML documents portal-web serves', () => {
  for (const file of ['apps/portal/frontend/index.html', 'features/roadmap-task-board/frontend/index.html']) {
    const html = read(file);
    assert(html.includes('</head>'), `${file}: </head>`);
    assert(html.includes('<body>'), `${file}: plain <body> (sub_filter matches it literally)`);
  }
});

test('portal.conf only gained the empty-by-default include; no real location was touched', () => {
  const includes = portalConf.match(/^\s*include \/etc\/nginx\/fixture\/\*\.conf;$/gm) ?? [];
  assert.equal(includes.length, 1);
  assert.doesNotMatch(portalConf, /portal-fixture-bff|__fixture/);
  assert.match(portalConf, /location \^~ \/api\/auth\/ \{\n        gzip off;\n        proxy_pass http:\/\/\$\{PORTAL_WEB_UPSTREAM\};/);
});

// ── docker-backed static checks (config rendering, nginx -t / -T) ─────────────────────────────────

function dockerCommand() {
  for (const candidate of [['docker'], ['sudo', '-n', 'docker']]) {
    const probe = spawnSync(candidate[0], [...candidate.slice(1), 'info'], { encoding: 'utf8', timeout: 20000 });
    if (probe.status === 0) return candidate;
  }
  return null;
}
// FIXTURE_TEST_DOCKER=0 skips the docker-backed tests (they otherwise wait up to 10 minutes for the heavy-job lock).
const docker = process.env.FIXTURE_TEST_DOCKER === '0' ? null : dockerCommand();
const flock = spawnSync('flock', ['--version'], { encoding: 'utf8' }).status === 0;

// Docker work shares the host's heavy-job lock when it exists; if it cannot be had in time, skip.
function dockerRun(args, { env = process.env, timeout = 900000 } = {}) {
  const base = [...docker, ...args];
  const [cmd, ...rest] = flock ? ['flock', '-w', '600', '/tmp/portal-heavy.lock', ...base] : base;
  return spawnSync(cmd, rest, { encoding: 'utf8', env, timeout, maxBuffer: 64 * 1024 * 1024 });
}

function renderCompose(marker) {
  return withHome(({ home }) => {
    writeFileSync(join(home, 'preview.env'), [
      'PORTAL_HTTP_PORT=8095', 'PORTAL_ENV=local', 'PORTAL_IMAGE_PREFIX=local/portal-research-preview', 'PORTAL_IMAGE_TAG=rf02',
      'PORTAL_PUBLIC_ORIGIN=http://localhost:8095', 'PORTAL_HISTORICAL_DATA_MODE=required',
      `PORTAL_EXECUTION_V2_SCREENS=${V2_MANIFEST}`, 'FIXTURE_USER_ID=principal-from-real-session', ''].join('\n'), { mode: 0o600 });
    // Real script, real docker; `compose config` only renders. No container, network or image is touched.
    const result = spawnSync(flock ? 'flock' : 'bash', flock
      ? ['-w', '600', '/tmp/portal-heavy.lock', 'bash', script, 'compose', 'config', '--format', 'json']
      : [script, 'compose', 'config', '--format', 'json'],
    { encoding: 'utf8', env: { ...process.env, RESEARCH_PREVIEW_HOME: home }, timeout: 900000, maxBuffer: 64 * 1024 * 1024 });
    if (result.status !== 0) return { skipped: `compose config failed or lock unavailable: ${result.stderr.slice(0, 200)}` };
    return { json: JSON.parse(result.stdout) };
  }, { marker });
}

test('docker compose config: marker off vs on differs only by the fixture service and two portal-web keys', { skip: docker ? false : 'docker not reachable' }, (t) => {
  const off = renderCompose(false), on = renderCompose(true);
  if (off.skipped || on.skipped) return t.skip(off.skipped ?? on.skipped);

  // Off: no trace of the overlay.
  assert(!('portal-fixture-bff' in off.json.services));
  assert(!JSON.stringify(off.json).includes('fixture'));

  // On: exactly one new service, and every other service is deep-equal except portal-web.
  const added = Object.keys(on.json.services).filter((name) => !(name in off.json.services));
  assert.deepEqual(added, ['portal-fixture-bff']);
  assert.deepEqual(Object.keys(off.json.services).filter((name) => !(name in on.json.services)), []);
  for (const name of Object.keys(off.json.services).filter((n) => n !== 'portal-web')) {
    assert.deepEqual(on.json.services[name], off.json.services[name], `${name} must not change`);
  }
  assert.deepEqual(on.json.volumes, off.json.volumes);
  assert.deepEqual(on.json.networks, off.json.networks);

  // portal-web: same except a read-only mount of the fragment directory and a health-gated dependency.
  const { volumes: onVolumes, depends_on: onDepends, ...onRest } = on.json.services['portal-web'];
  const { volumes: offVolumes, depends_on: offDepends, ...offRest } = off.json.services['portal-web'];
  assert.deepEqual(onRest, offRest);
  assert.deepEqual(offVolumes ?? [], []);
  assert.equal(onVolumes.length, 1);
  assert.equal(onVolumes[0].target, '/etc/nginx/fixture');
  assert.equal(onVolumes[0].read_only, true);
  assert.equal(onVolumes[0].source, `${root}deploy/research-preview/nginx/fixture-bff`);
  assert.deepEqual(Object.keys(onDepends).filter((name) => !(name in offDepends)), ['portal-fixture-bff']);
  assert.equal(onDepends['portal-fixture-bff'].condition, 'service_healthy');

  // The V2 manifest still reaches the portal-web build; the umbrella flag is still the preview's.
  const args = on.json.services['portal-web'].build.args;
  assert.equal(args.EXECUTION_V2_SCREENS, V2_MANIFEST);
  assert.equal(args.EXECUTION_PREVIEW_ENABLED, 'true');

  // The fixture service itself.
  const fixture = on.json.services['portal-fixture-bff'];
  assert.equal(fixture.read_only, true);
  assert.deepEqual(fixture.cap_drop, ['ALL']);
  assert.deepEqual(fixture.security_opt, ['no-new-privileges:true']);
  assert.equal(fixture.restart, 'unless-stopped');
  assert.equal(fixture.pids_limit, 64);
  assert.equal(Number(fixture.cpus), 0.5);
  assert.equal(Number(fixture.mem_limit), 256 * 1024 * 1024);
  assert.equal(Number(fixture.memswap_limit), 256 * 1024 * 1024);
  assert(!('ports' in fixture) || fixture.ports.length === 0, 'no host port');
  assert.deepEqual(Object.keys(fixture.networks), ['portal']);
  assert(fixture.healthcheck);
  assert.equal(fixture.build.dockerfile, 'deploy/images/fixture-bff.Dockerfile');
  assert.equal(fixture.environment.FIXTURE_WRITES, 'refuse');
  assert.equal(fixture.environment.FIXTURE_SCALE, 'medium');
  assert.equal(fixture.environment.FIXTURE_USER_ID, 'principal-from-real-session');
  assert(!('FIXTURE_LANE_LABEL' in fixture.environment));
});

const nginxImageLocal = docker
  && spawnSync(docker[0], [...docker.slice(1), 'image', 'inspect', NGINX_IMAGE], { encoding: 'utf8' }).status === 0;

function nginxDump({ withFixture }) {
  const hosts = ['portal-api', 'control-api', 'portal-fixture-bff'].flatMap((host) => ['--add-host', `${host}:127.0.0.1`]);
  const mounts = ['-v', `${root}deploy/nginx/portal.conf:/etc/nginx/templates/default.conf.template:ro`];
  if (withFixture) mounts.push('-v', `${root}deploy/research-preview/nginx/fixture-bff:/etc/nginx/fixture:ro`);
  // --network none: a configuration test cannot reach anything. -T tests the config and prints it.
  return dockerRun(['run', '--rm', '--network', 'none', ...hosts, '-e', 'PORTAL_WEB_UPSTREAM=control-api:4000', ...mounts, NGINX_IMAGE, 'nginx', '-T']);
}

test('nginx -t/-T: the fixture variant is valid and carries the locations and banner', { skip: nginxImageLocal ? false : 'docker or the pinned nginx image is not available locally (never pulled)' }, (t) => {
  const result = nginxDump({ withFixture: true });
  if (result.status === null || (result.status !== 0 && /flock|timed out/i.test(result.stderr))) return t.skip('heavy lock not available in time');
  assert.equal(result.status, 0, result.stderr.slice(-600));
  assert.match(result.stderr, /syntax is ok/);
  assert.match(result.stderr, /test is successful/);
  const dump = result.stdout;
  for (const location of ['^~ /api/v1/execution/', '= /api/admin/access/self', '= /api/admin/profile-access/v2/effective',
    '= /api/admin/accounts', '^~ /api/admin/accounts/', '= /api/admin/step-up', '^~ /__fixture/', '= /__fixture-banner.css']) {
    assert(dump.includes(`location ${location} {`), location);
  }
  assert(dump.includes(BANNER));
  assert(dump.includes('proxy_pass http://portal-fixture-bff:4100;'));
  assert(dump.includes('proxy_pass http://control-api:4000;'), 'the real upstream blocks are still rendered');
  const authBlock = dump.match(/location \^~ \/api\/auth\/ \{[\s\S]*?\n    \}/)?.[0] ?? '';
  assert(authBlock.includes('control-api:4000') && !authBlock.includes('fixture'));
});

test('nginx -t/-T: without the mount the include is empty and the config has no trace of the overlay', { skip: nginxImageLocal ? false : 'docker or the pinned nginx image is not available locally (never pulled)' }, (t) => {
  const result = nginxDump({ withFixture: false });
  if (result.status === null || (result.status !== 0 && /flock|timed out/i.test(result.stderr))) return t.skip('heavy lock not available in time');
  assert.equal(result.status, 0, result.stderr.slice(-600));
  assert.match(result.stderr, /test is successful/);
  // portal.conf's own comment mentions the overlay; the effective directives must not.
  assert(!result.stdout.includes('portal-fixture-bff') && !result.stdout.includes('__fixture'));
  assert(!result.stdout.includes(BANNER) && !result.stdout.includes('sub_filter '));
});
