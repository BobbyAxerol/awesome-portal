// @vitest-environment node
/**
 * The lifecycle, event and regime-fit readers of Alpha 360 over a dataset read through the real HTTP client (preview lane, FIXTURE_LAB):
 * nothing is computed from a position or a chart, a missing key is a missing fact, and a stage is `done` only when its exit was published.
 */
import { afterEach, describe, expect, it } from "vitest";

import type { ManagerDataset } from "../../readers/managerDataset";
import { dayMonth, lifeEvents, lifeFeedRows, lifecycleFacts, regimeFit, stageSpans } from "./lifecycleModel";
import { endPreviewLane, startPreviewLane } from "./previewLane.testbase";

afterEach(endPreviewLane);

async function datasetOf(alpha: string, environment: "live" | "paper" | "sandbox" = "live"): Promise<ManagerDataset> {
  const lane = startPreviewLane();
  const result = await lane.api.getManagerDataset({ surface: "ALPHA", id: alpha, environment, limit: 50 });
  if (!result.ok) throw new Error(`dataset: ${result.reason}`);
  return result.value;
}

describe("lifecycleFacts", () => {
  it("marks R1 to Canary done with their published exit date, actor, days and criteria, and Live current with its days and decider", async () => {
    const facts = lifecycleFacts(await datasetOf("alpha_a"), "live")!;
    expect(facts).not.toBeNull();
    for (const gate of ["r1", "r2"] as const) {
      expect(facts.stages[gate]).toMatchObject({ outcome: "done", daysInStage: null, criteria: null });
      expect(facts.stages[gate]!.line).toMatch(/^\d\d \w{3}$/);
      expect(facts.stages[gate]!.decidedBy).toMatch(/^\w+$/);
    }
    for (const stage of ["paper", "sandbox", "canary"] as const) {
      const entry = facts.stages[stage]!;
      expect(entry.outcome).toBe("done");
      expect(entry.daysInStage).toBeGreaterThan(0);
      expect(entry.criteria).toEqual({ met: 7, total: 7 });
      expect(entry.line).toMatch(/^Exit \d\d \w{3} · \w+$/);
    }
    expect(facts.stages.live).toMatchObject({ daysInStage: expect.any(Number), decider: "Manager" });
    expect(facts.stages.live!.outcome).toBeUndefined();
    expect(facts.blockedReason).toBe("Criterion 6 of 7 is not met");
  });

  it("for a sandbox preview the stages after the current one carry no fact, and a null current stage reads nothing", async () => {
    const dataset = await datasetOf("alpha_a");
    const sandbox = lifecycleFacts(dataset, "sandbox")!;
    expect(Object.keys(sandbox.stages).sort()).toEqual(["paper", "r1", "r2", "sandbox"]);
    expect(lifecycleFacts(dataset, null)).toBeNull();
  });

  it("a dataset without the keys (or no dataset) is `null`: the spine keeps its Not published note", async () => {
    expect(lifecycleFacts(null, "live")).toBeNull();
    const lane = startPreviewLane();
    const fleet = await lane.api.getManagerDataset({ surface: "FLEET", environment: "live", limit: 5 });
    expect(fleet.ok).toBe(true);
    if (fleet.ok) expect(lifecycleFacts(fleet.value, "live")).toBeNull();
  });
});

describe("lifeEvents", () => {
  it("reads every kind as an event with its time, title and actor, oldest first, and names no gap when all five exist", async () => {
    const { events, missing } = lifeEvents(await datasetOf("alpha_btc_trend"));
    expect(missing).toEqual([]);
    const counts = events.reduce<Record<string, number>>((all, e) => ({ ...all, [e.kind]: (all[e.kind] ?? 0) + 1 }), {});
    expect(counts).toEqual({ stage: 4, decision: 6, incident: 3, recall: 1, flow: 2 });
    expect(events.every((e, i) => i === 0 || e.t >= events[i - 1]!.t)).toBe(true);
    expect(events.every((e) => e.title.length > 0 && e.actor.length > 0)).toBe(true);
  });

  it("with no dataset every kind is a gap; the feed rows carry the actor and no receipt", async () => {
    expect(lifeEvents(null)).toEqual({ events: [], missing: ["stage", "decision", "incident", "recall", "flow"] });
    const rows = lifeFeedRows(lifeEvents(await datasetOf("alpha_a")).events, "Carry A");
    expect(rows.length).toBe(16);
    expect(rows.every((row) => row.actor !== undefined && row.receipt === undefined && row.target === "Carry A")).toBe(true);
    expect(new Set(rows.map((row) => row.kindLabel))).toEqual(new Set(["Stage", "Decision", "Incident", "Recall", "Capital flow"]));
  });
});

describe("regimeFit and dayMonth", () => {
  it("is a published ratio or the typed absence with its code, never a number made up here", async () => {
    const seen = new Set<string>();
    for (const alpha of ["alpha_a", "alpha_b", "alpha_c", "alpha_btc_trend"]) {
      const read = regimeFit(await datasetOf(alpha));
      if (read === null) throw new Error(`no regime_fit key for ${alpha}`);
      seen.add(read.kind);
      if (read.kind === "value") expect(read.exact).toMatch(/^0\.\d{4}$/);
      else expect(read.code).toBe("INSUFFICIENT_DATA");
    }
    expect(regimeFit(null)).toBeNull();
    expect(seen.size).toBeGreaterThan(0);
  });

  it("prints a UTC day and month", () => {
    expect(dayMonth(Date.UTC(2026, 8, 17, 23, 59))).toBe("17 Sep");
    expect(dayMonth(Date.UTC(2026, 6, 2, 0, 0))).toBe("02 Jul");
  });
});

describe("stageSpans", () => {
  it("a completed stage ends at its published exit and began its published days earlier; Live begins at the Canary exit and is current", async () => {
    const dataset = await datasetOf("alpha_a");
    const spans = stageSpans(dataset);
    expect(spans.map((s) => s.stage)).toEqual(["paper", "sandbox", "canary", "live"]);
    const facts = lifecycleFacts(dataset, "live")!;
    expect(facts).not.toBeNull();
    // Adjacent stages meet: the exit of one is the start of the next, and Live runs on.
    expect(spans[0]!.to).toBe(spans[1]!.from);
    expect(spans[1]!.to).toBe(spans[2]!.from);
    expect(spans[2]!.to).toBe(spans[3]!.from);
    expect(spans[3]!.to).toBeNull();
    expect(stageSpans(null)).toEqual([]);
  });
});
