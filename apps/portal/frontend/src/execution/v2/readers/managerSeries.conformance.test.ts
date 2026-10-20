/**
 * Reader conformance for `managerSeries.ts` (Rules 9.8.3, tiers L0 to L3). Lane: FIXTURE_LAB (a fixture is never a source
 * acceptance). Contract: `packages/contracts/schemas/execution-manager-series.v1.schema.json` (also
 * `openapi/execution-manager-series.openapi.json`, `ManagerSeries`); fixtures `execution-manager-series.{populated,empty,
 * unavailable,currency-mixed}.synthetic`. Every payload is built from those fixtures (`managerSeries.testbase.ts`), the
 * published schema is the oracle (testkit `validateAgainst`).
 *
 * L0  the four fixtures verbatim: they validate against the published schema AND are read; digests unchanged at the end.
 * L1  state matrices:
 *       S  one entry: state x reason_code x points x described-or-bare (reader accepts iff the schema does)
 *       C  two subjects: currency x partition x basis x methodology x second subject's state (the comparison is re-derived;
 *          a body whose comparison lies is refused: schema-valid, reader-refused, counted)
 *       M  metric x unit x currency (the unit follows the metric)
 * L2  4 subjects x 2000 points (the union axis is 8000 timestamps), 256 gaps, the bounds (2001 points, 5 subjects)
 * L3  generated negatives over the populated fixture: never throws, never leaks a probe, the reader NEVER accepts what the
 *     schema refuses, and where it is stricter than the schema it is in a named, counted group:
 *       MS-S1 display safety of every text (whitespace-only, bidi, zero-width, C1)
 *       MS-S2 negative zero is not a decimal value
 *       MS-S3/MS-S4 a window is not empty or backwards; points are strictly ascending and inside the window; gaps are ordered
 *       MS-S5 an entry carries the selected, resolved window and does not end after the cutoff
 *       MS-S6 the unit follows the metric; MONEY is in the partition's currency; the basis is the partition's
 *       MS-S7 a subject appears once; an unpublished source allows only five reasons
 *       MS-S8 ALL is a gap: no points for it; window reasons agree with the request
 *       MS-S9 comparison equals the value re-derived from the entries
 *       MS-S10 clocks stay inside the Date range
 */
import { afterAll, describe, expect, it } from "vitest";

import { loadCanonical } from "../testkit/loadCanonical";
import { cartesian, coverage, describeCoverage, dimension, dimensionOf, getPath, setPath } from "../testkit/matrix";
import {
  arrayCases, decimalCases, enumCases, integerCases, leaked, pollutionCases, prototypeIsClean, requiredCases, rootCases, schemaVersionCases, stringCases,
} from "../testkit/negative";
import { fillToBytes, MIB, pad, serializedBytes, timed } from "../testkit/scale";
import {
  COMPARISON_MISMATCH_REASONS,
  COMPARISON_STATES,
  MANAGER_SERIES_METRICS,
  MANAGER_SERIES_SCHEMA,
  MAX_AXIS_POINTS,
  MAX_SERIES_GAPS,
  MAX_SERIES_POINTS,
  MAX_SERIES_SUBJECTS,
  SERIES_EMPTY_REASON,
  SERIES_GAP_REASONS,
  SERIES_STATES,
  SERIES_UNAVAILABLE_REASONS,
  readManagerSeries,
  type ManagerSeries,
} from "./managerSeries";
import {
  clone,
  DAY,
  type Draft,
  FIXTURE_EMPTY,
  FIXTURE_MIXED,
  FIXTURE_POPULATED,
  FIXTURE_UNAVAILABLE,
  fixtureValue,
  fixturesDigest,
  SERIES_FIXTURES,
  seriesViolations,
  unavailableEntry,
  withComparison,
} from "./managerSeries.testbase";
import { MANAGER_SOURCE_CONFIDENCE } from "./managerMetric";

const BUDGET_MAX_BODY_MS = 1500;

const digestBefore = fixturesDigest();
afterAll(() => {
  expect(fixturesDigest()).toBe(digestBefore);
});

function seriesOf(raw: unknown): ManagerSeries | null {
  const read = readManagerSeries(raw);
  return read !== null && read.kind === "series" ? read.series : null;
}
const judge = (value: unknown) => ({ invalid: seriesViolations(value).length > 0, accepted: seriesOf(value) !== null });
const POPULATED: Draft = fixtureValue(FIXTURE_POPULATED);

