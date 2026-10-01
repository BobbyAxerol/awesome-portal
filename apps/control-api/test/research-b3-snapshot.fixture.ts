/** Container-local copy of the P08 coverage facts used by the canonical contract fixture. */
const range = {
  start_utc: "2026-01-04T00:00:00+00:00",
  end_exclusive_utc: "2026-01-10T00:00:00+00:00",
  start_utc_ms: 1767484800000,
  end_exclusive_utc_ms: 1768003200000,
  bars: 144,
};

export const b3RetainedSnapshot = {
  snapshot_id: "dss_0123456789abcdef0123456789abcdef",
  snapshot_content_hash: "c".repeat(64),
  market_content_hash: "d".repeat(64),
  source_manifest_digest: "e".repeat(64),
  row_count: 336,
  byte_count: 16384,
  query: range,
  logical_range: range,
  warmup: { ...range, requested_bars: 0, state: "BOUNDARY_ONLY_NOT_FIT" },
  timezone: "UTC",
  calendar_policy: "CRYPTO_24_7",
  closed_bar_policy: "CLOSED_BARS_ONLY",
  columns: ["open", "high", "low", "close", "volume"],
  quality: {
    rows: 336,
    gaps: 0,
    duplicates: 0,
    gap_ratio: 0,
    passed: true,
    reason_codes: [],
    missing_bar_count: 0,
    state: "SNAPSHOT_INTEGRITY_ONLY",
  },
  provenance: { loader_contract: "hmd-loader-v1" },
};
