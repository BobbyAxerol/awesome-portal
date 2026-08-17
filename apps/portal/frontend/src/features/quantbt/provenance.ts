/**
 * Chart provenance builders (v0.5 §12.2).
 *
 * Every production chart must publish where its numbers came from, what was
 * dropped on the way, and as of when. Before this module only Overview did,
 * and each call site spelled the envelope out by hand — which is how the other
 * result tabs ended up with a bare `sourceId` string.
 *
 * Two shapes of source, two builders:
 *
 *  - `seriesProvenance` — a server series endpoint, which now returns the real
 *    envelope (`source_rows` / `returned_rows` / `downsample_stride`). The
 *    reduction is the server's and is reported as such.
 *  - `tableProvenance` — a parquet-derived table (trials, candidates, folds).
 *    These arrive whole and the *browser* reduces them for a chart, so the
 *    reduction is reported as a client-side one, named after what it actually
 *    did ("top 200 theo objective"), never as a server downsample.
 *
 * The distinction matters: a reader who cannot tell a server range-query from
 * a client top-N cannot tell whether the tail of the distribution is missing
 * or merely unplotted.
 */
import type { ChartProvenance } from "../../components/ChartFigure";
import type { SeriesPayload } from "../../lib/api";

/** Run-level facts shared by every chart on a result screen. */
export interface RunEvidence {
  runId: string;
  /** ISO-8601 UTC completion time from the run manifest. */
  asOf: string | null;
  /** Dataset content hash from the run manifest. */
  digest: string | null;
  /** Data-quality warnings the summary published. */
  warnings?: string[];
}

/**
 * Provenance for a chart drawn from a server series payload.
 *
 * A payload that has not arrived yet yields row counts of `null` rather than
 * `0` — "not loaded" is not "no rows" (FRONTEND_HANDOFF §4).
 */
export function seriesProvenance(
  payload: SeriesPayload | undefined,
  run: RunEvidence,
  options: { source: string; segment?: string; units?: string },
): ChartProvenance {
  const stride = payload?.downsample_stride ?? 1;
  return {
    source: options.source,
    runId: run.runId,
    segment: options.segment ?? payload?.segment ?? null,
    units: options.units,
    asOf: run.asOf,
    digest: run.digest,
    sourceRows: payload?.source_rows ?? null,
    returnedRows: payload?.returned_rows ?? null,
    // Only claim a downsample when the server says it thinned the payload.
    downsample: stride > 1 ? `server stride ${stride}` : null,
    warnings: run.warnings,
  };
}

/**
 * Provenance for a chart drawn from a table artifact.
 *
 * `plotted` below `available` means the browser reduced the set, so `reduction`
 * must name that reduction. Omitting it while plotting a subset would be the
 * chart claiming completeness it does not have.
 */
export function tableProvenance(
  run: RunEvidence,
  options: {
    source: string;
    segment?: string;
    units?: string;
    /** Rows the artifact returned. */
    available: number | null;
    /** Rows actually drawn. */
    plotted: number | null;
    /** What the browser did to get from one to the other. */
    reduction?: string;
  },
): ChartProvenance {
  const reduced =
    options.available !== null && options.plotted !== null && options.plotted < options.available;
  return {
    source: options.source,
    runId: run.runId,
    segment: options.segment ?? null,
    units: options.units,
    asOf: run.asOf,
    digest: run.digest,
    sourceRows: options.available,
    returnedRows: options.plotted,
    downsample: reduced ? (options.reduction ?? "client-side subset") : null,
    warnings: run.warnings,
  };
}
