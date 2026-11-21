import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { CORE009_INACTIVE_PINS as P, captureInactiveState, imageOnlyCompose, stageInactiveMapper } from '../core009-inactive-stage.mjs';

// TEST_ONLY fake observations/effects. No Docker, PostgreSQL, source, files,
// private references, credentials, grant/session mutation or network is used.
const NOW = 1_800_000_000_000;
const copy = structuredClone;
const original = { services: { 'control-api': { image: P.old_image, environment: { NEVER_CHANGE: 'yes' },
  volumes: ['unchanged:ro'] }, web: { image: 'TEST_ONLY-web' } }, networks: { original: {} } };
const nextHash = createHash('sha256').update(JSON.stringify(imageOnlyCompose(original))).digest('hex');
function state() {
  return { image: P.old_image, runtime_sha256: P.runtime_sha256, compose_sha256: P.old_compose_sha256,
    schema: { version: P.schema_version, schema_digest: P.schema_digest, migration149_applied: true },
    resources: { nano_cpus: P.nano_cpus, memory_bytes: P.memory_bytes },
    config: { workspace_id: P.workspace_id, environment: 'paper', profile_id: 'PAPER_BINANCE_USDM',
      source_expires_at_ms: NOW - 60_000, installation_expires_at_ms: NOW - 60_000 },
    authority: { effective_read_grants: 0, effective_stream_grants: 0, active_acceptance_sessions: 0 },
    custody: { pending: 0, unresolved: 0, unreconciled: 0, active_native_leases: 0 },
    tables: Object.fromEntries(Array.from({ length: 21 }, (_, n) => [`test_only_${n}`, 'a'.repeat(64)])),
    healthy: true, running: true, pid: 1234, active_children: 0 };
}
function fixture({ initial = () => {}, failInstall = false, afterFailure = () => {}, badStop = false,
  rollbackUnhealthy = false } = {}) {
  const current = state(); initial(current);
  const calls = [], receipts = [];
  let installs = 0;
  const effects = {
    readState: async () => copy(current), readCompose: async () => copy(original),
    preserveReceipt: async r => { receipts.push(copy(r)); },
    gracefulStop: async () => {
      calls.push('stop'); Object.assign(current, { running: false, healthy: false, pid: 0 });
      return { running: false, pid: 0, exit_code: 0, signal: 'SIGTERM', forced: badStop };
    },
    install: async compose => {
      const image = compose.services['control-api'].image;
      calls.push(`install:${image}`); installs++;
      Object.assign(current, { image, compose_sha256: image === P.new_image ? nextHash : P.old_compose_sha256,
        running: true, healthy: true, pid: 1234 + installs });
      if (failInstall && installs === 1) { afterFailure(current); throw Error('PRIVATE_ERROR_MUST_NOT_LEAK'); }
    },
    waitHealthy: async image => { calls.push(`health:${image}`);
      if (rollbackUnhealthy && image === P.old_image) throw Error('TEST_ONLY-unhealthy'); },
  };
  return { effects, current, calls, receipts, run: () => stageInactiveMapper({ effects, nowMs: () => NOW }) };
}

test('inactive install changes only control-api image and preserves21table state, authority and resources', async () => {
  const f = fixture(), result = await f.run();
  assert.equal(result.state, 'INACTIVE_MAPPER_INSTALLED_HEALTHY');
  assert.deepEqual(f.calls, ['stop', `install:${P.new_image}`, `health:${P.new_image}`]);
  assert.equal(f.current.image, P.new_image);
  assert.equal(result.grants_created, false); assert.equal(result.sessions_created, false);
  const next = imageOnlyCompose(original); next.services['control-api'].image = P.old_image;
  assert.deepEqual(next, original);
  assert.equal(f.receipts.at(-1).state, result.state);
});

