/** An ended/retired deployment row is history marked ended, never the alpha's current stage (QA7 / B-A3 (a)). */
import { describe, expect, it } from "vitest";

import type { ManagerRow } from "../../readers/managerDataset";
import { inStageOf, isEndedRow, stageViewOf } from "./fleetDatasetModel";

const row = (lifecycle: string | null): ManagerRow => ({
  rowKey: "k", alphaId: "a", alphaVersionId: "v", portfolioId: "p", name: "Grid D", ownerUserId: null, lifecycle, venue: null, health: null, sourceState: null,
  stagePresence: ["PAPER"], currentStage: "PAPER", enteredAtMs: null, daysInStage: 34 as never,
  stageLifecycleReasons: { currentStage: null, enteredAtMs: "STAGE_ENTRY_TIME_NOT_PUBLISHED", daysInStage: null },
  children: [], metrics: {}, economicPartitions: [],
} as unknown as ManagerRow);

describe("ended rows", () => {
  it("marks the stage ended and prints Ended instead of days in stage", () => {
    expect(isEndedRow(row("ENDED"))).toBe(true);
    expect(stageViewOf(row("ENDED")).label).toBe("Paper · ended");
    expect(inStageOf(row("ENDED"), () => "").text).toBe("Ended");
  });
  it("leaves an active row alone", () => {
    expect(isEndedRow(row("ACTIVE"))).toBe(false);
    expect(stageViewOf(row("ACTIVE")).label).toBe("Paper");
  });
});
