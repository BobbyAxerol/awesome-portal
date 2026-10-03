import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ResearchProgressSnapshotSchema, PublicResearchHandoffCursorSchema, toPublicResearchProgressSnapshot } from "../src/research/progress.contract";
import { DELTA_CAUSAL_INNER_PROFILE_ID } from "../src/research/delta-causal-inner.profile";
import { DELTA_WFO_PROFILE_ID } from "../src/research/delta-wfo.profile";
import { sourceTrialOrdinal } from "../src/research/selected-trial-presentation";
import { openApiValidator } from "./research-rf05-openapi";
const fixture = JSON.parse(readFileSync(join(__dirname, "research-progress-w2.fixture.json"), "utf8"));
function source() {
  const value = ResearchProgressSnapshotSchema.parse(structuredClone(fixture.snapshot));
  value.claim.handoff_cursor = { fold: 2, trial: 6, params_digest: "a".repeat(64) };
  value.folds[1]!.selection = { state: "AVAILABLE", scope: "PER_FOLD_STUDY", trial: 6,
    source_trial_id: "2", study_id: "1", objective: "0.25", params_digest: "a".repeat(64), reason_code: null };
  return value;
}
describe("W5 causal public navigation, immutable private progress", () => {
  it("maps global progress 6 to source study-local 3, carrying exact scope/study/source", () => {
    const input = source(), original = structuredClone(input);
    const result = toPublicResearchProgressSnapshot(input, DELTA_CAUSAL_INNER_PROFILE_ID);
    expect(result.claim.handoff_cursor).toEqual({ fold: 2, trial: 3, params_digest: "a".repeat(64),
      trial_scope: "STUDY_LOCAL", source_trial_id: "2", study_id: "1", progress_trial_ordinal: 6 });
    expect(result.folds[1]!.selection.trial).toBe(6);
    expect(result.claim.handoff_cursor_reason_code).toBeNull();
    expect(input).toEqual(original);
    expect(PublicResearchHandoffCursorSchema.safeParse(result.claim.handoff_cursor).success).toBe(true);
    openApiValidator("research-progress.openapi.json", "ProgressSnapshot").assert(result);
  });
  it.each(["missing", "duplicate", "params", "ordinal", "native", "range"])("withholds a %s binding rather than navigating to a guessed trial", kind => {
    const input = source();
    if (kind === "missing") input.folds = [];
    if (kind === "duplicate") input.folds.push(structuredClone(input.folds[1]!));
    if (kind === "params") input.folds[1]!.selection.params_digest = "b".repeat(64);
    if (kind === "ordinal") input.folds[1]!.selection.trial = 5;
    if (kind === "native") delete input.folds[1]!.selection.study_id;
    if (kind === "range") input.folds[1]!.selection.source_trial_id = "2147483647";
    const result = toPublicResearchProgressSnapshot(input, DELTA_CAUSAL_INNER_PROFILE_ID);
    expect(result.claim.handoff_cursor).toBeNull();
    expect(result.claim.handoff_cursor_reason_code).toMatch(/^CAUSAL_HANDOFF_/);
    expect(input.claim.handoff_cursor!.trial).toBe(6);
  });
  it("keeps global ordinals, and reads pre-amendment cursors without inventing a study", () => {
    const input = source();
    const result = toPublicResearchProgressSnapshot(input, DELTA_WFO_PROFILE_ID);
    expect(result.claim.handoff_cursor).toMatchObject({ trial: 6, trial_scope: "RUN_GLOBAL", source_trial_id: "5", study_id: null });
    expect(PublicResearchHandoffCursorSchema.safeParse(input.claim.handoff_cursor).success).toBe(true);
    input.claim.handoff_cursor = null;
    expect(toPublicResearchProgressSnapshot(input, DELTA_CAUSAL_INNER_PROFILE_ID).claim.handoff_cursor).toBeNull();
  });
  it("does not parse opaque or unsafe source trial IDs", () => {
    expect(sourceTrialOrdinal("2")).toBe(3);
    for (const value of [undefined, null, "study_1.trial_2", "02", "-1", "1.1", "9007199254740991"]) expect(sourceTrialOrdinal(value)).toBeNull();
  });
});
