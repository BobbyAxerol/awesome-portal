/**
 * WP-K slice 1: the Manager series with ALPHA subjects and the DRAWDOWN metric. Every payload is a canonical fixture the contracts
 * lane publishes (FIXTURE_LAB lane), judged by the published JSON Schema and by the strict reader; the reader stays stricter only
 * where a producer rule is arithmetic (MS-S11: a drawdown is never above zero).
 */
import { describe, expect, it } from "vitest";
import { loadCanonical } from "../testkit/loadCanonical";
import { encodeManagerSeriesQuery, isRatioMetric, MANAGER_SERIES_METRICS, MANAGER_SERIES_SUBJECT_TYPES, readManagerSeries, seriesAnswersQuery, type ManagerSeries } from "./managerSeries";
import { FIXTURE_ALPHA, FIXTURE_DRAWDOWN, FIXTURE_DRAWDOWN_RULE, FIXTURE_PUBLICATION_DRAWDOWN, FIXTURE_QUERY_ALPHA_DRAWDOWN, fixtureValue, seriesViolations, type Draft } from "./managerSeries.testbase";

const seriesOf = (raw: unknown): ManagerSeries => {
  const read = readManagerSeries(raw);
  if (read === null || read.kind !== "series") throw new Error("expected a series read");
  return read.series;
};

describe("WP-K: the vocabulary", () => {
  it("names DRAWDOWN and ALPHA, and DRAWDOWN is a ratio like RETURN", () => {
    expect(MANAGER_SERIES_METRICS).toEqual(["NAV", "NET_PNL", "RETURN", "DRAWDOWN"]);
    expect(MANAGER_SERIES_SUBJECT_TYPES).toEqual(["FUND", "PORTFOLIO", "ALPHA"]);
    expect(MANAGER_SERIES_METRICS.filter(isRatioMetric)).toEqual(["RETURN", "DRAWDOWN"]);
  });
});

describe("WP-K: ALPHA subjects", () => {
  it("the alpha NAV fixture conforms to the schema and reads as two aligned ALPHA subjects with their own gap", () => {
    const body = fixtureValue(FIXTURE_ALPHA);
    expect(seriesViolations(body)).toEqual([]);
    const series = seriesOf(body);
    expect(series.series.map((e) => [e.subject.subjectType, e.subject.subjectId, e.state])).toEqual([["ALPHA", "TEST_ONLY:alpha-a", "AVAILABLE"], ["ALPHA", "TEST_ONLY:alpha-b", "AVAILABLE"]]);
    expect(series.comparison.state).toBe("ALIGNED");
    expect(series.series[1]).toMatchObject({ gaps: [{ reason: "SOURCE_GAP" }] });
  });
  it("an alpha beside a series of another currency is INCOMPARABLE, never rebased", () => {
    const body: Draft = fixtureValue(FIXTURE_ALPHA);
    body.series[1].currency = "VND";
    body.series[1].partition.currency = "VND";
    body.comparison = { state: "INCOMPARABLE", reason_code: "CURRENCY_MIXED", transform: "NONE_NO_REBASE_NO_CROSS_CURRENCY_SUM", common: null, axis_ms: null };
    expect(seriesOf(body).comparison).toMatchObject({ state: "INCOMPARABLE", reasonCode: "CURRENCY_MIXED" });
  });
  it("an unknown subject type voids the read", () => {
    const body: Draft = fixtureValue(FIXTURE_ALPHA);
    body.series[0].subject.subject_type = "STRATEGY";
    expect(readManagerSeries(body)).toBeNull();
    expect(seriesViolations(body).length).toBeGreaterThan(0);
  });
  it("the request encodes an ALPHA subject beside a portfolio, de-duplicated per type, and answers only the question asked", () => {
    const query = {
      environment: "paper" as const, metric: "DRAWDOWN" as const, window: "30D" as const,
      subjects: [{ subjectType: "ALPHA" as const, subjectId: "TEST_ONLY:alpha-a" }, { subjectType: "PORTFOLIO" as const, subjectId: "TEST_ONLY:portfolio-a" }],
    };
    const encoded = encodeManagerSeriesQuery(query)!;
    expect(JSON.parse(encoded.subjects)).toEqual([{ subject_type: "ALPHA", subject_id: "TEST_ONLY:alpha-a" }, { subject_type: "PORTFOLIO", subject_id: "TEST_ONLY:portfolio-a" }]);
    expect(encodeManagerSeriesQuery({ ...query, subjects: [{ subjectType: "ALPHA", subjectId: "x" }, { subjectType: "ALPHA", subjectId: "x" }] })).toBeNull();
    expect(encodeManagerSeriesQuery({ ...query, subjects: [{ subjectType: "ALPHA", subjectId: "x" }, { subjectType: "PORTFOLIO", subjectId: "x" }] })).not.toBeNull();
    const body = seriesOf(fixtureValue(FIXTURE_DRAWDOWN));
    expect(seriesAnswersQuery(body, query)).toBe(true);
    // an alpha asked, a portfolio answered, is not the same subject
    expect(seriesAnswersQuery(body, { ...query, subjects: [{ subjectType: "PORTFOLIO", subjectId: "TEST_ONLY:alpha-a" }, query.subjects[1]!] })).toBe(false);
    const published = loadCanonical<{ cases: Draft[] }>(FIXTURE_QUERY_ALPHA_DRAWDOWN + ".valid.json").cases;
    expect(published.map((c) => c.metric)).toEqual(["NAV", "DRAWDOWN"]);
    expect(published.every((c) => c.subjects.some((s: Draft) => s.subject_type === "ALPHA"))).toBe(true);
  });
});

