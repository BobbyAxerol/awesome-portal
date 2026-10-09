/**
 * Screen 08 · the complete window's candles with the engine journal drawn on them — the accepted candle component (lightweight-charts,
 * the `FixedCandleChart` host, palette and axis), not a second renderer.
 *
 * The journal is painted by `ExecutionOverlayPrimitive` from the pure model in `executionOverlay.ts`: fills as small triangles at their
 * own price, entry limit orders as thin working lines, OCO brackets as a washed box between the entry price and each leg, explicit
 * trade links. The account-active stop / take-profit stay step lines that BREAK where the engine published none. Nothing is inferred:
 * no relation from an ID suffix or adjacency, no PnL, no level from a tag; a leg word is the order type, and TP / SL only where the
 * source named the exit reason. The exact values live in the readout above the plot (the bar under the playhead or pointer and the
 * orders and fills it holds, strings as served).
 */

import { useEffect, useMemo, useRef, useState } from "react";

import { paletteNow } from "../charts/theme";
import { canvasTokens, activeTheme } from "../styles/tokens";
import { smokeMotionAllowed } from "../execution/smokeMotion";
import { AXIS_END_ROOM_BARS, chartPrice, loadLib, paddedRange, sec } from "./ExecuteCandleReplay";
import { ExecutionOverlayPrimitive, type OverlayPalette } from "./ExecutionOverlayPrimitive";
import { barIndexAt, buildOverlay, directionOf } from "./executionOverlay";
import { trackWords, type OrderTrack } from "./executionTracks";
import { ReplayTransport, replayKeyDown, useTransport } from "./replayTransport";
import { iso } from "./utcMinute";

export interface ReplayBar {
  at_utc_ms: number;
  open: string;
  high: string;
  low: string;
  close: string;
  /** The active protective levels the engine published for this bar; null where it published none (a gap, never a line at zero). */
  active_stop: string | null;
  active_take_profit: string | null;
  /** The account's equity and native position at this bar, as served (the lower panes). */
  equity?: string | null;
  position?: string | null;
}

export interface ReplayFill {
  at_utc_ms: number;
  price: string;
  qty: string | null;
  side: string | null;
  /** The engine's own words: `entry`, `take_profit`, `stop_loss`, … `null` when the source named none. */
  exit_reason: string | null;
  /** The source order this fill belongs to, as served. */
  order_id?: string | null;
}

export type FillDirection = "buy" | "sell" | "unknown";

/** The engine serves `buy` / `sell`; a case or spelling the reader does not know is `unknown`, never guessed. */
export const fillDirection = (side: string | null): FillDirection => directionOf(side);
export { barIndexAt, legLabel } from "./executionOverlay";

/**
 * What the plot shows against what exists: fills on THESE bars, fills the journal read already holds but that sit on other pages of
 * bars, and fills the journal has not delivered yet (a later journal page). Three different things, never one "x of y".
 */
export function fillsCaption(plotted: number, loaded: number, total: number | null): string {
  const parts = [`${plotted.toLocaleString("en-US")} ${plotted === 1 ? "fill" : "fills"} here`];
  if (loaded > plotted) parts.push(`${(loaded - plotted).toLocaleString("en-US")} on other pages`);
  if (total !== null && total > loaded) parts.push(`${(total - loaded).toLocaleString("en-US")} not loaded yet`);
  return parts.join(" · ");
}

type LegendKind = "buy" | "sell" | "bracket" | "withdrawn" | "limit-order" | "stop" | "take";

