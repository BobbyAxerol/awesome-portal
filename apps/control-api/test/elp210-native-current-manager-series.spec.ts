/** Pure source/scope composition proofs. Policy, publication, port and response
 * doubles are TEST_ONLY: no PG, HTTP, native source or commissioning claim. The
 * companion provider suite owns actual disposable custody/physical-send tests. */
import "reflect-metadata";
import {describe,expect,it,vi} from "vitest";
import type {Pool} from "pg";
import type {ServerResponse} from "node:http";
import type {FastifyReply} from "fastify";
import type {AuthService} from "../src/auth/auth.service";
import {ExecutionAccessService} from "../src/execution-v2/access.service";
import {accessDigest,type AccessEvaluationContext} from "../src/execution-v2/access-policy";
import {unqualifiedAccessTrust} from "../src/execution-v2/access-trust";
import {ManagerSeriesController} from "../src/execution-v2/manager-series.controller";
import {ManagerSeriesService} from "../src/execution-v2/manager-series.service";
import {ManagerModelService} from "../src/execution-v2/manager-model.service";
import {ManagerModelController} from "../src/execution-v2/manager-model.controller";
import {managerScorePopulationDigest} from "../src/execution-v2/manager-score-publication";
import type {ExecutionManagerRuntime} from "../src/execution-v2/manager-runtime";
import type {ManagerModelDocument} from "../src/execution-v2/manager-model.contract";
import {NativeCurrentAccountScopes} from "../src/execution-v2/native-current-runtime";
import type {NativeCurrentRelationsPort} from "../src/execution-v2/native-current-relations-port";
import {ExecutionReadScopeError,ExecutionReadScopes,type AuthorizedExecutionReadScope} from "../src/execution-v2/read-scope";
import type {OrdinaryProfileAuthority} from "../src/execution-v2/ordinary-profile-authority";
import type {OrdinaryProfileReadDecision} from "../src/execution-v2/ordinary-profile-authority.contract";
import type {ExecutionReadPublicationRequest} from "../src/execution-v2/read-publication";
import {BUSINESS_READ_FIELDS} from "../src/execution-v2/read-fields";
import {EXECUTION_PUBLICATION_CATALOGUE} from "../src/execution-v2/publication-source.generated";
import {productReadFixture,OWN,PEER,PRIVATE} from "./elp2-product-read.fixture";

const NOW=1_800_000_000_000;
const SUBJECTS=[{subject_type:"FUND" as const},{subject_type:"PORTFOLIO" as const,subject_id:OWN.portfolio_id},
  {subject_type:"PORTFOLIO" as const,subject_id:PRIVATE.portfolio_id},{subject_type:"ALPHA" as const,subject_id:OWN.alpha_id}];
type CompositionArgs=Parameters<ExecutionAccessService["deliverNativeCurrentComposition"]>;

