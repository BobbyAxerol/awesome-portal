import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { ResearchReplayService } from "../src/research/replay.service";

const scope = { workspaceId: "p17-workspace", actorUserId: "p17-user" };

function evidenceFixture(pointCount = 120, options: {
  availability?: "AVAILABLE" | "NOT_PUBLISHED" | "PENDING_SOURCE_CALLBACK";
  sampling?: "FULL" | "EXTREMA_BUCKET_V1";
  marketOverview?: boolean;
} = {}) {
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
      ...(options.marketOverview ? {
        market_overview: {
          state: "AVAILABLE",
          reason_code: null,
          semantics: "BOUNDED_SOURCE_OVERVIEW_NOT_PER_BAR_REPLAY",
          data: {
            source_bar_count: 2,
            emitted_bucket_count: 2,
            bucket_bars: 1,
            sampling: "FULL",
            envelope: {
              max_high: "103", max_high_at_utc_ms: 1_725_000_060_000,
              min_low: "98", min_low_at_utc_ms: 1_725_000_000_000,
            },
            values: [
              {
                first_ordinal: 0, last_ordinal: 0,
                open_utc_ms: 1_725_000_000_000, close_utc_ms: 1_725_000_000_000,
                open: "100", high: "101", low: "98", close: "100", volume: "10", transitions: 0,
              },
              {
                first_ordinal: 1, last_ordinal: 1,
                open_utc_ms: 1_725_000_060_000, close_utc_ms: 1_725_000_060_000,
                open: "100", high: "103", low: "99", close: "102", volume: "12", transitions: 1,
              },
            ],
          },
          availability: { state: "AVAILABLE", reason_code: null },
        },
      } : {}),
    },
    metrics: [{ key: "TRADE_COUNT", value: "7", scope: "CHILD_TAPE", availability: {
      state: availability, reason_code: availability === "AVAILABLE" ? null : "P17_SOURCE_CALLBACK_PENDING",
    } }],
  };
  const series = {
    schema_version: "research.evidence-series.v1",
    run_id: "run_p17",
    revision: `p13r1_${"a".repeat(64)}`,
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
  return { hub, series, candleOverview: candleOverview(pointCount) };
}

/**
 * E16-R1 · the shape `ResearchEvidenceService.bundle` publishes for the
 * retained OHLC overview. Four true-extrema buckets over the same window the
 * equity samples cover, so a bucket ordinal and an OOS bar ordinal count the
 * same bars.
 */
function candleOverview(barCount: number) {
  if (barCount < 1) {
    return { state: "NOT_PUBLISHED" as const, reason_code: "P04_OOS_WINDOW_HAS_NO_PRICED_BAR", value: null };
  }
  const bucketBars = Math.ceil(barCount / 4);
  const values = Array.from({ length: Math.ceil(barCount / bucketBars) }, (_, index) => {
    const first = index * bucketBars;
    const last = Math.min(barCount, first + bucketBars) - 1;
    return {
      first_ordinal: first,
      last_ordinal: last,
      open_utc_ms: 1_725_000_000_000 + first * 60_000,
      close_utc_ms: 1_725_000_000_000 + last * 60_000,
      open: String(1_000 + first),
      high: String(1_100 + last),
      low: String(900 + first),
      close: String(1_000 + last),
      volume: "12.5",
      transitions: null,
    };
  });
  const lastBucket = values[values.length - 1]!;
  return {
    state: "AVAILABLE" as const,
    reason_code: null,
    value: {
      state: "AVAILABLE" as const,
      reason_code: null,
      scope: "OOS_EQUITY_WINDOW" as const,
      source_bar_count: barCount,
      emitted_bucket_count: values.length,
      bucket_bars: bucketBars,
      sampling: bucketBars === 1 ? "FULL" as const : "OHLC_BUCKET_V1" as const,
      envelope: {
        max_high: lastBucket.high,
        max_high_at_utc_ms: lastBucket.close_utc_ms,
        min_low: values[0]!.low,
        min_low_at_utc_ms: values[0]!.open_utc_ms,
      },
      values,
    },
  };
}

