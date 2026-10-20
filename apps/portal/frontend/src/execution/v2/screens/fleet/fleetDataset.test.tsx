/**
 * Fleet over the Manager DATASET (FE-012 sort/group by current stage, FE-027 current stage and days in stage), screen level.
 * Lane BFF_DOUBLE: the port is the REAL HTTP client over a stubbed `fetch`; the dataset double (`datasetDouble.testbase.ts`) is a small
 * server that applies the query to a population and answers with bodies built from the published canonical fixtures
 * (`lifecycle.live`, `partitions`), so the real reader and the real answers-this-question guard judge every body. The legacy fleet
 * read is the Playwright double's five rows. A fixture is never a source acceptance; there is no REAL_READ here.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { alphaFleet } from "../../../../../e2e/bffDouble";
import type { AlphaFleetQuery, ExecutionApi } from "../../../api/ports";
import { readAlphaFleet } from "../../../api/profileRead";
import { createHttpApi } from "../../../api/httpApi";
import type { DeliveryPolicy } from "../../../profile";
import { fixtureValue, FIXTURE_LIFECYCLE_LIVE, FIXTURE_PARTITIONS, type Draft } from "../../readers/managerDataset.testbase";
import { alphasOf, newDatasetDouble, SNAPSHOT_B, wrapDatasetFetch, type DatasetDoubleState, type DatasetVariant, type DoubleAlpha } from "./datasetDouble.testbase";
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

interface Harness { api: ExecutionApi; state: DatasetDoubleState; legacy: AlphaFleetQuery[] }

/** The port: the legacy fleet read (the Playwright double) beside the REAL `getManagerDataset` over the dataset double. */
function harness(population: Partial<DatasetDoubleState["population"]> = {}, variant: DatasetVariant = "ok"): Harness {
  const state = newDatasetDouble(population, variant);
  vi.stubGlobal("fetch", wrapDatasetFetch(null, state));
  const http = createHttpApi({ policy: OPEN, readScope: {} });
  const legacy = legacyFleet();
  return { api: { getAlphaFleet: legacy.getAlphaFleet, getManagerDataset: http.getManagerDataset } as unknown as ExecutionApi, state, legacy: legacy.calls };
}

function Where() {
  const { pathname, search } = useLocation();
  return <output data-testid="where">{pathname + search}</output>;
}
const mount = (api: ExecutionApi, entry: string, workspaceId?: string) =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <FleetScreen api={api} {...(workspaceId ? { workspaceId } : {})} />
      <Where />
    </MemoryRouter>,
  );
const where = () => screen.getByTestId("where").textContent ?? "";
const search = () => new URLSearchParams(where().split("?")[1] ?? "");
const table = () => screen.getByRole("table", { name: "Alpha fleet" });
const loaded = async () => screen.findByRole("table", { name: "Alpha fleet" });
const dataRows = () => within(table()).getAllByRole("row").slice(1);
const cell = (row: HTMLElement, label: string) => row.querySelector(`td[data-l='${label}']`)?.textContent ?? "";
const ids = () => dataRows().map((row) => cell(row, "Alpha"));
/** The fleet read's table has a Deployments column; the dataset's has Current stage and In stage. Neither has the other's. */
const isLegacyTable = () => [...table().querySelectorAll("th")].some((th) => th.textContent === "Deployments");
const isDatasetTable = () => [...table().querySelectorAll("th")].some((th) => th.textContent === "In stage");
const datasetCalls = (state: DatasetDoubleState) => state.calls.filter((call) => call.query.get("limit") !== "1");
const probeCalls = (state: DatasetDoubleState) => state.calls.filter((call) => call.query.get("limit") === "1");

/** A published fixture body paged as the query asks (the probe asks for one row): only the page envelope and the rows kept change. */
function pagedLike(body: Draft, limit: number): Draft {
  const total = body.items.length;
  body.items = body.items.slice(0, limit);
  body.page = { limit, returned_count: body.items.length, authorized_filtered_count: total, next_cursor: body.items.length < total ? "probe-cursor" : null, previous_cursor: null };
  return body;
}

