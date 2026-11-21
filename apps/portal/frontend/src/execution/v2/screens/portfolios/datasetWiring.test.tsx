/**
 * Portfolios (list) and Portfolio 360 read the Manager dataset through the SAME typed port (`getManagerDataset`): Net PnL per
 * economic partition from the portfolio group, the capital statements per partition on the 360. The dataset is the published
 * canonical fixture (rows) judged by the real reader; the port double swaps only that one method (the BFF double of these screens
 * does not serve the dataset routes, so the screens' other reads stay on it).
 *
 * Asserted: exact printed strings, partitions kept apart (Real-funded vs Paper, USDT vs EUR, never a total), a true zero printed
 * as zero, a typed absence with its reason, and the screens that keep `Not published` when no surface is served or no contract
 * carries the figure.
 */
import { moneyMetric } from "../../readers/managerDataset.testbase";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { whyText } from "../../gapWhyTestUtil";
import { PF } from "../../../../../e2e/bffDoublePortfolios";
import type { ExecutionApi } from "../../../api/ports";
import { datasetFor, withDataset } from "./datasetFixtures.testbase";
import { makeApi } from "./harness.fixtures";
import PortfolioListScreen from "./index";
import PortfolioScreen from "./portfolio";

afterEach(cleanup);

const mountList = (api: ExecutionApi, entry = "/deployments/portfolios?env=paper") =>
  render(<MemoryRouter initialEntries={[entry]}><PortfolioListScreen api={api} /></MemoryRouter>);
const mount360 = (api: ExecutionApi, query = "?env=paper") =>
  render(<MemoryRouter initialEntries={[`/deployments/portfolios/${PF.core}${query}`]}><PortfolioScreen api={api} portfolioId={PF.core} /></MemoryRouter>);

const settle = async () => {
  await waitFor(() => expect(screen.queryByRole("status", { name: "Loading" })).toBeNull());
};
const lines = (el: Element | null) => [...(el?.querySelectorAll(".exec-part-line") ?? [])].map((li) => li.textContent);

