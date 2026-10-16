import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assessQualification, REQUIREMENTS, BUDGET_GROUPS, SCORE_VALIDATOR_PATHS, sha256 } from './qualification-readiness.mjs';

const canonical = value => JSON.stringify(value !== null && typeof value === 'object' && !Array.isArray(value)
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, JSON.parse(canonical(value[key]))]))
  : Array.isArray(value) ? value.map(item => JSON.parse(canonical(item))) : value);

// Entirely synthetic unit data. A ready result never authorizes runtime or
// substitutes these fabricated receipts for a source/browser measurement.
function fixture() {
  const files = new Map([['src/input.ts', Buffer.from('pinned source')]]);
  for (const path of SCORE_VALIDATOR_PATHS) files.set(path, Buffer.from(`synthetic validator bytes for ${path}`));
  const selection = { workspace_id: 'workspace-unit', environment: 'paper', profile_id: 'profile-unit',
    catalogue_sha256: `sha256:${'a'.repeat(64)}`, schema_sha256: `sha256:${'b'.repeat(64)}`,
    source_commit: 'c'.repeat(40), dependency_hashes: Object.fromEntries([...files].map(([path, bytes]) => [path, sha256(bytes)])) };
  const selectionHash = sha256(canonical(selection));
  const input = { schema_version: 'portal.elp2-10.qualification-input.v1', selection, records: {} };
  const approvalPins = {};
  const evidence = {};
  const artifact = (path, value) => {
    const bytes = Buffer.from(JSON.stringify(value)); files.set(path, bytes); return { path, sha256: sha256(bytes) };
  };
  const put = kind => {
    const path = `evidence/${kind}.json`, bytes = Buffer.from(JSON.stringify(evidence[kind]));
    files.set(path, bytes); input.records[kind] = { artifact: { path, sha256: sha256(bytes) } };
  };
  for (const kind of Object.keys(REQUIREMENTS)) {
    evidence[kind] = { schema_version: 'portal.elp2-10.qualification-evidence.v1', kind,
      status: 'PASS', evidence_class: 'RUNTIME_VERIFIED', selection: structuredClone(selection), observed_at_ms: 900 };
    if (['calibration', 'budgets', 'source_window'].includes(kind)) {
      evidence[kind].approval_id = `independent-${kind}`; evidence[kind].approval_state = 'APPROVED';
      evidence[kind].approval_revision = 'synthetic-approval-r1';
      evidence[kind].approved_at_ms = 100; evidence[kind].valid_until_ms = 2000;
    }
    if (kind === 'budgets') evidence[kind].budgets = BUDGET_GROUPS.map(id => ({ id, owner: 'synthetic unit fixture',
      approval_ref: `unit-${id}`, metrics: [{ id: 'unit_metric', unit: 'count', bound_kind: 'MAX_ABSOLUTE', baseline: 0, approved_bound: 0 }] }));
    if (kind === 'source_window') evidence[kind].window = { starts_at_ms: 800, ends_at_ms: 1100 };
    put(kind);
  }
  const catalogue = { schema_version: 'portal.elp2-10.budget-metric-catalogue.v1', selection_sha256: selectionHash,
    revision: 'synthetic-catalogue-r1', groups: BUDGET_GROUPS.map(id => ({ id,
      metrics: [{ id: 'unit_metric', unit: 'count', bound_kind: 'MAX_ABSOLUTE' }] })) };
  evidence.budgets.metric_catalogue = artifact('inputs/metric-catalogue.json', catalogue);

  // This fixture is a fabricated independently reviewed loader receipt, not a
  // real loader run, calibration approval or source-connected capacity result.
  const scope = { workspace_id: selection.workspace_id, environment: selection.environment,
    profile_id: selection.profile_id, catalogue_digest: selection.catalogue_sha256 };
  const policy = { formula_id: 'qbts_prb_v1_1', qualification: 'RUNTIME_APPROVED', policy_id: 'synthetic-policy',
    policy_hash: sha256('synthetic-policy-hash'), formula_hash: sha256('synthetic-formula'),
    approved_policy_id: 'synthetic-runtime-approval', calibration_snapshot_id: 'synthetic-snapshot',
    comparable_basis_id: 'synthetic-basis', duration_key: 'synthetic-window', observation_frequency: 'synthetic-frequency',
    calendar: 'synthetic-calendar', timezone: 'UTC', currency: 'USD', cash_reference_id: 'synthetic-cash',
    cost_method: 'synthetic-cost', required_costs: [], block_manifest_id: 'synthetic-block', stress_policy_id: 'synthetic-stress',
    stress_delta_bps: '1', anchors: { twr: ['0', '1'], sharpe: ['0', '1'], mdd: ['0', '1'], add: ['0', '1'] },
    maturity: { minimum_samples: 1, minimum_complete_blocks: 1, minimum_duration_ms: 1 },
    canonical_decimal_places: 3, issued_at_ms: 50, calibration_cutoff_ms: 40 };
  const policyPointer = artifact('inputs/policy.json', { schema_version: 'portal.execution.manager-score-policy-runtime.v1', scope, policy,
    runtime_config: { maximum_input_age_ms: 100, minimum_window_ms: 10, maximum_window_ms: 100,
      grid_method_ref: 'synthetic-grid', flow_adjustment_method_ref: 'synthetic-flow',
      ownership_method_ref: 'synthetic-owner', fx_method_ref: 'synthetic-fx' } });
  const runtimeApproval = { artifact_sha256: policyPointer.sha256, scope, policy_id: policy.policy_id,
    policy_hash: policy.policy_hash, formula_hash: policy.formula_hash, approved_policy_id: policy.approved_policy_id,
    policy_revision: 'synthetic-runtime-r1', approval_ref: 'synthetic-independent-runtime-review',
    approved_at_ms: 100, valid_until_ms: 2000 };
  const approvalPointer = artifact('inputs/runtime-approval.json', runtimeApproval);
  const validatorDependencies = Object.fromEntries(SCORE_VALIDATOR_PATHS.map(path => [path, selection.dependency_hashes[path]]));
  const loaderReceipt = { schema_version: 'portal.elp2-10.manager-score-policy-validation.v1', status: 'READY',
    evidence_class: 'RUNTIME_VERIFIED', selection_sha256: selectionHash, scope,
    policy_artifact_sha256: policyPointer.sha256, runtime_approval_sha256: approvalPointer.sha256,
    validator_dependencies: validatorDependencies, validated_at_ms: 900,
    ...Object.fromEntries(['policy_id', 'policy_hash', 'formula_hash', 'approved_policy_id', 'policy_revision',
      'approval_ref', 'approved_at_ms', 'valid_until_ms'].map(key => [key, runtimeApproval[key]])) };
  evidence.calibration.calibration = { policy_artifact: policyPointer, runtime_approval: approvalPointer,
    loader_receipt: artifact('inputs/loader-receipt.json', loaderReceipt) };

  const plan = { schema_version: 'portal.elp2-10.coexistence-plan.v1', selection_sha256: selectionHash,
    revision: 'synthetic-plan-r1', workload_sha256: sha256('synthetic-workload'), common_config_sha256: sha256('synthetic-config'),
    hardware_sha256: sha256('synthetic-hardware'), stage_config_sha256: Object.fromEntries(['B0', 'B1', 'B2'].map(stage => [stage, sha256(stage)])),
    required_metrics: Object.fromEntries(['B0', 'B1', 'B2'].map(stage => [stage, ['B-TS-CPU/unit_metric']])),
    repetitions: 2, minimum_duration_ms: 10,
    stage_orders: { 'synthetic-repeat-0': ['B0', 'B1', 'B2'], 'synthetic-repeat-1': ['B2', 'B0', 'B1'] } };
  const planPointer = artifact('inputs/coexistence-plan.json', plan);
  const repetitions = [0, 1].map(repetition => ({ id: `synthetic-repeat-${repetition}`, stages: {} }));
  for (const [index, rep] of repetitions.entries()) for (const [stageIndex, stage] of plan.stage_orders[rep.id].entries()) {
    const start = 800 + index * 30 + stageIndex * 10;
    rep.stages[stage] = artifact(`inputs/${rep.id}-${stage}.json`, {
      schema_version: 'portal.elp2-10.coexistence-stage.v1', status: 'PASS', evidence_class: 'RUNTIME_VERIFIED',
      selection_sha256: selectionHash, plan_sha256: planPointer.sha256, repetition_id: rep.id, stage,
      workload_sha256: plan.workload_sha256, common_config_sha256: plan.common_config_sha256,
      hardware_sha256: plan.hardware_sha256, configuration_sha256: plan.stage_config_sha256[stage],
      started_at_ms: start, ended_at_ms: start + 10,
      measurements: [{ key: 'B-TS-CPU/unit_metric', unit: 'count', bound_kind: 'MAX_ABSOLUTE', value: 0 }],
    });
  }
  evidence.coexistence.coexistence = { plan: planPointer, repetitions };
  put('calibration'); put('budgets'); put('coexistence');
  const approve = kind => {
    approvalPins[kind] = { artifact_sha256: input.records[kind].artifact.sha256, approval_id: evidence[kind].approval_id,
      approval_revision: evidence[kind].approval_revision, approved_at_ms: evidence[kind].approved_at_ms,
      valid_until_ms: evidence[kind].valid_until_ms, selection_sha256: selectionHash };
    if (kind === 'calibration') Object.assign(approvalPins[kind], {
      policy_artifact_sha256: evidence.calibration.calibration?.policy_artifact?.sha256,
      runtime_approval_sha256: evidence.calibration.calibration?.runtime_approval?.sha256,
      loader_receipt_sha256: evidence.calibration.calibration?.loader_receipt?.sha256,
      validator_dependencies: structuredClone(validatorDependencies) });
    if (kind === 'budgets') Object.assign(approvalPins[kind], {
      metric_catalogue_sha256: evidence.budgets.metric_catalogue?.sha256, metric_catalogue_revision: catalogue.revision,
      coexistence_plan_sha256: evidence.coexistence.coexistence?.plan?.sha256, coexistence_plan_revision: plan.revision });
  };
  for (const kind of ['calibration', 'budgets', 'source_window']) approve(kind);
  const options = { readArtifact: path => { assert(files.has(path), 'fixture artifact missing'); return files.get(path); },
    approvalPins, nowMs: 1000, maximumAgeMs: 200 };
  return { input, options, files, evidence, put, approve, artifact, selectionHash,
    check: () => assessQualification(input, options) };
}
function blocked(f, requirement, reason) {
  const result = f.check(); assert.equal(result.verdict, 'BLOCKED');
  assert(result.blockers.some(item => item.requirement === requirement && item.reason === reason), JSON.stringify(result));
  assert.equal(result.runtime_authorized, false); assert.equal(result.full_phase_pass, false);
}

