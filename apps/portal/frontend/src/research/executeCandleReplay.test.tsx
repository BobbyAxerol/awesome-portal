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

import { CandleOverviewStrip, REVEAL_HIDDEN, chartMotion, chartPrice, crosshairReadout, exactPercent, foldCapitalPolicyWords, foldCapitalTile, paddedRange, windowMarkers } from "./ExecuteCandleReplay";
import { drawdownTooltip, equityTooltip, positionTooltip } from "./ExecuteDetail";
import { formatMetric } from "./researchFormat";
import { iso } from "./utcMinute";
import { ExecuteRoute } from "./ExecuteRoute";
import type { CurrentSourceReplay, ReplayChildAudit, ReplayTransitions } from "./replayClient";
import { forgetRunIdentities } from "./retainedLane";
import { SYNTHETIC_FOLDS, scaleToFolds, syntheticChildAudit, syntheticFoldOf, syntheticFoldWindow } from "./w5bFoldScale.fixture";
import { bandPieces, retainedSplitBand } from "./SplitBand";

const chartOptions = vi.hoisted(() => [] as Record<string, unknown>[]);
const built = vi.hoisted(() => [] as { api: { applyOptions: ReturnType<typeof vi.fn> }; series: { applyOptions: ReturnType<typeof vi.fn> }[] }[]);
const visibleRanges = vi.hoisted(() => [] as { from: number; to: number }[]);

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
    createChart: (_element: unknown, options: Record<string, unknown>) => {
      chartOptions.push(options);
      const record = { api: { applyOptions: vi.fn() }, series: [] as { applyOptions: ReturnType<typeof vi.fn> }[] };
      built.push(record);
      return {
        applyOptions: record.api.applyOptions,
        addSeries: () => { const one = series(); record.series.push(one); return one; },
        panes: () => [],
        remove: vi.fn(),
        setCrosshairPosition: vi.fn(),
        timeScale: () => ({ getVisibleLogicalRange: () => null, setVisibleLogicalRange: (range: { from: number; to: number }) => { visibleRanges.push(range); }, fitContent: vi.fn() }),
      };
    },
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
const W3 = JSON.parse(readFileSync(join(process.cwd(), "src", "research", "w3RealWfo.fixture.json"), "utf8")) as {
  evidence: unknown;
  /** E2c (8.5): the real retained fold plan — the only published source of fold windows. */
  split: { fold_plan: { folds: { fold_id: string; train_start_utc_ms: number; train_end_utc_ms: number; test_start_utc_ms: number; test_end_utc_ms: number }[] } };
};
const RUN = FOLD0.run_id;

describe("E16 · overview reveal cannot leak a future bucket or its price scale", () => {
  const overview = {
    source_bar_count: 8, emitted_bucket_count: 2, bucket_bars: 4, sampling: "OHLC_BUCKET_V1" as const,
    envelope: { max_high: "9999", min_low: "1" },
    values: [
      { first_ordinal: 0, last_ordinal: 3, open_utc_ms: 0, close_utc_ms: 3,
        open: "10", high: "12", low: "8", close: "11", volume: null, transitions: null },
      { first_ordinal: 4, last_ordinal: 7, open_utc_ms: 4, close_utc_ms: 7,
        open: "11", high: "9999", low: "1", close: "9000", volume: null, transitions: null },
    ],
  };
  it("withholds a bucket whose first bar is past but whose last bar is still future", () => {
    const { container } = render(<CandleOverviewStrip overview={overview} scope="OOS" label="overview" cutOrdinal={1} />);
    expect(container.querySelectorAll("svg line")).toHaveLength(0);
    expect(container.querySelector("[data-overview-caption]")?.textContent).toContain("range withheld");
    expect(container.textContent).not.toContain("9999");
  });
  it("draws and scales only completed buckets, not the envelope's future extrema", () => {
    const { container } = render(<CandleOverviewStrip overview={overview} scope="OOS" label="overview" cutOrdinal={5} />);
    const lines = container.querySelectorAll("svg line");
    expect(lines).toHaveLength(1);
    expect(lines[0]?.getAttribute("y1")).toBe("2");
    expect(lines[0]?.getAttribute("y2")).toBe("22");
    /* T-07: the range rides in the tooltip, grouped like the axis; the caption keeps the counts. */
    expect(container.querySelector("[data-overview-caption]")?.getAttribute("title")).toContain("revealed range 8.00 – 12.00");
    expect(container.textContent).not.toContain("9999");
    expect(container.textContent).not.toContain("9,999");
  });
  it("keeps the complete sealed overview unchanged when reveal is off", () => {
    const { container } = render(<CandleOverviewStrip overview={overview} scope="OOS" label="overview" />);
    expect(container.querySelectorAll("svg line")).toHaveLength(2);
    expect(container.querySelector("[data-overview-caption]")?.getAttribute("title")).toContain("range 1.00 – 9,999.00");
  });
});

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

