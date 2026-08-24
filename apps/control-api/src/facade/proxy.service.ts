import { createHash } from "crypto";
import { ControlApiConfig } from "../config";
import { PortalUser, randomId } from "../domain";
import { newUlid } from "../id";
import { PrincipalService } from "../auth/principal";
import { OutboxRepository, ProductAuditRepository } from "../repos/outbox";
import { RunsRepository } from "../repos/runs";
import { WorkspacesRepository } from "../repos/workspaces";

export class FacadeError extends Error {
  constructor(
    public readonly code: string,
    public readonly message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const PORTAL_API_PATH = /^\/api(?:\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]*)?$/;
const PLANNING_PUBLIC_PATH = /^\/roadmap-task-board\/api(?:\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]*)?$/;
const FORWARD_HEADERS = new Set([
  "accept",
  "content-type",
  "x-request-id",
  "traceparent",
  "if-none-match",
]);

export interface ProxyInput {
  method: string;
  path: string;
  query: string | undefined;
  body: string | Buffer | undefined;
  contentType: string | undefined;
  requestId: string;
  traceparent: string;
  user: PortalUser;
  workspaceId: string;
  idempotencyKey: string | undefined;
}

interface ProxyResult {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
}

const RUN_SSE_PATH = /^\/api\/runs\/([A-Za-z0-9][A-Za-z0-9_-]{0,127})\/events$/;

export function assertPortalRunSsePath(path: string): void {
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(path);
  } catch {
    throw new FacadeError("UPSTREAM_PATH_INVALID", "The run event path is invalid.", 400);
  }
  if (decodedPath !== path || !RUN_SSE_PATH.test(decodedPath)) {
    throw new FacadeError("UPSTREAM_PATH_INVALID", "The run event path is invalid.", 400);
  }
}

export interface WriteRecord {
  status: number;
  body: Record<string, unknown> | null;
  idempotencyKey: string;
  replayed: boolean;
}

/**
 * Build a request URL without ever allowing request input to select the
 * upstream origin. PORTAL_API_BASE_URL is validated as an origin-only config
 * value; request paths are restricted to this service's /api namespace and
 * assigned as URL components instead of being parsed as an absolute URL.
 */
export function buildPortalUpstreamUrl(
  configuredOrigin: string,
  path: string,
  query: string | undefined,
): URL {
  const base = new URL(configuredOrigin);
  if (
    !["http:", "https:"].includes(base.protocol) ||
    base.username !== "" ||
    base.password !== "" ||
    base.pathname !== "/" ||
    base.search !== "" ||
    base.hash !== ""
  ) {
    throw new FacadeError(
      "UPSTREAM_ORIGIN_INVALID",
      "The configured Portal API origin is invalid.",
      500,
    );
  }

  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(path);
  } catch {
    throw new FacadeError("UPSTREAM_PATH_INVALID", "The Portal API path is invalid.", 400);
  }
  const segments = decodedPath.split("/");
  if (
    !PORTAL_API_PATH.test(path) ||
    decodedPath.includes("\\") ||
    decodedPath.includes("?") ||
    decodedPath.includes("#") ||
    decodedPath.includes("//") ||
    segments.includes(".") ||
    segments.includes("..")
  ) {
    throw new FacadeError("UPSTREAM_PATH_INVALID", "The Portal API path is invalid.", 400);
  }

  const target = new URL(base.origin);
  target.pathname = path;
  target.search = query ?? "";
  if (
    target.protocol !== base.protocol ||
    target.hostname !== base.hostname ||
    target.port !== base.port
  ) {
    throw new FacadeError("UPSTREAM_ORIGIN_MISMATCH", "The Portal API origin changed.", 400);
  }
  return target;
}

/** Map the public Planning prefix onto the sidecar's fixed `/api` namespace. */
export function planningUpstreamPath(publicPath: string): string {
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(publicPath);
  } catch {
    throw new FacadeError("UPSTREAM_PATH_INVALID", "The Planning API path is invalid.", 400);
  }
  const segments = decodedPath.split("/");
  if (
    !PLANNING_PUBLIC_PATH.test(publicPath) ||
    decodedPath.includes("\\") ||
    decodedPath.includes("?") ||
    decodedPath.includes("#") ||
    decodedPath.includes("//") ||
    segments.includes(".") ||
    segments.includes("..")
  ) {
    throw new FacadeError("UPSTREAM_PATH_INVALID", "The Planning API path is invalid.", 400);
  }
  return decodedPath.slice("/roadmap-task-board".length) || "/api";
}

