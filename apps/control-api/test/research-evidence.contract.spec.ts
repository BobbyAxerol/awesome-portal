import { describe, expect, it } from "vitest";

import {
  ResearchEvidenceSeriesResponseSchema,
} from "../src/research/evidence.contract";
import { ResearchEvidenceSourceSchema } from "../src/research/progress.contract";
import { p13EvidenceSourceFixture } from "./research-evidence.fixture";

describe("P13 Evidence Flow contracts", () => {
  it("accepts a bounded full OOS receipt and rejects inconsistent source facts", () => {
    expect(ResearchEvidenceSourceSchema.safeParse(p13EvidenceSourceFixture()).success).toBe(true);
    expect(ResearchEvidenceSourceSchema.safeParse({
      ...p13EvidenceSourceFixture(),
      direct: { ...p13EvidenceSourceFixture().direct, final_equity: "111" },
    }).success).toBe(false);
    expect(ResearchEvidenceSourceSchema.safeParse({
      ...p13EvidenceSourceFixture(),
      source: { ...p13EvidenceSourceFixture().source, chart_sampling: "EXTREMA_BUCKET_V1" },
    }).success).toBe(false);
    expect(ResearchEvidenceSourceSchema.safeParse({
      ...p13EvidenceSourceFixture(),
      equity_points: [...p13EvidenceSourceFixture().equity_points].reverse(),
    }).success).toBe(false);
    expect(ResearchEvidenceSourceSchema.safeParse({
      ...p13EvidenceSourceFixture(),
      derived: {
        ...p13EvidenceSourceFixture().derived,
        return_distribution: {
          state: "AVAILABLE",
          reason_code: "P04_RETURN_DISTRIBUTION_ZERO_VARIANCE",
          buckets: [],
        },
      },
    }).success).toBe(false);
  });

  it("keeps a named lazy series homogeneous and makes empty absence explicit", () => {
    const base = {
      schema_version: "research.evidence-series.v1" as const,
      run_id: "run_p13",
      revision: `p13r1_${"b".repeat(64)}`,
      etag: `"p13r1_${"b".repeat(64)}"`,
      kind: "EQUITY_OOS" as const,
      availability: { state: "AVAILABLE" as const, reason_code: null },
      source_sample: { source_observation_count: 3, emitted_point_count: 3, sampling: "FULL" as const },
      values: p13EvidenceSourceFixture().equity_points,
    };
    expect(ResearchEvidenceSeriesResponseSchema.safeParse(base).success).toBe(true);
    expect(ResearchEvidenceSeriesResponseSchema.safeParse({
      ...base,
      kind: "MONTHLY_RETURNS",
    }).success).toBe(false);
    expect(ResearchEvidenceSeriesResponseSchema.safeParse({
      ...base,
      availability: { state: "NOT_APPLICABLE", reason_code: "P04_OOS_OBSERVATIONS_BELOW_ROLLING_WINDOW" },
    }).success).toBe(false);
  });

  it("requires corrected R2 coverage and an explicit inclusive final histogram boundary", () => {
    const legacy = p13EvidenceSourceFixture();
    const corrected = {
      ...legacy,
      source: {
        ...legacy.source,
        evidence_transform_revision: "P13_SOURCE_R2" as const,
        direct_metric_scopes: {
          initial_equity: "OOS_EQUITY_SERIES" as const,
          final_equity: "OOS_EQUITY_SERIES" as const,
          num_trades: "FULL_CHILD_TAPE" as const,
          bars: "FULL_CHILD_TAPE" as const,
        },
        series_metadata: {
          equity_oos: { source_observation_count: 3, emitted_point_count: 3, sampling: "FULL" as const },
          monthly_returns: { source_observation_count: 3, emitted_point_count: 1, total_period_count: 1, omitted_leading_period_count: 1, omitted_transport_period_count: 0, sampling: "FULL" as const },
          rolling_returns_20: { source_observation_count: 0, emitted_point_count: 0, sampling: "NOT_APPLICABLE" as const, window_observations: 20 as const },
          return_distribution: { source_observation_count: 3, emitted_point_count: 2, sampling: "FULL_RETURN_HISTOGRAM_V2" as const },
        },
      },
      derived: {
        ...legacy.derived,
        return_distribution: {
          state: "AVAILABLE" as const,
          reason_code: null,
          buckets: [
            { lower_inclusive: "0", upper: "0.1", upper_inclusive: "false" as const, count: "1" },
            { lower_inclusive: "0.1", upper: "0.2", upper_inclusive: "true" as const, count: "2" },
          ],
        },
      },
    };
    expect(ResearchEvidenceSourceSchema.safeParse(corrected).success).toBe(true);
    expect(ResearchEvidenceSourceSchema.safeParse({
      ...corrected,
      source: { ...corrected.source, series_metadata: undefined },
    }).success).toBe(false);
    expect(ResearchEvidenceSourceSchema.safeParse({
      ...corrected,
      derived: {
        ...corrected.derived,
        return_distribution: {
          ...corrected.derived.return_distribution,
          buckets: [
            { lower_inclusive: "0", upper: "0.1", upper_inclusive: "true", count: "1" },
            { lower_inclusive: "0.1", upper: "0.2", upper_inclusive: "false", count: "2" },
          ],
        },
      },
    }).success).toBe(false);
  });
});
