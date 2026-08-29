import { createHash } from "crypto";
import { Inject, Injectable } from "@nestjs/common";
import { constantTimeEqual } from "../auth/argon";
import {
  ControlApiConfig,
  governanceApplySigningKeys,
  querySigningKeys,
} from "../config";
import { PortalUser } from "../domain";
import { newUlid } from "../id";
import { ControlPlaneQueryService, KeysetCursorCodec, RawKeysetQuery } from "../query";
import { CONTROL_API_CONFIG } from "../tokens";
import { TypedCondition } from "../operations/contracts";
import { GovernanceApplyTokenSigner } from "./apply-token";
import {
  approvalHistoryResource,
  approvalInboxResource,
  R1Decision,
} from "./contracts";
import {
  ApprovalRecord,
  DecisionPlanRecord,
  EvidenceRecord,
  GovernanceRepository,
} from "./governance.repository";

export class GovernanceError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "GovernanceError";
  }
}

interface PlanInput {
  workspaceId: string;
  requestKey: string;
  approvalId: string;
  expectedApprovalVersion: number;
  decision: R1Decision;
  reason: string;
  conditions: TypedCondition[];
  evidenceHashes: string[];
}

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

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

export function computeEvidenceManifestHash(evidence: readonly EvidenceRecord[]): string {
  return digest(
    [...evidence]
      .sort((left, right) => left.ordinal - right.ordinal || left.evidenceId.localeCompare(right.evidenceId))
      .map((item) => ({
        evidence_id: item.evidenceId,
        sha256: item.sha256,
        schema_version: item.schemaVersion,
        source_authority: item.sourceAuthority,
        captured_at: item.capturedAt.toISOString(),
      })),
  );
}

function publicPlan(plan: DecisionPlanRecord, applyToken: string | null) {
  return {
    schema_version: "governance.r1-decision-plan.v1",
    operation_id: plan.operationId,
    command_type: "GOVERNANCE_R1_DECISION",
    command_version: 1,
    approval_id: plan.approvalId,
    expected_approval_version: plan.expectedApprovalVersion,
    payload_hash: plan.payloadHash,
    evidence_set_hash: plan.evidenceSetHash,
    risk_tier: "R1",
    blockers: plan.blockerCodes.map((code) => ({ code })),
    warnings: plan.warningCodes.map((code) => ({ code })),
    required_approvers: [{ role: "ADMIN", count: plan.quorumRequired }],
    fresh_auth_required: false,
    expires_at: plan.expiresAt.toISOString(),
    apply_token: applyToken,
    status: plan.status === "PLANNED" && plan.expiresAt <= new Date() ? "EXPIRED" : plan.status,
  };
}

function unavailablePanel(panelId: string, authority: "RESEARCH" | "EXECUTION" | "BROKER" | "DERIVED") {
  const readAt = new Date().toISOString();
  return {
    panel_id: panelId,
    source_authority: authority,
    as_of: null,
    read_at: readAt,
    source_cursor: null,
    source_sequence: null,
    projection_epoch: null,
    projection_sequence: null,
    source_completeness: "UNKNOWN",
    poll_interval_ms: null,
    freshness_state: "UNKNOWN",
    age_seconds: null,
    lag_ms: null,
    formula_version: null,
    capability_snapshot_id: null,
    delivery_profile: "fixture",
    panel_state: "unavailable",
    warnings: [
      {
        code: "EXTERNAL_PROJECTION_NOT_COMMISSIONED",
        message: "This source panel is not connected in EX-BE-05a.",
      },
    ],
    data: null,
  };
}

@Injectable()
export class GovernanceService {
  private readonly query: ControlPlaneQueryService;
  private readonly applyTokens: GovernanceApplyTokenSigner;

  constructor(
    @Inject(GovernanceRepository) private readonly repository: GovernanceRepository,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
  ) {
    const keys = querySigningKeys(config);
    this.query = new ControlPlaneQueryService(
      repository.pool,
      new KeysetCursorCodec({
        activeKeyId: config.QUERY_CURSOR_ACTIVE_KEY_ID,
        keys,
        ttlSeconds: config.QUERY_CURSOR_TTL_SECONDS,
      }),
    );
    this.applyTokens = new GovernanceApplyTokenSigner(
      config.GOVERNANCE_APPLY_ACTIVE_KEY_ID,
      governanceApplySigningKeys(config),
    );
  }

