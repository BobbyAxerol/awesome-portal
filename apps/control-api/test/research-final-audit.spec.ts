import { afterEach,describe,expect,it,vi } from "vitest";
import { auditTarget,auditResult,auditProof } from "./research-final-audit.fixture";
import { pinnedAuditTargetDigest,pinnedAuditParametersDigest,PINNED_AUDIT_PROFILE_DIGEST,ResearchFinalAuditCreateSchema,
  ResearchFinalAuditReadSchema,VerifiedPinnedAuditSchema } from "../src/research/final-audit.contract";
import { ResearchFinalAuditClient } from "../src/research/final-audit.client";
import { ResearchFinalAuditService } from "../src/research/final-audit.service";
import { sha256ResearchJson } from "../src/research/preflight.service";
import { readPinnedAuditProofs } from "../src/research/final-audit.read";
import { ResearchFinalAuditController } from "../src/research/final-audit.controller";
import { sha256 } from "../src/auth/argon";

const scope={workspaceId:"ws_audit",actorUserId:"usr_audit"};
const user={userId:scope.actorUserId,role:"ADMIN",status:"ACTIVE",mustChangePassword:false};
const config={FEATURE_RESEARCH_RUN_PRODUCER:"true",FEATURE_RESEARCH_WFO_PROFILE:"true",FEATURE_RESEARCH_RETAINED_ARTIFACTS:"true",
  INTERNAL_PRINCIPAL_SECRET:"audit-unit-secret-at-least-thirty-two-bytes",PORTAL_API_BASE_URL:"http://private.example:8000",
  RESEARCH_PREFLIGHT_TIMEOUT_MS:1000,RESEARCH_RUN_PRODUCER_LEASE_SECONDS:120};
