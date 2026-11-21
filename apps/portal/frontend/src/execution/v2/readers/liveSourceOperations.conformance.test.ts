/**
 * Reader conformance for `liveSourceOperations.ts` (Rules 9.8.3, tiers L0 to L3).
 *
 * L0  `execution-live-source.synthetic.valid.json`, verbatim: the populated
 *     body (ten PARTIAL panels, one NOT_PUBLISHED) and the unpublished body (one
 *     PARTIAL, ten NOT_PUBLISHED), schema-checked and read. The exact strings
 *     (a 34 digit decimal, an int64 counter above 2^53) come back byte for byte.
 * L1  state matrices, with the published schema's own rules as the oracle (the
 *     testkit checker now runs the schema's allOf/if/then, not and prefixItems)
 *     beside an oracle for the reader's stated contract:
 *       A  panel state x reason x records x has_more x cursors x returned_count
 *       B  panel x grain (a panel's grain is fixed by the canonical file)
 *       C  value family x value form (text, decimal, counter, instant, mode)
 *       D  records: count x repeated observation id x observation id spelling
 *       E  cursors: spelling x has_more
 *       F  the contract flags: only the published constants read
 *     Mapping to the UI: `exact_total: null` is not zero, `returned_count` is
 *     the page, a null value is `absent` (never 0), a NOT_PUBLISHED panel has no
 *     records and a reason, nothing is a freshness word or a run state.
 * L2  200 records in each of ten panels, the 200 bound, five keyset pages of a
 *     panel, ~1 MiB of 4,096 character texts; all inside a stated budget.
 * L3  generated negatives; every case is refused or the typed
 *     `unsupported_shape` (via the dispatcher), never throws, never leaks its
 *     probe, and an unknown word is never a state. Acceptance of a
 *     schema-invalid payload is fixed by F5c (FIXED tests below).
 */
import { afterAll, describe, expect, it } from "vitest";

import { canonicalDigest, loadCanonical, loadSchema, schemaEnum } from "../testkit/loadCanonical";
import { cartesian, coverage, describeCoverage, dimension, dimensionOf, getPath, setPath, type Draft } from "../testkit/matrix";
import {
  arrayCases, decimalCases, enumCases, integerCases, leaked, pollutionCases, prototypeIsClean, requiredCases, rootCases, schemaVersionCases, stringCases,
} from "../testkit/negative";
import { cloneRows, keysetCursor, MIB, serializedBytes, splitIntoPages, timed } from "../testkit/scale";
import { validateAgainst } from "../testkit/schema";
import { readLiveFullByVersion } from "./dispatch";
import { LIVE_SOURCE_PANELS, LIVE_SOURCE_V2_SCHEMA, readLiveSourceOperationsV2, type LiveSourceOperationsV2 } from "./liveSourceOperations";

/* ── budgets (stated, generous: the suite shares a machine with other lanes) ── */
const BUDGET_2000_RECORDS_MS = 500;
const BUDGET_PAGES_MS = 800;
const BUDGET_1_MIB_MS = 800;

const FILE = "execution-live-source.synthetic";
const SCHEMA = "execution-operations.v1";
const digestBefore = canonicalDigest(FILE);
afterAll(() => {
  expect(canonicalDigest(FILE)).toBe(digestBefore);
});

const canonical = loadCanonical<Draft>(FILE);
const POPULATED: Draft = canonical.populated;
const UNPUBLISHED: Draft = canonical.unpublished;
const violations = (value: unknown) => validateAgainst(SCHEMA, "/$defs/LiveSourceOperationsReadV2", value);
const clone = <T,>(value: T): T => structuredClone(value);
const liveOf = (raw: unknown): LiveSourceOperationsV2 | null => readLiveSourceOperationsV2(raw);

const OBS = (n: number) => `por1_${n.toString(16).padStart(64, "0")}`;
const CURSOR = (a = "orders", n = 1) => `lps2.${a}.${String(n).padStart(8, "0").slice(-8)}.${"1234567890"}.${"A".repeat(43)}`;
const ORDER_RECORD: Draft = clone(POPULATED.data.orders.records[0]);

/* ═════════════════════════ L0 ═════════════════════════ */
describe("L0 · canonical, verbatim", () => {
  it("both bodies are the synthetic unqualified lane and pass the published schema through the testkit checker", () => {
    expect(canonical.lane).toBe("TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT");
    expect(canonical.runtime_qualified).toBe(false);
    expect(violations(POPULATED)).toEqual([]);
    expect(violations(UNPUBLISHED)).toEqual([]);
    const broken = clone(POPULATED);
    broken.data.orders.has_more = true;
    expect(violations(broken).length).toBeGreaterThan(0);
  });

  it("the eleven panel names the reader holds are the eleven the file publishes, in order", () => {
    expect(Object.keys(POPULATED.data)).toEqual([...LIVE_SOURCE_PANELS]);
    expect(Object.keys(UNPUBLISHED.data)).toEqual([...LIVE_SOURCE_PANELS]);
  });

  it("populated: ten PARTIAL panels with one record each, broker_sync NOT_PUBLISHED, grain as published", () => {
    const read = liveOf(POPULATED)!;
    for (const name of LIVE_SOURCE_PANELS) {
      const want = POPULATED.data[name];
      const panel = read.panels[name];
      expect(panel.state, name).toBe(want.state);
      expect(panel.reasonCode, name).toBe(want.reason_code);
      expect(panel.grain, name).toBe(want.grain);
      expect(panel.returnedCount, name).toBe(want.returned_count);
      expect(panel.records.map((r) => r.observationId), name).toEqual(want.records.map((r: Draft) => r.observation_id));
      expect(panel.limit, name).toBe(200);
      expect(panel.hasMore, name).toBe(false);
      expect(panel.nextCursor, name).toBeNull();
      expect(panel.sourceClockReason, name).toBe("SOURCE_CLOCK_NOT_SCOPED");
    }
    expect(read.panels.broker_sync).toMatchObject({ state: "NOT_PUBLISHED", reasonCode: "BROKER_PURPOSE_NOT_COMMISSIONED", grain: "NOT_COMMISSIONED", returnedCount: 0, records: [] });
  });

  it("populated: exact strings come back byte for byte; a null is absent; a published 0 is a decimal", () => {
    const read = liveOf(POPULATED)!;
    const position = read.panels.positions.records[0]!.values;
    expect(position.avg_px_open).toEqual({ kind: "decimal", exact: "9007199254740993.123456789123456789" });
    expect(position.signed_qty).toEqual({ kind: "decimal", exact: "0.000000000000000001" });
    expect(position.avg_px_close).toEqual({ kind: "absent" });
    expect(position.realized_pnl).toEqual({ kind: "decimal", exact: "0" });
    const session = read.panels.sessions.records[0]!.values;
    expect(session.submitted_count).toEqual({ kind: "counter", exact: "9007199254740993" });
    expect(session.broker_rejected_count).toEqual({ kind: "absent" });
    expect(session.risk_rejected_count).toEqual({ kind: "counter", exact: "0" });
    expect(read.panels.orders.records[0]!.values.price).toEqual({ kind: "decimal", exact: "0" });
    expect(read.panels.deployments.records[0]!.values.created_at_ms).toEqual({ kind: "instant", at: 0 });
    expect(read.panels.deployments.records[0]!.values.mode).toEqual({ kind: "text", text: "live" });
  });

  it("populated: the body states what it is not, and the reader keeps all of it as typed constants", () => {
    const read = liveOf(POPULATED)!;
    expect(read).toMatchObject({
      workspaceId: POPULATED.workspace_id, profileId: POPULATED.profile_id, deploymentId: POPULATED.deployment_id, observedAt: POPULATED.observed_at_ms,
      runtimeReasonCode: "SOURCE_RUNTIME_ACTIVATION_NOT_ASSERTED", realtimeActive: false, commandsEnabled: false,
    });
    for (const name of LIVE_SOURCE_PANELS) {
      expect(read.panels[name].provenance).toMatchObject({ projectionBasis: "SAME_RETAINED_DOCUMENT", sourceCompleteness: "UNKNOWN", historySemantics: "BOUNDED_RETAINED_NOT_FULL_HISTORY" });
      // `exact_total` is not read as a number anywhere on the panel.
      expect(Object.keys(read.panels[name])).not.toContain("exactTotal");
    }
  });

  it("unpublished: ten panels are NOT_PUBLISHED with no records and a reason; only deployments has rows", () => {
    const read = liveOf(UNPUBLISHED)!;
    expect(read.panels.deployments.state).toBe("PARTIAL");
    for (const name of LIVE_SOURCE_PANELS.filter((n) => n !== "deployments")) {
      expect(read.panels[name], name).toMatchObject({ state: "NOT_PUBLISHED", returnedCount: 0, records: [], hasMore: false });
      expect(read.panels[name].reasonCode, name).toBe(name === "broker_sync" ? "BROKER_PURPOSE_NOT_COMMISSIONED" : "SOURCE_PANEL_NOT_CAPTURED");
    }
  });

  it("the dispatcher reads the same body as v2 and never as the V1 live-full shape", () => {
    for (const body of [POPULATED, UNPUBLISHED]) {
      const read = readLiveFullByVersion(body);
      expect(read.kind).toBe("v2");
      expect(read.schemaVersion).toBe(LIVE_SOURCE_V2_SCHEMA);
    }
  });
});

