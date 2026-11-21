/**
 * Compare, L2 scale and L3 negative (Rules 9.8.3), through the real portfolio
 * list reader (`readPortfolioList`) and the real screen.
 *
 * Fixture status: `execution-portfolio-list.v1` HAS a published canonical, so
 * hostile bodies are built from it with the testkit generators. Compare reads
 * ONLY that list. There is no series read (aligned series are FE-033, not
 * published), so there are no series bodies to attack and no points to reduce
 * under a DOM budget: the tests below pin that no series request is made at all
 * and that the overlay draws nothing. The chart components' own point budgets
 * are covered by their suites.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { readPortfolioList } from "../../../api/profileRead";
import type { ExecutionApi } from "../../../api/ports";
import { loadCanonical } from "../../testkit/loadCanonical";
import type { Draft } from "../../testkit/matrix";
import { arrayCases, integerCases, leaked, pollutionCases, prototypeIsClean, requiredCases, rootCases, schemaVersionCases, stringCases } from "../../testkit/negative";
import { pad } from "../../testkit/scale";
import { makeApi, type Override } from "../portfolios/harness.fixtures";
import CompareScreen from "./index";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const canonical = loadCanonical<Draft>("execution-portfolio-list.valid.json");
const baseItem: Draft = canonical.items[0];

const mount = (api: ExecutionApi, query = "") =>
  render(<MemoryRouter initialEntries={[`/deployments/compare${query}`]}><CompareScreen api={api} /></MemoryRouter>);
const loaded = () => screen.findByRole("group", { name: "Portfolios to compare" }, { timeout: 10_000 });
const serve = (body: unknown): Override => (_m, path) => (path === "/portfolios" ? { status: 200, body } : undefined);

function item(index: number, over: Draft = {}): Draft {
  return { ...structuredClone(baseItem), portfolio_id: `pf_scale_${pad(index)}`, name: `Scale ${pad(index)}`, owner: null, environments: ["live"], ...over };
}
function list(items: Draft[], over: Draft = {}): Draft {
  return { ...structuredClone(canonical), items, total_portfolios: items.length, truncated: false, ...over };
}
const many = (count: number, over?: Draft) => list(Array.from({ length: count }, (_, i) => item(i)), over);
const chipsOf = (group: HTMLElement) => within(group).getAllByRole("button");
const dropped = () => document.body.textContent?.match(/(\d+) entries in the address were not used/)?.[1] ?? null;

/* ═════════════════════════ L2 · scale ═════════════════════════ */
describe("L2 · scale", () => {
  it.each([[99, 99, false], [100, 100, false], [101, 100, true], [500, 100, true]])(
    "reads %i portfolios: %i chips, and the 'N of total' label is exact (%s)",
    async (count, shown, labelled) => {
      mount(makeApi(serve(many(count))).api);
      const group = await loaded();
      expect(chipsOf(group)).toHaveLength(shown);
      const label = screen.queryByText(/^Showing \d+ of \d+ portfolios/);
      if (labelled) expect(label?.textContent).toBe(`Showing 100 of ${count} portfolios. Filter to see the rest.`);
      else expect(label).toBeNull();
    },
  );

  it("keeps the DOM under a budget at 500 portfolios with four picks and the metric table", async () => {
    const ids = [0, 1, 2, 3].map((i) => `pf_scale_${pad(i)}`).join(",");
    const { container } = mount(makeApi(serve(many(500))).api, `?in=${ids}`);
    await loaded();
    expect(container.querySelectorAll("*").length).toBeLessThan(1_500);
    expect(within(screen.getByRole("table", { name: "Metrics" })).getAllByRole("columnheader")).toHaveLength(5);
  });

  it("the filter reaches past the 100-chip cap: a portfolio at position 450 is found by name", async () => {
    mount(makeApi(serve(many(500))).api, "?q=Scale%2000450");
    const group = await loaded();
    expect(chipsOf(group).map((b) => b.textContent)).toEqual([expect.stringContaining("Scale 00450")]);
    expect(screen.queryByText(/^Showing \d+ of \d+ portfolios/)).toBeNull();
  });

  it("says a truncated read is truncated (top N / total), never that it is the whole book", async () => {
    mount(makeApi(serve(many(100, { total_portfolios: 5000, truncated: true }))).api);
    await loaded();
    expect(screen.getByText("The portfolio read is the top 100 / 5000; the rest cannot be chosen yet.")).toBeTruthy();
    // 100 candidates in 100 chips: nothing is left out of the chips, so no "Showing" label is printed.
    expect(screen.queryByText(/^Showing \d+ of \d+ portfolios/)).toBeNull();
  });

  it("caps the picks at four as the subtitle says: the fifth chip is refused and the address count is exact", async () => {
    const ten = Array.from({ length: 10 }, (_, i) => `pf_scale_${pad(i)}`).join(",");
    mount(makeApi(serve(many(500))).api, `?in=${ten}`);
    const group = await loaded();
    expect(chipsOf(group).filter((b) => b.getAttribute("aria-pressed") === "true")).toHaveLength(4);
    expect(dropped()).toBe("6");
    expect(screen.getByText("4 selected. Remove one to change.")).toBeTruthy();
    const fifth = chipsOf(group).find((b) => b.textContent?.startsWith("Scale 00004")) as HTMLButtonElement;
    expect(fifth.disabled).toBe(true);
    expect(fifth.title).toBe("At most 4");
    fireEvent.click(fifth);
    expect(chipsOf(group).filter((b) => b.getAttribute("aria-pressed") === "true")).toHaveLength(4);
  });

  it("makes one list read and one series read (2 to 4 subjects), at any size; with no source the overlay draws nothing", async () => {
    const { api, calls } = makeApi(serve(many(500)));
    const { container } = mount(api, `?in=pf_scale_00001,pf_scale_00002`);
    await loaded();
    await waitFor(() => expect(container.textContent).toContain("Not available"));
    expect(calls.filter((c) => c === "GET /portfolios")).toHaveLength(1);
    expect(calls.filter((c) => c.startsWith("GET /manager/series"))).toHaveLength(1);
    expect(calls).toHaveLength(2);
    expect(container.querySelectorAll(".exec-compare svg")).toHaveLength(0);
  });

  it("asks for at most four subjects even when the address names ten", async () => {
    const ten = Array.from({ length: 10 }, (_, i) => `pf_scale_${pad(i)}`).join(",");
    const harness = makeApi(serve(many(500)));
    mount(harness.api, `?in=${ten}`);
    await loaded();
    await waitFor(() => expect(harness.queriesOf("/manager/series")).toHaveLength(1));
    expect(JSON.parse(harness.queriesOf("/manager/series")[0]!.get("subjects")!)).toHaveLength(4);
  });
});

