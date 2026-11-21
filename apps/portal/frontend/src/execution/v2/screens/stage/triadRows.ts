/**
 * `source_figures` (FE-072) as the rows of the Triad block: Internal, Broker and Difference exactly as the server published
 * them. The Difference is the SERVER's `internal minus broker` (published only when both sides are); the browser never
 * subtracts, and a side the server did not publish says `Not published (FE-072)` with its reason code in the title.
 */
import type { Metric } from "../../boundary";
import type { TriadCell, TriadRow } from "../../blocks";
import type { DecimalValue, FactCell, FigureRow } from "../../readers/stageFactViews";

export const FE_FIGURES = "FE-072" as const;

function metricOf(decimal: DecimalValue): Metric | null {
  if (decimal.kind === "unreadable") return null;
  const d = decimal.decimal;
  return { kind: "value", decimal: d, partial: false, publishedZero: d.zero, tone: d.tone, reasonCode: null };
}

function cellOf(c: FactCell<DecimalValue> | null): TriadCell {
  if (c === null) return undefined;
  if (c.kind === "not-published") return { kind: "not-published", id: FE_FIGURES, reasonCode: c.reasonCode };
  return metricOf(c.value);
}

/**
 * Every cell of every row is the server's `NOT_PUBLISHED`: the triad would be fifteen cells of the same words. The screen prints
 * ONE `Not available` line instead; `reason` is every distinct reason code the server gave, for the line's title. `figures: null` (no
 * block at all) is not this case: the caller handles it the same way, with no reason.
 */
export function figuresUnpublished(figures: readonly FigureRow[] | null): { all: boolean; reason: string | null } {
  if (figures === null) return { all: true, reason: null };
  const cells = figures.flatMap((figure) => [figure.internal, figure.broker, figure.difference]);
  const reasons = cells.flatMap((c) => (c !== null && c.kind === "not-published" ? [c.reasonCode] : []));
  const all = cells.length > 0 && cells.every((c) => c === null || c.kind === "not-published") && reasons.length > 0;
  const distinct = [...new Set(reasons.filter((code): code is string => code !== null))];
  return { all, reason: all && distinct.length > 0 ? distinct.join(" · ") : null };
}

/** One Triad row per published figure, in the published order. `COUNT` is a unit word of the server's, not a currency. */
export function triadRowsOf(figures: readonly FigureRow[]): readonly TriadRow[] {
  return figures.map((figure) => ({
    key: figure.key,
    label: figure.label,
    suffix: figure.unit === null || figure.unit === "COUNT" ? undefined : figure.unit,
    internal: cellOf(figure.internal),
    broker: cellOf(figure.broker),
    difference: cellOf(figure.difference),
  }));
}
