/** Actual named-reader/scopes/calculator components; SYNTHETIC TEST_ONLY
 * authority and in-memory immutable SQL rows. NOT PG/HTTP/source qualification. */
import "reflect-metadata";
import type {Pool} from "pg";
import {describe,expect,it,vi} from "vitest";
import {accessDigest} from "../src/execution-v2/access-policy";
import {BUSINESS_READ_FIELDS} from "../src/execution-v2/read-fields";
import {managerModelDocument,type ManagerModelDocument,type ManagerMember} from "../src/execution-v2/manager-model.contract";
import {managerScorePopulationDigest} from "../src/execution-v2/manager-score-publication";
import {managerScorePublication} from "../src/execution-v2/manager-score-publication.contract";
import {ManagerScoreRuntime,type ManagerScoreRuntimeTask} from "../src/execution-v2/manager-score-runtime";
import {ManagerScoreRevisionService} from "../src/execution-v2/manager-score-revision.service";
import {ManagerScoreRevisionController} from "../src/execution-v2/manager-score-revision.controller";
import {managerScoreRevisionQuery,managerScoreRevisionView} from "../src/execution-v2/manager-score-revision.contract";
import {productReadFixture,OWN,PEER,PRIVATE} from "./elp2-product-read.fixture";

const now=1_800_000_000_000;
const partition={economic_domain:"PAPER" as const,currency:"USDT",basis:"SYNTHETIC:basis",
  native_profile_ref:"SYNTHETIC:native",domain_proof_ref:"SYNTHETIC:domain"};
async function fixture(fields:string[]=[...BUSINESS_READ_FIELDS]){
  const f=productReadFixture({fields});
  const member=(tuple:typeof OWN):ManagerMember=>({tuple,stage:"PAPER",name:tuple.alpha_id,
    owner_user_id:null,lifecycle:null,venue:null,health:null,source_state:null,binding_ref:null,
    assignment_revision:"SYNTHETIC:assignment",owner_revision:"SYNTHETIC:owner",binding_revision:"SYNTHETIC:binding",
    valid_from_ms:now-1000,valid_to_ms:null});
  const d:ManagerModelDocument={schema_version:"portal.execution.manager-model-input.v1",workspace_id:f.principal.workspaceId,
    environment:"paper",profile_id:f.config.EXECUTION_EDGE_PAPER_PROFILE_ID,qualification:"SOURCE_VERIFIED",
    family_id:"alpha_fleet_overview",revision:"SYNTHETIC:source-r1",supersedes_revision:null,source_epoch:"SYNTHETIC:epoch",
    source_sequence:"1",projection_generation:"SYNTHETIC:retained-generation",catalogue_digest:accessDigest("SYNTHETIC:catalogue"),
    source_set_digest:accessDigest([OWN,PEER,PRIVATE]),as_of_ms:now-100,recorded_through_ms:now-90,
    facts_through_ms:now-100,observed_at_ms:now,source_quality:{completeness:"COMPLETE",freshness:"STALE",reasons:[]},
    members:[member(OWN),member(PEER),member(PRIVATE)],facts:[]};
  const worker=new ManagerScoreRuntime({maximum_observations:100,maximum_blocks:10,maximum_stress_subperiods:100,
    maximum_input_bytes:65536,maximum_in_flight:1});
  const compute=async(subject:string)=>{
    const population=d.members.filter(m=>m.tuple.alpha_id===subject);
    const task:ManagerScoreRuntimeTask={scope:{workspace_id:d.workspace_id,environment:d.environment,profile_id:d.profile_id,
      catalogue_digest:d.catalogue_digest},binding:{subject_type:"alpha",subject_id:subject,
      tuple_population_digest:managerScorePopulationDigest(population),partition_digest:accessDigest(partition),stage_filter:["PAPER"],
      window_start_ms:now-1000,window_end_ms:now-100,comparable_basis_id:"SYNTHETIC:basis",individual_evidence_binding_id:`SYNTHETIC:ledger:${subject}`},
      source_revision:d.revision,source_set_digest:d.source_set_digest,source_qualification:"SOURCE_VERIFIED",calculation_revision:"SYNTHETIC:calc",
      computed_at_ms:now,expected_policy_revision:null,policy:null,input:{kind:"METRICS",quality:{
        comparable_basis_id:"SYNTHETIC:basis",individual_evidence_binding_id:`SYNTHETIC:ledger:${subject}`,
        window_start_ms:now-1000,window_end_ms:now-100,as_of_ms:d.as_of_ms,observed_duration_ms:900,currency:"USDT",
        required_costs_complete:true,stale:false,data_valid:true,sample_count:10,complete_block_count:2,
        metrics:{net_excess_twr:"0.06",sharpe_period:"0.12",mdd:"0.04",add:"0.01",positive_block_ratio:"0.75",stress_excess_twr:"0.045"}}}};
    const result=await worker.calculate(task),{preview:_private,...quality}=result.quality;
    return managerScorePublication.parse({slot:"RAW",quality,raw_metrics:result.raw_metrics,provenance:result.provenance});
  };
  d.precomputed_scores=[await compute(OWN.alpha_id),await compute(PEER.alpha_id)];
  const stored=new Map<string,ManagerModelDocument>([[d.revision,managerModelDocument.parse(d)]]);
  let headRevision=d.revision;
  const pool={query:vi.fn(async(sql:string,parameters?:unknown[])=>{
    if(sql.startsWith("BEGIN")||sql==="COMMIT"||sql==="ROLLBACK"||sql.startsWith("SELECT set_config"))return {rows:[]};
    if(sql.includes("count(*)::text AS count")&&sql.includes("execution_manager_calculation_revisions"))
      return {rows:[{count:"0",bytes:"0"}]};
    if(sql.includes("execution_manager_calculation_revisions")||sql.includes("execution_manager_score_mode_heads"))return {rows:[]};
    if(sql.includes("execution_manager_model_heads")){
      const row=stored.get(headRevision);return {rows:row?[{revision:row.revision,source_epoch:row.source_epoch,source_sequence:row.source_sequence,
        projection_generation:row.projection_generation,payload_digest:accessDigest(row),catalogue_digest:row.catalogue_digest}]:[]};
    }
    if(sql.includes("execution_manager_model_revisions")){
      const row=stored.get(String(parameters?.[3]));
      return {rows:row?[{payload:structuredClone(row),payload_digest:accessDigest(row)}]:[]};
    }
    throw new Error("UNEXPECTED_SQL");
  })};
  // Real history-store transaction protocol against EMPTY synthetic retained
  // inventory. This is not PostgreSQL or an immutable-custody qualification.
  const client={query:pool.query,release:vi.fn(),on:vi.fn(),removeListener:vi.fn()};
  Reflect.set(pool,"connect",vi.fn(async()=>client));
  const service=new ManagerScoreRevisionService(pool as unknown as Pool,f.scopes,f.config);
  const q={environment:"paper",surface:"ALPHA",id:OWN.alpha_id,economic_partition:partition,
    stage_filter:["PAPER"],source_selector:"CURRENT_HEAD",revision_mode:"ORIGINAL_AS_PUBLISHED"};
  return {...f,d,stored,pool,service,worker,q,setHead:(revision:string)=>{headRevision=revision;}};
}

