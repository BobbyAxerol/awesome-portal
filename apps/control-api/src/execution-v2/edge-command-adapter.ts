import { z } from "zod";
import type { AccessActor } from "./access.contract";
import { accessDigest } from "./access-policy";
import { commandIntent, type CommandIntent } from "./command.contract";
import { commandAuthorization, sourceCommandResult, type CommandAuthorization, type CommandTrust, type SourceCommandResult } from "./command-trust";
import { assertAmountPartition, pmText, utcMilliseconds } from "./foundation.contract";

/** PROPOSAL_SOURCE_ONLY: a local CommandTrust adapter, NOT an accepted Edge wire
 * schema, URL, issuer, transport or runtime binding. There is deliberately no
 * default gateway or AppModule registration. PM's two POST routes belong behind
 * Edge; they are not Core endpoints. Cryptographic verification, exact delivered
 * HTTP bytes, current human/workload checks through COMMIT and full source Outcome
 * custody remain the selected Edge gateway's responsibility. */
export const EDGE_CAPITAL_OPERATIONS = ["FUND", "INITIAL_GRANT", "TOP_UP", "IMMEDIATE_DECREASE",
  "RECALL_PARTIAL", "RECALL_FULL", "ADJUST_TARGET_BUDGET", "SET_ROOT_LIMIT"] as const;
const operation = z.enum(EDGE_CAPITAL_OPERATIONS), digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const sourceDigest = z.string().regex(/^[a-f0-9]{64}$/);
const selectionSchema = z.object({ gateway_ref: pmText, qualification: z.enum(["UNBOUND", "OWNER_VERIFIED", "TEST_ONLY"]),
  operations: z.array(operation).max(8).refine(values => new Set(values).size === values.length),
  recovery: z.enum(["UNCOMMISSIONED", "EXPLICIT_SERVICE_STATUS_ONLY"]) }).strict();
export type EdgeCommandSelection = z.infer<typeof selectionSchema>;
export type EdgeCommandUnavailable = "EDGE_COMMAND_WIRE_MAPPING_UNBOUND" | "EDGE_COMMAND_OPERATION_UNAVAILABLE"
  | "EDGE_COMMAND_SERVICE_RECOVERY_NOT_COMMISSIONED";
export class EdgeCommandAdapterError extends Error {
  constructor(readonly code: EdgeCommandUnavailable | "EDGE_COMMAND_BINDING_INVALID") { super(code); }
}
export function edgeCommandUnavailable(selection: EdgeCommandSelection, requestedOperation: string, recovery = false): EdgeCommandUnavailable | null {
  const selected = selectionSchema.parse(selection);
  if (selected.qualification === "UNBOUND") return "EDGE_COMMAND_WIRE_MAPPING_UNBOUND";
  if (!selected.operations.some(value => value === requestedOperation)) return "EDGE_COMMAND_OPERATION_UNAVAILABLE";
  return recovery && selected.recovery !== "EXPLICIT_SERVICE_STATUS_ONLY" ? "EDGE_COMMAND_SERVICE_RECOVERY_NOT_COMMISSIONED" : null;
}

/** Durable, gateway-resolved original. Scope and physical target are source
 * selections, never guessed from the browser's display resource. These hashes
 * have separate meanings: Portal intent, Edge scoped request, business transport
 * payload and PM resolved source intent MUST NOT be substituted for one another. */
const originalSchema = z.object({ gateway_ref: pmText, reference: pmText, authorization_digest: digest,
  intent_hash: digest, request_digest: digest, transport_payload_digest: digest, source_intent_digest: sourceDigest,
  source_key: z.tuple([pmText, pmText, pmText]), target_ref: pmText }).strict();
export type EdgeCommandOriginal = z.infer<typeof originalSchema>;
type EdgeAction = "SUBMIT" | "STATUS";
const preparedCallSchema = z.object({ gateway_ref: pmText, action: z.enum(["SUBMIT", "STATUS"]),
  call_digest: digest, delivered_request_digest: digest, assertion_ref: pmText,
  authority: z.enum(["CURRENT_HUMAN", "EXPLICIT_SERVICE_RECOVERY"]), actor_id: pmText.nullable(),
  issued_at_ms: utcMilliseconds, expires_at_ms: utcMilliseconds }).strict();
export type EdgeCommandPreparedCall = z.infer<typeof preparedCallSchema>;
const exchangeSchema = z.object({ original_digest: digest, call_digest: digest, delivered_request_digest: digest,
  result: sourceCommandResult,
  // Opaque reference/hash only: not a replacement for the complete source Outcome.
  full_outcome_custody: z.object({ reference: pmText, digest }).strict().nullable() }).strict();
