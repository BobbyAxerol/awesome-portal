#!/usr/bin/env node
/** Exact disposable-clone QA custody only: prepare or disable/revoke, never run. */
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { privateJson, readBoundedJson, savePrivate } from './api-client.mjs';
import { BASE_URL, PROJECT, validateHome } from './cell.mjs';
import { container, dbQuery, docker } from './runtime-tools.mjs';

export const EDGE_USERS = Object.freeze(['p24-edge-a', 'p24-edge-b', 'p24-edge-publish']);
export const PRODUCER_USER = 'p24-edge-producer';
const ALL_EDGE_USERS = Object.freeze([...EDGE_USERS, PRODUCER_USER]);
const actorRole = username => username === PRODUCER_USER ? 'ADMIN' : 'USER';
const IMPORTED_RUN = 'rrun_534c60ecb6337bb1503e48f8726142b7';
const IMPORTED_AV = 'av_p23_section32_imported_0_1_0';
const PUBLISH_RUN = 'rrun_3258a4c450816129d2d285f25b801061';
const HASH = bytes => createHash('sha256').update(bytes).digest('hex');

export function requireEdgeUser(user) {
  assert(ALL_EDGE_USERS.includes(user?.username), 'EXACT_FRESH_EDGE_QA_ONLY');
  assert(user.id === undefined || typeof user.id === 'string', 'EXACT_ACTOR_ID_REQUIRED');
  return user;
}

