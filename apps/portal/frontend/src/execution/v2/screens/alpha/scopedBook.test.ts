/**
 * A SCOPED_V2 subject-records page as the page the book reads: what it maps, and what it refuses to borrow. Lane FIXTURE_LAB.
 */
import { describe, expect, it } from "vitest";

import { ALPHA_V2_WORKSPACE, answerAlpha } from "../../../../../e2e/bffDoubleAlpha";
import { readReplayFills, readReplayOrders } from "../../../components/tradeReplayModel";
import { readSubjectRecordsScoped } from "../../readers/subjectRecordsScoped";
import { isScopedPage, scopedPageAsActivity } from "./scopedBook";

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

  it("an order is placed in time by occurred_at_ms only; the replay's own reader then reads it, with the members the v2 record has", () => {
    const orders = readReplayOrders(read("orders").records.map((r) => r.values));
    expect(orders).toHaveLength(6);
    expect(orders[0]).toMatchObject({ orderId: "ord_001", symbol: "BTCUSDT", side: "BUY", status: "FILLED", price: "67200.50", qty: "0.40", accountId: "acct_binance_02" });
    expect(orders[0]!.submittedAt).toBe(new Date(Date.UTC(2026, 9, 16, 14, 0)).toISOString());
    // No client order id, order type, session or venue order id exists in the v2 record: they are null, not guessed.
    expect(orders[0]).toMatchObject({ clientOrderId: null, type: null, sessionId: null, venueOrderId: null });
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
