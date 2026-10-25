/**
 * The register with a served Manager dataset (portfolio groups carrying the score keys): the Portfolio score column (band, value,
 * evidence, provisional, policy, typed absence, true zero), header sort and URL-driven filters with their chips, and the exact wire
 * of the one dataset question the screen asks. Judged through the real reader and the real port encoder.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { PF } from "../../../../../e2e/bffDoublePortfolios";
import { encodeManagerDatasetQuery, type ManagerDatasetQuery } from "../../../api/managerDatasetQuery";
import type { ExecutionApi } from "../../../api/ports";
import { absentMetric, moneyMetric, partition } from "../../readers/managerDataset.testbase";
import { applyGroupQueryToDataset, datasetFor, withDataset } from "./datasetFixtures.testbase";
import { makeApi } from "./harness.fixtures";
import PortfolioListScreen from "./index";

afterEach(cleanup);

function Where() {
  const { pathname, search } = useLocation();
  return <output data-testid="where">{pathname + search}</output>;
}
const mount = (api: ExecutionApi, entry: string) =>
  render(<MemoryRouter initialEntries={[entry]}><PortfolioListScreen api={api} /><Where /></MemoryRouter>);
const search = () => new URLSearchParams((screen.getByTestId("where").textContent ?? "").split("?")[1] ?? "");

const score = (value: string, extra: Record<string, unknown> = {}) => ({ ...moneyMetric({ value }), unit: "SCORE", currency: null, source_confidence: "VERIFIED", policy_revision: "FIXTURE_LAB", methodology_ref: "FIXTURE_LAB:direct-nav", ...extra });
const ratio = (value: string) => ({ ...moneyMetric({ value }), unit: "RATIO", currency: null });
const pct = (value: string) => ({ ...moneyMetric({ value }), unit: "PERCENT", currency: null });

/** Core good, Satellite provisional fair, Canary insufficient evidence, Yen a true zero (JPY); Pilot and Unallocated have no group. */
function groups(body: any): void {
  const group = (id: string, currency: string, tag: string, metrics: Record<string, unknown>) => ({
    key: [{ field: "portfolio_id", value: id }],
    unique_row_count: 1,
    totals_scope: body.groups[0].totals_scope,
    economic_partitions: [{ partition: partition("PAPER", currency, tag), metrics }],
  });
  const money = (value: string, currency = "USDT") => moneyMetric({ currency, value });
  body.groups = [
    group(PF.core, "USDT", "u", { net_pnl: money("500.5"), return_30d_pct: pct("2.5"), portfolio_score: score("82.8"), portfolio_score_p: score("80"), portfolio_score_r: score("85"), portfolio_score_b: score("83"), portfolio_score_evidence: ratio("0.9712") }),
    group(PF.satellite, "USDT", "u", { net_pnl: money("-120"), return_30d_pct: pct("-1.2"), portfolio_score: score("69.62", { source_confidence: "PROVISIONAL" }), portfolio_score_evidence: ratio("0.6405") }),
    group(PF.canary, "USDT", "u", { net_pnl: money("9"), return_30d_pct: pct("0.1"), portfolio_score: absentMetric({ unit: "SCORE", currency: null, reason_code: "INSUFFICIENT_EVIDENCE" }), portfolio_score_evidence: ratio("0.183") }),
    group(PF.yen, "JPY", "j", { net_pnl: money("1000", "JPY"), return_30d_pct: pct("0"), portfolio_score: score("0"), portfolio_score_evidence: ratio("0.9301") }),
  ];
}

