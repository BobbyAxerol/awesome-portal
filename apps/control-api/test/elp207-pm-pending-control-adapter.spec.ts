/** Synthetic current PM protocol fixtures; no installed trust, HTTP/PG effect,
 * actual grant, through-COMMIT lease or runtime commissioning is proven. */
import { describe, expect, it, vi } from "vitest";
import { encodePmaPendingControlRequest, encodePmaPendingControlStatusRequest, parsePmaPendingControlWire,
  projectPmaPendingControlCandidateResult, serializePmaPendingControlWire } from "../src/execution-v2/pm-pending-control-adapter";
import { pmHttpRequestDigest } from "../src/execution-v2/pm-http-request-binding";
import { commandIntent } from "../src/execution-v2/command.contract";
import { sourceCommandResult, unqualifiedCommandTrust } from "../src/execution-v2/command-trust";

const body = (operation = "APPLY_PENDING") => ({ schema_version: "pma.operator-control.v1", operation,
  idempotency_key: "TEST_ONLY-apply-key", recipient_kind: "PORTFOLIO", currency: "USDT", reason: "TEST_ONLY pending remainder",
  command_id: "TEST_ONLY-original-command", expected_versions: { budget: "9007199254740993", source: "2", parent: "3", book: "4", command: "5" } });
const context = () => ({ target_ref: "TEST_ONLY-target", original_command_id: "TEST_ONLY-original-command",
  recipient: { recipient_kind: "PORTFOLIO" as const, currency: "USDT" } });
const limits = { request_bytes: 10_000 }, resultLimits = { response_bytes: 10_000 }; // TEST_ONLY, no defaults.
const amounts = () => ({ requested: "100.000000000000000001", applied: "40.000000000000000001", pending: "60", cancelled: "0", rejected: "0" });
const waiting = () => ({ state: "WAITING_ENCUMBRANCE", business_applied: false, next_action: "QUERY_SAME_INTENT", cli_exit_code: "3",
  physical_transfer_performed: false, operation: "APPLY_PENDING", command_id: "TEST_ONLY-original-command", command_version: "6",
  ...amounts(), delta: "0", budget_version: "9007199254740994", parent_version: "3", source_version: "3", book_version: "5",
  receipt_id: "TEST_ONLY-receipt-apply", source_event_id: "TEST_ONLY-event-apply", payload_digest: "a".repeat(64), economic_cash_changed: false });
const unknown = () => ({ state: "UNKNOWN", business_applied: null, next_action: "QUERY_SAME_INTENT", cli_exit_code: "3" });
const cancelled = () => ({ ...waiting(), state: "PARTIALLY_APPLIED_CANCELLED", next_action: "REVIEW_RECEIPT", cli_exit_code: "2",
  operation: "CANCEL_REMAINING", pending: "0", cancelled: "60", receipt_id: "TEST_ONLY-receipt-cancel", source_event_id: "TEST_ONLY-event-cancel" });
function refused(call: () => unknown, code = "PM_PENDING_RESULT_INVALID") {
  expect(call).toThrowError(expect.objectContaining({ name: "PmPendingControlCandidateError", code }));
}
const project = (value: unknown, request: unknown = body()) => projectPmaPendingControlCandidateResult(value, request, resultLimits);

