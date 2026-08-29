export const N16B_CURRENT_PROTECTIVE_ACCEPTANCE = Object.freeze({
  phase: "N16B" as const,
  status: "CURRENT_PRIMITIVE_COMPATIBILITY_ACCEPTED" as const,
  capabilityId: "live.emergency-close" as const,
  catalogKey: "ops/emergency-close" as const,
  environment: "LIVE" as const,
  sourceEnvironment: "LIVE_FULL" as const,
  targetTypes: ["ACCOUNT"] as const,
  mode: "live" as const,
  venue: "BINANCE" as const,
  product: "USD_M" as const,
  edgeIdentity: "portal-execution-command" as const,
  readIdentityForbidden: true as const,
  portalIdempotencyRequired: true as const,
  sourceIdempotent: false as const,
  automaticRetryAfterDispatch: false as const,
  requiresWebauthn: true as const,
  distinctApproverCount: 2 as const,
  runtimeActive: false as const,
});

export type N16bProtectivePlanInput = {
  command_key: string;
  environment: string;
  target: { type: string; id: string };
  payload: Record<string, unknown>;
};

export type N16bProtectiveClassification = {
  state: "ACCEPTED_CURRENT_PRIMITIVE" | "NOT_N16B_CAPABILITY" | "UNSUPPORTED_SCOPE";
  blocker: string | null;
  capability: {
    id: "live.emergency-close";
    source_environment: "LIVE_FULL";
    target_types: readonly ["ACCOUNT"];
    runtime_active: false;
    source_side_effect_requested: false;
  } | null;
};

function acceptedMetadata(): NonNullable<N16bProtectiveClassification["capability"]> {
  return {
    id: N16B_CURRENT_PROTECTIVE_ACCEPTANCE.capabilityId,
    source_environment: N16B_CURRENT_PROTECTIVE_ACCEPTANCE.sourceEnvironment,
    target_types: N16B_CURRENT_PROTECTIVE_ACCEPTANCE.targetTypes,
    runtime_active: false,
    source_side_effect_requested: false,
  };
}

function exactPayload(payload: Record<string, unknown>): boolean {
  const keys = Object.keys(payload).sort();
  if (keys.join(",") !== "confirmation,mode,product,reason,venue") return false;
  return payload.mode === N16B_CURRENT_PROTECTIVE_ACCEPTANCE.mode &&
    payload.venue === N16B_CURRENT_PROTECTIVE_ACCEPTANCE.venue &&
    payload.product === N16B_CURRENT_PROTECTIVE_ACCEPTANCE.product &&
    typeof payload.confirmation === "string" &&
    payload.confirmation.trim().length >= 8 &&
    payload.confirmation.length <= 128 &&
    typeof payload.reason === "string" &&
    payload.reason.trim().length >= 8 &&
    payload.reason.length <= 512;
}

/**
 * Classifies one Portal plan against the only source-as-is protective primitive
 * accepted in N16B. It never returns a route, hostname, source credential or an
 * active transport grant to the browser-facing control plane.
 */
export function classifyN16bProtectivePlan(
  input: N16bProtectivePlanInput,
): N16bProtectiveClassification {
  if (input.command_key !== N16B_CURRENT_PROTECTIVE_ACCEPTANCE.catalogKey) {
    return { state: "NOT_N16B_CAPABILITY", blocker: null, capability: null };
  }
  if (
    input.environment !== N16B_CURRENT_PROTECTIVE_ACCEPTANCE.environment ||
    input.target.type !== "ACCOUNT" ||
    input.target.id.length === 0
  ) {
    return {
      state: "UNSUPPORTED_SCOPE",
      blocker: "N16B_TARGET_SCOPE_UNSUPPORTED",
      capability: acceptedMetadata(),
    };
  }
  if (!exactPayload(input.payload)) {
    return {
      state: "UNSUPPORTED_SCOPE",
      blocker: "N16B_CURRENT_PRIMITIVE_PLAN_INVALID",
      capability: acceptedMetadata(),
    };
  }
  return {
    state: "ACCEPTED_CURRENT_PRIMITIVE",
    blocker: "N16B_RUNTIME_ACTIVATION_PENDING",
    capability: acceptedMetadata(),
  };
}

export function n16bCatalogueEntry<T extends Record<string, unknown>>(entry: T): T & {
  current_primitive_state?: string;
  current_capability_id?: string;
  accepted_environments?: readonly ["LIVE"];
  accepted_target_types?: readonly ["ACCOUNT"];
  runtime_active?: false;
} {
  if (entry.key !== N16B_CURRENT_PROTECTIVE_ACCEPTANCE.catalogKey) return entry;
  return {
    ...entry,
    blocked_reason: "N16B_RUNTIME_ACTIVATION_PENDING",
    source_route_state: "CURRENT_PRIMITIVE_CONFIRMED",
    current_primitive_state: "ACCEPTED_CURRENT_PRIMITIVE",
    current_capability_id: N16B_CURRENT_PROTECTIVE_ACCEPTANCE.capabilityId,
    accepted_environments: ["LIVE"] as const,
    accepted_target_types: N16B_CURRENT_PROTECTIVE_ACCEPTANCE.targetTypes,
    runtime_active: false,
    portal_reachable: false,
  };
}
