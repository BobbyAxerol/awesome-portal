import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { ClientHttp2Session, connect } from "node:http2";
import { OnApplicationShutdown } from "@nestjs/common";
import { ControlApiConfig } from "../config";
import { AuthSession, PortalUser } from "../domain";
import {
  CURRENT_SOURCE_SCREEN_IDS,
  ExecutionDelegationService,
  MANAGER_V2_READ_RESOURCE,
} from "./delegation";

export const CURRENT_SOURCE_ENVIRONMENTS = ["paper", "sandbox", "live", "canary"] as const;
export type CurrentSourceEnvironment = (typeof CURRENT_SOURCE_ENVIRONMENTS)[number];

const CURRENT_SOURCE_SCREENS = new Set<string>(CURRENT_SOURCE_SCREEN_IDS);
const SOURCE_ID = /^[a-z][a-z0-9.-]{1,127}$/;
const RELATION = /^[a-z][a-z0-9_]{1,127}$/;
const TYPED_UPSTREAM_CODE = /^CURRENT_SOURCE_[A-Z0-9_]{1,80}$/;
const TYPED_MANAGER_CODE = /^MANAGER_V2_[A-Z0-9_]{1,80}$/;
const CANARY_SCREEN = "EXECUTION_CANARY_CONTROL_ROOM_SCREEN";

const N17B_PAPER_RELATIONS = Object.freeze({
  "manager.deployments": Object.freeze(["strategy_deployments"]),
  "manager.performance": Object.freeze([
    "performance_snapshots",
    "account_equity_snapshots",
    "portfolio_equity_snapshots",
  ]),
  "manager.positions": Object.freeze(["positions_v2"]),
  "manager.sessions": Object.freeze(["execution_sessions"]),
} as const);

export const N15B_CURRENT_QUERY_ACCEPTANCE = Object.freeze({
  schemaVersion: "portal.execution.intercell-gateway-current.v1",
  environment: "paper" as const,
  profileId: "PAPER_BINANCE_USDM",
  screenId: "PAPER_TRADING_SCREEN",
  capabilityIds: Object.freeze([
    "deployments.positions",
    "deployments.execution-quality",
    "sessions.current",
  ]),
});

export const N17B_CURRENT_EXACT_QUERY_ACCEPTANCE = Object.freeze({
  schemaVersion: "portal.execution.production-acceptance-current.v1",
  decision: "N17B_EXACT_CURRENT_SET_ACCEPTED",
  lineageDecision: "N15B_CURRENT_SOURCE_ACCEPTED",
  environment: "paper" as const,
  profileId: "PAPER_BINANCE_USDM",
  screenId: "PAPER_TRADING_SCREEN",
  sourceContract: "trading-system.portal-execution.manager-v2.runtime.v1",
  adapter: "MANAGER_V2_CURRENT_AS_IS",
  delegatedResource: MANAGER_V2_READ_RESOURCE,
  sourceBindingIds: Object.freeze(Object.keys(N17B_PAPER_RELATIONS).sort()),
  capabilityIds: N15B_CURRENT_QUERY_ACCEPTANCE.capabilityIds,
  sourceMaximumRequestsPerSecond: 20,
});

export interface CurrentSourcePrincipal {
  user: PortalUser;
  session: AuthSession;
  workspaceId: string;
}

export interface CurrentSourcePageQuery {
  limit?: number;
  cursor?: string;
}

interface ProfileTransport {
  environment: Exclude<CurrentSourceEnvironment, "canary">;
  origin: URL;
  profileId: string;
  delegation: ExecutionDelegationService;
  session: ClientHttp2Session | null;
  connecting: Promise<ClientHttp2Session> | null;
}

interface BulkheadWaiter {
  resolve: (release: () => void) => void;
  reject: (error: CurrentSourceProxyError) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** Process-local FIFO admission bound for all N13B profile reads. */
export class CurrentSourceBulkhead {
  private active = 0;
  private readonly queue: BulkheadWaiter[] = [];

  constructor(
    private readonly maximumConcurrency: number,
    private readonly maximumQueue: number,
    private readonly queueTimeoutMs: number,
  ) {}

