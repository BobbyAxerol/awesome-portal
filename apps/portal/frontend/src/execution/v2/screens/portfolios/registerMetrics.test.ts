/**
 * The register's metric model, pure: score bands from the exact published value, display truncation, partition choice (no
 * cross-partition figure), range filters (inclusive, exact decimals), score states, and sort order (exact decimals, null-last in both
 * directions). Nothing here parses a number.
 */
import { describe, expect, it } from "vitest";

import { readPartitionedMetricsList, type ManagerPartitionedMetrics } from "../../readers/managerMetric";
import { moneyMetric, absentMetric, partition } from "../../readers/managerDataset.testbase";
import { filterRows, sortRows, toRow, type PortfolioRow } from "./listModel";
import {
  BAND_LABEL, bandOf, evidencePercent, inRange, measureValue, parseRange, pickPartition, scoreMissing, scoreOf, truncateDecimal, writeRange,
} from "./registerMetrics";

const score = (value: string, extra: Record<string, unknown> = {}) => ({ ...moneyMetric({ value }), unit: "SCORE", currency: null, policy_revision: "FIXTURE_LAB", ...extra });
const pct = (value: string) => ({ ...moneyMetric({ value }), unit: "PERCENT", currency: null });

function entries(list: { domain?: string; currency: string; tag: string; metrics: Record<string, unknown> }[]): readonly ManagerPartitionedMetrics[] {
  const read = readPartitionedMetricsList(list.map((e) => ({ partition: partition(e.domain ?? "PAPER", e.currency, e.tag), metrics: e.metrics })));
  if (read === null) throw new Error("test partitions are not readable");
  return read;
}

describe("score bands (spec 11.2, from the exact published value)", () => {
  it.each([
    ["0", "weak"], ["39.9999", "weak"], ["40", "neutral"], ["59.9999", "neutral"], ["60", "fair"], ["74.999", "fair"],
    ["75", "good"], ["89.9999", "good"], ["90", "very_good"], ["100", "very_good"], ["-3", "weak"],
  ])("%s is %s", (value, band) => expect(bandOf(value)).toBe(band));

  it("has a label for every band", () => {
    expect(Object.values(BAND_LABEL)).toEqual(["Weak", "Neutral", "Fair", "Good", "Very good"]);
  });

  it("prints the value truncated, never rounded across an edge (74.999 stays below 75)", () => {
    expect(truncateDecimal("74.999")).toBe("74.99");
    expect(truncateDecimal("74.9999")).toBe("74.99");
    expect(truncateDecimal("90")).toBe("90.00");
    expect(truncateDecimal("0")).toBe("0.00");
    expect(truncateDecimal("-0.001")).toBe("0.00");
    expect(truncateDecimal("-3.456")).toBe("-3.45");
    expect(truncateDecimal("12345678901234567890.123456789")).toBe("12345678901234567890.12");
  });

  it("reads evidence coverage as a whole percent from the exact ratio", () => {
    expect(evidencePercent("0.9712")).toBe("97%");
    expect(evidencePercent("1")).toBe("100%");
    expect(evidencePercent("0.183")).toBe("18%");
    expect(evidencePercent("0")).toBe("0%");
  });
});

describe("score states of a partition", () => {
  const full = entries([{ currency: "USDT", tag: "a", metrics: {
    portfolio_score: score("69.62", { source_confidence: "PROVISIONAL", methodology_ref: "FIXTURE_LAB:m" }),
    portfolio_score_p: score("70.5"), portfolio_score_r: score("68"), portfolio_score_b: score("70"),
    portfolio_score_evidence: { ...moneyMetric({ value: "0.64" }), unit: "RATIO", currency: null },
  } }]);

  it("a published value carries its band, provisional flag, policy, methodology, evidence and components", () => {
    const read = scoreOf(full, null);
    expect(read).toMatchObject({ kind: "value", exact: "69.62", band: "fair", provisional: true, policy: "FIXTURE_LAB", methodology: "FIXTURE_LAB:m", evidence: "0.64", p: "70.5", r: "68", b: "70" });
  });

  it("a typed absence keeps its code and the evidence it still publishes; it has no band", () => {
    const absent = entries([{ currency: "USDT", tag: "a", metrics: {
      portfolio_score: absentMetric({ unit: "SCORE", currency: null, reason_code: "INSUFFICIENT_EVIDENCE" }),
      portfolio_score_evidence: { ...moneyMetric({ value: "0.18" }), unit: "RATIO", currency: null },
    } }]);
    const read = scoreOf(absent, null);
    expect(read).toMatchObject({ kind: "absent", code: "INSUFFICIENT_EVIDENCE", evidence: "0.18" });
    expect(scoreMissing(absent, null)).toBe(true);
  });

  it("a true zero is a value (band weak), not a missing score", () => {
    const zero = entries([{ currency: "USDT", tag: "a", metrics: { portfolio_score: score("0") } }]);
    expect(scoreOf(zero, null)).toMatchObject({ kind: "value", exact: "0", band: "weak" });
    expect(scoreMissing(zero, null)).toBe(false);
  });

  it("no group, no partition or a key nobody publishes is `none`, never a value", () => {
    expect(scoreOf(undefined, null).kind).toBe("none");
    expect(scoreOf([], null).kind).toBe("none");
    expect(scoreOf(entries([{ currency: "USDT", tag: "a", metrics: { net_pnl: moneyMetric({ value: "1" }) } }]), null).kind).toBe("none");
    expect(scoreMissing(undefined, null)).toBe(true);
  });
});

