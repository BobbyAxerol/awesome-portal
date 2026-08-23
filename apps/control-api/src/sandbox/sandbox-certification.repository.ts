import { Inject, Injectable } from "@nestjs/common";
import { Pool, PoolClient, QueryResult } from "pg";
import { GovernanceError } from "../governance/governance.service";
import { CONTROL_API_POOL } from "../tokens";
import { SandboxCertificationStep } from "./contracts";

export type SandboxWorkflowState = "DRAFT" | "IN_REVIEW" | "APPROVED" | "DENIED";
export type SandboxAction = "CREATE" | "SUBMIT" | "APPROVE" | "DENY" | "PLAN_PROMOTION";

export interface SandboxCertificationRow extends Record<string, unknown> {
  certification_id: string;
  workspace_id: string;
  deployment_id: string;
  promotion_grant_id: string;
  paper_exit_review_id: string;
  portfolio_id: string;
  venue: string;
  account_id: string;
  external_account_ref: string;
  artifact_digest: string;
  r1_approval_id: string;
  r2_approval_id: string;
  policy_version: string;
  formula_version: string;
  workflow_state: SandboxWorkflowState;
  workflow_version: number;
  submitted_at: Date | null;
  submitted_by_user_id: string | null;
  submitted_evidence_set_hash: string | null;
  decided_at: Date | null;
  decided_by_user_id: string | null;
  decided_evidence_set_hash: string | null;
  decision_reason: string | null;
  source_integration_state: "UNAVAILABLE" | "SHADOW";
  delivery_profile: "fixture" | "shadow";
  source_side_effect_requested: false;
  runtime_activation_requested: false;
  promotion_execution_requested: false;
  created_by_user_id: string;
  created_at: Date;
  updated_at: Date;
}

export interface SandboxStepEvidenceRow extends Record<string, unknown> {
  evidence_id: string;
  step_key: SandboxCertificationStep;
  source_authority: "PORTAL" | "EXECUTION" | "BROKER" | "DERIVED";
  evaluation_state: "PASS" | "FAIL" | "STALE" | "UNAVAILABLE";
  evidence_hash: string | null;
  evidence_schema_version: string;
  source_verification_state: "VERIFIED" | "UNAVAILABLE";
  summary: string;
  as_of: Date | null;
  expires_at: Date | null;
  capability_snapshot_id: string | null;
  source_cursor: string | null;
  projection_epoch: string | null;
  projection_sequence: string | null;
  created_at: Date;
}

export interface SandboxFindingRow extends Record<string, unknown> {
  finding_id: string;
  severity: "INFO" | "WARNING" | "ERROR" | "CRITICAL";
  source_authority: "EXECUTION" | "BROKER" | "DERIVED";
  finding_code: string;
  summary: string;
  blocking: boolean;
  evidence_hash: string | null;
  as_of: Date | null;
  resolved_at: Date | null;
  created_at: Date;
}

export interface SandboxEventRow extends Record<string, unknown> {
  event_id: string;
  actor_user_id: string;
  action: SandboxAction;
  workflow_version_before: number;
  workflow_version_after: number;
  metadata_json: Record<string, unknown>;
  created_at: Date;
}

export interface SandboxPromotionPlanRow extends Record<string, unknown> {
  plan_id: string;
  actor_user_id: string;
  request_key: string;
  expected_workflow_version: number;
  target_stage: "CANARY";
  evidence_set_hash: string;
  status: "BLOCKED";
  blocker_codes: string[];
  source_side_effect_requested: false;
  created_at: Date;
}

export interface SandboxCertificationDetail {
  certification: SandboxCertificationRow;
  evidence: SandboxStepEvidenceRow[];
  findings: SandboxFindingRow[];
  findingsTotal: number;
  events: SandboxEventRow[];
  eventsTotal: number;
  promotionPlans: SandboxPromotionPlanRow[];
}

interface BaseWrite {
  certificationId: string;
  workspaceId: string;
  actorUserId: string;
  requestKey: string;
  requestDigest: string;
  requestId: string;
  eventId: string;
  auditEventId: string;
}

export interface CreateSandboxCertificationWrite extends BaseWrite {
  deploymentId: string;
  promotionGrantId: string;
  accountId: string;
  externalAccountRef: string;
}

