/**
 * W2 (RF-05 P11): CG-P11-03/-06/-07/-08/-09 at the Control API boundary.
 *
 * Each case pins one truth rule: identity and declared folds come from the
 * immutable P08/P10 rows, a withheld holdout is a typed DENIED card, a
 * retry-not-before instant exists only while the job waits to retry, a lost
 * lease keeps its lapse instant apart from the moment it was recorded,
 * unmeasured usage stays null end to end, and every live stream frame
 * carries the viewer's current read.
 */

import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { ResearchProgressController } from "../src/research/progress.controller";
import {
  ResearchProgressEventSchema,
  ResearchProgressIngressSchema,
  ResearchProgressSnapshotSchema,
} from "../src/research/progress.contract";
import { ResearchProgressService } from "../src/research/progress.service";

const event = {
  schema_version: "research.progress-event.v1" as const,
  run_id: "run_w2",
  attempt_id: "ra_w2",
  lease_epoch: 2,
  sequence: 4,
  event_type: "run_started" as const,
  occurred_at_utc_ms: 1_790_000_000_000,
  payload: {},
};

const certificate = {
  state: "NOT_PUBLISHED" as const,
  grade: null,
  issued_at_utc_ms: null,
  reason_code: "SOURCE_DID_NOT_PUBLISH_METHODOLOGY_CERTIFICATE" as const,
};

const snapshot = {
  schema_version: "research.progress-snapshot.v1" as const,
  run_id: "run_w2",
  attempt_id: "ra_w2",
  lease_epoch: 2,
  status: "RUNNING" as const,
  created_at_utc_ms: 1_790_000_000_000,
  updated_at_utc_ms: 1_790_000_000_000,
  latest_sequence: 4,
  retention_floor_sequence: 0,
  stages: ["S1", "S2", "S3", "S4", "S5"].map((key) => ({
    key, state: "PENDING", started_at_utc_ms: null, completed_at_utc_ms: null,
  })),
  overall: { pct: 10, elapsed_s: 3, eta_s: null, trials_done: 0, trials_declared: 3, tqdm_line: "global study · trial 0/3" },
  budget: { used: "0.000", cap: "2.000", unit: "core-min" as const, pct: 0 },
  folds: [],
  artifacts: [],
  claim: { state: "FORECAST" as const, text: "forecast", cursor: null, methodology_certificate: certificate },
  readiness: { mandatory: "PENDING" as const, optional: "NOT_APPLICABLE" as const },
  failure: null,
  source: { kind: "DURABLE_P10" as const, coverage: "ACTUAL_HOOKS" as const, partial: false },
};

const digest = "c".repeat(64);

