/** Isolated correctness implementation; runtime provider remains unqualified.
 * Proposed destination: apps/control-api/test/elp207-pending-control-trust.spec.ts.
 * Every authorization/frame/receipt here is TEST_ONLY synthetic protocol data.
 * No verifier, PM transaction, installed grant, send, HTTP/PG or runtime proof. */
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { AccessActor } from "../src/execution-v2/access.contract";
import { accessDigest } from "../src/execution-v2/access-policy";
import { parsePmaCapitalWire } from "../src/execution-v2/foundation.contract";
import { pmHttpRequestDigest } from "../src/execution-v2/pm-http-request-binding";
import { pendingControlBody, pendingControlIntent, pendingControlPreview, pendingControlStatus,
  pendingCounter, pendingOperation, pendingRecallReceipt, pendingVersions,
  type PendingControlIntent, type PendingControlStatus } from "../src/execution-v2/pending-control.contract";
import { PENDING_JSON_BYTES, assertPendingAuthorizationIdentity, assertPendingPreview,
  assertPendingStatusProgress, boundedPendingJson, mergePendingSource,
  pendingControlAuthorization, pendingIntentHash, pendingPreviewHash, pendingRequestDigests,
  pendingSourcePins, unqualifiedPendingControlTrust,
  type PendingControlAuthorization, type VerifiedPendingFrame } from "../src/execution-v2/pending-control.trust";

const ACTOR: AccessActor = { user_id: "TEST_ONLY-human", session_id: "TEST_ONLY-session", session_generation: 3 };
const NOW = 1_700_000_000_000;
const ID = `ecm_${"1".repeat(32)}`;
const HEX = "a".repeat(64);
const DIGEST = `sha256:${"b".repeat(64)}`;
const SOURCE_PINS = {
  commit: "39aaa9c6f02077246abc9480a907455ece06f62b",
  operator_adapters: "ab57b9d57398f9166d358c61b2c004cbec552f2f6ce75a44c85ffddb3295943e",
  recall_repository: "8c62e73045f7c39483d69ddeff439b747b724970986db91e204005e1d95750e3",
  operator_intent_journal: "6cb6fac7bb81e61dddd2d9decbb099d22c040f13a71565a253dddb06b364492b",
  operator_wire: "3bfa1f6246224ae21da29668685835806112afa98d4893dd45a4c63b32b58fb9",
} as const;
const versionKeys = ["budget", "source", "parent", "book", "command"] as const;
type Versions = PendingControlAuthorization["expected_versions"];
type Operation = PendingControlIntent["business_payload"]["operation"];
type KnownState = Exclude<PendingControlStatus["business"]["state"], "UNKNOWN">;
type Summary = Record<string, unknown>;
const expected = (): Versions => ({ budget: "9007199254740993", source: "2", parent: "3", book: "4", command: "5" });
const advance = (v: Versions): Versions => ({ budget: String(BigInt(v.budget) + 1n), source: String(BigInt(v.source) + 1n),
  parent: v.parent, book: String(BigInt(v.book) + 1n), command: String(BigInt(v.command) + 1n) });
const amounts = () => ({ requested: "100.000000000000000001", applied: "40.000000000000000001",
  pending: "60", cancelled: "0", rejected: "0" });

function intent(operation: Operation = "APPLY_PENDING", deployment = false): PendingControlIntent {
  return pendingControlIntent.parse({ schema_version: "portal.execution.pending-recall-intent.v1",
    workspace_id: "TEST_ONLY-workspace", environment: "paper", expected_policy_revision: "TEST_ONLY-policy",
    resource: { kind: deployment ? "DEPLOYMENT" : "PORTFOLIO", id: deployment ? "TEST_ONLY-deployment" : "TEST_ONLY-portfolio" },
    business_payload: { schema_version: "pma.operator-control.v1", operation,
      idempotency_key: "TEST_ONLY-pending-key", recipient_kind: deployment ? "DEPLOYMENT_ACCOUNT" : "PORTFOLIO",
      ...(deployment ? { recipient_account_id: "TEST_ONLY-account", recipient_deployment_id: "TEST_ONLY-deployment" } : {}),
      currency: "USDT", reason: "TEST_ONLY approved remainder", command_id: "TEST_ONLY-original-recall", expected_versions: expected() } });
}
function prediction() {
  return { state: "WAITING_ENCUMBRANCE" as const, amounts: amounts(), delta: "0", versions: advance(expected()),
    blockers: ["TEST_ONLY-encumbrance"] };
}
function authorization(i = intent()): PendingControlAuthorization {
  const b = i.business_payload;
  return pendingControlAuthorization.parse({ qualification: "TEST_ONLY", reference: "TEST_ONLY-authorization",
    authority_ref: "TEST_ONLY-held-custody", profile_ref: "TEST_ONLY-pending-profile", audience: "pma.management.v1",
    source_selection_ref: "TEST_ONLY-selected-source", source_pins: SOURCE_PINS,
    actor_id: ACTOR.user_id, ts_user_id: "TEST_ONLY-ts-human", workload_ref: "TEST_ONLY-workload",
    delegation_ref: "TEST_ONLY-delegation", mapping_revision: "TEST_ONLY-mapping",
    membership_revision: "TEST_ONLY-membership", membership_receipt_ref: "TEST_ONLY-membership-receipt",
    workspace_id: i.workspace_id, environment: i.environment, operation: b.operation,
    resource_kind: i.resource.kind, resource_id: i.resource.id,
    // Deliberately distinct: a route reference is NOT an owning recipient ID.
    source_target_ref: "TEST_ONLY-route-ref", source_recipient_ref: "TEST_ONLY-owning-recipient",
    original_recall_id: b.command_id,
    recipient: { recipient_kind: b.recipient_kind, currency: b.currency,
      ...(b.recipient_kind === "DEPLOYMENT_ACCOUNT" ? { recipient_account_id: b.recipient_account_id,
        recipient_deployment_id: b.recipient_deployment_id } : {}) },
    policy_revision: i.expected_policy_revision, expected_versions: b.expected_versions,
    original_payload_sha256: HEX, preview_prediction_digest: accessDigest(prediction()),
    intent_hash: pendingIntentHash(ACTOR, i), request_digests: pendingRequestDigests(i, "TEST_ONLY-route-ref"),
    issued_at_ms: NOW, expires_at_ms: NOW + 45_000, idempotency_retained_until_ms: NOW + 86_400_000,
    commit_checks: { human: true, workload: true, membership: true, scope: true, versions: true,
      original_recall: true, remainder: true } });
}
function status(i = intent(), a = authorization(i)): PendingControlStatus {
  return pendingControlStatus.parse({ schema_version: "portal.execution.pending-recall-status.v1",
    family: "PENDING_RECALL_CONTROL", command_id: ID, operation: i.business_payload.operation,
    original_recall_id: i.business_payload.command_id, resource: i.resource, environment: i.environment,
    profile_ref: a.profile_ref, delivery: "SENDING", business: { state: "UNKNOWN", business_applied: null,
      amounts: null, receipt: null, blockers: [] }, economic_cash_changed: false, physical_transfer_performed: false,
    projection: "UNKNOWN", venue: "NOT_APPLICABLE", next_action: "QUERY_SAME_INTENT", authority: "TEST_ONLY",
    created_at_ms: NOW, updated_at_ms: NOW });
}
const old = (operation: Operation = "APPLY_PENDING", deployment = false) => {
  const i = intent(operation, deployment), a = authorization(i);
  return { intent: i, authorization: a, status: status(i, a) };
};
type RecordInput = ReturnType<typeof old>;
function sourceVersions(v: Versions) {
  return { budget_version: v.budget, source_version: v.source, parent_version: v.parent,
    book_version: v.book, command_version: v.command };
}
function waiting(o: RecordInput): Summary {
  return { state: "WAITING_ENCUMBRANCE", business_applied: false, next_action: "QUERY_SAME_INTENT", cli_exit_code: "3",
    physical_transfer_performed: false, operation: o.intent.business_payload.operation,
    command_id: o.authorization.original_recall_id, target: o.authorization.source_recipient_ref,
    ...sourceVersions(advance(o.authorization.expected_versions)), ...amounts(), delta: "0",
    blockers: ["TEST_ONLY-encumbrance"], economic_cash_changed: false, budget_changed: false,
    receipt_id: "TEST_ONLY-control-receipt", source_event_id: "TEST_ONLY-control-event", payload_digest: HEX };
}
function previewSummary(o: RecordInput): Summary {
  const { receipt_id: _receipt, source_event_id: _event, ...base } = waiting(o);
  return { ...base, state: "PREVIEW_ONLY", predicted_state: "WAITING_ENCUMBRANCE", reserved: false,
    business_applied: false, next_action: "REVIEW_PREVIEW", cli_exit_code: "0" };
}
const unknown = (): Summary => ({ state: "UNKNOWN", business_applied: null, next_action: "QUERY_SAME_INTENT", cli_exit_code: "3" });
function terminalSummary(o: RecordInput, state: Exclude<KnownState, "WAITING_ENCUMBRANCE">): Summary {
  const requested = amounts().requested;
  return { ...waiting(o), state, next_action: "REVIEW_RECEIPT", cli_exit_code: state === "APPLIED" ? "0" : "2",
    business_applied: state === "APPLIED", applied: state === "APPLIED" ? requested : state === "PARTIALLY_APPLIED_CANCELLED" ? amounts().applied : "0",
    pending: "0", cancelled: state === "CANCELLED" ? requested : state === "PARTIALLY_APPLIED_CANCELLED" ? "60" : "0",
    rejected: state === "REJECTED" ? requested : "0", blockers: [], delta: state === "APPLIED" ? "60" : "0" };
}
function rawFrame(a: PendingControlAuthorization, stage: VerifiedPendingFrame["stage"], response_json: string,
  terminal: VerifiedPendingFrame["terminal"]): VerifiedPendingFrame {
  return { authorization_digest: accessDigest(a), source_selection_ref: a.source_selection_ref, intent_hash: a.intent_hash,
    stage, request_digest: a.request_digests[stage.toLowerCase() as "preview" | "apply" | "status"], response_json,
    response_sha256: createHash("sha256").update(Buffer.from(response_json, "utf8")).digest("hex"), terminal };
}
const frame = (a: PendingControlAuthorization, stage: VerifiedPendingFrame["stage"], body: unknown,
  terminal: VerifiedPendingFrame["terminal"]) => rawFrame(a, stage, JSON.stringify(body), terminal);
