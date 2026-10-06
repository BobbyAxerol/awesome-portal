/** Additive FULL-02 retained contracts. No recipe qualification is implied. */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { replaceComponent } from "./generate-research-progress-truth.mjs";
import { selectedTrialPresentation } from "./generate-research-w1-presentation.mjs";
import {amendFull03} from "./generate-research-full03.mjs";
import {amendFull04CurrentSource} from "./generate-research-full04-current-source.mjs";

const ref = name => ({ $ref: `#/components/schemas/${name}` });
const object = properties => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });
const nullable = value => ({ anyOf: [value, { type: "null" }] });
const token = { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$" };
const digest = { type: "string", pattern: "^[0-9a-f]{64}$" };
const decimal = { type: "string", pattern: "^-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?$", maxLength: 96 };
const ms = { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER };
const params = { type: "object", maxProperties: 24, propertyNames: { pattern: "^[A-Za-z][A-Za-z0-9_]{0,63}$" }, additionalProperties: decimal };
export const full02FoldSelection = object({
  schema_version: { const: "research.current-source-fold-selection.v1" }, scope: { const: "OUTER_FOLD_SELECTION" },
  study_id: token, selected_trial_id: token, parameters: params, objective: nullable(decimal),
  objective_kind: { const: "OUTER_FOLD_DECAY_J" }, candidate_is_metric: nullable(decimal),
  candidate_oos_metric: nullable(decimal), candidate_decay: nullable(decimal),
  candidate_count: { type: "integer", minimum: 1, maximum: 3 }, study_trial_rows: { const: 3 },
  outer_oos_used_for_selection: { const: true }, params_digest: digest,
  selection_sequence: { type: "integer", minimum: 0, maximum: 15 }, params_frozen_at_utc_ms: nullable(ms),
});
const window = object({ start_utc_ms: ms, end_exclusive_utc_ms: ms, bar_count: { type: "integer", minimum: 1, maximum: 100000 } });
const point = object({ at_utc_ms: ms, equity: decimal, return_fraction: decimal, accepted_position: decimal,
  drawdown_fraction: decimal, signal_target: nullable(decimal) });
const series = { type: "array", minItems: 1, maxItems: 192, items: point };
export const full02ProtocolDisclosure = {
  ...object({ schema_version: { const: "research.current-source-protocol-disclosure.v1" },
    protocol: { const: "three_window_decay" }, engine_operation: { const: "train_test_split" },
    calibration_scope: { const: "IS_OOS_ONLY" }, observation_scope: { const: "OOS_SELECTION_INPUT" },
    independent_holdout: object({ ...window.properties, state: { const: "AVAILABLE" },
      holdout_used_for_selection: { const: false }, selected_params_digest: digest, freeze_before_holdout: { const: true } }),
    windows: object({ is: window, oos: window, holdout: window }),
    window_series: object({ is: series, oos: series, holdout: series }),
  }),
  description: "Native Three Window facts: calibration uses IS and OOS only; independent holdout runs after frozen selection. UTC half-open windows are contiguous. Runtime verifies every emitted series point stays inside its own window. Observation/analytics rows are calibration OOS, never relabelled untouched holdout. No filesystem locator or engine input is exposed.",
};
export function amendFull02CurrentSource(original, file = "research-current-source") {
  const document = JSON.parse(original), schemas = document.components.schemas, updates = {};
  const edit = name => updates[name] ??= structuredClone(schemas[name]);
  const addEnum = (schema, value) => { if (!schema.enum.includes(value)) schema.enum.push(value); };
  updates.ProtocolDisclosure = full02ProtocolDisclosure;
  if (file === "research-current-source") {
    updates.FoldSelection = full02FoldSelection;
    updates.DisplayFoldSelection = { ...structuredClone(full02FoldSelection),properties: {
      ...structuredClone(full02FoldSelection.properties), ...selectedTrialPresentation } };
    const provenance = edit("Provenance");
    for (const suffix of ["per-fold-decay", "three-window"]) {
      const source = `full02.quantbt-signal-notional-${suffix}.v1`, profile = `full02.delta-signal-notional-${suffix}.v1`;
      addEnum(provenance.properties.source_adapter_id, source); addEnum(provenance.properties.profile_id, profile);
      if (!provenance.oneOf.some(pair => pair.properties?.profile_id?.const === profile))
        provenance.oneOf.push({ properties: { source_adapter_id: { const: source }, profile_id: { const: profile } } });
    }
    edit("Common").properties.protocol_disclosure = ref("ProtocolDisclosure");
    const artifactScope = edit("Evidence").allOf[1].properties.source_series_artifact.properties.scope;
    delete artifactScope.const; artifactScope.enum = ["FULL_STITCHED_SOURCE_SERIES", "OOS_CALIBRATION_REPLAY_SERIES"];
    edit("Fold").properties.fold_selection = ref("DisplayFoldSelection");
    const foldPlan = edit("Split").allOf[1].properties.fold_plan;
    const plan = foldPlan.properties.chronology;
    Object.assign(plan, { enum: ["SOURCE_OBSERVED_ADVANCED_WFO", "SOURCE_OBSERVED_THREE_WINDOW"] }); delete plan.const;
    foldPlan.properties.folds.minItems = 1;
    foldPlan.oneOf = [
      {properties:{chronology:{const:"SOURCE_OBSERVED_THREE_WINDOW"},folds:{minItems:1,maxItems:1}}},
      {properties:{chronology:{const:"SOURCE_OBSERVED_ADVANCED_WFO"},folds:{minItems:2}}},
    ];
    for (const name of ["Selection", "SelectionRole"]) addEnum(edit(name).properties.objective_kind, "OUTER_FOLD_DECAY_J");
    const scope = edit("SearchStudySurface").properties.scope;
    delete scope.const; scope.enum = ["INNER_VALIDATION_OUTER_STUDY", "OUTER_FOLD_DECAY_STUDY"];
    edit("Search").allOf[1].properties.surfaces_by_study.description = "Exactly three native Stage-A trials per admitted outer study, independently scoped. Causal uses inner validation; per-fold decay uses outer OOS. No run-global pool, objective or theta is invented.";
    edit("Search").allOf[1].properties.search_contract.properties.classification_basis={const:"PORTAL_FULL02_PROTOCOL_DISCLOSURE_CLASSIFICATION_V1",
      description:"Three Window classification derived by Portal from sealed native protocol disclosure, not a verbatim WFO claim or untouched calibration OOS."};
    addEnum(edit("FoldOrderingRow").properties.verdict, "NOT_CAUSAL_OUTER_OOS_SELECTION");
    const selected = edit("FoldOrderingRow").properties.selected_candidate;
    selected.required = selected.required.filter(key => key !== "inner_fold_count");
    edit("FoldOrdering").properties.counts.properties.not_causal_outer_oos_selection = { type: "integer", minimum: 0 };
  } else if (file === "research-report") {
    edit("FrozenCoreV2").properties.protocol_disclosure = ref("ProtocolDisclosure");
    const scope = edit("EquityV2").properties.digest_scope;
    for (const variant of scope.anyOf ?? [scope]) if (variant.const === "FULL_STITCHED_SOURCE_SERIES" || variant.enum?.includes("FULL_STITCHED_SOURCE_SERIES")) {
      delete variant.const; variant.enum = ["FULL_STITCHED_SOURCE_SERIES", "OOS_CALIBRATION_REPLAY_SERIES"];
    }
    for (const value of ["THREE_WINDOW_CALIBRATION_OOS", "THREE_WINDOW_CALIBRATION_IS"]) addEnum(edit("EquityV2").properties.scope, value);
  } else throw new Error(`Unsupported FULL-02 retained contract ${file}`);
  let next = original;
  for (const [name, value] of Object.entries(updates)) {
    if (schemas[name]) next = replaceComponent(next, name, value, next.indexOf('"schemas": {'));
    else next = next.replace('"schemas": {\n', `"schemas": {\n      "${name}": ${JSON.stringify(value)},\n`);
  }
  return amendFull04CurrentSource(amendFull03(next,file),file);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const only = process.argv.find(arg => arg.startsWith("--only="))?.slice(7);
  for (const file of only ? [only] : ["research-current-source", "research-report"]) {
    const path = new URL(`../openapi/${file}.openapi.json`, import.meta.url), old = readFileSync(path,"utf8"), next = amendFull02CurrentSource(old,file);
    if (process.argv.includes("--check")) { if (next !== old) throw new Error(`FULL-02 retained contract drift: ${file}`); }
    else if (next !== old) writeFileSync(path,next);
  }
}
