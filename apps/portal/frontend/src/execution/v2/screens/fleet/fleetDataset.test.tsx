/**
 * Fleet over the Manager DATASET (FE-012 sort/group by current stage, FE-027 current stage and days in stage), screen level.
 * Lane BFF_DOUBLE: the port is the REAL HTTP client over a stubbed `fetch`; the dataset double (`datasetDouble.testbase.ts`) is a small
 * server that applies the query to a population and answers with bodies built from the published canonical fixtures
 * (`lifecycle.live`, `partitions`), so the real reader and the real answers-this-question guard judge every body. The legacy fleet
 * read is the Playwright double's five rows. A fixture is never a source acceptance; there is no REAL_READ here.
 */
import { whyText } from "../../gapWhyTestUtil";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SLOW, SLOW_TEST } from "../../waitsTestUtil";

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
const ALL_COLUMNS = "cols=owner,in-stage,unrealized,balance,equity,source,select";
const withAllColumns = (entry: string): string => `${entry}${entry.includes("?") ? "&" : "?"}${ALL_COLUMNS}`;
const mount = (api: ExecutionApi, entry: string, workspaceId?: string) =>
  render(
    <MemoryRouter initialEntries={[withAllColumns(entry)]}>
      <FleetScreen api={api} {...(workspaceId ? { workspaceId } : {})} />
      <Where />
    </MemoryRouter>,
  );
const where = () => screen.getByTestId("where").textContent ?? "";
const search = () => new URLSearchParams(where().split("?")[1] ?? "");
const table = () => screen.getByRole("table", { name: "Alpha fleet" });
const loaded = async () => screen.findByRole("table", { name: "Alpha fleet" }, SLOW);
const dataRows = () => within(table()).getAllByRole("row").slice(1).filter((row) => !row.classList.contains("exec-cards-group"));
const cell = (row: HTMLElement, label: string) => row.querySelector(`td[data-l='${label}']`)?.textContent ?? "";
const ids = () => dataRows().map((row) => cell(row, "Alpha"));
/** The fleet read's table has a Deployments column; the dataset's has Current stage and In stage. Neither has the other's. */
const isLegacyTable = () => [...table().querySelectorAll("th")].some((th) => th.textContent === "Deployments");
const isDatasetTable = () => [...table().querySelectorAll("th")].some((th) => th.textContent === "In stage");
const datasetCalls = (state: DatasetDoubleState) => state.calls.filter((call) => call.query.get("limit") !== "1");
/** The publication probe: one row, no grouping. */
const probeCalls = (state: DatasetDoubleState) => state.calls.filter((call) => call.query.get("limit") === "1" && !call.query.has("group_by"));
/** The Owner / Health choices (RV-09): one row, grouped by the one field, over the lens only. */
const optionCalls = (state: DatasetDoubleState) => state.calls.filter((call) => call.query.get("limit") === "1" && call.query.has("group_by"));

/** A published fixture body paged as the query asks (the probe asks for one row): only the page envelope and the rows kept change. */
function pagedLike(body: Draft, limit: number): Draft {
  const total = body.items.length;
  body.items = body.items.slice(0, limit);
  body.page = { limit, returned_count: body.items.length, authorized_filtered_count: total, next_cursor: body.items.length < total ? "probe-cursor" : null, previous_cursor: null };
  return body;
}

const LIVE_URL = "/execution/fleet?stage=canary,live";
/** 2 single-LIVE, 2 single-CANARY, 2 with both: a fleet where `current_stage` splits three ways. */
const MIXED: DoubleAlpha[] = alphasOf(6, [["LIVE"], ["CANARY", "LIVE"], ["CANARY"]], { healths: ["READY", "ATTENTION", "FINDING"], owners: ["Lan-002", "Bobby-001"] });