/* ═════════════════════════ L1 ═════════════════════════ */
describe("L0 · the opt-in members (BE-P12), verbatim", () => {
  it("every object in the file is a covered body", () => {
    const objects = Object.keys(canonical).filter((key) => typeof canonical[key] === "object");
    expect(objects.sort()).toEqual(["populated", "unpublished", "with_members", "with_members_hidden", "with_observed_stage"]);
  });

  it("with_members and with_members_hidden pass the published schema and read", () => {
    for (const body of [WITH, WITH_HIDDEN]) {
      expect(violations(body)).toEqual([]);
      expect(liveOf(body)).not.toBeNull();
    }
    // The members are the only difference from the populated body.
    const rest = (b: Draft) => { const c = clone(b); delete c.identity; delete c.stage_facts; return c; };
    expect(rest(WITH)).toEqual(POPULATED);
    expect(rest(WITH_HIDDEN)).toEqual(POPULATED);
  });

  it("the original bodies carry neither member and read them as null (the opt-in is off by default)", () => {
    for (const body of [POPULATED, UNPUBLISHED]) {
      expect(Object.keys(body)).not.toContain("identity");
      expect(Object.keys(body)).not.toContain("stage_facts");
      expect(liveOf(body)).toMatchObject({ identity: null, stageFacts: null });
    }
  });

  it("published identity and an OPEN_FINDINGS verdict come back; nothing else is a value", () => {
    const read = liveOf(WITH)!;
    expect(read.identity).toEqual({
      basis: "RETAINED_PROJECTION_ROW_AND_FIELD_POLICY", alphaId: "alpha_TEST_ONLY_identity", alphaName: null, portfolioName: "TEST_ONLY portfolio name",
      alphaReasonCode: "ALPHA_NAME_NOT_PUBLISHED", portfolioNameReasonCode: null,
    });
    const facts = read.stageFacts!;
    expect(facts.reconciliation.verdict).toEqual({ availability: "AVAILABLE", value: "OPEN_FINDINGS" });
    expect(facts.reconciliation.openFindingCount).toEqual({ availability: "NOT_PUBLISHED", reasonCode: "AUTHORIZED_POPULATION_COUNT_NOT_EXACT" });
    expect(facts.reconciliation.unknownOrderCount).toEqual({ availability: "NOT_PUBLISHED", reasonCode: "FINDING_TYPE_VOCABULARY_NOT_CLASSIFIED" });
    expect(facts.runtime.state).toEqual({ availability: "NOT_PUBLISHED", reasonCode: "RUNTIME_STATE_FIELD_NOT_IN_READ_VOCABULARY" });
    expect(facts.runtime.since).toEqual({ availability: "NOT_PUBLISHED", reasonCode: "RUNTIME_STATE_FIELD_NOT_IN_READ_VOCABULARY" });
    expect(facts.sessions).toMatchObject({ availability: "NOT_PUBLISHED", reasonCode: "SCOPED_SESSION_ROW_FIELDS_NOT_IN_READ_VOCABULARY", rows: [] });
  });

  it("hidden: every part is a typed absence with its reason, including the verdict (AUTHORIZED_POPULATION_ONLY)", () => {
    const read = liveOf(WITH_HIDDEN)!;
    expect(read.identity).toMatchObject({ alphaId: null, portfolioName: null, alphaReasonCode: "ALPHA_IDENTITY_NOT_AUTHORIZED", portfolioNameReasonCode: "PORTFOLIO_NAME_NOT_AUTHORIZED" });
    expect(read.stageFacts!.reconciliation.verdict).toEqual({ availability: "NOT_PUBLISHED", reasonCode: "AUTHORIZED_POPULATION_ONLY" });
  });

  it("with_observed_stage: scoped runtime, since and bounded sessions are observations, never activation or stream/command authority", () => {
    const body = canonical.with_observed_stage;
    expect(violations(body)).toEqual([]);
    const read = liveOf(body)!;
    expect(read).not.toBeNull();
    expect(read.stageFacts!.runtime.state).toEqual({ availability: "AVAILABLE", value: body.stage_facts.runtime.runtime_state.value });
    expect(read.stageFacts!.runtime.since).toEqual({ availability: "AVAILABLE", value: body.stage_facts.runtime.since.value });
    expect(read.stageFacts!.sessions).toEqual({
      availability: "AVAILABLE", reasonCode: null, rows: body.stage_facts.sessions.rows,
      returnedCount: body.stage_facts.sessions.returned_count, omittedCount: body.stage_facts.sessions.omitted_count, sourceComplete: false,
    });
    expect(read).toMatchObject({ runtimeReasonCode: "SOURCE_RUNTIME_ACTIVATION_NOT_ASSERTED", realtimeActive: false, commandsEnabled: false });
    expect(body.source_verdict).toBe("NOT_ASSERTED");
    expect(body.runtime.state).toBeNull();
    expect(readLiveFullByVersion(body)).toMatchObject({ kind: "v2", value: read });
  });

  it("observed stage facts remain closed and cannot assert session completeness, global counts, a clean population or activation", () => {
    const edits: [readonly (string | number)[], unknown][] = [
      [["stage_facts", "sessions", "source_complete"], true],
      [["stage_facts", "sessions", "rows", 0, "extra"], "not published"],
      [["stage_facts", "runtime", "runtime_state", "value"], "ACTIVE"],
      [["stage_facts", "runtime", "since", "value"], 1792281600000],
      [["stage_facts", "reconciliation", "verdict"], { availability: "AVAILABLE", value: "NO_OPEN_FINDINGS", reason_code: null }],
      [["stage_facts", "reconciliation", "open_finding_count"], { availability: "AVAILABLE", value: 0, reason_code: null }],
      [["stage_facts", "reconciliation", "unknown_order_count"], { availability: "AVAILABLE", value: 0, reason_code: null }],
      [["runtime", "state"], "RUNNING"], [["realtime", "active"], true], [["commands", "enabled"], true],
    ];
    for (const [path, value] of edits) {
      const body = clone(canonical.with_observed_stage);
      setPath(body, path, value);
      expect(violations(body).length, path.join(".")).toBeGreaterThan(0);
      expect(liveOf(body), path.join(".")).toBeNull();
    }
    // The small schema checker does not validate format-only date-time schemas; the production reader still does.
    const badTimestamp = clone(canonical.with_observed_stage);
    badTimestamp.stage_facts.sessions.rows[0].started = "yesterday";
    expect(liveOf(badTimestamp)).toBeNull();
  });

  it("the dispatcher reads the same body as v2, with the members", () => {
    const routed = readLiveFullByVersion(WITH);
    expect(routed.kind).toBe("v2");
    if (routed.kind === "v2") expect(routed.value).toEqual(liveOf(WITH));
  });
});

