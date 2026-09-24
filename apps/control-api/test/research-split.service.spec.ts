import { describe, expect, it, vi } from "vitest";

import { sha256ResearchJson } from "../src/research/preflight.service";
import { ResearchSplitService } from "../src/research/split.service";
import { ResearchSplitSourceSchema, type ResearchProgressIngress } from "../src/research/progress.contract";
import { p14SplitSourceFixture } from "./research-split.fixture";

const scope = {
  workspaceId: "p14-workspace",
  actorUserId: "p14-user",
  jobId: "job_p14",
  workerAttemptId: "attempt_p14",
  leaseEpoch: 1,
};

describe("P14 Split projection authority", () => {
  it("binds one terminal source receipt to its digest and publishes only typed absences for unsupported truth", async () => {
    const persist = vi.fn().mockResolvedValue(undefined);
    const repository = { persist, hub: vi.fn() };
    const service = new ResearchSplitService(repository as never, { FEATURE_RESEARCH_SPLIT: "true" } as never);
    const split = p14SplitSourceFixture();
    const digest = sha256ResearchJson(split);
    await service.ingest(scope, {
      run_id: "run_p14", event: { event_type: "run_completed", sequence: 9, payload: { split_digest: digest } }, split,
    } as unknown as ResearchProgressIngress);
    const write = persist.mock.calls[0]?.[1];
    expect(write.sourceSplitDigest).toBe(digest);
    expect(write.projectionRevision).toMatch(/^p14r1_[0-9a-f]{64}$/);
    repository.hub.mockResolvedValue({
      kind: "DURABLE", runId: "run_p14", requestedSpecDigest: "1".repeat(64), effectiveSpecDigest: "2".repeat(64), datasetBindingDigest: "3".repeat(64), manifestDigest: "b".repeat(64), progressSnapshot: null, jobState: "SUCCEEDED", revision: write.projectionRevision, projection: write.projection, readiness: write.readiness, sourceSplitDigest: digest, receivedAt: new Date(), datasetBinding: null, sourceAsOfUtcMs: 1_727_000_000_000, sourceAsOfBasis: "P14_PROJECTION_RECEIVED_AT", asOfUtcMs: 1,
    });
    const detail = await service.detail(scope, "run_p14");
    expect(detail.windows.holdout).toMatchObject({ child_input_state: "NOT_EXPOSED_TO_CHILD_TAPE", evaluation_state: "NOT_EVALUATED", result_exposure_state: "NOT_EXPOSED" });
    expect(detail.actions.holdout_unlock).toMatchObject({ state: "NOT_PUBLISHED", href: null });
    expect(detail.protocol.selection).toMatchObject({ state: "FIXED_PROFILE_NO_SEARCH" });
    expect(detail.as_of_utc_ms).toBe(1_727_000_000_000);
    expect(detail.dataset).toMatchObject({ state: "NOT_PUBLISHED", reason_code: "P14_DATASET_BINDING_NOT_PUBLISHED" });
  });

  it("rejects a split digest that does not bind the terminal receipt", async () => {
    const service = new ResearchSplitService({ persist: vi.fn(), hub: vi.fn() } as never, { FEATURE_RESEARCH_SPLIT: "true" } as never);
    await expect(service.ingest(scope, {
      run_id: "run_p14", event: { event_type: "run_completed", sequence: 9, payload: { split_digest: "0".repeat(64) } }, split: p14SplitSourceFixture(),
    } as unknown as ResearchProgressIngress)).rejects.toMatchObject({ code: "RESEARCH_SPLIT_CONFLICT", status: 409 });
  });

  it("rejects inverted, zero-length and warmup-misaligned windows before immutable persistence", () => {
    const inverted = p14SplitSourceFixture();
    inverted.windows.outer_oos.end_exclusive_utc_ms = inverted.windows.outer_oos.start_utc_ms;
    expect(ResearchSplitSourceSchema.safeParse(inverted).success).toBe(false);

    const misaligned = p14SplitSourceFixture();
    misaligned.timeline.start_utc_ms += 1;
    expect(ResearchSplitSourceSchema.safeParse(misaligned).success).toBe(false);

    const warmup = p14SplitSourceFixture();
    (warmup.windows as { warmup: unknown }).warmup = {
      state: "AVAILABLE", start_utc_ms: warmup.timeline.start_utc_ms,
      end_exclusive_utc_ms: warmup.windows.is.start_utc_ms - 1,
      bars: 1, data_role: "WARMUP_NOT_SCORED", child_input_state: "EXPOSED_TO_CHILD_TAPE",
    };
    expect(ResearchSplitSourceSchema.safeParse(warmup).success).toBe(false);
  });
});
