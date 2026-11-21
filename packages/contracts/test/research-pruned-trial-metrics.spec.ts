import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import { amendSearchContracts } from "../tooling/generate-research-search.mjs";

const root = resolve(__dirname, "..");
const original = readFileSync(resolve(root, "openapi/research-current-source.openapi.json"), "utf8");
const schemas = JSON.parse(original).components.schemas;
const defs = JSON.parse(JSON.stringify(schemas).replaceAll("#/components/schemas/", "#/$defs/"));
const ajv = new Ajv2020({ strict: false, allErrors: true, unicodeRegExp: false });
const validate = ajv.compile({ $defs: defs, $ref: "#/$defs/TrialFacts" });
const fixture = JSON.parse(readFileSync(resolve(root, "fixtures/research-current-source.pruned-trial.synthetic.valid.json"), "utf8"));

describe("BR-S02-20 generated pruned trial metric contract", () => {
  it("accepts canonical typed absence and rejects numeric or unqualified null on every metric", () => {
    expect(validate(fixture)).toBe(true);
    for (const key of Object.keys(fixture.metrics)) {
      for (const metric of [{ value: "0", reason_code: null }, { value: "1.25", reason_code: null }, { value: null, reason_code: null }]) {
        const invalid = structuredClone(fixture); invalid.metrics[key] = metric;
        expect(validate(invalid), key).toBe(false);
      }
    }
  });
  it("COMPLETE zero remains exact, never globally interpreted as absence", () => {
    const complete = structuredClone(fixture); complete.pruned = false;
    complete.metrics.mean_is_sharpe = { value: "0", reason_code: null };
    expect(validate(complete)).toBe(true);
  });
  it("rejects objective terms and formulas on a pruned trial", () => {
    const invalid = structuredClone(fixture);
    invalid.objective_components.formula = "PARTIAL_OBJECTIVE";
    expect(validate(invalid)).toBe(false);
    invalid.objective_components.formula = null;
    invalid.objective_components.terms = [{ term: "mean_is_sharpe", weight: "1", value: "0", contribution: "0" }];
    expect(validate(invalid)).toBe(false);
  });
  it("generator is idempotent and preserves unrelated components", () => {
    expect(amendSearchContracts(original)).toBe(original);
    const generated = readFileSync(resolve(root, "generated/research-current-source.d.ts"), "utf8");
    expect(generated).toContain("PrunedTrialMetric:"); expect(generated).toContain('"TRIAL_PRUNED_NO_OBJECTIVE"');
    const withoutPruned = original.replace(/^      "PrunedTrialMetric": [^\n]+,\n/m, "");
    const before = JSON.parse(withoutPruned);
    const after = JSON.parse(amendSearchContracts(withoutPruned));
    for (const [key, value] of Object.entries(before.components.schemas)) {
      if (!["TrialFacts", "SurfacePoint"].includes(key)) expect(after.components.schemas[key]).toEqual(value);
    }
  });
});
