import { afterEach, describe, expect, it, vi } from "vitest";
import R2 from "../../../../../packages/contracts/fixtures/execution-governance.review-capture.r2.valid.json";
import EXIT from "../../../../../packages/contracts/fixtures/execution-governance.review-capture.paper-exit.valid.json";
import NOTE from "../../../../../packages/contracts/fixtures/execution-governance.review-capture.sandbox-note.valid.json";
import { readReviewCapture, readReviewCaptureCapabilities } from "./api/reviewCapture";
import { createHttpApi } from "./api/httpApi";

afterEach(()=>vi.unstubAllGlobals());
describe("BE-R2-8 canonical Portal review capture consumer",()=>{
  it.each([R2,EXIT,NOTE])("reads $action as a Portal note, never a source verdict",fixture=>{
    expect(readReviewCapture(fixture)).toEqual(fixture);
    expect(readReviewCapture({...fixture,source_verdict:"PASS"})).toBeNull();
    expect(readReviewCapture({...fixture,source_side_effect_requested:true})).toBeNull();
    expect(readReviewCapture({...fixture,read_path:"https://external.invalid/"})).toBeNull();
  });
  it("uses the named same-origin route, CSRF and caller-owned retry identity",async()=>{
    const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify(R2),{status:201}));
    vi.stubGlobal("fetch",fetcher); vi.stubGlobal("document",{cookie:"__Host-portal_csrf=test-token"});
    const input={ workspace_id:"ws_fixture",request_key:"intent-1",summary:"Operator review without a source verdict.",
      r1_approval_id:"r1",expected_r1_version:1,portfolio_id:"pf",currency:"USDT",deployment_id:"dep",risk_grant_id:"risk",
      expected_projection_digest:`sha256:${"a".repeat(64)}` };
    const result=await createHttpApi({policy:null}).captureR2(input);
    expect(result.ok).toBe(true);
    expect(fetcher).toHaveBeenCalledWith("/api/v1/execution/governance/r2/capture",expect.objectContaining({
      method:"POST",credentials:"same-origin",body:JSON.stringify(input),headers:expect.objectContaining({"x-portal-csrf":"test-token"}),
    }));
    fetcher.mockResolvedValue(new Response(JSON.stringify({error:{code:"ADMIN_ROLE_REQUIRED",message:"Denied"}}),{status:403}));
    expect(await createHttpApi({policy:null}).captureR2(input)).toMatchObject({ok:false,status:"denied",reason:"ADMIN_ROLE_REQUIRED: Denied"});
  });
  it("rejects unknown, duplicated and unqualified executable actions",()=>{
    expect(readReviewCaptureCapabilities({schema_version:"governance.review-capture-capabilities.v1",authority:"PORTAL",source_side_effect_requested:false,actions:[]})).toBeNull();
  });
});