function fixture(native=true){
  const f=productReadFixture({full:true,fields:[...BUSINESS_READ_FIELDS]});
  f.context.grants.push({...f.context.grants[0],grant_id:"TEST_ONLY:series-portfolio",action:"portfolio.read",
    selector:{kind:"EXPLICIT_RESOURCE_SET",resource_kind:"PORTFOLIO",ids:[OWN.portfolio_id,PRIVATE.portfolio_id]}},
  {...f.context.grants[0],grant_id:"TEST_ONLY:series-alpha",action:"alpha.read",
    selector:{kind:"EXPLICIT_RESOURCE_SET",resource_kind:"ALPHA",ids:[OWN.alpha_id]}});
  f.access.hasNativeCurrentRelations=()=>native;
  let finalContexts=(contexts:readonly AccessEvaluationContext[])=>contexts;
  const sent:Buffer[]=[],order:string[]=[];
  const composition=vi.fn(async(...args:CompositionArgs)=>{
    const [_actor,_workspace,purposes,_proof,_response,build,check,validation]=args;
    const contexts=purposes.map(()=>({...f.context}));
    order.push("build");const body=await build(contexts);
    order.push("enter");await validation?.afterEnter?.();
    order.push("final");check(finalContexts(contexts));
    // Deliberately synchronous after the final check, like the physical port.
    validation?.beforeDispatch?.();validation?.beforeDispatch?.();sent.push(body);
  });
  Object.assign(f.access,{deliverNativeCurrentComposition:composition});
  const profile="PAPER_BINANCE_USDM",head={revision:"TEST_ONLY:series-r1",source_epoch:"TEST_ONLY:epoch",source_sequence:"1",
    projection_generation:"TEST_ONLY:series-generation",payload_digest:accessDigest("TEST_ONLY:series-body"),
    catalogue_digest:EXECUTION_PUBLICATION_CATALOGUE.source_catalogue_digest};
  const doc:ManagerModelDocument={schema_version:"portal.execution.manager-model-input.v1",workspace_id:f.principal.workspaceId,
    environment:"paper",profile_id:profile,qualification:"SOURCE_VERIFIED",family_id:"alpha_fleet_overview",revision:head.revision,
    supersedes_revision:null,source_epoch:head.source_epoch,source_sequence:head.source_sequence,projection_generation:head.projection_generation,
    catalogue_digest:head.catalogue_digest,source_set_digest:accessDigest([OWN,PEER,PRIVATE]),as_of_ms:NOW-100,
    recorded_through_ms:NOW-50,facts_through_ms:NOW-100,observed_at_ms:NOW,
    source_quality:{completeness:"COMPLETE",freshness:"FRESH",reasons:[]},
    members:[OWN,PEER,PRIVATE].map((tuple,index)=>({tuple:{...tuple},name:`TEST_ONLY:member-${index}`,stage:"PAPER",owner_user_id:"TEST_ONLY:owner",
      lifecycle:"ACTIVE",venue:"TEST_ONLY:venue",health:"HEALTHY",source_state:"FRESH",binding_ref:"TEST_ONLY:binding",
      assignment_revision:"a",owner_revision:"o",binding_revision:"b",valid_from_ms:NOW-1000,valid_to_ms:null})),facts:[]};
  let economicCurrent=true;
  const runtime={economicSourceFor:()=>({calculation_revision:"TEST_ONLY:calc",isCurrent:()=>economicCurrent})} as unknown as ExecutionManagerRuntime;
  // Existing production injection token; ordinary scopes are never silently
  // replaced globally. The fifth argument selects ONLY this native route.
  const ordinaryAuthorize=vi.fn(async()=>{throw Error("TEST_ONLY:ordinary-authorize-must-not-run");});
  const ordinaryDeliver=vi.fn(async()=>{throw Error("TEST_ONLY:ordinary-delivery-must-not-run");});
  const ordinaryScopes={authorize:ordinaryAuthorize,deliver:ordinaryDeliver,hasNativeCurrentRelations:()=>false} as unknown as ExecutionReadScopes;
  const service=new ManagerSeriesService({} as Pool,native?ordinaryScopes:f.scopes,f.config,runtime,
    native?new NativeCurrentAccountScopes(f.scopes):undefined);
  const repository=(service as unknown as {repository:{head:(...args:unknown[])=>Promise<unknown>;document:(...args:unknown[])=>Promise<unknown>}}).repository;
  vi.spyOn(repository,"head").mockResolvedValue(head);vi.spyOn(repository,"document").mockResolvedValue(doc);
  const controller=new ManagerSeriesController(service,{canReadExecution:async()=>true} as never);
  const request={portalUser:f.principal.user,portalSession:f.principal.session,portalWorkspaceId:f.principal.workspaceId} as never;
  const raw={headersSent:false,writableEnded:false,destroyed:false,destroy:vi.fn()};
  const reply={raw,hijack:vi.fn(()=>{order.push("dispatch");raw.headersSent=true;})} as unknown as FastifyReply;
  const query=(count=4)=>({environment:"paper",metric:"NAV",window:"30D",subjects:JSON.stringify(SUBJECTS.slice(0,count))});
  const dataset={dataset_id:doc.family_id,source_revision:doc.revision,projection_generation:doc.projection_generation,
    catalogue_revision:doc.catalogue_digest,window:null};
  return{...f,service,repository,doc,head,controller,request,raw,reply,query,composition,sent,order,dataset,profile,runtime,ordinaryScopes,ordinaryAuthorize,ordinaryDeliver,
    setFinal:(fn:typeof finalContexts)=>{finalContexts=fn;},expireEconomic:()=>{economicCurrent=false;}};
}

