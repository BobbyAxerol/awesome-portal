/**
 * Screen 08 — S4 Execute Replay (P17 + RS-02).
 *
 * The hi-fi replays a tape: candles, orders, fills, a trade blotter, a causal
 * chain per fill. The source behind this run publishes one thing of that list
 * — retrospective equity samples — and a typed absence for every other. The
 * screen keeps the hi-fi's frame and puts each panel's real answer in it:
 *
 *  - **the chart is an equity sample line, never candles.** It is labelled as
 *    a retrospective sample, and the playhead is a sample, not an account or a
 *    position. `state_at_cursor.execution_state` is printed as unavailable.
 *  - **sampled means sampled.** Under `EXTREMA_BUCKET_V1` the line joins
 *    bucket extrema; the screen says so and draws no point that was not sent.
 *  - **the transport is local.** Play, pause, step and seek move over the
 *    window already loaded. Another window is a button the reader presses.
 *  - **every absent panel keeps its place** and names the reason code the
 *    route published — no empty blotter, no invented order.
 *
 * Nothing on this screen writes. There is no POST, no command and no compute.
 */

import { useEffect, useMemo, useState } from "react";
import { ResearchScopedLink as Link } from "./ResearchScopedLink";

import { EChart } from "../charts/EChart";
import { baseOption, roleColorsNow } from "../charts/theme";
import { CandleOverviewStrip, CandleReplayBody, FixedCandleChart, chartMotion, fixedPositionKeys, hasBarLedger, paddedRange, windowMarkers, type CandleMarker } from "./ExecuteCandleReplay";
import { ProvenanceStrip } from "./ProvenanceStrip";
import { ResearchPanel } from "./ResearchPanel";
import { type EvidenceCursor } from "./evidenceCursor";
import { runScreenHref } from "./runScreenHref";
import {
  CAPABILITY_LABEL,
  REPLAY_GAP_WORDS,
  REPLAY_WITHHELD_WORDS,
  ROUTE_CAPABILITY_KEYS,
  ROUTE_STATE_NOTE,
  RETAINED_ANSWER_FOR,
  RETAINED_CAPABILITY_KEYS,
  RETAINED_CAPABILITY_LABEL,
  RETAINED_NO_FIELD,
  FIXED_ROUTE_NOTE,
  fixedFreshAbsence,
  gapReason,
  isRetainedReplay,
  type CurrentSourceObservation,
  type CurrentSourceReplay,
  type Replay,
  type ReplayPoint,
  type RouteCapabilityKey,
} from "./replayClient";
import { ReplayTransport, SPEEDS, replayKeyDown, useTransport } from "./replayTransport";
import { reasonCodeSentence } from "./researchRefusal";
import { humanise } from "./humanise";
import { isHubLaneReason, retainedReadiness } from "./retainedLane";
import { SplitBand, SplitBandNote, hubSplitBand, type SplitBandSlot } from "./SplitBand";
import type { ResearchState } from "./state";
import type { FixedReplaySlot, ReplayController, RetainedContext, RetainedReplaySlot } from "./useReplay";
import { iso } from "./utcMinute";
import { formatAxisValue, formatCount, formatFractionAxis, formatMetric, shortId } from "./researchFormat";
import { ShortId } from "./ShortId";
import { CopyEvidenceLink, SCREEN_FRAME, StageRunBar } from "./SplitDetail";
import { type ExecWindow } from "./executeWindows";

/* --------------------------------------------------------------- verbatim */

/**
 * Spec 08 §2.1's title — "how orders came to exist" — and the hi-fi's "the
 * frozen params trading the tape" both claim orders this source never
 * published. The stage name is kept and the claim after it is dropped (VD-TEXT-01):
 * no subtitle, no "rules of this screen" footer — each panel names its own
 * absence with the server's reason code.
 */
export const EXECUTE_TITLE = "S4 · Execute Replay";

export const PLAYHEAD_NOTE = "retrospective sample — not an execution state";

export const RETAINED_PLAYHEAD_NOTE = "retained observation — not a broker state";

/* VD-TEXT-01: the one-line forms of the route and sampling notes (replayClient keeps the long constants, unused here). */
const RETAINED_ROUTE_SHORT = "model observations only — no orders, fills or candles";
const SAMPLE_ROUTE_SHORT = "equity samples only — no orders, fills, positions or candles";
const RETAINED_SAMPLING_SHORT = "every observation · nothing bucketed";
const SAMPLING_SHORT: Record<"FULL" | "EXTREMA_BUCKET_V1", string> = {
  FULL: "every observation",
  EXTREMA_BUCKET_V1: "bucket extrema, not every observation",
};

/** Spec 08 §7, verbatim. */
export const PAUSED_HIDDEN = "paused (tab hidden)";

/* ------------------------------------------------------------------ parts */

const words = humanise;

function Chip({
  children,
  tone = "var(--ink-soft)",
  border = "var(--line)",
  ...rest
}: {
  children: React.ReactNode;
  tone?: string;
  border?: string;
} & Record<string, unknown>) {
  return (
    <span
      className="mono rounded-[3px] border px-[5px] text-[10px] leading-[16px]"
      style={{ color: tone, borderColor: border, background: "var(--paper-raised)" }}
      {...rest}
    >
      {children}
    </span>
  );
}

