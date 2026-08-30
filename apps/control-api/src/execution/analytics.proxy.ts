import { readFile } from "node:fs/promises";
import { ClientHttp2Session, connect } from "node:http2";
import { OnApplicationShutdown } from "@nestjs/common";
import { ControlApiConfig } from "../config";
import { AuthSession, PortalUser } from "../domain";
import { ExecutionDelegationService } from "./delegation";

const IDENTIFIER = /^[A-Za-z0-9._-]{1,128}$/;
const TYPED_UPSTREAM_CODE = /^(?:N07|N25|ANALYTICS)_[A-Z0-9_]{1,80}$/;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export interface AnalyticsPrincipal {
  user: PortalUser;
  session: AuthSession;
  workspaceId: string;
}

type Screen =
  | "gate-r2"
  | "blotter"
  | "alpha-360"
  | "portfolio-360"
  | "account-broker-360"
  | "paper-workbench";

export type QueryAnalyticsSubjectKind = "deployment" | "alpha" | "portfolio" | "live-gate";

const QUERY_ANALYTICS_SCREEN: Readonly<Record<QueryAnalyticsSubjectKind, string>> = {
  deployment: "EXECUTION_PAPER_WORKBENCH_SCREEN",
  alpha: "EXECUTION_ALPHA_360_SCREEN",
  portfolio: "EXECUTION_PORTFOLIO_360_SCREEN",
  "live-gate": "EXECUTION_CANARY_CONTROL_ROOM_SCREEN",
};

export function managerQueryAnalyticsTarget(
  subjectKind: QueryAnalyticsSubjectKind,
  subjectId: string,
): { path: string; resource: string } {
  if (!IDENTIFIER.test(subjectId)) {
    throw new AnalyticsProxyError("ANALYTICS_IDENTIFIER_INVALID", 400);
  }
  return {
    path: `/internal/v1/query-analytics/${subjectKind}/${segment(subjectId)}`,
    resource: `execution:current-source:${QUERY_ANALYTICS_SCREEN[subjectKind]}:read`,
  };
}

export function analyticsResource(screen: Screen, id: string): string {
  if (!IDENTIFIER.test(id)) throw new AnalyticsProxyError("ANALYTICS_IDENTIFIER_INVALID", 400);
  return `execution:screen:${screen}:${id}`;
}