const preparation=()=>{
  const {schema_version:_schema,engine_version:_engine,source_config_raw:_config,source_config_digest:_configHash,
    source_selection_raw:_selection,source_selection_digest:_selectionHash,source_selection_kind:_kind,
    source_selection_part_digest:_part,source_selection_part_relative_path:_path,...pins}=auditTarget;
  return pins;
};
function subject(state="QUEUED",proof:unknown=null){
  const repository={parent:vi.fn().mockResolvedValue({pins:preparation(),requestedSpecDigest:"1".repeat(64),effectiveSpecDigest:"2".repeat(64),
    legacyRequest:{strategy_id:"delta-rsi-polynomial-alpha",dataset_id:"unit-fixture",protocol:"advanced",research:{}}}),
    latest:vi.fn().mockResolvedValue({runId:auditResult.run_id,state,proof}),admit:vi.fn(),sealProof:vi.fn()};
  const client={prepare:vi.fn().mockResolvedValue(auditTarget)};
  const metadata={claimNextDurableJob:vi.fn(),recordRunProducerClaim:vi.fn(),recordRunProducerDispatched:vi.fn()};
  const proxy={handleWrite:vi.fn()};
  const bytes={observe:vi.fn()};
  const artifacts={expectation:vi.fn()};
  const service=new ResearchFinalAuditService(repository as never,client as never,metadata as never,proxy as never,
    bytes as never,artifacts as never,config as never);
  return{service,repository,client,metadata,proxy,bytes,artifacts};
}
afterEach(()=>vi.unstubAllGlobals());
describe("Pinned final audit contract/private preparation",()=>{
  it("pins the Python/SQL profile twin and keeps public input closed",()=>{
    expect(PINNED_AUDIT_PROFILE_DIGEST).toBe("457267c54edd02fcea53eceb92a81cdec9fdaefc8b9231638540b51a85b92491");
    const input={client_intent_id:"audit-intent-at-least-16",target_digest:pinnedAuditTargetDigest(auditTarget)};
    expect(ResearchFinalAuditCreateSchema.parse(input)).toEqual(input);
    for(const key of ["params","snapshot_id","source_config_raw","optimization_mode","url","path"])
      expect(ResearchFinalAuditCreateSchema.safeParse({...input,[key]:"forbidden"}).success).toBe(false);
    expect(VerifiedPinnedAuditSchema.safeParse({...auditProof,result_digest:"0".repeat(64)}).success).toBe(false);
  });
  it("exact frozen parameters have Python-compatible identity without Number rounding",()=>{
    expect(pinnedAuditParametersDigest('{"x":"1.20","y":"-0.0","z":"1e-7"}'))
      .toBe(sha256ResearchJson({x:"1.2",y:"0",z:"0.0000001"}));
    expect(pinnedAuditParametersDigest('{"x":"1.123456789012345678901234567890123"}'))
      .toBe(sha256ResearchJson({x:"1.123456789012345678901234567890123"}));
    for(const raw of ['{"x":true}','{"x":1.23}','{"x":"NaN"}','{"x":"1e99"}','{"x":"1e-33"}'])
      expect(()=>pinnedAuditParametersDigest(raw)).toThrow();
  });
  it("uses only fixed private transport and rechecks raw byte/source pins",async()=>{
    const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({schema_version:"research.pinned-audit-preparation.v1",
      target_digest:pinnedAuditTargetDigest(auditTarget),target:auditTarget})));vi.stubGlobal("fetch",fetcher);
    const client=new ResearchFinalAuditClient(config as never);
    expect(await client.prepare(scope.actorUserId,preparation())).toEqual(auditTarget);
    expect(String(fetcher.mock.calls[0]![0])).toBe("http://private.example:8000/internal/research/final-audit/prepare");
    expect(fetcher.mock.calls[0]![1].redirect).toBe("manual");
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify({schema_version:"research.pinned-audit-preparation.v1",
      target_digest:pinnedAuditTargetDigest(auditTarget),target:{...auditTarget,source_selection_raw:"{}"}})));
    await expect(client.prepare(scope.actorUserId,preparation())).rejects.toMatchObject({status:502,code:"RESEARCH_FINAL_AUDIT_UPSTREAM_REJECTED"});
  });
  it("returns typed source refusal/transport outage and rejects oversized JSON",async()=>{
    const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);const client=new ResearchFinalAuditClient(config as never);
    fetcher.mockResolvedValueOnce(new Response("",{status:409}));
    await expect(client.prepare(scope.actorUserId,preparation())).rejects.toMatchObject({status:409});
    fetcher.mockRejectedValueOnce(new TypeError("secret internal address"));
    await expect(client.prepare(scope.actorUserId,preparation())).rejects.toMatchObject({status:503});
    fetcher.mockResolvedValueOnce(new Response("a".repeat(128*1024+1)));
    await expect(client.prepare(scope.actorUserId,preparation())).rejects.toMatchObject({status:502});
  });
});
describe("Final audit actor/idempotency/byte seal boundary",()=>{
  it("GET never admits, claims or dispatches; READY without proof is not VERIFIED",async()=>{
    const x=subject("READY");const value=await x.service.read(user as never,scope,auditTarget.parent_run_id);
    expect(value.state).toBe("AWAITING_VERIFICATION");expect(value.verification).toBeNull();
    expect(ResearchFinalAuditReadSchema.parse(value)).toEqual(value);
    expect(x.repository.admit).not.toHaveBeenCalled();expect(x.metadata.claimNextDurableJob).not.toHaveBeenCalled();
  });
  it("only actual verified custody gets VERIFIED; body has no raw target bytes",async()=>{
    const x=subject("READY",auditProof);const value=await x.service.read(user as never,scope,auditTarget.parent_run_id);
    expect(value).toMatchObject({state:"VERIFIED",verification:auditProof,may_create:false});
    expect(JSON.stringify(value)).not.toContain("source_config_raw");expect(JSON.stringify(value)).not.toContain("source_selection_raw");
  });
  it("readable membership is not producer authority",async()=>{
    const x=subject();const input={client_intent_id:"audit-intent-abcdefghijkl",target_digest:pinnedAuditTargetDigest(auditTarget)};
    for(const actor of [{...user,role:"MEMBER"},{...user,status:"DISABLED"},{...user,mustChangePassword:true}])
      await expect(x.service.create(actor as never,scope,auditTarget.parent_run_id,input,"unit")).rejects.toMatchObject({status:403});
    expect(x.repository.parent).not.toHaveBeenCalled();expect(x.repository.admit).not.toHaveBeenCalled();
  });
  it("refuses stale target before durable mutation; replay of dispatched intent does not redispatch",async()=>{
    const x=subject();const input={client_intent_id:"audit-intent-abcdefghijkl",target_digest:"0".repeat(64)};
    await expect(x.service.create(user as never,scope,auditTarget.parent_run_id,input,"unit")).rejects.toMatchObject({status:409});
    expect(x.repository.admit).not.toHaveBeenCalled();
    x.repository.admit.mockResolvedValue({runId:auditResult.run_id,jobId:"rjob_audit",legacyRequest:{},dispatchState:"DISPATCHED",replayed:true});
    await x.service.create(user as never,scope,auditTarget.parent_run_id,{...input,target_digest:pinnedAuditTargetDigest(auditTarget)},"unit");
    expect(x.metadata.claimNextDurableJob).not.toHaveBeenCalled();expect(x.proxy.handleWrite).not.toHaveBeenCalled();
  });
  it("byte observer outages never turn into generic 500 or verified proof",async()=>{
    const x=subject();x.artifacts.expectation.mockResolvedValue({artifactId:auditProof.artifact_id,state:"SEALED",
      expectedManifestDigest:auditProof.manifest_digest,parts:[]});x.bytes.observe.mockRejectedValue(new Error("private fault"));
    await expect(x.service.seal(scope,{workspace_id:scope.workspaceId,run_id:auditResult.run_id,job_id:"rjob_audit",
      worker_attempt_id:"rwrk_audit",lease_epoch:1,artifact_id:auditProof.artifact_id,artifact_revision:1,
      manifest_digest:auditProof.manifest_digest,result:auditResult})).rejects.toMatchObject({status:503});
    expect(x.repository.sealProof).not.toHaveBeenCalled();
  });
  it("registers only its own exact observed manifest, part and result bytes",async()=>{
    const x=subject();
    const input={run_id:auditResult.run_id,job_id:"rjob_audit",worker_attempt_id:"rwrk_audit",lease_epoch:1,
      artifact_id:auditProof.artifact_id,artifact_revision:1,manifest_digest:auditProof.manifest_digest,result:auditResult};
    const part={relativePath:"tables/audit_equity/part-000001.parquet",partDigest:"a".repeat(64)};
    x.artifacts.expectation.mockResolvedValue({artifactId:input.artifact_id,state:"SEALED",
      expectedManifestDigest:input.manifest_digest,parts:[part]});
    const observed={artifact_id:input.artifact_id,manifest_state:"PRESENT",manifest_digest:input.manifest_digest,
      manifest_artifact_revision:1,parts:[{relative_path:part.relativePath,observed_digest:part.partDigest}],
      documents:[{relative_path:"documents/audit_result.json",recorded_digest:sha256ResearchJson(auditResult),observed_digest:sha256ResearchJson(auditResult)}]};
    for(const bad of [{...observed,artifact_id:"rart_other"},{...observed,manifest_state:"MISSING"},
      {...observed,manifest_digest:"0".repeat(64)},{...observed,manifest_artifact_revision:2},
      {...observed,parts:[]},{...observed,parts:[{...observed.parts[0],observed_digest:"0".repeat(64)}]},
      {...observed,documents:[]},{...observed,documents:[{...observed.documents[0],observed_digest:"0".repeat(64)}]}]){
      x.bytes.observe.mockResolvedValueOnce(bad);
      await expect(x.service.seal(scope,input)).rejects.toMatchObject({status:409});
    }
    expect(x.repository.sealProof).not.toHaveBeenCalled();
    x.bytes.observe.mockResolvedValueOnce(observed);
    await x.service.seal(scope,input);
    expect(x.repository.sealProof).toHaveBeenCalledExactlyOnceWith(scope,input);
  });
  it("proof reads are bounded, scoped and reject forged digests",async()=>{
    const {verified_at_utc_ms,...base}=auditProof;
    const client={query:vi.fn().mockResolvedValue({rows:[{wanted_run_id:auditResult.parent_run_id,...base,
      verified_at_utc_ms:String(verified_at_utc_ms),artifact_revision:"1"}]})};
    expect((await readPinnedAuditProofs(client as never,scope.workspaceId,[auditResult.parent_run_id])).get(auditResult.parent_run_id)).toEqual(auditProof);
    expect(client.query.mock.calls[0]![1]).toEqual([scope.workspaceId,[auditResult.parent_run_id],
      "p23.delta-pinned-final-audit.v1",PINNED_AUDIT_PROFILE_DIGEST,1]);
    client.query.mockResolvedValueOnce({rows:[{wanted_run_id:auditResult.parent_run_id,...auditProof,result_digest:"0".repeat(64)}]});
    await expect(readPinnedAuditProofs(client as never,scope.workspaceId,[auditResult.parent_run_id])).rejects.toThrow();
    await expect(readPinnedAuditProofs(client as never,scope.workspaceId,Array(4097).fill("x"))).rejects.toThrow();
  });
});

