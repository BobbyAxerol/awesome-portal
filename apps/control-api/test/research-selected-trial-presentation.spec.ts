import { describe, expect, it } from "vitest";
import { selectedTrialPresentation } from "../src/research/selected-trial-presentation";
import { DELTA_CAUSAL_INNER_PROFILE } from "../src/research/delta-causal-inner.profile";
import { RS02_DELTA_WFO_GLOBAL_PROFILE_ID, RS02_SIGNAL_NOTIONAL_PROFILE_ID } from "../src/research/delta-wfo.profile";

describe("W1 server-owned selected-trial presentation", () => {
  it.each([RS02_DELTA_WFO_GLOBAL_PROFILE_ID, RS02_SIGNAL_NOTIONAL_PROFILE_ID])("preserves numeric source ID on global %s", profile => {
    expect(selectedTrialPresentation("350", profile)).toEqual({ selected_trial_ordinal: 351,
      selected_trial_ordinal_scope: "RUN_GLOBAL", selected_trial_ordinal_reason_code: null });
    expect(selectedTrialPresentation("0", profile).selected_trial_ordinal).toBe(1);
  });
  it("requires the exact native retained mapping, not an opaque qualified-ID parser", () => {
    const profile = DELTA_CAUSAL_INNER_PROFILE.current_source.profile_id;
    expect(selectedTrialPresentation("study_2.trial_1", profile).selected_trial_ordinal).toBeNull();
    expect(selectedTrialPresentation("study_2.trial_1", profile, { trial_id: "study_2.trial_1", study_id: "2", source_trial_id: "1" })).toEqual({
      selected_trial_ordinal: 2, selected_trial_ordinal_scope: "STUDY_LOCAL", selected_trial_ordinal_reason_code: null });
    expect(selectedTrialPresentation("study_2.trial_1", profile, { trial_id: "other", study_id: "2", source_trial_id: "1" }).selected_trial_ordinal).toBeNull();
    expect(selectedTrialPresentation("study_2.trial_1", profile, { trial_id: "study_2.trial_1", study_id: "1", source_trial_id: "1" }).selected_trial_ordinal).toBeNull();
    // Re-evaluation identity is not the original local Optuna trial number.
    expect(selectedTrialPresentation("study_0.trial_2", profile, { trial_id: "study_0.trial_2", study_id: "0", source_trial_id: "1" }))
      .toMatchObject({ selected_trial_ordinal: 2, selected_trial_ordinal_scope: "STUDY_LOCAL" });
  });
  it.each(["trial-1", "01", "1.0", "-1", "9007199254740991"])("does not guess a native number from %s", id => {
    expect(selectedTrialPresentation(id, RS02_DELTA_WFO_GLOBAL_PROFILE_ID).selected_trial_ordinal).toBeNull();
  });
  it("does not assign a trial to fixed/unknown or absent selections", () => {
    expect(selectedTrialPresentation("0", "p04.fixed-qualification.v1").selected_trial_ordinal).toBeNull();
    expect(selectedTrialPresentation(null, RS02_DELTA_WFO_GLOBAL_PROFILE_ID).selected_trial_ordinal_reason_code).toBe("SELECTION_HAS_NO_TRIAL");
  });
});
