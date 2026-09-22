import { describe, expect, it, vi } from "vitest";

import { ResearchProgressService } from "../src/research/progress.service";

const ingressScope = {
  workspaceId: "research-workspace",
  actorUserId: "research-owner",
  jobId: "job_rs01",
  workerAttemptId: "attempt_rs01",
  leaseEpoch: 3,
};

const terminalIngress = {
  run_id: "run_rs01",
  event: {
    event_type: "run_completed",
    sequence: 9,
    payload: {
      usage: { peak_rss_bytes: 1, cpu_seconds: 1, scratch_bytes: 0, fd_peak: 1 },
    },
  },
  snapshot: {
    status: "COMPLETED",
    readiness: { mandatory: "SEALED" },
    latest_sequence: 9,
  },
};

function subject(options?: { evidenceFailsOnce?: boolean; current?: Record<string, unknown> }) {
  const progress = {
    resolveIngress: vi.fn().mockResolvedValue(ingressScope),
    persistIngress: vi.fn().mockResolvedValue({
      inserted: false,
      event: terminalIngress.event,
      snapshot: terminalIngress.snapshot,
    }),
    markTerminalMaterialized: vi.fn().mockResolvedValue(undefined),
    readRun: vi.fn().mockResolvedValue(options?.current ?? {
      runId: "run_rs01", jobState: "SUCCEEDED", progress: null,
      sourceLatestSequence: 9, retentionFloorSequence: 0, receivedAt: null,
      hasCurrentAttempt: true, terminalMaterialization: "PENDING",
    }),
    currentLease: vi.fn(),
  };
  const metadata = { finishDurableJob: vi.fn().mockResolvedValue(undefined) };
  const fanout = { publish: vi.fn() };
  const evidence = {
    ingest: options?.evidenceFailsOnce
      ? vi.fn().mockRejectedValueOnce(new Error("sidecar unavailable")).mockResolvedValue(undefined)
      : vi.fn().mockResolvedValue(undefined),
  };
  const split = { ingest: vi.fn().mockResolvedValue(undefined) };
  // P18 is dark in these RS-01 recovery cases. Keeping the sidecar explicit
  // proves Progress does not construct/export a report unless its own feature
  // is admitted in the deployment config.
  const reports = { materializeTerminal: vi.fn().mockResolvedValue(false) };
  const service = new ResearchProgressService(
    progress as never, metadata as never, fanout as never, {} as never,
    evidence as never, split as never, reports as never,
    { FEATURE_RESEARCH_PROGRESS: "true", RESEARCH_RUN_PRODUCER_LEASE_SECONDS: 60 } as never,
  );
  return { service, progress, metadata, fanout, evidence, split, reports };
}

describe("RS-01 terminal materialization and retry recovery", () => {
  it("re-publishes an exact duplicate terminal event only after its durable checkpoint", async () => {
    const { service, progress, metadata, fanout, evidence, split } = subject();

    await service.ingest(terminalIngress as never);

    expect(evidence.ingest.mock.invocationCallOrder[0]).toBeLessThan(split.ingest.mock.invocationCallOrder[0]!);
    expect(split.ingest.mock.invocationCallOrder[0]).toBeLessThan(metadata.finishDurableJob.mock.invocationCallOrder[0]!);
    expect(metadata.finishDurableJob.mock.invocationCallOrder[0]).toBeLessThan(progress.markTerminalMaterialized.mock.invocationCallOrder[0]!);
    expect(progress.markTerminalMaterialized.mock.invocationCallOrder[0]).toBeLessThan(fanout.publish.mock.invocationCallOrder[0]!);
    expect(fanout.publish).toHaveBeenCalledTimes(1);

    // HTTP acknowledgement loss produces inserted=false. The sealed journal
    // must still recover its live notification without rerunning QuantBT.
    await service.ingest(terminalIngress as never);
    expect(progress.markTerminalMaterialized).toHaveBeenCalledTimes(2);
    expect(fanout.publish).toHaveBeenCalledTimes(2);
  });

  it("leaves a terminal run unmaterialized after a sidecar failure, then completes on exact retry", async () => {
    const { service, progress, metadata, fanout, evidence } = subject({ evidenceFailsOnce: true });

    await expect(service.ingest(terminalIngress as never)).rejects.toThrow("sidecar unavailable");
    expect(progress.markTerminalMaterialized).not.toHaveBeenCalled();
    expect(metadata.finishDurableJob).not.toHaveBeenCalled();
    expect(fanout.publish).not.toHaveBeenCalled();

    await service.ingest(terminalIngress as never);
    expect(evidence.ingest).toHaveBeenCalledTimes(2);
    expect(progress.markTerminalMaterialized).toHaveBeenCalledTimes(1);
    expect(fanout.publish).toHaveBeenCalledTimes(1);
  });

  it("keeps terminal reads in FINISHING until the immutable checkpoint is visible", async () => {
    const { service } = subject();
    const response = await service.read(
      { role: "ADMIN" } as never,
      { workspaceId: "research-workspace", actorUserId: "research-owner" },
      "run_rs01",
    );
    expect(response.current).toMatchObject({
      effective_status: "FINISHING",
      terminal_materialization: "PENDING",
    });
  });
});
