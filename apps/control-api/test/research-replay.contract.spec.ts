import { describe, expect, it } from "vitest";

import { ResearchReplayReadQuerySchema, ResearchReplayResponseSchema } from "../src/research/replay.contract";

const cursor = `kc1.query-k1.${"a".repeat(32)}.${"b".repeat(43)}`;

/** E16-R1: three contiguous true-extrema buckets over a six-bar window. */
function candleOverview() {
  const values = [0, 1, 2].map((index) => ({
    first_ordinal: index * 2,
    last_ordinal: index * 2 + 1,
    open_utc_ms: 1_725_000_000_000 + index * 2 * 60_000,
    close_utc_ms: 1_725_000_000_000 + (index * 2 + 1) * 60_000,
    open: "100",
    high: String(110 + index),
    low: String(90 - index),
    close: "105",
    volume: "12.5",
    transitions: null,
  }));
  return {
    state: "AVAILABLE" as const,
    reason_code: null,
    scope: "OOS_EQUITY_WINDOW" as const,
    source_bar_count: 6,
    emitted_bucket_count: 3,
    bucket_bars: 2,
    sampling: "OHLC_BUCKET_V1" as const,
    envelope: {
      max_high: "112",
      max_high_at_utc_ms: values[2]!.close_utc_ms,
      min_low: "88",
      min_low_at_utc_ms: values[2]!.open_utc_ms,
    },
    values,
    availability: { state: "AVAILABLE" as const, reason_code: null },
  };
}

