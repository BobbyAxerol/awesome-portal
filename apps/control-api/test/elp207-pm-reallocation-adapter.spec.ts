/** SYNTHETIC source protocol examples only: no authentic composite permit,
 * current grant/recipient map, economic receipt, command or native transfer. */
import { describe, expect, it, vi } from "vitest";
import { encodePmaReallocationRequest, encodePmaReallocationStatusRequest, parsePmaReallocationWire,
  projectPmaReallocationCandidateResult, serializePmaReallocationWire } from "../src/execution-v2/pm-reallocation-adapter";
import { pmHttpRequestDigest } from "../src/execution-v2/pm-http-request-binding";
import { commandIntent } from "../src/execution-v2/command.contract";
import { sourceCommandResult, unqualifiedCommandTrust } from "../src/execution-v2/command-trust";
const body = () => ({ schema_version: "pma.operator-control.v1", operation: "REALLOCATE_BUDGET",
  idempotency_key: "TEST_ONLY-reallocation-key", recipient_kind: "PORTFOLIO", currency: "USDT", reason: "TEST_ONLY-composite",
  amount: "50.25", source_account_id: "TEST_ONLY-source-account", source_deployment_id: "TEST_ONLY-source-deployment",
  target_account_id: "TEST_ONLY-target-account", target_deployment_id: "TEST_ONLY-target-deployment",
  expected_versions: { budget: "1", source: "10", book: "2", source_budget: "3", source_book: "4", target_budget: "5", target_book: "6" } });
const context = () => ({ target_ref: "TEST_ONLY-parent-portfolio-reference" });
const limits = { request_bytes: 10_000 }, resultLimits = { response_bytes: 10_000 }; // TEST_ONLY, never defaults.
const missing = () => ({ state: "UNKNOWN", business_applied: null, next_action: "QUERY_SAME_INTENT", cli_exit_code: "3" });
const applied = () => ({ state: "APPLIED", business_applied: true, next_action: "REVIEW_RECEIPT", cli_exit_code: "0",
  requested: "50.25", applied: "50.25", pending: "0", cancelled: "0", rejected: "0", source_version: "11",
  versions_before: [["2", "1"], ["4", "3"], ["6", "5"]], versions_after: [["3", "2"], ["5", "4"], ["7", "6"]],
  source_budget_before: "400.50", source_budget_after: "350.25", target_budget_before: "100.0", target_budget_after: "150.25",
  parent_delegated: "500.50", economic_cash_changed: false, physical_transfer_performed: false, payload_digest: "a".repeat(64),
  receipt_id: "TEST_ONLY-receipt", source_event_id: "TEST_ONLY-event", legs: [
    { leg: "RETURN", leg_id: "4".repeat(64), debited_id: "2".repeat(64), credited_id: "1".repeat(64), amount: "50.25" },
    { leg: "REGRANT", leg_id: "5".repeat(64), debited_id: "1".repeat(64), credited_id: "3".repeat(64), amount: "50.25" }] });
const preview = () => { const { receipt_id: _receipt, source_event_id: _event, ...facts } = applied();
  return { ...facts, state: "PREVIEW_ONLY", predicted_state: "APPLIED", business_applied: false,
    reserved: false, next_action: "REVIEW_PREVIEW", cli_exit_code: "0" }; };
