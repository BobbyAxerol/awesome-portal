/** Real disposable PG + mounted HTTP. Synthetic TEST_ONLY source, not TS/Edge
 * authority, business rows, mTLS/signature or live activation evidence. */
import {Module} from "@nestjs/common";
import {NestFactory} from "@nestjs/core";
import {FastifyAdapter,NestFastifyApplication} from "@nestjs/platform-fastify";
import cookiePlugin from "@fastify/cookie";
import {afterAll,beforeAll,describe,expect,it,vi} from "vitest";
import {randomUUID} from "node:crypto";
import {AuthService} from "../src/auth/auth.service";
import {AdminService} from "../src/admin/admin.service";
import {CSRF_COOKIE,SESSION_COOKIE} from "../src/auth/cookies";
import {HttpErrorFilter} from "../src/http-error.filter";
import {SessionGuard} from "../src/facade/session.guard";
import {WorkspacesRepository} from "../src/repos/workspaces";
import {OwnerAccessRepository} from "../src/repos/owner-access";
import {AccountLifecycleRepository} from "../src/repos/account-lifecycle";
import {CONTROL_API_CONFIG} from "../src/tokens";
import {AccessRepository} from "../src/execution-v2/access.repository";
import {ExecutionAccessService} from "../src/execution-v2/access.service";
import type {AccessTrustProvider} from "../src/execution-v2/access-trust";
import type {AccessActor,ReviewedAccessPolicy,ScopedAccessGrant} from "../src/execution-v2/access.contract";
import {accessDigest} from "../src/execution-v2/access-policy";
import {ExecutionCommandController} from "../src/execution-v2/command.controller";
import {ExecutionCommandService,intentHash,previewHash} from "../src/execution-v2/command.service";
import type {CommandIntent} from "../src/execution-v2/command.contract";
import {commandAuthorization,type CommandAuthorization,type CommandTrust,type SourceCommandResult} from "../src/execution-v2/command-trust";
import {CommandStore} from "../src/execution-v2/command.store";
import {migrateTestDatabase,setupApp,teardownApp} from "./harness";

