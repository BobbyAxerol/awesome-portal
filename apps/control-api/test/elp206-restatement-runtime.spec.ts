/** Proposed actual-PG ExecutionManagerRuntime integration, NOT_RUN.
 * All authority/calibration/method/provider fixtures are SYNTHETIC, not real
 * TS/PM source acceptance or a source-held distributed-COMMIT qualification. */
import "reflect-metadata";
import {createHash,randomUUID} from "node:crypto";
import {setImmediate as yieldTurn} from "node:timers";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {Pool,type PoolClient} from "pg";
import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from "vitest";
import {accessDigest} from "../src/execution-v2/access-policy";
import {unqualifiedAccessTrust} from "../src/execution-v2/access-trust";
import type {ManagerModelDocument} from "../src/execution-v2/manager-model.contract";
import {ManagerModelRepository} from "../src/execution-v2/manager-model.store";
import {ExecutionManagerRuntime,type ManagerRuntimeInstallation} from "../src/execution-v2/manager-runtime";
import {ManagerScoreRuntime,loadApprovedManagerScorePolicy,managerScorePolicyHash,managerScoreRecalculationPolicy,
  type ApprovedManagerScorePolicy,type ManagerScoreRuntimeTask,type ManagerScoreRuntimePolicyArtifact} from "../src/execution-v2/manager-score-runtime";
import type {ManagerScoreOriginalInput} from "../src/execution-v2/manager-score-original-custody";
import type {ManagerScoreRecalculationTask} from "../src/execution-v2/manager-score-recalculation";
import type {ManagerProjectionSource} from "../src/execution-v2/manager-consumer";
import {loadPublicationCommissioning} from "../src/execution-v2/publication-adapter";
import type {DatasetPublication} from "../src/execution-v2/publication.contract";
import {EXECUTION_PUBLICATION_CATALOGUE} from "../src/execution-v2/publication-source.generated";
const hash=(s:string)=>"sha256:"+createHash("sha256").update(s).digest("hex");
const migrations=resolve(__dirname,"../migrations"),contracts=process.env.PORTAL_CONTRACTS_DIR??resolve(__dirname,"../../../packages/contracts");
const config={calculation_revision:"SYNTHETIC:restated-calc-r1",input_method_revision:"SYNTHETIC:method-wrapper-r1",
  maximum_bundle_bytes:262_144,maximum_revisions_per_source:6,maximum_retained_bytes_per_source:1_048_576};
const limits={maximum_observations:20,maximum_blocks:20,maximum_stress_subperiods:40,maximum_input_bytes:60_000,maximum_in_flight:1};
const bounds={maximum_documents_per_tick:1,maximum_document_bytes:1_048_576,maximum_document_rows:200,
  maximum_tick_ms:5000,source_timeout_ms:2000,transaction_timeout_ms:2000,lease_ttl_ms:4000};
