/**
 * OL-04/OL-06 · P22-only bridge from a sealed Research pack to the legacy
 * Governance read model.  The service never edits P21 source rows and never
 * talks to Trading System, Source Proxy, Redis, a broker or a command API.
 */
import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { Pool, PoolClient } from "pg";
import { CONTROL_API_POOL } from "../tokens";
import { canonicalResearchJson } from "./preflight.service";
import { RESEARCH_DB_BUDGET, RESEARCH_DB_RUNTIME_ROLE, type ResearchScope } from "./contracts";
import { ResearchReleaseCandidateError } from "./release-candidate.error";

export interface P22FinalAuditFacts {
  runId: string;
  parentRunId: string | null;
  attemptId: string;
  alphaId: string;
  alphaVersionId: string;
  strategyId: string;
  datasetId: string;
  sourceCursor: string | null;
  status: "READY";
  artifactSha256: string;
  artifactSchemaVersion: string;
  artifactId: string;
  artifactManifestDigest: string;
  ownerUserId: string;
  selectionId: string | null;
  selectedTrialId: string | null;
  selectionSequence: readonly string[];
}

export interface P22BridgeInput {
  releaseCandidateId: string;
  packDigest: string;
  sourceFingerprint: string;
  methodologyClaimIds: readonly string[];
}

export interface P22BridgeReceipt extends P22FinalAuditFacts {
  materializationDigest: string;
  materializedAtUtcMs: number;
  replayed: boolean;
}

const digest = (value: unknown): string => createHash("sha256").update(canonicalResearchJson(value), "utf8").digest("hex");

/** Extract only explicit claim identifiers from a sealed P21 pack. */
export function sealedPackMethodologyClaimIds(frozenCore: Record<string, unknown>): string[] {
  const found = new Set<string>();
  const visit = (value: unknown, key = ""): void => {
    if (Array.isArray(value)) { for (const item of value) visit(item, key); return; }
    if (!value || typeof value !== "object") return;
    const recordValue = value as Record<string, unknown>;
    const declaredKey = recordValue.key;
    const declaredValue = recordValue.value;
    // P21's canonical evidence-pack row is itself an explicit claim fact. Its
    // sha256 is content authority, so give that immutable fact a stable local
    // identifier instead of parsing prose or inventing a certificate ID.
    if (declaredKey === "METHODOLOGY_CLAIM"
      && (recordValue.status === "COMPLETE" || recordValue.status === "DEGRADED")
      && typeof recordValue.digest === "string" && /^[0-9a-f]{64}$/.test(recordValue.digest)) {
      found.add(`claim:sha256:${recordValue.digest}`);
    }
    if ((declaredKey === "methodology_claim_id" || declaredKey === "methodology_claim_ids" || declaredKey === "claim_id")
      && (typeof declaredValue === "string" || Array.isArray(declaredValue))) {
      const values = typeof declaredValue === "string" ? [declaredValue] : declaredValue;
      for (const item of values) if (typeof item === "string" && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,190}$/.test(item)) found.add(item);
    }
    for (const [name, child] of Object.entries(recordValue)) {
      if ((name === "methodology_claim_id" || name === "methodology_claim_ids" || name === "claim_id")
        && (typeof child === "string" || Array.isArray(child))) {
        const values = typeof child === "string" ? [child] : child;
        for (const item of values) if (typeof item === "string" && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,190}$/.test(item)) found.add(item);
      } else visit(child, name);
    }
  };
  visit(frozenCore);
  return [...found].slice(0, 64);
}

@Injectable()
export class P22PublicationBridgeService {
  constructor(@Inject(CONTROL_API_POOL) private readonly pool: Pool) {}