describe("W2 P11 event and snapshot contract", () => {
  it("accepts every event and the terminal snapshot the Python W2 journal really wrote", () => {
    const fixture = JSON.parse(readFileSync(join(__dirname, "research-progress-w2.fixture.json"), "utf8")) as {
      events: Array<Record<string, unknown>>;
      snapshot: Record<string, unknown>;
    };
    for (const journalled of fixture.events) {
      const parsed = ResearchProgressEventSchema.safeParse(journalled);
      expect(parsed.success, JSON.stringify(journalled)).toBe(true);
    }
    const trials = fixture.events.filter((item) => item.event_type === "trial_completed");
    expect(trials.map((item) => (item.payload as { overall_pct: number }).overall_pct)).toEqual([33, 56, 80]);
    const snapshot = ResearchProgressSnapshotSchema.parse(fixture.snapshot);
    expect(snapshot.claim.handoff_cursor).toEqual({ fold: 2, trial: 1, params_digest: "e".repeat(64) });
    expect(snapshot.folds.map((fold) => fold.selection.state)).toEqual(["AVAILABLE", "AVAILABLE"]);
    const terminal = fixture.events.at(-1)!;
    expect(ResearchProgressIngressSchema.safeParse({
      schema_version: "research.progress-ingress.v1",
      workspace_id: "workspace_w2",
      run_id: fixture.snapshot.run_id,
      job_id: "job_w2",
      worker_attempt_id: fixture.snapshot.attempt_id,
      lease_epoch: fixture.snapshot.lease_epoch,
      event: terminal,
      snapshot: fixture.snapshot,
    }).success).toBe(true);
  });

  it("CG-P11-09: unmeasured usage is null, never a fabricated zero", () => {
    const completed = {
      ...event,
      event_type: "run_completed" as const,
      payload: { usage: { peak_rss_bytes: 314_572_800, cpu_seconds: 6, scratch_bytes: null, fd_peak: null } },
    };
    expect(ResearchProgressEventSchema.safeParse(completed).success).toBe(true);
    const failed = {
      ...event,
      event_type: "run_failed" as const,
      payload: {
        code: "USER_CANCELLED", message: "run cancelled by researcher",
        usage: { peak_rss_bytes: null, cpu_seconds: null, scratch_bytes: null, fd_peak: null },
      },
    };
    expect(ResearchProgressEventSchema.safeParse(failed).success).toBe(true);
    // A key may be null; it may not disappear or become a string.
    expect(ResearchProgressEventSchema.safeParse({
      ...completed, payload: { usage: { peak_rss_bytes: 1, cpu_seconds: 1, scratch_bytes: null } },
    }).success).toBe(false);
    expect(ResearchProgressEventSchema.safeParse({
      ...completed, payload: { usage: { peak_rss_bytes: 1, cpu_seconds: "1", scratch_bytes: null, fd_peak: null } },
    }).success).toBe(false);
  });

  it("CG-P10-04: a global-study trial names no fold, and a fold trial must", () => {
    const trial = (payload: Record<string, unknown>) => ResearchProgressEventSchema.safeParse({
      ...event, event_type: "trial_completed", payload,
    }).success;
    expect(trial({
      study: "GLOBAL", trial: 2, state: "COMPLETE", objective: "-9.806075711302508",
      best_objective: "-9.806075711302508", eta_s: 4, overall_pct: 56,
      tqdm_line: "global study · trial 2/3 · best J -9.806 · pruned 0/2",
    })).toBe(true);
    expect(trial({ study: "GLOBAL", trial: 3, state: "PRUNED", objective: null, best_objective: null, eta_s: null })).toBe(true);
    expect(trial({ study: "GLOBAL", fold: 1, trial: 1 })).toBe(false);
    expect(trial({ trial: 1 })).toBe(false);
    expect(trial({ fold: 1, trial: 1, state: "COMPLETE" })).toBe(true);
    expect(trial({ fold: 1, trial: 1, objective: "1e5" })).toBe(false);
  });

  it("CG-P11-03: fold selection and the structured hand-off cursor are typed facts", () => {
    const fold = ResearchProgressEventSchema.safeParse({
      ...event, event_type: "fold_completed",
      payload: { fold: 2, selection: { scope: "GLOBAL_STUDY", trial: 1, objective: "-9.8", params_digest: digest } },
    });
    expect(fold.success).toBe(true);
    const fixed = ResearchProgressEventSchema.safeParse({
      ...event, event_type: "fold_completed",
      payload: { fold: 1, selection: { scope: "FIXED_PROFILE", trial: 1, objective: null, params_digest: digest } },
    });
    expect(fixed.success).toBe(true);
    expect(ResearchProgressEventSchema.safeParse({
      ...event, event_type: "fold_completed",
      payload: { fold: 1, selection: { scope: "GLOBAL_STUDY", trial: 1, objective: "1", params_digest: "short" } },
    }).success).toBe(false);
    const completed = ResearchProgressEventSchema.safeParse({
      ...event, event_type: "run_completed",
      payload: {
        usage: { peak_rss_bytes: 1, cpu_seconds: 1, scratch_bytes: null, fd_peak: null },
        handoff_cursor: { fold: 2, trial: 1, params_digest: digest },
      },
    });
    expect(completed.success).toBe(true);

    const parsed = ResearchProgressSnapshotSchema.parse({
      ...snapshot,
      folds: [{
        fold: 2, state: "DONE", started_at_utc_ms: 1, completed_at_utc_ms: 1,
        selection: { state: "AVAILABLE", scope: "GLOBAL_STUDY", trial: 1, objective: "-9.8", params_digest: digest, reason_code: null },
      }],
      claim: { ...snapshot.claim, state: "NOT_ISSUED", handoff_cursor: { fold: 2, trial: 1, params_digest: digest } },
    });
    expect(parsed.claim.handoff_cursor).toEqual({ fold: 2, trial: 1, params_digest: digest });
    expect(parsed.folds[0]!.selection.state).toBe("AVAILABLE");
  });

  it("CG-P11-03: an older snapshot reads the new facts as typed absence", () => {
    const parsed = ResearchProgressSnapshotSchema.parse({
      ...snapshot,
      folds: [{ fold: 1, state: "DONE", started_at_utc_ms: 1, completed_at_utc_ms: 2 }],
    });
    expect(parsed.folds[0]!.selection).toEqual({
      state: "NOT_PUBLISHED", scope: null, trial: null, objective: null, params_digest: null,
      reason_code: "SOURCE_DID_NOT_PUBLISH_FOLD_SELECTION",
    });
    expect(parsed.claim.handoff_cursor).toBeNull();
    // An AVAILABLE selection must carry its digest; NOT_PUBLISHED must not.
    expect(ResearchProgressSnapshotSchema.safeParse({
      ...snapshot,
      folds: [{
        fold: 1, state: "DONE", started_at_utc_ms: 1, completed_at_utc_ms: 2,
        selection: { state: "AVAILABLE", scope: "GLOBAL_STUDY", trial: 1, objective: null, params_digest: null, reason_code: null },
      }],
    }).success).toBe(false);
  });

  it("CG-P11-09: run_completed declares its terminal digests and handoff at ingress", () => {
    const ingress = {
      schema_version: "research.progress-ingress.v1" as const,
      workspace_id: "workspace_w2",
      run_id: "run_w2",
      job_id: "job_w2",
      worker_attempt_id: "ra_w2",
      lease_epoch: 2,
      event: {
        ...event,
        event_type: "run_completed" as const,
        payload: {
          usage: { peak_rss_bytes: null, cpu_seconds: 5, scratch_bytes: null, fd_peak: null },
          handoff_cursor: { fold: 1, trial: 1, params_digest: digest },
        },
      },
      snapshot: { ...snapshot, status: "COMPLETED" as const, readiness: { mandatory: "SEALED" as const, optional: "NOT_APPLICABLE" as const } },
    };
    expect(ResearchProgressIngressSchema.safeParse(ingress).success).toBe(true);
  });
});

