/**
 * The capital flow model of one environment (WP-F1, `flowModel.ts`): which published figure is which node, that a budget is a dashed
 * LIMIT edge and never a band, that blocks are per economic partition and never merged, that an unpublished figure is an absent node
 * (not an invented one) and that nothing in the model is added or derived.
 */
import { describe, expect, it } from "vitest";

import { absentMetric, moneyMetric, partition } from "../../../readers/managerDataset.testbase";
import { datasetFor } from "../datasetFixtures.testbase";
import type { AccountView, DeploymentView } from "./model";
import type { CapitalLedger } from "../../../../analytics";
import { allocationTimesByAccount, deploymentsOf, flowBlocks, flowRows, flowTimeOf } from "./flowModel";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = any;

const money = (value: string, currency = "USDT") => moneyMetric({ currency, value });
const LIVE = () => partition("ACTUAL", "USDT", "actual");

const statementsOf = (metrics: Record<string, Body>, p = LIVE()) => datasetFor("PORTFOLIO", "pf_x", (body: Body) => { body.capital_statements = [{ partition: p, metrics }]; });
const FULL = {
  initial_funds: money("20000.00"), added_funds: money("0.00"), returned_capital: money("250.00"), current_nav: money("23000.00"), current_budget: money("18000.00"),
  allocation: money("14580.00"), headroom: money("3420.00"), recalling: money("360.00"), net_external_flows: money("19750.00"),
};
const alphasOf = (rows: [string, string | null, string?][]) => datasetFor("PORTFOLIO", "pf_x", (body: Body) => {
  body.groups = rows.map(([alpha, allocation, currency = "USDT"]) => ({
    key: [{ field: "alpha_id", value: alpha }], unique_row_count: 1, totals_scope: "FULL_AUTHORIZED_FILTERED_QUERY",
    economic_partitions: [{ partition: LIVE(), metrics: { allocation: allocation === null ? absentMetric({ reason_code: "SOURCE_FACTS_NOT_PUBLISHED", unit: "MONEY", currency }) : money(allocation, currency) } }],
  }));
});

const dep = (id: string, alpha: string, allocation: string | null, over: Partial<DeploymentView> = {}): DeploymentView => ({
  deploymentId: id, strategyId: alpha, alphaLabel: `Label ${alpha}`, version: "1", owner: null, stage: "LIVE", stageLabel: "Live", environment: "live", domain: "real",
  venue: "BINANCE", accountId: `acc_${id}`, currency: "USDT", allocation, positionPnl: "-5.69", exposure: "1778.84", healthKind: "ok", healthLabel: "Ready", ...over,
});

