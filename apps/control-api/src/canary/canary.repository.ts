import { Inject, Injectable } from "@nestjs/common";
import { Pool, PoolClient } from "pg";
import { GovernanceError } from "../governance/governance.service";
import {
  SandboxCertificationDetail,
  SandboxCertificationRepository,
  SandboxPromotionPlanRow,
} from "../sandbox/sandbox-certification.repository";
import { CONTROL_API_POOL } from "../tokens";

export interface CanaryEnvelopeRow extends Record<string, unknown> {
  envelope_id: string;
  workspace_id: string;
  deployment_id: string;
  certification_id: string;
  promotion_plan_id: string;
  revision: number;
  previous_envelope_id: string | null;
  base_risk_profile_revision: string;
  currency: string;
  capital_cap: string;
  gross_notional_cap: string;
  daily_loss_cap: string;
  max_open_orders: number;
  duration_days: number;
  status: "DRAFT";
  blocker_codes: string[];
  delivery_profile: "fixture";
  source_integration_state: "UNAVAILABLE";
  source_side_effect_requested: false;
  runtime_activation_requested: false;
  promotion_execution_requested: false;
  production_command_active: false;
  actor_user_id: string;
  request_key: string;
  request_digest: string;
  expected_certification_version: number;
  evidence_set_hash: string;
  reason: string;
  created_at: Date;
}

export interface CreateCanaryEnvelopeWrite {
  envelopeId: string;
  workspaceId: string;
  actorUserId: string;
  requestKey: string;
  requestDigest: string;
  requestId: string;
  auditEventId: string;
  deploymentId: string;
  certificationId: string;
  promotionPlanId: string;
  expectedCertificationVersion: number;
  expectedEvidenceSetHash: string;
  expectedLatestEnvelopeId: string | null;
  baseRiskProfileRevision: string;
  currency: string;
  capitalCap: string;
  grossNotionalCap: string;
  dailyLossCap: string;
  maxOpenOrders: number;
  durationDays: number;
  reason: string;
}

export interface CanaryLineage {
  certification: SandboxCertificationDetail;
  promotionPlan: SandboxPromotionPlanRow;
}

@Injectable()
export class CanaryRepository {
  constructor(
    @Inject(CONTROL_API_POOL) readonly pool: Pool,
    @Inject(SandboxCertificationRepository) private readonly certifications: SandboxCertificationRepository,
  ) {}

  async latestByDeployment(workspaceId: string, deploymentId: string): Promise<CanaryEnvelopeRow> {
    const result = await this.pool.query<CanaryEnvelopeRow>(
      `SELECT * FROM governance_canary_envelopes
       WHERE workspace_id = $1 AND deployment_id = $2
       ORDER BY revision DESC, envelope_id DESC LIMIT 1`,
      [workspaceId, deploymentId],
    );
    if (!result.rows[0]) throw this.problem("CANARY_ENVELOPE_NOT_FOUND", 404);
    return result.rows[0];
  }

