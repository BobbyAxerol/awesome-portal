/**
 * RF-05 · P13 Evidence hub backend: CG-P13-03/04/06/10/11/12/13.
 *
 * The receipts are real QuantBT 1.1.1 child outputs (see the fixture's
 * provenance); every expected metric value is read back from that receipt,
 * never retyped here.
 */
import { describe, expect, it, vi } from "vitest";

import { ResearchEvidenceHubResponseSchema, ResearchEvidenceSeriesResponseSchema } from "../src/research/evidence.contract";
import { ifNoneMatchWeakly } from "../src/research/etag";
import { ResearchEvidenceController } from "../src/research/evidence.controller";
import { RESEARCH_PERFORMANCE_METRIC_DEFINITIONS } from "../src/research/evidence-metric-registry";
import { ResearchEvidenceService } from "../src/research/evidence.service";
import { sha256ResearchJson } from "../src/research/preflight.service";
import { ResearchEvidenceSourceSchema, type ResearchProgressIngress } from "../src/research/progress.contract";
import { p13EvidenceSourceFixture, p13RealReceiptFixture } from "./research-evidence.fixture";

const scope = { workspaceId: "p13-workspace", actorUserId: "p13-user" };
const ingressScope = { ...scope, jobId: "job_p13", workerAttemptId: "attempt_p13", leaseEpoch: 1 };
const binding = {
  requested_spec_digest: "a".repeat(64), effective_spec_digest: "b".repeat(64),
  dataset_binding_digest: "c".repeat(64), manifest_digest: "d".repeat(64),
};

function harness(inputBinding: unknown = binding) {
  const persist = vi.fn().mockResolvedValue(undefined);
  const repository = {
    persist, inputBinding: vi.fn().mockResolvedValue(inputBinding), hub: vi.fn(), series: vi.fn(), bundle: vi.fn(),
  };
  const service = new ResearchEvidenceService(repository as never, { FEATURE_RESEARCH_EVIDENCE: "true" } as never);
  return { persist, repository, service };
}

async function ingest(service: ResearchEvidenceService, evidence: unknown, runId = "run_p13", sequence = 9) {
  await service.ingest(ingressScope, {
    run_id: runId, event: { event_type: "run_completed", sequence, payload: { evidence_digest: sha256ResearchJson(evidence) } }, evidence,
  } as unknown as ResearchProgressIngress);
}

function hubRow(write: Record<string, any>, overrides: Record<string, unknown> = {}) {
  return {
    kind: "DURABLE" as const, runId: "run_p13", runState: "READY", runCreatedAtUtcMs: 1_725_000_000_000,
    alphaId: null, alphaName: null, alphaVersionId: null, requestedSpec: null,
    requestedSpecDigest: binding.requested_spec_digest, effectiveSpecDigest: binding.effective_spec_digest,
    datasetBindingDigest: binding.dataset_binding_digest, manifestDigest: binding.manifest_digest,
    progressSnapshot: null, jobState: "SUCCEEDED",
    revision: write.projectionRevision, projection: write.projection, readiness: write.readiness,
    sourceEvidenceDigest: write.sourceEvidenceDigest, receivedAt: new Date(), asOfUtcMs: 1_725_000_000_000,
    ...overrides,
  };
}

function seriesRow(write: Record<string, any>, kind: string) {
  const item = write.series.find((entry: { kind: string }) => entry.kind === kind);
  return {
    revision: write.projectionRevision, kind, availabilityState: item.availabilityState, reasonCode: item.reasonCode,
    sourceObservationCount: item.sourceObservationCount, emittedPointCount: item.emittedPointCount,
    sampling: item.sampling, digest: item.digest, values: item.values,
  };
}

