import { describe, expect, it, vi } from "vitest";

import { ResearchEvidenceService } from "../src/research/evidence.service";
import { sha256ResearchJson } from "../src/research/preflight.service";
import type { ResearchProgressIngress } from "../src/research/progress.contract";
import { p13EvidenceSourceFixture } from "./research-evidence.fixture";

const scope = { workspaceId: "p13-workspace", actorUserId: "p13-user" };
const ingressScope = { ...scope, jobId: "job_p13", workerAttemptId: "attempt_p13", leaseEpoch: 1 };

describe("P13 Evidence Flow projection authority", () => {
  it("binds a terminal source receipt to its digest and persists bounded lazy vectors", async () => {
    const persist = vi.fn().mockResolvedValue(undefined);
    const repository = { persist, hub: vi.fn(), series: vi.fn() };
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

  it("maps an immutable projection into direct/derived metrics and typed source gaps", async () => {
    const evidence = p13EvidenceSourceFixture();
    const digest = sha256ResearchJson(evidence);
    const persist = vi.fn().mockResolvedValue(undefined);
    const repository = { persist, hub: vi.fn(), series: vi.fn() };
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
  });

  it("changes immutable projection identity when only a retained series changes", async () => {
    const persist = vi.fn().mockResolvedValue(undefined);
    const repository = { persist, hub: vi.fn(), series: vi.fn(), bundle: vi.fn() };
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
    const repository = { persist, hub: vi.fn(), series: vi.fn(), bundle: vi.fn() };
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
    const repository = { persist, hub: vi.fn(), series: vi.fn(), bundle: vi.fn() };
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
