/**
 * A SCOPED_V2 subject-records page as the page the book reads: what it maps, and what it refuses to borrow. Lane FIXTURE_LAB.
 */
import { describe, expect, it } from "vitest";

import { ALPHA_V2_WORKSPACE, answerAlpha } from "../../../../../e2e/bffDoubleAlpha";
import { readReplayFills, readReplayOrders } from "../../../components/tradeReplayModel";
import { readSubjectRecordsScoped } from "../../readers/subjectRecordsScoped";
import { detailIndex, isScopedPage, scopedPageAsActivity, serves } from "./scopedBook";

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const page = (relation: "orders" | "fills", extra = ""): Json =>
  structuredClone(answerAlpha("GET", `/resources/alphas/alpha_btc_trend/${relation}`, new URLSearchParams(`environment=live&workspace_id=${ALPHA_V2_WORKSPACE}${extra}`))!.body) as Json;
const read = (relation: "orders" | "fills", mutate?: (b: Json) => void) => {
  const body = page(relation);
  mutate?.(body);
  const scoped = readSubjectRecordsScoped(body);
  expect(scoped).not.toBeNull();
  return scopedPageAsActivity(scoped!);
};

describe("scopedPageAsActivity", () => {
  it("carries the page's clock statement and each record's time reason, and indexes the record detail the replay model drops", () => {
    const orders = read("orders", (b) => { b.records[1].time_reason_code = "SOURCE_TIME_NOT_PUBLISHED"; delete b.records[1].values.submitted_at_ms; });
    expect(orders.clock).toEqual({ timeUnit: "UTC_EPOCH_MS", observedAtBasis: "ORDER_UPDATED_AT" });
    expect(read("fills").clock).toEqual({ timeUnit: "UTC_EPOCH_MS", observedAtBasis: "FILL_TRADE_TIME" });
    expect(orders.records.map((r) => r.timeReason ?? null)).toEqual([null, "SOURCE_TIME_NOT_PUBLISHED", null, null, null, null]);
    expect(orders.records[1]!.values.submitted_at).toBeUndefined();
    const index = detailIndex([orders], "order_id");
    expect(index.get("ord_002")).toMatchObject({ timeReason: "SOURCE_TIME_NOT_PUBLISHED" });
    expect(index.get("ord_001")!.values.client_order_id).toBe("bt3-001");
    // `serves` is true when some record states the member at all, even as null.
    expect(serves(index, "order_type")).toBe(true);
    expect(serves(index, "commission")).toBe(false);
  });

  it("an order with both submitted_at_ms and occurred_at_ms is placed by submitted_at_ms", () => {
    const both = read("orders", (b) => { b.records[0].values.submitted_at_ms = 5_000; b.records[0].values.occurred_at_ms = 9_000; });
    expect(both.records[0]!.values.submitted_at).toBe(new Date(5_000).toISOString());
    const legacy = read("orders", (b) => { delete b.records[0].values.submitted_at_ms; b.records[0].values.occurred_at_ms = 9_000; });
    expect(legacy.records[0]!.values.submitted_at).toBe(new Date(9_000).toISOString());
  });

  it("keeps the retained-window statement and borrows nothing for the members the v2 page does not have", () => {
    const mapped = read("orders");
    expect(isScopedPage(mapped)).toBe(true);
    expect(mapped).toMatchObject({
      schemaVersion: "portal.execution.subject-records.v2", operationId: "executionAlphaOrdersV1", environment: "live", state: "PARTIAL",
      resource: { kind: "alpha", id: "alpha_btc_trend", resolution: null }, timeframe: null,
      sourceHealth: { availability: null, freshness: null, completeness: null, asOfMs: null },
      projection: { epochId: null, sequence: null, sourceAsOfMs: null, lastRefreshMs: null, completeness: null },
      page: { limit: 200, maximumPageRows: 500, returnedCount: 6, hasMore: true },
    });
    // The cursor is the Portal's opaque token, passed on exactly.
    expect(mapped.page.nextCursor).toBe("kc1.double-k1.eyJkaXJlY3Rpb24iOiJhZnRlciIsInJlc291cmNlIjoib3JkZXJzIn0.RG91YmxlLU5PVC1BLVJFQUwtU0lHTkFUVVJF");
    expect(mapped.records).toHaveLength(6);
  });

  it("an order is placed in time by its own submitted_at_ms (else occurred_at_ms); the replay's own reader then reads it, with the members the v2 record states", () => {
    const orders = readReplayOrders(read("orders").records.map((r) => r.values));
    expect(orders).toHaveLength(6);
    expect(orders[0]).toMatchObject({ orderId: "ord_001", symbol: "BTCUSDT", side: "BUY", status: "FILLED", price: "67200.50", qty: "0.40", accountId: "acct_binance_02" });
    expect(orders[0]!.submittedAt).toBe(new Date(Date.UTC(2026, 7, 21, 14, 56)).toISOString());
    // The record states the client order id and the type; session and venue order id are not in the v2 record: null, not guessed.
    expect(orders[0]).toMatchObject({ clientOrderId: "bt3-001", type: "LIMIT", sessionId: null, venueOrderId: null });
  });

  it("a fill with no occurred_at_ms or timestamp_ms has no trade time: the replay reader drops it (counted as lost), the observation clock is not borrowed", () => {
    const mapped = read("fills");
    expect(mapped.records).toHaveLength(4);
    const fills = readReplayFills(mapped.records.map((r) => r.values));
    expect(fills.map((f) => f.fillId)).toEqual(["fill_001", "fill_002", "fill_003"]);
    const untimed = mapped.records.find((r) => r.recordId === "fill_004")!;
    expect(untimed.values.trade_time).toBeUndefined();
    expect(page("fills").records[3].observed_at_ms).toBeGreaterThan(0);
  });

  it("timestamp_ms places a record when occurred_at_ms is absent, and occurred_at_ms wins when both are stated; the integer created_at / updated_at are never read as an instant", () => {
    const withBoth = read("fills", (b) => { b.records[0].values.timestamp_ms = 1_000; b.records[0].values.occurred_at_ms = 2_000; });
    expect(withBoth.records[0]!.values.trade_time).toBe(new Date(2_000).toISOString());
    const onlyTimestamp = read("fills", (b) => { delete b.records[0].values.occurred_at_ms; b.records[0].values.timestamp_ms = 3_000; });
    expect(onlyTimestamp.records[0]!.values.trade_time).toBe(new Date(3_000).toISOString());
    const onlyCreated = read("fills", (b) => { delete b.records[0].values.occurred_at_ms; b.records[0].values.created_at = 1_790_000_000_000; b.records[0].values.updated_at = 1_790_000_000_001; });
    expect(onlyCreated.records[0]!.values.trade_time).toBeUndefined();
    const nullOccurred = read("fills", (b) => { b.records[0].values.occurred_at_ms = null; b.records[0].values.timestamp_ms = 4_000; });
    expect(nullOccurred.records[0]!.values.trade_time).toBe(new Date(4_000).toISOString());
  });

  it("an instant outside the date range is not a time (and does not throw)", () => {
    const mapped = read("fills", (b) => { b.records[0].values.occurred_at_ms = 9_000_000_000_000_000; });
    expect(mapped.records[0]!.values.trade_time).toBeUndefined();
  });
});