describe("R06 named historical Score reads (synthetic component proof only)",()=>{
  it("returns exact own ORIGINAL pending fact without current-score freshness/policy relabeling or peer details",async()=>{
    const f=await fixture(),calculate=vi.spyOn(f.worker,"calculate");
    const view=await f.service.read(f.principal,f.q);
    expect(managerScoreRevisionView.safeParse(view).success).toBe(true);
    expect(view).toMatchObject({revision_mode:"ORIGINAL_AS_PUBLISHED",purpose:"HISTORICAL_ANALYSIS_ONLY",operational_current:false,
      knowledge_cutoff_ms:null,knowledge_cutoff_reason:"ORIGINAL_KNOWLEDGE_CUTOFF_NOT_RECORDED",
      computed_at_ms:null,computed_at_reason:"ORIGINAL_COMPUTE_TIMES_ARE_PER_ENTRY",eligibility:{policy_current:false,policy_state:"UNKNOWN"}});
    expect(view.score_details).toHaveLength(1);
    expect(view.score_details[0]).toMatchObject({binding:{subject_id:OWN.alpha_id},availability:"NOT_PUBLISHED",
      feed_freshness:{availability:"NOT_PUBLISHED",reason_code:"ORIGINAL_FEED_FRESHNESS_NOT_RECORDED"},
      score:{computed_at_ms:now,quality:{status:"policy_pending",value:null}}});
    expect(JSON.stringify(view)).not.toContain(`SYNTHETIC:ledger:${PEER.alpha_id}`);
    expect(JSON.stringify(view)).not.toContain(f.d.source_set_digest);
    expect(JSON.stringify(view)).not.toContain(accessDigest(f.d));
    expect(calculate).not.toHaveBeenCalled();
  });
  it("loads RETAINED_REVISION using its own exact source/generation/catalogue, never today's head",async()=>{
    const f=await fixture();
    const next={...structuredClone(f.d),revision:"SYNTHETIC:new-head",source_sequence:"2",supersedes_revision:f.d.revision,
      projection_generation:"SYNTHETIC:other-generation",catalogue_digest:accessDigest("SYNTHETIC:other-catalogue")};
    f.stored.set(next.revision,next);f.setHead(next.revision);
    const view=await f.service.read(f.principal,{...f.q,source_selector:"RETAINED_REVISION",source_revision:f.d.revision});
    expect(view.source.source_revision).toBe(f.d.revision);
    expect(view.eligibility.economic_source).toBe("RETAINED_EXACT_REVISION");
    expect(f.pool.query.mock.calls.some(([sql])=>sql.includes("execution_manager_model_heads"))).toBe(false);
    for(const [request] of f.access.readPublication.mock.calls)expect(request.binding).toMatchObject({
      source_revision:f.d.revision,projection_generation:f.d.projection_generation,catalogue_revision:f.d.catalogue_digest});
  });
  it("uses the same finite404 for unknown and hidden exact references",async()=>{
    const f=await fixture();
    for(const q of [{...f.q,id:PEER.alpha_id},{...f.q,source_selector:"RETAINED_REVISION",source_revision:"SYNTHETIC:unknown"}])
      await expect(f.service.read(f.principal,q)).rejects.toMatchObject({code:"EXECUTION_READ_NOT_AVAILABLE",status:404});
  });
  it("requires approved score/provenance fields before selected entry projection",async()=>{
    for(const omitted of ["score","provenance_ref"]){
      const f=await fixture(BUSINESS_READ_FIELDS.filter(field=>field!==omitted));
      await expect(f.service.read(f.principal,f.q)).rejects.toMatchObject({code:"EXECUTION_READ_NOT_AVAILABLE",status:404});
    }
  });
  it("does not turn researcher linked-portfolio access into Fund or shared portfolio totals",async()=>{
    const f=await fixture();
    for(const q of [{...f.q,surface:"FUND",id:undefined},{...f.q,surface:"PORTFOLIO",id:OWN.portfolio_id}])
      await expect(f.service.read(f.principal,q)).rejects.toMatchObject({code:"EXECUTION_READ_NOT_AVAILABLE",status:404});
  });
  it("still requires current provider attestation of the requested retained binding",async()=>{
    const f=await fixture();f.access.readPublication.mockImplementation(async request=>{throw new Error(`SYNTHETIC_UNATTESTED:${request.binding.source_revision}`);});
    await expect(f.service.read(f.principal,{...f.q,source_selector:"RETAINED_REVISION",source_revision:f.d.revision}))
      .rejects.toMatchObject({code:"EXECUTION_READ_AUTHORITY_UNAVAILABLE",status:503});
  });
  it("rechecks exact retained bytes and refuses an unexpected row removal after the load",async()=>{
    const f=await fixture(),base=f.pool.query.getMockImplementation()!;
    f.pool.query.mockImplementation(async(sql,parameters)=>{
      const result=await base(sql,parameters);
      if(sql.includes("SELECT payload,payload_digest"))f.stored.delete(f.d.revision);
      return result;
    });
    await expect(f.service.read(f.principal,{...f.q,source_selector:"RETAINED_REVISION",source_revision:f.d.revision}))
      .rejects.toMatchObject({code:"EXECUTION_READ_ACCESS_CHANGED",status:409});
  });
  it("denies delivery if the actual current grant is revoked during final provider I/O",async()=>{
    const f=await fixture(),base=f.access.readPublication.getMockImplementation()!,sqlBase=f.pool.query.getMockImplementation()!;
    let headReads=0,finalDelivery=false,revoked=false;
    f.pool.query.mockImplementation(async(sql,parameters)=>{
      const result=await sqlBase(sql,parameters);
      if(sql.includes("execution_manager_model_heads")&&++headReads===2)finalDelivery=true;
      return result;
    });
    f.access.readPublication.mockImplementation(async request=>{
      const value=await base(request);
      // The callback's exact-source recheck has completed. This is the final
      // delivery mint's actual provider I/O, not a guessed microtask count.
      if(finalDelivery&&!revoked){revoked=true;f.context.grants=f.context.grants.filter(grant=>grant.action!=="alpha.read");}
      return value;
    });
    await expect(f.service.read(f.principal,f.q)).rejects.toMatchObject({code:"EXECUTION_READ_ACCESS_CHANGED",status:409});
  });
  it("reports missing optional custody/coordinator honestly without inventing RESTATED K/value",async()=>{
    const f=await fixture();
    const view=await f.service.read(f.principal,{...f.q,revision_mode:"RESTATED_CURRENT_POLICY"});
    expect(view).toMatchObject({availability:"NOT_PUBLISHED",reason_codes:["RESTATEMENT_NOT_PUBLISHED"],score_details:[],
      knowledge_cutoff_ms:null,knowledge_cutoff_reason:"RESTATEMENT_NOT_PUBLISHED",computed_at_ms:null,
      computed_at_reason:"RESTATEMENT_NOT_PUBLISHED",eligibility:{policy_current:false,policy_state:"UNKNOWN"}});
  });
  it("enumerates ORIGINAL source fact even when optional retained custody is absent",async()=>{
    const f=await fixture(),view=await f.service.history(f.principal,{...f.q,limit:20});
    expect(view).toMatchObject({availability:"AVAILABLE",reason_code:null,
      page:{returned_count:1,authorized_total_count:1,next_cursor:null,previous_cursor:null}});
    expect(view.items).toHaveLength(1);
    expect(view.items[0]).toMatchObject({revision_mode:"ORIGINAL_AS_PUBLISHED",purpose:"HISTORICAL_ANALYSIS_ONLY",
      operational_current:false,availability:"NOT_PUBLISHED",score_details:[{binding:{subject_id:OWN.alpha_id},
        score:{quality:{status:"policy_pending",value:null}}}]});
  });
  it("rejects ambiguous source selection, cross-environment stages and client calibration fields",()=>{
    const q={environment:"paper",surface:"ALPHA",id:OWN.alpha_id,economic_partition:partition,
      source_selector:"CURRENT_HEAD",revision_mode:"ORIGINAL_AS_PUBLISHED"};
    for(const invalid of [{...q,source_revision:"SYNTHETIC:r"},{...q,source_selector:"RETAINED_REVISION"},
      {...q,stage_filter:["LIVE"]},{...q,stage_filter:["PAPER","PAPER"]},{...q,policy_current:true}])
      expect(managerScoreRevisionQuery.safeParse(invalid).success).toBe(false);
  });
  it("controller normalizes only finite own-data HTTP query values and retains explicit workspace",async()=>{
    const f=await fixture(),workspaces={canReadExecution:vi.fn(async()=>true)};
    const controller=new ManagerScoreRevisionController(f.service,workspaces as never);
    const request={portalUser:f.principal.user,portalSession:f.principal.session,portalWorkspaceId:f.principal.workspaceId} as never;
    const view=await controller.view(request,{...f.q,economic_partition:JSON.stringify(partition),stage_filter:"PAPER",workspace_id:f.principal.workspaceId});
    expect(view.workspace_id).toBe(f.principal.workspaceId);
    expect(workspaces.canReadExecution).toHaveBeenCalledWith(f.principal.workspaceId,f.principal.user.userId);
    let invoked=0;
    const bad=Object.defineProperty({},"environment",{enumerable:true,get(){invoked++;return "paper";}});
    await expect(controller.view(request,bad)).rejects.toMatchObject({status:400});expect(invoked).toBe(0);
    const array=Object.defineProperty(["PAPER"],"0",{enumerable:true,get(){invoked++;return "PAPER";}});
    await expect(controller.view(request,{...f.q,economic_partition:JSON.stringify(partition),stage_filter:array})).rejects.toMatchObject({status:400});
    expect(invoked).toBe(0);
  });
  it("sanitizes operational workspace lookup failure as503, not invalid-client400",async()=>{
    const f=await fixture(),read=vi.spyOn(f.service,"read");
    const controller=new ManagerScoreRevisionController(f.service,{canReadExecution:vi.fn(async()=>{throw new Error("PRIVATE DB DETAIL");})} as never);
    const request={portalUser:f.principal.user,portalSession:f.principal.session,portalWorkspaceId:f.principal.workspaceId} as never;
    await expect(controller.view(request,{...f.q,economic_partition:JSON.stringify(partition),stage_filter:"PAPER"}))
      .rejects.toMatchObject({code:"EXECUTION_READ_AUTHORITY_UNAVAILABLE",status:503});
    expect(read).not.toHaveBeenCalled();
  });
});
