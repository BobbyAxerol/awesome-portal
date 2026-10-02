/** Immutable P05-bound fixed OOS observations. No engine/filesystem reads. */
import { Inject, Injectable } from "@nestjs/common";
import type { Pool, PoolClient } from "pg";
import { CONTROL_API_POOL } from "../tokens";
import { acquireResearchPoolClient, BoundedResearchReadAdmission } from "./bounded-read";
import { RESEARCH_DB_BUDGET, RESEARCH_DB_RUNTIME_ROLE, type ResearchScope } from "./contracts";
import { ResearchCurrentSourceError } from "./current-source.error";
import { ResearchReplayError } from "./replay.error";
import { retainedExposureAuthority } from "./retained-exposure";
import { sha256ResearchJson } from "./preflight.service";
import { FixedReplayCompanionBatchIngressSchema, FixedReplayCompanionSealIngressSchema,
  FixedReplayCompanionManifestSchema, FixedReplayCompanionRowSchema, fixedReplayCustodyProof, isFixedReplayProfile,
  type FixedReplayCompanionBatchIngress, type FixedReplayCompanionSealIngress,
  type FixedReplayCompanionManifest, type FixedReplayCompanionQuery, type FixedReplayCompanionRow,
} from "./fixed-replay-companion.contract";

const conflict=()=>new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_CONFLICT","Fixed OOS custody conflicts with its immutable P05 source.",409);
const unavailable=()=>new ResearchReplayError("RESEARCH_REPLAY_UNAVAILABLE","Retained fixed OOS observations are unavailable.",503);
const object=(v:unknown)=>typeof v==="string" ? JSON.parse(v) : v;
export interface FixedReplayCompanionRead {
  manifest:FixedReplayCompanionManifest|null;revision:string|null;rows:FixedReplayCompanionRow[];
  hasMore:boolean;matchingFilter:number|null;pending:boolean;executionProfile:{id:string|null;digest:string|null};
}
@Injectable()
export class ResearchFixedReplayCompanionRepository {
  private readonly admission=new BoundedResearchReadAdmission({maximumActive:2,maximumQueued:18,
    waitTimeoutMs:RESEARCH_DB_BUDGET.boundedReadQueueWaitMs,unavailable});
  constructor(@Inject(CONTROL_API_POOL) private readonly pool:Pool) {}