test('positive exact evidence is only eligible for independent measurement review', () => {
  const result = fixture().check(); assert.equal(result.verdict, 'READY_FOR_MEASUREMENT_REVIEW');
  assert.deepEqual(result.blockers, []); assert.equal(result.runtime_authorized, false); assert.equal(result.full_phase_pass, false);
  assert.equal(result.capacity_certified, false);
});
test('does not flatten a real Edge composite budget policy into a scalar acceptance bound', () => {
  const f = fixture();
  f.evidence.budgets.budgets[0].metrics[0].bound_kind = 'SOFT_HIGH_HARD_AND_ACTIONS';
  f.put('budgets'); f.approve('budgets');
  blocked(f, 'budgets', 'SOURCE_BUDGET_REQUIRES_APPROVED_SCALAR_DECOMPOSITION');
});
for (const [kind, reason] of Object.entries(REQUIREMENTS)) {
  test(`missing ${kind} has its own blocker`, () => { const f = fixture(); delete f.input.records[kind]; blocked(f, kind, reason); });
}
test('self-asserted installed state does not supply an artifact', () => {
  const f = fixture(); f.input.records.trust_adapter = { status: 'PASS', qualification: 'SOURCE_VERIFIED' };
  blocked(f, 'trust_adapter', 'ADAPTER_NOT_INSTALLED');
});
for (const evidenceClass of ['TEST_ONLY', 'SYNTHETIC', 'SOURCE_CONFIRMED', 'HISTORICAL_EVIDENCE']) {
  test(`rejects ${evidenceClass} for runtime eligibility`, () => {
    const f = fixture(); f.evidence.writer.evidence_class = evidenceClass; f.put('writer'); blocked(f, 'writer', 'NON_RUNTIME_EVIDENCE');
  });
}
for (const marker of [{ qualification: 'TEST_ONLY' }, { fixture: true }, { synthetic: true }, { test_only: true }]) {
  test(`runtime label cannot override ${JSON.stringify(marker)}`, () => {
    const f = fixture(); Object.assign(f.evidence.writer, marker); f.put('writer'); blocked(f, 'writer', 'NON_RUNTIME_EVIDENCE');
  });
}
test('tampered artifact bytes are not accepted even with PASS metadata', () => {
  const f = fixture(); f.files.set(f.input.records.writer.artifact.path, Buffer.from('{}')); blocked(f, 'writer', 'ARTIFACT_DIGEST_MISMATCH');
});
test('missing artifact is not an empty successful receipt', () => {
  const f = fixture(); f.files.delete(f.input.records.writer.artifact.path); blocked(f, 'writer', 'ARTIFACT_UNREADABLE_OR_INVALID_JSON');
});
for (const field of ['workspace_id', 'environment', 'profile_id', 'catalogue_sha256', 'schema_sha256', 'source_commit']) {
  test(`receipt cannot be reused across ${field}`, () => {
    const f = fixture(), changed = field === 'environment' ? 'live' : field.endsWith('_sha256') ? `sha256:${'d'.repeat(64)}` : field === 'source_commit' ? 'd'.repeat(40) : 'other';
    f.evidence.writer.selection[field] = changed; f.put('writer'); blocked(f, 'writer', 'SELECTION_OR_DEPENDENCY_PIN_MISMATCH');
  });
}
test('dependency bytes must match selected pins independently of receipts', () => {
  const f = fixture(); f.files.set('src/input.ts', Buffer.from('changed source')); blocked(f, 'manifest', 'DEPENDENCY_DIGEST_MISMATCH');
});
test('receipt with old dependency manifest is rejected', () => {
  const f = fixture(); f.evidence.writer.selection.dependency_hashes['src/input.ts'] = `sha256:${'e'.repeat(64)}`;
  f.put('writer'); blocked(f, 'writer', 'SELECTION_OR_DEPENDENCY_PIN_MISMATCH');
});
test('docs/tooling-only change does not invalidate unchanged selected producer receipts', () => {
  const f = fixture(); f.files.set('docs/new-audit.md', Buffer.from('new audit commit, same producer and component bytes'));
  assert.equal(f.check().verdict, 'READY_FOR_MEASUREMENT_REVIEW');
});
test('future observation is rejected', () => {
  const f = fixture(); f.evidence.writer.observed_at_ms = 1001; f.put('writer'); blocked(f, 'writer', 'OBSERVATION_INVALID_OR_FUTURE');
});
test('stale observation is rejected', () => {
  const f = fixture(); f.evidence.writer.observed_at_ms = 799; f.put('writer'); blocked(f, 'writer', 'EVIDENCE_TOO_OLD');
});
test('arbitrary approval_ref is not independent approval', () => {
  const f = fixture(); f.options.approvalPins = {}; f.evidence.calibration.approval_ref = 'Bobby approved'; f.put('calibration');
  blocked(f, 'calibration', 'INDEPENDENT_APPROVAL_PIN_REQUIRED');
});
test('approval pin of another artifact cannot approve changed evidence', () => {
  const f = fixture(); f.evidence.budgets.budgets[0].metrics[0].approved_bound = 1000;
  f.put('budgets'); blocked(f, 'budgets', 'INDEPENDENT_APPROVAL_PIN_REQUIRED');
});
test('pending budget approval fails even when its bytes are independently pinned', () => {
  const f = fixture(); f.evidence.budgets.approval_state = 'PENDING'; f.put('budgets'); f.approve('budgets');
  blocked(f, 'budgets', 'INDEPENDENT_APPROVAL_PIN_REQUIRED');
});
for (const value of [null, '500', -1]) {
  test(`budget ${JSON.stringify(value)} is not an approved numeric threshold`, () => {
    const f = fixture(); f.evidence.budgets.budgets[0].metrics[0].approved_bound = value; f.put('budgets'); f.approve('budgets');
    blocked(f, 'budgets', 'EDGE_APPROVED_BUDGET_GROUPS_REQUIRED');
  });
}
for (const mutate of [rows => rows.pop(), rows => { rows[1] = rows[0]; }, rows => { rows[0].approval_ref = null; },
  rows => { rows[0].metrics = []; }, rows => { rows[0].metrics.push(rows[0].metrics[0]); },
  rows => { rows[0].metrics[0].baseline = null; }, rows => { rows[0].metrics[0].unit = ''; },
  rows => { rows[0].metrics[0].bound_kind = ''; }]) {
  test('missing/duplicate/unapproved Edge budget groups or invalid metric rows fail closed', () => {
    const f = fixture(); mutate(f.evidence.budgets.budgets); f.put('budgets'); f.approve('budgets');
    blocked(f, 'budgets', 'EDGE_APPROVED_BUDGET_GROUPS_REQUIRED');
  });
}
for (const window of [{ starts_at_ms: 1001, ends_at_ms: 1100 }, { starts_at_ms: 800, ends_at_ms: 1000 }]) {
  test(`window ${JSON.stringify(window)} is not a current allocation`, () => {
    const f = fixture(); f.evidence.source_window.window = window; f.put('source_window'); f.approve('source_window');
    blocked(f, 'source_window', 'SOURCE_WINDOW_NOT_CURRENT');
  });
}
test('oversize artifact is refused before JSON decoding', () => {
  const f = fixture(); const bytes = Buffer.alloc(2 * 1024 * 1024 + 1, 32);
  f.files.set('large.json', bytes); f.input.records.writer.artifact = { path: 'large.json', sha256: sha256(bytes) };
  blocked(f, 'writer', 'ARTIFACT_TOO_LARGE');
});
test('relative path traversal is refused', () => {
  const f = fixture(); f.input.records.writer.artifact.path = '../secrets.json'; blocked(f, 'writer', 'ARTIFACT_POINTER_INVALID');
});
test('unknown requirement cannot silently expand the reviewed evidence set', () => {
  const f = fixture(); f.input.records.magic = {}; blocked(f, 'manifest', 'UNKNOWN_REQUIREMENT');
});
for (const mutate of [f => { f.options.maximumAgeMs = 0; }, f => { delete f.input.selection.source_commit; },
  f => { f.input.selection.environment = 'all'; }, f => { f.input.selection.dependency_hashes = {}; }]) {
  test('invalid explicit manifest/review boundary never becomes eligible', () => {
    const f = fixture(); mutate(f); blocked(f, 'manifest', 'MANIFEST_OR_REVIEW_BOUNDARY_INVALID');
  });
}

