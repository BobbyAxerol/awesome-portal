import { ResearchRunSyncService } from "../facade/run-sync.service";
import { checklistEvidenceReference } from "./evidence-reference";
import { decisionContext } from "./review-context";
import { computeEvidenceManifestHash } from "./evidence-manifest";
export { computeEvidenceManifestHash } from "./evidence-manifest";
import { GovernanceReviewCaptureService } from "./review-capture.service";
import { createHash } from "crypto";
import { Inject, Injectable, Optional } from "@nestjs/common";
import { constantTimeEqual } from "../auth/argon";
import {
  ControlApiConfig,
  governanceApplySigningKeys,
  querySigningKeys,
} from "../config";
import { AuthSession, PortalUser } from "../domain";
import { newUlid } from "../id";
import { ControlPlaneQueryService, KeysetCursorCodec, RawKeysetQuery } from "../query";
import { exactPageReadTruth } from "../query/read-truth";
import { CONTROL_API_CONFIG } from "../tokens";
import { TypedCondition } from "../operations/contracts";
import { ProfileReadService } from "../profile-read/profile-read.service";
import { browserSafeProfileRead } from "../execution/browser-safe-profile-read";
import { GovernanceApplyTokenSigner } from "./apply-token";
import {
  approvalHistoryResource,
  approvalInboxResource,
  APPROVAL_GATES,
  type ApprovalGate,
  type MayDecideApproval,
  governanceConditionsResource,
  R1Decision,
} from "./contracts";
import {
  ApprovalRecord,
  DecisionPlanRecord,
  EvidenceRecord,
  GovernanceRepository,
} from "./governance.repository";
import { OwnerAccessService, type EffectiveAccess } from "../auth/owner-access.service";
import {
  GOVERNANCE_DENIAL_MESSAGE,
  governanceDenial,
  mayGovern,
} from "../auth/governance-access";

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

type PortalDecisionCommand = "GOVERNANCE_R1_DECISION" | "GOVERNANCE_R2_DECISION" | "GOVERNANCE_LIVE_DECISION";
function decisionRoute(command: PortalDecisionCommand) {
  return command === "GOVERNANCE_R2_DECISION" ? { gate: "R2", access: "r2", schema: "r2" } as const
    : command === "GOVERNANCE_LIVE_DECISION" ? { gate: "LIVE_GATE", access: "live", schema: "live" } as const
      : { gate: "R1", access: "r1", schema: "r1" } as const;
}

interface PlanInput {
  commandType?: PortalDecisionCommand;
  workspaceId: string;
  requestKey: string;
  approvalId: string;
  expectedApprovalVersion: number;
  decision: R1Decision;
  reason: string;
  conditions: TypedCondition[];
  evidenceHashes: string[];
}

