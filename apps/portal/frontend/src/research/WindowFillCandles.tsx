/**
 * Screen 08 · the complete window's candles, with the engine's fills — the accepted candle component (lightweight-charts, the
 * `FixedCandleChart` host, palette and axis), not a second renderer.
 *
 * It draws what the source published and no more: the retained candles, every fill at its actual fill price on the bar that holds it,
 * and the account-active stop / take-profit as step lines that BREAK where the engine published none. A fill's glyph is its DIRECTION
 * (buy ▲, sell ▼, drawn in ink so it reads on a green and on a red candle); it is never called an entry or an exit from the side alone — a leg word (TP, SL, TRAIL, TIME) is printed only when the
 * source named the exit reason. Nothing is inferred: no parent/child connector, no PnL, no level from a tag.
 *
 * The values live in the readout above the plot (the bar under the pointer and the fills it holds, exact strings as served), so no
 * label sits on the canvas to collide with another.
 */

import { useEffect, useMemo, useRef, useState } from "react";

import { paletteNow } from "../charts/theme";
import { smokeMotionAllowed } from "../execution/smokeMotion";
import { AXIS_END_ROOM_BARS, chartPrice, loadLib, paddedRange, sec } from "./ExecuteCandleReplay";
import { trackStyle, trackWords, type OrderTrack } from "./executionTracks";
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
export function fillDirection(side: string | null): FillDirection {
  const word = (side ?? "").trim().toLowerCase();
  return word === "buy" ? "buy" : word === "sell" ? "sell" : "unknown";
}

const LEG_WORDS: Record<string, string> = { take_profit: "TP", stop_loss: "SL", stop: "SL", trailing_stop: "TRAIL", trail: "TRAIL", time: "TIME", time_exit: "TIME" };

/** The exit-leg label of a fill: only when the source named the reason, and only a reason this screen has a word for. */
export function legLabel(exitReason: string | null): string {
  return exitReason === null ? "" : (LEG_WORDS[exitReason] ?? "");
}

/** The index of the bar holding an instant: the last bar that starts at or before it. -1 when it precedes every bar. */
export function barIndexAt(bars: readonly { at_utc_ms: number }[], at: number): number {
  let low = 0;
  let high = bars.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (bars[mid]!.at_utc_ms <= at) {
      found = mid;
      low = mid + 1;
    } else high = mid - 1;
  }
  return found;
}

export interface FillMarker {
  time: number;
  price: number;
  direction: FillDirection;
  text: string;
  id: string;
}

/** One marker per fill, on the bar that holds it, at its own price. */
export function fillMarkers(bars: readonly ReplayBar[], fills: readonly ReplayFill[]): FillMarker[] {
  const out: FillMarker[] = [];
  fills.forEach((fill, at) => {
    const bar = barIndexAt(bars, fill.at_utc_ms);
    const price = Number(fill.price);
    if (bar < 0 || !Number.isFinite(price)) return;
    out.push({ time: Math.floor(bars[bar]!.at_utc_ms / 1000), price, direction: fillDirection(fill.side), text: legLabel(fill.exit_reason), id: `fill-${at}` });
  });
  return out;
}

const SHAPE: Record<FillDirection, "arrowUp" | "arrowDown" | "circle"> = { buy: "arrowUp", sell: "arrowDown", unknown: "circle" };

/**
 * What the plot shows against what exists: fills on THESE bars, fills the journal read already holds but that sit on other pages of
 * bars, and fills the journal has not delivered yet (a later journal page). Three different things, never one "x of y".
 */
export function fillsCaption(plotted: number, loaded: number, total: number | null): string {
  const parts = [`${plotted.toLocaleString("en-US")} ${plotted === 1 ? "fill" : "fills"} on these bars`];
  if (loaded > plotted) parts.push(`${(loaded - plotted).toLocaleString("en-US")} more on other pages of bars`);
  if (total !== null && total > loaded) parts.push(`${(total - loaded).toLocaleString("en-US")} more on later journal pages`);
  if (plotted > 0) parts.push("exit-leg word only where the source named it");
  return parts.join(" · ");
}

