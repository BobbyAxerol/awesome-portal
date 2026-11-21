import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DELTA_CAUSAL_INNER_PROFILE as PROFILE, DELTA_CAUSAL_INNER_PROFILE_DIGEST as DIGEST, DELTA_CAUSAL_INNER_PROFILE_ID as ID } from "../src/research/delta-causal-inner.profile";
import { deltaWfoProfileDigest, deltaWfoCurrentSourcePair, isDeltaWfoProfile } from "../src/research/delta-wfo.profile";
import { DELTA_WFO_V2_PROFILE_DIGEST } from "../src/research/delta-wfo-v2.profile";
import { ResearchRunAdmissionService } from "../src/research/run-admission.service";
import { researchPortalAdmission } from "../src/research/portal-admission";
import { declarationConditions } from "../src/research/declaration-conditions";
import { ResearchRequestedSpecSchema } from "../src/research/preflight.contract";
import { ResearchCurrentSourceSealIngressSchema } from "../src/research/artifact-ingress.contract";
import { CurrentSourceFoldPayloadSchema } from "../src/research/current-source.payload";
import { admissionRepository, flagConfig, manifestFor, weeklyTopology, w1Admin, w1Scope, wfoRequested } from "./research-w1-wfo.fixture";

const fixtureRoot = resolve(process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname,"../../../packages/contracts"),"fixtures");
const inner = { split_frequency: "weekly", window_mode: "rolling", train_window: "14D", min_folds: 2 };
const spec = (overrides: Record<string,unknown> = {}) => ResearchRequestedSpecSchema.parse({ ...wfoRequested(),
  schema_version: "research.requested-spec.v2", optimization_schedule: "per_fold_causal",
  walk_forward: { ...wfoRequested().walk_forward, inner }, ...overrides });
const topology = () => {
  const result = weeklyTopology(2);
  return { ...result, plan_source: "quantbt.walkforward.WalkForwardEngine.build_folds", inner_validation: inner,
    folds: (result.folds as Record<string,unknown>[]).map(fold => ({ ...fold, inner_fold_count: 3 })) };
};
const admission = (requested = spec(), plan: Record<string,unknown> = topology(), flags = flagConfig(true)) => {
  const manifest = manifestFor(requested,{topology:plan});
  return { manifest, service: new ResearchRunAdmissionService(admissionRepository(manifest) as never, flags as never) };
};

