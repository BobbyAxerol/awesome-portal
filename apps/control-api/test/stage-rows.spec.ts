import { describe, expect, it } from "vitest";
import { ProfileScreenSource } from "../src/execution/profile-screen-composer";
import { available, missing } from "../src/execution/stage-facts";
import {
  exactDifference,
  figure,
  gapRanges,
  sourceFigures,
  TYPED_ROW_CAP,
  typedOrders,
  typedPositions,
} from "../src/execution/stage-rows";
import { planEnvelope, SandboxCertificationService } from "../src/sandbox/sandbox-certification.service";
import { assertPublishedSchema, rejectsPublishedSchema } from "./stage-contract-validator";

const FAMILY = "execution-stage-facts.v1.schema.json";

function profile(data: Record<string, unknown>, states: Record<string, string> = {}, keys = ["positions", "orders", "fills"]) {
  return new ProfileScreenSource({
    state: "ready", delivery_profile: "LIVE_BINANCE_USDM", freshness: "FRESH", completeness: "COMPLETE", as_of: "2026-10-12T08:00:00.000Z",
    capabilities: keys.map((key) => ({ capability_id: `source.${key}`, state: states[key] ?? "AVAILABLE", reason_code: null })),
    data,
  }, "2026-10-12T09:00:00.000Z");
}
const dark = () => new ProfileScreenSource({ state: "unavailable" }, "2026-10-12T09:00:00.000Z");

describe("FE-072 typed positions", () => {
  const rows = [
    { position_id: "p1", instrument_id: "BTCUSDT", side: "LONG", quantity: "0.50", avg_px_open: "60000.0", mark_price: "60500.5", unrealized_pnl: "250.250" },
    { position_id: 2, instrument_id: "ETHUSDT", signed_qty: "-2", avg_px_open: "3000", mark_price: "2990", unrealized_pnl: "-20" },
    { position_id: "p3", instrument_id: "bad symbol" },
  ];

  it("types the columns the relation carries, canonically, and names leverage as unpublished", () => {
    const typed = typedPositions(profile({ positions: rows }), "DARK");
    expect(typed.availability).toBe("AVAILABLE");
    expect(typed.rows).toEqual([
      { id: "p1", symbol: "BTCUSDT", side: "long", quantity: "0.5", entry: "60000", mark: "60500.5", unrealised: "250.25", leverage: null },
      { id: "2", symbol: "ETHUSDT", side: "short", quantity: "2", entry: "3000", mark: "2990", unrealised: "-20", leverage: null },
    ]);
    expect(typed.omitted_count).toBe(1);
    expect(typed.source_complete).toBe(true);
    expect(typed.not_published_columns).toEqual([{ column: "leverage", reason_code: "POSITION_LEVERAGE_NOT_IN_SOURCE_RELATION" }]);
    assertPublishedSchema(FAMILY, "StageTypedPositions", typed);
  });

  it("does not invent a side, a mark or a quantity", () => {
    const typed = typedPositions(profile({ positions: [{ instrument_id: "BTCUSDT" }] }), "DARK");
    expect(typed.rows[0]).toEqual({ id: null, symbol: "BTCUSDT", side: null, quantity: null, entry: null, mark: null, unrealised: null, leverage: null });
  });

  it("is a typed absence while dark or when the relation is unavailable, and flags a partial window", () => {
    const off = typedPositions(dark(), "LIVE_SOURCE_UNAVAILABLE");
    expect(off).toMatchObject({ availability: "NOT_PUBLISHED", reason_code: "LIVE_SOURCE_UNAVAILABLE", rows: [], returned_count: 0 });
    assertPublishedSchema(FAMILY, "StageTypedPositions", off);
    expect(typedPositions(profile({ positions: rows }, { positions: "UNAVAILABLE" }), "DARK").reason_code).toBe("POSITIONS_RELATION_UNAVAILABLE");
    expect(typedPositions(profile({ positions: rows }, { positions: "PARTIAL" }), "DARK").source_complete).toBe(false);
  });

  it("caps the table and counts what it did not list", () => {
    const many = Array.from({ length: TYPED_ROW_CAP + 5 }, (_, i) => ({ position_id: `p${i}`, instrument_id: "BTCUSDT" }));
    const typed = typedPositions(profile({ positions: many }), "DARK");
    expect(typed.returned_count).toBe(TYPED_ROW_CAP);
    expect(typed.omitted_count).toBe(5);
  });
});

