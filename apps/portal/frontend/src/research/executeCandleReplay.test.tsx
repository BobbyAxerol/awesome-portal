/**
 * W5b · Screen 08 on the retained bar ledger (signal_notional, close_target_v2).
 *
 * Every body here is a published canonical fixture (CG-P17-01), generated from
 * the real-HMD seal of a QuantBT 1.1.1 Delta signal-notional WFO by
 * `apps/control-api/test/research-w5b-replay.spec.ts`:
 *   - research-current-source.replay.fold0.valid.json  (fold 0, 168 bars)
 *   - research-current-source.replay-transitions.valid.json (8 transitions)
 *   - research-current-source.replay.legacy-seal.valid.json (a pre-W5b seal)
 *
 * Gate IDs: P17-T01 (route semantics on screen), T06 (DOM bound), T07 (no
 * request from transport/reveal), T08 (no certificate), T12 (fold deep
 * link), T13 (causal reveal), T14 (fold switch keeps capital convention).
 */
import { act, cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CLOSE_TARGET_NOTICE, REVEAL_HIDDEN, paddedRange, windowMarkers } from "./ExecuteCandleReplay";
import { ExecuteRoute } from "./ExecuteRoute";
import type { CurrentSourceReplay, ReplayChildAudit, ReplayTransitions } from "./replayClient";
import { forgetRunIdentities } from "./retainedLane";

vi.mock("lightweight-charts", () => {
  /* jsdom has no canvas: a recording double, so the tests read the data the chart was given. */
  const series = () => ({ setData: vi.fn(), applyOptions: vi.fn(), data: () => [] });
  const markers = { setMarkers: vi.fn() };
  return {
    ColorType: { Solid: "solid" },
    LineType: { WithSteps: 1 },
    CandlestickSeries: "candles",
    LineSeries: "line",
    createSeriesMarkers: () => markers,
    createChart: () => ({
      addSeries: () => series(),
      panes: () => [],
      remove: vi.fn(),
      setCrosshairPosition: vi.fn(),
      timeScale: () => ({ getVisibleLogicalRange: () => null, setVisibleLogicalRange: vi.fn(), fitContent: vi.fn() }),
    }),
    __markers: markers,
  };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const FIXTURES = join(process.cwd(), "..", "..", "..", "packages", "contracts", "fixtures");
const load = <T,>(name: string) => JSON.parse(readFileSync(join(FIXTURES, name), "utf8")) as T;
const FOLD0 = load<CurrentSourceReplay>("research-current-source.replay.fold0.valid.json");
const LEDGER = load<ReplayTransitions>("research-current-source.replay-transitions.valid.json");
const LEGACY = load<CurrentSourceReplay>("research-current-source.replay.legacy-seal.valid.json");
const AUDIT0 = load<ReplayChildAudit>("research-current-source.replay-child-audit.fold0.valid.json");
const W3B = JSON.parse(readFileSync(join(process.cwd(), "src", "research", "w3bRealWfo.fixture.json"), "utf8")) as { progress: unknown; requested_spec: unknown };
const W3 = JSON.parse(readFileSync(join(process.cwd(), "src", "research", "w3RealWfo.fixture.json"), "utf8")) as { evidence: unknown };
const RUN = FOLD0.run_id;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** The P04 hub declines a WFO run; the screen then reads the retained lane. */
const HUB = {
  schema_version: "research.replay.v1",
  run_id: RUN,
  route: { id: null, state: "NOT_PUBLISHED", replay_contract: null, availability: { state: "NOT_PUBLISHED", reason_code: "P04_SOURCE_DID_NOT_PUBLISH_X" } },
  equity_replay: { items: [], page: {}, state_at_cursor: { playback_ordinal: null } },
};

function fetchFor(replayBody: CurrentSourceReplay = FOLD0) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const path = new URL(String(input), "http://x").pathname;
    if (path.endsWith("/current-source/replay/transitions")) return jsonResponse(LEDGER);
    if (path.endsWith("/current-source/replay/child-audit")) return jsonResponse(AUDIT0);
    if (path.endsWith("/current-source/replay")) return jsonResponse(replayBody);
    if (path.endsWith("/current-source/evidence")) return jsonResponse(W3.evidence);
    if (path.endsWith("/execute/replay")) return jsonResponse(HUB);
    if (path.endsWith("/progress")) return jsonResponse(W3B.progress);
    if (path.endsWith("/requested-spec")) return jsonResponse(W3B.requested_spec);
    return jsonResponse({ error: { code: "UNEXPECTED" } }, 404);
  });
}