describe("flowBlocks", () => {
  it("builds funds in -> NAV, a LIMIT edge to the approved budget, budget -> alpha -> deployment, each amount the published string", () => {
    const [model] = flowBlocks("live", statementsOf(FULL), alphasOf([["alpha_a", "2500.50"]]), [dep("dep_1", "alpha_a", "2500.50")]);
    const block = model!.block;
    const byId = new Map(block.nodes.map((n) => [n.id, n]));
    expect(byId.get("initial")!.value).toBe("20000.00");
    expect(byId.get("added")!.value).toBe("0.00");
    expect(byId.get("nav")!.value).toBe("23000.00");
    expect(byId.get("returned")!.value).toBe("250.00");
    expect(byId.get("budget")!.value).toBe("18000.00");
    expect(byId.get("alpha:alpha_a")!.label).toBe("Label alpha_a");
    expect(byId.get("alpha:alpha_a")!.value).toBe("2500.50");
    expect(byId.get("dep:dep_1")!.value).toBe("2500.50");
    const limit = block.edges.find((e) => e.id === "e-limit")!;
    expect(limit).toMatchObject({ from: "nav", to: "budget", kind: "limit", label: "Limit, not cash" });
    expect(block.edges.filter((e) => e.kind === "limit")).toHaveLength(1);
    expect(block.edges.find((e) => e.id === "e-dep:dep_1")).toMatchObject({ from: "alpha:alpha_a", to: "dep:dep_1", value: "2500.50" });
    expect(block.basis).toBe("real");
    expect(block.label).toBe("Real-funded · USDT");
  });

  it("headroom is a hatched node under the budget, with the facts that have no band kept for the table", () => {
    const [model] = flowBlocks("live", statementsOf(FULL), alphasOf([]), []);
    const headroom = model!.block.nodes.find((n) => n.id === "headroom")!;
    expect(headroom).toMatchObject({ value: "3420.00", hatched: true, note: "Not deployed" });
    // UXM-07 WP-2: a fact row states a time too. None is published for these (derived figures), so each says so.
    const none = { text: "Not published", short: null };
    expect(model!.facts).toEqual([
      { label: "Net external flows", value: "19750.00", time: none },
      { label: "Recalling", value: "360.00", time: none },
      { label: "Headroom", value: "3420.00", time: none },
    ]);
  });

  it("an unpublished figure is an ABSENT node with its request id, never a made-up amount; no headroom node without a published headroom", () => {
    const [model] = flowBlocks("live", statementsOf({ initial_funds: money("20000.00"), current_budget: absentMetric({ reason_code: "SOURCE_FACTS_NOT_PUBLISHED", unit: "MONEY", currency: "USDT" }) }), null, []);
    const byId = new Map(model!.block.nodes.map((n) => [n.id, n]));
    expect(byId.get("budget")).toMatchObject({ value: null, absent: "Not published: capital statements" });
    expect(byId.get("nav")).toMatchObject({ value: null, absent: "Not published: capital statements" });
    expect(byId.has("headroom")).toBe(false);
    expect(model!.block.edges.find((e) => e.id === "e-limit")!.value).toBeNull();
  });

  it("an alpha group with no published allocation is an absent node, and its deployments keep their own published allocation", () => {
    const [model] = flowBlocks("live", statementsOf(FULL), alphasOf([["alpha_a", null]]), [dep("dep_1", "alpha_a", "10.00")]);
    const alpha = model!.block.nodes.find((n) => n.id === "alpha:alpha_a")!;
    expect(alpha.value).toBeNull();
    expect(alpha.absent).toBe("Not published: capital statements");
    expect(model!.block.nodes.find((n) => n.id === "dep:dep_1")!.value).toBe("10.00");
  });

  it("only deployments of the environment and of the partition's currency hang under an alpha", () => {
    const deployments = [dep("dep_live", "alpha_a", "1.00"), dep("dep_paper", "alpha_a", "2.00", { environment: "paper" }), dep("dep_eur", "alpha_a", "3.00", { currency: "EUR" })];
    const [model] = flowBlocks("live", statementsOf(FULL), alphasOf([["alpha_a", "1.00"]]), deployments);
    expect(model!.block.nodes.filter((n) => n.id.startsWith("dep:")).map((n) => n.id)).toEqual(["dep:dep_live"]);
    expect(deploymentsOf(deployments, "paper").map((d) => d.deploymentId)).toEqual(["dep_paper"]);
  });

  it("one block per economic partition: Real-funded and Paper never share a block, and a simulated block is simulated", () => {
    const dataset = datasetFor("PORTFOLIO", "pf_x", (body: Body) => {
      body.capital_statements = [{ partition: LIVE(), metrics: FULL }, { partition: partition("PAPER", "USDT", "usdt"), metrics: { initial_funds: money("250000.00"), added_funds: money("50000.00") } }];
    });
    const models = flowBlocks("paper", dataset, null, []);
    expect(models.map((m) => [m.block.id, m.block.basis])).toEqual([["paper:ACTUAL:USDT", "real"], ["paper:PAPER:USDT", "simulated"]]);
    const simulated = models[1]!.block;
    expect(simulated.nodes.find((n) => n.id === "initial")!.label).toBe("Virtual funds");
    expect(simulated.nodes.every((n) => n.tone === undefined || n.tone === "sim")).toBe(true);
  });

  it("no statements read, no block", () => {
    expect(flowBlocks("live", null, null, [])).toEqual([]);
  });
});

