/** Additive bounded causal/inner profile transport; historical fixtures stay intact. */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { replaceComponent } from "./generate-research-progress-truth.mjs";

const ref = name => ({ $ref: `#/components/schemas/${name}` });
const obj = properties => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });
const nullable = value => ({ anyOf: [value, { type: "null" }] });
const token = { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$" };
const decimal = { type: "string", pattern: "^-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?$", maxLength: 96 };
const ms = { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER };
const innerBounds = { type: "integer", minimum: 2, maximum: 16 };
const frequency = { enum: ["weekly", "monthly", "quarterly"] };
const windowMode = { enum: ["expanding", "rolling"] };
const params = { type: "object", maxProperties: 24, propertyNames: { pattern: "^[A-Za-z][A-Za-z0-9_]{0,63}$" }, additionalProperties: decimal };
export const causalSelectionSchema = {
  ...obj({ schema_version: { const: "research.current-source-causal-selection.v1" }, scope: { const: "OUTER_FOLD_SELECTION" },
    study_id: token, fold_seed: ms, selected_trial_id: token, parameters: params, objective: nullable(decimal),
    objective_kind: { const: "INNER_VALIDATION_DECAY_J" }, candidate_is_metric: nullable(decimal),
    candidate_oos_metric: nullable(decimal), candidate_decay: nullable(decimal),
    candidate_metrics_scope: { const: "OUTER_FOLD_POST_SELECTION" },
    candidate_is_scope: { const: "INNER_VALIDATION_IS_MEAN" }, candidate_oos_scope: { const: "OUTER_FOLD_OOS" },
    candidate_decay_scope: { const: "INNER_IS_MEAN_MINUS_OUTER_OOS" }, candidate_count: { type: "integer", minimum: 1, maximum: 64 },
    study_trial_rows: { const: 3 }, outer_oos_used_for_selection: { const: false }, causality_claim: { const: "strict_nested_fold_local_retraining" },
    inner_fold_count: innerBounds,
    inner_validation: obj({ inner_split_frequency: frequency, inner_window_mode: windowMode,
      inner_train_window: { type: "string", pattern: "^[1-9][0-9]{0,4}(D|h)$", maxLength: 8 }, inner_min_folds: innerBounds }),
    inner_folds: { type: "array", minItems: 2, maxItems: 16, items: obj({ inner_fold_id: token,
      train_start_utc_ms: ms, train_end_utc_ms: ms, test_start_utc_ms: ms, test_end_utc_ms: ms,
      outer_oos_used_for_selection: { const: false } }) },
  }),
  description: "Source-owned selection for this outer fold only. Objective uses nested inner validation, not outer OOS. Candidate metrics have a separate post-selection outer scope. Retained IDs are study-qualified; local source trial IDs remain in trial facts. Runtime validates exact inner count, unique IDs and train-before-test ranges inside outer IS; no engine wall clock is inferred.",
};

function amend(original, file) {
  const d = JSON.parse(original), s = d.components.schemas, updates = {};
  const edit = name => updates[name] ??= structuredClone(s[name]);
  const addEnum = (schema, value) => { if (!schema.enum.includes(value)) schema.enum.push(value); };
  if (file === "research-foundation") {
    const p = edit("PortalAdmission").properties.profiles.items.properties;
    p.inner_validation = { enum: ["NOT_ADMITTED_GLOBAL_RETENTION_ONLY", "REQUIRED_ENGINE_NESTED_OUTER_IS_ONLY"] };
    p.trial_scope = { const: "PER_OUTER_FOLD_STUDY" };
    p.max_total_trials = { type: "integer", minimum: 1, maximum: 48 };
    p.inner_constraints = obj({ fold_bounds: obj({ min: innerBounds, max: innerBounds }),
      frequencies: { type: "array", minItems: 1, maxItems: 3, items: frequency },
      window_modes: { type: "array", minItems: 1, maxItems: 2, items: windowMode }, train_window_pattern: { type: "string", maxLength: 64 } });
  } else if (file === "research-progress") {
    const trial=edit("ProgressTrialPayload");
    trial.properties.study={enum:["GLOBAL","PER_FOLD_STUDY"]};
    trial.properties.study_id=token;
    trial.properties.source_trial_id={type:"string",pattern:"^(?:0|[1-9][0-9]*)$"};
    trial.description="Exactly one of fold or study scope. PER_FOLD_STUDY events preserve both native study ID and local trial ID; the display ordinal is cumulative and is never a native trial number.";
    trial.allOf=[{if:{properties:{study:{const:"PER_FOLD_STUDY"}},required:["study"]},then:{required:["study_id","source_trial_id"]}}];
    for (const name of ["ProgressFoldSelectionFact", "ProgressFoldSelection"]) {
      const value = edit(name), scope = value.properties.scope.enum ? value.properties.scope : value.properties.scope.anyOf[0];
      addEnum(scope, "PER_FOLD_STUDY");
      value.properties.study_id = token;
      value.properties.source_trial_id = { type: "string", pattern: "^(?:0|[1-9][0-9]*)$",
        description: "Exact original local Optuna trial ID; causal studies require study_id to distinguish repeated trial numbers. Never derived from a run-global ordinal." };
      if (name === "ProgressFoldSelection") value.properties.objective_kind = { enum: ["MODE_1_DECAY_J", "INNER_VALIDATION_DECAY_J"] };
      value.allOf = [{ if: { properties: { scope: { const: "PER_FOLD_STUDY" } }, required: ["scope"] },
        then: { required: ["study_id", "source_trial_id"] } }];
    }
  } else if (file === "research-current-source") {
    updates.CausalSelection = causalSelectionSchema;
    const provenance = edit("Provenance");
    addEnum(provenance.properties.source_adapter_id, "rs02.quantbt-signal-notional-causal-inner.v1");
    addEnum(provenance.properties.profile_id, "rs02.delta-signal-notional-causal-inner.v1");
    if (!provenance.oneOf.some(v => v.properties?.profile_id?.const === "rs02.delta-signal-notional-causal-inner.v1"))
      provenance.oneOf.push({ properties: { source_adapter_id: { const: "rs02.quantbt-signal-notional-causal-inner.v1" },
        profile_id: { const: "rs02.delta-signal-notional-causal-inner.v1" } } });
    provenance.description = "Exact historical/global/causal custody pair; mixing is refused.";
    edit("Fold").properties.causal_selection = ref("CausalSelection");
    edit("FoldVerdictRow").properties.selected_parameters = params;
    edit("FoldVerdictRow").properties.score_basis = { const: "INNER_VALIDATION_IS_MEAN_AND_OUTER_FOLD_OOS" };
    edit("FoldVerdicts").properties.rule.properties.score_basis = {
      enum: ["QUANTBT_SELECTED_TRIAL_FOLD_METRICS_V1", "INNER_VALIDATION_IS_MEAN_AND_OUTER_FOLD_OOS"],
    };
    for (const name of ["Selection", "FrozenSelection"]) {
      const value = edit(name);
      value.properties.scope = { const: "LAST_FOLD_DEPLOYMENT", description: "Final outer-fold deployment selection only, not a run-global parameter bundle." };
      value.properties.fold_id = token;
      if (name === "Selection") addEnum(value.properties.objective_kind, "INNER_VALIDATION_DECAY_J");
    }
    addEnum(edit("SelectionRole").properties.objective_kind, "INNER_VALIDATION_DECAY_J");
    edit("SelectionRole").properties.scope = { const: "LAST_FOLD_DEPLOYMENT" };
    edit("SelectionRole").properties.fold_id = token;
    edit("Split").allOf[1].properties.guards.properties.inner_min_folds = ref("GuardFact");
    const segment = edit("FoldSegment");
    Object.assign(segment.properties, { parameters: params, selection_scope: { const: "OUTER_FOLD_SELECTION" }, selected_trial_id: token, study_id: token });
    addEnum(edit("TrialFacts").properties.fold_scope.properties.kind, "PER_FOLD_STUDY");
    edit("TrialFacts").properties.evaluation_scope={const:"INNER_VALIDATION"};
    edit("TrialFacts").properties.study_id=nullable(token);
    addEnum(edit("SearchPool").properties.reevaluation_scope, "PER_FOLD_STUDY");
    addEnum(edit("SearchSurface").properties.state, "NOT_APPLICABLE");
    updates.SearchStudySurface = obj({ scope: { const: "INNER_VALIDATION_OUTER_STUDY" },
      fold_id: token, study_id: token, surface: { allOf: [ref("SearchSurface"), { type: "object", properties: {
        source_trial_count: { const: 3 }, complete_trial_count: { type: "integer", minimum: 0, maximum: 3 },
        emitted_point_count: { type: "integer", minimum: 0, maximum: 3 }, points: { type: "array", maxItems: 3 },
      } }] } });
    edit("Search").allOf[1].properties.surfaces_by_study = {
      type: "array", minItems: 2, maxItems: 16, items: ref("SearchStudySurface"),
      description: "Only for the exact causal profile: independently ranked inner-validation study surfaces. Never a run-global ranking or theta. Total source trials remain bounded to 48.",
    };
    Object.assign(edit("DeclaredSpace").properties, {
      selection_scope: { const: "LAST_FOLD_DEPLOYMENT" }, fold_id: token, study_id: token,
    });
    const ordering = edit("FoldOrdering");
    ordering.properties.counts.properties.causal_data_time_selection = { type: "integer", minimum: 0 };
    const row = edit("FoldOrderingRow");
    addEnum(row.properties.verdict, "CAUSAL_DATA_TIME_SELECTION");
    row.properties.verdict.description = "Only the admitted causal/inner profile can earn a data-time causal verdict, from retained own-fold selection and inner ranges. Global selection never earns it; engine wall clocks remain separately absent.";
    row.properties.reason_code = nullable({ type: "string", pattern: "^[A-Z][A-Z0-9_]{2,159}$" });
    row.properties.selected_candidate = obj({ candidate_id: nullable({ type: "string", pattern: "^[0-9a-f]{24}$" }),
      params_digest: { type: "string", pattern: "^[0-9a-f]{64}$" }, study_id: token, selected_trial_id: token, inner_fold_count: innerBounds });
    edit("Stage4Binding").properties.selection_scope = { enum: ["GLOBAL", "PER_FOLD"] };
  } else if (file === "research-freeze") {
    // P16 and the retained lane share these authoritative shapes. A new
    // selection scope must never exist in only one named Freeze read.
    const retained = JSON.parse(readFileSync(new URL("../openapi/research-current-source.openapi.json", import.meta.url), "utf8"));
    for (const name of ["Stage4BindingRow", "Stage4Binding", "ParameterAuthority"])
      updates[name] = structuredClone(retained.components.schemas[name]);
  } else if (file === "research-report") {
    edit("FoldRowV2").properties.score_basis = { const: "INNER_VALIDATION_IS_MEAN_AND_OUTER_FOLD_OOS" };
    addEnum(edit("FoldsV2").properties.params_handoff.properties.scope, "PER_FOLD_SELECTION_APPLIES_TO_OWN_OOS");
    const target = edit("FinalAudit").properties.audit_target_kind;
    addEnum(target.enum ? target : target.anyOf[0], "PER_FOLD_PARAMETER_SELECTIONS");
  } else if (file === "research-attempt-lineage") {
    const value = edit("RunMetricFact");
    const visit = v => {
      if (!v || typeof v !== "object") return;
      if (Array.isArray(v.enum) && v.enum.includes("RS02_RETAINED_SELECTED_TRIAL")) addEnum(v, "RS02_RETAINED_OUTER_FOLD_SELECTIONS");
      if (Array.isArray(v.enum) && v.enum.includes("SELECTED_TRIAL_MEAN_ACROSS_FOLDS")) addEnum(v, "OUTER_FOLD_SELECTED_OOS_MEAN");
      for (const child of Object.values(v)) visit(child);
    };
    visit(value);
  }
  let next = original;
  for (const [name, value] of Object.entries(updates)) {
    if (s[name]) next = replaceComponent(next, name, value, next.indexOf('"schemas": {'));
    else next = next.replace('"schemas": {\n', `"schemas": {\n      "${name}": ${JSON.stringify(value)},\n`);
  }
  return next;
}
export function amendCausalInnerOpenApi(original, file) { return amend(original, file); }

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const file of ["research-foundation", "research-progress", "research-current-source", "research-freeze", "research-report", "research-attempt-lineage"]) {
    const path = new URL(`../openapi/${file}.openapi.json`, import.meta.url), old = readFileSync(path,"utf8"), next = amend(old,file);
    if (process.argv.includes("--check")) { if (next !== old) throw new Error(`Causal inner transport drift: ${file}`); }
    else if (next !== old) writeFileSync(path,next);
  }
}