  async list(user: PortalUser, workspaceId: string, raw: RawKeysetQuery) {
    const [page, counts] = await Promise.all([
      this.query.list(approvalInboxResource(user), {
        actorId: user.userId,
        workspaceId,
        role: user.role,
      }, raw),
      this.repository.counts(workspaceId),
    ]);
    return {
      schema_version: "governance.approval-inbox.v1",
      record_authority: "PORTAL",
      delivery_profile: "fixture",
      read_at: new Date().toISOString(),
      actor: { user_id: user.userId, username: user.username, roles: [user.role] },
      counts: {
        pending: counts.pending,
        overdue: counts.overdue,
        due_soon: counts.dueSoon,
      },
      page,
    };
  }

  async history(user: PortalUser, workspaceId: string, raw: RawKeysetQuery) {
    const page = await this.query.list(
      approvalHistoryResource(),
      { actorId: user.userId, workspaceId, role: user.role },
      raw,
    );
    return {
      schema_version: "governance.approval-history.v1",
      record_authority: "PORTAL",
      delivery_profile: "fixture",
      read_at: new Date().toISOString(),
      actor: { user_id: user.userId, username: user.username, roles: [user.role] },
      page,
    };
  }

  async detail(user: PortalUser, workspaceId: string, approvalId: string) {
    const snapshot = await this.repository.detail(workspaceId, approvalId);
    if (!snapshot || snapshot.approval.gate !== "R1") {
      throw new GovernanceError("APPROVAL_NOT_FOUND", "Approval not found.", 404);
    }
    const { approval, evidence, findings, decisions } = snapshot;
    if (computeEvidenceManifestHash(evidence) !== approval.evidenceSetHash) {
      throw new GovernanceError(
        "EVIDENCE_MANIFEST_INTEGRITY_FAILED",
        "Evidence manifest integrity check failed.",
        409,
      );
    }
    const self =
      approval.requesterUserId === user.userId || approval.artifactCreatorUserId === user.userId;
    const alreadyDecided = approval.decisionActorIds.includes(user.userId);
    const expired = approval.expiresAt <= new Date() || approval.status === "EXPIRED";
    const blocking = findings.filter((item) => item.blocking || item.outcome === "FAIL");
    const locks: string[] = [];
    if (self) locks.push("SELF_APPROVAL");
    if (blocking.length > 0 || !approval.evidenceComplete) locks.push("BLOCKING_FINDINGS");
    if (expired) locks.push("EXPIRED");
    if (user.role !== "ADMIN" || alreadyDecided) locks.push("NOT_ELIGIBLE");

    return {
      schema_version: "governance.r1-review.v1",
      record_authority: "PORTAL",
      delivery_profile: "fixture",
      read_at: new Date().toISOString(),
      data: {
        approval: this.publicApproval(approval),
        actor: { user_id: user.userId, username: user.username, roles: [user.role] },
        eligibility: {
          can_approve: approval.status === "PENDING" && locks.length === 0,
          can_approve_with_condition: approval.status === "PENDING" && locks.length === 0,
          can_deny: approval.status === "PENDING" && !expired && user.role === "ADMIN" && !alreadyDecided,
          can_request_changes:
            approval.status === "PENDING" && !expired && user.role === "ADMIN" && !alreadyDecided && !self,
          locks,
          separation_of_duties: self ? "VIOLATION" : "OK",
        },
        known_limitations: snapshot.knownLimitations.map((item) => ({
          limitation_id: item.limitationId,
          kind: item.kind.toLowerCase(),
          label: item.label,
          statement: item.statement,
          expires_at: item.expiresAt?.toISOString() ?? null,
        })),
        evidence_manifest: {
          manifest_hash: approval.evidenceSetHash,
          complete: approval.evidenceComplete,
          entries: evidence.map((item) => ({
            evidence_id: item.evidenceId,
            ordinal: item.ordinal,
            kind: item.kind,
            label: item.label,
            display_value: item.displayValue,
            note: item.note,
            verification: item.verification,
            artifact_id: item.artifactId,
            sha256: item.sha256,
            size_bytes: item.sizeBytes,
            media_type: item.mediaType,
            schema_version: item.schemaVersion,
            source_authority: item.sourceAuthority,
            source_reference: item.sourceReference,
            required: item.required,
            captured_at: item.capturedAt.toISOString(),
            retention_class: item.retentionClass,
            access_policy: item.accessPolicy,
          })),
        },
        checklist: findings.map((item) => ({
          finding_id: item.findingId,
          ordinal: item.ordinal,
          label: item.label,
          outcome: item.outcome.toLowerCase(),
          suggestion: item.suggestion,
          blocking: item.blocking,
          policy_version: item.policyVersion,
          formula_version: item.formulaVersion,
          basis_hashes: item.basisHashes,
          evaluated_at: item.evaluatedAt.toISOString(),
        })),
        decisions: decisions.map((item) => ({
          decision_id: item.decisionId,
          operation_id: item.operationId,
          actor: { user_id: item.actorUserId, username: item.actorUsername },
          outcome: item.decision === "APPROVE"
            ? "APPROVED"
            : item.decision === "DENY"
              ? "DENIED"
              : item.decision === "REQUEST_CHANGES"
                ? "CHANGES_REQUESTED"
                : "APPROVED_WITH_CONDITION",
          reason: item.reason,
          conditions: item.conditions,
          condition: item.conditions[0]?.text ?? null,
          evidence_set_hash: item.evidenceSetHash,
          approval_version_before: item.approvalVersionBefore,
          approval_version_after: item.approvalVersionAfter,
          decided_at: item.decidedAt.toISOString(),
        })),
        linked_panels: [
          unavailablePanel("equity_across_window_roles", "RESEARCH"),
          unavailablePanel("source_linked_runtime_facts", "EXECUTION"),
        ],
      },
    };
  }

