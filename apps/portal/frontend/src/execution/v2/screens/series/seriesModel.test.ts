import { describe, expect, it } from "vitest";

import { readManagerSeries, type ManagerSeries, type ManagerSeriesAvailable } from "../../readers/managerSeries";
import {
  fixtureValue, FIXTURE_EMPTY, FIXTURE_MIXED, FIXTURE_POPULATED, FIXTURE_RETURN, FIXTURE_RETURN_SCALE_MIXED, FIXTURE_RETURN_UNSCALED, FIXTURE_UNAVAILABLE, populated, withComparison, type Draft,
} from "../../readers/managerSeries.testbase";
import {
  chartPointsOf, chartStateOf, chartUnit, commonCaption, emptyCaption, latestPoint, MISMATCH_SENTENCE, seriesCaption, seriesPlotValue, seriesValueText, shiftDecimalTwo, sourceNotPublished,
  UNAVAILABLE_SENTENCE, unavailableChart,
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
  it("MONEY is money; a RATIO is shown in percent because its source STATED the scale (FE-013), never because a percent sign was guessed", () => {
    expect(chartUnit({ unit: "MONEY" })).toBe("money");
    expect(chartUnit({ unit: "RATIO" })).toBe("pct");
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
    expect(unavailableChart(entry)).toMatchObject({ copy: "Not published: NAV and drawdown", reason: expect.stringContaining("SERIES_SOURCE_NOT_PUBLISHED") });
    expect(unavailableChart(entry, "FE-013/033").copy).toBe("Not published");
    expect(unavailableChart({ ...entry, reasonCode: "SOURCE_NOT_QUALIFIED" })).toMatchObject({ copy: "Not available", reason: expect.stringContaining("SOURCE_NOT_QUALIFIED") });
    expect(sourceNotPublished(read(fixtureValue(FIXTURE_MIXED)))).toBe(false);
  });
});

