#!/usr/bin/env node
/** Ops-only fresh causal receipt for the existing owned :8096 cell; no reset. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSessions, makeClient, privateJson, savePrivate } from './api-client.mjs';
import { BASE_URL, PROJECT, validateHome } from './cell.mjs';
import { admitRealRun, waitForRun } from './real-run.mjs';
import { container, dbQuery, docker } from './runtime-tools.mjs';

export const CAUSAL_PROFILE = Object.freeze({
  execution_id: 'p10.delta-signal-notional-causal-inner.v1',
  execution_digest: '60a041b373808405f8896aee0a3421d41cc2199d516dadc9f40e1187e2fefdd1',
  source_id: 'rs02.quantbt-signal-notional-causal-inner.v1',
  source_profile: 'rs02.delta-signal-notional-causal-inner.v1',
});
const WORKSPACE = 'ws_06GE6XY0SKNPFS7TP8WCE938Z5';
const SCORE_BASIS = 'INNER_VALIDATION_IS_MEAN_AND_OUTER_FOLD_OOS';
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const sha = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const decimal = value => typeof value === 'string' && /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(value) && value.length <= 96;
const sameParams = (actual, expected, reason) => assert.equal(sha(actual), sha(expected), reason);
const payload = row => typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
const close = (actual, expected, reason) => {
  assert(decimal(actual) && Number.isFinite(Number(actual)), reason);
  assert(Math.abs(Number(actual) - expected) <= 1e-12 * Math.max(1, Math.abs(expected)), reason);
};

/** Pure independent retained-DB -> named-API oracle; tests are synthetic, not runtime proof. */
export function assertCausalInnerReceipt(input) {
  const { workspace_id: workspace, run_id: runId, producer, preflight, seal, rows, responses } = input;
  assert.equal(producer.workspace_id, workspace, 'PRODUCER_WORKSPACE');
  assert.equal(producer.run_id, runId, 'PRODUCER_RUN');
  assert.equal(producer.execution_profile_id, CAUSAL_PROFILE.execution_id, 'EXECUTION_PROFILE');
  assert.equal(producer.execution_profile_digest, CAUSAL_PROFILE.execution_digest, 'EXECUTION_PIN');
  assert.equal(seal.workspace_id, workspace, 'SEAL_WORKSPACE');
  assert.equal(seal.run_id, runId, 'SEAL_RUN');
  assert.equal(seal.source_adapter_id, CAUSAL_PROFILE.source_id, 'SOURCE_ADAPTER');
  assert.equal(seal.profile_id, CAUSAL_PROFILE.source_profile, 'SOURCE_PROFILE');
  assert.equal(seal.artifact_sealed, true, 'EXACT_P05_SEALED_ARTIFACT');
  const folds = rows.filter(row => row.table_kind === 'FOLD').sort((a, b) => Number(a.source_ordinal) - Number(b.source_ordinal));
  const trials = rows.filter(row => row.table_kind === 'TRIAL'), candidates = rows.filter(row => row.table_kind === 'CANDIDATE');
  const selections = rows.filter(row => row.table_kind === 'SELECTION');
  assert(rows.length <= 113 && folds.length === 2, 'EXACT_TWO_BOUNDED_OUTER_FOLDS');
  assert.equal(trials.length, 6, 'THREE_TRIALS_PER_TWO_STUDIES');
  assert.equal(selections.length, 1, 'ONE_DEPLOYMENT_SINGLETON');
  for (const [kind, count] of [['FOLD', folds.length], ['TRIAL', trials.length], ['CANDIDATE', candidates.length], ['SELECTION', selections.length]]) {
    assert.equal(count, seal.table_rows[kind], `${kind}_SEALED_COUNT`);
  }
  for (const row of rows) {
    assert.equal(row.workspace_id, workspace, 'ROW_WORKSPACE'); assert.equal(row.run_id, runId, 'ROW_RUN');
    assert.equal(Number(row.artifact_revision), Number(seal.artifact_revision), 'ROW_SEAL_REVISION');
  }
  const spec = preflight.requested_spec, requestedInner = spec.walk_forward?.inner;
  assert.equal(spec.schema_version, 'research.requested-spec.v2', 'REQUEST_V2');
  assert.equal(spec.optimization_schedule, 'per_fold_causal', 'REQUEST_CAUSAL');
  assert.equal(spec.optuna_trials, 3, 'REQUEST_STUDY_BUDGET');
  assert.equal(spec.data.timeframe, '1h', 'RECEIPT_EXACT_ONE_HOUR_SOURCE');
  assert.equal(sha(spec), producer.requested_spec_digest, 'IMMUTABLE_REQUEST_DIGEST');
  assert(requestedInner, 'REQUEST_INNER_REQUIRED');
  assert.equal(preflight.topology.plan_source, 'quantbt.walkforward.WalkForwardEngine.build_folds', 'ENGINE_INNER_PLAN');
  assert.equal(preflight.topology.folds.length, folds.length, 'IMMUTABLE_OUTER_COUNT');
  const publics = Object.fromEntries(Object.entries(responses).filter(([, response]) => response?.status === 200).map(([name, response]) => [name, response.body]));
  for (const name of ['evidence', 'split', 'search', 'freeze', 'replay', 'report']) {
    assert.equal(responses[name]?.status, 200, `${name}_NAMED_GET`);
    assert.equal(publics[name].run_id, runId, `${name}_RUN`);
  }
  for (const name of ['evidence', 'split', 'search', 'freeze', 'replay']) {
    const api = publics[name];
    assert.equal(api.availability.state, 'AVAILABLE', `${name}_AVAILABLE`);
    assert.equal(api.provenance.source_manifest_digest, seal.manifest_digest, `${name}_MANIFEST`);
    assert.equal(api.provenance.retained_import_digest, seal.retained_import_digest, `${name}_IMPORT`);
    assert.equal(api.provenance.profile_id, CAUSAL_PROFILE.source_profile, `${name}_PROFILE`);
    for (const key of ['requested_spec_digest', 'effective_spec_digest', 'dataset_binding_digest']) {
      assert.equal(api.provenance[key], producer[key], `${name}_${key}`);
    }
  }
  const ordering = publics.freeze.fold_ordering;
  assert.equal(ordering.selection_scope, 'PER_FOLD', 'PER_FOLD_ORDERING');
  assert.equal(ordering.wall_clock.state, 'NOT_PUBLISHED', 'NO_ENGINE_WALL_CLOCK_INFERENCE');
  assert.equal(ordering.frozen_candidate.candidate_id, null, 'NO_GLOBAL_THETA');
  assert.equal(seal.summary.source_facts.claims.oos_used_for_selection, false, 'OUTER_OOS_NOT_SELECTION_INPUT');
  assert.equal(seal.summary.source_facts.search.n_studies, 2, 'TWO_ACTUAL_STUDIES');
  const absences = [], selected = [], studies = new Set(); let innerCount = 0;
  assert.equal(publics.search.ledger.source_trial_count, trials.length, 'SEARCH_COMPLETE_SOURCE_TRIAL_COUNT');
  assert.equal(publics.search.ledger.trials.length, trials.length, 'SEARCH_COMPLETE_TRIAL_LEDGER');
  const pool = publics.search.pool;
  assert.equal(pool.reevaluation_scope, 'PER_FOLD_STUDY', 'CAUSAL_POOL_INNER_STUDY_SCOPE');
  const scored = trials.filter(row => { const trial = payload(row); return trial.state === 'COMPLETE'
    && trial.trial_facts.pruned !== true && trial.objective !== null; }).length;
  for (const [key, count] of [['trials_evaluated', trials.length], ['scored_unpruned', scored],
    ['reevaluated', candidates.length], ['selected', folds.length]]) {
    assert.equal(pool[key].state, 'AVAILABLE', `CAUSAL_POOL_${key}_AVAILABLE`);
    assert.equal(pool[key].value, count, `CAUSAL_POOL_${key}_SOURCE_COUNT`);
  }
  assert.equal(pool.top_is_k.state, 'NOT_PUBLISHED', 'NO_RUN_GLOBAL_POOL_K');
  assert.equal(pool.top_is_k.value, null, 'NO_RUN_GLOBAL_POOL_K_VALUE');
  assert.equal(pool.rule.state, 'NOT_PUBLISHED', 'NO_RUN_GLOBAL_POOL_RULE');
  const globalSurface = publics.search.surface, studySurfaces = publics.search.surfaces_by_study;
  assert.equal(globalSurface.state, 'NOT_APPLICABLE', 'NO_RUN_GLOBAL_CAUSAL_SURFACE');
  assert.equal(globalSurface.objective_kind, 'NOT_PUBLISHED', 'NO_GLOBAL_OBJECTIVE_RANKING');
  assert.equal(globalSurface.source_trial_count, trials.length, 'GLOBAL_SURFACE_SOURCE_COUNT_ONLY');
  assert.equal(globalSurface.complete_trial_count, trials.filter(row => payload(row).state === 'COMPLETE'
    && payload(row).objective !== null).length, 'ACTUAL_COMPLETED_TRIAL_COUNT_NOT_GLOBAL_RANKING');
  assert.equal(globalSurface.emitted_point_count, 0, 'NO_GLOBAL_RANKED_POINTS');
  assert.equal(globalSurface.points.length, 0, 'NO_GLOBAL_RANKED_POINTS');
  assert.equal(globalSurface.selected_trial_id, null, 'NO_GLOBAL_SURFACE_SELECTION');
  assert.equal(globalSurface.best_is_trial_id, null, 'NO_GLOBAL_BEST_IS');
  assert.equal(globalSurface.objective_ramp.minimum, null, 'NO_GLOBAL_OBJECTIVE_MINIMUM');
  assert.equal(globalSurface.objective_ramp.maximum, null, 'NO_GLOBAL_OBJECTIVE_MAXIMUM');
  assert.equal(globalSurface.grid.state, 'NOT_APPLICABLE', 'NO_GLOBAL_OBJECTIVE_GRID');
  assert.equal(globalSurface.grid.cells.length, 0, 'NO_GLOBAL_OBJECTIVE_GRID');
  assert.equal(globalSurface.parameter_frequency.pool_count, 0, 'NO_GLOBAL_TOP_DECILE_POOL');
  assert.equal(studySurfaces.length, folds.length, 'EXACT_OWN_STUDY_SURFACES');
  assert.equal(new Set(studySurfaces.map(value => value.study_id)).size, folds.length, 'UNIQUE_STUDY_SURFACES');
  assert.equal(new Set(studySurfaces.map(value => value.fold_id)).size, folds.length, 'UNIQUE_FOLD_SURFACES');
  for (const row of trials) {
    const trial = payload(row), api = publics.search.ledger.trials.find(value => value.trial_id === row.source_id);
    assert(api, 'SEARCH_ACTUAL_TRIAL_ID'); sameParams(api.parameters, trial.parameters, 'SEARCH_ACTUAL_TRIAL_PARAMS');
    assert.equal(api.objective, trial.objective, 'SEARCH_ACTUAL_TRIAL_OBJECTIVE');
    assert.equal(api.facts.study_id, trial.trial_facts.study_id, 'SEARCH_ACTUAL_TRIAL_STUDY');
    assert.equal(api.facts.evaluation_scope, 'INNER_VALIDATION', 'SEARCH_TRIAL_INNER_SCOPE');
  }
  for (const name of ['compare', 'lineage']) if (responses[name] && responses[name].status !== 200) {
    absences.push({ fact: name, status: responses[name].status, reason_code: responses[name].body?.error?.code ?? null });
  }
  for (const [ordinal, row] of folds.entries()) {
    assert.equal(Number(row.source_ordinal), ordinal, 'DENSE_FOLD_ORDINAL');
    const fold = payload(row), fact = fold.causal_selection;
    assert.equal(row.source_id, fold.fold_id, 'FOLD_SOURCE_ID');
    assert(fact && !studies.has(fact.study_id), 'DISTINCT_ACTUAL_STUDY'); studies.add(fact.study_id);
    assert.equal(fact.outer_oos_used_for_selection, false, 'FOLD_OUTER_OOS_NOT_SELECTION_INPUT');
    assert.equal(fact.candidate_is_scope, 'INNER_VALIDATION_IS_MEAN', 'INNER_IS_SCOPE');
    assert.equal(fact.candidate_oos_scope, 'OUTER_FOLD_OOS', 'OUTER_OOS_SCOPE');
    assert.equal(fact.candidate_decay_scope, 'INNER_IS_MEAN_MINUS_OUTER_OOS', 'DECAY_COMPONENT_SCOPES');
    assert.equal(fact.inner_fold_count, fact.inner_folds.length, 'OBSERVED_INNER_COUNT');
    assert(fact.inner_fold_count >= 2 && fact.inner_fold_count <= 16, 'INNER_COUNT_BOUND'); innerCount += fact.inner_fold_count;
    const plan = preflight.topology.folds[ordinal];
    for (const [label, actual, expected] of [
      ['TRAIN_START', fold.train_start_utc_ms, plan.train.start_utc_ms],
      ['TRAIN_END', fold.train_end_utc_ms + 3_600_000, plan.train.end_exclusive_utc_ms],
      ['OOS_START', fold.test_start_utc_ms, plan.outer_oos.start_utc_ms],
      ['OOS_END', fold.test_end_utc_ms + 3_600_000, plan.outer_oos.end_exclusive_utc_ms],
    ]) assert.equal(actual, expected, `IMMUTABLE_OUTER_${label}_BOUND`);
    assert.equal(fact.inner_fold_count, plan.inner_fold_count, 'IMMUTABLE_INNER_COUNT');
    for (const [key, value] of Object.entries({ inner_split_frequency: requestedInner.split_frequency,
      inner_window_mode: requestedInner.window_mode, inner_train_window: requestedInner.train_window,
      inner_min_folds: requestedInner.min_folds ?? 2 })) assert.equal(fact.inner_validation[key], value, `IMMUTABLE_${key}`);
    for (const inner of fact.inner_folds) {
      assert(inner.train_start_utc_ms >= fold.train_start_utc_ms && inner.train_start_utc_ms <= inner.train_end_utc_ms
        && inner.train_end_utc_ms < inner.test_start_utc_ms && inner.test_start_utc_ms <= inner.test_end_utc_ms
        && inner.test_end_utc_ms <= fold.train_end_utc_ms && fold.train_end_utc_ms < fold.test_start_utc_ms, 'INNER_INSIDE_OUTER_IS');
      assert.equal(inner.outer_oos_used_for_selection, false, 'INNER_NO_OUTER_OOS');
    }
    const ownTrials = trials.filter(value => payload(value).trial_facts.study_id === fact.study_id);
    const ownCandidates = candidates.filter(value => payload(value).trial_facts.study_id === fact.study_id);
    assert.equal(ownTrials.length, 3, 'OWN_STUDY_THREE_TRIALS');
    const studySurface = studySurfaces.find(value => value.fold_id === fold.fold_id);
    assert.equal(studySurface?.scope, 'INNER_VALIDATION_OUTER_STUDY', 'SURFACE_OWN_INNER_STUDY_SCOPE');
    assert.equal(studySurface.study_id, fact.study_id, 'SURFACE_OWN_STUDY');
    const surface = studySurface.surface;
    assert.equal(surface.state, 'AVAILABLE', 'OWN_STUDY_SURFACE_AVAILABLE');
    assert.equal(surface.objective_kind, 'IS_MEAN_SHARPE', 'SURFACE_OWN_STAGE_A_OBJECTIVE_KIND');
    assert.equal(surface.source_trial_count, ownTrials.length, 'SURFACE_OWN_SOURCE_TRIAL_COUNT');
    assert.equal(surface.complete_trial_count, ownTrials.filter(value => payload(value).state === 'COMPLETE'
      && decimal(payload(value).objective)).length, 'SURFACE_OWN_COMPLETE_TRIAL_COUNT');
    assert.equal(surface.emitted_point_count, ownTrials.length, 'SURFACE_NO_STUDY_SAMPLING');
    assert.equal(surface.points.length, ownTrials.length, 'SURFACE_COMPLETE_OWN_TRIALS');
    assert.equal(surface.selected_trial_id, fact.selected_trial_id, 'SURFACE_OWN_SELECTION');
    assert.equal(new Set(surface.points.map(value => value.trial_id)).size, ownTrials.length, 'SURFACE_UNIQUE_OWN_TRIALS');
    assert.deepEqual(surface.points.map(value => value.trial_id).sort(), ownTrials.map(value => value.source_id).sort(), 'SURFACE_NO_CROSS_STUDY_TRIALS');
    for (const point of surface.points) {
      const retained = ownTrials.find(value => value.source_id === point.trial_id), trial = payload(retained);
      assert.equal(point.source_ordinal, Number(retained.source_ordinal), 'SURFACE_OWN_SOURCE_ORDINAL');
      assert.equal(point.objective, trial.objective, 'SURFACE_OWN_STAGE_A_OBJECTIVE');
      assert.equal(point.state, trial.state, 'SURFACE_OWN_TRIAL_STATE');
      sameParams(point.parameters, trial.parameters, 'SURFACE_OWN_TRIAL_PARAMS');
      assert.equal(point.selected, point.trial_id === fact.selected_trial_id, 'SURFACE_OWN_SELECTION_MARKER');
    }
    assert.equal(ownCandidates.length, fact.candidate_count, 'OWN_STUDY_CANDIDATE_COUNT');
    const picked = ownTrials.find(value => value.source_id === fact.selected_trial_id);
    assert(picked, 'OWN_SELECTED_TRIAL'); const trial = payload(picked);
    assert.equal(trial.state, 'COMPLETE', 'SELECTED_TRIAL_COMPLETE');
    const candidate = ownCandidates.find(value => payload(value).trial_facts.source_trial_id === trial.trial_facts.source_trial_id
      && sha(payload(value).parameters) === sha(fact.parameters));
    assert(candidate, 'OWN_SELECTED_CANDIDATE');
    assert.equal(payload(candidate).objective, fact.objective, 'INNER_CANDIDATE_J_NOT_STAGE_A_OBJECTIVE');
    sameParams(trial.parameters, fact.parameters, 'SELECTED_TRIAL_PARAMS');
    const publicFold = publics.split.fold_plan.folds.find(value => value.fold_id === fold.fold_id);
    assert.deepEqual(publicFold?.causal_selection, fact, 'PUBLIC_SPLIT_SOURCE_FACT');
    const order = ordering.folds.find(value => value.fold_id === fold.fold_id);
    assert.equal(order?.verdict, 'CAUSAL_DATA_TIME_SELECTION', 'ACTUAL_CAUSAL_DATA_TIME');
    assert.equal(order.selected_candidate.params_digest, sha(fact.parameters), 'ORDER_OWN_PARAMS_DIGEST');
    const generation = fold.child_audit?.records?.filter(value => value.context === 'out-of-sample generation') ?? [];
    if (generation.length > 0) {
      assert.equal(generation.length, 1, 'ONE_SOURCE_GENERATION_CHILD');
      assert.equal(order.oos_generation_child.state, 'MATCH', 'SOURCE_GENERATION_OWN_CANDIDATE_MATCH');
      assert.equal(order.oos_generation_child.candidate_id, generation[0].candidate_id, 'SOURCE_GENERATION_CANDIDATE_ID');
      assert.equal(order.selected_candidate.candidate_id, generation[0].candidate_id, 'OWN_SELECTED_CANDIDATE_ID');
    } else absences.push({ fold_id: fold.fold_id, fact: 'generation_child', value: order.oos_generation_child });
    const segment = publics.replay.execution.fold_capital.segments.find(value => value.fold_id === fold.fold_id);
    assert(segment, 'REPLAY_OWN_FOLD'); sameParams(segment.parameters, fact.parameters, 'REPLAY_OWN_PARAMS');
    assert.equal(segment.params_digest, sha(fact.parameters), 'REPLAY_OWN_PARAMS_DIGEST');
    const reportFold = publics.report.frozen_core.folds.rows.find(value => value.fold_id === fold.fold_id);
    assert.equal(reportFold?.score_basis, SCORE_BASIS, 'REPORT_SCORE_COMPONENT_BASIS');
    const text = Object.entries(fact.parameters).map(([key, value]) => `${key}=${value}`).join(' · ').slice(0, 1024);
    assert.equal(reportFold.params.text, text, 'REPORT_OWN_PARAMS');
    selected.push({ fold_id: fold.fold_id, study_id: fact.study_id, selected_trial_id: fact.selected_trial_id,
      inner_fold_count: fact.inner_fold_count, params_digest: sha(fact.parameters), parameters: fact.parameters });
  }
  assert(trials.every(row => studies.has(payload(row).trial_facts.study_id)), 'NO_EXTRA_TRIAL_STUDY');
  assert(candidates.every(row => studies.has(payload(row).trial_facts.study_id)), 'NO_EXTRA_CANDIDATE_STUDY');
  assert.equal(seal.summary.source_facts.temporal_guards.observed_inner_fold_count, innerCount, 'TOTAL_ACTUAL_INNER_COUNT');
  const last = payload(folds.at(-1)).causal_selection;
  for (const singleton of [seal.summary.selection, payload(selections[0]),
    { ...publics.search.selection, trial_id: publics.search.selection.selected_trial_id },
    { ...publics.freeze.frozen_selection, trial_id: publics.freeze.frozen_selection.selected_trial_id }]) {
    assert.equal(singleton.scope, 'LAST_FOLD_DEPLOYMENT', 'DEPLOYMENT_ONLY_SCOPE');
    assert.equal(singleton.fold_id, selected.at(-1).fold_id, 'DEPLOYMENT_LAST_FOLD');
    assert.equal(singleton.trial_id, last.selected_trial_id, 'DEPLOYMENT_LAST_TRIAL');
    sameParams(singleton.parameters, last.parameters, 'DEPLOYMENT_LAST_PARAMS');
  }
  const metricsComplete = folds.every(row => decimal(payload(row).causal_selection.candidate_oos_metric)
    && decimal(payload(row).causal_selection.candidate_decay));
  const means = metricsComplete ? { oos: folds.reduce((sum, row) => sum + Number(payload(row).causal_selection.candidate_oos_metric), 0) / 2,
    decay: folds.reduce((sum, row) => sum + Number(payload(row).causal_selection.candidate_decay), 0) / 2 } : null;
  for (const [name, api] of Object.entries(publics).filter(([name]) => ['compare', 'lineage'].includes(name))) {
    const run = name === 'compare' ? api.result?.attempts?.find(value => value.run_id === runId)
      : api.attempts?.find(value => value.primary_run?.run_id === runId)?.run_facts;
    const facts = name === 'compare' ? run?.original_metrics?.filter(value => value.definition_id.includes('outer-fold-selected')
      || value.definition_id.endsWith('-inner-is-mean-minus-outer-oos')).map(metric => ({ metric, role: metric.key }))
      : [['OOS_SHARPE', run?.oos_sharpe], ['DECAY', run?.decay]].filter(([, metric]) => metric?.scope === 'OUTER_FOLD_SELECTED_OOS_MEAN')
        .map(([role, metric]) => ({ metric, role }));
    for (const { metric, role } of facts ?? []) {
      if (metric?.availability?.state === 'AVAILABLE') {
        assert(means, 'NO_PARTIAL_OUTER_MEAN');
        assert(['OOS_SHARPE', 'DECAY'].includes(role), 'EXACT_NATIVE_OUTER_METRIC_ROLE');
        assert(role === 'DECAY' ? metric.definition_id.endsWith('-inner-is-mean-minus-outer-oos')
          : metric.definition_id.includes('outer-fold-selected-oos-'), `${name}_NATIVE_METRIC_COMPONENT_BASIS`);
        close(metric.value, role === 'DECAY' ? means.decay : means.oos, `${name}_INDEPENDENT_OUTER_MEAN`);
      } else if (metric) assert.equal(metric.value, null, `${name}_HONEST_ABSENCE`);
    }
    if (!facts?.length) absences.push({ fact: `${name}_outer_mean`, reason: 'NOT_PUBLISHED_OR_DIFFERENT_ALL_TIME_OOS_SCOPE' });
  }
  return { definition: 'INDEPENDENT_SEALED_CAUSAL_STUDY_TO_NAMED_API_V1', outer_folds: 2,
    trials: trials.length, candidates: candidates.length, actual_inner_folds: innerCount, selections: selected,
    parameter_sets_differ: selected[0].params_digest !== selected[1].params_digest,
    outer_means: means, typed_absences: absences, no_parameter_difference_requirement: true };
}