/* ═════════════════════════ L0 ═════════════════════════ */
describe("L0 · canonical, verbatim", () => {
  it("the four series fixtures are the synthetic lane, validate against the published schema, and are read", () => {
    for (const name of SERIES_FIXTURES) {
      const file = loadCanonical<{ lane: string; value: Draft }>(name);
      expect(file.lane, name).toMatch(/TEST_ONLY/);
      expect(file.value.schema_version, name).toBe(MANAGER_SERIES_SCHEMA);
      expect(seriesViolations(file.value), name).toEqual([]);
      expect(seriesOf(file.value), name).not.toBeNull();
    }
  });

  it("the fixtures cover every state and four of the comparison states", () => {
    const reads = SERIES_FIXTURES.map((name) => seriesOf(fixtureValue(name))!);
    expect(new Set(reads.flatMap((r) => r.series.map((e) => e.state)))).toEqual(new Set(SERIES_STATES));
    expect(reads.map((r) => r.comparison.state)).toEqual(["ALIGNED", "SINGLE_SUBJECT", "UNAVAILABLE", "INCOMPARABLE"]);
    expect(new Set(reads.map((r) => r.comparison.state))).toEqual(new Set(COMPARISON_STATES));
  });

  it("the closed words the reader holds are the ones the schema publishes", () => {
    const schema = loadCanonical<Draft>("../schemas/execution-manager-series.v1.schema.json");
    const entry = schema.properties.series.items.properties;
    const words = (node: Draft): string[] => (node.enum ?? node.anyOf?.flatMap(words) ?? []) as string[];
    expect([...words(entry.state)]).toEqual([...SERIES_STATES]);
    expect(words(entry.reason_code)).toEqual([...SERIES_UNAVAILABLE_REASONS, SERIES_EMPTY_REASON]);
    expect(words(entry.gaps.items.properties.reason)).toEqual([...SERIES_GAP_REASONS]);
    expect(words(entry.source_confidence)).toEqual([...MANAGER_SOURCE_CONFIDENCE]);
    expect(words(schema.properties.metric)).toEqual([...MANAGER_SERIES_METRICS]);
    expect(words(schema.properties.comparison.properties.state)).toEqual([...COMPARISON_STATES]);
    expect(words(schema.properties.comparison.properties.reason_code)).toEqual([...COMPARISON_MISMATCH_REASONS, "SUBJECT_SERIES_UNAVAILABLE"]);
    expect(entry.points.maxItems).toBe(MAX_SERIES_POINTS);
    expect(entry.gaps.maxItems).toBe(MAX_SERIES_GAPS);
    expect(schema.properties.series.maxItems).toBe(MAX_SERIES_SUBJECTS);
    expect(schema.properties.comparison.properties.axis_ms.anyOf[0].maxItems).toBe(MAX_AXIS_POINTS);
  });
});

/* ═════════════════════════ L1 ═════════════════════════ */
describe("L1 · matrix S · one entry: state x reason x points x described", () => {
  const STATES = ["AVAILABLE", "EMPTY", "UNAVAILABLE"] as const;
  const REASONS = [null, SERIES_EMPTY_REASON, "SOURCE_NOT_QUALIFIED"] as const;
  const base = ((): Draft => {
    const body = fixtureValue(FIXTURE_POPULATED);
    body.series = [body.series[0]];
    return body;
  })();
  const described = clone(base.series[0]);
  const bare = unavailableEntry(base.series[0].subject);
  const DIMS = [
    dimensionOf("state", STATES.map((label) => ({ label, apply: (d: Draft) => { d.series[0].state = label; } }))),
    dimensionOf("reason", REASONS.map((label) => ({ label: String(label), apply: (d: Draft) => { d.series[0].reason_code = label; } }))),
    dimensionOf("points", [0, 3].map((n) => ({ label: String(n), apply: (d: Draft) => { d.series[0].points = clone(described.points).slice(0, n); } }))),
    dimensionOf("described", ["described", "bare"].map((label) => ({
      label,
      apply: (d: Draft) => {
        const keep = { state: d.series[0].state, reason_code: d.series[0].reason_code, points: d.series[0].points };
        d.series[0] = label === "described" ? { ...clone(described), ...keep } : { ...clone(bare), state: keep.state, reason_code: keep.reason_code, points: keep.points };
        d.comparison = { state: "SINGLE_SUBJECT", reason_code: null, transform: "NONE_NO_REBASE_NO_CROSS_CURRENCY_SUM", axis_ms: null, common: label === "described" ? clone(POPULATED.comparison.common) : null };
      },
    }))),
  ];
  const states = cartesian(base, DIMS);
  const accept = (p: Record<string, string>) =>
    (p.state === "UNAVAILABLE" && p.reason === "SOURCE_NOT_QUALIFIED" && p.described === "bare" && p.points === "0")
    || (p.state === "AVAILABLE" && p.reason === "null" && p.described === "described" && p.points === "3")
    || (p.state === "EMPTY" && p.reason === SERIES_EMPTY_REASON && p.described === "described" && p.points === "0");

  it("prints the matrix size", () => {
    console.info(describeCoverage("series S (entry state) cartesian", coverage(DIMS, states)));
    expect(states).toHaveLength(3 * 3 * 2 * 2);
    expect(states.filter((s) => accept(s.picks))).toHaveLength(3);
  });

  it.each(states.map((s) => [s.name, s] as const))("%s", (_name, state) => {
    expect(seriesOf(state.value) !== null).toBe(accept(state.picks));
    // Reader and schema agree exactly on the entry states.
    expect(seriesViolations(state.value).length === 0).toBe(accept(state.picks));
  });
});