const LIVE_URL ="/execution/fleet?stage=canary,live&src=dataset";
/** 2 single-LIVE, 2 single-CANARY, 2 with both: a fleet where `current_stage` splits three ways. */
const MIXED: DoubleAlpha[] = alphasOf(6, [["LIVE"], ["CANARY", "LIVE"], ["CANARY"]], { healths: ["READY", "ATTENTION", "FINDING"], owners: ["Lan-002", "Bobby-001"] });

describe("not published: today's screen, exactly", () => {
  it("the All lens never asks for the dataset (it spans environments)", async () => {
    const { api, state } = harness({ live: MIXED });
    mount(api, "/execution/fleet");
    await loaded();
    expect(state.calls).toEqual([]);
    expect(screen.queryByRole("group", { name: "Source" })).toBeNull();
  });

  it.each(["status:404", "status:503", "status:403", "garbage", "other-schema", "malformed", "wrong:environment"] as DatasetVariant[])(
    "a single-environment lens whose dataset answers %s keeps today's controls and the fleet read",
    async (variant) => {
      const { api, state, legacy } = harness({ live: MIXED }, variant);
      mount(api, "/execution/fleet?stage=live");
      await loaded();
      await waitFor(() => expect(probeCalls(state)).toHaveLength(1));
      expect(legacy.length).toBeGreaterThanOrEqual(1);
      expect(isLegacyTable()).toBe(true);
      expect(screen.queryByRole("group", { name: "Source" })).toBeNull();
      // the control set is unchanged: Group is the disabled "Not published (FE-012)" select, Health is a plain select, Sort has the fleet words
      const group = screen.getByRole("combobox", { name: "Group by" }) as HTMLSelectElement;
      expect(group.disabled).toBe(true);
      expect(group.title).toBe("Not published (FE-012)");
      expect(screen.getByRole("combobox", { name: "Health" })).toBeTruthy();
      const sort = screen.getByRole("combobox", { name: "Sort" }) as HTMLSelectElement;
      expect([...sort.options].map((option) => option.textContent)).toEqual([
        "Sort: Highest stage first", "Sort: Name, A to Z", "Sort: Recently updated", "Sort: Needs attention first", "Sort: Lowest stage first",
      ]);
    },
  );

  it("a port without the method is not a crash and not a control", async () => {
    const legacy = legacyFleet();
    mount({ getAlphaFleet: legacy.getAlphaFleet } as unknown as ExecutionApi, "/execution/fleet?stage=live");
    await loaded();
    expect(screen.queryByRole("group", { name: "Source" })).toBeNull();
  });

  it("a URL that asks for the dataset where it is not published shows the fleet read and says so", async () => {
    const { api } = harness({ live: MIXED }, "status:404");
    mount(api, LIVE_URL);
    await loaded();
    expect(screen.getByText(/The Manager dataset is not published for this view/)).toBeTruthy();
    expect(isLegacyTable()).toBe(true);
  });

  it("a stage set across environments is not a dataset question: no request, a sentence", async () => {
    const { api, state } = harness({ live: MIXED, paper: MIXED });
    mount(api, "/execution/fleet?stage=paper,live&src=dataset");
    await loaded();
    expect(state.calls).toEqual([]);
    expect(screen.getByText(/serves one environment at a time/)).toBeTruthy();
  });
});

