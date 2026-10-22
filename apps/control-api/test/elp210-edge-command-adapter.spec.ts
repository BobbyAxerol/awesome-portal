/** TEST_ONLY local dependency tests: no Edge protocol, signature, mTLS, PM
 * commissioning, installed runtime or connected command proof. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { accessDigest } from "../src/execution-v2/access-policy";
import { commandIntent, type CommandIntent } from "../src/execution-v2/command.contract";
import { commandAuthorization, type CommandAuthorization, type SourceCommandResult } from "../src/execution-v2/command-trust";
import { createEdgeCommandTrust, edgeCommandUnavailable, type EdgeCommandExchange, type EdgeCommandOriginal,
  type EdgeCommandPreparedCall, type EdgeCommandSelection, type SelectedEdgeCommandGateway } from "../src/execution-v2/edge-command-adapter";

const fixture = JSON.parse(readFileSync(resolve(__dirname, "../../../packages/contracts/fixtures/execution-trusted-commands.synthetic.valid.json"), "utf8"));
const intent = commandIntent.parse(fixture.intent), now = 1_792_100_000_000;
const actor = { user_id: "TEST_ONLY:user", session_id: "TEST_ONLY:session", session_generation: 1 };
const signal = new AbortController().signal, hash = accessDigest({ actor_user_id: actor.user_id, intent });
function authorization(i: CommandIntent = intent): CommandAuthorization {
  return commandAuthorization.parse({ qualification: "TEST_ONLY", reference: "TEST_ONLY:authorization", authority_ref: "TEST_ONLY:pm-authority",
    profile_ref: "TEST_ONLY:paper", audience: "pma.management.v1", actor_id: actor.user_id, ts_user_id: "TEST_ONLY:ts-user",
    workload_ref: "TEST_ONLY:workload", delegation_ref: "TEST_ONLY:delegation", mapping_revision: "TEST_ONLY:mapping",
    membership_revision: "TEST_ONLY:membership", membership_receipt_ref: "TEST_ONLY:membership-receipt", workspace_id: i.workspace_id,
    environment: i.environment, operation: i.business_payload.operation, resource_kind: i.resource.kind, resource_id: i.resource.id,
    policy_revision: i.expected_policy_revision, intent_hash: accessDigest({ actor_user_id: actor.user_id, intent: i }), source_intent_digest: accessDigest("TEST_ONLY:resolved-pm-intent").slice(7),
    expected_versions: i.business_payload.expected_versions, issued_at_ms: now - 100, expires_at_ms: now + 10_000,
    idempotency_retained_until_ms: now + 120_000, approval_required: false, required_approval_gate: null, approval: null, r2_basis: null,
    commit_checks: { human: true, workload: true, membership: true, scope: true, versions: true, capacity: true, approval: true } });
}
function result(i: CommandIntent = intent): SourceCommandResult {
  const a = authorization(i);
  return { authority_ref: a.authority_ref, profile_ref: a.profile_ref, workspace_id: i.workspace_id, environment: i.environment,
    operation: i.business_payload.operation, resource_kind: i.resource.kind, resource_id: i.resource.id,
    idempotency_key: i.business_payload.idempotency_key, source_intent_digest: a.source_intent_digest, delivery: "ACKNOWLEDGED",
    business: { state: "APPLIED", receipt_ref: "TEST_ONLY:receipt", source_event_ref: "TEST_ONLY:event", revision: "9007199254740993",
      amounts: { requested: "100.000000000000000001", applied: "100.000000000000000001", pending: "0", cancelled: "0", rejected: "0" } },
    projection: "CATCHING_UP", venue: "NOT_APPLICABLE" };
}
function setup(patch: Partial<EdgeCommandSelection> = {}, i: CommandIntent = intent) {
  const selection: EdgeCommandSelection = { gateway_ref: "TEST_ONLY:edge-gateway", qualification: "TEST_ONLY", operations: ["TOP_UP"],
    recovery: "UNCOMMISSIONED", ...patch };
  const original: EdgeCommandOriginal = { gateway_ref: selection.gateway_ref, reference: "TEST_ONLY:retained-original",
    authorization_digest: accessDigest(authorization(i)), intent_hash: accessDigest({ actor_user_id: actor.user_id, intent: i }), request_digest: accessDigest("TEST_ONLY:edge-scoped-request"),
    transport_payload_digest: accessDigest("TEST_ONLY:actual-independent-source-wire-bytes"), source_intent_digest: authorization(i).source_intent_digest,
    source_key: ["TEST_ONLY:source-authority-scope", "TEST_ONLY:source-operation", "TEST_ONLY:source-key"], target_ref: "TEST_ONLY:resolved-account" };
  const gateway = {
    prepare: vi.fn(async () => authorization(i)), original: vi.fn(async () => structuredClone(original)),
    prepareCall: vi.fn(async (input: Parameters<SelectedEdgeCommandGateway["prepareCall"]>[0]): Promise<EdgeCommandPreparedCall> => ({
      gateway_ref: selection.gateway_ref, action: input.action, call_digest: input.call_digest,
      delivered_request_digest: accessDigest({ test_only_actual_bytes: input.action }), assertion_ref: "TEST_ONLY:fresh-verified-assertion",
      authority: input.action === "SUBMIT" ? "CURRENT_HUMAN" : "EXPLICIT_SERVICE_RECOVERY", actor_id: input.action === "SUBMIT" ? actor.user_id : null,
      issued_at_ms: now - 10, expires_at_ms: now + 5_000 })),
    exchange: vi.fn(async (input: Parameters<SelectedEdgeCommandGateway["exchange"]>[0]): Promise<EdgeCommandExchange> => ({
      original_digest: accessDigest(input.original), call_digest: input.call_digest, delivered_request_digest: input.prepared.delivered_request_digest,
      result: result(i), full_outcome_custody: { reference: "TEST_ONLY:edge-complete-outcome", digest: accessDigest("TEST_ONLY:full-outcome-bytes") } })),
  };
  return { gateway, original, selection, trust: createEdgeCommandTrust(selection, gateway, () => now) };
}
const submission = () => ({ authorization: authorization(), intent: structuredClone(intent), signal });
const prepare = () => ({ actor: structuredClone(actor), intent: structuredClone(intent), intent_hash: hash, signal });

describe("ELP2-10 proposed injected Edge capital CommandTrust adapter", () => {
  it("is unavailable when wire mapping is unbound, without invoking a gateway", async () => {
    const { trust, gateway, selection } = setup({ qualification: "UNBOUND" });
    expect(edgeCommandUnavailable(selection, "TOP_UP")).toBe("EDGE_COMMAND_WIRE_MAPPING_UNBOUND");
    expect(await trust.prepare(prepare())).toBeNull();
    await expect(trust.send(submission())).rejects.toMatchObject({ code: "EDGE_COMMAND_WIRE_MAPPING_UNBOUND" });
    expect(await trust.lookup(submission())).toBeNull();
    for (const fn of Object.values(gateway)) expect(fn).not.toHaveBeenCalled();
  });
  it.each(["RETURN_CAPITAL", "APPLY_PENDING", "CANCEL_REMAINING", "REALLOCATE_BUDGET", "ADMIN_LOCK", "HALT", "exchange_order"])(
    "does not infer an eight-operation capital mapping for %s", unsupported => {
      expect(edgeCommandUnavailable(setup().selection, unsupported)).toBe("EDGE_COMMAND_OPERATION_UNAVAILABLE");
    });
  it("requires an explicitly selected supported operation even if the grammar can represent it", async () => {
    const { trust, gateway } = setup({ operations: ["FUND"] });
    expect(await trust.prepare(prepare())).toBeNull();
    await expect(trust.send(submission())).rejects.toMatchObject({ code: "EDGE_COMMAND_OPERATION_UNAVAILABLE" });
    expect(gateway.prepare).not.toHaveBeenCalled(); expect(gateway.exchange).not.toHaveBeenCalled();
  });
  it("returns the existing authorization and preserves exact counters without manufacturing source authority", async () => {
    const { trust, gateway } = setup();
    expect(await trust.prepare(prepare())).toEqual(authorization());
    expect((await trust.send(submission())).business).toEqual(result().business);
    const sent = gateway.exchange.mock.calls[0][0];
    expect(sent.intent.business_payload.expected_versions.budget).toBe("9007199254740993");
    expect(sent.intent.business_payload.amount).toBe("100.000000000000000001");
    expect(sent.original.source_intent_digest).not.toBe(sent.original.transport_payload_digest.slice(7));
    expect(sent.original.request_digest).not.toBe(sent.original.transport_payload_digest);
    expect(sent.original.transport_payload_digest).not.toBe(accessDigest(intent.business_payload));
    expect(sent.action).toBe("SUBMIT"); expect(sent.prepared.authority).toBe("CURRENT_HUMAN");
    expect(gateway.exchange).toHaveBeenCalledTimes(1);
  });
  it.each(["actor_id", "workspace_id", "policy_revision", "source_intent_digest", "qualification"])("rejects misbound authorization %s before sending", async field => {
    const { trust, gateway } = setup();
    const changed = { ...authorization(), [field]: field === "qualification" ? "OWNER_VERIFIED" : "other" };
    if (field === "source_intent_digest") changed[field] = "a".repeat(64);
    gateway.prepare.mockResolvedValueOnce(changed as CommandAuthorization);
    if (field === "source_intent_digest") {
      // The source digest is independent and is checked against the retained original at send.
      const a = await trust.prepare(prepare());
      await expect(trust.send({ ...submission(), authorization: a! })).rejects.toThrow();
    } else await expect(trust.prepare(prepare())).rejects.toThrow();
    expect(gateway.exchange).not.toHaveBeenCalled();
  });
  it.each(["reference", "target_ref", "request_digest", "transport_payload_digest", "source_key"])("preserves independently retained source %s for SUBMIT and STATUS", async field => {
    const { trust, gateway, original } = setup({ recovery: "EXPLICIT_SERVICE_STATUS_ONLY" });
    const first = await trust.send(submission()); expect(first.delivery).toBe("ACKNOWLEDGED");
    // The gateway resolves the durable original on each call; no prepare-only cache.
    expect(await trust.lookup(submission())).toEqual(first);
    expect(gateway.original).toHaveBeenCalledTimes(2);
    expect(gateway.exchange.mock.calls[1][0].original[field as keyof EdgeCommandOriginal]).toEqual(original[field as keyof EdgeCommandOriginal]);
    expect(gateway.exchange.mock.calls.map(([input]) => input.action)).toEqual(["SUBMIT", "STATUS"]);
    expect(gateway.exchange.mock.calls[1][0].original.transport_payload_digest).not.toBe(accessDigest(intent.business_payload));
    expect(gateway.exchange.mock.calls[1][0].original.source_key[1]).not.toBe(intent.business_payload.operation);
    expect(gateway.exchange.mock.calls[1][0].original.source_key[2]).not.toBe(intent.business_payload.idempotency_key);
  });
  it.each(["authorization_digest", "intent_hash", "source_intent_digest", "gateway_ref", "source_key"])(
    "rejects wrong retained-original %s before dispatch", async field => {
      const { trust, gateway, original } = setup();
      const changed = { ...original, [field]: field === "source_key" ? ["TEST_ONLY:missing-source-key"]
        : field === "gateway_ref" ? "TEST_ONLY:other-edge" : field === "source_intent_digest" ? "a".repeat(64) : accessDigest("wrong") };
      gateway.original.mockResolvedValueOnce(changed as EdgeCommandOriginal);
      await expect(trust.send(submission())).rejects.toThrow(); expect(gateway.exchange).not.toHaveBeenCalled();
    });
  it.each(["action", "call_digest", "gateway_ref", "actor_id", "authority", "expires_at_ms"])("requires a fresh pre-dispatch current-human assertion bound to %s", async field => {
    const { trust, gateway } = setup(), real = gateway.prepareCall.getMockImplementation()!;
    gateway.prepareCall.mockImplementationOnce(async input => ({ ...await real(input), [field]: field === "action" ? "STATUS" : field === "authority"
      ? "EXPLICIT_SERVICE_RECOVERY" : field === "expires_at_ms" ? now : field === "call_digest" ? accessDigest("other-call") : "TEST_ONLY:other" } as EdgeCommandPreparedCall));
    await expect(trust.send(submission())).rejects.toThrow(); expect(gateway.exchange).not.toHaveBeenCalled();
  });
  it("does not dispatch after original human authorization expires during preparation", async () => {
    const { gateway, selection } = setup(); let clock = now;
    const trust = createEdgeCommandTrust(selection, gateway, () => clock), real = gateway.prepareCall.getMockImplementation()!;
    gateway.prepareCall.mockImplementationOnce(async input => { const value = await real(input); clock = now + 20_000; return { ...value, expires_at_ms: clock + 1000 }; });
    await expect(trust.send(submission())).rejects.toThrow(); expect(gateway.exchange).not.toHaveBeenCalled();
  });
  it("never retries an ambiguous send or manufactures Outcome/projection/venue facts", async () => {
    const { trust, gateway } = setup(); gateway.exchange.mockRejectedValueOnce(new Error("TEST_ONLY:ACK_LOST"));
    expect(await trust.send(submission())).toMatchObject({ delivery: "DELIVERY_UNKNOWN", projection: "UNKNOWN", venue: "NOT_APPLICABLE",
      business: { state: "UNKNOWN", receipt_ref: null, source_event_ref: null, revision: null, amounts: null } });
    expect(gateway.exchange).toHaveBeenCalledTimes(1);
  });
  it.each(["original_digest", "call_digest", "delivered_request_digest", "full_outcome_custody", "source_result_identity", "revision", "partition", "missing_amounts", "venue"])(
    "keeps ambiguous %s response UNKNOWN instead of acknowledging invented facts", async field => {
      const { trust, gateway } = setup(), real = gateway.exchange.getMockImplementation()!;
      gateway.exchange.mockImplementationOnce(async input => {
        const reply = await real(input);
        if (field === "full_outcome_custody") reply.full_outcome_custody = null;
        else if (field === "source_result_identity") reply.result.idempotency_key = "TEST_ONLY:other-key";
        else if (field === "revision") (reply.result.business as unknown as { revision: number }).revision = 9007199254740992;
        else if (field === "partition") reply.result.business.amounts!.applied = "1";
        else if (field === "missing_amounts") reply.result.business.amounts = null;
        else if (field === "venue") reply.result.venue = "FILLED";
        else reply[field as "original_digest"] = accessDigest("other");
        return reply;
      });
      expect(await trust.send(submission())).toMatchObject({ delivery: "DELIVERY_UNKNOWN", business: { state: "UNKNOWN" }, projection: "UNKNOWN" });
      expect(gateway.exchange).toHaveBeenCalledTimes(1);
    });
  it("does not turn a capital ACK-only observation into a business Outcome", async () => {
    const { trust, gateway } = setup(), real = gateway.exchange.getMockImplementation()!;
    gateway.exchange.mockImplementationOnce(async input => { const reply = await real(input); reply.full_outcome_custody = null;
      reply.result.business = { state: "UNKNOWN", receipt_ref: null, source_event_ref: null, revision: null, amounts: null }; return reply; });
    expect(await trust.send(submission())).toMatchObject({ delivery: "ACKNOWLEDGED", business: { state: "UNKNOWN" }, projection: "CATCHING_UP", venue: "NOT_APPLICABLE" });
  });
  it.each(["ADJUST_TARGET_BUDGET", "SET_ROOT_LIMIT"] as const)("preserves authoritative amount-free %s results", async operation => {
    const rootLimit = operation === "SET_ROOT_LIMIT";
    const i = commandIntent.parse({ ...intent, resource: rootLimit ? { kind: "ROOT", id: "TEST_ONLY:root" } : intent.resource,
      business_payload: { schema_version: "pma.capital-command.v1.1", operation, idempotency_key: intent.business_payload.idempotency_key,
        recipient_kind: rootLimit ? "ROOT" : "PORTFOLIO", currency: "USDT", reason: "TEST_ONLY:amount-free-command",
        expected_versions: rootLimit ? { budget: "1", source: "2" } : { budget: "1", source: "2", parent: "3", book: "4" },
        ...(rootLimit ? { target_root_limit: "200" } : { target_budget: "200" }) } });
    const { trust, gateway } = setup({ operations: [operation] }, i), real = gateway.exchange.getMockImplementation()!;
    for (const state of ["APPLIED", "REJECTED"] as const) {
      gateway.exchange.mockImplementationOnce(async input => {
        const reply = await real(input); reply.result.business.state = state; reply.result.business.amounts = null; return reply;
      });
      expect(await trust.send({ authorization: authorization(i), intent: i, signal })).toMatchObject({ delivery: "ACKNOWLEDGED",
        business: { state, amounts: null, receipt_ref: "TEST_ONLY:receipt", revision: "9007199254740993" } });
    }
    expect(gateway.exchange).toHaveBeenCalledTimes(2);
  });
  it("does not use the fresh-human-only PM transport as service recovery", async () => {
    const { trust, gateway, selection } = setup();
    expect(edgeCommandUnavailable(selection, "TOP_UP", true)).toBe("EDGE_COMMAND_SERVICE_RECOVERY_NOT_COMMISSIONED");
    expect(await trust.lookup(submission())).toBeNull(); expect(gateway.original).not.toHaveBeenCalled(); expect(gateway.prepareCall).not.toHaveBeenCalled();
  });
  it("queries only the durable original with separately selected service authority after human expiry", async () => {
    const { gateway, selection, original } = setup({ recovery: "EXPLICIT_SERVICE_STATUS_ONLY" });
    const real = gateway.prepareCall.getMockImplementation()!;
    gateway.prepareCall.mockImplementationOnce(async input => ({ ...await real(input), issued_at_ms: now + 20_000, expires_at_ms: now + 25_000 }));
    const trust = createEdgeCommandTrust(selection, gateway, () => now + 20_000);
    expect(await trust.lookup(submission())).toEqual(result());
    expect(gateway.prepare).not.toHaveBeenCalled();
    expect(gateway.exchange.mock.calls[0][0]).toMatchObject({ action: "STATUS", original,
      prepared: { authority: "EXPLICIT_SERVICE_RECOVERY", actor_id: null } });
  });
  it("rejects human impersonation for service status and stops after retained-original expiry", async () => {
    const { trust, gateway, selection } = setup({ recovery: "EXPLICIT_SERVICE_STATUS_ONLY" }), real = gateway.prepareCall.getMockImplementation()!;
    gateway.prepareCall.mockImplementationOnce(async input => ({ ...await real(input), authority: "CURRENT_HUMAN", actor_id: actor.user_id }));
    expect(await trust.lookup(submission())).toBeNull(); expect(gateway.exchange).not.toHaveBeenCalled();
    expect(await createEdgeCommandTrust(selection, gateway, () => now + 120_000).lookup(submission())).toBeNull();
    expect(gateway.original).toHaveBeenCalledTimes(1);
  });
  it("honors abort before any gateway dispatch", async () => {
    const { trust, gateway } = setup(), controller = new AbortController(); controller.abort();
    await expect(trust.send({ ...submission(), signal: controller.signal })).rejects.toThrow();
    expect(gateway.original).not.toHaveBeenCalled(); expect(gateway.exchange).not.toHaveBeenCalled();
  });
});
