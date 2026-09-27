import assert from 'node:assert/strict';
import { test } from 'node:test';
import { longWfoSpec, assertQueue } from './mixed-workload.mjs';

test('W02 expands only the approved window, never trials/modes/immutable profile caps',()=>{
  const spec=longWfoSpec({alpha_id:'a',alpha_version_id:'av_a'},{release_id:'r',config_digest:'a'.repeat(64)});
  assert.equal(spec.optuna_trials,3);assert.equal(spec.optimization_mode,'mode_1_decay');
  assert.equal(spec.walk_forward.frequency,'weekly');assert.equal(spec.walk_forward.end_exclusive,'2026-09-01T00:00:00Z');
  assert.equal((Date.parse(spec.walk_forward.end_exclusive)-Date.parse(spec.walk_forward.start))/86400000,92);
});
test('queue evidence requires five actual heavy rows, one active and four queued',()=>{
  const rows=Array.from({length:5},(_,i)=>({job_id:`job-${i}`,queue_class:'HEAVY',state:i?'QUEUED':'RUNNING'}));
  assert.equal(assertQueue(rows,5).distinct_heavy_intents_queued,4);
  assert.throws(()=>assertQueue(rows.map(r=>({...r,queue_class:'INTERACTIVE'})),5),/BYPASSED_HEAVY/);
  assert.throws(()=>assertQueue(rows.map(r=>({...r,state:'RUNNING'})),5),/ONE_PRIMARY_HEAVY/);
  assert.throws(()=>assertQueue(rows.map(r=>({...r,job_id:'same-job'})),5),/DISTINCT_DURABLE_JOB_IDS/);
});
