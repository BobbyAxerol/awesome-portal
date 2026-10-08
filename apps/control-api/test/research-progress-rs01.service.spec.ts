import { describe, expect, it, vi } from "vitest";

import { ResearchProgressService } from "../src/research/progress.service";
import { DELTA_CAUSAL_INNER_PROFILE_ID } from "../src/research/delta-causal-inner.profile";
import { PINNED_AUDIT_PROFILE_ID } from "../src/research/final-audit.contract";
import { ENGINE_110_QUALIFICATION_BINDING, ENGINE_110_QUALIFICATION_BINDING_DIGEST } from "../src/research/engine-qualification.profile";

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

/**
 * E10: the status now comes from `research.run_lifecycle_status_v1` in the
 * repository's SQL (proved against PostgreSQL in p11-progress.spec.ts). A
 * repository fake must say what that function returns for its row.
 */
function withLifecycle<T extends Record<string, unknown>>(row: T): T & { lifecycleStatus: string } {
  if (typeof row.lifecycleStatus === "string") return row as T & { lifecycleStatus: string };
  const job = row.jobState;
  const lifecycleStatus = job === "CANCELLED" ? "CANCELLED"
    : row.terminalMaterialization === "PENDING" ? "FINISHING"
      : job === "FAILED" ? "FAILED"
        : job === "SUCCEEDED" ? "COMPLETED"
          : job === "RUNNING" || job === "CLAIMED" || job === "CANCEL_REQUESTED" ? "RUNNING" : "QUEUED";
  return { ...row, lifecycleStatus };
}

