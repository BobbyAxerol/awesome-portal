import "reflect-metadata";
import {createHash} from "node:crypto";
import {describe,expect,it,vi} from "vitest";
import type {Pool} from "pg";
import {GUARDS_METADATA} from "@nestjs/common/constants";
import {CSRF_COOKIE} from "../src/auth/cookies";
import {sha256} from "../src/auth/argon";
import {SessionGuard} from "../src/facade/session.guard";
import {AccessPolicyError} from "../src/execution-v2/access.contract";
const mocks=vi.hoisted(()=>({inspect:vi.fn(),prereq:vi.fn()}));
vi.mock("../src/execution-v2/c2-b1-preflight",()=>({inspectPinnedC2B1NotAuthorized:mocks.inspect}));
vi.mock("../src/execution-v2/c2-p7-acceptance",()=>({inspectC2P7Prerequisites:mocks.prereq}));
import {C2P7EmergencyReviewCandidateService,C2P7ReviewCandidateService} from "../src/execution-v2/c2-p7-review-candidate.service";
import {C2P7CandidateNoStoreGuard,C2P7EmergencyCandidateController,C2P7ReviewCandidateController} from "../src/execution-v2/c2-p7-review-candidate.controller";
const hash=(v:Uint8Array)=>createHash("sha256").update(v).digest("hex");
const actor={user_id:"owner",session_id:"session",session_generation:1},pin="a".repeat(64),cycle="b".repeat(64);
const b1=Buffer.from("synthetic b1"),sourceProof=Buffer.from(JSON.stringify({payload:Buffer.from(JSON.stringify({a1_sha256:"d".repeat(64),
  jwks_sha256:"e".repeat(64),p8_spki_sha256:"f".repeat(64)})).toString("base64url")})),csrf="TEST_ONLY_CSRF";
const scopes=[{environment:"paper",portfolio_id:"paper-portfolio-g1"},{environment:"paper",portfolio_id:"paper-root-g1"}];
const doc={operations:["HISTORY","READ"],fields:["business_report"],scopes,visibility:"BUSINESS"};
const sourceBinding=()=>({b1_sha256:pin,workspace_id:"workspace",owner_user_id:"owner",subject:"owner",issuer:"issuer",
  current_workload_ref:"portal-workload",source_workload_id:"source-workload",ts_user_id:"source-user",environment:"paper",...doc,
  application_revision:"app",authority_revision:7,mapping_sha256:"c".repeat(64),signer_kid:"key",effective_from_ms:1000,
  expires_at_ms:5000,source_evidence_sha256:hash(sourceProof)});
const pins=(enabled=true,environment:"RESEARCH"|undefined="RESEARCH")=>({enabled,environment,workspace_id:"workspace",cycle_sha256:cycle,
  b1_sha256:pin,b1_bytes:b1,source_proof:sourceProof});