describe("L1 · matrix A · one panel: state x reason x records x has_more x cursors x returned_count", () => {
  const PANEL = ["data", "orders"] as const;
  const DIMS = [
    dimension("state", [...PANEL, "state"], ["PARTIAL", "NOT_PUBLISHED"]),
    dimension("reason", [...PANEL, "reason_code"], ["AUTHORIZED_RETAINED_OBSERVATIONS_ONLY", "NO_AUTHORIZED_RETAINED_OBSERVATION", "SOURCE_PANEL_NOT_CAPTURED", "DEPLOYMENT_GRAIN_NOT_PROVEN", "BROKER_PURPOSE_NOT_COMMISSIONED"]),
    dimensionOf("records", [
      { label: "0", apply: (d: Draft) => { d.data.orders.records = []; d.data.orders.returned_count = 0; } },
      { label: "1", apply: () => undefined },
    ]),
    dimension("has_more", [...PANEL, "has_more"], [false, true]),
    dimension("next_cursor", [...PANEL, "next_cursor"], [null, CURSOR()]),
    dimension("previous_cursor", [...PANEL, "previous_cursor"], [null, CURSOR("orders", 2)]),
    dimensionOf("returned_count", [
      { label: "matches", apply: () => undefined },
      { label: "off by one", apply: (d: Draft) => { d.data.orders.returned_count += 1; } },
    ]),
  ];
  const states = cartesian(POPULATED, DIMS);
  /** The reader's stated contract: a NOT_PUBLISHED panel pages nothing; more pages need somewhere to go; the count is the page. */
  const readerAccepts = (p: Record<string, string>) =>
    p.returned_count === "matches"
    && !(p.state === "NOT_PUBLISHED" && (p.records !== "0" || p.has_more === "true"))
    && !(p.has_more === "true" && p.next_cursor === "null")
    // LS-1 / LS-1b: has_more=false carries no next_cursor, and a NOT_PUBLISHED panel carries neither cursor.
    && !(p.has_more === "false" && p.next_cursor !== "null")
    && !(p.state === "NOT_PUBLISHED" && (p.next_cursor !== "null" || p.previous_cursor !== "null"));

  it("prints the matrix size and how the reader and the schema differ", () => {
    const cover = coverage(DIMS, states);
    const schemaOk = states.filter((s) => violations(s.value).length === 0).length;
    const readerOk = states.filter((s) => liveOf(s.value) !== null).length;
    const looser = states.filter((s) => liveOf(s.value) !== null && violations(s.value).length > 0);
    console.info(describeCoverage("liveSource A (panel) cartesian", cover));
    console.info(`liveSource A: schema accepts ${schemaOk}, reader accepts ${readerOk}, reader accepts ${looser.length} the schema refuses`);
    expect(states).toHaveLength(2 * 5 * 2 * 2 * 2 * 2 * 2);
    expect(readerOk).toBe(states.filter((s) => readerAccepts(s.picks)).length);
  });

  it.each(states.map((s) => [s.name, s] as const))("%s", (_name, state) => {
    expect(() => liveOf(state.value)).not.toThrow();
    const read = liveOf(state.value);
    expect(read !== null).toBe(readerAccepts(state.picks));
    if (read === null) return;
    const panel = read.panels.orders;
    // `returnedCount` is this page's size, always equal to the records handed over; it is never a dataset total.
    expect(panel.returnedCount).toBe(panel.records.length);
    expect(panel.state).toBe(state.picks.state);
    expect(panel.reasonCode).toBe(state.picks.reason);
    if (panel.state === "NOT_PUBLISHED") expect(panel.records).toHaveLength(0);
    if (panel.hasMore) expect(panel.nextCursor).not.toBeNull();
    expect(Object.keys(panel)).not.toContain("exactTotal");
    // The reader is never looser than the schema: whatever it reads is schema-valid.
    expect(violations(state.value), state.name).toEqual([]);
  });
});

describe("L1 · matrix B · a panel's grain is the published one", () => {
  const GRAIN = Object.fromEntries(LIVE_SOURCE_PANELS.map((n) => [n, POPULATED.data[n].grain as string]));
  const states = LIVE_SOURCE_PANELS.flatMap((name) => ["DEPLOYMENT", "ACCOUNT", "NOT_COMMISSIONED"].map((grain) => {
    const value = clone(POPULATED);
    value.data[name].grain = grain;
    return { name: `${name} grain=${grain}`, picks: { panel: name, grain }, value };
  }));

  it("prints the matrix size", () => {
    console.info(`liveSource B (panel x grain): ${states.length} states, ${LIVE_SOURCE_PANELS.length} accepted`);
    expect(states).toHaveLength(11 * 3);
    expect(new Set(Object.values(GRAIN))).toEqual(new Set(["DEPLOYMENT", "ACCOUNT", "NOT_COMMISSIONED"]));
  });

  it.each(states.map((s) => [s.name, s] as const))("%s", (_name, state) => {
    const read = liveOf(state.value);
    expect(read !== null).toBe(GRAIN[state.picks.panel] === state.picks.grain);
    if (read !== null) expect(read.panels[state.picks.panel as keyof typeof read.panels].grain).toBe(state.picks.grain);
  });
});

