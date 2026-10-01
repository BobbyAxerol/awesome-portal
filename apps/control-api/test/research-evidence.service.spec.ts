import { describe, expect, it, vi } from "vitest";

import { ResearchEvidenceService } from "../src/research/evidence.service";
import { sha256ResearchJson } from "../src/research/preflight.service";
import type { ResearchProgressIngress } from "../src/research/progress.contract";
import { p13EvidenceSourceFixture } from "./research-evidence.fixture";
import { b3RetainedSnapshot } from "./research-b3-snapshot.fixture";
import { p13WindowTopology } from "./research-evidence-window-disclosure.fixture";

const scope = { workspaceId: "p13-workspace", actorUserId: "p13-user" };
const ingressScope = { ...scope, jobId: "job_p13", workerAttemptId: "attempt_p13", leaseEpoch: 1 };

function candleOverview() {
  return {
    source_bar_count: 3,
    emitted_bucket_count: 2,
    bucket_bars: 2,
    sampling: "OHLC_BUCKET_V1" as const,
    envelope: {
      max_high: "103", max_high_at_utc_ms: 1_725_000_060_000,
      min_low: "98", min_low_at_utc_ms: 1_725_000_000_000,
    },
    values: [
      {
        first_ordinal: 0, last_ordinal: 1,
        open_utc_ms: 1_725_000_000_000, close_utc_ms: 1_725_000_060_000,
        open: "100", high: "103", low: "98", close: "102", volume: "25", transitions: 1,
      },
      {
        first_ordinal: 2, last_ordinal: 2,
        open_utc_ms: 1_725_000_120_000, close_utc_ms: 1_725_000_120_000,
        open: "102", high: "102", low: "101", close: "101", volume: null, transitions: 0,
      },
    ],
  };
}

function requestedSpec(seed: number | null = 42) {
  return {
    schema_version: "research.requested-spec.v1" as const,
    alpha_binding: { alpha_id: "alpha-p13", alpha_version_id: "av_p13" },
    not_publishable: false,
    strategy_id: "strategy-p13",
    execution_route: "signal_notional" as const,
    route_params: {},
    data: { dataset_id: "ds_p13", symbol: "BTCUSDT", timeframe: "1h" },
    protocol: "advanced" as const,
    walk_forward: {
      start: "2025-01-01T00:00:00Z", end_exclusive: "2025-02-01T00:00:00Z",
      split_mode: "rolling", frequency: "weekly", window_mode: "expanding",
    },
    optimization_mode: "mode_p13",
    optimization_schedule: "schedule_p13",
    parameter_space_overrides: [],
    optuna_trials: 12,
    early_stopping: null,
    random_seed: seed,
    optimization_config: {},
    client: { engine_release_id: "er_quantbt_1_1_1", config_digest: "e".repeat(64) },
  };
}

function progressSnapshot(folds: number[]) {
  return {
    schema_version: "research.progress-snapshot.v1" as const,
    run_id: "run_p13",
    attempt_id: "attempt_p13",
    lease_epoch: 1,
    status: "COMPLETED" as const,
    created_at_utc_ms: 1_725_000_000_000,
    updated_at_utc_ms: 1_725_000_120_000,
    latest_sequence: 9,
    retention_floor_sequence: 0,
    stages: ["S1", "S2", "S3", "S4", "S5"].map((key) => ({
      key, state: "DONE" as const, started_at_utc_ms: 1_725_000_000_000, completed_at_utc_ms: 1_725_000_120_000,
    })),
    overall: { pct: 100, elapsed_s: 120, eta_s: null, trials_done: 12, trials_declared: 12, tqdm_line: "complete" },
    budget: { used: "2", cap: null, unit: "core-min" as const, pct: 100 },
    folds: folds.map((fold) => ({
      fold, state: "DONE" as const, started_at_utc_ms: 1_725_000_000_000, completed_at_utc_ms: 1_725_000_120_000,
    })),
    artifacts: [],
    claim: { state: "ISSUED" as const, text: "evidence claim", cursor: null },
    readiness: { mandatory: "SEALED" as const, optional: "NOT_APPLICABLE" as const },
    failure: null,
    source: { kind: "DURABLE_P10" as const, coverage: "ACTUAL_HOOKS" as const, partial: false },
  };
}