function accepted(o = old(), body = waiting(o)): RecordInput {
  return { ...o, status: mergePendingSource(o, frame(o.authorization, "APPLY", body, "RECALL_CONTROL_COMMIT_VERIFIED"), "APPLY") };
}
function linked(o: RecordInput, patch: Summary = {}): Summary {
  const { operation: _notPublished, ...base } = waiting(o);
  return { ...base, ...sourceVersions(advance(o.status.business.receipt!.versions)),
    original_receipt_id: o.status.business.receipt!.control_receipt_id, queried_operation: o.intent.business_payload.operation,
    receipt_id: "TEST_ONLY-later-receipt", source_event_id: "TEST_ONLY-later-event",
    applied: "60.000000000000000001", pending: "40", delta: "20", ...patch };
}
const mergeStatus = (o: RecordInput, body: unknown) => mergePendingSource(o,
  frame(o.authorization, "STATUS", body, "SERVICE_LOOKUP_VERIFIED"), "STATUS");
function refused(call: () => unknown, code = "PENDING_CONTROL_RECEIPT_UNVERIFIED") {
  expect(call).toThrowError(expect.objectContaining({ code, status: 503 }));
}

describe("ELP2-07 pending-control finite ingress / TEST_ONLY", () => {
  it("returns safeParse(false), never throws from BigInt refinement on malformed ingress", () => {
    const malformed: unknown[] = [undefined, null, 1, 1n, {}, [], "", " ", "-1", "+1", "01", "1.0", "1e3",
      "Infinity", "NaN", "1\n", "1\r", "1\u2028", "\ud800", "9223372036854775808", "9".repeat(1000)];
    for (const value of malformed) {
      expect(() => { expect(pendingCounter.safeParse(value).success).toBe(false); }).not.toThrow();
      expect(() => { expect(pendingControlIntent.safeParse({ ...intent(), business_payload: { ...intent().business_payload,
        expected_versions: { ...expected(), command: value } } }).success).toBe(false); }).not.toThrow();
    }
    for (const value of ["0", "9007199254740993", "9223372036854775807"])
      expect(pendingCounter.parse(value)).toBe(value);
  });
  it.each(["APPLY_PENDING", "CANCEL_REMAINING"] as const)("keeps %s and exactly five STRING CAS values", operation => {
    const i = intent(operation); expect(pendingControlIntent.parse(i)).toEqual(i);
    expect(pendingVersions.parse(expected())).toEqual(expected());
    for (const key of versionKeys) {
      const incomplete: Record<string, unknown> = { ...expected() }; delete incomplete[key];
      expect(pendingControlBody.safeParse({ ...i.business_payload, expected_versions: incomplete }).success).toBe(false);
      for (const value of [1, null, "01", "9223372036854775808", "1\n"])
        expect(pendingControlBody.safeParse({ ...i.business_payload, expected_versions: { ...expected(), [key]: value } }).success).toBe(false);
    }
    expect(pendingVersions.safeParse({ ...expected(), lock: "1" }).success).toBe(false);
  });
  it("keeps P and exact D/A distinct, refuses ROOT, added amount and all neighboring operations", () => {
    const p = intent(), d = intent("APPLY_PENDING", true);
    expect(pendingControlIntent.parse(d)).toEqual(d);
    for (const patch of [{ recipient_kind: "ROOT" }, { amount: "1" }, { source_url: "https://invalid" },
      { actor_id: "spoof" }, { recipient_account_id: "extra" }, { lock_id: "extra" }])
      expect(pendingControlBody.safeParse({ ...p.business_payload, ...patch }).success).toBe(false);
    for (const operation of ["RECALL_PARTIAL", "RECALL_FULL", "ADMIN_LOCK", "RETURN_CAPITAL", "APPLY", ""])
      expect(pendingControlBody.safeParse({ ...p.business_payload, operation }).success).toBe(false);
    expect(pendingOperation.options).toEqual(["APPLY_PENDING", "CANCEL_REMAINING"]);
    expect(() => parsePmaCapitalWire(p.business_payload)).toThrow(); // No widening of the original eight-capital wire.
    for (const key of ["recipient_account_id", "recipient_deployment_id"]) {
      const body: Record<string, unknown> = { ...d.business_payload }; delete body[key];
      expect(pendingControlIntent.safeParse({ ...d, business_payload: body }).success).toBe(false);
    }
    expect(pendingControlIntent.safeParse({ ...d, resource: p.resource }).success).toBe(false);
    expect(pendingControlIntent.safeParse({ ...d, resource: { ...d.resource, id: "TEST_ONLY-other-deployment" } }).success).toBe(false);
  });
  it("refuses malformed text, unsafe epochs, widened proof fields and nonliteral commit checks", () => {
    const a = authorization();
    for (const reference of ["", "x".repeat(257), "bad\ninside", "bad\u0000", "\ud800", "\udc00"])
      expect(pendingControlAuthorization.safeParse({ ...a, reference }).success).toBe(false);
    for (const issued_at_ms of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN, "1"])
      expect(pendingControlAuthorization.safeParse({ ...a, issued_at_ms }).success).toBe(false);
    for (const patch of [{ audience: "capital" }, { source_url: "https://invalid" }, { qualification: "SOURCE_VERIFIED" },
      { resource_kind: "ROOT" }, { operation: "RETURN_CAPITAL" }, { original_payload_sha256: DIGEST }])
      expect(pendingControlAuthorization.safeParse({ ...a, ...patch }).success).toBe(false);
    for (const key of Object.keys(a.commit_checks)) {
      for (const value of [false, null, "true", 1, {}])
        expect(pendingControlAuthorization.safeParse({ ...a, commit_checks: { ...a.commit_checks, [key]: value } }).success).toBe(false);
      const incomplete: Record<string, unknown> = { ...a.commit_checks }; delete incomplete[key];
      expect(pendingControlAuthorization.safeParse({ ...a, commit_checks: incomplete }).success).toBe(false);
    }
  });
  it("pins every reviewed source byte literally, without treating parsed pins as installed authority", () => {
    expect(pendingSourcePins.parse(SOURCE_PINS)).toEqual(SOURCE_PINS);
    for (const key of Object.keys(SOURCE_PINS)) {
      expect(pendingSourcePins.safeParse({ ...SOURCE_PINS, [key]: "other" }).success).toBe(false);
      const missing: Record<string, unknown> = { ...SOURCE_PINS }; delete missing[key];
      expect(pendingSourcePins.safeParse(missing).success).toBe(false);
    }
    expect(pendingSourcePins.safeParse({ ...SOURCE_PINS, deployed: true }).success).toBe(false);
  });
  it("keeps preview allowed/denied shape complete and never reserves/applies on preview", () => {
    const denied = { schema_version: "portal.execution.pending-recall-preview.v1", operation: "APPLY_PENDING",
      original_recall_id: "TEST_ONLY-original-recall", allowed: false, reason_code: "PENDING_CONTROL_NOT_QUALIFIED",
      preview_digest: null, expires_at_ms: null, profile_ref: null, prediction: null, business_applied: false, reserved: false };
    expect(pendingControlPreview.safeParse(denied).success).toBe(true);
    const allowed = { ...denied, allowed: true, reason_code: null, preview_digest: DIGEST,
      expires_at_ms: NOW + 1, profile_ref: "TEST_ONLY-profile", prediction: prediction() };
    expect(pendingControlPreview.safeParse(allowed).success).toBe(true);
    for (const key of ["preview_digest", "expires_at_ms", "profile_ref", "prediction"])
      expect(pendingControlPreview.safeParse({ ...allowed, [key]: null }).success).toBe(false);
    for (const patch of [{ business_applied: true }, { reserved: true }, { reason_code: "PENDING_CONTROL_NOT_QUALIFIED" }])
      expect(pendingControlPreview.safeParse({ ...allowed, ...patch }).success).toBe(false);
    expect(pendingControlPreview.safeParse({ ...denied, prediction: prediction() }).success).toBe(false);
  });
});

