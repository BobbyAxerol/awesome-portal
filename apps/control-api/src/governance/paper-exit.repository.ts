import { Inject, Injectable } from "@nestjs/common";
import { Pool, PoolClient } from "pg";
import { CONTROL_API_POOL } from "../tokens";
import { EvidenceRecord } from "./governance.repository";

export type PaperExitEvaluationState = "MET" | "UNMET" | "PARTIAL" | "STALE" | "UNAVAILABLE";
export type PaperExitDecision = "PROMOTE" | "EXTEND_OBSERVATION" | "REJECT";

export interface PaperExitApprovalRecord {
  approvalId: string;
  workspaceId: string;
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
  slaDueAt: Date;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaperExitReviewRecord {
  reviewId: string;
  workspaceId: string;
  deploymentId: string;
  portfolioId: string;
  venue: string;
  promoteTo: "SANDBOX_VALIDATION";
  artifactDigest: string;
  r1ApprovalId: string;
  r2ApprovalId: string;
  observationPolicyId: string;
  observationPolicyVersion: string;
  observationPolicyDigest: string;
  evidencePackId: string;
  evidencePackDigest: string;
  evaluationPolicyVersion: string;
  evaluationFormulaVersion: string;
  sourceSnapshotHash: string;
  observationSummary: string;
  recommendation: string;
  reviewState: "PENDING" | "EXTENDED" | "REJECTED_TO_PAPER_HELD" | "PROMOTION_AUTHORIZED";
  extensionDays: number | null;
  extendedUntil: Date | null;
  reviewVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaperExitLineageRecord {
  lineageId: string;
  ordinal: number;
  kind: string;
  label: string;
  value: string;
  href: string | null;
  digest: string | null;
  sourceAuthority: string;
  required: boolean;
}

export interface PaperExitPanelRecord {
  panelId: string;
  ordinal: number;
  panelKind: "OBSERVATION_COVERAGE" | "DRIFT" | "LIMITS_HEALTH" | "PORTFOLIO_FIT";
  title: string;
  sourceAuthority: "RESEARCH" | "EXECUTION" | "BROKER" | "DERIVED";
  sourceReference: string | null;
  sourceHref: string | null;
  panelState: "OK" | "PARTIAL" | "STALE" | "UNAVAILABLE" | "ERROR";
  reason: string | null;
  asOf: Date | null;
  freshnessState: "OK" | "STALE" | "UNKNOWN";
  sourceCompleteness: "EVENT_SOURCED" | "POLL_BOUNDED" | "UNKNOWN";
  pollIntervalMs: number | null;
  formulaVersion: string | null;
}

export interface PaperExitFindingRecord {
  findingId: string;
  panelId: string;
  ordinal: number;
  metricKey: string;
  label: string;
  outcome: "PASS" | "WATCH" | "FAIL" | "INSUFFICIENT";
  blocking: boolean;
  required: boolean;
  carriesTo: string | null;
  exactValue: string | null;
  unit: string | null;
  currency: string | null;
  thresholdValue: string | null;
  sourceLabel: string | null;
  sourceHref: string | null;
  evidenceHash: string | null;
  formulaVersion: string | null;
  asOf: Date | null;
}

export interface PaperExitDecisionRecord {
  decisionId: string;
  operationId: string;
  actorUserId: string;
  actorUsername: string;
  decision: PaperExitDecision;
  reason: string;
  extensionDays: number | null;
  evidenceSetHash: string;
  sourceSnapshotHash: string;
  reviewVersionBefore: number;
  reviewVersionAfter: number;
  resultingState: string;
  decidedAt: Date;
}

export interface PromotionGrantRecord {
  grantId: string;
  deploymentId: string;
  targetStage: "SANDBOX_VALIDATION";
  grantState: "AVAILABLE";
  evidenceSetHash: string;
  sourceSnapshotHash: string;
  policyVersion: string;
  createdByUserId: string;
  createdAt: Date;
}

export interface PaperExitSnapshot {
  approval: PaperExitApprovalRecord;
  review: PaperExitReviewRecord;
  evidence: EvidenceRecord[];
  lineage: PaperExitLineageRecord[];
  panels: PaperExitPanelRecord[];
  findings: PaperExitFindingRecord[];
  decisions: PaperExitDecisionRecord[];
  promotionGrant: PromotionGrantRecord | null;
}

export interface PaperExitPlanRecord {
  operationId: string;
  workspaceId: string;
  reviewId: string;
  actorUserId: string;
  requestKey: string;
  payloadHash: string;
  decision: PaperExitDecision;
  reason: string;
  extensionDays: number | null;
  expectedReviewVersion: number;
  evidenceSetHash: string;
  sourceSnapshotHash: string;
  evidenceHashes: string[];
  evaluationState: PaperExitEvaluationState;
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

interface ApprovalRow {
  approval_id: string; workspace_id: string; requester_user_id: string; requester_username: string;
  artifact_creator_user_id: string; artifact_creator_username: string; status: string;
  policy_version: string; quorum_required: number; quorum_met: number; decision_actor_ids: string[];
  approval_version: number; evidence_set_hash: string; evidence_complete: boolean;
  sla_due_at: Date; expires_at: Date; created_at: Date; updated_at: Date;
}

interface ReviewRow {
  review_id: string; workspace_id: string; deployment_id: string; portfolio_id: string; venue: string;
  promote_to: "SANDBOX_VALIDATION"; artifact_digest: string; r1_approval_id: string; r2_approval_id: string;
  observation_policy_id: string; observation_policy_version: string; observation_policy_digest: string;
  evidence_pack_id: string; evidence_pack_digest: string; evaluation_policy_version: string;
  evaluation_formula_version: string; source_snapshot_hash: string; observation_summary: string;
  recommendation: string; review_state: PaperExitReviewRecord["reviewState"];
  extension_days: number | null; extended_until: Date | null; review_version: number;
  created_at: Date; updated_at: Date;
}

interface EvidenceRow {
  evidence_id: string; ordinal: number; kind: string; label: string; display_value: string;
  note: string | null; verification: string | null; artifact_id: string | null; sha256: string;
  size_bytes: string | null; media_type: string | null; schema_version: string;
  source_authority: string; source_reference: string | null; required: boolean;
  captured_at: Date; retention_class: string; access_policy: string;
}

interface LineageRow {
  lineage_id: string; ordinal: number; kind: string; label: string; value: string; href: string | null;
  digest: string | null; source_authority: string; required: boolean;
}

interface PanelRow {
  panel_id: string; ordinal: number; panel_kind: PaperExitPanelRecord["panelKind"]; title: string;
  source_authority: PaperExitPanelRecord["sourceAuthority"]; source_reference: string | null;
  source_href: string | null; panel_state: PaperExitPanelRecord["panelState"]; reason: string | null;
  as_of: Date | null; freshness_state: PaperExitPanelRecord["freshnessState"];
  source_completeness: PaperExitPanelRecord["sourceCompleteness"]; poll_interval_ms: number | null;
  formula_version: string | null;
}

interface FindingRow {
  finding_id: string; panel_id: string; ordinal: number; metric_key: string; label: string;
  outcome: PaperExitFindingRecord["outcome"]; blocking: boolean; required: boolean;
  carries_to: string | null; exact_value: string | null; unit: string | null; currency: string | null;
  threshold_value: string | null; source_label: string | null; source_href: string | null;
  evidence_hash: string | null; formula_version: string | null; as_of: Date | null;
}

interface DecisionRow {
  decision_id: string; operation_id: string; actor_user_id: string; actor_username: string;
  decision: PaperExitDecision; reason: string; extension_days: number | null; evidence_set_hash: string;
  source_snapshot_hash: string; review_version_before: number; review_version_after: number;
  resulting_state: string; decided_at: Date;
}

interface GrantRow {
  grant_id: string; deployment_id: string; target_stage: "SANDBOX_VALIDATION";
  grant_state: "AVAILABLE"; evidence_set_hash: string; source_snapshot_hash: string;
  policy_version: string; created_by_user_id: string; created_at: Date;
}

interface PlanRow {
  operation_id: string; workspace_id: string; review_id: string; actor_user_id: string;
  request_key: string; payload_hash: string; decision: PaperExitDecision; reason: string;
  extension_days: number | null; expected_review_version: number; evidence_set_hash: string;
  source_snapshot_hash: string; evidence_hashes: string[]; evaluation_state: PaperExitEvaluationState;
  blocker_codes: string[]; warning_codes: string[]; apply_key_id: string; apply_token_hash: string;
  status: PaperExitPlanRecord["status"]; response_json: Record<string, unknown> | null;
  expires_at: Date; created_at: Date; applied_at: Date | null;
}

function approval(row: ApprovalRow): PaperExitApprovalRecord {
  return {
    approvalId: row.approval_id, workspaceId: row.workspace_id,
    requesterUserId: row.requester_user_id, requesterUsername: row.requester_username,
    artifactCreatorUserId: row.artifact_creator_user_id,
    artifactCreatorUsername: row.artifact_creator_username, status: row.status,
    policyVersion: row.policy_version, quorumRequired: row.quorum_required,
    quorumMet: row.quorum_met, decisionActorIds: row.decision_actor_ids,
    approvalVersion: row.approval_version, evidenceSetHash: row.evidence_set_hash,
    evidenceComplete: row.evidence_complete, slaDueAt: row.sla_due_at,
    expiresAt: row.expires_at, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function review(row: ReviewRow): PaperExitReviewRecord {
  return {
    reviewId: row.review_id, workspaceId: row.workspace_id, deploymentId: row.deployment_id,
    portfolioId: row.portfolio_id, venue: row.venue, promoteTo: row.promote_to,
    artifactDigest: row.artifact_digest, r1ApprovalId: row.r1_approval_id,
    r2ApprovalId: row.r2_approval_id, observationPolicyId: row.observation_policy_id,
    observationPolicyVersion: row.observation_policy_version,
    observationPolicyDigest: row.observation_policy_digest, evidencePackId: row.evidence_pack_id,
    evidencePackDigest: row.evidence_pack_digest,
    evaluationPolicyVersion: row.evaluation_policy_version,
    evaluationFormulaVersion: row.evaluation_formula_version,
    sourceSnapshotHash: row.source_snapshot_hash, observationSummary: row.observation_summary,
    recommendation: row.recommendation, reviewState: row.review_state,
    extensionDays: row.extension_days, extendedUntil: row.extended_until,
    reviewVersion: row.review_version, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function evidence(row: EvidenceRow): EvidenceRecord {
  return {
    evidenceId: row.evidence_id, ordinal: row.ordinal, kind: row.kind, label: row.label,
    displayValue: row.display_value, note: row.note, verification: row.verification,
    artifactId: row.artifact_id, sha256: row.sha256, sizeBytes: row.size_bytes,
    mediaType: row.media_type, schemaVersion: row.schema_version,
    sourceAuthority: row.source_authority, sourceReference: row.source_reference,
    required: row.required, capturedAt: row.captured_at, retentionClass: row.retention_class,
    accessPolicy: row.access_policy,
  };
}

function lineage(row: LineageRow): PaperExitLineageRecord {
  return { lineageId: row.lineage_id, ordinal: row.ordinal, kind: row.kind, label: row.label,
    value: row.value, href: row.href, digest: row.digest, sourceAuthority: row.source_authority,
    required: row.required };
}

function panel(row: PanelRow): PaperExitPanelRecord {
  return { panelId: row.panel_id, ordinal: row.ordinal, panelKind: row.panel_kind,
    title: row.title, sourceAuthority: row.source_authority, sourceReference: row.source_reference,
    sourceHref: row.source_href, panelState: row.panel_state, reason: row.reason, asOf: row.as_of,
    freshnessState: row.freshness_state, sourceCompleteness: row.source_completeness,
    pollIntervalMs: row.poll_interval_ms, formulaVersion: row.formula_version };
}

function finding(row: FindingRow): PaperExitFindingRecord {
  return { findingId: row.finding_id, panelId: row.panel_id, ordinal: row.ordinal,
    metricKey: row.metric_key, label: row.label, outcome: row.outcome, blocking: row.blocking,
    required: row.required, carriesTo: row.carries_to, exactValue: row.exact_value,
    unit: row.unit, currency: row.currency, thresholdValue: row.threshold_value,
    sourceLabel: row.source_label, sourceHref: row.source_href, evidenceHash: row.evidence_hash,
    formulaVersion: row.formula_version, asOf: row.as_of };
}

function decision(row: DecisionRow): PaperExitDecisionRecord {
  return { decisionId: row.decision_id, operationId: row.operation_id,
    actorUserId: row.actor_user_id, actorUsername: row.actor_username, decision: row.decision,
    reason: row.reason, extensionDays: row.extension_days, evidenceSetHash: row.evidence_set_hash,
    sourceSnapshotHash: row.source_snapshot_hash, reviewVersionBefore: row.review_version_before,
    reviewVersionAfter: row.review_version_after, resultingState: row.resulting_state,
    decidedAt: row.decided_at };
}

function grant(row: GrantRow): PromotionGrantRecord {
  return { grantId: row.grant_id, deploymentId: row.deployment_id, targetStage: row.target_stage,
    grantState: row.grant_state, evidenceSetHash: row.evidence_set_hash,
    sourceSnapshotHash: row.source_snapshot_hash, policyVersion: row.policy_version,
    createdByUserId: row.created_by_user_id, createdAt: row.created_at };
}

function plan(row: PlanRow): PaperExitPlanRecord {
  return { operationId: row.operation_id, workspaceId: row.workspace_id, reviewId: row.review_id,
    actorUserId: row.actor_user_id, requestKey: row.request_key, payloadHash: row.payload_hash,
    decision: row.decision, reason: row.reason, extensionDays: row.extension_days,
    expectedReviewVersion: row.expected_review_version, evidenceSetHash: row.evidence_set_hash,
    sourceSnapshotHash: row.source_snapshot_hash, evidenceHashes: row.evidence_hashes,
    evaluationState: row.evaluation_state, blockerCodes: row.blocker_codes,
    warningCodes: row.warning_codes, applyKeyId: row.apply_key_id,
    applyTokenHash: row.apply_token_hash, status: row.status, responseJson: row.response_json,
    expiresAt: row.expires_at, createdAt: row.created_at, appliedAt: row.applied_at };
}

@Injectable()
export class PaperExitRepository {
  constructor(@Inject(CONTROL_API_POOL) readonly pool: Pool) {}

  async detail(workspaceId: string, reviewId: string): Promise<PaperExitSnapshot | null> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const approvalResult = await client.query<ApprovalRow>(
        `SELECT approval_id, workspace_id, requester_user_id, requester_username,
                artifact_creator_user_id, artifact_creator_username, status, policy_version,
                quorum_required, quorum_met, decision_actor_ids, approval_version,
                evidence_set_hash, evidence_complete, sla_due_at, expires_at, created_at, updated_at
           FROM governance_approval_requests
          WHERE workspace_id = $1 AND approval_id = $2 AND gate = 'PAPER_EXIT'`,
        [workspaceId, reviewId],
      );
      const reviewResult = await client.query<ReviewRow>(
        `SELECT * FROM governance_paper_exit_reviews WHERE workspace_id = $1 AND review_id = $2`,
        [workspaceId, reviewId],
      );
      if (!approvalResult.rows[0] || !reviewResult.rows[0]) {
        await client.query("COMMIT");
        return null;
      }
      // A pg client is a single ordered protocol stream. Keep this snapshot
      // sequential instead of issuing concurrent query() calls on one client;
      // pg@9 removes the legacy implicit queueing behaviour.
      const evidenceRows = await client.query<EvidenceRow>(
        `SELECT * FROM governance_approval_evidence WHERE approval_id = $1 ORDER BY ordinal`,
        [reviewId],
      );
      const lineageRows = await client.query<LineageRow>(
        `SELECT * FROM governance_paper_exit_lineage WHERE review_id = $1 ORDER BY ordinal`,
        [reviewId],
      );
      const panelRows = await client.query<PanelRow>(
        `SELECT * FROM governance_paper_exit_panels WHERE review_id = $1 ORDER BY ordinal`,
        [reviewId],
      );
      const findingRows = await client.query<FindingRow>(
        `SELECT * FROM governance_paper_exit_findings WHERE review_id = $1 ORDER BY panel_id, ordinal`,
        [reviewId],
      );
      const decisionRows = await client.query<DecisionRow>(
        `SELECT * FROM governance_paper_exit_decisions WHERE review_id = $1 ORDER BY decided_at`,
        [reviewId],
      );
      const grantRows = await client.query<GrantRow>(
        `SELECT * FROM governance_promotion_authority_grants WHERE review_id = $1`,
        [reviewId],
      );
      await client.query("COMMIT");
      return {
        approval: approval(approvalResult.rows[0]), review: review(reviewResult.rows[0]),
        evidence: evidenceRows.rows.map(evidence), lineage: lineageRows.rows.map(lineage),
        panels: panelRows.rows.map(panel), findings: findingRows.rows.map(finding),
        decisions: decisionRows.rows.map(decision),
        promotionGrant: grantRows.rows[0] ? grant(grantRows.rows[0]) : null,
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async findPlanByKey(workspaceId: string, actorUserId: string, requestKey: string) {
    const result = await this.pool.query<PlanRow>(
      `SELECT * FROM governance_paper_exit_decision_plans
        WHERE workspace_id = $1 AND actor_user_id = $2 AND request_key = $3`,
      [workspaceId, actorUserId, requestKey],
    );
    return result.rows[0] ? plan(result.rows[0]) : null;
  }

  async findPlan(workspaceId: string, actorUserId: string, operationId: string) {
    const result = await this.pool.query<PlanRow>(
      `SELECT * FROM governance_paper_exit_decision_plans
        WHERE workspace_id = $1 AND actor_user_id = $2 AND operation_id = $3`,
      [workspaceId, actorUserId, operationId],
    );
    return result.rows[0] ? plan(result.rows[0]) : null;
  }

  async createPlan(input: {
    operationId: string; workspaceId: string; reviewId: string; actorUserId: string;
    requestKey: string; payloadHash: string; decision: PaperExitDecision; reason: string;
    extensionDays: number | null; expectedReviewVersion: number; evidenceSetHash: string;
    sourceSnapshotHash: string; evidenceHashes: string[]; evaluationState: PaperExitEvaluationState;
    blockerCodes: string[]; warningCodes: string[]; applyKeyId: string; applyTokenHash: string;
    expiresAt: Date; requestId: string; auditEventId: string; outboxMessageId: string;
  }): Promise<PaperExitPlanRecord> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      const inserted = await client.query<PlanRow>(
        `INSERT INTO governance_paper_exit_decision_plans
           (operation_id, workspace_id, review_id, actor_user_id, request_key,
            command_type, command_version, payload_hash, decision, reason, extension_days,
            expected_review_version, evidence_set_hash, source_snapshot_hash, evidence_hashes,
            evaluation_state, blocker_codes, warning_codes, apply_key_id, apply_token_hash,
            status, expires_at)
         VALUES ($1, $2, $3, $4, $5, 'GOVERNANCE_PAPER_EXIT_DECISION', 1, $6,
                 $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, 'PLANNED', $19)
         RETURNING *`,
        [input.operationId, input.workspaceId, input.reviewId, input.actorUserId, input.requestKey,
          input.payloadHash, input.decision, input.reason, input.extensionDays,
          input.expectedReviewVersion, input.evidenceSetHash, input.sourceSnapshotHash,
          input.evidenceHashes, input.evaluationState, input.blockerCodes, input.warningCodes,
          input.applyKeyId, input.applyTokenHash, input.expiresAt],
      );
      const auditMetadata = JSON.stringify({ operation_id: input.operationId,
        payload_hash: input.payloadHash, evidence_set_hash: input.evidenceSetHash,
        source_snapshot_hash: input.sourceSnapshotHash, evaluation_state: input.evaluationState,
        blocker_codes: input.blockerCodes, warning_codes: input.warningCodes,
        external_side_effect_requested: false });
      await client.query(
        `INSERT INTO product_audit_events
           (event_id, event_type, actor_user_id, workspace_id, request_id, idempotency_key,
            aggregate_type, aggregate_id, aggregate_version, result, reason_code, metadata_json)
         VALUES ($1, 'governance.paper_exit_decision.planned', $2, $3, $4, $5,
                 'paper_exit_review', $6, $7, 'SUCCESS', NULL, $8)`,
        [input.auditEventId, input.actorUserId, input.workspaceId, input.requestId,
          input.requestKey, input.reviewId, input.expectedReviewVersion, auditMetadata],
      );
      await client.query(
        `INSERT INTO outbox_messages
           (message_id, idempotency_key, aggregate_type, aggregate_id, event_type,
            actor_user_id, workspace_id, request_id, payload_json, state)
         VALUES ($1, $2, 'paper_exit_review', $3, 'governance.paper_exit_decision.planned',
                 $4, $5, $6, $7, 'PENDING')`,
        [input.outboxMessageId, `paper-exit-plan:${input.workspaceId}:${input.actorUserId}:${input.requestKey}`,
          input.reviewId, input.actorUserId, input.workspaceId, input.requestId, auditMetadata],
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
    workspaceId: string; actorUserId: string; actorUsername: string; operationId: string;
    requestId: string; decisionId: string; grantId: string; auditEventId: string;
    outboxMessageId: string; reasonHash: string;
  }): Promise<{ plan: PaperExitPlanRecord; replayed: boolean }> {
    const client = await this.pool.connect();
    let transactionOpen = false;
    try {
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      transactionOpen = true;
      const planResult = await client.query<PlanRow>(
        `SELECT * FROM governance_paper_exit_decision_plans
          WHERE workspace_id = $1 AND actor_user_id = $2 AND operation_id = $3 FOR UPDATE`,
        [input.workspaceId, input.actorUserId, input.operationId],
      );
      const planRow = planResult.rows[0];
      if (!planRow) throw this.problem("OPERATION_NOT_FOUND", 404);
      if (planRow.status === "APPLIED") {
        await client.query("COMMIT");
        transactionOpen = false;
        return { plan: plan(planRow), replayed: true };
      }
      if (planRow.status === "EXPIRED" || planRow.expires_at <= new Date()) {
        await client.query(`UPDATE governance_paper_exit_decision_plans SET status = 'EXPIRED' WHERE operation_id = $1`, [input.operationId]);
        await client.query("COMMIT");
        transactionOpen = false;
        throw this.problem("OPERATION_EXPIRED", 409);
      }
      if (planRow.blocker_codes.length > 0) {
        throw this.problem("OPERATION_BLOCKED", 409, { blocker_codes: planRow.blocker_codes });
      }
      const reviewResult = await client.query<ReviewRow>(
        `SELECT * FROM governance_paper_exit_reviews WHERE workspace_id = $1 AND review_id = $2 FOR UPDATE`,
        [input.workspaceId, planRow.review_id],
      );
      const reviewRow = reviewResult.rows[0];
      if (!reviewRow) throw this.problem("EXIT_REVIEW_NOT_FOUND", 404);
      const approvalResult = await client.query<ApprovalRow>(
        `SELECT approval_id, workspace_id, requester_user_id, requester_username,
                artifact_creator_user_id, artifact_creator_username, status, policy_version,
                quorum_required, quorum_met, decision_actor_ids, approval_version,
                evidence_set_hash, evidence_complete, sla_due_at, expires_at, created_at, updated_at
           FROM governance_approval_requests WHERE workspace_id = $1 AND approval_id = $2 FOR UPDATE`,
        [input.workspaceId, planRow.review_id],
      );
      const approvalRow = approvalResult.rows[0];
      if (!approvalRow) throw this.problem("EXIT_REVIEW_NOT_FOUND", 404);
      if (reviewRow.review_state !== "PENDING" || approvalRow.status !== "PENDING") throw this.problem("EXIT_REVIEW_CLOSED", 409);
      if (approvalRow.expires_at <= new Date()) throw this.problem("EXIT_REVIEW_EXPIRED", 409);
      if (reviewRow.review_version !== planRow.expected_review_version) {
        throw this.problem("EXIT_REVIEW_VERSION_CONFLICT", 409,
          { expected: planRow.expected_review_version, actual: reviewRow.review_version });
      }
      if (reviewRow.source_snapshot_hash !== planRow.source_snapshot_hash) throw this.problem("SOURCE_SNAPSHOT_CHANGED", 409);
      if (approvalRow.evidence_set_hash !== planRow.evidence_set_hash) throw this.problem("EVIDENCE_SET_CHANGED", 409);

      const versionAfter = reviewRow.review_version + 1;
      const decidedAt = new Date();
      const resultingState = planRow.decision === "PROMOTE" ? "PROMOTION_AUTHORIZED"
        : planRow.decision === "REJECT" ? "REJECTED_TO_PAPER_HELD" : "EXTENDED";
      const approvalStatus = planRow.decision === "PROMOTE" ? "APPROVED"
        : planRow.decision === "REJECT" ? "DENIED" : "APPROVED_WITH_CONDITION";
      const extendedUntil = planRow.decision === "EXTEND_OBSERVATION"
        ? new Date(decidedAt.valueOf() + 14 * 24 * 60 * 60 * 1000) : null;

      await client.query(
        `INSERT INTO governance_paper_exit_decisions
           (decision_id, operation_id, workspace_id, review_id, actor_user_id, actor_username,
            decision, reason, extension_days, evidence_set_hash, source_snapshot_hash,
            review_version_before, review_version_after, resulting_state, decided_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [input.decisionId, input.operationId, input.workspaceId, planRow.review_id,
          input.actorUserId, input.actorUsername, planRow.decision, planRow.reason,
          planRow.extension_days, approvalRow.evidence_set_hash, reviewRow.source_snapshot_hash,
          reviewRow.review_version, versionAfter, resultingState, decidedAt],
      );
      await client.query(
        `UPDATE governance_paper_exit_reviews SET review_state = $2, extension_days = $3,
           extended_until = $4, review_version = $5, updated_at = $6 WHERE review_id = $1`,
        [planRow.review_id, resultingState, planRow.extension_days, extendedUntil, versionAfter, decidedAt],
      );
      await client.query(
        `UPDATE governance_approval_requests SET status = $2, quorum_met = quorum_required,
           decision_actor_ids = array_append(decision_actor_ids, $3), approval_version = approval_version + 1,
           updated_at = $4, decided_at = $4, decided_by_user_id = $3 WHERE approval_id = $1`,
        [planRow.review_id, approvalStatus, input.actorUserId, decidedAt],
      );
      if (planRow.decision === "PROMOTE") {
        await client.query(
          `INSERT INTO governance_promotion_authority_grants
             (grant_id, workspace_id, review_id, deployment_id, target_stage, grant_state,
              evidence_set_hash, source_snapshot_hash, policy_version, created_by_user_id, created_at)
           VALUES ($1, $2, $3, $4, 'SANDBOX_VALIDATION', 'AVAILABLE', $5, $6, $7, $8, $9)`,
          [input.grantId, input.workspaceId, planRow.review_id, reviewRow.deployment_id,
            approvalRow.evidence_set_hash, reviewRow.source_snapshot_hash,
            reviewRow.evaluation_policy_version, input.actorUserId, decidedAt],
        );
      }
      const response = {
        operation_id: input.operationId, receipt_id: input.decisionId, status: "SUCCEEDED",
        review_id: planRow.review_id, review_state: resultingState, review_version: versionAfter,
        decision: planRow.decision, extension_days: planRow.extension_days,
        extended_until: extendedUntil?.toISOString() ?? null,
        promotion_grant_id: planRow.decision === "PROMOTE" ? input.grantId : null,
        next_eligible_action: planRow.decision === "PROMOTE" ? "PLAN_SANDBOX_PROMOTION"
          : planRow.decision === "REJECT" ? "RETURN_TO_PAPER_HELD" : "CONTINUE_PAPER_OBSERVATION",
        external_side_effect_requested: false, decided_at: decidedAt.toISOString(),
      };
      const updatedPlan = await client.query<PlanRow>(
        `UPDATE governance_paper_exit_decision_plans SET status = 'APPLIED', applied_at = $2,
           response_json = $3 WHERE operation_id = $1 RETURNING *`,
        [input.operationId, decidedAt, JSON.stringify(response)],
      );
      const metadata = JSON.stringify({ operation_id: input.operationId, decision: planRow.decision,
        reason_sha256: input.reasonHash, evidence_set_hash: approvalRow.evidence_set_hash,
        source_snapshot_hash: reviewRow.source_snapshot_hash, review_state: resultingState,
        promotion_grant_id: response.promotion_grant_id, external_side_effect_requested: false });
      await client.query(
        `INSERT INTO product_audit_events
           (event_id, event_type, actor_user_id, workspace_id, request_id, idempotency_key,
            aggregate_type, aggregate_id, aggregate_version, result, reason_code, metadata_json)
         VALUES ($1, 'governance.paper_exit_decision.applied', $2, $3, $4, $5,
                 'paper_exit_review', $6, $7, 'SUCCESS', NULL, $8)`,
        [input.auditEventId, input.actorUserId, input.workspaceId, input.requestId,
          planRow.request_key, planRow.review_id, versionAfter, metadata],
      );
      await client.query(
        `INSERT INTO outbox_messages
           (message_id, idempotency_key, aggregate_type, aggregate_id, event_type,
            actor_user_id, workspace_id, request_id, payload_json, response_json,
            response_status, state)
         VALUES ($1, $2, 'paper_exit_review', $3, 'governance.paper_exit_decision.applied',
                 $4, $5, $6, $7, $8, 202, 'PENDING')`,
        [input.outboxMessageId, `paper-exit-apply:${input.operationId}`, planRow.review_id,
          input.actorUserId, input.workspaceId, input.requestId, metadata,
          JSON.stringify(response)],
      );
      await client.query("COMMIT");
      transactionOpen = false;
      return { plan: plan(updatedPlan.rows[0]), replayed: false };
    } catch (error) {
      if (transactionOpen) await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async recordRejected(input: {
    eventId: string; eventType: string; actorUserId: string; workspaceId: string;
    requestId: string; idempotencyKey: string | null; aggregateId: string | null;
    aggregateVersion: number | null; result: "DENIED" | "CONFLICT" | "FAILURE";
    reasonCode: string; metadata?: Record<string, unknown>;
  }) {
    await this.pool.query(
      `INSERT INTO product_audit_events
         (event_id, event_type, actor_user_id, workspace_id, request_id, idempotency_key,
          aggregate_type, aggregate_id, aggregate_version, result, reason_code, metadata_json)
       VALUES ($1, $2, $3, $4, $5, $6, 'paper_exit_review', $7, $8, $9, $10, $11)`,
      [input.eventId, input.eventType, input.actorUserId, input.workspaceId, input.requestId,
        input.idempotencyKey, input.aggregateId, input.aggregateVersion, input.result,
        input.reasonCode, input.metadata ? JSON.stringify(input.metadata) : null],
    );
  }

  private problem(code: string, status: number, details?: Record<string, unknown>) {
    return Object.assign(new Error(code), { governanceCode: code, status, details });
  }
}
