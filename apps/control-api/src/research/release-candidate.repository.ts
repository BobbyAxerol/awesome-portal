/**
 * P21 durable Release Candidate storage boundary.
 *
 * The repository reads only Portal-owned Research relations in one scoped
 * transaction. It never opens QuantBT, an artifact locator, HMD, Execution,
 * a broker, or an approval transport. Mutation is limited to an actor-local
 * declaration draft and one immutable local pack/retention-pin insertion.
 */

import { createHash } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import type { Pool, PoolClient } from "pg";

import { newUlid } from "../id";
import { CONTROL_API_POOL } from "../tokens";
import { canonicalResearchJson, sha256ResearchJson } from "./preflight.service";
import { RESEARCH_DB_BUDGET, RESEARCH_DB_RUNTIME_ROLE, type ResearchScope } from "./contracts";
import {
  currentSourceImportDigest,
  type CurrentSourceBatchDigestRow,
  type CurrentSourceTableKind,
} from "./current-source.repository";
import { isDeltaWfoProfile } from "./delta-wfo.profile";
import { ResearchReleaseCandidateError } from "./release-candidate.error";
import { runDisplayLabel, runDisplayOrdinal, runDisplayOrdinalSql } from "./run-display-label";
import type { ReleaseCandidateRetainedLane } from "./release-candidate.retained-lane";
import { readEnriched } from "./enriched-analysis.read";
import { ResearchRetainedAnalyticsV2Schema } from "./retained-analytics-v2.contract";
import { ResearchAllTimeDistributionsSchema } from "./all-time-distributions.contract";
import { CurrentSourceSummarySchema, CurrentSourceTrialPayloadSchema } from "./current-source.payload";
import { DELTA_CAUSAL_INNER_PROFILE } from "./delta-causal-inner.profile";
import { readPinnedAuditProofs } from "./final-audit.read";
import type { VerifiedPinnedAudit } from "./final-audit.contract";

export type { ReleaseCandidateRetainedLane } from "./release-candidate.retained-lane";

type JsonColumn = Record<string, unknown> | string | null;

export interface ReleaseCandidateArtifact {
  artifactId: string;
  manifestDigest: string | null;
  state: "PENDING" | "WRITING" | "SEALED" | "ABORTED" | "CORRUPT" | "MISSING";
  artifactRevision: number;
}

export interface ReleaseCandidateSource {
  verifiedAudit?: VerifiedPinnedAudit;
  runId: string;
  displayLabel?: string | null;
  attemptId: string;
  runState: string;
  /** Same producer-worker head/checkpoint lifecycle; never inferred from a report's presence. */
  lifecycleStatus?: string | null;
  /** Display-only native mapping; never an identity or source-fingerprint input. */
  selectedTrialNativeFacts?: { trial_id: string; source_trial_id: string | null; study_id: string | null };
  runKind: string;
  relationshipKind: string;
  targetSelectionId: string | null;
  requestSpecDigest: string;
  effectiveSpecDigest: string;
  datasetBindingDigest: string;
  engineReleaseId: string;
  artifactRevision: number;
  alpha: {
    alphaId: string | null;
    name: string | null;
    alphaVersionId: string | null;
    codeDigest: string | null;
    entrypoint: string | null;
    lifecycleState: "DRAFT" | "ACTIVE" | "SUPERSEDED" | "ABANDONED" | null;
    declaredContract: JsonColumn;
  };
  producer: {
    adapterContractDigest: string | null;
    manifestDigest: string | null;
    sourceTransformDigest: string | null;
  };
  selection: {
    selectionId: string | null;
    selectedTrialId: string | null;
    parameterBundleDigest: string | null;
    sourceDigest: string | null;
    targetKind: string | null;
  };
  report: {
    reportRevision: string | null;
    frozenCoreDigest: string | null;
    frozenCore: JsonColumn;
    sealedAtUtcMs: number | null;
  };
  evidence: {
    revision: string | null;
    sourceEvidenceDigest: string | null;
    projectionDigest: string | null;
    readiness: string | null;
    projection: JsonColumn;
  };
  methodology: {
    claimText: string | null;
    certificateState: string | null;
    certificateGrade: string | null;
    certificateIssuedAtUtcMs: number | null;
  };
  split: {
    revision: string | null;
    sourceSplitDigest: string | null;
    projectionDigest: string | null;
    readiness: string | null;
    projection: JsonColumn;
  };
  currentSource: {
    artifactRevision: number | null;
    manifestDigest: string | null;
    sourceTransformDigest: string | null;
    retainedImportDigest: string | null;
  };
  artifacts: ReleaseCandidateArtifact[];
  asOfUtcMs: number;
  /**
   * W7: the run's retained (Delta WFO) lane, or null for the P04 fixed
   * profile. A null lane leaves the composition and its fingerprint exactly
   * as they were before the lane existed.
   */
  wfo: ReleaseCandidateRetainedLane | null;
}

export interface ReleaseCandidateDraft {
  draftId: string | null;
  revision: number;
  sourceFingerprint: string;
  knownLimitations: string | null;
  proposedUseRestrictions: string | null;
  updatedAtUtcMs: number | null;
  /** Actor-local lifecycle fact; never part of the source fence or frozen core. */
  sealed?: boolean;
}

export interface ReleaseCandidateStoredPack {
  releaseCandidateId: string;
  runId: string;
  displayLabel?: string | null;
  packDigest: string;
  sourceFingerprint: string;
  frozenCore: Record<string, unknown>;
  sealedAtUtcMs: number;
  deliveryState: "NOT_DELIVERED" | "PENDING" | "DELIVERED" | "UNKNOWN";
  approvalState: "NOT_APPROVED" | "PENDING" | "APPROVED" | "REJECTED" | "UNKNOWN";
}

/**
 * P22 facts the P21 composer prints (audit B2): whether this run's newest
 * candidate has a recorded publication intent, and the newest candidate of the
 * same Alpha that P22 DELIVERED (the "last published rc"), with its frozen
 * field values so the change taxonomy compares digests, never names.
 */
export interface ReleaseCandidatePublicationContext {
  current: { releaseCandidateId: string; state: "PENDING" | "UNKNOWN" | "DELIVERED" | "REFUSED" } | null;
  predecessor: {
    releaseCandidateId: string;
    alphaVersionId: string;
    publishedAtUtcMs: number;
    fields: Record<string, string | null>;
  } | null;
}

export interface ReleaseCandidatePin {
  pinKind: "ALPHA_VERSION" | "RUN" | "REPORT" | "EVIDENCE" | "SPLIT" | "SELECTION" | "CURRENT_SOURCE" | "ARTIFACT";
  sourceRef: string;
  sourceDigest: string | null;
}

