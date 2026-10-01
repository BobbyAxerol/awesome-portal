import { ResearchEvidenceError } from "./evidence.error";
import { ResearchPreflightPrivateResponseSchema } from "./preflight.contract";

/** P08 metadata only: no HMD read, snapshot path, rows or holdout values. */
export function evidenceDatasetCoverage(snapshot: unknown) {
  if (snapshot === null || snapshot === undefined) {
    return {
      availability: { state: "NOT_PUBLISHED" as const, reason_code: "P08_SNAPSHOT_NOT_RETAINED" },
      range: null,
      range_scope: null,
      rows: null,
      gaps: null,
      missing_bar_count: null,
      columns: [] as string[],
    };
  }
  // Early P10 manifests retained only snapshot identity digests, not coverage.
  if (snapshot !== null && typeof snapshot === "object" && !Array.isArray(snapshot) &&
      !["query", "row_count", "quality", "columns"].some((key) => key in snapshot)) {
    return {
      availability: { state: "NOT_PUBLISHED" as const, reason_code: "P08_SNAPSHOT_COVERAGE_NOT_RETAINED" },
      range: null,
      range_scope: null,
      rows: null,
      gaps: null,
      missing_bar_count: null,
      columns: [] as string[],
    };
  }

  const parsed = ResearchPreflightPrivateResponseSchema.shape.snapshot.safeParse(snapshot);
  if (!parsed.success) {
    throw new ResearchEvidenceError("RESEARCH_EVIDENCE_UNAVAILABLE", "Retained preflight snapshot metadata is incompatible.", 503);
  }
  const source = parsed.data;
  const { start_utc_ms, end_exclusive_utc_ms } = source.query;
  if (
    !Number.isSafeInteger(start_utc_ms) || !Number.isSafeInteger(end_exclusive_utc_ms) ||
    !(start_utc_ms < end_exclusive_utc_ms) || source.row_count !== source.quality.rows
  ) {
    throw new ResearchEvidenceError("RESEARCH_EVIDENCE_UNAVAILABLE", "Retained preflight snapshot coverage is inconsistent.", 503);
  }
  return {
    availability: { state: "AVAILABLE" as const, reason_code: null },
    range: { start_utc_ms, end_exclusive_utc_ms },
    range_scope: "FULL_SNAPSHOT_QUERY" as const,
    rows: source.row_count,
    gaps: source.quality.gaps,
    missing_bar_count: source.quality.missing_bar_count,
    columns: source.columns,
  };
}
