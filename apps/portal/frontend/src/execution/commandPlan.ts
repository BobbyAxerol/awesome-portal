/**
 * EX-BE-05b/F0 — the command plan, which is a blocked preview and nothing else.
 *
 * Every field that decides how this renders is a CONSTANT in the schema, and
 * reading them as constants would be the mistake. They are read as data:
 *
 *   status                       const BLOCKED
 *   apply_token                  const null
 *   relay_capability             const DISABLED
 *   source_side_effect_requested const false
 *   payload_storage_policy       const HASH_ONLY_NO_RAW
 *
 * F0 is contract-only, so a plan here proves the request was understood and
 * refused — not that anything was queued, reserved or attempted at the source.
 * A screen that treated `operation_id` as evidence of work started would be
 * wrong in the most expensive direction: an operator who believes a live
 * command is in flight does not issue it again, and does not escalate.
 *
 * `payload_storage_policy: HASH_ONLY_NO_RAW` is the other half of that. The API
 * stores a hash and never the values, so it cannot return them — and this
 * client must never echo a rejected payload back either. A sensitive field
 * refused by the server, quoted in an error message, is the exact leak the
 * policy exists to prevent.
 */
import type { CatalogRiskTier } from "./adminCatalog";
import { CATALOG_RISK_TIERS } from "./adminCatalog";
import type { TypedCondition } from "./components/conditions";
import { toConditionWire, type ConditionWire } from "./conditionWire";

function obj(raw: unknown): Record<string, unknown> | null {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;
}

function str(raw: unknown): string | null {
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

function codes(raw: unknown): readonly string[] {
  return Array.isArray(raw) ? raw.filter((c): c is string => typeof c === "string") : [];
}

export const PLAN_ENVIRONMENTS = ["PAPER", "SANDBOX", "LIVE"] as const;
export type PlanEnvironment = (typeof PLAN_ENVIRONMENTS)[number];

export interface CommandPlanRequestInput {
  workspaceId: string;
  requestKey: string;
  /** `noun/verb`, the catalogue's own key. */
  commandKey: string;
  environment: PlanEnvironment;
  target: { type: string; id: string };
  expectedTargetVersion: number;
  /** Hashed and discarded server-side; never returned, never echoed. */
  payload: Record<string, unknown>;
  conditions?: readonly TypedCondition[];
}

export interface CommandPlan {
  operationId: string;
  commandKey: string;
  riskTier: CatalogRiskTier | null;
  /** `BLOCKED` in F0. Read, so a later status is reported rather than assumed. */
  status: string | null;
  blockers: readonly string[];
  warnings: readonly string[];
  /**
   * `null` in F0, and the field the whole screen turns on. No token, no apply.
   * Read rather than assumed so a token that appears is honoured, and a token
   * that does not cannot be invented.
   */
  applyToken: string | null;
  expiresAt: string | null;
  relayCapability: string | null;
  /** `false` in F0: nothing was asked of the Trading System. */
  sourceSideEffectRequested: boolean;
  payloadStoragePolicy: string | null;
  payloadHash: string | null;
  planDigest: string | null;
  /** The server recognised this request key and returned the existing plan. */
  replayed: boolean;
}

export function readCommandPlan(raw: unknown): CommandPlan | null {
  const o = obj(raw);
  const operationId = str(o?.operation_id);
  if (!o || !operationId) return null;
  const tier = str(o.risk_tier);
  return {
    operationId,
    commandKey: str(o.command_key) ?? "",
    riskTier:
      tier && (CATALOG_RISK_TIERS as readonly string[]).includes(tier)
        ? (tier as CatalogRiskTier)
        : null,
    status: str(o.status),
    blockers: codes(o.blockers),
    warnings: codes(o.warnings),
    applyToken: str(o.apply_token),
    expiresAt: str(o.expires_at),
    relayCapability: str(o.relay_capability),
    // Deny-by-default in the honest direction: absent means nothing was asked
    // of the source, which is the claim F0 makes.
    sourceSideEffectRequested: o.source_side_effect_requested === true,
    payloadStoragePolicy: str(o.payload_storage_policy),
    payloadHash: str(o.payload_hash),
    planDigest: str(o.plan_digest),
    replayed: o.replayed === true,
  };
}

/**
 * May this plan be applied?
 *
 * One question, one answer, and the answer is never derived from `status`
 * alone. A plan is applicable only with a token; F0 publishes none, so nothing
 * here is. Stated as a function because three places would otherwise each
 * decide it, and the day a token does arrive they would disagree.
 */
export function planApplicable(plan: CommandPlan | null): { allowed: boolean; reason: string } {
  if (!plan) return { allowed: false, reason: "No plan has been made." };
  if (!plan.applyToken) {
    return {
      allowed: false,
      reason:
        plan.relayCapability === "DISABLED"
          ? "The command relay is disabled, so this plan was refused rather than prepared. There is nothing to apply."
          : "This plan carries no apply token, so it cannot be applied.",
    };
  }
  if (plan.blockers.length > 0) {
    return { allowed: false, reason: "This plan is blocked and cannot be applied." };
  }
  return { allowed: true, reason: "" };
}

/**
 * What the plan proves, said plainly.
 *
 * The sentence exists because `operation_id` looks like work started and is
 * not. In F0 a plan means the request was understood and refused.
 */
export function planOutcomeText(plan: CommandPlan): string {
  if (plan.sourceSideEffectRequested) {
    return "This plan asked the Trading System to act. Verify before assuming the outcome.";
  }
  return "Nothing was asked of the Trading System. This plan records that the request was understood and refused — it is not work in progress.";
}

/**
 * Build the request body.
 *
 * `payload` travels once and is hashed server-side. Nothing here keeps a copy
 * for an error message, which is the rule `HASH_ONLY_NO_RAW` implies for the
 * client: a value the API refuses to store is a value this screen must not
 * repeat back.
 */
export function commandPlanRequest(
  input: CommandPlanRequestInput,
):
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; reason: string } {
  let conditions: ConditionWire[] = [];
  if (input.conditions && input.conditions.length > 0) {
    const wire = toConditionWire(input.conditions);
    if (!wire.ok) return { ok: false, reason: wire.reason };
    conditions = wire.value;
  }
  return {
    ok: true,
    value: {
      schema_version: "execution.command-plan-request.v1",
      workspace_id: input.workspaceId,
      request_key: input.requestKey,
      command_type: "EXECUTION_COMMAND",
      command_version: 1,
      command_key: input.commandKey,
      environment: input.environment,
      target: { type: input.target.type, id: input.target.id },
      expected_target_version: input.expectedTargetVersion,
      payload: input.payload,
      conditions,
    },
  };
}