describe("L1 · matrix C · value family x value form", () => {
  it("every published panel-value field is read without dropping metadata, booleans or exact decimal strings", () => {
    const schema = loadSchema(SCHEMA) as Draft;
    const properties = schema.$defs.LiveSourceOperationsReadV2.properties.data.properties.orders.properties.records.items.properties.values.properties;
    for (const [field, definition] of Object.entries(properties)) {
      const base = (definition as Draft).anyOf.find((part: Draft) => part.type !== "null");
      const sample = base.const ?? base.enum?.[0] ?? (base.type === "boolean" ? false : base.type === "integer" ? 0 : base.maxLength === 96 ? "0" : "source_value");
      const body = clone(POPULATED);
      body.data.orders.records[0].values = { [field]: sample };
      expect(violations(body), field).toEqual([]);
      const cell = liveOf(body)?.panels.orders.records[0]!.values[field];
      const expected = base.type === "boolean" ? { kind: "boolean", value: sample }
        : base.type === "integer" ? { kind: "instant", at: sample }
          : base.maxLength === 96 ? { kind: field.endsWith("_count") ? "counter" : "decimal", exact: sample }
            : { kind: "text", text: sample };
      expect(cell, field).toEqual(expected);
      body.data.orders.records[0].values[field] = null;
      expect(liveOf(body)?.panels.orders.records[0]!.values[field], `${field}=null`).toEqual({ kind: "absent" });
    }
  });

  it("boolean flags and observed enum words keep exact types, without accepting string/number substitutes or unknown words", () => {
    for (const field of ["reduce_only", "post_only"]) {
      for (const value of [false, true, "false", "true", 0, 1, {}, []]) {
        const body = clone(POPULATED);
        body.data.orders.records[0].values = { [field]: value };
        expect(liveOf(body) !== null, `${field}=${JSON.stringify(value)}`).toBe(typeof value === "boolean");
        if (typeof value === "boolean") expect(liveOf(body)!.panels.orders.records[0]!.values[field]).toEqual({ kind: "boolean", value });
      }
    }
    for (const [field, value] of [["runtime_state", "ACTIVE"], ["liquidity_side", "maker"]]) {
      const body = clone(POPULATED);
      body.data.orders.records[0].values = { [field!]: value };
      expect(violations(body).length).toBeGreaterThan(0);
      expect(liveOf(body)).toBeNull();
    }
  });
  /** One field per family; the grammar each family reads, written from the header and the schema. */
  const FIELDS: Record<string, { family: string; ok: (v: unknown) => boolean }> = {
    venue: { family: "text", ok: (v) => typeof v === "string" && v.length >= 1 && v.length <= 4096 && !/[\u0000-\u001f\u007f]/.test(v) },
    price: { family: "decimal", ok: (v) => typeof v === "string" && v.length <= 96 && /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(v) && !/^-0+(\.0+)?$/.test(v) },
    submitted_count: { family: "counter", ok: (v) => typeof v === "string" && v.length <= 20 && /^(?:0|[1-9]\d*)$/.test(v) },
    created_at_ms: { family: "instant", ok: (v) => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= 8_640_000_000_000_000 },
    mode: { family: "mode", ok: (v) => v === "live" },
  };
  const FORMS: unknown[] = [
    null, "live", "paper", "x", "", "a\nb", "a".repeat(4096), "a".repeat(4097), "0", "0.5", "-1.5", "-0", "-0.00", "1e5", "01", ".5", "5.", "1,000", " 1", "NaN",
    "9007199254740993", "9007199254740993.123456789123456789", "1".repeat(96), "1".repeat(97), "1".repeat(20), "1".repeat(21),
    0, 1, -1, 1.5, 9007199254740991, 9007199254740993, 8_640_000_000_000_000, 8_640_000_000_000_001, true, [], {}, Number.NaN,
  ];
  // Each family reads one record of the right panel: a record carries exactly the field under test.
  const PANEL_OF: Record<string, string> = { venue: "orders", price: "orders", submitted_count: "sessions", created_at_ms: "orders", mode: "orders" };
  const states = Object.keys(FIELDS).flatMap((field) => FORMS.map((form) => {
    const value = clone(POPULATED);
    const panel = value.data[PANEL_OF[field]!];
    panel.records[0].values = { [field]: form };
    return { name: `${FIELDS[field]!.family}:${field} <- ${typeof form === "string" && form.length > 12 ? `${form.length} chars` : JSON.stringify(form) ?? String(form)}`, field, form, value };
  }));

  it("prints the matrix size", () => {
    const accepted = states.filter((s) => s.form === null || FIELDS[s.field]!.ok(s.form)).length;
    console.info(`liveSource C (family x form): ${Object.keys(FIELDS).length} families x ${FORMS.length} forms = ${states.length} states, ${accepted} accepted`);
    expect(states.length).toBe(5 * FORMS.length);
  });

  it.each(states.map((s) => [s.name, s] as const))("%s", (_name, state) => {
    expect(() => liveOf(state.value)).not.toThrow();
    const read = liveOf(state.value);
    const want = state.form === null || FIELDS[state.field]!.ok(state.form);
    expect(read !== null).toBe(want);
    if (read === null) return;
    const panelName = PANEL_OF[state.field] as "orders" | "sessions";
    const value = read.panels[panelName].records[0]!.values[state.field]!;
    if (state.form === null) {
      // A null is an absence, never a zero and never an empty string.
      expect(value).toEqual({ kind: "absent" });
      return;
    }
    expect(value.kind).toBe(FIELDS[state.field]!.family === "mode" ? "text" : FIELDS[state.field]!.family);
    // Exact strings are not parsed: what was sent is what is kept.
    if (value.kind === "decimal" || value.kind === "counter") expect(value.exact).toBe(state.form);
    if (value.kind === "text") expect(value.text).toBe(state.form);
    if (value.kind === "instant") expect(value.at).toBe(state.form);
  });

  it("a value key outside the closed set voids the read, and a value of a decimal field never becomes a number", () => {
    const body = clone(POPULATED);
    body.data.orders.records[0].values.profit_factor = "1.5";
    expect(liveOf(body)).toBeNull();
    const read = liveOf(POPULATED)!;
    for (const name of LIVE_SOURCE_PANELS) {
      for (const record of read.panels[name].records) {
        for (const value of Object.values(record.values)) {
          if (value.kind === "decimal" || value.kind === "counter") expect(typeof value.exact).toBe("string");
        }
      }
    }
  });
});

describe("L1 · matrix D · records: count x repeated observation x observation spelling", () => {
  const sizes = [0, 1, 2, 200, 201];
  const SPELLING: Record<string, (n: number) => string> = {
    valid: OBS,
    "upper-case hex": (n) => OBS(n).toUpperCase().replace("POR1_", "por1_"),
    "short hash": (n) => OBS(n).slice(0, -1),
    "long hash": (n) => `${OBS(n)}0`,
    "wrong prefix": (n) => OBS(n).replace("por1_", "por2_"),
    "trailing newline": (n) => `${OBS(n)}\n`,
  };
  const DIMS = [
    dimensionOf("count", sizes.map((n) => ({ label: String(n), apply: () => undefined }))),
    dimensionOf("repeat", ["none", "last repeats first"].map((label) => ({ label, apply: () => undefined }))),
    dimensionOf("spelling", Object.keys(SPELLING).map((label) => ({ label, apply: () => undefined }))),
  ];
  const states = cartesian(POPULATED, DIMS).map((s) => {
    const n = Number(s.picks.count);
    const records = cloneRows(ORDER_RECORD, n, (r, i) => { r.observation_id = SPELLING[s.picks.spelling]!(i + 10); });
    if (s.picks.repeat !== "none" && n > 1) records[n - 1]!.observation_id = records[0]!.observation_id;
    const value = clone(POPULATED);
    value.data.orders.records = records;
    value.data.orders.returned_count = n;
    return { ...s, value };
  });
  const accept = (p: Record<string, string>) => {
    const n = Number(p.count);
    if (n > 200) return false;
    if (n === 0) return true;
    if (p.spelling !== "valid") return false;
    return !(p.repeat !== "none" && n > 1);
  };

  it("prints the matrix size", () => {
    console.info(`liveSource D (records): ${states.length} states, ${states.filter((s) => accept(s.picks)).length} accepted`);
    expect(states).toHaveLength(5 * 2 * 6);
  });

  it.each(states.map((s) => [s.name, s] as const))("%s", (_name, state) => {
    const read = liveOf(state.value);
    expect(read !== null).toBe(accept(state.picks));
    if (read !== null) {
      expect(read.panels.orders.records).toHaveLength(Number(state.picks.count));
      expect(new Set(read.panels.orders.records.map((r) => r.observationId)).size).toBe(read.panels.orders.records.length);
    }
  });
});

describe("L1 · matrix E · cursors: spelling x has_more", () => {
  const SPELLINGS: Record<string, unknown> = {
    valid: CURSOR(),
    "valid short account": CURSOR("a", 3),
    "wrong prefix": CURSOR().replace("lps2", "lps1"),
    "short tail": CURSOR().slice(0, -1),
    "long tail": `${CURSOR()}A`,
    "empty account": CURSOR("", 1).replace("lps2..", "lps2."),
    "33 char account": CURSOR("a".repeat(33), 1),
    "9 digit offset": CURSOR().replace(/\.\d{8}\./, ".123456789."),
    "trailing newline": `${CURSOR()}\n`,
    empty: "",
    number: 7,
    object: {},
  };
  const states = Object.entries(SPELLINGS).flatMap(([label, cursor]) => ["next_cursor", "previous_cursor"].flatMap((field) => [false, true].map((hasMore) => {
    const value = clone(POPULATED);
    value.data.orders[field] = cursor;
    value.data.orders.has_more = hasMore;
    if (field === "previous_cursor" && hasMore) value.data.orders.next_cursor = CURSOR("orders", 9);
    return { name: `${field}=${label} has_more=${hasMore}`, field, label, hasMore, value };
  })));
  /** Both cursors follow one grammar; a spelling outside it voids the read whatever has_more says. */
  const grammar = (label: string) => label === "valid" || label === "valid short account";

  it("prints the matrix size", () => {
    console.info(`liveSource E (cursors): ${states.length} states`);
    expect(states).toHaveLength(Object.keys(SPELLINGS).length * 2 * 2);
  });

  it.each(states.map((s) => [s.name, s] as const))("%s", (_name, state) => {
    // has_more=false beside a next_cursor is refused (LS-1); everything else follows the grammar.
    expect(liveOf(state.value) !== null).toBe(grammar(state.label) && !(state.field === "next_cursor" && !state.hasMore));
  });
});

