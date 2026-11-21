import type { ControlApiConfig } from "../config";
import type { ResearchPortalAdmission, ResearchEngineAtlasPrivate } from "./foundation.contract";
import { VN_OBSERVED_FIXED_PROFILE, VN_OBSERVED_FIXED_PROFILE_DIGEST } from "./vn-observed-fixed.profile";
import { executionRecipes, executionRecipeActivationReason, executionRecipeTrialCount, preferredIntakeRecipes } from "./execution-recipes";
import { earlyStoppingPolicy } from "./early-stopping";

type AdmissionFlags = Pick<ControlApiConfig,
  "FEATURE_RESEARCH_RUN_PRODUCER" | "FEATURE_RESEARCH_WFO_PROFILE" | "FEATURE_RESEARCH_PREVIEW_LONG_WFO">
  & Partial<Pick<ControlApiConfig, "FEATURE_RESEARCH_VN_OBSERVED_PROFILE" | "FEATURE_RESEARCH_FULL02_PROFILE" | "FEATURE_RESEARCH_FULL03_PROFILE" | "FEATURE_RESEARCH_FULL04_PROFILE" | "FEATURE_RESEARCH_FULL05_PROFILE" | "FEATURE_RESEARCH_FULL06_PROFILE" | "FEATURE_RESEARCH_IMPORTED_EXECUTION" | "RESEARCH_RECIPE_QUALIFICATION_PROFILE_ID" | "PORTAL_ENV" | "AUTH_MODE">>;

/** Same installed profiles/flags; catalogue truth is not a grant to execute. */
export function researchPortalAdmission(
  config: AdmissionFlags,
  release: Pick<ResearchEngineAtlasPrivate["current_release"], "release_id" | "verified" | "vn_observed_daily_qualification">,
): ResearchPortalAdmission {
  const vn = VN_OBSERVED_FIXED_PROFILE, q = release.vn_observed_daily_qualification;
  const vnQualified = q?.state === "AVAILABLE" && q.reason_code === null
    && q.profile_id === vn.profile_id && q.profile_digest === VN_OBSERVED_FIXED_PROFILE_DIGEST
    && q.dataset_id === vn.dataset_id && q.symbol === vn.symbol && q.timeframe === vn.timeframe
    && q.source_timezone === vn.source_timezone && q.clock_basis === vn.clock_basis
    && typeof q.index_revision === "string" && /^[a-f0-9]{64}$/.test(q.index_revision);
  return {
    schema_version: "research.portal-admission.v1",
    profiles: preferredIntakeRecipes(executionRecipes,undefined,config).filter(row => row.adapter_kind !== "IMPORTED_FIXED"
      && (row.adapter_kind!=="IMPORTED_SEARCH"||config.FEATURE_RESEARCH_FULL05_PROFILE==="true")
      && (!(row.feature_flags as readonly string[]).includes("FEATURE_RESEARCH_FULL02_PROFILE")
        || config.FEATURE_RESEARCH_FULL02_PROFILE === "true")
      && (!(row.feature_flags as readonly string[]).includes("FEATURE_RESEARCH_FULL03_PROFILE")
        || config.FEATURE_RESEARCH_FULL03_PROFILE === "true")
      && (!(row.feature_flags as readonly string[]).includes("FEATURE_RESEARCH_FULL04_PROFILE")
        || config.FEATURE_RESEARCH_FULL04_PROFILE === "true")
      && (!(row.feature_flags as readonly string[]).includes("FEATURE_RESEARCH_FULL06_PROFILE")
        || config.FEATURE_RESEARCH_FULL06_PROFILE === "true")).map((row): ResearchPortalAdmission["profiles"][number] => {
      const reason = executionRecipeActivationReason(row, config, {
        engine_release_id:release.release_id, verified:release.verified, context_qualified:vnQualified,
      });
      // The checked image-owned JSON is copied, not a second mutable policy.
      const {profile_id, ...facts} = JSON.parse(JSON.stringify(row.public_profile)) as
        Omit<ResearchPortalAdmission["profiles"][number], "state" | "reason">;
      // Native IS optimizer admission reads the immutable execution descriptor.
      // Its initial additive public template inherited fixed-native presentation
      // (FORBIDDEN seed / 92 days). Correct the read representation, never the
      // persisted recipe identity or already-issued run/qualification digest.
      if ("native_input" in row.descriptor && "random_seed" in row.descriptor
          && row.descriptor.native_input.optimizer === "PINNED_QUANTBT_NATIVE_IS_SHARPE_V1") {
        facts.seed_policy = "LOCKED";
        facts.random_seed = row.descriptor.random_seed;
        facts.max_span_days = row.descriptor.max_span_days;
      }
      // Atlas's historical ETag hashes wire JSON, not a sorted object. Keep
      // the original prefix/key insertion order as well as semantic facts.
      return {profile_id, state:reason ? "DISABLED" : "ENABLED", reason,
        ...facts, trial_count:executionRecipeTrialCount(row, config), early_stopping_policy:earlyStoppingPolicy(row.public_profile)};
    }),
    note: "PROFILE_FACTS_ONLY_PREFLIGHT_AND_RUN_ADMISSION_ARE_AUTHORITATIVE",
  };
}
