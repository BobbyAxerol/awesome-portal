/** R-S06-2 additive exact surface parameters; preserve unrelated OpenAPI bytes. */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { replaceComponent } from "./generate-research-progress-truth.mjs";

export function amendSearchContracts(original) {
const document = JSON.parse(original);
const point = document.components.schemas.SurfacePoint;
if (!point?.properties?.source_ordinal || !point.properties.trial_id || !point.properties.positions) {
  throw new Error("Missing named source-ordinal SurfacePoint contract");
}
point.properties.parameters = {
  type: "object", maxProperties: 24,
  propertyNames: { type: "string", pattern: "^[A-Za-z][A-Za-z0-9_]{0,63}$" },
  additionalProperties: { $ref: "#/components/schemas/Decimal" },
  description: "Exact persisted trial parameters for this source_ordinal, identical to ledger.parameters; never display-step rounded.",
};
// Additive and optional: no historical response gains a default or required field.
const componentLine = /^      "SurfacePoint": [^\n]+,$/m;
if (!componentLine.test(original)) throw new Error("SurfacePoint component layout changed; refusing an unrelated rewrite");
let updated = original.replace(componentLine, `      "SurfacePoint": ${JSON.stringify(point)},`);
// BR-S02-20: source partial pruning-step metrics are not completed objectives.
const prunedMetric = {
  type: "object", additionalProperties: false, required: ["value", "reason_code"],
  properties: { value: { type: "null" }, reason_code: { const: "TRIAL_PRUNED_NO_OBJECTIVE" } },
};
const facts = document.components.schemas.TrialFacts;
facts.description = "Public completed-objective facts. When pruned is true, all five metrics are PrunedTrialMetric and objective_components is NOT_PUBLISHED/TRIAL_PRUNED_NO_OBJECTIVE with null formula and no terms. Raw retained pruning-step values and seal digests remain immutable; a COMPLETE trial's exact zero stays numeric.";
facts.allOf = [{
  if: { required: ["pruned"], properties: { pruned: { const: true } } },
  then: { properties: {
    metrics: { properties: Object.fromEntries(Object.keys(facts.properties.metrics.properties)
      .map(key => [key, { $ref: "#/components/schemas/PrunedTrialMetric" }])) },
    objective_components: { properties: {
      state: { const: "NOT_PUBLISHED" }, reason_code: { const: "TRIAL_PRUNED_NO_OBJECTIVE" },
      formula: { type: "null" }, terms: { maxItems: 0 },
    } },
  } },
}];
updated = replaceComponent(updated, "TrialFacts", facts, updated.indexOf('"schemas": {'));
if (document.components.schemas.PrunedTrialMetric) {
  updated = replaceComponent(updated, "PrunedTrialMetric", prunedMetric, updated.indexOf('"schemas": {'));
} else {
  updated = updated.replace('"schemas": {\n', `"schemas": {\n      "PrunedTrialMetric": ${JSON.stringify(prunedMetric)},\n`);
}
return updated;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
const path = new URL("../openapi/research-current-source.openapi.json", import.meta.url);
const original = readFileSync(path, "utf8"), updated = amendSearchContracts(original);
if (updated !== original) {
  if (process.argv.includes("--check")) throw new Error("Search surface generated drift");
  writeFileSync(path, updated);
}
process.stdout.write(`Search surface and pruned metrics ${process.argv.includes("--check") ? "verified" : "generated"}.\n`);
}
