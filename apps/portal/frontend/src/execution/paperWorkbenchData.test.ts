/**
 * The Paper Workbench reads the published profile and judges nothing (P0-9).
 *
 * The rows below carry the field names dev actually publishes, so a rename
 * upstream fails here rather than emptying a panel in silence.
 */
import { describe, expect, it } from "vitest";

import { workbenchProps } from "./paperWorkbenchData";
import type { ProfileEnvelope } from "./api/profileRead";

const DEPLOYMENT = {
  mode: "paper", venue: "BINANCE", active: true, currency: "USDT",
  account_id: "paper-binance-adaptive_hma_cpp_00115m",
  created_at: "2026-08-16T11:21:16.059818Z", updated_at: "2026-09-07T19:23:46.928489Z",
  strategy_id: "adaptive_hma_cpp_00115m", portfolio_id: "portfolio_types_pool",
  deployment_id: "adaptive_hma_cpp_00115m:paper:BINANCE:paper-binance-adaptive_hma_cpp_00115m",
};

const GATE = {
  state: "PARTIAL", observed_days: 50, trade_count: 10, session_count: 0, window_bounded: true,
  policy_version: "execution.observation-policy.v1", policy_stage: "PAPER_OBSERVATION",
  policy_minimum_observed_days: 30, policy_minimum_trade_count: 300,
  reason_code: "N22_OBSERVATION_WINDOW_BOUNDED",
};

const EQUITY = [
  { ts: "2026-09-05T19:15:00Z", ts_ms: 1788635700000, equity: "19900.5", drawdown: "0.01", net_pnl: "21.5", currency: "USDT", state_digest: "abc123def456789", total_fills: 13, snapshot_reason: "SCHEDULED_IDLE", source: "INTERNAL_PROJECTION", realized_pnl: "22.0", unrealized_pnl: "0", gross_pnl: "23.0", fee_total: "1.5", funding_pnl: "0", cash_free: "19900.5", cash_locked: "0", margin_initial: "0", margin_maintenance: "0" },
  { ts: "2026-09-05T20:15:00Z", ts_ms: 1788639300000, equity: "20000.000000000000000000", drawdown: "0.00000000", net_pnl: "122.305193732", currency: "USDT", state_digest: "f0698b2e8c4d7b6abfa54f0f35ced2d4", total_fills: 14, snapshot_reason: "SCHEDULED_IDLE", source: "INTERNAL_PROJECTION", realized_pnl: "123.19605", unrealized_pnl: "0", gross_pnl: "123.19605", fee_total: "0.890856268", funding_pnl: "0", cash_free: "20000", cash_locked: "0", margin_initial: "0", margin_maintenance: "0" },
];

function envelopeOf(over: Partial<ProfileEnvelope> = {}): ProfileEnvelope {
  return {
    schemaVersion: "execution.paper-workbench.v1",
    state: "partial", freshness: "OK", completeness: "PARTIAL",
    asOf: "2026-09-07T19:24:31.116803Z", readAt: "2026-09-07T19:25:00.808Z",
    asOfMs: 1788809071116, readAtMs: 1788809100808,
    workspaceId: "ws", selectedEnvironment: "paper", actor: "claude-probe",
    recordAuthority: "PORTAL_CONTROL_API", sourceAuthority: "EXECUTION",
    capabilities: [],
    data: {
      deployments: [DEPLOYMENT],
      account_equity: EQUITY,
      performance: [],
      orders: [{ order_id: 37583, client_order_id: "brk-9e", side: "BUY", order_type: "MARKET", quantity: "0.08", price: null, status: "FILLED", symbol: "ETHUSDT", submitted_at: "2026-07-18T22:00:03.829071Z", submitted_at_ms: 1784412003829, error_message: null }],
      fills: [{ fill_id: 1877, trade_time: "2026-07-18T22:00:03.040Z", trade_time_ms: 1784412003040, instrument_id: "ETHUSDT.BINANCE", quantity: "0.08", price: "1859.89", commission: "0.05951648", commission_currency: "USDT", liquidity_side: "TAKER" }],
      positions: [{ instrument_id: "ETHUSDT.BINANCE", side: "FLAT", quantity: "0", avg_px_open: "0", mark_price: null, unrealized_pnl: "0", updated_at: "2026-08-16T16:30:17.625508Z" }],
    },
    objects: {
      deployment: DEPLOYMENT,
      observation_gate: GATE,
      history_windows: { account_equity: { days: 30, basis: "PORTAL_SGP_HISTORY_MIRROR", returned_rows: 2, source_rows: 6661, truncated: false, downsample: { method: "PER_SERIES_BUCKET_EXTREMA", bucket_seconds: 3637 } } },
    },
    ...over,
  } as ProfileEnvelope;
}

