/**
 * Screen 08 — transition markers drawn over the candles, TradingView-style.
 *
 * The retained lane publishes target transitions (ENTRY / EXIT / FLIP /
 * RESIZE, settled at the close), never an order or a fill. So this layer draws
 * every transition kind that IS served and nothing else:
 *
 *   LONG entry  ▲ green, below the bar's low     SHORT entry ▼ red, above the bar's high
 *   EXIT        ■ the closed side's colour, softened      FLIP ◆ two-tone (closed | opened)
 *   RESIZE      small ◆ in the side's colour
 *
 * Each glyph is a solid shape with a 2px paper halo so it separates from a
 * candle body in the light and the dark theme; colours are design tokens only.
 * A thin dotted connector joins an opener to the transition that closes it
 * (order only, never a PnL). A hover card carries kind, side, bar time, close,
 * notional and fee as served — an absent field says "not published".
 *
 * Orders, fills and conditional (SL/TP/OCO) markers are not drawn because the
 * route published none; the capability strip beside the legend says so per
 * capability with the server's reason code.
 */

import { useId, type ReactNode } from "react";

import { smokeMotionAllowed } from "../execution/smokeMotion";
import { reasonCodeSentence } from "./researchRefusal";
import { REPLAY_GAP_WORDS, type CurrentSourceReplay } from "./replayClient";
import { glyphSize, pairTransitions, type MarkerKind, type MarkerSide } from "./executeWindows";
import { iso } from "./utcMinute";
import { formatMetric } from "./researchFormat";

export interface CandleMarker {
  ordinal: number;
  at: number;
  side: MarkerSide;
  kind: MarkerKind;
  /** The side held before the transition (FLAT when it opened from flat or the source did not say). */
  sideBefore?: MarkerSide;
  /** Served bar facts, kept as the served strings. */
  high?: string | null;
  low?: string | null;
  close?: string | null;
  fee?: string | null;
  turnover?: string | null;
}

const SIDE_COLOR: Record<MarkerSide, string> = { LONG: "var(--good)", SHORT: "var(--bad)", FLAT: "var(--ink-faint)" };

export const MARKER_LETTER: Record<MarkerKind, string> = { ENTRY: "", EXIT: "X", FLIP: "F", RESIZE: "R" };

/** The tag next to a glyph: L / S for an entry by side, X, F, R. */
export function markerLetter(marker: Pick<CandleMarker, "kind" | "side">): string {
  if (marker.kind === "ENTRY") return marker.side === "SHORT" ? "S" : "L";
  return MARKER_LETTER[marker.kind];
}

export function markerWords(marker: Pick<CandleMarker, "kind" | "side" | "sideBefore">): string {
  const kind = marker.kind.toLowerCase();
  return marker.kind === "EXIT"
    ? `exit ${(marker.sideBefore ?? "FLAT").toLowerCase() === "flat" ? "position" : (marker.sideBefore ?? "").toLowerCase()}`
    : `${kind} to ${marker.side.toLowerCase()}`;
}

/** The colour a glyph is drawn in: an exit takes the side it closed, everything else the side it opened. */
function inkOf(marker: Pick<CandleMarker, "kind" | "side" | "sideBefore">): string {
  if (marker.kind === "EXIT") return SIDE_COLOR[marker.sideBefore && marker.sideBefore !== "FLAT" ? marker.sideBefore : "FLAT"];
  return SIDE_COLOR[marker.side];
}

/** Above (true) or below (false) the bar: longs open below and close above, shorts the reverse. */
export function markerAbove(marker: Pick<CandleMarker, "kind" | "side" | "sideBefore">): boolean {
  if (marker.kind === "EXIT") return marker.sideBefore === "LONG";
  return marker.side === "SHORT";
}

const HALO = { stroke: "var(--paper-raised)", strokeWidth: 2, paintOrder: "stroke" } as const;

/** One glyph, centred on (0,0), `s` px across. */
export function GlyphShape({ marker, s }: { marker: Pick<CandleMarker, "kind" | "side" | "sideBefore">; s: number }) {
  const r = s / 2;
  if (marker.kind === "ENTRY") {
    const up = marker.side !== "SHORT";
    const d = up
      ? `M0 ${-r} L${r * 0.95} ${r * 0.8} L${-r * 0.95} ${r * 0.8} Z`
      : `M0 ${r} L${r * 0.95} ${-r * 0.8} L${-r * 0.95} ${-r * 0.8} Z`;
    return <path d={d} fill={inkOf(marker)} {...HALO} strokeLinejoin="round" />;
  }
  if (marker.kind === "EXIT") {
    const q = r * 0.78;
    return <rect x={-q} y={-q} width={q * 2} height={q * 2} rx={1.5} fill={inkOf(marker)} fillOpacity={0.8} {...HALO} />;
  }
  if (marker.kind === "FLIP") {
    const before = SIDE_COLOR[marker.sideBefore ?? "FLAT"];
    const after = SIDE_COLOR[marker.side];
    return (
      <g {...HALO} strokeLinejoin="round">
        <path d={`M0 ${-r} L${-r} 0 L0 ${r} Z`} fill={before} />
        <path d={`M0 ${-r} L${r} 0 L0 ${r} Z`} fill={after} />
      </g>
    );
  }
  const q = r * 0.55;
  return <path d={`M0 ${-q} L${q} 0 L0 ${q} L${-q} 0 Z`} fill={inkOf(marker)} {...HALO} strokeLinejoin="round" />;
}

