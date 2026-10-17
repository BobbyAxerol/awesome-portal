/** Compiled production constructors + disposable PG, SYNTHETIC configured
 * providers/pins only. This is not source transport, calibration or runtime acceptance. */
import "reflect-metadata";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AppModule } from "../src/app.module";
import { accessDigest } from "../src/execution-v2/access-policy";
import { unqualifiedAccessTrust } from "../src/execution-v2/access-trust";
import type { DelegatedReceiptScope } from "../src/execution-v2/access-delegated-receipt";
import { ExecutionManagerRuntime, type ManagerRuntimeInstallation } from "../src/execution-v2/manager-runtime";
import { loadPublicationCommissioning, qualifyDatasetPublication, withCataloguePublications } from "../src/execution-v2/publication-adapter";
import { EXECUTION_PUBLICATION_CATALOGUE } from "../src/execution-v2/publication-source.generated";
import { ManagerScoreRuntime, loadApprovedManagerScorePolicy, managerScorePolicyHash, managerScorePublicationCurrent, managerScorePublicationPolicyCurrent,
  type ManagerScoreRuntimePolicyArtifact, type ManagerScoreRuntimeTask } from "../src/execution-v2/manager-score-runtime";
import { managerScorePublication, type ManagerScorePublication } from "../src/execution-v2/manager-score-publication.contract";
import { managerScorePopulationDigest } from "../src/execution-v2/manager-score-publication";
import { ManagerModelRepository } from "../src/execution-v2/manager-model.store";
import type { ManagerModelDocument } from "../src/execution-v2/manager-model.contract";
import type { DatasetPublication } from "../src/execution-v2/publication.contract";
import { queryManagerModel } from "../src/execution-v2/manager-model";
import { ManagerModelService } from "../src/execution-v2/manager-model.service";
import { ManagerModelController } from "../src/execution-v2/manager-model.controller";
import { ManagerCompositionRuntime, loadApprovedManagerAllocation, revokeApprovedManagerAllocation,
  managerCompositionPublicationCurrent, managerCompositionPublicationForRead,
  type ManagerAllocationArtifact, type ManagerAllocationApprovalPin,
  type ManagerCompositionRuntimeTask } from "../src/execution-v2/manager-composition-runtime";
import { managerCompositionPublication } from "../src/execution-v2/manager-composition-publication.contract";
import { selectManagerCompositionPublications } from "../src/execution-v2/manager-composition-publication";
import { KeysetCursorCodec } from "../src/query/cursor";
import { BUSINESS_READ_FIELDS } from "../src/execution-v2/read-fields";
import { productReadFixture, OWN, PEER } from "./elp2-product-read.fixture";
import { testConfig } from "./harness";
import { ScopedReplayCursorCodec, ScopedReplayHub, type ScopedNoticeSource } from "../src/execution-v2/realtime";
import type { EdgeScopedNoticeBatch, ScopedReplayBinding, ScopedRealtimeFrame } from "../src/execution-v2/realtime.contract";

const contracts=process.env.PORTAL_CONTRACTS_DIR??resolve(__dirname,"../../../packages/contracts");
const hash=(s:string)=>`sha256:${createHash("sha256").update(s).digest("hex")}`;
const catalogue=EXECUTION_PUBLICATION_CATALOGUE.source_catalogue_digest;
const now=Date.now(), scope={workspace_id:"TEST_ONLY-product-workspace",environment:"paper" as const,profile_id:"PAPER_BINANCE_USDM"};
const bounds={maximum_documents_per_tick:1,maximum_document_bytes:1_048_576,maximum_document_rows:200,
  maximum_tick_ms:5000,source_timeout_ms:1000,transaction_timeout_ms:1000,lease_ttl_ms:2000};
function commissioning() {
  const artifact={schema_version:"portal.execution.publication-commissioning.v1",scope,catalogue_digest:catalogue,
    adapter_id:"SYNTHETIC_NOT_SOURCE_AUTHORITY",family_ids:["alpha_fleet_overview"],purposes:["BUSINESS"],
    receipt_pins:{source_read:"SYNTHETIC:read",transport_trust:"SYNTHETIC:transport",privacy:"SYNTHETIC:privacy",field_policy:"SYNTHETIC:field"}};
  const bytes=JSON.stringify(artifact),pin={artifact_sha256:hash(bytes),adapter_id:artifact.adapter_id,approval_ref:"SYNTHETIC_NOT_OWNER_APPROVAL",
    approved_at_ms:now-10000,valid_until_ms:now+60_000};
  return {artifact,bytes,pin,handle:loadPublicationCommissioning(bytes,pin,now)};
}
function input() {
  const document:ManagerModelDocument={schema_version:"portal.execution.manager-model-input.v1",...scope,qualification:"SOURCE_VERIFIED",
    family_id:"alpha_fleet_overview",revision:"SYNTHETIC:r1",supersedes_revision:null,source_epoch:"SYNTHETIC:epoch",source_sequence:"1",
    projection_generation:"SYNTHETIC:g1",catalogue_digest:catalogue,source_set_digest:accessDigest([OWN]),
    as_of_ms:now-100,recorded_through_ms:now-100,facts_through_ms:now-100,observed_at_ms:now,
    source_quality:{completeness:"COMPLETE",freshness:"FRESH",reasons:[]},members:[{tuple:OWN,stage:"PAPER",name:"Synthetic Alpha",
      owner_user_id:"SYNTHETIC:researcher",lifecycle:"ACTIVE",venue:null,health:null,source_state:null,binding_ref:null,
      assignment_revision:"SYNTHETIC:a",owner_revision:"SYNTHETIC:o",binding_revision:"SYNTHETIC:b",valid_from_ms:now-1000,valid_to_ms:null}],facts:[]};
  const publication=JSON.parse(readFileSync(resolve(contracts,"fixtures/execution-dataset-publication.synthetic.valid.json"),"utf8")).value as DatasetPublication;
  Object.assign(publication,{environment:scope.environment,profile_id:scope.profile_id,family_id:document.family_id,catalogue_digest:catalogue,history_capability:"CURRENT_ONLY",barrier:null,
    issued_at_ms:now-2000,expires_at_ms:now+60_000,source_as_of_ms:document.as_of_ms,observed_at_ms:now});
  for(const key of ["source_read","transport_trust","privacy","field_policy"] as const)publication[key]={qualification:"SOURCE_VERIFIED",receipt_ref:commissioning().artifact.receipt_pins[key]};
  publication.authority={...publication.authority,...scope,qualification:"SOURCE_VERIFIED",tuples:[OWN],resources:[],
    binding:{dataset_id:document.family_id,source_revision:document.revision,projection_generation:document.projection_generation,catalogue_revision:catalogue,window:null}};
  return {document,publication};
}
function scoreTask(document:ManagerModelDocument):ManagerScoreRuntimeTask {
  const q={comparable_basis_id:"SYNTHETIC:basis",individual_evidence_binding_id:"SYNTHETIC:ledger",window_start_ms:now-1000,
    window_end_ms:now-100,as_of_ms:document.as_of_ms,observed_duration_ms:900,currency:"USDT",required_costs_complete:true,stale:false,data_valid:true};
  return {scope:{...scope,catalogue_digest:catalogue},binding:{subject_type:"alpha",subject_id:OWN.alpha_id,
    tuple_population_digest:managerScorePopulationDigest(document.members),partition_digest:hash("SYNTHETIC:partition"),stage_filter:["PAPER"],
    window_start_ms:q.window_start_ms,window_end_ms:q.window_end_ms,comparable_basis_id:q.comparable_basis_id,individual_evidence_binding_id:q.individual_evidence_binding_id},
    source_revision:document.revision,source_set_digest:document.source_set_digest,source_qualification:"SOURCE_VERIFIED",calculation_revision:"SYNTHETIC:calc",
    computed_at_ms:now,expected_policy_revision:"SYNTHETIC:policy-r1",policy:null,input:{kind:"METRICS",quality:{...q,sample_count:10,complete_block_count:2,
      metrics:{net_excess_twr:"0.06",sharpe_period:"0.12",mdd:"0.04",add:"0.01",positive_block_ratio:"0.75",stress_excess_twr:"0.045"}}}};
}
function policy() {
  const artifact:ManagerScoreRuntimePolicyArtifact={schema_version:"portal.execution.manager-score-policy-runtime.v1",scope:{...scope,catalogue_digest:catalogue},
    policy:{formula_id:"qbts_prb_v1_1",qualification:"RUNTIME_APPROVED",policy_id:"SYNTHETIC:policy",policy_hash:hash("unset"),formula_hash:hash("SYNTHETIC:formula"),
      calibration_snapshot_id:"SYNTHETIC:calibration",approved_policy_id:"SYNTHETIC:approval",comparable_basis_id:"SYNTHETIC:basis",duration_key:"SYNTHETIC:window",
      observation_frequency:"1h",calendar:"SYNTHETIC:calendar",timezone:"UTC",currency:"USDT",cash_reference_id:"SYNTHETIC:cash",cost_method:"SYNTHETIC:net",
      required_costs:["fees"],block_manifest_id:"SYNTHETIC:blocks",stress_policy_id:"SYNTHETIC:stress",stress_delta_bps:"5",anchors:{twr:["-0.02","0.08"],sharpe:["0","0.15"],mdd:["0","0.1"],add:["0","0.04"]},
      maturity:{minimum_samples:5,minimum_complete_blocks:2,minimum_duration_ms:100},canonical_decimal_places:12,issued_at_ms:now-20_000,calibration_cutoff_ms:now-21_000},
    runtime_config:{maximum_input_age_ms:60_000,minimum_window_ms:100,maximum_window_ms:10000,grid_method_ref:"SYNTHETIC:grid",flow_adjustment_method_ref:"SYNTHETIC:flows",ownership_method_ref:"SYNTHETIC:ownership",fx_method_ref:"SYNTHETIC:FX"}};
  artifact.policy.policy_hash=managerScorePolicyHash(artifact.policy);const bytes=JSON.stringify(artifact);
  const result=loadApprovedManagerScorePolicy({artifact_bytes:bytes,scope:artifact.scope,as_of_ms:now,
    approval_pin:{artifact_sha256:hash(bytes),policy_id:artifact.policy.policy_id,policy_hash:artifact.policy.policy_hash,formula_hash:artifact.policy.formula_hash,
      approved_policy_id:artifact.policy.approved_policy_id!,policy_revision:"SYNTHETIC:policy-r1",approval_ref:"SYNTHETIC_NOT_OWNER_APPROVAL",approved_at_ms:now-10_000,valid_until_ms:now+60_000,scope:artifact.scope}});
  if(result.status!=="READY")throw new Error(JSON.stringify(result));return result.handle;
}
const scoreRuntime=()=>new ManagerScoreRuntime({maximum_observations:100,maximum_blocks:10,maximum_stress_subperiods:100,maximum_input_bytes:65536,maximum_in_flight:1});

