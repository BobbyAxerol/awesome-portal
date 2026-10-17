/** Compiled production constructors + disposable PG, SYNTHETIC configured
 * providers/pins only. This is not source transport, calibration or runtime acceptance. */
import "reflect-metadata";
import { createHash, randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AppModule } from "../src/app.module";
import { accessDigest } from "../src/execution-v2/access-policy";
import { unqualifiedAccessTrust } from "../src/execution-v2/access-trust";
import type { DelegatedReceiptScope } from "../src/execution-v2/access-delegated-receipt";
import { ExecutionManagerRuntime, type ManagerRuntimeInstallation } from "../src/execution-v2/manager-runtime";
import { loadPublicationCommissioning, qualifyDatasetPublication, withCataloguePublications } from "../src/execution-v2/publication-adapter";
import { EXECUTION_PUBLICATION_CATALOGUE } from "../src/execution-v2/publication-source.generated";
import { ManagerScoreRuntime, loadApprovedManagerScorePolicy, managerScorePolicyHash, managerScorePublicationCurrent, managerScorePublicationPolicyCurrent,
  managerScoreRestatementPolicy, type ApprovedManagerScorePolicy,
  type ManagerScoreRuntimePolicyArtifact, type ManagerScoreRuntimeTask } from "../src/execution-v2/manager-score-runtime";
import { managerScorePublication, type ManagerScorePublication } from "../src/execution-v2/manager-score-publication.contract";
import { ManagerScoreOriginalCustody, captureManagerScoreOriginalInputs, decodeRetainedManagerScoreOriginal,
  type ManagerScoreOriginalCustodySnapshot } from "../src/execution-v2/manager-score-original-custody";
import { ManagerScoreRestatement, decodeRetainedManagerScoreRestatement,
  type ManagerScoreRestatementSnapshot } from "../src/execution-v2/manager-score-restatement";
import type { ManagerScoreRecalculationTask } from "../src/execution-v2/manager-score-recalculation";
import { ManagerCompositionHistoricalRuntime, decodeRetainedManagerCompositionRestatement }
  from "../src/execution-v2/manager-composition-restatement";
import { ManagerScoreHistoryStore } from "../src/execution-v2/manager-score-history.store";
import { managerScorePopulationDigest } from "../src/execution-v2/manager-score-publication";
import { ManagerModelRepository } from "../src/execution-v2/manager-model.store";
import type { ManagerModelDocument } from "../src/execution-v2/manager-model.contract";
import type { DatasetPublication } from "../src/execution-v2/publication.contract";
import { queryManagerModel } from "../src/execution-v2/manager-model";
import { ManagerModelService } from "../src/execution-v2/manager-model.service";
import { ManagerModelController } from "../src/execution-v2/manager-model.controller";
import { ManagerCompositionRuntime, loadApprovedManagerAllocation, revokeApprovedManagerAllocation,
  captureManagerCompositionOriginalAllocation, restoreManagerCompositionOriginalAllocation,
  managerCompositionRetainedAllocationInputs,
  managerCompositionPublicationCurrent, managerCompositionPublicationForRead,
  type ManagerAllocationArtifact, type ManagerAllocationApprovalPin,
  type ManagerCompositionRuntimeTask } from "../src/execution-v2/manager-composition-runtime";
import { managerCompositionPublication } from "../src/execution-v2/manager-composition-publication.contract";
import { ManagerRegimeRuntime,loadApprovedManagerRegimePolicy,loadVerifiedManagerRegimeEvidence,
  restoreManagerRegimeOriginal,managerRegimeRetainedInputs,revokeApprovedManagerRegimePolicy,
  type ManagerRegimeRuntimeTask } from "../src/execution-v2/manager-regime-runtime";
import { fixture as regimeFixture,policyInput as regimePolicyInput,evidenceInput as regimeEvidenceInput }
  from "./helpers/manager-regime";
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
      approved_at_ms:fx.pin.grouping_pin?.approved_at_ms??fx.pin.approved_at_ms,valid_until_ms:fx.pin.valid_until_ms},
    nav_pin:artifact.nav_partition===null?null:{artifact_digest:accessDigest(artifact.nav_partition),approval_ref:"SYNTHETIC_NOT_OWNER_NAV_APPROVAL",
      approved_at_ms:fx.pin.nav_pin?.approved_at_ms??fx.pin.approved_at_ms,valid_until_ms:fx.pin.valid_until_ms}};
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

/** Synthetic original-custody boundaries; actual gate receipts live in ELP2-06. */
type CompositionOriginalCustody = Extract<ReturnType<typeof captureManagerCompositionOriginalAllocation>, {status:"READY"}>["custody"];
type CompositionRetainedHandle = Extract<ReturnType<typeof restoreManagerCompositionOriginalAllocation>, {status:"READY"}>["handle"];
const originalAbsence=(suffix:string)=>({status:"NOT_PUBLISHED",reason_code:`COMPOSITION_ORIGINAL_CUSTODY_${suffix}`});
async function compositionOriginal(fx=compositionInput(),allocation=fx.handle) {
  const calculated=await calculatedComposition(fx,allocation,()=>now);
  const document:ManagerModelDocument={...structuredClone(fx.d.document),precomputed_scores:structuredClone(calculated.raw),
    precomputed_compositions:[structuredClone(calculated.publication)]};
  const request={allocation,document,publication:calculated.publication,raw_fence:calculated.fence,maximum_bytes:65_536};
  const result=captureManagerCompositionOriginalAllocation(request,()=>now);
  if(result.status!=="READY")throw new Error(JSON.stringify(result));
  return {fx,...calculated,document,request,custody:result.custody};
}
function restoredComposition(custody:CompositionOriginalCustody,document:ManagerModelDocument,readAt=now) {
  return restoreManagerCompositionOriginalAllocation({custody,expected_custody_digest:custody.custody_digest,document,maximum_bytes:65_536},()=>readAt);
}
function requireRetainedComposition(custody:CompositionOriginalCustody,document:ManagerModelDocument,readAt=now) {
  const result=restoredComposition(custody,document,readAt);
  if(result.status!=="READY")throw new Error(JSON.stringify(result));return result.handle;
}
function rehashCompositionCustody(custody:CompositionOriginalCustody) {
  const {custody_digest:_old,...base}=custody;custody.custody_digest=accessDigest(base);return custody;
}

describe("ELP2-06 original Composition custody — synthetic pure/runtime inputs, not source authority",()=>{
  it("preserves exact BOM/whitespace allocation bytes and returns detached original inputs after current allocation changes",async()=>{
    const fx=compositionInput(),candidate=compositionCandidate(fx);
    const bytes="\ufeff"+JSON.stringify(candidate.artifact,null,2)+"\n";
    const pin={...candidate.pin,artifact_sha256:hash(bytes)};
    const loaded=loadApprovedManagerAllocation({artifact_bytes:bytes,approval_pin:pin,scope:candidate.artifact.scope,as_of_ms:now});
    if(loaded.status!=="READY")throw new Error(JSON.stringify(loaded));
    const original=await compositionOriginal(fx,loaded.handle);
    expect(original.custody.artifact_utf8).toBe(bytes);expect(hash(original.custody.artifact_utf8)).toBe(pin.artifact_sha256);
    expect(original.custody.source.payload_digest).toBe(accessDigest(original.document));
    expect(original.publication.result.value).toBe("80");
    // A separate current synthetic allocation changes weights; historical custody never reads it.
    const changed=compositionInput(),artifact=structuredClone(changed.artifact);
    artifact.rows[0].allocated_economic_capital="20";artifact.rows[1].allocated_economic_capital="80";
    artifact.allocation_revision="SYNTHETIC:allocation-r2";artifact.allocation_snapshot_id="SYNTHETIC:snapshot-r2";
    artifact.nav_partition!.rows[0].current_nav_allocated_capital="20";artifact.nav_partition!.rows[1].current_nav_allocated_capital="80";
    artifact.nav_partition!.idle_cash="0";
    const next=requireCompositionAllocation(compositionCandidate(changed,artifact));
    const current=await calculatedComposition(changed,next,()=>now);expect(current.publication.result.value).toBe("58");
    revokeApprovedManagerAllocation(loaded.handle);
    const retained=requireRetainedComposition(original.custody,original.document,pin.valid_until_ms+60_000);
    const first=managerCompositionRetainedAllocationInputs(retained)!,second=managerCompositionRetainedAllocationInputs(retained)!;
    expect(first.artifact.rows.map(row=>row.allocated_economic_capital)).toEqual(["60","20"]);
    expect(first.custody.artifact_utf8).toBe(bytes);expect(first.approval).toEqual(pin);
    expect(first).not.toBe(second);expect(first.artifact).not.toBe(second.artifact);expect(Object.isFrozen(first.artifact.rows)).toBe(true);
    expect(Reflect.set(first.artifact.rows[0],"allocated_economic_capital","999")).toBe(false);
    expect(managerCompositionRetainedAllocationInputs(retained)!.artifact.rows[0].allocated_economic_capital).toBe("60");
  });
  it("cannot turn a retained, cloned or JSON handle into current allocation authority",async()=>{
    const f=await compositionOriginal(),retained=requireRetainedComposition(f.custody,f.document);
    expect(managerCompositionRetainedAllocationInputs({} as CompositionRetainedHandle)).toBeNull();
    expect(managerCompositionRetainedAllocationInputs(JSON.parse(JSON.stringify(retained)))).toBeNull();
    expect(managerCompositionRetainedAllocationInputs(f.fx.handle as unknown as CompositionRetainedHandle)).toBeNull();
    const forged=retained as unknown as typeof f.fx.handle;
    await expect(compositionRuntime(()=>now).calculate({...f.fx.task,allocation:forged,raw_scores:f.raw},f.fence))
      .rejects.toMatchObject({code:"COMPOSITION_ALLOCATION_NOT_APPROVED"});
    expect(managerCompositionPublicationCurrent(forged,f.publication,f.raw,f.fence,now)).toBe(false);
  });
  it.each(["zero","partial","missing"] as const)("retains %s q without replacing null with zero or dropping the denominator",async kind=>{
    const fx=compositionInput(kind==="partial");
    for(const item of fx.scoreTasks.filter(value=>value.slot==="RAW")){
      if(item.task.input.kind!=="METRICS")throw new Error("SYNTHETIC_FIXTURE_KIND");
      if(kind==="zero")item.task.input.quality.metrics={net_excess_twr:"-0.02",sharpe_period:"0",mdd:"0.1",add:"0.04",positive_block_ratio:"0",stress_excess_twr:"-0.02"};
      if(kind==="missing")item.task.input.quality.metrics.sharpe_period=null;
    }
    const f=await compositionOriginal(fx),restored=requireRetainedComposition(f.custody,f.document);
    expect(managerCompositionRetainedAllocationInputs(restored)!.artifact.rows.map(row=>row.allocated_economic_capital)).toEqual(["60","20"]);
    expect(f.publication.result).toMatchObject(kind==="zero"?{value:"0",status:"available",score_coverage_allocated:"1"}:
      kind==="partial"?{value:null,status:"partial_coverage",score_coverage_allocated:"0.75",bounds:{lower:"67.5",upper:"92.5"}}:
      {value:null,status:"partial_coverage",score_coverage_allocated:"0",bounds:{lower:"0",upper:"100"}});
  });
  it("retains verified empty no_allocation, not an invented zero score",async()=>{
    const fx=compositionInput(),artifact=structuredClone(fx.artifact);
    artifact.population=[];artifact.rows=[];artifact.binding.tuple_population_digest=accessDigest([]);artifact.source_set_digest=accessDigest([]);
    artifact.grouping=null;artifact.nav_partition=null;
    fx.d.document.members=[];fx.d.document.facts=[];fx.d.document.source_set_digest=artifact.source_set_digest;
    fx.task.binding=artifact.binding;fx.task.source_set_digest=artifact.source_set_digest;fx.scoreTasks=[];
    const allocation=requireCompositionAllocation(compositionCandidate(fx,artifact)),f=await compositionOriginal(fx,allocation);
    expect(f.publication.result).toMatchObject({value:null,status:"no_allocation",total_allocated_capital:"0",score_coverage_allocated:null});
    expect(managerCompositionRetainedAllocationInputs(requireRetainedComposition(f.custody,f.document))!.artifact.rows).toEqual([]);
  });
  it("optional capture refusal leaves original source/publication bytes untouched",async()=>{
    const f=await compositionOriginal(),before=JSON.stringify({document:f.document,publication:f.publication});
    for(const maximum_bytes of [0,1,NaN,Infinity,1.5,8*1024*1024+1])
      expect(captureManagerCompositionOriginalAllocation({...f.request,maximum_bytes},()=>now)).toEqual(originalAbsence("BOUND"));
    expect(restoreManagerCompositionOriginalAllocation({custody:f.custody,expected_custody_digest:f.custody.custody_digest,
      document:f.document,maximum_bytes:1},()=>now)).toEqual(originalAbsence("BOUND"));
    expect(JSON.stringify({document:f.document,publication:f.publication})).toBe(before);
    expect(captureManagerCompositionOriginalAllocation({...f.request,allocation:{} as typeof f.fx.handle},()=>now)).toEqual(originalAbsence("NOT_APPROVED"));
    expect(captureManagerCompositionOriginalAllocation(f.request,()=>f.fx.pin.valid_until_ms)).toEqual(originalAbsence("NOT_CURRENT"));
  });
  it("captures only exact source, complete correlated census and original RAW/publication references",async()=>{
    const f=await compositionOriginal();
    for(const kind of ["revision","qualification","missing-member","duplicate-member","changed-stage","missing-publication","duplicate-publication","raw-digest"] as const){
      const document=structuredClone(f.document);
      if(kind==="revision")document.revision="SYNTHETIC:other";
      if(kind==="qualification")document.qualification="TEST_ONLY" as typeof document.qualification;
      if(kind==="missing-member")document.members.pop();
      if(kind==="duplicate-member")document.members.push(structuredClone(document.members[0]));
      if(kind==="changed-stage")document.members[0].stage="SANDBOX";
      if(kind==="missing-publication")document.precomputed_compositions=[];
      if(kind==="duplicate-publication")document.precomputed_compositions!.push(structuredClone(f.publication));
      if(kind==="raw-digest")document.precomputed_scores![0].provenance.calculation_revision="SYNTHETIC:substituted";
      const suffix=kind==="revision"||kind==="qualification"?"SOURCE_MISMATCH":
        ["missing-member","duplicate-member","changed-stage"].includes(kind)?"POPULATION_MISMATCH":"PUBLICATION_MISMATCH";
      expect(captureManagerCompositionOriginalAllocation({...f.request,document},()=>now),kind).toEqual(originalAbsence(suffix));
    }
  });
  it("checks the independent expected digest even when an attacker recomputes the custody self-hash",async()=>{
    const f=await compositionOriginal();
    const mutations:Array<(c:CompositionOriginalCustody)=>void>=[
      c=>{c.source.source_epoch="SYNTHETIC:other";},c=>{c.binding.subject_id="SYNTHETIC:other";},
      c=>{c.artifact_utf8+="\n";},c=>{c.approval_pin.approval_ref="SYNTHETIC:substituted";},
      c=>{c.original_publication_digest=hash("wrong");},c=>{c.population_census_digest=hash("wrong");},c=>{c.captured_at_ms++;}
    ];
    for(const mutate of mutations){const custody=structuredClone(f.custody);mutate(custody);rehashCompositionCustody(custody);
      expect(restoreManagerCompositionOriginalAllocation({custody,expected_custody_digest:f.custody.custody_digest,
        document:f.document,maximum_bytes:65_536},()=>now)).toEqual(originalAbsence("DIGEST_MISMATCH"));}
  });
  it("rejects changed actual source document even when the outer custody remains authentic",async()=>{
    const f=await compositionOriginal();
    for(const change of [(d:ManagerModelDocument)=>{d.source_sequence="2";},(d:ManagerModelDocument)=>{d.projection_generation="SYNTHETIC:g2";},
      (d:ManagerModelDocument)=>{d.precomputed_scores![0].provenance.calculation_revision="SYNTHETIC:other";},
      (d:ManagerModelDocument)=>{d.precomputed_compositions![0].provenance.calculation_revision="SYNTHETIC:other";}]){
      const document=structuredClone(f.document);change(document);
      expect(restoredComposition(f.custody,document)).toEqual(originalAbsence("SOURCE_MISMATCH"));}
  });
  it("also verifies intrinsic artifact, census, original publication and time if an external test pin is deliberately changed",async()=>{
    const f=await compositionOriginal();
    // These deliberately replaced TEST_ONLY expected pins exercise deeper corruption checks;
    // they do NOT establish permission for a source/client to replace an independent pin.
    const cases:Array<[string,(c:CompositionOriginalCustody)=>void]>=[
      ["ARTIFACT_INVALID",c=>{c.artifact_utf8+="\n";}],
      ["DIGEST_MISMATCH",c=>{c.population_census_digest=hash("wrong");}],
      ["PUBLICATION_MISMATCH",c=>{c.original_publication_digest=hash("wrong");}],
      ["ORIGINAL_TIME_INVALID",c=>{c.captured_at_ms=now+1;}],
      ["ORIGINAL_TIME_INVALID",c=>{c.captured_at_ms=now-1;}],
      ["ORIGINAL_TIME_INVALID",c=>{c.captured_at_ms=f.fx.pin.valid_until_ms;}]
    ];
    for(const [suffix,mutate] of cases){const custody=structuredClone(f.custody);mutate(custody);rehashCompositionCustody(custody);
      expect(restoredComposition(custody,f.document,suffix==="ORIGINAL_TIME_INVALID"&&custody.captured_at_ms>now+1?custody.captured_at_ms:now),suffix)
        .toEqual(originalAbsence(suffix));}
  });
  it("rejects own accessors, symbols and nonplain descriptors without invoking them",async()=>{
    const f=await compositionOriginal();let reads=0;
    const request={...f.request};Object.defineProperty(request,"document",{enumerable:true,get(){reads++;return f.document;}});
    expect(captureManagerCompositionOriginalAllocation(request,()=>now)).toEqual(originalAbsence("INVALID"));
    const fence={};Object.defineProperty(fence,"accepts",{enumerable:true,get(){reads++;return f.fence.accepts;}});
    expect(captureManagerCompositionOriginalAllocation({...f.request,raw_fence:fence as typeof f.fence},()=>now)).toEqual(originalAbsence("INVALID"));
    const document=structuredClone(f.document);Object.defineProperty(document.members[0],"name",{enumerable:true,get(){reads++;return "secret";}});
    expect(captureManagerCompositionOriginalAllocation({...f.request,document},()=>now)).toEqual(originalAbsence("INVALID"));
    expect(captureManagerCompositionOriginalAllocation({...f.request,[Symbol("secret")]:true} as typeof f.request,()=>now)).toEqual(originalAbsence("INVALID"));
    expect(captureManagerCompositionOriginalAllocation(Object.assign(Object.create({secret:true}),f.request),()=>now)).toEqual(originalAbsence("INVALID"));
    expect(reads).toBe(0);
  });
  it("rejects outer and nested Proxies before reflection, including expected-digest objects and clock functions",async()=>{
    const f=await compositionOriginal();let traps=0;
    const proxy=<T extends object>(target:T):T=>new Proxy(target,{get(){traps++;throw new Error("PRIVATE_PROXY");},
      getPrototypeOf(){traps++;throw new Error("PRIVATE_PROXY");},ownKeys(){traps++;throw new Error("PRIVATE_PROXY");},
      getOwnPropertyDescriptor(){traps++;throw new Error("PRIVATE_PROXY");},apply(){traps++;throw new Error("PRIVATE_PROXY");}});
    for(const request of [proxy({...f.request}),{...f.request,document:proxy(f.document)},
      {...f.request,document:{...f.document,members:[proxy(f.document.members[0]),...f.document.members.slice(1)]}},
      {...f.request,publication:proxy(f.publication)},{...f.request,raw_fence:proxy(f.fence)}])
      expect(captureManagerCompositionOriginalAllocation(request,()=>now)).toEqual(originalAbsence("INVALID"));
    const restore={custody:f.custody,expected_custody_digest:f.custody.custody_digest,document:f.document,maximum_bytes:65_536};
    expect(restoreManagerCompositionOriginalAllocation(proxy(restore),()=>now)).toEqual(originalAbsence("INVALID"));
    expect(restoreManagerCompositionOriginalAllocation({...restore,custody:{...f.custody,approval_pin:proxy(f.custody.approval_pin)}},()=>now))
      .toEqual(originalAbsence("INVALID"));
    const digestObject={};for(const key of ["then","catch","constructor"])Object.defineProperty(digestObject,key,
      {enumerable:true,get(){traps++;return undefined;}});
    const revoked=Proxy.revocable({},{});revoked.revoke();
    for(const value of [digestObject,proxy({}),revoked.proxy])expect(restoreManagerCompositionOriginalAllocation({...restore,
      expected_custody_digest:value as unknown as string},()=>now)).toEqual(originalAbsence("INVALID"));
    const digestGetter={...restore};Object.defineProperty(digestGetter,"expected_custody_digest",
      {enumerable:true,get(){traps++;return f.custody.custody_digest;}});
    expect(restoreManagerCompositionOriginalAllocation(digestGetter,()=>now)).toEqual(originalAbsence("INVALID"));
    expect(captureManagerCompositionOriginalAllocation(f.request,proxy(()=>now))).toEqual(originalAbsence("INVALID"));
    expect(restoreManagerCompositionOriginalAllocation(restore,proxy(()=>now))).toEqual(originalAbsence("INVALID"));
    expect(traps).toBe(0);
  });
  it("detaches caller-owned custody data before retaining the original allocation",async()=>{
    const f=await compositionOriginal(),custody=structuredClone(f.custody),handle=requireRetainedComposition(custody,f.document);
    custody.artifact_utf8="attacker";custody.approval_pin.approval_ref="changed";
    expect(managerCompositionRetainedAllocationInputs(handle)!.custody).toEqual(f.custody);
  });
});

