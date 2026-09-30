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
import { Link } from "react-router-dom";

import { EChart } from "../charts/EChart";
import { baseOption, roleColorsNow } from "../charts/theme";
import { CANDLE_SUBTITLE, CandleOverviewStrip, CandleReplayBody, hasBarLedger, paddedRange } from "./ExecuteCandleReplay";
import { ProvenanceStrip } from "./ProvenanceStrip";
import { ResearchPanel } from "./ResearchPanel";
import { deepDiveHref, type EvidenceCursor } from "./evidenceCursor";
import {
  CAPABILITY_LABEL,
  REPLAY_GAP_WORDS,
  REPLAY_WITHHELD_WORDS,
  ROUTE_CAPABILITY_KEYS,
  ROUTE_STATE_NOTE,
  SAMPLING_NOTE,
  RETAINED_ANSWER_FOR,
  RETAINED_CAPABILITY_KEYS,
  RETAINED_CAPABILITY_LABEL,
  RETAINED_NO_FIELD,
  RETAINED_ROUTE_NOTE,
  RETAINED_SAMPLING_NOTE,
  gapReason,
  isRetainedReplay,
  type CurrentSourceObservation,
  type CurrentSourceReplay,
  type Replay,
  type ReplayPoint,
  type RouteCapabilityKey,
} from "./replayClient";
import { ReplayTransport, SPEEDS, transportKey, useTransport } from "./replayTransport";
import { reasonCodeSentence } from "./researchRefusal";
import { isHubLaneReason, retainedReadiness } from "./retainedLane";
import { SplitBand, SplitBandNote, hubSplitBand, type SplitBandSlot } from "./SplitBand";
import type { ResearchState } from "./state";
import type { ReplayController, RetainedContext, RetainedReplaySlot } from "./useReplay";
import { iso } from "./utcMinute";
import { formatAxisValue, formatFractionAxis, formatMetric, shortId } from "./researchFormat";
import { ShortId } from "./ShortId";
import { CopyEvidenceLink, SCREEN_FRAME } from "./SplitDetail";

/* --------------------------------------------------------------- verbatim */

/**
 * Spec 08 §2.1's title — "how orders came to exist" — and the hi-fi's "the
 * frozen params trading the tape" both claim orders this source never
 * published. The stage name is kept; the claim after it is the one the
 * contract supports. Recorded as `VISUAL_DECISION_REQUIRED` in the P17 receipt.
 */
export const EXECUTE_TITLE = "S4 · Execute Replay — what this source can replay";

export const EXECUTE_SUBTITLE =
  "Retrospective equity samples, one at a time. Orders, fills, positions and candles were not published by this source, so each panel below names that absence instead of drawing it.";

/** Spec 08 §2.11, with its one route-only clause restated for this source. */
export const EXECUTE_RULES_FOOTER =
  "The transport is the only clock — every panel listens to the same sample. A missing artifact is declared with its reason, never rendered as an empty table. Replays are read-only: nothing here mutates a run, and playing, stepping or seeking never sends a request.";

export const PLAYHEAD_NOTE =
  "retrospective equity sample — not an execution account, position or order state";

/** The subtitle on a run the retained WFO lane answered. */
export const EXECUTE_SUBTITLE_RETAINED =
  "Retained walk-forward observations, one at a time — model position, equity, return and drawdown. Orders, fills and candles were not published by this lane, so each panel below names that absence instead of drawing it.";

export const RETAINED_PLAYHEAD_NOTE =
  "retained model observation — a research sample, not a broker position, order or execution state";

/** Spec 08 §7, verbatim. */
export const PAUSED_HIDDEN = "paused (tab hidden)";

/* ------------------------------------------------------------------ parts */

function words(value: string): string {
  return value.toLowerCase().replace(/_/g, " ");
}

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
        <h3 className="mono text-[10px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
          {title}
        </h3>
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
      <span className="mono break-all text-[9px]" style={{ color: "var(--ink-faint)" }} data-reason-code>
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
          {reasonCodeSentence(code) ?? "This run published no price overview."}
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