interface SourceRow {
  run_lifecycle_status?: string | null;
  run_id: string;
  attempt_id: string;
  run_state: string;
  run_kind: string;
  relationship_kind: string;
  target_selection_id: string | null;
  request_spec_digest: string;
  effective_spec_digest: string;
  dataset_binding_digest: string;
  engine_release_id: string;
  artifact_revision: string | number;
  alpha_id: string | null;
  alpha_name: string | null;
  alpha_version_id: string | null;
  code_digest: string | null;
  entrypoint: string | null;
  lifecycle_state: ReleaseCandidateSource["alpha"]["lifecycleState"];
  declared_contract: JsonColumn;
  adapter_contract_digest: string | null;
  producer_manifest_digest: string | null;
  producer_source_transform_digest: string | null;
  selection_id: string | null;
  selected_trial_id: string | null;
  parameter_bundle_digest: string | null;
  selection_source_digest: string | null;
  selection_target_kind: string | null;
  report_revision: string | null;
  frozen_core_digest: string | null;
  frozen_core: JsonColumn;
  report_sealed_at_utc_ms: string | number | null;
  evidence_revision: string | null;
  source_evidence_digest: string | null;
  evidence_projection_digest: string | null;
  evidence_readiness: string | null;
  evidence_projection: JsonColumn;
  progress_snapshot: JsonColumn;
  split_revision: string | null;
  source_split_digest: string | null;
  split_projection_digest: string | null;
  split_readiness: string | null;
  split_projection: JsonColumn;
  current_artifact_revision: string | number | null;
  current_manifest_digest: string | null;
  current_source_transform_digest: string | null;
  retained_import_digest: string | null;
  execution_profile_id: string | null;
  execution_profile_digest: string | null;
  producer_dataset_binding_digest: string | null;
  current_source_adapter_id: string | null;
  current_profile_id: string | null;
  current_requested_spec_digest: string | null;
  current_effective_spec_digest: string | null;
  current_dataset_binding_digest: string | null;
  current_table_rows: JsonColumn;
  current_total_rows: string | number | null;
  current_summary: JsonColumn;
  current_sealed_artifact_id: string | null;
  as_of_utc_ms: string | number;
}

interface ArtifactRow {
  artifact_id: string;
  manifest_digest: string | null;
  state: ReleaseCandidateArtifact["state"];
  artifact_revision: string | number;
}

interface DraftRow {
  draft_id: string;
  revision: string | number;
  source_fingerprint: string;
  known_limitations: string | null;
  proposed_use_restrictions: string | null;
  updated_at_utc_ms: string | number;
  sealed?: boolean;
}

interface PackRow {
  release_candidate_id: string;
  run_id: string;
  draft_id: string;
  pack_digest: string;
  source_fingerprint: string;
  frozen_core: JsonColumn;
  sealed_at_utc_ms: string | number;
  delivery_state: ReleaseCandidateStoredPack["deliveryState"];
  approval_state: ReleaseCandidateStoredPack["approvalState"];
}

const MAXIMUM_RETAINED_FOLDS = 256;
const MAXIMUM_RETAINED_PARTS = 512;
const RETAINED_TABLE_KINDS: readonly CurrentSourceTableKind[] = ["OBSERVATION", "FOLD", "TRIAL", "CANDIDATE", "SELECTION"];

function safeInteger(value: string | number | null | undefined, label: string): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(numeric) || numeric < 0) {
    throw new ResearchReleaseCandidateError("RESEARCH_RELEASE_CANDIDATE_UNAVAILABLE", `Release Candidate ${label} is incompatible.`, 503);
  }
  return numeric;
}

function jsonRecord(value: JsonColumn, label: string): Record<string, unknown> | null {
  if (value === null) return null;
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    return parsed as Record<string, unknown>;
  } catch {
    throw new ResearchReleaseCandidateError("RESEARCH_RELEASE_CANDIDATE_UNAVAILABLE", `Release Candidate ${label} is incompatible.`, 503);
  }
}

/** Deterministic source fence shared by service tests and write CAS. */
export function releaseCandidateSourceFingerprint(source: ReleaseCandidateSource): string {
  return createHash("sha256").update(canonicalResearchJson({
    run: {
      id: source.runId, attempt_id: source.attemptId, state: source.runState,
      kind: source.runKind, relationship_kind: source.relationshipKind,
      target_selection_id: source.targetSelectionId, request_spec_digest: source.requestSpecDigest,
      effective_spec_digest: source.effectiveSpecDigest, dataset_binding_digest: source.datasetBindingDigest,
      engine_release_id: source.engineReleaseId, artifact_revision: source.artifactRevision,
    },
    alpha: {
      alpha_id: source.alpha.alphaId, alpha_version_id: source.alpha.alphaVersionId,
      code_digest: source.alpha.codeDigest, entrypoint: source.alpha.entrypoint,
      lifecycle_state: source.alpha.lifecycleState, declared_contract: source.alpha.declaredContract,
    },
    producer: source.producer,
    selection: source.selection,
    report: {
      report_revision: source.report.reportRevision, frozen_core_digest: source.report.frozenCoreDigest,
      sealed_at_utc_ms: source.report.sealedAtUtcMs,
    },
    evidence: {
      revision: source.evidence.revision, source_evidence_digest: source.evidence.sourceEvidenceDigest,
      projection_digest: source.evidence.projectionDigest, readiness: source.evidence.readiness,
    },
    methodology: source.methodology,
    split: {
      revision: source.split.revision, source_split_digest: source.split.sourceSplitDigest,
      projection_digest: source.split.projectionDigest, readiness: source.split.readiness,
    },
    current_source: source.currentSource,
    artifacts: source.artifacts.map((artifact) => ({
      artifact_id: artifact.artifactId, manifest_digest: artifact.manifestDigest,
      state: artifact.state, artifact_revision: artifact.artifactRevision,
    })),
    // W7: present only on the retained lane, so a P04 fingerprint is unchanged.
    ...(!source.wfo ? {} : { retained_lane: source.wfo }),
    ...(source.verifiedAudit ? { linked_final_audit: source.verifiedAudit } : {}),
  }), "utf8").digest("hex");
}

@Injectable()
export class ResearchReleaseCandidateRepository {
  constructor(@Inject(CONTROL_API_POOL) private readonly pool: Pool) {}

  async snapshot(scope: ResearchScope, runId: string): Promise<ReleaseCandidateSource | null> {
    return this.transaction(scope, true, async (client) => {
      await this.requireMembership(client, scope);
      return this.snapshotFromClient(client, scope.workspaceId, runId);
    });
  }

  async draft(scope: ResearchScope, runId: string): Promise<ReleaseCandidateDraft | null> {
    return this.transaction(scope, true, async (client) => {
      await this.requireMembership(client, scope);
      return this.draftFromClient(client, scope, runId);
    });
  }

  async latestPack(scope: ResearchScope, runId: string): Promise<ReleaseCandidateStoredPack | null> {
    return this.transaction(scope, true, async (client) => {
      await this.requireMembership(client, scope);
      const result = await client.query<PackRow>(`${this.packSelect()}
        WHERE pack.workspace_id = $1 AND pack.run_id = $2
        ORDER BY pack.sealed_at DESC, pack.release_candidate_id DESC LIMIT 1`, [scope.workspaceId, runId]);
      return result.rowCount === 1 ? this.pack(result.rows[0]!) : null;
    });
  }

