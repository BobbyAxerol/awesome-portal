import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { ClientHttp2Session, connect } from "node:http2";
import { isIP } from "node:net";
import { OnApplicationShutdown } from "@nestjs/common";
import { ControlApiConfig } from "../config";
import { AuthSession, PortalUser } from "../domain";
import {
  CURRENT_SOURCE_SCREEN_IDS,
  ExecutionDelegationService,
  MANAGER_V2_READ_RESOURCE,
} from "./delegation";
import {
  ExecutionSharedReadRepository,
  SharedReadCacheValue,
  SharedReadScope,
} from "./shared-read.repository";

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

const N22_PAPER_SCREEN_BINDINGS = Object.freeze({
  PAPER_TRADING_SCREEN: Object.freeze({
    capabilityIds: Object.freeze([
      "deployments.positions",
      "deployments.execution-quality",
      "sessions.current",
    ]),
    relations: Object.freeze({
      "manager.deployments": Object.freeze(["strategy_deployments"]),
      "manager.performance": Object.freeze([
        "performance_snapshots",
        "account_equity_snapshots",
        "portfolio_equity_snapshots",
      ]),
      "manager.positions": Object.freeze(["positions_v2"]),
      "manager.sessions": Object.freeze(["execution_sessions"]),
    }),
  }),
  EXECUTION_PAPER_WORKBENCH_SCREEN: Object.freeze({
    capabilityIds: Object.freeze([
      "deployments.positions",
      "deployments.execution-quality",
      "orders.list",
      "orders.fills",
    ]),
    relations: Object.freeze({
      "manager.deployments": Object.freeze(["strategy_deployments"]),
      "manager.performance": Object.freeze([
        "performance_snapshots",
        "account_equity_snapshots",
        "portfolio_equity_snapshots",
      ]),
      "manager.positions": Object.freeze(["positions_v2"]),
      "manager.orders": Object.freeze(["orders"]),
      "manager.fills": Object.freeze(["fills"]),
    }),
  }),
  EXECUTION_PAPER_WORKBENCH_VNM_SCREEN: Object.freeze({
    capabilityIds: Object.freeze([
      "deployments.positions",
      "deployments.execution-quality",
      "orders.list",
      "orders.fills",
    ]),
    relations: Object.freeze({
      "manager.deployments": Object.freeze(["strategy_deployments"]),
      "manager.performance": Object.freeze([
        "performance_snapshots",
        "account_equity_snapshots",
        "portfolio_equity_snapshots",
      ]),
      "manager.positions": Object.freeze(["positions_v2"]),
      "manager.orders": Object.freeze(["orders"]),
      "manager.fills": Object.freeze(["fills"]),
    }),
  }),
  EXECUTION_FULL_BLOTTER_SCREEN: Object.freeze({
    capabilityIds: Object.freeze([
      "orders.list",
      "orders.fills",
      "orders.legs",
      "orders.trace",
    ]),
    relations: Object.freeze({
      "manager.orders": Object.freeze(["orders"]),
      "manager.fills": Object.freeze(["fills"]),
      "manager.conditional-orders": Object.freeze([
        "conditional_order_groups",
        "conditional_order_group_legs",
      ]),
      "manager.sessions": Object.freeze(["execution_sessions"]),
      "manager.reconciliation": Object.freeze(["reconciliation_findings"]),
      "manager.command-journal": Object.freeze(["command_journal"]),
    }),
  }),
  EXECUTION_ACCOUNT_BROKER_360_SCREEN: Object.freeze({
    capabilityIds: Object.freeze([
      "bindings.snapshot", "bindings.exposure-verdict", "accounts.current",
      "reconciliation.current", "deployments.positions",
    ]),
    relations: Object.freeze({
      "manager.accounts": Object.freeze([
        "accounts", "account_balances", "margin_balances",
        "account_sync_effective", "broker_account_sync_effective",
      ]),
      "manager.venue-accounts": Object.freeze(["venue_accounts"]),
      "manager.deployments": Object.freeze(["strategy_deployments"]),
      "manager.positions": Object.freeze(["positions_v2"]),
      "manager.reconciliation": Object.freeze(["reconciliation_findings"]),
    }),
  }),
} as const);

type N22PaperScreenId = keyof typeof N22_PAPER_SCREEN_BINDINGS;

