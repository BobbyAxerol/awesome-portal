/**
 * Zoom that re-queries instead of magnifying.
 *
 * Mechanism M2's rule, and the reason it matters: zooming into an
 * already-aggregated array renders a shape the data does not have. Four hourly
 * buckets stretched across a screen look like four measurements; they are four
 * hundred and forty measurements averaged, and the peak that mattered is inside
 * one of them. Spec §16.3 forbids exactly that, so the client asks the server
 * again at a finer rung rather than scaling what it already holds.
 *
 * `EX-BE-04b` §3 confirms the shape of the answer: "the query selects the rung
 * from the requested range and intent; zooming to a smaller range naturally
 * selects a finer rung on the next request." So this component never names an
 * interval. It names a range and lets the server choose — which is also why a
 * zoom inside one rung must NOT re-query: the server would return the identical
 * series and the round-trip would buy nothing.
 */
import { useState, type ReactNode } from "react";

import type { ChartEnvelope } from "../contracts";
import { INTERVAL_LADDER, needsRequery, pointsFor, selectInterval } from "../series";

export interface ZoomRange {
  /** Seconds. The window the reader is currently looking at. */
  seconds: number;
  /** Human label for the caption, e.g. `30d`. */
  label: string;
}

/**
 * What a zoom to `next` would mean, given what the server actually served.
 *
 * Three outcomes rather than two, because "the server can do better" and "the
 * server has nothing finer" are different answers and only one of them is worth
 * a request.
 */
export type ZoomVerdict =
  | { kind: "requery"; from: string; to: string; reason: string }
  | { kind: "same-rung"; interval: string; reason: string }
  | { kind: "finest"; interval: string; reason: string };

export function zoomVerdict(servedInterval: string, next: ZoomRange): ZoomVerdict {
  const wanted = selectInterval(next.seconds);
  const finest = INTERVAL_LADDER[0];

  if (needsRequery(servedInterval, next.seconds)) {
    return {
      kind: "requery",
      from: servedInterval,
      to: wanted.code,
      reason: `${next.label} fits ${wanted.code} buckets (${pointsFor(next.seconds, wanted).toLocaleString("en-US")} points). Re-querying rather than magnifying ${servedInterval} data.`,
    };
  }
  if (servedInterval === finest.code) {
    return {
      kind: "finest",
      interval: servedInterval,
      reason: `${finest.code} is the finest bucket the projection stores; zooming further shows the same measurements larger, not more of them.`,
    };
  }
  return {
    kind: "same-rung",
    interval: servedInterval,
    reason: `${next.label} still resolves to ${servedInterval}, so the server would return this same series. Not re-querying.`,
  };
}

/**
 * A chart frame that owns its own range and re-queries when the range earns it.
 *
 * The caption stays the envelope's — the interval printed is always the one the
 * server served, never the one the client asked for. That is the whole contract
 * of §16.2: a reader must be able to tell an aggregated series from a complete
 * one, and a caption showing a requested interval would say the opposite of the
 * truth while a request was in flight.
 */
export function ZoomableChart({
  title,
  envelope,
  ranges,
  activeRange,
  onRangeChange,
  loading = false,
  children,
  notice,
}: {
  title: string;
  /** What the server served. The caption reads from this and nothing else. */
  envelope: ChartEnvelope;
  ranges: readonly ZoomRange[];
  activeRange: ZoomRange;
  /** Called only when the range change would actually change the answer. */
  onRangeChange: (range: ZoomRange, verdict: ZoomVerdict) => void;
  loading?: boolean;
  children?: ReactNode;
  /** Retention or range-too-wide notices, rendered above the plot. */
  notice?: ReactNode;
}) {
  const [lastVerdict, setLastVerdict] = useState<ZoomVerdict | null>(null);

  function pick(range: ZoomRange) {
    const verdict = zoomVerdict(envelope.interval, range);
    setLastVerdict(verdict);
    // Every range change is reported to the caller with its verdict; the caller
    // decides whether to fetch. Deciding here would hide from the screen the
    // fact that a zoom did nothing, which is exactly what a reader needs told.
    onRangeChange(range, verdict);
  }

  return (
    <div className="exec-zoom" data-loading={loading ? "true" : undefined}>
      <div className="exec-zoom-head">
        <span className="exec-tile-title">{title}</span>
        <div className="exec-zoom-ranges" role="group" aria-label={`${title} range`}>
          {ranges.map((r) => (
            <button
              key={r.label}
              type="button"
              className="exec-zoom-range"
              data-active={r.label === activeRange.label ? "true" : undefined}
              aria-pressed={r.label === activeRange.label}
              disabled={loading}
              onClick={() => pick(r)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {notice}

      <div className="exec-zoom-plot">{children}</div>

      {/* The served interval, never the requested one. */}
      <div className="exec-zoom-caption">{captionFor(envelope)}</div>

      {lastVerdict && lastVerdict.kind !== "requery" ? (
        // Saying "this zoom changed nothing" is more useful than silently
        // doing nothing, which reads as a broken control.
        <div className="exec-zoom-verdict" data-kind={lastVerdict.kind}>
          {lastVerdict.reason}
        </div>
      ) : null}
    </div>
  );
}

function captionFor(envelope: ChartEnvelope): string {
  const parts = [envelope.window, envelope.interval];
  if (envelope.currency) parts.push(envelope.currency);
  parts.push(`as_of ${envelope.asOf}`, envelope.authority);
  if (envelope.downsampleMethod) parts.push(envelope.downsampleMethod);
  return parts.join(" · ");
}
