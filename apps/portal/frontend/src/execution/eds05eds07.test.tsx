/**
 * EDS-05 derivation and EDS-07 chart readers, adapted from payloads captured on
 * the probe runtime (2026-09-05, claude-probe, paper profile) and trimmed to a
 * few rows. The shapes are the server's; the readers must keep every figure a
 * string and every server state a state.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { readAlphaActivity, readDeploymentQuality, readPortfolioCapital, readSourceHealth } from "./api/derivations";
import { financialChartPath, financialChartView, readFinancialChart, viewportPx } from "./api/financialChart";
import { ExecutionQualityTile, PortfolioCapitalTile, SourceHealthPanel } from "./components/DerivationTile";

afterEach(cleanup);

const COMMON = {
  logical_operation_id: "x",
  record_authority: "PORTAL_CONTROL",
  source_authority: "TRADING_SYSTEM",
  workspace_id: "ws_06G19F61YB8CFR7TEWMS7HQ660",
  environment: "paper",
  profile_id: "PAPER_BINANCE_USDM",
  read_at_ms: 1788633296401,
  read_at: "2026-09-05T18:34:56.401Z",
  as_of_ms: 1788633296401,
  as_of: "2026-09-05T18:34:56.401Z",
};

const QUALITY = {
  ...COMMON,
  schema_version: "execution.derivation.deployment-execution-quality.v1",
  state: "PARTIAL",
  reason_code: "SOURCE_PARTIAL",
  freshness: "FRESH",
  completeness: "PARTIAL",
  formula: { id: "deployment_execution_quality", version: "v1", currency_policy: "NOT_APPLICABLE", temporal_policy: "UTC_EPOCH_MS" },
  input_population: [
    { relation: "manager.deployments:strategy_deployments", state: "AVAILABLE", reason_code: null, population: "43", freshness: "FRESH", completeness: "COMPLETE", as_of_ms: 1788633296401 },
    { relation: "manager.sessions:execution_sessions", state: "PARTIAL", reason_code: "SOURCE_PARTIAL", population: "2000", freshness: "FRESH", completeness: "PARTIAL", as_of_ms: 1788633296401 },
  ],
  input_digest: "sha256:abc",
  data: {
    deployment_id: "adaptive_hma_cpp_00115m:paper:BINANCE:paper-binance-adaptive_hma_cpp_00115m",
    execution_session_population: "2000", order_population: "19", fill_population: "10",
    submitted_count: "19", risk_rejected_count: "1", broker_rejected_count: "0", filled_count: "11", rejected_count: "1",
    reject_rate: { numerator: "1", denominator: "19" },
    latency_state: "UNAVAILABLE", latency_reason_code: "N28_BROKER_ACK_TIMESTAMPS_NOT_ACTIVATED",
    current_observation_only: true,
  },
};

const CAPITAL = {
  ...COMMON,
  schema_version: "execution.derivation.portfolio-capital.v1",
  state: "PARTIAL",
  reason_code: "EDS05_PORTFOLIO_CAPITAL_LEDGER_NOT_PUBLISHED",
  freshness: "UNKNOWN",
  completeness: "UNKNOWN",
  formula: { id: "portfolio_capital_contribution", version: "v1", currency_policy: "EXACT_PARTITION_BY_SOURCE_CURRENCY_NO_FX_AGGREGATE", temporal_policy: "UTC_EPOCH_MS" },
  data: {
    portfolio_id: "portfolio_types_pool",
    portfolio: { base_currency: "USDT", created_at: "2026-08-16T11:12:12.605956Z", name: "Portfolio Account Config Setup", portfolio_id: "portfolio_types_pool", state: "ACTIVE", updated_at: "2026-08-16T11:21:12.696441Z" },
    allocation_by_currency: [{ currency: "USDT", population: "42", allocated_capital: "11360000", max_capital: "11360000" }],
    account_balance_by_currency: [{ currency: "USDT", population: "42", total: "11360000", free: "11360000", locked: "0" }],
    currency_policy: "EXACT_PARTITION_BY_SOURCE_CURRENCY_NO_FX_AGGREGATE",
    unpublished_inputs: ["portfolio_capital_ledger", "account_reservations"],
    current_observation_only: true,
  },
};

const ACTIVITY_EMPTY = {
  ...COMMON,
  schema_version: "execution.derivation.alpha-activity.v1",
  state: "EMPTY",
  reason_code: "EDS05_ALPHA_NOT_FOUND",
  freshness: "FRESH",
  completeness: "COMPLETE",
  formula: { id: "alpha_activity_rollup", version: "v1", currency_policy: "NOT_APPLICABLE", temporal_policy: "UTC_EPOCH_MS" },
  input_population: [{ relation: "manager.strategies:strategies", state: "AVAILABLE", reason_code: null, population: "48", freshness: "FRESH", completeness: "COMPLETE", as_of_ms: 1 }],
  data: { alpha_id: "gridcombine001", strategy_id: null, deployment_population: "0", session_population: "0", order_population: "0", fill_population: "0", state_counts: {}, order_status_counts: {}, latest_observed_at: null, retained_input_range_not_event_replay: true },
};

const HEALTH = {
  schema_version: "execution.derivation.source-health.v1",
  logical_operation_id: "executionSourceHealthV1",
  record_authority: "PORTAL_CONTROL",
  source_authority: "TRADING_SYSTEM",
  workspace_id: "ws_06G19F61YB8CFR7TEWMS7HQ660",
  requested_environment: "paper",
  read_at_ms: 1788632906811,
  read_at: "2026-09-05T18:28:26.811Z",
  state: "PARTIAL",
  formula: { id: "source_health_envelope", version: "v1", currency_policy: "NOT_APPLICABLE", temporal_policy: "UTC_EPOCH_MS" },
  input_digest: "sha256:da55",
  profiles: [{
    environment: "paper", profile_id: "PAPER_BINANCE_USDM", state: "PARTIAL", reason_code: null, availability: "AVAILABLE", freshness: "AGING", completeness: "PARTIAL",
    as_of_ms: 1788632869435, as_of: "2026-09-05T18:27:49.435Z", read_at_ms: 1788632906811, global_sequence: null, retention_floor_ms: null, replay_eligible: false,
    projection_revision: { epoch: "5ce5915e", sequence: 7387, payload_digest: "sha256:d2a6" },
  }],
  source_side_effect_requested: false,
};

const CHART = {
  schema_version: "portal.execution.financial-chart.v1",
  logical_operation_id: "executionFinancialChartV1",
  record_authority: "PORTAL_CONTROL",
  source_authority: "TRADING_SYSTEM",
  workspace_id: "ws_06G19F61YB8CFR7TEWMS7HQ660",
  environment: "paper",
  profile_id: "PAPER_BINANCE_USDM",
  subject: { kind: "account", id: "paper-binance-gridcombine001_4h" },
  metric: "equity",
  panel: {
    state: "READY",
    data: {
      time_basis: "UTC_EPOCH_MS", comparison_mode: "ABSOLUTE_EQUITY", scale_mode: "LOG",
      currency_policy: "PARTITIONED_BY_SOURCE_CURRENCY_NO_FX_AGGREGATE",
      series: [{
        id: "account:paper-binance-gridcombine001_4h:currency:USDT", label: "Account paper-binance-gridcombine001_4h · USDT",
        account_id: "paper-binance-gridcombine001_4h", currency: "USDT",
        points: [[1782800273946, "1000000.000000000000000000"], [1782807574946, null], [1788633000000, "1000012.500000000000000000"]],
      }],
      sampling: {
        algorithm: "MIN_MAX_LAST_BUCKET_V1", source_rows: "51370", numeric_rows: "51370", rejected_rows: "0", returned_rows: 1946, target_points: 2400, bucket_seconds: 7301,
        preserves_extrema: true, preserves_first_last: true, preserves_observed_time_spacing: true, preserves_gaps: false, preserves_markers: false,
        gap_semantics: "SOURCE_GAP_INTERVALS_NOT_PUBLISHED", marker_semantics: "SOURCE_MARKERS_NOT_PUBLISHED",
      },
      retention: { retention_floor_ms: null, retention_floor_state: "UNKNOWN", oldest_available_ms: 1782800273946, newest_available_ms: 1788633000000, history_semantics: "RETAINED_SNAPSHOT_RANGE_NOT_EVENT_REPLAY_OR_TOTAL_HISTORY" },
      benchmark: { requested: false, state: "NOT_REQUESTED", reason_code: null, series: null },
    },
    clocks: { event_time_ms: 1788633109096, source_published_at_ms: 1788633109096, received_at_ms: 1788633121716, ingested_at_ms: 1788633121716, processed_at_ms: 1788633121716, as_of_ms: 1788633109096, read_at_ms: 1788633173460 },
    coverage: { from_ms: 1782800273946, to_ms: 1788633000000, source_total: null, filtered_total: "51370", returned_count: 1946, truncated: false, downsampled: true, has_more: false, next_cursor: null, gaps: [] },
    source_history_semantics: "RETAINED_SNAPSHOT_RANGE_NOT_EVENT_REPLAY_OR_TOTAL_HISTORY",
    formula: { formula_id: "eds07.direct-retained-financial-series", formula_version: "v1", input_revision: "cc029e8c", input_digest: "sha256:4fac", composite_read_revision: "cc029e8c" },
    reason_code: null,
    retryable: false,
  },
};

describe("EDS-05 readers keep the server's words", () => {
  it("reads execution quality with the reject rate as a pair, never a quotient", () => {
    const q = readDeploymentQuality(QUALITY)!;
    expect(q.state).toBe("PARTIAL");
    expect(q.reasonCode).toBe("SOURCE_PARTIAL");
    expect(q.formula).toEqual({ id: "deployment_execution_quality", version: "v1", currencyPolicy: "NOT_APPLICABLE", temporalPolicy: "UTC_EPOCH_MS" });
    expect(q.data.rejectRate).toEqual({ numerator: "1", denominator: "19" });
    expect(q.data.orderPopulation).toBe("19");
    expect(q.inputs).toHaveLength(2);
    expect(q.inputs[1]).toMatchObject({ relation: "manager.sessions:execution_sessions", state: "PARTIAL", population: "2000" });
  });
  it("reads portfolio capital as exact per-currency buckets and lists what the source did not publish", () => {
    const c = readPortfolioCapital(CAPITAL)!;
    expect(c.data.allocationByCurrency).toEqual([{ currency: "USDT", population: "42", values: { allocated_capital: "11360000", max_capital: "11360000" } }]);
    expect(c.data.accountBalanceByCurrency[0]?.values).toEqual({ total: "11360000", free: "11360000", locked: "0" });
    expect(c.data.unpublishedInputs).toEqual(["portfolio_capital_ledger", "account_reservations"]);
    expect(c.reasonCode).toBe("EDS05_PORTFOLIO_CAPITAL_LEDGER_NOT_PUBLISHED");
  });
  it("keeps EMPTY as EMPTY with its reason", () => {
    const a = readAlphaActivity(ACTIVITY_EMPTY)!;
    expect(a.state).toBe("EMPTY");
    expect(a.reasonCode).toBe("EDS05_ALPHA_NOT_FOUND");
    expect(a.data.deploymentPopulation).toBe("0");
  });
  it("reads source health per profile", () => {
    const h = readSourceHealth(HEALTH)!;
    expect(h.environment).toBe("paper");
    expect(h.data.profiles[0]).toMatchObject({ profileId: "PAPER_BINANCE_USDM", availability: "AVAILABLE", freshness: "AGING", completeness: "PARTIAL", replayEligible: false, projectionSequence: "7387" });
  });
  it("refuses a body without a schema", () => {
    expect(readDeploymentQuality({ state: "READY" })).toBeNull();
    expect(readSourceHealth(null)).toBeNull();
  });
});

describe("EDS-07 chart reader and adapter", () => {
  it("reads the panel with its sampling, coverage and clocks", () => {
    const p = readFinancialChart(CHART)!;
    expect(p.state).toBe("READY");
    expect(p.series[0]?.points).toHaveLength(3);
    expect(p.series[0]?.points[1]).toEqual([1782807574946, null]);
    expect(p.sampling?.algorithm).toBe("MIN_MAX_LAST_BUCKET_V1");
    expect(p.coverage.filteredTotal).toBe("51370");
    expect(p.coverage.downsampled).toBe(true);
    expect(p.clocks.asOfMs).toBe(1788633109096);
  });
  it("adapts to the EquityChart contract and declares the downsample in the envelope", () => {
    const view = financialChartView(readFinancialChart(CHART)!);
    expect(view.status).toBe("ok");
    expect(view.series?.points).toEqual([
      { t: "2026-06-30T06:17:53Z", equity: "1000000.000000000000000000" },
      { t: "2026-06-30T08:19:34Z", equity: null },
      { t: "2026-09-05T18:30:00Z", equity: "1000012.500000000000000000" },
    ]);
    expect(view.series?.kind).toBe("equity");
    expect(view.envelope).toMatchObject({
      window: "2026-06-30 → 2026-09-05",
      interval: "7301s bucket",
      currency: "USDT",
      asOf: "2026-09-05T18:31:49Z",
      authority: "EXECUTION",
      formulaVersion: "eds07.direct-retained-financial-series v1",
      sourceRows: 51370,
      returnedRows: 1946,
      downsampleMethod: "MIN_MAX_LAST_BUCKET_V1",
    });
    expect(view.envelope.warnings).toContain("Retained snapshot range — not event replay, not total history.");
  });
  it("turns an UNAVAILABLE panel into a typed unavailable with the server's reason, and no series", () => {
    const view = financialChartView(readFinancialChart({ ...CHART, panel: { ...CHART.panel, state: "UNAVAILABLE", reason_code: "EDS07_RELATION_NOT_MIRRORED", data: { ...CHART.panel.data, series: [] } } })!);
    expect(view.status).toBe("unavailable");
    expect(view.reason).toBe("EDS07_RELATION_NOT_MIRRORED");
    expect(view.series).toBeNull();
  });
  it("clamps the viewport into the server's 256–2048 and passes the workspace only when known", () => {
    expect(viewportPx(100)).toBe(256);
    expect(viewportPx(5000)).toBe(2048);
    expect(viewportPx(1200)).toBe(1200);
    const path = financialChartPath({ environment: "paper", subjectKind: "account", subjectId: "a:b", viewportPx: 99999, workspaceId: "ws_1" });
    expect(path).toBe("/views/equity-chart?environment=paper&subject_kind=account&subject_id=a%3Ab&metric=equity&viewport_px=2048&workspace_id=ws_1");
    expect(financialChartPath({ environment: "live", subjectKind: "deployment", subjectId: "d" })).not.toContain("workspace_id");
  });
});

describe("derivation tiles", () => {
  it("shows the server's PARTIAL state, the formula and the reject-rate pair", () => {
    render(<ExecutionQualityTile quality={readDeploymentQuality(QUALITY)} transport="ok" />);
    expect(screen.getByText("PARTIAL", { selector: ".exec-chip" })).toBeTruthy();
    expect(screen.getByText(/deployment_execution_quality · v1/)).toBeTruthy();
    expect(screen.getByText("1 / 19")).toBeTruthy();
    expect(screen.getByText(/execution_sessions PARTIAL · 2000/)).toBeTruthy();
  });
  it("prints capital per currency with the unpublished inputs named, never a total", () => {
    render(<PortfolioCapitalTile capital={readPortfolioCapital(CAPITAL)} transport="ok" />);
    expect(screen.getAllByText("11360000").length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText(/not published by the source: portfolio_capital_ledger, account_reservations/)).toBeTruthy();
    expect(screen.queryByText(/^total$/i)).toBeNull();
  });
  it("renders the transport failure when nothing was read, and the server's EMPTY when it answered EMPTY", () => {
    const { container } = render(<SourceHealthPanel health={null} transport="denied" reason="PERMISSION_DENIED" />);
    expect(container.querySelector(".exec-state")?.getAttribute("data-status")).toBe("denied");
    cleanup();
    render(<SourceHealthPanel health={readSourceHealth(HEALTH)} transport="ok" />);
    expect(screen.getByText("PAPER_BINANCE_USDM")).toBeTruthy();
    expect(screen.getByText("AGING")).toBeTruthy();
  });
});
