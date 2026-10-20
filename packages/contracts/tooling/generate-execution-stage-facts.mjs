/** Typed stage facts for the Paper workbench and the Sandbox / Canary / Live Full screens (BE-P2).
 *
 * One builder is the single source of every shape here:
 *  - schemas/execution-stage-facts.v1.schema.json  (the family; Sandbox/Canary/Live $ref it)
 *  - the same definitions inlined into the Paper standalone schema and the Paper OpenAPI
 *    (those two documents are compiled alone in tests, so an external $ref would not resolve)
 *  - fixtures/execution-stage-facts.*.json
 *
 * Every value is a Fact: AVAILABLE with a value, or NOT_PUBLISHED with a reason code. There is no
 * third shape, so "the source does not hold it" can never be read as zero, empty or healthy.
 * Schema/fixture publication only: it commissions no source, runtime or authority.
 *
 *   node tooling/generate-execution-stage-facts.mjs           write
 *   node tooling/generate-execution-stage-facts.mjs --check   fail on drift
 */
import {readFileSync, writeFileSync} from "node:fs";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA_ID = "https://schemas.primusspark.com/portal/execution-stage-facts.v1.schema.json";
export const STAGE_FACTS_VERSION = "execution.stage-facts.v1";

const ref = name => ({$ref: "#/$defs/" + name});
const object = (properties, extra = {}) => ({type: "object", additionalProperties: false, required: Object.keys(properties), properties, ...extra});
const nullable = schema => ({oneOf: [schema, {type: "null"}]});
/** AVAILABLE + value, or NOT_PUBLISHED + reason. Nothing in between. */
const fact = value => ({oneOf: [
  object({availability: {const: "AVAILABLE"}, value, reason_code: {type: "null"}}),
  object({availability: {const: "NOT_PUBLISHED"}, value: {type: "null"}, reason_code: ref("StageReasonCode")}),
]});

export const SESSION_ROW_CAP = 50;
export const RUNTIME_STATES = ["RUNNING", "PAUSED", "HALTED", "STOPPED"];
export const RECONCILIATION_VERDICTS = ["NO_OPEN_FINDINGS", "OPEN_FINDINGS"];

/** FE-067 definitions. Later requests extend this object in their own commit. */
export function stageFactsDefs() {
  const defs = {
    StageReasonCode: {type: "string", pattern: "^[A-Z][A-Z0-9_]{2,127}$",
      description: "Reviewed machine code saying why a fact is not published. Never free text, never a source message."},
    StageTimestamp: {type: "string", format: "date-time"},
    StageFactRuntimeState: {...fact({enum: RUNTIME_STATES}),
      description: "Closed vocabulary. Published only when the SOURCE deployment row carries the word; never derived from `active`, a session, readiness or freshness. A source word outside the vocabulary is refused (reason RUNTIME_STATE_WORD_NOT_IN_CLOSED_VOCABULARY), not echoed."},
    StageFactTimestamp: fact(ref("StageTimestamp")),
    StageFactInteger: fact({type: "integer", minimum: 0}),
    StageFactVerdict: {...fact({enum: RECONCILIATION_VERDICTS}),
      description: "NO_OPEN_FINDINGS is a statement about the findings relation, not a reconciliation run: it is never published from a partial window or when any finding status is unreadable."},
    StageRuntimeFacts: object({runtime_state: ref("StageFactRuntimeState"), since: ref("StageFactTimestamp")}),
    StageReconciliationFacts: object({
      basis: {const: "FINDINGS_RELATION_NOT_A_RECONCILIATION_RUN"},
      verdict: ref("StageFactVerdict"),
      open_finding_count: ref("StageFactInteger"),
      unknown_order_count: {...ref("StageFactInteger"),
        description: "Open findings the reviewed finding-type table classes as UNKNOWN_ORDER. Exact 0 only when no finding is open; NOT_PUBLISHED (FINDING_TYPE_VOCABULARY_NOT_CLASSIFIED) while any open finding is unclassified."},
      as_of: ref("StageFactTimestamp"),
    }),
    StageSessionRow: object({
      id: {type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,190}$"},
      started: ref("StageTimestamp"),
      ended: nullable(ref("StageTimestamp")),
      state: nullable({type: "string", pattern: "^[A-Za-z][A-Za-z0-9_.-]{0,63}$"}),
    }),
    StageSessionsFact: {...object({
      availability: {enum: ["AVAILABLE", "NOT_PUBLISHED"]},
      reason_code: nullable(ref("StageReasonCode")),
      basis: {const: "EXECUTION_SESSIONS_BOUNDED_WINDOW"},
      rows: {type: "array", maxItems: SESSION_ROW_CAP, items: ref("StageSessionRow")},
      returned_count: {type: "integer", minimum: 0, maximum: SESSION_ROW_CAP},
      omitted_count: {type: "integer", minimum: 0},
      source_complete: {type: ["boolean", "null"]},
    }), description: "Newest first. `ended` null while the session has no completion time. A row the reader cannot type is counted in omitted_count, never listed. `state` is the source's own word or null.",
      allOf: [
        {if: {properties: {availability: {const: "NOT_PUBLISHED"}}, required: ["availability"]},
          then: {properties: {reason_code: ref("StageReasonCode"), rows: {type: "array", maxItems: 0}, returned_count: {const: 0}, omitted_count: {const: 0}, source_complete: {type: "null"}}},
          else: {properties: {reason_code: {type: "null"}, source_complete: {type: "boolean"}}}},
      ]},
    StageFacts: {...object({
      schema_version: {const: STAGE_FACTS_VERSION},
      runtime: ref("StageRuntimeFacts"),
      reconciliation: ref("StageReconciliationFacts"),
      sessions: ref("StageSessionsFact"),
    }), description: "FE-067. Additive on the Paper workbench (`data.stage_facts`) and on the Sandbox, Canary and Live Full bodies (top level `stage_facts`). The pre-existing pinned-null `runtime_state` members are unchanged."},
  };
  return defs;
}

