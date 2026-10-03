#!/usr/bin/env node
/** P22 GET-only receipt on the approved shared :8095 preview. No producer writes. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { chmodSync, existsSync, lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const BASE = 'http://127.0.0.1:8095';
const PROJECT = 'portal-research-preview';
const require = createRequire(import.meta.url);
const digest = value => createHash('sha256').update(value).digest('hex');
const RUNS = [
  { label: 'R-WFO-022', run: 'rrun_a76afa62adb6c427ba2f4cec44bb43bd', rc: 'rc_06GFW43NE42YF64NMXYDS6GD32' },
  { label: 'R-WFO-023', run: 'rrun_3d5633d2adb712722fe4ba108102aa5d' },
  { label: 'R-WFO-027', run: 'rrun_686af4b1d64472591b6a64a1db1233a3', rc: 'rc_06GG2K1TN6QQNJJN3RJ5AS5XC1' },
];
const docker = args => execFileSync('sudo', ['-n', 'docker', ...args], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
const sql = text => docker(['exec', `${PROJECT}-portal-postgres-1`, 'psql', '-U', 'portal', '-d', 'portal_control', '-At', '-v', 'ON_ERROR_STOP=1', '-c', text]).trim();
const NAMES = ['control-api', 'portal-web', 'portal-api', 'quant-worker-py', 'roadmap-task-board-api', 'portal-postgres', 'portal-nats'];
function runtime() {
  return Object.fromEntries(NAMES.map(name => {
    const container = JSON.parse(docker(['inspect', `${PROJECT}-${name}-1`]))[0];
    assert.equal(container.Config.Labels['com.docker.compose.project'], PROJECT);
    return [name, { container_id: container.Id, image_id: container.Image,
      started_at: container.State.StartedAt, restart_count: container.RestartCount }];
  }));
}
function custody() {
  const ids = RUNS.map(entry => `'${entry.run}'`).join(',');
  const tables = ['runs', 'release_candidates', 'release_candidate_drafts_v1', 'release_candidate_packs_v1',
    'release_candidate_publications_v1', 'release_candidate_delivery_states_v1', 'release_candidate_retention_pins_v1'];
  // Immutable candidate rows and their dependencies only. Never print declarations or payloads.
  const values = tables.map(table => {
    const predicate = ['release_candidate_delivery_states_v1', 'release_candidate_retention_pins_v1'].includes(table)
      ? `release_candidate_id IN (SELECT release_candidate_id FROM research.release_candidate_packs_v1 WHERE run_id IN (${ids}))`
      : `run_id IN (${ids})`;
    return `'${table}', (SELECT jsonb_build_object('count', count(*), 'sha256',
      encode(sha256(convert_to(COALESCE(string_agg(row_json, E'\\n' ORDER BY row_json), ''), 'UTF8')), 'hex'))
      FROM (SELECT to_jsonb(t)::text row_json FROM research.${table} t WHERE ${predicate}) x)`;
  });
  return JSON.parse(sql(`SELECT jsonb_build_object(${values.join(',')});`));
}
function privateFile(path, value) {
  assert(!existsSync(path), 'IMMUTABLE_RECEIPT_MUST_NOT_BE_OVERWRITTEN');
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  chmodSync(path, 0o600);
}
function privateJson(path) {
  const stat = lstatSync(path);
  assert(stat.isFile() && !stat.isSymbolicLink() && (stat.mode & 0o077) === 0, 'PRIVATE_FILE_REQUIRED');
  return JSON.parse(readFileSync(path, 'utf8'));
}
export function verifyReaderFacts(compose, publication, entry) {
  assert.equal(compose.run.id, entry.run);
  assert.equal(compose.local_seal.state, 'SEALED_LOCAL');
  assert.equal(publication.release_candidate_id, compose.local_seal.release_candidate_id);
  assert.equal(publication.pack_digest, compose.local_seal.pack_digest);
  assert.equal(publication.run_id, entry.run);
  if (entry.rc) assert.equal(publication.release_candidate_id, entry.rc);
  const rail = compose.rail.find(node => node.key === 'selected_params');
  assert(rail && Object.hasOwn(rail, 'selected_trial_ordinal')
    && Object.hasOwn(rail, 'selected_trial_ordinal_scope') && Object.hasOwn(rail, 'selected_trial_ordinal_reason_code'), 'TYPED_RC_RAIL_REQUIRED');
  if (rail.selected_trial_ordinal !== null) {
    assert(Number.isSafeInteger(rail.selected_trial_ordinal) && rail.selected_trial_ordinal > 0);
    assert(['RUN_GLOBAL', 'STUDY_LOCAL'].includes(rail.selected_trial_ordinal_scope));
    assert.equal(rail.selected_trial_ordinal_reason_code, null);
    assert.equal(rail.selected_trial_ordinal, compose.selected_params.selected_trial_number);
  } else {
    assert.equal(rail.selected_trial_ordinal_scope, null);
    assert.equal(typeof rail.selected_trial_ordinal_reason_code, 'string');
  }
  if (entry.label !== 'R-WFO-027') {
    assert.equal(compose.actions.publish.enabled, false);
    assert.equal(compose.actions.publish.blocked_reason, 'P22_CURRENT_SOURCE_CHANGED');
    assert.equal(publication.blocked_reason, compose.actions.publish.blocked_reason);
    assert.equal(publication.may_publish, false);
    assert.equal(publication.blocked_action, 'CREATE_NEW_RUN_AND_SEAL');
    assert.equal(compose.actions.publish.blocked_action, publication.blocked_action);
  } else {
    assert.equal(publication.state, 'DELIVERED');
    assert.equal(publication.published.approval_id, 'apr_06GG2K4A9Q3AHFVK0WV5GXNCY2');
    assert.equal(publication.published.by_username, 'claude-preview');
    assert.equal(publication.approval_read, 'DENIED');
    assert.equal(publication.approval, null);
    assert.equal(publication.blocked_reason, 'P22_ALREADY_DELIVERED');
    assert.equal(publication.blocked_action, 'NONE');
  }
  return { label: entry.label, run_id: entry.run, release_candidate_id: publication.release_candidate_id,
    blocked_reason: publication.blocked_reason, blocked_action: publication.blocked_action,
    selected_trial_ordinal: rail.selected_trial_ordinal, selected_trial_ordinal_scope: rail.selected_trial_ordinal_scope,
    selected_trial_ordinal_reason_code: rail.selected_trial_ordinal_reason_code, approval_read: publication.approval_read };
}

async function main() {
  const arg = key => process.argv.find(value => value.startsWith(`--${key}=`))?.slice(key.length + 3);
  const home = arg('home'), phase = arg('phase'), source = arg('source'), label = arg('label') ?? 'reader-runtime';
  assert(/^reader-runtime(?:-[a-z0-9]{1,20})?$/.test(label), 'BOUNDED_IMMUTABLE_RECEIPT_LABEL_REQUIRED');
  assert(home?.startsWith('/home/bobby/.local/state/portal-research-p22-') && resolve(home) === home, 'NAMED_PRIVATE_RECEIPT_HOME_REQUIRED');
  const stat = lstatSync(home);
  assert(stat.isDirectory() && !stat.isSymbolicLink() && (stat.mode & 0o077) === 0);
  assert(['before', 'verify'].includes(phase) && /^[a-f0-9]{40}$/.test(source ?? ''), 'EXPLICIT_PHASE_SOURCE_REQUIRED');
  if (phase === 'before') {
    privateFile(join(home, 'before.json'), { project: PROJECT, base_url: BASE, tested_at_utc: new Date().toISOString(),
      source_commit: source, runtime: runtime(), custody: custody(), jobs: Number(sql('SELECT count(*) FROM research.jobs;')) });
    console.log('P22 immutable before-snapshot recorded; no session or mutation.');
    return;
  }
  const before = privateJson(join(home, 'before.json'));
  assert.equal(before.source_commit, source);
  const { ResearchReleaseCandidateComposeResponseSchema: Compose } = require('../../apps/control-api/dist/research/release-candidate.contract.js');
  const { ResearchReleaseCandidatePublicationResponseSchema: Publication } = require('../../apps/control-api/dist/research/release-candidate-publication.contract.js');
  const env = readFileSync('/home/bobby/.config/portal-research-preview/preview.env', 'utf8');
  const origin = /^PORTAL_PUBLIC_ORIGIN=(.+)$/m.exec(env)?.[1];
  assert(['http://localhost:8095', BASE, 'https://research-portal.primusspark.com'].includes(origin), 'KNOWN_PREVIEW_ORIGIN_REQUIRED');
  const jar = new Map(), responses = {};
  let tokenHash = null;
  const receipt = { schema_version: 'research.p22-reader-runtime-receipt.v1', source_commit: source,
    started_at_utc: new Date().toISOString(), before, checks: [], cleanup: 'PENDING', passed: false };
  async function call(label, method, path) {
    assert(method === 'GET' || (method === 'POST' && path === '/api/auth/logout'), 'PRODUCER_WRITES_FORBIDDEN');
    const response = await fetch(BASE + path, { method, redirect: 'error', signal: AbortSignal.timeout(45000),
      headers: { origin, accept: 'application/json', 'x-dev-access-email': 'claude-preview@azdag.com',
        cookie: [...jar].map(([key, value]) => `${key}=${value}`).join('; ') } });
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(';'), boundary = pair.indexOf('=');
      jar.set(pair.slice(0, boundary), pair.slice(boundary + 1));
    }
    if (!tokenHash && jar.get('__Host-portal_session')) tokenHash = digest(jar.get('__Host-portal_session'));
    assert(response.headers.get('content-type')?.includes('application/json'), 'TYPED_JSON_REQUIRED');
    const text = await response.text();
    assert(Buffer.byteLength(text) <= 512 * 1024, 'NAMED_RESPONSE_BOUND');
    const body = JSON.parse(text);
    responses[label] = { method, path, status: response.status, body, body_sha256: digest(text) };
    assert.equal(response.status, method === 'POST' ? 201 : 200, `${label}:${body.error?.code ?? response.status}`);
    return body;
  }
  try {
    const health = await call('health', 'GET', '/api/control/healthz');
    assert.equal(health.build_commit, source); assert.equal(health.build_dirty, false);
    receipt.compiled_reader_sha256 = {};
    for (const name of ['release-candidate.service.js', 'release-candidate.contract.js', 'release-candidate-publication.contract.js']) {
      const local = digest(readFileSync(join(ROOT, 'apps/control-api/dist/research', name)));
      const deployed = docker(['exec', `${PROJECT}-control-api-1`, 'sha256sum', `/opt/control-api/dist/research/${name}`]).trim().split(/\s+/)[0];
      assert.equal(deployed, local, `ACTUAL_READER_BYTES_DIFFER:${name}`);
      receipt.compiled_reader_sha256[name] = deployed;
    }
    assert.equal((await call('ready', 'GET', '/api/control/readyz')).status, 'ready');
    const auth = await call('auth', 'GET', '/api/auth/context');
    assert.equal(auth.state, 'AUTHENTICATED'); assert.equal(auth.principal.username, 'claude-preview');
    for (const entry of RUNS) {
      const compose = Compose.parse(await call(`${entry.label}-compose`, 'GET', `/api/v1/quantbt/runs/${entry.run}/release-candidate`));
      const publication = Publication.parse(await call(`${entry.label}-publication`, 'GET',
        `/api/v1/research/release-candidates/${compose.local_seal.release_candidate_id}/publication`));
      receipt.checks.push(verifyReaderFacts(compose, publication, entry));
    }
    receipt.after = { runtime: runtime(), custody: custody(), jobs: Number(sql('SELECT count(*) FROM research.jobs;')) };
    assert.deepEqual(receipt.after.custody, before.custody, 'OLD_SEALS_AND_PUBLICATIONS_UNCHANGED');
    assert.equal(receipt.after.jobs, before.jobs, 'GET_MUST_NOT_CREATE_JOB');
    for (const name of NAMES.filter(name => name !== 'control-api')) {
      assert.deepEqual(receipt.after.runtime[name], before.runtime[name], `UNRELATED_SERVICE_CHANGED:${name}`);
    }
    receipt.passed = true;
  } catch (error) {
    receipt.failure = String(error.message).slice(0, 4000);
    throw error;
  } finally {
    try {
      if (tokenHash) {
        await call('logout', 'POST', '/api/auth/logout');
        assert.equal(sql(`SELECT state FROM auth_sessions WHERE session_token_hash='${tokenHash}';`), 'REVOKED');
      }
      receipt.cleanup = 'OWN_RECEIPT_SESSION_REVOKED_NO_FOREIGN_SESSION_CHANGED';
    } catch (error) {
      receipt.passed = false; receipt.cleanup = 'FAILED'; receipt.cleanup_failure = String(error.message);
      process.exitCode = 1;
    }
    receipt.finished_at_utc = new Date().toISOString(); receipt.responses = responses;
    privateFile(join(home, `${label}.json`), receipt);
    console.log(JSON.stringify({ passed: receipt.passed, checks: receipt.checks, cleanup: receipt.cleanup,
      receipt_sha256: digest(readFileSync(join(home, `${label}.json`))) }));
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error('P22 reader receipt failed:', error.message); process.exitCode = 1; });
}
