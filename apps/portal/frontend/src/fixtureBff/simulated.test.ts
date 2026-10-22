// @vitest-environment node
/**
 * SIMULATED fixture facts (FIXTURE_LAB, `e2e/bffSimulated.ts`): served through the same routes, read by the same readers, opt-in.
 * Off (no `simulated`, no `reviewManager`) the sparse default is byte-for-byte what it was.
 */
import { describe, expect, it } from "vitest";

import { answerExecutionBff, type BffDoubleOptions } from "../../e2e/bffDouble";
import { readFinancialChart } from "../execution/api/financialChart";
import { readProfileEnvelope } from "../execution/api/profileRead";
import { readOperationalQueueV2 } from "../execution/v2/readers/operationalQueue";
import { brokerFacts, readAccountView } from "../execution/v2/screens/account/model";
import { readBlotter } from "../execution/v2/screens/blotter/blotterModel";

const OFF: BffDoubleOptions = { operationsV2: true, screensV2: true };
const ON: BffDoubleOptions = { operationsV2: true, screensV2: true, simulated: true };
const ask = (path: string, options: BffDoubleOptions, query: Record<string, string> = {}) =>
  answerExecutionBff("GET", `/api/v1/execution${path}`, new URLSearchParams(query), options).body;

describe("opt-in", () => {
  it("off, nothing simulated is served", () => {
    const queue = ask("/operations", OFF) as { page: Record<string, unknown> };
    expect(queue.page.status_counts).toBeUndefined();
    const account = readProfileEnvelope(ask("/resources/accounts/acc_bnc_core", OFF))!;
    expect(brokerFacts(account, "USDT")!.walletBalance).toBeUndefined();
    expect(readAccountView(account, "acc_bnc_core").allocations[0]!.budgetApproved).toBeUndefined();
    expect(readBlotter(readProfileEnvelope(ask("/screens/blotter", OFF))!)!.orders[0]!.fee.kind).toBe("absent");
  });

  it("reviewManager implies it; the stage routes are untouched", () => {
    const body = ask("/operations", { operationsV2: true, screensV2: true, reviewManager: true }) as { page: Record<string, unknown> };
    expect(body.page.status_counts).toBeDefined();
  });
});

describe("operations queue status_counts (FE-043)", () => {
  const body = ask("/operations", ON, { limit: "250" });
  const queue = readOperationalQueueV2(body)!;
  const counts = queue.kind === "queue" ? queue.queue.page.statusCounts! : null;

  it("validates in the real reader and counts the rows by integer tally", () => {
    expect(queue.kind).toBe("queue");
    expect(counts).not.toBeNull();
    const rows = (queue as { queue: { page: { rows: { verificationResult: string }[]; filteredCount: number } } }).queue.page;
    expect(counts!.verificationResult.total).toBe(rows.filteredCount);
    expect(counts!.verificationResult.counts.UNCERTAIN).toBe(rows.rows.filter((r) => r.verificationResult === "UNCERTAIN").length);
    expect(counts!.verificationResult.counts.UNCERTAIN).toBeGreaterThan(0);
  });

  it("every dimension sums to its total and keeps a true zero as 0", () => {
    for (const dim of [counts!.triageState, counts!.verificationResult, counts!.sourceStatus, counts!.severity]) {
      expect(Object.values(dim.counts as Record<string, number>).reduce((a, b) => a + b, 0)).toBe(dim.total);
    }
    // Narrowed to one verification result, the other buckets of the other dimensions are true zeros, printed as 0.
    const narrowed = readOperationalQueueV2(ask("/operations", ON, { verification_result: "UNCERTAIN" }))! as { queue: { page: { statusCounts: typeof counts } } };
    expect(Object.values(narrowed.queue.page.statusCounts!.sourceStatus.counts as Record<string, number>)).toContain(0);
  });

  it("a dimension ignores its own filter and no other", () => {
    const filtered = readOperationalQueueV2(ask("/operations", ON, { verification_result: "UNCERTAIN", severity: "CRITICAL" }))!;
    const c = (filtered as { queue: { page: { statusCounts: typeof counts; filteredCount: number } } }).queue.page.statusCounts!;
    expect(c.verificationResult.ownFilterApplied).toBe(true);
    // Verification ignores its own filter but keeps severity=CRITICAL, so its total is the CRITICAL rows.
    expect(c.verificationResult.total).toBe(c.severity.counts.CRITICAL);
    expect(c.severity.total).toBe(c.verificationResult.counts.UNCERTAIN);
  });
});

