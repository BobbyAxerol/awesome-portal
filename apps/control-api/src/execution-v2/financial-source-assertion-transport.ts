import { createHash, X509Certificate } from "node:crypto";
import { createServer, type ServerOptions } from "node:https";
import type { IncomingMessage, ServerResponse } from "node:http";
import { TLSSocket } from "node:tls";
import { performance } from "node:perf_hooks";
import { z } from "zod";
import {
  FinancialSourceAssertionAuthority, FinancialSourceAssertionError,
  financialSourceAssertionRequest, financialSourceAssertionResponse,
  financialSourceAssertionCompletionRequest, financialSourceAssertionCompletionResponse,
  type FinancialSourceAssertionRequest,type FinancialSourceAssertionResponse,
} from "./financial-source-assertion";
import { parseCompactJson } from "./private-root-file";

export interface FinancialSourceAssertionTransportConfig {
  tls: Pick<ServerOptions, "key" | "cert" | "ca">;
  /** Exact authenticated Edge workload. This is NOT a financial/human grant. */
  peer: { certificate_sha256: string; dns_name: string; workload_id: string };
  limits: { maximum_in_flight: number; request_bytes: number; response_bytes: number; deadline_ms: number };
}

/** Private, initially UNBOUND TLS1.3/mTLS transport. The installation owns its
 * listener and pins. No public route, grant, source receipt, runtime default or
 * cancellation of pending authority/DB work is introduced by construction. */
export function createFinancialSourceAssertionTransport(
  authority: Pick<FinancialSourceAssertionAuthority, "issue" | "complete">, input: FinancialSourceAssertionTransportConfig,
) {
  return buildTransport(authority,input);
}

/** Disposable test-only seam; not a qualified C2 runtime or source authority.
 * Production composition remains blocked until it makes the qualified custody
 * writer the sole assertion egress path. */
export function createFinancialSourceAssertionTestCustodyTransport(
  authority:Pick<FinancialSourceAssertionAuthority,"issue"|"complete">,input:FinancialSourceAssertionTransportConfig,
  delivery:(context:string,request:FinancialSourceAssertionRequest,output:FinancialSourceAssertionResponse,
    response:ServerResponse,remainingMs:number)=>Promise<void>,
) {
  if(typeof delivery!=="function")throw new Error("FINANCIAL_SOURCE_ASSERTION_TRANSPORT_CONFIG_INVALID");
  return buildTransport(authority,input,delivery);
}