describe("FE-013 ratio scale: the print is a decimal-STRING shift, never a float", () => {
  it("shiftDecimalTwo moves the point two places in the string and keeps every digit", () => {
    const cases: [string, string][] = [
      ["0.0123", "1.23"], ["-0.004", "-0.4"], ["0", "0"], ["1", "100"], ["0.5", "50"], ["0.01", "1"], ["0.001", "0.1"], ["12.3456", "1234.56"],
      ["-1", "-100"], ["0.10", "10"], ["0.01230", "1.230"], ["100", "10000"],
      // Past what a double holds: 20 fractional digits and 25 integer digits survive untouched.
      ["0.01234567890123456789", "1.234567890123456789"], ["1234567890123456789012345", "123456789012345678901234500"],
      ["0.1000000000000000055511151231257827", "10.00000000000000055511151231257827"],
    ];
    for (const [input, want] of cases) expect(shiftDecimalTwo(input), input).toBe(want);
  });

  it("a string outside the published decimal grammar is not shifted (null, never a guess)", () => {
    for (const bad of ["", "-", "1e3", " 1", "+1", ".5", "5.", "01", "NaN", "1,000", "0x1", "-0.0.1"]) expect(shiftDecimalTwo(bad), bad).toBeNull();
  });

  it("only a FRACTION is shifted; PERCENT and money print as published", () => {
    expect(seriesPlotValue({ unit: "RATIO", ratioScale: "FRACTION" }, "0.0123")).toBe("1.23");
    expect(seriesPlotValue({ unit: "RATIO", ratioScale: "PERCENT" }, "1.23")).toBe("1.23");
    expect(seriesPlotValue({ unit: "MONEY", ratioScale: null }, "0.0123")).toBe("0.0123");
  });

  it("FRACTION 0.0123 and PERCENT 1.23 print the same 1.23%; money keeps its currency and no percent sign", () => {
    const fraction = { unit: "RATIO", ratioScale: "FRACTION", currency: null } as const;
    const percent = { unit: "RATIO", ratioScale: "PERCENT", currency: null } as const;
    expect(seriesValueText(fraction, "0.0123")).toBe("1.23%");
    expect(seriesValueText(percent, "1.23")).toBe("1.23%");
    expect(seriesValueText(fraction, "-0.004", { signed: true })).toBe("-0.40%");
    expect(seriesValueText(fraction, "0.0051", { signed: true })).toBe("+0.51%");
    expect(seriesValueText(fraction, "0")).toBe("0.00%");
    expect(seriesValueText({ unit: "MONEY", ratioScale: null, currency: "USDT" }, "1000.5")).toBe("1,000.50 USDT");
  });

  it("the return fixture draws the shifted strings and keeps the published ones in the read; a gap is still a null mark", () => {
    const series = read(fixtureValue(FIXTURE_RETURN));
    const a = available(series);
    expect(a.points.map((p) => p.exact)).toEqual(["0", "0.0123", "-0.004"]);
    expect(chartPointsOf(a).map((p) => p.v)).toEqual(["0", "1.23", "-0.4"]);
    const gapBody = fixtureValue(FIXTURE_RETURN);
    gapBody.series[0].gaps = [{ from_ms: gapBody.series[0].points[1].ts_ms + 1, to_ms: gapBody.series[0].points[1].ts_ms + 2, reason: "SOURCE_GAP" }];
    expect(chartPointsOf(available(read(withComparison(gapBody)))).map((p) => p.v)).toEqual(["0", "1.23", null, "-0.4"]);
    const percentBody = fixtureValue(FIXTURE_RETURN);
    for (const e of percentBody.series) { e.ratio_scale = "PERCENT"; e.points[1].value = "1.23"; }
    expect(chartPointsOf(available(read(withComparison(percentBody)))).map((p) => p.v)).toEqual(["0", "1.23", "-0.004"]);
  });

  it("the caption states the scale: what 1.0 or 100 means, and that a FRACTION is shown in %", () => {
    const series = read(fixtureValue(FIXTURE_RETURN));
    expect(seriesCaption("RETURN", available(series))).toMatch(/^Return, a ratio stated as a fraction \(1\.0 is 100%\), shown in % · paper book · /);
    if (series.comparison.state !== "ALIGNED") throw new Error("expected ALIGNED");
    expect(commonCaption("RETURN", series.comparison)).toContain("Return, a ratio stated as a fraction (1.0 is 100%), shown in %");
    const percentBody = fixtureValue(FIXTURE_RETURN);
    for (const e of percentBody.series) e.ratio_scale = "PERCENT";
    expect(seriesCaption("RETURN", available(read(withComparison(percentBody))))).toMatch(/^Return, a ratio stated as percent \(100 is 100%\) · /);
  });

  it("a return whose source states no scale is the typed cell 'Not published: NAV and drawdown' with its reason, not a number", () => {
    const series = read(fixtureValue(FIXTURE_RETURN_UNSCALED));
    const entry = series.series[0]!;
    if (entry.state !== "UNAVAILABLE") throw new Error("expected UNAVAILABLE");
    expect(unavailableChart(entry)).toEqual({
      copy: "Not published: NAV and drawdown",
      reason: `${UNAVAILABLE_SENTENCE.RATIO_SCALE_NOT_PUBLISHED} (RATIO_SCALE_NOT_PUBLISHED). Nothing is drawn from client arithmetic.`,
    });
    expect(UNAVAILABLE_SENTENCE.RATIO_SCALE_NOT_PUBLISHED).toMatch(/states no ratio scale/);
    expect(unavailableChart(entry, "FE-013/033").copy).toBe("Not published");
    // A published source with a missing scale is not "the source is not published": that flag stays false.
    expect(sourceNotPublished(series)).toBe(false);
  });

  it("scales mixed: the sentence, and the read keeps each subject apart on its own scale", () => {
    expect(MISMATCH_SENTENCE.RATIO_SCALE_MIXED).toBe("These returns are stated on different scales and are not drawn together");
    const series = read(fixtureValue(FIXTURE_RETURN_SCALE_MIXED));
    expect(series.comparison).toMatchObject({ state: "INCOMPARABLE", reasonCode: "RATIO_SCALE_MIXED" });
    const [a, b] = [available(series, 0), available(series, 1)];
    expect([seriesValueText(a, latestPoint(a)!.exact), seriesValueText(b, latestPoint(b)!.exact)]).toEqual(["1.23%", "1.23%"]);
    expect(seriesCaption("RETURN", a)).toContain("a fraction (1.0 is 100%)");
    expect(seriesCaption("RETURN", b)).toContain("percent (100 is 100%)");
  });
});
