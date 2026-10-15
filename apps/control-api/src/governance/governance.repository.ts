import { Inject, Injectable } from "@nestjs/common";
import { Pool, PoolClient } from "pg";
import { CONTROL_API_POOL } from "../tokens";
import { TypedCondition } from "../operations/contracts";
import type { PortalUser } from "../domain";
import { assertDecisionAuthority } from "./decision-authority";
import { computeEvidenceManifestHash } from "./evidence-manifest";

export type GovernanceDecisionCommand = "GOVERNANCE_R1_DECISION" | "GOVERNANCE_R2_DECISION" | "GOVERNANCE_LIVE_DECISION";

function commandGate(command: GovernanceDecisionCommand): "R1" | "R2" | "LIVE_GATE" {
  return command === "GOVERNANCE_R1_DECISION" ? "R1" : command === "GOVERNANCE_R2_DECISION" ? "R2" : "LIVE_GATE";
}

function decisionProblem(code: string, status = 409): Error & { governanceCode: string; status: number } {
  return Object.assign(new Error(code), { governanceCode: code, status });
}

function commandEvent(command: GovernanceDecisionCommand, suffix: "planned" | "applied"): string {
  const gate = command === "GOVERNANCE_R1_DECISION" ? "r1" : command === "GOVERNANCE_R2_DECISION" ? "r2" : "live";
  return `governance.${gate}_decision.${suffix}`;
}

export interface ApprovalRecord {
  approvalId: string;
  workspaceId: string;
  gate: string;
  subjectType: string;
  subjectId: string;
  subjectLabel: string;
  releaseCandidate: string | null;
  environment: string;
  targetLabel: string;
  requesterUserId: string;
  requesterUsername: string;
  artifactCreatorUserId: string;
  artifactCreatorUsername: string;
  status: string;
  policyVersion: string;
  quorumRequired: number;
  quorumMet: number;
  decisionActorIds: string[];
  approvalVersion: number;
  evidenceSetHash: string;
  evidenceComplete: boolean;
  blockerCount: number;
  blockerSummary: string | null;
  slaDueAt: Date;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  decidedAt: Date | null;
  decidedByUserId: string | null;
}

export interface CapitalPreviewApprovalScope {
  approvalId: string;
  workspaceId: string;
  portfolioId: string;
  currency: string;
}

interface CapitalPreviewApprovalScopeRow {
  approval_id: string;
  workspace_id: string;
  portfolio_id: string;
  currency: string;
}

export interface R2ApprovalDetailRecord {
  approval: ApprovalRecord;
  scope: CapitalPreviewApprovalScope | null;
  lineage: R2LineageRecord | null;
  evidence: EvidenceRecord[];
  parentEvidence: EvidenceRecord[];
}

interface ApprovalRow {
  approval_id: string;
  workspace_id: string;
  gate: string;
  subject_type: string;
  subject_id: string;
  subject_label: string;
  release_candidate: string | null;
  environment: string;
  target_label: string;
  requester_user_id: string;
  requester_username: string;
  artifact_creator_user_id: string;
  artifact_creator_username: string;
  status: string;
  policy_version: string;
  quorum_required: number;
  quorum_met: number;
  decision_actor_ids: string[];
  approval_version: number;
  evidence_set_hash: string;
  evidence_complete: boolean;
  blocker_count: number;
  blocker_summary: string | null;
  sla_due_at: Date;
  expires_at: Date;
  created_at: Date;
  updated_at: Date;
  decided_at: Date | null;
  decided_by_user_id: string | null;
}

interface R2ApprovalDetailRow extends ApprovalRow {
  portfolio_id: string | null;
  currency: string | null;
  r1_approval_id: string | null;
  grant_id: string | null;
  grant_name: string | null;
  approver_role: "ADMIN" | null;
  plan_author_user_id: string | null;
  plan_author_username: string | null;
  r1_status: string | null;
  r1_decided_at: Date | null;
  r1_decided_by_username: string | null;
  r1_expires_at: Date | null;
  r1_evidence_set_hash: string | null;
  r1_evidence_complete: boolean | null;
}

export interface R2LineageRecord {
  r1ApprovalId: string;
  r1Status: string;
  r1DecidedAt: Date | null;
  r1DecidedByUsername: string | null;
  r1ExpiresAt: Date;
  r1EvidenceSetHash: string;
  r1EvidenceComplete: boolean;
  grantId: string;
  grantName: string;
  approverRole: "ADMIN";
  planAuthorUserId: string;
  planAuthorUsername: string;
}

export interface KnownLimitationRecord {
  limitationId: string;
  ordinal: number;
  kind: "LINEAGE" | "WARNING" | "RESTRICTION" | "WAIVER";
  label: string;
  statement: string;
  expiresAt: Date | null;
}

interface KnownLimitationRow {
  limitation_id: string;
  ordinal: number;
  kind: KnownLimitationRecord["kind"];
  label: string;
  statement: string;
  expires_at: Date | null;
}

export interface EvidenceRecord {
  evidenceId: string;
  ordinal: number;
  kind: string;
  label: string;
  displayValue: string;
  note: string | null;
  verification: string | null;
  artifactId: string | null;
  sha256: string;
  sizeBytes: string | null;
  mediaType: string | null;
  schemaVersion: string;
  sourceAuthority: string;
  sourceReference: string | null;
  required: boolean;
  capturedAt: Date;
  retentionClass: string;
  accessPolicy: string;
}

export interface ApprovalEvidenceRunRecord {
  runId: string;
  workspaceId: string;
  ownerUserId: string;
  ownerUsername: string;
  status: string;
  alphaId: string;
  artifactSha256: string;
  artifactSchemaVersion: string;
  artifactCreatorUserId: string;
  artifactCreatorUsername: string;
  methodologyClaimIds: string[];
  capturedAt: Date;
}

interface ApprovalEvidenceRunRow {
  run_id: string;
  workspace_id: string;
  owner_user_id: string;
  owner_username: string;
  status: string;
  strategy_id: string;
  artifact_sha256: string;
  artifact_schema_version: string;
  artifact_creator_user_id: string;
  artifact_creator_username: string;
  methodology_claim_ids: string[];
  updated_at: Date;
}

interface ApprovalCreateRow extends ApprovalRow {
  request_key: string | null;
  request_payload_hash: string | null;
}

interface EvidenceRow {
  evidence_id: string;
  ordinal: number;
  kind: string;
  label: string;
  display_value: string;
  note: string | null;
  verification: string | null;
  artifact_id: string | null;
  sha256: string;
  size_bytes: string | null;
  media_type: string | null;
  schema_version: string;
  source_authority: string;
  source_reference: string | null;
  required: boolean;
  captured_at: Date;
  retention_class: string;
  access_policy: string;
}

