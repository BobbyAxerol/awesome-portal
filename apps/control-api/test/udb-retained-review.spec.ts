import "reflect-metadata";
import {afterAll,beforeAll,describe,it,expect,vi} from "vitest";
import {Pool} from "pg";
import {randomUUID} from "node:crypto";
import {runControlApiMigrations} from "../src/cli/migrate";
import {migrateExecutionStore} from "../src/execution/store-schema";
import {provisionRetainedWorkspace} from "../src/execution/retained-workspace";
import {provisionRetainedReviewAccess} from "../src/execution/retained-review-access";
import {WorkspacesRepository} from "../src/repos/workspaces";
import {ExecutionProfileProjectionRepository} from "../src/execution/profile-projection.repository";
import {ExecutionDurableFinancialRepository} from "../src/execution/durable-financial.repository";
import {ExecutionDurableMirrorRepository} from "../src/execution/durable-mirror.repository";
import {ExecutionProfileProjectionWorker} from "../src/execution/profile-projection.worker";
import {AuthService} from "../src/auth/auth.service";
import {createControlApiApp} from "../src/app";
import {testConfig} from "./harness";
import {retainedOperationPage} from "../src/execution/retained-operation-page";
import {managerRelationOperationByRoute} from "../src/execution/eds11r-manager-relation.registry";

