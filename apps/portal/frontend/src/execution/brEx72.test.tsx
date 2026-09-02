import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import ALPHA_FLEET from "../../../../../packages/contracts/fixtures/execution-alpha-fleet-list.v2.valid.json";
import BINDINGS_LIST from "../../../../../packages/contracts/fixtures/execution-bindings-list.valid.json";
import BINDING_DETAIL from "../../../../../packages/contracts/fixtures/execution-binding-detail.valid.json";
import LIVE_REVIEW from "../../../../../packages/contracts/fixtures/governance-live-review.valid.json";
import { createFixtureApi } from "./api/fixtureApi";
import { createHttpApi } from "./api/httpApi";
import { readAlphaFleet, readBindingDetail, readBindings, readLiveReview } from "./api/profileRead";
import { AccountsBindingsContainer, AlphaFleetContainer } from "./screens/profileContainers";
import { AlphaFleetRichContainer, AlphaThreeSixtyRichContainer, PortfolioListRichContainer, PortfolioThreeSixtyRichContainer } from "./screens/recomposeContainers";
import { AlphaFleet } from "./screens/AlphaFleet";

const POLICY = {
  policyRevision: 6,
  queryEnabled: true,
  projectionIngestionEnabled: true,
  sseEnabled: false,
  governanceWriteEnabled: true,
  paperCommandsEnabled: false,
  sandboxCommandsEnabled: false,
  liveProtectiveCommandsEnabled: false,
  liveRiskIncreasingCommandsEnabled: false,
};

afterEach(() => vi.unstubAllGlobals());