const N23_PROFILE_SCREEN_BINDINGS = Object.freeze({
  sandbox: Object.freeze({
    SANDBOX_TRADING_SCREEN: Object.freeze({
      capabilityIds: Object.freeze([
        "deployments.positions", "reconciliation.current", "sessions.current",
      ]),
      relations: Object.freeze({
        "manager.deployments": Object.freeze(["strategy_deployments"]),
        "manager.positions": Object.freeze(["positions_v2"]),
        "manager.sessions": Object.freeze(["execution_sessions"]),
        "manager.reconciliation": Object.freeze(["reconciliation_findings"]),
      }),
    }),
    EXECUTION_SANDBOX_CERTIFICATION_SCREEN: Object.freeze({
      capabilityIds: Object.freeze([
        "deployments.positions", "reconciliation.current", "accounts.current", "sessions.current",
      ]),
      relations: Object.freeze({
        "manager.deployments": Object.freeze(["strategy_deployments"]),
        "manager.positions": Object.freeze(["positions_v2"]),
        "manager.sessions": Object.freeze(["execution_sessions"]),
        "manager.reconciliation": Object.freeze(["reconciliation_findings"]),
        "manager.accounts": Object.freeze([
          "accounts", "account_balances", "margin_balances",
          "account_sync_effective", "broker_account_sync_effective",
        ]),
      }),
    }),
    EXECUTION_ACCOUNT_BROKER_360_SCREEN: Object.freeze({
      capabilityIds: Object.freeze([
        "bindings.snapshot", "bindings.exposure-verdict", "accounts.current",
        "reconciliation.current", "deployments.positions",
      ]),
      relations: Object.freeze({
        "manager.accounts": Object.freeze([
          "accounts", "account_balances", "margin_balances",
          "account_sync_effective", "broker_account_sync_effective",
        ]),
        "manager.venue-accounts": Object.freeze(["venue_accounts"]),
        "manager.deployments": Object.freeze(["strategy_deployments"]),
        "manager.positions": Object.freeze(["positions_v2"]),
        "manager.reconciliation": Object.freeze(["reconciliation_findings"]),
      }),
    }),
  }),
  live: Object.freeze({
    LIVE_OPERATIONS_SCREEN: Object.freeze({
      capabilityIds: Object.freeze([
        "deployments.positions", "accounts.current", "sessions.current",
      ]),
      relations: Object.freeze({
        "manager.deployments": Object.freeze(["strategy_deployments"]),
        "manager.positions": Object.freeze(["positions_v2"]),
        "manager.sessions": Object.freeze(["execution_sessions"]),
        "manager.accounts": Object.freeze([
          "accounts", "account_balances", "margin_balances",
          "account_sync_effective", "broker_account_sync_effective",
        ]),
      }),
    }),
    EXECUTION_CANARY_CONTROL_ROOM_SCREEN: Object.freeze({
      capabilityIds: Object.freeze([
        "portal.activation", "portal.governance", "deployments.positions",
        "sessions.current", "orders.list", "orders.fills", "accounts.current", "ops.alerts",
      ]),
      relations: Object.freeze({
        "manager.deployments": Object.freeze(["strategy_deployments"]),
        "manager.positions": Object.freeze(["positions_v2"]),
        "manager.sessions": Object.freeze(["execution_sessions"]),
        "manager.orders": Object.freeze(["orders"]),
        "manager.fills": Object.freeze(["fills"]),
        "manager.accounts": Object.freeze([
          "accounts", "account_balances", "margin_balances",
          "account_sync_effective", "broker_account_sync_effective",
        ]),
        "manager.reconciliation": Object.freeze(["reconciliation_findings"]),
      }),
    }),
    EXECUTION_LIVE_FULL_OPERATIONS_SCREEN: Object.freeze({
      capabilityIds: Object.freeze([
        "deployments.positions", "orders.list", "orders.fills",
        "accounts.current", "reconciliation.current", "market.ticks",
      ]),
      relations: Object.freeze({
        "manager.deployments": Object.freeze(["strategy_deployments"]),
        "manager.positions": Object.freeze(["positions_v2"]),
        "manager.orders": Object.freeze(["orders"]),
        "manager.fills": Object.freeze(["fills"]),
        "manager.sessions": Object.freeze(["execution_sessions"]),
        "manager.accounts": Object.freeze([
          "accounts", "account_balances", "margin_balances",
          "account_sync_effective", "broker_account_sync_effective",
        ]),
        "manager.reconciliation": Object.freeze(["reconciliation_findings"]),
      }),
    }),
    EXECUTION_ACCOUNT_BROKER_360_SCREEN: Object.freeze({
      capabilityIds: Object.freeze([
        "bindings.snapshot", "bindings.exposure-verdict", "accounts.current",
        "reconciliation.current", "deployments.positions",
      ]),
      relations: Object.freeze({
        "manager.accounts": Object.freeze([
          "accounts", "account_balances", "margin_balances",
          "account_sync_effective", "broker_account_sync_effective",
        ]),
        "manager.venue-accounts": Object.freeze(["venue_accounts"]),
        "manager.deployments": Object.freeze(["strategy_deployments"]),
        "manager.positions": Object.freeze(["positions_v2"]),
        "manager.reconciliation": Object.freeze(["reconciliation_findings"]),
      }),
    }),
  }),
} as const);

/**
 * BR-EX-72 publishes two workspace-scoped manager list projections. They are
 * deliberately separate from the N22/N23 stage screens: the browser asks for
 * a Portal list and this server-owned binding is the only place where the
 * underlying Manager relations are selected. `venue_credentials` is not in
 * this map and therefore cannot cross the boundary.
 */
const BR72_MANAGER_LIST_SCREEN_BINDINGS = Object.freeze({
  EXECUTION_ALPHA_FLEET_LIST_SCREEN: Object.freeze({
    capabilityIds: Object.freeze([
      "manager.strategies", "manager.deployments", "manager.accounts",
      "manager.portfolios", "manager.positions", "manager.reconciliation",
    ]),
    relations: Object.freeze({
      "manager.strategies": Object.freeze(["strategies"]),
      "manager.deployments": Object.freeze(["strategy_deployments"]),
      "manager.accounts": Object.freeze(["accounts", "account_balances"]),
      "manager.portfolios": Object.freeze(["portfolios", "portfolio_allocations"]),
      "manager.positions": Object.freeze(["positions_v2"]),
      "manager.reconciliation": Object.freeze(["reconciliation_findings"]),
    }),
  }),
  EXECUTION_ACCOUNTS_BINDINGS_LIST_SCREEN: Object.freeze({
    capabilityIds: Object.freeze(["manager.accounts", "manager.venue-accounts"]),
    relations: Object.freeze({
      "manager.accounts": Object.freeze(["accounts", "broker_account_sync_effective"]),
      "manager.venue-accounts": Object.freeze(["venue_accounts"]),
    }),
  }),
} as const);

