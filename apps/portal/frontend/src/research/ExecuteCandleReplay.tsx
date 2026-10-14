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

import { useEffect, useId, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { ResearchScopedLink as Link } from "./ResearchScopedLink";

import { paletteNow } from "../charts/theme";
import { smokeMotionAllowed } from "../execution/smokeMotion";
import { ProvenanceStrip } from "./ProvenanceStrip";
import { reasonCodeSentence } from "./researchRefusal";
import { foldLabel, foldShort, formatCount, formatMetric, formatUtc, typographicMinus } from "./researchFormat";
import { formatValue } from "./formatValue";
import { humanise } from "./humanise";
import type { CurrentSourceSplit } from "./splitClient";
import {
  REPLAY_GAP_WORDS,
  type CurrentSourceObservation,
  type CurrentSourceReplay,
  type FixedReplayObservation,
  type FoldSegment,
  type TransitionRow,
  type ChildAuditRecord,
} from "./replayClient";
import { ReplayTransport, SPEEDS, replayKeyDown, useTransport } from "./replayTransport";
import { CapabilityStrip, GlyphShape, MarkerLayer, MarkerLegend, type CandleMarker, type ChartHandles, type FoldBoundary } from "./ExecuteMarkers";
import { EXEC_WINDOWS, bucketsInSpan, ordinalAt, type ExecWindow, type OverviewBand } from "./executeWindows";
import { type EvidenceCursor } from "./evidenceCursor";
import { runScreenHref } from "./runScreenHref";
import { ChartLive, ChartSummary, useChartContract } from "./chartContract";
import type { ProgressRead } from "./progressClient";
import { retainedReadiness } from "./retainedLane";
import { SplitBandNote, retainedSplitBand, type SplitBandSlot } from "./SplitBand";
import { ACROSS_HELP, ACROSS_LABEL, pageRefusalWords, usePlayAcrossFolds, type PlayAcross } from "./usePlayAcrossFolds";
import { RETAINED_WINDOW_MAX, type ChildAuditSlot, type ReplayController, type RetainedReplaySlot, type TransitionsSlot } from "./useReplay";
import { ChildAuditCompanionPanel } from "./ChildAuditCompanionPanel";
import { iso } from "./utcMinute";

/* --------------------------------------------------------------- verbatim */

/*
 * QA S08 T-01: the route's one-line "close_target_v2 · … · 0 orders · 0 fills ·
 * 0 trades" is gone. The tile carries the counts (labelled as records the
 * source published) and the capability chips carry the typed absences; the line
 * duplicated the one and contradicted the other.
 */

export const REVEAL_NOTE = "Hides everything after the cursor — no re-run.";

export const REVEAL_HIDDEN = "hidden by causal reveal";

/** QA S08 UX-12: the short form for the repeated places (fold chips, later ledger rows). */
export const REVEAL_HIDDEN_SHORT = "hidden";

/** A served count, grouped; an unpublished one says so (never `0`, never a dash). */
/** A capability fact's reason as a tooltip: the sentence where one exists, the code always. */
function factTitle(fact: { reason_code?: string | null; availability: { reason_code: string | null } }): string {
  const code = factCode(fact);
  const sentence = reasonCodeSentence(code);
  return [sentence, code].filter(Boolean).join(" — ") || "not published";
}

function countCell(value: number | null): string {
  return formatCount(value) ?? "not published";
}

/** A route fact's served reason code (its own, else its availability's). */
function factCode(fact: { reason_code?: string | null; availability: { reason_code: string | null } }): string | null {
  return fact.reason_code ?? fact.availability.reason_code ?? null;
}

type HoldoutFact = Parameters<typeof retainedSplitBand>[2];

type ProgressFold =NonNullable<NonNullable<ProgressRead["progress"]>["folds"]>[number];

/**
 * The parameter bundle the P11 progress read says a fold was evaluated with.
 * The engine numbers folds from 0 and the progress read from 1 (`foldLabel`),
 * so the join is on that one rule. Absent progress is "unread"; a fold the
 * progress read does not carry, or whose selection is not published, is an
 * absence with the served reason code when there is one.
 */
export type FoldParams =
  | { state: "value"; digest: string; own?: OwnFoldSelection }
  | { state: "absent"; code: string | null }
  | { state: "unread"; answered: boolean };

/**
 * A causal/inner run publishes each outer fold's OWN selection on its capital
 * segment (`selection_scope=OUTER_FOLD_SELECTION`). It applies to that fold's
 * OOS window only; it is never a run-global theta. Legacy segments omit it.
 */
export type OwnFoldSelection = { studyId: string | null; trialId: string | null; parameters: Array<[string, string]> };

export function ownFoldSelection(segment: FoldSegment | null | undefined): OwnFoldSelection | null {
  if (!segment || segment.selection_scope !== "OUTER_FOLD_SELECTION") return null;
  return {
    studyId: segment.study_id ?? null,
    trialId: segment.selected_trial_id ?? null,
    parameters: Object.entries(segment.parameters ?? {}),
  };
}

function ownSelectionTitle(own: OwnFoldSelection, digest: string): string {
  return [
    `own selection (applies to this fold's OOS only) ${digest}`,
    own.studyId ? `study ${own.studyId}` : null,
    own.trialId ? `trial ${own.trialId}` : null,
    own.parameters.length > 0 ? own.parameters.map(([key, value]) => `${key}=${value}`).join(", ") : null,
  ].filter(Boolean).join(" · ");
}

export function foldParams(progress: ProgressRead | null, foldId: string | null, answered: boolean, segment?: FoldSegment | null): FoldParams {
  const own = ownFoldSelection(segment);
  if (own && segment) {
    if (segment.params_digest) return { state: "value", digest: segment.params_digest, own };
    return { state: "absent", code: segment.params_digest_reason_code };
  }
  if (progress === null || foldId === null || !/^\d+$/.test(foldId)) return { state: "unread", answered };
  const fold: ProgressFold | undefined = progress.progress?.folds?.find((candidate) => candidate.fold === Number(foldId) + 1);
  const selection = fold?.selection;
  if (!selection) return { state: "absent", code: null };
  if (selection.state === "AVAILABLE" && selection.params_digest) return { state: "value", digest: selection.params_digest };
  return { state: "absent", code: selection.reason_code };
}

function FoldParamsText({ params }: { params: FoldParams }) {
  if (params.state === "value") {
    return (
      <span data-fold-params={params.digest} data-fold-params-own={params.own ? "" : undefined} title={params.own ? ownSelectionTitle(params.own, params.digest) : `params ${params.digest}`}>
        {params.own ? "own params" : "params"}
        {params.own?.trialId ? ` · ${params.own.trialId}` : ""}
      </span>
    );
  }
  if (params.state === "unread") {
    return <span data-fold-params="unread">{params.answered ? "params not read" : "params…"}</span>;
  }
  return (
    <span data-fold-params="absent" title={params.code ? `${reasonCodeSentence(params.code) ?? ""} ${params.code}`.trim() : undefined}>
      params not published
      {params.code ? <span hidden data-reason-code={params.code}>{params.code}</span> : null}
    </span>
  );
}

const words = humanise;

/**
 * D11 · the words for QuantBT's `FoldAccountPolicyV1` (the only two values the
 * server maps to a continuous account). Anything else is the source's own
 * policy this screen has no sentence for: the headline says so and the raw
 * code rides in a mono title, never in the headline.
 */
const FOLD_CAPITAL_POLICY_WORDS: Record<string, string> = {
  carry_position: "carried across folds",
  close_at_boundary: "closed at each fold boundary",
};

/** QA S08 T-12 / UX-20: the KPI tile's value is one word and the rest is its sub-line. */
export function foldCapitalTile(policy: string | null): { value: string; sub: string | null } {
  if (policy === "carry_position") return { value: "carried", sub: "fold to fold" };
  if (policy === "close_at_boundary") return { value: "closed", sub: "at each fold boundary" };
  return { value: foldCapitalPolicyWords(policy).text, sub: null };
}

export function foldCapitalPolicyWords(policy: string | null): { text: string; code: string | null; mapped: boolean } {
  if (policy === null) return { text: "not published", code: null, mapped: false };
  const known = FOLD_CAPITAL_POLICY_WORDS[policy];
  return known ? { text: known, code: policy, mapped: true } : { text: "source-defined", code: policy, mapped: false };
}

/**
 * A non-negative decimal string as a percentage by moving the decimal point two
 * places in the text (`0.0005` → `0.05%`): a change of unit, never a rounding.
 * Anything that is not a plain decimal is `null`, so the caller keeps the raw
 * string.
 */
export function exactPercent(value: string): string | null {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) return null;
  const fraction = (match[2] ?? "").padEnd(2, "0");
  const whole = `${match[1]}${fraction.slice(0, 2)}`.replace(/^0+(?=\d)/, "");
  const rest = fraction.slice(2).replace(/0+$/, "");
  return `${whole}${rest ? `.${rest}` : ""}%`;
}

/** Bars of empty room each side of the bars, so the first and last time labels stays inside the plot. */
export const AXIS_END_ROOM_BARS = 5;

/** A price on a chart axis: grouped thousands, two places from 1 up, finer below — the readout's own grouping. */
export function chartPrice(value: number): string {
  if (!Number.isFinite(value)) return "";
  const text = Math.abs(value) >= 1
    ? value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
  return typographicMinus(text);
}


/**
 * Entry motion for every ECharts option on this screen: series draw in once for
 * a dataset (an option is rebuilt only when its data changes, never on a poll or
 * a transport tick). Reduced motion and the still-page contexts get none.
 */
export function chartMotion(): { animation: boolean; animationDuration: number; animationDurationUpdate: number; animationEasing: "cubicOut" } {
  const on = smokeMotionAllowed();
  return { animation: on, animationDuration: on ? 600 : 0, animationDurationUpdate: 0, animationEasing: "cubicOut" };
}

export interface CrosshairReadout {
  ordinal: number;
  at: string;
  open: string | null;
  high: string | null;
  low: string | null;
  close: string | null;
  position: string | null;
  equity: string | null;
}

const px = (value: string | null | undefined): string | null => {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? chartPrice(n) : null;
};

/** A served model position, shown to at most four places (the exact string rides in the title); never a raw 17-digit float. */
export function positionText(value: string | number): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return formatValue.number(n, { dp: 4 }).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

/** What the crosshair says about one served bar: its own OHLC, accepted position and equity — nothing derived. */
export function crosshairReadout(row: CurrentSourceObservation): CrosshairReadout {
  const candle = row.bar?.candle ?? null;
  return {
    ordinal: row.source_ordinal,
    at: iso(row.at_utc_ms),
    open: px(candle?.open),
    high: px(candle?.high),
    low: px(candle?.low),
    close: px(candle?.close),
    position: row.accepted_position === null || row.accepted_position === undefined ? null : positionText(row.accepted_position),
    equity: formatMetric(row.equity, "currency"),
  };
}

/** The readout as one sentence: the same served cells the visible line shows. */
function readoutText(r: CrosshairReadout): string {
  return [r.at, `O ${r.open ?? "not published"}`, `H ${r.high ?? "not published"}`, `L ${r.low ?? "not published"}`, `C ${r.close ?? "not published"}`, `pos ${r.position ?? "not published"}`, `equity ${r.equity ?? "not published"}`].join(" ");
}

function ReadoutCell({ label, value }: { label: string; value: string | null }) {
  return (
    <span className="whitespace-nowrap">
      <span style={{ color: "var(--ink-faint)" }}>{label} </span>
      {value ?? <em style={{ color: "var(--ink-faint)" }}>not published</em>}
    </span>
  );
}

/* ------------------------------------------------------------------ parts */

/** Rows above which a data table leaves the screen-reader-only DOM for a collapsed "Data" disclosure (SPEC_W5 2.1.5). */
export const SR_TABLE_MAX_ROWS = 120;

function Exact({ value, unit }: { value: string | null | undefined; unit: "currency" | "fraction" | "count" | null }) {
  if (value === null || value === undefined) return <em>not published</em>;
  const shown = unit === null ? positionText(value) : (formatMetric(value, unit) ?? value);
  return (
    <span title={value} data-exact={value}>
      {typographicMinus(shown)}
    </span>
  );
}

/** `hint` is the long rule text: it rides in a tooltip on the title, and the title stays the accessible name. */
function Card({ title, aside, hint, children, ...rest }: { title: string; aside?: ReactNode; hint?: string; children: ReactNode } & Record<string, unknown>) {
  return (
    <section
      className="flex min-w-0 flex-col gap-2 rounded-[8px] border px-4 py-3"
      style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
      aria-label={title}
      {...rest}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        {/* h2 under the page's h1 (axe heading-order). */}
        <h2 className="mono text-[10px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }} title={hint}>
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
      <span className="mono text-[10px] italic" style={{ color: "var(--ink-faint)" }} title={code ? `${reasonCodeSentence(code) ?? ""} (${code})`.trim() : undefined} data-reason-code={code ?? undefined}>
        {REPLAY_GAP_WORDS[fact.state]}
      </span>
    </span>
  );
}

/* ------------------------------------------------------ the candle chart */

type Lib = typeof import("lightweight-charts");
let libPromise: Promise<Lib> | null = null;
export const loadLib = () => (libPromise ??= import("lightweight-charts"));