describe("FE-072 typed orders", () => {
  it("types orders, keeps the source status word, and names ack latency as unpublished", () => {
    const typed = typedOrders(profile({ orders: [
      { order_id: 7, symbol: "BTCUSDT", order_type: "LIMIT", side: "BUY", quantity: "0.100", price: "59000.00", status: "ACCEPTED", submitted_at: "2026-10-12T08:00:00Z" },
      { order_id: "o8", instrument_id: "ETHUSDT", order_type: "MARKET", side: "sell", quantity: "1" },
    ] }), "DARK");
    expect(typed.rows).toEqual([
      { id: "7", symbol: "BTCUSDT", type: "LIMIT", side: "buy", quantity: "0.1", price: "59000", status: "ACCEPTED", since: "2026-10-12T08:00:00.000Z", ack_latency_ms: null },
      { id: "o8", symbol: "ETHUSDT", type: "MARKET", side: "sell", quantity: "1", price: null, status: null, since: null, ack_latency_ms: null },
    ]);
    expect(typed.not_published_columns[0].column).toBe("ack_latency_ms");
    assertPublishedSchema(FAMILY, "StageTypedOrders", typed);
  });
  it("does not turn an impossible or timezone-less source timestamp into a real order instant", () => {
    const timestamps = ["2026-02-30T08:00:00Z", "2026-10-12T08:00:00", "2026-10-12", "2026-10-12T08:00:00+07:00",
      "2026-10-12T01:00:00.123456789Z", "2026-13-12T08:00:00Z", null];
    const rows = timestamps.map((submitted_at, index) => ({ order_id: `order-${index}`, symbol: "BTCUSDT", submitted_at }));
    const typed = typedOrders(profile({ orders: rows }), "DARK");
    expect(typed.rows.map(row => row.since)).toEqual([null, null, null, "2026-10-12T01:00:00.000Z",
      "2026-10-12T01:00:00.123Z", null, null]);
    assertPublishedSchema(FAMILY, "StageTypedOrders", typed);
  });
});

