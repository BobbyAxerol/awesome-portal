import { createHash, X509Certificate } from "node:crypto";
import { createServer, type ServerOptions } from "node:https";
import { type IncomingMessage, type ServerResponse } from "node:http";
import { TLSSocket } from "node:tls";
import { performance } from "node:perf_hooks";
import { z } from "zod";
import { CurrentViewAuthority, CurrentViewAuthorityError } from "./current-view-authority";
import { currentViewDecision, parseCurrentViewRequest } from "./current-view-wire";

export interface CurrentViewTransportConfig {
  tls: Pick<ServerOptions, "key" | "cert" | "ca">;
  /** Exact authenticated Edge machine, NOT current human authority. */
  peer: { certificate_sha256: string; dns_name: string; workload_id: string };
  limits: { maximum_in_flight: number; request_bytes: number; response_bytes: number; deadline_ms: number };
}

/** Creates a real but UNBOUND private mTLS server. Installation owns the
 * explicit listener and environment pins. No default CA, trust generation,
 * public route, human-token issue or runtime flag is introduced here. */
export function createCurrentViewTransport(authority: Pick<CurrentViewAuthority, "resolve" | "recheck">,
  input: CurrentViewTransportConfig) {
  const peer = { ...input.peer }, limits = { ...input.limits };
  const bounded = (n: number, min: number, max: number) => Number.isSafeInteger(n) && n >= min && n <= max;
  if (!/^sha256:[a-f0-9]{64}$/u.test(peer.certificate_sha256) ||
    !/^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/u.test(peer.dns_name) ||
    !peer.workload_id || peer.workload_id.length > 256 || /[\u0000-\u001f\u007f]/u.test(peer.workload_id) ||
    !input.tls.key || !input.tls.cert || !input.tls.ca ||
    !bounded(limits.maximum_in_flight, 1, 16) || !bounded(limits.request_bytes, 256, 8192) ||
    !bounded(limits.response_bytes, 256, 65536) || !bounded(limits.deadline_ms, 1, 5000))
    throw new Error("CURRENT_VIEW_TRANSPORT_CONFIG_INVALID");
  const state = { in_flight: 0, accepted: 0, denied: 0, timed_out: 0 };
  const reply = (res: ServerResponse, status: number, json: string) => {
    if (res.destroyed || res.writableEnded) return;
    res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(json),
      "cache-control": "no-store", "x-content-type-options": "nosniff", connection: "close" });
    res.end(json);
  };
  const problem = (res: ServerResponse, status: number, code: string) => reply(res, status,
    JSON.stringify({ schema_version: "portal.execution.current-view-error.v1", code }));
  const permitted = (socket: IncomingMessage["socket"]) => {
    if (!(socket instanceof TLSSocket) || !socket.authorized || socket.getProtocol() !== "TLSv1.3") return false;
    const cert = socket.getPeerCertificate();
    if (!cert.raw || `sha256:${createHash("sha256").update(cert.raw).digest("hex")}` !== peer.certificate_sha256) return false;
    // SAN only: a matching subject CN or forwarded header is not a workload.
    return new X509Certificate(cert.raw).checkHost(peer.dns_name, { subject: "never", wildcards: false }) === peer.dns_name;
  };
  const server = createServer({ ...input.tls, requestCert: true, rejectUnauthorized: true,
    minVersion: "TLSv1.3", maxVersion: "TLSv1.3", ALPNProtocols: ["http/1.1"], handshakeTimeout: limits.deadline_ms,
  }, (req, res) => {
    if (!permitted(req.socket)) { state.denied++; problem(res, 403, "CURRENT_VIEW_WORKLOAD_NOT_AUTHENTICATED"); return; }
    const kind = req.url === "/internal/elp210/current-view/resolve" ? "RESOLVE"
      : req.url === "/internal/elp210/current-view/recheck" ? "RECHECK" : null;
    if (!kind || req.method !== "POST") { state.denied++; problem(res, 404, "CURRENT_VIEW_ROUTE_NOT_FOUND"); return; }
    if (state.in_flight >= limits.maximum_in_flight) { state.denied++; problem(res, 503, "CURRENT_VIEW_TRANSPORT_BUSY"); return; }
    const length = Number(req.headers["content-length"]);
    if (req.headers["content-type"] !== "application/json" || req.headers["content-encoding"] !== undefined ||
      req.headers["transfer-encoding"] !== undefined || !/^[0-9]+$/u.test(String(req.headers["content-length"] ?? "")) ||
      !Number.isSafeInteger(length) || length < 2) {
      state.denied++; problem(res, 400, "CURRENT_VIEW_REQUEST_INVALID"); return;
    }
    if (length > limits.request_bytes) { state.denied++; problem(res, 413, "CURRENT_VIEW_REQUEST_BYTE_LIMIT"); return; }
    state.in_flight++;
    const deadlineAt = performance.now() + limits.deadline_ms;
    let started = false, finished = false, timedOut = false, bytes = 0;
    const chunks: Buffer[] = [];
    const finish = () => { if (!finished) { finished = true; clearTimeout(deadline); state.in_flight--; } };
    const deadline = setTimeout(() => {
      timedOut = true; state.timed_out++; problem(res, 504, "CURRENT_VIEW_TRANSPORT_DEADLINE");
      if (!started) { req.destroy(); finish(); }
      // A timeout does NOT release capacity while DB authority work remains.
    }, limits.deadline_ms);
    req.on("error", () => { if (!started) finish(); });
    req.on("aborted", () => { if (!started) finish(); });
    req.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > length || bytes > limits.request_bytes) {
        state.denied++; problem(res, 413, "CURRENT_VIEW_REQUEST_BYTE_LIMIT"); req.destroy(); finish();
      } else chunks.push(chunk);
    });
    req.on("end", async () => {
      if (finished) return;
      try {
        if (bytes !== length) throw new Error("INVALID_BYTES");
        const parsed = parseCurrentViewRequest(Buffer.concat(chunks), kind);
        chunks.length = 0;
        if (parsed.workload_id !== peer.workload_id) {
          state.denied++; problem(res, 403, "CURRENT_VIEW_WORKLOAD_NOT_AUTHENTICATED"); return;
        }
        started = true;
        const decision = parsed.schema_version === "portal.execution.current-view-recheck.v1"
          ? await authority.recheck(parsed) : await authority.resolve(parsed);
        if (timedOut || res.destroyed) return;
        const output = currentViewDecision.safeParse(decision);
        if (!output.success) { state.denied++; problem(res, 503, "CURRENT_VIEW_RESPONSE_INVALID"); return; }
        const json = JSON.stringify(output.data);
        if (Buffer.byteLength(json) > limits.response_bytes) {
          state.denied++; problem(res, 503, "CURRENT_VIEW_RESPONSE_INVALID"); return;
        }
        // Timers cannot preempt a busy event loop or a microtask chain. A
        // delayed DB/serialize continuation must not win the race with timer.
        if (performance.now() >= deadlineAt) {
          if (!timedOut) { timedOut = true; state.timed_out++; }
          problem(res, 504, "CURRENT_VIEW_TRANSPORT_DEADLINE"); return;
        }
        if (output.data.expires_at_ms <= Date.now()) {
          state.denied++; problem(res, 409, "CURRENT_VIEW_CONTEXT_EXPIRED"); return;
        }
        state.accepted++; reply(res, 200, json);
      } catch (error) {
        state.denied++;
        if (error instanceof CurrentViewAuthorityError) problem(res, error.status, error.code);
        else if (!started || error instanceof z.ZodError) problem(res, 400, "CURRENT_VIEW_REQUEST_INVALID");
        else problem(res, 503, "CURRENT_VIEW_AUTHORITY_UNAVAILABLE");
      } finally { chunks.length = 0; finish(); }
    });
  });
  server.prependListener("secureConnection", socket => { if (!permitted(socket)) { state.denied++; socket.destroy(); } });
  server.requestTimeout = limits.deadline_ms;
  server.headersTimeout = limits.deadline_ms;
  server.keepAliveTimeout = 1;
  server.maxRequestsPerSocket = 1;
  server.maxConnections = limits.maximum_in_flight * 2;
  server.on("clientError", (_error, socket) => socket.destroy());
  return { server, snapshot: () => Object.freeze({ ...state }) };
}
