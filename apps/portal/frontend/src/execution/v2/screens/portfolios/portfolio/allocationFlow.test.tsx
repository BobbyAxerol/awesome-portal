/**
 * Portfolio 360 (WP-F1): the capital flow of the Allocations tab, the two-part Capital panel, the allocation bar and the concentration bar,
 * from the published statements and alpha groups of the dataset (judged by the real reader, served through the port double). Real-funded and
 * Simulated stay in their own blocks; nothing is summed; an unpublished figure is a typed absence.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { PF } from "../../../../../../e2e/bffDoublePortfolios";
import type { ExecutionApi } from "../../../../api/ports";
import { absentMetric, moneyMetric, partition } from "../../../readers/managerDataset.testbase";
import { datasetFor, withDataset } from "../datasetFixtures.testbase";
import { makeApi } from "../harness.fixtures";
import PortfolioScreen from "./index";

afterEach(cleanup);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = any;
type Query = Parameters<Parameters<typeof withDataset>[1] & {}>[0];

const money = (value: string, currency = "USDT") => moneyMetric({ currency, value });
const LIVE = () => partition("ACTUAL", "USDT", "actual");
const FULL = {
  initial_funds: money("20000.00"), added_funds: money("0"), returned_capital: money("250.00"), current_nav: money("23000.00"), current_budget: money("18000.00"),
  allocation: money("14580.00"), headroom: money("3420.00"), recalling: money("360.00"), net_external_flows: money("19750.00"), net_pnl: money("-295.025"),
};
const share = (value: string) => ({ ...moneyMetric({ value }), unit: "PERCENT", currency: null });

/** The portfolio dataset: statements for every read, and the two group readings the screen asks (by portfolio, by alpha). */
const served = (asked: Query[] = []) => withDataset(makeApi().api, (query) => datasetFor("PORTFOLIO", PF.core, (body: Body) => {
  body.capital_statements = [{ partition: query.environment === "live" ? LIVE() : partition("PAPER", "USDT", "usdt"), metrics: FULL }];
  if (query.groupBy?.[0] === "alpha_id") {
    body.groups = [["strat_btc", "9000.00", "61.724"], ["strat_eth", "5580.00", "38.276"]].map(([alpha, allocation, pct]) => ({
      key: [{ field: "alpha_id", value: alpha }], unique_row_count: 1, totals_scope: "FULL_AUTHORIZED_FILTERED_QUERY",
      economic_partitions: [{ partition: query.environment === "live" ? LIVE() : partition("PAPER", "USDT", "usdt"), metrics: { net_pnl: money("1"), allocation: money(allocation!), allocation_share_pct: share(pct!) } }],
    }));
    body.items = [body.items[0]];
    body.page = { limit: 1, returned_count: 1, authorized_filtered_count: 2, next_cursor: "TEST_ONLY:cursor", previous_cursor: null };
  }
}), asked);

const mount = (api: ExecutionApi, query = "") =>
  render(<MemoryRouter initialEntries={[`/deployments/portfolios/${PF.core}${query}`]}><PortfolioScreen api={api} portfolioId={PF.core} /></MemoryRouter>);
const ready = () => screen.findByRole("tablist", { name: "Portfolio sections" }, { timeout: 5000 });

describe("Overview: the Capital panel", () => {
  it("has two parts, 'Cash flows' and 'Budget, not cash', one row each as published, the net PnL signed, NAV from the series", async () => {
    mount(served());
    await ready();
    const table = await screen.findByRole("table", { name: "Capital statements" });
    await waitFor(() => expect(table.querySelector(".exec-part")).not.toBeNull());
    const heads = [...table.querySelectorAll("tr.exec-pf-grp")].map((tr) => tr.textContent);
    expect(heads).toEqual(["Cash flows", "Budget, not cash"]);
    const text = (label: string) => [...table.querySelectorAll("tr")].find((tr) => tr.querySelector("th")?.textContent === label)!.textContent ?? "";
    expect(text("Initial funds")).toContain("20,000.00");
    expect(text("Net external flows")).toContain("19,750.00");
    expect(text("Net PnL")).toContain("-295.025");
    expect(text("Approved")).toContain("18,000.00");
    expect(text("Allocated")).toContain("14,580.00");
    expect(text("Recalling")).toContain("360.00");
    expect(text("Headroom")).toContain("3,420.00");
    expect(table.querySelector("tr[data-total='true']")).not.toBeNull();
    // One partition: no caption on each figure (the page names the book); the unit stays on the figure.
    expect(table.querySelector(".exec-part-label")).toBeNull();
  });

  it("draws the allocation bar with its meter, and says that the funding source is not published", async () => {
    mount(served());
    await ready();
    const group = await screen.findByRole("group", { name: "Allocated of approved budget" });
    expect(within(group).getByRole("meter").getAttribute("aria-valuenow")).toBe("81");
    expect(screen.getByText(/By funding source:/).textContent).toContain("Not published");
  });

  it("the Concentration card stacks the alpha shares the server publishes; the HHI is its own figure", async () => {
    mount(served());
    await ready();
    const stack = await screen.findByRole("img", { name: /strat_btc 61\.724%, strat_eth 38\.276%/ });
    expect(stack.getAttribute("aria-label")).toContain("strat_btc 61.724%");
    expect(stack.querySelectorAll(".exec-cap-seg")).toHaveLength(2);
    expect((stack.querySelectorAll(".exec-cap-seg")[0] as HTMLElement).style.width).toBe("61.724%");
  });
});

