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
import { ExecutionManagerRuntime, type ManagerRuntimeInstallation } from "../src/execution-v2/manager-runtime";
import { loadPublicationCommissioning, qualifyDatasetPublication, withCataloguePublications } from "../src/execution-v2/publication-adapter";
import { EXECUTION_PUBLICATION_CATALOGUE } from "../src/execution-v2/publication-source.generated";
import { ManagerScoreRuntime, loadApprovedManagerScorePolicy, managerScorePolicyHash, managerScorePublicationCurrent, managerScorePublicationPolicyCurrent,
  type ManagerScoreRuntimePolicyArtifact, type ManagerScoreRuntimeTask } from "../src/execution-v2/manager-score-runtime";
import { managerScorePublication } from "../src/execution-v2/manager-score-publication.contract";
import { managerScorePopulationDigest } from "../src/execution-v2/manager-score-publication";
import { ManagerModelRepository } from "../src/execution-v2/manager-model.store";
import type { ManagerModelDocument } from "../src/execution-v2/manager-model.contract";
import type { DatasetPublication } from "../src/execution-v2/publication.contract";
import { queryManagerModel } from "../src/execution-v2/manager-model";
import { ManagerModelService } from "../src/execution-v2/manager-model.service";
import { KeysetCursorCodec } from "../src/query/cursor";
import { BUSINESS_READ_FIELDS } from "../src/execution-v2/read-fields";
import { productReadFixture, OWN } from "./elp2-product-read.fixture";
import { testConfig } from "./harness";

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
    expect(await trust.readPublication!({...scope,binding:d.publication.authority.binding})).toEqual(d.publication.authority);
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
    const runtime={scoreFence:{accepts:()=>active}} as ExecutionManagerRuntime;
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
  beforeAll(async()=>{const admin=new Pool({connectionString:url("postgres"),max:1});try{await admin.query(`CREATE DATABASE ${name}`);}finally{await admin.end();}
    pool=new Pool({connectionString:url(name),max:2,connectionTimeoutMillis:2000,query_timeout:4000});
    for(const file of ["1723680000135_execution-manager-models.sql","1723680000137_execution-manager-consumer-fence.sql"])
      await pool.query(readFileSync(resolve(__dirname,"../migrations",file),"utf8").split("-- Down Migration")[0]);},60000);
  beforeEach(async()=>{for(const r of runtimes.splice(0))await r.beforeApplicationShutdown();await pool.query("TRUNCATE execution_manager_model_heads,execution_manager_model_revisions,execution_manager_consumer_fences");});
  afterAll(async()=>{for(const r of runtimes.splice(0))await r.beforeApplicationShutdown();await pool?.end();const admin=new Pool({connectionString:url("postgres"),max:1});
    try{if(!/^elp210_commission_[a-f0-9]{32}$/.test(name))throw new Error("DB_NAME");await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);}finally{await admin.end();}},60000);
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