/** Same normal auth protocol as api-client, with this finite distinct QA set. */
export function makeEdgeActorClient(user) {
  requireEdgeUser(user);
  const jar = new Map(Object.entries(user.cookies ?? {}));
  return { user, jar, async call(method, path, body, statuses = [200]) {
    assert(path.startsWith('/api/') && new URL(path, BASE_URL).origin === BASE_URL,
      'EXACT_OWNED_NAMED_ORIGIN_REQUIRED');
    assert(['GET', 'POST', 'PATCH'].includes(method), 'EXPLICIT_NAMED_METHOD_REQUIRED');
    const response = await fetch(new URL(path, BASE_URL), {
      method, redirect: 'manual', signal: AbortSignal.timeout(45000),
      headers: { origin: BASE_URL, accept: 'application/json', 'content-type': 'application/json',
        'x-dev-access-email': `${user.username}@azdag.com`,
        cookie: [...jar].map(([key, value]) => `${key}=${value}`).join('; '),
        ...(method === 'GET' ? {} : { 'x-portal-csrf': jar.get('__Host-portal_csrf') ?? '' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const raw of response.headers.getSetCookie()) {
      const pair = raw.split(';')[0], boundary = pair.indexOf('=');
      jar.set(pair.slice(0, boundary), pair.slice(boundary + 1));
    }
    const json = await readBoundedJson(response);
    assert(statuses.includes(response.status), `P24_EDGE_API:${method}:${path}:${response.status}:${json.error?.code ?? 'UNEXPECTED'}`);
    user.cookies = Object.fromEntries(jar);
    return { status: response.status, body: json };
  } };
}

function configPath(home, username) { return join(home, `${username}-config.json`); }
function assertCell() {
  const raw = docker(['exec', container('control-api'), 'node', '-e',
    "const c=require('./dist/config').loadConfig();process.stdout.write(JSON.stringify({env:c.PORTAL_ENV,auth:c.AUTH_MODE,origin:c.PORTAL_PUBLIC_ORIGIN}));"]);
  assert.deepEqual(JSON.parse(raw), { env: 'local', auth: 'dev', origin: BASE_URL },
    'EXACT_LOCAL_DEV_CLONE_REQUIRED');
}
function actualImages() {
  const web = JSON.parse(docker(['inspect', `${PROJECT}-portal-web-1`]))[0];
  assert.equal(web.Config.Labels['com.docker.compose.project'], PROJECT);
  assert.equal(web.Config.Labels['com.docker.compose.service'], 'portal-web');
  const values = { control: docker(['inspect', '--format', '{{.Image}}', container('control-api')]).trim(),
    python: docker(['inspect', '--format', '{{.Image}}', container('portal-api')]).trim(), web: web.Image };
  for (const value of Object.values(values)) assert.match(value, /^sha256:[a-f0-9]{64}$/);
  return values;
}
function bindings() {
  const rows = dbQuery(`SELECT run_id,workspace_id,alpha_version_id FROM research.run_producers
    WHERE run_id=ANY($1::text[]) ORDER BY run_id`, [[IMPORTED_RUN, PUBLISH_RUN]]).rows;
  assert.equal(rows.length, 2, 'EXACT_EXISTING_IMPORTED_AND_PUBLICATION_RUNS_REQUIRED');
  const imported = rows.find(row => row.run_id === IMPORTED_RUN);
  assert.equal(imported.alpha_version_id, IMPORTED_AV, 'EXACT_COMPLETED_IMPORT_BINDING_REQUIRED');
  assert.equal(dbQuery('SELECT state FROM research.jobs WHERE run_id=$1', [IMPORTED_RUN]).rows[0]?.state,
    'SUCCEEDED', 'EXISTING_COMPLETED_IMPORT_ONLY');
  const publish = rows.find(row => row.run_id === PUBLISH_RUN);
  const alternate = dbQuery(`SELECT run_id,workspace_id FROM research.run_library_rows_v1
    WHERE research.run_library_display_label(workspace_id,run_id)=$1`, ['R-P04-022']).rows;
  assert.equal(alternate.length, 1, 'EXACT_ONE_EXISTING_ALTERNATE_TEST_RUN_REQUIRED');
  assert.notEqual(alternate[0].workspace_id, imported.workspace_id, 'ALTERNATE_WORKSPACE_MUST_DIFFER');
  return { imported, publish, alternate: alternate[0] };
}

async function disableExact(home, username) {
  const path = configPath(home, username);
  if (!existsSync(path)) return null;
  const config = privateJson(path);
  assert.equal(config.project, PROJECT); assert.equal(config.base_url, BASE_URL);
  requireEdgeUser(config.user); assert.equal(config.user.username, username);
  const actual = dbQuery('SELECT user_id FROM portal_users WHERE username=$1', [username]).rows;
  if (!actual.length && !config.user.id) return null;
  assert.equal(actual.length, 1, 'EXACT_CREATED_QA_REQUIRED');
  if (config.user.id) assert.equal(actual[0].user_id, config.user.id, 'OWNED_ID_MUST_NOT_CHANGE');
  const id = actual[0].user_id;
  const program = `const fs=require('fs');const {Pool}=require('pg');const {loadConfig}=require('./dist/config');
const {AuthService}=require('./dist/auth/auth.service');const {AdminService}=require('./dist/admin/admin.service');
const {Argon2CredentialService}=require('./dist/auth/argon');const input=JSON.parse(fs.readFileSync(0,'utf8'));
const c=loadConfig(),p=new Pool({connectionString:c.DATABASE_URL,max:1});
(async()=>{const auth=new AuthService(p,c,new Argon2CredentialService({memoryKib:c.ARGON2_MEMORY_KIB,
iterations:c.ARGON2_ITERATIONS,parallelism:c.ARGON2_PARALLELISM}));const u=await auth.users.findByUsername(input.username);
if(!u||u.userId!==input.id||u.role!==input.role)throw Error('EXACT_OWNED_QA_ROLE_REQUIRED');
if(u.status!=='DISABLED')await new AdminService(p,c,auth).disable(input.id);
})().catch(e=>{process.stderr.write(e.name);process.exitCode=1}).finally(()=>p.end());`;
  docker(['exec', '-i', container('control-api'), 'node', '-e', program], JSON.stringify({ id, username, role: actorRole(username) }));
  const state = dbQuery(`SELECT u.status,(SELECT count(*)::int FROM auth_sessions s
    WHERE s.user_id=u.user_id AND s.state='ACTIVE') active_sessions FROM portal_users u
    WHERE u.user_id=$1 AND u.username=$2`, [id, username]).rows[0];
  assert.equal(state.status, 'DISABLED'); assert.equal(state.active_sessions, 0);
  config.user = { id, username }; delete config.actors; delete config.password;
  config.prepared = false; config.cleanup_state = 'DISABLED_SESSIONS_ZERO_PRIVATE_PASSWORD_REMOVED';
  config.cleaned_at_utc = new Date().toISOString(); savePrivate(path, config);
  return { username, id, ...state, password_removed: true };
}

async function main() {
  const command = process.argv[2];
  assert(['prepare', 'prepare-producer', 'cleanup'].includes(command), 'FINITE_PREPARE_OR_CLEANUP_ONLY');
  const home = validateHome(process.argv[3]);
  mkdirSync(home, { recursive: true, mode: 0o700 }); chmodSync(home, 0o700);
  assertCell();
  if (command === 'cleanup') {
    const actors = [];
    for (const username of ALL_EDGE_USERS) { const result = await disableExact(home, username); if (result) actors.push(result); }
    for (const filename of ['p24-write-consumer-config.json', 'p24-write-producer-config.json']) {
      const combinedPath = join(home, filename);
      if (!existsSync(combinedPath)) continue;
      const config = privateJson(combinedPath);
      assert.equal(config.project, PROJECT); assert.equal(config.base_url, BASE_URL);
      delete config.actors; config.cleanup_state = 'DISABLED_SESSIONS_ZERO_PRIVATE_PASSWORDS_REMOVED';
      config.user = { id: config.user?.id, username: config.user?.username };
      config.prepared = false;
      savePrivate(combinedPath, config);
    }
    const receipt = { schema_version: 'research.p24-edge-actor-custody.v1', project: PROJECT, base_url: BASE_URL,
      completed_at_utc: new Date().toISOString(), operation: 'CLEANUP', actors };
    const path = join(home, `p24-edge-cleanup-${Date.now()}.json`); savePrivate(path, receipt);
    console.log(JSON.stringify({ operation: 'CLEANUP', actors, receipt_path: path, receipt_sha256: HASH(readFileSync(path)) }));
    return;
  }
  const selectedUsers = command === 'prepare-producer' ? [PRODUCER_USER] : EDGE_USERS;
  const existing = dbQuery('SELECT username FROM portal_users WHERE username=ANY($1::text[])', [selectedUsers]).rows;
  assert.equal(existing.length, 0, 'SELECTED_QA_MUST_BE_FRESH_NO_RESET_OR_REENABLE');
  for (const username of selectedUsers) assert(!existsSync(configPath(home, username)), 'PRIVATE_CUSTODY_MUST_NOT_BE_OVERWRITTEN');
  const run = bindings(), images = actualImages(), prepared = [];
  try {
    for (const username of selectedUsers) {
      const role = actorRole(username);
      const user = { username, password: randomBytes(32).toString('hex'), cookies: {} };
      const selected = username === 'p24-edge-publish' ? run.publish : run.imported;
      const workspaces = [selected.workspace_id,
        ...(username === 'p24-edge-a' ? [run.alternate.workspace_id] : [])];
      const config = { project: PROJECT, base_url: BASE_URL, origin: BASE_URL, user, username,
        role, prepared: false, expected_images: images, workspace_id: selected.workspace_id,
        imported_workspace_id: run.imported.workspace_id, alternate_workspace_id: run.alternate.workspace_id,
        run_id: selected.run_id, alpha_version_id: selected.alpha_version_id,
        credential_path: configPath(home, username), out: join(home, `${username}-browser`),
        cleanup_state: 'PENDING_DISABLE_REVOKE', created_at_utc: new Date().toISOString(),
        ...(username === PRODUCER_USER ? {
          cleanup_deadline_utc: new Date(Date.now() + 15 * 60_000).toISOString(),
          expiry_policy: 'OPERATOR_GUARD_NOT_AUTH_TTL_ROOT_NORMAL_DISABLE_REVOKE_AFTER_BOUNDED_180S_GUI',
          role_basis: 'run-admission.service.ts:153_ADMIN_ACTIVE_PASSWORD_CHANGED_REQUIRED',
        } : {}) };
      savePrivate(configPath(home, username), config);
      const output = docker(['exec', '-i', container('control-api'), 'node', 'dist/cli/bootstrap.js',
        '--file', '/dev/stdin', '--print-one-time-credentials'], `- username: ${username}\n  role: ${role}\n`);
      const activation = output.split('\n').find(line => line.startsWith(`ONE_TIME ${username} `))?.split(' ')[2];
      assert(activation, 'FRESH_QA_ONE_TIME_ACTIVATION_REQUIRED');
      user.id = dbQuery('SELECT user_id FROM portal_users WHERE username=$1', [username]).rows[0].user_id;
      savePrivate(configPath(home, username), config);
      const client = makeEdgeActorClient(user);
      await client.call('POST', '/api/auth/login', { username, credential: activation }, [201]);
      await client.call('POST', '/api/auth/change-password', { current_password: activation, new_password: user.password }, [200, 201]);
      await client.call('POST', '/api/auth/login', { username, credential: user.password }, [201]);
      const context = (await client.call('GET', '/api/auth/context')).body;
      assert.equal(context.state, 'AUTHENTICATED'); assert.equal(context.principal.principalId, user.id);
      assert.equal(context.principal.role, role, 'EXACT_ORDINARY_OR_NAMED_PRODUCER_ROLE_ONLY');
      dbQuery(`INSERT INTO public.workspace_members(workspace_id,user_id,role)
        SELECT w.workspace_id,u.user_id,'MEMBER' FROM public.workspaces w CROSS JOIN public.portal_users u
        WHERE w.workspace_id=ANY($1::text[]) AND u.user_id=$2 AND u.username=$3
        ON CONFLICT(workspace_id,user_id) DO NOTHING`, [workspaces, user.id, username]);
      const grants = dbQuery('SELECT workspace_id,role FROM workspace_members WHERE user_id=$1 ORDER BY workspace_id', [user.id]).rows;
      for (const id of workspaces) assert(grants.some(grant => grant.workspace_id === id && grant.role === 'MEMBER'), 'EXACT_MEMBER_GRANT_REQUIRED');
      config.prepared = true; config.grants = grants; savePrivate(configPath(home, username), config); prepared.push(config);
    }
    const combined = { ...prepared[0], actors: command === 'prepare-producer'
      ? { producer: prepared[0].user } : { a: prepared[0].user, b: prepared[1].user },
      credential_path: join(home, command === 'prepare-producer' ? 'p24-write-producer-config.json' : 'p24-write-consumer-config.json'),
      out: join(home, command === 'prepare-producer' ? 'producer-browser' : 'consumer-browser') };
    savePrivate(combined.credential_path, combined);
    const receipt = { schema_version: 'research.p24-edge-actor-custody.v1', project: PROJECT, base_url: BASE_URL,
      operation: command === 'prepare-producer' ? 'PREPARE_PRODUCER' : 'PREPARE', created_at_utc: new Date().toISOString(), expected_images: images,
      scope: command === 'prepare-producer'
        ? 'ONE_EXACT_NEW_ADMIN_FOR_EXISTING_RESEARCH_ADMISSION_ONLY_IMPORTED_TEST_WORKSPACE_MEMBER_NO_OWNER_NO_EXECUTION_GRANT'
        : 'EXACT_THREE_NEW_USER_ACCOUNTS_ONLY_SCOPED_TEST_WORKSPACE_MEMBER_GRANTS_NO_EXECUTION_GRANT',
      actors: prepared.map(config => ({ id: config.user.id, username: config.user.username, role: config.role,
        ...(config.cleanup_deadline_utc ? { cleanup_deadline_utc: config.cleanup_deadline_utc, expiry_policy: config.expiry_policy } : {}),
        grants: config.grants, run_id: config.run_id, config_path: config.credential_path })),
      consumer_config_path: combined.credential_path, cleanup_state: 'PARENT_MUST_CLEANUP_AFTER_COORDINATED_LANES' };
    const path = join(home, command === 'prepare-producer' ? 'p24-edge-producer-prepare-receipt.json' : 'p24-edge-prepare-receipt.json');
    assert(!existsSync(path), 'PRIOR_PREPARATION_RECEIPT_MUST_NOT_BE_OVERWRITTEN'); savePrivate(path, receipt);
    console.log(JSON.stringify({ ...receipt, receipt_sha256: HASH(readFileSync(path)) }));
  } catch (error) {
    const cleanupErrors = [];
    for (const username of selectedUsers) {
      try { await disableExact(home, username); } catch (cleanupError) { cleanupErrors.push(`${username}:${cleanupError.name}`); }
    }
    assert.equal(cleanupErrors.length, 0, `EXACT_QA_CLEANUP_REQUIRED:${cleanupErrors.join(',')}`);
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`P24 actor custody refused: ${error.message}`); process.exitCode = 1; });
}