function subject(options?: { evidenceFailsOnce?: boolean; current?: Record<string, unknown>; scope?: Record<string, unknown>; reportRefuses?: boolean }) {
  const progress = {
    resolveIngress: vi.fn().mockResolvedValue({ ...ingressScope, ...options?.scope }),
    persistIngress: vi.fn().mockResolvedValue({
      inserted: false,
      event: terminalIngress.event,
      snapshot: terminalIngress.snapshot,
    }),
    markTerminalMaterialized: vi.fn().mockResolvedValue(undefined),
    readRun: vi.fn().mockResolvedValue(withLifecycle({
      runId: "run_rs01", jobState: "SUCCEEDED", progress: null,
      sourceLatestSequence: 9, retentionFloorSequence: 0, receivedAt: null,
      hasCurrentAttempt: true, terminalMaterialization: "PENDING", retainedArtifacts: [],
      queueClass: "BACKGROUND", queuedAt: new Date("2026-09-23T00:00:00.000Z"),
      retryNotBefore: null, attempts: [],
      ...options?.current,
    })),
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
  const reports = {
    materializeTerminal: options?.reportRefuses
      ? vi.fn().mockRejectedValue(Object.assign(new Error("Report source facts are not sealed yet."), { code: "RESEARCH_REPORT_NOT_READY", status: 409 }))
      : vi.fn().mockResolvedValue(false),
  };
  const service = new ResearchProgressService(
    progress as never, metadata as never, fanout as never, {} as never,
    evidence as never, split as never, reports as never,
    { FEATURE_RESEARCH_PROGRESS: "true", RESEARCH_RUN_PRODUCER_LEASE_SECONDS: 60 } as never,
  );
  return { service, progress, metadata, fanout, evidence, split, reports };
}

describe("RS-01 terminal materialization and retry recovery", () => {
  it('does not strand verified native optimizer completion on a fixed-P04 report refusal',async()=>{
    const target=subject({scope:{executionProfileId:'p10.delta-event-driven-limit-oco-search-1h.v1'},reportRefuses:true});
    const stderr=vi.spyOn(process.stderr,'write').mockImplementation(()=>true);
    try{await target.service.ingest(terminalIngress as never);}finally{stderr.mockRestore();}
    expect(target.evidence.ingest).toHaveBeenCalledOnce();expect(target.split.ingest).toHaveBeenCalledOnce();
    expect(target.progress.markTerminalMaterialized).toHaveBeenCalledOnce();
    // Untyped/primary sidecar errors must still refuse the checkpoint.
    const bad=subject({scope:{executionProfileId:'p10.delta-event-driven-limit-oco-search-1h.v1'}});
    bad.reports.materializeTerminal.mockRejectedValueOnce(new Error('unexpected primary loss'));
    await expect(bad.service.ingest(terminalIngress as never)).rejects.toThrow('unexpected primary loss');
    expect(bad.progress.markTerminalMaterialized).not.toHaveBeenCalled();
  });
  it("accepts old-engine evidence only on its exact immutable qualification pin", async () => {
    const input = { ...terminalIngress, evidence: { source: { engine_version: "1.1.0" } } };
    const binding = { ...ENGINE_110_QUALIFICATION_BINDING, binding_digest: ENGINE_110_QUALIFICATION_BINDING_DIGEST };
    for (const scope of [
      { engineReleaseId: "er_quantbt_111" },
      { engineReleaseId: "er_quantbt_110", executionProfileId: "p04.fixed-qualification.v1", qualificationBinding: null },
      { engineReleaseId: "er_quantbt_110", executionProfileId: "p04.fixed-qualification.v1", qualificationBinding: { ...binding, binding_digest: "0".repeat(64) } },
    ]) {
      const wrong = subject({ scope });
      await expect(wrong.service.ingest(input as never)).rejects.toMatchObject({ code: "RESEARCH_PROGRESS_INVALID" });
      expect(wrong.progress.persistIngress).not.toHaveBeenCalled();
    }
    const valid = subject({ scope: { engineReleaseId: "er_quantbt_110", executionProfileId: "p04.fixed-qualification.v1", qualificationBinding: binding } });
    await expect(valid.service.ingest(input as never)).resolves.toEqual({ accepted: true, latest_sequence: 9 });
    expect(valid.progress.persistIngress).toHaveBeenCalledTimes(1);
  });

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

  it("W1/W6a: a Delta WFO terminal seals its report from the retained lane but is never held hostage by it", async () => {
    const wfo = subject({ scope: { executionProfileId: "p10.delta-signal-notional-wfo.v1" }, reportRefuses: true });
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    await wfo.service.ingest(terminalIngress as never);
    stderr.mockRestore();
    expect(wfo.reports.materializeTerminal).toHaveBeenCalledWith(expect.anything(), expect.anything(), "RS02_RETAINED_CURRENT_SOURCE");
    expect(wfo.progress.markTerminalMaterialized).toHaveBeenCalledTimes(1);

    // A P04 run keeps the retryable report sidecar exactly as before.
    const p04 = subject({ scope: { executionProfileId: "p04.fixed-qualification.v1" }, reportRefuses: true });
    await expect(p04.service.ingest(terminalIngress as never)).rejects.toMatchObject({ code: "RESEARCH_REPORT_NOT_READY" });
    expect(p04.progress.markTerminalMaterialized).not.toHaveBeenCalled();
  });

  it("routes causal-inner completion through retained WFO reports, never fixed sidecars or the long-preview CPU budget", async () => {
    const causal = subject({ scope: { executionProfileId: DELTA_CAUSAL_INNER_PROFILE_ID }, reportRefuses: true });
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    await causal.service.ingest(terminalIngress as never);
    stderr.mockRestore();
    expect(causal.reports.materializeTerminal).toHaveBeenCalledWith(expect.anything(), expect.anything(), "RS02_RETAINED_CURRENT_SOURCE");
    // The existing sidecar services see the terminal callback and are no-ops
    // without fixed source receipts; attaching one is refused before persist.
    await expect(causal.service.ingest({ ...terminalIngress, evidence: {} } as never)).rejects.toMatchObject({ code: "RESEARCH_PROGRESS_INVALID" });
    expect(causal.progress.markTerminalMaterialized).toHaveBeenCalledTimes(1);
    const capped = subject({ scope: { executionProfileId: DELTA_CAUSAL_INNER_PROFILE_ID } });
    const input = structuredClone(terminalIngress);
    input.event.payload.usage.cpu_seconds = 121;
    await expect(capped.service.ingest(input as never)).rejects.toMatchObject({ code: "RESEARCH_PROGRESS_INVALID" });
    expect(capped.progress.persistIngress).not.toHaveBeenCalled();
  });

  it.each(["p10.delta-signal-notional-per-fold-decay.v1", "p10.delta-signal-notional-three-window-optimized.v1"])("FULL02 %s materializes retained reports with its own 120s budget", async executionProfileId => {
    const target = subject({scope:{executionProfileId}, reportRefuses:true});
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try { await target.service.ingest(terminalIngress as never); } finally { stderr.mockRestore(); }
    expect(target.reports.materializeTerminal).toHaveBeenCalledWith(expect.anything(), expect.anything(), "RS02_RETAINED_CURRENT_SOURCE");
    expect(target.progress.markTerminalMaterialized).toHaveBeenCalledTimes(1);
    const excessive = structuredClone(terminalIngress);
    excessive.event.payload.usage.cpu_seconds = 121;
    await expect(target.service.ingest(excessive as never)).rejects.toMatchObject({code:"RESEARCH_PROGRESS_INVALID"});
    await expect(target.service.ingest({...terminalIngress, evidence:{}} as never)).rejects.toMatchObject({code:"RESEARCH_PROGRESS_INVALID"});
  });
  it("pinned audit completes its persisted terminal without a fabricated P04 report and retries idempotently", async () => {
    const audit = subject({ scope: { executionProfileId: PINNED_AUDIT_PROFILE_ID }, reportRefuses: true });
    const input = structuredClone(terminalIngress);
    input.event.payload.usage.cpu_seconds = 119;
    await audit.service.ingest(input as never);
    await audit.service.ingest(input as never);
    expect(audit.reports.materializeTerminal).not.toHaveBeenCalled();
    expect(audit.metadata.finishDurableJob).toHaveBeenCalledTimes(2);
    expect(audit.progress.markTerminalMaterialized).toHaveBeenCalledTimes(2);
    expect(audit.metadata.finishDurableJob.mock.invocationCallOrder[0])
      .toBeLessThan(audit.progress.markTerminalMaterialized.mock.invocationCallOrder[0]!);
  });

  it("pinned audit retains its own CPU bound and refuses P04 sidecars before persistence", async () => {
    const audit = subject({ scope: { executionProfileId: PINNED_AUDIT_PROFILE_ID } });
    const input = structuredClone(terminalIngress);
    input.event.payload.usage.cpu_seconds = 121;
    await expect(audit.service.ingest(input as never)).rejects.toMatchObject({ code: "RESEARCH_PROGRESS_INVALID" });
    for (const sidecar of [{ evidence: {} }, { split: {} },
      { event: { ...terminalIngress.event, payload: { ...terminalIngress.event.payload, evidence_digest: "a".repeat(64) } } }]) {
      await expect(audit.service.ingest({ ...terminalIngress, ...sidecar } as never))
        .rejects.toMatchObject({ code: "RESEARCH_PROGRESS_INVALID" });
    }
    expect(audit.progress.persistIngress).not.toHaveBeenCalled();
    expect(audit.metadata.finishDurableJob).not.toHaveBeenCalled();
  });

  it("RF01-B3: projects retained tables without widening the vocabulary or leaking identity", async () => {
    const sealedAt = new Date("2026-09-23T00:00:00.000Z");
    const { service } = subject({ current: {
      runId: "run_rs01", jobState: "SUCCEEDED", progress: null,
      sourceLatestSequence: 9, retentionFloorSequence: 0, receivedAt: null,
      hasCurrentAttempt: true, terminalMaterialization: "READY",
      retainedArtifacts: [
        { tableKind: "equity", state: "CORRUPT", totalRows: "12", totalBytes: "4096", sealedAt },
        { tableKind: "trades", state: "WRITING", totalRows: "0", totalBytes: "0", sealedAt: null },
      ],
    } });
    const response = await service.read(
      { role: "ADMIN" } as never,
      { workspaceId: "research-workspace", actorUserId: "research-owner" },
      "run_rs01",
    );
    expect(response.retained_artifacts).toEqual([
      { table_kind: "equity", state: "CORRUPT", total_rows: "12", total_bytes: "4096", sealed_at_utc_ms: sealedAt.valueOf(), reader_href: null },
      { table_kind: "trades", state: "WRITING", total_rows: "0", total_bytes: "0", sealed_at_utc_ms: null, reader_href: null },
    ]);
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

  it("keeps a source-terminal snapshot in FINISHING while P06 lifecycle application is pending", async () => {
    const { service } = subject({ current: {
      runId: "run_rs01", jobState: "RUNNING", progress: null,
      sourceLatestSequence: 9, retentionFloorSequence: 0, receivedAt: null,
      hasCurrentAttempt: true, terminalMaterialization: "PENDING", retainedArtifacts: [],
    } });
    const response = await service.read(
      { role: "ADMIN" } as never,
      { workspaceId: "research-workspace", actorUserId: "research-owner" },
      "run_rs01",
    );
    expect(response.current.effective_status).toBe("FINISHING");
    expect(response.current.terminal_materialization).toBe("PENDING");
  });

  it("distinguishes queued and cancelled-before-source from missing source callbacks", async () => {
    for (const [jobState, availability, effectiveStatus] of [
      ["QUEUED", "QUEUED_NO_SOURCE", "QUEUED"],
      ["CANCELLED", "CANCELLED_BEFORE_SOURCE", "CANCELLED"],
      ["RUNNING", "PENDING_SOURCE_CALLBACK", "RUNNING"],
    ] as const) {
      const { service } = subject({ current: {
        runId: "run_rs01", jobState, progress: null,
        sourceLatestSequence: 0, retentionFloorSequence: 0, receivedAt: null,
        hasCurrentAttempt: jobState !== "QUEUED", terminalMaterialization: "NOT_REQUIRED", retainedArtifacts: [],
      } });
      const response = await service.read(
        { role: "ADMIN" } as never,
        { workspaceId: "research-workspace", actorUserId: "research-owner" },
        "run_rs01",
      );
      expect(response.availability).toBe(availability);
      expect(response.current.effective_status).toBe(effectiveStatus);
      expect(response.progress).toBeNull();
      if (jobState === "CANCELLED") {
        expect(response.current.terminal_resolution).toBe("CONTROL_CANCELLATION");
      }
    }
  });
});
