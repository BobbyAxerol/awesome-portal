import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ResearchEnrichedAnalysisSchema, verifiedEnriched } from "../src/research/enriched-analysis.contract";
import { sha256ResearchJson } from "../src/research/preflight.service";

const root = process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts");
const read = () => JSON.parse(readFileSync(resolve(root, "fixtures/research-enriched-analysis.fixed-is.valid.json"), "utf8"));

describe("source-time complete declared IS supplement", () => {
  it("accepts exact Python source-time output without changing OOS scope or holdout authority", () => {
    const block = read(), parsed = ResearchEnrichedAnalysisSchema.parse(block);
    expect(verifiedEnriched(block, sha256ResearchJson(block), block.run_id)).toEqual(parsed);
    expect(parsed.scope.window).toBe("OOS");
    expect(parsed.windows.is.state).toBe("AVAILABLE");
    expect(parsed.windows.holdout.state).toBe("NOT_PUBLISHED");
    expect(parsed.by_window!.is.scope.coverage).toBe("FULL_SOURCE_IS");
    expect(parsed.by_window!.is.return_distribution.buckets.reduce((n, r) => n + r.count, 0)).toBe(34);
    expect(parsed.by_window!.is.benchmark.state).toBe("AVAILABLE");
    expect(sha256ResearchJson(parsed)).toBe(sha256ResearchJson(block));
  });

  it("requires source-time payload for availability, never metadata or sampled data", () => {
    for (const mutate of [
      (b: any) => delete b.by_window,
      (b: any) => b.by_window.holdout = b.by_window.is,
      (b: any) => b.lane = "WFO",
      (b: any) => b.scope.coverage = b.library_summary.coverage = "SAMPLED_RETAINED_EQUITY",
      (b: any) => b.windows.is.state = "NOT_PUBLISHED",
      (b: any) => b.windows.holdout = { state: "AVAILABLE", reason_code: null },
      (b: any) => b.source_tables = b.source_tables.filter((r: any) => r.name !== "OBSERVATION_IS"),
      (b: any) => b.source_tables.find((r: any) => r.name === "OBSERVATION_IS").row_count++,
      (b: any) => b.by_window.is.facts.metrics.sharpe.scope = "OOS",
      (b: any) => b.by_window.is.facts.metrics.sharpe.input_digest = "0".repeat(64),
      (b: any) => b.by_window.is.facts.metrics.return_fraction.origin = "ENGINE_DIRECT",
      (b: any) => b.by_window.is.scope.end_ms++,
      (b: any) => b.by_window.is.scope.first_at_utc_ms = b.by_window.is.scope.start_ms - 1,
      (b: any) => b.by_window.is.return_basis.start_equity = "0",
      (b: any) => b.by_window.is.return_basis.source_locator = "display_curve",
      (b: any) => b.by_window.is.facts.metrics.max_drawdown_fraction.value = "0.1",
      (b: any) => b.by_window.is.curves.strategy_rebased_100.reverse(),
      (b: any) => b.by_window.is.curves.strategy_rebased_100[0].value = "101",
      (b: any) => b.by_window.is.curves.drawdown_fraction.pop(),
      (b: any) => b.by_window.is.curves.sampling.emitted_point_count++,
      (b: any) => b.by_window.is.benchmark.input_digest = "0".repeat(64),
      (b: any) => b.by_window.is.curves.benchmark_rebased_100 = [],
      (b: any) => b.by_window.is.return_distribution.buckets[0].count++,
      (b: any) => b.by_window.is.return_distribution.mean.scope = "OOS",
      (b: any) => b.by_window.is.return_distribution.var_95.input_digest = "0".repeat(64),
      (b: any) => b.by_window.is.return_distribution.statistics_policy.tail = "EXCLUSIVE",
    ]) {
      const block = read(); mutate(block);
      expect(ResearchEnrichedAnalysisSchema.safeParse(block).success).toBe(false);
    }
  });

  it("permits a named missing benchmark and signed IS risk, not invented prices", () => {
    const block = read(), is = block.by_window.is;
    Object.assign(is.benchmark, { state: "NOT_PUBLISHED", reason_code: "IS_SOURCE_ALIGNED_POSITIVE_CLOSE_NOT_PUBLISHED" });
    is.curves.benchmark_rebased_100 = [];
    is.return_distribution.var_95.value = "-0.1";
    is.return_distribution.cvar_95.value = "-0.05";
    expect(ResearchEnrichedAnalysisSchema.safeParse(block).success).toBe(true);
    is.benchmark.state = "AVAILABLE";
    expect(ResearchEnrichedAnalysisSchema.safeParse(block).success).toBe(false);
  });
});
