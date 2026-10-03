import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rollbackOverlay, pauseTemplate, assertRollbackPreservation } from './release-rollback-receipt.mjs';
const image='sha256:66cfd8cfd20f1a8fa156984ed1aad56f321dae0cedcb552b2c89fdb28a31b100';
const path='/home/bobby/.local/state/portal-research-p23/20260927/runtime/rehearsal.template';
test('producer transition pins Python image, keeps compatible readers and pauses gateway only',()=>{
  const overlay=rollbackOverlay(image,path);
  assert.deepEqual(overlay.services['portal-api'],{image:`local/portal-research-p23-retained-portal-api:${image.slice(7)}`,pull_policy:'never'});
  assert.equal(overlay.services['control-api'],undefined);
  assert.equal(overlay.services['quant-worker-py'],undefined);
  assert.equal(overlay.services['portal-web'].volumes[0].source,path);
  assert.equal(overlay.services['portal-web'].volumes[0].read_only,true);
  assert.throws(()=>rollbackOverlay('latest',path),/PINNED_RESEARCH_PRODUCER_IMAGE_REQUIRED/);
  assert.throws(()=>rollbackOverlay(image,'/srv/production'),/OWNED_PAUSE_TEMPLATE_REQUIRED/);
});
test('pause template refuses multiple servers and overlapping exact location',()=>{
  const template='server { location /api/ { proxy_pass http://upstream; } }';
  const paused=pauseTemplate(template);
  assert(paused.includes('location = /api/v1/research/runs'));
  assert(paused.includes('location /api/ { proxy_pass http://upstream; }'));
  assert.throws(()=>pauseTemplate(paused),/EXISTING_EXACT_INTAKE_LOCATION_REFUSED/);
  assert.throws(()=>pauseTemplate(template+template),/EXACT_GATEWAY_SERVER_REQUIRED/);
});
test('rollback cannot hide changed custody, jobs or outside Execution containers',()=>{
  const before={queue:{total:241,active:0},custody_digest:'a'.repeat(64),outside:[{id:'same',restart_count:0}]};
  assertRollbackPreservation(before,structuredClone(before));
  for(const after of [ {...before,custody_digest:'b'.repeat(64)}, {...before,queue:{total:242,active:0}},
    {...before,outside:[{id:'same',restart_count:1}]} ]) {
    assert.throws(()=>assertRollbackPreservation(before,after),/ROLLBACK_DATABASE_CUSTODY_OR_EXECUTION_DRIFT/);
  }
});
