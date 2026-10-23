/** WP-K slice 6: what the register asks the server for, and how it uses the answer (order and membership only). */
import { describe, expect, it } from "vitest";

import type { ManagerPartitionedMetrics } from "../../readers/managerMetric";
import { applyServerOrder, groupAsk, pinnedPartition } from "./serverOrder";
import type { SortSpec } from "./listModel";

const part = (currency: string, tag = "n", domain: "ACTUAL" | "PAPER" = "PAPER") => ({ economicDomain: domain, currency, basis: "b", nativeProfileRef: tag, domainProofRef: "d" });
const value = (exact: string) => ({ kind: "value", exact, zero: false, unit: "MONEY", currency: "USDT" } as never);
const entry = (currency: string, keys: string[], tag = "n"): ManagerPartitionedMetrics => ({ partition: part(currency, tag), metrics: new Map(keys.map((k) => [k, value("1")])) });
const groups = (...items: Array<[string, ManagerPartitionedMetrics[]]>) => new Map(items);
const sort = (key: SortSpec["key"], dir: "asc" | "desc" = "desc"): SortSpec => ({ key, dir });

describe("pinnedPartition", () => {
  it("pins the one partition of a currency and refuses to guess between two", () => {
    expect(pinnedPartition(groups(["a", [entry("USDT", ["net_pnl"])]], ["b", [entry("USDT", ["net_pnl"]), entry("VND", ["net_pnl"])]]), "USDT")).toMatchObject({ currency: "USDT", nativeProfileRef: "n" });
    expect(pinnedPartition(groups(["a", [entry("USDT", ["net_pnl"], "x")]], ["b", [entry("USDT", ["net_pnl"], "y")]]), "USDT")).toBeNull();
    expect(pinnedPartition(groups(["a", [entry("USDT", ["net_pnl"])]]), "EUR")).toBeNull();
  });
});

describe("groupAsk", () => {
  const g = groups(["a", [entry("USDT", ["net_pnl", "return_30d_pct", "portfolio_score", "allocation"])]]);
  it("asks for nothing when the sort is a list column and no range is set", () => {
    expect(groupAsk({ sort: sort("name", "asc"), ranges: {}, currency: null, groups: g })).toBeNull();
    expect(groupAsk({ sort: sort("pnl"), ranges: {}, currency: null, groups: null })).toBeNull();
  });
  it("maps the sort to the published group metric and a range to GTE and LTE, exact text, with the currency's partition pinned", () => {
    const ask = groupAsk({ sort: sort("pnl"), ranges: { ret: { min: "-2", max: "5.5" }, pnl: { min: "0", max: null } }, currency: "USDT", groups: g })!;
    expect(ask.groupSort).toEqual([{ metricKey: "net_pnl", direction: "desc" }]);
    expect(ask.groupFilters).toEqual([{ metricKey: "net_pnl", op: "GTE", value: "0" }, { metricKey: "return_30d_pct", op: "GTE", value: "-2" }, { metricKey: "return_30d_pct", op: "LTE", value: "5.5" }]);
    expect(ask.economicPartition).toMatchObject({ currency: "USDT" });
  });
  it("does not ask a money sort without a currency, a metric no group publishes, or a currency that cannot be pinned", () => {
    expect(groupAsk({ sort: sort("pnl"), ranges: {}, currency: null, groups: g })).toBeNull();
    expect(groupAsk({ sort: sort("dd"), ranges: {}, currency: null, groups: g })).toBeNull();
    expect(groupAsk({ sort: sort("ret"), ranges: { dd: { min: "-3", max: null } }, currency: null, groups: g })).toBeNull();
    expect(groupAsk({ sort: sort("pnl"), ranges: {}, currency: "EUR", groups: g })).toBeNull();
  });
  it("a non-money sort needs no currency and no pin; the allocated range reads the allocation group metric", () => {
    expect(groupAsk({ sort: sort("ret"), ranges: {}, currency: null, groups: g })).toEqual({ groupSort: [{ metricKey: "return_30d_pct", direction: "desc" }], groupFilters: [] });
    expect(groupAsk({ sort: sort("name", "asc"), ranges: { alloc: { min: "100", max: null } }, currency: "USDT", groups: g })!.groupFilters).toEqual([{ metricKey: "allocation", op: "GTE", value: "100" }]);
  });
});

describe("applyServerOrder", () => {
  const rows = ["p1", "p2", "p3", "p4"].map((portfolioId) => ({ portfolioId }));
  const ids = (list: readonly { portfolioId: string }[]) => list.map((r) => r.portfolioId);
  it("a sort puts the listed portfolios first in the server's order and the rest after, through `rest`", () => {
    expect(ids(applyServerOrder(rows, ["p3", "p1"], { sorted: true, filtered: false }))).toEqual(["p3", "p1", "p2", "p4"]);
    expect(ids(applyServerOrder(rows, ["p3", "p1"], { sorted: true, filtered: false, rest: (left) => [...left].reverse() }))).toEqual(["p3", "p1", "p4", "p2"]);
  });
  it("a range drops the portfolios the server did not list, with or without a sort; a filter alone keeps the caller's order", () => {
    expect(ids(applyServerOrder(rows, ["p3", "p1"], { sorted: true, filtered: true }))).toEqual(["p3", "p1"]);
    expect(ids(applyServerOrder(rows, ["p3", "p1"], { sorted: false, filtered: true }))).toEqual(["p1", "p3"]);
    expect(ids(applyServerOrder(rows, [], { sorted: false, filtered: false }))).toEqual(["p1", "p2", "p3", "p4"]);
  });
});
