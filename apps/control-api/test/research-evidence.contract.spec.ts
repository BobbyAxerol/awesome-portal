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
});
