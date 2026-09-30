/**
 * Screen 08 · W5b — the signal-notional route replayed as it really ran.
 *
 * The retained lane now carries, per bar, the candle QuantBT consumed and the
 * final account's own fee/turnover, plus the route's facts (close_target_v2,
 * 0 orders, 0 fills, 0 trades, carry-position fold capital). So the hi-fi's
 * close_target view is drawn from data, not from a sample line:
 *
 *  - **candles + markers.** The chart is the run's analysed HMD candles; a
 *    marker is a target transition settled at the close (T), coloured by the
 *    side it opened. Never a fill, never an equity or fill line on price.
 *  - **one clock.** The transport walks the loaded fold window bar by bar;
 *    fold and transition jumps are explicit reads by the lane's own cursors.
 *  - **causal reveal** is presentation only: it cuts the chart, the ledger and
 *    the playhead panels at the cursor and hides full-run outcomes. It changes
 *    no request, revision or digest.
 *  - **what the route cannot produce** is a named absence with the server's
 *    reason (the engine counted 0 orders/fills/trades; OCO, SL/TP, partial
 *    fills and multi-leg are not applicable by the run's own configuration).
 *  - **play across folds (D7, HiFi 8.10)** is a switch, off by default, that
 *    lets playback read the next window at a boundary instead of stopping. The
 *    rules live in `usePlayAcrossFolds`; this file draws the switch and says
 *    what it did.
 */

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";

import { paletteNow } from "../charts/theme";
import { ProvenanceStrip } from "./ProvenanceStrip";
import { reasonCodeSentence } from "./researchRefusal";
import { foldLabel, formatMetric } from "./researchFormat";
import {
  REPLAY_GAP_WORDS,
  type CurrentSourceObservation,
  type CurrentSourceReplay,
  type FoldSegment,
  type TransitionRow,
  type ChildAuditRecord,
} from "./replayClient";
import { ReplayTransport, SPEEDS, useTransport } from "./replayTransport";
import { retainedReadiness } from "./retainedLane";
import { SplitBand, SplitBandNote, retainedSplitBand, type SplitBandSlot } from "./SplitBand";
import { ACROSS_HELP, ACROSS_LABEL, pageRefusalWords, usePlayAcrossFolds, type PlayAcross } from "./usePlayAcrossFolds";
import type { ChildAuditSlot, ReplayController, RetainedReplaySlot, TransitionsSlot } from "./useReplay";
import { iso } from "./utcMinute";

/* --------------------------------------------------------------- verbatim */

export const CANDLE_SUBTITLE =
  "The run's own candles, one bar at a time. A marker is a target transition QuantBT settled at the bar close; this route emits no order, fill or trade record, so none is drawn.";

export const CLOSE_TARGET_NOTICE = (orders: number | null, fills: number | null, trades: number | null) =>
  `close_target_v2 — the route this run executed. Accounting happens at the close only: QuantBT emitted ${count(orders)} orders, ${count(fills)} fills and ${count(trades)} trades for this run. Markers are target transitions, not audited fills. The trade anatomy below says so instead of inventing links.`;

export const REVEAL_NOTE =
  "Causal reveal hides bars, transitions and outcomes after the cursor — a prefix cut of the retained bars, never a re-run. It changes no revision or digest.";

export const REVEAL_HIDDEN = "hidden by causal reveal";

function count(value: number | null): string {
  return value === null ? "an unpublished number of" : String(value);
}

function words(value: string): string {
  return value.toLowerCase().replace(/_/g, " ");
}

/* ------------------------------------------------------------------ parts */

function Exact({ value, unit }: { value: string | null | undefined; unit: "currency" | "fraction" | "count" | null }) {
  if (value === null || value === undefined) return <em>not published</em>;
  const shown = formatMetric(value, unit) ?? value;
  return (
    <span title={value} data-exact={value}>
      {shown.replace(/^-/, "−")}
    </span>
  );
}

