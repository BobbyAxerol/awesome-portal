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
