/** §58: use the closed backend Zod source; never maintain FE-owned types. */
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire, Module } from "node:module";
import { fileURLToPath } from "node:url";
import { jsonSchema } from "./generate-research-window-execution.mjs";
import { replaceComponent } from "./generate-research-progress-truth.mjs";
const source = new URL("../../../apps/control-api/src/research/replay-continuity.contract.ts", import.meta.url);
const require = createRequire(source), ts = require("typescript"), loaded = new Module(fileURLToPath(source));
loaded.require = require;
loaded._compile(ts.transpileModule(readFileSync(source, "utf8"), { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
} }).outputText, fileURLToPath(source));
const schema = loaded.exports, ref = name => ({ $ref: `#/components/schemas/${name}` });

export function amendReplayContinuity(original) {
  const doc = JSON.parse(original), all = doc.components.schemas;
  const updates = {
    ReplaySplitShape: jsonSchema(schema.ReplaySplitShapeSchema),
    ReplayBoundaryFact: jsonSchema(schema.ReplayBoundaryFactSchema),
    ReplayWindowCursor: jsonSchema(schema.ReplayWindowCursorSchema),
    ReplayPage: structuredClone(all.Page), Replay: structuredClone(all.Replay),
    ReplayExecution: structuredClone(all.ReplayExecution),
  };
  // JSON Schema expresses the structural semantic branches too; equality of
  // arbitrary digests/ordinal arithmetic is enforced by the backend refinements.
  updates.ReplaySplitShape.allOf = [
    { if: { properties: { state: { const: "NOT_PUBLISHED" } } }, then: { properties: {
      reason_code: { type: "string", minLength: 1 }, window_kind: { type: "null" }, oos_applicable: { type: "null" },
      independent_holdout: { type: "null" }, windows: { maxItems: 0 },
    } }, else: { properties: { reason_code: { type: "null" }, window_kind: { type: "string" },
      oos_applicable: { type: "boolean" }, independent_holdout: { type: "boolean" }, windows: { minItems: 1 } } } },
    { if: { properties: { window_kind: { const: "SINGLE_FULL_WINDOW" } } }, then: { properties: {
      oos_applicable: { const: false }, independent_holdout: { const: false },
      windows: { minItems: 1, maxItems: 1, items: { properties: { window: { const: "FULL_SAMPLE" } } } },
    } } },
    { if: { properties: { window_kind: { const: "FOLD_WINDOWS" } } }, then: { properties: {
      oos_applicable: { const: true }, windows: { items: { properties: { window: { const: "OOS" } } } },
    } } },
  ];
  const nullableReason = (field, reason) => ({
    if: { properties: { [field]: { type: "null" } } },
    then: { properties: { [reason]: { type: "string", minLength: 1 } } },
    else: { properties: { [reason]: { type: "null" } } },
  });
  for (const key of ["selection", "previous_selection"]) updates.ReplayBoundaryFact.properties[key].allOf = [
    nullableReason("selected_trial_id", "selected_trial_reason_code"), nullableReason("study_id", "study_reason_code"),
  ];
  updates.ReplayBoundaryFact.allOf = [nullableReason("params_digest_changed", "params_digest_reason_code"), {
    if: { anyOf: ["selection", "previous_selection"].map(key => ({ properties: {
      [key]: { properties: { params_digest: { type: "null" } } },
    } })) }, then: { properties: { params_digest_changed: { type: "null" } } },
    else: { properties: { params_digest_changed: { type: "boolean" } } },
  }, {
    if: { anyOf: ["equity_start_policy", "position_start_policy"].map(key => ({ properties: { [key]: { const: "NOT_ASSERTED" } } })) },
    then: { properties: { carry_policy_reason_code: { type: "string", minLength: 1 } } },
    else: { properties: { carry_policy_reason_code: { type: "null" } } },
  }];
  updates.ReplayWindowCursor.allOf = [{
    if: { properties: { state: { const: "AVAILABLE" } } }, then: { properties: {
      reason_code: { type: "null" }, crossed_fold_boundary: { type: "boolean" },
    } }, else: { properties: { reason_code: { type: "string", minLength: 1 }, crossed_fold_boundary: { type: "null" },
      ...Object.fromEntries(["first_fold_id", "last_fold_id", "next_fold_id", "previous_fold_id"].map(key => [key, { type: "null" }])),
    } },
  }];
  updates.ReplayWindowCursor.description = "Continue the run-global dense sealed observation relation using cursor=next_window_cursor or before=previous_window_cursor. Pages may span folds. next/previous_fold_id are the owners of the immediately adjacent bar, possibly the same fold; null also covers preparatory/unassigned bars. crossed_fold_boundary covers boundaries inside this page and the incoming cursor edge. Neither ordinal nor this presentation order asserts wall-clock density or cross-stream causal order.";
  updates.ReplayBoundaryFact.description = "Read-side comparison of immutable selected-parameter digests, not proof of the replay child's runtime binding. Previous end values are retained observation facts, not invented reset starting capital. Carry/reset/close semantics come only from the source fold account policy; missing identities or policies remain typed. start_basis names an observed baseline and alone does not imply carry.";
  const page = updates.ReplayPage;
  page.properties.limit.maximum = schema.REPLAY_MAX_BARS;
  page.properties.max_bars = { const: schema.REPLAY_MAX_BARS,
    description: "Admitted request ceiling, not a promise that this many wire rows fit. Request a full retained fold using its signed start_cursor and limit=fold.bars when within this ceiling." };
  page.properties.byte_limited = { type: "boolean",
    description: "True when the one-MiB logical JSON envelope shortened the requested window. Continue using the returned edges with the same requested limit; never infer end from rows.length." };
  page.description = "Replay-only requested row ceiling, separate from the one-MiB logical JSON envelope. A full fold is one request only if both bounds fit; otherwise all bars remain accessible in contiguous signed cursor chunks. Cursors bind the requested limit, not SQL prefetch or the returned count. Other readers retain their own 200-row caps.";
  const replay = updates.Replay.allOf.find(s => s.properties?.replay).properties.replay;
  replay.properties.rows.maxItems = schema.REPLAY_MAX_BARS;
  replay.properties.page = ref("ReplayPage");
  replay.properties.window_cursor = ref("ReplayWindowCursor");
  updates.ReplayExecution.properties.split_shape = ref("ReplaySplitShape");
  updates.ReplayExecution.properties.fold_capital.properties.boundaries = {
    type: "array", maxItems: 255, items: ref("ReplayBoundaryFact"),
  };
  let next = original;
  for (const [name, value] of Object.entries(updates)) {
    if (all[name]) next = replaceComponent(next, name, value, next.indexOf('"schemas": {'));
    else next = next.replace('"schemas": {\n', `"schemas": {\n      "${name}": ${JSON.stringify(value)},\n`);
  }
  const limit = { name: "limit", in: "query", required: false,
    schema: { type: "integer", minimum: 1, maximum: schema.REPLAY_MAX_BARS, default: 100 } };
  if (doc.components.parameters.ReplayLimit) next = replaceComponent(next, "ReplayLimit", limit, next.indexOf('"components": {'));
  else {
    const start = next.indexOf('"parameters": {', next.indexOf('"components": {'));
    const end = start + '"parameters": {'.length;
    if (start < 0) throw Error("Replay parameter components missing");
    next = next.slice(0, end) + `\n      "ReplayLimit": ${JSON.stringify(limit)},` + next.slice(end);
  }
  const start = next.indexOf('"/api/v1/quantbt/runs/{runId}/current-source/replay"');
  const paramStart = next.indexOf('"parameters":', start), paramEnd = next.indexOf("\n", paramStart);
  if (start < 0 || paramStart < 0 || paramEnd < 0) throw Error("Named Replay operation missing");
  const params = doc.paths["/api/v1/quantbt/runs/{runId}/current-source/replay"].get.parameters
    .map(p => p.$ref === "#/components/parameters/Limit" ? { $ref: "#/components/parameters/ReplayLimit" } : p);
  return next.slice(0, paramStart) + `"parameters": ${JSON.stringify(params)},` + next.slice(paramEnd);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const path = new URL("../openapi/research-current-source.openapi.json", import.meta.url), original = readFileSync(path, "utf8");
  const next = amendReplayContinuity(original);
  if (process.argv.includes("--check")) { if (next !== original) throw Error("Replay continuity OpenAPI drift"); }
  else if (next !== original) writeFileSync(path, next);
}
