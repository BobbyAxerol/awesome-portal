import { describe, expect, it } from "vitest";
import {
  canonicalDecimal,
  complianceRows,
  rollbackItems,
  trialSchedule,
  usedRatio,
  ApprovedEnvelope,
} from "../src/execution/canary-envelope-facts";
import { ProfileScreenSource } from "../src/execution/profile-screen-composer";
import { assertPublishedSchema, rejectsPublishedSchema } from "./stage-contract-validator";
import { CanaryService } from "../src/canary/canary.service";
import { CanaryEnvelopeRow, CanaryLineage } from "../src/canary/canary.repository";
import { PortalUser } from "../src/domain";

const approved: ApprovedEnvelope = {
  currency: "USDT", capital_cap: "1000", gross_notional_cap: "5000.50", daily_loss_cap: "200", max_open_orders: 4, duration_days: 14,
};

function profile(data: Record<string, unknown>, over: { freshness?: string; states?: Record<string, string> } = {}) {
  const keys = ["positions", "orders", "margin_balances", "broker_sync"];
  return new ProfileScreenSource({
    state: "ready", delivery_profile: "LIVE_BINANCE_USDM", freshness: over.freshness ?? "FRESH", completeness: "COMPLETE",
    as_of: "2026-10-12T08:00:00.000Z",
    capabilities: keys.map((key) => ({ capability_id: `source.${key}`, state: over.states?.[key] ?? "AVAILABLE", reason_code: null })),
    data,
  }, "2026-10-12T09:00:00.000Z");
}
const dark = () => new ProfileScreenSource({ state: "unavailable" }, "2026-10-12T09:00:00.000Z");

describe("FE-071 exact decimals", () => {
  it("canonicalises without rounding", () => {
    expect(canonicalDecimal("007.500")).toBe("7.5");
    expect(canonicalDecimal("-0.00")).toBe("0");
    expect(canonicalDecimal("10")).toBe("10");
    for (const bad of ["", "1e3", "1,5", " 1", 1, null, "0x1"]) expect(canonicalDecimal(bad)).toBeNull();
  });

  it("states the used ratio at six digits, half up, and exact when it is exact", () => {
    expect(usedRatio("500", "1000")).toBe("0.5");
    expect(usedRatio("1000", "1000")).toBe("1");
    expect(usedRatio("0", "1000")).toBe("0");
    expect(usedRatio("1500", "1000")).toBe("1.5");
    expect(usedRatio("1", "3")).toBe("0.333333");
    expect(usedRatio("2", "3")).toBe("0.666667");
    expect(usedRatio("1", "8")).toBe("0.125");
    expect(usedRatio("500.000000000000000001", "1000")).toBe("0.5");
  });

  it("refuses a ratio it cannot state", () => {
    expect(usedRatio("1", "0")).toBeNull();
    expect(usedRatio("-1", "10")).toBeNull();
    expect(usedRatio("x", "10")).toBeNull();
  });
});