export interface FindingRecord {
  findingId: string;
  ordinal: number;
  label: string;
  outcome: "PASS" | "WATCH" | "FAIL" | "INSUFFICIENT";
  suggestion: string | null;
  blocking: boolean;
  policyVersion: string;
  formulaVersion: string | null;
  basisHashes: string[];
  evaluatedAt: Date;
}

interface FindingRow {
  finding_id: string;
  ordinal: number;
  label: string;
  outcome: "PASS" | "WATCH" | "FAIL" | "INSUFFICIENT";
  suggestion: string | null;
  blocking: boolean;
  policy_version: string;
  formula_version: string | null;
  basis_hashes: string[];
  evaluated_at: Date;
}

export interface DecisionRecord {
  decisionId: string;
  operationId: string;
  actorUserId: string;
  actorUsername: string;
  decision: string;
  reason: string;
  condition: string | null;
  conditions: TypedCondition[];
  evidenceSetHash: string;
  approvalVersionBefore: number;
  approvalVersionAfter: number;
  decidedAt: Date;
}

interface DecisionRow {
  decision_id: string;
  operation_id: string;
  actor_user_id: string;
  actor_username: string;
  decision: string;
  reason: string;
  condition: string | null;
  conditions: TypedCondition[];
  evidence_set_hash: string;
  approval_version_before: number;
  approval_version_after: number;
  decided_at: Date;
}

export interface DecisionPlanRecord {
  operationId: string;
  workspaceId: string;
  approvalId: string;
  actorUserId: string;
  requestKey: string;
  payloadHash: string;
  commandType: GovernanceDecisionCommand;
  policyVersion: string | null;
  parentApprovalId: string | null;
  parentApprovalVersion: number | null;
  parentEvidenceSetHash: string | null;
  decision: string;
  reason: string;
  condition: string | null;
  conditions: TypedCondition[];
  expectedApprovalVersion: number;
  quorumRequired: number;
  evidenceSetHash: string;
  evidenceHashes: string[];
  blockerCodes: string[];
  warningCodes: string[];
  applyKeyId: string;
  applyTokenHash: string;
  status: "PLANNED" | "APPLIED" | "EXPIRED";
  responseJson: Record<string, unknown> | null;
  expiresAt: Date;
  createdAt: Date;
  appliedAt: Date | null;
}

interface PlanRow {
  operation_id: string;
  workspace_id: string;
  approval_id: string;
  actor_user_id: string;
  request_key: string;
  payload_hash: string;
  command_type: GovernanceDecisionCommand;
  policy_version: string | null;
  parent_approval_id: string | null;
  parent_approval_version: number | null;
  parent_evidence_set_hash: string | null;
  decision: string;
  reason: string;
  condition: string | null;
  conditions: TypedCondition[];
  expected_approval_version: number;
  quorum_required: number;
  evidence_set_hash: string;
  evidence_hashes: string[];
  blocker_codes: string[];
  warning_codes: string[];
  apply_key_id: string;
  apply_token_hash: string;
  status: "PLANNED" | "APPLIED" | "EXPIRED";
  response_json: Record<string, unknown> | null;
  expires_at: Date;
  created_at: Date;
  applied_at: Date | null;
}

function approval(row: ApprovalRow): ApprovalRecord {
  return {
    approvalId: row.approval_id,
    workspaceId: row.workspace_id,
    gate: row.gate,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    subjectLabel: row.subject_label,
    releaseCandidate: row.release_candidate,
    environment: row.environment,
    targetLabel: row.target_label,
    requesterUserId: row.requester_user_id,
    requesterUsername: row.requester_username,
    artifactCreatorUserId: row.artifact_creator_user_id,
    artifactCreatorUsername: row.artifact_creator_username,
    status: row.status,
    policyVersion: row.policy_version,
    quorumRequired: row.quorum_required,
    quorumMet: row.quorum_met,
    decisionActorIds: row.decision_actor_ids,
    approvalVersion: row.approval_version,
    evidenceSetHash: row.evidence_set_hash,
    evidenceComplete: row.evidence_complete,
    blockerCount: row.blocker_count,
    blockerSummary: row.blocker_summary,
    slaDueAt: row.sla_due_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    decidedAt: row.decided_at,
    decidedByUserId: row.decided_by_user_id,
  };
}

function evidence(row: EvidenceRow): EvidenceRecord {
  return {
    evidenceId: row.evidence_id,
    ordinal: row.ordinal,
    kind: row.kind,
    label: row.label,
    displayValue: row.display_value,
    note: row.note,
    verification: row.verification,
    artifactId: row.artifact_id,
    sha256: row.sha256,
    sizeBytes: row.size_bytes,
    mediaType: row.media_type,
    schemaVersion: row.schema_version,
    sourceAuthority: row.source_authority,
    sourceReference: row.source_reference,
    required: row.required,
    capturedAt: row.captured_at,
    retentionClass: row.retention_class,
    accessPolicy: row.access_policy,
  };
}

function finding(row: FindingRow): FindingRecord {
  return {
    findingId: row.finding_id,
    ordinal: row.ordinal,
    label: row.label,
    outcome: row.outcome,
    suggestion: row.suggestion,
    blocking: row.blocking,
    policyVersion: row.policy_version,
    formulaVersion: row.formula_version,
    basisHashes: row.basis_hashes,
    evaluatedAt: row.evaluated_at,
  };
}

function decision(row: DecisionRow): DecisionRecord {
  return {
    decisionId: row.decision_id,
    operationId: row.operation_id,
    actorUserId: row.actor_user_id,
    actorUsername: row.actor_username,
    decision: row.decision,
    reason: row.reason,
    condition: row.condition,
    conditions: row.conditions,
    evidenceSetHash: row.evidence_set_hash,
    approvalVersionBefore: row.approval_version_before,
    approvalVersionAfter: row.approval_version_after,
    decidedAt: row.decided_at,
  };
}

function plan(row: PlanRow): DecisionPlanRecord {
  return {
    operationId: row.operation_id,
    workspaceId: row.workspace_id,
    approvalId: row.approval_id,
    actorUserId: row.actor_user_id,
    requestKey: row.request_key,
    payloadHash: row.payload_hash,
    commandType: row.command_type,
    policyVersion: row.policy_version,
    parentApprovalId: row.parent_approval_id,
    parentApprovalVersion: row.parent_approval_version,
    parentEvidenceSetHash: row.parent_evidence_set_hash,
    decision: row.decision,
    reason: row.reason,
    condition: row.condition,
    conditions: row.conditions,
    expectedApprovalVersion: row.expected_approval_version,
    quorumRequired: row.quorum_required,
    evidenceSetHash: row.evidence_set_hash,
    evidenceHashes: row.evidence_hashes,
    blockerCodes: row.blocker_codes,
    warningCodes: row.warning_codes,
    applyKeyId: row.apply_key_id,
    applyTokenHash: row.apply_token_hash,
    status: row.status,
    responseJson: row.response_json,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    appliedAt: row.applied_at,
  };
}

