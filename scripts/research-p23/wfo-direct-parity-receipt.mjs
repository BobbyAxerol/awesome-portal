#!/usr/bin/env node
/** V11-P23-DR: bounded published-engine recomputation -> sealed source -> BFF. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_HOME, loadSessions, makeClient, privateJson, savePrivate } from './api-client.mjs';
import { BASE_URL, PROJECT, validateHome } from './cell.mjs';
import { container, dbQuery, docker } from './runtime-tools.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
function exactDecimal(value) {
  assert(typeof value === 'string' && /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(value), 'EXACT_DECIMAL_TEXT_REQUIRED');
  const normalized = value.includes('.') ? value.replace(/0+$/, '').replace(/\.$/, '') : value;
  return normalized === '-0' ? '0' : normalized;
}
export function compareDirectWfo(source, api, runId, artifact) {
  assert.equal(source.engine_version, '1.1.1', 'PINNED_ENGINE_REQUIRED');
  assert.equal(source.run_id, runId, 'ORACLE_RUN_DRIFT');
  assert.equal(api.run_id, runId, 'BFF_RUN_DRIFT');
  assert.equal(source.engine_recomputed, true, 'REAL_RECOMPUTATION_REQUIRED');
  assert.equal(source.production_runner_used, false, 'INDEPENDENT_ENGINE_ENTRY_REQUIRED');
  assert.equal(source.passed, true, 'ORACLE_PASS_REQUIRED');
  assert.equal(api.availability?.state, 'AVAILABLE', 'BFF_AVAILABLE_REQUIRED');
  assert.equal(api.read_authority, 'PORTAL_RETAINED_CURRENT_SOURCE', 'BFF_AUTHORITY_DRIFT');
  assert.equal(source.pins.manifest, artifact.manifest_digest, 'DATABASE_MANIFEST_DRIFT');
  assert.equal(api.provenance?.source_manifest_digest, artifact.manifest_digest, 'BFF_MANIFEST_DRIFT');
  assert(source.observation_rows_exact > 0 && source.observation_rows_exact <= 2208
    && source.fold_count >= 2 && source.fold_count <= 16 && source.trial_count === 3,
    'WHOLE_QUALIFIED_PROFILE_REQUIRED');
  assert.equal(source.source_metrics_compared,6,'SIX_NATIVE_METRICS_REQUIRED');
  assert.equal(source.selected_parameters_exact, true, 'SELECTION_PARITY_REQUIRED');
  assert.deepEqual(Object.keys(source.direct_metrics).sort(),
    ['initial_equity','final_equity','net_return_fraction','max_drawdown_fraction'].sort(),
    'COMPLETE_BFF_METRIC_SET_REQUIRED');
  for (const [key, value] of Object.entries(source.direct_metrics)) {
    assert.equal(exactDecimal(value), exactDecimal(api.passport[key]), `${key}_BFF_DIFF`);
  }
  return { full_observation_rows_exact: source.observation_rows_exact,
    source_metrics_exact: source.source_metrics_compared, bff_metrics: Object.keys(source.direct_metrics),
    selection_parameters_exact: true, numerical_differences: Object.fromEntries(Object.keys(source.direct_metrics).map(k => [k, '0'])) };
}

export async function wfoDirectParityReceipt(home = DEFAULT_HOME, runId = 'rrun_c3bc2113431102c1715a9d6d28d7b2bf', label = 'accepted') {
  home = validateHome(home);
  assert(/^rrun_[a-z0-9]{1,80}$/.test(runId), 'OWNED_RUN_ID_REQUIRED');
  assert(/^[a-z][a-z0-9-]{0,40}$/.test(label), 'BOUNDED_RECEIPT_LABEL_REQUIRED');
  const target = join(home, `wfo-direct-${runId}-${label}.json`);
  assert(!existsSync(target), 'RECEIPT_OVERWRITE_REFUSED');
  const artifactRows = dbQuery('SELECT artifact_id,manifest_digest,state FROM research.artifacts WHERE run_id=$1', [runId]).rows;
  assert.equal(artifactRows.length, 1, 'ONE_ARTIFACT_REQUIRED');
  const artifact = artifactRows[0]; assert.equal(artifact.state, 'SEALED');
  const program = readFileSync(new URL('./wfo-direct-oracle.py', import.meta.url), 'utf8');
  const receipt = { schema_version: 'research.p23-wfo-direct-parity.v1', project: PROJECT, base_url: BASE_URL,
    run_id: runId, started_at_utc: new Date().toISOString(), oracle_sha256: sha(program),
    runtime_identity_reference: 'identity-p23-tuned-clean.json',
    runtime_identity_sha256: sha(readFileSync(join(home, 'identity-p23-tuned-clean.json'))),
    scope: 'ONE_SEEDED_DELTA_GLOBAL_WFO_ENGINE_RECOMPUTATION_TO_SEAL_TO_NAMED_OWNER_BFF', passed: false };
  try {
    const pins = privateJson(join(home, 'identity-p23-tuned-clean.json')).images;
    for (const service of ['portal-api', 'control-api', 'portal-postgres', 'portal-nats']) {
      assert.equal(docker(['inspect', '--format', '{{.Image}}', container(service)]).trim(),
        pins[service].image_id, 'TESTED_RUNTIME_IMAGE_DRIFT');
    }
    const source = JSON.parse(docker(['exec', '-i', container('portal-api'), 'python', '-c', program],
      JSON.stringify({ run_id: runId, artifact_id: artifact.artifact_id, manifest_digest: artifact.manifest_digest })));
    const user = loadSessions(home).identities.find(row => row.username === 'p23-owner');
    assert(user?.password, 'EXISTING_QA_OWNER_REQUIRED');
    const client = makeClient({ ...user, cookies: {} });
    await client.call('POST', '/api/auth/login', { username: user.username, credential: user.password }, [201]);
    const api = (await client.call('GET', `/api/v1/quantbt/runs/${runId}/current-source/evidence`)).body;
    receipt.source = source; receipt.compared = compareDirectWfo(source, api, runId, artifact);
    receipt.api = { revision: api.revision, provenance: api.provenance, passport: api.passport };
    receipt.passed = true;
  } catch (error) {
    receipt.error_code = error.code ?? error.name;
    if (error.stderr) {
      const path = join(home, `wfo-direct-${runId}-${label}.stderr.log`);
      assert(!existsSync(path), 'PRIVATE_FAILURE_LOG_OVERWRITE_REFUSED');
      writeFileSync(path, String(error.stderr).slice(-65536), { mode: 0o600 }); chmodSync(path, 0o600);
      receipt.failure_log_sha256 = sha(readFileSync(path));
    }
    // Child stderr may contain data; do not echo exec error objects or logs.
    throw new Error(`WFO_DIRECT_PARITY_REFUSED:${error.code ?? error.name}`);
  } finally {
    receipt.finished_at_utc = new Date().toISOString(); savePrivate(target, receipt);
    console.log(JSON.stringify({ passed: receipt.passed, run_id: runId, receipt_sha256: sha(readFileSync(target)) }));
  }
  return receipt;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  wfoDirectParityReceipt(process.argv.find(x => x.startsWith('--home='))?.slice(7) ?? DEFAULT_HOME,
    process.argv.find(x => x.startsWith('--run='))?.slice(6), process.argv.find(x => x.startsWith('--label='))?.slice(8))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
