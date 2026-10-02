/** Append-only, tenant-scoped full lifecycle custody. No engine/artifact I/O. */
import { Inject, Injectable } from "@nestjs/common";
import type { Pool, PoolClient } from "pg";
import { CONTROL_API_POOL } from "../tokens";
import { acquireResearchPoolClient, BoundedResearchReadAdmission } from "./bounded-read";
import { RESEARCH_DB_BUDGET, RESEARCH_DB_RUNTIME_ROLE, type ResearchScope } from "./contracts";
import { ResearchCurrentSourceError } from "./current-source.error";
import { retainedExposureAuthority } from "./retained-exposure";
import { sha256ResearchJson } from "./preflight.service";
import {
  ChildAuditCompanionManifestSchema, ChildAuditCompanionRowSchema,
  type ChildAuditCompanionBatchIngress, type ChildAuditCompanionSealIngress,
  type ChildAuditCompanionManifest, type ChildAuditCompanionQuery, type ChildAuditCompanionRow,
} from "./child-audit-companion.contract";

const conflict = () => new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_CONFLICT", "Audit companion conflicts with its immutable source custody.", 409);
const unavailable = () => new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_UNAVAILABLE", "Audit companion is unavailable.", 503);
const object = (v: unknown) => typeof v === "string" ? JSON.parse(v) : v;
export interface ChildAuditCompanionRead {
  manifest: ChildAuditCompanionManifest | null; revision: string | null;
  rows: ChildAuditCompanionRow[]; hasMore: boolean;
  matchingFold: number | null; matchingFilter: number | null;
  legacy: { sourceCount: number | null; dropped: number | null; samples: number | null };
}

@Injectable()
export class ResearchChildAuditCompanionRepository {
  private readonly admission = new BoundedResearchReadAdmission({maximumActive:2,maximumQueued:18,
    waitTimeoutMs:RESEARCH_DB_BUDGET.boundedReadQueueWaitMs,unavailable});
  constructor(@Inject(CONTROL_API_POOL) private readonly pool: Pool) {}

