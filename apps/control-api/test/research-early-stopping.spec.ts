import { describe, expect, it } from "vitest";
import { EARLY_STOPPING_GUIDANCE, earlyStoppingPolicy, earlyStoppingRefusal, retainedStudyTrialCountAdmitted } from "../src/research/early-stopping";
import { ResearchPreflightController } from "../src/research/preflight.controller";
import { admissionFieldPath } from "../src/research/preflight-gates";

describe("optional engine early stopping", () => {
  it("suggests200–300/267 for400 without creating a default", () => {
    expect(EARLY_STOPPING_GUIDANCE.scope).toBe("PER_STUDY");
    expect(EARLY_STOPPING_GUIDANCE.suggested_range_ratio.map(v => v * 400)).toEqual([200,300]);
    expect(Math.round(EARLY_STOPPING_GUIDANCE.suggested_ratio * 400)).toBe(267);
    expect(EARLY_STOPPING_GUIDANCE.suggestion_is_default).toBe(false);
  });
  it.each([null,1,200,267,300,400])("admits optional patience %s", early_stopping => {
    expect(earlyStoppingRefusal({early_stopping,optuna_trials:400},"OPTIONAL")).toBeNull();
  });
  it.each([0,-1,1.5,401,NaN])("refuses invalid patience %s at the exact field", early_stopping => {
    const result=earlyStoppingRefusal({early_stopping,optuna_trials:400},"OPTIONAL")!;
    expect(result.field_path).toEqual(["early_stopping"]);
    expect(admissionFieldPath(result.message)).toEqual(["early_stopping"]);
  });
  it("keeps one-trial fixed/native recipes without an optimizer", () => {
    expect(earlyStoppingPolicy({trial_count:{max:1}})).toBe("FORBIDDEN");
    expect(earlyStoppingPolicy({trial_count:{max:3}})).toBe("OPTIONAL");
    expect(earlyStoppingRefusal({early_stopping:null,optuna_trials:1},"FORBIDDEN")).toBeNull();
    expect(earlyStoppingRefusal({early_stopping:1,optuna_trials:1},"FORBIDDEN")?.reason_code).toBe("PROFILE_EARLY_STOPPING_NOT_ADMITTED");
  });
  it("requires the pinned request for shortened populations and keeps null exact", () => {
    const request={optuna_trials:400,early_stopping:200};
    expect(retainedStudyTrialCountAdmitted(201,400,request)).toBe(true);
    expect(retainedStudyTrialCountAdmitted(603,400,request,3)).toBe(true);
    expect(retainedStudyTrialCountAdmitted(201,400)).toBe(false);
    expect(retainedStudyTrialCountAdmitted(201,400,{...request,early_stopping:null})).toBe(false);
    expect(retainedStudyTrialCountAdmitted(201,400,{...request,optuna_trials:3})).toBe(false);
    expect(retainedStudyTrialCountAdmitted(401,400,request)).toBe(false);
    expect(retainedStudyTrialCountAdmitted(5,400,request,3)).toBe(false);
  });
  it.each([true,false])("never confuses passing data gates with execution permission: %s", allowed => {
    const c=new ResearchPreflightController({} as never,{} as never,{} as never,{} as never);
    const result=(c as unknown as {withAdmission:Function}).withAdmission({gates:[{
      gate:"data",state:"PASS",field_path:["data"],message:"Data verified."}]},
      {allowed,code:allowed?null:"RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE",message:allowed?null:"Early stopping must be an integer from 1 to the declared trials per study."});
    expect(result.may_create_run).toBe(allowed);
    expect(result.gates.at(-1)).toMatchObject({gate:"execution_admission",state:allowed?"PASS":"FAIL",
      field_path:allowed?[]:["early_stopping"]});
  });
});