export function allDefs() {
  return stageFactsDefs();
}

/** `$ref`s inside a definition set, transitively, in dependency order. */
function closure(names, defs) {
  const seen = [];
  const visit = name => {
    if (seen.includes(name)) return;
    const found = defs[name];
    if (!found) throw new Error("Unknown definition: " + name);
    JSON.stringify(found, (key, value) => {
      if (key === "$ref" && typeof value === "string" && value.startsWith("#/$defs/")) visit(value.slice(8));
      return value;
    });
    seen.push(name);
  };
  for (const name of names) visit(name);
  return seen;
}

const withRefs = (value, from, to) => JSON.parse(JSON.stringify(value).replaceAll(from, to));

/** Finite-member writer (same discipline as execution-operation-reader.mjs): update only the named member. */
function member(before, key, value, container, indent) {
  const literal = JSON.stringify(key) + ":", at = before.indexOf(literal);
  const serialized = JSON.stringify(value, null, 2).replaceAll("\n", "\n" + " ".repeat(indent));
  if (at < 0) {
    const anchor = JSON.stringify(container) + ": {\n", start = before.indexOf(anchor);
    if (start < 0 || before.indexOf(anchor, start + anchor.length) >= 0) throw new Error("Missing unique object: " + container);
    const point = start + anchor.length;
    return before.slice(0, point) + " ".repeat(indent) + literal + " " + serialized + ",\n" + before.slice(point);
  }
  if (before.indexOf(literal, at + literal.length) >= 0) throw new Error("Duplicate member: " + key);
  const start = before.indexOf("{", at + literal.length);
  let depth = 0, quoted = false, escaped = false;
  for (let index = start; index < before.length; index++) {
    const char = before[index];
    if (quoted) { if (escaped) escaped = false; else if (char === "\\") escaped = true; else if (char === '"') quoted = false; continue; }
    if (char === '"') { quoted = true; continue; }
    if (char === "{") depth++; else if (char === "}" && --depth === 0) return before.slice(0, start) + serialized + before.slice(index + 1);
  }
  throw new Error("JSON boundary missing: " + key);
}