export type EdgeCommandExchange = z.infer<typeof exchangeSchema>;
type OriginalInput = { authorization: CommandAuthorization; intent: CommandIntent; signal: AbortSignal };
type CallInput = OriginalInput & { action: EdgeAction; original: EdgeCommandOriginal; call_digest: string };
export interface SelectedEdgeCommandGateway {
  prepare(input: { actor: AccessActor; intent: CommandIntent; intent_hash: string; signal: AbortSignal }): Promise<CommandAuthorization | null>;
  /** Must resolve the retained original after process restart; no new resolution
   * against the latest account/profile, and no in-memory prepare-only cache. */
  original(input: OriginalInput): Promise<EdgeCommandOriginal | null>;
  /** Fresh gateway verification BEFORE dispatch; its digest binds the exact
   * actual delivery bytes. No JWT, cookie or private key enters this adapter.
   * STATUS service authority must be independently commissioned, not an expired
   * original human assertion or a newly impersonated human. */
  prepareCall(input: CallInput): Promise<EdgeCommandPreparedCall>;
  /** Exactly one dispatch. STATUS is lookup of the original only, never resend.
   * A known business result requires already durable full owning-source Outcome
   * custody. Normalize i64 counters losslessly before SourceCommandResult parsing;
   * Number -> string after lossy JSON parsing is NOT a valid wire mapping. */
  exchange(input: CallInput & { prepared: EdgeCommandPreparedCall }): Promise<EdgeCommandExchange>;
}
const invalid = (): never => { throw new EdgeCommandAdapterError("EDGE_COMMAND_BINDING_INVALID"); };
const same = (left: unknown, right: unknown) => accessDigest(left) === accessDigest(right);
function identity(authorization: CommandAuthorization, intent: CommandIntent) {
  return { authority_ref: authorization.authority_ref, profile_ref: authorization.profile_ref, workspace_id: intent.workspace_id,
    environment: intent.environment, operation: intent.business_payload.operation, resource_kind: intent.resource.kind,
    resource_id: intent.resource.id, idempotency_key: intent.business_payload.idempotency_key,
    source_intent_digest: authorization.source_intent_digest };
}
function unknown(authorization: CommandAuthorization, intent: CommandIntent): SourceCommandResult {
  return { ...identity(authorization, intent), delivery: "DELIVERY_UNKNOWN",
    business: { state: "UNKNOWN", receipt_ref: null, source_event_ref: null, revision: null, amounts: null },
    projection: "UNKNOWN", venue: "NOT_APPLICABLE" };
}
function validateAuthorization(authorization: CommandAuthorization, intent: CommandIntent, selected: EdgeCommandSelection) {
  if (authorization.qualification !== selected.qualification || authorization.workspace_id !== intent.workspace_id
    || authorization.environment !== intent.environment || authorization.operation !== intent.business_payload.operation
    || authorization.resource_kind !== intent.resource.kind || authorization.resource_id !== intent.resource.id
    || authorization.policy_revision !== intent.expected_policy_revision
    || authorization.intent_hash !== accessDigest({ actor_user_id: authorization.actor_id, intent })
    || !same(authorization.expected_versions, intent.business_payload.expected_versions)) invalid();
}
function equalDecimal(left: string, right: string): boolean {
  const normalize = (value: string) => value.includes(".") ? value.replace(/0+$/, "").replace(/\.$/, "") : value;
  return normalize(left) === normalize(right);
}

/** Only an explicitly supplied gateway can ever be called. The existing owning
 * ExecutionCommandService still checks current access/membership, approval,
 * capacity, durable idempotency and monotone source revisions. */
