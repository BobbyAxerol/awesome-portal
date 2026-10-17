/** PRIVATE bounded history custody. Not a permission, public list, policy
 * authority, worker, source checkpoint or ACK. Caller authorizes exact target,
 * fields/population and source binding BEFORE scan/count, projects target BEFORE
 * public sort/count/page, and freshly fences delivery AFTER these local reads. */
import {performance} from "node:perf_hooks";
import type {Pool,PoolClient,QueryResultRow} from "pg";
import {accessDigest} from "./access-policy";
import {managerModelDocument,type ManagerModelDocument} from "./manager-model.contract";
import {decodeRetainedManagerScoreOriginal,type ManagerScoreOriginalCustodySnapshot} from "./manager-score-original-custody";
import {decodeRetainedManagerScoreRestatement,type ManagerScoreRestatementSnapshot} from "./manager-score-restatement";

const MAX_BUNDLE=8*1024*1024,MAX_ROWS=32,MAX_BYTES=64*1024*1024,MAX_CONCURRENT=4;
const finiteDigest=(value:unknown):value is string=>typeof value==="string"&&/^sha256:[a-f0-9]{64}$(?![\s\S])/.test(value);
const prefix=(d:Pick<ManagerModelDocument,"workspace_id"|"environment"|"profile_id"|"revision">)=>
  [d.workspace_id,d.environment,d.profile_id,d.revision];
export class ManagerScoreHistoryStoreError extends Error {
  constructor(readonly code:"HISTORY_INPUT_INVALID"|"HISTORY_CAPACITY"|"HISTORY_TIME_LIMIT"|
    "HISTORY_SOURCE_CHANGED"|"HISTORY_DATA_INVALID"|"HISTORY_SCHEMA_UNSUPPORTED"|"HISTORY_UNAVAILABLE"|"HISTORY_SNAPSHOT_REQUIRED"){
    super("The requested retained Score history is not available.");
  }
}
function fail(code:ManagerScoreHistoryStoreError["code"]):never {throw new ManagerScoreHistoryStoreError(code);}
interface Meta extends QueryResultRow {calculation_key:string;payload_digest:string;bytes:string;schema_version:string|null}
interface Stored extends QueryResultRow {calculation_key:string;payload_digest:string;payload:unknown}
interface Head extends QueryResultRow {head_kind:string;calculation_key:string}
interface Inventory {rows:Meta[];heads:Head[];source_digest:string;signature:string}
export interface ManagerScoreHistorySnapshot {
  readonly document:ManagerModelDocument;
  readonly original:ManagerScoreOriginalCustodySnapshot|null;
  readonly restatements:readonly ManagerScoreRestatementSnapshot[];
  readonly original_head_key:string|null;
  readonly restated_head_key:string|null;
  /** PRIVATE state only. Never return/encode this profile-wide digest or any
   * calculation_key to a browser. Public cursors bind authorized projections. */
  readonly snapshot_digest:string;
}
const snapshots=new WeakMap<ManagerScoreHistorySnapshot,{owner:ManagerScoreHistoryStore;prefix:string;signature:string;source_digest:string}>();
function freeze<T>(value:T):T {
  if(value&&typeof value==="object"){for(const item of Object.values(value))freeze(item);Object.freeze(value);}return value;
}
function expected(raw:ManagerModelDocument):ManagerModelDocument {
  try{
    const d=managerModelDocument.parse(structuredClone(raw));
    if(d.qualification!=="SOURCE_VERIFIED"||Buffer.byteLength(JSON.stringify(d))>MAX_BUNDLE)fail("HISTORY_INPUT_INVALID");
    return d;
  }catch(error){if(error instanceof ManagerScoreHistoryStoreError)throw error;return fail("HISTORY_INPUT_INVALID");}
}
function lineage(views:readonly ManagerScoreRestatementSnapshot[],head:string|null):void {
  const map=new Map(views.map(v=>[v.calculation_key,v]));
  if(map.size!==views.length||(views.length===0?head!==null:head===null||!map.has(head)))fail("HISTORY_DATA_INVALID");
  for(const view of views){
    const prior=view.supersedes_calculation_key;if(prior===null)continue;
    const p=map.get(prior);
    if(!p||prior===view.calculation_key||p.computed_at_ms>view.computed_at_ms||
      p.knowledge_cutoff_ms>view.knowledge_cutoff_ms)fail("HISTORY_DATA_INVALID");
  }
  // A valid single-CAS writer produces one complete chain, not hidden orphan
  // branches. Equal wall-clock milliseconds are valid; pointer order is causal.
  const seen=new Set<string>();let key:string|null=head;
  while(key!==null){if(seen.has(key))fail("HISTORY_DATA_INVALID");seen.add(key);
    const view:ManagerScoreRestatementSnapshot|undefined=map.get(key);if(!view)fail("HISTORY_DATA_INVALID");key=view.supersedes_calculation_key;}
  if(seen.size!==views.length)fail("HISTORY_DATA_INVALID");
}

