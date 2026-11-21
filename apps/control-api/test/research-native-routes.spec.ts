/** Predicate/fixture evidence only; ordinary product receipts are separate. */
import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {NATIVE_DELTA_BINDINGS,isNativeReadBinding,nativeDeltaRecipe} from '../src/research/native-delta.binding';
import {executionRecipe,executionRecipeQualification,executionRecipeActivationReason} from '../src/research/execution-recipes';
import {ResearchNativeRouteResultSchema,NativeOptimizationSchema} from '../src/research/native-route.contract';
import {ResearchRunAdmissionService} from '../src/research/run-admission.service';
import {admissionRepository,flagConfig,manifestFor,p04Requested,w1Admin,w1Scope} from './research-w1-wfo.fixture';
const contractsRoot=process.env.PORTAL_CONTRACTS_DIR??resolve(__dirname,'../../../packages/contracts');
const result=JSON.parse(readFileSync(join(contractsRoot,'fixtures/research-native-route-result.valid.json'),'utf8'));
describe('native Delta input and historical binding',()=>{
 it('BR-S02-15 interprets absent timezone as UTC, accepts equivalent offsets, and rejects sub-hour edges',()=>{
  const binding=NATIVE_DELTA_BINDINGS[0]!;
  const spec=p04Requested({alpha_binding:{alpha_id:binding.alphaId,alpha_version_id:binding.alphaVersionId},
   execution_route:binding.declaredContract.execution.execution_route as never});
  const row=nativeDeltaRecipe(spec)!,manifest=manifestFor(spec);
  const service=new ResearchRunAdmissionService({} as never,{...flagConfig(true),FEATURE_RESEARCH_FULL06_PROFILE:'true',PORTAL_ENV:'local',AUTH_MODE:'dev',RESEARCH_RECIPE_QUALIFICATION_PROFILE_ID:row.profile_id} as never);
  // Source identity is tested by the real admission case below; isolate only
  // this layer's chronology to exercise both timestamp representations.
  const validator=service as unknown as {nativeUnsupportedReason:(s:typeof spec,m:typeof manifest,r:typeof row)=>string|null;
   full03SourceReason:()=>null};
  validator.full03SourceReason=()=>null;
  for(const zone of ['Z','','+00:00']){
   const input=structuredClone(spec);
   for(const window of Object.values(input.windows!))for(const key of ['start','end_exclusive'] as const)window[key]=window[key].replace(/Z$/,zone);
   expect(validator.nativeUnsupportedReason(input,manifest,row)).toBeNull();
  }
  const bad=structuredClone(spec);bad.windows!.is.start=bad.windows!.is.start.replace('00:00:00Z','00:01:00Z');
  expect(validator.nativeUnsupportedReason(bad,manifest,row)).toContain('UTC 1h edges');
  const fractional=structuredClone(spec);fractional.windows!.is.start=fractional.windows!.is.start.replace('00:00:00Z','00:00:00.0000001Z');
  expect(validator.nativeUnsupportedReason(fractional,manifest,row)).toContain('UTC 1h edges');
 });
 for(const binding of NATIVE_DELTA_BINDINGS)it('admits only exact version/route after owner qualification: '+binding.alphaVersionId,async()=>{
  const spec=p04Requested({alpha_binding:{alpha_id:binding.alphaId,alpha_version_id:binding.alphaVersionId},
   execution_route:binding.declaredContract.execution.execution_route as never});
  const row=nativeDeltaRecipe(spec)!;expect(row).toBeTruthy();
  if(row.work_schema_version==='research.native-optimized-work.v1'){
   spec.optimization_mode=row.public_profile.optimization_mode as typeof spec.optimization_mode;
   spec.optuna_trials=100;spec.random_seed=42;
  }
  const manifest=manifestFor(spec),start=Date.parse(spec.windows!.is.start)-300*3600000;
  manifest.datasetBinding={...manifest.datasetBinding,...spec.data,timezone:'UTC',source_manifest_digest:'d'.repeat(64),range_start_utc_ms:start,
   range_end_exclusive_utc_ms:Date.parse(spec.windows!.holdout.end_exclusive),closed_bar_policy:'CLOSED_BARS_ONLY',
   provenance:{warmup_start_utc_ms:start,metadata_index_revision:'b'.repeat(64),metadata_index_source_manifest_digest:'d'.repeat(64),metadata_index_as_of_utc_ms:Date.now(),
    clock_basis:'UTC_FIXED_INTERVAL_OPEN_TIME_V1',source_timezone:'UTC',warmup_semantics:'FIXED_INTERVAL_PREDECESSORS_V1'}};
  const flags={...flagConfig(true),FEATURE_RESEARCH_FULL06_PROFILE:'true',PORTAL_ENV:'local',AUTH_MODE:'dev',RESEARCH_RECIPE_QUALIFICATION_PROFILE_ID:row.profile_id};
  const version={alphaId:binding.alphaId,alphaVersionId:binding.alphaVersionId,lifecycleState:'ACTIVE',declaredContract:binding.declaredContract,entrypoint:binding.entrypoint,
   binding:{adapterId:binding.adapterId,contractDigest:binding.adapterContractDigest},sourceDigest:null};
  const admission=new ResearchRunAdmissionService(admissionRepository(manifest,version) as never,flags as never);
  const admitted=await admission.require(w1Admin,w1Scope,manifest.preflightToken,spec);
  expect(admitted.profile?.id).toBe(row.profile_id);
  expect(admitted.alpha?.fixedParameters).not.toBeNull(); // pinned first trial; selected params remain engine-owned
  expect(isNativeReadBinding(row.profile_id,binding.adapterContractDigest)).toBe(true);
  expect(isNativeReadBinding(row.profile_id,'f'.repeat(64))).toBe(false);
  expect(isNativeReadBinding(null,null)).toBe(false);
  expect(executionRecipeActivationReason(executionRecipe(row.profile_id),{...flags,RESEARCH_RECIPE_QUALIFICATION_PROFILE_ID:undefined},{engine_release_id:'er_quantbt_111',verified:true}))
   .toBe(executionRecipeQualification(row.profile_id).kind==='PRODUCT_RUN_QUALIFIED'?null:'RECIPE_NOT_QUALIFIED');
 });
 it('keeps absent costs absent and published exact zero separate',()=>{
  expect(ResearchNativeRouteResultSchema.parse(result).funding.total).toBeNull();
  expect(ResearchNativeRouteResultSchema.safeParse({...result,funding:{state:'NOT_PUBLISHED',total:'0',reason_code:'NATIVE_RESULT_SERIES_NOT_PUBLISHED'}}).success).toBe(false);
  expect(ResearchNativeRouteResultSchema.safeParse({...result,input_protocol:'DELTA_CLOSE_ORDER_COMMANDS_V1'}).success).toBe(false);
  expect(ResearchNativeRouteResultSchema.safeParse({...result,clock:'KNOWN_CLOSE_NEXT_BAR_INTRABAR'}).success).toBe(false);
 });
 it('requires a bounded source selection and never attaches optimization to an old fixed protocol',()=>{
  const optimization={schema_version:'research.native-optimization.v1',authority:'PINNED_QUANTBT_NATIVE_IS_SHARPE',
   scope:'P08_WARMUP_PLUS_IS_ONLY',objective_name:'sharpe',selection_method:'QUANTBT_GENERIC_ROBUST_PLATEAU_NOT_SCALAR_WFO_V1',
   requested_trials:100,retained_trials:100,completed_trials:99,distinct_parameter_sets:100,selected_trial_number:42,
   selected_parameters:{rvol:'1.6'},selected_objective:'0.5',train_start_utc_ms:1,train_end_exclusive_utc_ms:2,
   holdout_used:false,table_kind:'native_optimizer_trials',table_schema_version:'research.native-optimizer-trial-table.v1',sha256:'a'.repeat(64)};
  expect(NativeOptimizationSchema.safeParse(optimization).success).toBe(true);
  for(const bad of [{requested_trials:401},{holdout_used:true},{retained_trials:101},{completed_trials:101},{selected_trial_number:100}])
   expect(NativeOptimizationSchema.safeParse({...optimization,...bad}).success).toBe(false);
  const native={...result,execution_route:'event_driven',input_protocol:'DELTA_CLOSE_MULTICYCLE_LIMIT_OCO_COMMANDS_V1',optimization};
  expect(ResearchNativeRouteResultSchema.safeParse(native).success).toBe(true);
  expect(ResearchNativeRouteResultSchema.safeParse({...native,optimization:undefined}).success).toBe(false);
  expect(ResearchNativeRouteResultSchema.safeParse({...native,input_protocol:'DELTA_CLOSE_LIMIT_OCO_COMMANDS_V1'}).success).toBe(false);
 });
});
