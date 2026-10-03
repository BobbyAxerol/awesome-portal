/** P22 publication through the existing R1 create service and read-only mirror. */
import { createHash } from "node:crypto";
import { Inject, Injectable, Optional } from "@nestjs/common";
import type { ControlApiConfig } from "../config";
import type { PortalUser } from "../domain";
import { CONTROL_API_CONFIG } from "../tokens";
import { ApprovalCreateRequestSchema } from "../governance/contracts";
import { GovernanceError, GovernanceService } from "../governance/governance.service";
import type { ResearchScope } from "./contracts";
import { canonicalResearchJson } from "./preflight.service";
import {
  ResearchAlphaVersionPublicationResponseSchema,
  ResearchReleaseCandidateApprovalMirrorSchema,
  ResearchReleaseCandidatePublicationResponseSchema,
  type ResearchAlphaVersionPublicationResponse,
  type ResearchReleaseCandidatePublicationResponse,
  type ResearchReleaseCandidatePublishRequest,
} from "./release-candidate-publication.contract";
import {
  ResearchReleaseCandidatePublicationRepository,
  type PublicationIntent,
} from "./release-candidate-publication.repository";
import { ResearchReleaseCandidateError } from "./release-candidate.error";
import { ResearchReleaseCandidateRepository } from "./release-candidate.repository";
import { ResearchReleaseCandidateService } from "./release-candidate.service";
import { P22PublicationBridgeService, sealedPackMethodologyClaimIds, type P22BridgeReceipt } from "./p22-publication-bridge.service";
import { publishBlockedAction } from "./release-candidate-publish-action";
import { VerifiedPinnedAuditSchema } from "./final-audit.contract";

type Source = ResearchReleaseCandidatePublicationResponse["source"];
type Relation = ResearchReleaseCandidatePublicationResponse["candidate_relation"];
interface Ready {
  runId: string; alphaId: string; alphaVersionId: string; packDigest: string;
  sourceFingerprint: string; source: Source; relation: Relation; blocked: string | null;
}
const digest = (value: unknown) => createHash("sha256").update(canonicalResearchJson(value), "utf8").digest("hex");
const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
/** A new publication intent is refused while intake is off; recorded intents keep reconciling. */
export const P22_PUBLICATION_INTAKE_DISABLED = "P22_PUBLICATION_INTAKE_DISABLED";
/** The idempotency key the server uses when the browser names none. */
export const publicationRequestKey = (releaseCandidateId: string) => `rcpub:${releaseCandidateId}`;
/** The R1 summary the server writes when the browser names none: the sealed pack's own identity only. */
export const publicationSummary = (releaseCandidateId: string, packDigest: string, runId: string) =>
  `Release candidate ${releaseCandidateId} · pack sha256:${packDigest} · evidence run ${runId}`;

@Injectable()
export class ResearchReleaseCandidatePublicationService {
  constructor(
    private readonly repository: ResearchReleaseCandidatePublicationRepository,
    private readonly packs: ResearchReleaseCandidateRepository,
    private readonly candidate: ResearchReleaseCandidateService,
    private readonly governance: GovernanceService,
    @Optional() @Inject(CONTROL_API_CONFIG) private readonly config?: Pick<ControlApiConfig, "FEATURE_RESEARCH_RELEASE_CANDIDATE_PUBLICATION">,
    @Optional() private readonly bridge?: P22PublicationBridgeService,
  ) {}

  /** FEATURE_RESEARCH_RELEASE_CANDIDATE_PUBLICATION: new intake only; dark unless named "true". */
  private get intakeOpen(): boolean {
    return this.config?.FEATURE_RESEARCH_RELEASE_CANDIDATE_PUBLICATION === "true";
  }

