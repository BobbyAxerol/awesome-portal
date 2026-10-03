/** P18 durable report-manifest and bounded export-job persistence. */

import { createHash, randomBytes } from "node:crypto";
import { readEnriched } from "./enriched-analysis.read";

import { Inject, Injectable } from "@nestjs/common";
import type { Pool, PoolClient } from "pg";

import { newUlid } from "../id";
import { CONTROL_API_POOL } from "../tokens";
import { canonicalResearchJson } from "./preflight.service";
import { RESEARCH_DB_BUDGET, RESEARCH_DB_RUNTIME_ROLE, type ResearchScope } from "./contracts";
import { ResearchReportError } from "./report.error";
import { ResearchUtilitySaturated, assertUtilityCapacity } from "./utility-admission";
import { runDisplayLabel, runDisplayOrdinal, runDisplayOrdinalSql } from "./run-display-label";
import type { ReportAuditRelation } from "./report-core-v2";
import { readPinnedAuditProofs } from "./final-audit.read";
import { DELTA_WFO_PROFILE_ID, DELTA_WFO_PROFILE_DIGEST } from "./delta-wfo.profile";
import { DELTA_WFO_V2_PROFILE_ID, DELTA_WFO_V2_PROFILE_DIGEST } from "./delta-wfo-v2.profile";
import { DELTA_CAUSAL_INNER_PROFILE_ID, DELTA_CAUSAL_INNER_PROFILE_DIGEST } from "./delta-causal-inner.profile";
import {
  ResearchReportFrozenCoreSchema,
  type ResearchReportExportFormat,
  type ResearchReportFrozenCore,
} from "./report.contract";

type JsonValue = Record<string, unknown> | unknown[] | string | null;

export interface StoredResearchReport {
  enrichedAnalysis?: import("./enriched-analysis.contract").ResearchEnrichedAnalysis;
  runId: string;
  displayLabel?: string | null;
  reportRevision: string;
  frozenCoreDigest: string;
  frozenCore: ResearchReportFrozenCore;
  sealedAtUtcMs: number;
  annotation: {
    state: "NOT_PUBLISHED" | "AVAILABLE";
    text: string | null;
    sourceUpdatedAtUtcMs: number | null;
  };
}

export interface SealedArtifactParts {
  artifactRevision: number;
  manifestDigest: string | null;
  parts: Array<{ tableKind: string; partOrdinal: number; relativePath: string; partDigest: string }>;
}

export interface ResearchReportExportJob {
  jobId: string;
  runId: string;
  reportRevision: string;
  format: ResearchReportExportFormat;
  state: "QUEUED" | "RUNNING" | "READY" | "FAILED";
  requestedAtUtcMs: number;
  completedAtUtcMs: number | null;
  sizeBytes: number | null;
  sha256: string | null;
  contentType: "application/json" | "text/csv" | null;
  filename: string | null;
  failureCode: string | null;
}

export interface ClaimedResearchReportExport extends ResearchReportExportJob {
  /** Internal worker lease context; never mapped to a browser DTO. */
  workspaceId: string;
  leaseToken: string;
  frozenCoreDigest: string;
  sealedAtUtcMs: number;
  frozenCore: ResearchReportFrozenCore;
  annotation: StoredResearchReport["annotation"];
}

interface ManifestRow {
  run_id: string;
  report_revision: string;
  frozen_core_digest: string;
  frozen_core: JsonValue;
  sealed_at_utc_ms: string | number;
  annotation_state: "NOT_PUBLISHED" | "AVAILABLE" | null;
  annotation_text: string | null;
  annotation_updated_at_utc_ms: string | number | null;
}

interface JobRow {
  job_id: string;
  run_id: string;
  report_revision: string;
  format: ResearchReportExportFormat;
  state: ResearchReportExportJob["state"];
  requested_at_utc_ms: string | number;
  completed_at_utc_ms: string | number | null;
  size_bytes: string | number | null;
  output_sha256: string | null;
  content_type: "application/json" | "text/csv" | null;
  filename: string | null;
  failure_code: string | null;
}

