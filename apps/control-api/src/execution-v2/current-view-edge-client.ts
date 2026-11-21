import { createHash, X509Certificate } from "node:crypto";
import { request, type RequestOptions } from "node:https";
import type { ClientRequest, IncomingMessage } from "node:http";
import { performance } from "node:perf_hooks";
import { TLSSocket } from "node:tls";
import { CurrentViewAuthority, CurrentViewAuthorityError, type CurrentViewOperation,
  type CurrentViewSelection } from "./current-view-authority";
import { ExecutionReadScopeError, type ReadScopePrincipal, type HeldNativeReadScopes } from "./read-scope";

export interface CurrentViewEdgeClientConfig {
  origin: string;
  tls: { key: string | Buffer; cert: string | Buffer; ca: string | Buffer };
  peer: { certificate_sha256: string; dns_name: string };
  limits: { maximum_in_flight: number; deadline_ms: number; response_bytes: number };
}
/** SERVER catalogue input, never a public request/URL or a permission. The
 * exact operation must also be commissioned in CurrentViewSelection. */
export interface SelectedCurrentViewEdgeRead {
  authority: CurrentViewSelection;
  resource: string;
  query: { limit: number; max_bytes: number; entity_id?: string; from_ms?: number; to_ms?: number; cursor?: string };
}
export class CurrentViewEdgeClientError extends Error {
  constructor(readonly code: "CURRENT_VIEW_EDGE_CONFIG_INVALID" | "CURRENT_VIEW_EDGE_INPUT_INVALID" |
    "CURRENT_VIEW_EDGE_OPERATION_NOT_FINITE" | "CURRENT_VIEW_EDGE_BUSY" | "CURRENT_VIEW_EDGE_DEADLINE" |
    "CURRENT_VIEW_EDGE_ABORTED" | "CURRENT_VIEW_EDGE_UNAVAILABLE", readonly status = 503) {
    super("The selected Execution read is unavailable.");
  }
}
const error = (code: CurrentViewEdgeClientError["code"], status = 503) => new CurrentViewEdgeClientError(code, status);
const positive = (n: number, max: number) => Number.isSafeInteger(n) && n > 0 && n <= max;
const copyPem = (pem: string | Buffer): Buffer => typeof pem === "string" ? Buffer.from(pem) : Buffer.from(pem);
type Authority = Pick<CurrentViewAuthority, "withOriginalContext" | "resolve" | "deliver">;

/** Real finite TLS1.3/mTLS composition, UNINSTALLED until explicitly selected
 * by the server. No retries, redirects, cookies, JWTs, stream handles, grant
 * issue, source ACK or terminal lifecycle mutation. Original custody survives
 * the ENTIRE response and final current-authority check, including errors. */
