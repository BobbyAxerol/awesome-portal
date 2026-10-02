import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DELTA_WFO_V2_PROFILE, DELTA_WFO_V2_PROFILE_DIGEST, DELTA_WFO_V2_PROFILE_ID } from "../src/research/delta-wfo-v2.profile";
import { deltaWfoProfileDigest } from "../src/research/delta-wfo.profile";
import { ResearchRunAdmissionService } from "../src/research/run-admission.service";
import { researchPortalAdmission } from "../src/research/portal-admission";
import { declarationConditions } from "../src/research/declaration-conditions";
import { ResearchRequestedSpecSchema } from "../src/research/preflight.contract";
import { admissionRepository, flagConfig, manifestFor, w1Admin, w1Scope, wfoRequested } from "./research-w1-wfo.fixture";
const fixtureRoot=resolve(process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname,"../../../packages/contracts"),"fixtures");
describe("versioned temporal execution/admission",()=>{
  it("pins the new immutable profile without broadening W1",()=>{
    expect(deltaWfoProfileDigest(DELTA_WFO_V2_PROFILE)).toBe(DELTA_WFO_V2_PROFILE_DIGEST);
  });
  it.each(["expanding","rolling"])("admits real consumed %s fields and publishes the same advisory profile",async windowMode=>{
    const spec=ResearchRequestedSpecSchema.parse({...wfoRequested(),schema_version:"research.requested-spec.v2",
      walk_forward:{...wfoRequested().walk_forward,window_mode:windowMode,train_window:"14D",label_horizon_bars:1,purge_bars:2,embargo_bars:3}});
    const manifest=manifestFor(spec), service=new ResearchRunAdmissionService(admissionRepository(manifest) as never,flagConfig(true) as never);
    const result=await service.require(w1Admin,w1Scope,manifest.preflightToken,spec);
    expect(result.profile).toEqual({id:DELTA_WFO_V2_PROFILE_ID,digest:DELTA_WFO_V2_PROFILE_DIGEST});
    const profiles=researchPortalAdmission(flagConfig(true) as never,{release_id:"er_quantbt_111",verified:true}).profiles;
    const metadata=JSON.parse(readFileSync(resolve(fixtureRoot,"research-declaration-estimate.v1.available.valid.json"),"utf8")).metadata;
    expect(declarationConditions(spec,metadata,profiles,["1h"]).ready_for_preflight).toBe(true);
    expect(profiles[0].seed_policy).toBe("FORBIDDEN"); expect(profiles[2].seed_policy).toBe("LOCKED");
  });
  it("does not turn source-supported causal selection into false global retention",async()=>{
    const spec=ResearchRequestedSpecSchema.parse({...wfoRequested(),schema_version:"research.requested-spec.v2",
      walk_forward:{...wfoRequested().walk_forward,inner:{split_frequency:"weekly",window_mode:"rolling",train_window:"14D"}}});
    const manifest=manifestFor(spec), service=new ResearchRunAdmissionService(admissionRepository(manifest) as never,flagConfig(true) as never);
    expect(await service.admissionFacts(w1Admin,w1Scope,manifest.preflightToken)).toMatchObject({allowed:false,code:"RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE"});
  });
});