  acquire(): Promise<() => void> {
    if (this.active < this.maximumConcurrency) {
      this.active += 1;
      return Promise.resolve(this.releasePermit());
    }
    if (this.queue.length >= this.maximumQueue) {
      return Promise.reject(new CurrentSourceProxyError("N13B_QUEUE_FULL", 503));
    }
    return new Promise((resolve, reject) => {
      const waiter: BulkheadWaiter = {
        resolve,
        reject,
        timer: setTimeout(() => {
          const index = this.queue.indexOf(waiter);
          if (index >= 0) this.queue.splice(index, 1);
          reject(new CurrentSourceProxyError("N13B_QUEUE_TIMEOUT", 503));
        }, this.queueTimeoutMs),
      };
      this.queue.push(waiter);
    });
  }

  private releasePermit(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active -= 1;
      const waiter = this.queue.shift();
      if (!waiter) return;
      clearTimeout(waiter.timer);
      this.active += 1;
      waiter.resolve(this.releasePermit());
    };
  }
}

type MillisecondClock = () => number;
type Delay = (milliseconds: number) => Promise<void>;

/**
 * Burst-free process-local pacer for the current Manager-v2 read identity.
 *
 * The AWS-HK Source Proxy publishes a 20 r/s boundary. N17B deliberately
 * admits at most 15 r/s and rejects excess bounded work instead of retrying or
 * translating source rate-limit pressure into an unbounded queue.
 */
export class CurrentSourceRateLimiter {
  private nextPermitAt = 0;
  private readonly intervalMs: number;

  constructor(
    maximumRequestsPerSecond: number,
    private readonly maximumWaitMs: number,
    private readonly now: MillisecondClock = Date.now,
    private readonly delay: Delay = (milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)),
  ) {
    if (
      !Number.isInteger(maximumRequestsPerSecond) ||
      maximumRequestsPerSecond < 1 ||
      maximumRequestsPerSecond > 15 ||
      !Number.isInteger(maximumWaitMs) ||
      maximumWaitMs < 1
    ) {
      throw new Error("N17B rate-limit configuration is outside the accepted boundary");
    }
    this.intervalMs = Math.ceil(1_000 / maximumRequestsPerSecond);
  }

  async acquire(): Promise<void> {
    const now = this.now();
    const scheduledAt = Math.max(now, this.nextPermitAt);
    const waitMs = scheduledAt - now;
    if (waitMs > this.maximumWaitMs) {
      throw new CurrentSourceProxyError("N17B_RATE_LIMIT_QUEUE_TIMEOUT", 503, {
        availability: "DEGRADED",
        reason_code: "PORTAL_SOURCE_PACING_BUDGET_EXHAUSTED",
        retryable: false,
      });
    }
    this.nextPermitAt = scheduledAt + this.intervalMs;
    if (waitMs > 0) await this.delay(waitMs);
  }
}

/**
 * Same-origin BFF for exact N13B screen reads. It owns delegated identity and
 * mTLS; browser callers can never choose an Edge origin, profile, audience or
 * arbitrary upstream operation.
 */
export class ExecutionCurrentSourceProxy implements OnApplicationShutdown {
  private readonly bulkhead: CurrentSourceBulkhead;
  private readonly rateLimiter: CurrentSourceRateLimiter;

  private constructor(
    private readonly config: ControlApiConfig,
    private readonly profiles: Map<string, ProfileTransport>,
    private readonly tls: { ca: Buffer; cert: Buffer; key: Buffer } | null,
  ) {
    this.bulkhead = new CurrentSourceBulkhead(
      config.EXECUTION_EDGE_CURRENT_SOURCE_MAXIMUM_CONCURRENCY,
      config.EXECUTION_EDGE_CURRENT_SOURCE_MAXIMUM_QUEUE,
      config.EXECUTION_EDGE_CURRENT_SOURCE_QUEUE_TIMEOUT_MS,
    );
    this.rateLimiter = new CurrentSourceRateLimiter(
      config.EXECUTION_EDGE_CURRENT_SOURCE_MAX_REQUESTS_PER_SECOND,
      config.EXECUTION_EDGE_CURRENT_SOURCE_MAXIMUM_PACE_WAIT_MS,
    );
  }

