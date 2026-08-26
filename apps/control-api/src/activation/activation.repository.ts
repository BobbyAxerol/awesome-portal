import { Inject, Injectable } from "@nestjs/common";
import { Pool, PoolClient } from "pg";
import { GovernanceError } from "../governance/governance.service";
import { CONTROL_API_POOL } from "../tokens";
import {
  ActivationCapability,
  DeliveryProfile,
  StagedActivationPlanRequest,
} from "./contracts";

export interface ActivationCapabilityRow extends Record<string, unknown> {
  workspace_id: string;
  capability_key: ActivationCapability;
  effective_profile: "fixture";
  desired_profile: DeliveryProfile;
  capability_version: number;
  source_enabled: false;
  runtime_enabled: false;
  kill_switch_engaged: true;
  last_plan_id: string | null;
  updated_by_user_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface ActivationPlanRow extends Record<string, unknown> {
  plan_id: string;
  workspace_id: string;
  capability_key: ActivationCapability;
  actor_user_id: string;
  actor_username: string;
  request_key: string;
  request_digest: string;
  action: "PROMOTE" | "ROLLBACK";
  from_profile: DeliveryProfile;
  target_profile: DeliveryProfile;
  expected_capability_version: number;
  plan_version: number;
  status: "READY" | "BLOCKED" | "DENIED" | "APPLIED" | "VERIFIED";
  blocker_codes: string[];
  evidence_set_hash: string;
  compatibility_set_hash: string;
  reason: string;
  source_side_effect_requested: false;
  runtime_activation_requested: false;
  owner_artifact_imported: false;
  expires_at: Date;
  applied_at: Date | null;
  verified_at: Date | null;
  resulting_capability_version: number | null;
  created_at: Date;
  updated_at: Date;
}

export interface ActivationEvidenceRow extends Record<string, unknown> {
  ordinal: number;
  evidence_kind: string;
  reference_id: string;
  artifact_digest: string;
  schema_version: string;
  signer_fingerprint: string;
  detached_signature: string;
  compatibility_revision: string;
  expires_at: Date;
  structure_valid: true;
  owner_accepted: false;
  trusted_for_activation: false;
}

export interface ActivationRequirementRow extends Record<string, unknown> {
  ordinal: number;
  requirement_kind: string;
  component: string;
  exact_revision: string;
  expected_digest: string;
}

export interface ActivationPlanSnapshot {
  plan: ActivationPlanRow;
  capability: ActivationCapabilityRow;
  evidence: ActivationEvidenceRow[];
  requirements: ActivationRequirementRow[];
}

interface PlanWrite {
  planId: string;
  actorUserId: string;
  actorUsername: string;
  requestId: string;
  requestDigest: string;
  evidenceSetHash: string;
  compatibilitySetHash: string;
  status: "READY" | "BLOCKED" | "DENIED";
  blockers: string[];
  expiresAt: Date;
  request: StagedActivationPlanRequest;
}

interface TransitionWrite {
  workspaceId: string;
  planId: string;
  actorUserId: string;
  requestKey: string;
  requestId: string;
  expectedPlanVersion: number;
  expectedCapabilityVersion: number;
  eventId: string;
  auditEventId: string;
  outboxMessageId: string;
}

@Injectable()
export class ActivationRepository {
  constructor(@Inject(CONTROL_API_POOL) readonly pool: Pool) {}

  async listCapabilities(workspaceId: string): Promise<ActivationCapabilityRow[]> {
    const result = await this.pool.query<ActivationCapabilityRow>(
      `SELECT * FROM execution_activation_capabilities
       WHERE workspace_id = $1 ORDER BY capability_key`,
      [workspaceId],
    );
    return result.rows;
  }

  async detail(workspaceId: string, planId: string): Promise<ActivationPlanSnapshot> {
    return this.snapshot(this.pool, workspaceId, planId);
  }