  async append(scope: ResearchScope, input: ChildAuditCompanionBatchIngress) {
    return this.transaction(scope, false, async client => {
      await this.authorizeWrite(client, scope, input);
      const args = [scope.workspaceId,input.run_id,input.artifact_revision];
      const existing = await client.query(`SELECT companion_digest,batch_digest,row_count FROM research.child_audit_companion_batches_v1
        WHERE workspace_id=$1 AND run_id=$2 AND artifact_revision=$3 AND batch_ordinal=$4`, [...args,input.batch_ordinal]);
      if (existing.rowCount) {
        const row = existing.rows[0];
        if (row.companion_digest !== input.companion_digest || row.batch_digest !== input.batch_digest || Number(row.row_count) !== input.rows.length) throw conflict();
        return {replayed:true};
      }
      const custody = await client.query(`SELECT companion_digest FROM research.child_audit_companion_batches_v1
        WHERE workspace_id=$1 AND run_id=$2 AND artifact_revision=$3 LIMIT 1`, args);
      if (custody.rowCount && custody.rows[0].companion_digest !== input.companion_digest) throw conflict();
      await client.query(`INSERT INTO research.child_audit_companion_batches_v1
        (workspace_id,run_id,artifact_revision,companion_digest,batch_ordinal,batch_digest,row_count,manifest)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
        [...args,input.companion_digest,input.batch_ordinal,input.batch_digest,input.rows.length,JSON.stringify(input.manifest)]);
      await client.query(`INSERT INTO research.child_audit_companion_rows_v1
        (workspace_id,run_id,artifact_revision,companion_digest,batch_ordinal,audit_ordinal,fold_id,context,payload)
        SELECT $1,$2,$3,$4,$5,(r->>'audit_ordinal')::integer,r->>'fold_id',r->>'context',r
        FROM jsonb_array_elements($6::jsonb) r`, [...args,input.companion_digest,input.batch_ordinal,JSON.stringify(input.rows)]);
      return {replayed:false};
    });
  }

  async seal(scope: ResearchScope, input: ChildAuditCompanionSealIngress) {
    return this.transaction(scope, false, async client => {
      await this.authorizeWrite(client, scope, input);
      const args = [scope.workspaceId,input.run_id,input.artifact_revision];
      const prior = await client.query(`SELECT companion_digest FROM research.child_audit_companion_seals_v1
        WHERE workspace_id=$1 AND run_id=$2 AND artifact_revision=$3`, args);
      if (prior.rowCount) {
        if (prior.rows[0].companion_digest !== input.companion_digest) throw conflict();
        return {replayed:true};
      }
      const batches = await client.query(`SELECT companion_digest,batch_ordinal,batch_digest,row_count
        FROM research.child_audit_companion_batches_v1 WHERE workspace_id=$1 AND run_id=$2 AND artifact_revision=$3
        ORDER BY batch_ordinal LIMIT 101`, args);
      const records = await client.query(`SELECT payload FROM research.child_audit_companion_rows_v1
        WHERE workspace_id=$1 AND run_id=$2 AND artifact_revision=$3 ORDER BY audit_ordinal LIMIT 20001`, args);
      const rows = records.rows.map(v => ChildAuditCompanionRowSchema.parse(object(v.payload)));
      if (rows.length !== input.manifest.source_record_count || rows.some((r,i) => r.audit_ordinal !== i)
        || sha256ResearchJson(rows) !== input.manifest.rows_digest
        || batches.rows.length !== Math.ceil(rows.length / 200)) throw conflict();
      for (const [ordinal, batch] of batches.rows.entries()) {
        const chunk = rows.slice(ordinal*200,ordinal*200+200);
        if (batch.companion_digest !== input.companion_digest || Number(batch.batch_ordinal) !== ordinal
          || Number(batch.row_count) !== chunk.length || batch.batch_digest !== sha256ResearchJson(chunk)) throw conflict();
      }
      const fingerprints = new Set(rows.flatMap(r => r.run_fingerprint === null ? [] : [r.run_fingerprint]));
      if (input.manifest.source_run_fingerprint !== (fingerprints.size === 1 ? [...fingerprints][0] : null)) throw conflict();
      // The original seal cannot authenticate unsampled rows, but every
      // retained witness MUST agree with full custody at its original id.
      const overlap = await client.query(`SELECT count(*) AS mismatch_count
        FROM research.current_source_rows_v1 fold
        CROSS JOIN LATERAL jsonb_array_elements(fold.payload->'child_audit'->'records') witness
        LEFT JOIN research.child_audit_companion_rows_v1 audit
          ON audit.workspace_id=fold.workspace_id AND audit.run_id=fold.run_id AND audit.artifact_revision=fold.artifact_revision
          AND audit.audit_ordinal=(witness->>'audit_ordinal')::integer
        WHERE fold.workspace_id=$1 AND fold.run_id=$2 AND fold.artifact_revision=$3 AND fold.table_kind='FOLD'
          AND (audit.payload IS NULL OR audit.payload-'run_fingerprint' IS DISTINCT FROM witness)`,args);
      if (Number(overlap.rows[0]?.mismatch_count) !== 0) throw conflict();
      await client.query(`INSERT INTO research.child_audit_companion_seals_v1
        (workspace_id,run_id,artifact_revision,companion_digest,manifest) VALUES ($1,$2,$3,$4,$5::jsonb)`,
        [...args,input.companion_digest,JSON.stringify(input.manifest)]);
      return {replayed:false};
    });
  }

  async page(scope: ResearchScope, runId: string, query: ChildAuditCompanionQuery,
    after: (revision: string | null) => number | undefined, signal?: AbortSignal): Promise<ChildAuditCompanionRead> {
    const release = await this.admission.acquire(signal);
    try {
      return await this.transaction(scope, true, async client => {
        const run = await client.query("SELECT 1 FROM research.runs WHERE workspace_id=$1 AND run_id=$2",[scope.workspaceId,runId]);
        if (run.rowCount !== 1) throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_NOT_FOUND","Research run was not found.",404);
        const source = await client.query(`WITH original AS (
          SELECT * FROM research.current_source_seals_v1
          WHERE workspace_id=$1 AND run_id=$2 ORDER BY artifact_revision DESC LIMIT 1
        ) SELECT original.artifact_revision,original.manifest_digest,original.source_transform_digest,
          original.requested_spec_digest,original.effective_spec_digest,original.dataset_binding_digest,original.source_adapter_id,
          original.profile_id,original.summary, companion.companion_digest,companion.manifest,
          producer.execution_profile_id,producer.execution_profile_digest
          FROM original
          LEFT JOIN research.child_audit_companion_seals_v1 companion USING (workspace_id,run_id,artifact_revision)
          LEFT JOIN research.artifacts artifact ON artifact.workspace_id=original.workspace_id AND artifact.run_id=original.run_id
            AND artifact.artifact_id=companion.manifest->>'artifact_id' AND artifact.artifact_revision=original.artifact_revision
            AND artifact.state='SEALED' AND artifact.manifest_digest=original.manifest_digest
          LEFT JOIN research.run_producers producer ON producer.workspace_id=original.workspace_id AND producer.run_id=original.run_id
            AND producer.worker_attempt_id=artifact.worker_attempt_id AND producer.lease_epoch=artifact.lease_epoch
            AND producer.requested_spec_digest=original.requested_spec_digest
            AND producer.effective_spec_digest=original.effective_spec_digest
            AND producer.dataset_binding_digest=original.dataset_binding_digest`,[scope.workspaceId,runId]);
        if (source.rows.length > 1) throw unavailable();
        const row = source.rows[0];
        const legacyAudit = object(row?.summary)?.replay?.child_audit;
        const legacy: ChildAuditCompanionRead["legacy"] = {sourceCount:legacyAudit?.source_record_count ?? null,
          dropped:legacyAudit?.records_dropped_by_source ?? null,samples:null};
        if (legacyAudit && row) {
          const samples = await client.query(`SELECT coalesce(sum(jsonb_array_length(payload->'child_audit'->'records')),0) AS sample_count
            FROM research.current_source_rows_v1 WHERE workspace_id=$1 AND run_id=$2 AND artifact_revision=$3
            AND table_kind='FOLD' AND ($4::text IS NULL OR payload->>'fold_id'=$4)
            AND jsonb_typeof(payload->'child_audit'->'records')='array'`,
            [scope.workspaceId,runId,Number(row.artifact_revision),query.fold_id ?? null]);
          legacy.samples = Number(samples.rows[0].sample_count);
        }
        const manifest = row?.manifest ? ChildAuditCompanionManifestSchema.parse(object(row.manifest)) : null;
        const revision = row?.companion_digest ?? null;
        const boundary = after(revision); // Cursor must fail, not restart, on missing/moved revision.
        if (!manifest) return {manifest:null,revision:null,rows:[],hasMore:false,matchingFold:null,matchingFilter:null,legacy};
        const compared = ["manifest_digest","source_transform_digest","requested_spec_digest","effective_spec_digest",
          "dataset_binding_digest","execution_profile_id","execution_profile_digest","source_adapter_id","profile_id"] as const;
        if (manifest.workspace_id !== scope.workspaceId || manifest.run_id !== runId || manifest.artifact_revision !== Number(row.artifact_revision)
          || sha256ResearchJson(manifest) !== revision || compared.some(key => manifest[key] !== row[key])) throw unavailable();
        const args = [scope.workspaceId,runId,manifest.artifact_revision,query.fold_id ?? null,query.context ?? null,query.audit_ordinal ?? null];
        const counts = await client.query(`SELECT count(*) AS total,
          count(*) FILTER (WHERE ($4::text IS NULL OR fold_id=$4)) AS matching_fold,
          count(*) FILTER (WHERE ($4::text IS NULL OR fold_id=$4) AND ($5::text IS NULL OR context=$5)
            AND ($6::integer IS NULL OR audit_ordinal=$6)) AS matching_filter
          FROM research.child_audit_companion_rows_v1 WHERE workspace_id=$1 AND run_id=$2 AND artifact_revision=$3`,args);
        if (Number(counts.rows[0].total) !== manifest.source_record_count) throw unavailable();
        const page = await client.query(`SELECT payload FROM research.child_audit_companion_rows_v1
          WHERE workspace_id=$1 AND run_id=$2 AND artifact_revision=$3 AND ($4::text IS NULL OR fold_id=$4)
          AND ($5::text IS NULL OR context=$5) AND ($6::integer IS NULL OR audit_ordinal=$6)
          AND ($7::integer IS NULL OR audit_ordinal>$7) ORDER BY audit_ordinal LIMIT $8`,[...args,boundary ?? null,query.limit+1]);
        const values = page.rows.map(v => ChildAuditCompanionRowSchema.parse(object(v.payload)));
        return {manifest,revision,rows:values.slice(0,query.limit),hasMore:values.length>query.limit,
          matchingFold:Number(counts.rows[0].matching_fold),matchingFilter:Number(counts.rows[0].matching_filter),legacy};
      }, signal);
    } finally { release(); }
  }

  private async authorizeWrite(client: PoolClient, scope: ResearchScope,
    input: ChildAuditCompanionBatchIngress | ChildAuditCompanionSealIngress) {
    if (scope.workspaceId !== input.workspace_id) throw conflict();
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[
      `child-audit:${scope.workspaceId}:${input.run_id}:${input.artifact_revision}`]);
    await retainedExposureAuthority(client,scope,input.run_id,{workerAttemptId:input.worker_attempt_id,leaseEpoch:input.lease_epoch});
    const result = await client.query(`SELECT seal.*,producer.execution_profile_id,producer.execution_profile_digest,artifact.artifact_id,
      artifact.worker_attempt_id,artifact.lease_epoch,producer.job_id
      FROM research.current_source_seals_v1 seal
      JOIN research.artifacts artifact ON artifact.workspace_id=seal.workspace_id AND artifact.run_id=seal.run_id
        AND artifact.artifact_id=$4 AND artifact.artifact_revision=seal.artifact_revision
        AND artifact.state='SEALED' AND artifact.manifest_digest=seal.manifest_digest
      JOIN research.run_producers producer ON producer.workspace_id=seal.workspace_id AND producer.run_id=seal.run_id
        AND producer.worker_attempt_id=artifact.worker_attempt_id AND producer.lease_epoch=artifact.lease_epoch
        AND producer.requested_spec_digest=seal.requested_spec_digest
        AND producer.effective_spec_digest=seal.effective_spec_digest AND producer.dataset_binding_digest=seal.dataset_binding_digest
        AND producer.job_id=$5
      WHERE seal.workspace_id=$1 AND seal.run_id=$2 AND seal.artifact_revision=$3`,
      [scope.workspaceId,input.run_id,input.artifact_revision,input.artifact_id,input.job_id]);
    const row = result.rows[0], manifest = input.manifest;
    const keys = ["manifest_digest","source_transform_digest","requested_spec_digest","effective_spec_digest","dataset_binding_digest",
      "execution_profile_id","execution_profile_digest","source_adapter_id","profile_id"] as const;
    if (result.rowCount !== 1 || !row || keys.some(key => row[key] !== manifest[key]) || row.worker_attempt_id !== input.worker_attempt_id
      || Number(row.lease_epoch) !== input.lease_epoch || row.job_id !== input.job_id) throw conflict();
    const audit = object(row.summary)?.replay?.child_audit;
    if (audit && (audit.source_record_count !== manifest.source_record_count
      || audit.records_dropped_by_source !== manifest.records_dropped_by_source
      || audit.policy !== manifest.policy
      || audit.unmatched_record_count === 0 && audit.source_run_fingerprint !== manifest.source_run_fingerprint)) throw conflict();
  }

  private async transaction<T>(scope: ResearchScope, readOnly: boolean, work: (client: PoolClient) => Promise<T>, signal?: AbortSignal): Promise<T> {
    const client = await acquireResearchPoolClient(this.pool.connect(),RESEARCH_DB_BUDGET.boundedReadAcquireTimeoutMs,unavailable,signal);
    let began = false;
    try {
      await client.query(readOnly ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY" : "BEGIN"); began=true;
      await client.query(`SET LOCAL ROLE ${RESEARCH_DB_RUNTIME_ROLE}`);
      await client.query(`SELECT set_config('statement_timeout',$1,true),set_config('lock_timeout',$2,true),
        set_config('idle_in_transaction_session_timeout',$3,true),set_config('research.workspace_id',$4,true),set_config('research.actor_user_id',$5,true)`,
        [`${RESEARCH_DB_BUDGET.statementTimeoutMs}ms`,`${RESEARCH_DB_BUDGET.lockTimeoutMs}ms`,
          `${RESEARCH_DB_BUDGET.idleTransactionTimeoutMs}ms`,scope.workspaceId,scope.actorUserId]);
      const member = await client.query("SELECT 1 FROM workspace_members WHERE workspace_id=$1 AND user_id=$2",[scope.workspaceId,scope.actorUserId]);
      if (member.rowCount !== 1) throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_FORBIDDEN","Access denied.",403);
      const result = await work(client); await client.query("COMMIT"); began=false; return result;
    } catch (error) {
      if (began) await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof ResearchCurrentSourceError) throw error;
      const wrapped = unavailable(); (wrapped as Error & {cause?:unknown}).cause=error; throw wrapped;
    } finally { client.release(); }
  }
}
