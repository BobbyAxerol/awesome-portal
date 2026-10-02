import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ResearchEnrichedAnalysisSchema, ResearchEnrichedAvailabilitySchema, enrichedAvailability, verifiedEnriched } from "../src/research/enriched-analysis.contract";
import { sha256ResearchJson } from "../src/research/preflight.service";
import { enrichedJoin } from "../src/research/enriched-analysis.read";

const root = process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts");
const read = (name: string) => JSON.parse(readFileSync(resolve(root, `fixtures/research-enriched-analysis.${name}.valid.json`), "utf8"));
const chartBlock = () => {
  const block = read("healthy");
  const fact = (value: string) => ({ ...block.facts.metrics.sharpe, origin: "PORTAL_DERIVED", value,
    state: "AVAILABLE", reason_code: null, source_locator: "scoped.daily_returns:ALL_TIME_UTC_DAY" });
  Object.assign(block.return_distribution, { mean: fact("0"), median: fact("0"), var_95: fact("0.185"), cvar_95: fact("0.2"),
    statistics_policy: { quantile_method: "LINEAR_TYPE_7", probability: "0.95", risk_variable: "LOSS_FRACTION_NEGATIVE_RETURN",
      risk_sign: "SIGNED_LOSS_FRACTION", tail: "LOSS_GTE_VAR_INCLUSIVE", minimum_observations: 2 } });
  for (const episode of block.drawdown_episodes.values) {
    episode.label = "Drawdown 1 (open)";
    episode.regime = { state: "NOT_PUBLISHED", value: null, reason_code: "SOURCE_DID_NOT_PUBLISH_MARKET_REGIME",
      source_locator: "QuantBT.result.metadata:market_regime_not_published", input_digest: block.input_digest };
  }
  block.windows.oos = { ...block.windows.oos, start_ms: block.scope.first_at_utc_ms, end_ms: block.scope.last_at_utc_ms + 1,
    source_locator: "P08.sealed_windows.OOS", bounds_semantics: "START_INCLUSIVE_END_EXCLUSIVE" };
  return block;
};
describe("B6 shared enriched analysis", () => {
  it("publishes block absence, source-pending and available without invented zero or code", () => {
    expect(enrichedAvailability(undefined)).toEqual({ state: "NOT_PUBLISHED", reason_code: "SEALED_ENRICHMENT_NOT_COMPUTED" });
    expect(enrichedAvailability(undefined, false).reason_code).toBe("SOURCE_EVIDENCE_NOT_SEALED");
    expect(enrichedAvailability(read("healthy"))).toEqual({ state: "AVAILABLE", reason_code: null });
    expect(ResearchEnrichedAvailabilitySchema.safeParse({ state: "AVAILABLE", reason_code: "SEALED_ENRICHMENT_NOT_COMPUTED" }).success).toBe(false);
  });
  it.each(["healthy", "partial-month", "no-benchmark"])("accepts Python-derived %s with exact binding", name => {
    const block = read(name);
    expect(ResearchEnrichedAnalysisSchema.safeParse(block).success).toBe(true);
    expect(verifiedEnriched(block, sha256ResearchJson(block), block.run_id)).toEqual(block);
    expect(() => verifiedEnriched(block, "0".repeat(64), block.run_id)).toThrow();
    expect(() => verifiedEnriched(block, sha256ResearchJson(block), "rrun_" + "b".repeat(32))).toThrow();
  });
  it("refuses relabelled rolling/window/count/digest facts", () => {
    for (const mutate of [
      (b: any) => b.basis = "LAST_30D", (b: any) => b.rolling = {},
      (b: any) => b.windows.is.state = "AVAILABLE", (b: any) => b.return_distribution.buckets[0].count++,
      (b: any) => b.facts.metrics.sharpe.input_digest = "0".repeat(64),
      (b: any) => b.curves.strategy_rebased_100.reverse(),
    ]) { const block = read("healthy"); mutate(block); expect(ResearchEnrichedAnalysisSchema.safeParse(block).success).toBe(false); }
  });
  it("keeps old seals absent and sources bound by workspace/run/revision", () => {
    const old = read("old-seal-absent");
    expect(old.reason_code).toBe("SEALED_ENRICHMENT_NOT_COMPUTED");
    expect(verifiedEnriched(undefined, undefined, "rrun_" + "a".repeat(32))).toBeUndefined();
    const sql = enrichedJoin("wanted.workspace_id", "wanted.run_id");
    expect(sql).toContain("retained_import_digest=enrichment.source_digest");
    expect(sql).toContain("projection.source_evidence_digest=enrichment.source_digest");
    expect(sql).not.toMatch(/UPDATE|INSERT|DELETE/);
  });
  it("reuses only deeply immutable verified objects, never a digest-only cache", () => {
    const block = read("healthy"), digest = sha256ResearchJson(block);
    const first = verifiedEnriched(block, digest, block.run_id)!;
    expect(verifiedEnriched(block, digest, block.run_id)).toBe(first);
    expect(Object.isFrozen(block)).toBe(true);
    expect(Object.isFrozen(block.curves.strategy_rebased_100)).toBe(true);
    expect(Object.isFrozen(first.facts.metrics)).toBe(true);
    expect(() => { block.curves.strategy_rebased_100[0].value = "999"; }).toThrow();
    expect(() => { first.run_id = "rrun_" + "b".repeat(32); }).toThrow();
    expect(() => verifiedEnriched(block, "0".repeat(64), block.run_id)).toThrow();
    expect(() => verifiedEnriched(block, digest, "rrun_" + "b".repeat(32))).toThrow();
    const forged = read("healthy"); forged.facts.metrics.sharpe.input_digest = "0".repeat(64);
    expect(() => verifiedEnriched(forged, digest, forged.run_id)).toThrow();
    const fresh = read("healthy");
    expect(verifiedEnriched(fresh, digest, fresh.run_id)).not.toBe(first);
  });
  it("preserves legacy immutable v1 shapes/hashes without chart defaults", () => {
    const block = read("healthy"), digest = sha256ResearchJson(block);
    const parsed = ResearchEnrichedAnalysisSchema.parse(block);
    expect(sha256ResearchJson(parsed)).toBe(digest);
    expect(parsed.return_distribution.mean).toBeUndefined();
    expect(parsed.windows.oos.start_ms).toBeUndefined();
    expect(parsed.library_summary.return_basis).toBeUndefined();
  });
  it("binds optional return base to the exact retained OOS span, not account starting capital", () => {
    const block = chartBlock();
    block.library_summary.return_basis = { definition_id: "FIRST_LAST_RETAINED_OOS_EQUITY_V1",
      scope: "RETAINED_OOS_OBSERVATIONS", first_at_utc_ms: block.scope.first_at_utc_ms,
      last_at_utc_ms: block.scope.last_at_utc_ms, start_equity: "100", end_equity: "101",
      source_locator: block.scope.locator };
    expect(ResearchEnrichedAnalysisSchema.safeParse(block).success).toBe(true);
    for (const mutate of [(b: any) => b.library_summary.return_basis.first_at_utc_ms++,
      (b: any) => b.library_summary.return_basis.source_locator = "starting_capital",
      (b: any) => b.library_summary.return_basis.start_equity = "0"]) {
      const invalid = structuredClone(block); mutate(invalid);
      expect(ResearchEnrichedAnalysisSchema.safeParse(invalid).success).toBe(false);
    }
  });
  it("accepts source-bound daily facts and signed loss risk without publishing window accounts", () => {
    const block = chartBlock();
    block.return_distribution.var_95.value = "-0.11";
    block.return_distribution.cvar_95.value = "-0.1";
    block.windows.holdout = { ...block.windows.holdout, start_ms: block.scope.last_at_utc_ms + 1,
      end_ms: block.scope.last_at_utc_ms + 2, source_locator: "P08.sealed_windows.HOLDOUT", bounds_semantics: "START_INCLUSIVE_END_EXCLUSIVE" };
    expect(ResearchEnrichedAnalysisSchema.safeParse(block).success).toBe(true);
    expect(verifiedEnriched(block, sha256ResearchJson(block), block.run_id)).toEqual(block);
  });
  it("rejects partial statistics/policies, forged regimes and unlocated/out-of-scope bounds", () => {
    for (const mutate of [
      (b: any) => delete b.return_distribution.mean,
      (b: any) => delete b.return_distribution.statistics_policy,
      (b: any) => b.return_distribution.statistics_policy.tail = "EXCLUSIVE",
      (b: any) => b.return_distribution.mean.origin = "ENGINE_DIRECT",
      (b: any) => b.return_distribution.mean.input_digest = "0".repeat(64),
      (b: any) => b.scope.coverage = b.library_summary.coverage = "SAMPLED_RETAINED_EQUITY",
      (b: any) => delete b.windows.oos.source_locator,
      (b: any) => b.windows.oos.end_ms = b.scope.last_at_utc_ms,
      (b: any) => b.windows.oos.start_ms = b.scope.first_at_utc_ms + 1,
      (b: any) => b.drawdown_episodes.values[0].regime.input_digest = "0".repeat(64),
      (b: any) => b.drawdown_episodes.values[0].regime = { state: "AVAILABLE", value: "bull", reason_code: null },
    ]) { const block = chartBlock(); mutate(block); expect(ResearchEnrichedAnalysisSchema.safeParse(block).success).toBe(false); }
  });
  it("keeps sampled daily statistics individually absent instead of fabricated zero", () => {
    const block = chartBlock();
    block.scope.coverage = block.library_summary.coverage = "SAMPLED_RETAINED_EQUITY";
    Object.assign(block.return_distribution, { state: "NOT_PUBLISHED", observation_count: 0, buckets: [],
      reason_code: "P04_RETAINED_SAMPLED_EQUITY_HAS_NO_DAILY_RETURN_LEDGER" });
    for (const key of ["mean", "median", "var_95", "cvar_95"]) Object.assign(block.return_distribution[key],
      { state: "NOT_PUBLISHED", value: null, reason_code: "P04_RETAINED_SAMPLED_EQUITY_HAS_NO_DAILY_RETURN_LEDGER" });
    expect(ResearchEnrichedAnalysisSchema.safeParse(block).success).toBe(true);
  });
});
