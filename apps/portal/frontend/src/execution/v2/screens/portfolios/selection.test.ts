/** The Compare selection in the URL: clean ids only, four at most, the alias read and never written. */
import { describe, expect, it } from "vitest";

import { COMPARE_MAX, COMPARE_MIN, IN_PARAM, parseSelection, partitionByCurrency, readiness, selectionFrom, withSelection } from "./selection";

describe("parseSelection", () => {
  it("reads a comma list in order and drops what is not a clean id, a repeat, or the fifth", () => {
    expect(parseSelection("a,b,c")).toEqual({ ids: ["a", "b", "c"], dropped: 0 });
    expect(parseSelection(" a , b ,, a, bad id, x/y, c, d, e")).toEqual({ ids: ["a", "b", "c", "d"], dropped: 4 });
    expect(parseSelection("pf_TEST_ONLY_core,acct:1@x.y-z")).toEqual({ ids: ["pf_TEST_ONLY_core", "acct:1@x.y-z"], dropped: 0 });
  });

  it("is empty for nothing, and refuses ids that start with a symbol or run past the bound", () => {
    expect(parseSelection(null)).toEqual({ ids: [], dropped: 0 });
    expect(parseSelection("   ")).toEqual({ ids: [], dropped: 0 });
    expect(parseSelection(`-a,.b,_c,${"x".repeat(192)}`)).toEqual({ ids: [], dropped: 4 });
    expect(parseSelection(`${"x".repeat(191)}`).ids).toHaveLength(1);
  });

  it("holds the published bounds", () => {
    expect([COMPARE_MIN, COMPARE_MAX]).toEqual([2, 4]);
  });
});

describe("the URL", () => {
  it("reads `in`, falls back to the `ids` alias, and prefers `in`", () => {
    expect(selectionFrom(new URLSearchParams("in=a,b")).ids).toEqual(["a", "b"]);
    expect(selectionFrom(new URLSearchParams("ids=c,d")).ids).toEqual(["c", "d"]);
    expect(selectionFrom(new URLSearchParams("in=a&ids=c")).ids).toEqual(["a"]);
  });

  it("writes `in`, removes the alias, keeps every other param, and removes the key when empty", () => {
    const base = new URLSearchParams("ids=a&env=paper&window=30d&tab=x");
    const next = withSelection(base, ["b", "c"]);
    expect(next.get(IN_PARAM)).toBe("b,c");
    expect(next.has("ids")).toBe(false);
    expect(next.get("env")).toBe("paper");
    expect(next.get("window")).toBe("30d");
    expect(withSelection(next, []).has(IN_PARAM)).toBe(false);
    expect(base.get("ids")).toBe("a");
  });
});

describe("readiness and partitions", () => {
  it("is empty, too few, or ready", () => {
    expect(readiness(0)).toEqual({ kind: "empty" });
    expect(readiness(1)).toEqual({ kind: "too-few", count: 1 });
    expect(readiness(2)).toEqual({ kind: "ready", count: 2 });
    expect(readiness(4)).toEqual({ kind: "ready", count: 4 });
  });

  it("groups by base currency in the order the first member was picked and never merges two groups", () => {
    const parts = partitionByCurrency([{ id: "a", currency: "USDT" }, { id: "b", currency: "JPY" }, { id: "c", currency: "USDT" }, { id: "d", currency: "VND" }]);
    expect(parts).toEqual([{ currency: "USDT", ids: ["a", "c"] }, { currency: "JPY", ids: ["b"] }, { currency: "VND", ids: ["d"] }]);
    expect(partitionByCurrency([])).toEqual([]);
  });
});
