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
import { canonicalResearchJson } from "./preflight.service";
import { RESEARCH_DB_BUDGET, RESEARCH_DB_RUNTIME_ROLE, type ResearchScope } from "./contracts";
import { ResearchReleaseCandidateError } from "./release-candidate.error";

type JsonColumn = Record<string, unknown> | string | null;

export interface ReleaseCandidateArtifact {
  artifactId: string;
  manifestDigest: string | null;
  state: "PENDING" | "WRITING" | "SEALED" | "ABORTED" | "CORRUPT" | "MISSING";
  artifactRevision: number;
}

export interface ReleaseCandidateSource {
  runId: string;
  attemptId: string;
  runState: string;
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
}

export interface ReleaseCandidateDraft {
  draftId: string | null;
  revision: number;
  sourceFingerprint: string;
  knownLimitations: string | null;
  proposedUseRestrictions: string | null;
  updatedAtUtcMs: number | null;
}

export interface ReleaseCandidateStoredPack {
  releaseCandidateId: string;
  runId: string;
  packDigest: string;
  sourceFingerprint: string;
  frozenCore: Record<string, unknown>;
  sealedAtUtcMs: number;
  deliveryState: "NOT_DELIVERED" | "PENDING" | "DELIVERED" | "UNKNOWN";
  approvalState: "NOT_APPROVED" | "PENDING" | "APPROVED" | "REJECTED" | "UNKNOWN";
}

export interface ReleaseCandidatePin {
  pinKind: "ALPHA_VERSION" | "RUN" | "REPORT" | "EVIDENCE" | "SPLIT" | "SELECTION" | "CURRENT_SOURCE" | "ARTIFACT";
  sourceRef: string;
  sourceDigest: string | null;
}

interface SourceRow {
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

  async readPack(scope: ResearchScope, releaseCandidateId: string): Promise<ReleaseCandidateStoredPack | null> {
    return this.transaction(scope, true, async (client) => {
      await this.requireMembership(client, scope);
      const result = await client.query<PackRow>(`${this.packSelect()}
        WHERE pack.workspace_id = $1 AND pack.release_candidate_id = $2`, [scope.workspaceId, releaseCandidateId]);
      return result.rowCount === 1 ? this.pack(result.rows[0]!) : null;
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
      const source = await this.requireSnapshot(client, scope.workspaceId, runId);
      this.assertFingerprint(source, input.expectedSourceFingerprint);
      const draft = await this.draftFromClient(client, scope, runId);
      if (!draft || draft.draftId !== input.draftId || draft.revision !== input.expectedDraftRevision) {
        throw new ResearchReleaseCandidateError("RESEARCH_RELEASE_CANDIDATE_CONFLICT", "Release Candidate draft changed; reload it.", 409);
      }
      if (draft.sourceFingerprint !== input.expectedSourceFingerprint) {
        throw new ResearchReleaseCandidateError("RESEARCH_RELEASE_CANDIDATE_CONFLICT", "Evidence changed since composing; review the pack.", 409);
      }
      // The draft/source fence is the idempotency scope.  A retry after a
      // lost 201 must never manufacture another immutable candidate merely
      // because its browser did not receive the first response.
      const existing = await client.query<PackRow>(`${this.packSelect()}
        WHERE pack.workspace_id = $1 AND pack.draft_id = $2 AND pack.source_fingerprint = $3`, [
        scope.workspaceId, draft.draftId, input.expectedSourceFingerprint,
      ]);
      if (existing.rowCount === 1) return this.pack(existing.rows[0]!);

      const releaseCandidateId = newUlid("rc");
      const built = build(source, draft, releaseCandidateId);
      await client.query(
        `INSERT INTO research.release_candidates
           (workspace_id, release_candidate_id, run_id, selection_id, final_audit_run_id,
            manifest_digest, schema_version, lifecycle_state)
         VALUES ($1, $2, $3, $4, $5, $6, 'research.release-candidate-pack.v1', 'SEALED')`,
        [scope.workspaceId, releaseCandidateId, runId, source.selection.selectionId, runId, built.packDigest],
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
             split.projection_revision AS split_revision, split.source_split_digest,
             split.projection_digest AS split_projection_digest, split.readiness AS split_readiness,
             split.projection AS split_projection,
             current_source.artifact_revision AS current_artifact_revision,
             current_source.manifest_digest AS current_manifest_digest,
             current_source.source_transform_digest AS current_source_transform_digest,
             current_source.retained_import_digest,
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
          SELECT snapshot
            FROM research.run_progress_snapshots progress
           WHERE progress.workspace_id = run.workspace_id AND progress.run_id = run.run_id
           ORDER BY progress.received_at DESC LIMIT 1
        ) progress ON TRUE
        LEFT JOIN LATERAL (
          SELECT projection_revision, source_split_digest, projection_digest, readiness, projection
            FROM research.run_split_projections_v1 split
           WHERE split.workspace_id = run.workspace_id AND split.run_id = run.run_id
           ORDER BY split.received_at DESC, split.projection_revision DESC LIMIT 1
        ) split ON TRUE
        LEFT JOIN LATERAL (
          SELECT artifact_revision, manifest_digest, source_transform_digest, retained_import_digest
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
    return {
      runId: row.run_id,
      attemptId: row.attempt_id,
      runState: row.run_state,
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
    };
  }

  private async draftFromClient(client: PoolClient, scope: ResearchScope, runId: string): Promise<ReleaseCandidateDraft | null> {
    const result = await client.query<DraftRow>(
      `SELECT draft_id, revision, source_fingerprint, known_limitations, proposed_use_restrictions,
              (extract(epoch FROM updated_at) * 1000)::bigint AS updated_at_utc_ms
         FROM research.release_candidate_drafts_v1
        WHERE workspace_id = $1 AND run_id = $2 AND actor_user_id = $3`,
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
