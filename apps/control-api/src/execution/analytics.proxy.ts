import { readFile } from "node:fs/promises";
import { ClientHttp2Session, connect } from "node:http2";
import { OnApplicationShutdown } from "@nestjs/common";
import { ControlApiConfig } from "../config";
import { AuthSession, PortalUser } from "../domain";
import { ExecutionDelegationService } from "./delegation";

const IDENTIFIER = /^[A-Za-z0-9._-]{1,128}$/;
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
  | "account-broker-360";

export function analyticsResource(screen: Screen, id: string): string {
  if (!IDENTIFIER.test(id)) throw new AnalyticsProxyError("ANALYTICS_IDENTIFIER_INVALID", 400);
  return `execution:screen:${screen}:${id}`;
}

/** Session-bound, bounded JSON bridge to the private mTLS Rust screen APIs. */
export class ExecutionAnalyticsProxy implements OnApplicationShutdown {
  private session: ClientHttp2Session | null = null;
  private connecting: Promise<ClientHttp2Session> | null = null;

  private constructor(
    private readonly config: ControlApiConfig,
    private readonly delegation: ExecutionDelegationService | null,
    private readonly tls: { ca: Buffer; cert: Buffer; key: Buffer } | null,
  ) {}

  static async create(config: ControlApiConfig): Promise<ExecutionAnalyticsProxy> {
    if (config.FEATURE_EXECUTION_ANALYTICS_QUERY !== "true") {
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
    return this.request(
      principal,
      "POST",
      `/internal/v1/screens/gate-r2/${segment(approvalId)}/capital-preview`,
      analyticsResource("gate-r2", approvalId),
      body,
    );
  }

  orderFunnel(principal: AnalyticsPrincipal, orderId: string): Promise<unknown> {
    return this.request(
      principal,
      "GET",
      `/internal/v1/screens/blotter/orders/${segment(orderId)}/funnel`,
      analyticsResource("blotter", orderId),
    );
  }

  insightPreviews(principal: AnalyticsPrincipal, alphaId: string, body: unknown): Promise<unknown> {
    return this.request(
      principal,
      "POST",
      `/internal/v1/screens/alpha-360/${segment(alphaId)}/insight-previews`,
      analyticsResource("alpha-360", alphaId),
      body,
    );
  }

  portfolioCorrelation(principal: AnalyticsPrincipal, portfolioId: string): Promise<unknown> {
    return this.request(
      principal,
      "GET",
      `/internal/v1/screens/portfolio-360/${segment(portfolioId)}/correlation`,
      analyticsResource("portfolio-360", portfolioId),
    );
  }

  capitalLedger(principal: AnalyticsPrincipal, portfolioId: string): Promise<unknown> {
    return this.request(
      principal,
      "GET",
      `/internal/v1/screens/portfolio-360/${segment(portfolioId)}/capital-ledger`,
      analyticsResource("portfolio-360", portfolioId),
    );
  }

  bindingExposure(principal: AnalyticsPrincipal, bindingId: string): Promise<unknown> {
    return this.request(
      principal,
      "GET",
      `/internal/v1/screens/account-broker-360/${segment(bindingId)}/exposure`,
      analyticsResource("account-broker-360", bindingId),
    );
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
      const timeout = setTimeout(() => {
        stream.close();
        reject(new AnalyticsProxyError("ANALYTICS_UPSTREAM_TIMEOUT", 504));
      }, this.config.EXECUTION_EDGE_CONNECT_TIMEOUT_MS);
      stream.on("response", (headers) => {
        status = Number(headers[":status"] ?? 502);
      });
      stream.on("data", (chunk: Buffer) => {
        size += chunk.byteLength;
        if (size > MAX_RESPONSE_BYTES) {
          clearTimeout(timeout);
          stream.close();
          reject(new AnalyticsProxyError("ANALYTICS_RESPONSE_TOO_LARGE", 502));
          return;
        }
        chunks.push(chunk);
      });
      stream.once("error", () => {
        clearTimeout(timeout);
        reject(new AnalyticsProxyError("ANALYTICS_UPSTREAM_UNAVAILABLE", 502));
      });
      stream.once("end", () => {
        clearTimeout(timeout);
        if (status < 200 || status >= 300) {
          reject(new AnalyticsProxyError("ANALYTICS_UPSTREAM_REJECTED", status));
          return;
        }
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        } catch {
          reject(new AnalyticsProxyError("ANALYTICS_UPSTREAM_CONTRACT_INVALID", 502));
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
      const timeout = setTimeout(() => {
        session.destroy();
        reject(new AnalyticsProxyError("ANALYTICS_CONNECT_TIMEOUT", 504));
      }, this.config.EXECUTION_EDGE_CONNECT_TIMEOUT_MS);
      session.once("connect", () => {
        clearTimeout(timeout);
        this.session = session;
        resolve(session);
      });
      session.once("error", () => {
        clearTimeout(timeout);
        if (this.session === session) this.session = null;
        reject(new AnalyticsProxyError("ANALYTICS_CONNECT_FAILED", 502));
      });
      session.once("close", () => {
        if (this.session === session) this.session = null;
      });
    });
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