export interface TransitionSandboxCertificationWrite extends BaseWrite {
  action: "SUBMIT" | "APPROVE" | "DENY";
  expectedVersion: number;
  evidenceSetHash: string;
  reason?: string;
}

export interface PlanSandboxPromotionWrite extends BaseWrite {
  planId: string;
  expectedVersion: number;
  evidenceSetHash: string;
}

interface Queryable {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<T>>;
}

@Injectable()
export class SandboxCertificationRepository {
  constructor(@Inject(CONTROL_API_POOL) readonly pool: Pool) {}

  async detailByDeployment(workspaceId: string, deploymentId: string): Promise<SandboxCertificationDetail> {
    const result = await this.pool.query<SandboxCertificationRow>(
      `SELECT * FROM governance_sandbox_certifications
       WHERE workspace_id = $1 AND deployment_id = $2`,
      [workspaceId, deploymentId],
    );
    if (!result.rows[0]) throw this.problem("SANDBOX_CERTIFICATION_NOT_FOUND", 404);
    return this.loadDetail(this.pool, workspaceId, result.rows[0].certification_id);
  }

  async detailById(workspaceId: string, certificationId: string): Promise<SandboxCertificationDetail> {
    return this.loadDetail(this.pool, workspaceId, certificationId);
  }

  async create(input: CreateSandboxCertificationWrite): Promise<{ detail: SandboxCertificationDetail; replayed: boolean }> {
    let outcome: { certificationId: string; replayed: boolean };
    try {
      outcome = await this.withSerializable((client) => this.createAttempt(client, input));
    } catch (error) {
      if (this.code(error) === "23505" && [
        "governance_sandbox_certifications_workspace_id_deployment_id_key",
        "governance_sandbox_certifications_promotion_grant_id_key",
      ].includes(this.constraint(error))) {
        throw this.problem("SANDBOX_CERTIFICATION_EXISTS", 409);
      }
      throw error;
    }
    return {
      detail: await this.loadDetail(this.pool, input.workspaceId, outcome.certificationId),
      replayed: outcome.replayed,
    };
  }

  async transition(
    input: TransitionSandboxCertificationWrite,
    authorize: (detail: SandboxCertificationDetail) => void,
  ): Promise<{ detail: SandboxCertificationDetail; replayed: boolean }> {
    const outcome = await this.withSerializable(async (client) => {
      const replay = await this.replay(client, input, input.action);
      if (replay) return replay;
      const locked = await this.lock(client, input.workspaceId, input.certificationId);
      if (locked.workflow_version !== input.expectedVersion) {
        throw new GovernanceError("SANDBOX_CERTIFICATION_VERSION_CONFLICT", "Certification version conflict.", 409, {
          expected: input.expectedVersion,
          actual: locked.workflow_version,
        });
      }
      const detail = await this.loadDetail(client, input.workspaceId, input.certificationId);
      authorize(detail);
      const now = new Date();
      const nextState: SandboxWorkflowState = input.action === "SUBMIT"
        ? "IN_REVIEW"
        : input.action === "APPROVE"
          ? "APPROVED"
          : "DENIED";
      const updated = await client.query<SandboxCertificationRow>(
        `UPDATE governance_sandbox_certifications
         SET workflow_state = $4,
             workflow_version = workflow_version + 1,
             submitted_at = CASE WHEN $3 = 'SUBMIT' THEN $5 ELSE submitted_at END,
             submitted_by_user_id = CASE WHEN $3 = 'SUBMIT' THEN $6 ELSE submitted_by_user_id END,
             submitted_evidence_set_hash = CASE WHEN $3 = 'SUBMIT' THEN $7 ELSE submitted_evidence_set_hash END,
             decided_at = CASE WHEN $3 IN ('APPROVE', 'DENY') THEN $5 ELSE decided_at END,
             decided_by_user_id = CASE WHEN $3 IN ('APPROVE', 'DENY') THEN $6 ELSE decided_by_user_id END,
             decided_evidence_set_hash = CASE WHEN $3 IN ('APPROVE', 'DENY') THEN $7 ELSE decided_evidence_set_hash END,
             decision_reason = CASE WHEN $3 IN ('APPROVE', 'DENY') THEN $8 ELSE decision_reason END,
             updated_at = $5
         WHERE workspace_id = $1 AND certification_id = $2
         RETURNING *`,
        [input.workspaceId, input.certificationId, input.action, nextState, now,
          input.actorUserId, input.evidenceSetHash, input.reason ?? null],
      );
      const versionAfter = updated.rows[0].workflow_version;
      await this.writeEventAndAudit(client, input, input.action, locked.workflow_version, versionAfter, {
        evidence_set_hash: input.evidenceSetHash,
        resulting_state: nextState,
        source_side_effect_requested: false,
      });
      return { certificationId: input.certificationId, replayed: false };
    });
    return {
      detail: await this.loadDetail(this.pool, input.workspaceId, outcome.certificationId),
      replayed: outcome.replayed,
    };
  }