const compositionV3Limits={maximum_bundle_bytes:262_144,maximum_revisions_per_source:4,maximum_retained_bytes_per_source:1_048_576};
const compositionV3Config={...compositionV3Limits,calculation_revision:"SYNTHETIC:v3-restated",
  input_method_revision:"SYNTHETIC:v3-original-wrapper"};
function compositionV3ScoreInputs(fx:ReturnType<typeof compositionInput>) {
  // Existing composition fixture tasks come from a RuntimeTask and contain
  // policy:null. Actual worker excludes policy from input bytes. The provider
  // for this opt-in fixture must supply the genuine policy-free task shape.
  return fx.scoreTasks.map(({slot,task})=>{const {policy:_policy,...original}=task;return {slot,task:original};});
}
async function compositionV3Fixture(kind:"full"|"partial"|"composition-only"|"empty"="full"){
  const fx=compositionInput(kind==="partial");let allocation=fx.handle;
  if(kind==="composition-only")fx.scoreTasks=[];
  if(kind==="empty"){
    const artifact=structuredClone(fx.artifact);artifact.population=[];artifact.rows=[];artifact.source_set_digest=accessDigest([]);
    artifact.binding.tuple_population_digest=accessDigest([]);artifact.grouping=null;artifact.nav_partition=null;
    fx.d.document.members=[];fx.d.document.facts=[];fx.d.document.source_set_digest=artifact.source_set_digest;
    fx.task.binding=artifact.binding;fx.task.source_set_digest=artifact.source_set_digest;fx.scoreTasks=[];
    allocation=requireCompositionAllocation(compositionCandidate(fx,artifact));
  }
  // Capture task bytes BEFORE the first worker await, as required by runtime.
  const inputs=captureManagerScoreOriginalInputs(compositionV3ScoreInputs(fx),compositionV3Limits.maximum_bundle_bytes);
  const f=await compositionOriginal(fx,allocation);return {...f,inputs};
}
/** Proposed helpers appended after commissioning fixture helpers, before its
 * describes. SYNTHETIC method/allocation/calibration/commissioning only.
 * No spec imports or production source/defaults. */
function dependentCompositionPolicy(asOf:number,name="B",upper="0.08"){
  const at=Date.now(),approved=at-500;
  const artifact:ManagerScoreRuntimePolicyArtifact={schema_version:"portal.execution.manager-score-policy-runtime.v1",
    scope:{...scope,catalogue_digest:catalogue},policy:{formula_id:"qbts_prb_v1_1",qualification:"RUNTIME_APPROVED",
      policy_id:"SYNTHETIC:dependent-policy-"+name,policy_hash:hash("unset"),formula_hash:hash("SYNTHETIC:formula"),
      calibration_snapshot_id:"SYNTHETIC:calibration-"+name,approved_policy_id:"SYNTHETIC:approval-"+name,
      comparable_basis_id:"SYNTHETIC:basis",duration_key:"SYNTHETIC:window",observation_frequency:"1h",calendar:"SYNTHETIC:calendar",
      timezone:"UTC",currency:"USDT",cash_reference_id:"SYNTHETIC:cash",cost_method:"SYNTHETIC:net",required_costs:["fees"],
      block_manifest_id:"SYNTHETIC:blocks",stress_policy_id:"SYNTHETIC:stress",stress_delta_bps:"5",
      anchors:{twr:["-0.02",upper],sharpe:["0","0.15"],mdd:["0","0.1"],add:["0","0.04"]},
      maturity:{minimum_samples:5,minimum_complete_blocks:2,minimum_duration_ms:100},canonical_decimal_places:12,
      issued_at_ms:approved-100,calibration_cutoff_ms:approved-200},
    runtime_config:{maximum_input_age_ms:100,minimum_window_ms:100,maximum_window_ms:10000,grid_method_ref:"SYNTHETIC:grid",
      flow_adjustment_method_ref:"SYNTHETIC:flows",ownership_method_ref:"SYNTHETIC:ownership",fx_method_ref:"SYNTHETIC:FX"}};
  artifact.policy.policy_hash=managerScorePolicyHash(artifact.policy);const bytes=JSON.stringify(artifact);
  const loaded=loadApprovedManagerScorePolicy({artifact_bytes:bytes,scope:artifact.scope,as_of_ms:at,
    approval_pin:{artifact_sha256:hash(bytes),scope:artifact.scope,policy_id:artifact.policy.policy_id,policy_hash:artifact.policy.policy_hash,
      formula_hash:artifact.policy.formula_hash,approved_policy_id:artifact.policy.approved_policy_id!,policy_revision:"SYNTHETIC:dependent-"+name,
      approval_ref:"SYNTHETIC_NOT_OWNER_APPROVAL:"+name,approved_at_ms:approved,valid_until_ms:at+120_000}});
  if(loaded.status!=="READY")throw new Error(JSON.stringify(loaded));
  const policy=managerScoreRestatementPolicy(loaded.handle,artifact.scope,at,at);
  if(!policy||approved<=asOf)throw new Error("SYNTHETIC_EXPECTED_LATER_POLICY");
  return {handle:loaded.handle,policy};
}
function dependentCompositionFixture(options:{missingMethod?:boolean;empty?:boolean;allZero?:boolean;compositionOnly?:boolean;stalePeer?:boolean}={}){
  const fx=compositionInput(),at=Date.now(),asOf=at-20_000,offset=asOf-fx.d.document.as_of_ms;
  // Shift known absolute times BEFORE any original worker/input hashing. Do not
  // shift durations, caps or ratios; one shared seen-set handles fixture aliases.
  const absolute=new Set(["as_of_ms","source_as_of_ms","recorded_through_ms","facts_through_ms","observed_at_ms",
    "effective_at_ms","recorded_at_ms","valid_from_ms","valid_to_ms","window_start_ms","window_end_ms","computed_at_ms",
    "approved_at_ms","valid_until_ms","issued_at_ms","expires_at_ms"]),seen=new Set<object>();
  const shift=(value:unknown):void=>{if(!value||typeof value!=="object"||seen.has(value))return;seen.add(value);
    for(const [key,item]of Object.entries(value)){if(absolute.has(key)&&typeof item==="number")Reflect.set(value,key,item+offset);else shift(item);}};
  for(const value of [fx.d,fx.artifact,fx.pin,fx.task,fx.scoreTasks])shift(value);
  fx.artifact.maximum_source_age_ms=120_000;fx.pin.valid_until_ms=at+120_000;
  if(fx.pin.nav_pin)fx.pin.nav_pin.valid_until_ms=at+120_000;
  fx.d.publication.expires_at_ms=at+120_000;
  if(options.stalePeer){const peer=fx.scoreTasks.find(item=>item.slot==="RAW"&&item.task.binding.subject_id===PEER.alpha_id)!;
    peer.task.input.quality.stale=true;}
  if(options.compositionOnly)fx.scoreTasks=[];
  if(options.allZero){for(const row of fx.artifact.rows)row.allocated_economic_capital="0";
    for(const fact of fx.d.document.facts)if(fact.kind==="allocation"||fact.kind==="current_nav")fact.metric.value="0";
    for(const row of fx.artifact.nav_partition!.rows)row.current_nav_allocated_capital="0";
    fx.artifact.nav_partition!.idle_cash=fx.artifact.nav_partition!.nav;}
  if(options.empty){fx.d.document.members=[];fx.d.document.facts=[];fx.scoreTasks=[];fx.d.publication.authority.tuples=[];
    fx.artifact.population=[];fx.artifact.rows=[];fx.artifact.grouping=null;fx.artifact.nav_partition=null;
    fx.artifact.source_set_digest=accessDigest([]);fx.artifact.binding.tuple_population_digest=accessDigest([]);
    fx.d.document.source_set_digest=accessDigest([]);fx.task.source_set_digest=accessDigest([]);}
  const candidate=compositionCandidate(fx),allocation=loadApprovedManagerAllocation({artifact_bytes:candidate.bytes,approval_pin:candidate.pin,
    scope:candidate.artifact.scope,as_of_ms:at});
  if(allocation.status!=="READY")throw new Error(JSON.stringify(allocation));fx.handle=allocation.handle;
  const later=dependentCompositionPolicy(asOf);
  const items:ManagerScoreRecalculationTask[]=compositionV3ScoreInputs(fx).map(item=>{
    const {task}=item;task.expected_policy_revision=null;
    // Explicit TEST_ONLY stand-in for independent SOURCE method proof known
    // before original calculation. The current policy does not mint this fact.
    if(options.missingMethod&&item.slot==="RAW"&&task.binding.subject_id===PEER.alpha_id)return item;
    const dep={source_revision:task.source_revision,source_set_digest:task.source_set_digest,source_as_of_ms:asOf,
      metrics_input_digest:accessDigest(task.input),method_digest:later.policy.method_digest,stress_delta_bps:"5",
      source_locator:"SYNTHETIC:pre-original-method-NOT-source-qualification"};
    task.metrics_dependency_digest=accessDigest(dep);return {...item,metrics_dependency:dep};
  });
  return {fx,items,later,asOf};
}
type CompositionV3Fixture=Awaited<ReturnType<typeof compositionV3Fixture>>;
type CompositionV3Snapshot=Extract<ManagerScoreOriginalCustodySnapshot,{schema_version:"portal.execution.manager-score-original-inputs.v3"}>;