type Br72ManagerListScreenId = keyof typeof BR72_MANAGER_LIST_SCREEN_BINDINGS;

type N23ProfileEnvironment = keyof typeof N23_PROFILE_SCREEN_BINDINGS;
type ScreenBinding = {
  readonly capabilityIds: readonly string[];
  readonly relations: Readonly<Record<string, readonly string[]>>;
};

/**
 * EDS-07 is an additive retained-financial-read acceptance.  It must remain
 * separate from the historical N22/N23 stage acceptance records: otherwise a
 * later phase silently rewrites what those frozen releases actually accepted.
 * These two relations contain decision records only; they are not a signal,
 * replay, correction, command, or broker authority.
 */
const EDS07_PROFILE_SCREEN_BINDINGS = Object.freeze({
  paper: Object.freeze({
    EXECUTION_GATE_R1_REVIEW_SCREEN: Object.freeze({
      capabilityIds: Object.freeze(["e3.sizing-decisions"]),
      relations: Object.freeze({
        "manager.risk": Object.freeze(["sizing_decisions"]),
      }),
    }),
    EXECUTION_GATE_R2_REVIEW_SCREEN: Object.freeze({
      capabilityIds: Object.freeze(["e3.risk-grants"]),
      relations: Object.freeze({
        "manager.risk": Object.freeze(["risk_grants"]),
      }),
    }),
  }),
  sandbox: Object.freeze({
    EXECUTION_GATE_R1_REVIEW_SCREEN: Object.freeze({
      capabilityIds: Object.freeze(["e3.sizing-decisions"]),
      relations: Object.freeze({
        "manager.risk": Object.freeze(["sizing_decisions"]),
      }),
    }),
    EXECUTION_GATE_R2_REVIEW_SCREEN: Object.freeze({
      capabilityIds: Object.freeze(["e3.risk-grants"]),
      relations: Object.freeze({
        "manager.risk": Object.freeze(["risk_grants"]),
      }),
    }),
  }),
  live: Object.freeze({
    EXECUTION_GATE_R1_REVIEW_SCREEN: Object.freeze({
      capabilityIds: Object.freeze(["e3.sizing-decisions"]),
      relations: Object.freeze({
        "manager.risk": Object.freeze(["sizing_decisions"]),
      }),
    }),
    EXECUTION_GATE_LIVE_REVIEW_SCREEN: Object.freeze({
      capabilityIds: Object.freeze(["e3.risk-grants"]),
      relations: Object.freeze({
        "manager.risk": Object.freeze(["risk_grants"]),
      }),
    }),
  }),
} as const);

type Eds07ProfileEnvironment = keyof typeof EDS07_PROFILE_SCREEN_BINDINGS;

export const N22_PAPER_READ_ACCEPTANCE = Object.freeze({
  schemaVersion: "portal.execution.paper-read-acceptance.v1",
  decision: "N22_FULL_PAPER_READ_ACCEPTED",
  lineageDecision: "N17B_EXACT_CURRENT_SET_ACCEPTED",
  environment: "paper" as const,
  profileId: "PAPER_BINANCE_USDM",
  adapter: "MANAGER_V2_CURRENT_AS_IS",
  sourceContract: "trading-system.portal-execution.manager-v2.runtime.v1",
  screenIds: Object.freeze(Object.keys(N22_PAPER_SCREEN_BINDINGS).sort()),
  sourceMaximumRequestsPerSecond: 20,
});

export const N23_PROFILE_READ_ACCEPTANCE = Object.freeze({
  schemaVersion: "portal.execution.profile-read-acceptance.v1",
  decision: "N23_SANDBOX_LIVE_READ_ACCEPTED",
  lineageDecision: "N22_FULL_PAPER_READ_ACCEPTED",
  adapter: "MANAGER_V2_CURRENT_AS_IS",
  sourceContract: "trading-system.portal-execution.manager-v2.runtime.v1",
  profiles: Object.freeze({
    sandbox: Object.freeze({
      profileId: "SANDBOX_BINANCE_USDM",
      audience: "portal-execution-edge-sandbox",
      screenIds: Object.freeze(Object.keys(N23_PROFILE_SCREEN_BINDINGS.sandbox).sort()),
    }),
    live: Object.freeze({
      profileId: "LIVE_BINANCE_USDM",
      audience: "portal-execution-edge-live",
      screenIds: Object.freeze(Object.keys(N23_PROFILE_SCREEN_BINDINGS.live).sort()),
    }),
  }),
  canaryComposition: "PORTAL_CANARY_GOVERNANCE_OVER_LIVE_FACTS",
  sourceMaximumRequestsPerSecond: 20,
});