  /** P22 publication facts for the composer; one read-only snapshot, bounded to two rows. */
  async publicationContext(
    scope: ResearchScope,
    input: { alphaId: string | null; releaseCandidateId: string | null },
  ): Promise<ReleaseCandidatePublicationContext> {
    return this.transaction(scope, true, async (client) => {
      await this.requireMembership(client, scope);
      let current: ReleaseCandidatePublicationContext["current"] = null;
      if (input.releaseCandidateId !== null) {
        const found = await client.query<{ release_candidate_id: string; state: string }>(
          `SELECT release_candidate_id, state FROM research.release_candidate_publications_v1
            WHERE workspace_id = $1 AND release_candidate_id = $2`,
          [scope.workspaceId, input.releaseCandidateId],
        );
        const row = found.rows[0];
        if (row && ["PENDING", "UNKNOWN", "DELIVERED", "REFUSED"].includes(row.state)) {
          current = { releaseCandidateId: row.release_candidate_id, state: row.state as "PENDING" | "UNKNOWN" | "DELIVERED" | "REFUSED" };
        }
      }
      let predecessor: ReleaseCandidatePublicationContext["predecessor"] = null;
      if (input.alphaId !== null) {
        const found = await client.query<{ release_candidate_id: string; alpha_version_id: string; published_at_utc_ms: string | number; frozen_core: JsonColumn }>(
          `SELECT pub.release_candidate_id, pub.alpha_version_id,
                  (extract(epoch FROM pub.published_at) * 1000)::bigint AS published_at_utc_ms, pack.frozen_core
             FROM research.release_candidate_publications_v1 pub
             JOIN research.release_candidate_packs_v1 pack
               ON pack.workspace_id = pub.workspace_id AND pack.release_candidate_id = pub.release_candidate_id
            WHERE pub.workspace_id = $1 AND pub.alpha_id = $2 AND pub.state = 'DELIVERED'
              AND ($3::text IS NULL OR pub.release_candidate_id <> $3)
            ORDER BY pub.published_at DESC, pub.release_candidate_id DESC
            LIMIT 1`,
          [scope.workspaceId, input.alphaId, input.releaseCandidateId],
        );
        const row = found.rows[0];
        if (row) {
          const core = jsonRecord(row.frozen_core, "published predecessor");
          const fields: Record<string, string | null> = {};
          for (const item of Array.isArray(core?.fields) ? core.fields : []) {
            const fieldRow = item && typeof item === "object" ? item as Record<string, unknown> : null;
            if (fieldRow && typeof fieldRow.key === "string") {
              fields[fieldRow.key] = typeof fieldRow.value === "string" ? fieldRow.value : null;
            }
          }
          predecessor = {
            releaseCandidateId: row.release_candidate_id, alphaVersionId: row.alpha_version_id,
            publishedAtUtcMs: safeInteger(row.published_at_utc_ms, "publication timestamp"), fields,
          };
        }
      }
      return { current, predecessor };
    });
  }

  async readPack(scope: ResearchScope, releaseCandidateId: string): Promise<ReleaseCandidateStoredPack | null> {
    return this.transaction(scope, true, async (client) => {
      await this.requireMembership(client, scope);
      const result = await client.query<PackRow>(`${this.packSelect()}
        WHERE pack.workspace_id = $1 AND pack.release_candidate_id = $2`, [scope.workspaceId, releaseCandidateId]);
      if (result.rowCount !== 1) return null;
      const pack = this.pack(result.rows[0]!);
      return { ...pack, displayLabel: await this.readDisplayLabel(client, scope.workspaceId, pack.runId) };
    });
  }

  async patchDraft(
    scope: ResearchScope,
    runId: string,
    input: {
      expectedRevision: number;
      expectedSourceFingerprint: string;
      knownLimitations: string | null;
      proposedUseRestrictions: string | null;
    },
  ): Promise<{ source: ReleaseCandidateSource; draft: ReleaseCandidateDraft }> {
    return this.transaction(scope, false, async (client) => {
      await this.requireMembership(client, scope);
      await this.lockRun(client, scope.workspaceId, runId);
      const existingDraft = await this.draftFromClient(client, scope, runId);
      if (existingDraft?.sealed) throw this.alreadySealed();
      const source = await this.requireSnapshot(client, scope.workspaceId, runId);
      this.assertFingerprint(source, input.expectedSourceFingerprint);
      if (input.expectedRevision === 0) {
        const inserted = await client.query<DraftRow>(
          `INSERT INTO research.release_candidate_drafts_v1
             (workspace_id, run_id, actor_user_id, draft_id, source_fingerprint, known_limitations, proposed_use_restrictions)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (workspace_id, run_id, actor_user_id) DO NOTHING
           RETURNING draft_id, revision, source_fingerprint, known_limitations, proposed_use_restrictions,
             (extract(epoch FROM updated_at) * 1000)::bigint AS updated_at_utc_ms`,
          [scope.workspaceId, runId, scope.actorUserId, newUlid("rcd"), input.expectedSourceFingerprint, input.knownLimitations, input.proposedUseRestrictions],
        );
        if (inserted.rowCount === 1) return { source, draft: this.draftRow(inserted.rows[0]!) };
      } else {
        const updated = await client.query<DraftRow>(
          `UPDATE research.release_candidate_drafts_v1
              SET source_fingerprint = $5,
                  known_limitations = $6,
                  proposed_use_restrictions = $7,
                  revision = revision + 1,
                  updated_at = now()
            WHERE workspace_id = $1 AND run_id = $2 AND actor_user_id = $3 AND revision = $4
           RETURNING draft_id, revision, source_fingerprint, known_limitations, proposed_use_restrictions,
             (extract(epoch FROM updated_at) * 1000)::bigint AS updated_at_utc_ms`,
          [scope.workspaceId, runId, scope.actorUserId, input.expectedRevision, input.expectedSourceFingerprint, input.knownLimitations, input.proposedUseRestrictions],
        );
        if (updated.rowCount === 1) return { source, draft: this.draftRow(updated.rows[0]!) };
      }
      throw new ResearchReleaseCandidateError("RESEARCH_RELEASE_CANDIDATE_CONFLICT", "Release Candidate draft changed; reload it.", 409);
    });
  }

