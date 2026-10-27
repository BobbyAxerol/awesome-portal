/**
 * Compare metric rows from the Manager dataset (`getManagerDataset({surface: "PORTFOLIO", id})`), one read per compared portfolio, through
 * the port double. The bodies are the canonical `lifecycle.live` fixture re-scoped to a portfolio, with the capital statement
 * (`current_nav`) and the portfolio group total (`net_pnl`) set per partition. Exact strings, a true zero, partitions kept apart, a
 * currency off the basis not drawn, the Score as policy words only, and every other cell a typed absence.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { PF, answerPortfolios } from "../../../../../e2e/bffDoublePortfolios";
import type { ManagerDatasetQuery } from "../../../api/managerDatasetQuery";
import type { ExecutionApi } from "../../../api/ports";
import { readManagerDataset } from "../../readers/managerDataset";
import { fixtureValue, FIXTURE_LIFECYCLE_LIVE, type Draft } from "../../readers/managerDataset.testbase";
import { whyText } from "../../gapWhyTestUtil";
import { makeApi, type Override } from "../portfolios/harness.fixtures";
import CompareScreen from "./index";

afterEach(cleanup);

/** A second Real-funded USDT portfolio (the double has only one): the list read plus a clone of Satellite. */
const ORBIT = "pf_TEST_ONLY_orbit";
const withOrbit = (method: string, path: string): ReturnType<Override> => {
  if (method !== "GET" || path !== "/portfolios") return undefined;
  const answer = structuredClone(answerPortfolios("GET", "/portfolios")!) as { status: number; body: { items: Record<string, unknown>[] } };
  const satellite = answer.body.items.find((item) => item.portfolio_id === PF.satellite)!;
  answer.body.items.push({ ...satellite, portfolio_id: ORBIT, name: "Orbit" });
  return answer;
};

interface Plan {
  /** NAV per partition: [currency, exact]. */
  nav: readonly (readonly [string, string])[];
  /** Net PnL group total per partition. `null` means the dataset publishes no group. */
  pnl: readonly (readonly [string, string])[] | null;
}

function bodyFor(id: string, plan: Plan): Draft {
  const body = fixtureValue(FIXTURE_LIFECYCLE_LIVE);
  body.surface = "PORTFOLIO";
  body.items = body.items.slice(0, 1);
  body.items[0].portfolio_id = id;
  body.page = { limit: 1, returned_count: 1, authorized_filtered_count: 1, next_cursor: null, previous_cursor: null };
  const row = body.items[0];
  const template = row.metrics.net_pnl;
  const metric = (currency: string, value: string): Draft => ({ ...template, value, currency, unit: "MONEY", availability: "AVAILABLE", reason_code: null });
  const partitionOf = (currency: string, metrics: Draft): Draft => ({ partition: { ...row.economic_partitions[0].partition, currency, native_profile_ref: `TEST_ONLY:book-${currency}` }, metrics });
  body.capital_statements = plan.nav.map(([currency, value]) => partitionOf(currency, { current_nav: metric(currency, value) }));
  body.groups = plan.pnl === null ? [] : [{
    key: [{ field: "portfolio_id", value: id }],
    unique_row_count: 1,
    totals_scope: "FULL_AUTHORIZED_FILTERED_QUERY",
    economic_partitions: plan.pnl.map(([currency, value]) => partitionOf(currency, { net_pnl: metric(currency, value) })),
  }];
  return body;
}

const PLANS: Readonly<Record<string, Plan>> = {
  [PF.satellite]: { nav: [["USDT", "11500.000000000000000007"], ["EUR", "50"]], pnl: [["USDT", "-125.5"]] },
  [ORBIT]: { nav: [["USDT", "0"]], pnl: null },
};

function datasetApi(options: { fail?: boolean } = {}): { api: ExecutionApi; asked: ManagerDatasetQuery[] } {
  const asked: ManagerDatasetQuery[] = [];
  const base = makeApi(withOrbit).api as unknown as Record<string, unknown>;
  const getManagerDataset = async (query: ManagerDatasetQuery) => {
    asked.push(query);
    if (options.fail) return { ok: false as const, status: "unavailable" as const, reason: "PORTAL_READ_FAILED" };
    if (query.surface !== "PORTFOLIO") return { ok: false as const, status: "unavailable" as const, reason: "UNEXPECTED_SURFACE" };
    const plan = PLANS[query.id];
    if (plan === undefined) return { ok: false as const, status: "not_found" as const, reason: "NOT_IN_DOUBLE" };
    const read = readManagerDataset(bodyFor(query.id, plan));
    return read !== null && read.kind === "dataset" ? { ok: true as const, value: read.dataset } : { ok: false as const, status: "unavailable" as const, reason: "UNREADABLE" };
  };
  return { api: { ...base, getManagerDataset } as unknown as ExecutionApi, asked };
}

const mount = (api: ExecutionApi, query: string) =>
  render(
    <MemoryRouter initialEntries={[`/deployments/compare${query}`]}>
      <CompareScreen api={api} />
    </MemoryRouter>,
  );