/* --------------------------------------------------------------------- legend */

const LEGEND: Array<{ key: string; marker: Pick<CandleMarker, "kind" | "side" | "sideBefore">; word: string; tip: string }> = [
  { key: "long", marker: { kind: "ENTRY", side: "LONG" }, word: "long", tip: "Long entry — the position opened long at this bar's close (below the bar)." },
  { key: "short", marker: { kind: "ENTRY", side: "SHORT" }, word: "short", tip: "Short entry — the position opened short at this bar's close (above the bar)." },
  { key: "exit", marker: { kind: "EXIT", side: "FLAT", sideBefore: "LONG" }, word: "exit", tip: "Exit — the position went flat at this bar's close; drawn in the colour of the side it closed." },
  { key: "flip", marker: { kind: "FLIP", side: "SHORT", sideBefore: "LONG" }, word: "flip", tip: "Flip — closed one side and opened the other at the same close (left half = closed side, right half = opened side)." },
  { key: "resize", marker: { kind: "RESIZE", side: "LONG" }, word: "resize", tip: "Resize — same side, different size, at this bar's close." },
];

export function MarkerLegend() {
  return (
    <span className="mono flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[9.5px]" style={{ color: "var(--ink-soft)" }} data-marker-legend aria-label="marker legend">
      {LEGEND.map((item) => (
        <span key={item.key} className="flex items-center gap-1" title={item.tip} data-legend-glyph={item.key} aria-label={item.tip}>
          <svg width={16} height={16} viewBox="-8 -8 16 16" aria-hidden="true">
            <GlyphShape marker={item.marker} s={13} />
          </svg>
          {item.word}
        </span>
      ))}
      <span className="flex items-center gap-1" title="Dotted line — joins an opening transition to the transition that closes it (order only, no PnL)." data-legend-glyph="pair" aria-label="Dotted line joins an opening transition to its closing transition">
        <svg width={22} height={16} viewBox="0 0 22 16" aria-hidden="true">
          <line x1={1} y1={8} x2={21} y2={8} stroke="var(--ink-faint)" strokeWidth={1.5} strokeDasharray="2 3" />
        </svg>
        pair
      </span>
    </span>
  );
}

/* --------------------------------------------------------- capability strip */

type Fact = CurrentSourceReplay["route_capabilities"]["orders"];

const DOT: Record<string, { fill: string; border: string }> = {
  AVAILABLE: { fill: "var(--good)", border: "var(--good)" },
  NOT_APPLICABLE: { fill: "transparent", border: "var(--ink-faint)" },
  NOT_PUBLISHED: { fill: "transparent", border: "var(--warn)" },
};

/**
 * What this route cannot draw: orders, fills, trades, SL/TP, OCO … one chip per
 * capability, a state dot and the server's reason in the tooltip (and in the
 * chip's accessible text), so absence is visible without a sentence.
 */
export function CapabilityStrip({ items }: { items: ReadonlyArray<{ name: string; label: string; fact: Fact }> }) {
  return (
    <span className="flex flex-wrap items-center gap-1" data-capability-strip aria-label="route capabilities">
      {items.map(({ name, label, fact }) => {
        const code = fact.reason_code ?? fact.availability.reason_code;
        const dot = DOT[fact.state] ?? DOT.NOT_PUBLISHED!;
        const tip = `${label}: ${REPLAY_GAP_WORDS[fact.state]}${code ? ` — ${reasonCodeSentence(code) ?? code} (${code})` : ""}`;
        return (
          <span
            key={name}
            className="mono flex items-center gap-1 rounded-[3px] border px-[5px] text-[9.5px] leading-[16px]"
            style={{ borderColor: "var(--line)", color: "var(--ink-soft)", background: "var(--paper-raised)" }}
            title={tip}
            data-capability={name}
            data-capability-state={fact.state}
            data-capability-lane="retained"
            tabIndex={0}
            role="note"
            aria-label={tip}
          >
            <span aria-hidden="true" className="inline-block h-[7px] w-[7px] rounded-full" style={{ background: dot.fill, border: `1.5px solid ${dot.border}` }} data-capability-dot />
            {label}
            {code ? <span hidden data-reason-code={code}>{code}</span> : null}
          </span>
        );
      })}
    </span>
  );
}

