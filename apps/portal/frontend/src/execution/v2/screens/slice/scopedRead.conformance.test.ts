/**
 * Reader conformance for `scopedRead.ts` (Rules 9.8.3, tiers L0 to L3; UXM-08, FIXTURE ONLY).
 *
 * Contract: `packages/contracts/schemas/execution-manager-scoped.v1.schema.json`, `$defs/ManagerScopedResponse`; fixture
 * `execution-manager-scoped.synthetic` (TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT). Payloads are built from that fixture.
 *
 * L0  both cases validate against the schema and read; the digest of the file is unchanged at the end; no other family reads.
 * L1  matrix A: row availability x allocation figure x row environment x item count (the honesty rules of the slice);
 *     matrix P: page counts x has_more x cursors against the reader's page rules (SS-2), schema-valid states counted.
 * L2  100 rows, 2,000 instances in a row, 8,000 facts in a row, 200 totals, the 10,000-instance body bound, 70,000-character text.
 * L3  generated negatives over the envelope, a row and a fact set: every case refused or accepted only where the schema
 *     accepts; never throws; never leaks; never looser. Stricter on purpose, named: SS-1 totals are keyed by currency, SS-2 page
 *     consistency, SS-3 display safety, SS-4 a row once, SS-5 at most 10,000 instances, SS-6 a negative zero is not a value.
 */
import { afterAll, describe, expect, it } from "vitest";

import { canonicalDigest, listCanonical, loadCanonical } from "../../testkit/loadCanonical";
import { cartesian, coverage, describeCoverage, dimensionOf, getPath, type Draft } from "../../testkit/matrix";
import {
  arrayCases, decimalCases, enumCases, integerCases, leaked, pollutionCases, prototypeIsClean, requiredCases, rootCases, schemaVersionCases, stringCases,
} from "../../testkit/negative";
import { timed } from "../../testkit/scale";
import { validateAgainst } from "../../testkit/schema";
import { fleetRows } from "./model";
import {
  MANAGER_SCOPED_SCHEMA,
  MAX_SCOPED_FACTS_PER_ITEM,
  MAX_SCOPED_INSTANCES_PER_ITEM,
  MAX_SCOPED_INSTANCES_TOTAL,
  MAX_SCOPED_ITEMS,
  MAX_SCOPED_TOTALS_PER_ITEM,
  SCOPED_AVAILABILITY_REASONS,
  SCOPED_AVAILABILITY_STATES,
  readManagerScoped,
  type ScopedRead,
} from "./scopedRead";

const FILE = "execution-manager-scoped.synthetic";
const SCHEMA = "execution-manager-scoped.v1.schema.json";
const digestBefore = canonicalDigest(FILE);
afterAll(() => {
  expect(canonicalDigest(FILE)).toBe(digestBefore);
});

const violations = (value: unknown) => validateAgainst(SCHEMA, "/$defs/ManagerScopedResponse", value);
const fixture = loadCanonical<{ lane: string; cases: Draft[] }>(FILE);
const BASE = (): Draft => structuredClone(fixture.cases[0]);
const scopedOf = (raw: unknown): ScopedRead | null => {
  const read = readManagerScoped(raw);
  return read !== null && read.kind === "scoped" ? read.read : null;
};
const accepted = (raw: unknown): boolean => scopedOf(raw) !== null;

describe("L0 · canonical, verbatim", () => {
  it("is the synthetic lane", () => {
    expect(fixture.lane).toBe("TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT");
    expect(fixture.cases).toHaveLength(2);
  });

  it.each(fixture.cases.map((c, i) => [`case ${i} (${c.surface})`, c] as const))("%s validates and reads", (_name, c) => {
    expect(violations(c)).toEqual([]);
    expect(scopedOf(structuredClone(c))).not.toBeNull();
  });

  it("no other published family reads as a scoped read", () => {
    for (const file of listCanonical()) {
      if (file.startsWith("execution-manager-scoped")) continue;
      const doc = loadCanonical<Draft>(file);
      const candidates: unknown[] = [doc];
      if (Array.isArray(doc.cases)) candidates.push(...doc.cases);
      for (const candidate of candidates) expect(accepted(candidate), file).toBe(false);
    }
  });

  it("the schema version is the contract's", () => {
    expect(MANAGER_SCOPED_SCHEMA).toBe(fixture.cases[0]!.schema_version);
  });
});

