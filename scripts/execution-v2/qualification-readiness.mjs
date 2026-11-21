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
const HASH = /^sha256:[a-f0-9]{64}$(?![\s\S])/;
const SHA = /^[a-f0-9]{40}$(?![\s\S])/;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const integer = value => Number.isSafeInteger(value) && value >= 0;
const finite = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const shape = (value, required, optional = []) => object(value)
  && required.every(key => Object.hasOwn(value, key))
  && Object.keys(value).every(key => required.includes(key) || optional.includes(key));
const equal = (left, right) => canonical(left) === canonical(right);
const BOUND_KINDS = new Set(['MAX_ABSOLUTE', 'MIN_ABSOLUTE', 'MAX_DELTA', 'MAX_RATIO']);
// Edge01 measurement-plan.json:76–126 currently names composite policies but
// supplies no approved scalar decomposition. Recognize, never flatten, those
// policies. A soft/high/hard/action policy is not one MAX_ABSOLUTE number.
const COMPOSITE_SOURCE_BOUNDS = new Set(['MAX_ABSOLUTE_AND_DELTA', 'MAX_NONREGRESSION',
  'MAX_WITH_OTHER_WORKLOAD_RESERVE', 'MAX_ABSOLUTE_ZERO_UNAUTHORIZED', 'MAX_BACKLOG_WITH_OUTAGE_RESERVE',
  'MAX_PER_STATE_NO_FALSE_SUCCESS', 'MAX_WITH_FULL_CONTINUATION', 'ORIGINAL_GATE_AND_NONREGRESSION',
  'NONREGRESSION', 'MAX_WITH_DL_RESERVE', 'SOFT_HIGH_HARD_AND_ACTIONS',
  'MAX_FAIR_NO_DELTA_STARVATION', 'MAX_AT_APPROVED_CADENCE']);
export const SCORE_VALIDATOR_PATHS = Object.freeze([
  'apps/control-api/src/execution-v2/manager-score-runtime.ts',
  'apps/control-api/src/execution-v2/manager-score.ts',
  'apps/control-api/src/research/exact-decimal.ts',
  'apps/control-api/package-lock.json',
]);
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
function validBudgetRows(rows) {
  return Array.isArray(rows) && rows.length === BUDGET_GROUPS.length
    && new Set(rows.map(row => row?.id)).size === rows.length
    && rows.every(row => object(row) && BUDGET_GROUPS.includes(row.id) && nonempty(row.approval_ref)
      && Array.isArray(row.metrics) && row.metrics.length > 0 && row.metrics.length <= 128
      && new Set(row.metrics.map(metric => metric?.id)).size === row.metrics.length
      && row.metrics.every(metric => object(metric) && nonempty(metric.id) && nonempty(metric.unit)
        && BOUND_KINDS.has(metric.bound_kind) && finite(metric.baseline) && finite(metric.approved_bound)));
}
function readPinned(pointer, readArtifact, maximumBytes = 2 * 1024 * 1024) {
  if (!shape(pointer, ['path', 'sha256']) || !safePath(pointer.path) || !HASH.test(pointer.sha256)) throw new Error('ARTIFACT_POINTER_INVALID');
  const bytes = readArtifact(pointer.path);
  if (!(typeof bytes === 'string' || Buffer.isBuffer(bytes) || bytes instanceof Uint8Array)) throw new Error('ARTIFACT_BYTES_REQUIRED');
  if (Buffer.byteLength(bytes) > maximumBytes) throw new Error('ARTIFACT_TOO_LARGE');
  if (sha256(bytes) !== pointer.sha256) throw new Error('ARTIFACT_DIGEST_MISMATCH');
  return JSON.parse(Buffer.from(bytes).toString('utf8'));
}

