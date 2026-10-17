/** SYNTHETIC PM profile protocol examples, not installed grants/authority,
 * owning readback, native profile qualification or through-COMMIT evidence. */
import { describe, expect, it, vi } from "vitest";
import { encodePmaProfileRequest, encodePmaProfileStatusRequest, parsePmaProfileWire,
  projectPmaProfileCandidateResult, serializePmaProfileWire } from "../src/execution-v2/pm-profile-adapter";
import { pmHttpRequestDigest } from "../src/execution-v2/pm-http-request-binding";
import { commandIntent } from "../src/execution-v2/command.contract";
import { sourceCommandResult, unqualifiedCommandTrust } from "../src/execution-v2/command-trust";

const operations = ["SET_LEVERAGE", "SET_MARGIN_MODE", "SET_POSITION_MODE", "SET_ACCOUNT_MODE"] as const;
const body = () => ({ schema_version: "pma.profile-command.v1", operation: "SET_LEVERAGE",
  idempotency_key: "TEST_ONLY-profile-key", reason: "TEST_ONLY desired profile", desired: "TEST_ONLY-source-desired",
  expected_profile_revision: "9007199254740993", expected_affected_digest: "TEST_ONLY-exact-source-affected-digest",
  recipient_account_id: "TEST_ONLY-account", recipient_deployment_id: "TEST_ONLY-deployment" });
const context = () => ({ target_ref: "TEST_ONLY-deployment-reference" });
const limits = { request_bytes: 10_000 }, responseLimits = { response_bytes: 10_000 }; // TEST_ONLY, no defaults.
const missing = () => ({ state: "UNKNOWN", business_applied: null, next_action: "QUERY_SAME_INTENT", cli_exit_code: "3" });
const guarded = () => ({ ...missing(), state: "GUARDED", business_applied: false,
  qualification: "TEST_ONLY_SIMULATION", desired: body().desired, command_id: body().idempotency_key,
  operation: body().operation, command_version: "1", current_observed_ref: "TEST_ONLY-observed",
  current_effective_ref: "TEST_ONLY-effective", native_dispatch_performed: false, activation_performed: false });
const project = (input: unknown, request: unknown = body()) => projectPmaProfileCandidateResult(input, request, responseLimits);
function refused(call: () => unknown, code = "PM_PROFILE_RESULT_INVALID") {
  expect(call).toThrowError(expect.objectContaining({ name: "PmProfileCandidateError", code }));
}

