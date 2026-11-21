import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { compareChartAnnotation } from "../src/research/compare-annotations";
import { ResearchEnrichedAnalysisSchema } from "../src/research/enriched-analysis.contract";
import { ResearchCompareChartAnnotationSchema } from "../src/research/compare.contract";

const root = process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts");
const enrichment = () => ResearchEnrichedAnalysisSchema.parse(JSON.parse(readFileSync(
  resolve(root, "fixtures/research-enriched-analysis.healthy.valid.json"), "utf8")));

describe("B9 immutable original-run chart annotations", () => {
  it("keeps original scope, exact values, source digest and drawdown metadata", () => {
    const block = enrichment();
    const annotation = compareChartAnnotation(block.run_id, block);
    expect(ResearchCompareChartAnnotationSchema.safeParse(annotation).success).toBe(true);
    expect(annotation.input_digest).toBe(block.input_digest);
    expect(annotation.scope).toEqual(block.scope);
    expect(annotation.all_time_metrics).toEqual(block.facts.metrics);
    expect(annotation.drawdown_episodes).toEqual(block.drawdown_episodes);
    expect(annotation.month_extrema.availability.state).toBe("AVAILABLE");
  });
  it("orders exact decimal extrema without binary64 ties", () => {
    const block = enrichment(), row = block.monthly_returns.values[0]!;
    block.monthly_returns.values = [
      { ...row, return_fraction: "0.100000000000000001" },
      { ...row, month_start_utc_ms: row.month_start_utc_ms + 1, return_fraction: "0.100000000000000002" },
    ];
    block.monthly_returns.total_period_count = 2;
    const annotation = compareChartAnnotation(block.run_id, block);
    expect(annotation.month_extrema.best?.return_fraction).toBe("0.100000000000000002");
    expect(annotation.month_extrema.worst?.return_fraction).toBe("0.100000000000000001");
  });
  it("does not call truncated transported months all-time extrema", () => {
    const block = enrichment();
    block.monthly_returns.omitted_transport_period_count = 1;
    const annotation = compareChartAnnotation(block.run_id, block);
    expect(annotation.month_extrema.availability.reason_code).toBe("B9_MONTH_TRANSPORT_DOES_NOT_COVER_FULL_POPULATION");
    expect(annotation.month_extrema.best).toBeNull();
    expect(annotation.month_extrema.worst).toBeNull();
  });
  it("returns typed absence, not zero, for an old unamended run", () => {
    const annotation = compareChartAnnotation("rrun_" + "a".repeat(32));
    expect(ResearchCompareChartAnnotationSchema.safeParse(annotation).success).toBe(true);
    expect(annotation.availability.state).toBe("NOT_PUBLISHED");
    expect(annotation.all_time_metrics).toBeNull();
    expect(annotation.scope).toBeNull();
  });
});