  async publication(scope: ResearchScope, user: PortalUser, id: string): Promise<ResearchReleaseCandidatePublicationResponse> {
    this.actor(scope, user);
    // The pack read enforces the same feature/profile gate as P21.
    await this.candidate.pack(scope, id);
    const intent = await this.repository.read(scope, id);
    if (!intent) {
      const ready = await this.readiness(scope, user, id, true, this.intakeOpen);
      return this.response({
        id, ready, state: "NOT_PUBLISHED", mayPublish: ready.blocked === null,
        blocked: ready.blocked, published: null, approvalRead: "NOT_PUBLISHED", approval: null,
        replayed: false,
      });
    }
    const latest = await this.packs.latestPack(scope, intent.runId);
    const relation: Relation = !latest ? "UNKNOWN" : latest.releaseCandidateId === id ? "CURRENT" : "SUPERSEDED";
    const ready = intent.state === "DELIVERED" || intent.state === "REFUSED"
      ? this.fromIntent(intent, relation)
      : await this.readiness(scope, user, id, false);
    const sourceMatches = ready.source.legacy_artifact_sha256 === intent.legacyArtifactSha256
      && ready.packDigest === intent.packDigest && ready.sourceFingerprint === intent.sourceFingerprint;
    const canRetry = (intent.state === "PENDING" || intent.state === "UNKNOWN")
      && intent.actorUserId === user.userId && relation === "CURRENT" && sourceMatches && ready.blocked === null;
    const mirror = intent.state === "DELIVERED"
      ? await this.readMirror(scope, user, intent, relation)
      : { state: "NOT_PUBLISHED" as const, approval: null };
    const published = intent.state === "DELIVERED" && intent.approvalId && intent.receiptDigest && intent.publishedAtUtcMs !== null
      ? { by_user_id: intent.actorUserId, by_username: intent.actorUsername, approval_id: intent.approvalId,
        at_utc_ms: intent.publishedAtUtcMs, receipt_digest: intent.receiptDigest }
      : null;
    const blocked = canRetry ? null
      : relation === "SUPERSEDED" ? "P22_RELEASE_CANDIDATE_SUPERSEDED"
        : relation === "UNKNOWN" ? "P22_RELEASE_CANDIDATE_CURRENTNESS_UNKNOWN"
          : intent.actorUserId !== user.userId ? "P22_PUBLICATION_OWNED_BY_ANOTHER_ACTOR"
            : intent.state === "REFUSED" ? intent.lastErrorCode ?? "P22_GOVERNANCE_REFUSED"
              : intent.state === "DELIVERED" ? "P22_ALREADY_DELIVERED"
                : ready.blocked === "P22_CURRENT_SOURCE_CHANGED" ? ready.blocked
                  : !sourceMatches ? "P22_SOURCE_PIN_CHANGED" : ready.blocked;
    return this.response({
      id, ready: { ...ready, relation }, state: intent.state, mayPublish: canRetry, blocked,
      published, approvalRead: mirror.state, approval: mirror.approval, replayed: false, intent,
    });
  }

  /** OL-13 named read for S01/S02; absence is typed and no candidate scan reaches the browser. */
  async alphaVersionPublication(
    scope: ResearchScope, user: PortalUser, alphaVersionId: string,
  ): Promise<ResearchAlphaVersionPublicationResponse> {
    this.actor(scope, user);
    const releaseCandidateId = await this.repository.latestDeliveredByAlphaVersion(scope, alphaVersionId);
    const response = releaseCandidateId === null
      ? {
          schema_version: "research.alpha-version-publication.v1" as const,
          alpha_version_id: alphaVersionId, availability: "NOT_PUBLISHED" as const,
          reason_code: "P22_ALPHA_VERSION_PUBLICATION_NOT_PUBLISHED",
          publication: null, as_of_utc_ms: Date.now(),
        }
      : {
          schema_version: "research.alpha-version-publication.v1" as const,
          alpha_version_id: alphaVersionId, availability: "AVAILABLE" as const,
          reason_code: null, publication: await this.publication(scope, user, releaseCandidateId),
          as_of_utc_ms: Date.now(),
        };
    const parsed = ResearchAlphaVersionPublicationResponseSchema.safeParse(response);
    if (!parsed.success) this.unavailable();
    return parsed.data;
  }

