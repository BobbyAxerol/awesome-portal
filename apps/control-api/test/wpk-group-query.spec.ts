/** WP-K slice 6: portfolio-grain (group) sort and filter on published group metrics. Pure component proofs: no PostgreSQL, no runtime. */
import { describe, expect, it } from "vitest";
import { managerModelQuery } from "../src/execution-v2/manager-model.contract";
import { applyGroupQuery } from "../src/execution-v2/manager-model";

const partition = (currency: string, domain: "ACTUAL" | "PAPER" = "ACTUAL") => ({ economic_domain: domain, currency, basis: "b", native_profile_ref: "p", domain_proof_ref: "d" });
const metric = (value: string | null) => ({ availability: value === null ? "UNAVAILABLE" : "AVAILABLE", value });
const group = (id: string, parts: Array<[string, Record<string, string | null>]>) => ({
  key: [{ field: "portfolio_id", value: id }],
  economic_partitions: parts.map(([currency, metrics]) => ({ partition: partition(currency), metrics: Object.fromEntries(Object.entries(metrics).map(([k, v]) => [k, metric(v)])) })),
});
const A = group("a", [["USDT", { net_pnl: "100.5", score: "0.2" }]]);
const B = group("b", [["USDT", { net_pnl: "-3", score: "0.9" }]]);
const C = group("c", [["USDT", { net_pnl: null, score: "0.5" }]]);
const D = group("d", [["USDT", { net_pnl: "100.50", score: null }]]);
const MIXED = group("m", [["USDT", { net_pnl: "5000" }], ["VND", { net_pnl: "900000000" }]]);
const ids = (r: { groups: Array<{ key: Array<{ value: string | null }> }> }) => r.groups.map(g => g.key[0].value);
const q = (over: Record<string, unknown>) => ({ group_sort: [], group_filters: [], economic_partition: undefined, ...over }) as Parameters<typeof applyGroupQuery>[1];

describe("WP-K slice 6: group sort and filter", () => {
  it("without a group query nothing changes and no group_query is reported", () => {
    const r = applyGroupQuery([B, A], q({}));
    expect(ids(r)).toEqual(["b", "a"]);
    expect(r.applied).toBeNull();
  });
  it("sorts by an exact decimal, both ways, with null last in BOTH directions and equal values ordered by the group key", () => {
    const asc = applyGroupQuery([A, B, C, D], q({ group_sort: [{ metric_key: "net_pnl", direction: "asc" }] }));
    expect(ids(asc)).toEqual(["b", "a", "d", "c"]);
    const desc = applyGroupQuery([A, B, C, D], q({ group_sort: [{ metric_key: "net_pnl", direction: "desc" }] }));
    expect(ids(desc)).toEqual(["a", "d", "b", "c"]);
    expect(ids(applyGroupQuery([A, B, C, D], q({ group_sort: [{ metric_key: "score", direction: "desc" }] })))).toEqual(["b", "c", "a", "d"]);
    expect(asc.applied).toMatchObject({ partition_basis: "SINGLE_PARTITION_ONLY", groups_before_filter: 4, groups_returned: 4 });
  });
  it("100.5 equals 100.50 exactly (no float), and a 19-digit value keeps its last digit", () => {
    const big = group("big", [["USDT", { net_pnl: "9007199254740993.000000000000000001" }]]);
    const near = group("near", [["USDT", { net_pnl: "9007199254740993" }]]);
    expect(ids(applyGroupQuery([near, big], q({ group_sort: [{ metric_key: "net_pnl", direction: "desc" }] })))).toEqual(["big", "near"]);
    expect(ids(applyGroupQuery([A, D], q({ group_filters: [{ metric_key: "net_pnl", op: "GTE", value: "100.5" }, { metric_key: "net_pnl", op: "LTE", value: "100.500" }] })))).toEqual(["a", "d"]);
  });
  it("GTE and LTE drop a group with no value; IS_NULL keeps exactly those", () => {
    expect(ids(applyGroupQuery([A, B, C, D], q({ group_filters: [{ metric_key: "net_pnl", op: "GTE", value: "0" }] })))).toEqual(["a", "d"]);
    expect(ids(applyGroupQuery([A, B, C, D], q({ group_filters: [{ metric_key: "net_pnl", op: "LTE", value: "0" }] })))).toEqual(["b"]);
    const nulls = applyGroupQuery([A, B, C, D], q({ group_filters: [{ metric_key: "net_pnl", op: "IS_NULL" }] }));
    expect(ids(nulls)).toEqual(["c"]);
    expect(nulls.applied).toMatchObject({ groups_before_filter: 4, groups_returned: 1 });
  });
  it("a group in two currencies has no comparable money value unless a partition is pinned; the pin picks exactly that partition", () => {
    expect(ids(applyGroupQuery([MIXED, A], q({ group_sort: [{ metric_key: "net_pnl", direction: "desc" }] })))).toEqual(["a", "m"]);
    expect(ids(applyGroupQuery([MIXED, A], q({ group_filters: [{ metric_key: "net_pnl", op: "GTE", value: "0" }] })))).toEqual(["a"]);
    const pinned = applyGroupQuery([MIXED, A], q({ economic_partition: partition("USDT"), group_sort: [{ metric_key: "net_pnl", direction: "desc" }] }));
    expect(ids(pinned)).toEqual(["m", "a"]);
    expect(pinned.applied?.partition_basis).toBe("PINNED_PARTITION");
    const vnd = applyGroupQuery([MIXED, A], q({ economic_partition: partition("VND"), group_filters: [{ metric_key: "net_pnl", op: "GTE", value: "1" }] }));
    expect(ids(vnd)).toEqual(["m"]);
  });
  it("a non-decimal published value is treated as no value, never compared", () => {
    const odd = group("odd", [["USDT", { net_pnl: "1e9" }]]);
    expect(ids(applyGroupQuery([odd, A], q({ group_sort: [{ metric_key: "net_pnl", direction: "desc" }] })))).toEqual(["a", "odd"]);
  });
});

