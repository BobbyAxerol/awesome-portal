/**
 * WP-F3 additions to the Live view model, on the lit body of the populated review lane (`e2e/bffSimulatedStage.ts`, FIXTURE_LAB): Broker
 * equity is captioned by the SERVER's difference, a MISMATCH hides every broker value and says why risk-increasing actions are blocked, a
 * stale or gapped feed is worded, and the dark body keeps every typed absence.
 */
import { describe, expect, it } from "vitest";

import { simulateStage } from "../../../../../e2e/bffSimulatedStage";
import { liveModelOf, type LiveModel } from "./model";
import { v1Raw, v1Read } from "./live.testbase";

function lit(id: string): LiveModel {
  const body = simulateStage(`/deployments/${id}/live`, v1Raw());
  if (body === null) throw new Error("not lit");
  const built = liveModelOf(v1Read(body));
  if (built.kind !== "model") throw new Error("unsupported");
  return built.model;
}
const kpi = (model: LiveModel, key: string) => model.kpis.find((k) => k.key === key)!;

describe("Broker equity", () => {
  it("is captioned 'Matches internal' when the server's equity difference is exactly zero", () => {
    const cell = kpi(lit("dep_live_01"), "broker_equity");
    expect(cell.kind).toBe("metric");
    expect(cell.basis).toBe("Matches internal");
  });

  it("is Hidden while the figures disagree, with no broker value anywhere in the model", () => {
    const model = lit("dep_live_01_mismatch");
    expect(kpi(model, "broker_equity")).toMatchObject({ kind: "hidden", basis: "While figures disagree" });
    expect(model.chart.kind).toBe("mismatch");
    expect(model.triad?.suppressed).toBe(true);
    expect(JSON.stringify(model.kpis)).not.toContain("60131");
  });
});

describe("what is blocking", () => {
  it("a mismatch names the disagreement and the risk-increasing block, in that order", () => {
    const texts = lit("dep_live_01_mismatch").blockers.map((b) => b.text);
    const at = (text: string) => texts.indexOf(text);
    expect(at("Internal and broker figures disagree.")).toBeGreaterThan(-1);
    expect(at("Risk-increasing actions are blocked until the figures match.")).toBe(at("Internal and broker figures disagree.") + 1);
  });

  it("a healthy deployment carries neither line", () => {
    const texts = lit("dep_live_01").blockers.map((b) => b.text);
    expect(texts.join(" ")).not.toMatch(/disagree|until the figures match/);
  });

  it("a gap names its own block, a stale feed its notice", () => {
    expect(lit("dep_live_01_gap").blockers.map((b) => b.text)).toContain("Risk-increasing actions are blocked until the gap closes.");
    expect(lit("dep_live_01_stale").notice).toMatchObject({ kind: "stale" });
  });
});

describe("the dark variant", () => {
  it("is not lit: the overlay answers null and the published dark body stands", () => {
    expect(simulateStage("/deployments/dep_live_01_dark/live", v1Raw())).toBeNull();
  });
});