  async publish(
    scope: ResearchScope, user: PortalUser, id: string,
    input: ResearchReleaseCandidatePublishRequest, requestId: string,
  ): Promise<ResearchReleaseCandidatePublicationResponse> {
    this.actor(scope, user);
    if (input.workspace_id !== undefined && input.workspace_id !== scope.workspaceId) this.notFound();
    const existing = await this.repository.read(scope, id);
    // The key and summary the server writes when the browser names none are
    // derived from the stored intent or pack, so a replay derives the same bytes.
    const saved = existing ? record(existing.requestPayload.downstream_request) : null;
    const stored = existing ? null : await this.packs.readPack(scope, id);
    const requestKey = input.request_key ?? (existing ? existing.requestKey : publicationRequestKey(id));
    const summary = input.summary ?? (saved && typeof saved.summary === "string"
      ? saved.summary
      : publicationSummary(id, stored?.packDigest ?? input.expected_pack_digest, stored?.runId ?? existing?.runId ?? ""));
    const payloadDigest = digest({
      workspace_id: scope.workspaceId, actor_user_id: user.userId, release_candidate_id: id,
      expected_pack_digest: input.expected_pack_digest, request_key: requestKey,
      methodology_claim_id: input.methodology_claim_id, summary,
    });
    if (existing) {
      if (existing.actorUserId !== user.userId || existing.payloadDigest !== payloadDigest) this.conflict();
      if (existing.state === "DELIVERED" || existing.state === "REFUSED") {
        const result = await this.publication(scope, user, id);
        return { ...result, replayed: true };
      }
      const current = await this.publication(scope, user, id);
      if (!current.may_publish) return current;
      await this.repository.pending(scope, id);
      return this.execute(scope, user, id, existing, requestId, true);
    }
    const ready = await this.readiness(scope, user, id, true, this.intakeOpen);
    if (ready.packDigest !== input.expected_pack_digest) this.conflict();
    if (ready.blocked !== null) {
      return this.response({
        id, ready, state: "NOT_PUBLISHED", mayPublish: false, blocked: ready.blocked,
        published: null, approvalRead: "NOT_PUBLISHED", approval: null, replayed: false,
      });
    }
    if (!ready.source.eligible_methodology_claim_ids.includes(input.methodology_claim_id)) {
      return this.response({
        id, ready, state: "NOT_PUBLISHED", mayPublish: false, blocked: "P22_METHODOLOGY_CLAIM_NOT_PUBLISHED",
        published: null, approvalRead: "NOT_PUBLISHED", approval: null, replayed: false,
      });
    }
    const downstream = ApprovalCreateRequestSchema.safeParse({
      schema_version: "governance.approval-create-request.v1", workspace_id: scope.workspaceId,
      request_key: requestKey, gate: "R1", alpha_id: ready.alphaId,
      evidence_run_id: ready.runId, methodology_claim_id: input.methodology_claim_id, summary,
    });
    if (!downstream.success || !ready.source.legacy_artifact_sha256 || !ready.source.artifact_schema_version) this.unavailable();
    const payload = { downstream_request: downstream.data, source: ready.source };
    const begun = await this.repository.begin(scope, {
      releaseCandidateId: id, runId: ready.runId, alphaId: ready.alphaId,
      alphaVersionId: ready.alphaVersionId, actorUsername: user.username,
      requestKey, payloadDigest, requestPayload: payload,
      packDigest: ready.packDigest, sourceFingerprint: ready.sourceFingerprint,
      legacyArtifactSha256: ready.source.legacy_artifact_sha256,
      artifactSchemaVersion: ready.source.artifact_schema_version,
      methodologyClaimId: input.methodology_claim_id,
    });
    if (begun.intent.actorUserId !== user.userId || begun.intent.payloadDigest !== payloadDigest) this.conflict();
    if (begun.intent.state === "DELIVERED" || begun.intent.state === "REFUSED") return this.publication(scope, user, id);
    if (begun.replayed) await this.repository.pending(scope, id);
    return this.execute(scope, user, id, begun.intent, requestId, begun.replayed);
  }