  async seal(
    scope: ResearchScope,
    runId: string,
    input: { draftId: string; expectedDraftRevision: number; expectedSourceFingerprint: string },
    build: (source: ReleaseCandidateSource, draft: ReleaseCandidateDraft, releaseCandidateId: string) => {
      frozenCore: Record<string, unknown>;
      packDigest: string;
      pins: ReleaseCandidatePin[];
    },
  ): Promise<ReleaseCandidateStoredPack> {
    return this.transaction(scope, false, async (client) => {
      await this.requireMembership(client, scope);
      await this.lockRun(client, scope.workspaceId, runId);
      const draft = await this.draftFromClient(client, scope, runId);
      if (!draft || draft.draftId !== input.draftId || draft.revision !== input.expectedDraftRevision) {
        throw new ResearchReleaseCandidateError("RESEARCH_RELEASE_CANDIDATE_CONFLICT", "Release Candidate draft changed; reload it.", 409);
      }
      if (draft.sourceFingerprint !== input.expectedSourceFingerprint) {
        if (draft.sealed) throw this.alreadySealed();
        throw new ResearchReleaseCandidateError("RESEARCH_RELEASE_CANDIDATE_CONFLICT", "Evidence changed since composing; review the pack.", 409);
      }
      // Replay the caller's exact sealed draft before consulting mutable
      // source facts. A lost 201 stays retryable even if the source evolves;
      // another actor's pack never freezes or satisfies this actor's draft.
      const existing = await client.query<PackRow>(`${this.packSelect()}
        JOIN research.release_candidate_drafts_v1 sealed_draft
          ON sealed_draft.workspace_id = pack.workspace_id AND sealed_draft.draft_id = pack.draft_id
        WHERE pack.workspace_id = $1 AND pack.run_id = $2 AND pack.draft_id = $3
          AND sealed_draft.actor_user_id = $4 AND pack.source_fingerprint = $5
        LIMIT 1`, [
        scope.workspaceId, runId, draft.draftId, scope.actorUserId, input.expectedSourceFingerprint,
      ]);
      if (existing.rowCount === 1) {
        const pack = this.pack(existing.rows[0]!);
        const declarations = pack.frozenCore.draft;
        // Refuse a historical draft modified by an older writer after seal.
        // Returning its old pack would silently ignore the new declarations.
        if (!declarations || typeof declarations !== "object" || Array.isArray(declarations)
          || (declarations as Record<string, unknown>).known_limitations !== draft.knownLimitations
          || (declarations as Record<string, unknown>).proposed_use_restrictions !== draft.proposedUseRestrictions) {
          throw this.alreadySealed();
        }
        return pack;
      }
      if (draft.sealed) throw this.alreadySealed();
      const source = await this.requireSnapshot(client, scope.workspaceId, runId);
      this.assertFingerprint(source, input.expectedSourceFingerprint);

      const releaseCandidateId = newUlid("rc");
      const built = build(source, draft, releaseCandidateId);
      await client.query(
        `INSERT INTO research.release_candidates
           (workspace_id, release_candidate_id, run_id, selection_id, final_audit_run_id,
            manifest_digest, schema_version, lifecycle_state)
         VALUES ($1, $2, $3, $4, $5, $6, 'research.release-candidate-pack.v1', 'SEALED')`,
        [scope.workspaceId, releaseCandidateId, runId, source.selection.selectionId,
          built.frozenCore.linked_final_audit
            ? (built.frozenCore.linked_final_audit as VerifiedPinnedAudit).child_run_id : runId, built.packDigest],
      );
      await client.query(
        `INSERT INTO research.release_candidate_packs_v1
           (workspace_id, release_candidate_id, run_id, draft_id, pack_digest, source_fingerprint,
            schema_version, frozen_core, sealed_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, 'research.release-candidate-pack.v1', $7::jsonb, $8)`,
        [scope.workspaceId, releaseCandidateId, runId, draft.draftId, built.packDigest, input.expectedSourceFingerprint, canonicalResearchJson(built.frozenCore), scope.actorUserId],
      );
      await client.query(
        `INSERT INTO research.release_candidate_delivery_states_v1
           (workspace_id, release_candidate_id, delivery_state, approval_state)
         VALUES ($1, $2, 'NOT_DELIVERED', 'NOT_APPROVED')`, [scope.workspaceId, releaseCandidateId],
      );
      for (const pin of built.pins) {
        await client.query(
          `INSERT INTO research.release_candidate_retention_pins_v1
             (workspace_id, release_candidate_id, pin_kind, source_ref, source_digest)
           VALUES ($1, $2, $3, $4, $5)`,
          [scope.workspaceId, releaseCandidateId, pin.pinKind, pin.sourceRef, pin.sourceDigest],
        );
      }
      for (const artifact of source.artifacts.filter((item) => item.state === "SEALED")) {
        await client.query(
          `INSERT INTO research.artifact_references
             (workspace_id, artifact_id, reference_kind, reference_id, pinned_until)
           VALUES ($1, $2, 'RELEASE_CANDIDATE', $3, NULL)
           ON CONFLICT DO NOTHING`, [scope.workspaceId, artifact.artifactId, releaseCandidateId],
        );
      }
      await client.query(
        `INSERT INTO research.audit_log
           (workspace_id, audit_id, actor_user_id, action, subject_type, subject_id, after_ref, metadata)
         VALUES ($1, $2, $3, 'RESEARCH_RELEASE_CANDIDATE_LOCAL_SEALED', 'release_candidate', $4, $5, $6::jsonb)`,
        [
          scope.workspaceId,
          newUlid("aud"),
          scope.actorUserId,
          releaseCandidateId,
          built.packDigest,
          canonicalResearchJson({
            run_id: runId,
            draft_id: draft.draftId,
            source_fingerprint: input.expectedSourceFingerprint,
            delivery_state: "NOT_DELIVERED",
            approval_state: "NOT_APPROVED",
          }),
        ],
      );
      const inserted = await client.query<PackRow>(`${this.packSelect()}
        WHERE pack.workspace_id = $1 AND pack.release_candidate_id = $2`, [scope.workspaceId, releaseCandidateId]);
      if (inserted.rowCount !== 1) {
        throw new ResearchReleaseCandidateError("RESEARCH_RELEASE_CANDIDATE_UNAVAILABLE", "Release Candidate pack was not readable after sealing.", 503);
      }
      return this.pack(inserted.rows[0]!);
    });
  }

  private async requireSnapshot(client: PoolClient, workspaceId: string, runId: string): Promise<ReleaseCandidateSource> {
    const source = await this.snapshotFromClient(client, workspaceId, runId);
    if (!source) throw new ResearchReleaseCandidateError("RESEARCH_RELEASE_CANDIDATE_NOT_FOUND", "Research run was not found.", 404);
    return source;
  }