const scope = { workspaceId: "research-workspace", actorUserId: "research-owner" };

function identity(overrides: Record<string, unknown> = {}) {
  return {
    alphaId: "alpha_delta", alphaName: "Delta RSI", alphaVersionId: "av_delta_1",
    executionProfileId: "p10.delta-signal-notional-wfo.v1",
    protocol: "advanced", mode: "mode_1_decay", schedule: "global",
    symbol: "BTCUSDT", timeframe: "1h", executionRoute: "signal_notional",
    engineReleaseId: "er_quantbt_111", configDigest: "a".repeat(64),
    requestedSpecDigest: "e".repeat(64), createdAt: new Date("2026-09-24T17:00:00.000Z"),
    declaredFoldCount: 2, sealedHoldout: null, requestedSpecRetained: true,
    ...overrides,
  };
}

function runRead(overrides: Record<string, unknown> = {}) {
  return {
    runId: "run_w2", jobState: "RUNNING", progress: null,
    sourceLatestSequence: 4, retentionFloorSequence: 0, receivedAt: null,
    hasCurrentAttempt: true, terminalMaterialization: "NOT_REQUIRED", retainedArtifacts: [],
    queueClass: "HEAVY", queuedAt: new Date("2026-09-24T17:00:00.000Z"),
    retryNotBefore: null, attempts: [], identity: identity(),
    ...overrides,
  };
}

function service(current: Record<string, unknown>, flags: Record<string, string> = {}) {
  const progress = {
    readRun: vi.fn().mockResolvedValue(current),
    resolveIngress: vi.fn().mockResolvedValue({ ...scope, jobId: "job_w2", workerAttemptId: "ra_w2", leaseEpoch: 2, executionProfileId: "p10.delta-signal-notional-wfo.v1" }),
    persistIngress: vi.fn(),
    markTerminalMaterialized: vi.fn().mockResolvedValue(undefined),
    requestedSpec: vi.fn(),
    currentLease: vi.fn(),
  };
  const metadata = { finishDurableJob: vi.fn().mockResolvedValue(undefined), markDurableJobRunning: vi.fn(), heartbeatDurableJob: vi.fn() };
  const fanout = { publish: vi.fn(), subscribe: vi.fn() };
  const subject = new ResearchProgressService(
    progress as never, metadata as never, fanout as never, {} as never,
    { ingest: vi.fn() } as never, { ingest: vi.fn() } as never, { materializeTerminal: vi.fn() } as never,
    { FEATURE_RESEARCH_PROGRESS: "true", FEATURE_RESEARCH_RUN_PRODUCER: "true", RESEARCH_RUN_PRODUCER_LEASE_SECONDS: 60, ...flags } as never,
  );
  return { subject, progress, metadata, fanout };
}

