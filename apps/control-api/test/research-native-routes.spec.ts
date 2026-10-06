/** Predicate/fixture evidence only; ordinary product receipts are separate. */
import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {NATIVE_DELTA_BINDINGS,isNativeReadBinding,nativeDeltaRecipe} from '../src/research/native-delta.binding';
import {executionRecipe,executionRecipeQualification,executionRecipeActivationReason} from '../src/research/execution-recipes';
import {ResearchNativeRouteResultSchema} from '../src/research/native-route.contract';
import {ResearchRunAdmissionService} from '../src/research/run-admission.service';
import {admissionRepository,flagConfig,manifestFor,p04Requested,w1Admin,w1Scope} from './research-w1-wfo.fixture';
const contractsRoot=process.env.PORTAL_CONTRACTS_DIR??resolve(__dirname,'../../../packages/contracts');
const result=JSON.parse(readFileSync(join(contractsRoot,'fixtures/research-native-route-result.valid.json'),'utf8'));
describe('native Delta input and historical binding',()=>{
 for(const binding of NATIVE_DELTA_BINDINGS)it('admits only exact version/route after owner qualification: '+binding.alphaVersionId,async()=>{
  const spec=p04Requested({alpha_binding:{alpha_id:binding.alphaId,alpha_version_id:binding.alphaVersionId},
   execution_route:binding.declaredContract.execution.execution_route as never});
  const row=nativeDeltaRecipe(spec)!;expect(row).toBeTruthy();
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
  expect(admitted.profile?.id).toBe(row.profile_id);expect(admitted.alpha?.fixedParameters).not.toBeNull();
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
});