describe("Final audit controller Origin/CSRF and workspace boundary",()=>{
  function controller(){
    const service={read:vi.fn().mockResolvedValue({}),create:vi.fn().mockResolvedValue({})};
    const workspaces={isMember:vi.fn().mockResolvedValue(true)};
    const subject=new ResearchFinalAuditController(service as never,workspaces as never,{PORTAL_PUBLIC_ORIGIN:"http://127.0.0.1:8096"} as never);
    const csrf="synthetic-unit-csrf-at-least-thirty-two-bytes";
    const request={portalUser:user,portalWorkspaceId:scope.workspaceId,portalSession:{csrfSecretHash:sha256(csrf)},
      headers:{origin:"http://127.0.0.1:8096","x-portal-csrf":csrf},cookies:{"__Host-portal_csrf":csrf},id:"unit"};
    return{subject,service,workspaces,request};
  }
  it("rejects missing/wrong Origin or cookie/header/session CSRF before any writes",async()=>{
    const x=controller(),input={client_intent_id:"controller-unit-intent",target_digest:pinnedAuditTargetDigest(auditTarget)};
    for(const request of [{...x.request,headers:{...x.request.headers,origin:undefined}},
      {...x.request,headers:{...x.request.headers,origin:"https://wrong.example"}},
      {...x.request,headers:{...x.request.headers,"x-portal-csrf":"wrong"}},
      {...x.request,cookies:{}},{...x.request,portalSession:{csrfSecretHash:sha256("wrong")}}])
      await expect(x.subject.create(request as never,auditTarget.parent_run_id,{},input)).rejects.toMatchObject({status:403});
    expect(x.workspaces.isMember).not.toHaveBeenCalled();expect(x.service.create).not.toHaveBeenCalled();
    await x.subject.create(x.request as never,auditTarget.parent_run_id,{},input);
    expect(x.service.create).toHaveBeenCalledExactlyOnceWith(user,scope,auditTarget.parent_run_id,input,"unit");
  });
  it("returns invalid/not-found before invoking the private reader, without leaking workspace",async()=>{
    const x=controller();
    await expect(x.subject.read(x.request as never,"../bad",{})).rejects.toMatchObject({status:400});
    await expect(x.subject.read(x.request as never,auditTarget.parent_run_id,{url:"http://arbitrary"})).rejects.toMatchObject({status:400});
    x.workspaces.isMember.mockResolvedValueOnce(false);
    await expect(x.subject.read(x.request as never,auditTarget.parent_run_id,{workspace_id:"other"})).rejects.toMatchObject({status:404});
    expect(x.service.read).not.toHaveBeenCalled();
  });
});
