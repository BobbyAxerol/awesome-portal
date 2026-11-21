/** FE-073/074: publish already-served fields; no runtime/authority activation.
 * Canonical EDS-02 panel definitions are embedded with their exact dependency
 * closure, so Paper remains independently compilable. --check is read-only.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const load = name => JSON.parse(readFileSync(resolve(root, name), "utf8"));
const ref = name => ({ $ref: `#/$defs/${name}` });
const object = properties => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });
const count = { type: "integer", minimum: 0 };
const rewrite = value => JSON.parse(JSON.stringify(value).replaceAll("#/$defs/", "#/components/schemas/"));

// Replace only one named object's bytes, keeping unrelated hand-authored DTOs
// and formatting intact. Fail rather than replacing a non-unique member.
function member(before, key, value, container, indent) {
  const literal = JSON.stringify(key) + ":", at = before.indexOf(literal);
  const serialized = JSON.stringify(value, null, 2).replaceAll("\n", "\n" + " ".repeat(indent));
  if (at < 0) {
    const anchor = JSON.stringify(container) + ": {\n", start = before.indexOf(anchor);
    if (start < 0 || before.indexOf(anchor, start + anchor.length) >= 0) throw new Error(`Missing unique container ${container}`);
    const point = start + anchor.length;
    return before.slice(0, point) + " ".repeat(indent) + literal + " " + serialized + ",\n" + before.slice(point);
  }
  if (before.indexOf(literal, at + literal.length) >= 0) throw new Error(`Duplicate member ${key}`);
  const start = before.indexOf("{", at + literal.length);
  let depth = 0, quoted = false, escaped = false;
  for (let index = start; index < before.length; index++) {
    const char = before[index];
    if (quoted) { if (escaped) escaped = false; else if (char === "\\") escaped = true; else if (char === '"') quoted = false; continue; }
    if (char === '"') quoted = true;
    else if (char === "{") depth++;
    else if (char === "}" && --depth === 0) return before.slice(0, start) + serialized + before.slice(index + 1);
  }
  throw new Error(`Missing JSON boundary ${key}`);
}
function save(name, before, after) {
  if (process.argv.includes("--check")) {
    if (before !== after) throw new Error(`Generated drift: ${name}`);
  } else if (before !== after) writeFileSync(resolve(root, name), after);
}

const authority = load("schemas/execution-contract-authority.v1.schema.json").$defs;
const defs = {};
// The legacy OpenAPI NarrowRecord was looser than the standalone schema.
// History must use the same typed/redacted row contract in both publications.
const paperRows = load("schemas/execution-paper-read.v1.schema.json").$defs;
defs.Scalar = paperRows.Scalar;
defs.NarrowRecord = paperRows.NarrowRecord;
function copyAuthority(name) {
  const target = name === "Identifier" ? "PanelIdentifier" : name;
  if (defs[target]) return;
  const value = authority[name];
  if (!value) throw new Error(`Missing canonical panel dependency ${name}`);
  defs[target] = JSON.parse(JSON.stringify(value).replaceAll("#/$defs/Identifier", "#/$defs/PanelIdentifier"));
  for (const match of JSON.stringify(value).matchAll(/#\/\$defs\/([A-Za-z0-9_]+)/g)) copyAuthority(match[1]);
}
copyAuthority("PanelEnvelope");
defs.PaperHistoryDownsample = object({
  method: { const: "PER_SERIES_BUCKET_EXTREMA" },
  bucket_seconds: { type: "integer", minimum: 1 },
  series_count: { type: "integer", minimum: 1 },
  input_rows: count, output_rows: count,
});
defs.PaperHistoryWindow = object({
  days: { type: "integer", minimum: 1 },
  basis: { const: "PORTAL_SGP_HISTORY_MIRROR" },
  returned_rows: count, source_rows: count, truncated: { const: false },
});
defs.PaperHistoryWindow.properties.downsample = ref("PaperHistoryDownsample");
defs.PaperHistoryWindows = { ...object({ account_equity: ref("PaperHistoryWindow") }), required: [] };
defs.PaperHistoryRecords = {
  type: "array", items: ref("NarrowRecord"),
  description: "Retained account-equity history, not a bounded snapshot page. The existing producer returns exact sparse rows or per-series bucket extrema (target2000 is not a hard output ceiling). Inspect history_windows for coverage/downsampling; do not assert a fabricated row ceiling or truncate history to the snapshot page size. This DTO does not qualify projection cardinality/response-byte budgets.",
};
const schemaName = "schemas/execution-paper-read.v1.schema.json";
const apiName = "openapi/execution-paper-read.openapi.json";
let schemaText = readFileSync(resolve(root, schemaName), "utf8");
let apiText = readFileSync(resolve(root, apiName), "utf8");
const schemaBefore = schemaText, apiBefore = apiText;
for (const [name, value] of Object.entries(defs)) {
  schemaText = member(schemaText, name, value, "$defs", 4);
  apiText = member(apiText, name, rewrite(value), "schemas", 6);
}
// Preserve hand-authored route bytes while publishing the actual bounded
// workbench refusal. Exact history uses its existing truthful keyset pager.
for (const description of ["Current deployment-scoped Paper workbench", "Current deployment-scoped VNM Paper workbench"]) {
  const marker = `"description": "${description}"`;
  const start = apiText.indexOf(marker);
  if (start < 0) throw new Error("Missing named Paper workbench response");
  const end = apiText.indexOf('\n', start);
  const line = apiText.slice(start, end);
  if (!line.includes('"413"')) {
    const updated = line.replace('"404": { "$ref": "#/components/responses/Problem" }',
      '"404": { "$ref": "#/components/responses/Problem" }, "413": { "description": "N33_HISTORY_ROW_TOO_LARGE or N33_HISTORY_RESPONSE_TOO_LARGE. No silent truncation; use /api/v1/execution/history/paper/{relationKey} with its advertised byte bound and continuation.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/Problem" } } } }');
    if (updated === line) throw new Error("Missing exact Paper response boundary");
    apiText = apiText.slice(0, start) + updated + apiText.slice(end);
  }
}
save(schemaName, schemaBefore, schemaText);
save(apiName, apiBefore, apiText);

const governanceName = "openapi/execution-governance.openapi.json";
const governanceBefore = readFileSync(resolve(root, governanceName), "utf8");
const problem = load(governanceName).components.schemas.Problem;
problem.properties.details = { type: "object", maxProperties: 32, additionalProperties: true,
  description: "Public structured refusal context. Do not parse arbitrary details as authority or an identifier; use a named error variant." };
problem.properties.public_copy_key = { type: "string", minLength: 1, maxLength: 128, pattern: "^[A-Z][A-Z0-9_]*$" };
problem.properties.safe_next_action = { enum: ["QUERY_SAME_INTENT", "REVIEW_BLOCKER"] };
const duplicate = structuredClone(problem);
delete duplicate.allOf;
duplicate.required.push("details");
duplicate.properties.error.properties.code = { const: "DUPLICATE_OPEN_APPROVAL" };
duplicate.properties.details = object({ approval_id: {
  ...load("schemas/execution-governance-product.v1.schema.json").$defs.Identifier,
} });
duplicate.description = "An existing open approval in the authenticated workspace. The ID is navigation metadata, never a permission grant.";
problem.allOf = [{
  if: { properties: { error: { type: "object", required: ["code"], properties: { code: { const: "DUPLICATE_OPEN_APPROVAL" } } } }, required: ["error"] },
  then: { required: ["details"], properties: { details: duplicate.properties.details } },
}];
const split = governanceBefore.indexOf('"schemas": {');
if (split < 0) throw new Error("Missing Governance schema container");
let schemas = member(governanceBefore.slice(split), "Problem", problem, "schemas", 6);
schemas = member(schemas, "DuplicateOpenApprovalProblem", duplicate, "schemas", 6);
const governance = governanceBefore.slice(0, split) + schemas;
save(governanceName, governanceBefore, governance);