  async planPromotion(
    input: PlanSandboxPromotionWrite,
    authorize: (detail: SandboxCertificationDetail) => void,
  ): Promise<{ plan: SandboxPromotionPlanRow; replayed: boolean }> {
    return this.withSerializable(async (client) => {
      const replay = await this.replay(client, input, "PLAN_PROMOTION");
      if (replay) {
        const existing = await client.query<SandboxPromotionPlanRow>(
          `SELECT plan_id, actor_user_id, request_key, expected_workflow_version, target_stage,
                  evidence_set_hash, status, blocker_codes, source_side_effect_requested, created_at
           FROM governance_sandbox_promotion_plans
           WHERE workspace_id = $1 AND actor_user_id = $2 AND request_key = $3`,
          [input.workspaceId, input.actorUserId, input.requestKey],
        );
        if (!existing.rows[0]) throw this.problem("SANDBOX_PROMOTION_PLAN_REPLAY_MISSING", 500);
        return { plan: existing.rows[0], replayed: true };
      }
      const locked = await this.lock(client, input.workspaceId, input.certificationId);
      if (locked.workflow_version !== input.expectedVersion) {
        throw this.problem("SANDBOX_CERTIFICATION_VERSION_CONFLICT", 409, {
          expected: input.expectedVersion, actual: locked.workflow_version,
        });
      }
      const detail = await this.loadDetail(client, input.workspaceId, input.certificationId);
      authorize(detail);
      const inserted = await client.query<SandboxPromotionPlanRow>(
        `INSERT INTO governance_sandbox_promotion_plans
           (plan_id, certification_id, workspace_id, actor_user_id, request_key,
            request_digest, expected_workflow_version, target_stage, evidence_set_hash,
            status, blocker_codes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'CANARY', $8, 'BLOCKED', $9)
         RETURNING plan_id, actor_user_id, request_key, expected_workflow_version,
                   target_stage, evidence_set_hash, status, blocker_codes,
                   source_side_effect_requested, created_at`,
        [input.planId, input.certificationId, input.workspaceId, input.actorUserId,
          input.requestKey, input.requestDigest, input.expectedVersion, input.evidenceSetHash,
          ["PRODUCTION_COMMAND_INACTIVE", "CANARY_OWNER_GATE_REQUIRED"]],
      );
      await this.writeEventAndAudit(client, input, "PLAN_PROMOTION", locked.workflow_version,
        locked.workflow_version, {
          plan_id: input.planId,
          evidence_set_hash: input.evidenceSetHash,
          blockers: ["PRODUCTION_COMMAND_INACTIVE", "CANARY_OWNER_GATE_REQUIRED"],
          source_side_effect_requested: false,
        });
      return { plan: inserted.rows[0], replayed: false };
    });
  }