describe("account 360 resource", () => {
  const core = readProfileEnvelope(ask("/resources/accounts/acc_bnc_core", ON))!;
  const sub = readProfileEnvelope(ask("/resources/accounts/acc_bnc_sub", ON))!;

  it("native custody: wallet balance and native equity on the newest broker report", () => {
    const broker = brokerFacts(core, "USDT")!;
    expect(broker.walletBalance).toMatchObject({ decimal: { full: "412880.25" } });
    expect(broker.nativeEquity).toMatchObject({ decimal: { full: "414010.40" } });
  });

  it("one level keeps a typed absence: the sub account has a wallet balance and no native equity", () => {
    const broker = brokerFacts(sub, "USDT")!;
    expect(broker.walletBalance).toMatchObject({ decimal: { full: "118050.00" } });
    expect(broker.nativeEquity).toBeUndefined();
  });

  it("PM capital: budget and exposure on the allocation row; gross is long + short in one currency", () => {
    const row = readAccountView(core, "acc_bnc_core").allocations[0]!;
    expect(row.budgetUsed).toMatchObject({ decimal: { full: "80000.00" } });
    expect(row.budgetApproved).toMatchObject({ decimal: { full: "100000.00" } });
    expect(row.exposureLong).toMatchObject({ decimal: { full: "61300.00" } });
    expect(row.exposureShort).toMatchObject({ decimal: { full: "35100.00" } });
    expect(row.exposureGross).toMatchObject({ decimal: { full: "96400.00" } });
  });

  it("display names ride the rows that already name the ids", () => {
    const view = readAccountView(core, "acc_bnc_core");
    expect(view.names.portfolios).toEqual({ pf_core: "Core" });
    expect(view.names.deployments).toEqual({ dep_btc_live: "BTC Trend live" });
    expect(view.names.alphas).toEqual({ btc_trend: "BTC Trend" });
  });
});

describe("account drawdown series", () => {
  const chart = (metric: string) => readFinancialChart(ask("/views/equity-chart", ON, { environment: "live", subject_kind: "account", subject_id: "acc_bnc_core", metric }))!;

  it("is derived from the published equity points by exact arithmetic: a true zero at the peak, a gap stays a gap, a dip is negative", () => {
    const equity = chart("equity").series[0]!.points;
    const drawdown = chart("drawdown");
    expect(drawdown.metric).toBe("drawdown");
    const series = drawdown.series[0]!;
    expect(series.currency).toBeNull();
    expect(series.points.map(([, v]) => v)).toEqual(["0.000000", "0.000000", null, "0.000000", "-0.006932", "0.000000"]);
    expect(series.points.map(([t]) => t)).toEqual(equity.map(([t]) => t));
    expect(equity.at(-1)![1]).toBe("88200.00");
  });
});

describe("blotter order row", () => {
  it("carries its deployment, average fill price and fee with the fee's own currency", () => {
    const order = readBlotter(readProfileEnvelope(ask("/screens/blotter", ON))!)!.orders[0]!;
    expect(order.deploymentId).toBe("dep_btc_live");
    expect(order.averageFillPrice).toEqual({ kind: "value", text: "61250.40" });
    expect(order.fee).toEqual({ kind: "value", text: "12.35" });
    expect(order.feeCurrency).toBe("USDT");
  });
});
