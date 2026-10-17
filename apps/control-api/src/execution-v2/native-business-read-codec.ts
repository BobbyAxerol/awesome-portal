import { createHash } from "node:crypto";
import { types } from "node:util";
import { z } from "zod";
import { pmHttpRequestDigest } from "./pm-http-request-binding";

/** PRIVATE source-pinned codec only, intended execution-v2/native-business-read-codec.ts.
 * No socket, signer, held handle, release, lease persistence or authority is installed.
 * Source: native-read-wire-current.md, PM89293d0d2ecb075f34250dd1d516b062ca6c3275.
 * A parsed status/ISSUED object is never a Core/TS read capability. */
export type NativeBusinessReadAction = "issue" | "enter" | "unknown" | "status" | "cancel-unentered" | "resolve";
export interface NativeBusinessReadCodecBounds { request_bytes: number; response_bytes: number; }
export class NativeBusinessReadCodecError extends Error {
  readonly code = "NATIVE_BUSINESS_READ_WIRE_INVALID";
  constructor() { super("The native business read message is not available."); }
}
const fail = (): never => { throw new NativeBusinessReadCodecError(); };
const end = "$(?![\\s\\S])";
const raw = z.string().regex(new RegExp("^[0-9a-f]{64}" + end));
const prefixed = z.string().regex(new RegExp("^sha256:[0-9a-f]{64}" + end));
// Python str(UUID(value)) equality allows nil/version-any UUIDs, not uppercase or aliases.
const uuid = z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}" + end));
const revisionPattern = new RegExp("^[1-9][0-9]{0,18}" + end);
const positive = z.string().max(19).regex(revisionPattern)
  .refine(value => revisionPattern.test(value) && BigInt(value) < 9223372036854775808n);
const environment = z.enum(["paper", "sandbox", "live"]);
// Python whitespace differs from JS trim: NEL is whitespace, BOM is not.
const pythonEdgeWhitespace = /^(?:[\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000])|(?:[\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000])$(?![\s\S])/u;
function utf8(value: string): boolean {
  // Reject escaped lone UTF16 surrogates rather than encode replacement bytes.
  for (let i = 0; i < value.length; i++) {
    const unit = value.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
  }
  return true;
}
const identifier = (maximumBytes = 512) => z.string().min(1).max(maximumBytes).refine(value => value.length <= maximumBytes && utf8(value) &&
  Buffer.byteLength(value, "utf8") <= maximumBytes && !/[\u0000-\u001f\u007f]/u.test(value) &&
  !pythonEdgeWhitespace.test(value));
const token = z.string().min(1).max(8192).refine(value => value.length <= 8192 && utf8(value) && Buffer.byteLength(value, "utf8") <= 8192);
const mapping = identifier().refine(value => {
  const match = /^ts-user:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):([1-9][0-9]*)$(?![\s\S])/.exec(value);
  return match !== null; // No unproved int64 cap for the mapping counter.
});

/** Exact source UTC grammar, real Gregorian dates, microseconds retained.
 * May be in the past: recovery must preserve an expired original deadline.
 * This parser does not decide present authority/expiry or alter wire strings. */
export function nativeBusinessReadUtcMicroseconds(value: string): bigint {
  if (typeof value !== "string" || value.length > 32) return fail();
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(?:Z|\+00:00)$(?![\s\S])/.exec(value);
  if (!match) return fail();
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1] ||
      hour > 23 || minute > 59 || second > 59) return fail();
  const fraction = (match[7] ?? "").padEnd(6, "0");
  const ms = Date.parse(`${value.slice(0, 19)}.${fraction.slice(0, 3)}Z`);
  if (!Number.isSafeInteger(ms)) return fail();
  return BigInt(ms) * 1000n + BigInt(fraction.slice(3));
}
const utc = z.string().refine(value => {
  try { nativeBusinessReadUtcMicroseconds(value); return true; } catch { return false; }
});
const binding = z.object({ lease_id: uuid, attempt_id: uuid, human_issuer: identifier(), subject: identifier(),
  workspace_id: identifier(256), environment, workload_id: identifier().refine(value => [...value].length <= 128),
  request_digest: raw, operation: z.literal("READ") }).strict();
const domain = z.object({ profile_id: identifier(128), catalogue_sha256: raw,
  profile_sha256: raw, field_policy_sha256: raw }).strict();
const managerIntent = z.object({ schema_version: z.literal("pma.manager-read-intent.v1"),
  action: z.enum(["catalogue", "capabilities", "relation_page", "relation_record", "projection_page"]), digest: raw }).strict();
