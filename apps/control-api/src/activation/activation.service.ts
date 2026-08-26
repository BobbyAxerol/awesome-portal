import { createHash } from "crypto";
import { Inject, Injectable } from "@nestjs/common";
import { PortalUser } from "../domain";
import { GovernanceError } from "../governance/governance.service";
import { newUlid } from "../id";
import {
  ActivationPlanSnapshot,
  ActivationRepository,
} from "./activation.repository";
import {
  ACTIVATION_CAPABILITIES,
  ActivationCapability,
  DeliveryProfile,
  StagedActivationApplyRequest,
  StagedActivationPlanRequest,
  StagedActivationVerifyRequest,
} from "./contracts";

const PROFILE_ORDER: DeliveryProfile[] = [
  "fixture", "shadow", "paper", "sandbox", "live_canary", "live_full",
];
const PROMOTION_EVIDENCE = ["CONTRACT", "IMAGE", "SCHEMA", "QUALIFICATION", "ROLLBACK"];

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const item = value as Record<string, unknown>;
    return `{${Object.keys(item).sort().map((key) => `${JSON.stringify(key)}:${canonical(item[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonical(value), "utf8").digest("hex")}`;
}

function defaultCapability(workspaceId: string, capabilityKey: ActivationCapability) {
  return {
    workspace_id: workspaceId,
    capability_key: capabilityKey,
    effective_profile: "fixture" as const,
    desired_profile: "fixture" as const,
    capability_version: 1,
    source_enabled: false as const,
    runtime_enabled: false as const,
    kill_switch_engaged: true as const,
    last_plan_id: null,
    updated_by_user_id: null,
    created_at: null,
    updated_at: null,
  };
}

@Injectable()
export class ActivationService {
  constructor(@Inject(ActivationRepository) private readonly repository: ActivationRepository) {}

  async capabilities(user: PortalUser, workspaceId: string) {
    const rows = await this.repository.listCapabilities(workspaceId);
    const byKey = new Map(rows.map((row) => [row.capability_key, row]));
    return {
      schema_version: "execution.staged-activation-capabilities.v1",
      record_authority: "PORTAL",
      delivery_profile: "fixture",
      source_integration_state: "DARK",
      runtime_activation_requested: false,
      source_side_effect_requested: false,
      owner_artifact_imported: false,
      read_at: new Date().toISOString(),
      actor: { user_id: user.userId, username: user.username, roles: [user.role] },
      capabilities: ACTIVATION_CAPABILITIES.map((key) => this.publicCapability(byKey.get(key) ?? defaultCapability(workspaceId, key))),
    };
  }

  async plan(user: PortalUser, request: StagedActivationPlanRequest, requestId: string) {
    this.assertAdmin(user);
    const blockers = this.blockers(request);
    const status = blockers.includes("ILLEGAL_PROFILE_TRANSITION") || blockers.includes("INVALID_ROLLBACK_TARGET")
      ? "DENIED" as const
      : request.action === "ROLLBACK" && request.target_profile === "fixture"
        ? "READY" as const
        : "BLOCKED" as const;
    const normalizedEvidence = request.evidence_refs.map((item) => ({
      ...item,
      expires_at: new Date(item.expires_at).toISOString(),
    }));
    const normalizedRequirements = [...request.compatibility_requirements].sort((left, right) =>
      `${left.kind}:${left.component}`.localeCompare(`${right.kind}:${right.component}`));
    const planId = newUlid("actpl");
    const result = await this.repository.createPlan({
      planId,
      actorUserId: user.userId,
      actorUsername: user.username,
      requestId,
      requestDigest: digest({ ...request, evidence_refs: normalizedEvidence, compatibility_requirements: normalizedRequirements }),
      evidenceSetHash: digest(normalizedEvidence),
      compatibilitySetHash: digest(normalizedRequirements),
      status,
      blockers,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      request,
    });
    return this.publicSnapshot(user, result.snapshot, result.replayed);
  }

  async apply(
    user: PortalUser,
    planId: string,
    request: StagedActivationApplyRequest,
    requestId: string,
  ) {
    this.assertAdmin(user);
    const result = await this.repository.apply({
      workspaceId: request.workspace_id,
      planId,
      actorUserId: user.userId,
      requestKey: request.request_key,
      requestId,
      expectedPlanVersion: request.expected_plan_version,
      expectedCapabilityVersion: request.expected_capability_version,
      eventId: newUlid("actevt"),
      auditEventId: newUlid("aud"),
      outboxMessageId: newUlid("msg"),
    });
    return this.publicSnapshot(user, result.snapshot, result.replayed);
  }

  async verify(
    user: PortalUser,
    planId: string,
    request: StagedActivationVerifyRequest,
    requestId: string,
  ) {
    this.assertAdmin(user);
    const result = await this.repository.verify({
      workspaceId: request.workspace_id,
      planId,
      actorUserId: user.userId,
      requestKey: request.request_key,
      requestId,
      expectedPlanVersion: request.expected_plan_version,
      expectedCapabilityVersion: request.expected_capability_version,
      eventId: newUlid("actevt"),
      auditEventId: newUlid("aud"),
      outboxMessageId: newUlid("msg"),
    });
    return this.publicSnapshot(user, result.snapshot, result.replayed);
  }

  async detail(user: PortalUser, workspaceId: string, planId: string) {
    return this.publicSnapshot(user, await this.repository.detail(workspaceId, planId), false);
  }

  private blockers(request: StagedActivationPlanRequest): string[] {
    const blockers = new Set<string>();
    const current: DeliveryProfile = "fixture";
    if (request.action === "PROMOTE") {
      if (PROFILE_ORDER.indexOf(request.target_profile) !== PROFILE_ORDER.indexOf(current) + 1) {
        blockers.add("ILLEGAL_PROFILE_TRANSITION");
      }
      const kinds = new Set(request.evidence_refs.map((item) => item.kind));
      if (PROMOTION_EVIDENCE.some((kind) => !kinds.has(kind as never))) {
        blockers.add("EVIDENCE_PARTIAL");
      }
      if (request.evidence_refs.some((item) => new Date(item.expires_at) <= new Date())) {
        blockers.add("EVIDENCE_STALE");
      }
      for (const requirement of request.compatibility_requirements) {
        if (requirement.kind === "CAPABILITY") continue;
        const evidence = request.evidence_refs.find((item) => item.kind === requirement.kind);
        if (
          evidence &&
          (evidence.compatibility_revision !== requirement.exact_revision ||
            evidence.artifact_digest !== requirement.expected_digest)
        ) {
          blockers.add("CONTRACT_INCOMPATIBLE");
        }
      }
      blockers.add("OWNER_ACCEPTANCE_REQUIRED");
      blockers.add("N06_REAL_PAPER_EVIDENCE_REQUIRED");
      blockers.add("SOURCE_DARK_RUNTIME_LOCK");
    } else if (request.target_profile !== "fixture") {
      blockers.add("INVALID_ROLLBACK_TARGET");
    }
    return [...blockers].sort();
  }

  private publicSnapshot(user: PortalUser, snapshot: ActivationPlanSnapshot, replayed: boolean) {
    const { plan, capability, evidence, requirements } = snapshot;
    return {
      schema_version: "execution.staged-activation-plan.v1",
      record_authority: "PORTAL",
      delivery_profile: "fixture",
      source_integration_state: "DARK",
      source_side_effect_requested: false,
      runtime_activation_requested: false,
      owner_artifact_imported: false,
      replayed,
      read_at: new Date().toISOString(),
      actor: { user_id: user.userId, username: user.username, roles: [user.role] },
      plan: {
        plan_id: plan.plan_id,
        capability_key: plan.capability_key,
        action: plan.action,
        from_profile: plan.from_profile,
        target_profile: plan.target_profile,
        expected_capability_version: plan.expected_capability_version,
        plan_version: plan.plan_version,
        status: plan.expires_at <= new Date() && ["READY", "BLOCKED"].includes(plan.status)
          ? "EXPIRED" : plan.status,
        blocker_codes: plan.blocker_codes,
        evidence_set_hash: plan.evidence_set_hash,
        compatibility_set_hash: plan.compatibility_set_hash,
        reason: plan.reason,
        expires_at: plan.expires_at.toISOString(),
        applied_at: plan.applied_at?.toISOString() ?? null,
        verified_at: plan.verified_at?.toISOString() ?? null,
        resulting_capability_version: plan.resulting_capability_version,
        created_at: plan.created_at.toISOString(),
      },
      capability: this.publicCapability(capability),
      evidence_refs: evidence.map((item) => ({
        ordinal: item.ordinal,
        kind: item.evidence_kind,
        reference_id: item.reference_id,
        artifact_digest: item.artifact_digest,
        schema_version: item.schema_version,
        signer_fingerprint: item.signer_fingerprint,
        detached_signature_present: item.detached_signature.length > 0,
        compatibility_revision: item.compatibility_revision,
        expires_at: item.expires_at.toISOString(),
        structure_valid: item.structure_valid,
        owner_accepted: item.owner_accepted,
        trusted_for_activation: item.trusted_for_activation,
      })),
      compatibility_requirements: requirements.map((item) => ({
        ordinal: item.ordinal,
        kind: item.requirement_kind,
        component: item.component,
        exact_revision: item.exact_revision,
        expected_digest: item.expected_digest,
      })),
    };
  }

  private publicCapability(capability: ReturnType<typeof defaultCapability> | ActivationPlanSnapshot["capability"]) {
    return {
      capability_key: capability.capability_key,
      effective_profile: capability.effective_profile,
      desired_profile: capability.desired_profile,
      capability_version: capability.capability_version,
      source_enabled: false,
      runtime_enabled: false,
      kill_switch_engaged: true,
      last_plan_id: capability.last_plan_id,
      updated_at: capability.updated_at instanceof Date ? capability.updated_at.toISOString() : null,
    };
  }

  private assertAdmin(user: PortalUser): void {
    if (user.role !== "ADMIN") {
      throw new GovernanceError("ADMIN_ROLE_REQUIRED", "Access denied.", 403);
    }
  }
}