describe("RF-05 CG-P13-03 · registry v3 OOS performance from the real engine receipt", () => {
  it("publishes QuantBT's own OOS numbers with their full_report locator and keeps metrics[] frozen at v2", async () => {
    const receipt = p13RealReceiptFixture("four_month_oos");
    expect(ResearchEvidenceSourceSchema.safeParse(receipt).success).toBe(true);
    const { persist, repository, service } = harness();
    await ingest(service, receipt);
    const write = persist.mock.calls[0]![1];
    repository.hub.mockResolvedValue(hubRow(write));
    const hub = await service.hub(scope, "run_p13");

    expect(ResearchEvidenceHubResponseSchema.safeParse(hub).success).toBe(true);
    expect(hub.metric_registry_version).toBe("research.metric-registry.v2");
    expect(hub.metrics).toHaveLength(8);
    const performance = hub.oos_performance!;
    expect(performance).toMatchObject({
      registry_version: "research.metric-registry.v3",
      availability: { state: "AVAILABLE", reason_code: null },
      scope_locator: receipt.oos_analytics.scope_locator,
      report_locator: "quantbt.metrics.performance.full_report(trading_days=365)",
      return_sample: receipt.oos_analytics.return_sample,
    });
    for (const definition of RESEARCH_PERFORMANCE_METRIC_DEFINITIONS) {
      const metric = performance.metrics.find((item) => item.key === definition.key)!;
      const source = receipt.oos_analytics.metrics[definition.sourceField];
      expect(metric.definition_id).toBe(definition.definitionId);
      if (definition.origin === "ENGINE_DIRECT") {
        expect(metric).toMatchObject({
          origin: "ENGINE_DIRECT", scope: "OOS", value: source.value, source_locator: definition.sourceLocator,
          availability: { state: "AVAILABLE", reason_code: null },
        });
      }
    }
    expect(performance.metrics.find((item) => item.key === "OOS_SHARPE_DECAY")).toMatchObject({
      origin: "NOT_PUBLISHED", value: null, source_locator: null,
      availability: { state: "NOT_PUBLISHED", reason_code: "P13_IS_BOUNDARY_NOT_IN_CHILD_RECEIPT" },
    });
  });

  it("refuses a value whose receipt locator is not the registry's engine field", async () => {
    const receipt = p13RealReceiptFixture("four_month_oos");
    receipt.oos_analytics.metrics.sharpe.locator = "full_report.calmar";
    const { persist, repository, service } = harness();
    await ingest(service, receipt);
    repository.hub.mockResolvedValue(hubRow(persist.mock.calls[0]![1]));
    const hub = await service.hub(scope, "run_p13");
    expect(hub.oos_performance!.metrics.find((item) => item.key === "OOS_SHARPE")).toMatchObject({
      value: null, availability: { state: "NOT_PUBLISHED", reason_code: "P13_ENGINE_LOCATOR_MISMATCH" },
    });
  });

  it("types a projection sealed before RF-05 instead of implying zero", async () => {
    const { persist, repository, service } = harness();
    await ingest(service, p13EvidenceSourceFixture());
    const write = persist.mock.calls[0]![1];
    repository.hub.mockResolvedValue(hubRow(write));
    const hub = await service.hub(scope, "run_p13");
    expect(hub.oos_performance!.availability).toEqual({ state: "NOT_PUBLISHED", reason_code: "P13_SOURCE_PREDATES_OOS_ANALYTICS" });
    expect(hub.oos_performance!.metrics.every((item) => item.value === null)).toBe(true);
    expect(hub.series.find((item) => item.kind === "ROLLING_SHARPE_63")).toEqual({
      kind: "ROLLING_SHARPE_63", href: null,
      availability: { state: "NOT_PUBLISHED", reason_code: "P13_SOURCE_PREDATES_OOS_ANALYTICS" },
    });
    repository.bundle.mockResolvedValue({ hub: hubRow(write), series: new Map() });
    const series = await service.series(scope, "run_p13", "ROLLING_SHARPE_63");
    expect(series).toMatchObject({ values: [], availability: { state: "NOT_PUBLISHED", reason_code: "P13_SOURCE_PREDATES_OOS_ANALYTICS" } });
  });

  it("rejects an inconsistent analytics block at ingress", () => {
    const receipt = p13RealReceiptFixture("four_month_oos");
    receipt.oos_analytics.metrics.sortino = { state: "AVAILABLE", reason_code: null, value: "1", locator: null };
    expect(ResearchEvidenceSourceSchema.safeParse(receipt).success).toBe(false);
    const rolling = p13RealReceiptFixture("four_month_oos");
    rolling.oos_analytics.rolling_sharpe_63.points = [];
    expect(ResearchEvidenceSourceSchema.safeParse(rolling).success).toBe(false);
  });
});

