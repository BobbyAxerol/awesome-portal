/**
 * Manager series reader against the canonical contract fixtures (lane: FIXTURE_LAB; a fixture is never a source acceptance).
 * Every negative case is a mutation of a published fixture, never a second copy. Breadth (matrices, scale, schema
 * agreement) is in `managerSeries.conformance.test.ts`.
 */
import { describe, expect, it } from "vitest";

import { setPath } from "../testkit/matrix";
import { loadCanonical } from "../testkit/loadCanonical";
import {
  deriveManagerSeriesComparison,
  encodeManagerSeriesQuery,
  MANAGER_SERIES_SCHEMA,
  readManagerSeries,
  type ManagerSeries,
  type ManagerSeriesEntry,
} from "./managerSeries";
import {
  clone,
  DAY,
  Draft,
  FIXTURE_EMPTY,
  FIXTURE_MIXED,
  FIXTURE_POPULATED,
  FIXTURE_PUBLICATION,
  FIXTURE_QUERY,
  FIXTURE_UNAVAILABLE,
  fixtureValue,
  oracleComparison,
  populated,
  unavailableEntry,
  withComparison,
} from "./managerSeries.testbase";

function seriesOf(raw: unknown): ManagerSeries {
  const read = readManagerSeries(raw);
  if (read === null || read.kind !== "series") throw new Error("expected a series read");
  return read.series;
}
const refuses = (change: (body: Draft) => void, rebuild = false): boolean => {
  const body = fixtureValue(FIXTURE_POPULATED);
  change(body);
  return readManagerSeries(rebuild ? withComparison(body) : body) === null;
};

describe("fixtures", () => {
  it("reads the populated fixture: two portfolios, one currency, ALIGNED on the union of timestamps, a stated gap kept", () => {
    const series = seriesOf(fixtureValue(FIXTURE_POPULATED));
    expect(series.metric).toBe("NAV");
    expect(series.seriesSource).toEqual({ state: "PUBLISHED", reasonCode: null });
    expect(series.selectedWindow.kind).toBe("window");
    expect(series.series.map((e) => [e.state, e.subject.subjectId])).toEqual([["AVAILABLE", "TEST_ONLY:portfolio-a"], ["AVAILABLE", "TEST_ONLY:portfolio-b"]]);
    const [a, b] = series.series as [Extract<ManagerSeriesEntry, { state: "AVAILABLE" }>, Extract<ManagerSeriesEntry, { state: "AVAILABLE" }>];
    expect([a.unit, a.currency, a.methodologyRef, a.points.length, a.gaps.length]).toEqual(["MONEY", "USDT", "TEST_ONLY:nav-twr.v1", 3, 0]);
    expect(b.gaps).toEqual([{ fromMs: 1797580800000, toMs: 1797580800000, reason: "SOURCE_GAP" }]);
    // The points are the source's strings, untouched.
    expect(a.points.every((p) => typeof p.exact === "string")).toBe(true);
    expect(series.comparison.state).toBe("ALIGNED");
    if (series.comparison.state !== "ALIGNED") throw new Error("unreachable");
    expect(series.comparison.axisMs).toEqual([1797408000000, 1797494400000, 1797580800000, 1797667200000]);
    // Nothing is filled: portfolio-b has no point at the timestamps it lacks.
    const timestamps = (e: typeof a) => e.points.map((p) => p.tsMs);
    expect(series.comparison.axisMs.filter((ts) => !timestamps(a).includes(ts))).not.toEqual([]);
    expect(series.comparison.common).toMatchObject({ economicDomain: "PAPER", currency: "USDT", unit: "MONEY" });
  });

  it("reads the empty fixture: a published series with no point is EMPTY (not a zero line), the comparison is a single subject", () => {
    const series = seriesOf(fixtureValue(FIXTURE_EMPTY));
    const only = series.series[0]!;
    expect(only).toMatchObject({ state: "EMPTY", reasonCode: "NO_POINTS_PUBLISHED_IN_WINDOW" });
    expect(only.state === "EMPTY" && only.points).toEqual([]);
    expect(series.comparison).toMatchObject({ state: "SINGLE_SUBJECT", axisMs: null });
  });

  it("reads the unavailable fixture: every entry is typed text and carries nothing that looks like data", () => {
    const series = seriesOf(fixtureValue(FIXTURE_UNAVAILABLE));
    expect(series.seriesSource).toEqual({ state: "NOT_PUBLISHED", reasonCode: "FINANCIAL_NORMALIZED_SERIES_SOURCE_NOT_PUBLISHED" });
    for (const entry of series.series) {
      expect(entry).toMatchObject({ state: "UNAVAILABLE", reasonCode: "SERIES_SOURCE_NOT_PUBLISHED", copy: "Not available · SERIES_SOURCE_NOT_PUBLISHED" });
      for (const key of ["points", "gaps", "unit", "currency", "window", "partition", "basis", "methodologyRef"]) expect(entry, key).not.toHaveProperty(key);
    }
    expect(series.comparison).toMatchObject({ state: "UNAVAILABLE", reasonCode: "SUBJECT_SERIES_UNAVAILABLE", common: null, axisMs: null });
  });

  it("reads the currency-mixed fixture: INCOMPARABLE, each series kept apart and untouched, no axis, no common", () => {
    const series = seriesOf(fixtureValue(FIXTURE_MIXED));
    expect(series.comparison).toEqual({ state: "INCOMPARABLE", reasonCode: "CURRENCY_MIXED", common: null, axisMs: null });
    expect(series.series.map((e) => e.state === "AVAILABLE" && e.currency)).toEqual(["USDT", "VND"]);
    expect(series.series.every((e) => e.state === "AVAILABLE" && e.points.length === 2)).toBe(true);
  });

  it("the published publication and query examples are not series bodies", () => {
    expect(readManagerSeries(loadCanonical(FIXTURE_PUBLICATION + ".valid.json"))).toEqual({ kind: "unsupported_shape", schemaVersion: null });
    expect(readManagerSeries(loadCanonical(FIXTURE_QUERY + ".valid.json"))).toEqual({ kind: "unsupported_shape", schemaVersion: null });
  });
});