export const EDS07_RETAINED_FINANCIAL_READ_ACCEPTANCE = Object.freeze({
  schemaVersion: "portal.execution.retained-financial-read-acceptance.v1",
  decision: "EDS07_RETAINED_FINANCIAL_READ_ACCEPTED",
  lineageDecision: "EDS06_DURABLE_MIRROR_READY",
  adapter: "MANAGER_V2_CURRENT_AS_IS",
  sourceContract: "trading-system.portal-execution.manager-v2.runtime.v1",
  profiles: Object.freeze({
    paper: Object.freeze({
      profileId: "PAPER_BINANCE_USDM",
      screenIds: Object.freeze(Object.keys(EDS07_PROFILE_SCREEN_BINDINGS.paper).sort()),
    }),
    sandbox: Object.freeze({
      profileId: "SANDBOX_BINANCE_USDM",
      screenIds: Object.freeze(Object.keys(EDS07_PROFILE_SCREEN_BINDINGS.sandbox).sort()),
    }),
    live: Object.freeze({
      profileId: "LIVE_BINANCE_USDM",
      screenIds: Object.freeze(Object.keys(EDS07_PROFILE_SCREEN_BINDINGS.live).sort()),
    }),
  }),
  sourceMaximumRequestsPerSecond: 20,
});

export const BR72_MANAGER_LIST_ACCEPTANCE = Object.freeze({
  schemaVersion: "portal.execution.manager-list-acceptance.v1",
  decision: "BR_EX_72_MANAGER_LISTS_ACCEPTED",
  adapter: "MANAGER_V2_CURRENT_AS_IS",
  sourceContract: "trading-system.portal-execution.manager-v2.runtime.v1",
  environments: Object.freeze(["paper", "sandbox", "live"]),
  screenIds: Object.freeze(Object.keys(BR72_MANAGER_LIST_SCREEN_BINDINGS).sort()),
  sourceMaximumRequestsPerSecond: 20,
});

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

/**
 * Server-owned tightening for one frozen product operation.  The general
 * current-source proxy deliberately remains reusable, but an E5 operation
 * must be able to carry its own immutable cache/admission/body boundary.
 * Nothing in this structure is decoded from a browser request.
 */
export interface CurrentSourceOperationPolicy {
  operationId: string;
  sourceId: string;
  adapterRevision: string;
  maximumResponseBytes: number;
  sourceMaximumConcurrency: number;
  profileMaximumConcurrency: number;
}

interface CurrentSourceIdentity {
  principalId: string;
  sessionId: string;
  workspaceId: string;
  role: PortalUser["role"];
  authenticationTime: Date;
  authenticationMethods: string[];
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

/** Process-local FIFO admission bound instantiated independently per profile. */
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
 * Each AWS-HK Source Proxy profile publishes a 20 r/s boundary. Portal admits
 * at most 15 r/s per profile and rejects excess bounded work instead of
 * retrying or translating source pressure into an unbounded queue.
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
  private readonly bulkheads = new Map<string, CurrentSourceBulkhead>();
  private readonly rateLimiters = new Map<string, CurrentSourceRateLimiter>();

  private constructor(
    private readonly config: ControlApiConfig,
    private readonly profiles: Map<string, ProfileTransport>,
    private readonly tls: { ca: Buffer; cert: Buffer; key: Buffer } | null,
    private readonly sharedReads: ExecutionSharedReadRepository,
  ) {
    for (const profile of profiles.values()) {
      this.bulkheads.set(profile.profileId, new CurrentSourceBulkhead(
        config.EXECUTION_EDGE_CURRENT_SOURCE_MAXIMUM_CONCURRENCY,
        config.EXECUTION_EDGE_CURRENT_SOURCE_MAXIMUM_QUEUE,
        config.EXECUTION_EDGE_CURRENT_SOURCE_QUEUE_TIMEOUT_MS,
      ));
      this.rateLimiters.set(profile.profileId, new CurrentSourceRateLimiter(
        config.EXECUTION_EDGE_CURRENT_SOURCE_MAX_REQUESTS_PER_SECOND,
        config.EXECUTION_EDGE_CURRENT_SOURCE_MAXIMUM_PACE_WAIT_MS,
      ));
    }
  }