/* -------------------------------------------------------------------- overlay */

export interface ChartHandles {
  timeX: (atMs: number) => number | null;
  priceY: (price: number) => number | null;
  /** The drawable width of the plot (the time scale), excluding the price axis. Absent in a test double: the layer then falls back to its own width. */
  plotWidth?: () => number | null;
}

/** A fold boundary drawn across the stitched chart: where the next fold's window begins, and what it is. */
export interface FoldBoundary {
  atMs: number;
  label: string;
  title: string;
}

const PULSE_CSS = `
@keyframes s08pulse { from { transform: scale(.55); opacity: .95 } to { transform: scale(1); opacity: .9 } }
.s08-pulse { transform-box: fill-box; transform-origin: center; animation: s08pulse .18s ease-out 1; }
@media (prefers-reduced-motion: reduce) { .s08-pulse { animation: none } }
`;

export function MarkerLayer({
  markers,
  handles,
  barSpacing,
  hover,
  selected,
  onHover,
  onPick,
  width,
  height,
  boundaries = [],
}: {
  /** Fold boundaries of the stitched view (play across folds), each a dashed rule with its fold label. */
  boundaries?: readonly FoldBoundary[];
  /** Markers inside the visible (revealed) window, in order. */
  markers: readonly CandleMarker[];
  /** Null while the chart is not drawn (or in a test double with no coordinates). */
  handles: ChartHandles | null;
  barSpacing: number | null;
  hover: number | null;
  selected: number | null;
  onHover: (ordinal: number | null) => void;
  onPick: (marker: CandleMarker) => void;
  width: number;
  height: number;
}) {
  const s = glyphSize(barSpacing);
  const clipId = `s08clip${useId().replace(/[^A-Za-z0-9_-]/g, "")}`;
  /* Nothing is drawn outside the plot: a bar scrolled out of view still has a coordinate (negative or past the axis), and an unclipped layer
     painted its glyphs over the sidebar. The clip is the plot rectangle; a glyph wholly outside it is hidden, so it is also not focusable. */
  const plotW = handles?.plotWidth?.() ?? width;
  const maxX = typeof plotW === "number" && plotW > 0 ? plotW : width;
  const inside = (x: number | null, y: number | null) => x !== null && y !== null && x >= -s && x <= maxX + s && y >= -s && y <= height + s;
  const positioned = markers.map((marker) => {
    const x = handles ? handles.timeX(marker.at) : null;
    const edge = markerAbove(marker) ? marker.high : marker.low;
    const yEdge = handles && edge != null ? handles.priceY(Number(edge)) : null;
    const y = yEdge === null ? null : yEdge + (markerAbove(marker) ? -(s * 0.85) : s * 0.85);
    const yClose = handles && marker.close != null ? handles.priceY(Number(marker.close)) : null;
    return { marker, x, y, yClose, shown: inside(x, y) };
  });
  const byOrdinal = new Map(positioned.map((entry) => [entry.marker.ordinal, entry]));
  const links = pairTransitions(markers)
    .map((pair) => ({ pair, a: byOrdinal.get(pair.from), b: byOrdinal.get(pair.to) }))
    .filter((entry) => entry.a && entry.b);
  const active = hover ?? null;
  const card = active === null ? null : byOrdinal.get(active);
  const motion = smokeMotionAllowed();
  return (
    <>
      <svg
        className="pointer-events-none absolute left-0 top-0 z-10"
        width={width}
        height={height}
        style={{ overflow: "hidden" }}
        data-marker-layer
        data-motion={motion ? "on" : "off"}
        aria-hidden="false"
      >
        <style>{PULSE_CSS}</style>
        <defs>
          <clipPath id={clipId}><rect x={0} y={0} width={maxX} height={height} /></clipPath>
        </defs>
        <g clipPath={`url(#${clipId})`}>
        {boundaries.map((boundary) => {
          const bx = handles ? handles.timeX(boundary.atMs) : null;
          if (bx === null || bx < -1 || bx > maxX + 1) return null;
          return (
            <g key={boundary.atMs} data-fold-boundary={boundary.label}>
              <title>{boundary.title}</title>
              <line x1={bx} y1={0} x2={bx} y2={height} stroke="var(--ink-faint)" strokeWidth={1} strokeDasharray="4 3" />
              <text x={bx + 5} y={32} fontSize={10} fontWeight={600} className="mono" fill="var(--ink-soft)" stroke="var(--paper-raised)" strokeWidth={3} paintOrder="stroke">{boundary.label}</text>
            </g>
          );
        })}
        {links.map(({ pair, a, b }) =>
          a!.x !== null && b!.x !== null && a!.yClose !== null && b!.yClose !== null ? (
            <line
              key={`${pair.from}-${pair.to}`}
              x1={a!.x} y1={a!.yClose} x2={b!.x} y2={b!.yClose}
              stroke="var(--ink-faint)" strokeWidth={1.5} strokeDasharray="2 3"
              data-marker-pair={`${pair.from}-${pair.to}`}
            />
          ) : (
            <line key={`${pair.from}-${pair.to}`} data-marker-pair={`${pair.from}-${pair.to}`} visibility="hidden" x1={0} y1={0} x2={0} y2={0} />
          ),
        )}
        </g>
        <g clipPath={`url(#${clipId})`}>
        {positioned.map(({ marker, x, y, shown }) => {
          const isSelected = selected === marker.ordinal;
          const isHover = hover === marker.ordinal;
          const tagText = `${markerLetter(marker)}${(isHover || isSelected) && marker.close != null ? ` ${marker.close}` : ""}`.trim();
          return (
            <g
              key={marker.ordinal}
              transform={`translate(${x ?? 0} ${y ?? 0})`}
              visibility={shown ? "visible" : "hidden"}
              className="pointer-events-auto cursor-pointer"
              role="button"
              tabIndex={0}
              aria-label={`${markerWords(marker)} at ${iso(marker.at)}`}
              data-marker-glyph={marker.ordinal}
              data-kind={marker.kind}
              data-side={marker.side}
              data-hover={isHover ? "true" : undefined}
              data-selected={isSelected ? "true" : undefined}
              onMouseEnter={() => onHover(marker.ordinal)}
              onMouseLeave={() => onHover(null)}
              onFocus={() => onHover(marker.ordinal)}
              onBlur={() => onHover(null)}
              onClick={() => onPick(marker)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onPick(marker);
                }
              }}
            >
              <circle r={s * 0.95} fill="transparent" />
              {isSelected || isHover ? (
                <circle
                  key={`${marker.ordinal}-${isSelected}`}
                  r={s * 0.95}
                  fill="none"
                  stroke={inkOf(marker)}
                  strokeWidth={2}
                  className={motion ? "s08-pulse" : undefined}
                  data-marker-ring
                />
              ) : null}
              <GlyphShape marker={marker} s={isSelected || isHover ? s + 2 : s} />
              {tagText ? (
                <text
                  x={s * 0.75}
                  y={markerAbove(marker) ? -s * 0.3 : s * 0.9}
                  fontSize={10}
                  fontWeight={600}
                  className="mono"
                  fill={inkOf(marker)}
                  stroke="var(--paper-raised)"
                  strokeWidth={3}
                  paintOrder="stroke"
                  data-marker-tag
                >
                  {tagText}
                </text>
              ) : null}
            </g>
          );
        })}
        </g>
      </svg>
      {card && card.shown ? <MarkerCard marker={card.marker} x={card.x!} y={card.y!} width={width} /> : null}
    </>
  );
}