describe("W2 P11 read", () => {
  it("CG-P11-03: publishes run identity and the declared fold count from P08/P10 rows", async () => {
    const { subject } = service(runRead());
    const read = await subject.read({ role: "USER" } as never, scope, "run_w2");
    expect(read.run).toEqual({
      alpha: { alpha_id: "alpha_delta", alpha_name: "Delta RSI", alpha_version_id: "av_delta_1" },
      execution_profile_id: "p10.delta-signal-notional-wfo.v1",
      protocol: "advanced",
      mode: "mode_1_decay",
      schedule: "global",
      instrument: { symbol: "BTCUSDT", timeframe: "1h" },
      execution_route: "signal_notional",
      engine_release_id: "er_quantbt_111",
      config_digest: "a".repeat(64),
      requested_spec_digest: "e".repeat(64),
      created_at_utc_ms: Date.parse("2026-09-24T17:00:00.000Z"),
      declared_folds: { state: "DECLARED", count: 2, reason_code: null },
    });
    expect(read.denied_artifacts).toEqual([]);
  });

  it("CG-P11-03: a sealed P08 holdout is a DENIED card with its row count, never a reader link", async () => {
    const { subject } = service(runRead({
      identity: identity({
        executionProfileId: "p04.fixed-qualification.v1", protocol: "three_window_decay", declaredFoldCount: 1,
        sealedHoldout: { startUtcMs: 1_786_060_800_000, endExclusiveUtcMs: 1_787_270_400_000, bars: 336 },
      }),
    }));
    const read = await subject.read({ role: "USER" } as never, scope, "run_w2");
    expect(read.denied_artifacts).toEqual([{
      name: "sealed holdout",
      state: "DENIED",
      reason_code: "P08_SEALED_HOLDOUT_UNLOCK_NOT_INSTALLED",
      rows: "336",
      range: { start_utc_ms: 1_786_060_800_000, end_exclusive_utc_ms: 1_787_270_400_000 },
      reader_href: null,
    }]);
    expect(read.run?.declared_folds).toEqual({ state: "DECLARED", count: 1, reason_code: null });
  });

  it("CG-P11-03: a missing topology is a typed NOT_PUBLISHED fold declaration", async () => {
    const { subject } = service(runRead({ identity: identity({ declaredFoldCount: null }) }));
    const read = await subject.read({ role: "USER" } as never, scope, "run_w2");
    expect(read.run?.declared_folds).toEqual({
      state: "NOT_PUBLISHED", count: null, reason_code: "P08_TOPOLOGY_DID_NOT_DECLARE_FOLDS",
    });
  });

  it("CG-P11-06: retry_not_before is published only while the job waits to retry", async () => {
    const at = new Date("2026-09-24T17:30:00.000Z");
    for (const [jobState, expected] of [
      ["CANCELLED", null], ["FAILED", null], ["RUNNING", null], ["RETRY_WAIT", at.valueOf()],
    ] as const) {
      const { subject } = service(runRead({ jobState, retryNotBefore: at }));
      const read = await subject.read({ role: "USER" } as never, scope, "run_w2");
      expect(read.queue.retry_not_before_utc_ms).toBe(expected);
    }
  });

  it("CG-P11-06: a lost lease keeps its lapse instant apart from when the scheduler recorded it", async () => {
    const claimed = new Date("2026-09-24T17:00:00.000Z");
    const lapsed = new Date("2026-09-24T17:02:00.000Z");
    const recorded = new Date("2026-09-24T17:18:00.000Z");
    const { subject } = service(runRead({
      jobState: "CANCELLED",
      attempts: [
        { ordinal: 1, state: "LOST_LEASE", claimedAt: claimed, startedAt: null, endedAt: recorded, leaseExpiresAt: lapsed },
        { ordinal: 2, state: "SUCCEEDED", claimedAt: recorded, startedAt: recorded, endedAt: recorded, leaseExpiresAt: recorded },
      ],
    }));
    const read = await subject.read({ role: "USER" } as never, scope, "run_w2");
    expect(read.attempts[0]).toEqual({
      ordinal: 1, state: "LOST_LEASE",
      claimed_at_utc_ms: claimed.valueOf(), started_at_utc_ms: null,
      ended_at_utc_ms: recorded.valueOf(), lease_expired_at_utc_ms: lapsed.valueOf(),
    });
    // Only a lost lease has a lapse instant; a finished attempt's lease simply ended.
    expect(read.attempts[1]!.lease_expired_at_utc_ms).toBeNull();
  });

  it("CG-P11-07: the retry reason names no phantom route and points at a real clone read", async () => {
    const { subject } = service(runRead({ jobState: "FAILED" }));
    const read = await subject.read({ role: "USER" } as never, scope, "run_w2");
    expect(read.current.may_retry).toBe(false);
    expect(read.current.retry_reason).toBe("FAIL_CLOSED_NEW_RUN_FROM_REQUESTED_SPEC");
    expect(read.current.new_run_from).toEqual({ state: "AVAILABLE", reason_code: null });
    const missing = service(runRead({ identity: identity({ requestedSpecRetained: false }) }));
    const unavailable = await missing.subject.read({ role: "USER" } as never, scope, "run_w2");
    expect(unavailable.current.new_run_from).toEqual({
      state: "NOT_AVAILABLE", reason_code: "RUN_REQUESTED_SPEC_NOT_RETAINED",
    });
  });
});

