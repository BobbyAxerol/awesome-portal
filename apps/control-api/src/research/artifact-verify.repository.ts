/**
 * A10a · the durable, bounded byte-verification receipts.
 *
 * Reads the immutable sealed expectation (`research.artifacts` +
 * `research.artifact_parts`) and appends one immutable receipt per explicit
 * verify. It never updates an artifact row, a part row or a receipt: the
 * expected digests are the ones stored at seal time, forever.
 */

import { randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { Pool, PoolClient } from "pg";

import { newUlid } from "../id";
import { CONTROL_API_POOL } from "../tokens";
import { RESEARCH_DB_BUDGET, RESEARCH_DB_RUNTIME_ROLE, type ResearchScope } from "./contracts";
import {
  ARTIFACT_BYTE_VERIFICATION_SCHEMA_VERSION,
  type ArtifactByteMismatch,
  type ArtifactByteVerification,
} from "./artifact-verify.contract";

export class ArtifactVerifyStoreError extends Error {
  constructor(readonly code: "FORBIDDEN" | "UNAVAILABLE", message: string) {
    super(message);
  }
}

export interface SealedArtifactExpectation {
  artifactId: string;
  artifactRevision: number;
  state: string;
  expectedManifestDigest: string;
  parts: { tableKind: string; partOrdinal: number; relativePath: string; partDigest: string }[];
}

export interface ReceiptInput {
  runId: string;
  artifactId: string;
  artifactRevision: number;
  state: "MATCH" | "MISMATCH" | "MISSING";
  expectedManifestDigest: string;
  observedManifestDigest: string | null;
  partsChecked: number;
  partsMismatched: number;
  documentsChecked: number;
  mismatches: ArtifactByteMismatch[];
}

interface ReceiptRow {
  receipt_id: string;
  artifact_revision: string | number;
  state: "MATCH" | "MISMATCH" | "MISSING";
  expected_manifest_digest: string;
  observed_manifest_digest: string | null;
  parts_checked: number;
  parts_mismatched: number;
  documents_checked: number;
  mismatches: ArtifactByteMismatch[] | string;
  verified_at_utc_ms: string | number;
}

function toVerification(row: ReceiptRow): ArtifactByteVerification {
  const mismatches = typeof row.mismatches === "string" ? JSON.parse(row.mismatches) as ArtifactByteMismatch[] : row.mismatches;
  return {
    schema_version: ARTIFACT_BYTE_VERIFICATION_SCHEMA_VERSION,
    state: row.state,
    reason_code: row.state === "MATCH" ? null
      : row.state === "MISMATCH" ? "P16_ARTIFACT_BYTES_DIFFER_FROM_SEALED_DIGEST"
        : "P16_ARTIFACT_BYTES_MISSING_FROM_RETAINED_STORE",
    verification_scope: "P05_SEALED_MANIFEST_PARTS_AND_DOCUMENTS",
    receipt_id: row.receipt_id,
    verified_at_utc_ms: Number(row.verified_at_utc_ms),
    artifact_revision: Number(row.artifact_revision),
    expected_manifest_digest: row.expected_manifest_digest,
    observed_manifest_digest: row.observed_manifest_digest,
    parts_checked: row.parts_checked,
    parts_mismatched: row.parts_mismatched,
    documents_checked: row.documents_checked,
    mismatches,
  };
}

const RECEIPT_COLUMNS = `receipt_id, artifact_revision, state, expected_manifest_digest, observed_manifest_digest,
  parts_checked, parts_mismatched, documents_checked, mismatches,
  floor(extract(epoch FROM verified_at) * 1000)::bigint AS verified_at_utc_ms`;

@Injectable()
export class ResearchArtifactVerifyRepository {
  constructor(@Inject(CONTROL_API_POOL) private readonly pool: Pool) {}

  /**
   * The newest sealed P05 artifact of a run (or of an exact revision), with
   * the part digests stored at seal time. Only revisioned P05 artifacts are
   * eligible; legacy revision-0 rows carry no part ledger to verify against.
   */
  async expectation(scope: ResearchScope, runId: string, artifactRevision?: number): Promise<SealedArtifactExpectation | null> {
    return this.withTransaction(scope, true, async (client) => {
      const artifact = await client.query<{
        artifact_id: string; artifact_revision: string | number; state: string; manifest_digest: string;
      }>(
        `SELECT artifact_id, artifact_revision, state, manifest_digest
           FROM research.artifacts
          WHERE workspace_id = $1 AND run_id = $2 AND artifact_revision > 0
            AND state IN ('SEALED', 'CORRUPT', 'MISSING') AND manifest_digest IS NOT NULL
            AND ($3::bigint IS NULL OR artifact_revision = $3::bigint)
          ORDER BY artifact_revision DESC
          LIMIT 1`,
        [scope.workspaceId, runId, artifactRevision ?? null],
      );
      const row = artifact.rows[0];
      if (!row) return null;
      const parts = await client.query<{ table_kind: string; part_ordinal: number; relative_path: string; part_digest: string }>(
        `SELECT table_kind, part_ordinal, relative_path, part_digest
           FROM research.artifact_parts
          WHERE workspace_id = $1 AND artifact_id = $2
          ORDER BY table_kind ASC, part_ordinal ASC
          LIMIT 257`,
        [scope.workspaceId, row.artifact_id],
      );
      if (parts.rows.length < 1 || parts.rows.length > 256) return null;
      return {
        artifactId: row.artifact_id,
        artifactRevision: Number(row.artifact_revision),
        state: row.state,
        expectedManifestDigest: row.manifest_digest,
        parts: parts.rows.map((part) => ({
          tableKind: part.table_kind,
          partOrdinal: part.part_ordinal,
          relativePath: part.relative_path,
          partDigest: part.part_digest,
        })),
      };
    });
  }

  async record(scope: ResearchScope, input: ReceiptInput): Promise<ArtifactByteVerification> {
    const receiptId = `rabv_${randomBytes(16).toString("hex")}`;
    return this.withTransaction(scope, false, async (client) => {
      const inserted = await client.query<ReceiptRow>(
        `INSERT INTO research.artifact_byte_receipts_v1
           (workspace_id, receipt_id, run_id, artifact_id, artifact_revision, state,
            expected_manifest_digest, observed_manifest_digest, parts_checked, parts_mismatched,
            documents_checked, mismatches, requested_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13)
         RETURNING ${RECEIPT_COLUMNS}`,
        [scope.workspaceId, receiptId, input.runId, input.artifactId, input.artifactRevision, input.state,
          input.expectedManifestDigest, input.observedManifestDigest, input.partsChecked, input.partsMismatched,
          input.documentsChecked, JSON.stringify(input.mismatches), scope.actorUserId],
      );
      await client.query(
        `INSERT INTO research.audit_log
           (workspace_id, audit_id, actor_user_id, action, subject_type, subject_id, metadata)
         VALUES ($1, $2, $3, 'RESEARCH_ARTIFACT_BYTES_VERIFIED', 'run', $4, $5::jsonb)`,
        [scope.workspaceId, newUlid("raud"), scope.actorUserId, input.runId, JSON.stringify({
          receipt_id: receiptId, artifact_revision: input.artifactRevision, state: input.state,
          parts_checked: input.partsChecked, parts_mismatched: input.partsMismatched,
        })],
      );
      return toVerification(inserted.rows[0]!);
    });
  }

  async latest(scope: ResearchScope, runId: string): Promise<ArtifactByteVerification | null> {
    return this.withTransaction(scope, true, async (client) => {
      const result = await client.query<ReceiptRow>(
        `SELECT ${RECEIPT_COLUMNS}
           FROM research.artifact_byte_receipts_v1
          WHERE workspace_id = $1 AND run_id = $2
          ORDER BY verified_at DESC, receipt_id DESC
          LIMIT 1`,
        [scope.workspaceId, runId],
      );
      return result.rows[0] ? toVerification(result.rows[0]) : null;
    });
  }

  private async withTransaction<T>(scope: ResearchScope, readOnly: boolean, work: (client: PoolClient) => Promise<T>): Promise<T> {
    let client: PoolClient | undefined;
    let began = false;
    try {
      client = await this.pool.connect();
      await client.query(readOnly ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY" : "BEGIN");
      began = true;
      await client.query(`SET LOCAL ROLE ${RESEARCH_DB_RUNTIME_ROLE}`);
      await client.query("SELECT set_config('statement_timeout', $1, true)", [`${RESEARCH_DB_BUDGET.statementTimeoutMs}ms`]);
      await client.query("SELECT set_config('lock_timeout', $1, true)", [`${RESEARCH_DB_BUDGET.lockTimeoutMs}ms`]);
      const membership = await client.query(
        "SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2",
        [scope.workspaceId, scope.actorUserId],
      );
      if (membership.rowCount !== 1) throw new ArtifactVerifyStoreError("FORBIDDEN", "Access denied.");
      const result = await work(client);
      await client.query("COMMIT");
      began = false;
      return result;
    } catch (error) {
      if (began && client) await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof ArtifactVerifyStoreError) throw error;
      const wrapped = new ArtifactVerifyStoreError("UNAVAILABLE", "Artifact verification store is unavailable.");
      (wrapped as Error & { cause?: unknown }).cause = error;
      throw wrapped;
    } finally {
      client?.release();
    }
  }
}