describe("FE-071 envelope compliance rows", () => {
  const live = profile({
    positions: [],
    orders: [{ order_id: "o1", status: "OPEN" }, { order_id: "o2", status: "FILLED" }, { order_id: "o3", status: "ACCEPTED" }],
    margin_balances: [{ account_id: "a", currency: "USDT", initial: "250" }],
  });

  it("states the approved limit always, the server's ratio where the source proves the figure, and a typed absence otherwise", () => {
    const { rows, verdict } = complianceRows(approved, live);
    expect(rows.map((row) => row.cap)).toEqual(["capital", "gross_notional", "daily_loss", "open_orders"]);
    expect(rows.map((row) => row.approved)).toEqual(["1000", "5000.5", "200", "4"]);
    const byCap = Object.fromEntries(rows.map((row) => [row.cap, row]));
    expect(byCap.capital.consumed).toEqual({ availability: "AVAILABLE", value: "250", reason_code: null });
    expect(byCap.capital.used_ratio.value).toBe("0.25");
    expect(byCap.capital.as_of.value).toBe("2026-10-12T08:00:00.000Z");
    expect(byCap.capital.unit).toBe("USDT");
    expect(byCap.gross_notional.consumed.value).toBe("0");
    expect(byCap.open_orders.consumed.value).toBe("2");
    expect(byCap.open_orders.used_ratio.value).toBe("0.5");
    expect(byCap.open_orders.unit).toBe("COUNT");
    expect(byCap.daily_loss.consumed).toEqual({ availability: "NOT_PUBLISHED", value: null, reason_code: "DAILY_LOSS_WINDOW_NOT_PUBLISHED" });
    expect(byCap.daily_loss.used_ratio.reason_code).toBe("DAILY_LOSS_WINDOW_NOT_PUBLISHED");
    expect(byCap.daily_loss.as_of.availability).toBe("NOT_PUBLISHED");
    // The base risk profile is only an id in the Portal: its limits are never invented.
    for (const row of rows) expect(row.policy_limit).toEqual({ availability: "NOT_PUBLISHED", value: null, reason_code: "BASE_RISK_PROFILE_LIMITS_NOT_PUBLISHED" });
    expect(verdict).toEqual({ state: "UNDETERMINED", basis: "CONSUMED_NOT_ABOVE_APPROVED_PER_CAP", undetermined_caps: ["daily_loss"] });
  });

  it("calls a breach a breach even when other caps are unknown", () => {
    const over = profile({ positions: [], orders: Array.from({ length: 5 }, (_, i) => ({ order_id: `o${i}`, status: "OPEN" })), margin_balances: [] });
    const { rows, verdict } = complianceRows(approved, over);
    expect(rows[3].consumed.value).toBe("5");
    expect(rows[3].used_ratio.value).toBe("1.25");
    expect(verdict.state).toBe("BREACH");
  });

  it("is never WITHIN_ENVELOPE while any cap is unproven", () => {
    for (const source of [live, dark()]) expect(complianceRows(approved, source).verdict.state).toBe("UNDETERMINED");
  });

  it("does not treat positions it cannot value as a zero", () => {
    const withPositions = profile({ positions: [{ position_id: "p", notional: "10" }], orders: [], margin_balances: [] });
    const gross = complianceRows(approved, withPositions).rows[1];
    expect(gross.consumed).toEqual({ availability: "NOT_PUBLISHED", value: null, reason_code: "E5_POSITION_CURRENCY_AND_MARK_LINEAGE_UNQUALIFIED" });
  });

  it("does not turn empty or partial margin / order windows into figures", () => {
    const empty = complianceRows(approved, profile({ positions: [], orders: [], margin_balances: [] })).rows;
    expect(empty[0].consumed.reason_code).toBe("MARGIN_BALANCES_EMPTY_NOT_PROVEN_ZERO");
    const partial = complianceRows(approved, profile({ positions: [], orders: [{ status: "OPEN" }], margin_balances: [{ currency: "USDT", initial: "1" }] }, { states: { orders: "PARTIAL", margin_balances: "PARTIAL" } })).rows;
    expect(partial[0].consumed.reason_code).toBe("MARGIN_BALANCES_WINDOW_PARTIAL");
    expect(partial[3].consumed.reason_code).toBe("ORDERS_WINDOW_PARTIAL");
  });

  it("refuses an exact open-order count for unknown or missing statuses", () => {
    for (const orders of [[{ status: "OPEN" }, { status: "NEW_UNQUALIFIED" }], [{ status: null }]]) {
      const count = complianceRows(approved, profile({ positions: [], orders, margin_balances: [] })).rows[3].consumed;
      expect(count).toEqual({ availability: "NOT_PUBLISHED", value: null, reason_code: "ORDER_STATUS_NOT_QUALIFIED" });
    }
    const known = complianceRows(approved, profile({ positions: [], margin_balances: [], orders: [
      { status: "OPEN" }, { status: "DENIED" }, { status: "RISK_REJECTED" }, { status: "CANCELLED" },
    ] })).rows[3].consumed;
    expect(known).toEqual({ availability: "AVAILABLE", value: "1", reason_code: null });
  });

  it("refuses a capital figure in another currency or without one", () => {
    const wrong = complianceRows(approved, profile({ positions: [], orders: [], margin_balances: [{ currency: "BUSD", initial: "5" }] })).rows[0];
    expect(wrong.consumed.reason_code).toBe("EDS03_CANARY_BALANCE_CURRENCY_MISMATCH");
    const none = complianceRows(approved, profile({ positions: [], orders: [], margin_balances: [{ initial: "5" }] })).rows[0];
    expect(none.consumed.reason_code).toBe("EXACT_DECIMAL_VALUES_REQUIRE_EXPLICIT_CURRENCY");
  });

  it("does not understate capital consumption when a margin row has no initial amount", () => {
    const capital = complianceRows(approved, profile({ positions: [], orders: [], margin_balances: [
      { currency: "USDT", initial: "5" }, { currency: "USDT", initial: null },
    ] })).rows[0];
    expect(capital.consumed).toEqual({ availability: "NOT_PUBLISHED", value: null,
      reason_code: "EXACT_DECIMAL_SOURCE_VALUE_NOT_PUBLISHED" });
  });

  it("is a typed absence per cap, and keeps the approved limits, while the source is dark", () => {
    const { rows } = complianceRows(approved, dark());
    expect(rows.map((row) => row.approved)).toEqual(["1000", "5000.5", "200", "4"]);
    for (const row of rows) {
      expect(row.consumed).toEqual({ availability: "NOT_PUBLISHED", value: null, reason_code: "LIVE_SOURCE_UNAVAILABLE" });
      expect(row.used_ratio.availability).toBe("NOT_PUBLISHED");
    }
  });

  it("conforms to the published schema", () => {
    const { rows, verdict } = complianceRows(approved, live);
    for (const row of rows) assertPublishedSchema("execution-stage-facts.v1.schema.json", "EnvelopeComplianceRow", row);
    assertPublishedSchema("execution-stage-facts.v1.schema.json", "EnvelopeVerdict", verdict);
    const row = { ...rows[0], approved: "1000.50" };
    expect(rejectsPublishedSchema("execution-stage-facts.v1.schema.json", "EnvelopeComplianceRow", row)).toBe(true);
  });
});