describe("RF-05 CG-P13-04 · rolling Sharpe(63) and typed rolling beta", () => {
  it("stores the engine rolling Sharpe as a lazy series and beta as a typed absence", async () => {
    const receipt = p13RealReceiptFixture("four_month_oos");
    const { persist, repository, service } = harness();
    await ingest(service, receipt);
    const write = persist.mock.calls[0]![1];
    const sharpe = write.series.find((item: { kind: string }) => item.kind === "ROLLING_SHARPE_63");
    expect(sharpe).toMatchObject({
      availabilityState: "AVAILABLE", emittedPointCount: receipt.oos_analytics.rolling_sharpe_63.points.length,
      sourceObservationCount: receipt.oos_analytics.rolling_sharpe_63.source_observation_count, sampling: "EXTREMA_BUCKET_V1",
    });
    expect(sharpe.values).toEqual(receipt.oos_analytics.rolling_sharpe_63.points);
    expect(write.series.find((item: { kind: string }) => item.kind === "ROLLING_BETA_63")).toMatchObject({
      availabilityState: "NOT_PUBLISHED", reasonCode: "P04_SOURCE_DID_NOT_PUBLISH_BENCHMARK", values: [], emittedPointCount: 0,
    });
    repository.bundle.mockResolvedValue({
      hub: hubRow(write),
      series: new Map([["ROLLING_SHARPE_63", seriesRow(write, "ROLLING_SHARPE_63")], ["ROLLING_BETA_63", seriesRow(write, "ROLLING_BETA_63")]]),
    });
    const sharpeRead = await service.series(scope, "run_p13", "ROLLING_SHARPE_63");
    expect(ResearchEvidenceSeriesResponseSchema.safeParse(sharpeRead).success).toBe(true);
    expect(sharpeRead.values[0]).toHaveProperty("sharpe");
    const beta = await service.series(scope, "run_p13", "ROLLING_BETA_63");
    expect(beta).toMatchObject({ values: [], availability: { state: "NOT_PUBLISHED", reason_code: "P04_SOURCE_DID_NOT_PUBLISH_BENCHMARK" } });
  });

  it("keeps a one-month OOS rolling Sharpe NOT_APPLICABLE with the engine's reason", async () => {
    const receipt = p13RealReceiptFixture("one_month_oos");
    const { persist, repository, service } = harness();
    await ingest(service, receipt);
    repository.hub.mockResolvedValue(hubRow(persist.mock.calls[0]![1]));
    const hub = await service.hub(scope, "run_p13");
    expect(hub.series.find((item) => item.kind === "ROLLING_SHARPE_63")?.availability).toEqual({
      state: "NOT_APPLICABLE", reason_code: "P13_OOS_DAILY_RETURNS_BELOW_ROLLING_WINDOW",
    });
  });
});

