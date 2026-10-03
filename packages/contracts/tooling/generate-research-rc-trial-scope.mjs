/** Additive RC scope; reuse selected_trial_number rather than a duplicate ordinal field. */
import { readFileSync, writeFileSync } from "node:fs";
import { replaceComponent } from "./generate-research-progress-truth.mjs";
const path = new URL("../openapi/research-release-candidate.openapi.json", import.meta.url);
const old = readFileSync(path, "utf8"), schema = structuredClone(JSON.parse(old).components.schemas.SelectedParams);
const nullable = value => ({ anyOf: [value, { type: "null" }] });
Object.assign(schema.properties, {
  selected_trial_number_scope: nullable({ enum: ["RUN_GLOBAL", "STUDY_LOCAL"] }),
  selected_trial_source_id: nullable({ type: "string", minLength: 1, maxLength: 191 }),
  selected_trial_study_id: nullable({ type: "string", minLength: 1, maxLength: 191 }),
});
schema.properties.selected_trial_number.description = "Server-owned source-backed display ordinal; causal numbers are local to selected_trial_study_id. Same native mapping as Search/Freeze, not a parsed rail label or cumulative progress count.";
const next = replaceComponent(old, "SelectedParams", schema, old.indexOf('"schemas": {'));
if (process.argv.includes("--check")) { if (old !== next) throw new Error("RC trial scope contract drift"); }
else if (old !== next) writeFileSync(path, next);
