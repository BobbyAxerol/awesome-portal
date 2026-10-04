#!/usr/bin/env node
/** Existing restricted profile only, in the owned P23 cell; no shared preview. */
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { makeClient, savePrivate } from './api-client.mjs';
import { validateHome, PROJECT } from './cell.mjs';
import { container, dbQuery, docker } from './runtime-tools.mjs';

const home = validateHome(process.argv[2]);
const username = process.argv[3] ?? 'p23-reader-94';
assert.match(username, /^p23-reader-[0-9]{2}$/);
assert.equal(dbQuery('SELECT count(*)::int n FROM portal_users WHERE username=$1', [username]).rows[0].n, 0,
  'EXISTING_QA_IDENTITY_MUST_NOT_BE_RESET');
const pendingFixtures = dbQuery(`SELECT j.run_id FROM research.jobs j JOIN research.run_producers p
  ON p.workspace_id=j.workspace_id AND p.run_id=j.run_id
  WHERE j.state='QUEUED' AND p.dispatch_state='PENDING' AND p.worker_attempt_id IS NULL`).rows;
assert.equal(dbQuery(`SELECT count(*)::int n FROM research.jobs j LEFT JOIN research.run_producers p
  ON p.workspace_id=j.workspace_id AND p.run_id=j.run_id
  WHERE j.state IN ('QUEUED','CLAIMED','RUNNING','CANCEL_REQUESTED')
  AND NOT (j.state='QUEUED' AND p.dispatch_state='PENDING' AND p.worker_attempt_id IS NULL)`).rows[0].n,
  0, 'OLD_DISPATCHED_JOB_DRAIN_REQUIRED');
const receipt = { schema_version: 'research.section32-imported-profile-receipt.v1', project: PROJECT,
  recorded_at: new Date().toISOString(), responses: [], completed: false, identity_revoked: false,
  images: Object.fromEntries(['control-api', 'portal-api', 'quant-worker-py'].map(service => [service,
    docker(['inspect', '--format', '{{.Image}}', container(service)]).trim()])),
  undispatched_fixtures_preserved: pendingFixtures.map(row => row.run_id) };
