/**
 * What a screen looks like while it is reading.
 *
 * The complaint this answers (owner, 2026-09-08): a screen mid-read looked like
 * a screen with nothing in it, so someone glancing at it concluded the feature
 * was broken or empty and moved on. The old skeleton was three grey bars of
 * 30/60/90% width, identical in every panel, matching the shape of nothing and
 * not moving — which is exactly how an empty table looks.
 *
 * Four rules hold this together:
 *
 *   1. **The frame stays.** Only the data region is replaced. A screen that
 *      keeps its masthead, its filters and its column headers says "this
 *      screen, loading"; a grey page says "this app is broken".
 *   2. **No layout shift.** A skeleton stands in the space its content will
 *      take, so nothing jumps when the answer lands.
 *   3. **No flicker.** A read that returns quickly shows nothing at all, and a
 *      skeleton that does appear stays long enough to be read as a state
 *      rather than a glitch. See `useDeferredLoading`.
 *   4. **Loading is not empty.** The two are distinguishable at a glance and
 *      not only by their words: this one moves, and an empty panel does not.
 *
 * Under `prefers-reduced-motion` every animation here stops. The shapes and
 * the announced "loading" stay, because they carry the meaning; the movement
 * was only ever the second channel.
 */
import { useEffect, useRef, useState } from "react";

/**
 * Below this, a read is perceived as instantaneous and a skeleton would be a
 * flash of grey between two good frames — worse than showing nothing at all.
 */
export const SHOW_AFTER_MS = 180;

/**
 * Once shown, a skeleton stays at least this long. A state that appears and
 * vanishes inside a fifth of a second is read as a rendering fault, not as an
 * answer about the screen.
 */
export const MIN_VISIBLE_MS = 420;

/**
 * Whether to draw a loading state right now, given whether a read is running.
 *
 * Deliberately not `isLoading` passed straight through: the useful signal is
 * "has this been slow enough to be worth saying, and has it been said long
 * enough to be read". Both timers are cleared on unmount, and a read that
 * starts again after finishing gets the same treatment as the first.
 */
export function useDeferredLoading(isLoading: boolean): boolean {
  const [visible, setVisible] = useState(false);
  const shownAt = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    if (isLoading) {
      if (visible) return undefined;
      const timer = window.setTimeout(() => {
        shownAt.current = Date.now();
        setVisible(true);
      }, SHOW_AFTER_MS);
      return () => window.clearTimeout(timer);
    }

    if (!visible) return undefined;
    const held = shownAt.current === null ? MIN_VISIBLE_MS : Date.now() - shownAt.current;
    const remaining = Math.max(0, MIN_VISIBLE_MS - held);
    if (remaining === 0) {
      shownAt.current = null;
      setVisible(false);
      return undefined;
    }
    const timer = window.setTimeout(() => {
      shownAt.current = null;
      setVisible(false);
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [isLoading, visible]);

  return visible;
}

/**
 * The surface's own loading mark: three cells rocking on a shared baseline.
 *
 * Square, because everything on this surface is square — a circular spinner
 * would be the one round thing in a console built of rules and cells. The cells
 * rise and settle in sequence, which reads as a ledger being written rather
 * than as a machine that is merely busy, and it says the same thing at 14px in
 * a button as at 22px in the middle of a panel.
 *
 * `aria-hidden`: the region that owns it announces the wait in words. A shape
 * described to a screen reader as three rectangles is noise.
 */
export function ExecutionPulse({ size = "md" }: { size?: "sm" | "md" }) {
  return (
    <span className="exec-pulse" data-size={size} aria-hidden="true">
      <i /><i /><i />
    </span>
  );
}

/** One skeleton line. `w` is a share of the container, so it scales with it. */
export function SkeletonLine({ w = "long" }: { w?: "xshort" | "short" | "medium" | "long" | "full" }) {
  return <span className="exec-sk-line" data-w={w} aria-hidden="true" />;
}

/**
 * A table mid-read, keeping its own column geometry.
 *
 * `columns` are the real widths from the screen's own column definition, so the
 * head does not move when the rows arrive. Passing them is not optional
 * decoration: a skeleton with the wrong column count teaches the eye a layout
 * that is about to change, which is worse than no skeleton at all.
 */
export function TableSkeleton({
  columns,
  rows = 6,
  label = "Loading rows",
}: {
  columns: readonly (string | undefined)[];
  rows?: number;
  label?: string;
}) {
  // A deterministic spread, so the placeholder reads as text of varying length
  // rather than a block of identical bars — and so it renders the same twice,
  // which keeps the visual baselines stable.
  const widths = ["long", "medium", "short", "full", "medium", "long", "short"] as const;
  return (
    <div className="exec-sk-table" role="status" aria-label={label}>
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, r) => (
        <div className="exec-sk-row" key={r} aria-hidden="true">
          {columns.map((width, c) => (
            <span className="exec-sk-cell" key={c} style={width ? { width, flex: "none" } : undefined}>
              <span className="exec-sk-line" data-w={widths[(r + c) % widths.length]} />
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * A chart mid-read: the plot area it will occupy, with the mark at its centre.
 *
 * `height` is the chart's own rendered height. A chart region that collapses to
 * nothing and then pushes the page down when its series lands is the single
 * biggest layout shift on these screens.
 */
export function ChartSkeleton({
  height = 180,
  label = "Loading chart",
}: {
  height?: number;
  label?: string;
}) {
  return (
    <div className="exec-sk-chart" style={{ height }} role="status" aria-label={label}>
      <span className="sr-only">{label}</span>
      <ExecutionPulse />
    </div>
  );
}

/** A KPI strip mid-read, one placeholder per cell it will hold. */
export function StripSkeleton({ cells = 5, label = "Loading figures" }: { cells?: number; label?: string }) {
  return (
    <div className="exec-sk-strip" role="status" aria-label={label}>
      <span className="sr-only">{label}</span>
      {Array.from({ length: cells }, (_, i) => (
        <div className="exec-sk-stripcell" key={i} aria-hidden="true">
          <span className="exec-sk-line" data-w="short" />
          <span className="exec-sk-line" data-w="medium" />
        </div>
      ))}
    </div>
  );
}

/**
 * The inline wait, for a control that is working: "Applying" with the mark
 * beside it. The word carries the meaning and the mark carries the fact that
 * something is still happening.
 */
export function InlineLoading({ children }: { children: React.ReactNode }) {
  return (
    <span className="exec-sk-inline" role="status">
      <ExecutionPulse size="sm" />
      <span>{children}</span>
    </span>
  );
}

/**
 * Placeholder rows for a screen that owns its own `<table>` rather than going
 * through `KeysetTable`.
 *
 * Returns real `<tr>`/`<td>` so it can stand inside a real `<tbody>` and
 * inherit the table's own column widths — the Fleet, the Waivers register and
 * the sandbox tables all draw their own tables, and a flex skeleton dropped
 * beside them would have its own geometry and move the columns when it left.
 */
export function SkeletonRows({ columns, rows = 5 }: { columns: number; rows?: number }) {
  const widths = ["long", "medium", "short", "full", "medium"] as const;
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <tr key={`sk-${r}`} aria-hidden="true">
          {Array.from({ length: columns }, (_, c) => (
            <td key={c}><span className="exec-sk-line" data-w={widths[(r + c) % widths.length]} /></td>
          ))}
        </tr>
      ))}
    </>
  );
}
