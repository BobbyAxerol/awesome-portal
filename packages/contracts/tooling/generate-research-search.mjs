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
// BR-S02-22: the full pool remains retained; transport uses its own opaque
// cursor when a 620-member pool would overflow the one-MiB named response.
const search = document.components.schemas.Search;
const candidates = search.allOf.find(part=>part.properties?.candidates).properties.candidates;
candidates.properties.returned_rows = {type:"integer",minimum:0,maximum:200};
candidates.properties.page = {$ref:"#/components/schemas/Page"};
candidates.description = "Complete source_candidate_count; rows are one independent candidate page. Large pools use 50 rows, small historical pools remain whole. Follow page.next_cursor as candidate_cursor; no trial cursor can address this relation. Selection/pool calculations always use all retained candidates.";
updated = replaceComponent(updated,"Search",search,updated.indexOf('"schemas": {'));
const operation = document.paths["/api/v1/quantbt/runs/{runId}/current-source/search"].get;
const candidateCursor = {name:"candidate_cursor",in:"query",required:false,
  schema:{$ref:"#/components/schemas/OpaqueCursor"},description:"Independent candidate-page cursor, scoped to this workspace/run/revision/operation/table. Never a TRIAL cursor."};
const params = [...operation.parameters.filter(p=>p.name!=="candidate_cursor"),candidateCursor];
const operationStart = updated.indexOf('"/api/v1/quantbt/runs/{runId}/current-source/search"');
const parameterStart = updated.indexOf('"parameters":',operationStart);
const parameterEnd = updated.indexOf('\n',parameterStart);
if(parameterStart<0||parameterEnd<0)throw new Error("Missing compact Search parameters layout");
updated = updated.slice(0,parameterStart)+`"parameters": ${JSON.stringify(params)},`+updated.slice(parameterEnd);
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