interface BulkheadWaiter {
  resolve: (release: () => void) => void;
  reject: (error: AnalyticsProxyError) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** FIFO, process-local admission control for the private analytics transport. */
export class AnalyticsBulkhead {
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
      return Promise.reject(new AnalyticsProxyError("ANALYTICS_QUEUE_FULL", 503));
    }
    return new Promise((resolve, reject) => {
      const waiter: BulkheadWaiter = {
        resolve,
        reject,
        timer: setTimeout(() => {
          const index = this.queue.indexOf(waiter);
          if (index >= 0) this.queue.splice(index, 1);
          reject(new AnalyticsProxyError("ANALYTICS_QUEUE_TIMEOUT", 503));
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

/** Session-bound, bounded JSON bridge to the private mTLS Rust screen APIs. */
export class ExecutionAnalyticsProxy implements OnApplicationShutdown {
  private session: ClientHttp2Session | null = null;
  private connecting: Promise<ClientHttp2Session> | null = null;
  private readonly bulkhead: AnalyticsBulkhead;

  private constructor(
    private readonly config: ControlApiConfig,
    private readonly delegation: ExecutionDelegationService | null,
    private readonly tls: { ca: Buffer; cert: Buffer; key: Buffer } | null,
  ) {
    this.bulkhead = new AnalyticsBulkhead(
      config.EXECUTION_EDGE_ANALYTICS_MAXIMUM_CONCURRENCY,
      config.EXECUTION_EDGE_ANALYTICS_MAXIMUM_QUEUE,
      config.EXECUTION_EDGE_ANALYTICS_QUEUE_TIMEOUT_MS,
    );
  }

  static async create(config: ControlApiConfig): Promise<ExecutionAnalyticsProxy> {
    if (
      config.FEATURE_EXECUTION_ANALYTICS_QUERY !== "true" &&
      config.FEATURE_EXECUTION_SHADOW_QUERY !== "true"
    ) {
      return new ExecutionAnalyticsProxy(config, null, null);
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
    return new ExecutionAnalyticsProxy(config, delegation, { ca, cert, key });
  }

  capitalPreview(principal: AnalyticsPrincipal, approvalId: string, body: unknown): Promise<unknown> {
    this.requireAnalytics();
    return this.request(
      principal,
      "POST",
      `/internal/v1/screens/gate-r2/${segment(approvalId)}/capital-preview`,
      analyticsResource("gate-r2", approvalId),
      body,
    );
  }

  orderFunnel(principal: AnalyticsPrincipal, orderId: string): Promise<unknown> {
    this.requireAnalytics();
    return this.request(
      principal,
      "GET",
      `/internal/v1/screens/blotter/orders/${segment(orderId)}/funnel`,
      analyticsResource("blotter", orderId),
    );
  }

  insightPreviews(principal: AnalyticsPrincipal, alphaId: string, body: unknown): Promise<unknown> {
    this.requireAnalytics();
    return this.request(
      principal,
      "POST",
      `/internal/v1/screens/alpha-360/${segment(alphaId)}/insight-previews`,
      analyticsResource("alpha-360", alphaId),
      body,
    );
  }

  portfolioCorrelation(principal: AnalyticsPrincipal, portfolioId: string): Promise<unknown> {
    this.requireAnalytics();
    return this.request(
      principal,
      "GET",
      `/internal/v1/screens/portfolio-360/${segment(portfolioId)}/correlation`,
      analyticsResource("portfolio-360", portfolioId),
    );
  }

  capitalLedger(principal: AnalyticsPrincipal, portfolioId: string): Promise<unknown> {
    this.requireAnalytics();
    return this.request(
      principal,
      "GET",
      `/internal/v1/screens/portfolio-360/${segment(portfolioId)}/capital-ledger`,
      analyticsResource("portfolio-360", portfolioId),
    );
  }

  bindingExposure(principal: AnalyticsPrincipal, bindingId: string): Promise<unknown> {
    this.requireAnalytics();
    return this.request(
      principal,
      "GET",
      `/internal/v1/screens/account-broker-360/${segment(bindingId)}/exposure`,
      analyticsResource("account-broker-360", bindingId),
    );
  }

  paperWorkbenchPanel(
    principal: AnalyticsPrincipal,
    deploymentId: string,
    panel: "orders" | "positions",
    body: unknown,
  ): Promise<unknown> {
    if (
      this.config.FEATURE_EXECUTION_SHADOW_QUERY !== "true" ||
      this.config.FEATURE_EXECUTION_PAPER_WORKBENCH_SHADOW !== "true"
    ) {
      throw new AnalyticsProxyError("N07_SHADOW_SCREEN_DISABLED", 404);
    }
    return this.request(
      principal,
      "POST",
      `/internal/v1/screens/paper-workbench/${segment(deploymentId)}/${panel}/query`,
      analyticsResource("paper-workbench", deploymentId),
      body,
    );
  }

  managerQueryAnalytics(
    principal: AnalyticsPrincipal,
    subjectKind: QueryAnalyticsSubjectKind,
    subjectId: string,
  ): Promise<unknown> {
    this.requireAnalytics();
    const target = managerQueryAnalyticsTarget(subjectKind, subjectId);
    return this.request(
      principal,
      "GET",
      target.path,
      target.resource,
    );
  }

  private requireAnalytics(): void {
    if (this.config.FEATURE_EXECUTION_ANALYTICS_QUERY !== "true") {
      throw new AnalyticsProxyError("ANALYTICS_DISABLED", 404);
    }
  }

  close(): void {
    this.session?.close();
    this.session = null;
  }

  onApplicationShutdown(): void {
    this.close();
  }

  private async request(
    principal: AnalyticsPrincipal,
    method: "GET" | "POST",
    path: string,
    resource: string,
    body?: unknown,
  ): Promise<unknown> {
    if (!this.delegation || !this.tls) throw new AnalyticsProxyError("ANALYTICS_DISABLED", 404);
    const release = await this.bulkhead.acquire();
    try {
      const assertion = await this.delegation.issueReadAssertion({
        principalId: principal.user.userId,
        sessionId: principal.session.sessionId,
        workspaceId: principal.workspaceId,
        roles: [principal.user.role],
        resources: [resource],
        authenticationTime: principal.session.authenticationTime,
        authenticationMethods: ["portal_session"],
      });
      const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body), "utf8");
      if (payload && payload.byteLength > 64 * 1024) {
        throw new AnalyticsProxyError("ANALYTICS_REQUEST_TOO_LARGE", 413);
      }
      const session = await this.getSession();
      return await this.sendRequest(session, assertion, method, path, payload);
    } finally {
      release();
    }
  }

  private sendRequest(
    session: ClientHttp2Session,
    assertion: string,
    method: "GET" | "POST",
    path: string,
    payload?: Buffer,
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const stream = session.request({
        ":method": method,
        ":path": path,
        accept: "application/json",
        authorization: `Bearer ${assertion}`,
        ...(payload
          ? { "content-type": "application/json", "content-length": String(payload.byteLength) }
          : {}),
      });
      const chunks: Buffer[] = [];
      let size = 0;
      let status = 502;
      let responseIsJson = false;
      let settled = false;
      const settle = (error?: AnalyticsProxyError, value?: unknown): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (error) reject(error);
        else resolve(value);
      };
      const timeout = setTimeout(() => {
        settle(new AnalyticsProxyError("ANALYTICS_UPSTREAM_TIMEOUT", 504));
        stream.close();
      }, this.config.EXECUTION_EDGE_ANALYTICS_REQUEST_TIMEOUT_MS);
      stream.on("response", (headers) => {
        status = Number(headers[":status"] ?? 502);
        const contentType = headers["content-type"];
        responseIsJson = typeof contentType === "string" && contentType.startsWith("application/json");
        const contentLength = Number(headers["content-length"] ?? 0);
        if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
          settle(new AnalyticsProxyError("ANALYTICS_RESPONSE_TOO_LARGE", 502));
          stream.close();
        }
      });
      stream.on("data", (chunk: Buffer) => {
        if (settled) return;
        size += chunk.byteLength;
        if (size > MAX_RESPONSE_BYTES) {
          settle(new AnalyticsProxyError("ANALYTICS_RESPONSE_TOO_LARGE", 502));
          stream.close();
          return;
        }
        chunks.push(chunk);
      });
      stream.once("aborted", () => {
        settle(new AnalyticsProxyError("ANALYTICS_UPSTREAM_UNAVAILABLE", 502));
      });
      stream.once("error", () => {
        settle(new AnalyticsProxyError("ANALYTICS_UPSTREAM_UNAVAILABLE", 502));
      });
      stream.once("end", () => {
        if (status < 200 || status >= 300) {
          settle(new AnalyticsProxyError(
            typedUpstreamProblemCode(Buffer.concat(chunks), responseIsJson, status) ??
              "ANALYTICS_UPSTREAM_REJECTED",
            status,
          ));
          return;
        }
        if (!responseIsJson) {
          settle(new AnalyticsProxyError("ANALYTICS_UPSTREAM_CONTRACT_INVALID", 502));
          return;
        }
        try {
          settle(undefined, JSON.parse(Buffer.concat(chunks).toString("utf8")));
        } catch {
          settle(new AnalyticsProxyError("ANALYTICS_UPSTREAM_CONTRACT_INVALID", 502));
        }
      });
      stream.end(payload);
    });
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
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        session.destroy();
        reject(new AnalyticsProxyError("ANALYTICS_CONNECT_TIMEOUT", 504));
      }, this.config.EXECUTION_EDGE_CONNECT_TIMEOUT_MS);
      session.once("connect", () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        this.session = session;
        resolve(session);
      });
      session.once("error", () => {
        clearTimeout(timeout);
        if (this.session === session) this.session = null;
        if (!settled) {
          settled = true;
          reject(new AnalyticsProxyError("ANALYTICS_CONNECT_FAILED", 502));
        }
      });
      session.on("goaway", () => {
        if (this.session === session) this.session = null;
        session.close();
      });
      session.once("close", () => {
        if (this.session === session) this.session = null;
      });
    });
  }
}

/** Preserves only the bounded Rust error code/status contract; no upstream detail is leaked. */
export function typedUpstreamProblemCode(
  body: Buffer,
  responseIsJson: boolean,
  status: number,
): string | null {
  if (!responseIsJson || body.byteLength === 0) return null;
  try {
    const value = JSON.parse(body.toString("utf8")) as unknown;
    if (
      typeof value !== "object" ||
      value === null ||
      !("code" in value) ||
      !("status" in value)
    ) return null;
    const code = (value as { code: unknown }).code;
    const declaredStatus = (value as { status: unknown }).status;
    return typeof code === "string" &&
      TYPED_UPSTREAM_CODE.test(code) &&
      declaredStatus === status
      ? code
      : null;
  } catch {
    return null;
  }
}

function segment(value: string): string {
  if (!IDENTIFIER.test(value)) throw new AnalyticsProxyError("ANALYTICS_IDENTIFIER_INVALID", 400);
  return encodeURIComponent(value);
}

export class AnalyticsProxyError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}