describe("FE-072 Internal / Broker / Difference figures", () => {
  it("computes the exact difference only from two published sides", () => {
    expect(exactDifference("2", "2")).toBe("0");
    expect(exactDifference("1", "0")).toBe("1");
    expect(exactDifference("0.1", "0.3")).toBe("-0.2");
    expect(exactDifference("100.25", "-0.75")).toBe("101");
    expect(exactDifference("x", "1")).toBeNull();
    const both = figure("positions", "COUNT", available("3"), available("2"));
    expect(both.difference).toEqual({ availability: "AVAILABLE", value: "1", reason_code: null });
    const one = figure("positions", "COUNT", available("3"));
    expect(one.broker.availability).toBe("NOT_PUBLISHED");
    expect(one.difference).toEqual({ availability: "NOT_PUBLISHED", value: null, reason_code: "DIFFERENCE_REQUIRES_BOTH_SIDES" });
    expect(figure("equity", null, missing("X_Y"), available("5")).difference.availability).toBe("NOT_PUBLISHED");
  });

  it("publishes only the internal figures the source proves, never a broker side or a copied difference", () => {
    const figures = sourceFigures(profile({
      positions: [{ quantity: "1" }, { quantity: "0" }, { signed_qty: "-3" }],
      orders: [{ status: "OPEN" }, { status: "FILLED" }],
      fills: [{ commission: "0.5", commission_currency: "USDT" }, { commission: "0.25", commission_currency: "USDT" }],
    }), "DARK");
    const by = Object.fromEntries(figures.figures.map((item) => [item.key, item]));
    expect(figures.figures.map((item) => item.key)).toEqual(["equity", "gross_notional", "positions", "open_orders", "fees"]);
    expect(by.positions.internal.value).toBe("2");
    expect(by.open_orders.internal.value).toBe("1");
    expect(by.fees.internal.value).toBe("0.75");
    expect(by.fees.unit).toBe("USDT");
    expect(by.equity.internal.reason_code).toBe("INTERNAL_EQUITY_FIGURE_NOT_PUBLISHED");
    expect(by.gross_notional.internal.reason_code).toBe("E5_POSITION_CURRENCY_AND_MARK_LINEAGE_UNQUALIFIED");
    for (const item of figures.figures) {
      expect(item.broker.availability).toBe("NOT_PUBLISHED");
      expect(item.difference.availability).toBe("NOT_PUBLISHED");
    }
    assertPublishedSchema(FAMILY, "StageSourceFigures", figures);
  });

  it("refuses counts and fees over windows it cannot trust", () => {
    const partial = sourceFigures(profile({ positions: [{ quantity: "1" }], orders: [{ status: "OPEN" }], fills: [{ commission: "1", commission_currency: "USDT" }] },
      { positions: "PARTIAL", orders: "PARTIAL", fills: "PARTIAL" }), "DARK");
    const by = Object.fromEntries(partial.figures.map((item) => [item.key, item]));
    expect(by.positions.internal.reason_code).toBe("POSITIONS_WINDOW_PARTIAL");
    expect(by.open_orders.internal.reason_code).toBe("ORDERS_WINDOW_PARTIAL");
    expect(by.fees.internal.reason_code).toBe("FILLS_WINDOW_PARTIAL");
    const mixed = sourceFigures(profile({ positions: [], orders: [], fills: [{ commission: "1", commission_currency: "USDT" }, { commission: "1", commission_currency: "BNB" }] }), "DARK");
    expect(mixed.figures.find((item) => item.key === "fees")!.internal.reason_code).toBe("CROSS_CURRENCY_AGGREGATE_FORBIDDEN");
    const noQuantity = sourceFigures(profile({ positions: [{ position_id: "p" }], orders: [], fills: [] }), "DARK");
    expect(noQuantity.figures.find((item) => item.key === "positions")!.internal.reason_code).toBe("POSITION_QUANTITY_NOT_PUBLISHED");
  });

  it("does not publish a partial fee total when a fill has no commission", () => {
    const figures = sourceFigures(profile({ positions: [], orders: [], fills: [
      { commission: "1", commission_currency: "USDT" }, { commission: null, commission_currency: "USDT" },
    ] }), "DARK");
    expect(figures.figures.find((item) => item.key === "fees")!.internal).toEqual({
      availability: "NOT_PUBLISHED", value: null, reason_code: "EXACT_DECIMAL_SOURCE_VALUE_NOT_PUBLISHED",
    });
    assertPublishedSchema(FAMILY, "StageSourceFigures", figures);
  });

  it("does not turn an unstated relation into a zero while the profile never listed it", () => {
    const figures = sourceFigures(profile({ positions: [] }, {}, ["positions"]), "DARK");
    const by = Object.fromEntries(figures.figures.map((item) => [item.key, item]));
    expect(by.positions.internal.value).toBe("0");
    expect(by.open_orders.internal.reason_code).toBe("ORDERS_RELATION_UNAVAILABLE");
    expect(by.fees.internal.reason_code).toBe("FILLS_RELATION_UNAVAILABLE");
  });

  it("is a typed absence in every cell while dark", () => {
    const figures = sourceFigures(dark(), "SANDBOX_SOURCE_UNAVAILABLE");
    for (const item of figures.figures) {
      expect(item.internal).toEqual({ availability: "NOT_PUBLISHED", value: null, reason_code: "SANDBOX_SOURCE_UNAVAILABLE" });
    }
    assertPublishedSchema(FAMILY, "StageSourceFigures", figures);
    expect(rejectsPublishedSchema(FAMILY, "StageSourceFigures", { ...figures, figures: figures.figures.slice(1) })).toBe(true);
  });
});

