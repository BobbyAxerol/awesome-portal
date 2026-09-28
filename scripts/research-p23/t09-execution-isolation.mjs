#!/usr/bin/env node
/** Read-only Execution sentinels around one owned Research W06 workload. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSessions, makeClient, operatorClient, privateJson, readBoundedJson, savePrivate } from './api-client.mjs';
import { BASE_URL, PROJECT, validateHome } from './cell.mjs';
import { dbQuery, docker } from './runtime-tools.mjs';

const HOME = '/home/bobby/.local/state/portal-research-p23/20260927/runtime';
const EXECUTION_READS = ['/api/v1/execution/activation/capabilities', '/api/v1/execution/runtime-manifest'];
const OUTSIDE = Object.freeze([
  ['portal-portal-web-1', 'portal'],
  ['portal-control-api-1', 'portal'],
  ['portal-stable-v1-0-1-portal-web-1', 'portal-stable-v1-0-1'],
  ['portal-stable-v1-0-1-control-api-1', 'portal-stable-v1-0-1'],
]);
const HEALTH = Object.freeze([
  'http://127.0.0.1:8080/api/control/healthz',
  'http://127.0.0.1:8080/api/control/readyz',
  'http://127.0.0.1:18081/api/control/healthz',
  'http://127.0.0.1:18081/api/control/readyz',
]);
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export function stableExecutionShape(body) {
  assert(body && typeof body === 'object' && !Array.isArray(body), 'EXECUTION_OBJECT_REQUIRED');
  const copy = structuredClone(body);
  delete copy.read_at;
  delete copy.read_at_ms;
  return copy;
}

export function assessExecutionIsolation(before, during, after) {
  const stable = [during, after].every(phase =>
    JSON.stringify(phase.execution) === JSON.stringify(before.execution)
    && JSON.stringify(phase.outside) === JSON.stringify(before.outside)
    && JSON.stringify(phase.health) === JSON.stringify(before.health));
  return { stable, before_active: before.queue.active, before_queued: before.queue.queued,
    during_active: during.queue.active, during_queued: during.queue.queued,
    after_active: after.queue.active, after_queued: after.queue.queued,
    passed: stable && before.queue.active === 0 && before.queue.queued === 0
      && during.queue.active === 1 && during.queue.queued >= 4
      && after.queue.active === 0 && after.queue.queued === 0 };
}

function queue() {
  return dbQuery(`SELECT count(*) FILTER (WHERE state IN ('CLAIMED','RUNNING','CANCEL_REQUESTED'))::int AS active,
    count(*) FILTER (WHERE state='QUEUED')::int AS queued FROM research.jobs`).rows[0];
}

function outsideContainers() {
  return OUTSIDE.map(([name, project]) => {
    const row = JSON.parse(docker(['inspect', '--format', '{{json .}}', name]));
    assert.equal(row.Config.Labels?.['com.docker.compose.project'], project, 'OUTSIDE_PROJECT_CHANGED');
    return { name, project, id: row.Id, image_id: row.Image,
      restart_count: row.RestartCount, running: row.State.Running,
      health: row.State.Health?.Status ?? null };
  });
}

async function executionReads(owner, reader) {
  const rows = [];
  for (const [actor, client] of [['owner', owner], ['reader', reader]]) {
    for (const path of EXECUTION_READS) {
      const result = await client.call('GET', path, undefined, [200]);
      rows.push({ actor, path, status: result.status, body_sha256: digest(stableExecutionShape(result.body)) });
    }
  }
  for (const path of EXECUTION_READS) {
    const response = await fetch(new URL(path, BASE_URL), { method: 'GET',
      redirect: 'manual', signal: AbortSignal.timeout(5000) });
    rows.push({ actor: 'anonymous', path, status: response.status });
    await response.body?.cancel();
  }
  assert(rows.filter(row => row.actor === 'anonymous').every(row => row.status === 401),
    'ANONYMOUS_EXECUTION_READ_MUST_REMAIN_DENIED');
  return rows;
}

async function outsideHealth() {
  const rows = [];
  for (const url of HEALTH) {
    const response = await fetch(url, { method: 'GET', redirect: 'manual',
      signal: AbortSignal.timeout(5000) });
    const body = await readBoundedJson(response, 16 * 1024);
    rows.push({ url, status: response.status, body_sha256: digest(body) });
  }
  assert(rows.every(row => row.status === 200), 'SAME_HOST_PORTAL_HEALTH_REQUIRED');
  return rows;
}

async function snapshot(owner, reader) {
  return { at_utc: new Date().toISOString(), queue: queue(),
    execution: await executionReads(owner, reader),
    outside: outsideContainers(), health: await outsideHealth() };
}

async function main() {
  const home = validateHome(process.argv.find(arg => arg.startsWith('--home='))?.slice(7) ?? HOME);
  const label = process.argv.find(arg => arg.startsWith('--label='))?.slice(8) ?? 't09-coupling';
  assert(/^[a-z][a-z0-9-]{0,40}$/.test(label), 'BOUNDED_T09_LABEL_REQUIRED');
  const target = join(home, `${label}.json`);
  assert(!existsSync(target) && !existsSync(join(home, `${label}-w06-workload.json`)),
    'T09_RECEIPT_ALREADY_EXISTS');
  const identity = privateJson(join(home, 'identity.json'));
  assert(identity.project === PROJECT && identity.base_url === BASE_URL && identity.dirty === false,
    'PINNED_CLEAN_OWNED_CELL_REQUIRED');
  const sessions = loadSessions(home);
  assert(sessions.preparation_complete && sessions.identities.length === 22, 'P23_REAL_TEST_USERS_REQUIRED');
  const owner = await operatorClient(home);
  const reader = makeClient(sessions.identities.find(user => user.username === 'p23-reader-01'));
  const context = await reader.call('GET', '/api/auth/context');
  assert(context.body.state === 'AUTHENTICATED', 'READER_SESSION_REQUIRED');
  const receipt = { schema_version: 'research.p23-t09-isolation.v1', project: PROJECT,
    candidate_source_sha: identity.candidate_source_sha, base_url: BASE_URL,
    started_at_utc: new Date().toISOString(), scope: 'P23 cell Execution GET/denial plus same-host Portal health/identity; no AWS-HK source probe',
    before: await snapshot(owner, reader), during: null, after: null, w06: null, assessment: null };
  assert(receipt.before.queue.active === 0 && receipt.before.queue.queued === 0, 'EXISTING_JOB_MUST_NOT_BE_DISTURBED');
  savePrivate(target, receipt);
  const child = spawn(process.execPath, [fileURLToPath(new URL('./mixed-workload.mjs', import.meta.url)),
    `--home=${home}`, `--label=${label}-w06`], { stdio: ['ignore', 'pipe', 'pipe'] });
  let childTail = '';
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', bytes => { childTail = (childTail + bytes.toString()).slice(-1000); });
  }
  const done = new Promise((resolveDone, reject) => {
    child.once('error', reject); child.once('close', code => resolveDone(code));
  });
  try {
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error('W06_EXITED_BEFORE_HEAVY_QUEUE_OVERLAP');
      const state = queue();
      if (state.active === 1 && state.queued >= 4) break;
      await sleep(400);
    }
    assert(Date.now() < deadline, 'ONE_HEAVY_FOUR_QUEUED_OVERLAP_NOT_OBSERVED');
    receipt.during = await snapshot(owner, reader);
    assert(receipt.during.queue.active === 1 && receipt.during.queue.queued >= 4,
      'HEAVY_QUEUE_ENDED_BEFORE_EXECUTION_SENTINEL');
    const code = await done;
    receipt.w06 = { exit_code: code, tail_sha256: digest(childTail) };
    const workload = privateJson(join(home, `${label}-w06-workload.json`));
    receipt.w06 = { ...receipt.w06, heavy_active_peak: workload.heavy_active_peak,
      distinct_heavy_intents_queued: workload.distinct_heavy_intents_queued,
      completed_heavy_runs: workload.completed_heavy_runs,
      peak_current_bytes: workload.peak_current_bytes,
      reads_passed: workload.reads_passed, resource_passed: workload.resource_passed };
    const drainDeadline = Date.now() + 300_000;
    while (Date.now() < drainDeadline) {
      const state = queue();
      if (state.active === 0 && state.queued === 0) break;
      await sleep(1000);
    }
    receipt.after = await snapshot(owner, reader);
    receipt.assessment = assessExecutionIsolation(receipt.before, receipt.during, receipt.after);
    receipt.completed_at_utc = new Date().toISOString();
    savePrivate(target, receipt);
    console.log(JSON.stringify({ scoped_passed: receipt.assessment.passed,
      w06_exit: code, w06_read_slo_passed: receipt.w06.reads_passed,
      w06_memory_peak_bytes: receipt.w06.peak_current_bytes,
      before: receipt.before.queue, during: receipt.during.queue, after: receipt.after.queue }));
    if (!receipt.assessment.passed || code !== 0 || receipt.w06.completed_heavy_runs !== 1) process.exitCode = 1;
  } catch (error) {
    receipt.failure = error.message;
    const code = await done;
    receipt.w06 = { exit_code: code, tail_sha256: digest(childTail) };
    receipt.after = await snapshot(owner, reader).catch(() => null);
    savePrivate(target, receipt);
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error('P23 T09 isolation refused:', error.message); process.exitCode = 1; });
}