/** SYNTHETIC accounting, calibration and approval pins. Real calculators/worker/
 * PostgreSQL are exercised; this is not a TS/PM authority or HTTP/session receipt. */
function compositionInput(missingPeer=false) {
  const d=input(),first=d.document.members[0];
  d.document.members=[{...first,name:"Synthetic Alpha A"},{...first,tuple:PEER,name:"Synthetic Alpha B",lifecycle:"ARCHIVED"}];
  d.document.source_set_digest=accessDigest([OWN,PEER]);d.publication.authority.tuples=[OWN,PEER];
  const partition={economic_domain:"PAPER" as const,currency:"USDT",basis:"SYNTHETIC:basis",
    native_profile_ref:"SYNTHETIC:native",domain_proof_ref:"SYNTHETIC:domain"};
  d.document.facts=d.document.members.flatMap((m,index)=>(["allocation","current_nav"] as const).map(kind=>({
    fact_id:`SYNTHETIC:${kind}:${m.tuple.alpha_id}`,revision:"SYNTHETIC:fact-r1",source_receipt_ref:"SYNTHETIC:accounting-receipt",
    tuple:m.tuple,partition,economic_account_ref:`SYNTHETIC:economic:${m.tuple.alpha_id}`,
    ownership_partition_ref:`SYNTHETIC:ownership:${m.tuple.alpha_id}`,kind,classification:"ECONOMIC" as const,
    transfer_pair_ref:null,counterpart_portfolio_id:null,effective_at_ms:d.document.as_of_ms,recorded_at_ms:d.document.as_of_ms,
    metric:{value:index===0?"60":"20",unit:"MONEY",currency:"USDT",basis:partition.basis,window:null,
      denominator:null,methodology_ref:"SYNTHETIC:accounting",availability:"AVAILABLE" as const,reason_code:null,
      quality:{completeness:"COMPLETE" as const,freshness:"FRESH" as const,reasons:[]},source_confidence:"VERIFIED" as const,
      provenance_refs:["SYNTHETIC:accounting-receipt"],calculation_revision:"SYNTHETIC:accounting-r1",policy_revision:"SYNTHETIC:accounting-policy"}})));
  const metricSets=[
    {net_excess_twr:"0.07",sharpe_period:"0.135",mdd:"0.01",add:"0.004",positive_block_ratio:"0.9",stress_excess_twr:"0.07"},
    {net_excess_twr:"0.03",sharpe_period:missingPeer?null:"0.075",mdd:"0.05",add:"0.02",positive_block_ratio:"0.5",stress_excess_twr:"0.03"},
    {net_excess_twr:"0.04",sharpe_period:"0.09",mdd:"0.04",add:"0.016",positive_block_ratio:"0.6",stress_excess_twr:"0.04"},
  ];
  const raw=d.document.members.map((m,index)=>{
    const t=scoreTask(d.document);if(t.input.kind!=="METRICS")throw new Error("SYNTHETIC_FIXTURE_KIND");
    t.binding={...t.binding,subject_id:m.tuple.alpha_id,tuple_population_digest:managerScorePopulationDigest([m]),partition_digest:accessDigest(partition)};
    t.input.quality.metrics=metricSets[index];return {slot:"RAW" as const,task:t};
  });
  const binding={...raw[0].task.binding,subject_type:"portfolio" as const,subject_id:OWN.portfolio_id,
    tuple_population_digest:managerScorePopulationDigest(d.document.members),individual_evidence_binding_id:"SYNTHETIC:portfolio-ledger"};
  const direct=scoreTask(d.document);if(direct.input.kind!=="METRICS")throw new Error("SYNTHETIC_FIXTURE_KIND");
  direct.binding=binding;direct.input.quality.individual_evidence_binding_id=binding.individual_evidence_binding_id;
  direct.input.quality.metrics=metricSets[2];
  const population=d.document.members.map(m=>({tuple:m.tuple,stage:m.stage}));
  const artifact:ManagerAllocationArtifact={schema_version:"portal.execution.manager-allocation-approved.v1",
    scope:{...scope,catalogue_digest:catalogue},binding,source_revision:d.document.revision,source_set_digest:d.document.source_set_digest,
    source_as_of_ms:d.document.as_of_ms,source_qualification:"SOURCE_VERIFIED",allocation_snapshot_id:"SYNTHETIC:allocation-snapshot",
    allocation_revision:"SYNTHETIC:allocation-r1",ownership_manifest_ref:"SYNTHETIC:ownership-manifest",
    full_accounting_manifest_ref:"SYNTHETIC:full-accounting-manifest",effective_at_ms:d.document.as_of_ms,
    currency:"USDT",maximum_source_age_ms:60_000,population,
    rows:raw.map((r,index)=>({subject_id:r.task.binding.subject_id,allocated_economic_capital:index===0?"60":"20",
      economic_ownership_ids:[`SYNTHETIC:ownership:${r.task.binding.subject_id}`],population:[population[index]],raw_binding:r.task.binding})),
    grouping:null,nav_partition:{revision:"SYNTHETIC:nav-r1",manifest_ref:"SYNTHETIC:nav-manifest",as_of_ms:d.document.as_of_ms,
      currency:"USDT",comparable_basis_id:binding.comparable_basis_id,nav:"100",idle_cash:"20",other_nav:"0",
      rows:[{subject_id:OWN.alpha_id,current_nav_allocated_capital:"60"},{subject_id:PEER.alpha_id,current_nav_allocated_capital:"20"}]}};
  const bytes=JSON.stringify(artifact),pin:ManagerAllocationApprovalPin={artifact_sha256:hash(bytes),scope:artifact.scope,
    binding_digest:accessDigest(binding),source_revision:artifact.source_revision,source_set_digest:artifact.source_set_digest,
    source_as_of_ms:artifact.source_as_of_ms,allocation_revision:artifact.allocation_revision,ownership_manifest_ref:artifact.ownership_manifest_ref,
    full_accounting_manifest_ref:artifact.full_accounting_manifest_ref,approval_ref:"SYNTHETIC_NOT_OWNER_ALLOCATION_APPROVAL",
    approved_at_ms:now-10_000,valid_until_ms:now+30_000,grouping_pin:null,
    nav_pin:{artifact_digest:accessDigest(artifact.nav_partition),approval_ref:"SYNTHETIC_NOT_OWNER_NAV_APPROVAL",
      approved_at_ms:now-10_000,valid_until_ms:now+30_000}};
  const loaded=loadApprovedManagerAllocation({artifact_bytes:bytes,approval_pin:pin,scope:artifact.scope,as_of_ms:now});
  if(loaded.status!=="READY")throw new Error(JSON.stringify(loaded));
  const task:Omit<ManagerCompositionRuntimeTask,"allocation"|"raw_scores">={scope:artifact.scope,binding,
    source_revision:artifact.source_revision,source_set_digest:artifact.source_set_digest,source_as_of_ms:artifact.source_as_of_ms,
    source_qualification:"SOURCE_VERIFIED",calculation_revision:"SYNTHETIC:composition-calc-r1",computed_at_ms:now};
  return {d,artifact,pin,handle:loaded.handle,task,scoreTasks:[...raw,{slot:"DIRECT_NAV" as const,task:direct}]};
}
function compositionInstallation(fx:ReturnType<typeof compositionInput>,acknowledge=async()=>{}) {
  const state:{allocation:typeof fx.handle|null;policy:ReturnType<typeof policy>|null}={allocation:fx.handle,policy:policy()};
  const scoreTasks=vi.fn(async()=>fx.scoreTasks),compositionTasks=vi.fn(async()=>[fx.task]);
  const installation:ManagerRuntimeInstallation={trust:unqualifiedAccessTrust,cadence_ms:1000,maximum_publication_reads:1,
    partitions:[{scope,commissioning:commissioning().handle,bounds,publication:async()=>fx.d.publication,
      source:{read:async()=>structuredClone(fx.d),recheck:async()=>({}),acknowledge},
      score:{runtime:scoreRuntime(),maximum_tasks_per_revision:3,currentPolicy:()=>state.policy,tasks:scoreTasks},
      composition:{runtime:new ManagerCompositionRuntime({maximum_rows:10,maximum_input_bytes:65536,maximum_in_flight:1}),
        maximum_tasks_per_revision:1,currentAllocation:()=>state.allocation,tasks:compositionTasks}}]};
  return {installation,state,scoreTasks,compositionTasks};
}
function compositionReader(fx:ReturnType<typeof compositionInput>,full=true,fields=[...BUSINESS_READ_FIELDS] as string[]) {
  const f=productReadFixture({full,fields}),original=f.access.readPublication.getMockImplementation()!;
  f.access.readPublication.mockImplementation(async request=>{
    const value=await original(request);return {...value,tuples:fx.d.document.members.map(m=>m.tuple),
      current_linkage:{...value.current_linkage,pairs:fx.d.document.members.map(m=>({alpha_id:m.tuple.alpha_id,portfolio_id:m.tuple.portfolio_id}))}};
  });return f;
}
function compositionCandidate(fx:ReturnType<typeof compositionInput>,artifact=structuredClone(fx.artifact)) {
  const bytes=JSON.stringify(artifact),pin:ManagerAllocationApprovalPin={...structuredClone(fx.pin),artifact_sha256:hash(bytes),
    scope:artifact.scope,binding_digest:accessDigest(artifact.binding),source_revision:artifact.source_revision,
    source_set_digest:artifact.source_set_digest,source_as_of_ms:artifact.source_as_of_ms,allocation_revision:artifact.allocation_revision,
    ownership_manifest_ref:artifact.ownership_manifest_ref,full_accounting_manifest_ref:artifact.full_accounting_manifest_ref,
    grouping_pin:artifact.grouping===null?null:{artifact_digest:accessDigest(artifact.grouping),approval_ref:"SYNTHETIC_NOT_OWNER_GROUPING_APPROVAL",
      approved_at_ms:now-10_000,valid_until_ms:fx.pin.valid_until_ms},
    nav_pin:artifact.nav_partition===null?null:{artifact_digest:accessDigest(artifact.nav_partition),approval_ref:"SYNTHETIC_NOT_OWNER_NAV_APPROVAL",
      approved_at_ms:now-10_000,valid_until_ms:fx.pin.valid_until_ms}};
  const load=()=>loadApprovedManagerAllocation({artifact_bytes:bytes,approval_pin:pin,scope:artifact.scope,as_of_ms:now});
  return {artifact,bytes,pin,load};
}
function requireCompositionAllocation(candidate:ReturnType<typeof compositionCandidate>) {
  const result=candidate.load();if(result.status!=="READY")throw new Error(JSON.stringify(result));return result.handle;
}
const compositionRuntime=(clock?:()=>number)=>new ManagerCompositionRuntime({maximum_rows:10,maximum_input_bytes:65536,maximum_in_flight:1},clock);
async function calculatedComposition(fx:ReturnType<typeof compositionInput>,allocation=fx.handle,clock?:()=>number) {
  const handle=policy(),runtime=scoreRuntime();const raw:ManagerScorePublication[]=[];
  for(const item of fx.scoreTasks){
    const result=await runtime.calculate({...item.task,policy:handle}),{preview:_preview,...quality}=result.quality;
    raw.push(managerScorePublication.parse({slot:item.slot,quality,raw_metrics:result.raw_metrics,provenance:result.provenance}));
  }
  const fence={accepts:(score:typeof raw[number])=>managerScorePublicationPolicyCurrent(handle,
    {quality:{...score.quality,preview:null},provenance:score.provenance},clock?.()??now)};
  const publication=await compositionRuntime(clock).calculate({...fx.task,allocation,raw_scores:raw},fence);
  return {publication,raw,fence};
}

