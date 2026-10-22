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
    const pnl = row.querySelector("td[data-l='Net PnL']");
    expect(lines(pnl)).toEqual(["Paper · USDT+100.25 USDT", "Paper · EUR-12.50 EUR", "Real-funded · USDT0.00 USDT"]);
    expect(pnl?.textContent).not.toContain("Not published");
    // The question: FLEET, the URL's environment and window, grouped by portfolio.
    expect(asked[0]).toMatchObject({ surface: "FLEET", environment: "paper", window: "90D", groupBy: ["portfolio_id"] });
  });

  it("a portfolio with no group in the dataset says so, never a zero; the columns no contract carries keep Not published with their ids", async () => {
    mountList(withDataset(makeApi().api, () => datasetFor("FLEET", "someone-else")));
    const table = await screen.findByRole("table", { name: "Portfolios" }, { timeout: 5000 });
    await waitFor(() => expect(table.querySelector("td[data-l='Net PnL'] .exec-pf-na")).not.toBeNull());
    const row = [...table.querySelectorAll("tbody tr")].find((tr) => tr.textContent?.includes(PF.core)) as HTMLElement;
    expect(row.querySelector("td[data-l='Net PnL']")?.textContent).toContain("No paper figures are published for this portfolio");
    for (const [label, id] of [["NAV", "FE-013"], ["Return", "FE-006, FE-025"], ["Drawdown", "FE-013, FE-025"], ["Concentration", "FE-005"]] as const) {
      expect(row.querySelector(`td[data-l='${label}']`)?.textContent, label).toContain(`Not published (${id})`);
    }
  });

  it("keeps Not published (FE-005, FE-025) when the dataset is not served", async () => {
    mountList(withDataset(makeApi().api, null));
    const table = await screen.findByRole("table", { name: "Portfolios" }, { timeout: 5000 });
    await settle();
    const row = [...table.querySelectorAll("tbody tr")].find((tr) => tr.textContent?.includes(PF.core)) as HTMLElement;
    expect(row.querySelector("td[data-l='Net PnL']")?.textContent).toContain("Not published (FE-005, FE-025)");
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
    for (const [label, id] of [["Return", "FE-006, FE-025"], ["Drawdown", "FE-013, FE-025"]] as const) expect(tile(label).textContent, label).toContain(`Not published (${id})`);
    expect(screen.getByRole("region", { name: "Concentration" }).textContent).toContain("Not published (FE-005)");
    expect(asked[0]).toMatchObject({ surface: "PORTFOLIO", id: PF.core, environment: "live", window: "90D", groupBy: ["portfolio_id"] });
  });

  it("Capital panel: Balance total and Allocated per partition (Real-funded never merged with Paper), a true zero, a typed absence; the unpublished rows stay", async () => {
    mount360(withDataset(makeApi().api, () => datasetFor("PORTFOLIO", PF.core)));
    await screen.findByRole("tablist", { name: "Portfolio sections" }, { timeout: 5000 });
    const table = await screen.findByRole("table", { name: "Capital statements" });
    await waitFor(() => expect(table.querySelector(".exec-part")).not.toBeNull());
    const rows = [...table.querySelectorAll("tr")];
    const row = (label: string) => rows.find((tr) => tr.querySelector("th")?.textContent === label) as HTMLElement;
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
    for (const label of ["Initial funds", "Added funds", "Returned", "Net external flows", "Approved budget", "Recalling", "Headroom"]) {
      expect(row(label).textContent, label).toContain("Not published (FE-017)");
    }
  });

  it("without a served dataset every Capital row and the Net PnL tile keep Not published", async () => {
    mount360(withDataset(makeApi().api, null));
    await screen.findByRole("tablist", { name: "Portfolio sections" }, { timeout: 5000 });
    await settle();
    const table = screen.getByRole("table", { name: "Capital statements" });
    expect(table.querySelector(".exec-part")).toBeNull();
    expect([...table.querySelectorAll("tr")].every((tr) => tr.textContent?.includes("Not published (FE-017)"))).toBe(true);
    expect(screen.getByLabelText("Portfolio identity").textContent).toContain("Not published (FE-005, FE-025)");
  });
});
