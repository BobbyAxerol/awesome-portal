import {describe,expect,it,vi} from "vitest";
import {composeC2P7Candidate} from "../src/execution-v2/c2-p7-review-candidate.composition";
import {C2P7EmergencyReviewCandidateService,C2P7ReviewCandidateService} from "../src/execution-v2/c2-p7-review-candidate.service";
const actor={user_id:"TEST_ONLY-owner",session_id:"TEST_ONLY-session",session_generation:1};
describe("P7 dark-by-default composition, never mounted",()=>{
  it("boots dark without any configuration or source",async()=>{
    const c=composeC2P7Candidate();expect(c.review_state).toBe("DARK");expect(c.emergency_state).toBe("DARK");
    await expect(c.review.preview(actor)).rejects.toThrow("C2_P7_REVIEW_UNAVAILABLE");
    await expect(c.review.resume(actor,"TEST_ONLY","TEST_ONLY")).rejects.toThrow("C2_P7_REVIEW_UNAVAILABLE");
    await expect(c.review.resumeByKey(actor,"TEST_ONLY","TEST_ONLY")).rejects.toThrow("C2_P7_REVIEW_UNAVAILABLE");
    await expect(c.emergency.revoke(actor,"TEST_ONLY")).rejects.toThrow("C2_P7_REVIEW_UNAVAILABLE");
  });
  it("does not access disabled factory, environment or any pin",async()=>{
    const opt={enabled:false,get environment():never{throw new Error("environment read");},
      get create():never{throw new Error("factory read");}};
    const c=composeC2P7Candidate({review:opt});expect(c.review_state).toBe("DARK");
    await expect(c.review.preview(actor)).rejects.toThrow();
  });
  it("does not construct in the wrong environment or with missing config",()=>{
    const make=vi.fn();const c=composeC2P7Candidate({review:{enabled:true,environment:"PRODUCTION",create:make},emergency:{enabled:true}});
    expect(make).not.toHaveBeenCalled();expect(c.review_state).toBe("DARK");expect(c.emergency_state).toBe("DARK");
  });
  it("keeps emergency independent when review constructor fails",async()=>{
    const fakeEmergency=Object.assign(Object.create(C2P7EmergencyReviewCandidateService.prototype),
      {revoke:vi.fn(async()=>({state:"AUTHORITY_PROPAGATION_PENDING"}))}) as C2P7EmergencyReviewCandidateService;
    const c=composeC2P7Candidate({review:{enabled:true,environment:"RESEARCH",create:()=>{throw new Error("TEST_ONLY sensitive source");}},
      emergency:{enabled:true,environment:"RESEARCH",create:()=>fakeEmergency}});
    expect(c.review_state).toBe("DARK");expect(c.emergency_state).toBe("FACTORY_RETURNED_NOT_COMMISSIONED");
    await expect(c.review.preview(actor)).rejects.toThrow("C2_P7_REVIEW_UNAVAILABLE");
    await expect(c.emergency.revoke(actor,"TEST_ONLY")).resolves.toEqual({state:"AUTHORITY_PROPAGATION_PENDING"});
  });
  it("rejects untyped factories and separately invokes only enabled graphs",()=>{
    const make=vi.fn(()=>Object.assign(Object.create(C2P7ReviewCandidateService.prototype),
      {preview:vi.fn(),confirm:vi.fn()}) as C2P7ReviewCandidateService),unexpected=vi.fn();
    const c=composeC2P7Candidate({review:{enabled:true,environment:"RESEARCH",create:make},
      emergency:{enabled:true,environment:"RESEARCH",create:unexpected}});
    expect(make).toHaveBeenCalledOnce();expect(unexpected).toHaveBeenCalledOnce();
    expect(c.review_state).toBe("FACTORY_RETURNED_NOT_COMMISSIONED");expect(c.emergency_state).toBe("DARK");
  });
});