describe("ELP2-06 closed Composition loader/runtime boundaries — synthetic pins, not source qualification",()=>{
  it("publishes verified empty full-accounting census as no_allocation, never zero quality",async()=>{
    const fx=compositionInput(),artifact=structuredClone(fx.artifact);
    artifact.population=[];artifact.rows=[];artifact.binding.tuple_population_digest=accessDigest([]);
    artifact.source_set_digest=accessDigest([]);artifact.grouping=null;artifact.nav_partition=null;
    const candidate=compositionCandidate(fx,artifact),allocation=requireCompositionAllocation(candidate);
    const publication=await compositionRuntime().calculate({...fx.task,scope:artifact.scope,binding:artifact.binding,
      source_set_digest:artifact.source_set_digest,allocation,raw_scores:[]},{accepts:()=>false});
    expect(publication.result).toMatchObject({value:null,status:"no_allocation",total_allocated_capital:"0",
      score_coverage_allocated:null,bounds:null,contributions:[]});
    expect(managerCompositionPublication.safeParse(publication).success).toBe(true);
    expect(managerCompositionPublicationCurrent(allocation,publication,[],{accepts:()=>false},now,[])).toBe(true);
    expect(managerCompositionPublicationCurrent(allocation,publication,[],{accepts:()=>false},now,fx.artifact.population)).toBe(false);
  });
  it("requires the exact correlated tuple-stage census, not independent population/stage sets",async()=>{
    const fx=compositionInput(),artifact=structuredClone(fx.artifact);
    artifact.scope={...artifact.scope,environment:"live",profile_id:"LIVE_BINANCE_USDM"};
    artifact.binding.stage_filter=["CANARY","LIVE"];
    artifact.binding.partition_digest=hash("SYNTHETIC:actual-partition");
    artifact.population[0].stage="CANARY";artifact.population[1].stage="LIVE";
    artifact.rows.forEach((row,i)=>{row.population[0].stage=artifact.population[i].stage;
      row.raw_binding.stage_filter=[artifact.population[i].stage];row.raw_binding.partition_digest=artifact.binding.partition_digest;});
    const allocation=requireCompositionAllocation(compositionCandidate(fx,artifact));
    const publication=await compositionRuntime().calculate({...fx.task,scope:artifact.scope,binding:artifact.binding,
      allocation,raw_scores:[]},{accepts:()=>false});
    const accepts=(expected:typeof artifact.population)=>managerCompositionPublicationCurrent(allocation,publication,[],{accepts:()=>false},now,expected);
    expect(accepts(artifact.population)).toBe(true);expect(accepts([...artifact.population].reverse())).toBe(true);
    expect(accepts([])).toBe(false);expect(accepts(artifact.population.slice(0,1))).toBe(false);
    expect(accepts([...artifact.population,artifact.population[0]])).toBe(false);
    const changed=structuredClone(artifact.population);changed[0].stage="LIVE";changed[1].stage="CANARY";
    expect(managerScorePopulationDigest(changed as never)).toBe(managerScorePopulationDigest(artifact.population as never));
    expect(accepts(changed)).toBe(false);
    const members=fx.d.document.members.map((m,i)=>({...m,stage:artifact.population[i].stage}));
    const doc={...fx.d.document,...artifact.scope,precomputed_compositions:[publication]};
    const fence={accepts:(p:typeof publication,s:readonly ManagerScorePublication[],c?:readonly Pick<typeof members[number],"tuple"|"stage">[])=>
      managerCompositionPublicationCurrent(allocation,p,s,{accepts:()=>false},now,c)};
    const select=(c:typeof members)=>selectManagerCompositionPublications(doc,c,{type:"portfolio",id:OWN.portfolio_id},
      ["CANARY","LIVE"],artifact.binding.partition_digest,fence);
    expect(select(members)).toEqual([publication]);
    expect(select(members.map((m,i)=>({...m,stage:changed[i].stage})))).toEqual([]);
    let calls=0;const getter=structuredClone(artifact.population);
    Object.defineProperty(getter[0],"stage",{enumerable:true,get:()=>{calls++;return "CANARY";}});
    expect(accepts(getter)).toBe(false);expect(calls).toBe(0);
  });
  it("keeps explicit LIVE+CANARY selection when the full frozen census currently has only LIVE",async()=>{
    const fx=compositionInput(),artifact=structuredClone(fx.artifact);
    artifact.scope={...artifact.scope,environment:"live",profile_id:"LIVE_BINANCE_USDM"};
    artifact.binding.stage_filter=["CANARY","LIVE"];artifact.binding.partition_digest=hash("SYNTHETIC:actual-partition");
    for(const member of artifact.population)member.stage="LIVE";
    for(const row of artifact.rows){for(const member of row.population)member.stage="LIVE";
      row.raw_binding.stage_filter=["CANARY","LIVE"];row.raw_binding.partition_digest=artifact.binding.partition_digest;}
    const allocation=requireCompositionAllocation(compositionCandidate(fx,artifact));
    const publication=await compositionRuntime().calculate({...fx.task,scope:artifact.scope,binding:artifact.binding,
      allocation,raw_scores:[]},{accepts:()=>false});
    expect(publication.provenance.binding.stage_filter).toEqual(["CANARY","LIVE"]);
    expect(publication.result).toMatchObject({value:null,status:"partial_coverage",total_allocated_capital:"80",
      score_coverage_allocated:"0",bounds:{lower:"0",upper:"100"}});
  });
  it.each(["zero","missing"] as const)("preserves exact %s q semantics through the canonical calculator",async state=>{
    const fx=compositionInput(state==="missing");
    if(state==="zero")for(const item of fx.scoreTasks.filter(item=>item.slot==="RAW")){
      if(item.task.input.kind!=="METRICS")throw new Error("SYNTHETIC_FIXTURE_KIND");
      item.task.input.quality.metrics={net_excess_twr:"-0.02",sharpe_period:"0",mdd:"0.1",add:"0.04",positive_block_ratio:"0",stress_excess_twr:"-0.02"};
    }
    const {publication,raw,fence}=await calculatedComposition(fx);
    expect(publication.result).toMatchObject(state==="zero"?{value:"0",status:"available",score_coverage_allocated:"1"}:
      {value:null,status:"partial_coverage",score_coverage_allocated:"0.75",bounds:{lower:"67.5",upper:"92.5"}});
    expect(publication.provenance.raw_score_refs).toHaveLength(state==="zero"?2:1);
    expect(managerCompositionPublicationCurrent(fx.handle,publication,raw,fence,now)).toBe(true);
  });
  it("rejects status/capital/credit contradictions publicly and a substituted raw digest at the current-proof boundary",async()=>{
    const fx=compositionInput(),{publication,raw,fence}=await calculatedComposition(fx);
    for(const mutate of [
      (p:typeof publication)=>{p.result.total_allocated_capital="0";},
      (p:typeof publication)=>{p.result.score_coverage_allocated="0.75";},
      (p:typeof publication)=>{p.result.status="no_allocation";},
      (p:typeof publication)=>{p.result.contributions[0].value=null;},
      (p:typeof publication)=>{p.provenance.raw_score_refs=[];},
    ]){const contradictory=structuredClone(publication);mutate(contradictory);
      expect(managerCompositionPublication.safeParse(contradictory).success).toBe(false);}
    const substituted=structuredClone(publication);substituted.provenance.raw_score_refs[0].publication_digest=hash("SYNTHETIC:wrong-raw-publication");
    // A digest with the right wire shape is not proof that it references the current RAW calculation.
    expect(managerCompositionPublication.safeParse(substituted).success).toBe(true);
    expect(managerCompositionPublicationCurrent(fx.handle,substituted,raw,fence,now)).toBe(false);
  });
  it.each(["absent","expired"] as const)("keeps assigned A when independent grouping/NAV approval is %s",async state=>{
    const fx=compositionInput(),artifact=structuredClone(fx.artifact);
    if(state==="absent"){artifact.grouping=null;artifact.nav_partition=null;}
    else artifact.grouping={revision:"SYNTHETIC:groups-r1",manifest_ref:"SYNTHETIC:groups",effective_at_ms:artifact.source_as_of_ms,
      rows:artifact.rows.map(row=>({subject_id:row.subject_id,concentration_group_id:`SYNTHETIC:group:${row.subject_id}`}))};
    const candidate=compositionCandidate(fx,artifact);
    if(state==="expired"){candidate.pin.grouping_pin!.valid_until_ms=now-1;candidate.pin.nav_pin!.valid_until_ms=now-1;}
    const allocation=requireCompositionAllocation(candidate),{publication,raw,fence}=await calculatedComposition(fx,allocation);
    expect(publication.result).toMatchObject({value:"80",status:"available",allocation_coverage_nav:null,scored_nav_weight:null,
      idle_cash_weight:null,nav_coverage_reason:"BASIS_MISMATCH",diagnostics:{allocation_hhi:null,score_contribution_hhi:null}});
    expect(publication.provenance.valid_until_ms).toBe(fx.pin.valid_until_ms);
    if(state==="expired")expect(publication.result.diagnostics.reason_codes).toContain("GROUPING_APPROVAL_NOT_CURRENT");
    expect(managerCompositionPublicationCurrent(allocation,publication,raw,fence,now)).toBe(true);
  });
  it("does not mistake assigned capital above current NAV for overlapping allocation or renormalize A",async()=>{
    const fx=compositionInput(),artifact=structuredClone(fx.artifact);
    artifact.nav_partition={...artifact.nav_partition!,nav:"70",idle_cash:"0",rows:[
      {subject_id:OWN.alpha_id,current_nav_allocated_capital:"52.5"},{subject_id:PEER.alpha_id,current_nav_allocated_capital:"17.5"}]};
    const allocation=requireCompositionAllocation(compositionCandidate(fx,artifact)),{publication}=await calculatedComposition(fx,allocation);
    expect(publication.result).toMatchObject({value:"80",status:"available",total_allocated_capital:"80",
      allocation_coverage_nav:null,scored_nav_weight:null,idle_cash_weight:null,nav_coverage_reason:"BASIS_MISMATCH"});
    expect(publication.result.reason_codes).not.toContain("ALLOCATION_RECONCILIATION_FAILED");
  });
  it("projects only expired auxiliaries away between calculation/read while preserving A and its immutable receipt",async()=>{
    const fx=compositionInput(),artifact=structuredClone(fx.artifact);let clock=now;
    artifact.grouping={revision:"SYNTHETIC:groups-r1",manifest_ref:"SYNTHETIC:groups",effective_at_ms:artifact.source_as_of_ms,
      rows:artifact.rows.map(row=>({subject_id:row.subject_id,concentration_group_id:`SYNTHETIC:group:${row.subject_id}`}))};
    const candidate=compositionCandidate(fx,artifact);candidate.pin.grouping_pin!.valid_until_ms=now+1000;candidate.pin.nav_pin!.valid_until_ms=now+1000;
    const allocation=requireCompositionAllocation(candidate),{publication,raw,fence}=await calculatedComposition(fx,allocation,()=>clock);
    expect(publication.result.diagnostics.allocation_hhi).toBe("0.625");expect(publication.result.allocation_coverage_nav).toBe("0.8");
    const immutable=structuredClone(publication);clock=now+1001;
    const projected=managerCompositionPublicationForRead(allocation,publication,raw,fence,clock);
    expect(projected).not.toBeNull();expect(projected!.result).toMatchObject({value:"80",status:"available",allocation_coverage_nav:null,
      scored_nav_weight:null,idle_cash_weight:null,diagnostics:{allocation_hhi:null,score_contribution_hhi:null}});
    expect(projected!.provenance).toEqual(publication.provenance);expect(publication).toEqual(immutable);
    expect(managerCompositionPublicationCurrent(allocation,publication,raw,fence,clock)).toBe(false);
    expect(managerCompositionPublicationCurrent(allocation,projected,raw,fence,clock)).toBe(true);
  });
  it("checks main approval expiry after the calculation yield using its trusted clock, not caller computed_at",async()=>{
    const fx=compositionInput();let clock=now;
    const {raw,fence}=await calculatedComposition(fx,fx.handle,()=>clock),runtime=compositionRuntime(()=>clock);
    const flight=runtime.calculate({...fx.task,allocation:fx.handle,raw_scores:raw},fence);
    clock=fx.pin.valid_until_ms;
    await expect(flight).rejects.toMatchObject({code:"COMPOSITION_ALLOCATION_NOT_CURRENT"});
  });
  it("requires a real identity-branded handle, exact approved bytes and disjoint economic ownership",async()=>{
    const fx=compositionInput(),candidate=compositionCandidate(fx);
    expect(loadApprovedManagerAllocation({artifact_bytes:candidate.bytes+"\n",approval_pin:candidate.pin,scope:candidate.artifact.scope,as_of_ms:now}))
      .toEqual({status:"NOT_PUBLISHED",reason_codes:["ALLOCATION_ARTIFACT_HASH_MISMATCH"]});
    const duplicate=structuredClone(fx.artifact);duplicate.rows[1].economic_ownership_ids=[...duplicate.rows[0].economic_ownership_ids];
    expect(compositionCandidate(fx,duplicate).load()).toEqual({status:"NOT_PUBLISHED",reason_codes:["ALLOCATION_OWNERSHIP_OVERLAP"]});
    await expect(compositionRuntime().calculate({...fx.task,allocation:Object.freeze({}) as typeof fx.handle,raw_scores:[]},{accepts:()=>false}))
      .rejects.toMatchObject({code:"COMPOSITION_ALLOCATION_NOT_APPROVED"});
  });
});