const next=()=>`TEST_ONLY:${randomUUID()}`;
@Module({}) class CommandTestModule{}
describe.skipIf(!process.env.TEST_DATABASE_URL)("ELP2-07 real PostgreSQL transport ledger (TEST_ONLY source)",()=>{
  let ctx:Awaited<ReturnType<typeof setupApp>>,auth:AuthService;
  let user:NonNullable<Awaited<ReturnType<AuthService["users"]["findById"]>>>,session:Awaited<ReturnType<AuthService["login"]>>;
  let actor:AccessActor;
  beforeAll(async()=>{
    await migrateTestDatabase(process.env.TEST_DATABASE_URL!);ctx=await setupApp({DATABASE_URL:process.env.TEST_DATABASE_URL!});auth=ctx.app.get(AuthService);
    vi.spyOn(auth,"verifyAccessIdentity").mockImplementation(async assertion=>({iss:"https://test-only.cloudflareaccess.com",sub:`TEST_ONLY:${assertion}`,aud:"test-audience",
      email:`${assertion}@azdag.com`,normalizedEmail:`${assertion}@azdag.com`,authenticationTime:new Date(),tokenExpiresAt:new Date(Date.now()+60000)}));
    const admin=new AdminService(ctx.pool,ctx.config,auth),name=`elp207-${randomUUID()}`;
    const made=await admin.createUser({username:name,displayName:name,role:"USER"}),activation=await admin.resetCredential(made.userId);
    const initial=await auth.login({assertion:name,username:name,credential:activation.activationToken});
    const password="TEST-only-ELP207-correct-horse-battery-2026";
    await auth.changePassword({sessionToken:initial.token,csrfToken:initial.csrfToken,currentPassword:activation.activationToken,newPassword:password});
    session=await auth.login({assertion:name,username:name,credential:password});user=(await auth.users.findById(made.userId))!;
    actor={user_id:user.userId,session_id:session.sessionId,session_generation:user.sessionVersion};
    await new OwnerAccessRepository(ctx.pool).claimOwner({userId:user.userId,claimedBy:"ELP207_TEST_ONLY"});
    await new AccountLifecycleRepository(ctx.pool).grantStepUp({stepUpId:next(),sessionId:session.sessionId,userId:user.userId,ttlSeconds:600});
  });
  afterAll(async()=>{vi.restoreAllMocks();if(ctx)await teardownApp(ctx);});
  async function fixture(){
    const workspace=next(),now=Date.now(),resource={kind:"PORTFOLIO" as const,id:next()},repo=new AccessRepository(ctx.pool);
    await ctx.pool.query("INSERT INTO workspaces(workspace_id,name,owner_user_id) VALUES($1,'TEST_ONLY command cell',$2)",[workspace,user.userId]);
    await ctx.pool.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'OWNER')",[workspace,user.userId]);
    const policy:ReviewedAccessPolicy={workspace_id:workspace,revision:next(),artifact_digest:accessDigest(next()),approval_ref:next(),state:"REVIEWED",
      qualification:"TEST_ONLY",protected_owner_user_id:user.userId,researcher_fields:{state:"PENDING",policy_ref:null,fields:[]}};
    const membership={revision:next(),mapping_revision:next(),receipt_id:next()};
    const grants:ScopedAccessGrant[]=["capital.top_up","audit.read"].map(action=>({grant_id:next(),workspace_id:workspace,subject_user_id:user.userId,
      action:action as "capital.top_up"|"audit.read",effect:"ALLOW",selector:{kind:"EXPLICIT_RESOURCE_SET",resource_kind:"PORTFOLIO",ids:[resource.id]},environments:["paper"],
      valid_from_ms:now-1000,valid_until_ms:now+60000,delegable_actions:[],issued_by:user.userId,parent_grant_id:null,revision:next(),policy_revision:policy.revision,
      revoked_at_ms:null,requires_ts_acceptance:true,ts_receipt:{receipt_id:membership.receipt_id,membership_revision:membership.revision,mapping_revision:membership.mapping_revision,
        effective_at_ms:now-1000,expires_at_ms:now+60000},field_policy_ref:null}));
    // Explicit source fixtures confined to this disposable TEST_ONLY database;
    // not a public policy/receipt installer or runtime entitlement receipt.
    await repo.putPolicy(policy);for(const grant of grants)await repo.saveGrant(grant,true);
    const accessTrust:AccessTrustProvider={verifyPolicy:async()=>null,verifyReceipt:async()=>null,
      relations:async()=>({qualified:true,revision:membership.revision,own_alpha_ids:[],member_portfolio_ids:[resource.id],roots:{},membership}),
      verifiedHumanMapping:async()=>({ts_user_id:`TEST_ONLY:ts:${user.userId}`,revision:membership.mapping_revision})};
    const access=new ExecutionAccessService(ctx.pool,auth,accessTrust,true);
    const intent:CommandIntent={schema_version:"execution.capital-intent.v2",workspace_id:workspace,resource,environment:"paper",expected_policy_revision:policy.revision,
      business_payload:{schema_version:"pma.capital-command.v1.1",operation:"TOP_UP",idempotency_key:next(),recipient_kind:"PORTFOLIO",currency:"USDT",reason:"TEST_ONLY component",
        amount:"10.000000000000000001",expected_versions:{budget:"9007199254740993",source:"2",parent:"3"}}};
    const makeAuthorization=(i=intent)=>commandAuthorization.parse({qualification:"TEST_ONLY",reference:next(),authority_ref:"TEST_ONLY:pm",profile_ref:"TEST_ONLY:paper",audience:"pma.management.v1",
      actor_id:user.userId,ts_user_id:`TEST_ONLY:ts:${user.userId}`,workload_ref:"TEST_ONLY:workload",delegation_ref:"TEST_ONLY:delegation",mapping_revision:membership.mapping_revision,
      membership_revision:membership.revision,membership_receipt_ref:membership.receipt_id,workspace_id:workspace,environment:i.environment,operation:i.business_payload.operation,
      resource_kind:i.resource.kind,resource_id:i.resource.id,policy_revision:policy.revision,intent_hash:intentHash(actor,i),source_intent_digest:accessDigest(["TEST_ONLY:resolved-PM",i]).slice(7),
      expected_versions:i.business_payload.expected_versions,issued_at_ms:now-1000,expires_at_ms:now+30000,idempotency_retained_until_ms:now+60000,
      approval_required:false,required_approval_gate:null,approval:null,r2_basis:null,
      commit_checks:{human:true,workload:true,membership:true,scope:true,versions:true,capacity:true,approval:true}});
    let sends=0,lookups=0;const effects=new Map<string,SourceCommandResult>();
    const result=(a:CommandAuthorization,i:CommandIntent):SourceCommandResult=>({authority_ref:a.authority_ref,profile_ref:a.profile_ref,workspace_id:workspace,environment:i.environment,
      operation:i.business_payload.operation,resource_kind:i.resource.kind,resource_id:i.resource.id,idempotency_key:i.business_payload.idempotency_key,source_intent_digest:a.source_intent_digest,
      delivery:"ACKNOWLEDGED",business:{state:"APPLIED",receipt_ref:next(),source_event_ref:next(),revision:"1",
        amounts:{requested:"10.000000000000000001",applied:"10.000000000000000001",pending:"0",cancelled:"0",rejected:"0"}},projection:"CATCHING_UP",venue:"NOT_APPLICABLE"});
    const trust:CommandTrust={prepare:async({intent:i})=>makeAuthorization(i),send:async({authorization:a,intent:i})=>{
      sends++;const value=result(a,i);effects.set(i.business_payload.idempotency_key,value);return value;},
      lookup:async({intent:i})=>{lookups++;return effects.get(i.business_payload.idempotency_key)??null;}};
    const service=new ExecutionCommandService(ctx.pool,access,trust,true);
    const preview=()=>service.preview(actor,intent);
    const submit=async()=>service.submit(actor,intent,(await preview()).preview_digest!);
    return {workspace,resource,policy,grants,repo,membership,access,trust,service,intent,makeAuthorization,result,effects,preview,submit,
      counts:()=>({sends,lookups,effects:effects.size})};
  }
  it("T07-03 single effect under concurrency; immutable original status and atomic audit",async()=>{
    const f=await fixture(),p=await f.preview();
    const results=await Promise.allSettled(Array.from({length:4},()=>f.service.submit(actor,f.intent,p.preview_digest!)));
    expect(results.some(r=>r.status==="fulfilled")).toBe(true);
    for(const r of results)if(r.status==="rejected")expect(r.reason.code).toBe("ACCESS_RETRY_REQUIRED");
    expect(f.counts()).toEqual({sends:1,lookups:0,effects:1});
    const replay=await f.submit();expect(replay.business.state).toBe("APPLIED");
    const row=(await ctx.pool.query("SELECT count(*)::int AS n FROM execution_trusted_commands WHERE workspace_id=$1",[f.workspace])).rows[0];expect(row.n).toBe(1);
    const events=(await ctx.pool.query("SELECT count(*)::int AS n FROM execution_trusted_command_events WHERE command_id=$1",[replay.command_id])).rows[0].n;
    expect(events).toBe(3);
    expect((await ctx.pool.query("SELECT count(*)::int AS n FROM product_audit_events WHERE aggregate_id=$1",[replay.command_id])).rows[0].n).toBe(events);
    await expect(ctx.pool.query("UPDATE execution_trusted_commands SET intent='{}' WHERE command_id=$1",[replay.command_id])).rejects.toThrow("COMMAND_INTENT_IMMUTABLE");
    await expect(ctx.pool.query("DELETE FROM execution_trusted_command_events WHERE command_id=$1",[replay.command_id])).rejects.toThrow("COMMAND_HISTORY_IMMUTABLE");
  });
  it("T07-04 same key different amount/target/environment conflicts without another send",async()=>{
    const f=await fixture();await f.submit();
    const changed={...f.intent,business_payload:{...f.intent.business_payload,amount:"11"}};
    await expect(f.service.submit(actor,changed,accessDigest("ignored"))).rejects.toMatchObject({code:"COMMAND_IDEMPOTENCY_CONFLICT"});expect(f.counts().sends).toBe(1);
  });
  it("same-intent submit replay keeps mutation authority; independent status still needs report authority",async()=>{
    const f=await fixture(),first=await f.submit();
    await f.repo.saveGrant({...f.grants[1],revoked_at_ms:Date.now(),revision:next()});
    expect(await f.submit()).toEqual(first);
    await expect(f.service.status(actor,f.workspace,first.command_id)).rejects.toMatchObject({status:404});
    expect(f.counts().sends).toBe(1);
  });
  it("T07-06 commit + lost response becomes UNKNOWN; restart reconciles same key, no resend",async()=>{
    const f=await fixture(),original=f.trust.send;
    f.trust.send=async input=>{await original(input);throw new Error("TEST_ONLY lost response after source commit");};
    const first=await f.submit();expect(first).toMatchObject({delivery:"DELIVERY_UNKNOWN",business:{state:"UNKNOWN"}});
    const restarted=new ExecutionCommandService(ctx.pool,f.access,f.trust,true);
    expect(await restarted.submit(actor,f.intent,(await f.preview()).preview_digest!)).toEqual(first);
    const fixed=await restarted.reconcile(actor,f.workspace,first.command_id);
    expect(fixed).toMatchObject({delivery:"ACKNOWLEDGED",business:{state:"APPLIED"},projection:"CATCHING_UP"});
    expect(f.counts()).toEqual({sends:1,lookups:1,effects:1});
  });
  it("T07-07 restart SENDING/missing or expired source receipt remains unknown, no effect inference",async()=>{
    const f=await fixture(),a=f.makeAuthorization();a.idempotency_retained_until_ms=Date.now()-1;
    const store=new CommandStore(ctx.pool),db=await ctx.pool.connect();let id:string;
    try{await db.query("BEGIN");const r=await store.insert(db,user.userId,f.intent,intentHash(actor,f.intent),a);id=r.id;await store.claim(db,r);await db.query("COMMIT");}finally{db.release();}
    const recovered=await f.service.reconcile(actor,f.workspace,id!);
    expect(recovered).toMatchObject({delivery:"DELIVERY_UNKNOWN",business:{state:"UNKNOWN"}});expect(f.counts()).toEqual({sends:0,lookups:0,effects:0});
  });
  it("T07-02 revoke during preparation refuses before send and leaves no intent",async()=>{
    const f=await fixture(),original=f.trust.prepare;
    f.trust.prepare=async input=>{const a=await original(input);const grant=f.grants[0];await f.repo.saveGrant({...grant,revoked_at_ms:Date.now(),revision:next()});return a;};
    await expect(f.service.submit(actor,f.intent,previewHash(f.makeAuthorization()))).rejects.toMatchObject({code:"ACCESS_RETRY_REQUIRED"});
    expect(f.counts().sends).toBe(0);expect((await ctx.pool.query("SELECT count(*)::int AS n FROM execution_trusted_commands WHERE workspace_id=$1",[f.workspace])).rows[0].n).toBe(0);
  });
  it("T07-02 expiry at commit fence refuses without dispatch",async()=>{
    const f=await fixture(),a=f.makeAuthorization();a.expires_at_ms=Date.now()-1;f.trust.prepare=async()=>a;
    const p=await f.preview();expect(p).toMatchObject({allowed:false,reason_code:"COMMAND_CONTEXT_EXPIRED"});
    await expect(f.service.submit(actor,f.intent,previewHash(a))).rejects.toMatchObject({code:"COMMAND_CONTEXT_EXPIRED"});expect(f.counts().sends).toBe(0);
  });
  it("T07-11 source-only recovery continues after grant revoke but browser cannot read receipt",async()=>{
    const f=await fixture(),original=f.trust.send;f.trust.send=async input=>{await original(input);throw Error("lost");};
    const first=await f.submit();for(const g of f.grants)await f.repo.saveGrant({...g,revoked_at_ms:Date.now(),revision:next()});
    await f.service.recover(f.workspace,first.command_id);
    await expect(f.service.status(actor,f.workspace,first.command_id)).rejects.toMatchObject({code:"ACCESS_RESOURCE_NOT_FOUND",status:404});
    expect((await new CommandStore(ctx.pool).get(f.workspace,first.command_id))!.status.business.state).toBe("APPLIED");expect(f.counts().sends).toBe(1);
  });
  it("T07-09 direct source-dark submission is refused; TEST_ONLY cannot enter normal service",async()=>{
    const f=await fixture(),dark=new ExecutionCommandService(ctx.pool,f.access),production=new ExecutionCommandService(ctx.pool,f.access,f.trust);
    for(const service of [dark,production]){
      expect((await service.preview(actor,f.intent)).allowed).toBe(false);
      await expect(service.submit(actor,f.intent,accessDigest("none"))).rejects.toMatchObject({code:"COMMAND_RELAY_NOT_QUALIFIED"});
    }expect(f.counts().sends).toBe(0);
  });
  it("T07-11 read-all grant does not create command authority; wrong workspace is indistinguishable 404",async()=>{
    const f=await fixture();await f.repo.saveGrant({...f.grants[0],action:"business.read_all",revision:next()});
    await expect(f.preview()).rejects.toMatchObject({code:"ACCESS_DENIED"});expect(f.counts().sends).toBe(0);
    await expect(f.service.status(actor,next(),"ecm_00000000000000000000000000000000")).rejects.toMatchObject({status:404});
  });
  it("T07-01/09 mounted routes reject spoof/CSRF and return typed, non-cacheable status",async()=>{
    const f=await fixture(),app=await NestFactory.create<NestFastifyApplication>({module:CommandTestModule,controllers:[ExecutionCommandController],providers:[SessionGuard,
      {provide:ExecutionCommandService,useValue:f.service},{provide:AuthService,useValue:auth},{provide:CONTROL_API_CONFIG,useValue:ctx.config},
      {provide:WorkspacesRepository,useValue:new WorkspacesRepository(ctx.pool,ctx.config)}]},new FastifyAdapter(),{logger:false,abortOnError:false});
    try{app.useGlobalFilters(new HttpErrorFilter());await app.register(cookiePlugin as never);await app.init();await app.getHttpAdapter().getInstance().ready();
      const http=app.getHttpAdapter().getInstance(),headers={cookie:`${SESSION_COOKIE}=${session.token}; ${CSRF_COOKIE}=${session.csrfToken}`,
        origin:ctx.config.PORTAL_PUBLIC_ORIGIN,"x-portal-csrf":session.csrfToken,"x-portal-idempotency-key":f.intent.business_payload.idempotency_key};
      const url="/api/v1/execution/capital-commands";
      expect((await http.inject({method:"POST",url:url+"/preview",headers,payload:{...f.intent,actor:{user_id:"bobby"}}})).statusCode).toBe(400);
      expect((await http.inject({method:"POST",url:url+"/preview",headers:{...headers,origin:"https://wrong.invalid"},payload:f.intent})).statusCode).toBe(403);
      const p=await http.inject({method:"POST",url:url+"/preview",headers:{...headers,"x-human-id":"spoof","x-workload-id":"spoof"},payload:f.intent});
      expect(p.statusCode).toBe(200);expect(p.headers["cache-control"]).toContain("no-store");
      const send=await http.inject({method:"POST",url,headers,payload:{intent:f.intent,preview_digest:p.json().preview_digest}});expect(send.statusCode).toBe(200);
      const id=send.json().command_id;
      const read=await http.inject({method:"GET",url:`${url}/${id}?workspace_id=${encodeURIComponent(f.workspace)}`,headers});expect(read.statusCode).toBe(200);expect(read.json().business.state).toBe("APPLIED");
      expect(f.counts().lookups).toBe(0);expect(JSON.stringify(read.json())).not.toMatch(/ts_user_id|workload_ref|delegation_ref|expected_versions|csrf|JWT/);
      f.trust.lookup=async()=>{throw Error("SELECT secret FROM hidden_table; PRIVATE_KEY");};
      const recovery=await http.inject({method:"POST",url:`${url}/${id}/reconcile`,headers,payload:{workspace_id:f.workspace}});
      expect(recovery.statusCode).toBe(200);expect(recovery.body).not.toContain("hidden_table");
      await f.repo.saveGrant({...f.grants[1],revoked_at_ms:Date.now(),revision:next()});
      const hidden=await http.inject({method:"GET",url:`${url}/${id}?workspace_id=${encodeURIComponent(f.workspace)}`,headers});
      const missing=await http.inject({method:"GET",url:`${url}/ecm_00000000000000000000000000000000?workspace_id=${encodeURIComponent(f.workspace)}`,headers});
      expect(hidden.statusCode).toBe(404);expect(missing.statusCode).toBe(404);expect(hidden.json()).toEqual(missing.json());
      expect(hidden.json().public_copy_key).toBe("COMMAND_RESOURCE_NOT_FOUND");
      const originalProfile=ctx.config.EXECUTION_READ_PROFILE;ctx.config.EXECUTION_READ_PROFILE="retained_review_v1";
      const retained=await http.inject({method:"POST",url:url+"/preview",headers,payload:f.intent});
      ctx.config.EXECUTION_READ_PROFILE=originalProfile;
      expect(retained.statusCode).toBe(403);expect(f.counts().sends).toBe(1);
    }finally{await app.close();}
  });
});