  async createPlan(input: PlanWrite): Promise<{ snapshot: ActivationPlanSnapshot; replayed: boolean }> {
    return this.serializable(async (client) => {
      const replay = await client.query<ActivationPlanRow>(
        `SELECT * FROM execution_activation_plans
         WHERE workspace_id = $1 AND actor_user_id = $2 AND request_key = $3`,
        [input.request.workspace_id, input.actorUserId, input.request.request_key],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_digest !== input.requestDigest) {
          throw this.problem("REQUEST_KEY_ACTIVATION_PLAN_CONFLICT", 409);
        }
        return {
          snapshot: await this.snapshot(client, input.request.workspace_id, replay.rows[0].plan_id),
          replayed: true,
        };
      }

      const capability = await this.lockCapability(
        client,
        input.request.workspace_id,
        input.request.capability_key,
        input.actorUserId,
      );
      if (capability.capability_version !== input.request.expected_capability_version) {
        throw new GovernanceError(
          "ACTIVATION_CAPABILITY_VERSION_CONFLICT",
          "Activation capability version changed.",
          409,
          { current_capability_version: capability.capability_version },
        );
      }

      await client.query(
        `INSERT INTO execution_activation_plans
           (plan_id, workspace_id, capability_key, actor_user_id, actor_username,
            request_key, request_digest, action, from_profile, target_profile,
            expected_capability_version, status, blocker_codes, evidence_set_hash,
            compatibility_set_hash, reason, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
        [input.planId, input.request.workspace_id, input.request.capability_key,
          input.actorUserId, input.actorUsername, input.request.request_key,
          input.requestDigest, input.request.action, capability.effective_profile,
          input.request.target_profile, input.request.expected_capability_version,
          input.status, input.blockers, input.evidenceSetHash,
          input.compatibilitySetHash, input.request.reason, input.expiresAt],
      );
      for (const [ordinal, evidence] of input.request.evidence_refs.entries()) {
        await client.query(
          `INSERT INTO execution_activation_evidence_refs
             (plan_id, ordinal, evidence_kind, reference_id, artifact_digest,
              schema_version, signer_fingerprint, detached_signature,
              compatibility_revision, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [input.planId, ordinal, evidence.kind, evidence.reference_id,
            evidence.artifact_digest, evidence.schema_version,
            evidence.signer_fingerprint, evidence.detached_signature,
            evidence.compatibility_revision, new Date(evidence.expires_at)],
        );
      }
      for (const [ordinal, requirement] of input.request.compatibility_requirements.entries()) {
        await client.query(
          `INSERT INTO execution_activation_compatibility_requirements
             (plan_id, ordinal, requirement_kind, component, exact_revision, expected_digest)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [input.planId, ordinal, requirement.kind, requirement.component,
            requirement.exact_revision, requirement.expected_digest],
        );
      }
      await this.writeEvent(client, {
        eventId: `evt_${input.planId.slice(5)}`,
        planId: input.planId,
        workspaceId: input.request.workspace_id,
        capabilityKey: input.request.capability_key,
        actorUserId: input.actorUserId,
        requestKey: input.request.request_key,
        action: "PLAN",
        planBefore: 0,
        planAfter: 1,
        capabilityBefore: capability.capability_version,
        capabilityAfter: capability.capability_version,
        result: input.status,
        blockers: input.blockers,
      });
      await this.writeAuditAndOutbox(client, {
        eventId: `aud_${input.planId.slice(5)}`,
        messageId: `msg_${input.planId.slice(5)}`,
        operation: "plan",
        result: input.status,
        planId: input.planId,
        workspaceId: input.request.workspace_id,
        actorUserId: input.actorUserId,
        requestId: input.requestId,
        requestKey: input.request.request_key,
        planVersion: 1,
        capabilityKey: input.request.capability_key,
        blockers: input.blockers,
      });
      return { snapshot: await this.snapshot(client, input.request.workspace_id, input.planId), replayed: false };
    });
  }

  async apply(input: TransitionWrite): Promise<{ snapshot: ActivationPlanSnapshot; replayed: boolean }> {
    return this.transition(input, "APPLY");
  }

  async verify(input: TransitionWrite): Promise<{ snapshot: ActivationPlanSnapshot; replayed: boolean }> {
    return this.transition(input, "VERIFY");
  }

  private async transition(
    input: TransitionWrite,
    action: "APPLY" | "VERIFY",
  ): Promise<{ snapshot: ActivationPlanSnapshot; replayed: boolean }> {
    return this.serializable(async (client) => {
      const replay = await client.query<{ plan_id: string; action: string }>(
        `SELECT plan_id, action FROM execution_activation_events
         WHERE workspace_id = $1 AND actor_user_id = $2 AND request_key = $3`,
        [input.workspaceId, input.actorUserId, input.requestKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].plan_id !== input.planId || replay.rows[0].action !== action) {
          throw this.problem("REQUEST_KEY_ACTIVATION_TRANSITION_CONFLICT", 409);
        }
        return { snapshot: await this.snapshot(client, input.workspaceId, input.planId), replayed: true };
      }

      const planResult = await client.query<ActivationPlanRow>(
        `SELECT * FROM execution_activation_plans
         WHERE workspace_id = $1 AND plan_id = $2 FOR UPDATE`,
        [input.workspaceId, input.planId],
      );
      const plan = planResult.rows[0];
      if (!plan) throw this.problem("ACTIVATION_PLAN_NOT_FOUND", 404);
      const capability = await this.lockCapability(
        client,
        input.workspaceId,
        plan.capability_key,
        input.actorUserId,
      );
      if (plan.plan_version !== input.expectedPlanVersion) {
        throw new GovernanceError("ACTIVATION_PLAN_VERSION_CONFLICT", "Activation plan version changed.", 409, {
          current_plan_version: plan.plan_version,
        });
      }
      if (capability.capability_version !== input.expectedCapabilityVersion) {
        throw new GovernanceError("ACTIVATION_CAPABILITY_VERSION_CONFLICT", "Activation capability version changed.", 409, {
          current_capability_version: capability.capability_version,
        });
      }
      if (plan.expires_at <= new Date()) throw this.problem("ACTIVATION_PLAN_EXPIRED", 409);

      let planVersionAfter = plan.plan_version + 1;
      let capabilityVersionAfter = capability.capability_version;
      if (action === "APPLY") {
        if (plan.status !== "READY") {
          throw new GovernanceError("ACTIVATION_PLAN_BLOCKED", "Activation plan is not applicable.", 409, {
            blocker_codes: plan.blocker_codes,
          });
        }
        if (plan.action !== "ROLLBACK" || plan.target_profile !== "fixture") {
          throw this.problem("N13B_OWNER_ACCEPTANCE_REQUIRED", 409);
        }
        capabilityVersionAfter += 1;
        await client.query(
          `UPDATE execution_activation_capabilities SET
             effective_profile = 'fixture', desired_profile = 'fixture',
             capability_version = $3, source_enabled = false, runtime_enabled = false,
             kill_switch_engaged = true, last_plan_id = $4,
             updated_by_user_id = $5, updated_at = now()
           WHERE workspace_id = $1 AND capability_key = $2`,
          [input.workspaceId, plan.capability_key, capabilityVersionAfter, plan.plan_id, input.actorUserId],
        );
        await client.query(
          `UPDATE execution_activation_plans SET status = 'APPLIED', plan_version = $3,
             applied_at = now(), resulting_capability_version = $4, updated_at = now()
           WHERE workspace_id = $1 AND plan_id = $2`,
          [input.workspaceId, input.planId, planVersionAfter, capabilityVersionAfter],
        );
      } else {
        if (plan.status !== "APPLIED" || plan.resulting_capability_version !== capability.capability_version) {
          throw this.problem("ACTIVATION_PLAN_NOT_VERIFIABLE", 409);
        }
        if (
          capability.effective_profile !== "fixture" || capability.desired_profile !== "fixture" ||
          capability.source_enabled || capability.runtime_enabled || !capability.kill_switch_engaged
        ) {
          throw this.problem("SOURCE_DARK_INVARIANT_FAILED", 409);
        }
        await client.query(
          `UPDATE execution_activation_plans SET status = 'VERIFIED', plan_version = $3,
             verified_at = now(), updated_at = now()
           WHERE workspace_id = $1 AND plan_id = $2`,
          [input.workspaceId, input.planId, planVersionAfter],
        );
      }

      const result = action === "APPLY" ? "APPLIED" : "VERIFIED";
      await this.writeEvent(client, {
        eventId: input.eventId,
        planId: input.planId,
        workspaceId: input.workspaceId,
        capabilityKey: plan.capability_key,
        actorUserId: input.actorUserId,
        requestKey: input.requestKey,
        action,
        planBefore: plan.plan_version,
        planAfter: planVersionAfter,
        capabilityBefore: capability.capability_version,
        capabilityAfter: capabilityVersionAfter,
        result,
        blockers: [],
      });
      await this.writeAuditAndOutbox(client, {
        eventId: input.auditEventId,
        messageId: input.outboxMessageId,
        operation: action.toLowerCase(),
        result,
        planId: input.planId,
        workspaceId: input.workspaceId,
        actorUserId: input.actorUserId,
        requestId: input.requestId,
        requestKey: input.requestKey,
        planVersion: planVersionAfter,
        capabilityKey: plan.capability_key,
        blockers: [],
      });
      return { snapshot: await this.snapshot(client, input.workspaceId, input.planId), replayed: false };
    });
  }

  private async lockCapability(
    client: PoolClient,
    workspaceId: string,
    capabilityKey: ActivationCapability,
    actorUserId: string,
  ): Promise<ActivationCapabilityRow> {
    await client.query(
      `INSERT INTO execution_activation_capabilities
         (workspace_id, capability_key, updated_by_user_id)
       VALUES ($1, $2, $3) ON CONFLICT (workspace_id, capability_key) DO NOTHING`,
      [workspaceId, capabilityKey, actorUserId],
    );
    const result = await client.query<ActivationCapabilityRow>(
      `SELECT * FROM execution_activation_capabilities
       WHERE workspace_id = $1 AND capability_key = $2 FOR UPDATE`,
      [workspaceId, capabilityKey],
    );
    if (!result.rows[0]) throw this.problem("ACTIVATION_CAPABILITY_NOT_FOUND", 404);
    return result.rows[0];
  }

  private async snapshot(client: Pool | PoolClient, workspaceId: string, planId: string): Promise<ActivationPlanSnapshot> {
    const plan = await client.query<ActivationPlanRow>(
      `SELECT * FROM execution_activation_plans WHERE workspace_id = $1 AND plan_id = $2`,
      [workspaceId, planId],
    );
    if (!plan.rows[0]) throw this.problem("ACTIVATION_PLAN_NOT_FOUND", 404);
    const capability = await client.query<ActivationCapabilityRow>(
      `SELECT * FROM execution_activation_capabilities
       WHERE workspace_id = $1 AND capability_key = $2`,
      [workspaceId, plan.rows[0].capability_key],
    );
    const evidence = await client.query<ActivationEvidenceRow>(
      `SELECT ordinal, evidence_kind, reference_id, artifact_digest, schema_version,
              signer_fingerprint, detached_signature, compatibility_revision,
              expires_at, structure_valid, owner_accepted, trusted_for_activation
       FROM execution_activation_evidence_refs WHERE plan_id = $1 ORDER BY ordinal`,
      [planId],
    );
    const requirements = await client.query<ActivationRequirementRow>(
      `SELECT ordinal, requirement_kind, component, exact_revision, expected_digest
       FROM execution_activation_compatibility_requirements WHERE plan_id = $1 ORDER BY ordinal`,
      [planId],
    );
    return { plan: plan.rows[0], capability: capability.rows[0], evidence: evidence.rows, requirements: requirements.rows };
  }

  private async writeEvent(client: PoolClient, event: {
    eventId: string; planId: string; workspaceId: string; capabilityKey: string;
    actorUserId: string; requestKey: string; action: string; planBefore: number;
    planAfter: number; capabilityBefore: number; capabilityAfter: number;
    result: string; blockers: string[];
  }): Promise<void> {
    await client.query(
      `INSERT INTO execution_activation_events
         (event_id, plan_id, workspace_id, capability_key, actor_user_id,
          request_key, action, plan_version_before, plan_version_after,
          capability_version_before, capability_version_after, result, blocker_codes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [event.eventId, event.planId, event.workspaceId, event.capabilityKey,
        event.actorUserId, event.requestKey, event.action, event.planBefore,
        event.planAfter, event.capabilityBefore, event.capabilityAfter,
        event.result, event.blockers],
    );
  }

  private async writeAuditAndOutbox(client: PoolClient, input: {
    eventId: string; messageId: string; operation: string; result: string;
    planId: string; workspaceId: string; actorUserId: string; requestId: string;
    requestKey: string; planVersion: number; capabilityKey: string; blockers: string[];
  }): Promise<void> {
    const idempotency = `activation:${input.operation}:${input.workspaceId}:${input.actorUserId}:${input.requestKey}`;
    const metadata = {
      capability_key: input.capabilityKey,
      status: input.result,
      blocker_codes: input.blockers,
      source_side_effect_requested: false,
      runtime_activation_requested: false,
      owner_artifact_imported: false,
    };
    await client.query(
      `INSERT INTO product_audit_events
         (event_id, event_type, actor_user_id, workspace_id, request_id,
          idempotency_key, aggregate_type, aggregate_id, aggregate_version,
          result, reason_code, metadata_json)
       VALUES ($1, $2, $3, $4, $5, $6, 'execution_activation_plan', $7, $8,
               $9, $10, $11)`,
      [input.eventId, `execution.activation.${input.operation}`, input.actorUserId,
        input.workspaceId, input.requestId, idempotency, input.planId,
        input.planVersion, input.result === "DENIED" ? "DENIED" : "SUCCESS",
        `SOURCE_DARK_${input.result}`, JSON.stringify(metadata)],
    );
    await client.query(
      `INSERT INTO outbox_messages
         (message_id, idempotency_key, aggregate_type, aggregate_id, event_type,
          actor_user_id, workspace_id, request_id, payload_json, state)
       VALUES ($1, $2, 'execution_activation_plan', $3, $4, $5, $6, $7, $8, 'PENDING')`,
      [input.messageId, idempotency, input.planId, `execution.activation.${input.operation}`,
        input.actorUserId, input.workspaceId, input.requestId, JSON.stringify(metadata)],
    );
  }

  private async serializable<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const client = await this.pool.connect();
      try {
        await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
        const result = await work(client);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        const code = typeof error === "object" && error !== null && "code" in error
          ? String((error as { code?: unknown }).code ?? "") : "";
        if ((code === "40001" || code === "40P01") && attempt < 3) {
          await new Promise((resolve) => setTimeout(resolve, attempt * 10));
          continue;
        }
        throw error;
      } finally {
        client.release();
      }
    }
    throw new Error("activation transaction retry budget exhausted");
  }

  private problem(code: string, status: number): GovernanceError {
    return new GovernanceError(code, code.replaceAll("_", " ").toLowerCase(), status);
  }
}