describe("envelope", () => {
  it("another schema_version is unsupported_shape and is never read", () => {
    const body = { ...fixtureValue(FIXTURE_POPULATED), schema_version: "portal.execution.manager-series.v2", brand_new: 1 };
    expect(readManagerSeries(body)).toEqual({ kind: "unsupported_shape", schemaVersion: "portal.execution.manager-series.v2" });
    expect(readManagerSeries({ ...body, schema_version: 3 })).toEqual({ kind: "unsupported_shape", schemaVersion: null });
    expect(MANAGER_SERIES_SCHEMA).toBe("portal.execution.manager-series.v1");
  });

  it("never throws: not an object, hostile getters, a very deep object", () => {
    for (const root of [null, undefined, 0, "x", [], () => 1, new Map()]) expect(() => readManagerSeries(root)).not.toThrow();
    const hostile = fixtureValue(FIXTURE_POPULATED);
    Object.defineProperty(hostile, "series", { get() { throw new Error("boom"); }, enumerable: true });
    expect(readManagerSeries(hostile)).toBeNull();
    let deep: Draft = {};
    const root = deep;
    for (let level = 0; level < 5000; level += 1) { deep.n = {}; deep = deep.n; }
    expect(() => readManagerSeries(root)).not.toThrow();
  });

  it("is closed: an unnamed key anywhere voids the read", () => {
    for (const path of [[], ["quality"], ["lineage"], ["series_source"], ["selected_window"], ["selected_window", "resolved"], ["series", 0], ["series", 0, "subject"], ["series", 0, "partition"], ["series", 0, "window"], ["series", 0, "quality"], ["series", 0, "points", 0], ["comparison"], ["comparison", "common"], ["comparison", "common", "window"]] as const) {
      const body = fixtureValue(FIXTURE_POPULATED);
      setPath(body, [...path, "surprise"], "x");
      expect(readManagerSeries(body), path.join(".")).toBeNull();
    }
    const gapped = fixtureValue(FIXTURE_POPULATED);
    setPath(gapped, ["series", 1, "gaps", 0, "surprise"], "x");
    expect(readManagerSeries(gapped)).toBeNull();
  });

  it("every required key is required (an absent key is not a null)", () => {
    for (const key of ["workspace_id", "environment", "metric", "selected_window", "series_source", "as_of_ms", "recorded_through_ms", "quality", "series", "comparison", "lineage", "record_authority", "source_authority"]) {
      const body = fixtureValue(FIXTURE_POPULATED);
      delete body[key];
      expect(readManagerSeries(body), key).toBeNull();
    }
    for (const key of ["subject", "state", "reason_code", "partition", "unit", "currency", "basis", "methodology_ref", "window", "points", "gaps", "quality", "source_confidence", "provenance_refs", "calculation_revision", "policy_revision"]) {
      const body = fixtureValue(FIXTURE_POPULATED);
      delete body.series[0][key];
      expect(readManagerSeries(body), `series.${key}`).toBeNull();
    }
  });

  it("authorities, environment, metric and lineage are exact; the window is mandatory", () => {
    expect(refuses((b) => { b.record_authority = "TRADING_SYSTEM"; })).toBe(true);
    expect(refuses((b) => { b.source_authority = "PORTAL_PROJECTION"; })).toBe(true);
    expect(refuses((b) => { b.environment = "prod"; })).toBe(true);
    expect(refuses((b) => { b.metric = "nav"; })).toBe(true);
    expect(refuses((b) => { b.selected_window = null; })).toBe(true);
    expect(refuses((b) => { b.lineage.reducer_revision = "manager-series.v2"; })).toBe(true);
    expect(refuses((b) => { b.lineage.revision = "sha256:xyz"; })).toBe(true);
    expect(refuses((b) => { b.series = []; })).toBe(true);
    expect(refuses((b) => { b.series = Array.from({ length: 5 }, (_, i) => ({ ...clone(b.series[0]), subject: { subject_type: "PORTFOLIO", subject_id: `p${i}` } })); }, true)).toBe(true);
  });
});

