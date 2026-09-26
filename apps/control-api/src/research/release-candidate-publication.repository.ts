/** P22 workspace-scoped durable publication intent and R1 receipt. */
import { Inject, Injectable } from "@nestjs/common";
import type { Pool, PoolClient } from "pg";
import { CONTROL_API_POOL } from "../tokens";
import { RESEARCH_DB_BUDGET, RESEARCH_DB_RUNTIME_ROLE, type ResearchScope } from "./contracts";
import { canonicalResearchJson } from "./preflight.service";
import { ResearchReleaseCandidateError } from "./release-candidate.error";

export type PublicationState = "PENDING" | "UNKNOWN" | "DELIVERED" | "REFUSED";
export interface PublicationPromotionPick {
  state: "NOT_PUBLISHED" | "PENDING_APPROVAL" | "WRITTEN" | "REJECTED";
  approvalId: string; approvalStatus: FinishPublication["approvalStatus"];
  approvalVersion: number | null; runId: string; selectedTrialId: string | null;
  artifactId: string | null; factDigest: string;
}
export interface PublicationIntent {
  releaseCandidateId: string; runId: string; alphaId: string; alphaVersionId: string;
  actorUserId: string; actorUsername: string; requestKey: string; payloadDigest: string;
  requestPayload: Record<string, unknown>; packDigest: string; sourceFingerprint: string;
  legacyArtifactSha256: string; artifactSchemaVersion: string; methodologyClaimId: string;
  state: PublicationState; approvalId: string | null; evidenceSetHash: string | null;
  receiptDigest: string | null; receipt: Record<string, unknown> | null;
  publishedAtUtcMs: number | null; lastErrorCode: string | null;
  attemptCount?: number; conflictingApprovalId?: string | null; downstreamCode?: string | null;
  createdAtUtcMs?: number; updatedAtUtcMs?: number; promotionPick?: PublicationPromotionPick | null;
}
export interface BeginPublication {
  releaseCandidateId: string; runId: string; alphaId: string; alphaVersionId: string;
  actorUsername: string; requestKey: string; payloadDigest: string;
  requestPayload: Record<string, unknown>; packDigest: string; sourceFingerprint: string;
  legacyArtifactSha256: string; artifactSchemaVersion: string; methodologyClaimId: string;
}
export interface FinishPublication {
  approvalId: string; evidenceSetHash: string; receiptDigest: string;
  receipt: Record<string, unknown>; publishedAtUtcMs: number;
  approvalStatus: "PENDING" | "APPROVED" | "APPROVED_WITH_CONDITION" | "DENIED" | "CHANGES_REQUESTED" | "EXPIRED";
  promotionPick?: {
    attemptId: string; runId: string; alphaVersionId: string; selectionId: string | null; selectedTrialId: string | null;
    selectionSequence: readonly string[]; artifactId: string | null; artifactManifestDigest: string | null;
    packDigest: string; evidenceSetHash: string; factDigest: string;
  };
}
interface IntentRow {
  release_candidate_id: string; run_id: string; alpha_id: string; alpha_version_id: string;
  actor_user_id: string; actor_username: string; request_key: string; payload_digest: string;
  request_payload: Record<string, unknown> | string; pack_digest: string; source_fingerprint: string;
  legacy_artifact_sha256: string; artifact_schema_version: string; methodology_claim_id: string;
  state: PublicationState; approval_id: string | null; evidence_set_hash: string | null;
  receipt_digest: string | null; receipt_json: Record<string, unknown> | string | null;
  published_at_utc_ms: string | number | null; last_error_code: string | null;
  attempt_count: string | number; conflicting_approval_id: string | null; downstream_code: string | null;
  created_at_utc_ms: string | number; updated_at_utc_ms: string | number;
}
const SELECT = [
  "SELECT release_candidate_id, run_id, alpha_id, alpha_version_id, actor_user_id, actor_username,",
  "request_key, payload_digest, request_payload, pack_digest, source_fingerprint,",
  "legacy_artifact_sha256, artifact_schema_version, methodology_claim_id, state, approval_id,",
  "evidence_set_hash, receipt_digest, receipt_json,",
  "(extract(epoch FROM published_at) * 1000)::bigint AS published_at_utc_ms, last_error_code,",
  "attempt_count, conflicting_approval_id, downstream_code,",
  "(extract(epoch FROM created_at) * 1000)::bigint AS created_at_utc_ms,",
  "(extract(epoch FROM updated_at) * 1000)::bigint AS updated_at_utc_ms",
  "FROM research.release_candidate_publications_v1 WHERE workspace_id = $1 AND release_candidate_id = $2",
].join(" ");
function object(value: Record<string, unknown> | string | null): Record<string, unknown> | null {
  if (value === null) return null;
  const parsed: unknown = typeof value === "string" ? JSON.parse(value) : value;
  return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
}
function mapped(row: IntentRow): PublicationIntent {
  const requestPayload = object(row.request_payload);
  if (!requestPayload) throw new ResearchReleaseCandidateError("RESEARCH_RELEASE_CANDIDATE_UNAVAILABLE", "Stored publication request is incompatible.", 503);
  return {
    releaseCandidateId: row.release_candidate_id, runId: row.run_id, alphaId: row.alpha_id,
    alphaVersionId: row.alpha_version_id, actorUserId: row.actor_user_id, actorUsername: row.actor_username,
    requestKey: row.request_key, payloadDigest: row.payload_digest, requestPayload,
    packDigest: row.pack_digest, sourceFingerprint: row.source_fingerprint,
    legacyArtifactSha256: row.legacy_artifact_sha256, artifactSchemaVersion: row.artifact_schema_version,
    methodologyClaimId: row.methodology_claim_id, state: row.state, approvalId: row.approval_id,
    evidenceSetHash: row.evidence_set_hash, receiptDigest: row.receipt_digest,
    receipt: object(row.receipt_json), publishedAtUtcMs: row.published_at_utc_ms === null ? null : Number(row.published_at_utc_ms),
    lastErrorCode: row.last_error_code, attemptCount: Number(row.attempt_count),
    conflictingApprovalId: row.conflicting_approval_id, downstreamCode: row.downstream_code,
    createdAtUtcMs: Number(row.created_at_utc_ms), updatedAtUtcMs: Number(row.updated_at_utc_ms),
  };
}