  static async create(
    config: ControlApiConfig,
    sharedReads: ExecutionSharedReadRepository,
  ): Promise<ExecutionCurrentSourceProxy> {
    const enabled = enabledProfileConfigurations(config);
    if (enabled.length === 0) {
      return new ExecutionCurrentSourceProxy(config, new Map(), null, sharedReads);
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
    return new ExecutionCurrentSourceProxy(config, profiles, { ca, cert, key }, sharedReads);
  }

  screen(
    principal: CurrentSourcePrincipal,
    environment: CurrentSourceEnvironment,
    screenId: string,
  ): Promise<unknown> {
    assertAcceptedProfileRead(environment, screenId);
    return this.request(
      browserIdentity(principal),
      environment,
      screenId,
      acceptedManagerV2Path(environment, screenId),
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
    assertAcceptedProfileRead(environment, screenId);
    const path = acceptedManagerV2Path(environment, screenId, sourceId, relation, query);
    return this.request(browserIdentity(principal), environment, screenId, path);
  }

  /**
   * Fixed-operation path for a Portal-owned BFF.  Unlike `relation`, callers
   * must supply a compile-time operation policy and cannot inherit the broad
   * shared cache/admission identity used by a screen aggregate.  The source
   * relation is still checked against the existing accepted screen map before
   * a request is issued.
   */
  relationForNamedOperation(
    principal: CurrentSourcePrincipal,
    environment: Exclude<CurrentSourceEnvironment, "canary">,
    screenId: string,
    sourceId: string,
    relation: string,
    query: CurrentSourcePageQuery,
    policy: CurrentSourceOperationPolicy,
  ): Promise<unknown> {
    assertAcceptedProfileRead(environment, screenId);
    assertNamedOperationPolicy(policy, sourceId, this.config);
    const path = acceptedManagerV2Path(environment, screenId, sourceId, relation, query);
    return this.request(browserIdentity(principal), environment, screenId, path, policy);
  }

  /**
   * Dedicated service-to-service read used only by the lease-controlled SGP
   * projection worker. It carries no browser session and cannot request a
   * command resource or arbitrary route.
   */
  relationForProjection(
    workspaceId: string,
    environment: Exclude<CurrentSourceEnvironment, "canary">,
    screenId: string,
    sourceId: string,
    relation: string,
    query: CurrentSourcePageQuery,
  ): Promise<unknown> {
    assertAcceptedProfileRead(environment, screenId);
    const path = acceptedManagerV2Path(environment, screenId, sourceId, relation, query);
    return this.request({
      principalId: "portal-execution-projection-worker",
      sessionId: `projection-${environment}`,
      workspaceId,
      role: "ADMIN",
      authenticationTime: new Date(),
      authenticationMethods: ["service_identity", "mtls"],
    }, environment, screenId, path);
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
    principal: CurrentSourceIdentity,
    requestedEnvironment: CurrentSourceEnvironment,
    screenId: string,
    path: string,
    operationPolicy?: CurrentSourceOperationPolicy,
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
    const scope: SharedReadScope = {
      sourceId: operationPolicy?.sourceId ?? "manager-v2",
      profileId: profile.profileId,
      workspaceId: principal.workspaceId,
      principalId: principal.principalId,
      principalRole: principal.role,
      adapterRevision: operationPolicy?.adapterRevision ?? (requestedEnvironment === "paper"
        ? N22_PAPER_READ_ACCEPTANCE.adapter
        : N23_PROFILE_READ_ACCEPTANCE.adapter),
      requestPath: path,
      ...(operationPolicy ? {
        admission: {
          sourceMaximumConcurrency: operationPolicy.sourceMaximumConcurrency,
          profileMaximumConcurrency: operationPolicy.profileMaximumConcurrency,
        },
      } : {}),
    };
    const shared = await this.sharedReads.begin(scope);
    if (shared.kind === "CACHE_HIT") {
      return this.composedResponse(
        requestedEnvironment, sourceEnvironment, screenId, profile.profileId,
        shared.value, "HIT",
      );
    }
    if (shared.kind === "FOLLOWER") {
      const value = await this.sharedReads.waitForLeader(scope, shared.cacheKey);
      if (!value) {
        throw new CurrentSourceProxyError("N21_COALESCED_SOURCE_UNAVAILABLE", 503, {
          availability: "DEGRADED", retryable: false,
        });
      }
      return this.composedResponse(
        requestedEnvironment, sourceEnvironment, screenId, profile.profileId,
        value, "COALESCED",
      );
    }
    if (shared.kind === "DENIED") {
      throw new CurrentSourceProxyError(shared.reasonCode, 503, {
        availability: "DEGRADED", retryable: false,
      });
    }
    let sharedCompleted = false;
    const bulkhead = this.bulkheads.get(profile.profileId);
    const rateLimiter = this.rateLimiters.get(profile.profileId);
    if (!bulkhead || !rateLimiter) {
      throw new CurrentSourceProxyError("N23_PROFILE_ADMISSION_NOT_CONFIGURED", 503);
    }
    const release = await bulkhead.acquire();
    try {
      // The PostgreSQL pacer is the cross-replica authority. This local pacer
      // remains a second, burst-free defence and can never increase traffic.
      if (shared.waitMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, shared.waitMs));
      }
      await rateLimiter.acquire();
      const assertion = await profile.delegation.issueReadAssertion({
        principalId: principal.principalId,
        sessionId: principal.sessionId,
        workspaceId: principal.workspaceId,
        roles: [principal.role],
        resources: [MANAGER_V2_READ_RESOURCE],
        authenticationTime: principal.authenticationTime,
        authenticationMethods: principal.authenticationMethods,
      });
      const session = await this.getSession(profile);
      const source = await this.sendRequest(
        session,
        assertion,
        path,
        operationPolicy?.maximumResponseBytes,
        operationPolicy ? "EDS01_RESPONSE_TOO_LARGE" : "N13B_RESPONSE_TOO_LARGE",
      );
      const value = await this.sharedReads.complete(scope, shared, source);
      sharedCompleted = true;
      return this.composedResponse(
        requestedEnvironment, sourceEnvironment, screenId, profile.profileId,
        value, "MISS",
      );
    } finally {
      release();
      if (!sharedCompleted) {
        // The source failure remains authoritative. Lease cleanup is best
        // effort because both records expire by PostgreSQL time and a cleanup
        // outage must not mask the original bounded, non-retried failure.
        await this.sharedReads.fail(shared).catch(() => undefined);
      }
    }
  }

