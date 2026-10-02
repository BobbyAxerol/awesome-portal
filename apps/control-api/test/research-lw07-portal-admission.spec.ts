import { describe, expect, it } from "vitest";

import { researchPortalAdmission } from "../src/research/portal-admission";

const release = { release_id: "er_quantbt_111", verified: true };

describe("LW-07 Portal admission beside the immutable QuantBT Atlas", () => {
  it("keeps the fixed profile distinct from the locked WFO profile", () => {
    const admission = researchPortalAdmission({
      FEATURE_RESEARCH_RUN_PRODUCER: "true",
      FEATURE_RESEARCH_WFO_PROFILE: "true",
      FEATURE_RESEARCH_PREVIEW_LONG_WFO: "false",
    }, release);
    expect(admission.profiles.slice(0, 2)).toMatchObject([
      { profile_id: "p04.fixed-qualification.v1", state: "ENABLED",
        protocol: "three_window_decay", trial_count: { min: 1, max: 1 }, random_seed: null },
      { profile_id: "p10.delta-signal-notional-wfo.v1", state: "ENABLED",
        protocol: "advanced", optimization_mode: "mode_1_decay", optimization_schedule: "global",
        execution_route: "signal_notional", timeframe: "1h", trial_count: { min: 3, max: 3 },
        random_seed: 42, max_span_days: 92, fold_bounds: { min: 2, max: 16 } },
    ]);
    expect(admission.profiles[2]).toMatchObject({
      profile_id: "p10.delta-signal-notional-wfo.v2", state: "ENABLED",
      requested_spec_versions: ["research.requested-spec.v2"],
      window_modes: ["expanding", "rolling"], seed_policy: "LOCKED", trial_default: 3,
    });
  });

  it("publishes preview-only 2–400 trial bounds without changing the pinned source release", () => {
    const admission = researchPortalAdmission({
      FEATURE_RESEARCH_RUN_PRODUCER: "true",
      FEATURE_RESEARCH_WFO_PROFILE: "true",
      FEATURE_RESEARCH_PREVIEW_LONG_WFO: "true",
    }, release);
    expect(admission.profiles[1]).toMatchObject({
      trial_count: { min: 2, max: 400 }, random_seed: 42, state: "ENABLED",
    });
    expect(admission.note).toBe("PROFILE_FACTS_ONLY_PREFLIGHT_AND_RUN_ADMISSION_ARE_AUTHORITATIVE");
  });

  it("reports feature and source refusals instead of claiming every Atlas route is admitted", () => {
    const flags = {
      FEATURE_RESEARCH_RUN_PRODUCER: "true" as const,
      FEATURE_RESEARCH_WFO_PROFILE: "false" as const,
      FEATURE_RESEARCH_PREVIEW_LONG_WFO: "false" as const,
    };
    expect(researchPortalAdmission(flags, release).profiles.map((profile) => [profile.state, profile.reason]))
      .toEqual([["ENABLED", null], ["DISABLED", "PROFILE_FLAG_OFF"], ["DISABLED", "PROFILE_FLAG_OFF"], ["DISABLED", "PROFILE_FLAG_OFF"],
        ["DISABLED", "PROFILE_FLAG_OFF"]]);
    expect(researchPortalAdmission(flags, release).profiles[4]).toMatchObject({
      profile_id: "p10.vn-stock-daily-observed-fixed.v1", state: "DISABLED", reason: "PROFILE_FLAG_OFF",
      dataset_id: "vn-stock-daily", symbol: "FPT", timeframe: "1d", calendar_authority: "NOT_PUBLISHED",
    });
    expect(researchPortalAdmission({ ...flags, FEATURE_RESEARCH_VN_OBSERVED_PROFILE: "true" }, release).profiles[4])
      .toMatchObject({ state: "DISABLED", reason: "SOURCE_PROFILE_UNQUALIFIED" });
    expect(researchPortalAdmission(flags, { ...release, verified: false }).profiles[1].reason)
      .toBe("SOURCE_RELEASE_UNVERIFIED");
    expect(researchPortalAdmission(flags, { release_id: "er_other", verified: true }).profiles[0].reason)
      .toBe("ENGINE_RELEASE_MISMATCH");
    expect(researchPortalAdmission({ ...flags, FEATURE_RESEARCH_RUN_PRODUCER: "false" }, release).profiles[0].reason)
      .toBe("RUN_PRODUCER_OFF");
  });
});
