import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Pool } from "pg";
import { buildPool } from "../src/db/pool";
import { type AuthSession, type PortalUser } from "../src/domain";
import { ExecutionFinancialChartController } from "../src/execution/financial-chart.controller";
import { ExecutionFinancialChartService } from "../src/execution/financial-chart.service";
import { ExecutionDurableFinancialRepository } from "../src/execution/durable-financial.repository";
import { ExecutionDurableMirrorRepository } from "../src/execution/durable-mirror.repository";
import {
  ExecutionFinancialQueryCursorRepository,
  FinancialQueryCursorError,
} from "../src/execution/financial-query-cursor.repository";
import {
  ExecutionProfileProjectionRepository,
  type ProfileProjectionDocument,
  type ProjectionCommitInput,
  type ProjectionRelation,
  type ProjectionRow,
} from "../src/execution/profile-projection.repository";
import { profileProjectionCatalog } from "../src/execution/profile-projection.catalog";
import { migrateTestDatabase, testConfig, truncateAll } from "./harness";

const workspaceId = "ws_eds07";
const profileId = "PAPER_BINANCE_USDM";
const sourceRevision = "trading-system.portal-execution.manager-v2.runtime.v1";
const config = testConfig({
  FEATURE_EXECUTION_EDGE: "true",
  EXECUTION_EDGE_PRIVATE_KEY_FILE: "/run/secrets/test/delegation.pem",
  EXECUTION_EDGE_CA_FILE: "/run/secrets/test/ca.crt",
  EXECUTION_EDGE_CLIENT_CERT_FILE: "/run/secrets/test/client.crt",
  EXECUTION_EDGE_CLIENT_KEY_FILE: "/run/secrets/test/client.key",
  FEATURE_EXECUTION_CURRENT_SOURCE_PAPER: "true",
  EXECUTION_EDGE_PAPER_ORIGIN: "https://paper-edge.internal",
  EXECUTION_EDGE_PAPER_PROFILE_ID: profileId,
  EXECUTION_EDGE_PAPER_AUDIENCE: "portal-execution-edge-paper",
  FEATURE_EXECUTION_LOCAL_PROJECTION: "true",
  EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: workspaceId,
  EXECUTION_LOCAL_PROJECTION_POLL_INTERVAL_MS: "15000",
  EXECUTION_LOCAL_PROJECTION_LEASE_TTL_MS: "120000",
  FEATURE_EXECUTION_DURABLE_MIRROR: "true",
  FEATURE_EXECUTION_DURABLE_MIRROR_READS: "true",
});

let pool: Pool;
let mirror: ExecutionDurableMirrorRepository;
let projection: ExecutionProfileProjectionRepository;
let financial: ExecutionDurableFinancialRepository;
let cursors: ExecutionFinancialQueryCursorRepository;
let service: ExecutionFinancialChartService;

beforeAll(async () => {
  await migrateTestDatabase(config.DATABASE_URL);
  pool = buildPool(config.DATABASE_URL);
  mirror = new ExecutionDurableMirrorRepository(config, pool);
  projection = new ExecutionProfileProjectionRepository(pool, mirror);
  financial = new ExecutionDurableFinancialRepository(pool);
  cursors = new ExecutionFinancialQueryCursorRepository(pool, config);
  service = new ExecutionFinancialChartService(config, financial, mirror, cursors);
});

beforeEach(async () => truncateAll(pool));
afterAll(async () => pool.end());