const user = { username, password: randomBytes(32).toString('hex'), cookies: {} };
const client = makeClient(user);
const call = async (label, method, path, body, statuses = [200]) => {
  const result = await client.call(method, path, body, statuses);
  // Do not persist activation tokens, session cookies or preflight capabilities.
  if (!label.startsWith('auth')) receipt.responses.push({ label, method, path, status: result.status, body: result.body });
  return result.body;
};
try {
  const output = docker(['exec', '-i', container('control-api'), 'node', 'dist/cli/bootstrap.js',
    '--file', '/dev/stdin', '--print-one-time-credentials'], `- username: ${username}\n  role: ADMIN\n`);
  const token = output.split('\n').find(line => line.startsWith(`ONE_TIME ${username} `))?.split(' ')[2];
  assert(token, 'NEW_QA_ACTIVATION_REQUIRED');
  user.id = dbQuery('SELECT user_id FROM portal_users WHERE username=$1', [username]).rows[0].user_id;
  await call('auth-login', 'POST', '/api/auth/login', { username, credential: token }, [201]);
  await call('auth-password', 'POST', '/api/auth/change-password', { current_password: token, new_password: user.password }, [200, 201]);
  // Password replacement revokes the activation session by design.
  await call('auth-real-login', 'POST', '/api/auth/login', { username, credential: user.password }, [201]);
  const context = await call('auth-context', 'GET', '/api/auth/context');
  assert.equal(context.state, 'AUTHENTICATED');
  const source = `ALPHA_CONTRACT = {
    "schema_version": "research.alpha-source.v1", "version": "0.1.0",
    "entrypoint": "generate_signals", "timeframes": ["1h"],
    "required_columns": ["open", "high", "low", "close", "volume"],
    "warmup_bars": 2, "determinism": {"seed_required": True},
    "parameter_space": {"scale": {"kind": "int_range", "low": 100, "high": 1000, "step": 100}},
}
def generate_signals(context):
    history = context["history"]["close"]
    direction = 1 if history[-1] >= history[-2] else -1
    return {"schema_version": "research.imported-signal-notional-output.v1", "signal_notional": direction * context["parameters"]["scale"]}
`;
  const parsed = await call('parse', 'POST', '/api/v1/research/alphas/import/parse', {
    original_filename: 'section32-profile.py', source_text: source,
    expected_source_digest: createHash('sha256').update(source).digest('hex'),
  }, [201]);
  const gates = await call('gates', 'POST', '/api/v1/research/alphas/import/gates', { source_file_ref: parsed.source_file_ref });
  assert.equal(gates.all_pass, true);
  const registration = await call('register', 'POST', '/api/v1/research/alphas/import/register', {
    source_file_ref: parsed.source_file_ref, gate_receipt_id: gates.gate_receipt_id, alpha_id: 'p23-section32-imported',
  }, [201]);
  assert.equal(registration.lifecycle_state, 'DRAFT');
  const release = (await call('atlas', 'GET', '/api/v1/research/quantbt/atlas')).atlas.current_release;
  const requested = {
    schema_version: 'research.requested-spec.v1', strategy_id: registration.alpha_id,
    alpha_binding: { alpha_id: registration.alpha_id, alpha_version_id: registration.alpha_version_id },
    not_publishable: false, execution_route: 'signal_notional', route_params: {},
    data: { dataset_id: 'crypto-binance-1m', symbol: 'BTCUSDT', timeframe: '1h' },
    protocol: 'three_window_decay', windows: {
      is: { start: '2026-06-01T00:00:00Z', end_exclusive: '2026-06-08T00:00:00Z' },
      oos: { start: '2026-06-08T00:00:00Z', end_exclusive: '2026-06-15T00:00:00Z' },
      holdout: { start: '2026-06-15T00:00:00Z', end_exclusive: '2026-06-17T00:00:00Z' },
    }, optimization_mode: 'mode_1_decay', optimization_schedule: 'global', parameter_space_overrides: [],
    optuna_trials: 1, early_stopping: null, random_seed: 42, optimization_config: {},
    client: { engine_release_id: release.release_id, config_digest: release.config_digest },
  };
  const refused = await call('missing-pin', 'POST', '/api/v1/research/preflights', { requested_spec: requested }, [201]);
  assert.equal(refused.may_create_run, false);
  assert.deepEqual(refused.run_admission.field_path, ['parameter_space_overrides']);
  requested.parameter_space_overrides.push({ kind: 'pin', name: 'scale', value: 1000 });
  const preflight = await call('preflight', 'POST', '/api/v1/research/preflights', { requested_spec: requested }, [201]);
  assert.equal(preflight.may_create_run, true, 'EXISTING_FIXED_PROFILE_MUST_ADMIT_DECLARED_PIN');
  const created = await call('create', 'POST', '/api/v1/research/runs', {
    schema_version: 'research.run-create.v1', client_intent_id: `section32-${randomUUID()}`,
    preflight_token: preflight.preflight_token, requested_spec: requested,
  }, [202]);
  receipt.run_id = created.run_id;
  const deadline = Date.now() + 300_000;
  do {
    const progress = await call('progress', 'GET', `/api/v1/research/runs/${created.run_id}/progress`);
    const state = progress.current.effective_status;
    assert(!['FAILED', 'CANCELLED'].includes(state), 'IMPORTED_CHILD_FAILED');
    if (state === 'COMPLETED' && progress.current.terminal_materialization !== 'PENDING') {
      receipt.completed = true; break;
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  } while (Date.now() < deadline);
  assert(receipt.completed, 'BOUNDED_PROFILE_RECEIPT_TIMEOUT');
  for (const path of ['evidence', 'split', 'search', 'freeze', 'execute/replay?limit=5', 'report', 'release-candidate']) {
    await call(path, 'GET', `/api/v1/quantbt/runs/${created.run_id}/${path}`);
  }
  const report = receipt.responses.find(row => row.label === 'report').body;
  assert.equal(report.final_audit_applicable, false);
  assert.equal(report.source_revision_scope, 'CAPTURED_READ_REPRESENTATION');
  const compose = receipt.responses.find(row => row.label === 'release-candidate').body;
  assert.equal(compose.final_audit_applicable, false);
  assert.equal(compose.actions.may_seal, false); // DRAFT execution is not ACTIVE publication.
} finally {
  if (user.id) {
    const program = `const {Pool}=require('pg');const {loadConfig}=require('./dist/config');const {AuthService}=require('./dist/auth/auth.service');
const {AdminService}=require('./dist/admin/admin.service');const {Argon2CredentialService}=require('./dist/auth/argon');
const c=loadConfig(),p=new Pool({connectionString:c.DATABASE_URL,max:1});
(async()=>{const auth=new AuthService(p,c,new Argon2CredentialService({memoryKib:c.ARGON2_MEMORY_KIB,iterations:c.ARGON2_ITERATIONS,parallelism:c.ARGON2_PARALLELISM}));
const u=await auth.users.findByUsername('${username}');if(!u||u.userId!==process.argv[1])throw Error('EXACT_QA_REQUIRED');
await new AdminService(p,c,auth).disable(u.userId);})().catch(()=>{process.exitCode=1;}).finally(()=>p.end());`;
    docker(['exec', container('control-api'), 'node', '-e', program, user.id]);
    const disabled = dbQuery("SELECT status, (SELECT count(*)::int FROM auth_sessions WHERE user_id=$1 AND state='ACTIVE') active_sessions FROM portal_users WHERE user_id=$1", [user.id]).rows[0];
    assert.equal(disabled.status, 'DISABLED'); assert.equal(disabled.active_sessions, 0);
    receipt.identity_revoked = true;
  }
  // Public scopes/specs are retained privately. Strip one-use capability fields.
  for (const row of receipt.responses) if (row.body?.preflight_token) delete row.body.preflight_token;
  savePrivate(join(home, `section32-imported-profile-${username}.json`), receipt);
  console.log(JSON.stringify({ run_id: receipt.run_id, completed: receipt.completed, identity_revoked: receipt.identity_revoked }));
}
