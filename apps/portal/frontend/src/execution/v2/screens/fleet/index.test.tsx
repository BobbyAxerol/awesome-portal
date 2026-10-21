/**
 * The Fleet screen against the Playwright double's five rows, through the real
 * reader: lenses, filters, sort, paging, the peek drawer, and every state the
 * screen must keep apart.
 */
import { whyText } from "../../gapWhyTestUtil";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { alphaFleet } from "../../../../../e2e/bffDouble";
import type { AlphaFleetQuery, ExecutionApi } from "../../../api/ports";
import { readAlphaFleet } from "../../../api/profileRead";
import { PAGE_LIMIT } from "./fleetModel";
import FleetScreen, { FLEET_SCREEN_KEY } from "./index";

afterEach(cleanup);

type Answer = { status: number; body: unknown };

function paramsOf(query: AlphaFleetQuery): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== "") params.set(key, String(value));
  return params;
}

function makeApi(answer: (params: URLSearchParams) => Answer = alphaFleet) {
  const calls: AlphaFleetQuery[] = [];
  const getAlphaFleet = vi.fn(async (query: AlphaFleetQuery = {}) => {
    calls.push(query);
    const reply = answer(paramsOf(query));
    if (reply.status !== 200) return { ok: false as const, status: "unavailable" as const, reason: `HTTP_${reply.status}` };
    const envelope = readAlphaFleet(reply.body);
    return envelope
      ? { ok: true as const, value: envelope }
      : { ok: false as const, status: "unavailable" as const, reason: "UNREADABLE_ALPHA_FLEET" };
  });
  return { api: { getAlphaFleet } as unknown as ExecutionApi, calls, getAlphaFleet };
}

function Where() {
  const { pathname, search } = useLocation();
  return <output data-testid="where">{pathname + search}</output>;
}

const mount = (api: ExecutionApi, entry = "/execution/fleet") =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <FleetScreen api={api} />
      <Where />
    </MemoryRouter>,
  );

const where = () => screen.getByTestId("where").textContent ?? "";
const search = () => new URLSearchParams(where().split("?")[1] ?? "");
const table = () => screen.getByRole("table", { name: "Alpha fleet" });
const names = () => within(table()).getAllByRole("row").slice(1).map((r) => r.querySelector("td[data-l='Alpha'] .exec-fleet-name")?.textContent ?? "");
const loaded = async () => screen.findByRole("table", { name: "Alpha fleet" });

describe("identity table", () => {
  it("is the fleet flag's screen", () => {
    expect(FLEET_SCREEN_KEY).toBe("fleet");
  });

  it("shows the five rows with owner, portfolios, stage, health and deployments", async () => {
    const { api } = makeApi();
    mount(api);
    await loaded();
    expect(names()).toEqual(["Carry A", "Basis B", "Momentum C", "Grid D", "Idea E"]);
    const rows = within(table()).getAllByRole("row").slice(1);
    const cell = (r: HTMLElement, label: string) => r.querySelector(`td[data-l='${label}']`)!.textContent ?? "";
    expect(cell(rows[0]!, "Owner")).toBe("Bobby-001");
    expect(cell(rows[0]!, "Portfolios")).toBe("Main");
    expect(cell(rows[0]!, "Stage")).toContain("Paper");
    expect(cell(rows[0]!, "Health")).toContain("Ready");
    expect(cell(rows[1]!, "Owner")).toBe("Lan-002");
    expect(cell(rows[1]!, "Stage")).toContain("also Canary");
    expect(cell(rows[1]!, "Deployments")).toContain("3 deployments");
    expect(cell(rows[2]!, "Health")).toContain("Needs attention");
    expect(cell(rows[2]!, "Health")).toContain("Deployment attention, Reconciliation open");
    expect(cell(rows[3]!, "Deployments")).toContain("2 deployments");
    expect(cell(rows[3]!, "Deployments")).toContain("Finding open");
    expect(cell(rows[4]!, "Deployments")).toContain("None deployed");
    expect(cell(rows[4]!, "Owner")).toBe("Not available");
  });

  it("prints counts only in the KPI strip and no money anywhere", async () => {
    const { api } = makeApi();
    const { container } = mount(api);
    await loaded();
    const strip = screen.getByRole("group", { name: "Fleet counts" });
    const tile = (label: string) => within(strip).getByText(label).parentElement!.textContent;
    expect(tile("Alphas")).toContain("5");
    expect(tile("Deployments")).toContain("7");
    expect(tile("Portfolios")).toContain("2");
    expect(tile("Need attention")).toContain("1");
    expect(tile("Research only")).toContain("1");
    expect(container.textContent).not.toMatch(/USDT/);
    expect([...container.querySelectorAll("th")].map((th) => th.textContent)).not.toEqual(expect.arrayContaining(["Allocation"]));
    expect(container.querySelector("svg, canvas")).toBeNull();
  });

  it("never renders a dash, N/A or a bare zero for an absent value", async () => {
    const { api } = makeApi();
    const { container } = mount(api);
    await loaded();
    const cells = [...container.querySelectorAll("td")].map((td) => (td.textContent ?? "").trim());
    expect(cells.filter((t) => /^(-|–|—|N\/A|0)?$/.test(t))).toEqual([]);
    expect(container.textContent).not.toMatch(/—|–|N\/A/);
  });

  it("marks every cell with its column label, so the same markup stacks as cards at 660px and below", async () => {
    const { api } = makeApi();
    mount(api);
    await loaded();
    for (const row of within(table()).getAllByRole("row").slice(1)) {
      expect([...row.querySelectorAll("td")].map((td) => td.getAttribute("data-l"))).toEqual([
        "Alpha", "Owner", "Portfolios", "Stage", "Health", "Deployments",
      ]);
    }
    expect(table().className).toBe("exec-cards");
  });

  it("states readiness and compare as not published once, not on every row", async () => {
    const { api } = makeApi();
    mount(api);
    await loaded();
    for (const row of within(table()).getAllByRole("row").slice(1)) {
      expect(row.querySelector("td[data-l='Readiness']")).toBeNull();
      expect(row.querySelector("button")).toBeNull();
    }
    expect(document.body.textContent).toContain("Readiness (FE-027, FE-028)");
    // One line names Compare and Window; the toolbar draws no dead button for them (UX audit A).
    expect(screen.queryByRole("button", { name: "Compare" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Window" })).toBeNull();
    expect(document.querySelector(".exec-fleet-unpub")?.textContent).toContain("Compare (FE-033)");
  });

  it("draws the stage hue and a mini spine from the published current stage alone", async () => {
    const { api } = makeApi();
    mount(api);
    await loaded();
    const rows = within(table()).getAllByRole("row").slice(1);
    const stage = rows[0]!.querySelector("td[data-l='Stage'] .exec-fleet-stage")!;
    expect(stage.getAttribute("data-stage")).toBe("PAPER");
    const spine = rows[0]!.querySelector("td[data-l='Stage'] .exec-blk-spine-mini")!;
    const nodes = [...spine.querySelectorAll("i")].map((i) => i.getAttribute("data-s"));
    // Only the current node is known; nothing before it is claimed as done.
    expect(nodes).toEqual(["unknown", "unknown", "cur", "ahead", "ahead", "ahead"]);
    expect(nodes).not.toContain("done");
  });

  it("a deep link to Map explains itself and offers the Table; it asks nothing", async () => {
    const { api, getAlphaFleet } = makeApi();
    mount(api, "/execution/fleet?view=map");
    expect(screen.getAllByText("Map").length).toBeGreaterThan(1);
    expect(screen.getAllByText("Not published (FE-035)").length).toBeGreaterThan(0);
    expect(getAlphaFleet).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Map" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Back to Table" }));
    await loaded();
    expect(where()).toBe("/execution/fleet");
  });
});