  static async create(config: ControlApiConfig): Promise<ExecutionCurrentSourceProxy> {
    const enabled = enabledProfileConfigurations(config);
    if (enabled.length === 0) {
      return new ExecutionCurrentSourceProxy(config, new Map(), null);
    }
    const [privateKeyPem, ca, cert, key] = await Promise.all([
      readFile(config.EXECUTION_EDGE_PRIVATE_KEY_FILE!, "utf8"),
      readFile(config.EXECUTION_EDGE_CA_FILE!),
      readFile(config.EXECUTION_EDGE_CLIENT_CERT_FILE!),
      readFile(config.EXECUTION_EDGE_CLIENT_KEY_FILE!),
    ]);
    const profiles = new Map<string, ProfileTransport>();
    for (const profile of enabled) {
      const delegation = await ExecutionDelegationService.create({
        issuer: config.EXECUTION_EDGE_DELEGATION_ISSUER,
        audience: profile.audience,
        keyId: config.EXECUTION_EDGE_KEY_ID,
        privateKeyPem,
        ttlSeconds: config.EXECUTION_EDGE_DELEGATION_TTL_SECONDS,
        environment: profile.environment,
        profileId: profile.profileId,
      });
      profiles.set(profile.environment, {
        environment: profile.environment,
        origin: new URL(profile.origin),
        profileId: profile.profileId,
        delegation,
        session: null,
        connecting: null,
      });
    }
    return new ExecutionCurrentSourceProxy(config, profiles, { ca, cert, key });
  }

  screen(
    principal: CurrentSourcePrincipal,
    environment: CurrentSourceEnvironment,
    screenId: string,
  ): Promise<unknown> {
    assertN15bCurrentQueryAccepted(environment, screenId);
    return this.request(
      principal,
      environment,
      screenId,
      currentManagerV2Path(screenId),
    );
  }

  relation(
    principal: CurrentSourcePrincipal,
    environment: CurrentSourceEnvironment,
    screenId: string,
    sourceId: string,
    relation: string,
    query: CurrentSourcePageQuery,
  ): Promise<unknown> {
    assertN15bCurrentQueryAccepted(environment, screenId);
    const path = currentManagerV2Path(screenId, sourceId, relation, query);
    return this.request(principal, environment, screenId, path);
  }

  close(): void {
    for (const profile of this.profiles.values()) {
      profile.session?.close();
      profile.session = null;
    }
  }

  onApplicationShutdown(): void {
    this.close();
  }

  private async request(
    principal: CurrentSourcePrincipal,
    requestedEnvironment: CurrentSourceEnvironment,
    screenId: string,
    path: string,
  ): Promise<unknown> {
    const sourceEnvironment = requestedEnvironment === "canary" ? "live" : requestedEnvironment;
    const profile = this.profiles.get(sourceEnvironment);
    if (!profile || !this.tls) {
      throw new CurrentSourceProxyError("N13B_PROFILE_NOT_ACTIVATED", 404, {
        classification: "SUPPORTED_BUT_NOT_ACTIVATED",
        availability: "UNAVAILABLE",
        requested_environment: requestedEnvironment,
        source_environment: sourceEnvironment,
      });
    }
    const release = await this.bulkhead.acquire();
    try {
      await this.rateLimiter.acquire();
      const assertion = await profile.delegation.issueReadAssertion({
        principalId: principal.user.userId,
        sessionId: principal.session.sessionId,
        workspaceId: principal.workspaceId,
        roles: [principal.user.role],
        resources: [MANAGER_V2_READ_RESOURCE],
        authenticationTime: principal.session.authenticationTime,
        authenticationMethods: ["portal_session"],
      });
      const session = await this.getSession(profile);
      const source = await this.sendRequest(session, assertion, path);
      return {
        schema_version: "portal.execution.current-source-bff.v2",
        authority: "PORTAL_CONTROL_API",
        requested_environment: requestedEnvironment,
        source_environment: sourceEnvironment,
        profile_id: profile.profileId,
        gateway: {
          interface: "QUERY",
          acceptance: N17B_CURRENT_EXACT_QUERY_ACCEPTANCE.decision,
          adapter: N17B_CURRENT_EXACT_QUERY_ACCEPTANCE.adapter,
          source_contract: N17B_CURRENT_EXACT_QUERY_ACCEPTANCE.sourceContract,
          screen_id: screenId,
          capability_ids: N17B_CURRENT_EXACT_QUERY_ACCEPTANCE.capabilityIds,
          source_binding_ids: N17B_CURRENT_EXACT_QUERY_ACCEPTANCE.sourceBindingIds,
          request_id: randomUUID(),
          transport: "H2_MTLS_DELEGATED_JWT",
          source_maximum_requests_per_second:
            N17B_CURRENT_EXACT_QUERY_ACCEPTANCE.sourceMaximumRequestsPerSecond,
          portal_maximum_requests_per_second:
            this.config.EXECUTION_EDGE_CURRENT_SOURCE_MAX_REQUESTS_PER_SECOND,
          retry_count: 0,
        },
        ...(requestedEnvironment === "canary"
          ? { composition: "PORTAL_CANARY_GOVERNANCE_OVER_LIVE_FACTS" }
          : {}),
        source,
      };
    } finally {
      release();
    }
  }