describe("UDB03 retained reader and Core-only read delegation",()=>{
  const base=process.env.TEST_DATABASE_URL??"postgres://portal:portal@127.0.0.1:5432/portal_control_test";
  const coreName="udb03_core_"+randomUUID().replaceAll("-","");
  const domainName="udb03_domain_"+randomUUID().replaceAll("-","");
  const url=(name:string)=>{const u=new URL(base);u.pathname="/"+name;return u.toString();};
  const ws="ws_udb03",profile="PAPER_BINANCE_USDM",key="manager.accounts:accounts";
  const batch="11111111-1111-4111-8111-111111111111",revision="22222222-2222-4222-8222-222222222222";
  const epoch="33333333-3333-4333-8333-333333333333",digest="sha256:"+"0".repeat(64);
  const cfg=()=>testConfig({AUTH_MODE:"dev",DATABASE_URL:url(coreName),EXECUTION_DATABASE_URL:url(domainName),
    EXECUTION_READ_PROFILE:"retained_review_v1",FEATURE_EXECUTION_LOCAL_PROJECTION:"true",EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID:ws,
    EXECUTION_EDGE_PAPER_PROFILE_ID:profile,EXECUTION_EDGE_SANDBOX_PROFILE_ID:"SANDBOX_BINANCE_USDM",EXECUTION_EDGE_LIVE_PROFILE_ID:"LIVE_BINANCE_USDM",
    PREVIEW_AUTO_LOGIN_USERNAME:"reviewer",FEATURE_EXECUTION_COMMAND_CENTER_SNAPSHOT:"true"});
  let core:Pool,domain:Pool;
  beforeAll(async()=>{
    const admin=new Pool({connectionString:url("postgres")});
    try{await admin.query(`CREATE DATABASE ${coreName}`);await admin.query(`CREATE DATABASE ${domainName}`);}finally{await admin.end();}
    core=new Pool({connectionString:url(coreName),max:2});domain=new Pool({connectionString:url(domainName),max:2});
    await runControlApiMigrations(url(coreName),undefined,()=>{});await migrateExecutionStore(domain);
    await core.query(`INSERT INTO portal_users(user_id,username,display_name,role,status,must_change_password) VALUES
      ('usr_owner','owner','Owner','ADMIN','ACTIVE',false),('usr_review','reviewer','Viewer','ADMIN','ACTIVE',false);
      INSERT INTO portal_owner_anchor(anchor_id,user_id) VALUES('PORTAL_OWNER','usr_owner')`);
    await provisionRetainedWorkspace(core,cfg(),ws);
    const payload={schema_version:"portal.execution.profile-projection.v1",workspace_id:ws,environment:"paper",profile_id:profile,
      source_contract_revision:"observed-test",relations:{[key]:{source_id:"manager.accounts",relation:"accounts",availability:"UNAVAILABLE",
        reason_code:"MANAGER_V2_SOURCE_CONTRACT_REJECTED",as_of:null,freshness:"UNKNOWN",completeness:"PARTIAL",items:[]}}};
    await domain.query(`INSERT INTO execution_profile_projection_snapshots(workspace_id,environment,profile_id,source_epoch,source_cursor,
      source_contract_revision,source_as_of,received_at,last_successful_refresh_at,completeness,projection_epoch,projection_sequence,payload_digest,payload)
      VALUES($1,'paper',$2,'observed','opaque','observed-test',NULL,'2026-09-01','2026-09-01','PARTIAL',$3,1,$4,$5)`,[ws,profile,epoch,digest,JSON.stringify(payload)]);
    await domain.query(`INSERT INTO execution_durable_mirror_batches(batch_id,workspace_id,environment,profile_id,source_contract_revision,
      source_epoch,source_cursor_digest,received_at,completeness,projection_epoch,projection_sequence,payload_digest,read_model_revision,
      relation_count,state,committed_at) VALUES($1,$2,'paper',$3,'observed','observed',$4,'2026-09-01','PARTIAL',$5,1,$4,$6,1,'COMMITTED','2026-09-01')`,[batch,ws,profile,digest,epoch,revision]);
    await domain.query(`INSERT INTO execution_durable_mirror_revisions(read_model_revision,batch_id,workspace_id,environment,profile_id,
      projection_epoch,projection_sequence,payload_digest,state,is_current) VALUES($1,$2,$3,'paper',$4,$5,1,$6,'COMMITTED',true)`,[revision,batch,ws,profile,epoch,digest]);
    await domain.query(`INSERT INTO execution_durable_mirror_current_entities(workspace_id,environment,profile_id,relation_key,entity_key,
      account_id,source_row_digest,fields,first_observed_batch_id,last_observed_batch_id,last_read_model_revision,first_observed_at,last_observed_at)
      VALUES($1,'paper',$2,$3,'acct','acct',$4,'{"account_id":"acct","venue":"BINANCE","secret":"MUST_NOT_LEAVE"}',$5,$5,$6,'2026-09-01','2026-09-01')`,[ws,profile,key,digest,batch,revision]);
    await domain.query(`INSERT INTO execution_timeseries_history(workspace_id,environment,profile_id,relation_key,row_id,ts,fields,first_seen_at)
      VALUES($1,'paper',$2,'manager.performance:account_equity_snapshots','eq1','2026-09-01T00:00:00.123Z',
      '{"account_id":"acct","equity":"1234567890.1234567890123456789","currency":"USDT"}','2026-09-01')`,[ws,profile]);
  },90_000);
  afterAll(async()=>{
    await Promise.all([core?.end(),domain?.end()]);const admin=new Pool({connectionString:url("postgres")});
    try{await admin.query(`DROP DATABASE IF EXISTS ${coreName} WITH (FORCE)`);await admin.query(`DROP DATABASE IF EXISTS ${domainName} WITH (FORCE)`);}finally{await admin.end();}
  });
  it("retained view preserves source refusal and clock, strips private fields and isolates profiles",async()=>{
    const repo=new ExecutionProfileProjectionRepository(domain,undefined,cfg());
    const before=(await domain.query("SELECT payload::text,payload_digest,source_as_of FROM execution_profile_projection_snapshots")).rows;
    const view=await repo.snapshot(ws,"paper",profile);
    expect(view?.document.relations[key]).toMatchObject({availability:"AVAILABLE",freshness:"STALE",completeness:"PARTIAL",
      reason_code:"UDB_RETAINED_OBSERVATION_NOT_CURRENT_SOURCE",as_of:null});
    expect(view?.document.relations[key].items[0].fields).not.toHaveProperty("secret");
    expect(view?.sourceAsOf).toBeNull();expect(view?.payloadDigest).not.toBe(digest);
    expect(await repo.snapshot(ws,"live","LIVE_BINANCE_USDM")).toBeNull();
    expect(await repo.snapshot("ws_wrong","paper",profile)).toBeNull();
    const tx=await domain.connect();try{expect((await repo.snapshot(ws,"paper",profile,tx))?.document.relations[key].availability).toBe("UNAVAILABLE");}finally{tx.release();}
    expect((await domain.query("SELECT payload::text,payload_digest,source_as_of FROM execution_profile_projection_snapshots")).rows).toEqual(before);
  });
  it("legacy financial reader exposes exact retained history while mirror remains off",async()=>{
    const input={workspaceId:ws,environment:"paper" as const,profileId:profile,relationKey:"manager.performance:account_equity_snapshots",
      valueField:"equity",subject:{kind:"account" as const,id:"acct"},fromMs:null,toMs:null,targetPoints:512};
    const result=await new ExecutionDurableFinancialRepository(domain,cfg()).series(input);
    expect(result.state).toBe("PARTIAL");expect(result.observation).toMatchObject({freshness:"STALE",completeness:"PARTIAL",asOf:null});
    expect(result.points[0].value).toBe("1234567890.1234567890123456789");expect(result.points[0].at.toISOString()).toBe("2026-09-01T00:00:00.123Z");
    expect((await domain.query("SELECT count(*)::int AS n FROM execution_durable_mirror_range_rows")).rows[0].n).toBe(0);
    expect((await new ExecutionDurableFinancialRepository(domain).series(input)).state).toBe("UNAVAILABLE");
  });
  it("retained data coalesces rich-panel mounts for 2 seconds, never caching access or transaction capture",async()=>{
    const repository=new ExecutionProfileProjectionRepository(domain,undefined,cfg());
    const first=await repository.snapshot(ws,"paper",profile);
    const query=vi.spyOn(domain,"query");query.mockClear();
    try{
      expect(await repository.snapshot(ws,"paper",profile)).toBe(first);expect(query).not.toHaveBeenCalled();
      const now=Date.now();const clock=vi.spyOn(Date,"now").mockReturnValue(now+2001);
      try{expect(await repository.snapshot(ws,"paper",profile)).toBe(first);expect(query).toHaveBeenCalledTimes(1);
        await domain.query("UPDATE execution_durable_mirror_current_entities SET source_row_digest=$1 WHERE workspace_id=$2",["sha256:"+"9".repeat(64),ws]);
        query.mockClear();clock.mockReturnValue(now+4002);
        expect(await repository.snapshot(ws,"paper",profile)).not.toBe(first);expect(query).toHaveBeenCalledTimes(4);
      }finally{clock.mockRestore();}
      const tx=await domain.connect();try{expect((await repository.snapshot(ws,"paper",profile,tx))?.document.relations[key].availability).toBe("UNAVAILABLE");}finally{tx.release();}
    }finally{query.mockRestore();}
  });
  it("read authority is owner anchor or existing membership or audited TTL grant, not ADMIN",async()=>{
    const access=new WorkspacesRepository(core,cfg());
    expect(await access.canReadExecution(ws,"usr_owner")).toBe(true);expect(await access.canReadExecution(ws,"usr_review")).toBe(false);
    expect((await provisionRetainedReviewAccess(core,cfg(),"reviewer")).changed).toBe(true);
    expect((await provisionRetainedReviewAccess(core,cfg(),"reviewer")).changed).toBe(false);
    expect(await access.canReadExecution(ws,"usr_review","paper")).toBe(true);
    expect(await access.isMember(ws,"usr_review")).toBe(false);
    expect(await access.canReadExecution("ws_wrong","usr_review")).toBe(false);
    expect(await access.canReadExecution(ws,"usr_review","WRONG")).toBe(false);
    await core.query("UPDATE portal_users SET status='DISABLED' WHERE user_id='usr_review'");
    expect(await access.canReadExecution(ws,"usr_review")).toBe(false);
    await core.query("UPDATE portal_users SET status='ACTIVE' WHERE user_id='usr_review'");
  });
  it("retained order history has exact scoped coverage and keyset pagination without a mirror writer",async()=>{
    await domain.query(`INSERT INTO execution_timeseries_history(workspace_id,environment,profile_id,relation_key,row_id,ts,fields)
      VALUES($1,'paper',$2,'manager.orders:orders','o1','2026-09-01','{"account_id":"acct","order_id":"o1"}'),
      ($1,'paper',$2,'manager.orders:orders','o2','2026-09-02','{"account_id":"acct","order_id":"o2"}'),
      ($1,'paper',$2,'manager.orders:orders','o_other','2026-09-02','{"account_id":"other","order_id":"o_other"}')`,[ws,profile]);
    const mirror=new ExecutionDurableMirrorRepository(cfg(),domain),scope={workspaceId:ws,environment:"paper" as const,profileId:profile};
    const entity={field:"account_id",value:"acct"};
    expect((await mirror.subjectCoverage(scope,"manager.orders:orders",entity)).rowCount).toBe(2);
    const first=await mirror.subjectRows(scope,"manager.orders:orders",{entity,limit:1});expect(first.rows[0].rowId).toBe("o2");expect(first.hasMore).toBe(true);
    const next=await mirror.subjectRows(scope,"manager.orders:orders",{entity,limit:1,after:{ts:first.rows[0].ts,rowId:first.rows[0].rowId}});
    expect(next.rows[0].rowId).toBe("o1");expect(next.hasMore).toBe(false);
    expect((await mirror.subjectCoverage({...scope,environment:"live",profileId:"LIVE_BINANCE_USDM"},"manager.orders:orders",entity)).rowCount).toBe(0);
    const range=await mirror.rangePage({...scope,relationKey:"manager.performance:account_equity_snapshots",resource:{kind:"account",id:"acct"},limit:1});
    expect(range.state).toBe("PARTIAL");expect(range.rows).toHaveLength(1);expect(range.observation?.freshness).toBe("STALE");
  });
  it("actual HTTP guards preserve Core workspace and reject mutations, streams and revoked sessions",async()=>{
    const app=await createControlApiApp(cfg(),core,domain);const server=app.getHttpAdapter().getInstance();
    const auth=app.get(AuthService);let session=await auth.previewAutoSession();expect(session).not.toBeNull();
    const headers={cookie:`__Host-portal_session=${session!.token}`};
    const get=(path:string)=>server.inject({method:"GET",url:path,headers});
    try{
      const response=await get("/api/v1/execution/retained-review");expect(response.statusCode).toBe(200);
      expect(response.headers["cache-control"]).toContain("no-store");
      const context=response.json();expect(context.permissions).toMatchObject({read:true,query:true,manage:false,command:false,stream:false,research_create:false,governance_decide:false,is_owner:false});
      expect(context.profiles.flatMap((p:any)=>p.panels).some((p:any)=>p.source_reason_code==="MANAGER_V2_SOURCE_CONTRACT_REJECTED"&&p.current_row_count===1)).toBe(true);
      expect((await get("/api/v1/execution/retained-review?workspace_id=wrong")).statusCode).toBe(404);
      expect((await get("/api/v1/execution/retained-review?profile_id=WRONG")).statusCode).toBe(400);
      expect((await get("/api/v1/execution/profiles/paper/stream")).statusCode).toBe(404);
      const realtime=await get("/api/v1/execution/profiles/paper/realtime-snapshot");
      expect(realtime.statusCode).toBe(204);expect(realtime.body).toBe("");
      expect(realtime.headers["x-portal-realtime-state"]).toBe("UDB_RETAINED_STREAM_DISABLED");
      for(const path of ["screen-contracts","activation/capabilities","commands/catalog","commands/tasks"]){
        expect((await get("/api/v1/execution/"+path)).statusCode).toBe(200);
      }
      const named=await get("/api/v1/execution/manager/current/accounts?environment=paper");
      expect(named.statusCode).toBe(200);expect(named.json().records[0].values.account_id).toBe("acct");
      expect(named.headers["cache-control"]).toBe("private, no-store");
      expect(named.json().source_health.availability).toBe("UNAVAILABLE");
      const absent=await get("/api/v1/execution/manager/current/order-brackets?environment=paper");
      expect(absent.statusCode).toBe(200);expect(absent.json()).toMatchObject({state:"UNAVAILABLE",reason_code:"UDB_RETAINED_PANEL_NOT_CAPTURED",records:[]});
      expect((await get("/api/v1/execution/manager/current/invalid-operation?environment=paper")).statusCode).toBe(404);
      expect((await get("/api/v1/execution/manager/current/accounts?environment=paper&relation=secrets")).statusCode).toBe(400);
      expect((await get("/api/v1/execution/durable-mirror/integrity")).statusCode).toBe(200);
      const busy=vi.spyOn(app.get(ExecutionDurableFinancialRepository),"series")
        .mockRejectedValueOnce(Object.assign(new Error("EXECUTION_POOL_BUSY"),{code:"EXECUTION_POOL_BUSY"}));
      try{
        const response=await get("/api/v1/execution/views/equity-chart?environment=paper&subject_kind=account&subject_id=acct&viewport_px=600");
        expect(response.statusCode).toBe(503);expect(response.headers["retry-after"]).toBe("1");
        expect(response.json().error.code).toBe("EXECUTION_LOCAL_READ_BUSY");
      }finally{busy.mockRestore();}
      const projectionQueries=vi.spyOn(domain,"query");
      const center=await get("/api/v1/execution/command-center");expect(center.statusCode).toBe(200);
      expect(projectionQueries.mock.calls.some(([q])=>typeof q==="string"&&/SELECT environment, profile_id, source_cursor/.test(q))).toBe(false);
      projectionQueries.mockRestore();
      expect(center.json().workspace_id).not.toBe(ws);
      await core.query("UPDATE execution_retained_review_access SET created_at=now()-interval '1 day',expires_at=now()-interval '1 hour' WHERE user_id='usr_review'");
      expect((await get("/api/v1/execution/retained-review")).statusCode).toBe(404);
      await core.query("UPDATE execution_retained_review_access SET expires_at=created_at+interval '30 days' WHERE user_id='usr_review'");
      await core.query("UPDATE portal_users SET status='DISABLED' WHERE user_id='usr_review'");
      expect((await get("/api/v1/execution/retained-review")).statusCode).toBe(401);
      await core.query("UPDATE portal_users SET status='ACTIVE' WHERE user_id='usr_review'");
      // Enabling an account never resurrects a session revoked while disabled.
      // Continue the retained-access checks with a fresh authenticated session.
      expect((await get("/api/v1/execution/retained-review")).statusCode).toBe(401);
      session=await auth.previewAutoSession();expect(session).not.toBeNull();
      headers.cookie=`__Host-portal_session=${session!.token}`;
      expect((await server.inject({method:"POST",url:"/api/v1/execution/governance/approvals",headers,payload:{}})).statusCode).toBe(403);
      expect((await get(`/api/v1/execution/governance/approvals/not_real/r1?workspace_id=${ws}`)).statusCode).toBe(404);
      expect((await get("/api/v1/quantbt/runs?limit=10")).statusCode).not.toBe(401);
      await provisionRetainedReviewAccess(core,cfg(),"reviewer",true);
      expect((await get("/api/v1/execution/retained-review")).statusCode).toBe(404);
      expect((await get("/api/v1/execution/manager/current/accounts?environment=paper")).statusCode).toBe(404);
      const deniedCenter=await get("/api/v1/execution/command-center");expect(deniedCenter.statusCode).toBe(200);
      expect(deniedCenter.body).toContain("WORKSPACE_NOT_FOUND");
      await expect(provisionRetainedReviewAccess(core,cfg(),"reviewer")).rejects.toThrow("UDB03_REVIEW_REISSUE_REQUIRES_NEW_APPROVAL");
      await auth.logout(session!.token);expect((await get("/api/v1/execution/retained-review")).statusCode).toBe(401);
    }finally{await auth.logout(session!.token);await app.close();}
  });
  it("named operation cursor is read-only and bound to actor/profile/operation/revision/page size",async()=>{
    const repository=new ExecutionProfileProjectionRepository(domain,undefined,cfg());
    const actual=(await repository.snapshot(ws,"paper",profile))!;
    const snapshot={...actual,document:{...actual.document,relations:{...actual.document.relations,
      [key]:{...actual.document.relations[key],items:[{fields:{account_id:"a"}},{fields:{account_id:"b"}}] as any}}}};
    const fake={snapshot:vi.fn().mockResolvedValue(snapshot)} as unknown as ExecutionProfileProjectionRepository;
    const actor={workspaceId:ws,user:{userId:"usr_owner",role:"ADMIN"},session:{}} as any;
    const op=managerRelationOperationByRoute("accounts")!;
    const first=await retainedOperationPage(cfg(),fake,actor,op,{environment:"paper",limit:1});
    expect(first.page.next_cursor!.length).toBeLessThanOrEqual(128);
    const cursor=first.page.next_cursor!;
    const second=await retainedOperationPage(cfg(),fake,actor,op,{environment:"paper",limit:1,cursor});
    expect(second.records[0].resource_id).not.toBe(first.records[0].resource_id);expect(second.page.has_more).toBe(false);
    for(const [principal,query,operation] of [[{...actor,user:{...actor.user,userId:"other"}},{environment:"paper",limit:1},op],
      [actor,{environment:"live",limit:1},op],[actor,{environment:"paper",limit:2},op],
      [actor,{environment:"paper",limit:1},managerRelationOperationByRoute("orders")!]] as const){
      await expect(retainedOperationPage(cfg(),fake,principal,operation,{...query,cursor} as any)).rejects.toThrow("UDB_RETAINED_CURSOR_INVALID_OR_STALE");
    }
    fake.snapshot=vi.fn().mockResolvedValue({...snapshot,payloadDigest:"different"});
    await expect(retainedOperationPage(cfg(),fake,actor,op,{environment:"paper",limit:1,cursor})).rejects.toThrow("UDB_RETAINED_CURSOR_INVALID_OR_STALE");
  });
  it("retained flags forbid production, upstream/market/commands; worker stays idle",async()=>{
    for(const flag of ["FEATURE_EXECUTION_EDGE","FEATURE_EXECUTION_REALTIME_SSE","FEATURE_EXECUTION_DURABLE_MIRROR_READS","FEATURE_EXECUTION_CURRENT_SOURCE_PAPER","FEATURE_EXECUTION_MARKET_CONTEXT","FEATURE_EXECUTION_LOCAL_R0_TASKS"]){
      expect(()=>testConfig({...cfg(),[flag]:"true"} as any)).toThrow();
    }
    expect(()=>testConfig({...cfg(),PORTAL_ENV:"prod"} as any)).toThrow();
    const repo=new ExecutionProfileProjectionRepository(domain,undefined,cfg());const spy=vi.spyOn(repo,"snapshot");
    const source={read:vi.fn()};const worker=new ExecutionProfileProjectionWorker(cfg(),source as any,repo);
    worker.onApplicationBootstrap();await worker.onApplicationShutdown();expect(spy).not.toHaveBeenCalled();expect(source.read).not.toHaveBeenCalled();
  });
});
