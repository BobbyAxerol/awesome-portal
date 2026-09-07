/**
 * EDS-11R1 named relation BFF consumer (G9): the reader keeps the page's
 * shape, the drain walks the Portal continuation to the relation's end or a
 * page cap and says which, and the subject funnel counts one subject's rows
 * in a page set it never mistakes for the profile's.
 */
import { describe, expect, it } from "vitest";

import { drainRelation, drainRelations, readRelationPage, relationPagePath, relationRow, subjectFunnel, subjectRows, type RelationPage, type RelationRead } from "./api/managerRelations";

const RAW = {
  schema_version: "portal.execution.eds11r.manager-relation-page.v1",
  logical_operation_id: "executionManagerCurrentOrdersV1",
  environment: "paper",
  profile_id: "PAPER_BINANCE_USDM",
  state: "POPULATED",
  source_history_semantics: "CURRENT_STATE_PAGE_NOT_HISTORY",
  source_retention_semantics: "UNDECLARED_BY_MANAGER_ENVELOPE",
  source_health: { availability: "AVAILABLE", freshness: "FRESH", completeness: "COMPLETE", as_of_ms: 1788761101574 },
  page: { limit: 200, next_cursor: "mdc1.abc", has_more: true, total_unknown: true, maximum_page_rows: 200 },
  records: [
    { resource_id: "por1_a", values: { order_id: 1, strategy_id: "fib_sl_tp_strength_0015m", account_id: "paper-binance-fib", status: "FILLED", price: "61234.10", quantity: "0.010", submitted_at: 1787294915131, updated_at: 1787294916000, reduce_only: false, error_code: null } },
    { resource_id: "por1_b", values: { order_id: 2, strategy_id: "gridcombine001_4h", account_id: "paper-binance-grid", status: "CANCELED", price: "1.5", quantity: "3", submitted_at: 1787294920000 } },
    { values: { order_id: 3 } },
  ],
};

describe("manager relation reader", () => {
  it("keeps the page's provenance, health, continuation and typed values; drops a record without identity", () => {
    const page = readRelationPage(RAW)!;
    expect(page.schemaVersion).toBe("portal.execution.eds11r.manager-relation-page.v1");
    expect(page.state).toBe("POPULATED");
    expect(page.sourceHealth).toEqual({ availability: "AVAILABLE", freshness: "FRESH", completeness: "COMPLETE", asOfMs: 1788761101574 });
    expect(page.page).toEqual({ nextCursor: "mdc1.abc", hasMore: true, totalUnknown: true, maximumPageRows: 200, truncated: false });
    expect(page.records).toHaveLength(2);
    expect(page.records[0].values.price).toBe("61234.10");
    expect(page.records[0].values.reduce_only).toBe(false);
    expect(readRelationPage({})).toBeNull();
  });
  it("names the operation alias, bounds the limit and passes the continuation back unchanged", () => {
    expect(relationPagePath({ routeId: "orders", environment: "paper" })).toBe("/manager/current/orders?environment=paper&limit=200");
    expect(relationPagePath({ routeId: "order-brackets", environment: "live", limit: 900, cursor: "mdc1.x" })).toBe("/manager/current/order-brackets?environment=live&limit=200&cursor=mdc1.x");
  });
  it("turns TIMESTAMP milliseconds into ISO for the replay model and leaves every other value alone", () => {
    const row = relationRow(readRelationPage(RAW)!.records[0]);
    expect(row.submitted_at).toBe("2026-08-21T06:48:35.131Z");
    expect(row.price).toBe("61234.10");
    expect(row.order_id).toBe(1);
  });
});

function pagesOf(n: number, failAt: number | number[] | null = null, permanent = false): RelationRead {
  let calls = 0;
  const failCalls = failAt === null ? [] : Array.isArray(failAt) ? failAt : [failAt];
  return async (q) => {
    calls += 1;
    const index = q.cursor ? Number(q.cursor.slice(1)) : 0;
    // a flaky page fails on the listed calls (the walk retries it); a permanent one fails every time it is asked for
    if (failCalls.length > 0 && (permanent ? index === failCalls[0] - 1 : failCalls.includes(calls))) return { ok: false, status: "unavailable", reason: "EDS11R_SOURCE_UNAVAILABLE" };
    const last = index === n - 1;
    const page: RelationPage = { ...readRelationPage(RAW)!, records: [{ resourceId: `r${index}`, values: { order_id: index, strategy_id: index % 2 === 0 ? "a" : "b", status: index % 2 === 0 ? "FILLED" : "NEW" } }], page: { nextCursor: last ? null : `c${index + 1}`, hasMore: !last, totalUnknown: true, maximumPageRows: 200, truncated: false } };
    return { ok: true, value: page };
  };
}