function fetchFor(replayBody: CurrentSourceReplay = FOLD0, splitBody: unknown = W3.split) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const path = new URL(String(input), "http://x").pathname;
    if (path.endsWith("/current-source/split")) return jsonResponse(splitBody);
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

async function settled(hash = "", body: CurrentSourceReplay = FOLD0, splitBody: unknown = W3.split) {
  forgetRunIdentities();
  const fetchMock = fetchFor(body, splitBody);
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
    /* The bar count is a cell of the readout row; a label laid over the canvas collided with the date. */
    expect(container.querySelector("[data-bar-count]")?.closest("[data-crosshair-readout]")).not.toBeNull();
    expect(container.querySelector("[data-chart='replay-candles'] span.absolute.top-1")).toBeNull();
    expect([...container.querySelectorAll("[data-marker]")].map((node) => node.getAttribute("data-marker"))).toEqual(["727", "736", "867", "880"]);
    /* UX-07 / T-01: the "… · 0 orders · 0 fills · 0 trades" line is gone; the chips below carry the absences. */
    expect(container.querySelector("[data-route-note]")).toBeNull();
    expect(container.textContent).not.toContain("close-only accounting");
    expect(container.querySelector("[data-replay-contract]")?.textContent).toContain("close target v2");
    expect(container.querySelector("[data-replay-contract]")?.getAttribute("title")).toContain("close_target_v2");
    const reason = (name: string) => container.querySelector(`[data-capability='${name}'] [data-reason-code]`)?.getAttribute("data-reason-code");
    expect(reason("trades")).toBe("QUANTBT_ROUTE_EMITTED_NO_TRADE_RECORDS");
    expect(reason("orders")).toBe("QUANTBT_ROUTE_EMITTED_NO_ORDER_RECORDS");
    expect(reason("oco")).toBe("QUANTBT_CLOSE_TARGET_V2_HAS_NO_CONTINGENT_ORDERS");
    expect(reason("sl_tp")).toBe("QUANTBT_INTRABAR_EXIT_MODEL_NONE");
    expect(reason("funding")).toBe("QUANTBT_RUN_CONFIG_USE_FUNDING_FALSE");
    expect(container.textContent).not.toMatch(/\bfill @|fill_id|order_id/);
    /* W4: the meaningless "0 · 0 · 0" tile is gone; the single absence line says it. */
    expect(container.querySelector("[data-tile='orders · fills · trades']")).toBeNull();
  });

  it("VD-TEXT-01 · the route fact is one line, the explanatory prose is gone, the absences keep their reason codes", async () => {
    const { container } = await settled();
    expect(container.textContent).not.toMatch(/0 orders · 0 fills · 0 trades/);
    expect(container.querySelector("[data-subtitle]")).toBeNull();
    expect(container.querySelector("[data-rules]")).toBeNull();
    expect(container.textContent).not.toMatch(
      /rules of this screen|Each row is a|Pairing the transitions|Per-trade excursions|What close_target_v2 cannot produce|One column per bar|is read only when you ask|research model state/,
    );
    expect(container.querySelector("[data-panel='trade-anatomy'] h2")?.textContent).toBe("trade anatomy");
    // The long ledger rule rides in a tooltip on the (still accessible) title.
    expect(container.querySelector("[data-panel='event-ledger'] h2")?.getAttribute("title")).toBe("One row per position change.");
    expect(container.querySelector("[data-transition-count]")?.getAttribute("title")).toBeTruthy();
    /* W4: blotter and MAE x MFE are structurally empty on this route: ONE line, the reason code in its tooltip. */
    const blotter = container.querySelector("[data-absent-panel='trade-blotter']") as HTMLElement;
    expect(blotter.textContent).toBe("No trade records on this route");
    expect(blotter.querySelector("[title]")?.getAttribute("title")).toContain("QUANTBT_ROUTE_EMITTED_NO_TRADE_RECORDS");
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
    /* T-03: no raw enum with an underscore in prose. */
    expect(anatomy.querySelector("[data-link='order'][data-na='true']")?.textContent).toContain("n/a for close_target_v2");
    expect(anatomy.querySelector("[data-link='fill'][data-na='true']")?.textContent).toContain("fills at the close");
    expect(anatomy.textContent).not.toContain("not_applicable");
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
    /* T-06: the count is the line; policy, run total, drops and fingerprint are the tooltip. */
    expect(container.querySelector("[data-child-audit-caption]")?.textContent).toContain("6 of 6 records for this fold");
    expect(container.querySelector("[data-child-audit-caption]")?.getAttribute("title")).toContain("policy isolated_v1");
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
    expect(boundary?.getAttribute("title")).toContain("F2 starts at F1's end equity");
    expect(container.querySelector("[data-fold-capital]")?.textContent).toContain("carried across folds");
    expect(container.querySelector("[data-fold-capital]")?.textContent).not.toContain("carry_position");
    const before = fetchMock.mock.calls.length;
    fireEvent.click(container.querySelector("[data-fold='1']")!);
    await waitFor(() => expect(fetchMock.mock.calls.length).toBe(before + 1));
    expect(String(fetchMock.mock.calls.at(-1)![0])).toContain(`at=${encodeURIComponent(FOLD0.execution.fold_capital.segments[1]!.start_cursor)}`);
    expect(container.querySelector("[data-overview-caption]")?.textContent).toContain("1,056 bars · 151 candles (7 bars each)");
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
    /* UX-12: every row after the cursor is ONE line that counts them; none of them gives its time or outcome away. */
    expect(hidden).toEqual(["736"]);
    expect(container.querySelector("[data-reveal-collapsed]")?.getAttribute("data-reveal-collapsed")).toBe("7");
    expect(container.querySelector("[data-reveal-collapsed]")?.textContent).toContain("7 later transitions");
    /* A future transition gives away neither its time nor its outcome. */
    expect(container.querySelector("[data-transition-row='736']")?.textContent).not.toContain("2026-07-01 16:00");
    expect(container.querySelectorAll("[data-fold] [data-reveal-hidden]")).toHaveLength(2);
    expect(container.querySelector("[data-tile='target transitions']")?.textContent).toContain(REVEAL_HIDDEN);
    expect([...container.querySelectorAll("[data-marker]")].map((node) => node.getAttribute("data-marker"))).toEqual(["727"]);
    expect(container.querySelectorAll("[data-candle-row]")).toHaveLength(8);
    expect(container.querySelector("[data-readout-full-run]")).toBeNull();
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
    /* W4: the flag is the contract line's tooltip, quoted as the engine's (not a badge). */
    expect(container.querySelector("[data-replay-contract]")?.getAttribute("title")).toContain("accounting certified by QuantBT");
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

describe("S08 T17 · a 32-fold run (synthetic, derived from the real-HMD fixture)", () => {
  const SCALED = scaleToFolds(FOLD0);

  function fetch32() {
    return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      const parsed = new URL(url, "http://x");
      const path = parsed.pathname;
      if (path.endsWith("/current-source/replay/transitions")) return jsonResponse(LEDGER);
      if (path.endsWith("/current-source/replay/child-audit")) return jsonResponse(syntheticChildAudit(AUDIT0, Number(parsed.searchParams.get("fold"))));
      if (path.endsWith("/current-source/replay")) {
        const fold = syntheticFoldOf(url);
        return jsonResponse(fold === null ? SCALED : syntheticFoldWindow(SCALED, fold));
      }
      if (path.endsWith("/current-source/evidence")) return jsonResponse(W3.evidence);
      if (path.endsWith("/execute/replay")) return jsonResponse(HUB);
      if (path.endsWith("/progress")) return jsonResponse(W3B.progress);
      if (path.endsWith("/requested-spec")) return jsonResponse(W3B.requested_spec);
      return jsonResponse({ error: { code: "UNEXPECTED" } }, 404);
    });
  }

  it("scrolls the strip, jumps folds by their own cursors, and reads each fold's child audit once, on demand", async () => {
    forgetRunIdentities();
    const fetchMock = fetch32();
    const { container } = mount();
    await waitFor(() => expect(container.querySelector("[data-child-audit='0']")).toBeTruthy(), { timeout: 10_000 });
    expect(container.querySelector("[data-fold-strip]")?.getAttribute("data-fold-strip")).toBe(String(SYNTHETIC_FOLDS));
    expect(container.querySelector("[data-fold-strip-mode]")?.getAttribute("data-fold-strip-mode")).toBe("scroll");
    expect(container.querySelectorAll("[data-fold-scroller] [data-fold]")).toHaveLength(SYNTHETIC_FOLDS);
    expect(container.querySelectorAll("[data-fold-boundary]")).toHaveLength(SYNTHETIC_FOLDS - 1);
    const audits = () => urls(fetchMock).filter((url) => url.includes("/replay/child-audit"));
    expect(audits()).toHaveLength(1);

    /* Next fold ×3 and a jump to fold 20: one window read + one child-audit read each. */
    for (const target of [1, 2, 3]) {
      fireEvent.click(container.querySelector("[aria-label='next fold']")!);
      await waitFor(() => expect(container.querySelector(`[data-child-audit='${target}']`)).toBeTruthy());
    }
    fireEvent.click(container.querySelector("[data-fold='20']")!);
    await waitFor(() => expect(container.querySelector("[data-child-audit='20']")).toBeTruthy());
    expect(audits().map((url) => new URL(url, "http://x").searchParams.get("fold"))).toEqual(["0", "1", "2", "3", "20"]);
    expect(container.querySelector("[data-fold='20']")?.getAttribute("aria-pressed")).toBe("true");

    /* Playing inside a fold reads nothing; the DOM does not grow with the fold count. */
    const before = fetchMock.mock.calls.length;
    const nodes = container.querySelectorAll("*").length;
    for (let step = 0; step < 40; step += 1) fireEvent.click(container.querySelector("[aria-label='step forward']")!);
    expect(fetchMock.mock.calls.length).toBe(before);
    expect(Math.abs(container.querySelectorAll("*").length - nodes)).toBeLessThan(20);
    expect(container.querySelector("[data-overview-caption]")?.textContent).toContain("6,096 bars");
  }, 60_000);
});