/** The legend's marks are the chart's own, drawn at the same weight. */
function Glyph({ kind }: { kind: LegendKind }) {
  const svg = { "aria-hidden": true as const, style: { display: "inline-block", verticalAlign: "-2px" } };
  if (kind === "buy" || kind === "sell") {
    return (
      <svg width="10" height="10" viewBox="0 0 10 10" {...svg}>
        <path d={kind === "buy" ? "M5 1 L9 9 L1 9 Z" : "M5 9 L9 1 L1 1 Z"} fill="var(--accent)" />
      </svg>
    );
  }
  if (kind === "bracket") {
    return (
      <svg width="22" height="12" viewBox="0 0 22 12" {...svg}>
        <rect x="0.5" y="0.5" width="21" height="5" fill="var(--good)" fillOpacity="0.14" />
        <rect x="0.5" y="6.5" width="21" height="5" fill="var(--bad)" fillOpacity="0.14" />
        <line x1="0" y1="6" x2="22" y2="6" stroke="var(--accent)" strokeOpacity="0.5" />
        <line x1="0" y1="0.8" x2="22" y2="0.8" stroke="var(--good)" strokeWidth="1.4" />
        <line x1="0" y1="11.2" x2="22" y2="11.2" stroke="var(--bad)" strokeWidth="1.4" strokeDasharray="3 3" />
      </svg>
    );
  }
  if (kind === "limit-order") {
    return (
      <svg width="16" height="10" viewBox="0 0 16 10" {...svg}>
        <line x1="0" y1="5" x2="16" y2="5" stroke="var(--accent)" strokeWidth="1.2" />
      </svg>
    );
  }
  if (kind === "stop" || kind === "take") {
    return (
      <svg width="16" height="10" viewBox="0 0 16 10" {...svg}>
        <line x1="0" y1="5" x2="16" y2="5" stroke={kind === "stop" ? "var(--bad)" : "var(--good)"} strokeWidth="1.2" strokeDasharray="1 2" />
      </svg>
    );
  }
  return (
    <svg width="16" height="10" viewBox="0 0 16 10" {...svg}>
      <line x1="0" y1="5" x2="16" y2="5" stroke="var(--ink-faint)" strokeWidth="1.2" strokeDasharray="3 3" />
    </svg>
  );
}

/** A long served decimal in a readout cell: a few significant digits; the exact string stays in the cell's tooltip and `data-exact`. */
const briefDecimal = (text: string, digits: number) => (Number.isFinite(Number(text)) ? String(Number(Number(text).toPrecision(digits))) : text);
const money2 = (text: string) => (Number.isFinite(Number(text)) ? Number(text).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : text);

const fillWords = (fill: ReplayFill) =>
  `${fill.side ?? "side not published"}${fill.exit_reason ? ` ${fill.exit_reason}` : ""} ${fill.qty ?? "qty not published"} @ ${fill.price}${fill.order_id ? ` · ${fill.order_id}` : ""}`;

const STATE_WORDS: Record<OrderTrack["state"], string> = { filled: "filled", canceled: "cancelled", expired: "expired", rejected: "rejected", open: "no terminal event in the rows read" };

/** What a hovered bar says about an order that was working there: its type and level, relations as served, and how it ended. */
export function trackReadout(track: OrderTrack): string {
  const level = track.level === null ? "level not published" : `${track.levelKind === "trigger" ? "trigger " : ""}${track.level}`;
  const rel = [track.parentOrderId ? `parent ${track.parentOrderId}` : null, track.ocoGroupId ? `OCO ${track.ocoGroupId}` : null].filter(Boolean).join(" · ");
  const end = track.endMs === null ? STATE_WORDS.open : `${STATE_WORDS[track.state]} ${iso(track.endMs)}`;
  return `${trackWords(track)} ${level}${rel ? ` · ${rel}` : ""} · ${end}`;
}

/** The tracks working at an instant: started at or before it and not yet ended. */
export function tracksAt(tracks: readonly OrderTrack[], at: number): OrderTrack[] {
  return tracks.filter((track) => track.startMs !== null && track.startMs <= at && (track.endMs === null || at < track.endMs));
}