describe("not published: today's screen, exactly", () => {
  it("the All lens asks the dataset for ALL once; a dataset that does not offer ALL leaves today's fleet read exactly as it was (FE-CAT-3)", async () => {
    const { api, state } = harness({ live: MIXED });
    mount(api, "/execution/fleet");
    await loaded();
    expect(state.calls.map((call) => Object.fromEntries(call.query))).toEqual([{ environment: "ALL", limit: "1" }]);
    expect(isLegacyTable()).toBe(true);
    expect(document.querySelector("[data-source='fleet']")?.textContent).toBe("Fleet read · alphas");
    expect(screen.queryByRole("group", { name: "Source" })).toBeNull();
    expect(screen.queryByTestId("env-coverage")).toBeNull();
  });

  it.each(["status:404", "status:503", "status:403", "garbage", "other-schema", "malformed", "wrong:environment"] as DatasetVariant[])(
    "a single-environment lens whose dataset answers %s keeps today's controls and the fleet read",
    async (variant) => {
      const { api, state, legacy } = harness({ live: MIXED }, variant);
      mount(api, "/execution/fleet?stage=live");
      await loaded();
      await waitFor(() => expect(probeCalls(state)).toHaveLength(1), SLOW);
      expect(legacy.length).toBeGreaterThanOrEqual(1);
      expect(isLegacyTable()).toBe(true);
      expect(screen.queryByRole("group", { name: "Source" })).toBeNull();
      // The control set: Group by is not drawn as a disabled select (the gap is one word on the "Not available:" line), Health is a plain select, Sort has the fleet words.
      expect(screen.queryByRole("combobox", { name: "Group by" })).toBeNull();
      expect(document.querySelector(".exec-fleet-unpub")?.textContent).toContain("Group by");
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

  it("an unpublished dataset keeps the fleet read and its chip names the population", async () => {
    const { api } = harness({ live: MIXED }, "status:404");
    mount(api, LIVE_URL);
    await loaded();
    expect(isLegacyTable()).toBe(true);
    expect(document.querySelector("[data-source='fleet']")?.textContent).toBe("Fleet read · alphas");
    expect(screen.queryByText(/not published for this view/)).toBeNull();
  });

  it("a stage set across environments is an ALL question; refused, it is the fleet read", async () => {
    const { api, state } = harness({ live: MIXED, paper: MIXED });
    mount(api, "/execution/fleet?stage=paper,live");
    await loaded();
    expect(state.calls.map((call) => Object.fromEntries(call.query))).toEqual([{ environment: "ALL", limit: "1" }]);
    expect(isLegacyTable()).toBe(true);
    expect(document.querySelector("[data-source='fleet']")?.textContent).toBe("Fleet read · alphas");
  });
});

describe("published: the dataset is the source, chosen by the data (no toggle)", () => {
  it("a single-environment lens reads the dataset once it is published, with ONE chip and no Source control", async () => {
    const { api, state, legacy } = harness({ live: MIXED });
    mount(api, LIVE_URL);
    await loaded();
    expect(isDatasetTable()).toBe(true);
    expect(screen.queryByRole("group", { name: "Source" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Manager dataset" })).toBeNull();
    const chip = document.querySelector("[data-source='dataset']");
    expect(chip?.textContent).toBe("Manager dataset · alpha versions");
    expect(document.querySelectorAll(".exec-fleet-source")).toHaveLength(1);
    // the fleet read's TABLE was never started (no flash of the other table); its only request is the one-row, unfiltered counts read
    expect(legacy).toEqual([{ limit: 1 }]);
    expect(probeCalls(state)).toHaveLength(1);
    expect(Object.fromEntries(probeCalls(state)[0]!.query)).toEqual({ environment: "live", limit: "1" });
    expect(datasetCalls(state)).toHaveLength(1);
    expect(Object.fromEntries(datasetCalls(state)[0]!.query)).toEqual({ environment: "live", limit: "50" });
  });

  it("the All lens stays on the fleet read, and the board over a published dataset is built from its rows (QA1 R2-10)", async () => {
    const first = harness({ live: MIXED });
    const view = mount(first.api, "/execution/fleet");
    await loaded();
    expect(document.querySelector("[data-source='fleet']")?.textContent).toBe("Fleet read · alphas");
    expect(first.state.calls.map((call) => Object.fromEntries(call.query))).toEqual([{ environment: "ALL", limit: "1" }]);
    view.unmount();
    const second = harness({ live: MIXED });
    mount(second.api, "/execution/fleet?stage=canary,live&view=board");
    expect(await screen.findByRole("group", { name: "Alpha fleet board" }, SLOW)).toBeTruthy();
    expect(document.querySelector("[data-source='dataset']")).not.toBeNull();
    expect(screen.queryByRole("group", { name: "Source" })).toBeNull();
  });

  it("the chip explains the population and the stage rule in its tooltip, not in a paragraph", async () => {
    const { api } = harness({ live: MIXED });
    mount(api, LIVE_URL);
    await loaded();
    const chip = document.querySelector("[data-source='dataset']") as HTMLElement;
    expect(chip.title).toContain("One row is an alpha version in a portfolio");
    expect(chip.title).toContain("Current stage is the single active stage");
    // the long note is for assistive technology only
    expect(screen.getByTestId("dataset-note").className).toContain("exec-fleet-sr");
  });
});

describe("dataset mode: rows, current stage, days in stage", () => {
  it("prints identity, the producer's current stage, and Not published (FE-027) for days in stage with the typed reason", async () => {
    const { api, legacy } = harness({ live: MIXED });
    mount(api, LIVE_URL);
    await loaded();
    // the legacy fleet read is not made for the table while the dataset is the source (only the counts read, asserted below)
    expect(legacy).toEqual([{ limit: 1 }]);
    const rows = dataRows();
    expect(rows).toHaveLength(6);
    const byId = (id: string) => rows.find((row) => cell(row, "Alpha").includes(id))!;
    expect(cell(byId("a-000"), "Current stage")).toBe("Live");
    expect(cell(byId("a-002"), "Current stage")).toBe("Canary");
    expect(cell(byId("a-001"), "Current stage")).toContain("No single stage");
    expect(cell(byId("a-001"), "Current stage")).toContain("in Canary, Live");
    expect(whyText(byId("a-001").querySelector("td[data-l='Current stage']"))).toBe("MULTIPLE_ACTIVE_STAGES");
    for (const row of rows) {
      expect(cell(row, "In stage")).toBe("Not published (FE-027)");
      expect(whyText(row.querySelector("td[data-l='In stage']"))).toBe("STAGE_ENTRY_TIME_NOT_PUBLISHED");
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
    const cells = [...container.querySelectorAll("td:not([data-l='Select'])")].map((td) => (td.textContent ?? "").trim());
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
    // The fixture's time is the epoch (an unset field): it never prints as "As of 1970-01-01"; the reason codes sit in the title, not in the sentence.
    expect(document.body.textContent).not.toMatch(/1970/);
    expect(screen.getByText("Source time not published")).toBeTruthy();
    expect(screen.getByText(/The dataset is partial and stale/).textContent).not.toMatch(/TEST_ONLY/);
    expect(whyText(screen.getByText(/The dataset is partial and stale/).parentElement)).toMatch(/TEST_ONLY/);
  });

  it("reads the canonical partitions fixture on the paper lens: one money cell per economic partition, exact, never merged", async () => {
    vi.stubGlobal("fetch", async (url: string) => {
      const asked = new URL(url, "http://portal.test");
      const body = pagedLike(fixtureValue(FIXTURE_PARTITIONS), Number(asked.searchParams.get("limit")));
      // asked without a group: the published fixture's one group is another question, so the double drops it (the guard is tested in the port suite)
      body.groups = [];
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    });
    const http = createHttpApi({ policy: OPEN, readScope: {} });
    const { container } = mount({ getAlphaFleet: legacyFleet().getAlphaFleet, getManagerDataset: http.getManagerDataset } as unknown as ExecutionApi, "/execution/fleet?stage=paper");
    await loaded();
    expect(dataRows().map((row) => cell(row, "Current stage"))).toEqual(["Paper", "Paper"]);
    const rows = dataRows();
    const parts = (row: HTMLElement, label: string) => [...row.querySelectorAll(`td[data-l='${label}'] .exec-fleet-part`)].map((part) => part.textContent);
    const exact = (row: HTMLElement) => [...row.querySelectorAll("td[data-l='PNL Amount'] .exec-mgr-num")].map((node) => (node.getAttribute("title") ?? "").split(" · ")[0]);
    // Row 1: one USDT partition. A TRUE ZERO is a value (not a dash, not "Not available"); the published unrealized key is not a column.
    expect(parts(rows[0]!, "PNL Amount")).toEqual(["Paper · USDT0.00 USDT"]);
    expect(exact(rows[0]!)).toEqual(["0"]);
    expect(rows[0]!.querySelector("td[data-l='PNL Amount'] .exec-mgr-num")?.getAttribute("data-zero")).toBe("true");
    // Row 2: two currencies of one domain are TWO cells; the row's own net_pnl says MIXED_ECONOMIC_DOMAINS and nothing is summed.
    expect(parts(rows[1]!, "PNL Amount")).toEqual(["Paper · USDT0.00 USDT", "Paper · EUR-12.50 EUR"]);
    expect(exact(rows[1]!)).toEqual(["0", "-12.5"]);
    expect(cell(rows[1]!, "PNL Amount")).not.toMatch(/-12\.5\d*\s*USDT|\+|MIXED/);
    // Allocation: the fixture carries the key in query_options but no partition publishes it: a typed absence per partition, not 0.
    expect(parts(rows[0]!, "Alloc")).toEqual(["Paper · USDTNot available"]);
    expect(parts(rows[1]!, "Alloc")).toEqual(["Paper · USDTNot available", "Paper · EURNot available"]);
    expect(cell(rows[0]!, "Alloc")).not.toMatch(/\b0\b/);
    // Equity: the dataset does not carry equity_30d_end_value: Not published with its request id, not a figure.
    expect(cell(rows[0]!, "Equity 30D")).toBe("Not published (FE-013)");
    expect(container.textContent).not.toMatch(/ACTUAL/);
  });
});

describe("dataset mode: money columns when the dataset publishes the keys", () => {
  it("prints Allocation / Net PnL / Equity from a Real-funded partition as published, signed and exact", async () => {
    vi.stubGlobal("fetch", async (url: string) => {
      const asked = new URL(url, "http://portal.test");
      const body = pagedLike(fixtureValue(FIXTURE_LIFECYCLE_LIVE), Number(asked.searchParams.get("limit")));
      body.query_options.metric_keys = [...body.query_options.metric_keys, "equity_30d_end_value"];
      body.query_options.sort_fields = [...body.query_options.sort_fields, "equity_30d_end_value"];
      body.query_options.economic_partition_required_for = [...body.query_options.economic_partition_required_for, "equity_30d_end_value"];
      body.items.forEach((item: Draft, index: number) => {
        const partition = item.economic_partitions[0];
        const make = (value: string): Draft => ({ ...partition.metrics.net_pnl, value, unit: "MONEY", currency: "USDT", availability: "AVAILABLE", reason_code: null });
        partition.metrics.allocation = make(index === 0 ? "1500.250000000000000001" : "0");
        partition.metrics.net_pnl = make(index === 0 ? "-42.5" : "7");
        partition.metrics.equity_30d_end_value = make("1457.750000000000000001");
        item.metrics.allocation = partition.metrics.allocation;
        item.metrics.net_pnl = partition.metrics.net_pnl;
        item.metrics.equity_30d_end_value = partition.metrics.equity_30d_end_value;
      });
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    });
    const http = createHttpApi({ policy: OPEN, readScope: {} });
    mount({ getAlphaFleet: legacyFleet().getAlphaFleet, getManagerDataset: http.getManagerDataset } as unknown as ExecutionApi, LIVE_URL);
    await loaded();
    const rows = dataRows();
    const titleOf = (row: HTMLElement, label: string) => [...row.querySelectorAll(`td[data-l='${label}'] .exec-mgr-num`)].map((node) => (node.getAttribute("title") ?? "").split(" · ")[0]);
    expect(titleOf(rows[0]!, "Alloc")).toEqual(["1500.250000000000000001"]);
    expect(titleOf(rows[0]!, "PNL Amount")).toEqual(["-42.5"]);
    expect(titleOf(rows[0]!, "Equity 30D")).toEqual(["1457.750000000000000001"]);
    expect(cell(rows[0]!, "PNL Amount")).toBe("Real-funded · USDT-42.50 USDT");
    // A true zero allocation is a figure, with its zero marker, not an absence.
    expect(cell(rows[1]!, "Alloc")).toBe("Real-funded · USDT0.00 USDT");
    expect(rows[1]!.querySelector("td[data-l='Alloc'] .exec-mgr-num")?.getAttribute("data-zero")).toBe("true");
    expect(cell(rows[1]!, "PNL Amount")).toBe("Real-funded · USDT+7.00 USDT");
  });
});

describe("dataset mode: Map (tile size = published allocation of ONE partition, colour = health)", () => {
  const mapApi = (withAllocation: boolean) => {
    vi.stubGlobal("fetch", async (url: string) => {
      const asked = new URL(url, "http://portal.test");
      const body = pagedLike(fixtureValue(FIXTURE_PARTITIONS), Number(asked.searchParams.get("limit")));
      body.groups = [];
      if (withAllocation) {
        const give = (partition: Draft, value: string, currency: string): void => {
          partition.metrics.allocation = { ...partition.metrics.net_pnl, value, unit: "MONEY", currency, availability: "AVAILABLE", reason_code: null };
        };
        const [first, second] = body.items;
        give(first.economic_partitions[0], "1000", "USDT");
        first.metrics.allocation = first.economic_partitions[0].metrics.allocation;
        if (second === undefined) return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
        // One book (one native profile) holds the USDT figure of both rows; the EUR figure is a second partition of the second row.
        second.economic_partitions[0].partition.native_profile_ref = first.economic_partitions[0].partition.native_profile_ref;
        give(second.economic_partitions[0], "250.5", "USDT");
        give(second.economic_partitions[1], "40.000000000000000001", "EUR");
        first.health = "READY";
        second.health = "ATTENTION";
      }
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    });
    const http = createHttpApi({ policy: OPEN, readScope: {} });
    return { getAlphaFleet: legacyFleet().getAlphaFleet, getManagerDataset: http.getManagerDataset } as unknown as ExecutionApi;
  };

  it("draws one partition at a time; a row with no figure there is listed with its reason, never drawn as 0", async () => {
    mount(mapApi(true), "/execution/fleet?stage=paper&view=map");
    const map = await screen.findByTestId("fleet-map", undefined, SLOW);
    const tiles = () => within(map).getAllByRole("listitem").filter((li) => li.classList.contains("exec-fleet-tile"));
    // USDT is the first published partition: both rows have it. Sizes are geometry; the figure is the exact string.
    expect(tiles().map((tile) => tile.textContent)).toEqual([expect.stringContaining("1,000.00 USDT"), expect.stringContaining("250.50 USDT")]);
    expect(tiles().map((tile) => tile.getAttribute("data-health"))).toEqual(["ok", "attention"]);
    expect(tiles().map((tile) => tile.getAttribute("data-weight"))).toEqual(["100", "25"]);
    expect(within(map).queryByText(/EUR/, { selector: ".exec-mgr-num" })).toBeNull();
    // EUR: only the second row publishes it; the first is NOT drawn and says why.
    fireEvent.click(within(map).getByRole("button", { name: "Paper · EUR" }));
    expect(tiles()).toHaveLength(1);
    expect(tiles()[0]!.textContent).toContain("40.00 EUR");
    expect(within(map).getByTestId("map-undrawn").textContent).toContain("Not drawn, no allocation figure in Paper · EUR");
    expect(within(map).getByTestId("map-undrawn").textContent).toContain("Not available");
    expect(whyText(within(map).getByTestId("map-undrawn"))).toContain("no economic partition matching");
    // Nothing is added across the two partitions.
    expect(map.textContent).not.toMatch(/1290|1250|total/i);
  });

  it("nests tiles in a box per portfolio, sizes by Allocation or Equal, colours by Health, Return or Stage, and names every colour in a legend (QA1 R2-11)", async () => {
    mount(mapApi(true), "/execution/fleet?stage=paper&view=map");
    const map = await screen.findByTestId("fleet-map", undefined, SLOW);
    expect(within(map).getAllByRole("region").length).toBeGreaterThan(0);
    const tiles = () => within(map).getAllByRole("listitem").filter((li) => li.classList.contains("exec-fleet-tile"));
    expect(tiles().map((tile) => tile.getAttribute("data-weight"))).toEqual(["100", "25"]);
    fireEvent.click(within(within(map).getByRole("group", { name: "Map size" })).getByRole("button", { name: "Equal" }));
    expect(tiles().map((tile) => tile.getAttribute("data-weight"))).toEqual(["1", "1"]);
    expect(within(map).getByTestId("map-legend").textContent).toContain("Needs attention or finding");
    fireEvent.click(within(within(map).getByRole("group", { name: "Map colour" })).getByRole("button", { name: "Stage" }));
    expect(within(map).getByTestId("map-legend").textContent).toContain("Canary");
    expect(tiles().every((tile) => /^(stage-[a-z]+|unknown)$/.test(tile.getAttribute("data-tone") ?? ""))).toBe(true);
    fireEvent.click(within(within(map).getByRole("group", { name: "Map colour" })).getByRole("button", { name: "Return" }));
    expect(within(map).getByTestId("map-legend").textContent).toContain("Return 30D above zero");
    // the table-only controls are not on the map page
    expect(screen.queryByRole("combobox", { name: "Group by" })).toBeNull();
    expect(screen.queryByTestId("sortbar")).toBeNull();
  });

  it("says plainly when no loaded row publishes an allocation, instead of drawing equal tiles", async () => {
    mount(mapApi(false), "/execution/fleet?stage=paper&view=map");
    const empty = await screen.findByTestId("map-empty", undefined, SLOW);
    expect(empty.textContent).toContain("No loaded row publishes an allocation figure");
    expect(document.querySelector(".exec-fleet-tile")).toBeNull();
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
    await waitFor(() => expect(search().get("sorts")).toBe("current_stage:asc"), SLOW);
    await waitFor(() => expect(datasetCalls(state)).toHaveLength(2), SLOW);
    expect(datasetCalls(state)[1]!.sort).toEqual([{ field: "current_stage", direction: "asc" }]);
    await waitFor(() => expect(dataRows().map((row) => cell(row, "Current stage").slice(0, 6))).toEqual(["Canary", "Canary", "Live", "Live", "No sin", "No sin"]), SLOW);
    fireEvent.change(sort, { target: { value: "current_stage:desc" } });
    await waitFor(() => expect(dataRows().map((row) => cell(row, "Current stage").slice(0, 6))).toEqual(["Live", "Live", "Canary", "Canary", "No sin", "No sin"]), SLOW);
    expect(datasetCalls(state)[2]!.sort).toEqual([{ field: "current_stage", direction: "desc" }]);
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
    expect([...group.options].map((option) => option.textContent)).toEqual(["Group: none", "Group: Portfolio", "Group: Current stage", "Group: Stage presence", "Group: Owner", "Group: Alpha", "Group: Venue", "Group: Health", "Group: Source state", "Group: Lifecycle"]);
    fireEvent.change(group, { target: { value: "current_stage" } });
    await waitFor(() => expect(search().get("group")).toBe("current_stage"), SLOW);
    const groups = await screen.findByTestId("dataset-groups");
    await waitFor(() => expect([...groups.querySelectorAll("li")].map((li) => li.textContent)).toEqual(["Canary: 43", "Live: 44", "No single stage: 43"]), SLOW);
    expect(datasetCalls(state).at(-1)!.query.get("group_by")).toBe("current_stage");
    // 43 + 44 + 43 = 130 rows in the filtered result, and 50 on the page
    expect(dataRows()).toHaveLength(50);
    expect(document.querySelector(".exec-fleet-count-line")?.textContent).toBe("Showing 50 of 130 rows. Load more for the rest.");
  });

  it("'Then' is a second grouping level: absent without a first level, never the first field, sent as a two-field group_by, dropped with the first", async () => {
    const { api, state } = harness({ live: alphasOf(130, [["LIVE"], ["CANARY"], ["CANARY", "LIVE"]]) });
    mount(api, LIVE_URL);
    await loaded();
    expect(screen.queryByRole("combobox", { name: "Then group by" })).toBeNull();
    fireEvent.change(screen.getByRole("combobox", { name: "Group by" }), { target: { value: "current_stage" } });
    const then = (await screen.findByRole("combobox", { name: "Then group by" })) as HTMLSelectElement;
    expect([...then.options].map((option) => option.textContent)).toEqual(["Then: none", "Then: Portfolio", "Then: Stage presence", "Then: Owner", "Then: Alpha", "Then: Venue", "Then: Health", "Then: Source state", "Then: Lifecycle"]);
    fireEvent.change(then, { target: { value: "owner_user_id" } });
    await waitFor(() => expect(search().get("then")).toBe("owner_user_id"), SLOW);
    await waitFor(() => expect(datasetCalls(state).at(-1)!.query.get("group_by")).toBe("current_stage,owner_user_id"), SLOW);
    fireEvent.change(screen.getByRole("combobox", { name: "Group by" }), { target: { value: "" } });
    await waitFor(() => expect(search().get("then")).toBeNull(), SLOW);
    expect(screen.queryByRole("combobox", { name: "Then group by" })).toBeNull();
  });

  it("'Use the fleet read' (after a failed dataset read) drops what only the dataset understands, and the chip offers the way back", async () => {
    const { api, state } = harness({ live: MIXED });
    state.variantFor = (call) => (call.query.get("limit") === "1" ? "ok" : "status:503");
    mount(api, `${LIVE_URL}&group=current_stage&health=ATTENTION,READY`);
    fireEvent.click(await screen.findByRole("button", { name: "Use the fleet read" }));
    await waitFor(() => expect(search().get("src")).toBe("fleet"), SLOW);
    expect(search().get("group")).toBeNull();
    expect(search().get("health")).toBeNull();
    await waitFor(() => expect(isLegacyTable()).toBe(true), SLOW);
    // the override is explicit and reversible, and it is the only way across
    state.variantFor = undefined;
    state.variant = "ok";
    fireEvent.click(screen.getByRole("button", { name: "Use the dataset" }));
    await waitFor(() => expect(search().get("src")).toBeNull(), SLOW);
    await waitFor(() => expect(isDatasetTable()).toBe(true), SLOW);
  });
});

describe("dataset mode: filters are the server's (never a client-side narrowing of a partial page)", () => {
  it("one health is EQ and two are IN, and the rows are exactly what the server returned", async () => {
    const { api, state } = harness({ live: MIXED });
    mount(api, LIVE_URL);
    await loaded();
    fireEvent.click(within(screen.getByRole("search")).getByRole("button", { name: "Health" }));
    const menu = screen.getByRole("group", { name: "Health" });
    fireEvent.click(within(menu).getByRole("checkbox", { name: "Ready" }));
    await waitFor(() => expect(search().get("health")).toBe("READY"), SLOW);
    await waitFor(() => expect(datasetCalls(state).at(-1)!.filters).toEqual([{ field: "health", op: "EQ", value: "READY" }]), SLOW);
    await waitFor(() => expect(dataRows()).toHaveLength(2), SLOW);
    fireEvent.click(within(screen.getByRole("group", { name: "Health" })).getByRole("checkbox", { name: "Needs attention" }));
    await waitFor(() => expect(search().get("health")).toBe("ATTENTION,READY"), SLOW);
    await waitFor(() => expect(datasetCalls(state).at(-1)!.filters).toEqual([{ field: "health", op: "IN", values: ["ATTENTION", "READY"] }]), SLOW);
    await waitFor(() => expect(dataRows()).toHaveLength(4), SLOW);
    expect(within(screen.getByRole("search")).getByRole("button", { name: "Health" }).textContent).toContain("Health: Needs attention +1");
    expect(screen.getByText("health: Needs attention, Ready")).toBeTruthy();
  });

  it("a server that ignores the filter is REFUSED (the screen does not quietly filter the page itself)", async () => {
    const { api } = harness({ live: MIXED }, "wrong:filter");
    mount(api, `${LIVE_URL}&health=READY`);
    // the probe has no filter, so it is published; the filtered read is the one the guard refuses
    await waitFor(() => expect(document.body.textContent).toContain("MANAGER_DATASET_ANSWERS_ANOTHER_QUERY filters"), SLOW);
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
    mount(api, "/execution/fleet?stage=canary");
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
    await waitFor(() => expect(search().get("owner")).toBeNull(), SLOW);
    expect(search().get("stage")).toBeNull();
    await waitFor(() => expect(isLegacyTable()).toBe(true), SLOW);
  });
});

describe("dataset mode: paging with the cursor and honest counts", () => {
  // Whole-suite flake 2026-10-21 (DEBT-UXM07-032): a multi-step flow of SLOW waits; explicit per-test budget.
  it("walks 130 rows in pages of 50 with Showing N of M, no duplicate, and no button after the last page", async () => {
    const { api, state } = harness({ live: alphasOf(130, [["LIVE"]]) });
    mount(api, LIVE_URL);
    await loaded();
    const line = () => document.querySelector(".exec-fleet-count-line")?.textContent ?? "";
    expect(dataRows()).toHaveLength(50);
    expect(line()).toBe("Showing 50 of 130 rows. Load more for the rest.");
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(dataRows()).toHaveLength(100), SLOW);
    expect(line()).toBe("Showing 100 of 130 rows. Load more for the rest.");
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(dataRows()).toHaveLength(130), SLOW);
    expect(line()).toBe("Showing all 130 rows");
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
    expect(new Set(ids()).size).toBe(130);
    const calls = datasetCalls(state);
    expect(calls.map((call) => call.query.has("after"))).toEqual([false, true, true]);
    expect(calls[1]!.query.get("after")).not.toBe(calls[2]!.query.get("after"));
  }, SLOW_TEST);

  // Whole-suite flake 2026-10-21 (DEBT-UXM07-032): a multi-step flow of SLOW waits; explicit per-test budget.
  it("a 200-row page budget: after four pages the cap is named and no further page is offered", async () => {
    const { api } = harness({ live: alphasOf(260, [["LIVE"]]) });
    mount(api, LIVE_URL);
    await loaded();
    for (let page = 1; page < 4; page += 1) {
      fireEvent.click(await screen.findByRole("button", { name: "Load more" }, SLOW));
      await waitFor(() => expect(dataRows()).toHaveLength(50 * (page + 1)), SLOW);
    }
    expect(dataRows()).toHaveLength(200);
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
    expect(document.body.textContent).toContain("Showing the first 200 rows. Narrow the filters to see the rest.");
    // the line does not promise a page the screen no longer offers
    expect(document.querySelector(".exec-fleet-count-line")?.textContent).toBe("Showing 200 of 260 rows.");
  }, SLOW_TEST);

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
    await waitFor(() => expect(datasetCalls(state).filter((call) => !call.query.has("after")).length).toBe(2), SLOW);
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull(), SLOW);
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
    // the probe (limit 1) must pass for the dataset to be the source, so the break starts after it
    const { api, state } = harness({ live: MIXED });
    state.variantFor = (call) => (call.query.get("limit") === "1" ? "ok" : variant);
    mount(api, LIVE_URL, variant === "wrong:workspace" ? "ws-1" : undefined);
    await waitFor(() => expect(document.body.textContent).toContain(fragment), SLOW);
    expect(screen.getByText("Unavailable")).toBeTruthy();
    expect(screen.queryByRole("table", { name: "Alpha fleet" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Use the fleet read" }));
    await waitFor(() => expect(search().get("src")).toBe("fleet"), SLOW);
    await waitFor(() => expect(isLegacyTable()).toBe(true), SLOW);
  });

  it("a late answer for a query the reader has left is dropped", async () => {
    const { api, state } = harness({ live: MIXED });
    let release: (() => void) | null = null;
    const held = new Promise<void>((resolve) => { release = resolve; });
    state.before = async (call) => {
      if (call.query.get("limit") !== "1" && !call.query.has("q")) await held;
    };
    mount(api, LIVE_URL);
    await waitFor(() => expect(datasetCalls(state)).toHaveLength(1), SLOW);
    // the reader narrows the search while the first answer (every row) is still on its way
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "a-001" } });
    fireEvent.keyDown(screen.getByRole("searchbox"), { key: "Enter" });
    await waitFor(() => expect(datasetCalls(state).some((call) => call.query.get("q") === "a-001")).toBe(true), SLOW);
    await loaded();
    await waitFor(() => expect(dataRows()).toHaveLength(1), SLOW);
    release!();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(dataRows()).toHaveLength(1);
    expect(ids()[0]).toContain("a-001");
  });

  it("a lane with no loaded card says Not loaded and offers Load more while rows remain, never 0 (QA2 R2-08)", async () => {
    const { api } = harness({ live: alphasOf(130, [["LIVE"]]) });
    mount(api, "/execution/fleet?stage=canary,live&view=board");
    const board = await screen.findByRole("group", { name: "Alpha fleet board" }, SLOW);
    const note = await within(board).findByTestId("lane-not-loaded");
    expect(note.textContent).toContain("Not loaded");
    expect(within(note).getByRole("button", { name: "Load more" })).toBeTruthy();
    expect(board.textContent).not.toContain("No loaded alpha");
  });

  it("the board cards carry the allocation per partition, QBTS and health of the dataset row, and name readiness once as not published", async () => {
    const { api, state } = harness({ live: MIXED });
    mount(api, "/execution/fleet?stage=canary,live&view=board");
    const board = await screen.findByRole("group", { name: "Alpha fleet board" }, SLOW);
    expect(datasetCalls(state).length).toBeGreaterThan(0);
    const figures = within(board).getAllByTestId("board-figures");
    expect(figures.length).toBeGreaterThan(0);
    expect(figures[0]!.textContent).toContain("Alloc");
    expect(figures[0]!.textContent).toContain("QBTS");
    expect(board.textContent).toContain("Readiness");
    expect(screen.queryByRole("group", { name: "Source" })).toBeNull();
  });
});

describe("Owner and Health choices are the authorized population, or they say they are not (RV-09)", () => {
  /** 130 alphas, 50 per page. `Zed-129` and the health FINDING exist only on the last row (page 3). */
  function wide(): DoubleAlpha[] {
    const population = alphasOf(130, [["LIVE"]], { owners: ["Lan-002", "Bobby-001"], healths: ["READY"] });
    population[129] = { ...population[129]!, owner: "Zed-129", health: "FINDING" };
    return population;
  }
  const ownerControl = () => screen.getByRole("combobox", { name: "Owner" }) as HTMLSelectElement | HTMLInputElement;
  const ownerValues = () => {
    const control = ownerControl();
    return control.tagName === "SELECT"
      ? [...(control as HTMLSelectElement).options].map((option) => option.value).filter((value) => value !== "")
      : [...(document.getElementById(control.getAttribute("list") ?? "") as HTMLDataListElement).options].map((option) => option.value);
  };
  /** The dataset states it cannot group by owner or health: both sort and group lists lose them (the reader checks they agree). */
  const withoutOwnerHealthGroups = (state: DatasetDoubleState) => {
    state.mutate = (body) => {
      const drop = ["owner_user_id", "health"];
      body.query_options.sort_fields = body.query_options.sort_fields.filter((field: string) => !drop.includes(field));
      body.query_options.group_fields = body.query_options.group_fields.filter((field: string) => !drop.includes(field));
    };
  };

  // Whole-suite flake 2026-10-21 (DEBT-UXM07-032): a multi-step flow of SLOW waits; explicit per-test budget.
  it("published: every owner and health of the lens is offered although only page 1 is loaded", async () => {
    const { api, state } = harness({ live: wide() });
    mount(api, LIVE_URL);
    await loaded();
    expect(dataRows()).toHaveLength(50);
    await waitFor(() => expect(ownerValues()).toEqual(["Bobby-001", "Lan-002", "Zed-129"]), SLOW);
    expect(ownerControl().tagName).toBe("SELECT");
    // the whole population is on offer, so there is no "loaded so far" sentence
    expect(screen.queryByTestId("options-limit")).toBeNull();
    fireEvent.click(within(screen.getByRole("search")).getByRole("button", { name: "Health" }));
    expect(within(screen.getByRole("group", { name: "Health" })).getAllByRole("checkbox").map((box) => (box as HTMLInputElement).labels?.[0]?.textContent)).toEqual(["Finding open", "Ready"]);
    expect(screen.queryByTestId("health-limit")).toBeNull();
    // two reads, one per field, over the lens alone: no search, owner or health in them
    expect(optionCalls(state).map((call) => call.query.get("group_by")).sort()).toEqual(["health", "owner_user_id"]);
    for (const call of optionCalls(state)) {
      expect(Object.fromEntries(call.query)).toEqual({ environment: "live", limit: "1", group_by: call.query.get("group_by") });
      expect(call.filters).toBeNull();
    }
  }, SLOW_TEST);

  // Whole-suite flake 2026-10-21 (DEBT-UXM07-032): a multi-step flow of SLOW waits; explicit per-test budget.
  it("choosing the owner that only page 3 holds filters on the server, and the choices do not shrink or reload", async () => {
    const { api, state } = harness({ live: wide() });
    mount(api, LIVE_URL);
    await loaded();
    await waitFor(() => expect(ownerValues()).toContain("Zed-129"), SLOW);
    fireEvent.change(ownerControl(), { target: { value: "Zed-129" } });
    await waitFor(() => expect(datasetCalls(state).at(-1)!.filters).toEqual([{ field: "owner_user_id", op: "EQ", value: "Zed-129" }]), SLOW);
    await waitFor(() => expect(dataRows()).toHaveLength(1), SLOW);
    expect(ownerValues()).toEqual(["Bobby-001", "Lan-002", "Zed-129"]);
    expect(optionCalls(state)).toHaveLength(2);
  }, SLOW_TEST);

  it("a search, an owner and a health already chosen never narrow the choices", async () => {
    const { api, state } = harness({ live: wide() });
    mount(api, `${LIVE_URL}&q=a-00&owner=Lan-002&health=READY`);
    await loaded();
    await waitFor(() => expect(optionCalls(state)).toHaveLength(2), SLOW);
    for (const call of optionCalls(state)) {
      expect(call.query.has("q")).toBe(false);
      expect(call.filters).toBeNull();
    }
    await waitFor(() => expect(ownerValues()).toEqual(["Bobby-001", "Lan-002", "Zed-129"]), SLOW);
  });

  // Whole-suite flake 2026-10-21 (DEBT-UXM07-032): a multi-step flow of SLOW waits; explicit per-test budget.
  it("a dataset that cannot group by owner or health: the choices are the loaded rows, worded so, and a typed value reaches the server", async () => {
    const { api, state } = harness({ live: wide() });
    withoutOwnerHealthGroups(state);
    mount(api, LIVE_URL);
    await loaded();
    expect(optionCalls(state)).toEqual([]);
    expect(ownerControl().tagName).toBe("INPUT");
    expect(screen.getByTestId("options-limit").textContent).toContain("Owner and Health choices are the rows loaded so far, not the whole fleet.");
    await waitFor(() => expect(ownerValues()).toEqual(["Bobby-001", "Lan-002"]), SLOW);
    // paging brings the rest of the rows, and with them the missing owner; the sentence stays
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(dataRows()).toHaveLength(100), SLOW);
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(dataRows()).toHaveLength(130), SLOW);
    await waitFor(() => expect(ownerValues()).toEqual(["Bobby-001", "Lan-002", "Zed-129"]), SLOW);
    expect(screen.getByTestId("options-limit")).toBeTruthy();
    // and a value the person types is the server's to filter, even before its page is loaded
    const owner = ownerControl();
    fireEvent.change(owner, { target: { value: "Zed-129" } });
    fireEvent.keyDown(owner, { key: "Enter" });
    await waitFor(() => expect(datasetCalls(state).at(-1)!.filters).toEqual([{ field: "owner_user_id", op: "EQ", value: "Zed-129" }]), SLOW);
    await waitFor(() => expect(dataRows()).toHaveLength(1), SLOW);
  }, SLOW_TEST);

  // Whole-suite flake 2026-10-21 (DEBT-UXM07-032): a multi-step flow of SLOW waits; explicit per-test budget.
  it("the Health menu of a dataset that does not publish the list takes a typed value too", async () => {
    const { api, state } = harness({ live: wide() });
    withoutOwnerHealthGroups(state);
    mount(api, LIVE_URL);
    await loaded();
    fireEvent.click(within(screen.getByRole("search")).getByRole("button", { name: "Health" }));
    expect(screen.getByTestId("health-limit").textContent).toContain("Loaded so far");
    const add = screen.getByRole("textbox", { name: "Add a health value" });
    fireEvent.change(add, { target: { value: "finding" } });
    fireEvent.keyDown(add, { key: "Enter" });
    // the typed word is kept as typed when no loaded row has it: the server decides
    await waitFor(() => expect(search().get("health")).toBe("finding"), SLOW);
    await waitFor(() => expect(datasetCalls(state).at(-1)!.filters).toEqual([{ field: "health", op: "EQ", value: "finding" }]), SLOW);
  }, SLOW_TEST);

  it("an answer about another environment is refused: the choices fall back to the loaded rows and say so", async () => {
    const { api, state } = harness({ live: wide() });
    state.mutate = (body, call) => { if (call.query.has("group_by")) body.environment = "paper"; };
    mount(api, LIVE_URL);
    await loaded();
    await waitFor(() => expect(optionCalls(state).length).toBeGreaterThan(0), SLOW);
    expect(ownerControl().tagName).toBe("INPUT");
    expect(screen.getByTestId("options-limit")).toBeTruthy();
  });

  it("a refused options read (503) is not an empty list: the loaded rows are offered, worded so", async () => {
    const { api, state } = harness({ live: wide() });
    state.variantFor = (call) => (call.query.has("group_by") ? "status:503" : "ok");
    mount(api, LIVE_URL);
    await loaded();
    await waitFor(() => expect(optionCalls(state).length).toBe(2), SLOW);
    expect(ownerControl().tagName).toBe("INPUT");
    expect(ownerValues()).toEqual(["Bobby-001", "Lan-002"]);
    expect(screen.getByTestId("options-limit")).toBeTruthy();
  });

  it("a late options answer for a lens the screen has left is dropped", async () => {
    const live = alphasOf(4, [["LIVE"]], { owners: ["Live-Owner"] });
    const paper = alphasOf(4, [["PAPER"]], { owners: ["Paper-Owner"] });
    const { api, state } = harness({ live, paper });
    let release: (() => void) | null = null;
    const held = new Promise<void>((resolve) => { release = resolve; });
    state.before = async (call) => {
      if (call.query.get("environment") === "live" && call.query.get("group_by") === "owner_user_id") await held;
    };
    mount(api, LIVE_URL);
    await loaded();
    fireEvent.click(screen.getByRole("tab", { name: /^Paper/ }));
    await waitFor(() => expect(optionCalls(state).some((call) => call.query.get("environment") === "paper")).toBe(true), SLOW);
    await waitFor(() => expect(ownerValues()).toEqual(["Paper-Owner"]), SLOW);
    release!();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(ownerValues()).toEqual(["Paper-Owner"]);
  });

  it("exactly 200 groups may have been cut by the server: the list is offered, not called complete", async () => {
    const owners = Array.from({ length: 200 }, (_, index) => `Owner-${String(index).padStart(3, "0")}`);
    const { api } = harness({ live: alphasOf(200, [["LIVE"]], { owners }) });
    mount(api, LIVE_URL);
    await loaded();
    await waitFor(() => expect(ownerControl().tagName).toBe("INPUT"), SLOW);
    expect(ownerValues()).toHaveLength(200);
    expect(screen.getByTestId("options-limit").textContent).toContain("Owner choices may be cut short by the server.");
    // Health has fewer groups than the bound, so it is not named
    expect(screen.getByTestId("options-limit").textContent).not.toContain("Health choices");
  });

  it("more owners than the reader's group bound is refused whole, never truncated into a list that looks complete", async () => {
    const owners = Array.from({ length: 201 }, (_, index) => `Owner-${String(index).padStart(3, "0")}`);
    const { api } = harness({ live: alphasOf(201, [["LIVE"]], { owners }) });
    mount(api, LIVE_URL);
    await loaded();
    await waitFor(() => expect(screen.getByTestId("options-limit")).toBeTruthy(), SLOW);
    expect(ownerValues()).toEqual(owners.slice(0, 50));
  });

  it("the Archived lens asks for no choices, no rows and no dataset", async () => {
    const { api, state, legacy } = harness({ live: wide() });
    mount(api, "/execution/fleet?tab=archived");
    expect(await screen.findByText("Archived alphas")).toBeTruthy();
    expect(screen.getByText("Not available")).toBeTruthy();
    expect(state.calls).toEqual([]);
    expect(legacy).toEqual([]);
  });
});
