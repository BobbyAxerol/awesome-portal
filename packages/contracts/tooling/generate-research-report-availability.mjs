/** §54: add an explicit absent Report variant without changing immutable ReportDetail. */
import { readFileSync, writeFileSync } from "node:fs";
import { replaceComponent } from "./generate-research-progress-truth.mjs";
const path = new URL("../openapi/research-report.openapi.json", import.meta.url);
const original = readFileSync(path, "utf8");
const ref = name => ({ $ref: `#/components/schemas/${name}` });
const object = properties => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });
const components = {
  ReportUnavailable: object({
    schema_version: { const: "research.report-unavailable.v1" },
    read_authority: { const: "PORTAL_PERSISTED_RESEARCH" },
    run_id: ref("RunId"),
    display_label: { anyOf: [{ type: "string", pattern: "^R-[A-Z0-9]{1,8}-[0-9]{3,6}$" }, { type: "null" }] },
    run_state: { enum: ["DRAFT", "QUEUED", "RUNNING", "SEALING", "READY", "FAILED", "CANCELLED", "RECOVERY_REQUIRED"] },
    availability: object({ state: { const: "NOT_PUBLISHED" }, reason_code: { const: "NATIVE_REPORT_NOT_DELIVERED" } }),
    execution_profile: object({ id: { type: "string", minLength: 1, maxLength: 192 }, digest: { type: "string", pattern: "^[0-9a-f]{64}$" } }),
    as_of_utc_ms: ref("UtcMilliseconds"),
    etag: { type: "string", pattern: '^"p18a1_[0-9a-f]{64}"$' },
    may_export: { const: false },
  }),
  ReportRead: {
    oneOf: [ref("ReportDetail"), ref("ReportUnavailable")],
    discriminator: { propertyName: "schema_version", mapping: {
      "research.report-detail.v1": "#/components/schemas/ReportDetail",
      "research.report-unavailable.v1": "#/components/schemas/ReportUnavailable",
    } },
    description: "Narrow schema_version before reading frozen_core. A missing native Report is a typed 200, not an invented seal. Existing immutable Reports take precedence. Unknown/foreign runs remain 404; permissions and feature refusal remain unchanged.",
  },
};
let next = original;
const header = structuredClone(JSON.parse(original).components.headers.ReportEtag);
header.schema.pattern = '^"p18(?:r|a)1_[0-9a-f]{64}"$';
header.description = "Quoted private validator of the authorized Report or typed absence representation. A native absence has p18a1, not a forged sealed-core p18r1 identity. Authorization precedes revalidation.";
next = replaceComponent(next, "ReportEtag", header);
for (const [name, value] of Object.entries(components)) {
  if (JSON.parse(next).components.schemas[name]) next = replaceComponent(next, name, value);
  else next = next.replace('    "schemas": {\n', `    "schemas": {\n      "${name}": ${JSON.stringify(value)},\n`);
}
// This is the GET success reference only; ReportDetail itself is never rewritten.
next = next.replace('"$ref": "#/components/schemas/ReportDetail"', '"$ref": "#/components/schemas/ReportRead"');
next = next.replace('"version": "1.3.0"', '"version": "1.4.0"');
next = next.replace('"description": "Never 409: a run whose report is not sealed yet (or never will be) answers 404 RESEARCH_REPORT_NOT_FOUND. Only export creation/download can answer 409."',
  '"description": "Known native execution runs without a sealed Report return 200 ReportUnavailable (NOT_PUBLISHED / NATIVE_REPORT_NOT_DELIVERED), authorized by the exact immutable execution-profile id and digest. Existing sealed Reports return ReportDetail unchanged. Unknown or foreign runs answer 404 RESEARCH_REPORT_NOT_FOUND. No engine call, seal, repair claim or export is made for native absence. Narrow schema_version before accessing frozen_core. Only export creation/download can answer 409."');
next = next.replace('"description": "Sealed Report with a private ETag."', '"description": "Sealed Report or typed native absence, with a private representation ETag."');
next = next.replace('"description": "Exact immutable report revision remains current."', '"description": "Exact authorized Report/absence representation remains current; authorization precedes revalidation."');
if (process.argv.includes("--check")) {
  if (next !== original) throw new Error("Research Report availability OpenAPI drift");
} else if (next !== original) writeFileSync(path, next);
