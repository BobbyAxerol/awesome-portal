/**
 * Budget bar and concentration bar geometry (WP-F1, `capitalModel.ts`): the only arithmetic is a whole-percent fill from two published
 * exact strings of ONE partition, in bigint; everything printed stays the server's string. Each case that cannot be drawn says why
 * and draws nothing (never a zero-width bar that reads as "0% used").
 */
import { describe, expect, it } from "vitest";

import { absentMetric, moneyMetric, partition } from "../../readers/managerDataset.testbase";
import { datasetFor } from "./datasetFixtures.testbase";
import { budgetUse, scaledOf, shareBars, wholePercent } from "./capitalModel";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = any;

/** One statement entry per partition, read by the real reader (a bad shape would throw in `datasetFor`). */
const statements = (entries: { p: ReturnType<typeof partition>; metrics: Record<string, Body> }[]) =>
  datasetFor("PORTFOLIO", "pf_x", (body: Body) => {
    body.capital_statements = entries.map((e) => ({ partition: e.p, metrics: e.metrics }));
  }).capitalStatements;

const USDT = () => partition("ACTUAL", "USDT", "actual");

describe("scaledOf and wholePercent", () => {
  it("reads exact decimals as bigint and refuses anything else", () => {
    expect(scaledOf("12500.50")).toBe(12500500n * 10n ** 21n);
    expect(scaledOf("-0.5")).toBe(-5n * 10n ** 23n);
    expect(scaledOf("1e3")).toBeNull();
    expect(scaledOf("01")).toBeNull();
    expect(scaledOf("")).toBeNull();
    expect(scaledOf("NaN")).toBeNull();
  });

  it("is the whole percent of part in whole, truncated, clamped to 100", () => {
    expect(wholePercent("14580", "18000")).toBe(81);
    expect(wholePercent("0", "18000")).toBe(0);
    expect(wholePercent("18000", "18000")).toBe(100);
    expect(wholePercent("20000", "18000")).toBe(100);
    expect(wholePercent("0.01", "100000000")).toBe(0);
  });

  it("answers null unless both are decimals, the part is not negative and the whole is positive", () => {
    expect(wholePercent("1", "0")).toBeNull();
    expect(wholePercent("-1", "10")).toBeNull();
    expect(wholePercent("x", "10")).toBeNull();
    expect(wholePercent("1", "-10")).toBeNull();
  });
});

describe("budgetUse", () => {
  it("draws allocated and recalling against the approved budget, from the same partition, and keeps every figure as published", () => {
    const [use] = budgetUse(statements([{ p: USDT(), metrics: { allocation: moneyMetric({ value: "14580" }), current_budget: moneyMetric({ value: "18000" }), recalling: moneyMetric({ value: "360" }) } }]));
    expect(use!.usedPct).toBe(81);
    expect(use!.recallPct).toBe(2);
    expect(use!.note).toBeNull();
    expect(use!.used!.exact).toBe("14580");
    expect(use!.limit!.exact).toBe("18000");
    expect(use!.recalling!.exact).toBe("360");
  });

  it("keeps the recalling segment inside what remains of the bar", () => {
    const [use] = budgetUse(statements([{ p: USDT(), metrics: { allocation: moneyMetric({ value: "9500" }), current_budget: moneyMetric({ value: "10000" }), recalling: moneyMetric({ value: "2000" }) } }]));
    expect(use!.usedPct).toBe(95);
    expect(use!.recallPct).toBe(5);
  });

  it("says over budget instead of drawing past the bar", () => {
    const [use] = budgetUse(statements([{ p: USDT(), metrics: { allocation: moneyMetric({ value: "22500" }), current_budget: moneyMetric({ value: "18000" }) } }]));
    expect(use!.usedPct).toBe(100);
    expect(use!.note).toContain("above the approved budget");
  });

  it("a true zero allocation is a bar of 0%, not an absence", () => {
    const [use] = budgetUse(statements([{ p: USDT(), metrics: { allocation: moneyMetric({ value: "0" }), current_budget: moneyMetric({ value: "100" }) } }]));
    expect(use!.usedPct).toBe(0);
    expect(use!.note).toBeNull();
  });

  it("draws no bar, and says which figure is missing, when either is a typed absence or not published", () => {
    const rows = budgetUse(statements([
      { p: USDT(), metrics: { allocation: absentMetric({ reason_code: "SOURCE_FACTS_NOT_PUBLISHED", unit: "MONEY", currency: "USDT" }), current_budget: moneyMetric({ value: "100" }) } },
      { p: partition("PAPER", "USDT", "usdt"), metrics: { allocation: moneyMetric({ value: "5" }), current_budget: absentMetric({ reason_code: "SOURCE_FACTS_NOT_PUBLISHED", unit: "MONEY", currency: "USDT" }) } },
    ]));
    expect(rows.map((r) => r.usedPct)).toEqual([null, null]);
    expect(rows[0]!.note).toContain("allocation is not published");
    expect(rows[1]!.note).toContain("approved budget is not published");
  });

  it("draws no bar for a budget that is not a positive amount", () => {
    const zero = budgetUse(statements([{ p: USDT(), metrics: { allocation: moneyMetric({ value: "5" }), current_budget: moneyMetric({ value: "0" }) } }]));
    expect(zero[0]!.usedPct).toBeNull();
    expect(zero[0]!.note).toContain("not a positive amount");
  });

  it("one entry per partition, never merged; an entry with neither key is skipped", () => {
    const rows = budgetUse(statements([
      { p: USDT(), metrics: { allocation: moneyMetric({ value: "50" }), current_budget: moneyMetric({ value: "100" }) } },
      { p: partition("PAPER", "USDT", "usdt"), metrics: { allocation: moneyMetric({ value: "10" }), current_budget: moneyMetric({ value: "100" }) } },
      { p: partition("PAPER", "EUR", "eur"), metrics: { balance_total: moneyMetric({ currency: "EUR", value: "9" }) } },
    ]));
    expect(rows.map((r) => [r.partition.economicDomain, r.partition.currency, r.usedPct])).toEqual([["ACTUAL", "USDT", 50], ["PAPER", "USDT", 10]]);
  });
});

