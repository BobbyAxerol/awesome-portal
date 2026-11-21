/** PRIVATE candidate selection/witness adapter. No signer, persistent custody,
 * grant, held handle, terminal-egress receipt, release or runtime activation.
 * Source selection/HTTP authentication are NOT application/business authority. */
import { types } from "node:util";
import { accessDigest } from "./access-digest";
import { NativeBusinessReadClient, nativeBusinessReadAuthenticatedResult,
  type NativeBusinessReadClientConfig, type AuthenticatedNativeBusinessReadResult } from "./native-business-read-client";
import { captureNativeBusinessReadContext, captureNativeBusinessReadSelectedPins,
  nativeBusinessReadIdentityPreimage, nativeBusinessReadTransportRequest,
  nativeBusinessReadUtcMicroseconds, prepareNativeBusinessReadRequest,
  type NativeBusinessReadAction, type NativeBusinessReadCodecBounds,
  type NativeBusinessReadSelectedPins, type NativeReadContext } from "./native-business-read-codec";
export type { NativeReadContext } from "./native-business-read-codec";

export type SelectedNativeBusinessReadCode = "NATIVE_READ_CONFIG_INVALID" | "NATIVE_READ_INSTANCE_UNVERIFIED" |
  "NATIVE_READ_REQUEST_INVALID" | "NATIVE_READ_EXPIRED" | "NATIVE_READ_RESPONSE_INVALID" |
  "NATIVE_READ_OBSERVATION_UNVERIFIED";
export class SelectedNativeBusinessReadError extends Error {
  constructor(readonly code: SelectedNativeBusinessReadCode) {
    super("The selected native business read source is not available.");
  }
}
const fail = (code: SelectedNativeBusinessReadCode): never => { throw new SelectedNativeBusinessReadError(code); };

export interface SelectedNativeBusinessReadConfig {
  transport: NativeBusinessReadClientConfig;
  pins: NativeBusinessReadSelectedPins;
  installation_expires_at_utc_ms: number;
}
export type SelectedNativeBusinessReadSelection = Readonly<NativeBusinessReadSelectedPins & {
  readonly source_identity_digest: string;
}>;
/** Opaque identity carrier only; empty/copy/Proxy/prototype lookalikes fail readback. */
declare const verifiedObservation: unique symbol;
export interface VerifiedSelectedNativeReadObservation {
  readonly [verifiedObservation]: true;
}
export type VerifiedSelectedNativeReadView = Readonly<AuthenticatedNativeBusinessReadResult & {
  readonly source_identity_digest: string;
}>;
type SourceState = {
  client: NativeBusinessReadClient;
  pins: Readonly<NativeBusinessReadSelectedPins>;
  limits: Readonly<NativeBusinessReadCodecBounds>;
  expiresAtMs: number;
  selection: SelectedNativeBusinessReadSelection;
};
const sources = new WeakMap<object, SourceState>();
const observations = new WeakMap<object, { source: object; client: NativeBusinessReadClient;
  view: VerifiedSelectedNativeReadView }>();
// Do not dispatch through a later replaced instance/prototype method. The
// actual client still owns all socket/TLS/framing/parser and witness issuance.
const callActualClient = NativeBusinessReadClient.prototype.call;
const isKey = (value: unknown): value is object =>
  value !== null && (typeof value === "object" || typeof value === "function");
function stateFor(source: unknown): SourceState {
  const state = isKey(source) ? sources.get(source) : undefined;
  return state ?? fail("NATIVE_READ_INSTANCE_UNVERIFIED");
}
/** All configuration reflection is confined to plain own enumerable DATA
 * properties, with Proxy refusal BEFORE any prototype/descriptor operation. */
function own(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || types.isProxy(value) || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return fail("NATIVE_READ_CONFIG_INVALID");
  const names = Reflect.ownKeys(value);
  if (names.length !== keys.length || names.some(key => typeof key !== "string" || !keys.includes(key)))
    return fail("NATIVE_READ_CONFIG_INVALID");
  const result: Record<string, unknown> = Object.create(null);
  for (const name of names as string[]) {
    const property = Object.getOwnPropertyDescriptor(value, name)!;
    if (!Object.hasOwn(property, "value") || !property.enumerable) return fail("NATIVE_READ_CONFIG_INVALID");
    result[name] = property.value;
  }
  return result;
}
function fresh(state: SourceState, context: NativeReadContext): void {
  const nowMs = Date.now(), now = BigInt(nowMs) * 1000n;
  if (nowMs >= state.expiresAtMs || now >= nativeBusinessReadUtcMicroseconds(context.deadline) ||
      now >= nativeBusinessReadUtcMicroseconds(state.pins.native.expires_at) ||
      now < nativeBusinessReadUtcMicroseconds(state.pins.native.effective_from)) fail("NATIVE_READ_EXPIRED");
}
/** Authoritative selection accessor. Do not call a caller-overridden method or
 * infer application permission from any of these configured public pins. */
