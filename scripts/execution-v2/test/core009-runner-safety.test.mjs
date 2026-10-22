// Offline synthetic guards only: no filesystem writes, credentials, Docker or source calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { parseMissingOnlyMode, parseOfficialRetry75Stderr, assertKnownClosedRetry75,
  assertAdmissionWindow, assertRemoveOnlySettlement, assertSpecimenBudget,
  observeBounded, createBoundedTextCapture, captureFailureAndObserve } from '../core009-runner-safety.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const expectedSha256 = 'a'.repeat(64);
const pending = '{"code":"MANAGER_REVOKE_DRAIN_PENDING"}';
const retry = () => ({ result: { status: 75, signal: null, closed: true, unknown: false },
  dispatch: { sha256: expectedSha256 }, expectedSha256, artifactSha256: expectedSha256,
  stderr: ' Container TEST_ONLY Creating\n' + pending + '\n' });

test('missing-only must be explicit; no implicit restart or extra arguments', () => {
  assert.equal(parseMissingOnlyMode(['--active-revoke-only']), 'ACTIVE_REVOKE_ONLY');
  for (const args of [[], ['--restart'], ['--active-revoke-only', '--active-revoke-only'], undefined])
    assert.throws(() => parseMissingOnlyMode(args), /EXPLICIT_MISSING_ONLY_MODE_REQUIRED/);
});
test('standalone recovery verifies unique typed75 and every original pin', () => {
  assert.deepEqual(assertKnownClosedRetry75(retry()), { same_artifact: true,
    sha256: expectedSha256, code: 'MANAGER_REVOKE_DRAIN_PENDING', physically_closed: true, unknown: false });
});
for (const [name, change] of [
  ['UNKNOWN', { unknown: true }], ['missing unknown', { unknown: undefined }],
  ['signal', { signal: 'SIGTERM' }], ['not physically closed', { closed: false }],
  ['non75', { status: 1 }],
]) test('standalone refuses ' + name, () => {
  const value = retry(); Object.assign(value.result, change);
  assert.throws(() => assertKnownClosedRetry75(value), /KNOWN_PHYSICALLY_CLOSED_RETRY75_REQUIRED/);
});
for (const change of [{ artifactSha256: 'b'.repeat(64) }, { dispatch: {} },
  { expectedSha256: 'bad' }]) test('standalone refuses changed/missing artifact or dispatch ' + JSON.stringify(change), () => {
  assert.throws(() => assertKnownClosedRetry75({ ...retry(), ...change }));
});
for (const stderr of ['', pending + '\n' + pending,
  '{"code":"MANAGER_REVOKE_KEY_CONFLICT"}\n' + pending,
  '{"code":"MANAGER_REVOKE_KEY_CONFLICT","code":"MANAGER_REVOKE_DRAIN_PENDING"}',
  pending + '\ntrailing cleanup', 'x'.repeat(65537),
  '{"code":"MANAGER_REVOKE_DRAIN_PENDING","unknown":false}'])
  test('ambiguous/refused stderr cannot become standalone retry: ' + stderr.slice(0, 90), () => {
    assert.throws(() => assertKnownClosedRetry75({ ...retry(), stderr }));
  });
test('other explicit75 code and CRLF framing are supported', () => {
  assert.equal(parseOfficialRetry75Stderr('Container TEST_ONLY Created\r\n{"code":"MANAGER_REVOKE_RETRY_REQUIRED"}\r\n').code,
    'MANAGER_REVOKE_RETRY_REQUIRED');
});

const grantRevoke = () => ({ schema_version: 'portal.private-owner-manager-revoke.v1',
  target: { workspace_id: 'TEST_ONLY-workspace' }, revocation_id: 'TEST_ONLY-original-revocation',
  items: [{ mode: 'REVOKE', grant_id: 'TEST_ONLY-grant', action: 'stream.subscribe',
    expected_grant_revision: 'TEST_ONLY-revision' }] });
const sessionRevoke = () => ({ schema_version: 'portal.private-owner-acceptance-session-revoke.v1',
  target: { workspace_id: 'TEST_ONLY-workspace' }, user_id: 'TEST_ONLY-user', session_id: 'TEST_ONLY-session',
  token_path: 'TEST_ONLY-private-reference' });