interface CreateApprovalInput {
  workspaceId: string;
  requestKey: string;
  alphaId: string;
  evidenceRunId: string;
  methodologyClaimId: string;
  summary: string;
  expectedArtifactSha256?: string;
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

function publicPlan(plan: DecisionPlanRecord, applyToken: string | null) {
  const command = plan.commandType ?? "GOVERNANCE_R1_DECISION";
  const route = decisionRoute(command);
  return {
    schema_version: `governance.${route.schema}-decision-plan.v1`,
    operation_id: plan.operationId,
    command_type: command,
    command_version: 1,
    approval_id: plan.approvalId,
    expected_approval_version: plan.expectedApprovalVersion,
    payload_hash: plan.payloadHash,
    evidence_set_hash: plan.evidenceSetHash,
    risk_tier: route.gate,
    ...(route.gate !== "R1" ? { decision_authority: "PORTAL_ONLY", source_side_effect_requested: false } : {}),
    blockers: plan.blockerCodes.map((code) => ({ code })),
    warnings: plan.warningCodes.map((code) => ({ code })),
    required_approvers: [{ role: "ADMIN", count: plan.quorumRequired }],
    authority_requirements: { capability: `governance.${route.access}.decide`,
      role_constraint: route.gate === "R2" ? "ADMIN" : null,
      workspace_membership_required: true, separation_of_duties_required: true },
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
    @Inject(ProfileReadService) private readonly profileReads: ProfileReadService,
    @Inject(OwnerAccessService) private readonly ownerAccess: OwnerAccessService,
    @Optional() @Inject(ResearchRunSyncService) private readonly runSync?: ResearchRunSyncService,
    @Optional() @Inject(GovernanceReviewCaptureService) private readonly captures?: GovernanceReviewCaptureService,
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
    /*
     * A4-D14 · read the caller's real authority before building the page.
     *
     * Read at request time like every other A4-3 decision — there is no cache,
     * so a grant made a second ago is already reflected in this list.
     */
    const access = await this.ownerAccess.effectiveAccess(user.userId);
    const mayDecide = approvalDecisionPredicate(user, access, workspaceId);
    const visibleGates = approvalReadGates(user, access, workspaceId);
    const [page, counts] = await Promise.all([
      this.query.list(approvalInboxResource(user, mayDecide, visibleGates), {
        actorId: user.userId,
        workspaceId,
        role: user.role,
      }, raw),
      this.repository.counts(workspaceId, visibleGates),
    ]);
    return {
      schema_version: "governance.approval-inbox.v1",
      record_authority: "PORTAL",
      /* The workspace this page was read from. Published so a decision taken on
         these rows can name the same one instead of guessing: the client used
         to post the literal "default", which is not a workspace id, so every
         Approve/Deny answered 404 WORKSPACE_NOT_FOUND on the first press. The
         controller's own resolver already accepts an absent workspace, but the
         request schema requires the field, so the client must be able to say
         it. */
      workspace_id: workspaceId,
      delivery_profile: "fixture",
      read_at: new Date().toISOString(),
      actor: { user_id: user.userId, username: user.username, roles: [user.role] },
      counts: {
        pending: counts.pending,
        overdue: counts.overdue,
        due_soon: counts.dueSoon,
      },
      read_truth: exactPageReadTruth(page, "NO_MATCHING_PORTAL_GOVERNANCE_RECORDS"),
      page,
    };
  }

  async history(user: PortalUser, workspaceId: string, raw: RawKeysetQuery) {
    const access = await this.ownerAccess.effectiveAccess(user.userId);
    const visibleGates = approvalReadGates(user, access, workspaceId);
    const page = await this.query.list(
      approvalHistoryResource(visibleGates),
      { actorId: user.userId, workspaceId, role: user.role },
      raw,
    );
    return {
      schema_version: "governance.approval-history.v1",
      record_authority: "PORTAL",
      delivery_profile: "fixture",
      read_at: new Date().toISOString(),
      actor: { user_id: user.userId, username: user.username, roles: [user.role] },
      read_truth: exactPageReadTruth(page, "NO_MATCHING_PORTAL_GOVERNANCE_RECORDS"),
      page,
    };
  }

  async conditions(user: PortalUser, workspaceId: string, raw: RawKeysetQuery) {
    const access = await this.ownerAccess.effectiveAccess(user.userId);
    const visibleGates = approvalReadGates(user, access, workspaceId);
    const page = await this.query.list(
      governanceConditionsResource(visibleGates),
      { actorId: user.userId, workspaceId, role: user.role },
      raw,
    );
    return {
      schema_version: "governance.conditions-register.v1",
      record_authority: "PORTAL_CONTROL",
      delivery_profile: "portal",
      read_at: new Date().toISOString(),
      actor: { user_id: user.userId, username: user.username, roles: [user.role] },
      read_truth: exactPageReadTruth(page, "NO_MATCHING_PORTAL_GOVERNANCE_RECORDS"),
      page,
    };
  }

  /*
   * A4-3 · the R1/R2 gates, decided from a capability rather than a role.
   *
   * `role === "ADMIN"` meant every administrator could read and decide every
   * approval in every workspace. §20.2 rule 3 narrows that to the owner plus
   * whoever the owner explicitly delegated, and §20.2 rule 4 keeps the two
   * halves apart: a person granted `governance.r1.read` sees the review and
   * gets no decision affordance at all.
   *
   * Everything the gate already enforced still runs AFTER this — evidence
   * completeness, quorum, expiry, self-approval, already-decided. A grant says
   * who may be in the room; it never says the decision is allowed.
   */
  private async governance(
    user: PortalUser,
    gate: "r1" | "r2" | "canary" | "live",
    mode: "read" | "decide",
    workspaceId: string | null,
  ): Promise<boolean> {
    const access = await this.ownerAccess.effectiveAccess(user.userId);
    return mayGovern({ access, gate, mode, workspaceId });
  }

  private async assertGovernance(
    user: PortalUser,
    gate: "r1" | "r2" | "canary" | "live",
    mode: "read" | "decide",
    workspaceId: string | null,
  ): Promise<void> {
    const access = await this.ownerAccess.effectiveAccess(user.userId);
    const denial = governanceDenial({ access, gate, mode, workspaceId });
    if (denial) throw new GovernanceError(denial, GOVERNANCE_DENIAL_MESSAGE[denial], 403);
  }

  /**
   * Internal P22 read of the same RunSync-backed evidence R1 create uses.
   */
  async publicationEvidence(user: PortalUser, workspaceId: string, runId: string, refresh = false) {
    if (refresh) await this.runSync?.refresh(user, workspaceId, runId);
    const run = await this.repository.approvalEvidenceRun(workspaceId, runId);
    return run ? {
      run_id: run.runId, alpha_id: run.alphaId, status: run.status,
      artifact_sha256: run.artifactSha256, artifact_schema_version: run.artifactSchemaVersion,
      methodology_claim_ids: run.methodologyClaimIds, captured_at: run.capturedAt.toISOString(),
    } : null;
  }

  /**
   * A publisher can reconcile their own R1 receipt without R1 review rights.
   * Return only a boolean; the full mirror still uses detail() authorization.
   */
  async verifyPublicationPin(
    user: PortalUser,
    workspaceId: string,
    approvalId: string,
    expected: { alphaId: string; runId: string; sha256: string; schemaVersion: string; evidenceSetHash: string },
  ): Promise<boolean> {
    const snapshot = await this.repository.detail(workspaceId, approvalId);
    if (!snapshot || snapshot.approval.gate !== "R1" || snapshot.approval.requesterUserId !== user.userId
      || snapshot.approval.subjectId !== expected.alphaId
      || snapshot.approval.evidenceSetHash !== expected.evidenceSetHash
      || computeEvidenceManifestHash(snapshot.evidence) !== expected.evidenceSetHash
      || snapshot.evidence.length !== 1) return false;
    const pin = snapshot.evidence[0]!;
    return pin.kind === "ALPHA_ARTIFACT" && pin.artifactId === expected.runId
      && pin.sha256 === expected.sha256 && pin.schemaVersion === expected.schemaVersion
      && pin.sourceAuthority === "RESEARCH" && pin.sourceReference === expected.runId
      && pin.verification === "SERVER_PINNED";
  }

  async createApproval(user: PortalUser, input: CreateApprovalInput, requestId: string) {
    if (!(await this.repository.isWorkspaceMember(input.workspaceId, user.userId))) {
      throw new GovernanceError("WORKSPACE_ACCESS_DENIED", "Access denied.", 403);
    }
    const payloadHash = digest({
      gate: "R1",
      alpha_id: input.alphaId,
      evidence_run_id: input.evidenceRunId,
      methodology_claim_id: input.methodologyClaimId,
      summary: input.summary,
    });
    const replay = await this.repository.findCreatedApproval(
      input.workspaceId,
      user.userId,
      input.requestKey,
    );
    if (replay) {
      if (replay.payloadHash !== payloadHash) {
        throw new GovernanceError(
          "REQUEST_KEY_PAYLOAD_CONFLICT",
          "Request key was already used for another approval request.",
          409,
        );
      }
      return {
        schema_version: "governance.approval-create.v1",
        replayed: true,
        approval: this.publicApproval(replay.approval),
      };
    }

    // P4-I / F17: the run read model is refreshed from the research service
    // before the eligibility check, so completion, the frozen artifact pin and
    // the methodology claims reach governance. A failed refresh changes
    // nothing — the check below still decides, fail-closed.
    await this.runSync?.refresh(user, input.workspaceId, input.evidenceRunId);
    const run = await this.repository.approvalEvidenceRun(input.workspaceId, input.evidenceRunId);
    if (!run) {
      throw new GovernanceError("EVIDENCE_RUN_NOT_FOUND", "Evidence run was not found.", 422);
    }
    if (input.expectedArtifactSha256 && run.artifactSha256 !== input.expectedArtifactSha256) {
      throw new GovernanceError("EVIDENCE_ARTIFACT_CHANGED", "Pinned research artifact changed before R1 creation.", 409);
    }
    if (
      run.alphaId !== input.alphaId ||
      !["COMPLETED", "SUCCEEDED", "COMPLETE"].includes(run.status) ||
      !run.methodologyClaimIds.includes(input.methodologyClaimId)
    ) {
      throw new GovernanceError(
        "EVIDENCE_RUN_NOT_ELIGIBLE",
        "Evidence run is not eligible for this alpha and methodology claim.",
        422,
      );
    }
    const evidenceId = newUlid("ev");
    const evidence: EvidenceRecord = {
      evidenceId,
      ordinal: 0,
      kind: "ALPHA_ARTIFACT",
      label: "Pinned research artifact",
      displayValue: run.runId,
      note: input.summary,
      verification: "SERVER_PINNED",
      artifactId: run.runId,
      sha256: run.artifactSha256,
      sizeBytes: null,
      mediaType: "application/json",
      schemaVersion: run.artifactSchemaVersion,
      sourceAuthority: "RESEARCH",
      sourceReference: run.runId,
      required: true,
      capturedAt: run.capturedAt,
      retentionClass: "GOVERNANCE_LONG_TERM",
      accessPolicy: "WORKSPACE_APPROVER",
    };
    const createdAt = new Date();
    try {
      const created = await this.repository.createR1Approval({
        approvalId: newUlid("apr"),
        evidenceId,
        auditEventId: newUlid("evt"),
        requestId,
        requestKey: input.requestKey,
        payloadHash,
        workspaceId: input.workspaceId,
        requesterUserId: user.userId,
        requesterUsername: user.username,
        alphaId: input.alphaId,
        sourceRunId: input.evidenceRunId,
        methodologyClaimId: input.methodologyClaimId,
        summary: input.summary,
        expectedArtifactSha256: run.artifactSha256,
        evidenceSetHash: computeEvidenceManifestHash([evidence]),
        createdAt,
        evidenceCapturedAt: run.capturedAt,
        slaDueAt: new Date(createdAt.valueOf() + 24 * 60 * 60 * 1000),
        expiresAt: new Date(createdAt.valueOf() + 72 * 60 * 60 * 1000),
      });
      return {
        schema_version: "governance.approval-create.v1",
        replayed: false,
        approval: this.publicApproval(created),
      };
    } catch (error) {
      const typed = error as { code?: string; constraint?: string; governanceCode?: string; status?: number };
      if (typed.governanceCode) {
        throw new GovernanceError(typed.governanceCode, "Approval request could not be created.", typed.status ?? 422);
      }
      // A concurrent duplicate can violate either unique index first.  Always
      // settle request-key idempotency before classifying the distinct
      // alpha/run conflict, otherwise two byte-identical retries can
      // nondeterministically receive 409 instead of the canonical replay.
      if (typed.code === "23505" || typed.code === "40001") {
        const raced = await this.repository.findCreatedApproval(input.workspaceId, user.userId, input.requestKey);
        if (raced?.payloadHash === payloadHash) {
          return {
            schema_version: "governance.approval-create.v1",
            replayed: true,
            approval: this.publicApproval(raced.approval),
          };
        }
        if (raced) {
          throw new GovernanceError("REQUEST_KEY_PAYLOAD_CONFLICT", "Request key payload conflicts.", 409);
        }
      }
      if (
        (typed.code === "23505" && typed.constraint === "governance_approval_open_alpha_run_idx") ||
        typed.code === "40001"
      ) {
        const existing = await this.repository.findOpenApprovalForAlphaRun(
          input.workspaceId,
          input.alphaId,
          input.evidenceRunId,
        );
        if (existing) {
          throw new GovernanceError(
            "DUPLICATE_OPEN_APPROVAL",
            "An open approval already exists for this alpha and evidence run.",
            409,
            { approval_id: existing.approvalId },
          );
        }
      }
      if (typed.code === "40001") {
        throw new GovernanceError(
          "APPROVAL_CREATE_SERIALIZATION_CONFLICT",
          "Concurrent approval creation did not settle within this request.",
          409,
        );
      }
      throw error;
    }
  }

  async detail(user: PortalUser, workspaceId: string, approvalId: string) {
    await this.assertGovernance(user, "r1", "read", workspaceId);
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
    const mayDecideR1 = await this.governance(user, "r1", "decide", workspaceId);
    if (!mayDecideR1 || alreadyDecided) locks.push("NOT_ELIGIBLE");

    return {
      schema_version: "governance.r1-review.v1",
      record_authority: "PORTAL",
      workspace_id: workspaceId,
      delivery_profile: "fixture",
      read_at: new Date().toISOString(),
      data: {
        approval: this.publicApproval(approval),
        actor: { user_id: user.userId, username: user.username, roles: [user.role] },
        decision_context: decisionContext(approval, evidence, mayDecideR1),
        ...(this.captures ? { capture_context: await this.captures.context(user, "R2_CREATE", approval) } : {}),
        eligibility: {
          can_approve: approval.status === "PENDING" && locks.length === 0,
          can_approve_with_condition: approval.status === "PENDING" && locks.length === 0,
          can_deny: approval.status === "PENDING" && !expired && mayDecideR1 && !alreadyDecided,
          can_request_changes:
            approval.status === "PENDING" && !expired && mayDecideR1 && !alreadyDecided && !self,
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
          ...checklistEvidenceReference(item.basisHashes, evidence),
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
    await this.assertGovernance(user, "r2", "read", workspaceId);
    return this.r2Payload(user, workspaceId, approvalId);
  }

  /*
   * A4-3 · the R2 payload without the R2 authorization.
   *
   * The Live review is built on top of the R2 backbone, and before this split
   * that meant a Live reader also had to hold `governance.r2.read` — so
   * delegating Live alone silently did not work. §20.3 gives each gate its own
   * capability; the gate that is being read is the gate that must be granted,
   * and the caller above asserts it.
   */
  private async r2Payload(user: PortalUser, workspaceId: string, approvalId: string,
    gate: "R2" | "LIVE_GATE" = "R2") {
    const detail = await this.repository.r2Detail(workspaceId, approvalId, gate);
    if (!detail) {
      throw new GovernanceError("APPROVAL_NOT_FOUND", "Approval not found.", 404);
    }
    const { approval, scope, lineage, evidence, parentEvidence } = detail;
    if (computeEvidenceManifestHash(evidence) !== approval.evidenceSetHash) {
      throw new GovernanceError("EVIDENCE_MANIFEST_INTEGRITY_FAILED", "Evidence manifest integrity check failed.", 409);
    }
    if (lineage && computeEvidenceManifestHash(parentEvidence) !== lineage.r1EvidenceSetHash) {
      throw new GovernanceError(
        "R1_EVIDENCE_MANIFEST_INTEGRITY_FAILED",
        "Referenced R1 evidence manifest integrity check failed.",
        409,
      );
    }
    const self = approval.requesterUserId === user.userId || approval.artifactCreatorUserId === user.userId;
    const alreadyDecided = approval.decisionActorIds.includes(user.userId);
    const expired = approval.expiresAt <= new Date();
    const mayDecide = await this.governance(user, gate === "R2" ? "r2" : "live", "decide", workspaceId);
    const commonLocks = [
      ...(approval.status !== "PENDING" ? ["APPROVAL_NOT_PENDING"] : []),
      ...(gate === "LIVE_GATE" ? ["LIVE_PARENT_NOT_PUBLISHED"] : []),
      ...(!mayDecide || alreadyDecided ? ["NOT_ELIGIBLE"] : []),
      ...(expired ? ["EXPIRED"] : []),
      ...(gate === "R2" && user.role !== "ADMIN" ? ["ADMIN_ROLE_REQUIRED"] : []),
      ...(gate === "R2" && lineage === null ? ["R1_LINEAGE_UNPUBLISHED"] : []),
    ];
    const locks = [...commonLocks,
      ...(self ? ["SELF_APPROVAL"] : []),
      ...(lineage?.planAuthorUserId === user.userId && !self ? ["SELF_APPROVAL"] : []),
      ...(!approval.evidenceComplete ? ["EVIDENCE_INCOMPLETE"] : []),
      ...(approval.blockerCount > 0 ? ["BLOCKING_FINDINGS"] : []),
      ...(lineage !== null && !["APPROVED", "APPROVED_WITH_CONDITION"].includes(lineage.r1Status)
        ? ["R1_NOT_APPROVED"]
        : []),
      ...(lineage !== null && lineage.r1ExpiresAt <= new Date() ? ["R1_EXPIRED"] : []),
      ...(lineage !== null && !lineage.r1EvidenceComplete ? ["R1_EVIDENCE_INCOMPLETE"] : []),
    ];
    const r1Reference = lineage === null ? null : {
      approval_id: lineage.r1ApprovalId,
      state: lineage.r1Status,
      href: `/governance/approvals/${lineage.r1ApprovalId}/r1?workspace_id=${encodeURIComponent(workspaceId)}`,
      expiry: lineage.r1ExpiresAt.toISOString(),
      digest: lineage.r1EvidenceSetHash,
      decided_by: lineage.r1DecidedByUsername,
      decided_at: lineage.r1DecidedAt?.toISOString() ?? null,
    };
    return {
      schema_version: gate === "R2" ? "governance.r2-review.v1" : "governance.live-decision-review.v1",
      record_authority: "PORTAL",
      workspace_id: workspaceId,
      delivery_profile: "fixture",
      read_at: new Date().toISOString(),
      data: {
        approval: {
          ...this.publicApproval(approval),
          portfolio_id: scope?.portfolioId ?? null,
          currency: scope?.currency ?? null,
        },
        actor: { user_id: user.userId, username: user.username, roles: [user.role] },
        decision_context: decisionContext(approval, evidence, mayDecide,
          gate === "R2" && lineage === null ? "R1_LINEAGE_UNPUBLISHED"
            : gate === "R2" && user.role !== "ADMIN" ? "ADMIN_ROLE_REQUIRED" : null),
        ...(this.captures && gate === "R2" ? { capture_context: await this.captures.context(user, "PAPER_EXIT_CREATE", approval,
          lineage && scope ? { ...lineage, portfolioId: scope.portfolioId } : null) } : {}),
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
          entries: parentEvidence.map((item) => ({
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
        decision_evidence_manifest: {
          manifest_hash: approval.evidenceSetHash, complete: approval.evidenceComplete,
          entries: evidence.map(item => ({ evidence_id: item.evidenceId, ordinal: item.ordinal,
            kind: item.kind, label: item.label, sha256: item.sha256, schema_version: item.schemaVersion,
            source_authority: item.sourceAuthority, captured_at: item.capturedAt.toISOString() })),
        },
        eligibility: {
          can_approve: approval.status === "PENDING" && locks.length === 0,
          can_approve_with_condition: approval.status === "PENDING" && locks.length === 0,
          can_deny: commonLocks.length === 0,
          can_request_changes: commonLocks.length === 0 && !self && lineage?.planAuthorUserId !== user.userId,
          locks,
          separation_of_duties: self ? "VIOLATION" : "OK",
        },
      },
    };
  }

  async liveDetail(
    user: PortalUser,
    session: AuthSession,
    workspaceId: string,
    approvalId: string,
  ) {
    await this.assertGovernance(user, "live", "read", workspaceId);
    const backbone = await this.r2Payload(user, workspaceId, approvalId, "LIVE_GATE") as Record<string, unknown>;
    const data = backbone.data as { approval?: { subject_id?: unknown } } | undefined;
    const subjectId = data?.approval?.subject_id;
    if (typeof subjectId !== "string" || subjectId.length < 1 || subjectId.length > 191) {
      throw new GovernanceError(
        "N23_LIVE_GATE_SUBJECT_INVALID",
        "Live gate approval subject is not a deployment.",
        409,
      );
    }
    const currentSource = await this.profileReads.snapshot(
      { user, session, workspaceId },
      "canary",
      "EXECUTION_CANARY_CONTROL_ROOM_SCREEN",
      subjectId,
    );
    const sourceData = currentSource.data as Record<string, unknown>;
    const sourceFacts = ["positions", "orders", "fills", "sessions"]
      .reduce((count, key) => count + (Array.isArray(sourceData[key]) ? sourceData[key].length : 0), 0);
    const liveKpiState = currentSource.state === "unavailable" ? "UNAVAILABLE"
      : sourceFacts === 0 ? "EMPTY" : currentSource.completeness === "PARTIAL" ? "PARTIAL" : "AVAILABLE";
    return {
      schema_version: "governance.live-review.v1",
      record_authority: "PORTAL_CONTROL",
      workspace_id: workspaceId,
      source_authority: "TRADING_SYSTEM",
      delivery_profile: "LIVE_BINANCE_USDM",
      read_at: new Date().toISOString(),
      actor: { user_id: user.userId, username: user.username, roles: [user.role] },
      approval_id: approvalId,
      canary_ref: {
        deployment_id: subjectId,
        composition: "PORTAL_CANARY_GOVERNANCE_OVER_LIVE_FACTS",
      },
      governance_backbone: backbone,
      current_source: browserSafeProfileRead(currentSource),
      derived_branches: [
        { capability_id: "live-gate.kpis", state: liveKpiState,
          reason_code: liveKpiState === "UNAVAILABLE" ? "PHASE2_LIVE_GATE_SOURCE_UNAVAILABLE" : null },
        { capability_id: "live-gate.drift-series", state: "UNAVAILABLE", reason_code: "N25_LIVE_GATE_DERIVATIONS_NOT_ACTIVE" },
        { capability_id: "live-gate.criteria", state: "UNAVAILABLE", reason_code: "N24_GATE_POLICY_REGISTRY_NOT_ACTIVE" },
        { capability_id: "live-gate.capital-step", state: "UNAVAILABLE", reason_code: "N24_CAPITAL_LEDGER_NOT_ACTIVE" },
      ],
      source_side_effect_requested: false,
      production_command_active: false,
    };
  }

  async plan(user: PortalUser, input: PlanInput, requestId: string) {
    const commandType = input.commandType ?? "GOVERNANCE_R1_DECISION";
    const route = decisionRoute(commandType);
    if (!(await this.governance(user, route.access, "decide", input.workspaceId))) {
      await this.rejected(user, input, requestId, "GOVERNANCE_CAPABILITY_REQUIRED", "DENIED");
      throw new GovernanceError("GOVERNANCE_CAPABILITY_REQUIRED", "Access denied.", 403);
    }
    // Replay can return without createPlan's transaction. It must not reuse a
    // pre-demotion actor's ADMIN role to issue an R2 apply token.
    if (route.gate === "R2") await this.assertActorAuthority(user, input.workspaceId, commandType);
    const snapshot = await this.repository.detail(input.workspaceId, input.approvalId);
    if (!snapshot) {
      throw new GovernanceError("APPROVAL_NOT_FOUND", "Approval not found.", 404);
    }
    if (snapshot.approval.gate !== route.gate) {
      const readGate = snapshot.approval.gate === "R2" ? "r2"
        : snapshot.approval.gate === "LIVE_GATE" ? "live" : null;
      if (!readGate || !await this.governance(user, readGate, "read", input.workspaceId)) {
        throw new GovernanceError("APPROVAL_NOT_FOUND", "Approval not found.", 404);
      }
      await this.rejected(user, input, requestId, "GOVERNANCE_DECISION_GATE_MISMATCH", "CONFLICT");
      throw new GovernanceError("GOVERNANCE_DECISION_GATE_MISMATCH", "This command belongs to a different review gate.", 409,
        { requested_gate: route.gate, actual_gate: snapshot.approval.gate, source_side_effect_requested: false });
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
      command_type: commandType,
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
    if (route.gate === "LIVE_GATE") blockerCodes.push("LIVE_PARENT_NOT_PUBLISHED");
    if (route.gate === "R2") {
      const r2 = await this.repository.r2Detail(input.workspaceId, input.approvalId);
      const parent = r2?.lineage;
      if (!parent) blockerCodes.push("R1_LINEAGE_UNPUBLISHED");
      else {
        if (user.role !== parent.approverRole) blockerCodes.push("ADMIN_ROLE_REQUIRED");
        if (input.decision !== "DENY" && parent.planAuthorUserId === user.userId) blockerCodes.push("SELF_APPROVAL_PROHIBITED");
        if (computeEvidenceManifestHash(r2!.parentEvidence) !== parent.r1EvidenceSetHash) {
          blockerCodes.push("R1_EVIDENCE_MANIFEST_INTEGRITY_FAILED");
        }
        if (["APPROVE", "APPROVE_WITH_CONDITION"].includes(input.decision)) {
          if (!["APPROVED", "APPROVED_WITH_CONDITION"].includes(parent.r1Status)) blockerCodes.push("R1_NOT_APPROVED");
          if (parent.r1ExpiresAt <= new Date()) blockerCodes.push("R1_EXPIRED");
          if (!parent.r1EvidenceComplete) blockerCodes.push("R1_EVIDENCE_INCOMPLETE");
        }
      }
    }
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
        commandType,
        actor: user,
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
        policyVersion: approval.policyVersion,
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
      const authority = error as { governanceCode?: string; status?: number };
      if (authority.governanceCode) throw new GovernanceError(authority.governanceCode, "Operation could not be planned.", authority.status ?? 409);
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

  async apply(user: PortalUser, workspaceId: string, operationId: string, applyToken: string, requestId: string,
    commandType: PortalDecisionCommand = "GOVERNANCE_R1_DECISION") {
    const route = decisionRoute(commandType);
    await this.assertGovernance(user, route.access, "decide", workspaceId);
    const plan = await this.repository.findPlan(workspaceId, user.userId, operationId);
    if (!plan) throw new GovernanceError("OPERATION_NOT_FOUND", "Operation not found.", 404);
    if ((plan.commandType ?? "GOVERNANCE_R1_DECISION") !== commandType) {
      throw new GovernanceError("GOVERNANCE_DECISION_GATE_MISMATCH", "This command belongs to a different review gate.", 409);
    }
    const tokenHash = createHash("sha256").update(applyToken, "utf8").digest("hex");
    if (
      !constantTimeEqual(tokenHash, plan.applyTokenHash) ||
      !this.applyTokens.verify(applyToken, plan.operationId, plan.payloadHash, plan.applyKeyId)
    ) {
      await this.repository.recordRejected({
        eventId: newUlid("evt"),
        eventType: `governance.${route.schema}_decision.apply_denied`,
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
        commandType,
        actor: user,
        actorUserId: user.userId,
        actorUsername: user.username,
        operationId,
        requestId,
        decisionId: newUlid("dec"),
        auditEventId: newUlid("evt"),
        outboxMessageId: newUlid("msg"),
        reasonHash: digest(plan.reason),
        limitationIds: plan.conditions.map(() => newUlid("lim")),
      });
      return {
        schema_version: `governance.${route.schema}-decision-apply.v1`,
        ...(route.gate !== "R1" ? { decision_authority: "PORTAL_ONLY", source_side_effect_requested: false } : {}),
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
        eventType: `governance.${route.schema}_decision.apply_rejected`,
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
    const command = plan.commandType ?? "GOVERNANCE_R1_DECISION";
    const route = decisionRoute(command);
    await this.assertGovernance(user, route.access, "decide", workspaceId);
    if (route.gate === "R2") await this.assertActorAuthority(user, workspaceId, command);
    const status = plan.status === "APPLIED"
      ? "SUCCEEDED"
      : plan.expiresAt <= new Date()
        ? "EXPIRED"
        : "PENDING";
    return {
      schema_version: `governance.${route.schema}-decision-operation.v1`,
      operation_id: plan.operationId,
      approval_id: plan.approvalId,
      command_type: command,
      ...(route.gate !== "R1" ? { decision_authority: "PORTAL_ONLY", source_side_effect_requested: false } : {}),
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

  private async assertActorAuthority(user: PortalUser, workspaceId: string, commandType: PortalDecisionCommand): Promise<void> {
    try {
      await this.repository.assertActorAuthority(user, workspaceId, commandType);
    } catch (error) {
      const typed = error as { governanceCode?: string; status?: number };
      if (!typed.governanceCode) throw error;
      throw new GovernanceError(typed.governanceCode, "Access denied.", typed.status ?? 403);
    }
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
      eventType: `governance.${decisionRoute(input.commandType ?? "GOVERNANCE_R1_DECISION").schema}_decision.plan_rejected`,
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

/**
 * A4-D14 · which inbox rows this caller could actually decide.
 *
 * One entry per gate in `APPROVAL_GATES`, each mirroring the authority that
 * gate's own decision path enforces — measured, not assumed:
 *
 *  - `R1` has its own local executor. `R2` has a separate Portal-only executor
 *    with ADMIN + scoped decide grant; each row also requires published R1
 *    lineage and independent authorship. `LIVE_GATE` has a named command but
 *    stays blocked until its predecessor policy/lineage is published. Neither
 *    gate aliases the R1 command or authorizes Execution side effects.
 *  - `PAPER_EXIT` — still role-gated. `paper-exit.service.ts` throws
 *    `APPROVER_ROLE_REQUIRED` for a non-`ADMIN`, so for these rows `ADMIN` is
 *    the correct answer and a capability check would be the wrong one.
 *  - `SANDBOX_EXIT` — no decision path exists. The gate is legal in the schema
 *    but nothing in the product creates such an approval, so nobody can decide
 *    one. Fails closed: telling somebody a row needs them when no action can be
 *    taken on it is exactly the kind of claim §3.3 forbids.
 *
 * Deliberately NOT a capability lookup for all five. The §20.3 namespace was
 * frozen in A4-1 and does not cover the exit gates; inventing entries for them
 * here would create authority the owner never granted.
 */
function approvalDecisionPredicate(
  user: PortalUser,
  access: EffectiveAccess,
  workspaceId: string | null,
): MayDecideApproval {
  return (gate) => {
    switch (gate) {
      case "R1":
        return mayGovern({ access, gate: "r1", mode: "decide", workspaceId });
      case "R2":
        return user.role === "ADMIN" && mayGovern({ access, gate: "r2", mode: "decide", workspaceId });
      case "LIVE_GATE":
        return false;
      case "PAPER_EXIT":
        return user.role === "ADMIN";
      case "SANDBOX_EXIT":
        return false;
    }
  };
}

/**
 * The Inbox, history and conditions register are reads, so their visibility
 * follows the matching `*.read` grant rather than the stronger decision
 * affordance.  This is evaluated before the SQL page/count/cursor is built;
 * it is not a cosmetic row filter after data has reached the process.
 *
 * PAPER_EXIT remains the one documented legacy exception: its published
 * service is still role-gated and A4 intentionally did not invent a new
 * capability for it.  SANDBOX_EXIT has no published reader/decision contract,
 * so only the Portal owner can inspect its historical rows until one exists.
 */
export function approvalReadGates(
  user: PortalUser,
  access: EffectiveAccess,
  workspaceId: string,
): ApprovalGate[] {
  if (access.isOwner) return [...APPROVAL_GATES];
  const gates: ApprovalGate[] = [];
  if (mayGovern({ access, gate: "r1", mode: "read", workspaceId })) gates.push("R1");
  if (mayGovern({ access, gate: "r2", mode: "read", workspaceId })) gates.push("R2");
  if (mayGovern({ access, gate: "live", mode: "read", workspaceId })) gates.push("LIVE_GATE");
  if (user.role === "ADMIN") gates.push("PAPER_EXIT");
  return gates;
}