describe("RF-05 CG-P13-06 · monthly returns never AVAILABLE with zero points", () => {
  it("measures the leading OOS month from the month-boundary close (the preview's one-month shape)", async () => {
    const receipt = p13RealReceiptFixture("one_month_oos");
    expect(receipt.derived.monthly_returns).toEqual([]);
    const { persist, service } = harness();
    await ingest(service, receipt);
    const monthly = persist.mock.calls[0]![1].series.find((item: { kind: string }) => item.kind === "MONTHLY_RETURNS");
    expect(monthly).toMatchObject({ availabilityState: "AVAILABLE", emittedPointCount: 1, sampling: "FULL" });
    expect(monthly.values).toEqual([receipt.oos_analytics.monthly_leading.point]);
  });

  it("prepends only the leading month to a multi-month series", async () => {
    const receipt = p13RealReceiptFixture("four_month_oos");
    const { persist, service } = harness();
    await ingest(service, receipt);
    const monthly = persist.mock.calls[0]![1].series.find((item: { kind: string }) => item.kind === "MONTHLY_RETURNS");
    expect(monthly.values).toEqual([receipt.oos_analytics.monthly_leading.point, ...receipt.derived.monthly_returns]);
  });

  it("types an empty month set on ingest and on read of a row sealed as AVAILABLE/FULL", async () => {
    const receipt = p13RealReceiptFixture("one_month_oos");
    receipt.oos_analytics.monthly_leading = {
      state: "NOT_APPLICABLE", reason_code: "P13_OOS_STARTS_MID_CALENDAR_MONTH", base_at_utc_ms: null, point: null,
    };
    const { persist, repository, service } = harness();
    await ingest(service, receipt);
    const write = persist.mock.calls[0]![1];
    expect(write.series.find((item: { kind: string }) => item.kind === "MONTHLY_RETURNS")).toMatchObject({
      availabilityState: "NOT_APPLICABLE", reasonCode: "P13_OOS_HAS_NO_MONTH_WITH_PRIOR_CALENDAR_CLOSE", sampling: null,
    });

    // A pre-RF-05 row: stored AVAILABLE, FULL, zero points (live rrun_34a6…).
    const legacyProjection = structuredClone(write.projection);
    legacyProjection.series.MONTHLY_RETURNS = { state: "AVAILABLE", reason_code: null };
    legacyProjection.series_identity.MONTHLY_RETURNS.sampling = "FULL";
    const legacyRow = hubRow(write, { projection: legacyProjection });
    repository.hub.mockResolvedValue(legacyRow);
    const hub = await service.hub(scope, "run_p13");
    expect(hub.series.find((item) => item.kind === "MONTHLY_RETURNS")?.availability).toEqual({
      state: "NOT_APPLICABLE", reason_code: "P13_OOS_HAS_NO_MONTH_WITH_PRIOR_CALENDAR_CLOSE",
    });
    repository.bundle.mockResolvedValue({
      hub: legacyRow,
      series: new Map([["MONTHLY_RETURNS", { ...seriesRow(write, "MONTHLY_RETURNS"), availabilityState: "AVAILABLE", reasonCode: null, sampling: "FULL" }]]),
    });
    const series = await service.series(scope, "run_p13", "MONTHLY_RETURNS");
    expect(series).toMatchObject({
      values: [], availability: { state: "NOT_APPLICABLE", reason_code: "P13_OOS_HAS_NO_MONTH_WITH_PRIOR_CALENDAR_CLOSE" },
      source_sample: { emitted_point_count: 0, sampling: null },
    });
    // A client that cached the pre-RF-05 AVAILABLE body under `"<revision>"`
    // must not be told 304: the representation changed, so must the tag.
    expect(series.etag).toMatch(/^"p13r1_[0-9a-f]{64}"$/);
    expect(series.etag).not.toBe(`"${series.revision}"`);
  });

  it("refuses a leading month that does not reconcile with the OOS series", async () => {
    const receipt = p13RealReceiptFixture("four_month_oos");
    receipt.oos_analytics.monthly_leading.point.month_start_utc_ms -= 31 * 86_400_000;
    receipt.oos_analytics.monthly_leading.base_at_utc_ms -= 31 * 86_400_000;
    const { service } = harness();
    await expect(ingest(service, receipt)).rejects.toMatchObject({ code: "RESEARCH_EVIDENCE_INVALID", status: 400 });
  });

  it("keeps the months as sent and records why when an empty month follows the leading one", async () => {
    // The child groups only months that have bars: an OOS starting on a month
    // edge followed by a bar-less month sends months[0] later than the month
    // after the leading one.  That is not a contradiction; it must never make
    // the terminal relay fail.
    const receipt = p13RealReceiptFixture("four_month_oos");
    const sent = receipt.derived.monthly_returns.slice(1);
    receipt.derived.monthly_returns = sent;
    receipt.source.series_metadata.monthly_returns.emitted_point_count = sent.length;
    receipt.source.series_metadata.monthly_returns.total_period_count = sent.length;
    expect(ResearchEvidenceSourceSchema.safeParse(receipt).success).toBe(true);
    const { persist, repository, service } = harness();
    await ingest(service, receipt);
    const write = persist.mock.calls[0]![1];
    repository.hub.mockResolvedValue(hubRow(write));
    expect((await service.hub(scope, "run_p13")).series.find((item) => item.kind === "MONTHLY_RETURNS")?.availability.state).toBe("AVAILABLE");
    const monthly = write.series.find((item: { kind: string }) => item.kind === "MONTHLY_RETURNS");
    expect(monthly).toMatchObject({ availabilityState: "AVAILABLE", emittedPointCount: sent.length, sampling: "FULL" });
    expect(monthly.values).toEqual(sent);
    expect(write.projection.monthly_leading).toEqual({
      state: "NOT_APPLIED", reason_code: "P13_LEADING_MONTH_NOT_CONTIGUOUS_WITH_SOURCE_MONTHS",
    });
  });

  it("does not record a leading-month note when the prepend applies", async () => {
    const { persist, service } = harness();
    await ingest(service, p13RealReceiptFixture("four_month_oos"));
    expect(persist.mock.calls[0]![1].projection).not.toHaveProperty("monthly_leading");
  });

  it("versions every series ETag by representation, not by revision alone", async () => {
    const { persist, repository, service } = harness();
    await ingest(service, p13RealReceiptFixture("four_month_oos"));
    const write = persist.mock.calls[0]![1];
    const tags = new Set<string>();
    for (const kind of ["EQUITY_OOS", "MONTHLY_RETURNS"]) {
      repository.bundle.mockResolvedValue({ hub: hubRow(write), series: new Map([[kind, seriesRow(write, kind)]]) });
      const answer = await service.series(scope, "run_p13", kind as never);
      expect(ResearchEvidenceSeriesResponseSchema.safeParse(answer).success).toBe(true);
      expect(answer.revision).toBe(write.projectionRevision);
      expect(answer.etag).not.toBe(`"${write.projectionRevision}"`);
      expect((await service.series(scope, "run_p13", kind as never)).etag).toBe(answer.etag);
      tags.add(answer.etag!);
    }
    expect(tags.size).toBe(2);
  });

  it("rejects an AVAILABLE series response with zero values", () => {
    expect(ResearchEvidenceSeriesResponseSchema.safeParse({
      schema_version: "research.evidence-series.v1", run_id: "run_p13", revision: `p13r1_${"a".repeat(64)}`,
      etag: `"p13r1_${"a".repeat(64)}"`, kind: "MONTHLY_RETURNS", availability: { state: "AVAILABLE", reason_code: null },
      source_sample: { source_observation_count: 744, emitted_point_count: 0, sampling: "FULL" }, values: [],
    }).success).toBe(false);
  });
});

