// @vitest-environment node
/** WP-P: the POSITIVE default scenario. One book: series (Codex's producer), statements, rows and the All lens agree; nothing is degraded. */
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { answerReviewManager } from "../../../fixture-bff/review-manager";
import { positiveManagerWorld } from "../../../fixture-bff/positive-world";
import { resetScenario, setScenario } from "../../../fixture-bff/scenario";
import { setFixtureNow, setFixtureScale } from "../../e2e/bffScale";
import { disposeSchemaCheck, violationsOf } from "./schemaCheck";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = any;
const ask = (path: string, extra: Record<string, string>): Body =>
  answerReviewManager("GET", path, new URLSearchParams(extra), "populated");
const dataset = (path: string, environment: string, extra: Record<string, string> = {}): Body => ask(path, { environment, limit: "200", ...extra });
// The All lens at the medium scale already sat at the contract's 1 MiB response bound (`query_policy.maximum_response_bytes`) with 70 rows
// (about 15 KB a row); a row now carries the Winrate key too (UXM-07 WP-1, +0.5 KB), so the lens is read in a page of 60 (the Fleet itself pages by 50).
const allLens = (): Body => dataset("/manager/fleet", "ALL", { limit: "60" });
const series = (metric: string, environment: string, subject: Body = { subject_type: "FUND" }): Body => ask("/manager/series", {
  environment, metric, subjects: JSON.stringify([subject]), window: JSON.stringify("30D") });
const units = (value: string): bigint => {
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = value.replace("-", "").split(".");
  const n = BigInt(whole + fraction.padEnd(18, "0").slice(0, 18));
  return negative ? -n : n;
};

beforeEach(() => { resetScenario(); setScenario("positive"); setFixtureScale("medium"); setFixtureNow("2026-10-22T12:00:00Z"); });
afterEach(() => { setFixtureScale("small"); setFixtureNow("2026-08-22T13:00:00Z"); });
afterAll(() => { resetScenario(); disposeSchemaCheck(); });