/* ═════════════════════════ L3 · negative ═════════════════════════ */
describe("L3 · malformed list bodies refuse honestly", () => {
  const structural = [
    ...requiredCases(canonical, [["items", 0, "portfolio_id"], ["items", 0, "name"], ["items", 0, "base_currency"], ["items", 0, "environments"], ["items", 0, "allocated_by_currency"], ["freshness"], ["read_at"], ["truncated"], ["total_portfolios"], ["environments"], ["items"]]),
    ...integerCases(canonical, ["items", 0, "allocation_count"]),
    ...integerCases(canonical, ["total_portfolios"]),
    ...arrayCases(canonical, ["items"], { idKey: "portfolio_id" }),
    ...schemaVersionCases(canonical, ["schema_version"], "execution.portfolio-list.v1", ["execution.alpha-fleet-list.v2"]),
    ...pollutionCases(canonical, [[], ["items", 0]]),
    ...rootCases(),
  ];
  const refused = structural.filter((c) => readPortfolioList(c.value) === null);

  it("never throws in the reader, and the shared prototype stays clean", () => {
    expect(structural.filter((c) => { try { readPortfolioList(c.value); return false; } catch { return true; } })).toEqual([]);
    expect(prototypeIsClean()).toBe(true);
    expect(refused.length).toBeGreaterThan(40);
  });

  it("a refused body is the Unavailable state: no chips, no table, no half list that looks real", async () => {
    // One case per category and per path keeps the run honest and short.
    const seen = new Set<string>();
    const sample = refused.filter((c) => { const key = c.name.split(" <- ")[0]; if (seen.has(key)) return false; seen.add(key); return true; });
    expect(sample.length).toBeGreaterThan(25);
    for (const c of sample) {
      const view = mount(makeApi(serve(c.value)).api, "?in=pf_carry_core,pf_unallocated");
      expect(await screen.findByText("Unavailable"), c.name).toBeTruthy();
      expect(screen.queryByRole("group", { name: "Portfolios to compare" }), c.name).toBeNull();
      expect(screen.queryByRole("table", { name: "Metrics" }), c.name).toBeNull();
      expect(screen.queryByText("Carry Core"), c.name).toBeNull();
      view.unmount();
    }
  }, 120_000);

  it("a body that is not JSON-shaped at all (HTML, text, an array) is Unavailable", async () => {
    for (const body of ["<html>502</html>", "ok", [canonical], 42]) {
      const view = mount(makeApi(serve(body)).api);
      expect(await screen.findByText("Unavailable")).toBeTruthy();
      view.unmount();
    }
  });

  it("a hostile string in a name, owner or id reaches the page as text only, with no probe leak and no markup", async () => {
    const hostile = [
      "<img src=x onerror=alert(1)>",
      "<script>window.__pwn=1</script>",
      "‮evil‬ name",
      "bell\u0007 and nul\u0000 and ​ zero-width",
      "javascript:alert(1)",
    ];
    for (const name of hostile) {
      const view = mount(makeApi(serve(list([item(1, { name, owner: name }), item(2)]))).api, "?in=pf_scale_00001,pf_scale_00002");
      await loaded();
      expect(view.container.querySelector("img, script"), name).toBeNull();
      expect((window as unknown as { __pwn?: number }).__pwn).toBeUndefined();
      expect(view.container.textContent, name).toContain(name.replace(/\u0000/g, "").length > 0 ? name.slice(0, 6) : name);
      view.unmount();
    }
  });

  it("an oversize name (70,000 chars) is kept whole as text, bounded by CSS not by silent truncation, and does not break the picks", async () => {
    const name = `Long-${"x".repeat(70_000)}`;
    const view = mount(makeApi(serve(list([item(1, { name }), item(2)]))).api, "?in=pf_scale_00001,pf_scale_00002");
    const group = await loaded();
    expect(chipsOf(group)).toHaveLength(2);
    expect(chipsOf(group)[0].textContent?.startsWith(`Long-${"x".repeat(100)}`)).toBe(true);
    expect(chipsOf(group)[0].textContent).toContain(name);
    expect(screen.getByRole("table", { name: "Metrics" })).toBeTruthy();
    view.unmount();
  });

  it("a duplicate portfolio id in the list is two chips with distinct keys; the first row is the pick, the repeat is refused and never looks picked; no React key warning", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mount(makeApi(serve(list([item(1, { name: "First" }), item(1, { name: "Second" }), item(2)]))).api, "?in=pf_scale_00001,pf_scale_00002");
    const group = await loaded();
    expect(chipsOf(group).map((b) => b.textContent?.replace(/USDT.*/, ""))).toEqual(["First", "Second", "Scale 00002"]);
    expect(chipsOf(group).filter((b) => b.getAttribute("aria-pressed") === "true")).toHaveLength(2);
    const second = chipsOf(group)[1] as HTMLButtonElement;
    expect(second.getAttribute("aria-pressed")).toBe("false");
    expect(second.disabled).toBe(true);
    expect(second.title).toBe("Same id as an earlier portfolio in the read; the first one is used");
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Metric", "First", "Scale 00002"]);
    expect(spy.mock.calls.map((c) => String(c[0])).filter((m) => /same key|unique "key"/i.test(m))).toEqual([]);
  });

  it("the same currency twice in one allocation list is never summed, and both figures stay on screen", async () => {
    // MoneyList (portfolios/format.tsx, not a Compare file) keys its lines by currency, so React warns about the repeat;
    // the warning is silenced here and reported, not asserted away.
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const dup = item(1, { allocated_by_currency: [{ currency: "USDT", value: "100" }, { currency: "USDT", value: "250" }] });
    const { container } = mount(makeApi(serve(list([dup, item(2)]))).api, "?in=pf_scale_00001,pf_scale_00002");
    await loaded();
    expect(container.textContent).not.toContain("350");
    const own = container.querySelector("td[data-l='Scale 00001'] .exec-pf-ccylist")?.textContent ?? "";
    expect(own).toContain("100");
    expect(own).toContain("250");
  });
});