describe("ELP2-07 exact pending request/original identity / TEST_ONLY", () => {
  it("normalizes closed wire field order but binds delivered method/path/query/body separately", () => {
    const i = intent(), b = i.business_payload, target = "TEST_ONLY-route-ref";
    const canonicalBody = JSON.stringify({ schema_version: b.schema_version, operation: b.operation,
      idempotency_key: b.idempotency_key, recipient_kind: b.recipient_kind, currency: b.currency, reason: b.reason,
      command_id: b.command_id, expected_versions: { budget: b.expected_versions.budget, source: b.expected_versions.source,
        parent: b.expected_versions.parent, book: b.expected_versions.book, command: b.expected_versions.command } });
    const digest = (method: "GET" | "POST", suffix: string, query: string, body: string) => pmHttpRequestDigest({ method,
      raw_path: Buffer.from(`/internal/pma11-candidate/capital/${target}/${suffix}`),
      query_string: Buffer.from(query), body: Buffer.from(body) }, { request_bytes: PENDING_JSON_BYTES });
    expect(pendingRequestDigests(i, target)).toEqual({ preview: digest("POST", "preview", "", canonicalBody),
      apply: digest("POST", "apply", "", canonicalBody),
      status: digest("GET", "status", "operation=APPLY_PENDING&key=TEST_ONLY-pending-key", "") });
    const reordered = { ...i, business_payload: Object.fromEntries(Object.entries(b).reverse()) } as PendingControlIntent;
    expect(pendingRequestDigests(reordered, target)).toEqual(pendingRequestDigests(i, target));
    expect(new Set(Object.values(pendingRequestDigests(i, target))).size).toBe(3);
    for (const key of ["preview", "apply", "status"] as const)
      expect(pendingRequestDigests(i, "TEST_ONLY-other-route")[key]).not.toBe(pendingRequestDigests(i, target)[key]);
  });
  it("does not mistake the GET status digest for full intent/economics/authority binding", () => {
    const i = intent(), changed = { ...i, business_payload: { ...i.business_payload, reason: "TEST_ONLY changed",
      expected_versions: { ...expected(), command: "6" } } };
    const a = pendingRequestDigests(i, "TEST_ONLY-route-ref"), b = pendingRequestDigests(changed, "TEST_ONLY-route-ref");
    expect(a.status).toBe(b.status); // Source lookup grammar is operation+key, not a POST body.
    expect(a.apply).not.toBe(b.apply); expect(a.preview).not.toBe(b.preview);
    expect(pendingIntentHash(ACTOR, i)).not.toBe(pendingIntentHash(ACTOR, changed));
    expect(pendingIntentHash({ user_id: "TEST_ONLY-other" }, i)).not.toBe(pendingIntentHash(ACTOR, i));
    const o = old(); refused(() => assertPendingAuthorizationIdentity(o.authorization, ACTOR.user_id, changed, o.authorization.intent_hash));
    expect(o.authorization.original_payload_sha256).toBe(HEX);
    expect(o.authorization.intent_hash).not.toBe(`sha256:${HEX}`);
  });
  it.each([false, true])("binds current original correlation for deployment=%s without browser source/actor shortcuts", deployment => {
    const i = intent("APPLY_PENDING", deployment), a = authorization(i);
    expect(() => assertPendingAuthorizationIdentity(a, ACTOR.user_id, i, a.intent_hash)).not.toThrow();
    const patches: Partial<PendingControlAuthorization>[] = [{ actor_id: "TEST_ONLY-other" }, { workload_ref: a.actor_id },
      { workload_ref: a.ts_user_id }, { workspace_id: "other" }, { environment: "live" }, { operation: "CANCEL_REMAINING" },
      { resource_id: "other" }, { resource_kind: deployment ? "PORTFOLIO" : "DEPLOYMENT" }, { policy_revision: "other" },
      { original_recall_id: "other" }, { source_target_ref: "TEST_ONLY-other-route" }, { intent_hash: DIGEST },
      { recipient: { ...a.recipient, currency: "BTC" } }, { expected_versions: { ...a.expected_versions, command: "6" } },
      { request_digests: { ...a.request_digests, status: DIGEST } }];
    for (const patch of patches)
      refused(() => assertPendingAuthorizationIdentity({ ...a, ...patch }, ACTOR.user_id, i, a.intent_hash));
    if (a.recipient.recipient_kind === "DEPLOYMENT_ACCOUNT") {
      const recipient = a.recipient;
      for (const key of ["recipient_account_id", "recipient_deployment_id"] as const)
        refused(() => assertPendingAuthorizationIdentity({ ...a, recipient: { ...recipient, [key]: "other" } }, ACTOR.user_id, i, a.intent_hash));
    }
  });
  it("checks original TTL/retention integrity, not today's clock for historical receipt lookup", () => {
    const o = old(), a = o.authorization;
    for (const patch of [{ expires_at_ms: a.issued_at_ms }, { expires_at_ms: a.issued_at_ms - 1 },
      { expires_at_ms: a.issued_at_ms + 60_001 }, { idempotency_retained_until_ms: a.expires_at_ms - 1 }])
      refused(() => assertPendingAuthorizationIdentity({ ...a, ...patch }, ACTOR.user_id, o.intent, a.intent_hash));
    const historical = { ...a, issued_at_ms: 1, expires_at_ms: 60_001, idempotency_retained_until_ms: 60_001 };
    expect(() => assertPendingAuthorizationIdentity(historical, ACTOR.user_id, o.intent, a.intent_hash)).not.toThrow();
    // Current authority and new-send expiry remain actual coordinator/PG duties.
  });
  it("renews only excluded lease metadata without erasing preview dependencies", () => {
    const a = authorization(), renewed = { ...a, reference: "TEST_ONLY-renewal", issued_at_ms: a.issued_at_ms + 1,
      expires_at_ms: a.expires_at_ms + 1, idempotency_retained_until_ms: a.idempotency_retained_until_ms + 1 };
    expect(pendingPreviewHash(renewed)).toBe(pendingPreviewHash(a));
    expect(accessDigest(renewed)).not.toBe(accessDigest(a)); // Exact verified frame still binds the actual envelope.
    for (const patch of [{ source_recipient_ref: "other" }, { source_target_ref: "other" }, { source_selection_ref: "other" },
      { profile_ref: "other" }, { membership_revision: "other" }, { mapping_revision: "other" }, { authority_ref: "other" },
      { original_payload_sha256: "c".repeat(64) }, { preview_prediction_digest: DIGEST },
      { expected_versions: { ...expected(), command: "6" } }])
      expect(pendingPreviewHash({ ...a, ...patch })).not.toBe(pendingPreviewHash(a));
  });
});

