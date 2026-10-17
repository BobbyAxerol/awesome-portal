/** Proposed disposable-PG store tests, NOT_RUN. All Score/publication/policy
 * markers are synthetic private rows, NOT real TS source/approval/HTTP proof. */
import {createHash,randomUUID} from "node:crypto";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {Pool,type PoolClient} from "pg";
import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from "vitest";
import {accessDigest} from "../src/execution-v2/access-policy";
import type {ManagerModelDocument} from "../src/execution-v2/manager-model.contract";
import {ManagerScoreRuntime,type ManagerScoreRuntimeTask} from "../src/execution-v2/manager-score-runtime";
import {ManagerScoreOriginalCustody,type ManagerScoreOriginalInput,type ManagerScoreOriginalCustodySnapshot} from "../src/execution-v2/manager-score-original-custody";
import {ManagerScoreHistoryStore} from "../src/execution-v2/manager-score-history.store";
const hash=(s:string)=>"sha256:"+createHash("sha256").update(s).digest("hex");
const p=(d:ManagerModelDocument)=>[d.workspace_id,d.environment,d.profile_id,d.revision];
const config={maximum_bundle_bytes:262144,maximum_revisions_per_source:32,maximum_retained_bytes_per_source:64*1024*1024};
async function fixture(){
  const asOf=Date.now()-20000,scope={workspace_id:"SYNTHETIC:history",environment:"paper" as const,profile_id:"SYNTHETIC:profile",catalogue_digest:hash("SYNTHETIC:catalogue")};
  const task:Omit<ManagerScoreRuntimeTask,"policy">={scope,binding:{subject_type:"alpha",subject_id:"SYNTHETIC:alpha",
    tuple_population_digest:hash("SYNTHETIC:population"),partition_digest:hash("SYNTHETIC:partition"),stage_filter:["PAPER"],
    window_start_ms:asOf-1000,window_end_ms:asOf,comparable_basis_id:"SYNTHETIC:basis",individual_evidence_binding_id:"SYNTHETIC:evidence"},
    source_revision:"SYNTHETIC:r1",source_set_digest:accessDigest([]),source_qualification:"SOURCE_VERIFIED",calculation_revision:"SYNTHETIC:original",
    computed_at_ms:asOf+100,expected_policy_revision:null,input:{kind:"METRICS",quality:{comparable_basis_id:"SYNTHETIC:basis",
      individual_evidence_binding_id:"SYNTHETIC:evidence",window_start_ms:asOf-1000,window_end_ms:asOf,as_of_ms:asOf,observed_duration_ms:1000,
      currency:"USDT",required_costs_complete:true,stale:false,data_valid:true,sample_count:4,complete_block_count:2,
      metrics:{net_excess_twr:"0.06",sharpe_period:"0.12",mdd:"0.04",add:"0.01",positive_block_ratio:"0.75",stress_excess_twr:"0.045"}}}};
  const worker=new ManagerScoreRuntime({maximum_observations:10,maximum_blocks:10,maximum_stress_subperiods:10,maximum_input_bytes:65536,maximum_in_flight:1});
  const result=await worker.calculate({...task,policy:null}),{preview:_private,...quality}=result.quality;
  const document:ManagerModelDocument={schema_version:"portal.execution.manager-model-input.v1",workspace_id:scope.workspace_id,
    environment:scope.environment,profile_id:scope.profile_id,qualification:"SOURCE_VERIFIED",family_id:"alpha_fleet_overview",revision:task.source_revision,
    supersedes_revision:null,source_epoch:"SYNTHETIC:epoch",source_sequence:"1",projection_generation:"SYNTHETIC:g1",catalogue_digest:scope.catalogue_digest,
    source_set_digest:task.source_set_digest,as_of_ms:asOf,recorded_through_ms:asOf,facts_through_ms:asOf,observed_at_ms:Date.now(),
    source_quality:{completeness:"COMPLETE",freshness:"STALE",reasons:[]},members:[],facts:[],precomputed_scores:[{slot:"RAW",quality,raw_metrics:result.raw_metrics,provenance:result.provenance}]};
  const items:ManagerScoreOriginalInput[]=[{slot:"RAW",input_json:JSON.stringify(task),task}];
  return {document,items,worker};
}
describe.skipIf(!process.env.TEST_DATABASE_URL)("R06 bounded immutable history store — actual PG / synthetic custody",()=>{
  const name="elp206_hist_"+randomUUID().replaceAll("-","");
  const url=(db:string)=>{const u=new URL(process.env.TEST_DATABASE_URL!);u.pathname="/"+db;return u.toString();};
  const options={max:5,connectionTimeoutMillis:2000,query_timeout:4000};let pool:Pool;
  beforeAll(async()=>{
    if(!/^elp206_hist_[a-f0-9]{32}$/.test(name))throw new Error("SYNTHETIC_DB_NAME");
    const admin=new Pool({...options,max:1,connectionString:url("postgres")});
    try{await admin.query("CREATE DATABASE "+name);}finally{await admin.end();}
    pool=new Pool({...options,connectionString:url(name)});
    for(const file of ["1723680000135_execution-manager-models.sql","1723680000138_execution-manager-calculation-revisions.sql","1723680000139_execution-manager-score-mode-heads.sql"])
      await pool.query(readFileSync(resolve(__dirname,"../migrations",file),"utf8").split("-- Down Migration")[0]);
  },60000);
  beforeEach(async()=>{vi.restoreAllMocks();await pool.query("TRUNCATE execution_manager_score_mode_heads,execution_manager_calculation_heads,execution_manager_calculation_revisions,execution_manager_model_heads,execution_manager_model_revisions");});
  afterAll(async()=>{vi.restoreAllMocks();await pool?.end();
    if(!/^elp206_hist_[a-f0-9]{32}$/.test(name))throw new Error("SYNTHETIC_DB_NAME");
    const admin=new Pool({...options,max:1,connectionString:url("postgres")});
    try{await admin.query("DROP DATABASE IF EXISTS "+name+" WITH (FORCE)");}finally{await admin.end();}
  },60000);
  async function seed(custody=true){
    const f=await fixture(),d=f.document,client=await pool.connect();
    try{await client.query("BEGIN");
      await client.query("INSERT INTO execution_manager_model_revisions (workspace_id,environment,profile_id,revision,source_epoch,source_sequence,projection_generation,payload_digest,payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)",
        [...p(d),d.source_epoch,d.source_sequence,d.projection_generation,accessDigest(d),JSON.stringify(d)]);
      await client.query("INSERT INTO execution_manager_model_heads (workspace_id,environment,profile_id,revision,source_epoch,source_sequence,projection_generation,payload_digest,catalogue_digest) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [...p(d),d.source_epoch,d.source_sequence,d.projection_generation,accessDigest(d),d.catalogue_digest]);
      if(custody){const codec=new ManagerScoreOriginalCustody(config);await codec.persist(client,codec.prepare(d,f.items));}
      await client.query("COMMIT");
    }catch(error){await client.query("ROLLBACK").catch(()=>undefined);throw error;}finally{client.release();}
    return f;
  }
  async function insert(d:ManagerModelDocument,payload:unknown,key=accessDigest(payload)){
    await pool.query("INSERT INTO execution_manager_calculation_revisions (workspace_id,environment,profile_id,source_revision,calculation_key,payload_digest,payload) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)",
      [...p(d),key,accessDigest(payload),JSON.stringify(payload)]);return key;
  }
  async function restated(d:ManagerModelDocument,o:ManagerScoreOriginalCustodySnapshot,tag:string,previous:string|null=null,computed=Date.now()-1000){
    const policy={identity_digest:hash("SYNTHETIC:identity:"+tag),method_digest:hash("SYNTHETIC:method"),policy_revision:"SYNTHETIC:"+tag,
      stress_delta_bps:"5",approved_at_ms:d.as_of_ms+200,valid_until_ms:computed+500};
    const base={schema_version:"portal.execution.manager-score-restatement.v1",revision_mode:"RESTATED_CURRENT_POLICY",purpose:"HISTORICAL_ANALYSIS_ONLY",operational_current:false,
      source:o.source,original_custody_key:o.calculation_key,original_inputs_digest:o.inputs_digest,policy,calculation_revision:"SYNTHETIC:calc",input_method_revision:"SYNTHETIC:method-wrapper",
      knowledge_cutoff_ms:computed-100,computed_at_ms:computed,entries:o.retained_tasks.map(item=>({slot:item.slot,binding:item.task.binding,original_input_digest:item.input_digest,
        availability:"NOT_PUBLISHED",reason_codes:["METRIC_DEPENDENCIES_NOT_RETAINED"],historical:null})),supersedes_calculation_key:previous};
    const key=accessDigest({mode:"RESTATED_CURRENT_POLICY",source:o.source,original_custody_key:o.calculation_key,original_inputs_digest:o.inputs_digest,
      policy_identity_digest:policy.identity_digest,calculation_revision:base.calculation_revision,input_method_revision:base.input_method_revision});
    await insert(d,{...base,calculation_key:key},key);
    await pool.query("INSERT INTO execution_manager_score_mode_heads (workspace_id,environment,profile_id,source_revision,head_kind,calculation_key) VALUES($1,$2,$3,$4,'RESTATED_CURRENT_POLICY',$5) ON CONFLICT(workspace_id,environment,profile_id,source_revision,head_kind) DO UPDATE SET calculation_key=excluded.calculation_key",[...p(d),key]);
    return key;
  }
  function intercepted(after:(sql:string,client:PoolClient)=>Promise<void>,onRelease?:()=>void):Pool {
    return new Proxy(pool,{get(target,key){if(key==="connect")return async()=>{
      const real=await target.connect();return new Proxy(real,{get(client,field){
        if(field==="query")return async(...args:unknown[])=>{const result=await(client.query.bind(client) as unknown as (...args:unknown[])=>Promise<unknown>)(...args);await after(String(args[0]),client);return result;};
        if(field==="release")return (error?:Error|boolean)=>{onRelease?.();return client.release(error);};
        const value=Reflect.get(client,field,client);return typeof value==="function"?value.bind(client):value;
      }});};const value=Reflect.get(target,key,target);return typeof value==="function"?value.bind(target):value;}});
  }
  it("reads actual original custody in READ ONLY without FOR SHARE, mutation, worker or source authority",async()=>{
    const f=await seed(),sql:string[]=[],store=new ManagerScoreHistoryStore(intercepted(async text=>{sql.push(text);}));
    const calculate=vi.spyOn(f.worker,"calculate"),before=await pool.query("SELECT count(*)::text AS n FROM execution_manager_calculation_revisions");
    const view=await store.scan(f.document,5000);
    expect(view.original?.retained_tasks[0].input_json).toBe(f.items[0].input_json);expect(view.restatements).toEqual([]);
    expect(sql[0]).toBe("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    expect(sql.some(s=>/FOR SHARE|FOR UPDATE|INSERT|UPDATE|DELETE/.test(s))).toBe(false);expect(calculate).not.toHaveBeenCalled();
    expect((await pool.query("SELECT count(*)::text AS n FROM execution_manager_calculation_revisions")).rows).toEqual(before.rows);
    expect(await store.unchanged(f.document,view,5000)).toBe(true);
  });
  it("returns honest absent optional custody with an actual verified source, not a fabricated ORIGINAL input",async()=>{
    const f=await seed(false),view=await new ManagerScoreHistoryStore(pool).scan(f.document,5000);
    expect(view.original).toBeNull();expect(view.restatements).toEqual([]);expect(view.original_head_key).toBeNull();
  });
  it("enumerates an expired-policy chain without current policy, preserving exact K and original worker bytes",async()=>{
    const f=await seed(),store=new ManagerScoreHistoryStore(pool),original=(await store.scan(f.document,5000)).original!;
    const first=await restated(f.document,original,"B",null,Date.now()-2000),second=await restated(f.document,original,"C",first,Date.now()-1000);
    const view=await store.scan(f.document,5000);expect(view.restatements).toHaveLength(2);expect(view.restated_head_key).toBe(second);
    expect(view.restatements.every(v=>v.policy.valid_until_ms<Date.now())).toBe(true);
    expect(view.original?.retained_tasks[0].input_json).toBe(f.items[0].input_json);
    expect((await new ManagerScoreHistoryStore(pool).scan(f.document,5000)).snapshot_digest).toBe(view.snapshot_digest);
  });
  it("binds the exact source prefix and refuses caller/actual-source digest mismatch",async()=>{
    const f=await seed(),store=new ManagerScoreHistoryStore(pool);
    await expect(store.scan({...f.document,revision:"SYNTHETIC:missing"},5000)).rejects.toMatchObject({code:"HISTORY_SOURCE_CHANGED"});
    await pool.query("UPDATE execution_manager_model_revisions SET payload=jsonb_set(payload,'{projection_generation}','\"SYNTHETIC:mutated\"')");
    await expect(store.scan(f.document,5000)).rejects.toMatchObject({code:"HISTORY_SOURCE_CHANGED"});
  });
  it("counts every138 kind before fetching/decoding payloads and refuses33 without silent truncation",async()=>{
    const f=await seed();for(let i=0;i<32;i++)await insert(f.document,{schema_version:"portal.execution.manager-score-recalculation.v1",synthetic_only:true,i});
    const seen:string[]=[],store=new ManagerScoreHistoryStore(intercepted(async sql=>{seen.push(sql);}));
    await expect(store.scan(f.document,5000)).rejects.toMatchObject({code:"HISTORY_CAPACITY"});
    expect(seen.some(sql=>sql.startsWith("SELECT calculation_key,payload_digest,payload FROM"))).toBe(false);
  });
  it("counts actual JSONB bytes of unknown legacy kinds before decode and stops above64MiB",async()=>{
    const f=await seed(),chunk="x".repeat(14*1024*1024);
    for(let i=0;i<5;i++)await insert(f.document,{schema_version:"portal.execution.manager-score-recalculation.v1",synthetic_only:true,i,chunk});
    const usage=await pool.query("SELECT sum(octet_length(payload::text))::text AS bytes FROM execution_manager_calculation_revisions");
    expect(BigInt(usage.rows[0].bytes)).toBeGreaterThan(64n*1024n*1024n);
    await expect(new ManagerScoreHistoryStore(pool).scan(f.document,5000)).rejects.toMatchObject({code:"HISTORY_CAPACITY"});
  },30000);
  it("uses one repeatable snapshot then rejects unchanged() after a concurrent committed append",async()=>{
    const f=await seed();let appended=false;
    const store=new ManagerScoreHistoryStore(intercepted(async sql=>{
      if(!appended&&sql.startsWith("SELECT count(*)::text")){appended=true;await insert(f.document,{schema_version:"portal.execution.manager-score-recalculation.v1",synthetic_only:true,tag:"after-snapshot"});}
    }));
    const view=await store.scan(f.document,5000);expect(appended).toBe(true);
    expect(await store.unchanged(f.document,view,5000)).toBe(false);
  });
  it("refuses an unsupported finite schema instead of claiming complete zero history",async()=>{
    const f=await seed(false);await insert(f.document,{schema_version:"SYNTHETIC:unknown-future-history.v9"});
    await expect(new ManagerScoreHistoryStore(pool).scan(f.document,5000)).rejects.toMatchObject({code:"HISTORY_SCHEMA_UNSUPPORTED"});
  });
  it.each(["self","missing","cycle","reverse","orphan"])("refuses invalid %s lineage rather than skipping a row",async problem=>{
    const f=await seed(),store=new ManagerScoreHistoryStore(pool),o=(await store.scan(f.document,5000)).original!;
    const a=await restated(f.document,o,"B",null,Date.now()-2000),b=await restated(f.document,o,"C",a,Date.now()-1000);
    const update=async(key:string,prior:string|null)=>{const row=(await pool.query("SELECT payload FROM execution_manager_calculation_revisions WHERE calculation_key=$1",[key])).rows[0];
      row.payload.supersedes_calculation_key=prior;await pool.query("UPDATE execution_manager_calculation_revisions SET payload=$2::jsonb,payload_digest=$3 WHERE calculation_key=$1",[key,JSON.stringify(row.payload),accessDigest(row.payload)]);};
    if(problem==="self")await update(b,b);if(problem==="missing")await update(b,hash("SYNTHETIC:missing"));
    if(problem==="cycle")await update(a,b);
    if(problem==="reverse"){await update(a,b);await update(b,null);await pool.query("UPDATE execution_manager_score_mode_heads SET calculation_key=$1 WHERE head_kind='RESTATED_CURRENT_POLICY'",[a]);}
    if(problem==="orphan")await update(b,null);
    await expect(store.scan(f.document,5000)).rejects.toMatchObject({code:"HISTORY_DATA_INVALID"});
  });
  it("does not trust a rehashed original envelope that disagrees with immutable source worker input",async()=>{
    const f=await seed(),row=(await pool.query("SELECT calculation_key,payload FROM execution_manager_calculation_revisions")).rows[0];
    row.payload.retained_tasks[0].task.input.quality.metrics.mdd="0.9";
    await pool.query("UPDATE execution_manager_calculation_revisions SET payload=$1::jsonb,payload_digest=$2 WHERE calculation_key=$3",[JSON.stringify(row.payload),accessDigest(row.payload),row.calculation_key]);
    await expect(new ManagerScoreHistoryStore(pool).scan(f.document,5000)).rejects.toMatchObject({code:"HISTORY_DATA_INVALID"});
  });
  it("keeps snapshots detached/frozen and rejects foreign snapshot ownership or scope",async()=>{
    const f=await seed(),store=new ManagerScoreHistoryStore(pool),view=await store.scan(f.document,5000);
    expect(Object.isFrozen(view.original?.retained_tasks[0].task)).toBe(true);
    await expect(new ManagerScoreHistoryStore(pool).unchanged(f.document,view,5000)).rejects.toMatchObject({code:"HISTORY_SNAPSHOT_REQUIRED"});
    await expect(store.unchanged({...f.document,profile_id:"SYNTHETIC:other"},view,5000)).rejects.toMatchObject({code:"HISTORY_SNAPSHOT_REQUIRED"});
  });
  it("sanitizes native SQL/provider failure and releases borrowed client exactly once",async()=>{
    const f=await seed();let held:PoolClient|undefined,releases=0;
    const database=intercepted(async(sql,client)=>{held=client;if(sql.startsWith("SELECT count(*)"))throw new Error("SYNTHETIC-PRIVATE-CREDENTIAL");},()=>{releases++;});
    const error=await new ManagerScoreHistoryStore(database).scan(f.document,5000).catch(e=>e);
    expect(error).toMatchObject({code:"HISTORY_UNAVAILABLE"});expect(String(error)).not.toContain("PRIVATE-CREDENTIAL");
    expect(held).toBeDefined();expect(releases).toBe(1);expect((await pool.query("SELECT 1 AS ok")).rows[0].ok).toBe(1);
  });
  it("bounds physical concurrent scans at four while real PG transactions are held deterministically",async()=>{
    const f=await seed();let release!:()=>void,entered=0,allEntered!:()=>void;
    const gate=new Promise<void>(resolve=>{release=resolve;}),ready=new Promise<void>(resolve=>{allEntered=resolve;});
    const store=new ManagerScoreHistoryStore(intercepted(async sql=>{if(sql.startsWith("BEGIN")){if(++entered===4)allEntered();await gate;}}));
    const scans=Array.from({length:4},()=>store.scan(f.document,5000));
    try{await ready;await expect(store.scan(f.document,5000)).rejects.toMatchObject({code:"HISTORY_CAPACITY"});}
    finally{release();await Promise.allSettled(scans);}
    expect(entered).toBe(4);
  });
  it("a real held PG borrow hits its supplied deadline, destroys once, and leaves no reusable open transaction",async()=>{
    const f=await seed();let release!:()=>void,releases=0;
    const gate=new Promise<void>(resolve=>{release=resolve;});
    const store=new ManagerScoreHistoryStore(intercepted(async sql=>{if(sql.startsWith("BEGIN"))await gate;},()=>{releases++;}));
    try{await expect(store.scan(f.document,100)).rejects.toMatchObject({code:"HISTORY_TIME_LIMIT"});}
    finally{release();}
    expect(releases).toBe(1);expect((await pool.query("SELECT 1 AS ok")).rows[0].ok).toBe(1);
  });
  it("retains all four admission slots after timed-out pending borrows until late acquisitions settle",async()=>{
    const f=await seed();
    type Borrow={resolve:(client:PoolClient)=>void;reject:(error:Error)=>void;settled:boolean};
    const pending:Borrow[]=[],late=Array.from({length:4},()=>({on:vi.fn(),release:vi.fn()}));
    const connect=vi.fn(()=>new Promise<PoolClient>((resolve,reject)=>{pending.push({resolve,reject,settled:false});}));
    const store=new ManagerScoreHistoryStore({connect} as unknown as Pool);
    const finish=()=>new Promise<void>(resolve=>setImmediate(resolve));
    vi.useFakeTimers({toFake:["setTimeout","clearTimeout"]});
    try{
      const initial=Promise.allSettled(Array.from({length:4},()=>store.scan(f.document,50)));
      expect(connect).toHaveBeenCalledTimes(4);
      await vi.advanceTimersByTimeAsync(50);
      expect((await initial).map(result=>result.status==="rejected"?result.reason.code:"UNEXPECTED_SUCCESS"))
        .toEqual(Array(4).fill("HISTORY_TIME_LIMIT"));
      await expect(store.scan(f.document,50)).rejects.toMatchObject({code:"HISTORY_CAPACITY"});
      expect(connect).toHaveBeenCalledTimes(4);
      pending.slice(0,4).forEach((borrow,index)=>{
        borrow.settled=true;borrow.resolve(late[index] as unknown as PoolClient);
      });
      // One end-of-turn barrier observes both the late-acquisition rejection
      // and its admission cleanup; no guessed microtask-count loop.
      await finish();
      for(const client of late){expect(client.release).toHaveBeenCalledTimes(1);expect(client.release).toHaveBeenCalledWith(true);}
      const next=Promise.allSettled(Array.from({length:4},()=>store.scan(f.document,50)));
      expect(connect).toHaveBeenCalledTimes(8);
      for(const borrow of pending.slice(4)){borrow.settled=true;borrow.reject(new Error("SYNTHETIC_UNAVAILABLE"));}
      expect((await next).map(result=>result.status==="rejected"?result.reason.code:"UNEXPECTED_SUCCESS"))
        .toEqual(Array(4).fill("HISTORY_UNAVAILABLE"));
    }finally{
      for(const borrow of pending)if(!borrow.settled){borrow.settled=true;borrow.reject(new Error("SYNTHETIC_TEST_CLEANUP"));}
      await finish();vi.useRealTimers();
    }
  });
  it("bounds an actual isolated PG table-lock wait and releases its reader exactly once",async()=>{
    const f=await seed(),blocker=await pool.connect();let releases=0,attemptedLockedRead=false;
    const database=new Proxy(pool,{get(target,key){
      if(key==="connect")return async()=>{
        const real=await target.connect();return new Proxy(real,{get(client,field){
          if(field==="query")return (...args:unknown[])=>{
            if(String(args[0]).startsWith("SELECT count(*)::text"))attemptedLockedRead=true;
            return (client.query.bind(client) as unknown as (...args:unknown[])=>Promise<unknown>)(...args);
          };
          if(field==="release")return (error?:Error|boolean)=>{releases++;return client.release(error);};
          const value=Reflect.get(client,field,client);return typeof value==="function"?value.bind(client):value;
        }});
      };
      const value=Reflect.get(target,key,target);return typeof value==="function"?value.bind(target):value;
    }});
    try{
      await blocker.query("BEGIN");
      await blocker.query("SELECT set_config('statement_timeout','1500ms',true),set_config('lock_timeout','1000ms',true),set_config('idle_in_transaction_session_timeout','3000ms',true)");
      // This relation belongs only to the disposable elp206_hist_* database.
      // No source/owner table, shared DB or foreign resource is locked.
      await blocker.query("LOCK TABLE execution_manager_calculation_revisions IN ACCESS EXCLUSIVE MODE");
      await expect(new ManagerScoreHistoryStore(database).scan(f.document,500)).rejects.toMatchObject({code:"HISTORY_TIME_LIMIT"});
      expect(attemptedLockedRead).toBe(true);expect(releases).toBe(1);
    }finally{
      try{await blocker.query("ROLLBACK");}finally{blocker.release();}
    }
    expect((await pool.query("SELECT 1 AS ok")).rows[0].ok).toBe(1);
  },10000);
});
