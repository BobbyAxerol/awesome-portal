import { describe, expect, it } from "vitest";
import { ROADMAP_PHASES_SEED } from "../src/content/seed";
import { cloneRoadmapSeeds, nextPhaseId, normalisePhase } from "../src/features/roadmap/roadmap-model";

describe("roadmap model", () => {
  it("clones the locked seed without changing it", () => {
    const phases = cloneRoadmapSeeds();
    expect(phases).toHaveLength(ROADMAP_PHASES_SEED.length);
    phases[0].name = "Runtime phase";
    expect(ROADMAP_PHASES_SEED[0].name).not.toBe("Runtime phase");
  });

  it("normalizes range and tone from imported records", () => {
    expect(normalisePhase({ id: "P9", name: "Imported", start: 27, end: 2, tone: "unknown" })).toMatchObject({ start: 24, end: 24, tone: "blue" });
  });

  it("continues the legacy phase ID sequence", () => {
    expect(nextPhaseId(cloneRoadmapSeeds())).toBe("P6");
  });
});
