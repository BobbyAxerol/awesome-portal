/**
 * Portfolio 360 at the size the hi-fi does not draw (L2): a 60-deployment
 * portfolio with 20 accounts, a ledger of 1,500 entries, a 5,000-point equity
 * series, twelve currencies. The DOM stays bounded, every cap is said out
 * loud, and the work stays inside a stated budget.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { PF, answerPortfolios } from "../../../../../../e2e/bffDoublePortfolios";
import { makeApi, type Override } from "../harness.fixtures";
import PortfolioScreen from "./index";

afterEach(cleanup);

const BUDGET_TAB_MS = 8_000;

type Draft = any; // eslint-disable-line @typescript-eslint/no-explicit-any

function bigResource(deployments: number, accounts: number): Draft {
  const base = answerPortfolios("GET", `/resources/portfolios/${PF.core}`)!.body as Draft;
  const strategies = Array.from({ length: 24 }, (_, i) => ({ strategy_id: `strat_${i}`, alpha_id: `strat_${i}`, label: `Alpha ${String(i).padStart(2, "0")}`, version: "v1", trader_id: `owner_${i % 5}` }));
  const accountIds = Array.from({ length: accounts }, (_, i) => `Acct-${String(i).padStart(2, "0")}`);
  const deps = Array.from({ length: deployments }, (_, i) => ({
    deployment_id: `dep-${String(i).padStart(3, "0")}`, strategy_id: `strat_${i % 24}`, stage: i % 4 === 0 ? "PAPER" : "LIVE", venue: "BINANCE", account_id: accountIds[i % accounts],
    portfolio_id: PF.core, currency: i % 7 === 0 ? "JPY" : "USDT", allocation: `${1000 + i}.00`, net_pnl: i % 2 === 0 ? `${i}.50` : `-${i}.25`, exposure: `${500 + i}.00`, health: i % 9 === 0 ? "ATTENTION" : "READY", state: "ACTIVE", active: true,
  }));
  return {
    ...base,
    data: {
      ...base.data,
      strategies,
      deployments: deps,
      accounts: accountIds.map((id) => ({ account_id: id, venue: "BINANCE", mode: "live", base_currency: "USDT" })),
      account_balances: accountIds.map((id) => ({ account_id: id, currency: "USDT", total: "1000.00", free: "600.00", locked: "400.00", updated_at: "2026-10-17T12:00:00Z" })),
      margin_balances: accountIds.map((id) => ({ account_id: id, currency: "USDT", initial: "10.00", maintenance: "5.00", updated_at: "2026-10-17T12:00:00Z" })),
      account_sync: accountIds.map((id) => ({ account_id: id, status: "SYNCED", synced_at: "2026-10-17T12:00:00Z" })),
      reconciliation: [],
      portfolio: { ...base.data.portfolio, deployments: deps, holdings_count: deployments, account_ids: accountIds },
    },
  };
}

const mount = (api: ReturnType<typeof makeApi>["api"], query = "") =>
  render(<MemoryRouter initialEntries={[`/deployments/portfolios/${PF.core}${query}`]}><PortfolioScreen api={api} portfolioId={PF.core} /></MemoryRouter>);
const ready = () => screen.findByRole("tablist", { name: "Portfolio sections" }, { timeout: 10_000 });
const rowsOf = (label: string) => within(screen.getByRole("table", { name: label })).getAllByRole("row").slice(1);

describe("60 deployments, 20 accounts", () => {
  const big: Override = (_m, path) => (path === `/resources/portfolios/${PF.core}` ? { status: 200, body: bigResource(60, 20) } : undefined);

  it("draws every deployment and every account on its tab, inside the budget, with the right counts", async () => {
    mount(makeApi(big).api);
    await ready();
    const strip = screen.getByRole("group", { name: "Portfolio identity" });
    const deployments = within(strip).getByText("Deployments").closest("div")!.textContent ?? "";
    expect(deployments).toContain("60");
    expect(deployments).toContain("24 alphas");
    expect(deployments).toContain("20 accounts");
    // The Alphas tab is the Alpha Fleet dataset now (paged, see alphasFleet.test.tsx); the resource-backed tables keep their whole-read budget here.
    for (const [tab, table, count] of [["Accounts", "Accounts", 20], ["Risk and Health", "Exposure by deployment", 60]] as const) {
      const started = performance.now();
      fireEvent.click(screen.getByRole("tab", { name: tab }));
      await waitFor(() => expect(screen.getByRole("tab", { name: tab }).getAttribute("aria-selected")).toBe("true"));
      expect(rowsOf(table)).toHaveLength(count);
      expect(performance.now() - started).toBeLessThan(BUDGET_TAB_MS);
    }
  });

  it("caps a table at 200 rows and says how many there are", async () => {
    const huge: Override = (_m, path) => (path === `/resources/portfolios/${PF.core}` ? { status: 200, body: bigResource(260, 230) } : undefined);
    mount(makeApi(huge).api, "?tab=risk");
    await ready();
    expect(rowsOf("Exposure by deployment")).toHaveLength(200);
    expect(screen.getByText("Showing the first 200 of 260 deployments. The resource is read whole; narrow it from the Alpha Fleet or the account list.")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Accounts" }));
    await waitFor(() => expect(rowsOf("Accounts")).toHaveLength(200));
    expect(screen.getByText(/Showing the first 200 of 230 accounts/)).toBeTruthy();
  });

  it("keeps each currency in its own contribution chart: two currencies, two charts, no total", async () => {
    mount(makeApi(big).api, "?tab=alphas");
    await ready();
    const charts = document.querySelectorAll("figure.exec-divbars");
    expect(charts).toHaveLength(2);
    expect([...charts].map((c) => c.textContent)).toEqual([expect.stringContaining("· JPY"), expect.stringContaining("· USDT")]);
  });
});

describe("a ledger of 1,500 entries", () => {
  const entries = Array.from({ length: 1500 }, (_, i) => ({
    ledger_id: `ledger-${String(i).padStart(5, "0")}`, allocation_id: `a-${i}`, account_id: "Binance-02", movement_type: "ALLOCATE", direction: "INCREASE",
    amount: `${i + 1}.00`, before_allocated: `${i}.00`, after_allocated: `${i + 1}.00`, occurred_at: new Date(Date.UTC(2026, 0, 1) + i * 3_600_000).toISOString().replace(/\.\d{3}Z$/, "Z"),
  }));
  const override: Override = (_m, path, query) => {
    if (!path.endsWith("/capital-ledger") || query.get("environment") !== "live") return undefined;
    const base = answerPortfolios("GET", path, query)!.body as Draft;
    const data = base.analytics.data;
    return { status: 200, body: { ...base, analytics: { ...base.analytics, data: { ...data, entry_count: 4180, returned_entry_count: 1500, has_more: true, buckets: [{ currency: "USDT", gross_increase: "9999999.00", gross_decrease: "0", entry_count: 4180, entries }] } } } };
  };

  it("draws the first 200, newest first, and says it is 200 of 1,500 read of 4,180", async () => {
    mount(makeApi(override).api, "?tab=allocations");
    const table = await screen.findByRole("table", { name: "Capital ledger in Live" }, { timeout: 10_000 });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(200);
    expect(rows[0].querySelector("td[data-l='Allocated after']")!.textContent).toContain("1,500.00");
    const block = screen.getByRole("region", { name: "Capital ledger in Live" });
    expect(block.textContent).toContain("Showing 200 of 4180.");
    expect(block.textContent).toContain("The first 200 rows are drawn.");
    expect(block.textContent).toContain("publishes no older page");
    // The gross totals describe the whole population, not the rows drawn.
    expect(block.textContent).toContain("gross increase 9,999,999.00 USDT");
  });
});

describe("a 5,000-point equity series and twelve currencies", () => {
  it("draws one series at a time with a bounded number of SVG elements, and offers the other eleven", async () => {
    const series = Array.from({ length: 12 }, (_, k) => ({
      id: `portfolio:${PF.core}:equity:C${k}`, label: `Core equity C${k}`, account_id: null, currency: `C${String(k).padStart(2, "0")}`,
      points: Array.from({ length: 5000 }, (_, i) => [Date.UTC(2026, 9, 1) + i * 60_000, `${1000 + ((i * 7) % 113)}.${String(i % 100).padStart(2, "0")}`]),
    }));
    const override: Override = (_m, path, query) => {
      if (path !== "/views/equity-chart") return undefined;
      const base = answerPortfolios("GET", path, query)!.body as Draft;
      return { status: 200, body: { ...base, panel: { ...base.panel, state: "READY", reason_code: null, coverage: { ...base.panel.coverage, gaps: [] }, data: { ...base.panel.data, series, sampling: { ...base.panel.data.sampling, source_rows: "60000", returned_rows: 5000 } } } } };
    };
    const started = performance.now();
    mount(makeApi(override).api);
    const select = await screen.findByRole("combobox", { name: "Equity series" }, { timeout: 15_000 });
    expect(within(select).getAllByRole("option")).toHaveLength(12);
    const svg = document.querySelector(".exec-c2-svg")!;
    expect(svg.querySelectorAll("*").length).toBeLessThan(150);
    expect(document.querySelectorAll(".exec-c2-svg")).toHaveLength(1);
    expect(document.body.textContent).toContain("5000 points");
    expect(document.body.textContent).toContain("Server: 5,000 of 60,000 points");
    expect(performance.now() - started).toBeLessThan(15_000);
    fireEvent.change(select, { target: { value: series[3].id } });
    await waitFor(() => expect(document.body.textContent).toContain("Core equity C3"));
    expect(document.querySelectorAll(".exec-c2-svg")).toHaveLength(1);
  });
});

describe("a ledger entry the reader cannot read", () => {
  it("says how many returned entries are missing from the table instead of showing a shorter ledger", async () => {
    const override: Override = (_m, path, query) => {
      if (!path.endsWith("/capital-ledger") || query.get("environment") !== "live") return undefined;
      const base = answerPortfolios("GET", path, query)!.body as Draft;
      base.analytics.data.buckets[0].entries[0].movement_type = "SWEEP_TO_COLD";
      base.analytics.data.buckets[0].entries[1].amount = "1e5";
      return { status: 200, body: base };
    };
    mount(makeApi(override).api, "?tab=allocations");
    await screen.findByRole("table", { name: "Capital ledger in Live" });
    expect(screen.getByText("2 returned entries could not be read and are not shown. The ledger above is incomplete.")).toBeTruthy();
    expect(rowsOf("Capital ledger in Live")).toHaveLength(3);
  });
});