describe("L1 · matrix F · the contract flags: only the published constants read", () => {
  const FLAGS: [string, readonly (string | number)[], unknown, unknown[]][] = [
    ["realtime.active", ["realtime", "active"], false, [true, "false", 0, null, "ABSENT"]],
    ["commands.enabled", ["commands", "enabled"], false, [true, "false", 0, null, "ABSENT"]],
    ["source_side_effect_requested", ["source_side_effect_requested"], false, [true, "false", 0, null, "ABSENT"]],
    ["runtime_activation_requested", ["runtime_activation_requested"], false, [true, "false", 0, null, "ABSENT"]],
    ["runtime.state", ["runtime", "state"], null, ["RUNNING", "ACTIVE", "", 0, false, "ABSENT"]],
    ["source_verdict", ["source_verdict"], "NOT_ASSERTED", ["ASSERTED", "OK", "not_asserted", null, "ABSENT"]],
    ["visibility", ["visibility"], "SCOPED", ["ALL", "scoped", null, "ABSENT"]],
    ["coverage", ["coverage"], "AUTHORIZED_ONLY", ["ALL", "COMPLETE", null, "ABSENT"]],
    ["environment", ["environment"], "live", ["paper", "LIVE", "sandbox", null, "ABSENT"]],
    ["record_authority", ["record_authority"], "PORTAL_RETAINED_OBSERVATION", ["BROKER", "PORTAL", null, "ABSENT"]],
    ["runtime.reason_code", ["runtime", "reason_code"], "SOURCE_RUNTIME_ACTIVATION_NOT_ASSERTED", ["RUNTIME_ASSERTED", null, "ABSENT"]],
    ["realtime.reason_code", ["realtime", "reason_code"], "FINITE_SCOPED_READ_NOT_STREAM_AUTHORITY", ["STREAM_AUTHORITY", null, "ABSENT"]],
    ["commands.reason_code", ["commands", "reason_code"], "READ_NOT_COMMAND_AUTHORITY", ["COMMAND_AUTHORITY", null, "ABSENT"]],
  ];
  const states = FLAGS.flatMap(([label, path, constant, others]) => [constant, ...others].map((value) => {
    const body = clone(POPULATED);
    if (value === "ABSENT") delete (getPath(body, path.slice(0, -1)) as Draft)[path[path.length - 1]!];
    else setPath(body, path, value);
    return { name: `${label} <- ${value === "ABSENT" ? "absent" : JSON.stringify(value)}`, isConstant: value === constant, body };
  }));

  it("prints the matrix size", () => {
    console.info(`liveSource F (flags): ${FLAGS.length} flags, ${states.length} states, ${states.filter((s) => s.isConstant).length} accepted`);
    expect(states.filter((s) => s.isConstant)).toHaveLength(FLAGS.length);
  });

  it.each(states.map((s) => [s.name, s] as const))("%s", (_name, state) => {
    const read = liveOf(state.body);
    expect(read !== null).toBe(state.isConstant);
    if (read !== null) {
      // The read never carries a run state, a freshness word or a command: only the typed constants.
      expect(read.realtimeActive).toBe(false);
      expect(read.commandsEnabled).toBe(false);
      expect(read.runtimeReasonCode).toBe("SOURCE_RUNTIME_ACTIVATION_NOT_ASSERTED");
      expect(Object.keys(read).filter((k) => /state|fresh|verdict|health|status/i.test(k))).toEqual([]);
    }
  });
});

/* ── BE-P12: the two opt-in members ───────────────────────────────────────── */
const WITH: Draft = canonical.with_members;
const WITH_HIDDEN: Draft = canonical.with_members_hidden;
const NP = (reason: string) => ({ availability: "NOT_PUBLISHED", value: null, reason_code: reason });
const AV = (value: unknown) => ({ availability: "AVAILABLE", value, reason_code: null });
const TS = "2026-10-12T08:00:00.000Z";

describe("L1 · matrix G · stage_facts: what an authorized population can prove, and nothing else", () => {
  const FACTS = ["stage_facts"] as const;
  const DIMS = [
    dimensionOf("runtime_state", [
      { label: "not-published", apply: (d: Draft) => { d.stage_facts.runtime.runtime_state = NP("RUNTIME_STATE_FIELD_NOT_IN_READ_VOCABULARY"); } },
      { label: "RUNNING", apply: (d: Draft) => { d.stage_facts.runtime.runtime_state = AV("RUNNING"); } },
      { label: "unknown-word", apply: (d: Draft) => { d.stage_facts.runtime.runtime_state = AV("ACTIVE"); } },
    ]),
    dimensionOf("since", [
      { label: "not-published", apply: (d: Draft) => { d.stage_facts.runtime.since = NP("RUNTIME_STATE_FIELD_NOT_IN_READ_VOCABULARY"); } },
      { label: "available", apply: (d: Draft) => { d.stage_facts.runtime.since = AV(TS); } },
    ]),
    dimensionOf("verdict", [
      { label: "not-published", apply: (d: Draft) => { d.stage_facts.reconciliation.verdict = NP("AUTHORIZED_POPULATION_ONLY"); } },
      { label: "OPEN_FINDINGS", apply: (d: Draft) => { d.stage_facts.reconciliation.verdict = AV("OPEN_FINDINGS"); } },
      { label: "NO_OPEN_FINDINGS", apply: (d: Draft) => { d.stage_facts.reconciliation.verdict = AV("NO_OPEN_FINDINGS"); } },
      { label: "available-null", apply: (d: Draft) => { d.stage_facts.reconciliation.verdict = AV(null); } },
    ]),
    dimensionOf("open_finding_count", [
      { label: "not-published", apply: (d: Draft) => { d.stage_facts.reconciliation.open_finding_count = NP("AUTHORIZED_POPULATION_COUNT_NOT_EXACT"); } },
      { label: "1", apply: (d: Draft) => { d.stage_facts.reconciliation.open_finding_count = AV(1); } },
      { label: "0", apply: (d: Draft) => { d.stage_facts.reconciliation.open_finding_count = AV(0); } },
    ]),
    dimensionOf("unknown_order_count", [
      { label: "not-published", apply: (d: Draft) => { d.stage_facts.reconciliation.unknown_order_count = NP("FINDING_TYPE_VOCABULARY_NOT_CLASSIFIED"); } },
      { label: "0", apply: (d: Draft) => { d.stage_facts.reconciliation.unknown_order_count = AV(0); } },
    ]),
    dimensionOf("as_of", [
      { label: "not-published", apply: (d: Draft) => { d.stage_facts.reconciliation.as_of = NP("SOURCE_CLOCK_NOT_SCOPED"); } },
      { label: "available", apply: (d: Draft) => { d.stage_facts.reconciliation.as_of = AV(TS); } },
    ]),
    dimensionOf("sessions", [
      { label: "not-published", apply: () => undefined },
      { label: "available-bounded", apply: (d: Draft) => { d.stage_facts.sessions = { availability: "AVAILABLE", reason_code: null, basis: "EXECUTION_SESSIONS_BOUNDED_WINDOW", rows: [], returned_count: 0, omitted_count: 0, source_complete: false }; } },
      { label: "available-empty", apply: (d: Draft) => { d.stage_facts.sessions = { availability: "AVAILABLE", reason_code: null, basis: "EXECUTION_SESSIONS_BOUNDED_WINDOW", rows: [], returned_count: 0, omitted_count: 0, source_complete: true }; } },
    ]),
  ];
  const states = cartesian(WITH, DIMS);
  /** Observed runtime/since and bounded sessions are allowed, but not exact global reconciliation or complete sessions. */
  const accepts = (p: Record<string, string>) =>
    p.runtime_state !== "unknown-word" && (p.verdict === "not-published" || p.verdict === "OPEN_FINDINGS")
    && p.open_finding_count === "not-published" && p.unknown_order_count === "not-published" && p.sessions !== "available-empty";

  it("prints the matrix size; the reader is never looser than the schema, and never stricter", () => {
    console.info(describeCoverage("liveSource G (stage_facts) cartesian", coverage(DIMS, states)));
    const looser = states.filter((x) => liveOf(x.value) !== null && violations(x.value).length > 0).map((x) => x.name);
    const stricter = states.filter((x) => liveOf(x.value) === null && violations(x.value).length === 0).map((x) => x.name);
    expect({ looser }).toEqual({ looser: [] });
    expect({ stricter }).toEqual({ stricter: [] });
    expect(FACTS).toEqual(["stage_facts"]);
    expect(states).toHaveLength(3 * 2 * 4 * 3 * 2 * 2 * 3);
  });

  it.each(states.map((s) => [s.name, s] as const))("%s", (_name, state) => {
    const read = liveOf(state.value);
    expect(read !== null).toBe(accepts(state.picks));
    if (read === null) return;
    // Scoped observations never become global counts, a clean population, complete sessions or activation.
    const facts = read.stageFacts!;
    expect(facts.runtime.state.availability).toBe(state.picks.runtime_state === "not-published" ? "NOT_PUBLISHED" : "AVAILABLE");
    expect(facts.reconciliation.openFindingCount.availability).toBe("NOT_PUBLISHED");
    expect(facts.reconciliation.unknownOrderCount.availability).toBe("NOT_PUBLISHED");
    expect(facts.sessions).toMatchObject({ availability: state.picks.sessions === "not-published" ? "NOT_PUBLISHED" : "AVAILABLE", rows: [], returnedCount: 0 });
    expect(facts.sessions.sourceComplete).not.toBe(true);
    expect(read).toMatchObject({ realtimeActive: false, commandsEnabled: false, runtimeReasonCode: "SOURCE_RUNTIME_ACTIVATION_NOT_ASSERTED" });
    expect(JSON.stringify(facts)).not.toContain("NO_OPEN_FINDINGS");
    if (facts.reconciliation.verdict.availability === "AVAILABLE") expect(facts.reconciliation.verdict.value).toBe("OPEN_FINDINGS");
  });
});

