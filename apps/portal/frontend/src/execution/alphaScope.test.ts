/**
 * The scope bar must narrow the facts, and must not invent a narrowing the
 * rows cannot support (P0-2).
 */
import { describe, expect, it } from "vitest";

import {
  accountsOfPortfolio, rowInScope, scopeFacts, scopeIsAll, scopeSummary, windowSpanMs,
} from "./alphaScope";

const ALL = { portfolio: "ALL", mode: "ALL", venue: "ALL", window: "All" };
const NOW = Date.parse("2026-09-07T12:00:00.000Z");
const day = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

describe("windows", () => {
  it("measures the named windows and treats All as unbounded", () => {
    expect(windowSpanMs("30d")).toBe(30 * 86_400_000);
    expect(windowSpanMs("90d")).toBe(90 * 86_400_000);
    expect(windowSpanMs("1y")).toBe(365 * 86_400_000);
    expect(windowSpanMs("All")).toBeNull();
    expect(windowSpanMs("nonsense")).toBeNull();
  });
});

describe("one row against a scope", () => {
  const row = { venue: "BINANCE", mode: "paper", account_id: "acct-1", trade_time: day(3) };

  it("keeps a row that agrees and drops one that disagrees on a field it carries", () => {
    expect(rowInScope(row, { ...ALL, venue: "BINANCE" })).toBe(true);
    expect(rowInScope(row, { ...ALL, venue: "OKX" })).toBe(false);
    expect(rowInScope(row, { ...ALL, mode: "paper" })).toBe(true);
    expect(rowInScope(row, { ...ALL, mode: "live" })).toBe(false);
    // stage/profile_environment stand in for mode where the source names it so
    expect(rowInScope({ stage: "SANDBOX" }, { ...ALL, mode: "sandbox" })).toBe(true);
    expect(rowInScope({ profile_environment: "live" }, { ...ALL, mode: "paper" })).toBe(false);
  });

  it("keeps a row that does not carry the field at all — the source's silence is not a mismatch", () => {
    expect(rowInScope({ account_id: "acct-1" }, { ...ALL, venue: "OKX" })).toBe(true);
    expect(rowInScope({ venue: "BINANCE" }, { ...ALL, mode: "live" })).toBe(true);
    expect(rowInScope({ venue: "BINANCE" }, { ...ALL, window: "30d" }, { nowMs: NOW })).toBe(true);
  });

  it("applies the window to whichever timestamp the row carries, and to no row without one", () => {
    expect(rowInScope({ trade_time: day(10) }, { ...ALL, window: "30d" }, { nowMs: NOW })).toBe(true);
    expect(rowInScope({ trade_time: day(40) }, { ...ALL, window: "30d" }, { nowMs: NOW })).toBe(false);
    expect(rowInScope({ trade_time: day(40) }, { ...ALL, window: "90d" }, { nowMs: NOW })).toBe(true);
    expect(rowInScope({ submitted_at: day(400) }, { ...ALL, window: "1y" }, { nowMs: NOW })).toBe(false);
    expect(rowInScope({ submitted_at_ms: NOW - 40 * 86_400_000 }, { ...ALL, window: "30d" }, { nowMs: NOW })).toBe(false);
    expect(rowInScope({ id: "no clock" }, { ...ALL, window: "30d" }, { nowMs: NOW })).toBe(true);
  });

  it("places a row in a portfolio by its own id, or by the accounts of that portfolio", () => {
    expect(rowInScope({ portfolio_id: "PF-A" }, { ...ALL, portfolio: "PF-A" })).toBe(true);
    expect(rowInScope({ portfolio_id: "PF-B" }, { ...ALL, portfolio: "PF-A" })).toBe(false);
    expect(rowInScope({ account_id: "acct-1" }, { ...ALL, portfolio: "PF-A" }, { portfolioAccounts: ["acct-1"] })).toBe(true);
    expect(rowInScope({ account_id: "acct-2" }, { ...ALL, portfolio: "PF-A" }, { portfolioAccounts: ["acct-1"] })).toBe(false);
    // no mapping published and no portfolio on the row: the row stays
    expect(rowInScope({ account_id: "acct-2" }, { ...ALL, portfolio: "PF-A" })).toBe(true);
  });
});

describe("scoping the facts", () => {
  const facts = {
    orders: [
      { order_id: 1, venue: "BINANCE", mode: "paper", account_id: "acct-1", submitted_at: day(2) },
      { order_id: 2, venue: "OKX", mode: "sandbox", account_id: "acct-2", submitted_at: day(2) },
      { order_id: 3, venue: "BINANCE", mode: "paper", account_id: "acct-1", submitted_at: day(120) },
    ],
    positions: [{ venue: "BINANCE", mode: "paper" }, { venue: "OKX", mode: "paper" }],
    strategies: [{ strategy_id: "a" }],
  };

  it("narrows every array, counts what it hid, and leaves fact keys in place", () => {
    const scoped = scopeFacts(facts, { portfolio: "ALL", mode: "paper", venue: "BINANCE", window: "30d" }, { nowMs: NOW });
    expect(scoped.facts.orders.map((r) => r.order_id)).toEqual([1]);
    expect(scoped.facts.positions).toHaveLength(1);
    // a row carrying none of the scoped fields survives, and the key survives with it
    expect(scoped.facts.strategies).toHaveLength(1);
    expect(scoped.effect.orders).toEqual({ kept: 1, removed: 2 });
    expect(scoped.removedTotal).toBe(3);
  });

  it("changes nothing when the scope selects everything", () => {
    const scoped = scopeFacts(facts, ALL, { nowMs: NOW });
    expect(scoped.facts.orders).toHaveLength(3);
    expect(scoped.removedTotal).toBe(0);
    expect(scopeIsAll(ALL)).toBe(true);
    expect(scopeIsAll({ ...ALL, window: "30d" })).toBe(false);
  });
});

describe("what the bar says", () => {
  it("names the axes in force and how many rows are hidden, or says nothing is filtered", () => {
    expect(scopeSummary(ALL, 0)).toBe("every panel below obeys this scope · nothing is filtered out right now");
    expect(scopeSummary({ portfolio: "PF-A", mode: "paper", venue: "ALL", window: "30d" }, 1))
      .toBe("portfolio PF-A · mode paper · last 30d — 1 row outside this scope is hidden");
    expect(scopeSummary({ portfolio: "ALL", mode: "ALL", venue: "OKX", window: "All" }, 12))
      .toBe("venue OKX — 12 rows outside this scope are hidden");
  });

  it("reads the portfolio's accounts from the rows the resource already carries", () => {
    const allocations = [
      { portfolio_id: "PF-A", account_id: "acct-1" },
      { portfolio_id: "PF-A", account_id: "acct-1" },
      { portfolio_id: "PF-B", account_id: "acct-9" },
    ];
    expect(accountsOfPortfolio(allocations, "PF-A")).toEqual(["acct-1"]);
    expect(accountsOfPortfolio(allocations, "ALL")).toEqual([]);
    expect(accountsOfPortfolio(null, "PF-A")).toEqual([]);
  });
});