describe("additional bounded causal inner admission",()=>{
  it("pins a separate profile and exact custody pair without changing global v2",()=>{
    expect(deltaWfoProfileDigest(PROFILE)).toBe(DIGEST);
    expect(DELTA_WFO_V2_PROFILE_DIGEST).toBe("d65291f776dce1fef162da9eb6505ba63fc6e3ae0f55679fe12dece3858c7fa0");
    expect(isDeltaWfoProfile(ID,DIGEST)).toBe(true);
    expect(isDeltaWfoProfile(ID,DELTA_WFO_V2_PROFILE_DIGEST)).toBe(false);
    expect(deltaWfoCurrentSourcePair(ID,DIGEST)).toEqual(PROFILE.current_source);
    expect(deltaWfoCurrentSourcePair(ID,null)).toBeNull();
  });
  it("uses the same positive predicate for P08 and P10",async()=>{
    const requested=spec(),{manifest,service}=admission(requested);
    expect(await service.admissionFacts(w1Admin,w1Scope,manifest.preflightToken)).toMatchObject({allowed:true});
    expect((await service.require(w1Admin,w1Scope,manifest.preflightToken,requested)).profile).toEqual({id:ID,digest:DIGEST});
    const profiles=researchPortalAdmission(flagConfig(true) as never,{release_id:"er_quantbt_111",verified:true}).profiles;
    const metadata=JSON.parse(readFileSync(resolve(fixtureRoot,"research-declaration-estimate.v1.available.valid.json"),"utf8")).metadata;
    expect(declarationConditions(requested,metadata,profiles,["1h"]).ready_for_preflight).toBe(true);
    expect(profiles[3]).toMatchObject({trial_scope:"PER_OUTER_FOLD_STUDY",max_total_trials:48,trial_count:{min:3,max:3}});
  });
  it.each([
    ["missing inner", { ...wfoRequested().walk_forward }],
    ["insufficient minimum", { ...wfoRequested().walk_forward,inner:{...inner,min_folds:1} }],
    ["too many inner folds", { ...wfoRequested().walk_forward,inner:{...inner,min_folds:17} }],
    ["unadmitted inner frequency", { ...wfoRequested().walk_forward,inner:{...inner,split_frequency:"single"} }],
  ])("refuses %s instead of global fallback",async(_name,walk_forward)=>{
    const {manifest,service}=admission(spec({walk_forward}));
    expect(await service.admissionFacts(w1Admin,w1Scope,manifest.preflightToken)).toMatchObject({allowed:false,code:"RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE"});
  });
  it.each(["inner count","minimum mismatch","plan source","width mismatch"])("refuses %s in the retained preflight",async name=>{
    const plan=topology();
    if(name==="inner count")plan.folds[1].inner_fold_count=1;
    if(name==="minimum mismatch")plan.inner_validation={...inner,min_folds:3};
    if(name==="plan source")plan.plan_source="unverified";
    if(name==="width mismatch")plan.inner_validation={...inner,train_window:"7D"};
    const {manifest,service}=admission(spec(),plan);
    expect(await service.mayCreate(w1Admin,w1Scope,manifest.preflightToken)).toBe(false);
  });
  it("does not leak the preview 400-trial global exception into every study",async()=>{
    const flags={...flagConfig(true),FEATURE_RESEARCH_PREVIEW_LONG_WFO:"true"};
    const {manifest,service}=admission(spec({optuna_trials:400}),topology(),flags as never);
    expect(await service.mayCreate(w1Admin,w1Scope,manifest.preflightToken)).toBe(false);
    expect(researchPortalAdmission(flags as never,{release_id:"er_quantbt_111",verified:true}).profiles[3].trial_count).toEqual({min:3,max:3});
  });
  it("keeps independent feature-off and source-release refusals",()=>{
    const flags={...flagConfig(true),FEATURE_RESEARCH_WFO_PROFILE:"false"};
    expect(researchPortalAdmission(flags as never,{release_id:"er_quantbt_111",verified:true}).profiles[3].reason).toBe("PROFILE_FLAG_OFF");
    expect(researchPortalAdmission(flagConfig(true) as never,{release_id:"er_quantbt_111",verified:false}).profiles[3].reason).toBe("SOURCE_RELEASE_UNVERIFIED");
  });
  it("refuses a mixed private custody pair at the wire boundary",()=>{
    const {seal}=JSON.parse(readFileSync(resolve(__dirname,"research-w1-preview-seal.fixture.json"),"utf8"));
    const causal = { ...seal, ...PROFILE.current_source };
    expect(ResearchCurrentSourceSealIngressSchema.safeParse(causal).success).toBe(true);
    expect(ResearchCurrentSourceSealIngressSchema.safeParse({...causal,profile_id:"rs02.delta-signal-notional-wfo.v1"}).success).toBe(false);
  });
  it("rejects an inner range touching this fold outer OOS",()=>{
    const fold={fold_id:"fold_0",train_start_utc_ms:0,train_end_utc_ms:100,test_start_utc_ms:101,test_end_utc_ms:200,
      causal_selection:{schema_version:"research.current-source-causal-selection.v1",scope:"OUTER_FOLD_SELECTION",study_id:"study_0",
        fold_seed:42,selected_trial_id:"study_0.trial_0",parameters:{rvol:"0.5"},objective:"1",objective_kind:"INNER_VALIDATION_DECAY_J",
        candidate_is_metric:"1",candidate_oos_metric:"2",candidate_decay:"-1",candidate_metrics_scope:"OUTER_FOLD_POST_SELECTION",
        candidate_count:1,study_trial_rows:3,outer_oos_used_for_selection:false,causality_claim:"strict_nested_fold_local_retraining",
        candidate_is_scope:"INNER_VALIDATION_IS_MEAN",candidate_oos_scope:"OUTER_FOLD_OOS",candidate_decay_scope:"INNER_IS_MEAN_MINUS_OUTER_OOS",
        inner_fold_count:2,inner_validation:{inner_split_frequency:"weekly",inner_window_mode:"rolling",inner_train_window:"14D",inner_min_folds:2},
        inner_folds:[{inner_fold_id:"inner_0",train_start_utc_ms:0,train_end_utc_ms:20,test_start_utc_ms:21,test_end_utc_ms:50,outer_oos_used_for_selection:false},
          {inner_fold_id:"inner_1",train_start_utc_ms:10,train_end_utc_ms:50,test_start_utc_ms:51,test_end_utc_ms:100,outer_oos_used_for_selection:false}]}};
    expect(CurrentSourceFoldPayloadSchema.safeParse(fold).success).toBe(true);
    fold.causal_selection.inner_folds[1].test_end_utc_ms=101;
    expect(CurrentSourceFoldPayloadSchema.safeParse(fold).success).toBe(false);
  });
});
