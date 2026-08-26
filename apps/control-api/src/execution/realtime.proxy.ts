import { readFile } from "node:fs/promises";
import {
  ClientHttp2Session,
  ClientHttp2Stream,
  constants,
  connect,
} from "node:http2";
import { OnApplicationShutdown } from "@nestjs/common";
import { ControlApiConfig } from "../config";
import { AuthSession, PortalUser } from "../domain";
import { ExecutionDelegationService } from "./delegation";

const CURSOR_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}:[0-9]+$/i;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const COMMAND_CENTER_RESOURCE = "execution:command-center";
const REALTIME_SNAPSHOT_MAX_BYTES = 64 * 1024;

export interface RealtimePrincipal {
  user: PortalUser;
  session: AuthSession;
  workspaceId: string;
}

export interface RealtimeOpenRequest extends RealtimePrincipal {
  lastEventId?: string;
  snapshotCursor?: string;
}

export interface RealtimeUpstream {
  stream: ClientHttp2Stream;
  status: number;
  contentType: string;
}

export interface RealtimeSnapshotResponse {
  schema_version: "execution.realtime-snapshot.v1";
  delivery_profile: "shadow";
  workspace_id: string;
  environment: string;
  projection_epoch: string;
  projection_sequence: number;
  cursor: string;
  stream_available: true;
  resnapshot_not_before: string | null;
  capability_snapshot_id: string;
  activation_manifest_digest: string;
}

/**
 * Selects the resume cursor for a same-origin EventSource stream.
 *
 * Native EventSource reconnects reuse the original URL and add the latest
 * delivered event ID as `Last-Event-ID`. The header therefore takes precedence
 * over a stale snapshot cursor retained in that URL.
 */
export function resolveResumeCursor(
  lastEventId: string | undefined,
  snapshotCursor: string | undefined,
): string {
  if (!lastEventId && !snapshotCursor) {
    throw new RealtimeProxyError("REALTIME_CURSOR_AMBIGUOUS", 400);
  }
  const cursor = lastEventId ?? snapshotCursor!;
  if (!CURSOR_PATTERN.test(cursor) || Buffer.byteLength(cursor, "utf8") > 80) {
    throw new RealtimeProxyError("REALTIME_CURSOR_INVALID", 400);
  }
  return cursor;
}

/**
 * Same-origin SSE bridge. One reusable mTLS HTTP/2 session multiplexes browser
 * streams to the private Rust edge; short-lived delegated JWTs never cross the
 * server boundary. The Rust stream closes before token expiry, forcing the
 * browser reconnect through SessionGuard so revocation is re-evaluated.
 */
export class ExecutionRealtimeProxy implements OnApplicationShutdown {
  private session: ClientHttp2Session | null = null;
  private connecting: Promise<ClientHttp2Session> | null = null;
  private readonly activeBySession = new Map<string, number>();
  private activeStreams = 0;

  private constructor(
    private readonly config: ControlApiConfig,
    private readonly delegation: ExecutionDelegationService | null,
    private readonly tls: { ca: Buffer; cert: Buffer; key: Buffer } | null,
  ) {}

  static async create(config: ControlApiConfig): Promise<ExecutionRealtimeProxy> {
    if (config.FEATURE_EXECUTION_REALTIME_SSE !== "true") {
      return new ExecutionRealtimeProxy(config, null, null);
    }
    const [delegation, ca, cert, key] = await Promise.all([
      ExecutionDelegationService.fromPrivateKeyFile({
        issuer: config.EXECUTION_EDGE_DELEGATION_ISSUER,
        audience: config.EXECUTION_EDGE_DELEGATION_AUDIENCE,
        keyId: config.EXECUTION_EDGE_KEY_ID,
        privateKeyFile: config.EXECUTION_EDGE_PRIVATE_KEY_FILE!,
        ttlSeconds: config.EXECUTION_EDGE_DELEGATION_TTL_SECONDS,
        environment: config.EXECUTION_EDGE_ENVIRONMENT,
      }),
      readFile(config.EXECUTION_EDGE_CA_FILE!),
      readFile(config.EXECUTION_EDGE_CLIENT_CERT_FILE!),
      readFile(config.EXECUTION_EDGE_CLIENT_KEY_FILE!),
    ]);
    return new ExecutionRealtimeProxy(config, delegation, { ca, cert, key });
  }

  enabled(): boolean {
    return this.config.FEATURE_EXECUTION_REALTIME_SSE === "true";
  }

