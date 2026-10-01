
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
});
