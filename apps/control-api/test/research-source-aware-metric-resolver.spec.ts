import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ResearchEnrichedAnalysisSchema } from "../src/research/enriched-analysis.contract";
import { ResearchRetainedAnalyticsV2Schema } from "../src/research/retained-analytics-v2.contract";
import { resolveSealedPerformanceMetric, SEALED_PERFORMANCE_DEFINITIONS } from "../src/research/source-aware-metric-resolver";

const root = process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts");
const read = (name: string) => JSON.parse(readFileSync(resolve(root, "fixtures", name), "utf8"));
describe("source-aware sealed performance scalar resolver", () => {
  it("prefers an available engine fact over a derived companion, with literal provenance", () => {
    const analyticsV2 = ResearchRetainedAnalyticsV2Schema.parse(read("research-retained-analytics-v2.fixed.valid.json"));
    const enriched = ResearchEnrichedAnalysisSchema.parse(read("research-enriched-analysis.healthy.valid.json"));
    const before = JSON.stringify({ analyticsV2, enriched });
    expect(resolveSealedPerformanceMetric("sharpe", { analyticsV2, enriched })).toEqual({
      ...analyticsV2.metrics.sharpe, source: "SUMMARY_ANALYTICS_V2", definition_id: SEALED_PERFORMANCE_DEFINITIONS.engineSharpe,
    });
    expect(resolveSealedPerformanceMetric("sharpe_decay", { analyticsV2, enriched })).toEqual({
      ...analyticsV2.metrics.sharpe_decay, source: "SUMMARY_ANALYTICS_V2", definition_id: SEALED_PERFORMANCE_DEFINITIONS.portalDecay,
    });
    expect(JSON.stringify({ analyticsV2, enriched })).toBe(before);
  });
  it("does not calculate a missing scalar, trust a mismatched fact digest, or relabel its origin", () => {
    expect(resolveSealedPerformanceMetric("sharpe", {})).toBeUndefined();
    const enriched = ResearchEnrichedAnalysisSchema.parse(read("research-enriched-analysis.healthy.valid.json"));
    expect(resolveSealedPerformanceMetric("sharpe", { enriched })).toMatchObject({
      origin: "PORTAL_DERIVED", source_locator: "quantbt.full_report.sharpe", definition_id: SEALED_PERFORMANCE_DEFINITIONS.portalSharpe,
    });
    expect(resolveSealedPerformanceMetric("sharpe_decay", { enriched })).toMatchObject({
      value: null, state: "NOT_APPLICABLE", reason_code: "PORTAL_ANALYTICS_IS_OR_OOS_SHARPE_UNAVAILABLE",
    });
    enriched.facts.metrics.sharpe.input_digest = "0".repeat(64);
    expect(resolveSealedPerformanceMetric("sharpe", { enriched })).toBeUndefined();
  });
});
