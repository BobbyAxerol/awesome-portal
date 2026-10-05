/** S02 canonical wire definitions and SYNTHETIC fixtures, not product evidence. */
import {readFileSync,writeFileSync} from "node:fs";
const root=new URL("../",import.meta.url),check=process.argv.includes("--check");
const old=JSON.parse(readFileSync(new URL("openapi/research-preflight.openapi.json",root)));
const obj=p=>({type:"object",additionalProperties:false,required:Object.keys(p),properties:p});
const ref=n=>({$ref:`#/components/schemas/${n}`});
const nullable=s=>({anyOf:[s,{type:"null"}]});
const str={type:"string"},id={...str,pattern:"^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$"};
const ms={type:"integer",minimum:0,maximum:9007199254740991},count={type:"integer",minimum:0,maximum:100000};
const digest={...str,pattern:"^[a-f0-9]{64}$"},reason={...str,pattern:"^[A-Z][A-Z0-9_]{2,159}$"};
const array=(items,maxItems,minItems=0)=>({type:"array",items,maxItems,minItems});
const en=(...values)=>({enum:values});
const bounds=obj({min:count,max:count});
const context=obj({workspace_id:id,alpha_id:id,alpha_version_id:id,dataset_id:id,
  symbol:{...str,pattern:"^[A-Z0-9][A-Z0-9_-]{1,31}$"},timeframe:{...str,pattern:"^[1-9][0-9]*(?:min|m|h|d)$"}});
const profile=obj({profile_id:id,state:en("ENABLED","DISABLED"),reason_code:nullable(reason),engine_release_id:id,execution_route:id,
  protocol:en("three_window_decay","advanced"),optimization_mode:id,optimization_schedule:id,
  requested_spec_versions:array(en("research.requested-spec.v1","research.requested-spec.v2"),2,1),timeframe:id,
  trial_count:bounds,trial_default:{...count,minimum:1},trial_scope:en("GLOBAL_STUDY","PER_OUTER_FOLD_STUDY"),max_total_trials:nullable({...count,minimum:1}),
  seed_policy:en("LOCKED","FORBIDDEN","REQUIRED","OPTIONAL"),random_seed:nullable({type:"integer",minimum:0}),max_span_days:nullable({...count,minimum:1}),fold_bounds:nullable(bounds),
  frequencies:array(id,8),window_modes:array(en("expanding","rolling"),2),
  parameter_policy:en("FIXED_NO_OVERRIDES","DECLARED_PINS_ONLY","DELTA_SEARCH_WITH_QUALIFIED_PINS"),
  allowed_pin_names:array({...str,pattern:"^[A-Za-z][A-Za-z0-9_]{0,63}$"},12),
  inner_validation:en("NOT_APPLICABLE","NOT_ADMITTED_GLOBAL_RETENTION_ONLY","REQUIRED_ENGINE_NESTED_OUTER_IS_ONLY"),
  inner_constraints:nullable(obj({fold_bounds:bounds,frequencies:array(id,8),window_modes:array(id,2),train_window_pattern:{...str,maxLength:160}})),
  temporal_guards:obj({policy:en("V1_ABSENT_V2_EXPLICIT","NOT_APPLICABLE"),
    defaults:nullable(obj({label_horizon_bars:count,purge_bars:count,embargo_bars:count})),max_bars:nullable(count),zero_semantics:{const:"ZERO_APPLIES_NO_TEMPORAL_GUARD"}}),
  independent_holdout:{type:"boolean"}});
profile.allOf=[{if:{properties:{state:{const:"ENABLED"}}},then:{properties:{reason_code:{type:"null"}}},else:{properties:{reason_code:reason}}}];
const options=obj({schema_version:{const:"research.run-setup-options.v1"},context:ref("Context"),scope:{const:"CONFIGURATION_FACTS_NOT_RUN_AUTHORIZATION"},
  source_revision:digest,catalog_revision:nullable(digest),as_of_utc_ms:nullable(ms),warmup_bars:count,source_timezone:en("UTC","Asia/Ho_Chi_Minh"),profiles:array(ref("Profile"),6),preflight_required:{const:true}});