const base = z.object({ schema_version: z.literal("pma.native-business-read.request.v1"),
  binding, domain, manager_intent: managerIntent, deadline: utc }).strict();
const humanRequest = base.extend({ human_token: token }).strict();
const terminalRequest = base.extend({ signed_terminal: token }).strict();
type Request = z.infer<typeof base> | z.infer<typeof humanRequest> | z.infer<typeof terminalRequest>;
const common = z.object({ schema_version: z.literal("pma.native-business-read.result.v1"),
  binding, component: z.literal("NATIVE_BUSINESS_READ_ONLY") }).strict();
const issued = common.extend({ state: z.literal("ISSUED"),
  human: z.object({ issuer: identifier(), subject: identifier(), portal_user_id: identifier(256),
    ts_user_id: uuid, mapping_revision: mapping }).strict(),
  domain: domain.extend({ environment }).strict(),
  permission: z.object({ scope_kind: z.literal("MANAGER_CATALOGUE_DOMAIN"),
    action: z.literal("business.read_all"), delegable: z.literal(false) }).strict(),
  native: z.object({ revision: positive, receipt_id: uuid, receipt_digest: prefixed, document_digest: prefixed,
    policy_revision: positive, owner_mapping_revision: mapping, semantic_revision: prefixed,
    effective_from: utc, expires_at: utc }).strict(),
  lease: z.object({ source_digest: raw, source_fingerprint: raw, expires_at: utc }).strict(),
}).strict();
const entered = common.extend({ state: z.literal("ENTERED") }).strict();
const uncertain = common.extend({ state: z.literal("UNKNOWN") }).strict();
const observed = common.extend({ state: z.literal("OBSERVATION"), may_authorize_read: z.literal(false),
  recovery: z.union([
    z.object({ state: z.literal("ABSENT"), terminal_authority: z.literal(false), release_permitted: z.literal(false) }).strict(),
    z.object({ state: z.literal("RECORDED"), phase: z.literal("CANCELLED"),
      terminal_authority: z.literal(false), release_permitted: z.literal(false) }).strict(),
    z.object({ state: z.literal("RECORDED"), phase: z.enum(["ISSUED", "ENTERED", "UNKNOWN", "RETIRED", "COMMITTED", "ROLLED_BACK", "SERVED", "ABORTED"]),
      source_digest: raw, expires_at: utc, terminal_authority: z.literal(false), release_permitted: z.literal(false) }).strict(),
  ]),
}).strict();
const cancelled = common.extend({ state: z.literal("CANCELLED"), may_authorize_read: z.literal(false),
  recovery: z.object({ state: z.literal("CANCELLED"), cancellation_authority: z.literal(true), release_permitted: z.literal(true) }).strict(),
}).strict();
const retired = common.extend({ state: z.literal("RETIRED"), may_authorize_read: z.literal(false),
  recovery: z.object({ state: z.literal("RETIRED"), cancellation_authority: z.literal(true), release_permitted: z.literal(true) }).strict(),
}).strict();
const settled = common.extend({ state: z.literal("SETTLED"), may_authorize_read: z.literal(false),
  recovery: z.object({ state: z.literal("SETTLED"), phase: z.enum(["SERVED", "ABORTED"]),
    terminal_authority: z.literal(true), release_permitted: z.literal(true) }).strict(),
}).strict();
const result = z.union([issued, entered, uncertain, observed, cancelled, retired, settled]);
export type NativeBusinessReadResult = z.infer<typeof result>;
type Data = string | boolean | { [key: string]: Data };
const sha256 = (value: string | Uint8Array): string => createHash("sha256").update(value).digest("hex");
function exactObject(value: unknown, keys?: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || types.isProxy(value) || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return fail();
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length > 32 || ownKeys.some(key => typeof key !== "string")) return fail();
  const names = ownKeys as string[];
  if (keys && (names.length !== keys.length || names.some(key => !keys.includes(key)))) return fail();
  const detached: Record<string, unknown> = Object.create(null);
  for (const key of names) {
    const property = Object.getOwnPropertyDescriptor(value, key)!;
    if (!Object.hasOwn(property, "value") || !property.enumerable) return fail();
    detached[key] = property.value;
  }
  return detached;
}
function bounds(value: NativeBusinessReadCodecBounds): NativeBusinessReadCodecBounds {
  const object = exactObject(value, ["request_bytes", "response_bytes"]);
  for (const size of Object.values(object))
    if (typeof size !== "number" || !Number.isSafeInteger(size) || size < 1 || size > 32768) return fail();
  return { request_bytes: object.request_bytes as number, response_bytes: object.response_bytes as number };
}
function ownData(value: unknown): Data {
  let nodes = 0;
  const copy = (current: unknown, depth: number): Data => {
    if (++nodes > 128 || depth > 4) return fail();
    if (typeof current === "string") {
      if (current.length > 32768 || !utf8(current) || Buffer.byteLength(current, "utf8") > 32768) return fail();
      return current;
    }
    if (typeof current === "boolean") return current;
    const object = exactObject(current), detached: Record<string, Data> = Object.create(null);
    if (Object.keys(object).length > 32) return fail();
    for (const [key, item] of Object.entries(object)) {
      if (!utf8(key) || Buffer.byteLength(key, "utf8") > 128) return fail();
      detached[key] = copy(item, depth + 1);
    }
    return detached;
  };
  return copy(value, 0);
}
/** Exact JSON subset for this closed wire: objects, strings, booleans only.
 * Reject duplicate decoded/escaped-alias keys at every depth BEFORE schema.
 * Numbers, arrays and null are not in any valid action's wire shape. */
