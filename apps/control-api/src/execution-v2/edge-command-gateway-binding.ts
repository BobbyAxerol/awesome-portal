/** CORE-05 PROPOSAL_SOURCE_ONLY. Local composition/tooling, not an Edge HTTP
 * protocol, mount, issuer or command activation. Core's counterpart is Edge;
 * no PM URL/transport/signing or replacement custody ledger belongs here.
 * Fresh requester STATUS is deliberately separate from unattended recovery. */
import { z } from "zod";
import type { AccessActor } from "./access.contract";
import { accessDigest } from "./access-digest";
import { commandIntent, commandStatus } from "./command.contract";
import { commandAuthorization, sourceCommandResult, type CommandTrust, type SourceCommandResult } from "./command-trust";
import type { CommandRecord } from "./command.store";
import { assertAmountPartition, pmText, utcMilliseconds } from "./foundation.contract";
import { EDGE_CAPITAL_OPERATIONS, edgeCommandUnavailable, type EdgeCommandSelection,
  type EdgeCommandOriginal, type EdgeCommandPreparedCall, type EdgeCommandExchange, type SelectedEdgeCommandGateway } from "./edge-command-adapter";

const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/), hex = z.string().regex(/^[a-f0-9]{64}$/);
const selection = z.object({ gateway_ref: pmText, qualification: z.enum(["UNBOUND", "OWNER_VERIFIED", "TEST_ONLY"]),
  operations: z.array(z.enum(EDGE_CAPITAL_OPERATIONS)).max(8).refine(v => new Set(v).size === v.length),
  recovery: z.enum(["UNCOMMISSIONED", "EXPLICIT_SERVICE_STATUS_ONLY"]) }).strict();
const contract = z.object({ reference: pmText, sha256: hex, edge_source_revision: pmText }).strict();
const binding = z.object({ selection, scope: z.object({ workspace_id: pmText, environment: z.enum(["paper", "sandbox", "live"]),
  authority_ref: pmText, profile_ref: pmText }).strict(), edge_contract: contract.nullable(),
  requester_status: z.enum(["UNCOMMISSIONED", "FRESH_CURRENT_HUMAN"]) }).strict();
export type EdgeCommandGatewayBinding = z.infer<typeof binding>;
type OriginalInput = Parameters<SelectedEdgeCommandGateway["original"]>[0];
type CurrentRequesterInput = OriginalInput & { actor: AccessActor };
type StatusInput = CurrentRequesterInput & { action: "STATUS"; original: EdgeCommandOriginal;
  call_digest: string; contract: z.infer<typeof contract> };
export interface EdgeCurrentRequesterStatusPort {
  /** Same durable original as the submit path, not current target resolution.
   * A restarted wrapper uses this source-owned custody, never an in-memory map. */
  original(input: OriginalInput & { contract: z.infer<typeof contract> }): Promise<EdgeCommandOriginal | null>;
  /** Owning verifier must authenticate the ACTUAL current requester/session,
   * field/report rights and delivered bytes, and keep source fences through its
   * owning operation. A DTO/hash here does not replace that verifier. */
  prepareStatus(input: StatusInput): Promise<{ requester_digest: string; prepared: EdgeCommandPreparedCall }>;
  /** STATUS only. No submit/retry/new-key method is available on this port.
   * Full source Outcome must already be durably retained before known results. */
  status(input: StatusInput & { prepared: EdgeCommandPreparedCall }): Promise<EdgeCommandExchange>;
}
export type RequesterEdgeCommandTrust = CommandTrust & {
  lookupCurrentRequester(input: CurrentRequesterInput): Promise<SourceCommandResult | null>;
};
const actorSchema = z.object({ user_id: pmText, session_id: pmText,
  session_generation: z.number().int().nonnegative().safe() }).strict();
const originalSchema = z.object({ gateway_ref: pmText, reference: pmText, authorization_digest: digest,
  intent_hash: digest, request_digest: digest, transport_payload_digest: digest, source_intent_digest: hex,
  source_key: z.tuple([pmText, pmText, pmText]), target_ref: pmText }).strict();
const preparedSchema = z.object({ gateway_ref: pmText, action: z.literal("STATUS"), call_digest: digest,
  delivered_request_digest: digest, assertion_ref: pmText, authority: z.literal("CURRENT_HUMAN"), actor_id: pmText,
  issued_at_ms: utcMilliseconds, expires_at_ms: utcMilliseconds }).strict();
const resultSchema = z.object({ original_digest: digest, call_digest: digest, delivered_request_digest: digest,
  result: sourceCommandResult, full_outcome_custody: z.object({ reference: pmText, digest }).strict().nullable() }).strict();
const eq = (a: unknown, b: unknown) => accessDigest(a) === accessDigest(b);
const normalizedDecimal = (value: string) => value.includes(".") ? value.replace(/0+$/, "").replace(/\.$/, "") : value;