describe("lens tabs", () => {
  it("count from the summary, mark Real-funded as an upper bound and leave Archived uncounted", async () => {
    const { api } = makeApi();
    mount(api);
    await loaded();
    const tabs = screen.getAllByRole("tab").map((t) => t.textContent);
    expect(tabs).toEqual(["All5", "Real-funded~3", "Sandbox1", "Paper2", "Archived"]);
    expect(screen.getByRole("tab", { name: /^All/ }).getAttribute("aria-selected")).toBe("true");
  });

  it("Paper asks the server for the one stage and shows the paper alphas", async () => {
    const { api, calls } = makeApi();
    mount(api);
    await loaded();
    fireEvent.click(screen.getByRole("tab", { name: /^Paper/ }));
    await waitFor(() => expect(names()).toEqual(["Carry A", "Grid D"]));
    expect(search().get("stage")).toBe("paper");
    expect(calls.at(-1)).toMatchObject({ stage: "PAPER" });
    expect(screen.getByRole("tab", { name: /^Paper/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("2 of 2 alphas, 5 in your scope")).toBeTruthy();
  });

  it("Sandbox shows the alpha that is also in Paper", async () => {
    const { api } = makeApi();
    mount(api);
    await loaded();
    fireEvent.click(screen.getByRole("tab", { name: /^Sandbox/ }));
    await waitFor(() => expect(names()).toEqual(["Grid D"]));
    expect(search().get("stage")).toBe("sandbox");
  });

  it("Real-funded is Canary plus Live: the server cannot take two stages, so the loaded rows are narrowed and it says so", async () => {
    const { api, calls } = makeApi();
    mount(api);
    await loaded();
    fireEvent.click(screen.getByRole("tab", { name: /^Real-funded/ }));
    await waitFor(() => expect(names()).toEqual(["Basis B", "Momentum C"]));
    expect(search().get("stage")).toBe("canary,live");
    expect(calls.at(-1)!.stage).toBeUndefined();
    expect(document.body.textContent).toContain("2 Real-funded of 5 loaded, 5 on the server. The server filters one stage at a time");
  });

  it("All drops the stage and the lens words from the URL", async () => {
    const { api } = makeApi();
    mount(api, "/execution/fleet?stage=paper&sel=alpha_a");
    await waitFor(() => expect(names()).toEqual(["Carry A", "Grid D"]));
    fireEvent.click(screen.getByRole("tab", { name: /^All/ }));
    await waitFor(() => expect(names()).toHaveLength(5));
    expect(where()).toBe("/execution/fleet");
  });

  it("Archived says Not published (FE-034) and never calls the API", async () => {
    const { api, getAlphaFleet } = makeApi();
    mount(api);
    await loaded();
    const before = getAlphaFleet.mock.calls.length;
    fireEvent.click(screen.getByRole("tab", { name: /^Archived/ }));
    expect(await screen.findByText(/Not published \(FE-034\)/)).toBeTruthy();
    expect(search().get("tab")).toBe("archived");
    expect(screen.queryByRole("table", { name: "Alpha fleet" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Fleet counts" })).toBeNull();
    expect(getAlphaFleet.mock.calls.length).toBe(before);
    // Leaving the lens reads again.
    fireEvent.click(screen.getByRole("tab", { name: /^All/ }));
    await loaded();
    expect(getAlphaFleet.mock.calls.length).toBe(before + 1);
  });

  it("opening on the Archived lens makes no request at all", () => {
    const { api, getAlphaFleet } = makeApi();
    mount(api, "/execution/fleet?tab=archived");
    expect(screen.getByText(/Not published \(FE-034\)/)).toBeTruthy();
    expect(getAlphaFleet).not.toHaveBeenCalled();
  });

  it("a stage set that is no lens still filters, and shows no selected tab", async () => {
    const { api } = makeApi();
    mount(api, "/execution/fleet?stage=live");
    await waitFor(() => expect(names()).toEqual(["Basis B"]));
    expect(screen.getAllByRole("tab").every((t) => t.getAttribute("aria-selected") === "false")).toBe(true);
  });
});

describe("search, owner, health, sort", () => {
  it("search commits on Enter into q and asks the read's search", async () => {
    const { api, calls } = makeApi();
    mount(api);
    await loaded();
    const box = screen.getByRole("searchbox", { name: "Search alpha" });
    fireEvent.change(box, { target: { value: "grid" } });
    fireEvent.keyDown(box, { key: "Enter" });
    await waitFor(() => expect(names()).toEqual(["Grid D"]));
    expect(search().get("q")).toBe("grid");
    expect(calls.at(-1)!.search).toBe("grid");
  });

  it("search also commits after a pause", async () => {
    const { api } = makeApi();
    mount(api);
    await loaded();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search alpha" }), { target: { value: "idea" } });
    await waitFor(() => expect(names()).toEqual(["Idea E"]), { timeout: 2000 });
    expect(search().get("q")).toBe("idea");
  });

  it("a q in the URL fills the box and filters on arrival", async () => {
    const { api } = makeApi();
    mount(api, "/execution/fleet?q=momentum");
    await waitFor(() => expect(names()).toEqual(["Momentum C"]));
    expect((screen.getByRole("searchbox", { name: "Search alpha" }) as HTMLInputElement).value).toBe("momentum");
  });

  it("Owner choices are the rows loaded so far, worded as such, and choosing one asks the server for it", async () => {
    const { api, calls } = makeApi();
    mount(api);
    await loaded();
    const owner = screen.getByRole("combobox", { name: "Owner" }) as HTMLInputElement;
    // The fleet read publishes no owner list: the suggestions are only what the page shows, and the screen says so.
    expect(owner.tagName).toBe("INPUT");
    expect(screen.getByTestId("options-limit").textContent).toContain("Owner and Health choices are the rows loaded so far, not the whole fleet.");
    expect(owner.title).toContain("not the whole fleet");
    const suggestions = () => [...(document.getElementById(owner.getAttribute("list") ?? "") as HTMLDataListElement).options].map((o) => o.value);
    expect(suggestions()).toEqual(["Bobby-001", "Lan-002", "Minh-003"]);
    fireEvent.change(owner, { target: { value: "Lan-002" } });
    await waitFor(() => expect(names()).toEqual(["Basis B"]));
    expect(search().get("owner")).toBe("Lan-002");
    expect(calls.at(-1)!.owner).toBe("Lan-002");
    // The other owners stay suggested while one is applied.
    expect(suggestions()).toContain("Minh-003");
  });

  it("a typed owner that is not among the loaded rows is sent to the server, not refused or filtered here", async () => {
    const { api, calls } = makeApi();
    mount(api);
    await loaded();
    const owner = screen.getByRole("combobox", { name: "Owner" });
    fireEvent.change(owner, { target: { value: "Zed-999" } });
    // typing alone sends nothing: Enter (or leaving the field) is the commit
    expect(calls.at(-1)!.owner).toBeUndefined();
    fireEvent.keyDown(owner, { key: "Enter" });
    await waitFor(() => expect(calls.at(-1)!.owner).toBe("Zed-999"));
    expect(search().get("owner")).toBe("Zed-999");
    expect(await screen.findByText("No alphas match these filters.")).toBeTruthy();
    expect(screen.getByText("owner: Zed-999")).toBeTruthy();
  });

  it("Escape puts back the committed owner and an empty field clears the filter (keyboard)", async () => {
    const { api, calls } = makeApi();
    mount(api, "/execution/fleet?owner=Lan-002");
    await waitFor(() => expect(names()).toEqual(["Basis B"]));
    const owner = screen.getByRole("combobox", { name: "Owner" }) as HTMLInputElement;
    expect(owner.value).toBe("Lan-002");
    fireEvent.change(owner, { target: { value: "half-typ" } });
    fireEvent.keyDown(owner, { key: "Escape" });
    expect(owner.value).toBe("Lan-002");
    expect(search().get("owner")).toBe("Lan-002");
    fireEvent.change(owner, { target: { value: "" } });
    fireEvent.keyDown(owner, { key: "Enter" });
    await waitFor(() => expect(search().get("owner")).toBeNull());
    await waitFor(() => expect(calls.at(-1)!.owner).toBeUndefined());
  });

  it("Health filters by the published word and shows its label", async () => {
    const { api, calls } = makeApi();
    mount(api);
    await loaded();
    const health = screen.getByRole("combobox", { name: "Health" }) as HTMLInputElement;
    const suggestions = () => [...(document.getElementById(health.getAttribute("list") ?? "") as HTMLDataListElement).options].map((o) => o.value);
    expect(suggestions()).toEqual(["Needs attention", "Ready", "Research only"]);
    // a label is a choice: it is sent as the published word
    fireEvent.change(health, { target: { value: "Needs attention" } });
    await waitFor(() => expect(names()).toEqual(["Momentum C"]));
    expect(calls.at(-1)!.health).toBe("ATTENTION");
    expect(search().get("health")).toBe("ATTENTION");
    expect(health.value).toBe("Needs attention");
  });

  describe("130 rows over three pages: the choices never pretend to be the whole fleet", () => {
    /** 130 alphas, 50 per page; the owner `Zed-129` and the health `FINDING` exist only on the last row (page 3). The server filters. */
    const wide = (params: URLSearchParams): Answer => {
      const base = alphaFleet(new URLSearchParams()).body as Record<string, any>;
      const template = base.page.rows[0];
      const all = Array.from({ length: 130 }, (_, i) => ({
        ...template, alpha_id: `alpha_${String(i).padStart(4, "0")}`, alpha_label: `Alpha ${i}`, stage: "PAPER", stages: ["PAPER"],
        owner: i === 129 ? "Zed-129" : `Owner-${i % 3}`, health: i === 129 ? "FINDING" : "READY",
      }));
      const owner = params.get("owner");
      const health = params.get("health");
      const hit = all.filter((row) => (owner === null || row.owner === owner) && (health === null || row.health === health));
      const limit = Number(params.get("limit") ?? 50);
      const after = params.get("after");
      const start = after ? hit.findIndex((r) => r.alpha_id === after) + 1 : 0;
      const rows = hit.slice(start, start + limit);
      const hasMore = start + limit < hit.length;
      return {
        status: 200,
        body: { ...base, page: { ...base.page, rows, total_count: all.length, filtered_count: hit.length, has_more: hasMore, next_cursor: hasMore ? rows.at(-1)!.alpha_id : null, has_previous: start > 0, prev_cursor: null } },
      };
    };
    const suggestionsOf = (name: string) => {
      const input = screen.getByRole("combobox", { name }) as HTMLInputElement;
      return [...(document.getElementById(input.getAttribute("list") ?? "") as HTMLDataListElement).options].map((o) => o.value);
    };

    it("page 1 offers only the owners it shows and says so; page 3 adds the last one; the missing one can still be typed on page 1", async () => {
      const { api, calls } = makeApi(wide);
      mount(api);
      await loaded();
      expect(suggestionsOf("Owner")).toEqual(["Owner-0", "Owner-1", "Owner-2"]);
      expect(screen.getByTestId("options-limit")).toBeTruthy();
      // the owner on page 3 is not offered yet, but a typed value reaches the whole fleet through the server
      const owner = screen.getByRole("combobox", { name: "Owner" });
      fireEvent.change(owner, { target: { value: "Zed-129" } });
      fireEvent.keyDown(owner, { key: "Enter" });
      await waitFor(() => expect(calls.at(-1)!.owner).toBe("Zed-129"));
      await waitFor(() => expect(names()).toEqual(["Alpha 129"]));
      expect(screen.getByText("1 of 1 alpha, 130 in your scope")).toBeTruthy();
    });

    it("loading the pages grows the suggestions and the screen still does not call them complete", async () => {
      const { api } = makeApi(wide);
      mount(api);
      await loaded();
      for (let step = 0; step < 2; step += 1) {
        fireEvent.click(screen.getByRole("button", { name: "Load more" }));
        await waitFor(() => expect(names()).toHaveLength(PAGE_LIMIT * (step + 2) > 130 ? 130 : PAGE_LIMIT * (step + 2)));
      }
      expect(names()).toHaveLength(130);
      expect(suggestionsOf("Owner")).toEqual(["Owner-0", "Owner-1", "Owner-2", "Zed-129"]);
      expect(suggestionsOf("Health")).toEqual(["Finding open", "Ready"]);
      expect(screen.getByTestId("options-limit")).toBeTruthy();
    });
  });

  it("Sort writes the published sort token and defaults stay out of the URL", async () => {
    const { api, calls } = makeApi();
    mount(api);
    await loaded();
    const sort = screen.getByRole("combobox", { name: "Sort" }) as HTMLSelectElement;
    fireEvent.change(sort, { target: { value: "alpha_label:asc" } });
    await waitFor(() => expect(names()).toEqual(["Basis B", "Carry A", "Grid D", "Idea E", "Momentum C"]));
    expect(search().get("sort")).toBe("alpha_label:asc");
    expect(calls.at(-1)!.sort).toBe("alpha_label:asc");
    fireEvent.change(sort, { target: { value: "" } });
    await waitFor(() => expect(names()[0]).toBe("Carry A"));
    expect(where()).toBe("/execution/fleet");
  });

  it("an unknown sort in the URL is the default and is not sent", async () => {
    const { api, calls } = makeApi();
    mount(api, "/execution/fleet?sort=net_pnl:desc");
    await loaded();
    expect(calls[0]!.sort).toBeUndefined();
  });

  it("no match is said plainly and Clear filters resets everything it set", async () => {
    const { api } = makeApi();
    mount(api, "/execution/fleet?q=zzz&owner=Lan-002&stage=paper");
    expect(await screen.findByText("No alphas match these filters.")).toBeTruthy();
    fireEvent.click(within(table()).getByRole("button", { name: "Clear filters" }));
    await waitFor(() => expect(names()).toHaveLength(5));
    expect(where()).toBe("/execution/fleet");
  });
});

describe("Columns menu (FL-7)", () => {
  const headers = () => [...table().querySelectorAll("th")].map((th) => th.textContent);

  it("lists the published columns checked, and the unpublished ones disabled with their request id", async () => {
    const { api } = makeApi();
    mount(api);
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: /Columns/ }));
    const menu = screen.getByRole("group", { name: "Columns" });
    for (const name of ["Owner", "Portfolios", "Stage", "Health", "Deployments"]) {
      expect((within(menu).getByRole("checkbox", { name: new RegExp(`^${name}`) }) as HTMLInputElement).checked, name).toBe(true);
    }
    for (const [name, fe] of [["Net PnL", "FE-025"], ["Equity", "FE-013"], ["Readiness", "FE-027, FE-028"]] as const) {
      const box = within(menu).getByRole("checkbox", { name: new RegExp(`^${name}`) }) as HTMLInputElement;
      expect(box.disabled, name).toBe(true);
      expect(box.closest("label")?.textContent, name).toContain(`Not published (${fe})`);
    }
  });

  it("unchecking a column hides it, writes ?hide=, and the URL carries it back", async () => {
    const { api } = makeApi();
    mount(api);
    await loaded();
    expect(headers()).toEqual(["Alpha", "Owner", "Portfolios", "Stage", "Health", "Deployments"]);
    fireEvent.click(screen.getByRole("button", { name: /Columns/ }));
    fireEvent.click(within(screen.getByRole("group", { name: "Columns" })).getByRole("checkbox", { name: /^Owner/ }));
    expect(headers()).toEqual(["Alpha", "Portfolios", "Stage", "Health", "Deployments"]);
    expect(search().get("hide")).toBe("owner");
    fireEvent.click(within(screen.getByRole("group", { name: "Columns" })).getByRole("checkbox", { name: /^Owner/ }));
    expect(headers()).toContain("Owner");
    expect(where()).toBe("/execution/fleet");
  });

  it("opens from a link that names hidden columns; an unknown name is ignored; Alpha cannot be hidden", async () => {
    const { api } = makeApi();
    mount(api, "/execution/fleet?hide=stage,alpha,bogus");
    await loaded();
    expect(headers()).toEqual(["Alpha", "Owner", "Portfolios", "Health", "Deployments"]);
  });

  it("Esc closes the menu and returns focus to its button", async () => {
    const { api } = makeApi();
    mount(api);
    await loaded();
    const button = screen.getByRole("button", { name: /Columns/ });
    fireEvent.click(button);
    expect(screen.getByRole("group", { name: "Columns" })).toBeTruthy();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByRole("group", { name: "Columns" })).toBeNull();
    expect(document.activeElement).toBe(button);
  });
});

describe("Columns popup and chip focus (a11y)", () => {
  it("the Columns button does not claim a menu: the popup is a checkbox group", async () => {
    const { api } = makeApi();
    mount(api);
    await loaded();
    const button = screen.getByRole("button", { name: /Columns/ });
    expect(button.hasAttribute("aria-haspopup")).toBe(false);
    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
  });

  it("tabbing out of the popup closes it; moving between its own checkboxes does not", async () => {
    const { api } = makeApi();
    mount(api);
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: /Columns/ }));
    const boxes = within(screen.getByRole("group", { name: "Columns" })).getAllByRole("checkbox");
    fireEvent.focusOut(boxes[0]!, { relatedTarget: boxes[1] });
    expect(screen.getByRole("group", { name: "Columns" })).toBeTruthy();
    fireEvent.focusOut(boxes[1]!, { relatedTarget: screen.getByRole("searchbox", { name: "Search alpha" }) });
    expect(screen.queryByRole("group", { name: "Columns" })).toBeNull();
  });

  it("clearing a chip moves focus to the next remaining chip, else the previous, else the search box", async () => {
    const { api } = makeApi();
    mount(api, "/execution/fleet?stage=paper&owner=Bobby-001&health=READY");
    await loaded();
    const cross = (name: string) => screen.getByRole("button", { name: `Clear ${name}` });
    // middle chip: the next one takes focus
    fireEvent.click(cross("owner"));
    await waitFor(() => expect(search().get("owner")).toBeNull());
    expect(document.activeElement).toBe(cross("health"));
    // last chip: the previous one
    fireEvent.click(cross("health"));
    await waitFor(() => expect(search().get("health")).toBeNull());
    expect(document.activeElement).toBe(cross("lens"));
    // no chip left: the search box, never body
    fireEvent.click(cross("lens"));
    await waitFor(() => expect(search().get("stage")).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole("searchbox", { name: "Search alpha" }));
  });

  it("Clear all puts focus on the search box", async () => {
    const { api } = makeApi();
    mount(api, "/execution/fleet?stage=paper&owner=Bobby-001");
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    await waitFor(() => expect(search().get("owner")).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole("searchbox", { name: "Search alpha" }));
  });

  it("the chip list keeps its list box (not display: contents) and the cross has a 24px hit area", () => {
    const css = readFileSync(resolve(__dirname, "../../css/fleet.css"), "utf8");
    const rule = (selector: string) => css.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
    expect(rule(".exec-fleet-chips")).not.toMatch(/display:\s*contents/);
    expect(rule(".exec-fleet-chips")).toMatch(/display:\s*flex/);
    // inset -6px around a cross that is at least 12px square reaches 24px on both axes.
    expect(rule(".exec-fleet-chipx::after")).toMatch(/inset:\s*-(6|7|8|9|1\d)px/);
  });
});

