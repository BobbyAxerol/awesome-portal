/**
 * Compare against the Playwright double's portfolio list, through the real
 * reader: the picks in the URL, the basis and the partition block that refuses
 * to mix currencies and domains, the overlay's Not available for aligned
 * series (FE-033), and the metric table that holds identity and scalars only.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { PF } from "../../../../../e2e/bffDoublePortfolios";
import type { ExecutionApi } from "../../../api/ports";
import { useContextFactsValue } from "../../shell/contextFacts";
import { V2_CAPABILITY } from "../../shell/roleNav";
import { makeApi, type Override } from "../portfolios/harness.fixtures";
import { loadCanonical } from "../../testkit/loadCanonical";
import { oracleComparison, type Draft } from "../../readers/managerSeries.testbase";
import { seriesBodyFor, type SeriesVariant } from "../series/seriesDouble.testbase";
import CompareScreen, { COMPARE_SCREEN_KEY } from "./index";

afterEach(cleanup);

function Where() {
  const { pathname, search } = useLocation();
  return <output data-testid="where">{pathname + search}</output>;
}

const mount = (api: ExecutionApi, query = "", props: { portfolioId?: string; capabilities?: ReadonlySet<string> } = {}) =>
  render(
    <MemoryRouter initialEntries={[`/deployments/compare${query}`]}>
      <CompareScreen api={api} {...props} />
      <Where />
      <FactsProbe />
    </MemoryRouter>,
  );

/** What the screen has told the context bar so far (`{}` when it has said nothing). */
function FactsProbe() {
  return <output data-testid="facts">{JSON.stringify(useContextFactsValue())}</output>;
}
const facts = (): Record<string, unknown> => JSON.parse(screen.getByTestId("facts").textContent ?? "{}");