  private async execute(
    scope: ResearchScope, user: PortalUser, id: string,
    intent: PublicationIntent, requestId: string, replayed: boolean,
  ): Promise<ResearchReleaseCandidatePublicationResponse> {
    let bridgeReceipt: P22BridgeReceipt | null = null;
    try {
      const request = ApprovalCreateRequestSchema.safeParse(intent.requestPayload.downstream_request);
      if (!request.success || request.data.workspace_id !== scope.workspaceId
        || request.data.request_key !== intent.requestKey || request.data.gate !== "R1"
        || request.data.alpha_id !== intent.alphaId || request.data.evidence_run_id !== intent.runId
        || request.data.methodology_claim_id !== intent.methodologyClaimId || intent.actorUserId !== user.userId) {
        await this.repository.refused(scope, id, "P22_SAVED_REQUEST_INVALID");
        return this.publication(scope, user, id);
      }
      // Older in-memory P22 test doubles may not expose the additive attempt
      // counter; production repository always does. Do not turn a legacy
      // double into a false downstream UNKNOWN outcome.
      const attempt = (this.repository as ResearchReleaseCandidatePublicationRepository & { attempt?: (scope: ResearchScope, id: string) => Promise<void> }).attempt;
      if (attempt) await attempt.call(this.repository, scope, id);
      if (this.bridge) {
        const pack = await this.packs.readPack(scope, id);
        const claims = pack ? sealedPackMethodologyClaimIds(pack.frozenCore) : [];
        if (claims.length > 0) {
          bridgeReceipt = await this.bridge.materialize(scope, {
            releaseCandidateId: id, packDigest: intent.packDigest,
            sourceFingerprint: intent.sourceFingerprint, methodologyClaimIds: claims,
          });
        }
      }
      const created = await this.governance.createApproval(user, {
        workspaceId: scope.workspaceId, requestKey: request.data.request_key,
        alphaId: request.data.alpha_id, evidenceRunId: request.data.evidence_run_id,
        methodologyClaimId: request.data.methodology_claim_id, summary: request.data.summary,
        expectedArtifactSha256: intent.legacyArtifactSha256,
      }, requestId);
      const approval = record(created.approval);
      const requester = record(approval?.requester);
      const approvalId = approval?.approval_id;
      const evidenceSetHash = approval?.evidence_set_hash;
      const status = approval?.status;
      const createdAt = approval?.created_at;
      if (created.schema_version !== "governance.approval-create.v1" || typeof created.replayed !== "boolean"
        || typeof approvalId !== "string" || typeof evidenceSetHash !== "string"
        || !/^sha256:[0-9a-f]{64}$/.test(evidenceSetHash)
        || approval?.gate !== "R1" || approval?.subject_id !== intent.alphaId
        || requester?.user_id !== user.userId
        || !["PENDING","APPROVED","APPROVED_WITH_CONDITION","DENIED","CHANGES_REQUESTED","EXPIRED"].includes(String(status))
        || typeof createdAt !== "string" || !Number.isFinite(Date.parse(createdAt))) {
        throw new Error("R1 acknowledgement failed exact publication identity checks.");
      }
      const pinVerified = await this.governance.verifyPublicationPin(user, scope.workspaceId, approvalId, {
        alphaId: intent.alphaId, runId: intent.runId, sha256: intent.legacyArtifactSha256,
        schemaVersion: intent.artifactSchemaVersion, evidenceSetHash,
      });
      if (!pinVerified) {
        await this.repository.unknown(scope, id, "P22_APPROVAL_PIN_UNVERIFIED");
        return this.publication(scope, user, id);
      }
      const receipt = {
        schema_version: created.schema_version, replayed: created.replayed,
        approval_id: approvalId, evidence_set_hash: evidenceSetHash,
        subject_id: intent.alphaId, evidence_run_id: intent.runId, status,
        created_at: createdAt,
      };
      const approvalStatus = status as "PENDING" | "APPROVED" | "APPROVED_WITH_CONDITION" | "DENIED" | "CHANGES_REQUESTED" | "EXPIRED";
      await this.repository.finish(scope, id, {
        approvalId, evidenceSetHash, receiptDigest: digest(receipt), receipt,
        publishedAtUtcMs: Date.parse(createdAt), approvalStatus,
        ...(bridgeReceipt ? { promotionPick: {
          attemptId: bridgeReceipt.attemptId, runId: bridgeReceipt.runId, alphaVersionId: bridgeReceipt.alphaVersionId,
          selectionId: bridgeReceipt.selectionId, selectedTrialId: bridgeReceipt.selectedTrialId,
          selectionSequence: bridgeReceipt.selectionSequence, artifactId: bridgeReceipt.artifactId,
          artifactManifestDigest: bridgeReceipt.artifactManifestDigest, packDigest: intent.packDigest,
          evidenceSetHash, factDigest: digest({ approval_id: approvalId, run_id: bridgeReceipt.runId,
            selected_trial_id: bridgeReceipt.selectedTrialId, artifact_id: bridgeReceipt.artifactId,
            pack_digest: intent.packDigest, evidence_set_hash: evidenceSetHash }),
        } } : {}),
      });
      const result = await this.publication(scope, user, id);
      return { ...result, replayed: replayed || created.replayed };
    } catch (error) {
      // A reversible access denial, serialization conflict, timeout or rate
      // limit is not a final refusal; retain the original actor/key for replay.
      const retryable = error instanceof GovernanceError
        && (error.code === "APPROVAL_CREATE_SERIALIZATION_CONFLICT" || [403, 408, 429].includes(error.status));
      const refused = error instanceof GovernanceError && error.status >= 400 && error.status < 500 && !retryable;
      const code = refused ? "P22_GOVERNANCE_REFUSED" : "P22_DOWNSTREAM_OUTCOME_UNKNOWN";
      const details = error instanceof GovernanceError && error.details
        ? { conflictingApprovalId: typeof error.details.approval_id === "string" ? error.details.approval_id : null }
        : undefined;
      await (refused ? this.repository.refused(scope, id, code, details) : this.repository.unknown(scope, id, code, details));
      return this.publication(scope, user, id);
    }
  }

