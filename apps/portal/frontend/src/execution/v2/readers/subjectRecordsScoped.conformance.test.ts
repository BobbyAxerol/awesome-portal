/**
 * Reader conformance for `subjectRecordsScoped.ts` (Rules 9.8.3, tiers L0 to L3). Lane FIXTURE_LAB: a synthetic fixture is not
 * source acceptance.
 *
 * Oracle: `execution-scoped-records.openapi.json#/components/schemas/ScopedSubjectRecordsResponse` through the testkit checker;
 * canonical body: the `ScopedSubjectRecordsResponse` case of `execution-scoped-records.synthetic.valid.json`, verbatim.
 *
 * L0  the canonical page schema-checked and read; the member table equals the schema's `ScopedRecordFields` kind by kind; the
 *     dispatcher reads `subject-records.v1` as v1 and `.v2` as v2 and never one under the other's reader.
 * L1  A operation x resource kind x state x has_more x cursor x limit; B every record member x legal and illegal values;
 *     C the constants (authority, history semantics, reason, page ceiling, visibility, coverage).
 * L2  500 records of every member inside a stated budget; 501 refused.
 * L3  generated negatives; each refused or schema-valid; "looser than the schema" is asserted ZERO.
 */
import { afterAll, describe, expect, it } from "vitest";

import { canonicalDigest, loadCanonical, loadSchema } from "../testkit/loadCanonical";
import { cartesian, coverage, describeCoverage, dimension, setPath, type Draft } from "../testkit/matrix";
import { arrayCases, decimalCases, enumCases, integerCases, leaked, pollutionCases, prototypeIsClean, requiredCases, rootCases, schemaVersionCases, stringCases } from "../testkit/negative";
import { serializedBytes, timed } from "../testkit/scale";
import { validateAgainst } from "../testkit/schema";
import { readSubjectRecordsByVersion } from "./dispatch";
import { SCOPED_RECORD_FIELDS, SUBJECT_RECORDS_V2_SCHEMA, readSubjectRecordsScoped, type SubjectRecordsScoped } from "./subjectRecordsScoped";

const FILE = "execution-scoped-records.synthetic.valid.json";
const OPENAPI = "../openapi/execution-scoped-records.openapi.json";
const POINTER = "/components/schemas/ScopedSubjectRecordsResponse";
const digestBefore = canonicalDigest(FILE);
afterAll(() => {
  expect(canonicalDigest(FILE)).toBe(digestBefore);
});

const canonical = loadCanonical<{ lane: string; cases: { type: string; value: Draft }[] }>(FILE);
const BASE: Draft = canonical.cases.find((c) => c.type === "ScopedSubjectRecordsResponse")!.value;
const violations = (value: unknown) => validateAgainst(OPENAPI, POINTER, value);
const clone = <T,>(value: T): T => structuredClone(value);
const pageOf = (raw: unknown): SubjectRecordsScoped | null => readSubjectRecordsScoped(raw);

const SAMPLE: Record<string, unknown> = { T: "text_value", D: "123.456789012345678901234567890123", I: 1_790_812_800_000 };
function rich(): Draft {
  const body = clone(BASE);
  const values: Draft = {};
  for (const [key, kind] of Object.entries(SCOPED_RECORD_FIELDS)) values[key] = SAMPLE[kind];
  body.records = [{ record_id: "rec_1", observed_at_ms: 1_790_812_800_000, values }];
  body.page.returned_count = 1;
  return body;
}
const RICH: Draft = rich();
const TOKEN = "kc1.double-k1.eyJkaXJlY3Rpb24iOiJhZnRlciJ9.RG91YmxlLU5PVC1BLVJFQUwtU0lHTkFUVVJF";