describe("FE-071 rollback readiness items", () => {
  const withBroker = (status: string, freshness = "FRESH") =>
    rollbackItems(profile({ broker_sync: [{ status, synced_at: "2026-10-12T07:59:00Z" }] }, { freshness }));
  const item = (items: ReturnType<typeof rollbackItems>, key: string) => items.find((entry) => entry.key === key)!;

  it("always lists the four checks in order", () => {
    expect(withBroker("SYNCED").map((entry) => entry.key)).toEqual(["flatten_plan", "paper_twin", "broker_data", "rollback_drill"]);
    expect(rollbackItems(dark()).map((entry) => entry.key)).toEqual(["flatten_plan", "paper_twin", "broker_data", "rollback_drill"]);
  });

  it("publishes only the check the Portal can see, with its own date", () => {
    const items = withBroker("SYNCED");
    expect(item(items, "broker_data")).toEqual({
      key: "broker_data",
      ready: { availability: "AVAILABLE", value: true, reason_code: null },
      checked_at: { availability: "AVAILABLE", value: "2026-10-12T07:59:00.000Z", reason_code: null },
    });
    expect(item(items, "flatten_plan").ready.reason_code).toBe("FLATTEN_PLAN_NOT_RECORDED");
    expect(item(items, "paper_twin").ready.reason_code).toBe("E5_CANARY_TWIN_COMPARISON_NOT_QUALIFIED");
    expect(item(items, "rollback_drill").checked_at.reason_code).toBe("ROLLBACK_DRILL_NOT_RECORDED");
  });

  it("is not ready when the snapshot is unhealthy or the profile is not fresh, and never ready from an unknown freshness", () => {
    expect(item(withBroker("FAILED"), "broker_data").ready.value).toBe(false);
    expect(item(withBroker("SYNCED", "STALE"), "broker_data").ready.value).toBe(false);
    expect(item(withBroker("SYNCED", "AGING"), "broker_data").ready.value).toBe(false);
    const unknown = item(withBroker("SYNCED", "UNKNOWN"), "broker_data");
    expect(unknown.ready).toEqual({ availability: "NOT_PUBLISHED", value: null, reason_code: "SOURCE_FRESHNESS_UNKNOWN" });
  });

  it("is a typed absence without a broker snapshot or a source", () => {
    expect(item(rollbackItems(profile({ broker_sync: [] })), "broker_data").ready.reason_code).toBe("BROKER_SYNC_NOT_PUBLISHED");
    expect(item(rollbackItems(profile({ broker_sync: [{ status: "SYNCED" }] })), "broker_data").ready.reason_code).toBe("BROKER_SYNC_TIME_NOT_PUBLISHED");
    expect(item(rollbackItems(dark()), "broker_data").ready.reason_code).toBe("LIVE_SOURCE_UNAVAILABLE");
  });

  it("conforms to the published schema", () => {
    for (const entry of withBroker("SYNCED")) assertPublishedSchema("execution-stage-facts.v1.schema.json", "RollbackItem", entry);
  });
});

