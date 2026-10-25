// @vitest-environment node
/**
 * WP-F1 fixture block of the review lane (FIXTURE_LAB, register section 2f1): the open capital-statement keys, the allocation shares on the
 * alpha groups, the simulated capital ledger of the scale portfolios and the advisory self-eligibility of the Portfolio 360 rail.
 * Exact decimals from bigint, windows do not apply, the production readers accept every body, the suite portfolios are left to their double.
 * Nothing here is source acceptance.
 */
import "./useMissingScenario";
import { afterAll, afterEach, describe, expect, it } from "vitest";

import { answerReviewManager } from "../../../fixture-bff/review-manager";
import { setFixtureNow, setFixtureScale } from "../../e2e/bffScale";
import { readCapitalLedger } from "../execution/analytics";
import { readManagerDataset } from "../execution/v2/readers/managerDataset";
import { eligibilityBatchAnswers, readAccessEligibilityBatch } from "../execution/v2/readers/accessSelfBatch";
import { scaledOf } from "../execution/v2/screens/portfolios/capitalModel";
import { disposeSchemaCheck } from "./schemaCheck";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = any;
const NOW = "2026-10-22T12:00:00Z";
const ask = (path: string, extra: Record<string, string>): { status: number; body: Body } => {
  setFixtureScale("medium");
  setFixtureNow(NOW);
  return answerReviewManager("GET", path, new URLSearchParams(extra), "populated") as { status: number; body: Body };
};
afterEach(() => {
  setFixtureScale("small");
  setFixtureNow("2026-08-22T13:00:00Z");
});
afterAll(disposeSchemaCheck);

const value = (metrics: Body, key: string): string | null => (metrics[key]?.availability === "AVAILABLE" ? metrics[key].value : null);
const big = (text: string | null): bigint => scaledOf(text as string)!;

describe("capital statement keys (one partition, the same partition's published values)", () => {
  const read = (window: string) => ask("/manager/portfolios/pf_scale_001/overview", { environment: "live", window: JSON.stringify(window), group_by: "portfolio_id", limit: "1" });

  it("allocation, headroom, recalling and net external flows follow their rules exactly, bigint only", () => {
    const { status, body } = read("90D");
    expect(status).toBe(200);
    expect(body.capital_statements.length).toBeGreaterThan(0);
    for (const entry of body.capital_statements as Body[]) {
      const m = entry.metrics;
      const budget = big(value(m, "current_budget"));
      const allocation = big(value(m, "allocation"));
      expect(allocation, "allocation is 55 to 90 percent of the budget").toBeGreaterThanOrEqual(budget * 55n / 100n - 10n ** 22n);
      expect(allocation).toBeLessThanOrEqual(budget * 90n / 100n);
      expect(big(value(m, "headroom")), "headroom = budget - allocation").toBe(budget - allocation);
      expect(big(value(m, "net_external_flows"))).toBe(big(value(m, "initial_funds")) + big(value(m, "added_funds")) - big(value(m, "returned_capital")));
      const recalling = big(value(m, "recalling"));
      expect(recalling).toBeGreaterThanOrEqual(0n);
      expect(recalling).toBeLessThanOrEqual(budget * 4n / 100n);
      for (const key of ["allocation", "headroom", "recalling", "net_external_flows"]) {
        expect(m[key].currency, key).toBe(entry.partition.currency);
        expect(m[key].window, `${key} has no performance window`).toBeNull();
        expect(m[key].calculation_revision, key).toBe("FIXTURE_LAB:capital-review-f1.v1");
        expect(m[key].methodology_ref).toBe("FIXTURE_LAB:synthetic-capital-derived-v1");
      }
    }
  });

  it("is the same in every window (current facts), and the production reader accepts the open keys", () => {
    const a = read("7D").body.capital_statements.map((e: Body) => [value(e.metrics, "allocation"), value(e.metrics, "headroom")]);
    const b = read("90D").body.capital_statements.map((e: Body) => [value(e.metrics, "allocation"), value(e.metrics, "headroom")]);
    expect(a).toEqual(b);
    const parsed = readManagerDataset(read("30D").body);
    expect(parsed).not.toBeNull();
    expect(parsed!.kind).toBe("dataset");
  });

  it("the rule is per partition: two portfolios of one lane do not share a figure by accident", () => {
    const other = ask("/manager/portfolios/pf_scale_002/overview", { environment: "live", window: JSON.stringify("90D"), group_by: "portfolio_id", limit: "1" });
    const one = read("90D").body.capital_statements.map((e: Body) => value(e.metrics, "allocation"));
    const two = other.body.capital_statements.map((e: Body) => value(e.metrics, "allocation"));
    expect(one).not.toEqual(two);
  });
});