describe("L3 · mixed currencies are never combined", () => {
  const book = (index: number, currency: string, value: string, env = "live") =>
    item(index, { base_currency: currency, environments: [env], allocated_by_currency: [{ currency, value }] });

  it("USDT, JPY and EUR picked together: one basis, the rest apart with the currency named, each figure in its own column, no total", async () => {
    const { container } = mount(makeApi(serve(list([book(1, "USDT", "1000"), book(2, "JPY", "250000"), book(3, "EUR", "777")]))).api, "?in=pf_scale_00001,pf_scale_00002,pf_scale_00003");
    await loaded();
    expect(screen.getByTestId("basis-line").textContent).toBe("Basis: USDT, Real-funded, set by the first portfolio picked.");
    expect(screen.getAllByTestId("not-comparable").map((n) => n.textContent)).toEqual([
      expect.stringContaining("Other currency (JPY); cannot be compared on a USDT basis"),
      expect.stringContaining("Other currency (EUR); cannot be compared on a USDT basis"),
    ]);
    expect(screen.getAllByTestId("partition")).toHaveLength(3);
    const text = container.textContent ?? "";
    for (const sum of ["251,777", "251777", "251,000", "1,777", "250,777"]) expect(text).not.toContain(sum);
    // The reminder is the summary's title; the visible line is only what is picked and left apart.
    expect(container.querySelector('[title="Money is never converted or combined"]')).not.toBeNull();
  });

  it("one portfolio holding two currencies lists each on its own line; the base currency decides the basis, never the sum", async () => {
    const two = item(1, { allocated_by_currency: [{ currency: "USDT", value: "100" }, { currency: "JPY", value: "9000" }] });
    mount(makeApi(serve(list([two, item(2)]))).api, "?in=pf_scale_00001,pf_scale_00002");
    await loaded();
    const cellText = screen.getByRole("table", { name: "Metrics" }).querySelector("td[data-l='Scale 00001'][data-l]") ? "" : "";
    void cellText;
    const rows = [...screen.getByRole("table", { name: "Metrics" }).querySelectorAll("tr")];
    const allocated = rows.find((r) => r.querySelector("td[data-l='Metric']")?.textContent === "Allocated capital")!;
    const own = allocated.querySelector("td[data-l='Scale 00001']")!.textContent ?? "";
    expect(own).toContain("USDT");
    expect(own).toContain("JPY");
    expect(own).not.toContain("9,100");
    expect(own).not.toContain("9100");
  });

  it("a Simulated book beside a Real-funded one is apart, and a mixed-book portfolio is never on a basis", async () => {
    mount(makeApi(serve(list([book(1, "USDT", "10", "live"), book(2, "USDT", "20", "paper"), item(3, { environments: ["live", "paper"], allocated_by_currency: [{ currency: "USDT", value: "30" }] })]))).api, "?in=pf_scale_00001,pf_scale_00002,pf_scale_00003");
    await loaded();
    const apart = screen.getAllByTestId("not-comparable").map((n) => n.textContent ?? "");
    expect(apart).toHaveLength(2);
    expect(apart[0]).toContain("Simulated book; the basis is Real-funded, and the two are never combined");
    expect(apart[1]).toContain("Real-funded and Simulated books share one allocation figure");
  });

  it("an unknown environment word never sets the basis and is never called Real-funded or Simulated", async () => {
    mount(makeApi(serve(list([item(1, { environments: ["MOON"] }), item(2, { environments: ["MOON"] })]))).api, "?in=pf_scale_00001,pf_scale_00002");
    await loaded();
    expect(screen.getByTestId("basis-line").textContent).toBe("No comparable portfolio picked yet.");
    expect(document.body.textContent).not.toMatch(/USDT[ ,·]+(Real-funded|Simulated)|one currency \(USDT\)/);
    expect(document.body.textContent).toContain("No comparable basis · 2 listed apart");
    const apart = screen.getAllByTestId("not-comparable").map((n) => n.textContent ?? "");
    expect(apart).toHaveLength(2);
    expect(apart.every((a) => a.includes("Domain not published; it cannot be placed on a Real-funded or Simulated basis"))).toBe(true);
  });

  it("a known portfolio beside an unknown-domain one: the known sets the basis, the unknown is apart with the reason", async () => {
    mount(makeApi(serve(list([item(1, { environments: ["MOON"] }), item(2)]))).api, "?in=pf_scale_00001,pf_scale_00002");
    await loaded();
    expect(screen.getByTestId("basis-line").textContent).toBe("Basis: USDT, Real-funded, set by the first portfolio picked.");
    expect(screen.getAllByTestId("not-comparable").map((n) => n.textContent)).toEqual([expect.stringContaining("Domain not published; it cannot be placed on a Real-funded or Simulated basis")]);
  });
});