describe("positive series: four views of one NAV book", () => {
  it.each(["live", "paper"])("%s: NAV ends on the statement NAV, NET_PNL on the statement net PnL, RETURN and DRAWDOWN follow, no gap, VERIFIED", (environment) => {
    const fund = dataset("/manager/fund-overview", environment);
    expect(fund.status).toBe(200);
    const statement = fund.body.capital_statements.find((entry: Body) => entry.partition.currency === "USDT");
    expect(statement).toBeTruthy();
    const nav = series("NAV", environment), pnl = series("NET_PNL", environment), ret = series("RETURN", environment), dd = series("DRAWDOWN", environment);
    for (const answer of [nav, pnl, ret, dd]) {
      expect(answer.status).toBe(200);
      expect(violationsOf({ file: "execution-manager-series.v1", ptr: "" }, answer.body).violations).toEqual([]);
      expect(answer.body.quality).toEqual({ completeness: "COMPLETE", freshness: "FRESH", reasons: [] });
      const entry = answer.body.series[0];
      expect(entry.state).toBe("AVAILABLE");
      expect(entry.gaps).toEqual([]);
      expect(entry.source_confidence).toBe("VERIFIED");
      expect(entry.points).toHaveLength(240);
    }
    const last = (answer: Body): string => answer.body.series[0].points.at(-1).value;
    const first = (answer: Body): string => answer.body.series[0].points[0].value;
    expect(units(last(nav))).toBe(units(statement.metrics.current_nav.value));
    expect(units(last(pnl))).toBe(units(statement.metrics.net_pnl.value));
    // the opening NAV is the opening capital, and NET_PNL / opening NAV is the RETURN, exactly as the producer computes it
    expect(units(last(nav)) - units(first(nav))).toBe(units(last(pnl)));
    expect(units(last(ret))).toBe(units(last(pnl)) * 10n ** 18n / units(first(nav)));
    expect(dd.body.series[0].points.every((point: Body) => units(point.value) <= 0n)).toBe(true);
  });

  it("statement identity: current NAV = initial funds + net PnL = the sum of the rows' balances; capital added = returned", () => {
    const body = dataset("/manager/fund-overview", "live").body;
    for (const statement of body.capital_statements) {
      const m = statement.metrics;
      const currency = statement.partition.currency;
      expect(units(m.current_nav.value)).toBe(units(m.initial_funds.value) + units(m.net_pnl.value));
      expect(units(m.added_funds.value)).toBe(units(m.returned_capital.value));
      const rows = body.items.flatMap((row: Body) => row.economic_partitions).filter((p: Body) => p.partition.currency === currency);
      const balances = rows.reduce((sum: bigint, p: Body) => sum + units(p.metrics.balance_total.value), 0n);
      expect(balances).toBe(units(m.current_nav.value));
      expect(m.pending_amount.availability).toBe("AVAILABLE");
    }
  });

  it("current balances do not change with the performance window; young books have equal 30D/90D PnL and budget above actual allocation", () => {
    const read = (window: string): Body => dataset("/manager/fund-overview", "live", { window: JSON.stringify(window) }).body;
    const [week, month, quarter] = ["7D", "30D", "90D"].map(read);
    const current = (body: Body): Body => body.items.map((row: Body) => row.economic_partitions.map((entry: Body) => ({
      partition: entry.partition,
      balance: entry.metrics.balance_total.value,
      equity: entry.metrics.equity_30d_end_value.value,
    })));
    expect(current(week)).toEqual(current(month));
    expect(current(quarter)).toEqual(current(month));
    const pnl = (body: Body): string[] => body.items.flatMap((row: Body) => row.economic_partitions.map((entry: Body) => entry.metrics.net_pnl.value));
    expect(pnl(quarter)).toEqual(pnl(month));
    expect(pnl(week)).not.toEqual(pnl(month));
    for (const statement of month.capital_statements) {
      const m = statement.metrics;
      expect(units(m.allocation.value)).toBe(units(m.initial_funds.value));
      expect(units(m.current_budget.value)).toBeGreaterThan(units(m.allocation.value));
      expect(units(m.headroom.value)).toBe(units(m.current_budget.value) - units(m.allocation.value));
    }
  });

  it("a portfolio book ties the same way: its NAV series ends on the group's current NAV", () => {
    const grouped = dataset("/manager/fund-overview", "live", { group_by: "portfolio_id" }).body;
    const group = grouped.groups.find((entry: Body) => entry.key[0].value === "pf_TEST_ONLY_core") ?? grouped.groups[0];
    const id = group.key[0].value;
    const nav = series("NAV", "live", { subject_type: "PORTFOLIO", subject_id: id });
    expect(nav.status).toBe(200);
    expect(nav.body.series[0].state).toBe("AVAILABLE");
  });
});

describe("positive datasets carry nothing degraded", () => {
  it("rows have no typed absence among the money keys and no insufficient or zero score; quality COMPLETE/FRESH", () => {
    for (const environment of ["paper", "sandbox", "live"]) {
      const body = dataset("/manager/fleet", environment).body;
      expect(body.quality).toMatchObject({ completeness: "COMPLETE", freshness: "FRESH" });
      for (const row of body.items) for (const entry of row.economic_partitions) {
        for (const key of ["allocation", "net_pnl", "unrealized_pnl", "balance_total", "equity_30d_end_value", "return_30d_pct", "max_drawdown_pct", "cost_drag_slippage"]) {
          expect(entry.metrics[key].availability, `${environment} ${row.alpha_id} ${key}`).toBe("AVAILABLE");
        }
        if (entry.metrics.score) expect(entry.metrics.score.availability).toBe("AVAILABLE");
        expect(entry.metrics.qbts_evidence?.reason_code).not.toBe("insufficient");
        expect(units(entry.metrics.net_pnl.value)).not.toBe(0n);
      }
    }
  });

  it("All lens: Paper, Sandbox and Live are all INCLUDED, fresh and complete, with rows; no body-level warning", () => {
    const body = allLens().body;
    expect(violationsOf({ file: "execution-manager-dataset.v1", ptr: "" }, body).violations).toEqual([]);
    expect(body.quality).toEqual({ completeness: "COMPLETE", freshness: "FRESH", reasons: [] });
    expect(body.environment_coverage.map((c: Body) => [c.environment, c.availability, c.reason_code, c.quality?.completeness, c.quality?.freshness]))
      .toEqual([["paper", "INCLUDED", null, "COMPLETE", "FRESH"], ["sandbox", "INCLUDED", null, "COMPLETE", "FRESH"], ["live", "INCLUDED", null, "COMPLETE", "FRESH"]]);
    expect(new Set(body.items.map((row: Body) => row.environment))).toEqual(new Set(["paper", "sandbox", "live"]));
  });
});