describe("ELP2-07 rollback preview and source frame correlation / TEST_ONLY", () => {
  it("returns the exact source prediction, including cumulative applied and this-revision delta0", () => {
    const o = old(), p = assertPendingPreview(o.authorization, o.intent,
      frame(o.authorization, "PREVIEW", previewSummary(o), "PREVIEW_ROLLED_BACK"));
    expect(p).toEqual(prediction()); expect(p.delta).toBe("0"); expect(p.amounts.applied).toBe("40.000000000000000001");
    expect(o.status.business.state).toBe("UNKNOWN"); expect(o.status.business.receipt).toBeNull();
  });
  it("requires PREVIEW_ROLLED_BACK envelope semantics, complete source fields and exact prediction digest", () => {
    const o = old(), good = frame(o.authorization, "PREVIEW", previewSummary(o), "PREVIEW_ROLLED_BACK");
    for (const terminal of ["UNKNOWN", "SERVICE_LOOKUP_VERIFIED", "RECALL_CONTROL_COMMIT_VERIFIED"] as const)
      refused(() => assertPendingPreview(o.authorization, o.intent, { ...good, terminal }));
    for (const patch of [{ business_applied: true }, { reserved: true }, { physical_transfer_performed: true },
      { state: "APPLIED" }, { predicted_state: "PARTIALLY_APPLIED" }, { delta: "1" }, { blockers: [] },
      { command_id: "other" }, { receipt_id: "not-a-rollback-receipt" }, { economic_cash_changed: true }])
      refused(() => assertPendingPreview(o.authorization, o.intent,
        frame(o.authorization, "PREVIEW", { ...previewSummary(o), ...patch }, "PREVIEW_ROLLED_BACK")));
    for (const key of ["payload_digest", "blockers", "requested", "delta", "command_version"]) {
      const missing = previewSummary(o); delete missing[key];
      refused(() => assertPendingPreview(o.authorization, o.intent, frame(o.authorization, "PREVIEW", missing, "PREVIEW_ROLLED_BACK")));
    }
    for (const key of versionKeys) {
      const predictionChanged = previewSummary(o);
      predictionChanged[`${key}_version`] = String(BigInt(expected()[key]) - 1n);
      refused(() => assertPendingPreview(o.authorization, o.intent,
        frame(o.authorization, "PREVIEW", predictionChanged, "PREVIEW_ROLLED_BACK")));
    }
  });
  it("rejects every detached frame correlation and byte tamper even for equal decoded facts", () => {
    const o = old(), good = frame(o.authorization, "APPLY", waiting(o), "RECALL_CONTROL_COMMIT_VERIFIED");
    const patches: Partial<VerifiedPendingFrame>[] = [{ authorization_digest: DIGEST }, { source_selection_ref: "other" },
      { intent_hash: DIGEST }, { request_digest: DIGEST }, { stage: "STATUS" }, { response_sha256: "0".repeat(64) },
      { terminal: "PREVIEW_ROLLED_BACK" }, { terminal: "SERVICE_LOOKUP_VERIFIED" }];
    for (const patch of patches) refused(() => mergePendingSource(o, { ...good, ...patch }, "APPLY"));
    refused(() => mergePendingSource(o, { ...good, verified: true } as VerifiedPendingFrame, "APPLY"));
    const reordered = JSON.stringify(Object.fromEntries(Object.entries(waiting(o)).reverse()));
    expect(reordered).not.toBe(good.response_json);
    refused(() => mergePendingSource(o, { ...good, response_json: reordered }, "APPLY"));
    expect(mergePendingSource(o, rawFrame(o.authorization, "APPLY", reordered, "RECALL_CONTROL_COMMIT_VERIFIED"), "APPLY").business.state)
      .toBe("WAITING_ENCUMBRANCE");
  });
  it("binds source owning recipient rather than route ref, original digest, recall and all five current CAS", () => {
    const o = old(); expect(o.authorization.source_target_ref).not.toBe(o.authorization.source_recipient_ref);
    for (const patch of [{ target: o.authorization.source_target_ref }, { target: "other" }, { command_id: "other" },
      { payload_digest: "c".repeat(64) }, { payload_digest: `sha256:${HEX}` }])
      refused(() => mergePendingSource(o, frame(o.authorization, "APPLY", { ...waiting(o), ...patch }, "RECALL_CONTROL_COMMIT_VERIFIED"), "APPLY"));
    const sourceKeys = { budget: "budget_version", source: "source_version", parent: "parent_version", book: "book_version", command: "command_version" } as const;
    for (const key of versionKeys) {
      const sourceKey = sourceKeys[key];
      const missing = waiting(o); delete missing[sourceKey];
      refused(() => mergePendingSource(o, frame(o.authorization, "APPLY", missing, "RECALL_CONTROL_COMMIT_VERIFIED"), "APPLY"));
      for (const value of [String(BigInt(expected()[key]) - 1n), "9223372036854775808", 7, "7\n"])
        refused(() => mergePendingSource(o, frame(o.authorization, "APPLY", { ...waiting(o), [sourceKey]: value }, "RECALL_CONTROL_COMMIT_VERIFIED"), "APPLY"));
    }
    const missingDigest = waiting(o); delete missingDigest.payload_digest;
    refused(() => mergePendingSource(o, frame(o.authorization, "APPLY", missingDigest, "RECALL_CONTROL_COMMIT_VERIFIED"), "APPLY"));
  });
  it("refuses incomplete receipt, source partition, wrong stage and local correlation before accepting business", () => {
    const o = old();
    for (const key of ["receipt_id", "source_event_id", "blockers", "rejected", "physical_transfer_performed", "economic_cash_changed"]) {
      const missing = waiting(o); delete missing[key];
      refused(() => mergePendingSource(o, frame(o.authorization, "APPLY", missing, "RECALL_CONTROL_COMMIT_VERIFIED"), "APPLY"));
    }
    refused(() => mergePendingSource(o, frame(o.authorization, "APPLY", previewSummary(o), "RECALL_CONTROL_COMMIT_VERIFIED"), "APPLY"));
    for (const patch of [{ operation: "CANCEL_REMAINING" }, { original_recall_id: "other" }, { environment: "live" },
      { resource: { kind: "PORTFOLIO", id: "other" } }, { profile_ref: "other" }, { authority: "OWNER_VERIFIED" }])
      refused(() => mergePendingSource({ ...o, status: { ...o.status, ...patch } as PendingControlStatus },
        frame(o.authorization, "APPLY", waiting(o), "RECALL_CONTROL_COMMIT_VERIFIED"), "APPLY"));
  });
});