describe("Portfolios list: Net PnL column from the FLEET dataset grouped by portfolio", () => {
  it("prints each partition of the portfolio's group on its own line, exact, signed, with a true zero and no total", async () => {
    const asked: unknown[] = [];
    mountList(withDataset(makeApi().api, () => datasetFor("FLEET", PF.core), asked));
    const table = await screen.findByRole("table", { name: "Portfolios" }, { timeout: 5000 });
    await waitFor(() => expect(table.querySelector(".exec-part")).not.toBeNull());
    const row = [...table.querySelectorAll("tbody tr")].find((tr) => tr.textContent?.includes(PF.core)) as HTMLElement;
    const pnl = row.querySelector("td[data-l^='Net PnL']");
    // The row's base currency (USDT) prints as the bare number, its unit on the title; another currency (EUR) keeps its unit.
    expect(lines(pnl)).toEqual(["Paper · USDT+100.25", "Paper · EUR-12.50 EUR", "Real-funded · USDT0.00"]);
    expect(pnl?.textContent).not.toContain("Not published");
    // The question: FLEET, the URL's environment and window, grouped by portfolio.
    expect(asked[0]).toMatchObject({ surface: "FLEET", environment: "paper", window: "90D", groupBy: ["portfolio_id"] });
  });

  it("a portfolio with no group in the dataset says so in every measure column, never a zero; a group that lacks a key keeps that column's Not published with its id", async () => {
    mountList(withDataset(makeApi().api, () => datasetFor("FLEET", "someone-else")), "/deployments/portfolios?env=paper&hide=none");
    const table = await screen.findByRole("table", { name: "Portfolios" }, { timeout: 5000 });
    await waitFor(() => expect(table.querySelector("td[data-l^='Net PnL'] .exec-pf-na")).not.toBeNull());
    const row = [...table.querySelectorAll("tbody tr")].find((tr) => tr.textContent?.includes(PF.core)) as HTMLElement;
    expect(row.querySelector("td[data-l^='Net PnL']")?.textContent).toContain("No paper figures are published for this portfolio");
    for (const label of ["NAV", "Return", "Drawdown", "Concentration"]) {
      expect(row.querySelector(`td[data-l^='${label}']`)?.textContent, label).toContain("No paper figures are published for this portfolio");
    }
  });

  it("a group that publishes only net_pnl keeps NAV, Return, Drawdown and Concentration on their own Not published ids", async () => {
    mountList(withDataset(makeApi().api, () => datasetFor("FLEET", PF.core)), "/deployments/portfolios?env=paper&hide=none");
    const table = await screen.findByRole("table", { name: "Portfolios" }, { timeout: 5000 });
    await waitFor(() => expect(table.querySelector("td[data-l^='Net PnL'] .exec-part")).not.toBeNull());
    const row = [...table.querySelectorAll("tbody tr")].find((tr) => tr.textContent?.includes(PF.core)) as HTMLElement;
    for (const [label, _id] of [["NAV", "FE-013"], ["Return", "FE-006, FE-025"], ["Drawdown", "FE-013, FE-025"], ["Concentration", "FE-005"]] as const) {
      expect(row.querySelector(`td[data-l^='${label}']`)?.textContent, label).toContain("Not published");
    }
  });

  it("a group that publishes the simulated keys prints each, one line per partition", async () => {
    const withKeys = (body: any) => {
      for (const entry of body.groups[0].economic_partitions) {
        entry.metrics.current_nav = moneyMetric({ currency: entry.partition.currency, value: "10250.75" });
        entry.metrics.return_30d_pct = { ...moneyMetric({ value: "3.42" }), unit: "PERCENT", currency: null };
        entry.metrics.max_drawdown_pct = { ...moneyMetric({ value: "-4.80" }), unit: "PERCENT", currency: null };
        entry.metrics.concentration_hhi = { ...moneyMetric({ value: "0.2850" }), unit: "RATIO", currency: null };
      }
    };
    mountList(withDataset(makeApi().api, () => datasetFor("FLEET", PF.core, withKeys)), "/deployments/portfolios?env=paper&hide=none");
    const table = await screen.findByRole("table", { name: "Portfolios" }, { timeout: 5000 });
    await waitFor(() => expect(table.querySelector("td[data-l='NAV'] .exec-part")).not.toBeNull());
    const row = [...table.querySelectorAll("tbody tr")].find((tr) => tr.textContent?.includes(PF.core)) as HTMLElement;
    expect(row.querySelector("td[data-l='NAV']")?.textContent).toContain("10,250.75");
    expect(row.querySelector("td[data-l^='Return']")?.textContent).toContain("+3.42%");
    expect(row.querySelector("td[data-l^='Drawdown']")?.textContent).toContain("-4.80%");
    expect(row.querySelector("td[data-l='Concentration']")?.textContent).toContain("0.2850");
  });

  it("keeps Not published when the dataset is not served", async () => {
    mountList(withDataset(makeApi().api, null));
    const table = await screen.findByRole("table", { name: "Portfolios" }, { timeout: 5000 });
    await settle();
    const row = [...table.querySelectorAll("tbody tr")].find((tr) => tr.textContent?.includes(PF.core)) as HTMLElement;
    expect(row.querySelector("td[data-l^='Net PnL']")?.textContent).toContain("Not published");
  });
});

