/** Exact predicate tests, not ordinary product qualification evidence. */
import {describe,it,expect} from "vitest";
import {executionRecipes,recipeDigest,wfoExecutionRecipe,executionRecipeActivationReason} from "../src/research/execution-recipes";
import {FULL03_DELTA_BINDING,FULL03_DELTA_ADAPTER_CONTRACT_DIGEST} from "../src/research/full03-delta.binding";
import {ResearchRequestedSpecSchema,type ResearchRequestedSpec} from "../src/research/preflight.contract";
import {ResearchRunAdmissionService} from "../src/research/run-admission.service";
import {admissionRepository,flagConfig,manifestFor,w1Admin,w1Scope,wfoRequested} from "./research-w1-wfo.fixture";
const rows=executionRecipes.filter(r=>r.descriptor.schema_version==="research.full04-delta-profile.v1");
function specFor(row:typeof rows[number]):ResearchRequestedSpec{
  const spec=wfoRequested({schema_version:"research.requested-spec.v2",optimization_mode:row.public_profile.optimization_mode,
    optimization_schedule:row.public_profile.optimization_schedule,optuna_trials:row.public_profile.trial_default},
    {label_horizon_bars:0,purge_bars:0,embargo_bars:0});
  spec.alpha_binding={alpha_id:FULL03_DELTA_BINDING.alphaId,alpha_version_id:FULL03_DELTA_BINDING.alphaVersionId};
  spec.data.timeframe=row.public_profile.timeframe;
  return ResearchRequestedSpecSchema.parse(spec);
}
async function admit(row:typeof rows[number],change?:(s:ResearchRequestedSpec)=>void){
  const spec=specFor(row);change?.(spec);const manifest=manifestFor(spec);
  if(row.descriptor.optimization_mode==="mode_5_full_robust")manifest.topology.folds=(manifest.topology.folds as unknown[]).slice(0,1);
  const rangeStart=Date.parse(spec.walk_forward!.start)-300*row.descriptor.source_clock.bar_interval_ms;
  manifest.datasetBinding={...manifest.datasetBinding,...spec.data,timezone:"UTC",source_manifest_digest:"d".repeat(64),
    range_start_utc_ms:rangeStart,range_end_exclusive_utc_ms:Date.parse(spec.walk_forward!.end_exclusive),
    closed_bar_policy:"CLOSED_BARS_ONLY",provenance:{metadata_index_revision:"b".repeat(64),
      metadata_index_source_manifest_digest:"d".repeat(64),metadata_index_as_of_utc_ms:Date.now(),warmup_start_utc_ms:rangeStart,
      clock_basis:"UTC_FIXED_INTERVAL_OPEN_TIME_V1",source_timezone:"UTC",warmup_semantics:"FIXED_INTERVAL_PREDECESSORS_V1"}};
  const version={alphaId:FULL03_DELTA_BINDING.alphaId,alphaVersionId:FULL03_DELTA_BINDING.alphaVersionId,lifecycleState:"ACTIVE",
    declaredContract:FULL03_DELTA_BINDING.declaredContract,entrypoint:FULL03_DELTA_BINDING.entrypoint,
    binding:{adapterId:FULL03_DELTA_BINDING.adapterId,contractDigest:FULL03_DELTA_ADAPTER_CONTRACT_DIGEST},sourceDigest:null};
  const flags={...flagConfig(true),PORTAL_ENV:"local",AUTH_MODE:"dev",FEATURE_RESEARCH_FULL03_PROFILE:"true",
    FEATURE_RESEARCH_FULL04_PROFILE:"true",RESEARCH_RECIPE_QUALIFICATION_PROFILE_ID:row.profile_id};
  return new ResearchRunAdmissionService(admissionRepository(manifest,version) as never,flags as never)
    .require(w1Admin,w1Scope,manifest.preflightToken,spec);
}
describe("FULL04 exact native optimizer admission",()=>{
  it("adds five mode/schedule combinations over seven indexed clocks without rewriting old36",()=>{
    expect(rows).toHaveLength(35);
    expect(executionRecipes.filter(r=>r.adapter_kind!=="IMPORTED_SEARCH")).toHaveLength(71);
    expect(executionRecipes.filter(r=>r.adapter_kind==="IMPORTED_SEARCH")).toHaveLength(27);
    expect(new Set(rows.map(r=>r.public_profile.optimization_mode+":"+r.public_profile.optimization_schedule)).size).toBe(5);
    expect(executionRecipes.filter(r=>r.descriptor.schema_version==="research.full03-delta-profile.v1")).toHaveLength(28);
  });
  it.each(rows)("admits only exact mode and bounded clock $profile_id",async row=>{
    expect(recipeDigest(row.descriptor)).toBe(row.profile_digest);
    expect(wfoExecutionRecipe(specFor(row))?.profile_id).toBe(row.profile_id);
    expect((await admit(row)).profile).toEqual({id:row.profile_id,digest:row.profile_digest});
    await expect(admit(row,s=>{s.optuna_trials=400;})).rejects.toMatchObject({code:"RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE"});
    await expect(admit(row,s=>{s.optimization_config={scoring_backend:"proxy"};})).rejects.toMatchObject({code:"RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE"});
    if (row.public_profile.optimization_mode === "mode_4_is_only_robust")
      await expect(admit(row,s=>{s.walk_forward!.inner={split_frequency:"weekly",window_mode:"expanding",train_window:"7D",min_folds:2};}))
        .rejects.toMatchObject({code:"RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE",
          message:"Mode 4 IS-only uses outer-fold studies without nested inner selection."});
    const source={engine_release_id:"er_quantbt_111",verified:true};
    expect(executionRecipeActivationReason(row,{FEATURE_RESEARCH_RUN_PRODUCER:"true",FEATURE_RESEARCH_WFO_PROFILE:"true",
      FEATURE_RESEARCH_FULL03_PROFILE:"true",FEATURE_RESEARCH_FULL04_PROFILE:"false"},source)).toBe("PROFILE_FLAG_OFF");
  });
  it("keeps Mode4 causal IS-only, Mode3 centroid and Mode5 calibration distinct",()=>{
    const by=(mode:string)=>rows.find(r=>r.profile_id===`p10.delta-${mode}-1h.v1`)!;
    expect(by("mode4-causal").descriptor).toMatchObject({trial_scope:"PER_OUTER_FOLD_STUDY",inner_validation:"NOT_APPLICABLE"});
    expect(by("mode4-causal").descriptor.inner_constraints).toBeUndefined();
    expect(by("mode3-global").descriptor.optimizer_settings.flat_selector).toBe("centroid");
    expect(by("mode5-global").public_profile.fold_bounds).toEqual({min:1,max:1});
  });
});