describe("BR-EX-72 same-origin manager list consumers", () => {
  it("decodes only the canonical list/detail and Live Review fixtures", () => {
    expect(readAlphaFleet(ALPHA_FLEET)?.page.rows[0]).toMatchObject({ alphaId: "alpha_a", stage: "PAPER" });
    expect(readBindings(BINDINGS_LIST)?.page.rows[0]).toMatchObject({ bindingId: "acc_a@BINANCE" });
    expect(readBindingDetail(BINDING_DETAIL)).toMatchObject({ accountId: "acc_a", credentialState: "SYNC_SYNCED" });
    expect(readLiveReview(LIVE_REVIEW)).toMatchObject({ approvalId: "AP-R2-DETAIL", canaryDeploymentId: "dep_88" });
    expect(readBindings({ ...BINDINGS_LIST, page: { ...BINDINGS_LIST.page, rows: [{ credential_secret: "leak" }] } })).toBeNull();
  });

  it("uses same-origin BFF routes for Fleet, binding list and binding detail", async () => {
    const fetch = vi.fn(async (request: RequestInfo | URL) => {
      const path = String(request);
      const body = path.includes("/broker-bindings/acc_a") ? BINDING_DETAIL
        : path.includes("/broker-bindings") ? BINDINGS_LIST : ALPHA_FLEET;
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetch);
    const api = createHttpApi({ policy: POLICY });
    expect((await api.getAlphaFleet()).ok).toBe(true);
    expect((await api.getBindings({ venue: "BINANCE" })).ok).toBe(true);
    expect((await api.getBindingDetail("acc_a@BINANCE")).ok).toBe(true);
    expect(fetch.mock.calls.map(([request]) => String(request))).toEqual([
      "/api/v1/execution/alphas",
      "/api/v1/execution/broker-bindings?venue=BINANCE",
      "/api/v1/execution/broker-bindings/acc_a%40BINANCE?environment=paper",
    ]);
  });

  it("renders real list rows instead of the N20 typed-unavailable placeholders", async () => {
    render(<AlphaFleetContainer api={createFixtureApi()} />);
    expect((await screen.findByRole("link", { name: "Carry A" })).getAttribute("href"))
      .toBe("/deployments/alphas/alpha_a");
    expect(screen.queryByText(/N20_FLEET_LIST_CONTRACT_NOT_PUBLISHED/)).toBeNull();

    render(<AccountsBindingsContainer api={createFixtureApi()} />);
    await waitFor(() => expect(screen.getAllByText("acc_a@BINANCE").length).toBeGreaterThan(0));
    expect(screen.queryByText(/N20_BINDINGS_LIST_CONTRACT_NOT_PUBLISHED/)).toBeNull();
  });

  it("keeps the reviewed rich Fleet composition and wires current-source facts and drill-downs", async () => {
    render(<AlphaFleetRichContainer api={createFixtureApi()} />);
    expect(await screen.findByText("Bobby-001")).toBeTruthy();
    expect(screen.getAllByText("123.19605").length).toBeGreaterThan(0);
    expect(screen.getByText("SOURCE_LATEST_WINDOW_NOT_PUBLISHED")).toBeTruthy();

    const alphaId = screen.getByText("alpha_a");
    fireEvent.click(alphaId.closest("tr")!);
    const deployment = await screen.findByRole("link", { name: "dep_a" });
    expect(deployment.getAttribute("href")).toBe("/deployments/paper/dep_a");
    expect(screen.getByRole("link", { name: "acc_a" }).getAttribute("href"))
      .toBe("/deployments/accounts/acc_a");

    fireEvent.click(screen.getByRole("button", { name: "Paper (1)" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Paper (1)" }).getAttribute("aria-pressed")).toBe("true"));
  });

  it("keeps a multi-stage alpha visible when filtering by any stage it holds", () => {
    const list = readAlphaFleet(ALPHA_FLEET)!;
    const row = list.page.rows[0];
    render(<AlphaFleet filter="paper" list={{
      ...list,
      page: { ...list.page, rows: [{ ...row, stage: "LIVE", stages: ["LIVE", "PAPER"] }] },
    }} />);
    expect(screen.getByRole("link", { name: "Carry A" })).toBeTruthy();
  });

  it("keeps Alpha 360 rich when its additive analytics branch is disabled", async () => {
    const fixture = createFixtureApi();
    const api = {
      ...fixture,
      getQueryAnalytics: async () => ({
        ok: false as const,
        status: "unavailable" as const,
        reason: "ANALYTICS_DISABLED: the additive analytics branch is disabled",
      }),
    };
    const { container } = render(
      <MemoryRouter initialEntries={["/deployments/alphas/alpha_a"]}>
        <AlphaThreeSixtyRichContainer api={api} alphaId="alpha_a" />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: /Carry A/ })).toBeTruthy();
    expect(container.querySelector('[data-hifi-exact="alpha-360"]')).toBeTruthy();
    expect(screen.getByText("owner Bobby-001")).toBeTruthy();
    expect(screen.getByRole("button", { name: "dep_a" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "acc_a" })).toBeTruthy();
    expect(screen.getAllByText("123.19605").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("tab", { name: "Insight Charts" }));
    await waitFor(() => expect(container.querySelectorAll(".exec-alpha-tiles > *")).toHaveLength(12));
    expect(screen.getAllByText(/ANALYTICS_DISABLED/)).toHaveLength(12);
  });

  it("maps one local projection response into every source-backed Alpha 360 tab", async () => {
    const fixture = createFixtureApi();
    const api = {
      ...fixture,
      getQueryAnalytics: async () => ({
        ok: true as const,
        value: {
          subjectKind: "ALPHA", subjectId: "alpha_a", asOf: "2026-09-02T06:00:00Z",
          readAt: "2026-09-02T06:00:01Z", completeness: "COMPLETE", authority: "EXECUTION",
          formulaVersion: "manager-query-analytics.v1",
          capabilities: [
            { capabilityId: "exact-query", state: "AVAILABLE", reasonCode: null, retryable: false },
            { capabilityId: "position-exposure", state: "AVAILABLE", reasonCode: null, retryable: false },
            { capabilityId: "stage-equity", state: "AVAILABLE", reasonCode: null, retryable: false },
          ],
          orderFunnel: { totalOrders: 1, statusCounts: { FILLED: 1 } },
          executionQuality: { submitted_count: 1, filled_count: 1 },
          chartSeries: [{ currency: "USDT", formula_version: "equity_projection.v1", points: [{ timestamp: "2026-09-02T06:00:00Z", value: "10123.45" }] }],
          positions: [], correlation: null,
          sourceFacts: {
            deployments: [{ deployment_id: "dep_a", strategy_id: "alpha_a", account_id: "acc_a", venue: "BINANCE", currency: "USDT" }],
            positions: [{ position_id: "pos_a", strategy_id: "alpha_a", account_id: "acc_a", venue: "BINANCE", symbol: "BTCUSDT", side: "LONG", quantity: "0.1", avg_px_open: "60000", mark_price: "61000", unrealized_pnl: "100", notional: "6100" }],
            orders: [{ order_id: "ord_a", strategy_id: "alpha_a", account_id: "acc_a", venue: "BINANCE", symbol: "BTCUSDT", status: "FILLED", quantity: "0.1", price: "60000", submitted_at: "2026-09-02T05:00:00Z" }],
            sessions: [{ execution_session_id: "ses_a", strategy_id: "alpha_a", account_id: "acc_a", state: "COMPLETED", accounting_recovered_count: 1, reconciliation_deferred_count: 0, reconciliation_actionable_count: 0, updated_at: "2026-09-02T05:01:00Z" }],
            allocations: [{ account_id: "acc_a", currency: "USDT", allocated_capital: "20000" }],
            accountEquity: [{ account_id: "acc_a", currency: "USDT", total_notional: "6100", realized_pnl: "12.5", fee_total: "0.5", equity: "20112", ts: "2026-09-02T05:02:00Z" }],
            performance: [{ account_id: "acc_a", venue: "BINANCE", currency: "USDT", net_pnl: "112", ts: "2026-09-02T05:02:00Z" }],
            reconciliation: [{ finding_id: "rec_a", venue: "BINANCE", finding_type: "POSITION", status: "RESOLVED", resolved_at: "2026-09-02T05:03:00Z" }],
            journal: [{ command_id: "cmd_a", command_kind: "INSPECT", aggregate_key: "alpha_a", outcome_class: "SUCCESS", updated_at: "2026-09-02T05:04:00Z" }],
          },
          replay: { state: "AVAILABLE", reasonCode: null, candlesState: "UNAVAILABLE", candlesReasonCode: "N28_MARKET_CANDLES_SOURCE_NOT_ACTIVATED", tradeLog: [{ timestamp: "2026-09-02T05:00:00Z", journal_id: "ord_a", event_type: "ORDER", order_id: "ord_a", fill_id: null, quantity: "0.1", price: "60000" }] },
        },
      }),
    };
    const { container } = render(<MemoryRouter><AlphaThreeSixtyRichContainer api={api} alphaId="alpha_a" /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: /Carry A/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Insight Charts" }));
    expect(await screen.findByText(/3 · Stage equity/)).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Trade Replay" }));
    expect((await screen.findAllByText("ord_a")).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("tab", { name: "Positions" }));
    expect((await screen.findAllByText("BTCUSDT")).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("tab", { name: "Orders & Fills" }));
    expect(await screen.findByText("FILLED")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Risk" }));
    expect(await screen.findByText("BTCUSDT current notional")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Sessions" }));
    expect(await screen.findByText("1 accounting recoveries")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Accounting" }));
    expect(await screen.findByText("20000")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Reconciliation" }));
    expect(await screen.findByText("POSITION")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Audit" }));
    expect(await screen.findByText("INSPECT")).toBeTruthy();
    expect(container.querySelector('[data-hifi-exact="alpha-360"]')).toBeTruthy();
  });

  it("binds each analytics capability to its own branch by id, never by position (P4-B / F2)", async () => {
    const fixture = createFixtureApi();
    const api = {
      ...fixture,
      getQueryAnalytics: async () => ({
        ok: true as const,
        value: {
          subjectKind: "ALPHA", subjectId: "alpha_a", asOf: "2026-09-02T06:00:00Z",
          readAt: "2026-09-02T06:00:01Z", completeness: "COMPLETE", authority: "EXECUTION",
          formulaVersion: "manager-query-analytics.v1",
          // The twelve capabilities exactly as the local analytics plane
          // publishes them — including the honestly unavailable tail.
          capabilities: [
            { capabilityId: "exact-query", state: "AVAILABLE", reasonCode: null, retryable: false },
            { capabilityId: "position-exposure", state: "AVAILABLE", reasonCode: null, retryable: false },
            { capabilityId: "stage-equity", state: "EMPTY", reasonCode: null, retryable: false },
            { capabilityId: "execution-quality", state: "AVAILABLE", reasonCode: null, retryable: false },
            { capabilityId: "contribution", state: "AVAILABLE", reasonCode: null, retryable: false },
            { capabilityId: "order-funnel", state: "AVAILABLE", reasonCode: null, retryable: false },
            { capabilityId: "replay-journal", state: "AVAILABLE", reasonCode: null, retryable: false },
            { capabilityId: "market-candles", state: "UNAVAILABLE", reasonCode: "N28_MARKET_CANDLES_SOURCE_NOT_ACTIVATED", retryable: false },
            { capabilityId: "portfolio-drawdown-overlap", state: "UNAVAILABLE", reasonCode: "N25_INSUFFICIENT_MULTI_ALPHA_HISTORY", retryable: false },
            { capabilityId: "portfolio-correlation", state: "EMPTY", reasonCode: "N25_INSUFFICIENT_MULTI_ALPHA_HISTORY", retryable: false },
            { capabilityId: "portfolio-rho-timeline", state: "UNAVAILABLE", reasonCode: "N28_BENCHMARK_SERIES_SOURCE_NOT_ACTIVATED", retryable: false },
            { capabilityId: "canary-drift", state: "UNAVAILABLE", reasonCode: "N28_TWIN_PROFILE_JOIN_NOT_ACTIVATED", retryable: false },
          ],
          orderFunnel: { totalOrders: 364, statusCounts: { FILLED: 32, REJECTED: 316, CANCELED: 16 } },
          executionQuality: { submitted_count: 364, filled_count: 32 },
          chartSeries: [], positions: [
            { position_id: "pos_a", instrument_id: "BTCUSDT.BINANCE", side: "LONG", signed_qty: "0.1", unrealized_pnl: "100.5" },
          ], correlation: null,
          sourceFacts: {
            orders: [{ order_id: "ord_a", status: "FILLED" }],
            performance: [{ venue: "BINANCE", currency: "USDT", net_pnl: "112.25", ts: "2026-09-02T05:02:00Z" }],
          },
          replay: { state: "AVAILABLE", reasonCode: null, candlesState: "UNAVAILABLE", candlesReasonCode: "N28_MARKET_CANDLES_SOURCE_NOT_ACTIVATED", tradeLog: [{ timestamp: "2026-09-02T05:00:00Z", journal_id: "j1", event_type: "ORDER", order_id: "ord_a", fill_id: null, quantity: "0.1", price: "60000" }] },
        },
      }),
    };
    const { container } = render(<MemoryRouter><AlphaThreeSixtyRichContainer api={api} alphaId="alpha_a" /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("tab", { name: "Insight Charts" }));
    await waitFor(() => expect(container.querySelectorAll(".exec-alpha-tiles > *")).toHaveLength(12));
    // Real numbers from each capability's own branch, formatted by the one
    // display authority (grouped, class floor) — not a state word as prose.
    const funnelTile = screen.getByLabelText("6 · Order funnel");
    expect(funnelTile.textContent).toContain("total orders");
    expect(funnelTile.textContent).toContain("364");
    const qualityTile = screen.getByLabelText("4 · Execution quality");
    expect(qualityTile.textContent).toContain("submitted count");
    const exposureTile = screen.getByLabelText("2 · Exposure profile");
    expect(exposureTile.textContent).toContain("BTCUSDT.BINANCE LONG");
    expect(exposureTile.textContent).toContain("100.50");
    const contributionTile = screen.getByLabelText("5 · Venue contribution");
    expect(contributionTile.textContent).toContain("BINANCE · USDT");
    expect(contributionTile.textContent).toContain("112.25");
    // The unavailable tail keeps its reviewed frame and the served reason.
    const candlesTile = screen.getByLabelText("8 · Market candles");
    expect(candlesTile.textContent).toContain("N28_MARKET_CANDLES_SOURCE_NOT_ACTIVATED");
    const driftTile = screen.getByLabelText("12 · Paper vs live drift");
    expect(driftTile.textContent).toContain("N28_TWIN_PROFILE_JOIN_NOT_ACTIVATED");
    // stage-equity EMPTY with no series stays honest, not a fake chart.
    const equityTile = screen.getByLabelText("3 · Stage equity");
    expect(equityTile.getAttribute("data-state")).not.toBe("ok");
  });

  it("renders the real portfolio register on the list root and opens a 360 from a row (P4-A / BR-EX-76)", async () => {
    const api = createFixtureApi();
    render(<MemoryRouter><PortfolioListRichContainer api={api} /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "Portfolios" })).toBeTruthy();
    // The canonical fixture: Carry Core carries counts and exact capital; the
    // live branch is UNAVAILABLE, so the register labels itself PARTIAL.
    expect(await screen.findByText("Carry Core")).toBeTruthy();
    const capital = screen.getByText("30,000.00 USDT");
    // The display groups and scales; the exact source decimal rides on hover.
    expect(capital.getAttribute("title")).toBe("30000 USDT");
    expect(screen.getByText(/live: UNAVAILABLE · N31_PROJECTION_NOT_READY/)).toBeTruthy();
    const row = screen.getByRole("link", { name: "Carry Core" });
    expect(row.getAttribute("href")).toBe("/deployments/portfolios/pf_carry_core");
  });

  it("renders a register-only portfolio's 360 and names real ids for an unknown one (P4-A)", async () => {
    const api = createFixtureApi();
    // pf_unallocated exists only in the portfolios relation, not in any Fleet
    // allocation: identity must still render the rich screen.
    render(<MemoryRouter><PortfolioThreeSixtyRichContainer api={api} portfolioId="pf_unallocated" /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: /pf_unallocated/i })).toBeTruthy();

    const { unmount } = render(<MemoryRouter><PortfolioThreeSixtyRichContainer api={api} portfolioId="pf_ghost" /></MemoryRouter>);
    expect(await screen.findByText(/available: pf_carry_core, pf_main, pf_unallocated/)).toBeTruthy();
    unmount();
  });

  it("keeps Portfolio 360 identity and holdings when derived analytics is disabled", async () => {
    const fixture = createFixtureApi();
    const api = { ...fixture, getQueryAnalytics: async () => ({ ok: false as const, status: "unavailable" as const, reason: "ANALYTICS_DISABLED" }) };
    render(<MemoryRouter><PortfolioThreeSixtyRichContainer api={api} portfolioId="pf_main" /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: /pf_main/i })).toBeTruthy();
    expect(screen.getByText("Main")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Structure & Correlation" }));
    expect(await screen.findByRole("button", { name: "alpha_a" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "acc_a" })).toBeTruthy();
    expect(screen.queryByText(/^ANALYTICS_DISABLED$/)).toBeNull();
  });
});