describe("EDS-07 retained financial chart and risk-query BFF", () => {
  it("keeps the endpoint source-dark by default and never attempts a source read", async () => {
    const series = vi.fn();
    const dark = new ExecutionFinancialChartService(
      testConfig(),
      { series } as never,
      mirror,
      cursors,
    );

    const result = await dark.chart(principal(), chartQuery());
    expect(result.panel).toMatchObject({
      state: "UNAVAILABLE",
      reason_code: "EDS07_DURABLE_MIRROR_READS_DISABLED",
      data: null,
    });
    expect(series).not.toHaveBeenCalled();
  });

  it("reads one committed durable revision, preserves exact decimal extrema and bounds a dense chart", async () => {
    await seedFinancialProjection();

    const result = await service.chart(principal(), chartQuery({ includeBenchmark: true }));
    expect(result.panel.state).toBe("PARTIAL");
    expect(result.panel.coverage).toMatchObject({
      source_total: null,
      filtered_total: "601",
      downsampled: true,
      has_more: false,
      next_cursor: null,
    });
    const data = requireData(result.panel.data);
    expect(data.time_basis).toBe("UTC_EPOCH_MS");
    expect(data.scale_mode).toBe("LOG");
    expect(data.currency_policy).toBe("PARTITIONED_BY_SOURCE_CURRENCY_NO_FX_AGGREGATE");
    expect(data.sampling).toMatchObject({
      algorithm: "MIN_MAX_LAST_BUCKET_V1",
      source_rows: "601",
      numeric_rows: "600",
      rejected_rows: "1",
      target_points: 512,
      preserves_extrema: true,
      preserves_first_last: true,
      preserves_gaps: false,
      preserves_markers: false,
    });
    expect(data.sampling.returned_rows).toBeLessThanOrEqual(data.sampling.target_points);
    const values = data.series.flatMap((series) => series.points.map((point) => point[1]));
    expect(values).toContain("0.000000000000000001");
    expect(values).toContain("999999999999999999.123456789123456789");
    expect(values.every((value) => typeof value === "string")).toBe(true);
    expect(data.benchmark).toEqual({
      requested: true,
      state: "UNAVAILABLE",
      reason_code: "EDS07_BENCHMARK_AUTHORITY_UNPUBLISHED",
      series: null,
    });
    expect(data.retention).toMatchObject({
      retention_floor_ms: null,
      retention_floor_state: "UNKNOWN",
      history_semantics: "RETAINED_SNAPSHOT_RANGE_NOT_EVENT_REPLAY_OR_TOTAL_HISTORY",
    });
    expect(result.panel.formula).toMatchObject({
      formula_id: "eds07.direct-retained-financial-series",
      input_digest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("kc1.");
    expect(serialized).not.toContain("manager.performance");
  });

  it("does not fabricate a logarithmic scale when retained drawdown is non-positive", async () => {
    await seedFinancialProjection();

    const result = await service.chart(principal(), {
      environment: "paper",
      subject: { kind: "account", id: "account_eds07" },
      metric: "drawdown",
      fromMs: null,
      toMs: null,
      viewportPx: 960,
      includeBenchmark: false,
    });
    expect(result.panel.state).toBe("READY");
    expect(requireData(result.panel.data).scale_mode).toBe("LINEAR");
  });

  it("maps risk records through an opaque, user-bound Portal cursor without exposing a relation keyset", async () => {
    await seedFinancialProjection();
    const query = {
      environment: "paper" as const,
      subject: { kind: "alpha" as const, id: "alpha_eds07" },
      decisionKind: "risk_grants" as const,
      fromMs: null,
      toMs: null,
      limit: 1,
      after: null,
    };

    const first = await service.decisionRecords(principal(), query);
    expect(first.panel.state).toBe("READY");
    expect(first.panel.coverage).toMatchObject({
      source_total: null,
      filtered_total: "3",
      returned_count: 1,
      truncated: true,
      has_more: true,
    });
    expect(first.panel.coverage.next_cursor).toMatch(/^fqc1\.[0-9a-f-]{36}$/);
    expect(requireData(first.panel.data).records[0]).toMatchObject({
      id: "risk_001",
      strategy_id: "strategy_eds07",
      account_id: "account_eds07",
      created_at_ms: expect.any(Number),
    });
    const cursor = first.panel.coverage.next_cursor!;
    expect(JSON.stringify(first)).not.toContain("kc1.");
    expect(JSON.stringify(first)).not.toContain("manager.risk");

    await expect(service.decisionRecords(principal("usr_other"), { ...query, after: cursor }))
      .rejects.toBeInstanceOf(FinancialQueryCursorError);
    await expect(service.decisionRecords(principal("usr_other"), { ...query, after: cursor }))
      .rejects.toMatchObject({ code: "EDS07_CURSOR_INVALID_OR_EXPIRED", status: 400 });

    const second = await service.decisionRecords(principal(), { ...query, after: cursor });
    expect(requireData(second.panel.data).records[0]?.id).toBe("risk_002");
  });

  it("retains the actual decision-record semantics and activates its range ladders for every supported profile", () => {
    for (const environment of ["paper", "sandbox", "live"] as const) {
      const bindings = profileProjectionCatalog(environment);
      expect(bindings.find((binding) => binding.sourceId === "manager.risk" && binding.relation === "risk_grants")?.ladder)
        .toEqual({ class: "TIME_SERIES", idField: "risk_grant_id", timestampField: "created_at" });
      expect(bindings.find((binding) => binding.sourceId === "manager.risk" && binding.relation === "sizing_decisions")?.ladder)
        .toEqual({ class: "TIME_SERIES", idField: "decision_id", timestampField: "created_at" });
    }
  });

  it("rejects raw relation selection before the named BFF service receives a request", async () => {
    const charts = {
      chart: vi.fn().mockResolvedValue({ schema_version: "test" }),
      decisionRecords: vi.fn(),
    };
    const workspaces = { isMember: vi.fn().mockResolvedValue(true) };
    const controller = new ExecutionFinancialChartController(charts as never, workspaces as never, config);
    const request = {
      portalUser: principal().user,
      portalWorkspaceId: workspaceId,
      portalSession: principal().session,
    } as never;

    await expect(controller.chart(request, {
      environment: "paper",
      subject_kind: "alpha",
      subject_id: "alpha_eds07",
      relation: "manager.performance:performance_snapshots",
    })).rejects.toMatchObject({ code: "EDS07_CHART_QUERY_INVALID", status: 400 });
    expect(charts.chart).not.toHaveBeenCalled();

    await expect(controller.chart(request, {
      workspace_id: "ws_other",
      environment: "paper",
      subject_kind: "alpha",
      subject_id: "alpha_eds07",
    })).rejects.toMatchObject({ code: "EDS07_PROJECTION_WORKSPACE_NOT_FOUND", status: 404 });
    expect(workspaces.isMember).not.toHaveBeenCalled();
  });
});

function chartQuery(overrides: Partial<Parameters<ExecutionFinancialChartService["chart"]>[1]> = {}) {
  return {
    environment: "paper" as const,
    subject: { kind: "alpha" as const, id: "alpha_eds07" },
    metric: "equity" as const,
    fromMs: null,
    toMs: null,
    viewportPx: 256,
    includeBenchmark: false,
    ...overrides,
  };
}

function principal(userId = "usr_eds07"): { user: PortalUser; session: AuthSession; workspaceId: string } {
  const now = new Date("2026-09-05T12:00:00.000Z");
  return {
    user: {
      userId,
      username: userId,
      displayName: userId,
      role: "ADMIN",
      status: "ACTIVE",
      mustChangePassword: false,
      failedLoginCount: 0,
      lockedUntil: null,
      sessionVersion: 1,
      createdAt: now,
      updatedAt: now,
      disabledAt: null,
    },
    session: {
      sessionId: `ses_${userId}`,
      userId,
      state: "ACTIVE",
      sessionVersion: 1,
      authenticationTime: now,
      idleExpiresAt: new Date("2026-09-05T13:00:00.000Z"),
      absoluteExpiresAt: new Date("2026-09-05T20:00:00.000Z"),
    },
    workspaceId,
  };
}

function requireData<T>(value: T | null): T {
  if (value === null) throw new Error("expected a non-null panel data payload");
  return value;
}

async function seedFinancialProjection(): Promise<void> {
  await projection.commit(financialDocument(), {
    sourceEpoch: "manager-v2:PAPER_BINANCE_USDM:runtime.v1",
    sourceCursor: "source-cursor-eds07",
    sourceAsOf: new Date("2026-09-05T10:00:00.000Z"),
    receivedAt: new Date("2026-09-05T10:00:01.000Z"),
    completeness: "COMPLETE",
    retentionSeconds: 3600,
    maximumJournalEntries: 100,
    relationCursors: [],
    retainedRangeRows: {},
  } satisfies ProjectionCommitInput);
}

function financialDocument(): ProfileProjectionDocument {
  const startedAt = Date.parse("2026-09-01T00:00:00.000Z");
  const performance: ProjectionRow[] = Array.from({ length: 600 }, (_, index) => row({
    id: `perf_${String(index).padStart(4, "0")}`,
    ts: new Date(startedAt + index * 60_000).toISOString(),
    strategy_id: "strategy_eds07",
    deployment_id: "deployment_eds07",
    account_id: "account_eds07",
    currency: "USDT",
    equity: index === 97
      ? "0.000000000000000001"
      : index === 431
        ? "999999999999999999.123456789123456789"
        : `${100000 + index}.250000000000000001`,
  }));
  performance.push(row({
    id: "perf_non_numeric",
    ts: new Date(startedAt + 600 * 60_000).toISOString(),
    strategy_id: "strategy_eds07",
    deployment_id: "deployment_eds07",
    account_id: "account_eds07",
    currency: "USDT",
    equity: "not-a-decimal",
  }));

  return {
    schema_version: "portal.execution.profile-projection.v1",
    workspace_id: workspaceId,
    environment: "paper",
    profile_id: profileId,
    source_contract_revision: sourceRevision,
    relations: {
      "manager.strategies:strategies": available("manager.strategies", "strategies", [row({
        strategy_id: "strategy_eds07",
        alpha_id: "alpha_eds07",
        name: "Alpha EDS-07",
        mode: "paper",
      })]),
      "manager.performance:performance_snapshots": available(
        "manager.performance", "performance_snapshots", performance,
      ),
      "manager.performance:account_equity_snapshots": available(
        "manager.performance", "account_equity_snapshots", [
          row({
            id: "account_equity_001",
            ts: "2026-09-05T09:00:00.000Z",
            account_id: "account_eds07",
            strategy_id: "strategy_eds07",
            deployment_id: "deployment_eds07",
            currency: "USDT",
            equity: "100000.250000000000000001",
            drawdown: "-2.140000000000000001",
          }),
          row({
            id: "account_equity_002",
            ts: "2026-09-05T10:00:00.000Z",
            account_id: "account_eds07",
            strategy_id: "strategy_eds07",
            deployment_id: "deployment_eds07",
            currency: "USDT",
            equity: "100100.500000000000000001",
            drawdown: "-1.000000000000000001",
          }),
        ],
      ),
      "manager.performance:portfolio_equity_snapshots": available(
        "manager.performance", "portfolio_equity_snapshots", [row({
          id: "portfolio_equity_001",
          ts: "2026-09-05T10:00:00.000Z",
          portfolio_id: "portfolio_eds07",
          currency: "USDT",
          equity: "100100.500000000000000001",
          allocated_capital: "90000.000000000000000001",
          drawdown: "-1.000000000000000001",
        })],
      ),
      "manager.risk:risk_grants": available("manager.risk", "risk_grants", [
        row({ risk_grant_id: "risk_001", strategy_id: "strategy_eds07", account_id: "account_eds07", mode: "paper", venue: "BINANCE", created_at: "2026-09-05T08:00:00.000Z" }),
        row({ risk_grant_id: "risk_002", strategy_id: "strategy_eds07", account_id: "account_eds07", mode: "paper", venue: "BINANCE", created_at: "2026-09-05T08:01:00.000Z" }),
        row({ risk_grant_id: "risk_003", strategy_id: "strategy_eds07", account_id: "account_eds07", mode: "paper", venue: "BINANCE", created_at: "2026-09-05T08:02:00.000Z" }),
      ]),
      "manager.risk:sizing_decisions": available("manager.risk", "sizing_decisions", [
        row({ decision_id: "size_001", strategy_id: "strategy_eds07", account_id: "account_eds07", mode: "paper", venue: "BINANCE", created_at: "2026-09-05T07:00:00.000Z" }),
        row({ decision_id: "size_002", strategy_id: "strategy_eds07", account_id: "account_eds07", mode: "paper", venue: "BINANCE", created_at: "2026-09-05T07:01:00.000Z" }),
      ]),
    },
  };
}

function available(sourceId: string, relation: string, items: ProjectionRow[]): ProjectionRelation {
  return {
    source_id: sourceId,
    relation,
    availability: "AVAILABLE",
    reason_code: null,
    as_of: "2026-09-05T10:00:00.000Z",
    freshness: "FRESH",
    completeness: "COMPLETE",
    items,
  };
}

function row(fields: Record<string, string>): ProjectionRow {
  return {
    lineage: {
      workspace_id: workspaceId,
      profile_id: profileId,
      source_contract_revision: sourceRevision,
    },
    fields,
  };
}
