// @vitest-environment node
/**
 * UXM-07 WP-2 (positive world): the capital statement of every scale portfolio in every environment is coherent under the fixture rule
 *   allocated <= approved budget <= funds in (initial + added), allocated + headroom = budget, net external flows = allocated,
 * the capital derivation's `max_capital` ("Max" on the Capital tab) is that same budget, and the statement lines that have a receipt state
 * WHEN they took effect (`effective_at_ms`), ordered funds before the budget before the allocations, all before the as-of. Derived figures
 * (NAV, headroom, net external flows, recalling) and a zero flow state no time. Exact decimals by bigint. The `partial` and `missing`
 * scenarios publish no time at all (typed absence). Not source acceptance.
 */
import { afterEach, describe, expect, it } from "vitest";

import { answerReviewManager } from "../../../fixture-bff/review-manager";
import { answerPortfolios } from "../../e2e/bffDoublePortfolios";
import { setPositiveMode } from "../../e2e/bffPositiveMode";
import { setFixtureNow, setFixtureScale } from "../../e2e/bffScale";
import { setScenario } from "../../../fixture-bff/scenario";
import { scaledOf } from "../execution/v2/screens/portfolios/capitalModel";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = any;
const NOW = "2026-10-22T12:00:00Z";
const ask = (path: string, extra: Record<string, string>): Body => {
  setFixtureScale("medium");
  setFixtureNow(NOW);
  return (answerReviewManager("GET", path, new URLSearchParams(extra), "populated") as { body: Body }).body;
};
afterEach(() => {
  setScenario("positive");
  setPositiveMode(false);
  setFixtureScale("small");
  setFixtureNow("2026-08-22T13:00:00Z");
});

const value = (metrics: Body, key: string): bigint | null => (metrics[key]?.availability === "AVAILABLE" ? scaledOf(metrics[key].value as string) : null);
const at = (metrics: Body, key: string): number | undefined => metrics[key]?.effective_at_ms;
const PORTFOLIOS = Array.from({ length: 12 }, (_, i) => `pf_scale_${String(i + 1).padStart(3, "0")}`);
const ENVIRONMENTS = ["live", "paper", "sandbox"] as const;
const statementsOf = (portfolio: string, environment: string): Body[] =>
  ask(`/manager/portfolios/${portfolio}/overview`, { environment, window: JSON.stringify("30D"), group_by: "portfolio_id", limit: "1" }).capital_statements ?? [];

describe("positive world: every scale portfolio, every environment, one coherent statement", () => {
  it("allocated <= budget <= funds in, allocated + headroom = budget, net external flows = allocated, funds in - returned = allocated", () => {
    let checked = 0;
    for (const portfolio of PORTFOLIOS) for (const environment of ENVIRONMENTS) for (const entry of statementsOf(portfolio, environment)) {
      const m = entry.metrics;
      const [initial, added, returned, budget, allocation, headroom, net] = ["initial_funds", "added_funds", "returned_capital", "current_budget", "allocation", "headroom", "net_external_flows"].map((key) => value(m, key));
      const label = `${portfolio} ${environment} ${entry.partition.currency}`;
      for (const part of [initial, added, returned, budget, allocation, headroom, net]) expect(part, label).not.toBeNull();
      expect(allocation!, `${label}: allocated <= budget`).toBeLessThanOrEqual(budget!);
      expect(budget!, `${label}: budget <= funds in`).toBeLessThanOrEqual(initial! + added!);
      expect(allocation! + headroom!, `${label}: allocated + headroom = budget`).toBe(budget!);
      expect(net!, `${label}: net external flows = allocated`).toBe(allocation!);
      expect(initial! + added! - returned!, `${label}: funded - returned = allocated`).toBe(allocation!);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(12);
  });

  it("pf_scale_006 live USDT is the corrected book: funds in 60,000.00, returned 17,499.25, budget 60,000.00, allocated 42,500.75, headroom 17,499.25, NAV unchanged", () => {
    const [entry] = statementsOf("pf_scale_006", "live");
    const m = entry.metrics;
    const text = (key: string) => scaledOf(m[key].value as string);
    expect(text("initial_funds")).toBe(scaledOf("60000"));
    expect(text("returned_capital")).toBe(scaledOf("17499.25"));
    expect(text("current_budget")).toBe(scaledOf("60000"));
    expect(text("allocation")).toBe(scaledOf("42500.75"));
    expect(text("headroom")).toBe(scaledOf("17499.25"));
    expect(text("current_nav")).toBe(scaledOf("42659.41"));
    expect(text("net_external_flows")).toBe(scaledOf("42500.75"));
  });

  it("the Capital tab's Max (derivation max_capital) is the approved budget of the statement, not a second limit", () => {
    setFixtureScale("medium");
    setPositiveMode(true);
    const derived = answerPortfolios("GET", "/derivations/portfolios/pf_scale_006/capital", "environment=live");
    const row = (derived!.body as Body).data.allocation_by_currency[0];
    const [entry] = statementsOf("pf_scale_006", "live");
    expect(scaledOf(row.max_capital)).toBe(value(entry.metrics, "current_budget"));
    expect(scaledOf(row.allocated_capital)).toBe(value(entry.metrics, "allocation"));
  });
});

describe("positive world: effective times", () => {
  it("funds, return, budget and allocation state a time: funds < return < budget < allocation < as-of, UTC-ms integers", () => {
    const asOf = Date.parse(NOW);
    let checked = 0;
    for (const portfolio of PORTFOLIOS) for (const environment of ENVIRONMENTS) for (const entry of statementsOf(portfolio, environment)) {
      const m = entry.metrics;
      const label = `${portfolio} ${environment}`;
      const [funds, returned, budget, allocation] = ["initial_funds", "returned_capital", "current_budget", "allocation"].map((key) => at(m, key));
      for (const time of [funds, returned, budget, allocation]) expect(Number.isSafeInteger(time), label).toBe(true);
      expect(funds!, label).toBeLessThan(returned!);
      expect(returned!, label).toBeLessThan(budget!);
      expect(budget!, label).toBeLessThan(allocation!);
      expect(allocation!, label).toBeLessThan(asOf);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(12);
  });

  it("no time on a zero flow or on a derived/valuation figure (never invented)", () => {
    for (const entry of statementsOf("pf_scale_006", "live")) {
      for (const key of ["added_funds", "current_nav", "headroom", "recalling", "net_external_flows", "net_pnl"]) expect(at(entry.metrics, key), key).toBeUndefined();
    }
  });

  it("each alpha group's allocation states when it took effect, after the budget approval and before the as-of", () => {
    const body = ask("/manager/portfolios/pf_scale_006/overview", { environment: "live", window: JSON.stringify("30D"), group_by: "alpha_id", limit: "1" });
    const [entry] = statementsOf("pf_scale_006", "live");
    const groups = body.groups as Body[];
    expect(groups.length).toBeGreaterThan(0);
    for (const group of groups) for (const part of group.economic_partitions) {
      const time = at(part.metrics, "allocation");
      expect(Number.isSafeInteger(time), group.key[0].value).toBe(true);
      expect(time!).toBeGreaterThan(at(entry.metrics, "current_budget")!);
      expect(time!).toBeLessThan(Date.parse(NOW));
    }
  });

  it("the partial and missing scenarios publish no time (typed absence), only the fixed receipts", () => {
    for (const scenario of ["partial", "missing"] as const) {
      setScenario(scenario);
      for (const entry of statementsOf("pf_scale_006", "live")) for (const key of Object.keys(entry.metrics)) expect(at(entry.metrics, key), `${scenario} ${key}`).toBeUndefined();
    }
  });
});