function MarkerCard({ marker, x, y, width }: { marker: CandleMarker; x: number; y: number; width: number }) {
  const absent = (value: string | null | undefined, unit: "currency" | null = null): ReactNode => (value == null ? <em>not published</em> : <span data-exact={value} title={value}>{formatMetric(value, unit) ?? value}</span>);
  const flip = x > width - 190;
  return (
    <div
      className="mono pointer-events-none absolute z-10 rounded-[6px] border px-2.5 py-1.5 text-[10px] leading-[1.5]"
      style={{
        left: flip ? undefined : x + 14,
        right: flip ? width - x + 14 : undefined,
        top: Math.max(4, y - 24),
        borderColor: "var(--line-strong)",
        background: "var(--paper-raised)",
        color: "var(--ink)",
        boxShadow: "var(--shadow-e3)",
      }}
      data-marker-card={marker.ordinal}
      role="status"
    >
      <div style={{ color: inkOf(marker) }} className="font-semibold">
        {marker.kind.toLowerCase()} → {marker.side.toLowerCase()}
      </div>
      <div style={{ color: "var(--ink-soft)" }}>{iso(marker.at)}</div>
      <div>close {absent(marker.close)}</div>
      <div>notional {absent(marker.turnover, "currency")}</div>
      <div>fee {absent(marker.fee, "currency")}</div>
    </div>
  );
}
