/** Proposed actual disposable-PG coordinator tests; NOT_RUN. Every source,
 * method, calibration, grant/approval receipt below is SYNTHETIC, not TS authority.
 * Direct seed tests the private coordinator, not source intake/ACK commissioning. */
import {createHash,randomUUID} from "node:crypto";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {performance} from "node:perf_hooks";
import {Pool,type PoolClient} from "pg";
import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from "vitest";
import {accessDigest} from "../src/execution-v2/access-policy";
import type {ManagerMember,ManagerModelDocument} from "../src/execution-v2/manager-model.contract";
import {managerScorePopulationDigest} from "../src/execution-v2/manager-score-publication";
import {ManagerScoreRevisionService} from "../src/execution-v2/manager-score-revision.service";
import {ExecutionManagerRuntime} from "../src/execution-v2/manager-runtime";
import {unqualifiedAccessTrust} from "../src/execution-v2/access-trust";
import {BUSINESS_READ_FIELDS} from "../src/execution-v2/read-fields";
import {productReadFixture,OWN,PEER,PRIVATE} from "./elp2-product-read.fixture";
import {ManagerScoreRuntime,loadApprovedManagerScorePolicy,managerScorePolicyHash,managerScoreRecalculationPolicy,
  managerScorePublicationPolicyCurrent,managerScoreMethodDigest,type ApprovedManagerScorePolicy,type ManagerScoreRuntimeTask,
  type ManagerScoreMethodDescriptor,
  type ManagerScoreRuntimePolicyArtifact} from "../src/execution-v2/manager-score-runtime";
import {ManagerScoreOriginalCustody,captureManagerScoreOriginalInputs,type ManagerScoreOriginalInput,
  type ManagerScorePathMethodManifest} from "../src/execution-v2/manager-score-original-custody";
import {ManagerScoreRestatement} from "../src/execution-v2/manager-score-restatement";
import type {ManagerScoreHistoryStore} from "../src/execution-v2/manager-score-history.store";
import {ManagerProjectionLeases} from "../src/execution-v2/manager-lease";
import type {ManagerProjectionSource} from "../src/execution-v2/manager-consumer";
import {loadPublicationCommissioning} from "../src/execution-v2/publication-adapter";
import type {DatasetPublication} from "../src/execution-v2/publication.contract";
import {EXECUTION_PUBLICATION_CATALOGUE} from "../src/execution-v2/publication-source.generated";

const hash=(s:string)=>"sha256:"+createHash("sha256").update(s).digest("hex");
const migrations=resolve(__dirname,"../migrations"),contracts=process.env.PORTAL_CONTRACTS_DIR??resolve(__dirname,"../../../packages/contracts");
const config={calculation_revision:"SYNTHETIC:restated-calc-r1",input_method_revision:"SYNTHETIC:method-wrapper-r1",
  maximum_bundle_bytes:262_144,maximum_revisions_per_source:6,maximum_retained_bytes_per_source:1_048_576};
const limits={maximum_observations:20,maximum_blocks:20,maximum_stress_subperiods:40,maximum_input_bytes:60_000,maximum_in_flight:1};
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
  const a=artifact.policy,c=artifact.runtime_config;
  const methodDescriptor:ManagerScoreMethodDescriptor={formula_hash:a.formula_hash,comparable_basis_id:a.comparable_basis_id,
    duration_key:a.duration_key,observation_frequency:a.observation_frequency,calendar:a.calendar,timezone:a.timezone,
    currency:a.currency,cash_reference_id:a.cash_reference_id,cost_method:a.cost_method,required_costs:a.required_costs,
    block_manifest_id:a.block_manifest_id,stress_policy_id:a.stress_policy_id,grid_method_ref:c.grid_method_ref,
    flow_adjustment_method_ref:c.flow_adjustment_method_ref,ownership_method_ref:c.ownership_method_ref,fx_method_ref:c.fx_method_ref};
  return {handle:loaded.handle,p,methodDescriptor};
}
type ReadBinding={scope:typeof scope;members:ManagerMember[];subject_id:string;partition:{economic_domain:"PAPER";
  currency:string;basis:string;native_profile_ref:string;domain_proof_ref:string}};