describe("L1 · matrix C · two subjects: currency x partition x basis x methodology x the second subject's state (comparison re-derived)", () => {
  const YN = ["same", "different"] as const;
  const B_STATE = ["AVAILABLE", "EMPTY", "UNAVAILABLE"] as const;
  const DIMS = [
    dimensionOf("currency", YN.map((label) => ({ label, apply: (d: Draft) => { d.c = label; } }))),
    dimensionOf("partition", YN.map((label) => ({ label, apply: (d: Draft) => { d.p = label; } }))),
    dimensionOf("basis", YN.map((label) => ({ label, apply: (d: Draft) => { d.b = label; } }))),
    dimensionOf("methodology", YN.map((label) => ({ label, apply: (d: Draft) => { d.m = label; } }))),
    dimensionOf("second", B_STATE.map((label) => ({ label, apply: (d: Draft) => { d.s = label; } }))),
  ];
  const build = (spec: Draft): Draft => {
    const body = fixtureValue(FIXTURE_POPULATED);
    const b = body.series[1];
    if (spec.c === "different") { b.currency = "VND"; b.partition.currency = "VND"; }
    if (spec.p === "different") b.partition.native_profile_ref = "TEST_ONLY:other-ledger";
    if (spec.b === "different") { b.basis = "TEST_ONLY:other-basis"; b.partition.basis = "TEST_ONLY:other-basis"; }
    if (spec.m === "different") b.methodology_ref = "TEST_ONLY:other-method";
    if (spec.s === "EMPTY") Object.assign(b, { state: "EMPTY", reason_code: SERIES_EMPTY_REASON, points: [], gaps: [] });
    if (spec.s === "UNAVAILABLE") body.series[1] = unavailableEntry(b.subject);
    return withComparison(body);
  };
  const states = cartesian({} as Draft, DIMS).map((s) => ({ ...s, value: build(s.value) }));
  /** The expected comparison, written from the contract text (precedence: currency, partition, basis, methodology; then availability). */
  const expectedState = (p: Record<string, string>): [string, string | null] => {
    if (p.second !== "UNAVAILABLE") {
      if (p.currency === "different") return ["INCOMPARABLE", "CURRENCY_MIXED"];
      if (p.partition === "different") return ["INCOMPARABLE", "ECONOMIC_PARTITION_MIXED"];
      if (p.basis === "different") return ["INCOMPARABLE", "BASIS_MIXED"];
      if (p.methodology === "different") return ["INCOMPARABLE", "METHODOLOGY_MIXED"];
    }
    return p.second === "AVAILABLE" ? ["ALIGNED", null] : ["UNAVAILABLE", "SUBJECT_SERIES_UNAVAILABLE"];
  };

  it("prints the matrix size", () => {
    console.info(describeCoverage("series C (comparison) cartesian", coverage(DIMS, states)));
    expect(states).toHaveLength(2 * 2 * 2 * 2 * 3);
  });

  it.each(states.map((s) => [s.name, s] as const))("%s", (_name, state) => {
    const read = seriesOf(state.value);
    expect(seriesViolations(state.value)).toEqual([]);
    expect(read).not.toBeNull();
    const [want, reason] = expectedState(state.picks);
    expect([read!.comparison.state, read!.comparison.reasonCode]).toEqual([want, reason]);
    if (read!.comparison.state === "ALIGNED") {
      const union = new Set(read!.series.flatMap((e) => (e.state === "UNAVAILABLE" ? [] : e.points.map((p) => p.tsMs))));
      expect(read!.comparison.axisMs).toEqual([...union].sort((a, b) => a - b));
    } else {
      // No axis and no common unless the answer is ALIGNED: nothing to draw together.
      expect(read!.comparison.axisMs).toBeNull();
    }
    if (read!.comparison.state === "INCOMPARABLE") expect(read!.comparison.common).toBeNull();
  });

  it("a comparison that is not the derived one is refused, for every state (schema-valid, reader-refused: MS-S9)", () => {
    let lies = 0;
    for (const state of states) {
      for (const other of states) {
        if (other === state || JSON.stringify(other.value.comparison) === JSON.stringify(state.value.comparison)) continue;
        const body = clone(state.value);
        body.comparison = clone(other.value.comparison);
        lies += 1;
        expect(seriesOf(body), `${state.name} <- comparison of ${other.name}`).toBeNull();
      }
    }
    console.info(`series C: ${lies} lying comparisons, every one refused`);
    expect(lies).toBeGreaterThan(1000);
  });

  it("how many lying comparisons the schema alone would let through (why the reader re-derives)", () => {
    const sample = states.filter((s) => expectedState(s.picks)[0] === "INCOMPARABLE").slice(0, 8);
    let schemaValid = 0;
    for (const s of sample) {
      const body = clone(s.value);
      Object.assign(body.comparison, { state: "ALIGNED", reason_code: null, common: clone(POPULATED.comparison.common), axis_ms: clone(POPULATED.comparison.axis_ms) });
      if (seriesViolations(body).length === 0) schemaValid += 1;
      expect(seriesOf(body)).toBeNull();
    }
    // The schema checks the SHAPE of an ALIGNED answer, not that the entries agree: every one of these is schema-valid.
    expect(schemaValid).toBe(sample.length);
  });
});

