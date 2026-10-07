/** Predicate/contract tests, distinct from ordinary real-source product proof. */
import {describe,it,expect} from "vitest";
import {executionRecipes,executionRecipe,executionRecipeActivationReason,executionRecipeBudgets,
  recipeDigest,wfoExecutionRecipe,currentSourceRecipePairs,executionRecipeQualification} from "../src/research/execution-recipes";
import {FULL03_DELTA_BINDING,FULL03_DELTA_ADAPTER_CONTRACT_DIGEST} from "../src/research/full03-delta.binding";
import {P04_DELTA_BINDING} from "../src/research/p04-delta.binding";
import {ResearchRequestedSpecSchema,type ResearchRequestedSpec} from "../src/research/preflight.contract";
import {ResearchRunAdmissionService} from "../src/research/run-admission.service";
import {researchPortalAdmission} from "../src/research/portal-admission";
import {admissionRepository,flagConfig,manifestFor,w1Admin,w1Scope,wfoRequested,p04Requested} from "./research-w1-wfo.fixture";
import {ResearchCurrentSourceSealIngressSchema} from "../src/research/artifact-ingress.contract";
const rows=executionRecipes.filter(r=>r.descriptor.schema_version==="research.full03-delta-profile.v1");
function qualifiedSuccessor(row:typeof rows[number]) {
  const successor=executionRecipe(row.profile_id.replace(/\.v1$/,".v2"));
  expect(successor.descriptor).toHaveProperty("predecessor_profile_id",row.profile_id);
  expect(executionRecipeQualification(successor.profile_id).kind).toBe("PRODUCT_RUN_QUALIFIED");
  return successor;
}
function specFor(row:typeof rows[number]):ResearchRequestedSpec {
  const three=row.adapter_kind==="DELTA_THREE_WINDOW_OPTIMIZED",causal=row.public_profile.optimization_schedule==="per_fold_causal";
  const value=three?p04Requested({optuna_trials:3,random_seed:42}):wfoRequested({schema_version:"research.requested-spec.v2",
    optimization_schedule:row.public_profile.optimization_schedule},
    {label_horizon_bars:0,purge_bars:0,embargo_bars:0,...(causal?{inner:{split_frequency:"weekly",window_mode:"rolling",train_window:"14D",min_folds:2}}:{})});
  value.alpha_binding={alpha_id:FULL03_DELTA_BINDING.alphaId,alpha_version_id:FULL03_DELTA_BINDING.alphaVersionId};
  value.data.timeframe=row.public_profile.timeframe;
  return ResearchRequestedSpecSchema.parse(value);
}
async function facts(row:typeof rows[number],change?:(s:ResearchRequestedSpec)=>void){
  const spec=specFor(row);change?.(spec);
  const manifest=manifestFor(spec);
  if(spec.walk_forward?.inner) {
    manifest.topology.plan_source="quantbt.walkforward.WalkForwardEngine.build_folds";
    manifest.topology.inner_validation={...spec.walk_forward.inner};
    for(const fold of manifest.topology.folds as Array<Record<string,unknown>>)fold.inner_fold_count=2;
  }
  const rangeStart=Date.parse(spec.walk_forward?.start??spec.windows!.is.start)-300*row.descriptor.source_clock.bar_interval_ms;
  manifest.datasetBinding={...manifest.datasetBinding,...spec.data,timezone:"UTC",source_manifest_digest:"d".repeat(64),
    range_start_utc_ms:rangeStart,range_end_exclusive_utc_ms:Date.parse(spec.walk_forward?.end_exclusive??spec.windows!.holdout.end_exclusive),
    closed_bar_policy:"CLOSED_BARS_ONLY",provenance:{metadata_index_revision:"b".repeat(64),
      metadata_index_source_manifest_digest:"d".repeat(64),
      metadata_index_as_of_utc_ms:Date.now(),warmup_start_utc_ms:rangeStart,
      clock_basis:"UTC_FIXED_INTERVAL_OPEN_TIME_V1",source_timezone:"UTC",warmup_semantics:"FIXED_INTERVAL_PREDECESSORS_V1"}};
  const version={alphaId:FULL03_DELTA_BINDING.alphaId,alphaVersionId:FULL03_DELTA_BINDING.alphaVersionId,
    lifecycleState:"ACTIVE",declaredContract:FULL03_DELTA_BINDING.declaredContract,entrypoint:FULL03_DELTA_BINDING.entrypoint,
    binding:{adapterId:FULL03_DELTA_BINDING.adapterId,contractDigest:FULL03_DELTA_ADAPTER_CONTRACT_DIGEST},sourceDigest:null};
  const flags={...flagConfig(true),PORTAL_ENV:"local",AUTH_MODE:"dev",FEATURE_RESEARCH_FULL03_PROFILE:"true",
    RESEARCH_RECIPE_QUALIFICATION_PROFILE_ID:row.profile_id};
  const service=new ResearchRunAdmissionService(admissionRepository(manifest,version) as never,flags as never);
  return service.require(w1Admin,w1Scope,manifest.preflightToken,spec);
}
describe("FULL03 immutable indexed profile authority",()=>{
  it.each(rows)("admits bounded early stopping without changing recipe identity $profile_id", async row => {
    const result=await facts(row,s=>{s.early_stopping=2;});
    expect(result.allowed).toBe(true);
  });
  it("pins a new version without widening the old AV/declaration",()=>{
    expect(rows).toHaveLength(28);
    expect(FULL03_DELTA_BINDING.alphaVersionId).not.toBe(P04_DELTA_BINDING.alphaVersionId);
    expect(P04_DELTA_BINDING.declaredContract.timeframes).toEqual(["1h","4h","1d"]);
    // The generator checks JSON↔TS parity. This predicate also runs in the
    // disposable CI cell, which deliberately does not mount the Portal repo.
    expect(FULL03_DELTA_ADAPTER_CONTRACT_DIGEST).toBe("23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b");
    expect(FULL03_DELTA_BINDING.declaredContract.timeframes).toEqual(["1m","5m","15m","30m","1h","4h","1d"]);
  });
  it.each(rows)("pins exact clock, budgets and activation for $profile_id",row=>{
    expect(recipeDigest(row.descriptor)).toBe(row.profile_digest);
    expect(executionRecipeBudgets(row,{FEATURE_RESEARCH_PREVIEW_LONG_WFO:"true"})).toMatchObject({cpu_seconds:120,wall_seconds:240,planning_max_bars:100000});
    expect(row.descriptor.source_clock.warmup_semantics).toBe("FIXED_INTERVAL_PREDECESSORS_V1");
    expect(row.public_profile.max_span_days*86400000/row.descriptor.source_clock.bar_interval_ms+300).toBeLessThanOrEqual(100000);
    const source={engine_release_id:"er_quantbt_111",verified:true};
    const flags={FEATURE_RESEARCH_RUN_PRODUCER:"true",FEATURE_RESEARCH_WFO_PROFILE:"true",FEATURE_RESEARCH_FULL03_PROFILE:"true",
      PORTAL_ENV:"local",AUTH_MODE:"dev",RESEARCH_RECIPE_QUALIFICATION_PROFILE_ID:row.profile_id};
    expect(executionRecipeActivationReason(row,flags,source)).toBeNull();
    expect(executionRecipeActivationReason(row,{...flags,FEATURE_RESEARCH_FULL03_PROFILE:"false"},source)).toBe("PROFILE_FLAG_OFF");
    // Historical lookup and activation keep v1 bytes/caps. Fresh intake must
    // use its exact qualified successor, never mutate the historical row.
    expect(executionRecipe(row.profile_id,row.profile_digest)).toBe(row);
    if(row.adapter_kind==="DELTA_WFO")expect(wfoExecutionRecipe(specFor(row))?.profile_id).toBe(qualifiedSuccessor(row).profile_id);
  });
  it.each(rows)("admits only its own pinned $profile_id",async row=>{
    const successor=qualifiedSuccessor(row);
    const result=await facts(row);expect(result.profile).toEqual({id:successor.profile_id,digest:successor.profile_digest});
    expect(result.alpha?.adapterId).toBe(FULL03_DELTA_BINDING.adapterId);
    await expect(facts(row,s=>{s.data.dataset_id="crypto-binance-spot-1m";})).rejects.toMatchObject({code:"RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE"});
  });
  it("keeps all historical setup bytes unchanged while FULL03 is off",()=>{
    const off=researchPortalAdmission(flagConfig(true) as never,{release_id:"er_quantbt_111",verified:true});
    expect(off.profiles).toHaveLength(5);
    expect(off.profiles.some(r=>r.profile_id.includes("delta-wfo-temporal-"))).toBe(false);
    expect(currentSourceRecipePairs.filter(p=>p.source_adapter_id.startsWith("full03.")&&p.source_adapter_id.endsWith(".v1"))).toHaveLength(28);
    expect(currentSourceRecipePairs.filter(p=>p.source_adapter_id.startsWith("full03.")&&p.source_adapter_id.endsWith(".v2"))).toHaveLength(28);
  });
});