describe("FE-071 trial schedule", () => {
  it("does not invent a start for a draft envelope", () => {
    const schedule = trialSchedule(undefined, 14);
    expect(schedule.started_at).toEqual({ availability: "NOT_PUBLISHED", value: null, reason_code: "CANARY_ACTIVATION_NOT_RECORDED" });
    expect(schedule.exit_review_opens_at.availability).toBe("NOT_PUBLISHED");
    expect(schedule.duration_days).toBe(14);
  });

  it("opens the exit review when the planned trial ends, once the source states a start", () => {
    const schedule = trialSchedule("2026-10-12T08:00:00Z", 14);
    expect(schedule.started_at.value).toBe("2026-10-12T08:00:00.000Z");
    expect(schedule.exit_review_opens_at.value).toBe("2026-10-26T08:00:00.000Z");
    assertPublishedSchema("execution-stage-facts.v1.schema.json", "TrialSchedule", schedule);
    assertPublishedSchema("execution-stage-facts.v1.schema.json", "TrialSchedule", trialSchedule(null, 7));
  });

  it("treats an unreadable start as not recorded", () => {
    expect(trialSchedule("yesterday", 14).started_at.availability).toBe("NOT_PUBLISHED");
  });
});

describe("FE-071 through the Canary service", () => {
  const user = { userId: "usr_1", username: "reader", role: "USER" } as unknown as PortalUser;
  const envelopeRow = {
    envelope_id: "cenv_1", workspace_id: "ws", deployment_id: "dep_1", certification_id: "cert_1", promotion_plan_id: "plan_1",
    revision: 1, previous_envelope_id: null, base_risk_profile_revision: "risk-rev-7", currency: "USDT",
    capital_cap: "1000.000000", gross_notional_cap: "5000.500000", daily_loss_cap: "200.000000", max_open_orders: 4, duration_days: 14,
    status: "DRAFT", blocker_codes: ["PRODUCTION_COMMAND_INACTIVE", "CANARY_OWNER_GATE_REQUIRED", "LIVE_SOURCE_UNAVAILABLE", "BASE_RISK_PROFILE_UNVERIFIED"], delivery_profile: "fixture", source_integration_state: "UNAVAILABLE",
    actor_user_id: "usr_1", evidence_set_hash: `sha256:${"b".repeat(64)}`, reason: "Draft canary envelope for the test.", created_at: new Date("2026-10-01T00:00:00Z"),
  } as unknown as CanaryEnvelopeRow;
  const lineage = {
    certification: { certification: { portfolio_id: "pf_1", account_id: "acc_1", external_account_ref: "ext_1", venue: "BINANCE", artifact_digest: "sha256:a", r1_approval_id: "r1", r2_approval_id: "r2", certification_id: "cert_1" } },
    promotionPlan: { plan_id: "plan_1" },
  } as unknown as CanaryLineage;
  const service = new CanaryService({} as never, {} as never, {} as never);
  const detail = (currentSource?: Record<string, unknown>) =>
    (service as unknown as { publicDetail: (...args: unknown[]) => Record<string, any> }).publicDetail(user, envelopeRow, lineage, false, currentSource);

  it("publishes the approved limits and typed absences while the source is dark", () => {
    const body = detail();
    expect(body.envelope_compliance.consumed).toBeNull();
    expect(body.envelope_compliance.base_risk_profile_verified).toBe(false);
    expect(body.envelope_compliance.rows.map((row: any) => row.approved)).toEqual(["1000", "5000.5", "200", "4"]);
    expect(body.envelope_compliance.rows.every((row: any) => row.consumed.availability === "NOT_PUBLISHED")).toBe(true);
    expect(body.envelope_compliance.verdict.state).toBe("UNDETERMINED");
    expect(body.rollback_readiness).toMatchObject({ ready: false, blocker_codes: ["ROLLBACK_EVIDENCE_UNAVAILABLE"] });
    expect(body.rollback_readiness.items.map((item: any) => item.key)).toEqual(["flatten_plan", "paper_twin", "broker_data", "rollback_drill"]);
    expect(body.lifecycle).toMatchObject({ day_index: null, runtime_state: null });
    expect(body.lifecycle.trial.started_at.reason_code).toBe("CANARY_ACTIVATION_NOT_RECORDED");
    for (const row of body.envelope_compliance.rows) assertPublishedSchema("execution-stage-facts.v1.schema.json", "EnvelopeComplianceRow", row);
    assertPublishedSchema("execution-stage-facts.v1.schema.json", "StageFacts", body.stage_facts);
    // The whole dark body, legacy members and the new ones together, against the published Canary schema.
    assertPublishedSchema("execution-canary-control-room.v1.schema.json", "CanaryControlRoom", JSON.parse(JSON.stringify(body)));
  });

  it("states the server ratio from a source-backed profile", () => {
    const source = {
      state: "ready", delivery_profile: "LIVE_BINANCE_USDM", freshness: "FRESH", completeness: "COMPLETE", as_of: "2026-10-12T08:00:00.000Z",
      capabilities: ["positions", "orders", "fills", "sessions", "margin_balances", "broker_sync", "reconciliation"]
        .map((key) => ({ capability_id: `source.${key}`, state: "AVAILABLE", reason_code: null })),
      data: {
        positions: [], orders: [{ order_id: "o1", status: "OPEN" }], fills: [], sessions: [], reconciliation: [],
        margin_balances: [{ account_id: "acc_1", currency: "USDT", initial: "250" }],
        broker_sync: [{ account_id: "acc_1", status: "SYNCED", synced_at: "2026-10-12T07:59:00Z" }],
      },
    };
    const body = detail(source);
    const byCap = Object.fromEntries(body.envelope_compliance.rows.map((row: any) => [row.cap, row]));
    expect(byCap.capital.used_ratio.value).toBe("0.25");
    expect(byCap.open_orders.consumed.value).toBe("1");
    expect(body.envelope_compliance.verdict).toMatchObject({ state: "UNDETERMINED", undetermined_caps: ["daily_loss"] });
    expect(body.rollback_readiness.items.find((item: any) => item.key === "broker_data").ready.value).toBe(true);
    // Legacy summary must carry the same qualified facts as the new rows.
    expect(body.envelope_compliance.consumed).toMatchObject({ capital: "250", open_orders: 1 });
    // `current_source` is the profile read echo (a hand-built stand-in here); everything else must conform.
    const { current_source: _echo, ...rest } = body;
    assertPublishedSchema("execution-canary-control-room.v1.schema.json", "CanaryControlRoom", JSON.parse(JSON.stringify(rest)));
  });

  it("does not publish partial money, unqualified position valuation or buying power as equity", () => {
    const source = {
      state: "ready", delivery_profile: "LIVE_BINANCE_USDM", freshness: "FRESH", completeness: "PARTIAL",
      as_of: "2026-10-12T08:00:00.000Z",
      capabilities: ["positions", "orders", "fills", "sessions", "margin_balances", "broker_sync", "reconciliation"]
        .map(key => ({ capability_id: `source.${key}`, state: key === "orders" ? "PARTIAL" : "AVAILABLE", reason_code: null })),
      data: {
        positions: [{ notional: "100", realized_pnl: "2", unrealized_pnl: "3" }],
        orders: [{ order_id: "o1", status: "OPEN" }], fills: [], sessions: [], reconciliation: [],
        margin_balances: [{ currency: "USDT", initial: "250" }, { currency: "USDT", initial: null }],
        broker_sync: [{ status: "SYNCED", synced_at: "2026-10-12T07:59:00Z", buying_power: "9999" }],
      },
    };
    const body = detail(source);
    expect(body.envelope_compliance.consumed).toEqual({ capital: null, gross_notional: null, daily_pnl: null, open_orders: null });
    expect(body.envelope_compliance.headroom).toEqual({ capital: null, gross_notional: null, daily_loss: null, open_orders: null });
    const kpis = Object.fromEntries(body.kpis.map((kpi: any) => [kpi.key, kpi]));
    for (const kpi of Object.values(kpis) as any[]) {
      expect(kpi.value).toBeNull();
      expect(kpi.envelope.panel_state).toBe("unavailable");
    }
    expect(kpis.capital_consumed.envelope.warnings[0].code).toBe("EXACT_DECIMAL_SOURCE_VALUE_NOT_PUBLISHED");
    expect(kpis.gross_notional.envelope.warnings[0].code).toBe("E5_POSITION_CURRENCY_AND_MARK_LINEAGE_UNQUALIFIED");
    expect(kpis.open_orders.envelope.warnings[0].code).toBe("ORDERS_WINDOW_PARTIAL");
    expect(kpis.broker_equity.envelope.warnings[0].code).toBe("BROKER_EQUITY_NOT_PUBLISHED");
    const { current_source: _echo, ...rest } = body;
    assertPublishedSchema("execution-canary-control-room.v1.schema.json", "CanaryControlRoom", JSON.parse(JSON.stringify(rest)));
  });
});