describe("Manager Series selects the actual native scope composition (TEST_ONLY doubles)",()=>{
  it.each([1,2,3,4])("serves %i independently authorized subjects with one composition, not detached delivery",async count=>{
    const f=fixture(),ordinary=vi.spyOn(f.scopes,"deliver"),authorize=vi.spyOn(f.scopes,"authorize");
    expect(await f.controller.read(f.request,f.query(count),f.reply)).toBeUndefined();
    expect(f.composition).toHaveBeenCalledOnce();expect(f.sent).toHaveLength(1);expect(f.reply.hijack).toHaveBeenCalledOnce();
    expect(ordinary).not.toHaveBeenCalled();expect(authorize).toHaveBeenCalledTimes(count);
    expect(f.ordinaryAuthorize).not.toHaveBeenCalled();expect(f.ordinaryDeliver).not.toHaveBeenCalled();
    const [actor,workspace,purposes,proof,response]=f.composition.mock.calls[0];
    expect(actor).toEqual({user_id:f.principal.user.userId,session_id:f.principal.session.sessionId,session_generation:1});
    expect(workspace).toBe(f.principal.workspaceId);expect(response).toBe(f.raw);expect(proof).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(purposes.map(p=>p.action)).toEqual(["business.read_all","portfolio.read","portfolio.read","alpha.read"].slice(0,count));
    for(let index=1;index<count;index++)expect(purposes[index].resources).toContainEqual({kind:SUBJECTS[index].subject_type,id:SUBJECTS[index].subject_id});
    expect(new Set(purposes.map(p=>accessDigest(p))).size).toBe(count);
    const body=JSON.parse(f.sent[0].toString());expect(body.series).toHaveLength(count);
    expect(body.series.every((s:{reason_code:string})=>s.reason_code==="SERIES_SOURCE_NOT_PUBLISHED")).toBe(true);
    expect(f.order).toEqual(["build","enter","final","dispatch"]);
  });
  it("delivers a genuinely selected AVAILABLE series publication unchanged through the native route",async()=>{
    const f=fixture(),to=f.doc.as_of_ms,from=to-30*86_400_000,partition={economic_domain:"PAPER" as const,currency:"USDT",
      basis:"TEST_ONLY:nav-ledger",native_profile_ref:"TEST_ONLY:ledger",domain_proof_ref:"TEST_ONLY:domain-proof"};
    const points=[{ts_ms:from,value:"100.000000000000000001"},{ts_ms:from+86_400_000,value:"101.50"}];
    f.doc.precomputed_series=[{binding:{subject_type:"portfolio",subject_id:OWN.portfolio_id,
      tuple_population_digest:managerScorePopulationDigest(f.doc.members.filter(m=>m.tuple.portfolio_id===OWN.portfolio_id)),
      stage_filter:["PAPER"],metric:"NAV",partition,window_start_ms:from,window_end_ms:to},
      series:{unit:"MONEY",currency:"USDT",ratio_scale:null,basis:partition.basis,methodology_ref:"TEST_ONLY:source-nav.v1",points,gaps:[]},
      quality:{completeness:"COMPLETE",freshness:"FRESH",reasons:[]},source_confidence:"VERIFIED",
      provenance:{scope:{workspace_id:f.doc.workspace_id,environment:"paper",profile_id:f.profile,catalogue_digest:f.doc.catalogue_digest},
        source_revision:f.doc.revision,source_set_digest:f.doc.source_set_digest,source_qualification:"SOURCE_VERIFIED",
        input_digest:accessDigest("TEST_ONLY:original-ledger"),calculation_revision:"TEST_ONLY:calc",policy_revision:"TEST_ONLY:series-policy",source_as_of_ms:to}}];
    expect(await f.controller.read(f.request,{...f.query(),subjects:JSON.stringify([SUBJECTS[1]])},f.reply)).toBeUndefined();
    const body=JSON.parse(f.sent[0].toString());expect(body.series).toHaveLength(1);
    expect(body.series[0]).toMatchObject({state:"AVAILABLE",points,unit:"MONEY",currency:"USDT",methodology_ref:"TEST_ONLY:source-nav.v1"});
    expect(f.ordinaryAuthorize).not.toHaveBeenCalled();expect(f.ordinaryDeliver).not.toHaveBeenCalled();
  });
  it("native Paper cannot escape through direct detached read() or missing raw transport",async()=>{
    const f=fixture(),q={...f.query(),subjects:SUBJECTS};
    await expect(f.service.read(f.principal,q)).rejects.toMatchObject({code:"EXECUTION_READ_AUTHORITY_UNAVAILABLE",status:503});
    await expect(f.controller.read(f.request,f.query())).rejects.toMatchObject({status:503});
    expect(f.repository.head).not.toHaveBeenCalled();expect(f.composition).not.toHaveBeenCalled();
  });
  it("does not let a second Paper profile borrow the pinned default's native authority",async()=>{
    const f=fixture(),extra="TEST_ONLY:paper-second";
    Object.assign(f.runtime,{profilesFor:()=>[extra,f.profile]});
    const q={...f.query(1),profile_id:extra};
    expect(f.service.shouldUseNativeCurrent(f.principal,{...q,subjects:SUBJECTS.slice(0,1)})).toBe(false);
    await expect(f.service.readNative(f.principal,{...q,subjects:SUBJECTS.slice(0,1)},{} as ServerResponse)).rejects.toMatchObject({status:503});
    expect(f.repository.head).not.toHaveBeenCalled();
    // No ordinary authority was installed in this vector: route through that
    // independent check and refuse, never borrow the native CURRENT provider.
    await expect(f.controller.read(f.request,q,f.reply)).rejects.toMatchObject({status:503});
    expect(f.ordinaryAuthorize).toHaveBeenCalledWith(expect.anything(),{environment:"paper",profileId:extra},expect.anything());
    expect(f.composition).not.toHaveBeenCalled();expect(f.reply.hijack).not.toHaveBeenCalled();
  });
  it("applies the same exact profile routing and direct native-entry guard to finite Manager datasets",async()=>{
    const f=fixture(),extra="TEST_ONLY:paper-second";
    Object.assign(f.runtime,{profilesFor:()=>[extra,f.profile]});
    const model=new ManagerModelService({} as Pool,f.ordinaryScopes,f.config,f.runtime,new NativeCurrentAccountScopes(f.scopes));
    const repository=(model as unknown as {repository:{head:(...args:unknown[])=>Promise<unknown>}}).repository;
    const head=vi.spyOn(repository,"head").mockResolvedValue(f.head);
    const controller=new ManagerModelController(model,{canReadExecution:async()=>true} as never);
    expect(model.shouldUseNativeCurrent(f.principal,{environment:"paper"})).toBe(true);
    expect(model.shouldUseNativeCurrent(f.principal,{environment:"paper",profile_id:f.profile})).toBe(true);
    expect(model.shouldUseNativeCurrent(f.principal,{environment:"paper",profile_id:extra})).toBe(false);
    await expect(model.readNativeManager(f.principal,{environment:"paper",profile_id:extra},"FLEET",undefined,{} as ServerResponse,()=>{})).rejects.toMatchObject({status:503});
    await expect(model.read(f.principal,"FLEET",{environment:"paper"})).rejects.toMatchObject({status:503});
    expect(head).not.toHaveBeenCalled();
    await expect(controller.fleet(f.request,{environment:"paper",profile_id:extra},f.reply)).rejects.toMatchObject({status:503});
    expect(f.ordinaryAuthorize).toHaveBeenCalledWith(expect.anything(),{environment:"paper",profileId:extra},expect.anything());
    expect(f.composition).not.toHaveBeenCalled();expect(f.reply.hijack).not.toHaveBeenCalled();
  });
  it("serves an explicitly installed second Paper through ordinary scopes, with exact profile output",async()=>{
    const f=fixture(false),extra="TEST_ONLY:paper-second";
    Object.assign(f.runtime,{profilesFor:()=>[extra,f.profile]});f.doc.profile_id=extra;
    const body=await f.controller.read(f.request,{...f.query(1),profile_id:extra});
    expect(body?.profile_id).toBe(extra);expect(f.repository.document).toHaveBeenCalledWith(f.principal.workspaceId,"paper",extra,f.head.revision);
    expect(f.composition).not.toHaveBeenCalled();
  });
  it("retains all ordinary Series purposes through the final shared DB cut, including a late sibling revoke",async()=>{
    // TEST_ONLY authority/source ports: real minted scopes, no PG/qualification.
    const f=fixture(false),domain={profile_id:f.profile,catalogue_sha256:"a".repeat(64),profile_sha256:"b".repeat(64),field_policy_sha256:"c".repeat(64)};
    const deadline=Date.now()+60_000,actor={user_id:f.principal.user.userId,session_id:f.principal.session.sessionId,session_generation:1};
    const decision={schema_version:"portal.ordinary-profile-read-decision.v1",actor,workspace_id:f.principal.workspaceId,
      environment:"paper",domain,field_policy_ref:"TEST_ONLY:ordinary-fields",fingerprint:accessDigest("TEST_ONLY:ordinary-decision"),
      valid_until_ms:deadline,head_revision:"TEST_ONLY:ordinary-head",grant_id:"TEST_ONLY:ordinary-grant",grant_revision:"TEST_ONLY:ordinary-grant-r1"} as OrdinaryProfileReadDecision;
    const db={query:vi.fn(async()=>({rows:[{role:"USER",session_version:1,policy:null,policy_revision:null,policy_seen:false,
      workspace_exists:true,member:true,owner:false,retained:[]}]}))} as unknown as Pool;
    let revoked=false;
    const confirmMany=vi.fn(async(decisions:readonly OrdinaryProfileReadDecision[])=>{
      // The final coordinator cut sees a revoke after body/source awaits. A
      // sequence of single-purpose confirmations must not stand in for it.
      if(decisions.length===SUBJECTS.length)revoked=true;
      return revoked?null:{assertCurrent:()=>{if(revoked)throw Error("TEST_ONLY:revoked");}};
    });
    const ordinary={usesPool:(candidate:unknown)=>candidate===db,read:vi.fn(async()=>structuredClone(decision)),confirmMany} as unknown as
      Pick<OrdinaryProfileAuthority,"read"|"confirmMany"|"usesPool">;
    const publication=vi.fn(async(request:ExecutionReadPublicationRequest)=>({...await f.access.readPublication(request),qualification:"SOURCE_VERIFIED",
      manager_domain:{environment:"paper",domain,field_policy_ref:decision.field_policy_ref}}));
    const scopes=new ExecutionReadScopes(db,{readPublication:publication,hasNativeCurrentRelations:()=>false} as unknown as ExecutionAccessService,f.config,ordinary);
    const service=new ManagerSeriesService({} as Pool,scopes,f.config,f.runtime);
    const repository=(service as unknown as {repository:{head:(...args:unknown[])=>Promise<unknown>;document:(...args:unknown[])=>Promise<unknown>}}).repository;
    vi.spyOn(repository,"head").mockResolvedValue(f.head);const doc=vi.spyOn(repository,"document").mockResolvedValue(f.doc);
    await expect(service.read(f.principal,{environment:"paper",metric:"NAV",window:"30D",subjects:SUBJECTS}))
      .rejects.toMatchObject({code:"EXECUTION_READ_ACCESS_CHANGED",status:409});
    expect(doc).toHaveBeenCalledOnce();expect(confirmMany.mock.calls.at(-1)?.[0]).toHaveLength(SUBJECTS.length);
    expect(f.composition).not.toHaveBeenCalled();expect(f.sent).toHaveLength(0);
  });
  it("refuses an unknown or invalid profile before a repository/native source read",async()=>{
    const f=fixture();
    await expect(f.controller.read(f.request,{...f.query(1),profile_id:"TEST_ONLY:not-installed"},f.reply)).rejects.toMatchObject({status:404});
    await expect(f.controller.read(f.request,{...f.query(1),profile_id:42},f.reply)).rejects.toMatchObject({status:400});
    expect(f.repository.head).not.toHaveBeenCalled();expect(f.composition).not.toHaveBeenCalled();
  });
  it("keeps ordinary uninstalled Paper compatibility and refuses uninstalled explicit native entry",async()=>{
    const f=fixture(false);const body=await f.controller.read(f.request,f.query(1));
    expect(body?.series).toHaveLength(1);expect(f.composition).not.toHaveBeenCalled();expect(f.reply.hijack).not.toHaveBeenCalled();
    await expect(f.service.readNative(f.principal,{...f.query(1),subjects:SUBJECTS.slice(0,1)},{} as ServerResponse)).rejects.toMatchObject({status:503});
  });
  it("preserves closed subject uniqueness/count checks before a publication/source read",async()=>{
    const f=fixture();for(const subjects of [[SUBJECTS[1],SUBJECTS[1]],[],[...SUBJECTS,SUBJECTS[1]]])
      await expect(f.controller.read(f.request,{...f.query(),subjects:JSON.stringify(subjects)},f.reply)).rejects.toMatchObject({status:400});
    expect(f.repository.head).not.toHaveBeenCalled();expect(f.composition).not.toHaveBeenCalled();
  });
  it("a revoke on the LAST purpose cannot borrow first-purpose authority at final send",async()=>{
    const f=fixture();f.setFinal(contexts=>contexts.map((context,index)=>index===contexts.length-1?{
      ...context,grants:context.grants.map(grant=>grant.action==="alpha.read"?{...grant,revoked_at_ms:NOW-1}:grant)}:context));
    await expect(f.controller.read(f.request,f.query(),f.reply)).rejects.toMatchObject({code:"EXECUTION_READ_ACCESS_CHANGED",status:409});
    expect(f.repository.document).toHaveBeenCalledOnce();expect(f.sent).toHaveLength(0);expect(f.reply.hijack).not.toHaveBeenCalled();
  });
  it.each(["payload","generation"])("a publication %s moving AFTER body preparation is checked again after source ENTER",async changed=>{
    const f=fixture();let calls=0;
    vi.mocked(f.repository.head).mockImplementation(async()=>++calls<3?f.head:{...f.head,...(changed==="payload"?
      {payload_digest:accessDigest("TEST_ONLY:moved")}:{projection_generation:"TEST_ONLY:new-generation"})});
    await expect(f.controller.read(f.request,f.query(),f.reply)).rejects.toMatchObject({code:"EXECUTION_READ_ACCESS_CHANGED",status:409});
    expect(f.order).toEqual(["build","enter"]);expect(f.sent).toHaveLength(0);expect(f.reply.hijack).not.toHaveBeenCalled();
  });
  it("checks an economic mapping synchronously at dispatch with no post-final await",async()=>{
    const f=fixture();f.setFinal(contexts=>{f.expireEconomic();return contexts;});
    await expect(f.controller.read(f.request,f.query(),f.reply)).rejects.toMatchObject({code:"EXECUTION_READ_ACCESS_CHANGED",status:409});
    expect(f.sent).toHaveLength(0);expect(f.reply.hijack).not.toHaveBeenCalled();
  });
  it("rejects an accidentally async beforeDispatch callback instead of hiding a post-final async gap",async()=>{
    const f=fixture();await expect(f.service.readNative(f.principal,{...f.query(1),subjects:SUBJECTS.slice(0,1)},{} as ServerResponse,
      (async()=>{}) as unknown as ()=>void)).rejects.toMatchObject({status:503});expect(f.sent).toHaveLength(0);
  });
  it("does not send a second framework response when original settlement fails after native dispatch",async()=>{
    const f=fixture();f.composition.mockImplementationOnce(async(...args)=>{args[7]?.beforeDispatch?.();throw Error("TEST_ONLY:ACK-lost");});
    expect(await f.controller.read(f.request,f.query(),f.reply)).toBeUndefined();
    expect(f.raw.destroy).toHaveBeenCalledOnce();expect(f.reply.hijack).toHaveBeenCalledOnce();
  });
});