@Injectable()
export class ResearchReleaseCandidatePublicationRepository {
  constructor(@Inject(CONTROL_API_POOL) private readonly pool: Pool) {}

  async read(scope: ResearchScope, releaseCandidateId: string): Promise<PublicationIntent | null> {
    return this.transaction(scope, true, async (client) => {
      await this.member(client, scope);
      const result = await client.query<IntentRow>(SELECT, [scope.workspaceId, releaseCandidateId]);
      if (result.rowCount !== 1) return null;
      return this.hydratePromotionPick(client, scope, mapped(result.rows[0]!));
    });
  }

  /** OL-13: one named lookup; the browser never scans release candidates. */
  async latestDeliveredByAlphaVersion(scope: ResearchScope, alphaVersionId: string): Promise<string | null> {
    return this.transaction(scope, true, async (client) => {
      await this.member(client, scope);
      const result = await client.query<{ release_candidate_id: string }>(
        `SELECT release_candidate_id
           FROM research.release_candidate_publications_v1
          WHERE workspace_id = $1 AND alpha_version_id = $2 AND state = 'DELIVERED'
          ORDER BY published_at DESC, release_candidate_id DESC
          LIMIT 1`,
        [scope.workspaceId, alphaVersionId],
      );
      return result.rows[0]?.release_candidate_id ?? null;
    });
  }

