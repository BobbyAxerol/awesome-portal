/** Local immutable custody with tenant, completed-run and live-ingress authority. */
import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { Pool,PoolClient } from "pg";
import { CONTROL_API_POOL } from "../tokens";
import { RESEARCH_DB_BUDGET,RESEARCH_DB_RUNTIME_ROLE,type ResearchScope } from "./contracts";
import { acquireResearchPoolClient,BoundedResearchReadAdmission } from "./bounded-read";
import { retainedExposureAuthority } from "./retained-exposure";
import { canonicalResearchJson,sha256ResearchJson } from "./preflight.service";
import { ResearchReplayError } from "./replay.error";
import { ResearchCurrentSourceError } from "./current-source.error";
import { WindowExecutionManifestSchema,WindowExecutionRowSchema,type WindowExecutionManifest,type WindowExecutionRow,
  type WindowExecutionQuery,type WindowExecutionBatch,type WindowExecutionSeal } from "./window-execution.contract";

const unavailable=()=>new ResearchReplayError("RESEARCH_REPLAY_UNAVAILABLE","Retained window or execution evidence is unavailable.",503);
const conflict=()=>new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_CONFLICT","Window execution custody conflicts with its exact P05 seal.",409);
const object=(v:unknown):any=>typeof v==="string"?JSON.parse(v):v;
export interface WindowRead {manifest:WindowExecutionManifest|null;revision:string|null;rows:WindowExecutionRow[];matching:number|null;hasMore:boolean;pending:boolean;}
@Injectable()
export class ResearchWindowExecutionRepository {
  private readonly admission=new BoundedResearchReadAdmission({maximumActive:2,maximumQueued:18,
    waitTimeoutMs:RESEARCH_DB_BUDGET.boundedReadQueueWaitMs,unavailable});
  constructor(@Inject(CONTROL_API_POOL) private readonly pool:Pool){}
  async append(scope:ResearchScope,input:WindowExecutionBatch) {
    return this.transaction(scope,false,async c=>{
      await this.authority(c,scope,input);
      const m=input.manifest,args=[scope.workspaceId,input.run_id,m.artifact_revision];
      const prior=await c.query(`SELECT companion_digest,batch_digest,start_ordinal,row_count FROM research.window_execution_batches_v1
        WHERE workspace_id=$1 AND run_id=$2 AND artifact_revision=$3 AND batch_ordinal=$4`,[...args,input.batch_ordinal]);
      if(prior.rowCount) {
        const p=prior.rows[0];
        if(p.companion_digest!==input.companion_digest||p.batch_digest!==input.batch_digest||Number(p.start_ordinal)!==input.start_ordinal||Number(p.row_count)!==input.rows.length)throw conflict();
        return {replayed:true};
      }
      await c.query(`INSERT INTO research.window_execution_batches_v1(workspace_id,run_id,artifact_revision,artifact_id,companion_digest,batch_ordinal,start_ordinal,row_count,batch_digest)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[...args,m.artifact_id,input.companion_digest,input.batch_ordinal,input.start_ordinal,input.rows.length,input.batch_digest]);
      await c.query(`INSERT INTO research.window_execution_rows_v1(workspace_id,run_id,artifact_revision,companion_digest,batch_ordinal,source_ordinal,kind,window_kind,fold_id,at_utc_ms,payload)
        SELECT $1,$2,$3,$4,$5,(r->>'source_ordinal')::integer,r->>'kind',r->>'window',r->>'fold_id',(r->>'at_utc_ms')::bigint,r FROM jsonb_array_elements($6::jsonb) r`,
        [...args,input.companion_digest,input.batch_ordinal,JSON.stringify(input.rows)]);
      return {replayed:false};
    });
  }
  /**
   * Seal the companion. The whole-companion verification is O(rows) (a 46k-row Walk-forward companion is ~230 batches), so it must NOT run
   * inside the authority transaction: `authority()` holds an advisory lock and `FOR UPDATE`/`FOR SHARE` on the producer, job and worker-attempt
   * rows, and those rows are the worker's lease heartbeat and its terminal write. Held for seconds they made the heartbeat and the worker's
   * own failure write hit the 500 ms lock timeout, and made the worker's retry of this same call collide with the advisory lock (503 ×3)
   * although the first call went on to commit the seal. Rows and batches are append-only and sealed against further inserts (migration 116),
   * so the verification is done in a lock-free read-only snapshot first, and the short write transaction only re-takes the authority, checks
   * that the batches are exactly the ones that were verified, and inserts the seal (whose own DB guard re-checks the finalization binding).
   */
  async seal(scope:ResearchScope,input:WindowExecutionSeal) {
    const m=input.manifest,args=[scope.workspaceId,input.run_id,m.artifact_revision];
    const priorSql=`SELECT companion_digest FROM research.window_execution_seals_v1 WHERE workspace_id=$1 AND run_id=$2 AND artifact_revision=$3`;
    const verified=await this.transaction(scope,true,async c=>{
      const prior=await c.query(priorSql,args);
      if(prior.rowCount) {if(prior.rows[0].companion_digest!==input.companion_digest)throw conflict();return null;}
      return this.verifyBatches(c,args,input);
    });
    return this.transaction(scope,false,async c=>{
      await this.authority(c,scope,input);
      const prior=await c.query(priorSql,args);
      if(prior.rowCount) {if(prior.rows[0].companion_digest!==input.companion_digest)throw conflict();return {replayed:true};}
      if(verified===null)throw unavailable();
      const now=await this.batchSummary(c,args);
      /* A different batch set than the one verified (an append between the two transactions) is a transient: the caller retries the whole seal. */
      if(now.batches!==verified.batches||now.rows!==verified.rows||now.lastDigest!==verified.lastDigest)throw unavailable();
      await c.query(`INSERT INTO research.window_execution_seals_v1(workspace_id,run_id,artifact_revision,artifact_id,companion_digest,manifest) VALUES($1,$2,$3,$4,$5,$6::jsonb)`,
        [...args,m.artifact_id,input.companion_digest,JSON.stringify(m)]);
      return {replayed:false};
    });
  }
  private async batchSummary(c:PoolClient,args:unknown[]):Promise<{batches:number;rows:number;lastDigest:string|null}> {
    const r=await c.query(`SELECT count(*)::int AS n,COALESCE(sum(row_count),0)::bigint AS rows,
        (SELECT batch_digest FROM research.window_execution_batches_v1 WHERE workspace_id=$1 AND run_id=$2 AND artifact_revision=$3 ORDER BY batch_ordinal DESC LIMIT 1) AS last_digest
      FROM research.window_execution_batches_v1 WHERE workspace_id=$1 AND run_id=$2 AND artifact_revision=$3`,args);
    return {batches:Number(r.rows[0].n),rows:Number(r.rows[0].rows),lastDigest:r.rows[0].last_digest??null};
  }
  /** The exact verification the seal always did (chain, digests, windows, counts), without taking any lock. Returns the batch summary it verified. */
  private async verifyBatches(c:PoolClient,args:unknown[],input:WindowExecutionSeal):Promise<{batches:number;rows:number;lastDigest:string|null}> {
    const m=input.manifest;
    const batches=await c.query(`SELECT batch_ordinal,start_ordinal,row_count,batch_digest,companion_digest FROM research.window_execution_batches_v1
      WHERE workspace_id=$1 AND run_id=$2 AND artifact_revision=$3 ORDER BY batch_ordinal LIMIT 200001`,args);
    let ordinal=0;const hash=createHash("sha256").update("[");
    const counts={OBSERVATION:0,ANALYTICS:0,EXECUTION:0};
    const scopes=new Map<string,{observations:number;analyses:number;previous:number|null}>();
    for(const [i,b]of batches.rows.entries()) {
      if(Number(b.batch_ordinal)!==i||Number(b.start_ordinal)!==ordinal||b.companion_digest!==input.companion_digest)throw conflict();
      const fetched=await c.query(`SELECT payload FROM research.window_execution_rows_v1 WHERE workspace_id=$1 AND run_id=$2 AND artifact_revision=$3 AND batch_ordinal=$4 ORDER BY source_ordinal LIMIT 201`,[...args,i]);
      const rows=fetched.rows.map(r=>WindowExecutionRowSchema.parse(object(r.payload)));
      if(rows.length!==Number(b.row_count)||sha256ResearchJson(rows)!==b.batch_digest)throw conflict();
      for(const r of rows) {
        if(r.source_ordinal!==ordinal)throw conflict();
        const d=m.source.windows.find(w=>w.window===r.window&&w.fold_id===r.fold_id);
        if(!d||d.availability.state!=="AVAILABLE")throw conflict();
        const key=`${r.window}:${r.fold_id}`,s=scopes.get(key)??{observations:0,analyses:0,previous:null};
        if(r.at_utc_ms!==null&&(r.at_utc_ms<d.start_utc_ms!||r.at_utc_ms>=d.end_exclusive_utc_ms!))throw conflict();
        if(r.kind==="OBSERVATION") {if(s.previous!==null&&r.at_utc_ms<=s.previous)throw conflict();s.previous=r.at_utc_ms;s.observations++;}
        if(r.kind==="ANALYTICS") {
          if(r.payload.window!==r.window||r.payload.fold_id!==r.fold_id||r.payload.observation_count!==d.observation_count
            ||r.payload.start_utc_ms!==d.start_utc_ms||r.payload.end_exclusive_utc_ms!==d.end_exclusive_utc_ms)throw conflict();
          s.analyses++;
        }
        scopes.set(key,s);counts[r.kind]++;
        if(ordinal>0)hash.update(",");hash.update(canonicalResearchJson(r));ordinal++;
      }
    }
    if(ordinal!==m.source.row_count||hash.update("]").digest("hex")!==m.source.rows_digest
      ||Object.entries(counts).some(([k,v])=>v!==m.source.counts[k as keyof typeof counts])
      ||m.source.windows.some(w=>w.availability.state==="AVAILABLE"&&(scopes.get(`${w.window}:${w.fold_id}`)?.observations!==w.observation_count||scopes.get(`${w.window}:${w.fold_id}`)?.analyses!==1)))throw conflict();
    return {batches:batches.rows.length,rows:ordinal,lastDigest:batches.rows.length?String(batches.rows[batches.rows.length-1].batch_digest):null};
  }
  async page(scope:ResearchScope,runId:string,query:WindowExecutionQuery,kind:"OBSERVATION"|"ANALYTICS"|"EXECUTION",
    after:(revision:string|null)=>number|undefined,signal?:AbortSignal):Promise<WindowRead> {
    const release=await this.admission.acquire(signal);
    try{return await this.transaction(scope,true,async c=>{
      const run=await c.query(`SELECT r.state,EXISTS(SELECT 1 FROM research.run_producers p
        JOIN research.jobs j ON j.workspace_id=p.workspace_id AND j.job_id=p.job_id
          AND j.current_worker_attempt_id=p.worker_attempt_id AND j.current_lease_epoch=p.lease_epoch
        JOIN research.run_progress_snapshots s ON s.workspace_id=p.workspace_id AND s.run_id=p.run_id AND s.worker_attempt_id=p.worker_attempt_id
        JOIN research.run_terminal_materializations_v1 t ON t.workspace_id=s.workspace_id AND t.run_id=s.run_id
          AND t.worker_attempt_id=s.worker_attempt_id AND t.source_sequence=s.source_latest_sequence
        JOIN research.run_progress_events e ON e.workspace_id=s.workspace_id AND e.run_id=s.run_id
          AND e.worker_attempt_id=s.worker_attempt_id AND e.source_sequence=s.source_latest_sequence
        WHERE p.workspace_id=r.workspace_id AND p.run_id=r.run_id AND p.dispatch_state='DISPATCHED'
          AND j.state='SUCCEEDED' AND s.snapshot->>'status'='COMPLETED' AND e.event_type='run_completed') AS completed
        FROM research.runs r WHERE r.workspace_id=$1 AND r.run_id=$2`,[scope.workspaceId,runId]);
      if(!run.rowCount)throw new ResearchReplayError("RESEARCH_REPLAY_NOT_FOUND","Research run was not found.",404);
      if(run.rows[0].completed!==true){after(null);return {manifest:null,revision:null,rows:[],matching:null,hasMore:false,pending:true};}
      const result=await c.query(`WITH latest AS (SELECT artifact_id,artifact_revision,manifest_digest,worker_attempt_id,lease_epoch,workspace_id,run_id
        FROM research.artifacts WHERE workspace_id=$1 AND run_id=$2 AND state='SEALED' ORDER BY artifact_revision DESC LIMIT 1)
        SELECT a.artifact_id,a.artifact_revision,a.manifest_digest,s.companion_digest,s.manifest,
        p.requested_spec_digest,p.effective_spec_digest,p.dataset_binding_digest,p.execution_profile_id,p.execution_profile_digest
        FROM latest a LEFT JOIN research.run_producers p ON p.workspace_id=a.workspace_id AND p.run_id=a.run_id
          AND p.worker_attempt_id=a.worker_attempt_id AND p.lease_epoch=a.lease_epoch
        LEFT JOIN research.window_execution_seals_v1 s ON s.workspace_id=a.workspace_id AND s.run_id=a.run_id AND s.artifact_revision=a.artifact_revision AND s.artifact_id=a.artifact_id
        `,[scope.workspaceId,runId]);
      const binding=result.rows[0];
      if(!binding?.manifest){after(null);return {manifest:null,revision:null,rows:[],matching:null,hasMore:false,pending:false};}
      if(result.rows.length>1&&Number(result.rows[1].artifact_revision)===Number(binding.artifact_revision))throw unavailable();
      const manifest=WindowExecutionManifestSchema.parse(object(binding.manifest)),revision=binding.companion_digest;
      if(sha256ResearchJson(manifest)!==revision||manifest.workspace_id!==scope.workspaceId||manifest.run_id!==runId
        ||manifest.artifact_revision!==Number(binding.artifact_revision)
        ||["artifact_id","manifest_digest","requested_spec_digest","effective_spec_digest","dataset_binding_digest","execution_profile_id","execution_profile_digest"].some(k=>manifest[k as keyof WindowExecutionManifest]!==binding[k]))throw unavailable();
      const boundary=after(revision),d=manifest.source.windows.find(w=>w.window===query.window&&w.fold_id===(query.fold_id??null));
      if(!d||d.availability.state!=="AVAILABLE")return {manifest,revision,rows:[],matching:null,hasMore:false,pending:false};
      const args=[scope.workspaceId,runId,manifest.artifact_revision,kind,query.window,query.fold_id??null,query.at_utc_ms??null,query.record_kind??null];
      const where=`workspace_id=$1 AND run_id=$2 AND artifact_revision=$3 AND kind=$4 AND window_kind=$5 AND fold_id IS NOT DISTINCT FROM $6
        AND ($7::bigint IS NULL OR at_utc_ms=$7) AND ($8::text IS NULL OR payload->'payload'->>'record_kind'=$8)`;
      const total=await c.query(`SELECT count(*) AS n FROM research.window_execution_rows_v1 WHERE ${where}`,args);
      const page=await c.query(`SELECT payload FROM research.window_execution_rows_v1 WHERE ${where}
        AND($9::integer IS NULL OR source_ordinal>$9) ORDER BY source_ordinal LIMIT $10`,[...args,boundary??null,query.limit+1]);
      const rows=page.rows.map(r=>WindowExecutionRowSchema.parse(object(r.payload)));
      if(rows.some(r=>r.kind!==kind||r.window!==query.window||r.fold_id!==(query.fold_id??null)))throw unavailable();
      if(kind==="OBSERVATION"&&query.at_utc_ms===undefined&&Number(total.rows[0].n)!==d.observation_count)throw unavailable();
      return {manifest,revision,rows:rows.slice(0,query.limit),matching:Number(total.rows[0].n),hasMore:rows.length>query.limit,pending:false};
    },signal);}finally{release();}
  }
  async correlation(scope:ResearchScope,manifests:[WindowExecutionManifest,WindowExecutionManifest],query:WindowExecutionQuery,signal?:AbortSignal){
    const release=await this.admission.acquire(signal);
    try{return await this.transaction(scope,true,async c=>{
      const [left,right]=manifests;
      const result=await c.query(`SELECT count(*)::integer AS n,
        corr((l.payload->'payload'->>'return_fraction')::double precision,(r.payload->'payload'->>'return_fraction')::double precision) AS value
        FROM research.window_execution_rows_v1 l JOIN research.window_execution_rows_v1 r
          ON r.workspace_id=l.workspace_id AND r.run_id=$3 AND r.artifact_revision=$5
          AND r.kind='OBSERVATION' AND r.window_kind=l.window_kind AND r.fold_id IS NOT DISTINCT FROM l.fold_id AND r.at_utc_ms=l.at_utc_ms
        WHERE l.workspace_id=$1 AND l.run_id=$2 AND l.artifact_revision=$4 AND l.kind='OBSERVATION'
          AND l.window_kind=$6 AND l.fold_id IS NOT DISTINCT FROM $7`,
        [scope.workspaceId,left.run_id,right.run_id,left.artifact_revision,right.artifact_revision,query.window,query.fold_id??null]);
      return {matched:Number(result.rows[0].n),value:result.rows[0].value===null?null:Number(result.rows[0].value)};
    },signal);}finally{release();}
  }
  private async authority(c:PoolClient,scope:ResearchScope,input:WindowExecutionBatch|WindowExecutionSeal) {
    const m=input.manifest;
    await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`window-execution:${scope.workspaceId}:${input.run_id}:${m.artifact_revision}`]);
    await retainedExposureAuthority(c,scope,input.run_id,{workerAttemptId:input.worker_attempt_id,leaseEpoch:input.lease_epoch});
    const a=object(input.artifact_manifest_json),source=object(input.source_document_json);
    if(createHash("sha256").update(input.artifact_manifest_json).digest("hex")!==m.manifest_digest||sha256ResearchJson(source)!==sha256ResearchJson(m.source)
      ||a.workspace_id!==scope.workspaceId||a.run_id!==input.run_id||a.artifact_id!==m.artifact_id||a.artifact_revision!==m.artifact_revision
      ||a.worker_attempt_id!==input.worker_attempt_id||a.lease_epoch!==input.lease_epoch)throw conflict();
    const doc=a.documents?.find((d:any)=>d.name==="window_execution_source");
    if(!doc||doc.sha256!==createHash("sha256").update(input.source_document_json).digest("hex")||doc.bytes!==Buffer.byteLength(input.source_document_json))throw conflict();
    const bound=await c.query(`SELECT a.manifest_digest,p.requested_spec_digest,p.effective_spec_digest,p.dataset_binding_digest,p.execution_profile_id,p.execution_profile_digest
      FROM research.artifacts a JOIN research.run_producers p ON p.workspace_id=a.workspace_id AND p.run_id=a.run_id
        AND p.worker_attempt_id=a.worker_attempt_id AND p.lease_epoch=a.lease_epoch
      WHERE a.workspace_id=$1 AND a.artifact_id=$2 AND a.run_id=$3 AND a.artifact_revision=$4 AND a.state='SEALED'
        AND a.worker_attempt_id=$5 AND a.lease_epoch=$6 AND p.job_id=$7 FOR SHARE OF a`,
      [scope.workspaceId,m.artifact_id,input.run_id,m.artifact_revision,input.worker_attempt_id,input.lease_epoch,input.job_id]);
    if(bound.rowCount!==1||["manifest_digest","requested_spec_digest","effective_spec_digest","dataset_binding_digest","execution_profile_id","execution_profile_digest"].some(k=>m[k as keyof WindowExecutionManifest]!==bound.rows[0][k]))throw conflict();
    const table=a.tables?.find((t:any)=>t.table_kind==="window_execution");
    if(!table||table.schema_version!=="research.window-execution-table.v1"||table.rows!==m.source.row_count)throw conflict();
    const parts=await c.query(`SELECT part_ordinal,part_digest,row_count,byte_count,relative_path,schema_version FROM research.artifact_parts
      WHERE workspace_id=$1 AND artifact_id=$2 AND table_kind='window_execution' ORDER BY part_ordinal LIMIT 129`,[scope.workspaceId,m.artifact_id]);
    if(parts.rows.length!==table.parts.length||parts.rows.some((p,i)=>{const t=table.parts[i];return Number(p.part_ordinal)!==t.part_ordinal||p.part_digest!==t.sha256||Number(p.row_count)!==t.rows
      ||Number(p.byte_count)!==t.bytes||p.relative_path!==t.relative_path||p.schema_version!==table.schema_version;}))throw conflict();
  }
  private async transaction<T>(scope:ResearchScope,readOnly:boolean,work:(c:PoolClient)=>Promise<T>,signal?:AbortSignal):Promise<T> {
    const c=await acquireResearchPoolClient(this.pool.connect(),RESEARCH_DB_BUDGET.boundedReadAcquireTimeoutMs,unavailable,signal);let began=false;
    try {
      await c.query(readOnly?"BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY":"BEGIN");began=true;
      await c.query(`SET LOCAL ROLE ${RESEARCH_DB_RUNTIME_ROLE}`);
      await c.query(`SELECT set_config('statement_timeout',$1,true),set_config('lock_timeout',$2,true),set_config('idle_in_transaction_session_timeout',$3,true),
        set_config('research.workspace_id',$4,true),set_config('research.actor_user_id',$5,true)`,[`${RESEARCH_DB_BUDGET.statementTimeoutMs}ms`,`${RESEARCH_DB_BUDGET.lockTimeoutMs}ms`,
        `${RESEARCH_DB_BUDGET.idleTransactionTimeoutMs}ms`,scope.workspaceId,scope.actorUserId]);
      const member=await c.query("SELECT 1 FROM workspace_members WHERE workspace_id=$1 AND user_id=$2",[scope.workspaceId,scope.actorUserId]);
      if(!member.rowCount)throw new ResearchReplayError("RESEARCH_REPLAY_NOT_FOUND","Research workspace was not found.",404);
      const value=await work(c);if(signal?.aborted)throw unavailable();await c.query("COMMIT");return value;
    }catch(e){if(began)await c.query("ROLLBACK").catch(()=>undefined);if(e instanceof ResearchReplayError||e instanceof ResearchCurrentSourceError)throw e;const error=unavailable();(error as any).cause=e;throw error;}
    finally{c.release();}
  }
}