async function fixture(kind:"METRICS"|"PATH"="METRICS",bound=true,mixed=false,readBinding?:ReadBinding,pathProof=false,
  pathFault?:(task:Omit<ManagerScoreRuntimeTask,"policy">)=>void){
  // Configure the exact source/custody binding BEFORE worker bytes/digests are
  // calculated. Never retrofit identities/census into an already hashed task.
  const fixtureScope=readBinding?.scope??scope,runtimeScope={...fixtureScope,catalogue_digest:catalogue};
  const asOf=Date.now()-20_000,start=asOf-400,loaded=policy(asOf,"B","5","SYNTHETIC:grid","0.08",runtimeScope);
  const q={comparable_basis_id:"SYNTHETIC:basis",individual_evidence_binding_id:"SYNTHETIC:evidence",
    window_start_ms:start,window_end_ms:asOf,as_of_ms:asOf,observed_duration_ms:400,currency:"USDT",
    required_costs_complete:true,stale:false,data_valid:true};
  const base={scope:runtimeScope,binding:{subject_type:"alpha" as const,subject_id:readBinding?.subject_id??"SYNTHETIC:alpha",
    tuple_population_digest:readBinding?managerScorePopulationDigest(readBinding.members.filter(m=>m.tuple.alpha_id===readBinding.subject_id)):
      hash("SYNTHETIC:population"),partition_digest:readBinding?accessDigest(readBinding.partition):hash("SYNTHETIC:partition"),stage_filter:["PAPER" as const],
    window_start_ms:start,window_end_ms:asOf,comparable_basis_id:q.comparable_basis_id,individual_evidence_binding_id:q.individual_evidence_binding_id},
    source_revision:"SYNTHETIC:source-r1",source_set_digest:accessDigest(readBinding?.members.map(m=>m.tuple)??[]),source_qualification:"SOURCE_VERIFIED" as const,
    calculation_revision:"SYNTHETIC:original-worker",computed_at_ms:asOf+1000,expected_policy_revision:null};
  const metrics:Omit<ManagerScoreRuntimeTask,"policy">={...base,input:{kind:"METRICS",quality:{...q,sample_count:4,complete_block_count:2,
    metrics:{net_excess_twr:"0.06",sharpe_period:"0.12",mdd:"0.04",add:"0.01",positive_block_ratio:"0.75",stress_excess_twr:"0.045"}}}};
  const path:Omit<ManagerScoreRuntimeTask,"policy">={...base,binding:{...base.binding,subject_id:readBinding?.subject_id??"SYNTHETIC:path-alpha"},
    input:{kind:"PATH",quality:q,path:{observations:["0.02","-0.01","0.015","-0.005"].map((net_return,i)=>({
      from_ms:start+i*100,to_ms:start+(i+1)*100,net_return,cash_return:"0",stress_subperiods:null})),
      blocks:[{from_ms:start,to_ms:asOf,complete:true,expected_observations:4}],window_start_ms:start,window_end_ms:asOf,
      expected_observations:4,grid_verified:true,required_costs_complete:true,currency:"USDT",cash_currency:"USDT",
      block_manifest_registered_at_ms:start-1,stress_delta_bps:"5"}}};
  if(pathProof&&path.input.kind==="PATH"){
    path.input.path.blocks=[{from_ms:start,to_ms:start+200,complete:true,expected_observations:2},
      {from_ms:start+200,to_ms:asOf,complete:true,expected_observations:2}];
    for(const observation of path.input.path.observations)observation.stress_subperiods=[{
      net_return:observation.net_return,opening_capital:"10000",gross_executed_notional:"1000",turnover_verified:true}];
    pathFault?.(path);
  }
  const tasks=mixed?[metrics,path]:[kind==="PATH"?path:metrics],items:ManagerScoreOriginalInput[]=[];
  const runtime=new ManagerScoreRuntime(limits),scores=[];
  for(const task of tasks){
    // Synthetic stand-in for method proof supplied BEFORE original calculation
    // by an independently qualified producer, never generated by custody.
    const dep=bound&&task.input.kind==="METRICS"?{source_revision:task.source_revision,source_set_digest:task.source_set_digest,
      source_as_of_ms:asOf,metrics_input_digest:accessDigest(task.input),method_digest:loaded.p.method_digest,stress_delta_bps:"5",
      source_locator:"SYNTHETIC:original-method-artifact-NOT-source-qualification"}:undefined;
    if(dep)task.metrics_dependency_digest=accessDigest(dep);
    // Explicit synthetic stand-in for an independently available source-method
    // record BEFORE original capture. The production adapter must supply this
    // artifact; neither custody nor current policy constructs it.
    let pathDependency:ManagerScoreOriginalInput["path_dependency"];
    if(pathProof&&task.input.kind==="PATH"){
      const manifest:ManagerScorePathMethodManifest={schema_version:"portal.execution.manager-score-path-method.v1",
        scope_digest:accessDigest(task.scope),binding_digest:accessDigest(task.binding),source_revision:task.source_revision,
        source_set_digest:task.source_set_digest,source_as_of_ms:asOf,path_input_digest:accessDigest(task.input),
        method:loaded.methodDescriptor,method_digest:managerScoreMethodDigest(loaded.methodDescriptor),
        method_manifest_ref:"SYNTHETIC:pre-existing-method-NOT-source-qualification",available_at_ms:asOf,
        source_locator:"SYNTHETIC:source-method-record-NOT-source-qualification",original_stress_delta_bps:task.input.path.stress_delta_bps};
      const manifest_json=JSON.stringify(manifest);pathDependency={manifest_json,manifest_sha256:hash(manifest_json)};
      Object.assign(task,{path_dependency_digest:accessDigest(pathDependency)});
    }
    const [captured]=captureManagerScoreOriginalInputs([{slot:"RAW",task,...(dep?{metrics_dependency:dep}:{}),
      ...(pathDependency?{path_dependency:pathDependency}:{})}],limits.maximum_input_bytes);
    const result=await runtime.calculate({...captured.task,policy:null}),{preview:_preview,...quality}=result.quality;
    scores.push({slot:"RAW" as const,quality,raw_metrics:result.raw_metrics,provenance:result.provenance});
    items.push(captured);
  }
  const doc:ManagerModelDocument={schema_version:"portal.execution.manager-model-input.v1",...fixtureScope,qualification:"SOURCE_VERIFIED",
    family_id:"alpha_fleet_overview",revision:base.source_revision,supersedes_revision:null,source_epoch:"SYNTHETIC:epoch",source_sequence:"1",
    projection_generation:"SYNTHETIC:g1",catalogue_digest:catalogue,source_set_digest:base.source_set_digest,as_of_ms:asOf,
    recorded_through_ms:asOf,facts_through_ms:asOf,observed_at_ms:Date.now(),source_quality:{completeness:"COMPLETE",freshness:"FRESH",reasons:[]},
    members:readBinding?.members??[],facts:[],precomputed_scores:scores};
  const artifact={schema_version:"portal.execution.publication-commissioning.v1",scope:fixtureScope,catalogue_digest:catalogue,
    adapter_id:"SYNTHETIC_NOT_SOURCE_AUTHORITY",family_ids:[doc.family_id],purposes:["BUSINESS"],
    receipt_pins:{source_read:"SYNTHETIC:read",transport_trust:"SYNTHETIC:transport",privacy:"SYNTHETIC:privacy",field_policy:"SYNTHETIC:fields"}};
  const bytes=JSON.stringify(artifact),commissioning=loadPublicationCommissioning(bytes,{artifact_sha256:hash(bytes),adapter_id:artifact.adapter_id,
    approval_ref:"SYNTHETIC_NOT_OWNER_APPROVAL",approved_at_ms:asOf-1000,valid_until_ms:Date.now()+120_000},Date.now());
  const publication=JSON.parse(readFileSync(resolve(contracts,"fixtures/execution-dataset-publication.synthetic.valid.json"),"utf8")).value as DatasetPublication;
  Object.assign(publication,{environment:fixtureScope.environment,profile_id:fixtureScope.profile_id,family_id:doc.family_id,catalogue_digest:catalogue,
    history_capability:"CURRENT_ONLY",barrier:null,issued_at_ms:asOf-1000,expires_at_ms:Date.now()+120_000,
    source_as_of_ms:asOf,observed_at_ms:doc.observed_at_ms});
  for(const key of ["source_read","transport_trust","privacy","field_policy"] as const)
    publication[key]={qualification:"SOURCE_VERIFIED",receipt_ref:artifact.receipt_pins[key]};
  const tuples=readBinding?.members.map(m=>m.tuple)??[];
  const resources=[...new Map(tuples.flatMap(t=>([{kind:"ALPHA" as const,id:t.alpha_id},{kind:"ALPHA_VERSION" as const,id:t.alpha_version_id},
    {kind:"PORTFOLIO" as const,id:t.portfolio_id},{kind:"DEPLOYMENT" as const,id:t.deployment_id},{kind:"ACCOUNT" as const,id:t.account_id}]))
    .map(r=>[JSON.stringify(r),r])).values()];
  publication.authority={...publication.authority,...fixtureScope,qualification:"SOURCE_VERIFIED",tuples,resources,
    binding:{dataset_id:doc.family_id,source_revision:doc.revision,projection_generation:doc.projection_generation,catalogue_revision:catalogue,window:null}};
  return {doc,items,loaded,runtime,publication,commissioning};
}
type Fixture=Awaited<ReturnType<typeof fixture>>;
describe.skipIf(!process.env.TEST_DATABASE_URL)("R06 explicit historical restatement coordinator — actual PG / SYNTHETIC authority",()=>{
  const name="elp206_restated_"+randomUUID().replaceAll("-","");
  const url=(database:string)=>{const u=new URL(process.env.TEST_DATABASE_URL!);u.pathname="/"+database;return u.toString();};
  const options={max:2,connectionTimeoutMillis:2000,query_timeout:4000};let pool:Pool;
  beforeAll(async()=>{
    if(!/^elp206_restated_[a-f0-9]{32}$/.test(name))throw new Error("SYNTHETIC_DB_NAME");
    const admin=new Pool({...options,max:1,connectionString:url("postgres")});
    try{await admin.query("CREATE DATABASE "+name);}finally{await admin.end();}
    pool=new Pool({...options,connectionString:url(name)});
    for(const file of ["1723680000135_execution-manager-models.sql","1723680000137_execution-manager-consumer-fence.sql",
      "1723680000138_execution-manager-calculation-revisions.sql","1723680000139_execution-manager-score-mode-heads.sql"])
      await pool.query(readFileSync(resolve(migrations,file),"utf8").split("-- Down Migration")[0]);
  },60_000);
  beforeEach(async()=>{vi.restoreAllMocks();await pool.query("TRUNCATE execution_manager_score_mode_heads,execution_manager_calculation_heads,execution_manager_calculation_revisions,execution_manager_model_heads,execution_manager_model_revisions,execution_manager_consumer_fences");});
  afterAll(async()=>{vi.restoreAllMocks();await pool?.end();
    if(!/^elp206_restated_[a-f0-9]{32}$/.test(name))throw new Error("SYNTHETIC_DB_NAME");
    const admin=new Pool({...options,max:1,connectionString:url("postgres")});
    try{await admin.query("DROP DATABASE IF EXISTS "+name+" WITH (FORCE)");}finally{await admin.end();}
  },60_000);
  async function seed(f:Fixture){
    const d=f.doc,p=[d.workspace_id,d.environment,d.profile_id],client=await pool.connect();
    const custody=new ManagerScoreOriginalCustody(config),prepared=custody.prepare(d,f.items);
    try{await client.query("BEGIN");await client.query("SET LOCAL statement_timeout='3000ms'");await client.query("SET LOCAL lock_timeout='1000ms'");
      await client.query("INSERT INTO execution_manager_model_revisions (workspace_id,environment,profile_id,revision,source_epoch,source_sequence,projection_generation,payload_digest,payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)",
        [...p,d.revision,d.source_epoch,d.source_sequence,d.projection_generation,accessDigest(d),JSON.stringify(d)]);
      await client.query("INSERT INTO execution_manager_model_heads (workspace_id,environment,profile_id,revision,source_epoch,source_sequence,projection_generation,payload_digest,catalogue_digest) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [...p,d.revision,d.source_epoch,d.source_sequence,d.projection_generation,accessDigest(d),d.catalogue_digest]);
      await custody.persist(client,prepared);await client.query("COMMIT");
    }catch(error){await client.query("ROLLBACK").catch(()=>undefined);throw error;}finally{client.release();}
    return prepared.calculation_key;
  }
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
  async function setup(f?:Fixture,extra:Partial<typeof config>={},selectedPool?:Pool){
    const data=f??await fixture();await seed(data);
    const state:{handle:ApprovedManagerScorePolicy|null;recheck:()=>Promise<{assertCurrent:()=>void}>}={
      handle:data.loaded.handle,recheck:async()=>({assertCurrent:()=>undefined})};
    const source:ManagerProjectionSource={read:vi.fn(async()=>null),acknowledge:vi.fn(async()=>undefined),
      recheck:vi.fn(async()=>state.recheck())};
    const coordinator=new ManagerScoreRestatement({pool:selectedPool??pool,runtime:data.runtime,currentPolicy:()=>state.handle,
      source,commissioning:data.commissioning,publication:async()=>data.publication,config:{...config,...extra}});
    const lease=await new ManagerProjectionLeases(pool).acquire({workspace_id:data.doc.workspace_id,
      environment:data.doc.environment,profile_id:data.doc.profile_id},randomUUID(),10_000);
    if(!lease)throw new Error("SYNTHETIC_LEASE_REQUIRED");
    const idle=()=>coordinator.idle({lease,signal:new AbortController().signal,deadline_ms:performance.now()+5000,
      transaction_timeout_ms:2000,lease_ttl_ms:4000});
    return {data,state,source,coordinator,idle};
  }
  const count=async()=>(await pool.query("SELECT count(*)::text AS n FROM execution_manager_calculation_revisions")).rows[0].n;
  const restatedHead=async()=>(await pool.query("SELECT calculation_key FROM execution_manager_score_mode_heads WHERE head_kind='RESTATED_CURRENT_POLICY'")).rows[0]?.calculation_key??null;
  async function originalSnapshot(d:ManagerModelDocument){
    const client=await pool.connect();
    try{return await new ManagerScoreOriginalCustody(config).restore(client,d);}finally{client.release();}
  }
  async function namedReadSetup(kind:"METRICS"|"PATH"="METRICS",pathProof=false,
    pathFault?:(task:Omit<ManagerScoreRuntimeTask,"policy">)=>void){
    // Genuine current scope minting from existing fixture. All Core/source/
    // approval providers remain explicitly synthetic; Execution storage is PG.
    const f=productReadFixture({fields:[...BUSINESS_READ_FIELDS]}),current=Date.now();
    f.context.now_ms=current;
    for(const grant of f.context.grants){
      grant.valid_from_ms=current-1000;grant.valid_until_ms=current+120_000;
      if(grant.ts_receipt){grant.ts_receipt.effective_at_ms=current-1000;grant.ts_receipt.expires_at_ms=current+120_000;}
    }
    f.principal.session.authenticationTime=new Date(current-1000);
    f.principal.session.idleExpiresAt=new Date(current+120_000);f.principal.session.absoluteExpiresAt=new Date(current+120_000);
    const partition={economic_domain:"PAPER" as const,currency:"USDT",basis:"SYNTHETIC:basis",
      native_profile_ref:"SYNTHETIC:native",domain_proof_ref:"SYNTHETIC:domain"};
    const members:ManagerMember[]=[OWN,PEER,PRIVATE].map(tuple=>({tuple,stage:"PAPER",name:tuple.alpha_id,
      owner_user_id:null,lifecycle:null,venue:null,health:null,source_state:null,binding_ref:null,
      assignment_revision:"SYNTHETIC:a",owner_revision:"SYNTHETIC:o",binding_revision:"SYNTHETIC:b",
      valid_from_ms:current-60_000,valid_to_ms:null}));
    const boundScope={workspace_id:f.principal.workspaceId,environment:"paper" as const,profile_id:f.config.EXECUTION_EDGE_PAPER_PROFILE_ID};
    const h=await setup(await fixture(kind,true,false,{scope:boundScope,members,subject_id:OWN.alpha_id,partition},pathProof,pathFault));
    const manager=new ExecutionManagerRuntime(pool,{trust:unqualifiedAccessTrust,cadence_ms:1000,maximum_publication_reads:1,
      partitions:[{scope:boundScope,commissioning:h.data.commissioning,source:h.source,publication:async()=>h.data.publication,
        bounds:{maximum_documents_per_tick:1,maximum_document_bytes:262_144,maximum_document_rows:20,
          maximum_tick_ms:5000,source_timeout_ms:1000,transaction_timeout_ms:2000,lease_ttl_ms:4000},
        score:{runtime:h.data.runtime,maximum_tasks_per_revision:1,currentPolicy:()=>h.state.handle,
          restatement:config,tasks:async()=>[]}}]});
    // Constructor bridge only: no lifecycle start, source loop or timer. Reads
    // restore persisted coordinator records and cannot calculate or ACK.
    const service=new ManagerScoreRevisionService(pool,f.scopes,f.config,manager);
    const coordinator=manager.restatementFor(boundScope);if(!coordinator)throw new Error("SYNTHETIC_BRIDGE_REQUIRED");
    const q={environment:"paper",surface:"ALPHA",id:OWN.alpha_id,economic_partition:partition,stage_filter:["PAPER"],
      source_selector:"CURRENT_HEAD",revision_mode:"ORIGINAL_AS_PUBLISHED"};
    return {f,h,manager,coordinator,service,q};
  }
  it("actual PG custody/coordinator feeds named ORIGINAL then AVAILABLE RESTATED without changing source/ACK or calculating in GET",async()=>{
    const r=await namedReadSetup(),d=r.h.data.doc;
    try{
      const rowsBefore=(await pool.query("SELECT payload::text,payload_digest,source_sequence::text FROM execution_manager_model_revisions")).rows;
      const calculate=vi.spyOn(r.h.data.runtime,"calculate"),restatedCalculate=vi.spyOn(r.h.data.runtime,"calculateRestated");
      const original=await r.service.read(r.f.principal,r.q);
      expect(original).toMatchObject({revision_mode:"ORIGINAL_AS_PUBLISHED",operational_current:false,
        knowledge_cutoff_ms:null,knowledge_cutoff_reason:"ORIGINAL_KNOWLEDGE_CUTOFF_NOT_RECORDED",availability:"NOT_PUBLISHED"});
      expect(original.score_details).toHaveLength(1);
      expect(original.score_details[0]).toMatchObject({binding:{subject_id:OWN.alpha_id},
        score:{quality:{status:"policy_pending",value:null}},feed_freshness:{availability:"NOT_PUBLISHED",reason_code:"ORIGINAL_FEED_FRESHNESS_NOT_RECORDED"}});
      expect(calculate).not.toHaveBeenCalled();expect(restatedCalculate).not.toHaveBeenCalled();
      await r.h.idle();
      expect(restatedCalculate).toHaveBeenCalledTimes(1);calculate.mockClear();restatedCalculate.mockClear();
      const persisted=await r.coordinator.snapshot(d),historical=persisted.view!.entries[0].historical!;
      const rows=await count();
      const view=await r.service.read(r.f.principal,{...r.q,revision_mode:"RESTATED_CURRENT_POLICY"});
      expect(view).toMatchObject({revision_mode:"RESTATED_CURRENT_POLICY",purpose:"HISTORICAL_ANALYSIS_ONLY",operational_current:false,
        availability:"AVAILABLE",eligibility:{policy_current:true,policy_state:"CURRENT",usable_as_current_operational_score:false},
        source:{source_revision:d.revision,source_as_of_ms:d.as_of_ms,recorded_through_ms:d.recorded_through_ms}});
      expect(view.knowledge_cutoff_ms).toBe(persisted.view!.knowledge_cutoff_ms);
      expect(view.knowledge_cutoff_ms!).toBeGreaterThan(d.as_of_ms);
      expect(view.computed_at_ms).toBe(persisted.view!.computed_at_ms);
      expect(view.computed_at_ms!).toBeGreaterThanOrEqual(view.knowledge_cutoff_ms!);
      expect(view.score_details).toHaveLength(1);
      expect(view.score_details[0]).toMatchObject({binding:{subject_id:OWN.alpha_id},availability:"AVAILABLE",
        score:{quality:{value:historical.result.quality.value}},feed_freshness:{availability:"AVAILABLE",...historical.feed_freshness}});
      expect(historical.feed_freshness).toMatchObject({status:"HISTORICAL_OUTSIDE_CURRENT_FEED_FRESHNESS",maximum_input_age_ms:100});
      expect(historical.feed_freshness.source_age_ms).toBe(historical.checked_at_ms-d.as_of_ms);
      const serialized=JSON.stringify(view);
      for(const key of ["source_set_digest","payload_digest","calculation_key","original_custody_key","retained_tasks","input_json","approval_ref"])
        expect(serialized).not.toContain('"'+key+'"');
      expect(serialized).not.toContain(d.source_set_digest);expect(serialized).not.toContain(accessDigest(d));
      expect(serialized).not.toContain(persisted.key!);expect(serialized).not.toContain(d.precomputed_scores![0].provenance.input_digest);
      const history=await r.service.history(r.f.principal,{...r.q,revision_mode:"RESTATED_CURRENT_POLICY",limit:1});
      expect(history).toMatchObject({availability:"AVAILABLE",page:{returned_count:1,authorized_total_count:1},
        items:[{revision_ref:view.revision_ref,supersedes_revision_ref:original.revision_ref}]});
      await expect(r.service.read(r.f.principal,{...r.q,id:PEER.alpha_id})).rejects.toMatchObject({status:404,code:"EXECUTION_READ_NOT_AVAILABLE"});
      expect((await pool.query("SELECT payload::text,payload_digest,source_sequence::text FROM execution_manager_model_revisions")).rows).toEqual(rowsBefore);
      expect(await count()).toBe(rows);expect(calculate).not.toHaveBeenCalled();expect(restatedCalculate).not.toHaveBeenCalled();
      expect(r.h.source.read).not.toHaveBeenCalled();expect(r.h.source.acknowledge).not.toHaveBeenCalled();
      expect(r.manager.status().automatic_loop).toBe(false);
    }finally{await r.manager.beforeApplicationShutdown();}
  });
  it("actual PG named retained-source RESTATED remains readable after a different economic head without source substitution",async()=>{
    const r=await namedReadSetup(),d=r.h.data.doc;
    try{
      await r.h.idle();const prior=await r.coordinator.snapshot(d);
      const next:ManagerModelDocument={...structuredClone(d),revision:"SYNTHETIC:source-r2",supersedes_revision:d.revision,
        source_sequence:"2",precomputed_scores:[]};
      const p=[d.workspace_id,d.environment,d.profile_id];
      await pool.query("INSERT INTO execution_manager_model_revisions (workspace_id,environment,profile_id,revision,source_epoch,source_sequence,projection_generation,payload_digest,payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)",
        [...p,next.revision,next.source_epoch,next.source_sequence,next.projection_generation,accessDigest(next),JSON.stringify(next)]);
      await pool.query("UPDATE execution_manager_model_heads SET revision=$4,source_sequence=$5,payload_digest=$6 WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3",
        [...p,next.revision,next.source_sequence,accessDigest(next)]);
      const calculate=vi.spyOn(r.h.data.runtime,"calculateRestated");
      const view=await r.service.read(r.f.principal,{...r.q,source_selector:"RETAINED_REVISION",source_revision:d.revision,revision_mode:"RESTATED_CURRENT_POLICY"});
      expect(view).toMatchObject({availability:"AVAILABLE",source:{source_revision:d.revision,source_as_of_ms:d.as_of_ms},
        knowledge_cutoff_ms:prior.view!.knowledge_cutoff_ms,eligibility:{economic_source:"RETAINED_EXACT_REVISION",policy_current:true}});
      for(const [request] of r.f.access.readPublication.mock.calls)expect(request.binding.source_revision).toBe(d.revision);
      expect((await pool.query("SELECT revision FROM execution_manager_model_heads")).rows[0].revision).toBe(next.revision);
      expect((await pool.query("SELECT payload_digest FROM execution_manager_model_revisions WHERE revision=$1",[d.revision])).rows[0].payload_digest).toBe(accessDigest(d));
      expect(calculate).not.toHaveBeenCalled();expect(r.h.source.acknowledge).not.toHaveBeenCalled();
    }finally{await r.manager.beforeApplicationShutdown();}
  });
  it("actual named historical BFF labels policy removal during final authority I/O without erasing an immutable numeric fact",async()=>{
    const r=await namedReadSetup();
    try{
      await r.h.idle();
      const store=Reflect.get(r.service,"historyStore") as ManagerScoreHistoryStore;
      const unchanged=store.unchanged.bind(store),provider=r.f.access.readPublication.getMockImplementation()!;
      let armed=false,witness=false;
      vi.spyOn(store,"unchanged").mockImplementation(async(document,snapshot,timeout)=>{
        const result=await unchanged(document,snapshot,timeout);armed=true;return result;});
      r.f.access.readPublication.mockImplementation(async request=>{
        const publication=await provider(request);
        // Armed only by the actual retained-inventory recheck inside this BFF's
        // callback: the next provider I/O is scopes.deliver's final mint.
        if(armed){witness=true;r.h.state.handle=null;}
        return publication;
      });
      const calculate=vi.spyOn(r.h.data.runtime,"calculateRestated"),before=await count();
      const view=await r.service.read(r.f.principal,{...r.q,revision_mode:"RESTATED_CURRENT_POLICY"});
      expect(view).toMatchObject({availability:"AVAILABLE",operational_current:false,eligibility:{
        policy_current:false,policy_state:"UNKNOWN",reason_code:"POLICY_STATE_NOT_CLASSIFIED",
        usable_as_current_operational_score:false}});
      expect(view.score_details[0].score?.quality.value).not.toBeNull();
      expect(witness).toBe(true);expect(await count()).toBe(before);
      expect(calculate).not.toHaveBeenCalled();expect(r.h.source.acknowledge).not.toHaveBeenCalled();
    }finally{await r.manager.beforeApplicationShutdown();}
  });
  it("actual PG older public ref resolves after another policy and remains readable without a runtime coordinator",async()=>{
    const r=await namedReadSetup(),d=r.h.data.doc;
    try{
      await r.h.idle();const first=await r.service.read(r.f.principal,{...r.q,revision_mode:"RESTATED_CURRENT_POLICY"});
      r.h.state.handle=policy(d.as_of_ms,"C","5","SYNTHETIC:grid","0.2",{workspace_id:d.workspace_id,
        environment:d.environment,profile_id:d.profile_id,catalogue_digest:d.catalogue_digest}).handle;
      await r.h.idle();
      const worker=vi.spyOn(r.h.data.runtime,"calculateRestated"),before=await count();
      const archive=new ManagerScoreRevisionService(pool,r.f.scopes,r.f.config);
      const history=await archive.history(r.f.principal,{...r.q,revision_mode:"RESTATED_CURRENT_POLICY",limit:1});
      expect(history).toMatchObject({availability:"AVAILABLE",page:{returned_count:1,authorized_total_count:2}});
      expect(history.items[0].revision_ref).not.toBe(first.revision_ref);
      expect(history.items[0].supersedes_revision_ref).toBe(first.revision_ref);
      const selected=await archive.read(r.f.principal,{...r.q,revision_mode:"RESTATED_CURRENT_POLICY",revision_ref:first.revision_ref});
      expect(selected).toMatchObject({revision_ref:first.revision_ref,computed_at_ms:first.computed_at_ms,
        eligibility:{policy_state:"UNKNOWN",usable_as_current_operational_score:false}});
      const classified=await r.service.read(r.f.principal,{...r.q,revision_mode:"RESTATED_CURRENT_POLICY",revision_ref:first.revision_ref});
      expect(classified.eligibility.policy_state).toBe("NOT_CURRENT");
      expect(await count()).toBe(before);expect(worker).not.toHaveBeenCalled();
      expect(r.h.source.acknowledge).not.toHaveBeenCalled();
    }finally{await r.manager.beforeApplicationShutdown();}
  });
  it("actual PG PATH v2 runs original→later worker→named revision/history, preserving original bytes and archive reads without a coordinator",async()=>{
    const r=await namedReadSetup("PATH",true),d=r.h.data.doc;
    try{
      const sourceBefore=(await pool.query("SELECT payload::text,payload_digest,source_sequence::text FROM execution_manager_model_revisions")).rows;
      const originalBefore=(await pool.query("SELECT calculation_key,payload::text,payload_digest FROM execution_manager_calculation_revisions")).rows;
      const original=await originalSnapshot(d);
      expect(original?.schema_version).toBe("portal.execution.manager-score-original-inputs.v2");
      expect(original?.retained_tasks[0].method_custody).toMatchObject({state:"BOUND_PATH_DEPENDENCY",reason:null});
      const pending=await r.service.read(r.f.principal,r.q);
      expect(pending.score_details[0].score?.quality).toMatchObject({status:"policy_pending",value:null});
      const worker=vi.spyOn(r.h.data.runtime,"calculateRestated");
      await r.h.idle();expect(worker).toHaveBeenCalledTimes(1);worker.mockClear();
      const snapshot=await r.coordinator.snapshot(d),historical=snapshot.view!.entries[0].historical!;
      expect(snapshot.view!.entries[0].availability).toBe("AVAILABLE");
      expect(historical.result.path_summary).toMatchObject({sample_count:4,complete_block_count:2});
      expect(historical.result.raw_metrics?.stress_excess_twr).not.toBeNull();
      const view=await r.service.read(r.f.principal,{...r.q,revision_mode:"RESTATED_CURRENT_POLICY"});
      expect(view).toMatchObject({availability:"AVAILABLE",purpose:"HISTORICAL_ANALYSIS_ONLY",operational_current:false,
        eligibility:{policy_state:"CURRENT",usable_as_current_operational_score:false},
        knowledge_cutoff_ms:snapshot.view!.knowledge_cutoff_ms,computed_at_ms:snapshot.view!.computed_at_ms});
      expect(view.score_details[0].score?.quality.value).toBe(historical.result.quality.value);
      expect(historical.knowledge_cutoff_ms).toBeGreaterThan(historical.economic_as_of_ms);
      const history=await r.service.history(r.f.principal,{...r.q,revision_mode:"RESTATED_CURRENT_POLICY",limit:1});
      expect(history).toMatchObject({availability:"AVAILABLE",page:{returned_count:1,authorized_total_count:1},
        items:[{revision_ref:view.revision_ref,supersedes_revision_ref:pending.revision_ref}]});
      const archive=new ManagerScoreRevisionService(pool,r.f.scopes,r.f.config);
      const archived=await archive.read(r.f.principal,{...r.q,revision_mode:"RESTATED_CURRENT_POLICY",revision_ref:view.revision_ref});
      expect(archived).toMatchObject({availability:"AVAILABLE",revision_ref:view.revision_ref,eligibility:{policy_state:"UNKNOWN"}});
      expect((await archive.history(r.f.principal,{...r.q,revision_mode:"ORIGINAL_AS_PUBLISHED",limit:1})).page.authorized_total_count).toBe(1);
      const publicBytes=JSON.stringify([view,history,archived]);
      for(const key of ["path_dependency","manifest_json","method_manifest_ref","retained_tasks","input_json","calculation_key"])
        expect(publicBytes).not.toContain('"'+key+'"');
      expect((await pool.query("SELECT payload::text,payload_digest,source_sequence::text FROM execution_manager_model_revisions")).rows).toEqual(sourceBefore);
      expect((await pool.query("SELECT calculation_key,payload::text,payload_digest FROM execution_manager_calculation_revisions WHERE calculation_key=$1",
        [originalBefore[0].calculation_key])).rows).toEqual(originalBefore);
      expect(worker).not.toHaveBeenCalled();expect(r.h.source.read).not.toHaveBeenCalled();expect(r.h.source.acknowledge).not.toHaveBeenCalled();
      expect((await pool.query("SELECT count(*)::text AS n FROM execution_manager_calculation_heads")).rows[0].n).toBe("0");
    }finally{await r.manager.beforeApplicationShutdown();}
  });
  it("PATH v2 later delta/anchors append revisions, restart keeps exact K and rejects incompatible method rather than recasting Original",async()=>{
    const h=await setup(await fixture("PATH",true,false,undefined,true)),worker=vi.spyOn(h.data.runtime,"calculateRestated");
    await h.idle();const first=await h.coordinator.snapshot(h.data.doc),original=await originalSnapshot(h.data.doc);
    h.state.handle=policy(h.data.doc.as_of_ms,"C","10","SYNTHETIC:grid","0.2").handle;
    await h.idle();const second=await h.coordinator.snapshot(h.data.doc);
    expect(second.view!.supersedes_calculation_key).toBe(first.key);
    expect(second.view!.entries[0].availability).toBe("AVAILABLE");
    expect(Number(second.view!.entries[0].historical!.result.raw_metrics!.stress_excess_twr)).toBeLessThan(
      Number(first.view!.entries[0].historical!.result.raw_metrics!.stress_excess_twr));
    expect(second.view!.entries[0].historical!.result.raw_metrics!.net_excess_twr).toBe(first.view!.entries[0].historical!.result.raw_metrics!.net_excess_twr);
    expect(await originalSnapshot(h.data.doc)).toEqual(original);
    const restarted=new ManagerScoreRestatement({pool,runtime:h.data.runtime,currentPolicy:()=>h.state.handle,source:h.source,
      commissioning:h.data.commissioning,publication:async()=>h.data.publication,config});
    const lease=(await pool.query("SELECT workspace_id,environment,profile_id,holder_id::text,fencing_token::text,lease_epoch::text FROM execution_manager_consumer_fences")).rows[0];
    await restarted.idle({lease,signal:new AbortController().signal,deadline_ms:performance.now()+5000,transaction_timeout_ms:2000,lease_ttl_ms:4000});
    expect(await restarted.snapshot(h.data.doc)).toEqual(second);expect(worker).toHaveBeenCalledTimes(2);
    expect(await restarted.restoreRetained(h.data.doc,first.key!)).toEqual(first.view);
    h.state.handle=policy(h.data.doc.as_of_ms,"D","10","SYNTHETIC:different-grid").handle;
    await h.idle();expect((await h.coordinator.snapshot(h.data.doc)).view!.entries[0]).toMatchObject({
      availability:"NOT_PUBLISHED",reason_codes:["INPUT_METHOD_NOT_RETAINED_FOR_POLICY"],historical:null});
    expect(worker).toHaveBeenCalledTimes(2);expect(h.source.acknowledge).not.toHaveBeenCalled();
  });
  const pathFaults:[string,(task:Omit<ManagerScoreRuntimeTask,"policy">)=>void,string][]=[
    ["empty-grid",t=>{if(t.input.kind==="PATH")t.input.path.observations=[];},"partial_components"],
    ["grid-gap",t=>{if(t.input.kind==="PATH")t.input.path.observations[0].to_ms-=1;},"partial_components"],
    ["missing-costs",t=>{t.input.quality.required_costs_complete=false;if(t.input.kind==="PATH")t.input.path.required_costs_complete=false;},"partial_costs"],
    ["missing-turnover",t=>{if(t.input.kind==="PATH")t.input.path.observations[0].stress_subperiods![0].gross_executed_notional=null;},"partial_components"],
    ["invalid-block",t=>{if(t.input.kind==="PATH")t.input.path.blocks[0].expected_observations=3;},"partial_components"],
    ["intrinsic-stale",t=>{t.input.quality.stale=true;},"stale"],
    ["invalid-data",t=>{t.input.quality.data_valid=false;},"invalid_data"],
  ];
  it.each(pathFaults)("actual PATH %s retains genuine worker PARTIAL/invalid shape across PG restart and public history",async(_name,fault,status)=>{
    const r=await namedReadSetup("PATH",true,fault);
    try{
      await r.h.idle();const persisted=await r.coordinator.snapshot(r.h.data.doc),entry=persisted.view!.entries[0];
      expect(entry.availability).toBe("PARTIAL");expect(entry.historical!.result.quality).toMatchObject({status,value:null});
      expect(entry.historical!.result.raw_metrics).not.toBeNull();expect(entry.historical!.result.path_summary).not.toBeNull();
      expect(await r.coordinator.restoreRetained(r.h.data.doc,persisted.key!)).toEqual(persisted.view);
      const worker=vi.spyOn(r.h.data.runtime,"calculateRestated"),archive=new ManagerScoreRevisionService(pool,r.f.scopes,r.f.config);
      const view=await archive.read(r.f.principal,{...r.q,revision_mode:"RESTATED_CURRENT_POLICY"});
      expect(view.score_details[0].score?.quality).toMatchObject({status,value:null});
      expect((await archive.history(r.f.principal,{...r.q,revision_mode:"RESTATED_CURRENT_POLICY",limit:1})).items).toHaveLength(1);
      expect(worker).not.toHaveBeenCalled();expect(r.h.source.acknowledge).not.toHaveBeenCalled();
    }finally{await r.manager.beforeApplicationShutdown();}
  });
  it.each(["sample-count","block-count","tail-duration","foreign-reason"])("rejects rehashed stored PATH %s mismatch without recomputing",async fault=>{
    const h=await setup(await fixture("PATH",true,false,undefined,true));await h.idle();const key=await restatedHead();
    const row=(await pool.query("SELECT payload FROM execution_manager_calculation_revisions WHERE calculation_key=$1",[key])).rows[0];
    const summary=row.payload.entries[0].historical.result.path_summary;
    if(fault==="sample-count")summary.sample_count++;
    if(fault==="block-count")summary.complete_block_count=100;
    if(fault==="tail-duration")summary.incomplete_tail_duration_ms=401;
    if(fault==="foreign-reason")summary.reason_codes=["SYNTHETIC:not-from-worker"];
    await pool.query("UPDATE execution_manager_calculation_revisions SET payload=$1::jsonb,payload_digest=$2 WHERE calculation_key=$3",[JSON.stringify(row.payload),accessDigest(row.payload),key]);
    const worker=vi.spyOn(h.data.runtime,"calculateRestated");
    await expect(h.coordinator.snapshot(h.data.doc)).rejects.toThrow("MANAGER_RESTATED_RESULT_MISMATCH");
    expect(worker).not.toHaveBeenCalled();
  });
  it("PATH grant revoke during final delivery refuses read without changing immutable historical result",async()=>{
    const r=await namedReadSetup("PATH",true);
    try{
      await r.h.idle();
      const retainedBefore=(await pool.query("SELECT calculation_key,payload::text,payload_digest FROM execution_manager_calculation_revisions ORDER BY calculation_key")).rows;
      const worker=vi.spyOn(r.h.data.runtime,"calculateRestated");
      const store=Reflect.get(r.service,"historyStore") as ManagerScoreHistoryStore,unchanged=store.unchanged.bind(store);
      const provider=r.f.access.readPublication.getMockImplementation()!;let armed=false;
      vi.spyOn(store,"unchanged").mockImplementation(async(...args)=>{const valid=await unchanged(...args);armed=true;return valid;});
      r.f.access.readPublication.mockImplementation(async request=>{const publication=await provider(request);
        if(armed)r.f.context.grants=[];return publication;});
      // Existing fingerprint-change contract is409 for a mid-flight revoke;
      // the next fresh authorization cannot read the now-ungranted resource.
      await expect(r.service.read(r.f.principal,{...r.q,revision_mode:"RESTATED_CURRENT_POLICY"})).rejects.toMatchObject({status:409,code:"EXECUTION_READ_ACCESS_CHANGED"});
      expect(armed).toBe(true);
      await expect(r.service.read(r.f.principal,{...r.q,revision_mode:"RESTATED_CURRENT_POLICY"})).rejects.toMatchObject({status:404,code:"EXECUTION_READ_NOT_AVAILABLE"});
      expect((await pool.query("SELECT calculation_key,payload::text,payload_digest FROM execution_manager_calculation_revisions ORDER BY calculation_key")).rows).toEqual(retainedBefore);
      expect(worker).not.toHaveBeenCalled();expect(r.h.source.acknowledge).not.toHaveBeenCalled();
    }finally{await r.manager.beforeApplicationShutdown();}
  });
  it("PATH policy revoke after actual INSERT rolls back derived head, retaining v2 Original and immutable source",async()=>{
    let state:Awaited<ReturnType<typeof setup>>["state"]|undefined;
    const p=transactionPool(async sql=>{if(sql.startsWith("INSERT INTO execution_manager_calculation_revisions")&&state)state.handle=null;});
    const h=await setup(await fixture("PATH",true,false,undefined,true),{},p);state=h.state;
    await expect(h.idle()).rejects.toThrow("MANAGER_RESTATED_POLICY_CHANGED");
    expect(await count()).toBe("1");expect(await restatedHead()).toBeNull();
    expect((await originalSnapshot(h.data.doc))?.schema_version).toBe("portal.execution.manager-score-original-inputs.v2");
    expect(h.source.acknowledge).not.toHaveBeenCalled();
  });
  it("retains pending original then computes only explicit later-policy historical view without source/ACK/legacy mutation",async()=>{
    const h=await setup(),before=(await pool.query("SELECT payload::text,payload_digest,source_sequence::text FROM execution_manager_model_revisions")).rows;
    const originalHead=(await pool.query("SELECT calculation_key FROM execution_manager_score_mode_heads WHERE head_kind='ORIGINAL_INPUTS'")).rows;
    const calculate=vi.spyOn(h.data.runtime,"calculateRestated");await h.idle();
    const result=await h.coordinator.snapshot(h.data.doc),entry=result.view!.entries[0];
    expect(h.data.doc.precomputed_scores?.[0].quality).toMatchObject({value:null,status:"policy_pending"});
    expect(result.view).toMatchObject({revision_mode:"RESTATED_CURRENT_POLICY",purpose:"HISTORICAL_ANALYSIS_ONLY",operational_current:false});
    expect(result.view!.knowledge_cutoff_ms).toBeGreaterThan(h.data.doc.as_of_ms);
    expect(entry).toMatchObject({availability:"AVAILABLE",historical:{economic_as_of_ms:h.data.doc.as_of_ms,operational_current:false}});
    expect(managerScorePublicationPolicyCurrent(h.state.handle,entry.historical!.result,Date.now())).toBe(false);
    expect((await pool.query("SELECT payload::text,payload_digest,source_sequence::text FROM execution_manager_model_revisions")).rows).toEqual(before);
    expect((await pool.query("SELECT calculation_key FROM execution_manager_score_mode_heads WHERE head_kind='ORIGINAL_INPUTS'")).rows).toEqual(originalHead);
    expect((await pool.query("SELECT count(*)::text AS n FROM execution_manager_calculation_heads")).rows[0].n).toBe("0");
    expect(h.source.read).not.toHaveBeenCalled();expect(h.source.acknowledge).not.toHaveBeenCalled();expect(calculate).toHaveBeenCalledTimes(1);
  });
  it("reuses persisted semantic key/K/result after retry and restart, before another worker call",async()=>{
    const h=await setup(),spy=vi.spyOn(h.data.runtime,"calculateRestated");await h.idle();const first=await h.coordinator.snapshot(h.data.doc);
    await h.idle();
    const restarted=new ManagerScoreRestatement({pool,runtime:h.data.runtime,currentPolicy:()=>h.state.handle,source:h.source,
      commissioning:h.data.commissioning,publication:async()=>h.data.publication,config});
    const leaseRow=(await pool.query("SELECT workspace_id,environment,profile_id,holder_id::text,fencing_token::text,lease_epoch::text FROM execution_manager_consumer_fences")).rows[0];
    await restarted.idle({lease:leaseRow,signal:new AbortController().signal,deadline_ms:performance.now()+5000,transaction_timeout_ms:2000,lease_ttl_ms:4000});
    expect(await restarted.snapshot(h.data.doc)).toEqual(first);expect(spy).toHaveBeenCalledTimes(1);expect(await count()).toBe("2");
    expect(await h.coordinator.unchanged(h.data.doc,first.key)).toBe(true);
  });
  it("keeps mixed PATH absence and compatible METRICS in one complete binding set",async()=>{
    const h=await setup(await fixture("METRICS",true,true));await h.idle();const entries=(await h.coordinator.snapshot(h.data.doc)).view!.entries;
    expect(entries).toHaveLength(2);expect(entries.find(e=>e.binding.subject_id==="SYNTHETIC:path-alpha")).toMatchObject({
      availability:"NOT_PUBLISHED",reason_codes:["PATH_METHOD_PROOF_NOT_RETAINED"],historical:null});
    expect(entries.find(e=>e.binding.subject_id==="SYNTHETIC:alpha")?.availability).toBe("AVAILABLE");
  });
  it.each(["missing","changed"] as const)("keeps %s original method proof typed absent, never derives it from current policy",async fault=>{
    const h=await setup(await fixture("METRICS",fault!=="missing")),calculate=vi.spyOn(h.data.runtime,"calculateRestated");
    if(fault==="changed")h.state.handle=policy(h.data.doc.as_of_ms,"C","5","SYNTHETIC:different-method").handle;
    await h.idle();expect((await h.coordinator.snapshot(h.data.doc)).view!.entries[0]).toMatchObject({availability:"NOT_PUBLISHED",historical:null,
      reason_codes:[fault==="missing"?"METRIC_DEPENDENCIES_NOT_RETAINED":"INPUT_METHOD_NOT_RETAINED_FOR_POLICY"]});
    expect(calculate).not.toHaveBeenCalled();
  });
  it("rejects wrong-scope approved policy even when every entry is method-absent and no worker runs",async()=>{
    const h=await setup(await fixture("PATH")),calculate=vi.spyOn(h.data.runtime,"calculateRestated");
    h.state.handle=policy(h.data.doc.as_of_ms,"other","5","SYNTHETIC:grid","0.08",{...scoped,workspace_id:"SYNTHETIC:other-workspace"}).handle;
    await h.idle();expect(h.coordinator.status().state).toBe("RESTATED_POLICY_NOT_ELIGIBLE");
    expect(await restatedHead()).toBe(null);expect(calculate).not.toHaveBeenCalled();
  });
  it("changing only stress delta nulls exactly that scalar and preserves other five original observations",async()=>{
    const h=await setup();h.state.handle=policy(h.data.doc.as_of_ms,"C","10").handle;await h.idle();
    const e=(await h.coordinator.snapshot(h.data.doc)).view!.entries[0];
    expect(e).toMatchObject({availability:"PARTIAL",reason_codes:["STRESS_INPUTS_NOT_RETAINED_FOR_POLICY"]});
    expect(e.historical!.result.raw_metrics).toEqual({net_excess_twr:"0.06",sharpe_period:"0.12",mdd:"0.04",add:"0.01",positive_block_ratio:"0.75",stress_excess_twr:null});
    expect(e.historical!.withheld_metric_reasons).toEqual({stress_excess_twr:["STRESS_INPUTS_NOT_RETAINED_FOR_POLICY"]});
  });
  it("appends new policy revision with supersedes while preserving immutable previous result and original",async()=>{
    const h=await setup();await h.idle();const a=await h.coordinator.snapshot(h.data.doc);
    h.state.handle=policy(h.data.doc.as_of_ms,"C","5","SYNTHETIC:grid","0.2").handle;await h.idle();
    const b=await h.coordinator.snapshot(h.data.doc);expect(b.key).not.toBe(a.key);
    expect(b.view!.supersedes_calculation_key).toBe(a.key);expect(await count()).toBe("3");
    expect((await pool.query("SELECT payload_digest FROM execution_manager_calculation_revisions WHERE calculation_key=$1",[a.key])).rows[0].payload_digest).toBe(accessDigest(a.view));
  });
  it("exact retained lookup remains historical after policy/head changes; it does not claim current or schedule",async()=>{
    const h=await setup();await h.idle();const original=await h.coordinator.snapshot(h.data.doc);
    h.state.handle=policy(h.data.doc.as_of_ms,"C").handle;await h.idle();
    const calculate=vi.spyOn(h.data.runtime,"calculateRestated");
    const retained=await h.coordinator.restoreRetained(h.data.doc,original.key!);
    expect(retained).toEqual(original.view);
    expect(()=>h.coordinator.assertCurrent(retained!)).toThrow("MANAGER_RESTATED_POLICY_CHANGED");
    expect(await h.coordinator.unchanged(h.data.doc,original.key)).toBe(false);
    expect(calculate).not.toHaveBeenCalled();
    expect(await h.coordinator.restoreRetained(h.data.doc,hash("SYNTHETIC:not-found"))).toBe(null);
    await expect(h.coordinator.restoreRetained(h.data.doc,original.key!+"\n")).rejects.toThrow();
  });
  it("snapshot/unchanged perform no worker/source/ACK mutations and detached return cannot alter restart",async()=>{
    const h=await setup();await h.idle();const spy=vi.spyOn(h.data.runtime,"calculateRestated"),before=await count();
    const a=await h.coordinator.snapshot(h.data.doc);a.view!.entries[0].binding.subject_id="SYNTHETIC:tampered-caller";
    expect((await h.coordinator.snapshot(h.data.doc)).view!.entries[0].binding.subject_id).toBe("SYNTHETIC:alpha");
    expect(await h.coordinator.unchanged(h.data.doc,a.key)).toBe(true);expect(await count()).toBe(before);expect(spy).not.toHaveBeenCalled();
  });
  it("policy revocation after actual INSERT rolls back result/head without touching original or source",async()=>{
    let state:Awaited<ReturnType<typeof setup>>["state"]|undefined,witness=false;
    const p=transactionPool(async sql=>{if(sql.startsWith("INSERT INTO execution_manager_calculation_revisions")&&state){witness=true;state.handle=null;}});
    const h=await setup(undefined,{},p);state=h.state;
    await expect(h.idle()).rejects.toThrow("MANAGER_RESTATED_POLICY_CHANGED");
    expect(witness).toBe(true);expect(await count()).toBe("1");expect(await restatedHead()).toBe(null);
  });
  it("deferred actual DB lease expiry after INSERT refuses COMMIT and rolls back result/head",async()=>{
    let armed=false,witness=false;
    const p=transactionPool(async(sql,client)=>{if(armed&&sql.startsWith("INSERT INTO execution_manager_calculation_revisions")){
      armed=false;witness=true;await client.query("UPDATE execution_manager_consumer_fences SET expires_at=clock_timestamp()");
    }});
    const h=await setup(undefined,{},p);armed=true;await expect(h.idle()).rejects.toThrow("MANAGER_LEASE_LOST");
    expect(witness).toBe(true);expect(await count()).toBe("1");expect(await restatedHead()).toBe(null);
  });
  it("source-head change during final source await refuses before derived persistence",async()=>{
    const h=await setup();h.state.recheck=async()=>{
      await pool.query("UPDATE execution_manager_model_heads SET payload_digest=$1",[hash("SYNTHETIC:changed-current-source")]);
      return {assertCurrent:()=>undefined};
    };
    await expect(h.idle()).rejects.toThrow("MANAGER_RESTATED_SOURCE_CHANGED");expect(await count()).toBe("1");expect(await restatedHead()).toBe(null);
  });
  it("shared count cap includes original and legacy rows; refuses append without erasing prior head",async()=>{
    const h=await setup(undefined,{maximum_revisions_per_source:3}),d=h.data.doc;
    await pool.query("INSERT INTO execution_manager_calculation_revisions (workspace_id,environment,profile_id,source_revision,calculation_key,payload_digest,payload) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)",
      [d.workspace_id,d.environment,d.profile_id,d.revision,hash("SYNTHETIC:existing-legacy"),hash("SYNTHETIC:legacy"),JSON.stringify({legacy:"SYNTHETIC"})]);
    await h.idle();const before=await restatedHead();
    h.state.handle=policy(h.data.doc.as_of_ms,"C").handle;
    await expect(h.idle()).rejects.toThrow("MANAGER_DERIVED_RETENTION_CAP_REACHED");
    expect(await count()).toBe("3");expect(await restatedHead()).toBe(before);
  });
  it("measures actual shared JSONB bytes at production capacity SQL, then refuses with prior rows intact",async()=>{
    let measured=false;
    const p=transactionPool(async sql=>{if(sql.includes("octet_length($1::jsonb::text)"))measured=true;});
    const h=await setup(undefined,{maximum_retained_bytes_per_source:config.maximum_bundle_bytes},p),d=h.data.doc;
    const used=Number((await pool.query("SELECT sum(octet_length(payload::text))::text AS bytes FROM execution_manager_calculation_revisions")).rows[0].bytes);
    await pool.query("INSERT INTO execution_manager_calculation_revisions (workspace_id,environment,profile_id,source_revision,calculation_key,payload_digest,payload) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)",
      [d.workspace_id,d.environment,d.profile_id,d.revision,hash("SYNTHETIC:legacy-key"),hash("SYNTHETIC:legacy-payload"),
        JSON.stringify({padding:"x".repeat(config.maximum_bundle_bytes-used-1024)})]);
    measured=false;await expect(h.idle()).rejects.toThrow("MANAGER_DERIVED_RETENTION_CAP_REACHED");
    expect(measured).toBe(true);expect(await count()).toBe("2");expect(await restatedHead()).toBe(null);
  });
  it("provider mutation after return cannot rewrite captured publication or source input",async()=>{
    const h=await setup(),before=accessDigest(h.data.doc);
    h.state.recheck=async()=>{h.data.publication.authority.workspace_id="SYNTHETIC:provider-mutated";return {assertCurrent:()=>undefined};};
    await h.idle();expect(accessDigest(h.data.doc)).toBe(before);
    expect((await h.coordinator.snapshot(h.data.doc)).view?.source.workspace_id).toBe(scope.workspace_id);
  });
  it("rejects substituted METRICS result even after rehashing its mutable derived payload",async()=>{
    const h=await setup();await h.idle();const key=await restatedHead();
    const row=(await pool.query("SELECT payload FROM execution_manager_calculation_revisions WHERE calculation_key=$1",[key])).rows[0];
    row.payload.entries[0].historical.result.raw_metrics.mdd="0.99";
    // This is app-store corruption detection, NOT protection against a DB
    // owner who can change code/immutable source and every underlying record.
    await pool.query("UPDATE execution_manager_calculation_revisions SET payload=$1::jsonb,payload_digest=$2 WHERE calculation_key=$3",
      [JSON.stringify(row.payload),accessDigest(row.payload),key]);
    await expect(h.coordinator.snapshot(h.data.doc)).rejects.toThrow("MANAGER_RESTATED_RESULT_MISMATCH");
  });
  it("revalidates immutable ORIGINAL input pins on each read instead of trusting mutable derived hashes",async()=>{
    const h=await setup();await h.idle();
    const row=(await pool.query("SELECT payload,payload_digest FROM execution_manager_calculation_revisions WHERE calculation_key=$1",[await restatedHead()])).rows[0];
    row.payload.entries[0].original_input_digest=hash("SYNTHETIC:forged-original");
    await pool.query("UPDATE execution_manager_calculation_revisions SET payload=$1::jsonb,payload_digest=$2 WHERE calculation_key=$3",
      [JSON.stringify(row.payload),accessDigest(row.payload),await restatedHead()]);
    await expect(h.coordinator.snapshot(h.data.doc)).rejects.toThrow("MANAGER_RESTATED_ORIGINAL_MISMATCH");
  });
});
