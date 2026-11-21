/**
 * F2b · Screen 08 — the three windows, prominent transition markers, and the
 * way in and out.
 *
 * Claims:
 *  - `?window=is|oos|holdout` is the window in the URL (default OOS, then
 *    left out); the switch sits in the fold chain's row and writes it back.
 *  - IS = overview candles of the served train span; HOLDOUT = the served
 *    typed absence with its reason code; neither draws a marker.
 *  - Every served transition kind (ENTRY / EXIT / FLIP / RESIZE × LONG /
 *    SHORT / FLAT) has its own glyph; an opener is joined to the transition
 *    that closes it, and an ambiguous sequence joins nothing.
 *  - Chart and ledger highlight each other; a marker click moves the playhead.
 *  - Orders / fills / conditional capabilities are never drawn: they are chips
 *    with the server's reason in the tooltip.
 */
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MarkerLayer, MarkerLegend, markerAbove, markerLetter, type CandleMarker, type ChartHandles } from "./ExecuteMarkers";
import { ExecuteRoute } from "./ExecuteRoute";
import { overviewBands, windowMarkers, withLedger } from "./ExecuteCandleReplay";
import { DEFAULT_WINDOW, bucketsInSpan, glyphSize, ordinalAt, pairTransitions, windowOf } from "./executeWindows";
import type { CurrentSourceReplay, ReplayChildAudit, ReplayTransitions } from "./replayClient";
import { forgetRunIdentities } from "./retainedLane";