export class PortalProxyService {
  constructor(
    private readonly config: ControlApiConfig,
    private readonly outbox: OutboxRepository,
    private readonly audit: ProductAuditRepository,
    private readonly runs: RunsRepository,
    private readonly workspaces: WorkspacesRepository,
  ) {}

  enabled(): boolean {
    return this.config.FEATURE_PROXY_PORTAL === "true";
  }

  planningEnabled(): boolean {
    return this.config.FEATURE_PROXY_PLANNING === "true";
  }

  async proxy(input: ProxyInput): Promise<ProxyResult> {
    return this.proxyTo(this.config.PORTAL_API_BASE_URL, input);
  }

  async proxyPlanning(input: ProxyInput): Promise<ProxyResult> {
    const path = planningUpstreamPath(input.path);
    return this.proxyTo(
      this.config.PLANNING_API_BASE_URL,
      { ...input, path },
      { "x-portal-actor": input.user.displayName || input.user.username },
    );
  }

  /**
   * Open the legacy QuantBT run-event stream without buffering it in the
   * Control API. The caller owns downstream cancellation and piping; this
   * boundary only authenticates the principal and fixes the upstream origin.
   */
  async openPortalRunEvents(input: ProxyInput, signal: AbortSignal): Promise<Response> {
    assertPortalRunSsePath(input.path);
    const url = buildPortalUpstreamUrl(this.config.PORTAL_API_BASE_URL, input.path, undefined);
    return fetch(url, {
      method: "GET",
      headers: this.principalHeaders(input, { accept: "text/event-stream" }),
      redirect: "manual",
      signal,
    });
  }

  private async proxyTo(
    configuredOrigin: string,
    input: ProxyInput,
    additionalHeaders: Record<string, string> = {},
  ): Promise<ProxyResult> {
    const url = buildPortalUpstreamUrl(configuredOrigin, input.path, input.query);
    const headers = this.principalHeaders(input, additionalHeaders);

    const response = await fetch(url, {
      method: input.method,
      headers,
      body: input.body ?? null,
      redirect: "manual",
    });
    const payload = Buffer.from(await response.arrayBuffer());
    const passthrough: Record<string, string> = {};
    for (const name of [...FORWARD_HEADERS, "cache-control", "etag", "vary"]) {
      const value = response.headers.get(name);
      if (value !== null) passthrough[name] = value;
    }
    return { status: response.status, headers: passthrough, body: payload };
  }

  private principalHeaders(
    input: ProxyInput,
    additionalHeaders: Record<string, string> = {},
  ): Record<string, string> {
    const headers: Record<string, string> = {
      "x-request-id": input.requestId,
      traceparent: input.traceparent,
      ...additionalHeaders,
    };
    if (input.contentType !== undefined) {
      headers["content-type"] = input.contentType;
    }
    const principal = new PrincipalService(this.requirePrincipalSecret()).sign({
      principalId: input.user.userId,
      username: input.user.username,
      accessSubject: null,
      accessEmail: null,
      role: input.user.role,
      authnMethods: ["portal_session"],
      sessionId: "facade",
      mustChangePassword: input.user.mustChangePassword,
      issuedAt: new Date().toISOString(),
    });
    headers["x-portal-principal"] = principal;
    return headers;
  }

