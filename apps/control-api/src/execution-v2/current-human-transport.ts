import { createHash } from "node:crypto";
import { createServer, type Server, type ServerOptions } from "node:https";
import type { IncomingMessage, ServerResponse } from "node:http";
import { TLSSocket } from "node:tls";
import { z } from "zod";
import { CurrentHumanCandidate, CurrentHumanLeaseError } from "./current-human-candidate";
import { parseCurrentHumanWire } from "./current-human-wire";

/** Private transport only. This module does not listen, create trust material,
 * register a public route, accept forwarded-certificate headers or issue human
 * credentials. Its installer must supply the exact approved workload leaf pin
 * independently of the source assertion signing key. */
export interface CurrentHumanTransportConfig {
  tls: Pick<ServerOptions, "key" | "cert" | "ca">;
  source_certificate_sha256: string;
  limits: { maximum_in_flight: number; request_bytes: number; deadline_ms: number };
}

const token = z.string().min(1).max(8192);
const enterBody = z.object({ schema_version: z.literal("pma.current-human-enter.v1"),
  human_token: token, source_assertion: token }).strict();
const resolveBody = z.object({ schema_version: z.literal("pma.current-human-resolve.v1"),
  source_assertion: token }).strict();
const fingerprint = /^sha256:[a-f0-9]{64}$/;
type TransportState = { in_flight: number; accepted: number; denied: number; timed_out: number };

/** Return an UNBOUND real HTTPS server; explicit private/cell allocation owns
 * listen/close. The quota counts the underlying DB operation until completion,
 * even after its HTTP deadline/peer disconnect. Lost ACK is NOT rollback. */
