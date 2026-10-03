import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareDirectWfo } from './wfo-direct-parity-receipt.mjs';

function fixture() {
  const source = { engine_version:'1.1.1', run_id:'rrun_test', engine_recomputed:true,
    production_runner_used:false, passed:true, pins:{manifest:'a'.repeat(64)},
    observation_rows_exact:2208, fold_count:13, trial_count:3, selected_parameters_exact:true,
    source_metrics_compared:6, direct_metrics:{ initial_equity:'20000.0', final_equity:'20301.191723679167',
      net_return_fraction:'0.01505958618395835',max_drawdown_fraction:'-0.016702041792833078' } };
  const api = { run_id:'rrun_test', availability:{state:'AVAILABLE'}, read_authority:'PORTAL_RETAINED_CURRENT_SOURCE',
    provenance:{source_manifest_digest:'a'.repeat(64)}, passport:{initial_equity:'20000', final_equity:'20301.191723679167',
      net_return_fraction:'0.01505958618395835',max_drawdown_fraction:'-0.016702041792833078'} };
  return { source, api, artifact:{manifest_digest:'a'.repeat(64)} };
}
const compare = f => compareDirectWfo(f.source, f.api, 'rrun_test', f.artifact);
test('direct engine, all accounting rows, seal and named BFF agree exactly', () => {
  assert.equal(compare(fixture()).full_observation_rows_exact,2208);
});
test('rejects retained-only or production-runner self-oracle', () => {
  const f=fixture(); f.source.engine_recomputed=false;
  assert.throws(()=>compare(f),/REAL_RECOMPUTATION_REQUIRED/);
  f.source.engine_recomputed=true; f.source.production_runner_used=true;
  assert.throws(()=>compare(f),/INDEPENDENT_ENGINE_ENTRY_REQUIRED/);
});
test('does not round away a decimal difference below binary64 precision', () => {
  const f=fixture(); f.api.passport.final_equity='20301.19172367916700001';
  assert.throws(()=>compare(f),/final_equity_BFF_DIFF/);
});
test('rejects authority, run and manifest drift', () => {
  for (const [change, code] of [
    [f=>f.api.run_id='rrun_other', /BFF_RUN_DRIFT/],
    [f=>f.api.read_authority='FIXTURE', /BFF_AUTHORITY_DRIFT/],
    [f=>f.artifact.manifest_digest='b'.repeat(64), /DATABASE_MANIFEST_DRIFT/],
  ]) { const f=fixture(); change(f); assert.throws(()=>compare(f),code); }
});
test('rejects incomplete profile, missing source comparison and unavailable BFF', () => {
  const f=fixture(); f.source.trial_count=0;
  assert.throws(()=>compare(f),/WHOLE_QUALIFIED_PROFILE_REQUIRED/);
  f.source.trial_count=3; f.api.availability.state='NOT_PUBLISHED';
  assert.throws(()=>compare(f),/BFF_AVAILABLE_REQUIRED/);
  f.api.availability.state='AVAILABLE'; f.source.source_metrics_compared=0;
  assert.throws(()=>compare(f),/SIX_NATIVE_METRICS_REQUIRED/);
  f.source.source_metrics_compared=6; f.source.direct_metrics={};
  assert.throws(()=>compare(f),/COMPLETE_BFF_METRIC_SET_REQUIRED/);
});