function Card({ title, aside, children, ...rest }: { title: string; aside?: ReactNode; children: ReactNode } & Record<string, unknown>) {
  return (
    <section
      className="flex min-w-0 flex-col gap-2 rounded-[8px] border px-4 py-3"
      style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
      aria-label={title}
      {...rest}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        {/* h2 under the page's h1 (axe heading-order). */}
        <h2 className="mono text-[10px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

type Fact = CurrentSourceReplay["route_capabilities"]["orders"];

/** One route fact: its state in words and the server's reason code (a sentence in the title). */
function FactLine({ label, fact, name }: { label: string; fact: Fact; name: string }) {
  const code = fact.reason_code ?? fact.availability.reason_code;
  return (
    <span className="flex flex-wrap items-baseline gap-1.5" data-capability={name} data-capability-state={fact.state} data-capability-lane="retained">
      <span className="mono text-[9px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
        {label}
      </span>
      <span className="mono text-[10px] italic" style={{ color: "var(--ink-faint)" }}>
        {REPLAY_GAP_WORDS[fact.state]}
      </span>
      {code ? (
        <span className="mono break-all text-[9px]" style={{ color: "var(--ink-faint)" }} data-reason-code={code} title={reasonCodeSentence(code) ?? undefined}>
          {code}
        </span>
      ) : null}
    </span>
  );
}

/* ------------------------------------------------------ the candle chart */

type Lib = typeof import("lightweight-charts");
let libPromise: Promise<Lib> | null = null;
const loadLib = () => (libPromise ??= import("lightweight-charts"));

const sec = (ms: number) => Math.floor(ms / 1000) as import("lightweight-charts").UTCTimestamp;

/**
 * A flat series (equity that did not move over a window) must not autoscale to
 * a ±50% band that suggests a swing: pad it by a hair of its own level.
 */
export function paddedRange(values: readonly number[]): { min: number; max: number } | null {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) return null;
  const lo = Math.min(...finite);
  const hi = Math.max(...finite);
  const pad = hi > lo ? (hi - lo) * 0.08 : Math.max(Math.abs(lo) * 0.0005, 1e-9);
  /* Snap outward to a readable step so the axis ends on round numbers. */
  const step = 10 ** Math.floor(Math.log10(pad * 2));
  return { min: Math.floor((lo - pad) / step) * step, max: Math.ceil((hi + pad) / step) * step };
}

export interface CandleMarker {
  ordinal: number;
  at: number;
  side: "LONG" | "SHORT" | "FLAT";
  kind: "ENTRY" | "EXIT" | "FLIP" | "RESIZE";
}

/** Transitions in the loaded window, from each bar's own block — never guessed from price. */
export function windowMarkers(rows: readonly CurrentSourceObservation[]): CandleMarker[] {
  const markers: CandleMarker[] = [];
  for (const row of rows) {
    const bar = row.bar;
    if (!bar || !bar.transition) continue;
    const after = Number(row.accepted_position);
    const before = bar.position_before === null ? 0 : Number(bar.position_before);
    const side = after > 0 ? "LONG" : after < 0 ? "SHORT" : "FLAT";
    const kind = before === 0 ? "ENTRY" : after === 0 ? "EXIT" : Math.sign(before) !== Math.sign(after) ? "FLIP" : "RESIZE";
    markers.push({ ordinal: row.source_ordinal, at: row.at_utc_ms, side, kind });
  }
  return markers;
}

function CandleChart({
  rows,
  transport,
  reveal,
}: {
  rows: readonly CurrentSourceObservation[];
  transport: ReplayTransport;
  reveal: boolean;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const chart = useRef<{
    api: import("lightweight-charts").IChartApi;
    candles: import("lightweight-charts").ISeriesApi<"Candlestick">;
    position: import("lightweight-charts").ISeriesApi<"Line">;
    equity: import("lightweight-charts").ISeriesApi<"Line">;
    markers: import("lightweight-charts").ISeriesMarkersPluginApi<import("lightweight-charts").Time> | null;
  } | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const fitted = useRef<readonly CurrentSourceObservation[] | null>(null);
  const revealed = useRef(false);
  const { index } = useTransport(transport);
  const markers = useMemo(() => windowMarkers(rows), [rows]);
  const cut = reveal ? index + 1 : rows.length;

  useEffect(() => {
    let disposed = false;
    loadLib()
      .then((lib) => {
        const element = host.current;
        if (disposed || !element) return;
        const pal = paletteNow();
        const api = lib.createChart(element, {
          autoSize: true,
          layout: {
            background: { type: lib.ColorType.Solid, color: pal.paperRaised },
            textColor: pal.inkFaint,
            fontSize: 10,
            panes: { separatorColor: pal.lineSoft },
            attributionLogo: false,
          },
          grid: { vertLines: { color: pal.lineSoft }, horzLines: { color: pal.lineSoft } },
          timeScale: { timeVisible: true, borderColor: pal.lineSoft },
          rightPriceScale: { borderColor: pal.lineSoft },
        });
        const candles = api.addSeries(lib.CandlestickSeries, {
          upColor: pal.good, downColor: pal.bad, borderUpColor: pal.good, borderDownColor: pal.bad,
          wickUpColor: pal.good, wickDownColor: pal.bad,
        });
        const flatAware = (values: () => number[]) => () => {
          const range = paddedRange(values());
          return range ? { priceRange: { minValue: range.min, maxValue: range.max } } : null;
        };
        const position = api.addSeries(lib.LineSeries, { color: pal.accent, lineWidth: 1, lineType: lib.LineType.WithSteps, priceLineVisible: false, lastValueVisible: false }, 1);
        const equity = api.addSeries(lib.LineSeries, { color: pal.ink, lineWidth: 1, priceLineVisible: false, lastValueVisible: false }, 2);
        equity.applyOptions({ autoscaleInfoProvider: flatAware(() => equity.data().map((point) => (point as { value: number }).value)) });
        position.applyOptions({ autoscaleInfoProvider: flatAware(() => position.data().map((point) => (point as { value: number }).value)) });
        try {
          const panes = api.panes();
          panes[0]?.setHeight(260);
          panes[1]?.setHeight(56);
          panes[2]?.setHeight(80);
        } catch {
          /* pane sizing is cosmetic */
        }
        chart.current = { api, candles, position, equity, markers: lib.createSeriesMarkers ? lib.createSeriesMarkers(candles, []) : null };
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

  /* Data changes with the window and, under reveal, with the cursor. */
  useEffect(() => {
    const c = chart.current;
    if (status !== "ready" || !c) return;
    const shown = rows.slice(0, cut).filter((row) => row.bar?.candle);
    c.candles.setData(shown.map((row) => ({
      time: sec(row.at_utc_ms),
      open: Number(row.bar!.candle!.open),
      high: Number(row.bar!.candle!.high),
      low: Number(row.bar!.candle!.low),
      close: Number(row.bar!.candle!.close),
    })));
    c.position.setData(rows.slice(0, cut).map((row) => ({ time: sec(row.at_utc_ms), value: Number(row.accepted_position) })));
    c.equity.setData(rows.slice(0, cut).map((row) => ({ time: sec(row.at_utc_ms), value: Number(row.equity) })));
    if (fitted.current !== rows) {
      /* A new window opens on the whole window; the playhead then scrolls it. */
      fitted.current = rows;
      c.api.timeScale().fitContent();
    }
    if (reveal !== revealed.current) {
      /* E2b (audit 8.15): cutting the data must not rescale the axis to the bars that are
         left — the window keeps its width and the future stays blank. */
      revealed.current = reveal;
      c.api.timeScale().setVisibleLogicalRange({ from: -1, to: rows.length });
    }
    const pal = paletteNow();
    c.markers?.setMarkers(markers.filter((marker) => rows.findIndex((row) => row.source_ordinal === marker.ordinal) < cut).map((marker) => ({
      time: sec(marker.at),
      position: marker.side === "LONG" || (marker.kind === "EXIT" && marker.side === "FLAT") ? "belowBar" : "aboveBar",
      shape: marker.side === "LONG" ? "arrowUp" : marker.side === "SHORT" ? "arrowDown" : "circle",
      color: marker.side === "LONG" ? pal.good : marker.side === "SHORT" ? pal.bad : pal.inkFaint,
      text: marker.kind === "EXIT" ? "T·exit" : "T",
    })));
  }, [rows, cut, markers, status, reveal]);

  /* The playhead: crosshair on the bar, and the visible range follows it. */
  useEffect(() => {
    const c = chart.current;
    const row = rows[index];
    if (status !== "ready" || !c || !row) return;
    try {
      if (row.bar?.candle) c.api.setCrosshairPosition(Number(row.bar.candle.close), sec(row.at_utc_ms), c.candles);
      const range = c.api.timeScale().getVisibleLogicalRange();
      if (range && (index < range.from || index > range.to)) {
        /* Slide, never rescale: keep the reader's zoom and put the playhead at 70%. */
        const span = range.to - range.from;
        const from = Math.max(-2, index - span * 0.7);
        c.api.timeScale().setVisibleLogicalRange({ from, to: from + span });
      }
    } catch {
      /* the crosshair is a convenience */
    }
  }, [index, rows, status]);

  return (
    <div className="relative" data-chart="replay-candles" data-chart-status={status}>
      <div ref={host} style={{ height: 420 }} aria-hidden="true" />
      {status !== "ready" ? (
        <span className="mono absolute left-3 top-3 text-[10px] italic" style={{ color: "var(--ink-faint)" }}>
          {status === "loading" ? "drawing candles…" : "the chart could not be drawn here; the table below carries every bar"}
        </span>
      ) : null}
      <span className="mono pointer-events-none absolute left-3 top-1 text-[9px]" style={{ color: "var(--ink-faint)" }}>
        candles · position (units) · equity — {rows.length} bars in this window
      </span>
      {/* A table ignores width/overflow, so the visually-hidden box is a wrapper. */}
      <div className="sr-only">
      <table data-chart-table="replay-candles">
        <caption>Retained bars in this window: time, open, high, low, close, accepted position and equity, exact values</caption>
        <tbody>
          {rows.slice(0, cut).map((row) => (
            <tr key={row.source_ordinal} data-candle-row={row.source_ordinal}>
              <th scope="row">{new Date(row.at_utc_ms).toISOString()}</th>
              <td>{row.bar?.candle?.open ?? "not published"}</td>
              <td>{row.bar?.candle?.high ?? "not published"}</td>
              <td>{row.bar?.candle?.low ?? "not published"}</td>
              <td>{row.bar?.candle?.close ?? "not published"}</td>
              <td>{row.accepted_position}</td>
              <td>{row.equity}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <ul className="sr-only" data-marker-list>
        {markers.filter((marker) => rows.findIndex((row) => row.source_ordinal === marker.ordinal) < cut).map((marker) => (
          <li key={marker.ordinal} data-marker={marker.ordinal} data-marker-kind={marker.kind} data-marker-side={marker.side}>
            target transition {words(marker.kind)} to {words(marker.side)} at {iso(marker.at)}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------------------------------------------- stitched fold strip */

function FoldStrip({
  replay,
  activeFold,
  onFold,
  disabled,
  reveal,
  cutOrdinal = null,
}: {
  replay: CurrentSourceReplay;
  activeFold: string | null;
  onFold: (segment: FoldSegment) => void;
  disabled: boolean;
  /** Under causal reveal, the cursor's source ordinal; nothing after it is drawn. */
  cutOrdinal?: number | null;
  reveal: boolean;
}) {
  const activeAt = replay.execution.fold_capital.segments.findIndex((segment) => segment.fold_id === activeFold);
  const capital = replay.execution.fold_capital;
  const overview = replay.execution.candle_overview;
  /* S08 T17: past a dozen folds the strip is one scrolling, snapping row
     (spec 08 §2.2) that keeps the active fold in view; fewer folds wrap. */
  const scrolls = capital.segments.length > 12;
  const strip = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!scrolls || activeFold === null) return;
    const button = strip.current?.querySelector<HTMLElement>(`[data-fold="${activeFold}"]`);
    button?.scrollIntoView?.({ block: "nearest", inline: "center" });
  }, [activeFold, scrolls]);
  return (
    <div className="flex min-w-0 flex-col gap-1.5" data-fold-strip={capital.segments.length} data-fold-strip-mode={scrolls ? "scroll" : "wrap"}>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <span className="mono text-[9.5px] uppercase tracking-[.1em]" style={{ color: "var(--ink-faint)" }}>
          stitched account{scrolls ? ` · ${capital.segments.length} folds` : ""}
        </span>
        <div
          ref={strip}
          className={scrolls ? "order-last flex w-full min-w-0 basis-full snap-x items-center gap-1.5 overflow-x-auto pb-1" : "contents"}
          {...(scrolls ? { tabIndex: 0, role: "region", "aria-label": "folds of the stitched account", "data-fold-scroller": "" } : {})}
        >
        {capital.segments.map((segment, position) => {
          const current = segment.fold_id === activeFold;
          const ret = Number(segment.end_equity) / Number(segment.start_equity) - 1;
          return (
            <span key={segment.fold_id} className={`flex items-center gap-1.5${scrolls ? " flex-none snap-start" : ""}`}>
              {position > 0 ? (
                <span
                  className="mono text-[10px]"
                  style={{ color: "var(--ink-faint)" }}
                  data-fold-boundary={capital.equity_continuity}
                  title={
                    capital.equity_continuity === "CONTINUOUS_ACROSS_FOLDS"
                      ? `${capital.policy} — one stitched account: fold ${segment.fold_id} starts at fold ${capital.segments[position - 1]!.fold_id}'s end equity and carries its position`
                      : capital.equity_continuity === "RESET_PER_FOLD"
                        ? `${capital.policy} — each fold is its own account; the folds are not compounded`
                        : "the source did not publish how capital crosses this boundary"
                  }
                >
                  ⇄
                </span>
              ) : null}
              <button
                type="button"
                className="mono rounded-[4px] border px-2 text-[10px] leading-[22px]"
                style={{
                  borderColor: current ? "var(--accent)" : "var(--line)",
                  background: current ? "var(--paper-sunken)" : "var(--paper-raised)",
                  color: current ? "var(--accent)" : "var(--ink-soft)",
                }}
                aria-pressed={current}
                data-fold={segment.fold_id}
                disabled={disabled}
                onClick={() => onFold(segment)}
                title={reveal && position >= activeAt ? `fold ${segment.fold_id}: ${segment.bars} bars` : `fold ${segment.fold_id}: ${segment.bars} bars, ${segment.transitions} transitions, equity ${segment.start_equity} → ${segment.end_equity}`}
              >
                {foldLabel(segment.fold_id)} · {segment.bars} bars ·{" "}
                {reveal && position >= activeAt ? (
                  <em data-reveal-hidden>{REVEAL_HIDDEN}</em>
                ) : (
                  <span style={{ color: ret < 0 ? "var(--bad)" : ret > 0 ? "var(--good)" : undefined }}>
                    {formatMetric(ret, "fraction")?.replace(/^-/, "−")}
                  </span>
                )}
              </button>
            </span>
          );
        })}
        </div>
        <span className="mono text-[9px]" style={{ color: "var(--ink-faint)" }} data-fold-capital={capital.policy ?? ""}>
          capital {capital.policy ?? "not published"} · {words(capital.equity_continuity)}
          {capital.account_execution ? ` · ${words(capital.account_execution)}` : ""}
        </span>
      </div>
      {overview ? <OverviewStrip replay={replay} activeFold={activeFold} cutOrdinal={cutOrdinal} /> : null}
    </div>
  );
}

/** The whole run as extrema-keeping OHLC buckets, with the fold windows shaded. */
function OverviewStrip({ replay, activeFold, cutOrdinal }: { replay: CurrentSourceReplay; activeFold: string | null; cutOrdinal: number | null }) {
  return (
    <CandleOverviewStrip
      overview={replay.execution.candle_overview!}
      segments={replay.execution.fold_capital.segments.map((segment) => ({
        key: segment.fold_id,
        first_ordinal: segment.first_ordinal,
        last_ordinal: segment.last_ordinal,
        active: segment.fold_id === activeFold,
      }))}
      cutOrdinal={cutOrdinal}
      scope="whole run"
      shading="shaded = OOS fold windows"
      label="whole-run price range with the fold windows"
    />
  );
}

/**
 * E16-R1 · the one OHLC overview drawing both lanes use.
 *
 * The retained WFO lane shades its fold windows over it; the P04 hub lane has
 * no folds on this read and draws the same buckets without shading. Keeping
 * one component keeps one caption vocabulary, so a reader who learns to read
 * the strip on one lane can read it on the other.
 *
 * The caption always says it is a downsample and always names the bucket size:
 * a strip that looked like every bar when it is one line per 61 bars would be
 * the dishonest part, not the downsample itself.
 */
export type CandleOverviewBucket = {
  first_ordinal: number;
  last_ordinal: number;
  open: string;
  high: string;
  low: string;
  close: string;
};

export type CandleOverviewFacts = {
  source_bar_count: number;
  emitted_bucket_count: number;
  bucket_bars: number;
  sampling: "FULL" | "OHLC_BUCKET_V1";
  envelope: { max_high: string; min_low: string };
  values: readonly CandleOverviewBucket[];
};

export function CandleOverviewStrip({
  overview,
  segments = [],
  cutOrdinal = null,
  scope,
  shading,
  label,
}: {
  overview: CandleOverviewFacts;
  segments?: readonly { key: string; first_ordinal: number; last_ordinal: number; active: boolean }[];
  cutOrdinal?: number | null;
  scope: string;
  shading?: string;
  label: string;
}) {
  // A multi-bar bucket is known only after its last bar. Neither a wick,
  // colour, autoscale bound nor caption may reveal its future suffix.
  const visible = overview.values.filter((bucket) => cutOrdinal === null || bucket.last_ordinal <= cutOrdinal);
  const highBucket = visible.reduce<CandleOverviewBucket | null>((best, bucket) =>
    best === null || Number(bucket.high) > Number(best.high) ? bucket : best, null);
  const lowBucket = visible.reduce<CandleOverviewBucket | null>((best, bucket) =>
    best === null || Number(bucket.low) < Number(best.low) ? bucket : best, null);
  const high = cutOrdinal === null ? overview.envelope.max_high : highBucket?.high ?? null;
  const low = cutOrdinal === null ? overview.envelope.min_low : lowBucket?.low ?? null;
  const hi = high === null ? 0 : Number(high);
  const lo = low === null ? 0 : Number(low);
  const n = overview.source_bar_count;
  const y = (value: number) => (hi === lo ? 12 : 22 - ((value - lo) / (hi - lo)) * 20);
  const x = (ordinal: number) => (ordinal / Math.max(1, n - 1)) * 100;
  return (
    <div className="flex flex-col gap-0.5" data-overview={overview.sampling}>
      <svg viewBox="0 0 100 24" preserveAspectRatio="none" className="h-[34px] w-full" role="img" aria-label={label}>
        {segments.map((segment) => (
          <rect
            key={segment.key}
            x={x(segment.first_ordinal)}
            y={0}
            width={Math.max(0.3, x(segment.last_ordinal) - x(segment.first_ordinal))}
            height={24}
            fill={segment.active ? "var(--role-oos)" : "var(--line-soft)"}
            opacity={segment.active ? 0.22 : 0.5}
          />
        ))}
        {/* E2b (audit 8.15): under causal reveal the whole-run strip shows no candle past the cursor either. */}
        {visible.map((bucket) => (
          <line
            key={bucket.first_ordinal}
            x1={x((bucket.first_ordinal + bucket.last_ordinal) / 2)}
            x2={x((bucket.first_ordinal + bucket.last_ordinal) / 2)}
            y1={y(Number(bucket.high))}
            y2={y(Number(bucket.low))}
            stroke={Number(bucket.close) >= Number(bucket.open) ? "var(--good)" : "var(--bad)"}
            strokeWidth={1.4}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      <span className="mono text-[9px]" style={{ color: "var(--ink-faint)" }} data-overview-caption>
        {scope} · {n.toLocaleString("en-US")} bars
        {overview.sampling === "FULL"
          ? " · every bar"
          : ` in ${overview.emitted_bucket_count} candles of ${overview.bucket_bars} bars — each high/low is the true extreme of its bars`}
        {high !== null && low !== null
          ? ` · ${cutOrdinal === null ? "range" : "revealed range"} ${low} – ${high}`
          : " · range withheld — no complete bucket at cursor"}
        {shading ? ` · ${shading}` : ""}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------- transport */

function Transport({
  transport,
  rows,
  onFoldStep,
  onTransitionStep,
  canFold,
  acrossControl,
}: {
  transport: ReplayTransport;
  rows: readonly CurrentSourceObservation[];
  onFoldStep: (direction: -1 | 1) => void;
  onTransitionStep: (direction: -1 | 1) => void;
  canFold: { previous: boolean; next: boolean };
  /** D7 (8.10): the HiFi puts "play across folds" in the transport row, between the speeds and the seek bar. */
  acrossControl?: ReactNode;
}) {
  const snap = useTransport(transport);
  const row = rows[snap.index];
  const disabled = rows.length < 2;
  const stepReason = disabled ? "This fold window holds fewer than two bars, so there is nothing to step through." : undefined;
  const button = "mono rounded-[4px] border px-2 text-[11px] leading-[24px]";
  const style = { borderColor: "var(--line)", background: "var(--paper-raised)", color: "var(--ink-soft)" };
  const readout = row ? `bar ${snap.index + 1}/${rows.length} · source bar ${row.source_ordinal + 1} · ${iso(row.at_utc_ms)}` : "no bar";
  return (
    <div className="flex flex-wrap items-center gap-2 border-t pt-2" style={{ borderColor: "var(--line-soft)" }} data-transport data-playing={String(snap.playing)}>
      <span className="flex gap-1">
        <button type="button" className={button} style={style} aria-label="previous fold" disabled={!canFold.previous} title={canFold.previous ? undefined : "Already on the first fold of this run."} onClick={() => onFoldStep(-1)}>|◀</button>
        <button type="button" className={button} style={style} aria-label="previous transition" disabled={disabled} title={stepReason} onClick={() => onTransitionStep(-1)}>◀◀</button>
        <button type="button" className={button} style={style} aria-label="step back" disabled={disabled} title={stepReason} onClick={() => transport.step(-1)}>◀</button>
        <button
          type="button"
          className={button}
          style={{ ...style, borderColor: "var(--accent)", color: "var(--accent)", background: snap.playing ? "var(--paper-sunken)" : style.background }}
          aria-label={snap.playing ? "pause" : "play"}
          aria-pressed={snap.playing}
          data-action="play"
          disabled={disabled}
          title={stepReason}
          onClick={() => transport.toggle()}
        >
          {snap.playing ? "❚❚" : "▶"}
        </button>
        <button type="button" className={button} style={style} aria-label="step forward" disabled={disabled} title={stepReason} onClick={() => transport.step(1)}>▶</button>
        <button type="button" className={button} style={style} aria-label="next transition" disabled={disabled} title={stepReason} onClick={() => onTransitionStep(1)}>▶▶</button>
        <button type="button" className={button} style={style} aria-label="next fold" disabled={!canFold.next} title={canFold.next ? undefined : "Already on the last fold of this run."} onClick={() => onFoldStep(1)}>▶|</button>
      </span>
      <span className="flex gap-1" role="group" aria-label="speed">
        {SPEEDS.map((speed) => (
          <button
            key={speed}
            type="button"
            className={button}
            aria-pressed={snap.speed === speed}
            data-speed={speed}
            style={snap.speed === speed ? { ...style, borderColor: "var(--accent)", color: "var(--accent)", background: "var(--paper-sunken)" } : style}
            onClick={() => transport.setSpeed(speed)}
          >
            {speed}×
          </button>
        ))}
      </span>
      {acrossControl}
      <input
        type="range"
        className="min-w-[140px] flex-1"
        style={{ accentColor: "var(--accent)" }}
        min={0}
        max={Math.max(0, rows.length - 1)}
        value={snap.index}
        disabled={rows.length === 0}
        title={rows.length === 0 ? "No bar is loaded for this fold window yet." : undefined}
        aria-label="seek within the loaded fold window"
        aria-valuetext={row ? `bar ${snap.index + 1} of ${rows.length}` : "no bar"}
        data-seek
        onChange={(event) => transport.seek(Number(event.target.value))}
      />
      <span className="mono whitespace-nowrap text-[10px]" style={{ color: "var(--ink-soft)" }} data-readout>
        {readout}
      </span>
      {snap.pausedHidden ? (
        <span className="mono rounded-[3px] border px-[5px] text-[10px]" style={{ color: "var(--warn)", borderColor: "var(--warn)" }} data-paused-hidden>
          paused (tab hidden)
        </span>
      ) : null}
    </div>
  );
}

/**
 * D7 (HiFi 8.10): "play across folds". The HiFi pill is `padding:3px 10px;
 * font:10.5px JetBrains Mono; border-radius:3px; flex:none`, active = accent
 * border on the sunken paper (the speed pills' own active state), and it sits
 * between the speed group and the seek bar. Its label is longer than the HiFi's
 * bare `· ON` on purpose: the switch issues reads, and this screen says so
 * before the reader turns it on. The state is colour and the word ON / off, and
 * is exposed as a real switch (name = the visible label, state = aria-checked).
 */
function AcrossSwitch({ across }: { across: PlayAcross }) {
  const help = useId();
  const on = across.enabled;
  const reason = across.unavailable;
  return (
    <>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-describedby={help}
        disabled={reason !== null}
        className="mono flex-none rounded-[3px] border"
        style={{
          padding: "3px 10px",
          fontSize: "10.5px",
          lineHeight: "18px",
          borderColor: on ? "var(--accent)" : "var(--line)",
          background: on ? "var(--paper-sunken)" : "var(--paper-raised)",
          color: on ? "var(--accent)" : "var(--ink-soft)",
        }}
        title={reason ?? ACROSS_HELP}
        data-action="play-across-folds"
        data-across={on ? "on" : "off"}
        onClick={() => across.setEnabled(!on)}
      >
        {ACROSS_LABEL}
        <span aria-hidden="true"> · {on ? "ON" : "off"}</span>
      </button>
      <span id={help} className="sr-only">
        {reason ?? ACROSS_HELP}
      </span>
    </>
  );
}

/** What the switch just did, or why it stopped — one line, in the screen's own words. */
function AcrossNotice({ across }: { across: PlayAcross }) {
  const { status } = across;
  if (status.kind === "idle") return null;
  return (
    <p
      className="mono text-[10px]"
      role="status"
      style={{ color: status.tone === "warn" ? "var(--warn)" : "var(--ink-soft)" }}
      data-across-status={status.kind}
      data-across-reads={across.reads}
    >
      {status.text}
    </p>
  );
}

/** The playhead's own bar and checkpoint — the state a sequential replay reaches here. */
function PlayheadState({ transport, rows, reveal, totals }: {
  transport: ReplayTransport;
  rows: readonly CurrentSourceObservation[];
  reveal: boolean;
  totals: CurrentSourceReplay["execution"]["totals"];
}) {
  const { index } = useTransport(transport);
  const row = rows[index];
  if (!row) return null;
  const bar = row.bar;
  const cell = "mr-5 whitespace-nowrap";
  return (
    <div
      className="mono flex flex-wrap items-baseline gap-y-1 rounded-[6px] border px-3 py-1.5 text-[10px]"
      style={{ borderColor: "var(--line-soft)", background: "var(--paper-sunken)", color: "var(--ink-soft)" }}
      data-playhead-readout={row.source_ordinal}
    >
      <span className={cell}>t <b>{iso(row.at_utc_ms)}</b></span>
      <span className={cell}>fold <b>{bar?.fold_id ?? "in-sample (no fold)"}</b></span>
      <span className={cell} data-readout-position>position <b><Exact value={row.accepted_position} unit={null} /></b></span>
      <span className={cell}>equity <b><Exact value={row.equity} unit="currency" /></b></span>
      <span className={cell}>fees to here <b><Exact value={bar?.checkpoint.cumulative_fee} unit="currency" /></b></span>
      <span className={cell} data-readout-transitions>transitions to here <b>{bar ? bar.checkpoint.transition_count : "not published"}</b></span>
      <span className={cell} data-readout-full-run={reveal ? "hidden" : "shown"}>
        full-run fees{" "}
        {reveal ? <em data-reveal-hidden>{REVEAL_HIDDEN}</em> : <b><Exact value={totals.fee} unit="currency" /></b>}
      </span>
      <span className="italic" style={{ color: "var(--ink-faint)" }} data-playhead-note>
        the account's own checkpoint at this bar — research model state, not a broker account
      </span>
    </div>
  );
}

/* ----------------------------------------------------- transition ledger */

function TransitionLedger({
  slot,
  rows,
  transport,
  reveal,
  onSeek,
  onPage,
}: {
  slot: TransitionsSlot;
  rows: readonly CurrentSourceObservation[];
  transport: ReplayTransport;
  reveal: boolean;
  onSeek: (row: TransitionRow) => void;
  onPage: (direction: "next" | "previous") => void;
}) {
  const { index } = useTransport(transport);
  const cursorAt = rows[index]?.at_utc_ms ?? null;
  if (slot.state !== "ready") {
    return (
      <p className="mono text-[10px] italic" style={{ color: "var(--ink-faint)" }} data-transitions={slot.state}>
        {slot.state === "refused" ? slot.message : "reading transitions…"}
      </p>
    );
  }
  const ledger = slot.ledger;
  return (
    <div className="flex flex-col gap-1" data-transitions="ready">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse">
          <thead>
            <tr className="mono text-left text-[9px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
              <th className="py-1 pr-3 font-normal">#</th>
              <th className="py-1 pr-3 font-normal">bar (UTC)</th>
              <th className="py-1 pr-3 font-normal">kind</th>
              <th className="py-1 pr-3 font-normal">position</th>
              <th className="py-1 pr-3 font-normal">close</th>
              <th className="py-1 pr-3 font-normal">notional</th>
              <th className="py-1 font-normal">fee</th>
            </tr>
          </thead>
          <tbody>
            {ledger.rows.map((row) => {
              const future = reveal && cursorAt !== null && row.at_utc_ms > cursorAt;
              const current = cursorAt === row.at_utc_ms;
              return (
                <tr
                  key={row.source_ordinal}
                  className="mono text-[10.5px]"
                  data-transition-row={row.source_ordinal}
                  data-transition-kind={row.kind}
                  data-play={String(current)}
                  data-revealed={future ? "hidden" : "shown"}
                  /* E2 (audit 8.14): the whole row selects; the number stays the keyboard target. */
                  onClick={() => onSeek(row)}
                  style={{ background: current ? "var(--paper-sunken)" : undefined, borderBottom: "1px solid var(--line-soft)", cursor: "pointer" }}
                >
                  <td className="py-[3px] pr-3">
                    <button type="button" className="mono underline-offset-2 hover:underline" onClick={(event) => { event.stopPropagation(); onSeek(row); }} title="move the cursor to this bar">
                      {row.transition_number}
                    </button>
                  </td>
                  {future ? null : (
                    <td className="whitespace-nowrap py-[3px] pr-3" title={`source bar ${row.source_ordinal + 1} · ${row.source_index_utc}`}>
                      {iso(row.at_utc_ms)}
                    </td>
                  )}
                  {future ? (
                    <td colSpan={6} className="py-[3px] italic" style={{ color: "var(--ink-faint)" }}>
                      {REVEAL_HIDDEN}
                    </td>
                  ) : (
                    <>
                      <td className="py-[3px] pr-3" style={{ color: row.side_after === "SHORT" ? "var(--bad)" : row.side_after === "LONG" ? "var(--good)" : "var(--ink-soft)" }}>
                        {words(row.kind)} → {words(row.side_after)}
                      </td>
                      <td className="whitespace-nowrap py-[3px] pr-3">
                        <Exact value={row.position_before} unit={null} /> → <Exact value={row.position_after} unit={null} />
                      </td>
                      <td className="py-[3px] pr-3"><Exact value={row.close} unit={null} /></td>
                      <td className="py-[3px] pr-3"><Exact value={row.turnover} unit="currency" /></td>
                      <td className="py-[3px]"><Exact value={row.fee} unit="currency" /></td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-ghost mono text-[10px]" disabled={!ledger.page.has_previous || slot.inFlight} title={slot.inFlight ? "A page of transitions is loading." : ledger.page.has_previous ? undefined : "This is the first page of transitions."} onClick={() => onPage("previous")} data-action="transitions-previous">
          ‹ earlier
        </button>
        <button type="button" className="btn-ghost mono text-[10px]" disabled={!ledger.page.has_more || slot.inFlight} title={slot.inFlight ? "A page of transitions is loading." : ledger.page.has_more ? undefined : "This is the last page of transitions."} onClick={() => onPage("next")} data-action="transitions-next">
          later ›
        </button>
        <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-transition-count>
          {ledger.rows.length} of {ledger.source_transition_count ?? "an unpublished number of"} transitions · {words(ledger.semantics)}
        </span>
      </div>
    </div>
  );
}

/** Trade anatomy on the close-target schema: every link the route has, and the ones it does not. */
/** The child strategy instance that generated a fold's replayed bars (QuantBT's own record). */
function generationOf(slot: ChildAuditSlot | undefined, fold: string | null): ChildAuditRecord | null {
  if (!slot || slot.state !== "ready" || fold === null || slot.fold !== fold) return null;
  return slot.audit.records.find((record) => record.context === "out-of-sample generation") ?? null;
}

const short = (value: string | null | undefined, n = 10) => (value ? `${value.slice(0, n)}…` : "not published");

/**
 * P17-T14 · QuantBT's strategy-isolation audit for the fold on screen: one row
 * per child strategy instance, with its original ids (row in QuantBT's table,
 * candidate id, seed). The row that generated the replayed bars is marked.
 */
function ChildAuditCard({
  replay,
  slot,
  fold,
  waiting = false,
}: {
  replay: CurrentSourceReplay;
  slot: ChildAuditSlot | undefined;
  fold: string | null;
  /** D7: play across folds is running, so this fold's audit is not asked for until playback rests. */
  waiting?: boolean;
}) {
  const summary = replay.execution.child_audit;
  const fact = replay.route_capabilities.child_audit;
  const loaded = slot && slot.state !== "idle" && slot.state !== "loading" && slot.fold === fold;
  return (
    <Card title="child audit — strategy isolation, per fold" data-panel="child-audit" aside={<FactLine label="child audit" fact={fact} name="child_audit" />}>
      {summary.state !== "AVAILABLE" ? (
        <p className="text-[11px]" style={{ color: "var(--ink-soft)" }}>This seal carries no child-audit records.</p>
      ) : fold === null ? (
        <p className="text-[11px]" style={{ color: "var(--ink-soft)" }}>The bars on screen are in-sample; child audit is read per OOS fold.</p>
      ) : waiting && !loaded ? (
        <p className="mono text-[10px] italic" style={{ color: "var(--ink-faint)" }} data-child-audit="waiting">
          fold {fold}'s child audit is read when playback rests — play across folds reads only windows.
        </p>
      ) : !slot || slot.state === "idle" || slot.state === "loading" || slot.fold !== fold ? (
        <p className="mono text-[10px] italic" style={{ color: "var(--ink-faint)" }} data-child-audit="loading">reading fold {fold}'s child audit…</p>
      ) : slot.state === "refused" ? (
        <p className="text-[11px]" style={{ color: "var(--ink-soft)" }} data-child-audit="refused">{slot.message}</p>
      ) : (
        <div className="flex flex-col gap-1" data-child-audit={slot.fold}>
          <p className="text-[11px] leading-[1.5]" style={{ color: "var(--ink-soft)" }}>
            Each row is a strategy instance QuantBT created for fold {slot.fold}, as QuantBT recorded it. The marked row generated
            the out-of-sample bars replayed above.
          </p>
          {/* Keyboard users can scroll this table sideways at narrow widths (axe scrollable-region-focusable). */}
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={`child audit records of fold ${slot.fold}`}>
            <table className="w-full min-w-[520px] border-collapse">
              <thead>
                <tr className="mono text-left text-[9px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
                  <th className="py-1 pr-3 font-normal">audit #</th>
                  <th className="py-1 pr-3 font-normal">context</th>
                  <th className="py-1 pr-3 font-normal">candidate</th>
                  <th className="py-1 pr-3 font-normal">seed</th>
                  <th className="py-1 pr-3 font-normal">isolation</th>
                  <th className="py-1 font-normal">window (UTC)</th>
                </tr>
              </thead>
              <tbody>
                {slot.audit.records.map((record) => {
                  const generation = record.context === "out-of-sample generation";
                  return (
                    <tr
                      key={record.audit_ordinal}
                      className="mono text-[10px]"
                      data-audit-row={record.audit_ordinal}
                      data-audit-generation={String(generation)}
                      style={{ background: generation ? "var(--paper-sunken)" : undefined, borderBottom: "1px solid var(--line-soft)" }}
                    >
                      <td className="py-[3px] pr-3">{record.audit_ordinal}</td>
                      <td className="py-[3px] pr-3" style={{ fontWeight: generation ? 600 : undefined }}>{record.context ?? "not published"}</td>
                      <td className="py-[3px] pr-3" title={record.candidate_id ?? undefined}>{short(record.candidate_id, 8)}</td>
                      <td className="py-[3px] pr-3">{record.seed ?? "not published"}</td>
                      <td className="py-[3px] pr-3">
                        {record.policy ?? "not published"}
                        {record.certified_isolation === true ? " · certified" : record.certified_isolation === false ? " · not certified" : ""}
                      </td>
                      <td className="whitespace-nowrap py-[3px]">
                        {record.test_start_utc_ms !== null ? iso(record.test_start_utc_ms) : "—"} → {record.test_end_utc_ms !== null ? iso(record.test_end_utc_ms) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-child-audit-caption>
            {slot.audit.records.length} of {slot.audit.source_record_count ?? "an unpublished number of"} records for this fold
            {slot.audit.truncated ? " (capped at 64)" : ""} · run total {summary.source_record_count ?? "—"} · policy {summary.policy ?? "not published"} ·
            dropped by QuantBT {summary.records_dropped_by_source ?? "not published"} · run fingerprint {short(summary.source_run_fingerprint, 12)}
          </span>
        </div>
      )}
    </Card>
  );
}

function Anatomy({ replay, selected, childAudit }: { replay: CurrentSourceReplay; selected: TransitionRow | null; childAudit?: ChildAuditSlot }) {
  const child = generationOf(childAudit, selected?.fold_id ?? null);
  const route = replay.execution.route;
  const counts = replay.execution.counts;
  const links: Array<{ key: string; value: ReactNode; na?: boolean }> = selected
    ? [
        { key: "signal", value: `bar ${iso(selected.at_utc_ms)} · evaluated at the ${words(route.signal_phase ?? "bar close")}` },
        {
          key: "order",
          na: true,
          value: `not_applicable — ${route.engine_id ?? "this route"} emits no order records (${counts.orders_published ?? "?"} published)`,
        },
        {
          key: "target",
          value: (
            <>
              position <Exact value={selected.position_before} unit={null} /> → <Exact value={selected.position_after} unit={null} /> {route.target_intent_kind ?? ""} committed at the close
            </>
          ),
        },
        {
          key: "fill",
          na: true,
          value: `not_applicable — accounting settles at the ${route.fill_price_policy ?? "close"} (${words(route.fill_phase ?? "same close")}); ${counts.fills_published ?? "?"} fill records`,
        },
        {
          key: "child",
          na: child === null,
          value: child
            ? `audit #${child.audit_ordinal} · ${child.context} · candidate ${short(child.candidate_id, 8)} · seed ${child.seed ?? "?"} · ${child.policy ?? "isolation not published"}${child.certified_isolation ? " certified" : ""}`
            : replay.execution.child_audit.state === "AVAILABLE"
              ? "reading this fold's child audit…"
              : `not published — ${replay.route_capabilities.child_audit.reason_code ?? "no child audit on this seal"}`,
        },
        {
          key: "account",
          value: (
            <>
              notional <Exact value={selected.turnover} unit="currency" /> at close <Exact value={selected.close} unit={null} /> · fee{" "}
              <Exact value={selected.fee} unit="currency" /> · equity <Exact value={selected.equity} unit="currency" />
            </>
          ),
        },
      ]
    : [];
  return (
    <Card title="trade anatomy — close-target schema, every link from the retained bar" data-panel="trade-anatomy">
      {selected ? (
        <div className="flex flex-col" data-anatomy={selected.source_ordinal}>
          {links.map((link) => (
            <span
              key={link.key}
              className="mono flex gap-2 border-b py-[3px] text-[10.5px]"
              style={{ borderColor: "var(--line-soft)", color: link.na ? "var(--ink-faint)" : "var(--ink)", fontStyle: link.na ? "italic" : undefined }}
              data-link={link.key}
              data-na={String(Boolean(link.na))}
            >
              <span className="w-[64px] flex-none" style={{ color: "var(--ink-faint)" }}>{link.key}</span>
              <span className="min-w-0">{link.value}</span>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-[11px]" style={{ color: "var(--ink-soft)" }}>
          Pick a transition in the ledger to read its links.
        </p>
      )}
    </Card>
  );
}

/** Per-bar fee in the loaded window, and the full run's totals (labelled retrospective). */
function CostTimeline({ rows, replay, reveal, transport }: {
  rows: readonly CurrentSourceObservation[];
  replay: CurrentSourceReplay;
  reveal: boolean;
  transport: ReplayTransport;
}) {
  const { index } = useTransport(transport);
  const cut = reveal ? index + 1 : rows.length;
  const charged = rows.slice(0, cut).filter((row) => row.bar?.fee && Number(row.bar.fee) !== 0);
  const windowFee = charged.reduce((sum, row) => sum + Number(row.bar!.fee), 0);
  const totals = replay.execution.totals;
  const funding = replay.route_capabilities.funding;
  return (
    <Card title="cost timeline" data-panel="cost-timeline" aside={<FactLine label="fees" fact={replay.route_capabilities.fees} name="fees" />}>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px]">
        <span className="mono" data-cost-window>
          this window{reveal ? " to the cursor" : ""}: {charged.length} charged bars · fee <Exact value={String(windowFee)} unit="currency" />
        </span>
        <span className="mono" data-cost-total={reveal ? "hidden" : "shown"}>
          full run (retrospective): {reveal ? <em>{REVEAL_HIDDEN}</em> : (
            <>fee <Exact value={totals.fee} unit="currency" /> · notional <Exact value={totals.turnover} unit="currency" /></>
          )}
        </span>
        <FactLine label="funding" fact={funding} name="funding" />
      </div>
      <div className="flex h-[36px] items-end gap-px" aria-hidden="true">
        {rows.map((row, position) => {
          const fee = Number(row.bar?.fee ?? 0);
          return (
            <span
              key={row.source_ordinal}
              style={{
                flex: 1,
                height: fee > 0 ? "100%" : "2px",
                background: position >= cut ? "transparent" : fee > 0 ? "var(--warn)" : "var(--line-soft)",
              }}
            />
          );
        })}
      </div>
      <span className="text-[9.5px]" style={{ color: "var(--ink-faint)" }}>
        One column per bar in the window; a full column is a bar the account paid a fee on. Fee rate {replay.execution.route.fee_rate_oneway ?? "not published"} one way, slippage {replay.execution.route.slippage_bps ?? "not published"} bps.
      </span>
    </Card>
  );
}

/* ------------------------------------------------------------------ body */

export function hasBarLedger(replay: CurrentSourceReplay): boolean {
  const execution = (replay as { execution?: CurrentSourceReplay["execution"] }).execution;
  return execution?.state === "AVAILABLE" && replay.replay.rows.some((row) => row.bar?.candle);
}

export function CandleReplayBody({
  replay,
  slot,
  controller,
  transport,
  band,
}: {
  replay: CurrentSourceReplay;
  slot: Extract<RetainedReplaySlot, { state: "ready" }>;
  controller: ReplayController;
  transport: ReplayTransport;
  /** E2c (8.5): the run's own fold plan, for the IS / OOS / HOLDOUT band. */
  band: SplitBandSlot;
}) {
  const rows = replay.replay.rows;
  const execution = replay.execution;
  const segments = execution.fold_capital.segments;
  const selectedOrdinal = replay.replay.state_at_cursor.source_ordinal;
  const [reveal, setReveal] = useState(false);
  const [selected, setSelected] = useState<TransitionRow | null>(null);
  const inFlight = slot.inFlight === true;
  const snap = useTransport(transport);

  useEffect(() => {
    const at = selectedOrdinal === null ? 0 : rows.findIndex((row) => row.source_ordinal === selectedOrdinal);
    transport.load(rows.length, Math.max(0, at));
  }, [rows, selectedOrdinal, transport]);

  /* D7 (8.10). Declared right after the effect that loads a window into the
     transport: on a window's arrival the transport is loaded first, then play
     across folds decides whether to go on. */
  const across = usePlayAcrossFolds({ transport, controller, replay, slot });

  const playRow = rows[snap.index];
  const activeFold = playRow?.bar?.fold_id ?? rows.find((row) => row.bar?.fold_id)?.bar?.fold_id ?? null;
  /* P17-T14: one child-audit read per fold window, never per tick. While play
     across folds is running the read waits for playback to rest, so a boundary
     sends exactly one request — the window read the reader switched on. */
  const windowFold = rows.find((row) => row.bar?.fold_id)?.bar?.fold_id ?? null;
  const childAuditAvailable = execution.child_audit?.state === "AVAILABLE";
  const readChildAudit = controller.readChildAudit;
  const acrossRunning = across.running;
  useEffect(() => {
    if (!childAuditAvailable || windowFold === null || acrossRunning()) return;
    readChildAudit?.(windowFold);
  }, [childAuditAvailable, windowFold, readChildAudit, acrossRunning, across.holding]);
  const foldIndex = segments.findIndex((segment) => segment.fold_id === activeFold);

  const goFold = (segment: FoldSegment) => controller.retainedFold?.(segment);
  const foldStep = (direction: -1 | 1) => {
    const target = segments[(foldIndex === -1 ? 0 : foldIndex) + direction];
    if (target) goFold(target);
  };
  const transitionStep = (direction: -1 | 1) => {
    for (let at = snap.index + direction; at >= 0 && at < rows.length; at += direction) {
      if (rows[at]!.bar?.transition) {
        transport.seek(at);
        return;
      }
    }
    /* Beyond this window: the ledger holds the lane's own seek cursor. */
    const ledger = controller.transitions?.state === "ready" ? controller.transitions.ledger.rows : [];
    const here = playRow?.source_ordinal ?? 0;
    const target = direction > 0 ? ledger.find((row) => row.source_ordinal > here) : [...ledger].reverse().find((row) => row.source_ordinal < here);
    if (target) controller.retainedSeek?.(target.playback_cursor);
  };
  /* E2 (audit 8.14): the anatomy opens on a transition, as the HiFi does — the
     first one at or after the playhead — instead of an empty "pick one". */
  const ledgerRows = controller.transitions?.state === "ready" ? controller.transitions.ledger.rows : null;
  useEffect(() => {
    if (selected !== null || !ledgerRows || ledgerRows.length === 0) return;
    const here = rows[0]?.source_ordinal ?? 0;
    setSelected(ledgerRows.find((row) => row.source_ordinal >= here) ?? ledgerRows[0]!);
  }, [ledgerRows, rows, selected]);
  const seekTransition = (row: TransitionRow) => {
    setSelected(row);
    const at = rows.findIndex((candidate) => candidate.source_ordinal === row.source_ordinal);
    if (at >= 0) transport.seek(at);
    else controller.retainedSeek?.(row.playback_cursor);
  };

  const route = execution.route;
  const counts = execution.counts;
  const identity = controller.retainedContext?.identity;
  const progress = identity?.state === "ready" ? identity.identity.progress : null;
  const readiness = identity?.state === "ready" ? retainedReadiness(progress) : null;
  const claim = controller.retainedContext?.claim;
  const claimStrip = claim?.state === "ready" ? claim.claim : null;
  const provenance = replay.provenance;
  const window = rows.length > 0 ? `${rows[0]!.source_ordinal + 1}–${rows.at(-1)!.source_ordinal + 1}` : "—";
  const segment = foldIndex >= 0 ? segments[foldIndex]! : null;

  return (
    <>
      <ProvenanceStrip
        provenance={{
          source_adapter_id: provenance.source_adapter_id,
          engine_version: provenance.engine_version,
          source_transform_digest: provenance.source_transform_digest,
          requested_spec_digest: provenance.requested_spec_digest,
          effective_spec_digest: provenance.effective_spec_digest,
          dataset_binding_digest: provenance.dataset_binding_digest,
          manifest_digest: provenance.source_manifest_digest,
        }}
      />

      <Card
        title="execution contract"
        data-route-state="RETAINED_BAR_LEDGER"
        aside={
          <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-as-of>
            revision {replay.revision.slice(0, 26)}… · as of {iso(replay.as_of_utc_ms)}
          </span>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="mono rounded-[3px] border px-[5px] text-[10px] leading-[16px]" style={{ color: "var(--accent)", borderColor: "var(--accent)" }} data-route-id={progress?.run?.execution_route ?? ""}>
            {progress?.run?.execution_route ?? (identity?.state === "ready" ? "route — the progress read did not answer" : "route — reading…")}
          </span>
          <span className="mono text-[10px]" data-replay-contract={route.engine_id ?? ""}>
            → contract {route.engine_id ?? "not published"}
            {route.signal_phase ? ` · signal ${words(route.signal_phase)}` : ""}
            {route.fill_phase ? ` · fill ${words(route.fill_phase)}` : ""}
            {route.fill_price_policy ? ` @ ${route.fill_price_policy}` : ""}
            {route.accounting_certified === true ? " · accounting certified by QuantBT" : ""}
          </span>
          <span className="mono rounded-[3px] border px-[5px] text-[10px] leading-[16px]" style={{ borderColor: "var(--line)" }} data-readiness={readiness ?? ""}>
            {readiness ? `readiness ${words(readiness)}` : "readiness — reading…"}
          </span>
          <span className="mono ml-auto flex flex-wrap gap-3 text-[10px]" style={{ color: "var(--ink-soft)" }}>
            <span data-claim>claim <b style={{ color: "var(--warn)" }}>{claimStrip?.validation_claim.value ?? "—"}</b></span>
            <span>causality <b>{String(claimStrip?.causality_claim.value ?? "—")}</b></span>
          </span>
        </div>
        <p
          className="rounded-[4px] border-l-2 px-3 py-1.5 text-[11.5px] leading-[1.55]"
          style={{ borderColor: "var(--accent)", background: "var(--paper-sunken)", color: "var(--ink-soft)" }}
          data-route-note
        >
          <span className="mono mr-2 text-[9.5px] font-semibold uppercase tracking-[.1em]">route contract</span>
          {CLOSE_TARGET_NOTICE(counts.orders_published, counts.fills_published, counts.trades_published)}
        </p>
      </Card>

      <section
        className="flex flex-col gap-2 rounded-[8px] border px-4 py-3"
        style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
        aria-label="stitched account replay"
        data-replay-window="RETAINED_BARS"
        data-retained-in-flight={String(inFlight)}
      >
        <FoldStrip replay={replay} activeFold={activeFold} onFold={goFold} disabled={inFlight} reveal={reveal} cutOrdinal={reveal ? (playRow?.source_ordinal ?? null) : null} />
        {/* When play across folds asked for the read that was refused, its own notice under the
            transport carries this same sentence; it is said once, not twice. */}
        {slot.pageRefusal && across.status.refusal !== slot.pageRefusal ? (
          <p className="mono text-[10px]" role="status" style={{ color: "var(--warn)" }} data-page-refusal={slot.pageRefusal.code ?? slot.pageRefusal.status}>
            {pageRefusalWords(slot.pageRefusal)}
          </p>
        ) : null}
        {slot.recovered ? (
          <p className="mono text-[10px]" role="status" style={{ color: "var(--warn)" }} data-recovered>
            The replay position expired. It was discarded and the first window was read again once.
          </p>
        ) : null}
        {/*
          * E2c (8.5): the hi-fi's IS / OOS / HOLDOUT band. The windows come
          * from this run's own retained fold plan, so the shading is the
          * fold's published train and test spans and nothing else.
          */}
        <div className="flex flex-wrap items-center gap-3 border-y py-1.5" style={{ borderColor: "var(--line-soft)" }}>
          <span className="mono flex-none text-[9.5px] uppercase tracking-[.1em]" style={{ color: "var(--ink-faint)" }} data-band-fold>
            {segment ? foldLabel(segment.fold_id) : "in-sample bars (no fold)"}
          </span>
          {band.state === "ready" && band.folds ? (
            <SplitBand band={retainedSplitBand(band.folds, activeFold, claimStrip?.holdout ?? null)} />
          ) : (
            <SplitBandNote slot={band} />
          )}
          <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-counts>
            source bars {replay.replay.source_observation_count} · window {window} of {replay.replay.source_observation_count}
            {segment ? ` · fold bars ${segment.first_ordinal + 1}–${segment.last_ordinal + 1}` : ""}
          </span>
          <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }}>
            markers: T = target transition at the close (▼ short · ▲ long · ● flat)
          </span>
          <button
            type="button"
            className="mono ml-auto flex items-center gap-1.5 text-[10px]"
            aria-pressed={reveal}
            data-action="causal-reveal"
            title={REVEAL_NOTE}
            onClick={() => setReveal((value) => !value)}
          >
            <span
              className="inline-flex h-[11px] w-[11px] items-center justify-center border text-[9px]"
              style={{ borderColor: reveal ? "var(--accent)" : "var(--ink-faint)", color: "var(--accent)" }}
            >
              {reveal ? "×" : ""}
            </span>
            causal reveal
          </button>
        </div>
        {reveal ? (
          <p className="text-[10px]" style={{ color: "var(--ink-faint)" }} data-reveal-note>
            {REVEAL_NOTE}
          </p>
        ) : null}

        {rows.length > 0 ? <CandleChart rows={rows} transport={transport} reveal={reveal} /> : null}
        <Transport
          transport={transport}
          rows={rows}
          onFoldStep={foldStep}
          onTransitionStep={transitionStep}
          canFold={{ previous: !inFlight && foldIndex > 0, next: !inFlight && foldIndex < segments.length - 1 && segments.length > 0 }}
          acrossControl={<AcrossSwitch across={across} />}
        />
        <AcrossNotice across={across} />
        <PlayheadState transport={transport} rows={rows} reveal={reveal} totals={execution.totals} />
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-ghost mono text-[10px]" data-action="previous-window" disabled={!replay.replay.page.has_previous || inFlight} title={inFlight ? "A replay window is loading." : replay.replay.page.has_previous ? undefined : "This window starts at the fold's first bar."} onClick={() => controller.retainedPreviousWindow?.()}>
            ‹ previous window
          </button>
          <button type="button" className="btn-ghost mono text-[10px]" data-action="next-window" disabled={!replay.replay.page.has_more || inFlight} title={inFlight ? "A replay window is loading." : replay.replay.page.has_more ? undefined : "This window ends at the fold's last bar."} onClick={() => controller.retainedNextWindow?.()}>
            next window ›
          </button>
          <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-read-rule={across.enabled ? "across" : "asked"}>
            {across.enabled
              ? "play across folds is on: at the last bar of this window the screen reads the next window itself, one at a time and never past the last fold; a fold or a transition outside it is still read only when you ask."
              : "a fold, a window or a transition outside it is read only when you ask; playing stops at the end of this window."}
          </span>
        </div>
      </section>

      <div className="flex flex-wrap gap-2" data-verdict-tiles>
        {[
          { k: "orders · fills · trades", v: `${counts.orders_published ?? "—"} · ${counts.fills_published ?? "—"} · ${counts.trades_published ?? "—"}`, sub: "records QuantBT emitted on this route" },
          { k: "target transitions", v: reveal ? REVEAL_HIDDEN : String(counts.transitions ?? "—"), sub: "full run · retrospective", hidden: reveal },
          { k: "fees paid", v: reveal ? REVEAL_HIDDEN : (formatMetric(execution.totals.fee, "currency") ?? "not published"), sub: "full run · retrospective", hidden: reveal },
          { k: "rejected orders", v: String(counts.rejected_orders ?? "—"), sub: "engine diagnostics" },
          { k: "fold capital", v: execution.fold_capital.policy ?? "not published", sub: words(execution.fold_capital.equity_continuity) },
        ].map((tile) => (
          <div
            key={tile.k}
            className="flex min-w-[150px] flex-1 flex-col gap-0.5 rounded-[6px] border px-3 py-2"
            style={{ borderColor: "var(--line-soft)", background: "var(--paper-raised)" }}
            data-tile={tile.k}
          >
            <span className="text-[10px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>{tile.k}</span>
            <span className="mono text-[17px] font-semibold" style={{ fontStyle: tile.hidden ? "italic" : undefined, fontSize: tile.hidden ? 12 : undefined }}>{tile.v}</span>
            <span className="mono text-[9px]" style={{ color: "var(--ink-faint)" }}>{tile.sub}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-3">
          <Card
            title="target transition ledger"
            data-panel="event-ledger"
            aside={<FactLine label="events" fact={replay.route_capabilities.execution_events} name="execution_events" />}
          >
            <p className="text-[11px] leading-[1.5]" style={{ color: "var(--ink-soft)" }}>
              Each row is a bar where QuantBT changed the accepted position, with the account's own notional and fee. The
              numbers are original bar ordinals; a gap between them is bars without a transition, not missing data.
            </p>
            {controller.transitions ? (
              <TransitionLedger
                slot={controller.transitions}
                rows={rows}
                transport={transport}
                reveal={reveal}
                onSeek={seekTransition}
                onPage={(direction) => controller.transitionsPage?.(direction)}
              />
            ) : null}
          </Card>
          <Anatomy replay={replay} selected={selected} childAudit={controller.childAudit} />
          <ChildAuditCard replay={replay} slot={controller.childAudit} fold={windowFold} waiting={across.holding} />
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <Card title="trade blotter" data-absent-panel="trade-blotter">
            <p className="text-[11px] leading-[1.5]" style={{ color: "var(--ink-soft)" }}>
              QuantBT emitted {counts.trades_published ?? "no published number of"} trade records on this route. Pairing the
              transitions above into trades would be the screen's guess, so no blotter is drawn.
            </p>
            <FactLine label="trades" fact={replay.route_capabilities.trades} name="trades" />
          </Card>
          <Card title="MAE × MFE — pain vs potential per trade" data-absent-panel="mae-mfe">
            <p className="text-[11px] leading-[1.5]" style={{ color: "var(--ink-soft)" }}>Per-trade excursions need trade records; this route has none.</p>
            <FactLine label="MAE × MFE" fact={replay.route_capabilities.mae_mfe} name="mae_mfe" />
          </Card>
          <CostTimeline rows={rows} replay={replay} reveal={reveal} transport={transport} />
          <Card title="route-aware facts" data-panel="route-panel">
            <p className="text-[11px] leading-[1.5]" style={{ color: "var(--ink-soft)" }}>
              What close_target_v2 cannot produce, each with the run's own reason.
            </p>
            <div className="flex flex-col gap-1">
              <FactLine label="orders" fact={replay.route_capabilities.orders} name="orders" />
              <FactLine label="fills" fact={replay.route_capabilities.fills} name="fills" />
              <FactLine label="partial fills" fact={replay.route_capabilities.partial_fills} name="partial_fills" />
              <FactLine label="OCO" fact={replay.route_capabilities.oco} name="oco" />
              <FactLine label="SL/TP" fact={replay.route_capabilities.sl_tp} name="sl_tp" />
              <FactLine label="multi-leg" fact={replay.route_capabilities.multi_leg} name="multi_leg" />
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
