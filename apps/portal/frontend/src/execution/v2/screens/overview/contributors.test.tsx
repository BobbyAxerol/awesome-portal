/**
 * Overview Contributors and the digest (FE-CAT-5). The contributors are the server's `group_by=alpha_id` groups of the FUND dataset
 * (same environment and window as the rest of the page): one line per economic partition, never summed, never re-sorted, the
 * population stated, and a typed absence (FE-025) wherever the contract does not say. The digest has no baseline, so it says so.
 */
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetOverviewDouble, setOverviewDoubleVariants } from "../../../../../e2e/bffDoubleOverview";
import { httpApi, serveDoubles } from "../../../../../e2e/screensV2Harness";
import { absentMetric, moneyMetric, partition } from "../../readers/managerDataset.testbase";
import { newSeriesDouble, wrapFetch } from "../series/seriesDouble.testbase";
import { sessionOf } from "../alpha/testApi";
import { whyText } from "../../gapWhyTestUtil";
import { datasetFor, withDataset } from "../portfolios/datasetFixtures.testbase";
import OverviewScreen from "./index";
import { contributorsView } from "./contributorsModel";

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

type Body = any; // eslint-disable-line @typescript-eslint/no-explicit-any
type Query = Parameters<Parameters<typeof withDataset>[1] & {}>[0];

const alphaGroup = (alpha: string | null, rows: number, partitions: Body[]): Body => ({
  key: [{ field: "alpha_id", value: alpha }], unique_row_count: rows, totals_scope: "FULL_AUTHORIZED_FILTERED_QUERY", economic_partitions: partitions,
});
const PUSDT = () => partition("PAPER", "USDT", "usdt");
const PEUR = () => partition("PAPER", "EUR", "eur");
const AUSDT = () => partition("ACTUAL", "USDT", "actual");

/** The published groups of this suite, in the order the SERVER sends them (deliberately not sorted by amount or by name). */
function groups(): Body[] {
  return [
    alphaGroup("alpha_zeta", 3, [
      { partition: PUSDT(), metrics: { net_pnl: moneyMetric({ value: "100.25" }) } },
      { partition: PEUR(), metrics: { net_pnl: moneyMetric({ currency: "EUR", value: "-12.5" }) } },
    ]),
    alphaGroup("alpha_alpha", 1, [{ partition: AUSDT(), metrics: { net_pnl: moneyMetric({ value: "0" }) } }]),
    alphaGroup("alpha_mid", 2, [{ partition: PUSDT(), metrics: { net_pnl: absentMetric({ reason_code: "SOURCE_FACTS_NOT_PUBLISHED", unit: "MONEY", currency: "USDT" }) } }]),
  ];
}

/** The page of a `limit: 1` grouped read: one row of N authorized, a cursor onward (or nothing at all when N is 0). */
const limitOne = (body: Body, authorized: number): void => {
  body.items = authorized === 0 ? [] : [body.items[0]];
  body.page = { limit: 1, returned_count: body.items.length, authorized_filtered_count: authorized, next_cursor: authorized > 1 ? "TEST_ONLY:cursor" : null, previous_cursor: null };
};

const grouped = (over: (body: Body) => void = () => undefined) => (query: Query) => datasetFor("FUND", "unused", (body: Body) => {
  if (query.groupBy?.length) {
    body.groups = groups();
    body.selected_window = { requested: query.window, resolved: { from_ms: 1_700_000_000_000, to_ms: 1_700_000_900_000 }, selection_basis: "EXACT_PUBLISHED_METRIC_WINDOW_ONLY", reason_code: null };
    limitOne(body, 6);
  } else body.groups = [];
  over(body);
});

const mount = (api: ReturnType<typeof withDataset>, entry = "/execution?env=paper&window=30D") =>
  render(<MemoryRouter initialEntries={[entry]}><OverviewScreen api={api} sseFactory={null} /></MemoryRouter>);
const panel = () => screen.getByRole("region", { name: "Contributors" });
const settled = async () => {
  await screen.findByRole("heading", { name: /^Overview/ });
  await waitFor(() => expect(within(panel()).queryByText("Reading contributors")).toBeNull());
};
const bodyRows = () => [...panel().querySelectorAll("tbody tr")].map((tr) => [...tr.children].map((c) => c.textContent));