function fixture(enabled=true) {
  mocks.inspect.mockReturnValue({head:{user_id:"source-user"},acceptance:{document:doc}});
  mocks.prereq.mockResolvedValue({missing:["TEST_ONLY_NOT_AUTHORIZED"]});
  const query=vi.fn().mockResolvedValue({rowCount:0,rows:[]}),client={query,release:vi.fn()};
  const lookup=vi.fn().mockResolvedValue({rowCount:1,rows:[{intent_id:"afba55ed-e41c-4e30-a0e3-bb497a486879"}]});
  const pool={options:{connectionTimeoutMillis:1000,query_timeout:1000},connect:vi.fn().mockResolvedValue(client),query:lookup} as unknown as Pool;
  const source={verify:vi.fn((_proof:Uint8Array)=>sourceBinding())};
  const intents={approve:vi.fn(),approveAndRegister:vi.fn().mockResolvedValue({intent_id:"afba55ed-e41c-4e30-a0e3-bb497a486879"})};
  const registrations={change:vi.fn().mockResolvedValue({state:"RECORDED_NOT_AUTHORIZED"})};
  const records={recordFromIntent:vi.fn().mockResolvedValue({acceptance_id:"accept",delegation_id:"delegate"})};
  const emergency={reduce:vi.fn().mockResolvedValue({state:"AUTHORITY_PROPAGATION_PENDING"})};
  const service=new C2P7ReviewCandidateService(pool,source,intents as never,registrations as never,records as never,pins(enabled));
  const reduction=new C2P7EmergencyReviewCandidateService(emergency as never,{enabled,environment:"RESEARCH",workspace_id:"workspace"});
  return {pool,source,intents,registrations,records,emergency,service,reduction,client,lookup};
}
describe("P7 candidate review composition (synthetic, unmounted)",()=>{
  it("keeps the installed review and reduction dependencies pinned against property shadowing",async()=>{
    const f=fixture(),preview=await f.service.preview(actor);
    for(const key of ["pool","source","intents","registrations","records","workspace","cycle","pin","b1","proof","enabled", "ready", "selected", "reviewDigest"])
      expect(Reflect.set(f.service,key,null)).toBe(true);
    expect(Reflect.set(f.reduction,"emergency",null)).toBe(true);
    expect(Reflect.set(f.reduction,"workspace","other")).toBe(true);
    expect(Reflect.set(f.reduction,"enabled",false)).toBe(true);
    await expect(f.service.confirm(actor,preview.confirmation_sha256,"original-key")).resolves.toMatchObject({
      state:"P7_PREPARATION_RECORDED_NOT_AUTHORIZED"});
    await expect(f.reduction.revoke(actor,"afba55ed-e41c-4e30-a0e3-bb497a486879"))
      .resolves.toMatchObject({state:"AUTHORITY_PROPAGATION_PENDING"});
    expect(f.intents.approveAndRegister).toHaveBeenCalledTimes(1);
    expect(f.emergency.reduce).toHaveBeenCalledWith(actor,"workspace","afba55ed-e41c-4e30-a0e3-bb497a486879");
    const dark=fixture(false);
    expect(Reflect.set(dark.service,"enabled",true)).toBe(true);
    expect(Reflect.set(dark.reduction,"enabled",true)).toBe(true);
    await expect(dark.service.preview(actor)).rejects.toThrow();
    await expect(dark.reduction.revoke(actor,"afba55ed-e41c-4e30-a0e3-bb497a486879")).rejects.toThrow();
  });
  it("does not call replacement methods injected into its already selected dependencies",async()=>{
    const f=fixture(),preview=await f.service.preview(actor),approve=f.intents.approveAndRegister,
      record=f.records.recordFromIntent,reduce=f.emergency.reduce,replacement=vi.fn();
    Object.assign(f.intents,{approveAndRegister:replacement});
    Object.assign(f.records,{recordFromIntent:replacement});
    Object.assign(f.emergency,{reduce:replacement});
    await expect(f.service.confirm(actor,preview.confirmation_sha256,"original-key"))
      .resolves.toMatchObject({state:"P7_PREPARATION_RECORDED_NOT_AUTHORIZED"});
    await expect(f.reduction.revoke(actor,"afba55ed-e41c-4e30-a0e3-bb497a486879"))
      .resolves.toMatchObject({state:"AUTHORITY_PROPAGATION_PENDING"});
    expect(approve).toHaveBeenCalledTimes(1);expect(record).toHaveBeenCalledTimes(1);
    expect(reduce).toHaveBeenCalledTimes(1);expect(replacement).not.toHaveBeenCalled();
    Object.assign(f.source,{verify:replacement});
    await expect(f.service.preview(actor)).rejects.toThrow("C2_P7_REVIEW_UNAVAILABLE");
    expect(replacement).not.toHaveBeenCalled();
  });
  it("is dark unless explicit Research flag is set",async()=>{
    const f=fixture(false);await expect(f.service.preview(actor)).rejects.toThrow();
    await expect(f.service.confirm(actor,"a".repeat(64),"idempotency-key")).rejects.toThrow();
    await expect(f.reduction.revoke(actor,"afba55ed-e41c-4e30-a0e3-bb497a486879")).rejects.toThrow();
    expect(f.source.verify).not.toHaveBeenCalled();expect(f.intents.approve).not.toHaveBeenCalled();expect(f.emergency.reduce).not.toHaveBeenCalled();
  });
  it("confirms exact owner/session-bound reviewed scope without leaking the one-view proof",async()=>{
    const f=fixture(),preview=await f.service.preview(actor);
    expect(preview).toMatchObject({state:"REVIEW_ONLY_NOT_AUTHORIZED",issuer:"issuer",subject:"owner",
      current_workload_ref:"portal-workload",ts_user_id:"source-user",workload_id:"source-workload",
      operations:["HISTORY","READ"],scopes,p8_spki_sha256:"f".repeat(64)});
    expect(JSON.stringify(preview)).not.toContain(sourceProof.toString());
    expect(JSON.stringify(preview)).not.toContain("proof");
    expect(JSON.stringify(preview)).not.toContain("private_key");
    const result=await f.service.confirm(actor,preview.confirmation_sha256,"idempotency-key");
    expect(result).toEqual({state:"P7_PREPARATION_RECORDED_NOT_AUTHORIZED",intent_id:"afba55ed-e41c-4e30-a0e3-bb497a486879",
      acceptance_id:"accept",delegation_id:"delegate"});
    expect(JSON.stringify(result)).not.toContain("proof");
    expect(f.intents.approveAndRegister).toHaveBeenCalledTimes(1);expect(f.registrations.change).not.toHaveBeenCalled();
    expect(f.records.recordFromIntent).toHaveBeenCalledTimes(1);
    await expect(f.service.confirm({...actor,session_id:"other"},preview.confirmation_sha256,"idempotency-key")).rejects.toThrow();
  });
  it("zeroes each verifier copy after successful and failed review without changing pinned input",async()=>{
    const f=fixture(),originalHash=hash(sourceProof);await f.service.preview(actor);
    const first=f.source.verify.mock.calls[0]![0];expect(Buffer.from(first).every(byte=>byte===0)).toBe(true);
    f.source.verify.mockImplementationOnce(()=>{throw new Error("TEST_ONLY verifier failure");});
    await expect(f.service.preview(actor)).rejects.toThrow();
    const second=f.source.verify.mock.calls[1]![0];expect(Buffer.from(second).every(byte=>byte===0)).toBe(true);
    expect(hash(sourceProof)).toBe(originalHash);
    await expect(f.service.preview(actor)).resolves.toMatchObject({state:"REVIEW_ONLY_NOT_AUTHORIZED"});
  });
  it("does not report an orphaned intent after atomic registration failure",async()=>{
    const f=fixture(),preview=await f.service.preview(actor);f.intents.approveAndRegister.mockRejectedValueOnce(new Error("TEST_ONLY failure"));
    f.lookup.mockResolvedValueOnce({rowCount:0,rows:[]});
    await expect(f.service.confirm(actor,preview.confirmation_sha256,"idempotency-key")).rejects.toThrow();
    expect(f.records.recordFromIntent).not.toHaveBeenCalled();
  });
  it("recovers an ambiguous registration response only via the original key and revalidation",async()=>{
    const f=fixture(),preview=await f.service.preview(actor);
    f.intents.approveAndRegister.mockRejectedValueOnce(new Error("TEST_ONLY lost commit response"));
    const fakeResume=vi.fn().mockResolvedValue({state:"TEST_ONLY_FAKE"});
    expect(Reflect.set(f.service,"resumeByKey",fakeResume)).toBe(true);
    expect(Reflect.set(f.service,"resume",fakeResume)).toBe(true);
    const result=await f.service.confirm(actor,preview.confirmation_sha256,"original-key");
    expect(result).toMatchObject({state:"P7_PREPARATION_RECORDED_NOT_AUTHORIZED",intent_id:"afba55ed-e41c-4e30-a0e3-bb497a486879"});
    expect(f.intents.approveAndRegister).toHaveBeenCalledTimes(1);
    expect(f.records.recordFromIntent).toHaveBeenCalledTimes(1);
    expect(fakeResume).not.toHaveBeenCalled();
    const rejected=fixture(),rejectedPreview=await rejected.service.preview(actor);
    rejected.intents.approveAndRegister.mockRejectedValueOnce(new Error("TEST_ONLY lost commit response"));
    rejected.records.recordFromIntent.mockRejectedValueOnce(new Error("TEST_ONLY revoked"));
    await expect(rejected.service.confirm(actor,rejectedPreview.confirmation_sha256,"original-key")).rejects.toThrow();
  });
  it("reports P7 uncertainty separately after registration completed",async()=>{
    const f=fixture(),preview=await f.service.preview(actor);f.records.recordFromIntent.mockRejectedValueOnce(new Error("private database data"));
    const result=await f.service.confirm(actor,preview.confirmation_sha256,"idempotency-key");
    expect(result.state).toBe("REGISTRATION_RECORDED_P7_NOT_CONFIRMED");expect(JSON.stringify(result)).not.toContain("private");
    expect(f.intents.approveAndRegister).toHaveBeenCalledTimes(1);expect(f.registrations.change).not.toHaveBeenCalled();
  });
  it("retries only transient contention on the same reviewed intent and revalidates each time",async()=>{
    const f=fixture(),preview=await f.service.preview(actor);
    f.records.recordFromIntent.mockRejectedValueOnce(new AccessPolicyError("ACCESS_RETRY_REQUIRED",409));
    const result=await f.service.confirm(actor,preview.confirmation_sha256,"idempotency-key");
    expect(result).toMatchObject({state:"P7_PREPARATION_RECORDED_NOT_AUTHORIZED",intent_id:"afba55ed-e41c-4e30-a0e3-bb497a486879"});
    expect(f.intents.approveAndRegister).toHaveBeenCalledTimes(1);
    expect(f.records.recordFromIntent).toHaveBeenCalledTimes(2);
    expect(f.records.recordFromIntent.mock.calls[0]).toEqual(f.records.recordFromIntent.mock.calls[1]);

    const revoked=fixture(),review=await revoked.service.preview(actor);
    revoked.records.recordFromIntent.mockRejectedValueOnce(new AccessPolicyError("ACCESS_RETRY_REQUIRED",409))
      .mockRejectedValueOnce(new Error("C2_P7_INTENT_MISMATCH"));
    const denied=await revoked.service.confirm(actor,review.confirmation_sha256,"idempotency-key");
    expect(denied).toMatchObject({state:"REGISTRATION_RECORDED_P7_NOT_CONFIRMED"});
    expect(revoked.records.recordFromIntent).toHaveBeenCalledTimes(2);
    expect(revoked.intents.approveAndRegister).toHaveBeenCalledTimes(1);
  });
  it("bounds retries and preserves the original when contention persists",async()=>{
    const f=fixture(),preview=await f.service.preview(actor);
    f.records.recordFromIntent.mockRejectedValue(new AccessPolicyError("ACCESS_RETRY_REQUIRED",409));
    const result=await f.service.confirm(actor,preview.confirmation_sha256,"idempotency-key");
    expect(result).toMatchObject({state:"REGISTRATION_RECORDED_P7_NOT_CONFIRMED",intent_id:"afba55ed-e41c-4e30-a0e3-bb497a486879"});
    expect(f.records.recordFromIntent).toHaveBeenCalledTimes(4);
    expect(f.intents.approveAndRegister).toHaveBeenCalledTimes(1);
  });
  it("retries PostgreSQL lock contention but not unrelated database failures",async()=>{
    const busy=fixture(),review=await busy.service.preview(actor);
    busy.records.recordFromIntent.mockRejectedValueOnce(Object.assign(new Error("lock timeout"),{code:"55P03"}));
    await expect(busy.service.confirm(actor,review.confirmation_sha256,"idempotency-key"))
      .resolves.toMatchObject({state:"P7_PREPARATION_RECORDED_NOT_AUTHORIZED"});
    expect(busy.records.recordFromIntent).toHaveBeenCalledTimes(2);
    const other=fixture(),otherReview=await other.service.preview(actor);
    other.records.recordFromIntent.mockRejectedValueOnce(Object.assign(new Error("invalid input"),{code:"22000"}));
    await expect(other.service.confirm(actor,otherReview.confirmation_sha256,"idempotency-key"))
      .resolves.toMatchObject({state:"REGISTRATION_RECORDED_P7_NOT_CONFIRMED"});
    expect(other.records.recordFromIntent).toHaveBeenCalledTimes(1);
  });
  it("resumes only the reviewed original intent without reminting a proof",async()=>{
    const f=fixture(),preview=await f.service.preview(actor),intentId="afba55ed-e41c-4e30-a0e3-bb497a486879";
    await expect(f.service.resume(actor,preview.confirmation_sha256,intentId)).resolves.toMatchObject({
      state:"P7_PREPARATION_RECORDED_NOT_AUTHORIZED",intent_id:intentId});
    expect(f.intents.approve).not.toHaveBeenCalled();expect(f.registrations.change).not.toHaveBeenCalled();
    expect(f.records.recordFromIntent).toHaveBeenCalledTimes(1);
    await expect(f.service.resume({...actor,session_id:"other"},preview.confirmation_sha256,intentId)).rejects.toThrow();
    await expect(f.service.resume(actor,preview.confirmation_sha256,"invalid")).rejects.toThrow();
  });
  it("locates a lost response by the original key and revalidates before writing",async()=>{
    const f=fixture(),preview=await f.service.preview(actor);
    await expect(f.service.resumeByKey(actor,preview.confirmation_sha256,"original-key")).resolves.toMatchObject({
      state:"P7_PREPARATION_RECORDED_NOT_AUTHORIZED",intent_id:"afba55ed-e41c-4e30-a0e3-bb497a486879"});
    expect(f.intents.approve).not.toHaveBeenCalled();expect(f.registrations.change).not.toHaveBeenCalled();
    expect(f.records.recordFromIntent).toHaveBeenCalledTimes(1);
    f.lookup.mockResolvedValueOnce({rowCount:0,rows:[]});
    await expect(f.service.resumeByKey(actor,preview.confirmation_sha256,"missing-key")).rejects.toThrow();
    expect(f.records.recordFromIntent).toHaveBeenCalledTimes(1);
  });
  it("refuses mismatched owner/source scope without touching writes",async()=>{
    const f=fixture();f.source.verify.mockReturnValueOnce({...sourceBinding(),owner_user_id:"other"});
    await expect(f.service.preview(actor)).rejects.toThrow();expect(f.intents.approve).not.toHaveBeenCalled();
    await expect(f.service.preview({...actor,user_id:"other"})).rejects.toThrow();expect(f.intents.approve).not.toHaveBeenCalled();
    f.source.verify.mockReturnValueOnce({...sourceBinding(),operations:["HISTORY","READ","STREAM"]});
    await expect(f.service.preview(actor)).rejects.toThrow();expect(f.intents.approve).not.toHaveBeenCalled();
    f.source.verify.mockReturnValueOnce({...sourceBinding(),source_evidence_sha256:"f".repeat(64)});
    await expect(f.service.preview(actor)).rejects.toThrow();expect(f.intents.approve).not.toHaveBeenCalled();
  });
  it("binds the owner's confirmation to each reviewed source identity and mapping",async()=>{
    const fields=["issuer","current_workload_ref","mapping_sha256"] as const;
    for(const field of fields){
      const f=fixture(),preview=await f.service.preview(actor);
      f.source.verify.mockReturnValueOnce({...sourceBinding(),[field]:field==="mapping_sha256"?"1".repeat(64):"changed"});
      await expect(f.service.confirm(actor,preview.confirmation_sha256,"idempotency-key")).rejects.toThrow();
      expect(f.intents.approve).not.toHaveBeenCalled();
    }
    const f=fixture(),preview=await f.service.preview(actor);
    f.source.verify.mockReturnValueOnce({...sourceBinding(),ts_user_id:"other"});
    await expect(f.service.confirm(actor,preview.confirmation_sha256,"idempotency-key")).rejects.toThrow();
    expect(f.intents.approve).not.toHaveBeenCalled();
  });
});

