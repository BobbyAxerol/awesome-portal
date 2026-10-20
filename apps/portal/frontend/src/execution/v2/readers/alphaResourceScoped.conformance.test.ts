/**
 * Reader conformance for `alphaResourceScoped.ts` (Rules 9.8.3, tiers L0 to L3). Lane FIXTURE_LAB: a synthetic fixture is not
 * source acceptance.
 *
 * Oracle: `execution-resource-scoped.v2.schema.json#/$defs/AlphaScopedResourceWireResponse` through the testkit checker; the
 * canonical cases are `execution-resource-scoped.synthetic.valid.json` (`producer_run`-style synthetic bodies, verbatim).
 *
 * L0  the three Alpha cases (populated-partial, empty, bounded) verbatim: schema-checked, read, every member kept as a typed
 *     constant; the field tables the reader holds equal the schema's row definitions member by member and kind by kind; the
 *     three non-Alpha cases are refused; the dispatcher reads v1 as v1, v2 as v2 and never a body under the other's reader.
 * L1  matrices with the schema as oracle: A panel state x reason x has_more x truncated x source_total; B resource state x
 *     freshness x requested x selected environment; C every member of every relation x each legal and illegal value; D the three
 *     body shapes; E unavailable-branch shapes; F the authority constants.
 * L2  200 rows in each of the 18 relations, the 200 bound, 512 character texts; inside a stated budget.
 * L3  generated negatives (wrong type, exponent, -0, unknown word, missing, null, pollution, schema swap): each is refused, or
 *     is a payload the schema also accepts; never a throw, never a leak of its probe. "Looser than the schema" is asserted ZERO.
 */
import { afterAll, describe, expect, it } from "vitest";

import { canonicalDigest, loadCanonical, loadSchema } from "../testkit/loadCanonical";
import { cartesian, coverage, describeCoverage, dimension, getPath, setPath, type Draft } from "../testkit/matrix";
import {
  arrayCases, decimalCases, enumCases, integerCases, leaked, pollutionCases, prototypeIsClean, requiredCases, rootCases, schemaVersionCases, stringCases,
} from "../testkit/negative";
import { serializedBytes, timed } from "../testkit/scale";
import { validateAgainst } from "../testkit/schema";
import { readAlphaResourceByVersion } from "./dispatch";
import {
  ALPHA_RESOURCE_V2_SCHEMA, ALPHA_SCOPED_RELATIONS, BOUNDED_REASON, NO_TOTALS_REASON, SCOPED_ROW_FIELDS, cellDecimal, cellText, readAlphaResourceScoped,
  type AlphaResourceScoped, type ScopedRelation,
} from "./alphaResourceScoped";

const FILE = "execution-resource-scoped.synthetic";
const SCHEMA = "execution-resource-scoped.v2";
const POINTER = "/$defs/AlphaScopedResourceWireResponse";
const digestBefore = canonicalDigest(FILE);
afterAll(() => {
  expect(canonicalDigest(FILE)).toBe(digestBefore);
});

const canonical = loadCanonical<{ lane: string; cases: Draft[] }>(FILE);
const ALPHA_CASES: Draft[] = canonical.cases.filter((c) => c.schema_version === ALPHA_RESOURCE_V2_SCHEMA);
const POPULATED: Draft = ALPHA_CASES.find((c) => c.state === "partial" && Object.keys(c.data).length > 2)!;
const EMPTY: Draft = ALPHA_CASES.find((c) => c.state === "empty")!;
const BOUNDED: Draft = ALPHA_CASES.find((c) => Object.keys(c.data).length === 2)!;
const violations = (value: unknown) => validateAgainst(SCHEMA, POINTER, value);
const clone = <T,>(value: T): T => structuredClone(value);
const alphaOf = (raw: unknown): AlphaResourceScoped | null => readAlphaResourceScoped(raw);

/* ── a rich, schema-valid body: every relation carries one row with every member the table names ── */

const SAMPLE: Record<string, unknown> = { T: "text_value", D: "123.456789012345678901234567890123", M: "paper", S: "2026-10-17T12:00:00Z", I: 1_790_812_800_000, C: "9007199254740993" };
const richRow = (relation: ScopedRelation, book: string = "paper"): Draft => {
  const row: Draft = { profile_environment: book };
  for (const [key, kind] of Object.entries(SCOPED_ROW_FIELDS[relation])) row[key] = SAMPLE[kind];
  return row;
};
function rich(): Draft {
  const body = clone(POPULATED);
  for (const relation of ALPHA_SCOPED_RELATIONS) {
    const rows = [richRow(relation)];
    body.data[relation] = rows;
    const panel = body.panels[relation];
    panel.state = "PARTIAL";
    panel.reason_code = "SOURCE_PARTIAL";
    panel.data = { rows: clone(rows) };
    panel.coverage = { ...panel.coverage, source_total: "1", filtered_total: "1", returned_count: 1 };
  }
  body.data.alpha.deployments = [richRow("deployments", "live")];
  body.data.alpha.portfolios = [{ portfolio_id: "pf_1", name: "Core", display_name: "Core fund" }];
  body.data.alpha.name = "Alpha name";
  body.data.alpha.display_name = "Alpha display name";
  return body;
}
const RICH: Draft = rich();