describe("L1 · matrix H · identity on the Live body: the same object, read exactly as the schema reads it", () => {
  const DIMS = [
    dimension("alpha_id", ["identity", "alpha_id"], ["alpha_TEST_ONLY", null, "", "a b"], (v) => JSON.stringify(v)),
    dimension("alpha_reason", ["identity", "alpha_reason_code"], [...schemaEnum(SCHEMA, "/$defs/LiveSourceOperationsReadV2/properties/identity/properties/alpha_reason_code"), "ALPHA_NAME_UNKNOWN"]),
    dimension("portfolio_name", ["identity", "portfolio_name"], ["Portfolio Name", null, "", " lead", "x".repeat(257)], (v) => JSON.stringify(v).slice(0, 24)),
    dimension("portfolio_reason", ["identity", "portfolio_name_reason_code"], [null, ...schemaEnum(SCHEMA, "/$defs/LiveSourceOperationsReadV2/properties/identity/properties/portfolio_name_reason_code/anyOf/0"), "PORTFOLIO_UNKNOWN"]),
  ];
  const states = cartesian(WITH, DIMS);

  it("the reader accepts exactly what the schema accepts", () => {
    console.info(describeCoverage("liveSource H (identity) cartesian", coverage(DIMS, states)));
    const looser = states.filter((x) => liveOf(x.value) !== null && violations(x.value).length > 0).map((x) => x.name);
    const stricter = states.filter((x) => liveOf(x.value) === null && violations(x.value).length === 0).map((x) => x.name);
    expect({ looser }).toEqual({ looser: [] });
    expect({ stricter }).toEqual({ stricter: [] });
    expect(states.filter((x) => liveOf(x.value) !== null).length).toBeGreaterThan(0);
  });

  it("each member is independent: identity alone, stage_facts alone, both, neither", () => {
    const variants: [string, boolean, boolean][] = [["neither", false, false], ["identity", true, false], ["stage_facts", false, true], ["both", true, true]];
    for (const [name, identity, stageFacts] of variants) {
      const body = clone(WITH);
      if (!identity) delete body.identity;
      if (!stageFacts) delete body.stage_facts;
      expect(violations(body), name).toEqual([]);
      const read = liveOf(body)!;
      expect(read, name).not.toBeNull();
      expect(read.identity !== null, name).toBe(identity);
      expect(read.stageFacts !== null, name).toBe(stageFacts);
    }
  });
});

/* ═════════════════════════ L2 ═════════════════════════ */
describe("L2 · scale", () => {
  const PANELS_WITH_ROWS = LIVE_SOURCE_PANELS.filter((n) => n !== "broker_sync");
  const full = (count: number): Draft => {
    const body = clone(POPULATED);
    for (const name of PANELS_WITH_ROWS) {
      body.data[name].records = cloneRows(POPULATED.data[name].records[0] as Draft, count, (r, i) => {
        r.observation_id = OBS(LIVE_SOURCE_PANELS.indexOf(name) * 1000 + i);
      });
      body.data[name].returned_count = count;
    }
    return body;
  };

  it("reads 200 records in each of ten panels (2,000 records) inside the budget and keeps every one", () => {
    const body = full(200);
    const { value, ms } = timed(() => liveOf(body));
    console.info(`liveSource 10 panels x 200 records (${(serializedBytes(body) / 1024).toFixed(0)} KiB): ${ms.toFixed(0)} ms (budget ${BUDGET_2000_RECORDS_MS} ms)`);
    for (const name of PANELS_WITH_ROWS) expect(value!.panels[name].records, name).toHaveLength(200);
    expect(ms).toBeLessThan(BUDGET_2000_RECORDS_MS);
  });

  it("refuses 201 records in a panel: the page bound is 200 and the read is not truncated to it", () => {
    const body = full(1);
    body.data.orders.records = cloneRows(ORDER_RECORD, 201, (r, i) => { r.observation_id = OBS(i + 1); });
    body.data.orders.returned_count = 201;
    expect(liveOf(body)).toBeNull();
    expect(violations(body).length).toBeGreaterThan(0);
  });

  it("reads one panel as five keyset pages of 200; the cursor chain, flags and observations stay consistent", () => {
    const all = cloneRows(ORDER_RECORD, 1000, (r, i) => { r.observation_id = OBS(i + 1); });
    const { pages } = splitIntoPages(all, 200, "orders", (r: Draft) => r.observation_id, (slice, info) => {
      const body = clone(POPULATED);
      const panel = body.data.orders;
      panel.records = slice;
      panel.returned_count = slice.length;
      panel.has_more = info.hasMore;
      panel.next_cursor = info.hasMore ? CURSOR("orders", info.index + 1) : null;
      panel.previous_cursor = info.hasPrevious ? CURSOR("orders", info.index) : null;
      return body;
    });
    expect(pages.every((p) => violations(p).length === 0)).toBe(true);
    const { value: reads, ms } = timed(() => pages.map((p) => liveOf(p)));
    console.info(`liveSource 5 x 200 records paged: ${ms.toFixed(0)} ms (budget ${BUDGET_PAGES_MS} ms)`);
    const orders = reads.map((r) => r!.panels.orders);
    expect(orders.map((p) => p.hasMore)).toEqual([true, true, true, true, false]);
    expect(orders.map((p) => p.returnedCount)).toEqual([200, 200, 200, 200, 200]);
    expect(orders.flatMap((p) => p.records.map((r) => r.observationId))).toEqual(all.map((r: Draft) => r.observation_id));
    expect(orders[4]!.nextCursor).toBeNull();
    expect(orders[0]!.previousCursor).toBeNull();
    // A page says nothing about the dataset: the count is the page, the total stays unpublished.
    expect(Object.keys(orders[0]!)).not.toContain("exactTotal");
    expect(keysetCursor("orders", "x")).toBeTypeOf("string");
    expect(ms).toBeLessThan(BUDGET_PAGES_MS);
  });

  it("reads ~1 MiB of widest-legal text (4,096 characters) inside the budget", () => {
    const body = clone(POPULATED);
    body.data.orders.records = cloneRows(ORDER_RECORD, 200, (r, i) => {
      r.observation_id = OBS(i + 1);
      for (const key of ["strategy_id", "account_id", "venue", "instrument_id", "order_id"]) r.values[key] = `${key}_${i}`.padEnd(1024, "x");
    });
    body.data.orders.returned_count = 200;
    const bytes = serializedBytes(body);
    const { value, ms } = timed(() => liveOf(body));
    console.info(`liveSource ${(bytes / MIB).toFixed(2)} MiB, 200 records x 5 x 1 KiB texts: ${ms.toFixed(0)} ms (budget ${BUDGET_1_MIB_MS} ms)`);
    expect(bytes).toBeGreaterThan(0.95 * MIB);
    expect(violations(body)).toEqual([]);
    expect(value).not.toBeNull();
    expect(ms).toBeLessThan(BUDGET_1_MIB_MS);
  });

  it("a 70,000 character text or decimal anywhere is refused fast, not scanned", () => {
    for (const [path, text] of [
      [["workspace_id"], "a".repeat(70_000)],
      [["data", "orders", "records", 0, "values", "venue"], "a".repeat(70_000)],
      [["data", "orders", "records", 0, "values", "price"], "9".repeat(70_000)],
      [["data", "orders", "records", 0, "values", "price"], `1.${"9".repeat(70_000)}`],
      [["data", "sessions", "records", 0, "values", "submitted_count"], "9".repeat(70_000)],
      [["data", "orders", "next_cursor"], `lps2.${"a".repeat(70_000)}`],
    ] as [readonly (string | number)[], string][]) {
      const body = clone(POPULATED);
      setPath(body, path, text);
      const { value, ms } = timed(() => liveOf(body));
      expect(value, path.join(".")).toBeNull();
      expect(ms, path.join(".")).toBeLessThan(100);
    }
  });
});

