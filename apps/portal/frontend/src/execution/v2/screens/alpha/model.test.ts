/**
 * Alpha 360 models: the facts the screen is allowed to state, and the ones it
 * must leave out. L1 matrices over the published chart state and the book, L3
 * negatives over the words and numbers a source could send wrongly.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { ALPHA_DOUBLE_ID } from "../../../../../e2e/bffDoubleAlpha";
import { readAlphaFleetItem } from "../../../api/profileRead";
import { readReplayOrders } from "../../../components/tradeReplayModel";
import { readUtcEpochMs } from "../../../screenDataContract";
import { cartesian, dimension } from "../../testkit/matrix";
import { enumCases } from "../../testkit/negative";
import {
  ALPHA_TABS, ALPHA_MORE_TABS, chooseEnv, currentStageOf, deployedEnvs, deploymentRows, envOfStage, equityInputs, feedKind, focusTarget,
  isAlphaTab, loadedOrderCounts, numberToDecimal, orderFlag, positionRows, reconciliationRows, replayHref, ribbonEvents, spineStageOf, stageBands,
  stagePath, stagePaths,
} from "./model";
import { alphaHttpApi, serveAlphaDouble } from "./testApi";

afterEach(() => vi.unstubAllGlobals());

async function loaded() {
  serveAlphaDouble();
  const api = alphaHttpApi();
  const resource = await api.getAlpha360Resource(ALPHA_DOUBLE_ID);
  const drift = await api.getStageDrift(ALPHA_DOUBLE_ID);
  const chart = await api.getFinancialChart({ environment: "live", subjectKind: "alpha", subjectId: ALPHA_DOUBLE_ID, metric: "equity" });
  const timeline = await api.getObservedTimeline({ environment: "live", subjectKind: "alpha", subjectId: ALPHA_DOUBLE_ID });
  if (!resource.ok || !drift.ok || !chart.ok || !timeline.ok) throw new Error("the double did not answer");
  const item = readAlphaFleetItem(resource.value.objects.alpha);
  if (item === null) throw new Error("the alpha row did not read");
  return { resource: resource.value, drift: drift.value, chart: chart.value, timeline: timeline.value, item };
}

describe("tabs", () => {
  it("every tab key is one the alias table knows, and More holds Trade Replay and the two that fold away", () => {
    const keys = [...ALPHA_TABS, ...ALPHA_MORE_TABS].map((t) => t.key);
    expect(keys).toEqual(["performance", "deployments", "evidence", "regime", "orders", "activity", "replay", "positions", "reconciliation"]);
    expect(keys.every(isAlphaTab)).toBe(true);
    expect(isAlphaTab("overview")).toBe(false);
  });
});

describe("stages", () => {
  it.each([
    ["PAPER", "paper"], ["PAPER_OBSERVATION", "paper"], ["SANDBOX", "sandbox"], ["SANDBOX_VALIDATION", "sandbox"],
    ["CANARY", "canary"], ["LIVE_CANARY", "canary"], ["LIVE", "live"], ["LIVE_FULL", "live"], ["live", "live"],
  ] as const)("%s is %s", (word, stage) => expect(spineStageOf(word)).toBe(stage));

  it.each([null, undefined, "", "RESEARCH", "ARCHIVED", "R1", "unknown"])("a stage word the spine has no node for (%s) is not guessed", (word) => {
    expect(spineStageOf(word)).toBeNull();
  });

  it("Paper and Sandbox are their own books; Canary and Live share the Real-funded book", () => {
    expect(["paper", "sandbox", "canary", "live", "r1", "r2", null].map((s) => envOfStage(s as never))).toEqual(["paper", "sandbox", "live", "live", null, null, null]);
  });

  it("the current stage is the one the alpha row names, never the highest present", async () => {
    const { item } = await loaded();
    expect(item.stages).toEqual(["PAPER", "SANDBOX", "CANARY", "LIVE"]);
    expect(currentStageOf({ ...item, stage: "PAPER" })).toBe("paper");
    expect(currentStageOf({ ...item, stage: "unknown" })).toBeNull();
    expect(currentStageOf(null)).toBeNull();
  });

  it("books are the deployed ones, Real-funded first; the URL book wins only where deployed", async () => {
    const { item } = await loaded();
    expect(deployedEnvs(item)).toEqual(["live", "paper", "sandbox"]);
    expect(deployedEnvs(null)).toEqual([]);
    expect(chooseEnv("paper", ["live", "paper"])).toBe("paper");
    expect(chooseEnv("sandbox", ["live", "paper"])).toBe("live");
    expect(chooseEnv("sandbox", [])).toBe("sandbox");
  });
});

describe("deployments", () => {
  it("reads in stage order, keeps the published strings, and links each stage to its own workbench", async () => {
    const { item } = await loaded();
    const rows = deploymentRows(item);
    expect(rows.map((r) => r.stageLabel)).toEqual(["Paper", "Sandbox", "Canary", "Live"]);
    expect(rows.find((r) => r.id === "dep_live_01")).toMatchObject({ allocation: "40000.00", netPnl: "1120.80", href: "/deployments/live/dep_live_01" });
    expect(rows.find((r) => r.id === "dep_paper_01")?.href).toBe("/deployments/paper/dep_paper_01");
    expect(rows.find((r) => r.id === "dep_canary_01")?.allocation).toBeNull();
    expect(rows.find((r) => r.id === "dep_canary_01")?.runtime).toEqual({ kind: "paused", label: "Ended" });
  });
});

describe("numberToDecimal", () => {
  it.each([[20061.59802, "20061.59802"], [0, "0"], [-3.5, "-3.5"], [100, "100"]])("%s is %s", (n, text) => expect(numberToDecimal(n)).toBe(text));
  it.each([null, Number.NaN, Number.POSITIVE_INFINITY, 1e21, 1e-7, 1.5e-9])("%s is refused", (n) => expect(numberToDecimal(n)).toBeNull());
});

describe("equity inputs: a matrix of published state and book", () => {
  it("never turns a gap into a zero, and marks simulated books hatched", async () => {
    const { chart, drift } = await loaded();
    const base = { payloadState: "READY", env: "live" };
    const states = cartesian(base, [
      dimension("payload", ["payloadState"], ["READY", "PARTIAL", "STALE", "EMPTY"]),
      dimension("env", ["env"], ["live", "paper", "sandbox"]),
    ]);
    expect(states).toHaveLength(12);
    for (const s of states) {
      const payload = { ...chart, state: s.value.payloadState };
      const inputs = equityInputs(payload, drift, s.value.env as "live" | "paper" | "sandbox");
      expect(inputs, s.name).toHaveLength(1);
      const [input] = inputs;
      expect(input.state.kind, s.name).toBe(s.value.payloadState === "READY" ? "ready" : s.value.payloadState === "PARTIAL" ? "partial" : "stale");
      expect(input.segments.length > 0, s.name).toBe(s.value.env !== "live");
      expect(input.points.some((p) => p.v === "0" || p.v === "0.00"), s.name).toBe(false);
      expect(input.points.filter((p) => p.v === null), s.name).toHaveLength(1);
      expect(input.currency).toBe("USDT");
    }
  });

  it("puts the declared gap between two published points, once, in order", async () => {
    const { chart } = await loaded();
    const [input] = equityInputs(chart, null, "live");
    const times = input.points.map((p) => p.t);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(new Set(times).size).toBe(times.length);
    const at = input.points.findIndex((p) => p.v === null);
    expect(input.points[at - 1].v).not.toBeNull();
    expect(input.points[at + 1].v).not.toBeNull();
    expect(input.gapCount).toBe(1);
  });

  it("keeps one panel per published series: partitions are not merged", async () => {
    const { chart } = await loaded();
    const two = { ...chart, series: [chart.series[0], { ...chart.series[0], id: "b", currency: "USDC" }] };
    expect(equityInputs(two, null, "live").map((i) => i.currency)).toEqual(["USDT", "USDC"]);
  });

  it("falls back to the book's own stage path, worded partial with why, only when the exact series is absent", async () => {
    const { drift, chart } = await loaded();
    const none = { ...chart, series: [] };
    const why = "The exact equity series could not be read (UPSTREAM_UNAVAILABLE).";
    const [live] = equityInputs(none, drift, "live", "live", why);
    expect(live.state).toEqual({ kind: "partial", reason: expect.stringContaining(why) });
    expect(live.basis).toBe("Daily close");
    expect(live.points.filter((p) => p.v !== null)).toHaveLength(5);
    const [paper] = equityInputs(null, drift, "paper");
    expect(paper.points.filter((p) => p.v !== null)).toHaveLength(9);
    expect(paper.segments).toHaveLength(1);
    const [sandbox] = equityInputs(null, drift, "sandbox");
    expect(sandbox.label).toBe("Sandbox");
    expect(sandbox.points.filter((p) => p.v !== null)).toHaveLength(6);
    expect(equityInputs(null, null, "live")).toEqual([]);
    expect(equityInputs(null, { ...drift, stages: {} }, "paper")).toEqual([]);
  });
});

describe("stage drift", () => {
  it("counts closes and gap days without filling the gap", async () => {
    const { drift } = await loaded();
    const paper = stagePath(drift, "paper")!;
    expect(paper.closes).toBe(9);
    expect(paper.gapDays).toBe(1);
    expect(paper.values[4]).toBeNull();
    const sandbox = stagePath(drift, "sandbox")!;
    // Trailing empties are "not in the stage", not gaps.
    expect(sandbox.closes).toBe(6);
    expect(sandbox.gapDays).toBe(0);
    const live = stagePath(drift, "live")!;
    expect(live.closes).toBe(5);
    expect(live.gapDays).toBe(0);
    expect(stagePath(drift, "canary")?.stage).toBe("live");
    expect(stagePath(null, "paper")).toBeNull();
    expect(stagePath(drift, "r1")).toBeNull();
  });

  it("draws bands only for stages that published at least two closes, never from position", async () => {
    const { drift } = await loaded();
    expect(stageBands(stagePaths(drift)).map((b) => b.id)).toEqual(["paper", "sandbox", "live"]);
    const empty = { ...drift, stages: { paper: { deployed: false, reasonCode: "NO_DEPLOYMENT_IN_STAGE", series: [] } } };
    expect(stageBands(stagePaths(empty))).toEqual([]);
    expect(stagePaths(empty)[0].reason).toBe("No deployment in this stage");
  });
});

describe("order states: L3 negatives", () => {
  it.each([
    ["FILLED", "applied"], ["PARTIALLY_FILLED", "partial"], ["NEW", "operation"], ["WORKING", "operation"], ["REJECTED", "rejected"],
    ["CANCELED", "paused"], ["CANCELLED", "paused"], ["EXPIRED", "paused"], ["UNKNOWN", "unknown"], [null, "unknown"],
  ] as const)("%s -> %s", (status, kind) => expect(orderFlag(status).kind).toBe(kind));

  it("a word the screen does not know is Unknown with the source's word, never a success state", () => {
    const base = { status: "NEW" };
    for (const c of enumCases(base, ["status"], ["NEW", "FILLED"])) {
      const status = (c.value as { status: unknown }).status;
      if (typeof status !== "string") continue;
      const flag = orderFlag(status);
      expect(["applied", "ok"], c.name).not.toContain(flag.kind);
    }
    expect(orderFlag("SUCCESS")).toEqual({ kind: "unknown", label: "Success" });
    expect(orderFlag("OK").kind).toBe("unknown");
  });

  it("counts the loaded rows by kind and calls them loaded", async () => {
    serveAlphaDouble();
    const page = await alphaHttpApi().getSubjectActivity({ environment: "live", subjectKind: "alpha", subjectId: ALPHA_DOUBLE_ID, relation: "orders" });
    if (!page.ok) throw new Error(page.reason);
    const orders = readReplayOrders(page.value.records.map((r) => r.values));
    expect(loadedOrderCounts(orders)).toEqual({ loaded: 6, working: 3, rejected: 1, unknown: 1 });
  });
});

describe("focus links", () => {
  it.each([["order:ord_001", "order", "ord_001"], ["fill:fill_002", "fill", "fill_002"]])("%s", (focus, kind, id) => {
    expect(focusTarget(focus)).toEqual({ kind, id });
  });
  it.each([null, "", "order:", "order:a b", "trade:1", "ORDER:1", "order:" + "x".repeat(200), "order:1\n"])("%j is not a focus", (focus) => {
    expect(focusTarget(focus)).toBeNull();
  });
  it("builds the deep link the V1 Blotter and the Orders tab share", () => {
    expect(replayHref("alpha a", "order:ord 1")).toBe("/deployments/alphas/alpha%20a?tab=replay&focus=order%3Aord%201");
  });
});

describe("observed timeline", () => {
  it("only command-journal rows reach the ribbon; orders, fills and sessions stay in the feed", async () => {
    const { timeline } = await loaded();
    const events = ribbonEvents(timeline.timeline.entries);
    expect(events.every((e) => e.kind === "decision")).toBe(true);
    expect(events).toHaveLength(1);
    expect(feedKind("ORDER_OBSERVED").label).toBe("Order");
    expect(feedKind("SOMETHING_NEW_OBSERVED").label).toBe("Something new");
  });

  it("an entry whose instant is unreadable is dropped rather than placed at the epoch", async () => {
    const { timeline } = await loaded();
    const bad = { ...timeline.timeline.entries.find((e) => e.observationType === "COMMAND_JOURNAL_ROW_OBSERVED")!, observedAtMs: Number.MAX_SAFE_INTEGER * 2 };
    expect(readUtcEpochMs(bad.observedAtMs)).toBeNull();
    expect(ribbonEvents([bad])).toEqual([]);
  });
});

describe("resource rows", () => {
  it("positions keep long and short legs apart and never infer a mark", async () => {
    const { resource } = await loaded();
    const rows = positionRows(resource.data.positions);
    expect(rows.map((r) => r.side)).toEqual(["Long", "Short"]);
    expect(rows[1].mark).toBeNull();
    expect(rows[1].unrealized).toBeNull();
    expect(positionRows(undefined)).toEqual([]);
    expect(positionRows([{ quantity: "1" }])).toEqual([]);
  });

  it("reconciliation words a finding it does not know instead of calling it resolved", async () => {
    const { resource } = await loaded();
    const rows = reconciliationRows(resource.data.reconciliation);
    expect(rows.map((r) => r.status.label)).toEqual(["Resolved", "Open"]);
    expect(rows[1].resolvedAt).toBeNull();
    expect(reconciliationRows([{ finding_id: "x", status: "WEIRD" }])[0].status).toEqual({ kind: "unknown", label: "Weird" });
    expect(reconciliationRows([{ finding_id: "x" }])[0].status.label).toBe("Unknown");
  });
});
