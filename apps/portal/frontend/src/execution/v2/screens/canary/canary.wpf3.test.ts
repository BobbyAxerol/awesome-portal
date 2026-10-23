/**
 * WP-F3 additions to the Canary view model, on the lit body of the populated review lane (`e2e/bffSimulatedStage.ts`, FIXTURE_LAB): the
 * KPI caption is the server's share of the approved cap, the duration row prints the published trial day and nothing else, the rollback
 * drill says Passed, and a stale broker adds its own scale-up blocker.
 */
import { describe, expect, it } from "vitest";

import { simulateStage } from "../../../../../e2e/bffSimulatedStage";
import { readCanaryByVersion } from "../../readers/dispatch";
import { rollbackItems, kpiCells, blockerItems, limitRows } from "./model";
import { readCanaryView, type CanaryView } from "./readCanary";
import { v1Body } from "./canary.testbase";

function lit(id: string): CanaryView {
  const body = simulateStage(`/deployments/${id}/canary`, v1Body());
  if (body === null) throw new Error("not lit");
  const result = readCanaryView(readCanaryByVersion(body));
  if (result.kind !== "view") throw new Error(result.text);
  return result.view;
}

describe("KPI captions", () => {
  it("capital and gross notional carry the server's share of the approved cap, moved two places", () => {
    const cells = kpiCells(lit("dep_canary_01"));
    const basis = (key: string) => (cells.find((c) => c.key === key) as { basis?: string }).basis;
    expect(basis("capital_consumed")).toBe("76.40% of approved");
    expect(basis("gross_notional")).toBe("61.204% of approved");
    expect(basis("daily_pnl")).toBe("Daily loss cap 250.00");
    expect(basis("open_orders")).toBe("Max 20");
  });

  it("without a published ratio the caption is the cap itself, as before", () => {
    const view = lit("dep_canary_01");
    const stripped: CanaryView = { ...view, envelope: view.envelope === null ? null : { ...view.envelope, limits: view.envelope.limits.map((l) => ({ ...l, usedRatio: undefined })) } };
    const cell = kpiCells(stripped).find((c) => c.key === "capital_consumed") as { basis?: string };
    expect(cell.basis).toBe("Envelope cap 5,000.00");
  });
});

describe("the envelope's duration row", () => {
  it("consumed is the published trial day; the limit and the used ratio are not published", () => {
    const duration = limitRows(lit("dep_canary_01")).find((row) => row.key === "duration")!;
    expect(duration.consumed).toMatchObject({ kind: "value" });
    expect(duration.limit).toBeNull();
    expect(duration.usedRatio).toBeUndefined();
  });

  it("with no trial day there is no consumed figure (never a zero)", () => {
    const view = lit("dep_canary_01");
    const duration = limitRows({ ...view, dayIndex: null }).find((row) => row.key === "duration")!;
    expect(duration.consumed).toBeNull();
  });
});

describe("rollback readiness", () => {
  it("four checks, the drill is Passed and the others Ready, each with its date", () => {
    const items = rollbackItems(lit("dep_canary_01"));
    expect(items.map((i) => (i.status.kind === "flag" ? i.status.label : "NP"))).toEqual(["Ready", "Ready", "Ready", "Passed"]);
    expect(items.every((i) => i.checked !== null)).toBe(true);
  });

  it("a stale broker makes the broker check not ready and adds the scale-up blocker", () => {
    const view = lit("dep_canary_01_stale");
    expect(rollbackItems(view).find((i) => i.key === "broker")!.status).toMatchObject({ kind: "flag", label: "Not ready" });
    expect(blockerItems(view).map((b) => b.text)).toContain("Broker data is stale, so scale-up is blocked.");
  });
});