/** Insert or replace one top-level member of an existing stage fixture, leaving every other byte as written. */
function upsertTop(text, key, value, anchorLine) {
  const literal = JSON.stringify(key) + ":";
  if (text.indexOf(literal) >= 0) return member(text, key, value, null, 2);
  const at = text.indexOf("\n" + anchorLine + "\n");
  if (at < 0 || text.indexOf("\n" + anchorLine + "\n", at + 1) >= 0) throw new Error("Missing unique fixture anchor: " + anchorLine);
  const serialized = JSON.stringify(value, null, 2).replaceAll("\n", "\n  ");
  return text.slice(0, at + 1) + "  " + literal + " " + serialized + ",\n" + text.slice(at + 1);
}

/** The existing dark stage fixtures publish what the producers now emit while their source is dark. */
const STAGE_FIXTURES = () => [
  ["fixtures/execution-sandbox-certification.unavailable.valid.json", {stage_facts: unavailableStageFacts("SANDBOX_SOURCE_UNAVAILABLE")}, {stage_facts: '  "source_panels": ['}],
  ["fixtures/execution-canary-control-room.unavailable.valid.json", {stage_facts: unavailableStageFacts("LIVE_SOURCE_UNAVAILABLE")}, {stage_facts: '  "kpis": ['}],
  ["fixtures/execution-live-full-operations.unavailable.valid.json", {stage_facts: unavailableStageFacts("LIVE_SOURCE_UNAVAILABLE")}, {stage_facts: '  "predecessor_canary_envelope": {'}],
];

function updateStageFixtures(check) {
  for (const [file, members, anchors] of STAGE_FIXTURES()) {
    const path = resolve(root, file), before = readFileSync(path, "utf8");
    let after = before;
    for (const [key, value] of Object.entries(members)) after = upsertTop(after, key, value, anchors[key]);
    if (check) { if (after !== before) throw new Error("Stage fixture drift: " + file); }
    else writeFileSync(path, after);
  }
}

/** What the Paper workbench emits today: a runtime field the source does not publish, and two relations its screen is not bound to. */
export function paperWorkbenchStageFacts() {
  const unbound = "PAPER_WORKBENCH_RELATION_NOT_BOUND_TO_SCREEN";
  const facts = unavailableStageFacts(unbound);
  facts.runtime = {runtime_state: missing("SOURCE_RUNTIME_STATE_FIELD_NOT_PUBLISHED"), since: missing("SOURCE_RUNTIME_STATE_FIELD_NOT_PUBLISHED")};
  return facts;
}

const PAPER_FIXTURES = ["fixtures/execution-paper-workbench.partial.valid.json", "fixtures/execution-paper-workbench-vnm.partial.valid.json"];

function updatePaperFixtures(check) {
  for (const file of PAPER_FIXTURES) {
    const path = resolve(root, file), before = readFileSync(path, "utf8");
    const after = before.includes('"stage_facts":')
      ? member(before, "stage_facts", paperWorkbenchStageFacts(), null, 2)
      : before.replace('"portfolio_equity": [] }', '"portfolio_equity": [],\n  "stage_facts": ' + JSON.stringify(paperWorkbenchStageFacts(), null, 2).replaceAll("\n", "\n  ") + "\n}");
    if (!after.includes('"stage_facts":')) throw new Error("Paper fixture anchor missing: " + file);
    if (check) { if (after !== before) throw new Error("Paper fixture drift: " + file); }
    else writeFileSync(path, after);
  }
}

/** The roots Paper embeds. Other requests append their own roots here. */
export const PAPER_ROOTS = ["StageFacts"];

function familySchema() {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: SCHEMA_ID,
    title: "Execution stage facts v1 (BE-P2)",
    description: "Typed, honest facts the stage screens publish beside their existing bodies. Every value is AVAILABLE or NOT_PUBLISHED with a reason; the Portal never publishes a financial or runtime fact its source does not hold.",
    $defs: allDefs(),
  };
}