describe("ELP2-10 private commissioning and real registered constructors (synthetic pins)",()=>{
  it("registers a zero-I/O fail-closed runtime in the actual AppModule",async()=>{
    const pool={} as Pool,module=AppModule.register(testConfig(),pool);
    const provider=(module.providers as any[]).find(p=>p.provide===ExecutionManagerRuntime);
    const runtime=provider.useValue as ExecutionManagerRuntime;runtime.onModuleInit();await runtime.tick();
    expect(runtime.status()).toEqual({state:"SOURCE_PROVIDER_NOT_INSTALLED",partitions:0,automatic_loop:false});
    expect(runtime.accessTrust()).toBeUndefined();await runtime.beforeApplicationShutdown();
    expect(()=>AppModule.register(testConfig(),pool,undefined,{executionManagerRuntime:{} as ManagerRuntimeInstallation}))
      .toThrow("MANAGER_RUNTIME_EXECUTION_POOL_REQUIRED");
    expect(()=>AppModule.register(testConfig(),pool,pool,{executionManagerRuntime:{} as ManagerRuntimeInstallation}))
      .toThrow("MANAGER_RUNTIME_EXECUTION_POOL_REQUIRED");
  });
  it("requires exact bytes, independent pin, current expiry and a non-forged handle",()=>{
    const c=commissioning(),d=input(),request={...scope,binding:d.publication.authority.binding};
    expect(()=>loadPublicationCommissioning(c.bytes+"\n",c.pin,now)).toThrow();
    expect(()=>loadPublicationCommissioning(c.bytes,c.pin,c.pin.valid_until_ms)).toThrow();
    expect(()=>qualifyDatasetPublication(d.publication,request,{purpose:"BUSINESS",nowMs:now})).toThrow();
    expect(()=>qualifyDatasetPublication(d.publication,request,{purpose:"BUSINESS",nowMs:now,commissioning:{} as any})).toThrow();
    expect(qualifyDatasetPublication(d.publication,request,{purpose:"BUSINESS",nowMs:now,commissioning:c.handle})).toEqual(d.publication);
    d.publication.privacy.receipt_ref="UNREVIEWED";
    expect(()=>qualifyDatasetPublication(d.publication,request,{purpose:"BUSINESS",nowMs:now,commissioning:c.handle})).toThrow();
  });
  it("preserves human identity/policy methods instead of turning a source pin into a grant",async()=>{
    const c=commissioning(),d=input();const trust=withCataloguePublications(unqualifiedAccessTrust,async()=>d.publication,
      {purpose:"BUSINESS",commissioning:c.handle,now:()=>now});
    expect(await trust.verifiedHumanMapping("bobby",scope.workspace_id)).toBeNull();
    expect(await trust.verifyPolicy({role:"ADMIN"})).toBeNull();
    expect(await trust.verifyRootReceipt!({role:"ADMIN"})).toBeNull();
    expect(await trust.qualifyDelegatedReceipt!({role:"ADMIN"},{workspace_id:scope.workspace_id,subject_user_id:"SYNTHETIC-user",principal_ids:[]})).toBeNull();
    expect(await trust.readPublication!({...scope,binding:d.publication.authority.binding})).toEqual(d.publication.authority);
  });
  it("preserves the independently qualified root verifier across both private compositions",async()=>{
    const c=commissioning(),token=Object.freeze({SYNTHETIC_NOT_A_RECEIPT:true});
    const verifyRootReceipt=vi.fn(async()=>null),base={...unqualifiedAccessTrust,verifyRootReceipt};
    const composed=withCataloguePublications(base,async()=>null,{purpose:"BUSINESS",commissioning:c.handle,now:()=>now});
    await expect(composed.verifyRootReceipt!(token)).resolves.toBeNull();
    const runtime=new ExecutionManagerRuntime({options:{connectionTimeoutMillis:2000,query_timeout:4000}} as Pool,
      {trust:composed,cadence_ms:1000,maximum_publication_reads:1,partitions:[{scope,commissioning:c.handle,bounds,
        publication:async()=>null,source:{read:async()=>null,recheck:async()=>({}),acknowledge:async()=>{}}}]});
    try {await expect(runtime.accessTrust()!.verifyRootReceipt!(token)).resolves.toBeNull();}
    finally {await runtime.beforeApplicationShutdown();}
    expect(verifyRootReceipt).toHaveBeenCalledTimes(2);
    expect(verifyRootReceipt).toHaveBeenNthCalledWith(1,token);
    expect(verifyRootReceipt).toHaveBeenNthCalledWith(2,token);
  });
  it("preserves the delegated provider receiver and exact scope across both private compositions",async()=>{
    const c=commissioning(),token=Object.freeze({SYNTHETIC_NOT_A_RECEIPT:true});
    const requested:DelegatedReceiptScope={workspace_id:scope.workspace_id,subject_user_id:"SYNTHETIC-user",principal_ids:["SYNTHETIC-user"]};
    const qualifyDelegatedReceipt=vi.fn(async function(this:unknown,input:unknown,received:DelegatedReceiptScope){
      expect(this).toBe(base);expect(input).toBe(token);expect(received).toEqual(requested);return null;
    });
    const base={...unqualifiedAccessTrust,qualifyDelegatedReceipt};
    const composed=withCataloguePublications(base,async()=>null,{purpose:"BUSINESS",commissioning:c.handle,now:()=>now});
    await expect(composed.qualifyDelegatedReceipt!(token,requested)).resolves.toBeNull();
    const runtime=new ExecutionManagerRuntime({options:{connectionTimeoutMillis:2000,query_timeout:4000}} as Pool,
      {trust:composed,cadence_ms:1000,maximum_publication_reads:1,partitions:[{scope,commissioning:c.handle,bounds,
        publication:async()=>null,source:{read:async()=>null,recheck:async()=>({}),acknowledge:async()=>{}}}]});
    try{await expect(runtime.accessTrust()!.qualifyDelegatedReceipt!(token,requested)).resolves.toBeNull();}
    finally{await runtime.beforeApplicationShutdown();}
    expect(qualifyDelegatedReceipt).toHaveBeenCalledTimes(2);
  });
  it("refuses expired commissioning before lease or source I/O",async()=>{
    const c=commissioning(),d=input(),query=vi.fn(),read=vi.fn(),publication=vi.fn();
    const pool={options:{connectionTimeoutMillis:2000,query_timeout:4000},query} as unknown as Pool;
    const runtime=new ExecutionManagerRuntime(pool,{trust:unqualifiedAccessTrust,cadence_ms:1000,maximum_publication_reads:1,
      partitions:[{scope,commissioning:c.handle,bounds,publication,source:{read,recheck:async()=>({}),acknowledge:async()=>{}}}]});
    const clock=vi.spyOn(Date,"now").mockReturnValue(c.pin.valid_until_ms);
    try {
      await runtime.tick();expect(runtime.status().state).toBe("TICK_REFUSED");
      await expect(runtime.accessTrust()!.readPublication!({...scope,binding:d.publication.authority.binding})).rejects.toThrow("MANAGER_COMMISSIONING_EXPIRED");
      expect(query).not.toHaveBeenCalled();expect(read).not.toHaveBeenCalled();expect(publication).not.toHaveBeenCalled();
    } finally {clock.mockRestore();await runtime.beforeApplicationShutdown();}
  });
  it("publishes only current-policy scores for the exact authorized population and stage",async()=>{
    const f=productReadFixture({full:true,fields:[...BUSINESS_READ_FIELDS]}),d=input(),handle=policy();
    const task=scoreTask(d.document),result=await scoreRuntime().calculate({...task,policy:handle});
    const {preview,...quality}=result.quality;expect(preview).toBeNull();expect(quality.status).toBe("available");
    const score=managerScorePublication.parse({slot:"RAW",quality,raw_metrics:result.raw_metrics,provenance:result.provenance});
    d.document.precomputed_scores=[score];
    const binding=d.publication.authority.binding;
    const scopeRead=await f.scopes.authorize(f.principal,{environment:"paper",profileId:scope.profile_id},{action:"business.read_all",dataset:binding});
    const codec=new KeysetCursorCodec({activeKeyId:"test",keys:{test:"TEST_ONLY-synthetic-score-cursor-secret-32"}});
    // No economic partition fact: query must not invent a score denominator.
    const read=()=>queryManagerModel(scopeRead,d.document,{environment:"paper"},codec,"ALPHA",OWN.alpha_id,
      {accepts:s=>managerScorePublicationCurrent(handle,{quality:{...s.quality,preview:null},provenance:s.provenance},now)});
    expect(read().scores.raw.value).toBeNull();expect(read().score_details).toEqual([]);
    const malformed=structuredClone(score);malformed.quality.value="100.0000000000000000000001";
    expect(managerScorePublication.safeParse(malformed).success).toBe(false);
  });
  it("rechecks Score after the final asynchronous delivery authority fence",async()=>{
    const f=productReadFixture({full:true,fields:[...BUSINESS_READ_FIELDS]}),d=input(),handle=policy();
    const t=scoreTask(d.document),r=await scoreRuntime().calculate({...t,policy:handle});const {preview:_preview,...quality}=r.quality;
    const partition={economic_domain:"PAPER" as const,currency:"USDT",basis:"SYNTHETIC:basis",native_profile_ref:"SYNTHETIC:native",domain_proof_ref:"SYNTHETIC:domain"};
    const s=managerScorePublication.parse({slot:"RAW",quality,raw_metrics:r.raw_metrics,provenance:{...r.provenance,binding:{...r.provenance.binding,partition_digest:accessDigest(partition)}}});
    d.document.facts=[{fact_id:"SYNTHETIC:fact",revision:"SYNTHETIC:f1",source_receipt_ref:"SYNTHETIC:receipt",tuple:OWN,partition,
      economic_account_ref:"SYNTHETIC:econ",ownership_partition_ref:"SYNTHETIC:own",kind:"current_nav",classification:"ECONOMIC",transfer_pair_ref:null,counterpart_portfolio_id:null,
      effective_at_ms:now-100,recorded_at_ms:now-100,metric:{value:"100",unit:"MONEY",currency:"USDT",basis:partition.basis,window:null,denominator:null,methodology_ref:null,
        availability:"AVAILABLE",reason_code:null,quality:{completeness:"COMPLETE",freshness:"FRESH",reasons:[]},source_confidence:"VERIFIED",provenance_refs:["SYNTHETIC:f1"],calculation_revision:"SYNTHETIC:calc",policy_revision:"SYNTHETIC:p"}}];
    d.document.precomputed_scores=[s];let active=true;
    const authorized=await f.scopes.authorize(f.principal,{environment:"paper",profileId:scope.profile_id},
      {action:"business.read_all",dataset:d.publication.authority.binding});
    const codec=new KeysetCursorCodec({activeKeyId:"test",keys:{test:"TEST_ONLY-synthetic-score-cursor-secret-32"}});
    const read=()=>queryManagerModel(authorized,d.document,{environment:"paper"},codec,"ALPHA",OWN.alpha_id,
      {accepts:score=>managerScorePublicationPolicyCurrent(handle,{quality:{...score.quality,preview:null},provenance:score.provenance},now)});
    expect(read().scores.raw).toEqual({value:quality.value,status:quality.status});
    expect(read().items[0].metrics.score.value).toBe(quality.value);
    expect(read().score_details).toHaveLength(1);
    for(const change of [
      (score:typeof s)=>{score.provenance.binding.tuple_population_digest=hash("other-population");},
      (score:typeof s)=>{score.provenance.binding.stage_filter=["LIVE"];},
      (score:typeof s)=>{score.provenance.binding.partition_digest=hash("other-partition");},
      (score:typeof s)=>{score.provenance.source_revision="other-revision";},
    ]) {
      const altered=structuredClone(s);change(altered);d.document.precomputed_scores=[altered];
      expect(read().scores.raw.value).toBeNull();expect(read().score_details).toEqual([]);
    }
    const incomplete=structuredClone(s);incomplete.quality={...incomplete.quality,value:null,band_code:null,
      status:"partial_costs",reason_codes:["REQUIRED_COSTS_NOT_COMPLETE"]};
    d.document.precomputed_scores=[incomplete];
    expect(read().scores.raw).toEqual({value:null,status:"partial_costs"});
    expect(read().items[0].metrics.score).toMatchObject({value:null,availability:"UNAVAILABLE",reason_code:"REQUIRED_COSTS_NOT_COMPLETE"});
    d.document.precomputed_scores=[s];
    const runtime={scoreFence:{accepts:()=>active},recalculationFor:()=>undefined} as unknown as ExecutionManagerRuntime;
    const service=new ManagerModelService({} as Pool,f.scopes,f.config,runtime),repo=(service as any).repository;
    vi.spyOn(repo,"head").mockResolvedValue({revision:d.document.revision,projection_generation:d.document.projection_generation,catalogue_digest:catalogue,payload_digest:hash("doc")});
    vi.spyOn(repo,"document").mockResolvedValue(d.document);
    const original=f.scopes.deliver.bind(f.scopes);
    vi.spyOn(f.scopes,"deliver").mockImplementation(async(s,load)=>{const value=await original(s,load);active=false;return value;});
    await expect(service.read(f.principal,"ALPHA",{environment:"paper"},OWN.alpha_id)).rejects.toMatchObject({code:"EXECUTION_READ_ACCESS_CHANGED",status:409});
  });
});