/** Supported historical ceilings, NOT today's smaller writer quota or a
 * measured production SLO. No query scans across source revisions. */
export class ManagerScoreHistoryStore {
  private active=0;
  constructor(private readonly pool:Pool){}
  private async read<T>(timeoutMs:number,body:(query:<R extends QueryResultRow=QueryResultRow>(sql:string,values?:unknown[])=>Promise<R[]>)=>Promise<T>):Promise<T>{
    if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>5000)fail("HISTORY_INPUT_INVALID");
    if(this.active>=MAX_CONCURRENT)fail("HISTORY_CAPACITY");
    this.active++;
    const deadline=performance.now()+timeoutMs;
    let client:PoolClient|undefined,released=false,begun=false,expired=false,destroy=false;
    let borrowing:Promise<PoolClient>|undefined,borrowSettled=false;
    const passive=()=>undefined;
    let rejectDeadline!:(error:Error)=>void;
    const timeout=new Promise<never>((_resolve,reject)=>{rejectDeadline=reject;});
    const timer=setTimeout(()=>{expired=true;destroy=true;
      if(client&&!released){released=true;client.release(true);}
      rejectDeadline(new ManagerScoreHistoryStoreError("HISTORY_TIME_LIMIT"));
    },timeoutMs);
    const run=async<R>(pending:Promise<R>):Promise<R>=>{
      const result=await Promise.race([pending,timeout]);
      if(expired||performance.now()>=deadline)fail("HISTORY_TIME_LIMIT");return result;
    };
    try{
      borrowing=this.pool.connect().then(value=>{
        borrowSettled=true;
        value.on("error",passive);
        if(expired){value.release(true);fail("HISTORY_TIME_LIMIT");}
        // Assign before run()'s post-await clock check so a just-late borrow
        // is still released even when the timer callback has not fired yet.
        client=value;return value;
      },error=>{borrowSettled=true;throw error;});
      client=await run(borrowing);
      const query=async<R extends QueryResultRow=QueryResultRow>(sql:string,values:unknown[]=[]):Promise<R[]>=>{
        if(performance.now()>=deadline)fail("HISTORY_TIME_LIMIT");
        return (await run(client!.query<R>(sql,values))).rows;
      };
      await query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");begun=true;
      await query("SELECT set_config('statement_timeout',$1,true),set_config('lock_timeout',$1,true)",
        [String(Math.max(1,Math.floor(deadline-performance.now())))+"ms"]);
      const result=await body(query);
      await query("COMMIT");begun=false;return result;
    }catch(error){
      if(client&&!released&&begun&&!expired){
        try{await run(client.query("ROLLBACK"));begun=false;}catch{destroy=true;}
      }
      if(error instanceof ManagerScoreHistoryStoreError)throw error;
      const code=error&&typeof error==="object"&&"code"in error?error.code:null;
      if(expired||code==="57014"||code==="55P03")fail("HISTORY_TIME_LIMIT");
      return fail("HISTORY_UNAVAILABLE");
    }finally{
      clearTimeout(timer);
      // A timed-out caller must not free admission while its physical pool
      // borrow is still pending. Late acquisition is destroyed above; at most
      // four outstanding borrows survive the caller's response deadline.
      if(borrowSettled||!borrowing)this.active--;
      else void borrowing.then(()=>{this.active--;},()=>{this.active--;});
      if(client&&!released){released=true;client.release(destroy||begun);if(!destroy&&!begun)client.removeListener("error",passive);}
    }
  }
  private async inventory(d:ManagerModelDocument,query:<R extends QueryResultRow=QueryResultRow>(sql:string,values?:unknown[])=>Promise<R[]>):Promise<Inventory>{
    const args=prefix(d);
    const sources=await query<{payload_digest:string}>("SELECT payload_digest FROM execution_manager_model_revisions WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 AND revision=$4",args);
    if(sources.length!==1||sources[0].payload_digest!==accessDigest(d))fail("HISTORY_SOURCE_CHANGED");
    // ALL138 kinds consume the one shared supported bound, before payload decode.
    const usage=(await query<{count:string;bytes:string}>("SELECT count(*)::text AS count,COALESCE(sum(octet_length(payload::text)),0)::text AS bytes FROM execution_manager_calculation_revisions WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 AND source_revision=$4",args))[0];
    if(!usage||!/^\d+$(?![\s\S])/.test(usage.count)||!/^\d+$(?![\s\S])/.test(usage.bytes))fail("HISTORY_DATA_INVALID");
    if(BigInt(usage.count)>BigInt(MAX_ROWS)||BigInt(usage.bytes)>BigInt(MAX_BYTES))fail("HISTORY_CAPACITY");
    const rows=await query<Meta>("SELECT calculation_key,payload_digest,octet_length(payload::text)::text AS bytes,payload->>'schema_version' AS schema_version FROM execution_manager_calculation_revisions WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 AND source_revision=$4 ORDER BY calculation_key",args);
    if(rows.length!==Number(usage.count)||rows.some(r=>!finiteDigest(r.calculation_key)||!finiteDigest(r.payload_digest)||
      !/^\d+$(?![\s\S])/.test(r.bytes)||BigInt(r.bytes)>16n*1024n*1024n))fail("HISTORY_DATA_INVALID");
    // Known legacy v1 is not a RESTATED item but still consumes the shared
    // budget. A newer/unknown mode cannot be erased into a complete empty list.
    if(rows.some(r=>!["portal.execution.manager-score-recalculation.v1","portal.execution.manager-score-original-inputs.v1",
      "portal.execution.manager-score-original-inputs.v2","portal.execution.manager-score-original-inputs.v3",
      "portal.execution.manager-score-restatement.v1","portal.execution.manager-score-restatement.v2"].includes(r.schema_version??"")))fail("HISTORY_SCHEMA_UNSUPPORTED");
    const heads=await query<Head>("SELECT head_kind,calculation_key FROM execution_manager_score_mode_heads WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 AND source_revision=$4 ORDER BY head_kind",args);
    if(heads.length>2||new Set(heads.map(h=>h.head_kind)).size!==heads.length||heads.some(h=>
      !["ORIGINAL_INPUTS","RESTATED_CURRENT_POLICY"].includes(h.head_kind)||!finiteDigest(h.calculation_key)||!rows.some(r=>r.calculation_key===h.calculation_key)))fail("HISTORY_DATA_INVALID");
    return {rows,heads,source_digest:sources[0].payload_digest,signature:accessDigest({source:sources[0].payload_digest,rows,heads})};
  }
  async scan(document:ManagerModelDocument,timeoutMs:number):Promise<ManagerScoreHistorySnapshot>{
    const d=expected(document);
    return this.read(timeoutMs,async query=>{
      const inventory=await this.inventory(d,query),args=prefix(d);
      // Confirm the ACTUAL135 JSON/digest, not a caller wrapper with a claimed pin.
      const actual=(await query<{payload:unknown;payload_digest:string}>("SELECT payload,payload_digest FROM execution_manager_model_revisions WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 AND revision=$4",args))[0];
      if(!actual)fail("HISTORY_SOURCE_CHANGED");
      let source:ManagerModelDocument;
      try{source=expected(actual.payload as ManagerModelDocument);}catch{fail("HISTORY_DATA_INVALID");}
      if(accessDigest(source)!==actual.payload_digest||actual.payload_digest!==inventory.source_digest)fail("HISTORY_SOURCE_CHANGED");
      const originalKey=inventory.heads.find(h=>h.head_kind==="ORIGINAL_INPUTS")?.calculation_key??null;
      const restatedKey=inventory.heads.find(h=>h.head_kind==="RESTATED_CURRENT_POLICY")?.calculation_key??null;
      const originals=inventory.rows.filter(r=>r.schema_version==="portal.execution.manager-score-original-inputs.v1"||
        r.schema_version==="portal.execution.manager-score-original-inputs.v2"||r.schema_version==="portal.execution.manager-score-original-inputs.v3");
      const isRestated=(r:Meta)=>r.schema_version==="portal.execution.manager-score-restatement.v1"||
        r.schema_version==="portal.execution.manager-score-restatement.v2";
      const calculations=inventory.rows.filter(isRestated);
      if(originals.length!==(originalKey===null?0:1)||originalKey!==null&&originals[0]?.calculation_key!==originalKey||
        calculations.length>0&&originalKey===null)fail("HISTORY_DATA_INVALID");
      const selected=inventory.rows.filter(r=>r.calculation_key===originalKey||isRestated(r));
      const stored=selected.length?await query<Stored>("SELECT calculation_key,payload_digest,payload FROM execution_manager_calculation_revisions WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 AND source_revision=$4 AND calculation_key=ANY($5::text[]) ORDER BY calculation_key",[...args,selected.map(r=>r.calculation_key)]):[];
      if(stored.length!==selected.length)fail("HISTORY_DATA_INVALID");
      let original:ManagerScoreOriginalCustodySnapshot|null=null,restatements:ManagerScoreRestatementSnapshot[]=[];
      try{
        if(originalKey!==null){const row=stored.find(r=>r.calculation_key===originalKey);if(!row)fail("HISTORY_DATA_INVALID");
          original=decodeRetainedManagerScoreOriginal(source,row,MAX_BUNDLE);}
        if(original)restatements=calculations.map(meta=>{
          const row=stored.find(r=>r.calculation_key===meta.calculation_key);if(!row)fail("HISTORY_DATA_INVALID");
          return decodeRetainedManagerScoreRestatement(row,original!,MAX_BUNDLE,source);
        });
        lineage(restatements,restatedKey);
      }catch{fail("HISTORY_DATA_INVALID");}
      const result:ManagerScoreHistorySnapshot=freeze({document:source,original,restatements,
        original_head_key:originalKey,restated_head_key:restatedKey,snapshot_digest:inventory.signature});
      snapshots.set(result,{owner:this,prefix:JSON.stringify(args),signature:inventory.signature,source_digest:inventory.source_digest});
      return result;
    });
  }
  async unchanged(document:ManagerModelDocument,snapshot:ManagerScoreHistorySnapshot,timeoutMs:number):Promise<boolean>{
    const d=expected(document),proof=snapshots.get(snapshot);
    if(!proof||proof.owner!==this||proof.prefix!==JSON.stringify(prefix(d))||proof.source_digest!==accessDigest(d))fail("HISTORY_SNAPSHOT_REQUIRED");
    return this.read(timeoutMs,async query=>(await this.inventory(d,query)).signature===proof.signature);
  }
}