describe("L1 · matrix A · availability x allocation x environment", () => {
  const FIGURES = { exact: { allocation: "100.1234567890123456789" }, zero: { allocation: "0" }, null: { allocation: null }, withheld: {} } as const;
  const DIMS = [
    dimensionOf("availability", SCOPED_AVAILABILITY_STATES.flatMap((state) => SCOPED_AVAILABILITY_REASONS.map((reason) => ({
      label: `${state}/${reason}`,
      apply: (d: Draft) => { d.items[0].financial_availability = { state, reason_code: reason }; },
    })))),
    dimensionOf("figure", Object.entries(FIGURES).map(([label, facts]) => ({
      label,
      apply: (d: Draft) => { d.items[0].financial_totals = [{ currency: "USD", ...facts }]; },
    }))),
    dimensionOf("environment", ["paper", "sandbox", "live"].map((env) => ({ label: env, apply: (d: Draft) => { d.items[0].environment = env; } }))),
  ];
  const states = cartesian(BASE(), DIMS);

  it("prints the matrix size", () => {
    console.info(describeCoverage("scoped read A cartesian", coverage(DIMS, states)));
    expect(states).toHaveLength(9 * 4 * 3);
  });

  it.each(states.map((s) => [s.name, s] as const))("%s", (_name, state) => {
    // The schema accepts every cell; so does the reader (the rules of the slice sit on top, in the model).
    expect(violations(state.value)).toEqual([]);
    const read = scopedOf(state.value);
    expect(read).not.toBeNull();
    const row = fleetRows(read!)[0]!;
    const [avail] = state.picks.availability!.split("/");
    const cell = row.allocation[0]!.metric;
    if (cell === null) throw new Error("metric");
    const hasFigure = state.picks.figure === "exact" || state.picks.figure === "zero";
    // A figure shows only when the row is not NOT_PUBLISHED; otherwise the absence carries the row's reason, never 0.
    if (hasFigure && avail !== "NOT_PUBLISHED") {
      expect(cell.kind).toBe("value");
      if (cell.kind === "value") {
        expect(cell.partial).toBe(avail === "PARTIAL");
        expect(cell.publishedZero).toBe(state.picks.figure === "zero");
        expect(cell.decimal.full).toBe(state.picks.figure === "zero" ? "0" : "100.1234567890123456789");
      }
    } else {
      expect(cell.kind).toBe("absent");
    }
    expect(row.environment).toBe(state.picks.environment);
  });
});

describe("L1 · matrix P · page counts and cursors (SS-2)", () => {
  const DIMS = [
    dimensionOf("returned", [0, 1, 2].map((n) => ({ label: String(n), apply: (d: Draft) => { d.page.returned_count = n; } }))),
    dimensionOf("visible", [0, 1, 2, 500].map((n) => ({ label: String(n), apply: (d: Draft) => { d.page.visible_count = n; } }))),
    dimensionOf("limit", [1, 50, 100].map((n) => ({ label: String(n), apply: (d: Draft) => { d.page.limit = n; } }))),
    dimensionOf("has_more", [true, false].map((v) => ({ label: String(v), apply: (d: Draft) => { d.page.has_more = v; } }))),
    dimensionOf("next_cursor", [null, "TEST_ONLY-next"].map((v) => ({ label: String(v), apply: (d: Draft) => { d.page.next_cursor = v; } }))),
  ];
  const states = cartesian(BASE(), DIMS);
  const rows = 1;
  const readerAccepts = (p: Record<string, string>) =>
    Number(p.returned) === rows && Number(p.returned) <= Number(p.limit) && Number(p.returned) <= Number(p.visible) && (p.has_more === "true") === (p.next_cursor !== "null");

  it("prints the matrix size", () => {
    expect(states).toHaveLength(3 * 4 * 3 * 2 * 2);
  });

  it.each(states.map((s) => [s.name, s] as const))("%s", (_name, state) => {
    expect(accepted(state.value)).toBe(readerAccepts(state.picks));
    // The schema alone accepts every one of these states (the page rules are the runtime's, not the schema's).
    expect(violations(state.value)).toEqual([]);
  });

  it("counts: the reader refuses these schema-valid states on purpose", () => {
    const refused = states.filter((s) => !readerAccepts(s.picks)).length;
    console.info(`scoped read P: ${states.length} states, schema accepts ${states.length}, reader refuses ${refused}`);
    expect(refused).toBeGreaterThan(0);
  });
});