  private sendRequest(
    session: ClientHttp2Session,
    assertion: string,
    path: string,
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const stream = session.request({
        ":method": "GET",
        ":path": path,
        accept: "application/json",
        authorization: `Bearer ${assertion}`,
      });
      const chunks: Buffer[] = [];
      let size = 0;
      let status = 502;
      let responseIsJson = false;
      let settled = false;
      const settle = (error?: CurrentSourceProxyError, value?: unknown): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (error) reject(error);
        else resolve(value);
      };
      const timeout = setTimeout(() => {
        settle(new CurrentSourceProxyError("N13B_UPSTREAM_TIMEOUT", 504));
        stream.close();
      }, this.config.EXECUTION_EDGE_CURRENT_SOURCE_REQUEST_TIMEOUT_MS);
      stream.on("response", (headers) => {
        status = Number(headers[":status"] ?? 502);
        const contentType = headers["content-type"];
        responseIsJson = typeof contentType === "string" && contentType.startsWith("application/json");
        const contentLength = Number(headers["content-length"] ?? 0);
        if (
          Number.isFinite(contentLength) &&
          contentLength > this.config.EXECUTION_EDGE_CURRENT_SOURCE_MAX_RESPONSE_BYTES
        ) {
          settle(new CurrentSourceProxyError("N13B_RESPONSE_TOO_LARGE", 502));
          stream.close();
        }
      });
      stream.on("data", (chunk: Buffer) => {
        if (settled) return;
        size += chunk.byteLength;
        if (size > this.config.EXECUTION_EDGE_CURRENT_SOURCE_MAX_RESPONSE_BYTES) {
          settle(new CurrentSourceProxyError("N13B_RESPONSE_TOO_LARGE", 502));
          stream.close();
          return;
        }
        chunks.push(chunk);
      });
      stream.once("aborted", () => settle(new CurrentSourceProxyError("N13B_UPSTREAM_UNAVAILABLE", 502)));
      stream.once("error", () => settle(new CurrentSourceProxyError("N13B_UPSTREAM_UNAVAILABLE", 502)));
      stream.once("end", () => {
        const body = Buffer.concat(chunks);
        if (status < 200 || status >= 300) {
          settle(currentSourceUpstreamError(body, responseIsJson, status));
          return;
        }
        if (!responseIsJson) {
          settle(new CurrentSourceProxyError("N13B_UPSTREAM_CONTRACT_INVALID", 502));
          return;
        }
        try {
          settle(undefined, JSON.parse(body.toString("utf8")));
        } catch {
          settle(new CurrentSourceProxyError("N13B_UPSTREAM_CONTRACT_INVALID", 502));
        }
      });
      stream.end();
    });
  }

  private async getSession(profile: ProfileTransport): Promise<ClientHttp2Session> {
    if (profile.session && !profile.session.closed && !profile.session.destroyed) {
      return profile.session;
    }
    if (profile.connecting) return profile.connecting;
    profile.connecting = this.connectSession(profile);
    try {
      return await profile.connecting;
    } finally {
      profile.connecting = null;
    }
  }

  private connectSession(profile: ProfileTransport): Promise<ClientHttp2Session> {
    return new Promise((resolve, reject) => {
      const session = connect(profile.origin.origin, {
        ca: this.tls!.ca,
        cert: this.tls!.cert,
        key: this.tls!.key,
        rejectUnauthorized: true,
        ALPNProtocols: ["h2"],
        servername: profile.origin.hostname,
      });
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        session.destroy();
        reject(new CurrentSourceProxyError("N13B_CONNECT_TIMEOUT", 504));
      }, this.config.EXECUTION_EDGE_CONNECT_TIMEOUT_MS);
      session.once("connect", () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        profile.session = session;
        resolve(session);
      });
      session.once("error", () => {
        clearTimeout(timeout);
        if (profile.session === session) profile.session = null;
        if (!settled) {
          settled = true;
          reject(new CurrentSourceProxyError("N13B_CONNECT_FAILED", 502));
        }
      });
      session.on("goaway", () => {
        if (profile.session === session) profile.session = null;
        session.close();
      });
      session.once("close", () => {
        if (profile.session === session) profile.session = null;
      });
    });
  }
}