/* ═════════════════════════ L0 ═════════════════════════ */
describe("L0 · canonical, verbatim", () => {
  it("the canonical page is the synthetic lane and passes the published schema", () => {
    expect(canonical.lane).toBe("TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT");
    expect(violations(BASE)).toEqual([]);
    expect(violations(RICH)).toEqual([]);
    const broken = clone(BASE);
    broken.page.maximum_page_rows = 200;
    expect(violations(broken).length).toBeGreaterThan(0);
  });

  it("reads the retained-window statement as typed constants and the record as stated: an exact decimal, a 0 that is a value", () => {
    const read = pageOf(BASE)!;
    expect(read).toMatchObject({
      schemaVersion: SUBJECT_RECORDS_V2_SCHEMA, operationId: "executionAlphaFillsV1", environment: "paper", profileId: "profile_TEST_ONLY",
      resource: { kind: "alpha", id: "alpha_TEST_ONLY" }, authority: { visibility: "SCOPED", coverage: "AUTHORIZED_ONLY", policyRevision: "TEST_ONLY-policy" },
      state: "PARTIAL", reasonCode: "SCOPED_RETAINED_WINDOW_NOT_TOTAL_HISTORY",
      coverage: { retainedRowCount: 1, oldestObservedAtMs: 1_790_812_800_000, newestObservedAtMs: 1_790_812_800_000 },
      page: { limit: 200, maximumPageRows: 500, returnedCount: 1, hasMore: false, nextCursor: null },
    });
    const record = read.records[0]!;
    expect(record.recordId).toBe("fill_TEST_ONLY");
    expect(record.values.price).toEqual({ kind: "decimal", exact: "100.1234567890123456789" });
    expect(record.values.quantity).toEqual({ kind: "decimal", exact: "0" });
    expect(record.values.order_id).toBeUndefined();
  });

  it("the rich page: every record member round-trips exactly", () => {
    const record = pageOf(RICH)!.records[0]!;
    for (const [key, kind] of Object.entries(SCOPED_RECORD_FIELDS)) {
      expect(record.values[key], key).toEqual(kind === "T" ? { kind: "text", text: SAMPLE.T } : kind === "D" ? { kind: "decimal", exact: SAMPLE.D } : { kind: "integer", value: SAMPLE.I });
    }
  });

  it("the member table the reader holds is the schema's ScopedRecordFields, member by member and kind by kind", () => {
    const doc = loadSchema(OPENAPI) as Draft;
    const props = doc.components.schemas.ScopedRecordFields.properties as Draft;
    const kindOf = (prop: Draft): string => {
      const base = (prop.anyOf as Draft[]).find((a) => a.type !== "null")!;
      if (base.type === "integer") return "I";
      if (base.pattern?.startsWith("^[^\\u0000") && base.maxLength === 256) return "T";
      if (base.type === "string" && base.maxLength === 128) return "D";
      return `?${JSON.stringify(base)}`;
    };
    expect(doc.components.schemas.ScopedRecordFields.additionalProperties).toBe(false);
    expect(Object.fromEntries(Object.entries(props).map(([k, v]) => [k, kindOf(v as Draft)]))).toEqual(SCOPED_RECORD_FIELDS);
  });

  it("the dispatcher reads v2 as v2, v1 as v1, and never one under the other's reader", () => {
    const v1 = loadCanonical<{ cases: { name: string; value: Draft }[] }>("execution-subject-records.v1.synthetic.valid.json").cases;
    expect(readSubjectRecordsByVersion(BASE)).toMatchObject({ kind: "v2", schemaVersion: SUBJECT_RECORDS_V2_SCHEMA });
    for (const c of v1) {
      expect(readSubjectRecordsByVersion(c.value).kind, c.name).toBe("v1");
      expect(readSubjectRecordsByVersion({ ...clone(c.value), schema_version: SUBJECT_RECORDS_V2_SCHEMA }), c.name).toMatchObject({ kind: "unsupported", reason: "V2_MALFORMED" });
    }
    // A v2 page wearing the v1 label carries `read_scope` / `reason_code`, which the legacy schema has not: it is not read as v1.
    const relabelled = readSubjectRecordsByVersion({ ...clone(BASE), schema_version: "portal.execution.subject-records.v1" });
    expect(relabelled.kind).toBe("unsupported");
  });
});