function Card({
  title,
  aside,
  children,
  ...rest
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
} & Record<string, unknown>) {
  return (
    <section
      className="flex min-w-0 flex-col gap-2 rounded-[8px] border px-4 py-3"
      style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
      aria-label={title}
      {...rest}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="mono text-[10px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** One named capability the route did not publish, with its code in the title. */
function CapabilityGap({ replay, capability }: { replay: Replay; capability: RouteCapabilityKey }) {
  const fact = replay.route_capabilities[capability];
  return (
    <span className="flex flex-wrap items-baseline gap-1.5" data-capability={capability} data-capability-state={fact.state}>
      <span className="mono text-[9px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
        {CAPABILITY_LABEL[capability]}
      </span>
      <span className="mono text-[10px] italic" style={{ color: "var(--ink-faint)" }} title={gapReason(fact)}>
        {REPLAY_GAP_WORDS[fact.state]}
      </span>
      <span hidden data-reason-code>
        {fact.reason_code ?? fact.availability.reason_code ?? words(fact.availability.state)}
      </span>
    </span>
  );
}

/**
 * E16-R1 · the P04 hub lane's whole-window price overview, or the reason it
 * has none.
 *
 * The overview is a summary the P06 child retained while it still held the
 * tape, not a bar ledger read back from an artifact — a run sealed before the
 * producer retained one has no bars left anywhere and says so here. The
 * absence keeps its own reason code beside the sentence, exactly as every
 * other absence on this screen does.
 */
function HubCandleOverview({ replay }: { replay: Replay }) {
  /*
   * Optional at the type level only for a bounded rolling deploy, the same
   * rule the P13 Hub's `run_identity`/`fold_navigation` follow: a replay
   * responder that has not rolled forward publishes no field at all, and the
   * screen must name that rather than imply the run had no bars.
   */
  const overview = replay.candle_overview as Replay["candle_overview"] | undefined;
  /*
   * F2b: `candle_overview` and `market_overview` describe the same bounded
   * OHLC overview (same scope, same bucket count and envelope on a real P04
   * run), so there is ONE chart, from `candle_overview`. `market_overview`
   * is drawn only when a responder that has not rolled forward publishes no
   * `candle_overview` at all and its own state is AVAILABLE — with a
   * "source overview" chip, and never both.
   */
  const legacy = replay.market_overview;
  if (!overview && legacy?.state === "AVAILABLE" && legacy.data) {
    return (
      <div className="flex flex-col gap-1 border-b pb-1.5" style={{ borderColor: "var(--line-soft)" }} data-candle-overview="AVAILABLE" data-overview-source="market_overview">
        <span className="mono flex items-center gap-2 text-[9.5px] uppercase tracking-[.1em]" style={{ color: "var(--ink-faint)" }}>
          price overview
          <span
            className="rounded-[3px] border px-[5px] text-[9px] normal-case leading-[14px] tracking-normal"
            style={{ borderColor: "var(--line)" }}
            title="This server answered with the legacy market overview (market_overview): the same bounded OHLC overview, not a per-bar replay."
            data-overview-chip="source"
          >
            source overview
          </span>
        </span>
        <CandleOverviewStrip
          overview={legacy.data}
          scope="out-of-sample window"
          label="out-of-sample window price range, as the source's bounded OHLC overview"
        />
      </div>
    );
  }
  if (
    !overview
    || overview.state !== "AVAILABLE"
    || overview.envelope === null
    || overview.sampling === null
    || overview.bucket_bars === null
    || overview.source_bar_count === null
    || overview.emitted_bucket_count === null
  ) {
    const code = overview
      ? overview.reason_code ?? overview.availability.reason_code
      : "P17_REPLAY_READ_PREDATES_RETAINED_CANDLE_OVERVIEW";
    return (
      <div
        className="flex flex-wrap items-baseline gap-1.5 border-b pb-1.5"
        style={{ borderColor: "var(--line-soft)" }}
        data-candle-overview="NOT_PUBLISHED"
      >
        <span className="mono flex-none text-[9.5px] uppercase tracking-[.1em]" style={{ color: "var(--ink-faint)" }}>
          price overview
        </span>
        <span className="mono text-[10px] italic" style={{ color: "var(--ink-faint)" }}>
          {REPLAY_GAP_WORDS[overview?.state ?? "NOT_PUBLISHED"]}
        </span>
        <span className="text-[10.5px] leading-[1.5]" style={{ color: "var(--ink-soft)" }} data-overview-note>
          {code === "P13_CANDLE_OVERVIEW_EXCEEDS_RECEIPT_BYTE_BUDGET" ? "No price overview stored for this run." : reasonCodeSentence(code) ?? "This run published no price overview."}
        </span>
        <span className="mono break-all text-[9px]" style={{ color: "var(--ink-faint)" }} data-reason-code>
          {code ?? words(overview!.availability.state)}
        </span>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1 border-b pb-1.5" style={{ borderColor: "var(--line-soft)" }} data-candle-overview="AVAILABLE">
      <span className="mono text-[9.5px] uppercase tracking-[.1em]" style={{ color: "var(--ink-faint)" }}>
        price overview
      </span>
      <CandleOverviewStrip
        overview={{
          source_bar_count: overview.source_bar_count,
          emitted_bucket_count: overview.emitted_bucket_count,
          bucket_bars: overview.bucket_bars,
          sampling: overview.sampling,
          envelope: overview.envelope,
          values: overview.values,
        }}
        scope="out-of-sample window"
        label="out-of-sample window price range, as retained OHLC buckets"
      />
    </div>
  );
}

/* ------------------------------------------------------------- the chart */

const GRID = { left: 64, right: 20 } as const;

const NOT_PUBLISHED = "not published";

/** Tooltip words for a transition marker at one ordinal; the kind and side are the bar's own. */
function markerLine(marker: CandleMarker | undefined): string {
  return marker ? `<br/>transition ${marker.kind.toLowerCase()} → ${marker.side.toLowerCase()}` : "";
}

/** Equity pane tooltip: the sample's own date, equity and the drawdown at the same x. */
export function equityTooltip(point: ReplayPoint | undefined, noun: string, marker?: CandleMarker): string {
  if (!point) return "";
  return `${noun} ${point.playback_ordinal + 1}<br/>${iso(point.at_utc_ms)}<br/>equity ${formatMetric(point.equity, "currency") ?? NOT_PUBLISHED}<br/>drawdown ${formatMetric(point.drawdown_fraction, "fraction") ?? NOT_PUBLISHED}${markerLine(marker)}`;
}

/** Drawdown pane tooltip: drawdown, with the equity at the same x. */
export function drawdownTooltip(point: ReplayPoint | undefined): string {
  if (!point) return "";
  return `${iso(point.at_utc_ms)}<br/>drawdown ${formatMetric(point.drawdown_fraction, "fraction") ?? NOT_PUBLISHED}<br/>equity ${formatMetric(point.equity, "currency") ?? NOT_PUBLISHED}`;
}

/** Position pane tooltip: accepted position and signal target; a null target is absent, never zero. */
export function positionTooltip(row: CurrentSourceObservation | undefined): string {
  if (!row) return "";
  const num = (value: string | null) => (value === null ? NOT_PUBLISHED : formatMetric(value, "count") ?? value);
  return `${iso(row.at_utc_ms)}<br/>accepted ${num(row.accepted_position)}<br/>target ${num(row.signal_target)}`;
}

/**
 * Equity and drawdown for the loaded window, drawn once per window. The
 * playhead is an overlay the transport moves, so a tick never re-sets the
 * chart option.
 */
function SampleChart({
  items,
  transport,
  noun = "sample",
  seriesName = "retrospective equity sample",
  caption = "Retrospective equity samples in this window, exact values",
  markerRows,
}: {
  /** Served target transitions of the window (retained lane); drawn at their real ordinals. */
  markerRows?: readonly CurrentSourceObservation[];
  items: readonly ReplayPoint[];
  transport: ReplayTransport;
  noun?: string;
  seriesName?: string;
  caption?: string;
}) {
  const labels = useMemo(() => items.map((point) => iso(point.at_utc_ms)), [items]);
  const markers = useMemo(() => (markerRows ? windowMarkers(markerRows) : []), [markerRows]);
  const equityOption = useMemo(() => {
    const role = roleColorsNow();
    const byOrdinal = new Map(markers.map((marker) => [marker.ordinal, marker]));
    const marked = items.flatMap((point, at) => (byOrdinal.has(point.playback_ordinal) ? [{ at, point, marker: byOrdinal.get(point.playback_ordinal)! }] : []));
    return baseOption({
      legend: { show: false },
      dataZoom: [] as never[],
      ...chartMotion(),
      grid: { left: GRID.left, right: GRID.right, top: 12, bottom: 26 },
      xAxis: { type: "category", data: labels, boundaryGap: false, axisLabel: { fontSize: 9 } },
      /* A flat window (equity unchanged) is padded by a hair of its level,
         never autoscaled to a ±50% band that reads as a swing (W3b/W5b). */
      /* E2b (audit 8.7): the padded min/max are not round numbers, so their labels sat on top of the
         nearest tick ("20,020 / 20,010"); only the round ticks are labelled. */
      yAxis: {
        type: "value",
        scale: true,
        splitNumber: 4,
        ...(paddedRange(items.map((point) => Number(point.equity))) ?? {}),
        axisLabel: { fontSize: 9, showMinLabel: false, showMaxLabel: false, formatter: (value: number) => formatAxisValue(String(value)) },
      },
      tooltip: {
        trigger: "axis",
        formatter: (params: unknown) => {
          const rows = params as { dataIndex: number }[];
          const point = items[rows[0]?.dataIndex ?? 0];
          return equityTooltip(point, noun, point ? byOrdinal.get(point.playback_ordinal) : undefined);
        },
      },
      series: [
        {
          type: "line",
          name: seriesName,
          /* A dot per sample: the line between two dots is a join, not data. */
          showSymbol: items.length <= 120,
          symbolSize: 3,
          data: items.map((point) => Number(point.equity)),
          lineStyle: { width: 1.3, color: role.oos },
          itemStyle: { color: role.oos },
        },
        ...(marked.length > 0
          ? [{
              type: "scatter" as const,
              name: "target transitions",
              symbol: "triangle",
              symbolSize: 8,
              z: 5,
              silent: true,
              data: marked.map(({ point, marker }) => [iso(point.at_utc_ms), Number(point.equity), marker.kind]),
              itemStyle: { color: role.is },
            }]
          : []),
      ],
    });
  }, [items, labels, noun, seriesName, markers]);

  const drawdownOption = useMemo(() => {
    const tone = roleColorsNow().oos;
    return baseOption({
      legend: { show: false },
      dataZoom: [] as never[],
      ...chartMotion(),
      grid: { left: GRID.left, right: GRID.right, top: 8, bottom: 22 },
      xAxis: { type: "category", data: labels, boundaryGap: false, axisLabel: { show: false } },
      tooltip: { formatter: (params: unknown) => drawdownTooltip(items[(params as { dataIndex: number }[])[0]?.dataIndex ?? 0]) },
      /* E2b (audit 8.7): a 90 px pane holds two labels, not eight; drawdown reads as a percentage. */
      yAxis: { type: "value", splitNumber: 1, axisLabel: { fontSize: 9, formatter: (value: number) => formatFractionAxis(value, 1) } },
      series: [
        {
          type: "line",
          name: "drawdown",
          showSymbol: false,
          areaStyle: { color: /^#[0-9a-f]{6}$/i.test(tone) ? `${tone}22` : tone },
          data: items.map((point) => Number(point.drawdown_fraction)),
          lineStyle: { width: 1, color: tone },
          itemStyle: { color: tone },
        },
      ],
    });
  }, [items, labels]);

  return (
    <div className="flex flex-col gap-1" data-chart="replay-equity">
      <div className="relative">
        <EChart option={equityOption} height={260} group="execute-replay" />
        <Playhead transport={transport} length={items.length} />
      </div>
      <span className="mono text-[9px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
        drawdown — restated from the same samples
      </span>
      <div className="relative">
        <EChart option={drawdownOption} height={90} group="execute-replay" />
        <Playhead transport={transport} length={items.length} />
      </div>
      {/* A table ignores width: 1px, so the clip sits on a wrapper (E2, S08 overflowed 91px at 660). */}
      <div className="sr-only">
        <table data-chart-table="replay-equity">
          <caption>{caption}</caption>
          <tbody>
            {items.map((point) => (
              <tr key={point.playback_ordinal}>
                <th scope="row">{new Date(point.at_utc_ms).toISOString()}</th>
                <td>{point.equity}</td>
                <td>{point.drawdown_fraction}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Playhead({ transport, length }: { transport: ReplayTransport; length: number }) {
  const { index } = useTransport(transport);
  if (length === 0) return null;
  const fraction = length > 1 ? index / (length - 1) : 0;
  return (
    <span
      aria-hidden="true"
      data-playhead={index}
      className="pointer-events-none absolute"
      style={{
        top: 4,
        bottom: 20,
        left: `calc(${GRID.left}px + (100% - ${GRID.left + GRID.right}px) * ${fraction})`,
        borderLeft: "1px dashed var(--ink-mute)",
      }}
    />
  );
}

/* ------------------------------------------------------------- transport */

function TransportBar({
  transport,
  items,
  total,
  noun = "sample",
  ordinalLabel,
}: {
  transport: ReplayTransport;
  items: ReadonlyArray<{ playback_ordinal: number; at_utc_ms: number }>;
  total: number | null;
  noun?: string;
  /** The fixed lane's ordinals are the source's own; it says them verbatim instead of the sample's `+1`. */
  ordinalLabel?: (at: { playback_ordinal: number; at_utc_ms: number }) => string;
}) {
  const snapshot = useTransport(transport);
  const point = items[snapshot.index];
  const disabled = items.length < 2;
  const NO_TRANSPORT = `Fewer than two ${noun}s are loaded, so there is nothing to play or step through.`;
  const button = "mono rounded-[6px] border px-2 text-[11px] leading-[24px]";
  const style = { borderColor: "var(--line)", background: "var(--paper-raised)" };
  const ordinalText = (at: { playback_ordinal: number } | undefined) =>
    at
      ? (ordinalLabel?.(at as { playback_ordinal: number; at_utc_ms: number }) ?? `${noun} ${at.playback_ordinal + 1} of ${total ?? "not published"}`)
      : `no ${noun}`;

  return (
    <div
      className="flex flex-wrap items-center gap-2 border-t px-1 pt-2"
      style={{ borderColor: "var(--line-soft)" }}
      data-transport
      data-playing={String(snapshot.playing)}
    >
      <button type="button" className={button} style={style} aria-label="window start" disabled={disabled}
        title={disabled ? NO_TRANSPORT : undefined} onClick={() => transport.seek(0)}>
        |◀
      </button>
      <button type="button" className={button} style={style} aria-label="step back" disabled={disabled}
        title={disabled ? NO_TRANSPORT : undefined} onClick={() => transport.step(-1)}>
        ◀◀
      </button>
      <button
        type="button"
        className={button}
        style={{ ...style, ...(snapshot.playing ? { borderColor: "var(--accent)", color: "var(--accent)" } : {}) }}
        aria-label={snapshot.playing ? "pause" : "play"}
        aria-pressed={snapshot.playing}
        data-action="play"
        disabled={disabled}
        title={disabled ? NO_TRANSPORT : undefined}
        onClick={() => transport.toggle()}
      >
        {snapshot.playing ? "❚❚" : "▶"}
      </button>
      <button type="button" className={button} style={style} aria-label="step forward" disabled={disabled}
        title={disabled ? NO_TRANSPORT : undefined} onClick={() => transport.step(1)}>
        ▶▶
      </button>
      <button
        type="button"
        className={button}
        style={style}
        aria-label="window end"
        disabled={disabled}
        title={disabled ? NO_TRANSPORT : undefined}
        onClick={() => transport.seek(items.length - 1)}
      >
        ▶|
      </button>
      <span className="flex gap-1" role="group" aria-label="speed">
        {SPEEDS.map((speed) => (
          <button
            key={speed}
            type="button"
            className={button}
            aria-pressed={snapshot.speed === speed}
            data-speed={speed}
            style={snapshot.speed === speed ? { borderColor: "var(--accent)", color: "var(--accent)", background: "var(--paper-sunken)" } : style}
            onClick={() => transport.setSpeed(speed)}
          >
            {speed}×
          </button>
        ))}
      </span>
      <input
        type="range"
        className="min-w-[120px] flex-1"
        style={{ accentColor: "var(--accent)" }}
        min={0}
        max={Math.max(0, items.length - 1)}
        value={snapshot.index}
        disabled={items.length === 0}
        aria-label="seek within the loaded window"
        aria-valuetext={ordinalText(point)}
        data-seek
        onChange={(event) => transport.seek(Number(event.target.value))}
      />
      <span className="mono whitespace-nowrap text-[10px]" style={{ color: "var(--ink-soft)" }} data-readout>
        {ordinalText(point)}
        {point ? ` · ${iso(point.at_utc_ms)}` : ""}
      </span>
      {snapshot.pausedHidden ? (
        <Chip data-paused-hidden tone="var(--warn)" border="var(--warn)">
          {PAUSED_HIDDEN}
        </Chip>
      ) : null}
    </div>
  );
}

/** The playhead's own values, from the loaded sample — and what they are not. */
function PlayheadReadout({ transport, items }: { transport: ReplayTransport; items: readonly ReplayPoint[] }) {
  const { index } = useTransport(transport);
  const point = items[index];
  if (!point) return null;
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1" data-playhead-readout={point.playback_ordinal}>
      <span className="mono text-[10px]">t {iso(point.at_utc_ms)}</span>
      <span className="mono text-[10px]" title={String(point.equity)}>equity {formatMetric(point.equity, "currency") ?? "not published"}</span>
      <span className="mono text-[10px]" title={String(point.drawdown_fraction)}>drawdown {formatMetric(point.drawdown_fraction, "fraction") ?? "not published"}</span>
      <span className="mono text-[9.5px] italic" style={{ color: "var(--ink-faint)" }} data-playhead-note>
        {PLAYHEAD_NOTE}
      </span>
    </div>
  );
}

/** Spec 08 §2.5's window of ~14 rows around the playhead — of samples, not events. */
function SampleLedger({ transport, items }: { transport: ReplayTransport; items: readonly ReplayPoint[] }) {
  const { index } = useTransport(transport);
  const start = Math.max(0, Math.min(index - 6, items.length - 14));
  const rows = items.slice(start, start + 14);
  return (
    <div className="overflow-x-auto" data-sample-ledger>
      <table className="w-full min-w-[420px] border-collapse">
        <thead>
          <tr className="mono text-left text-[9px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
            <th className="py-1 pr-3 font-normal">sample</th>
            <th className="py-1 pr-3 font-normal">at (UTC)</th>
            <th className="py-1 pr-3 font-normal">equity</th>
            <th className="py-1 font-normal">drawdown</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((point, offset) => {
            const at = start + offset;
            const current = at === index;
            return (
              <tr
                key={point.playback_ordinal}
                className="mono text-[10.5px]"
                data-sample-row={point.playback_ordinal}
                data-play={String(current)}
                aria-current={current ? "true" : undefined}
                style={{ background: current ? "var(--paper-sunken)" : undefined, borderBottom: "1px solid var(--line-soft)" }}
              >
                <td className="py-[3px] pr-3">
                  <button type="button" className="mono underline-offset-2 hover:underline" onClick={() => transport.seek(at)}>
                    {point.playback_ordinal + 1}
                  </button>
                </td>
                <td className="py-[3px] pr-3">{iso(point.at_utc_ms)}</td>
                <td className="py-[3px] pr-3" title={String(point.equity)}>{formatMetric(point.equity, "currency") ?? "not published"}</td>
                <td className="py-[3px]" title={String(point.drawdown_fraction)}>{formatMetric(point.drawdown_fraction, "fraction") ?? "not published"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* --------------------------------------------------------- retained lane */

function RetainedReplayPanel({ slot, onRead }: { slot: RetainedReplaySlot; onRead: () => void }) {
  return (
    <Card title="retained model replay" data-retained={slot.state}>
      {slot.state === "idle" ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[11px] leading-[1.5]" style={{ color: "var(--ink-soft)" }}>
            retained model samples · read on request
          </p>
          <button type="button" className="btn-ghost mono text-[10px]" data-action="read-retained" onClick={onRead}>
            read retained replay
          </button>
        </div>
      ) : slot.state === "loading" ? (
        <p className="mono text-[10px] italic" style={{ color: "var(--ink-faint)" }}>
          reading…
        </p>
      ) : slot.state === "refused" ? (
        <p className="text-[11px] leading-[1.5]" style={{ color: "var(--ink-soft)" }} data-retained-refusal={slot.refusal.status}>
          {slot.refusal.message}
        </p>
      ) : !isRetainedReplay(slot.replay) ? (
        <p
          className="text-[11px] leading-[1.5]"
          style={{ color: "var(--ink-soft)" }}
          data-retained-not-applicable={slot.replay.availability.reason_code ?? ""}
        >
          {reasonCodeSentence(slot.replay.availability.reason_code) ??
            "The retained walk-forward lane does not apply to this run."}
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-baseline gap-2">
            <Chip>{formatCount(slot.replay.replay.source_observation_count) ?? "not published"} retained observations</Chip>
            <Chip>{slot.replay.replay.rows.length} in this window</Chip>
            <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }}>
              engine {slot.replay.provenance.engine_version} · {slot.replay.provenance.profile_id}
            </span>
          </div>
          <p className="text-[10.5px] leading-[1.5]" style={{ color: "var(--ink-faint)" }} data-retained-scope>
            {words(slot.replay.replay.state_at_cursor.semantics)}
          </p>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {(["orders", "fills", "candles"] as const).map((key) => (
              <span key={key} className="mono text-[9px]" style={{ color: "var(--ink-faint)" }} data-retained-capability={key}>
                {key} — {REPLAY_GAP_WORDS[(slot.replay as CurrentSourceReplay).route_capabilities[key].state]}
              </span>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------ retained WFO lane (W3b) */

/**
 * One P04 route capability as the retained lane answers it: the lane's own
 * fact and reason code where it has one (`route_capabilities.*`), otherwise a
 * typed absence in the retained lane's name. A hub reason code is never
 * printed here — it describes the hub, not this run.
 */
function RetainedGap({ replay, capability }: { replay: CurrentSourceReplay; capability: RouteCapabilityKey }) {
  const key = RETAINED_ANSWER_FOR[capability];
  const fact = key ? replay.route_capabilities[key] : null;
  const label = key === "model_positions" ? RETAINED_CAPABILITY_LABEL[key] : CAPABILITY_LABEL[capability];
  if (fact) {
    const raw = fact.reason_code ?? fact.availability.reason_code;
    const code = raw && !isHubLaneReason(raw) ? raw : null;
    return (
      <span
        className="flex flex-wrap items-baseline gap-1.5"
        data-capability={capability}
        data-capability-state={fact.state}
        data-capability-lane="retained"
      >
        <span className="mono text-[9px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
          {label}
        </span>
        <span className="mono text-[10px] italic" style={{ color: "var(--ink-faint)" }}>
          {REPLAY_GAP_WORDS[fact.state]}
        </span>
        {fact.state === "AVAILABLE" ? (
          <span className="mono text-[9px]" style={{ color: "var(--ink-faint)" }}>
            in the replay above — research samples, not broker positions
          </span>
        ) : (
          <span hidden data-reason-code={code ?? ""} title={reasonCodeSentence(code) ?? undefined}>
            {code ?? words(fact.availability.state)}
          </span>
        )}
      </span>
    );
  }
  return <NoRetainedField capability={capability} label={label} />;
}

/** A fact the retained lane has no field for — said in that lane's name, without a server code. */
function NoRetainedField({ capability, label }: { capability: string; label: string }) {
  return (
    <span
      className="flex flex-wrap items-baseline gap-1.5"
      data-capability={capability}
      data-capability-state="NO_RETAINED_FIELD"
      data-capability-lane="retained"
    >
      <span className="mono text-[9px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
        {label}
      </span>
      <span className="mono text-[10px] italic" style={{ color: "var(--ink-faint)" }}>
        not published
      </span>
      <span
        className="mono text-[9px]"
        style={{ color: "var(--ink-faint)" }}
        data-reason-code={RETAINED_NO_FIELD}
        title={reasonCodeSentence(RETAINED_NO_FIELD) ?? undefined}
      >
        the retained WFO lane publishes no {label}
      </span>
    </span>
  );
}

function RetainedAbsentPanel({
  id,
  title,
  replay,
  capabilities,
  note,
}: {
  id: string;
  title: string;
  replay: CurrentSourceReplay;
  capabilities: readonly RouteCapabilityKey[];
  note?: string;
}) {
  return (
    <Card title={title} data-absent-panel={id}>
      {note ? (
        <p className="text-[11px] leading-[1.5]" style={{ color: "var(--ink-soft)" }}>
          {note}
        </p>
      ) : null}
      <div className="flex flex-col gap-1">
        {capabilities.map((capability) => (
          <RetainedGap key={capability} replay={replay} capability={capability} />
        ))}
      </div>
    </Card>
  );
}

/** Retained rows as the shared chart/transport's points; the ordinal is the source-table ordinal. */
function asPoints(rows: readonly CurrentSourceObservation[]): ReplayPoint[] {
  return rows.map(
    (row) =>
      ({
        playback_ordinal: row.source_ordinal,
        at_utc_ms: row.at_utc_ms,
        equity: row.equity,
        drawdown_fraction: row.drawdown_fraction,
        playback_cursor: row.playback_cursor,
      }) as ReplayPoint,
  );
}

/** The model's accepted position (solid) and signal target (dashed) per observation. */
function PositionChart({ rows, transport }: { rows: readonly CurrentSourceObservation[]; transport: ReplayTransport }) {
  const option = useMemo(() => {
    const role = roleColorsNow();
    const labels = rows.map((row) => iso(row.at_utc_ms));
    return baseOption({
      legend: { show: false },
      dataZoom: [] as never[],
      ...chartMotion(),
      grid: { left: GRID.left, right: GRID.right, top: 8, bottom: 22 },
      xAxis: { type: "category", data: labels, boundaryGap: false, axisLabel: { show: false } },
      yAxis: { type: "value", axisLabel: { fontSize: 9 } },
      tooltip: { formatter: (params: unknown) => positionTooltip(rows[(params as { dataIndex: number }[])[0]?.dataIndex ?? 0]) },
      series: [
        {
          type: "line",
          name: "accepted position",
          step: "end",
          showSymbol: false,
          data: rows.map((row) => Number(row.accepted_position)),
          lineStyle: { width: 1.2, color: role.oos },
          itemStyle: { color: role.oos },
        },
        {
          type: "line",
          name: "signal target",
          step: "end",
          showSymbol: false,
          /* A null target is a gap, never a zero. */
          data: rows.map((row) => (row.signal_target === null ? null : Number(row.signal_target))),
          lineStyle: { width: 1, type: "dashed", color: role.is },
          itemStyle: { color: role.is },
        },
      ],
    });
  }, [rows]);
  return (
    <div className="flex flex-col gap-1" data-chart="retained-position">
      <span className="mono text-[9px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
        model position — accepted (solid) · signal target (dashed)
      </span>
      <div className="relative">
        <EChart option={option} height={90} group="execute-replay" />
        <Playhead transport={transport} length={rows.length} />
      </div>
      {/* A table ignores width: 1px, so the clip sits on a wrapper (E2, S08 overflowed 91px at 660). */}
      <div className="sr-only">
        <table data-chart-table="retained-position">
          <caption>Model position per retained observation in this window, exact values</caption>
          <tbody>
            {rows.map((row) => (
              <tr key={row.source_ordinal}>
                <th scope="row">{new Date(row.at_utc_ms).toISOString()}</th>
                <td>{row.accepted_position}</td>
                <td>{row.signal_target ?? "not published"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** A retained decimal for reading (DQ-08); the exact string rides in the title. */
function Exact({ value, unit }: { value: string | null; unit: "currency" | "fraction" | null }) {
  if (value === null) return <em>not published</em>;
  const shown = formatMetric(value, unit);
  return <span title={value} data-exact={value}>{(shown ?? value).replace(/^-/, "\u2212")}</span>;
}

function RetainedReadout({ transport, rows }: { transport: ReplayTransport; rows: readonly CurrentSourceObservation[] }) {
  const { index } = useTransport(transport);
  const row = rows[index];
  if (!row) return null;
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1" data-playhead-readout={row.source_ordinal}>
      <span className="mono text-[10px]">t {iso(row.at_utc_ms)}</span>
      <span className="mono text-[10px]" data-readout-position>
        position <Exact value={row.accepted_position} unit={null} />
      </span>
      <span className="mono text-[10px]">
        signal target <Exact value={row.signal_target} unit={null} />
      </span>
      <span className="mono text-[10px]">equity <Exact value={row.equity} unit="currency" /></span>
      <span className="mono text-[10px]">return <Exact value={row.return_fraction} unit="fraction" /></span>
      <span className="mono text-[10px]">drawdown <Exact value={row.drawdown_fraction} unit="fraction" /></span>
      <span className="mono text-[9.5px] italic" style={{ color: "var(--ink-faint)" }} data-playhead-note>
        {RETAINED_PLAYHEAD_NOTE}
      </span>
    </div>
  );
}

/** ~14 retained observations around the playhead — observations, not events. */
function RetainedLedger({ transport, rows }: { transport: ReplayTransport; rows: readonly CurrentSourceObservation[] }) {
  const { index } = useTransport(transport);
  const start = Math.max(0, Math.min(index - 6, rows.length - 14));
  const shown = rows.slice(start, start + 14);
  const th = "py-1 pr-3 font-normal";
  return (
    <div className="overflow-x-auto" data-sample-ledger="retained">
      <table className="w-full min-w-[520px] border-collapse">
        <thead>
          <tr className="mono text-left text-[9px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
            <th className={th}>obs.</th>
            <th className={th}>at (UTC)</th>
            <th className={th}>position</th>
            <th className={th}>equity</th>
            <th className={th}>return</th>
            <th className="py-1 font-normal">drawdown</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((row, offset) => {
            const at = start + offset;
            const current = at === index;
            return (
              <tr
                key={row.source_ordinal}
                className="mono text-[10.5px]"
                data-sample-row={row.source_ordinal}
                data-play={String(current)}
                aria-current={current ? "true" : undefined}
                style={{ background: current ? "var(--paper-sunken)" : undefined, borderBottom: "1px solid var(--line-soft)" }}
              >
                <td className="py-[3px] pr-3">
                  <button type="button" className="mono underline-offset-2 hover:underline" onClick={() => transport.seek(at)}>
                    {row.source_ordinal + 1}
                  </button>
                </td>
                <td className="whitespace-nowrap py-[3px] pr-3">{iso(row.at_utc_ms)}</td>
                <td className="py-[3px] pr-3"><Exact value={row.accepted_position} unit={null} /></td>
                <td className="py-[3px] pr-3"><Exact value={row.equity} unit="currency" /></td>
                <td className="py-[3px] pr-3"><Exact value={row.return_fraction} unit="fraction" /></td>
                <td className="py-[3px]"><Exact value={row.drawdown_fraction} unit="fraction" /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RetainedStateAtCursor({ replay, pinned }: { replay: CurrentSourceReplay; pinned: boolean }) {
  const at = replay.replay.state_at_cursor;
  return (
    <div
      className="flex flex-col gap-1 rounded-[6px] border px-3 py-2"
      style={{ borderColor: "var(--line-soft)", background: "var(--paper-sunken)" }}
      data-state-at-cursor={at.state}
    >
      <span className="mono text-[9px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
        state at cursor — from the server{pinned && at.source_ordinal !== null ? " · pinned" : ""}
      </span>
      <span className="mono text-[10px]">
        {words(at.state)} · {words(at.semantics)}
        {at.source_ordinal !== null ? ` · observation ${at.source_ordinal + 1}` : ""}
        {at.at_utc_ms !== null ? ` · ${iso(at.at_utc_ms)}` : ""}
        {at.accepted_position !== null ? (
          <>
            {" · position "}
            <Exact value={at.accepted_position} unit={null} />
          </>
        ) : null}
        {at.equity !== null ? (
          <>
            {" · equity "}
            <Exact value={at.equity} unit="currency" />
          </>
        ) : null}
      </span>
      <span className="mono text-[10px] italic" style={{ color: "var(--ink-faint)" }} data-execution-state="NO_RETAINED_FIELD">
        execution state — not published
      </span>
    </div>
  );
}

/** The execution contract of a retained run: route from P11 progress, contract from the claim strip, readiness from the seal. */
function RetainedContract({ replay, context }: { replay: CurrentSourceReplay; context: RetainedContext | undefined }) {
  const identity = context?.identity ?? { state: "idle" as const };
  const claimSlot = context?.claim ?? { state: "idle" as const };
  const progress = identity.state === "ready" ? identity.identity.progress : null;
  const identityPending = identity.state !== "ready";
  const route = progress?.run?.execution_route ?? null;
  const readiness = identity.state === "ready" ? retainedReadiness(progress) : null;
  const contract = claimSlot.state === "ready" ? (claimSlot.claim?.execution_contract ?? null) : null;
  const contractCode = contract?.reason_code ?? contract?.availability.reason_code ?? null;
  const PROGRESS_SILENT = "the progress read did not answer";

  return (
    <Card
      title="execution contract"
      data-route-state="RETAINED_MODEL_SAMPLE"
      aside={
        <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-as-of>
          as of {iso(replay.as_of_utc_ms)}
        </span>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <Chip data-route-id={route ?? ""} tone="var(--accent)" border="var(--accent)">
          {route ?? (identityPending ? "route — reading…" : `route — ${PROGRESS_SILENT}`)}
        </Chip>
        <Chip data-route-state-chip>retained model replay</Chip>
        {contract && contract.state === "AVAILABLE" && contract.value !== null ? (
          <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-replay-contract={String(contract.value)}>
            contract {String(contract.value)}
            {contract.signal_phase ? ` · signal ${words(contract.signal_phase)}` : ""}
            {contract.fill_phase ? ` · fill ${words(contract.fill_phase)}` : ""}
            {contract.accounting_certified === true ? " · accounting certified" : ""}
          </span>
        ) : (
          <span className="mono text-[9.5px] italic" style={{ color: "var(--ink-faint)" }} data-replay-contract="">
            {claimSlot.state !== "ready"
              ? "contract — reading…"
              : `contract — not published${contractCode && !isHubLaneReason(contractCode) ? ` · ${contractCode}` : ""}`}
          </span>
        )}
        <Chip
          data-readiness={readiness ?? ""}
          title={
            readiness === "READY"
              ? "The attempt resolved from its source, materialized READY and sealed its mandatory bundle."
              : undefined
          }
        >
          {readiness ? `readiness ${readiness.toLowerCase().replace(/_/g, " ")}` : identityPending ? "readiness — reading…" : `readiness — ${PROGRESS_SILENT}`}
        </Chip>
        <RetainedGap replay={replay} capability="fold_capital" />
      </div>
      <p className="text-[11.5px] leading-[1.55]" style={{ color: "var(--ink-soft)" }} data-route-note>
        <span className="mono text-[9.5px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
          route contract{" "}
        </span>
        {RETAINED_ROUTE_SHORT}
      </p>
    </Card>
  );
}

function RetainedAbsences({ replay }: { replay: CurrentSourceReplay }) {
  const unfielded = ROUTE_CAPABILITY_KEYS.filter((key) => RETAINED_ANSWER_FOR[key] === undefined);
  return (
    <details
      className="rounded-[8px] border px-4 py-2"
      style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
      data-source-absences={unfielded.length}
      data-source-absences-lane="retained"
    >
      <summary className="mono cursor-pointer text-[10px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
        every capability the retained lane declared · {RETAINED_CAPABILITY_KEYS.length} lane facts · {unfielded.length}{" "}
        replay facts it has no field for
      </summary>
      <div className="mt-2 flex flex-col gap-1">
        {RETAINED_CAPABILITY_KEYS.map((key) => {
          const fact = replay.route_capabilities[key];
          const code = fact.reason_code ?? fact.availability.reason_code;
          return (
            <span
              key={key}
              className="mono break-all text-[9.5px]"
              style={{ color: "var(--ink-faint)" }}
              data-retained-capability={key}
              data-capability-state={fact.state}
              title={code && !isHubLaneReason(code) ? code : undefined}
            >
              {RETAINED_CAPABILITY_LABEL[key]} — {REPLAY_GAP_WORDS[fact.state]}
            </span>
          );
        })}
        {unfielded.map((key) => (
          <NoRetainedField key={key} capability={key} label={CAPABILITY_LABEL[key]} />
        ))}
      </div>
    </details>
  );
}

function RetainedBody({
  replay,
  slot,
  controller,
  transport,
}: {
  replay: CurrentSourceReplay;
  slot: Extract<RetainedReplaySlot, { state: "ready" }>;
  controller: ReplayController;
  transport: ReplayTransport;
}) {
  const rows = replay.replay.rows;
  const items = useMemo(() => asPoints(rows), [rows]);
  const selected = replay.replay.state_at_cursor.source_ordinal;
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    const at = selected === null ? 0 : items.findIndex((point) => point.playback_ordinal === selected);
    transport.load(items.length, Math.max(0, at));
  }, [items, selected, transport]);

  const snapshot = useTransport(transport);
  const playheadRow = rows[snapshot.index];
  const page = replay.replay.page;
  const count = replay.replay.source_observation_count;
  const inFlight = slot.inFlight === true;
  const contiguous = rows.every((row, i) => i === 0 || row.source_ordinal === rows[i - 1]!.source_ordinal + 1);

  const state: ResearchState = slot.pageRefusal
    ? { state: slot.pageRefusal.state, reason: slot.pageRefusal.message, mayRetry: slot.pageRefusal.mayRetry, retainsContent: true }
    : rows.length === 0
      ? { state: "empty", reason: "No retained observations in this window.", mayRetry: false, retainsContent: true }
      : {
          state: "partial",
          reason: "Model observations only.",
          mayRetry: false,
          retainsContent: true,
        };

  const provenance = replay.provenance;

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

      <RetainedContract replay={replay} context={controller.retainedContext} />

      <ResearchPanel
        title="stitched account — retained walk-forward observations"
        meta={`revision ${shortId(replay.revision)}`}
        state={state}
        minBodyHeight={280}
      >
        <div className="flex flex-col gap-2" data-replay-window="RETAINED" data-retained-in-flight={String(inFlight)} data-replay-section tabIndex={0} onKeyDown={replayKeyDown(transport)} aria-label="Replay. Space plays or pauses, the arrow keys step.">
          {slot.recovered ? (
            <p className="mono text-[10px]" role="status" style={{ color: "var(--warn)" }} data-recovered>
              The replay position expired. It was discarded and the first window was read again once.
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2" data-sampling={contiguous ? "RETAINED_TABLE" : "none"}>
            <Chip>
              {contiguous ? "every retained observation" : "sampling — not published by the retained lane"}
            </Chip>
            <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-counts>
              source observations {formatCount(count) ?? "not published"}
              {rows.length > 0
                ? ` · window ${rows[0]!.source_ordinal + 1}–${rows.at(-1)!.source_ordinal + 1} of ${formatCount(count) ?? "not published"}`
                : ""}
            </span>
            <RetainedGap replay={replay} capability="candle_windows" />
          </div>
          {contiguous ? (
            <p className="text-[10.5px] leading-[1.5]" style={{ color: "var(--ink-faint)" }} data-sampling-note>
              {RETAINED_SAMPLING_SHORT}
            </p>
          ) : null}

          {items.length > 0 ? (
            <>
              <SampleChart
                items={items}
                transport={transport}
                noun="observation"
                seriesName="retained equity observation"
                caption="Retained equity observations in this window, exact values"
                markerRows={rows}
              />
              <PositionChart rows={rows} transport={transport} />
              <TransportBar transport={transport} items={items} total={count} noun="observation" />
              <RetainedReadout transport={transport} rows={rows} />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="btn-ghost mono text-[10px]"
                  data-action="previous-window"
                  disabled={!page.has_previous || inFlight}
                  title={inFlight ? "A window is being read." : !page.has_previous ? "This window starts at the first observation." : undefined}
                  onClick={() => controller.retainedPreviousWindow?.()}
                >
                  ‹ earlier
                </button>
                <button
                  type="button"
                  className="btn-ghost mono text-[10px]"
                  data-action="next-window"
                  disabled={!page.has_more || inFlight}
                  title={inFlight ? "A window is being read." : !page.has_more ? "This window ends at the last observation." : undefined}
                  onClick={() => controller.retainedNextWindow?.()}
                >
                  later ›
                </button>
                <button
                  type="button"
                  className="btn-ghost mono text-[10px]"
                  data-action="pin-playhead"
                  disabled={!playheadRow || snapshot.playing || inFlight}
                  title={
                    snapshot.playing
                      ? "Pause first — the state is read for a resting playhead."
                      : inFlight
                        ? "A window is being read."
                        : !playheadRow
                          ? "No observation is under the playhead."
                          : undefined
                  }
                  onClick={() => {
                    if (!playheadRow) return;
                    setPinned(true);
                    controller.retainedPin?.(playheadRow.playback_cursor);
                  }}
                >
                  read state at playhead
                </button>
              </div>
            </>
          ) : null}

          <RetainedStateAtCursor replay={replay} pinned={pinned} />
        </div>
      </ResearchPanel>

      <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-3">
          <Card
            title="event ledger"
            data-panel="event-ledger"
            aside={<RetainedGap replay={replay} capability="execution_events" />}
          >
            {rows.length > 0 ? <RetainedLedger transport={transport} rows={rows} /> : null}
          </Card>
          <RetainedAbsentPanel
            id="trade-anatomy"
            title="trade anatomy — entry → exit"
            replay={replay}
            capabilities={["orders", "fills", "positions", "child_audit_provenance"]}
            note="No orders or fills published — no chain drawn."
          />
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <RetainedAbsentPanel
            id="trade-blotter"
            title="trade blotter"
            replay={replay}
            capabilities={["trades"]}
            note="No trade ledger published."
          />
          <RetainedAbsentPanel
            id="mae-mfe"
            title="MAE × MFE"
            replay={replay}
            capabilities={["mae_mfe"]}
            note="Needs trade records (not published)."
          />
          <RetainedAbsentPanel
            id="pnl-distribution"
            title="trade PnL distribution"
            replay={replay}
            capabilities={["trades"]}
            note="Needs trade records (not published)."
          />
          <RetainedAbsentPanel
            id="cost-timeline"
            title="cost timeline"
            replay={replay}
            capabilities={["funding"]}
            note="No funding or cost series published."
          />
          <RetainedAbsentPanel
            id="route-panel"
            title="route-aware facts"
            replay={replay}
            capabilities={["sl_tp_ambiguity", "oco_tree", "multi_leg"]}
                      />
        </div>
      </div>

      <RetainedAbsences replay={replay} />
    </>
  );
}

/* ---------------------------------------------------------------- screen */

/**
 * Which lane answers this run — the one fact the route and the screen must
 * agree on, because the route reads the split of whichever lane this is.
 */
/* ------------------------------------------- fixed/imported observation lane */

/**
 * S08 for a fixed/imported (P04-style) run whose source published retained OOS
 * observations (`researchFixedReplayObservationsGetV1`). It is *added under*
 * the legacy equity-sample panel, never in place of it: where the route is
 * absent or typed-absent this panel does not exist and the legacy lane reads
 * exactly as before.
 *
 * What it says is bounded by what the route says. The rows are market candles
 * and account observations (equity, native position labels). They are not an
 * orders/fills/trades ledger, so no order, fill or marker is drawn. The native
 * position keys (e.g. `DEFAULT`) are shown as the engine labelled them, and
 * the immutable market symbol is shown separately.
 */
function FixedObservationPanel({
  controller,
  slot,
}: {
  controller: ReplayController;
  slot: Extract<FixedReplaySlot, { state: "ready" }>;
}) {
  const page = slot.pages[slot.index]!;
  const manifest = page.manifest!;
  const rows = page.rows;
  const [transport] = useState(() => new ReplayTransport());
  useEffect(() => {
    transport.load(rows.length, 0);
  }, [rows, transport]);
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") transport.hide();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      transport.dispose();
    };
  }, [transport]);

  const items = useMemo(() => rows.map((row) => ({ playback_ordinal: row.source_ordinal, at_utc_ms: row.at_utc_ms })), [rows]);
  const keys = useMemo(() => fixedPositionKeys(rows), [rows]);
  const retained = page.counts.full_source_retained;
  const source = manifest.source;
  const hasNext = page.next_cursor !== null || slot.index < slot.pages.length - 1;
  const busy = slot.inFlight;
  const first = rows[0]!;
  const last = rows[rows.length - 1]!;

  return (
    <Card
      title="OOS observation replay — market and account"
      data-panel="fixed-observation-replay"
      data-replay-section
      tabIndex={0}
      onKeyDown={replayKeyDown(transport)}
      data-fixed-window={slot.index}
      data-fixed-in-flight={String(busy)}
      aria-busy={busy}
      aside={
        <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-fixed-revision>
          revision {shortId(page.revision)}
        </span>
      }
    >
      <div className="flex flex-wrap items-center gap-2" data-fixed-identity>
        <Chip data-market-symbol={manifest.market_symbol} title="The immutable market symbol of this run's preflight. Position labels below are the engine's own.">
          market {manifest.market_symbol}
        </Chip>
        {keys.map((key) => (
          <Chip key={key} data-native-position-key={key} title="The engine's own position label, kept as served — not the market symbol.">
            position label {key}
          </Chip>
        ))}
        <Chip data-fixed-profile={manifest.execution_profile_id}>{manifest.execution_profile_id}</Chip>
        <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-counts>
          retained {formatCount(retained) ?? "not published"} · in this window {formatCount(page.counts.returned) ?? "not published"} · source ordinals{" "}
          {first.source_ordinal}–{last.source_ordinal}
        </span>
        {source.state === "AVAILABLE" ? (
          <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-fixed-bounds title={`normalized rows sha256 ${source.normalized_rows_sha256}`}>
            OOS {iso(source.oos_start_utc_ms)} → {iso(source.oos_end_exclusive_utc_ms)} (end excluded)
          </span>
        ) : null}
      </div>
      <p className="text-[10.5px] leading-[1.5]" style={{ color: "var(--ink-faint)" }} data-fixed-scope>
        {FIXED_ROUTE_NOTE}
      </p>
      {slot.recovered ? (
        <p className="mono text-[10px]" role="status" style={{ color: "var(--warn)" }} data-recovered>
          The page position expired. It was discarded and the first page was read again once.
        </p>
      ) : null}
      <FixedCandleChart rows={rows} transport={transport} />
      <TransportBar
        transport={transport}
        items={items}
        total={retained}
        noun="observation"
        ordinalLabel={(at) => `observation ${at.playback_ordinal} of ${formatCount(retained) ?? "not published"} retained`}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn-ghost mono text-[10px]"
          data-action="fixed-previous-window"
          disabled={slot.index === 0 || busy}
          title={busy ? "A window is being read." : slot.index === 0 ? "This is the first window." : undefined}
          onClick={controller.fixedPreviousPage}
        >
          ‹ earlier
        </button>
        <button
          type="button"
          className="btn-ghost mono text-[10px]"
          data-action="fixed-next-window"
          disabled={!hasNext || busy}
          title={busy ? "A window is being read." : !hasNext ? "This window ends at the last retained observation." : undefined}
          onClick={controller.fixedNextPage}
        >
          later ›
        </button>
        <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-fixed-pages>
          window {slot.index + 1} · {slot.pages.length} read
        </span>
        {slot.pageRefusal ? (
          <span className="mono text-[10px]" role="status" style={{ color: "var(--warn)" }} data-fixed-page-refusal={slot.pageRefusal.status}>
            {slot.pageRefusal.message}
            {slot.pageRefusal.mayRetry && controller.fixedRetry ? (
              <button type="button" className="btn-ghost mono ml-2 text-[10px]" data-action="fixed-retry" onClick={controller.fixedRetry}>
                try again
              </button>
            ) : null}
          </span>
        ) : null}
      </div>
    </Card>
  );
}

export function executeLane(controller: ReplayController): "hub" | "retained" | "pending" {
  if (controller.retained.state === "ready" && isRetainedReplay(controller.retained.replay)) return "retained";
  if (controller.replay?.route.state === "NOT_PUBLISHED" && controller.retained.state === "loading") return "pending";
  return "hub";
}

export interface ExecuteScreenProps {
  runId: string;
  workspaceId?: string;
  cursor: EvidenceCursor;
  controller: ReplayController;
  transport: ReplayTransport;
  /**
   * E2c (8.5): the split behind the IS / OOS / HOLDOUT band, read once by the
   * route. The screen never reads it, so rendering the screen is still a pure
   * function of what its container already holds.
   */
  band?: SplitBandSlot;
  /**
   * Drawn inside the Evidence Hub's Execute tab (Screen 04): the hub owns the
   * frame, the title and the cursor, so the screen draws only its body — the
   * same reads and the same blocks as on its own route.
   */
  embedded?: boolean;
  /** `?window=` — IS | OOS | HOLDOUT (default OOS), owned by the container so the URL carries it. */
  windowKey?: ExecWindow;
  onWindow?: (next: ExecWindow) => void;
}

export function ExecuteScreen({
  runId,
  workspaceId,
  cursor,
  controller,
  transport,
  band = { state: "idle" },
  embedded = false,
  windowKey = "oos",
  onWindow,
}: ExecuteScreenProps) {
  const { replay, state } = controller;
  const replayWindow = replay?.equity_replay;
  const items = useMemo(() => replayWindow?.items ?? [], [replayWindow]);
  const [pinnedAt, setPinnedAt] = useState<number | null>(null);

  /* Which lane answers this run. The retained WFO lane, once it answered
     AVAILABLE, is the authority for every panel it covers; while it is being
     read after the hub declined, nothing of the hub's answer is drawn. */
  const retainedReplay =
    controller.retained.state === "ready" && isRetainedReplay(controller.retained.replay)
      ? controller.retained.replay
      : null;
  const lane = executeLane(controller);
  /* A fresh fixed run whose source declared no observations says so, with the server's code; every other absence leaves the legacy lane as it was. */
  const freshAbsence = controller.fixed?.state === "absent" ? fixedFreshAbsence(controller.fixed.page) : null;
  /* The retained lane was asked because the hub declined, and its read failed — except a 409, which is its typed "no sealed source yet". */
  const retainedFailure =
    controller.replay?.route.state === "NOT_PUBLISHED" && controller.retained.state === "refused" && controller.retained.refusal.status !== 409
      ? controller.retained.refusal
      : null;

  /* A new window places the playhead on the sample the server selected, or at
     its start. Nothing else moves the playhead but the reader. */
  useEffect(() => {
    if (lane !== "hub") return;
    const selected = replayWindow?.state_at_cursor.playback_ordinal ?? null;
    const at = selected === null ? 0 : items.findIndex((point) => point.playback_ordinal === selected);
    transport.load(items.length, Math.max(0, at));
  }, [items, transport, replayWindow, lane]);

  const snapshot = useTransport(transport);
  const playheadPoint = items[snapshot.index];

  return (
    <div
      className={embedded ? "flex w-full min-w-0 flex-col gap-[14px]" : `${SCREEN_FRAME} max-w-[1440px]`}
      data-screen="execute-replay"
      data-run={runId}
      data-lane={lane}
      data-fixed-replay={controller.fixed?.state ?? undefined}
      data-embedded={embedded ? "hub" : undefined}
    >
      {embedded ? null : (
      <>
      <nav className="flex flex-wrap items-center gap-1.5 text-[12px]" aria-label="Run path" style={{ color: "var(--ink-soft)" }}>
        <Link
          to={runScreenHref(runId, "hub", cursor, { stage: "execute" })}
          style={{ color: "var(--accent)" }}
          data-action="back-to-hub"
        >
          Evidence Flow
        </Link>
        <span style={{ color: "var(--ink-faint)" }}>/</span>
        <ShortId id={runId} label="run" />
        <span style={{ color: "var(--ink-faint)" }}>/</span>
        <span style={{ color: "var(--ink)" }}>
          Stage 4 · Execute Replay
        </span>
        <span style={{ color: "var(--ink-faint)" }}>·</span>
        <Link
          to={runScreenHref(runId, "freeze", cursor)}
          className="mono text-[10px]"
          style={{ color: "var(--accent)" }}
          data-action="back-to-freeze"
        >
          ← S3 Freeze
        </Link>
        <span style={{ color: "var(--ink-faint)" }}>·</span>
        <Link
          to={runScreenHref(runId, "report", cursor)}
          className="mono text-[10px]"
          style={{ color: "var(--accent)" }}
          data-next="run-report"
        >
          next: Run Report →
        </Link>
      </nav>

      <StageRunBar runId={runId} workspaceId={workspaceId} active={(controller.retained.state === "refused" && controller.retained.refusal.status === 409) || (replay != null && replay.route.state === "NOT_PUBLISHED")} />

      <div className="flex flex-col gap-[3px]">
        <h1 className="text-[22px] font-light tracking-[-0.01em] [line-height:normal]" style={{ fontFamily: "var(--font-display)" }}>
          {EXECUTE_TITLE}
        </h1>
      </div>
      <div className="flex flex-wrap items-center gap-3" data-header-actions>
        <CopyEvidenceLink />
        {/* Ways out that keep the run in hand: the windows' own screen, and the library the run came from. */}
        <Link
          to={runScreenHref(runId, "split", cursor)}
          className="mono text-[10px]"
          style={{ color: "var(--accent)" }}
          data-action="to-split"
          title="Split — the IS / OOS / holdout windows of this run"
        >
          Split ↗
        </Link>
      </div>
      </>
      )}

      {lane === "retained" && retainedReplay && controller.retained.state === "ready" && hasBarLedger(retainedReplay) ? (
        <CandleReplayBody
          replay={retainedReplay}
          slot={controller.retained}
          controller={controller}
          transport={transport}
          band={band}
          windowKey={windowKey}
          onWindow={onWindow}
          runId={runId}
          cursor={cursor}
        />
      ) : lane === "retained" && retainedReplay && controller.retained.state === "ready" ? (
        <RetainedBody
          replay={retainedReplay}
          slot={controller.retained}
          controller={controller}
          transport={transport}
        />
      ) : lane === "pending" ? (
        <ResearchPanel
          title="stitched account — retained walk-forward lane"
          state={{ state: "loading", reason: "Reading the retained walk-forward lane for this run.", mayRetry: false, retainsContent: false }}
          minBodyHeight={280}
        >
          {null}
        </ResearchPanel>
      ) : retainedFailure !== null ? (
        /* QA S08 UX-03: the hub declined and the retained lane's own read FAILED (denied, missing, server, network).
           That is not "the source did not publish a replay": say what happened, keep one state per meaning. */
        <ResearchPanel
          title="stitched account — retained walk-forward lane"
          state={{
            state: retainedFailure.state,
            reason: retainedFailure.message,
            mayRetry: retainedFailure.mayRetry,
            retainsContent: false,
          }}
          minBodyHeight={160}
          recovery={
            retainedFailure.mayRetry && controller.retryRetained ? (
              <button type="button" className="btn-ghost mono text-[10px]" data-action="retry-retained" onClick={controller.retryRetained}>
                Retry
              </button>
            ) : undefined
          }
        >
          {null}
        </ResearchPanel>
      ) : (
      <>
      {replay ? <ProvenanceStrip provenance={replay.provenance} /> : null}

      {replay ? (
        <Card
          title="execution contract"
          data-route-state={replay.route.state}
          aside={
            <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-as-of>
              as of {iso(replay.as_of_utc_ms)}
            </span>
          }
        >
          <div className="flex flex-wrap items-center gap-2">
            <Chip data-route-id tone="var(--accent)" border="var(--accent)">
              {replay.route.id ?? `route — ${REPLAY_WITHHELD_WORDS[replay.route.availability.state]}`}
            </Chip>
            <Chip data-route-state-chip>{words(replay.route.state)}</Chip>
            {replay.route.replay_contract ? (
              <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-replay-contract>
                contract {replay.route.replay_contract}
              </span>
            ) : null}
            <Chip data-readiness={replay.readiness}>{humanise(replay.readiness)}</Chip>
            {freshAbsence ? (
              <Chip data-fixed-absence={freshAbsence.code} title={`${freshAbsence.sentence ?? ""} ${freshAbsence.code}`.trim()}>
                observations not published
              </Chip>
            ) : null}
            <CapabilityGap replay={replay} capability="fold_capital" />
          </div>
          <p className="text-[11.5px] leading-[1.55]" style={{ color: "var(--ink-soft)" }} data-route-note>
            <span className="mono text-[9.5px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
              route contract{" "}
            </span>
            {replay.route.state === "RETROSPECTIVE_EQUITY_ONLY" ? SAMPLE_ROUTE_SHORT : ROUTE_STATE_NOTE[replay.route.state]}
          </p>
        </Card>
      ) : null}

      <ResearchPanel
        title="stitched account — retrospective equity"
        meta={replay?.revision ? `revision ${shortId(replay.revision)}` : undefined}
        state={state}
        minBodyHeight={280}
        actions={
          state.mayRetry ? (
            <button type="button" className="btn-ghost mono text-[10px]" data-action="reread" onClick={controller.reread}>
              reread replay
            </button>
          ) : undefined
        }
      >
        {replay && replayWindow ? (
          <div className="flex flex-col gap-2" data-replay-window={replayWindow.state} data-replay-section tabIndex={0} onKeyDown={replayKeyDown(transport)} aria-label="Replay. Space plays or pauses, the arrow keys step.">
            {controller.recovered ? (
              <p className="mono text-[10px]" role="status" style={{ color: "var(--warn)" }} data-recovered>
                The replay position expired. It was discarded and the replay was read again once.
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2" data-sampling={replayWindow.sampling ?? "none"}>
              {replayWindow.sampling ? (
                <Chip
                  tone={replayWindow.sampling === "FULL" ? "var(--ink-soft)" : "var(--warn)"}
                  border={replayWindow.sampling === "FULL" ? "var(--line)" : "var(--warn)"}
                >
                  sampling {words(replayWindow.sampling)}
                </Chip>
              ) : (
                <Chip>sampling — {REPLAY_WITHHELD_WORDS[replayWindow.availability.state]}</Chip>
              )}
              <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-counts>
                source observations {formatCount(replayWindow.source_observation_count) ?? "not published"} · emitted samples{" "}
                {formatCount(replayWindow.emitted_point_count) ?? "not published"}
                {items.length > 0
                  ? ` · window ${items[0]!.playback_ordinal + 1}–${items.at(-1)!.playback_ordinal + 1}`
                  : ""}
              </span>
            </div>
            {replayWindow.sampling ? (
              <p className="text-[10.5px] leading-[1.5]" style={{ color: "var(--ink-faint)" }} data-sampling-note>
                {SAMPLING_SHORT[replayWindow.sampling]}
              </p>
            ) : null}

            {/*
              * E2c (8.5): the hi-fi's IS / OOS / HOLDOUT band, from P14's
              * three-window truth for this run. The sealed holdout keeps its
              * own hatched tone here exactly as on Screens 05 and 07 — it is
              * never drawn in the colour of a window something read.
              */}
            <div className="flex flex-wrap items-center gap-3 border-y py-1.5" style={{ borderColor: "var(--line-soft)" }}>
              <span className="mono flex-none text-[9.5px] uppercase tracking-[.1em]" style={{ color: "var(--ink-faint)" }} data-band-fold>
                run windows
              </span>
              {band.state === "ready" && band.hub ? (
                <SplitBand band={hubSplitBand(band.hub)} />
              ) : (
                <SplitBandNote slot={band} />
              )}
            </div>

            {/*
              * E16-R1 (8.6): the price context the hi-fi draws as candles.
              * The producer now retains a bounded OHLC overview of the same
              * OOS window while the child still holds the tape, so this lane
              * can show the run's price range without inventing a bar. It is
              * the retained lane's strip, drawn by the same component: a
              * downsample that keeps every true extreme, captioned with its
              * bucket size. The per-bar candle chart is still absent, and the
              * chip above keeps saying so.
              */}
            <HubCandleOverview replay={replay} />

            {items.length > 0 ? (
              <>
                <SampleChart items={items} transport={transport} />
                <TransportBar transport={transport} items={items} total={replayWindow.emitted_point_count} />
                <PlayheadReadout transport={transport} items={items} />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="btn-ghost mono text-[10px]"
                    data-action="previous-window"
                    disabled={!replayWindow.page.has_previous || controller.inFlight}
                    title={
                      controller.inFlight
                        ? "A window is being read."
                        : !replayWindow.page.has_previous
                          ? "This window starts at the first sample."
                          : undefined
                    }
                    onClick={controller.previousWindow}
                  >
                    ‹ earlier
                  </button>
                  <button
                    type="button"
                    className="btn-ghost mono text-[10px]"
                    data-action="next-window"
                    disabled={!replayWindow.page.has_more || controller.inFlight}
                    title={
                      controller.inFlight
                        ? "A window is being read."
                        : !replayWindow.page.has_more
                          ? "This window ends at the last sample."
                          : undefined
                    }
                    onClick={controller.nextWindow}
                  >
                    later ›
                  </button>
                  <button
                    type="button"
                    className="btn-ghost mono text-[10px]"
                    data-action="pin-playhead"
                    disabled={!playheadPoint || snapshot.playing || controller.inFlight}
                    title={
                      snapshot.playing
                        ? "Pause first — the state is read for a resting playhead."
                        : controller.inFlight
                          ? "A window is being read."
                          : !playheadPoint
                            ? "No sample is under the playhead."
                            : undefined
                    }
                    onClick={() => {
                      if (!playheadPoint) return;
                      setPinnedAt(playheadPoint.playback_ordinal);
                      controller.pin(playheadPoint.playback_cursor, playheadPoint.playback_ordinal);
                    }}
                  >
                    read state at playhead
                  </button>
                </div>
              </>
            ) : null}

            <StateAtCursor replay={replay} pinnedAt={pinnedAt} />
          </div>
        ) : null}
      </ResearchPanel>

      {controller.fixed?.state === "ready" ? <FixedObservationPanel controller={controller} slot={controller.fixed} /> : null}

      {replay ? (
        <>
          {items.length > 0 ? (
            <Card title="event ledger" data-panel="event-ledger">
              <SampleLedger transport={transport} items={items} />
            </Card>
          ) : null}
          {/* ONE block for everything this source did not publish; every name carries its reason in its tooltip. */}
          <NotPublishedBlock replay={replay} />
          <RetainedReplayPanel slot={controller.retained} onRead={controller.ensureRetained} />
        </>
      ) : null}
      </>
      )}

    </div>
  );
}

/** What the server said about the selected playhead — read, never inferred. */
function StateAtCursor({ replay, pinnedAt }: { replay: Replay; pinnedAt: number | null }) {
  const at = replay.equity_replay.state_at_cursor;
  return (
    <div
      className="flex flex-col gap-1 rounded-[6px] border px-3 py-2"
      style={{ borderColor: "var(--line-soft)", background: "var(--paper-sunken)" }}
      data-state-at-cursor={at.state}
    >
      <span className="mono text-[9px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
        state at cursor — from the server
        {pinnedAt !== null && at.playback_ordinal === pinnedAt ? " · pinned" : ""}
      </span>
      <span className="mono text-[10px]">
        {words(at.state)} · {words(at.semantics)}
        {at.playback_ordinal !== null ? ` · sample ${at.playback_ordinal + 1}` : ""}
        {at.equity !== null ? (
          <>
            {" · equity "}
            <Exact value={at.equity} unit="currency" />
          </>
        ) : null}
        {at.drawdown_fraction !== null ? (
          <>
            {" · drawdown "}
            <Exact value={at.drawdown_fraction} unit="fraction" />
          </>
        ) : null}
      </span>
      <span className="mono text-[10px] italic" style={{ color: "var(--ink-faint)" }} data-execution-state={at.execution_state.state}>
        execution state — {REPLAY_GAP_WORDS[at.execution_state.state]} · {gapReason(at.execution_state)}
      </span>
    </div>
  );
}

/** ONE block: what the source did not publish. The names are the route's capabilities; each reason (sentence + code) is that name's tooltip. */
export function NotPublishedBlock({ replay }: { replay: Replay }) {
  const missing = ROUTE_CAPABILITY_KEYS.filter((key) => replay.route_capabilities[key].state !== "AVAILABLE");
  const sources = Object.entries(replay.source_absences);
  if (missing.length === 0 && sources.length === 0) return null;
  const sourceNote = sources.map(([key, gap]) => `${humanise(key)} — ${REPLAY_GAP_WORDS[gap.state]} · ${gapReason(gap)}`).join("\n");
  return (
    <section
      className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-[8px] border px-4 py-2"
      style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
      data-not-published-block={missing.length}
      data-source-absences={sources.length}
      title={sourceNote === "" ? undefined : sourceNote}
      aria-label={`Not published by this source: ${missing.map((key) => CAPABILITY_LABEL[key]).join(", ")}`}
    >
      <h2 className="mono text-[10px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
        Not published by this source
      </h2>
      {missing.map((key, index) => {
        const fact = replay.route_capabilities[key];
        const why = `${REPLAY_GAP_WORDS[fact.state]} · ${gapReason(fact)}`;
        return (
          <span key={key} className="mono text-[10.5px]" style={{ color: "var(--ink-soft)" }} data-capability={key} data-capability-state={fact.state} tabIndex={0} title={why} aria-label={`${CAPABILITY_LABEL[key]}: ${why}`}>
            {index > 0 ? "· " : ""}
            {CAPABILITY_LABEL[key]}
          </span>
        );
      })}
    </section>
  );
}

/** Page-visibility wiring for the transport, owned by the route. Keys are the sections' (`replayKeyDown`). */
export function useTransportInput(transport: ReplayTransport): void {
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") transport.hide();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [transport]);
}