export function assertN15bCurrentQueryAccepted(
  environment: CurrentSourceEnvironment,
  screenId: string,
): void {
  if (
    environment !== N15B_CURRENT_QUERY_ACCEPTANCE.environment ||
    screenId !== N15B_CURRENT_QUERY_ACCEPTANCE.screenId
  ) {
    throw new CurrentSourceProxyError("N15B_QUERY_CAPABILITY_NOT_ACCEPTED", 404, {
      classification: "SUPPORTED_BUT_NOT_ACTIVATED",
      availability: "UNAVAILABLE",
      reason_code: "N15B_QUERY_SCOPE_NOT_RELEASED",
      requested_environment: environment,
      requested_screen_id: screenId,
    });
  }
}

export function currentSourcePath(
  environment: CurrentSourceEnvironment,
  screenId: string,
  sourceId?: string,
  relation?: string,
  query: CurrentSourcePageQuery = {},
): string {
  if (!CURRENT_SOURCE_ENVIRONMENTS.includes(environment) || !CURRENT_SOURCE_SCREENS.has(screenId)) {
    throw new CurrentSourceProxyError("N13B_SCOPE_INVALID", 400);
  }
  if (environment === "canary" && screenId !== CANARY_SCREEN) {
    throw new CurrentSourceProxyError("N13B_CANARY_SCOPE_INVALID", 400);
  }
  const base = `/internal/v1/current-source/screens/${encodeURIComponent(screenId)}`;
  if (sourceId === undefined && relation === undefined) return base;
  if (
    sourceId === undefined ||
    relation === undefined ||
    !SOURCE_ID.test(sourceId) ||
    !RELATION.test(relation)
  ) {
    throw new CurrentSourceProxyError("N13B_BINDING_INVALID", 400);
  }
  if (
    (query.limit !== undefined &&
      (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 200)) ||
    (query.cursor !== undefined &&
      (query.cursor.length < 1 || Buffer.byteLength(query.cursor, "utf8") > 4096))
  ) {
    throw new CurrentSourceProxyError("N13B_PAGE_INVALID", 400);
  }
  const parameters = new URLSearchParams();
  if (query.limit !== undefined) parameters.set("limit", String(query.limit));
  if (query.cursor !== undefined) parameters.set("cursor", query.cursor);
  const suffix = parameters.size > 0 ? `?${parameters.toString()}` : "";
  return `${base}/sources/${encodeURIComponent(sourceId)}/relations/${encodeURIComponent(relation)}${suffix}`;
}

/**
 * Maps the exact accepted Paper screen to routes already published by the
 * current Manager-v2 runtime. Source IDs are Portal-owned aliases and are
 * never forwarded as arbitrary upstream route fragments.
 */
export function currentManagerV2Path(
  screenId: string,
  sourceId?: string,
  relation?: string,
  query: CurrentSourcePageQuery = {},
): string {
  if (screenId !== N17B_CURRENT_EXACT_QUERY_ACCEPTANCE.screenId) {
    throw new CurrentSourceProxyError("N17B_QUERY_CAPABILITY_NOT_ACCEPTED", 404);
  }
  if (sourceId === undefined && relation === undefined) {
    return "/internal/v2/manager/capabilities";
  }
  if (
    sourceId === undefined ||
    relation === undefined ||
    !SOURCE_ID.test(sourceId) ||
    !RELATION.test(relation)
  ) {
    throw new CurrentSourceProxyError("N17B_BINDING_INVALID", 400);
  }
  const acceptedRelations = N17B_PAPER_RELATIONS[
    sourceId as keyof typeof N17B_PAPER_RELATIONS
  ];
  if (!acceptedRelations || !(acceptedRelations as readonly string[]).includes(relation)) {
    throw new CurrentSourceProxyError("N17B_BINDING_NOT_ACCEPTED", 404, {
      classification: "SUPPORTED_BUT_NOT_ACTIVATED",
      availability: "UNAVAILABLE",
      reason_code: "RELATION_OUTSIDE_EXACT_PAPER_SET",
    });
  }
  if (
    (query.limit !== undefined &&
      (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 200)) ||
    (query.cursor !== undefined &&
      (query.cursor.length < 1 || Buffer.byteLength(query.cursor, "utf8") > 4096))
  ) {
    throw new CurrentSourceProxyError("N17B_PAGE_INVALID", 400);
  }
  const parameters = new URLSearchParams();
  if (query.limit !== undefined) parameters.set("limit", String(query.limit));
  if (query.cursor !== undefined) parameters.set("cursor", query.cursor);
  const suffix = parameters.size > 0 ? `?${parameters.toString()}` : "";
  return `/internal/v2/manager/relations/public/${encodeURIComponent(relation)}${suffix}`;
}