describe("W2 requested-spec read (CG-P11-07)", () => {
  const spec = {
    schema_version: "research.requested-spec.v1", alpha_binding: { alpha_id: "alpha_delta" },
    not_publishable: false, protocol: "advanced", optimization_mode: "mode_1_decay",
  };

  it("returns the immutable requested spec and says a clone is a NEW intent", async () => {
    const { subject, progress } = service(runRead());
    progress.requestedSpec.mockResolvedValue({
      runId: "run_w2", requestedSpec: spec, requestedSpecDigest: "e".repeat(64),
      alphaId: "alpha_delta", alphaVersionId: "av_delta_1",
      executionProfileId: "p10.delta-signal-notional-wfo.v1", createdAt: new Date("2026-09-24T17:00:00.000Z"),
    });
    const read = await subject.requestedSpec(scope, "run_w2");
    expect(read).toEqual({
      schema_version: "research.run-requested-spec.v1",
      run_id: "run_w2",
      requested_spec: spec,
      requested_spec_digest: "e".repeat(64),
      alpha_id: "alpha_delta",
      alpha_version_id: "av_delta_1",
      execution_profile_id: "p10.delta-signal-notional-wfo.v1",
      created_at_utc_ms: Date.parse("2026-09-24T17:00:00.000Z"),
      clone: { intent_kind: "NEW", requires_fresh_preflight: true },
    });
  });

  it("is dark with the run producer", async () => {
    const { subject } = service(runRead(), { FEATURE_RESEARCH_RUN_PRODUCER: "false" });
    await expect(subject.requestedSpec(scope, "run_w2")).rejects.toMatchObject({ status: 503 });
  });
});