const metricRow = (label: string): HTMLElement => {
  const table = screen.getByRole("table", { name: "Metrics" });
  return [...table.querySelectorAll("tr")].find((tr) => tr.querySelector("td[data-l='Metric']")?.textContent === label) as HTMLElement;
};
const cell = (label: string, column: string): HTMLElement => metricRow(label).querySelector(`td[data-l='${column}']`) as HTMLElement;
const settled = () => waitFor(() => expect(screen.queryByText("Loading")).toBeNull());
const exact = (td: Element): string[] => [...td.querySelectorAll(".exec-mgr-num")].map((node) => (node.getAttribute("title") ?? "").split(" · ")[0]!);

describe("metric rows from the Manager dataset", () => {
  it("asks one PORTFOLIO dataset per comparable pick, grouped by portfolio, in the screen's environment", async () => {
    const { api, asked } = datasetApi();
    mount(api, `?in=${PF.satellite},${ORBIT}`);
    await settled();
    expect(asked.map((query) => (query.surface === "PORTFOLIO" ? query.id : null)).sort()).toEqual([ORBIT, PF.satellite].sort());
    for (const query of asked) {
      expect(query.environment).toBe("live");
      expect(query.groupBy).toEqual(["portfolio_id"]);
    }
  });

  it("prints NAV and Net PnL exactly, one cell per partition; a true zero is a value; the other currency is not drawn", async () => {
    mount(datasetApi().api, `?in=${PF.satellite},${ORBIT}`);
    await settled();
    // Satellite: NAV on the USDT basis, exact to the last digit; the EUR statement is named but not drawn.
    expect(exact(cell("NAV", "Satellite"))).toEqual(["11500.000000000000000007"]);
    expect(cell("NAV", "Satellite").textContent).toContain("Real-funded · USDT");
    expect(cell("NAV", "Satellite").textContent).toContain("Not shown on this basis: Real-funded · EUR");
    expect(cell("NAV", "Satellite").textContent).not.toMatch(/50\.00/);
    expect(exact(cell("Net PnL", "Satellite"))).toEqual(["-125.5"]);
    expect(cell("Net PnL", "Satellite").textContent).toContain("-125.50 USDT");
    // Orbit: NAV is an exact zero (a value with its marker), and no portfolio total was published for Net PnL (typed absence).
    expect(exact(cell("NAV", "Orbit"))).toEqual(["0"]);
    expect(cell("NAV", "Orbit").querySelector(".exec-mgr-num")?.getAttribute("data-zero")).toBe("true");
    expect(cell("NAV", "Orbit").textContent).toContain("0.00 USDT");
    expect(cell("Net PnL", "Orbit").textContent).toContain("Not available");
    expect(cell("Net PnL", "Orbit").querySelector(".exec-mgr-num")).toBeNull();
    expect(whyText(cell("Net PnL", "Orbit"))).toContain("published no total for this portfolio");
    // Nothing is added across the two portfolios or the two currencies.
    expect(screen.getByRole("table", { name: "Metrics" }).textContent).not.toMatch(/11,?500\.\d*[1-9].*-125|11,?374/);
  });

  it("keeps the Score as policy words (never a number) and Return / Max drawdown as Not published with their request ids", async () => {
    mount(datasetApi().api, `?in=${PF.satellite},${ORBIT}`);
    await settled();
    expect(cell("Score", "Satellite").textContent).toBe("Policy pending");
    expect(cell("Score", "Satellite").textContent).not.toMatch(/\d/);
    for (const [label, id] of [["Return", "FE-006, FE-025"], ["Max drawdown", "FE-013, FE-025"]] as const) {
      for (const column of ["Satellite", "Orbit"]) {
        expect(cell(label, column).textContent, label).toContain("Not available");
        expect(cell(label, column).textContent, label).toContain("Not published");
      }
    }
  });

  it("when the dataset read fails every dataset cell is Not available with its request id and the failure; no figure is invented", async () => {
    mount(datasetApi({ fail: true }).api, `?in=${PF.satellite},${ORBIT}`);
    await settled();
    for (const [label, id] of [["NAV", "FE-013"], ["Net PnL", "FE-005, FE-025"], ["Score", "FE-011"]] as const) {
      const td = cell(label, "Satellite");
      expect(td.textContent, label).toContain("Not available");
      expect(td.textContent, label).toContain("Not published");
      expect(td.textContent, label).toContain("PORTAL_READ_FAILED");
      expect(td.querySelector(".exec-mgr-num"), label).toBeNull();
    }
  });

  it("does not read the dataset for a pick that is off the basis, and says why in its column", async () => {
    const { api, asked } = datasetApi();
    mount(api, `?in=${PF.satellite},${PF.yen}`);
    await settled();
    const read = asked.map((query) => (query.surface === "PORTFOLIO" ? query.id : null));
    expect(read).toEqual([PF.satellite]);
    expect(cell("NAV", "Yen-Carry").textContent).toContain("Not available");
    expect(whyText(cell("NAV", "Yen-Carry"))).toContain("not on the comparison basis");
  });
});
