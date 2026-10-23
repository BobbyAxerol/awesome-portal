/** Alpha Fleet metrics model (guide M03 8.2): the pure rules of sort, range, basis and QBTS. No React, no request. */
import { describe, expect, it } from "vitest";

import type { ManagerSortField } from "../../readers/managerDataset";
import {
  MAX_SORT_KEYS, askableSorts, cycleSort, parseRanges, parseShownOptional, parseSorts, rangeFilters, rangeText, serializeRanges, serializeSorts,
  equityScalarOf, isDecimalText, type SortKey,
} from "./fleetMetricsModel";

const OFFERED: readonly ManagerSortField[] = ["name", "score", "allocation", "net_pnl", "return_30d_pct", "owner_user_id"];

describe("sort keys", () => {
  it("round-trip through the URL; unknown fields, repeats, bad directions and a fourth key are dropped", () => {
    expect(serializeSorts(parseSorts("score:desc,name:asc"))).toBe("score:desc,name:asc");
    expect(parseSorts("score:desc,score:asc,nope:asc,name:up,owner_user_id:asc,health:asc,venue:asc").map((key) => key.field)).toEqual(["score", "owner_user_id", "health"]);
    expect(parseSorts(null)).toEqual([]);
    expect(MAX_SORT_KEYS).toBe(3);
  });

  it("a click adds, reverses, then removes; the fourth key pushes out the oldest", () => {
    let keys: readonly SortKey[] = [];
    keys = cycleSort(keys, "score");
    expect(keys).toEqual([{ field: "score", dir: "asc" }]);
    keys = cycleSort(keys, "name");
    keys = cycleSort(keys, "score");
    expect(keys).toEqual([{ field: "score", dir: "desc" }, { field: "name", dir: "asc" }]);
    keys = cycleSort(keys, "score");
    expect(keys).toEqual([{ field: "name", dir: "asc" }]);
    keys = cycleSort(cycleSort(cycleSort(keys, "owner_user_id"), "health"), "venue");
    expect(keys.map((key) => key.field)).toEqual(["owner_user_id", "health", "venue"]);
  });

  it("is askable only for a field the dataset offers, and a money field only with a pinned partition", () => {
    const keys = parseSorts("net_pnl:desc,score:asc,health:asc");
    const unpinned = askableSorts(keys, OFFERED, false);
    expect(unpinned.sort.map((key) => key.field)).toEqual(["score"]);
    expect(unpinned.unaskable.map((entry) => [entry.key.field, entry.why])).toEqual([
      ["net_pnl", "A money order needs one economic partition (choose a Basis)."],
      ["health", "The dataset does not offer this field for sorting."],
    ]);
    expect(askableSorts(keys, OFFERED, true).sort.map((key) => key.field)).toEqual(["net_pnl", "score"]);
    expect(askableSorts(keys, null, true).sort).toEqual([]);
  });
});

describe("ranges", () => {
  it("parse only decimals with a bound, once per field; a float, an exponent or a lexical word is dropped", () => {
    expect(parseRanges("score~60~75,net_pnl~~100,score~1~2,return_30d_pct~1e3~,allocation~abc~,health~1~2,equity_30d_end_value~~")).toEqual([
      { field: "score", min: "60", max: "75" }, { field: "net_pnl", min: null, max: "100" },
    ]);
    expect(serializeRanges(parseRanges("score~60~75,net_pnl~~100"))).toBe("score~60~75,net_pnl~~100");
    expect(isDecimalText("-0.5")).toBe(true);
    for (const bad of ["", "1e3", "01", ".5", "5.", "NaN", "- 1"]) expect(isDecimalText(bad), bad).toBe(false);
  });

  it("are inclusive GTE / LTE on the wire; a money range without a pinned partition is left out", () => {
    const ranges = parseRanges("score~60~75,net_pnl~-5~,allocation~~900.5");
    expect(rangeFilters(ranges, OFFERED, false)).toEqual([{ field: "score", op: "GTE", value: "60" }, { field: "score", op: "LTE", value: "75" }]);
    expect(rangeFilters(ranges, OFFERED, true)).toEqual([
      { field: "score", op: "GTE", value: "60" }, { field: "score", op: "LTE", value: "75" }, { field: "net_pnl", op: "GTE", value: "-5" }, { field: "allocation", op: "LTE", value: "900.5" },
    ]);
    // a field the dataset does not offer is not asked
    expect(rangeFilters(parseRanges("unrealized_pnl~1~2"), OFFERED, true)).toEqual([]);
  });

  it("are worded with the unit and the boundary rule", () => {
    expect(rangeText({ field: "score", min: "60", max: "75" }, null)).toBe("QBTS 60 to 75 (inclusive; score points, 0 to 100)");
    expect(rangeText({ field: "net_pnl", min: "-5", max: null }, "Paper · USDT")).toBe("PNL Amount at least -5 (inclusive; in Paper · USDT)");
    expect(rangeText({ field: "net_pnl", min: null, max: "9" }, null)).toBe("PNL Amount at most 9 (inclusive; needs a basis)");
  });
});

describe("small parsers", () => {
  it("the optional columns are the optional ones only", () => {
    expect([...parseShownOptional("venue,qbts,drawdown,nope")]).toEqual(["venue", "drawdown"]);
  });
  it("the equity scalar is the value unless one of the two others is named", () => {
    expect(equityScalarOf(null).id).toBe("value");
    expect(equityScalarOf("return").field).toBe("return_30d_pct");
    expect(equityScalarOf("drawdown").field).toBeNull();
    expect(equityScalarOf("sparkline").id).toBe("value");
  });
});
