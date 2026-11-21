/** Component correctness tests. Actual BFF/current scope/cursor components;
 * SYNTHETIC TEST_ONLY authority and post-decoder history snapshots only.
 * Not PG, mounted HTTP, source/custody/worker calculation qualification.
 * Numeric fixtures exercise projection, not the economic formula or RAW proof.
 */
import "reflect-metadata";
import type {Pool} from "pg";
import {afterEach,describe,expect,it,vi} from "vitest";
import {accessDigest} from "../src/execution-v2/access-policy";
import {BUSINESS_READ_FIELDS} from "../src/execution-v2/read-fields";
import {managerModelDocument,type ManagerModelDocument,type ManagerMember} from "../src/execution-v2/manager-model.contract";
import {managerCompositionPublication,managerCompositionResult,type ManagerCompositionBinding,
  type ManagerCompositionPublication} from "../src/execution-v2/manager-composition-publication.contract";
import {managerScorePopulationDigest} from "../src/execution-v2/manager-score-publication";
import {managerScorePublication,type ManagerScorePublication} from "../src/execution-v2/manager-score-publication.contract";
import {ManagerScoreRuntime} from "../src/execution-v2/manager-score-runtime";
import {ManagerCompositionHistoricalRuntime} from "../src/execution-v2/manager-composition-restatement";
import type {ManagerScoreRestatementSnapshot,ManagerScoreRestatementV1Snapshot,
  ManagerScoreRestatementV2Snapshot} from "../src/execution-v2/manager-score-restatement";
import type {ManagerScoreHistorySnapshot,ManagerScoreHistoryStore} from "../src/execution-v2/manager-score-history.store";
import {ManagerScoreRevisionService} from "../src/execution-v2/manager-score-revision.service";
import {managerScoreRevisionHistory,managerScoreRevisionView,managerScoreRevisionQuery,
  managerScoreRevisionHistoryQuery} from "../src/execution-v2/manager-score-revision.contract";
import {productReadFixture,OWN,PEER,PRIVATE} from "./elp2-product-read.fixture";

const partition={economic_domain:"PAPER" as const,currency:"USDT",basis:"SYNTHETIC:basis",
  native_profile_ref:"SYNTHETIC:native",domain_proof_ref:"SYNTHETIC:domain"};
type Status="available"|"partial_coverage"|"no_allocation";
type FixtureOptions={full?:boolean;fields?:string[];empty?:boolean;emptyPublication?:boolean;root?:boolean;portfolio?:boolean;
  coverage?:"COMPLETE_FOR_DATASET_WINDOW"|"PARTIAL";original?:boolean;status?:Status};