describe.skipIf(!process.env.TEST_DATABASE_URL)("ELP2-10 installed worker/Score/ACK real PostgreSQL integration — synthetic source",()=>{
  const name=`elp210_commission_${randomUUID().replaceAll("-","")}`;
  const url=(db:string)=>{const u=new URL(process.env.TEST_DATABASE_URL!);u.pathname=`/${db}`;return u.toString();};
  let pool:Pool;const runtimes:ExecutionManagerRuntime[]=[];
  /** SYNTHETIC source/identity/policy, real Hub + Manager consumer + disposable PG.
   * No mounted HTTP, commissioned Edge factory, source coverage or propagation SLA. */
  async function replayRuntime(source:ScopedNoticeSource) {
    const binding:ScopedReplayBinding={...scope,principal_scope_digest:"SYNTHETIC:current-principal",
      app_policy_revision:"SYNTHETIC:app-policy",field_policy_revision:"SYNTHETIC:field-policy",model_revision:"SYNTHETIC:model",
      schema_revision:"portal.execution.scoped-realtime.v1",dataset:"alpha_fleet_overview",query_digest:"SYNTHETIC:query",
      source_set_digest:"SYNTHETIC:source-set",source_continuity_epoch:"SYNTHETIC:epoch",projection_generation:"SYNTHETIC:generation",
      snapshot_id:"SYNTHETIC:snapshot",window:null};
    const frames:ScopedRealtimeFrame[]=[];
    const hub=new ScopedReplayHub(source,new ScopedReplayCursorCodec("test",{test:"TEST_ONLY-replay-lifecycle-key-".repeat(3)},60000),
      {maximumClients:1,maximumEntriesPerClient:2,maximumFrameBytes:8192,maximumClientBytes:16384,
        maximumTotalBytes:16384,maximumNoticesPerRead:1,readTimeoutMs:1000});
    await hub.subscribe({binding,baselineCursor:"TEST_ONLY.private.scan-1",guard:{currentIdentity:async()=>binding.principal_scope_digest,
      write:async(_expected,send)=>send()},write:frame=>{frames.push(frame);return true;}});
    const c=commissioning(),at=Date.now();
    const commissioned=loadPublicationCommissioning(c.bytes,{...c.pin,approved_at_ms:at-10_000,valid_until_ms:at+60_000},at);
    const read=vi.fn(async()=>null),runtime=new ExecutionManagerRuntime(pool,{trust:unqualifiedAccessTrust,cadence_ms:1000,
      maximum_publication_reads:1,realtime:hub,partitions:[{scope,commissioning:commissioned,bounds,
        publication:async()=>null,source:{read,recheck:async()=>({}),acknowledge:async()=>{}}}]});
    runtimes.push(runtime);return {runtime,hub,frames,read};
  }
  beforeAll(async()=>{const admin=new Pool({connectionString:url("postgres"),max:1});try{await admin.query(`CREATE DATABASE ${name}`);}finally{await admin.end();}
    pool=new Pool({connectionString:url(name),max:2,connectionTimeoutMillis:2000,query_timeout:4000});
    for(const file of ["1723680000135_execution-manager-models.sql","1723680000137_execution-manager-consumer-fence.sql"])
      await pool.query(readFileSync(resolve(__dirname,"../migrations",file),"utf8").split("-- Down Migration")[0]);},60000);
  beforeEach(async()=>{for(const r of runtimes.splice(0))await r.beforeApplicationShutdown();await pool.query("TRUNCATE execution_manager_model_heads,execution_manager_model_revisions,execution_manager_consumer_fences");});
  afterAll(async()=>{for(const r of runtimes.splice(0))await r.beforeApplicationShutdown();await pool?.end();const admin=new Pool({connectionString:url("postgres"),max:1});
    try{if(!/^elp210_commission_[a-f0-9]{32}$/.test(name))throw new Error("DB_NAME");await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);}finally{await admin.end();}},60000);
  it("polls the installed Hub before real financial IDLE and coalesces the same Manager tick",async()=>{
    let enter!:()=>void,release!:(value:EdgeScopedNoticeBatch)=>void;
    const entered=new Promise<void>(resolve=>{enter=resolve;});
    const pending=new Promise<EdgeScopedNoticeBatch>(resolve=>{release=resolve;});
    const noticeRead=vi.fn<ScopedNoticeSource["read"]>(async()=>({notices:[],next_cursor:"TEST_ONLY.private.scan-1",caught_up:true}));
    noticeRead.mockImplementationOnce(()=>{enter();return pending;});
    const h=await replayRuntime({read:noticeRead});
    const work=h.runtime.tick();
    try {
      await entered;
      expect(h.runtime.tick()).toBe(work);
      expect(h.read).not.toHaveBeenCalled(); // Poll first, not after a potentially long financial batch.
      release({notices:[],next_cursor:"TEST_ONLY.private.scan-1",caught_up:true});
      await work;
      expect(h.read).toHaveBeenCalledOnce();
      expect(h.frames.map(f=>f.event_type)).toEqual(["heartbeat"]);
      expect(h.runtime.status()).toMatchObject({state:"TICK_OK",automatic_loop:false});
      await h.runtime.tick();
      expect(noticeRead).toHaveBeenCalledTimes(2);expect(h.read).toHaveBeenCalledTimes(2);
      expect(h.frames.map(f=>f.event_type)).toEqual(["heartbeat","heartbeat"]);
      expect((await pool.query("SELECT count(*)::int AS n FROM execution_manager_consumer_fences")).rows[0].n).toBe(1);
      expect((await pool.query("SELECT count(*)::int AS n FROM execution_manager_model_revisions")).rows[0].n).toBe(0);
    } finally {
      release({notices:[],next_cursor:"TEST_ONLY.private.scan-1",caught_up:true});
      await work;await h.runtime.beforeApplicationShutdown();
    }
  });
  it("stops during Hub poll without starting financial work or reviving TICK_OK after late completion",async()=>{
    let enter!:()=>void,release!:(value:EdgeScopedNoticeBatch)=>void;
    const entered=new Promise<void>(resolve=>{enter=resolve;});
    const pending=new Promise<EdgeScopedNoticeBatch>(resolve=>{release=resolve;});
    const noticeRead=vi.fn<ScopedNoticeSource["read"]>(()=>{enter();return pending;});
    const h=await replayRuntime({read:noticeRead}),work=h.runtime.tick();
    await entered;
    const signal=noticeRead.mock.calls[0][3];
    const shutdown=h.runtime.beforeApplicationShutdown();let stopped=false;
    void shutdown.then(()=>{stopped=true;});
    try {
      // There is no financial/DB work on this path: settle only the finite
      // promise cancellation chain, without resolving the ignoring provider.
      await new Promise<void>(resolve=>setImmediate(resolve));
      expect(stopped).toBe(true);expect(signal.aborted).toBe(true);
      expect(h.runtime.status()).toEqual({state:"STOPPED",partitions:1,automatic_loop:false});
      expect(h.read).not.toHaveBeenCalled();
      expect(h.hub.diagnostics()).toMatchObject({clients:0,source_flights:1,queued_bytes:0});
      expect(h.frames).toHaveLength(1);expect(h.frames[0]).toMatchObject({event_type:"unavailable",reason_code:"STOPPED",terminal:true});
      await expect(h.runtime.tick()).rejects.toThrow("MANAGER_RUNTIME_STOPPED");
    } finally {
      release({notices:[],next_cursor:"TEST_ONLY.private.scan-1",caught_up:true});
      await work;await shutdown;
      await new Promise<void>(resolve=>setImmediate(resolve));
    }
    expect(h.read).not.toHaveBeenCalled();expect(noticeRead).toHaveBeenCalledOnce();
    expect(h.frames).toHaveLength(1);expect(h.hub.diagnostics().source_flights).toBe(0);
    expect(h.runtime.status()).toEqual({state:"STOPPED",partitions:1,automatic_loop:false});
    expect((await pool.query("SELECT count(*)::int AS n FROM execution_manager_consumer_fences")).rows[0].n).toBe(0);
    expect((await pool.query("SELECT count(*)::int AS n FROM execution_manager_model_revisions")).rows[0].n).toBe(0);
  });
  it("materializes Composition plus raw/direct Score, persists PG and serves the existing Manager controller/query",async()=>{
    const fx=compositionInput(),installed=compositionInstallation(fx),runtime=new ExecutionManagerRuntime(pool,installed.installation);runtimes.push(runtime);
    await runtime.tick();expect(runtime.status().state).toBe("TICK_OK");
    const doc=await new ManagerModelRepository(pool).document(scope.workspace_id,scope.environment,scope.profile_id,fx.d.document.revision);
    expect(doc!.precomputed_scores).toHaveLength(3);expect(doc!.precomputed_compositions).toHaveLength(1);
    expect(doc!.precomputed_compositions![0].result).toMatchObject({value:"80",status:"available",total_allocated_capital:"80",
      score_coverage_allocated:"1",allocation_coverage_nav:"0.8",idle_cash_weight:"0.2"});
    expect(runtime.compositionFence.accepts(doc!.precomputed_compositions![0],doc!.precomputed_scores!)).toBe(true);
    const f=compositionReader(fx),service=new ManagerModelService(pool,f.scopes,f.config,runtime);
    const workspaces={canReadExecution:vi.fn(async()=>true)} as unknown as ConstructorParameters<typeof ManagerModelController>[1];
    const controller=new ManagerModelController(service,workspaces);
    const request={portalUser:f.principal.user,portalSession:f.principal.session,portalWorkspaceId:scope.workspace_id} as Parameters<ManagerModelController["portfolio"]>[0];
    const result=await controller.portfolio(request,{workspace_id:scope.workspace_id,environment:"paper",limit:"1"},OWN.portfolio_id);
    expect(result.scores.composition).toEqual({value:"80",status:"available"});
    expect(result.scores.direct_nav).toEqual({value:"60",status:"available"});
    expect(result.composition_details).toEqual(doc!.precomputed_compositions);
    expect(result.items).toHaveLength(1);expect(workspaces.canReadExecution).toHaveBeenCalledWith(scope.workspace_id,f.principal.user.userId);
  });
  it("keeps a missing q and archived allocation in the full denominator; DIRECT_NAV remains independent",async()=>{
    const fx=compositionInput(true),installed=compositionInstallation(fx),runtime=new ExecutionManagerRuntime(pool,installed.installation);runtimes.push(runtime);
    await runtime.tick();expect(runtime.status().state).toBe("TICK_OK");
    const f=compositionReader(fx),result=await new ManagerModelService(pool,f.scopes,f.config,runtime).read(f.principal,"PORTFOLIO",{environment:"paper"},OWN.portfolio_id);
    expect(result.scores.composition).toEqual({value:null,status:"partial_coverage"});
    expect(result.composition_details![0].result).toMatchObject({total_allocated_capital:"80",score_coverage_allocated:"0.75",
      unscored_allocated_weight:"0.25",bounds:{lower:"67.5",upper:"92.5"}});
    expect(result.composition_details![0].result.contributions.find(c=>c.subject_id===PEER.alpha_id)).toMatchObject({allocation_weight:"0.25",value:null});
    expect(result.scores.direct_nav).toEqual({value:"60",status:"available"});
  });
  it("reuses both immutable arrays/timestamps after lost ACK and a new runtime restart",async()=>{
    const fx=compositionInput();let ack=0;
    const installed=compositionInstallation(fx,async()=>{if(++ack===1)throw new Error("SYNTHETIC_ACK_LOST");});
    const firstRuntime=new ExecutionManagerRuntime(pool,installed.installation);runtimes.push(firstRuntime);
    await firstRuntime.tick();expect(firstRuntime.status().state).toBe("TICK_REFUSED");
    const repo=new ManagerModelRepository(pool),before=await repo.document(scope.workspace_id,scope.environment,scope.profile_id,fx.d.document.revision);
    expect(before!.precomputed_compositions).toHaveLength(1);expect(before!.precomputed_scores).toHaveLength(3);
    await firstRuntime.beforeApplicationShutdown();
    const resumed=new ExecutionManagerRuntime(pool,installed.installation);runtimes.push(resumed);
    await resumed.tick();expect(resumed.status().state).toBe("TICK_OK");expect(ack).toBe(2);
    const after=await repo.document(scope.workspace_id,scope.environment,scope.profile_id,fx.d.document.revision);
    expect(after).toEqual(before);expect(after!.precomputed_compositions![0].provenance.computed_at_ms).toBe(now);
    expect(after!.precomputed_scores!.map(s=>s.provenance.computed_at_ms)).toEqual([now,now,now]);
    expect(installed.scoreTasks).toHaveBeenCalledOnce();expect(installed.compositionTasks).toHaveBeenCalledOnce();
    expect(resumed.compositionFence.accepts(after!.precomputed_compositions![0],after!.precomputed_scores!)).toBe(true);
  });
  it.each(["precomputed_scores","precomputed_compositions"] as const)("refuses source-supplied worker outputs: %s",async field=>{
    const fx=compositionInput();Object.assign(fx.d.document,{[field]:[]});
    const installed=compositionInstallation(fx),runtime=new ExecutionManagerRuntime(pool,installed.installation);runtimes.push(runtime);
    await runtime.tick();expect(runtime.status().state).toBe("TICK_REFUSED");
    expect(installed.scoreTasks).not.toHaveBeenCalled();expect(installed.compositionTasks).not.toHaveBeenCalled();
    expect((await pool.query("SELECT count(*)::int AS n FROM execution_manager_model_revisions")).rows[0].n).toBe(0);
  });
  it.each(["allocation revoked","allocation expired","raw policy revoked"] as const)("refuses %s during the final delivery await",async change=>{
    const fx=compositionInput(),installed=compositionInstallation(fx),runtime=new ExecutionManagerRuntime(pool,installed.installation);runtimes.push(runtime);
    await runtime.tick();expect(runtime.status().state).toBe("TICK_OK");
    const f=compositionReader(fx),service=new ManagerModelService(pool,f.scopes,f.config,runtime);
    expect((await service.read(f.principal,"PORTFOLIO",{environment:"paper"},OWN.portfolio_id)).scores.composition.value).toBe("80");
    const clock=vi.spyOn(Date,"now");
    const original=f.scopes.deliver.bind(f.scopes);
    vi.spyOn(f.scopes,"deliver").mockImplementation(async(s,load)=>{
      const result=await original(s,load);
      if(change==="allocation revoked")expect(revokeApprovedManagerAllocation(fx.handle)).toBe(true);
      else if(change==="raw policy revoked")installed.state.policy=null;
      else clock.mockReturnValue(fx.pin.valid_until_ms);
      return result;
    });
    try{await expect(service.read(f.principal,"PORTFOLIO",{environment:"paper"},OWN.portfolio_id))
      .rejects.toMatchObject({code:"EXECUTION_READ_ACCESS_CHANGED",status:409});}
    finally{clock.mockRestore();}
  });
  it.each([true,false])("withholds full Composition from a restricted researcher (allocation field granted=%s)",async withAllocation=>{
    const fx=compositionInput(),installed=compositionInstallation(fx),runtime=new ExecutionManagerRuntime(pool,installed.installation);runtimes.push(runtime);
    await runtime.tick();expect(runtime.status().state).toBe("TICK_OK");
    const fields=[...BUSINESS_READ_FIELDS].filter(x=>withAllocation||x!=="allocation"),f=compositionReader(fx,false,fields);
    const result=await new ManagerModelService(pool,f.scopes,f.config,runtime).read(f.principal,"PORTFOLIO",{environment:"paper"},OWN.portfolio_id);
    expect(result.items.map(x=>x.alpha_id)).toEqual([OWN.alpha_id]);expect(result.scores.composition.value).toBeNull();
    expect(result.composition_details??[]).toEqual([]);
    const wire=JSON.stringify(result);
    for(const field of ["total_allocated_capital","allocation_snapshot_id","full_accounting_manifest_ref","score_coverage_allocated"])
      expect(wire).not.toContain(`"${field}"`);
    if(!withAllocation)expect(result.items[0].metrics).not.toHaveProperty("allocation");
  });
  it("keeps Composition and direct NAV unchanged across table filter and cursor pages",async()=>{
    const fx=compositionInput(),installed=compositionInstallation(fx),runtime=new ExecutionManagerRuntime(pool,installed.installation);runtimes.push(runtime);
    await runtime.tick();expect(runtime.status().state).toBe("TICK_OK");
    const f=compositionReader(fx),service=new ManagerModelService(pool,f.scopes,f.config,runtime);
    const first=await service.read(f.principal,"PORTFOLIO",{environment:"paper",limit:1},OWN.portfolio_id);
    expect(first.page.next_cursor).toBeTypeOf("string");
    const second=await service.read(f.principal,"PORTFOLIO",{environment:"paper",limit:1,after:first.page.next_cursor!},OWN.portfolio_id);
    const filtered=await service.read(f.principal,"PORTFOLIO",{environment:"paper",filters:[{field:"alpha_id",op:"EQ",value:OWN.alpha_id}]},OWN.portfolio_id);
    expect([...first.items,...second.items].map(x=>x.alpha_id)).toEqual([OWN.alpha_id,PEER.alpha_id]);
    expect(filtered.items.map(x=>x.alpha_id)).toEqual([OWN.alpha_id]);
    for(const response of [first,second,filtered]){
      expect(response.scores.composition).toEqual({value:"80",status:"available"});
      expect(response.scores.direct_nav).toEqual({value:"60",status:"available"});
      expect(response.composition_details).toEqual(first.composition_details);
    }
  });
  it("invalidates an outstanding cursor after allocation authority is revoked, without overwriting its stored revision",async()=>{
    const fx=compositionInput(),installed=compositionInstallation(fx),runtime=new ExecutionManagerRuntime(pool,installed.installation);runtimes.push(runtime);
    await runtime.tick();expect(runtime.status().state).toBe("TICK_OK");
    const f=compositionReader(fx),service=new ManagerModelService(pool,f.scopes,f.config,runtime),repo=new ManagerModelRepository(pool);
    const before=await repo.document(scope.workspace_id,scope.environment,scope.profile_id,fx.d.document.revision);
    const first=await service.read(f.principal,"PORTFOLIO",{environment:"paper",limit:1},OWN.portfolio_id);
    expect(first.page.next_cursor).toBeTypeOf("string");expect(revokeApprovedManagerAllocation(fx.handle)).toBe(true);
    await expect(service.read(f.principal,"PORTFOLIO",{environment:"paper",limit:1,after:first.page.next_cursor!},OWN.portfolio_id))
      .rejects.toMatchObject({code:"EXECUTION_READ_NOT_AVAILABLE",status:400});
    const fresh=await service.read(f.principal,"PORTFOLIO",{environment:"paper",limit:1},OWN.portfolio_id);
    expect(fresh.scores.composition.value).toBeNull();expect(fresh.composition_details??[]).toEqual([]);
    expect(await repo.document(scope.workspace_id,scope.environment,scope.profile_id,fx.d.document.revision)).toEqual(before);
  });
  it("runs the installed materializer, reuses immutable Score on lost ACK and releases its lease on shutdown",async()=>{
    const d=input(),handle=policy(),task=scoreTask(d.document);let ack=0;
    const tasks=vi.fn(async()=>[{slot:"RAW" as const,task}]);
    const installation:ManagerRuntimeInstallation={trust:unqualifiedAccessTrust,cadence_ms:1000,maximum_publication_reads:1,
      partitions:[{scope,commissioning:commissioning().handle,bounds,publication:async()=>d.publication,
        source:{read:async()=>structuredClone(d),recheck:async()=>({}),acknowledge:async()=>{if(++ack===1)throw new Error("SYNTHETIC_ACK_LOST");}},
        score:{runtime:scoreRuntime(),maximum_tasks_per_revision:2,currentPolicy:()=>handle,tasks}}]};
    const runtime=new ExecutionManagerRuntime(pool,installation);runtimes.push(runtime);
    await runtime.tick();expect(runtime.status().state).toBe("TICK_REFUSED");
    const repo=new ManagerModelRepository(pool),first=await repo.document(scope.workspace_id,scope.environment,scope.profile_id,d.document.revision);
    expect(first).not.toBeNull();expect(first!.precomputed_scores![0].quality.value).toBeTypeOf("string");
    await runtime.tick();expect(runtime.status().state).toBe("TICK_OK");expect(tasks).toHaveBeenCalledOnce();
    const second=await repo.document(scope.workspace_id,scope.environment,scope.profile_id,d.document.revision);
    expect(second).toEqual(first);expect(ack).toBe(2);
    expect(runtime.scoreFence.accepts(second!.precomputed_scores![0])).toBe(true);
    await runtime.beforeApplicationShutdown();
    expect((await pool.query("SELECT holder_id FROM execution_manager_consumer_fences")).rows[0].holder_id).toBeNull();
  });
  it("keeps unrelated existing publication readers and refuses source-precomputed numbers",async()=>{
    const d=input(),fallback=vi.fn(async()=>null),trust={...unqualifiedAccessTrust,readPublication:fallback};
    const installation:ManagerRuntimeInstallation={trust,cadence_ms:1000,maximum_publication_reads:1,partitions:[{scope,
      commissioning:commissioning().handle,bounds,publication:async()=>d.publication,
      source:{read:async()=>({...d,document:{...d.document,precomputed_scores:[]}}),recheck:async()=>({}),acknowledge:vi.fn()}}]};
    const runtime=new ExecutionManagerRuntime(pool,installation);runtimes.push(runtime);
    const access=runtime.accessTrust()!;await access.readPublication!({...scope,binding:{...d.publication.authority.binding,dataset_id:"another-qualified-family"}});
    expect(fallback).toHaveBeenCalledOnce();await runtime.tick();expect(runtime.status().state).toBe("TICK_REFUSED");
    expect((await pool.query("SELECT count(*)::int AS n FROM execution_manager_model_revisions")).rows[0].n).toBe(0);
  });
  it("bounds publication concurrency and aborts its installed callback on shutdown",async()=>{
    const d=input();let entered!:()=>void;const started=new Promise<void>(resolve=>{entered=resolve;});
    let finishCleanup!:()=>void;const cleanup=new Promise<void>(resolve=>{finishCleanup=resolve;});
    const publication=vi.fn((_request:unknown,signal:AbortSignal)=>new Promise<null>((_resolve,reject)=>{
      entered();signal.addEventListener("abort",()=>{void cleanup.then(()=>reject(signal.reason));},{once:true});
    }));
    const installation:ManagerRuntimeInstallation={trust:unqualifiedAccessTrust,cadence_ms:1000,maximum_publication_reads:1,
      partitions:[{scope,commissioning:commissioning().handle,bounds,publication,
        source:{read:async()=>null,recheck:async()=>({}),acknowledge:async()=>{}}}]};
    const runtime=new ExecutionManagerRuntime(pool,installation);runtimes.push(runtime);
    const access=runtime.accessTrust()!,request={...scope,binding:d.publication.authority.binding};
    const flight=access.readPublication!(request);const refused=expect(flight).rejects.toThrow("MANAGER_RUNTIME_STOPPED");
    await started;
    await expect(access.readPublication!(request)).rejects.toThrow("MANAGER_PUBLICATION_CAPACITY");
    const shutdown=runtime.beforeApplicationShutdown();await Promise.resolve();
    expect(runtime.status().state).not.toBe("STOPPED");finishCleanup();
    await shutdown;await refused;expect(publication).toHaveBeenCalledOnce();
    await expect(access.readPublication!(request)).rejects.toThrow("MANAGER_PUBLICATION_CAPACITY");
  });
});
