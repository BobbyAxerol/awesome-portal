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
const FORWARD_HEADERS = new Set([
  "accept",
  "content-type",
  "x-request-id",
  "traceparent",
  "if-none-match",
]);

interface ProxyInput {
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

export interface WriteRecord {
  status: number;
  body: Record<string, unknown> | null;
  idempotencyKey: string;
  replayed: boolean;
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

  async proxy(input: ProxyInput): Promise<ProxyResult> {
    const url = new URL(input.path + (input.query ? `?${input.query}` : ""), this.config.PORTAL_API_BASE_URL);
    const headers: Record<string, string> = {
      "x-request-id": input.requestId,
      traceparent: input.traceparent,
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
        "Idempotency key đã dùng cho payload khác.",
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