  async open(request: RealtimeOpenRequest): Promise<RealtimeUpstream> {
    if (!this.delegation || !this.tls) {
      throw new RealtimeProxyError("REALTIME_DISABLED", 404);
    }
    const cursor = resolveResumeCursor(request.lastEventId, request.snapshotCursor);
    const release = this.reserveStream(request.session.sessionId);
    try {
      const assertion = await this.delegation.issueReadAssertion({
        principalId: request.user.userId,
        sessionId: request.session.sessionId,
        workspaceId: request.workspaceId,
        roles: [request.user.role],
        resources: [COMMAND_CENTER_RESOURCE],
        authenticationTime: request.session.authenticationTime,
        authenticationMethods: ["portal_session"],
      });
      const session = await this.getSession();
      const headers: Record<string, string> = {
        ":method": "GET",
        ":path": "/internal/v1/realtime/stream",
        accept: "text/event-stream",
        authorization: `Bearer ${assertion}`,
        "cache-control": "no-cache",
      };
      if (request.lastEventId) headers["last-event-id"] = cursor;
      else headers["x-projection-cursor"] = cursor;
      const stream = session.request(headers, { endStream: true });
      const upstream = await new Promise<RealtimeUpstream>((resolve, reject) => {
        const timeout = setTimeout(() => {
          stream.close(constants.NGHTTP2_CANCEL);
          reject(new RealtimeProxyError("REALTIME_UPSTREAM_TIMEOUT", 504));
        }, this.config.EXECUTION_EDGE_CONNECT_TIMEOUT_MS);
        stream.once("response", (responseHeaders) => {
          clearTimeout(timeout);
          const status = Number(responseHeaders[":status"] ?? 502);
          const contentType = String(responseHeaders["content-type"] ?? "");
          if (status !== 200 || !contentType.startsWith("text/event-stream")) {
            stream.close(constants.NGHTTP2_CANCEL);
            reject(new RealtimeProxyError("REALTIME_UPSTREAM_REJECTED", status));
            return;
          }
          this.trackStream(stream, release);
          resolve({ stream, status, contentType });
        });
        stream.once("error", () => {
          clearTimeout(timeout);
          reject(new RealtimeProxyError("REALTIME_UPSTREAM_UNAVAILABLE", 502));
        });
      });
      return upstream;
    } catch (error) {
      release();
      throw error;
    }
  }

  async snapshot(request: RealtimePrincipal): Promise<RealtimeSnapshotResponse> {
    if (!this.delegation || !this.tls) {
      throw new RealtimeProxyError("REALTIME_DISABLED", 404);
    }
    const assertion = await this.delegation.issueReadAssertion({
      principalId: request.user.userId,
      sessionId: request.session.sessionId,
      workspaceId: request.workspaceId,
      roles: [request.user.role],
      resources: [COMMAND_CENTER_RESOURCE],
      authenticationTime: request.session.authenticationTime,
      authenticationMethods: ["portal_session"],
    });
    const session = await this.getSession();
    const stream = session.request({
      ":method": "GET",
      ":path": "/internal/v1/realtime/snapshot",
      accept: "application/json",
      authorization: `Bearer ${assertion}`,
      "cache-control": "no-cache",
    }, { endStream: true });
    const body = await readBoundedSnapshot(
      stream,
      this.config.EXECUTION_EDGE_CONNECT_TIMEOUT_MS,
    );
    return parseRealtimeSnapshot(body, request.workspaceId, this.config.EXECUTION_EDGE_ENVIRONMENT);
  }

  close(): void {
    this.session?.close();
    this.session = null;
  }

  onApplicationShutdown(): void {
    this.close();
  }

