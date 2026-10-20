import { describe, expect, it } from "vitest";

import { readManagerSeries, type ManagerSeries, type ManagerSeriesAvailable } from "../../readers/managerSeries";
import { fixtureValue, FIXTURE_EMPTY, FIXTURE_MIXED, FIXTURE_POPULATED, FIXTURE_UNAVAILABLE, populated, type Draft } from "../../readers/managerSeries.testbase";
import {
  chartPointsOf, chartStateOf, chartUnit, commonCaption, emptyCaption, latestPoint, seriesCaption, sourceNotPublished, unavailableChart,
} from "./seriesModel";

const read = (raw: unknown): ManagerSeries => {
  const result = readManagerSeries(raw);
  if (result === null || result.kind !== "series") throw new Error("expected a series");
  return result.series;
};
const available = (series: ManagerSeries, index = 0): ManagerSeriesAvailable => {
  const entry = series.series[index]!;
  if (entry.state !== "AVAILABLE") throw new Error("expected AVAILABLE");
  return entry;
};

describe("chartPointsOf: the server's points, a stated gap as an explicit break, nothing filled", () => {
  it("keeps every exact string untouched and in order", () => {
    const entry = available(read(fixtureValue(FIXTURE_POPULATED)));
    expect(chartPointsOf(entry).map((p) => p.v)).toEqual(fixtureValue(FIXTURE_POPULATED).series[0].points.map((p: Draft) => p.value));
  });

  it("a stated gap becomes one null mark at its start; a point exactly there is not replaced", () => {
    const series = read(fixtureValue(FIXTURE_POPULATED));
    const b = available(series, 1);
    const marks = chartPointsOf(b);
    expect(marks).toHaveLength(b.points.length + 1);
    const gap = marks.find((m) => m.v === null)!;
    expect(gap.t).toBe(b.gaps[0]!.fromMs);
    expect(marks.map((m) => m.t)).toEqual([...marks.map((m) => m.t)].sort((x, y) => x - y));
    // The null mark sits between the neighbours it separates: no value is carried across it.
    const at = marks.indexOf(gap);
    expect(marks[at - 1]?.v).not.toBeNull();
    const withPointThere = read(populated((body) => { body.series[1].points[1].ts_ms = body.series[1].gaps[0].from_ms; body.series[1].points.sort((p: Draft, q: Draft) => p.ts_ms - q.ts_ms); }));
    expect(chartPointsOf(available(withPointThere, 1)).filter((m) => m.v === null)).toEqual([]);
  });
});

describe("units, state and captions", () => {
  it("MONEY is money, RATIO is a ratio with no percent sign invented", () => {
    expect(chartUnit({ unit: "MONEY" })).toBe("money");
    expect(chartUnit({ unit: "RATIO" })).toBe("ratio");
  });

  it("anything less than complete, fresh and verified wears a word; unknown is never ok", () => {
    const entry = (change: (e: Draft) => void) => available(read(populated((b) => change(b.series[0]))));
    expect(chartStateOf(entry(() => {}))).toEqual({ kind: "ready" });
    expect(chartStateOf(entry((e) => { e.quality.freshness = "STALE"; }))).toMatchObject({ kind: "stale" });
    expect(chartStateOf(entry((e) => { e.quality.freshness = "UNKNOWN"; }))).toMatchObject({ kind: "partial", reason: expect.stringContaining("freshness unknown") });
    expect(chartStateOf(entry((e) => { e.quality.completeness = "PARTIAL"; }))).toMatchObject({ kind: "partial" });
    expect(chartStateOf(entry((e) => { e.source_confidence = "UNKNOWN"; }))).toMatchObject({ kind: "partial", reason: expect.stringContaining("source confidence unknown") });
    expect(chartStateOf(entry((e) => { e.source_confidence = "PROVISIONAL"; e.quality.reasons = ["WHY"]; }))).toMatchObject({ reason: expect.stringContaining("(WHY)") });
  });

  it("the caption says what, in what, by which methodology and over which exact window, and counts the gaps it did not fill", () => {
    const series = read(fixtureValue(FIXTURE_POPULATED));
    expect(seriesCaption("NAV", available(series, 0))).toMatch(/^NAV in USDT · paper book · basis TEST_ONLY:nav-ledger · methodology TEST_ONLY:nav-twr\.v1 · window .+ \(UTC\) · no stated gaps$/);
    expect(seriesCaption("NAV", available(series, 1))).toContain("1 stated gap, not filled");
    const aligned = series.comparison;
    if (aligned.state !== "ALIGNED") throw new Error("expected ALIGNED");
    expect(commonCaption("NAV", aligned)).toContain("nothing rebased, filled or converted");
    const empty = read(fixtureValue(FIXTURE_EMPTY)).series[0]!;
    if (empty.state !== "EMPTY") throw new Error("expected EMPTY");
    expect(emptyCaption("NAV", empty)).toMatch(/^No points in this window\. NAV in USDT/);
  });

  it("latestPoint is the last published string or null, never a default", () => {
    const series = read(fixtureValue(FIXTURE_POPULATED));
    const entry = available(series);
    expect(latestPoint(entry)).toEqual({ exact: entry.points[entry.points.length - 1]!.exact, tsMs: entry.points[entry.points.length - 1]!.tsMs });
    const empty = read(fixtureValue(FIXTURE_EMPTY)).series[0]!;
    if (empty.state !== "EMPTY") throw new Error("expected EMPTY");
    expect(latestPoint(empty)).toBeNull();
  });

  it("a source that is not published reads as Not published with the id; every other reason is Not available with its code", () => {
    const unavailable = read(fixtureValue(FIXTURE_UNAVAILABLE));
    expect(sourceNotPublished(unavailable)).toBe(true);
    const entry = unavailable.series[0]!;
    if (entry.state !== "UNAVAILABLE") throw new Error("expected UNAVAILABLE");
    expect(unavailableChart(entry)).toMatchObject({ copy: "Not published (FE-013)", reason: expect.stringContaining("SERIES_SOURCE_NOT_PUBLISHED") });
    expect(unavailableChart(entry, "FE-013/033").copy).toBe("Not published (FE-013/033)");
    expect(unavailableChart({ ...entry, reasonCode: "SOURCE_NOT_QUALIFIED" })).toMatchObject({ copy: "Not available", reason: expect.stringContaining("SOURCE_NOT_QUALIFIED") });
    expect(sourceNotPublished(read(fixtureValue(FIXTURE_MIXED)))).toBe(false);
  });
});
