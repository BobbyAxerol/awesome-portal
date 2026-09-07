/**
 * Read-ahead of the Trading System's order-group, package and ledger tables
 * (schema guide §7 / §16 / §11, contract-pack vocabularies). Nothing here is
 * published today; these fixtures follow the columns the source will emit.
 */
import { describe, expect, it } from "vitest";

import { buildScene } from "./components/ReplayCandleChart";
import { legLevels, pairRoundTrips, readReplayFills, readReplayOrders } from "./components/tradeReplayModel";
import { EMPTY_GROUPS, publishedLegRoles, readBracketGroups, readConditionalGroups, readLedgerMovements, readOrderPackages, readReplayGroups, scopeGroups } from "./components/tradeReplayGroups";

const ACCT = "paper-binance-alpha_x";
const orders = readReplayOrders([
  { order_id: 1, account_id: ACCT, strategy_id: "alpha_x", symbol: "ETHUSDT", side: "BUY", order_type: "MARKET", status: "FILLED", quantity: "0.3", client_order_id: "brk-g1-en0", reduce_only: false, submitted_at: "2026-09-01T10:00:00Z", updated_at: "2026-09-01T10:00:01Z", venue_order_id: "v1" },
  // the source names this leg TRAILING in the group; by type it looks like a plain STOP
  { order_id: 2, account_id: ACCT, strategy_id: "alpha_x", symbol: "ETHUSDT", side: "SELL", order_type: "STOP_MARKET", status: "NEW", trigger_price: "1800", quantity: "0.3", client_order_id: "brk-g1-tr0", reduce_only: true, submitted_at: "2026-09-01T10:00:02Z", updated_at: "2026-09-01T10:00:02Z" },
  { order_id: 3, account_id: ACCT, strategy_id: "alpha_x", symbol: "ETHUSDT", side: "SELL", order_type: "TAKE_PROFIT_MARKET", status: "NEW", trigger_price: "1900", quantity: "0.1", client_order_id: "brk-g1-tp0", reduce_only: true, submitted_at: "2026-09-01T10:00:02Z", updated_at: "2026-09-01T10:00:02Z" },
  // a stray TP armed in the time window that belongs to NOBODY according to the published group
  { order_id: 4, account_id: ACCT, strategy_id: "alpha_x", symbol: "ETHUSDT", side: "SELL", order_type: "TAKE_PROFIT_MARKET", status: "NEW", trigger_price: "2100", quantity: "0.1", client_order_id: "other-tp9", reduce_only: true, submitted_at: "2026-09-01T10:00:03Z", updated_at: "2026-09-01T10:00:03Z" },
]);
const fills = readReplayFills([
  { fill_id: 10, account_id: ACCT, strategy_id: "alpha_x", instrument_id: "ETHUSDT.BINANCE", side: "BUY", price: "1850", quantity: "0.3", trade_time: "2026-09-01T10:00:01Z", client_order_id: "brk-g1-en0", realized_pnl: "0" },
]);