vi.mock("lightweight-charts", () => {
  /* A recording double that DOES answer coordinates, so the marker layer is positioned. */
  const series = () => ({ setData: vi.fn(), applyOptions: vi.fn(), data: () => [], priceToCoordinate: (price: number) => 400 - price / 200 });
  return {
    ColorType: { Solid: "solid" },
    LineType: { WithSteps: 1 },
    CandlestickSeries: "candles",
    LineSeries: "line",
    createChart: () => ({
      addSeries: () => series(),
      panes: () => [],
      remove: vi.fn(),
      setCrosshairPosition: vi.fn(),
      timeScale: () => ({
        getVisibleLogicalRange: () => null,
        setVisibleLogicalRange: vi.fn(),
        fitContent: vi.fn(),
        subscribeVisibleLogicalRangeChange: vi.fn(),
        timeToCoordinate: (time: number) => (time % 1_000_000) / 100,
        width: () => 20_000,
      }),
    }),
  };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

const FIXTURES = join(process.cwd(), "..", "..", "..", "packages", "contracts", "fixtures");
const load = <T,>(name: string) => JSON.parse(readFileSync(join(FIXTURES, name), "utf8")) as T;
const FOLD0 = load<CurrentSourceReplay>("research-current-source.replay.fold0.valid.json");
const LEDGER = load<ReplayTransitions>("research-current-source.replay-transitions.valid.json");
const AUDIT0 = load<ReplayChildAudit>("research-current-source.replay-child-audit.fold0.valid.json");
const W3B = JSON.parse(readFileSync(join(process.cwd(), "src", "research", "w3bRealWfo.fixture.json"), "utf8")) as { progress: unknown; requested_spec: unknown };
const W3 = JSON.parse(readFileSync(join(process.cwd(), "src", "research", "w3RealWfo.fixture.json"), "utf8")) as { evidence: unknown; split: unknown };
const RUN = FOLD0.run_id;

/* ------------------------------------------------------------ pure helpers */

describe("F2b · window in the URL", () => {
  it("defaults to OOS, reads is / holdout, and leaves the default out of a link", () => {
    expect(DEFAULT_WINDOW).toBe("oos");
    expect(windowOf({ window: null })).toBe("oos");
    expect(windowOf({ window: "is" })).toBe("is");
    expect(windowOf({ window: "holdout" })).toBe("holdout");
  });
});

describe("F2b · pairing is order only", () => {
  const m = (ordinal: number, kind: CandleMarker["kind"]) => ({ ordinal, kind });
  it("joins an opener to the next closer, skipping resizes", () => {
    expect(pairTransitions([m(1, "ENTRY"), m(2, "RESIZE"), m(3, "EXIT")])).toEqual([{ from: 1, to: 3 }]);
  });
  it("a flip closes the open position and opens the next", () => {
    expect(pairTransitions([m(1, "ENTRY"), m(2, "FLIP"), m(3, "EXIT")])).toEqual([{ from: 1, to: 2 }, { from: 2, to: 3 }]);
  });
  it("draws none when ambiguous: an exit with no opener, two entries in a row, a window that ends open", () => {
    expect(pairTransitions([m(1, "EXIT")])).toEqual([]);
    expect(pairTransitions([m(1, "ENTRY"), m(2, "ENTRY"), m(3, "EXIT")])).toEqual([{ from: 2, to: 3 }]);
    expect(pairTransitions([m(1, "ENTRY")])).toEqual([]);
  });
});

describe("F2b · glyph size scales with zoom, within 12–18px", () => {
  it("clamps", () => {
    expect(glyphSize(null)).toBe(15);
    expect(glyphSize(1)).toBe(12);
    expect(glyphSize(8)).toBe(13);
    expect(glyphSize(50)).toBe(18);
  });
});

describe("F2b · overview bands come from served times", () => {
  const buckets = [
    { first_ordinal: 0, last_ordinal: 3, open_utc_ms: 0, close_utc_ms: 3000 },
    { first_ordinal: 4, last_ordinal: 7, open_utc_ms: 4000, close_utc_ms: 7000 },
  ];
  it("places an instant inside a bucket linearly and clamps outside the overview", () => {
    expect(ordinalAt(buckets, -5)).toBe(0);
    expect(ordinalAt(buckets, 1500)).toBe(1.5);
    expect(ordinalAt(buckets, 9999)).toBe(7);
    expect(ordinalAt([], 5)).toBeNull();
  });
  it("selects the buckets overlapping a span", () => {
    expect(bucketsInSpan(buckets, 0, 3500)).toHaveLength(1);
    expect(bucketsInSpan(buckets, 0, 9000)).toHaveLength(2);
  });
});

/* ----------------------------------------------------------- the marker layer */

const ALL: CandleMarker[] = [
  { ordinal: 10, at: 1_000_000, side: "LONG", kind: "ENTRY", sideBefore: "FLAT", high: "100", low: "90", close: "95", fee: "1.00", turnover: "2000.00" },
  { ordinal: 20, at: 1_001_000, side: "LONG", kind: "RESIZE", sideBefore: "LONG", high: "101", low: "91", close: "96", fee: "0.50", turnover: "500.00" },
  { ordinal: 30, at: 1_002_000, side: "SHORT", kind: "FLIP", sideBefore: "LONG", high: "102", low: "92", close: "97", fee: null, turnover: null },
  { ordinal: 40, at: 1_003_000, side: "FLAT", kind: "EXIT", sideBefore: "SHORT", high: "103", low: "93", close: "98", fee: "1.00", turnover: "2000.00" },
  { ordinal: 50, at: 1_004_000, side: "SHORT", kind: "ENTRY", sideBefore: "FLAT", high: "104", low: "94", close: "99", fee: "1.00", turnover: "2000.00" },
  { ordinal: 60, at: 1_005_000, side: "FLAT", kind: "EXIT", sideBefore: "LONG", high: "105", low: "95", close: "100", fee: "1.00", turnover: "2000.00" },
];
const HANDLES: ChartHandles = { timeX: (at) => (at % 1_000_000) / 10, priceY: (price) => 200 - price };

function layer(over: Partial<Parameters<typeof MarkerLayer>[0]> = {}) {
  const onHover = vi.fn();
  const onPick = vi.fn();
  const view = render(
    <div style={{ position: "relative" }}>
      <MarkerLayer markers={ALL} handles={HANDLES} barSpacing={9} hover={null} selected={null} onHover={onHover} onPick={onPick} width={800} height={260} {...over} />
    </div>,
  );
  return { ...view, onHover, onPick };
}

describe("F2b · every served transition kind has its own glyph", () => {
  it("draws one glyph per marker with its kind and side, placed from the chart's own coordinates", () => {
    const { container } = layer();
    const glyphs = [...container.querySelectorAll("[data-marker-glyph]")];
    expect(glyphs.map((g) => `${g.getAttribute("data-kind")}:${g.getAttribute("data-side")}`)).toEqual([
      "ENTRY:LONG", "RESIZE:LONG", "FLIP:SHORT", "EXIT:FLAT", "ENTRY:SHORT", "EXIT:FLAT",
    ]);
    expect(glyphs.every((g) => g.getAttribute("visibility") === "visible")).toBe(true);
    /* A long entry sits below its bar's low (larger y on screen), a short entry above its high. */
    const y = (ordinal: number) => Number(/translate\([-\d.]+ ([-\d.]+)\)/.exec(container.querySelector(`[data-marker-glyph='${ordinal}']`)!.getAttribute("transform")!)![1]);
    expect(y(10)).toBeGreaterThan(HANDLES.priceY(90)!);
    expect(y(50)).toBeLessThan(HANDLES.priceY(104)!);
  });

  it("entry long = ▲ path, entry short = ▼ path, exit = ■ rect, flip = two-tone, resize = small ◆", () => {
    const { container } = layer();
    const shape = (ordinal: number) => container.querySelector(`[data-marker-glyph='${ordinal}']`)!;
    expect(shape(10).querySelectorAll("path")).toHaveLength(1);
    expect(shape(10).querySelector("path")!.getAttribute("fill")).toBe("var(--good)");
    expect(shape(50).querySelector("path")!.getAttribute("fill")).toBe("var(--bad)");
    expect(shape(40).querySelector("rect")).toBeTruthy();
    /* An exit takes the colour of the side it closed, softened. */
    expect(shape(40).querySelector("rect")!.getAttribute("fill")).toBe("var(--bad)");
    expect(shape(60).querySelector("rect")!.getAttribute("fill")).toBe("var(--good)");
    expect(Number(shape(40).querySelector("rect")!.getAttribute("fill-opacity"))).toBeLessThan(1);
    const flip = [...shape(30).querySelectorAll("path")].map((p) => p.getAttribute("fill"));
    expect(flip).toEqual(["var(--good)", "var(--bad)"]);
    expect(shape(20).querySelector("path")!.getAttribute("fill")).toBe("var(--good)");
  });

  it("every glyph carries the 2px paper halo and colours only from tokens", () => {
    const { container } = layer();
    for (const path of container.querySelectorAll("[data-marker-glyph] path, [data-marker-glyph] rect")) {
      const holder = path.getAttribute("stroke") ? path : path.parentElement!;
      expect(holder.getAttribute("stroke")).toBe("var(--paper-raised)");
      expect(holder.getAttribute("stroke-width")).toBe("2");
    }
    expect(container.innerHTML).not.toMatch(/#[0-9a-f]{3,6}\b/i);
  });

  it("the legend shows the real glyphs, each with a tooltip and an accessible name", () => {
    const { container } = render(<MarkerLegend />);
    const items = [...container.querySelectorAll("[data-legend-glyph]")];
    expect(items.map((i) => i.getAttribute("data-legend-glyph"))).toEqual(["long", "short", "exit", "flip", "resize", "pair"]);
    for (const item of items) {
      expect(item.getAttribute("title")!.length).toBeGreaterThan(10);
      expect(item.getAttribute("aria-label")).toBeTruthy();
    }
    expect(container.textContent).not.toMatch(/T = target transition/);
  });

  it("letters: L / S entries, X exit, F flip, R resize; exits of a long sit above, of a short below", () => {
    expect(ALL.map((m) => markerLetter(m))).toEqual(["L", "R", "F", "X", "S", "X"]);
    expect(markerAbove({ kind: "EXIT", side: "FLAT", sideBefore: "LONG" })).toBe(true);
    expect(markerAbove({ kind: "EXIT", side: "FLAT", sideBefore: "SHORT" })).toBe(false);
  });
});

describe("F2b · connectors, hover card, selection", () => {
  it("joins ENTRY→(RESIZE)→FLIP and FLIP→EXIT, and ENTRY→EXIT; the lone entry at the end of a window is left open", () => {
    const { container } = layer();
    const pairs = [...container.querySelectorAll("[data-marker-pair]")].map((l) => l.getAttribute("data-marker-pair"));
    expect(pairs).toEqual(["10-30", "30-40", "50-60"]);
    expect(container.querySelector("[data-marker-pair='10-30']")!.getAttribute("stroke-dasharray")).toBe("2 3");
  });

  it("the hover card carries kind, side, bar time, close, notional and fee as served; an absent field says so", () => {
    const { container } = layer({ hover: 30 });
    const card = container.querySelector("[data-marker-card='30']")!;
    expect(card.textContent).toContain("flip → short");
    expect(card.textContent).toContain("1970-01-01");
    expect(card.textContent).toContain("close 97");
    expect(card.textContent).toContain("notional not published");
    expect(card.textContent).toContain("fee not published");
    expect(card.textContent).not.toMatch(/notional 0|fee 0|—/);
    const served = layer({ hover: 10 }).container.querySelector("[data-marker-card='10']")!;
    expect(served.textContent).toContain("notional 2,000.00");
    expect(served.querySelector("[data-exact='2000.00']")).toBeTruthy();
  });

  it("hover and focus report the ordinal, click picks the marker, Enter picks too; the hovered glyph gets a ring", () => {
    const { container, onHover, onPick } = layer({ hover: 40, selected: 10 });
    const glyph = container.querySelector("[data-marker-glyph='40']")!;
    expect(glyph.getAttribute("data-hover")).toBe("true");
    expect(glyph.querySelector("[data-marker-ring]")).toBeTruthy();
    expect(container.querySelector("[data-marker-glyph='10']")!.getAttribute("data-selected")).toBe("true");
    expect(container.querySelector("[data-marker-glyph='10'] [data-marker-ring]")).toBeTruthy();
    fireEvent.mouseEnter(container.querySelector("[data-marker-glyph='50']")!);
    expect(onHover).toHaveBeenLastCalledWith(50);
    fireEvent.mouseLeave(container.querySelector("[data-marker-glyph='50']")!);
    expect(onHover).toHaveBeenLastCalledWith(null);
    fireEvent.click(container.querySelector("[data-marker-glyph='20']")!);
    expect(onPick).toHaveBeenLastCalledWith(ALL[1]);
    fireEvent.keyDown(container.querySelector("[data-marker-glyph='60']")!, { key: "Enter" });
    expect(onPick).toHaveBeenLastCalledWith(ALL[5]);
  });

  it("without chart coordinates (not drawn yet) the glyphs stay hidden rather than land at 0,0", () => {
    const { container } = layer({ handles: null });
    expect([...container.querySelectorAll("[data-marker-glyph]")].every((g) => g.getAttribute("visibility") === "hidden")).toBe(true);
  });
});

describe("S08 · glyphs stay inside the plot area", () => {
  it("a bar scrolled past the plot's right edge keeps its coordinate but its glyph is hidden, and the overlay clips to the plot", () => {
    const { container } = layer({ handles: { ...HANDLES, plotWidth: () => 150 } });
    const shown = [...container.querySelectorAll("[data-marker-glyph]")].filter((g) => g.getAttribute("visibility") !== "hidden");
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.length).toBeLessThan(ALL.length);
    expect(container.querySelector("svg")!.getAttribute("style")).toContain("overflow: hidden");
    const clip = container.querySelector("clipPath rect")!;
    expect(clip.getAttribute("width")).toBe("150");
  });

  it("draws a labelled fold boundary where the next fold's window begins", () => {
    const { container } = layer({ boundaries: [{ atMs: 1_003_000, label: "fold_02", title: "fold_02 begins · trial t7" }] });
    const line = container.querySelector("[data-fold-boundary]")!;
    expect(line.textContent).toContain("fold_02");
    expect(line.querySelector("title")!.textContent).toContain("trial t7");
  });
});

describe("F2b · served ledger rows refine the window's own transition bars", () => {
  it("windowMarkers keeps the served bar facts and withLedger lets a served row override kind and side", () => {
    const markers = windowMarkers(FOLD0.replay.rows);
    expect(markers[0]!.close).toBe(FOLD0.replay.rows.find((r) => r.source_ordinal === markers[0]!.ordinal)!.bar!.candle!.close);
    expect(markers[0]!.sideBefore).toBe("FLAT");
    const lifted = withLedger(markers, [{ ...LEDGER.rows[0]!, source_ordinal: markers[0]!.ordinal, kind: "FLIP", side_after: "LONG", fee: "9.99" }]);
    expect(lifted[0]!.kind).toBe("FLIP");
    expect(lifted[0]!.fee).toBe("9.99");
    expect(withLedger(markers, null)).toEqual(markers);
  });
});

/* ----------------------------------------------------------------- the screen */

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
const HUB = {
  schema_version: "research.replay.v1",
  run_id: RUN,
  route: { id: null, state: "NOT_PUBLISHED", replay_contract: null, availability: { state: "NOT_PUBLISHED", reason_code: "P04_SOURCE_DID_NOT_PUBLISH_X" } },
  equity_replay: { items: [], page: {}, state_at_cursor: { playback_ordinal: null } },
};

/** FOLD0 with all four transition kinds (the real runs only carry ENTRY / EXIT). */
function fourKinds(): { replay: CurrentSourceReplay; ledger: ReplayTransitions } {
  const replay = structuredClone(FOLD0);
  const ledger = structuredClone(LEDGER);
  const plan: Record<number, number> = { 20: 0.03, 30: 0.05, 45: -0.04, 60: 0, 80: -0.03, 95: 0 };
  let pos = 0;
  const rows: ReplayTransitions["rows"] = [];
  replay.replay.rows.forEach((row, i) => {
    const before = pos;
    if (i in plan) pos = plan[i]!;
    row.accepted_position = String(pos);
    row.bar!.position_before = String(before);
    row.bar!.transition = i in plan;
    if (i in plan) {
      const kind = before === 0 ? "ENTRY" : pos === 0 ? "EXIT" : Math.sign(before) !== Math.sign(pos) ? "FLIP" : "RESIZE";
      rows.push({
        ...LEDGER.rows[0]!,
        source_ordinal: row.source_ordinal,
        at_utc_ms: row.at_utc_ms,
        source_index_utc: row.source_index_utc,
        transition_number: rows.length + 1,
        kind,
        side_after: pos > 0 ? "LONG" : pos < 0 ? "SHORT" : "FLAT",
        position_before: String(before),
        position_after: String(pos),
        close: row.bar!.candle!.close,
        equity: row.equity,
        playback_cursor: row.playback_cursor,
      });
    }
  });
  ledger.rows = rows;
  ledger.source_transition_count = rows.length;
  ledger.page = { ...ledger.page, has_more: false, has_previous: false };
  return { replay, ledger };
}

function fetchFor(replayBody: CurrentSourceReplay, ledgerBody: ReplayTransitions) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const path = new URL(String(input), "http://x").pathname;
    if (path.endsWith("/current-source/split")) return jsonResponse(W3.split);
    if (path.endsWith("/current-source/replay/transitions")) return jsonResponse(ledgerBody);
    if (path.endsWith("/current-source/replay/child-audit")) return jsonResponse(AUDIT0);
    if (path.endsWith("/current-source/replay")) return jsonResponse(replayBody);
    if (path.endsWith("/current-source/evidence")) return jsonResponse(W3.evidence);
    if (path.endsWith("/execute/replay")) return jsonResponse(HUB);
    if (path.endsWith("/progress")) return jsonResponse(W3B.progress);
    if (path.endsWith("/requested-spec")) return jsonResponse(W3B.requested_spec);
    return jsonResponse({ error: { code: "UNEXPECTED" } }, 404);
  });
}

