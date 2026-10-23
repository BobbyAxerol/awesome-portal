/**
 * Reader to model: the published fixture goes through the real reader
 * (`readAlphaFleet`) and then through the Fleet model, so a drift in either is
 * caught here and not on screen.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { readAlphaFleet, type AlphaFleetItem } from "../../../api/profileRead";
import {
  BOARD_READINESS, COUNT_NOT_AVAILABLE, FE, FLEET_LENSES, PAGE_LIMIT, SORT_OPTIONS, boardColumns, alphaHref, fleetKpis, fleetQuery, healthView, humanize, inStages,
  lensCounts, lensForStages, notPublished, queryKey, serverStageParam, sortValueOf, stageLabel, stagesForLens, toFleetRow,
} from "./fleetModel";

const FIXTURE = resolve(__dirname, "../../../../../../../../packages/contracts/fixtures/execution-alpha-fleet-list.v2.valid.json");
const raw = JSON.parse(readFileSync(FIXTURE, "utf8")) as Record<string, unknown>;
const envelope = readAlphaFleet(raw)!;
const item = envelope.page.rows[0]!;

/** A row derived from the fixture row: only the identity fields a case needs change. */
function variant(patch: Partial<AlphaFleetItem>): AlphaFleetItem {
  return { ...item, ...patch };
}

describe("fixture to model", () => {
  it("reads the published fixture", () => {
    expect(envelope.page.rows).toHaveLength(1);
    expect(envelope.summary?.alphaCount).toBe(1);
  });

  it("maps the identity of the fixture row", () => {
    const row = toFleetRow(item);
    expect(row.alphaId).toBe(item.alphaId);
    expect(row.label).toBe(item.alphaLabel);
    expect(row.version).toBe(item.version);
    expect(row.owner).toBe(item.owner);
    expect(row.portfolios).toEqual(item.portfolios.map((p) => p.name));
    expect(row.stageCode).toBe("PAPER");
    expect(row.stage).toBe("Paper");
    expect(row.otherStages).toEqual([]);
    expect(row.health).toEqual({ kind: "ok", label: "Ready" });
    expect(row.attention).toEqual([]);
    expect(row.deployments.count).toBe(item.deployments.length);
    expect(row.deployments.items[0]).toMatchObject({ id: item.deployments[0]!.deploymentId, venue: item.deployments[0]!.venue, health: { kind: "ok" } });
    expect(row.updatedAt).toBe(item.updatedAt);
  });

  it("carries no money: nothing of allocations, balances, PnL or exposure reaches the row", () => {
    const text = JSON.stringify(toFleetRow(item));
    for (const money of [item.deployments[0]!.allocation!, item.deployments[0]!.netPnl, item.deployments[0]!.balanceTotal!, "USDT"]) {
      expect(text).not.toContain(money);
    }
  });

  it("links to the V1 Alpha 360 route and escapes the id", () => {
    expect(alphaHref(item.alphaId)).toBe(`/deployments/alphas/${item.alphaId}`);
    expect(alphaHref("a/b c")).toBe("/deployments/alphas/a%2Fb%20c");
  });

  it("derives the KPI strip from the summary counts only", () => {
    const kpis = fleetKpis(envelope.summary!);
    expect(kpis.map((k) => [k.id, k.value])).toEqual([
      ["alphas", 1], ["deployments", 1], ["portfolios", 1], ["attention", 0], ["exit-review", null], ["archive", null], ["research", 0],
    ]);
    expect(JSON.stringify(kpis)).not.toMatch(/USDT|pnl|alloc/i);
  });

  it("a missing summary is absent values, never zeros", () => {
    expect(fleetKpis(null).every((k) => k.value === null)).toBe(true);
    expect(Object.values(lensCounts(null)).every((c) => c.text === null)).toBe(true);
  });
});

describe("rows with attention, several deployments and no owner", () => {
  const busy = variant({
    alphaId: "alpha_x", owner: null, stage: "LIVE", stages: ["LIVE", "PAPER"], health: "ATTENTION",
    attentionReasons: ["DEPLOYMENT_ATTENTION", "RECONCILIATION_OPEN", "STRATEGY_INACTIVE"],
    deployments: [
      { ...item.deployments[0]!, deploymentId: "d1", stage: "LIVE", health: "READY" },
      { ...item.deployments[0]!, deploymentId: "d2", stage: "LIVE", health: "ATTENTION", state: "HALTED" },
      { ...item.deployments[0]!, deploymentId: "d3", stage: "PAPER", health: "FINDING" },
    ],
  });
  const row = toFleetRow(busy);

  it("keeps the absent owner absent and the highest stage first", () => {
    expect(row.owner).toBeNull();
    expect(row.stage).toBe("Live");
    expect(row.otherStages).toEqual(["Paper"]);
  });

  it("names the worst deployment health and humanizes reasons, keeping the code", () => {
    expect(row.deployments.count).toBe(3);
    expect(row.deployments.worst).toEqual({ kind: "attention", label: "Needs attention" });
    expect(row.attention.map((r) => r.label)).toEqual(["Deployment attention", "Reconciliation open", "Strategy inactive"]);
    expect(row.attention[0]!.code).toBe("DEPLOYMENT_ATTENTION");
  });

  it("a research-only alpha has no deployments and no worst health", () => {
    const research = toFleetRow(variant({ stage: "RESEARCH", stages: ["RESEARCH"], deployments: [], health: "RESEARCH_ONLY" }));
    expect(research.deployments).toEqual({ count: 0, worst: null, items: [] });
    expect(research.health).toEqual({ kind: "neutral", label: "Research only" });
    expect(research.stage).toBe("Research");
  });
});

