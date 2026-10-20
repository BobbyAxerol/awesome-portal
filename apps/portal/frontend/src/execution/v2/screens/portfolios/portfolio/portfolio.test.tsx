/**
 * Portfolio 360 against the Playwright double, through the real readers: each
 * tab, the Not published cells with their request ids, the Actions rail, V1
 * tab labels, capability variants, and every state the screen must keep apart.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { PF, answerPortfolios } from "../../../../../../e2e/bffDoublePortfolios";
import type { ExecutionApi } from "../../../../api/ports";
import { V2_CAPABILITY } from "../../../shell/roleNav";
import { makeApi, type Override } from "../harness.fixtures";
import { seriesBodyFor, type SeriesVariant } from "../../series/seriesDouble.testbase";
import PortfolioScreen, { PORTFOLIO_SCREEN_KEY } from "./index";
import { incidentRoute } from "./People";
import { COMPARE_OFF_REASON, DEFAULT_ROUTES } from "../routes";
import { whyText } from "../../../gapWhyTestUtil";

afterEach(cleanup);

function Where() {
  const { pathname, search, hash } = useLocation();
  return <output data-testid="where">{pathname + search + hash}</output>;
}

const mount = (api: ExecutionApi, query = "", portfolioId: string | null = PF.core, capabilities?: ReadonlySet<string>) =>
  render(
    <MemoryRouter initialEntries={[`/deployments/portfolios/${portfolioId ?? ""}${query}`]}>
      <PortfolioScreen api={api} portfolioId={portfolioId ?? undefined} capabilities={capabilities} />
      <Where />
    </MemoryRouter>,
  );

const where = () => screen.getByTestId("where").textContent ?? "";
const search = () => new URLSearchParams(where().split("?")[1]?.split("#")[0] ?? "");
const ready = () => screen.findByRole("tablist", { name: "Portfolio sections" });
const panel = () => screen.getByRole("tabpanel");
const goto = async (name: string) => {
  fireEvent.click(screen.getByRole("tab", { name }));
  await waitFor(() => expect(screen.getByRole("tab", { name }).getAttribute("aria-selected")).toBe("true"));
};
const rowsOf = (label: string) => within(screen.getByRole("table", { name: label })).getAllByRole("row").slice(1);
const cell = (row: HTMLElement, label: string) => row.querySelector(`td[data-l='${label}']`)?.textContent ?? "";

describe("header", () => {
  it("is the portfolios flag's screen and prints identity from the resource", async () => {
    expect(PORTFOLIO_SCREEN_KEY).toBe("portfolios");
    mount(makeApi().api);
    await ready();
    expect(screen.getByRole("heading", { level: 1, name: "Core" })).toBeTruthy();
    expect(document.body.textContent).toContain(PF.core);
    expect(document.body.textContent).toContain("M. Tran");
    expect(screen.getByText("Active")).toBeTruthy();
    // FRESH prints no chip; the as-of line says it. Score is on the Overview's one 'Not available' line.
    expect(screen.queryByText("Fresh")).toBeNull();
    expect(screen.getByText(/As of 2026-10-17/)).toBeTruthy();
    expect(screen.queryByText(/Score: Not published/)).toBeNull();
    expect(screen.getByTestId("not-available-line").textContent).toContain("Score");
  });

  it("links back to the list, to Compare with this portfolio, and turns the report pack off with the one sentence", async () => {
    mount(makeApi().api, "?env=paper");
    await ready();
    expect(screen.getByRole("link", { name: "Portfolios" }).getAttribute("href")).toContain("/deployments/portfolios");
    const compare = new URL(screen.getByRole("link", { name: "Compare with" }).getAttribute("href")!, "http://x");
    // The only URL the app mounts Compare on (no registry row yet): the portfolios route with ?view=compare.
    expect(compare.pathname).toBe("/deployments/portfolios");
    expect(compare.searchParams.get("view")).toBe("compare");
    expect(compare.searchParams.get("in")).toBe(PF.core);
    expect(compare.searchParams.get("from")).toBe(`portfolio:${PF.core}`);
    expect(compare.searchParams.get("env")).toBe("paper");
    expect(screen.queryByRole("button", { name: "Report pack" })).toBeNull();
  });

  it("M2: with Compare off the header has no link to it, a disabled control with the reason instead", async () => {
    render(
      <MemoryRouter initialEntries={[`/deployments/portfolios/${PF.core}?env=paper`]}>
        <PortfolioScreen api={makeApi().api} portfolioId={PF.core} routes={{ ...DEFAULT_ROUTES, compare: null }} />
        <Where />
      </MemoryRouter>,
    );
    await ready();
    expect(screen.queryByRole("link", { name: "Compare with" })).toBeNull();
    const button = screen.getByRole("button", { name: "Compare with" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.title).toBe(COMPARE_OFF_REASON);
    expect(document.getElementById(button.getAttribute("aria-describedby") ?? "")?.textContent).toBe(COMPARE_OFF_REASON);
    expect(document.querySelector("a[href*='view=compare']")).toBeNull();
  });

  it("says Not available for an owner or base currency the resource did not publish", async () => {
    mount(makeApi().api, "", PF.empty);
    await ready();
    expect(document.body.textContent).toContain("Owner: Not available");
  });
});

describe("Overview", () => {
  it("prints identity KPIs from published facts and the allocation as the server summed it", async () => {
    mount(makeApi().api);
    await ready();
    const strip = screen.getByRole("group", { name: "Portfolio identity" });
    const tile = (label: string) => within(strip).getByText(label).closest("div")!.textContent ?? "";
    expect(tile("Alphas")).toContain("4");
    expect(tile("Deployments")).toContain("5");
    expect(tile("Deployments")).toContain("5 holdings");
    expect(tile("Accounts")).toContain("4");
    expect(tile("Allocated (current)")).toContain("540,000.00");
    expect(tile("Allocated (current)")).toContain("USDT");
    expect(tile("Allocated (current)")).not.toContain("not a window");
  });

  it("names Net PnL, Return, Drawdown, Concentration, the capital statements, the funding source and Score ONCE, ids in the title; NAV keeps its own cell", async () => {
    mount(makeApi().api);
    await ready();
    const strip = screen.getByRole("group", { name: "Portfolio identity" });
    expect(within(strip).getByText("NAV").closest("div")!.textContent).toContain("Not published (FE-013)");
    for (const label of ["Net PnL · 90D", "Return · 90D", "Drawdown"]) expect(within(strip).queryByText(label), label).toBeNull();
    expect(screen.getAllByTestId("not-available-line")).toHaveLength(1);
    const line = screen.getByTestId("not-available-line");
    expect(line.textContent).toContain("Not available: Net PnL, Return, Drawdown, Concentration, Capital statements, Funding source, Stage, decision, incident and recall lanes, Score");
    const title = whyText(line);
    for (const id of ["FE-005", "FE-006", "FE-013", "FE-017", "FE-032", "FE-011"]) expect(title, id).toContain(`Not published (${id})`);
  });

  it("draws the retained equity series with its gap, its envelope, a retained-snapshot pill and no drawdown", async () => {
    mount(makeApi().api);
    const figure = await screen.findByRole("img", { name: /Core equity/ });
    expect(figure).toBeTruthy();
    expect(screen.getByText("Retained snapshots")).toBeTruthy();
    expect(screen.getByText("Account equity, not NAV")).toBeTruthy();
    expect(screen.getByText("Account equity, not NAV").getAttribute("title")).toBe("Benchmark: not available");
    expect(document.body.textContent).toContain("Retained snapshot gap");
    expect(document.body.textContent).toContain("Server: 40 of 4,592 points, MIN_MAX_LAST_BUCKET_V1");
    expect(document.body.textContent).toContain("1 gap drawn as a gap, not joined");
    // No drawdown pane: Drawdown is on the one 'Not available' line instead.
    expect(screen.getByTestId("not-available-line").textContent).toContain("Drawdown");
    expect(document.querySelectorAll(".exec-c2-svg").length).toBeGreaterThan(0);
  });

  it("has no disabled Net PnL, Return or Export beside the equity chart: only the retained equity is published", async () => {
    mount(makeApi().api);
    await ready();
    expect(screen.queryByRole("group", { name: "Series" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Net PnL" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Return" })).toBeNull();
    expect(screen.queryAllByRole("button", { name: /Export|Report pack/ })).toHaveLength(0);
  });

  it("asks the chart for a width from the window it is drawn in", async () => {
    const { api, queriesOf } = makeApi();
    mount(api);
    await screen.findByRole("img", { name: /Core equity/ });
    expect(queriesOf("/views/equity-chart")[0].get("viewport_px")).toBe(String(Math.min(2048, Math.max(256, window.innerWidth))));
  });

  it("asks the chart for the shared window as a range from the resource's own clock, and not for ALL", async () => {
    const { api, queriesOf } = makeApi();
    mount(api, "?window=30d");
    await screen.findByRole("img", { name: /Core equity/ });
    const query = queriesOf("/views/equity-chart")[0];
    expect(query.get("subject_kind")).toBe("portfolio");
    expect(query.get("subject_id")).toBe(PF.core);
    expect(query.get("metric")).toBe("equity");
    expect(Number(query.get("to_ms")) - Number(query.get("from_ms"))).toBe(30 * 86_400_000);
    cleanup();
    const all = makeApi();
    mount(all.api, "?window=all");
    await screen.findByRole("img", { name: /Core equity/ });
    expect(all.queriesOf("/views/equity-chart")[0].has("from_ms")).toBe(false);
  });

  it("says the capital statements are not available once, and the per-currency capital is only on Allocations, never twice", async () => {
    mount(makeApi().api);
    await ready();
    expect(screen.queryByRole("region", { name: "Capital in Live" })).toBeNull();
    expect(screen.queryByRole("table", { name: "Capital statements" })).toBeNull();
    const line = screen.getByTestId("not-available-line");
    expect(line.textContent).toContain("Capital statements");
    expect(whyText(line)).toContain("Capital statements: Not published (FE-017)");
    expect(whyText(line)).toContain("recalling");
    await goto("Allocations");
    const live = screen.getByRole("region", { name: "Capital in Live" });
    expect(within(live).getByText("460,000.00")).toBeTruthy();
    expect(within(live).getByText("700,000.00")).toBeTruthy();
    expect(within(live).getByText("697,700.00")).toBeTruthy();
    const paper = screen.getByRole("region", { name: "Capital in Paper" });
    expect(within(paper).getByText("80,000.00")).toBeTruthy();
    expect(within(paper).getByText("Partial")).toBeTruthy();
    // The published code is behind the state's disclosure, not in the line.
    expect(paper.textContent).not.toContain("MARGIN_BALANCES_NOT_PUBLISHED");
    expect(whyText(paper.querySelector(".exec-blk-boundary .exec-blk-why"))).toBe("MARGIN_BALANCES_NOT_PUBLISHED");
    expect(within(paper).getByText(/Inputs the source did not publish: margin_balances/)).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Capital in Sandbox" })).toBeNull();
  });

  it("says on the Overview that Simulated capital is never added to Real-funded figures", async () => {
    mount(makeApi().api);
    await ready();
    expect(screen.getByText("Simulated capital. It is never added to Real-funded figures.")).toBeTruthy();
  });

  it("lists what the projection reports as not ready: deployments and accounts", async () => {
    mount(makeApi().api);
    await ready();
    const attention = screen.getByRole("region", { name: "Needs attention" });
    expect(within(attention).getByText("live-0193")).toBeTruthy();
    expect(within(attention).getByText("Needs attention", { selector: ".exec-flag" })).toBeTruthy();
    expect(within(attention).getByText("live-0210")).toBeTruthy();
    expect(within(attention).getByText("Finding open")).toBeTruthy();
    expect(within(attention).getByText("Binance-02")).toBeTruthy();
    expect(within(attention).getByText(/1 open finding/)).toBeTruthy();
  });

  it("never prints a dash, N/A or a bare zero for something unpublished", async () => {
    mount(makeApi().api);
    await screen.findByRole("img", { name: /Core equity/ });
    expect(document.body.textContent).not.toMatch(/—|–|N\/A/);
  });
});

describe("NAV (FE-013, BE-P4 manager series)", () => {
  const serving = (variant: SeriesVariant): Override => (_method, path, search) => (path === "/manager/series"
    ? variant.startsWith("status:") ? { status: Number(variant.slice(7)), body: { error: { code: "REFUSED", message: "refused" } } } : { status: 200, body: seriesBodyFor(search, variant) }
    : undefined);
  const navPanel = () => screen.getByRole("region", { name: "NAV" });
  const kpiNav = () => within(screen.getByRole("group", { name: "Portfolio identity" })).getByText("NAV").closest("div")!;

  it("asks for ONE portfolio's NAV in the selected environment and the page window, through the port", async () => {
    const harness = makeApi(serving("populated"));
    mount(harness.api, "?env=paper&window=30d");
    await waitFor(() => expect(harness.queriesOf("/manager/series")).toHaveLength(1));
    const query = harness.queriesOf("/manager/series")[0]!;
    expect(Object.fromEntries(query)).toMatchObject({ metric: "NAV", window: "\"30D\"" });
    expect(JSON.parse(query.get("subjects")!)).toEqual([{ subject_type: "PORTFOLIO", subject_id: PF.core }]);
    expect(["live", "paper", "sandbox"]).toContain(query.get("environment"));
  });

  it("AVAILABLE draws the line with its methodology and window, and the NAV cells are the latest point as sent", async () => {
    mount(makeApi(serving("populated")).api);
    await ready();
    await waitFor(() => expect(navPanel().querySelector("[data-testid='series-caption']")).not.toBeNull());
    const caption = navPanel().querySelector("[data-testid='series-caption']")!.textContent!;
    expect(caption).toContain("NAV in USDT");
    expect(navPanel().querySelector("[data-testid='series-caption']")!.getAttribute("title")).toContain("methodology TEST_ONLY:nav-twr.v1");
    expect(navPanel().querySelector("svg")).not.toBeNull();
    for (const node of [kpiNav()]) {
      const figure = node.querySelector("span[title]");
      expect(figure, node.textContent ?? "").not.toBeNull();
      expect(figure!.getAttribute("title")).toMatch(/^-?\d+(\.\d+)?$/);
      expect(node.textContent).not.toContain("Not published");
    }
    // Net PnL, Return and Drawdown are not this series: they stay on the one 'Not available' line with their ids.
    expect(screen.getByTestId("not-available-line").textContent).toContain("Net PnL, Return, Drawdown");
  });

  it("EMPTY says 'No points in this window' in the card and the KPI: no zero, no line", async () => {
    mount(makeApi(serving("empty")).api);
    await ready();
    await waitFor(() => expect(navPanel().querySelector("[data-testid='series-empty']")).not.toBeNull());
    expect(navPanel().textContent).toContain("No points in this window");
    expect(navPanel().querySelector("svg")).toBeNull();
    expect(kpiNav().textContent).toContain("No points in this window");
    expect(kpiNav().textContent).not.toMatch(/\d/);
  });

  it("UNAVAILABLE for a source that is not published keeps Not published (FE-013) and names the code", async () => {
    mount(makeApi(serving("unavailable")).api);
    await ready();
    await waitFor(() => expect(navPanel().textContent).toContain("SERIES_SOURCE_NOT_PUBLISHED"));
    expect(navPanel().textContent).toContain("Not published (FE-013)");
    expect(kpiNav().textContent).toContain("Not published (FE-013)");
    expect(navPanel().querySelector("svg path[data-main]")).toBeNull();
  });

  it("UNAVAILABLE for ALL prints its own typed reason in the card and the KPI, not a source gap", async () => {
    mount(makeApi(serving("populated")).api, "?window=all");
    await ready();
    await waitFor(() => expect(navPanel().textContent).toContain("ALL_HISTORY_WINDOW_NOT_PUBLISHED"));
    expect(navPanel().textContent).toContain("Not available");
    expect(kpiNav().textContent).toContain("Not available · All history is not a published window (ALL_HISTORY_WINDOW_NOT_PUBLISHED)");
    expect(kpiNav().textContent).not.toContain("Not published");
  });

  it.each(["status:400", "status:404", "status:503"] as const)("a failed series read (%s) is typed 'Not available' in the card and leaves the rest of the Overview standing", async (variant) => {
    mount(makeApi(serving(variant)).api);
    await ready();
    await waitFor(() => expect(navPanel().textContent).toContain("The series could not be read"));
    expect(navPanel().textContent).toContain("Not available");
    expect(navPanel().querySelector("svg path[data-main]")).toBeNull();
    expect(kpiNav().textContent).toContain("Not published (FE-013)");
    expect(screen.getByRole("group", { name: "Portfolio identity" })).toBeTruthy();
  });

  it("a series that answers another portfolio is refused by the port and never drawn as this one", async () => {
    const wrongSubject: Override = (_m, path, search) => {
      if (path !== "/manager/series") return undefined;
      const body = seriesBodyFor(search, "populated");
      body.series[0].subject.subject_id = "pf_someone_else";
      return { status: 200, body };
    };
    mount(makeApi(wrongSubject).api);
    await ready();
    await waitFor(() => expect(navPanel().textContent).toContain("could not be read"));
    expect(navPanel().querySelector("svg")).toBeNull();
  });
});

describe("Allocations", () => {
  it("keeps Real-funded and Simulated in separate blocks, with the banner that says they are never added", async () => {
    mount(makeApi().api);
    await ready();
    await goto("Allocations");
    expect(search().get("tab")).toBe("allocations");
    expect(screen.getByText("Simulated capital. It is never added to Real-funded figures.")).toBeTruthy();
    const real = screen.getByRole("region", { name: "Real-funded" });
    const simulated = screen.getByRole("region", { name: "Simulated" });
    expect(within(real).getByRole("region", { name: "Capital in Live" })).toBeTruthy();
    expect(within(real).queryByRole("region", { name: "Capital in Paper" })).toBeNull();
    expect(within(simulated).getByRole("region", { name: "Capital in Paper" })).toBeTruthy();
    expect(within(simulated).queryByRole("region", { name: "Capital in Live" })).toBeNull();
  });

  it("says once that the capital flow and the receipts are not available, and draws no empty diagram (UX audit A)", async () => {
    mount(makeApi().api);
    await ready();
    await goto("Allocations");
    expect(document.querySelectorAll("figure.exec-flow")).toHaveLength(0);
    const line = screen.getByTestId("not-available-line");
    expect(line.textContent).toContain("Not available: Capital flow, Ledger receipts");
    expect(line.textContent).toContain("FE-032");
    expect(document.body.textContent).not.toContain("Hover or focus a node");
  });

  it("lists the ledger newest first with before and after as published, and says what is bounded", async () => {
    mount(makeApi().api);
    await ready();
    await goto("Allocations");
    const table = await screen.findByRole("table", { name: "Capital ledger in Live" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(5);
    expect(cell(rows[0], "Event")).toBe("Withdraw");
    expect(cell(rows[0], "Direction")).toBe("Decrease");
    expect(cell(rows[0], "Amount")).toContain("20,000.00");
    expect(cell(rows[0], "Allocated before")).toContain("140,000.00");
    expect(cell(rows[0], "Allocated after")).toContain("120,000.00");
    expect(cell(rows[4], "Event")).toBe("Initial allocation");
    expect(cell(rows[2], "Direction")).toBe("Unchanged");
    expect(rows.map((r) => cell(r, "Time · UTC"))).toEqual([...rows.map((r) => cell(r, "Time · UTC"))].sort().reverse());
    expect(within(table).queryByRole("columnheader", { name: "Receipt" })).toBeNull();
    const block = screen.getByRole("region", { name: "Capital ledger in Live" });
    expect(block.textContent).toContain("Showing 5 of 12.");
    expect(block.textContent).toContain("publishes no older page");
    expect(block.textContent).toMatch(/gross increase 480,000\.00 USDT · gross decrease 20,000\.00 USDT/);
  });

  it("says an empty ledger is a fact, not a zero balance", async () => {
    mount(makeApi().api);
    await ready();
    await goto("Allocations");
    const paper = await screen.findByRole("region", { name: "Capital ledger in Paper" });
    await waitFor(() => expect(paper.textContent).toContain("published no entry in Paper"));
    expect(paper.textContent).toContain("not a zero balance");
  });

  it("reads each ledger once, only for an environment the portfolio has a book in; the selected one from the start (the Overview ribbon), the others when the tab opens", async () => {
    const { api, calls } = makeApi();
    mount(api);
    await ready();
    await screen.findByRole("group", { name: "Capital flow events, Live" });
    expect(calls.filter((c) => c.includes("capital-ledger"))).toEqual([`GET /portfolios/${PF.core}/capital-ledger?environment=live`]);
    await goto("Allocations");
    await screen.findByRole("table", { name: "Capital ledger in Live" });
    const ledgers = calls.filter((c) => c.includes("capital-ledger"));
    expect(ledgers.sort()).toEqual([
      `GET /portfolios/${PF.core}/capital-ledger?environment=live`,
      `GET /portfolios/${PF.core}/capital-ledger?environment=paper`,
    ]);
  });

  it("shows a ledger the engine refused as its own typed state, and leaves the rest of the page standing", async () => {
    const refuse: Override = (_m, path) => (path.endsWith("/capital-ledger") ? { status: 503, body: { error: { code: "ANALYTICS_ARITHMETIC_UNAVAILABLE" } } } : undefined);
    mount(makeApi(refuse).api);
    await ready();
    await goto("Allocations");
    expect(await screen.findAllByText("The engine could not complete this computation.")).toHaveLength(2);
    expect(screen.getByRole("region", { name: "Capital in Live" })).toBeTruthy();
  });

  it("says a portfolio has no Simulated book instead of drawing an empty block", async () => {
    mount(makeApi().api, "?tab=allocations", PF.satellite);
    await ready();
    expect(screen.getByText("This portfolio has no Simulated book in the projection.")).toBeTruthy();
    expect(screen.queryByText("Simulated capital. It is never added to Real-funded figures.")).toBeNull();
  });
});

describe("Alphas", () => {
  it("lists five deployments under four alphas with the server's per-deployment strings and no per-alpha sum", async () => {
    mount(makeApi().api);
    await ready();
    await goto("Alphas");
    const rows = rowsOf("Alphas and deployments");
    expect(rows).toHaveLength(5);
    const btc = rows.filter((r) => cell(r, "Alpha").startsWith("BTC-Trend"));
    expect(btc).toHaveLength(2);
    expect(cell(btc[0], "Alpha")).toContain("v3 · asmith");
    expect(cell(btc[0], "Allocation")).toContain("120,000.00");
    expect(cell(btc[0], "Allocation")).toContain("USDT");
    const carry = rows.find((r) => cell(r, "Deployment") === "pap-0301")!;
    expect(cell(carry, "Position PnL, now")).toContain("-410.00");
    expect(carry.querySelector('.exec-pf-num[data-tone="negative"]')).not.toBeNull();
    expect(panel().textContent).not.toContain("320,000.00");
    for (const row of rows) expect(cell(row, "Share of PnL")).toBe("Not published (FE-005, FE-025)");
    expect(panel().textContent).toContain("4 alphas · 5 deployments");
    expect(within(panel()).getByRole("link", { name: "Open in Alpha Fleet" }).getAttribute("href")).toContain("/deployments/alphas");
  });

  it("links alphas, deployments by stage and accounts, and carries the context", async () => {
    mount(makeApi().api, "?window=7d");
    await ready();
    await goto("Alphas");
    const rows = rowsOf("Alphas and deployments");
    expect(within(rows[0]).getByRole("link", { name: "BTC-Trend" }).getAttribute("href")).toContain("/deployments/alphas/strat_btc");
    expect(within(rows[0]).getByRole("link", { name: "live-0192" }).getAttribute("href")).toContain("/deployments/live/live-0192");
    const paper = rows.find((r) => cell(r, "Deployment") === "pap-0301")!;
    expect(within(paper).getByRole("link", { name: "pap-0301" }).getAttribute("href")).toContain("/deployments/paper/pap-0301");
    expect(within(rows[0]).getByRole("link", { name: "Binance-02" }).getAttribute("href")).toContain("window=7d");
  });

  it("draws contribution as current position PnL, one chart per currency, never combined", async () => {
    mount(makeApi().api);
    await ready();
    await goto("Alphas");
    const charts = panel().querySelectorAll("figure.exec-divbars");
    expect(charts).toHaveLength(1);
    expect(charts[0].textContent).toContain("Position PnL by deployment · USDT");
    expect(panel().textContent).toContain("Position PnL now · not a window");
    expect(panel().textContent).toContain("Share of PnL over a window is Not published (FE-005, FE-025)");
  });
});

describe("Accounts", () => {
  it("shows each account once with how many deployments of this portfolio it serves, and its balance beside it", async () => {
    mount(makeApi().api);
    await ready();
    await goto("Accounts");
    const rows = rowsOf("Accounts");
    expect(rows.map((r) => r.querySelector("a, .exec-pf-name")?.textContent?.split("BINANCE")[0])).toBeTruthy();
    const binance = rows.find((r) => cell(r, "Account").startsWith("Binance-02"))!;
    expect(cell(binance, "Serves here")).toBe("2 deployments");
    expect(cell(binance, "Venue balance, total")).toContain("412,880.00");
    expect(cell(binance, "Status")).toContain("Stale");
    expect(cell(binance, "Last synced")).toContain("2026-10-17 11:50");
    const okx = rows.find((r) => cell(r, "Account").startsWith("OKX-01"))!;
    expect(cell(okx, "Status")).toContain("Synced");
    expect(panel().textContent).toContain("never this portfolio's capital or added to it");
    expect(rows).toHaveLength(4);
  });
});

describe("Risk and Health", () => {
  it("shows exposure per deployment, margin per account and reconciliation, and names what it will not work out", async () => {
    mount(makeApi().api);
    await ready();
    await goto("Risk and Health");
    const exposure = rowsOf("Exposure by deployment");
    expect(exposure).toHaveLength(5);
    expect(cell(exposure[0], "Gross exposure, now")).toContain("114,100.00");
    const margin = rowsOf("Margin by account");
    const binance = margin.find((r) => cell(r, "Account") === "Binance-02")!;
    expect(cell(binance, "Initial margin")).toContain("100,430.00");
    expect(cell(binance, "Maintenance margin")).toContain("50,215.00");
    expect(cell(binance, "Utilization")).toBe("Not available · not published");
    const paperMargin = margin.find((r) => cell(r, "Account") === "Paper-Binance")!;
    expect(cell(paperMargin, "Initial margin")).toBe("Not available · no margin published");
    const recon = rowsOf("Reconciliation by account");
    expect(cell(recon.find((r) => cell(r, "Account") === "Binance-02")!, "Open findings")).toBe("1");
    expect(cell(recon.find((r) => cell(r, "Account") === "OKX-01")!, "Open findings")).toBe("0");
    expect(panel().textContent).toContain("Drawdown now and max");
    expect(panel().textContent).toContain("Not published (FE-013, FE-025)");
    expect(panel().textContent).toContain("Exposure cap");
    expect(panel().textContent).toContain("Not available · no cap published");
  });

  it("types the correlation as having no data source, with hatched cells and the server's reason", async () => {
    mount(makeApi().api);
    await ready();
    await goto("Risk and Health");
    expect((await screen.findByTitle("No correlation data source")).textContent).toContain("Not available");
    const matrix = panel().querySelector('[role="img"][aria-label="Correlation matrix, not available"]')!;
    expect(matrix.querySelectorAll('.exec-pf-mx-cell[data-hatch="true"]').length).toBe(16);
    expect(panel().textContent).toContain("The source system serves no route for this panel");
  });

  it("lists the strongest published correlations when the source has them, as the exact strings", async () => {
    mount(makeApi().api, "", PF.satellite);
    await ready();
    await goto("Risk and Health");
    const table = await screen.findByRole("table", { name: "Strongest correlations" });
    expect(within(table).getAllByRole("row").length).toBeGreaterThan(1);
    expect(panel().textContent).toMatch(/Top \d+ \/ \d+ pairs by magnitude/);
  });
});

describe("People and Activity", () => {
  it("names the feed, the audit source and the approvals scope as not published or not available", async () => {
    mount(makeApi().api);
    await ready();
    await goto("People and Activity");
    expect(panel().textContent).toContain("Not published (FE-031)");
    expect(panel().textContent).toContain("Not published (FE-021)");
    expect(panel().textContent).toContain("the approvals read cannot be limited to one portfolio");
    expect(within(panel()).getByRole("link", { name: "All approvals" }).getAttribute("href")).toContain("/governance/approvals");
  });

  it("attributes the portfolio to its owner and each alpha to its owner, and says who holds grants is not published here", async () => {
    mount(makeApi().api);
    await ready();
    await goto("People and Activity");
    const rows = rowsOf("Attribution");
    expect(cell(rows[0], "Person")).toBe("M. Tran");
    expect(cell(rows[0], "Role here")).toBe("Portfolio owner");
    expect(rows.map((r) => cell(r, "Role here"))).toEqual(expect.arrayContaining(["Alpha owner · BTC-Trend", "Alpha owner · ETH-Mean"]));
    expect(rows.find((r) => cell(r, "Role here") === "Alpha owner · ETH-Mean")).toBeTruthy();
    expect(panel().textContent).toContain("not published here");
  });

  it("reads the operations that target this portfolio and lists them with the queue's own words", async () => {
    const { api, queriesOf } = makeApi();
    mount(api);
    await ready();
    await goto("People and Activity");
    const table = await screen.findByRole("table", { name: "Operations on this portfolio" });
    expect(within(table).getAllByRole("row").length).toBeGreaterThan(1);
    const query = queriesOf("/operations")[0];
    expect(query.get("target_type")).toBe("PORTFOLIO");
    expect(query.get("target_id")).toBe(PF.core);
  });

  it("D5: an operation links to its `?operation=` deep link, never through sel", async () => {
    mount(makeApi().api, "?env=paper&workspace_id=ws_1");
    await ready();
    await goto("People and Activity");
    const table = await screen.findByRole("table", { name: "Operations on this portfolio" });
    const opLinks = within(table).getAllByRole("link");
    expect(opLinks.length).toBeGreaterThan(0);
    for (const link of opLinks) {
      const href = new URL(link.getAttribute("href")!, "http://x");
      expect(href.pathname).toBe("/execution/operations");
      expect(href.searchParams.get("operation")).toMatch(/^op_/);
      expect(href.searchParams.get("sel")).toBeNull();
      expect(href.searchParams.get("workspace_id")).toBe("ws_1");
      expect(href.searchParams.get("env")).toBe("paper");
    }
  });

  it("D5: a linked incident opens the incident drawer route, not an operation selection", async () => {
    const withIncident: Override = (method, path, search) => {
      if (path !== "/operations") return undefined;
      const answer = answerPortfolios(method, path, search);
      if (!answer) return answer;
      const body = JSON.parse(JSON.stringify(answer.body)) as { page: { rows: Record<string, unknown>[] } };
      body.page.rows[0]!.incident_links = {
        basis: "CURRENT_LINK_ROWS_AUTHORIZED_INCIDENTS_ONLY", bound: 3, authorized_link_count: 1, truncated: false,
        items: [{
          state: "LINKED", incident_id: "inc_TEST_ONLY_a", relationship: "RELATED", linked_at: "2026-08-22T12:09:00.000004Z",
          incident: { target: { type: "PORTFOLIO", id: PF.core }, environment: "PAPER", severity: "WARNING", workflow_state: "OPEN" },
          link_history: { availability: "NOT_PUBLISHED", reason_code: "ORIGINAL_INCIDENT_TARGET_NOT_ATTESTED" },
        }],
      };
      return { ...answer, body };
    };
    mount(makeApi(withIncident).api, "?env=paper&workspace_id=ws_1");
    await ready();
    await goto("People and Activity");
    const list = await screen.findByRole("list", { name: "Linked incidents" });
    const href = new URL(within(list).getByRole("link", { name: "inc_TEST_ONLY_a" }).getAttribute("href")!, "http://x");
    expect(href.pathname).toBe("/execution/operations/incidents/inc_TEST_ONLY_a");
    expect(href.searchParams.get("sel")).toBeNull();
    expect(href.searchParams.get("workspace_id")).toBe("ws_1");
    expect(href.searchParams.get("env")).toBe("paper");
  });

  it("D5: incidentRoute keeps a query on the operations route and encodes the id", () => {
    expect(incidentRoute("/execution/operations", "inc 1/2")).toBe("/execution/operations/incidents/inc%201%2F2");
    expect(incidentRoute("/execution/operations?x=1", "inc_1")).toBe("/execution/operations/incidents/inc_1?x=1");
  });

  it("does not read the operations queue until the tab opens", async () => {
    const { api, calls } = makeApi();
    mount(api);
    await ready();
    expect(calls.some((c) => c.startsWith("GET /operations"))).toBe(false);
  });

  it("names an operations answer it cannot read, never a quiet empty list", async () => {
    const legacy: Override = (_m, path) => (path === "/operations" ? { status: 200, body: { schema_version: "execution.operations-queue.v1", rows: [] } } : undefined);
    mount(makeApi(legacy).api);
    await ready();
    await goto("People and Activity");
    expect(await screen.findByText(/answered a shape this screen does not read/)).toBeTruthy();
  });
});

describe("V1 tab labels", () => {
  it("opens Allocations for `Capital Ledger` and rewrites the URL to the V2 key", async () => {
    mount(makeApi().api, "?tab=Capital+Ledger");
    await ready();
    expect(screen.getByRole("tab", { name: "Allocations" }).getAttribute("aria-selected")).toBe("true");
    await waitFor(() => expect(search().get("tab")).toBe("allocations"));
    expect(where()).toMatch(/#ledger$/);
    // The anchor the V1 label named exists: the first ledger on the page.
    await waitFor(() => expect(document.getElementById("ledger")).not.toBeNull());
    expect(document.getElementById("ledger")!.getAttribute("aria-label")).toBe("Capital ledger in Live");
  });

  it("opens Risk for `Structure & Correlation`", async () => {
    mount(makeApi().api, "?tab=Structure+%26+Correlation");
    await ready();
    expect(screen.getByRole("tab", { name: "Risk and Health" }).getAttribute("aria-selected")).toBe("true");
  });

  it("opens People at the Approvals and Incidents panels, which are embeds and not tabs", async () => {
    mount(makeApi().api, "?tab=approvals");
    await ready();
    expect(screen.getByRole("tab", { name: "People and Activity" }).getAttribute("aria-selected")).toBe("true");
    expect(document.getElementById("approvals")).not.toBeNull();
    expect(screen.queryByRole("tab", { name: "Approvals" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Incidents" })).toBeNull();
    expect(search().get("tab")).toBe("approvals");
  });

  it("says so, and opens Overview, for a tab that matches nothing", async () => {
    mount(makeApi().api, "?tab=Rebalance+plan");
    await ready();
    expect(screen.getByText('Tab "Rebalance plan" is not available. Showing overview.')).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Overview" }).getAttribute("aria-selected")).toBe("true");
  });
});

describe("tabs", () => {
  it("is a tablist: one tab selected, arrow keys move and select, Home and End jump", async () => {
    mount(makeApi().api);
    await ready();
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Overview", "Allocations", "Alphas", "Accounts", "Risk and Health", "People and Activity"]);
    expect(tabs.filter((t) => t.getAttribute("aria-selected") === "true")).toHaveLength(1);
    expect(tabs.filter((t) => t.getAttribute("tabindex") === "0")).toHaveLength(1);
    fireEvent.keyDown(tabs[0], { key: "ArrowRight" });
    await waitFor(() => expect(screen.getByRole("tab", { name: "Allocations" }).getAttribute("aria-selected")).toBe("true"));
    fireEvent.keyDown(screen.getByRole("tab", { name: "Allocations" }), { key: "End" });
    await waitFor(() => expect(screen.getByRole("tab", { name: "People and Activity" }).getAttribute("aria-selected")).toBe("true"));
    fireEvent.keyDown(screen.getByRole("tab", { name: "People and Activity" }), { key: "ArrowRight" });
    await waitFor(() => expect(screen.getByRole("tab", { name: "Overview" }).getAttribute("aria-selected")).toBe("true"));
    expect(search().has("tab")).toBe(false);
  });

  it("labels the panel by the selected tab", async () => {
    mount(makeApi().api);
    await ready();
    await goto("Alphas");
    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe(screen.getByRole("tab", { name: "Alphas" }).id);
  });
});

describe("Actions rail", () => {
  it("opens on the Actions button as a dock selection and lists every action off, each with its reason", async () => {
    mount(makeApi().api);
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    await waitFor(() => expect(search().get("sel")).toBe("rail:actions"));
    const rail = screen.getByRole("complementary", { name: "Actions" });
    for (const name of ["Grant budget", "Recall budget", "Set target budget", "Return capital", "Lock allocation", "Deploy version"]) {
      const button = within(rail).getByRole("button", { name }) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
      const reason = document.getElementById(button.getAttribute("aria-describedby")!)!;
      expect(reason.textContent).toContain("Not published (FE-015)");
    }
    expect(rail.textContent).toContain("Not published (FE-020)");
    expect(within(rail).getByRole("link", { name: "See what you can access" }).getAttribute("href")).toContain("/administration/profile-access");
  });

  it("closes on Escape and on Close without submitting anything", async () => {
    const { api, calls } = makeApi();
    mount(api, "?sel=rail:actions");
    await ready();
    expect(screen.getByRole("complementary", { name: "Actions" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(search().has("sel")).toBe(false));
    expect(calls.every((c) => c.startsWith("GET "))).toBe(true);
  });

  it("is not offered before the portfolio resolves", async () => {
    mount(makeApi((_m, path) => (path.startsWith("/resources/") ? { status: 503, body: {} } : undefined)).api);
    await screen.findByText("Unavailable");
    expect((screen.getByRole("button", { name: "Actions" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("states", () => {
  it("shows loading until the resource answers", () => {
    mount({ getPortfolio360Resource: () => new Promise(() => undefined), getPortfolioCapital: () => new Promise(() => undefined) } as unknown as ExecutionApi);
    expect(screen.getAllByRole("status", { name: "Loading" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("shows a refused resource as its state and offers the way back", async () => {
    mount(makeApi().api, "", PF.error);
    expect(await screen.findByText("Unavailable")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Portfolios" })).toBeTruthy();
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("shows a missing portfolio as unavailable with the status, not as an empty one", async () => {
    mount(makeApi().api, "", PF.missing);
    expect(await screen.findByText("Unavailable")).toBeTruthy();
    expect(screen.getByText(/HTTP 404/)).toBeTruthy();
  });

  it("says a portfolio the population does not hold is not present, not that it is empty", async () => {
    mount(makeApi().api, "", "pf_somebody_else");
    expect(await screen.findByText(/is not present in the projected resource population/)).toBeTruthy();
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("shows a portfolio with no allocation and no deployments as identity with stated absences", async () => {
    mount(makeApi().api, "", PF.empty);
    await ready();
    expect(screen.getByText("Some relations may be missing").getAttribute("title")).toBe("The resource is partial");
    const strip = screen.getByRole("group", { name: "Portfolio identity" });
    expect(within(strip).getByText("Allocated (current)").closest("div")!.textContent).toContain("Not available · no allocation published");
    await goto("Alphas");
    expect(screen.getByText("The resource published no deployment for this portfolio.")).toBeTruthy();
    await goto("Accounts");
    expect(screen.getByText("The resource published no account for this portfolio.")).toBeTruthy();
  });

  it("keeps one environment's capital failure to that environment", async () => {
    const refuse: Override = (_m, path, query) => (path.endsWith("/capital") && query.get("environment") === "paper" ? { status: 503, body: {} } : undefined);
    mount(makeApi(refuse).api);
    await ready();
    await goto("Allocations");
    const paper = screen.getByRole("region", { name: "Capital in Paper" });
    await waitFor(() => expect(paper.textContent).toContain("Unavailable"));
    expect(within(screen.getByRole("region", { name: "Capital in Live" })).getByText("460,000.00")).toBeTruthy();
  });

  it("says the chart has no series when the source published none, instead of drawing a flat line", async () => {
    mount(makeApi().api, "", PF.satellite);
    await ready();
    await waitFor(() => expect(document.body.textContent).toContain("Not available"));
    expect(document.body.textContent).toContain("No equity snapshots for subject");
    expect(document.querySelectorAll(".exec-c2-svg")).toHaveLength(0);
    expect(document.querySelector(".exec-c2-na")).not.toBeNull();
  });

  it("offers a series choice for several currencies and never draws them together", async () => {
    const two: Override = (_m, path, query) => {
      if (path !== "/views/equity-chart") return undefined;
      const base = answerPortfolios("GET", path, query)!.body as { panel: { data: { series: { id: string; label: string; currency: string; points: unknown[] }[] } } };
      const second = { ...base.panel.data.series[0], id: "portfolio:x:equity:JPY", label: "Core equity JPY", currency: "JPY" };
      return { status: 200, body: { ...base, panel: { ...base.panel, data: { ...base.panel.data, series: [base.panel.data.series[0], second] } } } };
    };
    mount(makeApi(two).api);
    const select = await screen.findByRole("combobox", { name: "Equity series" });
    expect(within(select).getAllByRole("option")).toHaveLength(2);
    expect(document.body.textContent).toContain("2 series are published, in USDT, JPY. Each is drawn on its own and none is combined with another.");
    expect(document.querySelectorAll(".exec-c2-svg").length).toBe(1);
  });

  it("swapping to a shorter series while the readout is pinned deep in the long one does not crash and keeps the readout valid (RV-04)", async () => {
    const two: Override = (_m, path, query) => {
      if (path !== "/views/equity-chart") return undefined;
      const base = answerPortfolios("GET", path, query)!.body as { panel: { data: { series: { id: string; label: string; currency: string; points: unknown[] }[] } } };
      const short = { ...base.panel.data.series[0], id: "portfolio:x:equity:JPY", label: "Core equity JPY", currency: "JPY", points: base.panel.data.series[0].points.slice(0, 5) };
      return { status: 200, body: { ...base, panel: { ...base.panel, data: { ...base.panel.data, series: [base.panel.data.series[0], short] } } } };
    };
    mount(makeApi(two).api);
    const select = await screen.findByRole("combobox", { name: "Equity series" });
    const chart = select.closest(".exec-pf-chart") as HTMLElement;
    const plot = within(chart).getByRole("group", { name: /arrow keys/ });
    fireEvent.keyDown(plot, { key: "ArrowLeft", shiftKey: true });
    fireEvent.keyDown(plot, { key: "ArrowLeft", shiftKey: true });
    const deep = within(chart).getByTestId("readout-time").textContent;
    expect(within(chart).getByRole("status").textContent).toContain(deep as string);
    expect(() => fireEvent.change(select, { target: { value: "portfolio:x:equity:JPY" } })).not.toThrow();
    expect(within(chart).getByTestId("readout-value").textContent).toContain("JPY");
    expect(within(chart).getByTestId("readout-time").textContent).not.toBe(deep);
    expect(within(chart).getByRole("status").textContent).toBe("");
    expect(chart.querySelector('[data-testid="cursor"]')).toBeNull();
    fireEvent.keyDown(within(chart).getByRole("group", { name: /arrow keys/ }), { key: "ArrowLeft" });
    expect(within(chart).getByRole("status").textContent).toContain("JPY");
  });

  it("offers Table and Expand on the equity chart: the same published points as rows, newest first, Esc returns focus (RV-08)", async () => {
    mount(makeApi().api);
    await ready();
    const chart = (await screen.findByRole("group", { name: /arrow keys/ })).closest(".exec-pf-chart") as HTMLElement;
    const published = (answerPortfolios("GET", "/views/equity-chart", new URLSearchParams({ subject_kind: "portfolio", subject_id: PF.core }))!.body as { panel: { data: { series: { points: [number, string | null][] }[] } } }).panel.data.series[0].points;
    fireEvent.click(within(chart).getByRole("button", { name: /^Table, / }));
    const rows = [...chart.querySelectorAll(".exec-ct-tbl tbody tr")];
    // Every published value, newest first, as its exact string; the stated gap is a row that says so (the chart hatches it).
    const exact = rows.map((r) => r.querySelector("td")!.getAttribute("title"));
    expect(exact.filter((v) => v !== null)).toEqual(published.filter(([, v]) => v !== null).map(([, v]) => v).reverse());
    expect(rows.filter((r) => r.querySelector("td")!.textContent === "No published value").length).toBeGreaterThan(0);
    // The first row is the chart's own latest readout.
    expect(rows[0].querySelector("td")!.textContent).toBe(within(chart).getByTestId("readout-value").textContent);
    expect(within(chart).getByTestId("table-count").textContent).toBe(`Showing ${rows.length} of ${rows.length} rows`);
    const expand = within(chart).getByRole("button", { name: /^Expand / });
    expand.focus();
    fireEvent.click(expand);
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(within(chart).getByRole("button", { name: /^Expand / }));
  });

  it("is a stated state, not a guess, when no portfolio was named", () => {
    mount(makeApi().api, "", null);
    expect(screen.getByText("No portfolio was named in the address.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to Portfolios" })).toBeTruthy();
  });

  it("keeps its tables as cards at or below 660px: every cell has its label", async () => {
    mount(makeApi().api);
    await ready();
    await goto("Alphas");
    for (const row of rowsOf("Alphas and deployments")) {
      expect([...row.querySelectorAll("td")].map((td) => td.getAttribute("data-l"))).toEqual(["Alpha", "Deployment", "Stage", "Account", "Allocation", "Position PnL, now", "Share of PnL", "Health"]);
    }
  });
});

describe("capability", () => {
  it("withholds the whole page, and reads nothing, without execution.portfolios.read", async () => {
    const { api, calls } = makeApi();
    mount(api, "", PF.core, new Set([V2_CAPABILITY.accountsRead]));
    expect(screen.getByText("Withheld")).toBeTruthy();
    expect(screen.getByRole("link", { name: "See what you can access" })).toBeTruthy();
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(calls).toEqual([]);
  });

  it("drops the Accounts tab and every account link without execution.accounts.read, and says so on a direct link", async () => {
    mount(makeApi().api, "?tab=accounts", PF.core, new Set([V2_CAPABILITY.portfoliosRead]));
    await ready();
    expect(screen.queryByRole("tab", { name: "Accounts" })).toBeNull();
    expect(screen.getByText(/needs execution\.accounts\.read/)).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Overview" }).getAttribute("aria-selected")).toBe("true");
    await goto("Alphas");
    const row = rowsOf("Alphas and deployments")[0];
    expect(within(row).queryByRole("link", { name: "Binance-02" })).toBeNull();
    expect(cell(row, "Account")).toBe("Binance-02");
  });

  it("shows everything to a caller who holds both", async () => {
    mount(makeApi().api, "", PF.core, new Set([V2_CAPABILITY.portfoliosRead, V2_CAPABILITY.accountsRead]));
    await ready();
    expect(screen.getByRole("tab", { name: "Accounts" })).toBeTruthy();
  });
});
