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
    // P08's strict observed-source branch proves tape integrity, not an
    // exchange calendar. Keep those unknown gap counts null and labelled.
    ...(source.quality.state === "OBSERVED_TAPE_INTEGRITY_ONLY"
      ? { quality_scope: "OBSERVED_TAPE_INTEGRITY_ONLY" as const } : {}),
  };
}

/** B3 CG-FG-S04-07: immutable P08 topology, never result/holdout data. */
export function evidenceWindowDisclosure(topology: unknown) {
  const absent = (reasonCode: string) => ({
    availability: { state: "NOT_PUBLISHED" as const, reason_code: reasonCode },
    aggregation_scope: null,
    is_bars: null,
    oos_bars: null,
    folds: [] as Array<{ fold: number; is_bars: number; oos_bars: number }>,
    holdout_bars: { state: "NOT_PUBLISHED" as const, reason_code: reasonCode, value: null },
  });
  if (topology === null || topology === undefined) return absent("P08_TOPOLOGY_NOT_RETAINED");
  // Early P10 manifests deliberately retained a digest-only topology. Keep
  // their Hub readable; only a partial/full incompatible topology fails closed.
  if (typeof topology === "object" && !Array.isArray(topology) &&
      /^[0-9a-f]{64}$/.test(String((topology as Record<string, unknown>).topology_digest)) &&
      !("protocol" in topology) && !("folds" in topology)) {
    return absent("P08_TOPOLOGY_BAR_COUNTS_NOT_RETAINED");
  }
  const parsed = ResearchPreflightPrivateResponseSchema.shape.topology.safeParse(topology);
  if (!parsed.success) {
    throw new ResearchEvidenceError("RESEARCH_EVIDENCE_UNAVAILABLE", "Retained preflight topology is incompatible.", 503);
  }
  const source = parsed.data;
  if (source.folds.some((fold) => fold.train.bars === undefined || fold.outer_oos.bars === undefined)) {
    return absent("P08_TOPOLOGY_BAR_COUNTS_NOT_RETAINED");
  }
  const foldIds = new Set<string>();
  let isBars = 0;
  let oosBars = 0;
  const folds = source.folds.map((fold, index) => {
    const train = fold.train.bars!;
    const oos = fold.outer_oos.bars!;
    if (foldIds.has(fold.fold_id) || fold.fold_id !== ("fold_" + String(index).padStart(3, "0")) ||
        !Number.isSafeInteger(train) || train < 1 || !Number.isSafeInteger(oos) || oos < 1) {
      throw new ResearchEvidenceError("RESEARCH_EVIDENCE_UNAVAILABLE", "Retained preflight fold counts are incompatible.", 503);
    }
    foldIds.add(fold.fold_id);
    isBars += train;
    oosBars += oos;
    return { fold: index + 1, is_bars: train, oos_bars: oos };
  });
  if (!Number.isSafeInteger(isBars) || !Number.isSafeInteger(oosBars)) {
    throw new ResearchEvidenceError("RESEARCH_EVIDENCE_UNAVAILABLE", "Retained preflight fold totals are incompatible.", 503);
  }
  return {
    availability: { state: "AVAILABLE" as const, reason_code: null },
    // Expanding IS windows overlap. These are sums of per-fold inputs, not
    // unique market bars or a claim about the headline's calculation.
    aggregation_scope: "SUM_OF_FOLD_WINDOWS_MAY_OVERLAP" as const,
    is_bars: isBars,
    oos_bars: oosBars,
    folds,
    holdout_bars: source.protocol === "three_window_decay"
      ? { state: "DENIED" as const, reason_code: "P13_SEALED_HOLDOUT_BAR_COUNT_DENIED", value: null }
      : { state: "NOT_APPLICABLE" as const, reason_code: "P13_PROTOCOL_HAS_NO_SEALED_HOLDOUT", value: null },
  };
}
