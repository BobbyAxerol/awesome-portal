/** B9: compact source-bound annotations, no PnL rerun or browser inference. */
import type { ResearchEnrichedAnalysis } from "./enriched-analysis.contract";
import type { ResearchCompareChartAnnotation } from "./compare.contract";

function decimalOrder(left: string, right: string): number {
  const scale = Math.max(left.split(".")[1]?.length ?? 0, right.split(".")[1]?.length ?? 0);
  const scaled = (text: string) => {
    const sign = text.startsWith("-") ? -1n : 1n;
    const [whole, fraction = ""] = text.replace(/^-/, "").split(".");
    return sign * BigInt(whole + fraction.padEnd(scale, "0"));
  };
  const a = scaled(left), b = scaled(right);
  return a === b ? 0 : a < b ? -1 : 1;
}

export function compareChartAnnotation(runId: string, enriched?: ResearchEnrichedAnalysis): ResearchCompareChartAnnotation {
  const unavailable = { state: "NOT_PUBLISHED" as const, reason_code: "SEALED_ENRICHMENT_NOT_COMPUTED" };
  const monthly = enriched?.monthly_returns;
  const complete = monthly?.state === "AVAILABLE" && monthly.omitted_transport_period_count === 0 && monthly.values.length > 0;
  const ordered = complete ? [...monthly.values].sort((a, b) => decimalOrder(a.return_fraction, b.return_fraction)
    || a.month_start_utc_ms - b.month_start_utc_ms) : [];
  return {
    run_id: runId,
    availability: enriched ? { state: "AVAILABLE", reason_code: null } : unavailable,
    input_digest: enriched?.input_digest ?? null,
    scope: enriched?.scope ?? null,
    all_time_metrics: enriched?.facts.metrics ?? null,
    drawdown_episodes: enriched?.drawdown_episodes ?? null,
    month_extrema: {
      availability: complete ? { state: "AVAILABLE", reason_code: null }
        : { state: "NOT_PUBLISHED", reason_code: monthly?.omitted_transport_period_count
          ? "B9_MONTH_TRANSPORT_DOES_NOT_COVER_FULL_POPULATION" : monthly?.reason_code ?? unavailable.reason_code },
      definition_id: "ALL_RETAINED_OOS_MONTHS_MAX_MIN_RETURN_V1",
      includes_partial_months: true,
      source_period_count: monthly?.total_period_count ?? null,
      worst: ordered[0] ?? null,
      best: ordered[ordered.length - 1] ?? null,
    },
  };
}