export function createEdgeCommandTrust(selection: EdgeCommandSelection, gateway: SelectedEdgeCommandGateway,
  clock: () => number = Date.now): CommandTrust {
  const selected = selectionSchema.parse(selection);
  const requireOperation = (intent: CommandIntent, recovery = false) => {
    const reason = edgeCommandUnavailable(selected, intent.business_payload.operation, recovery);
    if (reason) throw new EdgeCommandAdapterError(reason);
  };
  async function exchange(input: OriginalInput, action: EdgeAction): Promise<SourceCommandResult | null> {
    const authorization = commandAuthorization.parse(input.authorization), intent = commandIntent.parse(input.intent);
    requireOperation(intent, action === "STATUS"); validateAuthorization(authorization, intent, selected);
    const now = clock();
    if (input.signal.aborted || now >= authorization.idempotency_retained_until_ms) return action === "STATUS" ? null : invalid();
    if (action === "SUBMIT" && (authorization.issued_at_ms > now || authorization.expires_at_ms <= now
      || authorization.expires_at_ms - authorization.issued_at_ms > 60_000)) invalid();
    // Before any dispatch: retain exact original, validate current assertion and
    // action binding. Preparation failures do not acquire a send retry loop.
    const rawOriginal = await gateway.original({ ...input, authorization: structuredClone(authorization), intent: structuredClone(intent) });
    if (rawOriginal === null) return action === "STATUS" ? null : invalid();
    const original = originalSchema.parse(rawOriginal);
    // The Portal payload is already bound by intent_hash. It is NOT the Edge/PM
    // delivered payload or source catalogue key: preserve the gateway's retained
    // source bytes digest/key/target, without inventing their mapping or equality.
    if (original.gateway_ref !== selected.gateway_ref || original.authorization_digest !== accessDigest(authorization)
      || original.intent_hash !== authorization.intent_hash || original.source_intent_digest !== authorization.source_intent_digest) invalid();
    const call_digest = accessDigest({ action, original, authorization_digest: accessDigest(authorization), intent_hash: authorization.intent_hash });
    const call: CallInput = { ...input, authorization, intent, original, action, call_digest };
    const prepared = preparedCallSchema.parse(await gateway.prepareCall({ ...structuredClone({ authorization, intent, original, action, call_digest }), signal: input.signal }));
    const checkedAt = clock();
    if (input.signal.aborted || prepared.gateway_ref !== selected.gateway_ref || prepared.action !== action || prepared.call_digest !== call_digest
      || prepared.issued_at_ms > checkedAt || prepared.expires_at_ms <= checkedAt
      || prepared.expires_at_ms <= prepared.issued_at_ms || prepared.expires_at_ms - prepared.issued_at_ms > 60_000
      || prepared.expires_at_ms > authorization.idempotency_retained_until_ms
      || action === "SUBMIT" && (prepared.authority !== "CURRENT_HUMAN" || prepared.actor_id !== authorization.actor_id || authorization.expires_at_ms <= checkedAt)
      || action === "STATUS" && (prepared.authority !== "EXPLICIT_SERVICE_RECOVERY" || prepared.actor_id !== null)) invalid();
    try {
      const reply = exchangeSchema.parse(await gateway.exchange({ ...structuredClone({ ...call, signal: undefined, prepared }), signal: input.signal }));
      const { result } = reply, { delivery, business, projection: _projection, venue, ...resultIdentity } = result;
      if (reply.original_digest !== accessDigest(original) || reply.call_digest !== call_digest
        || reply.delivered_request_digest !== prepared.delivered_request_digest || !same(resultIdentity, identity(authorization, intent))
        || venue !== "NOT_APPLICABLE") invalid();
      if (business.state === "UNKNOWN") {
        if (business.receipt_ref !== null || business.source_event_ref !== null || business.revision !== null || business.amounts !== null) invalid();
      } else {
        if (delivery !== "ACKNOWLEDGED" || !reply.full_outcome_custody || !business.receipt_ref || !business.source_event_ref
          || business.revision === null || intent.business_payload.amount !== undefined && !business.amounts) invalid();
        if (business.amounts) {
          assertAmountPartition(business.amounts);
          if (intent.business_payload.amount !== undefined && !equalDecimal(intent.business_payload.amount, business.amounts.requested)) invalid();
        }
      }
      return result;
    } catch {
      // Timeout, malformed/misbound response, or ACK/custody loss is ambiguous.
      // No second send, synthetic receipt, applied state or current projection.
      return unknown(authorization, intent);
    }
  }
  return {
    async prepare(input) {
      const intent = commandIntent.parse(input.intent);
      if (edgeCommandUnavailable(selected, intent.business_payload.operation)) return null;
      if (input.signal.aborted || input.intent_hash !== accessDigest({ actor_user_id: input.actor.user_id, intent })) invalid();
      const raw = await gateway.prepare({ ...input, actor: structuredClone(input.actor), intent: structuredClone(intent) });
      if (raw === null) return null;
      const authorization = commandAuthorization.parse(raw);
      validateAuthorization(authorization, intent, selected);
      if (authorization.actor_id !== input.actor.user_id || authorization.intent_hash !== input.intent_hash) invalid();
      return authorization;
    },
    async send(input) { return (await exchange(input, "SUBMIT"))!; },
    async lookup(input) {
      if (edgeCommandUnavailable(selected, input.intent.business_payload.operation, true)) return null;
      try { return await exchange(input, "STATUS"); } catch { return null; }
    },
  };
}