function nonRuntime(value) {
  return !object(value) || value.evidence_class !== 'RUNTIME_VERIFIED'
    || typeof value.qualification === 'string' && /TEST_ONLY|SYNTHETIC|FIXTURE/.test(value.qualification)
    || ['test_only', 'synthetic', 'fixture', 'tainted_for_capacity'].some(key => value[key] === true);
}
function currentApproval(evidence, pin, artifact, selectionHash, nowMs) {
  if (evidence.approval_state !== 'APPROVED' || !object(pin)
    || pin.artifact_sha256 !== artifact.sha256 || !nonempty(pin.approval_id)
    || pin.approval_id !== evidence.approval_id) return 'INDEPENDENT_APPROVAL_PIN_REQUIRED';
  if (!nonempty(pin.approval_revision) || pin.approval_revision !== evidence.approval_revision
    || pin.selection_sha256 !== selectionHash || !integer(pin.approved_at_ms) || !integer(pin.valid_until_ms)
    || pin.approved_at_ms !== evidence.approved_at_ms || pin.valid_until_ms !== evidence.valid_until_ms
    || pin.approved_at_ms > nowMs || pin.valid_until_ms <= nowMs || pin.valid_until_ms <= pin.approved_at_ms)
    return 'APPROVAL_NOT_CURRENT_OR_REVISION_MISMATCH';
  return null;
}
function approvedBudgetCatalogue(evidence, pin, selectionHash, readArtifact) {
  if (!evidence.metric_catalogue || !HASH.test(pin?.metric_catalogue_sha256)
    || pin.metric_catalogue_sha256 !== evidence.metric_catalogue.sha256 || !nonempty(pin.metric_catalogue_revision)) return null;
  const catalogue = readPinned(evidence.metric_catalogue, readArtifact);
  if (!shape(catalogue, ['schema_version', 'selection_sha256', 'revision', 'groups'])
    || catalogue.schema_version !== 'portal.elp2-10.budget-metric-catalogue.v1'
    || catalogue.selection_sha256 !== selectionHash || catalogue.revision !== pin.metric_catalogue_revision
    || !Array.isArray(catalogue.groups) || catalogue.groups.length !== BUDGET_GROUPS.length
    || new Set(catalogue.groups.map(group => group?.id)).size !== BUDGET_GROUPS.length) return null;
  const definitions = new Map();
  for (const group of catalogue.groups) {
    if (!shape(group, ['id', 'metrics']) || !BUDGET_GROUPS.includes(group.id) || !Array.isArray(group.metrics)
      || !group.metrics.length || group.metrics.length > 128
      || new Set(group.metrics.map(metric => metric?.id)).size !== group.metrics.length) return null;
    for (const metric of group.metrics) {
      if (!shape(metric, ['id', 'unit', 'bound_kind']) || !nonempty(metric.id) || !nonempty(metric.unit)
        || !BOUND_KINDS.has(metric.bound_kind)) return null;
      definitions.set(`${group.id}/${metric.id}`, metric);
    }
  }
  if (!validBudgetRows(evidence.budgets)) return null;
  const actual = new Set();
  for (const group of evidence.budgets) for (const metric of group.metrics) {
    const key = `${group.id}/${metric.id}`, expected = definitions.get(key);
    if (!expected || metric.unit !== expected.unit || metric.bound_kind !== expected.bound_kind) return null;
    actual.add(key);
  }
  return actual.size === definitions.size ? definitions : null;
}

/** Reuse a reviewed receipt from the existing canonical runtime loader. This
 * offline MJS tool does not implement or re-run the TS calculator. The trusted
 * reviewer separately pins policy bytes, approval bytes and validation receipt;
 * a self-reported READY, or a receipt built against different validator bytes,
 * cannot establish eligibility. This remains evidence intake, not authority. */
