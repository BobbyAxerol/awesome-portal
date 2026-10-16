#!/usr/bin/env node
/** Offline evidence eligibility only. The caller supplies independently reviewed
 * selection/approval pins; JSON qualification strings confer no authority. */
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';

export const REQUIREMENTS = Object.freeze({
  qualified_source: 'SOURCE_EVIDENCE_NOT_QUALIFIED', trust_adapter: 'ADAPTER_NOT_INSTALLED',
  writer: 'WRITER_NOT_MOUNTED', score_publication: 'SCORE_PUBLICATION_NOT_IMPLEMENTED',
  calibration: 'APPROVED_CALIBRATION_MISSING', budgets: 'APPROVED_BUDGETS_MISSING',
  source_window: 'SOURCE_WINDOW_NOT_ALLOCATED', coexistence: 'COEXISTENCE_NOT_MEASURED',
  consumer: 'CONSUMER_NOT_IMPLEMENTED',
});
const APPROVAL_REQUIRED = new Set(['calibration', 'budgets', 'source_window']);
// Edge EPG10-01 group vocabulary, not a new Portal SLO/budget contract.
export const BUDGET_GROUPS = Object.freeze(['B-TS-CPU', 'B-TS-RAM', 'B-TS-DB', 'B-TS-IO',
  'B-TRADE', 'B-RS', 'B-FRESH', 'B-REVOKE', 'B-RECOVERY', 'B-CMD', 'B-HISTORY', 'B-DL', 'B-EDGE', 'B-ANALYTICS']);
const HASH = /^sha256:[a-f0-9]{64}$/;
const SHA = /^[a-f0-9]{40}$/;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const integer = value => Number.isSafeInteger(value) && value >= 0;
const canonical = value => JSON.stringify(object(value)
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, JSON.parse(canonical(value[key]))]))
  : Array.isArray(value) ? value.map(item => JSON.parse(canonical(item))) : value);
export const sha256 = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const safePath = path => nonempty(path) && !isAbsolute(path) && !path.split(/[\\/]/).some(part => part === '..');
function validSelection(s) {
  return object(s) && Object.keys(s).sort().join(',') ===
    'catalogue_sha256,dependency_hashes,environment,profile_id,schema_sha256,source_commit,workspace_id'
    && nonempty(s.workspace_id) && ['paper', 'sandbox', 'live'].includes(s.environment)
    && nonempty(s.profile_id) && HASH.test(s.catalogue_sha256) && HASH.test(s.schema_sha256)
    && SHA.test(s.source_commit) && object(s.dependency_hashes)
    && Object.keys(s.dependency_hashes).length > 0
    && Object.entries(s.dependency_hashes).every(([path, hash]) => safePath(path) && HASH.test(hash));
}
function validBudgets(rows) {
  const finite = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  // Checks all14 groups structurally. Nonempty metric rows are NOT proof that
  // every source metric was measured, or that measurements satisfy capacity.
  return Array.isArray(rows) && rows.length === BUDGET_GROUPS.length
    && new Set(rows.map(row => row?.id)).size === rows.length
    && rows.every(row => object(row) && BUDGET_GROUPS.includes(row.id) && nonempty(row.approval_ref)
      && Array.isArray(row.metrics) && row.metrics.length > 0
      && new Set(row.metrics.map(metric => metric?.id)).size === row.metrics.length
      && row.metrics.every(metric => object(metric) && nonempty(metric.id) && nonempty(metric.unit)
        && nonempty(metric.bound_kind) && finite(metric.baseline) && finite(metric.approved_bound)));
}
function readPinned(pointer, readArtifact) {
  if (!object(pointer) || !safePath(pointer.path) || !HASH.test(pointer.sha256)) throw new Error('ARTIFACT_POINTER_INVALID');
  const bytes = readArtifact(pointer.path);
  if (!(typeof bytes === 'string' || Buffer.isBuffer(bytes) || bytes instanceof Uint8Array)) throw new Error('ARTIFACT_BYTES_REQUIRED');
  if (Buffer.byteLength(bytes) > 2 * 1024 * 1024) throw new Error('ARTIFACT_TOO_LARGE');
  if (sha256(bytes) !== pointer.sha256) throw new Error('ARTIFACT_DIGEST_MISMATCH');
  return JSON.parse(Buffer.from(bytes).toString('utf8'));
}

/** No writes/network/Git, no default age/SLO or implied production approval.
 * readArtifact returns offline file bytes; approvalPins is a separate trusted
 * reviewer input, never taken from an evidence record's own approval_ref.
 * selection.source_commit identifies the selected PRODUCER, not this audit's
 * current Git HEAD. Docs/tooling-only commits do not invalidate unchanged
 * component receipts; actual dependency bytes and selected pins control reuse. */