describe("published: the dataset is offered, never imposed", () => {
  it("offers Source once the dataset answers, with the fleet read still the default (one tiny probe, no rows read)", async () => {
    const { api, state, legacy } = harness({ live: MIXED });
    mount(api, "/execution/fleet?stage=canary,live");
    const source = await screen.findByRole("group", { name: "Source" });
    expect(within(source).getByRole("button", { name: "Fleet read" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(source).getByRole("button", { name: "Manager dataset" }).getAttribute("aria-pressed")).toBe("false");
    expect(probeCalls(state)).toHaveLength(1);
    expect(Object.fromEntries(probeCalls(state)[0]!.query)).toEqual({ environment: "live", limit: "1" });
    expect(datasetCalls(state)).toEqual([]);
    expect(legacy.length).toBeGreaterThan(0);
    expect(isLegacyTable()).toBe(true);
  });

  it("choosing the dataset writes src=dataset and reads the rows the server returns", async () => {
    const { api, state } = harness({ live: MIXED });
    mount(api, "/execution/fleet?stage=canary,live");
    const source = await screen.findByRole("group", { name: "Source" });
    fireEvent.click(within(source).getByRole("button", { name: "Manager dataset" }));
    await waitFor(() => expect(search().get("src")).toBe("dataset"));
    await waitFor(() => expect(datasetCalls(state)).toHaveLength(1));
    await waitFor(() => expect(dataRows()).toHaveLength(6));
    expect(isDatasetTable()).toBe(true);
    const first = datasetCalls(state)[0]!.query;
    expect(Object.fromEntries(first)).toEqual({ environment: "live", limit: "50" });
  });
});

describe("dataset mode: rows, current stage, days in stage", () => {
  it("prints identity, the producer's current stage, and Not published (FE-027) for days in stage with the typed reason", async () => {
    const { api, legacy } = harness({ live: MIXED });
    mount(api, LIVE_URL);
    await loaded();
    // the legacy fleet read is not made while the dataset is the source
    expect(legacy).toEqual([]);
    const rows = dataRows();
    expect(rows).toHaveLength(6);
    const byId = (id: string) => rows.find((row) => cell(row, "Alpha").includes(id))!;
    expect(cell(byId("a-000"), "Current stage")).toBe("Live");
    expect(cell(byId("a-002"), "Current stage")).toBe("Canary");
    expect(cell(byId("a-001"), "Current stage")).toContain("No single stage");
    expect(cell(byId("a-001"), "Current stage")).toContain("in Canary, Live");
    expect(byId("a-001").querySelector("td[data-l='Current stage'] [title]")?.getAttribute("title")).toBe("MULTIPLE_ACTIVE_STAGES");
    for (const row of rows) {
      expect(cell(row, "In stage")).toBe("Not published (FE-027)");
      expect(row.querySelector("td[data-l='In stage'] [title]")?.getAttribute("title")).toBe("STAGE_ENTRY_TIME_NOT_PUBLISHED");
    }
    expect(cell(byId("a-000"), "Portfolio")).toBe("pf-1");
    expect(cell(byId("a-000"), "Owner")).toBe("Lan-002");
    expect(cell(byId("a-000"), "Health")).toContain("Ready");
    expect(document.body.textContent).toContain("Days in stage (FE-027)");
  });

  it("never prints a dash, N/A or a bare zero for an absent value", async () => {
    const { api } = harness({ live: alphasOf(3, [["LIVE"]], { owners: [null], healths: [null] }) });
    const { container } = mount(api, LIVE_URL);
    await loaded();
    const cells = [...container.querySelectorAll("td")].map((td) => (td.textContent ?? "").trim());
    expect(cells.filter((text) => /^(-|–|—|N\/A|0)?$/.test(text))).toEqual([]);
    expect(container.textContent).not.toMatch(/—|–|N\/A/);
    const rows = dataRows();
    expect(cell(rows[0]!, "Owner")).toBe("Not available");
    expect(cell(rows[0]!, "Health")).toBe("Not available");
  });

  it("prints the contract's scope sentences: stage rule, groups over the whole result, statements before the table filters", async () => {
    const { api } = harness({ live: MIXED });
    mount(api, LIVE_URL);
    await loaded();
    const note = screen.getByTestId("dataset-note").textContent ?? "";
    expect(note).toContain("Source: the Manager dataset, live.");
    expect(note).toContain("Current stage is the single active stage");
    expect(note).toContain("the stage entry time is not published");
    expect(note).toContain("capital statements, which this screen does not show, are taken before the table filters");
  });

  it("reads the canonical lifecycle.live fixture as published (single LIVE; Canary+Live has no single stage)", async () => {
    const state = newDatasetDouble();
    vi.stubGlobal("fetch", async (url: string) => {
      const asked = new URL(url, "http://portal.test");
      const body = pagedLike(fixtureValue(FIXTURE_LIFECYCLE_LIVE), Number(asked.searchParams.get("limit")));
      state.calls.push({ path: asked.pathname, query: asked.searchParams, filters: null, sort: null, window: null });
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    });
    const http = createHttpApi({ policy: OPEN, readScope: {} });
    mount({ getAlphaFleet: legacyFleet().getAlphaFleet, getManagerDataset: http.getManagerDataset } as unknown as ExecutionApi, LIVE_URL);
    await loaded();
    const rows = dataRows();
    expect(rows.map((row) => cell(row, "Current stage"))).toEqual(["Live", "No single stagein Canary, Live"]);
    expect(cell(rows[0]!, "Health")).toBe("Not available");
    expect(screen.getByText(/Quality|The dataset is partial and stale/i)).toBeTruthy();
  });

  it("reads the canonical partitions fixture on the paper lens (money partitions are in the body, none on the screen)", async () => {
    vi.stubGlobal("fetch", async (url: string) => {
      const asked = new URL(url, "http://portal.test");
      const body = pagedLike(fixtureValue(FIXTURE_PARTITIONS), Number(asked.searchParams.get("limit")));
      // asked without a group: the published fixture's one group is another question, so the double drops it (the guard is tested in the port suite)
      body.groups = [];
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    });
    const http = createHttpApi({ policy: OPEN, readScope: {} });
    const { container } = mount({ getAlphaFleet: legacyFleet().getAlphaFleet, getManagerDataset: http.getManagerDataset } as unknown as ExecutionApi, "/execution/fleet?stage=paper&src=dataset");
    await loaded();
    expect(dataRows().map((row) => cell(row, "Current stage"))).toEqual(["Paper", "Paper"]);
    expect(container.textContent).not.toMatch(/USDT|EUR/);
  });
});

describe("dataset mode: sort and group by current stage (FE-012)", () => {
  it("offers the current-stage sorts only because the dataset lists current_stage in sort_fields, and sorts on the server (nulls last both ways)", async () => {
    const { api, state } = harness({ live: MIXED });
    mount(api, LIVE_URL);
    await loaded();
    const sort = screen.getByRole("combobox", { name: "Sort" }) as HTMLSelectElement;
    expect([...sort.options].map((option) => option.textContent)).toEqual(["Sort: Server order", "Sort: Name, A to Z", "Sort: Current stage, A to Z", "Sort: Current stage, Z to A"]);
    fireEvent.change(sort, { target: { value: "current_stage:asc" } });
    await waitFor(() => expect(search().get("sort")).toBe("current_stage:asc"));
    await waitFor(() => expect(datasetCalls(state)).toHaveLength(2));
    expect(datasetCalls(state)[1]!.sort).toEqual([{ field: "current_stage", direction: "asc" }, { field: "alpha_id", direction: "asc" }]);
    await waitFor(() => expect(dataRows().map((row) => cell(row, "Current stage").slice(0, 6))).toEqual(["Canary", "Canary", "Live", "Live", "No sin", "No sin"]));
    fireEvent.change(sort, { target: { value: "current_stage:desc" } });
    await waitFor(() => expect(dataRows().map((row) => cell(row, "Current stage").slice(0, 6))).toEqual(["Live", "Live", "Canary", "Canary", "No sin", "No sin"]));
    expect(datasetCalls(state)[2]!.sort).toEqual([{ field: "current_stage", direction: "desc" }, { field: "alpha_id", direction: "asc" }]);
  });

  it("a sort in the URL the dataset does not offer is the server order, not a request the server would refuse", async () => {
    const { api, state } = harness({ live: MIXED });
    mount(api, `${LIVE_URL}&sort=alpha_label:asc`);
    await loaded();
    expect(datasetCalls(state)[0]!.sort).toBeNull();
  });

  it("groups by current stage on the server: the groups cover the WHOLE filtered result while the page holds 50", async () => {
    const { api, state } = harness({ live: alphasOf(130, [["LIVE"], ["CANARY"], ["CANARY", "LIVE"]]) });
    mount(api, LIVE_URL);
    await loaded();
    const group = screen.getByRole("combobox", { name: "Group by" }) as HTMLSelectElement;
    expect(group.disabled).toBe(false);
    expect([...group.options].map((option) => option.textContent)).toEqual(["Group: none", "Group: Current stage"]);
    fireEvent.change(group, { target: { value: "current_stage" } });
    await waitFor(() => expect(search().get("group")).toBe("current_stage"));
    const groups = await screen.findByTestId("dataset-groups");
    await waitFor(() => expect([...groups.querySelectorAll("li")].map((li) => li.textContent)).toEqual(["Canary: 43", "Live: 44", "No single stage: 43"]));
    expect(datasetCalls(state).at(-1)!.query.get("group_by")).toBe("current_stage");
    // 43 + 44 + 43 = 130 rows in the filtered result, and 50 on the page
    expect(dataRows()).toHaveLength(50);
    expect(document.querySelector(".exec-fleet-count-line")?.textContent).toBe("Showing 50 of 130 rows. Load more for the rest.");
  });

  it("going back to the fleet read drops what only the dataset understands", async () => {
    const { api } = harness({ live: MIXED });
    mount(api, `${LIVE_URL}&group=current_stage&health=ATTENTION,READY`);
    await loaded();
    const source = screen.getByRole("group", { name: "Source" });
    fireEvent.click(within(source).getByRole("button", { name: "Fleet read" }));
    await waitFor(() => expect(search().get("src")).toBeNull());
    expect(search().get("group")).toBeNull();
    expect(search().get("health")).toBeNull();
    await waitFor(() => expect(isLegacyTable()).toBe(true));
  });
});

describe("dataset mode: filters are the server's (never a client-side narrowing of a partial page)", () => {
  it("one health is EQ and two are IN, and the rows are exactly what the server returned", async () => {
    const { api, state } = harness({ live: MIXED });
    mount(api, LIVE_URL);
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Health" }));
    const menu = screen.getByRole("group", { name: "Health" });
    fireEvent.click(within(menu).getByRole("checkbox", { name: "Ready" }));
    await waitFor(() => expect(search().get("health")).toBe("READY"));
    await waitFor(() => expect(datasetCalls(state).at(-1)!.filters).toEqual([{ field: "health", op: "EQ", value: "READY" }]));
    await waitFor(() => expect(dataRows()).toHaveLength(2));
    fireEvent.click(within(screen.getByRole("group", { name: "Health" })).getByRole("checkbox", { name: "Needs attention" }));
    await waitFor(() => expect(search().get("health")).toBe("ATTENTION,READY"));
    await waitFor(() => expect(datasetCalls(state).at(-1)!.filters).toEqual([{ field: "health", op: "IN", values: ["ATTENTION", "READY"] }]));
    await waitFor(() => expect(dataRows()).toHaveLength(4));
    expect(screen.getByRole("button", { name: "Health" }).textContent).toContain("Health: Needs attention +1");
    expect(screen.getByText("health: Needs attention, Ready")).toBeTruthy();
  });

  it("a server that ignores the filter is REFUSED (the screen does not quietly filter the page itself)", async () => {
    const { api } = harness({ live: MIXED }, "wrong:filter");
    mount(api, `${LIVE_URL}&health=READY`);
    // the probe has no filter, so it is published; the filtered read is the one the guard refuses
    await waitFor(() => expect(document.body.textContent).toContain("MANAGER_DATASET_ANSWERS_ANOTHER_QUERY filters"));
    expect(screen.queryByRole("table", { name: "Alpha fleet" })).toBeNull();
    expect(screen.getByText("Unavailable")).toBeTruthy();
  });

  it("search and owner are server filters too", async () => {
    const { api, state } = harness({ live: MIXED });
    mount(api, `${LIVE_URL}&owner=Lan-002&q=a-00`);
    await loaded();
    const query = datasetCalls(state)[0]!.query;
    expect(query.get("q")).toBe("a-00");
    expect(query.get("q_mode")).toBe("CONTAINS");
    expect(datasetCalls(state)[0]!.filters).toEqual([{ field: "owner_user_id", op: "EQ", value: "Lan-002" }]);
    expect(dataRows()).toHaveLength(3);
    expect(dataRows().every((row) => cell(row, "Owner") === "Lan-002")).toBe(true);
  });

  it("a lens that is one stage of the environment sends stage_filter; the whole environment sends none", async () => {
    const { api, state } = harness({ live: MIXED });
    mount(api, "/execution/fleet?stage=canary&src=dataset");
    await loaded();
    expect(datasetCalls(state)[0]!.query.get("stage_filter")).toBe("CANARY");
    // a canary-only view: a two-stage alpha shows its visible stage and has no single stage (the producer reads it before the filter)
    const rows = dataRows();
    expect(rows.map((row) => cell(row, "Current stage"))).toEqual(expect.arrayContaining(["Canary"]));
    const several = rows.filter((row) => cell(row, "Current stage").startsWith("No single stage"));
    expect(several.length).toBeGreaterThan(0);
    expect(several.every((row) => cell(row, "Current stage").includes("in Canary"))).toBe(true);
  });

  it("clear all removes the filters and the lens; the All lens spans environments, so it is the fleet read again", async () => {
    const { api } = harness({ live: MIXED });
    mount(api, `${LIVE_URL}&owner=Lan-002`);
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    await waitFor(() => expect(search().get("owner")).toBeNull());
    expect(search().get("stage")).toBeNull();
    await waitFor(() => expect(isLegacyTable()).toBe(true));
  });
});

describe("dataset mode: paging with the cursor and honest counts", () => {
  it("walks 130 rows in pages of 50 with Showing N of M, no duplicate, and no button after the last page", async () => {
    const { api, state } = harness({ live: alphasOf(130, [["LIVE"]]) });
    mount(api, LIVE_URL);
    await loaded();
    const line = () => document.querySelector(".exec-fleet-count-line")?.textContent ?? "";
    expect(dataRows()).toHaveLength(50);
    expect(line()).toBe("Showing 50 of 130 rows. Load more for the rest.");
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(dataRows()).toHaveLength(100));
    expect(line()).toBe("Showing 100 of 130 rows. Load more for the rest.");
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(dataRows()).toHaveLength(130));
    expect(line()).toBe("Showing all 130 rows");
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
    expect(new Set(ids()).size).toBe(130);
    const calls = datasetCalls(state);
    expect(calls.map((call) => call.query.has("after"))).toEqual([false, true, true]);
    expect(calls[1]!.query.get("after")).not.toBe(calls[2]!.query.get("after"));
  });

  it("a 200-row page budget: after four pages the cap is named and no further page is offered", async () => {
    const { api } = harness({ live: alphasOf(260, [["LIVE"]]) });
    mount(api, LIVE_URL);
    await loaded();
    for (let page = 1; page < 4; page += 1) {
      fireEvent.click(await screen.findByRole("button", { name: "Load more" }));
      await waitFor(() => expect(dataRows()).toHaveLength(50 * (page + 1)));
    }
    expect(dataRows()).toHaveLength(200);
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
    expect(document.body.textContent).toContain("Showing the first 200 rows. Narrow the filters to see the rest.");
    // the line does not promise a page the screen no longer offers
    expect(document.querySelector(".exec-fleet-count-line")?.textContent).toBe("Showing 200 of 260 rows.");
  });

  it("a page from another snapshot is NOT appended: the rows stay, the reason is said, Reload re-reads", async () => {
    const { api, state } = harness({ live: alphasOf(130, [["LIVE"]]) });
    mount(api, LIVE_URL);
    await loaded();
    state.mutate = (body, call) => {
      if (call.query.has("after")) body.snapshot_id = SNAPSHOT_B;
    };
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("SNAPSHOT_CHANGED");
    expect(dataRows()).toHaveLength(50);
    state.mutate = undefined;
    fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "Reload" }));
    await waitFor(() => expect(datasetCalls(state).filter((call) => !call.query.has("after")).length).toBe(2));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("a second page that fails keeps the first page's rows and says so", async () => {
    const { api, state } = harness({ live: alphasOf(130, [["LIVE"]]) });
    mount(api, LIVE_URL);
    await loaded();
    state.variant = "status:503";
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(dataRows()).toHaveLength(50);
  });

  it("an empty result with only the lens says the dataset published no rows; with a filter it offers to clear it", async () => {
    const { api } = harness({ live: [] });
    const first = mount(api, LIVE_URL);
    await screen.findByText("The Manager dataset published no rows for this view.");
    first.unmount();
    const second = harness({ live: MIXED });
    mount(second.api, `${LIVE_URL}&owner=nobody`);
    expect(await screen.findByText("No rows match these filters.")).toBeTruthy();
  });
});