describe("RF-05 CG-P13-11 · revision binds the run's inputs (Astra A04)", () => {
  it("never lets two runs with identical evidence share a revision", async () => {
    const receipt = p13RealReceiptFixture("one_month_oos");
    const first = harness();
    await ingest(first.service, receipt, "rrun_one");
    const second = harness({ ...binding, manifest_digest: "e".repeat(64), effective_spec_digest: "f".repeat(64) });
    await ingest(second.service, receipt, "rrun_two");
    const sameRunOtherInputs = harness({ ...binding, manifest_digest: "e".repeat(64) });
    await ingest(sameRunOtherInputs.service, receipt, "rrun_one");
    const replay = harness();
    await ingest(replay.service, receipt, "rrun_one");

    const revision = (item: ReturnType<typeof harness>) => item.persist.mock.calls[0]![1].projectionRevision;
    expect(revision(first)).not.toBe(revision(second));
    expect(revision(first)).not.toBe(revision(sameRunOtherInputs));
    expect(revision(first)).toBe(revision(replay));
    expect(first.persist.mock.calls[0]![1].projection.run_binding).toEqual({ run_id: "rrun_one", ...binding });
    expect(first.repository.inputBinding).toHaveBeenCalledWith(ingressScope, "rrun_one");
  });

  it("labels what a revision identifies, including immutable pre-RF-05 rows", async () => {
    const { persist, repository, service } = harness();
    await ingest(service, p13RealReceiptFixture("one_month_oos"));
    const write = persist.mock.calls[0]![1];
    repository.hub.mockResolvedValue(hubRow(write));
    expect((await service.hub(scope, "run_p13")).revision_binding).toEqual({
      value: "RUN_INPUT_BOUND", availability: { state: "AVAILABLE", reason_code: null },
    });
    const { run_binding: _dropped, ...legacy } = write.projection;
    repository.hub.mockResolvedValue(hubRow(write, { projection: legacy }));
    expect((await service.hub(scope, "run_p13")).revision_binding).toEqual({
      value: "SOURCE_CONTENT_ONLY", availability: { state: "AVAILABLE", reason_code: null },
    });
  });
});

