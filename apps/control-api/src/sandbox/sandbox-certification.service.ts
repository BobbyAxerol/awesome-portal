import { createHash } from "crypto";
import { Inject, Injectable } from "@nestjs/common";
import { AuthSession, PortalUser } from "../domain";
import { GovernanceError } from "../governance/governance.service";
import { newUlid } from "../id";
import { ProfileReadService } from "../profile-read/profile-read.service";
import { browserSafeProfileRead } from "../execution/browser-safe-profile-read";
import {
  SANDBOX_CERTIFICATION_STEPS,
  SandboxCertificationCreateRequest,
  SandboxCertificationDecisionRequest,
  SandboxCertificationStep,
  SandboxCertificationSubmitRequest,
  SandboxPromotionPlanRequest,
} from "./contracts";
import {
  SandboxCertificationDetail,
  SandboxCertificationRepository,
  SandboxStepEvidenceRow,
} from "./sandbox-certification.repository";

const STEP_AUTHORITY: Record<SandboxCertificationStep, "PORTAL" | "EXECUTION" | "BROKER" | "DERIVED"> = {
  CONNECT: "BROKER",
  SYNC: "BROKER",
  ORDER_TYPES: "BROKER",
  RECONCILIATION: "DERIVED",
  TIMEBOXED_RUN: "EXECUTION",
  CLEANUP: "DERIVED",
  EXIT_REVIEW: "PORTAL",
};