  private async readiness(scope: ResearchScope, user: PortalUser, id: string, refresh: boolean, intake = true): Promise<Ready> {
    const pack = await this.packs.readPack(scope, id);
    if (!pack) this.notFound();
    const frozen = pack.frozenCore;
    const fields = Array.isArray(frozen.fields) ? frozen.fields.map(record).filter((value): value is Record<string, unknown> => value !== null) : [];
    const value = (key: string): string | null => {
      const found = fields.find((item) => item.key === key);
      return record(found?.availability)?.state === "AVAILABLE" && typeof found?.value === "string" ? found.value : null;
    };
    const alphaId = value("alpha_id") ?? "unbound";
    const alphaVersionId = value("alpha_version_id") ?? "unbound";
    const finalAudit = value("final_audit_run_id");
    const latest = await this.packs.latestPack(scope, pack.runId);
    const relation: Relation = !latest ? "UNKNOWN" : latest.releaseCandidateId === id ? "CURRENT" : "SUPERSEDED";
    const notChecked: Source = {
      availability: "NOT_CHECKED", reason_code: "P22_SOURCE_NOT_CHECKED", run_status: null,
      legacy_artifact_sha256: null, artifact_schema_version: null,
      eligible_methodology_claim_ids: [], captured_at: null,
    };
    const base = { runId: pack.runId, alphaId, alphaVersionId, packDigest: pack.packDigest,
      sourceFingerprint: pack.sourceFingerprint, source: notChecked, relation };
    if (digest(frozen) !== pack.packDigest || frozen.source_fingerprint !== pack.sourceFingerprint)
      return { ...base, blocked: "P22_PACK_INTEGRITY_FAILED" };
    const linkedAudit = VerifiedPinnedAuditSchema.safeParse(frozen.linked_final_audit);
    const linkedToParent = linkedAudit.success && linkedAudit.data.result.parent_run_id === pack.runId
      && linkedAudit.data.child_run_id === finalAudit;
    if ((frozen.linked_final_audit !== undefined ? !linkedToParent : finalAudit !== pack.runId)
      || alphaId === "unbound" || alphaVersionId === "unbound")
      return { ...base, blocked: "P22_FINAL_AUDIT_NOT_LINKED" };
    if (relation !== "CURRENT")
      return { ...base, blocked: relation === "SUPERSEDED" ? "P22_RELEASE_CANDIDATE_SUPERSEDED" : "P22_RELEASE_CANDIDATE_CURRENTNESS_UNKNOWN" };
    const composed = await this.candidate.detail(scope, pack.runId);
    if (composed.source_fingerprint !== pack.sourceFingerprint || composed.local_seal.release_candidate_id !== id
      || composed.local_seal.state !== "SEALED_LOCAL" || composed.local_seal.availability.state !== "AVAILABLE"
      || composed.run.binding?.alpha_id !== alphaId || composed.run.binding.alpha_version_id !== alphaVersionId
      || composed.run.binding.lifecycle_state !== "ACTIVE") return { ...base, blocked: "P22_CURRENT_SOURCE_CHANGED" };
    // Intake off: no RunSync refresh and no Governance read for a candidate
    // that has no recorded intent; nothing downstream is contacted.
    if (!intake) return { ...base, blocked: P22_PUBLICATION_INTAKE_DISABLED };
    // The P22 bridge is the producer of the legacy RunSync-shaped row for a
    // retained rrun_. Materialize that exact, sealed source before asking
    // Governance to read it. The previous order attempted a RunSync refresh
    // first, so a valid retained WFO run was reported as source-unavailable
    // and the browser could never reach the POST that materialized the row.
    let bridgeReceipt: P22BridgeReceipt | null = null;
    if (this.bridge) {
      const claims = sealedPackMethodologyClaimIds(frozen);
      if (claims.length > 0) {
        try {
          bridgeReceipt = await this.bridge.materialize(scope, {
            releaseCandidateId: id, packDigest: pack.packDigest,
            sourceFingerprint: pack.sourceFingerprint, methodologyClaimIds: claims,
          });
        } catch {
          bridgeReceipt = null;
        }
      }
    }
    let fact: Awaited<ReturnType<GovernanceService["publicationEvidence"]>>;
    try {
      // A successful bridge already produced the exact row. Re-running the
      // legacy source refresh can only mask that row when rrun_ has no legacy
      // source adapter, so refresh stays enabled solely for the legacy path.
      fact = await this.governance.publicationEvidence(user, scope.workspaceId, pack.runId, refresh && bridgeReceipt === null);
    }
    catch { fact = null; }
    if (!fact) return { ...base, source: { ...notChecked, availability: "UNAVAILABLE", reason_code: "P22_GOVERNANCE_SOURCE_UNAVAILABLE" }, blocked: "P22_GOVERNANCE_SOURCE_UNAVAILABLE" };
    const governanceClaims = [...new Set(fact.methodology_claim_ids.filter((item) => typeof item === "string" && item.length > 0 && item.length <= 191))].slice(0, 64);
    // OL-06 / CG-P22-01: once the P22 bridge is wired, methodology identity
    // comes from the sealed P21 pack. The legacy RunSync read may still supply
    // artifact/status facts, but it cannot create or widen claim authority.
    const claims = this.bridge ? sealedPackMethodologyClaimIds(frozen) : governanceClaims;
    const sha = /^sha256:[0-9a-f]{64}$/.test(fact.artifact_sha256) ? fact.artifact_sha256 : null;
    const schemaVersion = typeof fact.artifact_schema_version === "string" && fact.artifact_schema_version.length > 0 && fact.artifact_schema_version.length <= 191 ? fact.artifact_schema_version : null;
    const runStatus = /^[A-Z][A-Z0-9_]{0,63}$/.test(fact.status) ? fact.status : null;
    const capturedAt = Number.isFinite(Date.parse(fact.captured_at)) ? fact.captured_at : null;
    const complete = sha !== null && schemaVersion !== null && runStatus !== null && claims.length > 0 && capturedAt !== null;
    const source: Source = {
      availability: complete ? "AVAILABLE" : "PARTIAL",
      reason_code: complete ? null : "P22_SOURCE_FACTS_PARTIAL",
      run_status: runStatus, legacy_artifact_sha256: sha, artifact_schema_version: schemaVersion,
      eligible_methodology_claim_ids: claims, captured_at: capturedAt,
    };
    const blocked = fact.run_id !== pack.runId || fact.alpha_id !== alphaId ? "P22_ALPHA_MAPPING_MISMATCH"
      : !["COMPLETED", "SUCCEEDED", "COMPLETE"].includes(fact.status) ? "P22_RUN_NOT_TERMINAL"
        : !complete ? "P22_SOURCE_FACTS_PARTIAL" : null;
    return { ...base, source, blocked };
  }