function decode(bytes: Uint8Array, maximum: number): Data {
  const byteLengthGetter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), "byteLength")!.get!;
  if (!types.isUint8Array(bytes)) return fail();
  const length = byteLengthGetter.call(bytes) as number;
  if (length < 1 || length > maximum) return fail();
  const copy = new Uint8Array(length); Uint8Array.prototype.set.call(copy, bytes);
  const source = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(copy);
  const quoted = /"(?:[^"\\\u0000-\u001f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"/y;
  let i = 0, nodes = 0;
  const ws = () => { while (i < source.length && /[\x20\t\n\r]/.test(source[i])) i++; };
  const string = (): string => {
    quoted.lastIndex = i; const match = quoted.exec(source);
    if (!match) return fail();
    i = quoted.lastIndex;
    const value = JSON.parse(match[0]) as string;
    if (!utf8(value)) return fail();
    return value;
  };
  const value = (depth: number): Data => {
    if (++nodes > 128 || depth > 4) return fail();
    ws();
    if (source[i] === '"') return string();
    if (source.slice(i, i + 4) === "true") { i += 4; return true; }
    if (source.slice(i, i + 5) === "false") { i += 5; return false; }
    if (source[i++] !== "{") return fail();
    ws(); const object: Record<string, Data> = Object.create(null); let keys = 0;
    if (source[i] !== "}") for (;;) {
      const key = string();
      if (++keys > 32 || Object.hasOwn(object, key)) return fail();
      ws(); if (source[i++] !== ":") return fail();
      object[key] = value(depth + 1); ws();
      if (source[i] !== ",") break;
      i++; ws();
    }
    if (source[i++] !== "}") return fail();
    return object;
  };
  const parsed = value(0); ws(); if (i !== source.length) return fail();
  return parsed;
}
function canonical(value: Data): string {
  if (typeof value !== "object") return JSON.stringify(value);
  // All schema-approved keys are fixed ASCII; UTF8 values are not normalized.
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}
function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) freeze(item);
    Object.freeze(value);
  }
  return value;
}
export interface PreparedNativeBusinessReadRequest {
  readonly action: NativeBusinessReadAction;
  readonly path: string;
  /** Exact complete canonical body; may contain sensitive opaque assertions. NEVER log. */
  readonly body: string;
  /** Exact canonical provider-binding body: removes ONLY top-level human_token. */
  readonly unsigned_body: string;
  /** Token-free exact Base for caller-owned same-attempt recovery custody. */
  readonly base_body: string;
  readonly provider_delivery_digest: string;
  readonly binding_digest: string;
  /** All immutable Base fields including exact original deadline, independent of action. */
  readonly stable_core_digest: string;
}
const prepared = new WeakMap<object, { action: NativeBusinessReadAction; request: Request; responseBytes: number;
  baseBody: string; bindingDigest: string; stableCoreDigest: string }>();
const actions: readonly string[] = ["issue", "enter", "unknown", "status", "cancel-unentered", "resolve"];

/** Private constructor-only validation; exact existing workload schema, not
 * another signer, configured-source acceptance or permission. */
export function nativeBusinessReadWorkloadId(value: unknown): string {
  try {
    if (typeof value !== "string") return fail();
    return binding.shape.workload_id.parse(value);
  } catch { return fail(); }
}

