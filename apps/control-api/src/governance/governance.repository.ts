import { Inject, Injectable } from "@nestjs/common";
import { Pool, PoolClient } from "pg";
import { CONTROL_API_POOL } from "../tokens";
import { TypedCondition } from "../operations/contracts";

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
  scope: CapitalPreviewApprovalScope;
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
  portfolio_id: string;
  currency: string;
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

  async counts(workspaceId: string): Promise<{ pending: number; overdue: number; dueSoon: number }> {
    const result = await this.pool.query<{ pending: string; overdue: string; due_soon: string }>(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'PENDING' AND expires_at > now())::text AS pending,
         COUNT(*) FILTER (WHERE status = 'PENDING' AND expires_at > now() AND sla_due_at <= now())::text AS overdue,
         COUNT(*) FILTER (
           WHERE status = 'PENDING' AND expires_at > now()
             AND sla_due_at > now() AND sla_due_at <= now() + interval '8 hours'
         )::text AS due_soon
       FROM governance_approval_requests WHERE workspace_id = $1`,
      [workspaceId],
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
   * Reads the active R2 review and its immutable capital-preview binding in one
   * workspace-bound, repeatable-read snapshot. Closed or expired reviews do
   * not disclose a scope that cannot be used for a preview.
   */
  async r2Detail(
    workspaceId: string,
    approvalId: string,
  ): Promise<R2ApprovalDetailRecord | null> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const result = await client.query<R2ApprovalDetailRow>(
        `SELECT request.*, scope.portfolio_id, scope.currency
           FROM governance_approval_requests request
           JOIN governance_approval_analytics_scopes scope
             ON scope.approval_id = request.approval_id
            AND scope.workspace_id = request.workspace_id
            AND scope.gate = request.gate
          WHERE request.workspace_id = $1
            AND request.approval_id = $2
            AND request.gate = 'R2'
            AND request.status = 'PENDING'
            AND request.expires_at > now()`,
        [workspaceId, approvalId],
      );
      await client.query("COMMIT");
      const row = result.rows[0];
      return row
        ? {
            approval: approval(row),
            scope: {
              approvalId: row.approval_id,
              workspaceId: row.workspace_id,
              portfolioId: row.portfolio_id,
              currency: row.currency,
            },
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
      await client.query("COMMIT");
      return {
        approval: approval(request.rows[0]),
        evidence: evidenceRows.rows.map(evidence),
        findings: findingRows.rows.map(finding),
        decisions: decisionRows.rows.map(decision),
      };
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

  async createPlan(input: {
    operationId: string;
    workspaceId: string;
    approvalId: string;
    actorUserId: string;
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
      const inserted = await client.query<PlanRow>(
        `INSERT INTO governance_decision_plans
           (operation_id, workspace_id, approval_id, actor_user_id, request_key,
            command_type, command_version, payload_hash, decision, reason, condition, conditions,
            expected_approval_version, quorum_required, evidence_set_hash, evidence_hashes,
            blocker_codes, warning_codes, apply_key_id, apply_token_hash,
            status, expires_at)
         VALUES ($1, $2, $3, $4, $5, 'GOVERNANCE_R1_DECISION', 1, $6, $7,
                 $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, 'PLANNED', $19)
         RETURNING *`,
        [
          input.operationId, input.workspaceId, input.approvalId, input.actorUserId,
          input.requestKey, input.payloadHash, input.decision, input.reason,
          input.conditions[0]?.text ?? null, JSON.stringify(input.conditions),
          input.expectedApprovalVersion, input.quorumRequired, input.evidenceSetHash,
          input.evidenceHashes, input.blockerCodes, input.warningCodes,
          input.applyKeyId, input.applyTokenHash, input.expiresAt,
        ],
      );
      await client.query(
        `INSERT INTO product_audit_events
           (event_id, event_type, actor_user_id, workspace_id, request_id,
            idempotency_key, aggregate_type, aggregate_id, aggregate_version,
            result, reason_code, metadata_json)
         VALUES ($1, 'governance.r1_decision.planned', $2, $3, $4, $5,
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
          }),
        ],
      );
      await client.query(
        `INSERT INTO outbox_messages
           (message_id, idempotency_key, aggregate_type, aggregate_id, event_type,
            actor_user_id, workspace_id, request_id, payload_json, state)
         VALUES ($1, $2, 'governance_approval', $3, 'governance.r1_decision.planned',
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
          }),
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
    operationId: string;
    requestId: string;
    decisionId: string;
    auditEventId: string;
    outboxMessageId: string;
    reasonHash: string;
  }): Promise<{ plan: DecisionPlanRecord; approval: ApprovalRecord; replayed: boolean }> {
    const client = await this.pool.connect();
    let transactionOpen = false;
    try {
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      transactionOpen = true;
      const planResult = await client.query<PlanRow>(
        `SELECT * FROM governance_decision_plans
         WHERE workspace_id = $1 AND actor_user_id = $2 AND operation_id = $3
         FOR UPDATE`,
        [input.workspaceId, input.actorUserId, input.operationId],
      );
      const planRow = planResult.rows[0];
      if (!planRow) throw Object.assign(new Error("operation not found"), { governanceCode: "OPERATION_NOT_FOUND", status: 404 });
      if (planRow.status === "APPLIED") {
        const request = await client.query<ApprovalRow>(
          `SELECT * FROM governance_approval_requests WHERE approval_id = $1`,
          [planRow.approval_id],
        );
        await client.query("COMMIT");
        transactionOpen = false;
        return { plan: plan(planRow), approval: approval(request.rows[0]), replayed: true };
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
      const requestResult = await client.query<ApprovalRow>(
        `SELECT * FROM governance_approval_requests
         WHERE workspace_id = $1 AND approval_id = $2 FOR UPDATE`,
        [input.workspaceId, planRow.approval_id],
      );
      const request = requestResult.rows[0];
      if (!request) throw Object.assign(new Error("approval not found"), { governanceCode: "APPROVAL_NOT_FOUND", status: 404 });
      if (request.status !== "PENDING") {
        throw Object.assign(new Error("approval is closed"), { governanceCode: "APPROVAL_CLOSED", status: 409 });
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
      const versionAfter = request.approval_version + 1;
      const nextQuorum = planRow.decision === "DENY" ? request.quorum_met : request.quorum_met + 1;
      const terminal = planRow.decision === "DENY" || nextQuorum >= request.quorum_required;
      let nextStatus = "PENDING";
      if (planRow.decision === "DENY") nextStatus = "DENIED";
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
         VALUES ($1, 'governance.r1_decision.applied', $2, $3, $4, $5,
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
          }),
        ],
      );
      await client.query(
        `INSERT INTO outbox_messages
           (message_id, idempotency_key, aggregate_type, aggregate_id, event_type,
            actor_user_id, workspace_id, request_id, payload_json, response_json,
            response_status, state)
         VALUES ($1, $2, 'governance_approval', $3, 'governance.r1_decision.applied',
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
          JSON.stringify(response),
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
