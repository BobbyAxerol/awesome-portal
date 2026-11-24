import { describe, expect, it } from "vitest";
import { computeObservedFigures as compute, fromScaled, ratioString, toScaled, type ObservedComputationContext, type ObservedRelationInput }
  from "../src/execution-v2/observed-read.figures";
import { OBSERVED_THRESHOLDS } from "../src/execution-v2/observed-read.contract";

const H = 3_600_000;
const T0 = Date.parse("2026-11-20T00:00:00Z");

function row(id: number, account: string, hour: number, equity: string, netPnl: string, currency = "USDT", extra: Record<string, unknown> = {}) {
  return { fields: { id, account_id: account, ts: new Date(T0 + hour * H).toISOString(), mode: "paper", equity, net_pnl: netPnl,
    currency, drawdown: "0.00000000", ...extra }, lineage: { profile_id: "PAPER_OKX_SWAP" } };
}
const relation = (items: unknown[], over: Partial<ObservedRelationInput> = {}): ObservedRelationInput => ({
  availability: "AVAILABLE", completeness: "COMPLETE", freshness: "FRESH", reason_code: null, window_truncated: false,
  items: items as ObservedRelationInput["items"], ...over });
const context = (input: ObservedRelationInput | null, over: Partial<ObservedComputationContext> = {}): ObservedComputationContext => ({
  // Explicit synthetic population for arithmetic vectors, NOT a production
  // population proof. Negative tests below supply independent census inputs.
  census: { availability: "AVAILABLE", completeness: "COMPLETE", freshness: "FRESH", items: [...new Map((input?.items ?? [])
    .filter(item => typeof (item.fields as Record<string, unknown>)?.account_id === "string" &&
      (item.fields as Record<string, unknown>).mode === "paper")
    .map(item => { const f = item.fields as Record<string, unknown>; return [f.account_id, { fields: {
      account_id: f.account_id, base_currency: f.currency, mode: "paper",
    } }] as const; })).values()] },
  snapshot_freshness: "FRESH", snapshot_completeness: "COMPLETE", cumulative_net_pnl_supported: true,
  test_only_grid_coverage: { qualification: "TEST_ONLY", minimum_points: 2, minimum_duration_ms: 1, maximum_gap_ms: 30 * 24 * H }, ...over,
});
const computeObservedFigures = (input: ObservedRelationInput | null, now: number, over: Partial<ObservedComputationContext> = {}) =>
  compute(input, now, context(input, over));
const byId = (result: ReturnType<typeof computeObservedFigures>, id: string, currency = "USDT") =>
  result.figures.find(item => item.figure_id === id && item.currency === currency)!;

describe("observed decimal helpers (exact, no float)", () => {
  it("parses exact decimals and refuses anything else", () => {
    expect(toScaled("600000.000000000000000000")).toBe(600000n * 10n ** 18n);
    expect(toScaled("-0.5")).toBe(-5n * 10n ** 17n);
    for (const bad of ["1e3", "NaN", "", " 1", "1\n", "1.", ".5", "0x10", "1.0000000000000000001", "9".repeat(31), 5, null]) expect(toScaled(bad as never)).toBeNull();
  });
  it("formats canonically and never prints -0", () => {
    expect(fromScaled(740020485000000000000000n)).toBe("740020.485");
    expect(fromScaled(0n)).toBe("0");
    expect(fromScaled(-5n * 10n ** 17n)).toBe("-0.5");
  });
  it("truncates ratios toward zero at 10 digits", () => {
    expect(ratioString(1n, 3n)).toBe("0.3333333333");
    expect(ratioString(-1n, 3n)).toBe("-0.3333333333");
    expect(ratioString(0n, 5n)).toBe("0");
    expect(ratioString(1n, 0n)).toBeNull();
  });
});

