#!/usr/bin/env node
/** Read-only proof that an exact retained WFO can reuse its own final audit. */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_HOME, ownerClient, privateJson, savePrivate } from './api-client.mjs';
import { PROJECT, validateHome } from './cell.mjs';
import { dbQuery } from './runtime-tools.mjs';

export async function auditReuseReceipt(home = DEFAULT_HOME, label = 'audit-reuse') {
  home = validateHome(home);
  assert(/^[a-z][a-z0-9-]{0,40}$/.test(label));
  const path = join(home, `${label}.json`);
  assert(!existsSync(path), 'INSPECT_PRIOR_RECEIPT_DO_NOT_REPEAT');
  const identity = privateJson(join(home, 'identity.json'));
  assert.equal(identity.dirty, false);
  const runId = privateJson(join(home, 'run-plateau-warmup.json')).run_id;
  const before = dbQuery('SELECT count(*)::int count FROM research.jobs').rows[0].count;
  const response = await (await ownerClient(home)).call('GET', `/api/v1/quantbt/runs/${runId}/release-candidate`, undefined, [200]);
  const split = await (await ownerClient(home)).call('GET', `/api/v1/quantbt/runs/${runId}/current-source/split`, undefined, [200]);
  const audit = response.body.pack.find(item => item.key === 'FINAL_AUDIT_REPLAY');
  const auditRun = response.body.fields.find(field => field.key === 'final_audit_run_id');
  const auditAttempt = response.body.fields.find(field => field.key === 'final_audit_attempt_id');
  const checks = {
    available: audit?.status === 'COMPLETE' && audit?.availability?.state === 'AVAILABLE',
    exact_run: auditRun?.value === runId && auditRun?.availability?.state === 'AVAILABLE',
    pinned_attempt: typeof auditAttempt?.value === 'string' && auditAttempt.availability?.state === 'AVAILABLE',
    audit_digest_and_link: /^[0-9a-f]{64}$/.test(audit?.digest ?? '') && audit?.source?.href === `/research/quantbt/runs/${runId}/execute`,
    typed_fold_stitch: split.body.fold_plan?.state === 'AVAILABLE' && split.body.fold_plan.folds?.length === 2 && split.body.stitch?.boundary_check === 'MATCH' && split.body.stitch.segment_count === 2,
    no_new_job: dbQuery('SELECT count(*)::int count FROM research.jobs').rows[0].count === before,
  };
  const receipt = { schema_version: 'research.p23-audit-reuse.v1', project: PROJECT, identity,
    run_id: runId, response, split, before_jobs: before, checks, passed: Object.values(checks).every(Boolean),
    completed_at_utc: new Date().toISOString() };
  savePrivate(path, receipt);
  assert(receipt.passed, 'EXACT_RETAINED_AUDIT_REUSE_NOT_PROVEN');
  console.log(JSON.stringify({ passed: receipt.passed, run_id: runId, checks }));
  return receipt;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  auditReuseReceipt(process.argv.find(a => a.startsWith('--home='))?.slice(7) ?? DEFAULT_HOME,
    process.argv.find(a => a.startsWith('--label='))?.slice(8) ?? 'audit-reuse')
    .catch(error => { console.error('P23 audit reuse refused:', error.message); process.exitCode = 1; });
}
