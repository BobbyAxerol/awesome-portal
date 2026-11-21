/** Synthetic PM candidate protocol only. No trust, owning effect, HTTP/PG,
 * installed grants, current source lease or runtime commissioning is proven. */
import { describe, expect, it, vi } from "vitest";
import { encodePmaAdminControlRequest, parsePmaAdminControlWire, serializePmaAdminControlWire,
  projectPmaAdminControlCandidateResult, PmAdminControlCandidateError } from "../src/execution-v2/pm-control-adapter";
import { pmHttpRequestDigest } from "../src/execution-v2/pm-http-request-binding";
import { commandIntent } from "../src/execution-v2/command.contract";
import { sourceCommandResult, unqualifiedCommandTrust } from "../src/execution-v2/command-trust";

const lock = () => ({ schema_version: "pma.operator-control.v1", operation: "ADMIN_LOCK", idempotency_key: "TEST_ONLY-lock-key",
  recipient_kind: "PORTFOLIO", currency: "USDT", reason: "TEST_ONLY manager lock", lock_id: "TEST_ONLY-lock-id",
  lock_kind: "AMOUNT", amount: "1.230000000000000001", expected_versions: { budget: "9007199254740993", source: "2" } });
function unlock() { const { lock_kind: _kind, amount: _amount, ...base } = lock();
  return { ...base, operation: "ADMIN_UNLOCK", expected_versions: { budget: "9007199254740994", source: "2", lock: "1" } }; }
const target = () => ({ target_ref: "TEST_ONLY-target", stage: "PREVIEW" as const,
  recipient: { recipient_kind: "PORTFOLIO" as const, currency: "USDT" } });
const limits = { request_bytes: 10_000 }, resultLimits = { response_bytes: 10_000 }; // TEST_ONLY explicit caps, no defaults.
const applied = () => ({ state: "APPLIED", business_applied: true, next_action: "REVIEW_RECEIPT", cli_exit_code: "0",
  physical_transfer_performed: false, operation: "ADMIN_LOCK", lock_id: "TEST_ONLY-lock-id", kind: "AMOUNT", active: true,
  amount: "1.230000000000000001", lock_version: "1", budget_version: "9007199254740994", source_version: "2",
  receipt_id: "TEST_ONLY-owning-receipt", source_event_id: "TEST_ONLY-source-event", payload_digest: "a".repeat(64) });
const preview = () => { const { receipt_id: _receipt, source_event_id: _event, ...base } = applied();
  return { ...base, state: "PREVIEW_ONLY", predicted_state: "APPLIED", business_applied: false, reserved: false,
    next_action: "REVIEW_PREVIEW" }; };
const unknown = () => ({ state: "UNKNOWN", business_applied: null, next_action: "QUERY_SAME_INTENT", cli_exit_code: "3" });
function refused(call: () => unknown, code: string) {
  expect(call).toThrowError(expect.objectContaining({ name: "PmAdminControlCandidateError", code }));
}