describe("ELP2-07 finite pending/cancel source candidate codec", () => {
  it.each(["APPLY_PENDING", "CANCEL_REMAINING"])("keeps exact %s original command and all five CAS keys", operation => {
    expect(parsePmaPendingControlWire(body(operation))).toEqual(body(operation));
    expect(JSON.parse(serializePmaPendingControlWire(body(operation)))).toEqual(body(operation));
    for (const key of Object.keys(body().expected_versions)) {
      const expected_versions = { ...body().expected_versions } as Record<string, string>; delete expected_versions[key];
      refused(() => parsePmaPendingControlWire({ ...body(operation), expected_versions }), "PM_PENDING_WIRE_INVALID");
    }
    refused(() => parsePmaPendingControlWire({ ...body(operation), expected_versions: { ...body().expected_versions, lock: "1" } }), "PM_PENDING_WIRE_INVALID");
  });
  it("binds exact deployment pair/currency/command and refuses owning ROOT, extra amount and wrong family", () => {
    const request = { ...body(), recipient_kind: "DEPLOYMENT_ACCOUNT", recipient_account_id: "TEST_ONLY-account", recipient_deployment_id: "TEST_ONLY-deploy" };
    const ctx = { ...context(), recipient: { recipient_kind: "DEPLOYMENT_ACCOUNT" as const, currency: "USDT",
      recipient_account_id: "TEST_ONLY-account", recipient_deployment_id: "TEST_ONLY-deploy" }, stage: "APPLY" as const };
    expect(encodePmaPendingControlRequest(request, ctx, limits).wire).toEqual(request);
    for (const key of ["recipient_account_id", "recipient_deployment_id", "currency"] as const)
      refused(() => encodePmaPendingControlRequest(request, { ...ctx, recipient: { ...ctx.recipient, [key]: "other" } }, limits), "PM_PENDING_TARGET_MISMATCH");
    refused(() => encodePmaPendingControlRequest(body(), { ...context(), original_command_id: "other", stage: "PREVIEW" }, limits), "PM_PENDING_TARGET_MISMATCH");
    for (const patch of [{ recipient_kind: "ROOT" }, { amount: "1" }, { lock_id: "not-this-family" }, { operation: "ADMIN_LOCK" },
      { recipient_account_id: "extra" }, { actor: "spoof" }, { source_url: "https://invalid" }])
      refused(() => parsePmaPendingControlWire({ ...body(), ...patch }), "PM_PENDING_WIRE_INVALID");
    const { recipient_deployment_id: _pair, ...incomplete } = request;
    refused(() => parsePmaPendingControlWire(incomplete), "PM_PENDING_WIRE_INVALID");
  });
  it("encodes detached exact POST/status bytes without a sender or treating BUDGET as report authority", () => {
    const input = body(), ctx = { ...context(), target_ref: "TEST_ONLY-α:target", stage: "PREVIEW" as const };
    const encoded = encodePmaPendingControlRequest(input, ctx, limits), before = Buffer.from(encoded.request.body);
    expect(encoded.request.raw_path.toString()).toBe("/internal/pma11-candidate/capital/TEST_ONLY-%CE%B1%3Atarget/preview");
    expect(encoded.required_source_capability).toBe("BUDGET"); expect(encoded.request_digest).toBe(pmHttpRequestDigest(encoded.request, limits));
    input.command_id = "changed"; input.expected_versions.command = "9";
    expect(encoded.request.body).toEqual(before); expect(encoded.wire.command_id).toBe("TEST_ONLY-original-command");
    expect(serializePmaPendingControlWire(Object.fromEntries(Object.entries(body()).reverse()))).toBe(serializePmaPendingControlWire(body()));
    const status = encodePmaPendingControlStatusRequest({ ...body(), idempotency_key: "TEST_ONLY-α &key" }, context(), limits);
    expect(status.request.method).toBe("GET"); expect(status.request.body).toHaveLength(0); expect(status.required_source_capability).toBe("REPORT");
    expect(status.request.query_string.toString()).toBe("operation=APPLY_PENDING&key=TEST_ONLY-%CE%B1%20%26key");
    expect(status.request_digest).toBe(pmHttpRequestDigest(status.request, limits));
    expect(pmHttpRequestDigest({ ...encoded.request, body: Buffer.concat([before, Buffer.from(" ")]) }, limits)).not.toBe(encoded.request_digest);
    expect(() => encodePmaPendingControlRequest(body(), { ...context(), stage: "APPLY" }, { request_bytes: 1 })).toThrow();
  });
  it.each(["\n", "\r\n", "\u2028", "\u2029"])("refuses terminal line breaks in every request/result numeric and digest fact %#", ending => {
    for (const key of Object.keys(body().expected_versions))
      refused(() => parsePmaPendingControlWire({ ...body(), expected_versions: { ...body().expected_versions, [key]: `1${ending}` } }), "PM_PENDING_WIRE_INVALID");
    for (const key of ["requested", "applied", "pending", "cancelled", "rejected", "delta", "budget_version", "parent_version", "source_version", "book_version", "command_version"])
      refused(() => project({ ...waiting(), [key]: `1${ending}` }));
    refused(() => project({ ...waiting(), payload_digest: `${"a".repeat(64)}${ending}` }));
  });
  it("refuses malformed Unicode, unsafe counters, target paths, getters, symbols, prototypes and sparse blockers", () => {
    for (const command_id of ["\ud800", "\udc00", " bad", "bad\u0000", "α".repeat(257)])
      refused(() => parsePmaPendingControlWire({ ...body(), command_id }), "PM_PENDING_WIRE_INVALID");
    for (const command of [1, "01", "9223372036854775808"])
      refused(() => parsePmaPendingControlWire({ ...body(), expected_versions: { ...body().expected_versions, command } }), "PM_PENDING_WIRE_INVALID");
    for (const target_ref of [".", "..", "../target", "bad\\path", "bad?query", "bad#fragment", "\ud800"])
      refused(() => encodePmaPendingControlRequest(body(), { ...context(), target_ref, stage: "APPLY" }, limits), "PM_PENDING_TARGET_MISMATCH");
    const getter = vi.fn(() => "APPLY_PENDING");
    refused(() => parsePmaPendingControlWire(Object.defineProperty(body(), "operation", { enumerable: true, get: getter })), "PM_PENDING_WIRE_INVALID");
    const nested = Object.defineProperty({ ...body().expected_versions }, "command", { enumerable: true, get: getter });
    refused(() => parsePmaPendingControlWire({ ...body(), expected_versions: nested }), "PM_PENDING_WIRE_INVALID");
    const ctx = Object.defineProperty({ ...context(), stage: "APPLY" as const }, "recipient", { enumerable: true, get: getter });
    refused(() => encodePmaPendingControlRequest(body(), ctx, limits), "PM_PENDING_TARGET_MISMATCH");
    refused(() => parsePmaPendingControlWire(Object.assign(Object.create({ admin: true }), body())), "PM_PENDING_WIRE_INVALID");
    refused(() => parsePmaPendingControlWire({ ...body(), [Symbol("authority")]: true }), "PM_PENDING_WIRE_INVALID");
    refused(() => project(Object.defineProperty(waiting(), "state", { enumerable: true, get: getter })));
    refused(() => project({ ...waiting(), blockers: Object.defineProperty(["block"], "0", { enumerable: true, get: getter }) }));
    refused(() => project({ ...waiting(), blockers: Array(1) })); expect(getter).not.toHaveBeenCalled();
  });
  it("preserves actual WAITING with applied capital and partial cancellation without rewriting delta or history", () => {
    const partial = project(waiting()); expect(partial.source_summary).toEqual(waiting());
    expect(partial.partition).toEqual({ availability: "AVAILABLE", value: amounts(), missing_fields: [] });
    const result = project(cancelled(), body("CANCEL_REMAINING")); expect(result.source_summary.applied).toBe(waiting().applied);
    expect(result.source_summary.delta).toBe("0"); expect(result.source_summary.business_applied).toBe(false);
    expect(result).toMatchObject({ authority: "NOT_AUTHENTICATED", authoritative_business_applied: null, trusted_command_status: null });
    expect(sourceCommandResult.safeParse(result).success).toBe(false);
  });
  it("detaches projected flat facts, blockers and partition from caller mutation", () => {
    const raw = { ...waiting(), blockers: ["TEST_ONLY-restriction"] }, result = project(raw);
    raw.applied = "999"; raw.blockers[0] = "changed";
    expect(result.source_summary.applied).toBe(amounts().applied);
    expect(result.source_summary.blockers).toEqual(["TEST_ONLY-restriction"]);
    expect(result.partition.value?.applied).toBe(amounts().applied);
  });
  it.each(["APPLIED", "REJECTED", "CANCELLED"])("validates current owning terminal %s without changing source CLI semantics", state => {
    const requestedOperation = state === "APPLIED" ? "APPLY_PENDING" : "CANCEL_REMAINING";
    const value = { ...waiting(), state, operation: requestedOperation, applied: "0", pending: "0", cancelled: "0", rejected: "0",
      next_action: "REVIEW_RECEIPT", cli_exit_code: state === "APPLIED" ? "0" : "2", business_applied: state === "APPLIED" };
    const partitionKey = state === "APPLIED" ? "applied" : state === "REJECTED" ? "rejected" : "cancelled";
    value[partitionKey] = value.requested;
    expect(project(value, body(requestedOperation)).source_summary).toEqual(value);
  });
  it("keeps rollback preview, missing lookup and incomplete amounts typed absent rather than applied/zero", () => {
    const { receipt_id: _receipt, source_event_id: _event, ...base } = waiting();
    const preview = { ...base, state: "PREVIEW_ONLY", predicted_state: "WAITING_ENCUMBRANCE", reserved: false, next_action: "REVIEW_PREVIEW", cli_exit_code: "0" };
    expect(project(preview).source_summary).toEqual(preview);
    expect(project(unknown()).partition).toMatchObject({ availability: "NOT_PUBLISHED", reason_code: "SOURCE_PARTITION_NOT_PUBLISHED", value: null });
    expect(project(unknown()).source_summary).not.toHaveProperty("requested");
    const { rejected: _missing, ...incomplete } = waiting();
    const result = project(incomplete); expect(result.partition).toMatchObject({ availability: "NOT_PUBLISHED", reason_code: "SOURCE_PARTITION_INCOMPLETE", value: null, missing_fields: ["rejected"] });
    expect(result.source_summary.applied).toBe(incomplete.applied); expect(result.source_summary).not.toHaveProperty("rejected");
  });
  it("preserves original queried receipt and different latest owning operation with explicit correspondence only", () => {
    const linked = { ...cancelled(), queried_operation: "APPLY_PENDING", original_receipt_id: waiting().receipt_id };
    const result = project(linked); expect(result.source_summary).toEqual(linked); expect(result.requested_operation).toBe("APPLY_PENDING");
    for (const patch of [{ queried_operation: "CANCEL_REMAINING" }, { original_receipt_id: linked.receipt_id }, { command_id: "other" }])
      refused(() => project({ ...linked, ...patch }));
    const { queried_operation: _query, ...missingQuery } = linked; refused(() => project(missingQuery));
    const { original_receipt_id: _original, ...missingOriginal } = linked; refused(() => project(missingOriginal));
    refused(() => project(cancelled()));
  });
  it.each([
    { state: "PARTIALLY_APPLIED" }, { state: "PENDING" }, { state: "PENDING_DRAIN" }, { state: "RECONCILING" }, { state: "FILLED" },
    { business_applied: true }, { next_action: "REVIEW_RECEIPT" }, { cli_exit_code: 3 }, { cli_exit_code: "2" }, { pending: "0" },
    { rejected: "1" }, { physical_transfer_performed: true }, { economic_cash_changed: true }, { requested: "100" }, { applied: "1e2" },
    { receipt_id: null }, { source_event_id: null }, { payload_digest: `sha256:${"a".repeat(64)}` }, { qualification: "OWNER_VERIFIED" },
    { child_blockers: [] }, { raw_proof: {} }, { credential: "spoof" },
  ])("refuses contradictory, broader or invented result %#", patch => { refused(() => project({ ...waiting(), ...patch })); });
  it("requires finite response bounds, preview no receipt, complete-partition exactness and no authority activation", async () => {
    for (const response_bytes of [0, -1, 0.5, NaN, Infinity, 32 * 1024 + 1, 1])
      refused(() => projectPmaPendingControlCandidateResult(unknown(), body(), { response_bytes }));
    const { receipt_id: _r, source_event_id: _e, ...base } = waiting();
    refused(() => project({ ...base, state: "PREVIEW_ONLY", predicted_state: "WAITING_ENCUMBRANCE", reserved: false,
      next_action: "REVIEW_PREVIEW", cli_exit_code: "0", receipt_id: "fabricated" }));
    refused(() => project({ ...cancelled(), applied: "0" }, body("CANCEL_REMAINING")));
    expect(commandIntent.safeParse({ schema_version: "execution.capital-intent.v2", workspace_id: "TEST_ONLY-workspace",
      resource: { kind: "PORTFOLIO", id: "TEST_ONLY-target" }, environment: "paper", expected_policy_revision: "TEST_ONLY-policy", business_payload: body() }).success).toBe(false);
    expect(await unqualifiedCommandTrust.prepare({} as never)).toBeNull();
    await expect(unqualifiedCommandTrust.send({} as never)).rejects.toThrow("COMMAND_RELAY_NOT_QUALIFIED");
  });
});