describe("active filter chips (FL-8)", () => {
  const chips = () => within(screen.getByRole("list", { name: "Active filters" })).getAllByRole("listitem").map((li) => li.textContent);

  it("shows no chip row content but the URL disclosure when nothing filters", async () => {
    const { api } = makeApi();
    mount(api);
    await loaded();
    expect(screen.queryByRole("list", { name: "Active filters" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Clear all" })).toBeNull();
    expect(screen.getByText("URL")).toBeTruthy();
  });

  it("one chip per filter in the URL, named as the kit names them", async () => {
    const { api } = makeApi();
    mount(api, "/execution/fleet?stage=canary,live&owner=Lan-002&health=READY&q=carry");
    await loaded();
    expect(chips()).toEqual([
      "lens: Real-funded (Canary + Live)✕",
      "owner: Lan-002✕",
      "health: Ready✕",
      "search: carry✕",
    ]);
  });

  it("a stage set that is not a lens is a stage chip", async () => {
    const { api } = makeApi();
    mount(api, "/execution/fleet?stage=paper,canary");
    await loaded();
    expect(chips()).toEqual(["stage: Paper, Canary✕"]);
  });

  it("each chip's cross clears only that filter", async () => {
    const { api } = makeApi();
    mount(api, "/execution/fleet?stage=paper&owner=Bobby-001&health=READY");
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Clear owner" }));
    await waitFor(() => expect(search().get("owner")).toBeNull());
    expect(search().get("stage")).toBe("paper");
    expect(search().get("health")).toBe("READY");
    fireEvent.click(screen.getByRole("button", { name: "Clear lens" }));
    await waitFor(() => expect(search().get("stage")).toBeNull());
    expect(search().get("health")).toBe("READY");
    fireEvent.click(screen.getByRole("button", { name: "Clear health" }));
    await waitFor(() => expect(where()).toBe("/execution/fleet"));
  });

  it("Clear all resets every filter and keeps the column choice", async () => {
    const { api } = makeApi();
    mount(api, "/execution/fleet?stage=paper&owner=Bobby-001&hide=owner");
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    await waitFor(() => expect(search().get("stage")).toBeNull());
    expect(search().get("owner")).toBeNull();
    expect(search().get("hide")).toBe("owner");
  });

  it("the URL disclosure prints the query the page is at", async () => {
    const { api } = makeApi();
    mount(api, "/execution/fleet?stage=paper&owner=Bobby-001");
    await loaded();
    expect(screen.getByText("URL").closest("details")?.textContent).toContain("?stage=paper&owner=Bobby-001");
  });
});

describe("paging", () => {
  const twoAtATime = (params: URLSearchParams) => {
    params.set("limit", "2");
    return alphaFleet(params);
  };

  it("Load more follows the read's cursor and shows N of total", async () => {
    const { api, calls } = makeApi(twoAtATime);
    mount(api);
    await loaded();
    expect(names()).toEqual(["Carry A", "Basis B"]);
    expect(screen.getByText("2 of 5 alphas")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(names()).toHaveLength(4));
    expect(calls.at(-1)!.after).toBe("alpha_b");
    expect(screen.getByText("4 of 5 alphas")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(names()).toHaveLength(5));
    expect(names()).toEqual(["Carry A", "Basis B", "Momentum C", "Grid D", "Idea E"]);
    expect(screen.getByText("5 of 5 alphas")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("a failed next page keeps the rows and says so", async () => {
    let n = 0;
    const { api } = makeApi((params) => (n++ === 0 ? twoAtATime(params) : { status: 503, body: null }));
    mount(api);
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect((await screen.findByRole("alert")).textContent).toContain("HTTP_503");
    expect(names()).toEqual(["Carry A", "Basis B"]);
  });

  it("changing a filter drops the loaded pages and starts again", async () => {
    const { api, calls } = makeApi(twoAtATime);
    mount(api);
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(names()).toHaveLength(4));
    fireEvent.click(screen.getByRole("tab", { name: /^Paper/ }));
    await waitFor(() => expect(names()).toEqual(["Carry A", "Grid D"]));
    expect(calls.at(-1)!.after).toBeUndefined();
  });

  it("Real-funded with pages still to come says none of the loaded rows qualifies", async () => {
    const { api } = makeApi((params) => {
      params.set("limit", "1");
      return alphaFleet(params);
    });
    mount(api, "/execution/fleet?stage=canary,live");
    expect(await screen.findByText("None of the 1 loaded rows is in this lens. Load more to keep looking.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(names()).toEqual(["Basis B"]));
  });
});

describe("drawer", () => {
  it("opens from a row through sel, shows identity and links to the V1 Alpha 360", async () => {
    const { api } = makeApi();
    mount(api);
    await loaded();
    fireEvent.click(within(table()).getByText("Basis B"));
    const drawer = await screen.findByRole("complementary", { name: "Basis B" });
    expect(search().get("sel")).toBe("alpha_b");
    expect(within(drawer).getByText("Version 1.4")).toBeTruthy();
    expect(within(drawer).getByText("Lan-002")).toBeTruthy();
    expect(within(drawer).getByText("Live, Canary")).toBeTruthy();
    expect(within(drawer).getByText("dep_b2")).toBeTruthy();
    expect(within(drawer).getAllByText("Main").length).toBeGreaterThan(0);
    expect(within(drawer).getAllByText("Satellite").length).toBeGreaterThan(0);
    const open = within(drawer).getByRole("link", { name: "Open Alpha 360" });
    expect(open.getAttribute("href")).toBe("/deployments/alphas/alpha_b?from=fleet");
    expect(drawer.textContent).not.toMatch(/USDT/);
  });

  it("lists attention reasons for a row that has them", async () => {
    const { api } = makeApi();
    mount(api, "/execution/fleet?sel=alpha_c");
    const drawer = await screen.findByRole("complementary", { name: "Momentum C" });
    await waitFor(() => expect(within(drawer).getByText("Reconciliation open")).toBeTruthy());
    expect(within(drawer).getByText("Deployment attention")).toBeTruthy();
  });

  it("Compare is disabled with its reason, and the link keeps the context params", async () => {
    const { api } = makeApi();
    mount(api, "/execution/fleet?sel=alpha_a&window=30d&workspace_id=ws_1");
    const drawer = await screen.findByRole("complementary", { name: "Carry A" });
    const compare = within(drawer).getByRole("button", { name: "Compare" }) as HTMLButtonElement;
    expect(compare.disabled).toBe(true);
    expect(document.getElementById(compare.getAttribute("aria-describedby")!)?.textContent).toBe("Not published (FE-033)");
    const href = within(drawer).getByRole("link", { name: "Open Alpha 360" }).getAttribute("href")!;
    expect(href.startsWith("/deployments/alphas/alpha_a?")).toBe(true);
    expect(href).toContain("window=30d");
    expect(href).toContain("workspace_id=ws_1");
    expect(href).not.toContain("sel=");
  });

  it("Close removes only sel; Esc does the same", async () => {
    const { api } = makeApi();
    mount(api, "/execution/fleet?q=a&sel=alpha_a");
    const drawer = await screen.findByRole("complementary", { name: "Carry A" });
    fireEvent.click(within(drawer).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("complementary")).toBeNull());
    expect(where()).toBe("/execution/fleet?q=a");
  });

  it("Esc closes it the same way", async () => {
    const { api } = makeApi();
    mount(api, "/execution/fleet?sel=alpha_a");
    await screen.findByRole("complementary", { name: "Carry A" });
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("complementary")).toBeNull());
    expect(where()).toBe("/execution/fleet");
  });

  it("a selected row stays marked in the table", async () => {
    const { api } = makeApi();
    mount(api, "/execution/fleet?sel=alpha_d");
    await loaded();
    const selected = within(table()).getAllByRole("row").filter((r) => r.getAttribute("aria-current") === "true");
    expect(selected).toHaveLength(1);
    expect(selected[0]!.textContent).toContain("Grid D");
  });

  it("a sel that is not in the loaded rows says so and still offers the link", async () => {
    const { api } = makeApi();
    mount(api, "/execution/fleet?sel=alpha_zzz");
    const drawer = await screen.findByRole("complementary", { name: "alpha_zzz" });
    await waitFor(() => expect(within(drawer).getByText("Not in the loaded page")).toBeTruthy());
    expect(within(drawer).getByRole("link", { name: "Open Alpha 360" }).getAttribute("href")).toBe("/deployments/alphas/alpha_zzz?from=fleet");
  });

  it("a row with no owner says Not available in the drawer", async () => {
    const { api } = makeApi();
    mount(api, "/execution/fleet?sel=alpha_e");
    const drawer = await screen.findByRole("complementary", { name: "Idea E" });
    await waitFor(() => expect(within(drawer).getByText("Not available")).toBeTruthy());
    expect(within(drawer).getByText("No deployment. This alpha is in research.")).toBeTruthy();
    expect(within(drawer).getByText("Not published (FE-027, FE-028)")).toBeTruthy();
  });
});

describe("states", () => {
  const envelopeWith = (mutate: (body: Record<string, any>) => void): Answer => {
    const body = JSON.parse(JSON.stringify(alphaFleet(new URLSearchParams()).body)) as Record<string, any>;
    mutate(body);
    return { status: 200, body };
  };

  it("loading is a skeleton, not an empty table", () => {
    const api = { getAlphaFleet: () => new Promise(() => undefined) } as unknown as ExecutionApi;
    mount(api);
    expect(screen.getByRole("status", { name: "Loading" })).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("empty with no filters is the read saying there are no alphas", async () => {
    const { api } = makeApi(() => envelopeWith((b) => {
      b.page = { ...b.page, rows: [], total_count: 0, filtered_count: 0 };
      b.summary = { ...b.summary, alpha_count: 0, deployment_count: 0, portfolio_count: 0, needs_attention_count: 0, research_only_count: 0, stage_counts: {} };
    }));
    mount(api);
    expect(await screen.findByText("Nothing to show")).toBeTruthy();
    expect(screen.getByText("The fleet read published no alphas.")).toBeTruthy();
    // stage_counts is empty here: a stage the summary does not list is Not available, not a guessed 0 (D4).
    expect(screen.getByRole("tab", { name: /^Paper/ }).textContent).toBe("PaperNot available");
  });

  it("partial is flagged and never green", async () => {
    const { api } = makeApi(() => envelopeWith((b) => {
      b.completeness = "PARTIAL";
    }));
    mount(api);
    await loaded();
    expect(whyText(screen.getByText("Some rows or counts may be missing").parentElement)).toBe("The read is partial");
  });

  it("stale freshness is a Stale flag with the as-of time", async () => {
    const { api } = makeApi(() => envelopeWith((b) => {
      b.freshness = "STALE";
    }));
    mount(api);
    await loaded();
    expect(screen.getByText("Stale")).toBeTruthy();
    expect(screen.getByText("As of 1 Sep 15:00Z")).toBeTruthy();
  });

  it("unavailable and unreadable keep their own words and the reason", async () => {
    mount(makeApi(() => ({ status: 503, body: null })).api);
    expect(await screen.findByText("Unavailable")).toBeTruthy();
    expect(screen.getByText(/HTTP_503/)).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    cleanup();
    mount(makeApi(() => ({ status: 200, body: { schema_version: "execution.alpha-fleet-list.v1" } })).api);
    expect(await screen.findByText(/UNREADABLE_ALPHA_FLEET/)).toBeTruthy();
  });

  it("denied is Withheld with its reason, and the controls are still there", async () => {
    const getAlphaFleet = vi.fn(async () => ({ ok: false as const, status: "denied" as const, reason: "HTTP_403 FORBIDDEN" }));
    mount({ getAlphaFleet } as unknown as ExecutionApi);
    expect(await screen.findByText("Withheld")).toBeTruthy();
    expect(screen.getByRole("tab", { name: /^Paper/ })).toBeTruthy();
  });

  it("a thrown read is unavailable, not a blank", async () => {
    const getAlphaFleet = vi.fn(async () => {
      throw new Error("boom");
    });
    mount({ getAlphaFleet } as unknown as ExecutionApi);
    expect(await screen.findByText("Unavailable")).toBeTruthy();
    expect(screen.getByText(/PORTAL_READ_FAILED/)).toBeTruthy();
  });

  it("a read without its summary is refused whole, not drawn with zero counts", async () => {
    const { api } = makeApi(() => envelopeWith((b) => {
      delete b.summary;
    }));
    mount(api);
    expect(await screen.findByText(/UNREADABLE_ALPHA_FLEET/)).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });
});

/* ── Board view (view=board): the same loaded rows, one column per stage ── */
describe("board view", () => {
  const board = () => screen.findByRole("group", { name: "Alpha fleet board" });
  const lane = (name: string) => {
    const section = [...document.querySelectorAll("section.exec-fleet-lane")].find((el) => el.querySelector("h3")?.textContent === name);
    if (!section) throw new Error(`no lane ${name}`);
    return section as HTMLElement;
  };
  const laneNames = (name: string) => [...lane(name).querySelectorAll(".exec-fleet-card .exec-fleet-name")].map((n) => n.textContent);

  /** `total` generated alphas over keyset pages (limit from the query), stage cycling PAPER, SANDBOX, CANARY, LIVE. */
  const scaledAnswer = (total: number) => (params: URLSearchParams): Answer => {
    const base = alphaFleet(new URLSearchParams()).body as Record<string, any>;
    const template = base.page.rows[0];
    const cycle = ["PAPER", "SANDBOX", "CANARY", "LIVE"];
    const all = Array.from({ length: total }, (_, i) => ({
      ...template, alpha_id: `alpha_${String(i).padStart(4, "0")}`, alpha_label: `Alpha ${i}`, stage: cycle[i % 4], stages: [cycle[i % 4]],
    }));
    const limit = Number(params.get("limit") ?? 50);
    const after = params.get("after");
    const start = after ? all.findIndex((r) => r.alpha_id === after) + 1 : 0;
    const rows = all.slice(start, start + limit);
    const hasMore = start + limit < all.length;
    const counts = Object.fromEntries(cycle.map((c, k) => [c, all.filter((_, i) => i % 4 === k).length]));
    return {
      status: 200,
      body: {
        ...base,
        summary: { ...base.summary, alpha_count: total, stage_counts: counts },
        page: { ...base.page, rows, total_count: total, filtered_count: total, has_more: hasMore, next_cursor: hasMore ? rows.at(-1)!.alpha_id : null, has_previous: start > 0, prev_cursor: start > 0 ? rows[0]!.alpha_id : null },
      },
    };
  };

  it("the Board button is a real toggle that writes view=board, and Table clears it; Map stays disabled", async () => {
    const { api } = makeApi();
    mount(api);
    await loaded();
    const boardBtn = screen.getByRole("button", { name: "Board" });
    expect(boardBtn.getAttribute("aria-pressed")).toBe("false");
    expect(boardBtn.hasAttribute("disabled")).toBe(false);
    expect(screen.getByRole("button", { name: "Map" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(boardBtn);
    await board();
    expect(search().get("view")).toBe("board");
    expect(screen.getByRole("button", { name: "Board" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Table" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByRole("table", { name: "Alpha fleet" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Table" }));
    await loaded();
    expect(where()).toBe("/execution/fleet");
  });

  it("lanes are the four financial stages in HiFi order, an alpha is a card in EVERY stage it is in, and there is no R1 or R2 lane", async () => {
    const { api, getAlphaFleet } = makeApi();
    mount(api, "/execution/fleet?view=board");
    await board();
    expect(getAlphaFleet).toHaveBeenCalledTimes(1);
    const heads = [...document.querySelectorAll("section.exec-fleet-lane h3")].map((h) => h.textContent);
    // Research is not a stage of the guide (4.1, 6.2.1): its lane exists only because a loaded row has no stage lane to sit in.
    expect(heads).toEqual(["Research", "Paper", "Sandbox", "Canary", "Live"]);
    expect(heads.some((head) => /gate/i.test(head ?? ""))).toBe(false);
    expect(laneNames("Research")).toEqual(["Idea E"]);
    expect(laneNames("Paper")).toEqual(["Carry A", "Grid D"]);
    expect(laneNames("Sandbox")).toEqual(["Grid D"]);
    expect(laneNames("Canary")).toEqual(["Basis B", "Momentum C"]);
    expect(laneNames("Live")).toEqual(["Basis B"]);
    // Stage counts are the summary's own (alphas per stage; the lanes' loaded counts are cards, so they are not added up).
    expect(lane("Live").textContent).toContain("1 loaded");
    expect(lane("Live").textContent).toContain("In your scope: 1");
    expect(lane("Canary").textContent).toContain("2 loaded");
    expect(lane("Canary").textContent).toContain("In your scope: 2");
    expect(lane("Paper").textContent).toContain("In your scope: 2");
    expect(screen.getByText(/Loaded rows only: 5 alphas; an alpha in several stages is in each of its lanes/)).toBeTruthy();
  });

  it("a lens shows only its own lanes: Real-funded is Canary and Live, Paper is Paper", async () => {
    const { api } = makeApi();
    mount(api, "/execution/fleet?view=board&stage=canary,live");
    await board();
    expect([...document.querySelectorAll("section.exec-fleet-lane h3")].map((h) => h.textContent)).toEqual(["Canary", "Live"]);
    cleanup();
    mount(makeApi().api, "/execution/fleet?view=board&stage=paper");
    await board();
    expect([...document.querySelectorAll("section.exec-fleet-lane h3")].map((h) => h.textContent)).toEqual(["Paper"]);
  });

  it("an alpha in two stages says so on each card, relative to the lane it is in", async () => {
    const { api } = makeApi();
    mount(api, "/execution/fleet?view=board");
    await board();
    const cardIn = (laneName: string, name: string) =>
      [...lane(laneName).querySelectorAll<HTMLElement>(".exec-fleet-card")].find((c) => c.querySelector(".exec-fleet-name")?.textContent === name)!;
    expect(cardIn("Live", "Basis B").textContent).toContain("also in Canary");
    expect(cardIn("Canary", "Basis B").textContent).toContain("also in Live");
    expect(cardIn("Sandbox", "Grid D").textContent).toContain("also in Paper");
    // The mini spine marks the lane's stage, not the alpha's highest.
    const nodes = (el: HTMLElement) => [...el.querySelectorAll(".exec-blk-spine-mini i")].map((i) => i.getAttribute("data-s"));
    expect(nodes(cardIn("Canary", "Basis B"))[4]).toBe("cur");
    expect(nodes(cardIn("Live", "Basis B"))[5]).toBe("cur");
    // A card names the portfolios beside the owner (HiFi: owner and portfolio).
    expect(cardIn("Canary", "Momentum C").textContent).toContain("Owner Minh-003 · Satellite");
  });

  it("a card is identity, published health, the mini spine and the readiness gap; nothing is derived", async () => {
    const { api } = makeApi();
    mount(api, "/execution/fleet?view=board");
    await board();
    const card = (name: string) => [...document.querySelectorAll<HTMLElement>(".exec-fleet-card")].find((c) => c.querySelector(".exec-fleet-name")?.textContent === name)!;
    const carry = card("Carry A");
    expect(carry.querySelector(".exec-fleet-version")?.textContent).toBe("3.2");
    expect(carry.textContent).toContain("Owner Bobby-001");
    expect(carry.textContent).toContain("Ready");
    // The same gap on every card of a lane is stated once at the lane head, never per card, and never dropped.
    expect(carry.textContent).not.toContain("Readiness");
    const paperGap = lane("Paper").querySelectorAll(".exec-fleet-lane-head .exec-fleet-lane-gap");
    expect(paperGap).toHaveLength(1);
    expect(paperGap[0]!.textContent).toBe("Readiness: Not published (FE-027) for every alpha here");
    expect(lane("Paper").querySelectorAll(".exec-fleet-card-ready")).toHaveLength(0);
    const nodes = [...carry.querySelectorAll(".exec-blk-spine-mini i")].map((i) => i.getAttribute("data-s"));
    expect(nodes).toEqual(["unknown", "unknown", "cur", "ahead", "ahead", "ahead"]);
    expect(nodes).not.toContain("done");
    expect(card("Basis B").textContent).toContain("also in");
    expect(card("Momentum C").textContent).toContain("Needs attention");
    expect(card("Momentum C").textContent).toContain("Deployment attention, Reconciliation open");
    // A missing owner is a statement, not a blank or a dash.
    expect(card("Idea E").textContent).toContain("Owner Not available");
    // No days, no readiness fraction.
    expect(document.querySelector(".exec-fleet-board")!.textContent).not.toMatch(/\d+\s*\/\s*7|\bdays?\b/i);
    // Research has no lifecycle node, so no spine is drawn for it.
    expect(card("Idea E").querySelector(".exec-blk-spine-mini")).toBeNull();
  });

  it("cards are links to the alpha, in column-by-column Tab order, with the name as their accessible name", async () => {
    const { api } = makeApi();
    mount(api, "/execution/fleet?view=board");
    const grp = await board();
    const links = within(grp).getAllByRole("link");
    expect(links.map((a) => a.textContent)).toEqual(["Idea E 0.1", "Carry A 3.2", "Grid D 0.9", "Grid D 0.9", "Basis B 1.4", "Momentum C 2.0", "Basis B 1.4"]);
    expect(links[1]!.getAttribute("href")).toMatch(/^\/deployments\/alphas\/alpha_a/);
    // DOM order is Tab order: lane by lane in spine order, then card by card.
    expect([...document.querySelectorAll(".exec-fleet-card a")]).toEqual(links);
    expect(within(grp).getByRole("link", { name: "Carry A 3.2" })).toBeTruthy();
    // Each lane is a labelled region; a lane with cards is a labelled list.
    expect(screen.getByRole("region", { name: "Paper" })).toBeTruthy();
    expect(screen.getByRole("list", { name: "Paper, 2 loaded" })).toBeTruthy();
  });

  it("a plain click opens the same peek as a table row (sel), a modified click is left to the browser", async () => {
    const { api } = makeApi();
    mount(api, "/execution/fleet?view=board");
    const grp = await board();
    const link = within(grp).getByRole("link", { name: /Carry A/ });
    // jsdom cannot navigate; record whether the card left the click alone, then swallow it.
    let left: boolean | null = null;
    const swallow = (event: Event) => {
      left = !event.defaultPrevented;
      event.preventDefault();
    };
    document.addEventListener("click", swallow);
    fireEvent.click(link, { ctrlKey: true });
    document.removeEventListener("click", swallow);
    expect(left).toBe(true);
    expect(search().get("sel")).toBeNull();
    expect(fireEvent.click(link)).toBe(false);
    expect(search().get("sel")).toBe("alpha_a");
    expect(search().get("view")).toBe("board");
    expect(await screen.findByRole("link", { name: "Open Alpha 360" })).toBeTruthy();
    expect(document.querySelector(".exec-fleet-card[aria-current='true'] .exec-fleet-name")?.textContent).toBe("Carry A");
  });

  it("empty fleet: no columns, the table's own statement", async () => {
    const { api } = makeApi((params) => {
      const body = structuredClone(alphaFleet(params).body) as Record<string, any>;
      body.page.rows = [];
      body.page.total_count = 0;
      body.page.filtered_count = 0;
      body.page.has_more = false;
      body.page.next_cursor = null;
      body.summary.alpha_count = 0;
      body.summary.stage_counts = {};
      return { status: 200, body };
    });
    mount(api, "/execution/fleet?view=board");
    expect(await screen.findByText("The fleet read published no alphas.")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Alpha fleet board" })).toBeNull();
  });

  it("a stage with no loaded rows is an empty column with its published count, or Not available when none is stated", async () => {
    // Only PAPER and SANDBOX rows exist; the summary states Canary as 0 and says nothing about Live.
    const { api } = makeApi((params) => {
      const body = structuredClone(alphaFleet(params).body) as Record<string, any>;
      body.page.rows = body.page.rows.filter((r: any) => r.stage === "PAPER" || r.stage === "SANDBOX");
      body.page.total_count = body.page.filtered_count = body.page.rows.length;
      body.page.has_more = false;
      body.page.next_cursor = null;
      body.summary.stage_counts = { PAPER: 1, SANDBOX: 1, CANARY: 0 };
      return { status: 200, body };
    });
    mount(api, "/execution/fleet?view=board");
    await board();
    expect(lane("Canary").textContent).toContain("0 loaded");
    expect(lane("Canary").textContent).toContain("In your scope: 0");
    expect(lane("Canary").textContent).toContain("No loaded alpha is in this stage.");
    expect(lane("Live").textContent).toContain("In your scope: Not available");
    expect(lane("Live").textContent).not.toContain("In your scope: 0");
    expect(laneNames("Paper")).toEqual(["Carry A", "Grid D"]);
  });

  it("201 alphas: 200 cards at most, the exact label, no Load more, the cap sentence", async () => {
    const { api, calls } = makeApi(scaledAnswer(201));
    mount(api, "/execution/fleet?view=board");
    await board();
    for (let step = 0; step < 3; step += 1) {
      fireEvent.click(await screen.findByRole("button", { name: "Load more" }));
      await waitFor(() => expect(document.querySelectorAll(".exec-fleet-card")).toHaveLength(PAGE_LIMIT * (step + 2)));
    }
    expect(document.querySelectorAll(".exec-fleet-card")).toHaveLength(200);
    expect(screen.getByText("Top 200 of 201 alphas")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
    expect(screen.getByText("Showing the first 200 rows. Narrow the filters to see the rest.")).toBeTruthy();
    expect(screen.getByText(/Loaded rows only: 200 alphas;/)).toBeTruthy();
    expect(calls).toHaveLength(4);
  }, 30_000);

  it("Load more keeps the board and adds cards; the label counts N of total", async () => {
    const { api, calls } = makeApi(scaledAnswer(120));
    mount(api, "/execution/fleet?view=board");
    await board();
    expect(document.querySelectorAll(".exec-fleet-card")).toHaveLength(50);
    expect(screen.getByText("50 of 120 alphas")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(document.querySelectorAll(".exec-fleet-card")).toHaveLength(100));
    expect(screen.getByText("100 of 120 alphas")).toBeTruthy();
    expect(calls.at(-1)!.after).toBe("alpha_0049");
    expect(search().get("view")).toBe("board");
    expect(screen.getByRole("group", { name: "Alpha fleet board" })).toBeTruthy();
  });

  it("URL round trip: lens, filters and view=board are kept, and the query is the table's", async () => {
    const first = makeApi();
    mount(first.api, "/execution/fleet?view=board&stage=paper&owner=Bobby-001&sort=name%3Aasc");
    await board();
    expect(laneNames("Paper")).toEqual(["Carry A", "Grid D"]);
    expect([...document.querySelectorAll("section.exec-fleet-lane h3")].map((h) => h.textContent)).toEqual(["Paper"]);
    expect(screen.getByRole("tab", { name: /^Paper/ }).getAttribute("aria-selected")).toBe("true");
    expect(where()).toBe("/execution/fleet?view=board&stage=paper&owner=Bobby-001&sort=name%3Aasc");
    cleanup();
    const table = makeApi();
    mount(table.api, "/execution/fleet?stage=paper&owner=Bobby-001&sort=name%3Aasc");
    await loaded();
    // One read, same question as the table asks.
    expect(first.calls).toEqual(table.calls);
  });

  it("switching Table to Board does not ask again: view is not part of the query", async () => {
    const { api, getAlphaFleet } = makeApi();
    mount(api);
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Board" }));
    await board();
    expect(getAlphaFleet).toHaveBeenCalledTimes(1);
  });

  it("fails closed exactly as the table: denied, unavailable and thrown reads draw no board", async () => {
    const denied = vi.fn(async () => ({ ok: false as const, status: "denied" as const, reason: "HTTP_403 FORBIDDEN" }));
    mount({ getAlphaFleet: denied } as unknown as ExecutionApi, "/execution/fleet?view=board");
    expect(await screen.findByText("Withheld")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Alpha fleet board" })).toBeNull();
    expect(screen.getByRole("button", { name: "Board" }).getAttribute("aria-pressed")).toBe("true");
    cleanup();
    mount(makeApi(() => ({ status: 503, body: null })).api, "/execution/fleet?view=board");
    expect(await screen.findByText("Unavailable")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Alpha fleet board" })).toBeNull();
    cleanup();
    const thrown = vi.fn(async () => { throw new Error("boom"); });
    mount({ getAlphaFleet: thrown } as unknown as ExecutionApi, "/execution/fleet?view=board");
    expect(await screen.findByText(/PORTAL_READ_FAILED/)).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Alpha fleet board" })).toBeNull();
  });

  it("the Archived lens draws no board and makes no request, as the table", async () => {
    const { api, getAlphaFleet } = makeApi();
    mount(api, "/execution/fleet?view=board&tab=archived");
    expect(screen.getAllByText(/Not published \(FE-034\)/).length).toBeGreaterThan(0);
    expect(screen.queryByRole("group", { name: "Alpha fleet board" })).toBeNull();
    expect(getAlphaFleet).not.toHaveBeenCalled();
  });

  it("a filter that matches nothing offers the same Clear filters", async () => {
    const { api } = makeApi();
    mount(api, "/execution/fleet?view=board&q=zzzz-none");
    expect(await screen.findByText("No alphas match these filters.")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Alpha fleet board" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    await board();
  });
});

/* ── D7: a view the screen does not know is the table ─────────────────────── */

describe("an unknown view is the table (D7 receiving side)", () => {
  it.each(["foo", "Board", "TABLE"])("?view=%s still reads the fleet and shows the table", async (value) => {
    const { api, calls } = makeApi();
    mount(api, `/execution/fleet?view=${value}`);
    await loaded();
    expect(calls.length).toBeGreaterThan(0);
    expect(names()).toEqual(["Carry A", "Basis B", "Momentum C", "Grid D", "Idea E"]);
    expect(screen.queryByLabelText("Loading")).toBeNull();
    expect(screen.getByRole("button", { name: "Table" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Board" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("view=board and view=table keep their meaning", async () => {
    const { api } = makeApi();
    mount(api, "/execution/fleet?view=board");
    expect(await screen.findByRole("group", { name: "Alpha fleet board" })).toBeTruthy();
    cleanup();
    mount(makeApi().api, "/execution/fleet?view=table");
    await loaded();
  });
});

/* ── Back by source: what the Fleet writes on its links into Alpha 360 ────── */

describe("links into Alpha 360 say where they came from (flow audit #8)", () => {
  it("the drawer link carries from=fleet and the list state, not sel", async () => {
    const { api } = makeApi();
    mount(api, "/execution/fleet?q=a&stage=paper&owner=Bobby-001&sort=name%3Aasc&view=table&sel=alpha_a&workspace_id=ws_1");
    const drawer = await screen.findByRole("complementary", { name: "Carry A" });
    const href = within(drawer).getByRole("link", { name: "Open Alpha 360" }).getAttribute("href")!;
    const url = new URL(href, "http://x");
    expect(url.pathname).toBe("/deployments/alphas/alpha_a");
    expect(url.searchParams.get("from")).toBe("fleet");
    expect(url.searchParams.get("workspace_id")).toBe("ws_1");
    expect(url.searchParams.has("sel")).toBe(false);
    const back = new URLSearchParams(url.searchParams.get("back") ?? "");
    expect(Object.fromEntries(back)).toEqual({ q: "a", stage: "paper", owner: "Bobby-001", sort: "name:asc", view: "table" });
  });

  it("with no list state the link carries from=fleet alone", async () => {
    const { api } = makeApi();
    mount(api, "/execution/fleet?sel=alpha_a");
    const drawer = await screen.findByRole("complementary", { name: "Carry A" });
    expect(within(drawer).getByRole("link", { name: "Open Alpha 360" }).getAttribute("href")).toBe("/deployments/alphas/alpha_a?from=fleet");
  });

  it("a board card link carries the same origin, including view=board", async () => {
    const { api } = makeApi();
    mount(api, "/execution/fleet?view=board&owner=Bobby-001");
    const board = await screen.findByRole("group", { name: "Alpha fleet board" });
    const link = within(board).getAllByRole("link")[0]!;
    const url = new URL(link.getAttribute("href")!, "http://x");
    expect(url.searchParams.get("from")).toBe("fleet");
    expect(Object.fromEntries(new URLSearchParams(url.searchParams.get("back") ?? ""))).toEqual({ view: "board", owner: "Bobby-001" });
  });

  it("a list state too long to carry falls back to from=fleet alone", async () => {
    const { api } = makeApi();
    const long = "x".repeat(79);
    mount(api, `/execution/fleet?q=${long}&owner=${long}&health=${long}&sort=${long}&sel=alpha_a`);
    const drawer = await screen.findByRole("complementary", { name: "alpha_a" });
    expect(within(drawer).getByRole("link", { name: "Open Alpha 360" }).getAttribute("href")).toBe("/deployments/alphas/alpha_a?from=fleet");
  });
});
