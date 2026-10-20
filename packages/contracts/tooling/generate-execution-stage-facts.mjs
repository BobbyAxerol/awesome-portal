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
export const COMPLIANCE_CAPS = ["capital", "gross_notional", "daily_loss", "open_orders"];
export const ROLLBACK_KEYS = ["flatten_plan", "paper_twin", "broker_data", "rollback_drill"];
export const USED_RATIO_SCALE = 6;
export const FIGURE_KEYS = ["equity", "gross_notional", "positions", "open_orders", "fees"];
export const TYPED_ROW_CAP = 200;
export const VENUE_CALENDAR_VERSION = "execution.venue-calendar.v1";

/** A typed table beside a collection's free rows: AVAILABLE with rows, or NOT_PUBLISHED with a reason and no rows. */
function typedCollection(kind, rowDef) {
  return {...object({
    kind: {const: kind},
    availability: {enum: ["AVAILABLE", "NOT_PUBLISHED"]},
    reason_code: nullable(ref("StageReasonCode")),
    rows: {type: "array", maxItems: TYPED_ROW_CAP, items: ref(rowDef)},
    returned_count: {type: "integer", minimum: 0, maximum: TYPED_ROW_CAP},
    omitted_count: {type: "integer", minimum: 0},
    source_complete: {type: ["boolean", "null"]},
    not_published_columns: {type: "array", maxItems: 8, items: ref("StageNotPublishedColumn")},
  }), description: "Typed view of the same relation the collection's free `rows` come from. A row the reader cannot type is counted in omitted_count, never listed.",
    allOf: [{if: {properties: {availability: {const: "NOT_PUBLISHED"}}, required: ["availability"]},
      then: {properties: {reason_code: ref("StageReasonCode"), rows: {type: "array", maxItems: 0}, returned_count: {const: 0}, omitted_count: {const: 0}, source_complete: {type: "null"}}},
      else: {properties: {reason_code: {type: "null"}, source_complete: {type: "boolean"}}}}]};
}
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
    // ── FE-071: Canary envelope compliance, rollback readiness, trial schedule ──
    StageDecimal: {type: "string", maxLength: 82, pattern: "^(?:0|[1-9][0-9]{0,39})(?:\\.[0-9]{0,39}[1-9])?$",
      description: "Canonical non-negative exact decimal string: no exponent, no leading zero, no trailing fractional zero. Never a JSON number."},
    StageFactDecimal: fact(ref("StageDecimal")),
    StageFactBoolean: fact({type: "boolean"}),
    EnvelopeComplianceRow: {...object({
      cap: {enum: COMPLIANCE_CAPS},
      unit: {type: "string", pattern: "^[A-Z0-9]{2,12}$"},
      policy_limit: {...ref("StageFactDecimal"), description: "The base risk profile's limit. The Portal holds only the profile revision id, so this is NOT_PUBLISHED (BASE_RISK_PROFILE_LIMITS_NOT_PUBLISHED) until a source publishes the profile limits."},
      approved: {...ref("StageDecimal"), description: "The stored envelope's own approved limit for this cap, exact."},
      consumed: {...ref("StageFactDecimal"), description: "Consumed against the cap, published only when the profile source proves it under one explicit currency (capital, gross_notional) or over a complete relation (open_orders, count). daily_loss is NOT_PUBLISHED: no relation publishes a daily window."},
      used_ratio: {...ref("StageFactDecimal"), description: `consumed / approved, computed by the server at ${USED_RATIO_SCALE} fractional digits with ROUND_HALF_UP, canonical. The browser never divides. May exceed 1.`},
      as_of: ref("StageFactTimestamp"),
    }), description: "One row per cap, in the order capital, gross_notional, daily_loss, open_orders."},
    EnvelopeVerdict: object({
      state: {enum: ["WITHIN_ENVELOPE", "BREACH", "UNDETERMINED"]},
      basis: {const: "CONSUMED_NOT_ABOVE_APPROVED_PER_CAP"},
      undetermined_caps: {type: "array", maxItems: 4, uniqueItems: true, items: {enum: COMPLIANCE_CAPS}},
    }, {description: "Server verdict. BREACH as soon as any proven consumed figure is above its approved limit; WITHIN_ENVELOPE only when all four caps are proven and none is above; otherwise UNDETERMINED naming the caps it could not prove.",
      allOf: [{if: {properties: {state: {const: "UNDETERMINED"}}, required: ["state"]}, then: {properties: {undetermined_caps: {type: "array", minItems: 1}}}},
        {if: {properties: {state: {const: "WITHIN_ENVELOPE"}}, required: ["state"]}, then: {properties: {undetermined_caps: {type: "array", maxItems: 0}}}}]}),
    RollbackItem: object({
      key: {enum: ROLLBACK_KEYS},
      ready: ref("StageFactBoolean"),
      checked_at: ref("StageFactTimestamp"),
    }, {description: "One of four readiness checks and the date it was last checked. Only broker_data is visible to the Portal today; the rest are NOT_PUBLISHED with a reason. The legacy `ready` member (pinned false) is unchanged."}),
    TrialSchedule: object({
      basis: {const: "STARTED_AT_PLUS_DURATION_DAYS"},
      duration_days: {type: "integer", minimum: 1, maximum: 90},
      started_at: ref("StageFactTimestamp"),
      exit_review_opens_at: ref("StageFactTimestamp"),
    }, {description: "started_at is the activation instant the SOURCE states; exit_review_opens_at is started_at plus duration_days x 24h, published only together with a stated start. A DRAFT envelope is not a started trial."}),
    // ── FE-072: typed rows, Internal / Broker / Difference figures, series points, gap window ──
    StageIdentifier: {type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,190}$"},
    StageSymbol: {type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,127}$"},
    StageWord: {type: "string", pattern: "^[A-Za-z][A-Za-z0-9_.-]{0,63}$"},
    StageSignedDecimal: {type: "string", maxLength: 83, pattern: "^(?!-0$)-?(?:0|[1-9][0-9]{0,39})(?:\\.[0-9]{0,39}[1-9])?$",
      description: "Canonical signed exact decimal string: no exponent, no leading zero, no trailing fractional zero, no negative zero."},
    StageFactSignedDecimal: fact(ref("StageSignedDecimal")),
    StageNotPublishedColumn: object({column: {type: "string", pattern: "^[a-z][a-z0-9_]{1,63}$"}, reason_code: ref("StageReasonCode")},
      {description: "A column the hi-fi shows and the source relation does not carry. It is named here instead of being filled with a null that reads like data."}),
    StagePositionRow: object({
      id: nullable(ref("StageIdentifier")),
      symbol: ref("StageSymbol"),
      side: nullable({enum: ["long", "short"]}),
      quantity: nullable(ref("StageDecimal")),
      entry: nullable(ref("StageDecimal")),
      mark: nullable(ref("StageDecimal")),
      unrealised: nullable(ref("StageSignedDecimal")),
      leverage: {type: "null"},
    }, {description: "From positions_v2 only. side is the source word LONG/SHORT, else the sign of signed_qty; quantity is the source quantity, else |signed_qty|. leverage is always null: see not_published_columns."}),
    StageOrderRow: object({
      id: nullable(ref("StageIdentifier")),
      symbol: ref("StageSymbol"),
      type: nullable(ref("StageWord")),
      side: nullable({enum: ["buy", "sell"]}),
      quantity: nullable(ref("StageDecimal")),
      price: nullable(ref("StageDecimal")),
      status: nullable(ref("StageWord")),
      since: nullable(ref("StageTimestamp")),
      ack_latency_ms: {type: "null"},
    }, {description: "From the orders relation only. since is submitted_at. ack_latency_ms is always null (gateway-event data, not an orders column): see not_published_columns."}),
    StageTypedPositions: typedCollection("positions", "StagePositionRow"),
    StageTypedOrders: typedCollection("orders", "StageOrderRow"),
    StageFigure: object({
      key: {enum: FIGURE_KEYS},
      label: {type: "string", minLength: 1, maxLength: 64},
      unit: nullable({type: "string", pattern: "^[A-Z0-9]{2,12}$"}),
      internal: ref("StageFactSignedDecimal"),
      broker: {...ref("StageFactSignedDecimal"), description: "The broker side. No broker population, equity or fee total is held by the Portal today, so each is NOT_PUBLISHED with its own reason; it is never copied from the internal side."},
      difference: {...ref("StageFactSignedDecimal"), description: "internal minus broker, exact, computed by the server only when both sides are AVAILABLE; otherwise NOT_PUBLISHED (DIFFERENCE_REQUIRES_BOTH_SIDES). The browser never subtracts."},
    }),
    StageSourceFigures: object({
      basis: {const: "SOURCE_RELATIONS_HELD_BY_THE_PORTAL"},
      figures: {type: "array", minItems: FIGURE_KEYS.length, maxItems: FIGURE_KEYS.length, items: ref("StageFigure")},
    }, {description: "The Internal / Broker / Difference rows, fixed order equity, gross_notional, positions, open_orders, fees."}),
    StageGapRange: object({from: ref("StageTimestamp"), to: ref("StageTimestamp")}),
    StageFactGapRanges: fact({type: "array", maxItems: 20, items: ref("StageGapRange")}),
    StageSeriesResolution: {type: "string", pattern: "^[0-9]{1,3}[smhd]$"},
    StageSeriesPoint: object({t: ref("StageTimestamp"), value: ref("StageSignedDecimal")},
      {description: "A deployment-level point: an exact decimal string, never a JSON number. The series names its methodology_ref."}),
    StagePlanAuthor: object({user_id: ref("StageIdentifier")}),
    StagePlanEnvelopeRef: object({envelope_id: ref("StageIdentifier"), revision: {type: "integer", minimum: 1}, status: {const: "DRAFT"}}),
    StageFactPlanEnvelope: {...fact(nullable(ref("StagePlanEnvelopeRef"))),
      description: "The latest Canary envelope drafted from this promotion plan. AVAILABLE with a null value = the lookup ran and none exists."},
    // ── FE-070: VN market session calendar ──
    VenueClock: {type: "string", pattern: "^(?:[01][0-9]|2[0-3]):[0-5][0-9]$"},
    VenueTimezone: {type: "string", pattern: "^[A-Za-z_]+(?:/[A-Za-z0-9_+-]+){1,2}$", description: "IANA time-zone name, e.g. Asia/Ho_Chi_Minh."},
    VenueWindow: object({
      name: {type: "string", minLength: 1, maxLength: 64},
      kind: {enum: ["TRADING_SESSION", "OPENING_AUCTION", "CLOSING_AUCTION"]},
      open: ref("VenueClock"),
      close: ref("VenueClock"),
    }, {description: "A named window in the venue's local time. OPENING_AUCTION / CLOSING_AUCTION (ATO / ATC) only when the source names them; a generic session is TRADING_SESSION. Window kinds describe the market calendar, not which order types the Portal can route."}),
    VenueBreak: object({
      name: {const: "BREAK"},
      from: ref("VenueClock"),
      to: ref("VenueClock"),
      basis: {const: "GAP_BETWEEN_PUBLISHED_WINDOWS"},
    }, {description: "The interval between two consecutive published windows (the lunch break). Arithmetic on published windows only."}),
    VenueHoliday: object({date: {type: "string", pattern: "^[0-9]{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])$"}, name: nullable({type: "string", minLength: 1, maxLength: 128})}),
    VenueCalendar: {...object({
      schema_version: {const: VENUE_CALENDAR_VERSION},
      market: {const: "VN_EQUITY"},
      basis: {const: "SOURCE_SESSION_CALENDAR_NOT_A_CLIENT_INFERENCE"},
      timezone: fact(ref("VenueTimezone")),
      windows: fact({type: "array", minItems: 1, maxItems: 12, items: ref("VenueWindow")}),
      breaks: fact({type: "array", maxItems: 12, items: ref("VenueBreak")}),
      holidays: fact({type: "array", maxItems: 400, items: ref("VenueHoliday")}),
      is_open: fact({type: "boolean"}),
      as_of: ref("StageFactTimestamp"),
    }), description: "FE-070. Present only on the VN market workbench variant. Every member is a Fact: the Portal holds no trading-calendar source of truth, so each is NOT_PUBLISHED (N28_VENUE_CALENDAR_NOT_ACTIVE) until the market-data-layer session calendar is wired. is_open is the SOURCE's own statement at as_of; a client never infers PAUSED or AGING from window arithmetic."},
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