function mount(hash = "") {
  const path = `/research/quantbt/runs/${RUN}/execute`;
  window.history.replaceState(null, "", `${path}${hash}`);
  return render(
    <MemoryRouter initialEntries={[`${path}${hash}`]}>
      <Routes>
        <Route path="/research/quantbt/runs/:runId/execute" element={<ExecuteRoute />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function settled(hash = "", body: CurrentSourceReplay = FOLD0) {
  forgetRunIdentities();
  const fetchMock = fetchFor(body);
  const view = mount(hash);
  await waitFor(() => expect(view.container.querySelector("[data-transitions='ready']")).toBeTruthy(), { timeout: 10_000 });
  await waitFor(() => expect(view.container.querySelector("[data-retained-in-flight='false'] [data-chart='replay-candles']")).toBeTruthy(), { timeout: 10_000 });
  return { ...view, fetchMock };
}

const urls = (fetchMock: ReturnType<typeof fetchFor>) => fetchMock.mock.calls.map(([url]) => String(url));

describe("W5b · the fixtures are the real run", () => {
  it("fold 0 is 168 bars with 4 transitions; the ledger holds all 8", () => {
    expect(FOLD0.replay.rows).toHaveLength(168);
    expect(FOLD0.replay.rows[0]!.source_ordinal).toBe(720);
    expect(windowMarkers(FOLD0.replay.rows).map((marker) => [marker.ordinal, marker.kind, marker.side])).toEqual([
      [727, "ENTRY", "SHORT"], [736, "EXIT", "FLAT"], [867, "ENTRY", "SHORT"], [880, "EXIT", "FLAT"],
    ]);
    expect(LEDGER.rows).toHaveLength(8);
  });
});

vi.setConfig({ testTimeout: 30_000 });

describe("P17-T01 · candles + markers, and the route's own absences", () => {
  it("draws the fold's candles and transition markers, never a sample line or a fill", async () => {
    const { container } = await settled();
    expect(container.querySelector("[data-route-state='RETAINED_BAR_LEDGER']")).toBeTruthy();
    expect(container.querySelector("[data-chart='replay-candles']")).toBeTruthy();
    expect(container.querySelector("[data-chart='replay-equity']")).toBeNull();
    expect(container.querySelectorAll("[data-candle-row]")).toHaveLength(168);
    expect([...container.querySelectorAll("[data-marker]")].map((node) => node.getAttribute("data-marker"))).toEqual(["727", "736", "867", "880"]);
    expect(container.querySelector("[data-route-note]")?.textContent).toContain(CLOSE_TARGET_NOTICE(0, 0, 0));
    expect(container.querySelector("[data-replay-contract]")?.textContent).toContain("close_target_v2");
    const reason = (name: string) => container.querySelector(`[data-capability='${name}'] [data-reason-code]`)?.getAttribute("data-reason-code");
    expect(reason("trades")).toBe("QUANTBT_ROUTE_EMITTED_NO_TRADE_RECORDS");
    expect(reason("orders")).toBe("QUANTBT_ROUTE_EMITTED_NO_ORDER_RECORDS");
    expect(reason("oco")).toBe("QUANTBT_CLOSE_TARGET_V2_HAS_NO_CONTINGENT_ORDERS");
    expect(reason("sl_tp")).toBe("QUANTBT_INTRABAR_EXIT_MODEL_NONE");
    expect(reason("funding")).toBe("QUANTBT_RUN_CONFIG_USE_FUNDING_FALSE");
    expect(container.textContent).not.toMatch(/\bfill @|fill_id|order_id/);
    expect(container.querySelector("[data-tile='orders · fills · trades']")?.textContent).toContain("0 · 0 · 0");
  });

  it("the ledger lists the source's transitions with original bar numbers and the account's fee", async () => {
    const { container } = await settled();
    const rows = [...container.querySelectorAll("[data-transition-row]")];
    expect(rows.map((row) => row.getAttribute("data-transition-row"))).toEqual(["727", "736", "867", "880", "890", "946", "951", "1023"]);
    expect(rows[0]!.textContent).toContain("entry → short");
    expect(within(rows[0] as HTMLElement).getAllByTitle(LEDGER.rows[0]!.fee!)[0]).toBeTruthy();
    expect(container.querySelector("[data-transition-count]")?.textContent).toContain("8 of 8 transitions");
  });

  it("anatomy names the links close_target_v2 does not have instead of inventing them", async () => {
    const { container } = await settled();
    fireEvent.click(within(container.querySelector("[data-transition-row='727']") as HTMLElement).getByRole("button"));
    const anatomy = container.querySelector("[data-anatomy='727']")!;
    expect(anatomy.querySelector("[data-link='order'][data-na='true']")?.textContent).toContain("emits no order records (0 published)");
    expect(anatomy.querySelector("[data-link='fill'][data-na='true']")?.textContent).toContain("0 fill records");
    expect(anatomy.querySelector("[data-link='account']")?.textContent).toContain("2,000.00");
  });
});

describe("P17-T14 · child audit on Screen 08", () => {
  it("reads fold 0's child audit once, lists QuantBT's records with original ids and marks the generating child", async () => {
    const { container, fetchMock } = await settled();
    await waitFor(() => expect(container.querySelector("[data-child-audit='0']")).toBeTruthy());
    const reads = urls(fetchMock).filter((url) => url.includes("/current-source/replay/child-audit"));
    expect(reads).toEqual([`/api/v1/quantbt/runs/${RUN}/current-source/replay/child-audit?fold=0`]);
    const rows = [...container.querySelectorAll("[data-audit-row]")];
    expect(rows.map((row) => Number(row.getAttribute("data-audit-row")))).toEqual(AUDIT0.records.map((record) => record.audit_ordinal));
    const generation = container.querySelectorAll("[data-audit-generation='true']");
    expect(generation).toHaveLength(1);
    const record = AUDIT0.records.find((entry) => entry.context === "out-of-sample generation")!;
    expect(generation[0]!.textContent).toContain(String(record.seed));
    expect(container.querySelector("[data-child-audit-caption]")?.textContent).toContain("policy isolated_v1");
    /* The anatomy's child link names the generating child's original ids. */
    fireEvent.click(within(container.querySelector("[data-transition-row='727']") as HTMLElement).getByRole("button"));
    const child = container.querySelector("[data-anatomy='727'] [data-link='child']")!;
    expect(child.getAttribute("data-na")).toBe("false");
    expect(child.textContent).toContain(`audit #${record.audit_ordinal}`);
    expect(child.textContent).toContain(`seed ${record.seed}`);
    /* Stepping the transport never re-reads it. */
    const before = fetchMock.mock.calls.length;
    for (let step = 0; step < 20; step += 1) fireEvent.click(container.querySelector("[aria-label='step forward']")!);
    expect(fetchMock.mock.calls.length).toBe(before);
  });
});

describe("P17-T12/T14 · fold arrival, fold switch and capital convention", () => {
  it("opens on the hashed fold's window with one bounded extra read, and writes #fold", async () => {
    const { fetchMock } = await settled("#fold=2");
    const replayReads = urls(fetchMock).filter((url) => url.includes("/current-source/replay?") || url.endsWith("/current-source/replay"));
    expect(replayReads).toHaveLength(2);
    expect(replayReads[0]).toMatch(/\/current-source\/replay$/);
    const fold1 = FOLD0.execution.fold_capital.segments[1]!;
    expect(replayReads[1]).toContain(`at=${encodeURIComponent(fold1.start_cursor)}`);
    expect(replayReads[1]).toContain("limit=168");
    await waitFor(() => expect(window.location.hash).toContain("fold=1"));
  });

  it("switching folds reads that fold's first bar; the strip names the carry-position convention", async () => {
    const { container, fetchMock } = await settled();
    const boundary = container.querySelector("[data-fold-boundary]");
    expect(boundary?.getAttribute("data-fold-boundary")).toBe("CONTINUOUS_ACROSS_FOLDS");
    expect(boundary?.getAttribute("title")).toContain("fold 1 starts at fold 0's end equity");
    expect(container.querySelector("[data-fold-capital]")?.textContent).toContain("carry_position");
    const before = fetchMock.mock.calls.length;
    fireEvent.click(container.querySelector("[data-fold='1']")!);
    await waitFor(() => expect(fetchMock.mock.calls.length).toBe(before + 1));
    expect(String(fetchMock.mock.calls.at(-1)![0])).toContain(`at=${encodeURIComponent(FOLD0.execution.fold_capital.segments[1]!.start_cursor)}`);
    expect(container.querySelector("[data-overview-caption]")?.textContent).toContain("1,056 bars in 151 candles of 7 bars");
  });
});

describe("P17-T07/T13 · transport and causal reveal are local and presentation-only", () => {
  it("next transition moves the cursor to bar 727 and its checkpoint, without a request", async () => {
    const { container, fetchMock } = await settled();
    const before = fetchMock.mock.calls.length;
    fireEvent.click(container.querySelector("[aria-label='next transition']")!);
    const readout = container.querySelector("[data-playhead-readout]")!;
    expect(readout.getAttribute("data-playhead-readout")).toBe("727");
    expect(readout.querySelector("[data-readout-transitions]")?.textContent).toContain("1");
    expect(fetchMock.mock.calls.length).toBe(before);
  });

  it("reveal hides future transitions, markers and full-run totals; the revision and requests do not change", async () => {
    const { container, fetchMock } = await settled();
    fireEvent.click(container.querySelector("[aria-label='next transition']")!);
    const revision = container.querySelector("[data-as-of]")?.textContent;
    const before = fetchMock.mock.calls.length;
    act(() => { fireEvent.click(container.querySelector("[data-action='causal-reveal']")!); });
    expect(container.querySelector("[data-action='causal-reveal']")?.getAttribute("aria-pressed")).toBe("true");
    const hidden = [...container.querySelectorAll("[data-transition-row][data-revealed='hidden']")].map((row) => row.getAttribute("data-transition-row"));
    expect(hidden).toEqual(["736", "867", "880", "890", "946", "951", "1023"]);
    /* A future transition gives away neither its time nor its outcome. */
    expect(container.querySelector("[data-transition-row='736']")?.textContent).not.toContain("2026-07-01 16:00");
    expect(container.querySelectorAll("[data-fold] [data-reveal-hidden]")).toHaveLength(2);
    expect(container.querySelector("[data-tile='target transitions']")?.textContent).toContain(REVEAL_HIDDEN);
    expect([...container.querySelectorAll("[data-marker]")].map((node) => node.getAttribute("data-marker"))).toEqual(["727"]);
    expect(container.querySelectorAll("[data-candle-row]")).toHaveLength(8);
    expect(container.querySelector("[data-readout-full-run]")?.textContent).toContain(REVEAL_HIDDEN);
    expect(container.querySelector("[data-cost-total]")?.getAttribute("data-cost-total")).toBe("hidden");
    expect(container.querySelector("[data-as-of]")?.textContent).toBe(revision);
    expect(fetchMock.mock.calls.length).toBe(before);
    act(() => { fireEvent.click(container.querySelector("[data-action='causal-reveal']")!); });
    expect(container.querySelectorAll("[data-candle-row]")).toHaveLength(168);
  });
});

describe("P17-T06/T08 · bounded DOM, no certificate", () => {
  it("stepping through the whole fold adds no rows; the ledger and chart table stay bounded", async () => {
    const { container } = await settled();
    const count = () => container.querySelectorAll("*").length;
    const start = count();
    const forward = container.querySelector("[aria-label='step forward']")!;
    for (let step = 0; step < 167; step += 1) fireEvent.click(forward);
    expect(container.querySelector("[data-playhead-readout]")?.getAttribute("data-playhead-readout")).toBe("887");
    expect(Math.abs(count() - start)).toBeLessThan(20);
    expect(container.querySelectorAll("[data-transition-row]").length).toBeLessThanOrEqual(50);
    expect(container.querySelectorAll("[data-candle-row]").length).toBeLessThanOrEqual(200);
  }, 60_000);

  it("renders no certificate badge; QuantBT's accounting flag is quoted as the engine's", async () => {
    const { container } = await settled();
    expect(container.querySelector("[data-certificate]")).toBeNull();
    expect(container.textContent).not.toMatch(/certificate|cert L\d/i);
    expect(container.querySelector("[data-replay-contract]")?.textContent).toContain("accounting certified by QuantBT");
  });
});

describe("W5b · a seal retained before the bar ledger keeps the W3b body", () => {
  it("draws the retained observation body, not candles", async () => {
    forgetRunIdentities();
    fetchFor(LEGACY);
    const { container } = mount();
    await waitFor(() => expect(container.querySelector("[data-route-state='RETAINED_MODEL_SAMPLE']")).toBeTruthy());
    expect(container.querySelector("[data-chart='replay-candles']")).toBeNull();
  });
});

describe("W3b fix · a flat window is not drawn on a ±50% axis", () => {
  it("pads a flat 20,000 by a hair and snaps to round numbers", () => {
    expect(paddedRange([20_000, 20_000, 20_000])).toEqual({ min: 19_990, max: 20_010 });
    const moving = paddedRange([19_926.5, 20_000])!;
    expect(moving.min).toBeGreaterThan(19_900);
    expect(moving.max).toBeLessThanOrEqual(20_010);
  });
});
