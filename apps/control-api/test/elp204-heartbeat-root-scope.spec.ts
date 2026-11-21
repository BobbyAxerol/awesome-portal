/** Actual disposable PostgreSQL Core scope issuer; all TS relations, accepted
 * roots/grants and publication inputs below are synthetic TEST_ONLY. No public
 * heartbeat reader, source transport/COMMIT, held native fence or runtime proof. */
import { createHash, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AuthService } from "../src/auth/auth.service";
import type { AuthSession, PortalUser } from "../src/domain";
import { AccessPolicyError, type AccessAction, type AccessResource, type ReviewedAccessPolicy, type ScopedAccessGrant } from "../src/execution-v2/access.contract";
import { accessDigest } from "../src/execution-v2/access-policy";
import { AccessRepository } from "../src/execution-v2/access.repository";
import { ExecutionAccessService } from "../src/execution-v2/access.service";
import type { AccessTrustProvider } from "../src/execution-v2/access-trust";
import { TECHNICAL_READ_FIELDS } from "../src/execution-v2/read-fields";
import type { ExecutionReadPublication, ExecutionReadPublicationRequest, ReadDatasetBinding } from "../src/execution-v2/read-publication";
import { ExecutionReadScopes, scopeAllowsField, scopeAllowsFullAccountingPopulation, scopeReadPopulation,
  scopeResources, scopeTuples, type ReadScopePrincipal } from "../src/execution-v2/read-scope";
import { NAMED_RETAINED_PURPOSES, namedRetainedRelationAction } from "../src/execution/retained-operation-page";
import { OwnerAccessRepository } from "../src/repos/owner-access";
import { migrateTestDatabase, setupApp, teardownApp } from "./harness";

const database=process.env.TEST_DATABASE_URL;
const next=()=>`elp204-heartbeat-root-${randomUUID()}`;
const root="TEST_ONLY-heartbeat-root";
const profile={environment:"paper" as const,profileId:"TEST_ONLY-heartbeat-paper"};
const dataset:ReadDatasetBinding={dataset_id:"relation:manager.current.service-heartbeats:service_heartbeats",
  source_revision:"TEST_ONLY-captured-payload",projection_generation:"TEST_ONLY-projection-generation",
  catalogue_revision:"TEST_ONLY-captured-catalogue",window:null};
const digest=(value:string)=>createHash("sha256").update(value).digest("hex");