describe("L1 · matrix M · metric x unit x currency (the unit follows the metric)", () => {
  const DIMS = [
    dimension("metric", ["metric"], [...MANAGER_SERIES_METRICS]),
    dimensionOf("unit", [["MONEY/USDT", "MONEY", "USDT"], ["MONEY/null", "MONEY", null], ["RATIO/null", "RATIO", null], ["RATIO/USDT", "RATIO", "USDT"]].map(([label, unit, currency]) => ({
      label: label as string,
      apply: (d: Draft) => { for (const e of d.series) { e.unit = unit; e.currency = currency; } },
    }))),
  ];
  const states = cartesian(POPULATED, DIMS).map((s) => ({ ...s, value: withComparison(s.value) }));
  const accept = (p: Record<string, string>) => (p.metric === "RETURN" ? p.unit === "RATIO/null" : p.unit === "MONEY/USDT");
  it("prints the matrix size", () => {
    expect(states).toHaveLength(3 * 4);
  });
  it.each(states.map((s) => [s.name, s] as const))("%s", (_name, state) => {
    expect(seriesOf(state.value) !== null).toBe(accept(state.picks));
    // The schema pairs MONEY with a currency and RATIO with none, whatever the metric: the metric rule is the reader's (MS-S6).
    const schemaAccepts = state.picks.unit === "MONEY/USDT" || state.picks.unit === "RATIO/null";
    expect(seriesViolations(state.value).length === 0).toBe(schemaAccepts);
  });
});

describe("L1 · selected window x series source x entries", () => {
  const WINDOWS: Record<string, Draft> = {
    "7D": { requested: "7D" }, "30D": { requested: "30D" }, "90D": { requested: "90D" },
    custom: { requested: { from_ms: POPULATED.selected_window.resolved.from_ms, to_ms: POPULATED.selected_window.resolved.to_ms } },
  };
  it("a window preset or a custom window reads as a window with its bounds; ALL is a gap", () => {
    for (const [label, patch] of Object.entries(WINDOWS)) {
      const body = clone(POPULATED);
      Object.assign(body.selected_window, patch);
      expect(seriesViolations(body), label).toEqual([]);
      expect(seriesOf(body)!.selectedWindow, label).toMatchObject({ kind: "window", resolved: { fromMs: POPULATED.selected_window.resolved.from_ms } });
    }
    const all = fixtureValue(FIXTURE_UNAVAILABLE);
    all.selected_window = { requested: "ALL", resolved: null, selection_basis: "EXACT_PUBLISHED_METRIC_WINDOW_ONLY", reason_code: "ALL_HISTORY_WINDOW_NOT_PUBLISHED" };
    for (const e of all.series) { e.reason_code = "ALL_HISTORY_WINDOW_NOT_PUBLISHED"; e.quality.reasons = ["ALL_HISTORY_WINDOW_NOT_PUBLISHED"]; }
    expect(seriesViolations(all)).toEqual([]);
    expect(seriesOf(all)!.selectedWindow).toEqual({ kind: "gap", requested: "ALL", reasonCode: "ALL_HISTORY_WINDOW_NOT_PUBLISHED" });
  });
});

/* ═════════════════════════ L2 ═════════════════════════ */
describe("L2 · scale", () => {
  const w = POPULATED.selected_window.resolved as { from_ms: number; to_ms: number };
  const entryWith = (index: number, points: number, gaps = 0): Draft => {
    const e = clone(POPULATED.series[0]);
    e.subject = { subject_type: "PORTFOLIO", subject_id: `TEST_ONLY:portfolio-${pad(index, 2)}` };
    // Subjects interleave their timestamps so the union axis is the sum of their points.
    e.points = Array.from({ length: points }, (_, i) => ({ ts_ms: w.from_ms + i * MAX_SERIES_SUBJECTS + index, value: `${100000 + i}.${pad(i, 8)}` }));
    e.gaps = Array.from({ length: gaps }, (_, i) => ({ from_ms: w.from_ms + 10_000 + i * 20, to_ms: w.from_ms + 10_000 + i * 20 + 5, reason: "SOURCE_GAP" }));
    return e;
  };
  const bodyOf = (subjects: number, points: number, gaps = 0): Draft => {
    const body = clone(POPULATED);
    body.series = Array.from({ length: subjects }, (_, i) => entryWith(i, points, gaps));
    return withComparison(body);
  };

  it("4 subjects x 2000 points read, the 8000-timestamp axis is the union, inside the budget; the body is schema-valid", () => {
    const body = bodyOf(MAX_SERIES_SUBJECTS, MAX_SERIES_POINTS, MAX_SERIES_GAPS);
    expect(seriesViolations(body)).toEqual([]);
    const { value, ms } = timed(() => seriesOf(body));
    console.info(`series 4 x 2000 points + 256 gaps (${(serializedBytes(body) / MIB).toFixed(2)} MiB): ${ms.toFixed(0)} ms (budget ${BUDGET_MAX_BODY_MS} ms)`);
    expect(value!.comparison.state).toBe("ALIGNED");
    expect(value!.comparison.axisMs).toHaveLength(MAX_AXIS_POINTS);
    expect(value!.series.every((e) => e.state === "AVAILABLE" && e.points.length === MAX_SERIES_POINTS && e.gaps.length === MAX_SERIES_GAPS)).toBe(true);
    expect(ms).toBeLessThan(BUDGET_MAX_BODY_MS);
  });

  it("the bounds: 2001 points, 257 gaps, 5 subjects and an axis of 8001 are refused by the schema and the reader", () => {
    const tooMany = bodyOf(1, MAX_SERIES_POINTS + 1);
    expect(seriesViolations(tooMany).join()).toMatch(/points: more than 2000 items/);
    expect(seriesOf(tooMany)).toBeNull();
    const gaps = bodyOf(1, 3, MAX_SERIES_GAPS + 1);
    expect(seriesViolations(gaps).join()).toMatch(/gaps: more than 256 items/);
    expect(seriesOf(gaps)).toBeNull();
    const five = bodyOf(5, 3);
    expect(seriesViolations(five).join()).toMatch(/series: more than 4 items/);
    expect(seriesOf(five)).toBeNull();
    const axis = bodyOf(MAX_SERIES_SUBJECTS, MAX_SERIES_POINTS);
    axis.comparison.axis_ms.push(axis.comparison.axis_ms.at(-1) + 1);
    expect(seriesViolations(axis).join()).toMatch(/axis_ms: (more than 8000 items|matched no anyOf branch)/);
    expect(seriesOf(axis)).toBeNull();
  });

  it("a very fat body (provenance and reasons at their maxima) reads inside the budget", () => {
    const fat = (factor: number): Draft => {
      const body = bodyOf(Math.min(factor, MAX_SERIES_SUBJECTS), 200);
      for (const e of body.series) {
        e.provenance_refs = Array.from({ length: 32 }, (_, i) => `TEST_ONLY:source-receipt-${pad(i, 3)}-${"x".repeat(60)}`);
        e.quality.reasons = Array.from({ length: 32 }, (_, i) => `TEST_ONLY:reason-${pad(i, 3)}-${"y".repeat(60)}`);
      }
      return body;
    };
    const { value: body } = fillToBytes(fat, 16 * 1024, MAX_SERIES_SUBJECTS);
    const { value, ms } = timed(() => seriesOf(body));
    expect(value).not.toBeNull();
    expect(ms).toBeLessThan(BUDGET_MAX_BODY_MS);
    expect(seriesViolations(body)).toEqual([]);
  });

  it("a 70,000 character text anywhere is refused fast, not scanned", () => {
    for (const path of [["workspace_id"], ["series", 0, "subject", "subject_id"], ["series", 0, "methodology_ref"], ["series", 0, "basis"], ["series", 0, "partition", "currency"], ["series", 0, "points", 0, "value"], ["lineage", "revision"], ["quality", "reasons", 0], ["series", 0, "provenance_refs", 0]] as const) {
      const body = clone(POPULATED);
      if (path[path.length - 2] === "reasons") body.quality.reasons = ["x"];
      setPath(body, path, path[path.length - 1] === "value" ? "9".repeat(70_000) : "a".repeat(70_000));
      const { value, ms } = timed(() => readManagerSeries(body));
      expect(value, path.join(".")).toBeNull();
      expect(ms, path.join(".")).toBeLessThan(100);
    }
  });
});

