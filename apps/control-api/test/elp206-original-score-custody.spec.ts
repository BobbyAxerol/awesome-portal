/** Source-only proposal: actual disposable-PG custody tests; ALL publication,
 * source qualification and worker inputs are SYNTHETIC, not TS commissioning.
 * This direct caller transaction harness is NOT full consumer/ACK acceptance. */
import {createHash,randomUUID} from "node:crypto";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {Pool,type PoolClient} from "pg";
import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from "vitest";
import {accessDigest} from "../src/execution-v2/access-policy";
import type {ManagerModelDocument} from "../src/execution-v2/manager-model.contract";
import {ManagerScoreRuntime,type ManagerScoreRuntimeTask} from "../src/execution-v2/manager-score-runtime";
import {ManagerScoreOriginalCustody,type ManagerScoreOriginalInput} from "../src/execution-v2/manager-score-original-custody";
const hash=(s:string)=>"sha256:"+createHash("sha256").update(s).digest("hex");
const limits={maximum_bundle_bytes:65_536,maximum_revisions_per_source:4,maximum_retained_bytes_per_source:262_144};
const methods=resolve(__dirname,"../migrations");
async function fixture(kind:"PATH"|"METRICS"="METRICS",dependency=false,reordered=false,originalText?:string,opaqueExtras=false){
  const asOf=Date.now()-1000,start=asOf-400;
  const scope={workspace_id:"SYNTHETIC:original-custody",environment:"paper" as const,profile_id:"SYNTHETIC:paper"};
  const catalogue=hash("SYNTHETIC:catalogue"),sourceSet=hash("SYNTHETIC:source-set");
  const quality={comparable_basis_id:"SYNTHETIC:basis",individual_evidence_binding_id:"SYNTHETIC:evidence",
    window_start_ms:start,window_end_ms:asOf,as_of_ms:asOf,observed_duration_ms:400,currency:"USDT",
    required_costs_complete:true,stale:false,data_valid:true,reason_codes:undefined};
  let task:Omit<ManagerScoreRuntimeTask,"policy">={
    scope:{...scope,catalogue_digest:catalogue},binding:{subject_type:"alpha",subject_id:"SYNTHETIC:alpha",
      tuple_population_digest:hash("SYNTHETIC:population"),partition_digest:hash("SYNTHETIC:partition"),stage_filter:["PAPER"],
      window_start_ms:start,window_end_ms:asOf,comparable_basis_id:quality.comparable_basis_id,
      individual_evidence_binding_id:quality.individual_evidence_binding_id},
    source_revision:"SYNTHETIC:source-r1",source_set_digest:sourceSet,source_qualification:"SOURCE_VERIFIED",
    calculation_revision:"SYNTHETIC:original-worker",computed_at_ms:Date.now(),expected_policy_revision:null,
    input:kind==="METRICS"?{kind,quality:{...quality,sample_count:4,complete_block_count:2,
      metrics:{net_excess_twr:"0.06",sharpe_period:"0.12",mdd:"0.04",add:"0.01",positive_block_ratio:"0.75",stress_excess_twr:"0.045"}}}:
      {kind,quality,path:{observations:["0.02","-0.01","0.015","-0.005"].map((net_return,i)=>({
        from_ms:start+i*100,to_ms:start+(i+1)*100,net_return,cash_return:"0",stress_subperiods:null})),
        blocks:[{from_ms:start,to_ms:asOf,complete:true,expected_observations:4}],window_start_ms:start,window_end_ms:asOf,
        expected_observations:4,grid_verified:true,required_costs_complete:true,currency:"USDT",cash_currency:"USDT",
        block_manifest_registered_at_ms:start-1,stress_delta_bps:"5"}},
  };
  if(originalText!==undefined){
    // All these locations are accepted by the actual worker/model grammar.
    // Mutate before the original worker captures bytes, never rehash a
    // different task after creating a synthetic publication.
    scope.profile_id=originalText;task.scope.profile_id=originalText;
    task.binding.subject_id=originalText;task.calculation_revision=originalText;
    task.expected_policy_revision=originalText;
  }
  if(opaqueExtras){
    // Deliberately do not widen exported ManagerScoreRuntimeTask: these
    // harmless own-data bytes are outside the interpreted worker DTO.
    Object.defineProperty(task,"SYNTHETIC_opaque_root",{enumerable:true,
      value:{note:"byte custody only",items:[null,"   ","\u2028",false]}});
    Object.defineProperty(task.input,"SYNTHETIC_opaque_input",{enumerable:true,
      value:{note:"not an input metric",items:["retained",17]}});
  }
  const dep=dependency?{source_revision:task.source_revision,source_set_digest:sourceSet,source_as_of_ms:asOf,
    metrics_input_digest:accessDigest(task.input),method_digest:hash("SYNTHETIC:original-source-method"),
    stress_delta_bps:"5",source_locator:"SYNTHETIC:source-artifact-NOT-qualification"}:undefined;
  if(dep)task.metrics_dependency_digest=accessDigest(dep);
  if(reordered)task=Object.fromEntries(Object.entries(task).reverse()) as typeof task;
  const input_json=JSON.stringify(task);
  const worker=await new ManagerScoreRuntime({maximum_observations:20,maximum_blocks:20,
    maximum_stress_subperiods:40,maximum_input_bytes:30_000,maximum_in_flight:1}).calculate({...task,policy:null});
  const {preview:_preview,...q}=worker.quality;
  const doc:ManagerModelDocument={schema_version:"portal.execution.manager-model-input.v1",...scope,qualification:"SOURCE_VERIFIED",
    family_id:"alpha_fleet_overview",revision:task.source_revision,supersedes_revision:null,source_epoch:"SYNTHETIC:epoch",source_sequence:"1",
    projection_generation:"SYNTHETIC:g1",catalogue_digest:catalogue,source_set_digest:sourceSet,as_of_ms:asOf,
    recorded_through_ms:asOf,facts_through_ms:asOf,observed_at_ms:Date.now(),
    source_quality:{completeness:"COMPLETE",freshness:"FRESH",reasons:[]},members:[],facts:[],
    precomputed_scores:[{slot:"RAW",quality:q,raw_metrics:worker.raw_metrics,provenance:worker.provenance}]};
  const item:ManagerScoreOriginalInput={slot:"RAW",input_json,task,...(dep?{metrics_dependency:dep}:{})};
  return {doc,item,worker};
}
type Fixture=Awaited<ReturnType<typeof fixture>>;
describe("ELP2-06 original custody finite configuration",()=>{
  it.each([NaN,65_536.5,Infinity,undefined,Number.MAX_SAFE_INTEGER+1])("rejects invalid retained-byte limit %s before SQL",value=>{
    expect(()=>new ManagerScoreOriginalCustody({...limits,maximum_retained_bytes_per_source:value as number}))
      .toThrow("MANAGER_ORIGINAL_LIMIT_INVALID");
  });
  it.each([65_536,64*1024*1024])("accepts the inclusive bounded retained-byte limit %s",value=>{
    expect(()=>new ManagerScoreOriginalCustody({...limits,maximum_retained_bytes_per_source:value})).not.toThrow();
  });
});
describe.skipIf(!process.env.TEST_DATABASE_URL)("ELP2-06 policy-independent original custody — actual PG / SYNTHETIC authority",()=>{
  const name="elp206_original_"+randomUUID().replaceAll("-","");
  const url=(db:string)=>{const u=new URL(process.env.TEST_DATABASE_URL!);u.pathname="/"+db;return u.toString();};
  const options={max:2,connectionTimeoutMillis:2000,query_timeout:4000};
  let pool:Pool;
  beforeAll(async()=>{
    if(!/^elp206_original_[a-f0-9]{32}$/.test(name))throw new Error("SYNTHETIC_DB_NAME");
    const admin=new Pool({...options,max:1,connectionString:url("postgres")});
    try{await admin.query("CREATE DATABASE "+name);}finally{await admin.end();}
    pool=new Pool({...options,connectionString:url(name)});
    for(const file of ["1723680000135_execution-manager-models.sql","1723680000138_execution-manager-calculation-revisions.sql",
      "1723680000139_execution-manager-score-mode-heads.sql"])
      await pool.query(readFileSync(resolve(methods,file),"utf8").split("-- Down Migration")[0]);
  },60_000);
  beforeEach(async()=>{await pool.query("TRUNCATE execution_manager_score_mode_heads,execution_manager_calculation_heads,execution_manager_calculation_revisions,execution_manager_model_heads,execution_manager_model_revisions");});
  afterAll(async()=>{
    await pool?.end();
    if(!/^elp206_original_[a-f0-9]{32}$/.test(name))throw new Error("SYNTHETIC_DB_NAME");
    const admin=new Pool({...options,max:1,connectionString:url("postgres")});
    try{await admin.query("DROP DATABASE IF EXISTS "+name+" WITH (FORCE)");}finally{await admin.end();}
  },60_000);
  async function transaction<T>(run:(client:PoolClient)=>Promise<T>):Promise<T>{
    const client=await pool.connect();
    try{await client.query("BEGIN");await client.query("SET LOCAL statement_timeout='3000ms'");await client.query("SET LOCAL lock_timeout='1000ms'");
      const result=await run(client);await client.query("COMMIT");return result;
    }catch(error){await client.query("ROLLBACK").catch(()=>undefined);throw error;}finally{client.release();}
  }
  async function source(client:PoolClient,f:Fixture){
    const d=f.doc,key=[d.workspace_id,d.environment,d.profile_id],digest=accessDigest(d);
    await client.query(`INSERT INTO execution_manager_model_revisions
      (workspace_id,environment,profile_id,revision,source_epoch,source_sequence,projection_generation,payload_digest,payload)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,[...key,d.revision,d.source_epoch,d.source_sequence,d.projection_generation,digest,JSON.stringify(d)]);
    await client.query(`INSERT INTO execution_manager_model_heads
      (workspace_id,environment,profile_id,revision,source_epoch,source_sequence,projection_generation,payload_digest,catalogue_digest)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[...key,d.revision,d.source_epoch,d.source_sequence,d.projection_generation,digest,d.catalogue_digest]);
  }
  const rows=async(table:string)=>(await pool.query("SELECT count(*)::text AS count FROM "+table)).rows[0].count;
  async function committed(input?:Fixture,custody=new ManagerScoreOriginalCustody(limits)){
    const f=input??await fixture(),prepared=custody.prepare(f.doc,[f.item]);
    await transaction(async client=>{await source(client,f);expect(await custody.persist(client,prepared)).toBe("INSERTED");});
    return {f,custody,prepared};
  }
  it.each(["METRICS","PATH"] as const)("retains exact %s input with no eligible policy and no numeric publication invented",async kind=>{
    const f=await fixture(kind),h=await committed(f);
    const stored=await transaction(client=>h.custody.restore(client,f.doc));
    expect(stored?.retained_tasks[0].input_json).toBe(f.item.input_json);
    expect(stored?.retained_tasks[0].input_digest).toBe(f.worker.provenance.input_digest);
    expect(stored?.retained_tasks[0].method_custody).toEqual({state:"NOT_RETAINED",
      reason:kind==="PATH"?"PATH_METHOD_PROOF_NOT_RETAINED":"METRIC_DEPENDENCIES_NOT_RETAINED"});
    expect(f.doc.precomputed_scores?.[0].quality).toMatchObject({value:null,status:"policy_pending"});
    expect(await rows("execution_manager_calculation_heads")).toBe("0");
  });
  it("survives actual JSONB key reordering and the original undefined-object omission without replacing byte order",async()=>{
    const h=await committed(await fixture("METRICS",false,true));
    const stored=await transaction(client=>h.custody.restore(client,h.f.doc));
    expect(stored?.retained_tasks[0].input_json).toBe(h.f.item.input_json);
    expect(JSON.stringify(stored?.retained_tasks[0].task)).toBe(h.f.item.input_json);
    expect(Object.hasOwn(stored!.retained_tasks[0].task.input.quality,"reason_codes")).toBe(false);
  });
  it("retains an already byte-bound METRICS dependency without creating one from current configuration",async()=>{
    const h=await committed(await fixture("METRICS",true));
    const stored=await transaction(client=>h.custody.restore(client,h.f.doc));
    expect(stored?.retained_tasks[0].metrics_dependency).toEqual(h.f.item.metrics_dependency);
    expect(stored?.retained_tasks[0].method_custody).toEqual({state:"BOUND_METRICS_DEPENDENCY",reason:null});
  });
  it.each(["\u0085","\u2028","\u2029","   "])("retains actual-worker accepted original identifier bytes %j without normalization",async originalText=>{
    const f=await fixture("METRICS",false,false,originalText);
    const originalBytes=f.item.input_json,originalDigest=f.worker.provenance.input_digest;
    expect(originalDigest).toBe(hash(originalBytes));
    expect(f.doc.precomputed_scores?.[0].provenance.scope.profile_id).toBe(originalText);
    const h=await committed(f),stored=await transaction(client=>h.custody.restore(client,f.doc));
    const task=stored!.retained_tasks[0];
    expect(task.input_json).toBe(originalBytes);
    expect(task.input_digest).toBe(originalDigest);
    expect(JSON.stringify(task.task)).toBe(originalBytes);
    expect(task.task.scope.profile_id).toBe(originalText);
    expect(task.task.binding.subject_id).toBe(originalText);
    expect(task.task.calculation_revision).toBe(originalText);
    expect(task.task.expected_policy_revision).toBe(originalText);
    expect((await pool.query("SELECT payload_digest FROM execution_manager_model_revisions")).rows[0].payload_digest).toBe(accessDigest(f.doc));
  });
  it.each(["METRICS","PATH"] as const)("preserves actual-worker opaque %s root/input bytes without numeric or method authority",async kind=>{
    const f=await fixture(kind,false,false,undefined,true);
    const originalBytes=f.item.input_json,original=JSON.parse(originalBytes);
    expect(f.worker.provenance.input_digest).toBe(hash(originalBytes));
    expect(f.worker.quality).toMatchObject({status:"policy_pending",value:null});
    const h=await committed(f),stored=await transaction(client=>h.custody.restore(client,f.doc));
    const retained=stored!.retained_tasks[0],roundTrip=JSON.parse(retained.input_json);
    expect(retained.input_json).toBe(originalBytes);
    expect(JSON.stringify(retained.task)).toBe(originalBytes);
    expect(retained.input_digest).toBe(f.worker.provenance.input_digest);
    expect(roundTrip.SYNTHETIC_opaque_root).toEqual(original.SYNTHETIC_opaque_root);
    expect(roundTrip.input.SYNTHETIC_opaque_input).toEqual(original.input.SYNTHETIC_opaque_input);
    expect(retained.method_custody).toEqual({state:"NOT_RETAINED",
      reason:kind==="PATH"?"PATH_METHOD_PROOF_NOT_RETAINED":"METRIC_DEPENDENCIES_NOT_RETAINED"});
    expect(retained.metrics_dependency).toBeUndefined();
    expect(f.doc.precomputed_scores?.[0].quality).toMatchObject({status:"policy_pending",value:null});
    expect((await pool.query("SELECT payload_digest FROM execution_manager_model_revisions")).rows[0].payload_digest).toBe(accessDigest(f.doc));
  });
  it("retries/restarts without another original row, head mutation or source digest/sequence change",async()=>{
    const h=await committed(),before=(await pool.query("SELECT payload::text,payload_digest,source_sequence::text FROM execution_manager_model_revisions")).rows;
    const restarted=new ManagerScoreOriginalCustody(limits),prepared=restarted.prepare(h.f.doc,[h.f.item]);
    await transaction(async client=>expect(await restarted.persist(client,prepared)).toBe("DUPLICATE"));
    expect(await rows("execution_manager_calculation_revisions")).toBe("1");
    expect(await rows("execution_manager_score_mode_heads")).toBe("1");
    expect((await pool.query("SELECT payload::text,payload_digest,source_sequence::text FROM execution_manager_model_revisions")).rows).toEqual(before);
  });
  it("cannot replace the set-once ORIGINAL head even by direct accidental SQL",async()=>{
    const h=await committed();
    await expect(pool.query("UPDATE execution_manager_score_mode_heads SET calculation_key=calculation_key")).rejects.toMatchObject({code:"23514"});
    expect((await transaction(client=>h.custody.restore(client,h.f.doc)))?.calculation_key).toBe(h.prepared.calculation_key);
  });
  it.each(["duplicate","incomplete","scope","source","asof","bytes","dependency"] as const)("rejects ambiguous/mismatched %s custody",async fault=>{
    const f=await fixture(),custody=new ManagerScoreOriginalCustody(limits);
    if(fault==="duplicate")expect(()=>custody.prepare(f.doc,[f.item,f.item])).toThrow("MANAGER_ORIGINAL_DUPLICATE_SLOT");
    else{
      if(fault==="incomplete")f.doc.precomputed_scores=[];
      if(fault==="scope")f.item.task.scope.workspace_id="SYNTHETIC:other";
      if(fault==="source")f.item.task.source_revision="SYNTHETIC:other";
      if(fault==="asof")f.item.task.input.quality.as_of_ms+=1;
      if(fault==="bytes")f.item.input_json+=" ";
      if(fault==="dependency")f.item.task.metrics_dependency_digest=hash("SYNTHETIC:unpaired");
      expect(()=>custody.prepare(f.doc,[f.item])).toThrow();
    }
  });
  it("keeps caller mutation detached and rejects accessors before invoking them",async()=>{
    const f=await fixture(),custody=new ManagerScoreOriginalCustody(limits),p=custody.prepare(f.doc,[f.item]),original=structuredClone(f.doc);
    f.item.task.binding.subject_id="changed-after-capture";
    await transaction(async client=>{await source(client,{...f,doc:original});await custody.persist(client,p);});
    expect((await transaction(client=>custody.restore(client,original)))?.retained_tasks[0].task.binding.subject_id).toBe("SYNTHETIC:alpha");
    const g=await fixture();let calls=0;
    Object.defineProperty(g.item.task.binding,"subject_id",{enumerable:true,get(){calls++;return "leak";}});
    expect(()=>custody.prepare(g.doc,[g.item])).toThrow("MANAGER_ORIGINAL_INPUT_INVALID");expect(calls).toBe(0);
  });
  it("rolls source, original row and head back together when caller's final fence refuses before COMMIT",async()=>{
    const f=await fixture(),custody=new ManagerScoreOriginalCustody(limits),p=custody.prepare(f.doc,[f.item]),ack=vi.fn();
    await expect(transaction(async client=>{await source(client,f);await custody.persist(client,p);throw new Error("SYNTHETIC_FINAL_FENCE_REVOKED");})
      .then(()=>ack())).rejects.toThrow("SYNTHETIC_FINAL_FENCE_REVOKED");
    for(const table of ["execution_manager_model_revisions","execution_manager_model_heads",
      "execution_manager_calculation_revisions","execution_manager_score_mode_heads"])expect(await rows(table)).toBe("0");
    expect(ack).not.toHaveBeenCalled();
  });
  it("checks the actual immutable source score after rehash of every mutable sidecar/task/head component",async()=>{
    const h=await committed(),row=(await pool.query("SELECT payload FROM execution_manager_calculation_revisions")).rows[0],b=row.payload;
    const t=b.retained_tasks[0];t.task.input.quality.metrics.mdd="0.05";t.input_json=JSON.stringify(t.task);t.input_digest=hash(t.input_json);
    b.inputs_digest=accessDigest(b.retained_tasks);
    b.calculation_key=accessDigest({mode:"ORIGINAL_INPUTS",source:b.source,inputs_digest:b.inputs_digest});
    // Test-only corruption setup rebuilds the mutable head rather than bypassing
    // the production original-head immutability trigger with UPDATE.
    await pool.query("TRUNCATE execution_manager_score_mode_heads");
    await pool.query(`INSERT INTO execution_manager_calculation_revisions
      (workspace_id,environment,profile_id,source_revision,calculation_key,payload_digest,payload)
      VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)`,[b.source.workspace_id,b.source.environment,b.source.profile_id,b.source.revision,b.calculation_key,accessDigest(b),JSON.stringify(b)]);
    await pool.query(`INSERT INTO execution_manager_score_mode_heads
      (workspace_id,environment,profile_id,source_revision,head_kind,calculation_key) VALUES($1,$2,$3,$4,'ORIGINAL_INPUTS',$5)`,
    [b.source.workspace_id,b.source.environment,b.source.profile_id,b.source.revision,b.calculation_key]);
    await expect(transaction(client=>h.custody.restore(client,h.f.doc))).rejects.toThrow("MANAGER_ORIGINAL_SOURCE_MISMATCH");
    expect((await pool.query("SELECT payload_digest FROM execution_manager_model_revisions")).rows[0].payload_digest).toBe(accessDigest(h.f.doc));
  });
  it("counts legacy138 rows against the SAME count cap and never erases them",async()=>{
    const f=await fixture(),custody=new ManagerScoreOriginalCustody({...limits,maximum_revisions_per_source:1}),p=custody.prepare(f.doc,[f.item]);
    await transaction(async client=>{await source(client,f);const payload={schema_version:"SYNTHETIC:legacy-row"};
      await client.query(`INSERT INTO execution_manager_calculation_revisions
        (workspace_id,environment,profile_id,source_revision,calculation_key,payload_digest,payload) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)`,
      [f.doc.workspace_id,f.doc.environment,f.doc.profile_id,f.doc.revision,hash("legacy-key"),accessDigest(payload),JSON.stringify(payload)]);
    });
    await expect(transaction(client=>custody.persist(client,p))).rejects.toThrow("MANAGER_DERIVED_RETENTION_CAP_REACHED");
    expect(await rows("execution_manager_calculation_revisions")).toBe("1");
    expect(await rows("execution_manager_score_mode_heads")).toBe("0");
  });
  it("uses measured JSONB bytes, not compact bytes or a separate mode byte cap",async()=>{
    const f=await fixture(),custody=new ManagerScoreOriginalCustody(limits),p=custody.prepare(f.doc,[f.item]);
    await transaction(client=>source(client,f));
    const constrained=new ManagerScoreOriginalCustody({...limits,maximum_retained_bytes_per_source:limits.maximum_bundle_bytes});
    // Fill shared138 with genuine measured JSONB bytes, leaving less than the
    // proposed original row; the witness below identifies the exact quota SQL.
    await pool.query(`INSERT INTO execution_manager_calculation_revisions
      (workspace_id,environment,profile_id,source_revision,calculation_key,payload_digest,payload) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)`,
    [f.doc.workspace_id,f.doc.environment,f.doc.profile_id,f.doc.revision,hash("byte-key"),hash("SYNTHETIC:quota-row"),
      JSON.stringify({padding:"x".repeat(limits.maximum_bundle_bytes-1024)})]);
    let measured=false;
    await expect(transaction(async client=>{
      const observed=new Proxy(client,{get(target,key){
        if(key==="query")return async(...args:unknown[])=>{
          const value=await (target.query.bind(target) as unknown as (...args:unknown[])=>Promise<unknown>)(...args);
          if(String(args[0]).includes("octet_length($1::jsonb::text)"))measured=true;return value;
        };
        const v=Reflect.get(target,key,target);return typeof v==="function"?v.bind(target):v;
      }});
      await constrained.persist(observed,p);
    })).rejects.toThrow("MANAGER_DERIVED_RETENTION_CAP_REACHED");
    expect(measured).toBe(true);expect(await rows("execution_manager_calculation_revisions")).toBe("1");
  });
});