  private composedResponse(
    requestedEnvironment: CurrentSourceEnvironment,
    sourceEnvironment: Exclude<CurrentSourceEnvironment, "canary">,
    screenId: string,
    profileId: string,
    cached: SharedReadCacheValue,
    cacheState: "HIT" | "MISS" | "COALESCED",
  ): unknown {
    const { binding, acceptance } = acceptedScreenBinding(requestedEnvironment, screenId);
    return {
      schema_version: "portal.execution.current-source-bff.v2",
      authority: "PORTAL_CONTROL_API",
      as_of: cached.metadata.asOf,
      freshness: cached.metadata.freshness,
      completeness: cached.metadata.completeness,
      requested_environment: requestedEnvironment,
      source_environment: sourceEnvironment,
      profile_id: profileId,
      gateway: {
          interface: "QUERY",
          acceptance: acceptance.decision,
          adapter: acceptance.adapter,
          source_contract: acceptance.sourceContract,
          screen_id: screenId,
          capability_ids: binding.capabilityIds,
          source_binding_ids: Object.keys(binding.relations).sort(),
          request_id: randomUUID(),
          transport: "H2_MTLS_DELEGATED_JWT",
          source_maximum_requests_per_second:
            acceptance.sourceMaximumRequestsPerSecond,
          portal_maximum_requests_per_second:
            this.config.EXECUTION_EDGE_CURRENT_SOURCE_MAX_REQUESTS_PER_SECOND,
          retry_count: 0,
          cache: {
            state: cacheState,
            etag: cached.etag,
            stored_at: cached.storedAt,
            expires_at: cached.expiresAt,
            source_authority: cached.metadata.authority,
          },
      },
      ...(requestedEnvironment === "canary"
        ? { composition: N23_PROFILE_READ_ACCEPTANCE.canaryComposition }
        : {}),
      source: cached.body,
    };
  }