function fixture(options:FixtureOptions={}){
  const f=productReadFixture({full:options.full??true,fields:options.fields??[...BUSINESS_READ_FIELDS]});
  const asOf=Date.now()-60_000;
  const member=(tuple:typeof OWN):ManagerMember=>({tuple,stage:"PAPER",name:tuple.alpha_id,owner_user_id:null,
    lifecycle:null,venue:null,health:null,source_state:null,binding_ref:null,assignment_revision:"SYNTHETIC:assignment",
    owner_revision:"SYNTHETIC:owner",binding_revision:"SYNTHETIC:binding",valid_from_ms:asOf-1000,valid_to_ms:null});
  const d:ManagerModelDocument={schema_version:"portal.execution.manager-model-input.v1",workspace_id:f.principal.workspaceId,
    environment:"paper",profile_id:f.config.EXECUTION_EDGE_PAPER_PROFILE_ID,qualification:"SOURCE_VERIFIED",
    family_id:"alpha_fleet_overview",revision:"SYNTHETIC:composition-history-source",supersedes_revision:null,
    source_epoch:"SYNTHETIC:epoch",source_sequence:"1",projection_generation:"SYNTHETIC:generation",
    catalogue_digest:accessDigest("SYNTHETIC:catalogue"),source_set_digest:accessDigest([OWN,PEER,PRIVATE]),
    as_of_ms:asOf,recorded_through_ms:asOf,facts_through_ms:asOf,observed_at_ms:asOf,
    source_quality:{completeness:"COMPLETE",freshness:"STALE",reasons:[]},
    members:options.empty?[]:[member(OWN),member(PEER),member(PRIVATE)],facts:[]};
  const binding=(surface:"FUND"|"PORTFOLIO",id?:string):ManagerCompositionBinding=>({
    subject_type:surface==="FUND"?"manager_book":"portfolio",subject_id:id??d.workspace_id,
    tuple_population_digest:managerScorePopulationDigest(d.members.filter(m=>surface==="FUND"||m.tuple.portfolio_id===id)),
    partition_digest:accessDigest(partition),stage_filter:["PAPER"],window_start_ms:asOf-1000,window_end_ms:asOf,
    comparable_basis_id:"SYNTHETIC:basis",individual_evidence_binding_id:"SYNTHETIC:allocation-evidence"});
  const result=(b:ManagerCompositionBinding,status:Status)=>{
    const ids=status==="no_allocation"?[]:[...new Set(d.members.filter(m=>b.subject_type==="manager_book"||
      m.tuple.portfolio_id===b.subject_id).map(m=>m.tuple.alpha_id))];
    const available=status==="available",empty=status==="no_allocation";
    return managerCompositionResult.parse({value:available?"80":null,status,
      reason_codes:empty?["NO_ALLOCATION"]:available?[]:["RAW_SCORE_NOT_PUBLISHED"],band_code:available?"good":null,
      weight_basis:"allocated_economic_capital",allocation_snapshot_id:"SYNTHETIC:PRIVATE-allocation-snapshot",
      total_allocated_capital:empty?"0":"100",score_coverage_allocated:empty?null:available?"1":"0",
      unscored_allocated_weight:empty?null:available?"0":"1",provisional_allocated_weight:empty?null:"0",
      mature_allocated_weight:empty?null:available?"1":"0",allocation_coverage_nav:null,scored_nav_weight:null,
      idle_cash_weight:null,nav_coverage_reason:"NAV_PARTITION_NOT_PUBLISHED",bounds:status==="partial_coverage"?{lower:"0",upper:"100"}:null,
      contributions:ids.map(subject_id=>({subject_id,allocation_weight:ids.length===2?"0.5":"1",value:available?"80":null,band_code:null})),
      diagnostics:{allocation_hhi:null,score_contribution_hhi:null,score_dispersion:null,reason_codes:["GROUPING_NOT_PUBLISHED"]}});
  };
  const publication=(b:ManagerCompositionBinding,status:Status):ManagerCompositionPublication=>{
    const r=result(b,status);
    return managerCompositionPublication.parse({slot:"COMPOSITION",result:r,provenance:{
      scope:{workspace_id:d.workspace_id,environment:d.environment,profile_id:d.profile_id,catalogue_digest:d.catalogue_digest},
      binding:b,source_revision:d.revision,source_set_digest:d.source_set_digest,source_as_of_ms:asOf,
      source_qualification:"SOURCE_VERIFIED",input_digest:accessDigest(["SYNTHETIC:original-input",b]),
      calculation_revision:"SYNTHETIC:original-composition-worker",computed_at_ms:asOf+1,
      allocation_artifact_sha256:accessDigest("SYNTHETIC:PRIVATE-allocation-bytes"),allocation_revision:"SYNTHETIC:allocation-r1",
      ownership_manifest_ref:"SYNTHETIC:PRIVATE-ownership",full_accounting_manifest_ref:"SYNTHETIC:PRIVATE-full-accounting",
      allocation_effective_at_ms:asOf-10,approval_ref:"SYNTHETIC:NOT_OWNER_APPROVAL",approved_at_ms:asOf-20,
      valid_until_ms:Date.now()+300_000,raw_score_refs:r.contributions.filter(row=>row.value!==null).map(row=>({
        subject_id:row.subject_id,publication_digest:accessDigest(["SYNTHETIC:source-raw",row.subject_id])}))}});
  };
  if(options.original!==false){
    const status=options.status??(options.empty?"no_allocation":"available");
    d.precomputed_compositions=[publication(binding("FUND"),status),publication(binding("PORTFOLIO",PRIVATE.portfolio_id),status)];
  }
  const document=managerModelDocument.parse(d);
  if(options.empty||options.coverage){
    const upstream=f.access.readPublication.getMockImplementation()!;
    f.access.readPublication.mockImplementation(async request=>{
      const current=await upstream(request);
      if(!options.empty||options.emptyPublication===false)return {...current,population_coverage:options.coverage??current.population_coverage};
      return {...current,population_coverage:options.coverage??"COMPLETE_FOR_DATASET_WINDOW",
        resources:[...(options.root===false?[]:[{kind:"ROOT" as const,id:"root"}]),
          ...(options.portfolio===false?[]:[{kind:"PORTFOLIO" as const,id:PRIVATE.portfolio_id}])],tuples:[],
        current_linkage:{...current.current_linkage,pairs:[]},strategy_lineage:{...current.strategy_lineage,pairs:[]}};
    });
  }
  let headRevision=document.revision;
  const pool={query:vi.fn(async(sql:string,parameters?:unknown[])=>{
    if(sql.includes("execution_manager_model_heads"))return {rows:[{revision:headRevision,source_epoch:document.source_epoch,
      source_sequence:document.source_sequence,projection_generation:document.projection_generation,
      payload_digest:accessDigest(document),catalogue_digest:document.catalogue_digest}]};
    if(sql.includes("execution_manager_model_revisions"))return {rows:String(parameters?.[3])===document.revision?
      [{payload:structuredClone(document),payload_digest:accessDigest(document)}]:[]};
    throw new Error("SYNTHETIC_UNEXPECTED_SQL");
  })};
  const service=new ManagerScoreRevisionService(pool as unknown as Pool,f.scopes,f.config);
  const store=Reflect.get(service,"historyStore") as ManagerScoreHistoryStore;
  const scan=vi.spyOn(store,"scan"),unchanged=vi.spyOn(store,"unchanged").mockResolvedValue(true);
  const source={workspace_id:d.workspace_id,environment:d.environment,profile_id:d.profile_id,revision:d.revision,
    payload_digest:accessDigest(document),qualification:d.qualification,source_epoch:d.source_epoch,source_sequence:d.source_sequence,
    projection_generation:d.projection_generation,catalogue_digest:d.catalogue_digest,source_set_digest:d.source_set_digest,as_of_ms:asOf};
  const base=(index:number,prior:string|null):ManagerScoreRestatementV1Snapshot=>({
    schema_version:"portal.execution.manager-score-restatement.v1",revision_mode:"RESTATED_CURRENT_POLICY",
    purpose:"HISTORICAL_ANALYSIS_ONLY",operational_current:false,source,
    original_custody_key:accessDigest("SYNTHETIC:PRIVATE-original-key"),original_inputs_digest:accessDigest("SYNTHETIC:PRIVATE-original-inputs"),
    policy:{identity_digest:accessDigest("SYNTHETIC:policy:"+index),method_digest:accessDigest("SYNTHETIC:method"),
      policy_revision:"SYNTHETIC:policy:"+index,stress_delta_bps:"5",approved_at_ms:asOf+100,valid_until_ms:Date.now()+300_000},
    calculation_revision:"SYNTHETIC:raw-worker",input_method_revision:"SYNTHETIC:method-wrapper",
    knowledge_cutoff_ms:asOf+index*1000,computed_at_ms:asOf+index*1000+1,entries:[],
    calculation_key:accessDigest("SYNTHETIC:PRIVATE-calculation:"+index),supersedes_calculation_key:prior});
  const revision=(index:number,id=PRIVATE.portfolio_id,prior:string|null=null,status:Status="partial_coverage"):ManagerScoreRestatementV2Snapshot=>{
    const v=base(index,prior),b=binding("PORTFOLIO",id),r=result(b,status),{qualification:_qualification,...workerSource}=source;
    const child:ManagerScoreRestatementV2Snapshot["composition_entries"][number]={binding:b,
      allocation_custody_digest:accessDigest(["SYNTHETIC:PRIVATE-child-custody",id]),historical:{
        schema_version:"portal.execution.manager-composition-restatement-worker.v1",revision_mode:"RESTATED_CURRENT_POLICY",
        purpose:"HISTORICAL_ANALYSIS_ONLY",operational_current:false,source:workerSource,binding:b,
        original_custody_key:v.original_custody_key,original_inputs_digest:v.original_inputs_digest,
        allocation_custody_digest:accessDigest(["SYNTHETIC:PRIVATE-child-custody",id]),
        original_publication_digest:accessDigest(["SYNTHETIC:PRIVATE-original-publication",id]),
        original_computed_at_ms:asOf+1,captured_at_ms:asOf+2,
        allocation_artifact_sha256:accessDigest("SYNTHETIC:PRIVATE-allocation-bytes"),allocation_revision:"SYNTHETIC:allocation-r1",
        allocation_effective_at_ms:asOf-10,policy:v.policy,calculation_revision:"SYNTHETIC:dependent-worker",
        knowledge_cutoff_ms:v.knowledge_cutoff_ms,computed_at_ms:v.computed_at_ms,checked_at_ms:v.computed_at_ms,
        raw_inputs:r.contributions.map(row=>({subject_id:row.subject_id,original_input_digest:null,entry_digest:null,
          disposition:"UNSCORED",reason_code:"RAW_EXACT_BINDING_NOT_RETAINED"})),
        derived_input_digest:accessDigest(["SYNTHETIC:PRIVATE-derived",index,id]),
        derivation_context_digest:accessDigest(["SYNTHETIC:PRIVATE-context",index,id]),result:r}};
    return {...v,schema_version:"portal.execution.manager-score-restatement.v2",
      composition_worker_schema_version:"portal.execution.manager-composition-restatement-worker.v1",
      composition_calculation_revision:"SYNTHETIC:dependent-worker",composition_entries:[child]};
  };
  let revisions:ManagerScoreRestatementSnapshot[]=[];
  const snapshot=(items:ManagerScoreRestatementSnapshot[]):ManagerScoreHistorySnapshot=>({document,original:null,
    regime_restatements:[],regime_restated_head_key:null,
    restatements:structuredClone(items),original_head_key:null,restated_head_key:items.at(-1)?.calculation_key??null,
    snapshot_digest:accessDigest(items)});
  scan.mockImplementation(async()=>snapshot(revisions));
  const q={environment:"paper",surface:"PORTFOLIO",id:PRIVATE.portfolio_id,metric_family:"COMPOSITION",
    economic_partition:partition,stage_filter:["PAPER"],source_selector:"CURRENT_HEAD",revision_mode:"RESTATED_CURRENT_POLICY"};
  const set=(items:ManagerScoreRestatementSnapshot[])=>{revisions=structuredClone(items);};
  const chain=()=>{const a=revision(1),legacy=base(2,a.calculation_key),hidden=revision(3,OWN.portfolio_id,legacy.calculation_key),
    b=revision(4,PRIVATE.portfolio_id,hidden.calculation_key);set([a,legacy,hidden,b]);return {a,legacy,hidden,b};};
  return {...f,document,pool,service,scan,unchanged,q,revision,base,set,snapshot,chain,
    changeHead:()=>{headRevision="SYNTHETIC:new-current-source";}};
}
type Fixture=ReturnType<typeof fixture>;
/** Synthetic source publication only: tests BFF correlation, not policy,
 * source commissioning, economic formula or custody qualification. */