/* ═════════════════════════ L3 ═════════════════════════ */
interface Case { name: string; category: string; value: unknown; probe: string | null }

/** The negatives' base: two subjects, a gap, every optional-looking field set, so a path exists to be broken. */
const NEG: Draft = clone(POPULATED);

describe("L3 · the negative base", () => {
  it("is schema-valid and read, so every failure below comes from the one mutation", () => {
    expect(seriesViolations(NEG)).toEqual([]);
    expect(seriesOf(NEG)).not.toBeNull();
  });
});

const E0 = ["series", 0] as const;
const E1 = ["series", 1] as const;
const DECIMALS: Case[] = [
  ...decimalCases(NEG, [...E0, "points", 0, "value"]),
  ...decimalCases(NEG, [...E1, "points", 2, "value"]),
];
/** enumCases lower-cases the first valid word; where that is already the word the case is the base, not a negative. */
const enumsOf = (path: readonly (string | number)[], valid: readonly string[]): Case[] =>
  enumCases(NEG, path, valid).filter((c) => !valid.includes(getPath(c.value, path) as string));
const ENUMS: Case[] = [
  ...enumsOf(["environment"], ["paper", "sandbox", "live"]),
  ...enumsOf(["metric"], MANAGER_SERIES_METRICS),
  ...enumsOf([...E0, "state"], SERIES_STATES),
  ...enumsOf([...E0, "subject", "subject_type"], ["FUND", "PORTFOLIO"]),
  ...enumsOf([...E0, "unit"], ["MONEY", "RATIO"]),
  ...enumsOf([...E0, "partition", "economic_domain"], ["ACTUAL", "PAPER", "SANDBOX"]),
  ...enumsOf([...E0, "source_confidence"], MANAGER_SOURCE_CONFIDENCE),
  ...enumsOf([...E0, "quality", "completeness"], ["COMPLETE", "PARTIAL", "UNRESOLVED"]),
  ...enumsOf([...E0, "quality", "freshness"], ["FRESH", "STALE", "UNKNOWN"]),
  ...enumsOf([...E1, "gaps", 0, "reason"], SERIES_GAP_REASONS),
  ...enumsOf(["series_source", "state"], ["PUBLISHED", "NOT_PUBLISHED"]),
  ...enumsOf(["selected_window", "requested"], ["7D", "30D", "90D", "ALL"]),
  ...enumsOf(["comparison", "state"], COMPARISON_STATES),
  ...enumsOf(["comparison", "common", "economic_domain"], ["ACTUAL", "PAPER", "SANDBOX"]),
  ...enumsOf(["comparison", "common", "unit"], ["MONEY", "RATIO"]),
];
const INTEGERS: Case[] = [
  ...integerCases(NEG, ["as_of_ms"]),
  ...integerCases(NEG, ["recorded_through_ms"]),
  ...integerCases(NEG, [...E0, "points", 0, "ts_ms"]),
  ...integerCases(NEG, [...E0, "window", "from_ms"]),
  ...integerCases(NEG, [...E1, "gaps", 0, "from_ms"]),
  ...integerCases(NEG, ["selected_window", "resolved", "to_ms"]),
  ...integerCases(NEG, ["comparison", "axis_ms", 0]),
  ...integerCases(NEG, ["comparison", "common", "window", "from_ms"]),
];
const STRINGS: Case[] = [
  ...stringCases(NEG, ["workspace_id"]),
  ...stringCases(NEG, [...E0, "subject", "subject_id"]),
  ...stringCases(NEG, [...E0, "currency"]),
  ...stringCases(NEG, [...E0, "basis"]),
  ...stringCases(NEG, [...E0, "methodology_ref"]),
  ...stringCases(NEG, [...E0, "partition", "currency"]),
  ...stringCases(NEG, [...E0, "partition", "native_profile_ref"]),
  ...stringCases(NEG, [...E0, "partition", "domain_proof_ref"]),
  ...stringCases(NEG, [...E0, "provenance_refs", 0]),
  ...stringCases(NEG, [...E0, "calculation_revision"]),
  ...stringCases(NEG, [...E0, "policy_revision"]),
  ...stringCases(NEG, ["lineage", "source_set_ref"]),
  ...stringCases(NEG, ["lineage", "revision"]),
  ...stringCases(NEG, ["comparison", "common", "currency"]),
  ...stringCases(NEG, ["comparison", "common", "methodology_ref"]),
];
const ARRAYS: Case[] = [
  ...arrayCases(NEG, ["series"], { idKey: "subject" }),
  ...arrayCases(NEG, [...E0, "points"]),
  ...arrayCases(NEG, [...E1, "gaps"]),
  ...arrayCases(NEG, [...E0, "provenance_refs"]),
  ...arrayCases(NEG, [...E0, "quality", "reasons"]),
  ...arrayCases(NEG, ["quality", "reasons"]),
  ...arrayCases(NEG, ["comparison", "axis_ms"]),
];
const REQUIRED: Case[] = requiredCases(NEG, [
  ...["schema_version", "workspace_id", "environment", "record_authority", "source_authority", "metric", "selected_window", "series_source", "as_of_ms", "recorded_through_ms",
    "quality", "series", "comparison", "lineage"].map((k) => [k] as const),
  ["selected_window", "requested"], ["selected_window", "resolved"], ["selected_window", "selection_basis"], ["selected_window", "reason_code"],
  ["series_source", "state"], ["series_source", "reason_code"], ["quality", "reasons"],
  ["comparison", "state"], ["comparison", "reason_code"], ["comparison", "transform"], ["comparison", "common"], ["comparison", "axis_ms"], ["comparison", "common", "window"],
  ["lineage", "reducer_revision"], ["lineage", "source_set_ref"],
  ...["subject", "state", "reason_code", "partition", "unit", "currency", "basis", "methodology_ref", "window", "points", "gaps", "quality", "source_confidence", "provenance_refs",
    "calculation_revision", "policy_revision"].map((k) => [...E0, k] as const),
  [...E0, "partition", "domain_proof_ref"], [...E0, "points", 0, "value"], [...E1, "gaps", 0, "reason"],
]);
const SCHEMA_SWAP = schemaVersionCases(NEG, ["schema_version"], MANAGER_SERIES_SCHEMA, [
  "portal.execution.manager-dataset.v1", "portal.execution.manager-score-history.v1", "portal.execution.manager-scoped.v1", "execution.analytics-series.v1",
  "portal.execution.manager-series.v2",
]);
const POLLUTION = pollutionCases(NEG, [[], ["selected_window"], ["series_source"], ["quality"], [...E0], [...E0, "partition"], [...E0, "window"], [...E0, "points", 0], ["comparison"], ["comparison", "common"], ["lineage"]]);
const ALL_NEG: Case[] = [...DECIMALS, ...ENUMS, ...INTEGERS, ...STRINGS, ...ARRAYS, ...REQUIRED, ...SCHEMA_SWAP, ...POLLUTION];