describe("flowRows", () => {
  const account = (id: string, margins: AccountView["margins"]): AccountView => ({
    accountId: id, venue: null, mode: null, profile: null, baseCurrency: "USDT", servesHere: 1, balances: [], margins,
    syncKind: "ok", syncLabel: "Synced", lastSyncedAt: null, openFindings: null,
  });

  it("one row per deployment of the environment with its published budget, exposure and Net PnL; margin is the ACCOUNT's in the deployment's currency", () => {
    const rows = flowRows("live", [dep("dep_1", "alpha_a", "2500.50"), dep("dep_2", "alpha_a", "1.00", { environment: "paper" })], [account("acc_dep_1", [{ currency: "USDT", initial: "300.00", maintenance: "200.00" }, { currency: "EUR", initial: "1.00", maintenance: "1.00" }])]);
    expect(rows).toEqual([{ deploymentId: "dep_1", alpha: "Label alpha_a", account: "acc_dep_1", currency: "USDT", budget: "2500.50", exposure: "1778.84", margin: "300.00", pnl: "-5.69", time: { text: "Not published", short: null } }]);
  });

  it("a margin nobody publishes is null (typed in the cell), never a zero", () => {
    const [row] = flowRows("live", [dep("dep_1", "alpha_a", "1.00")], [account("acc_dep_1", [])]);
    expect(row!.margin).toBeNull();
    expect(flowRows("live", [dep("dep_1", "alpha_a", "1.00")], [])[0]!.margin).toBeNull();
  });
});

/* UXM-07 WP-2: the time each flow took effect. Published times are printed, never inferred; an unpublished one says so. */
const T_FUNDS = Date.UTC(2026, 6, 12, 12, 0);
const T_RETURN = Date.UTC(2026, 6, 15, 12, 0);
const T_BUDGET = Date.UTC(2026, 6, 27, 12, 0);
const T_ALPHA = Date.UTC(2026, 8, 11, 12, 0);
const T_DEP = Date.UTC(2026, 8, 12, 9, 30);
const timed = (metric: Body, at: number) => ({ ...metric, effective_at_ms: at });

describe("flowBlocks: effective times", () => {
  const STATEMENT = {
    ...FULL,
    initial_funds: timed(money("60000.00"), T_FUNDS), returned_capital: timed(money("17499.25"), T_RETURN), current_budget: timed(money("60000.00"), T_BUDGET),
  };
  const alphas = () => datasetFor("PORTFOLIO", "pf_x", (body: Body) => {
    body.groups = [{ key: [{ field: "alpha_id", value: "alpha_a" }], unique_row_count: 1, totals_scope: "FULL_AUTHORIZED_FILTERED_QUERY",
      economic_partitions: [{ partition: LIVE(), metrics: { allocation: timed(money("2500.50"), T_ALPHA) } }] }];
  });

  it("funds, return, budget and an alpha print the time their own figure publishes (UTC, house style) and a short date for the diagram", () => {
    const [model] = flowBlocks("live", statementsOf(STATEMENT), alphas(), [dep("dep_1", "alpha_a", "2500.50")], new Map([["acc_dep_1", T_DEP]]));
    const time = (id: string) => model!.block.nodes.find((n) => n.id === id)!.time;
    expect(time("initial")).toEqual({ text: "12 Jul 12:00Z", short: "12 Jul" });
    expect(time("returned")).toEqual({ text: "15 Jul 12:00Z", short: "15 Jul" });
    expect(time("budget")).toEqual({ text: "27 Jul 12:00Z", short: "27 Jul" });
    expect(time("alpha:alpha_a")).toEqual({ text: "11 Sep 12:00Z", short: "11 Sep" });
    expect(time("dep:dep_1")).toEqual({ text: "12 Sep 09:30Z", short: "12 Sep" });
    // the edge that carries a flow carries its time into the table; the limit edge is the budget's approval
    const edge = (id: string) => model!.block.edges.find((e) => e.id === id)!.time;
    expect(edge("e-initial")).toEqual(time("initial"));
    expect(edge("e-limit")).toEqual(time("budget"));
    expect(edge("e-alpha:alpha_a")).toEqual(time("alpha:alpha_a"));
    expect(edge("e-dep:dep_1")).toEqual(time("dep:dep_1"));
  });

  it("NAV and headroom state no time (derived or valuation figures); a published zero flow with no time is 'No receipt', an unpublished time is 'Not published'", () => {
    const [model] = flowBlocks("live", statementsOf(STATEMENT), alphas(), [dep("dep_1", "alpha_a", "2500.50")]);
    const byId = new Map(model!.block.nodes.map((n) => [n.id, n]));
    expect("time" in byId.get("nav")!).toBe(false);
    expect("time" in byId.get("headroom")!).toBe(false);
    expect(byId.get("added")!.time).toEqual({ text: "No receipt", short: null });
    // no ledger leg for the account: the deployment's time is not published, and nothing is invented from its alpha
    expect(byId.get("dep:dep_1")!.time).toEqual({ text: "Not published", short: null });
    const [bare] = flowBlocks("live", statementsOf(FULL), alphasOf([["alpha_a", "2500.50"]]), []);
    expect(bare!.block.nodes.find((n) => n.id === "budget")!.time).toEqual({ text: "Not published", short: null });
    expect(bare!.block.nodes.find((n) => n.id === "alpha:alpha_a")!.time).toEqual({ text: "Not published", short: null });
  });

  it("a time that is not a readable instant is 'Not published', not a date", () => {
    expect(flowTimeOf(null)).toEqual({ text: "Not published", short: null });
    expect(flowTimeOf(undefined)).toEqual({ text: "Not published", short: null });
    expect(flowTimeOf(Number.NaN)).toEqual({ text: "Not published", short: null });
  });
});