  async begin(scope: ResearchScope, input: BeginPublication): Promise<{ intent: PublicationIntent; replayed: boolean }> {
    return this.transaction(scope, false, async (client) => {
      await this.member(client, scope);
      // P21 seal takes the same run lock; the current pack cannot change mid-check.
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))", [scope.workspaceId, input.runId]);
      const pack = await client.query<{ run_id: string; pack_digest: string; source_fingerprint: string }>(
        "SELECT run_id, pack_digest, source_fingerprint FROM research.release_candidate_packs_v1 WHERE workspace_id = $1 AND release_candidate_id = $2 FOR UPDATE",
        [scope.workspaceId, input.releaseCandidateId],
      );
      if (pack.rowCount !== 1 || pack.rows[0]!.run_id !== input.runId) this.notFound();
      if (pack.rows[0]!.pack_digest !== input.packDigest || pack.rows[0]!.source_fingerprint !== input.sourceFingerprint) this.conflict();
      const latest = await client.query<{ release_candidate_id: string }>(
        "SELECT release_candidate_id FROM research.release_candidate_packs_v1 WHERE workspace_id = $1 AND run_id = $2 ORDER BY sealed_at DESC, release_candidate_id DESC LIMIT 1",
        [scope.workspaceId, input.runId],
      );
      if (latest.rows[0]?.release_candidate_id !== input.releaseCandidateId) this.conflict();
      const previous = await client.query<IntentRow>(SELECT, [scope.workspaceId, input.releaseCandidateId]);
      if (previous.rowCount === 1) return { intent: await this.hydratePromotionPick(client, scope, mapped(previous.rows[0]!)), replayed: true };
      await client.query(
        "INSERT INTO research.release_candidate_publications_v1 (workspace_id, release_candidate_id, run_id, alpha_id, alpha_version_id, actor_user_id, actor_username, request_key, payload_digest, request_payload, pack_digest, source_fingerprint, legacy_artifact_sha256, artifact_schema_version, methodology_claim_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$15)",
        [scope.workspaceId, input.releaseCandidateId, input.runId, input.alphaId, input.alphaVersionId,
          scope.actorUserId, input.actorUsername, input.requestKey, input.payloadDigest,
          canonicalResearchJson(input.requestPayload), input.packDigest, input.sourceFingerprint,
          input.legacyArtifactSha256, input.artifactSchemaVersion, input.methodologyClaimId],
      );
      const created = await client.query<IntentRow>(SELECT, [scope.workspaceId, input.releaseCandidateId]);
      if (created.rowCount !== 1) this.unavailable();
      return { intent: await this.hydratePromotionPick(client, scope, mapped(created.rows[0]!)), replayed: false };
    });
  }

  async pending(scope: ResearchScope, id: string): Promise<PublicationIntent> { return this.transition(scope, id, "PENDING", null); }
  async unknown(scope: ResearchScope, id: string, code: string, details?: { conflictingApprovalId?: string | null }): Promise<PublicationIntent> { return this.transition(scope, id, "UNKNOWN", code, details); }
  async refused(scope: ResearchScope, id: string, code: string, details?: { conflictingApprovalId?: string | null }): Promise<PublicationIntent> { return this.transition(scope, id, "REFUSED", code, details); }
  async attempt(scope: ResearchScope, id: string): Promise<void> {
    await this.transaction(scope, false, async (client) => {
      await this.member(client, scope);
      await client.query(`UPDATE research.release_candidate_publications_v1
        SET attempt_count = LEAST(attempt_count + 1, 32), updated_at = now()
        WHERE workspace_id = $1 AND release_candidate_id = $2 AND actor_user_id = $3
          AND state IN ('PENDING','UNKNOWN')`, [scope.workspaceId, id, scope.actorUserId]);
    });
  }

  private async transition(scope: ResearchScope, id: string, state: PublicationState, code: string | null, details?: { conflictingApprovalId?: string | null }): Promise<PublicationIntent> {
    return this.transaction(scope, false, async (client) => {
      await this.member(client, scope);
      await client.query(
        "UPDATE research.release_candidate_publications_v1 SET state = $4, last_error_code = $5, downstream_code = $5, conflicting_approval_id = $6, updated_at = now() WHERE workspace_id = $1 AND release_candidate_id = $2 AND actor_user_id = $3 AND state IN ('PENDING','UNKNOWN')",
        [scope.workspaceId, id, scope.actorUserId, state, code, details?.conflictingApprovalId ?? null],
      );
      const current = await client.query<IntentRow>(SELECT, [scope.workspaceId, id]);
      if (current.rowCount !== 1) this.notFound();
      return this.hydratePromotionPick(client, scope, mapped(current.rows[0]!));
    });
  }

  async finish(scope: ResearchScope, id: string, receipt: FinishPublication): Promise<PublicationIntent> {
    return this.transaction(scope, false, async (client) => {
      await this.member(client, scope);
      const found = await client.query<IntentRow>(SELECT + " FOR UPDATE", [scope.workspaceId, id]);
      if (found.rowCount !== 1) this.notFound();
      const current = mapped(found.rows[0]!);
      if (current.actorUserId !== scope.actorUserId) this.notFound();
      if (current.state === "DELIVERED") {
        if (current.approvalId !== receipt.approvalId || current.evidenceSetHash !== receipt.evidenceSetHash) this.conflict();
        return this.hydratePromotionPick(client, scope, current);
      }
      if (current.state === "REFUSED") this.conflict();
      const updated = await client.query(
        "UPDATE research.release_candidate_publications_v1 SET state = 'DELIVERED', approval_id = $3, evidence_set_hash = $4, receipt_digest = $5, receipt_json = $6::jsonb, published_at = to_timestamp($7::double precision / 1000), last_error_code = NULL, updated_at = now() WHERE workspace_id = $1 AND release_candidate_id = $2",
        [scope.workspaceId, id, receipt.approvalId, receipt.evidenceSetHash,
          receipt.receiptDigest, canonicalResearchJson(receipt.receipt), receipt.publishedAtUtcMs],
      );
      if (updated.rowCount !== 1) this.unavailable();
      const approvalState = receipt.approvalStatus === "PENDING" ? "PENDING"
        : ["APPROVED", "APPROVED_WITH_CONDITION"].includes(receipt.approvalStatus) ? "APPROVED" : "REJECTED";
      const delivery = await client.query(
        "UPDATE research.release_candidate_delivery_states_v1 SET delivery_state = 'DELIVERED', approval_state = $3, downstream_receipt_digest = $4, downstream_updated_at = now(), approval_id = $5 WHERE workspace_id = $1 AND release_candidate_id = $2 AND delivery_state = 'NOT_DELIVERED'",
        [scope.workspaceId, id, approvalState, receipt.receiptDigest, receipt.approvalId],
      );
      if (delivery.rowCount !== 1) this.conflict();
      if (receipt.promotionPick) {
        const pick = receipt.promotionPick;
        await client.query(
          `SELECT research.p22_record_promotion_pick(
             $1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14,$15,$16
           )`,
          [scope.workspaceId, id, receipt.approvalId, pick.alphaVersionId, pick.attemptId,
            pick.runId, pick.selectionId, pick.selectedTrialId,
            canonicalResearchJson(pick.selectionSequence), pick.artifactId,
            pick.artifactManifestDigest, pick.packDigest, pick.evidenceSetHash,
            receipt.approvalStatus, pick.factDigest, scope.actorUserId],
        );
      }
      const saved = await client.query<IntentRow>(SELECT, [scope.workspaceId, id]);
      return this.hydratePromotionPick(client, scope, mapped(saved.rows[0]!));
    });
  }

  private async hydratePromotionPick(client: PoolClient, scope: ResearchScope, intent: PublicationIntent): Promise<PublicationIntent> {
    const result = await client.query<{
      approval_id: string; run_id: string; selected_trial_id: string | null; artifact_id: string | null;
      approval_status: FinishPublication["approvalStatus"]; approval_version: string | number | null; fact_digest: string;
    }>(`SELECT receipt.approval_id, receipt.run_id, receipt.selected_trial_id,
               receipt.artifact_id,
               coalesce(settlement.approval_status, receipt.approval_status) AS approval_status,
               settlement.approval_version,
               receipt.fact_digest
          FROM research.p22_promotion_pick_receipts_v1 receipt
          LEFT JOIN LATERAL (
            SELECT approval_status, approval_version
              FROM research.p22_approval_settlements_v1
             WHERE workspace_id = receipt.workspace_id
               AND release_candidate_id = receipt.release_candidate_id
             ORDER BY approval_version DESC
             LIMIT 1
          ) settlement ON true
         WHERE receipt.workspace_id = $1 AND receipt.release_candidate_id = $2`, [scope.workspaceId, intent.releaseCandidateId]);
    const row = result.rows[0];
    if (!row) return intent;
    const state: PublicationPromotionPick["state"] = ["APPROVED", "APPROVED_WITH_CONDITION"].includes(row.approval_status)
      ? "WRITTEN"
      : row.approval_status === "PENDING" ? "PENDING_APPROVAL" : "REJECTED";
    return { ...intent, promotionPick: {
      state, approvalId: row.approval_id, approvalStatus: row.approval_status,
      approvalVersion: row.approval_version === null ? null : Number(row.approval_version),
      runId: row.run_id, selectedTrialId: row.selected_trial_id,
      artifactId: row.artifact_id, factDigest: row.fact_digest,
    } };
  }

  private async member(client: PoolClient, scope: ResearchScope): Promise<void> {
    const result = await client.query("SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2", [scope.workspaceId, scope.actorUserId]);
    if (result.rowCount !== 1) this.notFound();
  }
  private async transaction<T>(scope: ResearchScope, readOnly: boolean, work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    let began = false;
    try {
      await client.query(readOnly ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY" : "BEGIN");
      began = true;
      await client.query("SET LOCAL ROLE " + RESEARCH_DB_RUNTIME_ROLE);
      await client.query("SELECT set_config('statement_timeout', $1, true)", [String(RESEARCH_DB_BUDGET.statementTimeoutMs) + "ms"]);
      await client.query("SELECT set_config('lock_timeout', $1, true)", [String(RESEARCH_DB_BUDGET.lockTimeoutMs) + "ms"]);
      await client.query("SELECT set_config('idle_in_transaction_session_timeout', $1, true)", [String(RESEARCH_DB_BUDGET.idleTransactionTimeoutMs) + "ms"]);
      await client.query("SELECT set_config('research.workspace_id', $1, true)", [scope.workspaceId]);
      await client.query("SELECT set_config('research.actor_user_id', $1, true)", [scope.actorUserId]);
      const result = await work(client);
      await client.query("COMMIT");
      began = false;
      return result;
    } catch (error) {
      if (began) await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof ResearchReleaseCandidateError) throw error;
      const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code?: unknown }).code) : "";
      if (["23505", "23514", "40001", "40P01"].includes(code)) this.conflict();
      const wrapped = new ResearchReleaseCandidateError("RESEARCH_RELEASE_CANDIDATE_UNAVAILABLE", "Publication storage is unavailable.", 503);
      (wrapped as Error & { cause?: unknown }).cause = error;
      throw wrapped;
    } finally {
      client.release();
    }
  }
  private notFound(): never { throw new ResearchReleaseCandidateError("RESEARCH_RELEASE_CANDIDATE_NOT_FOUND", "Release Candidate was not found.", 404); }
  private conflict(): never { throw new ResearchReleaseCandidateError("RESEARCH_RELEASE_CANDIDATE_CONFLICT", "Publication changed; reload the candidate.", 409); }
  private unavailable(): never { throw new ResearchReleaseCandidateError("RESEARCH_RELEASE_CANDIDATE_UNAVAILABLE", "Publication storage is unavailable.", 503); }
}