export class CurrentViewEdgeClient {
  private readonly config: CurrentViewEdgeClientConfig;
  private inFlight = 0;
  constructor(private readonly authority: Authority, input: CurrentViewEdgeClientConfig) {
    try {
      const origin = new URL(input.origin);
      if (!/^https:\/\/[^/?#\\\s]+\/?$/u.test(input.origin) || origin.username || origin.password ||
        origin.pathname !== "/" || origin.search || origin.hash || !input.tls.key || !input.tls.cert || !input.tls.ca ||
        !/^sha256:[a-f0-9]{64}$/u.test(input.peer.certificate_sha256) ||
        !/^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/u.test(input.peer.dns_name) ||
        !positive(input.limits.maximum_in_flight, 16) || !positive(input.limits.deadline_ms, 5000) ||
        !positive(input.limits.response_bytes, 1_048_576)) throw new Error();
      this.config = { origin: origin.origin, peer: { ...input.peer }, limits: { ...input.limits },
        tls: { key: copyPem(input.tls.key), cert: copyPem(input.tls.cert), ca: copyPem(input.tls.ca) } };
    } catch { throw error("CURRENT_VIEW_EDGE_CONFIG_INVALID", 400); }
  }
  snapshot() { return Object.freeze({ in_flight: this.inFlight }); }

  async read(principal: ReadScopePrincipal, workloadId: string, input: SelectedCurrentViewEdgeRead,
    operation: CurrentViewOperation, signal?: AbortSignal, native?: HeldNativeReadScopes): Promise<{ status: 200; body: Buffer }> {
    if (!["CURRENT", "HISTORY", "EXPORT"].includes(operation)) throw error("CURRENT_VIEW_EDGE_OPERATION_NOT_FINITE");
    let selected: SelectedCurrentViewEdgeRead, query: URLSearchParams;
    try {
      selected = structuredClone(input);
      if (!/^[A-Za-z0-9._-]{1,128}$/u.test(selected.resource) || selected.resource === "." || selected.resource === ".." ||
        selected.resource !== selected.authority.resource_ref) throw new Error();
      const q = selected.query;
      if (Object.keys(q).some(key => !["limit", "max_bytes", "entity_id", "from_ms", "to_ms", "cursor"].includes(key)) ||
        !positive(q.limit, Number.MAX_SAFE_INTEGER) || !positive(q.max_bytes, this.config.limits.response_bytes)) throw new Error();
      query = new URLSearchParams();
      for (const [key, value] of Object.entries(q)) {
        if (value === undefined) continue;
        if (key === "from_ms" || key === "to_ms") {
          if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > 8_640_000_000_000_000) throw new Error();
        } else if (key === "entity_id" || key === "cursor") {
          if (typeof value !== "string" || !value.length || Buffer.byteLength(value) > 4096 || /[\u0000-\u001f\u007f]/u.test(value)) throw new Error();
        }
        query.set(key, String(value));
      }
      if (q.from_ms !== undefined && q.to_ms !== undefined && q.from_ms >= q.to_ms || query.toString().length > 8192) throw new Error();
    } catch { throw error("CURRENT_VIEW_EDGE_INPUT_INVALID", 400); }
    if (this.inFlight >= this.config.limits.maximum_in_flight) throw error("CURRENT_VIEW_EDGE_BUSY");
    this.inFlight++;
    const controller = new AbortController(), until = performance.now() + this.config.limits.deadline_ms;
    const cancel = () => controller.abort(error("CURRENT_VIEW_EDGE_ABORTED", 499));
    const timer = setTimeout(() => controller.abort(error("CURRENT_VIEW_EDGE_DEADLINE", 504)), this.config.limits.deadline_ms);
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) cancel();
    const check = () => {
      if (performance.now() >= until) throw error("CURRENT_VIEW_EDGE_DEADLINE", 504);
      if (controller.signal.aborted) throw controller.signal.reason;
    };
    try {
      return await this.authority.withOriginalContext(principal, workloadId, selected.authority, operation, async context => {
        check();
        const binding = { original_context: context.original_context, workload_id: workloadId,
          resource_ref: selected.authority.resource_ref, operation };
        const decision = await this.authority.resolve(binding); check();
        const endpoint = operation === "CURRENT" ? "query" : operation === "HISTORY" ? "history" : "export";
        const held = await this.exchange(`/internal/v2/scoped/${selected.resource}/${endpoint}?${query}`, context.original_context,
          selected.query.max_bytes, controller.signal).then(body => ({ ok: true as const, body }), failure => ({ ok: false as const, failure }));
        // Return/throw ONLY after a fresh current-human/app/native fence. A
        // revoked actor must not learn even a held upstream error response.
        const final = await this.authority.deliver({ ...binding, decision_digest: decision.decision_digest }, async () => held);
        check();
        if (!final.ok) throw final.failure;
        return { status: 200 as const, body: final.body };
      }, native);
    } catch (failure) {
      if (failure instanceof CurrentViewEdgeClientError || failure instanceof CurrentViewAuthorityError || failure instanceof ExecutionReadScopeError) throw failure;
      throw error("CURRENT_VIEW_EDGE_UNAVAILABLE");
    } finally {
      clearTimeout(timer); signal?.removeEventListener("abort", cancel); this.inFlight--;
    }
  }

  private exchange(path: string, token: string, cap: number, signal: AbortSignal): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      let req: ClientRequest | undefined, res: IncomingMessage | undefined, socket: TLSSocket | undefined;
      let body: Buffer | undefined, failure: CurrentViewEdgeClientError | undefined, sent = false;
      const chunks: Buffer[] = [];
      const stop = (why = error("CURRENT_VIEW_EDGE_UNAVAILABLE")) => {
        failure ??= why; res?.destroy(); req?.destroy(); socket?.destroy();
        if (!req) { signal.removeEventListener("abort", cancel); reject(failure); }
      };
      const cancel = () => stop(signal.reason instanceof CurrentViewEdgeClientError ? signal.reason : error("CURRENT_VIEW_EDGE_ABORTED", 499));
      signal.addEventListener("abort", cancel, { once: true });
      try {
        if (signal.aborted) { cancel(); return; }
        const options: RequestOptions = { ...this.config.tls, method: "GET", agent: false, servername: this.config.peer.dns_name,
          minVersion: "TLSv1.3", maxVersion: "TLSv1.3", rejectUnauthorized: true, maxHeaderSize: 8192,
          checkServerIdentity: (_host, cert) => {
            if (!cert.raw || `sha256:${createHash("sha256").update(cert.raw).digest("hex")}` !== this.config.peer.certificate_sha256 ||
              new X509Certificate(cert.raw).checkHost(this.config.peer.dns_name, { subject: "never", wildcards: false }) !== this.config.peer.dns_name)
              return new Error("CURRENT_VIEW_EDGE_PEER_INVALID");
          }, headers: { authorization: `Bearer ${token}`, accept: "application/json", connection: "close" } };
        req = request(new URL(path, this.config.origin), options, response => {
          res = response; res.on("error", () => stop()); res.on("aborted", () => stop());
          const length = res.headers["content-length"];
          if (!sent || res.statusCode !== 200 || res.httpVersion !== "1.1" || res.headers["content-encoding"] !== undefined ||
            res.headers["transfer-encoding"] !== undefined || res.headers["content-type"] !== "application/json" ||
            typeof length !== "string" || !/^[1-9][0-9]*$/u.test(length) || !positive(Number(length), cap)) { stop(); return; }
          let size = 0;
          res.on("data", (chunk: Buffer) => {
            size += chunk.length;
            if (failure || size > Number(length) || size > cap) { stop(); return; }
            chunks.push(Buffer.from(chunk));
          });
          res.once("end", () => {
            if (failure || !res?.complete || size !== Number(length)) { stop(); return; }
            try { const bytes = Buffer.concat(chunks, size); JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); body = bytes; }
            catch { stop(); }
            finally { chunks.length = 0; }
          });
        });
        req.on("error", () => stop());
        req.once("close", () => {
          signal.removeEventListener("abort", cancel); chunks.length = 0;
          if (failure || !body) reject(failure ?? error("CURRENT_VIEW_EDGE_UNAVAILABLE")); else resolve(body);
        });
        req.once("socket", candidate => {
          if (!(candidate instanceof TLSSocket)) { stop(); return; }
          socket = candidate;
          socket.once("secureConnect", () => {
            if (signal.aborted) { cancel(); return; }
            const cert = socket!.getPeerCertificate();
            if (!socket!.authorized || socket!.getProtocol() !== "TLSv1.3" || !cert.raw ||
              `sha256:${createHash("sha256").update(cert.raw).digest("hex")}` !== this.config.peer.certificate_sha256 ||
              new X509Certificate(cert.raw).checkHost(this.config.peer.dns_name, { subject: "never", wildcards: false }) !== this.config.peer.dns_name) { stop(); return; }
            sent = true; req!.end();
          });
        });
        // Deliberately no write/end/flushHeaders before the actual TLS gate.
      } catch { stop(); }
    });
  }
}
