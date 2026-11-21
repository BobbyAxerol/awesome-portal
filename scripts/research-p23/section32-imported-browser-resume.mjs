#!/usr/bin/env node
/** GET-only fresh member review of the one already completed imported run. */
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { makeClient, privateJson, savePrivate } from './api-client.mjs';
import { BASE_URL, PROJECT, validateHome } from './cell.mjs';
import { container, dbQuery, docker } from './runtime-tools.mjs';
import { importedBrowserContinuation } from './section32-imported-browser-continuation.mjs';

const home = validateHome(process.argv[2]);
const username = process.argv[3] ?? 'p23-reader-98';
assert(['p23-reader-98', 'p23-reader-99'].includes(username), 'EXACT_SCOPED_READ_ONLY_REVIEWER_REQUIRED');
const priorPath = join(home, 'section32-imported-profile-p23-reader-97.json');
const prior = privateJson(priorPath);
assert.equal(prior.project, PROJECT);
assert.equal(prior.completed, true); assert.equal(prior.identity_revoked, true);
assert.equal(prior.run_id, 'rrun_534c60ecb6337bb1503e48f8726142b7', 'EXACT_ALREADY_COMPLETED_RUN_REQUIRED');
assert.equal(dbQuery('SELECT count(*)::int n FROM portal_users WHERE username=$1', [username]).rows[0].n, 0,
  'NEW_MEMBER_ONLY_NO_IDENTITY_RESET');
const qa97 = dbQuery("SELECT status,(SELECT count(*)::int FROM auth_sessions WHERE user_id=u.user_id AND state='ACTIVE') sessions FROM portal_users u WHERE username='p23-reader-97'").rows[0];
assert.equal(qa97.status, 'DISABLED'); assert.equal(qa97.sessions, 0);
const target = join(home, `section32-imported-browser-resume-${username}.json`);
assert(!existsSync(target), 'PRIOR_RESUME_RECEIPT_MUST_NOT_BE_OVERWRITTEN');
const row = dbQuery('SELECT workspace_id,state FROM research.jobs WHERE run_id=$1', [prior.run_id]).rows[0];
assert.equal(row.state, 'SUCCEEDED'); // durable job state; public Progress is COMPLETED
const jobsBefore = dbQuery('SELECT count(*)::int n FROM research.jobs').rows[0].n;
const receipt = { schema_version: 'research.section32-imported-browser-resume.v1', project: PROJECT, base_url: BASE_URL,
  run_id: prior.run_id, api_actor: 'p23-reader-97', browser_reviewer: username,
  scope: 'ONE_REAL_API_IMPORTED_DRAFT_RUN_PLUS_DISTINCT_READ_ONLY_MEMBER_BROWSER_CONTINUATION',
  prior_api_receipt: priorPath, completed: false, identity_revoked: false, jobs_before: jobsBefore,
  no_new_run_no_credential_reset: true };
