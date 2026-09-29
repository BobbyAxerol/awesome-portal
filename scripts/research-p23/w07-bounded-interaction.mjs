#!/usr/bin/env node
/** W07 companion: a stalled bounded export plus deep replay/projection while WFO runs. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_HOME, loadSessions, makeClient, operatorClient, privateJson, savePrivate } from './api-client.mjs';
import { BASE_URL, PROJECT, validateHome } from './cell.mjs';
import { deepPage } from './far-seek-receipt.mjs';
import { dbQuery } from './runtime-tools.mjs';
import { takeSnapshot } from './resource-snapshot.mjs';

const pause = ms => new Promise(done => setTimeout(done, ms));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const jobCount = workspace => dbQuery('SELECT count(*)::int count FROM research.jobs WHERE workspace_id=$1', [workspace]).rows[0].count;

export function assessW07(r) {
  const checks = {
    real_primary: r.running?.effective_status === 'RUNNING' && r.running.source_latest_sequence > 0,
    overlap_at_reads: r.running_at_reads?.effective_status === 'RUNNING'
      && r.running_at_reads.source_latest_sequence > 0,
    stalled_export: r.export?.status === 200 && r.export.paused_ms >= 2500 && r.export.bytes > 0
      && r.export.bytes <= 512 * 1024 && r.export.digest_matches,
    far_seek: r.replay?.depth >= 2 && r.replay.ordinal > 0,
    projection: r.reads?.length === 8 && r.reads.every(row => row.status === 200
      && row.replay_ordinal === r.replay.ordinal),
    no_implicit_jobs: r.jobs_before === r.jobs_after,
    bounded_cell: r.resources?.length >= 2 && r.resources.every(row => row.within_base_limit
      && row.all_active_services_bounded),
  };
  return { checks, scoped_passed: Object.values(checks).every(Boolean), full_p23_passed: false };
}

async function main() {
  const home = validateHome(process.argv.find(arg => arg.startsWith('--home='))?.slice(7) ?? DEFAULT_HOME);
  const label = process.argv.find(arg => arg.startsWith('--label='))?.slice(8) ?? 'w07-companion';
  const archived = process.argv.find(arg => arg.startsWith('--archived-run='))?.slice(15);
  assert(/^[a-z][a-z0-9-]{0,40}$/.test(label) && /^rrun_[a-z0-9]{16,64}$/.test(archived ?? ''),
    'BOUNDED_LABEL_AND_ARCHIVED_RUN_REQUIRED');
  const target = join(home, label + '.json');
  assert(!existsSync(target), 'PRIOR_W07_RECEIPT_MUST_NOT_BE_OVERWRITTEN');
  const identity = privateJson(join(home, 'identity.json'));
  assert(identity.project === PROJECT && identity.base_url === BASE_URL && identity.dirty === false
    && Object.keys(identity.images).length === 7, 'PINNED_CLEAN_CELL_REQUIRED');
  const scope = privateJson(join(home, 'reader-authorization.json'));
  assert(scope.project === PROJECT && scope.base_url === BASE_URL);
  const workspace = scope.workspace_id;
  const owner = await operatorClient(home);
  const users = loadSessions(home).identities;
  const readers = users.filter(user => /^p23-reader-0[1-4]$/.test(user.username));
  assert.equal(readers.length, 4);
  const exportRow = dbQuery("SELECT e.job_id,e.run_id,e.requested_by_user_id,e.output_sha256,"
    + " octet_length(e.output_bytes)::int size_bytes,u.username"
    + " FROM research.run_report_export_jobs_v1 e JOIN public.portal_users u"
    + " ON u.user_id=e.requested_by_user_id WHERE e.workspace_id=$1 AND e.state='READY'"
    + " AND e.output_bytes IS NOT NULL AND u.username LIKE 'p23-reader-%'"
    + " ORDER BY e.completed_at DESC,e.job_id DESC LIMIT 1", [workspace]).rows[0];
  assert(exportRow && exportRow.size_bytes > 0 && exportRow.size_bytes <= 512 * 1024
    && /^[a-f0-9]{64}$/.test(exportRow.output_sha256), 'OWNED_READY_EXPORT_REQUIRED');
  const exporter = users.find(user => user.id === exportRow.requested_by_user_id);
  assert(exporter?.username === exportRow.username);
  const active = dbQuery("SELECT run_id FROM research.jobs WHERE workspace_id=$1"
    + " AND state='RUNNING' AND queue_class='HEAVY' ORDER BY job_id LIMIT 2", [workspace]).rows;
  assert.equal(active.length, 1, 'ONE_REAL_RUNNING_HEAVY_REQUIRED');
  const running = (await owner.call('GET', '/api/v1/research/runs/' + active[0].run_id + '/progress')).body.current;
  assert(running.effective_status === 'RUNNING' && running.source_latest_sequence > 0);
  const r = { schema_version: 'research.p23-w07-companion.v1', project: PROJECT,
    candidate_source_sha: identity.candidate_source_sha, archived_run_id: archived,
    active_run_id: active[0].run_id, running, started_at_utc: new Date().toISOString(),
    resources: [], reads: [], full_p23_passed: false };
  savePrivate(target, r);
  try {
    const base = '/api/v1/quantbt/runs/' + archived + '/current-source/replay?workspace_id='
      + encodeURIComponent(workspace) + '&limit=100';
    const page = await deepPage(owner, base,
      body => ({ page: body.replay?.page, rows: body.replay?.rows,
        sourceCount: body.replay?.source_observation_count }),
      ({ rows, sourceCount }) => Number.isSafeInteger(sourceCount) && sourceCount > 400
        && rows.at(-1).source_ordinal >= Math.floor(sourceCount * .75));
    const point = page.rows[Math.floor(page.rows.length / 2)];
    assert(point?.playback_cursor && point?.source_ordinal > 0);
    r.replay = { depth: page.depth, ordinal: point.source_ordinal,
      cursor_sha256: digest(point.playback_cursor) };
    const exportPath = '/api/v1/quantbt/runs/' + exportRow.run_id
      + '/report/exports/' + exportRow.job_id;
    const status = await makeClient(exporter).call('GET', exportPath + '?workspace_id=' + encodeURIComponent(workspace));
    assert.equal(status.body.state, 'READY');
    const response = await fetch(new URL(exportPath + '/download?workspace_id='
      + encodeURIComponent(workspace), BASE_URL), { method: 'GET', redirect: 'manual',
      signal: AbortSignal.timeout(15000), headers: {
        cookie: Object.entries(exporter.cookies).map(([key, value]) => key + '=' + value).join('; '),
        'x-dev-access-email': exporter.username + '@azdag.com' } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal(Number(response.headers.get('content-length')), exportRow.size_bytes);
    const stalledAt = performance.now();
    r.running_at_reads = (await owner.call('GET', '/api/v1/research/runs/'
      + active[0].run_id + '/progress')).body.current;
    assert(r.running_at_reads.effective_status === 'RUNNING'
      && r.running_at_reads.source_latest_sequence > 0, 'PRIMARY_ENDED_BEFORE_W07_OVERLAP');
    r.jobs_before = jobCount(workspace);
    r.resources.push(takeSnapshot(PROJECT, true));
    const paths = [base + '&at=' + encodeURIComponent(point.playback_cursor),
      '/api/v1/quantbt/runs/' + archived + '/evidence?workspace_id=' + encodeURIComponent(workspace)];
    r.reads = await Promise.all(readers.flatMap(user => paths.map(async (path, index) => {
      const started = performance.now();
      const value = await makeClient(user).call('GET', path);
      return { kind: index ? 'evidence_projection' : 'deep_replay', status: value.status,
        duration_ms: Math.round(performance.now() - started),
        replay_ordinal: index ? point.source_ordinal : value.body.replay?.state_at_cursor?.source_ordinal };
    })));
    r.resources.push(takeSnapshot(PROJECT, true));
    r.jobs_after = jobCount(workspace);
    await pause(Math.max(0, 3000 - (performance.now() - stalledAt)));
    const chunks = []; let bytes = 0;
    for await (const chunk of response.body) {
      bytes += chunk.byteLength;
      assert(bytes <= 512 * 1024, 'EXPORT_RESPONSE_BOUND_EXCEEDED');
      chunks.push(Buffer.from(chunk));
    }
    r.export = { status: response.status, bytes, paused_ms: Math.round(performance.now() - stalledAt),
      digest_matches: digest(Buffer.concat(chunks, bytes)) === exportRow.output_sha256 };
    r.resources.push(takeSnapshot(PROJECT, true));
    r.assessment = assessW07(r);
    r.completed_at_utc = new Date().toISOString();
    savePrivate(target, r);
    console.log(JSON.stringify({ scoped_passed: r.assessment.scoped_passed, checks: r.assessment.checks,
      max_read_ms: Math.max(...r.reads.map(row => row.duration_ms)), export_bytes: bytes,
      peak_current_bytes: Math.max(...r.resources.map(row => row.total_current_bytes)) }));
    if (!r.assessment.scoped_passed) process.exitCode = 1;
  } catch (error) {
    r.failure = String(error.message).replace(/([?&](?:cursor|at|before)=)[^&]+/g, '$1[redacted]');
    r.failed_at_utc = new Date().toISOString(); savePrivate(target, r);
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error('P23 W07 refused:', error.message.replace(/([?&](?:cursor|at|before)=)[^&]+/g, '$1[redacted]'));
    process.exitCode = 1; });
}
