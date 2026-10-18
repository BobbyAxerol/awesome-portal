/** PRIVATE PURE-TEST PROPOSAL — NOT_APPLIED / NOT_RUN.
 * Destined for apps/control-api/test/ only after Main review and hook terminal.
 * Every value and verifier frame below is SYNTHETIC / TEST_ONLY. Recomputing
 * an envelope/body digest proves correlation, NEVER authenticated PM custody,
 * current authority, source COMMIT, funded/running state or qualification.
 * No DB, HTTP, timers, process, transport/provider installation or live source.
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { AccessActor } from "../src/execution-v2/access.contract";
import { accessDigest } from "../src/execution-v2/access-policy";
import { instanceRegistrationBody, instanceRegistrationIntent, instanceRegistrationStatus,
  type InstanceRegistrationIntent, type InstanceRegistrationStatus } from "../src/execution-v2/instance-registration.contract";
import { assertRegistrationAuthorizationIdentity, assertRegistrationPreview, boundedRegistrationJson,
  instanceRegistrationAuthorization, mergeRegistrationSource, REGISTRATION_JSON_BYTES,
  registrationIntentHash, registrationPreviewHash, registrationRequestDigests,
  registrationSourcePins, unqualifiedInstanceRegistrationTrust,
  type InstanceRegistrationAuthorization, type VerifiedRegistrationFrame } from "../src/execution-v2/instance-registration.trust";
import { registrationRecord, registrationTarget,
  type RegistrationCandidate } from "../src/execution-v2/instance-registration.store";
import { encodePmaInstanceRegistrationRequest, encodePmaInstanceRegistrationStatusRequest,
  projectPmaInstanceRegistrationCandidateResult } from "../src/execution-v2/pm-instance-registration-adapter";
import { pmHttpRequestDigest } from "../src/execution-v2/pm-http-request-binding";
import { coreExecutionRead } from "../src/execution/retained-read-profile";

const NOW = 1_792_300_000_000; // Fixed synthetic clock, not a lease/runtime assertion.
const ACTOR: AccessActor = { user_id: "TEST_ONLY-human", session_id: "TEST_ONLY-session", session_generation: 3 };
const COMMAND_ID = `ecm_${"a".repeat(32)}`;
const SOURCE_PINS = {
  commit: "6f3c852bd61fcc45d7aadacafe2776cbbb0059b7",
  operator_adapters: "ab57b9d57398f9166d358c61b2c004cbec552f2f6ce75a44c85ffddb3295943e",
  operator_management: "f0e18d47649040af67b708978b5ae07dba7faeafc65e91ac73e82525d2d956ab",
  operator_session: "52ff7a5168927d8c4794e1a8d5d82a3a36f29d20032c8bc414279a482f75f0b5",
  instance_repository: "16fac06f8253c84e7a67729bd245681f7d5717744853bd440f87e080fb936f74",
  operator_wire: "3bfa1f6246224ae21da29668685835806112afa98d4893dd45a4c63b32b58fb9",
  portal_human_candidate: "7352c1fb462d70731539f29e2ff1ae3f5cb2f8be95b5bb01a6da91e3d1be3418",
} as const;
function intent(): InstanceRegistrationIntent {
  return instanceRegistrationIntent.parse({
    schema_version: "portal.execution.instance-registration-intent.v1",
    workspace_id: "TEST_ONLY-workspace", resource: { kind: "PORTFOLIO", id: "TEST_ONLY-portfolio" },
    environment: "paper", expected_policy_revision: "TEST_ONLY-Core-policy",
    business_payload: { schema_version: "pma.management-command.v1", operation: "REGISTER_INSTANCE",
      idempotency_key: "TEST_ONLY-register-001", reason: "TEST_ONLY unfunded registry record",
      expected_version: "0", expected_policy_revision: "9007199254740993",
      parameters: { alpha_slug: "TEST_ONLY-alpha", venue: "TEST_ONLY-venue", account_type: "CASH", currency: "USDT" } },
  });
}
function authorization(i = intent()): InstanceRegistrationAuthorization {
  return instanceRegistrationAuthorization.parse({
    qualification: "TEST_ONLY", reference: "TEST_ONLY-authorization", authority_ref: "TEST_ONLY-held-source-custody",
    profile_ref: "TEST_ONLY-register-profile", audience: "pma.management.v1",
    source_selection_ref: "TEST_ONLY-selected-source", source_pins: SOURCE_PINS,
    actor_id: ACTOR.user_id, ts_user_id: "TEST_ONLY-ts-human", workload_ref: "TEST_ONLY-workload",
    delegation_ref: "TEST_ONLY-delegation", mapping_revision: "TEST_ONLY-mapping",
    membership_revision: "TEST_ONLY-membership", membership_receipt_ref: "TEST_ONLY-membership-receipt",
    workspace_id: i.workspace_id, environment: i.environment, operation: "REGISTER_INSTANCE",
    resource_kind: "PORTFOLIO", resource_id: i.resource.id,
    source_registration_ref: "TEST_ONLY-source-registration", alpha_slug: i.business_payload.parameters.alpha_slug,
    policy_revision: i.expected_policy_revision, expected_source_policy_revision: i.business_payload.expected_policy_revision,
    intent_hash: registrationIntentHash(ACTOR, i),
    request_digests: registrationRequestDigests(i, "TEST_ONLY-source-registration"),
    issued_at_ms: NOW, expires_at_ms: NOW + 45_000, idempotency_retained_until_ms: NOW + 86_400_000,
    commit_checks: { human: true, workload: true, membership: true, scope: true, versions: true, registration_rules: true },
  });
}
function status(i = intent(), a = authorization(i)): InstanceRegistrationStatus {
  return instanceRegistrationStatus.parse({ schema_version: "portal.execution.instance-registration-status.v1",
    family: "INSTANCE_REGISTRATION", command_id: COMMAND_ID, operation: "REGISTER_INSTANCE", resource: i.resource,
    environment: i.environment, profile_ref: a.profile_ref, delivery: "SENDING",
    business: { state: "UNKNOWN", business_applied: null, receipt: null, source_instance_ref: null },
    canonical_identity: { availability: "NOT_PUBLISHED",
      reason_code: "SOURCE_CANONICAL_ACCOUNT_DEPLOYMENT_PAIR_NOT_PUBLISHED", account_id: null, deployment_id: null },
    projection: "UNKNOWN", venue: "NOT_APPLICABLE", next_action: "QUERY_SAME_INTENT", authority: "TEST_ONLY",
    created_at_ms: NOW, updated_at_ms: NOW });
}
const flags = () => ({ native_dispatch_performed: false, activation_performed: false,
  execution_authorized: false, physical_transfer_performed: false, economic_cash_changed: false });
const previewSummary = (i = intent()) => ({ operation: "REGISTER_INSTANCE", idempotency_key: i.business_payload.idempotency_key,
  command_version: "1", ...flags(), state: "PREVIEW_ONLY", predicted_state: "APPLIED", business_applied: false,
  reserved: false, next_action: "REVIEW_PREVIEW", cli_exit_code: "0" });
const appliedSummary = (i = intent()) => ({ operation: "REGISTER_INSTANCE", idempotency_key: i.business_payload.idempotency_key,
  command_version: "1", ...flags(), state: "APPLIED", target_id: "TEST_ONLY-source-instance",
  business_applied: true, next_action: "REVIEW_RECEIPT", cli_exit_code: "0", receipt_ref: {
    store: "pm_registry.receipts", operation: "REGISTER_INSTANCE", key: "pma14:TEST_ONLY-owning-receipt",
    version: "1", authority_scope_id: "TEST_ONLY-source-authority" } });
const unknownSummary = () => ({ state: "UNKNOWN", business_applied: null,
  next_action: "QUERY_SAME_INTENT", cli_exit_code: "3" });
function rawFrame(a: InstanceRegistrationAuthorization, stage: VerifiedRegistrationFrame["stage"], response_json: string,
  terminal: VerifiedRegistrationFrame["terminal"]): VerifiedRegistrationFrame {
  return { authorization_digest: accessDigest(a), source_selection_ref: a.source_selection_ref,
    intent_hash: a.intent_hash, stage, request_digest: a.request_digests[stage.toLowerCase() as "preview" | "apply" | "status"],
    response_json, response_sha256: createHash("sha256").update(Buffer.from(response_json, "utf8")).digest("hex"), terminal };
}
const frame = (a: InstanceRegistrationAuthorization, stage: VerifiedRegistrationFrame["stage"], summary: unknown,
  terminal: VerifiedRegistrationFrame["terminal"]) => rawFrame(a, stage, JSON.stringify(summary), terminal);
const old = () => { const i = intent(), a = authorization(i); return { intent: i, authorization: a, status: status(i, a) }; };
function rejected(call: () => unknown, code = "REGISTRATION_RECEIPT_UNVERIFIED", httpStatus = 503) {
  expect(call).toThrowError(expect.objectContaining({ code, status: httpStatus }));
}
function candidate(): RegistrationCandidate {
  const o = old();
  return { id: COMMAND_ID, workspace: o.intent.workspace_id, actor: ACTOR.user_id, hash: o.authorization.intent_hash,
    key_hash: accessDigest(o.intent.business_payload.idempotency_key), intent: o.intent, authorization: o.authorization,
    status: { ...o.status, delivery: "PREPARED" }, attempt: null, created_at_ms: NOW, updated_at_ms: NOW };
}

describe("ELP2-07 registry family proof ingress — synthetic correlation, not authenticated authority", () => {
  it("keeps exact reviewed source pins, finite strict envelope and complete true commit checks", () => {
    expect(registrationSourcePins.parse(SOURCE_PINS)).toEqual(SOURCE_PINS);
    expect(instanceRegistrationAuthorization.parse(authorization())).toEqual(authorization());
    for (const key of Object.keys(SOURCE_PINS))
      expect(registrationSourcePins.safeParse({ ...SOURCE_PINS, [key]: "other-source" }).success).toBe(false);
    for (const patch of [{ authority: "OWNER_VERIFIED" }, { source_url: "https://invalid" }, { account_id: "spoof" },
      { qualification: "SOURCE_VERIFIED" }, { audience: "capital" }, { operation: "ACTIVATE" }, { resource_kind: "ROOT" }])
      expect(instanceRegistrationAuthorization.safeParse({ ...authorization(), ...patch }).success).toBe(false);
    for (const key of Object.keys(authorization().commit_checks)) {
      expect(instanceRegistrationAuthorization.safeParse({ ...authorization(),
        commit_checks: { ...authorization().commit_checks, [key]: false } }).success).toBe(false);
      const incomplete: Record<string, unknown> = { ...authorization().commit_checks }; delete incomplete[key];
      expect(instanceRegistrationAuthorization.safeParse({ ...authorization(), commit_checks: incomplete }).success).toBe(false);
    }
  });
  it("rejects malformed/overlong opaque proof text and unsafe timestamp or source CAS representations", () => {
    // Deliberate whole-string ingress vectors: do not trim LF or repair UTF-16.
    // Main must resolve any failure by strict registration-local validation,
    // not removing vectors or relaxing source/custody identity.
    for (const value of ["", "x".repeat(257), "bad\ninside", "TEST_ONLY-reference\n", "\ud800", "\udc00"])
      expect(instanceRegistrationAuthorization.safeParse({ ...authorization(), reference: value }).success).toBe(false);
    for (const value of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN, "1"])
      expect(instanceRegistrationAuthorization.safeParse({ ...authorization(), issued_at_ms: value }).success).toBe(false);
    for (const value of [1, "01", "-1", "9223372036854775808", "1\n"])
      expect(instanceRegistrationAuthorization.safeParse({ ...authorization(), expected_source_policy_revision: value }).success).toBe(false);
    expect(instanceRegistrationAuthorization.safeParse({ ...authorization(), expected_source_policy_revision: "9223372036854775807" }).success).toBe(true);
  });
  it("requires creation version zero, exact public parameters and no browser-supplied source/identity authority", () => {
    const i = intent(); expect(instanceRegistrationBody.parse(i.business_payload)).toEqual(i.business_payload);
    for (const patch of [{ expected_version: "1" }, { expected_version: 0 }, { source_registration_ref: "spoof" },
      { expected_versions: {} }, { actor_id: "spoof" }, { environment: "live" }, { amount: "0" }])
      expect(instanceRegistrationBody.safeParse({ ...i.business_payload, ...patch }).success).toBe(false);
    for (const patch of [{ account_type: "UNREVIEWED" }, { account_id: "spoof" }, { deployment_id: "spoof" }, { activate: true }])
      expect(instanceRegistrationBody.safeParse({ ...i.business_payload,
        parameters: { ...i.business_payload.parameters, ...patch } }).success).toBe(false);
    expect(instanceRegistrationIntent.safeParse({ ...i, source_url: "https://invalid" }).success).toBe(false);
  });
  it("checks original human/workload separation, Portfolio/environment/Alpha, both CAS values and exact intent hash", () => {
    const i = intent(), a = authorization(i), hash = registrationIntentHash(ACTOR, i);
    expect(() => assertRegistrationAuthorizationIdentity(a, ACTOR.user_id, i, hash)).not.toThrow();
    const variants: Partial<InstanceRegistrationAuthorization>[] = [
      { actor_id: "TEST_ONLY-other-human" }, { workload_ref: ACTOR.user_id }, { workload_ref: a.ts_user_id },
      { workspace_id: "TEST_ONLY-other-workspace" }, { environment: "live" }, { resource_id: "TEST_ONLY-other-portfolio" },
      { alpha_slug: "TEST_ONLY-other-alpha" }, { policy_revision: "TEST_ONLY-other-policy" },
      { expected_source_policy_revision: "9007199254740994" }, { intent_hash: `sha256:${"b".repeat(64)}` },
      { source_registration_ref: "TEST_ONLY-other-registration" },
    ];
    for (const patch of variants) rejected(() => assertRegistrationAuthorizationIdentity({ ...a, ...patch }, ACTOR.user_id, i, hash));
    rejected(() => assertRegistrationAuthorizationIdentity(a, ACTOR.user_id, i, `sha256:${"0".repeat(64)}`));
    const differentBody = { ...i, business_payload: { ...i.business_payload, reason: "TEST_ONLY changed reason" } };
    rejected(() => assertRegistrationAuthorizationIdentity(a, ACTOR.user_id, differentBody, hash));
    const differentTarget = { ...i, resource: { kind: "PORTFOLIO" as const, id: "TEST_ONLY-other-portfolio" } };
    rejected(() => assertRegistrationAuthorizationIdentity(a, ACTOR.user_id, differentTarget, hash));
    expect(registrationIntentHash({ user_id: "TEST_ONLY-other-human" }, i)).not.toBe(hash);
  });
  it("enforces positive bounded original proof lifetime/retention, not today's clock on historical reports", () => {
    const i = intent(), a = authorization(i);
    for (const patch of [{ expires_at_ms: a.issued_at_ms }, { expires_at_ms: a.issued_at_ms - 1 },
      { expires_at_ms: a.issued_at_ms + 60_001 }, { idempotency_retained_until_ms: a.expires_at_ms - 1 }])
      rejected(() => assertRegistrationAuthorizationIdentity({ ...a, ...patch }, ACTOR.user_id, i, a.intent_hash));
    const historical = { ...a, issued_at_ms: 1, expires_at_ms: 60_001, idempotency_retained_until_ms: 60_001 };
    expect(() => assertRegistrationAuthorizationIdentity(historical, ACTOR.user_id, i, a.intent_hash)).not.toThrow();
    // Current session/grant/source authority and new-send expiry belong to the
    // coordinator/actual PG tests; this historical integrity helper is not ACL.
  });
  it("checks UTF-8 JSON byte budget at exact boundary, not JS string length", () => {
    expect(() => boundedRegistrationJson("x".repeat(REGISTRATION_JSON_BYTES - 2))).not.toThrow();
    rejected(() => boundedRegistrationJson("x".repeat(REGISTRATION_JSON_BYTES - 1)), "REGISTRATION_CONTEXT_INVALID");
    rejected(() => boundedRegistrationJson("λ".repeat(REGISTRATION_JSON_BYTES / 2)), "REGISTRATION_CONTEXT_INVALID");
    rejected(() => boundedRegistrationJson(undefined), "REGISTRATION_CONTEXT_INVALID");
    const circular: Record<string, unknown> = {}; circular.self = circular;
    rejected(() => boundedRegistrationJson(circular), "REGISTRATION_CONTEXT_INVALID");
  });
  it("binds detached exact POST/path/stage/body and status GET/query bytes independently", () => {
    const i = intent(), a = authorization(i), bounds = { request_bytes: REGISTRATION_JSON_BYTES };
    const preview = encodePmaInstanceRegistrationRequest(i.business_payload, { target_ref: a.source_registration_ref, stage: "PREVIEW" }, bounds);
    const apply = encodePmaInstanceRegistrationRequest(i.business_payload, { target_ref: a.source_registration_ref, stage: "APPLY" }, bounds);
    const lookup = encodePmaInstanceRegistrationStatusRequest(i.business_payload, { target_ref: a.source_registration_ref }, bounds);
    expect(a.request_digests).toEqual({ preview: pmHttpRequestDigest(preview.request, bounds),
      apply: pmHttpRequestDigest(apply.request, bounds), status: pmHttpRequestDigest(lookup.request, bounds) });
    expect(new Set(Object.values(a.request_digests)).size).toBe(3);
    expect(preview.request.method).toBe("POST"); expect(preview.request.raw_path.toString()).toMatch(/\/preview$/);
    expect(apply.request.raw_path.toString()).toMatch(/\/apply$/); expect(lookup.request.method).toBe("GET");
    expect(lookup.request.body).toHaveLength(0);
    expect(lookup.request.query_string.toString()).toBe(`operation=REGISTER_INSTANCE&key=${i.business_payload.idempotency_key}`);
    expect(pmHttpRequestDigest({ ...apply.request, body: Buffer.concat([apply.request.body, Buffer.from(" ")]) }, bounds))
      .not.toBe(a.request_digests.apply);
    for (const key of ["preview", "apply", "status"] as const)
      rejected(() => assertRegistrationAuthorizationIdentity({ ...a, request_digests: {
        ...a.request_digests, [key]: `sha256:${"f".repeat(64)}` } }, ACTOR.user_id, i, a.intent_hash));
    for (const target of ["..", "bad/target", "bad?query", "bad#fragment", "bad\\path", "\ud800"])
      expect(() => registrationRequestDigests(i, target)).toThrow();
    const reordered = { ...i, business_payload: Object.fromEntries(Object.entries(i.business_payload).reverse()) };
    expect(registrationRequestDigests(reordered as InstanceRegistrationIntent, a.source_registration_ref)).toEqual(a.request_digests);
  });
  it("preview fingerprint permits genuine TTL/reference renewal, not source/profile/actor/body/bounds substitution", () => {
    const a = authorization(), hash = registrationPreviewHash(a);
    expect(registrationPreviewHash({ ...a, reference: "TEST_ONLY-renewed-proof", issued_at_ms: NOW + 1,
      expires_at_ms: NOW + 50_000, idempotency_retained_until_ms: NOW + 172_800_000 })).toBe(hash);
    for (const patch of [{ profile_ref: "TEST_ONLY-other-profile" }, { source_selection_ref: "TEST_ONLY-other-source" },
      { authority_ref: "TEST_ONLY-other-custody" }, { membership_revision: "TEST_ONLY-other-membership" },
      { mapping_revision: "TEST_ONLY-other-mapping" }, { actor_id: "TEST_ONLY-other-actor" },
      { source_registration_ref: "TEST_ONLY-other-target" }, { resource_id: "TEST_ONLY-other-portfolio" },
      { expected_source_policy_revision: "2" }, { intent_hash: `sha256:${"d".repeat(64)}` }])
      expect(registrationPreviewHash({ ...a, ...patch })).not.toBe(hash);
  });
  it("remains unqualified by default; no synthetic summary or verifier frame commissions a provider", async () => {
    const i = intent(), a = authorization(i), signal = new AbortController().signal;
    expect(await unqualifiedInstanceRegistrationTrust.prepare({ actor: ACTOR, intent: i, intent_hash: a.intent_hash, signal })).toBeNull();
    expect(await unqualifiedInstanceRegistrationTrust.lookup({ authorization: a, intent: i, signal })).toBeNull();
    await expect(unqualifiedInstanceRegistrationTrust.send({ authorization: a, intent: i, signal })).rejects.toThrow("REGISTRATION_NOT_QUALIFIED");
    expect(projectPmaInstanceRegistrationCandidateResult(appliedSummary(i), i.business_payload,
      { response_bytes: REGISTRATION_JSON_BYTES })).toMatchObject({ authority: "NOT_AUTHENTICATED",
      authoritative_business_applied: null, trusted_command_status: null });
  });
});

describe("ELP2-07 selected frame correlation / rollback and monotonic source registry result", () => {
  it("accepts only exact source PREVIEW_ONLY plus proven-rollback terminal, not predicted commit", () => {
    const o = old(), good = frame(o.authorization, "PREVIEW", previewSummary(o.intent), "PREVIEW_ROLLED_BACK");
    expect(() => assertRegistrationPreview(o.authorization, o.intent, good)).not.toThrow();
    for (const terminal of ["UNKNOWN", "REGISTRY_COMMIT_VERIFIED", "SERVICE_LOOKUP_VERIFIED"] as const)
      rejected(() => assertRegistrationPreview(o.authorization, o.intent, { ...good, terminal }));
    for (const summary of [appliedSummary(o.intent), unknownSummary(), { ...previewSummary(o.intent), reserved: true },
      { ...previewSummary(o.intent), receipt_ref: appliedSummary(o.intent).receipt_ref },
      { ...previewSummary(o.intent), command_version: "0" }, { ...previewSummary(o.intent), command_version: "2" }])
      rejected(() => assertRegistrationPreview(o.authorization, o.intent, frame(o.authorization, "PREVIEW", summary, "PREVIEW_ROLLED_BACK")));
    rejected(() => mergeRegistrationSource(o, frame(o.authorization, "APPLY", previewSummary(o.intent), "REGISTRY_COMMIT_VERIFIED"), "APPLY"));
  });
  it("keeps source namespaced owning receipt and opaque target without manufacturing canonical identity, money or activation", () => {
    const o = old(), before = structuredClone(o);
    const next = mergeRegistrationSource(o, frame(o.authorization, "APPLY", appliedSummary(o.intent), "REGISTRY_COMMIT_VERIFIED"), "APPLY");
    expect(next).toMatchObject({ delivery: "ACKNOWLEDGED", authority: "TEST_ONLY", projection: "UNKNOWN", venue: "NOT_APPLICABLE",
      business: { state: "APPLIED", business_applied: true, source_instance_ref: "TEST_ONLY-source-instance",
        receipt: { kind: "PM_REGISTRY_RECEIPT", key: "pma14:TEST_ONLY-owning-receipt", version: "1" } },
      canonical_identity: { availability: "NOT_PUBLISHED", account_id: null, deployment_id: null }, next_action: "REVIEW_RECEIPT" });
    expect(next.business.receipt!.key).not.toBe(o.intent.business_payload.idempotency_key);
    expect(next.business.source_instance_ref).not.toBe(o.authorization.source_registration_ref);
    for (const key of ["amount", "balance", "funded", "activated", "source_event", "native_execution", "receipt_digest"])
      expect(next).not.toHaveProperty(key);
    expect(next.business).not.toHaveProperty("authority_scope_id");
    expect(next.created_at_ms).toBe(NOW); expect(next.updated_at_ms).toBe(NOW); // Store, not source, owns later clock.
    expect(o).toEqual(before);
  });
  it("permits exact authenticated-lookup shape on STATUS only, never accepts STATUS as original APPLY commit", () => {
    const o = old(), lookup = frame(o.authorization, "STATUS", appliedSummary(o.intent), "SERVICE_LOOKUP_VERIFIED");
    expect(mergeRegistrationSource(o, lookup, "STATUS").business.state).toBe("APPLIED");
    rejected(() => mergeRegistrationSource(o, lookup, "APPLY"));
    rejected(() => mergeRegistrationSource(o, { ...lookup, terminal: "REGISTRY_COMMIT_VERIFIED" }, "STATUS"));
    const apply = frame(o.authorization, "APPLY", appliedSummary(o.intent), "REGISTRY_COMMIT_VERIFIED");
    for (const terminal of ["UNKNOWN", "PREVIEW_ROLLED_BACK", "SERVICE_LOOKUP_VERIFIED"] as const)
      rejected(() => mergeRegistrationSource(o, { ...apply, terminal }, "APPLY"));
  });
  it("requires independent exact proof/source/intent/stage/request/body-byte bindings", () => {
    const o = old(), good = frame(o.authorization, "APPLY", appliedSummary(o.intent), "REGISTRY_COMMIT_VERIFIED");
    const corrupt: Partial<VerifiedRegistrationFrame>[] = [
      { authorization_digest: `sha256:${"b".repeat(64)}` }, { source_selection_ref: "TEST_ONLY-different-source" },
      { intent_hash: `sha256:${"c".repeat(64)}` }, { stage: "STATUS" }, { request_digest: o.authorization.request_digests.preview },
      { response_sha256: "d".repeat(64) }, { response_json: `${good.response_json} ` },
    ];
    for (const patch of corrupt) rejected(() => mergeRegistrationSource(o, { ...good, ...patch }, "APPLY"));
    rejected(() => mergeRegistrationSource(o, { ...good, verified: true } as VerifiedRegistrationFrame, "APPLY"));
    const foreign = { ...o.authorization, source_selection_ref: "TEST_ONLY-foreign", authority_ref: "TEST_ONLY-foreign-custody" };
    rejected(() => mergeRegistrationSource(o, frame(foreign, "APPLY", appliedSummary(o.intent), "REGISTRY_COMMIT_VERIFIED"), "APPLY"));
    const foreignIntent = { ...o.intent, business_payload: { ...o.intent.business_payload, idempotency_key: "TEST_ONLY-another-key" } };
    rejected(() => mergeRegistrationSource(o, frame(o.authorization, "APPLY", appliedSummary(foreignIntent), "REGISTRY_COMMIT_VERIFIED"), "APPLY"));
    const reordered = JSON.stringify(Object.fromEntries(Object.entries(appliedSummary(o.intent)).reverse()));
    expect(reordered).not.toBe(good.response_json);
    rejected(() => mergeRegistrationSource(o, { ...good, response_json: reordered }, "APPLY"));
    expect(mergeRegistrationSource(o, rawFrame(o.authorization, "APPLY", reordered, "REGISTRY_COMMIT_VERIFIED"), "APPLY")
      .business.state).toBe("APPLIED"); // Equal decoded facts still require the exact received byte hash.
  });
  it("requires exact source registry receipt fields/version and no broader execution or funding success claims", () => {
    const o = old(), applied = appliedSummary(o.intent);
    for (const patch of [{ store: "pm_capital.commands" }, { operation: "ACTIVATE" }, { version: "2" }, { version: 1 },
      { key: "" }, { digest: "spoof" }, { raw_proof: {} }])
      rejected(() => mergeRegistrationSource(o, frame(o.authorization, "APPLY", { ...applied,
        receipt_ref: { ...applied.receipt_ref, ...patch } }, "REGISTRY_COMMIT_VERIFIED"), "APPLY"));
    for (const key of Object.keys(flags()))
      rejected(() => mergeRegistrationSource(o, frame(o.authorization, "APPLY", { ...applied, [key]: true }, "REGISTRY_COMMIT_VERIFIED"), "APPLY"));
    const { receipt_ref: _removed, ...missingReceipt } = applied;
    rejected(() => mergeRegistrationSource(o, frame(o.authorization, "APPLY", missingReceipt, "REGISTRY_COMMIT_VERIFIED"), "APPLY"));
    for (const patch of [{ target_id: "" }, { command_version: "2" }, { business_applied: false }, { account_id: "spoof" },
      { state: "REGISTERED_UNFUNDED" }, { execution_authorized: true }])
      rejected(() => mergeRegistrationSource(o, frame(o.authorization, "APPLY", { ...applied, ...patch }, "REGISTRY_COMMIT_VERIFIED"), "APPLY"));
    for (const version of ["0", "2"])
      rejected(() => mergeRegistrationSource(o, frame(o.authorization, "APPLY", { ...applied, command_version: version,
        receipt_ref: { ...applied.receipt_ref, version } }, "REGISTRY_COMMIT_VERIFIED"), "APPLY"));
  });
  it("public status preserves the pinned registry generation and typed absence instead of broader success", () => {
    const o = old(), done = mergeRegistrationSource(o,
      frame(o.authorization, "APPLY", appliedSummary(o.intent), "REGISTRY_COMMIT_VERIFIED"), "APPLY");
    for (const version of ["0", "2", "1\n", 1])
      expect(instanceRegistrationStatus.safeParse({ ...done, business: { ...done.business,
        receipt: { ...done.business.receipt!, version } } }).success).toBe(false);
    for (const business of [{ ...done.business, business_applied: false }, { ...done.business, receipt: null },
      { ...done.business, source_instance_ref: null }, { ...o.status.business, business_applied: false },
      { ...o.status.business, receipt: done.business.receipt }])
      expect(instanceRegistrationStatus.safeParse({ ...done, business }).success).toBe(false);
    expect(instanceRegistrationStatus.safeParse({ ...done,
      canonical_identity: { availability: "AVAILABLE", account_id: "fabricated", deployment_id: "fabricated" } }).success).toBe(false);
    expect(instanceRegistrationStatus.safeParse({ ...done, activation: "RUNNING" }).success).toBe(false);
    expect(instanceRegistrationStatus.safeParse({ ...done, delivery: "DELIVERY_UNKNOWN" }).success).toBe(false);
  });
  it("UNKNOWN stays unknown and cannot erase APPLIED, change receipt, invent negative success or invite resend", () => {
    const o = old(), unknown = frame(o.authorization, "APPLY", unknownSummary(), "UNKNOWN");
    expect(mergeRegistrationSource(o, unknown, "APPLY")).toMatchObject({ delivery: "DELIVERY_UNKNOWN",
      business: { state: "UNKNOWN", business_applied: null, receipt: null, source_instance_ref: null }, next_action: "QUERY_SAME_INTENT" });
    rejected(() => mergeRegistrationSource(o, { ...unknown, terminal: "REGISTRY_COMMIT_VERIFIED" }, "APPLY"));
    const done = { ...o, status: mergeRegistrationSource(o,
      frame(o.authorization, "APPLY", appliedSummary(o.intent), "REGISTRY_COMMIT_VERIFIED"), "APPLY") };
    for (const terminal of ["UNKNOWN", "SERVICE_LOOKUP_VERIFIED"] as const) {
      const lookup = frame(o.authorization, "STATUS", unknownSummary(), terminal);
      expect(mergeRegistrationSource(done, lookup, "STATUS")).toBe(done.status);
    }
    expect(mergeRegistrationSource(done, frame(o.authorization, "STATUS", appliedSummary(o.intent), "SERVICE_LOOKUP_VERIFIED"), "STATUS"))
      .toEqual(done.status);
    const applied = appliedSummary(o.intent);
    for (const patch of [{ target_id: "TEST_ONLY-different-instance" },
      { receipt_ref: { ...applied.receipt_ref, key: "pma14:TEST_ONLY-different-owning-key" } },
      { command_version: "2", receipt_ref: { ...applied.receipt_ref, version: "2" } }])
      rejected(() => mergeRegistrationSource(done,
        frame(o.authorization, "STATUS", { ...applied, ...patch }, "SERVICE_LOOKUP_VERIFIED"), "STATUS"));
    for (const patch of [{ business_applied: false }, { receipt_ref: applied.receipt_ref }, { target_id: "fabricated" }, { state: "ABSENT" }])
      rejected(() => mergeRegistrationSource(o,
        frame(o.authorization, "STATUS", { ...unknownSummary(), ...patch }, "SERVICE_LOOKUP_VERIFIED"), "STATUS"));
  });
  it("rejects duplicate decoded keys at root and nested receipt even with a recomputed exact byte digest", () => {
    const o = old(), json = JSON.stringify(appliedSummary(o.intent));
    const badJson = [
      json.replace('"operation":"REGISTER_INSTANCE"', '"operation":"REGISTER_INSTANCE","operation":"REGISTER_INSTANCE"'),
      json.replace('"operation":"REGISTER_INSTANCE"', '"operation":"REGISTER_INSTANCE","\\u006fperation":"REGISTER_INSTANCE"'),
      json.replace('"key":"pma14:TEST_ONLY-owning-receipt"', '"key":"pma14:TEST_ONLY-owning-receipt","k\\u0065y":"pma14:TEST_ONLY-owning-receipt"'),
      json.replace('"version":"1"', '"version":"1","version":"1"'),
    ];
    for (const response of badJson) {
      expect(response).not.toBe(json);
      rejected(() => mergeRegistrationSource(o, rawFrame(o.authorization, "APPLY", response, "REGISTRY_COMMIT_VERIFIED"), "APPLY"));
    }
  });
  it("rejects malformed UTF-16/raw bytes and escaped lone surrogates; accepts a valid escaped surrogate pair", () => {
    const o = old(), applied = appliedSummary(o.intent);
    for (const value of ["\ud800", "\udc00", "prefix\ud800suffix"])
      rejected(() => mergeRegistrationSource(o,
        frame(o.authorization, "APPLY", { ...applied, target_id: value }, "REGISTRY_COMMIT_VERIFIED"), "APPLY"));
    const literalLoneSurrogate = JSON.stringify(applied).replace("TEST_ONLY-source-instance", "TEST_ONLY-\ud800");
    rejected(() => mergeRegistrationSource(o,
      rawFrame(o.authorization, "APPLY", literalLoneSurrogate, "REGISTRY_COMMIT_VERIFIED"), "APPLY"));
    const valid = JSON.stringify({ ...applied, target_id: "TEST_ONLY-source-🚀" }).replace("🚀", "\\ud83d\\ude80");
    expect(mergeRegistrationSource(o, rawFrame(o.authorization, "APPLY", valid, "REGISTRY_COMMIT_VERIFIED"), "APPLY")
      .business.source_instance_ref).toBe("TEST_ONLY-source-🚀");
  });
  it("rejects malformed JSON/grammar, unsupported number/array/depth and oversized UTF-8 before projection", () => {
    const o = old(), json = JSON.stringify(appliedSummary(o.intent));
    for (const response of ["", `\ufeff${json}`, `${json}true`, json.replace(/}$/, ",}"), "[]", "0", "true", "null",
      '{"a":{"b":{"c":{"d":{"e":"deep"}}}}}', `${json}${" ".repeat(REGISTRATION_JSON_BYTES)}`])
      rejected(() => mergeRegistrationSource(o, rawFrame(o.authorization, "APPLY", response, "REGISTRY_COMMIT_VERIFIED"), "APPLY"));
    const multibyte = `{"padding":"${"λ".repeat(REGISTRATION_JSON_BYTES / 2)}"}`;
    expect(multibyte.length).toBeLessThan(REGISTRATION_JSON_BYTES);
    rejected(() => mergeRegistrationSource(o, rawFrame(o.authorization, "APPLY", multibyte, "REGISTRY_COMMIT_VERIFIED"), "APPLY"));
    const formatted = ` \r\n${JSON.stringify(appliedSummary(o.intent), null, 2)}\t`;
    expect(mergeRegistrationSource(o, rawFrame(o.authorization, "APPLY", formatted, "REGISTRY_COMMIT_VERIFIED"), "APPLY")
      .business.state).toBe("APPLIED");
  });
});

describe("ELP2-07 finite authorized stored-record decoding (pure, no database authority claim)", () => {
  it("retains Core workspace only for the exact registration status path, not neighboring source/mutation paths", () => {
    expect(coreExecutionRead(`/api/v1/execution/instance-registrations/${COMMAND_ID}`)).toBe(true);
    for (const path of ["/api/v1/execution/instance-registrations", "/api/v1/execution/instance-registrations/preview",
      `/api/v1/execution/instance-registrations/${COMMAND_ID}/reconcile`,
      `/api/v1/execution/instance-registrations/${COMMAND_ID}/anything`,
      "/api/v1/execution/instance-registrations/ecm_invalid"])
      expect(coreExecutionRead(path)).toBe(false);
  });
  it("extracts only original target before authority and uniformly hides malformed target", () => {
    const row = candidate(), target = { resource: intent().resource, environment: "paper" };
    expect(registrationTarget({ ...row, status: { hidden: "corrupt-private-result" }, authorization: null })).toEqual(target);
    for (const badIntent of [null, [], { resource: { kind: "ROOT", id: "x" }, environment: "paper" },
      { resource: intent().resource, environment: "all" }])
      rejected(() => registrationTarget({ ...row, intent: badIntent }), "REGISTRATION_NOT_FOUND", 404);
  });
  it("keeps original actor/key/tuple/private proof consistent and reports authorized corruption only after target extraction", () => {
    const row = candidate(), target = registrationTarget(row);
    expect(registrationRecord(row, row.workspace, row.id, target)).toMatchObject({ id: COMMAND_ID, actor: ACTOR.user_id,
      hash: authorization().intent_hash, attempt: null });
    const malformed: Partial<RegistrationCandidate>[] = [{ actor: "TEST_ONLY-other-human" }, { workspace: "TEST_ONLY-other-workspace" },
      { key_hash: `sha256:${"0".repeat(64)}` }, { hash: `sha256:${"1".repeat(64)}` },
      { created_at_ms: NOW - 1 }, { updated_at_ms: NOW + 1 }, { attempt: "invalid" },
      { status: { ...status(), delivery: "SENDING" } },
      { status: { ...status(), delivery: "PREPARED", profile_ref: "TEST_ONLY-other-profile" } }];
    for (const patch of malformed)
      rejected(() => registrationRecord({ ...row, ...patch }, row.workspace, row.id, target));
    rejected(() => registrationRecord(row, row.workspace, row.id,
      { resource: { kind: "PORTFOLIO", id: "TEST_ONLY-other-portfolio" }, environment: "paper" }));
    const historical = { ...row, authorization: { ...authorization(), issued_at_ms: 1,
      expires_at_ms: 60_001, idempotency_retained_until_ms: 60_001 } };
    expect(registrationRecord(historical, row.workspace, row.id, target).authorization.expires_at_ms).toBe(60_001);
  });
});