describe("states: AVAILABLE, EMPTY and UNAVAILABLE are different facts", () => {
  it("AVAILABLE needs points and no reason; EMPTY needs none and its reason; UNAVAILABLE carries a closed reason and no description", () => {
    expect(refuses((b) => { b.series[0].points = []; }, true)).toBe(true); // AVAILABLE with no point
    expect(refuses((b) => { b.series[0].reason_code = "NO_POINTS_PUBLISHED_IN_WINDOW"; }, true)).toBe(true);
    const empty = fixtureValue(FIXTURE_EMPTY);
    empty.series[0].reason_code = null;
    expect(readManagerSeries(empty)).toBeNull();
    const emptyWithPoint = fixtureValue(FIXTURE_EMPTY);
    emptyWithPoint.series[0].points = [{ ts_ms: emptyWithPoint.selected_window.resolved.from_ms, value: "1" }];
    expect(readManagerSeries(emptyWithPoint)).toBeNull();
    for (const bad of [null, "SOME_NEW_REASON", "NO_POINTS_PUBLISHED_IN_WINDOW", "", 3]) {
      const body = fixtureValue(FIXTURE_UNAVAILABLE);
      body.series[0].reason_code = bad;
      expect(readManagerSeries(body), String(bad)).toBeNull();
    }
    for (const [key, value] of Object.entries({ unit: "MONEY", currency: "USDT", basis: "b", methodology_ref: "m", window: { from_ms: 1, to_ms: 2 }, partition: fixtureValue(FIXTURE_POPULATED).series[0].partition, points: [{ ts_ms: 1, value: "1" }], gaps: [{ from_ms: 1, to_ms: 2, reason: "SOURCE_GAP" }] })) {
      const body = fixtureValue(FIXTURE_UNAVAILABLE);
      body.series[0][key] = value;
      expect(readManagerSeries(body), `UNAVAILABLE with ${key}`).toBeNull();
    }
    const resolved = fixtureValue(FIXTURE_UNAVAILABLE);
    resolved.series[0].quality.completeness = "COMPLETE";
    expect(readManagerSeries(resolved)).toBeNull();
    for (const state of ["available", "UNKNOWN", "", null, 1]) {
      const body = fixtureValue(FIXTURE_POPULATED);
      body.series[0].state = state;
      expect(readManagerSeries(body), String(state)).toBeNull();
    }
  });

  it("every typed UNAVAILABLE reason reads as text with its code", () => {
    for (const reason of ["SERIES_SOURCE_NOT_PUBLISHED", "SERIES_SCOPE_NOT_AUTHORIZED", "SUBJECT_HAS_NO_ACTIVE_MEMBERS", "SOURCE_NOT_QUALIFIED", "EXACT_METRIC_WINDOW_NOT_PUBLISHED", "ECONOMIC_PARTITION_REQUIRED", "AMBIGUOUS_SERIES_PUBLICATION"]) {
      const body = populated((b) => { b.series[1] = unavailableEntry(b.series[1].subject, reason); });
      const entry = seriesOf(body).series[1]!;
      expect(entry).toMatchObject({ state: "UNAVAILABLE", reasonCode: reason, copy: `Not available · ${reason}` });
    }
  });

  it("an unpublished source allows only typed UNAVAILABLE entries with the producer's five reasons", () => {
    expect(refuses((b) => { Object.assign(b, fixtureValue(FIXTURE_POPULATED)); b.series_source = { state: "NOT_PUBLISHED", reason_code: "FINANCIAL_NORMALIZED_SERIES_SOURCE_NOT_PUBLISHED" }; })).toBe(true);
    expect(refuses((b) => { b.series_source = { state: "PUBLISHED", reason_code: "FINANCIAL_NORMALIZED_SERIES_SOURCE_NOT_PUBLISHED" }; })).toBe(true);
    expect(refuses((b) => { b.series_source = { state: "NOT_PUBLISHED", reason_code: null }; })).toBe(true);
    const body = fixtureValue(FIXTURE_UNAVAILABLE);
    body.series[0].reason_code = "AMBIGUOUS_SERIES_PUBLICATION";
    body.series[0].quality.reasons = ["AMBIGUOUS_SERIES_PUBLICATION"];
    expect(readManagerSeries(body)).toBeNull();
    // A published source can say anything typed, including that one subject has nothing.
    expect(seriesOf(populated((b) => { b.series[1] = unavailableEntry(b.series[1].subject, "AMBIGUOUS_SERIES_PUBLICATION"); })).series[1]).toMatchObject({ state: "UNAVAILABLE" });
  });

  it("ALL is a typed gap: no entry can carry points for it, and a window reason cannot contradict the request", () => {
    const all = (b: Draft) => { b.selected_window = { requested: "ALL", resolved: null, selection_basis: "EXACT_PUBLISHED_METRIC_WINDOW_ONLY", reason_code: "ALL_HISTORY_WINDOW_NOT_PUBLISHED" }; };
    expect(refuses((b) => all(b), true)).toBe(true); // AVAILABLE entries under ALL
    const allUnavailable = (reason: string) => {
      const body = fixtureValue(FIXTURE_UNAVAILABLE);
      all(body);
      for (const entry of body.series) { entry.reason_code = reason; entry.quality.reasons = [reason]; }
      return body;
    };
    expect(seriesOf(allUnavailable("ALL_HISTORY_WINDOW_NOT_PUBLISHED")).selectedWindow).toMatchObject({ kind: "gap", requested: "ALL" });
    expect(readManagerSeries(allUnavailable("EXACT_METRIC_WINDOW_NOT_PUBLISHED"))).toBeNull();
    const notAll = fixtureValue(FIXTURE_UNAVAILABLE);
    notAll.series[0].reason_code = "ALL_HISTORY_WINDOW_NOT_PUBLISHED";
    expect(readManagerSeries(notAll)).toBeNull();
  });
});

