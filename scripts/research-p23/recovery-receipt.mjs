#!/usr/bin/env node
/** Controlled, new-cell E10 fault. Source terminal is real; no journal rewrite. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { DEFAULT_HOME, privateJson, savePrivate } from './api-client.mjs';
import { BASE_URL, PROJECT } from './cell.mjs';
import { admitRealRun } from './real-run.mjs';
import { container, dbQuery, docker } from './runtime-tools.mjs';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function job(runId) {
  const rows = dbQuery(`SELECT p.workspace_id,p.actor_user_id,p.job_id,p.worker_attempt_id,
    j.state,j.retry_not_before,j.terminal_reason,wa.expires_at,wa.lease_epoch
    FROM research.run_producers p JOIN research.jobs j USING(workspace_id,job_id)
    LEFT JOIN research.worker_attempts wa ON wa.workspace_id=j.workspace_id AND wa.worker_attempt_id=j.current_worker_attempt_id
    WHERE p.run_id=$1`, [runId]).rows;
  assert.equal(rows.length, 1); return rows[0];
}
function sourceRows(runId) {
  return dbQuery(`SELECT row_to_json(e) AS event FROM research.run_progress_events e WHERE run_id=$1 ORDER BY source_sequence`, [runId]).rows;
}
function checkpoints(runId) {
  return dbQuery(`SELECT row_to_json(c) AS checkpoint FROM research.run_terminal_materializations_v1 c WHERE run_id=$1 ORDER BY source_sequence`, [runId]).rows;
}
function cleanupFault() {
  dbQuery(`DROP TRIGGER IF EXISTS p23_fault_terminal_checkpoint ON research.run_terminal_materializations_v1;
    DROP FUNCTION IF EXISTS research.p23_fault_terminal_checkpoint()`);
}
async function main() {
  const home = process.argv.find(arg => arg.startsWith('--home='))?.slice(7) ?? DEFAULT_HOME;
  const path = join(home, 'recovery-receipt.json');
  let prior;
  try { prior = privateJson(path); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const receipt = prior ?? { schema_version: 'research.p23-recovery-runtime.v1', project: PROJECT, base_url: BASE_URL,
    identity: privateJson(join(home, 'identity.json')), started_at_utc: new Date().toISOString(),
    test_clock_mutation: 'Only mutable expiry/retry timers of explicitly named new test jobs; no source timestamp/journal/seal update.',
    steps: [] };
  assert(receipt.project === PROJECT && receipt.base_url === BASE_URL, 'WRONG_RECOVERY_TARGET');
  assert(!receipt.passed, 'RECOVERY_ALREADY_ACCEPTED_DO_NOT_RERUN');
  const keep = (label, evidence) => { receipt.steps.push({ label, at_utc: new Date().toISOString(), evidence }); savePrivate(path, receipt); };
  const worker = container('quant-worker-py');
  try {
    docker(['stop', '-t', '10', worker]);
    if (!receipt.steps.some(step => step.label === 'recovery-reread-idempotent')) {
    const lost = await admitRealRun(home, 'p04', 'lost-terminal');
    receipt.lost_terminal_run = lost.receipt.run_id; savePrivate(path, receipt);
    assert.equal(checkpoints(lost.receipt.run_id).length, 0);
    // Injection occurs after the real journal + sidecars/lifecycle, at one
    // checkpoint INSERT only. No source payload or immutable table is changed.
    dbQuery(`CREATE FUNCTION research.p23_fault_terminal_checkpoint() RETURNS trigger LANGUAGE plpgsql AS $p23$
      BEGIN IF NEW.run_id='${lost.receipt.run_id}' THEN
        RAISE EXCEPTION 'P23_TEST_ONLY_LOST_CHECKPOINT' USING ERRCODE='53100';
      END IF; RETURN NEW; END $p23$;
      CREATE TRIGGER p23_fault_terminal_checkpoint BEFORE INSERT ON research.run_terminal_materializations_v1
      FOR EACH ROW EXECUTE FUNCTION research.p23_fault_terminal_checkpoint()`);
    docker(['start', worker]);
    const deadline = Date.now() + 180000;
    let before;
    while (Date.now() < deadline) {
      const rows = sourceRows(lost.receipt.run_id);
      if (rows.some(row => row.event.event_type === 'run_completed')) {
        before = rows; break;
      }
      await sleep(1000);
    }
    assert(before, 'REAL_TERMINAL_JOURNAL_NOT_OBSERVED');
    docker(['stop', '-t', '10', worker]);
    assert.equal(checkpoints(lost.receipt.run_id).length, 0);
    keep('real-terminal-checkpoint-stranded', { job: job(lost.receipt.run_id), source_rows: before,
      checkpoint_count: 0, worker_stopped_before_fault_removal: true });
    cleanupFault();
    // Keep the production 30s convergence age, no timestamp fabrication.
    const terminalAt = dbQuery(`SELECT extract(epoch FROM received_at)*1000 AS received_ms
      FROM research.run_progress_snapshots WHERE run_id=$1 ORDER BY source_latest_sequence DESC LIMIT 1`, [lost.receipt.run_id]).rows[0];
    await sleep(Math.max(0, Number(terminalAt.received_ms) + 32000 - Date.now()));
    const progress = await lost.client.call('GET', `/api/v1/research/runs/${lost.receipt.run_id}/progress`);
    assert.equal(progress.body.current.effective_status, 'COMPLETED');
    assert.equal(progress.body.current.terminal_materialization, 'READY');
    assert.equal(checkpoints(lost.receipt.run_id).length, 1);
    assert.equal(hash(sourceRows(lost.receipt.run_id)), hash(before));
    keep('read-recovered-real-terminal', { progress, checkpoints: checkpoints(lost.receipt.run_id),
      source_hash_before: hash(before), source_hash_after: hash(sourceRows(lost.receipt.run_id)), job: job(lost.receipt.run_id) });
    const repeated = await lost.client.call('GET', `/api/v1/research/runs/${lost.receipt.run_id}/progress`);
    assert.equal(checkpoints(lost.receipt.run_id).length, 1);
    keep('recovery-reread-idempotent', { progress: repeated, checkpoint_count: 1 });
    }

    const expired = await admitRealRun(home, 'p04', 'retry-expiry-controlled');
    const live = await admitRealRun(home, 'p04', 'live-lease-controlled', 'p23-approver');
    const expiredJob = job(expired.receipt.run_id), liveJob = job(live.receipt.run_id);
    // P10 create already claims the durable attempt before NATS dispatch.
    // Read that real public-path claim; do not create a second synthetic one.
    assert(['CLAIMED', 'RUNNING'].includes(expiredJob.state) && ['CLAIMED', 'RUNNING'].includes(liveJob.state), 'REAL_PUBLIC_CLAIMS_REQUIRED');
    assert(expiredJob.worker_attempt_id && liveJob.worker_attempt_id && expiredJob.worker_attempt_id !== liveJob.worker_attempt_id);
    keep('actual-scheduler-claims', { expired_run: expired.receipt.run_id, live_run: live.receipt.run_id,
      expired_claim: expiredJob, live_claim: liveJob, origin: 'Public P10 create → production claim → NATS dispatch; worker paused before consuming.' });
    // The test clock expires only the claimed test attempt. Journal is absent,
    // so the normal P06 path must recover it to RETRY_WAIT, not fabricate done.
    const changed = dbQuery(`UPDATE research.worker_attempts SET expires_at=now()-interval '1 second'
      WHERE worker_attempt_id=$1 AND workspace_id=$2 AND state IN ('CLAIMED','RUNNING') RETURNING worker_attempt_id`,
    [expiredJob.worker_attempt_id, expiredJob.workspace_id]);
    assert.equal(changed.rowCount, 1);
    const liveBefore = dbQuery(`SELECT row_to_json(j) AS job,row_to_json(w) AS attempt FROM research.jobs j
      JOIN research.worker_attempts w ON w.workspace_id=j.workspace_id AND w.worker_attempt_id=j.current_worker_attempt_id
      WHERE j.job_id=$1`, [liveJob.job_id]).rows;
    await sleep(10500); // production per-workspace read throttle, not lowered.
    const retry = await expired.client.call('GET', `/api/v1/research/runs/${expired.receipt.run_id}/progress`);
    assert.equal(job(expired.receipt.run_id).state, 'RETRY_WAIT');
    keep('expired-lease-recovered-to-retry-wait', { progress: retry, job: job(expired.receipt.run_id) });
    const overdue = dbQuery(`UPDATE research.jobs SET retry_not_before=now()-interval '301 seconds'
      WHERE job_id=$1 AND workspace_id=$2 AND state='RETRY_WAIT' RETURNING job_id`, [expiredJob.job_id, expiredJob.workspace_id]);
    assert.equal(overdue.rowCount, 1);
    await sleep(10500);
    const failed = await expired.client.call('GET', `/api/v1/research/runs/${expired.receipt.run_id}/progress`);
    assert.equal(failed.body.current.effective_status, 'FAILED');
    assert.equal(job(expired.receipt.run_id).state, 'FAILED');
    assert(job(expired.receipt.run_id).terminal_reason.startsWith('P06_RETRY_NOT_DISPATCHED:'));
    assert.equal(sourceRows(expired.receipt.run_id).length, 0);
    const liveAfter = dbQuery(`SELECT row_to_json(j) AS job,row_to_json(w) AS attempt FROM research.jobs j
      JOIN research.worker_attempts w ON w.workspace_id=j.workspace_id AND w.worker_attempt_id=j.current_worker_attempt_id
      WHERE j.job_id=$1`, [liveJob.job_id]).rows;
    assert.deepEqual(liveAfter, liveBefore);
    keep('retry-expired-with-live-lease-unchanged', { failed_progress: failed, expired_job: job(expired.receipt.run_id),
      live_row_hash_before: hash(liveBefore), live_row_hash_after: hash(liveAfter), live_job: job(live.receipt.run_id),
      terminal_source_events: 0 });
    receipt.passed = true; receipt.finished_at_utc = new Date().toISOString(); savePrivate(path, receipt);
    console.log('F4/E10 runtime PASS: actual stranded terminal recovered once; retry expiry typed FAILED; live lease byte-identical.');
  } finally {
    cleanupFault();
    docker(['start', worker]);
  }
}
main().catch(error => { console.error('E10 runtime refused:', error.message); process.exitCode = 1; });
