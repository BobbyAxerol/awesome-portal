/**
 * V2 shared charts (S2-0a). Pure SVG, no chart library, no screen knowledge.
 *
 * ## Rules every component keeps
 *
 * - **Exact decimals.** Values arrive as decimal STRINGS (`"12480.40"`). A
 *   number is made from one only to place a mark; every label, readout and
 *   caption is `formatExact` of the original string. A "change in window" is an
 *   exact BigInt subtraction of two published strings. A value the boundary
 *   refuses (a JS number, an exponent, `-0`, `01`) is drawn as a counted gap.
 * - **Gaps are gaps.** A `null` value, an unreadable value, or (with
 *   `intervalMs`) a hole in time breaks the line and is hatched. Nothing is
 *   joined, interpolated or drawn as zero.
 * - **Extrema survive.** Series longer than the plot is wide are reduced to the
 *   minimum and maximum of each bucket (plus the ends of every run) and the
 *   envelope caption says so: "Showing 1,200 of 5,000 points, minimum and
 *   maximum kept in every bucket of 9 points".
 * - **Absent is a state.** `ChartState` `unavailable` prints the caller's copy
 *   ("Not published (FE-xxx)", "Not available") and reason in a hatched box.
 *   An unordered series, or one with nothing drawable, is refused the same way.
 *   `partial` and `stale` still draw and wear a `Flag`.
 * - **Colour is never the only cue.** Dash, hatch, glyph, marker shape, side of
 *   an axis and a printed sign back every hue.
 * - **Accessible.** Every chart exposes `role="img"` with an accessible name and
 *   a text alternative (`aria-describedby` to a hidden summary and table).
 *   EquityPanel and CompareOverlay add a focusable group with a readout that
 *   follows ArrowLeft/Right (Shift = ten points), PageUp/PageDown, Home, End and
 *   releases on Escape; keyboard moves are announced through a polite status.
 *   CapitalFlow's keyboard path is its table view. EventRibbon is a
 *   `role="group"` of real buttons, not an image, because its marks are controls.
 * - **No motion.** Nothing animates, so `prefers-reduced-motion` needs no override.
 * - **Time.** Instants are `UtcEpochMs` and print as `17 Oct 09:14Z` through
 *   `formatAsOf`, whatever the browser's zone.
 * - **DOM budget.** A 5,000-point series draws a bounded number of elements:
 *   lines, areas and gaps are single `<path>` elements, so node count does not
 *   grow with points (asserted under 150 elements in the tests).
 *
 * ## Components
 *
 * | Component | Use |
 * |---|---|
 * | {@link EquityPanel} | one series over time with band, ghost, drawdown, pins, flags, readout |
 * | {@link Spark} | word-sized trend for a table cell |
 * | {@link DivBars} | diverging bars around zero (contributors) |
 * | {@link CompareOverlay} | two to four series on one basis, plus a "Not comparable" partition |
 * | {@link CapitalFlow} | Sankey of nodes and edges, one block per basis, table view |
 * | {@link EventRibbon} / {@link EventKindChips} | events and stages on the same time axis as an EquityPanel |
 * | {@link ChartTools} | Table (the published points as rows, a bounded page at a time) and Expand (modal) around any chart |
 *
 * Helpers: {@link rebaseToFirst} (exact `v - first`), {@link showDecimal}
 * (the one label path), {@link domainOfSeries} (the window to share between an
 * EquityPanel and its ribbon), {@link CHART_MARGIN} (the margins both use).
 */
export { CapitalFlow, type CapitalFlowProps, type FlowBlock, type FlowEdge, type FlowNode, type FlowTime } from "./CapitalFlow";
export { ChartTools, type ChartToolsProps } from "./ChartTools";
export { chartTableModel, type ChartTableCell, type ChartTableColumn, type ChartTableModel } from "./chartTable";
export { ChartStateFlags, ChartUnavailable, type ChartUnavailableProps } from "./ChartStateView";
export { CompareOverlay, type CompareOverlayProps, type CompareSeries, type NotComparable } from "./CompareOverlay";
export { DivBars, type DivBarRow, type DivBarsProps } from "./DivBars";
export { EquityPanel, type DrawdownInput, type EquityPanelProps } from "./EquityPanel";
export { EventKindChips, EventRibbon, type EventKindChipsProps, type EventRibbonProps, type StageBand } from "./EventRibbon";
export { Spark, type SparkProps } from "./Spark";
export { compareDecimal, showDecimal, subtractDecimal } from "./decimal";
export { envelopeCaption, type Envelope } from "./downsample";
export { EVENT_KIND_TABLE, EVENT_KINDS } from "./eventKinds";
export { CHART_MARGIN } from "./hooks";
export { domainOfSeries } from "./model";
export { rebaseToFirst } from "./rebase";
export type {
  ChartDomain, ChartEvent, ChartSegment, ChartState, ChartTone, EventKind, FlowPin, SeriesPoint, ServerEnvelope, UtcEpochMs,
} from "./types";
