#!/usr/bin/env node
/** Actual T12 utility observation, confined to the owned 8096 cell.
 * This is not a whole-T12 PASS: separate queued audit admission and every
 * quota boundary need their own evidence. No membership/source SQL writes.
 */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_HOME, loadSessions, makeClient, ownerClient, privateJson, savePrivate } from './api-client.mjs';
import { PROJECT, BASE_URL, validateHome } from './cell.mjs';
import { requestedSpec, waitForRun } from './real-run.mjs';
import { container, dbQuery } from './runtime-tools.mjs';
import { takeSnapshot } from './resource-snapshot.mjs';

const ACTIVE = ['CLAIMED', 'RUNNING', 'CANCEL_REQUESTED'];
const TERMINAL = ['COMPLETED', 'FAILED', 'CANCELLED'];
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const EXPORT_FORMATS = Object.freeze(['REPORT_JSON', 'REPORT_CSV']);

export function utilityTarget(runId, label) {
  assert(/^rrun_[a-z0-9]{32}$/.test(runId), 'ACTUAL_RESEARCH_PARENT_REQUIRED');
  assert(/^[a-z][a-z0-9-]{0,40}$/.test(label), 'BOUNDED_UTILITY_LABEL_REQUIRED');
  return { runId, label };
}

export function assessUtility(receipt) {
  const checks = {
    exact_owned_scope: receipt.project === PROJECT && receipt.base_url === BASE_URL,
    measured_budget: receipt.samples.length >= 2 && receipt.samples.every(s =>
      s.resource.all_active_services_bounded && s.resource.within_base_limit),
    queued_utility_overlap: receipt.primary_running?.body?.current?.source_latest_sequence > 0
      && receipt.samples.some(s => s.jobs.some(j => j.run_id === receipt.primary_run_id && ACTIVE.includes(j.state))
      && s.jobs.some(j => j.run_id === receipt.diagnostic_run_id && [...ACTIVE, 'QUEUED'].includes(j.state))),
    primary_completed: receipt.primary_final?.body?.current?.effective_status === 'COMPLETED'
      && receipt.primary_final.body.current.terminal_materialization === 'READY',
    diagnostic_ready: receipt.diagnostic_final?.body?.current?.effective_status === 'COMPLETED'
      && receipt.diagnostic_final.body.current.terminal_materialization === 'READY'
      && receipt.diagnostic_final.body.current.source_latest_sequence > 0,
    exact_retry: receipt.evaluate?.status === 200 && receipt.retry?.status === 200
      && receipt.retry.body.outcome === 'REPLAYED'
      && receipt.evaluate.body.job?.run_id === receipt.retry.body.job?.run_id,
    changed_grid_refused: receipt.changed_grid?.status === 409
      && receipt.changed_grid.body.error?.code === 'RESEARCH_WHATIF_GRID_CHANGED',
    parent_preserved: receipt.pins_before === receipt.pins_after
      && hash(receipt.freeze_before.body.frozen_selection) === hash(receipt.freeze_after.body.frozen_selection),
    grid_sealed: receipt.freeze_after.body.what_if?.actions?.evaluate_grid?.state === 'NOTHING_TO_EVALUATE'
      && receipt.freeze_after.body.what_if.coverage.evaluated_unique === receipt.freeze_after.body.what_if.coverage.unique_evaluations,
    only_explicit_compute: receipt.jobs_added === 2 && receipt.diagnostic_rows - receipt.diagnostic_rows_before === 1,
    bounded_exports: receipt.exports.length === 8 && new Set(receipt.exports.map(x => x.created.body.job_id)).size === 8
      && receipt.exports.every(x => x.created.body.job_id === x.retry.body.job_id && x.final.body.state === 'READY'
        && x.final.body.size_bytes > 0 && x.final.body.size_bytes <= 512 * 1024),
    observed_bytes: receipt.verifies.length === 6 && receipt.verifies.every(x => x.status === 200 && x.body.artifact_bytes.state === 'MATCH'),
  };
  return { checks, scoped_passed: Object.values(checks).every(Boolean), full_t12_passed: false };
}

