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
import PortfolioScreen, { PORTFOLIO_SCREEN_KEY } from "./index";
import { incidentRoute } from "./People";
import { COMPARE_OFF_REASON, DEFAULT_ROUTES } from "../routes";

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
    expect(screen.getByText("Fresh")).toBeTruthy();
    expect(screen.getByText(/As of 2026-10-17/)).toBeTruthy();
    expect(screen.getByText(/Score: Not published \(FE-011\)/)).toBeTruthy();
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
    const pack = screen.getByRole("button", { name: "Report pack" }) as HTMLButtonElement;
    expect(pack.disabled).toBe(true);
    expect(pack.title).toBe("Export is not available yet.");
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
    expect(tile("Deployments")).toContain("5 holdings counted by the server");
    expect(tile("Accounts")).toContain("4");
    expect(tile("Allocated (current)")).toContain("540,000.00");
    expect(tile("Allocated (current)")).toContain("USDT");
    expect(tile("Allocated (current)")).toContain("not a window");
  });

  it("names the request behind NAV, Net PnL, Return and Drawdown", async () => {
    mount(makeApi().api);
    await ready();
    const strip = screen.getByRole("group", { name: "Performance, not yet published" });
    const tile = (label: string) => within(strip).getByText(label).closest("div")!.textContent ?? "";
    expect(tile("NAV")).toContain("Not published (FE-013)");
    expect(tile("Net PnL · 90D")).toContain("Not published (FE-005, FE-025)");
    expect(tile("Return · 90D")).toContain("Not published (FE-006, FE-025)");
    expect(tile("Drawdown")).toContain("Not published (FE-013, FE-025)");
  });

  it("draws the retained equity series with its gap, its envelope, a retained-snapshot pill and no drawdown", async () => {
    mount(makeApi().api);
    const figure = await screen.findByRole("img", { name: /Core equity/ });
    expect(figure).toBeTruthy();
    expect(screen.getByText("Retained snapshots")).toBeTruthy();
    expect(screen.getByText("Account equity, not NAV")).toBeTruthy();
    expect(screen.getByText("Benchmark: Not available")).toBeTruthy();
    expect(document.body.textContent).toContain("Retained snapshot gap");
    expect(document.body.textContent).toContain("Server: 40 of 4,592 points, MIN_MAX_LAST_BUCKET_V1");
    expect(document.body.textContent).toContain("1 gap drawn as a gap, not joined");
    expect(document.body.textContent).toContain("Not published (FE-013, FE-025)");
    expect(document.querySelectorAll(".exec-c2-svg").length).toBeGreaterThan(0);
  });

  it("turns Net PnL and Return off with their request ids; only the retained equity is published", async () => {
    mount(makeApi().api);
    await ready();
    const seg = screen.getByRole("group", { name: "Series" });
    expect((within(seg).getByRole("button", { name: "Equity" }) as HTMLButtonElement).getAttribute("aria-pressed")).toBe("true");
    const pnl = within(seg).getByRole("button", { name: "Net PnL" }) as HTMLButtonElement;
    expect(pnl.disabled).toBe(true);
    expect(pnl.title).toContain("Not published (FE-005, FE-025)");
    expect((within(seg).getByRole("button", { name: "Return" }) as HTMLButtonElement).disabled).toBe(true);
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

  it("shows capital statements in two groups on the Overview, and the per-currency capital only on Allocations, never twice", async () => {
    mount(makeApi().api);
    await ready();
    expect(screen.queryByRole("region", { name: "Capital in Live" })).toBeNull();
    const statements = screen.getByRole("table", { name: "Capital statements" });
    expect(within(statements).getByText("Cash flows")).toBeTruthy();
    expect(within(statements).getByText("Budget · not cash")).toBeTruthy();
    const order = [...statements.querySelectorAll("tbody tr")].map((tr) => tr.querySelector("th")?.textContent);
    expect(order).toEqual(["Cash flows", "Initial funds", "Added funds", "Returned", "Net external flows", "Net PnL, since start", "NAV", "Budget · not cash", "Approved budget", "Recalling", "Headroom"]);
    for (const row of ["Initial funds", "Added funds", "Returned", "Net external flows", "Approved budget", "Recalling", "Headroom"]) {
      expect(within(statements).getByText(row).closest("tr")!.textContent).toContain("Not published (FE-017)");
    }
    expect(within(statements).getByText("NAV").closest("tr")!.textContent).toContain("Not published (FE-013)");
    expect(within(statements).getByText("Net PnL, since start").closest("tr")!.textContent).toContain("Not published (FE-005, FE-025)");
    expect(within(statements).getByText("Net external flows").closest("tr")!.getAttribute("data-total")).toBe("true");
    await goto("Allocations");
    const live = screen.getByRole("region", { name: "Capital in Live" });
    expect(within(live).getByText("460,000.00")).toBeTruthy();
    expect(within(live).getByText("700,000.00")).toBeTruthy();
    expect(within(live).getByText("697,700.00")).toBeTruthy();
    const paper = screen.getByRole("region", { name: "Capital in Paper" });
    expect(within(paper).getByText("80,000.00")).toBeTruthy();
    expect(within(paper).getByText("Partial")).toBeTruthy();
    expect(within(paper).getByText(/MARGIN_BALANCES_NOT_PUBLISHED/)).toBeTruthy();
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

  it("draws the capital flow as structure only: hatched boxes, no band, no amount, and the request id", async () => {
    mount(makeApi().api);
    await ready();
    await goto("Allocations");
    const real = screen.getByRole("region", { name: "Real-funded" });
    const flow = real.querySelector("figure.exec-flow")!;
    expect(flow.querySelectorAll('[data-testid="flow-band"]')).toHaveLength(0);
    expect(flow.querySelectorAll(".exec-flow-rect").length).toBeGreaterThanOrEqual(10);
    expect(flow.querySelectorAll('.exec-flow-rect[data-hatch="true"]')).toHaveLength(flow.querySelectorAll(".exec-flow-rect").length);
    expect(flow.textContent).toContain("Not published (FE-032) · Amounts and links are not published");
    expect(flow.textContent).toContain("Structure only, no amounts");
    expect(flow.textContent).not.toMatch(/\d{1,3},\d{3}/);
    for (const name of ["Initial funds", "Added funds", "NAV", "Approved budget", "live-0192 · Binance-02"]) expect(flow.textContent).toContain(name);
    const sim = screen.getByRole("region", { name: "Simulated" }).querySelector("figure.exec-flow")!;
    expect(sim.textContent).toContain("Virtual funds");
    expect(sim.textContent).toContain("pap-0301");
    expect(sim.textContent).not.toContain("live-0192");
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
    for (const row of rows) expect(cell(row, "Receipt")).toBe("Not published (FE-032)");
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
    expect(await screen.findByText("Not available · No correlation data source")).toBeTruthy();
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
    expect(screen.getByText(/The resource is partial/)).toBeTruthy();
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