/* ═════════════════════════ L1 ═════════════════════════ */
describe("L1 · state matrices (schema as oracle)", () => {
  const A = [
    dimension("operation", ["logical_operation_id"], ["executionAlphaOrdersV1", "executionAlphaFillsV1", "executionAccountOrdersV1", "executionAccountFillsV1"]),
    dimension("kind", ["resource", "kind"], ["alpha", "account"]),
    dimension("state", ["state"], ["EMPTY", "PARTIAL"]),
    dimension("has_more", ["page", "has_more"], [false, true]),
    dimension("cursor", ["page", "next_cursor"], [null, TOKEN, "a.b-c_d"]),
    dimension("limit", ["page", "limit"], [1, 200, 500]),
    dimension("book", ["environment"], ["paper", "sandbox", "live"]),
  ];
  it("A · operation x kind x state x has_more x cursor x limit x book: all schema-valid, all read, the cursor passed on whole and never split", () => {
    const states = cartesian(clone(BASE), A);
    console.info(describeCoverage("subjectScoped A", coverage(A, states)));
    expect(states.length).toBe(4 * 2 * 2 * 2 * 3 * 3 * 3);
    for (const s of states) {
      expect(violations(s.value), s.name).toEqual([]);
      const read = pageOf(s.value)!;
      expect(read, s.name).toMatchObject({ operationId: s.value.logical_operation_id, state: s.value.state, environment: s.value.environment });
      expect(read.page, s.name).toMatchObject({ hasMore: s.value.page.has_more, nextCursor: s.value.page.next_cursor, limit: s.value.page.limit });
    }
  });

  const MEMBERS = Object.entries(SCOPED_RECORD_FIELDS);
  const LEGAL: Record<string, unknown[]> = { T: ["x", "a".repeat(256), "ünïcode ✓"], D: ["0", "-1.5", "123456789012345678901234567890.123456789"], I: [0, 1_790_812_800_000] };
  const ILLEGAL: Record<string, unknown[]> = {
    T: ["", "a".repeat(257), "tab\there", 7, true, {}, []], D: [7, 1.5, "1e5", "01", "1.", ".5", "NaN", "a".repeat(129), {}], I: [-1, 1.5, "5", "", true, {}],
  };
  it(`B · ${MEMBERS.length} record members x legal values (null is absent): schema-valid and read exactly`, () => {
    for (const [key, kind] of MEMBERS) {
      for (const value of [...LEGAL[kind]!, null]) {
        const body = clone(RICH);
        body.records[0].values[key] = value;
        expect(violations(body), `${key}=${JSON.stringify(value)}`).toEqual([]);
        const read = pageOf(body);
        expect(read, `${key}=${JSON.stringify(value)}`).not.toBeNull();
        if (value === null) expect(read!.records[0]!.values[key]).toEqual({ kind: "absent" });
      }
    }
  });
  it(`B · ${MEMBERS.length} record members x illegal values: the oracle refuses and so does the reader`, () => {
    let checked = 0;
    for (const [key, kind] of MEMBERS) {
      for (const value of ILLEGAL[kind]!) {
        const body = clone(RICH);
        body.records[0].values[key] = value;
        if (violations(body).length === 0) continue;
        checked += 1;
        expect(pageOf(body), `${key}=${JSON.stringify(value)}`).toBeNull();
      }
    }
    expect(checked).toBeGreaterThan(200);
  });
  it("B · a member outside ScopedRecordFields is refused (a client order id, an order type, a fee, a liquidity word, a symbol)", () => {
    for (const key of ["client_order_id", "order_type", "commission", "liquidity_side", "symbol", "submitted_at", "trade_time", "execution_session_id", "venue_order_id"]) {
      const body = clone(RICH);
      body.records[0].values[key] = "x";
      expect(violations(body).length, key).toBeGreaterThan(0);
      expect(pageOf(body), key).toBeNull();
    }
  });

  it("C · the constants: each flipped member refuses the page, and the schema agrees", () => {
    const flips: [string[], unknown][] = [
      [["authority"], "PORTAL_PROJECTION"], [["source_authority"], "TRADING_SYSTEM"], [["history_semantics"], "AUTHORITATIVE_REPLAY"], [["reason_code"], "COMPLETE"],
      [["read_scope", "visibility"], "FULL"], [["read_scope", "coverage"], "ALL"], [["page", "maximum_page_rows"], 200], [["page", "limit"], 501], [["page", "limit"], 0],
      [["state"], "AVAILABLE"], [["state"], "AUTHORITATIVE_EMPTY"], [["logical_operation_id"], "executionPortfolioOrdersV1"], [["resource", "kind"], "portfolio"],
      [["environment"], "backtest"], [["page", "next_cursor"], "has space"], [["page", "next_cursor"], ""], [["page", "next_cursor"], "x".repeat(4097)],
    ];
    for (const [path, value] of flips) {
      const body = clone(RICH);
      setPath(body, path, value);
      expect(violations(body).length, path.join(".")).toBeGreaterThan(0);
      expect(pageOf(body), path.join(".")).toBeNull();
    }
  });
});

