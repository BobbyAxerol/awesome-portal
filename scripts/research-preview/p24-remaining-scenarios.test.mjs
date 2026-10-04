import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { auditPrerequisite, auditRetryPrerequisite, boundaryFixture, corruptionMirrorFixture, hash, noPickCodeChangeFixture,
  selectionFixture, undefinedReportFixture, unmappedAtlasFixture, validateConfig, writeKind } from './p24-remaining-scenarios.mjs';

const require = createRequire(import.meta.url);
const image = 'sha256:' + 'a'.repeat(64);
const run = 'rrun_' + '1'.repeat(32);
const owned = () => ({ project: 'portal-research-p23-ol12', base_url: 'http://127.0.0.1:8096', origin: 'http://127.0.0.1:8096',
  workspace_id: 'owned-a', alternate_workspace_id: 'owned-b', out: '/home/bobby/.local/state/portal-research-p23/20261004/p24-remaining-test',
  actors: Object.fromEntries(['a', 'b', 'producer'].map(key => [key, { username: `p24-round2-${key}` }])),
  runs: { global: run, causal: run, fixed: run }, expected_images: Object.fromEntries(['control-api', 'portal-api', 'portal-web', 'quant-worker-py'].map(key => [key, image])) });
const fixture = name => JSON.parse(readFileSync(new URL(`../../packages/contracts/fixtures/${name}`, import.meta.url)));
const schemas = {
  search: require('../../apps/control-api/dist/research/current-source.contract.js').ResearchCurrentSourceSearchResponseSchema,
  freeze: require('../../apps/control-api/dist/research/current-source.contract.js').ResearchCurrentSourceFreezeResponseSchema,
  report: require('../../apps/control-api/dist/research/report.contract.js').ResearchReportDetailResponseSchema,
  rc: require('../../apps/control-api/dist/research/release-candidate.contract.js').ResearchReleaseCandidateComposeResponseSchema,
};
const inputs = {
  search: fixture('research-current-source.search-surface.valid.json'),
  freeze: fixture('research-current-source.freeze-binding.valid.json'),
  report: fixture('research-report.wfo-retained.valid.json'),
  rc: fixture('research-release-candidate.wfo-retained.valid.json'),
};
test('remaining lane is pinned to own clone, exact finite QA names, all four images and distinct workspaces', () => {
  assert.equal(validateConfig(owned()).mode, 'READ_AND_TECHNICAL');
  for (const patch of [{ base_url: 'http://127.0.0.1:8095' }, { origin: 'https://portal.primusspark.com' },
    { expected_images: {} }, { mode: 'RUN_ANYTHING' }, { alternate_workspace_id: 'owned-a' },
    { actors: { ...owned().actors, producer: { username: 'bobby' } } }]) assert.throws(() => validateConfig({ ...owned(), ...patch }));
});
test('only named preflight in its negative phase or exactly one parent-bound audit is allowed; never generic writes', () => {
  assert.equal(writeKind('POST', `/api/v1/quantbt/runs/${run}/final-audit`, 'AUDIT_ALLOCATE', run), 'AUDIT');
  assert.equal(writeKind('POST', '/api/v1/research/preflights', 'NEGATIVE_PREFLIGHT', run), 'PREFLIGHT');
  for (const path of ['/api/v1/research/runs', '/api/v1/approvals', '/api/v1/research/alphas/a/activate',
    `/api/v1/quantbt/runs/${run}/release-candidate/publish`, `/api/v1/quantbt/runs/${run}/final-audit`])
    assert.equal(writeKind('POST', path, 'READ', run), 'FORBIDDEN');
  assert.equal(writeKind('POST', '/api/v1/quantbt/runs/foreign/final-audit', 'AUDIT_ALLOCATE', run), 'FORBIDDEN');
});
test('NONE and centroid technical response chains preserve valid named schemas and never invent a trial', () => {
  for (const kind of ['NONE', 'CENTROID']) for (const [key, input] of Object.entries(inputs)) {
    const before = hash(input); const output = selectionFixture(input, kind); schemas[key].parse(output);
    assert.equal(hash(input), before, 'original canonical fixture immutable');
    if (output.selection) { assert.equal(output.selection.selected_trial_id, null); assert.equal(output.selection.roles.selected.trial_id, null);
      if (kind === 'NONE') { assert.deepEqual(output.selection.parameters, {}); assert.equal(output.selection.roles.selected.state, 'NOT_PUBLISHED'); }
      else { assert(Object.keys(output.selection.parameters).length); assert.equal(output.selection.roles.centroid.state, 'AVAILABLE'); } }
    if (output.surface) { assert.equal(output.surface.selected_trial_id, null); assert(output.surface.points.every(point => point.selected === false)); }
    if (output.selected_params) { assert.equal(output.selected_params.selected_trial_number, null); assert.equal(output.actions.may_seal, false); }
  }
  // Canonical old fixtures predate additive public ordinal presentation.
  // Exercise the actual current enum too; generic availability reason codes
  // must never be copied into this narrower ordinal-reason contract.
  for (const kind of ['NONE', 'CENTROID']) {
    const input = structuredClone(inputs.search); Object.assign(input.selection, { selected_trial_ordinal: 1,
      selected_trial_ordinal_scope: 'RUN_GLOBAL', selected_trial_ordinal_reason_code: null });
    const output = selectionFixture(input, kind); schemas.search.parse(output);
    assert.equal(output.selection.selected_trial_ordinal_reason_code, 'SELECTION_HAS_NO_TRIAL');
    const rc = structuredClone(inputs.rc);
    Object.assign(rc.rail.find(row => row.key === 'selected_params'), { selected_trial_ordinal: 1,
      selected_trial_ordinal_scope: 'RUN_GLOBAL', selected_trial_ordinal_reason_code: null });
    schemas.rc.parse(selectionFixture(rc, kind));
  }
});
test('audit retry must preserve exact failed child and immutable target, never reset the prior attempt', () => {
  const config = { previous_failed_child: run, expected_audit_target: 'a'.repeat(64) };
  const read = { state: 'FAILED', may_create: true, child_run_id: run, target_digest: config.expected_audit_target };
  assert.equal(auditRetryPrerequisite(read, { final_audit_applicable: true }, config), true);
  for (const patch of [{ state: 'VERIFIED' }, { may_create: false }, { child_run_id: null }, { target_digest: 'b'.repeat(64) }])
    assert.throws(() => auditRetryPrerequisite({ ...read, ...patch }, { final_audit_applicable: true }, config));
});
test('narrowed bounds, exact boundary and pinned zero-width keep DR02 typed, never infer optimum or category order', () => {
  for (const variant of ['AT_LOWER', 'NARROWED', 'PINNED']) for (const key of ['search', 'freeze']) {
    const output = boundaryFixture(inputs[key], variant); schemas[key].parse(output);
    for (const parameter of output.declared_space.parameters) {
      assert.equal(parameter.bound_warning.definition_id, 'research.bound-warning.v1');
      assert.equal(parameter.bound_warning.state, variant === 'PINNED' ? 'NOT_APPLICABLE' : 'AT_BOUND');
      if (variant === 'PINNED') { assert.equal(parameter.bound_warning.reason_code, 'BOUND_WARNING_ZERO_WIDTH_RANGE'); assert.equal(parameter.levels, 1); }
    }
  }
});
test('undefined financial facts remain typed null, never zero, Infinity or a fake engine/source fact', () => {
  for (const reason of ['NO_DOWNSIDE_OBSERVATIONS', 'ZERO_VARIANCE_RETURNS', 'BENCHMARK_NOT_PUBLISHED']) {
    const output = undefinedReportFixture(inputs.report, reason); schemas.report.parse(output);
    const metric = output.frozen_core.metrics.find(row => row.key.includes('SHARPE'));
    assert.equal(metric.value, null); assert.equal(metric.availability.reason_code, reason);
    assert.doesNotMatch(JSON.stringify(output), /\bNaN\b|\bInfinity\b/);
  }
});
test('new audit requires real explicit applicability, fresh target and no existing verified child', () => {
  const read = fixture('research-final-audit.ready_to_admit.valid.json');
  assert.equal(auditPrerequisite(read, { final_audit_applicable: true }), true);
  for (const value of [false, null, undefined]) assert.throws(() => auditPrerequisite(read, { final_audit_applicable: value }));
  assert.throws(() => auditPrerequisite({ ...read, state: 'VERIFIED', child_run_id: run }, { final_audit_applicable: true }));
  assert.throws(() => auditPrerequisite({ ...read, may_create: false }, { final_audit_applicable: true }));
});
test('technical corruption preserves a typed approved mirror and cannot allocate or revoke Governance', () => {
  const value = corruptionMirrorFixture(inputs.rc, inputs.freeze);
  schemas.rc.parse(value.rc); schemas.freeze.parse(value.freeze);
  require('../../apps/control-api/dist/research/release-candidate-publication.contract.js').ResearchReleaseCandidatePublicationResponseSchema.parse(value.publication);
  assert.equal(value.freeze.integrity.state, 'MISMATCH'); assert.equal(value.publication.approval.status, 'APPROVED');
  assert.equal(value.publication.state, 'DELIVERED'); assert.equal(value.publication.may_publish, false);
  assert.equal(writeKind('POST', '/api/v1/approvals/decision', 'READ', run), 'FORBIDDEN');
});
test('absent promotion pick and code-change gates are schema-valid informational facts, no guessed winner', () => {
  const value = noPickCodeChangeFixture(fixture('research-attempt-lineage.healthy.valid.json'));
  require('../../apps/control-api/dist/research/lineage.contract.js').ResearchAttemptLineageResponseSchema.parse(value);
  assert(value.alpha.versions.every(version => version.promotion_pick.state === 'NOT_PUBLISHED'));
  assert(value.attempts.some(attempt => attempt.semantic_diff.gates_reset));
});
test('unknown technical route leaves source axes intact and explicitly not admitted', () => {
  const base = fixture('research-foundation.atlas-presented-current.valid.json'); const value = unmappedAtlasFixture(base);
  require('../../apps/control-api/dist/research/foundation.contract.js').ResearchEngineAtlasPublicSchema.parse(value.atlas);
  const route = value.atlas.routes.at(-1); assert.equal(route.route_id, 'p24_unmapped_new_route');
  assert.equal(route.axes.admission, 'NOT_ADMITTED'); assert.equal(route.default_for_new_runs, false);
  assert.equal(value.atlas.current_release.release_id, base.atlas.current_release.release_id);
  assert.deepEqual(value.portal_admission, base.portal_admission);
});