describe("allocation_share_pct on the groups by alpha_id", () => {
  const groups = () => ask("/manager/portfolios/pf_scale_001/overview", { environment: "live", window: JSON.stringify("90D"), group_by: "alpha_id", limit: "1" }).body.groups as Body[];

  it("each share is the group's allocation * 100 / the sum of the same partition's group allocations, 6 places truncated", () => {
    const list = groups();
    expect(list.length).toBeGreaterThan(1);
    const total = list.reduce((sum, g) => sum + big(value(g.economic_partitions[0].metrics, "allocation")), 0n);
    for (const g of list) {
      const m = g.economic_partitions[0].metrics;
      const expected = big(value(m, "allocation")) * 100n * 1_000_000n / total;
      expect(big(value(m, "allocation_share_pct")) / 10n ** 18n, g.key[0].value).toBe(expected);
      expect(m.allocation_share_pct.unit).toBe("PERCENT");
      expect(m.allocation_share_pct.window).toBeNull();
    }
    const shares = list.reduce((sum, g) => sum + big(value(g.economic_partitions[0].metrics, "allocation_share_pct")), 0n);
    expect(shares, "truncation never overshoots 100").toBeLessThanOrEqual(100n * 10n ** 24n);
  });

  it("is not on a read grouped by portfolio", () => {
    const list = ask("/manager/portfolios/pf_scale_001/overview", { environment: "live", window: JSON.stringify("90D"), group_by: "portfolio_id", limit: "1" }).body.groups as Body[];
    for (const g of list) expect(g.economic_partitions[0].metrics.allocation_share_pct).toBeUndefined();
  });
});

describe("the simulated capital ledger of a scale portfolio", () => {
  const ledger = (id: string, environment: string) => ask(`/api/v1/execution/portfolios/${id}/capital-ledger`, { environment });

  it("answers the published ledger shape, accepted by the production reader, one bucket per currency", () => {
    const { status, body } = ledger("pf_scale_001", "live");
    expect(status).toBe(200);
    const parsed = readCapitalLedger(body);
    expect(parsed).not.toBeNull();
    expect(parsed!.portfolioId).toBe("pf_scale_001");
    expect(parsed!.buckets.map((b) => b.currency)).toEqual(["USDT"]);
    expect(parsed!.bounded.hasMore).toBe(false);
  });

  it("the bucket totals are the sums of this bucket's own entries; every entry's after = before +/- amount; no entry is dated after the fixture clock", () => {
    const data = ledger("pf_scale_001", "live").body.analytics.data;
    for (const bucket of data.buckets as Body[]) {
      let up = 0n;
      let down = 0n;
      for (const entry of bucket.entries as Body[]) {
        const amount = big(entry.amount);
        if (entry.direction === "INCREASE") { up += amount; expect(big(entry.after_allocated)).toBe(big(entry.before_allocated) + amount); }
        if (entry.direction === "DECREASE") { down += amount; expect(big(entry.after_allocated)).toBe(big(entry.before_allocated) - amount); }
        if (entry.direction === "UNCHANGED") expect(big(entry.after_allocated)).toBe(big(entry.before_allocated));
        expect(Date.parse(entry.occurred_at)).toBeLessThanOrEqual(Date.parse(NOW));
      }
      expect(big(bucket.gross_increase)).toBe(up);
      expect(big(bucket.gross_decrease)).toBe(down);
      expect(bucket.entry_count).toBe(bucket.entries.length);
    }
    expect(data.entry_count).toBe(data.returned_entry_count);
  });

  it("a book the portfolio does not have answers an empty ledger (a fact), and the suite portfolios are left to their double", () => {
    const none = ledger("pf_scale_001", "sandbox").body.analytics.data;
    expect(none.buckets).toEqual([]);
    expect(none.entry_count).toBe(0);
    expect(answerReviewManager("GET", "/api/v1/execution/portfolios/pf_TEST_ONLY_core/capital-ledger", new URLSearchParams({ environment: "live" }), "populated")).toBeNull();
  });
});