function validCalibration(evidence, pin, selection, selectionHash, readArtifact, nowMs, maximumAgeMs) {
  const c = evidence.calibration;
  if (!shape(c, ['policy_artifact', 'runtime_approval', 'loader_receipt'])) return false;
  for (const [field, pinField] of [['policy_artifact', 'policy_artifact_sha256'],
    ['runtime_approval', 'runtime_approval_sha256'], ['loader_receipt', 'loader_receipt_sha256']])
    if (!HASH.test(pin?.[pinField]) || c[field]?.sha256 !== pin[pinField]) return false;
  const artifact = readPinned(c.policy_artifact, readArtifact, 65_536);
  const approval = readPinned(c.runtime_approval, readArtifact, 65_536);
  const receipt = readPinned(c.loader_receipt, readArtifact, 65_536);
  const scope = { workspace_id: selection.workspace_id, environment: selection.environment,
    profile_id: selection.profile_id, catalogue_digest: selection.catalogue_sha256 };
  if (!shape(artifact, ['schema_version', 'scope', 'policy', 'runtime_config'])
    || artifact.schema_version !== 'portal.execution.manager-score-policy-runtime.v1'
    || !object(artifact.policy) || !object(artifact.runtime_config) || !equal(artifact.scope, scope)
    || artifact.policy.qualification !== 'RUNTIME_APPROVED' || !object(approval)
    || !equal(approval.scope, scope) || approval.artifact_sha256 !== c.policy_artifact.sha256
    || !nonempty(approval.approval_ref) || !integer(approval.approved_at_ms) || !integer(approval.valid_until_ms)
    || approval.approved_at_ms > nowMs || approval.valid_until_ms <= nowMs) return false;
  if (!shape(receipt, ['schema_version', 'status', 'evidence_class', 'selection_sha256', 'scope',
    'policy_artifact_sha256', 'runtime_approval_sha256', 'validator_dependencies', 'validated_at_ms',
    'policy_id', 'policy_hash', 'formula_hash', 'approved_policy_id', 'policy_revision', 'approval_ref',
    'approved_at_ms', 'valid_until_ms'])
    || receipt.schema_version !== 'portal.elp2-10.manager-score-policy-validation.v1' || receipt.status !== 'READY'
    || nonRuntime(receipt) || receipt.selection_sha256 !== selectionHash || !equal(receipt.scope, scope)
    || receipt.policy_artifact_sha256 !== c.policy_artifact.sha256 || receipt.runtime_approval_sha256 !== c.runtime_approval.sha256
    || !integer(receipt.validated_at_ms) || receipt.validated_at_ms < approval.approved_at_ms
    || receipt.validated_at_ms > evidence.observed_at_ms || receipt.validated_at_ms > nowMs
    || nowMs - receipt.validated_at_ms > maximumAgeMs || !object(receipt.validator_dependencies)
    || !object(pin.validator_dependencies) || !equal(receipt.validator_dependencies, pin.validator_dependencies)
    || !SCORE_VALIDATOR_PATHS.every(path => Object.hasOwn(receipt.validator_dependencies, path))) return false;
  for (const [path, hash] of Object.entries(receipt.validator_dependencies))
    if (!safePath(path) || !HASH.test(hash) || selection.dependency_hashes[path] !== hash || sha256(readArtifact(path)) !== hash) return false;
  for (const field of ['policy_id', 'policy_hash', 'formula_hash', 'approved_policy_id'])
    if (!nonempty(receipt[field]) || receipt[field] !== artifact.policy[field] || receipt[field] !== approval[field]) return false;
  return ['policy_revision', 'approval_ref', 'approved_at_ms', 'valid_until_ms'].every(field => receipt[field] === approval[field]);
}

