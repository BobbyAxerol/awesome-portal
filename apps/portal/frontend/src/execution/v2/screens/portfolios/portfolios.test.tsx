/**
 * The Portfolios register against the Playwright double, through the real
 * readers: columns, exact per-currency strings, Not published cells with their
 * request ids, the Unallocated row, the Compare selection in the URL, the
 * column chooser, filters and sort on the loaded rows, and every state the
 * screen must keep apart.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { SLOW } from "../../waitsTestUtil";

import { PF, answerPortfolios } from "../../../../../e2e/bffDoublePortfolios";
import type { ExecutionApi } from "../../../api/ports";
import { V2_NAV_TOKEN } from "../../shell/roleNav";
import { makeApi, type Override } from "./harness.fixtures";
import PortfolioListScreen, { PORTFOLIOS_SCREEN_KEY } from "./index";
import { COMPARE_OFF_REASON, DEFAULT_ROUTES } from "./routes";
import { whyText } from "../../gapWhyTestUtil";

afterEach(cleanup);

function Where() {
  const { pathname, search } = useLocation();
  return <output data-testid="where">{pathname + search}</output>;
}

const mount = (api: ExecutionApi, entry = "/deployments/portfolios", capabilities?: ReadonlySet<string>) =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <PortfolioListScreen api={api} capabilities={capabilities} />
      <Where />
    </MemoryRouter>,
  );

const where = () => screen.getByTestId("where").textContent ?? "";
const search = () => new URLSearchParams(where().split("?")[1] ?? "");
const table = () => screen.getByRole("table", { name: "Portfolios" });
const loaded = () => screen.findByRole("table", { name: "Portfolios" }, SLOW);
const bodyRows = () => within(table()).getAllByRole("row").slice(1);
// A windowed column's label ends with its window (`Net PnL · 90D`): match the name, exact for the others.
const cell = (row: HTMLElement, label: string) => (row.querySelector(`td[data-l='${label}']`) ?? row.querySelector(`td[data-l^='${label} \u00b7 ']`))?.textContent ?? "";
const names = () => bodyRows().map((row) => row.querySelector(".exec-pf-title")?.textContent ?? "");

describe("register", () => {
  it("is the portfolios flag's screen", () => {
    expect(PORTFOLIOS_SCREEN_KEY).toBe("portfolios");
  });

  it("lists the six rows, real portfolios by name and Unallocated last", async () => {
    mount(makeApi().api, "/deployments/portfolios?hide=none");
    await loaded();
    expect(names()).toEqual(["Canary", "Core", "Pilot", "Satellite", "Yen-Carry", "Unallocated"]);
    const core = bodyRows().find((r) => r.textContent?.includes("Core"))!;
    expect(cell(core, "Manager")).toBe("M. Tran");
    expect(cell(core, "Allocations")).toBe("5");
    // Alphas / Dep.: the alpha count comes from the dataset group (not served here), the deployment count from the read.
    expect(cell(core, "Alphas / Dep.")).toBe("Not available · alpha count not published / 5");
    expect(cell(core, "Domain")).toContain("Real-funded and Simulated");
    expect(cell(core, "Domain")).toContain("paper, live");
    expect(cell(core, "Health")).toContain("Active");
  });

  it("prints allocated capital as exact per-currency strings and adds nothing", async () => {
    mount(makeApi().api);
    await loaded();
    const rows = bodyRows();
    const money = (name: string) => cell(rows.find((r) => r.textContent?.includes(name))!, "Allocated capital");
    // A figure in the row's own base currency prints as the bare number (the identity cell states the base); the unit is on the title.
    expect(money("Core")).toContain("540,000.00");
    expect(money("Yen-Carry")).toContain("48,000,000");
    const unitOf = (name: string) => [...bodyRows().find((r) => r.textContent?.includes(name))!.querySelectorAll("td[data-l='Allocated capital'] .exec-pf-num")].map((n) => n.getAttribute("title"));
    expect(unitOf("Core").join(" ")).toContain("540000.00 USDT");
    expect(unitOf("Yen-Carry").join(" ")).toContain("48000000 JPY");
    // The exact original rides on the title; no total exists anywhere.
    const exact = [...table().querySelectorAll(".exec-pf-num")].map((n) => n.getAttribute("data-full"));
    expect(exact).toEqual(expect.arrayContaining(["540000.00", "350000.00", "48000000"]));
    expect(document.body.textContent).not.toMatch(/Total (allocated|capital)/i);
  });

  it("flags a portfolio whose one allocation figure spans Real-funded and Simulated books", async () => {
    mount(makeApi().api);
    await loaded();
    const rows = bodyRows();
    expect(cell(rows.find((r) => r.textContent?.includes("Core"))!, "Allocated capital")).toContain("Real-funded and Simulated books together");
    expect(cell(rows.find((r) => r.textContent?.includes("Satellite"))!, "Allocated capital")).not.toContain("books together");
  });

  it("says what an empty allocation and a missing owner are, never a zero or a dash", async () => {
    mount(makeApi().api, "/deployments/portfolios?hide=none");
    await loaded();
    const pilot = bodyRows().find((r) => r.textContent?.includes("Pilot"))!;
    expect(cell(pilot, "Allocated capital")).toBe("Not available · no allocation published");
    expect(whyText(pilot.querySelector("td[data-l='Allocated capital']"))).toBe("no allocation published");
    expect(cell(pilot, "Manager")).toBe("Not available · owner not published");
    expect(whyText(pilot.querySelector("td[data-l='Manager']"))).toBe("owner not published");
    expect(cell(pilot, "Allocations")).toBe("0");
  });

  it("keeps Economic capital, Net PnL, Return, Drawdown, HHI and Portfolio score as columns (hi-fi), each cell Not available with its request id when no group is served; Score is named once", async () => {
    mount(makeApi().api, "/deployments/portfolios?hide=none");
    await loaded();
    const ids: Record<string, string> = {
      "Economic capital": "FE-013", "Net PnL": "FE-005, FE-025", Return: "FE-006, FE-025", Drawdown: "FE-013, FE-025", HHI: "FE-005", "Portfolio score": "FE-011",
    };
    for (const row of bodyRows()) {
      for (const [label, id] of Object.entries(ids)) {
        const td = row.querySelector(`td[data-l="${label}"], td[data-l^="${label} \u00b7 "]`);
        expect(td, label).not.toBeNull();
        expect(td?.textContent, label).toContain("Not available");
        expect(td?.textContent, label).toContain(`Not published (${id})`);
      }
    }
    const line = screen.getByTestId("not-available-line");
    expect(screen.getAllByTestId("not-available-line")).toHaveLength(1);
    expect(line.textContent).toContain("Not available: Score");
    expect(whyText(line)).toContain("Not published (FE-011)");
  });

  it("treats Unallocated as a bucket: not linked, not selectable, every figure Not published", async () => {
    mount(makeApi().api, "/deployments/portfolios?hide=none");
    await loaded();
    const una = bodyRows().find((r) => r.textContent?.includes("Unallocated"))!;
    expect(una.querySelector("a")).toBeNull();
    const box = una.querySelector("input[type=checkbox]") as HTMLInputElement;
    expect(box.disabled).toBe(true);
    expect(box.title).toContain("nothing to compare");
    expect(cell(una, "Allocated capital")).toBe("Not published");
    expect(cell(una, "Domain")).toContain("Not available");
    expect(cell(una, "Health")).toContain("Unknown");
  });

  it("links a portfolio to its 360 and keeps the context params on the link", async () => {
    mount(makeApi().api, "/deployments/portfolios?env=paper&window=30d");
    await loaded();
    const link = within(bodyRows().find((r) => r.textContent?.includes("Core"))!).getByRole("link", { name: "Core" });
    const href = link.getAttribute("href")!;
    expect(href.startsWith(`/deployments/portfolios/${PF.core}`)).toBe(true);
    expect(href).toContain("env=paper");
    expect(href).toContain("window=30d");
  });

  it("opens with Domain, Alphas / Dep., Allocations and HHI hidden (the register fits 1440); the chooser brings one back and the address remembers it", async () => {
    mount(makeApi().api);
    await loaded();
    for (const row of bodyRows()) {
      expect([...row.querySelectorAll("td")].map((td) => td.getAttribute("data-l"))).toEqual([
        "Compare", "Portfolio", "Manager", "Economic capital", "Allocated capital",
        "Net PnL \u00b7 90D", "Return \u00b7 90D", "Drawdown \u00b7 90D", "Portfolio score \u00b7 90D", "Health",
      ]);
    }
    expect(search().has("hide")).toBe(false);
    const menu = screen.getByRole("group", { name: "Columns" });
    expect((within(menu).getByRole("checkbox", { name: "Domain" }) as HTMLInputElement).checked).toBe(false);
    fireEvent.click(within(menu).getByRole("checkbox", { name: "Domain" }));
    expect(search().get("hide")).toBe("alphas,allocations,hhi");
    expect(cell(bodyRows()[0], "Domain")).not.toBe("");
    fireEvent.click(within(menu).getByRole("checkbox", { name: "Domain" }));
    expect(search().has("hide")).toBe(false);
  });

  it("marks every cell with its column label, so the same markup stacks as cards at 660px and below", async () => {
    mount(makeApi().api, "/deployments/portfolios?hide=none");
    await loaded();
    for (const row of bodyRows()) {
      expect([...row.querySelectorAll("td")].map((td) => td.getAttribute("data-l"))).toEqual([
        "Compare", "Portfolio", "Manager", "Alphas / Dep.", "Allocations", "Domain", "Economic capital", "Allocated capital",
        "Net PnL \u00b7 90D", "Return \u00b7 90D", "Drawdown \u00b7 90D", "HHI", "Portfolio score \u00b7 90D", "Health",
      ]);
    }
    expect(table().className).toContain("exec-cards");
  });

  it("never renders a dash, N/A or a bare zero as an absent value", async () => {
    mount(makeApi().api);
    const { container } = { container: document.body };
    await loaded();
    expect(container.textContent).not.toMatch(/—|–|N\/A/);
    // Every cell says something, except the select column, whose content is a checkbox.
    const cells = [...document.querySelectorAll("td")].filter((td) => td.querySelector("input") === null).map((td) => (td.textContent ?? "").trim());
    expect(cells.filter((t) => /^-?$/.test(t))).toEqual([]);
  });
});

describe("header, banners and footer", () => {
  it("states freshness, the read's clock, the partial read and the branch that is not whole", async () => {
    mount(makeApi().api);
    await loaded();
    // The freshness chip is always drawn (hi-fi "Fresh"), beside the as-of line; a tier that is not fresh wears its own word (conformance matrix).
    expect(screen.getByText("Fresh")).toBeTruthy();
    expect(screen.getByText(/As of 17 Oct/)).toBeTruthy();
    // UXM07-048/10: one banner. The branch that is not whole names what is missing; the partial read's sentence is its disclosure
    expect(screen.queryByText("Some portfolios or figures may be missing")).toBeNull();
    expect(document.querySelectorAll(".exec-pf-banner-line")).toHaveLength(1);
    expect(document.querySelectorAll(".exec-pf-banner .exec-blk-why-btn")).toHaveLength(1);
    const branch = screen.getByText(/Paper: Partial \(the data feed is running behind\)/);
    expect(branch).toBeTruthy();
    expect(branch.textContent).not.toMatch(/N31_|_LAGGING/);
    expect(whyText(branch.closest(".exec-pf-banner-line")!)).toBe("Reason code: N31_PROJECTION_LAGGING\nThe read is partial");
    expect(screen.queryByText(/Names and allocation only/)).toBeNull();
  });

  it("says top N / total when the read is truncated; there is no Load more to press, the one line says why", async () => {
    mount(makeApi().api);
    await loaded();
    expect(screen.getAllByText("Top 6 / 9 portfolios").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
    expect(screen.getByText(/no cursor/)).toBeTruthy();
  });

  it("has no Load more when the read is whole", async () => {
    const whole: Override = (_m, path) => {
      if (path !== "/portfolios") return undefined;
      const base = answerPortfolios("GET", path)!;
      return { status: 200, body: { ...(base.body as object), truncated: false, total_portfolios: 6 } };
    };
    mount(makeApi(whole).api);
    await loaded();
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
    expect(screen.getAllByText("6 portfolios").length).toBeGreaterThan(0);
  });

  it("never adds a total NAV for the set: every Economic capital cell is Not available", async () => {
    mount(makeApi().api);
    await loaded();
    expect(screen.queryByText(/Total NAV/)).toBeNull();
    for (const row of bodyRows()) expect(cell(row, "Economic capital")).toContain("Not available");
  });

  it("switches to a compact table from the toolbar and the URL", async () => {
    mount(makeApi().api);
    await loaded();
    const button = screen.getByRole("button", { name: "Compact" });
    expect(button.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(button);
    expect(search().get("density")).toBe("compact");
    expect(screen.getByRole("region", { name: "Portfolio register" }).getAttribute("data-density")).toBe("compact");
    fireEvent.click(screen.getByRole("button", { name: "Compact" }));
    expect(search().has("density")).toBe(false);
  });

  it("explains the sort and basis rules", async () => {
    mount(makeApi().api);
    await loaded();
    fireEvent.click(screen.getByText("Sort and basis rules"));
    expect(screen.getByText("Sorts inside one currency; pick the currency first")).toBeTruthy();
  });
});

describe("search, domain, currency and sort", () => {
  it("searches name, id and owner after a pause, writes q to the URL and counts what it shows", async () => {
    mount(makeApi().api);
    await loaded();
    fireEvent.change(screen.getByPlaceholderText("Search portfolio or owner"), { target: { value: "nguyen" } });
    await waitFor(() => expect(search().get("q")).toBe("nguyen"), SLOW);
    expect(names()).toEqual(["Canary", "Satellite"]);
    expect(screen.getAllByText("2 of the top 6 / 9 portfolios").length).toBeGreaterThan(0);
    expect(screen.getByText("Filters cover the 6 loaded portfolios only.").getAttribute("title")).toContain("carry no sort or filter of their own");
  });

  it("filters by domain; a mixed portfolio belongs to both", async () => {
    mount(makeApi().api);
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: /^Real-funded/ }));
    expect(search().get("domain")).toBe("real");
    expect(names()).toEqual(["Core", "Satellite"]);
    fireEvent.click(screen.getByRole("button", { name: /^Simulated/ }));
    expect(names()).toEqual(["Canary", "Core", "Pilot", "Yen-Carry", "Unallocated"]);
    fireEvent.click(screen.getByRole("button", { name: /^All\s*\d/ }));
    expect(search().has("domain")).toBe(false);
  });

  it("says so, and offers to clear, when nothing matches", async () => {
    mount(makeApi().api, "/deployments/portfolios?q=zzzz");
    await loaded();
    expect(screen.getByText("No portfolios match these filters.")).toBeTruthy();
    fireEvent.click(within(table()).getByRole("button", { name: "Clear filters" }));
    expect(search().has("q")).toBe(false);
    expect(names()).toHaveLength(6);
  });

  it("sorts money only inside one currency; rows with none sort last in both directions", async () => {
    mount(makeApi().api, "/deployments/portfolios?ccy=usdt&sort=allocated:desc");
    await loaded();
    expect(names()).toEqual(["Core", "Satellite", "Canary", "Pilot", "Yen-Carry", "Unallocated"]);
    fireEvent.click(screen.getByRole("button", { name: /Sort direction/ }));
    expect(search().get("sort")).toBe("allocated:asc");
    expect(names()).toEqual(["Canary", "Satellite", "Core", "Pilot", "Yen-Carry", "Unallocated"]);
  });

  it("sorts from the column heads: another column ascending first, the same column flips, aria-sort follows (P-B4)", async () => {
    mount(makeApi().api);
    await loaded();
    const head = (name: string) => within(table()).getByRole("columnheader", { name });
    expect(head("Manager").getAttribute("aria-sort")).toBeNull();
    fireEvent.click(within(head("Manager")).getByRole("button"));
    expect(search().get("sort")).toBe("owner:asc");
    expect(head("Manager").getAttribute("aria-sort")).toBe("ascending");
    fireEvent.click(within(head("Manager")).getByRole("button"));
    expect(search().get("sort")).toBe("owner:desc");
    expect(head("Manager").getAttribute("aria-sort")).toBe("descending");
    // Money sorts inside one currency: with none chosen the head is not a control and says why.
    expect(within(head("Allocated capital")).queryByRole("button")).toBeNull();
    expect(head("Allocated capital").getAttribute("title")).toBe("Money sorts inside one currency; pick the currency first");
    // Money measures sort inside one currency too: Economic capital and Net PnL are not controls until a currency is picked.
    expect(within(head("Economic capital")).queryByRole("button")).toBeNull();
    expect(within(head("Net PnL \u00b7 90D")).queryByRole("button")).toBeNull();
    // Unit-free measures sort from the head, null-last.
    expect(within(head("Portfolio score \u00b7 90D")).getByRole("button")).toBeTruthy();
  });

  it("does not repeat the Context or the domain under the title: the bar and the Domain control already say them", async () => {
    mount(makeApi().api);
    await loaded();
    expect(document.querySelector(".exec-pf-sub")!.textContent).toBe("Top 6 / 9 portfolios");
  });

  const whole: Override = (_m, path) => {
    if (path !== "/portfolios") return undefined;
    const base = answerPortfolios("GET", path)!;
    return { status: 200, body: { ...(base.body as object), truncated: false, total_portfolios: 6 } };
  };
  const sub = () => document.querySelector(".exec-pf-sub")!.textContent ?? "";

  it("names the domain filter and what is shown out of what was loaded, instead of 'showing all domains' (honesty)", async () => {
    mount(makeApi(whole).api, "/deployments/portfolios?domain=simulated");
    await loaded();
    expect(sub()).not.toContain("showing all domains");
    expect(screen.getByRole("button", { name: /^Simulated/ }).getAttribute("aria-pressed")).toBe("true");
    expect(sub()).toContain(`${names().length} of 6 loaded portfolios`);
    expect(names().length).toBeLessThan(6);
  });

  it("counts what the search leaves, and still says all domains when no domain filter is set", async () => {
    mount(makeApi(whole).api, "/deployments/portfolios?q=core");
    await loaded();
    expect(sub()).toContain("1 of 6 loaded portfolios");
    expect(screen.getByRole("button", { name: /^All\s*\d/ }).getAttribute("aria-pressed")).toBe("true");
  });

  it("on a truncated read a narrowing filter says N of the top M / total, and the unfiltered line is unchanged", async () => {
    mount(makeApi().api, "/deployments/portfolios?domain=simulated");
    await loaded();
    expect(sub()).toContain(`${names().length} of the top 6 / 9 portfolios`);
    cleanup();
    mount(makeApi().api);
    await loaded();
    expect(sub()).toBe("Top 6 / 9 portfolios");
  });

  it("says the order is by name when sort=allocated has no currency, and drops the note once a currency is chosen", async () => {
    mount(makeApi().api, "/deployments/portfolios?sort=allocated:desc");
    await loaded();
    expect(screen.getByTestId("sort-fallback").textContent).toContain("Sorted by name");
    expect(names()).toEqual(["Canary", "Core", "Pilot", "Satellite", "Yen-Carry", "Unallocated"]);
    cleanup();
    mount(makeApi().api, "/deployments/portfolios?sort=allocated:desc&ccy=usdt");
    await loaded();
    expect(screen.queryByTestId("sort-fallback")).toBeNull();
  });

  it("will not sort by allocated capital until a currency is chosen", async () => {
    mount(makeApi().api);
    await loaded();
    const option = screen.getByRole("option", { name: /Allocated capital \(pick a currency\)/ }) as HTMLOptionElement;
    expect(option.disabled).toBe(true);
  });

  it("sorts by owner with a missing owner last in either direction", async () => {
    mount(makeApi().api, "/deployments/portfolios?sort=owner");
    await loaded();
    expect(names()).toEqual(["Canary", "Satellite", "Core", "Yen-Carry", "Pilot", "Unallocated"]);
    fireEvent.click(screen.getByRole("button", { name: /Sort direction/ }));
    expect(names()).toEqual(["Core", "Yen-Carry", "Canary", "Satellite", "Pilot", "Unallocated"]);
  });
});

describe("columns", () => {
  it("hides a column from the chooser, in the URL, and keeps Portfolio", async () => {
    mount(makeApi().api);
    await loaded();
    const menu = screen.getByRole("group", { name: "Columns" });
    expect((within(menu).getByRole("checkbox", { name: "Portfolio" }) as HTMLInputElement).disabled).toBe(true);
    // Every measure is in the chooser like any other column.
    expect(within(menu).getByRole("checkbox", { name: "Economic capital" })).not.toBeNull();
    expect(within(menu).getByRole("checkbox", { name: "Portfolio score" })).not.toBeNull();
    // HHI, Allocations, Alphas / Dep. and Domain are hidden by default; a click brings one back and the address remembers the rest.
    fireEvent.click(within(menu).getByRole("checkbox", { name: "HHI" }));
    fireEvent.click(within(menu).getByRole("checkbox", { name: "Allocations" }));
    expect(search().get("hide")).toBe("alphas,domain");
    const headers = [...table().querySelectorAll("th")].map((th) => th.textContent);
    expect(headers).toContain("HHI");
    expect(headers).toContain("Allocations");
    expect(headers).toContain("Manager");
    fireEvent.click(within(menu).getByRole("checkbox", { name: "HHI" }));
    expect(search().get("hide")).toBe("alphas,domain,hhi");
    fireEvent.click(within(menu).getByRole("checkbox", { name: "Manager" }));
    expect(search().get("hide")).toBe("owner,alphas,domain,hhi");
    expect([...table().querySelectorAll("th")].map((th) => th.textContent)).not.toContain("Manager");
  });

  it("honours a hide list in the address and ignores a name it does not know", async () => {
    mount(makeApi().api, "/deployments/portfolios?hide=owner,nonsense");
    await loaded();
    expect([...table().querySelectorAll("th")].map((th) => th.textContent)).not.toContain("Manager");
  });
});

describe("Compare is off (M2)", () => {
  const off = { ...DEFAULT_ROUTES, compare: null };
  const mountOff = (api: ExecutionApi, entry = "/deployments/portfolios") =>
    render(
      <MemoryRouter initialEntries={[entry]}>
        <PortfolioListScreen api={api} routes={off} />
        <Where />
      </MemoryRouter>,
    );

  it("draws no link and no button for Compare, even with two picks in the address; the selection bar says why it is off", async () => {
    mountOff(makeApi().api, `/deployments/portfolios?in=${PF.core},${PF.satellite}`);
    await loaded();
    expect(screen.queryByRole("link", { name: /^Compare/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Compare" })).toBeNull();
    expect(screen.getByText(new RegExp(COMPARE_OFF_REASON), { selector: ".exec-pf-selbar span" })).toBeTruthy();
    expect(document.querySelector("a[href*='/deployments/compare']")).toBeNull();
  });

  it("the row boxes are off with the same reason, and the selection bar does not promise a comparison", async () => {
    mountOff(makeApi().api);
    await loaded();
    expect(screen.queryByText("Select 2 to 4 portfolios to compare")).toBeNull();
    expect(screen.getByText(COMPARE_OFF_REASON, { selector: ".exec-pf-selbar span" })).toBeTruthy();
    const box = screen.getByRole("checkbox", { name: "Select Core to compare" }) as HTMLInputElement;
    expect(box.disabled).toBe(true);
    expect(box.title).toBe(COMPARE_OFF_REASON);
    expect(search().has("in")).toBe(false);
  });

  it("with Compare on, nothing about the list changes", async () => {
    mount(makeApi().api);
    await loaded();
    expect((screen.getByRole("checkbox", { name: "Select Core to compare" }) as HTMLInputElement).disabled).toBe(false);
    expect(screen.getByText("Select 2 to 4 portfolios to compare")).toBeTruthy();
  });
});

describe("Compare selection", () => {
  it("selects up to four through the URL and links to Compare with the picks", async () => {
    mount(makeApi().api);
    await loaded();
    expect(screen.getByText("Select 2 to 4 portfolios to compare")).toBeTruthy();
    const box = (name: string) => screen.getByRole("checkbox", { name: `Select ${name} to compare` }) as HTMLInputElement;
    fireEvent.click(box("Core"));
    expect(search().get("in")).toBe(PF.core);
    expect(screen.queryByRole("button", { name: "Compare" })).toBeNull();
    expect(screen.queryByRole("link", { name: /^Compare/ })).toBeNull();
    expect(screen.getByText("1 selected. Select 2 to 4 portfolios to compare")).toBeTruthy();
    fireEvent.click(box("Satellite"));
    const link = screen.getByRole("link", { name: "Compare 2" });
    const href = new URL(link.getAttribute("href")!, "http://x");
    // Compare's own route (registry rev 9, EXECUTION_COMPARE_SCREEN); the old ?view=compare URL is only redirected.
    expect(href.pathname).toBe("/deployments/compare");
    expect(href.searchParams.get("view")).toBeNull();
    expect(href.searchParams.get("in")).toBe(`${PF.core},${PF.satellite}`);
    expect(href.searchParams.get("from")).toBe("portfolios");
  });

  it("stops at four and says why the fifth box is off", async () => {
    mount(makeApi().api);
    await loaded();
    for (const name of ["Core", "Satellite", "Canary", "Yen-Carry"]) fireEvent.click(screen.getByRole("checkbox", { name: `Select ${name} to compare` }));
    const fifth = screen.getByRole("checkbox", { name: "Select Pilot to compare" }) as HTMLInputElement;
    expect(fifth.disabled).toBe(true);
    expect(fifth.title).toBe("At most 4 can be compared");
    expect(search().get("in")?.split(",")).toHaveLength(4);
  });

  it("warns when the picks differ in base currency, before Compare says it again", async () => {
    mount(makeApi().api, `/deployments/portfolios?in=${PF.core},${PF.yen}`);
    await loaded();
    expect(screen.getByText(/Base currencies differ \(USDT, JPY\)/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Compare 2" })).toBeTruthy();
  });

  it("restores the selection from the address, reads the ids alias and names an id that is not loaded", async () => {
    mount(makeApi().api, `/deployments/portfolios?ids=${PF.core},pf_not_loaded`);
    await loaded();
    expect((screen.getByRole("checkbox", { name: "Select Core to compare" }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText(/2 selected\. One is not in the loaded portfolios/)).toBeTruthy();
    expect(screen.queryByRole("link", { name: /^Compare \d/ })).toBeNull();
  });

  it("clears the selection in one step", async () => {
    mount(makeApi().api, `/deployments/portfolios?in=${PF.core},${PF.satellite}`);
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(search().has("in")).toBe(false);
  });

  it("can be driven from the keyboard: the boxes are real checkboxes in tab order", async () => {
    mount(makeApi().api);
    await loaded();
    const box = screen.getByRole("checkbox", { name: "Select Core to compare" });
    box.focus();
    expect(document.activeElement).toBe(box);
    fireEvent.click(box);
    expect((box as HTMLInputElement).checked).toBe(true);
  });
});

describe("states", () => {
  it("shows loading before the first answer", () => {
    const never: Override = () => ({ status: 200, body: {} });
    const api = { listPortfolios: () => new Promise(() => undefined) } as unknown as ExecutionApi;
    mount(api);
    expect(never).toBeTypeOf("function");
    expect(screen.getByRole("status", { name: "Loading" })).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("shows a refused read as its typed state with the reason, and no table", async () => {
    mount(makeApi(() => ({ status: 503, body: {} })).api);
    expect(await screen.findByText("Unavailable")).toBeTruthy();
    expect(screen.getByText(/HTTP 503/)).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("shows a denied read as withheld", async () => {
    mount(makeApi(() => ({ status: 403, body: {} })).api);
    expect(await screen.findByText("Withheld")).toBeTruthy();
  });

  it("calls an empty population a fact when the source published none", async () => {
    const empty: Override = (_m, path) => (path === "/portfolios"
      ? { status: 200, body: { ...(answerPortfolios("GET", path)!.body as object), items: [], total_portfolios: 0, truncated: false, completeness: "COMPLETE", environments: { paper: { state: "EMPTY", reason_code: null } } } }
      : undefined);
    mount(makeApi(empty).api);
    expect(await screen.findByText(/published no portfolios/)).toBeTruthy();
    expect(screen.queryByText(/The read is partial/)).toBeNull();
  });

  it("marks a stale read as stale", async () => {
    const stale: Override = (_m, path) => (path === "/portfolios"
      ? { status: 200, body: { ...(answerPortfolios("GET", path)!.body as object), freshness: "STALE" } }
      : undefined);
    mount(makeApi(stale).api);
    await loaded();
    expect(screen.getByText("Stale")).toBeTruthy();
  });

  it("refuses a body the reader rejects as unavailable, never as an empty register", async () => {
    mount(makeApi(() => ({ status: 200, body: { schema_version: "something.else" } })).api);
    expect(await screen.findByText("Unavailable")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });
});

describe("capability", () => {
  it("tells a caller whose navigation read does not list Portfolios so, links to access and makes no read", async () => {
    const { api, calls } = makeApi();
    mount(api, "/deployments/portfolios", new Set([V2_NAV_TOKEN.accounts]));
    expect(screen.getByText("Withheld")).toBeTruthy();
    expect(screen.getByText(/Portfolios is not listed in your navigation read/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "See what you can access" }).getAttribute("href")).toBe("/administration/profile-access");
    await new Promise((r) => setTimeout(r, 20));
    expect(calls).toEqual([]);
  });

  it("shows the register to a caller who holds it", async () => {
    mount(makeApi().api, "/deployments/portfolios", new Set([V2_NAV_TOKEN.portfolios]));
    await loaded();
    expect(names()).toHaveLength(6);
  });

  it("offers no Export: a control that cannot act is not drawn (UX audit A)", async () => {
    mount(makeApi().api);
    await loaded();
    expect(screen.queryByRole("button", { name: "Export" })).toBeNull();
    expect(document.body.textContent).not.toContain("Export is not available yet.");
  });
});

describe("scale", () => {
  it("draws at most 200 rows, however many were read, and says so", async () => {
    const many: Override = (_m, path) => {
      if (path !== "/portfolios") return undefined;
      const base = answerPortfolios("GET", path)!.body as { items: Record<string, unknown>[] };
      const items = Array.from({ length: 260 }, (_, i) => ({ ...base.items[1], portfolio_id: `pf_scale_${String(i).padStart(4, "0")}`, name: `Scale ${String(i).padStart(4, "0")}` }));
      return { status: 200, body: { ...base, items, total_portfolios: 260, truncated: false } };
    };
    mount(makeApi(many).api);
    await loaded();
    expect(bodyRows()).toHaveLength(200);
    expect(screen.getByText(/Showing the first 200 rows/)).toBeTruthy();
  });
});

describe("branch reason copy", () => {
  it("words known N31 codes and never prints an unknown code as the visible text", async () => {
    const { branchReasonText } = await import("./listModel");
    expect(branchReasonText("N31_PROJECTION_NOT_READY")).toEqual({ text: "the data feed has not produced a first read yet", known: true });
    expect(branchReasonText("N31_SOMETHING_NEW")).toEqual({ text: "reason not in this build's dictionary", known: false });
    expect(branchReasonText("__proto__").known).toBe(false);
  });
});