const served = (asked: unknown[] = []) => withDataset(makeApi().api, (query) => applyGroupQueryToDataset(datasetFor("FLEET", PF.core, groups), query), asked);
const table = () => screen.getByRole("table", { name: "Portfolios" });
const rows = () => within(table()).getAllByRole("row").slice(1);
const names = () => rows().map((row) => row.querySelector(".exec-pf-title")?.textContent ?? "");
const cellOf = (name: string, label: string) => (rows().find((row) => row.querySelector(".exec-pf-title")?.textContent === name)!.querySelector(`td[data-l^='${label}']`)?.textContent ?? "");
/** The server's group query (WP-K) is a second read: let it land inside act before the next assertion or the end of the test. */
const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
const ready = async (api: ExecutionApi, entry = "/deployments/portfolios?env=paper") => {
  mount(api, entry);
  await screen.findByRole("table", { name: "Portfolios" }, { timeout: 5000 });
  await waitFor(() => expect(table().querySelector(".exec-pf-score")).not.toBeNull());
  await flush();
};

describe("the one dataset question", () => {
  it("the test dataset is one the reader accepts", () => {
    expect(() => datasetFor("FLEET", PF.core, groups)).not.toThrow();
  });

  it("asks FLEET grouped by portfolio_id for the page environment and window, and nothing else: exact wire params", async () => {
    const asked: ManagerDatasetQuery[] = [];
    await ready(served(asked), "/deployments/portfolios?env=paper&window=7d");
    expect(asked).toHaveLength(1);
    expect(encodeManagerDatasetQuery(asked[0]!)).toEqual({
      path: "/manager/fleet",
      wire: { environment: "paper", window: "\"7D\"", group_by: "portfolio_id", limit: "1" },
    });
  });

  it("a published-metric sort and range add ONE more question, the same dataset with group_sort and group_filters (WP-K); a list sort adds none", async () => {
    const asked: ManagerDatasetQuery[] = [];
    await ready(served(asked), "/deployments/portfolios?env=paper&sort=score:desc&f_ret=-2..");
    await waitFor(() => expect(asked).toHaveLength(2));
    expect(encodeManagerDatasetQuery(asked[1]!)).toEqual({
      path: "/manager/fleet",
      wire: { environment: "paper", window: "\"90D\"", group_by: "portfolio_id", limit: "1",
        group_sort: JSON.stringify([{ metric_key: "portfolio_score", direction: "desc" }]), group_filters: JSON.stringify([{ metric_key: "return_30d_pct", op: "GTE", value: "-2" }]) },
    });
    cleanup();
    const plain: ManagerDatasetQuery[] = [];
    await ready(served(plain), "/deployments/portfolios?env=paper&sort=name:asc");
    expect(plain).toHaveLength(1);
  });
});

describe("Portfolio score column", () => {
  it("prints band, value, evidence, policy; the provisional badge; a typed absence; and a true zero as a value", async () => {
    await ready(served());
    const core = cellOf("Core", "Portfolio score");
    expect(core).toContain("82.80");
    expect(core).toContain("Good");
    // The register cell is value and band (the column must fit 1440): the evidence and the policy ride the value's title, and the 360 prints them.
    expect(core).not.toContain("Provisional");
    const coreTitle = table().querySelector(".exec-pf-score-val[title^='82.8 ']")!.getAttribute("title")!;
    expect(coreTitle).toContain("evidence 0.9712");
    expect(coreTitle).toContain("policy FIXTURE_LAB");
    const satellite = cellOf("Satellite", "Portfolio score");
    expect(satellite).toContain("69.62");
    expect(satellite).toContain("Fair");
    expect(satellite).toContain("Provisional");
    const canary = cellOf("Canary", "Portfolio score");
    expect(canary).toContain("Insufficient evidence");
    expect(canary).toContain("Evidence 18%");
    expect(canary).not.toMatch(/Weak|Neutral|Fair|Good|\b0\.00\b/);
    const yen = cellOf("Yen-Carry", "Portfolio score");
    expect(yen).toContain("0.00");
    expect(yen).toContain("Weak");
    expect(cellOf("Pilot", "Portfolio score")).toContain("No paper figures are published for this portfolio");
    expect(cellOf("Unallocated", "Portfolio score")).toContain("Not available");
    // The exact string rides the title; the page computes nothing.
    expect(table().querySelector(".exec-pf-score-val[title^='82.8 ']")).not.toBeNull();
    expect(document.body.textContent).not.toMatch(/NaN|undefined/);
  });

  it("the score column header names the window; the window changes it", async () => {
    await ready(served(), "/deployments/portfolios?env=paper&window=7d");
    expect(within(table()).getByRole("columnheader", { name: /Portfolio score · 7D/ })).toBeTruthy();
    expect(screen.getByTestId("basis-text").textContent).toContain("7D window");
  });

  it("no score line says 'Not available: Score' once a group publishes it", async () => {
    await ready(served());
    expect(screen.queryByTestId("not-available-line")).toBeNull();
  });

  it("every figure cell carries one font role: numeric cells never set their own size (CSS tokens only)", async () => {
    await ready(served());
    for (const el of table().querySelectorAll<HTMLElement>("td[data-numeric='true'] *")) expect(el.style.fontSize).toBe("");
  });
});