interface ClaimedJobRow extends JobRow {
  workspace_id: string;
  lease_token: string;
  frozen_core_digest: string;
  sealed_at_utc_ms: string | number;
  frozen_core: JsonValue;
  annotation_state: "NOT_PUBLISHED" | "AVAILABLE" | null;
  annotation_text: string | null;
  annotation_updated_at_utc_ms: string | number | null;
}

function asUtcMs(value: string | number | null, label: string): number | null {
  if (value === null) return null;
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(numeric) || numeric < 0) {
    throw new ResearchReportError("RESEARCH_REPORT_UNAVAILABLE", `Report ${label} is incompatible.`, 503);
  }
  return numeric;
}

function asByteCount(value: string | number | null): number | null {
  if (value === null) return null;
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(numeric) || numeric <= 0 || numeric > 512 * 1024) {
    throw new ResearchReportError("RESEARCH_REPORT_UNAVAILABLE", "Report export metadata is incompatible.", 503);
  }
  return numeric;
}

function parseCore(value: JsonValue): ResearchReportFrozenCore {
  let parsed: unknown;
  try {
    parsed = typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    throw new ResearchReportError("RESEARCH_REPORT_UNAVAILABLE", "Stored report core is incompatible.", 503);
  }
  const validated = ResearchReportFrozenCoreSchema.safeParse(parsed);
  if (validated.success) return validated.data;
  const error = new ResearchReportError("RESEARCH_REPORT_UNAVAILABLE", "Stored report core is incompatible.", 503);
  // Keep schema diagnostics internal for logs/tests; the public error filter
  // still returns the stable typed 503 without leaking stored report content.
  (error as Error & { cause?: unknown }).cause = validated.error;
  throw error;
}

function annotation(row: Pick<ManifestRow | ClaimedJobRow, "annotation_state" | "annotation_text" | "annotation_updated_at_utc_ms">): StoredResearchReport["annotation"] {
  const state = row.annotation_state ?? "NOT_PUBLISHED";
  return {
    state,
    text: state === "AVAILABLE" ? row.annotation_text : null,
    sourceUpdatedAtUtcMs: state === "AVAILABLE" ? asUtcMs(row.annotation_updated_at_utc_ms, "annotation timestamp") : null,
  };
}

function job(row: JobRow): ResearchReportExportJob {
  return {
    jobId: row.job_id,
    runId: row.run_id,
    reportRevision: row.report_revision,
    format: row.format,
    state: row.state,
    requestedAtUtcMs: asUtcMs(row.requested_at_utc_ms, "job request timestamp")!,
    completedAtUtcMs: asUtcMs(row.completed_at_utc_ms, "job completion timestamp"),
    sizeBytes: asByteCount(row.size_bytes),
    sha256: row.output_sha256,
    contentType: row.content_type,
    filename: row.filename,
    failureCode: row.failure_code,
  };
}

/**
 * The export worker has a separate, bounded lease. It has no need for a
 * browser session or a source credential; its only input is a sealed report
 * row it reads locally under the Research runtime role.
 */
@Injectable()
export class ResearchReportRepository {
  constructor(@Inject(CONTROL_API_POOL) private readonly pool: Pool) {}