describe("shareBars", () => {
  const share = (value: string | null) => ({
    net_pnl: moneyMetric({ value: "1" }),
    allocation_share_pct: value === null ? absentMetric({ reason_code: "SOURCE_FACTS_NOT_PUBLISHED", unit: "PERCENT", currency: null }) : { ...moneyMetric({ value }), unit: "PERCENT", currency: null },
  });
  const group = (alpha: string, metrics: Body) => ({ key: [{ field: "alpha_id", value: alpha }], unique_row_count: 1, totals_scope: "FULL_AUTHORIZED_FILTERED_QUERY", economic_partitions: [{ partition: USDT(), metrics }] });
  const groupsOf = (list: Body[]) => datasetFor("PORTFOLIO", "pf_x", (body: Body) => { body.groups = list; }).groups;

  it("one segment per alpha group with the PUBLISHED share as its width, in the server's order", () => {
    const [bar] = shareBars(groupsOf([group("alpha_a", share("20.003199")), group("alpha_b", share("79.9968"))]));
    expect(bar!.segments.map((s) => s.id)).toEqual(["alpha_a", "alpha_b"]);
    expect(bar!.segments.map((s) => s.exact)).toEqual(["20.003199", "79.9968"]);
    expect(bar!.segments[0]!.width).toBeCloseTo(20.003199, 5);
    expect(bar!.segments[1]!.width).toBeCloseTo(79.9968, 4);
    expect(bar!.withoutShare).toBe(0);
  });

  it("a group that publishes no share gets no segment and is counted, never drawn as zero", () => {
    const [bar] = shareBars(groupsOf([group("alpha_a", share("100")), group("alpha_b", share(null))]));
    expect(bar!.segments.map((s) => s.id)).toEqual(["alpha_a"]);
    expect(bar!.withoutShare).toBe(1);
  });

  it("partitions stay apart (one bar each) and a group of another grouping is ignored", () => {
    const eur = { key: [{ field: "alpha_id", value: "alpha_c" }], unique_row_count: 1, totals_scope: "FULL_AUTHORIZED_FILTERED_QUERY", economic_partitions: [{ partition: partition("ACTUAL", "EUR", "eur"), metrics: { net_pnl: moneyMetric({ currency: "EUR", value: "1" }), allocation_share_pct: { ...moneyMetric({ value: "100" }), unit: "PERCENT", currency: null } } }] };
    const otherGrouping = datasetFor("PORTFOLIO", "pf_9", (body: Body) => { body.groups[0].economic_partitions = [{ partition: USDT(), metrics: share("100") }]; }).groups;
    const bars = shareBars([...groupsOf([group("alpha_a", share("100")), eur]), ...otherGrouping]);
    expect(bars.map((b) => `${b.partition.economicDomain}|${b.partition.currency}`)).toEqual(["ACTUAL|USDT", "ACTUAL|EUR"]);
    expect(bars.flatMap((b) => b.segments.map((s) => s.id))).toEqual(["alpha_a", "alpha_c"]);
  });
});
