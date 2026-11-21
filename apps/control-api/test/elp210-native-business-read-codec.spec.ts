/** Private native READ protocol regressions. SYNTHETIC TEST_ONLY.
 * Closed byte codec/correlation only, no TLS/JWT signing, current
 * human/grant, native held handle, lease persistence, installation or authority.
 * Wire repin14:45:15UTC PM f02ebd78a61af4f61e38daa8488048f411ba2797:
 * provider2e58d908…/fence75bf3db9… unchanged from captured exact wire.
 * Configured source-domain/human acceptance and current expiry remain caller
 * obligations; this unit suite must not assert those from parsed statuses. */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { NativeBusinessReadCodecError, nativeBusinessReadUtcMicroseconds,
  prepareNativeBusinessReadRequest, parseNativeBusinessReadResult,
  type NativeBusinessReadAction, type NativeBusinessReadCodecBounds,
  type PreparedNativeBusinessReadRequest } from "../src/execution-v2/native-business-read-codec";
import { pmHttpRequestDigest } from "../src/execution-v2/pm-http-request-binding";

const LIMITS: NativeBusinessReadCodecBounds = { request_bytes: 32768, response_bytes: 32768 };
const HASH = "a".repeat(64), TS = "33333333-3333-3333-3333-333333333333";
const HUMAN = "TEST_ONLY-opaque-human-assertion-not-a-valid-JWT";
const TERMINAL = "TEST_ONLY-opaque-terminal-not-a-valid-JWT";
const DEADLINE = "2026-10-17T14:00:00.123456+00:00";
const binding = () => ({ lease_id: "11111111-1111-1111-1111-111111111111",
  attempt_id: "22222222-2222-2222-2222-222222222222", human_issuer: "urn:TEST_ONLY:portal",
  subject: "TEST_ONLY-human-研究", workspace_id: "TEST_ONLY-workspace", environment: "paper" as const,
  workload_id: "TEST_ONLY-native-read", request_digest: HASH, operation: "READ" as const });
const base = () => ({ schema_version: "pma.native-business-read.request.v1" as const, binding: binding(),
  domain: { profile_id: "PAPER_TEST_ONLY", catalogue_sha256: "b".repeat(64),
    profile_sha256: "c".repeat(64), field_policy_sha256: "d".repeat(64) },
  manager_intent: { schema_version: "pma.manager-read-intent.v1" as const, action: "relation_page" as const, digest: HASH },
  deadline: DEADLINE });
const request = (action: NativeBusinessReadAction) => action === "issue" || action === "enter"
  ? { ...base(), human_token: HUMAN } : action === "resolve" ? { ...base(), signed_terminal: TERMINAL } : base();
const common = (state: string) => ({ schema_version: "pma.native-business-read.result.v1", state,
  binding: binding(), component: "NATIVE_BUSINESS_READ_ONLY" });
const issued = () => ({ ...common("ISSUED"),
  human: { issuer: binding().human_issuer, subject: binding().subject, portal_user_id: "TEST_ONLY-not-a-UUID",
    ts_user_id: TS, mapping_revision: `ts-user:${TS}:123456789012345678901234567890` },
  domain: { ...base().domain, environment: "paper" },
  permission: { scope_kind: "MANAGER_CATALOGUE_DOMAIN", action: "business.read_all", delegable: false },
  native: { revision: "9223372036854775807", receipt_id: "44444444-4444-4444-4444-444444444444",
    receipt_digest: "sha256:" + "1".repeat(64), document_digest: "sha256:" + "2".repeat(64),
    policy_revision: "9223372036854775807", owner_mapping_revision: "ts-user:55555555-5555-5555-5555-555555555555:7",
    semantic_revision: "sha256:" + "3".repeat(64), effective_from: "2026-10-17T13:59:00Z", expires_at: DEADLINE },
  lease: { source_digest: "e".repeat(64), source_fingerprint: "f".repeat(64), expires_at: DEADLINE } });
