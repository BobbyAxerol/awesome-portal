/** Predicate fixtures, never a substitute for FULL05 ordinary product proof. */
import {describe,it,expect} from "vitest";
import {ResearchRunAdmissionService} from "../src/research/run-admission.service";
import {IMPORTED_ALPHA_ADAPTER_ID,IMPORTED_ALPHA_ADAPTER_CONTRACT_DIGEST} from "../src/research/imported-alpha.profile";
import {executionRecipe} from "../src/research/execution-recipes";
import {admissionRepository,flagConfig,manifestFor,w1Admin,w1Scope,wfoRequested} from "./research-w1-wfo.fixture";
const declaration={schema_version:"research.alpha-source.v1",entrypoint:"generate_signals",timeframes:["1h"],warmup_bars:256,
  determinism:{seed_required:true},parameter_space:{length:{kind:"int_range",low:2,high:10,step:2}}};
async function admit(change?:(s:ReturnType<typeof wfoRequested>)=>void,flags={}){
  const spec=wfoRequested({schema_version:"research.requested-spec.v2",strategy_id:"imported-proof",
    alpha_binding:{alpha_id:"imported-proof",alpha_version_id:"av_imported_proof_1"}},
    {label_horizon_bars:0,purge_bars:0,embargo_bars:0});change?.(spec);
  const row=executionRecipe("p10.imported-wfo-temporal-1h.v1"),manifest=manifestFor(spec);
  const start=Date.parse(spec.walk_forward!.start)-256*3600000;
  manifest.snapshot.warmup={requested_bars:256,bars:256,start_utc_ms:start,end_exclusive_utc_ms:start+256*3600000};
  manifest.datasetBinding={...manifest.datasetBinding,...spec.data,timezone:"UTC",source_manifest_digest:"d".repeat(64),
    range_start_utc_ms:start,range_end_exclusive_utc_ms:Date.parse(spec.walk_forward!.end_exclusive),closed_bar_policy:"CLOSED_BARS_ONLY",
    provenance:{metadata_index_revision:"b".repeat(64),metadata_index_source_manifest_digest:"d".repeat(64),metadata_index_as_of_utc_ms:Date.now(),
      warmup_start_utc_ms:start,clock_basis:"UTC_FIXED_INTERVAL_OPEN_TIME_V1",source_timezone:"UTC",warmup_semantics:"FIXED_INTERVAL_PREDECESSORS_V1"}};
  const version={alphaId:"imported-proof",alphaVersionId:"av_imported_proof_1",lifecycleState:"DRAFT",declaredContract:declaration,
    entrypoint:"generate_signals",binding:{adapterId:IMPORTED_ALPHA_ADAPTER_ID,contractDigest:IMPORTED_ALPHA_ADAPTER_CONTRACT_DIGEST},sourceDigest:"a".repeat(64)};
  const config={...flagConfig(true),PORTAL_ENV:"local",AUTH_MODE:"dev",FEATURE_RESEARCH_IMPORTED_EXECUTION:"true",FEATURE_RESEARCH_FULL05_PROFILE:"true",
    RESEARCH_RECIPE_QUALIFICATION_PROFILE_ID:row.profile_id,...flags};
  return new ResearchRunAdmissionService(admissionRepository(manifest,version) as never,config as never).require(w1Admin,w1Scope,manifest.preflightToken,spec);
}
describe("FULL05 imported admission",()=>{
  it("binds a DRAFT immutable source without using the built-in Delta binding",async()=>{
    const r=await admit();expect(r.profile).toEqual({id:"p10.imported-wfo-temporal-1h.v2",
      digest:executionRecipe("p10.imported-wfo-temporal-1h.v2").profile_digest});
    expect(executionRecipe("p10.imported-wfo-temporal-1h.v1").public_profile.trial_count).toEqual({min:3,max:3});
    expect(r.alpha?.importedSearchBinding?.source_digest).toBe("a".repeat(64));expect(r.alpha?.importedParameters).toBeNull();
  });
  it.each([
    (s:ReturnType<typeof wfoRequested>)=>{s.random_seed=null;},
    (s:ReturnType<typeof wfoRequested>)=>{s.execution_route="target_weight" as never;},
    (s:ReturnType<typeof wfoRequested>)=>{s.data.timeframe="5m";},
    (s:ReturnType<typeof wfoRequested>)=>{s.optuna_trials=401;},
    (s:ReturnType<typeof wfoRequested>)=>{s.parameter_space_overrides=[{name:"length",kind:"pin",value:3}];},
    (s:ReturnType<typeof wfoRequested>)=>{s.parameter_space_overrides=[{name:"unknown",kind:"pin",value:2}];},
  ])("refuses changed exact axes/declaration",async change=>{
    await expect(admit(change)).rejects.toHaveProperty("code",expect.stringMatching(/^RESEARCH_RUN_(EXECUTION_ADAPTER_UNAVAILABLE|PREFLIGHT_NOT_READY)$/));
  });
  it("flag-off fails closed instead of falling back to imported fixed",async()=>{
    await expect(admit(undefined,{FEATURE_RESEARCH_FULL05_PROFILE:"false"})).rejects.toMatchObject({code:"RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE"});
  });
});