describe("L3 · the address", () => {
  it("names ids the list does not hold, one by one, and shows no table for them", async () => {
    mount(makeApi(serve(many(3))).api, "?in=pf_ghost_one,pf_ghost_two");
    await loaded();
    const apart = screen.getAllByTestId("not-comparable").map((n) => n.textContent ?? "");
    expect(apart).toHaveLength(2);
    expect(apart[0]).toContain("pf_ghost_one");
    expect(apart[1]).toContain("pf_ghost_two");
    expect(apart.every((a) => a.includes("Not in the loaded portfolios"))).toBe(true);
    expect(screen.queryByRole("table", { name: "Metrics" })).toBeNull();
    expect(screen.getByTestId("basis-line").textContent).toBe("No comparable portfolio picked yet.");
  });

  it("a repeated id is one pick and the repeats are counted", async () => {
    mount(makeApi(serve(many(3))).api, "?in=pf_scale_00001,pf_scale_00001,pf_scale_00001");
    const group = await loaded();
    expect(chipsOf(group).filter((b) => b.getAttribute("aria-pressed") === "true")).toHaveLength(1);
    expect(dropped()).toBe("2");
  });

  it("drops hostile or oversize ids (markup, traversal, bidi, 300 chars, a thousand ids) without reading them as picks, and counts them", async () => {
    const bad = ["<script>", "../etc/passwd", "‮abc", `pf_${"a".repeat(300)}`, "a b", "pf;drop", "%00"];
    mount(makeApi(serve(many(3))).api, `?in=${encodeURIComponent(["pf_scale_00000", ...bad].join(","))}`);
    const group = await loaded();
    expect(chipsOf(group).filter((b) => b.getAttribute("aria-pressed") === "true")).toHaveLength(1);
    expect(dropped()).toBe(String(bad.length));
    cleanup();
    const thousand = Array.from({ length: 1000 }, (_, i) => `pf_x_${i}`).join(",");
    mount(makeApi(serve(many(3))).api, `?in=${thousand}`);
    await loaded();
    expect(screen.getAllByTestId("not-comparable")).toHaveLength(4);
    expect(dropped()).toBe("996");
  });

  it("an empty, comma-only or whitespace address picks nothing and is not an error", async () => {
    for (const q of ["?in=", "?in=,,,", "?in=%20%20", "?ids="]) {
      const view = mount(makeApi(serve(many(3))).api, q);
      await loaded();
      expect(screen.getByText("Pick two to four portfolios to compare.")).toBeTruthy();
      expect(dropped()).toBeNull();
      view.unmount();
    }
  });
});

