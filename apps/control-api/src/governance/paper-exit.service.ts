import { createHash } from "crypto";
import { Inject, Injectable } from "@nestjs/common";
import { constantTimeEqual } from "../auth/argon";
import { ControlApiConfig, governanceApplySigningKeys } from "../config";
import { PortalUser } from "../domain";
import { newUlid } from "../id";
import { CONTROL_API_CONFIG } from "../tokens";
import { GovernanceApplyTokenSigner } from "./apply-token";
import { PaperExitDecision } from "./contracts";
import { computeEvidenceManifestHash, GovernanceError } from "./governance.service";
import {
  PaperExitEvaluationState,
  PaperExitPlanRecord,
  PaperExitRepository,
  PaperExitSnapshot,
} from "./paper-exit.repository";

export interface PaperExitPlanInput {
  workspaceId: string;
  requestKey: string;
  reviewId: string;
  expectedReviewVersion: number;
  decision: PaperExitDecision;
  reason: string;
  extensionDays: number | null;
  evidenceHashes: string[];
}

export interface PaperExitEvaluation {
  state: PaperExitEvaluationState;
  gateMet: boolean;
  blockerCodes: string[];
  warningCodes: string[];
  missingPanelKinds: string[];
  missingLineageKinds: string[];
  missingEvidenceFindingIds: string[];
  stalePanelIds: string[];
  unavailablePanelIds: string[];
  partialPanelIds: string[];
  blockingFindingIds: string[];
  carriedFindingIds: string[];
}

