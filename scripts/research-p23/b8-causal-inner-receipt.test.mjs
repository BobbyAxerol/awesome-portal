/** Synthetic oracle units only; never an admission, engine run or runtime receipt. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { assertCausalInnerReceipt, CAUSAL_PROFILE } from './b8-causal-inner-receipt.mjs';

const canon = value => Array.isArray(value) ? value.map(canon) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canon(value[key])])) : value;
const sha = value => createHash('sha256').update(JSON.stringify(canon(value))).digest('hex');
const BAR = 3_600_000;
function fixture(same = false) {
  const workspace = 'ws_synthetic', run = 'rrun_synthetic', digest = 'a'.repeat(64);
  const spec = { schema_version: 'research.requested-spec.v2', optimization_schedule: 'per_fold_causal', optuna_trials: 3,
    data: { timeframe: '1h' },
    walk_forward: { inner: { split_frequency: 'weekly', window_mode: 'rolling', train_window: '14D', min_folds: 2 } } };
  const rows = [], facts = [];
  const wrap = (kind, ordinal, id, value) => ({ workspace_id: workspace, run_id: run, artifact_revision: 1,
    table_kind: kind, source_ordinal: ordinal, source_id: id, payload: value });
  for (let ordinal = 0; ordinal < 2; ordinal++) {
    const id = String(ordinal), parameters = { window: String(same ? 30 : 30 + ordinal) };
    const fact = { scope: 'OUTER_FOLD_SELECTION', study_id: id, selected_trial_id: `study_${id}.trial_0`, parameters,
      objective: '0.5', candidate_count: 1, candidate_is_metric: '0.8', candidate_oos_metric: String(ordinal + 1), candidate_decay: '0.2',
      candidate_is_scope: 'INNER_VALIDATION_IS_MEAN', candidate_oos_scope: 'OUTER_FOLD_OOS',
      candidate_decay_scope: 'INNER_IS_MEAN_MINUS_OUTER_OOS', outer_oos_used_for_selection: false,
      inner_fold_count: 2, inner_validation: { inner_split_frequency: 'weekly', inner_window_mode: 'rolling', inner_train_window: '14D', inner_min_folds: 2 },
      inner_folds: [0, 1].map(inner => ({ inner_fold_id: String(inner), train_start_utc_ms: 0,
        train_end_utc_ms: (10 + inner * 20) * BAR, test_start_utc_ms: (11 + inner * 20) * BAR,
        test_end_utc_ms: (19 + inner * 20) * BAR, outer_oos_used_for_selection: false })) };
    facts.push(fact);
    rows.push(wrap('FOLD', ordinal, id, { fold_id: id, train_start_utc_ms: 0, train_end_utc_ms: 90 * BAR,
      test_start_utc_ms: (100 + ordinal * 100) * BAR, test_end_utc_ms: (199 + ordinal * 100) * BAR,
      causal_selection: fact, child_audit: { records: [{ context: 'out-of-sample generation', candidate_id: String(ordinal).repeat(24) }] } }));
    for (let local = 0; local < 3; local++) rows.push(wrap('TRIAL', ordinal * 3 + local, `study_${id}.trial_${local}`,
      { state: 'COMPLETE', objective: '0.9', parameters, trial_facts: { study_id: id, source_trial_id: String(local) } }));
    rows.push(wrap('CANDIDATE', ordinal, `study_${id}.trial_0`, { objective: '0.5', parameters,
      trial_facts: { study_id: id, source_trial_id: '0' } }));
  }
  const selection = { scope: 'LAST_FOLD_DEPLOYMENT', fold_id: '1', trial_id: facts[1].selected_trial_id,
    objective: '0.5', parameters: facts[1].parameters };
  rows.push(wrap('SELECTION', 0, 'selected', selection));
  const producer = { workspace_id: workspace, run_id: run, requested_spec_digest: sha(spec), effective_spec_digest: digest,
    dataset_binding_digest: digest, execution_profile_id: CAUSAL_PROFILE.execution_id, execution_profile_digest: CAUSAL_PROFILE.execution_digest };
  const seal = { workspace_id: workspace, run_id: run, artifact_revision: 1, artifact_sealed: true,
    source_adapter_id: CAUSAL_PROFILE.source_id, profile_id: CAUSAL_PROFILE.source_profile,
    manifest_digest: digest, retained_import_digest: digest, table_rows: { FOLD: 2, TRIAL: 6, CANDIDATE: 2, SELECTION: 1 },
    summary: { selection, source_facts: { search: { n_studies: 2 }, claims: { oos_used_for_selection: false }, temporal_guards: { observed_inner_fold_count: 4 } } } };
  const provenance = { profile_id: CAUSAL_PROFILE.source_profile, source_manifest_digest: digest, retained_import_digest: digest,
    requested_spec_digest: sha(spec), effective_spec_digest: digest, dataset_binding_digest: digest };
  const response = body => ({ status: 200, body: { run_id: run, availability: { state: 'AVAILABLE' }, provenance, ...body } });
  const singleton = { ...selection, selected_trial_id: selection.trial_id };
  const responses = {
    evidence: response({}), split: response({ fold_plan: { folds: facts.map((fact, index) => ({ fold_id: String(index), causal_selection: fact })) } }),
    search: response({ selection: singleton, pool: { reevaluation_scope: 'PER_FOLD_STUDY',
      trials_evaluated: { state: 'AVAILABLE', value: 6 }, scored_unpruned: { state: 'AVAILABLE', value: 6 },
      reevaluated: { state: 'AVAILABLE', value: 2 }, selected: { state: 'AVAILABLE', value: 2 },
      top_is_k: { state: 'NOT_PUBLISHED', value: null }, rule: { state: 'NOT_PUBLISHED' } },
      surface: { state: 'NOT_APPLICABLE', objective_kind: 'NOT_PUBLISHED', source_trial_count: 6, complete_trial_count: 6, emitted_point_count: 0,
        points: [], selected_trial_id: null, best_is_trial_id: null, objective_ramp: { minimum: null, maximum: null },
        grid: { state: 'NOT_APPLICABLE', cells: [] }, parameter_frequency: { pool_count: 0 } },
      surfaces_by_study: facts.map((fact, index) => ({ scope: 'INNER_VALIDATION_OUTER_STUDY', fold_id: String(index), study_id: fact.study_id,
        surface: { state: 'AVAILABLE', objective_kind: 'IS_MEAN_SHARPE', source_trial_count: 3, complete_trial_count: 3,
          emitted_point_count: 3, selected_trial_id: fact.selected_trial_id,
          points: rows.filter(row => row.table_kind === 'TRIAL' && row.payload.trial_facts.study_id === fact.study_id).map(row => ({
            trial_id: row.source_id, source_ordinal: row.source_ordinal, state: row.payload.state, objective: row.payload.objective,
            parameters: row.payload.parameters, selected: row.source_id === fact.selected_trial_id,
          })) } })),
      ledger: { source_trial_count: 6, trials: rows.filter(row => row.table_kind === 'TRIAL').map(row => ({
      trial_id: row.source_id, parameters: row.payload.parameters, objective: row.payload.objective,
      facts: { study_id: row.payload.trial_facts.study_id, evaluation_scope: 'INNER_VALIDATION' },
    })) } }), freeze: response({ frozen_selection: singleton, fold_ordering: {
      selection_scope: 'PER_FOLD', wall_clock: { state: 'NOT_PUBLISHED' }, frozen_candidate: { candidate_id: null },
      folds: facts.map((fact, index) => ({ fold_id: String(index), verdict: 'CAUSAL_DATA_TIME_SELECTION',
        selected_candidate: { params_digest: sha(fact.parameters), candidate_id: String(index).repeat(24) },
        oos_generation_child: { state: 'MATCH', candidate_id: String(index).repeat(24) } })),
    } }), replay: response({ execution: { fold_capital: { segments: facts.map((fact, index) => ({ fold_id: String(index), parameters: fact.parameters, params_digest: sha(fact.parameters) })) } } }),
    report: response({ frozen_core: { folds: { rows: facts.map((fact, index) => ({ fold_id: String(index),
      score_basis: 'INNER_VALIDATION_IS_MEAN_AND_OUTER_FOLD_OOS', params: { text: `window=${fact.parameters.window}` } })) } } }),
    compare: { status: 503, body: { error: { code: 'FEATURE_DISABLED' } } },
    lineage: { status: 200, body: { attempts: [{ primary_run: { run_id: run }, run_facts: {
      oos_sharpe: { scope: 'OUTER_FOLD_SELECTED_OOS_MEAN', definition_id: 'research.current-source.v1.outer-fold-selected-oos-sharpe-mean',
        value: '1.5', availability: { state: 'AVAILABLE' } },
      decay: { scope: 'OUTER_FOLD_SELECTED_OOS_MEAN', definition_id: 'research.current-source.v1.outer-fold-mean-inner-is-mean-minus-outer-oos',
        value: '0.2', availability: { state: 'AVAILABLE' } },
    } }] } },
  };
  return { workspace_id: workspace, run_id: run, producer, seal, rows, responses,
    preflight: { requested_spec: spec, topology: { plan_source: 'quantbt.walkforward.WalkForwardEngine.build_folds',
      folds: [0, 1].map(index => ({ inner_fold_count: 2, train: { start_utc_ms: 0, end_exclusive_utc_ms: 91 * BAR },
        outer_oos: { start_utc_ms: (100 + index * 100) * BAR, end_exclusive_utc_ms: (200 + index * 100) * BAR } })) } } };
}

test('synthetic oracle binds own studies, source scopes, per-fold replay/report and deployment singleton', () => {
  const value = assertCausalInnerReceipt(fixture());
  assert.equal(value.actual_inner_folds, 4); assert.equal(value.trials, 6); assert.equal(value.outer_means.oos, 1.5);
  assert.equal(value.parameter_sets_differ, true);
  assert.equal(assertCausalInnerReceipt(fixture(true)).parameter_sets_differ, false);
});

for (const [name, mutate, reason] of [
  ['wrong execution digest', v => { v.producer.execution_profile_digest = 'f'.repeat(64); }, 'EXECUTION_PIN'],
  ['foreign retained row', v => { v.rows[0].workspace_id = 'foreign'; }, 'ROW_WORKSPACE'],
  ['missing actual inner fold', v => { v.rows[0].payload.causal_selection.inner_folds.pop(); }, 'OBSERVED_INNER_COUNT'],
  ['inner enters outer OOS', v => { v.rows[0].payload.causal_selection.inner_folds[0].test_end_utc_ms = 100 * BAR; }, 'INNER_INSIDE_OUTER_IS'],
  ['wrong native outer train bound', v => { v.rows[0].payload.train_end_utc_ms -= BAR; }, 'IMMUTABLE_OUTER_TRAIN_END_BOUND'],
  ['wrong native outer OOS bound', v => { v.rows[0].payload.test_end_utc_ms -= BAR; }, 'IMMUTABLE_OUTER_OOS_END_BOUND'],
  ['inner candidate labelled outer fold', v => { v.responses.search.body.pool.reevaluation_scope = 'FOLD'; }, 'CAUSAL_POOL_INNER_STUDY_SCOPE'],
  ['incomplete pool source count', v => { v.responses.search.body.pool.reevaluated.value = 1; }, 'CAUSAL_POOL_reevaluated_SOURCE_COUNT'],
  ['global causal surface ranking', v => { v.responses.search.body.surface.state = 'AVAILABLE'; }, 'NO_RUN_GLOBAL_CAUSAL_SURFACE'],
  ['global causal best IS', v => { v.responses.search.body.surface.best_is_trial_id = 'study_1.trial_0'; }, 'NO_GLOBAL_BEST_IS'],
  ['lost actual complete count', v => { v.responses.search.body.surface.complete_trial_count = 0; }, 'ACTUAL_COMPLETED_TRIAL_COUNT_NOT_GLOBAL_RANKING'],
  ['missing own study surface', v => { v.responses.search.body.surfaces_by_study.pop(); }, 'EXACT_OWN_STUDY_SURFACES'],
  ['cross-study surface trial', v => { v.responses.search.body.surfaces_by_study[0].surface.points[0].trial_id = 'study_1.trial_0'; }, 'SURFACE_NO_CROSS_STUDY_TRIALS'],
  ['deployment surface selected in first fold', v => { v.responses.search.body.surfaces_by_study[0].surface.selected_trial_id = 'study_1.trial_0'; }, 'SURFACE_OWN_SELECTION'],
  ['wrong native decay mean equals outer OOS mean', v => { v.responses.lineage.body.attempts[0].run_facts.decay.value = '1.5'; }, 'lineage_INDEPENDENT_OUTER_MEAN'],
  ['unlabelled native decay components', v => { v.responses.lineage.body.attempts[0].run_facts.decay.definition_id = 'research.current-source.v1.outer-fold-selected-decay-mean'; }, 'lineage_NATIVE_METRIC_COMPONENT_BASIS'],
  ['changed immutable inner pin', v => { v.rows[0].payload.causal_selection.inner_validation.inner_train_window = '7D'; }, 'IMMUTABLE_inner_train_window'],
  ['outer OOS selection use', v => { v.rows[0].payload.causal_selection.outer_oos_used_for_selection = true; }, 'FOLD_OUTER_OOS_NOT_SELECTION_INPUT'],
  ['candidate objective substitutes Stage A', v => { v.rows.find(r => r.table_kind === 'CANDIDATE').payload.objective = '0.9'; }, 'INNER_CANDIDATE_J_NOT_STAGE_A_OBJECTIVE'],
  ['candidate study collision', v => { v.rows.find(r => r.table_kind === 'CANDIDATE').payload.trial_facts.study_id = '1'; }, 'OWN_STUDY_CANDIDATE_COUNT'],
  ['global singleton replayed in first fold', v => { v.responses.replay.body.execution.fold_capital.segments[0].parameters = { window: '31' }; }, 'REPLAY_OWN_PARAMS'],
  ['fake generation match', v => { v.responses.freeze.body.fold_ordering.folds[0].oos_generation_child.state = 'MISMATCH'; }, 'SOURCE_GENERATION_OWN_CANDIDATE_MATCH'],
  ['unlabelled inner score', v => { delete v.responses.report.body.frozen_core.folds.rows[0].score_basis; }, 'REPORT_SCORE_COMPONENT_BASIS'],
  ['deployment labels global', v => { v.responses.search.body.selection.scope = 'GLOBAL'; }, 'DEPLOYMENT_ONLY_SCOPE'],
]) test(`synthetic oracle refuses ${name}`, () => {
  const value = fixture(); mutate(value); assert.throws(() => assertCausalInnerReceipt(value), new RegExp(reason));
});

test('synthetic Compare reads DECAY typed role under explicit mixed-component definition', () => {
  const value = fixture();
  value.responses.compare = { status: 200, body: { result: { attempts: [{ run_id: value.run_id, original_metrics: [
    { key: 'OOS_SHARPE', definition_id: 'research.compare.metric.v1.outer-fold-selected-oos-sharpe-mean', value: '1.5', availability: { state: 'AVAILABLE' } },
    { key: 'DECAY', definition_id: 'research.compare.metric.v1.outer-fold-mean-inner-is-mean-minus-outer-oos', value: '0.2', availability: { state: 'AVAILABLE' } },
  ] }] } } };
  assert.equal(assertCausalInnerReceipt(value).outer_means.decay, 0.2);
  value.responses.compare.body.result.attempts[0].original_metrics[1].value = '1.5';
  assert.throws(() => assertCausalInnerReceipt(value), /compare_INDEPENDENT_OUTER_MEAN/);
});

test('operator entry requires explicit home, fresh cookies/logout, named profile and read-only scoped DB', () => {
  const code = readFileSync(new URL('./b8-causal-inner-receipt.mjs', import.meta.url), 'utf8');
  assert(code.includes('EXPLICIT_OWNED_HOME_REQUIRED'));
  assert(code.includes('cookies: {}'));
  assert(code.includes("'/api/auth/logout'"));
  assert(code.includes("admitRealRun(home, 'wfo-causal-inner'"));
  assert(code.includes('WHERE workspace_id=$1 AND run_id=$2'));
  assert(!code.includes('8095') && !code.includes('prepareSessions(') && !code.includes('change-password'));
  assert(!/\b(?:UPDATE|DELETE|TRUNCATE|DROP|INSERT)\s/i.test(code));
});