/* ═════════════════════════ L3 ═════════════════════════ */
interface Case { name: string; category: string; value: unknown; probe: string | null }
const O = ["data", "orders"] as const;
const REC = [...O, "records", 0] as const;
const VAL = [...REC, "values"] as const;
const SESSION = ["data", "sessions", "records", 0, "values"] as const;
const PROV = [...O, "provenance"] as const;
const enumsOf = (path: readonly (string | number)[], valid: readonly string[]): Case[] =>
  enumCases(POPULATED, path, valid).filter((c) => !valid.includes(getPath(c.value, path) as string));

const ENUMS: Case[] = [
  ...enumsOf([...O, "state"], ["PARTIAL", "NOT_PUBLISHED"]),
  ...enumsOf([...O, "reason_code"], ["AUTHORIZED_RETAINED_OBSERVATIONS_ONLY", "NO_AUTHORIZED_RETAINED_OBSERVATION", "SOURCE_PANEL_NOT_CAPTURED", "DEPLOYMENT_GRAIN_NOT_PROVEN", "BROKER_PURPOSE_NOT_COMMISSIONED"]),
  ...enumsOf([...O, "grain"], ["DEPLOYMENT"]),
  ...enumsOf([...O, "source_clock_reason"], ["SOURCE_CLOCK_NOT_SCOPED"]),
  ...enumsOf([...PROV, "purpose"], ["alpha.read", "account.read"]),
  ...enumsOf([...PROV, "projection_basis"], ["SAME_RETAINED_DOCUMENT"]),
  ...enumsOf([...PROV, "source_completeness"], ["UNKNOWN"]),
  ...enumsOf([...PROV, "history_semantics"], ["BOUNDED_RETAINED_NOT_FULL_HISTORY"]),
  ...enumsOf([...PROV, "field_contract_revision"], ["portal.execution.live-source-fields.v2"]),
  ...enumsOf([...VAL, "mode"], ["live"]),
];
const INTEGERS: Case[] = [
  ...integerCases(POPULATED, [...O, "returned_count"]),
  ...integerCases(POPULATED, [...O, "limit"]),
  ...integerCases(POPULATED, [...O, "source_as_of_ms"]),
  ...integerCases(POPULATED, [...O, "exact_total"]),
  ...integerCases(POPULATED, ["observed_at_ms"]),
  ...integerCases(POPULATED, [...VAL, "created_at_ms"]),
  ...integerCases(POPULATED, [...VAL, "updated_at_ms"]),
  ...integerCases(POPULATED, [...PROV, "source_revision"]),
  ...integerCases(POPULATED, [...PROV, "source_cursor"]),
];
const DECIMALS: Case[] = [
  ...decimalCases(POPULATED, [...VAL, "price"]).filter((c) => c.category !== "huge-string"),
  ...decimalCases(POPULATED, [...VAL, "quantity"]).filter((c) => c.category !== "huge-string"),
  ...decimalCases(POPULATED, [...SESSION, "submitted_count"]).filter((c) => c.category !== "huge-string"),
  ...decimalCases(POPULATED, ["data", "account_balances", "records", 0, "values", "total"]).filter((c) => c.category !== "huge-string"),
];
const STRINGS: Case[] = [
  ...stringCases(POPULATED, ["workspace_id"]),
  ...stringCases(POPULATED, ["profile_id"]),
  ...stringCases(POPULATED, ["deployment_id"]),
  ...stringCases(POPULATED, [...REC, "observation_id"]),
  ...stringCases(POPULATED, [...VAL, "venue"]),
  ...stringCases(POPULATED, [...PROV, "dataset_id"]),
  ...stringCases(POPULATED, [...PROV, "field_policy_ref"]),
  ...stringCases(POPULATED, [...O, "next_cursor"]),
  ...stringCases(POPULATED, [...O, "previous_cursor"]),
];
const ARRAYS: Case[] = [
  ...arrayCases(POPULATED, [...O, "records"], { idKey: "observation_id" }),
  ...arrayCases(POPULATED, ["data", "deployments", "records"], { idKey: "observation_id" }),
];
const PATHS: (readonly (string | number)[])[] = [
  ...["schema_version", "workspace_id", "environment", "profile_id", "deployment_id", "record_authority", "source_verdict", "visibility", "coverage", "observed_at_ms",
    "source_side_effect_requested", "runtime_activation_requested", "data", "runtime", "realtime", "commands"].map((k) => [k] as const),
  ["runtime", "state"], ["runtime", "reason_code"], ["realtime", "active"], ["realtime", "reason_code"], ["commands", "enabled"], ["commands", "reason_code"],
  ...["state", "reason_code", "source_as_of_ms", "source_clock_reason", "provenance", "grain", "exact_total", "limit", "returned_count", "has_more", "next_cursor", "previous_cursor", "records"].map((k) => [...O, k] as const),
  ...["dataset_id", "purpose", "field_contract_revision", "field_policy_ref", "projection_basis", "source_revision", "source_cursor", "source_completeness", "history_semantics"].map((k) => [...PROV, k] as const),
  [...REC, "observation_id"], [...REC, "values"], ["data", "broker_sync"], ["data", "positions"],
];
const REQUIRED: Case[] = requiredCases(POPULATED, PATHS);
const SCHEMA_SWAP = schemaVersionCases(POPULATED, ["schema_version"], LIVE_SOURCE_V2_SCHEMA, ["portal.execution.live-full-operations.v1", "portal.execution.live-source-operations.v1", "execution.live-full.v1"]);
const POLLUTION = pollutionCases(POPULATED, [[], ["data"], [...O], [...PROV], [...REC], [...VAL], ["runtime"], ["realtime"], ["commands"]]);
/* BE-P12: negatives of the two members, generated from the published body that carries them. */
const MEMBER_PATHS: (readonly (string | number)[])[] = [
  ["identity"], ["stage_facts"],
  ...["basis", "alpha_id", "alpha_name", "portfolio_name", "alpha_reason_code", "portfolio_name_reason_code"].map((k) => ["identity", k] as const),
  ...["schema_version", "runtime", "reconciliation", "sessions"].map((k) => ["stage_facts", k] as const),
  ["stage_facts", "runtime", "runtime_state"], ["stage_facts", "runtime", "since"],
  ...["basis", "verdict", "open_finding_count", "unknown_order_count", "as_of"].map((k) => ["stage_facts", "reconciliation", k] as const),
  ["stage_facts", "reconciliation", "verdict", "availability"], ["stage_facts", "reconciliation", "verdict", "value"], ["stage_facts", "reconciliation", "verdict", "reason_code"],
  ...["availability", "reason_code", "basis", "rows", "returned_count", "omitted_count", "source_complete"].map((k) => ["stage_facts", "sessions", k] as const),
];
const memberEnums = (path: readonly (string | number)[], valid: readonly string[]): Case[] =>
  enumCases(WITH, path, valid).filter((c) => !valid.includes(getPath(c.value, path) as string));