@Injectable()
export class GovernanceRepository {
  constructor(@Inject(CONTROL_API_POOL) readonly pool: Pool) {}

  async approvalEvidenceRun(
    workspaceId: string,
    runId: string,
  ): Promise<ApprovalEvidenceRunRecord | null> {
    const result = await this.pool.query<ApprovalEvidenceRunRow>(
      `SELECT run.run_id, run.workspace_id, run.owner_user_id,
              owner.username AS owner_username, run.status, run.strategy_id,
              run.artifact_sha256, run.artifact_schema_version,
              run.artifact_creator_user_id, creator.username AS artifact_creator_username,
              run.methodology_claim_ids, run.updated_at
         FROM run_read_models run
         JOIN portal_users owner ON owner.user_id = run.owner_user_id
         JOIN portal_users creator ON creator.user_id = run.artifact_creator_user_id
        WHERE run.workspace_id = $1 AND run.run_id = $2`,
      [workspaceId, runId],
    );
    const row = result.rows[0];
    return row
      ? {
          runId: row.run_id,
          workspaceId: row.workspace_id,
          ownerUserId: row.owner_user_id,
          ownerUsername: row.owner_username,
          status: row.status,
          alphaId: row.strategy_id,
          artifactSha256: row.artifact_sha256,
          artifactSchemaVersion: row.artifact_schema_version,
          artifactCreatorUserId: row.artifact_creator_user_id,
          artifactCreatorUsername: row.artifact_creator_username,
          methodologyClaimIds: row.methodology_claim_ids,
          capturedAt: row.updated_at,
        }
      : null;
  }

  async isWorkspaceMember(workspaceId: string, userId: string): Promise<boolean> {
    const result = await this.pool.query(
      "SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2",
      [workspaceId, userId],
    );
    return result.rowCount === 1;
  }

  async findCreatedApproval(
    workspaceId: string,
    requesterUserId: string,
    requestKey: string,
  ): Promise<{ approval: ApprovalRecord; payloadHash: string } | null> {
    const result = await this.pool.query<ApprovalCreateRow>(
      `SELECT * FROM governance_approval_requests
       WHERE workspace_id = $1 AND requester_user_id = $2 AND request_key = $3`,
      [workspaceId, requesterUserId, requestKey],
    );
    const row = result.rows[0];
    return row?.request_payload_hash
      ? { approval: approval(row), payloadHash: row.request_payload_hash }
      : null;
  }

  async findOpenApprovalForAlphaRun(
    workspaceId: string,
    alphaId: string,
    sourceRunId: string,
  ): Promise<ApprovalRecord | null> {
    const result = await this.pool.query<ApprovalRow>(
      `SELECT * FROM governance_approval_requests
       WHERE workspace_id = $1 AND subject_id = $2 AND source_run_id = $3
         AND status = 'PENDING'
       ORDER BY created_at DESC, approval_id DESC LIMIT 1`,
      [workspaceId, alphaId, sourceRunId],
    );
    return result.rows[0] ? approval(result.rows[0]) : null;
  }

