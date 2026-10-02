import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ResearchEnrichedAnalysisSchema, ResearchEnrichedAvailabilitySchema, enrichedAvailability, verifiedEnriched } from "../src/research/enriched-analysis.contract";
import { sha256ResearchJson } from "../src/research/preflight.service";
import { enrichedJoin } from "../src/research/enriched-analysis.read";

const root = process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts");
const read = (name: string) => JSON.parse(readFileSync(resolve(root, `fixtures/research-enriched-analysis.${name}.valid.json`), "utf8"));
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
});