/** The Internal / Broker / Difference rows while the source is dark: every cell typed, none invented. */
export function darkSourceFigures(reason) {
  const brokerReason = {equity: "BROKER_EQUITY_FIELD_NOT_PUBLISHED", gross_notional: "BROKER_GROSS_NOTIONAL_NOT_PUBLISHED",
    positions: "BROKER_POSITION_POPULATION_NOT_PUBLISHED", open_orders: "BROKER_OPEN_ORDER_POPULATION_NOT_PUBLISHED", fees: "BROKER_FEE_TOTAL_NOT_PUBLISHED"};
  const label = {equity: "Equity", gross_notional: "Gross notional", positions: "Positions", open_orders: "Open orders", fees: "Fees"};
  return {
    basis: "SOURCE_RELATIONS_HELD_BY_THE_PORTAL",
    figures: FIGURE_KEYS.map(key => ({key, label: label[key], unit: key === "positions" || key === "open_orders" ? "COUNT" : null,
      internal: missing(reason), broker: missing(brokerReason[key]), difference: missing("DIFFERENCE_REQUIRES_BOTH_SIDES")})),
  };
}

export function darkTypedRows(kind, reason) {
  return {kind, availability: "NOT_PUBLISHED", reason_code: reason, rows: [], returned_count: 0, omitted_count: 0, source_complete: null,
    not_published_columns: [kind === "positions"
      ? {column: "leverage", reason_code: "POSITION_LEVERAGE_NOT_IN_SOURCE_RELATION"}
      : {column: "ack_latency_ms", reason_code: "ORDER_ACK_LATENCY_NOT_IN_SOURCE_RELATION"}]};
}