  /**
   * Publishes only the Portal-owned, immutable R2 review binding needed to
   * issue a capital-preview request. This is a read model, not an R2 decision
   * or execution authorization.
   */
  async r2Detail(user: PortalUser, workspaceId: string, approvalId: string) {
    const detail = await this.repository.r2Detail(workspaceId, approvalId);
    if (!detail) {
      throw new GovernanceError("APPROVAL_NOT_FOUND", "Approval not found.", 404);
    }
    const { approval, scope, lineage, evidence } = detail;
    if (lineage && computeEvidenceManifestHash(evidence) !== lineage.r1EvidenceSetHash) {
      throw new GovernanceError(
        "R1_EVIDENCE_MANIFEST_INTEGRITY_FAILED",
        "Referenced R1 evidence manifest integrity check failed.",
        409,
      );
    }
    const self = approval.requesterUserId === user.userId || approval.artifactCreatorUserId === user.userId;
    const alreadyDecided = approval.decisionActorIds.includes(user.userId);
    const expired = approval.expiresAt <= new Date();
    const locks = [
      ...(self ? ["SELF_APPROVAL"] : []),
      ...(expired ? ["EXPIRED"] : []),
      ...(user.role !== "ADMIN" || alreadyDecided ? ["NOT_ELIGIBLE"] : []),
      ...(lineage === null ? ["R1_LINEAGE_UNPUBLISHED"] : []),
      ...(lineage !== null && !["APPROVED", "APPROVED_WITH_CONDITION"].includes(lineage.r1Status)
        ? ["R1_NOT_APPROVED"]
        : []),
      ...(lineage !== null && lineage.r1ExpiresAt <= new Date() ? ["R1_EXPIRED"] : []),
      ...(lineage !== null && !lineage.r1EvidenceComplete ? ["R1_EVIDENCE_INCOMPLETE"] : []),
    ];
    const r1Reference = lineage === null ? null : {
      approval_id: lineage.r1ApprovalId,
      state: lineage.r1Status,
      href: `/governance/approvals/${lineage.r1ApprovalId}/r1`,
      expiry: lineage.r1ExpiresAt.toISOString(),
      digest: lineage.r1EvidenceSetHash,
      decided_by: lineage.r1DecidedByUsername,
      decided_at: lineage.r1DecidedAt?.toISOString() ?? null,
    };
    return {
      schema_version: "governance.r2-review.v1",
      record_authority: "PORTAL",
      delivery_profile: "fixture",
      read_at: new Date().toISOString(),
      data: {
        approval: {
          ...this.publicApproval(approval),
          portfolio_id: scope.portfolioId,
          currency: scope.currency,
        },
        actor: { user_id: user.userId, username: user.username, roles: [user.role] },
        r1_reference: r1Reference,
        r1_state: lineage?.r1Status ?? "MISSING",
        r1_id: lineage?.r1ApprovalId ?? null,
        grant_id: lineage?.grantId ?? null,
        grant_name: lineage?.grantName ?? null,
        approver_role: lineage?.approverRole ?? null,
        plan_author: lineage?.planAuthorUsername ?? null,
        evidence_manifest: lineage === null ? null : {
          manifest_hash: lineage.r1EvidenceSetHash,
          complete: lineage.r1EvidenceComplete,
          entries: evidence.map((item) => ({
            evidence_id: item.evidenceId,
            ordinal: item.ordinal,
            kind: item.kind,
            label: item.label,
            sha256: item.sha256,
            schema_version: item.schemaVersion,
            source_authority: item.sourceAuthority,
            captured_at: item.capturedAt.toISOString(),
          })),
        },
        eligibility: {
          can_approve: approval.status === "PENDING" && locks.length === 0,
          can_approve_with_condition: approval.status === "PENDING" && locks.length === 0,
          can_deny: approval.status === "PENDING" && !expired && user.role === "ADMIN" && !alreadyDecided,
          can_request_changes:
            approval.status === "PENDING" && !expired && user.role === "ADMIN" && !alreadyDecided && !self,
          locks,
          separation_of_duties: self ? "VIOLATION" : "OK",
        },
      },
    };
  }