  private async snapshotFromClient(client: PoolClient, workspaceId: string, runId: string): Promise<ReleaseCandidateSource | null> {
    const result = await client.query<SourceRow>(`
      SELECT run.run_id, run.attempt_id, run.state AS run_state, run.run_kind, run.relationship_kind,
             run.target_selection_id, run.request_spec_digest, run.effective_spec_digest,
             run.dataset_binding_digest, run.engine_release_id, run.artifact_revision,
             version.alpha_id, alpha.name AS alpha_name, version.alpha_version_id, version.code_digest,
             version.entrypoint, version.lifecycle_state, version.declared_contract,
             producer.adapter_contract_digest, producer.manifest_digest AS producer_manifest_digest,
             NULL::text AS producer_source_transform_digest,
             selection.selection_id, selection.selected_trial_id, selection.parameter_bundle_digest,
             selection.source_digest AS selection_source_digest, selection.target_kind AS selection_target_kind,
             report.report_revision, report.frozen_core_digest, report.frozen_core,
             (extract(epoch FROM report.sealed_at) * 1000)::bigint AS report_sealed_at_utc_ms,
             evidence.projection_revision AS evidence_revision, evidence.source_evidence_digest,
             evidence.projection_digest AS evidence_projection_digest, evidence.readiness AS evidence_readiness,
             evidence.projection AS evidence_projection,
             progress.snapshot AS progress_snapshot,
             research.run_lifecycle_status_v1(job.state, run.state, producer.run_id IS NOT NULL,
               progress.snapshot->>'status', head.event_type IN ('run_completed','run_failed'),
               checkpoint.source_sequence IS NOT NULL) AS run_lifecycle_status,
             split.projection_revision AS split_revision, split.source_split_digest,
             split.projection_digest AS split_projection_digest, split.readiness AS split_readiness,
             split.projection AS split_projection,
             current_source.artifact_revision AS current_artifact_revision,
             current_source.manifest_digest AS current_manifest_digest,
             current_source.source_transform_digest AS current_source_transform_digest,
             current_source.retained_import_digest,
             producer.execution_profile_id, producer.execution_profile_digest,
             producer.dataset_binding_digest AS producer_dataset_binding_digest,
             current_source.source_adapter_id AS current_source_adapter_id,
             current_source.profile_id AS current_profile_id,
             current_source.requested_spec_digest AS current_requested_spec_digest,
             current_source.effective_spec_digest AS current_effective_spec_digest,
             current_source.dataset_binding_digest AS current_dataset_binding_digest,
             current_source.table_rows AS current_table_rows,
             current_source.total_rows AS current_total_rows,
             current_source.summary AS current_summary,
             current_source.sealed_artifact_id AS current_sealed_artifact_id,
             floor(extract(epoch FROM transaction_timestamp()) * 1000)::bigint AS as_of_utc_ms
        FROM research.runs run
        JOIN research.attempts attempt
          ON attempt.workspace_id = run.workspace_id AND attempt.attempt_id = run.attempt_id
        LEFT JOIN research.alpha_versions version
          ON version.workspace_id = attempt.workspace_id AND version.alpha_version_id = attempt.alpha_version_id
        LEFT JOIN research.alphas alpha
          ON alpha.workspace_id = version.workspace_id AND alpha.alpha_id = version.alpha_id
        LEFT JOIN research.run_producers producer
          ON producer.workspace_id = run.workspace_id AND producer.run_id = run.run_id
        LEFT JOIN research.jobs job
          ON job.workspace_id = producer.workspace_id AND job.job_id = producer.job_id
        LEFT JOIN research.selection_records selection
          ON selection.workspace_id = run.workspace_id AND selection.selection_id = run.target_selection_id
        LEFT JOIN LATERAL (
          SELECT report_revision, frozen_core_digest, frozen_core, sealed_at
            FROM research.run_report_manifests_v1 report
           WHERE report.workspace_id = run.workspace_id AND report.run_id = run.run_id
           ORDER BY report.sealed_at DESC, report.report_revision DESC LIMIT 1
        ) report ON TRUE
        LEFT JOIN LATERAL (
          SELECT projection_revision, source_evidence_digest, projection_digest, readiness, projection
            FROM research.run_evidence_projections_v1 evidence
           WHERE evidence.workspace_id = run.workspace_id AND evidence.run_id = run.run_id
           ORDER BY evidence.received_at DESC, evidence.projection_revision DESC LIMIT 1
        ) evidence ON TRUE
        LEFT JOIN LATERAL (
          SELECT snapshot, worker_attempt_id, source_latest_sequence
            FROM research.run_progress_snapshots progress
           WHERE progress.workspace_id = run.workspace_id AND progress.run_id = run.run_id
             AND progress.worker_attempt_id = producer.worker_attempt_id
           ORDER BY progress.received_at DESC LIMIT 1
        ) progress ON TRUE
        LEFT JOIN research.run_progress_events head
          ON head.workspace_id = run.workspace_id AND head.run_id = run.run_id
         AND head.worker_attempt_id = progress.worker_attempt_id
         AND head.source_sequence = progress.source_latest_sequence
        LEFT JOIN research.run_terminal_materializations_v1 checkpoint
          ON checkpoint.workspace_id = head.workspace_id AND checkpoint.run_id = head.run_id
         AND checkpoint.worker_attempt_id = head.worker_attempt_id AND checkpoint.source_sequence = head.source_sequence
        LEFT JOIN LATERAL (
          SELECT projection_revision, source_split_digest, projection_digest, readiness, projection
            FROM research.run_split_projections_v1 split
           WHERE split.workspace_id = run.workspace_id AND split.run_id = run.run_id
           ORDER BY split.received_at DESC, split.projection_revision DESC LIMIT 1
        ) split ON TRUE
        LEFT JOIN LATERAL (
          SELECT current_source.artifact_revision, current_source.manifest_digest, current_source.source_transform_digest,
                 current_source.retained_import_digest, current_source.source_adapter_id, current_source.profile_id,
                 current_source.requested_spec_digest, current_source.effective_spec_digest,
                 current_source.dataset_binding_digest, current_source.table_rows, current_source.total_rows,
                 current_source.summary,
                 -- W7: the SEALED P05 artifact this seal's manifest names (same
                 -- revision, same manifest); never the preflight manifest.
                 (SELECT sealed.artifact_id
                    FROM research.artifacts sealed
                   WHERE sealed.workspace_id = current_source.workspace_id AND sealed.run_id = current_source.run_id
                     AND sealed.artifact_revision = current_source.artifact_revision
                     AND sealed.manifest_digest = current_source.manifest_digest AND sealed.state = 'SEALED'
                   ORDER BY sealed.artifact_id ASC LIMIT 1) AS sealed_artifact_id
            FROM research.current_source_seals_v1 current_source
           WHERE current_source.workspace_id = run.workspace_id AND current_source.run_id = run.run_id
           ORDER BY current_source.artifact_revision DESC LIMIT 1
        ) current_source ON TRUE
       WHERE run.workspace_id = $1 AND run.run_id = $2`, [workspaceId, runId]);
    if (result.rowCount !== 1) return null;
    const row = result.rows[0]!;
    const artifactRows = await client.query<ArtifactRow>(
      `SELECT artifact_id, manifest_digest, state, artifact_revision
         FROM research.artifacts
        WHERE workspace_id = $1 AND run_id = $2
        ORDER BY artifact_revision ASC, artifact_id ASC`, [workspaceId, runId],
    );
    const wfo = await this.retainedLane(client, workspaceId, runId, row);
    const selectedTrialNativeFacts = await this.selectedTrialNativeFacts(client, workspaceId, runId, wfo);
    const verifiedAudit = (await readPinnedAuditProofs(client,workspaceId,[runId])).get(runId);
    return {
      runId: row.run_id,
      displayLabel: await this.readDisplayLabel(client, workspaceId, row.run_id),
      attemptId: row.attempt_id,
      runState: row.run_state,
      lifecycleStatus: row.run_lifecycle_status ?? null,
      runKind: row.run_kind,
      relationshipKind: row.relationship_kind,
      targetSelectionId: row.target_selection_id,
      requestSpecDigest: row.request_spec_digest,
      effectiveSpecDigest: row.effective_spec_digest,
      datasetBindingDigest: row.dataset_binding_digest,
      engineReleaseId: row.engine_release_id,
      artifactRevision: safeInteger(row.artifact_revision, "artifact revision"),
      alpha: {
        alphaId: row.alpha_id, name: row.alpha_name, alphaVersionId: row.alpha_version_id,
        codeDigest: row.code_digest, entrypoint: row.entrypoint, lifecycleState: row.lifecycle_state,
        declaredContract: row.declared_contract,
      },
      producer: {
        adapterContractDigest: row.adapter_contract_digest,
        manifestDigest: row.producer_manifest_digest,
        sourceTransformDigest: row.producer_source_transform_digest,
      },
      selection: {
        selectionId: row.selection_id, selectedTrialId: row.selected_trial_id,
        parameterBundleDigest: row.parameter_bundle_digest, sourceDigest: row.selection_source_digest,
        targetKind: row.selection_target_kind,
      },
      report: {
        reportRevision: row.report_revision, frozenCoreDigest: row.frozen_core_digest,
        frozenCore: row.frozen_core, sealedAtUtcMs: row.report_sealed_at_utc_ms === null ? null : safeInteger(row.report_sealed_at_utc_ms, "report timestamp"),
      },
      evidence: {
        revision: row.evidence_revision, sourceEvidenceDigest: row.source_evidence_digest,
        projectionDigest: row.evidence_projection_digest, readiness: row.evidence_readiness,
        projection: row.evidence_projection,
      },
      methodology: this.methodology(row.progress_snapshot),
      split: {
        revision: row.split_revision, sourceSplitDigest: row.source_split_digest,
        projectionDigest: row.split_projection_digest, readiness: row.split_readiness,
        projection: row.split_projection,
      },
      currentSource: {
        artifactRevision: row.current_artifact_revision === null ? null : safeInteger(row.current_artifact_revision, "current-source artifact revision"),
        manifestDigest: row.current_manifest_digest, sourceTransformDigest: row.current_source_transform_digest,
        retainedImportDigest: row.retained_import_digest,
      },
      artifacts: artifactRows.rows.map((artifact) => ({
        artifactId: artifact.artifact_id, manifestDigest: artifact.manifest_digest,
        state: artifact.state, artifactRevision: safeInteger(artifact.artifact_revision, "artifact revision"),
      })),
      asOfUtcMs: safeInteger(row.as_of_utc_ms, "snapshot timestamp"),
      wfo,
      ...(selectedTrialNativeFacts ? { selectedTrialNativeFacts } : {}),
      ...(verifiedAudit ? { verifiedAudit } : {}),
    };
  }