describe("partition choice: a figure is never summed or guessed across partitions", () => {
  const two = entries([
    { currency: "USDT", tag: "u", metrics: { return_30d_pct: pct("2.5"), net_pnl: moneyMetric({ value: "100" }) } },
    { currency: "EUR", tag: "e", metrics: { return_30d_pct: pct("-1"), net_pnl: moneyMetric({ currency: "EUR", value: "7" }) } },
  ]);

  it("two partitions and no currency: there is no single figure", () => {
    expect(pickPartition(two, null)).toBeNull();
    expect(measureValue(two, "return_30d_pct", null)).toBeNull();
  });

  it("the page currency names the partition; another currency has none", () => {
    expect(measureValue(two, "net_pnl", "EUR")).toBe("7");
    expect(measureValue(two, "net_pnl", "USDT")).toBe("100");
    expect(measureValue(two, "net_pnl", "JPY")).toBeNull();
  });

  it("one partition is the figure without a currency; an absent metric is null, not zero", () => {
    const one = entries([{ currency: "USDT", tag: "u", metrics: { net_pnl: absentMetric({ reason_code: "X" }) } }]);
    expect(pickPartition(one, null)).not.toBeNull();
    expect(measureValue(one, "net_pnl", null)).toBeNull();
  });
});

describe("range filters", () => {
  it("parses min..max with either end open, refuses non-decimals, a backwards range and an empty one", () => {
    expect(parseRange("-100.5..250")).toEqual({ min: "-100.5", max: "250" });
    expect(parseRange("..5")).toEqual({ min: null, max: "5" });
    expect(parseRange("-2..")).toEqual({ min: "-2", max: null });
    expect(parseRange("1e3..5")).toBeNull();
    expect(parseRange("abc..5")).toBeNull();
    expect(parseRange("5..-5")).toBeNull();
    expect(parseRange("..")).toBeNull();
    expect(parseRange("5")).toBeNull();
    expect(parseRange(null)).toBeNull();
    expect(writeRange({ min: "-100.5", max: null })).toBe("-100.5..");
  });

  it("both ends are inclusive, compared as exact decimals, and a missing figure is outside", () => {
    const range = { min: "9", max: "10" };
    expect(inRange("9", range)).toBe(true);
    expect(inRange("10", range)).toBe(true);
    expect(inRange("10.0000000000000000001", range)).toBe(false);
    expect(inRange("8.9999999999999999999", range)).toBe(false);
    expect(inRange("100", { min: "9", max: null })).toBe(true); // not a lexical comparison ("100" < "9" as text)
    expect(inRange("-5", { min: "-10", max: null })).toBe(true);
    expect(inRange(null, range)).toBe(false);
  });
});