describe("W2 ingest and stream (CG-P11-08, CG-P11-09)", () => {
  it("passes unmeasured usage to P06 as null and fans out the run read with the event", async () => {
    const current = runRead({ jobState: "SUCCEEDED", terminalMaterialization: "READY" });
    const { subject, progress, metadata, fanout } = service(current);
    const ingress = {
      run_id: "run_w2",
      event: {
        event_type: "run_completed", sequence: 9,
        payload: { usage: { peak_rss_bytes: 1_024, cpu_seconds: 6, scratch_bytes: null, fd_peak: null } },
      },
      snapshot: { status: "COMPLETED", readiness: { mandatory: "SEALED" }, latest_sequence: 9 },
    };
    progress.persistIngress.mockResolvedValue({ inserted: true, event: ingress.event, snapshot: ingress.snapshot });
    await subject.ingest(ingress as never);
    expect(metadata.finishDurableJob).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      usage: { peakRssBytes: 1_024, cpuSeconds: 6, scratchBytes: null, fdPeak: null },
    }));
    expect(fanout.publish).toHaveBeenCalledWith("run_w2", expect.objectContaining({ run: current }));
  });

  it("still fans out the event when the post-ingest read is unavailable", async () => {
    const { subject, progress, fanout } = service(runRead());
    progress.readRun.mockRejectedValue(new Error("pool exhausted"));
    const ingress = {
      run_id: "run_w2",
      event: { event_type: "heartbeat", sequence: 5, payload: {} },
      snapshot: { status: "RUNNING", readiness: { mandatory: "PENDING" }, latest_sequence: 5 },
    };
    progress.persistIngress.mockResolvedValue({ inserted: true, event: ingress.event, snapshot: ingress.snapshot });
    await subject.ingest(ingress as never);
    expect(fanout.publish).toHaveBeenCalledWith("run_w2", expect.objectContaining({ run: null }));
  });

  it("maps the fanned-out run read per viewer: may_cancel follows the viewer's role", () => {
    const { subject, fanout } = service(runRead());
    let deliver: (envelope: unknown) => void = () => undefined;
    fanout.subscribe.mockImplementation((_runId: string, listener: (envelope: unknown) => void) => {
      deliver = listener;
      return () => undefined;
    });
    const seen: Array<{ read: { current: { may_cancel: boolean } } | null }> = [];
    subject.subscribe({ role: "USER" } as never, "run_w2", (frame) => seen.push(frame as never));
    deliver({ event: { ...event, event_type: "heartbeat" }, snapshot: null, run: runRead() });
    deliver({ event: { ...event, sequence: 5, event_type: "heartbeat" }, snapshot: null, run: null });
    expect(seen[0]!.read!.current.may_cancel).toBe(false);
    expect(seen[1]!.read).toBeNull();

    const admin: Array<{ read: { current: { may_cancel: boolean } } | null }> = [];
    subject.subscribe({ role: "ADMIN" } as never, "run_w2", (frame) => admin.push(frame as never));
    deliver({ event: { ...event, sequence: 6, event_type: "heartbeat" }, snapshot: null, run: runRead() });
    expect(admin[0]!.read!.current.may_cancel).toBe(true);
  });

  it("writes the read on live frames, null on replayed frames, and omits an oversized read", async () => {
    vi.useFakeTimers();
    const raw = Object.assign(new EventEmitter(), {
      writeHead: vi.fn(), write: vi.fn((_chunk: string) => true), end: vi.fn(), headersSent: false,
    });
    let live: (envelope: unknown) => void = () => undefined;
    const replayed = { ...event, sequence: 1, event_type: "stage_started", payload: { stage: "S1" } };
    const opening = { schema_version: "research.progress-read.v1", run_id: "run_w2", current: { effective_status: "RUNNING" }, progress: null };
    const small = { schema_version: "research.progress-read.v1", run_id: "run_w2", current: { may_cancel: false } };
    const huge = { ...small, padding: "x".repeat(400 * 1_024) };
    const svc = {
      subscribe: vi.fn((_user: unknown, _run: string, listener: (envelope: unknown) => void) => {
        live = listener;
        return () => undefined;
      }),
      events: vi.fn().mockResolvedValue({ events: [replayed], sourceLatestSequence: 1, retentionFloorSequence: 0 }),
      read: vi.fn().mockResolvedValue(opening),
    };
    const controller = new ResearchProgressController(
      svc as never,
      { isMember: vi.fn().mockResolvedValue(true) } as never,
      { sessions: { isActiveLease: vi.fn().mockResolvedValue(true) } } as never,
      { PORTAL_PUBLIC_ORIGIN: "https://portal.example" } as never,
    );
    const request = {
      portalUser: { userId: "viewer", role: "USER" }, portalWorkspaceId: "research-workspace",
      portalSession: { sessionId: "s", userId: "viewer", sessionVersion: 1 }, headers: {},
    };
    try {
      await controller.events(request as never, { raw, hijack: vi.fn(), status: vi.fn() } as never, "run_w2", {});
      live({ event: { ...event, sequence: 2, event_type: "heartbeat" }, snapshot: null, read: small });
      live({ event: { ...event, sequence: 3, event_type: "heartbeat" }, snapshot: null, read: huge });
      const frames = raw.write.mock.calls
        .map(([chunk]) => String(chunk))
        .filter((chunk) => chunk.includes("event: research.progress\n"))
        .map((chunk) => JSON.parse(chunk.split("data: ")[1]!));
      expect(frames).toHaveLength(3);
      expect(frames[0]).toMatchObject({ event: { sequence: 1 }, read: null });
      expect(frames[0]).not.toHaveProperty("read_omitted_reason");
      expect(frames[1]).toMatchObject({ event: { sequence: 2 }, read: small });
      expect(frames[2]).toMatchObject({
        event: { sequence: 3 }, read: null, read_omitted_reason: "P11_STREAM_READ_OVER_FRAME_BUDGET",
      });
      expect(svc.subscribe).toHaveBeenCalledWith(request.portalUser, "run_w2", expect.any(Function));
    } finally {
      raw.emit("close");
      vi.useRealTimers();
    }
  });
});