type LegendKind = "buy" | "sell" | "stop" | "take" | "entry" | "order-stop" | "order-exit" | "canceled";

function Glyph({ kind }: { kind: LegendKind }) {
  if (kind === "buy" || kind === "sell") {
    return (
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" style={{ display: "inline-block", verticalAlign: "-1px" }}>
        <path d={kind === "buy" ? "M5 1 L9 9 L1 9 Z" : "M5 9 L9 1 L1 1 Z"} fill="var(--ink)" />
      </svg>
    );
  }
  const color = kind === "stop" || kind === "order-stop" ? "var(--bad)" : kind === "take" || kind === "order-exit" ? "var(--good)" : kind === "entry" ? "var(--accent)" : "var(--ink-faint)";
  const dash = kind === "entry" ? undefined : kind === "canceled" ? "1 3" : "2 2";
  return (
    <svg width="14" height="10" viewBox="0 0 14 10" aria-hidden="true" style={{ display: "inline-block", verticalAlign: "-1px" }}>
      <line x1="0" y1="5" x2="14" y2="5" stroke={color} strokeWidth="1.5" strokeDasharray={dash} />
    </svg>
  );
}

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

/** One series per drawn order; a window with more orders than this draws the first ones and says how many were left out. */
const MAX_DRAWN_ORDERS = 150;