const FACTS = {
  order_brackets: [{ bracket_group_id: "g1", strategy_id: "alpha_x", account_id: ACCT, mode: "paper", venue: "BINANCE", symbol: "ETHUSDT", position_side: "BOTH", state: "ENTRY_FILLED", entry_client_order_id: "brk-g1-en0", activation_policy: "SUBMIT_CHILDREN_AFTER_ENTRY_FILLED", oco_policy: { tp_fractions: [0.34, 0.33, 0.33] }, created_at: "2026-09-01T09:59:59Z", updated_at: "2026-09-01T10:00:02Z" }],
  order_bracket_legs: [
    { leg_id: 100, bracket_group_id: "g1", leg_type: "ENTRY", leg_index: 0, client_order_id: "brk-g1-en0", side: "BUY", order_type: "MARKET", quantity: "0.3", status: "FILLED", submitted_at: "2026-09-01T10:00:00Z", filled_at: "2026-09-01T10:00:01Z" },
    { leg_id: 101, bracket_group_id: "g1", leg_type: "TRAILING", leg_index: 0, client_order_id: "brk-g1-tr0", side: "SELL", order_type: "STOP_MARKET", quantity: "0.3", trigger_price: "1800", reduce_only: true, intent: "CLOSE", status: "SUBMITTED", submitted_at: "2026-09-01T10:00:02Z" },
    { leg_id: 102, bracket_group_id: "g1", leg_type: "TP", leg_index: 0, client_order_id: "brk-g1-tp0", side: "SELL", order_type: "TAKE_PROFIT_MARKET", quantity: "0.1", quantity_fraction: "0.34", trigger_price: "1900", reduce_only: true, intent: "REDUCE", status: "SUBMITTED", submitted_at: "2026-09-01T10:00:02Z" },
    // published but not yet an orders row: a planned level
    { leg_id: 103, bracket_group_id: "g1", leg_type: "TP", leg_index: 1, client_order_id: "brk-g1-tp1", side: "SELL", order_type: "TAKE_PROFIT_MARKET", quantity: "0.1", trigger_price: "1950", reduce_only: true, intent: "REDUCE", status: "CREATED" },
  ],
  conditional_order_groups: [{ group_id: "cg1", contingency_type: "OCO", execution_trigger: "ON_FULL_FILL", late_fill_policy: "HALT_AND_RECONCILE", remainder_policy: "CANCEL_REMAINDER", state: "ACTIVE", strategy_id: "alpha_x", account_id: ACCT, symbol: "ETHUSDT", created_at: "2026-09-01T12:00:00Z", updated_at: "2026-09-01T12:00:00Z" }],
  conditional_order_group_legs: [
    { leg_id: 1, group_id: "cg1", leg_index: 0, client_order_id: "cg1-a", side: "SELL", order_type: "LIMIT", quantity: "0.1", price: "2000", state: "OPEN" },
    { leg_id: 2, group_id: "cg1", leg_index: 1, client_order_id: "cg1-b", side: "SELL", order_type: "STOP_MARKET", quantity: "0.1", trigger_price: "1750", state: "WAITING" },
  ],
  arb_order_packages: [{ package_id: "pk1", strategy_id: "alpha_x", account_id: ACCT, mode: "paper", venue: "BINANCE", package_policy: "ATOMIC_ALL_OR_NONE", state: "PLANNED", leg_count: 2, gross_notional: "4000", net_notional: "0", imbalance_bps: "5", planned_orders: [{ client_order_id: "pk1-l1", symbol: "ETHUSDT", side: "BUY", order_type: "LIMIT", quantity: "1", price: "1850" }, { client_order_id: "pk1-l2", symbol: "ETHUSDC", side: "SELL", order_type: "LIMIT", quantity: "1", price: "1852" }], created_at: "2026-09-01T13:00:00Z", updated_at: "2026-09-01T13:00:00Z", completed_at: null }],
  portfolio_capital_ledger: [{ capital_ledger_id: 7, portfolio_id: "p1", strategy_id: "alpha_x", account_id: ACCT, mode: "paper", venue: "BINANCE", currency: "USDT", movement_type: "ALLOCATE", amount: "5000", before_allocated: "20000", after_allocated: "25000", reason: "scale-up", actor: "Bobby-001", created_at: "2026-09-01T08:00:00Z" }],
  settlements: [{ settlement_id: "s1", account_id: ACCT, strategy_id: "alpha_x", mode: "paper", venue: "BINANCE", settlement_type: "CASH", direction: "PAYABLE", currency: "USDT", amount: "12.5", trade_date: "2026-09-01", settled_at: "2026-09-02T00:00:00Z", status: "SETTLED" }],
};