function originalRaw(f:Fixture):ManagerScorePublication{
  const p=f.document.precomputed_compositions![1],b=p.provenance.binding;
  return managerScorePublication.parse({slot:"RAW",quality:{formula_id:"qbts_prb_v1_1",qualification:"RUNTIME_APPROVED",
    status:"available",reason_codes:[],value:"80",band_code:"good",components:null,normalized_points:null,
    atomic_contributions:null,bounds:null,policy_id:"SYNTHETIC:raw-policy",policy_hash:accessDigest("SYNTHETIC:raw-policy"),
    approved_policy_id:"SYNTHETIC:NOT_OWNER_APPROVAL",comparable_basis_id:b.comparable_basis_id,
    individual_evidence_binding_id:"SYNTHETIC:raw-evidence"},raw_metrics:null,provenance:{
    scope:structuredClone(p.provenance.scope),binding:{...structuredClone(b),subject_type:"alpha",subject_id:OWN.alpha_id,
      tuple_population_digest:managerScorePopulationDigest(f.document.members.filter(m=>
        m.tuple.portfolio_id===PRIVATE.portfolio_id&&m.tuple.alpha_id===OWN.alpha_id)),
      individual_evidence_binding_id:"SYNTHETIC:raw-evidence"},source_revision:f.document.revision,
    source_set_digest:f.document.source_set_digest,source_qualification:"SOURCE_VERIFIED",
    input_digest:accessDigest("SYNTHETIC:private-raw-input"),calculation_revision:"SYNTHETIC:raw-worker",
    computed_at_ms:p.provenance.computed_at_ms,source_as_of_ms:f.document.as_of_ms,
    policy_id:"SYNTHETIC:raw-policy",policy_hash:accessDigest("SYNTHETIC:raw-policy"),policy_revision:"SYNTHETIC:raw-r1",
    config_hash:accessDigest("SYNTHETIC:raw-config"),formula_hash:accessDigest("SYNTHETIC:raw-formula"),
    approval_ref:"SYNTHETIC:NOT_OWNER_APPROVAL",approved_at_ms:f.document.as_of_ms-100,
    policy_valid_until_ms:f.document.as_of_ms+10}});
}
function attachOriginalRaw(f:Fixture,raw:ManagerScorePublication):void{
  f.document.precomputed_scores=[managerScorePublication.parse(raw)];
  f.document.precomputed_compositions![1].provenance.raw_score_refs=[{
    subject_id:OWN.alpha_id,publication_digest:accessDigest(f.document.precomputed_scores[0])}];
}
const read=(f:Fixture,extra:Record<string,unknown>={})=>f.service.read(f.principal,{...f.q,...extra});
const page=(f:Fixture,extra:Record<string,unknown>={})=>f.service.history(f.principal,{...f.q,limit:1,...extra});
afterEach(()=>vi.restoreAllMocks());