describe("ELP2-07 finite profile candidate protocol, no command commissioning", () => {
  it.each(operations)("preserves exact %s bytes and capability without a native/default-value enum", operation => {
    const wire = { ...body(), operation };
    expect(parsePmaProfileWire(wire)).toEqual(wire);
    expect(JSON.parse(serializePmaProfileWire(wire))).toEqual(wire);
    expect(serializePmaProfileWire(Object.fromEntries(Object.entries(wire).reverse()))).toBe(serializePmaProfileWire(wire));
    const result = encodePmaProfileRequest(wire, { ...context(), stage: "PREPARE" }, limits);
    expect(result.required_source_capability).toBe(operation.slice(4));
    expect(result.request.raw_path.toString()).toBe("/internal/pma11-candidate/profiles/TEST_ONLY-deployment-reference/prepare");
    expect(result.request_digest).toBe(pmHttpRequestDigest(result.request, limits));
    expect(parsePmaProfileWire({ ...wire, expected_profile_revision: "9223372036854775807" }).expected_profile_revision)
      .toBe("9223372036854775807");
  });
  it.each(["PREVIEW", "PREPARE", "RECONCILE"] as const)("encodes %s as a separate fixed POST stage, no sender", stage => {
    const input = body(), encoded = encodePmaProfileRequest(input, { ...context(), stage }, limits);
    const captured = Buffer.from(encoded.request.body); input.desired = "changed";
    expect(encoded.request.method).toBe("POST"); expect(encoded.request.query_string).toHaveLength(0);
    expect(encoded.request.raw_path.toString()).toBe(`/internal/pma11-candidate/profiles/TEST_ONLY-deployment-reference/${stage.toLowerCase()}`);
    expect(encoded.request.body).toEqual(captured); expect(encoded.wire.desired).toBe(body().desired);
  });
  it("keeps same operation/key status as a current REPORT read, not resend/reconcile", () => {
    const wire = { ...body(), idempotency_key: "TEST_ONLY-α &key" };
    const encoded = encodePmaProfileStatusRequest(wire, { target_ref: "TEST_ONLY-α:deployment" }, limits);
    expect(encoded.request.method).toBe("GET"); expect(encoded.request.body).toHaveLength(0);
    expect(encoded.required_source_capability).toBe("REPORT");
    expect(encoded.request.raw_path.toString()).toBe("/internal/pma11-candidate/profiles/TEST_ONLY-%CE%B1%3Adeployment/status");
    expect(encoded.request.query_string.toString()).toBe("operation=SET_LEVERAGE&key=TEST_ONLY-%CE%B1%20%26key");
    expect(encoded.request_digest).toBe(pmHttpRequestDigest(encoded.request, limits));
  });
  it("requires all nine fields and refuses authority, amount, sibling family and extra-field injection", () => {
    for (const key of Object.keys(body())) {
      const value: Record<string, unknown> = { ...body() }; delete value[key];
      refused(() => parsePmaProfileWire(value), "PM_PROFILE_WIRE_INVALID");
    }
    for (const patch of [{ operation: "PROFILE" }, { operation: "ADMIN_LOCK" }, { operation: "REGISTER_INSTANCE" },
      { amount: "1" }, { expected_versions: {} }, { actor: "spoof" }, { affected: [] }, { authority: true },
      { native_dispatch_performed: false }, { source_url: "https://invalid" }])
      refused(() => parsePmaProfileWire({ ...body(), ...patch }), "PM_PROFILE_WIRE_INVALID");
  });
  it.each(["\n", "\r\n", "\u2028", "\u2029"])("refuses non-exact counters and terminal whitespace %#", ending => {
    refused(() => parsePmaProfileWire({ ...body(), expected_profile_revision: `1${ending}` }), "PM_PROFILE_WIRE_INVALID");
    refused(() => project({ ...guarded(), command_version: `1${ending}` }));
    refused(() => parsePmaProfileWire({ ...body(), expected_affected_digest: `digest${ending}` }), "PM_PROFILE_WIRE_INVALID");
  });
  it("refuses numeric/overflow/normalized counters, malformed Unicode and overlong text", () => {
    for (const value of [1, true, "01", "-1", "1.0", "9223372036854775808", ""])
      refused(() => parsePmaProfileWire({ ...body(), expected_profile_revision: value }), "PM_PROFILE_WIRE_INVALID");
    for (const value of ["", " bad", "bad\u0000", "\ud800", "\udc00", "α".repeat(257)])
      refused(() => parsePmaProfileWire({ ...body(), desired: value }), "PM_PROFILE_WIRE_INVALID");
  });
  it("does not invent canonical target/pair mapping or widen a fixed route", () => {
    expect(parsePmaProfileWire({ ...body(), recipient_account_id: "TEST_ONLY-legacy-alias" }).recipient_account_id)
      .toBe("TEST_ONLY-legacy-alias"); // owning require_pair/resolver must authenticate it.
    for (const target_ref of [".", "..", "../target", "bad\\path", "bad?query", "bad#fragment", "\ud800"])
      refused(() => encodePmaProfileRequest(body(), { target_ref, stage: "PREPARE" }, limits), "PM_PROFILE_TARGET_MISMATCH");
    for (const patch of [{ stage: "APPLY" }, { url: "https://invalid" }, { actor: "spoof" }, { scopes: ["spoof"] }])
      refused(() => encodePmaProfileRequest(body(), { ...context(), stage: "PREPARE", ...patch } as never, limits), "PM_PROFILE_TARGET_MISMATCH");
  });
  it("keeps source PREVIEW_ONLY without fabricated predicted state, reserved or owning receipt", () => {
    const value = { ...guarded(), state: "PREVIEW_ONLY", next_action: "REVIEW_PREVIEW", cli_exit_code: "0" };
    expect(project(value).source_summary).toEqual(value);
    for (const patch of [{ predicted_state: "GUARDED" }, { reserved: false }, { receipt_ref: {} }, { business_applied: true }])
      refused(() => project({ ...value, ...patch }));
  });
  it("keeps GUARDED accepted desired distinct from native/effective/APPLIED", () => {
    expect(project(guarded()).source_summary).toEqual(guarded());
    expect(project(guarded())).toMatchObject({ kind: "PM_PROFILE_CANDIDATE_ONLY", authority: "NOT_AUTHENTICATED",
      authoritative_business_applied: null, trusted_command_status: null });
    expect(sourceCommandResult.safeParse(project(guarded())).success).toBe(false);
    expect(project(guarded()).source_summary).not.toHaveProperty("amounts");
  });
  it("preserves both missing and existing UNKNOWN without changing null into no-effect", () => {
    expect(project(missing()).source_summary).toEqual(missing());
    const value = { ...guarded(), state: "UNKNOWN", business_applied: null };
    expect(project(value).source_summary).toEqual(value);
    refused(() => project({ ...value, business_applied: false }));
    refused(() => project({ ...missing(), operation: body().operation }));
  });
  it("preserves APPLIED readback and the source's QUERY_SAME_INTENT even after completion", () => {
    const value = { ...guarded(), state: "APPLIED", business_applied: true, cli_exit_code: "0", command_version: "3" };
    expect(project(value).source_summary).toEqual(value);
    // Profile CAS != command revision; observed/effective refs != requested desired.
    expect(value.command_version).not.toBe(body().expected_profile_revision);
    expect(project({ ...value, qualification: "VERIFIED_NATIVE" }).authority).toBe("NOT_AUTHENTICATED");
    refused(() => project({ ...value, next_action: "REVIEW_RECEIPT" }));
  });
  it("requires exact operation/key/desired correspondence and refuses contradictory/broader source states", () => {
    for (const patch of [{ command_id: "different" }, { operation: "SET_ACCOUNT_MODE" }, { desired: "different" },
      { state: "RECORDED" }, { state: "COMPLETED" }, { qualification: "APPROVED" }, { command_version: 1 },
      { cli_exit_code: 3 }, { cli_exit_code: "0" }, { business_applied: true }, { activation_performed: true },
      { native_dispatch_performed: true }, { receipt_id: "invented" }, { affected_digest: body().expected_affected_digest },
      { native_order_id: "invented" }, { effective_profile: { leverage: "3" } }])
      refused(() => project({ ...guarded(), ...patch }));
  });
  it("rejects getters/prototypes/symbols before reading request, context or result data", () => {
    const getter = vi.fn(() => "spoof");
    refused(() => parsePmaProfileWire(Object.defineProperty(body(), "desired", { enumerable: true, get: getter })), "PM_PROFILE_WIRE_INVALID");
    refused(() => parsePmaProfileWire(Object.assign(Object.create({ authority: true }), body())), "PM_PROFILE_WIRE_INVALID");
    refused(() => parsePmaProfileWire({ ...body(), [Symbol("authority")]: true }), "PM_PROFILE_WIRE_INVALID");
    refused(() => project(Object.defineProperty(guarded(), "qualification", { enumerable: true, get: getter })));
    refused(() => encodePmaProfileRequest(body(), Object.defineProperty({ ...context(), stage: "PREPARE" },
      "target_ref", { enumerable: true, get: getter }), limits), "PM_PROFILE_TARGET_MISMATCH");
    refused(() => projectPmaProfileCandidateResult(guarded(), body(), Object.defineProperty({}, "response_bytes",
      { enumerable: true, get: getter }) as never));
    expect(getter).not.toHaveBeenCalled();
  });
  it("retains explicit response/request bounds and public capital/unqualified trust unchanged", async () => {
    for (const response_bytes of [0, -1, NaN, Infinity, 1.5, 32 * 1024 + 1, 1])
      refused(() => projectPmaProfileCandidateResult(missing(), body(), { response_bytes }));
    expect(() => encodePmaProfileRequest(body(), { ...context(), stage: "PREPARE" }, { request_bytes: 1 })).toThrow();
    expect(commandIntent.safeParse({ schema_version: "execution.capital-intent.v2", workspace_id: "TEST_ONLY-ws",
      resource: { kind: "DEPLOYMENT", id: "TEST_ONLY-deployment" }, environment: "paper",
      expected_policy_revision: "TEST_ONLY-rev", business_payload: body() }).success).toBe(false);
    expect(await unqualifiedCommandTrust.prepare({} as never)).toBeNull();
    await expect(unqualifiedCommandTrust.send({} as never)).rejects.toThrow("COMMAND_RELAY_NOT_QUALIFIED");
  });
});