  /**
   * W7 · the retained-lane facts of a Delta WFO run, read in the same
   * REPEATABLE READ snapshot as the rest of the composition. A P04 run (any
   * other execution profile) answers null and its composition is unchanged.
   */
  private async retainedLane(client: PoolClient, workspaceId: string, runId: string, row: SourceRow): Promise<ReleaseCandidateRetainedLane | null> {
    if (row.execution_profile_id === null || !isDeltaWfoProfile(row.execution_profile_id, row.execution_profile_digest)) return null;
    const claim = this.claimFacts(row.progress_snapshot);
    const base = {
      executionProfileId: row.execution_profile_id,
      executionProfileDigest: row.execution_profile_digest,
      producerDatasetBindingDigest: row.producer_dataset_binding_digest,
      claimState: claim.state,
      handoffParamsDigest: claim.handoffParamsDigest,
    };
    if (row.current_artifact_revision === null) {
      return { ...base, seal: null, sealedArtifactId: null, partDigests: [], observedImportDigest: null, folds: [] };
    }
    const revision = safeInteger(row.current_artifact_revision, "current-source artifact revision");
    const folds = await client.query<{ source_ordinal: string | number; source_id: string; payload: JsonColumn }>(
      `SELECT source_ordinal, source_id, payload
         FROM research.current_source_rows_v1
        WHERE workspace_id = $1 AND run_id = $2 AND artifact_revision = $3 AND table_kind = 'FOLD'
        ORDER BY source_ordinal ASC
        LIMIT ${MAXIMUM_RETAINED_FOLDS + 1}`, [workspaceId, runId, revision],
    );
    const batches = await client.query<CurrentSourceBatchDigestRow>(
      `SELECT table_kind, batch_ordinal, batch_digest, row_count
         FROM research.current_source_import_batches_v1
        WHERE workspace_id = $1 AND run_id = $2 AND artifact_revision = $3
        ORDER BY table_kind ASC, batch_ordinal ASC`, [workspaceId, runId, revision],
    );
    const parts = row.current_sealed_artifact_id === null ? { rows: [] as Array<{ part_digest: string }> } : await client.query<{ part_digest: string }>(
      `SELECT part_digest
         FROM research.artifact_parts
        WHERE workspace_id = $1 AND artifact_id = $2
        ORDER BY table_kind ASC, part_ordinal ASC
        LIMIT ${MAXIMUM_RETAINED_PARTS}`, [workspaceId, row.current_sealed_artifact_id],
    );
    const seal = {
      artifactRevision: revision,
      sourceAdapterId: row.current_source_adapter_id ?? "",
      profileId: row.current_profile_id ?? "",
      manifestDigest: row.current_manifest_digest ?? "",
      sourceTransformDigest: row.current_source_transform_digest ?? "",
      retainedImportDigest: row.retained_import_digest ?? "",
      requestedSpecDigest: row.current_requested_spec_digest ?? "",
      effectiveSpecDigest: row.current_effective_spec_digest ?? "",
      datasetBindingDigest: row.current_dataset_binding_digest ?? "",
      tableRows: this.tableRows(row.current_table_rows),
      totalRows: safeInteger(row.current_total_rows, "current-source row count"),
      summary: jsonRecord(row.current_summary, "current-source summary"),
    };
    return {
      ...base,
      seal: {
        ...seal,
        ...await this.retainedCompanions(client, workspaceId, runId, seal),
      },
      sealedArtifactId: row.current_sealed_artifact_id,
      partDigests: parts.rows.map((part) => part.part_digest),
      observedImportDigest: (batches.rowCount ?? 0) > 0 ? currentSourceImportDigest(batches.rows) : null,
      folds: folds.rows.map((fold) => ({
        sourceOrdinal: safeInteger(fold.source_ordinal, "retained fold ordinal"),
        sourceId: fold.source_id,
        payload: jsonRecord(fold.payload, "retained fold row"),
      })),
    };
  }