describe("L2 · scale and bounds", () => {
  const withItems = (count: number): Draft => {
    const body = BASE();
    const template = body.items[0];
    body.items = Array.from({ length: count }, (_, i) => {
      const row = structuredClone(template);
      row.identity.alpha_id = `alpha_${String(i).padStart(4, "0")}`;
      return row;
    });
    body.page.returned_count = count;
    body.page.visible_count = count;
    body.page.limit = 100;
    return body;
  };

  it(`${MAX_SCOPED_ITEMS} rows read inside a generous budget; one more is refused`, () => {
    const body = withItems(MAX_SCOPED_ITEMS);
    expect(violations(body)).toEqual([]);
    const { value, ms } = timed(() => scopedOf(body));
    expect(value?.items).toHaveLength(MAX_SCOPED_ITEMS);
    expect(ms).toBeLessThan(3_000);
    const over = withItems(MAX_SCOPED_ITEMS + 1);
    expect(violations(over).length).toBeGreaterThan(0);
    expect(accepted(over)).toBe(false);
  });

  it("instances: 2,000 in a row read, 2,001 refused; five full rows exceed the body bound (SS-5)", () => {
    const instance = (i: number) => ({ deployment_id: `dep_${i}`, account_id: `acc_${i}` });
    const body = BASE();
    body.items[0].instances = Array.from({ length: MAX_SCOPED_INSTANCES_PER_ITEM }, (_, i) => instance(i));
    expect(violations(body)).toEqual([]);
    expect(accepted(body)).toBe(true);
    body.items[0].instances.push(instance(2_000));
    expect(accepted(body)).toBe(false);

    const wide = withItems(MAX_SCOPED_INSTANCES_TOTAL / MAX_SCOPED_INSTANCES_PER_ITEM + 1);
    for (const row of wide.items) row.instances = Array.from({ length: MAX_SCOPED_INSTANCES_PER_ITEM }, (_, i) => instance(i));
    expect(violations(wide)).toEqual([]);
    expect(accepted(wide)).toBe(false);
  });

  it("financial facts: 8,000 read, 8,001 refused; totals: 200 currencies read, 201 refused", () => {
    const fact = { kind: "ALLOCATION", facts: { currency: "USD", allocation: "1" } };
    const body = BASE();
    body.items[0].financial_facts = Array.from({ length: MAX_SCOPED_FACTS_PER_ITEM }, () => fact);
    expect(accepted(body)).toBe(true);
    body.items[0].financial_facts.push(fact);
    expect(accepted(body)).toBe(false);

    const totals = (n: number) => Array.from({ length: n }, (_, i) => ({ currency: `C${i}`, allocation: "1" }));
    const ok = BASE();
    ok.items[0].financial_totals = totals(MAX_SCOPED_TOTALS_PER_ITEM);
    expect(accepted(ok)).toBe(true);
    ok.items[0].financial_totals = totals(MAX_SCOPED_TOTALS_PER_ITEM + 1);
    expect(accepted(ok)).toBe(false);
  });

  it("70,000-character text is refused fast", () => {
    const big = BASE();
    big.items[0].identity.name = "n".repeat(70_000);
    const { ms } = timed(() => expect(accepted(big)).toBe(false));
    expect(ms).toBeLessThan(2_000);
  });
});

/* ═════════════════════════ L3 ═════════════════════════ */
interface Case { name: string; category: string; value: unknown; probe: string | null }
const enumsOf = (base: Draft, path: readonly (string | number)[], valid: readonly unknown[]): Case[] =>
  enumCases(base, path, valid.map(String)).filter((c) => !valid.includes(getPath(c.value, path)));