  /**
   * LW-02: claim one completed WFO run whose report was not sealed. The
   * row-backed cooldown survives process restarts and bounds repeated GETs.
   * A duplicate claim cannot bypass the immutable report advisory lock.
   */
  async claimMissingWfo(scope: ResearchScope, runId: string, profileId: string | readonly string[]): Promise<boolean> {
    return this.withTransaction(scope.workspaceId, scope.actorUserId, false, async (client) => {
      await this.requireMembership(client, scope);
      const result = await client.query(
        `INSERT INTO research.run_report_materialization_retries_v1
           (workspace_id, run_id, state, failure_code, attempt_count, last_attempt_at, next_attempt_at)
         SELECT producer.workspace_id, producer.run_id, 'RETRY', NULL, 1, now(), now() + interval '60 seconds'
           FROM research.run_producers producer
           JOIN research.jobs job ON job.workspace_id = producer.workspace_id AND job.job_id = producer.job_id
          WHERE producer.workspace_id = $1 AND producer.run_id = $2
            AND producer.execution_profile_id = ANY($3::text[]) AND job.state = 'SUCCEEDED'
            AND ((producer.execution_profile_id = $4 AND producer.execution_profile_digest = $5)
              OR (producer.execution_profile_id = $6 AND producer.execution_profile_digest = $7)
              OR (producer.execution_profile_id = $8 AND producer.execution_profile_digest = $9))
            AND NOT EXISTS (
              SELECT 1 FROM research.run_report_manifests_v1 manifest
               WHERE manifest.workspace_id = producer.workspace_id AND manifest.run_id = producer.run_id
            )
         ON CONFLICT (workspace_id, run_id) DO UPDATE
           SET state = 'RETRY', failure_code = NULL,
               attempt_count = research.run_report_materialization_retries_v1.attempt_count + 1,
               last_attempt_at = now(), next_attempt_at = now() + interval '60 seconds'
         WHERE research.run_report_materialization_retries_v1.state <> 'SEALED'
           AND research.run_report_materialization_retries_v1.next_attempt_at <= now()
         RETURNING run_id`,
        [scope.workspaceId, runId, typeof profileId === "string" ? [profileId] : profileId,
          DELTA_WFO_PROFILE_ID, DELTA_WFO_PROFILE_DIGEST, DELTA_WFO_V2_PROFILE_ID, DELTA_WFO_V2_PROFILE_DIGEST,
          DELTA_CAUSAL_INNER_PROFILE_ID, DELTA_CAUSAL_INNER_PROFILE_DIGEST],
      );
      return result.rowCount === 1;
    });
  }

  async markRepairOutcome(scope: ResearchScope, runId: string, state: "SEALED" | "FAILED", failureCode: string | null): Promise<void> {
    await this.withTransaction(scope.workspaceId, scope.actorUserId, false, async (client) => {
      await this.requireMembership(client, scope);
      await client.query(
        `INSERT INTO research.run_report_materialization_retries_v1
           (workspace_id, run_id, state, failure_code, attempt_count, last_attempt_at, next_attempt_at)
         VALUES ($1, $2, $3, $4, 1, now(),
                 CASE WHEN $3 = 'SEALED' THEN NULL ELSE now() + interval '60 seconds' END)
         ON CONFLICT (workspace_id, run_id) DO UPDATE
           SET state = EXCLUDED.state, failure_code = EXCLUDED.failure_code,
               last_attempt_at = now(), next_attempt_at = EXCLUDED.next_attempt_at`,
        [scope.workspaceId, runId, state, failureCode],
      );
    });
  }

  async repairStatus(scope: ResearchScope, runId: string): Promise<{ state: "RETRY" | "FAILED" | "SEALED"; failureCode: string | null } | null> {
    return this.withTransaction(scope.workspaceId, scope.actorUserId, true, async (client) => {
      await this.requireMembership(client, scope);
      const result = await client.query<{ state: "RETRY" | "FAILED" | "SEALED"; failure_code: string | null }>(
        `SELECT state, failure_code FROM research.run_report_materialization_retries_v1
          WHERE workspace_id = $1 AND run_id = $2`,
        [scope.workspaceId, runId],
      );
      return result.rows[0] ? { state: result.rows[0].state, failureCode: result.rows[0].failure_code } : null;
    });
  }