  async plan(user: PortalUser, input: PlanInput, requestId: string) {
    if (user.role !== "ADMIN") {
      await this.rejected(user, input, requestId, "APPROVER_ROLE_REQUIRED", "DENIED");
      throw new GovernanceError("APPROVER_ROLE_REQUIRED", "Access denied.", 403);
    }
    const snapshot = await this.repository.detail(input.workspaceId, input.approvalId);
    if (!snapshot || snapshot.approval.gate !== "R1") {
      throw new GovernanceError("APPROVAL_NOT_FOUND", "Approval not found.", 404);
    }
    const approval = snapshot.approval;
    if (computeEvidenceManifestHash(snapshot.evidence) !== approval.evidenceSetHash) {
      await this.rejected(user, input, requestId, "EVIDENCE_MANIFEST_INTEGRITY_FAILED", "CONFLICT");
      throw new GovernanceError(
        "EVIDENCE_MANIFEST_INTEGRITY_FAILED",
        "Evidence manifest integrity check failed.",
        409,
      );
    }
    const hashes = sortedUnique(input.evidenceHashes);
    if (hashes.length !== input.evidenceHashes.length) {
      throw new GovernanceError("DUPLICATE_EVIDENCE_HASH", "Evidence hashes must be unique.", 400);
    }
    const evidenceHashes = sortedUnique(snapshot.evidence.map((item) => item.sha256));
    const payloadHash = digest({
      command_type: "GOVERNANCE_R1_DECISION",
      command_version: 1,
      approval_id: input.approvalId,
      expected_approval_version: input.expectedApprovalVersion,
      decision: input.decision,
      reason: input.reason,
      conditions: input.conditions,
      evidence_hashes: hashes,
    });
    const existing = await this.repository.findPlanByKey(input.workspaceId, user.userId, input.requestKey);
    if (existing) {
      if (existing.payloadHash !== payloadHash) {
        await this.rejected(user, input, requestId, "REQUEST_KEY_PAYLOAD_CONFLICT", "CONFLICT");
        throw new GovernanceError("REQUEST_KEY_PAYLOAD_CONFLICT", "Request key was already used for another intent.", 409);
      }
      const token = existing.status === "PLANNED" && existing.expiresAt > new Date()
        ? this.applyTokens.issue(existing.operationId, existing.payloadHash, existing.applyKeyId)
        : null;
      return { replayed: true, response: publicPlan(existing, token) };
    }

    const blockerCodes: string[] = [];
    const warningCodes: string[] = [];
    if (approval.status !== "PENDING") blockerCodes.push("APPROVAL_NOT_PENDING");
    if (approval.expiresAt <= new Date()) blockerCodes.push("APPROVAL_EXPIRED");
    if (approval.approvalVersion !== input.expectedApprovalVersion) blockerCodes.push("APPROVAL_VERSION_CONFLICT");
    if (!sameStrings(evidenceHashes, hashes)) blockerCodes.push("EVIDENCE_HASH_MISMATCH");
    if (approval.decisionActorIds.includes(user.userId)) blockerCodes.push("ACTOR_ALREADY_DECIDED");
    if (input.decision !== "DENY") {
      if (approval.requesterUserId === user.userId || approval.artifactCreatorUserId === user.userId) {
        blockerCodes.push("SELF_APPROVAL_PROHIBITED");
      }
    }
    if (input.decision === "APPROVE" || input.decision === "APPROVE_WITH_CONDITION") {
      if (!approval.evidenceComplete) blockerCodes.push("EVIDENCE_INCOMPLETE");
      if (approval.blockerCount > 0 || snapshot.findings.some((item) => item.blocking || item.outcome === "FAIL")) {
        blockerCodes.push("BLOCKING_FINDINGS");
      }
    }
    if (snapshot.findings.some((item) => item.outcome === "WATCH")) warningCodes.push("WATCH_FINDINGS_PRESENT");
    warningCodes.push("LINKED_PANELS_UNAVAILABLE");

    const operationId = newUlid("op");
    const expiresAt = new Date(Date.now() + this.config.GOVERNANCE_PLAN_TTL_SECONDS * 1000);
    const applyToken = this.applyTokens.issue(operationId, payloadHash);
    let created: DecisionPlanRecord;
    try {
      created = await this.repository.createPlan({
        operationId,
        workspaceId: input.workspaceId,
        approvalId: input.approvalId,
        actorUserId: user.userId,
        requestKey: input.requestKey,
        payloadHash,
        decision: input.decision,
        reason: input.reason,
        conditions: input.conditions,
        expectedApprovalVersion: input.expectedApprovalVersion,
        quorumRequired: approval.quorumRequired,
        evidenceSetHash: approval.evidenceSetHash,
        evidenceHashes: hashes,
        blockerCodes: sortedUnique(blockerCodes),
        warningCodes: sortedUnique(warningCodes),
        applyKeyId: this.applyTokens.activeKeyId,
        applyTokenHash: createHash("sha256").update(applyToken, "utf8").digest("hex"),
        expiresAt,
        requestId,
        auditEventId: newUlid("evt"),
        outboxMessageId: newUlid("msg"),
      });
    } catch (error) {
      if ((error as { code?: string }).code !== "23505") throw error;
      const raced = await this.repository.findPlanByKey(input.workspaceId, user.userId, input.requestKey);
      if (!raced || raced.payloadHash !== payloadHash) {
        throw new GovernanceError("REQUEST_KEY_PAYLOAD_CONFLICT", "Request key was already used for another intent.", 409);
      }
      const token = raced.status === "PLANNED" && raced.expiresAt > new Date()
        ? this.applyTokens.issue(raced.operationId, raced.payloadHash, raced.applyKeyId)
        : null;
      return { replayed: true, response: publicPlan(raced, token) };
    }
    return { replayed: false, response: publicPlan(created, applyToken) };
  }

