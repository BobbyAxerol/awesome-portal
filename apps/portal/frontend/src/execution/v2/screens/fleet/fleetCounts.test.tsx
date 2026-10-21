/**
 * Fleet, dataset-source lenses: the KPI strip and the lens counts stay (Bobby, 2026-10-20), the peek drawer, the group choices, the
 * lifecycle flag and the mini spine. Lane BFF_DOUBLE: the port is the REAL HTTP client over a stubbed `fetch` that serves the dataset
 * double (published canonical fixtures); the fleet read is the Playwright double's five rows. A fixture is never a source acceptance.
 *
 * The rule under test: the strip and the tab counts are ALWAYS the fleet read's summary (one count per alpha over the whole authorized
 * scope, not narrowed by the lens or by any table filter), never the dataset's; one small line says which population each number is.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { alphaFleet } from "../../../../../e2e/bffDouble";
import type { AlphaFleetQuery, ExecutionApi } from "../../../api/ports";
import { readAlphaFleet } from "../../../api/profileRead";
import { createHttpApi } from "../../../api/httpApi";
import type { DeliveryPolicy } from "../../../profile";
import { alphasOf, newDatasetDouble, wrapDatasetFetch, type DatasetDoubleState, type DatasetVariant, type DoubleAlpha } from "./datasetDouble.testbase";
import FleetScreen from "./index";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const OPEN: DeliveryPolicy = {
  policyRevision: 4, queryEnabled: true, projectionIngestionEnabled: true, sseEnabled: true, governanceWriteEnabled: true, paperCommandsEnabled: true,
  sandboxCommandsEnabled: true, liveProtectiveCommandsEnabled: true, liveRiskIncreasingCommandsEnabled: true,
};

type FleetAnswer = (query: AlphaFleetQuery) => { ok: true; value: NonNullable<ReturnType<typeof readAlphaFleet>> } | { ok: false; status: "unavailable"; reason: string };

function legacyFleet(override?: FleetAnswer) {
  const calls: AlphaFleetQuery[] = [];
  const getAlphaFleet = vi.fn(async (query: AlphaFleetQuery = {}) => {
    calls.push(query);
    if (override) return override(query);
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== "") params.set(key, String(value));
    const reply = alphaFleet(params);
    const envelope = reply.status === 200 ? readAlphaFleet(reply.body) : null;
    return envelope ? { ok: true as const, value: envelope } : { ok: false as const, status: "unavailable" as const, reason: "UNREADABLE_ALPHA_FLEET" };
  });
  return { getAlphaFleet, calls };
}

interface Harness { api: ExecutionApi; state: DatasetDoubleState; legacy: AlphaFleetQuery[] }
function harness(live: DoubleAlpha[], variant: DatasetVariant = "ok", override?: FleetAnswer): Harness {
  const state = newDatasetDouble({ live }, variant);
  vi.stubGlobal("fetch", wrapDatasetFetch(null, state));
  const http = createHttpApi({ policy: OPEN, readScope: {} });
  const fleet = legacyFleet(override);
  return { api: { getAlphaFleet: fleet.getAlphaFleet, getManagerDataset: http.getManagerDataset } as unknown as ExecutionApi, state, legacy: fleet.calls };
}

function Where() {
  const { pathname, search } = useLocation();
  return <output data-testid="where">{pathname + search}</output>;
}
const mount = (api: ExecutionApi, entry: string) =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <FleetScreen api={api} />
      <Where />
    </MemoryRouter>,
  );
const search = () => new URLSearchParams((screen.getByTestId("where").textContent ?? "").split("?")[1] ?? "");
const table = () => screen.getByRole("table", { name: "Alpha fleet" });
const loaded = async () => screen.findByRole("table", { name: "Alpha fleet" });
const dataRows = () => within(table()).getAllByRole("row").slice(1);
const cell = (row: HTMLElement, label: string) => row.querySelector(`td[data-l='${label}']`)?.textContent ?? "";
const kpis = () =>
  Object.fromEntries([...document.querySelectorAll(".exec-blk-kpi")].map((k) => [k.querySelector("dt")?.textContent ?? "", k.querySelector("dd")?.textContent ?? ""]));
const tabText = (name: RegExp) => screen.getByRole("tab", { name }).textContent ?? "";

const LIVE_URL = "/execution/fleet?stage=canary,live";
const MIXED: DoubleAlpha[] = alphasOf(6, [["LIVE"], ["CANARY", "LIVE"], ["CANARY"]], { healths: ["READY", "ATTENTION", "FINDING"], owners: ["Lan-002", "Bobby-001"] });

describe("the KPI strip and the lens counts stay on a dataset table (Bobby 2026-10-20)", () => {
  it("shows the fleet read's counts above a dataset table, from one one-row, unfiltered read", async () => {
    const { api, legacy } = harness(MIXED);
    mount(api, LIVE_URL);
    await loaded();
    expect(document.querySelector("[data-source='dataset']")).not.toBeNull();
    await waitFor(() => expect(kpis()["Alphas"]).toBe("5"));
    expect(kpis()).toEqual({ Alphas: "5", Deployments: "7", Portfolios: "2", "Need attention": "1", "Research only": "1" });
    // the fleet read made exactly one request: one row, nothing narrowed, no lens, no search
    expect(legacy).toEqual([{ limit: 1 }]);
    // and the tabs carry the fleet read's alpha counts (Real-funded is an upper bound: an alpha in Canary and Live counts in each)
    await waitFor(() => expect(tabText(/^All/)).toContain("5"));
    expect(tabText(/^Real-funded/)).toContain("~3");
    expect(tabText(/^Sandbox/)).toContain("1");
    expect(tabText(/^Paper/)).toContain("2");
    // the table is still the dataset's: six alpha versions, not five alphas
    expect(dataRows()).toHaveLength(6);
  });

  it("states which population each number is, once, in one small line (the long sentence is a tooltip)", async () => {
    const { api } = harness(MIXED);
    mount(api, LIVE_URL);
    await loaded();
    const line = await screen.findByTestId("counts-source");
    expect(line.textContent).toBe("Counts: Fleet read, alphas in your whole scope. Table: Manager dataset, alpha versions in Real-funded.");
    expect(line.title).toContain("not narrowed by the lens or the filters");
    expect(line.title).toMatch(/Counts as of \d{1,2} [A-Z][a-z]{2} \d{2}:\d{2}Z/);
    expect(line.title).toContain("one row per alpha version in a portfolio");
    expect(document.querySelectorAll("[data-testid='counts-source']")).toHaveLength(1);
    // the tab count says what it counts, in its tooltip
    expect(screen.getByRole("tab", { name: /^Real-funded/ }).querySelector(".exec-fleet-tab-count")?.getAttribute("title")).toContain("Alphas (fleet read). The table counts alpha versions in a portfolio (Manager dataset).");
  });

  it("a table filter changes the table and neither the counts nor the counts read", async () => {
    const { api, state, legacy } = harness(MIXED);
    mount(api, LIVE_URL);
    await loaded();
    await waitFor(() => expect(kpis()["Alphas"]).toBe("5"));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search alpha" }), { target: { value: "a-001" } });
    await waitFor(() => expect(dataRows()).toHaveLength(1));
    expect(state.calls.some((call) => call.query.get("q") === "a-001")).toBe(true);
    expect(kpis()["Alphas"]).toBe("5");
    expect(tabText(/^All/)).toContain("5");
    expect(legacy).toEqual([{ limit: 1 }]);
  });

  it("a counts read that fails leaves typed absences, never a zero; the dataset table is not touched", async () => {
    const { api } = harness(MIXED, "ok", () => ({ ok: false, status: "unavailable", reason: "HTTP_503" }));
    mount(api, LIVE_URL);
    await loaded();
    await waitFor(() => expect(Object.keys(kpis())).toHaveLength(5));
    for (const value of Object.values(kpis())) expect(value).toBe("Not available");
    expect(tabText(/^All/)).not.toMatch(/\d/);
    // the population line stays: it still says what the table is and that the counts are the fleet read's
    expect(screen.getByTestId("counts-source")).toBeTruthy();
    expect(dataRows()).toHaveLength(6);
  });

  it("where the fleet read IS the table (the All lens, the board) there is no second population to state", async () => {
    const first = harness(MIXED);
    const view = mount(first.api, "/execution/fleet");
    await loaded();
    await waitFor(() => expect(kpis()["Alphas"]).toBe("5"));
    expect(screen.queryByTestId("counts-source")).toBeNull();
    expect(first.legacy.every((query) => query.limit === 50)).toBe(true);
    view.unmount();
    const second = harness(MIXED);
    mount(second.api, "/execution/fleet?stage=canary,live&view=board");
    await waitFor(() => expect(kpis()["Alphas"]).toBe("5"));
    expect(screen.queryByTestId("counts-source")).toBeNull();
    expect(second.legacy.every((query) => query.limit === 50)).toBe(true);
  });

  it("the Archived lens has no strip and no counts read", async () => {
    const { api, legacy, state } = harness(MIXED);
    mount(api, "/execution/fleet?tab=archived");
    expect(await screen.findByText("Archived alphas")).toBeTruthy();
    expect(document.querySelector(".exec-blk-kpi")).toBeNull();
    expect(legacy).toEqual([]);
    expect(state.calls).toEqual([]);
  });

  it("'Use the fleet read' after a failed dataset read goes back to one population: no population line, the table's own read gives the counts", async () => {
    const { api, state, legacy } = harness(MIXED);
    state.variantFor = (call) => (call.query.get("limit") === "1" ? "ok" : "status:503");
    mount(api, LIVE_URL);
    fireEvent.click(await screen.findByRole("button", { name: "Use the fleet read" }));
    await waitFor(() => expect(screen.queryByTestId("counts-source")).toBeNull());
    await waitFor(() => expect(legacy.some((query) => query.limit === 50)).toBe(true));
    await waitFor(() => expect(kpis()["Alphas"]).toBe("5"));
  });
});

describe("dataset rows: the mini spine, the lifecycle flag, the peek", () => {
  it("a single-stage row draws the mini spine from its published stage; a row with no single stage draws none", async () => {
    const { api } = harness(MIXED);
    mount(api, LIVE_URL);
    await loaded();
    const rows = dataRows();
    const byId = (id: string) => rows.find((row) => cell(row, "Alpha").includes(id))!;
    const nodes = (row: HTMLElement) => [...row.querySelectorAll(".exec-blk-spine-mini i")].map((i) => i.getAttribute("data-s"));
    expect(nodes(byId("a-000"))).toHaveLength(6);
    expect(nodes(byId("a-000"))[5]).toBe("cur");
    expect(nodes(byId("a-002"))[4]).toBe("cur");
    // no history is inferred: nothing before the current stage is drawn as done
    expect(nodes(byId("a-000"))).not.toContain("done");
    expect(nodes(byId("a-001"))).toEqual([]);
  });

  it("an alpha asking to be archived stays on the Fleet with its flag; ACTIVE prints nothing; the stage stays", async () => {
    const population = alphasOf(3, [["LIVE"]], { healths: ["READY"] }).map((alpha, index) => ({ ...alpha, lifecycle: ["ACTIVE", "ARCHIVE_REQUESTED", "ARCHIVED"][index]! }));
    const { api } = harness(population);
    mount(api, LIVE_URL);
    await loaded();
    const health = (index: number) => cell(dataRows()[index]!, "Health");
    expect(health(0)).toContain("Ready");
    expect(health(0)).not.toContain("Archive");
    expect(health(1)).toContain("Archive requested");
    expect(health(2)).toContain("Archived");
    for (const row of dataRows()) expect(cell(row, "Current stage")).toContain("Live");
  });

  it("a row opens its peek (sel = the row key); the name stays a link and does not open it; Close and Escape close it", async () => {
    const { api } = harness(MIXED);
    mount(api, LIVE_URL);
    await loaded();
    const first = dataRows()[0]!;
    // the name is the way to the alpha: it must not also open the peek
    // jsdom cannot navigate: swallow the click after the table had its chance to react to it
    const swallow = (event: Event) => event.preventDefault();
    document.addEventListener("click", swallow, true);
    fireEvent.click(within(first).getByRole("link", { name: "Alpha a-000" }));
    document.removeEventListener("click", swallow, true);
    expect(search().get("sel")).toBeNull();
    fireEvent.click(first.querySelector("td[data-l='Owner']")!);
    await waitFor(() => expect(search().get("sel")).toBe('["a-000","av-1","pf-1"]'));
    const drawer = await screen.findByRole("complementary");
    expect(within(drawer).getByText("Alpha a-000")).toBeTruthy();
    expect(within(drawer).getByText("Version av-1")).toBeTruthy();
    const facts = Object.fromEntries([...drawer.querySelectorAll(".exec-fleet-fact")].map((f) => [f.querySelector("dt")!.textContent, f.querySelector("dd")!.textContent]));
    expect(facts).toMatchObject({ "Alpha id": "a-000", Portfolio: "pf-1", "Current stage": "Live", "In stage": "Not published (FE-027)" });
    // no money, no invented history
    expect(drawer.textContent).not.toMatch(/\bUSDT\b|\bdays?\b/);
    const open = within(drawer).getByRole("link", { name: "Open Alpha 360" });
    expect(open.getAttribute("href")).toMatch(/^\/deployments\/alphas\/a-000/);
    // Compare is disabled with its request id, never hidden
    expect(drawer.textContent).toContain("Not published (FE-033)");
    expect(first.getAttribute("aria-current")).toBe("true");
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(search().get("sel")).toBeNull());
  });

  it("a row with several stages says why in its peek, with the set", async () => {
    const { api } = harness(MIXED);
    mount(api, LIVE_URL);
    await loaded();
    const several = dataRows().find((row) => cell(row, "Alpha").includes("a-001"))!;
    fireEvent.click(several.querySelector("td[data-l='Owner']")!);
    const drawer = await screen.findByRole("complementary");
    expect(drawer.textContent).toContain("No single stage");
    expect(drawer.textContent).toContain("Canary, Live");
    expect(drawer.querySelector(".exec-blk-spine-compact, .exec-blk-spine")).toBeNull();
  });

  it("a deep link to a row that is not loaded says so instead of a blank panel", async () => {
    const { api } = harness(MIXED);
    mount(api, `${LIVE_URL}&sel=${encodeURIComponent('["nobody","av-1","pf-1"]')}`);
    await loaded();
    const drawer = await screen.findByRole("complementary");
    expect(drawer.textContent).toContain("Not in the loaded rows");
  });
});

describe("group choices (guide 8.2): portfolio, stage, owner, health, each only when the dataset states it can group", () => {
  it("groups by owner on the server and prints the groups as the server counts them", async () => {
    const { api, state } = harness(MIXED);
    mount(api, LIVE_URL);
    await loaded();
    const group = screen.getByRole("combobox", { name: "Group by" }) as HTMLSelectElement;
    expect([...group.options].map((option) => option.textContent)).toEqual(["Group: none", "Group: Portfolio", "Group: Current stage", "Group: Owner", "Group: Health"]);
    fireEvent.change(group, { target: { value: "owner_user_id" } });
    await waitFor(() => expect(search().get("group")).toBe("owner_user_id"));
    const groups = await screen.findByTestId("dataset-groups");
    await waitFor(() => expect([...groups.querySelectorAll("li")].map((li) => li.textContent)).toEqual(["Bobby-001: 3", "Lan-002: 3"]));
    expect(state.calls.filter((call) => call.query.get("limit") !== "1").at(-1)!.query.get("group_by")).toBe("owner_user_id");
  });

  it("health groups print the health words, not the codes", async () => {
    const { api } = harness(MIXED);
    mount(api, `${LIVE_URL}&group=health`);
    await loaded();
    const groups = await screen.findByTestId("dataset-groups");
    await waitFor(() => expect([...groups.querySelectorAll("li")].map((li) => li.textContent).sort()).toEqual(["Finding open: 2", "Needs attention: 2", "Ready: 2"]));
  });

  it("a group the dataset does not offer is not on the list, and an unknown URL value is no grouping", async () => {
    const { api, state } = harness(MIXED);
    state.mutate = (body) => {
      const drop = ["owner_user_id", "health", "portfolio_id"];
      body.query_options.sort_fields = body.query_options.sort_fields.filter((field: string) => !drop.includes(field));
      body.query_options.group_fields = body.query_options.group_fields.filter((field: string) => !drop.includes(field));
    };
    mount(api, `${LIVE_URL}&group=owner_user_id`);
    await loaded();
    const group = screen.getByRole("combobox", { name: "Group by" }) as HTMLSelectElement;
    expect([...group.options].map((option) => option.textContent)).toEqual(["Group: none", "Group: Current stage"]);
    expect(group.value).toBe("");
    expect(screen.queryByTestId("dataset-groups")).toBeNull();
  });
});