describe("exact decimals, units, windows and points", () => {
  it("a value is the source's string: numbers, exponents, signs, whitespace and a negative zero are refused", () => {
    for (const bad of [1, 1.5, "1e3", "1E3", " 1", "1 ", "+1", ".5", "5.", "01", "0x1", "NaN", "Infinity", "1,000", "-0", "-0.00", "", null, true, "9".repeat(129)]) {
      expect(refuses((b) => { b.series[0].points[0].value = bad; }, true), JSON.stringify(bad)).toBe(true);
    }
    // Zero is a published value, a different fact from an absence; the digits stay as sent.
    const body = populated((b) => { b.series[0].points[0].value = "0.00"; b.series[0].points[1].value = "-12.50"; });
    const entry = seriesOf(body).series[0]!;
    expect(entry.state === "AVAILABLE" && entry.points.slice(0, 2)).toMatchObject([{ exact: "0.00", zero: true }, { exact: "-12.50", zero: false }]);
  });

  it("MONEY names the partition's currency; RATIO names none; the unit follows the metric; the basis is the partition's", () => {
    expect(refuses((b) => { b.series[0].currency = "EUR"; }, true)).toBe(true); // a EUR series in a USDT partition
    expect(refuses((b) => { b.series[0].currency = null; }, true)).toBe(true); // MONEY with no currency
    expect(refuses((b) => { b.series[0].unit = "RATIO"; }, true)).toBe(true); // RATIO under NAV
    expect(refuses((b) => { b.series[0].unit = "RATIO"; b.series[0].currency = null; }, true)).toBe(true);
    expect(refuses((b) => { b.series[0].basis = "TEST_ONLY:other-basis"; }, true)).toBe(true);
    const ret = populated((b) => { b.metric = "RETURN"; for (const e of b.series) { e.unit = "RATIO"; e.currency = null; } });
    expect(seriesOf(ret).series.every((e) => e.state === "AVAILABLE" && e.unit === "RATIO" && e.currency === null)).toBe(true);
    expect(refuses((b) => { b.metric = "RETURN"; }, true)).toBe(true); // MONEY under RETURN
    expect(refuses((b) => { b.metric = "RETURN"; for (const e of b.series) { e.unit = "RATIO"; } }, true)).toBe(true); // RATIO with a currency
  });

  it("the entry window is the selected resolved window, not backwards, not after the cutoff", () => {
    expect(refuses((b) => { b.series[0].window.from_ms += 1; }, true)).toBe(true);
    expect(refuses((b) => { b.series[0].window.to_ms -= 1; }, true)).toBe(true);
    expect(refuses((b) => { b.series[0].window = { from_ms: 5, to_ms: 5 }; b.selected_window.resolved = { from_ms: 5, to_ms: 5 }; }, true)).toBe(true);
    expect(refuses((b) => { b.as_of_ms = b.selected_window.resolved.to_ms - 1; }, true)).toBe(true);
    expect(refuses((b) => { b.selected_window.requested = { from_ms: 9, to_ms: 1 }; }, true)).toBe(true);
    const custom = populated((b) => { b.selected_window.requested = { from_ms: b.selected_window.resolved.from_ms, to_ms: b.selected_window.resolved.to_ms }; });
    expect(seriesOf(custom).selectedWindow).toMatchObject({ kind: "window" });
  });

  it("points are strictly ascending, inside the window, bounded; gaps are ordered, inside the window and do not overlap", () => {
    const [from, to] = (() => { const w = fixtureValue(FIXTURE_POPULATED).selected_window.resolved; return [w.from_ms as number, w.to_ms as number]; })();
    expect(refuses((b) => { b.series[0].points.reverse(); }, true)).toBe(true);
    expect(refuses((b) => { b.series[0].points[1].ts_ms = b.series[0].points[0].ts_ms; }, true)).toBe(true);
    expect(refuses((b) => { b.series[0].points[0].ts_ms = from - 1; }, true)).toBe(true);
    expect(refuses((b) => { b.series[0].points[2].ts_ms = to + 1; }, true)).toBe(true);
    expect(refuses((b) => { b.series[0].points = Array.from({ length: 2001 }, (_, i) => ({ ts_ms: from + i, value: "1" })); }, true)).toBe(true);
    expect(refuses((b) => { b.series[1].gaps = [{ from_ms: from + 5, to_ms: from + 4, reason: "SOURCE_GAP" }]; }, true)).toBe(true);
    expect(refuses((b) => { b.series[1].gaps = [{ from_ms: from - 1, to_ms: from + 4, reason: "SOURCE_GAP" }]; }, true)).toBe(true);
    expect(refuses((b) => { b.series[1].gaps = [{ from_ms: from + 1, to_ms: to + 1, reason: "SOURCE_GAP" }]; }, true)).toBe(true);
    expect(refuses((b) => { b.series[1].gaps = [{ from_ms: from + 1, to_ms: from + 9, reason: "SOURCE_GAP" }, { from_ms: from + 9, to_ms: from + 12, reason: "RETENTION" }]; }, true)).toBe(true);
    expect(refuses((b) => { b.series[1].gaps[0].reason = "WHY_NOT"; }, true)).toBe(true);
    const ok = populated((b) => { b.series[1].gaps = [{ from_ms: from + 1, to_ms: from + 9, reason: "SOURCE_GAP" }, { from_ms: from + 10, to_ms: from + 12, reason: "RETENTION" }]; });
    const entry = seriesOf(ok).series[1]!;
    expect(entry.state === "AVAILABLE" && entry.gaps).toHaveLength(2);
  });

  it("text is display safe and bounded", () => {
    const rlo = String.fromCharCode(0x202e);
    for (const path of [["workspace_id"], ["series", 0, "methodology_ref"], ["series", 0, "basis"], ["series", 0, "subject", "subject_id"], ["series", 0, "partition", "currency"], ["series", 0, "provenance_refs", 0], ["series", 0, "quality", "reasons"]] as const) {
      for (const value of ["   ", `a${rlo}b`, "a".repeat(70_000)]) {
        const body = fixtureValue(FIXTURE_POPULATED);
        setPath(body, path, path[path.length - 1] === "reasons" ? [value] : value);
        expect(readManagerSeries(body), `${path.join(".")} ${value.slice(0, 6)}`).toBeNull();
      }
    }
  });
});