/* ------------------------------------------------------------------------
 * E2c · row 8.5 — the IS / OOS / HOLDOUT band above the chart
 *
 * The hi-fi shades three bands; before E2c the screen had one line of text.
 * The windows come from this run's own retained fold plan, so every assertion
 * below is against the real W3 WFO split, and a window that plan does not
 * publish is never given a width.
 * --------------------------------------------------------------------- */
describe("E2c · 8.5 — the band above the chart is the fold's published windows", () => {

  it("F2b · the overview strip carries the three windows: IS hatched, every fold's OOS solid (the active one stronger), from served boundaries", async () => {
    const { container } = await settled();
    const is = container.querySelectorAll("[data-overview-band='is']");
    const oos = [...container.querySelectorAll("[data-overview-band='oos']")] as HTMLElement[];
    expect(is).toHaveLength(1);
    expect(oos).toHaveLength(FOLD0.execution.fold_capital.segments.length);
    expect(is[0]!.getAttribute("title")).toContain("IS (train) · 2026-06-01");
    const active = oos.filter((band) => band.getAttribute("data-band-active") === "true");
    expect(active).toHaveLength(1);
    expect(active[0]!.getAttribute("data-band-fold-id")).toBe("0");
    expect(active[0]!.getAttribute("title")).toContain("OOS · 2026-07-01");
    expect(active[0]!.getAttribute("title")).toContain(`${FOLD0.execution.fold_capital.segments[0]!.bars} bars`);
    /* IS is the train window: it ends where the OOS band begins or before, never over it. */
    const pct = (value: string) => Number(value.replace("%", ""));
    const isEdge = pct((is[0] as HTMLElement).style.left) + pct((is[0] as HTMLElement).style.width);
    expect(isEdge).toBeLessThanOrEqual(pct(active[0]!.style.left) + 0.001);
  });

  it("F2b · a profile with no holdout says 'not applicable' with the served code as a typed absence, and draws no holdout band", async () => {
    const { container } = await settled();
    expect(container.querySelector("[data-overview-band='holdout']")).toBeNull();
    const holdout = container.querySelector("[data-legend-window='holdout']") as HTMLElement;
    /* The retained claim says this profile declares no holdout at all — a
       different fact from "the source has not published it yet", kept different. */
    expect(holdout.getAttribute("data-band-state")).toBe("NOT_APPLICABLE");
    expect(holdout.textContent).toContain("not applicable");
    expect(holdout.textContent).not.toContain("not published");
    expect(holdout.querySelector("[data-reason-code]")!.getAttribute("data-reason-code")).toBe("P10_DELTA_WFO_PROFILE_HAS_NO_HOLDOUT_SEGMENT");
    expect(holdout.getAttribute("title")).toContain("This walk-forward profile declares no holdout segment.");
  });

  it("every fold's windows come from the one fold-plan read; changing fold reads no split", async () => {
    const { container, fetchMock } = await settled();
    const splitReads = () => urls(fetchMock).filter((url) => url.includes("/current-source/split"));
    expect(splitReads()).toHaveLength(1);
    /* The band waits for a lane to answer, so this run never reads the P04 hub split. */
    const hubSplitReads = urls(fetchMock).filter((url) => new URL(url, "http://x").pathname.endsWith("/runs/" + RUN + "/split"));
    expect(hubSplitReads).toEqual([]);
    expect(container.querySelector("[data-band-fold]")!.textContent).toBe("F1");
    fireEvent.click(container.querySelector("[aria-label='next fold']")!);
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(4));
    /* The fold plan already holds every fold: changing fold reads no split. */
    expect(splitReads()).toHaveLength(1);
    /* Fold 1's band is that fold's own train span, taken from the same read. */
    const fold1 = W3.split.fold_plan.folds[1]!;
    const band = retainedSplitBand(W3.split as never, "1", null);
    expect(band.foldId).toBe("1");
    expect(band.segments[0]!.span).toEqual({
      start_utc_ms: fold1.train_start_utc_ms,
      end_exclusive_utc_ms: fold1.train_end_utc_ms,
    });
    expect(band.segments[1]!.span).toEqual({
      start_utc_ms: fold1.test_start_utc_ms,
      end_exclusive_utc_ms: fold1.test_end_utc_ms,
    });
  });

  it("a fold the plan does not carry is drawn as no band at all, with its own reason", () => {
    const band = retainedSplitBand(W3.split as never, "no-such-fold", null);
    expect(band.segments.every((segment) => segment.span === null)).toBe(true);
    expect(band.segments[0]!.reasonCode).toBe("RS02_SEAL_HAS_NO_RETAINED_FOLD");
    expect(bandPieces(band.segments)).toEqual([]);
  });

  it("a lane that never holds this run's fold plan says so instead of drawing a band", async () => {
    const { container } = await settled("", FOLD0, {
      schema_version: "research.current-source-not-applicable.v1",
      lane: { run_profile: "P04_FIXED_QUALIFICATION", retainable_profile_id: "rs02.delta-signal-notional-wfo.v1", reason_code: "RS02_RETAINED_LANE_NOT_APPLICABLE_TO_P04_FIXED_QUALIFICATION" },
    });
    expect(container.querySelector("[data-split-band]")).toBeNull();
    expect(container.querySelector("[data-split-band-absent]")!.textContent).toContain("never holds this run's fold plan");
  });
});

