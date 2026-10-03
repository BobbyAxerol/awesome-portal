/** Additive sealed-scalar provenance in three named components only. */
import { readFileSync, writeFileSync } from "node:fs";
const check = process.argv.includes("--check");
const provenance = {
  origin: { enum: ["ENGINE_DIRECT", "PORTAL_DERIVED"] },
  source_locator: { type: "string", minLength: 1, maxLength: 256 },
  input_digest: { type: "string", pattern: "^[0-9a-f]{64}$" },
};
for (const [name, component] of [["research-run-library", "MetricCell"], ["research-attempt-lineage", "RunMetricFact"], ["research-compare", "Metric"]]) {
  const path = new URL(`../openapi/${name}.openapi.json`, import.meta.url);
  const original = readFileSync(path, "utf8"), document = JSON.parse(original);
  const metric = document.components.schemas[component];
  if (!metric?.properties?.definition_id || !metric.properties.scope) throw new Error(`Missing ${component}`);
  Object.assign(metric.properties, provenance);
  const sources = ["SUMMARY_ANALYTICS_V2", "ENRICHED_ANALYSIS"];
  if (component !== "RunMetricFact") metric.properties.source = { enum: sources };
  // A later Compare target runs this amender again after causal generation.
  // Keep the already-supported source token; otherwise OpenAPI loses it while
  // the earlier generated Lineage type/runtime still publish it.
  else metric.properties.source.anyOf[0].enum = ["P13_EVIDENCE_PROJECTION", "RS02_RETAINED_SELECTED_TRIAL", ...sources,
    "RS02_RETAINED_OUTER_FOLD_SELECTIONS"];
  // Match the runtime refinement: absence is typed, never AVAILABLE/null.
  metric.allOf = [{
    if: {
      properties: { availability: { properties: { state: { const: "AVAILABLE" } }, required: ["state"] } },
      required: ["availability"],
    },
    then: { properties: { value: { type: "string", minLength: 1 } }, required: ["value"] },
  }];
  // Preserve all unrelated components, formatting and required-field lists.
  const line = new RegExp(`^      "${component}": [^\\n]+,$`, "m");
  const block = new RegExp(`^      "${component}": \\{\\n[\\s\\S]*?^      },$`, "m");
  const target = line.test(original) ? line : block;
  if (!target.test(original)) throw new Error(`${component} layout changed`);
  const updated = original.replace(target, `      "${component}": ${JSON.stringify(metric)},`);
  if (updated !== original) {
    if (check) throw new Error(`${component} generated drift`);
    writeFileSync(path, updated);
  }
}
process.stdout.write(`Library/Lineage/Compare sealed metrics ${check ? "verified" : "generated"}.\n`);
