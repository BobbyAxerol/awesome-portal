/**
 * Core Observed fallback for the Overview fund tiles (design 2026-11-25, slices 2-3). Pure.
 *
 * The Observed read is a fund-level PORTAL_OBSERVATION, never TS-qualified. It is only ever a FALLBACK: a cell calls this when the
 * qualified (Manager) read has nothing to show, never to replace or merge with a qualified value. One line per currency, never summed.
 * A null value is never 0 and never a dash: it is an absence with its typed reason. NET_PNL is cumulative and source-reported, never a
 * window; RETURN and DRAWDOWN are shown only as the typed absence (or the exact value if one is ever published, still labelled).
 */
import type { ObservedFigure, ObservedOverview } from "../../readers/observedOverview";

export const OBSERVED_LABEL = "Observed, not TS-qualified";
export const OBSERVED_TITLE = "Observed by Core from the Edge snapshot (record PORTAL_OBSERVATION, source EDGE_SNAPSHOT_VIA_CORE, source confidence UNKNOWN). Not TS-qualified.";

export type ObservedFigureId = ObservedFigure["figure_id"];

export type ObservedLine =
  | { kind: "value"; key: string; exact: string; currency: string; unit: "MONEY" | "FRACTION"; partial: boolean; stale: boolean; reasons: readonly string[]; accounts: string | null }
  | { kind: "absent"; key: string; currency: string; code: string };

export interface ObservedCellView {
  lines: readonly ObservedLine[];
  /** `snapshot_source_as_of_ms`, never the read time; null when the snapshot published none. */
  asOfMs: number | null;
}

/** The lines of one figure, in published order; `null` when the body holds no entry for it (the cell keeps today's wording). */
export function observedCell(body: ObservedOverview | null, id: ObservedFigureId): ObservedCellView | null {
  if (body === null) return null;
  const entries = body.figures.filter((f) => f.figure_id === id);
  if (entries.length === 0) return null;
  const lines = entries.map((f): ObservedLine => {
    const key = `${f.figure_id}|${f.currency}`;
    if (f.value === null || f.availability === "UNAVAILABLE") return { kind: "absent", key, currency: f.currency, code: f.reason_code ?? "NOT_AVAILABLE" };
    return {
      kind: "value", key, exact: f.value, currency: f.currency, unit: f.unit,
      partial: f.availability === "PARTIAL" || f.quality.completeness !== "COMPLETE",
      stale: f.quality.freshness === "STALE",
      reasons: [...f.quality.reasons, ...(f.reason_code === null ? [] : [f.reason_code])],
      accounts: f.accounts_reported !== f.accounts_total ? `${f.accounts_reported} of ${f.accounts_total} accounts` : null,
    };
  });
  return { lines, asOfMs: body.as_of.snapshot_source_as_of_ms };
}