function rewrite(f, pointer, mutate) {
  const value = JSON.parse(f.files.get(pointer.path).toString('utf8')); mutate(value);
  return f.artifact(pointer.path, value);
}
for (const [name, mutate] of [
  ['missing approval revision', pin => { delete pin.approval_revision; }],
  ['different approval revision', pin => { pin.approval_revision = 'different-current-revision'; }],
  ['different approved selection', pin => { pin.selection_sha256 = sha256('other-selection'); }],
  ['future approval', pin => { pin.approved_at_ms = 1001; }],
  ['expired approval', pin => { pin.valid_until_ms = 1000; }],
  ['missing expiry', pin => { delete pin.valid_until_ms; }],
]) {
  test(`independent approval rejects ${name}`, () => {
    const f = fixture(); mutate(f.options.approvalPins.budgets);
    blocked(f, 'budgets', 'APPROVAL_NOT_CURRENT_OR_REVISION_MISMATCH');
  });
}
test('even independently pinned evidence cannot approve a future issue or expired validity', () => {
  for (const [field, value] of [['approved_at_ms', 1001], ['valid_until_ms', 1000]]) {
    const f = fixture(); f.evidence.calibration[field] = value; f.put('calibration'); f.approve('calibration');
    blocked(f, 'calibration', 'APPROVAL_NOT_CURRENT_OR_REVISION_MISMATCH');
  }
});
test('generic approved calibration PASS with no policy/loader payload cannot be eligible', () => {
  const f = fixture(); delete f.evidence.calibration.calibration; f.put('calibration'); f.approve('calibration');
  blocked(f, 'calibration', 'CANONICAL_CALIBRATION_VALIDATION_REQUIRED');
});
for (const field of ['policy_artifact_sha256', 'runtime_approval_sha256', 'loader_receipt_sha256']) {
  test(`calibration requires independently pinned ${field}`, () => {
    const f = fixture(); delete f.options.approvalPins.calibration[field];
    blocked(f, 'calibration', 'CANONICAL_CALIBRATION_VALIDATION_REQUIRED');
  });
}
for (const [name, mutate] of [
  ['a self-declared loader success', r => { delete r.validator_dependencies; }],
  ['another selected source', r => { r.selection_sha256 = sha256('other-selection'); }],
  ['another policy digest', r => { r.policy_hash = sha256('other-policy'); }],
  ['a different runtime approval digest', r => { r.runtime_approval_sha256 = sha256('other-approval'); }],
  ['another runtime scope', r => { r.scope.profile_id = 'other-profile'; }],
  ['stale loader validation', r => { r.validated_at_ms = 799; }],
  ['future loader validation', r => { r.validated_at_ms = 1001; }],
  ['TEST_ONLY loader evidence', r => { r.evidence_class = 'TEST_ONLY'; }],
  ['missing canonical calculator dependency', r => { delete r.validator_dependencies[SCORE_VALIDATOR_PATHS[1]]; }],
]) {
  test(`calibration rejects ${name} despite a new independent receipt hash`, () => {
    const f = fixture(), c = f.evidence.calibration.calibration;
    c.loader_receipt = rewrite(f, c.loader_receipt, mutate); f.put('calibration'); f.approve('calibration');
    blocked(f, 'calibration', 'CANONICAL_CALIBRATION_VALIDATION_REQUIRED');
  });
}
test('calibration cannot silently substitute the canonical validator implementation', () => {
  const f = fixture(); f.options.approvalPins.calibration.validator_dependencies[SCORE_VALIDATOR_PATHS[0]] = sha256('other-validator');
  blocked(f, 'calibration', 'CANONICAL_CALIBRATION_VALIDATION_REQUIRED');
});
for (const path of SCORE_VALIDATOR_PATHS) {
  test(`loader receipt must bind the selected validator dependency ${path}`, () => {
    const f = fixture(), c = f.evidence.calibration.calibration;
    c.loader_receipt = rewrite(f, c.loader_receipt, receipt => { delete receipt.validator_dependencies[path]; });
    f.put('calibration'); f.approve('calibration'); blocked(f, 'calibration', 'CANONICAL_CALIBRATION_VALIDATION_REQUIRED');
  });
}
test('a TEST_ONLY policy cannot be promoted by a pinned runtime label on its receipt', () => {
  const f = fixture(), c = f.evidence.calibration.calibration;
  c.policy_artifact = rewrite(f, c.policy_artifact, value => { value.policy.qualification = 'TEST_ONLY'; });
  f.put('calibration'); f.approve('calibration');
  blocked(f, 'calibration', 'CANONICAL_CALIBRATION_VALIDATION_REQUIRED');
});
for (const [name, mutate] of [
  ['substituted metric id', m => { m.id = 'unmeasured_metric'; }],
  ['wrong unit', m => { m.unit = 'milliseconds'; }],
  ['wrong bound semantics', m => { m.bound_kind = 'MIN_ABSOLUTE'; }],
  ['unknown bound semantics', m => { m.bound_kind = 'FREE_TEXT_THRESHOLD'; }],
]) {
  test(`budget catalogue rejects ${name}`, () => {
    const f = fixture(); mutate(f.evidence.budgets.budgets[0].metrics[0]); f.put('budgets'); f.approve('budgets');
    blocked(f, 'budgets', 'EDGE_APPROVED_BUDGET_GROUPS_REQUIRED');
  });
}
test('budget metric coverage must match independently pinned catalogue, not merely14 nonempty groups', () => {
  const f = fixture(); f.evidence.budgets.metric_catalogue = rewrite(f, f.evidence.budgets.metric_catalogue,
    c => { c.groups[0].metrics.push({ id: 'required_second_metric', unit: 'bytes', bound_kind: 'MAX_ABSOLUTE' }); });
  f.put('budgets'); f.approve('budgets'); blocked(f, 'budgets', 'EDGE_APPROVED_BUDGET_GROUPS_REQUIRED');
});
test('budget catalogue and revision require independent approval pins', () => {
  for (const field of ['metric_catalogue_sha256', 'metric_catalogue_revision']) {
    const f = fixture(); delete f.options.approvalPins.budgets[field]; blocked(f, 'budgets', 'EDGE_APPROVED_BUDGET_GROUPS_REQUIRED');
  }
});
test('generic coexistence PASS without paired receipts cannot be eligible', () => {
  const f = fixture(); delete f.evidence.coexistence.coexistence; f.put('coexistence');
  blocked(f, 'coexistence', 'MATCHED_COEXISTENCE_RECEIPTS_REQUIRED');
});
for (const [name, mutate] of [
  ['missing repetition', c => { c.repetitions.pop(); }],
  ['missing B2', c => { delete c.repetitions[0].stages.B2; }],
  ['duplicate repetition identity', c => { c.repetitions[1].id = c.repetitions[0].id; }],
  ['reused stage receipt', c => { c.repetitions[0].stages.B1 = c.repetitions[0].stages.B0; }],
]) {
  test(`coexistence rejects ${name}`, () => {
    const f = fixture(); mutate(f.evidence.coexistence.coexistence); f.put('coexistence');
    blocked(f, 'coexistence', 'MATCHED_COEXISTENCE_RECEIPTS_REQUIRED');
  });
}
for (const [name, mutate] of [
  ['different stage configuration', r => { r.configuration_sha256 = sha256('different-config'); }],
  ['different workload', r => { r.workload_sha256 = sha256('different-workload'); }],
  ['different hardware', r => { r.hardware_sha256 = sha256('different-hardware'); }],
  ['different paired selection', r => { r.selection_sha256 = sha256('different-selection'); }],
  ['different repetition', r => { r.repetition_id = 'another-repetition'; }],
  ['unapproved plan', r => { r.plan_sha256 = sha256('another-plan'); }],
  ['too short duration', r => { r.ended_at_ms = r.started_at_ms + 1; }],
  ['overlapping paired stage', r => { r.started_at_ms = 800; }],
  ['measurement after observation', r => { r.ended_at_ms = 901; }],
  ['no measurements', r => { r.measurements = []; }],
  ['wrong measurement unit', r => { r.measurements[0].unit = 'seconds'; }],
  ['wrong measurement bound semantics', r => { r.measurements[0].bound_kind = 'MIN_ABSOLUTE'; }],
  ['missing/unknown measurement', r => { r.measurements[0].key = 'B-TS-CPU/not_measured'; }],
  ['TEST_ONLY stage', r => { r.evidence_class = 'TEST_ONLY'; }],
]) {
  test(`coexistence rejects ${name}`, () => {
    const f = fixture(), c = f.evidence.coexistence.coexistence;
    c.repetitions[0].stages.B1 = rewrite(f, c.repetitions[0].stages.B1, mutate); f.put('coexistence');
    blocked(f, 'coexistence', 'MATCHED_COEXISTENCE_RECEIPTS_REQUIRED');
  });
}
test('coexistence plan requires its independently pinned revision', () => {
  const f = fixture(); f.options.approvalPins.budgets.coexistence_plan_revision = 'other-plan-revision';
  blocked(f, 'coexistence', 'MATCHED_COEXISTENCE_RECEIPTS_REQUIRED');
});
test('complete paired measurement evidence never grants runtime or capacity authority', () => {
  const result = fixture().check(); assert.equal(result.verdict, 'READY_FOR_MEASUREMENT_REVIEW');
  assert.equal(result.capacity_certified, false); assert.equal(result.runtime_authorized, false); assert.equal(result.full_phase_pass, false);
});
const CLI = fileURLToPath(new URL('./qualification-readiness.mjs', import.meta.url));
function cliCell(callback) {
  const temporary = mkdtempSync(join(tmpdir(), 'elp210-eligibility-'));
  try {
    const root = join(temporary, 'root'); mkdirSync(root);
    const run = input => spawnSync(process.execPath, [CLI, '--root', root, '--input', input,
      '--now-ms', '1000', '--max-age-ms', '200'], { encoding: 'utf8', timeout: 5000 });
    callback({ root, temporary, run });
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}
test('CLI rejects symlink escape instead of reading evidence outside selected root', () => cliCell(({ root, temporary, run }) => {
  writeFileSync(join(temporary, 'outside.json'), '{}'); symlinkSync(join(temporary, 'outside.json'), join(root, 'input.json'));
  const result = run('input.json'); assert.equal(result.status, 2); assert.equal(result.stdout, '');
  assert.equal(result.stderr, 'QUALIFICATION_INPUT_REJECTED\n');
}));
test('CLI preserves future-observation blocker and never authorizes runtime', () => cliCell(({ root, run }) => {
  const f = fixture(); f.evidence.writer.observed_at_ms = 1001; f.put('writer');
  for (const [path, bytes] of f.files) { const target = join(root, path); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, bytes); }
  writeFileSync(join(root, 'input.json'), JSON.stringify(f.input));
  const result = run('input.json'); assert.equal(result.status, 2); const report = JSON.parse(result.stdout);
  assert(report.blockers.some(row => row.requirement === 'writer' && row.reason === 'OBSERVATION_INVALID_OR_FUTURE'));
  assert.equal(report.runtime_authorized, false); assert.equal(report.full_phase_pass, false);
}));