export function currentSourceUpstreamError(
  body: Buffer,
  responseIsJson: boolean,
  upstreamStatus: number,
): CurrentSourceProxyError {
  const safeStatus = [400, 404, 409, 422, 429, 503, 504].includes(upstreamStatus)
    ? upstreamStatus
    : 502;
  if (responseIsJson && body.byteLength <= 64 * 1024) {
    try {
      const parsed = JSON.parse(body.toString("utf8")) as unknown;
      if (typeof parsed === "object" && parsed !== null && "error" in parsed) {
        const error = (parsed as { error: unknown }).error;
        if (typeof error === "object" && error !== null && "code" in error) {
          const value = error as Record<string, unknown>;
          if (typeof value.code === "string" && TYPED_UPSTREAM_CODE.test(value.code)) {
            return new CurrentSourceProxyError(value.code, safeStatus, {
              ...(typeof value.classification === "string"
                ? { classification: value.classification }
                : {}),
              ...(typeof value.availability === "string"
                ? { availability: value.availability }
                : {}),
              ...(typeof value.reason_code === "string"
                ? { reason_code: value.reason_code }
                : {}),
            });
          }
          if (typeof value.code === "string" && TYPED_MANAGER_CODE.test(value.code)) {
            return new CurrentSourceProxyError(
              upstreamStatus === 429
                ? "N17B_SOURCE_RATE_LIMITED"
                : upstreamStatus === 404
                  ? "N17B_SOURCE_RELATION_UNAVAILABLE"
                  : "N17B_SOURCE_REJECTED",
              upstreamStatus === 429 ? 503 : safeStatus,
              {
                availability: upstreamStatus === 429 ? "DEGRADED" : "UNAVAILABLE",
                reason_code: value.code,
                retryable: false,
              },
            );
          }
        }
      }
    } catch {
      // Fall through to a transport-owned, sanitized error.
    }
  }
  return new CurrentSourceProxyError(
    upstreamStatus === 401 || upstreamStatus === 403
      ? "N13B_DELEGATED_IDENTITY_REJECTED"
      : upstreamStatus === 429
        ? "N17B_SOURCE_RATE_LIMITED"
      : "N13B_UPSTREAM_REJECTED",
    upstreamStatus === 429 ? 503 : safeStatus,
  );
}

export class CurrentSourceProxyError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly details?: Record<string, unknown>,
  ) {
    super(code);
  }
}

function enabledProfileConfigurations(config: ControlApiConfig): Array<{
  environment: "paper" | "sandbox" | "live";
  origin: string;
  profileId: string;
  audience: string;
}> {
  const candidates = [
    {
      environment: "paper" as const,
      enabled: config.FEATURE_EXECUTION_CURRENT_SOURCE_PAPER === "true",
      origin: config.EXECUTION_EDGE_PAPER_ORIGIN,
      profileId: config.EXECUTION_EDGE_PAPER_PROFILE_ID,
      audience: config.EXECUTION_EDGE_PAPER_AUDIENCE,
    },
    {
      environment: "sandbox" as const,
      enabled: config.FEATURE_EXECUTION_CURRENT_SOURCE_SANDBOX === "true",
      origin: config.EXECUTION_EDGE_SANDBOX_ORIGIN,
      profileId: config.EXECUTION_EDGE_SANDBOX_PROFILE_ID,
      audience: config.EXECUTION_EDGE_SANDBOX_AUDIENCE,
    },
    {
      environment: "live" as const,
      enabled: config.FEATURE_EXECUTION_CURRENT_SOURCE_LIVE === "true",
      origin: config.EXECUTION_EDGE_LIVE_ORIGIN,
      profileId: config.EXECUTION_EDGE_LIVE_PROFILE_ID,
      audience: config.EXECUTION_EDGE_LIVE_AUDIENCE,
    },
  ];
  return candidates
    .filter((candidate) => candidate.enabled)
    .map((candidate) => ({
      environment: candidate.environment,
      origin: candidate.origin!,
      profileId: candidate.profileId!,
      audience: candidate.audience!,
    }));
}