describe("sort from the header and the URL", () => {
  it("sorts the score as exact decimals, desc then asc, null-last both ways, Unallocated always last", async () => {
    await ready(served(), "/deployments/portfolios?env=paper&sort=score:desc");
    expect(names()).toEqual(["Core", "Satellite", "Yen-Carry", "Canary", "Pilot", "Unallocated"]);
    fireEvent.click(within(within(table()).getByRole("columnheader", { name: /Portfolio score/ })).getByRole("button"));
    expect(search().get("sort")).toBe("score:asc");
    await flush();
    expect(names()).toEqual(["Yen-Carry", "Satellite", "Core", "Canary", "Pilot", "Unallocated"]);
    expect(within(table()).getByRole("columnheader", { name: /Portfolio score/ }).getAttribute("aria-sort")).toBe("ascending");
  });

  it("Return sorts without a currency (one partition each); Net PnL needs the currency and then ranks inside it", async () => {
    await ready(served(), "/deployments/portfolios?env=paper&sort=ret:desc");
    expect(names().slice(0, 4)).toEqual(["Core", "Canary", "Yen-Carry", "Satellite"]);
    cleanup();
    await ready(served(), "/deployments/portfolios?env=paper&sort=pnl:desc&ccy=USDT");
    // JPY has no USDT figure: it sorts after every row that has one.
    // Server-ranked rows first (a group with no figure in the pinned partition is last among them); a portfolio with no group at all follows.
    expect(names()).toEqual(["Core", "Canary", "Satellite", "Yen-Carry", "Pilot", "Unallocated"]);
  });
});

