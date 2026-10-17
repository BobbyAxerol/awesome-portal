import { createHash } from "node:crypto";
import type { ClientRequest, IncomingMessage } from "node:http";
import { request } from "node:https";
import { isIP } from "node:net";
import { checkServerIdentity, TLSSocket, type ConnectionOptions } from "node:tls";
import { types } from "node:util";
import { nativeBusinessReadTransportRequest, nativeBusinessReadWorkloadId,
  parseNativeBusinessReadResult, type PreparedNativeBusinessReadRequest,
  type NativeBusinessReadResult } from "./native-business-read-codec";

/** PRIVATE candidate transport. Import/constructor opens no socket. The caller
 * owns genuine human assertion, same-attempt durable lifecycle and final-egress
 * authority. No signer, Core candidate.issue(), retries, release or grants. */
export interface NativeBusinessReadClientConfig {
  origin: string;
  tls: { ca: string | Uint8Array; key: string | Uint8Array; cert: string | Uint8Array };
  pm_leaf_sha256: string;
  workload_id: string;
  deadline_ms: number;
  request_bytes: number;
  response_bytes: number;
  max_inflight: number;
}
export type NativeBusinessReadClientCode = "NATIVE_BUSINESS_READ_CONFIG_INVALID" |
  "NATIVE_BUSINESS_READ_REQUEST_INVALID" | "NATIVE_BUSINESS_READ_RESULT_UNVERIFIED" | "NATIVE_BUSINESS_READ_BUSY" |
  "NATIVE_BUSINESS_READ_UNAVAILABLE" | "NATIVE_BUSINESS_READ_DEADLINE_EXCEEDED";
export class NativeBusinessReadClientError extends Error {
  /** Transport fact only. Neither value is a source processing/release result. */
  constructor(readonly code: NativeBusinessReadClientCode,
    readonly http_delivery: "NOT_ATTEMPTED" | "MAY_HAVE_OCCURRED") {
    super("The native business read transport is not available.");
  }
}
type Config = Omit<NativeBusinessReadClientConfig, "origin" | "tls"> & {
  tls: { ca: Buffer; key: Buffer; cert: Buffer };
};
const error = (code: NativeBusinessReadClientCode, sent = false) =>
  new NativeBusinessReadClientError(code, sent ? "MAY_HAVE_OCCURRED" : "NOT_ATTEMPTED");
function own(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || types.isProxy(value) || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw error("NATIVE_BUSINESS_READ_CONFIG_INVALID");
  const names = Reflect.ownKeys(value);
  if (names.length !== keys.length || names.some(key => typeof key !== "string" || !keys.includes(key)))
    throw error("NATIVE_BUSINESS_READ_CONFIG_INVALID");
  const result: Record<string, unknown> = Object.create(null);
  for (const name of names as string[]) {
    const property = Object.getOwnPropertyDescriptor(value, name)!;
    if (!Object.hasOwn(property, "value") || !property.enumerable) throw error("NATIVE_BUSINESS_READ_CONFIG_INVALID");
    result[name] = property.value;
  }
  return result;
}
function integer(value: unknown, maximum: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > maximum)
    throw error("NATIVE_BUSINESS_READ_CONFIG_INVALID");
  return value;
}
function pem(value: unknown): Buffer {
  if (typeof value === "string") {
    if (!value || value.length > 32768 || Buffer.byteLength(value, "utf8") > 32768)
      throw error("NATIVE_BUSINESS_READ_CONFIG_INVALID");
    return Buffer.from(value, "utf8");
  }
  if (!types.isUint8Array(value)) throw error("NATIVE_BUSINESS_READ_CONFIG_INVALID");
  const getLength = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), "byteLength")!.get!;
  const length = getLength.call(value) as number;
  if (length < 1 || length > 32768) throw error("NATIVE_BUSINESS_READ_CONFIG_INVALID");
  const copy = Buffer.alloc(length); Uint8Array.prototype.set.call(copy, value);
  return copy;
}
const fixedPaths = new Set(["issue", "enter", "unknown", "status", "cancel-unentered", "resolve"]
  .map(action => `/internal/elp210/business-root-read/${action}`));

/** Private authenticated transport correlation, NEVER a held read capability,
 * grant, final-egress receipt or proof that a source obligation is settled.
 * Token-free Base and exact reply-byte digest permit durable caller custody.
 * Only call()'s actual successful TLS/framing/codec path can create a witness. */
export interface AuthenticatedNativeBusinessReadResult {
  readonly action: ReturnType<typeof nativeBusinessReadTransportRequest>["action"];
  readonly base_body: string;
  readonly binding_digest: string;
  readonly stable_core_digest: string;
  readonly response_sha256: string;
  readonly result: NativeBusinessReadResult;
}
const authenticated = new WeakMap<object, { client: NativeBusinessReadClient;
  witness: Readonly<AuthenticatedNativeBusinessReadResult> }>();
