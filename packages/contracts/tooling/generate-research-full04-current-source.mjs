/** FULL-04 additive mode contracts. Regeneration does not qualify a recipe. */
import {readFileSync,writeFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {replaceComponent} from "./generate-research-progress-truth.mjs";
import {selectedTrialPresentation} from "./generate-research-w1-presentation.mjs";
const ref=name=>({$ref:`#/components/schemas/${name}`});
const obj=properties=>({type:"object",additionalProperties:false,required:Object.keys(properties),properties});
const nullable=value=>({anyOf:[value,{type:"null"}]});
const token={type:"string",pattern:"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$"};
const dec={type:"string",pattern:"^-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?$",maxLength:96};
const count={type:"integer",minimum:0,maximum:1000000};
const digest={type:"string",pattern:"^[0-9a-f]{64}$"};
const params={type:"object",maxProperties:24,propertyNames:{pattern:"^[A-Za-z][A-Za-z0-9_]{0,63}$"},additionalProperties:dec};
export const objectiveKinds=["IS_MEAN_SHARPE","MODE_1_DECAY_J","INNER_VALIDATION_DECAY_J","OUTER_FOLD_DECAY_J",
  "SBB_BOOTSTRAP_ROBUST_J","PLATEAU_ROBUST_J","IS_ONLY_ROBUST_J","FULL_SAMPLE_ROBUST_J","FULL_SAMPLE_MEAN_SHARPE","NOT_PUBLISHED"];
const evidenceBase={source_locator:{type:"string",minLength:1,maxLength:256},reason_code:nullable(token)};
const dispersion={selector:nullable(token),is_subperiods:count,temporal_score:nullable(dec),temporal_q25:nullable(dec),
  temporal_mad:nullable(dec),temporal_count:nullable(count),is_only_robust_score:nullable(dec)};
export const full04ModeEvidence={oneOf:[
  obj({kind:{const:"PLATEAU"},...evidenceBase,selector:nullable(token),cluster_method:nullable(token),cluster_size:nullable(count),
    top_trials:nullable(count),medoid_trial_id:nullable(token),cluster_mean_objective:nullable(dec),cluster_best_objective:nullable(dec)}),
  obj({kind:{const:"BOOTSTRAP_PROXY"},...evidenceBase,scoring_backend:{const:"proxy"},sbb_samples:count,sbb_block_length:count,
    sbb_simulation:token,synthetic_oos_mean:nullable(dec),synthetic_oos_std:nullable(dec)}),
  obj({kind:{const:"IS_ONLY_DISPERSION"},...evidenceBase,...dispersion}),
  obj({kind:{const:"FULL_SAMPLE_ROBUST"},...evidenceBase,...dispersion,selection_sample_bars:count}),
],discriminator:{propertyName:"kind"}};
export const full04OptimizerDisclosure={...obj({
  schema_version:{const:"research.current-source-optimizer-disclosure.v1"},
  optimization_mode:{enum:["mode_2_sbb","mode_3_flat_minima","mode_4_is_only_robust","mode_5_full_robust"]},
  optimization_schedule:{enum:["global","per_fold_causal"]},
  selection_target:obj({kind:{enum:["TRIAL","STUDY_LOCAL_TRIAL","SYNTHETIC_CENTROID"]},trial_id:nullable(token),
    objective_kind:{enum:objectiveKinds},selection_score:nullable(dec),selection_score_kind:nullable(token)}),
  calibration_sample:{enum:["IS_ONLY","IS_OOS","FULL_SAMPLE","BOOTSTRAP_PROXY"]},
  oos_used_for_selection:{type:"boolean"},full_sample_used_for_selection:{type:"boolean"},
  mode_evidence:ref("OptimizerModeEvidence"),
}),description:"Source-retained optimizer evidence. Native objective and selector ranking score are separate. Bootstrap statistics are synthetic proxy, not realized OOS. A centroid has parameters and null trial identity; Mode 4 uses IS only without fabricated inner folds; Mode 5 is full-sample calibration, never untouched OOS.",
allOf:[{if:{properties:{selection_target:{properties:{kind:{const:"SYNTHETIC_CENTROID"}}}}},
  then:{required:["centroid"],properties:{optimization_mode:{const:"mode_3_flat_minima"},selection_target:{properties:{trial_id:{type:"null"}}}}},
  else:{not:{required:["centroid"]},properties:{selection_target:{properties:{trial_id:token}}}}},
  {if:{properties:{optimization_mode:{const:"mode_5_full_robust"}}},
    then:{properties:{calibration_sample:{const:"FULL_SAMPLE"},full_sample_used_for_selection:{const:true},oos_used_for_selection:{const:false}}},
    else:{properties:{full_sample_used_for_selection:{const:false}}}},
  {if:{properties:{optimization_mode:{const:"mode_4_is_only_robust"}}},
    then:{properties:{calibration_sample:{const:"IS_ONLY"},oos_used_for_selection:{const:false}}}},
  {if:{properties:{optimization_schedule:{const:"per_fold_causal"}}},
    then:{properties:{optimization_mode:{const:"mode_4_is_only_robust"}}}},
  ...Object.entries({mode_2_sbb:"BOOTSTRAP_PROXY",mode_3_flat_minima:"PLATEAU",mode_4_is_only_robust:"IS_ONLY_DISPERSION",mode_5_full_robust:"FULL_SAMPLE_ROBUST"})
    .map(([mode,kind])=>({if:{properties:{optimization_mode:{const:mode}}},then:{properties:{mode_evidence:{properties:{kind:{const:kind}}}}}})),
],
};
full04OptimizerDisclosure.properties.centroid=obj({state:{const:"AVAILABLE"},parameters:params,medoid_trial_id:nullable(token),
  cluster_size:nullable(count),cluster_method:nullable(token),requires_evaluation:{type:"boolean"}});
export const full04Mode4Selection=obj({schema_version:{const:"research.current-source-mode4-selection.v1"},
  scope:{const:"OUTER_FOLD_SELECTION"},study_id:token,fold_seed:{type:"integer",minimum:1,maximum:Number.MAX_SAFE_INTEGER},
  source_trial_id:token,selected_trial_id:token,parameters:params,objective:nullable(dec),
  objective_kind:{enum:["IS_MEAN_SHARPE","IS_ONLY_ROBUST_J"]},candidate_is_metric:nullable(dec),
  candidate_count:{type:"integer",minimum:1,maximum:3},study_trial_rows:{const:3},outer_oos_used_for_selection:{const:false},
  causality_claim:{const:"strict_fold_local_retraining"},params_digest:digest,
  selection_sequence:{type:"integer",minimum:0,maximum:15},params_frozen_at_utc_ms:nullable({type:"integer",minimum:0,maximum:Number.MAX_SAFE_INTEGER})});
export function amendFull04CurrentSource(original,file="research-current-source"){
  const document=JSON.parse(original),schemas=document.components.schemas,updates={
    OptimizerModeEvidence:full04ModeEvidence,OptimizerDisclosure:full04OptimizerDisclosure,
  };
  const edit=name=>updates[name]??=structuredClone(schemas[name]);
  const add=(value,item)=>{if(!value.enum.includes(item))value.enum.push(item);};
  // Old monthly DTOs remain readable. Only source-published FULL_SAMPLE
  // metadata opts into the additive definitions and first-observation basis.
  for(const[name,value]of Object.entries(schemas)){
    const changed=structuredClone(value);let modified=false;
    const walk=node=>{if(!node || typeof node!=="object")return;
      if(node.enum?.includes("FIRST_OOS_CLOSE")&&!node.enum.includes("FIRST_FULL_SAMPLE_CLOSE")){node.enum.push("FIRST_FULL_SAMPLE_CLOSE");modified=true;}
      for(const child of Object.values(node))walk(child);};
    walk(changed);if(modified)updates[name]=changed;
  }
  if(file==="research-current-source"){
    edit("Common").properties.optimizer_disclosure=ref("OptimizerDisclosure");
    const drawdownSource=edit("CandidateDrawdown").properties.source.anyOf[0];
    delete drawdownSource.const;
    drawdownSource.enum=["RETAINED_STITCHED_OOS_PATH","RETAINED_FULL_SAMPLE_CALIBRATION_PATH"];
    const derivation=edit("SeriesDerivation");
    delete derivation.properties.scope.const;derivation.properties.scope.enum=["OOS","FULL_SAMPLE"];
    add(derivation.properties.definition_id,"FULL_SAMPLE_MONTH_CLOSE_OVER_FIRST_OR_PREVIOUS_OBSERVED_MONTH_CLOSE_V1");
    updates.Mode4Selection=full04Mode4Selection;
    updates.DisplayMode4Selection={...structuredClone(full04Mode4Selection),properties:{...structuredClone(full04Mode4Selection.properties),...selectedTrialPresentation}};
    edit("Fold").properties.mode4_selection=ref("DisplayMode4Selection");
    const foldPlan=edit("Split").allOf[1].properties.fold_plan;
    add(edit("Split").allOf[1].properties.guards.properties.train_test_disjoint.properties.verdict,"NOT_APPLICABLE");
    add(foldPlan.properties.chronology,"SOURCE_OBSERVED_FULL_SAMPLE");
    if(!foldPlan.oneOf.some(value=>value.properties.chronology.const==="SOURCE_OBSERVED_FULL_SAMPLE"))
      foldPlan.oneOf.push({properties:{chronology:{const:"SOURCE_OBSERVED_FULL_SAMPLE"},folds:{minItems:1,maxItems:1}}});
    for(const name of ["TrialFacts","Selection","SelectionRole"])edit(name).properties.objective_kind.enum=[...objectiveKinds];
    add(edit("SearchStudySurface").properties.scope,"IS_ONLY_OUTER_STUDY");
    add(edit("FoldOrderingRow").properties.verdict,"NOT_CAUSAL_FULL_SAMPLE_SELECTION");
    edit("FoldOrdering").properties.counts.properties.not_causal_full_sample_selection={type:"integer",minimum:0};
  }else if(file==="research-report"){
    edit("FrozenCoreV2").properties.optimizer_disclosure=ref("OptimizerDisclosure");
    add(edit("FinalAudit").properties.kind,"NOT_APPLICABLE");
    for(const name of ["MetricV2","HeadlineV2"])add(edit(name).properties.scope,"FULL_SAMPLE");
    add(edit("EquityV2").properties.scope,"FULL_SAMPLE_CALIBRATION");
  }else throw new Error(`Unsupported FULL-04 mode document ${file}`);
  let next=original;
  for(const[name,value]of Object.entries(updates))next=schemas[name]
    ?replaceComponent(next,name,value,next.indexOf('"schemas": {'))
    :next.replace('"schemas": {\n',`"schemas": {\n      "${name}": ${JSON.stringify(value)},\n`);
  return next;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const only=process.argv.find(arg=>arg.startsWith("--only="))?.slice(7);
  for(const file of only?[only]:["research-current-source","research-report"]){
    const path=new URL(`../openapi/${file}.openapi.json`,import.meta.url),old=readFileSync(path,"utf8"),next=amendFull04CurrentSource(old,file);
    if(process.argv.includes("--check")){if(old!==next)throw new Error(`FULL-04 contract drift ${file}`);}else if(next!==old)writeFileSync(path,next);
  }
}