function buildTransport(authority:Pick<FinancialSourceAssertionAuthority,"issue"|"complete">,
  input:FinancialSourceAssertionTransportConfig,
  testDelivery?:(context:string,request:FinancialSourceAssertionRequest,output:FinancialSourceAssertionResponse,
    response:ServerResponse,remainingMs:number)=>Promise<void>) {
  const peer = { ...input.peer }, limits = { ...input.limits };
  const bounded = (n: number, min: number, max: number) => Number.isSafeInteger(n) && n >= min && n <= max;
  if (!/^sha256:[a-f0-9]{64}$/u.test(peer.certificate_sha256) ||
    !/^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/u.test(peer.dns_name) ||
    !peer.workload_id || peer.workload_id.length > 256 || /[\u0000-\u001f\u007f]/u.test(peer.workload_id) ||
    !input.tls.key || !input.tls.cert || !input.tls.ca ||
    !bounded(limits.maximum_in_flight, 1, 16) || !bounded(limits.request_bytes, 256, 2_129_920) ||
    !bounded(limits.response_bytes, 256, 65_536) || !bounded(limits.deadline_ms, 1, 5000))
    throw new Error("FINANCIAL_SOURCE_ASSERTION_TRANSPORT_CONFIG_INVALID");
  const state = { in_flight: 0, accepted: 0, denied: 0, timed_out: 0 };
  const headerDeadlines = new WeakMap<IncomingMessage["socket"], { until: number; timer: ReturnType<typeof setTimeout> }>();
  const takeHeaderDeadline = (socket: IncomingMessage["socket"]) => {
    const deadline = headerDeadlines.get(socket);
    if (deadline) { clearTimeout(deadline.timer); headerDeadlines.delete(socket); }
    return deadline;
  };
  const reply = (res: ServerResponse, status: number, json: string) => {
    if (res.destroyed || res.writableEnded) return;
    if (res.headersSent) {res.destroy();return;}
    res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(json),
      "cache-control": "no-store", vary: "Authorization", "x-content-type-options": "nosniff", connection: "close" });
    res.end(json);
  };
  const problem = (res: ServerResponse, status: number, code: string) => reply(res, status,
    JSON.stringify({ schema_version: "portal.execution.financial-source-assertion-error.v1", code,
      message: "The private financial source assertion is unavailable." }));
  const permitted = (socket: IncomingMessage["socket"]) => {
    if (!(socket instanceof TLSSocket) || !socket.authorized || socket.getProtocol() !== "TLSv1.3") return false;
    const cert = socket.getPeerCertificate();
    if (!cert.raw || `sha256:${createHash("sha256").update(cert.raw).digest("hex")}` !== peer.certificate_sha256) return false;
    return new X509Certificate(cert.raw).checkHost(peer.dns_name, { subject: "never", wildcards: false }) === peer.dns_name;
  };
  const server = createServer({ ...input.tls, requestCert: true, rejectUnauthorized: true,
    minVersion: "TLSv1.3", maxVersion: "TLSv1.3", ALPNProtocols: ["http/1.1"], handshakeTimeout: limits.deadline_ms,
  }, (req, res) => {
    const headerDeadline = takeHeaderDeadline(req.socket);
    if (headerDeadline && performance.now() >= headerDeadline.until) {
      state.timed_out++; req.socket.destroy(); return;
    }
    if (!permitted(req.socket)) { state.denied++; problem(res, 403, "FINANCIAL_SOURCE_ASSERTION_WORKLOAD_NOT_AUTHENTICATED"); return; }
    const completion = req.url === "/internal/elp210/financial-source/complete";
    if ((!completion && req.url !== "/internal/elp210/financial-source/assertion") || req.method !== "POST") {
      state.denied++; problem(res, 404, "FINANCIAL_SOURCE_ASSERTION_ROUTE_NOT_FOUND"); return;
    }
    const headerNames = req.rawHeaders.filter((_value, index) => index % 2 === 0).map(value => value.toLowerCase());
    const forwarded = headerNames.some(name => name === "forwarded" || name.startsWith("x-forwarded-") ||
      name === "x-real-ip" || name === "x-client-cert" || name.startsWith("x-ssl-client-") || name.startsWith("ssl-client-"));
    const token = typeof req.headers.authorization === "string" ? /^Bearer ([A-Za-z0-9_-]{43})$/u.exec(req.headers.authorization)?.[1] : undefined;
    if (forwarded || headerNames.filter(name => name === "authorization").length !== 1 || !token) {
      state.denied++; problem(res, 403, "FINANCIAL_SOURCE_ASSERTION_CONTEXT_REQUIRED"); return;
    }
    if (state.in_flight >= limits.maximum_in_flight) { state.denied++; problem(res, 503, "FINANCIAL_SOURCE_ASSERTION_TRANSPORT_BUSY"); return; }
    const length = Number(req.headers["content-length"]);
    if (req.headers["content-type"] !== "application/json" || req.headers["content-encoding"] !== undefined ||
      req.headers["transfer-encoding"] !== undefined || !/^[0-9]+$/u.test(String(req.headers["content-length"] ?? "")) ||
      ["content-type", "content-length"].some(name => headerNames.filter(value => value === name).length !== 1) ||
      !Number.isSafeInteger(length) || length < 2) {
      state.denied++; problem(res, 400, "FINANCIAL_SOURCE_ASSERTION_REQUEST_INVALID"); return;
    }
    if (length > limits.request_bytes) { state.denied++; problem(res, 413, "FINANCIAL_SOURCE_ASSERTION_REQUEST_BYTE_LIMIT"); return; }
    state.in_flight++;
    const deadlineAt = headerDeadline?.until ?? performance.now() + limits.deadline_ms;
    let started = false, finished = false, timedOut = false, custodySending = false, bytes = 0;
    const chunks: Buffer[] = [];
    const finish = () => { if (!finished) { finished = true; clearTimeout(deadline); chunks.length = 0; state.in_flight--; } };
    const timeout = () => {
      if (!timedOut) { timedOut = true; state.timed_out++; }
      if(custodySending)res.destroy();
      else problem(res, 504, "FINANCIAL_SOURCE_ASSERTION_TRANSPORT_DEADLINE");
      if (!started) { req.destroy(); finish(); }
      // Pending issue/DB capacity remains owned until the REAL promise settles.
    };
    const deadline = setTimeout(timeout, Math.max(0, deadlineAt - performance.now()));
    req.on("error", () => { if (!started) finish(); });
    req.on("aborted", () => { if (!started) finish(); });
    res.once("close", () => { if (!started) finish(); });
    req.on("data", (chunk: Buffer) => {
      if (finished) return;
      bytes += chunk.length;
      if (bytes > length || bytes > limits.request_bytes) {
        state.denied++; problem(res, 413, "FINANCIAL_SOURCE_ASSERTION_REQUEST_BYTE_LIMIT"); req.destroy(); finish();
      } else chunks.push(chunk);
    });
    req.on("end", async () => {
      if (finished) return;
      try {
        if (bytes !== length) throw new Error("INVALID_BYTES");
        const raw = parseCompactJson(Buffer.concat(chunks, bytes));
        chunks.length = 0;
        const parsed = completion ? financialSourceAssertionCompletionRequest.parse(raw) : financialSourceAssertionRequest.parse(raw);
        if (parsed.workload_id !== peer.workload_id) {
          state.denied++; problem(res, 403, "FINANCIAL_SOURCE_ASSERTION_WORKLOAD_NOT_AUTHENTICATED"); return;
        }
        if (performance.now() >= deadlineAt) { timeout(); return; }
        started = true;
        // Completion is a separate authenticated delivery acknowledgement.
        // An ISSUE response, timeout or socket close never calls it implicitly.
        const result = completion ? await authority.complete(token, parsed) : await authority.issue(token, parsed);
        if (timedOut || res.destroyed) return;
        const output = completion ? financialSourceAssertionCompletionResponse.parse(result) : financialSourceAssertionResponse.parse(result);
        const same = completion ? (() => {
          const request = financialSourceAssertionCompletionRequest.parse(parsed);
          const response = financialSourceAssertionCompletionResponse.parse(output);
          return response.delivery_sequence === request.delivery_sequence && response.lease_id === request.lease_id &&
            response.request_digest === request.request_digest && response.response_digest === request.response_digest;
        })() : (() => {
          const request = financialSourceAssertionRequest.parse(parsed);
          const response = financialSourceAssertionResponse.parse(output);
          return response.workload_id === peer.workload_id && response.binding_digest === request.binding_digest &&
            response.receiver_id === request.receiver_id && response.method === request.method && response.path === request.path &&
            response.request_digest === request.request_digest && response.delivery_sequence === request.delivery_sequence &&
            response.previous_lease_id === request.previous_lease_id;
        })();
        if (!same) {
          state.denied++; problem(res, 503, "FINANCIAL_SOURCE_ASSERTION_RESPONSE_INVALID"); return;
        }
        const json = JSON.stringify(output);
        if (Buffer.byteLength(json) > limits.response_bytes) {
          state.denied++; problem(res, 503, "FINANCIAL_SOURCE_ASSERTION_RESPONSE_INVALID"); return;
        }
        if (performance.now() >= deadlineAt) { timeout(); return; }
        if (!completion && financialSourceAssertionResponse.parse(output).expires_at_ms <= Date.now()) {
          state.denied++; problem(res, 409, "FINANCIAL_SOURCE_ASSERTION_CONTEXT_EXPIRED"); return;
        }
        if(!completion && testDelivery) {
          custodySending=true;
          await testDelivery(token,financialSourceAssertionRequest.parse(parsed),financialSourceAssertionResponse.parse(output),res,
            Math.max(1,Math.floor(deadlineAt-performance.now())));
          custodySending=false;
          if(timedOut)return;
          if(!res.writableFinished) {
            if(res.destroyed)return;
            throw new Error("FINANCIAL_SOURCE_ASSERTION_CUSTODY_INCOMPLETE");
          }
          state.accepted++;return;
        }
        state.accepted++; reply(res, 200, json);
      } catch (error) {
        if (timedOut || res.destroyed) return;
        state.denied++;
        if (error instanceof FinancialSourceAssertionError) problem(res, error.status, error.code);
        else if (!started) problem(res, 400, "FINANCIAL_SOURCE_ASSERTION_REQUEST_INVALID");
        else if (error instanceof z.ZodError) problem(res, 503, "FINANCIAL_SOURCE_ASSERTION_RESPONSE_INVALID");
        else problem(res, 503, "FINANCIAL_SOURCE_ASSERTION_AUTHORITY_UNAVAILABLE");
      } finally { finish(); }
    });
  });
  server.prependListener("secureConnection", socket => {
    if (!permitted(socket)) { state.denied++; socket.destroy(); return; }
    const until = performance.now() + limits.deadline_ms;
    const timer = setTimeout(() => {
      headerDeadlines.delete(socket); state.timed_out++; socket.destroy();
    }, limits.deadline_ms);
    timer.unref(); headerDeadlines.set(socket, { until, timer });
    socket.once("close", () => { takeHeaderDeadline(socket); });
  });
  server.requestTimeout = limits.deadline_ms;
  server.headersTimeout = limits.deadline_ms;
  server.keepAliveTimeout = 1;
  server.maxRequestsPerSocket = 1;
  server.maxConnections = limits.maximum_in_flight * 2;
  server.on("clientError", (_error, socket) => socket.destroy());
  return { server, snapshot: () => Object.freeze({ ...state }) };
}
