#!/usr/bin/env node
/** One owned P23 cell. This helper never changes an existing Portal project. */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROJECT = 'portal-research-p23-ol12';
export const BASE_URL = 'http://127.0.0.1:8096';
export const TEST_USERS = Object.freeze([
  { username: 'p23-owner', role: 'ADMIN', owner: true },
  { username: 'p23-approver', role: 'ADMIN' },
  ...Array.from({ length: 20 }, (_, index) => ({
    username: `p23-reader-${String(index + 1).padStart(2, '0')}`, role: 'USER',
  })),
]);
const RUNTIME_SERVICES = ['portal-web','control-api','portal-api','quant-worker-py',
  'portal-postgres','portal-nats','roadmap-task-board-api'];
export function retainedImageTag(service, image) {
  assert(RUNTIME_SERVICES.includes(service) && /^sha256:[a-f0-9]{64}$/.test(image), 'OWNED_IMMUTABLE_IMAGE_REQUIRED');
  return `local/portal-research-p23-retained-${service}:${image.slice(7)}`;
}
export function imageReplacements(rows) {
  assert(rows.every(row=>RUNTIME_SERVICES.includes(row.service)
    && /^sha256:[a-f0-9]{64}$/.test(row.actual) && /^sha256:[a-f0-9]{64}$/.test(row.desired)), 'VALID_OWNED_IMAGE_INVENTORY_REQUIRED');
  return rows.filter(row=>row.actual!==row.desired).map(row=>row.service);
}
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const STATE_ROOT = '/home/bobby/.local/state/portal-research-p23';

export function validateHome(home) {
  const absolute = resolve(home);
  assert(absolute.startsWith(STATE_ROOT + '/') && absolute !== STATE_ROOT,
    'P23_PRIVATE_STATE_DIRECTORY_REQUIRED');
  for (let directory = absolute; directory !== '/'; directory = dirname(directory)) {
    if (existsSync(directory)) assert(!lstatSync(directory).isSymbolicLink(), 'P23_SYMLINK_REFUSED');
  }
  return absolute;
}