/* -------------------------------------------------------------------------
 * F1 (2026-10-01) · Screen 08 honesty — D11 words and axis, FG 08-05 cursor
 * numbers, FG 08-06 / 08-07 nothing derived in the browser.
 * ---------------------------------------------------------------------- */

describe("F1 · D11 — fold capital reads in words, the price axis groups thousands", () => {
  it("the tile, the strip line and the hover say 'carried across folds'; the raw code is a title only", async () => {
    const { container } = await settled();
    const tile = container.querySelector("[data-tile='fold capital']") as HTMLElement;
    /* T-12 / UX-20: the tile value is one word with a sub-line; the strip line keeps the full words. */
    expect(tile.querySelector("[data-tile-code]")?.textContent).toBe("carried");
    expect(tile.textContent).toContain("fold to fold");
    expect(tile.textContent).not.toContain("carry_position");
    expect(tile.querySelector("[data-tile-code]")?.getAttribute("title")).toBe("carry_position");
    const line = container.querySelector("[data-fold-capital]") as HTMLElement;
    expect(line.textContent).toBe("capital carried across folds");
    expect(line.getAttribute("title")).toContain("carry_position · continuous across folds");
    expect(container.querySelector("[data-fold-boundary]")?.getAttribute("title")).toContain("carry_position — one stitched account");
  });

  it("an unknown policy is 'source-defined' in the headline and appears only in a title", async () => {
    const body = { ...FOLD0, execution: { ...FOLD0.execution, fold_capital: { ...FOLD0.execution.fold_capital, policy: "future_policy_v9" } } } as CurrentSourceReplay;
    const { container } = await settled("", body);
    const tile = container.querySelector("[data-tile='fold capital']") as HTMLElement;
    expect(tile.textContent).toContain("source-defined");
    expect(tile.textContent).not.toContain("future_policy_v9");
    expect(tile.querySelector("[data-tile-code]")?.getAttribute("title")).toBe("future_policy_v9");
    expect(container.querySelector("[data-fold-capital]")?.textContent).not.toContain("future_policy_v9");
  });

  it("a policy the server did not publish stays 'not published', never a word", () => {
    expect(foldCapitalPolicyWords(null)).toEqual({ text: "not published", code: null, mapped: false });
    expect(foldCapitalPolicyWords("close_at_boundary").text).toBe("closed at each fold boundary");
    expect(foldCapitalTile("carry_position")).toEqual({ value: "carried", sub: "fold to fold" });
    expect(foldCapitalTile(null)).toEqual({ value: "not published", sub: null });
  });

  it("the chart is built with a grouped price formatter, so the axis reads like the readout", async () => {
    chartOptions.length = 0;
    await settled();
    await waitFor(() => expect(chartOptions.length).toBeGreaterThan(0));
    const localization = chartOptions.at(-1)!.localization as { priceFormatter: (price: number) => string };
    expect(localization.priceFormatter(66000)).toBe("66,000.00");
    expect(localization.priceFormatter(58744.4)).toBe("58,744.40");
    expect(chartPrice(0.5)).toBe("0.50");
    expect(chartPrice(0.0123)).toBe("0.0123");
    /* F5a: a negative price on the axis uses the typographic minus, like every other number. */
    expect(chartPrice(-1234.5)).toBe("−1,234.50");
    expect(chartPrice(-0.5)).toBe("−0.50");
    expect(chartPrice(Number.NaN)).toBe("");
  });
});