describe("P17 route-aware Replay request and response contracts", () => {
  it("accepts only one bounded, opaque replay navigation input", () => {
    expect(ResearchReplayReadQuerySchema.parse({ workspace_id: "research.17", at: cursor, limit: "24" })).toEqual({
      workspace_id: "research.17", at: cursor, limit: 24,
    });
    for (const invalid of [
      { cursor, before: cursor },
      { cursor, at: cursor },
      { cursor, at_ordinal: 4 },
      { at: cursor, at_ordinal: 4 },
      { before: cursor, at: cursor },
      { limit: 101 },
      { limit: 0 },
      { cursor: "source-sequence-90" },
      { relation: "orders" },
      { route: "reactive" },
      { source_cursor: "private" },
      { artifact_path: "/private/artifact" },
      { compute: true },
    ]) expect(ResearchReplayReadQuerySchema.safeParse(invalid).success).toBe(false);
  });

  it("enforces that a selected playhead is an exact retrospective sample, never an execution state", () => {
    const routeCapabilities = Object.fromEntries([
      "orders", "fills", "trades", "positions", "execution_events", "candle_windows", "sl_tp_ambiguity", "oco_tree", "multi_leg", "funding", "mae_mfe", "fold_capital", "child_audit_provenance",
    ].map((key) => [key, {
      state: "NOT_PUBLISHED",
      reason_code: "P04_SOURCE_DID_NOT_PUBLISH_EXECUTION_EVENT_STREAM",
      availability: { state: "NOT_PUBLISHED", reason_code: "P04_SOURCE_DID_NOT_PUBLISH_EXECUTION_EVENT_STREAM" },
    }]));
    const response = {
      schema_version: "research.replay.v1",
      read_authority: "PORTAL_PERSISTED_RESEARCH",
      run_id: "run_p17",
      revision: `p17r1_${"a".repeat(64)}`,
      etag: `"p17r1_${"a".repeat(64)}"`,
      availability: { state: "AVAILABLE", reason_code: null },
      readiness: "PARTIAL",
      as_of_utc_ms: 1_726_000_000_000,
      provenance: {
        source_adapter_id: "p04.delta-rsi.v1",
        evidence_revision: `p13r1_${"b".repeat(64)}`,
        source_transform_digest: "c".repeat(64),
        input_scope: "P08_OPTIONAL_WARMUP_PLUS_IS_OOS_ONLY",
      },
      route: { id: "signal_notional", state: "RETROSPECTIVE_EQUITY_ONLY", replay_contract: "P17_CURRENT_P04_EQUITY_SAMPLE_V1", availability: { state: "AVAILABLE", reason_code: null } },
      equity_replay: {
        state: "AVAILABLE",
        source_observation_count: 3,
        emitted_point_count: 3,
        sampling: "FULL",
        items: [{ playback_ordinal: 0, at_utc_ms: 1_725_000_000_000, equity: "100", drawdown_fraction: "0", playback_cursor: cursor }],
        page: { limit: 1, next_cursor: cursor, prev_cursor: null, has_more: true, has_previous: false, order: "SOURCE_CHRONOLOGICAL_SAMPLE_ORDINAL_ASC" },
        state_at_cursor: {
          state: "AVAILABLE_RETROSPECTIVE_EQUITY_SAMPLE",
          semantics: "RETROSPECTIVE_EQUITY_NOT_EXECUTION_STATE",
          playback_ordinal: 0,
          at_utc_ms: 1_725_000_000_000,
          equity: "100",
          drawdown_fraction: "0",
          source_sampling: "FULL",
          execution_state: { state: "NOT_PUBLISHED", reason_code: "P04_SOURCE_DID_NOT_PUBLISH_EXECUTION_STATE_SNAPSHOTS", availability: { state: "NOT_PUBLISHED", reason_code: "P04_SOURCE_DID_NOT_PUBLISH_EXECUTION_STATE_SNAPSHOTS" } },
          availability: { state: "AVAILABLE", reason_code: null },
        },
        availability: { state: "AVAILABLE", reason_code: null },
      },
      candle_overview: candleOverview(),
      route_capabilities: routeCapabilities,
      source_absences: {},
    };
    expect(ResearchReplayResponseSchema.safeParse(response).success).toBe(true);
    expect(ResearchReplayResponseSchema.safeParse({
      ...response,
      equity_replay: {
        ...response.equity_replay,
        state_at_cursor: { ...response.equity_replay.state_at_cursor, semantics: "SOURCE_DID_NOT_PUBLISH_EXECUTION_STATE" },
      },
    }).success).toBe(false);
  });

  it("E16-R1: refuses a candle overview that loses an extreme, skips a bar or contradicts its own declaration", () => {
    const base = candleOverview();
    const parse = (overview: unknown) => ResearchReplayResponseSchema.shape.candle_overview.safeParse(overview).success;
    expect(parse(base)).toBe(true);

    // An envelope wider or narrower than the buckets it claims to summarise.
    expect(parse({ ...base, envelope: { ...base.envelope, max_high: "999" } })).toBe(false);
    expect(parse({ ...base, envelope: { ...base.envelope, min_low: "95" } })).toBe(false);
    // A bucket whose high does not bracket its own close: an interpolation.
    expect(parse({
      ...base,
      values: [{ ...base.values[0]!, close: "500" }, base.values[1]!, base.values[2]!],
    })).toBe(false);
    // A gap between buckets would let an unsummarised stretch pass as covered.
    expect(parse({ ...base, values: [base.values[0]!, base.values[2]!], emitted_bucket_count: 2 })).toBe(false);
    // The declared window must be covered end to end.
    expect(parse({ ...base, source_bar_count: 8 })).toBe(false);
    // FULL means one bar per bucket, and nothing else may claim it.
    expect(parse({ ...base, sampling: "FULL" })).toBe(false);
    // A count that does not match the buckets sent.
    expect(parse({ ...base, emitted_bucket_count: 2 })).toBe(false);
    // P04 publishes no execution ledger: a transition count would be invented.
    expect(parse({ ...base, values: [{ ...base.values[0]!, transitions: 0 }, base.values[1]!, base.values[2]!] })).toBe(false);

    // An absence carries a reason and no payload at all.
    const absent = {
      state: "NOT_PUBLISHED" as const,
      reason_code: "P13_SOURCE_PREDATES_RETAINED_CANDLE_OVERVIEW",
      scope: null, source_bar_count: null, emitted_bucket_count: null, bucket_bars: null,
      sampling: null, envelope: null, values: [],
      availability: { state: "NOT_PUBLISHED" as const, reason_code: "P13_SOURCE_PREDATES_RETAINED_CANDLE_OVERVIEW" },
    };
    expect(parse(absent)).toBe(true);
    expect(parse({ ...absent, reason_code: null })).toBe(false);
    expect(parse({ ...absent, values: base.values })).toBe(false);
    expect(parse({ ...absent, source_bar_count: 6 })).toBe(false);
    // An available overview never carries a reason instead of buckets.
    expect(parse({ ...base, reason_code: "P13_SOURCE_PREDATES_RETAINED_CANDLE_OVERVIEW" })).toBe(false);
  });
});