export const sec = (ms: number) => Math.floor(ms / 1000) as import("lightweight-charts").UTCTimestamp;

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

export type { CandleMarker };

/** Transitions in the loaded window, from each bar's own block — never guessed from price. */
export function windowMarkers(rows: readonly CurrentSourceObservation[]): CandleMarker[] {
  const markers: CandleMarker[] = [];
  for (const row of rows) {
    const bar = row.bar;
    if (!bar || !bar.transition) continue;
    const after = Number(row.accepted_position);
    const before = bar.position_before === null ? 0 : Number(bar.position_before);
    const side = after > 0 ? "LONG" : after < 0 ? "SHORT" : "FLAT";
    const sideBefore = before > 0 ? "LONG" : before < 0 ? "SHORT" : "FLAT";
    const kind = before === 0 ? "ENTRY" : after === 0 ? "EXIT" : Math.sign(before) !== Math.sign(after) ? "FLIP" : "RESIZE";
    markers.push({
      ordinal: row.source_ordinal,
      at: row.at_utc_ms,
      side,
      kind,
      sideBefore,
      high: bar.candle?.high ?? null,
      low: bar.candle?.low ?? null,
      close: bar.candle?.close ?? null,
      fee: bar.fee,
      turnover: bar.turnover,
    });
  }
  return markers;
}

/** The served ledger row, where one was read, overrides the kind/side/close/fee the window's own bar implies. */
export function withLedger(markers: readonly CandleMarker[], ledger: readonly TransitionRow[] | null): CandleMarker[] {
  if (!ledger || ledger.length === 0) return [...markers];
  const byOrdinal = new Map(ledger.map((row) => [row.source_ordinal, row]));
  return markers.map((marker) => {
    const row = byOrdinal.get(marker.ordinal);
    if (!row) return marker;
    return {
      ...marker,
      kind: row.kind,
      side: row.side_after,
      close: row.close ?? marker.close,
      fee: row.fee ?? marker.fee,
      turnover: row.turnover ?? marker.turnover,
    };
  });
}

/** The chart's colours as one options object per target, from one palette. */
export function applyChartPalette(
  c: {
    lib: { ColorType: { Solid: unknown } };
    api: { applyOptions: (options: object) => void };
    candles: { applyOptions: (options: object) => void };
    position: { applyOptions: (options: object) => void };
    equity: { applyOptions: (options: object) => void };
  },
  pal: ReturnType<typeof paletteNow>,
): void {
  c.api.applyOptions({
    layout: { background: { type: c.lib.ColorType.Solid, color: pal.paperRaised }, textColor: pal.inkFaint, panes: { separatorColor: pal.lineSoft } },
    grid: { vertLines: { color: pal.lineSoft }, horzLines: { color: pal.lineSoft } },
    timeScale: { borderColor: pal.lineSoft },
    rightPriceScale: { borderColor: pal.lineSoft },
  });
  c.candles.applyOptions({
    upColor: pal.good, downColor: pal.bad, borderUpColor: pal.good, borderDownColor: pal.bad,
    wickUpColor: pal.good, wickDownColor: pal.bad,
  });
  c.position.applyOptions({ color: pal.accent });
  c.equity.applyOptions({ color: pal.ink });
}

const CHART_IN_CSS = `
@keyframes s08chartin { from { opacity: 0 } to { opacity: 1 } }
.s08-chart-in { animation: s08chartin .6s cubic-bezier(.2,.7,.2,1) 1; }
@media (prefers-reduced-motion: reduce) { .s08-chart-in { animation: none } }
`;

/**
 * W5 §2.3: the chart contract around a lightweight-charts host. The playhead
 * owns the index (arrows step the bar, Shift 10, Home/End the window's ends,
 * PageUp/PageDown the previous/next transition); + - 0 zoom the time scale.
 * The live node is written only when the playhead is at rest after the reader
 * moved it, never on a playback tick.
 */
function useReplayRegion(o: {
  chart: MutableRefObject<{ api: import("lightweight-charts").IChartApi } | null>;
  transport: ReplayTransport;
  label: string;
  noun: string;
  count: number;
  total: number;
  firstAt: string | null;
  lastAt: string | null;
  describe: (i: number) => string;
  events?: { prev: () => void; next: () => void };
  xs?: readonly number[];
  /** The reader moved the playhead (key or tap): a resting pointer's bar must stop shadowing the readout. */
  onSeek?: () => void;
}) {
  const snap = useTransport(o.transport);
  const ref = useRef(o);
  ref.current = o;
  const range = () => {
    const scale = ref.current.chart.current?.api.timeScale();
    return scale ? { scale, now: scale.getVisibleLogicalRange() } : null;
  };
  const scaleBy = (ratio: number) => {
    const r = range();
    if (!r?.now) return;
    const mid = (r.now.from + r.now.to) / 2;
    const half = ((r.now.to - r.now.from) / 2) * ratio;
    r.scale.setVisibleLogicalRange({ from: mid - half, to: mid + half });
  };
  const c = useChartContract({
    label: o.label,
    noun: o.noun,
    count: o.count,
    describe: (i) => ref.current.describe(i),
    summary: o.count > 0 && o.firstAt && o.lastAt ? `${o.label}, ${o.total} ${o.noun}s, ${o.firstAt} to ${o.lastAt}. Arrow keys read a ${o.noun}.` : `${o.label}, no ${o.noun}s.`,
    xs: o.xs,
    controlledIndex: snap.index,
    onIndex: (i) => {
      if (i === null) return;
      ref.current.onSeek?.();
      o.transport.seek(i);
    },
    events: o.events,
    zoom: {
      zoomIn: () => scaleBy(0.7),
      zoomOut: () => scaleBy(1.4),
      pan: () => undefined,
      zoomed: false,
      reset: () => ref.current.chart.current?.api.timeScale().setVisibleLogicalRange({ from: -AXIS_END_ROOM_BARS, to: ref.current.total - 1 + AXIS_END_ROOM_BARS }),
    },
  });
  const [rest, setRest] = useState<string | null>(null);
  useEffect(() => {
    if (snap.playing || !snap.moved || snap.index >= ref.current.count) return;
    setRest(ref.current.describe(snap.index));
  }, [snap.playing, snap.moved, snap.index]);
  const merge = (className?: string, style?: React.CSSProperties) => ({
    ...c.regionProps,
    /* The playhead owns the readout: it is always shown, so Escape and an outside tap leave it in place. */
    "data-chart-controlled": "true",
    className: `${c.regionProps.className ?? ""} ${className ?? ""}`.trim(),
    style: { ...c.regionProps.style, ...style },
  });
  const nodes = (
    <>
      <ChartLive text={rest} />
      <ChartSummary id={c.summaryId} text={ref.current.count > 0 && o.firstAt && o.lastAt ? `${o.label}, ${o.total} ${o.noun}s, ${o.firstAt} to ${o.lastAt}. Arrow keys read a ${o.noun}.` : `${o.label}, no ${o.noun}s.`} />
    </>
  );
  return { merge, nodes };
}

/** Bars of earlier windows kept on the chart while play across folds runs. */
const TRAIL_BARS_MAX = 600;
const NO_ROWS: readonly CurrentSourceObservation[] = [];
const NO_BOUNDARIES: readonly FoldBoundary[] = [];