const scope={workspace_id:"SYNTHETIC:restatement",environment:"paper" as const,profile_id:"PAPER_BINANCE_USDM"};
const catalogue=EXECUTION_PUBLICATION_CATALOGUE.source_catalogue_digest;
const scoped={...scope,catalogue_digest:catalogue};
function policy(asOf:number,name="B",delta="5",method="SYNTHETIC:grid",anchors="0.08",policyScope=scoped){
  const now=Date.now(),approved=now-500;
  const artifact:ManagerScoreRuntimePolicyArtifact={schema_version:"portal.execution.manager-score-policy-runtime.v1",scope:policyScope,
    policy:{formula_id:"qbts_prb_v1_1",qualification:"RUNTIME_APPROVED",policy_id:"SYNTHETIC:policy-"+name,
      policy_hash:hash("unset"),formula_hash:hash("SYNTHETIC:formula"),approved_policy_id:"SYNTHETIC:approval-"+name,
      calibration_snapshot_id:"SYNTHETIC:calibration-"+name,comparable_basis_id:"SYNTHETIC:basis",
      duration_key:"SYNTHETIC:400ms",observation_frequency:"SYNTHETIC:100ms",calendar:"SYNTHETIC:calendar",timezone:"UTC",
      currency:"USDT",cash_reference_id:"SYNTHETIC:cash",cost_method:"SYNTHETIC:all-net-costs",required_costs:["fees"],
      block_manifest_id:"SYNTHETIC:blocks",stress_policy_id:"SYNTHETIC:fixed-path",stress_delta_bps:delta,
      anchors:{twr:["-0.02",anchors],sharpe:["0","0.15"],mdd:["0","0.1"],add:["0","0.04"]},
      maturity:{minimum_samples:4,minimum_complete_blocks:2,minimum_duration_ms:400},canonical_decimal_places:12,
      issued_at_ms:approved-100,calibration_cutoff_ms:approved-200},
    runtime_config:{maximum_input_age_ms:100,minimum_window_ms:100,maximum_window_ms:10_000,
      grid_method_ref:method,flow_adjustment_method_ref:"SYNTHETIC:flows",ownership_method_ref:"SYNTHETIC:ownership",fx_method_ref:"SYNTHETIC:fx"}};
  artifact.policy.policy_hash=managerScorePolicyHash(artifact.policy);const bytes=JSON.stringify(artifact);
  const loaded=loadApprovedManagerScorePolicy({artifact_bytes:bytes,scope:policyScope,as_of_ms:now,
    approval_pin:{artifact_sha256:hash(bytes),policy_id:artifact.policy.policy_id,policy_hash:artifact.policy.policy_hash,
      formula_hash:artifact.policy.formula_hash,approved_policy_id:artifact.policy.approved_policy_id!,policy_revision:"SYNTHETIC:"+name,
      approval_ref:"SYNTHETIC_NOT_OWNER_APPROVAL:"+name,approved_at_ms:approved,valid_until_ms:now+120_000,scope:policyScope}});
  if(loaded.status!=="READY")throw new Error(JSON.stringify(loaded));
  const p=managerScoreRecalculationPolicy(loaded.handle,now,now);if(!p||approved<=asOf)throw new Error("SYNTHETIC_LATER_POLICY");
  return {handle:loaded.handle,p};
}
async function fixture(kind:"METRICS"|"PATH"="METRICS",bound=true,mixed=false){
  const asOf=Date.now()-20_000,start=asOf-400,loaded=policy(asOf);
  const q={comparable_basis_id:"SYNTHETIC:basis",individual_evidence_binding_id:"SYNTHETIC:evidence",
    window_start_ms:start,window_end_ms:asOf,as_of_ms:asOf,observed_duration_ms:400,currency:"USDT",
    required_costs_complete:true,stale:false,data_valid:true};
  const base={scope:scoped,binding:{subject_type:"alpha" as const,subject_id:"SYNTHETIC:alpha",
    tuple_population_digest:hash("SYNTHETIC:population"),partition_digest:hash("SYNTHETIC:partition"),stage_filter:["PAPER" as const],
    window_start_ms:start,window_end_ms:asOf,comparable_basis_id:q.comparable_basis_id,individual_evidence_binding_id:q.individual_evidence_binding_id},
    source_revision:"SYNTHETIC:source-r1",source_set_digest:accessDigest([]),source_qualification:"SOURCE_VERIFIED" as const,
    calculation_revision:"SYNTHETIC:original-worker",computed_at_ms:asOf+1000,expected_policy_revision:null};
  const metrics:Omit<ManagerScoreRuntimeTask,"policy">={...base,input:{kind:"METRICS",quality:{...q,sample_count:4,complete_block_count:2,
    metrics:{net_excess_twr:"0.06",sharpe_period:"0.12",mdd:"0.04",add:"0.01",positive_block_ratio:"0.75",stress_excess_twr:"0.045"}}}};
  const path:Omit<ManagerScoreRuntimeTask,"policy">={...base,binding:{...base.binding,subject_id:"SYNTHETIC:path-alpha"},
    input:{kind:"PATH",quality:q,path:{observations:["0.02","-0.01","0.015","-0.005"].map((net_return,i)=>({
      from_ms:start+i*100,to_ms:start+(i+1)*100,net_return,cash_return:"0",stress_subperiods:null})),
      blocks:[{from_ms:start,to_ms:asOf,complete:true,expected_observations:4}],window_start_ms:start,window_end_ms:asOf,
      expected_observations:4,grid_verified:true,required_costs_complete:true,currency:"USDT",cash_currency:"USDT",
      block_manifest_registered_at_ms:start-1,stress_delta_bps:"5"}}};
  const tasks=mixed?[metrics,path]:[kind==="PATH"?path:metrics],items:ManagerScoreOriginalInput[]=[];
  const runtime=new ManagerScoreRuntime(limits),scores=[];
  for(const task of tasks){
    // Synthetic stand-in for method proof supplied BEFORE original calculation
    // by an independently qualified producer, never generated by custody.
    const dep=bound&&task.input.kind==="METRICS"?{source_revision:task.source_revision,source_set_digest:task.source_set_digest,
      source_as_of_ms:asOf,metrics_input_digest:accessDigest(task.input),method_digest:loaded.p.method_digest,stress_delta_bps:"5",
      source_locator:"SYNTHETIC:original-method-artifact-NOT-source-qualification"}:undefined;
    if(dep)task.metrics_dependency_digest=accessDigest(dep);
    const result=await runtime.calculate({...task,policy:null}),{preview:_preview,...quality}=result.quality;
    scores.push({slot:"RAW" as const,quality,raw_metrics:result.raw_metrics,provenance:result.provenance});
    items.push({slot:"RAW",input_json:JSON.stringify(task),task,...(dep?{metrics_dependency:dep}:{})});
  }
  const doc:ManagerModelDocument={schema_version:"portal.execution.manager-model-input.v1",...scope,qualification:"SOURCE_VERIFIED",
    family_id:"alpha_fleet_overview",revision:base.source_revision,supersedes_revision:null,source_epoch:"SYNTHETIC:epoch",source_sequence:"1",
    projection_generation:"SYNTHETIC:g1",catalogue_digest:catalogue,source_set_digest:base.source_set_digest,as_of_ms:asOf,
    recorded_through_ms:asOf,facts_through_ms:asOf,observed_at_ms:Date.now(),source_quality:{completeness:"COMPLETE",freshness:"FRESH",reasons:[]},
    members:[],facts:[],precomputed_scores:scores};
  const artifact={schema_version:"portal.execution.publication-commissioning.v1",scope,catalogue_digest:catalogue,
    adapter_id:"SYNTHETIC_NOT_SOURCE_AUTHORITY",family_ids:[doc.family_id],purposes:["BUSINESS"],
    receipt_pins:{source_read:"SYNTHETIC:read",transport_trust:"SYNTHETIC:transport",privacy:"SYNTHETIC:privacy",field_policy:"SYNTHETIC:fields"}};
  const bytes=JSON.stringify(artifact),commissioning=loadPublicationCommissioning(bytes,{artifact_sha256:hash(bytes),adapter_id:artifact.adapter_id,
    approval_ref:"SYNTHETIC_NOT_OWNER_APPROVAL",approved_at_ms:asOf-1000,valid_until_ms:Date.now()+120_000},Date.now());
  const publication=JSON.parse(readFileSync(resolve(contracts,"fixtures/execution-dataset-publication.synthetic.valid.json"),"utf8")).value as DatasetPublication;
  Object.assign(publication,{environment:scope.environment,profile_id:scope.profile_id,family_id:doc.family_id,catalogue_digest:catalogue,
    history_capability:"CURRENT_ONLY",barrier:null,issued_at_ms:asOf-1000,expires_at_ms:Date.now()+120_000,
    source_as_of_ms:asOf,observed_at_ms:doc.observed_at_ms});
  for(const key of ["source_read","transport_trust","privacy","field_policy"] as const)
    publication[key]={qualification:"SOURCE_VERIFIED",receipt_ref:artifact.receipt_pins[key]};
  publication.authority={...publication.authority,...scope,qualification:"SOURCE_VERIFIED",tuples:[],resources:[],
    binding:{dataset_id:doc.family_id,source_revision:doc.revision,projection_generation:doc.projection_generation,catalogue_revision:catalogue,window:null}};
  return {doc,items,loaded,runtime,publication,commissioning};
}
type Fixture=Awaited<ReturnType<typeof fixture>>;
describe.skipIf(!process.env.TEST_DATABASE_URL)("R06 runtime opt-in wiring — actual PG, SYNTHETIC source/approval only",()=>{
  const name="elp206_rest_runtime_"+randomUUID().replaceAll("-","");
  const url=(db:string)=>{const u=new URL(process.env.TEST_DATABASE_URL!);u.pathname="/"+db;return u.toString();};
  const options={max:2,connectionTimeoutMillis:2000,query_timeout:4000};
  let pool:Pool;const runtimes:ExecutionManagerRuntime[]=[];
  beforeAll(async()=>{
    if(!/^elp206_rest_runtime_[a-f0-9]{32}$/.test(name))throw new Error("SYNTHETIC_DB_NAME");
    const admin=new Pool({...options,max:1,connectionString:url("postgres")});
    try{await admin.query("CREATE DATABASE "+name);}finally{await admin.end();}
    pool=new Pool({...options,connectionString:url(name)});
    for(const file of ["1723680000135_execution-manager-models.sql","1723680000137_execution-manager-consumer-fence.sql",
      "1723680000138_execution-manager-calculation-revisions.sql","1723680000139_execution-manager-score-mode-heads.sql"])
      await pool.query(readFileSync(resolve(migrations,file),"utf8").split("-- Down Migration")[0]);
  },60_000);
  beforeEach(async()=>{
    vi.restoreAllMocks();for(const runtime of runtimes.splice(0))await runtime.beforeApplicationShutdown();
    await pool.query("TRUNCATE execution_manager_score_mode_heads,execution_manager_calculation_heads,execution_manager_calculation_revisions,execution_manager_model_heads,execution_manager_model_revisions,execution_manager_consumer_fences");
  });
  afterAll(async()=>{
    vi.restoreAllMocks();for(const runtime of runtimes.splice(0))await runtime.beforeApplicationShutdown();
    await pool?.end();
    if(!/^elp206_rest_runtime_[a-f0-9]{32}$/.test(name))throw new Error("SYNTHETIC_DB_NAME");
    const admin=new Pool({...options,max:1,connectionString:url("postgres")});
    try{await admin.query("DROP DATABASE IF EXISTS "+name+" WITH (FORCE)");}finally{await admin.end();}
  },60_000);
  function transactionPool(after:(sql:string,client:PoolClient)=>Promise<void>):Pool{
    return new Proxy(pool,{get(target,key){
      if(key==="connect")return async()=>{
        const client=await target.connect();return new Proxy(client,{get(real,field){
          if(field==="query")return async(...args:unknown[])=>{
            const result=await(real.query.bind(real) as unknown as (...args:unknown[])=>Promise<unknown>)(...args);
            await after(String(args[0]),real);return result;
          };
          const value=Reflect.get(real,field,real);return typeof value==="function"?value.bind(real):value;
        }});
      };
      const value=Reflect.get(target,key,target);return typeof value==="function"?value.bind(target):value;
    }});
  }
  function installed(f:Fixture,restatement:typeof config|false={...config},database=pool){
    const raw=structuredClone(f.doc);delete raw.precomputed_scores;
    const state={policy:null as ApprovedManagerScorePolicy|null,pending:true,revoked:false};
    const acknowledge=vi.fn<ManagerProjectionSource["acknowledge"]>(async()=>undefined);
    const recheck=vi.fn<ManagerProjectionSource["recheck"]>(async()=>({assertCurrent:()=>{
      if(state.revoked)throw new Error("SYNTHETIC_SOURCE_CURRENT_REVOKED");
    }}));
    const source:ManagerProjectionSource={read:vi.fn(async()=>{
      if(!state.pending)return null;state.pending=false;return structuredClone({document:raw,publication:f.publication});
    }),recheck,acknowledge};
    // Return the provider's actual mutable references intentionally. The runtime
    // must detach them before its FIRST yield/worker await, not in late attach.
    const taskItems:ManagerScoreRecalculationTask[]=f.items.map(i=>({slot:i.slot,task:i.task,
      ...(i.metrics_dependency?{metrics_dependency:i.metrics_dependency}:{})}));
    const tasks=vi.fn(async():Promise<ManagerScoreRecalculationTask[]>=>taskItems);
    const score={runtime:f.runtime,maximum_tasks_per_revision:4,currentPolicy:()=>state.policy,tasks,
      ...(restatement?{restatement}: {})};
    const installation:ManagerRuntimeInstallation={trust:unqualifiedAccessTrust,cadence_ms:1000,maximum_publication_reads:1,
      partitions:[{scope,commissioning:f.commissioning,bounds,source,publication:async()=>f.publication,score}]};
    const runtime=new ExecutionManagerRuntime(database,installation);runtimes.push(runtime);
    return {f,state,source,acknowledge,recheck,tasks,taskItems,installation,runtime};
  }
  type Harness=ReturnType<typeof installed>;
  const rows=async(table:string)=>(await pool.query("SELECT count(*)::text AS n FROM "+table)).rows[0].n;
  const sourceRows=async()=>(await pool.query("SELECT revision,payload::text,payload_digest,source_sequence::text,projection_generation FROM execution_manager_model_revisions ORDER BY revision")).rows;
  const sourceHeads=async()=>(await pool.query("SELECT * FROM execution_manager_model_heads ORDER BY workspace_id,environment,profile_id")).rows;
  async function originalRow(){
    return (await pool.query("SELECT r.payload,r.payload_digest,h.calculation_key FROM execution_manager_score_mode_heads h JOIN execution_manager_calculation_revisions r USING(workspace_id,environment,profile_id,source_revision,calculation_key) WHERE h.head_kind='ORIGINAL_INPUTS'")).rows[0];
  }
  async function sourceDocument(h:Harness){
    const value=await new ManagerModelRepository(pool).document(scope.workspace_id,scope.environment,scope.profile_id,h.f.doc.revision);
    if(!value)throw new Error("SYNTHETIC_SOURCE_MISSING");return value;
  }
  function coordinator(h:Harness){
    const value=h.runtime.restatementFor(scope);if(!value)throw new Error("SYNTHETIC_RESTATEMENT_NOT_INSTALLED");return value;
  }
  it("captures pending ORIGINAL inside the actual source transaction before ACK without claiming approved score",async()=>{
    const h=installed(await fixture()),worker=vi.spyOn(h.f.runtime,"calculate");
    expect(h.runtime.status().automatic_loop).toBe(false);await h.runtime.tick();
    expect(h.runtime.status().state).toBe("TICK_OK");expect(worker).toHaveBeenCalledTimes(1);
    const document=await sourceDocument(h),original=await originalRow();
    expect(document.precomputed_scores![0].quality).toMatchObject({value:null,status:"policy_pending"});
    expect(original.payload.retained_tasks[0].input_json).toBe(JSON.stringify(h.taskItems[0].task));
    expect(original.payload.retained_tasks[0].input_digest).toBe(document.precomputed_scores![0].provenance.input_digest);
    expect(original.payload.source.payload_digest).toBe(accessDigest(document));
    expect(h.acknowledge).toHaveBeenCalledTimes(1);expect(await rows("execution_manager_calculation_heads")).toBe("0");
    expect((await coordinator(h).snapshot(document)).key).toBe(null);
  });
  it("detaches provider task and dependency bytes before setImmediate mutation and before the first worker await",async()=>{
    const h=installed(await fixture()),before=JSON.stringify(h.taskItems[0].task),beforeDependency=structuredClone(h.taskItems[0].metrics_dependency);
    let mutated=false;
    h.tasks.mockImplementation(async()=>{
      yieldTurn(()=>{
        const task=h.taskItems[0].task;if(task.input.kind==="METRICS")task.input.quality.metrics.mdd="0.99";
        if(h.taskItems[0].metrics_dependency)h.taskItems[0].metrics_dependency!.method_digest=hash("SYNTHETIC:mutated-after-return");
        mutated=true;
      });return h.taskItems;
    });
    await h.runtime.tick();expect(mutated).toBe(true);expect(h.runtime.status().state).toBe("TICK_OK");
    const original=await originalRow(),document=await sourceDocument(h);
    expect(original.payload.retained_tasks[0].input_json).toBe(before);
    expect(original.payload.retained_tasks[0].metrics_dependency).toEqual(beforeDependency);
    expect(document.precomputed_scores![0].provenance.input_digest).toBe(hash(before));
    expect(h.acknowledge).toHaveBeenCalledTimes(1);
  });
  it("reuses committed ORIGINAL and exact worker timestamps after lost ACK and restart of the real consumer",async()=>{
    const h=installed(await fixture()),worker=vi.spyOn(h.f.runtime,"calculate");
    h.acknowledge.mockRejectedValueOnce(new Error("SYNTHETIC_ACK_LOST"));
    await h.runtime.tick();expect(h.runtime.status().state).toBe("TICK_REFUSED");
    const beforeSource=await sourceRows(),beforeOriginal=await originalRow();expect(beforeSource).toHaveLength(1);
    await h.runtime.beforeApplicationShutdown();h.state.pending=true;
    const restarted=new ExecutionManagerRuntime(pool,h.installation);runtimes.push(restarted);await restarted.tick();
    expect(restarted.status().state).toBe("TICK_OK");expect(worker).toHaveBeenCalledTimes(1);expect(h.tasks).toHaveBeenCalledTimes(1);
    expect(await sourceRows()).toEqual(beforeSource);expect(await originalRow()).toEqual(beforeOriginal);
    expect(await rows("execution_manager_calculation_revisions")).toBe("1");
    expect(h.acknowledge).toHaveBeenCalledTimes(2);expect(h.acknowledge.mock.calls[1][0]).toEqual(h.acknowledge.mock.calls[0][0]);
  });
  it("uses the existing financial IDLE/lease for later B without another source ACK/head/revision or fresh K each tick",async()=>{
    const h=installed(await fixture("METRICS",true,true));await h.runtime.tick();
    const document=await sourceDocument(h),beforeSource=await sourceRows(),beforeHeads=await sourceHeads(),beforeOriginal=await originalRow();
    h.state.policy=h.f.loaded.handle;const namedWorker=vi.spyOn(h.f.runtime,"calculateRestated");await h.runtime.tick();
    expect(h.runtime.status().state).toBe("TICK_OK");const first=await coordinator(h).snapshot(document);
    expect(first.view?.entries).toHaveLength(2);
    expect(first.view?.entries.filter(e=>e.historical!==null)).toHaveLength(1);
    expect(first.view?.entries.find(e=>e.binding.subject_id==="SYNTHETIC:path-alpha")).toMatchObject({
      availability:"NOT_PUBLISHED",historical:null,reason_codes:["PATH_METHOD_PROOF_NOT_RETAINED"]});
    expect(first.view?.knowledge_cutoff_ms).toBeGreaterThan(document.as_of_ms);
    expect(first.view).toMatchObject({purpose:"HISTORICAL_ANALYSIS_ONLY",operational_current:false});
    await h.runtime.tick();expect(await coordinator(h).snapshot(document)).toEqual(first);expect(namedWorker).toHaveBeenCalledTimes(1);
    expect(await sourceRows()).toEqual(beforeSource);expect(await sourceHeads()).toEqual(beforeHeads);expect(await originalRow()).toEqual(beforeOriginal);
    expect(h.acknowledge).toHaveBeenCalledTimes(1);expect(h.tasks).toHaveBeenCalledTimes(1);
    expect(await rows("execution_manager_calculation_heads")).toBe("0");
  });
  it("rolls real source/custody/head INSERTs back when the existing final source fence is revoked before COMMIT",async()=>{
    let state:Harness["state"]|undefined,modelInserted=false,custodyInserted=false;
    const database=transactionPool(async sql=>{
      if(sql.includes("INSERT INTO execution_manager_model_revisions"))modelInserted=true;
      if(sql.includes("INSERT INTO execution_manager_calculation_revisions")&&state){custodyInserted=true;state.revoked=true;}
    });
    const h=installed(await fixture(),{...config},database);state=h.state;await h.runtime.tick();
    expect(modelInserted).toBe(true);expect(custodyInserted).toBe(true);expect(h.runtime.status().state).toBe("TICK_REFUSED");
    for(const table of ["execution_manager_model_revisions","execution_manager_model_heads","execution_manager_calculation_revisions","execution_manager_score_mode_heads"])
      expect(await rows(table)).toBe("0");
    expect(h.acknowledge).not.toHaveBeenCalled();
  });
  it("keeps default and opt-out unchanged and rejects simultaneous legacy/new mode installation",async()=>{
    const defaultRuntime=new ExecutionManagerRuntime(pool);runtimes.push(defaultRuntime);
    await defaultRuntime.tick();expect(defaultRuntime.status()).toMatchObject({state:"SOURCE_PROVIDER_NOT_INSTALLED",partitions:0,automatic_loop:false});
    expect(defaultRuntime.restatementFor(scope)).toBeUndefined();expect(defaultRuntime.recalculationFor(scope)).toBeUndefined();
    const h=installed(await fixture(),false);expect(h.runtime.restatementFor(scope)).toBeUndefined();await h.runtime.tick();
    expect(h.runtime.status().state).toBe("TICK_OK");expect(h.acknowledge).toHaveBeenCalledTimes(1);
    expect(await rows("execution_manager_calculation_revisions")).toBe("0");
    const p=h.installation.partitions[0],invalid:ManagerRuntimeInstallation={...h.installation,
      partitions:[{...p,score:{...p.score!,recalculation:{...config},restatement:{...config}}}]};
    expect(()=>new ExecutionManagerRuntime(pool,invalid)).toThrow();
  });
  it("optional custody budget omission preserves financial source+ACK and later IDLE stays typed not-retained",async()=>{
    const h=installed(await fixture(),{...config,maximum_bundle_bytes:128,maximum_retained_bytes_per_source:1024});
    await h.runtime.tick();expect(h.runtime.status().state).toBe("TICK_OK");expect(await rows("execution_manager_model_revisions")).toBe("1");
    expect(await rows("execution_manager_calculation_revisions")).toBe("0");expect(await rows("execution_manager_score_mode_heads")).toBe("0");
    expect(h.acknowledge).toHaveBeenCalledTimes(1);const before=await sourceRows();h.state.policy=h.f.loaded.handle;
    await h.runtime.tick();expect(h.runtime.status().state).toBe("TICK_OK");
    expect(coordinator(h).status().state).toBe("RESTATED_ORIGINAL_NOT_RETAINED");
    expect(await sourceRows()).toEqual(before);expect(h.acknowledge).toHaveBeenCalledTimes(1);
  });
  it("does not count optional input_json twice against ordinary source-task admission",async()=>{
    const h=installed(await fixture()),sourceCap=16_384;
    // Original workers hash but do not interpret bounded opaque root own-data.
    // This fixture adds no numeric/source/method semantics or source authority.
    Object.assign(h.taskItems[0].task,{opaque_source_note:"x".repeat(10_000)});
    const originalJson=JSON.stringify(h.taskItems[0].task);
    expect(Buffer.byteLength(JSON.stringify(h.taskItems))).toBeLessThan(sourceCap);
    expect(Buffer.byteLength(JSON.stringify(h.taskItems.map(item=>({...item,input_json:JSON.stringify(item.task)})))))
      .toBeGreaterThan(sourceCap);
    // Materialized score output has no opaque input copy; it remains inside the
    // independently enforced financial document/delivery cap, not just task cap.
    expect(Buffer.byteLength(JSON.stringify({document:h.f.doc,publication:h.f.publication}))).toBeLessThan(sourceCap);
    const installation:ManagerRuntimeInstallation={...h.installation,partitions:h.installation.partitions.map(p=>({
      ...p,bounds:{...p.bounds,maximum_document_bytes:sourceCap}}))};
    const runtime=new ExecutionManagerRuntime(pool,installation);runtimes.push(runtime);
    const worker=vi.spyOn(h.f.runtime,"calculate");
    await runtime.tick();expect(runtime.status().state).toBe("TICK_OK");expect(worker).toHaveBeenCalledTimes(1);
    const document=await sourceDocument(h);
    expect(document.precomputed_scores![0].provenance.input_digest).toBe(hash(originalJson));
    expect(Buffer.byteLength(JSON.stringify({document,publication:h.f.publication}))).toBeLessThan(sourceCap);
    expect(await rows("execution_manager_model_revisions")).toBe("1");expect(h.acknowledge).toHaveBeenCalledTimes(1);
    // This deliberately generous custody cap can retain the larger ORIGINAL
    // wrapper. Its bytes still do not redefine ordinary financial admission.
    const original=await originalRow();expect(original.payload.retained_tasks[0].input_json).toBe(originalJson);
  });
  it("does not apply custody's conservative per-number estimate to ordinary source-task admission",async()=>{
    const h=installed(await fixture()),sourceCap=16_384,opaqueValues=Array.from({length:1024},()=>0);
    Object.assign(h.taskItems[0].task,{opaque_source_numbers:opaqueValues});
    const originalJson=JSON.stringify(h.taskItems[0].task);
    expect(opaqueValues.length*24).toBeGreaterThan(sourceCap);
    expect(Buffer.byteLength(JSON.stringify(h.taskItems))).toBeLessThan(sourceCap);
    // Isolate the estimator regression: even the duplicate wrapper fits here.
    expect(Buffer.byteLength(JSON.stringify(h.taskItems.map(item=>({...item,input_json:JSON.stringify(item.task)})))))
      .toBeLessThan(sourceCap);
    expect(Buffer.byteLength(JSON.stringify({document:h.f.doc,publication:h.f.publication}))).toBeLessThan(sourceCap);
    const installation:ManagerRuntimeInstallation={...h.installation,partitions:h.installation.partitions.map(p=>({
      ...p,bounds:{...p.bounds,maximum_document_bytes:sourceCap}}))};
    const runtime=new ExecutionManagerRuntime(pool,installation);runtimes.push(runtime);
    const worker=vi.spyOn(h.f.runtime,"calculate");
    await runtime.tick();expect(runtime.status().state).toBe("TICK_OK");expect(worker).toHaveBeenCalledTimes(1);
    const document=await sourceDocument(h);
    expect(document.precomputed_scores![0].provenance.input_digest).toBe(hash(originalJson));
    expect(Buffer.byteLength(JSON.stringify({document,publication:h.f.publication}))).toBeLessThan(sourceCap);
    expect(await rows("execution_manager_model_revisions")).toBe("1");expect(h.acknowledge).toHaveBeenCalledTimes(1);
    expect((await originalRow()).payload.retained_tasks[0].input_json).toBe(originalJson);
  });
});