const observation = (recovery: object) => ({ ...common("OBSERVATION"), may_authorize_read: false, recovery });
const cancel = (state: "CANCELLED" | "RETIRED") => ({ ...common(state), may_authorize_read: false,
  recovery: { state, cancellation_authority: true, release_permitted: true } });
const settled = (phase: "SERVED" | "ABORTED") => ({ ...common("SETTLED"), may_authorize_read: false,
  recovery: { state: "SETTLED", phase, terminal_authority: true, release_permitted: true } });
const bytes = (value: unknown) => Buffer.from(JSON.stringify(value), "utf8");
const sha = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
// Independent exact source algorithm for these known closed fixture objects.
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" +
    canonical((value as Record<string, unknown>)[key])).join(",") + "}";
}
const prepare = (action: NativeBusinessReadAction = "issue", value: unknown = request(action), limits = LIMITS) =>
  prepareNativeBusinessReadRequest(action, value, limits);
const parse = (context: PreparedNativeBusinessReadRequest, value: unknown) => parseNativeBusinessReadResult(context, bytes(value));
function refuses(run: () => unknown) {
  let caught: unknown; try { run(); } catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(NativeBusinessReadCodecError);
  expect(caught).toMatchObject({ code: "NATIVE_BUSINESS_READ_WIRE_INVALID", message: "The native business read message is not available." });
}