describe("filters: ranges, missing score, chips", () => {
  it("a score range is inclusive and says its unit in the chip; clear-one removes only that filter", async () => {
    await ready(served(), "/deployments/portfolios?env=paper&f_score=69.62..82.8&f_ret=-2..");
    expect(names()).toEqual(["Core", "Satellite"]);
    const chips = screen.getByRole("list", { name: "Active filters" });
    expect(chips.textContent).toContain("Score ≥ 69.62 pts and ≤ 82.8 pts");
    expect(chips.textContent).toContain("Return ≥ -2%");
    fireEvent.click(within(chips).getByRole("button", { name: /Clear filter: Return/ }));
    await flush();
    expect(search().has("f_ret")).toBe(false);
    expect(search().get("f_score")).toBe("69.62..82.8");
  });

  it("a money range needs the page currency: it reads that currency and excludes a row with none", async () => {
    await ready(served(), "/deployments/portfolios?env=paper&ccy=USDT&f_pnl=0..");
    expect(names()).toEqual(["Canary", "Core"]);
    expect(screen.getByRole("list", { name: "Active filters" }).textContent).toContain("Net PnL ≥ 0 USDT");
  });

  it("'score missing or insufficient evidence' keeps the typed absences and the portfolios with no group", async () => {
    await ready(served(), "/deployments/portfolios?env=paper&score_state=missing");
    expect(names()).toEqual(["Canary", "Pilot", "Unallocated"]);
  });

  it("the true zero is inside 0..0 and is not 'missing'", async () => {
    await ready(served(), "/deployments/portfolios?env=paper&f_score=0..0");
    expect(names()).toEqual(["Yen-Carry"]);
  });

  it("an unreadable or reversed range in the address is INVALID and said (registerReview.test.tsx), never read as no filter", async () => {
    mount(served(), "/deployments/portfolios?env=paper&f_score=abc..5&f_pnl=5..-5");
    const alert = await screen.findByTestId("invalid-range", undefined, { timeout: 5000 });
    expect(alert.textContent).toContain("Score abc..5");
    expect(alert.textContent).toContain("Net PnL 5..-5");
    expect(names().filter((name) => name !== "")).toHaveLength(0);
  });

  it("Clear all removes every filter and keeps the sort", async () => {
    mount(served(), "/deployments/portfolios?env=paper&f_score=60..&score_state=missing&q=co&sort=score:desc");
    await screen.findByRole("list", { name: "Active filters" }, { timeout: 5000 });
    fireEvent.click(within(screen.getByRole("list", { name: "Active filters" })).getByRole("button", { name: "Clear all" }));
    await flush();
    expect(["f_score", "score_state", "q"].map((key) => search().has(key))).toEqual([false, false, false]);
    expect(search().get("sort")).toBe("score:desc");
  });

  it("the filter popover offers inclusive ranges with their unit, commits an exact decimal, and refuses text", async () => {
    await ready(served());
    const menu = screen.getByRole("group", { name: "Metric filters" });
    expect(menu.textContent).toContain("both ends inclusive");
    expect(menu.textContent).toContain("points, 0 to 100");
    // Money is not offered a field until a currency is picked, and says so (no dead control).
    expect(within(menu).queryByRole("textbox", { name: "Net PnL minimum" })).toBeNull();
    expect(menu.textContent).toContain("Pick a currency first");
    const min = within(menu).getByRole("textbox", { name: "Score minimum" });
    fireEvent.change(min, { target: { value: "abc" } });
    fireEvent.blur(min);
    expect(search().has("f_score")).toBe(false);
    expect(within(menu).getByRole("alert").textContent).toContain("exact decimal");
    fireEvent.change(min, { target: { value: "60" } });
    fireEvent.blur(min);
    expect(search().get("f_score")).toBe("60..");
    await flush();
    fireEvent.click(within(menu).getByRole("checkbox", { name: /Score missing or insufficient evidence/ }));
    expect(search().get("score_state")).toBe("missing");
    await flush();
  });

  it("no score range or missing filter is offered when no group publishes a score (nothing to filter)", async () => {
    const noScore = withDataset(makeApi().api, () => datasetFor("FLEET", PF.core, (body: any) => {
      groups(body);
      for (const g of body.groups) { delete g.economic_partitions[0].metrics.portfolio_score; delete g.economic_partitions[0].metrics.portfolio_score_evidence; }
    }));
    mount(noScore, "/deployments/portfolios?env=paper");
    await screen.findByRole("table", { name: "Portfolios" }, { timeout: 5000 });
    await waitFor(() => expect(table().querySelector(".exec-part")).not.toBeNull());
    const menu = screen.getByRole("group", { name: "Metric filters" });
    expect(within(menu).queryByRole("textbox", { name: "Score minimum" })).toBeNull();
    expect(within(menu).queryByRole("checkbox", { name: /Score missing/ })).toBeNull();
    expect(within(menu).getByRole("textbox", { name: "Return minimum" })).toBeTruthy();
    // The column keeps its honest Not published, and the one-line absence returns.
    expect(cellOf("Core", "Portfolio score")).toContain("Not published (FE-011)");
    expect(screen.getByTestId("not-available-line").textContent).toContain("Score");
  });
});

describe("sticky identity and scroll affordance (markup the stylesheet relies on)", () => {
  it("Compare and Portfolio are the first two columns of the register table", async () => {
    await ready(served());
    const heads = [...table().querySelectorAll("thead th")].map((th) => th.textContent);
    expect(heads.slice(0, 2)).toEqual(["Compare", "Portfolio"]);
    expect(table().closest(".exec-cards-wrap")).not.toBeNull();
  });
});