describe("P13 Evidence Flow projection authority", () => {
  it.each(["CANONICAL", "LEGACY", "CORRUPT"] as const)(
    "keeps %s overview compatibility and isolates the canonical block behind the revision fence",
    async (shape) => {
      const raw = candleOverview();
      const canonical = {
        ...raw, state: "AVAILABLE", reason_code: null, scope: "OOS_EQUITY_WINDOW",
        values: raw.values.map((bucket) => ({ ...bucket, transitions: null })),
      };
      const evidence = { ...p13EvidenceSourceFixture(), candle_overview: shape === "LEGACY" ? raw : canonical };
      const persist = vi.fn().mockResolvedValue(undefined);
      const repository = { persist, inputBinding: vi.fn().mockResolvedValue(null), bundle: vi.fn() };
      const service = new ResearchEvidenceService(repository as never, { FEATURE_RESEARCH_EVIDENCE: "true" } as never);
      await service.ingest(ingressScope, {
        run_id: "run_p13",
        event: { event_type: "run_completed", sequence: 9, payload: { evidence_digest: sha256ResearchJson(evidence) } },
        evidence,
      } as unknown as ResearchProgressIngress);
      const write = persist.mock.calls[0]![1];
      const projection = shape === "CORRUPT"
        ? { ...write.projection, candle_overview: { ...canonical, emitted_bucket_count: 49 } }
        : write.projection;
      repository.bundle.mockResolvedValue({
        hub: {
          kind: "DURABLE", runId: "run_p13", requestedSpec: requestedSpec(),
          requestedSpecDigest: "a".repeat(64), effectiveSpecDigest: "b".repeat(64),
          datasetBindingDigest: "c".repeat(64), manifestDigest: "d".repeat(64),
          progressSnapshot: null, jobState: "SUCCEEDED", revision: write.projectionRevision,
          projection, readiness: write.readiness, sourceEvidenceDigest: write.sourceEvidenceDigest,
          receivedAt: new Date(), asOfUtcMs: 1_725_000_000_000,
        }, series: new Map(),
      });
      const bundle = await service.bundle(scope, "run_p13", []);
      expect(bundle.hub.availability.state).toBe("AVAILABLE");
      expect(bundle.hub.source_absences.per_fold_metrics).toEqual({
        state: "NOT_APPLICABLE", reason_code: "P04_SINGLE_WINDOW_HAS_NO_PER_FOLD_METRICS",
      });
      if (shape === "CORRUPT") {
        expect(bundle.candleOverview).toEqual({
          state: "NOT_PUBLISHED", reason_code: "P13_RETAINED_CANDLE_OVERVIEW_IS_INCOMPATIBLE", value: null,
        });
        expect(bundle.hub.core.market_overview?.data).toBeNull();
      } else {
        expect(bundle.candleOverview.value).toEqual(canonical);
        expect(bundle.candleOverview.value?.values.every((bucket) => bucket.transitions === null)).toBe(true);
        expect(write.projection.candle_overview).toEqual(evidence.candle_overview);
        expect(bundle.hub.core.market_overview?.data?.values[0]?.transitions).toBe(shape === "LEGACY" ? 1 : null);
      }
    },
  );

  it("binds a terminal source receipt to its digest and persists bounded lazy vectors", async () => {
    const persist = vi.fn().mockResolvedValue(undefined);
    const repository = { persist, inputBinding: vi.fn().mockResolvedValue(null), hub: vi.fn(), series: vi.fn() };
    const service = new ResearchEvidenceService(repository as never, { FEATURE_RESEARCH_EVIDENCE: "true" } as never);
    const evidence = p13EvidenceSourceFixture();
    const digest = sha256ResearchJson(evidence);

    await service.ingest(ingressScope, {
      run_id: "run_p13",
      event: { event_type: "run_completed", sequence: 9, payload: { evidence_digest: digest } },
      evidence,
    } as unknown as ResearchProgressIngress);

    const write = persist.mock.calls[0]?.[1];
    expect(write.sourceEvidenceDigest).toBe(digest);
    expect(write.projectionRevision).toMatch(/^p13r1_[0-9a-f]{64}$/);
    expect(write.series).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "EQUITY_OOS", emittedPointCount: 3, availabilityState: "AVAILABLE" }),
      expect.objectContaining({ kind: "ROLLING_RETURNS_20", emittedPointCount: 0, availabilityState: "NOT_APPLICABLE" }),
    ]));

    await expect(service.ingest(ingressScope, {
      run_id: "run_p13",
      event: { event_type: "run_completed", sequence: 9, payload: { evidence_digest: "0".repeat(64) } },
      evidence,
    } as unknown as ResearchProgressIngress)).rejects.toMatchObject({ code: "RESEARCH_EVIDENCE_CONFLICT", status: 409 });
  });

  it("persists and publishes the bounded E16 market overview without upgrading it to a replay tape", async () => {
    const evidence = { ...p13EvidenceSourceFixture(), candle_overview: candleOverview() };
    const digest = sha256ResearchJson(evidence);
    const persist = vi.fn().mockResolvedValue(undefined);
    const repository = { persist, inputBinding: vi.fn().mockResolvedValue(null), hub: vi.fn(), series: vi.fn() };
    const service = new ResearchEvidenceService(repository as never, { FEATURE_RESEARCH_EVIDENCE: "true" } as never);
    await service.ingest(ingressScope, {
      run_id: "run_p13", event: { event_type: "run_completed", sequence: 9, payload: { evidence_digest: digest } }, evidence,
    } as unknown as ResearchProgressIngress);
    const write = persist.mock.calls[0]?.[1];
    expect(write.projection.candle_overview).toEqual(candleOverview());
    repository.hub.mockResolvedValue({
      kind: "DURABLE", runId: "run_p13",
      requestedSpec: { data: { dataset_id: "ds_p13", symbol: "BTCUSDT", timeframe: "1h" } },
      requestedSpecDigest: "a".repeat(64), effectiveSpecDigest: "b".repeat(64),
      datasetBindingDigest: "c".repeat(64), manifestDigest: "d".repeat(64),
      progressSnapshot: null, jobState: "SUCCEEDED", revision: write.projectionRevision,
      projection: write.projection, readiness: write.readiness,
      sourceEvidenceDigest: digest, receivedAt: new Date(), asOfUtcMs: 1_725_000_000_000,
    });
    await expect(service.hub(scope, "run_p13")).resolves.toMatchObject({
      core: {
        market_overview: {
          state: "AVAILABLE",
          semantics: "BOUNDED_SOURCE_OVERVIEW_NOT_PER_BAR_REPLAY",
          data: candleOverview(),
          availability: { state: "AVAILABLE", reason_code: null },
        },
      },
    });
  });

  it("maps an immutable projection into direct/derived metrics and typed source gaps", async () => {
    const evidence = p13EvidenceSourceFixture();
    const digest = sha256ResearchJson(evidence);
    const persist = vi.fn().mockResolvedValue(undefined);
    const repository = { persist, inputBinding: vi.fn().mockResolvedValue(null), hub: vi.fn(), series: vi.fn() };
    const service = new ResearchEvidenceService(repository as never, { FEATURE_RESEARCH_EVIDENCE: "true" } as never);
    await service.ingest(ingressScope, {
      run_id: "run_p13", event: { event_type: "run_completed", sequence: 9, payload: { evidence_digest: digest } }, evidence,
    } as unknown as ResearchProgressIngress);
    const write = persist.mock.calls[0]?.[1];
    repository.hub.mockResolvedValue({
      kind: "DURABLE", runId: "run_p13", requestedSpec: { data: { dataset_id: "ds_p13", symbol: "BTCUSDT", timeframe: "1h" } },
      requestedSpecDigest: "a".repeat(64), effectiveSpecDigest: "b".repeat(64), datasetBindingDigest: "c".repeat(64),
      manifestDigest: "d".repeat(64), progressSnapshot: null, jobState: "SUCCEEDED",
      revision: write.projectionRevision, projection: write.projection, readiness: write.readiness,
      sourceEvidenceDigest: digest, receivedAt: new Date(), asOfUtcMs: 1_725_000_000_000,
    });

    const hub = await service.hub(scope, "run_p13");
    expect(hub.availability).toEqual({ state: "AVAILABLE", reason_code: null });
    expect(hub.metrics.find((item) => item.key === "FINAL_EQUITY")).toMatchObject({ value: "110", origin: "ENGINE_DIRECT" });
    expect(hub.metrics.find((item) => item.key === "BENCHMARK_RETURN_FRACTION")).toMatchObject({
      value: null, availability: { state: "NOT_PUBLISHED", reason_code: "P04_SOURCE_DID_NOT_PUBLISH_BENCHMARK" },
    });
    expect(hub.series.find((item) => item.kind === "ROLLING_RETURNS_20")).toMatchObject({
      availability: { state: "NOT_APPLICABLE", reason_code: "P04_OOS_OBSERVATIONS_BELOW_ROLLING_WINDOW" },
    });
    expect(hub.core.market_overview).toMatchObject({
      state: "NOT_PUBLISHED",
      reason_code: "P04_SOURCE_PREDATES_E16_CANDLE_OVERVIEW",
      data: null,
    });
  });

  it("publishes one Hub-owned run header and an observed fold selector without a second screen read", async () => {
    const evidence = p13EvidenceSourceFixture();
    const digest = sha256ResearchJson(evidence);
    const persist = vi.fn().mockResolvedValue(undefined);
    const repository = { persist, inputBinding: vi.fn().mockResolvedValue(null), hub: vi.fn(), series: vi.fn() };
    const service = new ResearchEvidenceService(repository as never, { FEATURE_RESEARCH_EVIDENCE: "true" } as never);
    await service.ingest(ingressScope, {
      run_id: "run_p13", event: { event_type: "run_completed", sequence: 9, payload: { evidence_digest: digest } }, evidence,
    } as unknown as ResearchProgressIngress);
    const write = persist.mock.calls[0]?.[1];
    const row = {
      kind: "DURABLE" as const, runId: "run_p13",
      runState: "READY", runCreatedAtUtcMs: 1_725_000_000_000,
      alphaId: "alpha-p13", alphaName: "P13 Alpha", alphaVersionId: "av_p13",
      requestedSpec: requestedSpec(), preflightSnapshot: b3RetainedSnapshot,
      preflightTopology: p13WindowTopology,
      requestedSpecDigest: "a".repeat(64), effectiveSpecDigest: "b".repeat(64), datasetBindingDigest: "c".repeat(64),
      manifestDigest: "d".repeat(64), progressSnapshot: progressSnapshot([1, 2, 3]), jobState: "SUCCEEDED",
      revision: write.projectionRevision, projection: write.projection, readiness: write.readiness,
      sourceEvidenceDigest: digest, receivedAt: new Date(), asOfUtcMs: 1_725_000_000_000,
    };
    repository.hub.mockResolvedValue(row);

    const first = await service.hub(scope, "run_p13");
    /* D1: the Hub carries the short run label; this row has none derived, and
       `null` is the honest answer that makes the screen print the short id. */
    expect(first.core.run_identity?.display_label).toBeNull();
    expect(first.core.window_disclosure).toMatchObject({
      availability: { state: "AVAILABLE" }, is_bars: 144, oos_bars: 96,
      holdout_bars: { state: "DENIED", value: null },
    });
    expect(first.core.dataset_coverage).toMatchObject({ availability: { state: "AVAILABLE" }, range_scope: "FULL_SNAPSHOT_QUERY", rows: 336, gaps: 0 });
    repository.hub.mockResolvedValue({ ...row, displayLabel: "R-WFO-118" });
    expect((await service.hub(scope, "run_p13")).core.run_identity?.display_label).toBe("R-WFO-118");
    repository.hub.mockResolvedValue(row);
    expect(first.core.run_identity).toMatchObject({
      status: { value: "READY", availability: { state: "AVAILABLE" } },
      binding: { alpha_id: "alpha-p13", alpha_name: "P13 Alpha", alpha_version_id: "av_p13", availability: { state: "AVAILABLE" } },
      created_at_utc_ms: { value: 1_725_000_000_000, availability: { state: "AVAILABLE" } },
      mode: { value: "mode_p13", availability: { state: "AVAILABLE" } },
      schedule: { value: "schedule_p13", availability: { state: "AVAILABLE" } },
      route: {
        id: { value: "signal_notional", availability: { state: "AVAILABLE" } },
        contract: { value: null, availability: { state: "NOT_PUBLISHED", reason_code: "P13_ROUTE_CONTRACT_NOT_PUBLISHED" } },
      },
      config_digest: { value: "e".repeat(64), availability: { state: "AVAILABLE" } },
      seed: { value: 42, availability: { state: "AVAILABLE" } },
    });
    expect(first.core.fold_navigation).toEqual({
      observed_folds: [1, 2, 3], published_fold_count: 3, availability: { state: "AVAILABLE", reason_code: null },
    });
    expect(first.etag).toMatch(/^W\/"p13h1_[0-9a-f]{64}"$/);

    repository.hub.mockResolvedValue({ ...row, progressSnapshot: progressSnapshot([1, 2, 3, 4]) });
    const changed = await service.hub(scope, "run_p13");
    expect(changed.revision).toBe(first.revision);
    expect(changed.etag).not.toBe(first.etag);
    expect(changed.core.fold_navigation).toMatchObject({ observed_folds: [1, 2, 3, 4], published_fold_count: 4 });
  });

  it("keeps an unannounced complete fold topology typed absent rather than inventing a bound", async () => {
    const evidence = p13EvidenceSourceFixture();
    const digest = sha256ResearchJson(evidence);
    const persist = vi.fn().mockResolvedValue(undefined);
    const repository = { persist, inputBinding: vi.fn().mockResolvedValue(null), hub: vi.fn(), series: vi.fn() };
    const service = new ResearchEvidenceService(repository as never, { FEATURE_RESEARCH_EVIDENCE: "true" } as never);
    await service.ingest(ingressScope, {
      run_id: "run_p13", event: { event_type: "run_completed", sequence: 9, payload: { evidence_digest: digest } }, evidence,
    } as unknown as ResearchProgressIngress);
    const write = persist.mock.calls[0]?.[1];
    repository.hub.mockResolvedValue({
      kind: "DURABLE", runId: "run_p13",
      runState: "READY", runCreatedAtUtcMs: 1_725_000_000_000,
      alphaId: "alpha-p13", alphaName: "P13 Alpha", alphaVersionId: "av_p13",
      requestedSpec: requestedSpec(null),
      requestedSpecDigest: "a".repeat(64), effectiveSpecDigest: "b".repeat(64), datasetBindingDigest: "c".repeat(64),
      manifestDigest: "d".repeat(64), progressSnapshot: progressSnapshot([]), jobState: "SUCCEEDED",
      revision: write.projectionRevision, projection: write.projection, readiness: write.readiness,
      sourceEvidenceDigest: digest, receivedAt: new Date(), asOfUtcMs: 1,
    });
    const hub = await service.hub(scope, "run_p13");
    expect(hub.core.fold_navigation).toEqual({
      observed_folds: [], published_fold_count: null,
      availability: { state: "NOT_PUBLISHED", reason_code: "P13_PROGRESS_FOLD_SET_NOT_PUBLISHED" },
    });
    expect(hub.core.run_identity?.seed).toEqual({
      value: null, availability: { state: "NOT_APPLICABLE", reason_code: "P02_RANDOM_SEED_NOT_SELECTED" },
    });
  });

  it("changes immutable projection identity when only a retained series changes", async () => {
    const persist = vi.fn().mockResolvedValue(undefined);
    const repository = { persist, inputBinding: vi.fn().mockResolvedValue(null), hub: vi.fn(), series: vi.fn(), bundle: vi.fn() };
    const service = new ResearchEvidenceService(repository as never, { FEATURE_RESEARCH_EVIDENCE: "true" } as never);
    const first = p13EvidenceSourceFixture();
    const corrected = {
      ...first,
      source: {
        ...first.source,
        evidence_transform_revision: "P13_SOURCE_R2" as const,
        direct_metric_scopes: {
          initial_equity: "OOS_EQUITY_SERIES" as const,
          final_equity: "OOS_EQUITY_SERIES" as const,
          num_trades: "FULL_CHILD_TAPE" as const,
          bars: "FULL_CHILD_TAPE" as const,
        },
        series_metadata: {
          equity_oos: { source_observation_count: 3, emitted_point_count: 3, sampling: "FULL" as const },
          monthly_returns: { source_observation_count: 3, emitted_point_count: 1, total_period_count: 1, omitted_leading_period_count: 1, omitted_transport_period_count: 0, sampling: "FULL" as const },
          rolling_returns_20: { source_observation_count: 0, emitted_point_count: 0, sampling: "NOT_APPLICABLE" as const, window_observations: 20 as const },
          return_distribution: { source_observation_count: 3, emitted_point_count: 0, sampling: "FULL_RETURN_HISTOGRAM_V2" as const },
        },
      },
    };
    const changed = {
      ...corrected,
      derived: { ...corrected.derived, monthly_returns: [{ month_start_utc_ms: 1_725_000_000_000, return_fraction: "0.11" }] },
    };
    for (const [sequence, evidence] of [[9, corrected], [10, changed]] as const) {
      await service.ingest(ingressScope, {
        run_id: "run_p13", event: { event_type: "run_completed", sequence, payload: { evidence_digest: sha256ResearchJson(evidence) } }, evidence,
      } as unknown as ResearchProgressIngress);
    }
    const firstWrite = persist.mock.calls[0]?.[1];
    const changedWrite = persist.mock.calls[1]?.[1];
    expect(firstWrite.projectionRevision).not.toBe(changedWrite.projectionRevision);
    expect(firstWrite.projection.series_identity.MONTHLY_RETURNS.digest)
      .not.toBe(changedWrite.projection.series_identity.MONTHLY_RETURNS.digest);
  });

  it("rejects a retained series whose bytes or digest do not match the projection revision", async () => {
    const persist = vi.fn().mockResolvedValue(undefined);
    const repository = { persist, inputBinding: vi.fn().mockResolvedValue(null), hub: vi.fn(), series: vi.fn(), bundle: vi.fn() };
    const service = new ResearchEvidenceService(repository as never, { FEATURE_RESEARCH_EVIDENCE: "true" } as never);
    const evidence = p13EvidenceSourceFixture();
    const digest = sha256ResearchJson(evidence);
    await service.ingest(ingressScope, {
      run_id: "run_p13", event: { event_type: "run_completed", sequence: 9, payload: { evidence_digest: digest } }, evidence,
    } as unknown as ResearchProgressIngress);
    const write = persist.mock.calls[0]?.[1];
    const equity = write.series.find((item: { kind: string }) => item.kind === "EQUITY_OOS");
    repository.bundle.mockResolvedValue({
      hub: {
        kind: "DURABLE", runId: "run_p13", requestedSpec: null,
        requestedSpecDigest: null, effectiveSpecDigest: null, datasetBindingDigest: null, manifestDigest: null,
        progressSnapshot: null, jobState: "SUCCEEDED", revision: write.projectionRevision, projection: write.projection,
        readiness: write.readiness, sourceEvidenceDigest: digest, receivedAt: new Date(), asOfUtcMs: 1,
      },
      series: new Map([["EQUITY_OOS", {
        revision: write.projectionRevision, kind: "EQUITY_OOS", availabilityState: equity.availabilityState,
        reasonCode: equity.reasonCode, sourceObservationCount: equity.sourceObservationCount,
        emittedPointCount: equity.emittedPointCount, sampling: equity.sampling,
        digest: "0".repeat(64), values: equity.values,
      }]]),
    });

    await expect(service.bundle(scope, "run_p13", ["EQUITY_OOS"])).rejects.toMatchObject({
      code: "RESEARCH_EVIDENCE_UNAVAILABLE", status: 503,
    });
  });

  it("keeps R1 labels immutable while publishing corrected R2 evaluation scopes", async () => {
    const persist = vi.fn().mockResolvedValue(undefined);
    const repository = { persist, inputBinding: vi.fn().mockResolvedValue(null), hub: vi.fn(), series: vi.fn(), bundle: vi.fn() };
    const service = new ResearchEvidenceService(repository as never, { FEATURE_RESEARCH_EVIDENCE: "true" } as never);
    const legacy = p13EvidenceSourceFixture();
    const corrected = {
      ...legacy,
      source: {
        ...legacy.source,
        evidence_transform_revision: "P13_SOURCE_R2" as const,
        direct_metric_scopes: {
          initial_equity: "OOS_EQUITY_SERIES" as const,
          final_equity: "OOS_EQUITY_SERIES" as const,
          num_trades: "FULL_CHILD_TAPE" as const,
          bars: "FULL_CHILD_TAPE" as const,
        },
        series_metadata: {
          equity_oos: { source_observation_count: 3, emitted_point_count: 3, sampling: "FULL" as const },
          monthly_returns: { source_observation_count: 3, emitted_point_count: 1, total_period_count: 1, omitted_leading_period_count: 1, omitted_transport_period_count: 0, sampling: "FULL" as const },
          rolling_returns_20: { source_observation_count: 0, emitted_point_count: 0, sampling: "NOT_APPLICABLE" as const, window_observations: 20 as const },
          return_distribution: { source_observation_count: 3, emitted_point_count: 0, sampling: "FULL_RETURN_HISTOGRAM_V2" as const },
        },
      },
    };
    await service.ingest(ingressScope, {
      run_id: "run_p13", event: { event_type: "run_completed", sequence: 9, payload: { evidence_digest: sha256ResearchJson(corrected) } }, evidence: corrected,
    } as unknown as ResearchProgressIngress);
    const write = persist.mock.calls[0]?.[1];
    repository.hub.mockResolvedValue({
      kind: "DURABLE", runId: "run_p13", requestedSpec: null,
      requestedSpecDigest: null, effectiveSpecDigest: null, datasetBindingDigest: null, manifestDigest: null,
      progressSnapshot: null, jobState: "SUCCEEDED", revision: write.projectionRevision, projection: write.projection,
      readiness: write.readiness, sourceEvidenceDigest: sha256ResearchJson(corrected), receivedAt: new Date(), asOfUtcMs: 1_725_000_000_000,
    });
    const hub = await service.hub(scope, "run_p13");
    expect(hub.metric_registry_version).toBe("research.metric-registry.v2");
    expect(hub.metrics.find((item) => item.key === "FINAL_EQUITY")).toMatchObject({ scope: "OOS", label: "OOS ending equity" });
    expect(hub.metrics.find((item) => item.key === "TRADE_COUNT")).toMatchObject({ scope: "CHILD_TAPE" });
  });
});