describe("words", () => {
  it("an unknown health word is unknown, never ok", () => {
    expect(healthView("QUARANTINED")).toEqual({ kind: "unknown", label: "Quarantined" });
    expect(healthView("FINDING").kind).toBe("attention");
  });
  it("stage and reason words", () => {
    expect(stageLabel("canary")).toBe("Canary");
    expect(stageLabel("LIVE_CANARY")).toBe("Live canary");
    expect(humanize("SOURCE_LATEST_WINDOW")).toBe("Source latest window");
  });
  it("Not published always names the FE id", () => {
    expect(notPublished(FE.compare)).toBe("Not published (FE-033)");
    expect(notPublished(FE.archived)).toBe("Not published (FE-034)");
    expect(notPublished(FE.window)).toBe("Not published (FE-025)");
    expect(notPublished(FE.map)).toBe("Not published (FE-035)");
    expect(notPublished(FE.group)).toBe("Not published (FE-012)");
    expect(notPublished(FE.readiness)).toBe("Not published (FE-027, FE-028)");
  });
});

describe("lenses and stages", () => {
  it("a lens is a named set of stage words and back", () => {
    expect(stagesForLens("real")).toEqual(["canary", "live"]);
    expect(lensForStages([])).toBe("all");
    expect(lensForStages(["live", "canary"])).toBe("real");
    expect(lensForStages(["canary", "live"])).toBe("real");
    expect(lensForStages(["paper"])).toBe("paper");
    expect(lensForStages(["sandbox"])).toBe("sandbox");
    expect(lensForStages(["live"])).toBeNull();
    expect(lensForStages(["paper", "live"])).toBeNull();
    expect(FLEET_LENSES.map((l) => l.label)).toEqual(["All", "Real-funded", "Sandbox", "Paper", "Archived"]);
  });

  it("the server gets one stage; a lens of two is narrowed on loaded rows", () => {
    expect(serverStageParam([])).toBeUndefined();
    expect(serverStageParam(["paper"])).toBe("PAPER");
    expect(serverStageParam(["canary", "live"])).toBeUndefined();
    const both = toFleetRow(variant({ stage: "LIVE", stages: ["LIVE", "PAPER"] }));
    expect(inStages(both, ["canary", "live"])).toBe(true);
    expect(inStages(both, ["paper"])).toBe(true);
    expect(inStages(both, ["sandbox"])).toBe(false);
    expect(inStages(both, [])).toBe(true);
  });

  it("tab counts come from the summary; the Real-funded sum is an upper bound", () => {
    const summary = { ...envelope.summary!, alphaCount: 9, stageCounts: { PAPER: 4, SANDBOX: 2, CANARY: 2, LIVE: 3 } };
    const counts = lensCounts(summary);
    expect(counts.all).toEqual({ text: "9", approximate: false });
    expect(counts.paper.text).toBe("4");
    expect(counts.sandbox.text).toBe("2");
    expect(counts.real).toEqual({ text: "5", approximate: true });
    expect(counts.archived.text).toBeNull();
  });

  it("a stage the summary does not list is Not available, never a zero (D4)", () => {
    const summary = { ...envelope.summary!, alphaCount: 9, stageCounts: { LIVE: 3 } };
    const counts = lensCounts(summary);
    expect(counts.paper).toEqual({ text: "Not available", approximate: false });
    expect(counts.sandbox.text).toBe("Not available");
    // Real-funded needs Canary and Live both; with Canary missing the sum would be a guess.
    expect(counts.real.text).toBe("Not available");
    expect(counts.all.text).toBe("9");
    // A stage the summary does list as 0 is a published zero and prints 0.
    expect(lensCounts({ ...summary, stageCounts: { PAPER: 0, SANDBOX: 0, CANARY: 0, LIVE: 0 } }).paper.text).toBe("0");
  });
});

