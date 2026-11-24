/** HTTP adapter tests, synthetic service only. Real coordinator/DB coverage is
 * in ordinary-profile-authority-pg; these do not prove an installed route. */
import { describe, expect, it, vi } from "vitest";
import { sha256 } from "../src/auth/argon";
import { AuthService } from "../src/auth/auth.service";
import { CSRF_COOKIE, CSRF_HEADER } from "../src/auth/cookies";
import { CurrentHumanLeaseError } from "../src/execution-v2/current-human-candidate";
import { OrdinaryProfileAuthority } from "../src/execution-v2/ordinary-profile-authority";
import { OrdinaryProfileAuthorityController } from "../src/execution-v2/ordinary-profile-authority.controller";
import { OrdinaryProfileAuthorityError } from "../src/execution-v2/ordinary-profile-authority.contract";
const ORIGIN="https://portal.example",TOKEN="TEST_ONLY-csrf",KEY="TEST_ONLY-operation-1";
const actor={user_id:"TEST_ONLY-stan",session_id:"TEST_ONLY-session",session_generation:7};
const head={revision:"TEST_ONLY-head",digest:"sha256:"+"a".repeat(64)};
const delegate={operation_id:KEY,workspace_id:"TEST_ONLY-ws",subject_user_id:"TEST_ONLY-child",
  parent_grant_id:"TEST_ONLY-parent",expected_parent_revision:"TEST_ONLY-r1",expected_head:head,
  valid_from_ms:1800000000000,valid_until_ms:1800000060000,reason:"TEST_ONLY-delegation"};
const revoke={operation_id:KEY,workspace_id:delegate.workspace_id,grant_id:"TEST_ONLY-child-grant",
  expected_grant_revision:"TEST_ONLY-r1",expected_head:head,reason:"TEST_ONLY-revoke"};
function setup(){
  const service={delegate:vi.fn().mockResolvedValue({outcome:"APP_APPLIED"}),
    revoke:vi.fn().mockResolvedValue({outcome:"APP_APPLIED"}),
    stepUp:vi.fn().mockResolvedValue({family:"ACCESS_ADMIN"})};
  const auth={config:{PORTAL_PUBLIC_ORIGIN:ORIGIN}} as AuthService;
  const controller=new OrdinaryProfileAuthorityController(service as unknown as OrdinaryProfileAuthority,auth);
  const req={headers:{origin:ORIGIN,[CSRF_HEADER]:TOKEN,"x-portal-idempotency-key":KEY},cookies:{[CSRF_COOKIE]:TOKEN},
    portalUser:{userId:actor.user_id,sessionVersion:7},portalSession:{sessionId:actor.session_id,csrfSecretHash:sha256(TOKEN)}};
  return {controller,service,auth,req:req as unknown as Parameters<typeof controller.delegate>[0]};
}
describe("ordinary app-authority HTTP adapter",()=>{
  it("uses only the authenticated actor and passes the exact CAS/key request",async()=>{
    const {controller,service,req}=setup();
    await controller.delegate(req,delegate);await controller.revoke(req,revoke);
    expect(service.delegate).toHaveBeenCalledExactlyOnceWith(actor,delegate);
    expect(service.revoke).toHaveBeenCalledExactlyOnceWith(actor,revoke);
  });
  it.each(["delegate","revoke","stepUp"] as const)("%s rejects absent/foreign origin and broken CSRF before service",async method=>{
    for(const change of [{origin:undefined},{origin:"https://foreign.example"},{[CSRF_HEADER]:undefined},{[CSRF_HEADER]:"other"}]){
      const {controller,service,req}=setup();Object.assign(req.headers,change);
      await expect(Promise.resolve().then(async()=>{await controller[method](req,delegate);})).rejects.toMatchObject({status:403});
      expect(service.delegate).not.toHaveBeenCalled();expect(service.revoke).not.toHaveBeenCalled();expect(service.stepUp).not.toHaveBeenCalled();
    }
  });
  it.each(["delegate","revoke"] as const)("%s refuses mismatched keys and caller-selected authority",async method=>{
    for(const body of [{...(method==="delegate"?delegate:revoke),operation_id:"TEST_ONLY-other"},
      {...(method==="delegate"?delegate:revoke),issued_by:"owner"}]){
      const {controller,service,req}=setup();
      await expect(Promise.resolve().then(()=>controller[method](req,body))).rejects.toMatchObject({status:400});
      expect(service[method]).not.toHaveBeenCalled();
    }
  });
  it("step-up passes the own password only to the private service and rejects extra family",async()=>{
    const {controller,service,auth,req}=setup();const body={workspace_id:delegate.workspace_id,password:"TEST_ONLY-password"};
    await controller.stepUp(req,body);
    expect(service.stepUp).toHaveBeenCalledExactlyOnceWith(actor,body.workspace_id,body.password,auth);
    await expect(controller.stepUp(req,{...body,family:"CAPITAL_COMMAND"})).rejects.toMatchObject({status:400});
  });
  it.each([undefined,[KEY],"short"])("requires a single valid idempotency header (%s)",async key=>{
    const {controller,service,req}=setup();req.headers["x-portal-idempotency-key"]=key;
    await expect(Promise.resolve().then(()=>controller.delegate(req,delegate))).rejects.toMatchObject({code:"IDEMPOTENCY_KEY_REQUIRED",status:400});
    expect(service.delegate).not.toHaveBeenCalled();
  });
  it("sanitizes authority and drain errors without leaking private context",async()=>{
    const {controller,service,req}=setup();
    service.delegate.mockRejectedValueOnce(new OrdinaryProfileAuthorityError("ORDINARY_AUTHORITY_DENIED",403));
    await expect(controller.delegate(req,delegate)).rejects.toMatchObject({code:"ORDINARY_AUTHORITY_DENIED",status:403});
    service.delegate.mockRejectedValueOnce(new CurrentHumanLeaseError("TEST_ONLY-private-drain"));
    await expect(controller.delegate(req,delegate)).rejects.toMatchObject({code:"ORDINARY_AUTHORITY_RETRY_REQUIRED",status:503});
  });
});
