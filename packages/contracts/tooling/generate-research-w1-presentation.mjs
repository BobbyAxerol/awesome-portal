/** W1 optional display facts; never amend private retained rows or old fixtures. */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { replaceComponent } from "./generate-research-progress-truth.mjs";

const nullable = value => ({ anyOf: [value, { type: "null" }] });
export const selectedTrialPresentation = {
  selected_trial_ordinal: nullable({ type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER }),
  selected_trial_ordinal_scope: nullable({ enum: ["RUN_GLOBAL", "STUDY_LOCAL"] }),
  selected_trial_ordinal_reason_code: nullable({ enum: ["SELECTION_HAS_NO_TRIAL", "SOURCE_TRIAL_NUMBER_NOT_PUBLISHED", "STUDY_LOCAL_TRIAL_MAPPING_NOT_PUBLISHED"] }),
};
export function amendW1Presentation(original, name) {
  const d = JSON.parse(original), s = d.components.schemas, updates = {};
  if (name === "research-current-source") {
    updates.Common = structuredClone(s.Common);
    updates.Common.properties.source_revision = {
      ...s.Common.properties.revision,
      description: "Immutable retained seal facts for this view. Does not include presentation, byte-verification receipts or utility-job state. Different view prefixes may share the seal hash. Not an HTTP cache validator.",
    };
    updates.Common.properties.presentation_revision = { type: "string", minLength: 1, maxLength: 200,
      description: "Exact response representation validator, including display/verification changes. Use the HTTP ETag for caching. Existing revision remains unchanged for backward cursor/reader compatibility." };
    for (const key of ["Selection", "FrozenSelection", "CausalSelection"]) {
      const schema = structuredClone(s[key]);
      if (!schema?.properties) throw new Error(`Missing named selection ${key}`);
      // CausalSelection is a public transport schema, not the private source
      // zod schema; public fields remain optional for historical captures.
      Object.assign(schema.properties, selectedTrialPresentation);
      schema.description = (schema.description ?? "").replace(/ W1 ordinal:.*$/, "")
        + " W1 ordinal: display only, source number + 1. Qualified studies require a retained native study/trial mapping and STUDY_LOCAL scope; never a run-global trial. Null carries an explicit reason. Not a digest or selection identity.";
      updates[key === "CausalSelection" ? "DisplayCausalSelection" : key] = schema;
    }
    updates.Fold = structuredClone(s.Fold);
    updates.Fold.properties.causal_selection = { $ref: "#/components/schemas/DisplayCausalSelection" };
  } else if (name === "research-evidence") {
    const progress = JSON.parse(readFileSync(new URL("../openapi/research-progress.openapi.json", import.meta.url), "utf8"));
    const schema = structuredClone(s.Lifecycle);
    schema.properties.failed_at = nullable(progress.components.schemas.ProgressFailedAt);
    schema.properties.failed_at.description = "Same persisted-snapshot rule as Progress, only for FAILED lifecycle. Null means no exact stopped-stage fact; the browser never infers a failure from RUNNING alone.";
    schema.allOf = [{ if: { properties: { failed_at: { type: "object" } }, required: ["failed_at"] },
      then: { properties: { terminal_outcome: { const: "FAILED" } } } }];
    updates.Lifecycle = schema;
  } else throw new Error("Unknown W1 contract");
  let next = original;
  for (const [key, schema] of Object.entries(updates)) {
    if (s[key]) next = replaceComponent(next, key, schema, next.indexOf('"schemas": {'));
    else next = next.replace('"schemas": {\n', `"schemas": {\n      "${key}": ${JSON.stringify(schema)},\n`);
  }
  return next;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const names = process.argv.find(v => v.startsWith("--only="))?.slice(7).split(",") ?? ["research-current-source", "research-evidence"];
  for (const name of names) {
    const path = new URL(`../openapi/${name}.openapi.json`, import.meta.url);
    const old = readFileSync(path, "utf8"), next = amendW1Presentation(old, name);
    if (process.argv.includes("--check")) { if (old !== next) throw new Error(`W1 presentation drift: ${name}`); }
    else if (next !== old) writeFileSync(path, next);
  }
}
