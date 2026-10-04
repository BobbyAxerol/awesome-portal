/** §31 additive guidance/presentation; never modifies stored pack or hash inputs. */
import { readFileSync, writeFileSync } from "node:fs";
import { replaceComponent } from "./generate-research-progress-truth.mjs";

const action = {
  enum: ["NONE", "SEAL_CANDIDATE", "CREATE_NEW_RUN_AND_SEAL", "REVIEW_CURRENT_CANDIDATE", "WAIT"],
  description: "Server-owned guidance, not mutation authority. CREATE_NEW_RUN_AND_SEAL uses the existing new-run flow and a new candidate; it never reopens or reseals the old actor/run draft. NONE does not imply permission.",
};
const nullable = value => ({ anyOf: [value, { type: "null" }] });
const presentation = {
  selected_trial_ordinal: nullable({ type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER }),
  selected_trial_ordinal_scope: nullable({ enum: ["RUN_GLOBAL", "STUDY_LOCAL"] }),
  selected_trial_ordinal_reason_code: nullable({ enum: ["SELECTION_HAS_NO_TRIAL", "SOURCE_TRIAL_NUMBER_NOT_PUBLISHED", "STUDY_LOCAL_TRIAL_MAPPING_NOT_PUBLISHED"] }),
};
const railRule = {
  if: { anyOf: Object.keys(presentation).map(key => ({ required: [key] })) },
  then: {
    required: Object.keys(presentation), properties: { key: { const: "selected_params" } },
    anyOf: [
      { properties: { selected_trial_ordinal: { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
        selected_trial_ordinal_scope: { enum: ["RUN_GLOBAL", "STUDY_LOCAL"] }, selected_trial_ordinal_reason_code: { type: "null" } } },
      { properties: { selected_trial_ordinal: { type: "null" }, selected_trial_ordinal_scope: { type: "null" },
        selected_trial_ordinal_reason_code: { enum: presentation.selected_trial_ordinal_reason_code.anyOf[0].enum } } },
    ],
  },
};
for (const [name, components] of [
  ["research-release-candidate", ["ComposeActions", "ComposeRailNode", "ComposeResponse"]],
  ["research-release-candidate-publication", ["PublicationResponse"]],
]) {
  const path = new URL(`../openapi/${name}.openapi.json`, import.meta.url);
  const old = readFileSync(path, "utf8");
  let next = old;
  for (const component of components) {
    const schema = structuredClone(JSON.parse(next).components.schemas[component]);
    if (component === "PublicationResponse") {
      schema.properties.blocked_action = action;
      schema.properties.updated_at_utc_ms = { ...nullable({ type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER }),
        description: "Persisted publication intent update time; null before an intent exists. as_of_utc_ms is the observation time, never substituted for this fact." };
    }
    else if (component === "ComposeActions") schema.properties.publish.properties.blocked_action = action;
    else if (component === "ComposeRailNode") {
      Object.assign(schema.properties, presentation);
      schema.allOf = [railRule];
      schema.description = "Only selected_params carries complete native trial presentation; display-only, never a cursor or identity.";
    }
    else {
      schema.properties.actions.properties.publish.properties.blocked_action = action;
      Object.assign(schema.properties.rail.items.properties, presentation);
      schema.properties.rail.items.allOf = [railRule];
      schema.properties.rail.items.description = "Only selected_params carries the complete native trial presentation: nulls plus reason when absent; ordinal plus scope when present. Display-only, never a cursor or identity. Existing selected_params.selected_trial_number remains the same ordinal alias.";
    }
    next = replaceComponent(next, component, schema, next.indexOf('"schemas": {'));
  }
  if (process.argv.includes("--check")) {
    if (old !== next) throw new Error(`${name}: publish guidance drift`);
  } else if (old !== next) writeFileSync(path, next);
}
