/**
 * WP-3 (UI adjustment plan 10 Nov 2026): the Portfolio 360 Alphas tab is the Alpha Fleet table filtered to the portfolio.
 * The port is the REAL HTTP client over the dataset double (the one the Fleet's own suite uses), beside the Portfolio double's reads, so the
 * real reader and the real answers-this-question guard judge every body. A fixture is never a source acceptance.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PF } from "../../../../../../e2e/bffDoublePortfolios";
import { createHttpApi } from "../../../../api/httpApi";
import type { ExecutionApi } from "../../../../api/ports";
import type { DeliveryPolicy } from "../../../../profile";
import { DATASET_COLUMNS } from "../../fleet/fleetMetricsModel";
import { newDatasetDouble, wrapDatasetFetch, type DatasetDoubleState, type DoubleAlpha } from "../../fleet/datasetDouble.testbase";
import { SLOW, SLOW_TEST } from "../../../waitsTestUtil";
import { makeApi } from "../harness.fixtures";
import PortfolioScreen from "./index";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const OPEN: DeliveryPolicy = {
  policyRevision: 4, queryEnabled: true, projectionIngestionEnabled: true, sseEnabled: false, governanceWriteEnabled: true, paperCommandsEnabled: true,
  sandboxCommandsEnabled: true, liveProtectiveCommandsEnabled: true, liveRiskIncreasingCommandsEnabled: true,
};

const alpha = (id: string, name: string, stages: readonly string[], extra: Partial<DoubleAlpha> = {}): DoubleAlpha =>
  ({ id, name, owner: "asmith", health: "READY", stages, portfolio: PF.core, version: "v3", ...extra });

const LIVE = [alpha("strat_btc", "BTC-Trend", ["LIVE"]), alpha("strat_eth", "ETH-Mean", ["CANARY"]), alpha("strat_two", "Two-Stage", ["CANARY", "LIVE"])];
const PAPER = [alpha("strat_car", "Carry-Paper", ["PAPER"])];

function harness(population: Partial<DatasetDoubleState["population"]> = { live: LIVE, paper: PAPER }) {
  const state = newDatasetDouble(population);
  vi.stubGlobal("fetch", wrapDatasetFetch(null, state));
  const http = createHttpApi({ policy: OPEN, readScope: {} });
  return { api: { ...makeApi().api, getManagerDataset: http.getManagerDataset } as ExecutionApi, state };
}

function Where() {
  const { pathname, search } = useLocation();
  return <output data-testid="where">{pathname + search}</output>;
}
const mount = (api: ExecutionApi, query = "?tab=alphas") =>
  render(
    <MemoryRouter initialEntries={[`/deployments/portfolios/${PF.core}${query}`]}>
      <PortfolioScreen api={api} portfolioId={PF.core} />
      <Where />
    </MemoryRouter>,
  );
const search = () => new URLSearchParams((screen.getByTestId("where").textContent ?? "").split("?")[1] ?? "");
const fleetTable = () => screen.findByRole("table", { name: /^Alphas in portfolio / }, SLOW);
const rows = (table: HTMLElement) => within(table).getAllByRole("row").slice(1);
const cell = (row: HTMLElement, label: string) => row.querySelector(`td[data-l='${label}']`)?.textContent ?? "";
const datasetCalls = (state: DatasetDoubleState) => state.calls.filter((call) => call.query.get("limit") !== "1");

describe("Portfolio 360 Alphas tab is the Alpha Fleet table", () => {
  it("asks the PORTFOLIO surface of this portfolio in the selected environment, one page of the Fleet's size, with no window and no client filter", async () => {
    const { api, state } = harness();
    mount(api);
    await fleetTable();
    const asks = datasetCalls(state).filter((call) => call.path.endsWith(`/manager/portfolios/${PF.core}/overview`));
    expect(asks.length).toBeGreaterThan(0);
    const ask = asks[asks.length - 1]!;
    expect(ask.query.get("environment")).toBe("live");
    expect(ask.query.get("limit")).toBe("50");
    expect(ask.query.has("window")).toBe(false);
    expect(ask.query.has("filters")).toBe(false);
    expect(ask.query.has("group_by")).toBe(false);
    expect(ask.query.has("workspace_id")).toBe(true);
  });

  it("renders every default column the Fleet renders, with the Fleet's cells (no column list of its own)", async () => {
    const { api } = harness();
    mount(api);
    const table = await fleetTable();
    const heads = [...table.querySelectorAll("th")].map((th) => th.textContent?.replace(/[↑↓\d]+$/, "").trim());
    const expected = DATASET_COLUMNS.filter((column) => !column.optional).map((column) => (column.key === "equity" ? "Equity 30D" : column.label));
    expect(heads).toEqual(expected);
    // Cards at or below 660px print `data-l` before the value: every cell of every row carries its column's label.
    for (const row of rows(table)) expect([...row.querySelectorAll("td")].map((td) => td.getAttribute("data-l"))).toEqual(expected);
    const body = rows(table);
    expect(body).toHaveLength(3);
    const btc = body.find((row) => cell(row, "Alpha").startsWith("BTC-Trend"))!;
    expect(cell(btc, "Alpha")).toContain("v3");
    expect(cell(btc, "Portfolio")).toContain(PF.core);
    expect(btc.querySelector(".exec-fleet-stage")?.textContent).toBe("Live");
    expect(btc.querySelector(".exec-blk-spine, [class*='spine']")).not.toBeNull();
    // An alpha in two stages has no single stage and says so, like the Fleet.
    const two = body.find((row) => cell(row, "Alpha").startsWith("Two-Stage"))!;
    expect(cell(two, "Current stage")).toContain("No single stage");
  });

  it("links the alpha name to Alpha 360 with this portfolio as Back source and the page's context", async () => {
    const { api } = harness();
    mount(api, "?tab=alphas&window=7d");
    const table = await fleetTable();
    const link = within(rows(table)[0]!).getByRole("link", { name: /BTC-Trend|ETH-Mean|Two-Stage/ });
    const href = new URL(link.getAttribute("href")!, "http://x");
    expect(href.pathname).toMatch(/^\/deployments\/alphas\/strat_/);
    expect(href.searchParams.get("from")).toBe(`portfolio:${PF.core}`);
    expect(href.searchParams.get("window")).toBe("7d");
  });

  it("keeps the tab in the address and offers the portfolio's own environments; choosing one re-reads that environment and the address remembers it", async () => {
    const { api, state } = harness();
    mount(api);
    const table = await fleetTable();
    expect(rows(table)).toHaveLength(3);
    expect(search().get("tab")).toBe("alphas");
    const group = screen.getByRole("group", { name: "Environment of the alpha list" });
    expect(within(group).getByRole("button", { name: "Real-funded" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(within(group).getByRole("button", { name: "Paper" }));
    await waitFor(() => expect(search().get("aenv")).toBe("paper"));
    expect(search().get("tab")).toBe("alphas");
    await waitFor(() => expect(cell(rows(screen.getByRole("table", { name: /^Alphas in portfolio / }))[0]!, "Alpha")).toContain("Carry-Paper"), SLOW);
    expect(datasetCalls(state).some((call) => call.path.includes(`/manager/portfolios/${PF.core}/`) && call.query.get("environment") === "paper")).toBe(true);
  });

  it("keeps the Contribution chart below the list and the link to the Fleet filtered to this portfolio", async () => {
    const { api } = harness();
    mount(api);
    await fleetTable();
    const panel = screen.getByRole("tabpanel");
    expect(panel.querySelectorAll("figure.exec-divbars")).toHaveLength(1);
    expect(panel.textContent).toContain("Position PnL by deployment · USDT");
    expect(panel.textContent).toContain("Share of PnL over a window is Not published");
    const open = within(panel).getByRole("link", { name: "Open in Alpha Fleet" }).getAttribute("href")!;
    expect(new URL(open, "http://x").searchParams.get("portfolio")).toBe(PF.core);
  });

  it("pages by the server's cursor (50 a page), stops at the Fleet's 200-row cap and says so, never filtering a truncated page by hand", { timeout: SLOW_TEST }, async () => {
    const many = Array.from({ length: 260 }, (_, index) => alpha(`strat_${String(index).padStart(3, "0")}`, `Alpha ${String(index).padStart(3, "0")}`, ["LIVE"]));
    const { api, state } = harness({ live: many });
    mount(api);
    const table = await fleetTable();
    expect(rows(table)).toHaveLength(50);
    expect(screen.getByRole("tabpanel").textContent).toContain("Showing 50 of 260 rows. Load more for the rest.");
    for (let page = 2; page <= 4; page += 1) {
      fireEvent.click(screen.getByRole("button", { name: "Load more" }));
      await waitFor(() => expect(rows(screen.getByRole("table", { name: /^Alphas in portfolio / }))).toHaveLength(page * 50), SLOW);
    }
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
    expect(screen.getByRole("tabpanel").textContent).toContain("Showing the first 200 rows.");
    expect(datasetCalls(state).every((call) => !call.query.has("filters"))).toBe(true);
  });

  it("says plainly when the port serves no Manager dataset, instead of drawing an old table", async () => {
    mount(makeApi().api);
    await screen.findByRole("tablist", { name: "Portfolio sections" }, SLOW);
    await waitFor(() => expect(screen.getByRole("tabpanel").textContent).toContain("The Manager dataset is not part of this port"));
    expect(screen.queryByRole("table", { name: "Alphas and deployments" })).toBeNull();
  });

  it("states an empty scope as a fact, and a refused read as its own state", async () => {
    const empty = harness({ live: [], paper: [] });
    mount(empty.api);
    await waitFor(() => expect(screen.getByRole("tabpanel").textContent).toContain("The Manager dataset holds no alpha for this portfolio in Real-funded"), SLOW);
    cleanup();
    const refused = harness();
    refused.state.variant = "status:503";
    mount(refused.api);
    await waitFor(() => expect(screen.getByRole("tabpanel").textContent).toMatch(/unavailable|503|could not/i), SLOW);
    expect(screen.queryByRole("table", { name: /^Alphas in portfolio / })).toBeNull();
  });
});
