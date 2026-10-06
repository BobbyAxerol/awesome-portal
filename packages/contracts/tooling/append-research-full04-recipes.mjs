/** Append mode-native FULL04 candidates. Existing rows/receipts are never rewritten. */
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=new URL('../../../',import.meta.url);
const path='apps/portal/registry/research-execution-recipes.v1.json';
const table=JSON.parse(readFileSync(new URL(path,root),'utf8'));
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'
  ?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const hash=v=>createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
const modes=[
  {method:'mode3-global',mode:'mode_3_flat_minima',schedule:'global',trials:5,
    optimizer:{flat_selector:'centroid',flat_top_fraction:1,flat_eps:1,flat_min_samples:2}},
  {method:'mode2-global',mode:'mode_2_sbb',schedule:'global',trials:3,
    optimizer:{scoring_backend:'proxy',sbb_samples:32,sbb_block_length:20,sbb_simulation:'stationary',candidate_selection_metric:'mean_is_sharpe'}},
  {method:'mode4-global',mode:'mode_4_is_only_robust',schedule:'global',trials:3,
    optimizer:{candidate_selection_metric:'is_only_robust',is_subperiods:3,flat_selector:'medoid'}},
  {method:'mode4-causal',mode:'mode_4_is_only_robust',schedule:'per_fold_causal',trials:3,
    optimizer:{candidate_selection_metric:'is_only_robust',is_subperiods:3,flat_selector:'medoid'}},
  {method:'mode5-global',mode:'mode_5_full_robust',schedule:'global',trials:3,
    optimizer:{candidate_selection_metric:'full_robust',is_subperiods:3,flat_selector:'medoid'}},
];
for(const mode of modes)for(const tf of ['1h','1m','5m','15m','30m','4h','1d']){
  const id=`p10.delta-${mode.method}-${tf}.v1`;
  if(table.recipes.some(r=>r.profile_id===id))continue;
  const template=table.recipes.find(r=>r.profile_id===`p10.delta-wfo-temporal-${tf}.v1`);
  assert(template,'EXACT_SOURCE_CLOCK_TEMPLATE_REQUIRED');
  const row=structuredClone(template),perFold=mode.schedule==='per_fold_causal';
  row.profile_id=id;
  row.descriptor={...row.descriptor,schema_version:'research.full04-delta-profile.v1',profile_id:id,
    optimization_mode:mode.mode,optimization_schedule:mode.schedule,
    trial_count:{min:mode.trials,max:mode.trials},trial_scope:perFold?'PER_OUTER_FOLD_STUDY':'GLOBAL_STUDY',
    ...(perFold?{max_total_trials:48}:{}),inner_validation:'NOT_APPLICABLE',
    optimizer_settings:mode.optimizer,
    current_source:{source_adapter_id:`full04.quantbt-signal-notional-${mode.method}-${tf}.v1`,
      profile_id:`full04.delta-signal-notional-${mode.method}-${tf}.v1`}};
  row.public_profile={...row.public_profile,profile_id:id,optimization_mode:mode.mode,
    optimization_schedule:mode.schedule,trial_count:{min:mode.trials,max:mode.trials},trial_default:mode.trials,
    trial_scope:perFold?'PER_OUTER_FOLD_STUDY':'GLOBAL_STUDY',...(perFold?{max_total_trials:48}:{}),
    inner_validation:'NOT_APPLICABLE'};
  row.feature_flags=['FEATURE_RESEARCH_RUN_PRODUCER','FEATURE_RESEARCH_WFO_PROFILE','FEATURE_RESEARCH_FULL03_PROFILE','FEATURE_RESEARCH_FULL04_PROFILE'];
  row.profile_digest=hash(row.descriptor);
  table.recipes.push(row);table.qualification_references.push({profile_id:id,recipe_digest:hash(row),
    kind:'CANDIDATE_NOT_QUALIFIED',receipt_path:null,receipt_sha256:null});
}
assert.equal(table.recipes.filter(r=>r.descriptor.schema_version==='research.full04-delta-profile.v1').length,35);
// Native Mode 5 is one full-span calibration fold, not an OOS WFO sequence.
for(const row of table.recipes.filter(r=>r.descriptor.schema_version==='research.full04-delta-profile.v1')){
  const ref=table.qualification_references.find(r=>r.profile_id===row.profile_id);
  assert.equal(ref.kind,'CANDIDATE_NOT_QUALIFIED','QUALIFIED_DESCRIPTOR_IS_IMMUTABLE');
  if(row.descriptor.optimization_mode==='mode_5_full_robust'){
    row.descriptor.fold_bounds={min:1,max:1};row.public_profile.fold_bounds={min:1,max:1};
  }
  if(row.descriptor.optimization_mode==='mode_2_sbb')row.descriptor.optimizer_settings.candidate_selection_metric='mean_is_sharpe';
  row.profile_digest=hash(row.descriptor);ref.recipe_digest=hash(row);
}
writeFileSync(new URL(path,root),JSON.stringify(table,null,2)+'\n');
console.log(JSON.stringify({recipes:table.recipes.length,full04_candidates:35}));
