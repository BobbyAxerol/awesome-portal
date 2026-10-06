import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import { enrichedAnalysisSchema as schema } from "../tooling/generate-research-enriched-analysis.mjs";

const root = join(__dirname, "..");
const read = (name: string) => JSON.parse(readFileSync(join(root, `fixtures/research-enriched-analysis.${name}.valid.json`), "utf8"));
const validate = new Ajv2020({ strict: true }).compile(schema);

describe("optional IS source-time generated contract", () => {
  it("accepts canonical Python capture with IS-specific fact scope and the existing daily policy", () => {
    const block = read("fixed-is");
    if (!validate(block)) throw new Error(JSON.stringify(validate.errors));
    expect(block.by_window.is.scope.source_table).toBe("OBSERVATION_IS");
    expect(block.by_window.is.return_distribution.statistics_policy.quantile_method).toBe("LINEAR_TYPE_7");
    expect(schema.required).not.toContain("by_window");
    expect(schema.$defs.Fact.properties.scope.enum).toEqual(["OOS", "FULL_SAMPLE"]);
    expect(schema.$defs.ISFact.properties.scope.const).toBe("IS");
  });
  it.each(["healthy", "partial-month", "no-benchmark"])("keeps legacy %s accepted without default IS fields", name => {
    const block = read(name), before = JSON.stringify(block);
    expect(validate(block)).toBe(true);
    expect(JSON.stringify(block)).toBe(before);
    expect(block.by_window).toBeUndefined();
  });
  it("rejects missing, relabelled, sampled or holdout payloads in the generated schema", () => {
    for (const mutate of [
      (b: any) => delete b.by_window,
      (b: any) => b.lane = "WFO",
      (b: any) => b.scope.coverage = "SAMPLED_RETAINED_EQUITY",
      (b: any) => b.by_window.holdout = b.by_window.is,
      (b: any) => b.source_tables = b.source_tables.filter((r: any) => r.name !== "OBSERVATION_IS"),
      (b: any) => b.by_window.is.facts.metrics.sharpe.scope = "OOS",
      (b: any) => b.by_window.is.facts.metrics.sharpe.value = null,
      (b: any) => b.by_window.is.return_distribution.mean.origin = "ENGINE_DIRECT",
      (b: any) => b.by_window.is.return_distribution.statistics_policy.probability = "0.99",
      (b: any) => b.by_window.is.curves.strategy_rebased_100 = [],
      (b: any) => b.windows.holdout.state = "AVAILABLE",
    ]) { const block = read("fixed-is"); mutate(block); expect(validate(block)).toBe(false); }
  });
});
