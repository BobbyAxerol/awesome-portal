import { describe, expect, it, vi } from "vitest";

import { ResearchReplayService } from "../src/research/replay.service";

const scope = { workspaceId: "p17-workspace", actorUserId: "p17-user" };

function evidenceFixture(pointCount = 120, options: { availability?: "AVAILABLE" | "NOT_PUBLISHED" | "PENDING_SOURCE_CALLBACK"; sampling?: "FULL" | "EXTREMA_BUCKET_V1" } = {}) {
  const availability = options.availability ?? "AVAILABLE";
  const sampling = options.sampling ?? "FULL";
  const values = availability === "AVAILABLE"
    ? Array.from({ length: pointCount }, (_, index) => ({
      at_utc_ms: 1_725_000_000_000 + index * 60_000,
      equity: String(100 + index),
      drawdown_fraction: index % 5 === 0 ? "-0.01" : "0",
    }))
    : [];
  const hub = {
    schema_version: "research.evidence-hub.v1",
    run_id: "run_p17",
    revision: `p13r1_${"a".repeat(64)}`,
    as_of_utc_ms: 1_726_000_000_000,
    availability: {
      state: availability,
      reason_code: availability === "AVAILABLE" ? null : "P17_SOURCE_CALLBACK_PENDING",
    },
    core: {
      source_adapter_id: "p04.delta-rsi.v1",
      source_transform_digest: "b".repeat(64),
      input_scope: "P08_OPTIONAL_WARMUP_PLUS_IS_OOS_ONLY",
    },
  };
  const series = {
    schema_version: "research.evidence-series.v1",
    run_id: "run_p17",
    revision: `p13r1_${"c".repeat(64)}`,
    kind: "EQUITY_OOS",
    availability: {
      state: availability,
      reason_code: availability === "AVAILABLE" ? null : "P17_SOURCE_CALLBACK_PENDING",
    },
    source_sample: {
      source_observation_count: availability === "AVAILABLE" ? pointCount : null,
      emitted_point_count: values.length,
      sampling: availability === "AVAILABLE" ? sampling : null,
    },
    values,
  };
  return { hub, series };
}

function enabledConfig() {
  return {
    FEATURE_RESEARCH_REPLAY: "true",
    QUERY_CURSOR_ACTIVE_KEY_ID: "query-k1",
    QUERY_CURSOR_KEYS_JSON: '{"query-k1":"research-replay-test-signing-key-at-least-thirty-two-bytes"}',
    QUERY_CURSOR_TTL_SECONDS: 900,
  };
}