export function inspectEdgeCommandGatewayBinding(raw: unknown) {
  const parsed = binding.safeParse(raw);
  if (!parsed.success) return { state: "REFUSED" as const, status: "PROPOSAL_SOURCE_ONLY" as const, reason: "EDGE_BINDING_CONFIG_INVALID" as const };
  const missing: string[] = [];
  if (parsed.data.selection.qualification === "UNBOUND" || parsed.data.edge_contract === null) missing.push("AUTHENTICATED_CORE_TO_EDGE_INGRESS_AND_EXACT_WIRE");
  if (parsed.data.requester_status !== "FRESH_CURRENT_HUMAN") missing.push("EDGE_CURRENT_REQUESTER_STATUS_VERIFIER");
  if (parsed.data.selection.recovery !== "EXPLICIT_SERVICE_STATUS_ONLY") missing.push("INDEPENDENT_SERVICE_RECOVERY_NOT_COMMISSIONED");
  // Even a fully populated local descriptor is not source acceptance/runtime proof.
  return { state: "PREPARED_UNBOUND" as const, status: "PROPOSAL_SOURCE_ONLY" as const,
    binding_digest: accessDigest(parsed.data), missing_bindings: Object.freeze(missing) };
}

/** A composable optional extension of the existing CommandTrust, without
 * weakening `.lookup()`'s explicit service-only meaning. Claude's authenticated
 * reconcile path must opt into lookupCurrentRequester after fresh exact report
 * authorization; unattended recover must keep calling only `.lookup()`.
 * No current actor is reconstructed from the historical authorization. */
export function bindEdgeCurrentRequesterStatus(raw: EdgeCommandGatewayBinding, base: CommandTrust,
  source: EdgeCurrentRequesterStatusPort, now: () => number = Date.now): RequesterEdgeCommandTrust {
  const selected = binding.parse(raw);
  return Object.freeze({
    prepare: (input: Parameters<CommandTrust["prepare"]>[0]) => base.prepare(input),
    send: (input: Parameters<CommandTrust["send"]>[0]) => base.send(input),
    lookup: (input: Parameters<CommandTrust["lookup"]>[0]) => base.lookup(input),
    async lookupCurrentRequester(input: CurrentRequesterInput): Promise<SourceCommandResult | null> {
      const admitted = commandIntent.safeParse(input.intent), auth = commandAuthorization.safeParse(input.authorization), actor = actorSchema.safeParse(input.actor);
      if (!admitted.success || !auth.success || !actor.success || input.signal.aborted || selected.edge_contract === null
        || selected.requester_status !== "FRESH_CURRENT_HUMAN" || edgeCommandUnavailable(selected.selection, admitted.data.business_payload.operation)) return null;
      const intent = admitted.data, authorization = auth.data, requester = actor.data, clock = now();
      if (!utcMilliseconds.safeParse(clock).success || authorization.idempotency_retained_until_ms <= clock
        || authorization.qualification !== selected.selection.qualification || !eq(selected.scope, {
          workspace_id: intent.workspace_id, environment: intent.environment, authority_ref: authorization.authority_ref, profile_ref: authorization.profile_ref })
        || authorization.workspace_id !== intent.workspace_id || authorization.environment !== intent.environment
        || authorization.operation !== intent.business_payload.operation || authorization.resource_kind !== intent.resource.kind
        || authorization.resource_id !== intent.resource.id || authorization.policy_revision !== intent.expected_policy_revision
        || !eq(authorization.expected_versions, intent.business_payload.expected_versions)
        || authorization.intent_hash !== accessDigest({ actor_user_id: authorization.actor_id, intent })) return null;
      const identity = { authority_ref: authorization.authority_ref, profile_ref: authorization.profile_ref, workspace_id: intent.workspace_id,
        environment: intent.environment, operation: intent.business_payload.operation, resource_kind: intent.resource.kind, resource_id: intent.resource.id,
        idempotency_key: intent.business_payload.idempotency_key, source_intent_digest: authorization.source_intent_digest };
      const uncertain = (): SourceCommandResult => ({ ...identity, delivery: "DELIVERY_UNKNOWN", projection: "UNKNOWN", venue: "NOT_APPLICABLE",
        business: { state: "UNKNOWN", receipt_ref: null, source_event_ref: null, revision: null, amounts: null } });
      const originalInput = { authorization, intent, contract: selected.edge_contract };
      try {
        const original = originalSchema.parse(await source.original({ ...structuredClone(originalInput), signal: input.signal }));
        if (original.gateway_ref !== selected.selection.gateway_ref || original.authorization_digest !== accessDigest(authorization)
          || original.intent_hash !== authorization.intent_hash || original.source_intent_digest !== authorization.source_intent_digest) return null;
        const requester_digest = accessDigest(requester), call_digest = accessDigest({ action: "STATUS", authority: "CURRENT_REQUESTER",
          requester_digest, original, authorization_digest: accessDigest(authorization), intent_hash: authorization.intent_hash });
        const call: Omit<StatusInput, "signal"> = { ...originalInput, actor: requester, original, action: "STATUS", call_digest };
        const preparedRaw = await source.prepareStatus({ ...structuredClone(call), signal: input.signal });
        const prepared = preparedSchema.parse(preparedRaw.prepared), checkedAt = now();
        if (preparedRaw.requester_digest !== requester_digest || prepared.gateway_ref !== selected.selection.gateway_ref
          || prepared.actor_id !== requester.user_id || prepared.call_digest !== call_digest || !utcMilliseconds.safeParse(checkedAt).success
          || prepared.issued_at_ms > checkedAt || prepared.expires_at_ms <= checkedAt || prepared.expires_at_ms <= prepared.issued_at_ms
          || prepared.expires_at_ms - prepared.issued_at_ms > 60_000 || prepared.expires_at_ms > authorization.idempotency_retained_until_ms
          || input.signal.aborted) return null;
        // Fresh source-owned readback detects substitution while verifying the
        // current requester. It does not upgrade this to an owning COMMIT fence.
        const reread = originalSchema.parse(await source.original({ ...structuredClone(originalInput), signal: input.signal }));
        if (!eq(reread, original) || input.signal.aborted || prepared.expires_at_ms <= now()) return null;
        let reply: z.infer<typeof resultSchema>;
        try { reply = resultSchema.parse(await source.status({ ...structuredClone(call), prepared: structuredClone(prepared), signal: input.signal })); }
        catch { return uncertain(); }
        const { delivery, business, projection: _projection, venue, ...returnedIdentity } = reply.result;
        if (reply.original_digest !== accessDigest(original) || reply.call_digest !== call_digest
          || reply.delivered_request_digest !== prepared.delivered_request_digest || !eq(identity, returnedIdentity) || venue !== "NOT_APPLICABLE") return uncertain();
        if (business.state === "UNKNOWN") {
          if (business.receipt_ref !== null || business.source_event_ref !== null || business.revision !== null || business.amounts !== null) return uncertain();
        } else {
          if (delivery !== "ACKNOWLEDGED" || !reply.full_outcome_custody || !business.receipt_ref || !business.source_event_ref
            || business.revision === null || intent.business_payload.amount !== undefined && business.amounts === null) return uncertain();
          if (business.amounts) {
            assertAmountPartition(business.amounts);
            if (intent.business_payload.amount !== undefined && normalizedDecimal(intent.business_payload.amount) !== normalizedDecimal(business.amounts.requested)) return uncertain();
          }
        }
        return reply.result;
      } catch { return null; }
    },
  });
}