describe("Contributors: the server's alpha groups", () => {
  it("asks for group_by=alpha_id on the FUND dataset in the page's environment and window, and draws each group's partitions on their own lines", async () => {
    const asked: Query[] = [];
    mount(withDataset(httpApi(), grouped(), asked), "/execution?env=paper&window=90D");
    await waitFor(() => expect(within(panel()).queryByRole("table", { name: "Contributors by alpha" })).not.toBeNull());
    const question = asked.find((q) => q.groupBy !== undefined)!;
    expect(question).toMatchObject({ surface: "FUND", environment: "paper", window: "90D", groupBy: ["alpha_id"] });
    expect(question.sort).toBeUndefined();
    expect(bodyRows()).toEqual([
      ["alpha_zeta", "Paper · USDT", "3", "+100.25 USDT"],
      ["Paper · EUR", "", "-12.50 EUR"],
      ["alpha_alpha", "Real-funded · USDT", "1", "0.00 USDT"],
      ["alpha_mid", "Paper · USDT", "2", "Not available"],
    ]);
  });

  it("keeps the server's order (no client re-sort) and never adds the partitions of a group or of different groups", async () => {
    mount(withDataset(httpApi(), grouped()));
    await waitFor(() => expect(panel().querySelector("tbody")).not.toBeNull());
    const alphas = [...panel().querySelectorAll("tbody th")].map((th) => th.textContent);
    expect(alphas).toEqual(["alpha_zeta", "alpha_alpha", "alpha_mid"]);
    const text = panel().textContent ?? "";
    // 100.25 USDT + 0 would be 100.25; -12.5 EUR + 100.25 would be 87.75: neither total exists.
    expect(text).not.toMatch(/87\.75|100\.25 USDT.*total|Total/i);
    expect(panel().querySelectorAll("tbody tr")).toHaveLength(4);
  });

  it("a true zero is a value and a missing net_pnl is a typed absence with its published reason, never 0", async () => {
    mount(withDataset(httpApi(), grouped()));
    await waitFor(() => expect(panel().querySelector("tbody")).not.toBeNull());
    const rows = [...panel().querySelectorAll("tbody tr")];
    const zero = rows[2]!.querySelector("[data-zero='true']");
    expect(zero?.getAttribute("title")).toMatch(/^0 · /);
    expect(rows[2]!.textContent).toContain("0.00 USDT");
    const missing = rows[3]!;
    expect(missing.querySelector("[data-zero]")).toBeNull();
    expect(missing.textContent).not.toMatch(/0\.00/);
    expect(missing.textContent).toContain("Not available");
    expect(whyText(missing.querySelector("[data-gap], .exec-blk-why") ?? missing)).toContain("SOURCE_FACTS_NOT_PUBLISHED");
  });

  it("states the population: groups listed, the authorized filtered count, the scope, the environment and the window", async () => {
    mount(withDataset(httpApi(), grouped()), "/execution?env=paper&window=7D");
    const note = await screen.findByTestId("contributors-population");
    // The double sends no group_page, so the line states only what is on screen and claims nothing about the rest.
    expect(note.textContent).toBe("3 alpha groups over 6 authorized rows (full authorized filtered query), paper, window 7D. The server did not state how many groups exist.");
    expect(note.getAttribute("data-partial")).toBeNull();
  });

  it("200 groups without a group_page claim nothing about completeness (no guess from the count)", () => {
    const view = contributorsView({
      served: true, fundRead: { phase: "idle" }, fund: datasetFor("FUND", "u"),
      grouped: { phase: "ready", warnings: [], value: datasetFor("FUND", "u", (body: Body) => {
        body.groups = Array.from({ length: 200 }, (_, i) => alphaGroup(`a${String(i).padStart(3, "0")}`, 1, [{ partition: PUSDT(), metrics: { net_pnl: moneyMetric({ value: "1" }) } }]));
        limitOne(body, 900);
      }) },
    });
    expect(view.kind).toBe("ready");
    if (view.kind !== "ready") return;
    expect(view.population.groupPage).toBeNull();
    expect(view.population.partial).toBe(false);
    expect(view.population.statement).toContain("The server did not state how many groups exist.");
    expect(view.population.statement).not.toMatch(/whole population|complete|all shown/);
  });

  it("Return and Score are columns only when a group publishes the key; the cell of a partition that does not is a typed absence", async () => {
    mount(withDataset(httpApi(), grouped()));
    await waitFor(() => expect(panel().querySelector("thead")).not.toBeNull());
    expect([...panel().querySelectorAll("thead th")].map((th) => th.textContent)).toEqual(["Alpha", "Partition", "Rows", "Amount"]);
    expect(panel().textContent).toContain("Not published by the groups: Return, Score");
    cleanup();
    mount(withDataset(httpApi(), grouped((body: Body) => {
      if (body.groups[0]) body.groups[0].economic_partitions[0].metrics.return_30d_pct = { ...moneyMetric({ value: "1.5" }), unit: "PERCENT", currency: null };
    })));
    await waitFor(() => expect(panel().querySelector("thead")).not.toBeNull());
    expect([...panel().querySelectorAll("thead th")].map((th) => th.textContent)).toEqual(["Alpha", "Partition", "Rows", "Amount", "Return"]);
    const returns = [...panel().querySelectorAll("tbody tr")].map((tr) => tr.lastElementChild?.textContent);
    expect(returns[0]).toContain("1.5");
    expect(returns.slice(1).every((t) => t?.includes("Not available"))).toBe(true);
    expect(panel().textContent).toContain("Not published by the groups: Score");
  });
});

