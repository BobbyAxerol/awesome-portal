import assert from 'node:assert/strict';
import { test } from 'node:test';
import { longWfoSpec, assertQueue, candidateDrift, reuseExactPreflight } from './mixed-workload.mjs';

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
test('same-actor workload reuses only an accepted preflight for the identical immutable spec', () => {
  const spec = longWfoSpec({ alpha_id: 'a', alpha_version_id: 'av_a' },
    { release_id: 'r', config_digest: 'a'.repeat(64) });
  const accepted = { requested_spec: spec, preflight: { status: 201, body: { may_create_run: true } } };
  assert.equal(reuseExactPreflight(accepted, structuredClone(spec)), accepted.preflight);
  assert.throws(() => reuseExactPreflight(accepted, { ...spec, random_seed: 123 }),
    /PREFLIGHT_REUSE_REQUIRES_IDENTICAL_SPEC/);
  assert.throws(() => reuseExactPreflight({ ...accepted, preflight: { status: 201, body: { may_create_run: false } } }, spec),
    /ACCEPTED_SAME_ACTOR_PREFLIGHT_REQUIRED/);
  assert.throws(() => reuseExactPreflight({ ...accepted, preflight: { status: 503 } }, spec));
});
test('workload evidence is diagnostic on source/image drift, never falsely official',()=>{
  const images = Object.fromEntries(Array.from({length:7},(_,i)=>[`service-${i}`,
    {container_id:`container-${i}`,image_id:`image-${i}`} ]));
  const identity={candidate_source_sha:'a'.repeat(40),dirty:false,images};
  const current=Object.fromEntries(Object.entries(images).map(([service,image])=>[service,{...image}]));
  assert.deepEqual(candidateDrift(identity,'a'.repeat(40),false,current),[]);
  assert(candidateDrift(identity,'b'.repeat(40),false,current).includes('SOURCE_COMMIT_DRIFT'));
  assert(candidateDrift(identity,'a'.repeat(40),true,current).includes('SOURCE_DIRTY'));
  current['service-0'].image_id='other';
  assert(candidateDrift(identity,'a'.repeat(40),false,current).includes('IMAGE_DRIFT:service-0'));
  current['service-1'].container_id='other';
  assert(candidateDrift(identity,'a'.repeat(40),false,current).includes('CONTAINER_DRIFT:service-1'));
});
