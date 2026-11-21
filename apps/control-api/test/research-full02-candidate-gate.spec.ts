/** Synthetic unqualified table; never represents a real qualification receipt. */
import {describe,it,expect,vi} from "vitest";
vi.mock("../src/research/execution-recipes.generated", async importOriginal => {
  const original=await importOriginal<typeof import("../src/research/execution-recipes.generated")>();
  const {createHash}=await import("node:crypto");
  const table=structuredClone(original.EXECUTION_RECIPE_TABLE);
  for(const ref of table.qualification_references as unknown as Array<Record<string,unknown>>) {
    if(String(ref.profile_id).includes("per-fold-decay") || String(ref.profile_id).includes("three-window-optimized")) {
      ref.kind="CANDIDATE_NOT_QUALIFIED";ref.receipt_path=null;ref.receipt_sha256=null;
    }
  }
  const normalize=(v:unknown):unknown=>Array.isArray(v)?v.map(normalize):v&&typeof v==="object"
    ?Object.fromEntries(Object.keys(v).sort().map(k=>[k,normalize((v as Record<string,unknown>)[k])])):v;
  return {...original,EXECUTION_RECIPE_TABLE:table,
    EXECUTION_RECIPE_REVISION:createHash("sha256").update(JSON.stringify(normalize(table))).digest("hex")};
});
import {executionRecipe,executionRecipeActivationReason} from "../src/research/execution-recipes";
describe("FULL-02 unqualified owner-cell fence",()=>{
  it.each(["p10.delta-signal-notional-per-fold-decay.v1","p10.delta-signal-notional-three-window-optimized.v1"])("does not open candidate %s",id=>{
    const row=executionRecipe(id),source={engine_release_id:"er_quantbt_111",verified:true};
    const flags={FEATURE_RESEARCH_RUN_PRODUCER:"true",FEATURE_RESEARCH_WFO_PROFILE:"true",
      FEATURE_RESEARCH_FULL02_PROFILE:"true",PORTAL_ENV:"local",AUTH_MODE:"dev",RESEARCH_RECIPE_QUALIFICATION_PROFILE_ID:id};
    expect(executionRecipeActivationReason(row,flags,source)).toBeNull();
    for(const changed of [{RESEARCH_RECIPE_QUALIFICATION_PROFILE_ID:undefined},{PORTAL_ENV:"production"},
      {AUTH_MODE:"cookie"},{RESEARCH_RECIPE_QUALIFICATION_PROFILE_ID:"p04.fixed-qualification.v1"}])
      expect(executionRecipeActivationReason(row,{...flags,...changed},source)).toBe("RECIPE_NOT_QUALIFIED");
    expect(executionRecipeActivationReason(row,{...flags,FEATURE_RESEARCH_FULL02_PROFILE:"false"},source)).toBe("PROFILE_FLAG_OFF");
  });
});