/* ═════════════════════════ L2 ═════════════════════════ */
describe("L2 · scale", () => {
  const BUDGET_500_MS = 400;
  const manyRecords = (count: number): Draft => {
    const body = clone(RICH);
    body.records = Array.from({ length: count }, (_, i) => ({ record_id: `rec_${i}`, observed_at_ms: 1_790_812_800_000 + i, values: clone(RICH.records[0].values) }));
    body.page.returned_count = Math.min(count, 500);
    return body;
  };
  it("500 records carrying every member read inside the budget, in order", () => {
    const body = manyRecords(500);
    expect(violations(body)).toEqual([]);
    const { value, ms } = timed(() => pageOf(body));
    console.info(`subjectScoped L2: 500 records ${ms.toFixed(0)} ms, ${(serializedBytes(body) / 1024).toFixed(0)} KiB`);
    expect(value!.records.map((r) => r.recordId)).toEqual(Array.from({ length: 500 }, (_, i) => `rec_${i}`));
    expect(ms).toBeLessThan(BUDGET_500_MS);
  });
  it("501 records are refused, as the schema refuses them", () => {
    const body = manyRecords(501);
    expect(violations(body).length).toBeGreaterThan(0);
    expect(pageOf(body)).toBeNull();
  });
});

/* ═════════════════════════ L3 ═════════════════════════ */
type Case = ReturnType<typeof enumCases>[number];
const V = ["records", 0, "values"] as const;
const ENUMS: Case[] = [
  ...enumCases(RICH, ["logical_operation_id"], ["executionAlphaOrdersV1", "executionAlphaFillsV1", "executionAccountOrdersV1", "executionAccountFillsV1"]),
  ...enumCases(RICH, ["environment"], ["paper", "sandbox", "live"]), ...enumCases(RICH, ["state"], ["EMPTY", "PARTIAL"]),
  ...enumCases(RICH, ["resource", "kind"], ["alpha", "account"]),
];
const INTEGERS: Case[] = [
  ...integerCases(RICH, ["coverage", "retained_row_count"]), ...integerCases(RICH, ["page", "returned_count"]), ...integerCases(RICH, ["page", "limit"]),
  ...integerCases(RICH, ["records", 0, "observed_at_ms"]), ...integerCases(RICH, [...V, "occurred_at_ms"]),
];
const DECIMALS: Case[] = [...decimalCases(RICH, [...V, "price"]), ...decimalCases(RICH, [...V, "quantity"]), ...decimalCases(RICH, [...V, "realized_pnl"])];
const STRINGS: Case[] = [...stringCases(RICH, ["profile_id"]), ...stringCases(RICH, ["resource", "id"]), ...stringCases(RICH, ["records", 0, "record_id"]), ...stringCases(RICH, [...V, "fill_id"]), ...stringCases(RICH, ["page", "next_cursor"])];
const ARRAYS: Case[] = [...arrayCases(RICH, ["records"], { idKey: "record_id" })];
const REQUIRED_PATHS = [
  ...["schema_version", "logical_operation_id", "authority", "source_authority", "history_semantics", "environment", "profile_id", "resource", "read_scope", "state", "reason_code", "coverage", "page", "records"].map((k) => [k] as const),
  ...["limit", "maximum_page_rows", "returned_count", "has_more", "next_cursor"].map((k) => ["page", k] as const),
  ...["retained_row_count", "oldest_observed_at_ms", "newest_observed_at_ms"].map((k) => ["coverage", k] as const),
  ...["visibility", "coverage", "policy_revision"].map((k) => ["read_scope", k] as const),
  ["resource", "kind"], ["resource", "id"], ["records", 0, "record_id"], ["records", 0, "observed_at_ms"], ["records", 0, "values"],
] as unknown as (readonly (string | number)[])[];
const REQUIRED: Case[] = requiredCases(RICH, REQUIRED_PATHS);
const SCHEMA_SWAP = schemaVersionCases(RICH, ["schema_version"], SUBJECT_RECORDS_V2_SCHEMA, ["portal.execution.subject-records.v1", "execution.alpha-resource.v2", "portal.execution.profile-read-adapter.v2"]);
const POLLUTION = pollutionCases(RICH, [[], ["resource"], ["read_scope"], ["coverage"], ["page"], ["records", 0], [...V]]);
const ALL_NEG: Case[] = [...ENUMS, ...INTEGERS, ...DECIMALS, ...STRINGS, ...ARRAYS, ...REQUIRED, ...SCHEMA_SWAP, ...POLLUTION];