describe("F5a · the chart follows the theme while the screen is open", () => {
  it("a data-theme switch re-reads the palette and repaints the chart and every series", async () => {
    document.documentElement.setAttribute("data-theme", "research");
    built.length = 0;
    await settled();
    const chart = built.at(-1)!;
    expect(chart.series).toHaveLength(3);
    const lightBackground = (chartOptions.at(-1)!.layout as { background: { color: string } }).background.color;
    expect(chart.api.applyOptions).not.toHaveBeenCalled();
    document.documentElement.setAttribute("data-theme", "operations");
    await waitFor(() => expect(chart.api.applyOptions).toHaveBeenCalled());
    const layout = (chart.api.applyOptions.mock.calls.at(-1)![0] as { layout: { background: { color: string; type: string }; textColor: string } }).layout;
    expect(layout.background.type).toBe("solid");
    expect(layout.background.color).not.toBe(lightBackground);
    for (const one of chart.series) expect(one.applyOptions.mock.calls.length).toBeGreaterThan(0);
    /* Back again: the light palette returns, so it is a re-read and not a one-way switch. */
    document.documentElement.setAttribute("data-theme", "research");
    await waitFor(() => expect((chart.api.applyOptions.mock.calls.at(-1)![0] as { layout: { background: { color: string } } }).layout.background.color).toBe(lightBackground));
    document.documentElement.removeAttribute("data-theme");
  });
});