describe("ELP2-10 native business READ codec — SYNTHETIC / no source authority", () => {
  it.each([
    ["issue", issued()], ["enter", common("ENTERED")], ["unknown", common("UNKNOWN")],
    ["status", observation({ state: "ABSENT", terminal_authority: false, release_permitted: false })],
    ["cancel-unentered", cancel("CANCELLED")], ["resolve", settled("SERVED")],
  ] as const)("prepares/correlates exact %s action without installing a capability", (action, reply) => {
    const context = prepare(action); expect(context.path).toBe(`/internal/elp210/business-root-read/${action}`);
    const value = parse(context, reply); expect(value).toEqual(reply); expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(value.binding)).toBe(true);
    expect(Object.keys(context).sort()).toEqual(["action", "base_body", "binding_digest", "body", "path",
      "provider_delivery_digest", "stable_core_digest", "unsigned_body"].sort());
    expect(value).not.toHaveProperty("held_handle"); expect(value).not.toHaveProperty("authorized_scope");
  });
  it("preserves every observational recovery phase without treating terminal-looking status as release", () => {
    const context = prepare("status");
    const recoveries = [{ state: "ABSENT", terminal_authority: false, release_permitted: false },
      { state: "RECORDED", phase: "CANCELLED", terminal_authority: false, release_permitted: false },
      ...["ISSUED", "ENTERED", "UNKNOWN", "RETIRED", "COMMITTED", "ROLLED_BACK", "SERVED", "ABORTED"].map(phase => ({
        state: "RECORDED", phase, source_digest: "e".repeat(64), expires_at: "2000-01-01T00:00:00Z",
        terminal_authority: false, release_permitted: false }))];
    for (const recovery of recoveries) {
      const reply = parse(context, observation(recovery));
      expect(reply).toMatchObject({ state: "OBSERVATION", may_authorize_read: false,
        recovery: { terminal_authority: false, release_permitted: false } });
    }
    expect(parse(prepare("cancel-unentered"), cancel("RETIRED"))).toEqual(cancel("RETIRED"));
    expect(parse(prepare("resolve"), settled("ABORTED"))).toEqual(settled("ABORTED"));
  });
  it("uses canonical UTF8 and the exact independently sorted provider descriptor, not raw Manager or body digests", () => {
    const input = { ...request("issue"), human_token: "TEST_ONLY-assertion-α-研究-😀" }, context = prepare("issue", input);
    const expectedBase = canonical(base()), expectedBinding = canonical(binding());
    expect(context.body).toBe(canonical(input)); expect(context.unsigned_body).toBe(expectedBase);
    expect(context.base_body).toBe(expectedBase); expect(context.body).toContain("研究"); expect(context.body).not.toContain("\\u7814");
    const descriptor = '{"body_sha256":"' + sha(context.unsigned_body) + '","method":"POST","path_sha256":"'
      + sha(context.path) + '","query_sha256":"' + sha("") + '","schema":"pma.http-request-binding.v1"}';
    expect(context.provider_delivery_digest).toBe("sha256:" + sha(descriptor));
    expect(context.provider_delivery_digest).toBe(pmHttpRequestDigest({ method: "POST", raw_path: Buffer.from(context.path),
      query_string: new Uint8Array(), body: Buffer.from(context.unsigned_body) }, { request_bytes: LIMITS.request_bytes }));
    expect(context.binding_digest).toBe(sha(expectedBinding)); expect(context.stable_core_digest).toBe(sha(expectedBase));
    expect(context.provider_delivery_digest).not.toBe("sha256:" + HASH);
    expect(context.provider_delivery_digest).not.toBe("sha256:" + sha(context.unsigned_body));
    expect(prepare("issue", bytes(input))).toEqual(context);
  });
  it("excludes ONLY human_token, retains resolve terminal, and binds exact route/deadline/intent/domain", () => {
    const a = prepare("issue"), b = prepare("issue", { ...request("issue"), human_token: "TEST_ONLY-different-token" });
    expect(a.body).not.toBe(b.body); expect(a.provider_delivery_digest).toBe(b.provider_delivery_digest);
    const resolved = prepare("resolve"); expect(resolved.unsigned_body).toBe(resolved.body); expect(resolved.unsigned_body).toContain(TERMINAL);
    expect(resolved.base_body).not.toContain(TERMINAL); expect(resolved.stable_core_digest).toBe(a.stable_core_digest);
    expect(prepare("enter").provider_delivery_digest).not.toBe(a.provider_delivery_digest);
    expect(prepare("status").stable_core_digest).toBe(a.stable_core_digest);
    for (const mutate of [(v: ReturnType<typeof base>) => { v.deadline = "2026-10-17T14:00:00.123457Z"; },
      (v: ReturnType<typeof base>) => { v.domain.profile_sha256 = "9".repeat(64); },
      (v: ReturnType<typeof base>) => { v.binding.request_digest = v.manager_intent.digest = "8".repeat(64); }]) {
      const value = base(); mutate(value); const changed = prepare("issue", { ...value, human_token: HUMAN });
      expect(changed.stable_core_digest).not.toBe(a.stable_core_digest); expect(changed.provider_delivery_digest).not.toBe(a.provider_delivery_digest);
    }
    // Equivalent UTC spelling is not the exact original immutable Base.
    const utcAlias = prepare("issue", { ...request("issue"), deadline: DEADLINE.replace("+00:00", "Z") });
    expect(utcAlias.stable_core_digest).not.toBe(a.stable_core_digest);
  });
  it("captures immutable correlation before caller mutation and refuses cloned/forged carriers", () => {
    const input = request("issue"), context = prepare("issue", input), before = context.body;
    input.binding.subject = "TEST_ONLY-after-prepare"; input.domain.profile_id = "PAPER_OTHER";
    input.deadline = "2099-01-01T00:00:00Z"; expect(context.body).toBe(before);
    expect(Object.isFrozen(context)).toBe(true); expect(parse(context, issued())).toEqual(issued());
    const changed = issued(); changed.binding.subject = input.binding.subject; refuses(() => parse(context, changed));
    refuses(() => parse({ ...context }, issued())); refuses(() => parse(JSON.parse(JSON.stringify(context)), issued()));
    const responseBytes = bytes(issued()), decoded = parseNativeBusinessReadResult(context, responseBytes); responseBytes.fill(0);
    expect(decoded).toEqual(issued()); expect(Object.isFrozen((decoded as ReturnType<typeof issued>).native)).toBe(true);
  });
  it.each(["lease_id", "attempt_id", "human_issuer", "subject", "workspace_id", "environment", "workload_id", "request_digest", "operation"] as const)(
    "refuses response Binding mismatch: %s", key => {
      const reply = issued(), value: Record<string, unknown> = reply.binding;
      value[key] = key === "lease_id" || key === "attempt_id" ? "99999999-9999-9999-9999-999999999999" :
        key === "environment" ? "sandbox" : key === "request_digest" ? "9".repeat(64) : "TEST_ONLY-other";
      refuses(() => parse(prepare(), reply));
    });
  it("refuses each issued domain/human/mapping mismatch, not just the outer binding", () => {
    for (const key of ["profile_id", "catalogue_sha256", "profile_sha256", "field_policy_sha256", "environment"] as const) {
      const reply = issued(); reply.domain[key] = key === "environment" ? "sandbox" : key === "profile_id" ? "PAPER_OTHER" : "9".repeat(64);
      refuses(() => parse(prepare(), reply));
    }
    for (const key of ["issuer", "subject", "mapping_revision"] as const) {
      const reply = issued(); reply.human[key] = key === "mapping_revision" ? "ts-user:99999999-9999-9999-9999-999999999999:1" : "TEST_ONLY-other";
      refuses(() => parse(prepare(), reply));
    }
    for (const revision of [`ts-user:${TS}:0`, `ts-user:${TS}:01`, `ts-user:${TS}:1\n`, `ts-user:${TS}:1:extra`]) {
      const reply = issued(); reply.human.mapping_revision = revision; refuses(() => parse(prepare(), reply));
    }
  });
  it("refuses wrong action/state, invented authority flags and inconsistent recovery unions", () => {
    const replies = [issued(), common("ENTERED"), common("UNKNOWN"), observation({ state: "ABSENT", terminal_authority: false,
      release_permitted: false }), cancel("CANCELLED"), settled("SERVED")];
    const actions: NativeBusinessReadAction[] = ["issue", "enter", "unknown", "status", "cancel-unentered", "resolve"];
    for (let index = 0; index < actions.length; index++) refuses(() => parse(prepare(actions[index]), replies[(index + 1) % replies.length]));
    refuses(() => parse(prepare("enter"), { ...common("ENTERED"), may_authorize_read: false }));
    refuses(() => parse(prepare("unknown"), { ...common("UNKNOWN"), recovery: { release_permitted: false } }));
    refuses(() => parse(prepare("status"), { ...observation({ state: "ABSENT", terminal_authority: false,
      release_permitted: false }), may_authorize_read: true }));
    refuses(() => parse(prepare("status"), observation({ state: "ABSENT", terminal_authority: true, release_permitted: true })));
    refuses(() => parse(prepare("status"), observation({ state: "RECORDED", phase: "CANCELLED", source_digest: HASH,
      expires_at: DEADLINE, terminal_authority: false, release_permitted: false })));
    refuses(() => parse(prepare("cancel-unentered"), { ...cancel("CANCELLED"), recovery: cancel("RETIRED").recovery }));
    refuses(() => parse(prepare("resolve"), { ...settled("SERVED"), recovery: { ...settled("SERVED").recovery, phase: "COMMITTED" } }));
    const delegated = issued(); delegated.permission.delegable = true; refuses(() => parse(prepare(), delegated));
  });
  it("keeps raw and prefixed hashes distinct at every digest purpose", () => {
    for (const location of ["intent", "catalogue", "profile", "field-policy"] as const) {
      const value = request("issue");
      if (location === "intent") value.binding.request_digest = value.manager_intent.digest = "sha256:" + HASH;
      else value.domain[location === "catalogue" ? "catalogue_sha256" : location === "profile" ? "profile_sha256" : "field_policy_sha256"] = "sha256:" + HASH;
      refuses(() => prepare("issue", value));
    }
    for (const key of ["receipt_digest", "document_digest", "semantic_revision"] as const) {
      const reply = issued(); reply.native[key] = HASH; refuses(() => parse(prepare(), reply));
    }
    for (const key of ["source_digest", "source_fingerprint"] as const) {
      const reply = issued(); reply.lease[key] = "sha256:" + HASH; refuses(() => parse(prepare(), reply));
    }
    const mismatched = request("issue"); mismatched.manager_intent.digest = "8".repeat(64); refuses(() => prepare("issue", mismatched));
  });
  it("preserves exact signed-int64 native revisions and leaves source mapping counter independently bounded", () => {
    const value = parse(prepare(), issued()); expect(value).toMatchObject({ native: { revision: "9223372036854775807" },
      human: { mapping_revision: `ts-user:${TS}:123456789012345678901234567890` } });
    for (const revision of ["0", "01", "-1", "+1", "1e3", "1\n", "9223372036854775808", "99999999999999999999", 1, 9007199254740992]) {
      for (const key of ["revision", "policy_revision"] as const) {
        const reply = issued(); (reply.native as Record<string, unknown>)[key] = revision; refuses(() => parse(prepare(), reply));
      }
    }
  });
  it("accepts canonical nil/version-any UUID but never uppercase/alias/compact forms", () => {
    const value = request("issue"); value.binding.lease_id = "00000000-0000-0000-0000-000000000000";
    const reply = issued(); reply.binding.lease_id = value.binding.lease_id; expect(parse(prepare("issue", value), reply)).toEqual(reply);
    for (const uuid of ["AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA", "{11111111-1111-1111-1111-111111111111}",
      "11111111111111111111111111111111", "urn:uuid:11111111-1111-1111-1111-111111111111", "11111111-1111-1111-1111-111111111111\n"]) {
      refuses(() => prepare("issue", { ...request("issue"), binding: { ...binding(), lease_id: uuid } }));
    }
  });
  it.each([
    ["1970-01-01T00:00:00.000001Z", 1n], ["1969-12-31T23:59:59.999999+00:00", -1n],
    ["0001-01-01T00:00:00Z", -62135596800000000n], ["9999-12-31T23:59:59.999999Z", 253402300799999999n],
  ] as const)("retains exact UTC microseconds: %s", (value, expected) => expect(nativeBusinessReadUtcMicroseconds(value)).toBe(expected));
  it("rejects invalid UTC without rollover/offset/fraction/newline normalization and allows expired recovery syntax", () => {
    for (const value of ["0000-01-01T00:00:00Z", "2023-02-29T00:00:00Z", "1900-02-29T00:00:00Z", "2026-04-31T00:00:00Z",
      "2026-01-01T24:00:00Z", "2026-01-01T00:60:00Z", "2026-01-01T00:00:60Z", "2026-01-01T00:00:00.1234567Z",
      "2026-01-01T00:00:00.Z", "2026-01-01T00:00:00+01:00", "2026-01-01T00:00:00z", "2026-01-01T00:00:00Z\n"]) {
      refuses(() => nativeBusinessReadUtcMicroseconds(value)); refuses(() => prepare("status", { ...base(), deadline: value }));
    }
    const expired = { ...base(), deadline: "2000-02-29T00:00:00.1+00:00" };
    expect(JSON.parse(prepare("status", expired).base_body).deadline).toBe(expired.deadline);
    // This API validates syntax only; it does not claim issue is presently authorized.
    expect(prepare("issue", { ...expired, human_token: HUMAN }).action).toBe("issue");
  });
  it("accepts exact Unicode byte bounds without normalization and preserves Python whitespace semantics", () => {
    const value = request("issue"); value.binding.subject = "α".repeat(256); value.binding.workspace_id = "α".repeat(128);
    value.binding.workload_id = "😀".repeat(128); value.domain.profile_id = "α".repeat(64);
    expect(prepare("issue", value).body).toContain("😀");
    for (const change of [(v: ReturnType<typeof request>) => { v.binding.subject += "α"; },
      (v: ReturnType<typeof request>) => { v.binding.workspace_id += "α"; },
      (v: ReturnType<typeof request>) => { v.binding.workload_id += "a"; },
      (v: ReturnType<typeof request>) => { v.domain.profile_id += "α"; }]) {
      const copied = structuredClone(value); change(copied); refuses(() => prepare("issue", copied));
    }
    for (const subject of [" leading", "trailing ", "\u0085edge", "edge\u0085", "\u00a0edge", "inside\u0001control", "inside\u007fcontrol"])
      refuses(() => prepare("issue", { ...request("issue"), binding: { ...binding(), subject } }));
    const bom = { ...request("issue"), binding: { ...binding(), subject: "\ufeffTEST_ONLY" } };
    expect(JSON.parse(prepare("issue", bom).body).binding.subject).toBe(bom.binding.subject);
  });
  it("rejects malformed UTF8/BOM/escaped lone surrogates while accepting valid sliced UTF8 buffers", () => {
    const context = prepare(), valid = bytes(issued()), requestBytes = bytes(request("issue"));
    for (const malformed of [Buffer.from([0xff]), Buffer.from([0xc0, 0xaf]), Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), valid])])
      refuses(() => parseNativeBusinessReadResult(context, malformed));
    refuses(() => prepare("issue", Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), requestBytes])));
    for (const unit of ["\\ud800", "\\udfff"]) {
      refuses(() => prepare("issue", Buffer.from(JSON.stringify(request("issue")).replace("TEST_ONLY-human-研究", unit))));
      refuses(() => parseNativeBusinessReadResult(context, Buffer.from(JSON.stringify(issued()).replace("TEST_ONLY-human-研究", unit))));
    }
    refuses(() => prepare("issue", { ...request("issue"), human_token: "\ud800" }));
    const wrappedRequest = Buffer.concat([Buffer.from("!"), requestBytes, Buffer.from("!")]);
    expect(prepare("issue", wrappedRequest.subarray(1, -1))).toEqual(context);
    const wrappedResult = Buffer.concat([Buffer.from("!"), valid, Buffer.from("!")]);
    expect(parseNativeBusinessReadResult(context, new Uint8Array(wrappedResult.buffer, wrappedResult.byteOffset + 1, valid.length))).toEqual(issued());
  });
  it("refuses duplicate decoded keys at top level and every nested scope, including escaped aliases", () => {
    const req = JSON.stringify(request("issue")), res = JSON.stringify(issued()), context = prepare();
    for (const text of [req.replace('"deadline":', '"deadline":"2000-01-01T00:00:00Z","deadline":'),
      req.replace('"subject":', '"subject":"earlier","subject":'),
      req.replace('"subject":', String.raw`"\u0073ubject":"earlier","subject":`),
      req.replace('"profile_id":', '"profile_id":"PAPER_OTHER","profile_id":')]) refuses(() => prepare("issue", Buffer.from(text)));
    for (const text of [res.replace('"state":', '"state":"ISSUED","state":'),
      res.replace('"subject":', String.raw`"\u0073ubject":"earlier","subject":`),
      res.replace('"revision":', '"revision":"1","revision":')]) refuses(() => parseNativeBusinessReadResult(context, Buffer.from(text)));
  });
  it("refuses extra/missing fields, null/arrays/numbers and excessive object grammar instead of coercing", () => {
    for (const action of ["issue", "enter", "unknown", "status", "cancel-unentered", "resolve"] as const) {
      refuses(() => prepare(action, { ...request(action), extra: "not-allowed" }));
      refuses(() => prepare(action, { ...request(action), binding: { ...binding(), extra: "not-allowed" } }));
    }
    for (const value of [null, [], 1, true, "{}", { ...base(), human_token: null }, { ...base(), human_token: [] },
      { ...base(), human_token: 1 }, { ...base(), human_token: HUMAN, extra: { a: { b: { c: { d: { e: "deep" } } } } } }])
      refuses(() => prepare("issue", value));
    for (const raw of ["null", "[]", "1", "NaN", "{} trailing", '{"a":true,}', '{"a":false', "true false"])
      refuses(() => parseNativeBusinessReadResult(prepare(), Buffer.from(raw)));
    refuses(() => prepare("issue", { ...base(), signed_terminal: TERMINAL }));
    refuses(() => prepare("resolve", { ...base(), human_token: HUMAN }));
    refuses(() => prepare("status", request("issue")));
    refuses(() => parse(prepare(), { ...issued(), unknown: true }));
  });
  it("rejects getter/proxy/symbol/prototype/nonenumerable/toJSON inputs without invoking caller code", () => {
    let touched = 0;
    const getter = { ...request("issue") }; Object.defineProperty(getter, "human_token", { enumerable: true, get() { touched++; throw new Error(HUMAN); } });
    const nested = { ...request("issue"), binding: Object.create({ subject: "inherited" }) };
    const nestedGetter = request("issue"); Object.defineProperty(nestedGetter.domain, "profile_id", {
      enumerable: true, get() { touched++; throw new Error(HUMAN); } });
    const nonenumerable = { ...request("issue") }; Object.defineProperty(nonenumerable, "human_token", { enumerable: false, value: HUMAN });
    const symbol = { ...request("issue"), [Symbol("TEST_ONLY")]: "hidden" };
    const prototype = Object.assign(Object.create({ toJSON() { touched++; return request("issue"); } }), request("issue"));
    const json = { ...request("issue"), toJSON() { touched++; return request("issue"); } };
    const proxy = new Proxy(request("issue"), { ownKeys() { touched++; throw new Error(HUMAN); }, get() { touched++; throw new Error(HUMAN); } });
    for (const input of [getter, nested, nestedGetter, nonenumerable, symbol, prototype, json, proxy]) refuses(() => prepare("issue", input));
    expect(touched).toBe(0);
    const forged = new Proxy({} as PreparedNativeBusinessReadRequest, { get() { touched++; throw new Error(TERMINAL); } });
    refuses(() => parse(forged, issued())); expect(touched).toBe(0);
  });
  it("requires explicit exact safe caps, enforces both byte ceilings and limits opaque assertions", () => {
    for (const limits of [undefined, null, {}, { request_bytes: 0, response_bytes: 32768 }, { request_bytes: 32769, response_bytes: 32768 },
      { request_bytes: 32768, response_bytes: 0 }, { request_bytes: 1.5, response_bytes: 32768 },
      { request_bytes: 32768, response_bytes: 32769 },
      { request_bytes: Infinity, response_bytes: 32768 }, { request_bytes: NaN, response_bytes: 32768 },
      { request_bytes: 32768, response_bytes: 32768, extra: true }])
      refuses(() => prepareNativeBusinessReadRequest("issue", request("issue"), limits as NativeBusinessReadCodecBounds));
    const context = prepare(), requestSize = Buffer.byteLength(context.body), responseSize = bytes(issued()).length;
    const exact = prepare("issue", request("issue"), { request_bytes: requestSize, response_bytes: responseSize });
    expect(exact.body).toBe(context.body); expect(parse(exact, issued())).toEqual(issued());
    refuses(() => prepare("issue", request("issue"), { request_bytes: requestSize - 1, response_bytes: responseSize }));
    refuses(() => parse(prepare("issue", request("issue"), { request_bytes: requestSize, response_bytes: responseSize - 1 }), issued()));
    expect(prepare("issue", { ...request("issue"), human_token: "é".repeat(4096) }).body).toContain("é");
    refuses(() => prepare("issue", { ...request("issue"), human_token: "é".repeat(4097) }));
    refuses(() => prepare("resolve", { ...base(), signed_terminal: "x".repeat(8193) }));
    refuses(() => parseNativeBusinessReadResult(context, new DataView(new ArrayBuffer(8)) as unknown as Uint8Array));
    for (const action of ["ISSUE", "issue/", "release", "issue?x=1"]) refuses(() => prepare(action as NativeBusinessReadAction));
  });
  it("captures private response bounds and byte-backed requests without retaining caller-mutable references", () => {
    const limits = { ...LIMITS }, source = bytes(request("issue")), context = prepare("issue", source, limits), before = context.body;
    source.fill(0); limits.request_bytes = 1; limits.response_bytes = 1;
    expect(context.body).toBe(before); expect(parse(context, issued())).toEqual(issued());
    let touched = 0; const invalidBounds = { ...LIMITS };
    Object.defineProperty(invalidBounds, "response_bytes", { enumerable: true, get() { touched++; throw new Error(HUMAN); } });
    refuses(() => prepare("issue", request("issue"), invalidBounds)); expect(touched).toBe(0);
  });
});