/** Offline diagnosis of the existing durable Core record. It creates no claim,
 * attempt or receipt. SENDING/DELIVERY_UNKNOWN/ACKNOWLEDGED NEVER becomes a new
 * send, including after restart or lost ACK. Full source custody stays at Edge. */
export function inspectEdgeCommandOriginalRecovery(raw: CommandRecord, selection: EdgeCommandSelection) {
  try {
    const intent = commandIntent.parse(raw.intent), authorization = commandAuthorization.parse(raw.authorization), status = commandStatus.parse(raw.status);
    if (raw.id !== status.command_id || raw.actor !== authorization.actor_id || raw.hash !== authorization.intent_hash
      || raw.hash !== accessDigest({ actor_user_id: raw.actor, intent }) || status.operation !== intent.business_payload.operation
      || !eq(status.resource, intent.resource) || status.environment !== intent.environment || status.profile_ref !== authorization.profile_ref
      || status.authority !== authorization.qualification) throw new Error("INVALID_RECORD");
    const service = edgeCommandUnavailable(selection, intent.business_payload.operation, true);
    return Object.freeze({ state: "PREPARED_UNBOUND" as const, status: "PROPOSAL_SOURCE_ONLY" as const,
      command_id: raw.id, original_intent_hash: raw.hash,
      submit: status.delivery === "PREPARED" && raw.attempt === null ? "REQUIRES_ORIGINAL_ATOMIC_CLAIM" as const : "FORBIDDEN_SAME_INTENT_RESEND" as const,
      requester_status: "REQUIRES_FRESH_CURRENT_REQUESTER" as const,
      service_recovery: service === null ? "REQUIRES_ACCEPTED_SERVICE_STATUS_BINDING" as const : service });
  } catch {
    return Object.freeze({ state: "REFUSED" as const, status: "PROPOSAL_SOURCE_ONLY" as const, reason: "CORE_COMMAND_ORIGINAL_INVALID" as const });
  }
}