export function selectedNativeBusinessReadSelection(source: unknown): SelectedNativeBusinessReadSelection {
  return stateFor(source).selection;
}
/** Immutable configured installation boundary only, not an app/native grant.
 * Identity-checked from the SAME selected wrapper state; copied/Proxy instances
 * cannot manufacture or extend finite egress validity. */
export function selectedNativeBusinessReadInstallationExpiresAtMs(source:unknown):number {
  return stateFor(source).expiresAtMs;
}

/** Identity-only readback: no reflection/getter/prototype traversal. This proves
 * a selected actual client's correlated authenticated HTTP result, NOT a grant,
 * source-local held permit, final-egress observation or native reconciliation. */
export function selectedNativeBusinessReadObservation(source: unknown,
  observation: unknown): VerifiedSelectedNativeReadView {
  const state = stateFor(source);
  const proof = isKey(observation) ? observations.get(observation) : undefined;
  if (!proof || proof.source !== source || proof.client !== state.client)
    return fail("NATIVE_READ_OBSERVATION_UNVERIFIED");
  return proof.view;
}
/** Exact action-specific JWT request preimage; no placeholder token and no
 * signing. The final token-bearing prepare/client path enforces its own cap. */
export function nativeBusinessReadDeliveryDigest(action: "issue" | "enter", input: NativeReadContext): string {
  const limits = { request_bytes: 32768, response_bytes: 32768 };
  const context = captureNativeBusinessReadContext(input, limits);
  return nativeBusinessReadIdentityPreimage(action,
    { schema_version: "pma.native-business-read.request.v1", ...context }, limits).provider_delivery_digest;
}

