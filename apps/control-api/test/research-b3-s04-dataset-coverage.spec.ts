
import { describe, expect, it } from "vitest";

import { ResearchEvidenceDatasetCoverageSchema } from "../src/research/evidence.contract";
import { evidenceDatasetCoverage } from "../src/research/evidence.coverage";
import { b3RetainedSnapshot } from "./research-b3-snapshot.fixture";

describe("B3 CG-FG-S04-02 P08 immutable snapshot coverage", () => {
  it("publishes the retained query range and row count without inferring a narrower logical range", () => {
    const coverage = ResearchEvidenceDatasetCoverageSchema.parse(evidenceDatasetCoverage(b3RetainedSnapshot));
    expect(coverage).toMatchObject({
      availability: { state: "AVAILABLE", reason_code: null },
      range: { start_utc_ms: 1767484800000, end_exclusive_utc_ms: 1768003200000 },
      range_scope: "FULL_SNAPSHOT_QUERY",
      rows: 336,
      gaps: 0,
      missing_bar_count: 0,
      columns: ["open", "high", "low", "close", "volume"],
    });
    expect(coverage.range).toEqual({ start_utc_ms: b3RetainedSnapshot.query.start_utc_ms, end_exclusive_utc_ms: b3RetainedSnapshot.query.end_exclusive_utc_ms });
    expect(JSON.stringify(coverage)).not.toContain("snapshot_id");
    expect(JSON.stringify(coverage)).not.toContain("provenance");
  });

  it("types old/legacy absence and refuses corrupt retained metadata", () => {
    expect(ResearchEvidenceDatasetCoverageSchema.parse(evidenceDatasetCoverage(null))).toMatchObject({
      availability: { state: "NOT_PUBLISHED", reason_code: "P08_SNAPSHOT_NOT_RETAINED" },
      range: null, range_scope: null, rows: null, columns: [],
    });
    expect(ResearchEvidenceDatasetCoverageSchema.parse(evidenceDatasetCoverage({ snapshot_id: "dss_" + "a".repeat(32), snapshot_content_hash: "b".repeat(64), source_manifest_digest: "c".repeat(64) }))).toMatchObject({
      availability: { state: "NOT_PUBLISHED", reason_code: "P08_SNAPSHOT_COVERAGE_NOT_RETAINED" },
    });
    expect(() => evidenceDatasetCoverage({ ...b3RetainedSnapshot, row_count: 335 })).toThrow(/inconsistent/);
    expect(() => evidenceDatasetCoverage({ snapshot_id: "bad", query: b3RetainedSnapshot.query })).toThrow(/incompatible/);
  });

  it("keeps observed VN query coverage available without inventing expected-session gap counts", () => {
    const snapshot = { ...b3RetainedSnapshot,
      timezone: "Asia/Ho_Chi_Minh", calendar_policy: "SOURCE_DECLARED",
      closed_bar_policy: "SOURCE_LOCAL_DATE_OBSERVED_AT_AS_OF_V1",
      provenance: {
        clock_basis: "OBSERVED_SOURCE_LOCAL_DATE_V1", source_timezone: "Asia/Ho_Chi_Minh",
        metadata_index_revision: "a".repeat(64), metadata_index_source_manifest_digest: "b".repeat(64),
        metadata_index_as_of_utc_ms: 1769000000000,
        warmup_semantics: "LAST_N_OBSERVED_PREDECESSORS_V1", warmup_start_utc_ms: 1767000000000,
      },
      quality: { rows: b3RetainedSnapshot.row_count, gaps: null, duplicates: 0, gap_ratio: null,
        passed: true, reason_codes: [], missing_bar_count: null, state: "OBSERVED_TAPE_INTEGRITY_ONLY" },
    };
    const coverage = ResearchEvidenceDatasetCoverageSchema.parse(evidenceDatasetCoverage(snapshot));
    expect(coverage).toMatchObject({ availability: { state: "AVAILABLE", reason_code: null },
      quality_scope: "OBSERVED_TAPE_INTEGRITY_ONLY", rows: 336, gaps: null, missing_bar_count: null,
      range_scope: "FULL_SNAPSHOT_QUERY" });
    const { quality_scope: _scope, ...unlabelled } = coverage;
    expect(ResearchEvidenceDatasetCoverageSchema.safeParse(unlabelled).success).toBe(false);
    expect(ResearchEvidenceDatasetCoverageSchema.safeParse({ ...coverage, gaps: 0, missing_bar_count: 0 }).success).toBe(false);
    expect(ResearchEvidenceDatasetCoverageSchema.safeParse({ ...coverage,
      availability: { state: "NOT_PUBLISHED", reason_code: "SOURCE_NOT_PUBLISHED" } }).success).toBe(false);
    expect(evidenceDatasetCoverage(b3RetainedSnapshot)).not.toHaveProperty("quality_scope");
  });
});