  private async createAttempt(
    client: PoolClient,
    input: CreateSandboxCertificationWrite,
  ): Promise<{ certificationId: string; replayed: boolean }> {
    const replay = await this.replay(client, input, "CREATE");
    if (replay) return replay;
    const grant = await client.query<{
      review_id: string; deployment_id: string; portfolio_id: string; venue: string;
      artifact_digest: string; r1_approval_id: string; r2_approval_id: string; policy_version: string;
    }>(
      `SELECT g.review_id, g.deployment_id, r.portfolio_id, r.venue, r.artifact_digest,
              r.r1_approval_id, r.r2_approval_id, g.policy_version
       FROM governance_promotion_authority_grants g
       JOIN governance_paper_exit_reviews r ON r.review_id = g.review_id
       WHERE g.workspace_id = $1 AND g.grant_id = $2 AND g.grant_state = 'AVAILABLE'
         AND g.target_stage = 'SANDBOX_VALIDATION' AND r.review_state = 'PROMOTION_AUTHORIZED'
       FOR SHARE`,
      [input.workspaceId, input.promotionGrantId],
    );
    const source = grant.rows[0];
    if (!source || source.deployment_id !== input.deploymentId) {
      throw this.problem("SANDBOX_PROMOTION_GRANT_INVALID", 409);
    }
    await client.query(
        `INSERT INTO governance_sandbox_certifications
           (certification_id, workspace_id, deployment_id, promotion_grant_id,
            paper_exit_review_id, portfolio_id, venue, account_id, external_account_ref,
            artifact_digest, r1_approval_id, r2_approval_id, policy_version,
            formula_version, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
                 'sandbox-certification.v1', $14)`,
        [input.certificationId, input.workspaceId, input.deploymentId,
          input.promotionGrantId, source.review_id, source.portfolio_id, source.venue,
          input.accountId, input.externalAccountRef, source.artifact_digest,
          source.r1_approval_id, source.r2_approval_id, source.policy_version,
          input.actorUserId],
      );
    await this.writeEventAndAudit(client, input, "CREATE", 0, 1, {
      deployment_id: input.deploymentId,
      promotion_grant_id: input.promotionGrantId,
      source_side_effect_requested: false,
    });
    return { certificationId: input.certificationId, replayed: false };
  }

  private async replay(
    client: PoolClient,
    input: BaseWrite,
    action: SandboxAction,
  ): Promise<{ certificationId: string; replayed: true } | null> {
    const result = await client.query<{
      certification_id: string; action: SandboxAction; request_digest: string;
    }>(
      `SELECT certification_id, action, request_digest
       FROM governance_sandbox_certification_events
       WHERE workspace_id = $1 AND actor_user_id = $2 AND request_key = $3`,
      [input.workspaceId, input.actorUserId, input.requestKey],
    );
    const prior = result.rows[0];
    if (!prior) return null;
    if (
      (action !== "CREATE" && prior.certification_id !== input.certificationId) ||
      prior.action !== action ||
      prior.request_digest !== input.requestDigest
    ) {
      throw this.problem("REQUEST_KEY_SANDBOX_CERTIFICATION_CONFLICT", 409);
    }
    return { certificationId: prior.certification_id, replayed: true };
  }

  private async lock(client: PoolClient, workspaceId: string, certificationId: string) {
    const result = await client.query<SandboxCertificationRow>(
      `SELECT * FROM governance_sandbox_certifications
       WHERE workspace_id = $1 AND certification_id = $2 FOR UPDATE`,
      [workspaceId, certificationId],
    );
    if (!result.rows[0]) throw this.problem("SANDBOX_CERTIFICATION_NOT_FOUND", 404);
    return result.rows[0];
  }

