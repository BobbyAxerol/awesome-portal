#!/usr/bin/env node
/** Actual PG + durable NATS/worker outage drill, only the owned P23 cell. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { DEFAULT_HOME, operatorClient, privateJson, savePrivate } from './api-client.mjs';
import { BASE_URL, PROJECT, validateHome } from './cell.mjs';
import { admitRealRun, waitForRun } from './real-run.mjs';
import { container, dbQuery, docker } from './runtime-tools.mjs';

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function assertFaultPreservation(before,after) {
  assert.deepEqual(after,before,'ARCHIVED_SOURCE_OR_AUTH_CHANGED_DURING_OUTAGE');
}
async function healthy(service) {
  const deadline=Date.now()+45000;
  while(Date.now()<deadline) {
    const state=JSON.parse(docker(['inspect','--format','{{json .State}}',container(service)]));
    if(state.Running && (!state.Health || state.Health.Status==='healthy')) return;
    await sleep(500);
  }
  throw new Error(`OWNED_SERVICE_NOT_RESTORED:${service}`);
}
function immutableSnapshot(seed,userId) {
  return dbQuery(`SELECT
    (SELECT jsonb_build_object('requested',requested_spec_digest,'effective',effective_spec_digest,
      'dataset',dataset_binding_digest,'manifest',manifest_digest,'snapshot',snapshot_id,'work',work_digest)
      FROM research.run_producers WHERE run_id=$1) AS producer,
    (SELECT jsonb_agg(jsonb_build_object('id',artifact_id,'revision',artifact_revision,'manifest',manifest_digest)
      ORDER BY artifact_id,artifact_revision) FROM research.artifacts WHERE run_id=$1) AS artifacts,
    (SELECT jsonb_agg(to_jsonb(e) ORDER BY source_sequence) FROM research.run_progress_events e WHERE run_id=$1) AS source,
    (SELECT jsonb_build_object('user_id',user_id,'username',username,'role',role,'status',status)
      FROM public.portal_users WHERE user_id=$2) AS principal`,[seed.run_id,userId]).rows[0];
}
export async function faultReceipt(home=DEFAULT_HOME,label='process-db-nats') {
  home=validateHome(home);
  assert(/^[a-z][a-z0-9-]{0,40}$/.test(label),'BOUNDED_FAULT_RECEIPT_LABEL_REQUIRED');
  const path=join(home,`fault-${label}.json`);
  assert(!existsSync(path),'INSPECT_PRIOR_FAULT_RECEIPT_DO_NOT_REPEAT');
  const client=await operatorClient(home);
  const seed=privateJson(join(home,'run-integrity-original.json'));
  assert.equal(dbQuery(`SELECT count(*)::int AS n FROM research.jobs
    WHERE state IN ('CLAIMED','RUNNING','CANCEL_REQUESTED')`).rows[0].n,0,'ACTIVE_COMPUTE_MUST_NOT_BE_INTERRUPTED');
  const before=immutableSnapshot(seed,client.user.id);
  const processState=()=>({pid:Number(docker(['inspect','--format','{{.State.Pid}}',container('control-api')]).trim()),
    restarts:Number(docker(['inspect','--format','{{.RestartCount}}',container('control-api')]).trim())});
  const apiBefore=processState();
  const receipt={schema_version:'research.p23-process-db-nats-fault.v1',project:PROJECT,base_url:BASE_URL,
    identity:privateJson(join(home,'identity.json')),started_at_utc:new Date().toISOString(),steps:[],passed:false};
  receipt.diagnostic_only=receipt.identity.dirty;
  const keep=(label,facts)=>{receipt.steps.push({label,at_utc:new Date().toISOString(),...facts});savePrivate(path,receipt);};
  savePrivate(path,receipt);
  try {
    docker(['stop','--time','15',container('portal-postgres')]);
    const started=performance.now();
    const refused=await client.call('GET',`/api/v1/quantbt/runs/${seed.run_id}/report`,undefined,[500,503]);
    const duration=Math.round(performance.now()-started);
    keep('postgres-unavailable-refusal',{response:refused,duration_ms:duration});
    assert(duration<=10000,'DB_OUTAGE_REFUSAL_NOT_BOUNDED');
    assert.equal(typeof refused.body.error?.code,'string','STRUCTURED_DB_REFUSAL_REQUIRED');
    docker(['start',container('portal-postgres')]);await healthy('portal-postgres');
    assert.deepEqual(processState(),apiBefore,'CONTROL_API_RESTARTED_DURING_DB_OUTAGE');
    const identity=await client.call('GET','/api/auth/context');
    assert.equal(identity.body.principal.principalId,client.user.id);
    const restored=await client.call('GET',`/api/v1/quantbt/runs/${seed.run_id}/report`);
    assertFaultPreservation(before,immutableSnapshot(seed,client.user.id));
    keep('postgres-recovered',{identity_status:identity.status,report_status:restored.status,immutable_hash:hash(before)});

    docker(['stop','--time','20',container('quant-worker-py')]);
    const admitted=await admitRealRun(home,'p04',`${label}-run`);
    const run=admitted.receipt;
    const rows=()=>dbQuery(`SELECT p.run_id,p.job_id,p.dispatch_state,j.state,
      j.current_worker_attempt_id,p.requested_spec_digest,p.work_digest
      FROM research.run_producers p JOIN research.jobs j USING(workspace_id,job_id)
      WHERE p.client_intent_id=$1`,[run.client_intent_id]).rows;
    const pending=rows();assert.equal(pending.length,1);assert.equal(pending[0].dispatch_state,'DISPATCHED');
    docker(['stop','--time','15',container('portal-nats')]);
    const replay=await admitted.client.call('POST','/api/v1/research/runs',{
      schema_version:'research.run-create.v1',client_intent_id:run.client_intent_id,
      preflight_token:run.preflight.body.preflight_token,requested_spec:run.requested_spec},[202]);
    assert.equal(replay.body.replayed,true);assert.equal(replay.body.run_id,run.run_id);
    assert.deepEqual(rows(),pending,'SAME_INTENT_CREATED_DUPLICATE_JOB_DURING_NATS_OUTAGE');
    const events=dbQuery(`SELECT count(*)::int AS n FROM research.run_progress_events WHERE run_id=$1`,[run.run_id]);
    assert.equal(events.rows[0].n,0,'STOPPED_WORKER_MUST_NOT_FABRICATE_SOURCE_PROGRESS');
    keep('worker-and-nats-stopped',{run_id:run.run_id,source_events:0,producer_rows:pending,replayed:replay.body.replayed});
    docker(['start',container('portal-nats')]);await healthy('portal-nats');
    docker(['start',container('quant-worker-py')]);await healthy('quant-worker-py');
    await waitForRun(admitted.client,admitted.path,run,180000);
    assert.equal(run.final.body.current.effective_status,'COMPLETED');
    assert.equal(run.final.body.current.terminal_materialization,'READY');
    assert.equal(rows().length,1);
    assertFaultPreservation(before,immutableSnapshot(seed,client.user.id));
    keep('durable-message-resumed-after-nats-worker-restart',{run_id:run.run_id,
      final:run.final,producer_rows:rows(),preserved_archived_hash:hash(before)});
    receipt.completed_run_id=run.run_id;receipt.postgres_refusal_ms=duration;
  } catch(error) {
    keep('failed-drill',{error:String(error.message).slice(0,240)});throw error;
  } finally {
    for(const service of ['portal-postgres','portal-nats','quant-worker-py']) {
      docker(['start',container(service)]);await healthy(service);
    }
  }
  receipt.passed=true;receipt.completed_at_utc=new Date().toISOString();savePrivate(path,receipt);
  console.log(JSON.stringify({passed:true,diagnostic_only:receipt.diagnostic_only,run_id:receipt.completed_run_id,
    postgres_refusal_ms:receipt.postgres_refusal_ms,archived_source_preserved:true,durable_intent_count:1,
    control_api_no_restart:true}));
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  faultReceipt(process.argv.find(a=>a.startsWith('--home='))?.slice(7)??DEFAULT_HOME,
    process.argv.find(a=>a.startsWith('--label='))?.slice(8)??'process-db-nats')
    .catch(error=>{console.error('P23 process/DB/NATS fault refused:',error.message);process.exitCode=1;});
}
