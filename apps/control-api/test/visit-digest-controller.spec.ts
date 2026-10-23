import "reflect-metadata";
import { it, expect, vi, describe } from "vitest";
import { VisitDigestController } from "../src/command-center/visit-digest.controller";
import { sha256 } from "../src/auth/argon";
import { CSRF_COOKIE, CSRF_HEADER } from "../src/auth/cookies";
const body = {snapshot_revision:"a".repeat(64),expected_baseline_version:0};
function fixture() {
  const service = {read:vi.fn(async () => "read"),seen:vi.fn(async () => "seen")};
  const workspaces={isMember:vi.fn(async()=>true)};
  const controller=new VisitDigestController(service as any,workspaces as any,{PORTAL_PUBLIC_ORIGIN:"https://portal.example"} as any);
  const request={portalUser:{userId:"u"},portalSession:{csrfSecretHash:sha256("token")},portalWorkspaceId:"home",headers:{origin:"https://portal.example",[CSRF_HEADER]:"token"},cookies:{[CSRF_COOKIE]:"token"}} as any;
  return {service,workspaces,controller,request};
}
describe("visit digest controller",()=>{
  it("uses authenticated identity and exact selected workspace",async()=>{
    const f=fixture();await f.controller.read(f.request,{workspace_id:"other"});
    expect(f.workspaces.isMember).toHaveBeenCalledWith("other","u");
    expect(f.service.read).toHaveBeenCalledWith(expect.objectContaining({workspaceId:"other",user:f.request.portalUser}));
  });
  it("rejects foreign workspace before service",async()=>{
    const f=fixture();f.workspaces.isMember.mockResolvedValue(false);
    await expect(f.controller.seen(f.request,body,{workspace_id:"hidden"})).rejects.toMatchObject({status:404});
    expect(f.service.seen).not.toHaveBeenCalled();
  });
  it("requires origin and session-bound double-submit CSRF",async()=>{
    const f=fixture();delete f.request.headers.origin;
    await expect(f.controller.seen(f.request,body)).rejects.toMatchObject({code:"ORIGIN_MISSING",status:403});
    f.request.headers.origin="https://portal.example";f.request.cookies[CSRF_COOKIE]="different";
    await expect(f.controller.seen(f.request,body)).rejects.toMatchObject({code:"CSRF_INVALID",status:403});
    expect(f.service.seen).not.toHaveBeenCalled();
  });
  it("accepts valid seen and rejects unknown body/identity injection",async()=>{
    const f=fixture();expect(await f.controller.seen(f.request,body)).toBe("seen");
    await expect(f.controller.seen(f.request,{...body,user_id:"someone"})).rejects.toMatchObject({code:"VISIT_DIGEST_INPUT_INVALID"});
    expect(f.service.seen).toHaveBeenCalledTimes(1);
  });
  it("rejects unknown query selectors and malformed revision",async()=>{
    const f=fixture();await expect(f.controller.read(f.request,{user_id:"other"})).rejects.toMatchObject({status:400});
    await expect(f.controller.seen(f.request,{...body,snapshot_revision:"opaque"})).rejects.toMatchObject({status:400});
    expect(f.service.read).not.toHaveBeenCalled();expect(f.service.seen).not.toHaveBeenCalled();
  });
});