function settlement(change = {}, artifact = grantRevoke()) {
  const artifactBytes = JSON.stringify(artifact), digest = sha(artifactBytes);
  return { operation: 'revoke-stream', artifactBytes, expectedSha256: digest,
    expectedResourceId: 'TEST_ONLY-grant', settlementDeadlineMs: 20000, nowMs: 11000,
    reserveMs: 1000, unknown: false, ...change };
}
test('admission refuses once window closes while exact remove-only cleanup can still be bounded', () => {
  assert.throws(() => assertAdmissionWindow({ nowMs: 11000, startMs: 1000, endMs: 10000, reserveMs: 1000 }),
    /ADMISSION_WINDOW_TOO_SHORT/);
  const result = assertRemoveOnlySettlement(settlement());
  assert.equal(result.remove_only, true); assert.equal(result.remaining_ms, 9000);
});
test('strict admission reserve is enforced with no implicit extension', () => {
  assert.equal(assertAdmissionWindow({ nowMs: 1000, startMs: 1000, endMs: 10000, reserveMs: 1000 }).remaining_ms, 9000);
  for (const nowMs of [999, 9000, 10000])
    assert.throws(() => assertAdmissionWindow({ nowMs, startMs: 1000, endMs: 10000, reserveMs: 1000 }));
});
test('exact READ and exact session removal are permitted, never issuance', () => {
  const artifact = grantRevoke(); artifact.items[0].action = 'business.read_all';
  assert.equal(assertRemoveOnlySettlement(settlement({ operation: 'revoke-read' }, artifact)).operation, 'revoke-read');
  assert.equal(assertRemoveOnlySettlement(settlement({ operation: 'revoke-session',
    expectedResourceId: 'TEST_ONLY-session' }, sessionRevoke())).operation, 'revoke-session');
});
test('recovery requires the original dispatch hash as well as the original artifact', () => {
  const value = settlement({ operation: 'recover-stream' });
  assert.throws(() => assertRemoveOnlySettlement(value), /ORIGINAL_DISPATCH_HASH_REQUIRED/);
  assert.equal(assertRemoveOnlySettlement({ ...value, dispatchSha256: value.expectedSha256 }).operation, 'recover-stream');
});
for (const [name, change] of [
  ['UNKNOWN', { unknown: true }], ['missing known outcome', { unknown: undefined }],
  ['wrong resource', { expectedResourceId: 'TEST_ONLY-other' }],
  ['wrong original artifact', { expectedSha256: 'b'.repeat(64) }],
  ['wrong dispatch', { dispatchSha256: 'b'.repeat(64) }],
  ['exhausted cleanup', { nowMs: 19000 }], ['issue operation', { operation: 'issue-session' }],
]) test('remove-only refuses ' + name, () => {
  assert.throws(() => assertRemoveOnlySettlement(settlement(change)));
});
for (const [name, mutate] of [
  ['grant renewal', a => { a.grants = []; }], ['policy write', a => { a.policy = {}; }],
  ['new TTL', a => { a.ttl_seconds = 300; }],
  ['multiple targets', a => { a.items.push({ ...a.items[0], grant_id: 'TEST_ONLY-other' }); }],
  ['wrong action', a => { a.items[0].action = 'command.submit'; }],
  ['not REVOKE', a => { a.items[0].mode = 'ALLOW'; }],
  ['per-item renewal', a => { a.items[0].valid_until_ms = 99000; }],
]) test('cleanup cannot hide ' + name, () => {
  const artifact = grantRevoke(); mutate(artifact);
  assert.throws(() => assertRemoveOnlySettlement(settlement({}, artifact)));
});

const budget = () => ({ nowMs: 1000, sessionExpiresAtMs: 301000, windowEndMs: 601000,
  sessionStepsMs: { provision: 30000, streamCriticalPath: 30000, denial: 12000, readControl: 12000, cleanup: 10000 },
  streamStepsMs: { bootstrap: 10000, heartbeat: 5000, originalRevoke: 5000, sameIntentRecovery: 5000, close: 5000 },
  settlementReserveMs: 10000 });
