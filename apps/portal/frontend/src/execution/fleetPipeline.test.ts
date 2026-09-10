import { describe, expect, it } from "vitest";

import type { AlphaFleetItem, ManagerListEnvelope } from "./api/profileRead";
import { PIPELINE_ROW_CAP, fleetPipeline, stageKeyOf } from "./fleetPipeline";

const dep = (deploymentId: string, stage: string, venue = "BINANCE", state = "ACTIVE"): AlphaFleetItem["deployments"][number] => ({
  deploymentId, stage, venue, accountId: `acct-${deploymentId}`, portfolioId: null, portfolioName: null, currency: "USDT",
  allocation: null, balanceTotal: null, balanceFree: null, balanceLocked: null, positionFactCount: 0,
  realizedPnl: "0", unrealizedPnl: "0", netPnl: "0", exposure: "0", state, active: state === "ACTIVE", health: "OK", updatedAt: "2026-09-05T00:00:00Z",
});
const alpha = (alphaId: string, deployments: AlphaFleetItem["deployments"], alphaLabel = "Unnamed alpha"): AlphaFleetItem => ({
  alphaId, alphaLabel, version: "v1", stage: deployments[0]?.stage ?? "RESEARCH", stages: deployments.map((d) => d.stage), owner: null,
  portfolios: [], deployments, allocations: [], balances: [], positionPnl: [], exposure: [], health: "OK", attentionReasons: [], metricsAvailability: {}, updatedAt: "2026-09-05T00:00:00Z",
});
const envelope = (rows: AlphaFleetItem[], filteredCount = rows.length): ManagerListEnvelope<AlphaFleetItem> => ({
  environment: "all", freshness: "FRESH", completeness: "COMPLETE", sourceAsOf: null, projectionRefreshedAt: null, freshnessBudgetMs: null, readAt: "2026-09-05T00:00:00Z",
  page: { rows, totalCount: filteredCount, filteredCount, nextCursor: null, prevCursor: null, hasMore: false, hasPrevious: false },
});

describe("fleetPipeline — the register's current deployments, never a promotion history", () => {
  it("counts alphas per stage, notes deployments and halts, and computes no conversion", () => {
    const p = fleetPipeline(envelope([
      alpha("a", [dep("a-p", "PAPER"), dep("a-s", "SANDBOX_VALIDATION", "OKX", "HALTED")]),
      alpha("b", [dep("b-p", "PAPER_OBSERVATION")]),
      alpha("c", [dep("c-l", "LIVE_FULL")]),
    ]));
    expect(p.stages.map((s) => [s.key, s.entered, s.conversion])).toEqual([["PAPER", 2, null], ["SANDBOX", 1, null], ["CANARY", 0, null], ["LIVE", 1, null]]);
    expect(p.stages[1]!.note).toBe("in stage now · 1 deployment · 1 halted");
    expect(p.stages[2]!.note).toBe("none in stage now");
    expect(p.window).toBe("current source facts · 3 alphas");
    expect(p.authority).toBe("EXECUTION");
  });
  it("orders rows by stage reach, links cells to the deployment route, and never marks a stage as passed", () => {
    const p = fleetPipeline(envelope([alpha("paper-only", [dep("d1", "PAPER")]), alpha("live-one", [dep("d2", "LIVE", "BINANCE")])]));
    expect(p.rows.map((r) => r.alpha)).toEqual(["live-one", "paper-only"]);
    expect(p.rows[0]!.cells.LIVE).toEqual({ kind: "current", label: "ACTIVE", venue: "BINANCE", href: "/deployments/live/d2", paused: false });
    expect(p.rows[0]!.cells.PAPER).toEqual({ kind: "none" });
    expect(p.rows[1]!.href).toBe("/deployments/alphas/paper-only");
    expect(Object.values(p.rows.flatMap((r) => Object.values(r.cells))).every((c) => c.kind !== "done")).toBe(true);
  });
  it("caps the matrix and says so in the note, with the total it was cut from", () => {
    const many = Array.from({ length: PIPELINE_ROW_CAP + 5 }, (_, i) => alpha(`alpha-${String(i).padStart(2, "0")}`, [dep(`d${i}`, "PAPER")]));
    const p = fleetPipeline(envelope(many, 40));
    expect(p.rows).toHaveLength(PIPELINE_ROW_CAP);
    expect(p.note).toMatch(/^top 12 of 40 by stage reach · /);
    expect(p.window).toBe("current source facts · 40 alphas");
  });
  it("maps stage spellings and ignores unknown ones", () => {
    expect(stageKeyOf("LIVE_CANARY")).toBe("CANARY");
    expect(stageKeyOf("paper_observation")).toBe("PAPER");
    expect(stageKeyOf("RESEARCH")).toBeNull();
    expect(fleetPipeline(envelope([alpha("r", [dep("x", "RESEARCH")])])).stages.every((s) => s.entered === 0)).toBe(true);
  });
});