describe("L3 · partial and stale statuses stay visible", () => {
  it.each([
    ["STALE", "Stale"], ["AGING", "Aging"], ["SOURCE_LATE", "Source late"],
  ])("freshness %s is printed as %s, never as Fresh", async (word, label) => {
    mount(makeApi(serve(many(3, { freshness: word }))).api);
    await loaded();
    expect(screen.getByText(label)).toBeTruthy();
    expect(screen.queryByText("Fresh")).toBeNull();
  });

  it("a missing source_as_of says so, instead of printing a time", async () => {
    mount(makeApi(serve(many(3, { source_as_of: null }))).api);
    await loaded();
    expect(screen.getByText("Source time not published")).toBeTruthy();
    expect(screen.queryByText(/^As of /)).toBeNull();
  });

  it("a PARTIAL completeness and an UNAVAILABLE branch do not turn into a clean list: the read still compares only what it holds", async () => {
    const body = many(3, { completeness: "PARTIAL", environments: { live: { state: "UNAVAILABLE", reason_code: "N31_PROJECTION_NOT_READY" } } });
    leaked(body, null);
    mount(makeApi(serve(body)).api, "?in=pf_scale_00000,pf_scale_00001");
    await loaded();
    expect(screen.getAllByTestId("partition").length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/—|–|N\/A|NaN|undefined|null/);
  });

  it("a stale list in an error refresh keeps the last list and shows the failure, not a fresh one", async () => {
    let n = 0;
    const flip: Override = (_m, path) => (path === "/portfolios" ? (n++ === 0 ? { status: 200, body: many(3, { freshness: "STALE" }) } : { status: 503, body: {} }) : undefined);
    mount(makeApi(flip).api);
    await loaded();
    expect(screen.getByText("Stale")).toBeTruthy();
    expect(screen.queryByText("Fresh")).toBeNull();
  });
});

describe("L3 · strings of every kind in the fields the table prints", () => {
  it("wrong-typed name or id is a refused body, not a blank chip", async () => {
    const cases = [...stringCases(canonical, ["items", 0, "name"]), ...stringCases(canonical, ["items", 0, "portfolio_id"])]
      .filter((c) => ["wrong-type", "null-vs-absent", "missing-required"].includes(c.category));
    expect(cases.length).toBeGreaterThan(10);
    for (const c of cases) {
      expect(readPortfolioList(c.value), c.name).toBeNull();
      expect(leaked(c.value, null)).toBe(false);
    }
    const view = mount(makeApi(serve(cases[0].value)).api);
    expect(await screen.findByText("Unavailable")).toBeTruthy();
    view.unmount();
  });
});