describe("QA1 P3-01: the Allocated KPI and the Capital panel read one statement", () => {
  it("the KPI shows the statement's allocation (the panel row and the bar's figure), not the resource's all-books figure", async () => {
    mount(served());
    await ready();
    const table = await screen.findByRole("table", { name: "Capital statements" });
    await waitFor(() => expect(table.querySelector(".exec-part")).not.toBeNull());
    const strip = screen.getByLabelText("Portfolio identity");
    const tile = within(strip).getByText("Allocated (current)").closest("div")!;
    expect(tile.textContent).toContain("14,580.00");
    expect(tile.textContent).toContain("Of the approved budget");
    const row = [...table.querySelectorAll("tr")].find((tr) => tr.querySelector("th")?.textContent === "Allocated")!;
    expect(row.textContent).toContain("14,580.00");
    expect(within(strip).queryByText("Allocated, all books")).toBeNull();
    expect(screen.getByRole("group", { name: "Allocated of approved budget" }).textContent).toContain("14,580.00");
  });
});

describe("Allocations: the capital flow", () => {
  it("draws one Sankey per book with the budget as a dashed limit, the deployment table beside it, and asks both reads per environment once the tab is open", async () => {
    const asked: Query[] = [];
    mount(served(asked), "?tab=allocations");
    await ready();
    const flow = await screen.findByRole("region", { name: "Capital flow · Live" });
    expect(flow.querySelector("figure.exec-flow")).not.toBeNull();
    expect(within(flow).getAllByText("Limit, not cash").length).toBeGreaterThan(0);
    expect(flow.textContent).toContain("Approved budget");
    expect(flow.textContent).toContain("Initial funds");
    // UXM-07 WP-2: the basis line says what a budget is (a limit on what may be allocated, not cash) and that the times are UTC and never inferred.
    expect(flow.textContent).toContain("Basis: Amounts in each block's own currency and never summed. An approved budget is a limit on what may be allocated, not cash: it is not added to funds, NAV or allocations. Times are UTC, the effective time each source publishes, none inferred.");
    // The facts without a band are a table now (Fact, Amount, Time), so each fact row can state its time.
    const facts = within(flow).getByRole("table", { name: "Facts without a band, Live" });
    expect(within(facts).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["Fact", "Amount", "Time"]);
    expect(facts.textContent).toContain("19,750.00");
    expect(facts.textContent).toContain("360.00");
    expect(facts.textContent).toContain("3,420.00");
    const live = asked.filter((q) => q.environment === "live" && q.groupBy !== undefined).map((q) => q.groupBy![0]);
    expect(live).toEqual(expect.arrayContaining(["portfolio_id", "alpha_id"]));
  });

  it("keeps a simulated book apart from the Real-funded one", async () => {
    mount(served(), "?tab=allocations");
    await ready();
    const real = await screen.findByRole("region", { name: "Real-funded" });
    await waitFor(() => expect(within(real).queryByRole("region", { name: "Capital flow · Live" })).not.toBeNull());
    const simulated = screen.getByRole("region", { name: "Simulated" });
    await waitFor(() => expect(within(simulated).queryByRole("region", { name: "Capital flow · Paper" })).not.toBeNull());
    expect(within(real).queryByRole("region", { name: "Capital flow · Paper" })).toBeNull();
    expect(within(simulated).queryByRole("region", { name: "Capital flow · Live" })).toBeNull();
  });

  it("says no flow is drawn when the dataset publishes no statement, and draws no empty diagram", async () => {
    const api = withDataset(makeApi().api, () => datasetFor("PORTFOLIO", PF.core, (body: Body) => { body.capital_statements = []; }));
    mount(api, "?tab=allocations");
    await ready();
    const real = await screen.findByRole("region", { name: "Real-funded" });
    await waitFor(() => expect(real.textContent).toContain("published no capital statement in Live"));
    expect(document.querySelectorAll("figure.exec-flow")).toHaveLength(0);
  });

  it("a figure that is not published is an absent node, not a made-up amount", async () => {
    const api = withDataset(makeApi().api, (query) => datasetFor("PORTFOLIO", PF.core, (body: Body) => {
      body.capital_statements = [{ partition: query.environment === "live" ? LIVE() : partition("PAPER", "USDT", "usdt"), metrics: { ...FULL, current_budget: absentMetric({ reason_code: "SOURCE_FACTS_NOT_PUBLISHED", unit: "MONEY", currency: "USDT" }) } }];
    }));
    mount(api, "?tab=allocations");
    await ready();
    const flow = await screen.findByRole("region", { name: "Capital flow · Live" });
    fireEvent.click(within(flow).getByText("Table view"));
    expect(flow.textContent).toContain("Not published: capital statements");
  });
});