describe("native multi-scope closure (genuine minted scopes, synthetic contexts)",()=>{
  async function scopes(f:ReturnType<typeof fixture>){
    const binding={environment:"paper" as const,profileId:f.profile};
    const a=await f.scopes.authorize(f.principal,binding,{action:"portfolio.read",resource:{kind:"PORTFOLIO",id:OWN.portfolio_id},dataset:f.dataset});
    const b=await f.scopes.authorize(f.principal,binding,{action:"portfolio.read",resource:{kind:"PORTFOLIO",id:PRIVATE.portfolio_id},dataset:f.dataset});
    return[a,b];
  }
  it("rejects a reconstructed/foreign issuer scope and duplicate/oversized closure before port I/O",async()=>{
    const f=fixture(),a=await scopes(f),other=fixture(),b=await scopes(other),read=vi.fn(async()=>Buffer.from('{}'));
    for(const candidates of [[{...a[0]} as AuthorizedExecutionReadScope],[a[0],b[0]],[a[0],a[0]],[],[...a,...a,a[0]]])
      await expect(f.scopes.deliverNativeTogether(candidates,{} as ServerResponse,read)).rejects.toBeInstanceOf(ExecutionReadScopeError);
    expect(f.composition).not.toHaveBeenCalled();expect(read).not.toHaveBeenCalled();
  });
  it("rejects same-issuer scopes with a different session/workspace/profile/publication closure",async()=>{
    const f=fixture(),a=await scopes(f),binding={environment:"paper" as const,profileId:f.profile};
    for(const [principal,b,dataset] of [
      [{...f.principal,session:{...f.principal.session,sessionId:"TEST_ONLY:another-session"}},binding,f.dataset],
      [{...f.principal,viewerWorkspaceId:"TEST_ONLY:another-viewer-workspace"},binding,f.dataset],
      [f.principal,{...binding,profileId:"TEST_ONLY:another-profile"},f.dataset],
      [f.principal,binding,{...f.dataset,source_revision:"TEST_ONLY:another-publication"}],
    ] as const){
      const bScope=await f.scopes.authorize(principal,b,{action:"portfolio.read",resource:{kind:"PORTFOLIO",id:PRIVATE.portfolio_id},dataset});
      await expect(f.scopes.deliverNativeTogether([a[0],bScope],{} as ServerResponse,async()=>Buffer.from('{}')))
        .rejects.toMatchObject({code:"EXECUTION_READ_ACCESS_CHANGED",status:409});
    }
    expect(f.composition).not.toHaveBeenCalled();
  });
  it("requires every delivered context in the original order; a later resource loss gives zero output",async()=>{
    const f=fixture(),a=await scopes(f);
    f.setFinal(contexts=>contexts.slice(0,1));
    await expect(f.scopes.deliverNativeTogether(a,{} as ServerResponse,async()=>Buffer.from('{}'))).rejects.toMatchObject({status:503});
    f.setFinal(contexts=>contexts.map((context,index)=>index===1?{...context,
      relationsFor:id=>({...context.relationsFor(id),member_portfolio_ids:[],revision:"TEST_ONLY:later-cut-revoked"})}:context));
    await expect(f.scopes.deliverNativeTogether(a,{} as ServerResponse,async()=>Buffer.from('{}')))
      .rejects.toMatchObject({code:"EXECUTION_READ_ACCESS_CHANGED",status:409});
    expect(f.sent).toHaveLength(0);
  });
  it("keeps detached delivery forbidden when a native source is installed",async()=>{
    const f=fixture(),a=await scopes(f),read=vi.fn(async()=>({TEST_ONLY:"must-not-return"}));
    await expect(f.scopes.deliver(a[0],read)).rejects.toMatchObject({status:503});expect(read).not.toHaveBeenCalled();
  });
});