/** The Paper standalone schema and OpenAPI carry the same definitions inline. */
function updatePaperDocuments(check) {
  const defs = allDefs(), names = closure(PAPER_ROOTS, defs);
  const schemaPath = resolve(root, "schemas/execution-paper-read.v1.schema.json");
  const apiPath = resolve(root, "openapi/execution-paper-read.openapi.json");
  let schema = readFileSync(schemaPath, "utf8"), api = readFileSync(apiPath, "utf8");
  const schemaBefore = schema, apiBefore = api;
  for (const name of names) {
    schema = member(schema, name, defs[name], "$defs", 4);
    api = member(api, name, withRefs(defs[name], "#/$defs/", "#/components/schemas/"), "schemas", 6);
  }
  if (check) {
    if (schema !== schemaBefore) throw new Error("Paper stage-facts schema drift");
    if (api !== apiBefore) throw new Error("Paper stage-facts OpenAPI drift");
  } else {
    writeFileSync(schemaPath, schema);
    writeFileSync(apiPath, api);
  }
}

/* ── fixtures ─────────────────────────────────────────────────────────────── */

const missing = reason => ({availability: "NOT_PUBLISHED", value: null, reason_code: reason});
const available = value => ({availability: "AVAILABLE", value, reason_code: null});

export function unavailableStageFacts(reason = "LIVE_SOURCE_UNAVAILABLE") {
  return {
    schema_version: STAGE_FACTS_VERSION,
    runtime: {runtime_state: missing(reason), since: missing(reason)},
    reconciliation: {basis: "FINDINGS_RELATION_NOT_A_RECONCILIATION_RUN", verdict: missing(reason), open_finding_count: missing(reason), unknown_order_count: missing(reason), as_of: missing(reason)},
    sessions: {availability: "NOT_PUBLISHED", reason_code: reason, basis: "EXECUTION_SESSIONS_BOUNDED_WINDOW", rows: [], returned_count: 0, omitted_count: 0, source_complete: null},
  };
}

/** Explicitly synthetic: shows the populated shape only. Not a product receipt, no source implied. */
export function syntheticStageFacts() {
  return {
    schema_version: STAGE_FACTS_VERSION,
    runtime: {runtime_state: available("RUNNING"), since: available("2026-10-12T08:00:00.000Z")},
    reconciliation: {
      basis: "FINDINGS_RELATION_NOT_A_RECONCILIATION_RUN",
      verdict: available("OPEN_FINDINGS"),
      open_finding_count: available(1),
      unknown_order_count: available(1),
      as_of: available("2026-10-12T08:00:00.000Z"),
    },
    sessions: {
      availability: "AVAILABLE", reason_code: null, basis: "EXECUTION_SESSIONS_BOUNDED_WINDOW",
      rows: [
        {id: "session_TEST_ONLY_2", started: "2026-10-12T08:00:00.000Z", ended: null, state: "RUNNING"},
        {id: "session_TEST_ONLY_1", started: "2026-10-10T08:00:00.000Z", ended: "2026-10-11T16:00:00.000Z", state: "COMPLETED"},
      ],
      returned_count: 2, omitted_count: 0, source_complete: true,
    },
  };
}

export function fixtures() {
  return {
    "execution-stage-facts.unavailable.valid.json": {
      lane: "CONTRACT_EXAMPLE_NOT_PRODUCT_RECEIPT",
      description: "What every stage body publishes while its source is dark: every fact typed NOT_PUBLISHED with its reason.",
      value: unavailableStageFacts(),
    },
    "execution-stage-facts.source-backed.synthetic.valid.json": {
      lane: "TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT",
      runtime_qualified: false,
      description: "Populated shape only. The values are invented for the test and imply no source, runtime or product receipt.",
      value: syntheticStageFacts(),
    },
  };
}

export function synchronize(check = false) {
  const pretty = value => JSON.stringify(value, null, 2) + "\n";
  const writes = [[resolve(root, "schemas/execution-stage-facts.v1.schema.json"), pretty(familySchema())]];
  for (const [name, value] of Object.entries(fixtures())) writes.push([resolve(root, "fixtures", name), pretty(value)]);
  for (const [path, bytes] of writes) {
    if (check) {
      let before = null;
      try { before = readFileSync(path, "utf8"); } catch { /* reported below */ }
      if (before !== bytes) throw new Error("Stage-facts drift: " + path);
    } else writeFileSync(path, bytes);
  }
  updatePaperDocuments(check);
  updateStageFixtures(check);
  updatePaperFixtures(check);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) synchronize(process.argv.includes("--check"));