describe("ELP2-07 exact administrative lock candidate codec", () => {
  it("accepts only the two exact operation-specific revision sets and preserves decimals/large counters", () => {
    expect(parsePmaAdminControlWire(lock())).toEqual(lock());
    expect(parsePmaAdminControlWire(unlock())).toEqual(unlock());
    expect(JSON.parse(serializePmaAdminControlWire(lock()))).toEqual(lock());
    expect(parsePmaAdminControlWire({ ...lock(), lock_kind: "ALL_NEW_RISK", amount: "0" }).amount).toBe("0");
    expect(parsePmaAdminControlWire({ ...lock(), amount: "1.2300" }).amount).toBe("1.2300");
  });
  it.each(["ADMIN_LOCK", "ADMIN_UNLOCK"])("requires exact %s target pair and currency", operation => {
    const body = { ...(operation === "ADMIN_LOCK" ? lock() : unlock()), recipient_kind: "DEPLOYMENT_ACCOUNT",
      recipient_account_id: "TEST_ONLY-account", recipient_deployment_id: "TEST_ONLY-deployment" };
    const context = { ...target(), recipient: { recipient_kind: "DEPLOYMENT_ACCOUNT" as const, currency: "USDT",
      recipient_account_id: body.recipient_account_id, recipient_deployment_id: body.recipient_deployment_id } };
    expect(encodePmaAdminControlRequest(body, context, limits).wire).toEqual(body);
    const { recipient_account_id: _account, ...missingPair } = body;
    refused(() => parsePmaAdminControlWire(missingPair), "PM_CONTROL_WIRE_INVALID");
    for (const changed of [{ currency: "USD" }, { recipient_account_id: "other" }, { recipient_deployment_id: "other" }])
      refused(() => encodePmaAdminControlRequest(body, { ...context, recipient: { ...context.recipient, ...changed } }, limits),
        "PM_CONTROL_TARGET_MISMATCH");
    refused(() => parsePmaAdminControlWire({ ...lock(), recipient_account_id: "forbidden" }), "PM_CONTROL_WIRE_INVALID");
  });
  it("encodes only existing candidate POST paths, detached bytes and separate BUDGET/UNLOCK requirements", () => {
    const body = lock(), encoded = encodePmaAdminControlRequest(body, { ...target(), target_ref: "TEST_ONLY-α:target" }, limits);
    expect(encoded.request.raw_path).toEqual(Buffer.from("/internal/pma11-candidate/capital/TEST_ONLY-%CE%B1%3Atarget/preview"));
    expect(encoded.request.method).toBe("POST"); expect(encoded.request.query_string).toHaveLength(0);
    expect(encoded.required_source_capability).toBe("BUDGET");
    expect(encoded.request_digest).toBe(pmHttpRequestDigest(encoded.request, limits));
    expect(encodePmaAdminControlRequest(unlock(), { ...target(), stage: "APPLY" }, limits).required_source_capability).toBe("UNLOCK");
    const before = Buffer.from(encoded.request.body); body.amount = "999"; body.expected_versions.budget = "4";
    expect(encoded.request.body).toEqual(before); expect(encoded.wire.amount).toBe("1.230000000000000001");
    const reordered = Object.fromEntries(Object.entries(lock()).reverse());
    expect(serializePmaAdminControlWire(reordered)).toBe(serializePmaAdminControlWire(lock()));
    const changedBody = { ...encoded.request, body: Buffer.concat([encoded.request.body, Buffer.from(" ")]) };
    expect(pmHttpRequestDigest(changedBody, limits)).not.toBe(encoded.request_digest);
    expect(encodePmaAdminControlRequest(lock(), { ...target(), stage: "APPLY" }, limits).request_digest).not.toBe(encoded.request_digest);
    expect(() => encodePmaAdminControlRequest(lock(), target(), { request_bytes: 1 })).toThrow();
    for (const target_ref of [".", "..", "../target", "bad\\target", "bad?query", "bad#fragment", "\ud800"])
      refused(() => encodePmaAdminControlRequest(lock(), { ...target(), target_ref }, limits), "PM_CONTROL_TARGET_MISMATCH");
  });
  it.each([
    { operation: "RETURN_CAPITAL" }, { operation: "REALLOCATE_BUDGET" }, { operation: "ADMIN_UNLOCK" },
    { expected_versions: { budget: "1" } }, { expected_versions: { budget: "1", source: "2", lock: "1" } },
    { expected_versions: { budget: 1, source: "2" } }, { expected_versions: { budget: "01", source: "2" } },
    { expected_versions: { budget: "9223372036854775808", source: "2" } }, { amount: -1 }, { amount: "-1" },
    { amount: "1e2" }, { amount: "01" }, { amount: "NaN" }, { amount: null }, { lock_id: " leading" },
    { reason: "bad\u0000text" }, { lock_kind: "α".repeat(257) }, { actor: "spoof" }, { source_url: "https://invalid" },
  ])("rejects malformed, additional or wrong-family request %#", patch => {
    refused(() => parsePmaAdminControlWire({ ...lock(), ...patch }), "PM_CONTROL_WIRE_INVALID");
  });
  it("does not accept an unlock amount/kind, incomplete CAS, getter, prototype or symbol authority", () => {
    for (const patch of [{ amount: "0" }, { lock_kind: "AMOUNT" }, { expected_versions: { budget: "2", source: "2" } }])
      refused(() => parsePmaAdminControlWire({ ...unlock(), ...patch }), "PM_CONTROL_WIRE_INVALID");
    const getter = vi.fn(() => "ADMIN_LOCK");
    const input = Object.defineProperty(lock(), "operation", { enumerable: true, get: getter });
    refused(() => parsePmaAdminControlWire(input), "PM_CONTROL_WIRE_INVALID");
    const nested = Object.defineProperty({ ...lock().expected_versions }, "source", { enumerable: true, get: getter });
    refused(() => parsePmaAdminControlWire({ ...lock(), expected_versions: nested }), "PM_CONTROL_WIRE_INVALID");
    refused(() => parsePmaAdminControlWire(Object.assign(Object.create({ owner: true }), lock())), "PM_CONTROL_WIRE_INVALID");
    refused(() => parsePmaAdminControlWire({ ...lock(), [Symbol("authority")]: true }), "PM_CONTROL_WIRE_INVALID");
    expect(getter).not.toHaveBeenCalled();
  });
  it.each(["\n", "\r\n", "\u2028", "\u2029"])("refuses terminal line breaks in request and summary numeric/digest facts %#", ending => {
    refused(() => parsePmaAdminControlWire({ ...lock(), amount: `1${ending}` }), "PM_CONTROL_WIRE_INVALID");
    for (const key of ["budget", "source"] as const)
      refused(() => parsePmaAdminControlWire({ ...lock(), expected_versions: { ...lock().expected_versions, [key]: `1${ending}` } }),
        "PM_CONTROL_WIRE_INVALID");
    refused(() => parsePmaAdminControlWire({ ...unlock(), expected_versions: { ...unlock().expected_versions, lock: `1${ending}` } }),
      "PM_CONTROL_WIRE_INVALID");
    for (const key of ["budget_version", "parent_version", "source_version", "lock_version", "book_version", "command_version"])
      refused(() => projectPmaAdminControlCandidateResult({ ...applied(), [key]: `1${ending}` }, lock(), resultLimits),
        "PM_CONTROL_RESULT_INVALID");
    refused(() => projectPmaAdminControlCandidateResult({ ...applied(), amount: `${lock().amount}${ending}` }, lock(), resultLimits),
      "PM_CONTROL_RESULT_INVALID");
    refused(() => projectPmaAdminControlCandidateResult({ ...applied(), payload_digest: `${"a".repeat(64)}${ending}` }, lock(), resultLimits),
      "PM_CONTROL_RESULT_INVALID");
  });
  it("preserves candidate PREVIEW, claimed APPLIED and minimal UNKNOWN without inventing a trusted result", () => {
    for (const raw of [preview(), applied(), unknown()]) {
      const value = projectPmaAdminControlCandidateResult(raw, lock(), resultLimits);
      expect(value).toMatchObject({ kind: "PM_ADMIN_CONTROL_CANDIDATE_ONLY", authority: "NOT_AUTHENTICATED",
        authoritative_business_applied: null, trusted_command_status: null, requested_operation: "ADMIN_LOCK" });
      expect(value.source_summary).toEqual(raw); expect(sourceCommandResult.safeParse(value).success).toBe(false);
      expect(value).not.toHaveProperty("delivery"); expect(value).not.toHaveProperty("venue");
    }
    const value = projectPmaAdminControlCandidateResult(unknown(), unlock(), resultLimits);
    for (const absent of ["amount", "active", "receipt_id", "source_event_id", "payload_digest", "physical_transfer_performed"])
      expect(value.source_summary).not.toHaveProperty(absent);
    const { amount: _amount, ...withoutAmount } = applied();
    expect(projectPmaAdminControlCandidateResult(withoutAmount, lock(), resultLimits).source_summary).not.toHaveProperty("amount");
  });
  it("compares only genuine lock facts and keeps zero, false and exact decimal equivalence distinct from absence", () => {
    const zero = { ...lock(), lock_kind: "ALL_NEW_RISK", amount: "0.000" };
    expect(projectPmaAdminControlCandidateResult({ ...applied(), kind: "ALL_NEW_RISK", amount: "0" }, zero, resultLimits)
      .source_summary.amount).toBe("0");
    expect(projectPmaAdminControlCandidateResult({ ...applied(), operation: "ADMIN_UNLOCK", active: false }, unlock(), resultLimits)
      .source_summary.active).toBe(false);
    expect(projectPmaAdminControlCandidateResult({ ...applied(), amount: "1.2300" }, { ...lock(), amount: "1.23" }, resultLimits)
      .source_summary.amount).toBe("1.2300");
  });
  it.each([
    { state: "FILLED" }, { state: "REJECTED" }, { state: "WAITING_ENCUMBRANCE" }, { state: "PARTIALLY_APPLIED" },
    { state: "PENDING" }, { state: "RECONCILING" }, { operation: "ADMIN_UNLOCK" }, { lock_id: "other" }, { kind: "ALL_NEW_RISK" },
    { amount: "9" }, { active: false }, { receipt_id: null }, { source_event_id: null }, { business_applied: false },
    { physical_transfer_performed: true }, { next_action: "QUERY_SAME_INTENT" }, { cli_exit_code: "3" }, { cli_exit_code: 0 },
    { budget_version: 9007199254740992 }, { lock_version: "01" }, { payload_digest: `sha256:${"a".repeat(64)}` },
    { qualification: "OWNER_VERIFIED" }, { native_dispatch_performed: true }, { credential: "spoof" },
  ])("rejects contradictory or wider source candidate result %#", patch => {
    refused(() => projectPmaAdminControlCandidateResult({ ...applied(), ...patch }, lock(), resultLimits), "PM_CONTROL_RESULT_INVALID");
  });
  it("does not promote preview or unknown and requires explicit bounded response intake", () => {
    for (const patch of [{ business_applied: true }, { reserved: true }, { receipt_id: "fabricated" }, { source_event_id: null }])
      refused(() => projectPmaAdminControlCandidateResult({ ...preview(), ...patch }, lock(), resultLimits), "PM_CONTROL_RESULT_INVALID");
    for (const patch of [{ business_applied: false }, { next_action: "REVIEW_RECEIPT" }, { cli_exit_code: 0 }])
      refused(() => projectPmaAdminControlCandidateResult({ ...unknown(), ...patch }, lock(), resultLimits), "PM_CONTROL_RESULT_INVALID");
    for (const response_bytes of [0, -1, 0.5, Infinity, NaN, 32 * 1024 + 1, 1])
      refused(() => projectPmaAdminControlCandidateResult(unknown(), lock(), { response_bytes }), "PM_CONTROL_RESULT_INVALID");
    const getter = vi.fn(() => "APPLIED");
    refused(() => projectPmaAdminControlCandidateResult(Object.defineProperty(applied(), "state", { enumerable: true, get: getter }),
      lock(), resultLimits), "PM_CONTROL_RESULT_INVALID");
    const blockers = Object.defineProperty(["TEST_ONLY-blocker"], "0", { enumerable: true, get: getter });
    refused(() => projectPmaAdminControlCandidateResult({ ...applied(), blockers }, lock(), resultLimits), "PM_CONTROL_RESULT_INVALID");
    expect(getter).not.toHaveBeenCalled();
  });
  it("publishes no new capital/grant/dispatch authority and leaves default trust closed", async () => {
    expect(commandIntent.safeParse({ schema_version: "execution.capital-intent.v2", workspace_id: "TEST_ONLY-workspace",
      resource: { kind: "PORTFOLIO", id: "TEST_ONLY-target" }, environment: "paper", expected_policy_revision: "TEST_ONLY-policy",
      business_payload: lock() }).success).toBe(false);
    expect(await unqualifiedCommandTrust.prepare({} as never)).toBeNull();
    await expect(unqualifiedCommandTrust.send({} as never)).rejects.toThrow("COMMAND_RELAY_NOT_QUALIFIED");
    expect(new PmAdminControlCandidateError("PM_CONTROL_WIRE_INVALID").message).toBe("PM_CONTROL_WIRE_INVALID");
  });
});
