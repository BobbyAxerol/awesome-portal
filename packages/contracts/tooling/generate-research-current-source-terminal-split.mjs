/** B8 terminal split-only named absence. All other retained operations stay unchanged. */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { replaceComponent } from "./generate-research-progress-truth.mjs";

const ref = name => ({ $ref: `#/components/schemas/${name}` });
const nullable = value => ({ anyOf: [value, { type: "null" }] });
const obj = properties => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });

export const terminalSplitAbsenceSchema = {
  ...obj({
    schema_version: { const: "research.current-source-split-terminal-absence.v1" },
    read_authority: { const: "PORTAL_RETAINED_CURRENT_SOURCE" },
    run_id: ref("RunId"),
    revision: { type: "string", pattern: "^rs02_terminal-split_[0-9a-f]{64}$" },
    etag: { type: "string", pattern: '^"rs02_terminal-split_[0-9a-f]{64}"$' },
    availability: obj({ state: { const: "NOT_PUBLISHED" }, reason_code: { const: "RS02_TERMINAL_SPLIT_NOT_RETAINED" } }),
    lane: obj({
      state: { const: "NOT_RETAINED_TERMINAL" }, operation: { const: "split" },
      effective_status: { enum: ["FAILED", "CANCELLED"] },
      execution_profile_id: nullable({ type: "string", minLength: 1, maxLength: 191 }),
      run_adapter_contract_digest: nullable(ref("Digest")),
      reason_code: { const: "RS02_TERMINAL_SPLIT_NOT_RETAINED" },
    }),
  }),
  description: "Durable run ended without retained execution split. Named terminal absence, not a pending source request or a planned/observed fold projection. Nothing here grants source access or a retry action. P04/imported fixed NOT_APPLICABLE stays unchanged.",
};

export function terminalSplitResponse(document) {
  const response = structuredClone(document.components.responses.Split);
  const variants = response.content["application/json"].schema.oneOf;
  if (!variants.some(value => value.$ref === "#/components/schemas/SplitTerminalAbsence")) variants.push(ref("SplitTerminalAbsence"));
  response.description = "Observed sealed WFO split, fixed-profile not-applicable lane, or terminal-without-retained-split absence";
  return response;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const path = new URL("../openapi/research-current-source.openapi.json", import.meta.url);
  const old = readFileSync(path, "utf8");
  let next = old;
  const parsed = JSON.parse(old);
  if (parsed.components.schemas.SplitTerminalAbsence) next = replaceComponent(next, "SplitTerminalAbsence", terminalSplitAbsenceSchema);
  else {
    const anchor = '"schemas": {\n';
    if (!next.includes(anchor)) throw new Error("Missing current-source schemas anchor");
    next = next.replace(anchor, `${anchor}      "SplitTerminalAbsence": ${JSON.stringify(terminalSplitAbsenceSchema)},\n`);
  }
  next = replaceComponent(next, "Split", terminalSplitResponse(parsed), next.indexOf('"responses": {'));
  if (process.argv.includes("--check")) {
    if (next !== old) throw new Error("Research terminal split OpenAPI drift");
  } else if (next !== old) writeFileSync(path, next);
}
