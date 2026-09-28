#!/usr/bin/env node
/** Finite real-API admission probe on the owned P23 cell only. No compute. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_HOME, loadSessions, makeClient, operatorClient, privateJson, savePrivate } from './api-client.mjs';
import { BASE_URL, PROJECT, validateHome } from './cell.mjs';
import { requestedSpec } from './real-run.mjs';
import { dbQuery } from './runtime-tools.mjs';
import { takeSnapshot } from './resource-snapshot.mjs';

const LIMIT = 8; // Isolated cell uses the declared Control API default.
const sha256 = value => createHash('sha256').update(value).digest('hex');
const count = (sql, params = []) => Number(dbQuery(sql, params).rows[0].n);
const activePreflights = (userId, workspaceId) => count(
  'SELECT count(*)::int n FROM research.preflight_manifests WHERE actor_user_id=$1 AND workspace_id=$2 AND expires_at>now()',
  [userId, workspaceId]);
const jobs = () => count('SELECT count(*)::int n FROM research.jobs');

export function assessAdmission(receipt) {
  const attempts = receipt.owner_attempts ?? [];
  const checks = {
    exact_cell: receipt.project === PROJECT && receipt.base_url === BASE_URL
      && /^[a-f0-9]{40}$/.test(receipt.candidate_source_sha ?? ''),
    clean_start: receipt.owner_active_before === 0 && receipt.other_actor_active_before === 0
      && receipt.active_jobs_before === 0,
    finite_owner_limit: attempts.length === LIMIT + 1
      && attempts.slice(0, LIMIT).every(x => x.status === 201 && /^[a-f0-9]{64}$/.test(x.token_sha256 ?? ''))
      && attempts[LIMIT].status === 503
      && attempts[LIMIT].code === 'RESEARCH_PREFLIGHT_UNAVAILABLE'
      && receipt.owner_active_after === LIMIT,
    actor_isolation: receipt.other_actor?.status === 201
      && /^[a-f0-9]{64}$/.test(receipt.other_actor.token_sha256 ?? '')
      && receipt.other_actor_active_after === 1,
    no_compute: receipt.jobs_after === receipt.jobs_before && receipt.active_jobs_after === 0,
    bounded_resources: (receipt.samples ?? []).length === LIMIT + 3
      && receipt.samples.every(x => x.all_active_services_bounded && x.within_base_limit),
  };
  return { checks, scoped_passed: Object.values(checks).every(Boolean), full_t12_passed: false };
}

export async function admissionReceipt(home = DEFAULT_HOME, label = 't12-admission') {
  home = validateHome(home);
  assert(/^[a-z][a-z0-9-]{0,40}$/.test(label), 'BOUNDED_T12_LABEL_REQUIRED');
  const path = join(home, `${label}.json`);
  assert(!existsSync(path), 'PRESERVE_PREVIOUS_RECEIPT');
  const identity = privateJson(join(home, 'identity.json'));
  assert(identity.dirty === false, 'PINNED_CLEAN_APPLICATION_REQUIRED');
  const owner = await operatorClient(home);
  const member = loadSessions(home).identities.find(x => x.username === 'p23-reader-01');
  assert(member?.id, 'OWNED_INDEPENDENT_MEMBER_REQUIRED');
  const other = makeClient(member);
  const context = (await other.call('GET', '/api/auth/context')).body;
  assert(context.state === 'AUTHENTICATED' && context.principal.principalId === member.id,
    'SAME_REAL_INDEPENDENT_MEMBER_REQUIRED');
  const workspaceId = privateJson(join(home, 'reader-authorization.json')).workspace_id;
  const ownerId = owner.user.id, otherId = other.user.id;
  const receipt = {
    schema_version: 'research.p23-t12-admission-observation.v1', project: PROJECT,
    base_url: BASE_URL, candidate_source_sha: identity.candidate_source_sha,
    started_at_utc: new Date().toISOString(), owner_attempts: [], samples: [],
    remaining: ['AUDIT_OF_SELECTION_ADMISSION', 'UTILITY_KIND_QUOTAS', 'NO_API_BYPASS'],
    full_t12_passed: false,
  };
  const sample = () => {
    const value = takeSnapshot(PROJECT, true);
    receipt.samples.push({ at_utc: new Date().toISOString(),
      aggregate_memory_current_bytes: value.total_current_bytes,
      all_active_services_bounded: value.all_active_services_bounded,
      within_base_limit: value.within_base_limit });
    savePrivate(path, receipt);
  };
  try {
    receipt.owner_active_before = activePreflights(ownerId, workspaceId);
    receipt.other_actor_active_before = activePreflights(otherId, workspaceId);
    receipt.jobs_before = jobs();
    receipt.active_jobs_before = count("SELECT count(*)::int n FROM research.jobs WHERE state IN ('QUEUED','CLAIMED','RUNNING')");
    assert(receipt.owner_active_before === 0 && receipt.other_actor_active_before === 0
      && receipt.active_jobs_before === 0, 'P23_TEST_ACTORS_MUST_START_IDLE');
    sample();
    const binding = (await owner.call('POST', '/api/v1/research/run-producer/p04-delta/install', {}, [200, 201])).body;
    const atlas = (await owner.call('GET', '/api/v1/research/quantbt/atlas')).body;
    const spec = requestedSpec(binding, atlas.atlas.current_release, 'p04');
    for (let ordinal = 1; ordinal <= LIMIT + 1; ordinal++) {
      const start = performance.now();
      const response = await owner.call('POST', '/api/v1/research/preflights',
        { workspace_id: workspaceId, requested_spec: spec }, [201, 503]);
      receipt.owner_attempts.push({ ordinal, status: response.status,
        code: response.body.error?.code ?? null,
        elapsed_ms: Math.round(performance.now() - start),
        token_sha256: response.status === 201 ? sha256(response.body.preflight_token) : null });
      sample();
      if (response.status !== 201) break;
    }
    receipt.owner_active_after = activePreflights(ownerId, workspaceId);
    assert.equal(receipt.owner_active_after, LIMIT, 'OWNER_QUOTA_MUST_NOT_STORE_NINTH_MANIFEST');
    const otherStart = performance.now();
    const independent = await other.call('POST', '/api/v1/research/preflights',
      { workspace_id: workspaceId, requested_spec: spec }, [201]);
    receipt.other_actor = { status: independent.status,
      elapsed_ms: Math.round(performance.now() - otherStart),
      token_sha256: sha256(independent.body.preflight_token) };
    receipt.other_actor_active_after = activePreflights(otherId, workspaceId);
    sample();
    receipt.jobs_after = jobs();
    receipt.active_jobs_after = count("SELECT count(*)::int n FROM research.jobs WHERE state IN ('QUEUED','CLAIMED','RUNNING')");
    receipt.assessment = assessAdmission(receipt);
    receipt.completed_at_utc = new Date().toISOString();
    savePrivate(path, receipt);
    assert(receipt.assessment.scoped_passed, 'T12_PREFLIGHT_QUOTA_SCOPE_FAILED');
    console.log(JSON.stringify({ assessment: receipt.assessment, owner_attempts: receipt.owner_attempts.length,
      owner_active_after: receipt.owner_active_after, other_actor_active_after: receipt.other_actor_active_after }));
    return receipt;
  } catch (error) {
    receipt.failure = error.message; receipt.failed_at_utc = new Date().toISOString();
    savePrivate(path, receipt); throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  admissionReceipt(process.argv.find(x => x.startsWith('--home='))?.slice(7) ?? DEFAULT_HOME,
    process.argv.find(x => x.startsWith('--label='))?.slice(8) ?? 't12-admission')
    .catch(error => { console.error('P23 T12 admission refused:', error.message); process.exitCode = 1; });
}