  private sendRequest(
    session: ClientHttp2Session,
    assertion: string,
    path: string,
    maximumResponseBytes = this.config.EXECUTION_EDGE_CURRENT_SOURCE_MAX_RESPONSE_BYTES,
    responseTooLargeCode = "N13B_RESPONSE_TOO_LARGE",
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
          contentLength > maximumResponseBytes
        ) {
          settle(new CurrentSourceProxyError(responseTooLargeCode, 502));
          stream.close();
        }
      });
      stream.on("data", (chunk: Buffer) => {
        if (settled) return;
        size += chunk.byteLength;
        if (size > maximumResponseBytes) {
          settle(new CurrentSourceProxyError(responseTooLargeCode, 502));
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
        servername: isIP(profile.origin.hostname) === 0 ? profile.origin.hostname : undefined,
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

function assertNamedOperationPolicy(
  policy: CurrentSourceOperationPolicy,
  sourceId: string,
  config: ControlApiConfig,
): void {
  if (
    !/^[A-Za-z][A-Za-z0-9]{2,127}$/.test(policy.operationId) ||
    policy.sourceId !== sourceId ||
    !SOURCE_ID.test(policy.sourceId) ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{2,190}$/.test(policy.adapterRevision) ||
    !Number.isInteger(policy.maximumResponseBytes) ||
    policy.maximumResponseBytes < 64 * 1024 ||
    policy.maximumResponseBytes > config.EXECUTION_EDGE_CURRENT_SOURCE_MAX_RESPONSE_BYTES ||
    !Number.isInteger(policy.sourceMaximumConcurrency) ||
    !Number.isInteger(policy.profileMaximumConcurrency) ||
    policy.sourceMaximumConcurrency < 1 || policy.sourceMaximumConcurrency > 512 ||
    policy.profileMaximumConcurrency < 1 || policy.profileMaximumConcurrency > 512
  ) {
    throw new CurrentSourceProxyError("EDS01_OPERATION_POLICY_INVALID", 500);
  }
}

export function assertN22PaperReadAccepted(
  environment: CurrentSourceEnvironment,
  screenId: string,
): asserts screenId is N22PaperScreenId {
  if (environment !== "paper" || !(screenId in N22_PAPER_SCREEN_BINDINGS)) {
    throw new CurrentSourceProxyError("N22_PAPER_READ_NOT_ACCEPTED", 404, {
      classification: "SUPPORTED_BUT_NOT_ACTIVATED",
      availability: "UNAVAILABLE",
      reason_code: "N22_PAPER_SCREEN_OUTSIDE_RELEASE",
      requested_environment: environment,
      requested_screen_id: screenId,
    });
  }
  // Preserve the narrower N15B acceptance as an explicit invariant for the
  // original Paper Overview slice while N22 adds three sibling product paths.
  if (screenId === N15B_CURRENT_QUERY_ACCEPTANCE.screenId) {
    assertN15bCurrentQueryAccepted(environment, screenId);
  }
}

function n22PaperScreenBinding(screenId: string) {
  assertN22PaperReadAccepted("paper", screenId);
  return N22_PAPER_SCREEN_BINDINGS[screenId];
}

function eds07BindingIfAccepted(
  environment: CurrentSourceEnvironment,
  screenId: string,
): ScreenBinding | null {
  if (environment === "canary" || !(environment in EDS07_PROFILE_SCREEN_BINDINGS)) return null;
  const bindings = EDS07_PROFILE_SCREEN_BINDINGS[environment as Eds07ProfileEnvironment] as Readonly<
    Record<string, ScreenBinding>
  >;
  return bindings[screenId] ?? null;
}

export function assertEds07RetainedFinancialReadAccepted(
  environment: CurrentSourceEnvironment,
  screenId: string,
): void {
  const binding = eds07BindingIfAccepted(environment, screenId);
  if (!binding) {
    throw new CurrentSourceProxyError("EDS07_RETAINED_FINANCIAL_READ_NOT_ACCEPTED", 404, {
      classification: "SUPPORTED_BUT_NOT_ACTIVATED",
      availability: "UNAVAILABLE",
      reason_code: "EDS07_SCREEN_OR_PROFILE_OUTSIDE_RETAINED_FINANCIAL_SET",
      requested_environment: environment,
      requested_screen_id: screenId,
    });
  }
}

export function retainedFinancialManagerV2Path(
  environment: Exclude<CurrentSourceEnvironment, "canary">,
  screenId: string,
  sourceId?: string,
  relation?: string,
  query: CurrentSourcePageQuery = {},
): string {
  assertEds07RetainedFinancialReadAccepted(environment, screenId);
  const binding = eds07BindingIfAccepted(environment, screenId);
  // The preceding assertion makes this unreachable; retain the guard so a
  // future map edit cannot produce an undefined relation binding.
  if (!binding) throw new CurrentSourceProxyError("EDS07_RETAINED_FINANCIAL_READ_NOT_ACCEPTED", 404);
  return managerV2Path(binding, "EDS07", sourceId, relation, query);
}

export function assertN23ProfileReadAccepted(
  environment: CurrentSourceEnvironment,
  screenId: string,
): void {
  const sourceEnvironment = environment === "canary" ? "live" : environment;
  if (sourceEnvironment !== "sandbox" && sourceEnvironment !== "live") {
    throw new CurrentSourceProxyError("N23_PROFILE_READ_NOT_ACCEPTED", 404, {
      classification: "SUPPORTED_BUT_NOT_ACTIVATED",
      availability: "UNAVAILABLE",
      reason_code: "N23_PROFILE_OUTSIDE_RELEASE",
      requested_environment: environment,
      requested_screen_id: screenId,
    });
  }
  if (environment === "canary" && screenId !== CANARY_SCREEN) {
    throw new CurrentSourceProxyError("N23_CANARY_COMPOSITION_INVALID", 400, {
      availability: "UNAVAILABLE",
      reason_code: "CANARY_MUST_USE_LIVE_FACTS",
    });
  }
  if (!(screenId in N23_PROFILE_SCREEN_BINDINGS[sourceEnvironment])) {
    throw new CurrentSourceProxyError("N23_PROFILE_READ_NOT_ACCEPTED", 404, {
      classification: "SUPPORTED_BUT_NOT_ACTIVATED",
      availability: "UNAVAILABLE",
      reason_code: "N23_SCREEN_OUTSIDE_RELEASE",
      requested_environment: environment,
      requested_screen_id: screenId,
    });
  }
}

function assertAcceptedProfileRead(
  environment: CurrentSourceEnvironment,
  screenId: string,
): void {
  if (screenId in BR72_MANAGER_LIST_SCREEN_BINDINGS) {
    assertBr72ManagerListAccepted(environment, screenId);
    return;
  }
  if (eds07BindingIfAccepted(environment, screenId)) {
    assertEds07RetainedFinancialReadAccepted(environment, screenId);
    return;
  }
  if (environment === "paper") {
    assertN22PaperReadAccepted(environment, screenId);
    return;
  }
  assertN23ProfileReadAccepted(environment, screenId);
}

function acceptedScreenBinding(
  environment: CurrentSourceEnvironment,
  screenId: string,
): {
  binding: ScreenBinding;
  acceptance: {
    readonly decision: string;
    readonly adapter: string;
    readonly sourceContract: string;
    readonly sourceMaximumRequestsPerSecond: number;
  };
} {
  if (screenId in BR72_MANAGER_LIST_SCREEN_BINDINGS) {
    assertBr72ManagerListAccepted(environment, screenId);
    return {
      binding: BR72_MANAGER_LIST_SCREEN_BINDINGS[screenId as Br72ManagerListScreenId],
      acceptance: BR72_MANAGER_LIST_ACCEPTANCE,
    };
  }
  const eds07 = eds07BindingIfAccepted(environment, screenId);
  if (eds07) {
    assertEds07RetainedFinancialReadAccepted(environment, screenId);
    return { binding: eds07, acceptance: EDS07_RETAINED_FINANCIAL_READ_ACCEPTANCE };
  }
  if (environment === "paper") {
    return { binding: n22PaperScreenBinding(screenId), acceptance: N22_PAPER_READ_ACCEPTANCE };
  }
  assertN23ProfileReadAccepted(environment, screenId);
  const sourceEnvironment = environment === "canary" ? "live" : environment;
  const profileBindings = N23_PROFILE_SCREEN_BINDINGS[sourceEnvironment] as Readonly<
    Record<string, ScreenBinding>
  >;
  return {
    binding: profileBindings[screenId],
    acceptance: N23_PROFILE_READ_ACCEPTANCE,
  };
}

export function profileManagerV2Path(
  environment: "sandbox" | "live" | "canary",
  screenId: string,
  sourceId?: string,
  relation?: string,
  query: CurrentSourcePageQuery = {},
): string {
  const { binding } = acceptedScreenBinding(environment, screenId);
  return managerV2Path(binding, "N23", sourceId, relation, query);
}

export function assertBr72ManagerListAccepted(
  environment: CurrentSourceEnvironment,
  screenId: string,
): asserts screenId is Br72ManagerListScreenId {
  if (
    !BR72_MANAGER_LIST_ACCEPTANCE.environments.includes(
      environment as (typeof BR72_MANAGER_LIST_ACCEPTANCE.environments)[number],
    ) ||
    !(screenId in BR72_MANAGER_LIST_SCREEN_BINDINGS)
  ) {
    throw new CurrentSourceProxyError("BR72_MANAGER_LIST_NOT_ACCEPTED", 404, {
      classification: "SUPPORTED_BUT_NOT_ACTIVATED",
      availability: "UNAVAILABLE",
      reason_code: "BR72_SCREEN_OR_PROFILE_OUTSIDE_RELEASE",
      requested_environment: environment,
      requested_screen_id: screenId,
    });
  }
}

export function managerListManagerV2Path(
  environment: CurrentSourceEnvironment,
  screenId: string,
  sourceId?: string,
  relation?: string,
  query: CurrentSourcePageQuery = {},
): string {
  assertBr72ManagerListAccepted(environment, screenId);
  return managerV2Path(
    BR72_MANAGER_LIST_SCREEN_BINDINGS[screenId],
    "BR72",
    sourceId,
    relation,
    query,
  );
}

function acceptedManagerV2Path(
  environment: CurrentSourceEnvironment,
  screenId: string,
  sourceId?: string,
  relation?: string,
  query: CurrentSourcePageQuery = {},
): string {
  const { binding, acceptance } = acceptedScreenBinding(environment, screenId);
  return managerV2Path(binding, managerV2ErrorPrefix(acceptance.decision), sourceId, relation, query);
}

/**
 * N22 expands only the four Paper product paths declared by the canonical
 * screen catalogue. The browser still cannot select a Manager relation: each
 * source alias and relation pair is resolved from this server-owned map.
 */
export function paperManagerV2Path(
  screenId: string,
  sourceId?: string,
  relation?: string,
  query: CurrentSourcePageQuery = {},
): string {
  const binding = n22PaperScreenBinding(screenId);
  return managerV2Path(binding, "N22_PAPER", sourceId, relation, query);
}

function managerV2Path(
  binding: ScreenBinding,
  errorPrefix: "N22_PAPER" | "N23" | "BR72" | "EDS07",
  sourceId?: string,
  relation?: string,
  query: CurrentSourcePageQuery = {},
): string {
  if (sourceId === undefined && relation === undefined) {
    return "/internal/v2/manager/capabilities";
  }
  if (
    sourceId === undefined ||
    relation === undefined ||
    !SOURCE_ID.test(sourceId) ||
    !RELATION.test(relation)
  ) {
    throw new CurrentSourceProxyError(`${errorPrefix}_BINDING_INVALID`, 400);
  }
  const acceptedRelations = binding.relations[sourceId];
  if (!acceptedRelations?.includes(relation)) {
    throw new CurrentSourceProxyError(`${errorPrefix}_BINDING_NOT_ACCEPTED`, 404, {
      classification: "SUPPORTED_BUT_NOT_ACTIVATED",
      availability: "UNAVAILABLE",
      reason_code: errorPrefix === "N22_PAPER"
        ? "RELATION_OUTSIDE_N22_PAPER_SET"
        : errorPrefix === "BR72"
          ? "RELATION_OUTSIDE_BR72_MANAGER_LIST_SET"
          : errorPrefix === "EDS07"
            ? "RELATION_OUTSIDE_EDS07_RETAINED_FINANCIAL_SET"
            : "RELATION_OUTSIDE_N23_PROFILE_SET",
    });
  }
  if (
    (query.limit !== undefined &&
      (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 200)) ||
    (query.cursor !== undefined &&
      (query.cursor.length < 1 || Buffer.byteLength(query.cursor, "utf8") > 4096))
  ) {
    throw new CurrentSourceProxyError(`${errorPrefix}_PAGE_INVALID`, 400);
  }
  const parameters = new URLSearchParams();
  if (query.limit !== undefined) parameters.set("limit", String(query.limit));
  if (query.cursor !== undefined) parameters.set("cursor", query.cursor);
  const suffix = parameters.size > 0 ? `?${parameters.toString()}` : "";
  return `/internal/v2/manager/relations/public/${encodeURIComponent(relation)}${suffix}`;
}

function managerV2ErrorPrefix(
  decision: string,
): "N22_PAPER" | "N23" | "BR72" | "EDS07" {
  if (decision === BR72_MANAGER_LIST_ACCEPTANCE.decision) return "BR72";
  if (decision === EDS07_RETAINED_FINANCIAL_READ_ACCEPTANCE.decision) return "EDS07";
  if (decision === N22_PAPER_READ_ACCEPTANCE.decision) return "N22_PAPER";
  return "N23";
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
  const safeStatus = [400, 401, 403, 404, 409, 422, 429, 503, 504].includes(upstreamStatus)
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

function browserIdentity(principal: CurrentSourcePrincipal): CurrentSourceIdentity {
  return {
    principalId: principal.user.userId,
    sessionId: principal.session.sessionId,
    workspaceId: principal.workspaceId,
    role: principal.user.role,
    authenticationTime: principal.session.authenticationTime,
    authenticationMethods: ["portal_session"],
  };
}