describe("R06 Composition public BFF — synthetic post-decoder scope components only",()=>{
  it("reads ORIGINAL direct actual135 without optional custody and HMACs private allocation identifiers",async()=>{
    const f=fixture(),result=await read(f,{revision_mode:"ORIGINAL_AS_PUBLISHED"});
    expect(managerScoreRevisionView.safeParse(result).success).toBe(true);
    expect(result).toMatchObject({availability:"AVAILABLE",purpose:"HISTORICAL_ANALYSIS_ONLY",operational_current:false,
      computed_at_ms:null,knowledge_cutoff_ms:null,score_details:[],composition:{availability:"AVAILABLE",result:{value:"80",status:"available"}}});
    if(result.composition.availability==="NOT_PUBLISHED")throw new Error("EXPECTED_COMPOSITION");
    for(const ref of [result.composition.allocation_ref,result.composition.original_publication_ref,
      result.composition.result.allocation_snapshot_id])expect(ref).toMatch(/^sha256:[a-f0-9]{64}$/);
    const serialized=JSON.stringify(result),p=f.document.precomputed_compositions![1];
    for(const value of [p.result.allocation_snapshot_id,p.provenance.allocation_artifact_sha256,
      accessDigest(p),p.provenance.approval_ref,p.provenance.ownership_manifest_ref,p.provenance.full_accounting_manifest_ref])
      expect(serialized).not.toContain(value);
    expect(result.composition.raw_dependencies[0]).toMatchObject({availability:"NOT_PUBLISHED",
      reason_codes:["ORIGINAL_ROW_REASON_NOT_RECORDED"],original_input_ref:null,derived_input_ref:null});
  });
  it("projects original partial coverage without converting a missing RAW result to zero or available",async()=>{
    const f=fixture({status:"partial_coverage"}),result=await read(f,{revision_mode:"ORIGINAL_AS_PUBLISHED"});
    expect(result).toMatchObject({availability:"PARTIAL",score_details:[],composition:{availability:"PARTIAL",
      result:{value:null,status:"partial_coverage",bounds:{lower:"0",upper:"100"},score_coverage_allocated:"0"}}});
  });
  it("refuses an original foreign contribution before publishing a value or opaque RAW reference",async()=>{
    const f=fixture(),p=f.document.precomputed_compositions![1];
    p.result.contributions[0].subject_id=PEER.alpha_id;
    p.provenance.raw_score_refs[0].subject_id=PEER.alpha_id;
    // Valid closed shape is insufficient: binding still names only PRIVATE's
    // own alpha/version population, while this row belongs to another target.
    expect(managerCompositionPublication.safeParse(p).success).toBe(true);
    for(const operation of [read,page])await expect(operation(f,{revision_mode:"ORIGINAL_AS_PUBLISHED"}))
      .rejects.toMatchObject({code:"EXECUTION_READ_NOT_AVAILABLE",status:404});
  });
  it("refuses original contributions in a verified-empty target rather than disclosing a foreign row",async()=>{
    const f=fixture({empty:true}),p=f.document.precomputed_compositions![1],populated=fixture().document.precomputed_compositions![1];
    p.result=structuredClone(populated.result);p.provenance.raw_score_refs=structuredClone(populated.provenance.raw_score_refs);
    expect(managerCompositionPublication.safeParse(p).success).toBe(true);
    await expect(read(f,{revision_mode:"ORIGINAL_AS_PUBLISHED"})).rejects.toMatchObject({status:404});
  });
  it("refuses a future ORIGINAL computation without imposing today's allocation/policy expiry",async()=>{
    const f=fixture(),p=f.document.precomputed_compositions![1];
    p.provenance.computed_at_ms=Date.now()+60_000;p.provenance.valid_until_ms=p.provenance.computed_at_ms+60_000;
    expect(managerCompositionPublication.safeParse(p).success).toBe(true);
    await expect(read(f,{revision_mode:"ORIGINAL_AS_PUBLISHED"})).rejects.toMatchObject({status:404});
  });
  it("publishes an exact original qualified RAW reference even after the original policy and allocation expire",async()=>{
    const f=fixture(),p=f.document.precomputed_compositions![1],raw=originalRaw(f);
    p.provenance.valid_until_ms=f.document.as_of_ms+20;attachOriginalRaw(f,raw);
    expect(raw.provenance.policy_valid_until_ms!).toBeLessThan(Date.now());
    expect(p.provenance.valid_until_ms).toBeLessThan(Date.now());
    const value=await read(f,{revision_mode:"ORIGINAL_AS_PUBLISHED"});
    expect(value.composition).toMatchObject({raw_dependencies:[{subject_id:OWN.alpha_id,availability:"AVAILABLE",
      reason_codes:[],original_input_ref:expect.stringMatching(/^sha256:[a-f0-9]{64}$/),derived_input_ref:null}]});
    expect(JSON.stringify(value)).not.toContain(raw.provenance.input_digest);
  });
  it.each([
    ["subject",(r:ManagerScorePublication)=>{r.provenance.binding.subject_id=PEER.alpha_id;}],
    ["version-population",(r:ManagerScorePublication)=>{r.provenance.binding.tuple_population_digest=accessDigest("SYNTHETIC:other-version");}],
    ["slot",(r:ManagerScorePublication)=>{r.slot="DIRECT_NAV";}],
    ["stage",(r:ManagerScorePublication)=>{r.provenance.binding.stage_filter=["SANDBOX"];}],
    ["window",(r:ManagerScorePublication)=>{r.provenance.binding.window_start_ms--;}],
    ["partition",(r:ManagerScorePublication)=>{r.provenance.binding.partition_digest=accessDigest("SYNTHETIC:other-partition");}],
    ["basis",(r:ManagerScorePublication)=>{r.provenance.binding.comparable_basis_id="SYNTHETIC:other-basis";
      r.quality.comparable_basis_id=r.provenance.binding.comparable_basis_id;}],
    ["quality-basis",(r:ManagerScorePublication)=>{r.quality.comparable_basis_id="SYNTHETIC:other-basis";}],
    ["quality-evidence",(r:ManagerScorePublication)=>{r.quality.individual_evidence_binding_id="SYNTHETIC:other-evidence";}],
    ["source-revision",(r:ManagerScorePublication)=>{r.provenance.source_revision="SYNTHETIC:other-revision";}],
    ["source-set",(r:ManagerScorePublication)=>{r.provenance.source_set_digest=accessDigest("SYNTHETIC:other-source-set");}],
    ["source-asof",(r:ManagerScorePublication)=>{r.provenance.source_as_of_ms--;}],
    ["workspace",(r:ManagerScorePublication)=>{r.provenance.scope.workspace_id="SYNTHETIC:other-workspace";}],
    ["environment",(r:ManagerScorePublication)=>{r.provenance.scope.environment="sandbox";}],
    ["profile",(r:ManagerScorePublication)=>{r.provenance.scope.profile_id="SYNTHETIC:other-profile";}],
    ["catalogue",(r:ManagerScorePublication)=>{r.provenance.scope.catalogue_digest=accessDigest("SYNTHETIC:other-catalogue");}],
    ["after-composition",(r:ManagerScorePublication)=>{r.provenance.computed_at_ms++;}],
    ["before-source",(r:ManagerScorePublication)=>{r.provenance.computed_at_ms=r.provenance.source_as_of_ms-1;}],
    ["missing-numeric",(r:ManagerScorePublication)=>{r.quality.status="policy_pending";r.quality.value=null;r.quality.band_code=null;}],
    ["unqualified",(r:ManagerScorePublication)=>{r.quality.status="policy_pending";r.quality.value=null;
      r.quality.band_code=null;r.quality.qualification="TEST_ONLY";r.provenance.source_qualification="TEST_ONLY";}],
  ] satisfies [string,(raw:ManagerScorePublication)=>void][])("treats resolved but mismatched RAW %s exactly like an absent reference",async(_name,mutate)=>{
    const f=fixture(),raw=originalRaw(f);mutate(raw);attachOriginalRaw(f,raw);
    const value=await read(f,{revision_mode:"ORIGINAL_AS_PUBLISHED"});
    expect(value.composition).toMatchObject({raw_dependencies:[{subject_id:OWN.alpha_id,availability:"NOT_PUBLISHED",
      reason_codes:["ORIGINAL_ROW_REASON_NOT_RECORDED"],original_input_ref:null,derived_input_ref:null}]});
    expect(JSON.stringify(value)).not.toContain(raw.provenance.input_digest);
  });
  it("selects own v2 child before count/ref/predecessor and skips v1 and other-portfolio-only nodes",async()=>{
    const f=fixture(),c=f.chain(),result=await page(f,{limit:50});
    expect(managerScoreRevisionHistory.safeParse(result).success).toBe(true);
    expect(result.page).toMatchObject({returned_count:2,authorized_total_count:2,next_cursor:null,previous_cursor:null});
    expect(result.items.map(item=>item.computed_at_ms)).toEqual([c.b.computed_at_ms,c.a.computed_at_ms]);
    expect(result.items.every(item=>item.score_details.length===0&&item.composition.availability==="PARTIAL")).toBe(true);
    expect(result.items[0].supersedes_revision_ref).toBe(result.items[1].revision_ref);
    const original=await read(f,{revision_mode:"ORIGINAL_AS_PUBLISHED"});
    expect(result.items[1].supersedes_revision_ref).toBe(original.revision_ref);
    expect(result.items[0]).toMatchObject({composition:{raw_dependencies:[{subject_id:OWN.alpha_id,
      availability:"NOT_PUBLISHED",reason_codes:["RAW_EXACT_BINDING_NOT_RETAINED"],original_input_ref:null,derived_input_ref:null}]}});
    const serialized=JSON.stringify(result);
    for(const value of [c.legacy.calculation_key,c.hidden.calculation_key,c.a.calculation_key,c.b.calculation_key,
      c.a.original_custody_key,c.a.original_inputs_digest,c.a.policy.identity_digest,
      c.a.composition_entries[0].allocation_custody_digest,c.a.composition_entries[0].historical.derived_input_digest])
      expect(serialized).not.toContain(value);
    for(const key of ["raw_inputs","composition_entries","allocation_custody_digest","original_custody_key","policy_identity_digest"])
      expect(serialized).not.toContain('"'+key+'"');
  });
  it("round-trips opaque forward/back Composition cursors",async()=>{
    const f=fixture();f.chain();const first=await page(f),next=await page(f,{after:first.page.next_cursor}),
      previous=await page(f,{before:next.page.previous_cursor});
    expect(first.items[0].revision_ref).not.toBe(next.items[0].revision_ref);
    expect(previous.items[0].revision_ref).toBe(first.items[0].revision_ref);
    expect(first.page.authorized_total_count).toBe(2);expect(next.page.next_cursor).toBeNull();
  });
  it("binds cursor to family/limit/target and rejects public-ref crossover to default SCORE",async()=>{
    const f=fixture();f.chain();const first=await page(f),token=first.page.next_cursor;
    for(const extra of [{metric_family:"SCORE"},{limit:2},{id:OWN.portfolio_id}])
      await expect(page(f,{after:token,...extra})).rejects.toMatchObject({status:409});
    await expect(read(f,{metric_family:"SCORE",revision_ref:first.items[0].revision_ref})).rejects.toMatchObject({status:404});
  });
  it("preserves omitted/default SCORE refs and response bytes when explicit SCORE is selected",async()=>{
    const f=fixture();f.chain();const {metric_family:_family,...score}=f.q;
    expect(await f.service.read(f.principal,score)).toEqual(await read(f,{metric_family:"SCORE"}));
    expect(await f.service.history(f.principal,{...score,limit:1})).toEqual(await page(f,{metric_family:"SCORE"}));
  });
  it("deduplicates unchanged default SCORE facts across a v1 to combined-v2 child without changing old refs",async()=>{
    const f=fixture(),a=f.base(1,null),b=f.revision(2,PRIVATE.portfolio_id,a.calculation_key);
    a.entries=[{slot:"DIRECT_NAV",binding:{subject_type:"portfolio",subject_id:PRIVATE.portfolio_id,
      tuple_population_digest:managerScorePopulationDigest(f.document.members.filter(m=>m.tuple.portfolio_id===PRIVATE.portfolio_id)),
      partition_digest:accessDigest(partition),stage_filter:["PAPER"],window_start_ms:f.document.as_of_ms-1000,
      window_end_ms:f.document.as_of_ms,comparable_basis_id:"SYNTHETIC:basis",individual_evidence_binding_id:"SYNTHETIC:direct-nav"},
      original_input_digest:accessDigest("SYNTHETIC:private-direct-nav"),availability:"NOT_PUBLISHED",
      reason_codes:["METRIC_DEPENDENCIES_NOT_RETAINED"],historical:null}];
    b.entries=structuredClone(a.entries);b.policy=structuredClone(a.policy);
    b.knowledge_cutoff_ms=a.knowledge_cutoff_ms;b.computed_at_ms=a.computed_at_ms;
    for(const child of b.composition_entries){child.historical.policy=structuredClone(a.policy);
      child.historical.knowledge_cutoff_ms=a.knowledge_cutoff_ms;child.historical.computed_at_ms=a.computed_at_ms;
      child.historical.checked_at_ms=a.computed_at_ms;}
    f.set([a]);const before=await read(f,{metric_family:"SCORE"});
    f.set([a,b]);const omitted={...f.q,metric_family:undefined,limit:50},history=await f.service.history(f.principal,omitted);
    expect(history.page).toMatchObject({returned_count:1,authorized_total_count:1});
    expect(history.items[0].revision_ref).toBe(before.revision_ref);
    expect((await read(f,{metric_family:"SCORE",revision_ref:before.revision_ref})).revision_ref).toBe(before.revision_ref);
    expect((await page(f)).page.authorized_total_count).toBe(1);
  });
  it("resolves an old Composition public ref after append and rejects private/unknown key guesses uniformly",async()=>{
    const f=fixture(),a=f.revision(1);f.set([a]);const selected=await read(f);
    const b=f.revision(2,PRIVATE.portfolio_id,a.calculation_key);f.set([a,b]);
    expect((await read(f,{revision_ref:selected.revision_ref})).computed_at_ms).toBe(a.computed_at_ms);
    for(const revision_ref of [a.calculation_key,accessDigest("SYNTHETIC:unknown")])
      await expect(read(f,{revision_ref})).rejects.toMatchObject({code:"EXECUTION_READ_NOT_AVAILABLE",status:404});
  });
  it("uses exact retained source despite a later current head",async()=>{
    const f=fixture();f.set([f.revision(1)]);f.changeHead();
    expect(await read(f,{source_selector:"RETAINED_REVISION",source_revision:f.document.revision}))
      .toMatchObject({eligibility:{economic_source:"RETAINED_EXACT_REVISION"},availability:"PARTIAL"});
  });
  it("keeps missing originals and unmaterialized dependent children typed, not fabricated zero",async()=>{
    const f=fixture({original:false});f.set([f.base(1,null)]);
    for(const revision_mode of ["ORIGINAL_AS_PUBLISHED","RESTATED_CURRENT_POLICY"]){
      expect(await read(f,{revision_mode})).toMatchObject({availability:"NOT_PUBLISHED",score_details:[],
        composition:{availability:"NOT_PUBLISHED",reason_code:"SELECTED_COMPOSITION_REVISION_NOT_PUBLISHED"}});
      expect((await page(f,{revision_mode})).page.authorized_total_count).toBe(0);
    }
  });
  it("accepts independently verified empty FUND and exact PORTFOLIO as no_allocation, never numeric zero score",async()=>{
    const f=fixture({empty:true});
    for(const target of [{surface:"FUND",id:undefined},{surface:"PORTFOLIO",id:PRIVATE.portfolio_id}]){
      const result=await read(f,{...target,revision_mode:"ORIGINAL_AS_PUBLISHED"});
      expect(result).toMatchObject({availability:"PARTIAL",composition:{availability:"PARTIAL",result:{
        status:"no_allocation",value:null,total_allocated_capital:"0",score_coverage_allocated:null,contributions:[]}}});
      expect((await page(f,{...target,revision_mode:"ORIGINAL_AS_PUBLISHED"})).page.authorized_total_count).toBe(1);
    }
  });
  it("projects a verified-empty retained v2 child as no_allocation independently of the original publication",async()=>{
    const f=fixture({empty:true}),v=f.revision(1,PRIVATE.portfolio_id,null,"no_allocation");f.set([v]);
    const value=await read(f),history=await page(f);
    expect(value).toMatchObject({availability:"PARTIAL",knowledge_cutoff_ms:v.knowledge_cutoff_ms,computed_at_ms:v.computed_at_ms,
      score_details:[],composition:{availability:"PARTIAL",raw_dependencies:[],result:{value:null,status:"no_allocation",
        total_allocated_capital:"0",score_coverage_allocated:null,contributions:[]}}});
    expect(history.page.authorized_total_count).toBe(1);
  });
  it("does not mistake hidden nonempty census for a verified empty portfolio",async()=>{
    const f=fixture({full:false,empty:true,emptyPublication:false});
    await expect(read(f,{revision_mode:"ORIGINAL_AS_PUBLISHED"})).rejects.toMatchObject({status:404});
    expect(f.scan).not.toHaveBeenCalled();
  });
  it("requires explicit current ROOT or exact PORTFOLIO proof even for an empty complete population",async()=>{
    for(const [options,target] of [
      [{empty:true,root:false},{surface:"FUND",id:undefined}],
      [{empty:true,portfolio:false},{surface:"PORTFOLIO",id:PRIVATE.portfolio_id}],
    ] satisfies [FixtureOptions,Record<string,unknown>][]){
      const f=fixture(options);
      await expect(read(f,{...target,revision_mode:"ORIGINAL_AS_PUBLISHED"})).rejects.toMatchObject({status:404});
    }
  });
  it("rejects incomplete dataset accounting proof before inventory scan",async()=>{
    const f=fixture({coverage:"PARTIAL"});
    await expect(read(f)).rejects.toMatchObject({code:"EXECUTION_READ_PUBLICATION_NOT_QUALIFIED",status:503});
    expect(f.scan).not.toHaveBeenCalled();
  });
  it("does not let researcher whitelists grant a financial aggregate or omitted allocation/balance fields",async()=>{
    for(const field of ["allocation","balance_total","score","provenance_ref"]){
      const f=fixture({full:false,fields:BUSINESS_READ_FIELDS.filter(value=>value!==field)});
      await expect(read(f)).rejects.toMatchObject({status:404});expect(f.scan).not.toHaveBeenCalled();
    }
  });
  it("denies wrong workspace and invalid family targets before scan",async()=>{
    const f=fixture();
    await expect(read(f,{workspace_id:"SYNTHETIC:other-workspace"})).rejects.toMatchObject({status:404});
    for(const surface of ["ALPHA","ACCOUNT","DEPLOYMENT"]){
      expect(managerScoreRevisionQuery.safeParse({...f.q,surface}).success).toBe(false);
      expect(managerScoreRevisionHistoryQuery.safeParse({...f.q,surface,limit:1}).success).toBe(false);
      await expect(read(f,{surface})).rejects.toMatchObject({status:400});
    }
    expect(f.scan).not.toHaveBeenCalled();
  });
  it("rechecks actual business grant after final asynchronous source inventory verification",async()=>{
    const f=fixture();f.set([f.revision(1)]);
    const upstream=f.access.readPublication.getMockImplementation()!;let finishing=false,revoked=false;
    f.unchanged.mockImplementation(async()=>{finishing=true;return true;});
    f.access.readPublication.mockImplementation(async request=>{
      const value=await upstream(request);
      if(finishing&&!revoked){revoked=true;f.context.grants=f.context.grants.filter(grant=>grant.action!=="business.read_all");}
      return value;
    });
    await expect(page(f)).rejects.toMatchObject({code:"EXECUTION_READ_ACCESS_CHANGED",status:409});
    expect(revoked).toBe(true);
  });
  it("does not turn a hidden v1/other-portfolio append into a count, cursor invalidation or existence oracle",async()=>{
    const f=fixture(),a=f.revision(1),b=f.revision(2,PRIVATE.portfolio_id,a.calculation_key);f.set([a,b]);
    const first=await page(f),legacy=f.base(3,b.calculation_key),hidden=f.revision(4,OWN.portfolio_id,legacy.calculation_key);
    f.scan.mockReset().mockResolvedValueOnce(f.snapshot([a,b])).mockResolvedValue(f.snapshot([a,b,legacy,hidden]));
    f.unchanged.mockReset().mockResolvedValueOnce(false).mockResolvedValue(true);
    const next=await page(f,{after:first.page.next_cursor});
    expect(next.page.authorized_total_count).toBe(2);expect(next.items[0].computed_at_ms).toBe(a.computed_at_ms);
    expect(f.scan).toHaveBeenCalledTimes(2);
  });
  it("never calculates or updates source/ACK during either public GET component",async()=>{
    const f=fixture();f.chain();const before=accessDigest(f.document),calculate=vi.spyOn(ManagerScoreRuntime.prototype,"calculate"),
      restated=vi.spyOn(ManagerScoreRuntime.prototype,"calculateRestated"),
      dependent=vi.spyOn(ManagerCompositionHistoricalRuntime.prototype,"calculateHistoricalComposition");
    await read(f,{revision_mode:"ORIGINAL_AS_PUBLISHED"});await read(f);await page(f);
    expect(calculate).not.toHaveBeenCalled();expect(restated).not.toHaveBeenCalled();expect(dependent).not.toHaveBeenCalled();
    expect(accessDigest(f.document)).toBe(before);
    expect(f.pool.query.mock.calls.every(([sql])=>sql.trimStart().startsWith("SELECT"))).toBe(true);
  });
});