export function nativeBusinessReadAuthenticatedResult(client: NativeBusinessReadClient,
  result: unknown): Readonly<AuthenticatedNativeBusinessReadResult> {
  // WeakMap identity checking executes no Proxy/getter/reflection hooks.
  const proof = result !== null && (typeof result === "object" || typeof result === "function")
    ? authenticated.get(result) : undefined;
  if (!proof || proof.client !== client) throw error("NATIVE_BUSINESS_READ_RESULT_UNVERIFIED");
  return proof.witness;
}

/** No HTTP write/end/flush occurs before actual authorized secureConnect and
 * exact hostname/leaf check. agent:false prevents reuse of a prior TLS gate.
 * A started operation occupies admission until its ClientRequest closes, even
 * if its promise has failed or the peer reply is malformed/complete. */
export class NativeBusinessReadClient {
  private readonly origin: string;
  private readonly hostname: string;
  private readonly config: Config;
  private inFlight = 0;
  constructor(input: NativeBusinessReadClientConfig) {
    try {
      const data = own(input, ["origin", "tls", "pm_leaf_sha256", "workload_id", "deadline_ms",
        "request_bytes", "response_bytes", "max_inflight"]);
      if (typeof data.origin !== "string" || data.origin.length > 2048 ||
          !/^https:\/\/[^\/?#\\\s]+\/?$(?![\s\S])/.test(data.origin) || data.origin.includes("@")) throw new Error();
      const origin = new URL(data.origin);
      if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" ||
          origin.search || origin.hash || !origin.hostname || origin.hostname.length > 253 ||
          origin.port !== "" && (Number(origin.port) < 1 || Number(origin.port) > 65535) ||
          typeof data.pm_leaf_sha256 !== "string" || !/^sha256:[a-f0-9]{64}$(?![\s\S])/.test(data.pm_leaf_sha256))
        throw new Error();
      const tls = own(data.tls, ["ca", "key", "cert"]);
      this.origin = origin.origin;
      this.hostname = origin.hostname.replace(/^\[|\]$/g, "");
      this.config = Object.freeze({ tls: Object.freeze({ ca: pem(tls.ca), key: pem(tls.key), cert: pem(tls.cert) }),
        pm_leaf_sha256: data.pm_leaf_sha256, workload_id: nativeBusinessReadWorkloadId(data.workload_id),
        deadline_ms: integer(data.deadline_ms, 10000), request_bytes: integer(data.request_bytes, 32768),
        response_bytes: integer(data.response_bytes, 32768), max_inflight: integer(data.max_inflight, 16) });
    } catch { throw error("NATIVE_BUSINESS_READ_CONFIG_INVALID"); }
  }
  snapshot(): Readonly<{ in_flight: number }> { return Object.freeze({ in_flight: this.inFlight }); }

  call(prepared: PreparedNativeBusinessReadRequest): Promise<NativeBusinessReadResult> {
    let body: Buffer, path: string;
    let correlation: ReturnType<typeof nativeBusinessReadTransportRequest>;
    try {
      // Helper obtains ALL values from the genuine codec WeakMap, never a
      // caller-provided carrier getter or a reconstructed request/assertion.
      const wire = nativeBusinessReadTransportRequest(prepared);
      correlation = wire;
      if (wire.workload_id !== this.config.workload_id || !fixedPaths.has(wire.path)) throw new Error();
      body = Buffer.from(wire.body, "utf8"); path = wire.path;
      if (body.length < 1 || body.length > this.config.request_bytes) throw new Error();
    } catch { return Promise.reject(error("NATIVE_BUSINESS_READ_REQUEST_INVALID")); }
    if (this.inFlight >= this.config.max_inflight) return Promise.reject(error("NATIVE_BUSINESS_READ_BUSY"));
    this.inFlight++;
    return new Promise((resolve, reject) => {
      let req: ClientRequest | undefined, response: IncomingMessage | undefined, socket: TLSSocket | undefined;
      let settled = false, released = false, sent = false, tlsAllowed = false, ended = false;
      let deadline: ReturnType<typeof setTimeout> | undefined;
      const release = () => {
        if (released) return;
        released = true; clearTimeout(deadline); this.inFlight--;
      };
      const abort = (code: NativeBusinessReadClientCode = "NATIVE_BUSINESS_READ_UNAVAILABLE") => {
        if (!settled) { settled = true; reject(error(code, sent)); }
        // Destroy even after success if close has not arrived by deadline;
        // settling a Promise never confirms physical request closure.
        try { response?.destroy(); } catch { /* safe refusal only */ }
        try { req?.destroy(); } catch { /* retain admission until actual close */ }
        try { socket?.destroy(); } catch { /* retain admission until actual close */ }
        if (!req) release(); // request construction failed before an owned request existed
      };
      const fail = () => abort();
      deadline = setTimeout(() => abort("NATIVE_BUSINESS_READ_DEADLINE_EXCEEDED"), this.config.deadline_ms);
      try {
        // Node HTTPS forwards TLS connection options, but RequestOptions does
        // not list ALPNProtocols. Validate it against the actual TLS type;
        // preserve the runtime option without any cast or untyped property.
        const alpn: Pick<ConnectionOptions, "ALPNProtocols"> = { ALPNProtocols: ["http/1.1"] };
        req = request(new URL(path, this.origin), { ...this.config.tls, ...alpn, method: "POST", agent: false,
          minVersion: "TLSv1.3", maxVersion: "TLSv1.3", rejectUnauthorized: true,
          ...(isIP(this.hostname) ? {} : { servername: this.hostname }),
          maxHeaderSize: 8192, insecureHTTPParser: false,
          checkServerIdentity: (host, cert) => {
            const mismatch = checkServerIdentity(host, cert);
            if (mismatch) return mismatch;
            if (!cert.raw || `sha256:${createHash("sha256").update(cert.raw).digest("hex")}` !== this.config.pm_leaf_sha256)
              return new Error("NATIVE_BUSINESS_READ_PEER_MISMATCH");
          },
          headers: { "content-type": "application/json", "content-length": String(body.length), "connection": "close" },
        }, res => {
          response = res;
          // Own these error channels before any early header refusal/destroy.
          res.on("error", fail); res.on("aborted", fail);
          // Unsolicited pre-request bytes, all negative statuses and malformed
          // frames are uncertain failures, never a fabricated source result.
          if (!sent || !tlsAllowed || res.statusCode !== 200 || res.httpVersion !== "1.1") { abort(); return; }
          const fields = new Map<string, string>();
          if (res.rawHeaders.length % 2 !== 0 || res.rawHeaders.length > 64) { abort(); return; }
          for (let i = 0; i < res.rawHeaders.length; i += 2) {
            const name = res.rawHeaders[i], value = res.rawHeaders[i + 1];
            if (!/^[A-Za-z0-9-]+$(?![\s\S])/.test(name) || fields.has(name.toLowerCase()) || /[\r\n\u0000]/.test(value)) {
              abort(); return;
            }
            fields.set(name.toLowerCase(), value);
          }
          const length = fields.get("content-length");
          if (fields.get("content-type") !== "application/json" || fields.get("connection") !== "close" ||
              fields.get("cache-control") !== "no-store" || fields.has("transfer-encoding") || fields.has("content-encoding") ||
              fields.has("expect") || length === undefined || !/^[1-9][0-9]{0,4}$(?![\s\S])/.test(length) ||
              Number(length) > this.config.response_bytes) { abort(); return; }
          const expectedLength = Number(length), chunks: Buffer[] = []; let size = 0;
          res.once("close", () => { if (!ended) abort(); });
          res.on("data", (chunk: unknown) => {
            if (settled) return;
            if (!Buffer.isBuffer(chunk)) { abort(); return; }
            size += chunk.length;
            if (size > expectedLength || size > this.config.response_bytes) { abort(); return; }
            chunks.push(Buffer.from(chunk));
          });
          res.once("end", () => {
            ended = true;
            if (settled) return;
            if (!res.complete || size !== expectedLength) { abort(); return; }
            try {
              const bytes = Buffer.concat(chunks, size);
              const parsed = parseNativeBusinessReadResult(prepared, bytes);
              authenticated.set(parsed, { client: this, witness: Object.freeze({
                action: correlation.action, base_body: correlation.base_body,
                binding_digest: correlation.binding_digest, stable_core_digest: correlation.stable_core_digest,
                response_sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`, result: parsed,
              }) });
              settled = true; resolve(parsed);
              // Admission/timer remain until the request's real close event.
            } catch { abort(); }
            finally { chunks.length = 0; }
          });
        });
        // Never truncate rawHeaders into an apparently valid duplicate-free
        // set. Parser byte cap bounds collection; the explicit 32-pair cap above
        // then refuses excess instead of silently discarding them.
        req.maxHeadersCount = 0;
        req.on("error", fail);
        req.once("close", () => { if (!settled) abort(); release(); });
        req.once("socket", candidate => {
          if (!(candidate instanceof TLSSocket)) { abort(); return; }
          socket = candidate; socket.on("error", fail);
          const send = () => {
            if (settled || sent) return;
            try {
              if (!socket || !socket.authorized || socket.getProtocol() !== "TLSv1.3" ||
                  socket.alpnProtocol && socket.alpnProtocol !== "http/1.1") throw new Error();
              const cert = socket.getPeerCertificate();
              if (checkServerIdentity(this.hostname, cert) || !cert.raw ||
                  `sha256:${createHash("sha256").update(cert.raw).digest("hex")}` !== this.config.pm_leaf_sha256) throw new Error();
              tlsAllowed = true;
              sent = true; // set BEFORE end: a synchronous throw may still follow partial send
              req!.end(body);
            } catch { abort(); }
          };
          // No write/end/flushHeaders exists outside this actual handshake
          // completion event. agent:false guarantees a fresh non-pooled socket.
          socket.once("secureConnect", send);
        });
        // Intentionally no req.end(), req.write() or flushHeaders() here.
      } catch { abort(); }
    });
  }
}
