/** SYNTHETIC current-source protocol fixtures, not a registration, current
 * grant, owning receipt, installed transport or through-COMMIT acceptance. */
import { describe, expect, it, vi } from "vitest";
import { encodePmaInstanceRegistrationRequest, encodePmaInstanceRegistrationStatusRequest,
  parsePmaInstanceRegistrationWire, projectPmaInstanceRegistrationCandidateResult,
  serializePmaInstanceRegistrationWire } from "../src/execution-v2/pm-instance-registration-adapter";
import { pmHttpRequestDigest } from "../src/execution-v2/pm-http-request-binding";
import { commandIntent } from "../src/execution-v2/command.contract";
import { sourceCommandResult, unqualifiedCommandTrust } from "../src/execution-v2/command-trust";

const body = () => ({ schema_version: "pma.management-command.v1", operation: "REGISTER_INSTANCE",
  idempotency_key: "TEST_ONLY-client-key", reason: "TEST_ONLY unfunded instance",
  expected_version: "0", expected_policy_revision: "9007199254740993",
  parameters: { alpha_slug: "TEST_ONLY-alpha", venue: "TEST_ONLY-venue", account_type: "CASH", currency: "USDT" } });
const context = () => ({ target_ref: "TEST_ONLY-registration-reference" });
const limits = { request_bytes: 10_000 }, resultLimits = { response_bytes: 10_000 }; // TEST_ONLY, no defaults.
const flags = () => ({ native_dispatch_performed: false, activation_performed: false, execution_authorized: false,
  physical_transfer_performed: false, economic_cash_changed: false });
const preview = () => ({ operation: "REGISTER_INSTANCE", idempotency_key: body().idempotency_key, command_version: "1", ...flags(),
  state: "PREVIEW_ONLY", predicted_state: "APPLIED", business_applied: false, reserved: false, next_action: "REVIEW_PREVIEW", cli_exit_code: "0" });
const applied = () => ({ operation: "REGISTER_INSTANCE", idempotency_key: body().idempotency_key, command_version: "1", ...flags(),
  state: "APPLIED", target_id: "TEST_ONLY-source-reported-target", business_applied: true, next_action: "REVIEW_RECEIPT", cli_exit_code: "0",
  receipt_ref: { store: "pm_registry.receipts", operation: "REGISTER_INSTANCE", key: "pma14-TEST_ONLY-owning-key",
    version: "1", authority_scope_id: "TEST_ONLY-source-authority" } });
const unknown = () => ({ state: "UNKNOWN", business_applied: null, next_action: "QUERY_SAME_INTENT", cli_exit_code: "3" });
const project = (input: unknown, request: unknown = body()) => projectPmaInstanceRegistrationCandidateResult(input, request, resultLimits);
function refused(call: () => unknown, code = "PM_INSTANCE_RESULT_INVALID") {
  expect(call).toThrowError(expect.objectContaining({ name: "PmInstanceRegistrationCandidateError", code }));
}