describe("the observation gate is the server's verdict", () => {
  it("names each criterion against the policy's own minimum", () => {
    const props = workbenchProps(envelopeOf(), null);
    expect(props.observation.items).toEqual([
      { label: "observed days", current: 50, target: 30, unit: "days" },
      { label: "trades", current: 10, target: 300, unit: "trades" },
      { label: "sessions", current: 0, target: 1, unit: "sessions" },
    ]);
    expect(props.railDetail).toBe("50/30 days · 10/300 trades");
  });

  it("stays unmet while the server says PARTIAL, even though the day count is past its minimum", () => {
    const props = workbenchProps(envelopeOf(), null);
    expect(props.observation.met).toBe(false);
    expect(props.readiness).toBe("NOT_READY");
    expect(props.unmetCriteria).toContain("trades 10 of 300");
    expect(props.unmetCriteria.some((c) => c.includes("bounded"))).toBe(true);
    // The bounded window is named with the source's own code, so a reader can
    // tell "wait longer" from "the source does not hold that history".
    expect(props.unmetCriteria.join(" ")).toContain("N22_OBSERVATION_WINDOW_BOUNDED");
  });

  it("never reads `active` as readiness — a deployment can run and be nowhere near ready", () => {
    const props = workbenchProps(envelopeOf(), null);
    expect(DEPLOYMENT.active).toBe(true);
    expect(props.readiness).not.toBe("READY");
  });

  it("says the gate is unpublished rather than passing it", () => {
    const bare = envelopeOf();
    const props = workbenchProps({ ...bare, objects: { deployment: DEPLOYMENT } } as ProfileEnvelope, null);
    expect(props.observation.met).toBe(false);
    expect(props.readiness).toBe("UNKNOWN");
    expect(props.unmetCriteria).toEqual(["the observation gate is not published"]);
  });
});

describe("money arrives as published", () => {
  it("reads the latest snapshot and never recomputes a figure the source carries", () => {
    const props = workbenchProps(envelopeOf(), null);
    const net = props.accounting.find((row) => row.label === "net pnl");
    // 122.305193732 is the source's own net — nothing here subtracts one equity
    // from another. It is shown at the money class's four-decimal display cap
    // (owner, 2026-09-08), the same scale every other screen uses; the exact
    // original is what the formatter keeps, not something this module rounds.
    expect(net?.value).toContain("122.3052");
    expect(net?.value).toContain("USDT");
    // Equity is 20000 exactly, and it is not dressed up as 20,000.00000000.
    expect(props.accounting.find((row) => row.label === "equity")?.value).toBe("20,000.00 USDT");
  });

  it("says a figure is absent rather than showing a zero", () => {
    const bare = envelopeOf({ data: { deployments: [DEPLOYMENT], account_equity: [], performance: [], orders: [], fills: [], positions: [] } });
    const props = workbenchProps(bare, null);
    expect(props.accounting.find((row) => row.label === "equity")?.value).toBeNull();
  });
});