/** Existing genuine Regime loaders/calculator, with explicitly SYNTHETIC
 * receipts rebased onto this test's actual135 source and wall-clock. No source
 * provider, production calibration or independent current-human qualification. */
function regimeForDocument(document:ManagerModelDocument){
  const f=regimeFixture("paper"),member=document.members[0];
  if(!member)throw new Error("SYNTHETIC_REGIME_MEMBER_REQUIRED");
  const targetScope={workspace_id:document.workspace_id,environment:document.environment,
    profile_id:document.profile_id,catalogue_digest:document.catalogue_digest};
  f.policy.scope=targetScope;f.evidence.scope=targetScope;
  const population=[{tuple:structuredClone(member.tuple),stage:member.stage}];
  f.evidence.population=population;Object.assign(f.evidence.binding,{subject_id:member.tuple.alpha_id,
    alpha_id:member.tuple.alpha_id,alpha_version_id:member.tuple.alpha_version_id,
    tuple_population_digest:managerScorePopulationDigest([member]),stage_filter:[member.stage]});
  f.evidence.research_binding.alpha_id=member.tuple.alpha_id;
  Object.assign(f.evidence,{source_revision:document.revision,projection_generation:document.projection_generation,
    source_set_digest:document.source_set_digest});
  for(const reference of f.evidence.references){reference.population=structuredClone(population);
    reference.binding.alpha_id=member.tuple.alpha_id;
    reference.deployment!.deployment_id=member.tuple.deployment_id;}
  const offset=document.as_of_ms-1000;
  const absolute=new Set(["source_as_of_ms","calibration_cutoff_ms","frozen_at_ms","binding_effective_at_ms",
    "binding_created_at_ms","run_completed_at_ms","artifact_available_at_ms","evidence_available_at_ms",
    "feature_cutoff_ms","closed_through_ms","available_at_ms","evaluation_at_ms","evidence_snapshot_available_at_ms",
    "created_at_ms","effective_from_ms","effective_to_ms","outcome_start_ms","outcome_end_ms","outcome_available_at_ms",
    "approved_at_ms","accepted_at_ms","valid_until_ms"]);
  const shift=(value:unknown):void=>{if(!value||typeof value!=="object")return;
    for(const [key,item]of Object.entries(value)){
      // Helper pins contain both copied already-shifted fields and explicit
      // small synthetic receipt clocks. Never shift an absolute field twice.
      if(absolute.has(key)&&typeof item==="number"&&item<=10_000)Reflect.set(value,key,item+offset);
      else shift(item);
    }};
  shift(f);f.evidence.maximum_source_age_ms=120_000;
  // TEST_ONLY source A is20s old for later-policy integration. Keep A and
  // reference clocks intact; match the explicit synthetic source lifetime.
  f.policy.policy.max_feature_age_ms=120_000;
  const pi=regimePolicyInput(f),ei=regimeEvidenceInput(f);shift(pi.approval_pin);shift(ei.source_pin);
  const at=Date.now();pi.as_of_ms=at;ei.as_of_ms=at;
  pi.approval_pin.valid_until_ms=at+120_000;ei.source_pin.valid_until_ms=at+120_000;
  const policy=loadApprovedManagerRegimePolicy(pi),evidence=loadVerifiedManagerRegimeEvidence(ei);
  if(policy.status!=="READY"||evidence.status!=="READY")throw new Error(JSON.stringify({policy,evidence}));
  const task:Omit<ManagerRegimeRuntimeTask,"policy"|"evidence">={scope:targetScope,binding:f.evidence.binding,
    source_revision:document.revision,projection_generation:document.projection_generation,
    source_set_digest:document.source_set_digest,source_as_of_ms:document.as_of_ms,source_qualification:"SOURCE_VERIFIED",
    calculation_revision:f.policy.calculation_revision,computed_at_ms:at};
  return {f,policy:policy.handle,evidence:evidence.handle,task};
}