  private fromIntent(intent: PublicationIntent, relation: Relation): Ready {
    const source = record(intent.requestPayload.source);
    if (!source) this.unavailable();
    return {
      runId: intent.runId, alphaId: intent.alphaId, alphaVersionId: intent.alphaVersionId,
      packDigest: intent.packDigest, sourceFingerprint: intent.sourceFingerprint,
      source: source as Source, relation, blocked: relation === "CURRENT" ? null : "P22_RELEASE_CANDIDATE_SUPERSEDED",
    };
  }

  private async readMirror(scope: ResearchScope, user: PortalUser, intent: PublicationIntent, relation: Relation) {
    if (!intent.approvalId || !intent.evidenceSetHash) return { state: "UNAVAILABLE" as const, approval: null };
    try {
      const result = await this.governance.detail(user, scope.workspaceId, intent.approvalId);
      const data = record(result.data);
      const approval = record(data?.approval);
      const requester = record(approval?.requester);
      const manifest = record(data?.evidence_manifest);
      const entries = Array.isArray(manifest?.entries) ? manifest.entries.map(record).filter((item): item is Record<string, unknown> => item !== null) : [];
      const pin = entries.length === 1 ? entries[0]! : null;
      if (result.schema_version !== "governance.r1-review.v1"
        || approval?.approval_id !== intent.approvalId || approval?.gate !== "R1"
        || approval?.subject_id !== intent.alphaId || requester?.user_id !== intent.actorUserId
        || approval?.evidence_set_hash !== intent.evidenceSetHash || manifest?.manifest_hash !== intent.evidenceSetHash
        || pin?.artifact_id !== intent.runId || pin?.sha256 !== intent.legacyArtifactSha256
        || pin?.schema_version !== intent.artifactSchemaVersion || pin?.source_reference !== intent.runId
        || pin?.verification !== "SERVER_PINNED" || pin?.source_authority !== "RESEARCH")
        return { state: "UNAVAILABLE" as const, approval: null };
      const conditions = Array.isArray(data?.known_limitations)
        ? data.known_limitations.map(record).filter((item): item is Record<string, unknown> => item !== null).map((item) => ({
          limitation_id: item.limitation_id, kind: item.kind, label: item.label,
          statement: item.statement, expires_at: item.expires_at,
        })) : [];
      const decisions = Array.isArray(data?.decisions)
        ? data.decisions.map(record).filter((item): item is Record<string, unknown> => item !== null)
        : [];
      const decisionOutcomes = decisions
        .map((item) => ({ actor: record(item.actor), outcome: item.outcome }))
        .filter((item) => item.actor && typeof item.actor.user_id === "string" && typeof item.outcome === "string")
        .map((item) => ({ actor_user_id: item.actor!.user_id as string, outcome: item.outcome as string }));
      const conditionCount = decisions.reduce((count, item) =>
        count + (Array.isArray(item.conditions) ? item.conditions.length : 0), 0);
      const rawPool = Array.isArray(data?.assignee_pool) ? data.assignee_pool : approval.assignee_pool;
      const assigneePoolPublished = Array.isArray(rawPool);
      const assigneePool = assigneePoolPublished
        ? rawPool.map(record).filter((item): item is Record<string, unknown> => item !== null)
            .filter((item) => typeof item.user_id === "string" && typeof item.username === "string" && typeof item.role === "string")
            .map((item) => ({ user_id: item.user_id as string, username: item.username as string, role: item.role as string }))
        : [];
      const readAtUtcMs = Date.parse(String(result.read_at));
      const mirror = {
        approval_id: approval.approval_id, gate: "R1", status: approval.status,
        subject_id: approval.subject_id, requester_user_id: requester.user_id,
        evidence_set_hash: approval.evidence_set_hash,
        sla_due_at: approval.sla_due_at, expires_at: approval.expires_at,
        created_at: approval.created_at, read_at: result.read_at, conditions,
        href: "/governance/approvals/" + intent.approvalId + "/r1",
        assignee_pool_availability: assigneePoolPublished
          ? { state: "AVAILABLE", reason_code: null }
          : { state: "NOT_PUBLISHED", reason_code: "P22_GOVERNANCE_ASSIGNEE_POOL_NOT_PUBLISHED" },
        ...(assigneePoolPublished ? { assignee_pool: assigneePool } : {}),
        ...(typeof approval.subject_label === "string" ? { subject_label: approval.subject_label } : {}),
        ...(typeof approval.status === "string" ? { effective_status: approval.status } : {}),
        ...(Number.isSafeInteger(approval.quorum_required) && Number.isSafeInteger(approval.quorum_met)
          ? { quorum: { required: approval.quorum_required, met: approval.quorum_met } } : {}),
        ...(Number.isSafeInteger(approval.approval_version) ? { approval_version: approval.approval_version } : {}),
        ...(Number.isSafeInteger(approval.blocker_count) ? { blocker_count: approval.blocker_count } : {}),
        condition_count: Math.min(conditionCount, 256),
        ...(decisionOutcomes.length > 0 ? { decision_outcomes: decisionOutcomes } : {}),
        rc_superseded: relation === "SUPERSEDED",
        as_of_utc_ms: Number.isFinite(readAtUtcMs) ? readAtUtcMs : Date.now(),
      };
      const parsed = ResearchReleaseCandidateApprovalMirrorSchema.safeParse(mirror);
      return parsed.success
        ? { state: "AVAILABLE" as const, approval: parsed.data }
        : { state: "UNAVAILABLE" as const, approval: null };
    } catch (error) {
      if (error instanceof GovernanceError && error.status === 403) return { state: "DENIED" as const, approval: null };
      if (error instanceof GovernanceError && error.status === 404) return { state: "NOT_FOUND" as const, approval: null };
      return { state: "UNAVAILABLE" as const, approval: null };
    }
  }