describe("ELP2-07 actual states, original receipt and latest owning progress / TEST_ONLY", () => {
  it.each(["APPLIED", "CANCELLED", "PARTIALLY_APPLIED_CANCELLED", "REJECTED"] as const)("keeps finite terminal %s and exact amounts", state => {
    const o = old(state === "APPLIED" ? "APPLY_PENDING" : "CANCEL_REMAINING"), result = accepted(o, terminalSummary(o, state)).status;
    expect(result.business.state).toBe(state); expect(result.business.business_applied).toBe(state === "APPLIED");
    expect(result.delivery).toBe("ACKNOWLEDGED"); expect(result.next_action).toBe("REVIEW_RECEIPT");
    expect(result).toMatchObject({ economic_cash_changed: false, physical_transfer_performed: false, projection: "UNKNOWN", venue: "NOT_APPLICABLE" });
    expect(result.business.amounts!.requested).toBe(amounts().requested);
    if (state === "PARTIALLY_APPLIED_CANCELLED") expect(result.business.amounts).toEqual({ ...amounts(), pending: "0", cancelled: "60" });
  });
  it("keeps WAITING with nonzero cumulative applied and delta0 instead of inventing PARTIALLY_APPLIED", () => {
    const o = accepted(); expect(o.status.business.state).toBe("WAITING_ENCUMBRANCE");
    expect(o.status.business.amounts).toEqual(amounts()); expect(o.status.business.business_applied).toBe(false);
    expect(o.status.business.receipt!.versions.budget).toBe("9007199254740994");
    expect(o.status.next_action).toBe("QUERY_SAME_INTENT");
    refused(() => mergeStatus(o, { ...waiting(o), state: "PARTIALLY_APPLIED" }));
  });
  it("validates exact decimal partitions and state-specific zeros without Number coercion", () => {
    const o = old();
    for (const patch of [{ requested: "100" }, { pending: "60.000000000000000001" }, { applied: 40 }, { applied: "40\n" },
      { applied: "04" }, { applied: "-1" }, { applied: "4e1" }, { state: "APPLIED", business_applied: true, next_action: "REVIEW_RECEIPT", cli_exit_code: "0" },
      { cancelled: "1", pending: "59" }, { rejected: "1", pending: "59" },
      { pending: "0", applied: amounts().requested }])
      refused(() => mergePendingSource(o, frame(o.authorization, "APPLY", { ...waiting(o), ...patch }, "RECALL_CONTROL_COMMIT_VERIFIED"), "APPLY"));
  });
  it("uses original authenticated intent only for an unlinked original receipt when operation is unpublished", () => {
    for (const operation of ["APPLY_PENDING", "CANCEL_REMAINING"] as const) {
      const o = old(operation), body = operation === "APPLY_PENDING" ? waiting(o) : terminalSummary(o, "CANCELLED");
      delete body.operation;
      const receipt = accepted(o, body).status.business.receipt!;
      expect(receipt.control_receipt_id).toBe(receipt.latest_receipt_id);
      expect(receipt).toMatchObject({ latest_operation: operation, latest_operation_availability: "AVAILABLE", latest_operation_reason: null });
    }
  });
  it("accepts linked newer partitions with typed absent latest operation; never substitutes queried_operation", () => {
    const o = accepted(), result = mergeStatus(o, linked(o)), receipt = result.business.receipt!;
    expect(result.business.amounts).toEqual({ ...amounts(), applied: "60.000000000000000001", pending: "40" });
    expect(result.operation).toBe("APPLY_PENDING");
    expect(receipt).toMatchObject({ control_receipt_id: "TEST_ONLY-control-receipt", latest_receipt_id: "TEST_ONLY-later-receipt",
      original_payload_sha256: HEX, latest_operation: null, latest_operation_availability: "NOT_PUBLISHED",
      latest_operation_reason: "SOURCE_OPERATION_NOT_PUBLISHED" });
    expect(pendingRecallReceipt.parse(receipt)).toEqual(receipt);
    for (const patch of [{ latest_operation: "APPLY_PENDING" }, { latest_operation_availability: "AVAILABLE" }, { latest_operation_reason: null }])
      expect(pendingRecallReceipt.safeParse({ ...receipt, ...patch }).success).toBe(false);
    expect(o.status.business.amounts).toEqual(amounts()); // Original accepted object/history unchanged.
  });
  it("accepts explicit different latest operation only with exact original receipt/query correspondence", () => {
    const o = accepted(), later = linked(o, { operation: "CANCEL_REMAINING", state: "PARTIALLY_APPLIED_CANCELLED",
      business_applied: false, next_action: "REVIEW_RECEIPT", cli_exit_code: "2", applied: amounts().applied, pending: "0", cancelled: "60", delta: "0", blockers: [] });
    const result = mergeStatus(o, later);
    expect(result.operation).toBe("APPLY_PENDING"); expect(result.business.state).toBe("PARTIALLY_APPLIED_CANCELLED");
    expect(result.business.receipt).toMatchObject({ latest_operation: "CANCEL_REMAINING", latest_operation_availability: "AVAILABLE", latest_operation_reason: null });
    for (const patch of [{ queried_operation: "CANCEL_REMAINING" }, { original_receipt_id: "other" },
      { original_receipt_id: later.receipt_id }, { receipt_id: "TEST_ONLY-control-receipt" }, { operation: "ADMIN_LOCK" }, { payload_digest: "c".repeat(64) }])
      refused(() => mergeStatus(o, { ...later, ...patch }));
    for (const key of ["original_receipt_id", "queried_operation"]) { const missing = { ...later }; delete missing[key]; refused(() => mergeStatus(o, missing)); }
    refused(() => mergePendingSource(o, frame(o.authorization, "APPLY", later, "RECALL_CONTROL_COMMIT_VERIFIED"), "APPLY"));
    refused(() => mergePendingSource(old(), frame(o.authorization, "APPLY", { ...waiting(o), operation: "CANCEL_REMAINING" }, "RECALL_CONTROL_COMMIT_VERIFIED"), "APPLY"));
  });
  it("UNKNOWN cannot erase any acknowledged WAITING/terminal receipt or invent zero amounts", () => {
    const o = old(), first = mergePendingSource(o, frame(o.authorization, "APPLY", unknown(), "UNKNOWN"), "APPLY");
    expect(first).toMatchObject({ delivery: "DELIVERY_UNKNOWN", business: { state: "UNKNOWN", business_applied: null,
      amounts: null, receipt: null, blockers: [] }, next_action: "QUERY_SAME_INTENT" });
    const records = [accepted(o), ...(["APPLIED", "CANCELLED", "PARTIALLY_APPLIED_CANCELLED", "REJECTED"] as const)
      .map(state => { const original = old(state === "APPLIED" ? "APPLY_PENDING" : "CANCEL_REMAINING"); return accepted(original, terminalSummary(original, state)); })];
    for (const record of records) for (const terminal of ["UNKNOWN", "SERVICE_LOOKUP_VERIFIED"] as const)
      expect(mergePendingSource(record, frame(record.authorization, "STATUS", unknown(), terminal), "STATUS")).toBe(record.status);
    refused(() => mergePendingSource(o, frame(o.authorization, "APPLY", unknown(), "RECALL_CONTROL_COMMIT_VERIFIED"), "APPLY"));
    const known = records[0]; refused(() => assertPendingStatusProgress(known.status, { ...known.status, business: o.status.business }));
    expect(pendingControlStatus.safeParse({ ...o.status, business: { ...o.status.business, amounts: amounts() } }).success).toBe(false);
    refused(() => mergeStatus(known, { ...unknown(), payload_digest: "c".repeat(64) }));
    refused(() => mergeStatus(known, { ...unknown(), target: "TEST_ONLY-other-recipient" }));
  });
  it.each(["APPLIED", "CANCELLED", "PARTIALLY_APPLIED_CANCELLED", "REJECTED"] as const)("never changes terminal %s into a newer business receipt", state => {
    const original = old(state === "APPLIED" ? "APPLY_PENDING" : "CANCEL_REMAINING"), body = terminalSummary(original, state), o = accepted(original, body);
    expect(mergeStatus(o, body)).toBe(o.status);
    refused(() => mergeStatus(o, { ...body, blockers: ["TEST_ONLY-new-blocker"] }));
    refused(() => mergeStatus(o, { ...body, ...sourceVersions(advance(o.status.business.receipt!.versions)),
      original_receipt_id: "TEST_ONLY-control-receipt", queried_operation: o.intent.business_payload.operation,
      receipt_id: "TEST_ONLY-later-receipt", source_event_id: "TEST_ONLY-later-event" }));
  });
  it("allows only forward WAITING progress, preserves older authenticated snapshots and holds original receipt fixed", () => {
    const o = accepted(), later = mergeStatus(o, linked(o)), current = { ...o, status: later };
    expect(later.business.receipt!.control_receipt_id).toBe(o.status.business.receipt!.control_receipt_id);
    expect(later.business.receipt!.latest_receipt_id).not.toBe(o.status.business.receipt!.latest_receipt_id);
    expect(() => assertPendingStatusProgress(o.status, later)).not.toThrow();
    expect(mergeStatus(current, waiting(o))).toBe(current.status); // Authenticated but older snapshot cannot roll state back.
    refused(() => assertPendingStatusProgress(later, o.status)); // Store API never persists a regression.
    const bad = linked(o, { applied: "30.000000000000000001", pending: "70" });
    refused(() => mergeStatus(o, bad));
    for (const patch of [{ requested: "101.000000000000000001", pending: "41" },
      { receipt_id: "TEST_ONLY-control-receipt" }, { source_event_id: "TEST_ONLY-control-event" }, { original_receipt_id: "other" }])
      refused(() => mergeStatus(o, linked(o, patch)));
  });
  it("checks every CAS direction, rejects mixed/same-command conflicts and never accepts a newer APPLY replay", () => {
    const o = accepted(), versions = o.status.business.receipt!.versions;
    const sourceKeys = { budget: "budget_version", source: "source_version", parent: "parent_version", book: "book_version", command: "command_version" } as const;
    for (const key of versionKeys) refused(() => mergeStatus(o, linked(o, { [sourceKeys[key]]: String(BigInt(versions[key]) - 1n) })));
    refused(() => mergeStatus(o, linked(o, { command_version: versions.command })));
    refused(() => mergeStatus(o, { ...waiting(o), blockers: ["TEST_ONLY-conflicting-same-version"] }));
    // Even without linked metadata an APPLY response cannot replace its own original receipt.
    const newerApply = { ...waiting(o), ...sourceVersions(advance(versions)), receipt_id: "TEST_ONLY-later-receipt",
      source_event_id: "TEST_ONLY-later-event", applied: "60.000000000000000001", pending: "40" };
    refused(() => mergePendingSource(o, frame(o.authorization, "APPLY", newerApply, "RECALL_CONTROL_COMMIT_VERIFIED"), "APPLY"));
  });
  it("revalidates store identity/clock/action/partition invariants through the shared pure helper", () => {
    const o = accepted(), before = o.status;
    for (const patch of [{ command_id: `ecm_${"2".repeat(32)}` }, { operation: "CANCEL_REMAINING" }, { original_recall_id: "other" },
      { profile_ref: "other" }, { created_at_ms: NOW - 1 }, { updated_at_ms: NOW - 1 }, { authority: "OWNER_VERIFIED" },
      { next_action: "REVIEW_RECEIPT" }])
      refused(() => assertPendingStatusProgress(before, { ...before, ...patch } as PendingControlStatus));
    for (const key of ["economic_cash_changed", "physical_transfer_performed"])
      expect(pendingControlStatus.safeParse({ ...before, [key]: true }).success).toBe(false);
    expect(pendingControlStatus.safeParse({ ...before, delivery: "DELIVERY_UNKNOWN" }).success).toBe(false);
    const invalidPartition = { ...before, business: { ...before.business, amounts: { ...amounts(), cancelled: "1", pending: "59" } } };
    refused(() => assertPendingStatusProgress(invalidPartition, invalidPartition));
    // Delivery knowledge and next action are public cross-invariants, not
    // merely expectations of the merger's usual happy-path constructor.
    const noReceipt = status(), actions = ["QUERY_SAME_INTENT", "REVIEW_RECEIPT", "REVIEW_BLOCKER"] as const;
    const invalidStatus = (candidate: PendingControlStatus) => {
      expect(pendingControlStatus.safeParse(candidate).success).toBe(false);
      refused(() => assertPendingStatusProgress(candidate, candidate));
    };
    for (const delivery of ["PREPARED", "SENDING", "DELIVERY_UNKNOWN"] as const) {
      expect(pendingControlStatus.safeParse({ ...noReceipt, delivery, next_action: "QUERY_SAME_INTENT" }).success).toBe(true);
      for (const next_action of ["REVIEW_RECEIPT", "REVIEW_BLOCKER"] as const)
        invalidStatus({ ...noReceipt, delivery, next_action });
    }
    for (const next_action of actions) invalidStatus({ ...noReceipt, delivery: "ACKNOWLEDGED", next_action });
    const failed = { ...noReceipt, delivery: "FAILED_BEFORE_SEND" as const, next_action: "REVIEW_BLOCKER" as const };
    expect(pendingControlStatus.safeParse(failed).success).toBe(true);
    expect(() => assertPendingStatusProgress(failed, failed)).not.toThrow();
    for (const next_action of ["QUERY_SAME_INTENT", "REVIEW_RECEIPT"] as const)
      invalidStatus({ ...failed, next_action });
    const known = [before, ...(["APPLIED", "CANCELLED", "PARTIALLY_APPLIED_CANCELLED", "REJECTED"] as const)
      .map(state => { const original = old(state === "APPLIED" ? "APPLY_PENDING" : "CANCEL_REMAINING");
        return accepted(original, terminalSummary(original, state)).status; })];
    for (const candidate of known) {
      const expectedAction = candidate.business.state === "WAITING_ENCUMBRANCE" ? "QUERY_SAME_INTENT" : "REVIEW_RECEIPT";
      expect(pendingControlStatus.safeParse({ ...candidate, delivery: "ACKNOWLEDGED", next_action: expectedAction }).success).toBe(true);
      for (const next_action of actions) if (next_action !== expectedAction)
        invalidStatus({ ...candidate, next_action });
      for (const delivery of ["PREPARED", "SENDING", "DELIVERY_UNKNOWN", "FAILED_BEFORE_SEND"] as const)
        invalidStatus({ ...candidate, delivery });
    }
  });
});