  private async writeEventAndAudit(
    client: PoolClient,
    input: BaseWrite,
    action: SandboxAction,
    versionBefore: number,
    versionAfter: number,
    metadata: Record<string, unknown>,
  ) {
    await client.query(
      `INSERT INTO governance_sandbox_certification_events
         (event_id, certification_id, workspace_id, actor_user_id, request_key,
          request_digest, action, workflow_version_before, workflow_version_after, metadata_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [input.eventId, input.certificationId, input.workspaceId, input.actorUserId,
        input.requestKey, input.requestDigest, action, versionBefore, versionAfter,
        JSON.stringify(metadata)],
    );
    await client.query(
      `INSERT INTO product_audit_events
         (event_id, event_type, actor_user_id, workspace_id, request_id,
          idempotency_key, aggregate_type, aggregate_id, aggregate_version,
          result, reason_code, metadata_json)
       VALUES ($1, $2, $3, $4, $5, $6, 'sandbox_certification', $7, $8,
               'SUCCESS', $9, $10)`,
      [input.auditEventId, `governance.sandbox_certification.${action.toLowerCase()}`,
        input.actorUserId, input.workspaceId, input.requestId, input.requestKey,
        input.certificationId, versionAfter, action,
        JSON.stringify({ ...metadata, request_digest: input.requestDigest, raw_source_payload_stored: false })],
    );
  }

  private async loadDetail(
    queryable: Queryable,
    workspaceId: string,
    certificationId: string,
  ): Promise<SandboxCertificationDetail> {
    const certification = await queryable.query<SandboxCertificationRow>(
      `SELECT * FROM governance_sandbox_certifications
       WHERE workspace_id = $1 AND certification_id = $2`,
      [workspaceId, certificationId],
    );
    if (!certification.rows[0]) throw this.problem("SANDBOX_CERTIFICATION_NOT_FOUND", 404);
    const evidence = await queryable.query<SandboxStepEvidenceRow>(
      `SELECT DISTINCT ON (step_key)
              evidence_id, step_key, source_authority, evaluation_state, evidence_hash,
              evidence_schema_version, source_verification_state, summary, as_of,
              expires_at, capability_snapshot_id, source_cursor, projection_epoch,
              projection_sequence::text, created_at
       FROM governance_sandbox_step_evidence
       WHERE workspace_id = $1 AND certification_id = $2
       ORDER BY step_key, created_at DESC, evidence_id DESC`,
      [workspaceId, certificationId],
    );
    const findings = await queryable.query<SandboxFindingRow>(
      `SELECT finding_id, severity, source_authority, finding_code, summary, blocking,
              evidence_hash, as_of, resolved_at, created_at
       FROM governance_sandbox_findings
       WHERE workspace_id = $1 AND certification_id = $2
       ORDER BY created_at, finding_id LIMIT 50`,
      [workspaceId, certificationId],
    );
    const findingCount = await queryable.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM governance_sandbox_findings
       WHERE workspace_id = $1 AND certification_id = $2`,
      [workspaceId, certificationId],
    );
    const events = await queryable.query<SandboxEventRow>(
      `SELECT event_id, actor_user_id, action, workflow_version_before,
              workflow_version_after, metadata_json, created_at
       FROM governance_sandbox_certification_events
       WHERE workspace_id = $1 AND certification_id = $2
       ORDER BY created_at, event_id LIMIT 250`,
      [workspaceId, certificationId],
    );
    const eventCount = await queryable.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM governance_sandbox_certification_events
       WHERE workspace_id = $1 AND certification_id = $2`,
      [workspaceId, certificationId],
    );
    const plans = await queryable.query<SandboxPromotionPlanRow>(
      `SELECT plan_id, actor_user_id, request_key, expected_workflow_version,
              target_stage, evidence_set_hash, status, blocker_codes,
              source_side_effect_requested, created_at
       FROM governance_sandbox_promotion_plans
       WHERE workspace_id = $1 AND certification_id = $2
       ORDER BY created_at DESC, plan_id DESC LIMIT 20`,
      [workspaceId, certificationId],
    );
    return {
      certification: certification.rows[0],
      evidence: evidence.rows,
      findings: findings.rows,
      findingsTotal: Number(findingCount.rows[0].count),
      events: events.rows,
      eventsTotal: Number(eventCount.rows[0].count),
      promotionPlans: plans.rows,
    };
  }

  private async withSerializable<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const client = await this.pool.connect();
      try {
        await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
        const result = await work(client);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        const code = this.code(error);
        const retryableConstraints = [
          "governance_sandbox_event_request_key_unique",
          "governance_sandbox_certifications_workspace_id_deployment_id_key",
          "governance_sandbox_certifications_promotion_grant_id_key",
          "governance_sandbox_promotion_plans_workspace_id_actor_user_id_request_key_key",
        ];
        const retryable = code === "40001" || code === "40P01" || (
          code === "23505" && retryableConstraints.includes(this.constraint(error))
        );
        if (retryable && attempt < 3) {
          await new Promise((resolve) => setTimeout(resolve, attempt * 10));
          continue;
        }
        throw error;
      } finally {
        client.release();
      }
    }
    throw new Error("sandbox certification transaction retry budget exhausted");
  }

  private code(error: unknown): string {
    return typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  }

  private constraint(error: unknown): string {
    return typeof error === "object" && error !== null && "constraint" in error
      ? String((error as { constraint?: unknown }).constraint ?? "")
      : "";
  }

  private problem(code: string, status: number, details?: Record<string, unknown>): GovernanceError {
    return new GovernanceError(code, code.replaceAll("_", " ").toLowerCase(), status, details);
  }
}
