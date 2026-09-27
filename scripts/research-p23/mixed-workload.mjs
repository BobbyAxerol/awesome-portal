#!/usr/bin/env node
/** W01/W02/W06: real public producer intents, never fabricated queue rows. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_HOME, operatorClient, privateJson, savePrivate } from './api-client.mjs';
import { PROJECT, BASE_URL, validateHome } from './cell.mjs';
import { requestedSpec, waitForRun } from './real-run.mjs';
import { docker, container, dbQuery } from './runtime-tools.mjs';
import { runReadLoad } from './read-load.mjs';

export function longWfoSpec(binding, release) {
  const spec = requestedSpec(binding, release, 'wfo');
  spec.walk_forward = { ...spec.walk_forward, end_exclusive: '2026-09-01T00:00:00Z',
    split_mode: '2026-06-08T00:00:00Z' };
  return spec; // Still the immutable <=92-day, <=16-fold, three-trial profile.
}

export function assertQueue(rows, expected) {
  assert.equal(rows.length, expected);
  assert.equal(new Set(rows.map(row => row.job_id)).size, expected, 'DISTINCT_DURABLE_JOB_IDS_REQUIRED');
  assert(rows.every(row => row.queue_class === 'HEAVY'), 'PUBLIC_PRIMARY_BYPASSED_HEAVY_ADMISSION');
  const active = rows.filter(row => ['CLAIMED', 'RUNNING', 'CANCEL_REQUESTED'].includes(row.state));
  const queued = rows.filter(row => row.state === 'QUEUED');
  assert.equal(active.length, 1, 'EXACTLY_ONE_PRIMARY_HEAVY_SLOT_REQUIRED');
  assert(queued.length >= 4, 'FOUR_DISTINCT_DURABLE_QUEUED_INTENTS_REQUIRED');
  return { heavy_active_peak: active.length, distinct_heavy_intents_queued: queued.length };
}

function queryJobs(intents) {
  return dbQuery(`SELECT p.client_intent_id,p.workspace_id,p.run_id,j.job_id,j.queue_class,j.state,
    j.current_worker_attempt_id,wa.expires_at
    FROM research.run_producers p JOIN research.jobs j USING(workspace_id,job_id)
    LEFT JOIN research.worker_attempts wa ON wa.workspace_id=j.workspace_id AND wa.worker_attempt_id=j.current_worker_attempt_id
    WHERE p.client_intent_id=ANY($1::text[]) ORDER BY p.client_intent_id`, [intents]).rows;
}

async function main() {
  const home = validateHome(process.argv.find(a => a.startsWith('--home='))?.slice(7) ?? DEFAULT_HOME);
  const label=process.argv.find(a=>a.startsWith('--label='))?.slice(8) ?? 'mixed';
  assert(/^[a-z][a-z0-9-]{0,40}$/.test(label),'BOUNDED_MEASUREMENT_LABEL_REQUIRED');
  const target = join(home, `${label}-workload.json`);
  assert(!existsSync(target), 'REUSE_OR_INSPECT_PRIOR_WORKLOAD_DO_NOT_SILENTLY_REPEAT');
  const client = await operatorClient(home);
  const active = dbQuery(`SELECT count(*)::int AS count FROM research.jobs WHERE state IN ('CLAIMED','RUNNING','CANCEL_REQUESTED')`).rows[0];
  assert.equal(active.count, 0, 'DO_NOT_PAUSE_EXISTING_ACTIVE_COMPUTE');
  const runHome = privateJson(join(home, 'identity.json'));
  const receipt = { schema_version: 'research.p23-mixed-workload.v1', project: PROJECT, base_url: BASE_URL + '/',
    candidate_source_sha: runHome.candidate_source_sha, identity: runHome, diagnostic_only: runHome.dirty,
    started_at_utc: new Date().toISOString(), jobs: [], queue_samples: [], passed: false };
  savePrivate(target, receipt);
  let sampler;
  docker(['stop', '--time', '20', container('quant-worker-py')]);
  try {
    const binding = (await client.call('POST', '/api/v1/research/run-producer/p04-delta/install', {}, [200,201])).body;
    const atlas = (await client.call('GET', '/api/v1/research/quantbt/atlas')).body;
    const spec = longWfoSpec(binding, atlas.atlas.current_release);
    for (let i = 0; i < 5; i++) {
      const job = { requested_spec: spec, client_intent_id: `p23-mixed-${i}-${randomUUID()}` };
      receipt.jobs.push(job); savePrivate(target, receipt);
      job.preflight = await client.call('POST', '/api/v1/research/preflights', { requested_spec: spec }, [201]);
      assert.equal(job.preflight.body.may_create_run, true);
      job.create_body = { schema_version: 'research.run-create.v1', client_intent_id: job.client_intent_id,
        preflight_token: job.preflight.body.preflight_token, requested_spec: spec };
      job.response = await client.call('POST', '/api/v1/research/runs', job.create_body, [202,503]);
      const actual = queryJobs([job.client_intent_id]); assert.equal(actual.length, 1);
      Object.assign(job, { run_id: actual[0].run_id, workspace_id: actual[0].workspace_id });
      assert(/^rrun_[a-z0-9]+$/.test(job.run_id));
      if (i === 0) assert.equal(job.response.status, 202);
      else assert(job.response.status === 503 && job.response.body.error?.code === 'RESEARCH_RUN_TRANSPORT_UNKNOWN');
      savePrivate(target, receipt);
    }
    const rows = queryJobs(receipt.jobs.map(job => job.client_intent_id));
    Object.assign(receipt, assertQueue(rows, 5)); receipt.queue_samples.push({at_utc:new Date().toISOString(), rows});
    savePrivate(target, receipt);
    docker(['start', container('quant-worker-py')]);
    const first = receipt.jobs[0];
    const sourceDeadline = Date.now()+90000;
    while (Date.now()<sourceDeadline) {
      const progress = await client.call('GET', `/api/v1/research/runs/${first.run_id}/progress`);
      if (progress.body.current.source_latest_sequence > 0 && progress.body.current.effective_status === 'RUNNING') {
        first.running_source = progress; break;
      }
      await new Promise(resolve => setTimeout(resolve,500));
    }
    assert(first.running_source, 'REAL_CHILD_SOURCE_STARTED_REQUIRED');
    sampler = spawn(process.execPath, [new URL('./resource-snapshot.mjs', import.meta.url).pathname,
      PROJECT, '--require-limits', '--samples=24', '--interval-ms=1000'], { stdio:['ignore','pipe','pipe'] });
    let stdout='',stderr='';
    sampler.stdout.on('data',d=>{stdout+=d;if(stdout.length>16*1024*1024)sampler.kill('SIGTERM');});
    sampler.stderr.on('data',d=>{stderr=(stderr+d).slice(-2000);});
    const sampled = new Promise((resolve,reject)=>{
      sampler.on('error',reject);
      sampler.on('close',code=>code===0?resolve(stdout):reject(new Error(`CAPPED_RESOURCE_SAMPLE_FAILED:${stderr.slice(0,300)}`)));
    });
    void sampled.catch(()=>undefined); // Preserve rejection until the joined wait, never unhandled.
    await new Promise(resolve=>setTimeout(resolve,3000)); // Overlap actual cgroup samples with reads.
    receipt.queue_samples.push({at_utc:new Date().toISOString(), rows:queryJobs(receipt.jobs.map(j=>j.client_intent_id))});
    const authorization = privateJson(join(home,'reader-authorization.json'));
    const count = () => dbQuery(`SELECT count(*)::int AS count FROM research.jobs WHERE workspace_id=$1`,[authorization.workspace_id]).rows[0].count;
    const before = count();
    const read = await runReadLoad(privateJson(join(home,'read-manifest.json')));
    savePrivate(join(home,`${label}-read.json`),read);
    assert.equal(count(),before,'VIEWERS_CREATED_IMPLICIT_JOBS');
    receipt.reads_passed = read.passed; receipt.no_implicit_viewer_jobs=true;
    receipt.viewer_job_count_before=before;receipt.viewer_job_count_after=count();
    await waitForRun(client, join(home,`${label}-first-run.json`), first);
    assert.equal(first.final.body.current.effective_status,'COMPLETED','REAL_HEAVY_COMPLETION_REQUIRED');
    receipt.completed_heavy_runs=1;
    const resources=JSON.parse(await sampled);savePrivate(join(home,`${label}-resource-series.json`),resources);
    receipt.resource_passed=resources.passed; receipt.peak_current_bytes=resources.peak_current_bytes;
    receipt.completed_at_utc=new Date().toISOString();
    receipt.passed = read.passed && resources.passed;
    savePrivate(target,receipt);
    console.log(JSON.stringify({passed:receipt.passed,diagnostic_only:receipt.diagnostic_only,
      heavy_active_peak:receipt.heavy_active_peak,distinct_heavy_intents_queued:receipt.distinct_heavy_intents_queued,
      completed_heavy_runs:receipt.completed_heavy_runs,peak_current_bytes:receipt.peak_current_bytes,
      read_paths:read.by_path}));
  } catch(error) {
    receipt.failed_at_utc=new Date().toISOString();receipt.failure=error.message;savePrivate(target,receipt);throw error;
  } finally {
    if (sampler && sampler.exitCode===null) sampler.kill('SIGTERM');
    docker(['start', container('quant-worker-py')]);
    receipt.queue_cleanup=[];
    for (const job of receipt.jobs.filter(job=>job.run_id)) {
      const row=queryJobs([job.client_intent_id])[0];
      if(row?.state==='QUEUED') {
        const cancelled=await client.call('POST',`/api/v1/research/runs/${job.run_id}/cancel`,
          {reason:'P23 owned queued intent cleanup after measurement'},[202]);
        receipt.queue_cleanup.push({run_id:job.run_id,response:cancelled});
      }
    }
    receipt.queue_cleanup_at_utc=new Date().toISOString();
    savePrivate(target,receipt); // Retain durable intent/history, never DELETE.
  }
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  main().catch(error=>{console.error('P23 mixed workload refused:',error.message);process.exitCode=1;});
}