/** Private transport view derived ONLY from genuine codec state. A shaped
 * object, Proxy/getter carrier or JSON clone cannot provide any field here.
 * This correlation carrier is NOT a held native handle/authority. */
export function nativeBusinessReadTransportRequest(context: PreparedNativeBusinessReadRequest): Readonly<{
  action: NativeBusinessReadAction; path: string; body: string; workload_id: string;
  base_body: string; binding_digest: string; stable_core_digest: string;
}> {
  try {
    const state = prepared.get(context);
    if (!state) return fail();
    return Object.freeze({ action: state.action, path: `/internal/elp210/business-root-read/${state.action}`,
      body: canonical(state.request as Data), workload_id: state.request.binding.workload_id,
      base_body: state.baseBody, binding_digest: state.bindingDigest, stable_core_digest: state.stableCoreDigest });
  } catch { return fail(); }
}

/** Detached closed own-data capture before caller yields, or strict JSON bytes.
 * Configured workload/domain/issuer/session acceptance is caller-owned, NOT inferred.
 * Provider JWT digest is prefixed; Manager/binding/source digests stay distinct. */
export function prepareNativeBusinessReadRequest(action: NativeBusinessReadAction, input: unknown,
  limits: NativeBusinessReadCodecBounds): PreparedNativeBusinessReadRequest {
  try {
    if (!actions.includes(action)) return fail();
    const cap = bounds(limits);
    const data = types.isUint8Array(input) ? decode(input as Uint8Array, cap.request_bytes) : ownData(input);
    const schema = action === "issue" || action === "enter" ? humanRequest : action === "resolve" ? terminalRequest : base;
    const request = schema.parse(data);
    if (request.manager_intent.digest !== request.binding.request_digest) return fail();
    const body = canonical(request as Data);
    if (Buffer.byteLength(body, "utf8") > cap.request_bytes) return fail();
    const unsigned = Object.fromEntries(Object.entries(request).filter(([key]) => key !== "human_token")) as Data;
    const unsignedBody = canonical(unsigned), path = `/internal/elp210/business-root-read/${action}`;
    const core = Object.fromEntries(["schema_version", "binding", "domain", "manager_intent", "deadline"]
      .map(key => [key, (request as Record<string, unknown>)[key]])) as Data;
    const coreBody = canonical(core);
    const output = Object.freeze({ action, path, body, unsigned_body: unsignedBody, base_body: coreBody,
      provider_delivery_digest: pmHttpRequestDigest({ method: "POST", raw_path: Buffer.from(path, "ascii"),
        query_string: new Uint8Array(), body: Buffer.from(unsignedBody, "utf8") }, { request_bytes: cap.request_bytes }),
      binding_digest: sha256(canonical(request.binding as Data)), stable_core_digest: sha256(coreBody) });
    prepared.set(output, { action, request: freeze(request), responseBytes: cap.response_bytes,
      baseBody: coreBody, bindingDigest: output.binding_digest, stableCoreDigest: output.stable_core_digest });
    return output;
  } catch { return fail(); }
}

/** Parses only a correlated HTTP200 JSON body. Transport/EOF/status failures are
 * NOT ABSENT/denied/rollback. No status reconstructs a local held read handle;
 * true recovery fields alone cannot release anything without caller lifecycle. */
export function parseNativeBusinessReadResult(context: PreparedNativeBusinessReadRequest,
  bytes: Uint8Array): NativeBusinessReadResult {
  try {
    const state = prepared.get(context);
    if (!state) return fail();
    const parsed = result.parse(decode(bytes, state.responseBytes));
    const allowed = { issue: ["ISSUED"], enter: ["ENTERED"], unknown: ["UNKNOWN"], status: ["OBSERVATION"],
      "cancel-unentered": ["CANCELLED", "RETIRED"], resolve: ["SETTLED"] } as const;
    if (!(allowed[state.action] as readonly string[]).includes(parsed.state) ||
        canonical(parsed.binding as Data) !== canonical(state.request.binding as Data)) return fail();
    if (parsed.state === "ISSUED") {
      const { environment: replyEnvironment, ...replyDomain } = parsed.domain;
      if (parsed.human.issuer !== state.request.binding.human_issuer || parsed.human.subject !== state.request.binding.subject ||
          parsed.human.mapping_revision.split(":").slice(0, 2).join(":") !== `ts-user:${parsed.human.ts_user_id}` ||
          replyEnvironment !== state.request.binding.environment ||
          canonical(replyDomain as Data) !== canonical(state.request.domain as Data)) return fail();
    }
    return freeze(parsed);
  } catch { return fail(); }
}