describe.skipIf(!process.env.TEST_DATABASE_URL)("ELP2-06 ORIGINAL v3 — actual disposable PG / SYNTHETIC authority",()=>{
  const database="elp206_composition_v3_"+randomUUID().replaceAll("-","");
  const url=(name:string)=>{const u=new URL(process.env.TEST_DATABASE_URL!);u.pathname="/"+name;return u.toString();};
  const options={max:2,connectionTimeoutMillis:2000,query_timeout:4000};
  let pg:Pool;const ownedRuntimes:ExecutionManagerRuntime[]=[];
  beforeAll(async()=>{if(!/^elp206_composition_v3_[a-f0-9]{32}$/.test(database))throw new Error("TEST_ONLY_DB_NAME");
    const admin=new Pool({...options,max:1,connectionString:url("postgres")});
    try{await admin.query("CREATE DATABASE "+database);}finally{await admin.end();}
    pg=new Pool({...options,connectionString:url(database)});
    for(const file of ["1723680000135_execution-manager-models.sql","1723680000137_execution-manager-consumer-fence.sql",
      "1723680000138_execution-manager-calculation-revisions.sql","1723680000139_execution-manager-score-mode-heads.sql"])
      await pg.query(readFileSync(resolve(__dirname,"../migrations",file),"utf8").split("-- Down Migration")[0]);
  },60_000);
  beforeEach(async()=>{vi.restoreAllMocks();for(const runtime of ownedRuntimes.splice(0))await runtime.beforeApplicationShutdown();
    await pg.query("TRUNCATE execution_manager_score_mode_heads,execution_manager_calculation_heads,execution_manager_calculation_revisions,execution_manager_model_heads,execution_manager_model_revisions,execution_manager_consumer_fences");});
  afterAll(async()=>{vi.restoreAllMocks();for(const runtime of ownedRuntimes.splice(0))await runtime.beforeApplicationShutdown();await pg?.end();
    if(!/^elp206_composition_v3_[a-f0-9]{32}$/.test(database))throw new Error("TEST_ONLY_DB_NAME");
    const admin=new Pool({...options,max:1,connectionString:url("postgres")});
    try{await admin.query("DROP DATABASE IF EXISTS "+database+" WITH (FORCE)");}finally{await admin.end();}
  },60_000);
  async function tx<T>(body:(client:PoolClient)=>Promise<T>):Promise<T>{const client=await pg.connect();
    try{await client.query("BEGIN");await client.query("SET LOCAL statement_timeout='3000ms'");await client.query("SET LOCAL lock_timeout='1000ms'");
      const result=await body(client);await client.query("COMMIT");return result;
    }catch(error){await client.query("ROLLBACK").catch(()=>undefined);throw error;}finally{client.release();}}
  async function putSource(client:PoolClient,d:ManagerModelDocument){const key=[d.workspace_id,d.environment,d.profile_id];
    await client.query(`INSERT INTO execution_manager_model_revisions
      (workspace_id,environment,profile_id,revision,source_epoch,source_sequence,projection_generation,payload_digest,payload)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,[...key,d.revision,d.source_epoch,d.source_sequence,d.projection_generation,accessDigest(d),JSON.stringify(d)]);
    await client.query(`INSERT INTO execution_manager_model_heads
      (workspace_id,environment,profile_id,revision,source_epoch,source_sequence,projection_generation,payload_digest,catalogue_digest)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[...key,d.revision,d.source_epoch,d.source_sequence,d.projection_generation,accessDigest(d),d.catalogue_digest]);}
  const count=async(table:string)=>(await pg.query("SELECT count(*)::text AS n FROM "+table)).rows[0].n;
  const financialRows=async()=>(await pg.query("SELECT revision,payload::text,payload_digest,source_sequence::text,projection_generation FROM execution_manager_model_revisions ORDER BY revision")).rows;
  async function originalRow(){return (await pg.query(`SELECT h.calculation_key,r.payload_digest,r.payload,r.created_at::text
    FROM execution_manager_score_mode_heads h JOIN execution_manager_calculation_revisions r
    USING(workspace_id,environment,profile_id,source_revision,calculation_key) WHERE h.head_kind='ORIGINAL_INPUTS'`)).rows[0];}
  async function committedV3(input?:CompositionV3Fixture,custody=new ManagerScoreOriginalCustody(compositionV3Limits)){
    const f=input??await compositionV3Fixture();
    const prepared=custody.prepare(f.document,f.inputs,[f.custody]);
    await tx(async client=>{await putSource(client,f.document);expect(await custody.persist(client,prepared)).toBe("INSERTED");});
    return {f,custody,prepared};}
  function requireV3(snapshot:ManagerScoreOriginalCustodySnapshot|null):CompositionV3Snapshot{
    if(snapshot?.schema_version!=="portal.execution.manager-score-original-inputs.v3")throw new Error("TEST_ONLY_EXPECTED_V3");return snapshot;}

  /** Insert INSIDE the existing ORIGINAL-v3 disposable-PG describe after its
   * helper declarations. Reuse pg/tx/count/originalRow/financialRows/putSource/
   * ownedRuntimes; do not import a spec or create another DB/pool/harness.
   * All authority/source/method/policy pins SYNTHETIC. */
  const dependentCompositionRevision="SYNTHETIC:historical-composition-r1";
  const dependentConfig={...compositionV3Config,maximum_revisions_per_source:6};
  type DependentFixture=ReturnType<typeof dependentCompositionFixture>;
  type DependentV2=Extract<ManagerScoreRestatementSnapshot,{schema_version:"portal.execution.manager-score-restatement.v2"}>;
  function requireDependentV2(value:ManagerScoreRestatementSnapshot|null):DependentV2{
    if(value?.schema_version!=="portal.execution.manager-score-restatement.v2")throw new Error("SYNTHETIC_EXPECTED_RESTATED_V2");return value;
  }
  function dependentTransactionPool(after:(sql:string,client:PoolClient)=>Promise<void>):Pool{
    // Fault seam wraps only genuine calls on the disposable Pool/PoolClient;
    // actual INSERT/CAS/ROLLBACK/COMMIT and returned rows are not mocked.
    return new Proxy(pg,{get(target,key){if(key==="connect")return async()=>{
      const client=await target.connect();return new Proxy(client,{get(real,field){if(field==="query")return async(...args:unknown[])=>{
        const result=await(real.query.bind(real) as unknown as (...args:unknown[])=>Promise<unknown>)(...args);
        await after(String(args[0]),real);return result;};const value=Reflect.get(real,field,real);return typeof value==="function"?value.bind(real):value;}});
    };const value=Reflect.get(target,key,target);return typeof value==="function"?value.bind(target):value;}});
  }
  function installedDependent(data:DependentFixture=dependentCompositionFixture(),selectedPool=pg,extra:Partial<typeof dependentConfig>={}){
    const state:{policy:ApprovedManagerScorePolicy|null;pending:boolean;sourceRefused:boolean}={policy:null,pending:true,sourceRefused:false};
    const acknowledge=vi.fn(async()=>{state.pending=false;}),installed=compositionInstallation(data.fx,acknowledge);
    const partition=installed.installation.partitions[0],fixtureCommissioning=commissioning(),at=Date.now();
    fixtureCommissioning.pin.approved_at_ms=data.asOf-1000;fixtureCommissioning.pin.valid_until_ms=at+240_000;
    data.fx.d.publication.expires_at_ms=at+240_000; // Isolate Score expiry fault from source expiry below.
    partition.commissioning=loadPublicationCommissioning(fixtureCommissioning.bytes,fixtureCommissioning.pin,at);
    const historical=new ManagerCompositionHistoricalRuntime({maximum_rows:10,maximum_input_bytes:262_144,maximum_in_flight:1});
    const tasks=vi.fn(async()=>data.items),source={
      read:vi.fn(async()=>state.pending?structuredClone(data.fx.d):null),acknowledge,
      recheck:vi.fn(async()=>({assertCurrent:()=>{if(state.sourceRefused)throw new Error("SYNTHETIC_DEPENDENT_SOURCE_REFUSAL");}}))};
    partition.source=source;partition.score!.tasks=tasks;partition.score!.currentPolicy=()=>state.policy;
    partition.score!.restatement={...dependentConfig,...extra,composition:{runtime:historical,calculation_revision:dependentCompositionRevision}};
    // Retain original allocation handle in ordinary materializer. Later changes
    // below are a separate current allocation and must not alter retained inputs.
    installed.state.allocation=data.fx.handle;
    const runtime=new ExecutionManagerRuntime(selectedPool,installed.installation);ownedRuntimes.push(runtime);
    const coordinator=runtime.restatementFor(scope)!;
    const restart=(enabled=true,database=selectedPool,config=extra)=>new ManagerScoreRestatement({pool:database,
      runtime:partition.score!.runtime,currentPolicy:()=>state.policy,source,commissioning:partition.commissioning,
      publication:async()=>data.fx.d.publication,config:{...dependentConfig,...config},
      ...(enabled?{composition:{runtime:historical,calculation_revision:dependentCompositionRevision}}:{})});
    const idle=async(selected=coordinator)=>{
      const lease=(await pg.query("SELECT workspace_id,environment,profile_id,holder_id::text,fencing_token::text,lease_epoch::text FROM execution_manager_consumer_fences")).rows[0];
      if(!lease?.holder_id)throw new Error("SYNTHETIC_OWNED_LEASE_REQUIRED");
      await selected.idle({lease,signal:new AbortController().signal,deadline_ms:performance.now()+5000,transaction_timeout_ms:2000,lease_ttl_ms:4000});
    };
    const document=async()=>{const d=await new ManagerModelRepository(pg).document(scope.workspace_id,scope.environment,scope.profile_id,data.fx.d.document.revision);
      if(!d)throw new Error("SYNTHETIC_SOURCE_NOT_MATERIALIZED");return d;};
    return {data,state,installed,runtime,coordinator,historical,tasks,source,acknowledge,restart,idle,document};
  }
  type DependentHarness=ReturnType<typeof installedDependent>;
  async function retainedDependent(h:DependentHarness){const document=await h.document();
    return {document,snapshot:await h.coordinator.snapshot(document)};}
  async function restatedDependentRow(){return(await pg.query(`SELECT r.calculation_key,r.payload_digest,r.payload,r.created_at::text
    FROM execution_manager_score_mode_heads h JOIN execution_manager_calculation_revisions r
    USING(workspace_id,environment,profile_id,source_revision,calculation_key) WHERE h.head_kind='RESTATED_CURRENT_POLICY'`)).rows[0];}

  function installedRegimeOriginal(kind:"only"|"mixed"|"score"="only",optIn=true){
    const data=dependentCompositionFixture(),installed=compositionInstallation(data.fx),p=installed.installation.partitions[0];
    const rg=regimeForDocument(data.fx.d.document),state={pending:true,policy:null as ApprovedManagerScorePolicy|null,refuse:false};
    const acknowledge=vi.fn(async()=>{state.pending=false;}),tasks=vi.fn(async()=>data.items);
    p.source={read:vi.fn(async()=>state.pending?structuredClone(data.fx.d):null),acknowledge,
      recheck:async()=>({assertCurrent:()=>{if(state.refuse)throw new Error("SYNTHETIC_REGIME_SOURCE_REVOKED");}})};
    const cp=commissioning();cp.pin.approved_at_ms=data.asOf-1000;cp.pin.valid_until_ms=Date.now()+240_000;
    p.commissioning=loadPublicationCommissioning(cp.bytes,cp.pin,Date.now());data.fx.d.publication.expires_at_ms=Date.now()+240_000;
    if(kind==="only"){delete p.score;delete p.composition;}
    else{
      p.score!.tasks=tasks;p.score!.currentPolicy=()=>state.policy;
      p.score!.restatement={...dependentConfig,...(kind==="mixed"?{composition:{runtime:new ManagerCompositionHistoricalRuntime({
        maximum_rows:10,maximum_input_bytes:262_144,maximum_in_flight:1}),calculation_revision:dependentCompositionRevision}}:{})};
      if(kind==="score")delete p.composition;
    }
    p.regime={runtime:new ManagerRegimeRuntime({maximum_references:128,maximum_input_bytes:1_048_576,
      maximum_output_bytes:1_048_576,maximum_in_flight:1}),maximum_tasks_per_revision:1,
      currentPolicy:()=>rg.policy,currentEvidence:()=>rg.evidence,tasks:async()=>[rg.task],
      ...(optIn?{original_custody:{...compositionV3Limits,maximum_revisions_per_source:dependentConfig.maximum_revisions_per_source}}:{})};
    const runtime=new ExecutionManagerRuntime(pg,installed.installation);ownedRuntimes.push(runtime);
    const document=async()=>{const d=await new ManagerModelRepository(pg).document(scope.workspace_id,scope.environment,scope.profile_id,data.fx.d.document.revision);
      if(!d)throw new Error("SYNTHETIC_REGIME_SOURCE_NOT_MATERIALIZED");return d;};
    return {runtime,p,rg,data,state,tasks,acknowledge,document};
  }
  type OriginalV4=Extract<ManagerScoreOriginalCustodySnapshot,{schema_version:"portal.execution.manager-score-original-inputs.v4"}>;
  function requireV4(value:ManagerScoreOriginalCustodySnapshot|null):OriginalV4{
    if(value?.schema_version!=="portal.execution.manager-score-original-inputs.v4")throw new Error("SYNTHETIC_EXPECTED_V4");return value;
  }
it("empty Regime input preserves actual old v3 row/pointer/bytes/timestamp during genuine duplicate retry",async()=>{
  const h=await committedV3(),before=await originalRow(),financial=await financialRows(),
    snapshot=await tx(client=>h.custody.restore(client,h.f.document)),json=JSON.stringify(snapshot);
  const empty=h.custody.prepare(h.f.document,h.f.inputs,[h.f.custody],[]);
  expect(empty).toEqual(h.prepared);await tx(async client=>expect(await h.custody.persist(client,empty)).toBe("DUPLICATE"));
  expect(await originalRow()).toEqual(before);expect(await financialRows()).toEqual(financial);
  expect(JSON.stringify(await tx(client=>h.custody.restore(client,h.f.document)))).toBe(json);
  expect(requireV3(snapshot).retained_compositions[0].custody_digest).toBe(h.f.custody.custody_digest);
  expect(Object.hasOwn(snapshot!,"retained_regimes")).toBe(false);
});
it("stored three-family v4 still requires every Score/Composition/Regime sibling after an echoed rehash",async()=>{
  const h=installedRegimeOriginal("mixed");await h.runtime.tick();expect(h.runtime.status().state).toBe("TICK_OK");
  const d=await h.document(),stored=await originalRow(),source=await financialRows(),
    original=requireV4(await tx(client=>new ManagerScoreOriginalCustody(dependentConfig).restore(client,d)));
  for(const [family,code]of [["retained_tasks","MANAGER_ORIGINAL_INCOMPLETE_INPUT_SET"],
    ["retained_compositions","MANAGER_ORIGINAL_INCOMPLETE_COMPOSITION_SET"],
    ["retained_regimes","MANAGER_ORIGINAL_INPUT_BOUND"]] as const){
    const changed=structuredClone(original);changed[family].pop();
    expect(()=>decodeRetainedManagerScoreOriginal(d,{calculation_key:stored.calculation_key,payload:changed,
      payload_digest:stored.payload_digest},dependentConfig.maximum_bundle_bytes)).toThrow("MANAGER_ORIGINAL_DIGEST_MISMATCH");
    // Deliberately changed caller echo, not an immutable-parent rewrite.
    changed.inputs_digest=accessDigest({retained_tasks:changed.retained_tasks,
      retained_compositions:changed.retained_compositions,retained_regimes:changed.retained_regimes});
    changed.calculation_key=accessDigest({mode:"ORIGINAL_INPUTS",source:changed.source,inputs_digest:changed.inputs_digest});
    expect(()=>decodeRetainedManagerScoreOriginal(d,{calculation_key:changed.calculation_key,payload:changed,
      payload_digest:accessDigest(changed)},dependentConfig.maximum_bundle_bytes)).toThrow(code);
  }
  expect(await originalRow()).toEqual(stored);expect(await financialRows()).toEqual(source);
  expect(h.acknowledge).toHaveBeenCalledOnce();expect(await count("execution_manager_calculation_revisions")).toBe("1");
});
  it("Regime-only genuine worker → complete original-v4 →135/138/139 atomically, without Score config or implicit worker",async()=>{
    const h=installedRegimeOriginal();expect(h.runtime.restatementFor(scope)).toBeUndefined();
    await h.runtime.tick();expect(h.runtime.status().state).toBe("TICK_OK");
    const d=await h.document(),row=await originalRow(),snapshot=requireV4(await tx(client=>new ManagerScoreOriginalCustody(dependentConfig).restore(client,d)));
    expect(d.precomputed_scores).toBeUndefined();expect(d.precomputed_regimes).toHaveLength(1);
    expect(snapshot.retained_tasks).toEqual([]);expect(snapshot.retained_compositions).toEqual([]);expect(snapshot.retained_regimes).toHaveLength(1);
    expect(snapshot.source.payload_digest).toBe(accessDigest(d));expect(row.payload_digest).toBe(accessDigest(snapshot));
    expect(h.runtime.originalCustodyFor(scope)!.status()).toEqual({state:"ORIGINAL_INPUTS_STAGED",reason_code:null});
    expect(await count("execution_manager_calculation_heads")).toBe("0");expect(h.acknowledge).toHaveBeenCalledOnce();
    const history=await new ManagerScoreHistoryStore(pg).scan(d,3000);
    expect(history.original).toEqual(snapshot);expect(history.restatements).toEqual([]);
  });
  it("without new opt-in retains economic Regime but never writes retroactive original custody",async()=>{
    const h=installedRegimeOriginal("only",false);await h.runtime.tick();
    expect(h.runtime.status().state).toBe("TICK_OK");expect((await h.document()).precomputed_regimes).toHaveLength(1);
    expect(h.runtime.originalCustodyFor(scope)).toBeUndefined();expect(await count("execution_manager_calculation_revisions")).toBe("0");
    expect(h.acknowledge).toHaveBeenCalledOnce();
  });
  it("restores exact archived Regime bytes after current handle revocation and expiry without granting current authority",async()=>{
    const h=installedRegimeOriginal();await h.runtime.tick();const d=await h.document(),before=await originalRow(),financial=await financialRows();
    expect(revokeApprovedManagerRegimePolicy(h.rg.policy)).toBe(true);
    const clock=vi.spyOn(Date,"now").mockReturnValue(Date.now()+240_000);
    try{
      const snapshot=requireV4(await tx(client=>new ManagerScoreOriginalCustody(dependentConfig).restore(client,d))),entry=snapshot.retained_regimes[0];
      const restored=restoreManagerRegimeOriginal({custody:entry.custody,expected_custody_digest:entry.custody_digest,document:d,maximum_bytes:262_144});
      if(restored.status!=="READY")throw new Error(JSON.stringify(restored));
      expect(managerRegimeRetainedInputs(restored.handle)!.policy_artifact).toEqual(h.rg.f.policy);
      expect(snapshot.retained_regimes[0].custody.evidence_artifact_utf8).toBe(before.payload.retained_regimes[0].custody.evidence_artifact_utf8);
      expect(h.runtime.regimeFence.accepts(d.precomputed_regimes![0])).toBe(false);
    }finally{clock.mockRestore();}
    expect(await originalRow()).toEqual(before);expect(await financialRows()).toEqual(financial);
  });
  it("combined three-family source owns one ORIGINAL writer; Score IDLE retains existing dependent Composition without leaking Regime artifacts",async()=>{
    const h=installedRegimeOriginal("mixed"),coordinator=h.runtime.restatementFor(scope)!,attach=vi.spyOn(coordinator,"attach"),persist=vi.spyOn(coordinator,"persistAttached");
    await h.runtime.tick();expect(h.runtime.status().state).toBe("TICK_OK");
    const d=await h.document(),original=await originalRow(),financial=await financialRows(),snapshot=requireV4(await tx(client=>new ManagerScoreOriginalCustody(dependentConfig).restore(client,d)));
    expect(snapshot.retained_tasks).toHaveLength(3);expect(snapshot.retained_compositions).toHaveLength(1);expect(snapshot.retained_regimes).toHaveLength(1);
    expect(attach).not.toHaveBeenCalled();expect(persist).not.toHaveBeenCalled();
    h.state.policy=h.data.later.handle;await h.runtime.tick();expect(h.runtime.status().state).toBe("TICK_OK");
    const view=requireDependentV2((await coordinator.snapshot(d)).view);
    expect(view.entries).toHaveLength(3);expect(view.composition_entries[0].historical.result.value).toBe("80");
    expect(view.knowledge_cutoff_ms).toBeGreaterThanOrEqual(snapshot.retained_regimes[0].custody.captured_at_ms);
    expect(JSON.stringify(view)).not.toContain("policy_artifact_utf8");expect(JSON.stringify(view)).not.toContain("retained_regimes");
    const history=await new ManagerScoreHistoryStore(pg).scan(d,3000);expect(history.restatements).toHaveLength(1);
    expect(await originalRow()).toEqual(original);expect(await financialRows()).toEqual(financial);expect(h.acknowledge).toHaveBeenCalledOnce();
    expect(await count("execution_manager_calculation_revisions")).toBe("2");
  });
  it("v4 Score-only restatement cannot claim knowledge before original Regime capture even with a rehashed retained payload",async()=>{
    const h=installedRegimeOriginal("score");await h.runtime.tick();const d=await h.document();h.state.policy=h.data.later.handle;await h.runtime.tick();
    expect(h.runtime.status().state).toBe("TICK_OK");
    const original=requireV4(await tx(client=>new ManagerScoreOriginalCustody(dependentConfig).restore(client,d))),stored=await restatedDependentRow();
    const b=structuredClone(stored.payload) as Extract<ManagerScoreRestatementSnapshot,{schema_version:"portal.execution.manager-score-restatement.v1"}>;
    b.knowledge_cutoff_ms=b.policy.approved_at_ms+1;
    expect(b.knowledge_cutoff_ms).toBeLessThan(original.retained_regimes[0].custody.captured_at_ms);
    expect(b.knowledge_cutoff_ms).toBeGreaterThanOrEqual(Math.max(d.observed_at_ms,...original.retained_tasks.map(t=>t.task.computed_at_ms)));
    expect(()=>decodeRetainedManagerScoreRestatement({calculation_key:b.calculation_key,payload:b,payload_digest:accessDigest(b)},original,262_144,d))
      .toThrow("MANAGER_RESTATED_DIGEST_MISMATCH");
  });
  it("new optional full-bundle bound preserves source and ACK instead of writing a partial old custody version",async()=>{
    const h=installedRegimeOriginal(),lifecycle=h.runtime.originalCustodyFor(scope)!;
    // Narrow the explicit new installation cap before construction, not a
    // runtime/private-field mutation or a changed global supported ceiling.
    await h.runtime.beforeApplicationShutdown();ownedRuntimes.pop();
    h.p.regime!.original_custody={maximum_bundle_bytes:1,maximum_revisions_per_source:6,maximum_retained_bytes_per_source:1_048_576};
    const runtime=new ExecutionManagerRuntime(pg,{trust:unqualifiedAccessTrust,cadence_ms:1000,maximum_publication_reads:1,partitions:[h.p]});ownedRuntimes.push(runtime);
    await runtime.tick();expect(runtime.status().state).toBe("TICK_OK");expect((await h.document()).precomputed_regimes).toHaveLength(1);
    expect(runtime.originalCustodyFor(scope)!.status().state).toBe("ORIGINAL_INPUTS_NOT_RETAINED");
    expect(await count("execution_manager_calculation_revisions")).toBe("0");expect(h.acknowledge).toHaveBeenCalledOnce();
    expect(lifecycle.status().state).toBe("NOT_RUN");
  });
  it("final source refusal rolls back new Regime original and source together with zero ACK",async()=>{
    const h=installedRegimeOriginal(),lifecycle=h.runtime.originalCustodyFor(scope)!,persist=lifecycle.persistAttached.bind(lifecycle);
    vi.spyOn(lifecycle,"persistAttached").mockImplementation(async(client,delivery)=>{await persist(client,delivery);
      expect((await client.query("SELECT count(*)::text AS n FROM execution_manager_calculation_revisions")).rows[0].n).toBe("1");h.state.refuse=true;});
    await h.runtime.tick();expect(h.runtime.status().state).toBe("TICK_REFUSED");expect(h.acknowledge).not.toHaveBeenCalled();
    for(const table of ["execution_manager_model_revisions","execution_manager_model_heads","execution_manager_calculation_revisions","execution_manager_score_mode_heads"])
      expect(await count(table)).toBe("0");
  });
  it("unsafe optional PATH sidecar omits the WHOLE mixed original but financial source commits and ACKs",async()=>{
    const h=installedRegimeOriginal("mixed");let traps=0;
    Object.defineProperty(h.data.items[0],"path_dependency",{enumerable:true,get(){traps++;throw Error("SYNTHETIC_PRIVATE_PROOF");}});
    await h.runtime.tick();expect(h.runtime.status().state).toBe("TICK_OK");
    const d=await h.document();expect(d.precomputed_scores).toHaveLength(3);expect(d.precomputed_compositions).toHaveLength(1);expect(d.precomputed_regimes).toHaveLength(1);
    expect(h.runtime.originalCustodyFor(scope)!.status()).toEqual({state:"ORIGINAL_INPUTS_NOT_RETAINED",reason_code:"ORIGINAL_SCORE_PROOF_NOT_RETAINED"});
    expect(await count("execution_manager_calculation_revisions")).toBe("0");expect(await count("execution_manager_score_mode_heads")).toBe("0");
    expect(h.acknowledge).toHaveBeenCalledOnce();expect(traps).toBe(0);
  });
  it("lost ACK/restart reuses exact new Regime original, no recalculate or new capture, and retains row timestamps",async()=>{
    const h=installedRegimeOriginal(),calculate=vi.spyOn(h.p.regime!.runtime,"calculate");
    h.acknowledge.mockRejectedValueOnce(new Error("SYNTHETIC_ACK_LOST"));
    await h.runtime.tick();expect(h.runtime.status().state).toBe("TICK_REFUSED");
    const d=await h.document(),original=await originalRow(),financial=await financialRows();expect(calculate).toHaveBeenCalledOnce();
    await h.runtime.beforeApplicationShutdown();
    const restarted=new ExecutionManagerRuntime(pg,{trust:unqualifiedAccessTrust,cadence_ms:1000,maximum_publication_reads:1,partitions:[h.p]});ownedRuntimes.push(restarted);
    await restarted.tick();expect(restarted.status().state).toBe("TICK_OK");expect(calculate).toHaveBeenCalledOnce();
    expect(restarted.originalCustodyFor(scope)!.status().state).toBe("NOT_RUN");
    expect(await originalRow()).toEqual(original);expect(await financialRows()).toEqual(financial);expect(await h.document()).toEqual(d);
    expect(h.acknowledge).toHaveBeenCalledTimes(2);expect(await count("execution_manager_calculation_revisions")).toBe("1");
  });

  it("installed original-v3 → genuine later-policy RAW → historical Composition → same138/139, preserving original/source and one financial ACK",async()=>{
    const h=installedDependent();await h.runtime.tick();expect(h.runtime.status().state).toBe("TICK_OK");
    const document=await h.document(),financial=await financialRows(),original=await originalRow(),score=vi.spyOn(h.installed.installation.partitions[0].score!.runtime,"calculateRestated");
    expect(original.payload.schema_version).toBe("portal.execution.manager-score-original-inputs.v3");
    expect(document.precomputed_compositions![0].result).toMatchObject({value:null,status:"partial_coverage",total_allocated_capital:"80"});
    h.state.policy=h.data.later.handle;await h.runtime.tick();expect(h.runtime.status().state).toBe("TICK_OK");
    const view=requireDependentV2((await h.coordinator.snapshot(document)).view),c=view.composition_entries[0].historical;
    expect(view.entries).toHaveLength(3);expect(view.composition_entries).toHaveLength(1);expect(score).toHaveBeenCalledTimes(3);
    expect(c).toMatchObject({revision_mode:"RESTATED_CURRENT_POLICY",purpose:"HISTORICAL_ANALYSIS_ONLY",operational_current:false,
      source:{as_of_ms:document.as_of_ms},result:{value:"80",status:"available",total_allocated_capital:"80",score_coverage_allocated:"1"}});
    expect(c.knowledge_cutoff_ms).toBe(view.knowledge_cutoff_ms);expect(c.computed_at_ms).toBe(view.computed_at_ms);
    expect(view.policy.approved_at_ms).toBeGreaterThan(document.as_of_ms);expect(c.knowledge_cutoff_ms).toBeGreaterThanOrEqual(original.payload.retained_compositions[0].custody.captured_at_ms);
    expect(view.entries.every(e=>e.historical?.feed_freshness.status==="HISTORICAL_OUTSIDE_CURRENT_FEED_FRESHNESS")).toBe(true);
    expect(managerScorePublicationPolicyCurrent(h.state.policy,view.entries[0].historical!.result,Date.now())).toBe(false);
    expect(await financialRows()).toEqual(financial);expect(await originalRow()).toEqual(original);expect(h.acknowledge).toHaveBeenCalledOnce();
    expect(await count("execution_manager_calculation_revisions")).toBe("2");expect(await count("execution_manager_calculation_heads")).toBe("0");
  });
  it("uses original60/20 despite today's20/80 and revoked original handle; archived allocation is not today's grant",async()=>{
    const h=installedDependent();await h.runtime.tick();const document=await h.document(),financial=await financialRows(),original=await originalRow();
    const artifact=structuredClone(h.data.fx.artifact);artifact.rows[0].allocated_economic_capital="20";artifact.rows[1].allocated_economic_capital="80";
    artifact.allocation_revision="SYNTHETIC:today-r2";artifact.allocation_snapshot_id="SYNTHETIC:today-snapshot";
    artifact.nav_partition!.rows[0].current_nav_allocated_capital="20";artifact.nav_partition!.rows[1].current_nav_allocated_capital="80";artifact.nav_partition!.idle_cash="0";
    const candidate=compositionCandidate(h.data.fx,artifact),loaded=loadApprovedManagerAllocation({artifact_bytes:candidate.bytes,approval_pin:candidate.pin,scope:artifact.scope,as_of_ms:Date.now()});
    if(loaded.status!=="READY")throw new Error(JSON.stringify(loaded));h.installed.state.allocation=loaded.handle;
    expect(revokeApprovedManagerAllocation(h.data.fx.handle)).toBe(true);h.state.policy=h.data.later.handle;await h.idle();
    const c=requireDependentV2((await h.coordinator.snapshot(document)).view).composition_entries[0].historical;
    expect(c.result).toMatchObject({value:"80",total_allocated_capital:"80"});
    expect(c.result.contributions.map(r=>[r.subject_id,r.allocation_weight])).toEqual([[OWN.alpha_id,"0.75"],[PEER.alpha_id,"0.25"]]);
    expect(c.result.allocation_snapshot_id).toBe(h.data.fx.artifact.allocation_snapshot_id);
    expect(await financialRows()).toEqual(financial);expect(await originalRow()).toEqual(original);expect(h.acknowledge).toHaveBeenCalledOnce();
  });
  it.each(["missing method","intrinsic stale"] as const)("keeps %s RAW in the full original denominator with truthful partial bounds",async fault=>{
    const h=installedDependent(dependentCompositionFixture({missingMethod:fault==="missing method",stalePeer:fault==="intrinsic stale"}));
    await h.runtime.tick();h.state.policy=h.data.later.handle;await h.idle();const {snapshot}=await retainedDependent(h),v=requireDependentV2(snapshot.view);
    expect(v.composition_entries[0].historical.result).toMatchObject({value:null,status:"partial_coverage",total_allocated_capital:"80",
      score_coverage_allocated:"0.75",unscored_allocated_weight:"0.25",bounds:{lower:"67.5",upper:"92.5"}});
    const peer=v.entries.find(e=>e.slot==="RAW"&&e.binding.subject_id===PEER.alpha_id)!;
    if(fault==="missing method")expect(peer).toMatchObject({availability:"NOT_PUBLISHED",historical:null,reason_codes:["METRIC_DEPENDENCIES_NOT_RETAINED"]});
    else expect(peer.historical!.result.quality).toMatchObject({value:null,status:"stale"});
    expect(v.composition_entries[0].historical.raw_inputs.find(r=>r.subject_id===PEER.alpha_id)).toMatchObject({disposition:"UNSCORED"});
  });
  it.each(["composition-only","verified-empty"] as const)("retains %s as v2 historical fact, never an invented numeric zero",async kind=>{
    const h=installedDependent(dependentCompositionFixture(kind==="verified-empty"?{empty:true}:{compositionOnly:true}));
    await h.runtime.tick();h.state.policy=h.data.later.handle;await h.idle();const {snapshot}=await retainedDependent(h),v=requireDependentV2(snapshot.view);
    expect(v.entries).toEqual([]);expect(v.composition_entries).toHaveLength(1);
    expect(v.composition_entries[0].historical.result).toMatchObject(kind==="verified-empty"?
      {value:null,status:"no_allocation",total_allocated_capital:"0"}:{value:null,status:"partial_coverage",total_allocated_capital:"80",score_coverage_allocated:"0"});
    expect(h.acknowledge).toHaveBeenCalledOnce();expect(await count("execution_manager_calculation_revisions")).toBe("2");
  });
  it("reuses immutable v2 key/K/C/RAW/Composition after retry and coordinator restart, before any new worker call",async()=>{
    const h=installedDependent();await h.runtime.tick();h.state.policy=h.data.later.handle;await h.idle();const document=await h.document(),stored=await restatedDependentRow();
    const raw=vi.spyOn(h.installed.installation.partitions[0].score!.runtime,"calculateRestated"),composition=vi.spyOn(h.historical,"calculateHistoricalComposition");
    await h.idle();const restarted=h.restart();await h.idle(restarted);
    expect(await restatedDependentRow()).toEqual(stored);expect(await restarted.snapshot(document)).toEqual(await h.coordinator.snapshot(document));
    expect(raw).not.toHaveBeenCalled();expect(composition).not.toHaveBeenCalled();expect(h.acknowledge).toHaveBeenCalledOnce();
    expect(await count("execution_manager_calculation_revisions")).toBe("2");
    const noWorker=h.restart(false);expect(await noWorker.restoreRetained(document,stored.calculation_key)).toEqual(stored.payload);
  });
  it("appends v2 after a real v1 RAW-only result in the one139 causal lineage, without mutating v1 or ORIGINAL",async()=>{
    const h=installedDependent();await h.runtime.tick();h.state.policy=h.data.later.handle;const document=await h.document(),legacy=h.restart(false);
    await h.idle(legacy);const first=await restatedDependentRow();expect(first.payload.schema_version).toBe("portal.execution.manager-score-restatement.v1");
    await h.idle();const second=await restatedDependentRow();expect(second.calculation_key).not.toBe(first.calculation_key);
    expect(second.payload).toMatchObject({schema_version:"portal.execution.manager-score-restatement.v2",supersedes_calculation_key:first.calculation_key});
    expect((await pg.query("SELECT payload,payload_digest FROM execution_manager_calculation_revisions WHERE calculation_key=$1",[first.calculation_key])).rows[0])
      .toEqual({payload:first.payload,payload_digest:first.payload_digest});
    const history=await new ManagerScoreHistoryStore(pg).scan(document,3000);
    expect(history.restatements.map(r=>r.schema_version).sort()).toEqual(["portal.execution.manager-score-restatement.v1","portal.execution.manager-score-restatement.v2"]);
    expect(history.restated_head_key).toBe(second.calculation_key);expect(await count("execution_manager_calculation_revisions")).toBe("3");
  });
  it("original allocation approval may expire today without erasing captured inputs or requiring today's allocation",async()=>{
    const data=dependentCompositionFixture(),expires=Date.now()+30_000;data.fx.pin.valid_until_ms=expires;
    if(data.fx.pin.nav_pin)data.fx.pin.nav_pin.valid_until_ms=expires;
    const candidate=compositionCandidate(data.fx),loaded=loadApprovedManagerAllocation({artifact_bytes:candidate.bytes,approval_pin:candidate.pin,
      scope:candidate.artifact.scope,as_of_ms:Date.now()});if(loaded.status!=="READY")throw new Error(JSON.stringify(loaded));data.fx.handle=loaded.handle;
    const h=installedDependent(data);await h.runtime.tick();h.state.policy=data.later.handle;
    const document=await h.document(),financial=await financialRows(),original=await originalRow();
    expect(candidate.pin.nav_pin!.approved_at_ms).toBeLessThanOrEqual(data.asOf);
    expect(document.precomputed_compositions![0].result.allocation_coverage_nav).toBe("0.8");
    const clock=vi.spyOn(Date,"now").mockReturnValue(expires+1);
    try{await h.idle();const c=requireDependentV2((await h.coordinator.snapshot(document)).view).composition_entries[0].historical;
      expect(c.result.value).toBe("80");expect(c.result.allocation_coverage_nav).toBe("0.8");
      expect(c.knowledge_cutoff_ms).toBeGreaterThan(expires);
    }finally{clock.mockRestore();}
    expect(await financialRows()).toEqual(financial);expect(await originalRow()).toEqual(original);expect(h.acknowledge).toHaveBeenCalledOnce();
  });
  it.each(["revoke","expiry","source"] as const)("%s after genuine v2 INSERT refuses final COMMIT and rolls back derived/head only",async fault=>{
    let h:DependentHarness|undefined,armed=false,witness=false;let restoreClock:(()=>void)|undefined;
    const database=dependentTransactionPool(async(sql,client)=>{if(armed&&sql.startsWith("INSERT INTO execution_manager_calculation_revisions")){
      armed=false;witness=true;expect((await client.query("SELECT count(*)::text AS n FROM execution_manager_calculation_revisions")).rows[0].n).toBe("2");
      if(fault==="revoke")h!.state.policy=null;
      else if(fault==="source")h!.state.sourceRefused=true;
      else{const clock=vi.spyOn(Date,"now").mockReturnValue(h!.data.later.policy.valid_until_ms);restoreClock=()=>clock.mockRestore();}
    }});
    h=installedDependent(undefined,database);await h.runtime.tick();const financial=await financialRows(),original=await originalRow();
    h.state.policy=h.data.later.handle;armed=true;
    try{await expect(h.idle()).rejects.toThrow(fault==="source"?"SYNTHETIC_DEPENDENT_SOURCE_REFUSAL":"MANAGER_RESTATED_POLICY_CHANGED");}
    finally{restoreClock?.();}
    expect(witness).toBe(true);expect(await restatedDependentRow()).toBeUndefined();expect(await count("execution_manager_calculation_revisions")).toBe("1");
    expect(await financialRows()).toEqual(financial);expect(await originalRow()).toEqual(original);expect(h.acknowledge).toHaveBeenCalledOnce();
  });
  it("deferred real lease expiry after v2 INSERT rejects physical COMMIT without sleeping or acknowledging derived work",async()=>{
    let armed=false,witness=false;
    const database=dependentTransactionPool(async(sql,client)=>{if(armed&&sql.startsWith("INSERT INTO execution_manager_calculation_revisions")){
      armed=false;witness=true;await client.query("UPDATE execution_manager_consumer_fences SET expires_at=clock_timestamp()");}});
    const h=installedDependent(undefined,database);await h.runtime.tick();const financial=await financialRows(),original=await originalRow();
    h.state.policy=h.data.later.handle;armed=true;await expect(h.idle()).rejects.toThrow("MANAGER_LEASE_LOST");
    expect(witness).toBe(true);expect(await restatedDependentRow()).toBeUndefined();expect(await count("execution_manager_calculation_revisions")).toBe("1");
    expect(await financialRows()).toEqual(financial);expect(await originalRow()).toEqual(original);expect(h.acknowledge).toHaveBeenCalledOnce();
  });
  it("detects source-head change during final async source recheck before derived persistence",async()=>{
    const h=installedDependent();await h.runtime.tick();const financial=await financialRows(),original=await originalRow();
    h.state.policy=h.data.later.handle;h.source.recheck.mockImplementation(async()=>{
      await pg.query("UPDATE execution_manager_model_heads SET payload_digest=$1",[hash("SYNTHETIC_SOURCE_HEAD_FAULT")]);
      return {assertCurrent:()=>undefined};
    });
    await expect(h.idle()).rejects.toThrow("MANAGER_RESTATED_SOURCE_CHANGED");expect(await restatedDependentRow()).toBeUndefined();
    expect(await financialRows()).toEqual(financial);expect(await originalRow()).toEqual(original);expect(h.acknowledge).toHaveBeenCalledOnce();
  });
  it("v2 CAS refuses a same-transaction competing restated head and rolls it back to the previous immutable result",async()=>{
    let armed=false,witness=false,originalKey="";
    const database=dependentTransactionPool(async(sql,client)=>{if(armed&&sql.startsWith("SELECT calculation_key FROM execution_manager_score_mode_heads")&&sql.endsWith("FOR UPDATE")){
      armed=false;witness=true;await client.query("UPDATE execution_manager_score_mode_heads SET calculation_key=$1 WHERE head_kind='RESTATED_CURRENT_POLICY'",[originalKey]);}});
    const h=installedDependent(undefined,database);await h.runtime.tick();h.state.policy=h.data.later.handle;await h.idle();
    const previous=await restatedDependentRow(),financial=await financialRows(),original=await originalRow();originalKey=original.calculation_key;
    h.state.policy=dependentCompositionPolicy(h.data.asOf,"C","0.2").handle;armed=true;
    await expect(h.idle()).rejects.toThrow("MANAGER_RESTATED_HEAD_CHANGED");expect(witness).toBe(true);
    expect(await restatedDependentRow()).toEqual(previous);expect(await count("execution_manager_calculation_revisions")).toBe("2");
    expect(await financialRows()).toEqual(financial);expect(await originalRow()).toEqual(original);expect(h.acknowledge).toHaveBeenCalledOnce();
  });
  it("shared138 row cap refuses a new combined revision while preserving prior v2 head/source/original",async()=>{
    const h=installedDependent(undefined,pg,{maximum_revisions_per_source:2});await h.runtime.tick();h.state.policy=h.data.later.handle;await h.idle();
    const previous=await restatedDependentRow(),financial=await financialRows(),original=await originalRow();
    h.state.policy=dependentCompositionPolicy(h.data.asOf,"C","0.2").handle;
    await expect(h.idle()).rejects.toThrow("MANAGER_DERIVED_RETENTION_CAP_REACHED");expect(await restatedDependentRow()).toEqual(previous);
    expect(await count("execution_manager_calculation_revisions")).toBe("2");expect(await financialRows()).toEqual(financial);
    expect(await originalRow()).toEqual(original);expect(h.acknowledge).toHaveBeenCalledOnce();
  });
  it("actual shared JSONB byte cap is not bypassed by separate Score/Composition arrays",async()=>{
    const cap=dependentConfig.maximum_bundle_bytes,h=installedDependent(undefined,pg,{maximum_retained_bytes_per_source:cap});
    await h.runtime.tick();h.state.policy=h.data.later.handle;await h.idle();const previous=await restatedDependentRow(),original=await originalRow(),d=await h.document();
    const used=Number((await pg.query("SELECT sum(octet_length(payload::text))::text AS bytes FROM execution_manager_calculation_revisions")).rows[0].bytes);
    expect(used).toBeLessThan(cap-1024);const padding={schema_version:"SYNTHETIC:shared-existing-row",padding:"x".repeat(cap-used-512)};
    await pg.query("INSERT INTO execution_manager_calculation_revisions (workspace_id,environment,profile_id,source_revision,calculation_key,payload_digest,payload) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)",
      [d.workspace_id,d.environment,d.profile_id,d.revision,hash("SYNTHETIC:byte-row"),accessDigest(padding),JSON.stringify(padding)]);
    h.state.policy=dependentCompositionPolicy(h.data.asOf,"C","0.2").handle;
    await expect(h.idle()).rejects.toThrow("MANAGER_DERIVED_RETENTION_CAP_REACHED");expect(await restatedDependentRow()).toEqual(previous);
    expect(await count("execution_manager_calculation_revisions")).toBe("3");expect(await originalRow()).toEqual(original);expect(h.acknowledge).toHaveBeenCalledOnce();
  });
  it("policy changes after awaited historical Composition worker: no partial combined revision is retained",async()=>{
    const h=installedDependent();await h.runtime.tick();h.state.policy=h.data.later.handle;
    const calculate=h.historical.calculateHistoricalComposition.bind(h.historical),financial=await financialRows(),original=await originalRow();
    vi.spyOn(h.historical,"calculateHistoricalComposition").mockImplementation(async(...args)=>{const result=await calculate(...args);h.state.policy=null;return result;});
    await expect(h.idle()).rejects.toThrow("MANAGER_RESTATED_POLICY_CHANGED");expect(await restatedDependentRow()).toBeUndefined();
    expect(await count("execution_manager_calculation_revisions")).toBe("1");expect(await financialRows()).toEqual(financial);
    expect(await originalRow()).toEqual(original);expect(h.acknowledge).toHaveBeenCalledOnce();
  });

  async function dependentWorkerContext(h:DependentHarness){
    const document=await h.document(),original=requireV3(await tx(client=>new ManagerScoreOriginalCustody(compositionV3Limits).restore(client,document))),
      v=requireDependentV2((await h.coordinator.snapshot(document)).view),child=original.retained_compositions[0];
    const restored=restoreManagerCompositionOriginalAllocation({custody:child.custody,expected_custody_digest:child.custody_digest,
      document,maximum_bytes:dependentConfig.maximum_bundle_bytes});
    if(restored.status!=="READY")throw new Error(JSON.stringify(restored));
    const context={allocation:restored.handle,original_custody_key:original.calculation_key,original_inputs_digest:original.inputs_digest,
      policy:v.policy,knowledge_cutoff_ms:v.knowledge_cutoff_ms,computed_at_ms:v.computed_at_ms,
      calculation_revision:v.composition_calculation_revision,raw_entries:v.entries};
    // TEST_ONLY identity fence over entries ALREADY produced and validated by the
    // real coordinator from original/method custody; not a source proof fixture.
    const accepted=new Set(v.entries),fence={accepts:(entry:typeof v.entries[number])=>accepted.has(entry)};
    return {document,original,v,context,fence,task:{...context,policy:h.state.policy}};
  }
  it.each(["verified-empty","all-zero"] as const)("genuine %s allocation calculates AND decodes no_allocation/null, not numeric0",async kind=>{
    const h=installedDependent(dependentCompositionFixture(kind==="verified-empty"?{empty:true}:{allZero:true}));
    await h.runtime.tick();h.state.policy=h.data.later.handle;await h.idle();const x=await dependentWorkerContext(h),c=x.v.composition_entries[0].historical;
    const calculated=await h.historical.calculateHistoricalComposition(x.task,x.fence);
    for(const value of [c,calculated,decodeRetainedManagerCompositionRestatement(c,x.context,262_144)])
      expect(value.result).toMatchObject({value:null,status:"no_allocation",total_allocated_capital:"0",score_coverage_allocated:null,contributions:[]});
    expect(kind==="all-zero"?h.data.fx.artifact.rows.length:0).toBe(kind==="all-zero"?2:0);
    expect(h.acknowledge).toHaveBeenCalledOnce();
  });
  it("lost ORIGINAL ACK retries the same original children, then v2 retry/restart never ACKs derived work",async()=>{
    const h=installedDependent();let acknowledgements=0;
    h.acknowledge.mockImplementation(async()=>{if(++acknowledgements===1)throw new Error("SYNTHETIC_ACK_LOST");h.state.pending=false;});
    await h.runtime.tick();const original=await originalRow(),financial=await financialRows();expect(original).toBeDefined();
    await h.runtime.tick();expect(await originalRow()).toEqual(original);expect(await financialRows()).toEqual(financial);
    h.state.policy=h.data.later.handle;await h.idle();const derived=await restatedDependentRow();await h.idle(h.restart());
    expect(await restatedDependentRow()).toEqual(derived);expect(h.acknowledge).toHaveBeenCalledTimes(2);
    expect(await count("execution_manager_calculation_revisions")).toBe("2");
  });
  it("v2 strict decoder requires ACTUAL135 and exact full child/RAW/source/K/C census even when payload hash is recomputed",async()=>{
    const h=installedDependent();await h.runtime.tick();h.state.policy=h.data.later.handle;await h.idle();
    const x=await dependentWorkerContext(h),row=await restatedDependentRow(),financial=await financialRows(),original=await originalRow();
    const decode=(b:DependentV2,document:ManagerModelDocument=x.document)=>decodeRetainedManagerScoreRestatement(
      {calculation_key:b.calculation_key,payload:b,payload_digest:accessDigest(b)},x.original,262_144,document);
    expect(()=>decodeRetainedManagerScoreRestatement(row,x.original,262_144)).toThrow("MANAGER_RESTATED_COMPOSITION_SOURCE_REQUIRED");
    const edits:((b:DependentV2)=>void)[]=[
      b=>{b.composition_entries=[];},b=>{b.composition_entries.push(structuredClone(b.composition_entries[0]));},
      b=>{b.composition_entries[0].allocation_custody_digest=hash("SYNTHETIC:wrong-child");},
      b=>{b.composition_entries[0].binding.subject_id="SYNTHETIC:foreign-portfolio";},
      b=>{b.entries[0].original_input_digest=hash("SYNTHETIC:wrong-raw-original");},
      b=>{b.entries.push(structuredClone(b.entries[0]));},
      b=>{b.source.projection_generation="SYNTHETIC:foreign-generation";},
      b=>{b.knowledge_cutoff_ms=x.original.source.as_of_ms;},
      b=>{b.composition_entries[0].historical.computed_at_ms--;},
      b=>{b.composition_entries[0].historical.original_publication_digest=hash("SYNTHETIC:wrong-original-publication");},
      b=>{b.composition_entries[0].historical.raw_inputs[0].entry_digest=hash("SYNTHETIC:wrong-raw-entry");},
      b=>{b.composition_entries[0].historical.result.contributions.pop();},
      b=>{Reflect.set(b.composition_entries[0].historical,"invented_authority",true);},
    ];
    for(const edit of edits){const b=structuredClone(x.v);edit(b);expect(()=>decode(b)).toThrow();}
    const wrong=structuredClone(x.document);wrong.observed_at_ms--;expect(()=>decode(x.v,wrong)).toThrow("MANAGER_RESTATED_COMPOSITION_ORIGINAL_REQUIRED");
    h.state.policy=null;const worker=vi.spyOn(h.historical,"calculateHistoricalComposition");
    expect(await h.restart(false).restoreRetained(x.document,row.calculation_key)).toEqual(row.payload);
    expect(decode(x.v)).toEqual(x.v);expect(worker).not.toHaveBeenCalled();
    expect(await financialRows()).toEqual(financial);expect(await originalRow()).toEqual(original);expect(h.acknowledge).toHaveBeenCalledOnce();
  });
  it("worker refuses forged/live allocation, cloned RAW identities and conflicting RAW before creating a result",async()=>{
    const h=installedDependent();await h.runtime.tick();h.state.policy=h.data.later.handle;await h.idle();const x=await dependentWorkerContext(h);
    for(const allocation of [{},h.data.fx.handle,structuredClone(x.context.allocation)])
      await expect(h.historical.calculateHistoricalComposition({...x.task,allocation:allocation as typeof x.task.allocation},x.fence))
        .rejects.toMatchObject({code:"COMPOSITION_RESTATED_ORIGINAL_NOT_RETAINED"});
    await expect(h.historical.calculateHistoricalComposition({...x.task,raw_entries:structuredClone(x.task.raw_entries)},x.fence))
      .rejects.toMatchObject({code:"COMPOSITION_RESTATED_RAW_NOT_VERIFIED"});
    await expect(h.historical.calculateHistoricalComposition({...x.task,raw_entries:[...x.task.raw_entries,x.task.raw_entries[0]]},x.fence))
      .rejects.toMatchObject({code:"COMPOSITION_RESTATED_RAW_CONFLICT"});
    expect((await h.historical.calculateHistoricalComposition(x.task,x.fence)).result.value).toBe("80");
  });
  it("own-data/getter/Proxy boundaries do not execute traps; bounded failures release private worker capacity",async()=>{
    const h=installedDependent();await h.runtime.tick();h.state.policy=h.data.later.handle;await h.idle();const x=await dependentWorkerContext(h);let traps=0;
    const proxy=<T extends object>(value:T)=>new Proxy(value,{get(){traps++;throw new Error("SYNTHETIC_PRIVATE_DIAGNOSTIC");},
      ownKeys(){traps++;throw new Error("SYNTHETIC_PRIVATE_DIAGNOSTIC");},getPrototypeOf(){traps++;throw new Error("SYNTHETIC_PRIVATE_DIAGNOSTIC");},
      getOwnPropertyDescriptor(){traps++;throw new Error("SYNTHETIC_PRIVATE_DIAGNOSTIC");}});
    const getter={...x.task};Object.defineProperty(getter,"raw_entries",{enumerable:true,get(){traps++;throw new Error("SYNTHETIC_PRIVATE_DIAGNOSTIC");}});
    const nested=structuredClone(x.task.raw_entries);nested[0]=proxy(nested[0]);
    for(const task of [proxy(x.task),getter,{...x.task,raw_entries:proxy(x.task.raw_entries)},{...x.task,raw_entries:nested},
      Object.assign(Object.create({unexpected:true}),x.task),Object.assign({...x.task},{[Symbol("unexpected")]:true})])
      await expect(h.historical.calculateHistoricalComposition(task,x.fence)).rejects.toMatchObject({code:"COMPOSITION_RESTATED_INPUT_INVALID"});
    expect(traps).toBe(0);
    await expect(h.historical.calculateHistoricalComposition(x.task,proxy(x.fence))).rejects.toMatchObject({code:"COMPOSITION_RESTATED_INPUT_INVALID"});
    expect(traps).toBe(0);
    const narrow=new ManagerCompositionHistoricalRuntime({maximum_rows:10,maximum_input_bytes:1,maximum_in_flight:1});
    await expect(narrow.calculateHistoricalComposition(x.task,x.fence)).rejects.toMatchObject({code:"COMPOSITION_RESTATED_INPUT_BOUND"});
    expect(()=>decodeRetainedManagerCompositionRestatement(x.v.composition_entries[0].historical,x.context,1))
      .toThrow("COMPOSITION_RESTATED_INPUT_BOUND");
    const aborted=new AbortController();aborted.abort();await expect(h.historical.calculateHistoricalComposition(x.task,x.fence,aborted.signal))
      .rejects.toMatchObject({code:"COMPOSITION_RESTATED_CANCELLED"});
    expect((await h.historical.calculateHistoricalComposition(x.task,x.fence)).result.value).toBe("80");
  });
  function installedV3(options:{compositionOnly?:boolean;maximumBundleBytes?:number;loseFirstAck?:boolean;optIn?:boolean}={}){
    const fx=compositionInput();if(options.compositionOnly)fx.scoreTasks=[];
    // TEST_ONLY fixture lifetime, not a production policy/default. The original
    // source/as-of/window/input times remain unchanged. No Score policy is
    // installed: pending RAW must give genuine null/partial Composition.
    const at=Date.now();fx.pin.valid_until_ms=at+120_000;
    fx.artifact.maximum_source_age_ms=Math.max(60_000,at-fx.artifact.source_as_of_ms+120_000);
    fx.handle=requireCompositionAllocation(compositionCandidate(fx));fx.d.publication.expires_at_ms=at+120_000;
    let pending=true,acks=0,finalRefusal=false;
    const acknowledge=vi.fn(async()=>{if(++acks===1&&options.loseFirstAck)throw new Error("SYNTHETIC_V3_ACK_LOST");pending=false;});
    const installed=compositionInstallation(fx,acknowledge),partition=installed.installation.partitions[0];
    const c=commissioning();c.pin.valid_until_ms=at+120_000;
    partition.commissioning=loadPublicationCommissioning(c.bytes,c.pin,at);
    const tasks=vi.fn(async()=>compositionV3ScoreInputs(fx)),currentPolicy=vi.fn(()=>null);
    partition.score!.tasks=tasks;partition.score!.currentPolicy=currentPolicy;
    if(options.optIn!==false)partition.score!.restatement={...compositionV3Config,maximum_bundle_bytes:options.maximumBundleBytes??compositionV3Config.maximum_bundle_bytes};
    installed.state.allocation=fx.handle;
    const read=vi.fn(async()=>pending?structuredClone(fx.d):null),publication=vi.fn(async()=>fx.d.publication);
    partition.source.read=read;partition.publication=publication;
    partition.source.recheck=vi.fn(async()=>({assertCurrent:()=>{if(finalRefusal)throw new Error("SYNTHETIC_FINAL_SOURCE_REFUSAL");}}));
    const start=()=>{const runtime=new ExecutionManagerRuntime(pg,installed.installation);ownedRuntimes.push(runtime);return runtime;};
    return {fx,installed,tasks,currentPolicy,read,publication,acknowledge,start,refuseFinal:()=>{finalRefusal=true;}};
  }

  it("installed materializer captures final source, persists v3 in the same transaction and reuses custody after lost ACK/restart",async()=>{
    const h=installedV3({loseFirstAck:true}),first=h.start();await first.tick();expect(first.status().state).toBe("TICK_REFUSED");
    const repo=new ManagerModelRepository(pg),document=await repo.document(scope.workspace_id,scope.environment,scope.profile_id,h.fx.d.document.revision);
    expect(document!.precomputed_scores).toHaveLength(3);expect(document!.precomputed_scores!.every(s=>s.quality.value===null)).toBe(true);
    expect(document!.precomputed_compositions![0].result).toMatchObject({status:"partial_coverage",value:null,total_allocated_capital:"80",score_coverage_allocated:"0"});
    const stored=await originalRow(),before=await financialRows();
    const snapshot=requireV3(await tx(client=>new ManagerScoreOriginalCustody(compositionV3Limits).restore(client,document!)));
    expect(snapshot.retained_compositions[0].custody.source.payload_digest).toBe(accessDigest(document));
    expect(snapshot.retained_tasks.map(t=>t.input_json).sort()).toEqual(compositionV3ScoreInputs(h.fx).map(t=>JSON.stringify(t.task)).sort());
    await first.beforeApplicationShutdown();const restarted=h.start();await restarted.tick();expect(restarted.status().state).toBe("TICK_OK");
    expect(h.tasks).toHaveBeenCalledOnce();expect(h.acknowledge).toHaveBeenCalledTimes(2);
    expect(await originalRow()).toEqual(stored);expect(await financialRows()).toEqual(before);
    expect(await count("execution_manager_calculation_revisions")).toBe("1");expect(await count("execution_manager_calculation_heads")).toBe("0");
  });
  it("Composition-only opt-in writes a real v3 ORIGINAL, then IDLE refuses absent dependent worker without reading policy or writing empty Score",async()=>{
    const h=installedV3({compositionOnly:true}),runtime=h.start();await runtime.tick();expect(runtime.status().state).toBe("TICK_OK");
    const document=await new ManagerModelRepository(pg).document(scope.workspace_id,scope.environment,scope.profile_id,h.fx.d.document.revision);
    const snapshot=requireV3(await tx(client=>new ManagerScoreOriginalCustody(compositionV3Limits).restore(client,document!)));
    expect(snapshot.retained_tasks).toEqual([]);expect(snapshot.retained_compositions).toHaveLength(1);
    expect(document!.precomputed_scores).toEqual([]);const before=await financialRows(),original=await originalRow();
    await runtime.tick();expect(runtime.status().state).toBe("TICK_OK");
    expect(runtime.restatementFor(scope)!.status().state).toBe("RESTATED_DEPENDENT_WORKER_NOT_INSTALLED");
    expect(h.currentPolicy).not.toHaveBeenCalled();expect(h.publication).not.toHaveBeenCalled();
    expect(await count("execution_manager_calculation_revisions")).toBe("1");expect(await count("execution_manager_calculation_heads")).toBe("0");
    expect(await originalRow()).toEqual(original);expect(await financialRows()).toEqual(before);
  });
  it("optional capture cap omits the whole original bundle while committing and acknowledging genuine financial null/partial publication",async()=>{
    const h=installedV3({maximumBundleBytes:1}),runtime=h.start();await runtime.tick();expect(runtime.status().state).toBe("TICK_OK");
    expect(runtime.restatementFor(scope)!.status()).toEqual({state:"ORIGINAL_COMPOSITION_CUSTODY_NOT_RETAINED",reason_code:"COMPOSITION_ORIGINAL_CUSTODY_BOUND"});
    const document=await new ManagerModelRepository(pg).document(scope.workspace_id,scope.environment,scope.profile_id,h.fx.d.document.revision);
    expect(document!.precomputed_scores).toHaveLength(3);expect(document!.precomputed_compositions).toHaveLength(1);
    expect(document!.precomputed_compositions![0].result.value).toBeNull();expect(h.acknowledge).toHaveBeenCalledOnce();
    expect(await count("execution_manager_model_revisions")).toBe("1");expect(await count("execution_manager_calculation_revisions")).toBe("0");
    expect(await count("execution_manager_score_mode_heads")).toBe("0");
  });
  it("Composition does not implicitly opt a partition into ORIGINAL custody",async()=>{
    const h=installedV3({optIn:false}),runtime=h.start();await runtime.tick();expect(runtime.status().state).toBe("TICK_OK");
    expect(runtime.restatementFor(scope)).toBeUndefined();expect(h.acknowledge).toHaveBeenCalledOnce();
    expect(await count("execution_manager_model_revisions")).toBe("1");expect(await count("execution_manager_calculation_revisions")).toBe("0");
    expect(await count("execution_manager_score_mode_heads")).toBe("0");
  });
  it("a synchronous final source refusal after real source/custody INSERT rolls back135/138/139 and sends zero ACK",async()=>{
    const h=installedV3(),runtime=h.start(),coordinator=runtime.restatementFor(scope)!,persist=coordinator.persistAttached.bind(coordinator);
    vi.spyOn(coordinator,"persistAttached").mockImplementation(async(client,delivery)=>{
      await persist(client,delivery);
      expect((await client.query("SELECT count(*)::text AS n FROM execution_manager_calculation_revisions")).rows[0].n).toBe("1");
      expect((await client.query("SELECT count(*)::text AS n FROM execution_manager_score_mode_heads")).rows[0].n).toBe("1");
      h.refuseFinal();
    });
    await runtime.tick();expect(runtime.status().state).toBe("TICK_REFUSED");expect(h.acknowledge).not.toHaveBeenCalled();
    for(const table of ["execution_manager_model_revisions","execution_manager_model_heads","execution_manager_calculation_revisions","execution_manager_score_mode_heads"])
      expect(await count(table)).toBe("0");
  });

  it("commits final135 source +138 original +139 pointer, restores exact original and retries after restart without changing source",async()=>{
    const h=await committedV3(),before=await financialRows(),stored=await originalRow();
    const restarted=new ManagerScoreOriginalCustody(compositionV3Limits),snapshot=requireV3(await tx(client=>restarted.restore(client,h.f.document)));
    expect(snapshot.retained_tasks.map(item=>item.input_json).sort()).toEqual(h.f.inputs.map(item=>item.input_json).sort());
    expect(snapshot.retained_compositions).toEqual([{custody_digest:h.f.custody.custody_digest,custody:h.f.custody}]);
    expect(snapshot.source.payload_digest).toBe(accessDigest(h.f.document));expect(snapshot.calculation_key).toBe(h.prepared.calculation_key);
    expect(stored.payload_digest).toBe(accessDigest(snapshot));
    const parent=snapshot.retained_compositions[0],restored=restoreManagerCompositionOriginalAllocation({custody:parent.custody,
      expected_custody_digest:parent.custody_digest,document:h.f.document,maximum_bytes:compositionV3Limits.maximum_bundle_bytes},()=>now);
    if(restored.status!=="READY")throw new Error(JSON.stringify(restored));
    expect(managerCompositionRetainedAllocationInputs(restored.handle)!.artifact.rows.map(row=>row.allocated_economic_capital)).toEqual(["60","20"]);
    await tx(async client=>expect(await restarted.persist(client,restarted.prepare(h.f.document,h.f.inputs,[h.f.custody]))).toBe("DUPLICATE"));
    expect(await originalRow()).toEqual(stored);expect(await financialRows()).toEqual(before);
    expect(await count("execution_manager_calculation_heads")).toBe("0");expect(await count("execution_manager_calculation_revisions")).toBe("1");
  });
  it("restores original60/20 after current20/80 replacement, original revocation and today's original approval expiry",async()=>{
    const h=await committedV3(),before=await financialRows(),artifact=structuredClone(h.f.fx.artifact);
    artifact.rows[0].allocated_economic_capital="20";artifact.rows[1].allocated_economic_capital="80";
    artifact.nav_partition!.rows[0].current_nav_allocated_capital="20";artifact.nav_partition!.rows[1].current_nav_allocated_capital="80";
    artifact.nav_partition!.idle_cash="0";const replacement=requireCompositionAllocation(compositionCandidate(h.f.fx,artifact));
    expect(managerCompositionPublicationCurrent(replacement,h.f.publication,h.f.raw,h.f.fence,now)).toBe(false);
    revokeApprovedManagerAllocation(h.f.request.allocation);
    const clock=vi.spyOn(Date,"now").mockReturnValue(h.f.fx.pin.valid_until_ms+1);
    try{const snapshot=requireV3(await tx(client=>h.custody.restore(client,h.f.document)));
      expect(JSON.parse(snapshot.retained_compositions[0].custody.artifact_utf8).rows.map((r:{allocated_economic_capital:string})=>r.allocated_economic_capital)).toEqual(["60","20"]);
      expect(snapshot.retained_compositions[0].custody.approval_pin.valid_until_ms).toBe(h.f.fx.pin.valid_until_ms);
    }finally{clock.mockRestore();}expect(await financialRows()).toEqual(before);
  });
  it.each(["composition-only","empty"] as const)("retains %s with zero published Score slots; never invents numeric Score",async kind=>{
    const h=await committedV3(await compositionV3Fixture(kind));
    const snapshot=requireV3(await tx(client=>h.custody.restore(client,h.f.document)));
    expect(snapshot.retained_tasks).toEqual([]);expect(snapshot.retained_compositions).toHaveLength(1);
    expect(h.f.document.precomputed_scores).toEqual([]);
    expect(h.f.publication.result).toMatchObject(kind==="empty"?{value:null,status:"no_allocation",total_allocated_capital:"0"}:
      {value:null,status:"partial_coverage",total_allocated_capital:"80",score_coverage_allocated:"0"});
  });
  it("requires the exact Score census even when Composition captures are valid",async()=>{
    const f=await compositionV3Fixture(),custody=new ManagerScoreOriginalCustody(compositionV3Limits);
    expect(()=>custody.prepare(f.document,[],[f.custody])).toThrow("MANAGER_ORIGINAL_INCOMPLETE_INPUT_SET");
    expect(()=>custody.prepare(f.document,f.inputs.slice(1),[f.custody])).toThrow("MANAGER_ORIGINAL_INCOMPLETE_INPUT_SET");
    expect(()=>custody.prepare(f.document,[...f.inputs,f.inputs[0]],[f.custody])).toThrow("MANAGER_ORIGINAL_DUPLICATE_SLOT");
  });
  it("bounds aggregate genuine capture bytes before later duplicate/census restore, though each child fits individually",async()=>{
    const f=await compositionV3Fixture(),childBytes=Buffer.byteLength(JSON.stringify(f.custody));
    const maximum_bundle_bytes=Math.max(childBytes+2,Buffer.byteLength(JSON.stringify(f.document))+1024);
    const copies=Math.floor((maximum_bundle_bytes-2)/(childBytes+1))+2;
    expect(copies).toBeGreaterThanOrEqual(2);expect(copies).toBeLessThanOrEqual(128);
    const captured=captureManagerCompositionOriginalAllocation({...f.request,maximum_bytes:maximum_bundle_bytes},()=>now);
    if(captured.status!=="READY")throw new Error(JSON.stringify(captured));
    expect(Buffer.byteLength(JSON.stringify([captured.custody]))).toBeLessThanOrEqual(maximum_bundle_bytes);
    const repeated=Array.from({length:copies},()=>captured.custody);
    expect(Buffer.byteLength(JSON.stringify(repeated))).toBeGreaterThan(maximum_bundle_bytes);
    const narrow=new ManagerScoreOriginalCustody({...compositionV3Limits,maximum_bundle_bytes});
    expect(()=>narrow.prepare(f.document,f.inputs,repeated)).toThrow("MANAGER_ORIGINAL_INPUT_BOUND");
    // Same genuine identities are otherwise duplicates, not forged captures.
    expect(()=>new ManagerScoreOriginalCustody(compositionV3Limits).prepare(f.document,f.inputs,[captured.custody,captured.custody]))
      .toThrow("MANAGER_ORIGINAL_DUPLICATE_COMPOSITION");
    expect(await count("execution_manager_model_revisions")).toBe("0");
  });
  it("retains the complete distinct Composition binding census and rejects duplicate or omitted bindings",async()=>{
    const fx=compositionInput(),inputs=captureManagerScoreOriginalInputs(compositionV3ScoreInputs(fx),compositionV3Limits.maximum_bundle_bytes);
    const one=await calculatedComposition(fx,fx.handle,()=>now),artifact=structuredClone(fx.artifact);
    artifact.binding={...artifact.binding,subject_type:"manager_book",subject_id:"SYNTHETIC:manager-book"};
    const allocation=requireCompositionAllocation(compositionCandidate(fx,artifact));
    const two=await compositionRuntime(()=>now).calculate({...fx.task,binding:artifact.binding,allocation,raw_scores:one.raw},one.fence);
    const document={...structuredClone(fx.d.document),precomputed_scores:one.raw,precomputed_compositions:[one.publication,two]};
    const captures=[{allocation:fx.handle,publication:one.publication},{allocation,publication:two}].map(item=>{
      const captured=captureManagerCompositionOriginalAllocation({...item,document,raw_fence:one.fence,maximum_bytes:compositionV3Limits.maximum_bundle_bytes},()=>now);
      if(captured.status!=="READY")throw new Error(JSON.stringify(captured));return captured.custody;});
    const custody=new ManagerScoreOriginalCustody(compositionV3Limits);
    expect(()=>custody.prepare(document,inputs,captures.slice(0,1))).toThrow("MANAGER_ORIGINAL_INCOMPLETE_COMPOSITION_SET");
    expect(()=>custody.prepare(document,inputs,[captures[0],captures[0]])).toThrow("MANAGER_ORIGINAL_DUPLICATE_COMPOSITION");
    const prepared=custody.prepare(document,inputs,[...captures].reverse());
    await tx(async client=>{await putSource(client,document);await custody.persist(client,prepared);});
    expect(requireV3(await tx(client=>custody.restore(client,document))).retained_compositions).toHaveLength(2);
  });
  it("rejects cloned/forged/restored first-capture identities, array accessors and Proxy wrappers with zero traps",async()=>{
    const f=await compositionV3Fixture(),custody=new ManagerScoreOriginalCustody(compositionV3Limits);let traps=0;
    const proxy=<T extends object>(target:T)=>new Proxy(target,{get(){traps++;throw new Error("PRIVATE_PROXY");},
      getPrototypeOf(){traps++;throw new Error("PRIVATE_PROXY");},ownKeys(){traps++;throw new Error("PRIVATE_PROXY");}});
    const retained=requireRetainedComposition(f.custody,f.document),revoked=Proxy.revocable(f.custody,{});revoked.revoke();
    for(const value of [structuredClone(f.custody),JSON.parse(JSON.stringify(f.custody)),{},retained,proxy(f.custody),revoked.proxy])
      expect(()=>custody.prepare(f.document,f.inputs,[value] as typeof f.custody[])).toThrow("MANAGER_ORIGINAL_COMPOSITION_CAPTURE_REQUIRED");
    expect(()=>custody.prepare(f.document,f.inputs,proxy([f.custody]))).toThrow("MANAGER_ORIGINAL_INPUT_INVALID");
    const getter=[f.custody];Object.defineProperty(getter,"0",{enumerable:true,get(){traps++;return f.custody;}});
    expect(()=>custody.prepare(f.document,f.inputs,getter)).toThrow("MANAGER_ORIGINAL_INPUT_INVALID");expect(traps).toBe(0);
  });
  it("rejects rehashed child, parent, source and census corruption against the actual immutable135 source",async()=>{
    const h=await committedV3(),stored=await originalRow(),sourceBefore=await financialRows();
    const faults:Array<(b:CompositionV3Snapshot)=>void>=[
      b=>{b.retained_compositions[0].custody.artifact_utf8+="\n";},
      b=>{b.retained_compositions[0].custody_digest=hash("wrong-parent");},
      b=>{b.retained_compositions[0].custody.source.source_epoch="SYNTHETIC:other";},
      b=>{b.retained_compositions[0].custody.population_census_digest=hash("wrong-census");},
      b=>{b.retained_compositions[0].custody.original_publication_digest=hash("wrong-publication");},
      b=>{b.retained_compositions[0].custody.captured_at_ms++;},
      b=>{b.retained_compositions.push(structuredClone(b.retained_compositions[0]));}
    ];
    for(const change of faults){const b=structuredClone(stored.payload) as CompositionV3Snapshot;change(b);
      // Simulate accidental/corrupt138 bytes while retaining trusted original135.
      // Rehashing child/self/parent is not independent producer authority.
      for(const entry of b.retained_compositions){const {custody_digest:_digest,...base}=entry.custody;
        if(entry.custody_digest===h.f.custody.custody_digest)entry.custody.custody_digest=accessDigest(base);}
      b.inputs_digest=accessDigest({retained_tasks:b.retained_tasks,retained_compositions:b.retained_compositions});
      b.calculation_key=accessDigest({mode:"ORIGINAL_INPUTS",source:b.source,inputs_digest:b.inputs_digest});
      expect(()=>decodeRetainedManagerScoreOriginal(h.f.document,{calculation_key:b.calculation_key,payload:b,payload_digest:accessDigest(b)},compositionV3Limits.maximum_bundle_bytes)).toThrow();
    }
    expect(await originalRow()).toEqual(stored);expect(await financialRows()).toEqual(sourceBefore);
  });
  it("binds original persistence to the actual135 generation rather than only the supplied parent document",async()=>{
    const f=await compositionV3Fixture(),custody=new ManagerScoreOriginalCustody(compositionV3Limits),p=custody.prepare(f.document,f.inputs,[f.custody]);
    await expect(tx(async client=>{const changed=structuredClone(f.document);changed.projection_generation="SYNTHETIC:other";
      await putSource(client,changed);await custody.persist(client,p);})).rejects.toThrow("MANAGER_ORIGINAL_SOURCE_MISMATCH");
    expect(await count("execution_manager_model_revisions")).toBe("0");
  });
  it("cannot retrofit v3 onto an existing immutable v1 original pointer for the same source",async()=>{
    const f=await compositionV3Fixture(),custody=new ManagerScoreOriginalCustody(compositionV3Limits);
    const old=custody.prepare(f.document,f.inputs),next=custody.prepare(f.document,f.inputs,[f.custody]);
    await tx(async client=>{await putSource(client,f.document);await custody.persist(client,old);});
    const before=await originalRow();await expect(tx(client=>custody.persist(client,next))).rejects.toThrow("MANAGER_ORIGINAL_HEAD_CONFLICT");
    expect(await originalRow()).toEqual(before);expect(await count("execution_manager_calculation_revisions")).toBe("1");
  });
  it("counts existing138 rows against the same cap, optionally omits custody and preserves the financial source",async()=>{
    const f=await compositionV3Fixture(),config={...compositionV3Config,maximum_revisions_per_source:1};
    const coordinator=new ManagerScoreRestatement({pool:pg,runtime:scoreRuntime(),currentPolicy:()=>null,
      commissioning:commissioning().handle,source:{read:async()=>null,recheck:async()=>({}),acknowledge:async()=>{}},
      publication:async()=>f.fx.d.publication,config});
    const delivery={document:f.document,publication:f.fx.d.publication};coordinator.attach(delivery,f.inputs,[f.custody]);
    await tx(async client=>{await putSource(client,f.document);const payload={schema_version:"SYNTHETIC:shared-quota-row"};
      await client.query(`INSERT INTO execution_manager_calculation_revisions
        (workspace_id,environment,profile_id,source_revision,calculation_key,payload_digest,payload) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)`,
      [f.document.workspace_id,f.document.environment,f.document.profile_id,f.document.revision,hash("shared-row"),accessDigest(payload),JSON.stringify(payload)]);
      await coordinator.persistAttached(client,delivery);});
    expect(coordinator.status().state).toBe("ORIGINAL_RETENTION_CAP_NOT_RETAINED");
    expect(await count("execution_manager_model_revisions")).toBe("1");expect(await count("execution_manager_calculation_revisions")).toBe("1");
    expect(await count("execution_manager_score_mode_heads")).toBe("0");expect((await financialRows())[0].payload_digest).toBe(accessDigest(f.document));
  });
  it("invalid new-v3 attach deletes an earlier attachment, omits the WHOLE optional bundle and preserves financial publication",async()=>{
    const f=await compositionV3Fixture(),coordinator=new ManagerScoreRestatement({pool:pg,runtime:scoreRuntime(),currentPolicy:()=>null,
      commissioning:commissioning().handle,source:{read:async()=>null,recheck:async()=>({}),acknowledge:async()=>{}},
      publication:async()=>f.fx.d.publication,config:compositionV3Config});
    const delivery={document:f.document,publication:f.fx.d.publication};coordinator.attach(delivery,f.inputs,[f.custody]);
    coordinator.attach(delivery,f.inputs,[structuredClone(f.custody)]);
    expect(coordinator.status()).toEqual({state:"ORIGINAL_COMPOSITION_CUSTODY_NOT_RETAINED",reason_code:"COMPOSITION_ORIGINAL_CUSTODY_INVALID"});
    await tx(async client=>{await putSource(client,f.document);await coordinator.persistAttached(client,delivery);});
    expect((await financialRows())[0].payload_digest).toBe(accessDigest(f.document));expect(await count("execution_manager_calculation_revisions")).toBe("0");
    expect(await count("execution_manager_score_mode_heads")).toBe("0");
  });
  it("uses actual PostgreSQL JSONB bytes for v3, not a new per-mode compact-byte quota",async()=>{
    const f=await compositionV3Fixture(),custody=new ManagerScoreOriginalCustody({...compositionV3Limits,maximum_retained_bytes_per_source:compositionV3Limits.maximum_bundle_bytes});
    const p=custody.prepare(f.document,f.inputs,[f.custody]);await tx(client=>putSource(client,f.document));
    const padding={padding:"x".repeat(compositionV3Limits.maximum_bundle_bytes-1024)};
    await pg.query(`INSERT INTO execution_manager_calculation_revisions
      (workspace_id,environment,profile_id,source_revision,calculation_key,payload_digest,payload) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)`,
    [f.document.workspace_id,f.document.environment,f.document.profile_id,f.document.revision,hash("byte-cap-row"),accessDigest(padding),JSON.stringify(padding)]);
    await expect(tx(client=>custody.persist(client,p))).rejects.toThrow("MANAGER_DERIVED_RETENTION_CAP_REACHED");
    expect(await count("execution_manager_calculation_revisions")).toBe("1");expect(await count("execution_manager_score_mode_heads")).toBe("0");
  });
  it("accepts v3 in the strict retained History inventory but performs no dependent restatement or source write",async()=>{
    const h=await committedV3(),before=await financialRows(),history=await new ManagerScoreHistoryStore(pg).scan(h.f.document,3000);
    expect(history.original?.schema_version).toBe("portal.execution.manager-score-original-inputs.v3");expect(history.restatements).toEqual([]);
    expect(history.original_head_key).toBe(h.prepared.calculation_key);expect(history.restated_head_key).toBeNull();expect(await financialRows()).toEqual(before);
  });
});