function readPrivate(path) {
  const stat = lstatSync(path);
  assert(stat.isFile() && !stat.isSymbolicLink() && (stat.mode & 0o077) === 0,
    'P23_PRIVATE_REGULAR_FILE_REQUIRED');
  return readFileSync(path, 'utf8');
}
function parseEnv(raw) {
  return Object.fromEntries(raw.split('\n').filter(line => /^[A-Z0-9_]+=/.test(line))
    .map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
}
function writePrivate(path, text) {
  if (existsSync(path)) readPrivate(path);
  writeFileSync(path, text, { mode: 0o600 });
  chmodSync(path, 0o600);
}
function dockerPrefix() {
  try { execFileSync('docker', ['info'], { stdio: 'pipe', timeout: 15000 }); return ['docker']; }
  catch { execFileSync('sudo', ['-n', 'docker', 'info'], { stdio: 'pipe', timeout: 15000 }); return ['sudo', '-n', 'docker']; }
}

export function composeArguments(envFile) {
  return ['compose', '-p', PROJECT, '--project-directory', ROOT, '--env-file', envFile,
    ...['compose.yaml', 'deploy/compose.research-progress.yaml',
      'deploy/research-preview/compose.research-p23-activation.yaml',
      'deploy/research-preview/compose.research-p23-5gb.yaml'].flatMap(file => ['-f', join(ROOT, file)])];
}

export function executionPreviewBuildArg(value) {
  assert(value === undefined || value === 'true' || value === 'false',
    'P23_EXECUTION_PREVIEW_BUILD_ARG_INVALID');
  return `EXECUTION_PREVIEW_ENABLED=${value ?? 'false'}`;
}

async function main() {
  const command = process.argv[2];
  assert(['init', 'build', 'up', 'status', 'down', 'credentials', 'compose', 'observer-copy', 'observer-normal'].includes(command),
    'Use cell.mjs init|build|up|status|down|credentials|compose|observer-copy|observer-normal --home=<private-directory>');
  const home = validateHome(process.argv.find(arg => arg.startsWith('--home='))?.slice(7)
    ?? `${STATE_ROOT}/${new Date().toISOString().slice(0, 10).replaceAll('-', '')}/runtime`);
  const envFile = join(home, 'preview.env');
  const prefix = dockerPrefix();
  const docker = args => execFileSync(prefix[0], [...prefix.slice(1), ...args],
    { encoding: 'utf8', stdio: 'pipe', timeout: 30000 });
  if (command === 'init') {
    assert(docker(['ps', '-a', '-q', '--filter', `label=com.docker.compose.project=${PROJECT}`]).trim() === '',
      'P23_INIT_REFUSES_EXISTING_CELL');
    mkdirSync(home, { recursive: true, mode: 0o700 });
    chmodSync(home, 0o700);
    const setup = spawnSync('bash', [join(ROOT, 'scripts/research-preview/preview.sh'), 'init'], {
      env: { ...process.env, RESEARCH_PREVIEW_HOME: home, RESEARCH_PREVIEW_PORT: '8096' },
      encoding: 'utf8', stdio: 'pipe', timeout: 30000,
    });
    assert(setup.status === 0, 'P23_PRIVATE_ENV_INIT_FAILED');
    const input = parseEnv(readPrivate(envFile));
    assert(['portal-research-preview', PROJECT].includes(input.PORTAL_STACK_NAME), 'P23_FOREIGN_ENV_REFUSED');
    const password = input.P23_DATABASE_PASSWORD ?? randomBytes(32).toString('hex');
    const bootstrap = join(home, 'bootstrap-users.yaml');
    const values = { ...input, PORTAL_STACK_NAME: PROJECT, PORTAL_HTTP_PORT: '8096',
      PORTAL_PUBLIC_ORIGIN: BASE_URL, PORTAL_IMAGE_PREFIX: 'local/portal-research-p23',
      PORTAL_IMAGE_TAG: 'qualification', P23_DATABASE_PASSWORD: password,
      P23_DATABASE_URL: `postgres://portal:${password}@portal-postgres:5432/portal_control`,
      P23_OBJECT_PASSWORD: input.P23_OBJECT_PASSWORD ?? randomBytes(32).toString('hex'),
      P23_BOOTSTRAP_FILE: bootstrap, PREVIEW_AUTO_LOGIN_USERNAME: '',
    };
    writePrivate(envFile, '# Private isolated P23 inputs. Never print or commit.\n'
      + Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n') + '\n');
    // Names/roles are non-secret; the non-root bootstrap process needs read permission.
    const yaml = 'users:\n' + TEST_USERS.map(user => `  - username: ${user.username}\n    role: ${user.role}\n`
      + (user.owner ? '    owner: true\n' : '')).join('');
    assert(!existsSync(bootstrap) || !lstatSync(bootstrap).isSymbolicLink(), 'P23_SYMLINK_REFUSED');
    writeFileSync(bootstrap, yaml, { mode: 0o644 }); chmodSync(bootstrap, 0o644);
    console.log('P23 private inputs prepared; 20 readers + 2 operator test identities; no service started.');
    return;
  }
  const settings = parseEnv(readPrivate(envFile));
  assert(settings.PORTAL_STACK_NAME === PROJECT && settings.PORTAL_HTTP_PORT === '8096'
    && settings.PORTAL_PUBLIC_ORIGIN === BASE_URL && settings.PREVIEW_AUTO_LOGIN_USERNAME === '',
  'P23_EXACT_PROJECT_PORT_NO_AUTOLOGIN_REQUIRED');
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).trim() !== '';
  const environment = { ...process.env, PORTAL_BUILD_COMMIT: sha, PORTAL_BUILD_DIRTY: String(dirty),
    COMPOSE_PARALLEL_LIMIT: '1' };
  const compose = (args, capture = false, observerCopy = false) => {
    const result = spawnSync(prefix[0], [...prefix.slice(1), ...composeArguments(envFile),
      ...(observerCopy ? ['-f', join(ROOT, 'deploy/research-preview/compose.research-p23-observer-copy.yaml')] : []), ...args], {
      env: environment, stdio: capture ? 'pipe' : 'inherit', encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
    });
    assert(result.status === 0, `P23_COMPOSE_FAILED:${args[0]}`);
    return result.stdout ?? '';
  };
  if (command === 'build') {
    // Containerd image-store index IDs can disappear when a build replaces a
    // tag, even if a container still uses the unchanged underlying config.
    // Preserve the exact active index before export, so rollback/DR can run it.
    const ids=docker(['ps','-q','--filter',`label=com.docker.compose.project=${PROJECT}`]).trim().split('\n').filter(Boolean);
    for(const id of ids) {
      const current=JSON.parse(docker(['inspect','--format','{{json .}}',id]));
      const service=current.Config.Labels['com.docker.compose.service'];
      const tag=retainedImageTag(service,current.Image);
      docker(['image','inspect',current.Image]);
      docker(['image','tag',current.Image,tag]);
    }
    // `sudo docker` strips shell env; pass the UI compile gate literally.
    // This grants no Execution API or command authority.
    const webPreviewArg = executionPreviewBuildArg(process.env.PORTAL_EXECUTION_PREVIEW_ENABLED);
    compose(['build', '--build-arg', 'PORTAL_HMD_READER_REQUIRED=true',
      '--build-arg', webPreviewArg,
      'portal-api', 'control-api', 'portal-web', 'roadmap-task-board-api']);
  } else if (command === 'up') {
    const previousControl = docker(['ps', '-a', '-q', '--filter', `label=com.docker.compose.project=${PROJECT}`,
      '--filter', 'label=com.docker.compose.service=control-api']).trim();
    compose(['up', '-d', '--no-build', '--wait', '--wait-timeout', '150', 'portal-web', 'quant-worker-py']);
    const inventory=docker(['ps','-q','--filter',`label=com.docker.compose.project=${PROJECT}`]).trim().split('\n').filter(Boolean)
      .map(id=>{
        const current=JSON.parse(docker(['inspect','--format','{{json .}}',id]));
        return {service:current.Config.Labels['com.docker.compose.service'],actual:current.Image,
          desired:docker(['image','inspect','--format','{{.Id}}',current.Config.Image]).trim()};
      });
    // Compose may keep a container with an unchanged image config while its
    // exported index ID changed. Record only a fully runnable exact image set.
    for(const service of imageReplacements(inventory)) {
      compose(['up','-d','--no-build','--no-deps','--force-recreate','--wait','--wait-timeout','90',service]);
    }
    const currentControl = docker(['ps', '-q', '--filter', `label=com.docker.compose.project=${PROJECT}`,
      '--filter', 'label=com.docker.compose.service=control-api']).trim();
    // nginx resolves the existing static upstream at startup. If Compose
    // replaced the API container/IP, refresh only this cell's gateway; no
    // shared nginx edit/reload and no unrelated service restart.
    if (previousControl && previousControl !== currentControl) {
      compose(['up', '-d', '--no-build', '--no-deps', '--force-recreate', '--wait', '--wait-timeout', '90', 'portal-web']);
    }
    const ids = docker(['ps', '-q', '--filter', `label=com.docker.compose.project=${PROJECT}`]).trim().split('\n').filter(Boolean);
    const images = Object.fromEntries(ids.map(id => {
      const container = JSON.parse(docker(['inspect', '--format', '{{json .}}', id]));
      return [container.Config.Labels['com.docker.compose.service'], {
        container_id: container.Id, image_id: container.Image,
        memory_limit_bytes: container.HostConfig.Memory, swap_limit_bytes: container.HostConfig.MemorySwap,
        apparmor: container.AppArmorProfile,
        image_runnable: docker(['image','inspect','--format','{{.Id}}',container.Image]).trim() === container.Image,
      }];
    }));
    writePrivate(join(home, 'identity.json'), JSON.stringify({ schema_version: 'research.p23-cell-identity.v1',
      project: PROJECT, base_url: BASE_URL, candidate_source_sha: sha, dirty,
      recorded_at_utc: new Date().toISOString(), images }, null, 2) + '\n');
    console.log('P23 runtime identity recorded; source dirty:', dirty);
  } else if (command === 'credentials') {
    const output = join(home, 'activation-credentials.json');
    assert(!existsSync(output), 'P23_CREDENTIALS_ALREADY_ISSUED_DO_NOT_RESET');
    const text = compose(['run', '--rm', '--no-deps', 'control-api-bootstrap',
      'node', 'dist/cli/bootstrap.js', '--file', 'bootstrap-users.yaml', '--print-one-time-credentials'], true);
    const credentials = Object.fromEntries(text.split('\n').filter(line => line.startsWith('ONE_TIME '))
      .map(line => { const [, username, credential] = line.split(' '); return [username, credential]; }));
    assert(TEST_USERS.every(user => typeof credentials[user.username] === 'string'), 'P23_ACTIVATION_OUTPUT_INCOMPLETE');
    writePrivate(output, JSON.stringify({ project: PROJECT, base_url: BASE_URL,
      issued_at_utc: new Date().toISOString(), credentials }, null, 2) + '\n');
    console.log('P23 one-time credentials captured privately, values not printed.');
  } else if (command === 'observer-copy' || command === 'observer-normal') {
    compose(['up', '-d', '--no-build', '--no-deps', '--wait', '--wait-timeout', '90', 'portal-api'], false,
      command === 'observer-copy');
  } else if (command === 'status') compose(['ps', '--format', 'table {{.Service}}\t{{.Status}}\t{{.Ports}}']);
  else if (command === 'down') compose(['down']); // retain all data/receipts; no -v path.
  else {
    const args = process.argv.slice(3).filter(arg => !arg.startsWith('--home='));
    assert(args.length && !args.some(arg => ['-p', '--project-name', '--env-file', '--project-directory', '-f', '--file',
      '--volumes', '-v', 'rm', 'prune'].includes(arg)), 'P23_SCOPE_OVERRIDE_OR_DELETION_REFUSED');
    assert(args[0] !== 'config' || args.includes('--quiet'), 'P23_SECRET_CONFIG_OUTPUT_REFUSED');
    compose(args);
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error('P23 cell refused:', error.message); process.exitCode = 1; });
}