describe("advisory self-eligibility for the 360 rail", () => {
  const ACTIONS = ["capital.initial_grant", "capital.top_up", "capital.recall_partial", "capital.recall_full", "capital.adjust_target_budget"];
  const rows = (ids: string[], environment = "live") => ask("/api/admin/profile-access/v2/eligibility/batch", {
    workspace_id: "ws_a", environment, resources: ids.map((id) => `PORTFOLIO:${id}`).join(","), actions: ACTIONS.join(","),
  });

  it("answers the rail's own question, accepted by the production reader, advisory only: command readiness is never checked", () => {
    const { status, body } = rows(["pf_scale_001"]);
    expect(status).toBe(200);
    const read = readAccessEligibilityBatch(body);
    expect(read).not.toBeNull();
    expect(read!.kind).toBe("eligibility_batch");
    expect(eligibilityBatchAnswers((read as { batch: Parameters<typeof eligibilityBatchAnswers>[0] }).batch, { workspaceId: "ws_a", environment: "live", resources: [{ kind: "PORTFOLIO", id: "pf_scale_001" }], actions: ACTIONS as never })).toBe(true);
    for (const result of body.results as Body[]) for (const row of result.actions as Body[]) expect(row.command_readiness).toBe("NOT_CHECKED");
  });

  it("grant and recall are allowed for every scale portfolio; the target budget for about half, the rest typed unavailable with the contract's reason", () => {
    const ids = Array.from({ length: 12 }, (_, i) => `pf_scale_${String(i + 1).padStart(3, "0")}`);
    const results = rows(ids).body.results as Body[];
    const perm = (r: Body, action: string) => r.actions.find((a: Body) => a.action === action).permission;
    expect(results.every((r) => ["capital.initial_grant", "capital.top_up", "capital.recall_partial", "capital.recall_full"].every((a) => perm(r, a) === "ALLOWED"))).toBe(true);
    const target = results.map((r) => perm(r, "capital.adjust_target_budget"));
    expect(target).toContain("ALLOWED");
    expect(target).toContain("UNAVAILABLE");
    const refused = results.flatMap((r) => r.actions as Body[]).find((a) => a.permission === "UNAVAILABLE");
    expect(refused.reason_class).toBe("ACTION_TARGET_UNSUPPORTED");
    expect(refused.grant_ref).toBeNull();
  });

  it("is the same answer twice, and leaves the canonical question (and any non-portfolio resource) to its double", () => {
    expect(rows(["pf_scale_004"]).body.results).toEqual(rows(["pf_scale_004"]).body.results);
    expect(answerReviewManager("GET", "/api/admin/profile-access/v2/eligibility/batch", new URLSearchParams({
      workspace_id: "ws_a", environment: "live", resources: "PORTFOLIO:portfolio_TEST_ONLY,DEPLOYMENT:deployment_TEST_ONLY", actions: "portfolio.read,capital.top_up",
    }), "populated")).toBeNull();
  });
});

describe("fund series end on the fund dataset's own statement figure (QA1 OV-03)", () => {
  const series = (metric: string, window: string, environment = "live") => ask("/manager/series", {
    environment, metric, window: JSON.stringify(window), subjects: JSON.stringify([{ subject_type: "FUND" }]),
  }).body.series[0] as Body;
  const statement = (window: string, environment = "live") => (ask("/manager/fund-overview", { environment, window: JSON.stringify(window), limit: "1" }).body.capital_statements as Body[])
    .find((e) => e.partition.currency === "USDT")!.metrics as Body;
  const last = (entry: Body): string => entry.points[entry.points.length - 1].value as string;

  it.each(["7D", "30D", "90D"])("Net PnL, NAV and Return of the USDT partition end exactly on the statement (%s)", (window) => {
    const m = statement(window);
    expect(big(last(series("NET_PNL", window)))).toBe(big(value(m, "net_pnl")));
    expect(big(last(series("NAV", window)))).toBe(big(value(m, "current_nav")));
    // Return is a FRACTION with 8 places; the statement's percent has 6, so compare at the fraction's own precision.
    expect(big(last(series("RETURN", window))) / 10n ** 14n).toBe(big(value(m, "return_30d_pct")) / 100n / 10n ** 14n);
  });

  it("is a path, not a sawtooth: it starts at a true zero and holds many distinct values", () => {
    const entry = series("NET_PNL", "90D");
    expect(entry.points[0].value).toBe("0");
    expect(new Set(entry.points.map((p: Body) => p.value)).size).toBeGreaterThan(40);
  });

  it("the drawdown strip derives from the same NAV path and stays at or below zero", () => {
    const entry = series("DRAWDOWN", "90D");
    expect(entry.points.every((p: Body) => big(p.value) <= 0n)).toBe(true);
  });
});