export function createCurrentHumanTransport(candidate: CurrentHumanCandidate, input: CurrentHumanTransportConfig): {
  server: Server; snapshot(): Readonly<TransportState>;
} {
  const pin = input.source_certificate_sha256;
  const limits = { ...input.limits };
  if (!fingerprint.test(pin) || !input.tls.key || !input.tls.cert || !input.tls.ca
    || !Number.isSafeInteger(limits.maximum_in_flight) || limits.maximum_in_flight < 1 || limits.maximum_in_flight > 16
    || !Number.isSafeInteger(limits.request_bytes) || limits.request_bytes < 256 || limits.request_bytes > 32768
    || !Number.isSafeInteger(limits.deadline_ms) || limits.deadline_ms < 1 || limits.deadline_ms > 10000)
    throw new CurrentHumanLeaseError("CURRENT_HUMAN_TRANSPORT_CONFIG_INVALID");
  const state: TransportState = { in_flight: 0, accepted: 0, denied: 0, timed_out: 0 };
  const reply = (res: ServerResponse, status: number, body: unknown) => {
    if (res.destroyed || res.writableEnded) return;
    res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store",
      "x-content-type-options": "nosniff", "connection": "close" });
    res.end(JSON.stringify(body));
  };
  const problem = (res: ServerResponse, status: number, code: string) => reply(res, status, {
    schema_version: "pma.current-human-transport-error.v1", code,
  });
  const socketAllowed = (socket: IncomingMessage["socket"]) => {
    if (!(socket instanceof TLSSocket) || !socket.authorized || socket.getProtocol() !== "TLSv1.3") return false;
    const cert = socket.getPeerCertificate();
    return cert.raw && `sha256:${createHash("sha256").update(cert.raw).digest("hex")}` === pin;
  };
  const server = createServer({ ...input.tls, minVersion: "TLSv1.3", maxVersion: "TLSv1.3",
    requestCert: true, rejectUnauthorized: true, ALPNProtocols: ["http/1.1"], handshakeTimeout: limits.deadline_ms,
  }, (req, res) => {
    if (!socketAllowed(req.socket)) { state.denied++; problem(res, 403, "CURRENT_HUMAN_WORKLOAD_NOT_AUTHENTICATED"); return; }
    const kind = req.url === "/internal/elp210/current-human/enter" ? "ENTER"
      : req.url === "/internal/elp210/current-human/resolve" ? "RESOLVE" : null;
    if (!kind || req.method !== "POST") { state.denied++; problem(res, 404, "CURRENT_HUMAN_ROUTE_NOT_FOUND"); return; }
    if (state.in_flight >= limits.maximum_in_flight) { state.denied++; problem(res, 503, "CURRENT_HUMAN_TRANSPORT_BUSY"); return; }
    if (req.headers["content-type"] !== "application/json" || req.headers["content-encoding"] !== undefined
      || req.headers["transfer-encoding"] !== undefined || !/^\d+$/.test(String(req.headers["content-length"] ?? ""))) {
      state.denied++; problem(res, 400, "CURRENT_HUMAN_REQUEST_INVALID"); return;
    }
    const length = Number(req.headers["content-length"]);
    if (!Number.isSafeInteger(length) || length > limits.request_bytes) {
      state.denied++; problem(res, 413, "CURRENT_HUMAN_REQUEST_BYTE_LIMIT"); return;
    }
    if (length < 2) {
      state.denied++; problem(res, 400, "CURRENT_HUMAN_REQUEST_INVALID"); return;
    }
    state.in_flight++;
    let operationStarted = false, finished = false, bytes = 0;
    const chunks: Buffer[] = [];
    const finish = () => {
      if (finished) return;
      finished = true; clearTimeout(deadline); state.in_flight--;
    };
    const deadline = setTimeout(() => {
      state.timed_out++;
      problem(res, 504, "CURRENT_HUMAN_TRANSPORT_OUTCOME_UNCERTAIN");
      if (!operationStarted) { req.destroy(); finish(); }
      // No cancellation/TTL guesses about a started ENTER/terminal commit.
    }, limits.deadline_ms);
    req.on("error", () => { if (!operationStarted) finish(); });
    req.on("aborted", () => { if (!operationStarted) finish(); });
    req.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > limits.request_bytes || bytes > length) {
        state.denied++; problem(res, 413, "CURRENT_HUMAN_REQUEST_BYTE_LIMIT"); req.destroy(); finish();
      } else chunks.push(chunk);
    });
    req.on("end", async () => {
      if (finished) return;
      if (bytes !== length) { state.denied++; problem(res, 400, "CURRENT_HUMAN_REQUEST_INVALID"); finish(); return; }
      let body: unknown;
      try { body = parseCurrentHumanWire(Buffer.concat(chunks)); }
      catch { state.denied++; problem(res, 400, "CURRENT_HUMAN_REQUEST_INVALID"); finish(); return; }
      chunks.length = 0;
      try {
        // Parse BEFORE entering; malformed peers never create a Core lease.
        if (kind === "ENTER") {
          const parsed = enterBody.parse(body);
          operationStarted = true;
          const acknowledgement = await candidate.enter(parsed.human_token, parsed.source_assertion);
          state.accepted++;
          reply(res, 200, { schema_version: "pma.current-human-enter-ack.v1", ...acknowledgement });
        } else {
          const parsed = resolveBody.parse(body);
          operationStarted = true;
          const acknowledgement = await candidate.resolve(parsed.source_assertion);
          state.accepted++; reply(res, 200, acknowledgement);
        }
      } catch (error) {
        state.denied++;
        if (error instanceof z.ZodError) problem(res, 400, "CURRENT_HUMAN_REQUEST_INVALID");
        else if (error instanceof CurrentHumanLeaseError) problem(res, 409, error.code);
        else problem(res, 503, "CURRENT_HUMAN_AUTHORITY_UNAVAILABLE");
      } finally { finish(); }
    });
  });
  server.requestTimeout = limits.deadline_ms;
  // Prepend ahead of HTTPS's HTTP parser setup: a CA-valid but foreign leaf
  // is disconnected before it becomes an application request, not after body
  // parsing. Never substitute a forwarded certificate header for this socket.
  server.prependListener("secureConnection", socket => {
    if (!socketAllowed(socket)) { state.denied++; socket.destroy(); }
  });
  server.headersTimeout = limits.deadline_ms;
  server.keepAliveTimeout = 1;
  server.maxRequestsPerSocket = 1;
  server.maxConnections = limits.maximum_in_flight * 2;
  server.on("clientError", (_error, socket) => socket.destroy());
  return { server, snapshot: () => Object.freeze({ ...state }) };
}
