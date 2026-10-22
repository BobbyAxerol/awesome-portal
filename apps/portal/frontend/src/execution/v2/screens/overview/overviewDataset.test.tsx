/**
 * Overview reads the fund's Manager dataset (`getManagerDataset({surface: "FUND", environment, window})`) through the same typed
 * port as everything else: the Capital panel prints the capital statements one line per economic partition (Real-funded never
 * merged with Paper, USDT never added to EUR), the Net PnL tile prints a partition's `net_pnl` when the contract carries it.
 * The dataset is the published canonical fixture (rows) judged by the real reader, served through the port double
 * (`withDataset`): the Overview BFF double does not serve the dataset routes, so only that one method is swapped.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetOverviewDouble, setOverviewDoubleVariants } from "../../../../../e2e/bffDoubleOverview";
import { httpApi, serveDoubles } from "../../../../../e2e/screensV2Harness";
import { moneyMetric, partition } from "../../readers/managerDataset.testbase";
import { newSeriesDouble, wrapFetch } from "../series/seriesDouble.testbase";
import { sessionOf } from "../alpha/testApi";
import { whyText } from "../../gapWhyTestUtil";
import { datasetFor, withDataset } from "../portfolios/datasetFixtures.testbase";
import OverviewScreen from "./index";

const session = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("../../../../auth/session", () => ({ useSession: () => session.current }));

beforeEach(() => {
  session.current = { ...sessionOf(["governance.r1.read"]), principal: null };
  resetOverviewDouble();
  setOverviewDoubleVariants({ fleet: "multi-currency" });
  serveDoubles();
  vi.stubGlobal("fetch", wrapFetch(globalThis.fetch, newSeriesDouble("unavailable")));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const mount = (api: ReturnType<typeof withDataset>, entry = "/execution?env=paper&window=30D") =>
  render(<MemoryRouter initialEntries={[entry]}><OverviewScreen api={api} sseFactory={null} /></MemoryRouter>);

const loaded = async () => {
  await screen.findByRole("heading", { name: /^Overview/ });
  await waitFor(() => {
    expect(screen.queryByRole("status", { name: /^Loading/ })).toBeNull();
    expect(document.body.textContent).not.toContain("acknowledgement: reading");
  });
};
const kpi = (label: string) => [...screen.getByLabelText("Fund figures").querySelectorAll(".exec-blk-kpi")].find((n) => n.querySelector("dt")?.textContent === label) as HTMLElement;
const lines = (el: Element | null) => [...(el?.querySelectorAll(".exec-part-line") ?? [])].map((li) => li.textContent);
const withNetPnl = (body: any) => {
  for (const entry of body.capital_statements) {
    const p = entry.partition;
    entry.metrics.net_pnl = moneyMetric({ currency: p.currency, value: p.economic_domain === "ACTUAL" ? "0" : p.currency === "EUR" ? "-12.5" : "100.25" });
  }
};

describe("Overview from the FUND dataset", () => {
  it("Capital panel: Balance total and Allocated per partition, a true zero and a typed absence; the unpublished rows keep their ids", async () => {
    const asked: unknown[] = [];
    mount(withDataset(httpApi(), () => datasetFor("FUND", "unused"), asked));
    await loaded();
    const table = await screen.findByRole("table", { name: "Capital" });
    await waitFor(() => expect(table.querySelector(".exec-part")).not.toBeNull());
    const row = (label: string) => [...table.querySelectorAll("tr")].find((tr) => tr.querySelector("th")?.textContent === label) as HTMLElement;
    expect(lines(row("Balance total"))).toEqual(["Real-funded · USDT2,500.00 USDT", "Paper · USDT1,000.50 USDT", "Paper · EUR900.00 EUR"]);
    const allocated = lines(row("Allocated"));
    expect(allocated.slice(0, 2)).toEqual(["Real-funded · USDT1,500.50 USDT", "Paper · USDT0.00 USDT"]);
    expect(row("Allocated").querySelector("[data-zero='true']")?.getAttribute("title")).toMatch(/^0 · /);
    expect(allocated[2]).toContain("Not available");
    expect(whyText(row("Allocated").querySelectorAll(".exec-part-line")[2]!)).toContain("SOURCE_FACTS_NOT_PUBLISHED");
    for (const label of ["Initial funds", "Added funds", "Returned", "Budget used"]) expect(row(label).textContent, label).toBe(`${label}Not published (FE-017)`);
    expect(row("NAV").textContent).toBe("NAVNot published (FE-013)");
    expect(asked[0]).toMatchObject({ surface: "FUND", environment: "paper", window: "30D" });
  });

  it("Net PnL tile prints each partition's published net_pnl on its own line (signed, true zero, no total); Return and Drawdown stay Not published", async () => {
    mount(withDataset(httpApi(), () => datasetFor("FUND", "unused", withNetPnl)));
    await loaded();
    await waitFor(() => expect(kpi("Net PnL").querySelector(".exec-part")).not.toBeNull());
    expect(lines(kpi("Net PnL"))).toEqual(["Real-funded · USDT0.00 USDT", "Paper · USDT+100.25 USDT", "Paper · EUR-12.50 EUR"]);
    expect(kpi("Net PnL").textContent).toContain("Window 30D");
    expect(kpi("Return").querySelector(".exec-blk-kpi-value")?.textContent).toBe("Not published (FE-006, FE-025)");
    expect(kpi("Drawdown").querySelector(".exec-blk-kpi-value")?.textContent).toBe("Not published (FE-013, FE-025)");
  });

  it("a partition added by the contract is its own line, never folded into another (same currency, other domain)", async () => {
    mount(withDataset(httpApi(), () => datasetFor("FUND", "unused", (body: any) => {
      withNetPnl(body);
      body.capital_statements.push({ partition: partition("SANDBOX", "USDT", "sbx"), metrics: { net_pnl: moneyMetric({ value: "7.5" }) } });
    })));
    await loaded();
    await waitFor(() => expect(kpi("Net PnL").querySelector(".exec-part")).not.toBeNull());
    expect(lines(kpi("Net PnL"))).toHaveLength(4);
    expect(lines(kpi("Net PnL")).filter((l) => l?.includes("USDT"))).toEqual([
      "Real-funded · USDT0.00 USDT", "Paper · USDT+100.25 USDT", "Sandbox · USDT+7.50 USDT",
    ]);
  });

  it("a dataset that carries no net_pnl (capital only) keeps Net PnL on Not published with its ids", async () => {
    mount(withDataset(httpApi(), () => datasetFor("FUND", "unused")));
    await loaded();
    await waitFor(() => expect(document.querySelector(".exec-part")).not.toBeNull());
    expect(kpi("Net PnL").querySelector(".exec-blk-kpi-value")?.textContent).toBe("Not published (FE-005, FE-025)");
  });

  it("a dataset that is not served leaves the Capital panel exactly as before", async () => {
    mount(withDataset(httpApi(), null));
    await loaded();
    const table = screen.getByRole("table", { name: "Capital" });
    expect([...table.querySelectorAll("tr")].map((tr) => tr.textContent)).toEqual([
      "Initial fundsNot published (FE-017)", "Added fundsNot published (FE-017)", "ReturnedNot published (FE-017)", "NAVNot published (FE-013)", "Budget usedNot published (FE-017)",
    ]);
    expect(document.querySelector(".exec-part")).toBeNull();
  });
});
