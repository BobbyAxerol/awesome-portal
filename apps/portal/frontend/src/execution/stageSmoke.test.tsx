/**
 * SMOKE — delete with `stage.smoke.ts` (BR-EX-41).
 *
 * Two facts: with the switch on every stage screen draws its charts and says
 * on its face that they are smoke; with it off the honest states are exactly
 * what they were.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CanaryControlRoomScreen } from "./screens/CanaryControlRoom";
import { LiveFullOperationsScreen } from "./screens/LiveFullOperations";
import { SandboxCertificationScreen } from "./screens/SandboxCertification";
import { STAGE_SMOKE, STAGE_SMOKE_WARNING, stageVisuals } from "./stage.smoke";
import { readCanaryControlRoom, readSandboxCertification } from "./certification";
import { readLiveFullOperations } from "./liveFull";
import { CANARY_ROOM_FIXTURE, LIVE_FULL_FIXTURE, SANDBOX_CERTIFICATION_FIXTURE } from "./certification.fixtures";

afterEach(cleanup);

describe("stage smoke visuals", () => {
  it("is switched on for the review build", () => {
    expect(STAGE_SMOKE).toBe(true);
  });

  it("gives every stage deterministic, labelled visuals", () => {
    for (const stage of ["paper", "sandbox", "canary", "live"] as const) {
      const v = stageVisuals(stage);
      expect(v.smoke).toBe(true);
      expect(v.warning).toBe(STAGE_SMOKE_WARNING);
      expect(v.equity.lines.length).toBeGreaterThan(0);
      expect(v.caps.length).toBeGreaterThan(2);
      expect(v.latency.buckets.length).toBeGreaterThan(4);
      expect(v.envelope.warnings).toContain(STAGE_SMOKE_WARNING);
      // deterministic: same call, same points
      expect(stageVisuals(stage).equity.lines[0].points[7]).toEqual(v.equity.lines[0].points[7]);
    }
  });

  it("canary: charts, gauges and the positions table are drawn and every one is marked smoke", () => {
    const room = readCanaryControlRoom(CANARY_ROOM_FIXTURE);
    const { container } = render(<CanaryControlRoomScreen room={room} visuals={stageVisuals("canary")} />);
    expect(container.querySelectorAll(".exec-visual").length).toBeGreaterThanOrEqual(4);
    expect(screen.getAllByText(new RegExp(STAGE_SMOKE_WARNING.slice(0, 10))).length).toBeGreaterThanOrEqual(4);
    expect(screen.getAllByText("smoke").length).toBeGreaterThan(0); // KPI note
    expect(screen.getByRole("meter", { name: "max drawdown" })).toBeTruthy();
  });

  it("canary: with the switch off the honest state is untouched", () => {
    const room = readCanaryControlRoom(CANARY_ROOM_FIXTURE);
    const { container } = render(<CanaryControlRoomScreen room={room} />);
    expect(container.querySelectorAll(".exec-visual")).toHaveLength(0);
    expect(screen.queryByText(/SMOKE DATA/)).toBeNull();
    expect(screen.getByText(/nothing to draw|no equity points/)).toBeTruthy();
  });

  it("live: a suppressed KPI is never filled by smoke", () => {
    const live = readLiveFullOperations(LIVE_FULL_FIXTURE);
    render(<LiveFullOperationsScreen live={live} visuals={stageVisuals("live")} />);
    expect(screen.getByText("suppressed")).toBeTruthy();
  });

  it("sandbox: the stepper folds reasons behind why and the rail names the unavailable steps once", () => {
    const cert = readSandboxCertification(SANDBOX_CERTIFICATION_FIXTURE);
    render(<SandboxCertificationScreen certification={cert} visuals={stageVisuals("sandbox")} />);
    expect(screen.getAllByText("why").length).toBe(7);
    expect(screen.getByText(/7 certification steps unavailable in this profile/)).toBeTruthy();
    // Positions (smoke) sit in the default Reconciliation tab; the order-type matrix lives in Steps.
    expect(screen.getByText("Physical broker state · testnet")).toBeTruthy();
  });
});
