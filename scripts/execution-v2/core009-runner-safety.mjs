// Native08 operator guards. No filesystem, authority, process or network access.
// These checks qualify local scheduling only; they never create a source ACK.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const hashPattern = /^[a-f0-9]{64}$/;
const retryCodes = new Set(['MANAGER_REVOKE_DRAIN_PENDING', 'MANAGER_REVOKE_RETRY_REQUIRED']);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const integer = (value, label, minimum = 0) => {
  assert.ok(Number.isSafeInteger(value) && value >= minimum, label);
  return value;
};
const exactHash = value => {
  assert.ok(typeof value === 'string' && hashPattern.test(value), 'EXACT_ARTIFACT_HASH_REQUIRED');
  return value;
};

export function parseMissingOnlyMode(args) {
  assert.deepEqual(args, ['--active-revoke-only'], 'EXPLICIT_MISSING_ONLY_MODE_REQUIRED');
  return 'ACTIVE_REVOKE_ONLY';
}

export function parseOfficialRetry75Stderr(stderr) {
  assert.ok(typeof stderr === 'string' && Buffer.byteLength(stderr) <= 65536,
    'OFFICIAL_RETRY_STDERR_REQUIRED');
  const lines = stderr.trimEnd().split(/\r?\n/), final = lines.at(-1);
  assert.ok(!lines.slice(0, -1).some(line => /(?:^|[,{])\s*"code"\s*:/.test(line)),
    'AMBIGUOUS_OFFICIAL_RETRY_STDERR');
  let typed;
  try { typed = JSON.parse(final); } catch { throw Error('OFFICIAL_RETRY_STDERR_REQUIRED'); }
  assert.ok(typed && !Array.isArray(typed) && Object.keys(typed).length === 1
    && Object.hasOwn(typed, 'code') && JSON.stringify(typed) === final && retryCodes.has(typed.code),
  'OFFICIAL_RETRY_STDERR_REQUIRED');
  return Object.freeze({ code: typed.code });
}

/** Check this inside the standalone operator immediately before continuation,
 * not just in its caller. Missing/ambiguous evidence never means retryable. */
export function assertKnownClosedRetry75({ result, dispatch, expectedSha256, artifactSha256, stderr }) {
  exactHash(expectedSha256);
  assert.equal(artifactSha256, expectedSha256, 'RECOVERY_ARTIFACT_CHANGED');
  assert.equal(dispatch?.sha256, expectedSha256, 'ORIGINAL_DISPATCH_HASH_REQUIRED');
  assert.ok(result?.status === 75 && result.signal === null && result.closed === true
    && result.unknown === false, 'KNOWN_PHYSICALLY_CLOSED_RETRY75_REQUIRED');
  const typed = parseOfficialRetry75Stderr(stderr);
  return Object.freeze({ same_artifact: true, sha256: expectedSha256, code: typed.code,
    physically_closed: true, unknown: false });
}

export function assertAdmissionWindow({ nowMs = Date.now(), startMs, endMs, reserveMs }) {
  for (const [label, value] of Object.entries({ nowMs, startMs, endMs })) integer(value, label);
  integer(reserveMs, 'ADMISSION_RESERVE_REQUIRED', 1);
  assert.ok(endMs > startMs && nowMs >= startMs && nowMs + reserveMs < endMs,
    'ADMISSION_WINDOW_TOO_SHORT');
  return Object.freeze({ admission_allowed: true, remaining_ms: endMs - nowMs, reserve_ms: reserveMs });
}

/** A separate remove-only deadline may outlive admission/source expiry. It does
 * NOT extend a grant/session, retry UNKNOWN, or bypass the official writer's
 * own source-terminal rules. The caller must keep the exact original artifact.
 * dispatchSha256 is mandatory when continuing a dispatched removal; omit only
 * for the first dispatch of an already-pinned cleanup artifact. */
export function assertRemoveOnlySettlement({ operation, artifactBytes, expectedSha256,
  dispatchSha256, expectedResourceId, settlementDeadlineMs, nowMs = Date.now(),
  reserveMs = 1000, unknown }) {
  assert.equal(unknown, false, 'UNKNOWN_REQUIRES_STATUS_NOT_MUTATION');
  exactHash(expectedSha256);
  assert.ok(Buffer.isBuffer(artifactBytes) || typeof artifactBytes === 'string',
    'EXACT_REMOVAL_ARTIFACT_REQUIRED');
  assert.ok(Buffer.byteLength(artifactBytes) <= 65536, 'REMOVAL_ARTIFACT_TOO_LARGE');
  assert.equal(hash(artifactBytes), expectedSha256, 'REMOVAL_ARTIFACT_CHANGED');
  if (dispatchSha256 !== undefined)
    assert.equal(dispatchSha256, expectedSha256, 'ORIGINAL_DISPATCH_HASH_REQUIRED');
  assert.ok(typeof expectedResourceId === 'string' && expectedResourceId.length > 0,
    'EXACT_REMOVAL_RESOURCE_REQUIRED');
  const artifact = JSON.parse(artifactBytes);
  assert.ok(artifact && typeof artifact === 'object' && !Array.isArray(artifact),
    'EXACT_REMOVAL_ARTIFACT_REQUIRED');
  const manager = operation === 'revoke-read' || operation === 'revoke-stream' || operation === 'recover-stream';
  const allowedKeys = manager
    ? ['schema_version', 'target', 'revocation_id', 'approval_ref', 'reason', 'items', 'provenance_ref']
    : ['schema_version', 'target', 'user_id', 'session_id', 'token_path', 'approval_ref', 'provenance_ref'];
  assert.ok(Object.keys(artifact).every(key => allowedKeys.includes(key)), 'REMOVE_ONLY_NO_AUTHORITY_RENEWAL');
  if (manager) {
    assert.equal(artifact.schema_version, 'portal.private-owner-manager-revoke.v1');
    assert.ok(Array.isArray(artifact.items) && artifact.items.length === 1, 'EXACT_SINGLE_REMOVAL_REQUIRED');
    const item = artifact.items[0];
    assert.ok(item && Object.keys(item).every(key =>
      ['mode', 'grant_id', 'action', 'expected_grant_revision'].includes(key)), 'REMOVE_ONLY_NO_AUTHORITY_RENEWAL');
    assert.equal(item.mode, 'REVOKE');
    assert.equal(item.grant_id, expectedResourceId);
    assert.equal(item.action, operation === 'revoke-read' ? 'business.read_all' : 'stream.subscribe');
    assert.ok(typeof item.expected_grant_revision === 'string' && item.expected_grant_revision.length > 0,
      'EXACT_REMOVAL_REVISION_REQUIRED');
    assert.ok(typeof artifact.revocation_id === 'string' && artifact.revocation_id.length > 0,
      'ORIGINAL_REVOCATION_ID_REQUIRED');
    if (operation === 'recover-stream')
      assert.equal(dispatchSha256, expectedSha256, 'ORIGINAL_DISPATCH_HASH_REQUIRED');
  } else {
    assert.equal(operation, 'revoke-session', 'REMOVE_ONLY_OPERATION_REQUIRED');
    assert.equal(artifact.schema_version, 'portal.private-owner-acceptance-session-revoke.v1');
    assert.equal(artifact.session_id, expectedResourceId);
    assert.ok(typeof artifact.user_id === 'string' && artifact.user_id.length > 0,
      'EXACT_SESSION_USER_REQUIRED');
  }
  integer(nowMs, 'SETTLEMENT_NOW_REQUIRED');
  integer(settlementDeadlineMs, 'EXPLICIT_SETTLEMENT_DEADLINE_REQUIRED');
  integer(reserveMs, 'SETTLEMENT_RESERVE_REQUIRED', 1);
  assert.ok(nowMs + reserveMs < settlementDeadlineMs, 'SETTLEMENT_DEADLINE_EXHAUSTED');
  return Object.freeze({ remove_only: true, operation, resource_id: expectedResourceId,
    artifact_sha256: expectedSha256, remaining_ms: settlementDeadlineMs - nowMs });
}

const sumSteps = (steps, label) => {
  assert.ok(steps && typeof steps === 'object' && !Array.isArray(steps)
    && Object.keys(steps).length > 0, label);
  const total = Object.values(steps).reduce((sum, value) => sum + integer(value, label), 0);
  return integer(total, label, 1);
};

/** Named steps must use actual enforced upper bounds, not desired durations.
 * sessionStepsMs covers the entire remaining path; streamStepsMs covers only
 * the path that must finish before the original fixed STREAM expiry. */
export function assertSpecimenBudget({ nowMs = Date.now(), sessionExpiresAtMs, windowEndMs,
  sessionStepsMs, streamStepsMs, streamExpiresAtMs, streamTtlMs = 60000,
  settlementReserveMs = 10000 }) {
  integer(nowMs, 'SPECIMEN_NOW_REQUIRED');
  integer(sessionExpiresAtMs, 'SESSION_EXPIRY_REQUIRED');
  integer(windowEndMs, 'SOURCE_WINDOW_EXPIRY_REQUIRED');
  assert.equal(streamTtlMs, 60000, 'ORIGINAL_FIXED_STREAM_TTL_REQUIRED');
  integer(settlementReserveMs, 'SETTLEMENT_RESERVE_REQUIRED', 1);
  const sessionMs = sumSteps(sessionStepsMs, 'AGGREGATE_SESSION_STEPS_REQUIRED');
  const streamMs = sumSteps(streamStepsMs, 'AGGREGATE_STREAM_STEPS_REQUIRED');
  assert.ok(sessionMs >= streamMs, 'SESSION_MUST_COVER_STREAM_CRITICAL_PATH');
  const expiry = streamExpiresAtMs === undefined ? nowMs + streamTtlMs
    : integer(streamExpiresAtMs, 'ORIGINAL_STREAM_EXPIRY_REQUIRED');
  assert.ok(expiry <= nowMs + streamTtlMs, 'STREAM_TTL_NOT_EXTENDED');
  assert.ok(nowMs + streamMs + settlementReserveMs < Math.min(expiry, windowEndMs),
    'INSUFFICIENT_ORIGINAL_STREAM_RESERVE');
  assert.ok(nowMs + sessionMs + settlementReserveMs < Math.min(sessionExpiresAtMs, windowEndMs),
    'INSUFFICIENT_AGGREGATE_SESSION_RESERVE');
  return Object.freeze({ session_budget_ms: sessionMs, stream_budget_ms: streamMs,
    settlement_reserve_ms: settlementReserveMs, session_remaining_ms: sessionExpiresAtMs - nowMs,
    stream_remaining_ms: expiry - nowMs });
}

/** Bound observations only. A timeout never kills/retries an official writer
 * and is never classified as a remote EOF or completed cleanup. */
export async function observeBounded(observe, { timeoutMs }) {
  assert.equal(typeof observe, 'function');
  integer(timeoutMs, 'OBSERVATION_TIMEOUT_REQUIRED', 1);
  let timer;
  const timeout = new Promise(resolve => {
    timer = setTimeout(() => resolve(Object.freeze({ status: 'TIMED_OUT', unknown: true })), timeoutMs);
  });
  const observation = Promise.resolve().then(observe).then(
    value => Object.freeze({ status: 'FULFILLED', value }),
    () => Object.freeze({ status: 'REJECTED', unknown: true }),
  );
  try { return await Promise.race([observation, timeout]); }
  finally { clearTimeout(timer); }
}

/** EventEmitter-safe stdout/stderr capture: an oversized chunk is a recorded
 * refusal, never an uncaught callback assertion or permission to kill/retry
 * the still-running official writer. Continue draining pipes after refusal. */
export function createBoundedTextCapture({ maximumBytes = 65536 } = {}) {
  integer(maximumBytes, 'CAPTURE_BYTE_BOUND_REQUIRED', 1);
  const chunks = [];
  let bytes = 0, overflowed = false;
  return Object.freeze({
    append(chunk) {
      if (overflowed) return false;
      const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      if (bytes + value.byteLength > maximumBytes) { overflowed = true; return false; }
      chunks.push(Buffer.from(value)); bytes += value.byteLength;
      return true;
    },
    snapshot() {
      return Object.freeze({ text: Buffer.concat(chunks).toString('utf8'), bytes,
        maximum_bytes: maximumBytes, overflowed, complete: !overflowed });
    },
  });
}

/** Persist the minimum failure record BEFORE optional closure/census waits.
 * Callbacks own their bounded local I/O; this helper issues no revoke, ACK or
 * retry. Even successful observation does not mean authority is settled. */
export async function captureFailureAndObserve({ failureCode, writeFailure,
  closeObservations = [], censusObservation, timeoutMs = 2000 }) {
  assert.ok(typeof failureCode === 'string' && /^[A-Z0-9_]{1,120}$/.test(failureCode),
    'PUBLIC_SAFE_FAILURE_CODE_REQUIRED');
  assert.equal(typeof writeFailure, 'function');
  assert.ok(Array.isArray(closeObservations) && closeObservations.every(value => typeof value === 'function'));
  if (censusObservation !== undefined) assert.equal(typeof censusObservation, 'function');
  const record = Object.freeze({ code: failureCode, authority_outcome: 'UNKNOWN',
    original_custody_preserved: true, cleanup_complete: false });
  const capture = await observeBounded(() => writeFailure(record), { timeoutMs });
  const [closures, census] = await Promise.all([
    Promise.all(closeObservations.map(observe => observeBounded(observe, { timeoutMs }))),
    censusObservation ? observeBounded(censusObservation, { timeoutMs }) : undefined,
  ]);
  return Object.freeze({ record, capture, closures: Object.freeze(closures), census,
    cleanup_complete: false, unknown_preserved: true });
}