describe("allocationTimesByAccount: the ledger's last allocation leg of an account that serves one deployment", () => {
  const entry = (accountId: string, movementType: string, direction: string, occurredAt: string | null) => ({
    ledgerId: `${accountId}-${movementType}-${occurredAt}`, allocationId: null, accountId, movementType, direction, amount: "1", beforeAllocated: "0", afterAllocated: "1", occurredAt,
  });
  const ledgerOf = (entries: Body[], over: Partial<CapitalLedger["bounded"]> = {}): CapitalLedger => ({
    portfolioId: "pf_x", window: null, bounded: { total: entries.length, returned: entries.length, hasMore: false, ...over },
    buckets: [{ currency: "USDT", entryCount: entries.length, grossIncrease: "1", grossDecrease: "0", entries }],
  }) as Body;
  const deployments = [dep("dep_1", "alpha_a", "1.00"), dep("dep_2", "alpha_a", "1.00")];

  it("takes the latest INCREASE leg of each account (initial allocation or allocation); a withdrawal or an unchanged leg is not an allocation", () => {
    const times = allocationTimesByAccount(ledgerOf([
      entry("acc_dep_1", "INITIAL_ALLOCATE", "INCREASE", "2026-08-01T00:00:00Z"),
      entry("acc_dep_1", "ALLOCATE", "INCREASE", "2026-09-12T09:30:00Z"),
      entry("acc_dep_1", "WITHDRAW", "DECREASE", "2026-10-16T00:00:00Z"),
      entry("acc_dep_2", "REBALANCE", "UNCHANGED", "2026-10-14T00:00:00Z"),
    ]), deployments);
    expect(times.get("acc_dep_1")).toBe(Date.UTC(2026, 8, 12, 9, 30));
    expect(times.has("acc_dep_2")).toBe(false);
  });

  it("states nothing from a bounded or partly read ledger, from an undated leg, or for an account shared by two deployments", () => {
    const leg = entry("acc_dep_1", "ALLOCATE", "INCREASE", "2026-09-12T09:30:00Z");
    expect(allocationTimesByAccount(ledgerOf([leg], { hasMore: true }), deployments).size).toBe(0);
    expect(allocationTimesByAccount(ledgerOf([leg], { total: 5, returned: 5 }), deployments).size).toBe(0);
    expect(allocationTimesByAccount(ledgerOf([entry("acc_dep_1", "ALLOCATE", "INCREASE", null)]), deployments).size).toBe(0);
    const shared = [dep("dep_1", "alpha_a", "1.00", { accountId: "acc_shared" }), dep("dep_2", "alpha_a", "1.00", { accountId: "acc_shared" })];
    expect(allocationTimesByAccount(ledgerOf([entry("acc_shared", "ALLOCATE", "INCREASE", "2026-09-12T09:30:00Z")]), shared).size).toBe(0);
    expect(allocationTimesByAccount(null, deployments).size).toBe(0);
  });

  it("flowRows prints the deployment's allocation time from it", () => {
    const [row] = flowRows("live", [dep("dep_1", "alpha_a", "1.00")], [], new Map([["acc_dep_1", Date.UTC(2026, 8, 12, 9, 30)]]));
    expect(row!.time).toEqual({ text: "12 Sep 09:30Z", short: "12 Sep" });
  });
});
