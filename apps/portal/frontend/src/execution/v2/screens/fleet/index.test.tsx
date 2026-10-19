/**
 * The Fleet screen against the Playwright double's five rows, through the real
 * reader: lenses, filters, sort, paging, the peek drawer, and every state the
 * screen must keep apart.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { alphaFleet } from "../../../../../e2e/bffDouble";
import type { AlphaFleetQuery, ExecutionApi } from "../../../api/ports";
import { readAlphaFleet } from "../../../api/profileRead";
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
    const compare = screen.getAllByRole("button", { name: "Compare" })[0] as HTMLButtonElement;
    expect(compare.disabled).toBe(true);
    expect(compare.title).toBe("Not published (FE-033)");
    expect(document.getElementById(compare.getAttribute("aria-describedby")!)?.textContent).toContain("FE-033");
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

  it("a deep link to Board or Map explains itself and offers the Table; it asks nothing", async () => {
    const { api, getAlphaFleet } = makeApi();
    mount(api, "/execution/fleet?view=board");
    expect(screen.getAllByText("Board").length).toBeGreaterThan(1);
    expect(screen.getAllByText("Not published (FE-012, FE-027)").length).toBeGreaterThan(0);
    expect(getAlphaFleet).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Back to Table" }));
    await loaded();
    expect(where()).toBe("/execution/fleet");
    cleanup();
    mount(api, "/execution/fleet?view=map");
    expect(screen.getAllByText("Not published (FE-035)").length).toBeGreaterThan(0);
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

  it("Owner options come from the loaded page and choosing one asks for it", async () => {
    const { api, calls } = makeApi();
    mount(api);
    await loaded();
    const owner = screen.getByRole("combobox", { name: "Owner" }) as HTMLSelectElement;
    expect([...owner.options].map((o) => o.text)).toEqual(["Owner: all", "Bobby-001", "Lan-002", "Minh-003"]);
    fireEvent.change(owner, { target: { value: "Lan-002" } });
    await waitFor(() => expect(names()).toEqual(["Basis B"]));
    expect(search().get("owner")).toBe("Lan-002");
    expect(calls.at(-1)!.owner).toBe("Lan-002");
    // The other owners stay choosable while one is applied.
    expect([...owner.options].map((o) => o.text)).toContain("Minh-003");
  });

  it("Health filters by the published word and shows its label", async () => {
    const { api, calls } = makeApi();
    mount(api);
    await loaded();
    const health = screen.getByRole("combobox", { name: "Health" }) as HTMLSelectElement;
    expect([...health.options].map((o) => o.text)).toEqual(["Health: all", "Needs attention", "Ready", "Research only"]);
    fireEvent.change(health, { target: { value: "ATTENTION" } });
    await waitFor(() => expect(names()).toEqual(["Momentum C"]));
    expect(calls.at(-1)!.health).toBe("ATTENTION");
    expect(search().get("health")).toBe("ATTENTION");
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
    expect(open.getAttribute("href")).toBe("/deployments/alphas/alpha_b");
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
    expect(within(drawer).getByRole("link", { name: "Open Alpha 360" }).getAttribute("href")).toBe("/deployments/alphas/alpha_zzz");
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
    expect(screen.getByText(/The read is partial/)).toBeTruthy();
  });

  it("stale freshness is a Stale flag with the as-of time", async () => {
    const { api } = makeApi(() => envelopeWith((b) => {
      b.freshness = "STALE";
    }));
    mount(api);
    await loaded();
    expect(screen.getByText("Stale")).toBeTruthy();
    expect(screen.getByText("As of 2026-09-01 15:00:00 UTC")).toBeTruthy();
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