test('aggregate reserve covers session and the fixed60 stream without renewing either', () => {
  const result = assertSpecimenBudget(budget());
  assert.equal(result.stream_budget_ms, 30000); assert.equal(result.session_budget_ms, 94000);
  assert.equal(result.stream_remaining_ms, 60000);
});
for (const [name, change] of [
  ['expired session', { sessionExpiresAtMs: 1000 }],
  ['session120s is not enough for a larger aggregate', { sessionExpiresAtMs: 121000,
    sessionStepsMs: { provision: 45000, criticalPath: 45000, controls: 24000 } }],
  ['insufficient window', { windowEndMs: 41000 }],
  ['late original grant', { streamExpiresAtMs: 41000 }],
  ['renewed stream', { streamExpiresAtMs: 62000 }], ['wrong fixedTTL', { streamTtlMs: 120000 }],
  ['session excludes stream path', { sessionStepsMs: { onlyControl: 1000 } }],
  ['optimistic two45s writer calls', { streamStepsMs: { originalRevoke: 45000, recovery: 45000 } }],
  ['missing named bounds', { streamStepsMs: {} }],
]) test('collective clock budget refuses ' + name, () => {
  assert.throws(() => assertSpecimenBudget({ ...budget(), ...change }));
});

test('bounded observation distinguishes success, rejection and stalled close', async () => {
  assert.deepEqual(await observeBounded(() => 12, { timeoutMs: 30 }), { status: 'FULFILLED', value: 12 });
  assert.deepEqual(await observeBounded(() => { throw Error('TEST_ONLY'); }, { timeoutMs: 30 }),
    { status: 'REJECTED', unknown: true });
  assert.deepEqual(await observeBounded(() => new Promise(() => {}), { timeoutMs: 5 }),
    { status: 'TIMED_OUT', unknown: true });
});
test('failure receipt is attempted before census/close and UNKNOWN remains despite successful observations', async () => {
  const calls = [];
  const result = await captureFailureAndObserve({ failureCode: 'TEST_ONLY_FAILURE',
    writeFailure: record => { calls.push('capture'); assert.equal(record.authority_outcome, 'UNKNOWN'); },
    closeObservations: [() => { calls.push('close'); return 'TEST_ONLY-closed'; }],
    censusObservation: () => { calls.push('census'); throw Error('TEST_ONLY-PG-down'); }, timeoutMs: 30 });
  assert.equal(calls[0], 'capture'); assert.equal(result.capture.status, 'FULFILLED');
  assert.equal(result.census.status, 'REJECTED'); assert.equal(result.cleanup_complete, false);
  assert.equal(result.unknown_preserved, true);
});
test('failure capture and subscriber close stalls have finite waits and never fabricate cleanup', async () => {
  const result = await captureFailureAndObserve({ failureCode: 'TEST_ONLY_FAILURE',
    writeFailure: () => new Promise(() => {}), closeObservations: [() => new Promise(() => {})], timeoutMs: 5 });
  assert.equal(result.capture.status, 'TIMED_OUT'); assert.equal(result.closures[0].status, 'TIMED_OUT');
  assert.equal(result.cleanup_complete, false);
});
test('unsafe raw error copy cannot enter failure record', async () => {
  await assert.rejects(captureFailureAndObserve({ failureCode: 'raw text with spaces', writeFailure: () => {} }),
    /PUBLIC_SAFE_FAILURE_CODE_REQUIRED/);
});
test('stdout/stderr capture bounds bytes without throwing inside data callbacks or stopping a writer', () => {
  const capture = createBoundedTextCapture({ maximumBytes: 5 });
  assert.equal(capture.append('abc'), true);
  assert.doesNotThrow(() => { assert.equal(capture.append(Buffer.from('def')), false); });
  assert.equal(capture.append('more data'), false);
  assert.deepEqual(capture.snapshot(), { text: 'abc', bytes: 3, maximum_bytes: 5, overflowed: true, complete: false });
});
test('capture uses UTF8 byte count and copies mutable chunks', () => {
  const capture = createBoundedTextCapture({ maximumBytes: 3 }), chunk = Buffer.from('abc');
  assert.equal(capture.append(chunk), true); chunk.fill(0);
  assert.equal(capture.snapshot().text, 'abc');
  const unicode = createBoundedTextCapture({ maximumBytes: 1 });
  assert.equal(unicode.append('é'), false); assert.equal(unicode.snapshot().bytes, 0);
});