  async handleWrite(input: ProxyInput): Promise<WriteRecord> {
    const idempotencyKey =
      input.idempotencyKey ??
      `auto_${createHash("sha256")
        .update(`${input.method} ${input.path} ${input.body ?? ""}`)
        .digest("hex")
        .slice(0, 24)}`;
    const payloadHash = createHash("sha256")
      .update(input.body ?? "")
      .digest("hex");

    const existing = await this.outbox.findByKey(idempotencyKey);
    if (existing) {
      const samePayload = createHash("sha256")
        .update(JSON.stringify(existing.payloadJson))
        .digest("hex");
      if (existing.payloadJson.payload_hash === payloadHash || samePayload === payloadHash) {
        await this.outbox.markPublished(idempotencyKey);
        await this.audit.record({
          eventId: randomId("evt"),
          eventType: "command_replayed",
          actorUserId: input.user.userId,
          workspaceId: input.workspaceId,
          requestId: input.requestId,
          idempotencyKey,
          aggregateType: existing.aggregateType,
          aggregateId: existing.aggregateId,
          aggregateVersion: null,
          result: "SUCCESS",
          reasonCode: "IDEMPOTENT_REPLAY",
        });
        return {
          status: existing.responseStatus ?? 200,
          body: existing.responseJson,
          idempotencyKey,
          replayed: true,
        };
      }
      await this.audit.record({
        eventId: randomId("evt"),
        eventType: "command_conflict",
        actorUserId: input.user.userId,
        workspaceId: input.workspaceId,
        requestId: input.requestId,
        idempotencyKey,
        aggregateType: existing.aggregateType,
        aggregateId: existing.aggregateId,
        aggregateVersion: null,
        result: "CONFLICT",
        reasonCode: "IDEMPOTENCY_KEY_REUSE",
      });
      throw new FacadeError(
        "IDEMPOTENCY_KEY_REUSE",
        "Idempotency key was already used for a different payload.",
        409,
      );
    }

    const aggregateType = input.path.startsWith("/api/runs") ? "run" : "portal_resource";
    const payloadJson = {
      method: input.method,
      path: input.path,
      payload_hash: payloadHash,
    };
    await this.outbox.create({
      messageId: newUlid("out"),
      idempotencyKey,
      aggregateType,
      aggregateId: null,
      eventType: `${aggregateType}.command.v1`,
      actorUserId: input.user.userId,
      workspaceId: input.workspaceId,
      requestId: input.requestId,
      payloadJson,
    });

    const result = await this.proxy(input);

    let responseJson: Record<string, unknown> | null = null;
    if (result.body.length <= this.config.OUTBOX_MAX_RESPONSE_BYTES) {
      try {
        responseJson = JSON.parse(result.body.toString("utf8"));
      } catch {
        responseJson = { truncated: true };
      }
    } else {
      responseJson = { truncated: true };
    }

    if (aggregateType === "run" && input.method === "POST" && result.status === 202) {
      const runId =
        responseJson && typeof responseJson.run_id === "string"
          ? responseJson.run_id
          : null;
      if (runId) {
        const bodyJson = (() => {
          try {
            return JSON.parse(
              typeof input.body === "string" ? input.body : "{}",
            ) as Record<string, unknown>;
          } catch {
            return {};
          }
        })();
        await this.runs.upsert({
          runId,
          workspaceId: input.workspaceId,
          ownerUserId: input.user.userId,
          status: "QUEUED",
          protocol: typeof bodyJson.protocol === "string" ? bodyJson.protocol : null,
          strategyId:
            typeof bodyJson.strategy_id === "string" ? bodyJson.strategy_id : null,
          datasetId: typeof bodyJson.dataset_id === "string" ? bodyJson.dataset_id : null,
          sourceCursor: input.requestId,
        });
      }
    }

    await this.outbox.storeResponse({
      idempotencyKey,
      responseJson,
      responseStatus: result.status,
    });
    await this.outbox.markPublished(idempotencyKey);
    await this.audit.record({
      eventId: randomId("evt"),
      eventType: `${aggregateType}.command.v1`,
      actorUserId: input.user.userId,
      workspaceId: input.workspaceId,
      requestId: input.requestId,
      idempotencyKey,
      aggregateType,
      aggregateId: null,
      aggregateVersion: null,
      result: result.status < 400 ? "SUCCESS" : "FAILURE",
      reasonCode: result.status < 400 ? null : `UPSTREAM_${result.status}`,
      metadata: { upstreamStatus: result.status },
    });

    return {
      status: result.status,
      body: responseJson,
      idempotencyKey,
      replayed: false,
    };
  }

  private requirePrincipalSecret(): string {
    if (!this.config.INTERNAL_PRINCIPAL_SECRET) {
      throw new FacadeError("PRINCIPAL_NOT_CONFIGURED", "Principal secret is missing.", 500);
    }
    return this.config.INTERNAL_PRINCIPAL_SECRET;
  }

  async ensureWorkspace(user: PortalUser): Promise<string> {
    return this.workspaces.ensurePersonal(user.userId, user.username);
  }
}
