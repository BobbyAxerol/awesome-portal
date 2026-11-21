import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { ResearchRetainedAnalyticsV2Schema } from "../src/research/retained-analytics-v2.contract";
import { ResearchAllTimeDistributionsSchema } from "../src/research/all-time-distributions.contract";

const path = resolve(process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts"), "fixtures/research-retained-analytics-v2.fixed.valid.json");

describe("D-AN-01 sealed analytics v2", () => {
  it("accepts the exact pinned-QuantBT fixture and refuses provenance mismatch", () => {
    const fixture = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    expect(ResearchRetainedAnalyticsV2Schema.safeParse(fixture).success).toBe(true);
    const metrics = fixture.metrics as Record<string, Record<string, unknown>>;
    const tampered = {
      ...fixture,
      metrics: { ...metrics, beta: { ...metrics.beta, input_digest: "0".repeat(64) } },
    };
    expect(ResearchRetainedAnalyticsV2Schema.safeParse(tampered).success).toBe(false);
  });

  it("accepts the Python-derived distribution fixture only with consistent daily counts and month provenance", () => {
    const distributions = JSON.parse(readFileSync(resolve(path, "../research-all-time-distributions.valid.json"), "utf8"));
    expect(ResearchAllTimeDistributionsSchema.safeParse(distributions).success).toBe(true);
    const analytics = JSON.parse(readFileSync(path, "utf8"));
    expect(ResearchRetainedAnalyticsV2Schema.safeParse({ ...analytics, distributions }).success).toBe(true);
    for (const mutate of [
      (block: typeof distributions) => { block.return_distribution.source_observation_count = 5; },
      (block: typeof distributions) => { block.monthly_returns.values[0].basis = "INVENTED_PRIOR_CLOSE"; },
      (block: typeof distributions) => { block.return_distribution.values[0].upper = "100"; },
      (block: typeof distributions) => { block.monthly_returns.emitted_point_count = 1; },
      (block: typeof distributions) => { block.monthly_returns.values[0].partial = undefined; },
    ]) {
      const malformed = structuredClone(distributions); mutate(malformed);
      expect(ResearchAllTimeDistributionsSchema.safeParse(malformed).success).toBe(false);
    }
  });

  it("keeps observed VN bars and source UTC-daily returns as independently bounded populations", () => {
    // Population-only fixture from the real VN terminal: economic values,
    // source digests and timestamps remain the existing synthetic fixture.
    const distributions = JSON.parse(readFileSync(resolve(path, "../research-all-time-distributions.valid.json"), "utf8"));
    distributions.oos_observation_count = 107;
    distributions.monthly_returns.source_observation_count = 107;
    distributions.monthly_returns.values[0].observation_count = 50;
    distributions.monthly_returns.values[1].observation_count = 57;
    distributions.return_distribution.source_observation_count = 152;
    distributions.return_distribution.values.forEach((bucket: { count: string }, index: number) => {
      bucket.count = index === 0 ? "1" : index === 11 ? "151" : "0";
    });
    expect(ResearchAllTimeDistributionsSchema.safeParse(distributions).success).toBe(true);
    for (const mutate of [
      (block: typeof distributions) => { block.return_distribution.values[11].count = "152"; },
      (block: typeof distributions) => { block.monthly_returns.source_observation_count = 152; },
      (block: typeof distributions) => { block.return_distribution.source_observation_count = 2_000_001; },
      (block: typeof distributions) => { block.distribution_definition = "OBSERVED_VN_SESSION_RETURNS"; },
    ]) {
      const malformed = structuredClone(distributions); mutate(malformed);
      expect(ResearchAllTimeDistributionsSchema.safeParse(malformed).success).toBe(false);
    }
  });
});
