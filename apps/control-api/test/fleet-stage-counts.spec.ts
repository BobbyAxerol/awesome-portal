/**
 * FE-048 · what an absent stage in the Alpha Fleet `summary.stage_counts` means (DEBT-UXM07-004).
 *
 * Pure: `fleetStageCounts` takes the projected rows and the source environments whose strategies AND deployments were read
 * COMPLETE. No database (the snapshot wiring is covered by manager-lists.spec.ts, which needs PG).
 *
 * The contract the consumer may rely on:
 *  - a stage of a completely read environment is present, with its exact count, even when that count is 0;
 *  - a stage of an environment that was not read, or read PARTIAL, is absent (never 0);
 *  - a stage the Portal does not list for any environment appears only when an alpha holds it; RESEARCH likewise;
 *  - the response schema allows all of this (`additionalProperties`: integer >= 0), so no contract changes.
 */
import { describe, expect, it } from "vitest";

import { ENVIRONMENT_STAGES, fleetStageCounts } from "../src/manager-lists/manager-lists.service";

const alpha = (...stages: string[]) => ({ stages });

describe("fleet stage_counts (FE-048)", () => {
  it("states 0 for every stage of an environment that was read complete", () => {
    expect(fleetStageCounts([alpha("PAPER"), alpha("PAPER", "SANDBOX")], ["paper", "sandbox", "live"])).toEqual({
      CANARY: 0, LIVE: 0, PAPER: 2, SANDBOX: 1,
    });
    expect(fleetStageCounts([], ["paper", "sandbox", "live"])).toEqual({ CANARY: 0, LIVE: 0, PAPER: 0, SANDBOX: 0 });
  });

  it("an environment that was not read, or read partial, states nothing about its stages: they are absent, not 0", () => {
    // Only Paper was read complete: Sandbox, Canary and Live are absent.
    expect(fleetStageCounts([alpha("PAPER")], ["paper"])).toEqual({ PAPER: 1 });
    // Nothing complete: only what an alpha actually holds is stated, never a 0.
    expect(fleetStageCounts([alpha("LIVE")], [])).toEqual({ LIVE: 1 });
    expect(fleetStageCounts([], [])).toEqual({});
    for (const value of Object.values(fleetStageCounts([alpha("PAPER", "LIVE")], []))) expect(value).toBeGreaterThan(0);
  });

  it("the real-funded environment owns Canary and Live together", () => {
    expect(ENVIRONMENT_STAGES.live).toEqual(["CANARY", "LIVE"]);
    expect(fleetStageCounts([alpha("CANARY", "LIVE"), alpha("LIVE")], ["live"])).toEqual({ CANARY: 1, LIVE: 2 });
  });

  it("a stage outside the table, and RESEARCH, appear only when an alpha holds them", () => {
    expect(fleetStageCounts([alpha("SHADOW"), alpha("RESEARCH")], ["paper"])).toEqual({ PAPER: 0, RESEARCH: 1, SHADOW: 1 });
    expect(fleetStageCounts([alpha("PAPER")], ["paper"])).not.toHaveProperty("RESEARCH");
  });

  it("counts alphas per stage they are in, keys sorted, and a stage held by two deployments counts the alpha once", () => {
    const counts = fleetStageCounts([alpha("SANDBOX", "PAPER"), alpha("PAPER")], ["paper", "sandbox"]);
    expect(Object.keys(counts)).toEqual(["PAPER", "SANDBOX"]);
    expect(counts).toEqual({ PAPER: 2, SANDBOX: 1 });
  });

  it("every value is a non-negative integer, as the response schema requires", () => {
    for (const value of Object.values(fleetStageCounts([alpha("PAPER"), alpha("LIVE", "CANARY")], ["paper", "sandbox", "live"]))) {
      expect(Number.isInteger(value) && value >= 0).toBe(true);
    }
  });
});