describe("query", () => {
  const none = { q: null, stages: [], owner: null, health: null, sort: null } as const;

  it("defaults send only the page size", () => {
    expect(fleetQuery(none)).toEqual({ limit: PAGE_LIMIT });
  });

  it("maps every control to the read's own parameter", () => {
    expect(fleetQuery({ q: "carry", stages: ["paper"], owner: "Bobby-001", health: "READY", sort: "alpha_label:asc" }, "alpha_a")).toEqual({
      limit: PAGE_LIMIT, search: "carry", stage: "PAPER", owner: "Bobby-001", health: "READY", sort: "alpha_label:asc", after: "alpha_a",
    });
  });

  it("drops a sort the read does not publish", () => {
    expect(sortValueOf("net_pnl:desc")).toBeNull();
    expect(fleetQuery({ ...none, sort: "net_pnl:desc" }).sort).toBeUndefined();
    expect(SORT_OPTIONS.filter((o) => o.value !== null).every((o) => sortValueOf(o.value) === o.value)).toBe(true);
  });

  it("the query key ignores the cursor and changes with any filter", () => {
    expect(queryKey(none)).toBe(queryKey({ ...none }));
    expect(queryKey({ ...none, q: "a" })).not.toBe(queryKey(none));
    expect(queryKey({ ...none, stages: ["paper"] })).not.toBe(queryKey(none));
  });
});

describe("boardColumns", () => {
  const rowOf = (id: string, stages: string[], over: Partial<AlphaFleetItem> = {}) =>
    toFleetRow(variant({ alphaId: id, alphaLabel: id, stage: stages[0]!, stages, ...over }));
  const summaryOf = (stageCounts: Record<string, number>) => ({ ...envelope.summary!, stageCounts });

  it("has the four stage lanes in HiFi order and no R1 or R2 lane; Research or another word only when a loaded row needs it", () => {
    const cols = boardColumns([], summaryOf({ PAPER: 2 }));
    expect(cols.map((c) => c.label)).toEqual(["Paper", "Sandbox", "Canary", "Live"]);
    expect(cols.map((c) => c.code)).not.toContain("R1");
    expect(cols.every((c) => c.rows.length === 0)).toBe(true);
  });

  it("the lens chooses the lanes: Real-funded is Canary and Live, one stage is one lane, a selection keeps spine order", () => {
    expect(boardColumns([], null, ["canary", "live"]).map((c) => c.label)).toEqual(["Canary", "Live"]);
    expect(boardColumns([], null, ["paper"]).map((c) => c.label)).toEqual(["Paper"]);
    expect(boardColumns([], null, ["live", "paper"]).map((c) => c.label)).toEqual(["Paper", "Live"]);
    expect(boardColumns([], null, []).map((c) => c.label)).toEqual(["Paper", "Sandbox", "Canary", "Live"]);
  });

  it("a row is in EVERY stage it is in (membership, not a crowned highest stage); the cards are not the alphas", () => {
    const rows = [rowOf("a", ["LIVE", "CANARY"]), rowOf("b", ["PAPER"]), rowOf("c", ["SANDBOX", "PAPER"])];
    const cols = Object.fromEntries(boardColumns(rows, null).map((c) => [c.code, c.rows.map((r) => r.alphaId)]));
    expect(cols).toEqual({ LIVE: ["a"], CANARY: ["a"], PAPER: ["b", "c"], SANDBOX: ["c"] });
    // 3 alphas, 5 cards: the lane counts are memberships and must not be summed into an alpha count.
    expect(Object.values(cols).flat()).toHaveLength(5);
    expect(new Set(Object.values(cols).flat()).size).toBe(3);
  });

  it("prints the summary's count for a stage, and Not available (never 0) when it states none or there is no summary", () => {
    const withSummary = boardColumns([], summaryOf({ PAPER: 2, CANARY: 0 }));
    expect(withSummary.map((c) => c.published)).toEqual(["2", "Not available", "0", "Not available"]);
    expect(boardColumns([], null).every((c) => c.published === COUNT_NOT_AVAILABLE)).toBe(true);
  });

  it("keeps Research before the stage lanes and an unknown stage word after them, only on the All lens and only when a loaded row is there", () => {
    const rows = [rowOf("r", ["RESEARCH"]), rowOf("x", ["ARCHIVED_PREVIEW"]), rowOf("p", ["PAPER"])];
    const cols = boardColumns(rows, summaryOf({ RESEARCH: 1 }));
    expect(cols.map((c) => c.code)).toEqual(["RESEARCH", "PAPER", "SANDBOX", "CANARY", "LIVE", "ARCHIVED_PREVIEW"]);
    expect(cols[0]).toMatchObject({ label: "Research", published: "1" });
    expect(cols.at(-1)).toMatchObject({ label: "Archived preview", published: COUNT_NOT_AVAILABLE });
    expect(cols.reduce((n, c) => n + c.rows.length, 0)).toBe(3);
    // A lens that names stages has no such lane.
    expect(boardColumns(rows, null, ["paper"]).map((c) => c.code)).toEqual(["PAPER"]);
  });

  it("states the readiness gap as FE-027", () => {
    expect(notPublished(BOARD_READINESS)).toBe("Not published (FE-027)");
  });
});