/* ═════════════════════════ L0 ═════════════════════════ */
describe("L0 · canonical, verbatim", () => {
  it("the fixture is the synthetic lane and its three Alpha cases pass the published schema through the testkit checker", () => {
    expect(canonical.lane).toBe("TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT");
    expect(ALPHA_CASES).toHaveLength(3);
    for (const c of ALPHA_CASES) expect(violations(c), c.resource.id).toEqual([]);
    expect(violations(RICH)).toEqual([]);
    const broken = clone(POPULATED);
    broken.totals_scope = "ALL_ROWS";
    expect(violations(broken).length).toBeGreaterThan(0);
  });

  it("populated: the authority the body states is kept as typed constants, never inferred", () => {
    const read = alphaOf(POPULATED)!;
    expect(read).toMatchObject({
      schemaVersion: ALPHA_RESOURCE_V2_SCHEMA, shape: "full", workspaceId: POPULATED.workspace_id, deliveryProfile: POPULATED.delivery_profile,
      requestedEnvironment: "paper", selectedEnvironment: "paper", state: "partial", freshness: "STALE", completeness: "PARTIAL",
      authority: { visibility: "SCOPED", coverage: "AUTHORIZED_ONLY", totalsScope: "VISIBLE_ROWS_ONLY", isFullPortfolio: false, readScope: [{ book: "paper", policyRevision: "TEST_ONLY-policy" }] },
      resource: { id: "alpha_TEST_ONLY", label: "TEST_ONLY Alpha" }, readAtMs: POPULATED.read_at_ms,
    });
    expect(read.summary?.financialSummary).toEqual({ state: "UNAVAILABLE", reasonCode: NO_TOTALS_REASON });
    expect(read.summary?.metrics.equity_series).toEqual({ state: "UNAVAILABLE", reasonCode: "SOURCE_PARTIAL" });
    expect(read.profileCoverage).toEqual([{ book: "paper", profileId: "profile_TEST_ONLY", state: "FOUND", reasonCode: null }]);
    expect(read.capabilities).toEqual([{ capabilityId: "resource.alpha.identity", state: "AVAILABLE", reasonCode: null, retryable: false }]);
    expect(read.bounded).toBeNull();
  });

  it("populated: one deployment row and one balance row, members exactly as stated, the rest absent (not zero)", () => {
    const read = alphaOf(POPULATED)!;
    const deployment = read.rows!.deployments[0]!;
    expect(deployment.book).toBe("paper");
    expect(cellText(deployment, "deployment_id")).toBe("deployment_TEST_ONLY");
    expect(cellText(deployment, "venue")).toBeNull();
    expect(deployment.cells.venue).toBeUndefined();
    expect(read.panels.deployments).toMatchObject({ state: "PARTIAL", reasonCode: "SOURCE_PARTIAL", sourceTotal: "1", filteredTotal: "1", returnedCount: 1, panelRowCount: 1, historySemantics: "CURRENT_STATE_ONLY" });
    expect(read.panels.performance.historySemantics).toBe("RETAINED_RANGE_OR_CURRENT_WINDOW");
    expect(read.panels.broker_sync).toMatchObject({ state: "UNAVAILABLE", reasonCode: "EXECUTION_CUSTODY_READ_NOT_COMMISSIONED", sourceTotal: null, panelRowCount: 0 });
    // The balance row states an amount as a 38 digit decimal; the reader keeps it as the exact string.
    const balance = read.rows!.account_balances[0]!;
    expect(balance.cells.total).toEqual({ kind: "decimal", exact: "1234567890123456789.1234567890123456789" });
  });

  it("empty: data {} reads as the empty shape, every panel EMPTY with a total of 0 that is the source's own string", () => {
    const read = alphaOf(EMPTY)!;
    expect(read).toMatchObject({ shape: "empty", state: "empty", rows: null, summary: null, bounded: null, freshness: "UNKNOWN", selectedEnvironment: null });
    expect(read.resource).toEqual({ id: "empty_TEST_ONLY", label: null });
    for (const name of ALPHA_SCOPED_RELATIONS) expect(read.panels[name], name).toMatchObject({ state: "EMPTY", sourceTotal: "0", returnedCount: 0 });
  });

  it("bounded: the Portal's own cut is a typed statement, and no relation row is in the read", () => {
    const read = alphaOf(BOUNDED)!;
    expect(read).toMatchObject({ shape: "bounded", state: "partial", rows: null, summary: null, bounded: { alphaId: "alpha_TEST_ONLY", reasonCode: BOUNDED_REASON } });
    for (const name of ALPHA_SCOPED_RELATIONS) expect(read.panels[name], name).toMatchObject({ state: "PARTIAL", reasonCode: BOUNDED_REASON, sourceTotal: null, panelRowCount: 0 });
  });

  it("the rich body: every member of every relation round-trips exactly (a 34 digit decimal and an int64 counter stay whole)", () => {
    const read = alphaOf(RICH)!;
    for (const relation of ALPHA_SCOPED_RELATIONS) {
      const row = read.rows![relation][0]!;
      for (const [key, kind] of Object.entries(SCOPED_ROW_FIELDS[relation])) {
        const cell = row.cells[key]!;
        if (kind === "D") expect(cell, `${relation}.${key}`).toEqual({ kind: "decimal", exact: SAMPLE.D });
        if (kind === "T") expect(cell, `${relation}.${key}`).toEqual({ kind: "text", text: SAMPLE.T });
        if (kind === "C") expect(cell, `${relation}.${key}`).toEqual({ kind: "counter", exact: SAMPLE.C });
        if (kind === "I") expect(cell, `${relation}.${key}`).toEqual({ kind: "integer", value: SAMPLE.I });
        if (kind === "M") expect(cell, `${relation}.${key}`).toEqual({ kind: "book", book: "paper" });
        if (kind === "S") expect(cell, `${relation}.${key}`).toEqual({ kind: "stamp-text", text: SAMPLE.S });
      }
    }
    expect(cellDecimal(read.rows!.account_balances[0]!, "total")).toBe(SAMPLE.D);
    expect(read.summary).toMatchObject({ id: "alpha_TEST_ONLY", name: "Alpha name", displayName: "Alpha display name" });
    expect(read.summary!.portfolios).toEqual([{ portfolioId: "pf_1", name: "Core", displayName: "Core fund" }]);
  });

  it("the field tables the reader holds are the schema's row definitions, member by member and kind by kind", () => {
    const defs = (loadSchema(SCHEMA) as { $defs: Draft }).$defs;
    const rowDef: Record<ScopedRelation, string> = {
      deployments: "DeploymentsScopedRow", accounts: "AccountsScopedRow", account_balances: "AccountBalancesScopedRow", margin_balances: "MarginBalancesScopedRow",
      account_sync: "AccountSyncScopedRow", broker_sync: "BrokerSyncScopedRow", venue_accounts: "VenueAccountsScopedRow", portfolios: "PortfoliosScopedRow",
      portfolio_allocations: "PortfolioAllocationsScopedRow", positions: "PositionsScopedRow", sessions: "SessionsScopedRow", orders: "OrdersScopedRow",
      fills: "FillsScopedRow", performance: "PerformanceScopedRow", account_equity: "AccountEquityScopedRow", reconciliation: "ReconciliationScopedRow",
      strategies: "StrategiesScopedRow", journal: "JournalScopedRow",
    };
    const isText = (x: Draft) => typeof x.pattern === "string" && x.pattern.startsWith("^[^\\u0000") && x.maxLength === 512 && x.minLength === 1;
    const kindOf = (prop: Draft): string => {
      const alts: Draft[] = prop.anyOf ?? [prop];
      const nullable = alts.some((a) => a.type === "null");
      const base = alts.filter((a) => a.type !== "null");
      const one = base.length === 1 ? base[0] : { anyOf: base };
      if (Array.isArray(one.enum)) return "M";
      if (one.type === "string" && isText(one)) return "T";
      if (one.type === "string" && one.maxLength === 128) return "D";
      if (one.type === "integer") return nullable ? "N?" : "I";
      if (one.anyOf) {
        const kinds = (one.anyOf as Draft[]).map((a) => (a.type === "integer" ? "int" : isText(a) ? "text" : a.type === "string" ? "counter" : "?")).sort().join("+");
        if (kinds === "int+text") return "S";
        if (kinds === "counter+int") return "C";
        return `anyOf:${kinds}`;
      }
      return `?${JSON.stringify(one).slice(0, 60)}`;
    };
    for (const relation of ALPHA_SCOPED_RELATIONS) {
      const def = defs[rowDef[relation]] as Draft;
      expect(def.required, relation).toEqual(["profile_environment"]);
      expect(def.additionalProperties, relation).toBe(false);
      const fromSchema = Object.fromEntries(Object.entries(def.properties as Draft).filter(([k]) => k !== "profile_environment").map(([k, v]) => [k, kindOf(v as Draft)]));
      expect(SCOPED_ROW_FIELDS[relation], relation).toEqual(fromSchema);
    }
  });

  it("the eighteen panel names the reader holds are the eighteen the schema requires, in order", () => {
    const required = ((loadSchema(SCHEMA) as { $defs: Draft }).$defs.AlphaScopedResourceResponse.properties.panels as Draft).required as string[];
    expect([...ALPHA_SCOPED_RELATIONS]).toEqual(required);
    expect(Object.keys(POPULATED.panels)).toEqual(required);
  });

  it("the three non-Alpha cases are another resource: the Alpha reader refuses them", () => {
    const others = canonical.cases.filter((c) => c.schema_version !== ALPHA_RESOURCE_V2_SCHEMA);
    expect(others.length).toBe(3);
    for (const c of others) {
      expect(alphaOf(c), c.schema_version).toBeNull();
      expect(readAlphaResourceByVersion(c).kind, c.schema_version).toBe("unsupported");
    }
  });

  it("the dispatcher reads v2 as v2, v1 as v1, and never a body under the other's reader", () => {
    const v1 = loadCanonical<{ cases: { name: string; value: Draft }[] }>("execution-alpha-resource.v1.synthetic.valid.json").cases;
    expect(v1.length).toBeGreaterThan(0);
    for (const c of ALPHA_CASES) expect(readAlphaResourceByVersion(c)).toMatchObject({ kind: "v2", schemaVersion: ALPHA_RESOURCE_V2_SCHEMA });
    for (const c of v1) {
      const routed = readAlphaResourceByVersion(c.value);
      expect(routed.kind, c.name).toBe("v1");
      // A v1 body wearing the v2 label is refused by the v2 reader (it is not that contract), not read as v1.
      const relabelled = readAlphaResourceByVersion({ ...clone(c.value), schema_version: ALPHA_RESOURCE_V2_SCHEMA });
      expect(relabelled, c.name).toMatchObject({ kind: "unsupported", reason: "V2_MALFORMED" });
    }
    // A v2 body wearing the v1 label carries the v2-only authority members: the v1 reader does not read it.
    for (const c of ALPHA_CASES) {
      const relabelled = readAlphaResourceByVersion({ ...clone(c), schema_version: "execution.alpha-resource.v1" });
      expect(relabelled.kind, c.resource.id).not.toBe("v1");
      expect(relabelled.kind, c.resource.id).not.toBe("v2");
    }
  });
});

