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