  async create(
    input: CreateCanaryEnvelopeWrite,
    authorize: (lineage: CanaryLineage) => void,
  ): Promise<{ envelope: CanaryEnvelopeRow; lineage: CanaryLineage; replayed: boolean }> {
    const outcome = await this.withSerializable(async (client) => {
      const replay = await client.query<CanaryEnvelopeRow>(
        `SELECT * FROM governance_canary_envelopes
         WHERE workspace_id = $1 AND actor_user_id = $2 AND request_key = $3`,
        [input.workspaceId, input.actorUserId, input.requestKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_digest !== input.requestDigest) {
          throw this.problem("REQUEST_KEY_CANARY_ENVELOPE_CONFLICT", 409);
        }
        const lineage = await this.lineage(client, input.workspaceId, replay.rows[0]);
        return { envelope: replay.rows[0], lineage, replayed: true };
      }

      const certification = await this.certifications.detailByIdForUpdate(
        client,
        input.workspaceId,
        input.certificationId,
      );
      const promotion = await client.query<SandboxPromotionPlanRow>(
        `SELECT plan_id, actor_user_id, request_key, expected_workflow_version,
                target_stage, evidence_set_hash, status, blocker_codes,
                source_side_effect_requested, created_at
         FROM governance_sandbox_promotion_plans
         WHERE workspace_id = $1 AND certification_id = $2 AND plan_id = $3`,
        [input.workspaceId, input.certificationId, input.promotionPlanId],
      );
      if (!promotion.rows[0]) throw this.problem("CANARY_PROMOTION_PLAN_NOT_FOUND", 404);
      const lineage = { certification, promotionPlan: promotion.rows[0] };
      authorize(lineage);

      const latest = await client.query<CanaryEnvelopeRow>(
        `SELECT * FROM governance_canary_envelopes
         WHERE workspace_id = $1 AND deployment_id = $2
         ORDER BY revision DESC, envelope_id DESC LIMIT 1`,
        [input.workspaceId, input.deploymentId],
      );
      const predecessor = latest.rows[0] ?? null;
      if ((predecessor?.envelope_id ?? null) !== input.expectedLatestEnvelopeId) {
        throw new GovernanceError(
          "CANARY_ENVELOPE_PREDECESSOR_CONFLICT",
          "Canary envelope predecessor changed.",
          409,
          { expected: input.expectedLatestEnvelopeId, actual: predecessor?.envelope_id ?? null },
        );
      }
      const inserted = await client.query<CanaryEnvelopeRow>(
        `INSERT INTO governance_canary_envelopes
           (envelope_id, workspace_id, deployment_id, certification_id,
            promotion_plan_id, revision, previous_envelope_id,
            base_risk_profile_revision, currency, capital_cap,
            gross_notional_cap, daily_loss_cap, max_open_orders, duration_days,
            actor_user_id, request_key, request_digest,
            expected_certification_version, evidence_set_hash, reason)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
                 $10::numeric, $11::numeric, $12::numeric, $13, $14,
                 $15, $16, $17, $18, $19, $20)
         RETURNING *`,
        [input.envelopeId, input.workspaceId, input.deploymentId,
          input.certificationId, input.promotionPlanId,
          (predecessor?.revision ?? 0) + 1, predecessor?.envelope_id ?? null,
          input.baseRiskProfileRevision, input.currency, input.capitalCap,
          input.grossNotionalCap, input.dailyLossCap, input.maxOpenOrders,
          input.durationDays, input.actorUserId, input.requestKey,
          input.requestDigest, input.expectedCertificationVersion,
          input.expectedEvidenceSetHash, input.reason],
      );
      await client.query(
        `INSERT INTO product_audit_events
           (event_id, event_type, actor_user_id, workspace_id, request_id,
            idempotency_key, aggregate_type, aggregate_id, aggregate_version,
            result, reason_code, metadata_json)
         VALUES ($1, 'governance.canary_envelope.created', $2, $3, $4, $5,
                 'canary_envelope', $6, $7, 'SUCCESS', 'CANARY_ENVELOPE_DRAFTED', $8)`,
        [input.auditEventId, input.actorUserId, input.workspaceId, input.requestId,
          input.requestKey, inserted.rows[0].envelope_id, inserted.rows[0].revision,
          JSON.stringify({
            deployment_id: input.deploymentId,
            certification_id: input.certificationId,
            promotion_plan_id: input.promotionPlanId,
            evidence_set_hash: input.expectedEvidenceSetHash,
            source_side_effect_requested: false,
            runtime_activation_requested: false,
            promotion_execution_requested: false,
            raw_source_payload_stored: false,
          })],
      );
      return { envelope: inserted.rows[0], lineage, replayed: false };
    });
    return outcome;
  }

  async lineageFor(envelope: CanaryEnvelopeRow): Promise<CanaryLineage> {
    return this.lineage(this.pool, envelope.workspace_id, envelope);
  }

  private async lineage(
    client: Pool | PoolClient,
    workspaceId: string,
    envelope: CanaryEnvelopeRow,
  ): Promise<CanaryLineage> {
    const certification = await this.certifications.detailById(workspaceId, envelope.certification_id);
    const promotion = await client.query<SandboxPromotionPlanRow>(
      `SELECT plan_id, actor_user_id, request_key, expected_workflow_version,
              target_stage, evidence_set_hash, status, blocker_codes,
              source_side_effect_requested, created_at
       FROM governance_sandbox_promotion_plans
       WHERE workspace_id = $1 AND certification_id = $2 AND plan_id = $3`,
      [workspaceId, envelope.certification_id, envelope.promotion_plan_id],
    );
    if (!promotion.rows[0]) throw this.problem("CANARY_PROMOTION_PLAN_NOT_FOUND", 404);
    return { certification, promotionPlan: promotion.rows[0] };
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
        const constraint = this.constraint(error);
        const retryable = code === "40001" || code === "40P01" || (
          code === "23505" && [
            "governance_canary_request_key_unique",
            "governance_canary_revision_unique",
          ].includes(constraint)
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
    throw new Error("canary envelope transaction retry budget exhausted");
  }

  private code(error: unknown): string {
    return typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code ?? "") : "";
  }

  private constraint(error: unknown): string {
    return typeof error === "object" && error !== null && "constraint" in error
      ? String((error as { constraint?: unknown }).constraint ?? "") : "";
  }

  private problem(code: string, status: number): GovernanceError {
    return new GovernanceError(code, code.replaceAll("_", " ").toLowerCase(), status);
  }
}