/* ═════════════════════════ L1 ═════════════════════════ */
describe("L1 · state matrices (schema as oracle)", () => {
  const PANEL = ["panels", "deployments"] as const;
  const A = [
    dimension("state", [...PANEL, "state"], ["READY", "EMPTY", "PARTIAL", "STALE", "UNAVAILABLE", "DENIED", "ERROR"]),
    dimension("reason", [...PANEL, "reason_code"], [null, "SOURCE_PARTIAL", "ANY_REASON_WORD"]),
    dimension("has_more", [...PANEL, "coverage", "has_more"], [false, true]),
    dimension("truncated", [...PANEL, "coverage", "truncated"], [false, true]),
    dimension("source_total", [...PANEL, "coverage", "source_total"], [null, "0", "7", "9007199254740993"]),
    dimension("retryable", [...PANEL, "retryable"], [false, true]),
  ];
  const A_STATES = cartesian(clone(POPULATED), A);

  it("A · panel state x reason x has_more x truncated x source_total x retryable: all schema-valid, all read, nothing coerced", () => {
    console.info(describeCoverage("alphaScoped A", coverage(A, A_STATES)));
    expect(A_STATES.length).toBe(7 * 3 * 2 * 2 * 4 * 2);
    for (const s of A_STATES) {
      expect(violations(s.value), s.name).toEqual([]);
      const read = alphaOf(s.value)!;
      expect(read, s.name).not.toBeNull();
      const panel = read.panels.deployments;
      expect(panel.state, s.name).toBe(s.value.panels.deployments.state);
      expect(panel.sourceTotal, s.name).toBe(s.value.panels.deployments.coverage.source_total);
      expect(panel.hasMore, s.name).toBe(s.value.panels.deployments.coverage.has_more);
      expect(panel.retryable, s.name).toBe(s.value.panels.deployments.retryable);
    }
  });

  const B = [
    dimension("state", ["state"], ["ready", "empty", "partial", "stale", "unavailable"]),
    dimension("freshness", ["freshness"], ["FRESH", "AGING", "STALE", "UNKNOWN"]),
    dimension("requested", ["requested_environment"], ["all", "paper", "sandbox", "live"]),
    dimension("selected", ["selected_environment"], [null, "paper", "sandbox", "live"]),
  ];
  it("B · resource state x freshness x requested x selected book: all schema-valid and read with the word as written", () => {
    const states = cartesian(clone(POPULATED), B);
    expect(states.length).toBe(5 * 4 * 4 * 4);
    for (const s of states) {
      expect(violations(s.value), s.name).toEqual([]);
      const read = alphaOf(s.value)!;
      expect(read, s.name).toMatchObject({ state: s.value.state, freshness: s.value.freshness, requestedEnvironment: s.value.requested_environment, selectedEnvironment: s.value.selected_environment });
    }
  });

  const MEMBER_CASES: { relation: ScopedRelation; key: string; kind: string }[] = ALPHA_SCOPED_RELATIONS.flatMap((relation) =>
    Object.entries(SCOPED_ROW_FIELDS[relation]).map(([key, kind]) => ({ relation, key, kind })));
  const LEGAL: Record<string, unknown[]> = {
    T: ["x", "a".repeat(512), "ünïcode ✓"], D: ["0", "-1.5", "123456789012345678901234567890.123456789", "0.000000000000000001"],
    M: ["paper", "sandbox", "live"], S: ["2026-10-17T12:00:00Z", 0, 1_790_812_800_000], I: [0, 1_790_812_800_000], C: ["0", "9007199254740993", 0, 7],
  };
  const ILLEGAL: Record<string, unknown[]> = {
    T: ["", "a".repeat(513), "tab\there", 7, true, {}, []], D: [7, 1.5, "1e5", "01", "1.", ".5", "NaN", "a".repeat(129), {}], M: ["Paper", "backtest", "", 7],
    S: [-1, 1.5, "", true, {}], I: [null, -1, 1.5, "5", true, {}], C: [-1, 1.5, "01", "-1", "1.5", {}],
  };
  it(`C · ${MEMBER_CASES.length} members x legal values: schema-valid and read exactly; null is absent (except epoch-ms members)`, () => {
    for (const { relation, key, kind } of MEMBER_CASES) {
      for (const value of [...LEGAL[kind]!, ...(kind === "I" ? [] : [null])]) {
        const body = clone(RICH);
        body.data[relation][0][key] = value;
        expect(violations(body), `${relation}.${key}=${JSON.stringify(value)}`).toEqual([]);
        const read = alphaOf(body);
        expect(read, `${relation}.${key}=${JSON.stringify(value)}`).not.toBeNull();
        if (value === null) expect(read!.rows![relation][0]!.cells[key], `${relation}.${key}`).toEqual({ kind: "absent" });
      }
    }
  });
  it(`C · ${MEMBER_CASES.length} members x illegal values: the oracle refuses and so does the reader`, () => {
    let checked = 0;
    for (const { relation, key, kind } of MEMBER_CASES) {
      for (const value of ILLEGAL[kind]!) {
        const body = clone(RICH);
        body.data[relation][0][key] = value;
        if (violations(body).length === 0) continue; // e.g. a 1.5 the schema never sees as an integer (JS number 1.5 is not integer: invalid) - skip only schema-valid
        checked += 1;
        expect(alphaOf(body), `${relation}.${key}=${JSON.stringify(value)}`).toBeNull();
      }
    }
    console.info(`alphaScoped C: ${checked} illegal member values refused by oracle and reader`);
    expect(checked).toBeGreaterThan(500);
  });

  it("C · an unknown member in any row, panel row, summary row or summary is refused; the book of a row is required", () => {
    for (const relation of ALPHA_SCOPED_RELATIONS) {
      const body = clone(RICH);
      body.data[relation][0].unknown_member = "x";
      expect(violations(body).length, relation).toBeGreaterThan(0);
      expect(alphaOf(body), relation).toBeNull();
      const panelBody = clone(RICH);
      panelBody.panels[relation].data.rows[0].unknown_member = "x";
      expect(alphaOf(panelBody), `panel ${relation}`).toBeNull();
      const noBook = clone(RICH);
      delete noBook.data[relation][0].profile_environment;
      expect(alphaOf(noBook), `no book ${relation}`).toBeNull();
    }
    const summaryRow = clone(RICH);
    summaryRow.data.alpha.deployments[0].unknown_member = "x";
    expect(alphaOf(summaryRow)).toBeNull();
    const summary = clone(RICH);
    summary.data.alpha.unknown_member = "x";
    expect(alphaOf(summary)).toBeNull();
  });

  it("D · the three body shapes: empty needs data {}, bounded needs state partial and its own two members, full needs all twenty", () => {
    const emptyWithRows = clone(EMPTY);
    emptyWithRows.data = { deployments: [] };
    expect(violations(emptyWithRows).length).toBeGreaterThan(0);
    expect(alphaOf(emptyWithRows)).toBeNull();
    for (const state of ["ready", "empty", "stale", "unavailable"]) {
      const bounded = clone(BOUNDED);
      bounded.state = state;
      expect(violations(bounded).length, state).toBeGreaterThan(0);
      expect(alphaOf(bounded), state).toBeNull();
    }
    for (const reason of ["EDS04_OTHER", "", null]) {
      const bounded = clone(BOUNDED);
      bounded.data.alpha.reason_code = reason;
      expect(alphaOf(bounded), String(reason)).toBeNull();
    }
    for (const key of Object.keys(POPULATED.data)) {
      const body = clone(POPULATED);
      delete body.data[key];
      expect(violations(body).length, `without data.${key}`).toBeGreaterThan(0);
      expect(alphaOf(body), `without data.${key}`).toBeNull();
    }
    const extra = clone(BOUNDED);
    extra.data.deployments = [];
    expect(alphaOf(extra)).toBeNull();
  });

  it("E · unavailable branches: the plain shape, and resource.identity naming a book; any other id naming a book is refused", () => {
    const plain = (capability_id: string, state: string, reason_code: string | null) => ({ capability_id, state, reason_code, retryable: false });
    const withBook = (capability_id: string, environment: string) => ({ capability_id, environment, state: "PARTIAL", reason_code: null, retryable: true });
    const valid = [plain("a.b", "EMPTY", null), plain("a.b", "PARTIAL", "R"), plain("resource.identity", "UNAVAILABLE", null), withBook("resource.identity", "paper"), withBook("resource.identity", "live")];
    for (const branch of valid) {
      const body = clone(POPULATED);
      body.unavailable_branches = [branch];
      expect(violations(body), JSON.stringify(branch)).toEqual([]);
      const read = alphaOf(body)!;
      expect(read.unavailableBranches[0], JSON.stringify(branch)).toMatchObject({ capabilityId: branch.capability_id, environment: (branch as Draft).environment ?? null });
    }
    const invalid = [withBook("other.id", "paper"), withBook("resource.identity", "backtest"), plain("a.b", "AVAILABLE", null), { ...plain("a.b", "EMPTY", null), extra: 1 }, plain("a.b", "EMPTY", null).retryable];
    for (const branch of invalid) {
      const body = clone(POPULATED);
      body.unavailable_branches = [branch];
      expect(violations(body).length, JSON.stringify(branch)).toBeGreaterThan(0);
      expect(alphaOf(body), JSON.stringify(branch)).toBeNull();
    }
  });

  it("F · the authority constants: each flipped member refuses the body, and the schema agrees", () => {
    const flips: [string[], unknown][] = [
      [["visibility"], "FULL"], [["coverage"], "ALL"], [["totals_scope"], "ALL_ROWS"], [["is_full_portfolio"], true], [["completeness"], "COMPLETE"],
      [["record_authority"], "PORTAL_PROJECTION"], [["source_authority"], "PORTAL_SGP"], [["as_of_ms"], 1_790_812_800_000], [["as_of"], "2026-10-17T12:00:00Z"],
      [["data", "alpha", "financial_summary", "state"], "AVAILABLE"], [["data", "alpha", "financial_summary", "reason_code"], "OTHER"], [["data", "alpha", "kind"], "PORTFOLIO"],
      [["resource", "kind"], "ACCOUNT"], [["panels", "deployments", "coverage", "downsampled"], true], [["panels", "deployments", "formula"], {}],
      [["panels", "deployments", "clocks", "as_of_ms"], 1], [["panels", "deployments", "source_history_semantics"], "RETAINED_RANGE_OR_CURRENT_WINDOW"],
      [["panels", "performance", "source_history_semantics"], "CURRENT_STATE_ONLY"], [["projection", "0", "epoch"], 1], [["actor", "roles"], ["ADMIN", "USER"]],
      [["actor", "roles"], ["ROOT"]], [["read_scope"], []],
    ];
    for (const [path, value] of flips) {
      const body = clone(RICH);
      setPath(body, path, value);
      expect(violations(body).length, path.join(".")).toBeGreaterThan(0);
      expect(alphaOf(body), path.join(".")).toBeNull();
    }
  });
});