/** A hi-fi panel the source does not fill, kept at its place with its reasons. */
function AbsentPanel({
  id,
  title,
  replay,
  capabilities,
  note,
}: {
  id: string;
  title: string;
  replay: Replay;
  capabilities: readonly RouteCapabilityKey[];
  note: string;
}) {
  return (
    <Card title={title} data-absent-panel={id}>
      <p className="text-[11px] leading-[1.5]" style={{ color: "var(--ink-soft)" }}>
        {note}
      </p>
      <div className="flex flex-col gap-1">
        {capabilities.map((capability) => (
          <CapabilityGap key={capability} replay={replay} capability={capability} />
        ))}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------- the chart */

const GRID = { left: 64, right: 20 } as const;

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
}: {
  items: readonly ReplayPoint[];
  transport: ReplayTransport;
  noun?: string;
  seriesName?: string;
  caption?: string;
}) {
  const labels = useMemo(() => items.map((point) => iso(point.at_utc_ms)), [items]);
  const equityOption = useMemo(() => {
    const role = roleColorsNow();
    return baseOption({
      legend: { show: false },
      dataZoom: [] as never[],
      animation: false,
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
          return point
            ? `${noun} ${point.playback_ordinal + 1}<br/>${iso(point.at_utc_ms)}<br/>equity ${formatMetric(point.equity, "currency") ?? "not published"}`
            : "";
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
      ],
    });
  }, [items, labels, noun, seriesName]);

  const drawdownOption = useMemo(() => {
    const tone = roleColorsNow().oos;
    return baseOption({
      legend: { show: false },
      dataZoom: [] as never[],
      animation: false,
      grid: { left: GRID.left, right: GRID.right, top: 8, bottom: 22 },
      xAxis: { type: "category", data: labels, boundaryGap: false, axisLabel: { show: false } },
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
        <EChart option={equityOption} height={260} />
        <Playhead transport={transport} length={items.length} />
      </div>
      <span className="mono text-[9px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
        drawdown — restated from the same samples
      </span>
      <div className="relative">
        <EChart option={drawdownOption} height={90} />
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
}: {
  transport: ReplayTransport;
  items: readonly ReplayPoint[];
  total: number | null;
  noun?: string;
}) {
  const snapshot = useTransport(transport);
  const point = items[snapshot.index];
  const disabled = items.length < 2;
  const NO_TRANSPORT = `Fewer than two ${noun}s are loaded, so there is nothing to play or step through.`;
  const button = "mono rounded-[6px] border px-2 text-[11px] leading-[24px]";
  const style = { borderColor: "var(--line)", background: "var(--paper-raised)" };
  const ordinalText = (at: ReplayPoint | undefined) =>
    at ? `${noun} ${at.playback_ordinal + 1} of ${total ?? "not published"}` : `no ${noun}`;

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
            The retained-source lane replays model samples for one admitted Advanced-WFO profile. It is read
            only when you ask.
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
            <Chip>{slot.replay.replay.source_observation_count} retained observations</Chip>
            <Chip>{slot.replay.replay.rows.length} in this window</Chip>
            <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }}>
              engine {slot.replay.provenance.engine_version} · {slot.replay.provenance.profile_id}
            </span>
          </div>
          <p className="text-[10.5px] leading-[1.5]" style={{ color: "var(--ink-faint)" }} data-retained-scope>
            {words(slot.replay.replay.state_at_cursor.semantics)}. Model positions are research samples, not
            broker positions.
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
          <span
            className="mono break-all text-[9px]"
            style={{ color: "var(--ink-faint)" }}
            data-reason-code={code ?? ""}
            title={reasonCodeSentence(code) ?? undefined}
          >
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
  note: string;
}) {
  return (
    <Card title={title} data-absent-panel={id}>
      <p className="text-[11px] leading-[1.5]" style={{ color: "var(--ink-soft)" }}>
        {note}
      </p>
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
      animation: false,
      grid: { left: GRID.left, right: GRID.right, top: 8, bottom: 22 },
      xAxis: { type: "category", data: labels, boundaryGap: false, axisLabel: { show: false } },
      yAxis: { type: "value", axisLabel: { fontSize: 9 } },
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
        <EChart option={option} height={90} />
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
        {at.accepted_position !== null ? ` · position ${at.accepted_position}` : ""}
        {at.equity !== null ? ` · equity ${at.equity}` : ""}
      </span>
      <span className="mono text-[10px] italic" style={{ color: "var(--ink-faint)" }} data-execution-state="NO_RETAINED_FIELD">
        execution state — not published · the retained WFO lane publishes no execution state; a model position is not
        one
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
        {RETAINED_ROUTE_NOTE}
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
            >
              {RETAINED_CAPABILITY_LABEL[key]} — {REPLAY_GAP_WORDS[fact.state]}
              {code && !isHubLaneReason(code) ? ` · ${code}` : ""}
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
          reason: "Model observations only. Every execution fact below is named with the reason the retained lane gave.",
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
        <div className="flex flex-col gap-2" data-replay-window="RETAINED" data-retained-in-flight={String(inFlight)}>
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
              source observations {count}
              {rows.length > 0
                ? ` · window ${rows[0]!.source_ordinal + 1}–${rows.at(-1)!.source_ordinal + 1} of ${count}`
                : ""}
            </span>
            <RetainedGap replay={replay} capability="candle_windows" />
          </div>
          {contiguous ? (
            <p className="text-[10.5px] leading-[1.5]" style={{ color: "var(--ink-faint)" }} data-sampling-note>
              {RETAINED_SAMPLING_NOTE}
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
                  ‹ previous window
                </button>
                <button
                  type="button"
                  className="btn-ghost mono text-[10px]"
                  data-action="next-window"
                  disabled={!page.has_more || inFlight}
                  title={inFlight ? "A window is being read." : !page.has_more ? "This window ends at the last observation." : undefined}
                  onClick={() => controller.retainedNextWindow?.()}
                >
                  next window ›
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
                <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }}>
                  windows are read only when you ask; playing stops at the end of this one.
                </span>
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
            <p className="text-[11px] leading-[1.5]" style={{ color: "var(--ink-soft)" }}>
              The retained lane publishes no execution event stream, so the rows below are the loaded retained
              observations around the playhead — observations, not events.
            </p>
            {rows.length > 0 ? <RetainedLedger transport={transport} rows={rows} /> : null}
          </Card>
          <RetainedAbsentPanel
            id="trade-anatomy"
            title="trade anatomy — entry → exit"
            replay={replay}
            capabilities={["orders", "fills", "positions", "child_audit_provenance"]}
            note="A causal chain links a signal to an order to a fill. The retained lane publishes the model's signal target and accepted position per observation, but no orders or fills, so no chain is drawn and none is inferred from the position line."
          />
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <RetainedAbsentPanel
            id="trade-blotter"
            title="trade blotter"
            replay={replay}
            capabilities={["trades"]}
            note="The retained lane publishes no trade ledger. A blotter built from position changes would be a guess at trades, not this run's trades."
          />
          <RetainedAbsentPanel
            id="mae-mfe"
            title="MAE × MFE — pain vs potential per trade"
            replay={replay}
            capabilities={["mae_mfe"]}
            note="Per-trade excursions need trades and their price paths; the retained lane publishes neither."
          />
          <RetainedAbsentPanel
            id="pnl-distribution"
            title="trade PnL distribution"
            replay={replay}
            capabilities={["trades"]}
            note="A PnL distribution counts closed trades. The retained lane's return distribution is per observation, not per trade, so no trade histogram is drawn here."
          />
          <RetainedAbsentPanel
            id="cost-timeline"
            title="cost timeline"
            replay={replay}
            capabilities={["funding"]}
            note="The retained lane publishes no funding or cost series."
          />
          <RetainedAbsentPanel
            id="route-panel"
            title="route-aware facts"
            replay={replay}
            capabilities={["sl_tp_ambiguity", "oco_tree", "multi_leg"]}
            note="Intrabar ambiguity, OCO trees and multi-leg facts are each a separate relation. The retained lane has a field for none of them."
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
export function executeLane(controller: ReplayController): "hub" | "retained" | "pending" {
  if (controller.retained.state === "ready" && isRetainedReplay(controller.retained.replay)) return "retained";
  if (controller.replay?.route.state === "NOT_PUBLISHED" && controller.retained.state === "loading") return "pending";
  return "hub";
}

export interface ExecuteScreenProps {
  runId: string;
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
}

export function ExecuteScreen({
  runId,
  cursor,
  controller,
  transport,
  band = { state: "idle" },
  embedded = false,
}: ExecuteScreenProps) {
  const { replay, state } = controller;
  const replayWindow = replay?.equity_replay;
  const items = useMemo(() => replayWindow?.items ?? [], [replayWindow]);
  const run = encodeURIComponent(runId);
  const [pinnedAt, setPinnedAt] = useState<number | null>(null);

  /* Which lane answers this run. The retained WFO lane, once it answered
     AVAILABLE, is the authority for every panel it covers; while it is being
     read after the hub declined, nothing of the hub's answer is drawn. */
  const retainedReplay =
    controller.retained.state === "ready" && isRetainedReplay(controller.retained.replay)
      ? controller.retained.replay
      : null;
  const lane = executeLane(controller);

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
      data-embedded={embedded ? "hub" : undefined}
    >
      {embedded ? null : (
      <>
      <nav className="flex flex-wrap items-center gap-1.5 text-[12px]" aria-label="Breadcrumb" style={{ color: "var(--ink-soft)" }}>
        <Link
          to={deepDiveHref(`/research/quantbt/runs/${run}/evidence`, { ...cursor, stage: "execute" })}
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
          to={deepDiveHref(`/research/quantbt/runs/${run}/freeze`, { ...cursor, stage: "freeze" })}
          className="mono text-[10px]"
          style={{ color: "var(--accent)" }}
          data-action="back-to-freeze"
        >
          ← S3 Freeze
        </Link>
        <span style={{ color: "var(--ink-faint)" }}>·</span>
        <Link
          to={`/research/quantbt/runs/${run}/report`}
          className="mono text-[10px]"
          style={{ color: "var(--accent)" }}
          data-next="run-report"
        >
          next: Run Report →
        </Link>
      </nav>

      <div className="flex flex-col gap-[3px]">
        <h1 className="text-[22px] font-light tracking-[-0.01em] [line-height:normal]" style={{ fontFamily: "var(--font-display)" }}>
          {EXECUTE_TITLE}
        </h1>
        <p className="text-[13.5px] italic [line-height:normal]" style={{ fontFamily: "var(--font-display)", color: "var(--ink-faint)" }} data-subtitle>
          {lane === "retained" && retainedReplay && hasBarLedger(retainedReplay)
            ? CANDLE_SUBTITLE
            : lane === "retained"
              ? EXECUTE_SUBTITLE_RETAINED
              : EXECUTE_SUBTITLE}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3" data-header-actions>
        <CopyEvidenceLink />
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
            <Chip data-readiness={replay.readiness}>readiness {replay.readiness.toLowerCase()}</Chip>
            <CapabilityGap replay={replay} capability="fold_capital" />
          </div>
          <p className="text-[11.5px] leading-[1.55]" style={{ color: "var(--ink-soft)" }} data-route-note>
            <span className="mono text-[9.5px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
              route contract{" "}
            </span>
            {ROUTE_STATE_NOTE[replay.route.state]}
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
          <div className="flex flex-col gap-2" data-replay-window={replayWindow.state}>
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
                source observations {replayWindow.source_observation_count ?? "not published"} · emitted samples{" "}
                {replayWindow.emitted_point_count ?? "not published"}
                {items.length > 0
                  ? ` · window ${items[0]!.playback_ordinal + 1}–${items.at(-1)!.playback_ordinal + 1}`
                  : ""}
              </span>
              <CapabilityGap replay={replay} capability="candle_windows" />
            </div>
            {replayWindow.sampling ? (
              <p className="text-[10.5px] leading-[1.5]" style={{ color: "var(--ink-faint)" }} data-sampling-note>
                {SAMPLING_NOTE[replayWindow.sampling]}
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
                    ‹ previous window
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
                    next window ›
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
                  <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }}>
                    windows are read only when you ask; playing stops at the end of this one.
                  </span>
                </div>
              </>
            ) : null}

            <StateAtCursor replay={replay} pinnedAt={pinnedAt} />
          </div>
        ) : null}
      </ResearchPanel>

      {replay ? (
        <>
          <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="flex min-w-0 flex-col gap-3">
              <Card
                title="event ledger"
                data-panel="event-ledger"
                aside={<CapabilityGap replay={replay} capability="execution_events" />}
              >
                <p className="text-[11px] leading-[1.5]" style={{ color: "var(--ink-soft)" }}>
                  No execution event stream was published, so the rows below are the loaded equity samples
                  around the playhead — samples, not events.
                </p>
                {items.length > 0 ? <SampleLedger transport={transport} items={items} /> : null}
              </Card>
              <AbsentPanel
                id="trade-anatomy"
                title="trade anatomy — entry → exit"
                replay={replay}
                capabilities={["orders", "fills", "positions", "child_audit_provenance"]}
                note="A causal chain links a signal to an order to a fill. None of those links was published for this route, so no chain is drawn and none is inferred from the equity line."
              />
            </div>
            <div className="flex min-w-0 flex-col gap-3">
              <AbsentPanel
                id="trade-blotter"
                title="trade blotter"
                replay={replay}
                capabilities={["trades"]}
                note="No trade ledger was published. A blotter built from equity changes would be a guess at trades, not this run's trades."
              />
              <AbsentPanel
                id="mae-mfe"
                title="MAE × MFE — pain vs potential per trade"
                replay={replay}
                capabilities={["mae_mfe"]}
                note="Per-trade excursions need trades and their price paths; neither was published."
              />
              <AbsentPanel
                id="pnl-distribution"
                title="trade PnL distribution"
                replay={replay}
                capabilities={["trades"]}
                note="A PnL distribution counts closed trades. No trade ledger was published, so there is nothing to count and no histogram is drawn from equity steps."
              />
              <AbsentPanel
                id="cost-timeline"
                title="cost timeline"
                replay={replay}
                capabilities={["funding"]}
                note="Funding and cost series were not published for this route."
              />
              <AbsentPanel
                id="route-panel"
                title="route-aware facts"
                replay={replay}
                capabilities={["sl_tp_ambiguity", "oco_tree", "multi_leg"]}
                note="Intrabar ambiguity, OCO trees and multi-leg facts are each a separate published relation. The route declared all three."
              />
            </div>
          </div>

          <SourceAbsences replay={replay} />
          <RetainedReplayPanel slot={controller.retained} onRead={controller.ensureRetained} />
        </>
      ) : null}
      </>
      )}

      <footer className="flex flex-col gap-1 border-t pt-3" style={{ borderColor: "var(--line)" }}>
        <span className="mono text-[9.5px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
          rules of this screen
        </span>
        <p className="text-[11.5px] leading-[1.55]" style={{ color: "var(--ink-soft)" }} data-rules>
          {EXECUTE_RULES_FOOTER}
        </p>
      </footer>
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
        {at.equity !== null ? ` · equity ${at.equity}` : ""}
        {at.drawdown_fraction !== null ? ` · drawdown ${at.drawdown_fraction}` : ""}
      </span>
      <span className="mono text-[10px] italic" style={{ color: "var(--ink-faint)" }} data-execution-state={at.execution_state.state}>
        execution state — {REPLAY_GAP_WORDS[at.execution_state.state]} · {gapReason(at.execution_state)}
      </span>
    </div>
  );
}

function SourceAbsences({ replay }: { replay: Replay }) {
  const entries = Object.entries(replay.source_absences);
  return (
    <details
      className="rounded-[8px] border px-4 py-2"
      style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
      data-source-absences={entries.length}
    >
      <summary className="mono cursor-pointer text-[10px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
        every capability the route declared · {ROUTE_CAPABILITY_KEYS.length} route facts · {entries.length} source absences
      </summary>
      <div className="mt-2 flex flex-col gap-1">
        {ROUTE_CAPABILITY_KEYS.map((key) => (
          <CapabilityGap key={key} replay={replay} capability={key} />
        ))}
        {entries.map(([key, gap]) => (
          <span key={key} className="mono break-all text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-source-absence={key}>
            {words(key)} — {REPLAY_GAP_WORDS[gap.state]} · {gapReason(gap)}
          </span>
        ))}
      </div>
    </details>
  );
}

/** Keyboard and page-visibility wiring for the transport, owned by the route. */
export function useTransportInput(transport: ReplayTransport): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (transportKey(transport, event)) event.preventDefault();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") transport.hide();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [transport]);
}