for (const [label, mutate] of [
  ['wrong image', s => { s.image = 'sha256:' + 'f'.repeat(64); }],
  ['wrong runtime hash', s => { s.runtime_sha256 = 'f'.repeat(64); }],
  ['wrong compose hash', s => { s.compose_sha256 = 'f'.repeat(64); }],
  ['wrong schema', s => { s.schema.schema_digest = 'f'.repeat(64); }],
  ['missing149', s => { s.schema.migration149_applied = false; }],
  ['oversized CPU', s => { s.resources.nano_cpus++; }],
  ['source still active', s => { s.config.source_expires_at_ms = NOW + 1; }],
  ['scope still active', s => { s.config.installation_expires_at_ms = NOW + 1; }],
  ['wrong workspace', s => { s.config.workspace_id = 'TEST_ONLY-not-Research'; }],
  ['wrong environment', s => { s.config.environment = 'live'; }],
  ['READ grant', s => { s.authority.effective_read_grants = 1; }],
  ['STREAM grant', s => { s.authority.effective_stream_grants = 1; }],
  ['acceptance session', s => { s.authority.active_acceptance_sessions = 1; }],
  ['pending mutation', s => { s.custody.pending = 1; }],
  ['UNKNOWN custody', s => { s.custody.unresolved = 1; }],
  ['unreconciled custody', s => { s.custody.unreconciled = 1; }],
  ['active native lease', s => { s.custody.active_native_leases = 1; }],
  ['active child', s => { s.active_children = 1; }],
  ['missing table', s => { delete s.tables.test_only_0; }],
  ['invalid table digest', s => { s.tables.test_only_0 = 'not-a-hash'; }],
  ['unhealthy baseline', s => { s.healthy = false; }],
  ['unknown process state', s => { delete s.running; }],
]) test(`refuses ${label} before any runtime mutation`, async () => {
  const f = fixture({ initial: mutate });
  await assert.rejects(f.run(), error => { assert.equal(error.receipt.state, 'PREFLIGHT_REFUSED'); return true; });
  assert.deepEqual(f.calls, []);
});

test('failed install restores exact old image/compose only after settled immutable readback and verifies health', async () => {
  const f = fixture({ failInstall: true });
  await assert.rejects(f.run(), error => {
    assert.equal(error.code, 'INACTIVE_STAGE_EFFECT_FAILED'); assert.equal(error.receipt.state, 'ROLLBACK_HEALTHY');
    assert.ok(!JSON.stringify(error.receipt).includes('PRIVATE_ERROR_MUST_NOT_LEAK')); return true;
  });
  assert.deepEqual(f.calls, ['stop', `install:${P.new_image}`, 'stop', `install:${P.old_image}`, `health:${P.old_image}`]);
  assert.equal(f.current.image, P.old_image);
});
for (const [label, mutate] of [
  ['new UNKNOWN custody', s => { s.custody.unresolved = 1; }],
  ['immutable rows changed', s => { s.tables.test_only_4 = 'b'.repeat(64); }],
  ['unknown image', s => { s.image = 'sha256:' + 'c'.repeat(64); }],
  ['unknown config', s => { s.runtime_sha256 = 'd'.repeat(64); }],
  ['new authority', s => { s.authority.effective_read_grants = 1; }],
]) test(`failed install with ${label} preserves failure and refuses unsafe rollback`, async () => {
  const f = fixture({ failInstall: true, afterFailure: mutate });
  await assert.rejects(f.run(), error => { assert.equal(error.receipt.state, 'NOT_SAFE_OR_NOT_CONFIRMED_ROLLBACK'); return true; });
  assert.deepEqual(f.calls, ['stop', `install:${P.new_image}`]);
});
test('SIGKILL/forced stop never permits candidate install or unsafe second stop', async () => {
  const f = fixture({ badStop: true });
  await assert.rejects(f.run(), error => {
    // A reported force-stop is never reinterpreted as a genuine graceful drain.
    assert.equal(error.code, 'INACTIVE_STAGE_GRACEFUL_STOP_UNPROVEN');
    assert.equal(error.receipt.state, 'NOT_SAFE_OR_NOT_CONFIRMED_ROLLBACK'); return true;
  });
  assert.deepEqual(f.calls, ['stop']);
});
test('unhealthy rollback is never reported healthy', async () => {
  const f = fixture({ failInstall: true, rollbackUnhealthy: true });
  await assert.rejects(f.run(), error => { assert.equal(error.receipt.state, 'NOT_SAFE_OR_NOT_CONFIRMED_ROLLBACK'); return true; });
  assert.equal(f.receipts.at(-1).state, 'NOT_SAFE_OR_NOT_CONFIRMED_ROLLBACK');
});
test('missing effect does not mutate or silently treat incomplete observations as zero', async () => {
  await assert.rejects(stageInactiveMapper({ effects: {} }), /INACTIVE_STAGE_EFFECTS_REQUIRED/);
  const s = state(); delete s.custody.active_native_leases;
  assert.throws(() => captureInactiveState(s, { nowMs: NOW }), /INACTIVE_STAGE_UNSETTLED/);
});