describe("F1 · FG 08-06 / 08-07 — the browser derives no return and sums no fee", () => {
  it("a fold chip shows the served end equity, never a return computed from start and end", async () => {
    const { container } = await settled();
    const segments = FOLD0.execution.fold_capital.segments;
    const chips = [...container.querySelectorAll<HTMLElement>("[data-fold-strip] button[data-fold]")];
    expect(chips).toHaveLength(segments.length);
    chips.forEach((chip, position) => {
      expect(chip.textContent).not.toContain("%");
      expect(chip.querySelector("[data-fold-end-equity]")?.getAttribute("data-fold-end-equity")).toBe(segments[position]!.end_equity);
      expect(chip.getAttribute("title")).toContain("fold return not published");
    });
    expect(chips[0]!.textContent).toContain("end 19,931.28");
    expect(chips[0]!.querySelector("[data-exact]")?.getAttribute("title")).toBe(segments[0]!.end_equity);
  });

  it("W4 · the browser sums no fee: no window fee is printed, only the served full-run total", async () => {
    const { container } = await settled();
    expect(container.querySelector("[data-cost-window]")).toBeNull();
    expect(container.querySelector("[data-window-fee]")).toBeNull();
    const total = container.querySelector("[data-cost-total='shown']") as HTMLElement;
    expect(total.querySelector("[data-exact]")?.getAttribute("title")).toBe(FOLD0.execution.totals.fee);
  });

  it("the fee rate is a percentage of the served decimal with the exact string in the title", async () => {
    const { container } = await settled();
    const rate = container.querySelector("[data-fee-rate]") as HTMLElement;
    expect(rate.getAttribute("data-fee-rate")).toBe("0.0005");
    expect(rate.textContent).toBe("0.05%");
    expect(rate.getAttribute("title")).toBe("0.0005 (exact)");
    expect(container.querySelector("[data-panel='cost-timeline']")?.textContent).not.toContain("Fee rate 0.0005");
  });

  it("exactPercent moves the decimal point and never rounds", () => {
    expect(exactPercent("0.0005")).toBe("0.05%");
    expect(exactPercent("0.00025")).toBe("0.025%");
    expect(exactPercent("0.001")).toBe("0.1%");
    expect(exactPercent("0.01")).toBe("1%");
    expect(exactPercent("1")).toBe("100%");
    expect(exactPercent("0")).toBe("0%");
    expect(exactPercent("-0.01")).toBeNull();
    expect(exactPercent("1e-4")).toBeNull();
  });
});