describe("observed fund figures", () => {
  const now = T0 + 10 * H;

  it("single currency: NAV is the sum of latest equity, net PnL the sum of latest cumulative net_pnl", () => {
    const items = [
      row(1, "a", 0, "100", "0"), row(2, "b", 0, "200", "0"),
      row(3, "a", 9, "101.25", "1.25"), row(4, "b", 9, "199.5", "-0.5"),
      row(5, "a", 10, "102", "2"), row(6, "b", 10, "199", "-1"),
    ];
    const result = computeObservedFigures(relation(items), now);
    expect(byId(result, "NAV").value).toBe("301");
    expect(byId(result, "NET_PNL").value).toBe("1");
    expect(byId(result, "NAV")).toMatchObject({ availability: "AVAILABLE", unit: "MONEY", currency: "USDT",
      source_confidence: "UNKNOWN", policy_revision: "NONE", calculation_revision: "core-observed.v1", accounts_total: 2 });
    expect(result.quality).toMatchObject({ completeness: "COMPLETE", freshness: "FRESH" });
    expect(result.not_published.map(item => item.figure)).toEqual(expect.arrayContaining(["SCORE", "REGIME", "PORTFOLIO_NAV", "CAPITAL_MARKERS"]));
  });

  it("return is the equity change over the complete grid, exact and truncated toward zero", () => {
    const items = [row(1, "a", 0, "100", "0"), row(2, "b", 0, "200", "0"), row(3, "a", 10, "110", "10"), row(4, "b", 10, "190", "-10")];
    const result = computeObservedFigures(relation(items), now);
    expect(byId(result, "RETURN").value).toBe("0"); // 300 -> 300
    const up = computeObservedFigures(relation([row(1, "a", 0, "100", "0"), row(2, "a", 10, "100.1", "0.1")]), now);
    expect(byId(up, "RETURN").value).toBe("0.001");
    expect(byId(up, "RETURN").caveats).toContain("NOT_CAPITAL_FLOW_ADJUSTED");
    const third = computeObservedFigures(relation([row(1, "a", 0, "3", "0"), row(2, "a", 10, "4", "1")]), now);
    expect(byId(third, "RETURN").value).toBe("0.3333333333");
  });

  it("drawdown is the exact peak-to-trough fraction of the NAV grid, <= 0", () => {
    const items = [row(1, "a", 0, "100", "0"), row(2, "a", 2, "120", "20"), row(3, "a", 4, "90", "-10"), row(4, "a", 6, "130", "30"), row(5, "a", 8, "117", "17")];
    const result = computeObservedFigures(relation(items), T0 + 9 * H);
    expect(byId(result, "DRAWDOWN").value).toBe("-0.25"); // 120 -> 90
    const flat = computeObservedFigures(relation([row(1, "a", 0, "100", "0"), row(2, "a", 1, "101", "1")]), T0 + 2 * H);
    expect(byId(flat, "DRAWDOWN").value).toBe("0");
  });

  it("two currencies give two partitions and never a total", () => {
    const items = [row(1, "a", 9, "100", "1"), row(2, "b", 9, "50", "2", "EUR"), row(3, "a", 10, "110", "2"), row(4, "b", 10, "55", "3", "EUR")];
    const result = computeObservedFigures(relation(items), now);
    expect(result.figures.filter(item => item.figure_id === "NAV").map(item => [item.currency, item.value])).toEqual([["EUR", "55"], ["USDT", "110"]]);
    expect(result.figures.some(item => item.currency === "")).toBe(false);
    expect(result.figures.filter(item => item.figure_id === "NAV")).toHaveLength(2);
  });

  it("an incomplete grid makes return and drawdown unavailable, never forward filled", () => {
    const items = [row(1, "a", 0, "100", "0"), row(2, "b", 1, "200", "0"), row(3, "a", 2, "100", "0"), row(4, "b", 3, "200", "0")];
    const result = computeObservedFigures(relation(items), T0 + 4 * H);
    expect(byId(result, "RETURN")).toMatchObject({ availability: "UNAVAILABLE", value: null, reason_code: "NAV_GRID_INCOMPLETE" });
    expect(byId(result, "DRAWDOWN")).toMatchObject({ availability: "UNAVAILABLE", reason_code: "NAV_GRID_INCOMPLETE" });
    expect(byId(result, "NAV").value).toBe("300"); // latest per account is still reported
    const one = computeObservedFigures(relation([row(1, "a", 0, "100", "0")]), T0 + H);
    expect(byId(one, "RETURN").reason_code).toBe("NAV_GRID_TOO_SHORT");
  });

  it("a zero or negative first NAV makes the return unavailable", () => {
    const result = computeObservedFigures(relation([row(1, "a", 0, "0", "0"), row(2, "a", 5, "10", "10")]), T0 + 6 * H);
    expect(byId(result, "RETURN")).toMatchObject({ availability: "UNAVAILABLE", reason_code: "FIRST_NAV_NOT_POSITIVE" });
    expect(byId(result, "DRAWDOWN")).toMatchObject({ availability: "UNAVAILABLE", reason_code: "NAV_NOT_POSITIVE" });
  });

  it("stale rows are PARTIAL with STALE freshness and a reason", () => {
    const items = [row(1, "a", 0, "100", "0"), row(2, "a", 1, "101", "1")];
    const result = computeObservedFigures(relation(items), T0 + H + OBSERVED_THRESHOLDS.figure_rows_stale_after_ms + 1);
    expect(byId(result, "NAV")).toMatchObject({ availability: "PARTIAL", reason_code: "FIGURE_ROWS_STALE" });
    expect(byId(result, "NAV").quality.freshness).toBe("STALE");
    expect(result.quality).toMatchObject({ completeness: "PARTIAL", freshness: "STALE" });
    const fresh = computeObservedFigures(relation(items), T0 + H + OBSERVED_THRESHOLDS.figure_rows_stale_after_ms);
    // Only the latest row contributes this account's current NAV; its age is
    // exactly the threshold. Historical grid points have their own freshness.
    expect(byId(fresh, "NAV")).toMatchObject({ availability: "AVAILABLE", quality: { freshness: "FRESH" } });
  });

  it("a timestamp spread between accounts beyond the threshold is PARTIAL", () => {
    const wide = [row(1, "a", 0, "100", "0"), row(2, "b", 3, "100", "0")];
    const result = computeObservedFigures(relation(wide), T0 + 3 * H);
    expect(byId(result, "NAV")).toMatchObject({ availability: "PARTIAL", reason_code: "ACCOUNT_TIMESTAMP_SPREAD_EXCEEDED", accounts_total: 2 });
    const ok = computeObservedFigures(relation([row(1, "a", 0, "100", "0"), row(2, "b", 2, "100", "0")]), T0 + 2 * H);
    expect(byId(ok, "NAV").availability).toBe("AVAILABLE");
  });

  it("a truncated window or a non-complete relation is PARTIAL, not silently complete", () => {
    const items = [row(1, "a", 0, "100", "0"), row(2, "a", 1, "101", "1")];
    const truncated = computeObservedFigures(relation(items, { window_truncated: true }), T0 + 2 * H);
    expect(byId(truncated, "NAV")).toMatchObject({ availability: "PARTIAL", reason_code: "WINDOW_TRUNCATED" });
    const partial = computeObservedFigures(relation(items, { completeness: "PARTIAL" }), T0 + 2 * H);
    expect(byId(partial, "NAV").reason_code).toBe("SOURCE_RELATION_NOT_COMPLETE");
  });

  it("invalid rows are excluded and flagged; other-mode rows are never folded in", () => {
    const items = [row(1, "a", 0, "100", "0"), row(2, "a", 1, "oops", "0"), row(3, "z", 1, "999", "0", "USDT", { mode: "sandbox" }),
      { fields: { account_id: "a" } }, row(4, "a", 2, "102", "2")];
    const result = computeObservedFigures(relation(items), T0 + 3 * H);
    expect(byId(result, "NAV").value).toBe("102");
    expect(byId(result, "NAV")).toMatchObject({ availability: "PARTIAL", reason_code: "ROWS_REJECTED_INVALID", accounts_total: 1 });
  });

  it("empty, missing and unavailable relations publish nothing and say why", () => {
    for (const [input, reason] of [
      [relation([]), "NO_EQUITY_ROWS"], [null, "EQUITY_RELATION_NOT_SERVED_FOR_PROFILE"],
      [relation([{ fields: { account_id: "a" } }]), "EQUITY_ROWS_INVALID"],
      [relation([], { availability: "UNAVAILABLE", reason_code: "N31_PROJECTED_RELATION_UNAVAILABLE" }), "N31_PROJECTED_RELATION_UNAVAILABLE"],
    ] as const) {
      // Keep the independent population valid so each case reaches its intended
      // equity-relation gate rather than failing the earlier census gate.
      const result = computeObservedFigures(input, now, { census: {
        availability: "AVAILABLE", completeness: "COMPLETE", freshness: "FRESH",
        items: [{ fields: { account_id: "a", base_currency: "USDT", mode: "paper" } }],
      } });
      expect(result.figures).toEqual([]);
      expect(result.quality).toMatchObject({ completeness: "UNRESOLVED", reasons: [reason] });
      expect(result.not_published.filter(item => ["NAV", "NET_PNL", "RETURN", "DRAWDOWN"].includes(item.figure)).every(item => item.reason_code === reason)).toBe(true);
    }
  });

  it("ties on the same timestamp resolve by the higher row id, deterministically", () => {
    const items = [row(7, "a", 5, "111", "11"), row(9, "a", 5, "222", "22"), row(8, "a", 5, "333", "33")];
    expect(byId(computeObservedFigures(relation(items), T0 + 6 * H), "NAV").value).toBe("222");
  });

  it("orders string and mixed safe/large INTEGER row ids numerically, in either input order", () => {
    for (const ids of [["9", "10"], [9, "10"], ["9007199254740992", "10000000000000000"]]) {
      const items = [row(1, "a", 5, "111", "11", "USDT", { id: ids[0] }), row(2, "a", 5, "222", "22", "USDT", { id: ids[1] })];
      for (const ordered of [items, [...items].reverse()])
        expect(byId(computeObservedFigures(relation(ordered), T0 + 6 * H), "NAV").value).toBe("222");
    }
  });

  it("does not infer a complete account census from surviving equity rows", () => {
    const input = relation([row(1, "a", 9, "100", "0"), row(2, "a", 10, "101", "1")]);
    const census = { availability: "AVAILABLE", completeness: "COMPLETE", freshness: "FRESH", items: [
      { fields: { account_id: "a", base_currency: "USDT" } }, { fields: { account_id: "b", base_currency: "USDT" } },
    ] };
    const result = computeObservedFigures(input, now, { census });
    expect(byId(result, "NAV")).toMatchObject({ value: "101", availability: "PARTIAL", accounts_total: 2, accounts_reported: 1 });
    expect(byId(result, "RETURN")).toMatchObject({ value: null, reason_code: "EXPECTED_ACCOUNTS_NOT_REPORTED" });
    for (const missing of [undefined, null]) {
      const result = compute(input, now, missing === null ? { ...context(input), census: null } : undefined);
      expect(result.figures).toEqual([]);
      expect(result.not_published[0]?.reason_code).toBe("ACCOUNT_CENSUS_NOT_SERVED");
    }
    const incomplete = computeObservedFigures(input, now, { census: { ...census, completeness: "PARTIAL" } });
    expect(incomplete.figures).toEqual([]);
    expect(incomplete.not_published[0]?.reason_code).toBe("ACCOUNT_CENSUS_NOT_COMPLETE");
  });

  it("preserves missing expected currencies and rejects ambiguous or invalid census rows", () => {
    const input = relation([row(1, "a", 10, "100", "0")]);
    const census = { availability: "AVAILABLE", completeness: "COMPLETE", freshness: "FRESH", items: [
      { fields: { account_id: "a", base_currency: "USDT" } }, { fields: { account_id: "b", base_currency: "EUR" } },
    ] };
    expect(byId(computeObservedFigures(input, now, { census }), "NAV", "EUR")).toMatchObject({
      value: null, availability: "UNAVAILABLE", accounts_total: 1, accounts_reported: 0,
    });
    for (const fields of [{ account_id: "a", base_currency: "EUR" }, { account_id: "c" }]) {
      const result = computeObservedFigures(input, now, { census: { ...census, items: [...census.items, { fields }] } });
      expect(result.figures).toEqual([]);
    }
  });

  it("dedupes logical accounts and does not retain an old wrong-currency equity partition", () => {
    const input = relation([row(1, "a", 0, "500", "0", "EUR"), row(2, "a", 10, "100", "0")]);
    const census = { availability: "AVAILABLE", completeness: "COMPLETE", freshness: "FRESH", items: [
      { fields: { account_id: "a", base_currency: "USDT" } }, { fields: { account_id: "a", base_currency: "USDT" } },
    ] };
    const result = computeObservedFigures(input, now, { census });
    expect(result.figures.filter(f => f.figure_id === "NAV")).toHaveLength(1);
    expect(byId(result, "NAV")).toMatchObject({ value: "100", currency: "USDT", accounts_total: 1, accounts_reported: 1 });
  });

  it("preserves source/snapshot freshness and evaluates the actual grid independently", () => {
    const input = relation([row(1, "a", 0, "100", "0"), row(2, "b", 0, "100", "0"),
      row(3, "a", 1, "101", "1"), row(4, "b", 1, "101", "1"),
      row(5, "a", 9, "102", "2"), row(6, "b", 10, "102", "2")]);
    const result = computeObservedFigures(input, now);
    expect(byId(result, "NAV").quality.freshness).toBe("FRESH");
    expect(byId(result, "RETURN")).toMatchObject({ oldest_ts_ms: T0, newest_ts_ms: T0 + H, quality: { freshness: "STALE" } });
    expect(byId(result, "DRAWDOWN").quality.freshness).toBe("STALE");
    for (const freshness of ["STALE", "UNKNOWN"] as const) {
      expect(byId(computeObservedFigures({ ...input, freshness }, now), "NAV").quality.freshness).toBe(freshness);
      expect(byId(computeObservedFigures(input, now, { snapshot_freshness: freshness }), "NAV").quality.freshness).toBe(freshness);
    }
  });

  it("keeps uncalibrated, truncated and insufficient grids unavailable", () => {
    const input = relation([row(1, "a", 0, "100", "0"), row(2, "a", 10, "110", "10")]);
    expect(byId(computeObservedFigures(input, now, { test_only_grid_coverage: undefined }), "RETURN")).toMatchObject({
      value: null, reason_code: "NAV_GRID_COVERAGE_POLICY_PENDING",
    });
    expect(byId(computeObservedFigures({ ...input, window_truncated: true }, now), "DRAWDOWN")).toMatchObject({
      value: null, reason_code: "WINDOW_TRUNCATED",
    });
    const policy = { qualification: "TEST_ONLY" as const, minimum_points: 3, minimum_duration_ms: 1, maximum_gap_ms: H };
    expect(byId(computeObservedFigures(input, now, { test_only_grid_coverage: policy }), "RETURN").reason_code).toBe("NAV_GRID_COVERAGE_INSUFFICIENT");
    for (const invalid of [{ ...policy, minimum_points: 1 }, { ...policy, maximum_gap_ms: NaN }, { ...policy, minimum_duration_ms: -1 }])
      expect(byId(computeObservedFigures(input, now, { test_only_grid_coverage: invalid }), "RETURN").reason_code).toBe("NAV_GRID_COVERAGE_POLICY_PENDING");
  });

  it("handles aggregate overflow and missing PnL without a rounded number or a fabricated zero", () => {
    const huge = "9".repeat(30);
    const overflow = relation([row(1, "a", 10, huge, "0"), row(2, "b", 10, huge, "0")]);
    expect(byId(computeObservedFigures(overflow, now), "NAV")).toMatchObject({ value: null, reason_code: "OBSERVED_DECIMAL_BOUND_EXCEEDED" });
    const missingPnl = relation([row(1, "a", 10, "100", "invalid")]);
    expect(byId(computeObservedFigures(missingPnl, now), "NAV").value).toBe("100");
    expect(byId(computeObservedFigures(missingPnl, now), "NET_PNL")).toMatchObject({ value: null, reason_code: "NET_PNL_ROWS_INVALID" });
  });

  it("handles 18-digit source values exactly (no float rounding)", () => {
    const items = [row(1, "a", 0, "19994.415984500000000000", "-5.584015500000000000"), row(2, "b", 0, "0.000000000000000001", "0")];
    const result = computeObservedFigures(relation(items), T0 + H);
    expect(byId(result, "NAV").value).toBe("19994.415984500000000001");
    expect(byId(result, "NET_PNL").value).toBe("-5.5840155");
  });
});