describe.skipIf(!database)("ELP2-04 private heartbeat ROOT technical scopes (actual PG, synthetic source)",()=>{
  let ctx:Awaited<ReturnType<typeof setupApp>>,auth:AuthService,owner:PortalUser;
  async function active(role:"ADMIN"|"USER"="USER"){
    const username=next(),user=await auth.users.create({userId:next(),username,displayName:username,role});
    return (await auth.users.applyLifecycleChange({userId:user.userId,expectedRevision:user.accountRevision,
      status:"ACTIVE",mustChangePassword:false}))!;
  }
  beforeAll(async()=>{
    await migrateTestDatabase(database!);ctx=await setupApp({DATABASE_URL:database!});auth=ctx.app.get(AuthService);
    owner=await active("ADMIN");
    await new OwnerAccessRepository(ctx.pool).claimOwner({userId:owner.userId,claimedBy:"ELP204_HEARTBEAT_ROOT_TEST_ONLY"});
  });
  afterEach(()=>vi.restoreAllMocks());
  afterAll(async()=>{if(ctx)await teardownApp(ctx);});

  async function fixture(options:{action?:AccessAction|null;role?:"ADMIN"|"USER";legacy?:boolean;allowTestOnly?:boolean}={}){
    const user=await active(options.role),workspace=next(),repo=new AccessRepository(ctx.pool);
    await ctx.pool.query("INSERT INTO workspaces(workspace_id,name,owner_user_id) VALUES($1,'TEST_ONLY heartbeat scope',$2)",[workspace,owner.userId]);
    for(const id of [owner.userId,user.userId])await ctx.pool.query(
      "INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'MEMBER')",[workspace,id]);
    const policy:ReviewedAccessPolicy={workspace_id:workspace,revision:next(),artifact_digest:accessDigest(["TEST_ONLY",workspace]),
      approval_ref:"TEST_ONLY-not-production-approval",state:"REVIEWED",qualification:"TEST_ONLY",protected_owner_user_id:owner.userId,
      researcher_fields:{state:"PENDING",policy_ref:null,fields:[]}};
    if(!options.legacy)await repo.putPolicy(policy);
    const roots:Record<string,readonly AccessResource[]>={[root]:[]};
    const membership={revision:"TEST_ONLY-member-r1",receipt_id:"TEST_ONLY-member-receipt",mapping_revision:"TEST_ONLY-mapping-r1"};
    const source:{revision:string;publication:ExecutionReadPublication|null;beforePublication?:(request:ExecutionReadPublicationRequest)=>Promise<void>}={
      revision:"TEST_ONLY-relations-r1",publication:{workspace_id:workspace,environment:profile.environment,profile_id:profile.profileId,
        qualification:"TEST_ONLY",publication_revision:"TEST_ONLY-publication-r1",binding:structuredClone(dataset),
        population_coverage:"COMPLETE_FOR_DATASET_WINDOW",provenance_ref:"TEST_ONLY-NOT-SOURCE-COMMISSIONED",
        current_linkage:null,resources:[{kind:"ROOT",id:root}],tuples:[]}};
    const trust:AccessTrustProvider={verifyPolicy:async()=>null,verifyReceipt:async()=>null,verifiedHumanMapping:async()=>null,
      relations:async()=>({qualified:true,revision:source.revision,own_alpha_ids:[],member_portfolio_ids:[],
        roots:structuredClone(roots),membership:{...membership}}),
      readPublication:vi.fn(async request=>{await source.beforePublication?.(request);return structuredClone(source.publication);})};
    const now=Date.now(),session:AuthSession={sessionId:next(),userId:user.userId,state:"ACTIVE",sessionVersion:user.sessionVersion,
      authenticationTime:new Date(now),idleExpiresAt:new Date(now+600_000),absoluteExpiresAt:new Date(now+600_000)};
    await auth.sessions.create({sessionId:session.sessionId,userId:user.userId,tokenHash:digest(next()),csrfSecretHash:digest(next()),
      accessSubject:null,accessTokenExpiresAt:null,activationId:null,sessionVersion:user.sessionVersion,
      idleExpiresAt:session.idleExpiresAt,absoluteExpiresAt:session.absoluteExpiresAt});
    const principal:ReadScopePrincipal={user,session,workspaceId:workspace,viewerWorkspaceId:workspace};
    async function grant(action:AccessAction=options.action??"maintenance.read"){
      const value:ScopedAccessGrant={grant_id:next(),workspace_id:workspace,subject_user_id:user.userId,action,effect:"ALLOW",
        selector:{kind:"ROOT_SCOPE",root_id:root},environments:["paper"],valid_from_ms:now-1000,valid_until_ms:now+600_000,
        delegable_actions:[],issued_by:owner.userId,parent_grant_id:null,revision:next(),policy_revision:policy.revision,
        revoked_at_ms:null,requires_ts_acceptance:true,field_policy_ref:null,ts_receipt:{receipt_id:membership.receipt_id,
          membership_revision:membership.revision,mapping_revision:membership.mapping_revision,effective_at_ms:now-1000,expires_at_ms:now+600_000}};
      await repo.saveGrant(value,true);return value;
    }
    const initialGrant=options.legacy||options.action===null?null:await grant();
    const access=new ExecutionAccessService(ctx.pool,auth,trust,options.allowTestOnly!==false);
    const scopes=new ExecutionReadScopes(ctx.pool,access,ctx.config);
    const authorize=(input:ReadDatasetBinding=dataset)=>scopes.authorizeTechnicalProfile(principal,profile,"maintenance.read",input);
    return{workspace,user,principal,repo,policy,roots,source,trust,scopes,access,grant,initialGrant,authorize};
  }
  type Fixture=Awaited<ReturnType<typeof fixture>>;
  async function revoke(f:Fixture){
    await f.repo.saveGrant({...f.initialGrant!,revoked_at_ms:Date.now(),revision:next()});
  }

  it("maintenance-only ROOT mints without business grants, economic census or researcher policy",async()=>{
    const f=await fixture(),scope=await f.authorize();
    expect(f.policy.researcher_fields).toEqual({state:"PENDING",policy_ref:null,fields:[]});
    expect(scope).toMatchObject({mode:"SCOPED_V2",workspaceId:f.workspace,environment:"paper",profileId:profile.profileId,
      wholePopulation:false,fieldPolicyRef:null});
    expect(scopeResources(scope)).toEqual([{kind:"ROOT",id:root}]);
    expect(scopeReadPopulation(scope)).toEqual({allowedTuples:[],populationTuples:[],binding:dataset,strategyPairs:[],bindingPairs:[]});
    expect(scopeTuples(scope)!.allowedTuples).toEqual([]);
    for(const field of TECHNICAL_READ_FIELDS)expect(scopeAllowsField(scope,field)).toBe(true);
    for(const field of ["equity","allocation","account_id","service_name","status","instance_id"])
      expect(scopeAllowsField(scope,field)).toBe(false);
    expect(scopeAllowsFullAccountingPopulation(scope)).toBe(false);
    expect(scopeAllowsFullAccountingPopulation(scope,"TEST_ONLY-portfolio")).toBe(false);
    expect(f.trust.readPublication).toHaveBeenCalledTimes(2);
    expect(await f.scopes.deliver(scope,async()=>"TEST_ONLY-local-value")).toBe("TEST_ONLY-local-value");
    expect(NAMED_RETAINED_PURPOSES.service_heartbeats).toBeNull();
    expect(()=>namedRetainedRelationAction("service_heartbeats")).toThrow("EXECUTION_NAMED_PURPOSE_NOT_COMMISSIONED");
  });
  it("dataset-less technical maintenance is unchanged and never reads a publication",async()=>{
    const f=await fixture(),scope=await f.scopes.authorizeTechnicalProfile(f.principal,profile);
    expect(scopeResources(scope)).toEqual([{kind:"ROOT",id:root}]);
    expect(scopeReadPopulation(scope).binding).toBeNull();expect(f.trust.readPublication).not.toHaveBeenCalled();
  });
  it.each([{action:"business.read_all" as const},{action:"development.read" as const},
    {action:null,role:"ADMIN" as const}])("$action / $role cannot substitute for maintenance",async options=>{
    const f=await fixture(options);await expect(f.authorize()).rejects.toMatchObject({code:"EXECUTION_READ_NOT_AVAILABLE",status:404});
    expect(f.trust.readPublication).not.toHaveBeenCalled();
  });
  it.each([0,2])("%i current roots refuse before publication lookup",async count=>{
    const f=await fixture();delete f.roots[root];
    for(let i=0;i<count;i++)f.roots[`TEST_ONLY-other-root-${i}`]=[];
    await expect(f.authorize()).rejects.toMatchObject({code:"EXECUTION_READ_PUBLICATION_NOT_QUALIFIED",status:503});
    expect(f.trust.readPublication).not.toHaveBeenCalled();
  });
  it("one different current root cannot reuse the old root's grant",async()=>{
    const f=await fixture();delete f.roots[root];f.roots["TEST_ONLY-another-current-root"]=[];
    await expect(f.authorize()).rejects.toMatchObject({code:"EXECUTION_READ_NOT_AVAILABLE",status:404});
    expect(f.trust.readPublication).not.toHaveBeenCalled();
  });
  it("technical ROOT can never satisfy a full-accounting-population request",async()=>{
    const f=await fixture();
    await expect(f.scopes.authorize(f.principal,profile,{action:"maintenance.read",resource:{kind:"ROOT",id:root},
      dataset,requireWholePopulation:true})).rejects.toMatchObject({code:"EXECUTION_READ_NOT_AVAILABLE",status:404});
  });
  it.each(["relation:manager.current.dead-letters:dead_letters","relation:manager.current.service-heartbeats:orders"])(
    "technical dataset %s cannot widen the finite allowlist, even with business ALL",async dataset_id=>{
      const f=await fixture();await f.grant("business.read_all");
      await expect(f.authorize({...dataset,dataset_id})).rejects.toMatchObject({code:"EXECUTION_READ_PUBLICATION_NOT_QUALIFIED",status:503});
      await expect(f.scopes.authorize(f.principal,profile,{action:"maintenance.read",resource:{kind:"ROOT",id:root},
        dataset:{...dataset,dataset_id}})).rejects.toMatchObject({code:"EXECUTION_READ_PUBLICATION_NOT_QUALIFIED",status:503});
      expect(f.trust.readPublication).not.toHaveBeenCalled();
    });
  it.each(["window","generation","catalogue"])("missing/inapplicable retained identity %s refuses",async field=>{
    const f=await fixture(),input=structuredClone(dataset);
    if(field==="window")input.window={from_ms:1,to_ms:2};
    if(field==="generation")delete input.projection_generation;
    if(field==="catalogue")delete input.catalogue_revision;
    await expect(f.authorize(input)).rejects.toMatchObject({code:"EXECUTION_READ_PUBLICATION_NOT_QUALIFIED",status:503});
    expect(f.trust.readPublication).not.toHaveBeenCalled();
  });
  it("development cannot mint the exact technical dataset through either entry point",async()=>{
    const f=await fixture({action:"development.read"});
    await expect(f.scopes.authorizeTechnicalProfile(f.principal,profile,"development.read",dataset))
      .rejects.toMatchObject({code:"EXECUTION_READ_PUBLICATION_NOT_QUALIFIED",status:503});
    await expect(f.scopes.authorize(f.principal,profile,{action:"development.read",resource:{kind:"ROOT",id:root},dataset}))
      .rejects.toMatchObject({code:"EXECUTION_READ_PUBLICATION_NOT_QUALIFIED",status:503});
  });
  it.each(["root","tuples","strategy","binding","current"])("publication %s cannot add economic authority",async field=>{
    const f=await fixture(),p=f.source.publication!;
    if(field==="root")p.resources=[{kind:"ROOT",id:"TEST_ONLY-another-root"}];
    if(field==="tuples"){
      const t={alpha_id:"a",alpha_version_id:"v",portfolio_id:"p",deployment_id:"d",account_id:"c"};
      p.tuples=[t];p.resources.push({kind:"ALPHA",id:t.alpha_id},{kind:"ALPHA_VERSION",id:t.alpha_version_id},
        {kind:"PORTFOLIO",id:t.portfolio_id},{kind:"DEPLOYMENT",id:t.deployment_id},{kind:"ACCOUNT",id:t.account_id});
    }
    if(field==="strategy")p.strategy_lineage={qualification:"TEST_ONLY",revision:"r",provenance_ref:"TEST_ONLY",pairs:[]};
    if(field==="binding")p.binding_lineage={qualification:"TEST_ONLY",revision:"r",provenance_ref:"TEST_ONLY",bindings:[]};
    if(field==="current")p.current_linkage={qualification:"TEST_ONLY",revision:"r",provenance_ref:"TEST_ONLY",pairs:[]};
    await expect(f.authorize()).rejects.toMatchObject({code:"EXECUTION_READ_PUBLICATION_NOT_QUALIFIED",status:503});
  });
  it.each(["missing","partial","workspace","environment","profile","revision","generation","catalogue"])(
    "unqualified or mismatched publication axis %s refuses",async axis=>{
      const f=await fixture(),p=f.source.publication!;
      if(axis==="missing")f.source.publication=null;
      if(axis==="partial")p.population_coverage="PARTIAL";
      if(axis==="workspace")p.workspace_id="TEST_ONLY-other-workspace";
      if(axis==="environment")p.environment="sandbox";
      if(axis==="profile")p.profile_id="TEST_ONLY-other-profile";
      if(axis==="revision")p.binding.source_revision="TEST_ONLY-other-revision";
      if(axis==="generation")p.binding.projection_generation="TEST_ONLY-other-generation";
      if(axis==="catalogue")p.binding.catalogue_revision="TEST_ONLY-other-catalogue";
      await expect(f.authorize()).rejects.toMatchObject({code:"EXECUTION_READ_PUBLICATION_NOT_QUALIFIED",status:503});
    });
  it("a valid empty-root publication needs explicit TEST_ONLY enablement",async()=>{
    const f=await fixture({allowTestOnly:false});
    f.policy.qualification="OWNER_VERIFIED";await f.repo.putPolicy(f.policy);
    await expect(f.authorize()).rejects.toMatchObject({code:"EXECUTION_READ_PUBLICATION_NOT_QUALIFIED",status:503});
  });
  it("ordinary legacy membership cannot mint new technical capability",async()=>{
    const f=await fixture({legacy:true});await expect(f.authorize()).rejects.toMatchObject({code:"EXECUTION_READ_NOT_AVAILABLE",status:404});
    expect(f.trust.readPublication).not.toHaveBeenCalled();
  });
  it("publication drift at its confirming read refuses instead of mixing revisions",async()=>{
    const f=await fixture();let reads=0;
    f.source.beforePublication=async()=>{if(++reads===2)f.source.publication!.publication_revision="TEST_ONLY-r2";};
    await expect(f.authorize()).rejects.toMatchObject({code:"EXECUTION_READ_ACCESS_CHANGED",status:409});
  });
  it("current ROOT context drift during publication I/O refuses",async()=>{
    const f=await fixture();let reads=0;
    f.source.beforePublication=async()=>{if(++reads===1)f.source.revision="TEST_ONLY-relations-r2";};
    await expect(f.authorize()).rejects.toMatchObject({code:"EXECUTION_READ_ACCESS_CHANGED",status:409});
  });
  it("actual Core grant revoke during final publication I/O refuses",async()=>{
    const f=await fixture();let reads=0;
    f.source.beforePublication=async()=>{if(++reads===2)await revoke(f);};
    await expect(f.authorize()).rejects.toMatchObject({code:"EXECUTION_READ_ACCESS_CHANGED",status:409});
  });
  it.each(["grant","session","publication"])("delivery refuses %s changes after the awaited local read",async axis=>{
    const f=await fixture(),scope=await f.authorize();
    await expect(f.scopes.deliver(scope,async()=>{
      if(axis==="grant")await revoke(f);
      if(axis==="session")await auth.sessions.revokeSession(f.principal.session.sessionId,"TEST_ONLY-heartbeat-root-race");
      if(axis==="publication")f.source.publication!.publication_revision="TEST_ONLY-after-read-r2";
      return "TEST_ONLY-MUST-NOT-ESCAPE";
    })).rejects.toBeDefined();
  });
  it("native publication errors stay typed and sanitized",async()=>{
    const f=await fixture();f.source.beforePublication=async()=>{throw new Error("TEST_ONLY-PRIVATE-SQL-CREDENTIAL");};
    const error=await f.authorize().catch(value=>value);
    expect(error).toMatchObject({code:"EXECUTION_READ_AUTHORITY_UNAVAILABLE",status:503});
    expect(String(error)).not.toContain("TEST_ONLY-PRIVATE-SQL-CREDENTIAL");
  });
  it.each([false,true])("initial ROOT-provider failure is sanitized (dataset=%s)",async withDataset=>{
    const f=await fixture();vi.spyOn(f.access,"readContext").mockRejectedValueOnce(new Error("TEST_ONLY-PRIVATE-ROOT-PROVIDER"));
    const error=await f.scopes.authorizeTechnicalProfile(f.principal,profile,"maintenance.read",withDataset?dataset:undefined)
      .catch(value=>value);
    expect(error).toMatchObject({code:"EXECUTION_READ_AUTHORITY_UNAVAILABLE",status:503});
    expect(String(error)).not.toContain("TEST_ONLY-PRIVATE-ROOT-PROVIDER");
    expect(f.trust.readPublication).not.toHaveBeenCalled();
  });
  it.each([false,true])("initial ROOT-provider retry preserves typed409 (dataset=%s)",async withDataset=>{
    const f=await fixture();vi.spyOn(f.access,"readContext").mockRejectedValueOnce(new AccessPolicyError("ACCESS_RETRY_REQUIRED"));
    await expect(f.scopes.authorizeTechnicalProfile(f.principal,profile,"maintenance.read",withDataset?dataset:undefined))
      .rejects.toMatchObject({code:"EXECUTION_READ_ACCESS_CHANGED",status:409});
    expect(f.trust.readPublication).not.toHaveBeenCalled();
  });
  it("caller mutation while current ROOT is resolving cannot retarget the capability",async()=>{
    const f=await fixture(),p=structuredClone(f.principal),b={...profile},d=structuredClone(dataset);
    const original=f.access.readContext.bind(f.access);let first=true;
    vi.spyOn(f.access,"readContext").mockImplementation(async(...args)=>{
      const result=await original(...args);
      if(first){first=false;p.workspaceId="TEST_ONLY-mutated-workspace";b.profileId="TEST_ONLY-mutated-profile";d.dataset_id="TEST_ONLY-mutated-dataset";}
      return result;
    });
    const scope=await f.scopes.authorizeTechnicalProfile(p,b,"maintenance.read",d);
    expect(scope.workspaceId).toBe(f.workspace);expect(scope.profileId).toBe(profile.profileId);
    expect(scopeReadPopulation(scope).binding).toEqual(dataset);
    for(const [request] of vi.mocked(f.trust.readPublication!).mock.calls)expect(request).toMatchObject({workspace_id:f.workspace,
      environment:profile.environment,profile_id:profile.profileId,binding:dataset});
  });
});