describe("RF-05 CG-P13-10/12 · status vocabulary and typed terminal flag", () => {
  const cases = [
    { runState: "READY", jobState: "SUCCEEDED", display: "COMPLETED", phase: "TERMINAL", outcome: "COMPLETED" },
    { runState: "CANCELLED", jobState: "CANCELLED", display: "CANCELLED", phase: "TERMINAL", outcome: "CANCELLED" },
    { runState: "FAILED", jobState: "FAILED", display: "FAILED", phase: "TERMINAL", outcome: "FAILED" },
    { runState: "RUNNING", jobState: "CLAIMED", display: "RUNNING", phase: "IN_PROGRESS", outcome: null },
    { runState: "QUEUED", jobState: "QUEUED", display: "QUEUED", phase: "IN_PROGRESS", outcome: null },
    { runState: "RUNNING", jobState: "CANCEL_REQUESTED", display: "RUNNING", phase: "IN_PROGRESS", outcome: null },
    { runState: "RECOVERY_REQUIRED", jobState: "RECOVERY_REQUIRED", display: "RECOVERY_REQUIRED", phase: "ATTENTION_REQUIRED", outcome: null },
  ] as const;

  for (const item of cases) {
    it(`${item.runState}/${item.jobState} → ${item.display} · ${item.phase}`, async () => {
      const { repository, service } = harness();
      repository.hub.mockResolvedValue({
        kind: "DURABLE", runId: "run_p13", runState: item.runState, runCreatedAtUtcMs: 1, alphaId: null, alphaName: null,
        alphaVersionId: null, requestedSpec: null, requestedSpecDigest: null, effectiveSpecDigest: null,
        datasetBindingDigest: null, manifestDigest: null, progressSnapshot: null, jobState: item.jobState,
        revision: null, projection: null, readiness: null, sourceEvidenceDigest: null, receivedAt: null, asOfUtcMs: 1,
      });
      const hub = await service.hub(scope, "run_p13");
      expect(hub.readiness).toBe("NOT_READY");
      expect(hub.lifecycle).toEqual({
        vocabulary: "research.run-status-vocabulary.v1", durable_status: item.runState, display_status: item.display,
        phase: item.phase, terminal_outcome: item.outcome, failed_at: null,
        availability: { state: "AVAILABLE", reason_code: null },
      });
      expect(hub.core.run_identity?.status.value).toBe(item.runState);
    });
  }

  it("marks a legacy 1.0.8 row LEGACY rather than in progress", async () => {
    const { repository, service } = harness();
    repository.hub.mockResolvedValue({
      kind: "LEGACY", runId: "527d2b993c834729", runState: null, runCreatedAtUtcMs: null, alphaId: null, alphaName: null,
      alphaVersionId: null, requestedSpec: null, requestedSpecDigest: null, effectiveSpecDigest: null, datasetBindingDigest: null,
      manifestDigest: null, progressSnapshot: null, jobState: null, revision: null, projection: null, readiness: null,
      sourceEvidenceDigest: null, receivedAt: null, asOfUtcMs: 1,
    });
    const hub = await service.hub(scope, "527d2b993c834729");
    expect(hub.lifecycle).toMatchObject({ phase: "LEGACY", display_status: null, terminal_outcome: null, availability: { state: "LEGACY_METADATA_ONLY" } });
    expect(hub.series).toHaveLength(6);
  });
});