export function WindowFillCandles({
  bars,
  fills,
  tracks = [],
  fillsLoaded = null,
  fillTotal = null,
  journalNote = null,
}: {
  bars: readonly ReplayBar[];
  fills: readonly ReplayFill[];
  /** Orders the journal published, clipped by the caller to nothing: this component clips to its own bars. */
  tracks?: readonly OrderTrack[];
  fillsLoaded?: number | null;
  fillTotal?: number | null;
  /** A sentence about records the journal read could not deliver (a bounded read stopped), shown in the legend row. */
  journalNote?: string | null;
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
    lanes: Api[];
    markers: import("lightweight-charts").ISeriesMarkersPluginApi<import("lightweight-charts").Time>;
  } | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const [probe, setProbe] = useState<number | null>(null);
  const [theme, setTheme] = useState(0);
  const timeIndex = useRef<Map<number, number>>(new Map());
  const fitted = useRef<readonly ReplayBar[] | null>(null);

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
        const markers = lib.createSeriesMarkers(candles, []);
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
        chart.current = { lib, api, candles, stop, take, position, equity, lanes: [], markers };
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
      c.api.timeScale().fitContent();
      c.api.timeScale().setVisibleLogicalRange?.({ from: -AXIS_END_ROOM_BARS, to: bars.length - 1 + AXIS_END_ROOM_BARS });
    }
  }, [bars, status]);

  /* The orders the journal published, drawn as horizontal segments from the instant the source made them working to the instant it
     filled or cancelled them (or to the window's end). Tracks of one style that overlap share no series: each takes its own lane. */
  const inWindow = useMemo(() => {
    if (bars.length === 0) return [];
    const spanMs = bars.length > 1 ? Math.max(1, bars[1]!.at_utc_ms - bars[0]!.at_utc_ms) : 3_600_000;
    const first = bars[0]!.at_utc_ms;
    const end = bars[bars.length - 1]!.at_utc_ms + spanMs;
    return tracks.filter((track) => track.startMs !== null && track.level !== null && Number.isFinite(Number(track.level)) && track.startMs < end && (track.endMs === null || track.endMs >= first));
  }, [bars, tracks]);
  useEffect(() => {
    const c = chart.current;
    if (status !== "ready" || !c) return;
    const pal = paletteNow();
    for (const lane of c.lanes) c.api.removeSeries(lane);
    c.lanes = [];
    if (bars.length === 0) return;
    const spanMs = bars.length > 1 ? Math.max(1, bars[1]!.at_utc_ms - bars[0]!.at_utc_ms) : 3_600_000;
    const windowEnd = bars[bars.length - 1]!.at_utc_ms;
    const snap = (ms: number) => sec(bars[Math.max(0, barIndexAt(bars, ms))]!.at_utc_ms);
    const stepSec = Math.max(1, Math.floor(spanMs / 1000));
    /* One two-point series per order: a line never connects two different orders, whatever their order of time or price. */
    for (const track of inWindow.slice(0, MAX_DRAWN_ORDERS)) {
      const style = trackStyle(track);
      const color = style === "stop" ? pal.bad : style === "exit-limit" ? pal.good : style === "entry" ? pal.accent : pal.inkFaint;
      const withdrawn = track.state === "canceled" || track.state === "expired" || track.state === "rejected";
      const from = snap(track.startMs!);
      const reach = track.endMs === null ? sec(windowEnd) : snap(Math.min(track.endMs, windowEnd));
      /* an order that ended on its own bar still shows its level for one bar */
      const to = Math.max(reach as number, (from as number) + stepSec) as import("lightweight-charts").UTCTimestamp;
      const value = Number(track.level);
      const series = c.api.addSeries(c.lib.LineSeries, {
        /* a withdrawn order is grey: it did not trade */
        color: withdrawn ? pal.inkFaint : color,
        lineWidth: 1,
        lineStyle: style === "entry" && !withdrawn ? c.lib.LineStyle.Solid : c.lib.LineStyle.Dashed,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      series.setData([{ time: from, value }, { time: to, value }]);
      c.lanes.push(series);
    }
  }, [bars, inWindow, status, theme]);

  const marks = useMemo(() => fillMarkers(bars, fills), [bars, fills]);
  const cancels = useMemo(
    () =>
      inWindow.flatMap((track) => {
        const at = track.events.find((event) => event.name === "cancel")?.at;
        const bar = at === undefined ? -1 : barIndexAt(bars, at);
        return at !== undefined && bar >= 0 && Number.isFinite(Number(track.level)) ? [{ time: Math.floor(bars[bar]!.at_utc_ms / 1000), price: Number(track.level), id: `cancel-${track.orderId}` }] : [];
      }),
    [bars, inWindow],
  );
  useEffect(() => {
    const c = chart.current;
    if (status !== "ready" || !c) return;
    const pal = paletteNow();
    const list = [
      ...marks.map((mark) => ({
        time: mark.time as import("lightweight-charts").UTCTimestamp,
        position: "atPriceMiddle" as const,
        price: mark.price,
        shape: SHAPE[mark.direction],
        /* ink, not the candle colours: the glyph must stay visible on a green and on a red body; its SHAPE is the direction */
        color: mark.direction === "unknown" ? pal.inkFaint : pal.ink,
        text: mark.text,
        id: mark.id,
        size: 2,
      })),
      ...cancels.map((cancel) => ({
        time: cancel.time as import("lightweight-charts").UTCTimestamp,
        position: "atPriceMiddle" as const,
        price: cancel.price,
        shape: "square" as const,
        color: pal.inkFaint,
        text: "cancel",
        id: cancel.id,
        size: 0.6,
      })),
    ].sort((a, b) => (a.time as number) - (b.time as number));
    c.markers.setMarkers(list);
  }, [marks, cancels, status, theme]);

  /* The playhead is keyboard-steppable: ← → one bar, Shift ten, Home / End the ends. It moves the readout and the crosshair only. */
  const [cursor, setCursor] = useState<number | null>(null);
  const move = (event: React.KeyboardEvent) => {
    if (bars.length === 0) return;
    const at = cursor ?? probe ?? bars.length - 1;
    const step = event.shiftKey ? 10 : 1;
    const next = event.key === "ArrowRight" ? at + step : event.key === "ArrowLeft" ? at - step : event.key === "Home" ? 0 : event.key === "End" ? bars.length - 1 : null;
    if (next === null) return;
    event.preventDefault();
    const clamped = Math.max(0, Math.min(bars.length - 1, next));
    setCursor(clamped);
    setProbe(clamped);
    try {
      const bar = bars[clamped]!;
      chart.current?.api.setCrosshairPosition(Number(bar.close), sec(bar.at_utc_ms), chart.current.candles);
    } catch {
      /* the crosshair is a convenience */
    }
  };

  const last = bars.length - 1;
  const bar = bars[probe ?? last];
  const barFills = useMemo(() => {
    if (!bar) return [];
    const at = barIndexAt(bars, bar.at_utc_ms);
    return fills.filter((fill) => barIndexAt(bars, fill.at_utc_ms) === at);
  }, [bar, bars, fills]);
  const working = useMemo(() => (bar ? tracksAt(inWindow, bar.at_utc_ms) : []), [bar, inWindow]);
  const plotted = marks.length;
  const styles = new Set(inWindow.map(trackStyle));
  const withdrawn = inWindow.some((track) => track.state === "canceled" || track.state === "expired" || track.state === "rejected");

  return (
    <div className="relative" data-chart="window-replay" data-chart-status={status} data-fills-plotted={plotted} data-order-tracks={inWindow.length}>
      <div className="mono mb-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px]" style={{ color: "var(--ink-soft)" }} data-window-legend>
        <span className="whitespace-nowrap"><Glyph kind="buy" /> buy fill</span>
        <span className="whitespace-nowrap"><Glyph kind="sell" /> sell fill</span>
        {styles.has("entry") ? <span className="whitespace-nowrap" data-legend="entry"><Glyph kind="entry" /> limit order</span> : null}
        {styles.has("stop") ? <span className="whitespace-nowrap" data-legend="order-stop"><Glyph kind="order-stop" /> stop order · reduce-only</span> : null}
        {styles.has("exit-limit") ? <span className="whitespace-nowrap" data-legend="order-exit"><Glyph kind="order-exit" /> limit order · reduce-only</span> : null}
        {withdrawn ? <span className="whitespace-nowrap" data-legend="canceled"><Glyph kind="canceled" /> cancelled / expired, did not trade</span> : null}
        {bars.some((b) => b.active_stop !== null) ? <span className="whitespace-nowrap"><Glyph kind="stop" /> account stop</span> : null}
        {bars.some((b) => b.active_take_profit !== null) ? <span className="whitespace-nowrap"><Glyph kind="take" /> account take-profit</span> : null}
        <span style={{ color: "var(--ink-faint)" }} data-fills-caption>
          {fillsCaption(plotted, fillsLoaded ?? fills.length, fillTotal)}
          {inWindow.length > 0 ? ` · ${inWindow.length.toLocaleString("en-US")} orders on these bars${inWindow.length > MAX_DRAWN_ORDERS ? ` (first ${MAX_DRAWN_ORDERS} drawn)` : ""}` : ""}
          {journalNote ? ` · ${journalNote}` : ""}
        </span>
      </div>
      {bar ? (
        <div className="mono flex min-h-[18px] flex-wrap items-center gap-x-3 gap-y-0.5 pb-1 text-[10px]" style={{ color: "var(--ink)" }} data-window-readout={probe === null ? "last" : "pointer"}>
          <span style={{ color: "var(--ink-soft)" }}>{iso(bar.at_utc_ms)}</span>
          <span><span style={{ color: "var(--ink-faint)" }}>O </span>{bar.open}</span>
          <span><span style={{ color: "var(--ink-faint)" }}>H </span>{bar.high}</span>
          <span><span style={{ color: "var(--ink-faint)" }}>L </span>{bar.low}</span>
          <span><span style={{ color: "var(--ink-faint)" }}>C </span>{bar.close}</span>
          {hasPosition ? <span data-readout-position><span style={{ color: "var(--ink-faint)" }}>position </span>{bar.position ?? "not published"}</span> : null}
          {hasEquity ? <span data-readout-equity><span style={{ color: "var(--ink-faint)" }}>equity </span>{bar.equity ?? "not published"}</span> : null}
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
        aria-label={`${bars.length} retained bars with ${plotted} engine fills and ${inWindow.length} orders; arrow keys step the readout, exact values in the journal below`}
        onKeyDown={move}
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
