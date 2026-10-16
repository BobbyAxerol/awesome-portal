import "reflect-metadata";
import {describe,it,expect,vi} from "vitest";
import {ExecutionRetainedReviewController} from "../src/execution/retained-review.controller";
import {ExecutionProfileProjectionRepository} from "../src/execution/profile-projection.repository";
import {CommandCenterRepository} from "../src/command-center/command-center.repository";
import {coreExecutionRead} from "../src/execution/retained-read-profile";
import {SessionGuard} from "../src/facade/session.guard";
import {CanaryController} from "../src/canary/canary.controller";
import {HttpErrorFilter} from "../src/http-error.filter";
import {isReadStoreUnavailable} from "../src/db/read-unavailable";
import type {ExecutionReadRequest} from "../src/execution/local-read-authority";
import {testConfig} from "./harness";

function fixture(){
  const cfg=testConfig({AUTH_MODE:"dev",FEATURE_EXECUTION_LOCAL_PROJECTION:"true",
    EXECUTION_DATABASE_URL:"postgres://portal:portal@127.0.0.1:5432/udb04_domain",
    EXECUTION_READ_PROFILE:"retained_review_v1",EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID:"ws_scope",
    EXECUTION_EDGE_PAPER_PROFILE_ID:"PAPER_BINANCE_USDM",EXECUTION_EDGE_SANDBOX_PROFILE_ID:"SANDBOX_BINANCE_USDM",EXECUTION_EDGE_LIVE_PROFILE_ID:"LIVE_BINANCE_USDM"});
  const query=vi.fn().mockResolvedValue({rows:[]}),canReadExecution=vi.fn().mockResolvedValue(true),
    effectiveAccess=vi.fn().mockImplementation(async(id:string)=>({isOwner:id==="owner"}));
  const controller=new ExecutionRetainedReviewController(cfg,{query} as never,{canReadExecution} as never,{effectiveAccess} as never);
  const request=(id:string)=>({portalUser:{userId:id}} as ExecutionReadRequest);
  return {controller,query,canReadExecution,effectiveAccess,request,cfg};
}
describe("UDB04 retained context bounded cost without cached authority",()=>{
  it("twenty users share nine source queries, not180, and retain their own owner bit",async()=>{
    const f=fixture();const contexts=await Promise.all(Array.from({length:20},(_,i)=>
      f.controller.context(f.request(i===0?"owner":"viewer"+i),{})));
    expect(f.query).toHaveBeenCalledTimes(9);expect(f.canReadExecution).toHaveBeenCalledTimes(40);
    expect(f.effectiveAccess).toHaveBeenCalledTimes(20);
    expect(contexts[0].permissions.is_owner).toBe(true);expect(contexts.slice(1).every(c=>!c.permissions.is_owner)).toBe(true);
    expect(contexts.every(c=>!c.stream_enabled&&!c.mutation_enabled&&c.revocation.permission_cache_seconds===0
      &&c.revocation.data_view_cache_maximum_serialized_bytes===16777216)).toBe(true);
  });
  it("rechecks a revoke on a warm cache before exposing a source view",async()=>{
    const f=fixture();await f.controller.context(f.request("owner"),{});f.query.mockClear();
    f.canReadExecution.mockResolvedValue(false);
    await expect(f.controller.context(f.request("revoked"),{})).rejects.toMatchObject({code:"WORKSPACE_NOT_FOUND",status:404});
    expect(f.query).not.toHaveBeenCalled();
  });
  it("rechecks authority after a cold shared read resolves",async()=>{
    const f=fixture();f.canReadExecution.mockResolvedValueOnce(true).mockResolvedValue(false);
    await expect(f.controller.context(f.request("revoked-in-flight"),{})).rejects.toMatchObject({code:"WORKSPACE_NOT_FOUND",status:404});
    expect(f.effectiveAccess).not.toHaveBeenCalled();
  });
  it("does not cache an outage and permits the recovered next request",async()=>{
    const f=fixture();f.query.mockRejectedValueOnce(Object.assign(new Error("TEST_OUTAGE"),{code:"08006"}));
    await expect(f.controller.context(f.request("viewer"),{})).rejects.toMatchObject({code:"08006"});
    f.query.mockClear();expect((await f.controller.context(f.request("viewer"),{})).profiles).toHaveLength(3);
    expect(f.query).toHaveBeenCalledTimes(9);
  });
  it("expires source metadata at2s, retaining original missing-source clocks",async()=>{
    const f=fixture();const before=await f.controller.context(f.request("viewer"),{});f.query.mockClear();
    const clock=vi.spyOn(Date,"now").mockReturnValue(Date.now()+2001);
    try{const after=await f.controller.context(f.request("viewer"),{});expect(f.query).toHaveBeenCalledTimes(9);
      expect(after.profiles).toEqual(before.profiles);expect(after.profiles.every(p=>p.source_as_of_ms===null)).toBe(true);
    }finally{clock.mockRestore();}
  });
  it("retains measured-sized Paper views within16MiB, not a17MiB document",async()=>{
    for(const [size,cached] of [[7,true],[9,true],[15,true],[17,false]] as const){
      const row={payload:{relations:{},test_padding:"x".repeat(size*1024*1024)},
        source_epoch:"e",source_cursor:"c",source_as_of:null,received_at:new Date(),
        last_successful_refresh_at:new Date(),completeness:"PARTIAL",projection_epoch:"e",
        projection_sequence:"1",payload_digest:"sha256:"+"0".repeat(64),source_catalogue_sha256:null};
      const query=vi.fn().mockImplementation(async(sql:string)=>({rows:sql.includes("SELECT payload")?[row]:sql.includes("retained_revision")?[{retained_revision:"r1"}]:[]}));
      const repository=new ExecutionProfileProjectionRepository({query} as never,undefined,fixture().cfg);
      const first=await repository.snapshot("ws_scope","paper","PAPER_BINANCE_USDM");query.mockClear();
      const second=await repository.snapshot("ws_scope","paper","PAPER_BINANCE_USDM");
      expect(second===first).toBe(cached);expect(query).toHaveBeenCalledTimes(cached?0:4);
    }
  });
  it("admits the exact serialized16MiB boundary but not one byte more",async()=>{
    let row={payload:{relations:{},test_padding:""},source_epoch:"e",source_cursor:"c",source_as_of:null,
      received_at:new Date(),last_successful_refresh_at:new Date(),completeness:"PARTIAL",projection_epoch:"e",
      projection_sequence:"1",payload_digest:"sha256:"+"0".repeat(64),source_catalogue_sha256:null};
    const query=vi.fn().mockImplementation(async(sql:string)=>({rows:sql.includes("SELECT payload")?[row]:sql.includes("retained_revision")?[{retained_revision:"r1"}]:[]}));
    const repository=()=>new ExecutionProfileProjectionRepository({query} as never,undefined,fixture().cfg);
    const overhead=Buffer.byteLength(JSON.stringify(await repository().snapshot("ws_scope","paper","PAPER_BINANCE_USDM")));
    for(const extra of [0,1]){
      row={...row,payload:{relations:{},test_padding:"x".repeat(16777216-overhead+extra)}};
      const repo=repository(),first=await repo.snapshot("ws_scope","paper","PAPER_BINANCE_USDM");query.mockClear();
      expect(Buffer.byteLength(JSON.stringify(first))).toBe(16777216+extra);
      expect(await repo.snapshot("ws_scope","paper","PAPER_BINANCE_USDM")===first).toBe(extra===0);
      expect(query).toHaveBeenCalledTimes(extra===0?0:4);
    }
  });
  it("bounds all cached profiles together at16MiB rather than allowing three16MiB entries",async()=>{
    const row={payload:{relations:{},test_padding:"x".repeat(9*1024*1024)},
      source_epoch:"e",source_cursor:"c",source_as_of:null,received_at:new Date(),
      last_successful_refresh_at:new Date(),completeness:"PARTIAL",projection_epoch:"e",
      projection_sequence:"1",payload_digest:"sha256:"+"0".repeat(64),source_catalogue_sha256:null};
    const query=vi.fn().mockImplementation(async(sql:string)=>({rows:sql.includes("SELECT payload")?[row]:sql.includes("retained_revision")?[{retained_revision:"r1"}]:[]}));
    const repository=new ExecutionProfileProjectionRepository({query} as never,undefined,fixture().cfg);
    const paper=await repository.snapshot("ws_scope","paper","PAPER_BINANCE_USDM");
    const sandbox=await repository.snapshot("ws_scope","sandbox","SANDBOX_BINANCE_USDM");query.mockClear();
    expect(await repository.snapshot("ws_scope","sandbox","SANDBOX_BINANCE_USDM")).toBe(sandbox);
    expect(query).not.toHaveBeenCalled();
    expect(await repository.snapshot("ws_scope","paper","PAPER_BINANCE_USDM")).not.toBe(paper);
    expect(query).toHaveBeenCalledTimes(4);
  });
  it("DB outage after data TTL refuses even an unchanged view; recovery validates without loading its bytes",async()=>{
    const f=fixture(),row={payload:{relations:{}},source_epoch:"e",source_cursor:"c",source_as_of:null,
      received_at:new Date(),last_successful_refresh_at:new Date(),completeness:"PARTIAL",projection_epoch:"e",
      projection_sequence:"1",payload_digest:"sha256:"+"0".repeat(64),source_catalogue_sha256:null};
    let failed=false;const query=vi.fn().mockImplementation(async(sql:string)=>{
      if(failed)throw new Error("DB_OFFLINE");
      return {rows:sql.includes("SELECT payload")?[row]:sql.includes("retained_revision")?[{retained_revision:"r1"}]:[]};});
    const repo=new ExecutionProfileProjectionRepository({query} as never,undefined,f.cfg);
    const first=await repo.snapshot("ws_scope","paper","PAPER_BINANCE_USDM"),now=Date.now();
    const clock=vi.spyOn(Date,"now").mockReturnValue(now+2001);
    try{failed=true;await expect(repo.snapshot("ws_scope","paper","PAPER_BINANCE_USDM")).rejects.toThrow("DB_OFFLINE");
      failed=false;query.mockClear();expect(await repo.snapshot("ws_scope","paper","PAPER_BINANCE_USDM")).toBe(first);
      expect(query).toHaveBeenCalledTimes(1);expect(first?.sourceAsOf).toBeNull();
    }finally{clock.mockRestore();}
  });
  it("never holds a Core transaction while waiting for domain reads or nested authorization",async()=>{
    const f=fixture(),query=vi.fn().mockResolvedValue({rows:[]}),connect=vi.fn().mockResolvedValue({query,release:vi.fn()});
    let finish!:()=>void;const wait=new Promise<null>(r=>{finish=()=>r(null);});
    const snapshot=vi.fn().mockReturnValue(wait),access=vi.fn().mockResolvedValueOnce(true).mockResolvedValue(false);
    const repository=new CommandCenterRepository({connect} as never,f.cfg,{query} as never,
      {snapshot} as never,{canReadExecution:access} as never,{effectiveAccess:async()=>({isOwner:false,capabilities:[],scopes:{}})} as never);
    const result=repository.read("ws_personal",{userId:"viewer",role:"USER"} as never,new Date());
    await Promise.resolve();await Promise.resolve();expect(snapshot).toHaveBeenCalledTimes(3);expect(connect).not.toHaveBeenCalled();
    finish();const read=await result;expect(access).toHaveBeenCalledTimes(2);expect(connect).toHaveBeenCalledOnce();
    expect(read.fleet.status.reason).toBe("WORKSPACE_NOT_FOUND");
  });
  it("keeps exact Canary/Live envelopes in Core but not generic deployment/source routes",()=>{
    for(const gate of ["canary","live"])expect(coreExecutionRead(`/api/v1/execution/deployments/dep/${gate}`)).toBe(true);
    for(const path of ["/api/v1/execution/deployments/dep","/api/v1/execution/profiles/live", "/api/v1/execution/deployments/dep/live/anything"])
      expect(coreExecutionRead(path)).toBe(false);
  });
  it("resolves the Canary Core workspace independently of retained source access",async()=>{
    const f=fixture(),isMember=vi.fn().mockResolvedValue(true),canReadExecution=vi.fn().mockResolvedValue(false);
    const detail=vi.fn().mockResolvedValue({schema_version:"canary.core"});
    const c=new CanaryController({detail} as never,{isMember,canReadExecution} as never,f.cfg);
    await c.detail({portalUser:{userId:"viewer"},portalWorkspaceId:"ws_personal",portalSession:{}} as never,"dep","ws_research");
    expect(isMember).toHaveBeenCalledWith("ws_research","viewer");expect(canReadExecution).not.toHaveBeenCalled();
    expect(detail).toHaveBeenCalledWith({userId:"viewer"},{},"ws_research","dep","ws_personal");
  });
  it("refuses a Core identity outage with a sanitized typed503 rather than cached authority",async()=>{
    for(const code of ["ECONNREFUSED","EAI_AGAIN"]){
      const guard=new SessionGuard({sessionFromToken:async()=>{throw Object.assign(new Error("SECRET_DSN"),{code});}} as never,{} as never);
      const context={switchToHttp:()=>({getRequest:()=>({cookies:{"__Host-portal_session":"token"}})})};
      await expect(guard.canActivate(context as never)).rejects.toMatchObject({code:"PORTAL_AUTHORITY_UNAVAILABLE",status:503});
    }
  });
  it("refuses a disconnected data store on GET as503 without logging/publishing its private cause",()=>{
    const reply={header:vi.fn().mockReturnThis(),status:vi.fn().mockReturnThis(),send:vi.fn()};
    const host={switchToHttp:()=>({getResponse:()=>reply,getRequest:()=>({method:"GET",headers:{"x-request-id":"udb04-test"}})})};
    new HttpErrorFilter().catch(Object.assign(new Error("SECRET_DSN"),{code:"ECONNREFUSED"}),host as never);
    expect(reply.status).toHaveBeenCalledWith(503);expect(reply.send).toHaveBeenCalledWith({
      error:{code:"PORTAL_READ_STORE_UNAVAILABLE",message:"Portal read store is temporarily unavailable."},request_id:"udb04-test"});
    expect(isReadStoreUnavailable(Object.assign(new Error("bad SQL"),{code:"42703"}))).toBe(false);
    expect(isReadStoreUnavailable(new Error("arbitrary private text"))).toBe(false);
    expect(isReadStoreUnavailable(Object.assign(new Error("private DNS host"),{code:"EAI_AGAIN"}))).toBe(true);
    for(const message of ["Connection terminated due to connection timeout", "timeout exceeded when trying to connect",
      "Client has encountered a connection error and is not queryable"])
      expect(isReadStoreUnavailable(new Error(message))).toBe(true);
    expect(isReadStoreUnavailable(new Error("Query read timeout"))).toBe(false);
  });
});