describe("Portfolio 360: KPI and Capital panel from the PORTFOLIO dataset", () => {
  it("Net PnL tile: one line per partition from the portfolio's group; Return, Drawdown and Concentration stay Not published", async () => {
    const asked: unknown[] = [];
    mount360(withDataset(makeApi().api, () => datasetFor("PORTFOLIO", PF.core), asked));
    await screen.findByRole("tablist", { name: "Portfolio sections" }, { timeout: 5000 });
    const strip = screen.getByLabelText("Portfolio identity");
    const tile = (label: string) => [...strip.querySelectorAll("*")].find((n) => n.children.length === 0 && n.textContent === label)?.closest("div, li, dl > *") as HTMLElement;
    await waitFor(() => expect(strip.querySelector(".exec-part")).not.toBeNull());
    expect(lines(tile("Net PnL"))).toEqual(["Paper · USDT+100.25 USDT", "Paper · EUR-12.50 EUR", "Real-funded · USDT0.00 USDT"]);
    expect(tile("Net PnL").textContent).toContain("Window 90D");
    for (const [label, _id] of [["Return", "FE-006, FE-025"], ["Drawdown", "FE-013, FE-025"]] as const) expect(tile(label).textContent, label).toContain("Not published");
    expect(screen.getByRole("region", { name: "Concentration" }).textContent).toContain("Not published");
    expect(asked[0]).toMatchObject({ surface: "PORTFOLIO", id: PF.core, environment: "live", window: "90D", groupBy: ["portfolio_id"] });
  });

  it("Capital panel: Balance total and Allocated per partition (Real-funded never merged with Paper), a true zero, a typed absence; the unpublished rows stay", async () => {
    mount360(withDataset(makeApi().api, () => datasetFor("PORTFOLIO", PF.core)));
    await screen.findByRole("tablist", { name: "Portfolio sections" }, { timeout: 5000 });
    const table = await screen.findByRole("table", { name: "Capital statements" });
    await waitFor(() => expect(table.querySelector(".exec-part")).not.toBeNull());
    const rows = [...table.querySelectorAll("tr")];
    const row = (label: string) => rows.find((tr) => tr.querySelector("th")?.textContent === label) as HTMLElement;
    // One partition prints without its caption (`labels="several"`); several keep theirs, one line each, never a total.
    expect(lines(row("Balance total"))).toEqual(["Real-funded · USDT2,500.00 USDT", "Paper · USDT1,000.50 USDT", "Paper · EUR900.00 EUR"]);
    const allocated = lines(row("Allocated"));
    expect(allocated[0]).toBe("Real-funded · USDT1,500.50 USDT");
    expect(allocated[1]).toBe("Paper · USDT0.00 USDT");
    expect(row("Allocated").querySelector("[data-zero='true']")?.textContent).toBe("0.00 USDT");
    expect(row("Allocated").querySelector("[data-zero='true']")?.getAttribute("title")).toMatch(/^0 · /);
    // Typed absence: the state word and the published reason code, no figure.
    expect(allocated[2]).toContain("Paper · EUR");
    expect(allocated[2]).toContain("Not available");
    expect(whyText(row("Allocated").querySelectorAll(".exec-part-line")[2]!)).toContain("SOURCE_FACTS_NOT_PUBLISHED");
    for (const label of ["Initial funds", "Added funds", "Returned", "Net external flows", "Approved", "Recalling", "Headroom"]) {
      expect(row(label).textContent, label).toContain("Not published");
    }
  });

  it("without a served dataset every Capital row and the Net PnL tile keep Not published", async () => {
    mount360(withDataset(makeApi().api, null));
    await screen.findByRole("tablist", { name: "Portfolio sections" }, { timeout: 5000 });
    await settle();
    const table = screen.getByRole("table", { name: "Capital statements" });
    expect(table.querySelector(".exec-part")).toBeNull();
    // Every statement row keeps its own id (FE-017); the NAV row is the NAV series' own gap (FE-013); the two group heads are not rows of facts.
    const factRows = [...table.querySelectorAll("tr")].filter((tr) => !tr.classList.contains("exec-pf-grp"));
    expect(factRows.length).toBeGreaterThan(8);
    expect(factRows.every((tr) => /Not published/.test(tr.textContent ?? ""))).toBe(true);
    expect(screen.getByLabelText("Portfolio identity").textContent).toContain("Not published");
  });
});