const where = () => screen.getByTestId("where").textContent ?? "";
const search = () => new URLSearchParams(where().split("?")[1] ?? "");
const loaded = () => screen.findByRole("group", { name: "Portfolios to compare" });
const chip = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name}`) }) as HTMLButtonElement;
const metrics = () => within(screen.getByRole("table", { name: "Metrics" }));
const row = (label: string) => metrics().getByText(label, { selector: "td[data-l='Metric'] *, td[data-l='Metric']" }).closest("tr") as HTMLElement;
const cell = (tr: HTMLElement, column: string) => tr.querySelector(`td[data-l='${column}']`)?.textContent ?? "";
const pick = (...ids: string[]) => `?in=${ids.join(",")}`;

describe("page", () => {
  it("is the compare flag's screen and keeps its promises in the subtitle", async () => {
    expect(COMPARE_SCREEN_KEY).toBe("compare");
    mount(makeApi().api);
    await loaded();
    expect(screen.getByRole("heading", { level: 1, name: "Compare" })).toBeTruthy();
    expect(screen.getByText("2 to 4 · one currency · one domain · identity, scalars and aligned series")).toBeTruthy();
    expect(screen.getByText("Fresh")).toBeTruthy();
  });

  it("offers Portfolios, and Alphas only as a choice that says why it is off", async () => {
    mount(makeApi().api);
    await loaded();
    expect(screen.getByRole("button", { name: "Portfolios" }).getAttribute("aria-pressed")).toBe("true");
    const alphas = screen.getByRole("button", { name: "Alphas" }) as HTMLButtonElement;
    expect(alphas.disabled).toBe(true);
    expect(alphas.title).toContain("Not published (FE-033)");
    expect(alphas.getAttribute("aria-describedby")).toBeTruthy();
  });

  it("says alphas are not comparable when the address asks for them, and shows portfolios", async () => {
    mount(makeApi().api, "?kind=alpha");
    await loaded();
    expect(screen.getByText("Comparing alphas is Not published (FE-033). Showing portfolios.")).toBeTruthy();
  });

  it("points Back where the link came from", async () => {
    mount(makeApi().api, `?from=portfolio:${PF.core}`);
    await loaded();
    expect(screen.getByRole("link", { name: "Back to Portfolio" }).getAttribute("href")).toContain(`/deployments/portfolios/${PF.core}`);
    cleanup();
    mount(makeApi().api, "?from=fleet");
    await loaded();
    expect(screen.getByRole("link", { name: "Back to Alpha Fleet" }).getAttribute("href")).toContain("/deployments/alphas");
    cleanup();
    mount(makeApi().api, "?from=something-else");
    await loaded();
    expect(screen.getByRole("link", { name: "Back to Portfolios" })).toBeTruthy();
  });
});

describe("picks", () => {
  it("asks for the first pick, then for one more, and says when four is the most", async () => {
    mount(makeApi().api);
    await loaded();
    expect(screen.getByText("Pick two to four portfolios to compare.")).toBeTruthy();
    fireEvent.click(chip("Satellite"));
    expect(search().get("in")).toBe(PF.satellite);
    expect(screen.getByText("Pick at least one more to compare.")).toBeTruthy();
    for (const name of ["Canary", "Core", "Yen-Carry"]) fireEvent.click(chip(name));
    expect(search().get("in")?.split(",")).toHaveLength(4);
    expect(screen.getByText("4 selected. Remove one to change.")).toBeTruthy();
    const fifth = chip("Pilot");
    expect(fifth.disabled).toBe(true);
    expect(fifth.title).toBe("At most 4");
  });

  it("removes a pick with the same chip and keeps the order of the rest", async () => {
    mount(makeApi().api, pick(PF.core, PF.satellite, PF.canary));
    await loaded();
    fireEvent.click(chip("Satellite"));
    expect(search().get("in")).toBe(`${PF.core},${PF.canary}`);
    expect(chip("Satellite").getAttribute("aria-pressed")).toBe("false");
  });

  it("numbers the picks by position with a colour role and a glyph, so colour is never the only cue", async () => {
    mount(makeApi().api, pick(PF.satellite, PF.canary));
    await loaded();
    expect(chip("Satellite").getAttribute("data-tone")).toBe("series");
    expect(chip("Canary").getAttribute("data-tone")).toBe("series-2");
    expect(chip("Satellite").querySelector("i")!.getAttribute("data-glyph")).toBe("circle");
    expect(chip("Canary").querySelector("i")!.getAttribute("data-glyph")).toBe("square");
    expect(chip("Yen-Carry").getAttribute("data-tone")).toBeNull();
  });

  it("will not take the Unallocated bucket, and says so on the chip", async () => {
    mount(makeApi().api);
    await loaded();
    const una = chip("Unallocated");
    expect(una.disabled).toBe(true);
    expect(una.title).toContain("nothing to compare");
    expect(una.textContent).toContain("not comparable");
  });

  it("reads the ids alias, drops what is not a clean id, and says how many it dropped", async () => {
    mount(makeApi().api, `?ids=${PF.core},,bad%20id,${PF.core},${PF.satellite}`);
    await loaded();
    expect(chip("Core").getAttribute("aria-pressed")).toBe("true");
    expect(chip("Satellite").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(/2 entries in the address were not used/)).toBeTruthy();
  });

  it("filters the chips by name, id or owner from the URL", async () => {
    mount(makeApi().api, "?q=nguyen");
    await loaded();
    const group = screen.getByRole("group", { name: "Portfolios to compare" });
    expect(within(group).getAllByRole("button").map((b) => b.textContent?.replace(/(USDT|JPY).*/, ""))).toEqual(["Satellite", "Canary"]);
  });

  it("starts from the portfolio the 360 handed over, once, without a history entry", async () => {
    mount(makeApi().api, "", { portfolioId: PF.core });
    await loaded();
    await waitFor(() => expect(search().get("in")).toBe(PF.core));
    expect(chip("Core").getAttribute("aria-pressed")).toBe("true");
  });

  it("does not override picks already in the address with the handed-over portfolio", async () => {
    mount(makeApi().api, pick(PF.satellite), { portfolioId: PF.core });
    await loaded();
    expect(search().get("in")).toBe(PF.satellite);
  });

  it("says what the candidate list is when the read was truncated", async () => {
    mount(makeApi().api);
    await loaded();
    expect(screen.getByText("The portfolio read is the top 6 / 9; the rest cannot be chosen yet.")).toBeTruthy();
  });
});

describe("basis and partitions", () => {
  it("reads two Real-funded USDT portfolios on one basis, with nothing left apart", async () => {
    const whole: Override = (_m, path) => (path === "/portfolios" ? undefined : undefined);
    mount(makeApi(whole).api, pick(PF.satellite, PF.canary));
    await loaded();
    // Canary is a Simulated sandbox book, so it is apart; the basis is the first pick.
    expect(screen.getByTestId("basis-line").textContent).toBe("Basis: USDT, Real-funded, set by the first portfolio picked.");
    const parts = screen.getAllByTestId("partition").map((li) => li.textContent);
    expect(parts).toEqual(["USDT · Real-funded · Satellite", "USDT · Simulated · Canary"]);
    expect(screen.getByTestId("refusal").textContent).toContain("One pick is listed apart");
    const apart = screen.getAllByTestId("not-comparable");
    expect(apart).toHaveLength(1);
    expect(apart[0].textContent).toContain("Canary");
    expect(apart[0].textContent).toContain("Simulated book; the basis is Real-funded, and the two are never combined");
  });

  it("tells the context bar the basis currency, and none while nothing comparable is picked", async () => {
    mount(makeApi().api, pick(PF.satellite, PF.yen));
    await loaded();
    expect(facts()).toEqual({ ccy: "USDT" });
    cleanup();
    mount(makeApi().api, "?ccy=eur");
    await loaded();
    // No basis yet: the bar must not echo the `ccy` another screen left in the URL.
    expect(facts()).toEqual({ ccy: null });
  });

  it("refuses another currency: it is listed apart, with the currency named, never converted", async () => {
    mount(makeApi().api, pick(PF.satellite, PF.yen));
    await loaded();
    expect(screen.getByTestId("basis-line").textContent).toContain("Basis: USDT");
    const apart = screen.getAllByTestId("not-comparable");
    expect(apart).toHaveLength(1);
    expect(apart[0].textContent).toContain("Yen-Carry");
    expect(apart[0].textContent).toContain("Other currency (JPY); cannot be compared on a USDT basis");
    expect(screen.getAllByTestId("partition").map((li) => li.textContent)).toEqual(["USDT · Real-funded · Satellite", "JPY · Simulated · Yen-Carry"]);
    expect(document.body.textContent).not.toMatch(/convert(ed)? to|exchange rate|fx rate/i);
  });

  it("refuses a portfolio whose single allocation figure spans Real-funded and Simulated books", async () => {
    mount(makeApi().api, pick(PF.core, PF.satellite));
    await loaded();
    const apart = screen.getAllByTestId("not-comparable");
    expect(apart).toHaveLength(1);
    expect(apart[0].textContent).toContain("Core");
    expect(apart[0].textContent).toContain("Real-funded and Simulated books share one allocation figure");
    // The basis is the first portfolio that CAN be compared, not the first picked.
    expect(screen.getByTestId("basis-line").textContent).toContain("Basis: USDT, Real-funded");
  });

  it("states that the picks differ in currency before anything is drawn", async () => {
    mount(makeApi().api, pick(PF.yen, PF.canary));
    await loaded();
    expect(screen.getByTestId("basis-line").textContent).toContain("Basis: JPY, Simulated");
    expect(screen.getAllByTestId("not-comparable")[0].textContent).toContain("Other currency (USDT)");
  });

  it("names an id the loaded list does not hold, instead of dropping it", async () => {
    mount(makeApi().api, pick(PF.satellite, "pf_not_loaded"));
    await loaded();
    const apart = screen.getAllByTestId("not-comparable");
    expect(apart.map((a) => a.textContent)).toEqual([expect.stringContaining("pf_not_loaded")]);
    expect(apart[0].textContent).toContain("Not in the loaded portfolios");
  });

  it("collapses the partitions into a one-line summary in the Series head that counts what is left apart and opens the groups (owner decision)", async () => {
    mount(makeApi().api, pick(PF.satellite, PF.yen));
    await loaded();
    const summary = screen.getByRole("button", { name: /listed apart/ });
    expect(summary.textContent).toContain("USDT · Real-funded basis");
    expect(summary.textContent).toContain("1 listed apart");
    expect(summary.textContent).toContain("Money is never converted or combined");
    expect(summary.getAttribute("aria-expanded")).toBe("false");
    const region = document.getElementById(summary.getAttribute("aria-controls")!)!;
    expect(region.hidden).toBe(true);
    // The exclusion and its reason stay on screen while the disclosure is closed.
    expect(screen.getAllByTestId("not-comparable")[0].textContent).toContain("Other currency (JPY)");
    fireEvent.click(summary);
    expect(summary.getAttribute("aria-expanded")).toBe("true");
    expect(region.hidden).toBe(false);
  });

  it("keeps the Partitions button's name constant while aria-expanded carries the state; the region is a named group", async () => {
    mount(makeApi().api, pick(PF.satellite, PF.yen));
    await loaded();
    const summary = screen.getByRole("button", { name: /listed apart/ });
    const before = summary.textContent;
    expect(before).toMatch(/Partitions$/);
    expect(before).not.toMatch(/Hide partitions/);
    fireEvent.click(summary);
    expect(summary.getAttribute("aria-expanded")).toBe("true");
    expect(summary.textContent).toBe(before);
    const region = document.getElementById(summary.getAttribute("aria-controls")!)!;
    expect(region.getAttribute("role")).toBe("group");
    expect(screen.getByRole("group", { name: "Partitions" })).toBe(region);
  });

  it("puts each pick's series swatch in its metric column head, and the figures right-aligned (K-B5)", async () => {
    mount(makeApi().api, pick(PF.satellite, PF.canary));
    await loaded();
    const heads = [...within(screen.getByRole("table", { name: "Metrics" })).getAllByRole("columnheader")];
    expect(heads.map((h) => h.textContent)).toEqual(["Metric", "Satellite", "Canary"]);
    expect(heads[1]!.querySelector('.exec-cmpr-sw[data-tone="series"]')).not.toBeNull();
    expect(heads[2]!.querySelector('.exec-cmpr-sw[data-tone="series-2"]')).not.toBeNull();
    expect(heads[1]!.getAttribute("data-numeric")).toBe("true");
  });

  it("has nothing to partition before anything is picked", async () => {
    mount(makeApi().api);
    await loaded();
    expect(screen.getByText("Nothing is picked, so there is nothing to partition.")).toBeTruthy();
    expect(screen.queryAllByTestId("partition")).toHaveLength(0);
  });
});

describe("series (FE-013/033, BE-P4 manager series)", () => {
  /** Four live USDT portfolios from the published list shape, so any two of them share one basis. */
  const canonicalList = loadCanonical<Draft>("execution-portfolio-list.valid.json");
  const live = (index: number): Draft => ({ ...structuredClone(canonicalList.items[0]), portfolio_id: `pf_cmp_${index}`, name: `Alpha Book ${index}`, owner: null, environments: ["live"] });
  const portfolios = (): Draft => ({ ...structuredClone(canonicalList), items: [1, 2, 3, 4].map(live), total_portfolios: 4, truncated: false });
  const A = "pf_cmp_1";
  const B = "pf_cmp_2";
  const C = "pf_cmp_3";
  const serving = (variant: SeriesVariant, tweak?: (body: Draft) => void): Override => (_method, path, search) => {
    if (path === "/portfolios") return { status: 200, body: portfolios() };
    if (path !== "/manager/series") return undefined;
    if (variant.startsWith("status:")) return { status: Number(variant.slice(7)), body: { error: { code: "REFUSED", message: "refused" } } };
    const body = seriesBodyFor(search, variant);
    tweak?.(body);
    return { status: 200, body };
  };
  const overlay = (container: HTMLElement) => container.querySelector(".exec-compare") as HTMLElement;
  const settled = async (container: HTMLElement) => {
    await loaded();
    await waitFor(() => expect(container.querySelector("[role='status'][aria-label='Loading the series']")).toBeNull());
  };

  it("fewer than two comparable picks: no series is asked for and the overlay says what to do (no 'Not published')", async () => {
    const { api, calls } = makeApi();
    const { container } = mount(api, pick(PF.satellite, PF.canary));
    await loaded();
    expect(overlay(container).textContent).toContain("Pick two comparable portfolios");
    expect(overlay(container).textContent).not.toContain("Not published");
    expect(overlay(container).querySelectorAll("svg")).toHaveLength(0);
    expect(screen.getByTestId("basis-caption").textContent).toBe("Basis: No aligned series: the common basis is not established");
    expect(within(overlay(container)).getByRole("list", { name: "Not in the comparison" })).toBeTruthy();
    expect(within(overlay(container)).getByText("Not comparable")).toBeTruthy();
    expect(calls).toEqual(["GET /portfolios"]);
  });

  it("follows the shared window in the caption", async () => {
    mount(makeApi().api, `${pick(PF.satellite, PF.canary)}&window=30d`);
    await loaded();
    expect(screen.getByText("Window 30D")).toBeTruthy();
  });

  it("two comparable picks: ONE series read, the picks in order, NAV, the URL's environment and window", async () => {
    const harness = makeApi(serving("populated"));
    const { container } = mount(harness.api, `${pick(A, B)}&env=paper&window=30d`);
    await settled(container);
    const queries = harness.queriesOf("/manager/series");
    expect(queries).toHaveLength(1);
    expect(queries[0]!.get("environment")).toBe("paper");
    expect(queries[0]!.get("metric")).toBe("NAV");
    expect(JSON.parse(queries[0]!.get("window")!)).toBe("30D");
    expect(JSON.parse(queries[0]!.get("subjects")!)).toEqual([{ subject_type: "PORTFOLIO", subject_id: A }, { subject_type: "PORTFOLIO", subject_id: B }]);
    expect(harness.calls.filter((c) => c.startsWith("GET /portfolios"))).toHaveLength(1);
  });

  it("ALIGNED draws every series on the published axis with its basis, and fills nothing where a subject has no point", async () => {
    const { container } = mount(makeApi(serving("populated")).api, pick(A, B));
    await settled(container);
    await waitFor(() => expect(overlay(container).querySelectorAll("[data-testid='compare-line']")).toHaveLength(2));
    expect(overlay(container).textContent).toContain("Alpha Book 1");
    expect(overlay(container).textContent).toContain("Alpha Book 2");
    const basis = screen.getByTestId("basis-caption").textContent!;
    expect(basis).toContain("NAV in USDT");
    expect(basis).toContain("methodology TEST_ONLY:nav-twr.v1");
    expect(basis).toContain("nothing rebased, filled or converted");
    expect(screen.getByText("Published series")).toBeTruthy();
    // Walk the cursor along the axis: where Alpha Book 2 has no point the readout says so; it never carries a neighbour forward.
    const plot = overlay(container).querySelector("[role='group'][tabindex='0']") as HTMLElement;
    const seen = new Set<string>();
    fireEvent.keyDown(plot, { key: "Home" });
    for (let step = 0; step < 6; step += 1) {
      for (const node of overlay(container).querySelectorAll("[data-testid='compare-value']")) seen.add(node.textContent ?? "");
      fireEvent.keyDown(plot, { key: "ArrowRight" });
    }
    expect([...seen]).toContain("No point at this time");
  });

  it("the measure switch asks for the same picks again with the other metric", async () => {
    const harness = makeApi(serving("populated"));
    const { container } = mount(harness.api, pick(A, B));
    await settled(container);
    expect(screen.getByRole("button", { name: "NAV" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Net PnL" }));
    await waitFor(() => expect(harness.queriesOf("/manager/series")).toHaveLength(2));
    expect(harness.queriesOf("/manager/series")[1]!.get("metric")).toBe("NET_PNL");
    expect(screen.getByRole("button", { name: "Net PnL" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Return" }));
    await waitFor(() => expect(harness.queriesOf("/manager/series")).toHaveLength(3));
    expect(harness.queriesOf("/manager/series")[2]!.get("metric")).toBe("RETURN");
    await waitFor(() => expect(screen.getByTestId("basis-caption").textContent).toContain("Return, a ratio"));
  });

  it("INCOMPARABLE lists every subject apart with the mismatch reason and its own currency; nothing is drawn, converted or summed", async () => {
    const { container } = mount(makeApi(serving("mixed")).api, pick(A, B));
    await settled(container);
    await waitFor(() => expect(overlay(container).textContent).toContain("CURRENCY_MIXED"));
    expect(overlay(container).textContent).toContain("Not comparable");
    expect(overlay(container).textContent).toContain("Different currencies are never converted or summed");
    expect(overlay(container).querySelectorAll("svg")).toHaveLength(0);
    const items = within(overlay(container)).getAllByTestId("not-comparable");
    expect(items.map((i) => i.textContent)).toEqual([
      expect.stringMatching(/Alpha Book 1.*USDT/),
      expect.stringMatching(/Alpha Book 2.*VND/),
    ]);
    expect(screen.getByTestId("basis-caption").textContent).toBe("Basis: No aligned series: the common basis is not established");
  });

  it("UNAVAILABLE for a source that is not published keeps Not published (FE-013/033) and names the code per subject", async () => {
    const { container } = mount(makeApi(serving("unavailable")).api, pick(A, B, C));
    await settled(container);
    await waitFor(() => expect(overlay(container).textContent).toContain("SERIES_SOURCE_NOT_PUBLISHED"));
    expect(overlay(container).textContent).toContain("Not published (FE-013/033)");
    expect(overlay(container).querySelectorAll("svg")).toHaveLength(0);
    expect(within(overlay(container)).getAllByTestId("not-comparable")).toHaveLength(3);
  });

  it("UNAVAILABLE for ALL prints the window reason, not a source gap", async () => {
    const { container } = mount(makeApi(serving("populated")).api, `${pick(A, B)}&window=all`);
    await settled(container);
    await waitFor(() => expect(overlay(container).textContent).toContain("ALL_HISTORY_WINDOW_NOT_PUBLISHED"));
    expect(overlay(container).textContent).toContain("Not available");
    expect(overlay(container).textContent).not.toContain("Not published (FE-013/033)");
  });

  it("an EMPTY subject means the picks are not aligned: nothing is drawn from the other one", async () => {
    const { container } = mount(makeApi(serving("populated", (body) => {
      Object.assign(body.series[1], { state: "EMPTY", reason_code: "NO_POINTS_PUBLISHED_IN_WINDOW", points: [], gaps: [] });
      body.comparison = oracleComparison(body.series);
    })).api, pick(A, B));
    await settled(container);
    await waitFor(() => expect(overlay(container).textContent).toContain("no points in this window"));
    expect(overlay(container).querySelectorAll("svg")).toHaveLength(0);
    expect(overlay(container).textContent).toContain("Not available");
  });

  it("a stale series still draws and wears the word", async () => {
    const { container } = mount(makeApi(serving("populated", (body) => { body.series[0].quality.freshness = "STALE"; })).api, pick(A, B));
    await settled(container);
    await waitFor(() => expect(overlay(container).querySelectorAll("[data-testid='compare-line']")).toHaveLength(2));
    expect(overlay(container).textContent).toMatch(/Stale/);
  });

  it.each(["status:400", "status:404", "status:503"] as const)("a failed series read (%s) is typed 'Not available' and the list, chips and table stand", async (variant) => {
    const { container } = mount(makeApi(serving(variant)).api, pick(A, B));
    await settled(container);
    await waitFor(() => expect(overlay(container).textContent).toContain("The series could not be read"));
    expect(overlay(container).textContent).toContain("Not available");
    expect(overlay(container).querySelectorAll("svg")).toHaveLength(0);
    expect(screen.getByRole("table", { name: "Metrics" })).toBeTruthy();
  });

  it("a series that answers other picks is refused and never drawn as these", async () => {
    const { container } = mount(makeApi(serving("populated", (body) => { body.series.reverse(); body.comparison = oracleComparison(body.series); })).api, pick(A, B));
    await settled(container);
    await waitFor(() => expect(overlay(container).textContent).toContain("The series could not be read"));
    expect(overlay(container).querySelectorAll("svg")).toHaveLength(0);
  });

  describe("Return: a ratio states its scale (FE-013, BE-P8)", () => {
    /** Applies `change` to RETURN bodies only (the first read is NAV and must stay a valid NAV). */
    const returns = (change: (body: Draft) => void) => serving("populated", (body) => {
      if (body.metric !== "RETURN") return;
      change(body);
      body.comparison = oracleComparison(body.series);
    });
    const openReturn = async (container: HTMLElement) => {
      await settled(container);
      fireEvent.click(screen.getByRole("button", { name: "Return" }));
      await waitFor(() => expect(screen.getByRole("button", { name: "Return" }).getAttribute("aria-pressed")).toBe("true"));
    };

    it("RATIO_SCALE_MIXED is INCOMPARABLE with that reason: nothing is drawn, each subject is listed apart with its own scale", async () => {
      const { container } = mount(makeApi(returns((body) => { body.series[1].ratio_scale = "PERCENT"; })).api, pick(A, B));
      await openReturn(container);
      await waitFor(() => expect(overlay(container).textContent).toContain("RATIO_SCALE_MIXED"));
      expect(overlay(container).textContent).toContain("Not comparable");
      expect(overlay(container).textContent).toContain("These returns are stated on different scales and are not drawn together");
      expect(overlay(container).querySelectorAll("svg")).toHaveLength(0);
      const items = within(overlay(container)).getAllByTestId("not-comparable");
      expect(items.map((i) => i.textContent)).toEqual([
        expect.stringMatching(/Alpha Book 1.*ratio, scale FRACTION/),
        expect.stringMatching(/Alpha Book 2.*ratio, scale PERCENT/),
      ]);
      expect(screen.getByTestId("basis-caption").textContent).toBe("Basis: No aligned series: the common basis is not established");
    });

    it("an ALIGNED FRACTION return is drawn in percent and the basis caption states the scale", async () => {
      const { container } = mount(makeApi(returns((body) => { for (const e of body.series) e.points.forEach((p: Draft, i: number) => { p.value = ["0", "0.0123", "-0.004"][i % 3]; }); })).api, pick(A, B));
      await openReturn(container);
      await waitFor(() => expect(overlay(container).querySelectorAll("[data-testid='compare-line']")).toHaveLength(2));
      const basis = screen.getByTestId("basis-caption").textContent!;
      expect(basis).toContain("Return, a ratio stated as a fraction (1.0 is 100%), shown in %");
      const plot = overlay(container).querySelector("[role='group'][tabindex='0']") as HTMLElement;
      const seen = new Set<string>();
      fireEvent.keyDown(plot, { key: "Home" });
      for (let step = 0; step < 6; step += 1) {
        for (const node of overlay(container).querySelectorAll("[data-testid='compare-value']")) seen.add(node.textContent ?? "");
        fireEvent.keyDown(plot, { key: "ArrowRight" });
      }
      // The published 0.0123 is printed as 1.23% by moving the point in the string; no value is read as a number.
      expect([...seen].some((text) => text.includes("1.23%"))).toBe(true);
      expect([...seen].some((text) => text.includes("0.0123"))).toBe(false);
    });

    it("a PERCENT return prints as published with a percent sign", async () => {
      const { container } = mount(makeApi(returns((body) => { for (const e of body.series) { e.ratio_scale = "PERCENT"; e.points.forEach((p: Draft, i: number) => { p.value = ["0", "1.23", "-0.4"][i % 3]; }); } })).api, pick(A, B));
      await openReturn(container);
      await waitFor(() => expect(overlay(container).querySelectorAll("[data-testid='compare-line']")).toHaveLength(2));
      expect(screen.getByTestId("basis-caption").textContent).toContain("Return, a ratio stated as percent (100 is 100%)");
      const plot = overlay(container).querySelector("[role='group'][tabindex='0']") as HTMLElement;
      const seen = new Set<string>();
      fireEvent.keyDown(plot, { key: "Home" });
      for (let step = 0; step < 6; step += 1) {
        for (const node of overlay(container).querySelectorAll("[data-testid='compare-value']")) seen.add(node.textContent ?? "");
        fireEvent.keyDown(plot, { key: "ArrowRight" });
      }
      expect([...seen].some((text) => text.includes("1.23%"))).toBe(true);
    });

    it("a pick whose source states no scale is 'Not published (FE-013/033)' with the typed reason; nothing is drawn from the other pick", async () => {
      const { container } = mount(makeApi(returns((body) => {
        const template = seriesBodyFor(new URLSearchParams({ environment: "paper", metric: "RETURN", subjects: JSON.stringify([{ subject_type: "PORTFOLIO", subject_id: B }]), window: JSON.stringify("30D") }), "unavailable").series[0];
        body.series[1] = { ...template, subject: body.series[1].subject, reason_code: "RATIO_SCALE_NOT_PUBLISHED", quality: { ...template.quality, reasons: ["RATIO_SCALE_NOT_PUBLISHED"] } };
      })).api, pick(A, B));
      await openReturn(container);
      await waitFor(() => expect(overlay(container).textContent).toContain("RATIO_SCALE_NOT_PUBLISHED"));
      expect(overlay(container).textContent).toContain("Not published (FE-013/033)");
      expect(overlay(container).textContent).toContain("states no ratio scale");
      expect(overlay(container).querySelectorAll("svg")).toHaveLength(0);
    });
  });

  it("removing a pick below two stops asking and says what to do", async () => {
    const harness = makeApi(serving("populated"));
    const { container } = mount(harness.api, pick(A, B));
    await settled(container);
    fireEvent.click(chip("Alpha Book 2"));
    await waitFor(() => expect(overlay(container).textContent).toContain("Pick two comparable portfolios"));
    expect(harness.queriesOf("/manager/series")).toHaveLength(1);
  });
});
describe("metric table", () => {
  it("puts identity and the published scalars side by side, each in its own currency", async () => {
    mount(makeApi().api, pick(PF.satellite, PF.yen, PF.core));
    await loaded();
    const headers = within(screen.getByRole("table", { name: "Metrics" })).getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(["Metric", "Satellite", "Yen-Carry", "Core"]);
    expect(cell(row("Base currency"), "Satellite")).toBe("USDT");
    expect(cell(row("Base currency"), "Yen-Carry")).toBe("JPY");
    expect(cell(row("Owner"), "Satellite")).toBe("L. Nguyen");
    expect(cell(row("Domain"), "Core")).toBe("Real-funded and Simulated");
    expect(cell(row("Allocations"), "Satellite")).toBe("2");
    expect(cell(row("Deployments"), "Core")).toBe("5");
    expect(cell(row("Allocated capital"), "Satellite")).toContain("350,000.00");
    expect(cell(row("Allocated capital"), "Satellite")).toContain("USDT");
    expect(cell(row("Allocated capital"), "Yen-Carry")).toContain("48,000,000");
    expect(cell(row("Allocated capital"), "Yen-Carry")).toContain("JPY");
  });

  it("names the request behind NAV, Net PnL, Return, Max drawdown and Score in every column", async () => {
    mount(makeApi().api, pick(PF.satellite, PF.canary));
    await loaded();
    for (const column of ["Satellite", "Canary"]) {
      expect(cell(row("NAV"), column)).toBe("Not published (FE-013)");
      expect(cell(row("Net PnL"), column)).toBe("Not published (FE-005, FE-025)");
      expect(cell(row("Return"), column)).toBe("Not published (FE-006, FE-025)");
      expect(cell(row("Max drawdown"), column)).toBe("Not published (FE-013, FE-025)");
      expect(cell(row("Score"), column)).toBe("Not published (FE-011)");
    }
  });

  it("marks no best in a row: a mark would need a value it does not have", async () => {
    mount(makeApi().api, pick(PF.satellite, PF.canary));
    await loaded();
    expect(document.querySelector('[title="Best in row"]')).toBeNull();
    expect(document.body.textContent).not.toMatch(/best in/i);
  });

  it("carries a missing owner and an empty allocation as statements", async () => {
    mount(makeApi().api, pick(PF.empty, PF.satellite));
    await loaded();
    expect(cell(row("Owner"), "Pilot")).toBe("Not available · owner not published");
    expect(cell(row("Allocated capital"), "Pilot")).toBe("Not available · no allocation published");
  });

  it("stacks as cards: every cell carries its column label", async () => {
    mount(makeApi().api, pick(PF.satellite, PF.canary));
    await loaded();
    for (const tr of within(screen.getByRole("table", { name: "Metrics" })).getAllByRole("row").slice(1)) {
      expect([...tr.querySelectorAll("td")].map((td) => td.getAttribute("data-l"))).toEqual(["Metric", "Satellite", "Canary"]);
    }
  });

  it("asks to pick before it shows a table", async () => {
    mount(makeApi().api);
    await loaded();
    expect(screen.queryByRole("table", { name: "Metrics" })).toBeNull();
    expect(screen.getByText("Pick portfolios above to see their identity and allocation side by side.")).toBeTruthy();
  });

  it("never prints a dash or N/A as an absent value", async () => {
    mount(makeApi().api, pick(PF.empty, PF.satellite, PF.yen));
    await loaded();
    expect(document.body.textContent).not.toMatch(/—|–|N\/A/);
  });
});

describe("states and capability", () => {
  it("shows loading before the list answers", () => {
    mount({ listPortfolios: () => new Promise(() => undefined) } as unknown as ExecutionApi);
    expect(screen.getByRole("status", { name: "Loading" })).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Portfolios to compare" })).toBeNull();
  });

  it("shows a refused list as its state and offers no picks", async () => {
    mount(makeApi(() => ({ status: 503, body: {} })).api, pick(PF.core, PF.satellite));
    expect(await screen.findByText("Unavailable")).toBeTruthy();
    expect(screen.queryByRole("table", { name: "Metrics" })).toBeNull();
  });

  it("withholds the page, and reads nothing, without execution.portfolios.read", async () => {
    const { api, calls } = makeApi();
    mount(api, pick(PF.core), { capabilities: new Set([V2_CAPABILITY.accountsRead]) });
    expect(screen.getByText("Withheld")).toBeTruthy();
    expect(screen.getByRole("link", { name: "See what you can access" })).toBeTruthy();
    await new Promise((r) => setTimeout(r, 20));
    expect(calls).toEqual([]);
  });

  it("shows the page to a caller who holds the capability", async () => {
    mount(makeApi().api, "", { capabilities: new Set([V2_CAPABILITY.portfoliosRead]) });
    await loaded();
    expect(screen.getByRole("button", { name: "Portfolios" })).toBeTruthy();
  });

  it("caps the candidate chips at 100 and says how many are left out", async () => {
    const many: Override = (_m, path) => {
      if (path !== "/portfolios") return undefined;
      const items = Array.from({ length: 130 }, (_, i) => ({
        portfolio_id: `pf_scale_${String(i).padStart(4, "0")}`, name: `Scale ${String(i).padStart(4, "0")}`, owner: null, state: "ACTIVE", base_currency: "USDT",
        environments: ["live"], allocation_count: 1, deployment_count: 1, allocated_by_currency: [{ currency: "USDT", value: "1" }], updated_at: "2026-10-17T11:58:00Z",
      }));
      const base = makeApi().api;
      void base;
      return { status: 200, body: { schema_version: "execution.portfolio-list.v1", record_authority: "PORTAL_PROJECTION", source_authority: "TRADING_SYSTEM", delivery_profile: "ALL_EXECUTION_PROFILES", workspace_id: "w", environment: "all", read_at: "2026-10-17T12:04:01Z", source_as_of: "2026-10-17T12:04:00Z", freshness: "FRESH", completeness: "COMPLETE", environments: { live: { state: "AVAILABLE", reason_code: null } }, total_portfolios: 130, truncated: false, items } };
    };
    mount(makeApi(many).api);
    const group = await loaded();
    expect(within(group).getAllByRole("button")).toHaveLength(100);
    expect(screen.getByText("Showing 100 of 130 portfolios. Filter to see the rest.")).toBeTruthy();
  });
});