describe("ELP2-07 finite REGISTER_INSTANCE candidate codec, not command commissioning", () => {
  it("keeps exact management body, both CAS strings and declared parameters without inventing a pair or alpha version", () => {
    expect(parsePmaInstanceRegistrationWire(body())).toEqual(body());
    expect(JSON.parse(serializePmaInstanceRegistrationWire(body()))).toEqual(body());
    const reversed = Object.fromEntries(Object.entries(body()).reverse());
    expect(serializePmaInstanceRegistrationWire(reversed)).toBe(serializePmaInstanceRegistrationWire(body()));
    expect(parsePmaInstanceRegistrationWire({ ...body(), expected_policy_revision: "9223372036854775807" }).expected_policy_revision)
      .toBe("9223372036854775807");
    // Text is the captured management parser contract; not owning-writer admission.
    expect(parsePmaInstanceRegistrationWire({ ...body(), parameters: { ...body().parameters, account_type: "TEST_ONLY-unreviewed-owning-type" } })
      .parameters.account_type).toBe("TEST_ONLY-unreviewed-owning-type");
  });
  it.each(["alpha_slug", "venue", "account_type", "currency"])("requires exact parameter %s", key => {
    const parameters: Record<string, string> = { ...body().parameters }; delete parameters[key];
    refused(() => parsePmaInstanceRegistrationWire({ ...body(), parameters }), "PM_INSTANCE_WIRE_INVALID");
  });
  it("refuses unrelated operations, applicant authority, explicit scope/pair, funding and parameter extras", () => {
    for (const patch of [{ operation: "REGISTER_ALPHA" }, { operation: "BIND" }, { actor: "spoof" }, { owner_id: "spoof" },
      { authority_scope_id: "spoof" }, { environment: "paper" }, { portfolio_id: "spoof" }, { amount: "1" }, { expected_versions: {} }])
      refused(() => parsePmaInstanceRegistrationWire({ ...body(), ...patch }), "PM_INSTANCE_WIRE_INVALID");
    for (const patch of [{ recipient_account_id: "spoof" }, { recipient_deployment_id: "spoof" }, { alpha_version_id: "spoof" },
      { owner_id: "spoof" }, { activate: true }, { credential: "spoof" }])
      refused(() => parsePmaInstanceRegistrationWire({ ...body(), parameters: { ...body().parameters, ...patch } }), "PM_INSTANCE_WIRE_INVALID");
    for (const key of ["expected_version", "expected_policy_revision"]) {
      const missing: Record<string, unknown> = { ...body() }; delete missing[key];
      refused(() => parsePmaInstanceRegistrationWire(missing), "PM_INSTANCE_WIRE_INVALID");
    }
  });
  it.each(["\n", "\r\n", "\u2028", "\u2029"])("refuses unsafe revision suffixes %#", ending => {
    for (const key of ["expected_version", "expected_policy_revision"])
      refused(() => parsePmaInstanceRegistrationWire({ ...body(), [key]: `1${ending}` }), "PM_INSTANCE_WIRE_INVALID");
    refused(() => project({ ...applied(), command_version: `1${ending}` }));
    refused(() => project({ ...applied(), receipt_ref: { ...applied().receipt_ref, version: `1${ending}` } }));
  });
  it("rejects numeric/overflow revisions, malformed Unicode, whitespace and empty text", () => {
    for (const value of [1, true, "01", "-1", "1.0", "9223372036854775808", ""])
      refused(() => parsePmaInstanceRegistrationWire({ ...body(), expected_policy_revision: value }), "PM_INSTANCE_WIRE_INVALID");
    for (const value of ["", " bad", "bad\u0000", "\ud800", "\udc00", "α".repeat(257)])
      refused(() => parsePmaInstanceRegistrationWire({ ...body(), parameters: { ...body().parameters, alpha_slug: value } }), "PM_INSTANCE_WIRE_INVALID");
  });
  it("encodes detached fixed-route POST/status bytes, not a sender or new grant", () => {
    const input = body(), ctx = { target_ref: "TEST_ONLY-α:registration", stage: "PREVIEW" as const };
    const encoded = encodePmaInstanceRegistrationRequest(input, ctx, limits), bytes = Buffer.from(encoded.request.body);
    expect(encoded.request.raw_path.toString()).toBe("/internal/pma11-candidate/management/TEST_ONLY-%CE%B1%3Aregistration/preview");
    expect(encoded.request_digest).toBe(pmHttpRequestDigest(encoded.request, limits));
    expect(encoded.required_source_capability).toBe("DEPLOY"); expect(encoded.request.query_string).toHaveLength(0);
    input.parameters.alpha_slug = "changed"; input.expected_version = "3";
    expect(encoded.request.body).toEqual(bytes); expect(encoded.wire.parameters.alpha_slug).toBe("TEST_ONLY-alpha");
    const status = encodePmaInstanceRegistrationStatusRequest({ ...body(), idempotency_key: "TEST_ONLY-α &key" }, context(), limits);
    expect(status.request.method).toBe("GET"); expect(status.request.body).toHaveLength(0);
    expect(status.request.raw_path.toString()).toBe("/internal/pma11-candidate/management/TEST_ONLY-registration-reference/status");
    expect(status.request.query_string.toString()).toBe("operation=REGISTER_INSTANCE&key=TEST_ONLY-%CE%B1%20%26key");
    expect(status.required_source_capability).toBe("REPORT"); expect(status.request_digest).toBe(pmHttpRequestDigest(status.request, limits));
    expect(pmHttpRequestDigest({ ...encoded.request, body: Buffer.concat([bytes, Buffer.from(" ")]) }, limits)).not.toBe(encoded.request_digest);
    expect(() => encodePmaInstanceRegistrationRequest(body(), { ...context(), stage: "APPLY" }, { request_bytes: 1 })).toThrow();
  });
  it("refuses unsafe/ambiguous context fields and preserves server-selected target separation", () => {
    for (const target_ref of [".", "..", "../target", "bad\\path", "bad?query", "bad#fragment", "\ud800"])
      refused(() => encodePmaInstanceRegistrationRequest(body(), { target_ref, stage: "APPLY" }, limits), "PM_INSTANCE_TARGET_MISMATCH");
    for (const patch of [{ stage: "PREPARE" }, { source_url: "https://invalid" }, { scopes: ["one", "two"] }, { actor: "spoof" }])
      refused(() => encodePmaInstanceRegistrationRequest(body(), { ...context(), stage: "APPLY", ...patch } as never, limits), "PM_INSTANCE_TARGET_MISMATCH");
    expect(project(applied()).source_summary).toMatchObject({ target_id: "TEST_ONLY-source-reported-target" });
    // Neither equality nor inequality is evidence of canonical identity.
    expect(project({...applied(),target_id:context().target_ref}).source_summary)
      .toMatchObject({target_id:context().target_ref});
  });
  it("preserves rollback preview with no target/owning receipt or native/funding inference", () => {
    expect(project(preview()).source_summary).toEqual(preview());
    expect(project(preview()).source_summary).not.toHaveProperty("target_id");
    expect(project(preview()).source_summary).not.toHaveProperty("receipt_ref");
    expect(project(preview()).source_summary).not.toHaveProperty("lifecycle_state");
    refused(() => project({ ...preview(), target_id: "predicted-not-returned-by-source" }));
    refused(() => project({ ...preview(), receipt_ref: applied().receipt_ref }));
  });
  it("keeps real owning locator syntax without equating its namespaced key to the client key", () => {
    const result = project(applied()); expect(result.source_summary).toEqual(applied());
    expect(applied().receipt_ref.key).not.toBe(body().idempotency_key);
    expect(result).toMatchObject({ kind: "PM_INSTANCE_REGISTRATION_CANDIDATE_ONLY", authority: "NOT_AUTHENTICATED",
      authoritative_business_applied: null, trusted_command_status: null, requested_operation: "REGISTER_INSTANCE" });
    expect(result.source_summary).not.toHaveProperty("account_id"); expect(result.source_summary).not.toHaveProperty("deployment_id");
    expect(sourceCommandResult.safeParse(result).success).toBe(false);
    const { authority_scope_id: _notPublished, ...receipt_ref } = applied().receipt_ref;
    expect(project({ ...applied(), receipt_ref }).source_summary).not.toHaveProperty("receipt_ref.authority_scope_id");
  });
  it("keeps UNKNOWN minimal and never treats missing lookup as no effect or zero funding", () => {
    expect(project(unknown()).source_summary).toEqual(unknown());
    for (const patch of [{ business_applied: false }, { receipt_ref: applied().receipt_ref }, { target_id: "fabricated" },
      { operation: "REGISTER_INSTANCE" }, { native_dispatch_performed: false }]) refused(() => project({ ...unknown(), ...patch }));
  });
  it("rejects receipt/key/version mismatch and wrong or extra receipt fields", () => {
    for (const patch of [{ idempotency_key: "other-client-key" }, { operation: "REGISTER_ALPHA" }, { command_version: "2" }])
      refused(() => project({ ...applied(), ...patch }));
    for (const patch of [{ store: "pm_capital.commands" }, { operation: "REGISTER_ALPHA" }, { key: "" }, { version: 1 },
      { digest: "spoof" }, { raw_proof: {} }])
      refused(() => project({ ...applied(), receipt_ref: { ...applied().receipt_ref, ...patch } }));
    const { receipt_ref: _missing, ...missingReceipt } = applied(); refused(() => project(missingReceipt));
  });
  it.each([{ state: "REGISTERED_UNFUNDED" }, { state: "FILLED" }, { state: "RECORDED" }, { cli_exit_code: 0 },
    { cli_exit_code: "3" }, { next_action: "QUERY_SAME_INTENT" }, { business_applied: false },
    { activation_performed: true }, { native_dispatch_performed: true }, { execution_authorized: true },
    { physical_transfer_performed: true }, { economic_cash_changed: true }, { reserved: false }, { lifecycle_state: "REGISTERED_UNFUNDED" },
    { recipient_account_id: "spoof" }, { alpha_version_id: "spoof" }, { qualification: "SOURCE_VERIFIED" }])(
    "rejects broader or contradictory candidate result %#", patch => { refused(() => project({ ...applied(), ...patch })); });
  it("refuses accessors, symbols, non-data/prototype records before any read", () => {
    const getter = vi.fn(() => "spoof");
    refused(() => parsePmaInstanceRegistrationWire(Object.defineProperty(body(), "operation", { enumerable: true, get: getter })), "PM_INSTANCE_WIRE_INVALID");
    refused(() => parsePmaInstanceRegistrationWire({ ...body(), parameters: Object.defineProperty({ ...body().parameters }, "venue", { enumerable: true, get: getter }) }), "PM_INSTANCE_WIRE_INVALID");
    refused(() => parsePmaInstanceRegistrationWire({ ...body(), [Symbol("authority")]: true }), "PM_INSTANCE_WIRE_INVALID");
    refused(() => parsePmaInstanceRegistrationWire(Object.assign(Object.create({ admin: true }), body())), "PM_INSTANCE_WIRE_INVALID");
    refused(() => project(Object.defineProperty(applied(), "state", { enumerable: true, get: getter })));
    refused(() => project({ ...applied(), receipt_ref: Object.defineProperty({ ...applied().receipt_ref }, "key", { enumerable: true, get: getter }) }));
    refused(() => encodePmaInstanceRegistrationRequest(body(), Object.defineProperty({ ...context(), stage: "APPLY" }, "target_ref", { enumerable: true, get: getter }), limits), "PM_INSTANCE_TARGET_MISMATCH");
    expect(getter).not.toHaveBeenCalled();
  });
  it("keeps explicit byte bounds and no public capital/dispatcher activation", async () => {
    for (const response_bytes of [0, -1, NaN, Infinity, 1.5, 32 * 1024 + 1, 1])
      refused(() => projectPmaInstanceRegistrationCandidateResult(unknown(), body(), { response_bytes }));
    expect(commandIntent.safeParse({ schema_version: "execution.capital-intent.v2", workspace_id: "TEST_ONLY-ws",
      resource: { kind: "PORTFOLIO", id: "TEST_ONLY-target" }, environment: "paper",
      expected_policy_revision: "TEST_ONLY-revision", business_payload: body() }).success).toBe(false);
    expect(await unqualifiedCommandTrust.prepare({} as never)).toBeNull();
    await expect(unqualifiedCommandTrust.send({} as never)).rejects.toThrow("COMMAND_RELAY_NOT_QUALIFIED");
  });
});
