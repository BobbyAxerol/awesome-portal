/** TEST_ONLY source composition, not authenticated ingress/source authority,
 * durable database commissioning, connected command or full Outcome proof. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { accessDigest } from "../src/execution-v2/access-digest";
import { commandIntent, commandStatus } from "../src/execution-v2/command.contract";
import { commandAuthorization, type CommandAuthorization, type CommandTrust, type SourceCommandResult } from "../src/execution-v2/command-trust";
import type { CommandRecord } from "../src/execution-v2/command.store";
import { createEdgeCommandTrust, type EdgeCommandOriginal, type SelectedEdgeCommandGateway } from "../src/execution-v2/edge-command-adapter";
import { bindEdgeCurrentRequesterStatus, inspectEdgeCommandGatewayBinding, inspectEdgeCommandOriginalRecovery,
  type EdgeCommandGatewayBinding, type EdgeCurrentRequesterStatusPort } from "../src/execution-v2/edge-command-gateway-binding";

const contractsDir = process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts");
const fixture = JSON.parse(readFileSync(resolve(contractsDir, "fixtures/execution-trusted-commands.synthetic.valid.json"), "utf8"));
const now = 1_792_100_000_000, intent = commandIntent.parse(fixture.intent), signal = new AbortController().signal;
const originalActor = { user_id: "TEST_ONLY:original-author", session_id: "TEST_ONLY:original-session", session_generation: 1 };
const requester = { user_id: "TEST_ONLY:current-reviewer", session_id: "TEST_ONLY:current-session", session_generation: 3 };
function authorization(): CommandAuthorization {
  return commandAuthorization.parse({ qualification: "TEST_ONLY", reference: "TEST_ONLY:authorization", authority_ref: "TEST_ONLY:source-authority",
    profile_ref: "TEST_ONLY:paper", audience: "pma.management.v1", actor_id: originalActor.user_id, ts_user_id: "TEST_ONLY:ts-user",
    workload_ref: "TEST_ONLY:workload", delegation_ref: "TEST_ONLY:delegation", mapping_revision: "TEST_ONLY:mapping",
    membership_revision: "TEST_ONLY:membership", membership_receipt_ref: "TEST_ONLY:membership-receipt", workspace_id: intent.workspace_id,
    environment: intent.environment, operation: intent.business_payload.operation, resource_kind: intent.resource.kind, resource_id: intent.resource.id,
    policy_revision: intent.expected_policy_revision, intent_hash: accessDigest({ actor_user_id: originalActor.user_id, intent }),
    source_intent_digest: accessDigest("TEST_ONLY:independent-resolved-source-intent").slice(7), expected_versions: intent.business_payload.expected_versions,
    issued_at_ms: now - 20_000, expires_at_ms: now - 10_000, idempotency_retained_until_ms: now + 120_000,
    approval_required: false, required_approval_gate: null, approval: null, r2_basis: null,
    commit_checks: { human: true, workload: true, membership: true, scope: true, versions: true, capacity: true, approval: true } });
}
function sourceResult(): SourceCommandResult {
  const auth = authorization();
  return { authority_ref: auth.authority_ref, profile_ref: auth.profile_ref, workspace_id: intent.workspace_id,
    environment: intent.environment, operation: intent.business_payload.operation, resource_kind: intent.resource.kind, resource_id: intent.resource.id,
    idempotency_key: intent.business_payload.idempotency_key, source_intent_digest: auth.source_intent_digest, delivery: "ACKNOWLEDGED", projection: "CATCHING_UP",
    venue: "NOT_APPLICABLE", business: { state: "APPLIED", receipt_ref: "TEST_ONLY:source-receipt", source_event_ref: "TEST_ONLY:source-event",
      revision: "9007199254740993", amounts: { requested: intent.business_payload.amount!, applied: intent.business_payload.amount!, pending: "0", cancelled: "0", rejected: "0" } } };
}
function setup() {
  const auth = authorization(), config: EdgeCommandGatewayBinding = {
    selection: { gateway_ref: "TEST_ONLY:edge-gateway", qualification: "TEST_ONLY", operations: ["TOP_UP"], recovery: "UNCOMMISSIONED" },
    scope: { workspace_id: intent.workspace_id, environment: intent.environment, authority_ref: auth.authority_ref, profile_ref: auth.profile_ref },
    edge_contract: { reference: "TEST_ONLY:edge-local-binding-proposal", sha256: "a".repeat(64), edge_source_revision: "TEST_ONLY:edge-revision" },
    requester_status: "FRESH_CURRENT_HUMAN" };
  const original: EdgeCommandOriginal = { gateway_ref: config.selection.gateway_ref, reference: "TEST_ONLY:durable-edge-original",
    authorization_digest: accessDigest(auth), intent_hash: auth.intent_hash, request_digest: accessDigest("TEST_ONLY:edge-request"),
    transport_payload_digest: accessDigest("TEST_ONLY:independently-mapped-source-bytes"), source_intent_digest: auth.source_intent_digest,
    source_key: ["TEST_ONLY:source-namespace", "TEST_ONLY:differently-named-source-operation", "TEST_ONLY:source-key"], target_ref: "TEST_ONLY:resolved-source-account" };
  const base = { prepare: vi.fn(async () => auth), send: vi.fn(async () => sourceResult()), lookup: vi.fn(async () => null) };
  const source = { original: vi.fn(async () => structuredClone(original)),
    prepareStatus: vi.fn(async (input: Parameters<EdgeCurrentRequesterStatusPort["prepareStatus"]>[0]) => ({ requester_digest: accessDigest(input.actor),
      prepared: { gateway_ref: config.selection.gateway_ref, action: "STATUS" as const, call_digest: input.call_digest,
        delivered_request_digest: accessDigest({ test_only_exact_status_bytes: input.call_digest }), assertion_ref: "TEST_ONLY:fresh-human-status",
        authority: "CURRENT_HUMAN" as const, actor_id: input.actor.user_id, issued_at_ms: now - 10, expires_at_ms: now + 10_000 } })),
    status: vi.fn(async (input: Parameters<EdgeCurrentRequesterStatusPort["status"]>[0]) => ({ original_digest: accessDigest(input.original),
      call_digest: input.call_digest, delivered_request_digest: input.prepared.delivered_request_digest, result: sourceResult(),
      full_outcome_custody: { reference: "TEST_ONLY:owning-edge-complete-outcome", digest: accessDigest("TEST_ONLY:outcome-bytes") } })),
  };
  return { config, auth, original, base, source, trust: bindEdgeCurrentRequesterStatus(config, base, source, () => now) };
}
function lookup() { return { actor: structuredClone(requester), authorization: authorization(), intent: structuredClone(intent), signal }; }
function record(): CommandRecord {
  const status = commandStatus.parse(fixture.stored_ack_only);
  return { id: status.command_id, actor: originalActor.user_id, hash: authorization().intent_hash, authorization: authorization(),
    intent: structuredClone(intent), status: { ...status, profile_ref: authorization().profile_ref, authority: "TEST_ONLY" }, attempt: null };
}

describe("CORE-05 guarded Edge-only command binding support", () => {
  it("keeps a populated descriptor SOURCE_ONLY and reports service recovery independently missing", () => {
    expect(inspectEdgeCommandGatewayBinding(setup().config)).toMatchObject({ state: "PREPARED_UNBOUND", status: "PROPOSAL_SOURCE_ONLY",
      missing_bindings: ["INDEPENDENT_SERVICE_RECOVERY_NOT_COMMISSIONED"] });
  });
  it.each(["pm_url", "url", "jwt", "private_key", "allow_live", "enable_command"])("refuses unaccepted configuration authority/transport %s", field => {
    expect(inspectEdgeCommandGatewayBinding({ ...setup().config, [field]: "TEST_ONLY:forbidden" })).toMatchObject({ state: "REFUSED" });
  });
  it("default/uncommissioned binding does not touch any status port or source", async () => {
    const { config, base, source } = setup(); config.selection.qualification = "UNBOUND"; config.edge_contract = null;
    expect(await bindEdgeCurrentRequesterStatus(config, base, source, () => now).lookupCurrentRequester(lookup())).toBeNull();
    for (const fn of Object.values(source)) expect(fn).not.toHaveBeenCalled();
    expect(inspectEdgeCommandGatewayBinding(config)).toMatchObject({ missing_bindings: expect.arrayContaining(["AUTHENTICATED_CORE_TO_EDGE_INGRESS_AND_EXACT_WIRE"]) });
  });
  it("uses a fresh current reviewer, not the expired original actor, without relabeling service recovery", async () => {
    const { trust, source, base, original } = setup();
    expect(authorization().expires_at_ms).toBeLessThan(now);
    expect(await trust.lookupCurrentRequester(lookup())).toEqual(sourceResult());
    expect(source.prepareStatus.mock.calls[0][0]).toMatchObject({ actor: requester, authorization: { actor_id: originalActor.user_id }, original });
    expect(source.status.mock.calls[0][0].prepared.authority).toBe("CURRENT_HUMAN");
    expect(source.status.mock.calls[0][0].prepared.actor_id).toBe(requester.user_id);
    expect(source.original).toHaveBeenCalledTimes(2); expect(base.lookup).not.toHaveBeenCalled(); expect(base.send).not.toHaveBeenCalled();
    expect(await trust.lookup({ authorization: authorization(), intent, signal })).toBeNull(); expect(base.lookup).toHaveBeenCalledTimes(1);
  });
  it.each(["workspace_id", "environment", "authority_ref", "profile_ref"])("refuses wrong selected scope %s before source lookup", async field => {
    const { config, base, source } = setup(); (config.scope as Record<string, string>)[field] = field === "environment" ? "live" : "TEST_ONLY:other";
    expect(await bindEdgeCurrentRequesterStatus(config, base, source, () => now).lookupCurrentRequester(lookup())).toBeNull();
    expect(source.original).not.toHaveBeenCalled(); expect(source.status).not.toHaveBeenCalled();
  });
  it.each(["reference", "request_digest", "transport_payload_digest", "target_ref", "source_key"])("refuses replaced durable original %s while preparing requester status", async field => {
    const { trust, source, original } = setup();
    source.original.mockResolvedValueOnce(structuredClone(original));
    source.original.mockResolvedValueOnce({ ...original, [field]: field === "source_key" ? ["TEST_ONLY:other", "TEST_ONLY:op", "TEST_ONLY:key"]
      : field.endsWith("digest") ? accessDigest("other") : "TEST_ONLY:other" } as EdgeCommandOriginal);
    expect(await trust.lookupCurrentRequester(lookup())).toBeNull(); expect(source.status).not.toHaveBeenCalled();
  });
  it.each(["actor_id", "authority", "call_digest", "requester_digest", "expiry", "session_generation"])("refuses invalid current-requester %s before status dispatch", async field => {
    const { trust, source } = setup(), real = source.prepareStatus.getMockImplementation()!;
    source.prepareStatus.mockImplementationOnce(async input => {
      const value = await real(input);
      if (field === "requester_digest") value.requester_digest = accessDigest(originalActor);
      else if (field === "session_generation") value.requester_digest = accessDigest({ ...requester, session_generation: 2 });
      else if (field === "expiry") value.prepared.expires_at_ms = now;
      else if (field === "call_digest") value.prepared.call_digest = accessDigest("wrong");
      else (value.prepared as unknown as Record<string, string>)[field] = field === "authority" ? "EXPLICIT_SERVICE_RECOVERY" : originalActor.user_id;
      return value;
    });
    expect(await trust.lookupCurrentRequester(lookup())).toBeNull(); expect(source.status).not.toHaveBeenCalled();
  });
  it("preserves distinct source payload/key and exact i64/decimal values", async () => {
    const { trust, source, original } = setup(); const result = await trust.lookupCurrentRequester(lookup());
    expect(result?.business.revision).toBe("9007199254740993"); expect(result?.business.amounts?.applied).toBe("100.000000000000000001");
    expect(source.status.mock.calls[0][0].original).toEqual(original);
    expect(original.transport_payload_digest).not.toBe(accessDigest(intent.business_payload));
    expect(original.source_key[1]).not.toBe(intent.business_payload.operation); expect(original.source_key[2]).not.toBe(intent.business_payload.idempotency_key);
  });
  it.each(["original_digest", "delivered_request_digest", "key", "custody", "rounded_counter"])("keeps ambiguous/lost status %s UNKNOWN without resend", async field => {
    const { trust, source, base } = setup(), real = source.status.getMockImplementation()!;
    source.status.mockImplementationOnce(async input => {
      const value = await real(input);
      if (field === "key") value.result.idempotency_key = "TEST_ONLY:other";
      else if (field === "custody") (value as unknown as { full_outcome_custody: null }).full_outcome_custody = null;
      else if (field === "rounded_counter") (value.result.business as unknown as { revision: number }).revision = 9007199254740992;
      else value[field as "original_digest"] = accessDigest("wrong");
      return value;
    });
    expect(await trust.lookupCurrentRequester(lookup())).toMatchObject({ delivery: "DELIVERY_UNKNOWN", business: { state: "UNKNOWN" }, projection: "UNKNOWN" });
    expect(source.status).toHaveBeenCalledTimes(1); expect(base.send).not.toHaveBeenCalled();
  });
  it("reconstructs composition after a lost submit ACK and resolves only the same durable original", async () => {
    const { config, source, original } = setup();
    const auth = { ...authorization(), issued_at_ms: now - 10, expires_at_ms: now + 10_000 };
    original.authorization_digest = accessDigest(auth);
    const gateway: SelectedEdgeCommandGateway = {
      prepare: vi.fn(async () => auth), original: vi.fn(async () => structuredClone(original)),
      prepareCall: vi.fn(async input => ({ gateway_ref: config.selection.gateway_ref, action: input.action, call_digest: input.call_digest,
        delivered_request_digest: accessDigest("TEST_ONLY:exact-submit-bytes"), assertion_ref: "TEST_ONLY:fresh-author",
        authority: "CURRENT_HUMAN" as const, actor_id: originalActor.user_id, issued_at_ms: now - 10, expires_at_ms: now + 1000 })),
      exchange: vi.fn(async () => { throw new Error("TEST_ONLY:ACK_LOST"); }),
    };
    const base = createEdgeCommandTrust(config.selection, gateway, () => now);
    const first = bindEdgeCurrentRequesterStatus(config, base, source, () => now);
    expect(await first.send({ authorization: auth, intent, signal })).toMatchObject({ delivery: "DELIVERY_UNKNOWN" });
    const restarted = bindEdgeCurrentRequesterStatus(config, base, source, () => now);
    expect(await restarted.lookupCurrentRequester({ ...lookup(), authorization: auth })).toEqual(sourceResult());
    expect(gateway.exchange).toHaveBeenCalledTimes(1); expect(source.status).toHaveBeenCalledTimes(1);
    expect(source.status.mock.calls[0][0].original).toEqual(original);
    expect(await restarted.lookup({ authorization: auth, intent, signal })).toBeNull();
  });
  it.each(["SENDING", "DELIVERY_UNKNOWN", "ACKNOWLEDGED", "FAILED_BEFORE_SEND"] as const)("never proposes resending durable %s after restart", delivery => {
    const value = record(); value.status.delivery = delivery; value.attempt = delivery === "SENDING" ? "TEST_ONLY:original-attempt" : null;
    expect(inspectEdgeCommandOriginalRecovery(value, setup().config.selection)).toMatchObject({ submit: "FORBIDDEN_SAME_INTENT_RESEND",
      service_recovery: "EDGE_COMMAND_SERVICE_RECOVERY_NOT_COMMISSIONED", requester_status: "REQUIRES_FRESH_CURRENT_REQUESTER" });
  });
  it("requires the original atomic claim for PREPARED and refuses a corrupted record", () => {
    const value = record(); value.status.delivery = "PREPARED";
    expect(inspectEdgeCommandOriginalRecovery(value, setup().config.selection)).toMatchObject({ submit: "REQUIRES_ORIGINAL_ATOMIC_CLAIM" });
    value.hash = accessDigest("wrong"); expect(inspectEdgeCommandOriginalRecovery(value, setup().config.selection)).toMatchObject({ state: "REFUSED" });
  });
  it("stops expired custody/aborted requester before any source operation", async () => {
    const { config, base, source } = setup();
    expect(await bindEdgeCurrentRequesterStatus(config, base, source, () => now + 120_000).lookupCurrentRequester(lookup())).toBeNull();
    const aborted = new AbortController(); aborted.abort();
    expect(await bindEdgeCurrentRequesterStatus(config, base, source, () => now).lookupCurrentRequester({ ...lookup(), signal: aborted.signal })).toBeNull();
    expect(source.original).not.toHaveBeenCalled(); expect(source.status).not.toHaveBeenCalled();
  });
});