function validCoexistence(evidence, pin, definitions, selectionHash, readArtifact, nowMs, maximumAgeMs) {
  const c = evidence.coexistence;
  if (!definitions || !shape(c, ['plan', 'repetitions']) || !HASH.test(pin?.coexistence_plan_sha256)
    || c.plan?.sha256 !== pin.coexistence_plan_sha256) return false;
  const plan = readPinned(c.plan, readArtifact);
  if (!shape(plan, ['schema_version', 'selection_sha256', 'revision', 'workload_sha256', 'common_config_sha256',
    'hardware_sha256', 'stage_config_sha256', 'required_metrics', 'repetitions', 'minimum_duration_ms', 'stage_orders'])
    || plan.schema_version !== 'portal.elp2-10.coexistence-plan.v1' || plan.selection_sha256 !== selectionHash
    || !nonempty(plan.revision) || plan.revision !== pin.coexistence_plan_revision
    || !['workload_sha256', 'common_config_sha256', 'hardware_sha256'].every(key => HASH.test(plan[key]))
    || !shape(plan.stage_config_sha256, ['B0', 'B1', 'B2']) || !Object.values(plan.stage_config_sha256).every(hash => HASH.test(hash))
    || !shape(plan.required_metrics, ['B0', 'B1', 'B2']) || !integer(plan.repetitions) || plan.repetitions < 1 || plan.repetitions > 16
    || !integer(plan.minimum_duration_ms) || plan.minimum_duration_ms < 1 || !Array.isArray(c.repetitions)
    || c.repetitions.length !== plan.repetitions || new Set(c.repetitions.map(rep => rep?.id)).size !== c.repetitions.length
    || !object(plan.stage_orders) || Object.keys(plan.stage_orders).length !== plan.repetitions) return false;
  for (const keys of Object.values(plan.required_metrics))
    if (!Array.isArray(keys) || !keys.length || keys.length > definitions.size || new Set(keys).size !== keys.length
      || !keys.every(key => definitions.has(key))) return false;
  const usedArtifacts = new Set();
  for (const rep of c.repetitions) {
    if (!shape(rep, ['id', 'stages']) || !nonempty(rep.id) || !shape(rep.stages, ['B0', 'B1', 'B2'])) return false;
    const order = plan.stage_orders[rep.id];
    if (!Array.isArray(order) || order.length !== 3 || new Set(order).size !== 3
      || !order.every(stage => ['B0', 'B1', 'B2'].includes(stage))) return false;
    let previousEnd = null;
    // Follow the independently pinned counterbalanced/randomized plan, not an
    // invented universal B0→B1→B2 chronological requirement.
    for (const stage of order) {
      const pointer = rep.stages[stage];
      if (usedArtifacts.has(pointer?.sha256)) return false;
      const r = readPinned(pointer, readArtifact); usedArtifacts.add(pointer.sha256);
      if (!shape(r, ['schema_version', 'status', 'evidence_class', 'selection_sha256', 'plan_sha256', 'repetition_id', 'stage',
        'workload_sha256', 'common_config_sha256', 'hardware_sha256', 'configuration_sha256', 'started_at_ms', 'ended_at_ms', 'measurements'])
        || r.schema_version !== 'portal.elp2-10.coexistence-stage.v1' || r.status !== 'PASS' || nonRuntime(r)
        || r.selection_sha256 !== selectionHash || r.plan_sha256 !== c.plan.sha256 || r.repetition_id !== rep.id || r.stage !== stage
        || !['workload_sha256', 'common_config_sha256', 'hardware_sha256'].every(key => r[key] === plan[key])
        || r.configuration_sha256 !== plan.stage_config_sha256[stage] || !integer(r.started_at_ms) || !integer(r.ended_at_ms)
        || r.ended_at_ms - r.started_at_ms < plan.minimum_duration_ms || r.ended_at_ms > evidence.observed_at_ms
        || r.ended_at_ms > nowMs || nowMs - r.ended_at_ms > maximumAgeMs
        || previousEnd !== null && r.started_at_ms < previousEnd
        || !Array.isArray(r.measurements) || r.measurements.length !== plan.required_metrics[stage].length) return false;
      const measured = new Set();
      for (const metric of r.measurements) {
        if (!shape(metric, ['key', 'unit', 'bound_kind', 'value']) || !plan.required_metrics[stage].includes(metric.key)
          || measured.has(metric.key) || !finite(metric.value)) return false;
        const definition = definitions.get(metric.key);
        if (metric.unit !== definition.unit || metric.bound_kind !== definition.bound_kind) return false;
        measured.add(metric.key);
      }
      previousEnd = r.ended_at_ms;
    }
  }
  // Intentionally no throughput/latency/capacity PASS calculation here.
  return true;
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
    const selectionHash = sha256(canonical(input.selection));
    let budgetDefinitions = null;
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
        if (nonRuntime(evidence)) {
          add(kind, 'NON_RUNTIME_EVIDENCE'); continue;
        }
        if (!validSelection(evidence.selection) || canonical(evidence.selection) !== canonical(input.selection)) {
          add(kind, 'SELECTION_OR_DEPENDENCY_PIN_MISMATCH'); continue;
        }
        if (!integer(evidence.observed_at_ms) || evidence.observed_at_ms > nowMs) { add(kind, 'OBSERVATION_INVALID_OR_FUTURE'); continue; }
        if (nowMs - evidence.observed_at_ms > maximumAgeMs) { add(kind, 'EVIDENCE_TOO_OLD'); continue; }
        if (APPROVAL_REQUIRED.has(kind)) {
          const pin = approvalPins?.[kind];
          const reason = currentApproval(evidence, pin, record.artifact, selectionHash, nowMs);
          if (reason) { add(kind, reason); continue; }
        }
        if (kind === 'budgets') {
          if (Array.isArray(evidence.budgets) && evidence.budgets.some(group => Array.isArray(group?.metrics)
            && group.metrics.some(metric => COMPOSITE_SOURCE_BOUNDS.has(metric?.bound_kind))))
            add(kind, 'SOURCE_BUDGET_REQUIRES_APPROVED_SCALAR_DECOMPOSITION');
          budgetDefinitions = approvedBudgetCatalogue(evidence, approvalPins?.budgets, selectionHash, readArtifact);
          if (!budgetDefinitions) add(kind, 'EDGE_APPROVED_BUDGET_GROUPS_REQUIRED');
        }
        if (kind === 'calibration' && !validCalibration(evidence, approvalPins?.calibration, input.selection,
          selectionHash, readArtifact, nowMs, maximumAgeMs)) add(kind, 'CANONICAL_CALIBRATION_VALIDATION_REQUIRED');
        if (kind === 'coexistence' && !validCoexistence(evidence, approvalPins?.budgets, budgetDefinitions,
          selectionHash, readArtifact, nowMs, maximumAgeMs)) add(kind, 'MATCHED_COEXISTENCE_RECEIPTS_REQUIRED');
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