const project = (value: unknown, request: unknown = body()) => projectPmaReallocationCandidateResult(value, request, resultLimits);
function refused(call: () => unknown, code = "PM_REALLOCATION_RESULT_INVALID") {
  expect(call).toThrowError(expect.objectContaining({ name: "PmReallocationCandidateError", code }));
}
describe("ELP2-07 finite atomic REALLOCATE_BUDGET candidate, no sender or grants", () => {
  it("preserves12 exact fields,7 CAS dimensions, decimal spelling and deterministic body bytes", () => {
    expect(parsePmaReallocationWire(body())).toEqual(body());
    expect(JSON.parse(serializePmaReallocationWire(body()))).toEqual(body());
    const reversed = Object.fromEntries(Object.entries(body()).reverse());
    expect(serializePmaReallocationWire(reversed)).toBe(serializePmaReallocationWire(body()));
    expect(parsePmaReallocationWire({ ...body(), amount: "50.2500" }).amount).toBe("50.2500");
    for (const key of Object.keys(body().expected_versions)) expect(parsePmaReallocationWire({ ...body(),
      expected_versions: { ...body().expected_versions, [key]: "9223372036854775807" } }).expected_versions)
      .toHaveProperty(key, "9223372036854775807");
  });
  it("requires exact parent/source/destination fields and rejects root/direct/cross-family bodies", () => {
    for (const key of Object.keys(body())) { const value: Record<string, unknown> = { ...body() }; delete value[key];
      refused(() => parsePmaReallocationWire(value), "PM_REALLOCATION_WIRE_INVALID"); }
    for (const key of Object.keys(body().expected_versions)) {
      const expected_versions: Record<string, unknown> = { ...body().expected_versions }; delete expected_versions[key];
      refused(() => parsePmaReallocationWire({ ...body(), expected_versions }), "PM_REALLOCATION_WIRE_INVALID"); }
    for (const patch of [{ recipient_kind: "ROOT" }, { recipient_kind: "DEPLOYMENT_ACCOUNT" }, { operation: "RECALL_PARTIAL" },
      { recipient_account_id: "spoof" }, { parent_id: "spoof" }, { actor: "spoof" }, { permit: { certified: true } }, { authority: true }])
      refused(() => parsePmaReallocationWire({ ...body(), ...patch }), "PM_REALLOCATION_WIRE_INVALID");
    refused(() => parsePmaReallocationWire({ ...body(), source_account_id: body().target_account_id }), "PM_REALLOCATION_WIRE_INVALID");
    refused(() => parsePmaReallocationWire({ ...body(), source_deployment_id: body().target_deployment_id }), "PM_REALLOCATION_WIRE_INVALID");
    refused(() => parsePmaReallocationWire({ ...body(), expected_versions: { ...body().expected_versions, parent: "1" } }), "PM_REALLOCATION_WIRE_INVALID");
  });
  it.each(["\n", "\r\n", "\u2028", "\u2029"])("refuses trailing scalar whitespace %#", ending => {
    refused(() => parsePmaReallocationWire({ ...body(), amount: `1${ending}` }), "PM_REALLOCATION_WIRE_INVALID");
    for (const key of Object.keys(body().expected_versions)) refused(() => parsePmaReallocationWire({ ...body(),
      expected_versions: { ...body().expected_versions, [key]: `1${ending}` } }), "PM_REALLOCATION_WIRE_INVALID");
    refused(() => project({ ...applied(), requested: `50.25${ending}` }));
    refused(() => project({ ...applied(), payload_digest: `${"a".repeat(64)}${ending}` }));
    refused(() => project({ ...applied(), source_version: `11${ending}` }));
  });
  it("refuses zero/negative/nonfinite/nondecimal amounts and unsafe counters/Unicode", () => {
    for (const amount of ["0", "0.000", "-1", "1e2", "01", "Infinity", 1, true])
      refused(() => parsePmaReallocationWire({ ...body(), amount }), "PM_REALLOCATION_WIRE_INVALID");
    for (const source of [1, "01", "-1", "9223372036854775808", "1.0"])
      refused(() => parsePmaReallocationWire({ ...body(), expected_versions: { ...body().expected_versions, source } }), "PM_REALLOCATION_WIRE_INVALID");
    for (const reason of ["", " bad", "bad\u0000", "\ud800", "\udc00", "α".repeat(257)])
      refused(() => parsePmaReallocationWire({ ...body(), reason }), "PM_REALLOCATION_WIRE_INVALID");
  });
  it.each(["PREVIEW", "APPLY"] as const)("encodes fixed %s request bytes, no native or recall/grant send", stage => {
    const input = body(), encoded = encodePmaReallocationRequest(input, { ...context(), stage }, limits);
    const captured = Buffer.from(encoded.request.body); input.expected_versions.source = "20";
    expect(encoded.request.method).toBe("POST"); expect(encoded.request.query_string).toHaveLength(0);
    expect(encoded.request.raw_path.toString()).toBe(`/internal/pma11-candidate/capital/TEST_ONLY-parent-portfolio-reference/${stage.toLowerCase()}`);
    expect(encoded.request.body).toEqual(captured); expect(encoded.wire.expected_versions.source).toBe("10");
    expect(encoded.required_source_capability).toBe("BUDGET"); expect(encoded.request_digest).toBe(pmHttpRequestDigest(encoded.request, limits));
  });
  it("uses same original operation/key for current REPORT lookup and preserves opaque pair aliases", () => {
    const input = { ...body(), idempotency_key: "TEST_ONLY-α &key", source_account_id: "TEST_ONLY-legacy-source-alias" };
    const encoded = encodePmaReallocationStatusRequest(input, { target_ref: "TEST_ONLY-α:parent" }, limits);
    expect(encoded.request.method).toBe("GET"); expect(encoded.request.body).toHaveLength(0);
    expect(encoded.required_source_capability).toBe("REPORT");
    expect(encoded.request.raw_path.toString()).toBe("/internal/pma11-candidate/capital/TEST_ONLY-%CE%B1%3Aparent/status");
    expect(encoded.request.query_string.toString()).toBe("operation=REALLOCATE_BUDGET&key=TEST_ONLY-%CE%B1%20%26key");
    expect(encoded.wire.source_account_id).toBe(input.source_account_id);
  });
  it("rejects traversal, ambiguous contexts/stages and any claimed authority in context", () => {
    for (const target_ref of [".", "..", "../parent", "bad\\path", "bad?query", "bad#fragment", "\ud800"])
      refused(() => encodePmaReallocationRequest(body(), { target_ref, stage: "APPLY" }, limits), "PM_REALLOCATION_TARGET_MISMATCH");
    for (const patch of [{ stage: "PREPARE" }, { actor: "spoof" }, { source_url: "https://invalid" }, { scopes: ["spoof"] }])
      refused(() => encodePmaReallocationRequest(body(), { ...context(), stage: "APPLY", ...patch } as never, limits), "PM_REALLOCATION_TARGET_MISMATCH");
  });
  it("keeps full atomic source receipt facts but never authenticates request identity or the3 grant legs", () => {
    const result = project(applied()); expect(result.source_summary).toEqual(applied());
    expect(result).toMatchObject({ kind: "PM_REALLOCATION_CANDIDATE_ONLY", authority: "NOT_AUTHENTICATED",
      authoritative_business_applied: null, trusted_command_status: null,
      partition: { availability: "AVAILABLE", value: { requested: "50.25", applied: "50.25", pending: "0" } },
      request_binding: { availability: "NOT_PUBLISHED", reason_code: "SOURCE_SUMMARY_REQUEST_IDENTITY_NOT_PUBLISHED", value: null } });
    expect(result.source_summary).not.toHaveProperty("command_id"); expect(result.source_summary).not.toHaveProperty("operation");
    expect(sourceCommandResult.safeParse(result).success).toBe(false);
    expect(project(applied(), { ...body(), amount: "50.2500" }).source_summary).toEqual(applied());
  });
  it("keeps rolled-back preview quantities/legs distinct from committed receipt or reserved capacity", () => {
    expect(project(preview()).source_summary).toEqual(preview());
    for (const patch of [{ receipt_id: "invented" }, { source_event_id: "invented" }, { business_applied: true },
      { predicted_state: "PARTIALLY_APPLIED" }, { reserved: true }]) refused(() => project({ ...preview(), ...patch }));
  });
  it("returns typed UNKNOWN absence, not fake amounts/partial outcomes or a new-key retry", () => {
    expect(project(missing())).toMatchObject({ source_summary: missing(), partition: {
      availability: "NOT_PUBLISHED", reason_code: "SOURCE_REALLOCATION_STATUS_UNKNOWN", value: null } });
    for (const patch of [{ business_applied: false }, { requested: "0" }, { receipt_id: "invented" }, { payload_digest: "a".repeat(64) }])
      refused(() => project({ ...missing(), ...patch }));
    for (const state of ["PARTIALLY_APPLIED", "WAITING_ENCUMBRANCE", "PENDING", "RECONCILING", "CANCELLED", "REJECTED"])
      refused(() => project({ ...applied(), state }));
  });
  it("rejects incomplete guaranteed facts rather than manufacturing the missing composite proof", () => {
    for (const key of ["legs", "versions_before", "versions_after", "source_version", "source_budget_before", "parent_delegated",
      "requested", "applied", "pending", "cancelled", "rejected", "receipt_id", "source_event_id", "payload_digest"]) {
      const value: Record<string, unknown> = { ...applied() }; delete value[key]; refused(() => project(value));
    }
    for (const patch of [{ operation: "REALLOCATE_BUDGET" }, { command_id: body().idempotency_key }, { target: "invented" },
      { command_version: "1" }, { approval_ref: "not-in-source-presenter" }, { release_evidence_ref: "not-in-source-presenter" },
      { economic_cash_changed: true }, { physical_transfer_performed: true }, { native_dispatch_performed: false }])
      refused(() => project({ ...applied(), ...patch }));
  });
  it("validates exact decimal conservation without floats or rewriting returned spellings", () => {
    expect(project({ ...applied(), applied: "50.250000", legs: applied().legs.map(leg => ({ ...leg, amount: "50.2500" })) })
      .source_summary).toMatchObject({ applied: "50.250000" });
    for (const patch of [{ requested: "50.2500000000000001" }, { applied: "50.24" }, { pending: "0.01" },
      { cancelled: "0.01" }, { rejected: "0.01" }, { source_budget_after: "350.2500000000000001" },
      { target_budget_after: "150.24" }, { parent_delegated: "500.49" }]) refused(() => project({ ...applied(), ...patch }));
  });
  it("checks each parent/source/target book+budget CAS and exactly one revision advance", () => {
    for (const field of ["versions_before", "versions_after"] as const) for (let row = 0; row < 3; row++) for (let col = 0; col < 2; col++) {
      const value = applied(); value[field][row][col] = "20"; refused(() => project(value));
    }
    refused(() => project({ ...applied(), source_version: "12" }));
    const value = applied(); value.versions_after[0][0] = "3\n"; refused(() => project(value));
  });
  it("requires the exact two RETURN/REGRANT legs via the same parent with distinct opaque IDs", () => {
    for (const index of [0, 1]) for (const patch of [{ amount: "50.24" }, { leg_id: "bad" }, { debited_id: "bad" },
      { credited_id: "bad" }, { leg: "TRANSFER" }, { native_order_id: "spoof" }]) {
      const value = applied(); value.legs[index] = { ...value.legs[index], ...patch }; refused(() => project(value));
    }
    const reversed = applied(); reversed.legs.reverse(); refused(() => project(reversed));
    const wrongParent = applied(); wrongParent.legs[1].debited_id = "6".repeat(64); refused(() => project(wrongParent));
    const sameTarget = applied(); sameTarget.legs[1].credited_id = sameTarget.legs[0].debited_id; refused(() => project(sameTarget));
    const sameLeg = applied(); sameLeg.legs[1].leg_id = sameLeg.legs[0].leg_id; refused(() => project(sameLeg));
    const one = applied(); one.legs.pop(); refused(() => project(one));
  });
  it("rejects getters/prototypes/symbols/sparse or augmented arrays before reading source values", () => {
    const getter = vi.fn(() => "spoof");
    refused(() => parsePmaReallocationWire(Object.defineProperty(body(), "amount", { enumerable: true, get: getter })), "PM_REALLOCATION_WIRE_INVALID");
    refused(() => parsePmaReallocationWire({ ...body(), expected_versions: Object.defineProperty({ ...body().expected_versions },
      "source", { enumerable: true, get: getter }) }), "PM_REALLOCATION_WIRE_INVALID");
    refused(() => parsePmaReallocationWire(Object.assign(Object.create({ authority: true }), body())), "PM_REALLOCATION_WIRE_INVALID");
    refused(() => project({ ...applied(), [Symbol("authority")]: true }));
    const legs = applied().legs; Object.defineProperty(legs, "0", { enumerable: true, get: getter }); refused(() => project({ ...applied(), legs }));
    const rows = applied().versions_before; Object.defineProperty(rows[0], "1", { enumerable: true, get: getter });
    refused(() => project({ ...applied(), versions_before: rows }));
    const sparse = new Array(2); sparse[0] = applied().legs[0]; refused(() => project({ ...applied(), legs: sparse }));
    refused(() => project({ ...applied(), legs: Object.assign(applied().legs, { extra: true }) }));
    expect(getter).not.toHaveBeenCalled();
  });
  it("keeps request/response bounds explicit and public capital/trust defaults unchanged", async () => {
    for (const response_bytes of [0, -1, NaN, Infinity, 1.5, 32 * 1024 + 1, 1])
      refused(() => projectPmaReallocationCandidateResult(missing(), body(), { response_bytes }));
    expect(() => encodePmaReallocationRequest(body(), { ...context(), stage: "APPLY" }, { request_bytes: 1 })).toThrow();
    expect(commandIntent.safeParse({ schema_version: "execution.capital-intent.v2", workspace_id: "TEST_ONLY-ws",
      resource: { kind: "PORTFOLIO", id: "TEST_ONLY-parent" }, environment: "paper",
      expected_policy_revision: "TEST_ONLY-rev", business_payload: body() }).success).toBe(false);
    expect(await unqualifiedCommandTrust.prepare({} as never)).toBeNull();
    await expect(unqualifiedCommandTrust.send({} as never)).rejects.toThrow("COMMAND_RELAY_NOT_QUALIFIED");
  });
});
