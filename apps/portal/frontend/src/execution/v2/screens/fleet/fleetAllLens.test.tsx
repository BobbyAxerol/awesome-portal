/**
 * FE-CAT-3 / FE-CAT-7 · the Fleet All lens over the Manager dataset in ALL mode, screen level. Lane BFF_DOUBLE: the port is the REAL HTTP
 * client over a stubbed `fetch`; the dataset double answers `environment=ALL` only when `offersAll` is on, with the authorized rows of
 * every environment, each labelled and each holding the money of ITS OWN economic domain (USDT in all three: the trap a sum would fall
 * into), one typed coverage entry per environment, and no combined figure. The real reader and the real answers-this-question guard judge
 * every body. A fixture is never a source acceptance; there is no REAL_READ here.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SLOW, SLOW_TEST } from "../../waitsTestUtil";

import { alphaFleet } from "../../../../../e2e/bffDouble";
import type { AlphaFleetQuery, ExecutionApi } from "../../../api/ports";
import { readAlphaFleet } from "../../../api/profileRead";
import { createHttpApi } from "../../../api/httpApi";
import type { DeliveryPolicy } from "../../../profile";
import { alphasOf, newDatasetDouble, openFilters, openNotes, wrapDatasetFetch, type DatasetDoubleState, type DatasetVariant, type DoubleAlpha } from "./datasetDouble.testbase";
import FleetScreen from "./index";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const OPEN: DeliveryPolicy = {
  policyRevision: 4, queryEnabled: true, projectionIngestionEnabled: true, sseEnabled: true, governanceWriteEnabled: true, paperCommandsEnabled: true,
  sandboxCommandsEnabled: true, liveProtectiveCommandsEnabled: true, liveRiskIncreasingCommandsEnabled: true,
};

function legacyFleet() {
  const calls: AlphaFleetQuery[] = [];
  const getAlphaFleet = vi.fn(async (query: AlphaFleetQuery = {}) => {
    calls.push(query);
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== "") params.set(key, String(value));
    const reply = alphaFleet(params);
    const envelope = reply.status === 200 ? readAlphaFleet(reply.body) : null;
    return envelope ? { ok: true as const, value: envelope } : { ok: false as const, status: "unavailable" as const, reason: "UNREADABLE_ALPHA_FLEET" };
  });
  return { getAlphaFleet, calls };
}

type Population = Partial<DatasetDoubleState["population"]>;
interface Harness { api: ExecutionApi; state: DatasetDoubleState; legacy: AlphaFleetQuery[] }
function harness(population: Population, options: { offersAll?: boolean; variant?: DatasetVariant } & Partial<Pick<DatasetDoubleState, "unavailable" | "degraded">> = {}): Harness {
  const state = newDatasetDouble(population, options.variant ?? "ok");
  state.offersAll = options.offersAll ?? true;
  if (options.unavailable) state.unavailable = options.unavailable;
  if (options.degraded) state.degraded = options.degraded;
  vi.stubGlobal("fetch", wrapDatasetFetch(null, state));
  const http = createHttpApi({ policy: OPEN, readScope: {} });
  const legacy = legacyFleet();
  return { api: { getAlphaFleet: legacy.getAlphaFleet, getManagerDataset: http.getManagerDataset } as unknown as ExecutionApi, state, legacy: legacy.calls };
}

function Where() {
  const { pathname, search } = useLocation();
  return <output data-testid="where">{pathname + search}</output>;
}
const ALL_COLUMNS = "cols=owner,in-stage,unrealized,balance,equity,source,select,environment";
const withAllColumns = (entry: string): string => `${entry}${entry.includes("?") ? "&" : "?"}${ALL_COLUMNS}`;
const mount = (api: ExecutionApi, entry: string) =>
  render(
    <MemoryRouter initialEntries={[withAllColumns(entry)]}>
      <FleetScreen api={api} />
      <Where />
    </MemoryRouter>,
  );
const where = () => screen.getByTestId("where").textContent ?? "";
const search = () => new URLSearchParams(where().split("?")[1] ?? "");
const table = () => screen.getByRole("table", { name: "Alpha fleet" });
const loaded = async () => {
  const found = await screen.findByRole("table", { name: "Alpha fleet" }, SLOW);
  openFilters();
  openNotes();
  return found;
};
const dataRows = () => within(table()).getAllByRole("row").slice(1).filter((row) => !row.classList.contains("exec-cards-group"));
const cell = (row: HTMLElement, label: string) => row.querySelector(`td[data-l='${label}']`)?.textContent ?? "";
const isDatasetTable = () => [...table().querySelectorAll("th")].some((th) => th.textContent === "In stage");
const isLegacyTable = () => [...table().querySelectorAll("th")].some((th) => th.textContent === "Deployments");
const rowOf = (name: string) => dataRows().filter((row) => cell(row, "Alpha").includes(name));
const datasetCalls = (state: DatasetDoubleState) => state.calls.filter((call) => call.query.get("limit") !== "1");
const probeCalls = (state: DatasetDoubleState) => state.calls.filter((call) => call.query.get("limit") === "1" && !call.query.has("group_by"));

const alpha = (id: string, stages: string[], money: DoubleAlpha["money"], extra: Partial<DoubleAlpha> = {}): DoubleAlpha =>
  ({ id, name: `Alpha ${id}`, stages, money, health: "READY", owner: "Lan-002", ...extra });
// One alpha id lives in two environments (b-1: Paper and Live): two rows, never one. USDT everywhere.
const POPULATION: Population = {
  paper: [alpha("b-1", ["PAPER"], { netPnl: "11.5", allocation: "1000" }), alpha("p-2", ["PAPER"], {})],
  sandbox: [alpha("s-1", ["SANDBOX"], { netPnl: "-3.25", allocation: "500" })],
  live: [alpha("b-1", ["LIVE"], { netPnl: "900.125", allocation: "20000" }), alpha("l-2", ["CANARY", "LIVE"], { netPnl: "0", allocation: null }, { health: "ATTENTION" })],
};

describe("the All lens reads the dataset in ALL mode when it is offered", () => {
  it("asks ALL (one probe, then the rows), starts no fleet table, and draws one labelled row per alpha version per environment", async () => {
    const { api, state, legacy } = harness(POPULATION);
    mount(api, "/execution/fleet");
    await loaded();
    expect(isDatasetTable()).toBe(true);
    expect(probeCalls(state).map((call) => Object.fromEntries(call.query))).toEqual([{ environment: "ALL", limit: "1" }]);
    expect(datasetCalls(state).map((call) => Object.fromEntries(call.query))).toEqual([{ environment: "ALL", limit: "50" }]);
    // the fleet read's TABLE was not started; its only request is the one-row counts read
    expect(legacy).toEqual([{ limit: 1 }]);
    const chip = document.querySelector("[data-source='dataset']");
    expect(chip?.textContent).toBe("Manager dataset · alpha versions · all environments");
    expect(dataRows()).toHaveLength(5);
    const b1 = rowOf("Alpha b-1");
    expect(b1.map((row) => cell(row, "Environment")).sort()).toEqual(["Paper", "Real-funded"]);
    expect(rowOf("Alpha s-1").map((row) => cell(row, "Environment"))).toEqual(["Sandbox"]);
  });

  it("prints each money cell under its own partition tag (domain and currency) and adds nothing across environments", async () => {
    const { api } = harness(POPULATION);
    mount(api, "/execution/fleet");
    await loaded();
    const paper = rowOf("Alpha b-1").find((row) => cell(row, "Environment") === "Paper")!;
    const live = rowOf("Alpha b-1").find((row) => cell(row, "Environment") === "Real-funded")!;
    const sandbox = rowOf("Alpha s-1")[0]!;
    expect(cell(paper, "PNL Amount")).toContain("Paper · USDT");
    expect(cell(paper, "PNL Amount")).toContain("11.5");
    expect(cell(paper, "Alloc")).toContain("1,000");
    expect(cell(live, "PNL Amount")).toContain("Real-funded · USDT");
    expect(cell(live, "PNL Amount")).toContain("900.125");
    expect(cell(live, "PNL Amount")).not.toContain("Paper");
    expect(cell(sandbox, "PNL Amount")).toContain("Sandbox · USDT");
    expect(cell(sandbox, "PNL Amount")).toContain("3.25");
    // a true zero is printed as zero; an alpha with no allocation says so, it is not a 0
    const zero = rowOf("Alpha l-2")[0]!;
    expect(cell(zero, "PNL Amount")).toMatch(/Real-funded · USDT\s*0/);
    expect(cell(zero, "Alloc")).toContain("Not available");
    // no figure on the screen is a sum over environments or over the one currency
    const text = document.body.textContent ?? "";
    for (const sum of ["908.375", "911.625", "21,500", "21500", "20,500", "1,500"]) expect(text).not.toContain(sum);
    // the partition tag names the basis and the profile on its title, so a cell can be traced
    const tag = paper.querySelector("td[data-l='PNL Amount'] .exec-fleet-part-tag") as HTMLElement;
    expect(tag.title).toContain("PAPER");
    expect(tag.title).toContain("TEST_ONLY:net-ledger");
    expect(tag.title).toContain("TEST_ONLY:paper-ledger");
  });

  it("types every environment in one strip: a count each, a true zero, a degraded one with its reasons, a missing one with its reason", async () => {
    const { api } = harness({ ...POPULATION, sandbox: [] }, {
      unavailable: { live: "PUBLICATION_NOT_QUALIFIED" },
      degraded: { paper: { completeness: "PARTIAL", freshness: "STALE", reasons: ["lagging source"] } },
    });
    mount(api, "/execution/fleet");
    await loaded();
    const strip = screen.getByTestId("env-coverage");
    expect(within(strip).getAllByRole("listitem").map((item) => item.getAttribute("data-environment"))).toEqual(["paper", "sandbox", "live"]);
    expect(screen.getByTestId("env-count-paper").textContent).toBe("2 rows");
    // an environment that answered with nothing is a counted zero, not an absence
    expect(screen.getByTestId("env-count-sandbox").textContent).toBe("0 rows");
    expect(screen.queryByTestId("env-count-live")).toBeNull();
    const live = strip.querySelector("[data-environment='live']") as HTMLElement;
    expect(live.getAttribute("data-availability")).toBe("UNAVAILABLE");
    fireEvent.click(within(live).getByRole("button", { name: "Not available, reason" }));
    expect(live.textContent).toContain("The source publication for this environment is not qualified yet.");
    expect(live.textContent).toContain("PUBLICATION_NOT_QUALIFIED");
    const paper = strip.querySelector("[data-environment='paper']") as HTMLElement;
    expect(paper.textContent).toContain("Partial, Stale");
    fireEvent.click(within(paper).getByRole("button", { name: "Why Paper is not clean" }));
    expect(paper.textContent).toContain("lagging source");
    // a body that lost an environment is never presented as complete
    expect(document.querySelector(".exec-fleet-banner")?.textContent).toMatch(/partial and unknown/i);
    // the rows of the environments that answered still show (Paper's two; Sandbox answered with none); none is drawn for the missing one
    expect(dataRows()).toHaveLength(2);
    expect(dataRows().map((row) => cell(row, "Environment")).includes("Real-funded")).toBe(false);
  });

  it("keeps Group by, Then and Sort as the server's own, over ALL", async () => {
    const { api, state } = harness(POPULATION);
    mount(api, "/execution/fleet");
    await loaded();
    fireEvent.change(screen.getByRole("combobox", { name: "Group by" }), { target: { value: "health" } });
    await waitFor(() => expect(datasetCalls(state).some((call) => call.query.get("group_by") === "health")).toBe(true), SLOW);
    const grouped = datasetCalls(state).find((call) => call.query.get("group_by") === "health")!;
    expect(grouped.query.get("environment")).toBe("ALL");
    expect(await screen.findByTestId("dataset-groups")).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox", { name: "Then group by" }), { target: { value: "portfolio_id" } });
    await waitFor(() => expect(datasetCalls(state).some((call) => call.query.get("group_by") === "health,portfolio_id")).toBe(true), SLOW);
    fireEvent.change(screen.getByRole("combobox", { name: "Sort" }), { target: { value: "name:asc" } });
    await waitFor(() => expect(datasetCalls(state).some((call) => call.query.get("sort") !== null)).toBe(true), SLOW);
    expect(JSON.parse(datasetCalls(state).at(-1)!.query.get("sort")!)).toEqual([{ field: "name", direction: "asc" }]);
    expect(datasetCalls(state).every((call) => call.query.get("environment") === "ALL")).toBe(true);
  });

  it("a stage selection across environments is an ALL question with the stage words, the Archived lens asks nothing", async () => {
    const { api, state } = harness(POPULATION);
    mount(api, "/execution/fleet?stage=paper,live");
    await loaded();
    expect(isDatasetTable()).toBe(true);
    const rows = datasetCalls(state);
    expect(rows.map((call) => [call.query.get("environment"), call.query.get("stage_filter")])).toEqual([["ALL", "LIVE,PAPER"]]);
    cleanup();
    const archived = harness(POPULATION);
    mount(archived.api, "/execution/fleet?tab=archived");
    await screen.findByText(/Not published: archived list/);
    expect(archived.state.calls).toEqual([]);
  });

  it("pages ALL with the unchanged cursor: Showing N of M counts rows, one snapshot, and Load more appends", async () => {
    const live = alphasOf(60, [["LIVE"]], { prefix: "l" }).map((value) => ({ ...value, money: { netPnl: "1" } }));
    const { api, state } = harness({ live, paper: [alpha("p-1", ["PAPER"], { netPnl: "2" })] });
    mount(api, "/execution/fleet");
    await loaded();
    expect(dataRows()).toHaveLength(50);
    expect(screen.getByText("Showing 50 of 61 rows. Load more for the rest.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(dataRows()).toHaveLength(61), SLOW);
    expect(screen.getByText("Showing all 61 rows")).toBeTruthy();
    const pages = datasetCalls(state);
    expect(pages).toHaveLength(2);
    expect(pages[1]!.query.get("environment")).toBe("ALL");
    expect(pages[1]!.query.get("after")).toBeTruthy();
    // the per-environment counts are of the whole filtered query, on every page
    expect(screen.getByTestId("env-count-live").textContent).toBe("60 rows");
    expect(screen.getByTestId("env-count-paper").textContent).toBe("1 row");
  }, SLOW_TEST);

  it("opens the peek of a row and names its environment", async () => {
    const { api } = harness(POPULATION);
    mount(api, "/execution/fleet");
    await loaded();
    const paper = rowOf("Alpha b-1").find((row) => cell(row, "Environment") === "Paper")!;
    fireEvent.click(paper);
    await waitFor(() => expect(search().get("sel")).toBeTruthy());
    expect(JSON.parse(search().get("sel")!)).toEqual(["paper", "b-1", "av-1", "pf-1"]);
    const dock = await screen.findByText("Environment", { selector: "dt" });
    expect(dock.parentElement?.textContent).toContain("Paper");
  });
});

describe("FE-CAT-7 · the money columns say where they come from", () => {
  it("opens one disclosure with the partition, basis, profile, coverage per column and the ownership gap, and sums nothing", async () => {
    const { api } = harness(POPULATION);
    mount(api, "/execution/fleet");
    await loaded();
    const note = screen.getByTestId("money-provenance");
    expect(note.textContent).toContain("never added across partitions or environments");
    fireEvent.click(within(note).getByRole("button", { name: "Where the money columns come from" }));
    const text = note.textContent ?? "";
    for (const line of ["Real-funded · USDT: basis TEST_ONLY:net-ledger; profile TEST_ONLY:live-ledger", "Paper · USDT: basis TEST_ONLY:net-ledger; profile TEST_ONLY:paper-ledger",
      "Sandbox · USDT: basis TEST_ONLY:net-ledger; profile TEST_ONLY:sandbox-ledger"]) expect(text).toContain(line);
    expect(text).toContain("Allocation: 1 of 1 loaded rows publish a figure");
    expect(text).toContain("Ownership: not published");
    expect(text).toContain("three figures");
  });

  it("the single-environment table keeps the same disclosure for its own partition", async () => {
    const { api } = harness(POPULATION);
    mount(api, "/execution/fleet?stage=paper");
    await loaded();
    expect(screen.queryByTestId("env-coverage")).toBeNull();
    expect(screen.queryByText("Environment", { selector: "th" })).toBeNull();
    fireEvent.click(within(screen.getByTestId("money-provenance")).getByRole("button", { name: "Where the money columns come from" }));
    expect(screen.getByTestId("money-provenance").textContent).toContain("Ownership: not published");
  });
});

describe("the Map over ALL: one partition at a time, environments never on one map", () => {
  it("draws the chosen partition's rows and counts the rows of the other environments as belonging elsewhere", async () => {
    const { api } = harness(POPULATION);
    mount(api, "/execution/fleet?view=map");
    const map = await screen.findByTestId("fleet-map", {}, SLOW);
    const buttons = within(within(map).getByRole("group", { name: "Map partition" })).getAllByRole("button").map((button) => button.textContent);
    expect(buttons.sort()).toEqual(["Paper · USDT", "Real-funded · USDT", "Sandbox · USDT"]);
    const tiles = () => within(map).getAllByRole("listitem").filter((item) => item.className.includes("exec-fleet-tile")).length;
    // Real-funded first (published order): only the live alpha with an allocation is drawn; the other 3 rows are of other environments
    expect(tiles()).toBe(1);
    expect(screen.getByTestId("map-elsewhere").textContent).toContain("3 loaded rows belong to other environments");
    fireEvent.click(within(map).getByRole("button", { name: "Paper · USDT" }));
    expect(tiles()).toBe(1);
    expect(screen.getByTestId("map-elsewhere").textContent).toContain("3 loaded rows belong to other environments");
    // the rows with no allocation in THIS environment are listed as such, never the other environments' rows
    expect(screen.getByTestId("map-undrawn").textContent).toContain("Alpha p-2");
    expect(screen.getByTestId("map-undrawn").textContent).not.toContain("Alpha s-1");
  });
});

describe("when the dataset does not answer ALL, nothing is faked", () => {
  it.each([
    ["not offered (400)", { offersAll: false }],
    ["refused (503)", { variant: "status:503" as DatasetVariant }],
    ["a body of one environment (not ALL-shaped)", { variant: "wrong:environment" as DatasetVariant }],
    ["another schema", { variant: "other-schema" as DatasetVariant }],
    ["a body the reader refuses", { variant: "malformed" as DatasetVariant }],
  ])("%s: the All lens is today's fleet read with its typed absences", async (_name, options) => {
    const { api, legacy } = harness(POPULATION, options);
    mount(api, "/execution/fleet");
    await loaded();
    expect(isLegacyTable()).toBe(true);
    expect(legacy.length).toBeGreaterThanOrEqual(1);
    expect(document.querySelector("[data-source='fleet']")?.textContent).toBe("Fleet read · alphas");
    expect(screen.queryByTestId("env-coverage")).toBeNull();
    expect(screen.queryByTestId("money-provenance")).toBeNull();
    expect((screen.getByRole("button", { name: "Map" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("a page answered with another environment's rows is refused, not drawn", async () => {
    const { api, state } = harness(POPULATION);
    // the probe is honest; the rows come back with an unlabelled row (an ALL body whose row lost its environment)
    state.mutate = (body, call) => {
      if (call.query.get("limit") !== "1") delete body.items[0].environment;
    };
    mount(api, "/execution/fleet");
    expect((await screen.findAllByText(/MANAGER_DATASET_REFUSED|could not be read/, {}, SLOW)).length).toBeGreaterThan(0);
    expect(screen.queryByRole("table", { name: "Alpha fleet" })).toBeNull();
  });
});