describe("L3 · negative", () => {
  it("reports the case counts", () => {
    const by = new Map<string, number>();
    for (const c of ALL_NEG) by.set(c.category, (by.get(c.category) ?? 0) + 1);
    console.info(`series L3: ${ALL_NEG.length} cases (${[...by.entries()].map(([k, v]) => `${k} ${v}`).join(", ")}), ${rootCases().length} root cases`);
    expect(ALL_NEG.length).toBeGreaterThan(400);
  });

  it.each(ALL_NEG.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    expect(() => readManagerSeries(c.value)).not.toThrow();
    const read = readManagerSeries(c.value);
    expect(leaked(read, c.probe)).toBe(false);
    expect(prototypeIsClean()).toBe(true);
    if (c.category === "schema-swapped") expect(read === null || read.kind === "unsupported_shape").toBe(true);
    if (c.category === "prototype-pollution") expect(read).toBeNull();
  });

  it("an unknown word never reads as a success state: no enum case yields a series", () => {
    for (const c of ENUMS) expect(seriesOf(c.value), c.name).toBeNull();
  });

  it("a number where a decimal belongs is never read", () => {
    const numbers = DECIMALS.filter((c) => c.category === "number-as-decimal" || c.category === "exponent");
    expect(numbers.length).toBeGreaterThan(20);
    for (const c of numbers) expect(seriesOf(c.value), c.name).toBeNull();
  });

  it.each(rootCases().map((c) => [c.name, c] as const))("%s is never a series", (_name, c) => {
    expect(() => readManagerSeries(c.value)).not.toThrow();
    const read = readManagerSeries(c.value);
    expect(read === null || read.kind === "unsupported_shape").toBe(true);
    if (typeof c.value !== "object" || c.value === null) expect(read).toBeNull();
  });
});