const span=obj({start_utc_ms:ms,end_exclusive_utc_ms:ms,bars:{...count,minimum:1}});
const patch={oneOf:[obj({protocol:{const:"three_window_decay"},windows:obj({is:span,oos:span,holdout:span})}),
  obj({protocol:{const:"advanced"},walk_forward:obj({...span.properties,first_oos_utc_ms:ms,frequency:en("weekly","monthly","quarterly"),window_mode:en("expanding","rolling"),train_window:nullable(str)})})]};
const metadata=obj({schema_version:{const:"research.window-suggestion-metadata.v1"},state:en("AVAILABLE","NOT_PUBLISHED"),reason_code:nullable(reason),
  dataset_id:id,symbol:id,timeframe:id,catalog_revision:nullable(digest),as_of_utc_ms:nullable(ms),source_timezone:en("UTC","Asia/Ho_Chi_Minh"),warmup_bars:count,
  range_origin:en("EXPLICIT_UNCHANGED","PROFILE_BOUNDED_AUTOMATIC"),patch:nullable(ref("WindowPatch"))});
metadata.allOf=[{if:{properties:{state:{const:"AVAILABLE"}}},then:{properties:{reason_code:{type:"null"},patch:ref("WindowPatch"),catalog_revision:digest,as_of_utc_ms:ms}},else:{properties:{reason_code:reason,patch:{type:"null"}}}}];
const request=obj({...context.properties,profile_id:id,options_revision:digest,start_utc_ms:ms,end_exclusive_utc_ms:ms,
  frequency:en("weekly","monthly","quarterly"),window_mode:en("expanding","rolling"),train_window:{...str,pattern:"^[1-9][0-9]{0,4}(?:D|h)$"},initial_train_bars:{...count,minimum:1}});
request.required=["alpha_id","alpha_version_id","dataset_id","symbol","timeframe","profile_id","options_revision"];
request.dependentRequired={start_utc_ms:["end_exclusive_utc_ms"],end_exclusive_utc_ms:["start_utc_ms"]};
const suggestion=obj({schema_version:{const:"research.window-suggestion.v1"},context:ref("Context"),profile_id:id,options_revision:digest,
  scope:{const:"EDITABLE_HEURISTIC_NOT_PREFLIGHT_OR_RUN_AUTHORIZATION"},policy:{const:"INDEXED_BAR_SPLIT_70_20_10_OR_HALF_INITIAL_IS_V1"},
  metadata:ref("SuggestionMetadata"),fold_authority:{const:"EXISTING_DECLARATION_ESTIMATE_AND_P08_PLANNER"},preflight_required:{const:true}});
const responses=name=>Object.fromEntries([200,400,401,403,404,409,502,503].map(status=>[status,{description:status===200?"Read-only setup facts; no authorization":"Typed refusal",content:{"application/json":{schema:ref(status===200?name:"Problem")}}}]));
const doc={openapi:"3.1.0",info:{title:"Research New Run setup",version:"1.0.0",description:"Alpha-bound current Portal executor facts and editable indexed-bar hints. No HMD scan, execution, preflight token or admission widening. Advanced folds remain engine/P08 authoritative."},
  paths:{"/api/v1/research/runs/setup-options":{get:{operationId:"researchRunSetupOptionsGetV1",security:[{portalSession:[]}],
    parameters:Object.entries(context.properties).map(([name,schema])=>({name,in:"query",required:name!=="workspace_id",schema})),responses:responses("SetupOptions")}},
    "/api/v1/research/runs/window-suggestions":{post:{operationId:"researchRunWindowSuggestionPostV1",security:[{portalSession:[]}],
      description:"Read-only POST requires same-origin and CSRF; apply only after confirming; discard after context changes.",
      requestBody:{required:true,content:{"application/json":{schema:ref("SuggestionRequest")}}},responses:responses("WindowSuggestion")}}},
  components:{securitySchemes:{portalSession:{type:"apiKey",in:"cookie",name:"portal_session"}},schemas:{Context:context,Profile:profile,SetupOptions:options,
    WindowPatch:patch,SuggestionMetadata:metadata,SuggestionRequest:request,WindowSuggestion:suggestion,
    FieldPath:old.components.schemas.FieldPath,Problem:old.components.schemas.Problem}}};