describe("FE-072 continuity gap window", () => {
  it("is never derived from an epoch / sequence journal", () => {
    expect(gapRanges(true)).toEqual({ availability: "NOT_PUBLISHED", value: null, reason_code: "PROJECTION_GAP_WINDOW_NOT_RECORDED" });
    expect(gapRanges(false).reason_code).toBe("SOURCE_CONTINUITY_UNAVAILABLE");
    assertPublishedSchema(FAMILY, "StageFactGapRanges", gapRanges(true));
  });
});

describe("FE-072 promotion plan envelope and author", () => {
  it("distinguishes a lookup that found none from one that was not performed", () => {
    expect(planEnvelope(undefined, "plan_1")).toEqual({ availability: "NOT_PUBLISHED", value: null, reason_code: "PLAN_ENVELOPE_LOOKUP_NOT_PERFORMED" });
    expect(planEnvelope([], "plan_1")).toEqual({ availability: "AVAILABLE", value: null, reason_code: null });
    const found = planEnvelope([
      { envelope_id: "cenv_1", promotion_plan_id: "plan_1", revision: 1 },
      { envelope_id: "cenv_2", promotion_plan_id: "plan_1", revision: 2 },
      { envelope_id: "cenv_9", promotion_plan_id: "plan_other", revision: 9 },
    ], "plan_1");
    expect(found).toEqual({ availability: "AVAILABLE", value: { envelope_id: "cenv_2", revision: 2, status: "DRAFT" }, reason_code: null });
    assertPublishedSchema(FAMILY, "StageFactPlanEnvelope", found);
  });

  it("publishes finding opened_at, plan author and envelope through the Sandbox service", () => {
    const service = new SandboxCertificationService({} as never, {} as never);
    const created = new Date("2026-10-12T08:00:00Z");
    const detail = {
      certification: {
        certification_id: "scert_1", deployment_id: "dep_1", portfolio_id: "pf_1", venue: "BINANCE", workflow_state: "DRAFT", workflow_version: 1,
        account_id: "acc_1", external_account_ref: "ext_1", policy_version: "p1", formula_version: "f1", submitted_at: null, submitted_by_user_id: null,
        submitted_evidence_set_hash: null, decided_at: null, decided_by_user_id: null, decided_evidence_set_hash: null, decision_reason: null,
        created_by_user_id: "usr_1", created_at: created, updated_at: created, artifact_digest: "sha256:a", r1_approval_id: "r1", r2_approval_id: "r2",
        paper_exit_review_id: "pe1", promotion_grant_id: "pg1", delivery_profile: "fixture", source_integration_state: "UNAVAILABLE",
      },
      evidence: [],
      findings: [{ finding_id: "f1", severity: "WARNING", source_authority: "DERIVED", finding_code: "X_Y", summary: "A finding summary.", blocking: false, evidence_hash: null, as_of: null, resolved_at: null, created_at: created }],
      findingsTotal: 1, events: [], eventsTotal: 0, smokePlan: null,
      promotionPlans: [{ plan_id: "plan_1", actor_user_id: "usr_author", target_stage: "CANARY", evidence_set_hash: `sha256:${"a".repeat(64)}`, status: "BLOCKED", blocker_codes: ["X_Y"], created_at: created }],
      canaryEnvelopes: [{ envelope_id: "cenv_1", promotion_plan_id: "plan_1", revision: 1 }],
    };
    const call = (value: unknown) => (service as unknown as { publicDetail: (...a: unknown[]) => Record<string, any> })
      .publicDetail(value, { userId: "usr_1", username: "u", role: "ADMIN" }, false);
    const body = call(detail);
    expect(body.findings.rows[0].opened_at).toBe("2026-10-12T08:00:00.000Z");
    expect(body.promotion_plans[0].author).toEqual({ user_id: "usr_author" });
    expect(body.promotion_plans[0].envelope.value).toEqual({ envelope_id: "cenv_1", revision: 1, status: "DRAFT" });
    expect(body.source_figures.figures).toHaveLength(5);
    const without = call({ ...detail, canaryEnvelopes: undefined });
    expect(without.promotion_plans[0].envelope.reason_code).toBe("PLAN_ENVELOPE_LOOKUP_NOT_PERFORMED");
    assertPublishedSchema("execution-sandbox-certification.v1.schema.json", "PromotionPlanSummary", body.promotion_plans[0]);
  });
});
