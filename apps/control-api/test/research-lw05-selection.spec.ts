import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { DELTA_WFO_PROFILE_ID, P04_FIXED_QUALIFICATION_PROFILE_ID } from "../src/research/delta-wfo.profile";
import {
  ResearchProgressEventSchema,
  ResearchProgressSnapshotSchema,
  toPublicResearchProgressEvent,
  toPublicResearchProgressSnapshot,
} from "../src/research/progress.contract";

const fixture = JSON.parse(readFileSync(join(__dirname, "research-progress-w2.fixture.json"), "utf8"));

describe("LW-05 selected trial and objective scopes", () => {
  it("projects the WFO source id separately from the one-based journal ordinal", () => {
    const source = ResearchProgressSnapshotSchema.parse({
      ...fixture.snapshot,
      overall: {
        ...fixture.snapshot.overall,
        tqdm_line: "global study · trial 400/400 · best J₁ 4.948 · pruned 11/400",
      },
      folds: fixture.snapshot.folds.map((fold: Record<string, unknown>) => ({
        ...fold,
        selection: {
          state: "AVAILABLE",
          scope: "GLOBAL_STUDY",
          trial: 394,
          objective: "-4.796929242668172",
          params_digest: "e".repeat(64),
          reason_code: null,
        },
      })),
    });
    const publicWfo = toPublicResearchProgressSnapshot(source, DELTA_WFO_PROFILE_ID);
    expect(publicWfo.folds[0].selection).toMatchObject({
      trial: 394,
      source_trial_id: "393",
      objective: "-4.796929242668172",
      objective_kind: "MODE_1_DECAY_J",
    });
    expect(publicWfo.overall.tqdm_line).toContain("best IS Sharpe 4.948");
    expect(source.folds[0].selection).not.toHaveProperty("source_trial_id");
    expect(source.overall.tqdm_line).toContain("best J₁ 4.948");

    const fixed = toPublicResearchProgressSnapshot(source, P04_FIXED_QUALIFICATION_PROFILE_ID);
    expect(fixed.folds[0].selection).not.toHaveProperty("source_trial_id");
  });

  it("rejects a source id that does not match the journal ordinal", () => {
    const source = ResearchProgressSnapshotSchema.parse(fixture.snapshot);
    expect(ResearchProgressSnapshotSchema.safeParse({
      ...source,
      folds: source.folds.map((fold) => ({
        ...fold,
        selection: { ...fold.selection, source_trial_id: "394", objective_kind: "MODE_1_DECAY_J" },
      })),
    }).success).toBe(false);
  });

  it("corrects old public trial-event copy without rewriting the retained event", () => {
    const source = ResearchProgressEventSchema.parse({
      ...fixture.events.find((event: { event_type: string }) => event.event_type === "trial_completed"),
    });
    const publicEvent = toPublicResearchProgressEvent(source);
    expect(publicEvent.event_type).toBe("trial_completed");
    if (publicEvent.event_type !== "trial_completed" || source.event_type !== "trial_completed") return;
    expect(publicEvent.payload.tqdm_line).toContain("best IS Sharpe");
    expect(source.payload.tqdm_line).toContain("best J₁");
  });
});
