/**
 * Overview, WP-F1 pieces beside the existing suites: the freshness chip, the SLA state stripe, the budget bar of the Capital panel, the
 * Contributors Portfolios tab and its bars, the first-eight cut with Show all, and the digest frame. Lane BFF_DOUBLE; the dataset is the
 * published canonical fixture judged by the real reader, served through `withDataset`.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetOverviewDouble, setOverviewDoubleVariants } from "../../../../../e2e/bffDoubleOverview";
import { httpApi, serveDoubles } from "../../../../../e2e/screensV2Harness";
import { moneyMetric, partition } from "../../readers/managerDataset.testbase";
import { newSeriesDouble, wrapFetch } from "../series/seriesDouble.testbase";
import { sessionOf } from "../alpha/testApi";
import { datasetFor, withDataset } from "../portfolios/datasetFixtures.testbase";
import OverviewScreen from "./index";
import { CONTRIBUTORS_SHOWN } from "./Contributors";

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = any;
type Query = Parameters<Parameters<typeof withDataset>[1] & {}>[0];
const mount = (api: ReturnType<typeof withDataset>, entry = "/execution?env=paper&window=30D") =>
  render(<MemoryRouter initialEntries={[entry]}><OverviewScreen api={api} sseFactory={null} /></MemoryRouter>);
const loaded = async () => {
  await screen.findByRole("heading", { name: /^Overview/ });
  await waitFor(() => {
    expect(screen.queryByRole("status", { name: /^Loading/ })).toBeNull();
    expect(document.body.textContent).not.toContain("acknowledgement: reading");
  });
};
const panel = () => screen.getByRole("region", { name: "Contributors" });

describe("page head", () => {
  it("draws the freshness chip always, with the read's own clock, beside the read line", async () => {
    mount(withDataset(httpApi(), null));
    await loaded();
    const chip = screen.getByText(/^Fresh · \d\d:\d\dZ$/);
    expect(chip).toBeTruthy();
    expect(document.body.textContent).toMatch(/Read \d+ \w+ \d\d:\d\dZ/);
  });
});

describe("Needs attention", () => {
  it("every ranked item carries a SLA state stripe (colour of the published state; its length says nothing), hidden from assistive tech", async () => {
    mount(withDataset(httpApi(), null));
    await loaded();
    const items = [...document.querySelectorAll(".exec-ov-item")];
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      const stripe = item.querySelector(".exec-ov-sla-stripe")!;
      expect(stripe.getAttribute("aria-hidden")).toBe("true");
      expect(stripe.getAttribute("data-sla")).toBe(item.getAttribute("data-sla") ?? "none");
      expect(stripe.textContent).toBe("");
    }
  });
});

describe("Capital panel: Budget used", () => {
  const withBudget = (body: Body) => {
    for (const entry of body.capital_statements) {
      entry.metrics.current_budget = moneyMetric({ currency: entry.partition.currency, value: "3000.00" });
      entry.metrics.recalling = moneyMetric({ currency: entry.partition.currency, value: "30.00" });
    }
  };

  it("draws allocated of the approved budget per partition from the published statements, with the recalling segment, and no total", async () => {
    mount(withDataset(httpApi(), () => datasetFor("FUND", "unused", withBudget)));
    await loaded();
    const group = await screen.findByRole("group", { name: "Budget used" });
    const meters = within(group).getAllByRole("meter");
    // allocation 1500.50 / 3000 = 50%; the true zero is 0%; the partition whose allocation is a typed absence has no bar at all.
    expect(meters.map((m) => m.getAttribute("aria-valuenow"))).toEqual(["50", "0"]);
    expect(meters[0]!.getAttribute("aria-valuetext")).toBe("1,500.50 USDT of 3,000.00 USDT, 30.00 USDT recalling");
    expect(group.textContent).toContain("allocation is not published");
    expect(group.textContent).not.toMatch(/Total/i);
  });

  it("without a published budget there is no bar and no invented limit", async () => {
    mount(withDataset(httpApi(), () => datasetFor("FUND", "unused")));
    await loaded();
    await waitFor(() => expect(document.querySelector(".exec-part")).not.toBeNull());
    expect(screen.queryByRole("meter")).toBeNull();
  });

  it("names the book the capital is in (the panel head follows the environment)", async () => {
    mount(withDataset(httpApi(), null), "/execution?env=paper&window=30D");
    await loaded();
    expect(within(screen.getByRole("region", { name: "Capital" })).getByText("Paper")).toBeTruthy();
  });
});

describe("Contributors: Portfolios tab, bars, first eight", () => {
  const group = (field: string, id: string, metrics: Body, p = partition("PAPER", "USDT", "usdt")) => ({
    key: [{ field, value: id }], unique_row_count: 1, totals_scope: "FULL_AUTHORIZED_FILTERED_QUERY", economic_partitions: [{ partition: p, metrics }],
  });
  const answer = (count: number) => (query: Query) => datasetFor("FUND", "unused", (body: Body) => {
    if (query.groupBy?.length) {
      const field = query.groupBy[0]!;
      body.groups = Array.from({ length: count }, (_, i) => group(field, `${field === "alpha_id" ? "alpha" : "pf"}_${String(i).padStart(2, "0")}`, { net_pnl: moneyMetric({ value: i % 2 === 0 ? String((i + 1) * 100) : `-${(i + 1) * 100}` }) }));
      body.items = [body.items[0]];
      body.page = { limit: 1, returned_count: 1, authorized_filtered_count: count, next_cursor: count > 1 ? "TEST_ONLY:cursor" : null, previous_cursor: null };
    } else body.groups = [];
  });

  it("the tab 'Portfolios' asks the same read grouped by portfolio_id and draws the portfolios, each with its own published amount", async () => {
    const asked: Query[] = [];
    mount(withDataset(httpApi(), answer(3), asked));
    await loaded();
    await waitFor(() => expect(within(panel()).queryByRole("table", { name: "Contributors by alpha" })).not.toBeNull());
    fireEvent.click(within(panel()).getByRole("button", { name: "Portfolios" }));
    await waitFor(() => expect(within(panel()).queryByRole("table", { name: "Contributors by portfolio" })).not.toBeNull());
    expect(asked.some((q) => q.groupBy?.[0] === "portfolio_id")).toBe(true);
    const names = [...panel().querySelectorAll("tbody th")].map((th) => th.textContent);
    expect(names).toEqual(["pf_00", "pf_01", "pf_02"]);
    expect(within(panel()).getByRole("columnheader", { name: "Portfolio" })).toBeTruthy();
    expect(panel().textContent).toContain("3 portfolio groups over 3 authorized rows");
    fireEvent.click(within(panel()).getByRole("button", { name: "Amount" }));
    await waitFor(() => expect(within(panel()).queryByRole("table", { name: "Contributors by alpha" })).not.toBeNull());
  });

  it("the portfolio read is asked only when the tab is opened", async () => {
    const asked: Query[] = [];
    mount(withDataset(httpApi(), answer(2), asked));
    await loaded();
    await waitFor(() => expect(within(panel()).queryByRole("table", { name: "Contributors by alpha" })).not.toBeNull());
    expect(asked.filter((q) => q.groupBy?.[0] === "portfolio_id")).toHaveLength(0);
  });

  it("each line has a drawn bar scaled inside its own partition (a drawing, hidden from assistive tech; the figure is the published string)", async () => {
    mount(withDataset(httpApi(), answer(4)));
    await loaded();
    await waitFor(() => expect(panel().querySelector("tbody")).not.toBeNull());
    const bars = [...panel().querySelectorAll(".exec-ov-bar")] as HTMLElement[];
    expect(bars).toHaveLength(4);
    expect(bars.map((b) => b.style.width)).toEqual(["25%", "50%", "75%", "100%"]); // 100, 200, 300, 400 in one partition; the largest is the full bar
    expect(bars.map((b) => b.getAttribute("data-neg"))).toEqual([null, "true", null, "true"]);
    expect(panel().querySelector(".exec-ov-bar-track")!.getAttribute("aria-hidden")).toBe("true");
  });

  it(`shows the first ${CONTRIBUTORS_SHOWN} groups in the server's order and says so; Show all lists every group`, async () => {
    mount(withDataset(httpApi(), answer(12)));
    await loaded();
    await waitFor(() => expect(panel().querySelector("tbody")).not.toBeNull());
    expect(panel().querySelectorAll("tbody tr")).toHaveLength(CONTRIBUTORS_SHOWN);
    expect(panel().textContent).toContain(`The first ${CONTRIBUTORS_SHOWN} of 12 groups, in the server's order.`);
    fireEvent.click(within(panel()).getByRole("button", { name: "Show all" }));
    expect(panel().querySelectorAll("tbody tr")).toHaveLength(12);
    expect(panel().textContent).toContain("All 12 groups are shown.");
    fireEvent.click(within(panel()).getByRole("button", { name: "Show fewer" }));
    expect(panel().querySelectorAll("tbody tr")).toHaveLength(CONTRIBUTORS_SHOWN);
  });

  it("no cut and no button for a short list", async () => {
    mount(withDataset(httpApi(), answer(CONTRIBUTORS_SHOWN)));
    await loaded();
    await waitFor(() => expect(panel().querySelector("tbody")).not.toBeNull());
    expect(within(panel()).queryByRole("button", { name: "Show all" })).toBeNull();
  });
});

describe("Since your last visit: the frame", () => {
  it("draws the three kinds of line the hi-fi digest lists as placeholders and says there is no baseline; no digest line is invented", async () => {
    mount(withDataset(httpApi(), null));
    await loaded();
    const digest = screen.getByRole("region", { name: "Since your last visit" });
    expect(digest.textContent).toContain("No baseline");
    expect(digest.textContent).toContain("Not published (FE-024)");
    const frame = digest.querySelector("ul[aria-label='What the digest will list']")!;
    expect(frame.querySelectorAll("li")).toHaveLength(3);
    expect(frame.querySelectorAll(".exec-ov-digest-line")).toHaveLength(3);
    expect(digest.textContent).not.toMatch(/approved|applied|moved stage|NAV [+-]/i);
  });
});

describe("QA1 OV-01: one KPI figure size, signed figures coloured by their published sign", () => {
  const kpi = (label: string) => [...screen.getByLabelText("Fund figures").querySelectorAll(".exec-blk-kpi")].find((n) => n.querySelector("dt")?.textContent === label) as HTMLElement;
  const withFigures = (body: Body) => {
    for (const entry of body.capital_statements) {
      const p = entry.partition;
      entry.metrics.net_pnl = moneyMetric({ currency: p.currency, value: p.currency === "EUR" ? "-12.5" : p.economic_domain === "ACTUAL" ? "0" : "100.25" });
      entry.metrics.max_drawdown_pct = { ...moneyMetric({ value: "-3.5" }), unit: "PERCENT", currency: null };
    }
  };

  it("a count sentence keeps its words as captions and its number as the KPI figure; the sentence stays whole", async () => {
    mount(withDataset(httpApi(), null));
    await loaded();
    const incidents = kpi("Open incidents").querySelector(".exec-blk-kpi-value")!;
    expect(incidents.textContent).toMatch(/^at least\s?\d+$/);
    expect(incidents.querySelector(".exec-ov-kpi")!.textContent).toMatch(/^\d+$/);
    expect(incidents.querySelector(".exec-ov-kpi-words")!.textContent).toBe("at least ");
    const attention = kpi("Needs attention").querySelector(".exec-blk-kpi-value")!;
    expect(attention.querySelector(".exec-ov-kpi")!.textContent).toBe("3");
    expect(attention.querySelector(".exec-ov-kpi-words")!.textContent).toBe(" of 214");
    expect(attention.textContent).toBe("3 of 214");
  });

  it("Net PnL and Drawdown carry data-tone from the published string: green above zero, red below, a true zero neutral; the currency is a caption", async () => {
    mount(withDataset(httpApi(), () => datasetFor("FUND", "unused", withFigures)));
    await loaded();
    await waitFor(() => expect(kpi("Net PnL").querySelector(".exec-part")).not.toBeNull());
    const tones = [...kpi("Net PnL").querySelectorAll(".exec-part-line")].map((li) => [li.getAttribute("data-tone"), li.querySelector(".exec-pf-unit")?.textContent?.trim()]);
    expect(tones).toEqual([["neutral", "USDT"], ["positive", "USDT"], ["negative", "EUR"]]);
    expect([...kpi("Drawdown").querySelectorAll(".exec-part-line")].every((li) => li.getAttribute("data-tone") === "negative")).toBe(true);
  });
});

describe("QA1 OV-06: the page is named Overview", () => {
  it("heading is Overview, with no name appended", async () => {
    mount(withDataset(httpApi(), null));
    await loaded();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Overview");
  });
});

describe("QA1 OV-05 / OV-08: contributors print the score like the register and lead somewhere", () => {
  const groupOf = (field: string, id: string, score: string, p = partition("PAPER", "USDT", "usdt")) => ({
    key: [{ field, value: id }], unique_row_count: 1, totals_scope: "FULL_AUTHORIZED_FILTERED_QUERY",
    economic_partitions: [{ partition: p, metrics: { net_pnl: moneyMetric({ value: "5" }), score: { ...moneyMetric({ value: score }), unit: "SCORE", currency: null } } }],
  });
  const answer = (query: Query) => datasetFor("FUND", "unused", (body: Body) => {
    if (query.groupBy?.length) {
      body.groups = [groupOf(query.groupBy[0]!, "alpha_one", "48.7365"), groupOf(query.groupBy[0]!, "alpha_zero", "0")];
      body.items = [body.items[0]];
      body.page = { limit: 1, returned_count: 1, authorized_filtered_count: 2, next_cursor: "TEST_ONLY:cursor", previous_cursor: null };
    } else body.groups = [];
  });

  it("the score is two places, truncated, with the exact string on the title; a true zero reads 0.00", async () => {
    mount(withDataset(httpApi(), answer));
    await loaded();
    await waitFor(() => expect(panel().querySelector("tbody")).not.toBeNull());
    const cells = [...panel().querySelectorAll("tbody tr")].map((tr) => tr.lastElementChild!);
    expect(cells.map((c) => c.textContent)).toEqual(["48.73", "0.00"]);
    expect(cells[0]!.querySelector("[title]")!.getAttribute("title")).toBe("48.7365");
  });

  it("an alpha id is a link to its 360 and a portfolio id to its own, carrying the page context", async () => {
    mount(withDataset(httpApi(), answer), "/execution?env=paper&window=30D");
    await loaded();
    await waitFor(() => expect(panel().querySelector("tbody a")).not.toBeNull());
    const link = within(panel()).getByRole("link", { name: "alpha_one" });
    expect(link.getAttribute("href")).toContain("/deployments/alphas/alpha_one");
    expect(link.getAttribute("href")).toContain("env=paper");
    fireEvent.click(within(panel()).getByRole("button", { name: "Portfolios" }));
    await waitFor(() => expect(within(panel()).getByRole("link", { name: "alpha_one" }).getAttribute("href")).toContain("/deployments/portfolios/alpha_one"));
  });
});