describe("WP-K: the DRAWDOWN metric", () => {
  it("the drawdown fixture conforms to the schema and reads as an aligned RATIO with the scale its source stated", () => {
    const body = fixtureValue(FIXTURE_DRAWDOWN);
    expect(seriesViolations(body)).toEqual([]);
    const series = seriesOf(body);
    expect(series.metric).toBe("DRAWDOWN");
    expect(series.comparison).toMatchObject({ state: "ALIGNED" });
    for (const entry of series.series) {
      expect(entry).toMatchObject({ state: "AVAILABLE", unit: "RATIO", currency: null, ratioScale: "FRACTION" });
      if (entry.state === "AVAILABLE") expect(entry.points.every((p) => p.zero || p.exact.startsWith("-"))).toBe(true);
    }
    const first = series.series[0]!;
    expect(first.state === "AVAILABLE" && first.points.map((p) => p.exact)).toEqual(["0", "-0.0123", "-0.0045"]);
  });
  it("the stored publication is not a response body", () => {
    expect(readManagerSeries(loadCanonical(FIXTURE_PUBLICATION_DRAWDOWN + ".valid.json"))).toEqual({ kind: "unsupported_shape", schemaVersion: null });
  });
  it("a point above zero voids the read and the schema says the same", () => {
    const body: Draft = fixtureValue(FIXTURE_DRAWDOWN);
    body.series[0].points[1].value = "0.0123";
    expect(readManagerSeries(body)).toBeNull();
    expect(seriesViolations(body).length).toBeGreaterThan(0);
  });
  it("a drawdown as money, or without a scale, is refused", () => {
    const money: Draft = fixtureValue(FIXTURE_DRAWDOWN);
    for (const e of money.series) { e.unit = "MONEY"; e.currency = "USDT"; e.ratio_scale = null; }
    expect(readManagerSeries(money)).toBeNull();
    const unscaled: Draft = fixtureValue(FIXTURE_DRAWDOWN);
    for (const e of unscaled.series) e.ratio_scale = null;
    expect(readManagerSeries(unscaled)).toBeNull();
  });
  it("RATIO_SCALE_NOT_PUBLISHED is a statement about a ratio metric: legal for DRAWDOWN, illegal for NAV", () => {
    const entry = (): Draft => ({
      subject: { subject_type: "ALPHA", subject_id: "TEST_ONLY:alpha-a" }, state: "UNAVAILABLE", reason_code: "RATIO_SCALE_NOT_PUBLISHED", partition: null, unit: null,
      currency: null, ratio_scale: null, basis: null, methodology_ref: null, window: null, points: [], gaps: [],
      quality: { completeness: "UNRESOLVED", freshness: "UNKNOWN", reasons: ["RATIO_SCALE_NOT_PUBLISHED"] }, source_confidence: "UNKNOWN",
      provenance_refs: ["SOURCE_NOT_PUBLISHED"], calculation_revision: "manager-series.v1", policy_revision: "NOT_PUBLISHED",
    });
    const body: Draft = fixtureValue(FIXTURE_DRAWDOWN);
    body.series = [entry()];
    body.comparison = { state: "SINGLE_SUBJECT", reason_code: null, transform: "NONE_NO_REBASE_NO_CROSS_CURRENCY_SUM", common: null, axis_ms: null };
    expect(seriesOf(body).series[0]).toMatchObject({ state: "UNAVAILABLE", reasonCode: "RATIO_SCALE_NOT_PUBLISHED" });
    body.metric = "NAV";
    expect(readManagerSeries(body)).toBeNull();
  });
});

describe("WP-K: the published drawdown negatives are refused by the schema and by the reader", () => {
  const rule = loadCanonical<{ cases: Array<{ id: string; ops: Array<{ path: Array<string | number>; value: unknown }> }> }>(FIXTURE_DRAWDOWN_RULE);
  it.each(rule.cases.map((c) => [c.id, c] as const))("%s", (_id, c) => {
    const body: Draft = structuredClone(fixtureValue(FIXTURE_DRAWDOWN));
    for (const op of c.ops) op.path.slice(0, -1).reduce((node: Draft, key) => node[key], body)[op.path.at(-1)!] = op.value;
    expect(seriesViolations(body).length).toBeGreaterThan(0);
    expect(readManagerSeries(body)).toBeNull();
  });
});