describe("P17 route-aware, current-source replay authority", () => {
  it("preserves exact source sample order and supports a direct late seek without compute, ledger synthesis or source-path access", async () => {
    const fixture = evidenceFixture();
    const evidence = { hub: vi.fn().mockResolvedValue(fixture.hub), series: vi.fn().mockResolvedValue(fixture.series) };
    const service = new ResearchReplayService(evidence as never, enabledConfig() as never);

    const first = await service.detail(scope, "run_p17", { limit: 10 });
    expect(first).toMatchObject({
      schema_version: "research.replay.v1",
      route: { id: "signal_notional", state: "RETROSPECTIVE_EQUITY_ONLY" },
      equity_replay: { state: "AVAILABLE", source_observation_count: 120, emitted_point_count: 120 },
      route_capabilities: { orders: { state: "NOT_PUBLISHED" }, fills: { state: "NOT_PUBLISHED" }, trades: { state: "NOT_PUBLISHED" }, positions: { state: "NOT_PUBLISHED" } },
    });
    expect(first.equity_replay.items.map((item) => item.playback_ordinal)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(JSON.stringify(first)).not.toMatch(/worker_attempt_id|lease_epoch|artifact_path|raw_ohlcv|compute|order_id|fill_id/);

    let page = first;
    for (let index = 0; index < 9; index += 1) {
      page = await service.detail(scope, "run_p17", { limit: 10, cursor: page.equity_replay.page.next_cursor! });
    }
    const late = page.equity_replay.items[0]!;
    expect(late.playback_ordinal).toBe(90);
    const sought = await service.detail(scope, "run_p17", { limit: 9, at: late.playback_cursor });
    expect(sought.equity_replay.state_at_cursor).toMatchObject({
      state: "AVAILABLE_RETROSPECTIVE_EQUITY_SAMPLE",
      semantics: "RETROSPECTIVE_EQUITY_NOT_EXECUTION_STATE",
      playback_ordinal: 90,
      at_utc_ms: late.at_utc_ms,
      equity: late.equity,
      execution_state: { state: "NOT_PUBLISHED" },
    });
    expect(sought.equity_replay.items.map((item) => item.playback_ordinal)).toContain(90);
    // Both operations are bounded P13 reads; P17 owns no worker/compute API.
    expect(evidence.hub).toHaveBeenCalled();
    expect(evidence.series).toHaveBeenCalledWith(scope, "run_p17", "EQUITY_OOS");
    expect(Object.keys(evidence)).toEqual(["hub", "series"]);
  });

  it("binds page/playhead cursors to the exact workspace, run and evidence revision and refuses cross-scope reuse", async () => {
    const fixture = evidenceFixture(20);
    const evidence = { hub: vi.fn().mockResolvedValue(fixture.hub), series: vi.fn().mockResolvedValue(fixture.series) };
    const service = new ResearchReplayService(evidence as never, enabledConfig() as never);
    const first = await service.detail(scope, "run_p17", { limit: 5 });
    await expect(service.detail({ ...scope, workspaceId: "other-workspace" }, "run_p17", {
      limit: 5, at: first.equity_replay.items[0]!.playback_cursor,
    })).rejects.toMatchObject({ code: "RESEARCH_REPLAY_CURSOR_INVALID", status: 400 });
    await expect(service.detail(scope, "run_p17", {
      limit: 5, cursor: first.equity_replay.items[0]!.playback_cursor,
    })).rejects.toMatchObject({ code: "RESEARCH_REPLAY_CURSOR_INVALID", status: 400 });
  });

  it("returns current-source absences rather than inventing execution history when a terminal receipt has no replay series", async () => {
    const fixture = evidenceFixture(0, { availability: "NOT_PUBLISHED" });
    const evidence = { hub: vi.fn().mockResolvedValue(fixture.hub), series: vi.fn().mockResolvedValue(fixture.series) };
    const service = new ResearchReplayService(evidence as never, enabledConfig() as never);
    const result = await service.detail(scope, "run_p17", { limit: 10 });
    expect(result).toMatchObject({
      revision: null,
      readiness: "NOT_READY",
      availability: { state: "NOT_PUBLISHED", reason_code: "P17_SOURCE_CALLBACK_PENDING" },
      route: { state: "NOT_PUBLISHED", replay_contract: null },
      equity_replay: { state: "NOT_PUBLISHED", items: [], state_at_cursor: { state: "NOT_PUBLISHED" } },
      source_absences: {
        order_ledger: { state: "NOT_PUBLISHED" },
        cross_stream_order: { state: "NOT_ASSERTED" },
      },
    });
  });

  it("keeps an otherwise available foreign/legacy evidence series typed as unsupported rather than exposing it or failing open", async () => {
    const fixture = evidenceFixture(3);
    fixture.hub.core.source_adapter_id = null;
    const evidence = { hub: vi.fn().mockResolvedValue(fixture.hub), series: vi.fn().mockResolvedValue(fixture.series) };
    const service = new ResearchReplayService(evidence as never, enabledConfig() as never);
    await expect(service.detail(scope, "run_p17", { limit: 10 })).resolves.toMatchObject({
      revision: null,
      readiness: "NOT_READY",
      availability: { state: "NOT_PUBLISHED", reason_code: "P17_SOURCE_ADAPTER_NOT_SUPPORTED" },
      route: { id: null, state: "NOT_PUBLISHED", replay_contract: null },
      equity_replay: { state: "NOT_PUBLISHED", items: [] },
    });
  });

  it("fails closed while the independently deployed P17 reader is dark", async () => {
    const service = new ResearchReplayService({ hub: vi.fn(), series: vi.fn() } as never, {
      ...enabledConfig(), FEATURE_RESEARCH_REPLAY: "false",
    } as never);
    await expect(service.detail(scope, "run_p17", { limit: 10 })).rejects.toMatchObject({
      code: "RESEARCH_REPLAY_UNAVAILABLE", status: 503,
    });
  });
});