async function callSelected(source: unknown, action: NativeBusinessReadAction,
  input: NativeReadContext, assertion?: string): Promise<VerifiedSelectedNativeReadObservation> {
  const state = stateFor(source);
  // Both Base and opaque assertion are synchronously detached/closed before
  // the first await; no caller mutation can change the selected request.
  let context: NativeReadContext;
  let request: ReturnType<typeof prepareNativeBusinessReadRequest>;
  try {
    context = captureNativeBusinessReadContext(input, state.limits);
    const base = { schema_version: "pma.native-business-read.request.v1" as const, ...context };
    const expected = state.pins.binding;
    for (const key of Object.keys(expected) as (keyof typeof expected)[])
      if (base.binding[key] !== expected[key]) return fail("NATIVE_READ_REQUEST_INVALID");
    if (accessDigest(base.domain) !== accessDigest(state.pins.domain)) return fail("NATIVE_READ_REQUEST_INVALID");
    request = prepareNativeBusinessReadRequest(action, {
      ...base, ...(action === "issue" || action === "enter" ? { human_token: assertion } :
        action === "resolve" ? { signed_terminal: assertion } : {}),
    }, state.limits);
  } catch { return fail("NATIVE_READ_REQUEST_INVALID"); }
  const acquiring = action === "issue" || action === "enter";
  if (acquiring) fresh(state, context);
  const correlation = nativeBusinessReadTransportRequest(request);
  // Client failures retain the actual transport's conservative delivery fact.
  // Neither timeout nor wrapper expiry means NOT_PROCESSED/cancel/release.
  const result = await Reflect.apply(callActualClient, state.client, [request]);
  const witness = nativeBusinessReadAuthenticatedResult(state.client, result);
  if (witness.action !== action || witness.base_body !== correlation.base_body ||
      witness.binding_digest !== correlation.binding_digest ||
      witness.stable_core_digest !== correlation.stable_core_digest) return fail("NATIVE_READ_RESPONSE_INVALID");
  if (witness.result.state === "ISSUED") {
    const reply = witness.result, now = BigInt(Date.now()) * 1000n;
    if (accessDigest(reply.human) !== accessDigest(state.pins.human) ||
        accessDigest(reply.native) !== accessDigest(state.pins.native) ||
        reply.lease.source_fingerprint !== state.pins.source_fingerprint ||
        nativeBusinessReadUtcMicroseconds(reply.native.effective_from) > now ||
        nativeBusinessReadUtcMicroseconds(reply.lease.expires_at) <= now ||
        nativeBusinessReadUtcMicroseconds(reply.lease.expires_at) > nativeBusinessReadUtcMicroseconds(context.deadline) ||
        nativeBusinessReadUtcMicroseconds(reply.lease.expires_at) > nativeBusinessReadUtcMicroseconds(reply.native.expires_at))
      return fail("NATIVE_READ_RESPONSE_INVALID");
  }
  // Recovery intentionally retains the exact OLD Base/deadline and can observe
  // an expired installation/native receipt; it cannot authorize a new READ.
  if (acquiring) fresh(state, context);
  const view = Object.freeze({ ...witness, source_identity_digest: state.selection.source_identity_digest });
  const observation = Object.freeze(Object.create(null)) as VerifiedSelectedNativeReadObservation;
  observations.set(observation, { source: source as object, client: state.client, view });
  return observation;
}
export class SelectedNativeBusinessReadSource {
  constructor(input: SelectedNativeBusinessReadConfig) {
    try {
      const root = own(input, ["transport", "pins", "installation_expires_at_utc_ms"]);
      const transport = own(root.transport, ["origin", "tls", "pm_leaf_sha256", "workload_id",
        "deadline_ms", "request_bytes", "response_bytes", "max_inflight"]);
      const pins = captureNativeBusinessReadSelectedPins(root.pins);
      const expiresAtMs = root.installation_expires_at_utc_ms;
      if (typeof expiresAtMs !== "number" || !Number.isSafeInteger(expiresAtMs) || expiresAtMs < 1 ||
          transport.workload_id !== pins.binding.workload_id ||
          pins.human.issuer !== pins.binding.human_issuer || pins.human.subject !== pins.binding.subject ||
          pins.human.mapping_revision.split(":").slice(0, 2).join(":") !== "ts-user:" + pins.human.ts_user_id ||
          nativeBusinessReadUtcMicroseconds(pins.native.expires_at) <=
            nativeBusinessReadUtcMicroseconds(pins.native.effective_from)) return fail("NATIVE_READ_CONFIG_INVALID");
      // Existing constructor descriptor-validates TLS leaves and copies every
      // buffer synchronously; this wrapper exposes NO client/secret accessor.
      const client = new NativeBusinessReadClient(transport as unknown as NativeBusinessReadClientConfig);
      const selection = Object.freeze({ ...pins, source_identity_digest: accessDigest({
        schema_version: "portal.selected-native-business-read-source.v1",
        transport: { origin: new URL(transport.origin as string).origin,
          pm_leaf_sha256: transport.pm_leaf_sha256, workload_id: transport.workload_id },
        pins,
      }) });
      sources.set(this, { client, pins, limits: Object.freeze({
        request_bytes: transport.request_bytes as number, response_bytes: transport.response_bytes as number,
      }), expiresAtMs, selection });
      Object.freeze(this);
    } catch { return fail("NATIVE_READ_CONFIG_INVALID"); }
  }
  issue(context: NativeReadContext, humanToken: string): Promise<VerifiedSelectedNativeReadObservation> {
    return callSelected(this, "issue", context, humanToken);
  }
  enter(context: NativeReadContext, humanToken: string): Promise<VerifiedSelectedNativeReadObservation> {
    return callSelected(this, "enter", context, humanToken);
  }
  unknown(context: NativeReadContext): Promise<VerifiedSelectedNativeReadObservation> {
    return callSelected(this, "unknown", context);
  }
  status(context: NativeReadContext): Promise<VerifiedSelectedNativeReadObservation> {
    return callSelected(this, "status", context);
  }
  cancelUnentered(context: NativeReadContext): Promise<VerifiedSelectedNativeReadObservation> {
    return callSelected(this, "cancel-unentered", context);
  }
  resolve(context: NativeReadContext, signedTerminal: string): Promise<VerifiedSelectedNativeReadObservation> {
    return callSelected(this, "resolve", context, signedTerminal);
  }
}