  private response(input: {
    id: string; ready: Ready; state: ResearchReleaseCandidatePublicationResponse["state"];
    mayPublish: boolean; blocked: string | null; published: ResearchReleaseCandidatePublicationResponse["published"];
    approvalRead: ResearchReleaseCandidatePublicationResponse["approval_read"];
    approval: ResearchReleaseCandidatePublicationResponse["approval"]; replayed: boolean;
    intent?: PublicationIntent | null;
  }): ResearchReleaseCandidatePublicationResponse {
    const response = {
      schema_version: "research.release-candidate-publication.v1", release_candidate_id: input.id,
      run_id: input.ready.runId, alpha_id: input.ready.alphaId, alpha_version_id: input.ready.alphaVersionId,
      pack_digest: input.ready.packDigest, source: input.ready.source, state: input.state,
      candidate_relation: input.ready.relation, may_publish: input.mayPublish,
      blocked_reason: input.blocked, blocked_action: publishBlockedAction(input.blocked),
      published: input.published, approval_read: input.approvalRead,
      approval: input.approval, as_of_utc_ms: Date.now(), replayed: input.replayed,
      attempt_count: input.intent?.attemptCount ?? 0,
      conflicting_approval_id: input.intent?.conflictingApprovalId ?? null,
      conflicting_approval_href: input.intent?.conflictingApprovalId ? `/governance/approvals/${input.intent.conflictingApprovalId}/r1` : null,
      downstream_code: input.intent?.downstreamCode ?? null,
      publication_created_at: input.intent?.createdAtUtcMs ? new Date(input.intent.createdAtUtcMs).toISOString() : null,
      updated_at_utc_ms: input.intent?.updatedAtUtcMs ?? Date.now(),
      intent_actor: input.intent ? { user_id: input.intent.actorUserId, username: input.intent.actorUsername } : null,
      reconcile_allowed: Boolean(input.intent && ["PENDING", "UNKNOWN"].includes(input.intent.state)),
      claim_candidates: input.ready.source.eligible_methodology_claim_ids,
      promotion_pick: input.intent?.promotionPick ? {
        state: input.intent.promotionPick.state, approval_id: input.intent.promotionPick.approvalId,
        approval_status: input.intent.promotionPick.approvalStatus,
        approval_version: input.intent.promotionPick.approvalVersion, run_id: input.intent.promotionPick.runId, selected_trial_id: input.intent.promotionPick.selectedTrialId,
        artifact_id: input.intent.promotionPick.artifactId, fact_digest: input.intent.promotionPick.factDigest,
      } : null,
    };

    const parsed = ResearchReleaseCandidatePublicationResponseSchema.safeParse(response);
    if (!parsed.success) this.unavailable();
    return parsed.data;
  }
  private actor(scope: ResearchScope, user: PortalUser): void {
    if (scope.actorUserId !== user.userId) throw new ResearchReleaseCandidateError("RESEARCH_RELEASE_CANDIDATE_FORBIDDEN", "Access denied.", 403);
  }
  private notFound(): never { throw new ResearchReleaseCandidateError("RESEARCH_RELEASE_CANDIDATE_NOT_FOUND", "Release Candidate was not found.", 404); }
  private conflict(): never { throw new ResearchReleaseCandidateError("RESEARCH_RELEASE_CANDIDATE_CONFLICT", "Publication request conflicts with immutable intent.", 409); }
  private unavailable(): never { throw new ResearchReleaseCandidateError("RESEARCH_RELEASE_CANDIDATE_UNAVAILABLE", "Publication is unavailable.", 503); }
}