const MEMBER_NEG: Case[] = [
  ...requiredCases(WITH, MEMBER_PATHS),
  ...memberEnums(["identity", "basis"], ["RETAINED_PROJECTION_ROW_AND_FIELD_POLICY"]),
  ...memberEnums(["identity", "alpha_reason_code"], ["ALPHA_NAME_NOT_PUBLISHED"]),
  ...memberEnums(["stage_facts", "schema_version"], ["execution.stage-facts.v1"]),
  ...memberEnums(["stage_facts", "reconciliation", "basis"], ["FINDINGS_RELATION_NOT_A_RECONCILIATION_RUN"]),
  ...memberEnums(["stage_facts", "reconciliation", "verdict", "availability"], ["NOT_PUBLISHED", "AVAILABLE"]),
  ...memberEnums(["stage_facts", "sessions", "availability"], ["NOT_PUBLISHED", "AVAILABLE"]),
  ...memberEnums(["stage_facts", "sessions", "basis"], ["EXECUTION_SESSIONS_BOUNDED_WINDOW"]),
  ...stringCases(WITH, ["identity", "alpha_id"]),
  ...stringCases(WITH, ["identity", "portfolio_name"]),
  ...stringCases(WITH, ["stage_facts", "reconciliation", "verdict", "reason_code"]),
  ...integerCases(WITH, ["stage_facts", "sessions", "returned_count"]),
  ...integerCases(WITH, ["stage_facts", "sessions", "omitted_count"]),
  ...arrayCases(WITH, ["stage_facts", "sessions", "rows"], { idKey: "id" }),
  ...pollutionCases(WITH, [[], ["identity"], ["stage_facts"], ["stage_facts", "runtime"], ["stage_facts", "reconciliation"], ["stage_facts", "reconciliation", "verdict"], ["stage_facts", "sessions"]]),
].map((c) => ({ ...c, name: `members · ${c.name}` }));
const ALL_NEG: Case[] = [...ENUMS, ...INTEGERS, ...DECIMALS, ...STRINGS, ...ARRAYS, ...REQUIRED, ...SCHEMA_SWAP, ...POLLUTION, ...MEMBER_NEG];

/**
 * Accepted although the published schema refuses it. Each has a DEFECT test;
 * an accepted schema-invalid case outside this list fails the suite.
 */
const KNOWN_GAPS: ((c: Case) => boolean)[] = [
  // The planted key is ignored by the reader's own closed-key check; it is refused, so this is never reached in practice.
  (c) => c.category === "prototype-pollution",
];

describe("L3 · negative", () => {
  it("reports the case counts", () => {
    const by = new Map<string, number>();
    for (const c of ALL_NEG) by.set(c.category, (by.get(c.category) ?? 0) + 1);
    console.info(`liveSource L3: ${ALL_NEG.length} cases (${[...by.entries()].map(([k, v]) => `${k} ${v}`).join(", ")}), ${rootCases().length} root cases`);
    expect(ALL_NEG.length).toBeGreaterThan(500);
  });

  it.each(ALL_NEG.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    expect(() => liveOf(c.value)).not.toThrow();
    expect(() => readLiveFullByVersion(c.value)).not.toThrow();
    const read = liveOf(c.value);
    expect(leaked(read, c.probe)).toBe(false);
    expect(prototypeIsClean()).toBe(true);
    if (read === null) {
      // Through the dispatcher a refused V2 body is the typed unsupported answer, never a V1-shaped object.
      const routed = readLiveFullByVersion(c.value);
      if (routed.kind === "v2") throw new Error(`dispatcher read what the reader refused: ${c.name}`);
      return;
    }
    // Accepted: fine for a schema-valid payload (a null where null is allowed, a text that is only odd), else only a documented defect.
    if (violations(c.value).length > 0) expect(KNOWN_GAPS.some((f) => f(c)), `accepted though schema-invalid: ${c.name}`).toBe(true);
    if (c.category === "prototype-pollution") expect(read).toEqual(liveOf(POPULATED));
  });

  it("an unknown word is never a state: no enum case yields a read", () => {
    for (const c of ENUMS) expect(liveOf(c.value), c.name).toBeNull();
  });

  it("exact_total null is not zero: a published number there is refused, not read as a total", () => {
    for (const c of integerCases(POPULATED, [...O, "exact_total"]).filter((x) => x.category === "bad-integer")) expect(liveOf(c.value), c.name).toBeNull();
    for (const total of [0, 1, 200, "0", "1000"]) {
      const body = clone(POPULATED);
      body.data.orders.exact_total = total;
      expect(liveOf(body), String(total)).toBeNull();
    }
  });

  it.each(rootCases().map((c) => [c.name, c] as const))("%s reads as nothing", (_name, c) => {
    expect(() => liveOf(c.value)).not.toThrow();
    expect(liveOf(c.value)).toBeNull();
    expect(readLiveFullByVersion(c.value).kind).not.toBe("v2");
  });

  it("prints how much looser the reader is than the published schema, by category", () => {
    const gap = new Map<string, string[]>();
    let invalid = 0;
    for (const c of ALL_NEG) {
      if (c.category === "prototype-pollution" || c.category === "schema-swapped") continue;
      if (violations(c.value).length === 0) continue;
      invalid += 1;
      if (liveOf(c.value) !== null) gap.set(c.category, [...(gap.get(c.category) ?? []), c.name]);
    }
    const accepted = [...gap.values()].reduce((n, v) => n + v.length, 0);
    console.info(`liveSource L3 gap: reader accepts ${accepted} of ${invalid} schema-invalid payloads${accepted === 0 ? "" : `; ${[...gap.entries()].map(([k, v]) => `${k} ${v.length}`).join(", ")}`}`);
    for (const [category, names] of gap) console.info(`  ${category}: e.g. ${names.slice(0, 4).join(" | ")}`);
    expect(invalid).toBeGreaterThan(300);
  });

  it("the reader is deliberately stricter than the schema on -0 (the schema's decimal pattern allows it)", () => {
    const body = clone(POPULATED);
    body.data.orders.records[0].values.price = "-0";
    expect(violations(body)).toEqual([]);
    expect(liveOf(body)).toBeNull();
  });
});

/* ═══════════════ fixed defects (F5c), now ordinary tests ═══════════════ */
describe("fixed defects (F5c)", () => {
  /*
   * DEFECT LS-1 (readPanel): the schema's allOf says `has_more: false` means
   * `next_cursor: null`. The reader checks only the other direction (has_more
   * needs a cursor), so a panel that says "this is the last page" and still
   * carries a next cursor is read, and a screen that follows `nextCursor`
   * rather than `hasMore` would page past the end.
   */
  it("FIXED LS-1: a panel with has_more=false and a next_cursor is refused", () => {
    const body = clone(POPULATED);
    body.data.orders.has_more = false;
    body.data.orders.next_cursor = CURSOR();
    expect(violations(body).length).toBeGreaterThan(0);
    expect(liveOf(body)).toBeNull();
  });

  /*
   * DEFECT LS-1b (readPanel): the same allOf makes a NOT_PUBLISHED panel's
   * next_cursor and previous_cursor null. The reader refuses its records and
   * has_more but reads a cursor on it, so a panel that published nothing can
   * still hand a screen somewhere to page to.
   */
  it("FIXED LS-1b: a NOT_PUBLISHED panel that carries a cursor is refused", () => {
    for (const field of ["next_cursor", "previous_cursor"]) {
      const body = clone(POPULATED);
      body.data.broker_sync[field] = CURSOR("broker", 1);
      expect(violations(body).length, field).toBeGreaterThan(0);
      expect(liveOf(body), field).toBeNull();
    }
  });
});