describe("F1 · FG 08-05 — the retained 'state at cursor' prints formatted numbers, exact in title", () => {
  it("equity and position go through the shared formatter; no raw float on the line", async () => {
    forgetRunIdentities();
    const body = {
      ...LEGACY,
      replay: {
        ...LEGACY.replay,
        state_at_cursor: {
          ...LEGACY.replay.state_at_cursor,
          state: "AVAILABLE_RETAINED_MODEL_SAMPLE",
          semantics: "RESEARCH_MODEL_SAMPLE_NOT_BROKER_EXECUTION_STATE",
          source_ordinal: 5,
          at_utc_ms: LEGACY.replay.rows[0]!.at_utc_ms,
          accepted_position: "0.3333333333333333",
          equity: "19931.280844135865",
        },
      },
    } as unknown as CurrentSourceReplay;
    fetchFor(body);
    const { container } = mount();
    await waitFor(() => expect(container.querySelector("[data-state-at-cursor='AVAILABLE_RETAINED_MODEL_SAMPLE']")).toBeTruthy());
    const at = container.querySelector("[data-state-at-cursor]") as HTMLElement;
    expect(at.textContent).toContain("equity 19,931.28");
    expect(at.textContent).toContain("position 0.333333");
    expect(at.textContent).not.toMatch(/\d\.\d{7,}/);
    expect([...at.querySelectorAll("[data-exact]")].map((node) => node.getAttribute("title"))).toEqual(["0.3333333333333333", "19931.280844135865"]);
  });
});