export async function causalInnerReceipt(home, label = 'b8-causal-inner-20261002') {
  assert(typeof home === 'string' && home.length > 0, 'EXPLICIT_OWNED_HOME_REQUIRED'); home = validateHome(home);
  assert(/^[a-z][a-z0-9-]{0,48}$/.test(label), 'RECEIPT_LABEL');
  const saved = loadSessions(home).identities.find(row => row.username === 'p23-owner');
  assert(saved?.id && saved.password, 'EXISTING_OWNER_ANCHOR_REQUIRED');
  const user = { ...saved, cookies: {} }, client = makeClient(user), path = join(home, `${label}.json`);
  const receipt = { schema_version: 'research.b8-causal-inner-owned-api.v1', project: PROJECT, base_url: BASE_URL,
    workspace_id: WORKSPACE, label, started_at_utc: new Date().toISOString(), identity: privateJson(join(home, 'identity.json')),
    scope: 'REAL_PUBLIC_P10_CHILD_P05_RS02_BFF_WITH_OPS_ONLY_DB_ORACLE_NOT_BROWSER_OR_ENGINE_RERUN', passed: false };
  let authenticated = false;
  try {
    receipt.images = Object.fromEntries(['control-api', 'portal-api', 'quant-worker-py'].map(service =>
      [service, docker(['inspect', '--format', '{{.Image}}', container(service)]).trim()]));
    await client.call('POST', '/api/auth/login', { username: user.username, credential: user.password }, [201]); authenticated = true;
    const context = (await client.call('GET', '/api/auth/context')).body;
    assert.equal(context.state, 'AUTHENTICATED'); assert.equal(context.principal.principalId, saved.id);
    receipt.operator = { username: user.username, principal_id: saved.id };
    const admitted = await admitRealRun(home, 'wfo-causal-inner', label, 'p23-owner', client);
    receipt.producer_receipt = admitted.path; receipt.run_id = admitted.receipt.run_id;
    const run = await waitForRun(client, admitted.path, admitted.receipt);
    receipt.requested_spec = run.requested_spec; receipt.preflight_response = run.preflight;
    receipt.created_response = run.created; receipt.progress = { transitions: run.transitions, final: run.final };
    assert.equal(run.final.body.current.effective_status, 'COMPLETED', 'REAL_CAUSAL_RUN_NOT_COMPLETED');
    const runId = run.run_id, read = suffix => client.call('GET', `/api/v1/quantbt/runs/${runId}/${suffix}?${new URLSearchParams({
      workspace_id: WORKSPACE, ...(['current-source/search', 'current-source/replay'].includes(suffix) ? { limit: '100' } : {}),
    })}`);
    receipt.responses = {};
    for (const [name, route] of Object.entries({ hub: 'evidence', evidence: 'current-source/evidence', split: 'current-source/split',
      search: 'current-source/search', freeze: 'current-source/freeze', replay: 'current-source/replay', report: 'report' })) receipt.responses[name] = await read(route);
    const alpha = run.requested_spec.alpha_binding.alpha_id;
    receipt.responses.compare = await client.call('GET', `/api/v1/research/alphas/${alpha}/compare?${new URLSearchParams({ workspace_id: WORKSPACE, mode: 'attempts' })}`, undefined, [200, 404, 409, 503]);
    receipt.responses.lineage = await client.call('GET', `/api/v1/research/alphas/${alpha}/lineage?${new URLSearchParams({ workspace_id: WORKSPACE, limit: '128' })}`, undefined, [200, 404, 409, 503]);
    const producer = dbQuery(`SELECT workspace_id,run_id,requested_spec_digest,effective_spec_digest,dataset_binding_digest,
      execution_profile_id,execution_profile_digest FROM research.run_producers WHERE workspace_id=$1 AND run_id=$2`, [WORKSPACE, runId]).rows;
    const preflight = dbQuery(`SELECT m.requested_spec,m.topology FROM research.preflight_manifests m JOIN research.run_producers p
      ON p.workspace_id=m.workspace_id AND p.preflight_token=m.preflight_token WHERE p.workspace_id=$1 AND p.run_id=$2`, [WORKSPACE, runId]).rows;
    const seals = dbQuery(`SELECT s.workspace_id,s.run_id,s.artifact_revision,s.source_adapter_id,s.profile_id,s.manifest_digest,
      s.retained_import_digest,s.source_transform_digest,s.table_rows,s.summary,
      EXISTS(SELECT 1 FROM research.artifacts a WHERE a.workspace_id=s.workspace_id AND a.run_id=s.run_id
        AND a.artifact_revision=s.artifact_revision AND a.manifest_digest=s.manifest_digest AND a.state='SEALED') AS artifact_sealed
      FROM research.current_source_seals_v1 s WHERE s.workspace_id=$1 AND s.run_id=$2 ORDER BY s.artifact_revision DESC LIMIT 2`, [WORKSPACE, runId]).rows;
    assert.equal(producer.length, 1, 'ONE_PRODUCER'); assert.equal(preflight.length, 1, 'ONE_IMMUTABLE_PREFLIGHT'); assert.equal(seals.length, 1, 'ONE_FRESH_SEAL');
    const rows = dbQuery(`SELECT workspace_id,run_id,artifact_revision,table_kind,source_ordinal,source_id,payload
      FROM research.current_source_rows_v1 WHERE workspace_id=$1 AND run_id=$2 AND artifact_revision=$3
      AND table_kind IN ('FOLD','TRIAL','CANDIDATE','SELECTION') ORDER BY table_kind,source_ordinal LIMIT 114`, [WORKSPACE, runId, Number(seals[0].artifact_revision)]).rows;
    receipt.ops_db = { producer: producer[0], preflight: preflight[0], seal: seals[0], rows };
    receipt.oracle = assertCausalInnerReceipt({ workspace_id: WORKSPACE, run_id: runId, ...receipt.ops_db, responses: receipt.responses });
    receipt.passed = true; return receipt;
  } catch (error) { receipt.failure = { name: error.name, code: error.code ?? null, message: error.message }; throw error; }
  finally {
    try { if (authenticated) { await client.call('POST', '/api/auth/logout', {}, [200, 201]); receipt.owner_session_revoked = true; } }
    finally { receipt.finished_at_utc = new Date().toISOString(); savePrivate(path, receipt); }
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const home = process.argv.find(arg => arg.startsWith('--home='))?.slice(7);
  const label = process.argv.find(arg => arg.startsWith('--label='))?.slice(8) ?? 'b8-causal-inner-20261002';
  causalInnerReceipt(home, label).then(receipt => console.log(`Owned causal-inner receipt PASS ${sha(receipt)}`))
    .catch(() => { console.error('Owned causal-inner receipt refused; inspect its private receipt.'); process.exitCode = 1; });
}
