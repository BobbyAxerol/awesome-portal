import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
const root = join(__dirname, "..");
const read = (path: string) => JSON.parse(readFileSync(join(root, path), "utf8"));
const validate = new Ajv2020({ strict: true }).compile(read("schemas/research-enriched-analysis.v1.schema.json"));
const chart = () => {
  const block = read("fixtures/research-enriched-analysis.healthy.valid.json");
  const fact = (value: string) => ({ ...block.facts.metrics.sharpe, origin: "PORTAL_DERIVED", value,
    source_locator: "scoped.daily_returns:ALL_TIME_UTC_DAY" });
  Object.assign(block.return_distribution, { mean: fact("0"), median: fact("0"), var_95: fact("-0.11"), cvar_95: fact("-0.1"),
    statistics_policy: { quantile_method: "LINEAR_TYPE_7", probability: "0.95", risk_variable: "LOSS_FRACTION_NEGATIVE_RETURN",
      risk_sign: "SIGNED_LOSS_FRACTION", tail: "LOSS_GTE_VAR_INCLUSIVE", minimum_observations: 2 } });
  return block;
};
describe("B9 additive chart field generation", () => {
  it("keeps old immutable captures valid without inserting chart defaults", () => {
    const old = read("fixtures/research-enriched-analysis.healthy.valid.json");
    expect(validate(old)).toBe(true);
    expect(old.return_distribution.mean).toBeUndefined();
  });
  it("accepts signed loss facts as one policy-bound block, rejects partial stats", () => {
    const block = chart();
    expect(validate(block), JSON.stringify(validate.errors)).toBe(true);
    delete block.return_distribution.mean;
    expect(validate(block)).toBe(false);
  });
  it("requires locator and half-open semantics whenever window bounds are published", () => {
    const block = chart();
    block.windows.oos.start_ms = block.scope.first_at_utc_ms;
    expect(validate(block)).toBe(false);
    Object.assign(block.windows.oos, { end_ms: block.scope.last_at_utc_ms + 1,
      source_locator: "P10.immutable_requested_spec.windows.oos", bounds_semantics: "START_INCLUSIVE_END_EXCLUSIVE" });
    expect(validate(block), JSON.stringify(validate.errors)).toBe(true);
  });
  it("publishes chart and provenance fields in generated named consumers", () => {
    const evidence = readFileSync(join(root, "generated/research-evidence.d.ts"), "utf8");
    expect(evidence).toContain("var_95?");
    expect(evidence).toContain("SIGNED_LOSS_FRACTION");
    const compare = readFileSync(join(root, "generated/research-compare.d.ts"), "utf8");
    expect(compare).toContain("chart_annotations?");
    expect(compare).toContain("ALL_RETAINED_OOS_MONTHS_MAX_MIN_RETURN_V1");
  });
});
