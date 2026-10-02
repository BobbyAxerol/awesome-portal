import type { ControlApiConfig } from "../config";
import type { ResearchPortalAdmission } from "./foundation.contract";
import { DELTA_WFO_V2_PROFILE } from "./delta-wfo-v2.profile";
import {
  DELTA_WFO_PREVIEW_LONG_LIMITS,
  DELTA_WFO_PROFILE,
  P04_FIXED_QUALIFICATION_PROFILE_ID,
  deltaWfoPreviewLongEnabled,
} from "./delta-wfo.profile";

type AdmissionFlags = Pick<ControlApiConfig,
  "FEATURE_RESEARCH_RUN_PRODUCER" | "FEATURE_RESEARCH_WFO_PROFILE" | "FEATURE_RESEARCH_PREVIEW_LONG_WFO">;

/** Descriptive Portal facts, never an authorization grant or a replacement for preflight. */
export function researchPortalAdmission(
  config: AdmissionFlags,
  release: { release_id: string; verified: boolean },
): ResearchPortalAdmission {
  const sourceReason = release.release_id !== DELTA_WFO_PROFILE.engine_release_id
    ? "ENGINE_RELEASE_MISMATCH"
    : !release.verified
      ? "SOURCE_RELEASE_UNVERIFIED"
      : null;
  const producerReason = config.FEATURE_RESEARCH_RUN_PRODUCER !== "true" ? "RUN_PRODUCER_OFF" : null;
  const fixedReason = sourceReason ?? producerReason;
  const wfoReason = fixedReason ?? (config.FEATURE_RESEARCH_WFO_PROFILE !== "true" ? "PROFILE_FLAG_OFF" : null);
  const previewLong = deltaWfoPreviewLongEnabled(config);
  return {
    schema_version: "research.portal-admission.v1",
    profiles: [
      {
        profile_id: P04_FIXED_QUALIFICATION_PROFILE_ID,
        state: fixedReason ? "DISABLED" : "ENABLED",
        reason: fixedReason,
        engine_release_id: DELTA_WFO_PROFILE.engine_release_id,
        execution_route: "signal_notional",
        protocol: "three_window_decay",
        optimization_mode: "mode_1_decay",
        optimization_schedule: "global",
        timeframe: "1h",
        trial_count: { min: 1, max: 1 },
        random_seed: null,
        max_span_days: null,
        fold_bounds: null,
        frequency: null,
        window_mode: null,
        requested_spec_versions: ["research.requested-spec.v1", "research.requested-spec.v2"],
        seed_policy: "FORBIDDEN", trial_default: 1, early_stopping_policy: "FORBIDDEN",
      },
      {
        profile_id: DELTA_WFO_PROFILE.profile_id,
        state: wfoReason ? "DISABLED" : "ENABLED",
        reason: wfoReason,
        engine_release_id: DELTA_WFO_PROFILE.engine_release_id,
        execution_route: DELTA_WFO_PROFILE.execution_route,
        protocol: DELTA_WFO_PROFILE.protocol,
        optimization_mode: DELTA_WFO_PROFILE.optimization_mode,
        optimization_schedule: DELTA_WFO_PROFILE.optimization_schedule,
        timeframe: DELTA_WFO_PROFILE.timeframe,
        trial_count: previewLong
          ? { min: DELTA_WFO_PREVIEW_LONG_LIMITS.min_trials, max: DELTA_WFO_PREVIEW_LONG_LIMITS.max_trials }
          : { min: DELTA_WFO_PROFILE.optuna_trials, max: DELTA_WFO_PROFILE.optuna_trials },
        random_seed: DELTA_WFO_PROFILE.random_seed,
        max_span_days: DELTA_WFO_PROFILE.max_span_days,
        fold_bounds: DELTA_WFO_PROFILE.fold_bounds,
        frequency: DELTA_WFO_PROFILE.frequency,
        window_mode: DELTA_WFO_PROFILE.window_mode,
        requested_spec_versions: ["research.requested-spec.v1"],
        seed_policy: "LOCKED", trial_default: 3, early_stopping_policy: "FORBIDDEN",
      },
      {
        profile_id: DELTA_WFO_V2_PROFILE.profile_id,
        state: wfoReason ? "DISABLED" : "ENABLED", reason: wfoReason,
        engine_release_id: DELTA_WFO_V2_PROFILE.engine_release_id,
        execution_route: DELTA_WFO_V2_PROFILE.execution_route, protocol: DELTA_WFO_V2_PROFILE.protocol,
        optimization_mode: DELTA_WFO_V2_PROFILE.optimization_mode, optimization_schedule: DELTA_WFO_V2_PROFILE.optimization_schedule,
        timeframe: DELTA_WFO_V2_PROFILE.timeframe, random_seed: DELTA_WFO_V2_PROFILE.random_seed,
        trial_count: previewLong ? { min: 2, max: 400 } : DELTA_WFO_V2_PROFILE.trial_count,
        max_span_days: DELTA_WFO_V2_PROFILE.max_span_days, fold_bounds: DELTA_WFO_V2_PROFILE.fold_bounds,
        frequency: null, window_mode: null, frequencies: [...DELTA_WFO_V2_PROFILE.frequencies],
        window_modes: [...DELTA_WFO_V2_PROFILE.window_modes], requested_spec_versions: ["research.requested-spec.v2"],
        seed_policy: "LOCKED", trial_default: 3, early_stopping_policy: "FORBIDDEN", inner_validation: DELTA_WFO_V2_PROFILE.inner_validation,
      },
    ],
    note: "PROFILE_FACTS_ONLY_PREFLIGHT_AND_RUN_ADMISSION_ARE_AUTHORITATIVE",
  };
}