describe("P7 controller boundaries (direct controller unit; no mounted HTTP)",()=>{
  const request=()=>({headers:{origin:"https://portal.test","x-portal-csrf":csrf,"x-portal-idempotency-key":"key-123456"},
    cookies:{[CSRF_COOKIE]:csrf},portalUser:{userId:"owner",sessionVersion:1},portalSession:{sessionId:"session",csrfSecretHash:sha256(csrf)}});
  const ctrl=()=>{const review={preview:vi.fn(),confirm:vi.fn(),resume:vi.fn(),resumeByKey:vi.fn()},emergency={revoke:vi.fn()};
    const auth={config:{PORTAL_PUBLIC_ORIGIN:"https://portal.test"}} as never;
    const controller=new C2P7ReviewCandidateController(review as never,auth);
    const emergencyController=new C2P7EmergencyCandidateController(emergency as never,auth);
    return {controller,emergencyController,review,emergency};};
  it("installs no-store guard before the normal authenticated session guard",()=>{
    expect(Reflect.getMetadata(GUARDS_METADATA,C2P7ReviewCandidateController)).toEqual([C2P7CandidateNoStoreGuard,SessionGuard]);
    expect(Reflect.getMetadata(GUARDS_METADATA,C2P7EmergencyCandidateController)).toEqual([C2P7CandidateNoStoreGuard,SessionGuard]);
    const header=vi.fn(),guard=new C2P7CandidateNoStoreGuard();
    expect(guard.canActivate({switchToHttp:()=>({getResponse:()=>({header})})} as never)).toBe(true);
    expect(header).toHaveBeenCalledWith("Cache-Control","private, no-store");
  });
  it("denies missing origin, invalid csrf, missing idempotency, and caller-supplied scope",async()=>{
    const f=ctrl(),r=request(),body={confirmation_sha256:"a".repeat(64)};
    await expect(f.controller.confirm({...r,headers:{...r.headers,origin:"https://other.test"}} as never,body)).rejects.toMatchObject({code:"ORIGIN_DENIED"});
    await expect(f.controller.confirm({...r,cookies:{}} as never,body)).rejects.toMatchObject({code:"CSRF_MISSING"});
    const headers={...r.headers};delete (headers as Partial<typeof headers>)["x-portal-idempotency-key"];
    await expect(f.controller.confirm({...r,headers} as never,body)).rejects.toMatchObject({code:"IDEMPOTENCY_KEY_REQUIRED"});
    await expect(f.controller.confirm(r as never,{...body,workspace_id:"attacker"})).rejects.toMatchObject({code:"C2_P7_INPUT_INVALID"});
    await expect(f.controller.preview(r as never,{scope:"attacker"})).rejects.toMatchObject({code:"C2_P7_INPUT_INVALID"});
    expect(f.review.confirm).not.toHaveBeenCalled();expect(f.review.preview).not.toHaveBeenCalled();
  });
  it("does not reflect secrets and does not require idempotency for emergency reduction",async()=>{
    const f=ctrl(),r=request();f.review.preview.mockRejectedValue(new Error("TEST_ONLY_PRIVATE_SECRET"));
    const error=await f.controller.preview(r as never,{}).catch(e=>e);
    expect(error).toMatchObject({code:"C2_P7_REVIEW_UNAVAILABLE",status:503});expect(String(error)).not.toContain("TEST_ONLY_PRIVATE_SECRET");
    // Unsigned confirm remains fail-closed; it must not reach the writer.
    await expect(f.controller.confirm(r as never,{confirmation_sha256:"a".repeat(64)}))
      .rejects.toMatchObject({code:"C2_P7_OWNER_ATTESTATION_REQUIRED",status:503});
    expect(f.review.confirm).not.toHaveBeenCalled();
    const headers={...r.headers};delete (headers as Partial<typeof headers>)["x-portal-idempotency-key"];
    f.emergency.revoke.mockResolvedValue({state:"AUTHORITY_PROPAGATION_PENDING"});
    await expect(f.emergencyController.emergencyRevoke({...r,headers} as never,{intent_id:"afba55ed-e41c-4e30-a0e3-bb497a486879"}))
      .resolves.toEqual({state:"AUTHORITY_PROPAGATION_PENDING"});
  });
  it("validates resume input and security, then refuses unsigned owner confirmation",async()=>{
    const f=ctrl(),r=request(),body={confirmation_sha256:"a".repeat(64),intent_id:"afba55ed-e41c-4e30-a0e3-bb497a486879"};
    await expect(f.controller.resume({...r,headers:{...r.headers,origin:"https://other.test"}} as never,body))
      .rejects.toMatchObject({code:"ORIGIN_DENIED"});
    await expect(f.controller.resume({...r,cookies:{}} as never,body)).rejects.toMatchObject({code:"CSRF_MISSING"});
    await expect(f.controller.resume(r as never,{...body,workspace_id:"attacker"})).rejects.toMatchObject({code:"C2_P7_INPUT_INVALID"});
    expect(f.review.resume).not.toHaveBeenCalled();
    await expect(f.controller.resume(r as never,body))
      .rejects.toMatchObject({code:"C2_P7_OWNER_ATTESTATION_REQUIRED",status:503});
    expect(f.review.resume).not.toHaveBeenCalled();
  });
  it("requires the original idempotency key but refuses unsigned recovery",async()=>{
    const f=ctrl(),r=request(),body={confirmation_sha256:"a".repeat(64)};
    const headers={...r.headers};delete (headers as Partial<typeof headers>)["x-portal-idempotency-key"];
    await expect(f.controller.resumeByKey({...r,headers} as never,body)).rejects.toMatchObject({code:"IDEMPOTENCY_KEY_REQUIRED"});
    await expect(f.controller.resumeByKey({...r,cookies:{}} as never,body)).rejects.toMatchObject({code:"CSRF_MISSING"});
    await expect(f.controller.resumeByKey(r as never,body))
      .rejects.toMatchObject({code:"C2_P7_OWNER_ATTESTATION_REQUIRED",status:503});
    expect(f.review.resumeByKey).not.toHaveBeenCalled();
  });
});