  async materialize(scope: ResearchScope, input: P22BridgeInput): Promise<P22BridgeReceipt> {
    const claims = [...new Set(input.methodologyClaimIds)].filter((value) => /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,190}$/.test(value)).slice(0, 64);
    if (!/^[0-9a-f]{64}$/.test(input.packDigest) || !/^[0-9a-f]{64}$/.test(input.sourceFingerprint) || claims.length === 0) {
      throw new ResearchReleaseCandidateError("RESEARCH_RELEASE_CANDIDATE_UNAVAILABLE", "The sealed pack does not publish a methodology claim identity.", 503);
    }
    return this.transaction(scope, false, async (client) => {
      await this.member(client, scope);
      const facts = await this.finalAudit(client, scope.workspaceId, input.releaseCandidateId);
      if (!facts) throw new ResearchReleaseCandidateError("RESEARCH_RELEASE_CANDIDATE_UNAVAILABLE", "The final-audit source is not published as a READY rrun_ source.", 503);
      const materializationDigest = digest({
        schema_version: "research.p22-run-read-model-bridge.v1",
        workspace_id: scope.workspaceId, release_candidate_id: input.releaseCandidateId,
        final_audit_run_id: facts.runId, pack_digest: input.packDigest,
        source_fingerprint: input.sourceFingerprint, artifact_sha256: facts.artifactSha256,
        artifact_schema_version: facts.artifactSchemaVersion, methodology_claim_ids: claims,
      });
      const existing = await client.query<{ materialization_digest: string; materialized_at_utc_ms: string | number }>(
        `SELECT materialization_digest, (extract(epoch FROM materialized_at) * 1000)::bigint AS materialized_at_utc_ms
           FROM research.p22_run_read_model_bridges_v1
          WHERE workspace_id = $1 AND release_candidate_id = $2`,
        [scope.workspaceId, input.releaseCandidateId],
      );
      if (existing.rowCount === 1) {
        if (existing.rows[0]!.materialization_digest !== materializationDigest) {
          throw new ResearchReleaseCandidateError("RESEARCH_RELEASE_CANDIDATE_CONFLICT", "The final-audit bridge changed after sealing.", 409);
        }
        return { ...facts, materializationDigest, materializedAtUtcMs: Number(existing.rows[0]!.materialized_at_utc_ms), replayed: true };
      }
      const inserted = await client.query<{ materialized_at_utc_ms: string | number }>(
        `SELECT research.p22_record_run_read_model_bridge(
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::text[],$13,$14,$15,$16
         ) AS materialized_at_utc_ms`,
        [scope.workspaceId, input.releaseCandidateId, facts.runId, "COMPLETED",
          "RESEARCH_P22_FINAL_AUDIT", facts.strategyId, facts.datasetId, facts.sourceCursor,
          facts.artifactSha256, facts.artifactSchemaVersion, facts.ownerUserId, claims,
          input.packDigest, input.sourceFingerprint, materializationDigest, scope.actorUserId],
      );
      if (inserted.rowCount !== 1) throw new ResearchReleaseCandidateError("RESEARCH_RELEASE_CANDIDATE_UNAVAILABLE", "The final-audit bridge receipt could not be stored.", 503);
      return { ...facts, materializationDigest, materializedAtUtcMs: Number(inserted.rows[0]!.materialized_at_utc_ms), replayed: false };
    });
  }

  private async finalAudit(client: PoolClient, workspaceId: string, releaseCandidateId: string): Promise<P22FinalAuditFacts | null> {
    const result = await client.query<{
      run_id: string; parent_run_id: string | null; attempt_id: string; alpha_id: string | null;
      alpha_version_id: string | null; dataset_binding_digest: string; submitted_by_user_id: string;
      selection_id: string | null; selected_trial_id: string | null; artifact_id: string | null;
      manifest_digest: string | null; schema_version: string | null;
    }>(`
      SELECT run.run_id, run.parent_run_id, run.attempt_id, version.alpha_id, version.alpha_version_id,
             run.dataset_binding_digest, run.submitted_by_user_id, selection.selection_id,
             selection.selected_trial_id, artifact.artifact_id, artifact.manifest_digest,
             artifact.schema_version
        FROM research.release_candidate_packs_v1 pack
        JOIN research.runs root ON root.workspace_id = pack.workspace_id AND root.run_id = pack.run_id
        JOIN research.runs run ON run.workspace_id = root.workspace_id
         AND run.run_id ~ '^rrun_' AND run.state = 'READY'
         AND research.p22_final_audit_source_eligible(
               pack.workspace_id, pack.release_candidate_id, run.run_id
             )
        JOIN research.attempts attempt ON attempt.workspace_id = run.workspace_id AND attempt.attempt_id = run.attempt_id
        LEFT JOIN research.alpha_versions version ON version.workspace_id = attempt.workspace_id AND version.alpha_version_id = attempt.alpha_version_id
        LEFT JOIN research.selection_records selection ON selection.workspace_id = run.workspace_id AND selection.selection_id = run.target_selection_id
        LEFT JOIN LATERAL (
          SELECT artifact_id, manifest_digest, schema_version
            FROM research.artifacts artifact
           WHERE artifact.workspace_id = run.workspace_id AND artifact.run_id = run.run_id AND artifact.state = 'SEALED'
           ORDER BY artifact.artifact_revision DESC, artifact.artifact_id ASC LIMIT 1
        ) artifact ON TRUE
       WHERE pack.workspace_id = $1 AND pack.release_candidate_id = $2
         AND version.alpha_id IS NOT NULL AND version.alpha_version_id IS NOT NULL
         AND artifact.manifest_digest IS NOT NULL AND artifact.schema_version IS NOT NULL
       ORDER BY (run.run_id = root.run_id) ASC, run.updated_at DESC, run.run_id ASC LIMIT 1`,
      [workspaceId, releaseCandidateId],
    );
    const row = result.rows[0];
    if (!row || !row.alpha_id || !row.alpha_version_id || !row.artifact_id || !row.manifest_digest || !row.schema_version) return null;
    return {
      runId: row.run_id, parentRunId: row.parent_run_id, attemptId: row.attempt_id,
      alphaId: row.alpha_id, alphaVersionId: row.alpha_version_id, strategyId: row.alpha_id,
      datasetId: row.dataset_binding_digest, sourceCursor: null, status: "READY",
      artifactSha256: `sha256:${row.manifest_digest}`, artifactSchemaVersion: row.schema_version,
      artifactId: row.artifact_id, artifactManifestDigest: row.manifest_digest,
      ownerUserId: row.submitted_by_user_id, selectionId: row.selection_id,
      selectedTrialId: row.selected_trial_id, selectionSequence: row.selected_trial_id ? [row.selected_trial_id] : [],
    };
  }

  private async member(client: PoolClient, scope: ResearchScope): Promise<void> {
    const result = await client.query("SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2", [scope.workspaceId, scope.actorUserId]);
    if (result.rowCount !== 1) throw new ResearchReleaseCandidateError("RESEARCH_RELEASE_CANDIDATE_NOT_FOUND", "Release Candidate was not found.", 404);
  }

  private async transaction<T>(scope: ResearchScope, readOnly: boolean, work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    let began = false;
    try {
      await client.query(readOnly ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY" : "BEGIN"); began = true;
      await client.query("SET LOCAL ROLE " + RESEARCH_DB_RUNTIME_ROLE);
      await client.query("SELECT set_config('statement_timeout', $1, true)", [String(RESEARCH_DB_BUDGET.statementTimeoutMs) + "ms"]);
      await client.query("SELECT set_config('lock_timeout', $1, true)", [String(RESEARCH_DB_BUDGET.lockTimeoutMs) + "ms"]);
      const result = await work(client); await client.query("COMMIT"); began = false; return result;
    } catch (error) {
      if (began) await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof ResearchReleaseCandidateError) throw error;
      const wrapped = new ResearchReleaseCandidateError("RESEARCH_RELEASE_CANDIDATE_UNAVAILABLE", "P22 bridge storage is unavailable.", 503);
      (wrapped as Error & { cause?: unknown }).cause = error; throw wrapped;
    } finally { client.release(); }
  }
}