  async apply(user: PortalUser, workspaceId: string, operationId: string, applyToken: string, requestId: string) {
    if (user.role !== "ADMIN") {
      throw new GovernanceError("APPROVER_ROLE_REQUIRED", "Access denied.", 403);
    }
    const plan = await this.repository.findPlan(workspaceId, user.userId, operationId);
    if (!plan) throw new GovernanceError("OPERATION_NOT_FOUND", "Operation not found.", 404);
    const tokenHash = createHash("sha256").update(applyToken, "utf8").digest("hex");
    if (
      !constantTimeEqual(tokenHash, plan.applyTokenHash) ||
      !this.applyTokens.verify(applyToken, plan.operationId, plan.payloadHash, plan.applyKeyId)
    ) {
      await this.repository.recordRejected({
        eventId: newUlid("evt"),
        eventType: "governance.r1_decision.apply_denied",
        actorUserId: user.userId,
        workspaceId,
        requestId,
        idempotencyKey: plan.requestKey,
        aggregateId: plan.approvalId,
        aggregateVersion: plan.expectedApprovalVersion,
        result: "DENIED",
        reasonCode: "APPLY_TOKEN_INVALID",
      });
      throw new GovernanceError("APPLY_TOKEN_INVALID", "Apply token is invalid.", 403);
    }
    try {
      const result = await this.repository.applyDecision({
        workspaceId,
        actorUserId: user.userId,
        actorUsername: user.username,
        operationId,
        requestId,
        decisionId: newUlid("dec"),
        auditEventId: newUlid("evt"),
        outboxMessageId: newUlid("msg"),
        reasonHash: digest(plan.reason),
      });
      return {
        schema_version: "governance.r1-decision-apply.v1",
        operation_id: operationId,
        receipt_id: (result.plan.responseJson?.receipt_id as string | undefined) ?? null,
        status: "PENDING",
        replayed: result.replayed,
      };
    } catch (error) {
      const typed = error as {
        governanceCode?: string;
        status?: number;
        details?: Record<string, unknown>;
      };
      if (!typed.governanceCode) throw error;
      await this.repository.recordRejected({
        eventId: newUlid("evt"),
        eventType: "governance.r1_decision.apply_rejected",
        actorUserId: user.userId,
        workspaceId,
        requestId,
        idempotencyKey: plan.requestKey,
        aggregateId: plan.approvalId,
        aggregateVersion: plan.expectedApprovalVersion,
        result: typed.governanceCode.includes("CONFLICT") || typed.governanceCode.includes("CHANGED") ? "CONFLICT" : "DENIED",
        reasonCode: typed.governanceCode,
        metadata: typed.details,
      });
      throw new GovernanceError(typed.governanceCode, "Operation could not be applied.", typed.status ?? 409, typed.details);
    }
  }