describe("sort and filter over the loaded rows", () => {
  const row = (id: string, name: string, over: Partial<PortfolioRow> = {}): PortfolioRow => ({
    ...toRow({ portfolioId: id, name, owner: null, state: "ACTIVE", baseCurrency: "USDT", environments: ["paper"], allocationCount: 1, deploymentCount: 1, allocatedByCurrency: [{ currency: "USDT", value: "10" }], updatedAt: "2026-10-17T00:00:00Z" } as never),
    ...over,
  });
  const rows = [row("a", "Alpha"), row("b", "Bravo"), row("c", "Charlie"), row("d", "Delta"), row("e", "Echo")];
  const groups = new Map<string, readonly ManagerPartitionedMetrics[]>([
    ["a", entries([{ currency: "USDT", tag: "a", metrics: { portfolio_score: score("9"), net_pnl: moneyMetric({ value: "-10" }) } }])],
    ["b", entries([{ currency: "USDT", tag: "a", metrics: { portfolio_score: score("100"), net_pnl: moneyMetric({ value: "9" }) } }])],
    ["c", entries([{ currency: "USDT", tag: "a", metrics: { portfolio_score: absentMetric({ unit: "SCORE", currency: null, reason_code: "INSUFFICIENT_EVIDENCE" }), net_pnl: moneyMetric({ value: "100" }) } }])],
    ["d", entries([{ currency: "USDT", tag: "a", metrics: { portfolio_score: score("0"), net_pnl: moneyMetric({ value: "-5" }) } }])],
    // e has no group at all
  ]);
  const order = (list: readonly PortfolioRow[]) => list.map((r) => r.label);

  it("orders scores as exact decimals (9 < 100), a true zero first ascending, and the rows with no score last in BOTH directions", () => {
    expect(order(sortRows(rows, { key: "score", dir: "asc" }, null, groups))).toEqual(["Delta", "Alpha", "Bravo", "Charlie", "Echo"]);
    expect(order(sortRows(rows, { key: "score", dir: "desc" }, null, groups))).toEqual(["Bravo", "Alpha", "Delta", "Charlie", "Echo"]);
  });

  it("orders money inside the page currency, exactly, with negatives in place", () => {
    expect(order(sortRows(rows, { key: "pnl", dir: "asc" }, "USDT", groups))).toEqual(["Alpha", "Delta", "Bravo", "Charlie", "Echo"]);
    expect(order(sortRows(rows, { key: "pnl", dir: "desc" }, "USDT", groups))).toEqual(["Charlie", "Bravo", "Delta", "Alpha", "Echo"]);
    // Another currency has no figure for anybody: nothing is ranked, the name order stands.
    expect(order(sortRows(rows, { key: "pnl", dir: "desc" }, "JPY", groups))).toEqual(["Alpha", "Bravo", "Charlie", "Delta", "Echo"]);
  });

  it("without served groups every measure sorts as 'no figure' and the name order stands", () => {
    expect(order(sortRows(rows, { key: "score", dir: "desc" }, null, null))).toEqual(["Alpha", "Bravo", "Charlie", "Delta", "Echo"]);
  });

  it("the Unallocated bucket stays last whatever the order", () => {
    const withBucket = [...rows, row("pf_unallocated", "Unallocated", { unallocated: true })];
    expect(order(sortRows(withBucket, { key: "score", dir: "desc" }, null, groups)).at(-1)).toBe("Unallocated");
    expect(order(sortRows(withBucket, { key: "score", dir: "asc" }, null, groups)).at(-1)).toBe("Unallocated");
  });

  it("score range: inclusive ends, the true zero is inside 0..0, absent and group-less rows are outside", () => {
    const pick = (range: { min: string | null; max: string | null }) => order(filterRows(rows, null, null, { ranges: { score: range }, groups, currency: null }));
    expect(pick({ min: "9", max: "100" })).toEqual(["Alpha", "Bravo"]);
    expect(pick({ min: "0", max: "0" })).toEqual(["Delta"]);
    expect(pick({ min: "50", max: null })).toEqual(["Bravo"]);
  });

  it("money range reads the page currency; without a currency a money range matches nothing", () => {
    expect(order(filterRows(rows, null, null, { ranges: { pnl: { min: "0", max: null } }, groups, currency: "USDT" }))).toEqual(["Bravo", "Charlie"]);
    expect(order(filterRows(rows, null, null, { ranges: { alloc: { min: "10", max: "10" } }, groups, currency: "USDT" }))).toEqual(["Alpha", "Bravo", "Charlie", "Delta", "Echo"]);
    expect(order(filterRows(rows, null, null, { ranges: { alloc: { min: "10.01", max: null } }, groups, currency: "USDT" }))).toEqual([]);
    expect(order(filterRows(rows, null, null, { ranges: { alloc: { min: "10", max: null } }, groups, currency: null }))).toEqual([]);
  });

  it("'missing or insufficient evidence' keeps exactly the rows with no published score value", () => {
    expect(order(filterRows(rows, null, null, { scoreMissing: true, groups, currency: null }))).toEqual(["Charlie", "Echo"]);
  });
});