describe("readers — schema-shaped rows, tolerant of absence, never inventing", () => {
  it("reads bracket groups with their legs in leg_index order and the published leg types", () => {
    const groups = readBracketGroups(FACTS.order_brackets, FACTS.order_bracket_legs);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ groupId: "g1", state: "ENTRY_FILLED", entryClientOrderId: "brk-g1-en0", activationPolicy: "SUBMIT_CHILDREN_AFTER_ENTRY_FILLED", symbol: "ETHUSDT" });
    expect(groups[0]!.legs.map((l) => [l.legType, l.legIndex, l.clientOrderId])).toEqual([["ENTRY", 0, "brk-g1-en0"], ["TRAILING", 0, "brk-g1-tr0"], ["TP", 0, "brk-g1-tp0"], ["TP", 1, "brk-g1-tp1"]]);
    expect(groups[0]!.ocoPolicy).toEqual({ tp_fractions: [0.34, 0.33, 0.33] });
    expect(readBracketGroups([{ strategy_id: "x" }], [])).toEqual([]);
  });
  it("reads conditional groups with the contingency vocabulary and waiting legs", () => {
    const g = readConditionalGroups(FACTS.conditional_order_groups, FACTS.conditional_order_group_legs)[0]!;
    expect(g).toMatchObject({ groupId: "cg1", contingency: "OCO", executionTrigger: "ON_FULL_FILL", lateFillPolicy: "HALT_AND_RECONCILE", remainderPolicy: "CANCEL_REMAINDER", state: "ACTIVE" });
    expect(g.legs.map((l) => [l.clientOrderId, l.state, l.trigger ?? l.price])).toEqual([["cg1-a", "OPEN", "2000"], ["cg1-b", "WAITING", "1750"]]);
  });
  it("reads packages with their planned legs and ledgers in time order", () => {
    const p = readOrderPackages(FACTS.arb_order_packages)[0]!;
    expect(p).toMatchObject({ packageId: "pk1", policy: "ATOMIC_ALL_OR_NONE", state: "PLANNED", legCount: 2 });
    expect(p.plannedOrders.map((o) => o.symbol)).toEqual(["ETHUSDT", "ETHUSDC"]);
    const ledger = readLedgerMovements(FACTS.portfolio_capital_ledger, FACTS.settlements);
    expect(ledger.map((l) => [l.id, l.kind, l.type, l.amount])).toEqual([["capital:7", "CAPITAL", "ALLOCATE", "5000"], ["settlement:s1", "SETTLEMENT", "CASH PAYABLE", "12.5"]]);
  });
  it("tells 'not published' from 'published, empty' and scopes to the subject", () => {
    expect(readReplayGroups({}).published).toEqual({ brackets: false, conditional: false, packages: false, ledger: false });
    const all = readReplayGroups(FACTS);
    expect(all.published).toEqual({ brackets: true, conditional: true, packages: true, ledger: true });
    expect(scopeGroups(all, new Set(["someone-else"]), null).brackets).toEqual([]);
    expect(scopeGroups(all, new Set([ACCT]), null).brackets).toHaveLength(1);
    expect(scopeGroups(all, new Set(), "alpha_x").packages).toHaveLength(1);
    expect(publishedLegRoles(all).get("brk-g1-tr0")).toBe("TRAILING");
  });
});

describe("scene — published groups win over the time heuristic", () => {
  const groups = readReplayGroups(FACTS);
  const scene = buildScene(fills, orders, pairRoundTrips(fills, orders), legLevels(orders), groups);
  it("forms the box from the source's bracket group, leaves the stray TP out, and treats the published TRAILING leg as trailing", () => {
    expect(scene.bracketSource).toBe("published");
    const b = scene.brackets[0]!;
    expect(b).toMatchObject({ groupId: "g1", groupState: "ENTRY_FILLED", tp: 1900, sl: 1800, tps: [1900], sls: [1800], t1: null });
    expect(b.legIds).toEqual(["leg:3", "leg:2"]);
    expect(b.title).toContain("legs from the source's group (published)");
    expect(scene.legs.find((l) => l.id === "leg:2")).toMatchObject({ role: "SL", trailing: true, label: "TRAIL 1,800.00" });
    // the stray TP stays a free leg, not part of the box
    expect(scene.legs.find((l) => l.id === "leg:4")).toBeTruthy();
    expect(b.legIds).not.toContain("leg:4");
  });
  it("draws the published-but-unsubmitted TP as a planned level", () => {
    expect(scene.planned).toEqual([expect.objectContaining({ id: "planned:103", role: "TP", level: 1950, groupId: "g1" })]);
  });
  it("carries the OCO group, the atomic package and the ledger into the scene with cards", () => {
    expect(scene.contingencies[0]).toMatchObject({ id: "group:cg1", kind: "OCO", state: "ACTIVE", t1: null });
    expect(scene.contingencies[0]!.levels.map((l) => [l.level, l.waiting])).toEqual([[2000, false], [1750, true]]);
    expect(scene.packages[0]).toMatchObject({ id: "package:pk1", atomic: true, legCount: 2, symbols: ["ETHUSDT", "ETHUSDC"], t1: null });
    expect(scene.ledger.map((l) => [l.id, l.tone])).toEqual([["ledger:capital:7", "good"], ["ledger:settlement:s1", "bad"]]);
    expect(scene.ledger[0]!.card.find((r) => r[0] === "allocated")?.[1]).toBe("20,000.00 → 25,000.00");
  });
  it("falls back to the time heuristic when nothing is published", () => {
    const s = buildScene(fills, orders, pairRoundTrips(fills, orders), legLevels(orders), EMPTY_GROUPS);
    expect(s.bracketSource).toBe("paired-by-time");
    expect(s.brackets[0]!.groupId).toBeNull();
    expect(s.brackets[0]!.tps).toEqual([1900, 2100]); // the stray TP is claimed by proximity — the exact reason the published group matters
    expect(s.contingencies).toEqual([]); expect(s.packages).toEqual([]); expect(s.ledger).toEqual([]);
  });
});