function jobs() {
  return dbQuery(`SELECT run_id,job_id,job_kind,queue_class,state,current_worker_attempt_id
    FROM research.jobs WHERE state=ANY($1::text[]) ORDER BY job_id LIMIT 64`, [ACTIVE]).rows;
}
export function exportPath(runId, workspaceId, jobId) {
  utilityTarget(runId, 'export');
  assert(/^[A-Za-z0-9_-]{1,128}$/.test(workspaceId), 'EXACT_WORKSPACE_REQUIRED');
  assert(jobId === undefined || /^rpex_[A-Za-z0-9]+$/.test(jobId), 'NAMED_EXPORT_JOB_REQUIRED');
  return `/api/v1/quantbt/runs/${runId}/report/exports${jobId ? '/' + jobId : ''}?workspace_id=${encodeURIComponent(workspaceId)}`;
}
function parentPins(runId, workspaceId) {
  const rows = dbQuery(`SELECT * FROM (SELECT 'producer' kind,to_jsonb(p)::text fact FROM research.run_producers p WHERE run_id=$1 AND workspace_id=$2
    UNION ALL SELECT 'artifact',to_jsonb(a)::text FROM research.artifacts a WHERE run_id=$1 AND workspace_id=$2 AND state='SEALED'
    UNION ALL SELECT 'part',to_jsonb(p)::text FROM research.artifact_parts p JOIN research.artifacts a USING(workspace_id,artifact_id)
      WHERE a.run_id=$1 AND a.workspace_id=$2 AND a.state='SEALED'
    UNION ALL SELECT 'report',to_jsonb(m)::text FROM research.run_report_manifests_v1 m WHERE run_id=$1 AND workspace_id=$2) pins
    ORDER BY kind,fact COLLATE "C" LIMIT 513`, [runId, workspaceId]).rows;
  assert(rows.length > 2 && rows.length <= 512, 'BOUNDED_SEALED_PARENT_PINS_REQUIRED');
  return hash(rows);
}
function finiteExportWorker() {
  const child = spawn('sudo', ['-n', 'docker', 'exec', container('control-api'), 'node',
    'dist/cli/research-report-export-worker.js', '--limit=8'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '', error = '';
  child.stdout.on('data', data => { output = (output + data).slice(-131072); });
  child.stderr.on('data', data => { error = (error + data).slice(-131072); });
  return new Promise((res, rej) => {
    child.on('error', rej);
    child.on('close', code => code === 0 ? res({ exit_code: code, output })
      : rej(new Error(`OWNED_FINITE_EXPORT_WORKER_FAILED:${code}:${error.slice(-160)}`)));
  });
}

export async function utilityReceipt(home, parentRunId, label) {
  home = validateHome(home); utilityTarget(parentRunId, label);
  const path = join(home, `${label}.json`);
  assert(!existsSync(path), 'INSPECT_PRIOR_RECEIPT_DO_NOT_SILENTLY_REPEAT');
  const identity = privateJson(join(home, 'identity.json'));
  assert(identity.dirty === false, 'PINNED_CLEAN_APPLICATION_REQUIRED');
  const client = await ownerClient(home);
  const workspaceId = privateJson(join(home, 'reader-authorization.json')).workspace_id;
  const sessions = loadSessions(home);
  const exportedBy = new Set(dbQuery(`SELECT requested_by_user_id FROM research.run_report_export_jobs_v1
    WHERE workspace_id=$1 AND run_id=$2 AND state IN ('QUEUED','RUNNING','READY')`, [workspaceId, parentRunId]).rows.map(r => r.requested_by_user_id));
  const readers = sessions.identities.filter(u => /^p23-reader-[0-9]{2}$/.test(u.username) && !exportedBy.has(u.id)).slice(0, 4);
  assert.equal(readers.length, 4, 'FOUR_UNEXPORTED_REAL_MEMBERS_REQUIRED');
  assert.equal(jobs().length, 0, 'DO_NOT_OVERLAP_UNOWNED_COMPUTE');
  assert.equal(dbQuery("SELECT count(*)::int count FROM research.run_report_export_jobs_v1 WHERE state IN ('QUEUED','RUNNING')").rows[0].count,
    0, 'PREEXISTING_EXPORTS_MUST_NOT_BE_CLAIMED');
  const receipt = { schema_version: 'research.p23-utility-observation.v1', project: PROJECT, base_url: BASE_URL,
    identity, parent_run_id: parentRunId, workspace_id: workspaceId, started_at_utc: new Date().toISOString(), samples: [], exports: [], verifies: [],
    full_t12_passed: false, remaining: ['SEPARATE_AUDIT_ADMISSION', 'NEGATIVE_QUOTA_BOUNDARIES'], cleanup: [] };
  let workerTask;
  const sample = () => {
    const value = { at_utc: new Date().toISOString(), resource: takeSnapshot(PROJECT, true), jobs: jobs() };
    receipt.samples.push(value); savePrivate(path, receipt); return value;
  };
  const frozenPath = `/api/v1/quantbt/runs/${parentRunId}/current-source/freeze`;
  try {
    receipt.freeze_before = await client.call('GET', frozenPath);
    const grid = receipt.freeze_before.body.what_if;
    assert(grid?.state === 'AVAILABLE' && grid.actions.evaluate_grid.may_submit, 'ACTUAL_MISSING_EVALUATIONS_REQUIRED');
    receipt.pins_before = parentPins(parentRunId, workspaceId);
    receipt.diagnostic_rows_before = dbQuery('SELECT count(*)::int count FROM research.whatif_jobs_v1 WHERE parent_run_id=$1 AND workspace_id=$2',
      [parentRunId, workspaceId]).rows[0].count;
    receipt.job_count_before = dbQuery('SELECT count(*)::int count FROM research.jobs').rows[0].count;
    sample();
    // Prove the utility route/scope before launching expensive primary work.
    // Reader personal workspaces are NOT the parent workspace; membership
    // must be checked by the public operation with its explicit named scope.
    for (const user of readers) {
      const reader = makeClient(user);
      await reader.call('GET', `/api/v1/quantbt/runs/${parentRunId}/report?workspace_id=${encodeURIComponent(workspaceId)}`);
      for (const format of EXPORT_FORMATS) {
        const request = { format };
        const route = exportPath(parentRunId, workspaceId);
        const created = await reader.call('POST', route, request, [202]);
        const retry = await reader.call('POST', route, request, [202]);
        assert.equal(created.body.state, 'QUEUED', 'REAL_QUEUED_EXPORT_REQUIRED');
        receipt.exports.push({ username: user.username, route, created, retry }); savePrivate(path, receipt);
      }
    }
    assert.equal(receipt.exports.length, 8, 'FOUR_REAL_MEMBERS_TWO_FORMATS_REQUIRED');
    const binding = (await client.call('POST', '/api/v1/research/run-producer/p04-delta/install', {}, [200, 201])).body;
    const atlas = (await client.call('GET', '/api/v1/research/quantbt/atlas')).body;
    const spec = requestedSpec(binding, atlas.atlas.current_release, 'wfo');
    spec.walk_forward = { ...spec.walk_forward, end_exclusive: '2026-09-01T00:00:00Z', split_mode: '2026-06-08T00:00:00Z' };
    const preflight = await client.call('POST', '/api/v1/research/preflights', { requested_spec: spec }, [201]);
    receipt.primary_create = await client.call('POST', '/api/v1/research/runs', {
      schema_version: 'research.run-create.v1', client_intent_id: `p23-utility-${randomUUID()}`,
      preflight_token: preflight.body.preflight_token, requested_spec: spec }, [202]);
    receipt.primary_run_id = receipt.primary_create.body.run_id; savePrivate(path, receipt);
    const runningDeadline = Date.now() + 90000;
    while (Date.now() < runningDeadline) {
      receipt.primary_running = await client.call('GET', `/api/v1/research/runs/${receipt.primary_run_id}/progress`);
      if (receipt.primary_running.body.current.effective_status === 'RUNNING'
        && receipt.primary_running.body.current.source_latest_sequence > 0) break;
      sample(); await new Promise(res => setTimeout(res, 1500));
    }
    assert.equal(receipt.primary_running.body.current.effective_status, 'RUNNING', 'REAL_PRIMARY_SOURCE_RUNNING_REQUIRED');
    receipt.evaluate = await client.call('POST', frozenPath + '/what-if/evaluate', {
      schema_version: 'research.whatif-evaluate.v1', grid_key: grid.grid.grid_key }, [200, 409, 502, 503]);
    savePrivate(path, receipt);
    assert.equal(receipt.evaluate.status, 200, 'ACTUAL_DIAGNOSTIC_ADMISSION_REQUIRED');
    receipt.diagnostic_run_id = receipt.evaluate.body.job.run_id;
    receipt.retry = await client.call('POST', frozenPath + '/what-if/evaluate', {
      schema_version: 'research.whatif-evaluate.v1', grid_key: grid.grid.grid_key });
    const different = (grid.grid.grid_key[0] === '0' ? '1' : '0') + grid.grid.grid_key.slice(1);
    receipt.changed_grid = await client.call('POST', frozenPath + '/what-if/evaluate', {
      schema_version: 'research.whatif-evaluate.v1', grid_key: different }, [409]);
    sample();
    receipt.verifies = await Promise.all(Array.from({ length: 6 }, () =>
      client.call('POST', `/api/v1/quantbt/runs/${parentRunId}/freeze/verify`, {})));
    workerTask = finiteExportWorker(); void workerTask.catch(() => undefined);
    const deadline = Date.now() + 480000;
    while (Date.now() < deadline && receipt.samples.length < 120) {
      sample();
      receipt.primary_final = await client.call('GET', `/api/v1/research/runs/${receipt.primary_run_id}/progress`);
      receipt.diagnostic_final = await client.call('GET', `/api/v1/research/runs/${receipt.diagnostic_run_id}/progress`);
      receipt.samples.at(-1).source_progress = { primary: receipt.primary_final.body.current, diagnostic: receipt.diagnostic_final.body.current };
      savePrivate(path, receipt);
      console.log(JSON.stringify({ primary: receipt.primary_final.body.current.effective_status,
        diagnostic: receipt.diagnostic_final.body.current.effective_status, samples: receipt.samples.length }));
      if ([receipt.primary_final, receipt.diagnostic_final].every(r => TERMINAL.includes(r.body.current.effective_status)
        && r.body.current.terminal_materialization !== 'PENDING')) break;
      await new Promise(res => setTimeout(res, 2500));
    }
    receipt.export_worker = await workerTask;
    for (const job of receipt.exports) {
      const user = sessions.identities.find(u => u.username === job.username);
      job.final = await makeClient(user).call('GET', exportPath(parentRunId, workspaceId, job.created.body.job_id));
    }
    receipt.freeze_after = await client.call('GET', frozenPath);
    receipt.report_after = await client.call('GET', `/api/v1/quantbt/runs/${parentRunId}/report`);
    receipt.pins_after = parentPins(parentRunId, workspaceId);
    receipt.jobs_added = dbQuery('SELECT count(*)::int count FROM research.jobs').rows[0].count - receipt.job_count_before;
    receipt.diagnostic_rows = dbQuery('SELECT count(*)::int count FROM research.whatif_jobs_v1 WHERE parent_run_id=$1 AND workspace_id=$2',
      [parentRunId, workspaceId]).rows[0].count;
    receipt.assessment = assessUtility(receipt);
    receipt.completed_at_utc = new Date().toISOString(); savePrivate(path, receipt);
    console.log(JSON.stringify(receipt.assessment));
    assert(receipt.assessment.scoped_passed, 'UTILITY_SCOPE_FAILED_NOT_A_FULL_T12_PASS');
    return receipt;
  } catch (error) {
    receipt.failure = error.message; receipt.failed_at_utc = new Date().toISOString(); savePrivate(path, receipt); throw error;
  } finally {
    if (!workerTask && receipt.exports.length) {
      // Drain only the jobs this attempt queued after a zero-pending gate.
      // No unrelated export worker/queue or database state is reset.
      workerTask = finiteExportWorker(); void workerTask.catch(() => undefined);
    }
    if (workerTask) { try { await workerTask; } catch (error) { receipt.export_worker_failure = error.message; } }
    for (const runId of [receipt.primary_run_id, receipt.diagnostic_run_id].filter(Boolean)) {
      const current = await client.call('GET', `/api/v1/research/runs/${runId}/progress`);
      if (!TERMINAL.includes(current.body.current.effective_status)) {
        const cancelled = await client.call('POST', `/api/v1/research/runs/${runId}/cancel`, {
          reason: 'P23 owned utility proof cleanup after observation' }, [202]);
        const final = await waitForRun(client, join(home, `${label}-cleanup-${runId}.json`), { run_id: runId }, 180000);
        receipt.cleanup.push({ run_id: runId, cancelled, final });
      }
    }
    receipt.final_resources = takeSnapshot(PROJECT, true); savePrivate(path, receipt);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  utilityReceipt(process.argv.find(a => a.startsWith('--home='))?.slice(7) ?? DEFAULT_HOME,
    process.argv.find(a => a.startsWith('--parent='))?.slice(9), process.argv.find(a => a.startsWith('--label='))?.slice(8))
    .catch(error => { console.error('P23 utility observation refused:', error.message); process.exitCode = 1; });
}