describe("F3 · S08 — fold_NN everywhere, 4× default, room at both ends of the axis", () => {
  it("names the fold as fold_01 in the chip title, the playhead readout and the child-audit card", async () => {
    const { container } = await settled();
    for (const chip of container.querySelectorAll("[data-fold]")) expect(chip.getAttribute("title")).not.toMatch(/\bfold \d/);
    expect(container.querySelector("[data-fold='0']")?.getAttribute("title")).toMatch(/^F1: /);
    expect(container.querySelector("[data-playhead-readout] [data-readout-fold]")?.textContent).toBe("F1");
    await waitFor(() => expect(container.querySelector("[data-child-audit='0']")).toBeTruthy());
    expect(container.querySelector("[data-panel='child-audit'] summary")?.textContent).toContain("F1 · ");
    expect(container.querySelector("[data-panel='child-audit'] summary")?.getAttribute("title")).toContain("shaded row is the strategy instance");
    expect(container.querySelector("[data-child-audit-details]")?.hasAttribute("open")).toBe(false);
    expect(container.querySelector("[aria-label='child audit records of F1']")).toBeTruthy();
    expect(container.textContent).not.toMatch(/\bfold \d/);
  });

  it("opens the window with empty bars on both sides so the first and last time labels are not clipped", async () => {
    await settled();
    expect(visibleRanges.length).toBeGreaterThan(0);
    const range = visibleRanges[0]!;
    expect(range.from).toBeLessThan(0);
    expect(range.to).toBeGreaterThan(167);
  });
});

describe("chart life · S08 candle replay, equity and position panes", () => {
  const rows = FOLD0.replay.rows;
  const stubMedia = (matches: boolean) => {
    window.matchMedia = ((query: string) => ({ matches, media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  };
  it("crosshairReadout carries the served bar's own OHLC, position and equity, with a typographic minus", () => {
    const row = rows.find((r) => r.bar?.candle) ?? rows[0]!;
    const readout = crosshairReadout({ ...row, accepted_position: "-1" });
    expect(readout.ordinal).toBe(row.source_ordinal);
    expect(readout.at).toBe(iso(row.at_utc_ms));
    expect(readout.position).toBe("−1");
    expect(readout.close).toBe(chartPrice(Number(row.bar!.candle!.close)));
    expect(readout.equity).toBe(formatMetric(row.equity, "currency"));
  });
  it("a bar with no candle reads as absent, never zero", () => {
    const readout = crosshairReadout({ ...rows[0]!, bar: null });
    expect(readout.open).toBeNull();
    expect(readout.close).toBeNull();
  });
  it("chartMotion: entry animation is cubicOut, and reduced motion turns it off", () => {
    const original = window.matchMedia;
    try {
      stubMedia(false);
      const on = chartMotion();
      expect(on.animation).toBe(true);
      expect(on.animationDuration).toBeGreaterThanOrEqual(500);
      expect(on.animationDuration).toBeLessThanOrEqual(700);
      expect(on.animationEasing).toBe("cubicOut");
      expect(on.animationDurationUpdate).toBe(0);
      stubMedia(true);
      expect(chartMotion().animation).toBe(false);
      expect(chartMotion().animationDuration).toBe(0);
    } finally {
      window.matchMedia = original;
    }
  });
  it("tooltips show the real values at the same x, with the absence typed", () => {
    const point = { playback_ordinal: 4, at_utc_ms: 0, equity: "10000.5", drawdown_fraction: "-0.02", playback_cursor: "" } as never;
    expect(equityTooltip(point, "observation")).toContain("equity 10,000.50");
    expect(equityTooltip(point, "observation")).toContain("drawdown −2.00%");
    expect(drawdownTooltip(point)).toContain("equity 10,000.50");
    expect(equityTooltip(point, "observation", { kind: "ENTRY", side: "LONG" } as never)).toContain("transition entry → long");
    const row = { ...rows[0]!, accepted_position: "1", signal_target: null };
    expect(positionTooltip(row)).toContain("accepted 1");
    expect(positionTooltip(row)).toContain("target not published");
  });
});