/** The existing dark stage fixtures publish what the producers now emit while their source is dark. */
const STAGE_FIXTURES = () => [
  ["fixtures/execution-sandbox-certification.unavailable.valid.json",
    {stage_facts: unavailableStageFacts("SANDBOX_SOURCE_UNAVAILABLE"), source_figures: darkSourceFigures("SANDBOX_SOURCE_UNAVAILABLE")},
    {stage_facts: '  "source_panels": [', source_figures: '  "source_panels": ['}],
  ["fixtures/execution-canary-control-room.unavailable.valid.json",
    {stage_facts: unavailableStageFacts("LIVE_SOURCE_UNAVAILABLE"), source_figures: darkSourceFigures("LIVE_SOURCE_UNAVAILABLE")},
    {stage_facts: '  "kpis": [', source_figures: '  "kpis": ['}],
  ["fixtures/execution-live-full-operations.unavailable.valid.json",
    {stage_facts: unavailableStageFacts("LIVE_SOURCE_UNAVAILABLE"), source_figures: darkSourceFigures("LIVE_SOURCE_UNAVAILABLE")},
    {stage_facts: '  "predecessor_canary_envelope": {', source_figures: '  "predecessor_canary_envelope": {'}],
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

/** Dark Canary facts for one stored envelope: the approved limits are the Portal's own; everything else is unpublished. */
export function darkCanaryFacts(envelope, reason = "LIVE_SOURCE_UNAVAILABLE") {
  const limit = {capital: envelope.limits.capital_cap, gross_notional: envelope.limits.gross_notional_cap,
    daily_loss: envelope.limits.daily_loss_cap, open_orders: String(envelope.limits.max_open_orders)};
  return {
    rows: COMPLIANCE_CAPS.map(cap => ({
      cap, unit: cap === "open_orders" ? "COUNT" : envelope.currency,
      policy_limit: missing("BASE_RISK_PROFILE_LIMITS_NOT_PUBLISHED"), approved: limit[cap],
      consumed: missing(reason), used_ratio: missing(reason), as_of: missing(reason),
    })),
    verdict: {state: "UNDETERMINED", basis: "CONSUMED_NOT_ABOVE_APPROVED_PER_CAP", undetermined_caps: [...COMPLIANCE_CAPS]},
    items: [
      {key: "flatten_plan", ready: missing("FLATTEN_PLAN_NOT_RECORDED"), checked_at: missing("FLATTEN_PLAN_NOT_RECORDED")},
      {key: "paper_twin", ready: missing("E5_CANARY_TWIN_COMPARISON_NOT_QUALIFIED"), checked_at: missing("E5_CANARY_TWIN_COMPARISON_NOT_QUALIFIED")},
      {key: "broker_data", ready: missing(reason), checked_at: missing(reason)},
      {key: "rollback_drill", ready: missing("ROLLBACK_DRILL_NOT_RECORDED"), checked_at: missing("ROLLBACK_DRILL_NOT_RECORDED")},
    ],
    trial: {basis: "STARTED_AT_PLUS_DURATION_DAYS", duration_days: envelope.limits.duration_days,
      started_at: missing("CANARY_ACTIVATION_NOT_RECORDED"), exit_review_opens_at: missing("CANARY_ACTIVATION_NOT_RECORDED")},
  };
}

/** Replace a whole top-level object member with its current value plus a patch (idempotent). */
function patchTop(text, key, patch) {
  const current = JSON.parse(text)[key];
  return member(text, key, {...current, ...patch}, null, 2);
}

function updateCanaryFixture(check) {
  const path = resolve(root, "fixtures/execution-canary-control-room.unavailable.valid.json");
  const before = readFileSync(path, "utf8"), body = JSON.parse(before), facts = darkCanaryFacts(body.envelope);
  let after = patchTop(before, "envelope_compliance", {rows: facts.rows, verdict: facts.verdict});
  after = patchTop(after, "rollback_readiness", {items: facts.items});
  after = patchTop(after, "lifecycle", {trial: facts.trial});
  after = patchTop(after, "positions", {typed: darkTypedRows("positions", "LIVE_SOURCE_UNAVAILABLE")});
  after = patchTop(after, "blotter", {typed: darkTypedRows("orders", "LIVE_SOURCE_UNAVAILABLE")});
  if (check) { if (after !== before) throw new Error("Canary fixture drift"); }
  else writeFileSync(path, after);
}

function updateLiveFixture(check) {
  const path = resolve(root, "fixtures/execution-live-full-operations.unavailable.valid.json");
  const before = readFileSync(path, "utf8");
  let after = patchTop(before, "positions", {typed: darkTypedRows("positions", "LIVE_SOURCE_UNAVAILABLE")});
  after = patchTop(after, "orders", {typed: darkTypedRows("orders", "LIVE_SOURCE_UNAVAILABLE")});
  after = patchTop(after, "projection_continuity", {gap_ranges: missing("SOURCE_CONTINUITY_UNAVAILABLE")});
  if (check) { if (after !== before) throw new Error("Live fixture drift"); }
  else writeFileSync(path, after);
}

/** What the VN market workbench emits today: no calendar source is wired, so every member is typed absent. */
export function unpublishedVenueCalendar(reason = "N28_VENUE_CALENDAR_NOT_ACTIVE") {
  return {
    schema_version: VENUE_CALENDAR_VERSION, market: "VN_EQUITY", basis: "SOURCE_SESSION_CALENDAR_NOT_A_CLIENT_INFERENCE",
    timezone: missing(reason), windows: missing(reason), breaks: missing(reason), holidays: missing(reason),
    is_open: missing(reason), as_of: missing(reason),
  };
}

/** Populated shape for tests only: invented times and dates, not the real exchange calendar. */
export function syntheticVenueCalendar() {
  return {
    schema_version: VENUE_CALENDAR_VERSION, market: "VN_EQUITY", basis: "SOURCE_SESSION_CALENDAR_NOT_A_CLIENT_INFERENCE",
    timezone: available("Asia/Ho_Chi_Minh"),
    windows: available([
      {name: "ATO", kind: "OPENING_AUCTION", open: "09:00", close: "09:15"},
      {name: "morning", kind: "TRADING_SESSION", open: "09:15", close: "11:30"},
      {name: "afternoon", kind: "TRADING_SESSION", open: "13:00", close: "14:30"},
      {name: "ATC", kind: "CLOSING_AUCTION", open: "14:30", close: "14:45"},
    ]),
    breaks: available([{name: "BREAK", from: "11:30", to: "13:00", basis: "GAP_BETWEEN_PUBLISHED_WINDOWS"}]),
    holidays: available([{date: "2099-01-01", name: "TEST_ONLY holiday"}, {date: "2099-01-02", name: null}]),
    is_open: available(false),
    as_of: available("2026-10-12T08:00:00.000Z"),
  };
}

/** What the Paper workbench emits today: a runtime field the source does not publish, and two relations its screen is not bound to. */
export function paperWorkbenchStageFacts() {
  const unbound = "PAPER_WORKBENCH_RELATION_NOT_BOUND_TO_SCREEN";
  const facts = unavailableStageFacts(unbound);
  facts.runtime = {runtime_state: missing("SOURCE_RUNTIME_STATE_FIELD_NOT_PUBLISHED"), since: missing("SOURCE_RUNTIME_STATE_FIELD_NOT_PUBLISHED")};
  return facts;
}

const PAPER_FIXTURES = ["fixtures/execution-paper-workbench.partial.valid.json", "fixtures/execution-paper-workbench-vnm.partial.valid.json"];
const VNM_FIXTURE = "fixtures/execution-paper-workbench-vnm.partial.valid.json";

function updatePaperFixtures(check) {
  for (const file of PAPER_FIXTURES) {
    const path = resolve(root, file), before = readFileSync(path, "utf8");
    let after = before.includes('"stage_facts":')
      ? member(before, "stage_facts", paperWorkbenchStageFacts(), null, 2)
      : before.replace('"portfolio_equity": [] }', '"portfolio_equity": [],\n  "stage_facts": ' + JSON.stringify(paperWorkbenchStageFacts(), null, 2).replaceAll("\n", "\n  ") + "\n}");
    if (!after.includes('"stage_facts":')) throw new Error("Paper fixture anchor missing: " + file);
    if (file === VNM_FIXTURE) {
      const calendar = unpublishedVenueCalendar();
      after = after.includes('"venue_calendar":')
        ? member(after, "venue_calendar", calendar, null, 2)
        : after.replace('"stage_facts": ', '"venue_calendar": ' + JSON.stringify(calendar, null, 2).replaceAll("\n", "\n  ") + ',\n  "stage_facts": ');
    }
    if (check) { if (after !== before) throw new Error("Paper fixture drift: " + file); }
    else writeFileSync(path, after);
  }
}

/** The roots Paper embeds. Other requests append their own roots here. */
export const PAPER_ROOTS = ["StageFacts", "VenueCalendar"];

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

/** Populated Canary shape for tests only: invented figures, no source or runtime implied. */
export function syntheticCanaryFacts() {
  const row = (cap, unit, approved, consumed, ratio, reason = "DAILY_LOSS_WINDOW_NOT_PUBLISHED") => ({
    cap, unit, policy_limit: missing("BASE_RISK_PROFILE_LIMITS_NOT_PUBLISHED"), approved,
    consumed: consumed === null ? missing(reason) : available(consumed),
    used_ratio: ratio === null ? missing(reason) : available(ratio),
    as_of: consumed === null ? missing(reason) : available("2026-10-12T08:00:00.000Z"),
  });
  return {
    rows: [
      row("capital", "USDT", "1000", "250", "0.25"),
      row("gross_notional", "USDT", "5000.5", "0", "0"),
      row("daily_loss", "USDT", "200", null, null),
      row("open_orders", "COUNT", "4", "2", "0.5"),
    ],
    verdict: {state: "UNDETERMINED", basis: "CONSUMED_NOT_ABOVE_APPROVED_PER_CAP", undetermined_caps: ["daily_loss"]},
    items: [
      {key: "flatten_plan", ready: missing("FLATTEN_PLAN_NOT_RECORDED"), checked_at: missing("FLATTEN_PLAN_NOT_RECORDED")},
      {key: "paper_twin", ready: missing("E5_CANARY_TWIN_COMPARISON_NOT_QUALIFIED"), checked_at: missing("E5_CANARY_TWIN_COMPARISON_NOT_QUALIFIED")},
      {key: "broker_data", ready: available(true), checked_at: available("2026-10-12T07:59:00.000Z")},
      {key: "rollback_drill", ready: missing("ROLLBACK_DRILL_NOT_RECORDED"), checked_at: missing("ROLLBACK_DRILL_NOT_RECORDED")},
    ],
    trial: {basis: "STARTED_AT_PLUS_DURATION_DAYS", duration_days: 14,
      started_at: available("2026-10-12T08:00:00.000Z"), exit_review_opens_at: available("2026-10-26T08:00:00.000Z")},
  };
}

/** Populated FE-072 shapes for tests only: invented values, no source, runtime or product receipt implied. */
export function syntheticStageRows() {
  const columns = {
    positions: [{column: "leverage", reason_code: "POSITION_LEVERAGE_NOT_IN_SOURCE_RELATION"}],
    orders: [{column: "ack_latency_ms", reason_code: "ORDER_ACK_LATENCY_NOT_IN_SOURCE_RELATION"}],
  };
  const figures = darkSourceFigures("LIVE_SOURCE_UNAVAILABLE");
  const set = (key, internal, broker, difference) => {
    const row = figures.figures.find(item => item.key === key);
    row.internal = available(internal); row.broker = available(broker); row.difference = available(difference);
  };
  set("positions", "2", "2", "0");
  set("open_orders", "1", "0", "1");
  return {
    typed_positions: {
      kind: "positions", availability: "AVAILABLE", reason_code: null,
      rows: [
        {id: "pos_TEST_ONLY_1", symbol: "BTCUSDT", side: "long", quantity: "0.5", entry: "60000", mark: "60500.5", unrealised: "250.25", leverage: null},
        {id: "pos_TEST_ONLY_2", symbol: "ETHUSDT", side: "short", quantity: "2", entry: "3000", mark: "2990", unrealised: "20", leverage: null},
      ],
      returned_count: 2, omitted_count: 0, source_complete: true, not_published_columns: columns.positions,
    },
    typed_orders: {
      kind: "orders", availability: "AVAILABLE", reason_code: null,
      rows: [{id: "ord_TEST_ONLY_1", symbol: "BTCUSDT", type: "LIMIT", side: "buy", quantity: "0.1", price: "59000", status: "ACCEPTED", since: "2026-10-12T08:00:00.000Z", ack_latency_ms: null}],
      returned_count: 1, omitted_count: 0, source_complete: true, not_published_columns: columns.orders,
    },
    source_figures: figures,
    series: {
      resolution: "1h", methodology_ref: "portal.net-pnl.TEST_ONLY.v1", unit: "USDT",
      points: [
        {t: "2026-10-12T08:00:00.000Z", value: "0"},
        {t: "2026-10-12T09:00:00.000Z", value: "12.5"},
        {t: "2026-10-12T10:00:00.000Z", value: "-3.25"},
      ],
    },
    gap_ranges: available([{from: "2026-10-12T11:52:00.000Z", to: "2026-10-12T12:04:00.000Z"}]),
    finding_row: {
      finding_id: "finding_TEST_ONLY_1", severity: "WARNING", source_authority: "DERIVED", finding_code: "TEST_ONLY_FINDING",
      summary: "Synthetic finding row for the opened_at column.", blocking: false, evidence_hash: null,
      as_of: null, resolved_at: null, created_at: "2026-10-12T08:00:00.000Z", opened_at: "2026-10-12T08:00:00.000Z",
    },
    plan_rows: [
      {plan_id: "plan_TEST_ONLY_2", target_stage: "CANARY", evidence_set_hash: "sha256:" + "a".repeat(64), status: "BLOCKED",
        blocker_codes: ["TEST_ONLY_BLOCKER"], source_side_effect_requested: false, created_at: "2026-10-12T08:00:00.000Z",
        author: {user_id: "usr_TEST_ONLY_author"},
        envelope: available({envelope_id: "cenv_TEST_ONLY_1", revision: 1, status: "DRAFT"})},
      {plan_id: "plan_TEST_ONLY_1", target_stage: "CANARY", evidence_set_hash: "sha256:" + "b".repeat(64), status: "BLOCKED",
        blocker_codes: ["TEST_ONLY_BLOCKER"], source_side_effect_requested: false, created_at: "2026-10-11T08:00:00.000Z",
        author: {user_id: "usr_TEST_ONLY_author"},
        envelope: available(null)},
    ],
  };
}

export function fixtures() {
  return {
    "execution-venue-calendar.synthetic.valid.json": {
      lane: "TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT",
      runtime_qualified: false,
      description: "FE-070 populated shape only: invented windows, break and holidays. Not the exchange calendar; the Portal holds no calendar source of truth and publishes NOT_PUBLISHED until the market-data-layer session calendar is wired.",
      value: syntheticVenueCalendar(),
    },
    "execution-stage-rows.synthetic.valid.json": {
      lane: "TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT",
      runtime_qualified: false,
      description: "FE-072 populated shapes only: typed position / order rows, Internal / Broker / Difference figures with both sides present, deployment-level series points, a continuity gap window, a finding opened_at and promotion-plan author / envelope. Invented values; no source, runtime or product receipt implied.",
      value: syntheticStageRows(),
    },
    "execution-canary-envelope-facts.synthetic.valid.json": {
      lane: "TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT",
      runtime_qualified: false,
      description: "FE-071 populated shape only: the members that Canary adds to envelope_compliance (rows, verdict), rollback_readiness (items) and lifecycle (trial). Invented figures; no source, runtime or product receipt implied.",
      value: syntheticCanaryFacts(),
    },
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
  updateCanaryFixture(check);
  updateLiveFixture(check);
  updatePaperFixtures(check);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) synchronize(process.argv.includes("--check"));
