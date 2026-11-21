/** Synthetic predicate tests only; never used to qualify or enable a recipe. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {assertModeTruth} from './full04-qualification.mjs';
const start=Date.UTC(2026,5,1),step=3600000,end=start+14*86400000;
function fixture(mode='mode_4_is_only_robust',schedule='global'){
  const pair={profile_id:'full04.unit-1h.v1',source_adapter_id:'full04.unit-adapter-1h.v1'};
  const row={profile_id:'p10.unit-1h.v1',profile_digest:'a'.repeat(64),public_profile:{timeframe:'1h',trial_default:3},
    descriptor:{optimization_mode:mode,optimization_schedule:schedule,source_clock:{bar_interval_ms:step},dataset_id:'crypto-binance-1m',
      alpha_binding_requirements:{alpha_version_id:'av_unit'},current_source:pair},budgets:{planning_max_bars:100000}};
  const binding={closed_bar_policy:'CLOSED_BARS_ONLY',source_manifest_digest:'b'.repeat(64),provenance:{
    metadata_index_source_manifest_digest:'b'.repeat(64),metadata_index_as_of_utc_ms:end+step,metadata_index_revision:'c'.repeat(64)}};
  const reads=Object.fromEntries(['evidence','report','release-candidate',...['evidence','split','search','freeze','replay']
    .map(p=>'current-source/'+p)].map(route=>[route,{status:200,body:{provenance:pair,integrity:{state:'MATCH'}}}]));
  reads['current-source/search'].body.search_contract={optuna_trials_per_study:3};
  reads['current-source/freeze'].body.frozen_selection={selected_trial_id:'0',selected_trial_ordinal:1,
    selected_trial_ordinal_scope:schedule==='global'?'RUN_GLOBAL':'STUDY_LOCAL'};
  reads['current-source/split'].body.fold_plan={folds:[{fold:1}]};
  reads.report.body.final_audit_applicable=false;
  reads['current-source/evidence'].body.optimizer_disclosure={optimization_mode:mode,optimization_schedule:schedule,
    calibration_sample:mode==='mode_5_full_robust'?'FULL_SAMPLE':mode==='mode_2_sbb'?'BOOTSTRAP_PROXY':'IS_ONLY',full_sample_used_for_selection:mode==='mode_5_full_robust',
    oos_used_for_selection:false,selection_target:{kind:'TRIAL',trial_id:'0'},
    mode_evidence:{kind:mode==='mode_2_sbb'?'BOOTSTRAP_PROXY':mode==='mode_3_flat_minima'?'PLATEAU':mode==='mode_5_full_robust'?'FULL_SAMPLE_ROBUST':'IS_ONLY_DISPERSION',sbb_samples:32}};
  const record={passed:true,profile_id:row.profile_id,profile_digest:row.profile_digest,
    identity:{images:{'control-api':{image_id:'unit-control'},'quant-worker-py':{image_id:'unit-worker'}}},
    run:{run_id:'rrun_unit',requested_spec:{alpha_binding:{alpha_version_id:'av_unit'},
      data:{dataset_id:'crypto-binance-1m',timeframe:'1h',symbol:'BTCUSDT'},walk_forward:{start:new Date(start).toISOString(),end_exclusive:new Date(end).toISOString()}},
      preflight:{body:{dataset_binding:binding,snapshot:{warmup:{bars:300,requested_bars:300,start_utc_ms:start-300*step,end_exclusive_utc_ms:start},row_count:636,quality:{passed:true}}}},
      final:{body:{current:{effective_status:'COMPLETED',terminal_materialization:'READY'}}}},
    reads,negative_cursor:{status:400},final_audit:{status:409}};
  return {row,record};
}
for(const [mode,schedule]of [['mode_4_is_only_robust','global'],['mode_4_is_only_robust','per_fold_causal'],
  ['mode_2_sbb','global'],['mode_5_full_robust','global']])test('accepts scoped wire metadata '+mode+'/'+schedule,()=>{
  const {row,record}=fixture(mode,schedule);assert.equal(assertModeTruth(row,record).mode,mode);
});
for(const [name,mode,schedule,mutate]of [
  ['cross-mode native disclosure','mode_4_is_only_robust','global',d=>{d.optimization_mode='mode_1';}],
  ['cross-study schedule','mode_4_is_only_robust','per_fold_causal',d=>{d.optimization_schedule='global';}],
  ['IS-only mode secretly uses OOS','mode_4_is_only_robust','global',d=>{d.oos_used_for_selection=true;}],
  ['Mode2 proxy mislabeled as realized bootstrap','mode_2_sbb','global',d=>{d.mode_evidence.kind='REALIZED_OOS';}],
  ['full-sample selection hidden','mode_5_full_robust','global',d=>{d.full_sample_used_for_selection=false;}],
])test('rejects '+name,()=>{
  const {row,record}=fixture(mode,schedule);mutate(record.reads['current-source/evidence'].body.optimizer_disclosure);
  assert.throws(()=>assertModeTruth(row,record));
});
test('a real centroid has no manufactured Optuna ordinal',()=>{
  const {row,record}=fixture('mode_3_flat_minima');
  const disclosure=record.reads['current-source/evidence'].body.optimizer_disclosure;
  disclosure.selection_target={kind:'SYNTHETIC_CENTROID',trial_id:null};disclosure.centroid={state:'AVAILABLE'};
  Object.assign(record.reads['current-source/freeze'].body.frozen_selection,{selected_trial_id:null,selected_trial_ordinal:null});
  assert.equal(assertModeTruth(row,record).selection_target_kind,'SYNTHETIC_CENTROID');
  record.reads['current-source/freeze'].body.frozen_selection.selected_trial_ordinal=0;
  assert.throws(()=>assertModeTruth(row,record));
});
test('full-sample may not receive a second OOS fold or untouched Final Audit',()=>{
  const {row,record}=fixture('mode_5_full_robust');
  record.reads['current-source/split'].body.fold_plan.folds.push({fold:2});
  assert.throws(()=>assertModeTruth(row,record));record.reads['current-source/split'].body.fold_plan.folds.pop();
  record.reads.report.body.final_audit_applicable=true;assert.throws(()=>assertModeTruth(row,record));
});