async function settled(search = "", hash = "") {
  forgetRunIdentities();
  const { replay, ledger } = fourKinds();
  fetchFor(replay, ledger);
  const path = `/research/quantbt/runs/${RUN}/execute`;
  window.history.replaceState(null, "", `${path}${search}${hash}`);
  const view = render(
    <MemoryRouter initialEntries={[`${path}${search}${hash}`]}>
      <Routes>
        <Route path="/research/quantbt/runs/:runId/execute" element={<ExecuteRoute />} />
        <Route path="*" element={<div>elsewhere</div>} />
      </Routes>
    </MemoryRouter>,
  );
  await waitFor(() => expect(view.container.querySelector("[data-transitions='ready']")).toBeTruthy(), { timeout: 10_000 });
  await waitFor(() => expect(view.container.querySelector("[data-retained-in-flight='false']")).toBeTruthy(), { timeout: 10_000 });
  return { ...view, replay, ledger };
}

vi.setConfig({ testTimeout: 30_000 });

describe("F2b · the window switch, one control with the fold chain", () => {
  it("sits in the fold chain's row, defaults to OOS and writes #window= back as one history entry per change", async () => {
    const { container } = await settled();
    const switchEl = container.querySelector("[data-window-switch]")!;
    expect(switchEl.getAttribute("role")).toBe("group");
    expect(switchEl.getAttribute("aria-label")).toBe("window");
    expect(switchEl.closest("[data-fold-strip]")).toBeTruthy();
    expect([...switchEl.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["IS", "OOS", "holdout"]);
    expect(switchEl.querySelector("[data-window='oos']")!.getAttribute("aria-pressed")).toBe("true");
    const depth = window.history.length;
    fireEvent.click(switchEl.querySelector("[data-window='is']")!);
    expect(window.location.hash).toContain("window=is");
    expect(window.location.search).toBe("");
    /* QA S08 UX-01: a window change is one history entry, so Back steps to the previous window; clicking the same window adds none. */
    expect(window.history.length).toBe(depth + 1);
    fireEvent.click(switchEl.querySelector("[data-window='is']")!);
    expect(window.history.length).toBe(depth + 1);
    fireEvent.click(switchEl.querySelector("[data-window='oos']")!);
    await waitFor(() => expect(container.querySelector("[data-chart-status='ready']")).toBeTruthy());
    expect(window.location.hash).toContain("window=oos");
    /* The fold chips are untouched by the window: same row, same chip style. */
    expect(switchEl.querySelector("button")!.className).toBe(container.querySelector("[data-fold]")!.className);
  });

  it("?window=is draws the IS overview candles of the served train span and no replay chart or marker", async () => {
    const { container } = await settled("?window=is");
    expect(container.querySelector("[data-window-switch]")!.querySelector("[data-window='is']")!.getAttribute("aria-pressed")).toBe("true");
    const panel = container.querySelector("[data-window-panel='is']")!;
    expect(panel.querySelector("svg")).toBeTruthy();
    expect(panel.getAttribute("data-is-buckets")).toBeTruthy();
    expect(Number(panel.getAttribute("data-is-buckets"))).toBeGreaterThan(0);
    expect(panel.querySelector("[data-is-caption]")!.textContent).toMatch(/^overview · F1 IS · \d+ candles \(\d+ bars each\)$/);
    /* UX-09: the IS overview has a price axis (served high / mid / low) and a time axis (served train span), like the replay chart. */
    expect(panel.querySelector("[data-is-axis='price']")!.textContent).toMatch(/\d,\d{3}\.\d{2}/);
    expect(panel.querySelector("[data-is-axis='time']")!.textContent).toContain("2026-06-01");
    expect(container.querySelector("[data-chart='replay-candles']")).toBeNull();
    expect(container.querySelector("[data-marker-glyph]")).toBeNull();
    expect(container.querySelector("[data-transport]")).toBeNull();
  });

  it("?window=holdout is the served typed absence with its reason code — never an empty band — and a way to the split", async () => {
    const { container } = await settled("?window=holdout");
    const panel = container.querySelector("[data-window-panel='holdout']")!;
    expect(panel.getAttribute("data-band-state")).toBe("NOT_APPLICABLE");
    /* UX-08: a sentence for the reader; the served code stays as data and in the tooltip. */
    expect(panel.textContent).toContain("This run has no holdout window.");
    expect(panel.textContent).not.toContain("not applicable");
    expect(panel.querySelector("[data-reason-code]")!.getAttribute("data-reason-code")).toBe("P10_DELTA_WFO_PROFILE_HAS_NO_HOLDOUT_SEGMENT");
    expect(panel.querySelector("[data-reason-code]")!.getAttribute("title")).toBe("This walk-forward profile declares no holdout segment.");
    const link = panel.querySelector("[data-action='to-split']") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toContain(`/runs/${RUN}/split`);
    expect(link.getAttribute("href")).toContain("fold=1");
    expect(link.getAttribute("href")).toContain("window=holdout");
    expect(container.querySelector("[data-chart='replay-candles']")).toBeNull();
  });

  it("the three bands are on the overview strip: IS hatched, each fold's OOS solid, the selected fold highlighted, each with a tooltip", async () => {
    const { container, replay } = await settled();
    const is = container.querySelector("[data-overview-band='is']")!;
    expect(is.getAttribute("title")).toMatch(/IS \(train\) · 2026-06-01 .* → 2026-06-30/);
    expect((is as HTMLElement).style.background).toContain("repeating-linear-gradient");
    const oos = [...container.querySelectorAll("[data-overview-band='oos']")];
    expect(oos).toHaveLength(replay.execution.fold_capital.segments.length);
    expect(oos.filter((b) => b.getAttribute("data-band-active") === "true")).toHaveLength(1);
    expect(oos[0]!.getAttribute("title")).toMatch(/OOS · 2026-07-01 .* → 2026-07-07 .* · 168 bars/);
    /* Clicking another fold's band opens that fold's window: bands and the fold chain are one control. */
    expect(overviewBands(replay, null, "0").filter((b) => b.key === "is")).toHaveLength(0);
    const holdout = container.querySelector("[data-legend-window='holdout']")!;
    expect(container.querySelector("[data-overview-band='holdout']")).toBeNull();
    expect(holdout.getAttribute("data-band-state")).toBe("NOT_APPLICABLE");
  });
});

describe("F2b · the chart's markers on a window with ENTRY, EXIT, FLIP and RESIZE", () => {
  it("draws all four kinds over the candles, the legend, and keeps the sr-only list", async () => {
    const { container } = await settled();
    const kinds = [...container.querySelectorAll("[data-marker-glyph]")].map((g) => g.getAttribute("data-kind"));
    expect(kinds).toEqual(["ENTRY", "RESIZE", "FLIP", "EXIT", "ENTRY", "EXIT"]);
    expect(container.querySelectorAll("[data-marker-legend] [data-legend-glyph]")).toHaveLength(6);
    expect([...container.querySelectorAll("[data-marker]")].map((n) => n.getAttribute("data-marker-kind"))).toEqual(kinds);
    expect(container.querySelector("[data-marker-layer]")!.getAttribute("data-motion")).toBeTruthy();
    expect(container.textContent).not.toMatch(/T = target transition at the close/);
  });

  it("ledger-row hover lights the marker and marker hover lights the ledger row; clicking a marker moves the playhead and selects the row", async () => {
    const { container, ledger } = await settled();
    const first = ledger.rows[0]!.source_ordinal;
    const third = ledger.rows[2]!.source_ordinal;
    fireEvent.mouseEnter(container.querySelector(`[data-transition-row='${first}']`)!);
    expect(container.querySelector(`[data-marker-glyph='${first}']`)!.getAttribute("data-hover")).toBe("true");
    expect(container.querySelector(`[data-marker-card='${first}']`)).toBeTruthy();
    fireEvent.mouseLeave(container.querySelector(`[data-transition-row='${first}']`)!);
    expect(container.querySelector("[data-marker-glyph][data-hover]")).toBeNull();

    fireEvent.mouseEnter(container.querySelector(`[data-marker-glyph='${third}']`)!);
    expect(container.querySelector(`[data-transition-row='${third}']`)!.getAttribute("data-hover")).toBe("true");
    fireEvent.mouseLeave(container.querySelector(`[data-marker-glyph='${third}']`)!);

    fireEvent.click(container.querySelector(`[data-marker-glyph='${third}']`)!);
    await waitFor(() => expect(container.querySelector(`[data-transition-row='${third}']`)!.getAttribute("data-selected")).toBe("true"));
    expect(container.querySelector(`[data-marker-glyph='${third}']`)!.getAttribute("data-selected")).toBe("true");
    expect(container.querySelector("[data-readout]")!.textContent).toContain(`source bar ${third + 1}`);
    expect(container.querySelector(`[data-anatomy='${third}']`)).toBeTruthy();
  });

  it("orders, fills, partial, trades, SL/TP, OCO and multi-leg are chips with a state dot and the server's reason in the tooltip — nothing is drawn for them", async () => {
    const { container } = await settled();
    const strip = container.querySelector("[data-capability-strip]")!;
    const names = [...strip.querySelectorAll("[data-capability]")].map((c) => c.getAttribute("data-capability"));
    expect(names).toEqual(["orders", "fills", "partial_fills", "trades", "sl_tp", "oco", "multi_leg"]);
    const oco = strip.querySelector("[data-capability='oco']")!;
    expect(oco.querySelector("[data-capability-dot]")).toBeTruthy();
    expect(oco.getAttribute("title")).toContain("QUANTBT_CLOSE_TARGET_V2_HAS_NO_CONTINGENT_ORDERS");
    expect(oco.querySelector("[data-reason-code]")!.getAttribute("data-reason-code")).toBe("QUANTBT_CLOSE_TARGET_V2_HAS_NO_CONTINGENT_ORDERS");
    expect(strip.querySelector("[data-capability='orders']")!.getAttribute("title")).toContain("QUANTBT_ROUTE_EMITTED_NO_ORDER_RECORDS");
    expect(container.querySelector("[data-order-marker], [data-fill-marker], [data-stop-marker]")).toBeNull();
  });
});

describe("F2b · the way out and back in keeps the run, the fold and the window", () => {
  it("every exit link carries the run id and the window; Run Library and Split are one click from the header", async () => {
    const { container } = await settled("?window=is", "#stage=execute&fold=1");
    const href = (selector: string) => (container.querySelector(selector) as HTMLAnchorElement).getAttribute("href")!;
    expect(href("[data-action='back-to-hub']")).toContain(`/runs/${RUN}/evidence`);
    expect(href("[data-action='back-to-hub']")).toContain("window=is");
    expect(href("[data-action='back-to-hub']")).toContain("fold=");
    expect(href("[data-action='back-to-freeze']")).toContain(`/runs/${RUN}/freeze`);
    expect(href("[data-action='back-to-freeze']")).toContain("window=is");
    expect(href("[data-next='run-report']")).toContain(`/runs/${RUN}/report`);
    expect(href("[data-next='run-report']")).toContain("window=is");
    expect(href("[data-action='to-split']")).toContain(`/runs/${RUN}/split`);
    expect(href("[data-action='to-split']")).toContain("window=is");
    /* W4: the crumb is the Run Library's way; the header keeps Split only. */
    expect(container.querySelector("[data-action='to-run-library']")).toBeNull();
  });

  it("the default window adds no query to a link, so existing links stay as they were", async () => {
    const { container } = await settled();
    expect((container.querySelector("[data-next='run-report']") as HTMLAnchorElement).getAttribute("href")).not.toContain("window=");
  });
});

describe("F2b · less text, more tooltip", () => {
  it("the long prose is a tooltip: no marker key sentence, no play-across help line, no ROUTE CONTRACT label, no tile captions", async () => {
    const { container } = await settled();
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/ROUTE CONTRACT|route contract/);
    expect(text).not.toMatch(/records QuantBT emitted|full run · retrospective|engine diagnostics/);
    expect(text).not.toMatch(/reads the next window at each boundary/);
    expect(container.querySelector("[data-tile='target transitions']")!.getAttribute("title")).toContain("Full run, retrospective");
    expect(container.querySelector("[data-action='play-across-folds']")!.getAttribute("title")).toContain("Off by default");
    expect(container.querySelector("[data-playhead-note]")!.getAttribute("title")).toContain("not a broker account");
    expect(container.querySelector("[data-as-of]")!.getAttribute("title")).toContain("revision");
    expect(container.querySelector("[data-route-phase]")).toBeTruthy();
    /* Honesty survives: counts, claim tokens and typed absences are still on screen. */
    expect(container.querySelector("[data-tile='orders · fills · trades']")).toBeNull();
    expect(container.querySelector("[data-capability='trades'] [data-reason-code]")!.getAttribute("data-reason-code")).toBe("QUANTBT_ROUTE_EMITTED_NO_TRADE_RECORDS");
  });

  it("the earlier / later bars buttons are named for bars, not 'window', beside the window switch", async () => {
    const { container } = await settled();
    expect(container.querySelector("[data-action='previous-window']")!.textContent).toBe("‹ earlier bars");
    expect(container.querySelector("[data-action='next-window']")!.textContent).toBe("later bars ›");
  });
});