  /** Read and verify the same immutable companions canonical Evidence revision uses. */
  private async retainedCompanions(
    client: PoolClient, workspaceId: string, runId: string, seal: NonNullable<ReleaseCandidateRetainedLane["seal"]>,
  ): Promise<Pick<NonNullable<ReleaseCandidateRetainedLane["seal"]>, "enrichedAnalysis" | "analyticsSidecar" | "distributionsSidecar">> {
    const unavailable = () => new ResearchReleaseCandidateError("RESEARCH_RELEASE_CANDIDATE_UNAVAILABLE",
      "Retained Report companion binding is incompatible.", 503);
    const enrichedAnalysis = await readEnriched(client, workspaceId, runId, unavailable);
    const result = await client.query<Record<string, unknown>>(
      `SELECT analytics.retained_import_digest AS analytics_import_digest,
              analytics.source_rows_digest AS analytics_source_rows_digest,
              analytics.analytics_digest, analytics.analytics,
              distributions.retained_import_digest AS distributions_import_digest,
              distributions.source_rows_digest AS distributions_source_rows_digest,
              distributions.distributions_digest, distributions.distributions
         FROM research.current_source_seals_v1 seal
         LEFT JOIN research.current_source_analytics_sidecars_v2 analytics
           ON analytics.workspace_id = seal.workspace_id AND analytics.run_id = seal.run_id
          AND analytics.artifact_revision = seal.artifact_revision
         LEFT JOIN research.current_source_distributions_v1 distributions
           ON distributions.workspace_id = seal.workspace_id AND distributions.run_id = seal.run_id
          AND distributions.artifact_revision = seal.artifact_revision
        WHERE seal.workspace_id = $1 AND seal.run_id = $2 AND seal.artifact_revision = $3
          AND seal.retained_import_digest = $4`,
      [workspaceId, runId, seal.artifactRevision, seal.retainedImportDigest],
    );
    const row = result.rows[0];
    const companions: Awaited<ReturnType<ResearchReleaseCandidateRepository["retainedCompanions"]>> = {
      ...(enrichedAnalysis ? { enrichedAnalysis } : {}),
    };
    const isDigest = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
    if (row?.analytics != null) {
      const analytics = ResearchRetainedAnalyticsV2Schema.safeParse(row.analytics);
      if (!analytics.success || sha256ResearchJson(analytics.data) !== row.analytics_digest
        || !isDigest(row.analytics_source_rows_digest) || row.analytics_import_digest !== seal.retainedImportDigest
        || (seal.summary as Record<string, unknown> | null)?.summary_analytics_v2 !== undefined) throw unavailable();
      companions.analyticsSidecar = { digest: row.analytics_digest as string,
        sourceRowsDigest: row.analytics_source_rows_digest, analytics: analytics.data };
    }
    if (row?.distributions != null) {
      const distributions = ResearchAllTimeDistributionsSchema.safeParse(row.distributions);
      if (!distributions.success || sha256ResearchJson(distributions.data) !== row.distributions_digest
        || !isDigest(row.distributions_source_rows_digest) || row.distributions_import_digest !== seal.retainedImportDigest
        || (companions.analyticsSidecar && row.distributions_source_rows_digest !== companions.analyticsSidecar.sourceRowsDigest)
        || distributions.data.oos_observation_count > seal.tableRows.OBSERVATION) throw unavailable();
      companions.distributionsSidecar = { digest: row.distributions_digest as string, distributions: distributions.data };
    }
    return companions;
  }

  private async selectedTrialNativeFacts(
    client: PoolClient, workspaceId: string, runId: string, lane: ReleaseCandidateRetainedLane | null,
  ): Promise<ReleaseCandidateSource["selectedTrialNativeFacts"]> {
    const seal = lane?.seal;
    if (!seal || seal.profileId !== DELTA_CAUSAL_INNER_PROFILE.current_source.profile_id) return undefined;
    const summary = CurrentSourceSummarySchema.safeParse(seal.summary);
    const trialId = summary.success ? summary.data.selection.trial_id : null;
    if (trialId === null) return undefined;
    const result = await client.query<{ payload: unknown }>(
      `SELECT payload FROM research.current_source_rows_v1
        WHERE workspace_id = $1 AND run_id = $2 AND artifact_revision = $3
          AND table_kind = 'TRIAL' AND source_id = $4 LIMIT 1`,
      [workspaceId, runId, seal.artifactRevision, trialId],
    );
    const trial = CurrentSourceTrialPayloadSchema.safeParse(result.rows[0]?.payload);
    if (!trial.success || trial.data.trial_id !== trialId || !trial.data.trial_facts) return undefined;
    return { trial_id: trial.data.trial_id, source_trial_id: trial.data.trial_facts.source_trial_id,
      study_id: trial.data.trial_facts.study_id };
  }

  private tableRows(value: JsonColumn): Record<CurrentSourceTableKind, number> {
    const rows = jsonRecord(value, "current-source table rows") ?? {};
    return Object.fromEntries(RETAINED_TABLE_KINDS.map((kind) => [
      kind, safeInteger(rows[kind] as string | number | null, `current-source ${kind} count`),
    ])) as Record<CurrentSourceTableKind, number>;
  }

  /** The progress claim's state and hand-off parameter digest (typed absence when not published). */
  private claimFacts(snapshot: JsonColumn): { state: string | null; handoffParamsDigest: string | null } {
    const value = snapshot === null ? null : jsonRecord(snapshot, "progress claim snapshot");
    const claim = value?.claim && typeof value.claim === "object" && !Array.isArray(value.claim) ? value.claim as Record<string, unknown> : null;
    const cursor = claim?.handoff_cursor && typeof claim.handoff_cursor === "object" ? claim.handoff_cursor as Record<string, unknown> : null;
    const paramsDigest = cursor?.params_digest;
    return {
      state: typeof claim?.state === "string" && /^[A-Z][A-Z0-9_]{1,63}$/.test(claim.state) ? claim.state : null,
      handoffParamsDigest: typeof paramsDigest === "string" && /^[0-9a-f]{64}$/.test(paramsDigest) ? paramsDigest : null,
    };
  }