const STEP_LABEL: Record<SandboxCertificationStep, string> = {
  CONNECT: "Connect",
  SYNC: "Sync",
  ORDER_TYPES: "Order types",
  RECONCILIATION: "Reconciliation clean",
  TIMEBOXED_RUN: "Timeboxed run",
  CLEANUP: "Cleanup",
  EXIT_REVIEW: "Exit review",
};

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonical(value), "utf8").digest("hex")}`;
}

function iso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

export interface EffectiveSandboxStep {
  stepKey: SandboxCertificationStep;
  ordinal: number;
  label: string;
  sourceAuthority: "PORTAL" | "EXECUTION" | "BROKER" | "DERIVED";
  evaluationState: "PASS" | "FAIL" | "STALE" | "UNAVAILABLE";
  evidence: SandboxStepEvidenceRow | null;
  blockerCode: string | null;
}

export interface SandboxCertificationEvaluation {
  eligible: boolean;
  evidenceSetHash: string;
  passedCount: number;
  steps: EffectiveSandboxStep[];
  blockerCodes: string[];
  blockingFindingIds: string[];
}

export function evaluateSandboxCertification(
  detail: SandboxCertificationDetail,
  at: Date = new Date(),
): SandboxCertificationEvaluation {
  const evidenceByStep = new Map(detail.evidence.map((item) => [item.step_key, item]));
  const steps = SANDBOX_CERTIFICATION_STEPS.map((stepKey, ordinal): EffectiveSandboxStep => {
    const evidence = evidenceByStep.get(stepKey) ?? null;
    let evaluationState: EffectiveSandboxStep["evaluationState"] = evidence?.evaluation_state ?? "UNAVAILABLE";
    if (!evidence || evidence.source_verification_state !== "VERIFIED") evaluationState = "UNAVAILABLE";
    else if (evidence.expires_at === null || evidence.expires_at <= at) evaluationState = "STALE";
    const blockerCode = evaluationState === "PASS"
      ? null
      : `SANDBOX_STEP_${stepKey}_${evaluationState === "FAIL" ? "FAILED" : evaluationState}`;
    return {
      stepKey,
      ordinal,
      label: STEP_LABEL[stepKey],
      sourceAuthority: STEP_AUTHORITY[stepKey],
      evaluationState,
      evidence,
      blockerCode,
    };
  });
  const blockingFindingIds = detail.findings
    .filter((item) => item.blocking && item.resolved_at === null)
    .map((item) => item.finding_id)
    .sort();
  const blockerCodes = [
    ...steps.flatMap((item) => item.blockerCode ? [item.blockerCode] : []),
    ...(blockingFindingIds.length > 0 ? ["UNRESOLVED_BLOCKING_FINDINGS"] : []),
  ];
  const evidenceSetHash = digest({
    certification_id: detail.certification.certification_id,
    deployment_id: detail.certification.deployment_id,
    policy_version: detail.certification.policy_version,
    formula_version: detail.certification.formula_version,
    steps: steps.map((item) => ({
      step_key: item.stepKey,
      source_authority: item.sourceAuthority,
      evaluation_state: item.evaluationState,
      evidence_hash: item.evidence?.evidence_hash ?? null,
      evidence_schema_version: item.evidence?.evidence_schema_version ?? null,
      source_verification_state: item.evidence?.source_verification_state ?? "UNAVAILABLE",
      as_of: iso(item.evidence?.as_of ?? null),
      expires_at: iso(item.evidence?.expires_at ?? null),
      capability_snapshot_id: item.evidence?.capability_snapshot_id ?? null,
      source_cursor: item.evidence?.source_cursor ?? null,
      projection_epoch: item.evidence?.projection_epoch ?? null,
      projection_sequence: item.evidence?.projection_sequence ?? null,
    })),
    blocking_finding_ids: blockingFindingIds,
  });
  const passedCount = steps.filter((item) => item.evaluationState === "PASS").length;
  return {
    eligible: passedCount === SANDBOX_CERTIFICATION_STEPS.length && blockingFindingIds.length === 0,
    evidenceSetHash,
    passedCount,
    steps,
    blockerCodes,
    blockingFindingIds,
  };
}

@Injectable()
export class SandboxCertificationService {
  constructor(
    @Inject(SandboxCertificationRepository) private readonly repository: SandboxCertificationRepository,
    @Inject(ProfileReadService) private readonly profileReads: ProfileReadService,
  ) {}

  async detail(user: PortalUser, session: AuthSession, workspaceId: string, deploymentId: string) {
    const currentSource = await this.profileReads.snapshot(
      { user, session, workspaceId },
      "sandbox",
      "EXECUTION_SANDBOX_CERTIFICATION_SCREEN",
      deploymentId,
    );
    try {
      const detail = await this.repository.detailByDeployment(workspaceId, deploymentId);
      return this.publicDetail(detail, user, false, currentSource);
    } catch (error) {
      if (error instanceof GovernanceError && error.code === "SANDBOX_CERTIFICATION_NOT_FOUND") {
        return this.sourceOnlyDetail(user, deploymentId, currentSource);
      }
      throw error;
    }
  }

  async create(user: PortalUser, input: SandboxCertificationCreateRequest, requestId: string) {
    this.assertAdmin(user);
    const result = await this.repository.create({
      certificationId: newUlid("scert"),
      workspaceId: input.workspace_id,
      actorUserId: user.userId,
      requestKey: input.request_key,
      requestDigest: digest(input),
      requestId,
      eventId: newUlid("scevt"),
      auditEventId: newUlid("aud"),
      deploymentId: input.deployment_id,
      promotionGrantId: input.promotion_grant_id,
      accountId: input.account_binding.account_id,
      externalAccountRef: input.account_binding.external_account_ref,
      actorUsername: user.username,
      smokePlan: input.smoke_plan ? {
        planId: newUlid("smoke"),
        qty: input.smoke_plan.qty,
        cap: input.smoke_plan.cap,
        currency: input.smoke_plan.currency,
        timeboxMinutes: input.smoke_plan.timebox_minutes,
      } : null,
    });
    return this.publicDetail(result.detail, user, result.replayed);
  }

  async submit(
    user: PortalUser,
    certificationId: string,
    input: SandboxCertificationSubmitRequest,
    requestId: string,
  ) {
    this.assertAdmin(user);
    const result = await this.repository.transition({
      ...this.baseWrite(user, certificationId, input, requestId),
      action: "SUBMIT",
      expectedVersion: input.expected_workflow_version,
      evidenceSetHash: input.expected_evidence_set_hash,
    }, (detail) => {
      if (detail.certification.workflow_state !== "DRAFT") {
        throw new GovernanceError("SANDBOX_CERTIFICATION_NOT_DRAFT", "Certification is not in draft.", 409);
      }
      const evaluation = evaluateSandboxCertification(detail);
      this.assertEvidenceHash(input.expected_evidence_set_hash, evaluation.evidenceSetHash);
      if (!evaluation.eligible) {
        throw new GovernanceError("SANDBOX_CERTIFICATION_SUBMIT_BLOCKED", "Certification evidence is not eligible.", 409, {
          blockers: evaluation.blockerCodes,
          evidence_set_hash: evaluation.evidenceSetHash,
        });
      }
    });
    return this.publicDetail(result.detail, user, result.replayed);
  }

  async decide(
    user: PortalUser,
    certificationId: string,
    input: SandboxCertificationDecisionRequest,
    requestId: string,
  ) {
    this.assertAdmin(user);
    const action = input.decision === "APPROVE" ? "APPROVE" as const : "DENY" as const;
    const result = await this.repository.transition({
      ...this.baseWrite(user, certificationId, input, requestId),
      action,
      expectedVersion: input.expected_workflow_version,
      evidenceSetHash: input.expected_evidence_set_hash,
      reason: input.reason,
    }, (detail) => {
      const record = detail.certification;
      if (record.workflow_state !== "IN_REVIEW") {
        throw new GovernanceError("SANDBOX_CERTIFICATION_NOT_IN_REVIEW", "Certification is not in review.", 409);
      }
      const evaluation = evaluateSandboxCertification(detail);
      this.assertEvidenceHash(input.expected_evidence_set_hash, evaluation.evidenceSetHash);
      if (input.decision === "APPROVE") {
        if (record.submitted_by_user_id === user.userId) {
          throw new GovernanceError("SANDBOX_CERTIFICATION_SOD_VIOLATION", "Submitter cannot approve certification.", 403);
        }
        if (record.submitted_evidence_set_hash !== evaluation.evidenceSetHash) {
          throw new GovernanceError("SANDBOX_CERTIFICATION_EVIDENCE_CHANGED", "Evidence changed after submission.", 409);
        }
        if (!evaluation.eligible) {
          throw new GovernanceError("SANDBOX_CERTIFICATION_APPROVAL_BLOCKED", "Certification evidence is not eligible.", 409, {
            blockers: evaluation.blockerCodes,
            evidence_set_hash: evaluation.evidenceSetHash,
          });
        }
      }
    });
    return this.publicDetail(result.detail, user, result.replayed);
  }

  async planPromotion(
    user: PortalUser,
    certificationId: string,
    input: SandboxPromotionPlanRequest,
    requestId: string,
  ) {
    this.assertAdmin(user);
    const result = await this.repository.planPromotion({
      ...this.baseWrite(user, certificationId, input, requestId),
      planId: newUlid("splan"),
      expectedVersion: input.expected_workflow_version,
      evidenceSetHash: input.expected_evidence_set_hash,
    }, (detail) => {
      const record = detail.certification;
      if (record.workflow_state !== "APPROVED") {
        throw new GovernanceError("SANDBOX_PROMOTION_PLAN_NOT_APPROVED", "Certification is not approved.", 409);
      }
      const evaluation = evaluateSandboxCertification(detail);
      this.assertEvidenceHash(input.expected_evidence_set_hash, evaluation.evidenceSetHash);
      if (record.decided_evidence_set_hash !== evaluation.evidenceSetHash || !evaluation.eligible) {
        throw new GovernanceError("SANDBOX_PROMOTION_EVIDENCE_STALE", "Approved evidence is no longer current.", 409, {
          blockers: evaluation.blockerCodes,
        });
      }
    });
    return {
      schema_version: "governance.sandbox-promotion-plan.v1",
      plan_id: result.plan.plan_id,
      certification_id: certificationId,
      target_stage: result.plan.target_stage,
      evidence_set_hash: result.plan.evidence_set_hash,
      status: result.plan.status,
      blocker_codes: result.plan.blocker_codes,
      source_side_effect_requested: false,
      runtime_activation_requested: false,
      promotion_execution_requested: false,
      replayed: result.replayed,
      created_at: result.plan.created_at.toISOString(),
    };
  }

  private publicDetail(
    detail: SandboxCertificationDetail,
    user: PortalUser,
    replayed: boolean,
    currentSource?: Record<string, unknown>,
  ) {
    const record = detail.certification;
    const evaluation = evaluateSandboxCertification(detail);
    const readAt = new Date().toISOString();
    const sourceConnected = currentSource !== undefined && currentSource.state !== "unavailable";
    const currentIndex = evaluation.steps.findIndex((item) => item.evaluationState !== "PASS");
    const sourcePanel = (
      panelId: string,
      authority: "EXECUTION" | "BROKER" | "DERIVED",
      stepKeys: SandboxCertificationStep[],
    ) => {
      const steps = evaluation.steps.filter((item) => stepKeys.includes(item.stepKey));
      const unavailable = steps.some((item) => item.evaluationState === "UNAVAILABLE");
      const stale = steps.some((item) => item.evaluationState === "STALE");
      const failed = steps.some((item) => item.evaluationState === "FAIL");
      const asOfValues = steps.flatMap((item) => item.evidence?.as_of ? [item.evidence.as_of] : []);
      const asOf = asOfValues.length > 0
        ? new Date(Math.min(...asOfValues.map((value) => value.valueOf()))).toISOString()
        : null;
      const panelState = unavailable ? "unavailable" : stale ? "stale" : failed ? "error" : "ready";
      return {
        panel_id: panelId,
        source_authority: authority,
        as_of: asOf,
        read_at: readAt,
        // Evidence retains its raw source cursor only server-side for audit.
        // The product panel gets stable local projection coordinates instead.
        source_cursor: null,
        source_sequence: null,
        projection_epoch: steps.find((item) => item.evidence?.projection_epoch)?.evidence?.projection_epoch ?? null,
        projection_sequence: steps.find((item) => item.evidence?.projection_sequence)?.evidence?.projection_sequence ?? null,
        source_completeness: "UNKNOWN",
        poll_interval_ms: null,
        panel_state: panelState,
        freshness_state: stale ? "STALE" : unavailable ? "UNKNOWN" : "OK",
        age_seconds: null,
        lag_ms: null,
        formula_version: authority === "DERIVED" ? record.formula_version : null,
        capability_snapshot_id: steps.find((item) => item.evidence?.capability_snapshot_id)
          ?.evidence?.capability_snapshot_id ?? null,
        delivery_profile: record.delivery_profile,
        source_verification_state: unavailable ? "UNAVAILABLE" : "VERIFIED",
        data: unavailable ? null : {
          steps: steps.map((item) => ({ step_key: item.stepKey, evaluation_state: item.evaluationState })),
        },
        warnings: panelState === "ready" ? [] : [{ code: `SANDBOX_${panelId.toUpperCase()}_${panelState.toUpperCase()}` }],
      };
    };
    return {
      schema_version: "governance.sandbox-certification.v1",
      record_authority: "PORTAL",
      delivery_profile: sourceConnected ? "SANDBOX_BINANCE_USDM" : record.delivery_profile,
      source_integration_state: sourceConnected ? "SOURCE_BACKED" : record.source_integration_state,
      source_side_effect_requested: false,
      runtime_activation_requested: false,
      promotion_execution_requested: false,
      replayed,
      read_at: readAt,
      actor: { user_id: user.userId, username: user.username, roles: [user.role] },
      ...(currentSource ? { current_source: browserSafeProfileRead(currentSource) } : {}),
      certification: {
        certification_id: record.certification_id,
        deployment_id: record.deployment_id,
        portfolio_id: record.portfolio_id,
        venue: record.venue,
        environment: "SANDBOX",
        workflow_state: record.workflow_state,
        workflow_version: record.workflow_version,
        runtime_state: null,
        account_binding: {
          account_id: record.account_id,
          external_account_ref: record.external_account_ref,
          source_authority: "PORTAL",
        },
        policy_version: record.policy_version,
        formula_version: record.formula_version,
        submitted_at: iso(record.submitted_at),
        submitted_by_user_id: record.submitted_by_user_id,
        submitted_evidence_set_hash: record.submitted_evidence_set_hash,
        decided_at: iso(record.decided_at),
        decided_by_user_id: record.decided_by_user_id,
        decided_evidence_set_hash: record.decided_evidence_set_hash,
        decision_reason: record.decision_reason,
        created_by_user_id: record.created_by_user_id,
        created_at: record.created_at.toISOString(),
        updated_at: record.updated_at.toISOString(),
      },
      lineage: [
        { kind: "ARTIFACT", value: record.artifact_digest, href: null, source_authority: "RESEARCH" },
        { kind: "R1_APPROVAL", value: record.r1_approval_id, href: `/governance/approvals/${record.r1_approval_id}/r1`, source_authority: "PORTAL" },
        { kind: "R2_APPROVAL", value: record.r2_approval_id, href: `/governance/approvals/${record.r2_approval_id}/r2`, source_authority: "PORTAL" },
        { kind: "PAPER_EXIT", value: record.paper_exit_review_id, href: `/deployments/paper/exit/${record.paper_exit_review_id}`, source_authority: "PORTAL" },
        { kind: "PROMOTION_GRANT", value: record.promotion_grant_id, href: null, source_authority: "PORTAL" },
      ],
      progress: {
        passed_count: evaluation.passedCount,
        total_count: SANDBOX_CERTIFICATION_STEPS.length,
        eligible: evaluation.eligible,
        evidence_set_hash: evaluation.evidenceSetHash,
        blocker_codes: evaluation.blockerCodes,
      },
      steps: evaluation.steps.map((item, index) => ({
        step_key: item.stepKey,
        ordinal: item.ordinal,
        label: item.label,
        strip_state: item.evaluationState === "PASS"
          ? "DONE"
          : index === (currentIndex === -1 ? evaluation.steps.length - 1 : currentIndex)
            ? "CURRENT"
            : "PENDING",
        evaluation_state: item.evaluationState,
        source_authority: item.sourceAuthority,
        evidence_hash: item.evidence?.evidence_hash ?? null,
        evidence_schema_version: item.evidence?.evidence_schema_version ?? null,
        source_verification_state: item.evidence?.source_verification_state ?? "UNAVAILABLE",
        summary: item.evidence?.summary ?? "Source evidence is not available in the current delivery profile.",
        as_of: iso(item.evidence?.as_of ?? null),
        expires_at: iso(item.evidence?.expires_at ?? null),
        blocker_code: item.blockerCode,
      })),
      source_panels: [
        sourcePanel("internal", "EXECUTION", ["TIMEBOXED_RUN"]),
        sourcePanel("broker", "BROKER", ["CONNECT", "SYNC", "ORDER_TYPES"]),
        sourcePanel("difference", "DERIVED", ["RECONCILIATION", "CLEANUP"]),
      ],
      timeboxed_run_policy: null,
      smoke_plan: detail.smokePlan === null ? null : {
        plan_id: detail.smokePlan.plan_id,
        qty: detail.smokePlan.qty,
        cap: detail.smokePlan.cap,
        currency: detail.smokePlan.currency,
        timebox_minutes: detail.smokePlan.timebox_minutes,
        operator: {
          user_id: detail.smokePlan.operator_user_id,
          username: detail.smokePlan.operator_username,
        },
        status: detail.smokePlan.status,
        approved_by: detail.smokePlan.approved_by_user_id === null ? null : {
          user_id: detail.smokePlan.approved_by_user_id,
          username: detail.smokePlan.approved_by_username,
        },
        approved_at: iso(detail.smokePlan.approved_at),
        source_side_effect_requested: false,
      },
      findings: {
        total_count: detail.findingsTotal,
        returned_count: detail.findings.length,
        truncated: detail.findingsTotal > detail.findings.length,
        rows: detail.findings.map((item) => ({
          finding_id: item.finding_id,
          severity: item.severity,
          source_authority: item.source_authority,
          finding_code: item.finding_code,
          summary: item.summary,
          blocking: item.blocking,
          evidence_hash: item.evidence_hash,
          as_of: iso(item.as_of),
          resolved_at: iso(item.resolved_at),
          created_at: item.created_at.toISOString(),
        })),
      },
      timeline: {
        total_count: detail.eventsTotal,
        returned_count: detail.events.length,
        truncated: detail.eventsTotal > detail.events.length,
        rows: detail.events.map((item) => ({
          event_id: item.event_id,
          actor_user_id: item.actor_user_id,
          action: item.action,
          workflow_version_before: item.workflow_version_before,
          workflow_version_after: item.workflow_version_after,
          created_at: item.created_at.toISOString(),
        })),
      },
      promotion_plans: detail.promotionPlans.map((item) => ({
        plan_id: item.plan_id,
        target_stage: item.target_stage,
        evidence_set_hash: item.evidence_set_hash,
        status: item.status,
        blocker_codes: item.blocker_codes,
        source_side_effect_requested: false,
        created_at: item.created_at.toISOString(),
      })),
    };
  }

  private sourceOnlyDetail(
    user: PortalUser,
    deploymentId: string,
    currentSource: Record<string, any>,
  ) {
    const deployment = Array.isArray(currentSource.data?.deployments)
      ? currentSource.data.deployments.find((row: Record<string, unknown>) => row.deployment_id === deploymentId)
      : null;
    if (!deployment && currentSource.state !== "unavailable" && currentSource.state !== "partial") {
      throw new GovernanceError("SANDBOX_DEPLOYMENT_NOT_FOUND", "Sandbox deployment not found.", 404);
    }
    const readAt = new Date().toISOString();
    const reason = "PHASE2_CERTIFICATION_RECORD_NOT_CREATED";
    return {
      schema_version: "governance.sandbox-certification.v1",
      record_authority: "PORTAL",
      delivery_profile: currentSource.delivery_profile ?? "SANDBOX_BINANCE_USDM",
      source_integration_state: currentSource.state === "unavailable" ? "UNAVAILABLE" : "SOURCE_BACKED",
      source_side_effect_requested: false,
      runtime_activation_requested: false,
      promotion_execution_requested: false,
      replayed: false,
      read_at: readAt,
      actor: { user_id: user.userId, username: user.username, roles: [user.role] },
      current_source: browserSafeProfileRead(currentSource),
      certification: {
        certification_id: `uncommissioned:${deploymentId}`,
        deployment_id: deploymentId,
        portfolio_id: deployment?.portfolio_id ?? null,
        venue: deployment?.venue ?? null,
        environment: "SANDBOX",
        workflow_state: "NOT_COMMISSIONED",
        workflow_version: null,
        runtime_state: deployment?.state ?? null,
        account_binding: {
          account_id: deployment?.account_id ?? null,
          external_account_ref: null,
          source_authority: "TRADING_SYSTEM",
        },
        policy_version: null,
        formula_version: null,
        submitted_at: null,
        submitted_by_user_id: null,
        submitted_evidence_set_hash: null,
        decided_at: null,
        decided_by_user_id: null,
        decided_evidence_set_hash: null,
        decision_reason: null,
        created_by_user_id: null,
        created_at: null,
        updated_at: null,
      },
      lineage: [],
      progress: {
        passed_count: 0,
        total_count: SANDBOX_CERTIFICATION_STEPS.length,
        eligible: false,
        evidence_set_hash: null,
        blocker_codes: [reason],
      },
      steps: SANDBOX_CERTIFICATION_STEPS.map((stepKey, ordinal) => ({
        step_key: stepKey,
        ordinal,
        label: STEP_LABEL[stepKey],
        strip_state: ordinal === 0 ? "CURRENT" : "PENDING",
        evaluation_state: "UNAVAILABLE",
        source_authority: STEP_AUTHORITY[stepKey],
        evidence_hash: null,
        evidence_schema_version: null,
        source_verification_state: "UNAVAILABLE",
        summary: "Portal certification evidence has not been commissioned for this source deployment.",
        as_of: currentSource.as_of ?? null,
        expires_at: null,
        blocker_code: reason,
      })),
      source_panels: ["internal", "broker", "difference"].map((panelId) => ({
        panel_id: panelId,
        source_authority: panelId === "internal" ? "EXECUTION" : panelId === "broker" ? "BROKER" : "DERIVED",
        as_of: currentSource.as_of ?? null,
        read_at: readAt,
        source_cursor: null,
        source_sequence: null,
        projection_epoch: null,
        projection_sequence: null,
        source_completeness: currentSource.completeness ?? "UNKNOWN",
        poll_interval_ms: null,
        panel_state: currentSource.state === "unavailable" ? "unavailable" : "partial",
        freshness_state: currentSource.freshness ?? "UNKNOWN",
        age_seconds: null,
        lag_ms: null,
        formula_version: null,
        capability_snapshot_id: null,
        delivery_profile: currentSource.delivery_profile ?? "SANDBOX_BINANCE_USDM",
        source_verification_state: "UNAVAILABLE",
        data: panelId === "internal" ? currentSource.data ?? null : null,
        warnings: [{ code: reason }],
      })),
      findings: { total_count: 0, returned_count: 0, truncated: false, rows: [] },
      timeline: { total_count: 0, returned_count: 0, truncated: false, rows: [] },
      promotion_plans: [],
    };
  }

  private baseWrite(
    user: PortalUser,
    certificationId: string,
    input: { workspace_id: string; request_key: string },
    requestId: string,
  ) {
    return {
      certificationId,
      workspaceId: input.workspace_id,
      actorUserId: user.userId,
      requestKey: input.request_key,
      requestDigest: digest(input),
      requestId,
      eventId: newUlid("scevt"),
      auditEventId: newUlid("aud"),
    };
  }

  private assertEvidenceHash(expected: string, actual: string) {
    if (expected !== actual) {
      throw new GovernanceError("SANDBOX_CERTIFICATION_EVIDENCE_SET_CHANGED", "Evidence set changed.", 409, {
        expected,
        actual,
      });
    }
  }

  private assertAdmin(user: PortalUser) {
    if (user.role !== "ADMIN") throw new GovernanceError("ADMIN_ROLE_REQUIRED", "Access denied.", 403);
  }
}