const REQUIRED_PANEL_KINDS = [
  "OBSERVATION_COVERAGE",
  "DRIFT",
  "LIMITS_HEALTH",
  "PORTFOLIO_FIT",
] as const;
const REQUIRED_LINEAGE_KINDS = [
  "ARTIFACT",
  "R1_APPROVAL",
  "R2_APPROVAL",
  "OBSERVATION_POLICY",
  "EVIDENCE_PACK",
] as const;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonical(value), "utf8").digest("hex")}`;
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/**
 * Hashes only immutable source facts and their policy identity. Portal decision
 * state, actor identity and read time are deliberately excluded.
 */
export function computePaperExitSourceSnapshotHash(snapshot: PaperExitSnapshot): string {
  return digest({
    review_id: snapshot.review.reviewId,
    deployment_id: snapshot.review.deploymentId,
    portfolio_id: snapshot.review.portfolioId,
    venue: snapshot.review.venue,
    artifact_digest: snapshot.review.artifactDigest,
    observation_policy: {
      id: snapshot.review.observationPolicyId,
      version: snapshot.review.observationPolicyVersion,
      digest: snapshot.review.observationPolicyDigest,
    },
    evidence_pack: {
      id: snapshot.review.evidencePackId,
      digest: snapshot.review.evidencePackDigest,
      evidence_set_hash: snapshot.approval.evidenceSetHash,
    },
    evaluation_policy_version: snapshot.review.evaluationPolicyVersion,
    evaluation_formula_version: snapshot.review.evaluationFormulaVersion,
    lineage: [...snapshot.lineage]
      .sort((left, right) => left.ordinal - right.ordinal)
      .map((item) => ({
        kind: item.kind, label: item.label, value: item.value, href: item.href,
        digest: item.digest, source_authority: item.sourceAuthority, required: item.required,
      })),
    panels: [...snapshot.panels]
      .sort((left, right) => left.ordinal - right.ordinal)
      .map((item) => ({
        panel_id: item.panelId, panel_kind: item.panelKind, title: item.title,
        source_authority: item.sourceAuthority, source_reference: item.sourceReference,
        source_href: item.sourceHref, panel_state: item.panelState, reason: item.reason,
        as_of: item.asOf?.toISOString() ?? null, freshness_state: item.freshnessState,
        source_completeness: item.sourceCompleteness, poll_interval_ms: item.pollIntervalMs,
        formula_version: item.formulaVersion,
      })),
    findings: [...snapshot.findings]
      .sort((left, right) => left.panelId.localeCompare(right.panelId) || left.ordinal - right.ordinal)
      .map((item) => ({
        finding_id: item.findingId, panel_id: item.panelId, metric_key: item.metricKey,
        label: item.label, outcome: item.outcome, blocking: item.blocking, required: item.required,
        carries_to: item.carriesTo, exact_value: item.exactValue, unit: item.unit,
        currency: item.currency, threshold_value: item.thresholdValue,
        source_label: item.sourceLabel, source_href: item.sourceHref,
        evidence_hash: item.evidenceHash, formula_version: item.formulaVersion,
        as_of: item.asOf?.toISOString() ?? null,
      })),
  });
}

export function evaluatePaperExit(snapshot: PaperExitSnapshot): PaperExitEvaluation {
  const panelKinds = new Set(snapshot.panels.map((item) => item.panelKind));
  const lineageKinds = new Set(snapshot.lineage.filter((item) => item.required).map((item) => item.kind));
  const evidenceHashes = new Set(snapshot.evidence.map((item) => item.sha256));
  const missingPanelKinds = REQUIRED_PANEL_KINDS.filter((kind) => !panelKinds.has(kind));
  const missingLineageKinds = REQUIRED_LINEAGE_KINDS.filter((kind) => !lineageKinds.has(kind));
  const missingEvidenceFindingIds = snapshot.findings
    .filter((item) => item.required && (
      !item.sourceHref || !item.sourceLabel || !item.evidenceHash || !evidenceHashes.has(item.evidenceHash)
    ))
    .map((item) => item.findingId);
  const stalePanelIds = snapshot.panels
    .filter((item) => item.panelState === "STALE" || item.freshnessState === "STALE")
    .map((item) => item.panelId);
  const unavailablePanelIds = snapshot.panels
    .filter((item) => item.panelState === "UNAVAILABLE" || item.panelState === "ERROR")
    .map((item) => item.panelId);
  const partialPanelIds = snapshot.panels
    .filter((item) => item.panelState === "PARTIAL")
    .map((item) => item.panelId);
  const blockingFindingIds = snapshot.findings
    .filter((item) => item.blocking || item.outcome === "FAIL")
    .map((item) => item.findingId);
  const carriedFindingIds = snapshot.findings
    .filter((item) => item.outcome === "INSUFFICIENT" && !item.blocking && item.carriesTo)
    .map((item) => item.findingId);

  let state: PaperExitEvaluationState = "MET";
  if (unavailablePanelIds.length > 0) state = "UNAVAILABLE";
  else if (stalePanelIds.length > 0) state = "STALE";
  else if (
    missingPanelKinds.length > 0 || missingLineageKinds.length > 0 ||
    missingEvidenceFindingIds.length > 0 || partialPanelIds.length > 0 ||
    !snapshot.approval.evidenceComplete || snapshot.evidence.some((item) => item.required && !item.sha256)
  ) state = "PARTIAL";
  else if (blockingFindingIds.length > 0) state = "UNMET";

  const blockerCodes: string[] = [];
  if (state === "UNAVAILABLE") blockerCodes.push("SOURCE_UNAVAILABLE");
  if (state === "STALE") blockerCodes.push("SOURCE_STALE");
  if (state === "PARTIAL") blockerCodes.push("EVIDENCE_PARTIAL");
  if (state === "UNMET") blockerCodes.push("GATE_CRITERIA_UNMET");
  const warningCodes: string[] = [];
  if (snapshot.findings.some((item) => item.outcome === "WATCH")) warningCodes.push("WATCH_FINDINGS_PRESENT");
  if (carriedFindingIds.length > 0) warningCodes.push("INSUFFICIENT_DATA_CARRIED_FORWARD");

  return {
    state, gateMet: state === "MET", blockerCodes, warningCodes,
    missingPanelKinds, missingLineageKinds, missingEvidenceFindingIds,
    stalePanelIds, unavailablePanelIds, partialPanelIds,
    blockingFindingIds, carriedFindingIds,
  };
}

function publicPlan(plan: PaperExitPlanRecord, applyToken: string | null) {
  return {
    schema_version: "governance.paper-exit-decision-plan.v1",
    operation_id: plan.operationId,
    command_type: "GOVERNANCE_PAPER_EXIT_DECISION",
    command_version: 1,
    review_id: plan.reviewId,
    expected_review_version: plan.expectedReviewVersion,
    payload_hash: plan.payloadHash,
    evidence_set_hash: plan.evidenceSetHash,
    source_snapshot_hash: plan.sourceSnapshotHash,
    evaluation_state: plan.evaluationState,
    risk_tier: "R1",
    blockers: plan.blockerCodes.map((code) => ({ code })),
    warnings: plan.warningCodes.map((code) => ({ code })),
    required_approvers: [{ role: "ADMIN", count: 1 }],
    fresh_auth_required: false,
    expires_at: plan.expiresAt.toISOString(),
    apply_token: applyToken,
    status: plan.status === "PLANNED" && plan.expiresAt <= new Date() ? "EXPIRED" : plan.status,
    external_side_effect_requested: false,
  };
}

@Injectable()
export class PaperExitService {
  private readonly applyTokens: GovernanceApplyTokenSigner;

  constructor(
    @Inject(PaperExitRepository) private readonly repository: PaperExitRepository,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
  ) {
    this.applyTokens = new GovernanceApplyTokenSigner(
      config.GOVERNANCE_APPLY_ACTIVE_KEY_ID,
      governanceApplySigningKeys(config),
    );
  }

  async detail(user: PortalUser, workspaceId: string, reviewId: string) {
    const snapshot = await this.verifiedSnapshot(workspaceId, reviewId);
    const evaluation = evaluatePaperExit(snapshot);
    const { approval, review } = snapshot;
    const expired = approval.expiresAt <= new Date();
    const self = approval.requesterUserId === user.userId || approval.artifactCreatorUserId === user.userId;
    const alreadyDecided = approval.decisionActorIds.includes(user.userId);
    const open = review.reviewState === "PENDING" && approval.status === "PENDING" && !expired;
    const role = user.role === "ADMIN";
    const locks: string[] = [];
    if (!role) locks.push("APPROVER_ROLE_REQUIRED");
    if (!open) locks.push(expired ? "EXIT_REVIEW_EXPIRED" : "EXIT_REVIEW_CLOSED");
    if (alreadyDecided) locks.push("ACTOR_ALREADY_DECIDED");
    if (approval.quorumRequired !== 1) locks.push("PAPER_EXIT_QUORUM_UNSUPPORTED");
    if (self) locks.push("SELF_PROMOTION_PROHIBITED");
    locks.push(...evaluation.blockerCodes);
    const canSafeDecide = role && open && !alreadyDecided && approval.quorumRequired === 1;
    const canPromote = canSafeDecide && !self && evaluation.gateMet;
    const overallStatus = evaluation.state === "PARTIAL" ? "partial"
      : evaluation.state === "STALE" ? "stale"
        : evaluation.state === "UNAVAILABLE" ? "unavailable" : "ok";

    return {
      schema_version: "governance.paper-exit-review.v1",
      record_authority: "PORTAL",
      delivery_profile: "fixture",
      read_at: new Date().toISOString(),
      data: {
        review: {
          review_id: review.reviewId, deployment_id: review.deploymentId,
          portfolio_id: review.portfolioId, venue: review.venue,
          stage: "PAPER_OBSERVATION",
          subject_label: `${review.deploymentId} · ${review.venue}`,
          promote_to: review.promoteTo, review_state: review.reviewState,
          review_version: review.reviewVersion, quorum_met: approval.quorumMet,
          quorum_required: approval.quorumRequired,
          sla: {
            age_minutes: Math.max(0, Math.floor((Date.now() - approval.createdAt.valueOf()) / 60_000)),
            budget_minutes: Math.max(0, Math.floor((approval.slaDueAt.valueOf() - approval.createdAt.valueOf()) / 60_000)),
          },
          expires_at: approval.expiresAt.toISOString(),
          extension_days: review.extensionDays,
          extended_until: review.extendedUntil?.toISOString() ?? null,
        },
        actor: { user_id: user.userId, username: user.username, roles: [user.role] },
        status: overallStatus,
        reason: evaluation.state === "MET" || evaluation.state === "UNMET" ? null
          : `Promotion is fail-closed because evidence evaluation is ${evaluation.state}.`,
        gate_met: evaluation.gateMet,
        evaluation_state: evaluation.state,
        gate_summary: review.observationSummary,
        policy_id: review.observationPolicyId,
        policy_version: review.observationPolicyVersion,
        formula_version: review.evaluationFormulaVersion,
        evidence_set_hash: approval.evidenceSetHash,
        source_snapshot_hash: review.sourceSnapshotHash,
        eligibility: {
          can_approve: canPromote,
          can_approve_with_condition: canSafeDecide,
          can_deny: canSafeDecide,
          can_extend_observation: canSafeDecide,
          can_reject: canSafeDecide,
          locks: sortedUnique(locks),
          separation_of_duties: self ? "VIOLATION" : "OK",
        },
        lineage: snapshot.lineage.map((item) => ({
          kind: item.kind, label: item.label, value: item.value, href: item.href,
          digest: item.digest, source_authority: item.sourceAuthority, required: item.required,
        })),
        panels: snapshot.panels.map((item) => ({
          panel_id: item.panelId, panel_kind: item.panelKind, title: item.title,
          source: item.sourceReference, source_authority: item.sourceAuthority,
          source_href: item.sourceHref, status: item.panelState.toLowerCase(), reason: item.reason,
          as_of: item.asOf?.toISOString() ?? null, freshness_state: item.freshnessState,
          source_completeness: item.sourceCompleteness, poll_interval_ms: item.pollIntervalMs,
          formula_version: item.formulaVersion,
          findings: snapshot.findings.filter((finding) => finding.panelId === item.panelId)
            .sort((left, right) => left.ordinal - right.ordinal)
            .map((finding) => ({
              finding_id: finding.findingId, metric_key: finding.metricKey, label: finding.label,
              outcome: finding.outcome.toLowerCase(), blocking: finding.blocking,
              required: finding.required, carries_to: finding.carriesTo,
              exact_value: finding.exactValue, unit: finding.unit, currency: finding.currency,
              threshold_value: finding.thresholdValue, source_label: finding.sourceLabel,
              href: finding.sourceHref, evidence_hash: finding.evidenceHash,
              formula_version: finding.formulaVersion, as_of: finding.asOf?.toISOString() ?? null,
            })),
        })),
        evaluation: {
          state: evaluation.state, policy_version: review.evaluationPolicyVersion,
          formula_version: review.evaluationFormulaVersion,
          missing_panel_kinds: evaluation.missingPanelKinds,
          missing_lineage_kinds: evaluation.missingLineageKinds,
          missing_evidence_finding_ids: evaluation.missingEvidenceFindingIds,
          stale_panel_ids: evaluation.stalePanelIds,
          unavailable_panel_ids: evaluation.unavailablePanelIds,
          partial_panel_ids: evaluation.partialPanelIds,
          blocking_finding_ids: evaluation.blockingFindingIds,
          carried_finding_ids: evaluation.carriedFindingIds,
          warnings: evaluation.warningCodes.map((code) => ({ code })),
        },
        recommendation: review.recommendation,
        recommended_next_eligible_action: evaluation.gateMet ? "APPROVE_PROMOTION"
          : evaluation.state === "UNMET" ? "EXTEND_OR_REJECT" : "RESTORE_EVIDENCE_OR_EXTEND",
        activation_plan: {
          mode: "PREVIEW_ONLY", target_stage: review.promoteTo,
          authority_semantics: "APPROVAL_CREATES_PROMOTION_GRANT_ONLY",
          external_side_effect_requested: false,
        },
        decisions: snapshot.decisions.map((item) => ({
          decision_id: item.decisionId, operation_id: item.operationId,
          actor: { user_id: item.actorUserId, username: item.actorUsername },
          outcome: item.decision, reason: item.reason, extension_days: item.extensionDays,
          resulting_state: item.resultingState, evidence_set_hash: item.evidenceSetHash,
          source_snapshot_hash: item.sourceSnapshotHash,
          review_version_before: item.reviewVersionBefore,
          review_version_after: item.reviewVersionAfter, decided_at: item.decidedAt.toISOString(),
        })),
        promotion_grant: snapshot.promotionGrant ? {
          grant_id: snapshot.promotionGrant.grantId,
          deployment_id: snapshot.promotionGrant.deploymentId,
          target_stage: snapshot.promotionGrant.targetStage,
          grant_state: snapshot.promotionGrant.grantState,
          evidence_set_hash: snapshot.promotionGrant.evidenceSetHash,
          source_snapshot_hash: snapshot.promotionGrant.sourceSnapshotHash,
          policy_version: snapshot.promotionGrant.policyVersion,
          created_at: snapshot.promotionGrant.createdAt.toISOString(),
        } : null,
      },
    };
  }

  async plan(user: PortalUser, input: PaperExitPlanInput, requestId: string) {
    if (user.role !== "ADMIN") {
      await this.rejected(user, input, requestId, "APPROVER_ROLE_REQUIRED", "DENIED");
      throw new GovernanceError("APPROVER_ROLE_REQUIRED", "Access denied.", 403);
    }
    const snapshot = await this.verifiedSnapshot(input.workspaceId, input.reviewId);
    const { approval, review } = snapshot;
    const evaluation = evaluatePaperExit(snapshot);
    const hashes = sortedUnique(input.evidenceHashes);
    if (hashes.length !== input.evidenceHashes.length) {
      throw new GovernanceError("DUPLICATE_EVIDENCE_HASH", "Evidence hashes must be unique.", 400);
    }
    const currentHashes = sortedUnique(snapshot.evidence.map((item) => item.sha256));
    const payloadHash = digest({
      command_type: "GOVERNANCE_PAPER_EXIT_DECISION", command_version: 1,
      review_id: input.reviewId, expected_review_version: input.expectedReviewVersion,
      decision: input.decision, reason: input.reason, extension_days: input.extensionDays,
      evidence_hashes: hashes,
    });
    const existing = await this.repository.findPlanByKey(input.workspaceId, user.userId, input.requestKey);
    if (existing) return this.replayPlan(existing, payloadHash, user, input, requestId);

    const blockerCodes: string[] = [];
    if (review.reviewState !== "PENDING" || approval.status !== "PENDING") blockerCodes.push("EXIT_REVIEW_NOT_PENDING");
    if (approval.expiresAt <= new Date()) blockerCodes.push("EXIT_REVIEW_EXPIRED");
    if (review.reviewVersion !== input.expectedReviewVersion) blockerCodes.push("EXIT_REVIEW_VERSION_CONFLICT");
    if (!sameStrings(currentHashes, hashes)) blockerCodes.push("EVIDENCE_HASH_MISMATCH");
    if (approval.decisionActorIds.includes(user.userId)) blockerCodes.push("ACTOR_ALREADY_DECIDED");
    if (approval.quorumRequired !== 1) blockerCodes.push("PAPER_EXIT_QUORUM_UNSUPPORTED");
    if (input.decision === "PROMOTE") {
      if (approval.requesterUserId === user.userId || approval.artifactCreatorUserId === user.userId) {
        blockerCodes.push("SELF_PROMOTION_PROHIBITED");
      }
      blockerCodes.push(...evaluation.blockerCodes);
    }
    const warningCodes = [...evaluation.warningCodes];
    if (input.decision !== "PROMOTE" && evaluation.state !== "MET") {
      warningCodes.push(`DECISION_WITH_${evaluation.state}_EVIDENCE`);
    }

    const operationId = newUlid("op");
    const expiresAt = new Date(Date.now() + this.config.GOVERNANCE_PLAN_TTL_SECONDS * 1000);
    const applyToken = this.applyTokens.issue(operationId, payloadHash);
    let created: PaperExitPlanRecord;
    try {
      created = await this.repository.createPlan({
        operationId, workspaceId: input.workspaceId, reviewId: input.reviewId,
        actorUserId: user.userId, requestKey: input.requestKey, payloadHash,
        decision: input.decision, reason: input.reason, extensionDays: input.extensionDays,
        expectedReviewVersion: input.expectedReviewVersion,
        evidenceSetHash: approval.evidenceSetHash, sourceSnapshotHash: review.sourceSnapshotHash,
        evidenceHashes: hashes, evaluationState: evaluation.state,
        blockerCodes: sortedUnique(blockerCodes), warningCodes: sortedUnique(warningCodes),
        applyKeyId: this.applyTokens.activeKeyId,
        applyTokenHash: createHash("sha256").update(applyToken, "utf8").digest("hex"),
        expiresAt, requestId, auditEventId: newUlid("evt"), outboxMessageId: newUlid("msg"),
      });
    } catch (error) {
      if ((error as { code?: string }).code !== "23505") throw error;
      const raced = await this.repository.findPlanByKey(input.workspaceId, user.userId, input.requestKey);
      if (!raced) throw error;
      return this.replayPlan(raced, payloadHash, user, input, requestId);
    }
    return {
      replayed: false,
      response: publicPlan(created, created.blockerCodes.length === 0 ? applyToken : null),
    };
  }

  async apply(user: PortalUser, workspaceId: string, operationId: string, applyToken: string, requestId: string) {
    if (user.role !== "ADMIN") throw new GovernanceError("APPROVER_ROLE_REQUIRED", "Access denied.", 403);
    const plan = await this.repository.findPlan(workspaceId, user.userId, operationId);
    if (!plan) throw new GovernanceError("OPERATION_NOT_FOUND", "Operation not found.", 404);
    const tokenHash = createHash("sha256").update(applyToken, "utf8").digest("hex");
    if (!constantTimeEqual(tokenHash, plan.applyTokenHash) ||
      !this.applyTokens.verify(applyToken, plan.operationId, plan.payloadHash, plan.applyKeyId)) {
      await this.repository.recordRejected({
        eventId: newUlid("evt"), eventType: "governance.paper_exit_decision.apply_denied",
        actorUserId: user.userId, workspaceId, requestId, idempotencyKey: plan.requestKey,
        aggregateId: plan.reviewId, aggregateVersion: plan.expectedReviewVersion,
        result: "DENIED", reasonCode: "APPLY_TOKEN_INVALID",
      });
      throw new GovernanceError("APPLY_TOKEN_INVALID", "Apply token is invalid.", 403);
    }
    try {
      const result = await this.repository.applyDecision({
        workspaceId, actorUserId: user.userId, actorUsername: user.username,
        operationId, requestId, decisionId: newUlid("dec"), grantId: newUlid("grant"),
        auditEventId: newUlid("evt"), outboxMessageId: newUlid("msg"),
        reasonHash: digest(plan.reason),
      });
      return {
        schema_version: "governance.paper-exit-decision-apply.v1",
        operation_id: operationId,
        receipt_id: (result.plan.responseJson?.receipt_id as string | undefined) ?? null,
        status: "PENDING",
        replayed: result.replayed,
        external_side_effect_requested: false,
      };
    } catch (error) {
      const typed = error as { governanceCode?: string; status?: number; details?: Record<string, unknown> };
      if (!typed.governanceCode) throw error;
      await this.repository.recordRejected({
        eventId: newUlid("evt"), eventType: "governance.paper_exit_decision.apply_rejected",
        actorUserId: user.userId, workspaceId, requestId, idempotencyKey: plan.requestKey,
        aggregateId: plan.reviewId, aggregateVersion: plan.expectedReviewVersion,
        result: typed.governanceCode.includes("CONFLICT") || typed.governanceCode.includes("CHANGED")
          ? "CONFLICT" : "DENIED",
        reasonCode: typed.governanceCode, metadata: typed.details,
      });
      throw new GovernanceError(typed.governanceCode, "Operation could not be applied.", typed.status ?? 409, typed.details);
    }
  }

  async operationOrNull(user: PortalUser, workspaceId: string, operationId: string) {
    const plan = await this.repository.findPlan(workspaceId, user.userId, operationId);
    if (!plan) return null;
    const status = plan.status === "APPLIED" ? "SUCCEEDED"
      : plan.expiresAt <= new Date() ? "EXPIRED" : "PENDING";
    return {
      schema_version: "governance.paper-exit-decision-operation.v1",
      operation_id: plan.operationId, review_id: plan.reviewId,
      command_type: "GOVERNANCE_PAPER_EXIT_DECISION", status,
      verification_result: status, blockers: plan.blockerCodes.map((code) => ({ code })),
      warnings: plan.warningCodes.map((code) => ({ code })),
      expected_review_version: plan.expectedReviewVersion,
      evidence_set_hash: plan.evidenceSetHash, source_snapshot_hash: plan.sourceSnapshotHash,
      evaluation_state: plan.evaluationState, planned_at: plan.createdAt.toISOString(),
      expires_at: plan.expiresAt.toISOString(), applied_at: plan.appliedAt?.toISOString() ?? null,
      receipt: plan.responseJson, external_side_effect_requested: false,
    };
  }

  private async verifiedSnapshot(workspaceId: string, reviewId: string) {
    const snapshot = await this.repository.detail(workspaceId, reviewId);
    if (!snapshot) throw new GovernanceError("EXIT_REVIEW_NOT_FOUND", "Exit review not found.", 404);
    if (computeEvidenceManifestHash(snapshot.evidence) !== snapshot.approval.evidenceSetHash) {
      throw new GovernanceError("EVIDENCE_MANIFEST_INTEGRITY_FAILED", "Evidence manifest integrity check failed.", 409);
    }
    if (computePaperExitSourceSnapshotHash(snapshot) !== snapshot.review.sourceSnapshotHash) {
      throw new GovernanceError("SOURCE_SNAPSHOT_INTEGRITY_FAILED", "Source snapshot integrity check failed.", 409);
    }
    return snapshot;
  }

  private async replayPlan(
    existing: PaperExitPlanRecord, payloadHash: string, user: PortalUser,
    input: PaperExitPlanInput, requestId: string,
  ) {
    if (existing.payloadHash !== payloadHash) {
      await this.rejected(user, input, requestId, "REQUEST_KEY_PAYLOAD_CONFLICT", "CONFLICT");
      throw new GovernanceError("REQUEST_KEY_PAYLOAD_CONFLICT", "Request key was already used for another intent.", 409);
    }
    const token = existing.status === "PLANNED" && existing.expiresAt > new Date() && existing.blockerCodes.length === 0
      ? this.applyTokens.issue(existing.operationId, existing.payloadHash, existing.applyKeyId) : null;
    return { replayed: true, response: publicPlan(existing, token) };
  }

  private async rejected(
    user: PortalUser, input: PaperExitPlanInput, requestId: string, code: string,
    result: "DENIED" | "CONFLICT" | "FAILURE",
  ) {
    await this.repository.recordRejected({
      eventId: newUlid("evt"), eventType: "governance.paper_exit_decision.plan_rejected",
      actorUserId: user.userId, workspaceId: input.workspaceId, requestId,
      idempotencyKey: input.requestKey, aggregateId: input.reviewId,
      aggregateVersion: input.expectedReviewVersion, result, reasonCode: code,
    });
  }
}
