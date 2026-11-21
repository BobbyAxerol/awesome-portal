/** NV2-TEST — SYNTHETIC TEST_ONLY; actual results belong to the owning packet.
 * Closed source-pinned codec compatibility, not source or stream authority.
 * No socket, signer, current grant, held handle, custody, physical frame or
 * installed PM authority. A valid intent is correlation, not stream authority.
 * PM 94822b53b68147430199a10db47a369521b9e4eb; exact hashes in companion notes.
 * Independent fixture refined from original08 draft SHA32284291953bda2f…;
 * this file imports production exports, never another spec or fixture factory.
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  NativeBusinessReadCodecError,
  captureNativeBusinessReadBase,
  captureNativeBusinessReadContext,
  nativeBusinessReadIdentityPreimage,
  nativeBusinessReadTransportRequest,
  parseNativeBusinessReadResult,
  prepareNativeBusinessReadRequest,
  type NativeBusinessReadAction,
  type PreparedNativeBusinessReadRequest,
} from "../src/execution-v2/native-business-read-codec";
import {
  nativeBusinessReadAuthenticatedResult,
  type NativeBusinessReadClient,
} from "../src/execution-v2/native-business-read-client";

const LIMITS = { request_bytes: 32768, response_bytes: 32768 };
const HUMAN = "TEST_ONLY-opaque-human-assertion-not-a-JWT";
const TERMINAL = "TEST_ONLY-opaque-terminal-not-a-JWT";
const ACTIONS = ["issue", "enter", "unknown", "status", "cancel-unentered", "resolve"] as const;
const MODES = ["paper", "sandbox", "live"] as const;
const FRAME_FIELDS = ["stream_id", "frame_ordinal", "dataset_id", "query_digest", "field_set_digest",
  "projection_generation", "source_cursor_digest", "frame_sha256", "stream_scope_digest"] as const;
const INTENT_KEYS = ["schema_version", "action", "digest", ...FRAME_FIELDS];
type Fixture = {
  schema_version: "pma.native-business-read.request.v1";
  binding: Record<string, unknown>;
  domain: Record<string, unknown>;
  manager_intent: Record<string, unknown>;
  deadline: string;
};
const sha = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const bytes = (value: unknown) => Buffer.from(JSON.stringify(value), "utf8");

// Independent fixture preimage, not a production digest helper. Valid objects
// contain fixed ASCII keys and string/boolean values; UTF8 is NOT normalized.
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" +
    canonical((value as Record<string, unknown>)[key])).join(",") + "}";
}
function reseal(value: Fixture): Fixture {
  const { request_digest: _requestDigest, ...unsignedBinding } = value.binding;
  const { digest: _digest, ...unsignedIntent } = value.manager_intent;
  const digest = sha(canonical({ binding: unsignedBinding, domain: value.domain,
    deadline: value.deadline, manager_intent: unsignedIntent }));
  value.binding.request_digest = value.manager_intent.digest = digest;
  return value;
}
function fixture(environment: typeof MODES[number] = "paper"): Fixture {
  return reseal({
    schema_version: "pma.native-business-read.request.v1",
    binding: { lease_id: "11111111-1111-1111-1111-111111111111",
      attempt_id: "22222222-2222-2222-2222-222222222222", human_issuer: "urn:TEST_ONLY:portal",
      subject: "TEST_ONLY-human-研究", workspace_id: "TEST_ONLY-workspace", environment,
      workload_id: "TEST_ONLY-native-read", request_digest: "0".repeat(64), operation: "READ" },
    domain: { profile_id: "TEST_ONLY-profile", catalogue_sha256: "a".repeat(64),
      profile_sha256: "b".repeat(64), field_policy_sha256: "c".repeat(64) },
    manager_intent: { schema_version: "pma.manager-read-intent.v2", action: "scoped_notice",
      stream_id: "00000000-0000-0000-0000-000000000101", frame_ordinal: "1",
      dataset_id: "TEST_ONLY-dataset", query_digest: "1".repeat(64), field_set_digest: "2".repeat(64),
      projection_generation: "TEST_ONLY-generation", source_cursor_digest: "3".repeat(64),
      frame_sha256: "4".repeat(64), stream_scope_digest: "5".repeat(64), digest: "0".repeat(64) },
    deadline: "2026-10-17T14:00:00.123456Z",
  });
}
function input(action: NativeBusinessReadAction, value: Fixture): unknown {
  return action === "issue" || action === "enter" ? { ...value, human_token: HUMAN } :
    action === "resolve" ? { ...value, signed_terminal: TERMINAL } : value;
}
function reply(action: NativeBusinessReadAction, value: Fixture): Record<string, unknown> {
  const common = { schema_version: "pma.native-business-read.result.v1", binding: { ...value.binding },
    component: "NATIVE_BUSINESS_READ_ONLY" };
  if (action === "issue") {
    const ts = "33333333-3333-3333-3333-333333333333";
    return { ...common, state: "ISSUED",
      human: { issuer: value.binding.human_issuer, subject: value.binding.subject,
        portal_user_id: "TEST_ONLY-stable-user", ts_user_id: ts, mapping_revision: `ts-user:${ts}:1` },
      domain: { ...value.domain, environment: value.binding.environment },
      permission: { scope_kind: "MANAGER_CATALOGUE_DOMAIN", action: "business.read_all", delegable: false },
      native: { revision: "9223372036854775807", receipt_id: "44444444-4444-4444-4444-444444444444",
        receipt_digest: "sha256:" + "1".repeat(64), document_digest: "sha256:" + "2".repeat(64),
        policy_revision: "1", owner_mapping_revision: `ts-user:${ts}:1`, semantic_revision: "sha256:" + "3".repeat(64),
        effective_from: "2000-01-01T00:00:00Z", expires_at: value.deadline },
      lease: { source_digest: "e".repeat(64), source_fingerprint: "f".repeat(64), expires_at: value.deadline } };
  }
  if (action === "enter") return { ...common, state: "ENTERED" };
  if (action === "unknown") return { ...common, state: "UNKNOWN" };
  if (action === "status") return { ...common, state: "OBSERVATION", may_authorize_read: false,
    recovery: { state: "ABSENT", terminal_authority: false, release_permitted: false } };
  if (action === "cancel-unentered") return { ...common, state: "CANCELLED", may_authorize_read: false,
    recovery: { state: "CANCELLED", cancellation_authority: true, release_permitted: true } };
  return { ...common, state: "SETTLED", may_authorize_read: false,
    recovery: { state: "SETTLED", phase: "SERVED", terminal_authority: true, release_permitted: true } };
}
const prepare = (action: NativeBusinessReadAction = "status", value = fixture()) =>
  prepareNativeBusinessReadRequest(action, input(action, value), LIMITS);
function refuses(run: () => unknown) {
  let caught: unknown;
  try { run(); } catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(NativeBusinessReadCodecError);
  expect(caught).toMatchObject({ code: "NATIVE_BUSINESS_READ_WIRE_INVALID",
    message: "The native business read message is not available." });
}
function refusesEveryCapture(value: Fixture): void {
  // Base capture is a separate recovery entry. Equal arbitrary self-digests
  // must not bypass v2 verification here or through context/identity helpers.
  refuses(() => prepare("status", value));
  refuses(() => prepareNativeBusinessReadRequest("status", bytes(value), LIMITS));
  refuses(() => captureNativeBusinessReadBase(value, LIMITS));
  refuses(() => captureNativeBusinessReadBase(bytes(value), LIMITS));
  const { schema_version: _schema, ...context } = value;
  refuses(() => captureNativeBusinessReadContext(context, LIMITS));
  refuses(() => nativeBusinessReadIdentityPreimage("issue", value, LIMITS));
  refuses(() => nativeBusinessReadIdentityPreimage("enter", value, LIMITS));
}
function changedFrameValue(key: typeof FRAME_FIELDS[number]): string {
  return key === "stream_id" ? "00000000-0000-0000-0000-000000000102" :
    key === "frame_ordinal" ? "2" : key.endsWith("digest") || key === "frame_sha256" ? "6".repeat(64) : "TEST_ONLY-other";
}

describe("NV2 scoped_notice codec — source-only TEST_ONLY correlation, NOT stream authority", () => {
  it.each(MODES.flatMap(mode => ACTIONS.map(action => [mode, action] as const)))(
    "preserves request/result v1 and exact correlation for %s/%s", (mode, action) => {
      const value = fixture(mode), prepared = prepare(action, value);
      expect(Object.keys(value.manager_intent).sort()).toEqual([...INTENT_KEYS].sort());
      expect(prepared.path).toBe(`/internal/elp210/business-root-read/${action}`);
      expect(prepared.body).toBe(canonical(input(action, value)));
      expect(prepared.base_body).toBe(canonical(value));
      expect(prepared.binding_digest).toBe(sha(canonical(value.binding)));
      expect(prepared.stable_core_digest).toBe(sha(canonical(value)));
      expect(nativeBusinessReadTransportRequest(prepared)).toMatchObject({ action,
        path: prepared.path, body: prepared.body, base_body: prepared.base_body,
        binding_digest: prepared.binding_digest, stable_core_digest: prepared.stable_core_digest });
      const result = parseNativeBusinessReadResult(prepared, bytes(reply(action, value)));
      expect(result).toEqual(reply(action, value));
      expect(Object.isFrozen(result)).toBe(true); expect(Object.isFrozen(result.binding)).toBe(true);
      const wrong = reply(action, value);
      (wrong.binding as Record<string, unknown>).request_digest = "7".repeat(64);
      refuses(() => parseNativeBusinessReadResult(prepared, bytes(wrong)));
      expect(result).not.toHaveProperty("held_handle"); expect(result).not.toHaveProperty("stream_authority");
    });

  it("matches the existing independent Python golden, not a shared production digest implementation", () => {
    // Golden independently computed in original08 with Python json.dumps:
    // sort_keys=True,separators=(',',':'),ensure_ascii=False,allow_nan=False.
    const value = fixture(), prepared = prepare("status", value);
    expect(value.manager_intent.digest).toBe("dd8e1a85630e1ae57944a339143a999427c4bc70b8677b33ed6cf7ac8c280939");
    expect(prepared.stable_core_digest).toBe("11cdf0b75173539b7f3cbe2bb18b3c29496cdff0dfcbb5367f42db4c6578d87a");
    expect(prepared.binding_digest).toBe("c3cef96f7c6834acb502dd7e3b76aafedf00ba853c172cfbce300a877491e7ce");
    expect(Buffer.byteLength(prepared.base_body, "utf8")).toBe(1533);
    const issued = prepare("issue", value);
    expect(issued.provider_delivery_digest).toBe("sha256:6774e388592f4e0b0aefecdb09fcd1f36b434fca0e316b6af9c3261ead27db84");
    expect(prepareNativeBusinessReadRequest("status", bytes(value), LIMITS)).toEqual(prepared);
    expect(captureNativeBusinessReadBase(bytes(value), LIMITS)).toEqual(value);
  });

  it.each(FRAME_FIELDS)("rejects un-rehashed mutation of new intent field %s through every capture", key => {
    const value = fixture(); value.manager_intent[key] = changedFrameValue(key);
    refusesEveryCapture(value);
  });
  it("rejects un-rehashed mutations of every binding/domain coordinate and exact deadline", () => {
    const mutations: ((value: Fixture) => void)[] = [
      ...Object.keys(fixture().binding).map(key => (value: Fixture) => {
        value.binding[key] = key === "lease_id" || key === "attempt_id" ? "99999999-9999-9999-9999-999999999999" :
          key === "environment" ? "sandbox" : key === "request_digest" ? "9".repeat(64) : key === "operation" ? "MUTATION" : "TEST_ONLY-other";
      }),
      ...Object.keys(fixture().domain).map(key => (value: Fixture) => { value.domain[key] = key === "profile_id" ? "TEST_ONLY-other" : "9".repeat(64); }),
      value => { value.deadline = value.deadline.replace("Z", "+00:00"); },
      value => { value.deadline = "2026-10-17T14:00:00.123457Z"; },
    ];
    for (const mutate of mutations) { const value = fixture(); mutate(value); refusesEveryCapture(value); }
    const arbitrary = fixture(); arbitrary.binding.request_digest = arbitrary.manager_intent.digest = "9".repeat(64);
    refusesEveryCapture(arbitrary);
  });
  it("accepts fully rehashed alternate Base only as a DIFFERENT correlation identity", () => {
    const original = fixture(), before = prepare("issue", original);
    const mutations: ((value: Fixture) => void)[] = [
      ...FRAME_FIELDS.map(key => (value: Fixture) => { value.manager_intent[key] = changedFrameValue(key); }),
      value => { value.binding.subject = "TEST_ONLY-other"; },
      value => { value.binding.lease_id = "99999999-9999-9999-9999-999999999999"; },
      value => { value.domain.profile_sha256 = "9".repeat(64); },
      value => { value.deadline = value.deadline.replace("Z", "+00:00"); },
    ];
    for (const mutate of mutations) {
      const alternate = fixture(); mutate(alternate); reseal(alternate);
      const after = prepare("issue", alternate);
      expect(after.binding_digest).not.toBe(before.binding_digest);
      expect(after.stable_core_digest).not.toBe(before.stable_core_digest);
      expect(after.provider_delivery_digest).not.toBe(before.provider_delivery_digest);
      expect(captureNativeBusinessReadBase(alternate, LIMITS)).toEqual(alternate);
      refuses(() => parseNativeBusinessReadResult(before, bytes(reply("issue", alternate))));
      refuses(() => parseNativeBusinessReadResult(after, bytes(reply("issue", original))));
    }
  });

  it("keeps frame ordinal a canonical positive decimal int64 string above JS safe integer", () => {
    for (const ordinal of ["1", "9007199254740993", "9223372036854775807"]) {
      const value = fixture(); value.manager_intent.frame_ordinal = ordinal; reseal(value);
      expect(captureNativeBusinessReadBase(value, LIMITS).manager_intent).toMatchObject({ frame_ordinal: ordinal });
      expect(JSON.parse(prepare("status", value).body).manager_intent.frame_ordinal).toBe(ordinal);
    }
    for (const ordinal of [0, 1, true, null, "0", "01", "+1", "-1", "1.0", "1e0", "1\n", " 1", "9223372036854775808", "99999999999999999999"]) {
      const value = fixture(); value.manager_intent.frame_ordinal = ordinal; reseal(value); refusesEveryCapture(value);
    }
  });
  it("retains canonical UUID stream identities but not uppercase/URN/compact/escaped aliases", () => {
    for (const valid of ["00000000-0000-0000-0000-000000000000", "ffffffff-ffff-ffff-ffff-ffffffffffff"]) {
      const value = fixture(); value.manager_intent.stream_id = valid; reseal(value);
      expect(captureNativeBusinessReadBase(value, LIMITS).manager_intent).toMatchObject({ stream_id: valid });
    }
    for (const invalid of ["AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA", "{00000000-0000-0000-0000-000000000101}",
      "00000000000000000000000000000101", "urn:uuid:00000000-0000-0000-0000-000000000101", "00000000-0000-0000-0000-000000000101\n", null]) {
      const value = fixture(); value.manager_intent.stream_id = invalid; reseal(value); refusesEveryCapture(value);
    }
  });
  it.each(["dataset_id", "projection_generation"] as const)("applies source UTF8-byte and whitespace rules to %s", key => {
    for (const valid of ["a".repeat(256), "é".repeat(128), "😀".repeat(64), "\ufeffTEST_ONLY", "inside\u0085okay"]) {
      const value = fixture(); value.manager_intent[key] = valid; reseal(value);
      expect(captureNativeBusinessReadBase(value, LIMITS).manager_intent).toHaveProperty(key, valid);
    }
    for (const invalid of ["", "a".repeat(257), "é".repeat(129), "😀".repeat(65), " leading", "trailing ",
      "\u0085edge", "edge\u0085", "inside\u0000bad", "inside\u007fbad", "\ud800", "\udfff", null, 1]) {
      const value = fixture(); value.manager_intent[key] = invalid; reseal(value); refusesEveryCapture(value);
    }
    const a = fixture(), b = fixture(); a.manager_intent[key] = "é-研究-😀-\"\\"; b.manager_intent[key] = "e\u0301-研究-😀-\"\\";
    reseal(a); reseal(b);
    expect(prepare("status", a).body).toContain("研究");
    expect(prepare("status", a).stable_core_digest).not.toBe(prepare("status", b).stable_core_digest);
  });
  it("requires all six intent digests to be raw lowercase exact64, including equal invalid self-digests", () => {
    for (const key of ["digest", "query_digest", "field_set_digest", "source_cursor_digest", "frame_sha256", "stream_scope_digest"]) {
      for (const invalid of ["sha256:" + "a".repeat(64), "A".repeat(64), "a".repeat(63), "a".repeat(65), "a".repeat(64) + "\n", null]) {
        const value = fixture(); value.manager_intent[key] = invalid;
        if (key === "digest") value.binding.request_digest = invalid; else reseal(value);
        refusesEveryCapture(value);
      }
    }
  });
  it("closes the v2 schema without widening finite v1 actions", () => {
    for (const key of INTENT_KEYS) { const value = fixture(); delete value.manager_intent[key]; refusesEveryCapture(value); }
    for (const key of ["source_cursor", "raw_cursor", "stream_authority", "portal_user_id", "extra"]) {
      const value = fixture(); value.manager_intent[key] = "TEST_ONLY-private"; reseal(value); refusesEveryCapture(value);
    }
    const finite = ["catalogue", "capabilities", "relation_page", "relation_record", "projection_page"];
    for (const action of finite) {
      const value = fixture(); value.binding.request_digest = "a".repeat(64);
      value.manager_intent = { schema_version: "pma.manager-read-intent.v1", action, digest: "a".repeat(64) };
      expect(captureNativeBusinessReadBase(value, LIMITS)).toEqual(value); // v1 digest remains opaque.
      expect(prepare("status", value).base_body).toBe(canonical(value));
      const invalidV2 = fixture(); invalidV2.manager_intent.action = action; reseal(invalidV2); refusesEveryCapture(invalidV2);
    }
    const invalidV1 = fixture(); invalidV1.manager_intent = { schema_version: "pma.manager-read-intent.v1",
      action: "scoped_notice", digest: invalidV1.binding.request_digest }; refusesEveryCapture(invalidV1);
    for (const top of ["extra", "stream_scope"]) { const value = { ...fixture(), [top]: "not-allowed" }; refusesEveryCapture(value); }
    for (const nested of ["binding", "domain"] as const) { const value = fixture(); value[nested].extra = "not-allowed"; reseal(value); refusesEveryCapture(value); }
  });
  it("rejects escaped duplicate v2 keys before schema on both byte entry points", () => {
    const original = JSON.stringify(fixture());
    for (const raw of [
      original.replace('"frame_ordinal":', '"frame_ordinal":"1","frame_ordinal":'),
      original.replace('"frame_sha256":', '"\\u0066rame_sha256":"' + "4".repeat(64) + '","frame_sha256":'),
      original.replace('"stream_scope_digest":', '"stream_scope_digest":"' + "5".repeat(64) + '","stream_scope_digest":'),
      original.replace('"digest":', '"\\u0064igest":"' + fixture().manager_intent.digest + '","digest":'),
    ]) {
      refuses(() => prepareNativeBusinessReadRequest("status", Buffer.from(raw), LIMITS));
      refuses(() => captureNativeBusinessReadBase(Buffer.from(raw), LIMITS));
    }
  });
  it("rejects v2 getters/proxies/toJSON without evaluating caller code", () => {
    let touched = 0;
    const getter = fixture(); Object.defineProperty(getter.manager_intent, "frame_sha256", { enumerable: true,
      get() { touched++; throw new Error(HUMAN); } });
    const proxy = fixture(); proxy.manager_intent = new Proxy(proxy.manager_intent, {
      ownKeys() { touched++; throw new Error(HUMAN); }, get() { touched++; throw new Error(HUMAN); } });
    const json = fixture(); json.manager_intent.toJSON = () => { touched++; throw new Error(HUMAN); };
    // Do not JSON.stringify hostile inputs in this test; the APIs must not call it either.
    for (const value of [getter, proxy, json]) {
      refuses(() => prepare("status", value)); refuses(() => captureNativeBusinessReadBase(value, LIMITS));
      const { schema_version: _schema, ...context } = value;
      refuses(() => captureNativeBusinessReadContext(context, LIMITS));
    }
    expect(touched).toBe(0);
  });
  it("captures immutable original Base/context before mutations and refuses forged carriers", () => {
    const source = fixture(), saved = structuredClone(source), prepared = prepare("status", source);
    const captured = captureNativeBusinessReadBase(source, LIMITS);
    const { schema_version: _schema, ...context } = source;
    const capturedContext = captureNativeBusinessReadContext(context, LIMITS);
    source.manager_intent.frame_sha256 = "9".repeat(64); source.binding.subject = "TEST_ONLY-later";
    source.domain.profile_sha256 = "8".repeat(64); source.deadline = "2099-01-01T00:00:00Z";
    expect(captured).toEqual(saved); expect(capturedContext.manager_intent).toEqual(saved.manager_intent);
    expect(Object.isFrozen(captured.manager_intent)).toBe(true); expect(Object.isFrozen(capturedContext.binding)).toBe(true);
    expect(prepared.base_body).toBe(canonical(saved));
    expect(parseNativeBusinessReadResult(prepared, bytes(reply("status", saved)))).toEqual(reply("status", saved));
    const cloned = { ...prepared } as PreparedNativeBusinessReadRequest;
    refuses(() => nativeBusinessReadTransportRequest(cloned));
    refuses(() => parseNativeBusinessReadResult(cloned, bytes(reply("status", saved))));
    const raw = bytes(saved), byteCapture = captureNativeBusinessReadBase(raw, LIMITS); raw.fill(0); expect(byteCapture).toEqual(saved);
  });
  it("preserves expired exact Base on recovery; spelling and microseconds are never extended/normalized", () => {
    const expired = fixture(); expired.deadline = "2000-02-29T00:00:00.000001+00:00"; reseal(expired);
    const exact = canonical(expired), stable = sha(exact);
    for (const action of ACTIONS) {
      const prepared = prepare(action, expired); expect(prepared.base_body).toBe(exact); expect(prepared.stable_core_digest).toBe(stable);
      expect(parseNativeBusinessReadResult(prepared, bytes(reply(action, expired)))).toEqual(reply(action, expired));
    }
    const captured = captureNativeBusinessReadBase(bytes(expired), LIMITS);
    expect(captured.deadline).toBe(expired.deadline);
    for (const action of ["issue", "enter"] as const) {
      const identity = nativeBusinessReadIdentityPreimage(action, captured, LIMITS);
      expect(identity.base_body).toBe(exact); expect(identity.stable_core_digest).toBe(stable);
      expect(identity.provider_delivery_digest).toBe(prepare(action, expired).provider_delivery_digest);
    }
    const alias = structuredClone(expired); alias.deadline = alias.deadline.replace("+00:00", "Z"); refusesEveryCapture(alias);
    reseal(alias); expect(prepare("status", alias).stable_core_digest).not.toBe(stable);
    // No fake clock: codec has no current-authority decision. ISSUE/ENTER
    // syntax acceptance here does not authorize acquisition of an expired lease.
  });
  it("retains exact request/response byte caps and action-specific token exclusion for v2", () => {
    const value = fixture(), issued = prepare("issue", value), response = bytes(reply("issue", value));
    const size = Buffer.byteLength(issued.body, "utf8"), baseSize = Buffer.byteLength(issued.base_body, "utf8");
    const exact = prepareNativeBusinessReadRequest("issue", input("issue", value), { request_bytes: size, response_bytes: response.length });
    expect(parseNativeBusinessReadResult(exact, response)).toEqual(reply("issue", value));
    refuses(() => prepareNativeBusinessReadRequest("issue", input("issue", value), { request_bytes: size - 1, response_bytes: response.length }));
    refuses(() => parseNativeBusinessReadResult(prepareNativeBusinessReadRequest("issue", input("issue", value),
      { request_bytes: size, response_bytes: response.length - 1 }), response));
    expect(captureNativeBusinessReadBase(value, { request_bytes: baseSize, response_bytes: 32768 })).toEqual(value);
    refuses(() => captureNativeBusinessReadBase(value, { request_bytes: baseSize - 1, response_bytes: 32768 }));
    const changedToken = prepareNativeBusinessReadRequest("issue", { ...value, human_token: HUMAN + "-other" }, LIMITS);
    expect(changedToken.body).not.toBe(issued.body); expect(changedToken.provider_delivery_digest).toBe(issued.provider_delivery_digest);
    expect(prepare("enter", value).provider_delivery_digest).not.toBe(issued.provider_delivery_digest);
    const resolved = prepare("resolve", value); expect(resolved.unsigned_body).toBe(resolved.body);
    expect(resolved.unsigned_body).toContain(TERMINAL); expect(resolved.base_body).not.toContain(TERMINAL);
    expect(resolved.stable_core_digest).toBe(issued.stable_core_digest);
  });
  it("never mints an authenticated client/physical-frame witness from parsed v2 data", () => {
    const value = fixture(), prepared = prepare("status", value);
    const parsed = parseNativeBusinessReadResult(prepared, bytes(reply("status", value)));
    expect(() => nativeBusinessReadAuthenticatedResult({} as NativeBusinessReadClient, parsed))
      .toThrow(expect.objectContaining({ code: "NATIVE_BUSINESS_READ_RESULT_UNVERIFIED" }));
    expect(parsed).toMatchObject({ state: "OBSERVATION", may_authorize_read: false,
      recovery: { terminal_authority: false, release_permitted: false } });
    for (const key of ["held_handle", "stream_authority", "egress_permit", "physical_frame_witness"]) expect(parsed).not.toHaveProperty(key);
  });
});