describe("the other scenarios keep their meaning", () => {
  it.each([["stale", "COMPLETE", "STALE"], ["partial", "PARTIAL", "FRESH"], ["missing", "PARTIAL", "FRESH"]])("%s: dataset quality %s/%s", (scenario, completeness, freshness) => {
    setScenario(scenario as "stale");
    expect(dataset("/manager/fleet", "live").body.quality).toMatchObject({ completeness, freshness });
  });
  it("missing: the All lens has a NOT_CONFIGURED Sandbox and a lagging Paper; partial: Paper is partial; stale: Paper lags", () => {
    setScenario("missing");
    expect(allLens().body.environment_coverage.map((c: Body) => c.availability)).toEqual(["INCLUDED", "UNAVAILABLE", "INCLUDED"]);
    setScenario("partial");
    expect(allLens().body.environment_coverage[0].quality.completeness).toBe("PARTIAL");
    setScenario("stale");
    expect(allLens().body.environment_coverage[0].quality.freshness).toBe("STALE");
  });
  it("missing keeps the former default's exact-zero drawdown, a null second return and an off-book receipt", () => {
    setScenario("missing");
    const statements = dataset("/manager/fund-overview", "live").body.capital_statements as Body[];
    expect(statements[0].metrics.max_drawdown_pct.value).toBe("0");
    expect(statements.length > 1 ? statements[1].metrics.return_30d_pct.availability : "UNAVAILABLE").toBe("UNAVAILABLE");
    setScenario("positive");
    const positive = dataset("/manager/fund-overview", "live").body.capital_statements as Body[];
    expect(positive.every((entry) => entry.metrics.max_drawdown_pct.value !== "0" && entry.metrics.return_30d_pct.availability === "AVAILABLE")).toBe(true);
  });
  it("missing and partial: a series keeps its gap and SOURCE_GAP", () => {
    for (const scenario of ["missing", "partial"] as const) {
      setScenario(scenario);
      const entry = series("NAV", "live").body.series[0];
      expect(entry.gaps).toHaveLength(1);
      expect(entry.quality.reasons).toContain("SOURCE_GAP");
    }
  });
});

describe("Codex's positive world is the oracle of the book identity", () => {
  it("the world's own tie-out (allocation + realized + unrealized = unique-account balances) holds, and the shared account is counted once", () => {
    const world = positiveManagerWorld();
    for (const environment of ["paper", "sandbox", "live"] as const) {
      const rows = world.relations[environment];
      const allocation = rows.portfolio_allocations.reduce((sum, r) => sum + BigInt(r.allocated_capital), 0n);
      const pnl = rows.positions_v2.reduce((sum, r) => sum + BigInt(r.realized_pnl) + BigInt(r.unrealized_pnl), 0n);
      const balance = rows.account_balances.reduce((sum, r) => sum + BigInt(r.total), 0n);
      expect(balance).toBe(allocation + pnl);
      expect(new Set(rows.account_balances.map((r) => r.account_id)).size).toBe(2);
    }
    expect(world.tuples.filter((t) => t.account_id === "account_TEST_ONLY_XS")).toHaveLength(2);
  });
});