function CandleChart({
  rows,
  transport,
  reveal,
  markers,
  hover,
  selected,
  onHover,
  onPick,
  onTransition,
  lead = NO_ROWS,
  boundaries = NO_BOUNDARIES,
}: {
  /** Windows already played, kept on the chart while play across folds runs (read-only context before this window; the transport still walks `rows`). */
  lead?: readonly CurrentSourceObservation[];
  /** Where each later fold's window begins in the stitched view. */
  boundaries?: readonly FoldBoundary[];
  rows: readonly CurrentSourceObservation[];
  transport: ReplayTransport;
  /** PageUp / PageDown: the previous / next transition (the transport row's own handler). */
  onTransition?: (direction: -1 | 1) => void;
  reveal: boolean;
  /** The window's served transitions (ledger-enriched where a ledger page was read). */
  markers: readonly CandleMarker[];
  /** The marker under the pointer, on the chart or in the ledger. */
  hover: number | null;
  /** The marker the anatomy is open on. */
  selected: number | null;
  onHover: (ordinal: number | null) => void;
  onPick: (marker: CandleMarker) => void;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const chart = useRef<{
    lib: typeof import("lightweight-charts");
    api: import("lightweight-charts").IChartApi;
    candles: import("lightweight-charts").ISeriesApi<"Candlestick">;
    position: import("lightweight-charts").ISeriesApi<"Line">;
    equity: import("lightweight-charts").ISeriesApi<"Line">;
  } | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  /* Bumped whenever the chart's own geometry moves (pan, zoom, resize, new data) so the overlay re-reads coordinates. */
  const [geometry, setGeometry] = useState(0);
  const [box, setBox] = useState({ width: 0, height: 0 });
  /* The bar under the pointer (or the playhead's own bar, which the chart's crosshair also reports). */
  const [probe, setProbe] = useState<number | null>(null);
  const timeIndex = useRef<Map<number, number>>(new Map());
  const fitted = useRef<readonly CurrentSourceObservation[] | null>(null);
  const revealed = useRef(false);
  const resizeObserver = useRef<ResizeObserver | null>(null);
  const justFitted = useRef(false);
  const { index } = useTransport(transport);
  /* The chart draws `all` = earlier windows (while play across folds is on) + the current window; the transport and the readout walk the current window only. */
  const all = useMemo(() => (lead.length > 0 ? [...lead, ...rows] : rows), [lead, rows]);
  const offset = lead.length;
  const cut = reveal ? index + 1 : rows.length;
  const cutAll = offset + cut;

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
          /* The axis groups thousands like the readout beside it (`66,000.00`, not `66000.00`). */
          localization: { priceFormatter: chartPrice },
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
        chart.current = { lib, api, candles, position, equity };
        /* The marker layer follows the chart: any pan/zoom/resize re-reads coordinates on the next frame. */
        let frame = 0;
        const bump = () => {
          if (frame) return;
          frame = requestAnimationFrame(() => {
            frame = 0;
            if (!disposed) setGeometry((value) => value + 1);
          });
        };
        try {
          api.subscribeCrosshairMove?.((param: { time?: unknown }) => {
            const at = typeof param?.time === "number" ? timeIndex.current.get(param.time) : undefined;
            if (!disposed) setProbe(at ?? null);
          });
        } catch {
          /* the readout falls back to the playhead's bar */
        }
        try {
          api.timeScale().subscribeVisibleLogicalRangeChange?.(bump);
        } catch {
          /* geometry events are a convenience */
        }
        if (typeof ResizeObserver !== "undefined") {
          const observer = new ResizeObserver((entries) => {
            const rect = entries[0]?.contentRect;
            if (rect) { setBox({ width: Math.round(rect.width), height: Math.round(rect.height) }); }
            bump();
          });
          observer.observe(element);
          resizeObserver.current = observer;
        }
        setStatus("ready");
      })
      .catch(() => {
        if (!disposed) setStatus("unavailable");
      });
    return () => {
      disposed = true;
      resizeObserver.current?.disconnect();
      resizeObserver.current = null;
      chart.current?.api.remove();
      chart.current = null;
    };
  }, []);

  /* The page theme can change while this screen is open. The chart paints to a
     canvas, so it cannot inherit CSS variables: re-read the tokens on every
     `data-theme` change and hand them to the chart and each series. The marker
     layer and the strip are SVG on CSS variables and follow on their own. */
  useEffect(() => {
    if (status !== "ready" || typeof MutationObserver === "undefined") return undefined;
    const repaint = () => {
      const c = chart.current;
      if (c) applyChartPalette(c, paletteNow());
    };
    const observer = new MutationObserver(repaint);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    return () => observer.disconnect();
  }, [status]);

  /* Data changes with the window and, under reveal, with the cursor. */
  useEffect(() => {
    const c = chart.current;
    if (status !== "ready" || !c) return;
    const upto = all.slice(0, cutAll);
    const shown = upto.filter((row) => row.bar?.candle);
    timeIndex.current = new Map(upto.map((row, at) => [sec(row.at_utc_ms), at]));
    c.candles.setData(shown.map((row) => ({
      time: sec(row.at_utc_ms),
      open: Number(row.bar!.candle!.open),
      high: Number(row.bar!.candle!.high),
      low: Number(row.bar!.candle!.low),
      close: Number(row.bar!.candle!.close),
    })));
    c.position.setData(upto.map((row) => ({ time: sec(row.at_utc_ms), value: Number(row.accepted_position) })));
    c.equity.setData(upto.map((row) => ({ time: sec(row.at_utc_ms), value: Number(row.equity) })));
    if (fitted.current !== rows) {
      fitted.current = rows;
      if (offset === 0) {
        /* A new window opens on the whole window; the playhead then scrolls it. */
        justFitted.current = true;
        c.api.timeScale().fitContent();
        /* F3 D10: leave a few bars of room each side so the end time labels are not cut at 660px. */
        c.api.timeScale().setVisibleLogicalRange?.({ from: -AXIS_END_ROOM_BARS, to: all.length - 1 + AXIS_END_ROOM_BARS });
      }
      /* A window that arrives with earlier ones kept (play across folds) keeps the reader's zoom and slides to the playhead. */
    }
    if (reveal !== revealed.current) {
      /* E2b (audit 8.15): cutting the data must not rescale the axis to the bars that are
         left — the window keeps its width and the future stays blank. */
      revealed.current = reveal;
      c.api.timeScale().setVisibleLogicalRange({ from: -AXIS_END_ROOM_BARS, to: all.length + AXIS_END_ROOM_BARS });
    }
    setGeometry((value) => value + 1);
  }, [all, rows, cutAll, offset, status, reveal]);

  /* Markers inside the revealed window, in order; coordinates come from the chart itself. */
  const visibleMarkers = useMemo(() => {
    const at = new Map(all.map((row, position) => [row.source_ordinal, position]));
    return markers.filter((marker) => (at.get(marker.ordinal) ?? Infinity) < cutAll);
  }, [markers, all, cutAll]);
  const handles = useMemo<ChartHandles | null>(() => {
    const c = chart.current;
    if (status !== "ready" || !c || typeof c.candles.priceToCoordinate !== "function") return null;
    return {
      timeX: (atMs) => {
        const x = c.api.timeScale().timeToCoordinate?.(sec(atMs));
        return x === null || x === undefined ? null : Number(x);
      },
      priceY: (price) => {
        const y = c.candles.priceToCoordinate(price);
        return y === null || y === undefined ? null : Number(y);
      },
      plotWidth: () => {
        const w = c.api.timeScale().width?.();
        return typeof w === "number" && w > 0 ? w : null;
      },
    };
    // `geometry` is the dependency that says the chart moved; the handles themselves are stable closures.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, geometry]);
  const barSpacing = useMemo(() => {
    if (!handles || rows.length < 2) return null;
    const a = handles.timeX(rows[0]!.at_utc_ms);
    const b = handles.timeX(rows[1]!.at_utc_ms);
    return a === null || b === null ? null : Math.abs(b - a);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handles, rows]);

  /* The playhead: crosshair on the bar, and the visible range follows it. */
  useEffect(() => {
    const c = chart.current;
    const row = rows[index];
    if (status !== "ready" || !c || !row) return;
    const at = offset + index;
    try {
      if (row.bar?.candle) c.api.setCrosshairPosition(Number(row.bar.candle.close), sec(row.at_utc_ms), c.candles);
      const range = c.api.timeScale().getVisibleLogicalRange();
      if (justFitted.current) {
        /* The range read straight after fitContent can still be the previous window's; a new window opens fit, so there is nothing to slide. */
        justFitted.current = false;
      } else if (range && (at < range.from || at > range.to)) {
        /* Slide, never rescale: keep the reader's zoom and put the playhead at 70%. */
        const span = range.to - range.from;
        const from = Math.max(-2, at - span * 0.7);
        c.api.timeScale().setVisibleLogicalRange({ from, to: from + span });
      }
    } catch {
      /* the crosshair is a convenience */
    }
  }, [index, rows, offset, status]);

  const probeRow = probe !== null && probe < cutAll ? all[probe] : undefined;
  const readoutRow = probeRow ?? (index < cut ? rows[index] : undefined);
  const readout = useMemo(() => (readoutRow ? crosshairReadout(readoutRow) : null), [readoutRow]);
  const xs = useMemo(() => {
    if (!handles || box.width <= 0) return undefined;
    return rows.slice(0, cut).map((row) => {
      const x = handles.timeX(row.at_utc_ms);
      return x === null ? -1000 : (x / box.width) * 100;
    });
  }, [handles, box.width, rows, cut]);
  const region = useReplayRegion({
    chart,
    transport,
    label: "Candle chart",
    noun: "bar",
    /* The reader may step past the revealed bars: the playhead moves, the reveal follows. */
    count: rows.length,
    total: rows.length,
    firstAt: rows[0] ? iso(rows[0].at_utc_ms) : null,
    lastAt: rows.length > 0 ? iso(rows[rows.length - 1]!.at_utc_ms) : null,
    describe: (i) => readoutText(crosshairReadout(rows[i]!)),
    events: onTransition ? { prev: () => onTransition(-1), next: () => onTransition(1) } : undefined,
    xs,
    onSeek: () => setProbe(null),
  });

  const candleTable = (
      <table data-chart-table="replay-candles">
        <caption>Retained bars in this window, exact values</caption>
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
  );

  return (
    <div className="relative" data-chart="replay-candles" data-chart-status={status}>
      <style>{CHART_IN_CSS}</style>
      {readout ? (
        <div
          className="mono flex min-h-[18px] flex-wrap items-center gap-x-3 gap-y-0.5 px-3 pb-1 text-[10px]"
          style={{ color: "var(--ink)" }}
          data-crosshair-readout={readout.ordinal}
          data-crosshair-source={probeRow ? "pointer" : "playhead"}
        >
          <span style={{ color: "var(--ink-soft)" }}>{readout.at}</span>
          <ReadoutCell label="O" value={readout.open} />
          <ReadoutCell label="H" value={readout.high} />
          <ReadoutCell label="L" value={readout.low} />
          <ReadoutCell label="C" value={readout.close} />
          <ReadoutCell label="pos" value={readout.position} />
          <ReadoutCell label="equity" value={readout.equity} />
          <span className="ml-auto whitespace-nowrap" style={{ color: "var(--ink-faint)" }} data-bar-count title="Panes: candles with transition markers, model position (units), equity.">
            {offset > 0 ? `${all.length} bars · ${offset} from earlier folds` : `${rows.length} bars`}
          </span>
        </div>
      ) : null}
      <div {...region.merge()}>
        <div ref={host} className={status === "ready" && smokeMotionAllowed() ? "s08-chart-in" : undefined} style={{ height: 420 }} aria-hidden="true" />
      </div>
      {region.nodes}
      {status !== "ready" ? (
        <span className="mono absolute left-3 top-3 text-[10px] italic" style={{ color: "var(--ink-faint)" }}>
          {status === "loading" ? "drawing candles…" : "the chart could not be drawn here; every bar is listed for screen readers"}
        </span>
      ) : null}
      <MarkerLayer
        markers={visibleMarkers}
        handles={handles}
        barSpacing={barSpacing}
        hover={hover}
        selected={selected}
        onHover={onHover}
        onPick={onPick}
        width={box.width || 1}
        height={260}
        boundaries={boundaries}
      />
      {/* More than SR_TABLE_MAX_ROWS rows: the chart summary + keyboard readout stand in, and the full table sits behind "Data". */}
      {rows.length > SR_TABLE_MAX_ROWS ? (
        <details className="rr-data" data-sr-candle-table data-candle-data>
          <summary>Data</summary>
          {candleTable}
        </details>
      ) : (
        /* A table ignores width/overflow, so the visually-hidden box is a wrapper. */
        <div className="sr-only" data-sr-candle-table>
          {candleTable}
        </div>
      )}
      <ul className="sr-only" data-marker-list>
        {visibleMarkers.map((marker) => (
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
  progress = null,
  progressAnswered = false,
  windowKey = "oos",
  onWindow,
  split = null,
  holdout = null,
  playhead = null,
}: {
  replay: CurrentSourceReplay;
  /** The window switch (IS | OOS | HOLDOUT): which span is on show; the fold chips pick WHICH OOS slice. */
  windowKey?: ExecWindow;
  onWindow?: (next: ExecWindow) => void;
  /** The run's own fold plan, for the served train/test boundaries behind the three bands. */
  split?: CurrentSourceSplit | null;
  /** The evidence claim's holdout fact: a withheld holdout is a typed absence, not an empty band. */
  holdout?: HoldoutFact;
  /** Source ordinal under the playhead, for the cursor line on the overview. */
  playhead?: number | null;
  /** The P11 progress read, for each fold's selected params digest. */
  progress?: ProgressRead | null;
  progressAnswered?: boolean;
  activeFold: string | null;
  onFold: (segment: FoldSegment) => void;
  disabled: boolean;
  /** Under causal reveal, the cursor's source ordinal; nothing after it is drawn. */
  cutOrdinal?: number | null;
  reveal: boolean;
}) {
  const activeAt = replay.execution.fold_capital.segments.findIndex((segment) => segment.fold_id === activeFold);
  const capital = replay.execution.fold_capital;
  const policyWords = foldCapitalPolicyWords(capital.policy);
  const plan = new Map((split?.fold_plan.folds ?? []).map((fold) => [fold.fold_id, fold]));
  /* UX-08: a run whose profile has no holdout says so on the button, instead of answering a click with a code. */
  const holdoutNone = split ? retainedSplitBand(split, activeFold, holdout ?? null).segments.find((segment) => segment.key === "holdout")?.state === "NOT_APPLICABLE" : false;
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
        <span className="mono text-[9.5px] uppercase tracking-[.1em]" style={{ color: "var(--ink-faint)" }} title="One account stitched across the fold windows">
          stitched account{scrolls ? ` · ${capital.segments.length} folds` : ""}
        </span>
        {/* One control with the fold chain, same chip style: the window picks WHICH SPAN, the fold chips pick WHICH OOS SLICE. */}
        <span className="flex items-center gap-1" role="group" aria-label="window" data-window-switch={windowKey}>
          {EXEC_WINDOWS.map((key) => (
            <button
              key={key}
              type="button"
              className="mono rounded-[4px] border px-2 text-[10px] leading-[22px]"
              style={{
                borderColor: windowKey === key ? "var(--accent)" : "var(--line)",
                background: windowKey === key ? "var(--paper-sunken)" : "var(--paper-raised)",
                color: windowKey === key ? "var(--accent)" : "var(--ink-soft)",
              }}
              aria-pressed={windowKey === key}
              data-window={key}
              disabled={key === "holdout" && holdoutNone && windowKey !== "holdout"}
              title={
                key === "holdout" && holdoutNone
                  ? "This run has no holdout window."
                  : key === "is"
                  ? "IS — the in-sample (train) span of this fold, as overview candles"
                  : key === "oos"
                    ? "OOS — the replayable out-of-sample fold window"
                    : "HOLDOUT — the sealed window, if the run published one"
              }
              onClick={() => onWindow?.(key)}
            >
              {key === "holdout" ? "holdout" : key.toUpperCase()}
            </button>
          ))}
        </span>
        <span aria-hidden="true" className="mono text-[10px]" style={{ color: "var(--line-strong)" }}>│</span>
        <div
          ref={strip}
          className={scrolls ? "order-last flex w-full min-w-0 basis-full snap-x items-center gap-1.5 overflow-x-auto pb-1" : "contents"}
          {...(scrolls ? { tabIndex: 0, role: "region", "aria-label": "folds of the stitched account", "data-fold-scroller": "" } : {})}
        >
        {capital.segments.map((segment, position) => {
          const current = segment.fold_id === activeFold;
          return (
            <span key={segment.fold_id} className={`flex items-center gap-1.5${scrolls ? " flex-none snap-start" : ""}`}>
              {position > 0 ? (
                <span
                  className="mono text-[10px]"
                  style={{ color: "var(--ink-faint)" }}
                  data-fold-boundary={capital.equity_continuity}
                  title={
                    capital.equity_continuity === "CONTINUOUS_ACROSS_FOLDS"
                      ? `${policyWords.code ?? "policy"} — one stitched account: ${foldShort(segment.fold_id)} starts at ${foldShort(capital.segments[position - 1]!.fold_id)}'s end equity and carries its position`
                      : capital.equity_continuity === "RESET_PER_FOLD"
                        ? `${policyWords.code ?? "policy"} — each fold is its own account; the folds are not compounded`
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
                title={(() => {
                  const params = foldParams(progress, segment.fold_id, progressAnswered, segment);
                  const paramsText = params.state === "value" ? (params.own ? ownSelectionTitle(params.own, params.digest) : `params ${params.digest}`) : params.state === "absent" ? `params not published${params.code ? ` ${params.code}` : ""}` : "params not read";
                  const score = plan.get(segment.fold_id)?.score;
                  const scoreText = score && score.state === "AVAILABLE"
                    ? ` · IS Sharpe ${score.is_sharpe ?? "not published"} · OOS Sharpe ${score.oos_sharpe ?? "not published"} · decay ${score.decay ?? "not published"} · OOS trades ${score.oos_trades ?? "not published"}`
                    : "";
                  return reveal && position >= activeAt
                    ? `${foldShort(segment.fold_id)}: ${segment.bars} bars`
                    : `${foldShort(segment.fold_id)}: ${segment.bars} bars, ${segment.transitions} transitions, equity ${segment.start_equity} → ${segment.end_equity} · ${paramsText}${scoreText} · fold return not published`;
                })()}
              >
                {/* F1 FG 08-06: the server publishes each fold's start and end equity, not a return — the chip shows the served end equity and never divides. */}
                {foldShort(segment.fold_id)} · {segment.bars} bars ·{" "}
                {reveal && position >= activeAt ? (
                  <em data-reveal-hidden title={REVEAL_HIDDEN}>{REVEAL_HIDDEN_SHORT}</em>
                ) : (
                  <span data-fold-end-equity={segment.end_equity}>
                    end <Exact value={segment.end_equity} unit="currency" />
                  </span>
                )}
              </button>
            </span>
          );
        })}
        </div>
        <span
          className="mono text-[9px]"
          style={{ color: "var(--ink-faint)" }}
          data-fold-capital={capital.policy ?? ""}
          title={[policyWords.code, words(capital.equity_continuity), capital.account_execution ? words(capital.account_execution) : null].filter(Boolean).join(" · ")}
        >
          capital {policyWords.text}
        </span>
      </div>
      {overview ? (
        <OverviewStrip replay={replay} activeFold={activeFold} cutOrdinal={cutOrdinal} onFold={onFold} split={split} holdout={holdout} playhead={playhead} />
      ) : null}
    </div>
  );
}

/** The whole run as extrema-keeping OHLC buckets, with the fold windows shaded. */
/**
 * The three windows over the whole run, from served boundaries only:
 * IS (the active fold's train window, hatched) and every fold's OOS window
 * (solid, the active one stronger). Each band's tooltip is its served start,
 * end and bar count. An IS span the bucket times cannot place is not drawn.
 */
export function overviewBands(replay: CurrentSourceReplay, split: CurrentSourceSplit | null, activeFold: string | null): OverviewBand[] {
  const overview = replay.execution.candle_overview;
  if (!overview) return [];
  const buckets = overview.values.filter((bucket): bucket is typeof bucket & { open_utc_ms: number; close_utc_ms: number } => typeof bucket.open_utc_ms === "number" && typeof bucket.close_utc_ms === "number");
  const plan = new Map((split?.fold_plan.folds ?? []).map((fold) => [fold.fold_id, fold]));
  const bands: OverviewBand[] = replay.execution.fold_capital.segments.map((segment) => {
    const fold = plan.get(segment.fold_id);
    const window = fold && fold.test_start_utc_ms !== null && fold.test_end_utc_ms !== null
      ? ` · ${formatUtc(fold.test_start_utc_ms)} → ${formatUtc(fold.test_end_utc_ms)}`
      : "";
    return {
      key: "oos" as const,
      from: segment.first_ordinal,
      to: segment.last_ordinal,
      active: segment.fold_id === activeFold,
      foldId: segment.fold_id,
      title: `${foldShort(segment.fold_id)} · OOS${window} · ${segment.bars} bars`,
    };
  });
  const train = activeFold === null ? null : plan.get(activeFold);
  if (train && train.train_start_utc_ms !== null && train.train_end_utc_ms !== null && buckets.length > 0) {
    const from = ordinalAt(buckets, train.train_start_utc_ms);
    const to = ordinalAt(buckets, train.train_end_utc_ms);
    if (from !== null && to !== null && to > from) {
      bands.push({
        key: "is",
        from,
        to,
        active: true,
        foldId: train.fold_id,
        title: `${foldShort(train.fold_id)} · IS (train) · ${formatUtc(train.train_start_utc_ms)} → ${formatUtc(train.train_end_utc_ms)} · bars not published`,
      });
    }
  }
  return bands;
}

function OverviewStrip({
  replay,
  activeFold,
  cutOrdinal,
  onFold,
  split,
  holdout,
  playhead,
}: {
  replay: CurrentSourceReplay;
  activeFold: string | null;
  cutOrdinal: number | null;
  onFold: (segment: FoldSegment) => void;
  split: CurrentSourceSplit | null;
  holdout: HoldoutFact;
  playhead: number | null;
}) {
  const bands = overviewBands(replay, split, activeFold);
  const facts = split ? retainedSplitBand(split, activeFold, holdout ?? null) : null;
  const isFact = facts?.segments.find((segment) => segment.key === "is");
  const holdoutFact = facts?.segments.find((segment) => segment.key === "holdout");
  const hasIs = bands.some((band) => band.key === "is");
  const holdoutCode = holdoutFact?.reasonCode ?? null;
  return (
    <CandleOverviewStrip
      overview={replay.execution.candle_overview!}
      segments={replay.execution.fold_capital.segments.map((segment) => ({
        key: segment.fold_id,
        first_ordinal: segment.first_ordinal,
        last_ordinal: segment.last_ordinal,
        active: segment.fold_id === activeFold,
      }))}
      bands={split ? bands : undefined}
      onBand={(band) => {
        const segment = replay.execution.fold_capital.segments.find((candidate) => candidate.fold_id === band.foldId);
        if (segment) onFold(segment);
      }}
      playhead={cutOrdinal === null ? playhead : null}
      cutOrdinal={cutOrdinal}
      scope="whole run"
      label="whole-run price range with the IS, OOS and holdout windows"
      footer={
        <span className="mono flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[9px]" style={{ color: "var(--ink-faint)" }} data-overview-legend>
          <span className="flex items-center gap-1" title={hasIs ? "IS — the active fold's train window" : isFact ? `IS not drawn — ${isFact.reasonCode ?? "not published"}` : "IS — needs the split read"} data-legend-window="is">
            <i aria-hidden="true" className="inline-block h-[8px] w-[14px]" style={{ background: "repeating-linear-gradient(135deg, var(--viz-train) 0 2px, transparent 2px 5px)", border: "1px solid var(--viz-train)" }} />
            IS
          </span>
          <span className="flex items-center gap-1" title="OOS — each fold's replayable test window; the active fold is stronger. Click a band to open that fold." data-legend-window="oos">
            <i aria-hidden="true" className="inline-block h-[8px] w-[14px]" style={{ background: "var(--role-oos)", opacity: 0.5 }} />
            OOS
          </span>
          <span
            className="flex items-center gap-1"
            title={holdoutFact ? `${reasonCodeSentence(holdoutCode) ?? "The run published no holdout window."}${holdoutCode ? ` (${holdoutCode})` : ""}` : "HOLDOUT — needs the split read"}
            data-legend-window="holdout"
            data-band-state={holdoutFact?.state ?? "NOT_PUBLISHED"}
          >
            <i aria-hidden="true" className="inline-block h-[8px] w-[14px]" style={{ border: "1px dashed var(--role-holdout)" }} />
            holdout <em>{holdoutFact?.state === "NOT_APPLICABLE" ? "not applicable" : "not published"}</em>
            {holdoutCode ? <span data-reason-code={holdoutCode} className="sr-only">{holdoutCode}</span> : null}
          </span>
        </span>
      }
    />
  );
}

/**
 * IS window of the active fold: the overview buckets that fall inside the
 * served train span, drawn as candles. It is an overview (bucketed, no
 * transition markers, no replay): the label says so. Without a served train
 * span or bucket times the panel is a typed absence, never an empty chart.
 */
function IsWindowPanel({ replay, band, activeFold, onJumpOos }: { replay: CurrentSourceReplay; band: SplitBandSlot; activeFold: string | null; onJumpOos: () => void }) {
  const summaryId = useId();
  const overview = replay.execution.candle_overview;
  const fold = band.state === "ready" && band.folds ? band.folds.fold_plan.folds.find((candidate) => candidate.fold_id === activeFold) ?? null : null;
  const start = fold?.train_start_utc_ms ?? null;
  const end = fold?.train_end_utc_ms ?? null;
  const inSpan = overview && start !== null && end !== null
    ? bucketsInSpan(overview.values.filter((bucket): bucket is typeof bucket & { open_utc_ms: number; close_utc_ms: number } => typeof bucket.open_utc_ms === "number" && typeof bucket.close_utc_ms === "number"), start, end)
    : [];
  if (band.state !== "ready" || !fold || start === null || end === null || inSpan.length === 0) {
    const facts = band.state === "ready" && band.folds ? retainedSplitBand(band.folds, activeFold, null).segments.find((segment) => segment.key === "is") : null;
    const code = facts?.reasonCode ?? null;
    return (
      <div className="flex min-h-[120px] flex-col items-start justify-center gap-1.5 rounded-[6px] border border-dashed px-4 py-3" style={{ borderColor: "var(--line)" }} data-window-panel="is" data-window-absent>
        <span className="mono text-[10px] uppercase tracking-[.08em]" style={{ color: "var(--ink-soft)" }}>IS overview — not published</span>
        {band.state !== "ready" ? <SplitBandNote slot={band} /> : null}
        {code ? <span className="mono text-[9.5px]" data-reason-code={code} title={reasonCodeSentence(code) ?? undefined} style={{ color: "var(--ink-faint)" }}>{code}</span> : null}
        <button type="button" className="btn-ghost mono text-[10px]" onClick={onJumpOos}>OOS window →</button>
      </div>
    );
  }
  const high = Math.max(...inSpan.map((bucket) => Number(bucket.high)));
  const low = Math.min(...inSpan.map((bucket) => Number(bucket.low)));
  const mid = (high + low) / 2;
  const height = 200;
  const y = (value: number) => (high === low ? height / 2 : 8 + (1 - (value - low) / (high - low)) * (height - 16));
  const width = Math.max(1, inSpan.length);
  return (
    <div className="flex flex-col gap-1" data-window-panel="is" data-is-buckets={inSpan.length}>
      <div className="flex gap-2">
      {/* UX-09: the same price axis (grouped, served high/mid/low of the span) and time axis the replay chart has. */}
      <div className="mono relative h-[220px] w-[64px] flex-none text-[9px]" style={{ color: "var(--ink-faint)" }} data-is-axis="price" aria-hidden="true">
        <span className="absolute right-0 top-0">{chartPrice(high)}</span>
        <span className="absolute right-0 top-1/2 -translate-y-1/2">{chartPrice(mid)}</span>
        <span className="absolute bottom-0 right-0">{chartPrice(low)}</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="h-[220px] min-w-0 flex-1 rounded-[6px] border" style={{ borderColor: "var(--line-soft)", background: "var(--paper-raised)" }} role="img" aria-label={`${foldShort(fold.fold_id)} in-sample overview candles`} aria-describedby={summaryId}>
        {inSpan.map((bucket, position) => {
          const up = Number(bucket.close) >= Number(bucket.open);
          const ink = up ? "var(--good)" : "var(--bad)";
          const top = y(Math.max(Number(bucket.open), Number(bucket.close)));
          const bottom = y(Math.min(Number(bucket.open), Number(bucket.close)));
          return (
            <g key={bucket.first_ordinal}>
              <title>{`${formatUtc(bucket.open_utc_ms)} → ${formatUtc(bucket.close_utc_ms)} · O ${bucket.open} H ${bucket.high} L ${bucket.low} C ${bucket.close}`}</title>
              <line x1={position + 0.5} x2={position + 0.5} y1={y(Number(bucket.high))} y2={y(Number(bucket.low))} stroke={ink} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
              <rect x={position + 0.12} width={0.76} y={top} height={Math.max(1, bottom - top)} fill={ink} />
            </g>
          );
        })}
      </svg>
      <span id={summaryId} className="sr-only" data-is-summary>{`In-sample candle chart, ${inSpan.length} candles, ${formatUtc(inSpan[0]!.open_utc_ms)} to ${formatUtc(inSpan[inSpan.length - 1]!.close_utc_ms)}.`}</span>
      </div>
      <div className="mono ml-[72px] flex justify-between text-[9px]" style={{ color: "var(--ink-faint)" }} data-is-axis="time" aria-hidden="true">
        <span>{formatUtc(start)}</span>
        <span>{formatUtc(end)}</span>
      </div>
      <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-is-caption title={`Each candle's high and low are the true extremes of its bars; there is no per-bar replay in the IS window. Range ${chartPrice(low)} – ${chartPrice(high)}.`}>
        overview · {foldShort(fold.fold_id)} IS · {formatCount(inSpan.length)} candles ({formatCount(overview!.bucket_bars)} bars each)
      </span>
    </div>
  );
}

/** HOLDOUT window: the served absence, with the code and a way to the split screen that owns it. */
function HoldoutWindowPanel({ band, activeFold, holdout, splitHref }: { band: SplitBandSlot; activeFold: string | null; holdout: HoldoutFact; splitHref: string }) {
  const facts = band.state === "ready" && band.folds ? retainedSplitBand(band.folds, activeFold, holdout ?? null).segments.find((segment) => segment.key === "holdout") : null;
  const code = facts?.reasonCode ?? null;
  return (
    <div className="flex min-h-[120px] flex-col items-start justify-center gap-1.5 rounded-[6px] border border-dashed px-4 py-3" style={{ borderColor: "var(--role-holdout)" }} data-window-panel="holdout" data-window-absent data-band-state={facts?.state ?? "NOT_PUBLISHED"}>
      <span className="mono text-[10px] uppercase tracking-[.08em]" style={{ color: "var(--role-holdout)" }} title={code ? `${reasonCodeSentence(code) ?? ""} (${code})`.trim() : undefined}>
        {facts?.state === "NOT_APPLICABLE" ? "This run has no holdout window." : "holdout — not published"}
      </span>
      {band.state !== "ready" ? <SplitBandNote slot={band} /> : null}
      {/* The served code stays on the page for the machine and the tooltip for the reader. */}
      {code ? <span className="sr-only" data-reason-code={code} title={reasonCodeSentence(code) ?? undefined}>{code}</span> : null}
      <Link to={splitHref} className="mono text-[10px]" style={{ color: "var(--accent)" }} data-action="to-split">Split · windows →</Link>
    </div>
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
  /** Served bucket times (the retained and P04 overviews both publish them); they position bands, never shown. */
  open_utc_ms?: number;
  close_utc_ms?: number;
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
  bands,
  onBand,
  playhead = null,
  footer,
}: {
  overview: CandleOverviewFacts;
  segments?: readonly { key: string; first_ordinal: number; last_ordinal: number; active: boolean }[];
  cutOrdinal?: number | null;
  scope: string;
  shading?: string;
  label: string;
  /** IS / OOS windows from served boundaries, drawn over the buckets; each carries its own tooltip. */
  bands?: readonly OverviewBand[];
  onBand?: (band: OverviewBand) => void;
  /** Source ordinal under the playhead: a thin cursor line on the strip. */
  playhead?: number | null;
  footer?: ReactNode;
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
      <div className="relative">
      <svg viewBox="0 0 100 24" preserveAspectRatio="none" className="pointer-events-none relative z-[1] h-[34px] w-full" role="img" aria-label={label}>
        {(bands ? [] : segments).map((segment) => (
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
      {bands
        ? [...bands]
            .sort((left, right) => (left.key === right.key ? 0 : left.key === "is" ? -1 : 1))
            .map((band) => {
              const left = x(band.from);
              const width = Math.max(0.4, x(band.to) - left);
              const isOos = band.key === "oos";
              return (
                <div
                  key={`${band.key}-${band.foldId ?? "is"}-${band.from}`}
                  className="absolute bottom-0 top-0"
                  style={{
                    left: `${left}%`,
                    width: `${width}%`,
                    background: isOos ? "var(--role-oos)" : "repeating-linear-gradient(135deg, var(--viz-train) 0 2px, transparent 2px 5px)",
                    opacity: isOos ? (band.active ? 0.34 : 0.16) : 0.4,
                    borderLeft: band.active && isOos ? "1px solid var(--role-oos)" : undefined,
                    borderRight: band.active && isOos ? "1px solid var(--role-oos)" : undefined,
                    cursor: isOos && onBand ? "pointer" : "default",
                  }}
                  title={band.title}
                  data-overview-band={band.key}
                  data-band-active={band.active ? "true" : undefined}
                  data-band-fold-id={band.foldId ?? undefined}
                  onClick={isOos && onBand ? () => onBand(band) : undefined}
                />
              );
            })
        : null}
      {playhead !== null ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 top-0"
          style={{ left: `${x(playhead)}%`, borderLeft: "1.5px solid var(--accent)" }}
          data-overview-playhead={playhead}
        />
      ) : null}
      </div>
      {footer}
      <span
        className="mono text-[9px]"
        style={{ color: "var(--ink-faint)" }}
        data-overview-caption
        title={[
          overview.sampling === "FULL" ? null : "Each candle's high and low are the true extremes of its bars.",
          high !== null && low !== null ? `${cutOrdinal === null ? "range" : "revealed range"} ${chartPrice(Number(low))} – ${chartPrice(Number(high))}` : null,
        ].filter(Boolean).join(" · ") || undefined}
      >
        {scope} · {formatCount(n)} bars
        {overview.sampling === "FULL"
          ? " · every bar"
          : ` · ${formatCount(overview.emitted_bucket_count)} candles (${formatCount(overview.bucket_bars)} bars each)`}
        {high === null || low === null ? " · range withheld — no complete bucket at cursor" : ""}
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
  canTransition = { previous: true, next: true },
  acrossControl,
}: {
  transport: ReplayTransport;
  rows: readonly CurrentSourceObservation[];
  onFoldStep: (direction: -1 | 1) => void;
  onTransitionStep: (direction: -1 | 1) => void;
  canFold: { previous: boolean; next: boolean };
  /** UX-14: false only when the loaded bars and the read ledger both say there is none in that direction. */
  canTransition?: { previous: boolean; next: boolean };
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
        <button type="button" className={button} style={style} aria-label="previous fold" disabled={!canFold.previous} title={canFold.previous ? "Previous fold" : "Already on the first fold of this run."} onClick={() => onFoldStep(-1)}>|◀</button>
        <button type="button" className={button} style={style} aria-label="previous transition" disabled={disabled || !canTransition.previous} title={stepReason ?? (canTransition.previous ? "Previous transition (marker)" : "This is the first transition.")} onClick={() => onTransitionStep(-1)}>◀◀</button>
        <button type="button" className={button} style={style} aria-label="step back" disabled={disabled} title={stepReason ?? "Step back one bar"} onClick={() => transport.step(-1)}>◀</button>
        <button
          type="button"
          className={button}
          style={{ ...style, borderColor: "var(--accent)", color: "var(--accent)", background: snap.playing ? "var(--paper-sunken)" : style.background }}
          aria-label={snap.playing ? "pause" : "play"}
          aria-pressed={snap.playing}
          data-action="play"
          disabled={disabled}
          title={stepReason ?? (snap.playing ? "Pause" : "Play")}
          onClick={() => transport.toggle()}
        >
          {snap.playing ? "❚❚" : "▶"}
        </button>
        <button type="button" className={button} style={style} aria-label="step forward" disabled={disabled} title={stepReason ?? "Step forward one bar"} onClick={() => transport.step(1)}>▶</button>
        <button type="button" className={button} style={style} aria-label="next transition" disabled={disabled || !canTransition.next} title={stepReason ?? (canTransition.next ? "Next transition (marker)" : "This is the last transition.")} onClick={() => onTransitionStep(1)}>▶▶</button>
        <button type="button" className={button} style={style} aria-label="next fold" disabled={!canFold.next} title={canFold.next ? "Next fold" : "Already on the last fold of this run."} onClick={() => onFoldStep(1)}>▶|</button>
      </span>
      <span className="flex gap-1" role="group" aria-label="speed">
        {SPEEDS.map((speed) => (
          <button
            key={speed}
            type="button"
            className={button}
            aria-pressed={snap.speed === speed}
            aria-label={`playback speed ${speed}×`}
            title={`Playback speed ${speed}× (the 1× base rate is the screen's own)`}
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
function PlayheadState({ transport, rows }: {
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
      data-playhead-note
      title="Model state replayed from the retained bars, not a broker account."
    >
      <span className={cell}><b>{iso(row.at_utc_ms)}</b></span>
      <span className={cell} data-readout-fold><b>{bar?.fold_id != null ? foldShort(bar.fold_id) : "in-sample (no fold)"}</b></span>
      <span className={cell} data-readout-position>position <b><Exact value={row.accepted_position} unit={null} /></b></span>
      <span className={cell}>equity <b><Exact value={row.equity} unit="currency" /></b></span>
      <span className={cell} title="Run fees so far: cumulative over the whole run up to this bar, not only this fold.">fees so far <b><Exact value={bar?.checkpoint.cumulative_fee} unit="currency" /></b></span>
      <span className={cell} data-readout-transitions title="Run transitions so far: cumulative over the whole run up to this bar, not only this fold.">transitions so far <b>{bar ? bar.checkpoint.transition_count : "not published"}</b></span>
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
  onRetry,
  hover,
  selected,
  onHover,
}: {
  slot: TransitionsSlot;
  onRetry?: () => void;
  rows: readonly CurrentSourceObservation[];
  transport: ReplayTransport;
  reveal: boolean;
  onSeek: (row: TransitionRow) => void;
  onPage: (direction: "next" | "previous") => void;
  /** The marker under the pointer (chart or ledger) and the one the anatomy is open on: rows and glyphs light together. */
  hover: number | null;
  selected: number | null;
  onHover: (ordinal: number | null) => void;
}) {
  const { index } = useTransport(transport);
  const cursorAt = rows[index]?.at_utc_ms ?? null;
  if (slot.state !== "ready") {
    return (
      <p className="mono flex flex-wrap items-center gap-2 text-[10px] italic" style={{ color: "var(--ink-faint)" }} data-transitions={slot.state}>
        {slot.state === "refused" ? `Transitions unavailable. ${slot.message}` : "reading transitions…"}
        {slot.state === "refused" && slot.mayRetry && onRetry ? (
          <button type="button" className="btn-ghost mono text-[10px] not-italic" data-action="retry-transitions" onClick={onRetry}>
            Retry
          </button>
        ) : null}
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
            {ledger.rows.map((row, position) => {
              const future = reveal && cursorAt !== null && row.at_utc_ms > cursorAt;
              /* UX-12: the rows after the cursor are one line, not thirty identical ones. */
              const earlier = ledger.rows[position - 1];
              if (future && earlier && cursorAt !== null && earlier.at_utc_ms > cursorAt) return null;
              const hiddenCount = future ? ledger.rows.filter((candidate) => candidate.at_utc_ms > cursorAt!).length : 0;
              const current = cursorAt === row.at_utc_ms;
              return (
                <tr
                  key={row.source_ordinal}
                  className="mono text-[10.5px]"
                  data-transition-row={row.source_ordinal}
                  data-transition-kind={row.kind}
                  data-play={String(current)}
                  data-revealed={future ? "hidden" : "shown"}
                  data-hover={hover === row.source_ordinal ? "true" : undefined}
                  data-selected={selected === row.source_ordinal ? "true" : undefined}
                  /* E2 (audit 8.14): the whole row selects; the number stays the keyboard target. */
                  onClick={() => onSeek(row)}
                  onMouseEnter={() => onHover(row.source_ordinal)}
                  onMouseLeave={() => onHover(null)}
                  style={{
                    background: current || hover === row.source_ordinal || selected === row.source_ordinal ? "var(--paper-sunken)" : undefined,
                    boxShadow: selected === row.source_ordinal ? "inset 2px 0 0 var(--accent)" : undefined,
                    borderBottom: "1px solid var(--line-soft)",
                    cursor: "pointer",
                  }}
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
                    <td colSpan={6} className="py-[3px] italic" style={{ color: "var(--ink-faint)" }} data-reveal-collapsed={hiddenCount}>
                      {hiddenCount} later {hiddenCount === 1 ? "transition" : "transitions"} {REVEAL_HIDDEN}
                    </td>
                  ) : (
                    <>
                      <td className="py-[3px] pr-3" style={{ color: row.side_after === "SHORT" ? "var(--bad)" : row.side_after === "LONG" ? "var(--good)" : "var(--ink-soft)" }}>
                        <svg width={14} height={14} viewBox="-8 -8 16 16" aria-hidden="true" className="mr-1 inline-block align-[-3px]" data-ledger-glyph={row.kind}>
                          <GlyphShape marker={{ kind: row.kind, side: row.side_after, sideBefore: Number(row.position_before ?? 0) > 0 ? "LONG" : Number(row.position_before ?? 0) < 0 ? "SHORT" : "FLAT" }} s={11} />
                        </svg>
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
        <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-transition-count title={words(ledger.semantics)}>
          {ledger.rows.length} of {ledger.source_transition_count ?? "an unpublished number of"} transitions
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
  onRetry,
}: {
  replay: CurrentSourceReplay;
  slot: ChildAuditSlot | undefined;
  fold: string | null;
  onRetry?: () => void;
  /** D7: play across folds is running, so this fold's audit is not asked for until playback rests. */
  waiting?: boolean;
}) {
  const summary = replay.execution.child_audit;
  const fact = replay.route_capabilities.child_audit;
  const isolationOf = (record: { policy: string | null; certified_isolation: boolean | null }) =>
    `${humanise(record.policy) || "not published"}${record.certified_isolation === true ? " · certified" : record.certified_isolation === false ? " · not certified" : ""}`;
  /* One isolation word for every record is said once, in the summary, not once per row. */
  const isolationUniform =
    slot && slot.state === "ready" && slot.audit.records.length > 0 && slot.audit.records.every((record) => isolationOf(record) === isolationOf(slot.audit.records[0]!))
      ? isolationOf(slot.audit.records[0]!)
      : null;
  const loaded = slot && slot.state !== "idle" && slot.state !== "loading" && slot.fold === fold;
  return (
    <Card
      title="child audit — strategy isolation, per fold"
      data-panel="child-audit"
      aside={
        /* UX-04: the chip follows the response. A failed read is not "available". */
        slot?.state === "refused" && slot.fold === fold ? (
          <span className="mono text-[9px] uppercase tracking-[.07em]" style={{ color: "var(--warn)" }} data-capability="child_audit" data-capability-state="READ_FAILED">
            child audit · could not be read
          </span>
        ) : fact.state === "AVAILABLE" ? (
          <span hidden data-capability="child_audit" data-capability-state="AVAILABLE" />
        ) : (
          <FactLine label="child audit" fact={fact} name="child_audit" />
        )
      }
    >
      {summary.state !== "AVAILABLE" ? (
        <p className="text-[11px]" style={{ color: "var(--ink-soft)" }}>This seal carries no child-audit records.</p>
      ) : fold === null ? (
        <p className="text-[11px]" style={{ color: "var(--ink-soft)" }}>In-sample bars — child audit is per OOS fold.</p>
      ) : waiting && !loaded ? (
        <p className="mono text-[10px] italic" style={{ color: "var(--ink-faint)" }} data-child-audit="waiting">
          {foldShort(fold)}'s child audit loads when playback rests.
        </p>
      ) : !slot || slot.state === "idle" || slot.state === "loading" || slot.fold !== fold ? (
        <p className="mono text-[10px] italic" style={{ color: "var(--ink-faint)" }} data-child-audit="loading">reading {foldShort(fold)}'s child audit…</p>
      ) : slot.state === "refused" ? (
        <p className="flex flex-wrap items-center gap-2 text-[11px]" style={{ color: "var(--ink-soft)" }} data-child-audit="refused">
          {slot.message}
          {slot.mayRetry && onRetry ? (
            <button type="button" className="btn-ghost mono text-[10px]" data-action="retry-child-audit" onClick={onRetry}>
              Retry
            </button>
          ) : null}
        </p>
      ) : (
        <div className="flex flex-col gap-1" data-child-audit={slot.fold}>
          {/* Collapsed by default: 64 rows of the same seed/isolation are an appendix, the count is the fact. */}
          <details data-child-audit-details>
          <summary className="mono cursor-pointer text-[10px]" style={{ color: "var(--ink-soft)" }} title="The shaded row is the strategy instance that generated this fold's out-of-sample bars. Legacy witness, not the full lifecycle.">
            {foldShort(slot.fold)} · {formatCount(slot.audit.records.length)} records{isolationUniform !== null ? ` · ${isolationUniform}` : ""}
          </summary>
          {/* Keyboard users can scroll this table sideways at narrow widths (axe scrollable-region-focusable). */}
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={`child audit records of ${foldShort(slot.fold)}`}>
            <table className="w-full min-w-[520px] border-collapse">
              <thead>
                <tr className="mono text-left text-[9px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
                  <th className="py-1 pr-3 font-normal">audit #</th>
                  <th className="py-1 pr-3 font-normal">context</th>
                  <th className="py-1 pr-3 font-normal">candidate</th>
                  <th className="py-1 pr-3 font-normal">seed</th>
                  {isolationUniform === null ? <th className="py-1 pr-3 font-normal">isolation</th> : null}
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
                      {isolationUniform === null ? <td className="py-[3px] pr-3">{isolationOf(record)}</td> : null}
                      <td className="whitespace-nowrap py-[3px]">
                        {record.test_start_utc_ms !== null ? iso(record.test_start_utc_ms) : "not published"} → {record.test_end_utc_ms !== null ? iso(record.test_end_utc_ms) : "not published"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </details>
          {/* T-06: the reader's fact is the count; policy, run total, drops and fingerprint ride in the tooltip. */}
          <span
            className="mono text-[9.5px]"
            style={{ color: "var(--ink-faint)" }}
            data-child-audit-caption
            title={`run total ${formatCount(summary.source_record_count) ?? "not published"} · policy ${summary.policy ?? "not published"} · dropped by QuantBT ${formatCount(summary.records_dropped_by_source) ?? "not published"} · run fingerprint ${short(summary.source_run_fingerprint, 12)}`}
          >
            {formatCount(slot.audit.records.length)} of {formatCount(slot.audit.source_record_count) ?? "an unpublished number of"} records for this fold
            {slot.audit.truncated ? ` (capped at ${formatCount(slot.audit.records.length)})` : ""}
          </span>
        </div>
      )}
    </Card>
  );
}

function Anatomy({ replay, selected, childAudit, windowLoaded = true }: { replay: CurrentSourceReplay; selected: TransitionRow | null; childAudit?: ChildAuditSlot; windowLoaded?: boolean }) {
  const child = generationOf(childAudit, selected?.fold_id ?? null);
  const route = replay.execution.route;
  const links: Array<{ key: string; value: ReactNode; na?: boolean }> = selected
    ? [
        { key: "signal", value: `bar ${iso(selected.at_utc_ms)} · ${route.signal_phase ? `evaluated at the ${words(route.signal_phase)}` : "signal phase not published"}` },
        {
          key: "order",
          na: true,
          value: `n/a for ${route.engine_id ?? "this route"}`,
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
          value: route.fill_price_policy ? `fills at the ${route.fill_price_policy}` : "fill policy not published",
        },
        {
          key: "child",
          na: child === null,
          value: child
            ? `audit #${child.audit_ordinal} · ${child.context} · candidate ${short(child.candidate_id, 8)} · seed ${child.seed ?? "?"} · ${child.policy ?? "isolation not published"}${child.certified_isolation ? " certified" : ""}`
            : replay.execution.child_audit.state !== "AVAILABLE"
              ? `not published — ${replay.route_capabilities.child_audit.reason_code ?? "no child audit on this seal"}`
              /* UX-04 / T-04: every state resolves — never a spinner that waits for a record that is not coming. */
              : !windowLoaded
                ? "not read — no fold window loaded"
                : childAudit?.state === "refused" && childAudit.fold === selected.fold_id
                ? "not read — the child audit could not be read"
                : childAudit?.state === "ready" && childAudit.fold === selected.fold_id
                  ? `not in the ${formatCount(childAudit.audit.records.length)} loaded records`
                  : childAudit?.state === "ready" || childAudit?.state === "refused"
                    ? "not read for this fold"
                    : "reading…",
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
    <Card title="trade anatomy" data-panel="trade-anatomy">
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
          Select a transition.
        </p>
      )}
    </Card>
  );
}

/** Per-bar fee in the loaded window, and the full run's totals (labelled retrospective). */
function CostTimeline({ rows, replay, reveal, transport }: {
  windowLoaded?: boolean;
  rows: readonly CurrentSourceObservation[];
  replay: CurrentSourceReplay;
  reveal: boolean;
  transport: ReplayTransport;
}) {
  const { index } = useTransport(transport);
  const cut = reveal ? index + 1 : rows.length;
  const totals = replay.execution.totals;
  const funding = replay.route_capabilities.funding;
  return (
    <Card title="cost timeline" data-panel="cost-timeline" aside={<FactLine label="fees" fact={replay.route_capabilities.fees} name="fees" />}>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px]">
        <span className="mono" data-cost-total={reveal ? "hidden" : "shown"}>
          full run (retrospective): {reveal ? <em>{REVEAL_HIDDEN}</em> : (
            <>fee <Exact value={totals.fee} unit="currency" /> · notional <Exact value={totals.turnover} unit="currency" /></>
          )}
        </span>
        <FactLine label="funding" fact={funding} name="funding" />
      </div>
      {!rows.some((row) => row.bar?.fee !== null && row.bar?.fee !== undefined) ? (
        /* No bar carries a fee (a percent-equity source publishes equity, returns and positions, not a fee ledger): absence is said, never drawn as zero cost. */
        <p className="mono text-[10px] italic" style={{ color: "var(--ink-faint)" }} data-cost-absent>
          per-bar fee not published for this route
        </p>
      ) : (
      <div className="flex h-[36px] items-end gap-px" aria-hidden="true" title="Each column is a bar; a tall column is a bar that was charged a fee. A bar with no published fee is left blank.">
        {rows.map((row, position) => {
          const published = row.bar?.fee !== null && row.bar?.fee !== undefined;
          const fee = published ? Number(row.bar!.fee) : 0;
          return (
            <span
              key={row.source_ordinal}
              style={{
                flex: 1,
                height: fee > 0 ? "100%" : "2px",
                background: position >= cut || !published ? "transparent" : fee > 0 ? "var(--warn)" : "var(--line-soft)",
              }}
            />
          );
        })}
      </div>
      )}
      <span className="text-[9.5px]" style={{ color: "var(--ink-faint)" }}>
        fee rate{" "}
        {replay.execution.route.fee_rate_oneway === null || replay.execution.route.fee_rate_oneway === undefined ? (
          "not published"
        ) : (
          <span className="mono" data-fee-rate={replay.execution.route.fee_rate_oneway} title={`${replay.execution.route.fee_rate_oneway} (exact)`}>
            {exactPercent(replay.execution.route.fee_rate_oneway) ?? replay.execution.route.fee_rate_oneway}
          </span>
        )}{" "}
        one-way · slippage {replay.execution.route.slippage_bps ?? "not published"} bps
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
  windowKey = "oos",
  onWindow,
  runId,
  cursor = null,
}: {
  /** W1 B3: the screen's live cursor; the Split link carries it (stage forced to split) instead of a fresh one. */
  cursor?: EvidenceCursor | null;
  replay: CurrentSourceReplay;
  slot: Extract<RetainedReplaySlot, { state: "ready" }>;
  controller: ReplayController;
  transport: ReplayTransport;
  /** E2c (8.5): the run's own fold plan, for the IS / OOS / HOLDOUT band. */
  band: SplitBandSlot;
  /** Which span is on show (`?window=`); OOS is the replayable fold window. */
  windowKey?: ExecWindow;
  onWindow?: (next: ExecWindow) => void;
  /** B8: the run whose full child-audit lifecycle the companion panel reads, on click. */
  runId?: string;
}) {
  const rows = replay.replay.rows;
  const execution = replay.execution;
  const segments = execution.fold_capital.segments;
  const selectedOrdinal = replay.replay.state_at_cursor.source_ordinal;
  const [reveal, setReveal] = useState(false);
  /* F-06: the reader's pick counts only while it lies in the window on screen; otherwise the selection is the
     window's own default (first ledger row at or after its first bar), so the same window selects the same row
     after a fold change, a reload or a deep link. */
  const [picked, setSelected] = useState<TransitionRow | null>(null);
  /* One hover across chart and ledger: a marker and its ledger row light together. */
  const [hover, setHover] = useState<number | null>(null);
  const inFlight = slot.inFlight === true;
  const snap = useTransport(transport);
  /* UX-13: a ledger row of another fold loads that fold's own window, then the playhead moves to the row. */
  const pendingSeek = useRef<number | null>(null);
  const loaded = useRef<string | null>(null);

  useEffect(() => {
    let at = selectedOrdinal === null ? 0 : rows.findIndex((row) => row.source_ordinal === selectedOrdinal);
    if (pendingSeek.current !== null) {
      const wanted = rows.findIndex((row) => row.source_ordinal === pendingSeek.current);
      if (wanted >= 0) {
        at = wanted;
        pendingSeek.current = null;
      }
    }
    /* The same window handed over again (a re-read, a rebuilt slot) is not a new arrival: the playhead stays where
       the reader, or the link's `seq`, put it. */
    const key = `${selectedOrdinal}:${rows[0]?.source_ordinal}:${rows[rows.length - 1]?.source_ordinal}:${rows.length}`;
    const same = loaded.current === key && pendingSeek.current === null;
    loaded.current = key;
    if (same) return;
    transport.load(rows.length, Math.max(0, at));
  }, [rows, selectedOrdinal, transport]);

  /* D7 (8.10). Declared right after the effect that loads a window into the
     transport: on a window's arrival the transport is loaded first, then play
     across folds decides whether to go on. */
  const across = usePlayAcrossFolds({ transport, controller, replay, slot });

  /* Play across folds keeps the windows it has already played on the chart, so the next fold continues the same picture;
     a fold boundary is drawn where the next window begins. Nothing is stitched when the windows are not contiguous. */
  const played = useRef<{ rows: typeof rows; trail: readonly (typeof rows)[] } | null>(null);
  const trail = useMemo(() => {
    const before = played.current;
    let next: readonly (typeof rows)[] = [];
    if (across.enabled && before) {
      if (before.rows === rows) next = before.trail;
      else {
        const last = before.rows[before.rows.length - 1]?.source_ordinal;
        const first = rows[0]?.source_ordinal;
        if (last !== undefined && first !== undefined && first > last) next = [...before.trail, before.rows];
      }
    }
    while (next.length > 0 && next.reduce((sum, w) => sum + w.length, 0) + rows.length > TRAIL_BARS_MAX) next = next.slice(1);
    played.current = { rows, trail: next };
    return next;
  }, [rows, across.enabled]);
  const lead = useMemo(() => trail.flat(), [trail]);
  const boundaries = useMemo<FoldBoundary[]>(() => {
    const wins = [...trail, rows];
    const out: FoldBoundary[] = [];
    const foldOf = (w: typeof rows) => w.find((row) => row.bar?.fold_id)?.bar?.fold_id ?? null;
    for (let i = 1; i < wins.length; i += 1) {
      const fold = foldOf(wins[i]!);
      if (fold === null || fold === foldOf(wins[i - 1]!)) continue;
      const segment = segments.find((candidate) => candidate.fold_id === fold);
      const trial = segment?.selected_trial_id;
      out.push({
        atMs: wins[i]![0]!.at_utc_ms,
        label: foldLabel(fold),
        title: `${foldLabel(fold)} begins${trial ? ` · trial ${trial}` : ""}${segment ? ` · bars ${segment.first_ordinal}–${segment.last_ordinal}` : ""}`,
      });
    }
    return out;
  }, [trail, rows, segments]);

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
  const noFoldWindow = windowKey === "oos" && segments.length > 0 && activeFold === null;

  const goFold = (segment: FoldSegment) => controller.retainedFold?.(segment);
  const foldStep = (direction: -1 | 1) => {
    const target = segments[(foldIndex === -1 ? 0 : foldIndex) + direction];
    if (target) goFold(target);
  };
  const ledgerSlot = controller.transitions;
  const canTransition = (direction: -1 | 1): boolean => {
    for (let at = snap.index + direction; at >= 0 && at < rows.length; at += direction) {
      if (rows[at]!.bar?.transition) return true;
    }
    /* Unknown (ledger unread) stays enabled; only a ledger that has been read can say there is none. */
    if (ledgerSlot?.state !== "ready") return true;
    const here = playRow?.source_ordinal ?? 0;
    const found = direction > 0 ? ledgerSlot.ledger.rows.some((row) => row.source_ordinal > here) : ledgerSlot.ledger.rows.some((row) => row.source_ordinal < here);
    return found || (direction > 0 ? ledgerSlot.ledger.page.has_more : ledgerSlot.ledger.page.has_previous);
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
  const windowFirst = rows[0]?.source_ordinal ?? 0;
  const windowLast = rows[rows.length - 1]?.source_ordinal ?? windowFirst;
  const selected: TransitionRow | null =
    picked !== null && picked.source_ordinal >= windowFirst && picked.source_ordinal <= windowLast
      ? picked
      : (ledgerRows && ledgerRows.length > 0 ? (ledgerRows.find((row) => row.source_ordinal >= windowFirst) ?? ledgerRows[0]!) : null);
  const seekTransition = (row: TransitionRow) => {
    setSelected(row);
    const at = rows.findIndex((candidate) => candidate.source_ordinal === row.source_ordinal);
    if (at >= 0) {
      transport.seek(at);
      return;
    }
    const owner = segments.find((candidate) => row.source_ordinal >= candidate.first_ordinal && row.source_ordinal <= candidate.last_ordinal);
    if (owner && owner.bars <= RETAINED_WINDOW_MAX && controller.retainedFold) {
      pendingSeek.current = row.source_ordinal;
      controller.retainedFold(owner);
    } else {
      controller.retainedSeek?.(row.playback_cursor);
    }
  };

  /* The chart's markers: the window's own transition bars, upgraded by the served ledger row where one was read. */
  const markers = useMemo(() => withLedger(windowMarkers(rows), ledgerRows), [rows, ledgerRows]);
  const pickMarker = (marker: CandleMarker) => {
    const row = ledgerRows?.find((candidate) => candidate.source_ordinal === marker.ordinal);
    if (row) {
      seekTransition(row);
      return;
    }
    const at = rows.findIndex((candidate) => candidate.source_ordinal === marker.ordinal);
    if (at >= 0) transport.seek(at);
  };

  const route = execution.route;
  const counts = execution.counts;
  const identity = controller.retainedContext?.identity;
  const progress = identity?.state === "ready" ? identity.identity.progress : null;
  const readiness = identity?.state === "ready" ? retainedReadiness(progress) : null;
  const claim = controller.retainedContext?.claim;
  const claimStrip = claim?.state === "ready" ? claim.claim : null;
  const provenance = replay.provenance;
  const window = rows.length > 0 ? `${rows[0]!.source_ordinal + 1}–${rows.at(-1)!.source_ordinal + 1}` : "none read";
  const segment = foldIndex >= 0 ? segments[foldIndex]! : null;
  /* The arriving cursor (window included) with only the fold overridden by the fold on screen. */
  const splitHref = runScreenHref(replay.run_id, "split", cursor, foldIndex >= 0 ? { fold: foldIndex + 1 } : undefined);
  const caps = replay.route_capabilities;
  const capabilityItems = [
    { name: "orders", label: "orders", fact: caps.orders },
    { name: "fills", label: "fills", fact: caps.fills },
    { name: "partial_fills", label: "partial", fact: caps.partial_fills },
    { name: "trades", label: "trades", fact: caps.trades },
    { name: "sl_tp", label: "SL/TP", fact: caps.sl_tp },
    { name: "oco", label: "OCO", fact: caps.oco },
    { name: "multi_leg", label: "multi-leg", fact: caps.multi_leg },
  ] as const;
  const routePhases = [
    route.signal_phase ? `signal ${words(route.signal_phase)}` : null,
    route.fill_phase ? `fill ${words(route.fill_phase)}${route.fill_price_policy ? ` @ ${route.fill_price_policy}` : ""}` : null,
  ].filter((value): value is string => value !== null);

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
          <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-as-of title={`revision ${replay.revision}`}>
            as of {iso(replay.as_of_utc_ms)}
          </span>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="mono rounded-[3px] border px-[5px] text-[10px] leading-[16px]" style={{ color: "var(--accent)", borderColor: "var(--accent)" }} data-route-id={progress?.run?.execution_route ?? ""}>
            {humanise(progress?.run?.execution_route) || (identity?.state === "ready" ? "route not read" : "reading route…")}
          </span>
          <span
            className="mono text-[10px]"
            data-replay-contract={route.engine_id ?? ""}
            title={`contract ${route.engine_id ?? "not published"} · ${routePhases.join(" · ")}${route.accounting_certified === true ? " · accounting certified by QuantBT" : ""}`}
          >
            {humanise(route.engine_id) || "contract not published"}
          </span>
          {routePhases.map((phase) => (
            <span key={phase} className="mono rounded-[3px] border px-[5px] text-[9.5px] leading-[16px]" style={{ borderColor: "var(--line-soft)", color: "var(--ink-soft)" }} data-route-phase>
              {phase}
            </span>
          ))}
          {readiness === null || readiness === "READY" ? (
            <span hidden data-readiness={readiness ?? ""} />
          ) : (
            <span className="mono rounded-[3px] border px-[5px] text-[10px] leading-[16px]" style={{ borderColor: "var(--line)" }} data-readiness={readiness}>
              {words(readiness)}
            </span>
          )}
        </div>
      </Card>

      <section
        className="flex flex-col gap-2 rounded-[8px] border px-4 py-3"
        style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
        aria-label="stitched account replay"
        data-replay-window="RETAINED_BARS"
        data-replay-section
        tabIndex={-1}
        onKeyDown={replayKeyDown(transport)}
        data-window-key={windowKey}
        data-retained-in-flight={String(inFlight)}
      >
        <FoldStrip
          replay={replay}
          progress={progress}
          progressAnswered={identity?.state === "ready"}
          activeFold={activeFold}
          onFold={goFold}
          disabled={inFlight}
          reveal={reveal}
          cutOrdinal={reveal ? (playRow?.source_ordinal ?? null) : null}
          windowKey={windowKey}
          onWindow={onWindow}
          split={band.state === "ready" ? band.folds : null}
          holdout={claimStrip?.holdout ?? null}
          playhead={playRow?.source_ordinal ?? null}
        />
        {/* When play across folds asked for the read that was refused, its own notice under the
            transport carries this same sentence; it is said once, not twice. */}
        {slot.pageRefusal && across.status.refusal !== slot.pageRefusal ? (
          <p className="mono flex flex-wrap items-center gap-2 text-[10px]" role="status" style={{ color: "var(--warn)" }} data-page-refusal={slot.pageRefusal.code ?? slot.pageRefusal.status}>
            {pageRefusalWords(slot.pageRefusal)}
            {slot.pageRefusal.mayRetry && controller.retryRetained ? (
              <button type="button" className="btn-ghost mono text-[10px]" data-action="retry-window" onClick={controller.retryRetained}>
                Retry
              </button>
            ) : null}
          </p>
        ) : null}
        {slot.recovered ? (
          <p className="mono text-[10px]" role="status" style={{ color: "var(--warn)" }} data-recovered>
            The replay position expired. It was discarded and the first window was read again once.
          </p>
        ) : null}
        {/*
          * The three windows are on the overview strip above (served IS / OOS
          * boundaries, holdout as a typed absence). This row carries what the
          * chart needs: the fold, the bars on show, the marker legend, what the
          * route cannot draw (capability chips) and the causal-reveal switch.
          */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-y py-1.5" style={{ borderColor: "var(--line-soft)" }}>
          <span className="mono flex-none text-[9.5px] uppercase tracking-[.1em]" style={{ color: "var(--ink-faint)" }} data-band-fold>
            {segment ? foldShort(segment.fold_id) : noFoldWindow ? "fold window" : "in-sample bars (no fold)"}
          </span>
          {segment ? (
            <span className="mono flex-none text-[9.5px]" style={{ color: "var(--ink-faint)" }}>
              <FoldParamsText params={foldParams(progress, segment.fold_id, identity?.state === "ready", segment)} />
            </span>
          ) : null}
          {band.state !== "ready" ? <SplitBandNote slot={band} /> : null}
{noFoldWindow ? null : (
                    <span
            className="mono text-[9.5px]"
            style={{ color: "var(--ink-faint)" }}
            data-counts
            title={`source bars ${formatCount(replay.replay.source_observation_count) ?? "not published"}${segment ? ` · fold bars ${segment.first_ordinal + 1}–${segment.last_ordinal + 1}` : ""}`}
          >
            bars {window} of {formatCount(replay.replay.source_observation_count) ?? "not published"}
          </span>
          )}
          {windowKey === "oos" ? <MarkerLegend /> : null}
          {windowKey === "oos" ? <CapabilityStrip items={capabilityItems} /> : null}
          {windowKey === "oos" ? (
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
          ) : null}
        </div>

        {windowKey === "is" ? (
          <IsWindowPanel replay={replay} band={band} activeFold={activeFold} onJumpOos={() => onWindow?.("oos")} />
        ) : windowKey === "holdout" ? (
          <HoldoutWindowPanel band={band} activeFold={activeFold} holdout={claimStrip?.holdout ?? null} splitHref={splitHref} />
        ) : (
          noFoldWindow ? (
            /* UX-02: no fold window is loaded. In-sample bars are never drawn under an OOS selection. */
            <div className="flex min-h-[120px] flex-col items-start justify-center gap-1.5 rounded-[6px] border border-dashed px-4 py-3" style={{ borderColor: "var(--line)" }} data-window-panel="oos-pending" data-window-state={slot.pageRefusal ? "failed" : "reading"}>
              <span className="mono text-[10px] uppercase tracking-[.08em]" style={{ color: "var(--ink-soft)" }}>
                {slot.pageRefusal ? "Fold window not loaded" : "Reading the fold window…"}
              </span>
            </div>
          ) : (
          <>
            {rows.length > 0 ? (
              <CandleChart rows={rows} lead={lead} boundaries={boundaries} transport={transport} onTransition={transitionStep} reveal={reveal} markers={markers} hover={hover} selected={selected?.source_ordinal ?? null} onHover={setHover} onPick={pickMarker} />
            ) : null}
            <Transport
              transport={transport}
              rows={rows}
              onFoldStep={foldStep}
              onTransitionStep={transitionStep}
              canFold={{ previous: !inFlight && foldIndex > 0, next: !inFlight && foldIndex < segments.length - 1 && segments.length > 0 }}
              canTransition={{ previous: canTransition(-1), next: canTransition(1) }}
              acrossControl={<AcrossSwitch across={across} />}
            />
            <AcrossNotice across={across} />
            <PlayheadState transport={transport} rows={rows} reveal={reveal} totals={execution.totals} />
            <div
              className="flex flex-wrap items-center gap-2"
              data-read-rule={across.enabled ? "across" : "asked"}
              title={across.enabled ? "Play across folds is on: the next window is read at the end of this one." : "Windows are read only when you ask."}
            >
              <button type="button" className="btn-ghost mono text-[10px]" data-action="previous-window" disabled={!replay.replay.page.has_previous || inFlight} title={inFlight ? "A replay window is loading." : replay.replay.page.has_previous ? "Read the earlier bars of this fold" : "This window starts at the fold's first bar."} onClick={() => controller.retainedPreviousWindow?.()}>
                ‹ earlier bars
              </button>
              <button type="button" className="btn-ghost mono text-[10px]" data-action="next-window" disabled={!replay.replay.page.has_more || inFlight} title={inFlight ? "A replay window is loading." : replay.replay.page.has_more ? "Read the later bars of this fold" : "This window ends at the fold's last bar."} onClick={() => controller.retainedNextWindow?.()}>
                later bars ›
              </button>
            </div>
          </>
          )
        )}
      </section>

      <div className="flex flex-wrap gap-2" data-verdict-tiles>
        {[
          /* W4: the records tile is drawn only when the source published a real count; "0 · 0 · 0" is said once by the absence line. */
          ...((counts.orders_published ?? 0) + (counts.fills_published ?? 0) + (counts.trades_published ?? 0) > 0
            ? [
                {
                  k: "orders · fills · trades",
                  label: "published records",
                  v: `${countCell(counts.orders_published)} · ${countCell(counts.fills_published)} · ${countCell(counts.trades_published)}`,
                  tip: "Records QuantBT emitted on this route.",
                  absent: counts.orders_published === null || counts.fills_published === null || counts.trades_published === null,
                  codes: [
                    counts.orders_published === null ? factCode(replay.route_capabilities.orders) : null,
                    counts.fills_published === null ? factCode(replay.route_capabilities.fills) : null,
                    counts.trades_published === null ? factCode(replay.route_capabilities.trades) : null,
                  ],
                },
              ]
            : []),
          {
            k: "target transitions",
            v: reveal ? REVEAL_HIDDEN : countCell(counts.transitions),
            sub: "full run",
            tip: "Full run, retrospective: counted over the whole run, not up to the cursor.",
            hidden: reveal,
            absent: !reveal && counts.transitions === null,
            codes: [!reveal && counts.transitions === null ? factCode(replay.route_capabilities.execution_events) : null],
          },
          { k: "fees paid", v: reveal ? REVEAL_HIDDEN : (formatMetric(execution.totals.fee, "currency") ?? "not published"), sub: "full run", tip: "Full run, retrospective: the whole run's fee, not up to the cursor.", hidden: reveal },
          ...(counts.rejected_orders === null ? [] : [{ k: "rejected orders", v: countCell(counts.rejected_orders), tip: "Engine diagnostics.", absent: false }]),
          { k: "fold capital", v: foldCapitalTile(execution.fold_capital.policy).value, sub: foldCapitalTile(execution.fold_capital.policy).sub ?? undefined, vTitle: foldCapitalPolicyWords(execution.fold_capital.policy).code, tip: words(execution.fold_capital.equity_continuity) },
        ].map((tile: { k: string; label?: string; v: string; sub?: string; tip?: string; hidden?: boolean; absent?: boolean; codes?: Array<string | null>; vTitle?: string | null }) => (
          <div
            key={tile.k}
            className="flex min-w-[150px] flex-1 flex-col gap-0.5 rounded-[6px] border px-3 py-2"
            style={{ borderColor: "var(--line-soft)", background: "var(--paper-raised)" }}
            data-tile={tile.k}
            title={tile.tip}
          >
            <span className="text-[10px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>{tile.label ?? tile.k}</span>
            <span className="mono text-[17px] font-semibold" style={{ fontStyle: tile.hidden || tile.absent ? "italic" : undefined, fontSize: tile.hidden || tile.absent ? 12 : undefined }} title={tile.vTitle ?? undefined} data-tile-code={tile.vTitle ?? undefined} data-tile-absent={tile.absent ? "" : undefined}>{tile.v}</span>
            {(tile.codes ?? []).filter((code): code is string => code !== null).map((code) => (
              <span key={code} hidden data-reason-code={code} title={reasonCodeSentence(code) ?? undefined}>{code}</span>
            ))}
            {tile.sub ? <span className="mono text-[9px]" style={{ color: "var(--ink-faint)" }}>{tile.sub}</span> : null}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-3">
          <Card
            title="target transition ledger"
            hint="One row per position change."
            data-panel="event-ledger"
            aside={<FactLine label="events" fact={replay.route_capabilities.execution_events} name="execution_events" />}
          >
            {controller.transitions ? (
              <TransitionLedger
                slot={controller.transitions}
                rows={rows}
                transport={transport}
                reveal={reveal}
                onSeek={seekTransition}
                onPage={(direction) => controller.transitionsPage?.(direction)}
                onRetry={controller.retryTransitions}
                hover={hover}
                selected={selected?.source_ordinal ?? null}
                onHover={setHover}
              />
            ) : null}
          </Card>
          <Anatomy replay={replay} selected={selected} childAudit={controller.childAudit} windowLoaded={!noFoldWindow} />
          <ChildAuditCard replay={replay} slot={controller.childAudit} fold={windowFold} waiting={across.holding} onRetry={controller.retryChildAudit} />
          {runId ? <ChildAuditCompanionPanel runId={runId} /> : null}
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          {replay.route_capabilities.trades.state !== "AVAILABLE" ? (
            /* Structurally empty on a close-target route: one line, each absence's reason in its tooltip. */
            <section
              className="flex flex-wrap items-baseline gap-x-2 rounded-[8px] border px-4 py-2 text-[10.5px]"
              style={{ borderColor: "var(--line)", background: "var(--paper-raised)", color: "var(--ink-soft)" }}
              data-absent-panel="trade-blotter"
              aria-label="Trade records"
            >
              <span className="mono" tabIndex={0} title={factTitle(replay.route_capabilities.trades)}>No trade records on this route</span>
              <span hidden data-absent-panel="mae-mfe" />
            </section>
          ) : (
            <Card title="trade blotter" data-absent-panel="trade-blotter">
              <FactLine label={`trades · ${counts.trades_published}`} fact={replay.route_capabilities.trades} name="trades" />
            </Card>
          )}
          <CostTimeline rows={rows} replay={replay} reveal={reveal} transport={transport} windowLoaded={!noFoldWindow} />
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------- fixed observation candle chart */

/** What the crosshair says about one fixed-run observation: its own OHLC, equity and native position labels. */
export interface FixedCrosshairReadout {
  ordinal: number;
  at: string;
  open: string | null;
  high: string | null;
  low: string | null;
  close: string | null;
  equity: string | null;
  /** Native engine position labels, verbatim keys (never relabelled to the market symbol). */
  positions: ReadonlyArray<{ key: string; value: string; shown: string }>;
}

export function fixedCrosshairReadout(row: FixedReplayObservation): FixedCrosshairReadout {
  return {
    ordinal: row.source_ordinal,
    at: iso(row.at_utc_ms),
    open: px(row.open),
    high: px(row.high),
    low: px(row.low),
    close: px(row.close),
    equity: formatMetric(row.equity, "currency"),
    positions: Object.entries(row.positions).map(([key, value]) => ({ key, value, shown: typographicMinus(value) })),
  };
}

/** The native position labels in a window, in first-seen order; a label is a key, not a symbol. */
export function fixedPositionKeys(rows: readonly FixedReplayObservation[]): string[] {
  const seen = new Set<string>();
  for (const row of rows) for (const key of Object.keys(row.positions)) seen.add(key);
  return [...seen];
}

/**
 * The candle chart of a fixed/imported run's retained OOS observations — the
 * `CandleChart`'s own life (crosshair that follows the playhead, readout that
 * follows the pointer, entry animation behind the motion gate) over bars the
 * fixed route served. It draws what was served and no more: candles, the
 * native position per label, and equity. No marker layer exists here because
 * the route publishes no transition, order or fill to mark.
 */
export function FixedCandleChart({ rows, transport }: { rows: readonly FixedReplayObservation[]; transport: ReplayTransport }) {
  const host = useRef<HTMLDivElement | null>(null);
  const chart = useRef<{
    lib: Lib;
    api: import("lightweight-charts").IChartApi;
    candles: import("lightweight-charts").ISeriesApi<"Candlestick">;
    equity: import("lightweight-charts").ISeriesApi<"Line">;
    positions: Map<string, import("lightweight-charts").ISeriesApi<"Line">>;
  } | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const [probe, setProbe] = useState<number | null>(null);
  const timeIndex = useRef<Map<number, number>>(new Map());
  const fitted = useRef<readonly FixedReplayObservation[] | null>(null);
  const justFitted = useRef(false);
  const { index } = useTransport(transport);
  const keys = useMemo(() => fixedPositionKeys(rows), [rows]);

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
          rightPriceScale: { borderColor: pal.lineSoft, scaleMargins: { top: 0.08, bottom: 0.06 } },
          localization: { priceFormatter: chartPrice },
        });
        const candles = api.addSeries(lib.CandlestickSeries, {
          upColor: pal.good, downColor: pal.bad, borderUpColor: pal.good, borderDownColor: pal.bad,
          wickUpColor: pal.good, wickDownColor: pal.bad,
        });
        const equity = api.addSeries(lib.LineSeries, { color: pal.ink, lineWidth: 1, priceLineVisible: false, lastValueVisible: false }, 2);
        equity.applyOptions({
          autoscaleInfoProvider: () => {
            const range = paddedRange(equity.data().map((point) => (point as { value: number }).value));
            return range ? { priceRange: { minValue: range.min, maxValue: range.max } } : null;
          },
        });
        try {
          const panes = api.panes();
          panes[0]?.setHeight(260);
          panes[1]?.setHeight(56);
          panes[2]?.setHeight(80);
        } catch {
          /* pane sizing is cosmetic */
        }
        chart.current = { lib, api, candles, equity, positions: new Map() };
        try {
          api.subscribeCrosshairMove?.((param: { time?: unknown }) => {
            const at = typeof param?.time === "number" ? timeIndex.current.get(param.time) : undefined;
            if (!disposed) setProbe(at ?? null);
          });
        } catch {
          /* the readout falls back to the playhead's bar */
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
    const repaint = () => {
      const c = chart.current;
      if (!c) return;
      applyChartPalette(
        { ...c, position: { applyOptions: (options) => c.positions.forEach((line) => line.applyOptions({ ...options })) } },
        paletteNow(),
      );
    };
    const observer = new MutationObserver(repaint);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    return () => observer.disconnect();
  }, [status]);

  useEffect(() => {
    const c = chart.current;
    if (status !== "ready" || !c) return;
    const pal = paletteNow();
    /* One step line per native position label; a label that left the window is removed. */
    for (const [key, line] of c.positions) {
      if (!keys.includes(key)) {
        c.api.removeSeries(line);
        c.positions.delete(key);
      }
    }
    keys.forEach((key, at) => {
      if (c.positions.has(key)) return;
      c.positions.set(
        key,
        c.api.addSeries(
          c.lib.LineSeries,
          { color: at === 0 ? pal.accent : pal.ink, lineWidth: 1, lineType: c.lib.LineType.WithSteps, priceLineVisible: false, lastValueVisible: false, title: key },
          1,
        ),
      );
    });
    timeIndex.current = new Map(rows.map((row, at) => [sec(row.at_utc_ms), at]));
    c.candles.setData(rows.map((row) => ({
      time: sec(row.at_utc_ms),
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
    })));
    for (const [key, line] of c.positions) {
      line.setData(rows.filter((row) => key in row.positions).map((row) => ({ time: sec(row.at_utc_ms), value: Number(row.positions[key]) })));
    }
    c.equity.setData(rows.map((row) => ({ time: sec(row.at_utc_ms), value: Number(row.equity) })));
    if (fitted.current !== rows) {
      fitted.current = rows;
      justFitted.current = true;
      c.api.timeScale().fitContent();
      c.api.timeScale().setVisibleLogicalRange?.({ from: -AXIS_END_ROOM_BARS, to: rows.length - 1 + AXIS_END_ROOM_BARS });
    }
  }, [rows, keys, status]);

  /* The playhead: the crosshair sits on the bar, and the range slides to follow it. */
  useEffect(() => {
    const c = chart.current;
    const row = rows[index];
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
  }, [index, rows, status]);

  const probeRow = probe !== null ? rows[probe] : undefined;
  const readoutRow = probeRow ?? rows[index];
  const readout = useMemo(() => (readoutRow ? fixedCrosshairReadout(readoutRow) : null), [readoutRow]);
  const region = useReplayRegion({
    chart,
    transport,
    label: "Candle chart",
    noun: "observation",
    count: rows.length,
    total: rows.length,
    firstAt: rows[0] ? iso(rows[0].at_utc_ms) : null,
    lastAt: rows.length > 0 ? iso(rows[rows.length - 1]!.at_utc_ms) : null,
    describe: (i) => {
      const r = fixedCrosshairReadout(rows[i]!);
      return [r.at, `O ${r.open ?? "not published"}`, `H ${r.high ?? "not published"}`, `L ${r.low ?? "not published"}`, `C ${r.close ?? "not published"}`, ...r.positions.map((p) => `pos ${p.key} ${p.shown}`), `equity ${r.equity ?? "not published"}`].join(" ");
    },
    onSeek: () => setProbe(null),
  });

  return (
    <div className="relative" data-chart="fixed-replay-candles" data-chart-status={status}>
      <style>{CHART_IN_CSS}</style>
      {readout ? (
        <div
          className="mono flex min-h-[18px] flex-wrap items-center gap-x-3 gap-y-0.5 px-3 pb-1 text-[10px]"
          style={{ color: "var(--ink)" }}
          data-crosshair-readout={readout.ordinal}
          data-crosshair-source={probeRow ? "pointer" : "playhead"}
        >
          <span style={{ color: "var(--ink-soft)" }}>{readout.at}</span>
          <ReadoutCell label="O" value={readout.open} />
          <ReadoutCell label="H" value={readout.high} />
          <ReadoutCell label="L" value={readout.low} />
          <ReadoutCell label="C" value={readout.close} />
          {readout.positions.length === 0 ? (
            <ReadoutCell label="pos" value={null} />
          ) : (
            readout.positions.map((position) => (
              <span key={position.key} className="whitespace-nowrap" data-position-key={position.key} title={position.value}>
                <span style={{ color: "var(--ink-faint)" }}>pos {position.key} </span>
                {position.shown}
              </span>
            ))
          )}
          <ReadoutCell label="equity" value={readout.equity} />
          <span className="ml-auto whitespace-nowrap" style={{ color: "var(--ink-faint)" }} data-observation-count title="Panes: market candles, native position per label (units), equity.">
            {rows.length} observations
          </span>
        </div>
      ) : null}
      <div {...region.merge()}>
        <div ref={host} className={status === "ready" && smokeMotionAllowed() ? "s08-chart-in" : undefined} style={{ height: 420 }} aria-hidden="true" />
      </div>
      {region.nodes}
      {status !== "ready" ? (
        <span className="mono absolute left-3 top-3 text-[10px] italic" style={{ color: "var(--ink-faint)" }}>
          {status === "loading" ? "drawing candles…" : "the chart could not be drawn here; every observation is listed for screen readers"}
        </span>
      ) : null}
      <div className="sr-only">
        <table data-chart-table="fixed-replay-candles">
          <caption>Retained out-of-sample observations in this window, exact values</caption>
          <tbody>
            {rows.map((row) => (
              <tr key={row.source_ordinal} data-candle-row={row.source_ordinal}>
                <th scope="row">{new Date(row.at_utc_ms).toISOString()}</th>
                <td>{row.open}</td>
                <td>{row.high}</td>
                <td>{row.low}</td>
                <td>{row.close}</td>
                <td>{Object.entries(row.positions).map(([key, value]) => `${key} ${value}`).join(", ")}</td>
                <td>{row.equity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