  private async draftFromClient(client: PoolClient, scope: ResearchScope, runId: string): Promise<ReleaseCandidateDraft | null> {
    const result = await client.query<DraftRow>(
      `SELECT draft.draft_id, draft.revision, draft.source_fingerprint, draft.known_limitations, draft.proposed_use_restrictions,
              (extract(epoch FROM draft.updated_at) * 1000)::bigint AS updated_at_utc_ms,
              EXISTS (SELECT 1 FROM research.release_candidate_packs_v1 pack
                       WHERE pack.workspace_id = draft.workspace_id AND pack.draft_id = draft.draft_id) AS sealed
         FROM research.release_candidate_drafts_v1 draft
        WHERE draft.workspace_id = $1 AND draft.run_id = $2 AND draft.actor_user_id = $3`,
      [scope.workspaceId, runId, scope.actorUserId],
    );
    return result.rowCount === 1 ? this.draftRow(result.rows[0]!) : null;
  }

  private draftRow(row: DraftRow): ReleaseCandidateDraft {
    return {
      draftId: row.draft_id, revision: safeInteger(row.revision, "draft revision"),
      sourceFingerprint: row.source_fingerprint, knownLimitations: row.known_limitations,
      proposedUseRestrictions: row.proposed_use_restrictions,
      updatedAtUtcMs: safeInteger(row.updated_at_utc_ms, "draft timestamp"),
      sealed: row.sealed === true,
    };
  }

  private methodology(snapshot: JsonColumn): ReleaseCandidateSource["methodology"] {
    if (snapshot === null) {
      return { claimText: null, certificateState: null, certificateGrade: null, certificateIssuedAtUtcMs: null };
    }
    // `claim` was introduced by P11.  Older, otherwise-valid snapshots may
    // not carry it at all; that is a typed missing release fact, not an
    // incompatible source response.  A malformed outer snapshot remains a
    // 503 because it is the persisted source envelope itself that is broken.
    const value = jsonRecord(snapshot, "progress methodology snapshot");
    const claimValue = value?.claim;
    const claim = claimValue === null || claimValue === undefined
      ? null
      : jsonRecord(claimValue as JsonColumn, "progress claim");
    const certificateValue = claim?.methodology_certificate;
    const certificate = certificateValue === null || certificateValue === undefined
      ? null
      : jsonRecord(certificateValue as JsonColumn, "progress methodology certificate");
    const rawIssued = certificate?.issued_at_utc_ms;
    const issuedAt = typeof rawIssued === "number" && Number.isSafeInteger(rawIssued) && rawIssued >= 0 ? rawIssued : null;
    return {
      claimText: typeof claim?.text === "string" && claim.text.length > 0 && claim.text.length <= 1_024 ? claim.text : null,
      certificateState: typeof certificate?.state === "string" ? certificate.state : null,
      certificateGrade: typeof certificate?.grade === "string" ? certificate.grade : null,
      certificateIssuedAtUtcMs: issuedAt,
    };
  }

  private pack(row: PackRow): ReleaseCandidateStoredPack {
    const frozenCore = jsonRecord(row.frozen_core, "frozen pack") ?? {};
    return {
      releaseCandidateId: row.release_candidate_id, runId: row.run_id, packDigest: row.pack_digest,
      sourceFingerprint: row.source_fingerprint, frozenCore,
      sealedAtUtcMs: safeInteger(row.sealed_at_utc_ms, "pack timestamp"),
      deliveryState: row.delivery_state, approvalState: row.approval_state,
    };
  }

  private packSelect() {
    return `SELECT pack.release_candidate_id, pack.run_id, pack.draft_id, pack.pack_digest, pack.source_fingerprint,
                   pack.frozen_core, (extract(epoch FROM pack.sealed_at) * 1000)::bigint AS sealed_at_utc_ms,
                   delivery.delivery_state, delivery.approval_state
              FROM research.release_candidate_packs_v1 pack
              JOIN research.release_candidate_delivery_states_v1 delivery
                ON delivery.workspace_id = pack.workspace_id
               AND delivery.release_candidate_id = pack.release_candidate_id`;
  }

  private assertFingerprint(source: ReleaseCandidateSource, expected: string): void {
    if (releaseCandidateSourceFingerprint(source) !== expected) {
      throw new ResearchReleaseCandidateError("RESEARCH_RELEASE_CANDIDATE_CONFLICT", "Evidence changed since composing; review the pack.", 409);
    }
  }

  private alreadySealed(): ResearchReleaseCandidateError {
    return new ResearchReleaseCandidateError("RESEARCH_RELEASE_CANDIDATE_CONFLICT",
      "This declaration draft is already sealed; its immutable evidence pack cannot be changed.", 409,
      { reason_code: "P21_ALREADY_SEALED" });
  }

  private async readDisplayLabel(client: PoolClient, workspaceId: string, runId: string): Promise<string | null> {
    const result = await client.query<{ display_profile_id: string | null; display_ordinal: string | null }>(
      `SELECT producer.execution_profile_id AS display_profile_id,
              ${runDisplayOrdinalSql("run", "producer")} AS display_ordinal
         FROM research.runs run
         LEFT JOIN research.run_producers producer
           ON producer.workspace_id = run.workspace_id AND producer.run_id = run.run_id
        WHERE run.workspace_id = $1 AND run.run_id = $2`,
      [workspaceId, runId],
    );
    const row = result.rows[0];
    return runDisplayLabel(row?.display_profile_id, runDisplayOrdinal(row?.display_ordinal));
  }

  private async requireMembership(client: PoolClient, scope: ResearchScope): Promise<void> {
    const member = await client.query("SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2", [scope.workspaceId, scope.actorUserId]);
    if (member.rowCount !== 1) throw new ResearchReleaseCandidateError("RESEARCH_RELEASE_CANDIDATE_FORBIDDEN", "Access denied.", 403);
  }

  private async lockRun(client: PoolClient, workspaceId: string, runId: string): Promise<void> {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))", [workspaceId, runId]);
  }

  private async transaction<T>(scope: ResearchScope, readOnly: boolean, work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    let began = false;
    try {
      await client.query(readOnly ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY" : "BEGIN");
      began = true;
      await client.query(`SET LOCAL ROLE ${RESEARCH_DB_RUNTIME_ROLE}`);
      await client.query("SELECT set_config('statement_timeout', $1, true)", [`${RESEARCH_DB_BUDGET.statementTimeoutMs}ms`]);
      await client.query("SELECT set_config('lock_timeout', $1, true)", [`${RESEARCH_DB_BUDGET.lockTimeoutMs}ms`]);
      await client.query("SELECT set_config('idle_in_transaction_session_timeout', $1, true)", [`${RESEARCH_DB_BUDGET.idleTransactionTimeoutMs}ms`]);
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
      if (code === "40001" || code === "40P01" || code === "23505" || code === "23514") {
        throw new ResearchReleaseCandidateError("RESEARCH_RELEASE_CANDIDATE_CONFLICT", "Release Candidate changed concurrently; reload it.", 409);
      }
      const wrapped = new ResearchReleaseCandidateError("RESEARCH_RELEASE_CANDIDATE_UNAVAILABLE", "Release Candidate service is temporarily unavailable.", 503);
      (wrapped as Error & { cause?: unknown }).cause = error;
      throw wrapped;
    } finally {
      client.release();
    }
  }
}