describe("comparison: re-derived locally, never trusted", () => {
  it("a producer cannot call mixed currencies ALIGNED", () => {
    const body = fixtureValue(FIXTURE_MIXED);
    body.comparison = oracleComparison([{ ...body.series[0], currency: "USDT" }, { ...body.series[0], subject: body.series[1].subject }]);
    expect(body.comparison.state).toBe("ALIGNED");
    expect(readManagerSeries(body)).toBeNull();
  });

  it("every way of lying about the comparison is refused", () => {
    const lies: ((b: Draft) => void)[] = [
      (b) => { b.comparison.state = "INCOMPARABLE"; b.comparison.reason_code = "CURRENCY_MIXED"; b.comparison.common = null; b.comparison.axis_ms = null; },
      (b) => { b.comparison.state = "UNAVAILABLE"; b.comparison.reason_code = "SUBJECT_SERIES_UNAVAILABLE"; b.comparison.common = null; b.comparison.axis_ms = null; },
      (b) => { b.comparison.state = "SINGLE_SUBJECT"; b.comparison.axis_ms = null; },
      (b) => { b.comparison.axis_ms = b.comparison.axis_ms.slice(1); },
      (b) => { b.comparison.axis_ms = [...b.comparison.axis_ms, b.comparison.axis_ms.at(-1) + 1]; },
      (b) => { b.comparison.axis_ms = [...b.comparison.axis_ms].reverse(); },
      (b) => { b.comparison.axis_ms = null; },
      (b) => { b.comparison.common = null; },
      (b) => { b.comparison.common.currency = "VND"; },
      (b) => { b.comparison.common.methodology_ref = "TEST_ONLY:other"; },
      (b) => { b.comparison.common.window.to_ms += 1; },
      (b) => { b.comparison.transform = "REBASE_TO_100"; },
      (b) => { b.comparison.reason_code = "CURRENCY_MIXED"; },
    ];
    lies.forEach((lie, index) => expect(refuses(lie), `lie ${index}`).toBe(true));
    const mixed = fixtureValue(FIXTURE_MIXED);
    mixed.comparison.reason_code = "BASIS_MIXED";
    expect(readManagerSeries(mixed)).toBeNull();
    mixed.comparison = { ...mixed.comparison, state: "ALIGNED", reason_code: null };
    expect(readManagerSeries(mixed)).toBeNull();
  });

  it("the first mismatch wins, in the producer's order: currency, partition, basis, methodology", () => {
    const two = (change: (b: Draft) => void): Draft => populated((b) => { change(b); });
    const reasonOf = (body: Draft) => seriesOf(body).comparison.reasonCode;
    expect(reasonOf(two((b) => { b.series[1].currency = "VND"; b.series[1].partition.currency = "VND"; b.series[1].methodology_ref = "TEST_ONLY:m2"; }))).toBe("CURRENCY_MIXED");
    expect(reasonOf(two((b) => { b.series[1].partition.native_profile_ref = "TEST_ONLY:other-ledger"; b.series[1].methodology_ref = "TEST_ONLY:m2"; }))).toBe("ECONOMIC_PARTITION_MIXED");
    expect(reasonOf(two((b) => { b.series[1].basis = "TEST_ONLY:b2"; b.series[1].partition.basis = "TEST_ONLY:b2"; b.series[1].methodology_ref = "TEST_ONLY:m2"; }))).toBe("BASIS_MIXED");
    expect(reasonOf(two((b) => { b.series[1].methodology_ref = "TEST_ONLY:m2"; }))).toBe("METHODOLOGY_MIXED");
    // The proof reference is evidence, not identity: different proof, same ledger, still comparable.
    expect(seriesOf(two((b) => { b.series[1].partition.domain_proof_ref = "TEST_ONLY:other-proof"; })).comparison.state).toBe("ALIGNED");
  });

  it("an INCOMPARABLE answer has no axis and no common; each subject keeps its own untouched points", () => {
    const series = seriesOf(fixtureValue(FIXTURE_MIXED));
    expect(series.comparison.axisMs).toBeNull();
    expect(series.comparison.common).toBeNull();
    const [usdt, vnd] = series.series as Extract<ManagerSeriesEntry, { state: "AVAILABLE" }>[];
    expect(usdt!.points.map((p) => p.exact)).toEqual(fixtureValue(FIXTURE_MIXED).series[0].points.map((p: Draft) => p.value));
    expect(vnd!.points.map((p) => p.exact)).toEqual(fixtureValue(FIXTURE_MIXED).series[1].points.map((p: Draft) => p.value));
  });

  it("one UNAVAILABLE or EMPTY subject makes the pair UNAVAILABLE, never ALIGNED on the rest", () => {
    expect(seriesOf(populated((b) => { b.series[1] = unavailableEntry(b.series[1].subject); })).comparison.state).toBe("UNAVAILABLE");
    expect(seriesOf(populated((b) => { b.series[1].points = []; b.series[1].gaps = []; b.series[1].state = "EMPTY"; b.series[1].reason_code = "NO_POINTS_PUBLISHED_IN_WINDOW"; })).comparison.state).toBe("UNAVAILABLE");
    // A mismatch among the subjects that do describe a series is still named first.
    const mixedAndGone = populated((b) => {
      b.series.push(unavailableEntry({ subject_type: "PORTFOLIO", subject_id: "TEST_ONLY:portfolio-c" }));
      b.series[1].currency = "VND"; b.series[1].partition.currency = "VND";
    });
    expect(seriesOf(mixedAndGone).comparison).toMatchObject({ state: "INCOMPARABLE", reasonCode: "CURRENCY_MIXED" });
  });

  it("the same subject twice is refused", () => {
    expect(refuses((b) => { b.series[1].subject = clone(b.series[0].subject); }, true)).toBe(true);
  });

  it("deriveManagerSeriesComparison is a pure function of the entries (an empty list is UNAVAILABLE)", () => {
    expect(deriveManagerSeriesComparison([])).toEqual({ state: "UNAVAILABLE", reasonCode: "SUBJECT_SERIES_UNAVAILABLE", common: null, axisMs: null });
    const series = seriesOf(fixtureValue(FIXTURE_POPULATED));
    expect(deriveManagerSeriesComparison(series.series)).toEqual(series.comparison);
    expect(deriveManagerSeriesComparison(series.series.slice(0, 1)).state).toBe("SINGLE_SUBJECT");
  });
});