  async createR1Approval(input: {
    approvalId: string;
    evidenceId: string;
    auditEventId: string;
    requestId: string;
    requestKey: string;
    payloadHash: string;
    workspaceId: string;
    requesterUserId: string;
    requesterUsername: string;
    alphaId: string;
    sourceRunId: string;
    methodologyClaimId: string;
    summary: string;
    expectedArtifactSha256: string;
    evidenceSetHash: string;
    createdAt: Date;
    evidenceCapturedAt: Date;
    slaDueAt: Date;
    expiresAt: Date;
  }): Promise<ApprovalRecord> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      // P22 calls this repository through the existing service rather than
      // through GovernanceController.workspace(). Hold the membership row
      // through commit so revocation cannot race a downstream R1 write.
      const member = await client.query(
        `SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2 FOR SHARE`,
        [input.workspaceId, input.requesterUserId],
      );
      if (member.rowCount !== 1) {
        throw Object.assign(new Error("workspace access denied"), {
          governanceCode: "WORKSPACE_ACCESS_DENIED", status: 403,
        });
      }
      const runResult = await client.query<ApprovalEvidenceRunRow>(
        `SELECT run.run_id, run.workspace_id, run.owner_user_id,
                owner.username AS owner_username, run.status, run.strategy_id,
                run.artifact_sha256, run.artifact_schema_version,
                run.artifact_creator_user_id, creator.username AS artifact_creator_username,
                run.methodology_claim_ids, run.updated_at
           FROM run_read_models run
           JOIN portal_users owner ON owner.user_id = run.owner_user_id
           JOIN portal_users creator ON creator.user_id = run.artifact_creator_user_id
          WHERE run.workspace_id = $1 AND run.run_id = $2
          FOR SHARE OF run`,
        [input.workspaceId, input.sourceRunId],
      );
      const run = runResult.rows[0];
      if (!run) {
        throw Object.assign(new Error("evidence run not found"), {
          governanceCode: "EVIDENCE_RUN_NOT_FOUND",
          status: 422,
        });
      }
      if (
        run.strategy_id !== input.alphaId ||
        !["COMPLETED", "SUCCEEDED", "COMPLETE"].includes(run.status) ||
        run.artifact_sha256 !== input.expectedArtifactSha256 ||
        !run.methodology_claim_ids.includes(input.methodologyClaimId)
      ) {
        throw Object.assign(new Error("evidence run is not eligible"), {
          governanceCode: "EVIDENCE_RUN_NOT_ELIGIBLE",
          status: 422,
        });
      }
      const inserted = await client.query<ApprovalRow>(
        `INSERT INTO governance_approval_requests
           (approval_id, workspace_id, gate, subject_type, subject_id, subject_label,
            environment, target_label, requester_user_id, requester_username,
            artifact_creator_user_id, artifact_creator_username, status, policy_version,
            quorum_required, evidence_set_hash, evidence_complete, blocker_count,
            sla_due_at, expires_at, created_at, updated_at, source_run_id,
            methodology_claim_id, request_summary, request_key, request_payload_hash)
         VALUES ($1, $2, 'R1', 'ALPHA_VERSION', $3, $3, 'RESEARCH', 'R1',
                 $4, $5, $6, $7, 'PENDING', 'approval.v3', 1, $8, true, 0,
                 $9, $10, $11, $11, $12, $13, $14, $15, $16)
         RETURNING *`,
        [
          input.approvalId, input.workspaceId, input.alphaId,
          input.requesterUserId, input.requesterUsername,
          run.artifact_creator_user_id, run.artifact_creator_username,
          input.evidenceSetHash, input.slaDueAt, input.expiresAt, input.createdAt,
          input.sourceRunId, input.methodologyClaimId, input.summary,
          input.requestKey, input.payloadHash,
        ],
      );
      await client.query(
        `INSERT INTO governance_approval_evidence
           (evidence_id, approval_id, ordinal, kind, label, display_value, note,
            verification, artifact_id, sha256, schema_version, source_authority,
            source_reference, required, captured_at, retention_class, access_policy)
         VALUES ($1, $2, 0, 'ALPHA_ARTIFACT', 'Pinned research artifact', $3, $4,
                 'SERVER_PINNED', $3, $5, $6, 'RESEARCH', $7, true, $8,
                 'GOVERNANCE_LONG_TERM', 'WORKSPACE_APPROVER')`,
        [
          input.evidenceId, input.approvalId, input.sourceRunId, input.summary,
          run.artifact_sha256, run.artifact_schema_version, input.sourceRunId,
          input.evidenceCapturedAt,
        ],
      );
      await client.query(
        `INSERT INTO product_audit_events
           (event_id, event_type, actor_user_id, workspace_id, request_id,
            idempotency_key, aggregate_type, aggregate_id, aggregate_version,
            result, metadata_json)
         VALUES ($1, 'governance.r1_request.created', $2, $3, $4, $5,
                 'governance_approval', $6, 1, 'SUCCESS', $7)`,
        [
          input.auditEventId, input.requesterUserId, input.workspaceId,
          input.requestId, input.requestKey, input.approvalId,
          JSON.stringify({
            alpha_id: input.alphaId,
            evidence_run_id: input.sourceRunId,
            methodology_claim_id: input.methodologyClaimId,
            artifact_sha256: run.artifact_sha256,
            request_payload_hash: input.payloadHash,
          }),
        ],
      );
      await client.query("COMMIT");
      return approval(inserted.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async counts(
    workspaceId: string,
    visibleGates: readonly string[] | null = null,
  ): Promise<{ pending: number; overdue: number; dueSoon: number }> {
    // No readable gate means no aggregate either. Returning zero rather than a
    // cross-gate count prevents an Inbox badge from revealing work a caller is
    // not allowed to inspect.
    if (visibleGates?.length === 0) return { pending: 0, overdue: 0, dueSoon: 0 };
    const result = await this.pool.query<{ pending: string; overdue: string; due_soon: string }>(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'PENDING' AND expires_at > now())::text AS pending,
         COUNT(*) FILTER (WHERE status = 'PENDING' AND expires_at > now() AND sla_due_at <= now())::text AS overdue,
         COUNT(*) FILTER (
           WHERE status = 'PENDING' AND expires_at > now()
             AND sla_due_at > now() AND sla_due_at <= now() + interval '8 hours'
         )::text AS due_soon
       FROM governance_approval_requests
        WHERE workspace_id = $1
          AND ($2::text[] IS NULL OR gate = ANY($2::text[]))`,
      [workspaceId, visibleGates],
    );
    const row = result.rows[0];
    return { pending: Number(row.pending), overdue: Number(row.overdue), dueSoon: Number(row.due_soon) };
  }

  /**
   * Resolves the immutable R2 analytics scope without leaking approvals from
   * another workspace or exposing previews for closed/expired reviews.
   */
  async capitalPreviewScope(
    workspaceId: string,
    approvalId: string,
  ): Promise<CapitalPreviewApprovalScope | null> {
    const result = await this.pool.query<CapitalPreviewApprovalScopeRow>(
      `SELECT scope.approval_id, scope.workspace_id, scope.portfolio_id, scope.currency
         FROM governance_approval_analytics_scopes scope
         JOIN governance_approval_requests request
           ON request.approval_id = scope.approval_id
          AND request.workspace_id = scope.workspace_id
          AND request.gate = scope.gate
        WHERE scope.workspace_id = $1
          AND scope.approval_id = $2
          AND request.gate = 'R2'
          AND request.status = 'PENDING'
          AND request.expires_at > now()`,
      [workspaceId, approvalId],
    );
    const row = result.rows[0];
    return row
      ? {
          approvalId: row.approval_id,
          workspaceId: row.workspace_id,
          portfolioId: row.portfolio_id,
          currency: row.currency,
        }
      : null;
  }

  /**
   * An authorized historical review remains readable after its local decision.
   * capitalPreviewScope separately restricts active analytics eligibility.
   */
  async r2Detail(
    workspaceId: string,
    approvalId: string,
    gate: "R2" | "LIVE_GATE" = "R2",
  ): Promise<R2ApprovalDetailRecord | null> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const result = await client.query<R2ApprovalDetailRow>(
        `SELECT request.*, scope.portfolio_id, scope.currency,
                lineage.r1_approval_id, lineage.grant_id, lineage.grant_name,
                lineage.approver_role, lineage.plan_author_user_id,
                lineage.plan_author_username, r1.status AS r1_status,
                r1.decided_at AS r1_decided_at,
                r1.expires_at AS r1_expires_at,
                r1.evidence_set_hash AS r1_evidence_set_hash,
                r1.evidence_complete AS r1_evidence_complete,
                r1_decider.username AS r1_decided_by_username
           FROM governance_approval_requests request
           LEFT JOIN governance_approval_analytics_scopes scope
             ON scope.approval_id = request.approval_id
            AND scope.workspace_id = request.workspace_id
            AND scope.gate = request.gate
           LEFT JOIN governance_r2_lineage lineage
             ON lineage.r2_approval_id = request.approval_id
            AND lineage.workspace_id = request.workspace_id
           LEFT JOIN governance_approval_requests r1
             ON r1.approval_id = lineage.r1_approval_id
            AND r1.workspace_id = lineage.workspace_id
           LEFT JOIN portal_users r1_decider ON r1_decider.user_id = r1.decided_by_user_id
          WHERE request.workspace_id = $1
            AND request.approval_id = $2
            AND request.gate = $3`,
        [workspaceId, approvalId, gate],
      );
      const row = result.rows[0];
      const parentEvidenceRows = row?.r1_approval_id
        ? await client.query<EvidenceRow>(
            `SELECT * FROM governance_approval_evidence
             WHERE approval_id = $1 ORDER BY ordinal`,
            [row.r1_approval_id],
          )
        : { rows: [] as EvidenceRow[] };
      const childEvidenceRows = row
        ? await client.query<EvidenceRow>(`SELECT * FROM governance_approval_evidence WHERE approval_id = $1 ORDER BY ordinal`, [approvalId])
        : { rows: [] as EvidenceRow[] };
      await client.query("COMMIT");
      return row
        ? {
            approval: approval(row),
            scope: row.portfolio_id !== null && row.currency !== null ? {
              approvalId: row.approval_id,
              workspaceId: row.workspace_id,
              portfolioId: row.portfolio_id,
              currency: row.currency,
            } : null,
            lineage: row.r1_approval_id && row.grant_id && row.grant_name &&
              row.approver_role && row.plan_author_user_id && row.plan_author_username &&
              row.r1_status && row.r1_expires_at && row.r1_evidence_set_hash &&
              row.r1_evidence_complete !== null
              ? {
                  r1ApprovalId: row.r1_approval_id,
                  r1Status: row.r1_status,
                  r1DecidedAt: row.r1_decided_at,
                  r1DecidedByUsername: row.r1_decided_by_username,
                  r1ExpiresAt: row.r1_expires_at,
                  r1EvidenceSetHash: row.r1_evidence_set_hash,
                  r1EvidenceComplete: row.r1_evidence_complete,
                  grantId: row.grant_id,
                  grantName: row.grant_name,
                  approverRole: row.approver_role,
                  planAuthorUserId: row.plan_author_user_id,
                  planAuthorUsername: row.plan_author_username,
                }
              : null,
            evidence: childEvidenceRows.rows.map(evidence),
            parentEvidence: parentEvidenceRows.rows.map(evidence),
          }
        : null;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async detail(workspaceId: string, approvalId: string): Promise<{
    approval: ApprovalRecord;
    evidence: EvidenceRecord[];
    findings: FindingRecord[];
    decisions: DecisionRecord[];
    knownLimitations: KnownLimitationRecord[];
  } | null> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const request = await client.query<ApprovalRow>(
        `SELECT * FROM governance_approval_requests WHERE workspace_id = $1 AND approval_id = $2`,
        [workspaceId, approvalId],
      );
      if (!request.rows[0]) {
        await client.query("COMMIT");
        return null;
      }
      const evidenceRows = await client.query<EvidenceRow>(
        `SELECT * FROM governance_approval_evidence WHERE approval_id = $1 ORDER BY ordinal`,
        [approvalId],
      );
      const findingRows = await client.query<FindingRow>(
        `SELECT * FROM governance_approval_findings WHERE approval_id = $1 ORDER BY ordinal`,
        [approvalId],
      );
      const decisionRows = await client.query<DecisionRow>(
        `SELECT * FROM governance_approval_decisions WHERE approval_id = $1 ORDER BY decided_at, decision_id`,
        [approvalId],
      );
      const limitationRows = await client.query<KnownLimitationRow>(
        `SELECT limitation_id, ordinal, kind, label, statement, expires_at
         FROM governance_approval_known_limitations
         WHERE approval_id = $1 ORDER BY ordinal, limitation_id`,
        [approvalId],
      );
      await client.query("COMMIT");
      return {
        approval: approval(request.rows[0]),
        evidence: evidenceRows.rows.map(evidence),
        findings: findingRows.rows.map(finding),
        decisions: decisionRows.rows.map(decision),
        knownLimitations: limitationRows.rows.map((row) => ({
          limitationId: row.limitation_id,
          ordinal: row.ordinal,
          kind: row.kind,
          label: row.label,
          statement: row.statement,
          expiresAt: row.expires_at,
        })),
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async assertActorAuthority(actor: PortalUser, workspaceId: string, commandType: GovernanceDecisionCommand): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await assertDecisionAuthority(client, { actor, workspaceId, gate: commandGate(commandType) });
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async findPlanByKey(workspaceId: string, actorUserId: string, requestKey: string): Promise<DecisionPlanRecord | null> {
    const result = await this.pool.query<PlanRow>(
      `SELECT * FROM governance_decision_plans
       WHERE workspace_id = $1 AND actor_user_id = $2 AND request_key = $3`,
      [workspaceId, actorUserId, requestKey],
    );
    return result.rows[0] ? plan(result.rows[0]) : null;
  }

  async findPlan(workspaceId: string, actorUserId: string, operationId: string): Promise<DecisionPlanRecord | null> {
    const result = await this.pool.query<PlanRow>(
      `SELECT * FROM governance_decision_plans
       WHERE workspace_id = $1 AND actor_user_id = $2 AND operation_id = $3`,
      [workspaceId, actorUserId, operationId],
    );
    return result.rows[0] ? plan(result.rows[0]) : null;
  }

  private async validatedManifest(client: PoolClient, approvalId: string, expectedHash: string, parent = false) {
    const rows = await client.query<EvidenceRow>(
      `SELECT * FROM governance_approval_evidence WHERE approval_id = $1 ORDER BY ordinal`, [approvalId],
    );
    const entries = rows.rows.map(evidence);
    if (computeEvidenceManifestHash(entries) !== expectedHash) {
      throw decisionProblem(parent ? "R1_EVIDENCE_MANIFEST_INTEGRITY_FAILED" : "EVIDENCE_MANIFEST_INTEGRITY_FAILED");
    }
    return entries;
  }

  private async r2DecisionParent(
    client: PoolClient, workspaceId: string, approvalId: string, actorUserId: string,
    currentRole: string, decision: string,
  ): Promise<{ id: string; version: number; hash: string }> {
    const result = await client.query<ApprovalRow & { approver_role: string; plan_author_user_id: string }>(
      `SELECT parent.*, lineage.approver_role, lineage.plan_author_user_id
         FROM governance_r2_lineage lineage
         JOIN governance_approval_requests parent
           ON parent.approval_id = lineage.r1_approval_id
          AND parent.workspace_id = lineage.workspace_id AND parent.gate = 'R1'
        WHERE lineage.r2_approval_id = $1 AND lineage.workspace_id = $2
        FOR SHARE OF parent, lineage`, [approvalId, workspaceId],
    );
    const parent = result.rows[0];
    if (!parent) throw decisionProblem("R1_LINEAGE_UNPUBLISHED");
    if (["APPROVE", "APPROVE_WITH_CONDITION"].includes(decision)) {
      if (!["APPROVED", "APPROVED_WITH_CONDITION"].includes(parent.status)) throw decisionProblem("R1_NOT_APPROVED");
      if (parent.expires_at <= new Date()) throw decisionProblem("R1_EXPIRED");
      if (!parent.evidence_complete) throw decisionProblem("R1_EVIDENCE_INCOMPLETE");
    }
    if (parent.approver_role !== "ADMIN" || currentRole !== parent.approver_role) {
      throw decisionProblem("APPROVER_ROLE_REQUIRED", 403);
    }
    if (decision !== "DENY" && parent.plan_author_user_id === actorUserId) {
      throw decisionProblem("SELF_APPROVAL_PROHIBITED");
    }
    await this.validatedManifest(client, parent.approval_id, parent.evidence_set_hash, true);
    return { id: parent.approval_id, version: parent.approval_version, hash: parent.evidence_set_hash };
  }

  async createPlan(input: {
    operationId: string;
    workspaceId: string;
    approvalId: string;
    actorUserId: string;
    actor: PortalUser;
    commandType?: GovernanceDecisionCommand;
    policyVersion?: string;
    requestKey: string;
    payloadHash: string;
    decision: string;
    reason: string;
    conditions: TypedCondition[];
    expectedApprovalVersion: number;
    quorumRequired: number;
    evidenceSetHash: string;
    evidenceHashes: string[];
    blockerCodes: string[];
    warningCodes: string[];
    applyKeyId: string;
    applyTokenHash: string;
    expiresAt: Date;
    requestId: string;
    auditEventId: string;
    outboxMessageId: string;
  }): Promise<DecisionPlanRecord> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      const commandType = input.commandType ?? "GOVERNANCE_R1_DECISION";
      const gate = commandGate(commandType);
      if (input.actor.userId !== input.actorUserId) throw decisionProblem("ACTOR_IDENTITY_MISMATCH", 403);
      const authority = await assertDecisionAuthority(client, { actor: input.actor, workspaceId: input.workspaceId, gate });
      const request = await client.query<ApprovalRow>(
        `SELECT * FROM governance_approval_requests WHERE approval_id = $1 AND workspace_id = $2 FOR SHARE`,
        [input.approvalId, input.workspaceId],
      );
      const approval = request.rows[0];
      if (!approval) throw decisionProblem("APPROVAL_NOT_FOUND", 404);
      if (approval.gate !== gate) throw decisionProblem("GOVERNANCE_DECISION_GATE_MISMATCH");
      let parent: { id: string; version: number; hash: string } | null = null;
      if (input.blockerCodes.length === 0) {
        if (approval.status !== "PENDING") throw decisionProblem("APPROVAL_CLOSED");
        if (approval.expires_at <= new Date()) throw decisionProblem("APPROVAL_EXPIRED");
        if (approval.approval_version !== input.expectedApprovalVersion) throw decisionProblem("APPROVAL_VERSION_CONFLICT");
        if (approval.quorum_required !== input.quorumRequired ||
          (input.policyVersion !== undefined && approval.policy_version !== input.policyVersion)) {
          throw decisionProblem("APPROVAL_POLICY_CHANGED");
        }
        const entries = await this.validatedManifest(client, approval.approval_id, approval.evidence_set_hash);
        if (approval.evidence_set_hash !== input.evidenceSetHash ||
          JSON.stringify([...new Set(entries.map(entry => entry.sha256))].sort()) !==
            JSON.stringify([...input.evidenceHashes].sort())) throw decisionProblem("EVIDENCE_SET_CHANGED");
        if (gate === "LIVE_GATE") throw decisionProblem("LIVE_PARENT_NOT_PUBLISHED");
        if (gate === "R2") parent = await this.r2DecisionParent(
          client, input.workspaceId, input.approvalId, input.actorUserId, authority.role, input.decision,
        );
      }
      const inserted = await client.query<PlanRow>(
        `INSERT INTO governance_decision_plans
           (operation_id, workspace_id, approval_id, actor_user_id, request_key,
            command_type, command_version, payload_hash, decision, reason, condition, conditions,
            expected_approval_version, quorum_required, evidence_set_hash, evidence_hashes,
            blocker_codes, warning_codes, apply_key_id, apply_token_hash,
            status, expires_at, policy_version, parent_approval_id, parent_approval_version, parent_evidence_set_hash)
         VALUES ($1, $2, $3, $4, $5, $20, 1, $6, $7,
                 $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, 'PLANNED', $19, $21, $22, $23, $24)
         RETURNING *`,
        [
          input.operationId, input.workspaceId, input.approvalId, input.actorUserId,
          input.requestKey, input.payloadHash, input.decision, input.reason,
          input.conditions[0]?.text ?? null, JSON.stringify(input.conditions),
          input.expectedApprovalVersion, input.quorumRequired, input.evidenceSetHash,
          input.evidenceHashes, input.blockerCodes, input.warningCodes,
          input.applyKeyId, input.applyTokenHash, input.expiresAt, commandType,
          input.policyVersion ?? approval.policy_version, parent?.id ?? null, parent?.version ?? null, parent?.hash ?? null,
        ],
      );
      await client.query(
        `INSERT INTO product_audit_events
           (event_id, event_type, actor_user_id, workspace_id, request_id,
            idempotency_key, aggregate_type, aggregate_id, aggregate_version,
            result, reason_code, metadata_json)
         VALUES ($1, $9, $2, $3, $4, $5,
                 'governance_approval', $6, $7, 'SUCCESS', NULL, $8)`,
        [
          input.auditEventId, input.actorUserId, input.workspaceId, input.requestId,
          input.requestKey, input.approvalId, input.expectedApprovalVersion,
          JSON.stringify({
            operation_id: input.operationId,
            payload_hash: input.payloadHash,
            evidence_set_hash: input.evidenceSetHash,
            blocker_codes: input.blockerCodes,
            warning_codes: input.warningCodes,
          }), commandEvent(commandType, "planned"),
        ],
      );
      await client.query(
        `INSERT INTO outbox_messages
           (message_id, idempotency_key, aggregate_type, aggregate_id, event_type,
            actor_user_id, workspace_id, request_id, payload_json, state)
         VALUES ($1, $2, 'governance_approval', $3, $8,
                 $4, $5, $6, $7, 'PENDING')`,
        [
          input.outboxMessageId,
          `governance-plan:${input.workspaceId}:${input.actorUserId}:${input.requestKey}`,
          input.approvalId,
          input.actorUserId,
          input.workspaceId,
          input.requestId,
          JSON.stringify({
            operation_id: input.operationId,
            approval_id: input.approvalId,
            expected_approval_version: input.expectedApprovalVersion,
            payload_hash: input.payloadHash,
            blocker_codes: input.blockerCodes,
          }), commandEvent(commandType, "planned"),
        ],
      );
      await client.query("COMMIT");
      return plan(inserted.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async applyDecision(input: {
    workspaceId: string;
    actorUserId: string;
    actorUsername: string;
    actor: PortalUser;
    commandType?: GovernanceDecisionCommand;
    operationId: string;
    requestId: string;
    decisionId: string;
    auditEventId: string;
    outboxMessageId: string;
    reasonHash: string;
    limitationIds: string[];
  }): Promise<{ plan: DecisionPlanRecord; approval: ApprovalRecord; replayed: boolean }> {
    const client = await this.pool.connect();
    let transactionOpen = false;
    try {
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      transactionOpen = true;
      const commandType = input.commandType ?? "GOVERNANCE_R1_DECISION";
      const gate = commandGate(commandType);
      if (input.actor.userId !== input.actorUserId) throw decisionProblem("ACTOR_IDENTITY_MISMATCH", 403);
      const authority = await assertDecisionAuthority(client, { actor: input.actor, workspaceId: input.workspaceId, gate });
      const planResult = await client.query<PlanRow>(
        `SELECT * FROM governance_decision_plans
         WHERE workspace_id = $1 AND actor_user_id = $2 AND operation_id = $3
         FOR UPDATE`,
        [input.workspaceId, input.actorUserId, input.operationId],
      );
      const planRow = planResult.rows[0];
      if (!planRow) throw Object.assign(new Error("operation not found"), { governanceCode: "OPERATION_NOT_FOUND", status: 404 });
      if (planRow.command_type !== commandType) throw decisionProblem("GOVERNANCE_DECISION_GATE_MISMATCH");
      const requestResult = await client.query<ApprovalRow>(
        `SELECT * FROM governance_approval_requests
         WHERE workspace_id = $1 AND approval_id = $2 FOR UPDATE`,
        [input.workspaceId, planRow.approval_id],
      );
      const request = requestResult.rows[0];
      if (!request) throw decisionProblem("APPROVAL_NOT_FOUND", 404);
      if (request.gate !== gate) throw decisionProblem("GOVERNANCE_DECISION_GATE_MISMATCH");
      if (planRow.status === "APPLIED") {
        await client.query("COMMIT");
        transactionOpen = false;
        return { plan: plan(planRow), approval: approval(request), replayed: true };
      }
      if (planRow.status === "EXPIRED" || planRow.expires_at <= new Date()) {
        await client.query(
          `UPDATE governance_decision_plans SET status = 'EXPIRED' WHERE operation_id = $1`,
          [input.operationId],
        );
        await client.query("COMMIT");
        transactionOpen = false;
        throw Object.assign(new Error("operation expired"), { governanceCode: "OPERATION_EXPIRED", status: 409 });
      }
      if (planRow.blocker_codes.length > 0) {
        throw Object.assign(new Error("operation is blocked"), {
          governanceCode: "OPERATION_BLOCKED",
          status: 409,
          details: { blocker_codes: planRow.blocker_codes },
        });
      }
      if (request.status !== "PENDING") {
        throw Object.assign(new Error("approval is closed"), { governanceCode: "APPROVAL_CLOSED", status: 409 });
      }
      if (request.expires_at <= new Date()) throw decisionProblem("APPROVAL_EXPIRED");
      if (planRow.policy_version === null) throw decisionProblem("APPROVAL_POLICY_PIN_NOT_RECORDED");
      if (request.policy_version !== planRow.policy_version || request.quorum_required !== planRow.quorum_required) {
        throw decisionProblem("APPROVAL_POLICY_CHANGED");
      }
      if (request.approval_version !== planRow.expected_approval_version) {
        throw Object.assign(new Error("approval version changed"), {
          governanceCode: "APPROVAL_VERSION_CONFLICT",
          status: 409,
          details: { expected: planRow.expected_approval_version, actual: request.approval_version },
        });
      }
      if (request.evidence_set_hash !== planRow.evidence_set_hash) {
        throw Object.assign(new Error("evidence changed"), { governanceCode: "EVIDENCE_SET_CHANGED", status: 409 });
      }
      const currentEvidence = await this.validatedManifest(client, request.approval_id, request.evidence_set_hash);
      const currentHashes = [...new Set(currentEvidence.map((entry) => entry.sha256))].sort();
      if (JSON.stringify(currentHashes) !== JSON.stringify([...planRow.evidence_hashes].sort())) {
        throw decisionProblem("EVIDENCE_SET_CHANGED");
      }
      if (request.decision_actor_ids.includes(input.actorUserId)) throw decisionProblem("ACTOR_ALREADY_DECIDED");
      if (planRow.decision !== "DENY" &&
        [request.requester_user_id, request.artifact_creator_user_id].includes(input.actorUserId)) {
        throw decisionProblem("SELF_APPROVAL_PROHIBITED");
      }
      if (["APPROVE", "APPROVE_WITH_CONDITION"].includes(planRow.decision)) {
        if (!request.evidence_complete || currentEvidence.length === 0) throw decisionProblem("EVIDENCE_INCOMPLETE");
        const blocking = await client.query(
          `SELECT 1 FROM governance_approval_findings
           WHERE approval_id = $1 AND (blocking OR outcome = 'FAIL') LIMIT 1`, [request.approval_id],
        );
        if (request.blocker_count > 0 || blocking.rowCount !== 0) throw decisionProblem("BLOCKING_FINDINGS");
      }
      if (gate === "LIVE_GATE") throw decisionProblem("LIVE_PARENT_NOT_PUBLISHED");
      if (gate === "R2") {
        const parent = await this.r2DecisionParent(client, input.workspaceId, request.approval_id,
          input.actorUserId, authority.role, planRow.decision);
        if (parent.id !== planRow.parent_approval_id || parent.version !== planRow.parent_approval_version ||
          parent.hash !== planRow.parent_evidence_set_hash) throw decisionProblem("R1_PARENT_CHANGED");
      }
      const versionAfter = request.approval_version + 1;
      const nonQuorumDecision = planRow.decision === "DENY" || planRow.decision === "REQUEST_CHANGES";
      const nextQuorum = nonQuorumDecision ? request.quorum_met : request.quorum_met + 1;
      const terminal = nonQuorumDecision || nextQuorum >= request.quorum_required;
      let nextStatus = "PENDING";
      if (planRow.decision === "DENY") nextStatus = "DENIED";
      else if (planRow.decision === "REQUEST_CHANGES") nextStatus = "CHANGES_REQUESTED";
      else if (terminal) {
        const conditional = planRow.decision === "APPROVE_WITH_CONDITION" || (
          await client.query(
            `SELECT 1 FROM governance_approval_decisions
             WHERE approval_id = $1 AND decision = 'APPROVE_WITH_CONDITION' LIMIT 1`,
            [request.approval_id],
          )
        ).rowCount === 1;
        nextStatus = conditional ? "APPROVED_WITH_CONDITION" : "APPROVED";
      }
      const decidedAt = new Date();
      if (planRow.conditions.length !== input.limitationIds.length) {
        throw Object.assign(new Error("condition identifier set drifted"), {
          governanceCode: "CONDITION_IDENTIFIER_SET_DRIFTED",
          status: 409,
        });
      }
      await client.query(
        `INSERT INTO governance_approval_decisions
           (decision_id, operation_id, workspace_id, approval_id, actor_user_id,
            actor_username, decision, reason, condition, conditions, evidence_set_hash,
            approval_version_before, approval_version_after, decided_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          input.decisionId, input.operationId, input.workspaceId, request.approval_id,
          input.actorUserId, input.actorUsername, planRow.decision, planRow.reason,
          planRow.condition, JSON.stringify(planRow.conditions), request.evidence_set_hash, request.approval_version,
          versionAfter, decidedAt,
        ],
      );
      // The locked approval row serializes all decisions for this aggregate.
      // Conditions from later quorum reviewers append to, never overwrite or
      // reuse, the immutable limitation ordinals of an earlier reviewer.
      const limitationStart = planRow.conditions.length === 0 ? 0 : (await client.query<{ next_ordinal: number }>(
        `SELECT COALESCE(MAX(ordinal) + 1, 0)::integer AS next_ordinal
           FROM governance_approval_known_limitations WHERE approval_id = $1`,
        [request.approval_id],
      )).rows[0].next_ordinal;
      for (const [conditionIndex, condition] of planRow.conditions.entries()) {
        const expiresOn = condition.expires_at ?? condition.deadline;
        const expiresAt = expiresOn ? new Date(`${expiresOn}T23:59:59.999Z`) : null;
        const kind = planRow.decision === "APPROVE_WITH_CONDITION" ? "WAIVER" : "RESTRICTION";
        const labelPrefix = kind === "WAIVER" ? "Approved waiver" : "Required change";
        await client.query(
          `INSERT INTO governance_approval_known_limitations
             (limitation_id, approval_id, ordinal, kind, label, statement, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            input.limitationIds[conditionIndex], request.approval_id, limitationStart + conditionIndex, kind,
            `${labelPrefix} · ${condition.owner}`, condition.text, expiresAt,
          ],
        );
      }
      const terminalAt = terminal ? decidedAt : null;
      const terminalActorId = terminal ? input.actorUserId : null;
      const updated = await client.query<ApprovalRow>(
        `UPDATE governance_approval_requests SET
           status = $2,
           quorum_met = $3,
           decision_actor_ids = array_append(decision_actor_ids, $4),
           approval_version = $5,
           updated_at = $6,
           decided_at = $7,
           decided_by_user_id = $8
         WHERE approval_id = $1
         RETURNING *`,
        [
          request.approval_id,
          nextStatus,
          nextQuorum,
          input.actorUserId,
          versionAfter,
          decidedAt,
          terminalAt,
          terminalActorId,
        ],
      );
      const response = {
        operation_id: input.operationId,
        receipt_id: input.decisionId,
        status: "SUCCEEDED",
        approval_id: request.approval_id,
        approval_status: nextStatus,
        approval_version: versionAfter,
        quorum_met: nextQuorum,
        quorum_required: request.quorum_required,
        decided_at: decidedAt.toISOString(),
      };
      const updatedPlan = await client.query<PlanRow>(
        `UPDATE governance_decision_plans
         SET status = 'APPLIED', applied_at = $2, response_json = $3
         WHERE operation_id = $1 RETURNING *`,
        [input.operationId, decidedAt, JSON.stringify(response)],
      );
      await client.query(
        `INSERT INTO product_audit_events
           (event_id, event_type, actor_user_id, workspace_id, request_id,
            idempotency_key, aggregate_type, aggregate_id, aggregate_version,
            result, reason_code, metadata_json)
         VALUES ($1, $9, $2, $3, $4, $5,
                 'governance_approval', $6, $7, 'SUCCESS', NULL, $8)`,
        [
          input.auditEventId, input.actorUserId, input.workspaceId, input.requestId,
          planRow.request_key, request.approval_id, versionAfter,
          JSON.stringify({
            operation_id: input.operationId,
            decision: planRow.decision,
            reason_sha256: input.reasonHash,
            evidence_set_hash: request.evidence_set_hash,
            approval_status: nextStatus,
            quorum_met: nextQuorum,
            quorum_required: request.quorum_required,
          }), commandEvent(commandType, "applied"),
        ],
      );
      await client.query(
        `INSERT INTO outbox_messages
           (message_id, idempotency_key, aggregate_type, aggregate_id, event_type,
            actor_user_id, workspace_id, request_id, payload_json, response_json,
            response_status, state)
         VALUES ($1, $2, 'governance_approval', $3, $9,
                 $4, $5, $6, $7, $8, 202, 'PENDING')`,
        [
          input.outboxMessageId,
          `governance-apply:${input.operationId}`,
          request.approval_id,
          input.actorUserId,
          input.workspaceId,
          input.requestId,
          JSON.stringify({
            operation_id: input.operationId,
            approval_id: request.approval_id,
            decision: planRow.decision,
            evidence_set_hash: request.evidence_set_hash,
            approval_version: versionAfter,
          }),
          JSON.stringify(response), commandEvent(commandType, "applied"),
        ],
      );
      await client.query("COMMIT");
      transactionOpen = false;
      return { plan: plan(updatedPlan.rows[0]), approval: approval(updated.rows[0]), replayed: false };
    } catch (error) {
      if (transactionOpen) await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async recordRejected(input: {
    eventId: string;
    eventType: string;
    actorUserId: string;
    workspaceId: string;
    requestId: string;
    idempotencyKey: string | null;
    aggregateId: string | null;
    aggregateVersion: number | null;
    result: "DENIED" | "CONFLICT" | "FAILURE";
    reasonCode: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO product_audit_events
         (event_id, event_type, actor_user_id, workspace_id, request_id,
          idempotency_key, aggregate_type, aggregate_id, aggregate_version,
          result, reason_code, metadata_json)
       VALUES ($1, $2, $3, $4, $5, $6, 'governance_approval', $7, $8, $9, $10, $11)`,
      [
        input.eventId, input.eventType, input.actorUserId, input.workspaceId,
        input.requestId, input.idempotencyKey, input.aggregateId,
        input.aggregateVersion, input.result, input.reasonCode,
        input.metadata ? JSON.stringify(input.metadata) : null,
      ],
    );
  }
}
