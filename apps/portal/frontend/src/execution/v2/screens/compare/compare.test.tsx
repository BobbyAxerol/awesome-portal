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
import { V2_CAPABILITY } from "../../shell/roleNav";
import { makeApi, type Override } from "../portfolios/harness.fixtures";
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
    </MemoryRouter>,
  );

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
    expect(screen.getByText("2 to 4 · one currency · one domain · identity and scalars only")).toBeTruthy();
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

describe("series", () => {
  it("prints Not available for the aligned series with FE-033 and the basis caption, and draws nothing", async () => {
    const { container } = mount(makeApi().api, pick(PF.satellite, PF.canary));
    await loaded();
    const overlay = container.querySelector(".exec-compare")!;
    expect(overlay.textContent).toContain("Not available");
    expect(overlay.textContent).toContain("Aligned series are Not published (FE-033). Nothing is rebased or worked out here.");
    expect(overlay.querySelectorAll("svg")).toHaveLength(0);
    expect(screen.getByTestId("basis-caption").textContent).toBe("Basis: Return since window start (90D), one currency (USDT), Real-funded books; methodology as published per source (FE-006)");
    expect(within(overlay as HTMLElement).getByRole("list", { name: "Not in the comparison" })).toBeTruthy();
    expect(within(overlay as HTMLElement).getByText("Not comparable")).toBeTruthy();
  });

  it("follows the shared window in the caption", async () => {
    mount(makeApi().api, `${pick(PF.satellite, PF.canary)}&window=30d`);
    await loaded();
    expect(screen.getByText("Window 30D")).toBeTruthy();
  });

  it("makes no read for a series, because none is published", async () => {
    const { api, calls } = makeApi();
    mount(api, pick(PF.satellite, PF.canary));
    await loaded();
    expect(calls).toEqual(["GET /portfolios"]);
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
