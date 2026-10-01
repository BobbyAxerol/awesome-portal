/** Local Control API fixture: this test package is copied without contracts/fixtures in the hook cell. */
export const p13WindowTopology = {
  protocol: "three_window_decay" as const,
  folds: [{
    fold_id: "fold_000",
    train: {
      start_utc: "2026-01-04T00:00:00+00:00", end_exclusive_utc: "2026-01-10T00:00:00+00:00",
      start_utc_ms: 1_767_484_800_000, end_exclusive_utc_ms: 1_768_003_200_000, bars: 144,
    },
    outer_oos: {
      start_utc: "2026-01-10T00:00:00+00:00", end_exclusive_utc: "2026-01-14T00:00:00+00:00",
      start_utc_ms: 1_768_003_200_000, end_exclusive_utc_ms: 1_768_348_800_000, bars: 96,
    },
    state: "BOUNDARY_FIXED_NOT_EVALUATED" as const,
  }],
  sealed_holdout: {
    start_utc: "2026-01-14T00:00:00+00:00", end_exclusive_utc: "2026-01-18T00:00:00+00:00",
    start_utc_ms: 1_768_348_800_000, end_exclusive_utc_ms: 1_768_694_400_000, bars: 96,
    snapshot_read_state: "OPAQUE_SNAPSHOT_ONLY" as const,
    evaluation_state: "NOT_EVALUATED" as const,
    disclosure: "Snapshot integrity metadata only; no raw sealed-holdout values are returned.",
  },
  topology_digest: "a".repeat(64),
};