/* ═════════════════════════ L2 ═════════════════════════ */
describe("L2 · scale", () => {
  const BUDGET_3600_ROWS_MS = 800;
  const BUDGET_TEXT_MS = 800;
  function full(count: number, text = "x"): Draft {
    const body = clone(RICH);
    for (const relation of ALPHA_SCOPED_RELATIONS) {
      const rows = Array.from({ length: count }, (_, i) => {
        const row = richRow(relation);
        for (const [key, kind] of Object.entries(SCOPED_ROW_FIELDS[relation])) if (kind === "T") row[key] = `${text}${relation}_${i}_${key}`.slice(0, 512);
        return row;
      });
      body.data[relation] = rows;
      body.panels[relation].data = rows.length === 0 ? null : { rows: clone(rows) };
      body.panels[relation].coverage = { ...body.panels[relation].coverage, source_total: String(count), filtered_total: String(count), returned_count: count };
    }
    return body;
  }
  it("200 rows in each of the 18 relations (3,600 rows, panels and data) read inside the budget, exactly", () => {
    const body = full(200);
    expect(violations(body)).toEqual([]);
    const { value, ms } = timed(() => alphaOf(body));
    console.info(`alphaScoped L2: 3600 rows ${ms.toFixed(0)} ms, ${(serializedBytes(body) / 1024).toFixed(0)} KiB`);
    expect(value).not.toBeNull();
    expect(ms).toBeLessThan(BUDGET_3600_ROWS_MS);
    for (const relation of ALPHA_SCOPED_RELATIONS) expect(value!.rows![relation]).toHaveLength(200);
  });
  it("the 200 bound: one row more in any relation (data or panel) is refused, as the schema refuses it", () => {
    for (const relation of ALPHA_SCOPED_RELATIONS) {
      const body = full(200);
      body.data[relation].push(richRow(relation));
      expect(violations(body).length, relation).toBeGreaterThan(0);
      expect(alphaOf(body), relation).toBeNull();
      const panel = full(200);
      panel.panels[relation].data.rows.push(richRow(relation));
      expect(violations(panel).length, `panel ${relation}`).toBeGreaterThan(0);
      expect(alphaOf(panel), `panel ${relation}`).toBeNull();
    }
  });
  it("texts at the 512 character bound across 3,600 rows (about 1 MiB of text) read inside the budget; 513 is refused", () => {
    const body = full(200, "t".repeat(600));
    const { value, ms } = timed(() => alphaOf(body));
    console.info(`alphaScoped L2: ${(serializedBytes(body) / (1024 * 1024)).toFixed(1)} MiB of 512 character texts ${ms.toFixed(0)} ms`);
    expect(value).not.toBeNull();
    expect(ms).toBeLessThan(BUDGET_TEXT_MS);
    const over = clone(RICH);
    over.data.deployments[0].deployment_id = "t".repeat(513);
    expect(alphaOf(over)).toBeNull();
  });
});

