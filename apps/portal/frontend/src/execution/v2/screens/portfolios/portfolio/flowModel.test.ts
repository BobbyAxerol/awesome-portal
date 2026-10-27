/**
 * The capital flow model of one environment (WP-F1, `flowModel.ts`): which published figure is which node, that a budget is a dashed
 * LIMIT edge and never a band, that blocks are per economic partition and never merged, that an unpublished figure is an absent node
 * (not an invented one) and that nothing in the model is added or derived.
 */
import { describe, expect, it } from "vitest";

import { absentMetric, moneyMetric, partition } from "../../../readers/managerDataset.testbase";
import { datasetFor } from "../datasetFixtures.testbase";
import type { AccountView, DeploymentView } from "./model";
import { deploymentsOf, flowBlocks, flowRows } from "./flowModel";

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
    expect(model!.facts).toEqual([
      { label: "Net external flows", value: "19750.00" },
      { label: "Recalling", value: "360.00" },
      { label: "Headroom", value: "3420.00" },
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
    expect(rows).toEqual([{ deploymentId: "dep_1", alpha: "Label alpha_a", account: "acc_dep_1", currency: "USDT", budget: "2500.50", exposure: "1778.84", margin: "300.00", pnl: "-5.69" }]);
  });

  it("a margin nobody publishes is null (typed in the cell), never a zero", () => {
    const [row] = flowRows("live", [dep("dep_1", "alpha_a", "1.00")], [account("acc_dep_1", [])]);
    expect(row!.margin).toBeNull();
    expect(flowRows("live", [dep("dep_1", "alpha_a", "1.00")], [])[0]!.margin).toBeNull();
  });
});
