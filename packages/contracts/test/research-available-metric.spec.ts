import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("B8 published AVAILABLE metric invariants", () => {
  for (const [file, component] of [
    ["research-run-library", "MetricCell"],
    ["research-attempt-lineage", "RunMetricFact"],
    ["research-compare", "Metric"],
  ]) {
    it(`${file} requires a non-null wire value when AVAILABLE`, () => {
      const document = JSON.parse(readFileSync(resolve(__dirname, `../openapi/${file}.openapi.json`), "utf8"));
      const constraint = document.components.schemas[component].allOf[0];
      expect(constraint.if.properties.availability.properties.state.const).toBe("AVAILABLE");
      expect(constraint.then.properties.value.type).toBe("string");
      expect(constraint.then.required).toEqual(["value"]);
    });
  }
});