const user = { username, password: randomBytes(32).toString('hex'), cookies: {} };
try {
  const output = docker(['exec', '-i', container('control-api'), 'node', 'dist/cli/bootstrap.js',
    '--file', '/dev/stdin', '--print-one-time-credentials'], `- username: ${username}\n  role: USER\n`);
  const token = output.split('\n').find(line => line.startsWith(`ONE_TIME ${username} `))?.split(' ')[2];
  assert(token, 'FRESH_READ_ONLY_REVIEWER_ACTIVATION_REQUIRED');
  user.id = dbQuery('SELECT user_id FROM portal_users WHERE username=$1', [username]).rows[0].user_id;
  savePrivate(join(home, `section32-${username}-private-cleanup.json`), { user,
    purpose: 'INTERRUPTION_SAFE_EXACT_EPHEMERAL_QA_CLEANUP_ONLY', state: 'PENDING_DISABLE_REVOKE' });
  const client = makeClient(user);
  await client.call('POST', '/api/auth/login', { username, credential: token }, [201]);
  await client.call('POST', '/api/auth/change-password', { current_password: token, new_password: user.password }, [200, 201]);
  await client.call('POST', '/api/auth/login', { username, credential: user.password }, [201]);
  assert.equal((await client.call('GET', '/api/auth/context')).body.principal.principalId, user.id);
  dbQuery(`INSERT INTO public.workspace_members(workspace_id,user_id,role)
    SELECT w.workspace_id,u.user_id,'MEMBER' FROM public.workspaces w CROSS JOIN public.portal_users u
    WHERE w.workspace_id=$1 AND u.user_id=$2 AND u.username=$3
    ON CONFLICT(workspace_id,user_id) DO NOTHING`, [row.workspace_id, user.id, username]);
  const membership = dbQuery('SELECT role FROM workspace_members WHERE workspace_id=$1 AND user_id=$2', [row.workspace_id, user.id]).rows;
  assert.equal(membership.length, 1); assert.equal(membership[0].role, 'MEMBER');
  receipt.grant = { workspace_id: row.workspace_id, role: 'MEMBER', portal_role: 'USER' };
  const scope = `?workspace_id=${encodeURIComponent(row.workspace_id)}`;
  const progress = (await client.call('GET', `/api/v1/research/runs/${prior.run_id}/progress${scope}`)).body;
  assert.equal(progress.current.effective_status, 'COMPLETED');
  const report = (await client.call('GET', `/api/v1/quantbt/runs/${prior.run_id}/report${scope}`)).body;
  const compose = (await client.call('GET', `/api/v1/quantbt/runs/${prior.run_id}/release-candidate${scope}`)).body;
  receipt.ordinary_member_api_reads = { progress: 200, report: 200, release_candidate: 200 };
  const registration = prior.responses.find(response => response.label === 'register').body;
  receipt.browser = await importedBrowserContinuation({ home, user, runId: prior.run_id,
    workspace: row.workspace_id, registration, report, compose,
    expectedImages: Object.fromEntries(['control', 'web', 'python'].map(name => [name,
      process.argv.find(arg => arg.startsWith(`--expected-${name}=`))?.slice(name.length + 12)])) });
  receipt.completed = true;
} catch (error) {
  receipt.error = { message: String(error.message).slice(0, 800) }; throw error;
} finally {
  if (user.id) {
    const program = `const {Pool}=require('pg');const {loadConfig}=require('./dist/config');const {AuthService}=require('./dist/auth/auth.service');
const {AdminService}=require('./dist/admin/admin.service');const {Argon2CredentialService}=require('./dist/auth/argon');
const c=loadConfig(),p=new Pool({connectionString:c.DATABASE_URL,max:1});
(async()=>{const auth=new AuthService(p,c,new Argon2CredentialService({memoryKib:c.ARGON2_MEMORY_KIB,iterations:c.ARGON2_ITERATIONS,parallelism:c.ARGON2_PARALLELISM}));
const u=await auth.users.findByUsername('${username}');if(!u||u.userId!==process.argv[1])throw Error('EXACT_QA_REQUIRED');
await new AdminService(p,c,auth).disable(u.userId);})().catch(()=>{process.exitCode=1;}).finally(()=>p.end());`;
    docker(['exec', container('control-api'), 'node', '-e', program, user.id]);
    const state = dbQuery("SELECT status,(SELECT count(*)::int FROM auth_sessions WHERE user_id=$1 AND state='ACTIVE') active_sessions FROM portal_users WHERE user_id=$1", [user.id]).rows[0];
    assert.equal(state.status, 'DISABLED'); assert.equal(state.active_sessions, 0);
    receipt.cleanup = state; receipt.identity_revoked = true;
    savePrivate(join(home, `section32-${username}-private-cleanup.json`), { user: { id: user.id, username },
      purpose: 'EXACT_EPHEMERAL_QA_CLEANUP_ONLY', state: 'DISABLED_SESSION_ZERO_PASSWORD_REMOVED' });
  }
  receipt.jobs_after = dbQuery('SELECT count(*)::int n FROM research.jobs').rows[0].n;
  assert.equal(receipt.jobs_after, receipt.jobs_before, 'READ_ONLY_RESUME_MUST_NOT_CREATE_JOB');
  savePrivate(target, receipt);
  console.log(JSON.stringify({ run_id: receipt.run_id, completed: receipt.completed, identity_revoked: receipt.identity_revoked,
    receipt_sha256: createHash('sha256').update(JSON.stringify(receipt, null, 2) + '\n').digest('hex') }));
}
