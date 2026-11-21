/**
 * Shared chart types. A chart never sees a screen: it sees points, states and
 * copy that the caller already decided.
 *
 * Values are exact decimal STRINGS. A number is made from one only to place a
 * mark on the page; every label is rendered from the original string.
 */
import type { UtcEpochMs } from "../../screenDataContract";

export type { UtcEpochMs };

/** One observation. `v: null` is an explicit gap, never zero and never interpolated. */
export interface SeriesPoint {
  /** UTC epoch milliseconds. */
  readonly t: UtcEpochMs;
  /** Exact decimal string, or `null` for a gap. */
  readonly v: string | null;
}

/** Colour role of a single-series mark. `dd` is drawdown/loss, `sim` is simulated data only. */
export type ChartTone = "series" | "series-2" | "series-3" | "series-4" | "dd" | "sim";

/**
 * What the data behind a chart is allowed to claim.
 *
 * `partial` and `stale` still draw (the data is real) and wear a Flag with the
 * caller's reason. `unavailable` draws no series at all: it prints `copy`
 * ("Not published (FE-xxx)", "Not available") and the reason, never an empty
 * plot and never a flat zero line.
 */
export type ChartState =
  | { readonly kind: "ready" }
  | { readonly kind: "partial"; readonly reason: string }
  | { readonly kind: "stale"; readonly reason: string }
  | { readonly kind: "unavailable"; readonly copy: string; readonly reason?: string };

/** A time span drawn hatched on the plot. */
export interface ChartSegment {
  /** `simulated` hatches in the simulated colour; `retained` hatches neutral. */
  readonly kind: "simulated" | "retained";
  /** Start of the span (inclusive). */
  readonly from: UtcEpochMs;
  /** End of the span (inclusive). */
  readonly to: UtcEpochMs;
  /** Overrides the default word printed in the hatch ("Simulated" / "Retained"). */
  readonly label?: string;
}

export type EventKind = "stage" | "decision" | "incident" | "recall" | "flow";

export interface ChartEvent {
  /** Stable key. */
  readonly id: string;
  /** When it happened. */
  readonly t: UtcEpochMs;
  /** Lane and glyph. */
  readonly kind: EventKind;
  /** What happened, in the caller's words. */
  readonly title: string;
  /** Who, when known. */
  readonly actor?: string;
  /** Why, when known. */
  readonly reason?: string;
  /** Anything else worth one line. */
  readonly detail?: string;
}

/** A capital movement drawn as a pin on the plot. `value` is signed. */
export interface FlowPin {
  /** Stable key. */
  readonly id: string;
  /** When the money moved. */
  readonly t: UtcEpochMs;
  /** Signed exact decimal; negative is a withdrawal. */
  readonly value: string;
}

/** The time window a chart and its ribbon share. */
export interface ChartDomain {
  /** Window start. */
  readonly from: UtcEpochMs;
  /** Window end. */
  readonly to: UtcEpochMs;
}

/** Server-side downsample metadata, shown verbatim in the envelope caption. */
export interface ServerEnvelope {
  /** Points the server held. */
  readonly sourceCount: number;
  /** Points the server sent. */
  readonly shownCount: number;
  /** The server's own name for its reduction; empty when it named none (the caption reads method not stated). */
  readonly method: string;
  /** False means the server does not promise extrema survived; the chart says so. */
  readonly keepsExtrema: boolean;
}