  private async getSession(): Promise<ClientHttp2Session> {
    if (this.session && !this.session.closed && !this.session.destroyed) return this.session;
    if (this.connecting) return this.connecting;
    this.connecting = this.connectSession();
    try {
      return await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  private connectSession(): Promise<ClientHttp2Session> {
    const origin = new URL(this.config.EXECUTION_EDGE_ORIGIN);
    return new Promise((resolve, reject) => {
      const session = connect(origin.origin, {
        ca: this.tls!.ca,
        cert: this.tls!.cert,
        key: this.tls!.key,
        rejectUnauthorized: true,
        ALPNProtocols: ["h2"],
        servername: origin.hostname,
      });
      const timeout = setTimeout(() => {
        session.destroy();
        reject(new RealtimeProxyError("REALTIME_CONNECT_TIMEOUT", 504));
      }, this.config.EXECUTION_EDGE_CONNECT_TIMEOUT_MS);
      session.once("connect", () => {
        clearTimeout(timeout);
        this.session = session;
        resolve(session);
      });
      session.once("error", () => {
        clearTimeout(timeout);
        if (this.session === session) this.session = null;
        reject(new RealtimeProxyError("REALTIME_CONNECT_FAILED", 502));
      });
      session.once("close", () => {
        if (this.session === session) this.session = null;
      });
      session.once("goaway", () => {
        if (this.session === session) this.session = null;
      });
    });
  }

  private reserveStream(sessionId: string): () => void {
    if ((this.activeBySession.get(sessionId) ?? 0) >= 4) {
      throw new RealtimeProxyError("REALTIME_SESSION_LIMIT", 429);
    }
    if (this.activeStreams >= 512) {
      throw new RealtimeProxyError("REALTIME_PROXY_CAPACITY", 503);
    }
    this.activeStreams += 1;
    this.activeBySession.set(sessionId, (this.activeBySession.get(sessionId) ?? 0) + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.activeStreams = Math.max(0, this.activeStreams - 1);
      const remaining = (this.activeBySession.get(sessionId) ?? 1) - 1;
      if (remaining <= 0) this.activeBySession.delete(sessionId);
      else this.activeBySession.set(sessionId, remaining);
    };
  }

  private trackStream(stream: ClientHttp2Stream, release: () => void): void {
    stream.once("close", release);
    stream.once("aborted", release);
  }
}

function readBoundedSnapshot(stream: ClientHttp2Stream, timeoutMs: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let accepted = false;
    const timeout = setTimeout(() => {
      stream.close(constants.NGHTTP2_CANCEL);
      reject(new RealtimeProxyError("REALTIME_SNAPSHOT_TIMEOUT", 504));
    }, timeoutMs);
    stream.once("response", (headers) => {
      const status = Number(headers[":status"] ?? 502);
      const contentType = String(headers["content-type"] ?? "");
      if (status !== 200 || !contentType.startsWith("application/json")) {
        clearTimeout(timeout);
        stream.close(constants.NGHTTP2_CANCEL);
        reject(new RealtimeProxyError("REALTIME_SNAPSHOT_REJECTED", status));
        return;
      }
      accepted = true;
    });
    stream.on("data", (chunk: Buffer) => {
      if (!accepted) return;
      size += chunk.length;
      if (size > REALTIME_SNAPSHOT_MAX_BYTES) {
        clearTimeout(timeout);
        stream.close(constants.NGHTTP2_CANCEL);
        reject(new RealtimeProxyError("REALTIME_SNAPSHOT_BUDGET_EXCEEDED", 502));
        return;
      }
      chunks.push(chunk);
    });
    stream.once("end", () => {
      clearTimeout(timeout);
      if (accepted) resolve(Buffer.concat(chunks));
    });
    stream.once("error", () => {
      clearTimeout(timeout);
      reject(new RealtimeProxyError("REALTIME_SNAPSHOT_UNAVAILABLE", 502));
    });
  });
}

export function parseRealtimeSnapshot(
  body: Buffer,
  expectedWorkspaceId: string,
  expectedEnvironment: string,
): RealtimeSnapshotResponse {
  let value: unknown;
  try {
    value = JSON.parse(body.toString("utf8"));
  } catch {
    throw new RealtimeProxyError("REALTIME_SNAPSHOT_INVALID", 502);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RealtimeProxyError("REALTIME_SNAPSHOT_INVALID", 502);
  }
  const snapshot = value as Record<string, unknown>;
  const exactKeys = [
    "schema_version", "delivery_profile", "workspace_id", "environment",
    "projection_epoch", "projection_sequence", "cursor", "stream_available",
    "resnapshot_not_before", "capability_snapshot_id", "activation_manifest_digest",
  ];
  if (Object.keys(snapshot).sort().join("|") !== [...exactKeys].sort().join("|")
    || snapshot.schema_version !== "execution.realtime-snapshot.v1"
    || snapshot.delivery_profile !== "shadow"
    || snapshot.workspace_id !== expectedWorkspaceId
    || snapshot.environment !== expectedEnvironment
    || typeof snapshot.projection_epoch !== "string"
    || typeof snapshot.projection_sequence !== "number"
    || !Number.isSafeInteger(snapshot.projection_sequence)
    || snapshot.projection_sequence < 0
    || typeof snapshot.cursor !== "string"
    || !CURSOR_PATTERN.test(snapshot.cursor)
    || snapshot.cursor !== `${snapshot.projection_epoch}:${snapshot.projection_sequence}`
    || snapshot.stream_available !== true
    || snapshot.resnapshot_not_before !== null
    || typeof snapshot.capability_snapshot_id !== "string"
    || snapshot.capability_snapshot_id.length === 0
    || snapshot.capability_snapshot_id.length > 128
    || typeof snapshot.activation_manifest_digest !== "string"
    || !DIGEST_PATTERN.test(snapshot.activation_manifest_digest)) {
    throw new RealtimeProxyError("REALTIME_SNAPSHOT_INVALID", 502);
  }
  return snapshot as unknown as RealtimeSnapshotResponse;
}

export class RealtimeProxyError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
  ) {
    super(code);
  }
}
