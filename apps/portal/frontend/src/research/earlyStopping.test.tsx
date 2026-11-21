import { describe, expect, it } from "vitest";
import { profilePinsFromSetup } from "./useRunSetup";
import type { SetupProfile } from "./setupClient";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PreflightPanel } from "./PreflightPanel";
import { renderToStaticMarkup } from "react-dom/server";
import type { PreflightResponse } from "./preflightClient";
import { researchState } from "./state";

describe("server-owned optional patience binding",()=>{
  it("consumes generated policy and guidance, without assigning a value",()=>{
    const body=JSON.parse(readFileSync(resolve(process.cwd(),"../../../packages/contracts/fixtures/research-run-setup-options.early-stopping.valid.json"),"utf8"));
    const profile=profilePinsFromSetup(body.profiles[0] as SetupProfile);
    expect(profile.earlyStopping).toBe("optional");
    expect(profile.earlyStoppingGuidance?.suggestedRangeRatio).toEqual([0.5,0.75]);
    expect(Math.round(400*profile.earlyStoppingGuidance!.suggestedRatio)).toBe(267);
  });
  it("renders failed admission separately from successful data checks",()=>{
    const body=JSON.parse(readFileSync(resolve(process.cwd(),"../../../packages/contracts/fixtures/research-preflight.response.valid.json"),"utf8"));
    body.gates=[{gate:"execution_admission",state:"FAIL",field_path:["early_stopping"],message:"Early stopping is outside the study budget."}];
    body.may_create_run=false;
    const html=renderToStaticMarkup(<PreflightPanel preflight={body as PreflightResponse} state={researchState({kind:"ok",rowCount:1})}/>);
    expect(html).toContain('data-gate-state="FAIL"');
    expect(html).toContain("✗");
    expect(html).toContain('data-may-create="false"');
  });
});