/* ═════════════════════════ L3 ═════════════════════════ */
type Case = ReturnType<typeof enumCases>[number];
const P = (relation: string) => ["data", relation, 0] as const;
const ENUMS: Case[] = [
  ...enumCases(RICH, ["state"], ["ready", "empty", "partial", "stale", "unavailable"]),
  ...enumCases(RICH, ["freshness"], ["FRESH", "AGING", "STALE", "UNKNOWN"]),
  ...enumCases(RICH, ["requested_environment"], ["all", "paper", "sandbox", "live"]),
  ...enumCases(RICH, ["selected_environment"], ["paper", "sandbox", "live"]),
  ...enumCases(RICH, ["panels", "deployments", "state"], ["READY", "EMPTY", "PARTIAL", "STALE", "UNAVAILABLE", "DENIED", "ERROR"]),
  ...enumCases(RICH, ["capabilities", 0, "state"] as never, ["AVAILABLE", "EMPTY", "PARTIAL", "UNAVAILABLE"]),
  ...enumCases(RICH, [...P("deployments"), "profile_environment"], ["paper", "sandbox", "live"]),
  ...enumCases(RICH, [...P("deployments"), "mode"], ["paper", "sandbox", "live"]),
  ...enumCases(RICH, ["actor", "roles", 0] as never, ["ADMIN", "USER"]),
  ...enumCases(RICH, ["data", "profile_coverage", "paper", "state"], ["FOUND", "EMPTY", "PARTIAL", "UNAVAILABLE"]),
  ...enumCases(RICH, ["data", "alpha", "metrics_availability", "equity_series", "state"], ["AVAILABLE", "EMPTY", "PARTIAL", "UNAVAILABLE"]),
];
const INTEGERS: Case[] = [
  ...integerCases(RICH, ["read_at_ms"]), ...integerCases(RICH, ["panels", "deployments", "clocks", "read_at_ms"]),
  ...integerCases(RICH, ["panels", "deployments", "coverage", "returned_count"]), ...integerCases(RICH, [...P("deployments"), "created_at_ms"]),
  ...integerCases(RICH, [...P("positions"), "updated_at_ms"]),
];
const DECIMALS: Case[] = [
  ...decimalCases(RICH, [...P("positions"), "quantity"]), ...decimalCases(RICH, [...P("account_balances"), "total"]),
  ...decimalCases(RICH, [...P("performance"), "equity"]), ...decimalCases(RICH, [...P("portfolio_allocations"), "allocated_capital"]),
];
const STRINGS: Case[] = [
  ...stringCases(RICH, ["workspace_id"]), ...stringCases(RICH, ["delivery_profile"]), ...stringCases(RICH, ["read_at"]), ...stringCases(RICH, ["resource", "id"]),
  ...stringCases(RICH, [...P("deployments"), "deployment_id"]), ...stringCases(RICH, ["panels", "deployments", "coverage", "source_total"]),
];
const ARRAYS: Case[] = [
  ...arrayCases(RICH, ["projection"]), ...arrayCases(RICH, ["capabilities"]), ...arrayCases(RICH, ["read_scope"]),
  ...arrayCases(RICH, ["data", "deployments"]), ...arrayCases(RICH, ["data", "alpha", "deployments"]), ...arrayCases(RICH, ["data", "alpha", "portfolios"]),
  ...arrayCases(RICH, ["panels", "deployments", "data", "rows"]),
];
const REQUIRED_PATHS = [
  ...["schema_version", "record_authority", "source_authority", "delivery_profile", "workspace_id", "requested_environment", "selected_environment", "resource", "read_at_ms", "as_of_ms", "read_at", "as_of", "state", "freshness", "completeness", "projection", "capabilities", "panels", "unavailable_branches", "actor", "visibility", "coverage", "totals_scope", "is_full_portfolio", "read_scope", "data"].map((k) => [k] as const),
  ...["state", "data", "clocks", "coverage", "source_history_semantics", "formula", "reason_code", "retryable"].map((k) => ["panels", "positions", k] as const),
  ...["from_ms", "to_ms", "source_total", "filtered_total", "returned_count", "truncated", "downsampled", "has_more", "next_cursor", "gaps"].map((k) => ["panels", "positions", "coverage", k] as const),
  ...["kind", "id", "visibility", "coverage", "financial_summary", "deployments", "portfolios", "metrics_availability"].map((k) => ["data", "alpha", k] as const),
  ...["alpha", "profile_coverage", "deployments", "positions", "journal"].map((k) => ["data", k] as const),
  ["resource", "kind"], ["resource", "id"], ["actor", "user_id"], ["actor", "username"], ["actor", "roles"], ["read_scope", 0, "environment"], ["read_scope", 0, "policy_revision"],
  ["projection", 0, "payload_digest"], ["capabilities", 0, "capability_id"], ["capabilities", 0, "relations"], [...P("deployments"), "profile_environment"],
] as unknown as (readonly (string | number)[])[];
const REQUIRED: Case[] = requiredCases(RICH, REQUIRED_PATHS);
const SCHEMA_SWAP = schemaVersionCases(RICH, ["schema_version"], ALPHA_RESOURCE_V2_SCHEMA, ["execution.alpha-resource.v1", "execution.portfolio-resource.v2", "execution.account-resource.v2", "portal.execution.subject-records.v2"]);
const POLLUTION = pollutionCases(RICH, [[], ["resource"], ["actor"], ["data"], ["data", "alpha"], ["data", "alpha", "metrics_availability"], ["panels"], ["panels", "positions"], ["panels", "positions", "coverage"], ["panels", "positions", "clocks"], [...P("positions")], ["read_scope", 0], ["projection", 0], ["capabilities", 0], ["data", "profile_coverage"], ["data", "profile_coverage", "paper"]]);
const ALL_NEG: Case[] = [...ENUMS, ...INTEGERS, ...DECIMALS, ...STRINGS, ...ARRAYS, ...REQUIRED, ...SCHEMA_SWAP, ...POLLUTION];

