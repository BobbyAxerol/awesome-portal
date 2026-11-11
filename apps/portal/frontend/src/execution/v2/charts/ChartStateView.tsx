import "../css/charts.css";
import { Flag } from "../Flag";
import { plainReason } from "../plainReason";
import type { ChartState } from "./types";

/** Flags for PARTIAL and STALE data; nothing for ready or unavailable (the latter replaces the plot). */
export function ChartStateFlags({ state }: { state: ChartState }) {
  if (state.kind === "partial") return <Flag kind="partial" label={`Partial · ${state.reason}`} size="sm" />;
  if (state.kind === "stale") return <Flag kind="stale" label={`Stale · ${state.reason}`} size="sm" />;
  return null;
}

export interface ChartUnavailableProps {
  /** Accessible name of the chart that is not drawn. */
  label: string;
  /** `Not published (FE-xxx)`, `Not available`, ... exactly as the caller decided. */
  copy: string;
  /** Why, in the caller's words (a published reason code, a source name). */
  reason?: string;
  /** Plot height in px so the layout does not jump. */
  height?: number;
}

/** The absent state: hatched, worded, never an empty plot and never a flat zero line. */
export function ChartUnavailable({ label, copy, reason, height = 200 }: ChartUnavailableProps) {
  // The reason may carry the server's code (`SERIES_SOURCE_NOT_PUBLISHED`): the sentence is plain, the code stays in `data-code`.
  const plain = reason ? plainReason(reason) : null;
  const name = plain ? `${label}: ${copy}. ${plain.text}` : `${label}: ${copy}`;
  return (
    <div className="exec-c2-na" role="img" aria-label={name} style={{ minHeight: height }} data-testid="chart-unavailable" data-code={plain !== null && plain.codes.length > 0 ? plain.codes.join(" ") : undefined}>
      <span className="exec-c2-na-copy">{copy}</span>
      {plain ? <span className="exec-c2-na-reason" title={plain.codes.length > 0 ? plain.codes.join(", ") : undefined}>{plain.text}</span> : null}
    </div>
  );
}