describe("relation drain", () => {
  it("walks the continuation to the relation's end and says it got there", async () => {
    const d = await drainRelation(pagesOf(3), "orders", "paper");
    expect(d.rows.map((r) => r.order_id)).toEqual([0, 1, 2]);
    expect(d).toMatchObject({ pages: 3, exhausted: true, state: "POPULATED", completeness: "COMPLETE", reason: null });
  });
  it("stops at the page cap and says so instead of pretending the set is complete", async () => {
    const d = await drainRelation(pagesOf(10), "orders", "paper", 4);
    expect(d.rows).toHaveLength(4);
    expect(d).toMatchObject({ pages: 4, exhausted: false, reason: "page cap 4 reached" });
  });
  it("retries a page after each pause, so a Manager failure of a second or two does not cut the walk short", async () => {
    const d = await drainRelation(pagesOf(5, [3, 4]), "orders", "paper");
    expect(d.rows).toHaveLength(5);
    expect(d).toMatchObject({ pages: 5, exhausted: true, reason: null });
  });
  it("keeps the rows it has when a page keeps failing, with the typed reason", async () => {
    const d = await drainRelation(pagesOf(5, 3, true), "orders", "paper");
    expect(d.rows).toHaveLength(2);
    expect(d).toMatchObject({ pages: 2, exhausted: false, reason: "EDS11R_SOURCE_UNAVAILABLE" });
    const none = await drainRelation(pagesOf(5, 1, true), "orders", "paper");
    expect(none).toMatchObject({ rows: [], pages: 0, state: "UNAVAILABLE" });
  });
  it("drains every replay relation and grades the set POPULATED / PARTIAL / UNAVAILABLE by what answered", async () => {
    const all = await drainRelations(pagesOf(2), "paper", { orders: "orders", fills: "fills" });
    expect(all.state).toBe("POPULATED");
    expect(all.pages).toBe(4);
    expect(all.exhausted).toBe(true);
    expect(Object.keys(all.facts)).toEqual(["orders", "fills"]);
    const good = pagesOf(2);
    const bad = pagesOf(2, 1, true);
    const some = await drainRelations((q) => (q.routeId === "orders" ? bad(q) : good(q)), "paper", { orders: "orders", fills: "fills" });
    expect(some.state).toBe("PARTIAL");
    expect(some.facts.orders).toBeUndefined();
    expect(some.reasons).toEqual(["orders: EDS11R_SOURCE_UNAVAILABLE"]);
  });
});

describe("subject funnel (DR-22)", () => {
  it("counts one subject's distinct orders by status and names what the whole page set holds", async () => {
    const relations = await drainRelations(pagesOf(6), "paper", { orders: "orders" });
    const funnel = subjectFunnel(relations, { alphaId: "a" })!;
    expect(funnel.totalOrders).toBe(3);
    expect(funnel.statusCounts).toEqual({ FILLED: 3 });
    expect(funnel.pageSet).toEqual({ orders: 6, strategies: 2, pages: 6, exhausted: true, completeness: "COMPLETE" });
    expect(subjectRows(relations.facts.orders, { accountId: "none" })).toEqual([]);
    expect(subjectFunnel(null, { alphaId: "a" })).toBeNull();
    expect(subjectFunnel({ ...relations, facts: {} }, { alphaId: "a" })).toBeNull();
  });
});

describe("a relation that refuses the first page size", () => {
  it("steps down through the sizes rather than calling a readable relation unavailable", async () => {
    // portfolio-equity-snapshots on dev answers a page of 5 and refuses 8 with
    // N17B_SOURCE_REJECTED; a fixed 200 read it as unavailable.
    const asked: number[] = [];
    const read: RelationRead = async (q) => {
      asked.push(q.limit ?? -1);
      if ((q.limit ?? 0) > 5) return { ok: false, status: "unavailable", reason: "N17B_SOURCE_REJECTED" };
      return {
        ok: true,
        value: { ...readRelationPage(RAW)!, records: [{ resourceId: "r1", values: { id: 1 } }], page: { nextCursor: null, hasMore: false, totalUnknown: true, maximumPageRows: 5, truncated: false } },
      };
    };
    const drained = await drainRelation(read, "portfolio-equity-snapshots", "paper");
    expect(drained.rows).toHaveLength(1);
    expect(drained.exhausted).toBe(true);
    // each refused size is tried once (with its one retry) before stepping down
    expect(asked.filter((size) => size === 5)).toHaveLength(1);
    expect(new Set(asked)).toEqual(new Set([200, 50, 20, 5]));
  });

  it("still reports a relation that refuses every size", async () => {
    const read: RelationRead = async () => ({ ok: false, status: "unavailable", reason: "N17B_SOURCE_REJECTED" });
    const drained = await drainRelation(read, "portfolio-equity-snapshots", "paper");
    expect(drained).toMatchObject({ rows: [], pages: 0, state: "UNAVAILABLE", reason: "N17B_SOURCE_REJECTED" });
  });
});