/* ═════════════════════════ L3 · schema agreement ═════════════════════════ */
describe("L3 · schema agreement (the published schema, via testkit validateAgainst)", () => {
  /**
   * Schema-valid, reader refuses, found in the generated corpus. Each group is a documented FE rule, never an accident, and
   * the counts are pinned so a new accidental refusal (or a lost one) is a red test.
   */
  const SAFE_TEXT_VALUE = /<- ("\s+"|"[^"]*\u202e[^"]*"|"\\u0000")$/;
  const STRICTER_GROUPS: { name: string; test: (c: Case) => boolean }[] = [
    { name: "MS-S1 display safety: whitespace-only, bidi override, in any text", test: (c) => SAFE_TEXT_VALUE.test(c.name) },
    { name: "MS-S2 negative zero is not a decimal value", test: (c) => c.category === "negative-zero" },
    { name: "MS-S4 a cut or doubled points list changes the points (a repeated timestamp has two values)", test: (c) => /^(truncated|duplicate-id): series\.\d\.(points|gaps) <-/.test(c.name) },
    { name: "MS-S7 a subject appears once", test: (c) => /^(truncated|duplicate-id): series <-/.test(c.name) },
    { name: "MS-S9 the comparison is the value derived from the entries (an axis or common edited alone)", test: (c) => /: comparison\.(axis_ms|common)/.test(c.name) },
    { name: "MS-S4/5 a point, window or gap value moved on its own (ordering, window and cutoff rules)", test: (c) => /^[a-z-]+: series\.\d\.(points\.\d\.ts_ms|window\.|gaps\.\d\.)/.test(c.name) || /: selected_window\.resolved/.test(c.name) || /: as_of_ms/.test(c.name) },
  ];
  const corpus = ALL_NEG.filter((c) => c.category !== "prototype-pollution" && c.category !== "schema-swapped");

  it("reader never accepts what the schema refuses, over the whole generated negative corpus (counted)", () => {
    let invalid = 0;
    const looserNames: string[] = [];
    const stricterBy = new Map<string, number>();
    const unexplained: string[] = [];
    for (const c of corpus) {
      const { invalid: bad, accepted } = judge(c.value);
      if (bad) invalid += 1;
      if (bad && accepted) looserNames.push(c.name);
      if (!bad && !accepted) {
        const group = STRICTER_GROUPS.find((g) => g.test(c));
        if (group === undefined) unexplained.push(c.name);
        else stricterBy.set(group.name, (stricterBy.get(group.name) ?? 0) + 1);
      }
    }
    console.info(
      `series L3 schema gap: ${corpus.length} cases, schema refuses ${invalid}; reader accepts ${looserNames.length} of those (looser); `
      + `reader refuses ${[...stricterBy.values()].reduce((a, b) => a + b, 0) + unexplained.length} schema-valid ones (stricter): ${[...stricterBy.entries()].map(([k, v]) => `${k} ${v}`).join("; ")}`,
    );
    expect(invalid).toBeGreaterThan(200);
    expect(looserNames).toEqual([]);
    expect(unexplained).toEqual([]);
    expect(Object.fromEntries(stricterBy)).toEqual(PINNED_STRICTER);
  });

  it("the planted-key cases are refused by the schema as well (a closed contract)", () => {
    for (const c of ALL_NEG.filter((x) => x.category === "prototype-pollution")) {
      const { accepted } = judge(c.value);
      expect(accepted, c.name).toBe(false);
    }
  });

  it("the closed contract: an unnamed key on any object the schema closes voids the read, in the schema too", () => {
    const paths: (string | number)[][] = [[], ["quality"], ["lineage"], ["series_source"], ["selected_window"], [...E0], [...E0, "subject"], [...E0, "partition"], [...E0, "window"], [...E0, "quality"], [...E0, "points", 0], [...E1, "gaps", 0], ["comparison"], ["comparison", "common"], ["comparison", "common", "window"]];
    for (const path of paths) {
      const body = clone(NEG);
      setPath(body, [...path, "surprise_field"], "x");
      expect(seriesViolations(body).join(), path.join(".")).toMatch(/surprise_field: not allowed|: matched no anyOf branch/);
      expect(readManagerSeries(body), path.join(".")).toBeNull();
    }
  });
});

/** The generated corpus' stricter-than-schema counts, pinned: a change means a rule moved. */
const PINNED_STRICTER: Record<string, number> = {
  "MS-S2 negative zero is not a decimal value": 8,
  "MS-S9 the comparison is the value derived from the entries (an axis or common edited alone)": 4,
  "MS-S1 display safety: whitespace-only, bidi override, in any text": 39,
  "MS-S7 a subject appears once": 2,
  "MS-S4 a cut or doubled points list changes the points (a repeated timestamp has two values)": 1,
  "MS-S4/5 a point, window or gap value moved on its own (ordering, window and cutoff rules)": 1,
};