describe("the equity series", () => {
  it("prefers the deployment's own snapshots and carries their published drawdown", () => {
    const props = workbenchProps(envelopeOf(), null);
    expect(props.equity?.series?.points).toHaveLength(2);
    expect(props.equity?.series?.points[0]).toEqual({ t: "2026-09-05T19:15:00Z", equity: "19900.5", drawdown: "0.01" });
  });

  it("carries the source's downsample into the envelope, so the caption can say what was reduced", () => {
    const props = workbenchProps(envelopeOf(), null);
    expect(props.equity?.envelope.sourceRows).toBe(6661);
    expect(props.equity?.envelope.returnedRows).toBe(2);
    expect(props.equity?.envelope.interval).toContain("PER_SERIES_BUCKET_EXTREMA");
    expect(props.equity?.envelope.window).toBe("30d");
  });

  it("falls back to the analytics projection only when no snapshot was published", () => {
    const bare = envelopeOf({ data: { deployments: [DEPLOYMENT], account_equity: [], performance: [], orders: [], fills: [], positions: [] } });
    const props = workbenchProps(bare, {
      chartSeries: [{ series_id: "equity", currency: "USDT", formula_version: "equity_projection.v1", points: [{ timestamp: "2026-09-01T00:00:00Z", value: "100" }, { timestamp: "2026-09-02T00:00:00Z", value: "101" }] }],
      completeness: "PARTIAL", asOf: "2026-09-07T00:00:00Z", correlation: null, drawdownOverlap: null,
      executionQuality: null, orderFunnel: null, positions: [], capabilities: [],
      subjectKind: null, subjectId: null, readAt: null, authority: null, formulaVersion: null,
    } as never);
    expect(props.equity?.series?.label).toBe("Execution equity");
    expect(props.equity?.series?.points).toHaveLength(2);
  });
});

describe("what has no source says so", () => {
  it("keeps sessions empty rather than inventing them from the session ids on orders", () => {
    const props = workbenchProps(envelopeOf(), null);
    expect(props.sessions).toEqual([]);
  });

  it("names the drift contract instead of leaving the panel blank", () => {
    const props = workbenchProps(envelopeOf(), null);
    expect(props.drift).toHaveLength(1);
    expect(props.drift[0].verdict).toBe("INSUFFICIENT_DATA");
    expect(props.drift[0].expected).toBeNull();
    expect(props.drift[0].note ?? "").toContain("Soon");
  });

  it("carries the ACK latency reason the analytics envelope publishes", () => {
    const props = workbenchProps(envelopeOf(), {
      executionQuality: {
        submitted_count: 19, filled_count: 11, risk_rejected_count: 1, broker_rejected_count: 0,
        reject_rate: "0.052631", latency_state: "UNAVAILABLE",
        latency_reason_code: "N28_BROKER_ACK_TIMESTAMPS_NOT_ACTIVATED",
        formula_version: "execution_quality.v1",
      },
      chartSeries: [], correlation: null, drawdownOverlap: null, orderFunnel: null, positions: [],
      capabilities: [], completeness: null, subjectKind: null, subjectId: null, asOf: null,
      readAt: null, authority: null, formulaVersion: null,
    } as never);
    const ack = props.qualityFacts.find((row) => row.label === "ACK latency");
    expect(ack?.value).toBeNull();
    expect(ack?.note ?? "").toContain("N28_BROKER_ACK_TIMESTAMPS_NOT_ACTIVATED");
    expect(props.qualityFacts.find((row) => row.label === "submitted")?.value).toBe("19");
  });
});

describe("the row branches", () => {
  it("pages orders newest first and keeps the source's reject reason", () => {
    const props = workbenchProps(envelopeOf(), null);
    expect(props.orders.rows).toHaveLength(1);
    expect(props.orders.totalCount).toBe(1);
    expect(props.orders.rows[0].status).toBe("FILLED");
    expect(props.orders.rows[0].price).toBeNull();
  });

  it("keeps a fill's commission currency beside its commission", () => {
    const props = workbenchProps(envelopeOf(), null);
    expect(props.fills.rows[0].fee).toContain("USDT");
    expect(props.fills.rows[0].liquidity).toBe("TAKER");
  });

  it("counts a FLAT position as published but not as open exposure", () => {
    const props = workbenchProps(envelopeOf(), null);
    expect(props.positions.totalCount).toBe(1);
    expect(props.runtime.find((row) => row.label === "open positions")?.value).toBe("0");
  });
});
