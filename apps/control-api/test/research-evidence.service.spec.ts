import { describe, expect, it, vi } from "vitest";

import { ResearchEvidenceService } from "../src/research/evidence.service";
import { sha256ResearchJson } from "../src/research/preflight.service";
import type { ResearchProgressIngress } from "../src/research/progress.contract";
import { p13EvidenceSourceFixture } from "./research-evidence.fixture";

const scope = { workspaceId: "p13-workspace", actorUserId: "p13-user" };

describe("P13 Evidence Flow projection authority", () => {
  it("binds a terminal source receipt to its digest and persists bounded lazy vectors", async () => {
    const persist = vi.fn().mockResolvedValue(undefined);
    const repository = { persist, hub: vi.fn(), series: vi.fn() };
    const service = new ResearchEvidenceService(repository as never, { FEATURE_RESEARCH_EVIDENCE: "true" } as never);
    const evidence = p13EvidenceSourceFixture();
    const digest = sha256ResearchJson(evidence);

    await service.ingest(scope, {
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

    await expect(service.ingest(scope, {
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
    await service.ingest(scope, {
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
});