describe("Allocations: the capital flow states when each flow took effect (UXM-07 WP-2)", () => {
  const T = { funds: Date.UTC(2026, 6, 12, 12, 0), returned: Date.UTC(2026, 6, 15, 12, 0), budget: Date.UTC(2026, 6, 27, 12, 0), alpha: Date.UTC(2026, 8, 11, 12, 0) };
  const at = (metric: Body, ms: number) => ({ ...metric, effective_at_ms: ms });
  const withTimes = () => withDataset(makeApi().api, (query) => datasetFor("PORTFOLIO", PF.core, (body: Body) => {
    body.capital_statements = [{ partition: query.environment === "live" ? LIVE() : partition("PAPER", "USDT", "usdt"), metrics: {
      ...FULL, initial_funds: at(money("20000.00"), T.funds), returned_capital: at(money("250.00"), T.returned), current_budget: at(money("18000.00"), T.budget),
    } }];
    if (query.groupBy?.[0] === "alpha_id") {
      body.groups = [["strat_btc", "9000.00"]].map(([alpha, allocation]) => ({
        key: [{ field: "alpha_id", value: alpha }], unique_row_count: 1, totals_scope: "FULL_AUTHORIZED_FILTERED_QUERY",
        economic_partitions: [{ partition: query.environment === "live" ? LIVE() : partition("PAPER", "USDT", "usdt"), metrics: { net_pnl: money("1"), allocation: at(money(allocation!), T.alpha) } }],
      }));
      body.items = [body.items[0]];
      body.page = { limit: 1, returned_count: 1, authorized_filtered_count: 1, next_cursor: null, previous_cursor: null };
    }
  }));

  it("draws a short date under each node that has a published time, and prints the whole UTC time in the table's Time column", async () => {
    mount(withTimes(), "?tab=allocations");
    await ready();
    const flow = await screen.findByRole("region", { name: "Capital flow · Live" });
    await waitFor(() => expect(flow.querySelectorAll("[data-testid='flow-time']").length).toBeGreaterThan(0));
    const captions = [...flow.querySelectorAll("[data-testid='flow-time']")].map((node) => node.textContent);
    expect(captions).toEqual(expect.arrayContaining(["12 Jul", "15 Jul", "27 Jul", "11 Sep"]));
    fireEvent.click(within(flow).getByText("Table view"));
    const tables = flow.querySelectorAll("table.exec-c2-tbl");
    expect([...tables[0]!.querySelectorAll("thead th")].map((cell) => cell.textContent)).toEqual(["Node", "Column", "Amount", "Time", "Note"]);
    const row = (label: string) => [...tables[0]!.querySelectorAll("tbody tr")].find((tr) => tr.querySelector("th")?.textContent === label)!;
    expect(row("Initial funds").textContent).toContain("12 Jul 12:00Z");
    expect(row("Returned").textContent).toContain("15 Jul 12:00Z");
    expect(row("Approved budget").textContent).toContain("27 Jul 12:00Z");
    // NAV is a valuation, not a flow with a receipt: it states no time. A published zero flow says there was no receipt.
    expect(row("NAV").querySelector(".exec-c2-time")!.textContent).toBe("");
    expect(row("Added funds").textContent).toContain("No receipt");
    // The dashed limit is the budget's approval, and the budget stays a limit in the table.
    const limit = [...tables[0]!.querySelectorAll("tr.exec-c2-tbl-edge")].find((tr) => tr.textContent?.includes("Limit, not cash"))!;
    expect(limit.textContent).toContain("27 Jul 12:00Z");
    expect(limit.textContent).toContain("Not cash");
  });

  it("an unpublished time says 'Not published' in the facts table and in the deployment table (here the ledger is a bounded read), and no caption is drawn for it", async () => {
    mount(served(), "?tab=allocations");
    await ready();
    const flow = await screen.findByRole("region", { name: "Capital flow · Live" });
    const facts = within(flow).getByRole("table", { name: "Facts without a band, Live" });
    expect([...facts.querySelectorAll("tbody tr")].map((tr) => tr.textContent)).toEqual([
      expect.stringContaining("Not published"), expect.stringContaining("Not published"), expect.stringContaining("Not published"),
    ]);
    expect(flow.querySelectorAll("[data-testid='flow-time']")).toHaveLength(0);
    const deployments = within(flow).getByRole("table", { name: "Deployments in the Live flow" });
    expect(within(deployments).getAllByRole("columnheader").map((cell) => cell.textContent)).toContain("Allocated at");
  });
});
