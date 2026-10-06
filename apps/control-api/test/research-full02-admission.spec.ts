/** Synthetic predicate tests. Product qualification requires the real P08/P10 cell. */
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";
import { executionRecipe, executionRecipeActivationReason, executionRecipeBudgets, executionRecipeQualification, recipeDigest } from "../src/research/execution-recipes";
import { DELTA_PER_FOLD_DECAY_PROFILE_ID as decay, DELTA_THREE_WINDOW_OPTIMIZED_PROFILE_ID as three } from "../src/research/full02.profiles";
import { ResearchRequestedSpecSchema, type ResearchRequestedSpec } from "../src/research/preflight.contract";
import { ResearchRunAdmissionService } from "../src/research/run-admission.service";
import { declarationConditions } from "../src/research/declaration-conditions";
import { admissionRepository, flagConfig, manifestFor, p04Requested, w1Admin, w1Scope, wfoRequested } from "./research-w1-wfo.fixture";

const flags = (profile: string) => ({ ...flagConfig(true), PORTAL_ENV: "local", AUTH_MODE: "dev",
  FEATURE_RESEARCH_FULL02_PROFILE: "true", RESEARCH_RECIPE_QUALIFICATION_PROFILE_ID: profile,
  FEATURE_RESEARCH_PREVIEW_LONG_WFO: "true" });
const decaySpec = () => ResearchRequestedSpecSchema.parse({ ...wfoRequested(), schema_version: "research.requested-spec.v2",
  optimization_schedule: "per_fold_decay", walk_forward: { ...wfoRequested().walk_forward,
    label_horizon_bars: 1, purge_bars: 2, embargo_bars: 3 } });
const threeSpec = () => ResearchRequestedSpecSchema.parse(p04Requested({ optuna_trials: 3, random_seed: 42,
  parameter_space_overrides: [{ name: "rvol", kind: "pin", value: 1.6 }] }));
async function facts(spec: ResearchRequestedSpec, config: Record<string, unknown>) {
  const manifest = manifestFor(spec), service = new ResearchRunAdmissionService(admissionRepository(manifest) as never, config as never);
  return service.require(w1Admin, w1Scope, manifest.preflightToken, spec);
}
describe("FULL-02 exact new recipe predicates and owner qualification", () => {
  it.each([decay, three])("keeps qualified %s bounded and independently activation-gated", id => {
    const row = executionRecipe(id), ref = executionRecipeQualification(id);
    expect(recipeDigest(row.descriptor)).toBe(row.profile_digest);
    expect(ref.recipe_digest).toBe(recipeDigest(row));
    expect(ref.kind).toBe("PRODUCT_RUN_QUALIFIED");
    expect(ref.receipt_path).toMatch(/FULL_02_PRODUCT_QUALIFICATION/);
    expect(ref.receipt_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(executionRecipeBudgets(row, flags(id))).toMatchObject({cpu_seconds:120, wall_seconds:240});
    const source = {engine_release_id:"er_quantbt_111",verified:true};
    expect(executionRecipeActivationReason(row, flags(id), source)).toBeNull();
    expect(executionRecipeActivationReason(row, {...flags(id),RESEARCH_RECIPE_QUALIFICATION_PROFILE_ID:undefined}, source)).toBeNull();
    expect(executionRecipeActivationReason(row, {...flags(id),FEATURE_RESEARCH_FULL02_PROFILE:"false"}, source)).toBe("PROFILE_FLAG_OFF");
    expect(executionRecipeActivationReason(row, flags(id), {...source,engine_release_id:"er_quantbt_110"})).toBe("ENGINE_RELEASE_MISMATCH");
    expect(executionRecipeActivationReason(row, flags(id), {...source,verified:false})).toBe("SOURCE_RELEASE_UNVERIFIED");
  });
  it("admits per-fold decay as its own identity, not causal/global", async () => {
    expect((await facts(decaySpec(), flags(decay))).profile).toEqual({id:decay,digest:executionRecipe(decay).profile_digest});
  });
  it("admits optimized Three Window with declared pins, leaving fixed P04 distinct", async () => {
    const result = await facts(threeSpec(), flags(three));
    expect(result.profile).toEqual({id:three,digest:executionRecipe(three).profile_digest});
    expect(result.alpha?.fixedParameters).toBeNull();
    expect((await facts(p04Requested(), flags(three))).profile).toEqual({id:"p04.fixed-qualification.v1",digest:null});
  });
  it("Conditions chooses the optimized recipe instead of fixed P04 for three trials and declared pins", () => {
    const spec=threeSpec(), row=executionRecipe(three);
    const metadata={windows:[],planned_folds:{availability:"AVAILABLE",reason_code:null,count:1}} as never;
    const profiles=[{...executionRecipe("p04.fixed-qualification.v1").public_profile,state:"ENABLED"},
      {...row.public_profile,state:"ENABLED",parameter_policy:"DELTA_SEARCH_WITH_QUALIFIED_PINS",allowed_pin_names:["rvol","slpercent"]}] as never;
    const result=declarationConditions(spec,metadata,profiles,["1h"]);
    expect(result.profile_id).toBe(three);
    expect(result.conditions.filter(r=>r.key==="parameter_overrides")).toHaveLength(1);
    expect(result.ready_for_preflight).toBe(true);
  });
  it.each(["seed", "trials", "timeframe", "inner", "override", "budget"])("refuses per-fold deviation %s without weakening admission", async key => {
    const spec = structuredClone(decaySpec());
    if (key==="seed") spec.random_seed=43;
    if (key==="trials"||key==="budget") spec.optuna_trials=key==="budget"?400:2;
    if (key==="timeframe") spec.data.timeframe="4h";
    if (key==="inner") spec.walk_forward!.inner={split_frequency:"weekly",window_mode:"rolling",train_window:"14D"};
    if (key==="override") spec.parameter_space_overrides=[{name:"rvol",kind:"pin",value:"1.6"}];
    await expect(facts(spec,flags(decay))).rejects.toMatchObject({code:"RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE"});
  });
  it.each(["seed", "trials", "timeframe", "schedule", "overlap"])("refuses Three Window deviation %s", async key => {
    const spec=structuredClone(threeSpec());
    if(key==="seed") spec.random_seed=null;
    if(key==="trials") spec.optuna_trials=4;
    if(key==="timeframe") spec.data.timeframe="4h";
    if(key==="schedule") spec.optimization_schedule="per_fold_decay";
    if(key==="overlap") spec.windows!.oos.start="2025-01-03T00:00:00Z";
    await expect(facts(spec,flags(three))).rejects.toMatchObject({code:expect.stringMatching(/RESEARCH_RUN/)});
  });
  it("refuses candidate configuration outside a complete local owner cell; blank compose input stays off", () => {
    const base={NODE_ENV:"test",DATABASE_URL:"postgres://x:y@127.0.0.1:5432/z",PORTAL_ENV:"local",AUTH_MODE:"dev"};
    expect(loadConfig({...base,RESEARCH_RECIPE_QUALIFICATION_PROFILE_ID:""} as never).RESEARCH_RECIPE_QUALIFICATION_PROFILE_ID).toBeUndefined();
    expect(()=>loadConfig({...base,FEATURE_RESEARCH_FULL02_PROFILE:"true"} as never)).toThrow();
    expect(()=>loadConfig({...base,RESEARCH_RECIPE_QUALIFICATION_PROFILE_ID:decay} as never)).toThrow();
  });
});