  async operation(user: PortalUser, workspaceId: string, operationId: string) {
    const plan = await this.repository.findPlan(workspaceId, user.userId, operationId);
    if (!plan) throw new GovernanceError("OPERATION_NOT_FOUND", "Operation not found.", 404);
    const status = plan.status === "APPLIED"
      ? "SUCCEEDED"
      : plan.expiresAt <= new Date()
        ? "EXPIRED"
        : "PENDING";
    return {
      schema_version: "governance.r1-decision-operation.v1",
      operation_id: plan.operationId,
      approval_id: plan.approvalId,
      command_type: "GOVERNANCE_R1_DECISION",
      status,
      // Workflow settlement and observed verification are separate fields by
      // contract. For this Portal-owned transaction they advance together;
      // future external effects may legitimately diverge.
      verification_result: status,
      blockers: plan.blockerCodes.map((code) => ({ code })),
      warnings: plan.warningCodes.map((code) => ({ code })),
      expected_approval_version: plan.expectedApprovalVersion,
      evidence_set_hash: plan.evidenceSetHash,
      planned_at: plan.createdAt.toISOString(),
      expires_at: plan.expiresAt.toISOString(),
      applied_at: plan.appliedAt?.toISOString() ?? null,
      receipt: plan.responseJson,
    };
  }

  private publicApproval(approval: ApprovalRecord) {
    const effectiveStatus = approval.status === "PENDING" && approval.expiresAt <= new Date()
      ? "EXPIRED"
      : approval.status;
    return {
      approval_id: approval.approvalId,
      gate: approval.gate,
      subject_type: approval.subjectType,
      subject_id: approval.subjectId,
      subject_label: approval.subjectLabel,
      release_candidate: approval.releaseCandidate,
      environment: approval.environment,
      target_label: approval.targetLabel,
      requester: { user_id: approval.requesterUserId, username: approval.requesterUsername },
      creator: { user_id: approval.artifactCreatorUserId, username: approval.artifactCreatorUsername },
      status: effectiveStatus,
      policy_version: approval.policyVersion,
      quorum_met: approval.quorumMet,
      quorum_required: approval.quorumRequired,
      approval_version: approval.approvalVersion,
      evidence_set_hash: approval.evidenceSetHash,
      evidence_complete: approval.evidenceComplete,
      blocker_count: approval.blockerCount,
      blocker_summary: approval.blockerSummary,
      sla_due_at: approval.slaDueAt.toISOString(),
      expires_at: approval.expiresAt.toISOString(),
      created_at: approval.createdAt.toISOString(),
      updated_at: approval.updatedAt.toISOString(),
    };
  }

  private async rejected(
    user: PortalUser,
    input: PlanInput,
    requestId: string,
    code: string,
    result: "DENIED" | "CONFLICT" | "FAILURE",
  ) {
    await this.repository.recordRejected({
      eventId: newUlid("evt"),
      eventType: "governance.r1_decision.plan_rejected",
      actorUserId: user.userId,
      workspaceId: input.workspaceId,
      requestId,
      idempotencyKey: input.requestKey,
      aggregateId: input.approvalId,
      aggregateVersion: input.expectedApprovalVersion,
      result,
      reasonCode: code,
    });
  }
}