describe("L3 · negative", () => {
  it("reports the case counts", () => {
    const by = new Map<string, number>();
    for (const c of ALL_NEG) by.set(c.category, (by.get(c.category) ?? 0) + 1);
    console.info(`subjectScoped L3: ${ALL_NEG.length} cases (${[...by.entries()].map(([k, v]) => `${k} ${v}`).join(", ")}), ${rootCases().length} root cases`);
    expect(ALL_NEG.length).toBeGreaterThan(300);
  });

  it.each(ALL_NEG.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    expect(() => pageOf(c.value)).not.toThrow();
    expect(() => readSubjectRecordsByVersion(c.value)).not.toThrow();
    const read = pageOf(c.value);
    expect(leaked(read, c.probe)).toBe(false);
    expect(prototypeIsClean()).toBe(true);
    if (read === null) {
      expect(readSubjectRecordsByVersion(c.value).kind, c.name).not.toBe("v2");
      return;
    }
    expect(violations(c.value), `accepted though schema-invalid: ${c.name}`).toEqual([]);
    if (c.category === "prototype-pollution") expect(read).toEqual(pageOf(RICH));
  });

  it("an unknown word is never a state: no enum case the schema refuses yields a read", () => {
    let refused = 0;
    for (const c of ENUMS) {
      if (violations(c.value).length === 0) continue;
      refused += 1;
      expect(pageOf(c.value), c.name).toBeNull();
    }
    expect(refused).toBeGreaterThan(50);
  });

  it.each(rootCases().map((c) => [c.name, c] as const))("%s reads as nothing", (_name, c) => {
    expect(() => pageOf(c.value)).not.toThrow();
    expect(pageOf(c.value)).toBeNull();
    expect(readSubjectRecordsByVersion(c.value).kind).not.toBe("v2");
  });

  it("a cursor is only spelled, never split: a token with dots reads back byte for byte", () => {
    const body = clone(RICH);
    body.page.has_more = true;
    body.page.next_cursor = TOKEN;
    expect(pageOf(body)!.page.nextCursor).toBe(TOKEN);
  });

  it("-0 is refused although the schema's decimal pattern allows it", () => {
    const body = clone(RICH);
    body.records[0].values.price = "-0";
    expect(violations(body)).toEqual([]);
    expect(pageOf(body)).toBeNull();
  });
});