const base = BASE();
const NEGATIVES: Case[] = [
  ...enumsOf(base, ["surface"], ["ALPHA_FLEET", "PORTFOLIOS", "BINDINGS", "BINDING_DETAIL"]),
  ...enumsOf(base, ["environment"], ["all", "paper", "sandbox", "live"]),
  ...enumsOf(base, ["record_authority"], ["PORTAL_PROJECTION"]),
  ...enumsOf(base, ["source_authority"], ["TRADING_SYSTEM"]),
  ...enumsOf(base, ["completeness"], ["PARTIAL"]),
  ...enumsOf(base, ["reason_code"], ["RETAINED_CURRENT_PAGE_NOT_TOTAL_HISTORY"]),
  ...enumsOf(base, ["read_scope", "visibility"], ["SCOPED"]),
  ...enumsOf(base, ["read_scope", "coverage"], ["AUTHORIZED_ONLY"]),
  ...enumsOf(base, ["read_scope", "totals_scope"], ["VISIBLE_ROWS_ONLY"]),
  ...enumsOf(base, ["items", 0, "environment"], ["paper", "sandbox", "live"]),
  ...enumsOf(base, ["items", 0, "financial_availability", "state"], [...SCOPED_AVAILABILITY_STATES]),
  ...enumsOf(base, ["items", 0, "financial_availability", "reason_code"], [...SCOPED_AVAILABILITY_REASONS]),
  ...enumsOf(base, ["items", 0, "financial_facts", 0, "kind"], ["ALLOCATION", "INTERNAL_ACCOUNT_BALANCE", "POSITION_PNL"]),
  ...enumsOf(base, ["profile_dispositions", 0, "state"], ["PARTIAL", "DENIED", "UNAVAILABLE"]),
  ...requiredCases(base, [
    ...["schema_version", "surface", "workspace_id", "environment", "record_authority", "source_authority", "read_at_ms", "read_scope", "profile_dispositions", "completeness", "reason_code", "page", "items"].map((k) => [k] as const),
    ...["visibility", "coverage", "totals_scope", "policy_revisions"].map((k) => ["read_scope", k] as const),
    ...["visible_count", "returned_count", "limit", "maximum_response_bytes", "has_more", "next_cursor", "previous_cursor"].map((k) => ["page", k] as const),
    ...["environment", "identity", "instances", "financial_facts", "financial_totals", "is_full_resource", "financial_availability"].map((k) => ["items", 0, k] as const),
  ]),
  ...stringCases(base, ["workspace_id"]),
  ...stringCases(base, ["items", 0, "identity", "alpha_id"]),
  ...stringCases(base, ["items", 0, "identity", "name"]),
  ...stringCases(base, ["items", 0, "financial_totals", 0, "currency"]),
  ...decimalCases(base, ["items", 0, "financial_totals", 0, "allocation"]),
  ...decimalCases(base, ["items", 0, "financial_facts", 0, "facts", "allocation"]),
  ...integerCases(base, ["read_at_ms"]),
  ...integerCases(base, ["page", "visible_count"]),
  ...integerCases(base, ["page", "returned_count"]),
  ...integerCases(base, ["page", "limit"]),
  ...arrayCases(base, ["items"]),
  ...arrayCases(base, ["items", 0, "financial_totals"]),
  ...arrayCases(base, ["items", 0, "financial_facts"]),
  ...arrayCases(base, ["profile_dispositions"]),
  ...arrayCases(base, ["read_scope", "policy_revisions"]),
  ...schemaVersionCases(base, ["schema_version"], MANAGER_SCOPED_SCHEMA, ["portal.execution.manager-dataset.v1", "portal.execution.manager-scoped.v2"]),
  ...pollutionCases(base, [[], ["read_scope"], ["page"], ["items", 0], ["items", 0, "identity"], ["items", 0, "financial_availability"]]),
];

describe("L3 · negative", () => {
  it("reports the case counts", () => {
    const by = new Map<string, number>();
    for (const c of NEGATIVES) by.set(c.category, (by.get(c.category) ?? 0) + 1);
    console.info(`scoped read L3: ${NEGATIVES.length} cases (${[...by.entries()].map(([k, v]) => `${k} ${v}`).join(", ")})`);
    expect(NEGATIVES.length).toBeGreaterThan(350);
  });

  it.each(NEGATIVES.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    expect(() => readManagerScoped(c.value)).not.toThrow();
    const answer = readManagerScoped(c.value);
    expect(leaked(answer, c.probe)).toBe(false);
    expect(prototypeIsClean()).toBe(true);
    const ok = answer !== null && answer.kind === "scoped";
    if (answer !== null && !ok) expect(getPath(c.value, ["schema_version"])).not.toBe(MANAGER_SCOPED_SCHEMA);
    if (ok) expect(violations(c.value), `accepted though schema-invalid: ${c.name}`).toEqual([]);
  });

  it("prints how much stricter the reader is than the schema (never looser)", () => {
    let invalid = 0;
    let looser = 0;
    const stricter: Case[] = [];
    for (const c of NEGATIVES) {
      if (c.category === "prototype-pollution" || c.category === "schema-swapped") continue;
      const bad = violations(c.value).length > 0;
      const ok = accepted(c.value);
      if (bad) invalid += 1;
      if (bad && ok) looser += 1;
      if (!bad && !ok) stricter.push(c);
    }
    console.info(`scoped read L3: reader accepts ${looser} of ${invalid} schema-invalid payloads; refuses ${stricter.length} schema-valid ones`);
    expect(looser).toBe(0);
    expect(invalid).toBeGreaterThan(250);
    // Every schema-valid payload refused belongs to a named group: SS-3 (blank or unsafe text; NUL where the schema has no pattern),
    // SS-1 (totals), SS-2 (page counts that disagree with the rows), SS-6 (negative zero).
    for (const c of stricter) expect(c.name, c.name).toMatch(/huge-string|negative-zero|page\.(returned_count|visible_count|limit)|financial_totals|items <-/);
  });

  it.each(rootCases().map((c) => [c.name, c] as const))("%s reads as nothing", (_name, c) => {
    expect(() => readManagerScoped(c.value)).not.toThrow();
    expect(readManagerScoped(c.value)).toBeNull();
  });
});
