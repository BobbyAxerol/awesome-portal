import { describe, expect, it } from "vitest";

import { ResearchReplayReadQuerySchema, ResearchReplayResponseSchema } from "../src/research/replay.contract";

const cursor = `kc1.query-k1.${"a".repeat(32)}.${"b".repeat(43)}`;

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
});