  async append(scope:ResearchScope,raw:FixedReplayCompanionBatchIngress) {
    const parsed=FixedReplayCompanionBatchIngressSchema.safeParse(raw);
    if(!parsed.success) throw conflict();
    const input=parsed.data;
    return this.transaction(scope,false,async client=>{
      await this.authorizeWrite(client,scope,input);
      const args=[scope.workspaceId,input.run_id,input.artifact_revision];
      const prior=await client.query(`SELECT companion_digest,batch_digest,row_count FROM research.fixed_replay_companion_batches_v1
        WHERE workspace_id=$1 AND run_id=$2 AND artifact_revision=$3 AND batch_ordinal=$4`,[...args,input.batch_ordinal]);
      if(prior.rowCount) {
        const row=prior.rows[0];
        if(row.companion_digest!==input.companion_digest || row.batch_digest!==input.batch_digest || Number(row.row_count)!==input.rows.length) throw conflict();
        return {replayed:true};
      }
      const custody=await client.query(`SELECT companion_digest FROM research.fixed_replay_companion_batches_v1
        WHERE workspace_id=$1 AND run_id=$2 AND artifact_revision=$3 LIMIT 1`,args);
      if(custody.rowCount && custody.rows[0].companion_digest!==input.companion_digest) throw conflict();
      await client.query(`INSERT INTO research.fixed_replay_companion_batches_v1
        (workspace_id,run_id,artifact_revision,artifact_id,companion_digest,batch_ordinal,batch_digest,row_count,manifest)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,[...args,input.artifact_id,input.companion_digest,
        input.batch_ordinal,input.batch_digest,input.rows.length,JSON.stringify(input.manifest)]);
      await client.query(`INSERT INTO research.fixed_replay_companion_rows_v1
        (workspace_id,run_id,artifact_revision,companion_digest,batch_ordinal,source_ordinal,at_utc_ms,payload)
        SELECT $1,$2,$3,$4,$5,(r->>'source_ordinal')::integer,(r->>'at_utc_ms')::bigint,r
        FROM jsonb_array_elements($6::jsonb) r`,[...args,input.companion_digest,input.batch_ordinal,JSON.stringify(input.rows)]);
      return {replayed:false};
    });
  }

  async seal(scope:ResearchScope,raw:FixedReplayCompanionSealIngress) {
    const parsed=FixedReplayCompanionSealIngressSchema.safeParse(raw);
    if(!parsed.success) throw conflict();
    const input=parsed.data;
    return this.transaction(scope,false,async client=>{
      const symbol=await this.authorizeWrite(client,scope,input);
      const args=[scope.workspaceId,input.run_id,input.artifact_revision];
      const prior=await client.query(`SELECT companion_digest FROM research.fixed_replay_companion_seals_v1
        WHERE workspace_id=$1 AND run_id=$2 AND artifact_revision=$3`,args);
      if(prior.rowCount) {
        if(prior.rows[0].companion_digest!==input.companion_digest) throw conflict();
        return {replayed:true};
      }
      const batches=await client.query(`SELECT companion_digest,batch_ordinal,batch_digest,row_count,manifest
        FROM research.fixed_replay_companion_batches_v1 WHERE workspace_id=$1 AND run_id=$2 AND artifact_revision=$3
        ORDER BY batch_ordinal LIMIT 101`,args);
      const records=await client.query(`SELECT payload FROM research.fixed_replay_companion_rows_v1
        WHERE workspace_id=$1 AND run_id=$2 AND artifact_revision=$3 ORDER BY source_ordinal LIMIT 20001`,args);
      const source=input.manifest.source;
      if(source.state==="NOT_PUBLISHED") {
        if(batches.rows.length || records.rows.length) throw conflict();
      } else {
        const rows=records.rows.map(r=>FixedReplayCompanionRowSchema.parse(object(r.payload)));
        if(rows.length!==source.row_count || sha256ResearchJson(rows)!==source.normalized_rows_sha256
          || rows[0]?.at_utc_ms!==source.first_observed_utc_ms || rows.at(-1)?.at_utc_ms!==source.last_observed_utc_ms
          || rows.some((r,i)=>r.source_ordinal!==i || r.at_utc_ms<source.oos_start_utc_ms || r.at_utc_ms>=source.oos_end_exclusive_utc_ms
            || i>0 && r.at_utc_ms<=rows[i-1]!.at_utc_ms || Object.keys(r.positions).length!==1
            || !(symbol in r.positions) && !("DEFAULT" in r.positions))
          || batches.rows.length!==Math.ceil(source.row_count/200)) throw conflict();
        for(const [i,batch] of batches.rows.entries()) {
          const subset=rows.slice(i*200,i*200+200);
          if(Number(batch.batch_ordinal)!==i || batch.companion_digest!==input.companion_digest
            || sha256ResearchJson(object(batch.manifest))!==input.companion_digest
            || Number(batch.row_count)!==subset.length || batch.batch_digest!==sha256ResearchJson(subset)) throw conflict();
        }
      }
      await client.query(`INSERT INTO research.fixed_replay_companion_seals_v1
        (workspace_id,run_id,artifact_revision,artifact_id,companion_digest,manifest)
        VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,[...args,input.artifact_id,input.companion_digest,JSON.stringify(input.manifest)]);
      return {replayed:false};
    });
  }