describe("L3 · negative", () => {
  it("reports the case counts", () => {
    const by = new Map<string, number>();
    for (const c of ALL_NEG) by.set(c.category, (by.get(c.category) ?? 0) + 1);
    console.info(`alphaScoped L3: ${ALL_NEG.length} cases (${[...by.entries()].map(([k, v]) => `${k} ${v}`).join(", ")}), ${rootCases().length} root cases`);
    expect(ALL_NEG.length).toBeGreaterThan(600);
  });

  it.each(ALL_NEG.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    expect(() => alphaOf(c.value)).not.toThrow();
    expect(() => readAlphaResourceByVersion(c.value)).not.toThrow();
    const read = alphaOf(c.value);
    expect(leaked(read, c.probe)).toBe(false);
    expect(prototypeIsClean()).toBe(true);
    if (read === null) {
      // Through the dispatcher a refused v2 body is the typed unsupported answer, never a v1-shaped object.
      const routed = readAlphaResourceByVersion(c.value);
      if (routed.kind === "v2") throw new Error(`dispatcher read what the reader refused: ${c.name}`);
      return;
    }
    // Accepted: only when the published schema accepts it too. Looser than the schema is zero.
    expect(violations(c.value), `accepted though schema-invalid: ${c.name}`).toEqual([]);
    if (c.category === "prototype-pollution") expect(read).toEqual(alphaOf(RICH));
  });

  it("an unknown word is never a state: no enum case the schema refuses yields a read (a generated case that is a legal word is not one)", () => {
    let refused = 0;
    for (const c of ENUMS) {
      if (violations(c.value).length === 0) continue;
      refused += 1;
      expect(alphaOf(c.value), c.name).toBeNull();
    }
    expect(refused).toBeGreaterThan(150);
  });

  it.each(rootCases().map((c) => [c.name, c] as const))("%s reads as nothing", (_name, c) => {
    expect(() => alphaOf(c.value)).not.toThrow();
    expect(alphaOf(c.value)).toBeNull();
    expect(readAlphaResourceByVersion(c.value).kind).not.toBe("v2");
  });

  it("how much stricter than the schema the reader is, by category (valid per schema, refused here): only the documented limits", () => {
    const stricter: string[] = [];
    let invalid = 0;
    for (const c of ALL_NEG) {
      if (c.category === "prototype-pollution" || c.category === "schema-swapped") continue;
      if (violations(c.value).length > 0) { invalid += 1; continue; }
      if (alphaOf(c.value) === null) stricter.push(c.name);
    }
    console.info(`alphaScoped L3: reader refuses ${stricter.length} schema-valid payloads (-0, an epoch beyond the date range, a total over 20 digits); ${invalid} schema-invalid cases all refused`);
    for (const name of stricter) expect(name, "unexpected stricter case").toMatch(/negative-zero|bad-integer|exponent|huge-string|number-as-decimal|malformed-decimal|null-vs-absent|wrong-type/);
    expect(invalid).toBeGreaterThan(400);
  });

  it("-0 is refused although the schema's decimal pattern allows it (the V2 readers state a signed zero as an unreadable value)", () => {
    const body = clone(RICH);
    body.data.positions[0].quantity = "-0";
    expect(violations(body)).toEqual([]);
    expect(alphaOf(body)).toBeNull();
  });

  it("a value of the schema that is legal and the reader keeps whole: an int64 counter and a 34 digit decimal", () => {
    expect(getPath(RICH, ["data", "sessions", 0, "submitted_count"])).toBe("9007199254740993");
    expect(alphaOf(RICH)!.rows!.sessions[0]!.cells.submitted_count).toEqual({ kind: "counter", exact: "9007199254740993" });
  });
});