/* ---------------------------------------------------------------------------
 * Payload rejections, told without repeating the payload
 * ------------------------------------------------------------------------ */

export const PAYLOAD_REJECTIONS = [
  "SENSITIVE_PAYLOAD_FIELD_FORBIDDEN",
  "PAYLOAD_LIMIT_EXCEEDED",
  "PAYLOAD_INVALID_JSON_VALUE",
] as const;
export type PayloadRejection = (typeof PAYLOAD_REJECTIONS)[number];

/**
 * What to tell the operator when their payload is refused.
 *
 * Written here, and deliberately naming NOTHING from the payload — not the key,
 * not the value, not the length. `HASH_ONLY_NO_RAW` exists so the server never
 * stores those values; a client that quoted them back into an error message
 * would put them into a screenshot, a support ticket and a log, which is the
 * same leak by a slower route.
 *
 * The guidance is about shape rather than content, which is enough to act on:
 * an operator who is told a field looks like a credential knows which one they
 * added.
 */
const REJECTION_TEXT: Record<PayloadRejection, string> = {
  SENSITIVE_PAYLOAD_FIELD_FORBIDDEN:
    "One field in this request is named like a credential or secret. The Portal never stores raw payload values, so it refuses to carry one. Remove that field and plan again.",
  PAYLOAD_LIMIT_EXCEEDED:
    "This request is larger than one command may carry. Reduce the number of fields, the nesting, or the length of a value, and plan again.",
  PAYLOAD_INVALID_JSON_VALUE:
    "This request contains a value that cannot be represented safely — an infinity, a NaN, or a type the command envelope does not accept.",
};

export interface PayloadFailure {
  code: PayloadRejection;
  reason: string;
}

/**
 * Recognise a payload rejection, or `null` when the failure is something else.
 *
 * Reads the CODE only. The server's message may legitimately name a field for
 * its own logs, and passing that through is the leak this function exists to
 * prevent — so the message is never read at all.
 */
export function readPayloadRejection(raw: unknown, httpStatus = 422): PayloadFailure | null {
  const body = obj(raw) ?? {};
  const envelope = obj(body.envelope) ?? body;
  const error = obj(envelope.error) ?? {};
  const code = str(error.code);
  if (!code || !(PAYLOAD_REJECTIONS as readonly string[]).includes(code)) return null;
  void httpStatus;
  return { code: code as PayloadRejection, reason: REJECTION_TEXT[code as PayloadRejection] };
}

/* ---------------------------------------------------------------------------
 * A denied apply, and the two facts that make it safe to act on
 * ------------------------------------------------------------------------ */

export interface RelayDenial {
  operationId: string | null;
  reason: string | null;
  /**
   * Whether the operator may try again. `false` is not "give up" — it means
   * this exact request will be refused identically, so retrying is noise.
   */
  retryAllowed: boolean;
  /**
   * Whether anything reached the Trading System before the refusal.
   *
   * The single most important field on this object. `false` means nothing
   * happened and the operator is free to do something else; `true` with
   * `retryAllowed: false` means a request is out there whose outcome is
   * unknown, and the safe move is to verify rather than reissue.
   */
  sourceRequestSent: boolean;
  /** What the screen says. Built here so no caller can compose a softer one. */
  text: string;
}

export function readRelayDenial(raw: unknown): RelayDenial | null {
  const o = obj(raw);
  const envelope = obj(o?.envelope) ?? o;
  if (!envelope) return null;
  const decision = str(envelope.decision);
  const error = obj(envelope.error);
  // Accept the denial document, or a problem body carrying the same code.
  if (decision !== "DENIED" && str(error?.code) !== "COMMAND_RELAY_DISABLED") return null;

  // Deny-by-default in the honest direction on both flags: an unreadable
  // `source_request_sent` must not be reported as "nothing happened", and an
  // unreadable `retry_allowed` must not invite a retry.
  const sourceRequestSent = envelope.source_request_sent !== false;
  const retryAllowed = envelope.retry_allowed === true;

  return {
    operationId: str(envelope.operation_id),
    reason: str(envelope.reason) ?? str(error?.code),
    retryAllowed,
    sourceRequestSent,
    text: sourceRequestSent
      ? "The apply was denied after a request had already reached the Trading System, so its outcome is unknown. Verify the target before issuing anything else — do not reissue this command."
      : retryAllowed
        ? "The apply was denied and nothing reached the Trading System. Nothing has changed, and this may be tried again."
        : "The apply was denied and nothing reached the Trading System. Nothing has changed, and retrying this request will be refused identically.",
  };
}
