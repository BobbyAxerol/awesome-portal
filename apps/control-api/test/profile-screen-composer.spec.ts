import { describe, expect, it } from "vitest";
import {
  decimalAbsoluteSum,
  decimalSubtract,
  decimalSum,
  openOrders,
  ProfileScreenSource,
} from "../src/execution/profile-screen-composer";

describe("Phase 2 profile screen composition", () => {
  const readAt = "2026-09-02T08:00:01.000Z";

  it("preserves exact decimals and never coerces execution values through Number", () => {
    expect(decimalSum([
      { realized_pnl: "0.000000000000000001", unrealized_pnl: "1.200000000000000009" },
      { realized_pnl: "-0.100000000000000001", unrealized_pnl: null },
    ], ["realized_pnl", "unrealized_pnl"])).toBe("1.100000000000000009");
    expect(decimalAbsoluteSum([
      { notional: "-6000.000000000000000001" }, { notional: "2.5" },
    ], "notional")).toBe("6002.500000000000000001");
    expect(decimalSubtract("10000.000000000000000001", "6002.500000000000000001"))
      .toBe("3997.5");
  });

  it("composes ready, empty and unavailable branches from one profile envelope", () => {
    const source = new ProfileScreenSource({
      state: "ready",
      delivery_profile: "LIVE_BINANCE_USDM",
      freshness: "FRESH",
      completeness: "COMPLETE",
      as_of: "2026-09-02T08:00:00.000Z",
      projection: {
        epoch: "epoch-live", sequence: 14, sourceCursor: "cursor-live",
        payloadDigest: `sha256:${"a".repeat(64)}`,
        lastSuccessfulRefreshAt: "2026-09-02T08:00:00.000Z",
      },
      capabilities: [
        { capability_id: "source.orders", state: "AVAILABLE", reason_code: null },
        { capability_id: "source.fills", state: "EMPTY", reason_code: null },
        { capability_id: "source.broker_sync", state: "UNAVAILABLE", reason_code: "BROKER_SOURCE_ABSENT" },
      ],
      data: {
        orders: [{ order_id: "ord_1", status: "OPEN", quantity: "0.000000000000000001" }],
        fills: [], broker_sync: [],
      },
    }, readAt);
    expect(source.collection("orders", "EXECUTION", "orders")).toMatchObject({
      exact_total: 1,
      returned_count: 1,
      envelope: {
        panel_state: "ready",
        delivery_profile: "LIVE_BINANCE_USDM",
        source_verification_state: "VERIFIED",
        projection_epoch: "epoch-live",
        projection_sequence: 14,
      },
    });
    expect(source.panel("fills", "EXECUTION", ["fills"], { rows: [] }).panel_state).toBe("empty");
    const sourceWithoutClock = new ProfileScreenSource({
      state: "empty",
      delivery_profile: "LIVE_BINANCE_USDM",
      freshness: "UNKNOWN",
      completeness: "COMPLETE",
      as_of: null,
      capabilities: [{ capability_id: "source.orders", state: "EMPTY", reason_code: null }],
      data: { orders: [] },
    }, readAt);
    expect(sourceWithoutClock.panel("orders", "EXECUTION", ["orders"], { rows: [] }))
      .toMatchObject({ panel_state: "empty", as_of: null, data: { rows: [] } });
    expect(source.panel("broker", "BROKER", ["broker_sync"], {}).panel_state).toBe("unavailable");
    expect(source.panel("broker", "BROKER", ["orders"], { secret: true }, true)).toMatchObject({
      panel_state: "suppressed",
      source_verification_state: "UNAVAILABLE",
      data: null,
      warnings: [{ code: "PHASE2_BROKER_SUPPRESSED" }],
    });
    expect(openOrders(source.rows("orders"))).toHaveLength(1);
  });

  it("keeps an unavailable product branch typed and data-free", () => {
    const source = new ProfileScreenSource({
      state: "unavailable", delivery_profile: "LIVE_BINANCE_USDM",
      completeness: "PARTIAL", data: {}, capabilities: [],
    }, readAt);
    expect(source.panel("positions", "EXECUTION", ["positions"], { forbidden: true }))
      .toMatchObject({
        panel_state: "unavailable",
        delivery_profile: "LIVE_BINANCE_USDM",
        source_verification_state: "UNAVAILABLE",
        data: null,
      });
  });
});