export function WindowFillCandles({
  bars,
  fills,
  tracks = [],
  fillsLoaded = null,
  fillTotal = null,
  journalNote = null,
  transport = null,
}: {
  bars: readonly ReplayBar[];
  fills: readonly ReplayFill[];
  /** Orders the journal published, clipped by the caller to nothing: this component clips to its own bars. */
  tracks?: readonly OrderTrack[];
  fillsLoaded?: number | null;
  fillTotal?: number | null;
  /** A sentence about records the journal read could not deliver (a bounded read stopped), shown in the legend row. */
  journalNote?: string | null;
  /** The accepted transport (play / step / speed / seek): its index is the playhead; the pointer overrides it while it is over the chart. */
  transport?: ReplayTransport | null;
}) {
  type Api = import("lightweight-charts").ISeriesApi<"Line">;
  const host = useRef<HTMLDivElement | null>(null);
  const chart = useRef<{
    lib: Awaited<ReturnType<typeof loadLib>>;
    api: import("lightweight-charts").IChartApi;
    candles: import("lightweight-charts").ISeriesApi<"Candlestick">;
    stop: Api;
    take: Api;
    position: Api;
    equity: Api;
    overlay: ExecutionOverlayPrimitive;
  } | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const [probe, setProbe] = useState<number | null>(null);
  const [theme, setTheme] = useState(0);
  const timeIndex = useRef<Map<number, number>>(new Map());
  const fitted = useRef<readonly ReplayBar[] | null>(null);
  const justFitted = useRef(false);
  /* The playhead: the accepted transport when the screen supplies one, else a private one (a bare chart still steps by keyboard). */
  const [own] = useState(() => new ReplayTransport());
  const tp = transport ?? own;
  useEffect(() => {
    if (transport === null) own.load(bars.length, 0);
  }, [transport, own, bars.length]);
  const { index } = useTransport(tp);

  const hasEquity = useMemo(() => bars.some((bar) => bar.equity !== null && bar.equity !== undefined), [bars]);
  const hasPosition = useMemo(() => bars.some((bar) => bar.position !== null && bar.position !== undefined), [bars]);

  useEffect(() => {
    let disposed = false;
    loadLib()
      .then((lib) => {
        const element = host.current;
        if (disposed || !element) return;
        const pal = paletteNow();
        const api = lib.createChart(element, {
          autoSize: true,
          layout: { background: { type: lib.ColorType.Solid, color: pal.paperRaised }, textColor: pal.inkFaint, fontSize: 10, panes: { separatorColor: pal.lineSoft }, attributionLogo: false },
          grid: { vertLines: { color: pal.lineSoft }, horzLines: { color: pal.lineSoft } },
          timeScale: { timeVisible: true, borderColor: pal.lineSoft },
          rightPriceScale: { borderColor: pal.lineSoft, scaleMargins: { top: 0.08, bottom: 0.06 } },
          localization: { priceFormatter: chartPrice },
        });
        const candles = api.addSeries(lib.CandlestickSeries, {
          upColor: pal.good, downColor: pal.bad, borderUpColor: pal.good, borderDownColor: pal.bad, wickUpColor: pal.good, wickDownColor: pal.bad,
        });
        const level = (color: string) =>
          api.addSeries(lib.LineSeries, { color, lineWidth: 1, lineStyle: lib.LineStyle.Dotted, lineType: lib.LineType.WithSteps, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
        const stop = level(pal.bad);
        const take = level(pal.good);
        const overlay = new ExecutionOverlayPrimitive();
        candles.attachPrimitive(overlay);
        const position = api.addSeries(lib.LineSeries, { color: pal.accent, lineWidth: 1, lineType: lib.LineType.WithSteps, priceLineVisible: false, lastValueVisible: false }, 1);
        const equity = api.addSeries(lib.LineSeries, { color: pal.ink, lineWidth: 1, priceLineVisible: false, lastValueVisible: false }, 2);
        equity.applyOptions({
          autoscaleInfoProvider: () => {
            const range = paddedRange(equity.data().map((point) => (point as { value?: number }).value).filter((value): value is number => typeof value === "number"));
            return range ? { priceRange: { minValue: range.min, maxValue: range.max } } : null;
          },
        });
        try {
          const panes = api.panes();
          panes[0]?.setHeight(300);
          panes[1]?.setHeight(52);
          panes[2]?.setHeight(76);
        } catch {
          /* pane sizing is cosmetic */
        }
        chart.current = { lib, api, candles, stop, take, position, equity, overlay };
        try {
          api.subscribeCrosshairMove?.((param: { time?: unknown }) => {
            const at = typeof param?.time === "number" ? timeIndex.current.get(param.time) : undefined;
            if (!disposed) setProbe(at ?? null);
          });
        } catch {
          /* the readout falls back to the last bar */
        }
        setStatus("ready");
      })
      .catch(() => {
        if (!disposed) setStatus("unavailable");
      });
    return () => {
      disposed = true;
      chart.current?.api.remove();
      chart.current = null;
    };
  }, []);

  /* Theme changes repaint the canvas from the tokens. */
  useEffect(() => {
    if (status !== "ready" || typeof MutationObserver === "undefined") return undefined;
    const observer = new MutationObserver(() => {
      const c = chart.current;
      if (!c) return;
      const pal = paletteNow();
      c.api.applyOptions({
        layout: { background: { type: "solid" as never, color: pal.paperRaised }, textColor: pal.inkFaint, panes: { separatorColor: pal.lineSoft } },
        grid: { vertLines: { color: pal.lineSoft }, horzLines: { color: pal.lineSoft } },
        timeScale: { borderColor: pal.lineSoft },
        rightPriceScale: { borderColor: pal.lineSoft },
      });
      c.candles.applyOptions({ upColor: pal.good, downColor: pal.bad, borderUpColor: pal.good, borderDownColor: pal.bad, wickUpColor: pal.good, wickDownColor: pal.bad });
      c.stop.applyOptions({ color: pal.bad });
      c.take.applyOptions({ color: pal.good });
      c.position.applyOptions({ color: pal.accent });
      c.equity.applyOptions({ color: pal.ink });
      setTheme((n) => n + 1);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    return () => observer.disconnect();
  }, [status]);

  useEffect(() => {
    const c = chart.current;
    if (status !== "ready" || !c) return;
    timeIndex.current = new Map(bars.map((bar, at) => [sec(bar.at_utc_ms), at]));
    c.candles.setData(bars.map((bar) => ({ time: sec(bar.at_utc_ms), open: Number(bar.open), high: Number(bar.high), low: Number(bar.low), close: Number(bar.close) })));
    /* A bar with no published level is a whitespace point: the line breaks there instead of dropping to zero. */
    const levelData = (pick: (bar: ReplayBar) => string | null) =>
      bars.map((bar) => {
        const value = pick(bar);
        return value === null ? { time: sec(bar.at_utc_ms) } : { time: sec(bar.at_utc_ms), value: Number(value) };
      });
    c.stop.setData(levelData((bar) => bar.active_stop));
    c.take.setData(levelData((bar) => bar.active_take_profit));
    c.position.setData(bars.map((bar) => (bar.position === null || bar.position === undefined ? { time: sec(bar.at_utc_ms) } : { time: sec(bar.at_utc_ms), value: Number(bar.position) })));
    c.equity.setData(bars.map((bar) => (bar.equity === null || bar.equity === undefined ? { time: sec(bar.at_utc_ms) } : { time: sec(bar.at_utc_ms), value: Number(bar.equity) })));
    if (fitted.current !== bars) {
      fitted.current = bars;
      justFitted.current = true;
      c.api.timeScale().fitContent();
      c.api.timeScale().setVisibleLogicalRange?.({ from: -AXIS_END_ROOM_BARS, to: bars.length - 1 + AXIS_END_ROOM_BARS });
    }
  }, [bars, status]);

  /* The orders working on this page (for the readout) and the overlay the canvas paints for them: fills, entry limit orders, OCO
     brackets, explicit trade links. The model is pure (`executionOverlay.ts`); the primitive only paints it. */
  const spanMs = bars.length > 1 ? Math.max(1, bars[1]!.at_utc_ms - bars[0]!.at_utc_ms) : 3_600_000;
  const windowStart = bars.length > 0 ? bars[0]!.at_utc_ms : 0;
  const windowEnd = bars.length > 0 ? bars[bars.length - 1]!.at_utc_ms + spanMs : 0;
  const inWindow = useMemo(() => tracks.filter((track) => track.startMs !== null && track.startMs < windowEnd && (track.endMs === null || track.endMs >= windowStart)), [tracks, windowStart, windowEnd]);
  const overlay = useMemo(() => buildOverlay(tracks, fills, windowStart, windowEnd), [tracks, fills, windowStart, windowEnd]);
  useEffect(() => {
    const c = chart.current;
    if (status !== "ready" || !c) return;
    const t = canvasTokens(activeTheme());
    const palette: OverlayPalette = { ink: t.ink, inkSoft: t.inkSoft, inkFaint: t.inkFaint, accent: t.accent, good: t.good, bad: t.bad, surface: t.paperRaised };
    c.overlay.setData(overlay, bars, palette);
  }, [overlay, bars, status, theme]);

  /* The playhead: the crosshair sits on the bar, and the visible range slides to follow it (a zoom the reader set is kept until the
     playhead leaves it). A transport move clears the pointer's override. */
  useEffect(() => {
    setProbe(null);
  }, [index]);
  useEffect(() => {
    const c = chart.current;
    const row = bars[index];
    if (status !== "ready" || !c || !row) return;
    try {
      c.api.setCrosshairPosition(Number(row.close), sec(row.at_utc_ms), c.candles);
      const range = c.api.timeScale().getVisibleLogicalRange();
      if (justFitted.current) {
        justFitted.current = false;
      } else if (range && (index < range.from || index > range.to)) {
        const span = range.to - range.from;
        const from = Math.max(-2, index - span * 0.7);
        c.api.timeScale().setVisibleLogicalRange({ from, to: from + span });
      }
    } catch {
      /* the crosshair is a convenience */
    }
  }, [index, bars, status]);

  const bar = bars[probe ?? Math.min(index, bars.length - 1)];
  const barFills = useMemo(() => {
    if (!bar) return [];
    const at = barIndexAt(bars, bar.at_utc_ms);
    return fills.filter((fill) => barIndexAt(bars, fill.at_utc_ms) === at);
  }, [bar, bars, fills]);
  const working = useMemo(() => (bar ? tracksAt(inWindow, bar.at_utc_ms) : []), [bar, inWindow]);
  const plotted = overlay.fills.length;
  const hasBrackets = overlay.brackets.length > 0;
  const hasEntries = overlay.entries.length > 0;
  const hasWithdrawn = overlay.brackets.some((bracket) => bracket.legs.some((leg) => leg.state === "canceled" || leg.state === "expired" || leg.state === "rejected")) || overlay.entries.some((entry) => entry.state === "canceled" || entry.state === "expired");

  return (
    <div className="relative" data-chart="window-replay" data-chart-status={status} data-fills-plotted={plotted} data-order-tracks={inWindow.length}>
      <div className="mono mb-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px]" style={{ color: "var(--ink-soft)" }} data-window-legend>
        {plotted > 0 ? (
          <>
            <span className="whitespace-nowrap" data-legend="buy"><Glyph kind="buy" /> buy</span>
            <span className="whitespace-nowrap" data-legend="sell"><Glyph kind="sell" /> sell</span>
          </>
        ) : null}
        {hasEntries ? <span className="whitespace-nowrap" data-legend="limit-order"><Glyph kind="limit-order" /> limit order</span> : null}
        {hasBrackets ? <span className="whitespace-nowrap" data-legend="bracket" title="From the parent's fill to the instant the source resolved the pair. A wash runs from the entry price to each leg: red on the adverse side, green on the favourable side; the leg that traded has the solid edge."><Glyph kind="bracket" /> OCO bracket</span> : null}
        {hasWithdrawn ? <span className="whitespace-nowrap" data-legend="withdrawn"><Glyph kind="withdrawn" /> cancelled / expired</span> : null}
        {bars.some((b) => b.active_stop !== null) ? <span className="whitespace-nowrap"><Glyph kind="stop" /> account stop</span> : null}
        {bars.some((b) => b.active_take_profit !== null) ? <span className="whitespace-nowrap"><Glyph kind="take" /> account take-profit</span> : null}
        <span style={{ color: "var(--ink-faint)" }} data-fills-caption title="A leg word (TP, SL) is printed only where the source named the exit reason. Fills on other pages of bars are on the next / previous bar page; fills not loaded yet are on a later journal page.">
          {fillsCaption(plotted, fillsLoaded ?? fills.length, fillTotal)}
          {inWindow.length > 0 ? ` · ${inWindow.length.toLocaleString("en-US")} orders` : ""}
          {journalNote ? ` · ${journalNote}` : ""}
        </span>
      </div>
      {bar ? (
        <div className="mono flex min-h-[18px] flex-wrap items-center gap-x-3 gap-y-0.5 pb-1 text-[10px]" style={{ color: "var(--ink)" }} data-window-readout={probe === null ? "playhead" : "pointer"}>
          <span style={{ color: "var(--ink-soft)" }}>{iso(bar.at_utc_ms)}</span>
          <span><span style={{ color: "var(--ink-faint)" }}>O </span>{bar.open}</span>
          <span><span style={{ color: "var(--ink-faint)" }}>H </span>{bar.high}</span>
          <span><span style={{ color: "var(--ink-faint)" }}>L </span>{bar.low}</span>
          <span><span style={{ color: "var(--ink-faint)" }}>C </span>{bar.close}</span>
          {hasPosition ? <span data-readout-position title={bar.position ?? undefined} data-exact={bar.position ?? undefined}><span style={{ color: "var(--ink-faint)" }}>position </span>{bar.position == null ? "not published" : briefDecimal(bar.position, 5)}</span> : null}
          {hasEquity ? <span data-readout-equity title={bar.equity ?? undefined} data-exact={bar.equity ?? undefined}><span style={{ color: "var(--ink-faint)" }}>equity </span>{bar.equity == null ? "not published" : money2(bar.equity)}</span> : null}
          {bar.active_stop ? <span data-readout-level="stop"><span style={{ color: "var(--ink-faint)" }}>account stop </span>{bar.active_stop}</span> : null}
          {bar.active_take_profit ? <span data-readout-level="take-profit"><span style={{ color: "var(--ink-faint)" }}>account take-profit </span>{bar.active_take_profit}</span> : null}
        </div>
      ) : null}
      {working.length > 0 ? (
        <div className="mono flex flex-col gap-0.5 pb-1 text-[10px]" style={{ color: "var(--ink)" }} data-window-readout-orders>
          {working.map((track) => (
            <span key={track.orderId} data-readout-order={track.orderId}>
              <span style={{ color: "var(--ink-faint)" }}>order {track.orderId} · </span>
              {trackReadout(track)}
            </span>
          ))}
        </div>
      ) : null}
      {barFills.length > 0 ? (
        <div className="mono flex flex-col gap-0.5 pb-1 text-[10px]" style={{ color: "var(--ink)" }} data-window-readout-fills>
          {barFills.map((fill, at) => (
            <span key={`${fill.at_utc_ms}:${at}`} data-readout-fill={fill.order_id ?? undefined}>
              <span style={{ color: "var(--ink-faint)" }}>fill {iso(fill.at_utc_ms)} · </span>
              {fillWords(fill)}
            </span>
          ))}
        </div>
      ) : null}
      <div
        role="application"
        tabIndex={0}
        aria-label={`${bars.length} retained bars with ${plotted} engine fills and ${inWindow.length} orders; Space plays, arrow keys step, Shift jumps ten; exact values in the journal below`}
        onKeyDown={replayKeyDown(tp)}
        style={{ outline: "none" }}
        data-window-chart-region
      >
        <div ref={host} className={status === "ready" && smokeMotionAllowed() ? "s08-chart-in" : undefined} style={{ height: 300 + (hasPosition ? 52 : 0) + (hasEquity ? 76 : 0) + 28 }} aria-hidden="true" />
      </div>
      {status !== "ready" ? (
        <span className="mono absolute left-3 top-8 text-[10px] italic" style={{ color: "var(--ink-faint)" }}>
          {status === "loading" ? "drawing candles…" : "the chart could not be drawn here; every fill is listed in the journal below"}
        </span>
      ) : null}
    </div>
  );
}