describe("dataset mode: answers that must not become rows", () => {
  it.each<[DatasetVariant, string]>([
    ["wrong:surface", "MANAGER_DATASET_ANSWERS_ANOTHER_QUERY surface"],
    ["wrong:limit", "MANAGER_DATASET_ANSWERS_ANOTHER_QUERY limit"],
    ["wrong:group", "MANAGER_DATASET_ANSWERS_ANOTHER_QUERY group_by"],
    ["wrong:workspace", "MANAGER_DATASET_ANSWERS_ANOTHER_QUERY workspace"],
    ["status:503", "REFUSED"],
    ["status:409", "REFUSED"],
    ["garbage", "MANAGER_DATASET_REFUSED"],
    ["other-schema", "UNSUPPORTED_SCHEMA"],
  ])("%s is a typed error panel, never a table, and 'Use the fleet read' goes back", async (variant, fragment) => {
    // the probe (limit 1) must pass for the Source control to exist, so the break starts after it
    const { api, state } = harness({ live: MIXED });
    state.before = (call) => { state.variant = call.query.get("limit") === "1" ? "ok" : variant; };
    mount(api, LIVE_URL, variant === "wrong:workspace" ? "ws-1" : undefined);
    await waitFor(() => expect(document.body.textContent).toContain(fragment));
    expect(screen.getByText("Unavailable")).toBeTruthy();
    expect(screen.queryByRole("table", { name: "Alpha fleet" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Use the fleet read" }));
    await waitFor(() => expect(search().get("src")).toBeNull());
    await waitFor(() => expect(isLegacyTable()).toBe(true));
  });

  it("a late answer for a query the reader has left is dropped", async () => {
    const { api, state } = harness({ live: MIXED });
    let release: (() => void) | null = null;
    const held = new Promise<void>((resolve) => { release = resolve; });
    state.before = async (call) => {
      if (call.query.get("limit") !== "1" && !call.query.has("q")) await held;
    };
    mount(api, LIVE_URL);
    await waitFor(() => expect(datasetCalls(state)).toHaveLength(1));
    // the reader narrows the search while the first answer (every row) is still on its way
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "a-001" } });
    fireEvent.keyDown(screen.getByRole("searchbox"), { key: "Enter" });
    await waitFor(() => expect(datasetCalls(state).some((call) => call.query.get("q") === "a-001")).toBe(true));
    await loaded();
    await waitFor(() => expect(dataRows()).toHaveLength(1));
    release!();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(dataRows()).toHaveLength(1);
    expect(ids()[0]).toContain("a-001");
  });

  it("the legacy board view still uses the fleet read, and the dataset cannot be chosen there", async () => {
    const { api, legacy } = harness({ live: MIXED });
    mount(api, "/execution/fleet?stage=canary,live&view=board");
    const source = await screen.findByRole("group", { name: "Source" });
    expect((within(source).getByRole("button", { name: "Manager dataset" }) as HTMLButtonElement).disabled).toBe(true);
    await waitFor(() => expect(legacy.length).toBeGreaterThan(0));
  });
});