const imagePins = () => ({old_image:P.new_image,new_image:'sha256:'+'e'.repeat(64),old_compose_sha256:'f'.repeat(64)});
function qualifiedImageFixture(pins, {failInstall=false, afterFailure=()=>{}, afterFirstRead=()=>{}} = {}) {
  const captured=copy(pins), compose=copy(original), current=state(), calls=[], receipts=[];
  compose.services['control-api'].image=captured.old_image;
  Object.assign(current,{image:captured.old_image,compose_sha256:captured.old_compose_sha256});
  const next=imageOnlyCompose(compose,{pins:captured}), candidateHash=createHash('sha256').update(JSON.stringify(next)).digest('hex');
  let reads=0,installs=0;
  const effects={readState:async()=>{const s=copy(current);if(reads++===0)afterFirstRead();return s;},readCompose:async()=>copy(compose),
    preserveReceipt:async receipt=>receipts.push(copy(receipt)),
    gracefulStop:async()=>{calls.push('stop');Object.assign(current,{running:false,healthy:false,pid:0});
      return{running:false,pid:0,exit_code:0,signal:'SIGTERM',forced:false};},
    install:async value=>{const image=value.services['control-api'].image;calls.push(image);installs++;
      Object.assign(current,{image,compose_sha256:image===captured.new_image?candidateHash:captured.old_compose_sha256,running:true,healthy:true,pid:2000+installs});
      if(failInstall&&installs===1){afterFailure(current);throw Error('TEST_ONLY failed qualified-image install');}},
    waitHealthy:async image=>calls.push('healthy:'+image)};
  return{current,calls,receipts,effects,run:()=>stageInactiveMapper({effects,nowMs:()=>NOW,pins})};
}

test('explicit qualified image pair changes only image and keeps complete inactive envelope', async()=>{
  const pins=imagePins(), f=qualifiedImageFixture(pins), receipt=await f.run();
  assert.equal(receipt.state,'INACTIVE_MAPPER_INSTALLED_HEALTHY');
  assert.deepEqual(receipt.pins,{...P,...pins});
  assert.deepEqual(f.calls,['stop',pins.new_image,'healthy:'+pins.new_image]);
  for(const key of ['runtime_sha256','schema_version','schema_digest','nano_cpus','memory_bytes','workspace_id'])
    assert.equal(receipt.pins[key],P[key]);
  assert.equal(f.current.runtime_sha256,P.runtime_sha256);
  assert.deepEqual(f.current.authority,{effective_read_grants:0,effective_stream_grants:0,active_acceptance_sessions:0});
  assert.deepEqual(f.current.custody,{pending:0,unresolved:0,unreconciled:0,active_native_leases:0});
});

test('operator pins refuse extra authority/config/resource keys, malformed pairs, inherited/getter values',async()=>{
  const calls=[];
  for(const pins of [null,{},[],{...imagePins(),new_image:P.new_image},{...imagePins(),new_image:'latest'},
    {...imagePins(),old_image:'sha256:'+'g'.repeat(64)},{...imagePins(),old_compose_sha256:'f'.repeat(64)+'\n'},
    {...imagePins(),runtime_sha256:'a'.repeat(64)},{...imagePins(),memory_bytes:2**32},
    Object.create(imagePins()),Object.defineProperty({...imagePins()},'new_image',{get(){throw Error('MUST_NOT_CALL_GETTER');}})]){
    await assert.rejects(stageInactiveMapper({pins,effects:{readState:async()=>calls.push('read')}}),/INACTIVE_STAGE_INSTALL_PINS_INVALID/);
    assert.throws(()=>imageOnlyCompose(original,{pins}),/INACTIVE_STAGE_INSTALL_PINS_INVALID/);
  }
  assert.deepEqual(calls,[]);
});

test('qualified image compose refuses another starting image',()=>{
  assert.throws(()=>imageOnlyCompose(original,{pins:imagePins()}),/INACTIVE_STAGE_COMPOSE_INVALID/);
});

test('qualified image failure rolls back original exact new baseline pair, not historical a96',async()=>{
  const pins=imagePins(),f=qualifiedImageFixture(pins,{failInstall:true});
  await assert.rejects(f.run(),error=>{assert.equal(error.receipt.state,'ROLLBACK_HEALTHY');return true;});
  assert.equal(f.current.image,pins.old_image);
  assert.equal(f.current.compose_sha256,pins.old_compose_sha256);
  assert.deepEqual(f.calls,['stop',pins.new_image,'stop',pins.old_image,'healthy:'+pins.old_image]);
});

test('qualified image failure with new UNKNOWN never rolls back or clears custody',async()=>{
  const f=qualifiedImageFixture(imagePins(),{failInstall:true,afterFailure:s=>{s.custody.unresolved=1;}});
  await assert.rejects(f.run(),error=>{assert.equal(error.receipt.state,'NOT_SAFE_OR_NOT_CONFIRMED_ROLLBACK');return true;});
  assert.equal(f.current.custody.unresolved,1);
  assert.equal(f.calls.filter(x=>x==='stop').length,1);
});

test('qualified image pins are captured before asynchronous effects',async()=>{
  const pins=imagePins(),expected=copy(pins),f=qualifiedImageFixture(pins,{afterFirstRead:()=>{pins.new_image='sha256:'+'d'.repeat(64);}});
  const receipt=await f.run();
  assert.equal(f.current.image,expected.new_image);assert.equal(receipt.pins.new_image,expected.new_image);
});
