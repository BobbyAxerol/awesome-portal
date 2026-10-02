/** B8 additive public projection metadata. Does not alter private source journals. */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const nullable = value => ({ anyOf: [value, { type: "null" }] });
const obj = properties => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });

export function progressTruthComponents(document) {
  const schemas = document.components.schemas;
  const snapshot = structuredClone(schemas.ProgressSnapshot);
  Object.assign(snapshot.properties.overall.properties, {
    pct_basis: { const: "SOURCE_STAGE_WEIGHTED_V1", description: "Source stage-weighted percentage, not trial completion percentage. A terminal failure does not force 100%. Optional for older public captures." },
    elapsed_basis: { const: "SOURCE_JOURNAL_CREATED_TO_LAST_EVENT_V1", description: "elapsed_s is source journal age observed at its last event, with the source's monotonic floor. Not CPU/runtime accounting, control queue age, search throughput duration or a browser timer." },
  });
  const selection = structuredClone(schemas.ProgressFoldSelection);
  Object.assign(selection.properties, {
    display_trial_ordinal: nullable({ type: "integer", minimum: 1 }),
    trial_numbering: { const: "P11_ORDINAL_1_BASED", description: "trial and display_trial_ordinal are the same 1-based P11 display ordinal, not source trial identity. WFO source_trial_id preserves Optuna's zero-based ID; fixed profiles do not invent one." },
  });
  selection.properties.source_trial_id.description = "Original zero-based Optuna source ID for an admitted P10 Delta WFO v1/v2 GLOBAL selection; trial/display_trial_ordinal remain 1-based. Optional on fixed/older captures.";
  const read = structuredClone(schemas.ProgressRead);
  read.properties.current.properties.fold_reporting = {
    ...obj({
      basis: { const: "P08_ADMISSION_AND_P11_JOURNAL_V1" },
      declared_count: nullable({ type: "integer", minimum: 1, maximum: 256 }),
      planned_count: nullable({ type: "integer", minimum: 1, maximum: 256 }),
      reported_count: nullable({ type: "integer", minimum: 0, maximum: 256 }),
      done_count: nullable({ type: "integer", minimum: 0, maximum: 256 }),
      failed_count: nullable({ type: "integer", minimum: 0, maximum: 256 }),
      reason_code: nullable({ enum: ["SOURCE_PROGRESS_NOT_PUBLISHED", "SOURCE_DID_NOT_REPORT_FOLDS"] }),
    }),
    description: "Admission declaration/plan counts are separate from journal-reported execution. Null reported counts mean no source snapshot; zero means a snapshot reported no fold. No planned fold becomes DONE/FAILED/PENDING execution. Optional during additive rollout.",
  };
  return { ProgressSnapshot: snapshot, ProgressFoldSelection: selection, ProgressRead: read };
}

/** Replace just one six-space OpenAPI member, retaining unrelated formatting. */
export function replaceComponent(text, name, value, after = 0) {
  const pattern = new RegExp(`^      "${name}":\\s*`, "gm");
  pattern.lastIndex = after;
  const match = pattern.exec(text);
  if (!match) throw new Error(`Missing OpenAPI member ${name}`);
  const start = pattern.lastIndex;
  let depth = 0, quoted = false, escaped = false, end = start;
  for (; end < text.length; end += 1) {
    const character = text[end];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
    } else if (character === '"') quoted = true;
    else if (character === "{" || character === "[") depth += 1;
    else if (character === "}" || character === "]") { depth -= 1; if (depth === 0) { end += 1; break; } }
  }
  if (depth !== 0 || end >= text.length) throw new Error(`Unterminated OpenAPI member ${name}`);
  return text.slice(0, start) + JSON.stringify(value) + text.slice(end);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const path = new URL("../openapi/research-progress.openapi.json", import.meta.url);
  const old = readFileSync(path, "utf8");
  let next = old;
  for (const [name, value] of Object.entries(progressTruthComponents(JSON.parse(old)))) next = replaceComponent(next, name, value);
  if (process.argv.includes("--check")) {
    if (next !== old) throw new Error("Research progress truth OpenAPI drift");
  } else if (next !== old) writeFileSync(path, next);
}
