/** Minimal but internally reconciled P13 source receipt for contract tests. */
export function p13EvidenceSourceFixture() {
  return {
    schema_version: "research.p13.evidence-source.v1" as const,
    source: {
      execution_adapter_id: "p04.delta-rsi.v1" as const,
      engine_version: "1.1.1",
      input_scope: "P08_OPTIONAL_WARMUP_PLUS_IS_OOS_ONLY" as const,
      oos_observation_count: 3,
      emitted_equity_points: 3,
      chart_sampling: "FULL" as const,
      source_transform_digest: "a".repeat(64),
    },
    direct: { initial_equity: "100", final_equity: "110", num_trades: "2", bars: "24" },
    derived: {
      net_return_fraction: "0.1",
      max_drawdown_fraction: "-0.02",
      monthly_returns: [{ month_start_utc_ms: 1_725_000_000_000, return_fraction: "0.1" }],
      rolling_returns_20_observations: [],
      return_distribution: {
        state: "NOT_APPLICABLE" as const,
        reason_code: "P04_RETURN_DISTRIBUTION_ZERO_VARIANCE",
        buckets: [],
      },
    },
    equity_points: [
      { at_utc_ms: 1_725_000_000_000, equity: "100", drawdown_fraction: "0" },
      { at_utc_ms: 1_725_000_060_000, equity: "98", drawdown_fraction: "-0.02" },
      { at_utc_ms: 1_725_000_120_000, equity: "110", drawdown_fraction: "0" },
    ],
    unavailable: {
      benchmark: { state: "NOT_PUBLISHED" as const, reason_code: "P04_SOURCE_DID_NOT_PUBLISH_BENCHMARK" },
      funding: { state: "NOT_PUBLISHED" as const, reason_code: "P04_SOURCE_DID_NOT_PUBLISH_FUNDING" },
      audited_fills: { state: "NOT_PUBLISHED" as const, reason_code: "P04_SOURCE_DID_NOT_PUBLISH_AUDITED_FILLS" },
      per_fold_metrics: { state: "NOT_PUBLISHED" as const, reason_code: "P04_SOURCE_DID_NOT_PUBLISH_PER_FOLD_METRICS" },
    },
  };
}

/**
 * RF-05 · two real P13 child receipts (QuantBT 1.1.1, P04 fixed profile,
 * BTCUSDT 1h from the read-only historical store) carrying `oos_analytics`.
 * Regenerate only from `research_child._p13_evidence_source`; never by hand.
 */
export function p13RealReceiptFixture(name: "four_month_oos" | "one_month_oos"): Record<string, any> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const document = require("./research-evidence-oos-analytics.fixture.json") as Record<string, { receipt: Record<string, any> }>;
  return structuredClone(document[name]!.receipt);
}