describe("native composition application flag and old-provider compatibility",()=>{
  it.each([undefined,false,true])("owns TEST_ONLY flag for every purpose when constructor flag is %s",async flag=>{
    const f=fixture(),pool={} as Pool,contexts=[{...f.context,allow_test_only:true},{...f.context,allow_test_only:true}];
    const port:NativeCurrentRelationsPort={usesPool:target=>target===pool,observe:async()=>new Map(),sendFinite:vi.fn(async()=>{}),
      sendFiniteComposition:async input=>{await input.build(contexts);input.assertAllowed(contexts);}};
    const access=new ExecutionAccessService(pool,{} as AuthService,{...unqualifiedAccessTrust,currentRelations:port},flag);
    const seen:AccessEvaluationContext[][]=[],check=(current:readonly AccessEvaluationContext[])=>{seen.push([...current]);
      expect(current.map(c=>c.allow_test_only)).toEqual([flag===true,flag===true]);};
    await access.deliverNativeCurrentComposition({user_id:f.principal.user.userId,session_id:f.principal.session.sessionId,session_generation:1},
      f.principal.workspaceId,[{action:"portfolio.read",resources:[{kind:"PORTFOLIO",id:OWN.portfolio_id}]},
        {action:"alpha.read",resources:[{kind:"ALPHA",id:OWN.alpha_id}]}],accessDigest("TEST_ONLY:scope"),{} as ServerResponse,
      async current=>{check(current);return Buffer.from('{}');},check);
    expect(seen).toHaveLength(2);expect(contexts.map(c=>c.allow_test_only)).toEqual([true,true]);
    expect(port.sendFinite).not.toHaveBeenCalled();
  });
  it("an old single-purpose provider is not silently used for a mixed-purpose response",async()=>{
    const f=fixture(),pool={} as Pool,send=vi.fn(async()=>{}),port:NativeCurrentRelationsPort={usesPool:target=>target===pool,
      observe:async()=>new Map(),sendFinite:send};
    const access=new ExecutionAccessService(pool,{} as AuthService,{...unqualifiedAccessTrust,currentRelations:port});
    await expect(access.deliverNativeCurrentComposition({user_id:f.principal.user.userId,session_id:f.principal.session.sessionId,session_generation:1},
      f.principal.workspaceId,[{action:"portfolio.read",resources:[{kind:"PORTFOLIO",id:OWN.portfolio_id}]}],accessDigest("TEST_ONLY:scope"),
      {} as ServerResponse,async()=>Buffer.from('{}'),()=>{})).rejects.toMatchObject({code:"SOURCE_RELATION_NOT_QUALIFIED",status:503});
    expect(send).not.toHaveBeenCalled();
  });
});