export function assessQualification(input, { readArtifact, approvalPins, nowMs, maximumAgeMs } = {}) {
  const blockers = [];
  const add = (requirement, reason) => blockers.push({ requirement, reason });
  const invalid = !object(input) || input.schema_version !== 'portal.elp2-10.qualification-input.v1'
    || !validSelection(input.selection) || !object(input.records) || typeof readArtifact !== 'function'
    || !integer(nowMs) || !Number.isSafeInteger(maximumAgeMs) || maximumAgeMs <= 0;
  if (invalid) add('manifest', 'MANIFEST_OR_REVIEW_BOUNDARY_INVALID');
  else {
    for (const [path, expected] of Object.entries(input.selection.dependency_hashes)) {
      try { if (sha256(readArtifact(path)) !== expected) add('manifest', 'DEPENDENCY_DIGEST_MISMATCH'); }
      catch { add('manifest', 'DEPENDENCY_ARTIFACT_UNREADABLE'); }
    }
    if (Object.keys(input.records).some(key => !Object.hasOwn(REQUIREMENTS, key))) add('manifest', 'UNKNOWN_REQUIREMENT');
    for (const [kind, missing] of Object.entries(REQUIREMENTS)) {
      const record = input.records[kind];
      if (!record?.artifact) { add(kind, missing); continue; }
      try {
        const evidence = readPinned(record.artifact, readArtifact);
        if (!object(evidence) || evidence.schema_version !== 'portal.elp2-10.qualification-evidence.v1'
          || evidence.kind !== kind || evidence.status !== 'PASS') { add(kind, 'EVIDENCE_NOT_PASS'); continue; }
        if (evidence.evidence_class !== 'RUNTIME_VERIFIED' || evidence.qualification === 'TEST_ONLY'
          || evidence.test_only === true || evidence.synthetic === true || evidence.fixture === true) {
          add(kind, 'NON_RUNTIME_EVIDENCE'); continue;
        }
        if (!validSelection(evidence.selection) || canonical(evidence.selection) !== canonical(input.selection)) {
          add(kind, 'SELECTION_OR_DEPENDENCY_PIN_MISMATCH'); continue;
        }
        if (!integer(evidence.observed_at_ms) || evidence.observed_at_ms > nowMs) { add(kind, 'OBSERVATION_INVALID_OR_FUTURE'); continue; }
        if (nowMs - evidence.observed_at_ms > maximumAgeMs) { add(kind, 'EVIDENCE_TOO_OLD'); continue; }
        if (APPROVAL_REQUIRED.has(kind)) {
          const pin = approvalPins?.[kind];
          if (evidence.approval_state !== 'APPROVED' || !object(pin) || pin.artifact_sha256 !== record.artifact.sha256 || !nonempty(pin.approval_id)
            || pin.approval_id !== evidence.approval_id) { add(kind, 'INDEPENDENT_APPROVAL_PIN_REQUIRED'); continue; }
        }
        if (kind === 'budgets') {
          if (!validBudgets(evidence.budgets)) add(kind, 'EDGE_APPROVED_BUDGET_GROUPS_REQUIRED');
        }
        if (kind === 'source_window') {
          if (!object(evidence.window) || !integer(evidence.window.starts_at_ms) || !integer(evidence.window.ends_at_ms)
            || evidence.window.starts_at_ms > nowMs || evidence.window.ends_at_ms <= nowMs
            || evidence.window.starts_at_ms >= evidence.window.ends_at_ms) add(kind, 'SOURCE_WINDOW_NOT_CURRENT');
        }
      } catch (error) {
        add(kind, ['ARTIFACT_POINTER_INVALID', 'ARTIFACT_BYTES_REQUIRED', 'ARTIFACT_TOO_LARGE', 'ARTIFACT_DIGEST_MISMATCH'].includes(error?.message)
          ? error.message : 'ARTIFACT_UNREADABLE_OR_INVALID_JSON');
      }
    }
  }
  return { schema_version: 'portal.elp2-10.qualification-readiness.v1',
    verdict: blockers.length ? 'BLOCKED' : 'READY_FOR_MEASUREMENT_REVIEW',
    runtime_authorized: false, full_phase_pass: false, capacity_certified: false, blockers };
}

function cli() {
  const args = process.argv.slice(2), flags = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--input', '--root', '--approval-pins', '--approval-pins-sha256', '--now-ms', '--max-age-ms'].includes(args[i])
      || !args[i + 1] || Object.hasOwn(flags, args[i])) throw new Error('EXPLICIT_ARGUMENTS_REQUIRED');
    flags[args[i]] = args[i + 1];
  }
  if (!flags['--input'] || !flags['--root'] || !flags['--now-ms'] || !flags['--max-age-ms']) throw new Error('EXPLICIT_ARGUMENTS_REQUIRED');
  const root = realpathSync(flags['--root']);
  const readArtifact = path => {
    if (!safePath(path)) throw new Error('RELATIVE_ARTIFACT_PATH_REQUIRED');
    const target = realpathSync(resolve(root, path)), rel = relative(root, target);
    if (isAbsolute(rel) || rel === '..' || rel.startsWith('../') || statSync(target).size > 2 * 1024 * 1024) throw new Error('ARTIFACT_OUTSIDE_ROOT_OR_TOO_LARGE');
    return readFileSync(target);
  };
  const input = JSON.parse(readArtifact(flags['--input']).toString('utf8'));
  let approvalPins = {};
  if (flags['--approval-pins'] || flags['--approval-pins-sha256']) {
    approvalPins = readPinned({ path: flags['--approval-pins'], sha256: flags['--approval-pins-sha256'] }, readArtifact);
  }
  const result = assessQualification(input, { readArtifact, approvalPins,
    nowMs: Number(flags['--now-ms']), maximumAgeMs: Number(flags['--max-age-ms']) });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.verdict === 'BLOCKED' ? 2 : 0;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { cli(); } catch { process.stderr.write('QUALIFICATION_INPUT_REJECTED\n'); process.exitCode = 2; }
}