function evidenceReader(
  fixture: ReturnType<typeof evidenceFixture>,
  overview: unknown = fixture.candleOverview,
) {
  return {
    bundle: vi.fn().mockResolvedValue({
      hub: fixture.hub,
      series: new Map([["EQUITY_OOS", fixture.series]]),
      candleOverview: overview,
    }),
  };
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
  it("publishes only the Hub's verified binding and separate additive Replay presentation", async () => {
    const fixture = evidenceFixture(3);
    const bound = { ...fixture, hub: { ...fixture.hub, core: { ...fixture.hub.core, run_identity: {
      binding: { alpha_id: "alpha_p17", alpha_version_id: "av_p17", availability: { state: "AVAILABLE", reason_code: null } },
    } } } };
    const evidence = evidenceReader(bound);
    const service = new ResearchReplayService(evidence as never, enabledConfig() as never);
    const first = await service.detail(scope, "run_p17", { limit: 2 });
    expect(first.identity).toMatchObject({ alpha_id: "alpha_p17", alpha_version_id: "av_p17", availability: { state: "AVAILABLE" } });
    expect(first.is_window).toMatchObject({ bars: null, availability: { reason_code: "REPLAY_SEAL_PREDATES_WINDOW_METADATA" } });
    bound.hub.core.run_identity.binding.alpha_version_id = "av_other";
    const next = await service.detail(scope, "run_p17", { limit: 2 });
    expect(next.presentation_digest).not.toBe(first.presentation_digest);
    expect(next.revision).toBe(first.revision);
    expect(evidence.bundle).toHaveBeenCalledTimes(2);
  });
  it("reads imported retained equity with its own route identity, never as P04", async () => {
    const fixture = evidenceFixture(3);
    fixture.hub.core.source_adapter_id = "p17.imported-signal-notional.v1";
    const service = new ResearchReplayService(evidenceReader(fixture) as never, enabledConfig() as never);
    const result = await service.detail(scope, "run_p17", { limit: 2 });
    expect(result).toMatchObject({ availability: { state: "AVAILABLE" },
      provenance: { source_adapter_id: "p17.imported-signal-notional.v1" },
      route: { id: "signal_notional", replay_contract: "P17_IMPORTED_FIXED_EQUITY_SAMPLE_V1" },
      equity_replay: { state: "AVAILABLE" } });
    expect(result.equity_replay.items).toHaveLength(2);
    expect(result.execution).toBeUndefined();
    expect(result.equity_replay.page.next_cursor).toEqual(expect.any(String));
  });
  it("publishes all native fixed routes as sealed equity-only replay without inventing execution ledgers", async () => {
    const contractsRoot = process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts");
    const native = JSON.parse(readFileSync(join(contractsRoot, "fixtures/research-native-route-result.valid.json"), "utf8"));
    for (const route of ["intrabar_bracket", "reactive", "event_driven"] as const) {
      const fixture = evidenceFixture(3);
      const bound = {...fixture, hub: {...fixture.hub, core: {...fixture.hub.core,
        source_adapter_id: "full03.delta-rsi.v1", native_execution: {...native, execution_route: route}}}};
      const service = new ResearchReplayService(evidenceReader(bound) as never, enabledConfig() as never);
      const first = await service.detail(scope, "run_p17", {limit: 2});
      expect(first).toMatchObject({availability: {state: "AVAILABLE"}, revision: expect.any(String),
        route: {id: route, state: "RETROSPECTIVE_EQUITY_ONLY", replay_contract: "P17_NATIVE_FIXED_EQUITY_SAMPLE_V1"},
        equity_replay: {state: "AVAILABLE", items: [{equity: "100"}, {equity: "101"}]},
        route_capabilities: {fills: {state: "NOT_PUBLISHED", reason_code: "NATIVE_SOURCE_DID_NOT_PUBLISH_AUDITED_FILLS"}}});
      expect(first.execution).toBeUndefined();
      const next = await service.detail(scope, "run_p17", {limit: 2, cursor: first.equity_replay.page.next_cursor!});
      expect(next.equity_replay.items).toHaveLength(1);
      const missing = new ResearchReplayService(evidenceReader({...bound, hub: {...bound.hub,
        core: {...fixture.hub.core, source_adapter_id: "full03.delta-rsi.v1"}}}) as never, enabledConfig() as never);
      await expect(missing.detail(scope, "run_p17", {limit: 2})).resolves.toMatchObject({revision: null,
        availability: {state: "NOT_PUBLISHED", reason_code: "P17_SOURCE_ADAPTER_NOT_SUPPORTED"}});
    }
  });
  it("preserves exact source sample order and supports a direct late seek without compute, ledger synthesis or source-path access", async () => {
    const fixture = evidenceFixture(120, { marketOverview: true });
    const evidence = evidenceReader(fixture);
    const service = new ResearchReplayService(evidence as never, enabledConfig() as never);

    const first = await service.detail(scope, "run_p17", { limit: 10 });
    expect(first).toMatchObject({
      schema_version: "research.replay.v1",
      route: { id: "signal_notional", state: "RETROSPECTIVE_EQUITY_ONLY" },
      equity_replay: { state: "AVAILABLE", source_observation_count: 120, emitted_point_count: 120 },
      route_capabilities: { orders: { state: "NOT_PUBLISHED" }, fills: { state: "NOT_PUBLISHED" }, trades: { state: "NOT_PUBLISHED" }, positions: { state: "NOT_PUBLISHED" } },
      market_overview: {
        state: "AVAILABLE",
        semantics: "BOUNDED_SOURCE_OVERVIEW_NOT_PER_BAR_REPLAY",
        data: { emitted_bucket_count: 2, sampling: "FULL" },
      },
    });
    expect(first.execution?.counts).toMatchObject({
      bars: { value: 120, scope: "OOS_EQUITY_WINDOW", availability: { state: "AVAILABLE" } },
      trades_reported: { value: "7", scope: "CHILD_TAPE", availability: { state: "AVAILABLE" } },
      orders_published: { state: "NOT_PUBLISHED" },
      fills_published: { state: "NOT_PUBLISHED" },
      trades_published: { state: "NOT_PUBLISHED" },
      transitions: { state: "NOT_PUBLISHED" },
    });
    expect(first.route_capabilities.candle_windows).toMatchObject({
      state: "NOT_PUBLISHED",
      reason_code: "P04_SOURCE_DID_NOT_PUBLISH_REPLAY_CANDLE_WINDOWS",
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
    expect(evidence.bundle).toHaveBeenCalledWith(scope, "run_p17", ["EQUITY_OOS"]);
    expect(Object.keys(evidence)).toEqual(["bundle"]);
  });

  it("binds page/playhead cursors to the exact workspace, run and evidence revision and refuses cross-scope reuse", async () => {
    const fixture = evidenceFixture(20);
    const evidence = evidenceReader(fixture);
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
    const evidence = evidenceReader(fixture);
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
      market_overview: {
        state: "NOT_PUBLISHED",
        reason_code: "P04_SOURCE_PREDATES_E16_CANDLE_OVERVIEW",
        data: null,
      },
    });
  });

  it("keeps an otherwise available foreign/legacy evidence series typed as unsupported rather than exposing it or failing open", async () => {
    const fixture = evidenceFixture(3);
    fixture.hub.core.source_adapter_id = null;
    const evidence = evidenceReader(fixture);
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
    const service = new ResearchReplayService({ bundle: vi.fn() } as never, {
      ...enabledConfig(), FEATURE_RESEARCH_REPLAY: "false",
    } as never);
    await expect(service.detail(scope, "run_p17", { limit: 10 })).rejects.toMatchObject({
      code: "RESEARCH_REPLAY_UNAVAILABLE", status: 503,
    });
  });

  it("uses the stable at_ordinal locator without weakening cursor binding", async () => {
    const fixture = evidenceFixture(20);
    const service = new ResearchReplayService(evidenceReader(fixture) as never, enabledConfig() as never);
    const result = await service.detail(scope, "run_p17", { limit: 5, at_ordinal: 13 });
    expect(result.equity_replay.state_at_cursor).toMatchObject({ playback_ordinal: 13 });
  });

  it("returns a typed renewal/refetch error after cursor expiry while stable at_ordinal remains usable", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T00:00:00Z"));
    try {
      const fixture = evidenceFixture(20);
      const service = new ResearchReplayService(evidenceReader(fixture) as never, enabledConfig() as never);
      const first = await service.detail(scope, "run_p17", { limit: 5 });
      vi.setSystemTime(new Date("2025-01-01T00:16:00Z"));
      await expect(service.detail(scope, "run_p17", {
        limit: 5, cursor: first.equity_replay.page.next_cursor!,
      })).rejects.toMatchObject({ code: "RESEARCH_REPLAY_CURSOR_EXPIRED", status: 409 });
      await expect(service.detail(scope, "run_p17", { limit: 5, at_ordinal: 5 }))
        .resolves.toMatchObject({ equity_replay: { state_at_cursor: { playback_ordinal: 5 } } });
    } finally {
      vi.useRealTimers();
    }
  });

  it("E16-R1: serves the retained OHLC overview verbatim, with the true whole-window envelope", async () => {
    const fixture = evidenceFixture(20);
    const service = new ResearchReplayService(evidenceReader(fixture) as never, enabledConfig() as never);
    const result = await service.detail(scope, "run_p17", { limit: 5 });
    const overview = result.candle_overview;
    expect(overview.state).toBe("AVAILABLE");
    expect(overview.scope).toBe("OOS_EQUITY_WINDOW");
    expect(overview.sampling).toBe("OHLC_BUCKET_V1");
    expect(overview.reason_code).toBeNull();
    expect(overview.emitted_bucket_count).toBe(overview.values.length);
    // Not one bucket is rebuilt by this reader: the bytes are the sealed ones.
    expect(overview.values).toEqual(fixture.candleOverview.value.values);
    expect(Number(overview.envelope!.max_high)).toBe(Math.max(...overview.values.map((bucket) => Number(bucket.high))));
    expect(Number(overview.envelope!.min_low)).toBe(Math.min(...overview.values.map((bucket) => Number(bucket.low))));
    // The overview is a summary, so the per-bar ledger absence is unchanged.
    expect(result.route_capabilities.candle_windows).toMatchObject({
      state: "NOT_PUBLISHED", reason_code: "P04_SOURCE_DID_NOT_PUBLISH_REPLAY_CANDLE_WINDOWS",
    });
    expect(result.source_absences.candles.state).toBe("NOT_PUBLISHED");
    // Every bucket carries a null transition count rather than a fabricated 0.
    expect(overview.values.every((bucket) => bucket.transitions === null)).toBe(true);
  });

  it("E16-R1: a run sealed before the producer retained an overview keeps its own reason, never a backfill", async () => {
    const fixture = evidenceFixture(20);
    const service = new ResearchReplayService(
      evidenceReader(fixture, {
        state: "NOT_PUBLISHED",
        reason_code: "P13_SOURCE_PREDATES_RETAINED_CANDLE_OVERVIEW",
        value: null,
      }) as never,
      enabledConfig() as never,
    );
    const result = await service.detail(scope, "run_p17", { limit: 5 });
    expect(result.candle_overview).toMatchObject({
      state: "NOT_PUBLISHED",
      reason_code: "P13_SOURCE_PREDATES_RETAINED_CANDLE_OVERVIEW",
      scope: null,
      source_bar_count: null,
      emitted_bucket_count: null,
      bucket_bars: null,
      sampling: null,
      envelope: null,
      values: [],
    });
    // The equity replay is untouched by a missing overview.
    expect(result.equity_replay.state).toBe("AVAILABLE");
  });

  it("E16-R1: an unreadable evidence source gives the overview its own typed absence", async () => {
    const fixture = evidenceFixture(20, { availability: "PENDING_SOURCE_CALLBACK" });
    const service = new ResearchReplayService(evidenceReader(fixture) as never, enabledConfig() as never);
    const result = await service.detail(scope, "run_p17", { limit: 5 });
    expect(result.candle_overview).toMatchObject({
      state: "NOT_PUBLISHED",
      reason_code: "P13_EVIDENCE_NOT_READABLE_FOR_RETAINED_CANDLE_OVERVIEW",
      values: [],
    });
    expect(result.candle_overview.availability.state).toBe("PENDING_SOURCE_CALLBACK");
  });

  it("fails closed if a bundle tries to mix Hub and series revisions", async () => {
    const fixture = evidenceFixture(20);
    fixture.series.revision = `p13r1_${"d".repeat(64)}`;
    const service = new ResearchReplayService(evidenceReader(fixture) as never, enabledConfig() as never);
    await expect(service.detail(scope, "run_p17", { limit: 5 })).rejects.toMatchObject({
      code: "RESEARCH_REPLAY_UNAVAILABLE", status: 503,
    });
  });
});
