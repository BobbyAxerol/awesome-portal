/**
 * Alpha Fleet, guide M03 sections 8.1 to 8.3, screen level. Lane BFF_DOUBLE: the port is the REAL HTTP client over a stubbed `fetch`; the
 * dataset double answers `rich` reads (balance, equity, return and the QBTS keys) and records every request, so a sort, a range and a filter
 * are judged by the exact wire the server is asked, never by a client re-sort. A fixture is never a source acceptance.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SLOW } from "../../waitsTestUtil";

import { alphaFleet } from "../../../../../e2e/bffDouble";
import type { AlphaFleetQuery, ExecutionApi } from "../../../api/ports";
import { readAlphaFleet } from "../../../api/profileRead";
import { createHttpApi } from "../../../api/httpApi";
import type { DeliveryPolicy } from "../../../profile";
import { newDatasetDouble, wrapDatasetFetch, type DatasetDoubleState, type DoubleAlpha } from "./datasetDouble.testbase";
import FleetScreen from "./index";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const OPEN: DeliveryPolicy = {
  policyRevision: 4, queryEnabled: true, projectionIngestionEnabled: true, sseEnabled: true, governanceWriteEnabled: true, paperCommandsEnabled: true,
  sandboxCommandsEnabled: true, liveProtectiveCommandsEnabled: true, liveRiskIncreasingCommandsEnabled: true,
};

const alpha = (id: string, extra: Partial<DoubleAlpha>): DoubleAlpha => ({ id, name: `Alpha ${id}`, owner: "Lan-002", health: "READY", stages: ["PAPER"], portfolio: "pf-1", venue: "BINANCE", ...extra });
// Four QBTS states on purpose: published and eligible, provisional, insufficient evidence (a typed absence), a true zero. One has no band.
const POPULATION: DoubleAlpha[] = [
  alpha("a-1", { money: { allocation: "1000", netPnl: "11.5", unrealized: "-2.25", balance: "1011.5", equity: "1009.25", returnPct: "1.15", drawdownPct: "-3.4", winRatePct: "58.25", currency: "USDT" },
    qbts: { value: "83.2", band: "good", evidence: "eligible", p: "90", r: "80", b: "70" } }),
  alpha("a-2", { portfolio: "pf-2", money: { allocation: "500", netPnl: "-3", unrealized: "0", balance: "497", equity: "497", returnPct: "-0.6" },
    qbts: { value: "66.5", band: "fair", evidence: "provisional", p: "70", r: "60", b: "65" } }),
  alpha("a-3", { money: { allocation: "250", netPnl: "0" }, qbts: { value: null, reason: "INSUFFICIENT_EVIDENCE" } }),
  alpha("a-4", { health: "ATTENTION", money: { allocation: "0", netPnl: "0", unrealized: "0", balance: "0", equity: "0", returnPct: "0" },
    qbts: { value: "0", band: "weak", evidence: "eligible", p: "0", r: "0", b: "0" } }),
  alpha("a-5", { money: { allocation: "75", netPnl: "1" }, qbts: { value: "50.1", evidence: "eligible", p: "50", r: "50", b: "50" } }),
];

function harness(population: DoubleAlpha[] = POPULATION, extra: (state: DatasetDoubleState) => void = () => undefined) {
  const state = newDatasetDouble({ paper: population });
  state.rich = true;
  extra(state);
  vi.stubGlobal("fetch", wrapDatasetFetch(null, state));
  const http = createHttpApi({ policy: OPEN, readScope: {} });
  const getAlphaFleet = vi.fn(async (query: AlphaFleetQuery = {}) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== "") params.set(key, String(value));
    const reply = alphaFleet(params);
    const envelope = reply.status === 200 ? readAlphaFleet(reply.body) : null;
    return envelope ? { ok: true as const, value: envelope } : { ok: false as const, status: "unavailable" as const, reason: "UNREADABLE_ALPHA_FLEET" };
  });
  const getManagerSeries = vi.fn();
  return { api: { getAlphaFleet, getManagerDataset: http.getManagerDataset, getManagerSeries } as unknown as ExecutionApi, state, getManagerSeries };
}

function Where() {
  const { pathname, search } = useLocation();
  return <output data-testid="where">{pathname + search}</output>;
}
// Every guide 8.1 column on (the default set is only the seven that fit 1440; one test below pins that default).
const ALL_COLUMNS = "cols=owner,in-stage,unrealized,balance,equity,source,select";
const mount = (api: ExecutionApi, entry = "/execution/fleet?stage=paper", all = true) =>
  render(
    <MemoryRouter initialEntries={[all ? `${entry}${entry.includes("?") ? "&" : "?"}${ALL_COLUMNS}` : entry]}>
      <FleetScreen api={api} />
      <Where />
    </MemoryRouter>,
  );
const search = () => new URLSearchParams((screen.getByTestId("where").textContent ?? "").split("?")[1] ?? "");
const table = () => screen.getByRole("table", { name: "Alpha fleet" });
const loaded = async () => screen.findByRole("table", { name: "Alpha fleet" }, SLOW);
const dataRows = () => within(table()).getAllByRole("row").slice(1).filter((row) => !row.classList.contains("exec-cards-group"));
const cell = (row: HTMLElement, label: string) => row.querySelector(`td[data-l='${label}']`)?.textContent ?? "";
const headers = () => [...table().querySelectorAll("th")].map((th) => th.textContent ?? "");
const rowOf = (name: string) => dataRows().find((row) => cell(row, "Alpha").includes(name))!;
const rowCalls = (state: DatasetDoubleState) => state.calls.filter((call) => call.query.get("limit") === "50");
const last = (state: DatasetDoubleState) => rowCalls(state).at(-1)!;
const toolbar = () => screen.getByRole("search");
const metrics = () => screen.getByRole("group", { name: "Metric filters" });
const header = (label: string) => [...table().querySelectorAll("th")].find((th) => (th.textContent ?? "").startsWith(label))!;
const sortButton = (label: string) => within(header(label)).getByRole("button");
const click = async (label: string) => { await loaded(); fireEvent.click(sortButton(label)); await Promise.resolve(); };
const BASIS_ID = JSON.stringify(["PAPER", "USDT", "TEST_ONLY:net-ledger", "TEST_ONLY:paper-ledger", "TEST_ONLY:not-economic-authority"]);
const PAPER_BASIS = { economic_domain: "PAPER", currency: "USDT", basis: "TEST_ONLY:net-ledger", native_profile_ref: "TEST_ONLY:paper-ledger", domain_proof_ref: "TEST_ONLY:not-economic-authority" };

describe("QA3 R2-04 · no ticket ids in the rendered words of any Fleet view", () => {
  const TICKET = /\bFE-[A-Z0-9]{2,}|BR-EX-|A360-|ELP2-REQ-|BQ-FLEET/;
  const words = () => [document.body.textContent ?? "", ...[...document.querySelectorAll("[title],[aria-label]")].map((el) => `${el.getAttribute("title") ?? ""} ${el.getAttribute("aria-label") ?? ""}`)].join("\n");
  it("the table (with its peek drawer), the board and the map print reasons in words", async () => {
    const { api } = harness();
    mount(api);
    await loaded();
    expect(words()).not.toMatch(TICKET);
    fireEvent.click(rowOf("a-1"));
    await waitFor(() => expect(search().get("sel")).not.toBeNull());
    expect(words()).not.toMatch(TICKET);
  });
  it("the board", async () => {
    const { api } = harness();
    mount(api, "/execution/fleet?stage=paper&view=board", false);
    await screen.findByRole("group", { name: "Alpha fleet board" }, SLOW);
    expect(words()).not.toMatch(TICKET);
  });
  it("the map", async () => {
    const { api } = harness();
    mount(api, "/execution/fleet?stage=paper&view=map", false);
    await screen.findByTestId("fleet-map", undefined, SLOW);
    expect(words()).not.toMatch(TICKET);
  });
});

describe("guide 8.1 · the columns", () => {
  it("the default set is the guide 8.1 set with QBTS, Alloc, PNL, MDD and Winrate early (Unrealized PNL and Account balance are optional now); Owner and Source are lines of their cells until their own columns are switched on", async () => {
    const { api } = harness();
    mount(api, "/execution/fleet?stage=paper", false);
    await loaded();
    expect(headers()).toEqual(["Alpha", "Portfolio", "Current stage", "In stage", "QBTS", "Alloc", "PNL Amount", "MDD", "Winrate", "Equity 30D", "Health"]);
    const a1 = rowOf("a-1");
    // Owner / Portfolio and Health / Source are one cell each: the owner is the second line, the source state the second line
    expect(a1.querySelector("td[data-l='Portfolio'] .exec-fleet-owner-line")?.textContent).toBeTruthy();
    expect(a1.querySelector("td[data-l='Health'] .exec-fleet-source-line")?.textContent).toBeTruthy();
    expect(within(table()).queryAllByRole("checkbox")).toHaveLength(0);
    // the economic-domain tag is visible on every money figure (environment does not imply economic domain)
    const tag = rowOf("a-1").querySelector("td[data-l='Alloc'] .exec-fleet-part-tag") as HTMLElement;
    expect(tag.className).not.toContain("exec-fleet-sr");
    expect(tag.textContent).toBe("Paper · USDT");
  });

  it("has every mandatory column, in the guide's order, on the fixture lane", async () => {
    const { api } = harness();
    mount(api);
    await loaded();
    expect(headers().filter((h) => h !== "Select")).toEqual([
      "Alpha", "Owner", "Portfolio", "Current stage", "In stage", "QBTS", "Alloc", "PNL Amount", "MDD", "Winrate", "Equity 30D", "Health", "Source", "Unrealized PNL", "Account balance",
    ]);
    const a1 = rowOf("a-1");
    expect(cell(a1, "Alloc")).toContain("Paper · USDT");
    expect(cell(a1, "Alloc")).toContain("1,000");
    expect(cell(a1, "PNL Amount")).toContain("+11.50");
    expect(cell(a1, "Unrealized PNL")).toContain("-2.25");
    expect(cell(a1, "Account balance")).toContain("1,011.50");
    expect(cell(a1, "Equity 30D")).toContain("1,009.25");
    // MDD keeps the MetricValue percent (2 places); Winrate is a percent of closed trades with ONE decimal and a % sign, the exact string on its title
    expect(cell(a1, "MDD")).toContain("-3.40%");
    expect(cell(a1, "Winrate")).toContain("58.3%");
    expect(rowOf("a-1").querySelector("td[data-l='Winrate'] .exec-mgr-num")?.getAttribute("title")).toContain("58.25");
    // a row that publishes neither says so (the typed absence), never 0 and never a dash
    for (const label of ["MDD", "Winrate"]) {
      expect(cell(rowOf("a-2"), label), label).toContain("Not available");
      expect(cell(rowOf("a-2"), label), label).not.toMatch(/\d%/);
    }
  });

  it("QBTS is read as published: value, band, provisional flag, typed absence, true zero; no band is ever computed here", async () => {
    const { api } = harness();
    mount(api);
    await loaded();
    const good = cell(rowOf("a-1"), "QBTS");
    expect(good).toContain("83.2");
    expect(good).toContain("Good");
    expect(good).not.toContain("Provisional");
    const provisional = cell(rowOf("a-2"), "QBTS");
    expect(provisional).toContain("66.5");
    expect(provisional).toContain("Fair");
    expect(provisional).toContain("Provisional");
    const insufficient = rowOf("a-3");
    expect(cell(insufficient, "QBTS")).toContain("Not available");
    expect(cell(insufficient, "QBTS")).not.toMatch(/\b0\b/);
    const zero = rowOf("a-4");
    expect(cell(zero, "QBTS")).toContain("0");
    expect(cell(zero, "QBTS")).toContain("Weak");
    expect(zero.querySelector("td[data-l='QBTS'] .exec-mgr-num")?.getAttribute("data-zero")).toBe("true");
    // 50.1 would be "Neutral" by the policy table, but the dataset named no band: the screen says so and does not look it up.
    expect(cell(rowOf("a-5"), "QBTS")).toContain("50.1");
    expect(cell(rowOf("a-5"), "QBTS")).toContain("No band");
    expect(cell(rowOf("a-5"), "QBTS")).not.toContain("Neutral");
  });

  it("the QBTS disclosure names the components, the evidence, the policy label and, for an absence, the reason", async () => {
    const { api } = harness();
    mount(api);
    await loaded();
    fireEvent.click(within(rowOf("a-2")).getByRole("button", { name: "QBTS details, Alpha a-2" }));
    const text = rowOf("a-2").textContent ?? "";
    expect(text).toContain("Components: P 70, R 60, B 65.");
    expect(text).toContain("provisional");
    expect(text).toContain("Policy: FIXTURE_LAB.");
    fireEvent.click(within(rowOf("a-3").querySelector("td[data-l='QBTS']") as HTMLElement).getByRole("button", { name: "Not available, reason" }));
    expect(rowOf("a-3").textContent).toContain("INSUFFICIENT_EVIDENCE");
  });

  it("the Portfolio cell carries a badge with the deployments when the row has several", async () => {
    const { api } = harness([alpha("m-1", { stages: ["PAPER"] })]);
    mount(api);
    await loaded();
    expect(rowOf("m-1").querySelector(".exec-fleet-badge")).toBeNull();
  });

  it("optional columns live in the Columns menu: unrealized PNL, account balance, venue, lifecycle, version, economic domain, score coverage; the rest are not controls", async () => {
    const { api } = harness();
    mount(api, "/execution/fleet?stage=paper", false);
    await loaded();
    expect(headers()).not.toContain("Venue");
    fireEvent.click(screen.getByRole("button", { name: /^Columns/ }));
    const menu = screen.getByRole("group", { name: "Columns" });
    const labels = within(menu).getAllByRole("checkbox").map((box) => (box as HTMLInputElement).labels?.[0]?.textContent?.replace(" optional", ""));
    expect(labels).toEqual([
      "Owner", "Portfolio", "Current stage", "In stage", "QBTS", "Alloc", "PNL Amount", "MDD", "Winrate", "Equity 30D", "Health", "Source",
      "Select", "Unrealized PNL", "Account balance", "Venue", "Lifecycle", "Version", "Economic domain", "Score coverage",
    ]);
    expect(menu.textContent).not.toMatch(/Deployer|Regime|Last trade|funding completeness/);
    fireEvent.click(within(menu).getByRole("checkbox", { name: /Venue/ }));
    fireEvent.click(within(menu).getByRole("checkbox", { name: /Score coverage/ }));
    await waitFor(() => expect(search().get("cols")).toBe("venue,coverage"));
    expect(cell(rowOf("a-1"), "Venue")).toBe("BINANCE");
    expect(cell(rowOf("a-1"), "Score coverage")).toBe("Eligible");
    expect(cell(rowOf("a-3"), "Score coverage")).toBe("Insufficient");
    fireEvent.click(within(menu).getByRole("checkbox", { name: /QBTS/ }));
    await waitFor(() => expect(headers()).not.toContain("QBTS"));
    expect(search().get("dhide")).toBe("qbts");
  });
});

describe("guide 8.2 · sorting is the server's", () => {
  it("a header click adds the key ascending, again reverses, again removes; the wire is exactly the keys, no tiebreak of ours", async () => {
    const { api, state } = harness();
    mount(api);
    await loaded();
    await click("QBTS");
    await waitFor(() => expect(last(state).sort).toEqual([{ field: "score", direction: "asc" }]));
    expect(search().get("sorts")).toBe("score:asc");
    expect(header("QBTS").getAttribute("aria-sort")).toBe("ascending");
    await click("QBTS");
    await waitFor(() => expect(last(state).sort).toEqual([{ field: "score", direction: "desc" }]));
    expect(header("QBTS").getAttribute("aria-sort")).toBe("descending");
    await click("QBTS");
    await waitFor(() => expect(last(state).sort).toBeNull());
    expect(search().get("sorts")).toBeNull();
  });

  it("several keys keep their click order as priority (1, 2, 3), shown on the headers and in the sort line; a fourth replaces the oldest", async () => {
    const { api, state } = harness();
    mount(api);
    await loaded();
    await click("Alpha");
    await click("QBTS");
    await click("QBTS");
    await waitFor(() => expect(last(state).sort).toEqual([{ field: "name", direction: "asc" }, { field: "score", direction: "desc" }]));
    expect(header("Alpha").textContent).toContain("1");
    expect(header("QBTS").textContent).toContain("2");
    expect(screen.getByTestId("sortbar").textContent).toContain("Sorted by Alpha ascending (1), then QBTS descending (2). Empty values go last in both directions.");
    await click("Owner");
    await click("Health");
    await waitFor(() => expect((last(state).sort as { field: string }[]).map((key) => key.field)).toEqual(["score", "owner_user_id", "health"]));
    fireEvent.click(screen.getByRole("button", { name: "Clear sort" }));
    await waitFor(() => expect(last(state).sort).toBeNull());
  });

  it("the Sort select is the preset path for narrow screens and writes the same single key; QBTS is one of its presets", async () => {
    const { api, state } = harness();
    mount(api);
    await loaded();
    const select = screen.getByRole("combobox", { name: "Sort" }) as HTMLSelectElement;
    expect([...select.options].map((option) => option.textContent)).toContain("Sort: QBTS, high to low");
    fireEvent.change(select, { target: { value: "score:desc" } });
    await waitFor(() => expect(last(state).sort).toEqual([{ field: "score", direction: "desc" }]));
    await click("Alpha");
    await waitFor(() => expect(select.value).not.toBe("score:desc"));
    expect([...select.options].some((option) => (option.textContent ?? "").startsWith("Sort: custom (2 keys)"))).toBe(true);
  });

  it("a money header is a sort control only with a Basis; the sort then pins that one economic partition on the wire", async () => {
    const { api, state } = harness();
    mount(api);
    await loaded();
    for (const label of ["Alloc", "PNL Amount", "Unrealized PNL", "Account balance", "Equity 30D"]) {
      expect(within(header(label)).queryByRole("button"), label).toBeNull();
      expect(header(label).getAttribute("title"), label).toContain("Basis");
    }
    expect(within(header("QBTS")).getByRole("button")).toBeTruthy();
    fireEvent.change(await within(metrics()).findByRole("combobox", { name: "Basis" }, SLOW), { target: { value: BASIS_ID } });
    await waitFor(() => expect(search().get("basis")).toBe(BASIS_ID));
    await click("PNL Amount");
    await waitFor(() => expect(last(state).sort).toEqual([{ field: "net_pnl", direction: "asc" }]));
    expect(JSON.parse(last(state).query.get("economic_partition")!)).toEqual(PAPER_BASIS);
    // a plain read does not pin a partition: only a money order or range needs one
    await click("PNL Amount");
    await click("PNL Amount");
    await waitFor(() => expect(last(state).query.has("economic_partition")).toBe(false));
  });

  it("a money sort in a shared link without its basis is not sent, and the sort line says why", async () => {
    const { api, state } = harness();
    mount(api, "/execution/fleet?stage=paper&sorts=net_pnl:desc");
    await loaded();
    expect(rowCalls(state)[0]!.sort).toBeNull();
    expect(screen.getByTestId("sortbar").textContent).toContain("PNL Amount is not applied: A money order needs one economic partition (choose a Basis).");
  });

  it("the Equity 30D scalar chooser: value, return or drawdown; the sparkline never sorts; drawdown is shown but is not a published sort field", async () => {
    const { api, state } = harness();
    mount(api);
    await loaded();
    fireEvent.change(within(metrics()).getByRole("combobox", { name: "Equity 30D shows" }), { target: { value: "return" } });
    await waitFor(() => expect(search().get("eq")).toBe("return"));
    expect(cell(rowOf("a-1"), "Equity 30D")).toContain("1.15");
    expect(cell(rowOf("a-1"), "Equity 30D")).toContain("%");
    // return_30d_pct is a percent, not money: no basis needed
    await click("Equity 30D");
    await waitFor(() => expect(last(state).sort).toEqual([{ field: "return_30d_pct", direction: "asc" }]));
    expect(last(state).query.has("economic_partition")).toBe(false);
    fireEvent.change(within(metrics()).getByRole("combobox", { name: "Equity 30D shows" }), { target: { value: "drawdown" } });
    await waitFor(() => expect(search().get("eq")).toBe("drawdown"));
    expect(within(header("Equity 30D")).queryByRole("button")).toBeNull();
    expect(header("Equity 30D").getAttribute("title")).toContain("not a published sort field");
  });
});

describe("guide 8.2 · filters are the server's", () => {
  const apply = async (state: DatasetDoubleState, expectation: () => void) => { await waitFor(expectation, SLOW); return last(state); };

  it("numeric ranges are inclusive GTE / LTE with the unit and boundary rule in words; money ranges wait for a Basis", async () => {
    const { api, state } = harness();
    mount(api);
    await loaded();
    fireEvent.click(within(metrics()).getByRole("button", { name: /^Ranges/ }));
    const menu = screen.getByRole("group", { name: "Numeric ranges" });
    expect(menu.textContent).toContain("Inclusive bounds: at least the first value and at most the second.");
    expect(screen.getByTestId("range-needs-basis")).toBeTruthy();
    expect((within(menu).getByLabelText("PNL Amount at least") as HTMLInputElement).disabled).toBe(true);
    fireEvent.change(within(menu).getByLabelText("QBTS at least"), { target: { value: "60" } });
    fireEvent.change(within(menu).getByLabelText("QBTS at most"), { target: { value: "75.5" } });
    fireEvent.change(within(menu).getByLabelText("Return 30D at least"), { target: { value: "1e9" } });
    fireEvent.click(within(menu).getByRole("button", { name: "Apply" }));
    const call = await apply(state, () => expect(search().get("rng")).toBe("score~60~75.5"));
    await waitFor(() => expect(last(state).filters).toEqual([{ field: "score", op: "GTE", value: "60" }, { field: "score", op: "LTE", value: "75.5" }]));
    expect(call.query.has("economic_partition")).toBe(false);
    const chip = screen.getByRole("list", { name: "Active filters" });
    expect(chip.textContent).toContain("range: QBTS 60 to 75.5 (inclusive; score points, 0 to 100)");
    fireEvent.click(within(chip).getByRole("button", { name: "Clear range" }));
    await waitFor(() => expect(last(state).filters).toBeNull());
  });

  it("typing a range and clicking away keeps it; Escape cancels it (QA1 R2-06)", async () => {
    const { api, state } = harness();
    mount(api);
    await loaded();
    fireEvent.click(within(metrics()).getByRole("button", { name: /^Ranges/ }));
    fireEvent.change(within(screen.getByRole("group", { name: "Numeric ranges" })).getByLabelText("QBTS at least"), { target: { value: "55" } });
    fireEvent.mouseDown(document.body);
    await waitFor(() => expect(search().get("rng")).toBe("score~55~"), SLOW);
    await waitFor(() => expect(last(state).filters).toEqual([{ field: "score", op: "GTE", value: "55" }]));
    fireEvent.click(within(metrics()).getByRole("button", { name: /^Ranges/ }));
    const menu = screen.getByRole("group", { name: "Numeric ranges" });
    fireEvent.change(within(menu).getByLabelText("QBTS at most"), { target: { value: "90" } });
    fireEvent.keyDown(menu, { key: "Escape" });
    fireEvent.keyDown(document, { key: "Escape" });
    await Promise.resolve();
    expect(search().get("rng")).toBe("score~55~");
    // the money rows say once, in one sentence, that they need a basis
    expect(screen.queryAllByText("needs a basis")).toHaveLength(0);
  });

  it("a money range with a Basis pins the partition and says which currency it is in", async () => {
    const { api, state } = harness();
    mount(api, `/execution/fleet?stage=paper&basis=${encodeURIComponent(BASIS_ID)}`);
    await loaded();
    fireEvent.click(within(metrics()).getByRole("button", { name: /^Ranges/ }));
    const menu = screen.getByRole("group", { name: "Numeric ranges" });
    fireEvent.change(within(menu).getByLabelText("PNL Amount at least"), { target: { value: "-5" } });
    fireEvent.change(within(menu).getByLabelText("Alloc at most"), { target: { value: "900.5" } });
    fireEvent.click(within(menu).getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(last(state).filters).toEqual([{ field: "allocation", op: "LTE", value: "900.5" }, { field: "net_pnl", op: "GTE", value: "-5" }]));
    expect(JSON.parse(last(state).query.get("economic_partition")!)).toEqual(PAPER_BASIS);
    expect(screen.getByRole("list", { name: "Active filters" }).textContent).toContain("in Paper · USDT");
  });

  it("portfolio, venue, source state, version, lifecycle and evidence are EQ / IN / IS_NULL on the published fields", async () => {
    const { api, state } = harness();
    mount(api, "/execution/fleet?stage=paper&portfolio=pf-1&venue=BINANCE,KRAKEN&source=FRESH,STALE&version=av-1&lifecycle=ACTIVE&evidence=missing");
    await loaded();
    const call = rowCalls(state)[0]!;
    expect(call.filters).toEqual([
      { field: "portfolio_id", op: "EQ", value: "pf-1" },
      { field: "venue", op: "IN", values: ["BINANCE", "KRAKEN"] },
      { field: "alpha_version_id", op: "EQ", value: "av-1" },
      { field: "source_state", op: "IN", values: ["FRESH", "STALE"] },
      { field: "score", op: "IS_NULL" },
    ]);
    expect(call.query.get("lifecycle_filter")).toBe("ACTIVE");
    const chips = screen.getByRole("list", { name: "Active filters" }).textContent ?? "";
    for (const part of ["portfolio: pf-1", "venue: BINANCE, KRAKEN", "version: av-1", "lifecycle: Active", "evidence: Missing score (no QBTS published)"]) expect(chips).toContain(part);
    fireEvent.change(within(metrics()).getByRole("combobox", { name: "Evidence" }), { target: { value: "stale" } });
    await waitFor(() => expect((last(state).filters as unknown[]).at(-1)).toEqual({ field: "source_state", op: "EQ", value: "STALE" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    // Clear all also clears the lens (here: Paper), so the All lens asks ALL, which this double does not offer: the fleet read, no filter left.
    await waitFor(() => expect(search().get("portfolio")).toBeNull());
    for (const name of ["venue", "source", "version", "lifecycle", "evidence", "stage"]) expect(search().get(name), name).toBeNull();
  });

  it("only legal published keys become controls: no logical account, regime or window control exists", async () => {
    const { api } = harness();
    mount(api);
    await loaded();
    const names = [...within(toolbar()).queryAllByRole("combobox"), ...within(metrics()).queryAllByRole("combobox")].map((box) => box.getAttribute("aria-label") ?? box.textContent);
    expect(names.join("|")).not.toMatch(/account|regime|window/i);
    expect(screen.getByText(/Not available:.*Window/s)).toBeTruthy();
  });

  it("the choices of Portfolio, Venue and Source are the rows loaded so far, and say so", async () => {
    const { api } = harness();
    mount(api);
    await loaded();
    fireEvent.click(within(metrics()).getByRole("button", { name: "Portfolio" }));
    const menu = screen.getByRole("group", { name: "Portfolio" });
    expect(within(menu).getAllByRole("checkbox").map((box) => (box as HTMLInputElement).labels?.[0]?.textContent)).toEqual(["pf-1", "pf-2"]);
    expect(within(menu).getByTestId("portfolio-limit")).toBeTruthy();
  });
});

describe("guide 8.2 / 8.3 · groups, density, selection, KPIs", () => {
  it("groups up to two levels over the whole filtered query, with row counts and the membership note", async () => {
    const { api, state } = harness();
    mount(api, "/execution/fleet?stage=paper&group=portfolio_id&then=owner_user_id");
    await loaded();
    await waitFor(() => expect(last(state).query.get("group_by")).toBe("portfolio_id,owner_user_id"));
    const groups = await screen.findByTestId("dataset-groups");
    expect([...groups.querySelectorAll("li")].map((li) => li.textContent)).toEqual(["pf-1, Lan-002: 4", "pf-2, Lan-002: 1"]);
    expect(screen.getByTestId("group-note").textContent).toContain("rows (alpha versions in a portfolio) over the whole filtered result");
    expect(screen.getByTestId("group-note").textContent).toContain("never added into a total");
    const options = [...(screen.getByRole("combobox", { name: "Group by" }) as HTMLSelectElement).options].map((option) => option.textContent);
    expect(options).toEqual(expect.arrayContaining(["Group: Portfolio", "Group: Owner", "Group: Venue", "Group: Source state", "Group: Stage presence"]));
  });

  it("a group renders as header rows in the table, with the whole-query row count, and the rows sit under their group (QA1 R2-07)", async () => {
    const { api } = harness();
    mount(api, "/execution/fleet?stage=paper&group=portfolio");
    await loaded();
    const heads = await screen.findAllByTestId("group-header");
    expect(heads.map((head) => head.querySelector(".exec-fleet-groupname")?.textContent)).toEqual(["pf-1", "pf-2"]);
    expect(heads[0]!.querySelector(".exec-fleet-groupcount")?.textContent).toMatch(/^4 rows/);
    // the row order is the group order: every pf-1 row precedes every pf-2 row, under its header
    const order = [...table().querySelectorAll("tbody tr")].map((tr) => (tr.classList.contains("exec-cards-group") ? `# ${tr.textContent?.slice(0, 4)}` : cell(tr as HTMLElement, "Portfolio").slice(0, 4)));
    expect(order[0]).toBe("# pf-1");
    expect(order.indexOf("# pf-2")).toBeGreaterThan(order.lastIndexOf("pf-1"));
  });

  it("compact density is a switch in the URL; the figures keep their size, the rows get shorter", async () => {
    const { api } = harness();
    const { container } = mount(api);
    await loaded();
    expect(container.querySelector(".exec-fleet-compact")).toBeNull();
    fireEvent.click(within(within(metrics()).getByRole("group", { name: "Density" })).getByRole("button", { name: "Compact" }));
    await waitFor(() => expect(search().get("density")).toBe("compact"));
    expect(container.querySelector(".exec-fleet-compact")).not.toBeNull();
  });

  it("the identity column is sticky and the scroll region says it scrolls; the table is named for assistive technology", async () => {
    const { api } = harness();
    const { container } = mount(api);
    await loaded();
    expect(container.querySelector("table.exec-fleet-dataset")).not.toBeNull();
    expect(container.querySelector(".exec-cards-wrap")).not.toBeNull();
  });

  it("row checkboxes exist only as disabled, each pointing at the one typed reason; Compare is a typed disabled button", async () => {
    const { api } = harness();
    mount(api);
    await loaded();
    const boxes = within(table()).getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes).toHaveLength(5);
    const reasonId = boxes[0]!.getAttribute("aria-describedby")!;
    expect(boxes.every((box) => box.disabled && box.getAttribute("aria-describedby") === reasonId)).toBe(true);
    expect(document.getElementById(reasonId)!.textContent).toBe("Comparing 2 to 4 alphas is not available: Not published: compare.");
    expect((screen.getByRole("button", { name: "Compare selected" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("the KPI strip has the design's tiles; the two lifecycle ones are typed absences with their request ids", async () => {
    const { api } = harness();
    mount(api);
    await loaded();
    await waitFor(() => expect(document.querySelectorAll(".exec-blk-kpi").length).toBe(7));
    const tile = (label: string) => [...document.querySelectorAll(".exec-blk-kpi")].find((k) => k.querySelector("dt")?.textContent === label)?.textContent ?? "";
    expect(tile("Ready for exit review")).toContain("Not published: readiness");
    expect(tile("Archive in progress")).toContain("Not published: archived list");
    expect(tile("Ready for exit review")).not.toMatch(/\b0\b/);
  });
});

describe("the Equity 30D sparkline comes from the series port", () => {
  it("asks NAV, 30D, for the row's portfolios, four at a time, and draws what the series says; an absent series draws nothing", async () => {
    const { api, getManagerSeries } = harness([
      alpha("s-1", { portfolio: "pf-1", money: { equity: "10" } }), alpha("s-2", { portfolio: "pf-2", money: { equity: "20" } }),
      alpha("s-3", { portfolio: "pf-3", money: {} }), alpha("s-4", { portfolio: "pf-4", money: {} }), alpha("s-5", { portfolio: "pf-5", money: {} }),
    ]);
    getManagerSeries.mockImplementation(async (query: { subjects: { subjectId: string }[] }) => ({
      ok: true,
      value: { series: query.subjects.map((subject) => (subject.subjectId === "pf-1"
        ? { state: "AVAILABLE", points: [{ exact: "1" }, { exact: "3" }, { exact: "2" }], currency: "USDT", basis: "NAV" }
        : { state: "UNAVAILABLE", reasonCode: "SERIES_SOURCE_NOT_PUBLISHED" })) },
    }));
    const { container } = mount(api);
    await loaded();
    await waitFor(() => expect(getManagerSeries).toHaveBeenCalledTimes(2), SLOW);
    const asked = getManagerSeries.mock.calls.map((call) => call[0]);
    expect(asked.map((query: { subjects: unknown[] }) => query.subjects.length).sort()).toEqual([1, 4]);
    expect(asked.every((query: { metric: string; window: string; environment: string }) => query.metric === "NAV" && query.window === "30D" && query.environment === "paper")).toBe(true);
    await waitFor(() => expect(container.querySelectorAll(".exec-fleet-spark").length).toBe(1), SLOW);
    expect(rowOf("s-1").querySelector(".exec-fleet-spark")?.getAttribute("title")).toContain("Portfolio pf-1 NAV, 30 days");
    expect(rowOf("s-1").querySelector(".exec-fleet-spark")?.getAttribute("title")).toContain("not the alpha version");
    expect(rowOf("s-2").querySelector(".exec-fleet-spark")).toBeNull();
  });
});

describe("Codex review: honest partitions, evidence and sparklines", () => {
  it("a single-environment Live view whose only partition is PAPER prints the Paper label (the environment does not imply the economic domain)", async () => {
    const { api } = harness([alpha("l-1", { stages: ["LIVE"], money: { allocation: "100", netPnl: "5" } })], (state) => {
      state.population.live = state.population.paper;
      state.population.paper = [];
      state.mutate = (body) => { for (const row of body.items) for (const entry of row.economic_partitions) entry.partition.economic_domain = "PAPER"; };
    });
    mount(api, "/execution/fleet?stage=live", true);
    await loaded();
    for (const label of ["Alloc", "PNL Amount"]) {
      const part = rowOf("l-1").querySelector(`td[data-l='${label}'] .exec-fleet-part-tag`) as HTMLElement;
      expect(part.textContent, label).toBe("Paper · USDT");
      expect(part.className, label).not.toContain("exec-fleet-sr");
    }
    expect(rowOf("l-1").textContent).not.toContain("Real-funded");
  });

  it("two Paper / USDT partitions of different owning books are two Basis choices, labelled apart; the second is pinned whole", async () => {
    const { api, state } = harness([alpha("t-1", { money: { allocation: "1", netPnl: "2" } }), alpha("t-2", { money: { allocation: "3", netPnl: "4" } })], (double) => {
      double.mutate = (body) => {
        body.items.forEach((row: { economic_partitions: { partition: Record<string, string> }[] }, index: number) => {
          if (index === 1) row.economic_partitions[0]!.partition.native_profile_ref = "TEST_ONLY:paper-ledger-b";
        });
      };
    });
    mount(api);
    await loaded();
    const select = (await within(metrics()).findByRole("combobox", { name: "Basis" }, SLOW)) as HTMLSelectElement;
    await waitFor(() => expect(select.options.length).toBe(3), SLOW);
    const options = [...select.options].map((option) => option.textContent);
    expect(options).toEqual(["Basis: none", "Basis: Paper · USDT · TEST_ONLY:paper-ledger", "Basis: Paper · USDT · TEST_ONLY:paper-ledger-b"]);
    const second = JSON.stringify(["PAPER", "USDT", "TEST_ONLY:net-ledger", "TEST_ONLY:paper-ledger-b", "TEST_ONLY:not-economic-authority"]);
    fireEvent.change(select, { target: { value: second } });
    await waitFor(() => expect(search().get("basis")).toBe(second), SLOW);
    await click("PNL Amount");
    await waitFor(() => expect(JSON.parse(last(state).query.get("economic_partition")!).native_profile_ref).toBe("TEST_ONLY:paper-ledger-b"), SLOW);
  });

  it("an absence prints the reason the metric carries: insufficient only when the evidence says so, MIXED_ECONOMIC_DOMAINS stays itself", async () => {
    const { api } = harness([
      alpha("e-1", { qbts: { value: null, reason: "INSUFFICIENT_EVIDENCE" } }),
      alpha("e-2", { qbts: { value: null, reason: "MIXED_ECONOMIC_DOMAINS", noEvidence: true } }),
    ]);
    mount(api, "/execution/fleet?stage=paper&cols=coverage,owner,in-stage,unrealized,balance,equity,source,select");
    await loaded();
    expect(cell(rowOf("e-1"), "Score coverage")).toBe("Insufficient");
    expect(cell(rowOf("e-2"), "Score coverage")).toBe("Evidence not published");
    fireEvent.click(within(rowOf("e-2").querySelector("td[data-l='QBTS']") as HTMLElement).getByRole("button", { name: "Not available, reason" }));
    expect(rowOf("e-2").textContent).toContain("MIXED_ECONOMIC_DOMAINS");
    expect(rowOf("e-2").textContent).not.toMatch(/insufficient/i);
  });
});