  async page(scope:ResearchScope,runId:string,query:FixedReplayCompanionQuery,
    after:(revision:string|null)=>number|undefined,signal?:AbortSignal):Promise<FixedReplayCompanionRead> {
    const release=await this.admission.acquire(signal);
    try {
      return await this.transaction(scope,true,async client=>{
        const run=await client.query(`SELECT producer.execution_profile_id,producer.execution_profile_digest FROM research.runs run
          LEFT JOIN research.run_producers producer ON producer.workspace_id=run.workspace_id AND producer.run_id=run.run_id
          WHERE run.workspace_id=$1 AND run.run_id=$2`,[scope.workspaceId,runId]);
        if(!run.rowCount) throw new ResearchReplayError("RESEARCH_REPLAY_NOT_FOUND","Research run was not found.",404);
        if(run.rowCount!==1) throw unavailable();
        const executionProfile={id:run.rows[0].execution_profile_id ?? null,digest:run.rows[0].execution_profile_digest ?? null};
        if(executionProfile.id!==null && !isFixedReplayProfile(executionProfile.id,executionProfile.digest)) {
          after(null);return {manifest:null,revision:null,rows:[],hasMore:false,matchingFilter:null,pending:false,executionProfile};
        }
        // Choose the immutable artifact before joining an attempt. Never fall
        // back to a different artifact because its producer happens to match.
        const artifacts=await client.query(`SELECT artifact_id,artifact_revision,manifest_digest FROM research.artifacts
          WHERE workspace_id=$1 AND run_id=$2 AND state='SEALED' AND artifact_revision>0
          ORDER BY artifact_revision DESC LIMIT 2`,[scope.workspaceId,runId]);
        const selected=artifacts.rows[0];
        if(artifacts.rows.length>1 && Number(artifacts.rows[1].artifact_revision)===Number(selected.artifact_revision)) throw unavailable();
        if(!selected) {after(null);return {manifest:null,revision:null,rows:[],hasMore:false,matchingFilter:null,pending:false,executionProfile};}
        const result=await client.query(`SELECT seal.companion_digest,seal.manifest,artifact.artifact_id,artifact.artifact_revision,
          artifact.manifest_digest,producer.requested_spec_digest,producer.effective_spec_digest,producer.dataset_binding_digest,
          producer.execution_profile_id,producer.execution_profile_digest,
          EXISTS(SELECT 1 FROM research.fixed_replay_companion_batches_v1 batch
            WHERE batch.workspace_id=artifact.workspace_id AND batch.run_id=artifact.run_id AND batch.artifact_revision=artifact.artifact_revision)
          OR EXISTS(SELECT 1 FROM research.artifact_parts part WHERE part.workspace_id=artifact.workspace_id
            AND part.artifact_id=artifact.artifact_id AND part.table_kind='fixed_replay') AS pending
          FROM research.artifacts artifact JOIN research.run_producers producer
            ON producer.workspace_id=artifact.workspace_id AND producer.run_id=artifact.run_id
            AND producer.worker_attempt_id=artifact.worker_attempt_id AND producer.lease_epoch=artifact.lease_epoch
          LEFT JOIN research.fixed_replay_companion_seals_v1 seal ON seal.workspace_id=artifact.workspace_id
            AND seal.run_id=artifact.run_id AND seal.artifact_revision=artifact.artifact_revision AND seal.artifact_id=artifact.artifact_id
          WHERE artifact.workspace_id=$1 AND artifact.run_id=$2 AND artifact.state='SEALED'
            AND artifact.artifact_id=$3 AND artifact.artifact_revision=$4 AND artifact.manifest_digest=$5`,
          [scope.workspaceId,runId,selected.artifact_id,Number(selected.artifact_revision),selected.manifest_digest]);
        if(result.rowCount!==1) throw unavailable();
        const binding=result.rows[0],manifest=binding?.manifest ? FixedReplayCompanionManifestSchema.parse(object(binding.manifest)) : null;
        const revision=binding?.companion_digest ?? null,boundary=after(revision);
        if(!manifest) return {manifest:null,revision:null,rows:[],hasMore:false,matchingFilter:null,pending:binding?.pending===true,executionProfile};
        const keys=["artifact_id","manifest_digest","requested_spec_digest","effective_spec_digest","dataset_binding_digest","execution_profile_id","execution_profile_digest"] as const;
        if(manifest.workspace_id!==scope.workspaceId || manifest.run_id!==runId || manifest.artifact_revision!==Number(binding.artifact_revision)
          || sha256ResearchJson(manifest)!==revision || keys.some(k=>manifest[k]!==binding[k])) throw unavailable();
        if(executionProfile.id!==manifest.execution_profile_id || executionProfile.digest!==manifest.execution_profile_digest) throw unavailable();
        if(manifest.source.state==="NOT_PUBLISHED") return {manifest,revision,rows:[],hasMore:false,matchingFilter:null,pending:false,executionProfile};
        const source=manifest.source;
        const args=[scope.workspaceId,runId,manifest.artifact_revision,query.source_ordinal ?? null];
        const count=await client.query(`SELECT count(*) AS total,count(*) FILTER(WHERE $4::integer IS NULL OR source_ordinal=$4) AS matching_filter
          FROM research.fixed_replay_companion_rows_v1 WHERE workspace_id=$1 AND run_id=$2 AND artifact_revision=$3`,args);
        if(Number(count.rows[0]?.total)!==source.row_count) throw unavailable();
        const page=await client.query(`SELECT payload FROM research.fixed_replay_companion_rows_v1
          WHERE workspace_id=$1 AND run_id=$2 AND artifact_revision=$3 AND ($4::integer IS NULL OR source_ordinal=$4)
            AND ($5::integer IS NULL OR source_ordinal>$5) ORDER BY source_ordinal LIMIT $6`,[...args,boundary ?? null,query.limit+1]);
        const values=page.rows.map(r=>FixedReplayCompanionRowSchema.parse(object(r.payload)));
        const rows=values.slice(0,query.limit);
        // A hole cannot silently become the next playhead or a shortened final page.
        const start=query.source_ordinal ?? (boundary===undefined ? 0 : boundary+1);
        const expected=query.source_ordinal!==undefined ? Number(query.source_ordinal<source.row_count)
          : Math.min(query.limit+1,Math.max(0,source.row_count-start));
        if(values.length!==expected || values.some((r,i)=>r.source_ordinal!==start+i
          || r.at_utc_ms<source.oos_start_utc_ms || r.at_utc_ms>=source.oos_end_exclusive_utc_ms
          || r.source_ordinal===0 && r.at_utc_ms!==source.first_observed_utc_ms
          || r.source_ordinal===source.row_count-1 && r.at_utc_ms!==source.last_observed_utc_ms
          || i>0 && r.at_utc_ms<=values[i-1]!.at_utc_ms)) throw unavailable();
        return {manifest,revision,rows,hasMore:values.length>query.limit,matchingFilter:Number(count.rows[0].matching_filter),pending:false,executionProfile};
      },signal);
    } finally {release();}
  }

