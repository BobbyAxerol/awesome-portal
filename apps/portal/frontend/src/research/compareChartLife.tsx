/**
 * Motion and hover for the Compare / Run-library hand-drawn SVG charts.
 *
 * These charts keep the geometry the server's strings were already drawn
 * with. What is added here is life, not data:
 *
 *  - a draw-in on the first mount of a dataset (never on a re-render or a
 *    poll), off under `prefers-reduced-motion` and `smokeMotionAllowed()`;
 *  - a nearest-point scrub (pointer, touch tap, or arrows / Home / End on the
 *    focused chart) that shows the point's own served strings.
 *
 * Nothing is computed from the values: a tooltip prints the string the server
 * sent, or the typed absence text.
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

import { smokeMotionAllowed } from "../execution/smokeMotion";
import { nearestIndex, useChartContract } from "./chartContract";

/** ECharts' own entry timing: 500-700 ms, cubicOut. */
export const DRAW_IN_MS = 600;
export const DRAW_IN_EASING = "cubic-bezier(0.215, 0.61, 0.355, 1)";

/** Datasets already drawn in this page's life: a remount of the same data stays still. */
const drawn = new Set<string>();

/** True when this dataset should animate in now: first sight only, motion allowed. */
export function shouldDrawIn(key: string): boolean {
  return smokeMotionAllowed() && !drawn.has(key);
}

export function useDrawIn(key: string): boolean {
  const [animate] = useState(() => shouldDrawIn(key));
  useEffect(() => {
    drawn.add(key);
  }, [key]);
  return animate;
}

/** A cheap identity for a dataset: length plus both ends, as served. */
export function datasetKey(scope: string, items: readonly { at_utc_ms: number }[], ...ends: (string | null | undefined)[]): string {
  const first = items[0]?.at_utc_ms ?? "";
  const last = items[items.length - 1]?.at_utc_ms ?? "";
  return [scope, items.length, first, last, ...ends].join("|");
}

/** Vertices of a path the geometry wrote (`M x y L x y ...`), as percentages of the 1000 box. */
export function pathVertices(path: string, box = 1000): { x: number; y: number }[] {
  return path
    .slice(1)
    .split(" L")
    .map((pair) => pair.trim().split(" "))
    .map(([x, y]) => ({ x: (Number(x) / box) * 100, y: (Number(y) / box) * 100 }))
    .filter((v) => Number.isFinite(v.x) && Number.isFinite(v.y));
}

export { nearestIndex };

/** What a scrub region says about itself: its name, one point's own served words, a one-line summary. */
export interface ScrubWords {
  label: string;
  describe(i: number): string;
  summary: string;
}

/**
 * Nearest-point scrub over `xs` (percent of plot width): a thin wrapper over the chart contract.
 * `handlers` are the pointer/key handlers alone (old callers); `region` is the whole contract region
 * (role, name, tab stop, touch-action) and `nodes` the sr-only live + summary, both for a caller that passes `words`.
 */
export function useScrub(xs: readonly number[], words?: ScrubWords) {
  const c = useChartContract({ label: words?.label ?? "chart", noun: "point", count: xs.length, describe: words?.describe ?? (() => ""), summary: words?.summary ?? "", xs });
  const { onPointerMove, onPointerDown, onPointerLeave, onBlur, onKeyDown } = c.regionProps;
  const { className: _ring, ...region } = c.regionProps;
  return { index: c.index, handlers: { onPointerMove, onPointerDown, onPointerLeave, onBlur, onKeyDown }, region, nodes: c.nodes };
}

export interface ScrubDot {
  y: number;
  color: string;
  hidden?: boolean;
}

const TIP: CSSProperties = {
  position: "absolute",
  zIndex: 2,
  pointerEvents: "none",
  padding: "4px 7px",
  border: "1px solid var(--line-strong)",
  borderRadius: 4,
  background: "var(--paper-raised)",
  color: "var(--ink)",
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  lineHeight: 1.45,
  whiteSpace: "nowrap",
};

/** Crosshair, point dots and a compact tooltip, all inside a `position: relative` plot area. */
export function ScrubLayer({
  xPct,
  dots,
  children,
  testId,
  above = false,
}: {
  xPct: number;
  dots: ScrubDot[];
  children: ReactNode;
  testId: string;
  /** Hang the tooltip over a short plot instead of inside it. */
  above?: boolean;
}) {
  const flip = xPct > 55;
  return (
    <div aria-hidden="true" data-scrub={testId} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      <span style={{ position: "absolute", top: 0, bottom: 0, left: `${xPct}%`, borderLeft: "1px solid var(--line-strong)" }} data-scrub-line />
      {dots.map((dot, i) =>
        dot.hidden ? null : (
          <span
            key={i}
            data-scrub-dot
            style={{
              position: "absolute",
              left: `${xPct}%`,
              top: `${dot.y}%`,
              width: 7,
              height: 7,
              marginLeft: -3.5,
              marginTop: -3.5,
              borderRadius: "50%",
              background: dot.color,
              border: "1px solid var(--paper)",
            }}
          />
        ),
      )}
      <div data-scrub-tip style={{ ...TIP, ...(above ? { bottom: "calc(100% + 3px)" } : { top: 2 }), ...(flip ? { right: `${100 - xPct + 2}%` } : { left: `${xPct + 2}%` }) }}>
        {children}
      </div>
    </div>
  );
}

/** Server strings carry a hyphen-minus; the UI prints U+2212. The exact string stays in `data-exact`. */
export function tipMinus(text: string): string {
  return text.replace(/^-(?=\d)/, "−");
}
