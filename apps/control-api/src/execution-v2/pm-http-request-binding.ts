import { createHash } from "node:crypto";

/** PM public source contract pma.http-request-binding.v1, not CommandIntent's
 * semantic digest. Source pin: PM84456381 + owner HTTP-binding WIP;
 * pma11-03-http-request-binding.json sha256 16687796123014686290576be7153ae6d42ccf21d6515afbc37ebacdfea749ec.
 *
 * Private codec only: callers supply the exact server-owned serialized request
 * that will be delivered to PM. A digest/typed value is NOT human, workload,
 * membership or financial authority, and this module installs no client/route.
 */
export const PM_HTTP_REQUEST_BINDING_SCHEMA = "pma.http-request-binding.v1" as const;

export interface PmHttpRequestBytes {
  method: "GET" | "POST";
  /** ASGI raw_path bytes, including mount prefix/percent encoding, no query. */
  raw_path: Uint8Array;
  /** ASGI query_string bytes, excluding the URL's query separator. */
  query_string: Uint8Array;
  /** Actual serialized bytes, including whitespace; empty for bodyless reads. */
  body: Uint8Array;
}

export interface PmHttpRequestBounds {
  /** Explicit matching source RuntimeBounds.request_bytes. No runtime default. */
  request_bytes: number;
}

type Refusal = "HTTP_REQUEST_BINDING_INVALID" | "QUERY_LIMIT_EXCEEDED" | "BODY_LIMIT_EXCEEDED";
export class PmHttpRequestBindingError extends Error {
  constructor(readonly code: Refusal) { super(code); this.name = "PmHttpRequestBindingError"; }
}

function exactRecord(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const own = Reflect.ownKeys(value);
  return own.length === keys.length && own.every(key => typeof key === "string" && keys.includes(key)
    && Object.hasOwn(Object.getOwnPropertyDescriptor(value, key)!, "value"));
}
const byteDigest = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");

/** Hashes bytes, never parses/reserializes JSON, decodes paths, sorts query
 * fields or accepts a caller-supplied digest. Raw input is not UTF8-decoded:
 * PM hashes even malformed body bytes before its later JSON parser refuses
 * them. Only the fixed ASCII descriptor is serialized as UTF8 here.
 *
 * Compute after final server serialization, sign its result, then preserve
 * those exact bytes through relay. This function cannot prove provenance or
 * freeze a caller's later request; actual transport/composition must do so.
 */
export function pmHttpRequestDigest(input: PmHttpRequestBytes, bounds: PmHttpRequestBounds): string {
  if (!exactRecord(input, ["method", "raw_path", "query_string", "body"]) ||
      (input.method !== "GET" && input.method !== "POST") || !(input.raw_path instanceof Uint8Array) ||
      input.raw_path.byteLength < 1 || input.raw_path.byteLength > 8192 || input.raw_path[0] !== 0x2f ||
      input.raw_path.includes(0x3f) || input.raw_path.includes(0x23))
    throw new PmHttpRequestBindingError("HTTP_REQUEST_BINDING_INVALID");
  if (!(input.query_string instanceof Uint8Array) || input.query_string.byteLength > 2048)
    throw new PmHttpRequestBindingError("QUERY_LIMIT_EXCEEDED");
  if (!exactRecord(bounds, ["request_bytes"]) || !Number.isSafeInteger(bounds.request_bytes) || bounds.request_bytes <= 0 ||
      !(input.body instanceof Uint8Array) || input.body.byteLength > bounds.request_bytes)
    throw new PmHttpRequestBindingError("BODY_LIMIT_EXCEEDED");

  // Descriptor keys are deliberately in source sort_keys=True order. All
  // descriptor strings are ASCII, so JSON.stringify matches PM's UTF8 codec
  // exactly, without depending on another domain's canonicalization policy.
  const descriptor = { body_sha256: byteDigest(input.body), method: input.method,
    path_sha256: byteDigest(input.raw_path), query_sha256: byteDigest(input.query_string),
    schema: PM_HTTP_REQUEST_BINDING_SCHEMA };
  return `sha256:${createHash("sha256").update(JSON.stringify(descriptor), "utf8").digest("hex")}`;
}