describe("ELP2-07 bounded raw JSON and local proof grammar / TEST_ONLY", () => {
  it("rejects duplicate decoded keys even when the exact raw byte hash was recomputed", () => {
    const o = old(), json = JSON.stringify(waiting(o));
    for (const [from, to] of [
      ['"state":"WAITING_ENCUMBRANCE"', '"state":"WAITING_ENCUMBRANCE","state":"WAITING_ENCUMBRANCE"'],
      ['"state":"WAITING_ENCUMBRANCE"', '"state":"WAITING_ENCUMBRANCE","\\u0073tate":"WAITING_ENCUMBRANCE"'],
      ['"command_version":"6"', '"command_version":"6","command_vers\\u0069on":"6"'],
    ]) {
      const raw = json.replace(from, to); expect(raw).not.toBe(json);
      refused(() => mergePendingSource(o, rawFrame(o.authorization, "APPLY", raw, "RECALL_CONTROL_COMMIT_VERIFIED"), "APPLY"));
    }
  });
  it("rejects raw/escaped lone surrogates while preserving a genuine escaped Unicode pair", () => {
    const o = old(), body = waiting(o);
    for (const blocker of ["\ud800", "\udc00", "before\ud800after"])
      refused(() => mergePendingSource(o, frame(o.authorization, "APPLY", { ...body, blockers: [blocker] }, "RECALL_CONTROL_COMMIT_VERIFIED"), "APPLY"));
    const lone = JSON.stringify(body).replace("TEST_ONLY-encumbrance", "TEST_ONLY-\ud800");
    refused(() => mergePendingSource(o, rawFrame(o.authorization, "APPLY", lone, "RECALL_CONTROL_COMMIT_VERIFIED"), "APPLY"));
    const pair = JSON.stringify({ ...body, blockers: ["TEST_ONLY-🚀"] }).replace("🚀", "\\ud83d\\ude80");
    expect(mergePendingSource(o, rawFrame(o.authorization, "APPLY", pair, "RECALL_CONTROL_COMMIT_VERIFIED"), "APPLY").business.blockers)
      .toEqual(["TEST_ONLY-🚀"]);
  });
  it("rejects malformed roots, numeric source tokens, trailing material and excessive arrays/depth", () => {
    const o = old(), json = JSON.stringify(waiting(o));
    const invalid = ["", "[]", "null", "true", "0", `\ufeff${json}`, `${json}true`, json.slice(0, -1), json.replace(/}$/, ",}"),
      json.replace('"command_version":"6"', '"command_version":6'),
      JSON.stringify({ ...waiting(o), blockers: Array.from({ length: 129 }, () => "TEST_ONLY-blocker") }),
      '{"a":{"b":{"c":{"d":{"e":{"f":{"g":"deep"}}}}}}}'];
    for (const raw of invalid)
      refused(() => mergePendingSource(o, rawFrame(o.authorization, "APPLY", raw, "RECALL_CONTROL_COMMIT_VERIFIED"), "APPLY"));
    const full = frame(o.authorization, "APPLY", { ...waiting(o), blockers: Array.from({ length: 128 }, () => "TEST_ONLY-blocker") }, "RECALL_CONTROL_COMMIT_VERIFIED");
    expect(mergePendingSource(o, full, "APPLY").business.blockers).toHaveLength(128);
  });
  it("checks32KiB by UTF8 bytes, including whitespace, and accepts exactly bounded raw source", () => {
    const o = old(), json = JSON.stringify(waiting(o)), padding = PENDING_JSON_BYTES - Buffer.byteLength(json);
    const exact = `${json}${" ".repeat(padding)}`;
    expect(Buffer.byteLength(exact)).toBe(PENDING_JSON_BYTES);
    expect(mergePendingSource(o, rawFrame(o.authorization, "APPLY", exact, "RECALL_CONTROL_COMMIT_VERIFIED"), "APPLY").business.state)
      .toBe("WAITING_ENCUMBRANCE");
    refused(() => mergePendingSource(o, rawFrame(o.authorization, "APPLY", `${exact} `, "RECALL_CONTROL_COMMIT_VERIFIED"), "APPLY"));
    const multibyte = JSON.stringify({ ...waiting(o), blockers: ["λ".repeat(PENDING_JSON_BYTES / 2)] });
    expect(multibyte.length).toBeLessThan(PENDING_JSON_BYTES);
    expect(Buffer.byteLength(multibyte)).toBeGreaterThan(PENDING_JSON_BYTES);
    refused(() => mergePendingSource(o, rawFrame(o.authorization, "APPLY", multibyte, "RECALL_CONTROL_COMMIT_VERIFIED"), "APPLY"));
    const formatted = ` \r\n${JSON.stringify(waiting(o), null, 2)}\t`;
    expect(mergePendingSource(o, rawFrame(o.authorization, "APPLY", formatted, "RECALL_CONTROL_COMMIT_VERIFIED"), "APPLY").business.amounts).toEqual(amounts());
  });
  it("bounds local proof JSON without invoking getters/toJSON or dropping unsupported/sparse values", () => {
    const getter = vi.fn(() => "must-not-run"), toJSON = vi.fn(() => ({ forged: true }));
    const withGetter = Object.defineProperty({}, "hidden", { enumerable: true, get: getter });
    const arrayGetter = Object.defineProperty(["x"], "0", { enumerable: true, get: getter });
    const invalid: unknown[] = [undefined, 1n, NaN, Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, new Date(0),
      { value: undefined }, withGetter, arrayGetter, { toJSON }, Array(1), [undefined], { [Symbol("authority")]: true },
      Object.assign(Object.create({ inherited: true }), { value: "x" }), Object.defineProperty({}, "hidden", { value: "x" }),
      "\ud800", { "\udc00": "x" }, Object.assign(["x"], { extra: "x" })];
    const circular: Record<string, unknown> = {}; circular.self = circular; invalid.push(circular);
    for (const value of invalid) refused(() => boundedPendingJson(value), "PENDING_CONTROL_CONTEXT_INVALID");
    expect(getter).not.toHaveBeenCalled(); expect(toJSON).not.toHaveBeenCalled();
    expect(() => boundedPendingJson(Object.assign(Object.create(null), { value: "valid" }))).not.toThrow();
    expect(() => boundedPendingJson({ epoch_ms: NOW, zero: 0, flags: [true, false, null] })).not.toThrow();
  });
  it("exercises local exact byte/key/array/depth/node boundaries without a source parser oracle", () => {
    expect(() => boundedPendingJson("x".repeat(PENDING_JSON_BYTES - 2))).not.toThrow();
    refused(() => boundedPendingJson("x".repeat(PENDING_JSON_BYTES - 1)), "PENDING_CONTROL_CONTEXT_INVALID");
    refused(() => boundedPendingJson("λ".repeat(PENDING_JSON_BYTES / 2)), "PENDING_CONTROL_CONTEXT_INVALID");
    expect(() => boundedPendingJson(Object.fromEntries(Array.from({ length: 64 }, (_, i) => [`k${i}`, null])))).not.toThrow();
    refused(() => boundedPendingJson(Object.fromEntries(Array.from({ length: 65 }, (_, i) => [`k${i}`, null]))), "PENDING_CONTROL_CONTEXT_INVALID");
    expect(() => boundedPendingJson(Array(128).fill(null))).not.toThrow();
    refused(() => boundedPendingJson(Array(129).fill(null)), "PENDING_CONTROL_CONTEXT_INVALID");
    let deep: unknown = null; for (let i = 0; i < 8; i++) deep = [deep];
    expect(() => boundedPendingJson(deep)).not.toThrow();
    refused(() => boundedPendingJson([deep]), "PENDING_CONTROL_CONTEXT_INVALID");
    // Root+4arrays+384nulls+123nulls =512 visited values, exactly.
    const nodes = [Array(128).fill(null), Array(128).fill(null), Array(128).fill(null), Array(123).fill(null)];
    expect(() => boundedPendingJson(nodes)).not.toThrow();
    nodes[3].push(null); refused(() => boundedPendingJson(nodes), "PENDING_CONTROL_CONTEXT_INVALID");
  });
  it("keeps the unqualified default source-dark instead of promoting synthetic proof parsing", async () => {
    const o = old(), signal = new AbortController().signal;
    expect(await unqualifiedPendingControlTrust.prepare({ actor: ACTOR,
      intent: o.intent, intent_hash: o.authorization.intent_hash, signal })).toBeNull();
    expect(await unqualifiedPendingControlTrust.lookup({ authorization: o.authorization, intent: o.intent, signal })).toBeNull();
    await expect(unqualifiedPendingControlTrust.send({ authorization: o.authorization, intent: o.intent, signal }))
      .rejects.toThrow("PENDING_CONTROL_NOT_QUALIFIED");
    await expect(unqualifiedPendingControlTrust.send({ authorization: { ...o.authorization, qualification: "OWNER_VERIFIED" }, intent: o.intent, signal }))
      .rejects.toThrow("PENDING_CONTROL_NOT_QUALIFIED"); // Literal qualification is not an installed verifier.
  });
});
