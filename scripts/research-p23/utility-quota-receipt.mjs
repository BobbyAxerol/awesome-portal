#!/usr/bin/env node
/** Exact shared-utility quota proof in the owned, isolated P23 cell. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_HOME, loadSessions, makeClient, ownerClient, privateJson, savePrivate } from './api-client.mjs';
import { PROJECT, validateHome } from './cell.mjs';
import { container, dbQuery } from './runtime-tools.mjs';
import { takeSnapshot } from './resource-snapshot.mjs';
import { exportPath } from './utility-receipt.mjs';

const ACTIVE = ['QUEUED', 'RUNNING'];
const formats = ['REPORT_JSON', 'REPORT_CSV'];

function activeExports(workspaceId) {
  return dbQuery(`SELECT count(*)::int count FROM research.run_report_export_jobs_v1
    WHERE workspace_id=$1 AND state=ANY($2::text[])`, [workspaceId, ACTIVE]).rows[0].count;
}

function drain() {
  const result = spawnSync('sudo', ['-n', 'docker', 'exec', container('control-api'), 'node',
    'dist/cli/research-report-export-worker.js', '--limit=5'],
  { timeout: 90000, encoding: 'utf8', maxBuffer: 65536 });
  assert.equal(result.status, 0, `FINITE_EXPORT_DRAIN_FAILED:${result.error?.message ?? result.stderr?.slice(-120)}`);
  return { exit_code: result.status, output_tail: result.stdout?.slice(-400) };
}

export async function utilityQuotaReceipt(home = DEFAULT_HOME, label = 'utility-quota') {
  home = validateHome(home);
  assert(/^[a-z][a-z0-9-]{0,40}$/.test(label), 'BOUNDED_LABEL_REQUIRED');
  const path = join(home, `${label}.json`);
  assert(!existsSync(path), 'INSPECT_PRIOR_RECEIPT_DO_NOT_REPEAT');
  const identity = privateJson(join(home, 'identity.json'));
  assert.equal(identity.dirty, false, 'CLEAN_CELL_IMAGE_REQUIRED');
  const runId = privateJson(join(home, 'run-plateau-warmup.json')).run_id;
  const workspaceId = privateJson(join(home, 'reader-authorization.json')).workspace_id;
  const users = loadSessions(home).identities.filter(u => /^p23-reader-[0-9]{2}$/.test(u.username)).slice(0, 3);
  assert.equal(users.length, 3, 'THREE_REAL_AUTHENTICATED_READERS_REQUIRED');
  assert.equal(activeExports(workspaceId), 0, 'OWNED_WORKSPACE_MUST_HAVE_NO_ACTIVE_EXPORTS');
  const owner = await ownerClient(home);
  const route = exportPath(runId, workspaceId);
  const report = await owner.call('GET', `/api/v1/quantbt/runs/${runId}/report`, undefined, [200]);
  assert.equal(report.status, 200);
  const receipt = { schema_version: 'research.p23-utility-quota.v1', project: PROJECT, identity,
    run_id: runId, workspace_id: workspaceId, started_at_utc: new Date().toISOString(),
    exports: [], baseline: takeSnapshot(PROJECT, true), passed: false };
  savePrivate(path, receipt);
  try {
    for (const user of users.slice(0, 2)) {
      for (const format of formats) {
        const response = await makeClient(user).call('POST', route, { format }, [202]);
        receipt.exports.push({ user: user.username, format, status: response.status, job_id: response.body.job_id });
        savePrivate(path, receipt);
      }
    }
    assert.equal(activeExports(workspaceId), 4, 'FOUR_DURABLE_ACTIVE_EXPORTS_REQUIRED');
    const first = receipt.exports[0];
    receipt.same_key_replay = await makeClient(users[0]).call('POST', route, { format: first.format }, [202]);
    assert.equal(receipt.same_key_replay.body.job_id, first.job_id, 'IDEMPOTENT_REPLAY_MUST_NOT_USE_CAPACITY');
    receipt.fifth = await makeClient(users[2]).call('POST', route, { format: formats[0] }, [503]);
    assert.equal(receipt.fifth.body.error?.code, 'RESEARCH_REPORT_ADMISSION_SATURATED');
    receipt.verify_saturated = await owner.call('POST', `/api/v1/quantbt/runs/${runId}/freeze/verify`, {}, [503]);
    assert.equal(receipt.verify_saturated.body.error?.code, 'RESEARCH_FREEZE_ADMISSION_SATURATED');
    receipt.drain_first = drain();
    assert.equal(activeExports(workspaceId), 0, 'EXPORT_CAPACITY_MUST_RECOVER_AFTER_DRAIN');
    receipt.verify_recovered = await owner.call('POST', `/api/v1/quantbt/runs/${runId}/freeze/verify`, {}, [200]);
    receipt.fifth_after_drain = await makeClient(users[2]).call('POST', route, { format: formats[0] }, [202]);
    receipt.drain_second = drain();
    assert.equal(activeExports(workspaceId), 0);
    receipt.final = takeSnapshot(PROJECT, true);
    assert(receipt.baseline.within_base_limit && receipt.final.within_base_limit, 'P23_5GB_CAP_REQUIRED');
    receipt.passed = true;
    receipt.completed_at_utc = new Date().toISOString();
    savePrivate(path, receipt);
    console.log(JSON.stringify({ passed: receipt.passed, exports: receipt.exports.length,
      fifth: receipt.fifth.status, replay: receipt.same_key_replay.status,
      recovered: receipt.fifth_after_drain.status, bytes: receipt.final.total_current_bytes }));
    return receipt;
  } catch (error) {
    receipt.failure = error.message;
    receipt.failed_at_utc = new Date().toISOString();
    savePrivate(path, receipt);
    throw error;
  } finally {
    // The preflight zero-active gate means the bounded worker drains only jobs
    // allocated by this receipt. Never delete source rows or other work.
    if (activeExports(workspaceId) > 0) {
      receipt.cleanup_drain = drain();
      savePrivate(path, receipt);
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  utilityQuotaReceipt(process.argv.find(a => a.startsWith('--home='))?.slice(7) ?? DEFAULT_HOME,
    process.argv.find(a => a.startsWith('--label='))?.slice(8) ?? 'utility-quota')
    .catch(error => { console.error('P23 utility quota refused:', error.message); process.exitCode = 1; });
}