  async seal(scope: ResearchScope, runId: string, frozenCore: ResearchReportFrozenCore): Promise<StoredResearchReport> {
    const frozenCoreDigest = this.digest(frozenCore);
    const reportRevision = `p18r1_${frozenCoreDigest}`;
    return this.withTransaction(scope.workspaceId, scope.actorUserId, false, async (client) => {
      await this.requireMembership(client, scope);
      // The report core is intentionally INSERT/SELECT-only for the runtime
      // role. Serialize same-run seal attempts with a transaction advisory
      // lock rather than SELECT FOR UPDATE, which would require UPDATE on an
      // immutable manifest (and would fail on the annotation LEFT JOIN).
      await this.lockReport(client, scope.workspaceId, runId);
      const existing = await client.query<ManifestRow>(
        `${this.manifestSelect()}
          WHERE manifest.workspace_id = $1 AND manifest.run_id = $2 AND manifest.report_revision = $3
          `,
        [scope.workspaceId, runId, reportRevision],
      );
      if (existing.rowCount === 1) {
        const value = this.toStored(existing.rows[0]!);
        if (value.frozenCoreDigest !== frozenCoreDigest || this.digest(value.frozenCore) !== frozenCoreDigest) {
          throw new ResearchReportError("RESEARCH_REPORT_CONFLICT", "Report revision conflicts with immutable facts.", 409);
        }
        return value;
      }
      await client.query(
        `INSERT INTO research.run_report_manifests_v1
           (workspace_id, run_id, report_revision, frozen_core_digest, frozen_core)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [scope.workspaceId, runId, reportRevision, frozenCoreDigest, canonicalResearchJson(frozenCore)],
      );
      await client.query(
        `INSERT INTO research.run_report_annotations_v1
           (workspace_id, run_id, report_revision, annotation_state, annotation_text, source_updated_at)
         VALUES ($1, $2, $3, 'NOT_PUBLISHED', NULL, NULL)`,
        [scope.workspaceId, runId, reportRevision],
      );
      const inserted = await client.query<ManifestRow>(
        `${this.manifestSelect()}
          WHERE manifest.workspace_id = $1 AND manifest.run_id = $2 AND manifest.report_revision = $3`,
        [scope.workspaceId, runId, reportRevision],
      );
      if (inserted.rowCount !== 1) {
        throw new ResearchReportError("RESEARCH_REPORT_UNAVAILABLE", "Report manifest was not readable after sealing.", 503);
      }
      return this.toStored(inserted.rows[0]!);
    });
  }

  async read(scope: ResearchScope, runId: string): Promise<StoredResearchReport | null> {
    return this.withTransaction(scope.workspaceId, scope.actorUserId, true, async (client) => {
      await this.requireMembership(client, scope);
      const result = await client.query<ManifestRow>(
        `${this.manifestSelect()}
          WHERE manifest.workspace_id = $1 AND manifest.run_id = $2
          ORDER BY manifest.sealed_at DESC, manifest.report_revision DESC
          LIMIT 1`,
        [scope.workspaceId, runId],
      );
      if (result.rowCount !== 1) return null;
      const label = await client.query<{ display_profile_id: string | null; display_ordinal: string | null }>(
        `SELECT producer.execution_profile_id AS display_profile_id,
                ${runDisplayOrdinalSql("run", "producer")} AS display_ordinal
           FROM research.runs run
           LEFT JOIN research.run_producers producer
             ON producer.workspace_id = run.workspace_id AND producer.run_id = run.run_id
          WHERE run.workspace_id = $1 AND run.run_id = $2`,
        [scope.workspaceId, runId],
      );
      const display = label.rows[0];
      const enrichedAnalysis = await readEnriched(client, scope.workspaceId, runId,
        () => new ResearchReportError("RESEARCH_REPORT_UNAVAILABLE", "Stored analytics supplement is incompatible.", 503));
      return { ...this.toStored(result.rows[0]!), ...(enrichedAnalysis ? { enrichedAnalysis } : {}),
        displayLabel: runDisplayLabel(display?.display_profile_id, runDisplayOrdinal(display?.display_ordinal)) };
    });
  }

  /**
   * X2 · P18-T10 · the run's own P19 lineage row and its READY-or-not
   * AUDIT_OF_SELECTION children (bounded). Metadata only; null for an
   * unknown run, so the report says the relation was not read.
   */
  async auditRelation(scope: ResearchScope, runId: string): Promise<ReportAuditRelation | null> {
    return this.withTransaction(scope.workspaceId, scope.actorUserId, true, async (client) => {
      await this.requireMembership(client, scope);
      const run = await client.query<{ relationship_kind: string; parent_run_id: string | null }>(
        `SELECT relationship_kind, parent_run_id FROM research.runs WHERE workspace_id = $1 AND run_id = $2`,
        [scope.workspaceId, runId],
      );
      if (run.rowCount !== 1) return null;
      const children = await client.query<{ run_id: string; state: string }>(
        `SELECT run_id, state FROM research.runs
          WHERE workspace_id = $1 AND parent_run_id = $2 AND relationship_kind = 'AUDIT_OF_SELECTION'
          ORDER BY created_at ASC, run_id ASC
          LIMIT 16`,
        [scope.workspaceId, runId],
      );
      return {
        relationshipKind: run.rows[0]!.relationship_kind,
        parentRunId: run.rows[0]!.parent_run_id,
        auditChildren: children.rows.map((row) => ({ runId: row.run_id, state: row.state })),
        verifiedAudit: (await readPinnedAuditProofs(client, scope.workspaceId, [runId])).get(runId) ?? null,
      };
    });
  }

  /**
   * CG-P18-07 · the sealed P05 parts of one exact artifact revision: their
   * in-artifact relative path and part digest. Metadata only — no byte path
   * is opened and nothing here is a download.
   */
  async sealedArtifactParts(scope: ResearchScope, runId: string, artifactRevision: number | null): Promise<SealedArtifactParts | null> {
    return this.withTransaction(scope.workspaceId, scope.actorUserId, true, async (client) => {
      await this.requireMembership(client, scope);
      const artifact = await client.query<{ artifact_id: string; artifact_revision: string | number; manifest_digest: string | null }>(
        `SELECT artifact_id, artifact_revision, manifest_digest
           FROM research.artifacts
          WHERE workspace_id = $1 AND run_id = $2 AND state = 'SEALED' AND artifact_revision > 0
            AND ($3::bigint IS NULL OR artifact_revision = $3::bigint)
          ORDER BY artifact_revision DESC
          LIMIT 1`,
        [scope.workspaceId, runId, artifactRevision],
      );
      const row = artifact.rows[0];
      if (!row) return null;
      const parts = await client.query<{ table_kind: string; part_ordinal: number; relative_path: string; part_digest: string }>(
        `SELECT table_kind, part_ordinal, relative_path, part_digest
           FROM research.artifact_parts
          WHERE workspace_id = $1 AND artifact_id = $2
          ORDER BY table_kind ASC, part_ordinal ASC
          LIMIT 512`,
        [scope.workspaceId, row.artifact_id],
      );
      return {
        artifactRevision: Number(row.artifact_revision),
        manifestDigest: row.manifest_digest,
        parts: parts.rows.map((part) => ({
          tableKind: part.table_kind,
          partOrdinal: Number(part.part_ordinal),
          relativePath: part.relative_path,
          partDigest: part.part_digest,
        })),
      };
    });
  }

  async requestExport(
    scope: ResearchScope,
    runId: string,
    format: ResearchReportExportFormat,
  ): Promise<ResearchReportExportJob> {
    return this.withTransaction(scope.workspaceId, scope.actorUserId, false, async (client) => {
      await this.requireMembership(client, scope);
      // Serialize one caller/revision/format request around the immutable
      // report identity without granting mutation rights to its core.
      await this.lockReport(client, scope.workspaceId, runId);
      const report = await client.query<ManifestRow>(
        `${this.manifestSelect()}
          WHERE manifest.workspace_id = $1 AND manifest.run_id = $2
          ORDER BY manifest.sealed_at DESC, manifest.report_revision DESC
          LIMIT 1`,
        [scope.workspaceId, runId],
      );
      if (report.rowCount !== 1) {
        throw new ResearchReportError("RESEARCH_REPORT_NOT_READY", "A sealed report is not available for this run.", 409);
      }
      const reportRevision = report.rows[0]!.report_revision;
      const prior = await client.query<JobRow>(
        `${this.jobSelect()}
          WHERE workspace_id = $1 AND run_id = $2 AND report_revision = $3
            AND requested_by_user_id = $4 AND format = $5
            AND state IN ('QUEUED', 'RUNNING', 'READY')
          ORDER BY requested_at DESC LIMIT 1 FOR UPDATE`,
        [scope.workspaceId, runId, reportRevision, scope.actorUserId, format],
      );
      if (prior.rowCount === 1) return job(prior.rows[0]!);
      try {
        await assertUtilityCapacity(client, scope.workspaceId, scope.actorUserId);
      } catch (error) {
        if (error instanceof ResearchUtilitySaturated) {
          throw new ResearchReportError("RESEARCH_REPORT_ADMISSION_SATURATED", error.message, 503);
        }
        throw error;
      }
      const jobId = newUlid("rpex");
      const inserted = await client.query<JobRow>(
        `INSERT INTO research.run_report_export_jobs_v1
           (workspace_id, run_id, report_revision, job_id, format, requested_by_user_id, state)
         VALUES ($1, $2, $3, $4, $5, $6, 'QUEUED')
         RETURNING job_id, run_id, report_revision, format, state,
           (extract(epoch FROM requested_at) * 1000)::bigint AS requested_at_utc_ms,
           (extract(epoch FROM completed_at) * 1000)::bigint AS completed_at_utc_ms,
           octet_length(output_bytes) AS size_bytes, output_sha256, content_type, filename, failure_code`,
        [scope.workspaceId, runId, reportRevision, jobId, format, scope.actorUserId],
      );
      return job(inserted.rows[0]!);
    });
  }

  async readExport(scope: ResearchScope, runId: string, jobId: string): Promise<ResearchReportExportJob | null> {
    return this.withTransaction(scope.workspaceId, scope.actorUserId, true, async (client) => {
      await this.requireMembership(client, scope);
      const result = await client.query<JobRow>(
        `${this.jobSelect()}
          WHERE workspace_id = $1 AND run_id = $2 AND job_id = $3 AND requested_by_user_id = $4`,
        [scope.workspaceId, runId, jobId, scope.actorUserId],
      );
      return result.rowCount === 1 ? job(result.rows[0]!) : null;
    });
  }

  async download(scope: ResearchScope, runId: string, jobId: string): Promise<{ status: ResearchReportExportJob; bytes: Buffer } | null> {
    return this.withTransaction(scope.workspaceId, scope.actorUserId, true, async (client) => {
      await this.requireMembership(client, scope);
      const result = await client.query<JobRow & { output_bytes: Buffer | null }>(
        `SELECT job_id, run_id, report_revision, format, state,
             (extract(epoch FROM requested_at) * 1000)::bigint AS requested_at_utc_ms,
             (extract(epoch FROM completed_at) * 1000)::bigint AS completed_at_utc_ms,
             octet_length(output_bytes) AS size_bytes, output_sha256, content_type, filename, failure_code, output_bytes
           FROM research.run_report_export_jobs_v1
          WHERE workspace_id = $1 AND run_id = $2 AND job_id = $3 AND requested_by_user_id = $4`,
        [scope.workspaceId, runId, jobId, scope.actorUserId],
      );
      if (result.rowCount !== 1) return null;
      const status = job(result.rows[0]!);
      if (status.state !== "READY" || !result.rows[0]!.output_bytes) return { status, bytes: Buffer.alloc(0) };
      const bytes = result.rows[0]!.output_bytes;
      if (bytes.byteLength !== status.sizeBytes || this.digestBytes(bytes) !== status.sha256) {
        throw new ResearchReportError("RESEARCH_REPORT_UNAVAILABLE", "Stored report export bytes are incompatible.", 503);
      }
      return { status, bytes };
    });
  }

  async claimOne(leaseSeconds: number): Promise<ClaimedResearchReportExport | null> {
    return this.withSystemTransaction(async (client) => {
      // Do not leave exhausted jobs in an eternal RUNNING/QUEUED loop.
      await client.query(
        `UPDATE research.run_report_export_jobs_v1
            SET state = 'FAILED', completed_at = now(), lease_token = NULL, lease_expires_at = NULL,
                failure_code = 'P18_EXPORT_ATTEMPT_BUDGET_EXHAUSTED'
          WHERE state IN ('QUEUED', 'RUNNING') AND attempt_count >= 8
            AND (state = 'QUEUED' OR lease_expires_at <= now())`,
      );
      const candidate = await client.query<ClaimedJobRow>(
        `WITH candidate AS (
           SELECT workspace_id, job_id
             FROM research.run_report_export_jobs_v1
            WHERE (state = 'QUEUED' OR (state = 'RUNNING' AND lease_expires_at <= now()))
              AND attempt_count < 8
            ORDER BY requested_at ASC
            FOR UPDATE SKIP LOCKED
            LIMIT 1
         ), claimed AS (
           UPDATE research.run_report_export_jobs_v1 AS job
              SET state = 'RUNNING', lease_token = $1,
                  lease_expires_at = now() + ($2::text || ' seconds')::interval,
                  attempt_count = attempt_count + 1
             FROM candidate
            WHERE job.workspace_id = candidate.workspace_id AND job.job_id = candidate.job_id
            RETURNING job.*
         )
           SELECT claimed.workspace_id, claimed.job_id, claimed.run_id, claimed.report_revision, claimed.format, claimed.state,
                (extract(epoch FROM claimed.requested_at) * 1000)::bigint AS requested_at_utc_ms,
                (extract(epoch FROM claimed.completed_at) * 1000)::bigint AS completed_at_utc_ms,
                octet_length(claimed.output_bytes) AS size_bytes, claimed.output_sha256, claimed.content_type,
                claimed.filename, claimed.failure_code, claimed.lease_token, manifest.frozen_core_digest,
                (extract(epoch FROM manifest.sealed_at) * 1000)::bigint AS sealed_at_utc_ms, manifest.frozen_core,
                annotation.annotation_state, annotation.annotation_text,
                (extract(epoch FROM annotation.source_updated_at) * 1000)::bigint AS annotation_updated_at_utc_ms
           FROM claimed
           JOIN research.run_report_manifests_v1 AS manifest
             ON manifest.workspace_id = claimed.workspace_id AND manifest.run_id = claimed.run_id
            AND manifest.report_revision = claimed.report_revision
           LEFT JOIN research.run_report_annotations_v1 AS annotation
             ON annotation.workspace_id = manifest.workspace_id AND annotation.run_id = manifest.run_id
            AND annotation.report_revision = manifest.report_revision`,
        [this.leaseToken(), leaseSeconds],
      );
      if (candidate.rowCount === 0) return null;
      const value = candidate.rows[0]!;
      if (!value.lease_token) throw new ResearchReportError("RESEARCH_REPORT_UNAVAILABLE", "Export lease was not established.", 503);
      return {
        ...job(value), workspaceId: value.workspace_id, leaseToken: value.lease_token,
        frozenCoreDigest: value.frozen_core_digest,
        sealedAtUtcMs: asUtcMs(value.sealed_at_utc_ms, "report seal timestamp")!,
        frozenCore: parseCore(value.frozen_core), annotation: annotation(value),
      };
    });
  }

  async completeClaim(
    claim: ClaimedResearchReportExport,
    output: { bytes: Buffer; sha256: string; contentType: "application/json" | "text/csv"; filename: string },
  ): Promise<ResearchReportExportJob> {
    return this.withSystemTransaction(async (client) => {
      const result = await client.query<JobRow>(
        `UPDATE research.run_report_export_jobs_v1
            SET state = 'READY', completed_at = now(), lease_token = NULL, lease_expires_at = NULL,
                output_bytes = $1, output_sha256 = $2, content_type = $3, filename = $4, failure_code = NULL
          WHERE workspace_id = $5 AND job_id = $6 AND state = 'RUNNING' AND lease_token = $7
          RETURNING job_id, run_id, report_revision, format, state,
            (extract(epoch FROM requested_at) * 1000)::bigint AS requested_at_utc_ms,
            (extract(epoch FROM completed_at) * 1000)::bigint AS completed_at_utc_ms,
            octet_length(output_bytes) AS size_bytes, output_sha256, content_type, filename, failure_code`,
        [output.bytes, output.sha256, output.contentType, output.filename, claim.workspaceId, claim.jobId, claim.leaseToken],
      );
      if (result.rowCount !== 1) throw new ResearchReportError("RESEARCH_REPORT_CONFLICT", "Report export lease was lost.", 409);
      return job(result.rows[0]!);
    });
  }

  async failClaim(claim: ClaimedResearchReportExport, failureCode: string): Promise<void> {
    await this.withSystemTransaction(async (client) => {
      await client.query(
        `UPDATE research.run_report_export_jobs_v1
            SET state = 'FAILED', completed_at = now(), lease_token = NULL, lease_expires_at = NULL,
                failure_code = $1
          WHERE workspace_id = $2 AND job_id = $3 AND state = 'RUNNING' AND lease_token = $4`,
        [failureCode, claim.workspaceId, claim.jobId, claim.leaseToken],
      );
    });
  }

  private manifestSelect(prefix = "SELECT manifest.run_id, manifest.report_revision, manifest.frozen_core_digest, manifest.frozen_core,\n             (extract(epoch FROM manifest.sealed_at) * 1000)::bigint AS sealed_at_utc_ms,\n             annotation.annotation_state, annotation.annotation_text,\n             (extract(epoch FROM annotation.source_updated_at) * 1000)::bigint AS annotation_updated_at_utc_ms\n           FROM research.run_report_manifests_v1 AS manifest\n           LEFT JOIN research.run_report_annotations_v1 AS annotation\n             ON annotation.workspace_id = manifest.workspace_id AND annotation.run_id = manifest.run_id\n            AND annotation.report_revision = manifest.report_revision") {
    return prefix;
  }

  private jobSelect(prefix = "SELECT job_id, run_id, report_revision, format, state,\n             (extract(epoch FROM requested_at) * 1000)::bigint AS requested_at_utc_ms,\n             (extract(epoch FROM completed_at) * 1000)::bigint AS completed_at_utc_ms,\n             octet_length(output_bytes) AS size_bytes, output_sha256, content_type, filename, failure_code\n           FROM research.run_report_export_jobs_v1") {
    return prefix;
  }

  private toStored(row: ManifestRow): StoredResearchReport {
    const frozenCore = parseCore(row.frozen_core);
    return {
      runId: row.run_id,
      reportRevision: row.report_revision,
      frozenCoreDigest: row.frozen_core_digest,
      frozenCore,
      sealedAtUtcMs: asUtcMs(row.sealed_at_utc_ms, "seal timestamp")!,
      annotation: annotation(row),
    };
  }

  private digest(value: unknown): string { return createHash("sha256").update(canonicalResearchJson(value), "utf8").digest("hex"); }
  private digestBytes(value: Buffer): string { return createHash("sha256").update(value).digest("hex"); }
  private leaseToken(): string { return randomBytes(32).toString("hex"); }

  private async requireMembership(client: PoolClient, scope: ResearchScope): Promise<void> {
    const result = await client.query("SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2", [scope.workspaceId, scope.actorUserId]);
    if (result.rowCount !== 1) throw new ResearchReportError("RESEARCH_REPORT_FORBIDDEN", "Access denied.", 403);
  }

  private async lockReport(client: PoolClient, workspaceId: string, runId: string): Promise<void> {
    // Hash collisions only serialize unrelated report operations; they can
    // never conflate rows or authorize access. The exact tuple is still used
    // in every SQL predicate and every unique/foreign key constraint.
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))", [workspaceId, runId]);
  }

  private async withTransaction<T>(workspaceId: string, actorUserId: string, readOnly: boolean, work: (client: PoolClient) => Promise<T>): Promise<T> {
    return this.transaction(workspaceId, actorUserId, readOnly, work);
  }

  private async withSystemTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    return this.transaction("__research_report_export__", "__research_report_export__", false, work);
  }

  private async transaction<T>(workspaceId: string, actorUserId: string, readOnly: boolean, work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    let began = false;
    try {
      await client.query(readOnly ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY" : "BEGIN");
      began = true;
      await client.query(`SET LOCAL ROLE ${RESEARCH_DB_RUNTIME_ROLE}`);
      await client.query(
        `SELECT set_config('statement_timeout', $1, true),
                set_config('lock_timeout', $2, true),
                set_config('idle_in_transaction_session_timeout', $3, true),
                set_config('research.workspace_id', $4, true),
                set_config('research.actor_user_id', $5, true)`,
        [`${RESEARCH_DB_BUDGET.statementTimeoutMs}ms`, `${RESEARCH_DB_BUDGET.lockTimeoutMs}ms`,
          `${RESEARCH_DB_BUDGET.idleTransactionTimeoutMs}ms`, workspaceId, actorUserId],
      );
      const value = await work(client);
      await client.query("COMMIT");
      began = false;
      return value;
    } catch (error) {
      if (began) await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof ResearchReportError) throw error;
      const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code?: unknown }).code) : "";
      if (code === "40001" || code === "40P01") {
        throw new ResearchReportError("RESEARCH_REPORT_UNAVAILABLE", "Report changed concurrently; retry the read.", 503);
      }
      const wrapped = new ResearchReportError("RESEARCH_REPORT_UNAVAILABLE", "Report storage is temporarily unavailable.", 503);
      (wrapped as Error & { cause?: unknown }).cause = error;
      throw wrapped;
    } finally {
      client.release();
    }
  }
}