describe("WP-K slice 6: the query contract", () => {
  const base = { environment: "paper", group_by: ["portfolio_id"] };
  it("accepts one sort and up to eight filters, defaults both to empty", () => {
    const parsed = managerModelQuery.parse(base);
    expect(parsed.group_sort).toEqual([]);
    expect(parsed.group_filters).toEqual([]);
    expect(managerModelQuery.safeParse({ ...base, group_sort: [{ metric_key: "net_pnl", direction: "desc" }], group_filters: [{ metric_key: "return_30d_pct", op: "GTE", value: "-1.5" }, { metric_key: "score", op: "IS_NULL" }] }).success).toBe(true);
  });
  it.each([
    ["a group query without group_by", { environment: "paper", group_sort: [{ metric_key: "net_pnl", direction: "asc" }] }],
    ["environment ALL", { environment: "ALL", group_by: ["portfolio_id"], group_sort: [{ metric_key: "net_pnl", direction: "asc" }] }],
    ["two sorts", { ...base, group_sort: [{ metric_key: "net_pnl", direction: "asc" }, { metric_key: "score", direction: "asc" }] }],
    ["a float-looking text value", { ...base, group_filters: [{ metric_key: "net_pnl", op: "GTE", value: "1e3" }] }],
    ["a value on IS_NULL", { ...base, group_filters: [{ metric_key: "net_pnl", op: "IS_NULL", value: "1" }] }],
    ["no value on GTE", { ...base, group_filters: [{ metric_key: "net_pnl", op: "GTE" }] }],
    ["a duplicate filter", { ...base, group_filters: [{ metric_key: "net_pnl", op: "GTE", value: "1" }, { metric_key: "net_pnl", op: "GTE", value: "2" }] }],
    ["a metric key that is not a key", { ...base, group_sort: [{ metric_key: "Net PnL; drop", direction: "asc" }] }],
    ["an operator the contract does not have", { ...base, group_filters: [{ metric_key: "net_pnl", op: "EQ", value: "1" }] }],
    ["an unknown field", { ...base, group_sort: [{ metric_key: "net_pnl", direction: "asc", nulls: "first" }] }],
  ])("refuses %s", (_name, query) => {
    expect(managerModelQuery.safeParse(query).success).toBe(false);
  });
});
