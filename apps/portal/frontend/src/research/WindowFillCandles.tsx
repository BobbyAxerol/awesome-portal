/**
 * Screen 08 · the complete window's candles, with the engine's fills — the accepted candle component (lightweight-charts, the
 * `FixedCandleChart` host, palette and axis), not a second renderer.
 *
 * It draws what the source published and no more: the retained candles, every fill at its actual fill price on the bar that holds it,
 * and the account-active stop / take-profit as step lines that BREAK where the engine published none. A fill's glyph is its DIRECTION
 * (buy ▲, sell ▼); it is never called an entry or an exit from the side alone — a leg word (TP, SL, TRAIL, TIME) is printed only when the
 * source named the exit reason. Nothing is inferred: no parent/child connector, no PnL, no level from a tag.
 *
 * The values live in the readout above the plot (the bar under the pointer and the fills it holds, exact strings as served), so no
 * label sits on the canvas to collide with another.
 */

import { useEffect, useMemo, useRef, useState } from "react";

import { paletteNow } from "../charts/theme";
import { smokeMotionAllowed } from "../execution/smokeMotion";
import { AXIS_END_ROOM_BARS, chartPrice, loadLib, sec } from "./ExecuteCandleReplay";
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

function Glyph({ kind }: { kind: "buy" | "sell" | "stop" | "take" }) {
  const color = kind === "buy" || kind === "take" ? "var(--good)" : "var(--bad)";
  return kind === "buy" || kind === "sell" ? (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" style={{ display: "inline-block", verticalAlign: "-1px" }}>
      <path d={kind === "buy" ? "M5 1 L9 9 L1 9 Z" : "M5 9 L9 1 L1 1 Z"} fill={color} />
    </svg>
  ) : (
    <svg width="14" height="10" viewBox="0 0 14 10" aria-hidden="true" style={{ display: "inline-block", verticalAlign: "-1px" }}>
      <line x1="0" y1="5" x2="14" y2="5" stroke={color} strokeWidth="1.5" strokeDasharray="2 2" />
    </svg>
  );
}

const fillWords = (fill: ReplayFill) =>
  `${fill.side ?? "side not published"}${fill.exit_reason ? ` ${fill.exit_reason}` : ""} ${fill.qty ?? "qty not published"} @ ${fill.price}${fill.order_id ? ` · ${fill.order_id}` : ""}`;

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