describe("the request: JSON-encoded subjects, window and economic_partition as the OpenAPI says", () => {
  it("every published query example encodes to exactly the JSON values the OpenAPI describes", () => {
    const file = loadCanonical<{ cases: Draft[] }>(FIXTURE_QUERY);
    expect(file.cases.length).toBeGreaterThanOrEqual(3);
    for (const published of file.cases) {
      const partition = published.economic_partition;
      const wire = encodeManagerSeriesQuery({
        environment: published.environment, metric: published.metric,
        window: typeof published.window === "string" ? published.window : { fromMs: published.window.from_ms, toMs: published.window.to_ms },
        subjects: published.subjects.map((s: Draft) => (s.subject_type === "FUND" ? { subjectType: "FUND" } : { subjectType: "PORTFOLIO", subjectId: s.subject_id })),
        ...(partition === undefined ? {} : { economicPartition: {
          economicDomain: partition.economic_domain, currency: partition.currency, basis: partition.basis, nativeProfileRef: partition.native_profile_ref, domainProofRef: partition.domain_proof_ref,
        } }),
      })!;
      expect(wire).not.toBeNull();
      expect(wire.environment).toBe(published.environment);
      expect(wire.metric).toBe(published.metric);
      expect(JSON.parse(wire.subjects!)).toEqual(published.subjects);
      expect(JSON.parse(wire.window!)).toEqual(published.window);
      if (partition === undefined) expect(wire).not.toHaveProperty("economic_partition");
      else expect(JSON.parse(wire.economic_partition!)).toEqual(partition);
    }
  });

  it("encodes subjects, window and partition as JSON strings and leaves the plain parameters plain", () => {
    const wire = encodeManagerSeriesQuery({
      environment: "paper", metric: "NAV", window: "30D",
      subjects: [{ subjectType: "FUND" }, { subjectType: "PORTFOLIO", subjectId: "pf 1/ü" }],
    })!;
    expect(wire).toEqual({
      environment: "paper", metric: "NAV", window: "\"30D\"",
      subjects: JSON.stringify([{ subject_type: "FUND" }, { subject_type: "PORTFOLIO", subject_id: "pf 1/ü" }]),
    });
    const custom = encodeManagerSeriesQuery({
      environment: "live", metric: "RETURN", window: { fromMs: 10, toMs: 20 }, subjects: [{ subjectType: "FUND" }], workspaceId: "w",
      economicPartition: { economicDomain: "ACTUAL", currency: "USDT", basis: "b", nativeProfileRef: "n", domainProofRef: "d" },
    })!;
    expect(JSON.parse(custom.window!)).toEqual({ from_ms: 10, to_ms: 20 });
    expect(JSON.parse(custom.economic_partition!)).toEqual({ economic_domain: "ACTUAL", currency: "USDT", basis: "b", native_profile_ref: "n", domain_proof_ref: "d" });
    expect(custom.workspace_id).toBe("w");
  });

  it("refuses a request the server would refuse: no subject, five subjects, a duplicate, a backwards window", () => {
    const base = { environment: "paper", metric: "NAV", window: "7D" } as const;
    const pf = (id: string) => ({ subjectType: "PORTFOLIO", subjectId: id }) as const;
    expect(encodeManagerSeriesQuery({ ...base, subjects: [] })).toBeNull();
    expect(encodeManagerSeriesQuery({ ...base, subjects: [pf("1"), pf("2"), pf("3"), pf("4"), pf("5")] })).toBeNull();
    expect(encodeManagerSeriesQuery({ ...base, subjects: [pf("1"), pf("1")] })).toBeNull();
    expect(encodeManagerSeriesQuery({ ...base, subjects: [{ subjectType: "FUND" }, { subjectType: "FUND" }] })).toBeNull();
    expect(encodeManagerSeriesQuery({ ...base, subjects: [pf("")] })).toBeNull();
    expect(encodeManagerSeriesQuery({ ...base, window: { fromMs: 5, toMs: 1 }, subjects: [pf("1")] })).toBeNull();
    expect(encodeManagerSeriesQuery({ ...base, subjects: [pf("1"), pf("2"), pf("3"), pf("4")] })).not.toBeNull();
  });
});

describe("determinism", () => {
  it("reading twice gives equal results and never mutates the input; the read does not alias the input", () => {
    const body = fixtureValue(FIXTURE_POPULATED);
    const before = JSON.stringify(body);
    const one = readManagerSeries(body);
    expect(one).toEqual(readManagerSeries(body));
    expect(JSON.stringify(body)).toBe(before);
    const series = seriesOf(body);
    body.series[0].points[0].value = "changed";
    body.series[0].quality.reasons.push("changed");
    const entry = series.series[0]!;
    expect(entry.state === "AVAILABLE" && entry.points[0]!.exact).not.toBe("changed");
    expect(entry.quality.reasons).not.toContain("changed");
    expect(DAY).toBe(86_400_000);
  });
});
