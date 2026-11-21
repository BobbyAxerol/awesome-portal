/** Minimal reconciled current-P04 P14 source receipt for contract/service tests. */
export function p14SplitSourceFixture(options: { manifestDigest?: string } = {}) {
  return {
    schema_version: "research.p14.split-source.v1" as const,
    source: {
      execution_adapter_id: "p04.delta-rsi.v1" as const,
      engine_version: "1.1.1",
      input_scope: "P08_OPTIONAL_WARMUP_PLUS_IS_OOS_ONLY" as const,
      source_transform_digest: "a".repeat(64),
      manifest_digest: options.manifestDigest ?? "b".repeat(64),
      physical_io: {
        state: "NOT_ATTESTED" as const,
        reason_code: "P10_ROW_GROUP_PHYSICAL_IO_BOUNDARY_NOT_PUBLISHED" as const,
      },
    },
    protocol: {
      kind: "THREE_WINDOW_CURRENT" as const,
      fold_plan: { state: "NOT_PUBLISHED" as const, reason_code: "P04_FIXED_PROFILE_DOES_NOT_PUBLISH_FOLD_PLAN" },
      selection: {
        state: "FIXED_PROFILE_NO_SEARCH" as const,
        parameter_bundle_digest: "c".repeat(64),
        strict_outer_oos: {
          state: "NOT_ASSERTED" as const,
          reason_code: "P04_FIXED_PROFILE_DOES_NOT_PUBLISH_STRICT_OUTER_OOS_SELECTION_FACTS" as const,
        },
      },
    },
    timeline: { start_utc_ms: 1_704_067_200_000, end_exclusive_utc_ms: 1_705_881_600_000 },
    windows: {
      warmup: { state: "NOT_APPLICABLE" as const, bars: 0 as const, reason_code: "P08_WARMUP_NOT_REQUESTED" as const },
      is: {
        start_utc_ms: 1_704_067_200_000, end_exclusive_utc_ms: 1_704_672_000_000,
        bars: 168, data_role: "IS_CALIBRATION_HISTORY" as const, child_input_state: "EXPOSED_TO_CHILD_TAPE" as const,
      },
      outer_oos: {
        start_utc_ms: 1_704_672_000_000, end_exclusive_utc_ms: 1_705_276_800_000,
        bars: 168, data_role: "OUTER_OOS_OBSERVATION" as const, child_input_state: "EXPOSED_TO_CHILD_TAPE" as const,
        evaluation_state: "P04_OBSERVED_AFTER_FIXED_PROFILE" as const,
      },
      holdout: {
        start_utc_ms: 1_705_276_800_000, end_exclusive_utc_ms: 1_705_881_600_000,
        bars: null, data_role: "HOLDOUT" as const, child_input_state: "NOT_EXPOSED_TO_CHILD_TAPE" as const,
        evaluation_state: "NOT_EVALUATED" as const, result_exposure_state: "NOT_EXPOSED" as const,
        snapshot_integrity_state: "P08_METADATA_BOUND" as const,
      },
    },
    absences: {
      purge: { state: "NOT_PUBLISHED" as const, reason_code: "P04_FIXED_PROFILE_DOES_NOT_PUBLISH_PURGE" },
      embargo: { state: "NOT_PUBLISHED" as const, reason_code: "P04_FIXED_PROFILE_DOES_NOT_PUBLISH_EMBARGO" },
      inner_folds: { state: "NOT_PUBLISHED" as const, reason_code: "P04_FIXED_PROFILE_DOES_NOT_PUBLISH_INNER_FOLDS" },
      theta_per_fold: { state: "NOT_PUBLISHED" as const, reason_code: "P04_FIXED_PROFILE_DOES_NOT_PUBLISH_THETA_PER_FOLD" },
      gap_scan: { state: "NOT_PUBLISHED" as const, reason_code: "P04_FIXED_PROFILE_DOES_NOT_PUBLISH_GAP_SCAN" },
      holdout_unlock: { state: "NOT_PUBLISHED" as const, reason_code: "DR01_HOLDOUT_UNLOCK_AUTHORITY_NOT_PUBLISHED" },
    },
  };
}