export function WindowFillCandles({ bars, fills, fillsLoaded = null, fillTotal = null }: { bars: readonly ReplayBar[]; fills: readonly ReplayFill[]; fillsLoaded?: number | null; fillTotal?: number | null }) {
  const host = useRef<HTMLDivElement | null>(null);
  const chart = useRef<{
    api: import("lightweight-charts").IChartApi;
    candles: import("lightweight-charts").ISeriesApi<"Candlestick">;
    stop: import("lightweight-charts").ISeriesApi<"Line">;
    take: import("lightweight-charts").ISeriesApi<"Line">;
    markers: import("lightweight-charts").ISeriesMarkersPluginApi<import("lightweight-charts").Time>;
  } | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const [probe, setProbe] = useState<number | null>(null);
  const [theme, setTheme] = useState(0);
  const timeIndex = useRef<Map<number, number>>(new Map());
  const fitted = useRef<readonly ReplayBar[] | null>(null);

  useEffect(() => {
    let disposed = false;
    loadLib()
      .then((lib) => {
        const element = host.current;
        if (disposed || !element) return;
        const pal = paletteNow();
        const api = lib.createChart(element, {
          autoSize: true,
          layout: { background: { type: lib.ColorType.Solid, color: pal.paperRaised }, textColor: pal.inkFaint, fontSize: 10, attributionLogo: false },
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
        chart.current = { api, candles, stop, take, markers };
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
        layout: { background: { type: "solid" as never, color: pal.paperRaised }, textColor: pal.inkFaint },
        grid: { vertLines: { color: pal.lineSoft }, horzLines: { color: pal.lineSoft } },
        timeScale: { borderColor: pal.lineSoft },
        rightPriceScale: { borderColor: pal.lineSoft },
      });
      c.candles.applyOptions({ upColor: pal.good, downColor: pal.bad, borderUpColor: pal.good, borderDownColor: pal.bad, wickUpColor: pal.good, wickDownColor: pal.bad });
      c.stop.applyOptions({ color: pal.bad });
      c.take.applyOptions({ color: pal.good });
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
    if (fitted.current !== bars) {
      fitted.current = bars;
      c.api.timeScale().fitContent();
      c.api.timeScale().setVisibleLogicalRange?.({ from: -AXIS_END_ROOM_BARS, to: bars.length - 1 + AXIS_END_ROOM_BARS });
    }
  }, [bars, status]);

  const marks = useMemo(() => fillMarkers(bars, fills), [bars, fills]);
  useEffect(() => {
    const c = chart.current;
    if (status !== "ready" || !c) return;
    const pal = paletteNow();
    c.markers.setMarkers(
      marks.map((mark) => ({
        time: mark.time as import("lightweight-charts").UTCTimestamp,
        position: "atPriceMiddle" as const,
        price: mark.price,
        shape: SHAPE[mark.direction],
        color: mark.direction === "buy" ? pal.good : mark.direction === "sell" ? pal.bad : pal.inkFaint,
        text: mark.text,
        id: mark.id,
        size: 1.2,
      })),
    );
  }, [marks, status, theme]);

  const last = bars.length - 1;
  const bar = bars[probe ?? last];
  const barFills = useMemo(() => {
    if (!bar) return [];
    const at = barIndexAt(bars, bar.at_utc_ms);
    return fills.filter((fill) => barIndexAt(bars, fill.at_utc_ms) === at);
  }, [bar, bars, fills]);
  const plotted = marks.length;

  return (
    <div className="relative" data-chart="window-replay" data-chart-status={status} data-fills-plotted={plotted}>
      <div className="mono mb-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px]" style={{ color: "var(--ink-soft)" }} data-window-legend>
        <span className="whitespace-nowrap"><Glyph kind="buy" /> buy fill</span>
        <span className="whitespace-nowrap"><Glyph kind="sell" /> sell fill</span>
        <span className="whitespace-nowrap"><Glyph kind="stop" /> active stop</span>
        <span className="whitespace-nowrap"><Glyph kind="take" /> active take-profit</span>
        <span style={{ color: "var(--ink-faint)" }} data-fills-caption>
          {fillsCaption(plotted, fillsLoaded ?? fills.length, fillTotal)}
        </span>
      </div>
      {bar ? (
        <div className="mono flex min-h-[18px] flex-wrap items-center gap-x-3 gap-y-0.5 pb-1 text-[10px]" style={{ color: "var(--ink)" }} data-window-readout={probe === null ? "last" : "pointer"}>
          <span style={{ color: "var(--ink-soft)" }}>{iso(bar.at_utc_ms)}</span>
          <span><span style={{ color: "var(--ink-faint)" }}>O </span>{bar.open}</span>
          <span><span style={{ color: "var(--ink-faint)" }}>H </span>{bar.high}</span>
          <span><span style={{ color: "var(--ink-faint)" }}>L </span>{bar.low}</span>
          <span><span style={{ color: "var(--ink-faint)" }}>C </span>{bar.close}</span>
          {bar.active_stop ? <span data-readout-level="stop"><span style={{ color: "var(--ink-faint)" }}>stop </span>{bar.active_stop}</span> : null}
          {bar.active_take_profit ? <span data-readout-level="take-profit"><span style={{ color: "var(--ink-faint)" }}>take-profit </span>{bar.active_take_profit}</span> : null}
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
      <div role="img" aria-label={`${bars.length} retained bars with ${plotted} engine fills; exact values in the journal below`}>
        <div ref={host} className={status === "ready" && smokeMotionAllowed() ? "s08-chart-in" : undefined} style={{ height: 320 }} aria-hidden="true" />
      </div>
      {status !== "ready" ? (
        <span className="mono absolute left-3 top-8 text-[10px] italic" style={{ color: "var(--ink-faint)" }}>
          {status === "loading" ? "drawing candles…" : "the chart could not be drawn here; every fill is listed in the journal below"}
        </span>
      ) : null}
    </div>
  );
}