describe("Contributors: typed absence", () => {
  const absent = async (code: string) => {
    await settled();
    expect(panel().querySelector("table")).toBeNull();
    expect(panel().textContent).toContain("Not published");
    expect(panel().querySelector("[data-contributors-absence]")?.getAttribute("data-contributors-absence")).toBe(code);
    expect(panel().textContent).not.toMatch(/(^|\s)0(\.0+)?\s/);
  };

  it("the dataset does not offer alpha_id: no grouped read is made and the panel says so", async () => {
    const asked: Query[] = [];
    mount(withDataset(httpApi(), grouped((body: Body) => { body.query_options.group_fields = body.query_options.group_fields.filter((f: string) => f !== "alpha_id"); body.query_options.sort_fields = body.query_options.sort_fields.filter((f: string) => f !== "alpha_id"); }), asked));
    await absent("GROUP_FIELD_NOT_OFFERED");
    expect(asked.some((q) => q.groupBy !== undefined)).toBe(false);
  });

  it("no group publishes net_pnl: the metric is absent, not 0", async () => {
    mount(withDataset(httpApi(), grouped((body: Body) => { body.groups = body.groups.length === 0 ? [] : [alphaGroup("alpha_x", 1, [{ partition: PUSDT(), metrics: { allocation: moneyMetric({ value: "5" }) } }])]; })));
    await absent("METRIC_NOT_PUBLISHED");
  });

  it("the server answered another grouping: it is not drawn as contributors", async () => {
    mount(withDataset(httpApi(), () => datasetFor("FUND", "unused")));
    await absent("GROUPING_NOT_ANSWERED");
  });

  it("rows exist but no group is published: a typed absence, while an empty population says so plainly", async () => {
    mount(withDataset(httpApi(), (query) => datasetFor("FUND", "unused", (body: Body) => { body.groups = []; if (query.groupBy) limitOne(body, 4); })));
    await absent("NO_GROUPS_PUBLISHED");
    cleanup();
    mount(withDataset(httpApi(), (query) => datasetFor("FUND", "unused", (body: Body) => { body.groups = []; if (query.groupBy) limitOne(body, 0); })));
    await settled();
    expect(panel().textContent).toContain("No alpha is in this population.");
    expect(panel().textContent).not.toContain("Not published");
  });

  it("a dataset that is not served (sparse profile) keeps the panel on its id with the reason", async () => {
    mount(withDataset(httpApi(), null));
    await absent("DATASET_READ_FAILED");
    expect(panel().querySelector("[data-contributors-absence]")?.textContent).toContain("not served");
  });

  it("a refused grouped read is the typed refusal, not an empty panel", async () => {
    mount(withDataset(httpApi(), (query) => (query.groupBy ? null : datasetFor("FUND", "unused"))));
    await absent("DATASET_READ_FAILED");
  });
});

describe("Since your last visit", () => {
  it("is an explicit absence: no comparison baseline, its id, and a disclosure naming what would make it appear; nothing from dates", async () => {
    mount(withDataset(httpApi(), grouped()));
    await settled();
    const digest = screen.getByRole("region", { name: "Since your last visit" });
    expect(digest.textContent).toContain("Not published");
    expect(digest.textContent).toContain("No comparison baseline is published yet.");
    // The frame of the hi-fi digest is drawn (three kinds of line, hatched placeholders) but no digest line is: nothing is listed.
    const frame = digest.querySelector("ul[aria-label='What the digest will list']")!;
    expect([...frame.querySelectorAll("li")].map((li) => (/(Approval|Operation|NAV)$/.exec(li.textContent ?? "") ?? [])[1])).toEqual(["Approval", "Operation", "NAV"]);
    expect(digest.querySelector("ol")).toBeNull();
    const why = whyText(digest.querySelector("[data-digest-absence] .exec-blk-why")!);
    expect(why).toContain("persisted, user-scoped baseline");
    expect(why).toContain("current source facts");
    expect(why).toContain("fixture dates");
    expect(why).toContain("FE-024");
  });
});