  private async authorizeWrite(client:PoolClient,scope:ResearchScope,input:FixedReplayCompanionSealIngress|FixedReplayCompanionBatchIngress) {
    if(scope.workspaceId!==input.workspace_id) throw conflict();
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`fixed-replay:${scope.workspaceId}:${input.run_id}:${input.artifact_revision}`]);
    await retainedExposureAuthority(client,scope,input.run_id,{workerAttemptId:input.worker_attempt_id,leaseEpoch:input.lease_epoch});
    let proof:ReturnType<typeof fixedReplayCustodyProof>;
    try {proof=fixedReplayCustodyProof(input);} catch {throw conflict();}
    const result=await client.query(`SELECT artifact.artifact_id,artifact.artifact_revision,artifact.manifest_digest,
      producer.requested_spec_digest,producer.effective_spec_digest,producer.dataset_binding_digest,
      producer.execution_profile_id,producer.execution_profile_digest,preflight.requested_spec
      FROM research.artifacts artifact JOIN research.run_producers producer
        ON producer.workspace_id=artifact.workspace_id AND producer.run_id=artifact.run_id
        AND producer.worker_attempt_id=artifact.worker_attempt_id AND producer.lease_epoch=artifact.lease_epoch
      JOIN research.preflight_manifests preflight ON preflight.workspace_id=producer.workspace_id
        AND preflight.preflight_token=producer.preflight_token AND preflight.actor_user_id=producer.actor_user_id
        AND preflight.requested_spec_digest=producer.requested_spec_digest
        AND preflight.effective_spec_digest=producer.effective_spec_digest AND preflight.dataset_binding_digest=producer.dataset_binding_digest
      WHERE artifact.workspace_id=$1 AND artifact.run_id=$2 AND artifact.artifact_id=$3 AND artifact.artifact_revision=$4
        AND artifact.state='SEALED' AND artifact.worker_attempt_id=$5 AND artifact.lease_epoch=$6 AND producer.job_id=$7
      FOR SHARE OF artifact`,[scope.workspaceId,input.run_id,input.artifact_id,input.artifact_revision,input.worker_attempt_id,input.lease_epoch,input.job_id]);
    const binding=result.rows[0],manifest=input.manifest;
    const keys=["manifest_digest","requested_spec_digest","effective_spec_digest","dataset_binding_digest","execution_profile_id","execution_profile_digest"] as const;
    if(result.rowCount!==1 || !binding || !isFixedReplayProfile(binding.execution_profile_id,binding.execution_profile_digest)
      || keys.some(k=>binding[k]!==manifest[k])) throw conflict();
    const spec=object(binding.requested_spec) as any;
    if(spec?.protocol!=="three_window_decay" || spec.execution_route!=="signal_notional" || typeof spec.data?.symbol!=="string"
      || spec.data.symbol!==manifest.market_symbol
      || Date.parse(spec.windows?.oos?.start)!==manifest.source.oos_start_utc_ms
      || Date.parse(spec.windows?.oos?.end_exclusive)!==manifest.source.oos_end_exclusive_utc_ms) throw conflict();
    const retained=await client.query(`SELECT part_ordinal,schema_version,relative_path,part_digest,row_count,byte_count,sequence_min,sequence_max
      FROM research.artifact_parts WHERE workspace_id=$1 AND artifact_id=$2 AND table_kind='fixed_replay'
      ORDER BY part_ordinal LIMIT 101`,[scope.workspaceId,input.artifact_id]);
    const parts=proof.table?.parts ?? [];
    if(retained.rows.length!==parts.length) throw conflict();
    let total=0;
    for(const [i,row] of retained.rows.entries()) {
      const part=parts[i];
      if(Number(row.part_ordinal)!==i+1 || part.part_ordinal!==i+1 || part.table_kind!=="fixed_replay"
        || part.rows!==Math.min(200,input.manifest.source.state==="AVAILABLE" ? input.manifest.source.row_count-i*200 : 0)
        || part.sequence_min!==i*200 || part.sequence_max!==i*200+part.rows-1
        || row.schema_version!==proof.table.schema_version || row.relative_path!==part.relative_path
        || row.part_digest!==part.sha256 || Number(row.row_count)!==part.rows || Number(row.byte_count)!==part.bytes
        || row.sequence_min!==(part.sequence_min==null ? null : String(part.sequence_min))
        || row.sequence_max!==(part.sequence_max==null ? null : String(part.sequence_max))) throw conflict();
      total+=Number(row.row_count);
    }
    if(manifest.source.state==="AVAILABLE" && total!==manifest.source.row_count) throw conflict();
    return spec.data.symbol as string;
  }

  private async transaction<T>(scope:ResearchScope,readOnly:boolean,work:(client:PoolClient)=>Promise<T>,signal?:AbortSignal):Promise<T> {
    const client=await acquireResearchPoolClient(this.pool.connect(),RESEARCH_DB_BUDGET.boundedReadAcquireTimeoutMs,unavailable,signal);
    let began=false;
    try {
      await client.query(readOnly ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY" : "BEGIN");began=true;
      await client.query(`SET LOCAL ROLE ${RESEARCH_DB_RUNTIME_ROLE}`);
      await client.query(`SELECT set_config('statement_timeout',$1,true),set_config('lock_timeout',$2,true),
        set_config('idle_in_transaction_session_timeout',$3,true),set_config('research.workspace_id',$4,true),set_config('research.actor_user_id',$5,true)`,
        [`${RESEARCH_DB_BUDGET.statementTimeoutMs}ms`,`${RESEARCH_DB_BUDGET.lockTimeoutMs}ms`,`${RESEARCH_DB_BUDGET.idleTransactionTimeoutMs}ms`,scope.workspaceId,scope.actorUserId]);
      const member=await client.query("SELECT 1 FROM workspace_members WHERE workspace_id=$1 AND user_id=$2",[scope.workspaceId,scope.actorUserId]);
      if(!member.rowCount) throw new ResearchReplayError("RESEARCH_REPLAY_NOT_FOUND","Research workspace was not found.",404);
      const value=await work(client);
      if(signal?.aborted) throw unavailable();
      await client.query("COMMIT");return value;
    } catch(error) {
      if(began) await client.query("ROLLBACK").catch(()=>undefined);
      if(error instanceof ResearchCurrentSourceError || error instanceof ResearchReplayError) throw error;
      const wrapped=unavailable();(wrapped as Error & {cause?:unknown}).cause=error;throw wrapped;
    } finally {client.release();}
  }
}