/* ═════════════════════════ stricter, pinned by hand ═════════════════════════ */
describe("L3 · stricter than the schema, on purpose: each pinned case is schema-valid and refused by the reader", () => {
  const rlo = String.fromCharCode(0x202e);
  const from = POPULATED.selected_window.resolved.from_ms as number;
  const cases: [string, (b: Draft) => void][] = [
    ["MS-S1 whitespace-only workspace_id", (b) => { b.workspace_id = "   "; }],
    ["MS-S1 bidi override in a methodology_ref", (b) => { b.series[0].methodology_ref = `m${rlo}x`; b.comparison.common.methodology_ref = `m${rlo}x`; b.series[1].methodology_ref = `m${rlo}x`; }],
    ["MS-S2 negative zero point", (b) => { b.series[0].points[0].value = "-0"; }],
    ["MS-S2 negative zero with decimals", (b) => { b.series[0].points[0].value = "-0.000"; }],
    ["MS-S3 an entry window with from_ms == to_ms", (b) => { for (const e of b.series) e.window = { from_ms: from, to_ms: from }; b.selected_window.resolved = { from_ms: from, to_ms: from }; b.comparison.common.window = { from_ms: from, to_ms: from }; }],
    ["MS-S3 a requested custom window backwards", (b) => { b.selected_window.requested = { from_ms: 9, to_ms: 1 }; }],
    ["MS-S4 points out of order", (b) => { b.series[0].points.reverse(); }],
    ["MS-S4 a repeated timestamp", (b) => { b.series[0].points[1].ts_ms = b.series[0].points[0].ts_ms; }],
    ["MS-S4 a point before the window", (b) => { b.series[0].points[0].ts_ms = from - 1; }],
    ["MS-S4 gaps overlapping", (b) => { b.series[1].gaps = [{ from_ms: from + 1, to_ms: from + 3, reason: "SOURCE_GAP" }, { from_ms: from + 2, to_ms: from + 4, reason: "RETENTION" }]; }],
    ["MS-S4 a gap outside the window", (b) => { b.series[1].gaps[0] = { from_ms: from - 5, to_ms: from + 1, reason: "SOURCE_GAP" }; }],
    ["MS-S5 an entry window other than the selected one", (b) => { b.series[0].window.to_ms -= 1; }],
    ["MS-S5 a window after the cutoff", (b) => { b.as_of_ms = from; }],
    ["MS-S6 a EUR series in a USDT partition", (b) => { b.series[0].currency = "EUR"; }],
    ["MS-S6 basis other than the partition's", (b) => { b.series[0].basis = "TEST_ONLY:other-basis"; }],
    ["MS-S6 RATIO under NAV", (b) => { for (const e of b.series) { e.unit = "RATIO"; e.currency = null; } b.comparison.common.unit = "RATIO"; b.comparison.common.currency = null; }],
    ["MS-S7 one subject twice", (b) => { b.series[1].subject = clone(b.series[0].subject); }],
    ["MS-S7 an unpublished source with a reason the producer never gives for it", (b) => { Object.assign(b, fixtureValue(FIXTURE_UNAVAILABLE)); b.series[0].reason_code = "AMBIGUOUS_SERIES_PUBLICATION"; b.series[0].quality.reasons = ["AMBIGUOUS_SERIES_PUBLICATION"]; }],
    ["MS-S8 ALL with points", (b) => { b.selected_window = { requested: "ALL", resolved: null, selection_basis: "EXACT_PUBLISHED_METRIC_WINDOW_ONLY", reason_code: "ALL_HISTORY_WINDOW_NOT_PUBLISHED" }; }],
    ["MS-S9 mixed currencies called ALIGNED", (b) => { b.series[1].currency = "VND"; b.series[1].partition.currency = "VND"; }],
    ["MS-S9 an axis missing a timestamp", (b) => { b.comparison.axis_ms = b.comparison.axis_ms.slice(1); }],
    ["MS-S9 an axis that is not ascending", (b) => { b.comparison.axis_ms.reverse(); }],
    ["MS-S10 a timestamp beyond the Date range", (b) => { b.series[0].points[2].ts_ms = 9_000_000_000_000_000; b.comparison.axis_ms[3] = 9_000_000_000_000_000; }],
  ];
  it.each(cases.map(([name, change]) => [name, change] as const))("%s", (name, change) => {
    const body = clone(NEG);
    change(body);
    const { invalid, accepted } = judge(body);
    expect(invalid, `schema should allow: ${name}`).toBe(false);
    expect(accepted, `reader should refuse: ${name}`).toBe(false);
  });
  it("prints the number of pinned groups", () => {
    const groups = new Set(cases.map(([name]) => name.split(" ")[0]));
    console.info(`series stricter-than-schema (on purpose): ${cases.length} pinned cases in ${groups.size} named groups: ${[...groups].sort().join(", ")}`);
    expect(groups.size).toBe(10);
  });
});

describe("determinism", () => {
  it("reading twice gives equal results and never mutates the input", () => {
    const body = clone(NEG);
    const before = JSON.stringify(body);
    expect(readManagerSeries(body)).toEqual(readManagerSeries(body));
    expect(JSON.stringify(body)).toBe(before);
    expect(DAY).toBe(86_400_000);
    expect(FIXTURE_EMPTY).toBeDefined();
    expect(FIXTURE_MIXED).toBeDefined();
  });
});