function emit(path,value){const next=JSON.stringify(value,null,2)+"\n",url=new URL(path,root);if(check){if(readFileSync(url,"utf8")!==next)throw new Error(`${path} drift`);}else writeFileSync(url,next);}
emit("openapi/research-run-setup.openapi.json",doc);
const start=1780272000000,step=3600000;
const ctx={workspace_id:"ws_fixture",alpha_id:"delta-rsi-polynomial-alpha",alpha_version_id:"av_delta_rsi_polynomial_alpha_1_0_0",dataset_id:"crypto-binance-1m",symbol:"BTCUSDT",timeframe:"1h"};
const fixture={schema_version:"research.window-suggestion.v1",context:ctx,profile_id:"p04.fixed-qualification.v1",options_revision:"a".repeat(64),
  scope:"EDITABLE_HEURISTIC_NOT_PREFLIGHT_OR_RUN_AUTHORIZATION",policy:"INDEXED_BAR_SPLIT_70_20_10_OR_HALF_INITIAL_IS_V1",
  metadata:{schema_version:"research.window-suggestion-metadata.v1",state:"AVAILABLE",reason_code:null,dataset_id:ctx.dataset_id,symbol:ctx.symbol,timeframe:ctx.timeframe,
    catalog_revision:"b".repeat(64),as_of_utc_ms:start+1000*step,source_timezone:"UTC",warmup_bars:300,range_origin:"EXPLICIT_UNCHANGED",
    patch:{protocol:"three_window_decay",windows:{is:{start_utc_ms:start,end_exclusive_utc_ms:start+70*step,bars:70},
      oos:{start_utc_ms:start+70*step,end_exclusive_utc_ms:start+90*step,bars:20},holdout:{start_utc_ms:start+90*step,end_exclusive_utc_ms:start+100*step,bars:10}}}},
  fold_authority:"EXISTING_DECLARATION_ESTIMATE_AND_P08_PLANNER",preflight_required:true};
emit("fixtures/research-window-suggestion.three-window.valid.json",fixture);
const unavailable=structuredClone(fixture);Object.assign(unavailable.metadata,{state:"NOT_PUBLISHED",reason_code:"HMD_METADATA_INDEX_NOT_BUILT",catalog_revision:null,as_of_utc_ms:null,patch:null});
emit("fixtures/research-window-suggestion.unavailable.valid.json",unavailable);
const advanced=structuredClone(fixture);advanced.profile_id="p10.delta-signal-notional-wfo.v1";
advanced.metadata.patch={protocol:"advanced",walk_forward:{start_utc_ms:start,end_exclusive_utc_ms:start+100*step,
  bars:100,first_oos_utc_ms:start+50*step,frequency:"weekly",window_mode:"expanding",train_window:null}};
emit("fixtures/research-window-suggestion.advanced.valid.json",advanced);
const atlasFixture=JSON.parse(readFileSync(new URL("fixtures/research-foundation.atlas-current.valid.json",root)));
const p=atlasFixture.portal_admission.profiles[0];
const fixed={profile_id:p.profile_id,state:p.state,reason_code:p.reason,engine_release_id:p.engine_release_id,execution_route:p.execution_route,
  protocol:p.protocol,optimization_mode:p.optimization_mode,optimization_schedule:p.optimization_schedule,
  requested_spec_versions:p.requested_spec_versions??["research.requested-spec.v1"],timeframe:p.timeframe,
  trial_count:p.trial_count,trial_default:1,trial_scope:"GLOBAL_STUDY",max_total_trials:null,seed_policy:"FORBIDDEN",random_seed:null,
  max_span_days:null,fold_bounds:null,frequencies:[],window_modes:[],parameter_policy:"FIXED_NO_OVERRIDES",allowed_pin_names:[],inner_validation:"NOT_APPLICABLE",inner_constraints:null,
  temporal_guards:{policy:"NOT_APPLICABLE",defaults:null,max_bars:null,zero_semantics:"ZERO_APPLIES_NO_TEMPORAL_GUARD"},independent_holdout:true};
emit("fixtures/research-run-setup-options.fixed.valid.json",{schema_version:"research.run-setup-options.v1",context:ctx,
  scope:"CONFIGURATION_FACTS_NOT_RUN_AUTHORIZATION",source_revision:"a".repeat(64),catalog_revision:"b".repeat(64),as_of_utc_ms:start+1000*step,
  warmup_bars:300,source_timezone:"UTC",profiles:[fixed],preflight_required:true});