describe("RF-05 CG-P13-13 · revalidation behind gzip", () => {
  const strong = `"p13r1_${"a".repeat(64)}"`;
  const weakHub = `W/"p13h1_${"b".repeat(64)}"`;

  it("compares If-None-Match weakly over a list", () => {
    expect(ifNoneMatchWeakly(strong, strong)).toBe(true);
    expect(ifNoneMatchWeakly(`W/${strong}`, strong)).toBe(true);
    expect(ifNoneMatchWeakly(`"x", W/${strong}`, strong)).toBe(true);
    expect(ifNoneMatchWeakly(weakHub, weakHub)).toBe(true);
    expect(ifNoneMatchWeakly(weakHub.slice(2), weakHub)).toBe(true);
    expect(ifNoneMatchWeakly("*", strong)).toBe(true);
    expect(ifNoneMatchWeakly(`"p13r1_${"c".repeat(64)}"`, strong)).toBe(false);
    expect(ifNoneMatchWeakly(undefined, strong)).toBe(false);
  });

  it("answers 304 for a gateway-weakened series tag and marks every answer private/no-cache", async () => {
    const service = {
      hub: vi.fn().mockResolvedValue({ etag: weakHub }),
      series: vi.fn().mockResolvedValue({ etag: strong }),
    };
    const controller = new ResearchEvidenceController(service as never, { isMember: vi.fn().mockResolvedValue(true) } as never);
    const reply = () => ({ header: vi.fn(), code: vi.fn().mockReturnThis(), send: vi.fn((body?: unknown) => body ?? { status: 304 }) });
    const request = (ifNoneMatch?: string) => ({
      portalUser: { userId: "p13-user" }, portalWorkspaceId: "p13-workspace",
      headers: ifNoneMatch ? { "if-none-match": ifNoneMatch } : {}, raw: { once: vi.fn(), off: vi.fn() },
    });

    const revalidated = reply();
    await controller.series(request(`W/${strong}`) as never, revalidated as never, "run_p13", { kind: "EQUITY_OOS" });
    expect(revalidated.code).toHaveBeenCalledWith(304);
    expect(revalidated.header).toHaveBeenCalledWith("etag", strong);
    expect(revalidated.header).toHaveBeenCalledWith("cache-control", "private, no-cache");

    const hubReply = reply();
    await controller.hub(request(weakHub) as never, hubReply as never, "run_p13", {});
    expect(hubReply.code).toHaveBeenCalledWith(304);

    const fresh = reply();
    await controller.hub(request() as never, fresh as never, "run_p13", {});
    expect(fresh.code).not.toHaveBeenCalled();
    expect(fresh.header).toHaveBeenCalledWith("cache-control", "private, no-cache");
  });
});
