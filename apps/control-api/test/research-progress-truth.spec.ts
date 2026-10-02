import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ResearchProgressEventSchema, ResearchProgressSnapshotSchema, toPublicResearchProgressSnapshot } from "../src/research/progress.contract";
import { ResearchProgressService } from "../src/research/progress.service";
import { DELTA_WFO_PROFILE_ID } from "../src/research/delta-wfo.profile";
import { DELTA_WFO_V2_PROFILE_ID } from "../src/research/delta-wfo-v2.profile";
import { openApiValidator } from "./research-rf05-openapi";

const fixture = JSON.parse(readFileSync(join(__dirname, "research-progress-w2.fixture.json"), "utf8"));
const scope = { workspaceId: "truth-workspace", actorUserId: "truth-user" };
const sourceSnapshot = () => ResearchProgressSnapshotSchema.parse(structuredClone(fixture.snapshot));

function build(row: Record<string, unknown>, events: unknown[] = []) {
  const repository = {
    readRun: vi.fn().mockResolvedValue({
      runId: fixture.snapshot.run_id, jobState: "FAILED", lifecycleStatus: "FAILED", progress: null,
      queueClass: "HEAVY", queuedAt: new Date(1_790_000_000_000), retryNotBefore: null, attempts: [],
      terminalMaterialization: "READY", sourceLatestSequence: 0, retentionFloorSequence: 0,
      receivedAt: null, retainedArtifacts: [], identity: null, ...row,
    }),
    events: vi.fn().mockResolvedValue({ events, sourceLatestSequence: 405, retentionFloorSequence: 1 }),
  };
  const service = new ResearchProgressService(repository as never, {} as never, {} as never, {} as never,
    {} as never, {} as never, {} as never, { FEATURE_RESEARCH_PROGRESS: "true" } as never);
  vi.spyOn(service, "reconcileBestEffort").mockResolvedValue(undefined);
  return { service, repository };
}

describe("B8 S03 progress authority and terminal observations", () => {
  it.each([DELTA_WFO_PROFILE_ID, DELTA_WFO_V2_PROFILE_ID])("labels ordinal and original source id without rewriting %s source", (profile) => {
    const source = sourceSnapshot();
    source.folds[0]!.selection.trial = 351;
    const original = structuredClone(source);
    const projected = toPublicResearchProgressSnapshot(source, profile);
    expect(projected.folds[0]!.selection).toMatchObject({
      trial: 351, display_trial_ordinal: 351, trial_numbering: "P11_ORDINAL_1_BASED", source_trial_id: "350",
      objective_kind: "MODE_1_DECAY_J",
    });
    expect(projected.overall).toMatchObject({ pct_basis: "SOURCE_STAGE_WEIGHTED_V1", elapsed_basis: "SOURCE_JOURNAL_CREATED_TO_LAST_EVENT_V1" });
    expect(source).toEqual(original);
    expect(projected.overall.elapsed_s).toBe(source.overall.elapsed_s);
    expect(projected.overall.rate_trials_per_s).toBe(source.overall.rate_trials_per_s);
    openApiValidator("research-progress.openapi.json", "ProgressSnapshot").assert(projected);
  });

  it("fixed and unpublished selections get no invented source trial id", () => {
    const source = sourceSnapshot();
    source.folds[0]!.selection = { state: "AVAILABLE", scope: "FIXED_PROFILE", trial: 1, objective: null, params_digest: "a".repeat(64), reason_code: null };
    const fixed = toPublicResearchProgressSnapshot(source, "p04.fixed-qualification.v1");
    expect(fixed.folds[0]!.selection).toMatchObject({ display_trial_ordinal: 1, trial_numbering: "P11_ORDINAL_1_BASED" });
    expect(fixed.folds[0]!.selection).not.toHaveProperty("source_trial_id");
    source.folds[0]!.selection = { state: "NOT_PUBLISHED", scope: null, trial: null, objective: null, params_digest: null, reason_code: "SOURCE_DID_NOT_PUBLISH_FOLD_SELECTION" };
    expect(toPublicResearchProgressSnapshot(source, DELTA_WFO_PROFILE_ID).folds[0]!.selection.display_trial_ordinal).toBeNull();
  });

  it("400/400 FAILED remains 80% and nine admitted folds do not become observed execution", async () => {
    const source = sourceSnapshot();
    source.status = "FAILED";
    source.overall = { ...source.overall, pct: 80, trials_done: 400, trials_declared: 400 };
    source.readiness.mandatory = "FAILED";
    source.failure = { code: "ENGINE_ERROR", message: "summary exceeds retained budget" };
    source.folds = [];
    source.stages = source.stages.map((stage) => ({ ...stage,
      state: stage.key === "S4" ? "RUNNING" : stage.key === "S5" ? "PENDING" : "DONE",
      started_at_utc_ms: stage.key === "S5" ? null : stage.started_at_utc_ms,
      completed_at_utc_ms: stage.key === "S4" || stage.key === "S5" ? null : stage.completed_at_utc_ms,
    }));
    const identity = {
      alphaId: "alpha", alphaName: "Delta", alphaVersionId: "av", displayLabel: null,
      executionProfileId: DELTA_WFO_PROFILE_ID, requestedSpecDigest: "a".repeat(64),
      protocol: "advanced", mode: "mode_1_decay", schedule: "global", symbol: "BTCUSDT", timeframe: "1h",
      executionRoute: "signal_notional", engineReleaseId: null, configDigest: null, sealedHoldout: null,
      createdAt: new Date(1_790_000_000_000), declaredFoldCount: 9,
      plannedFolds: Array.from({ length: 9 }, (_, index) => ({ fold: index + 1, testStartUtcMs: index * 2, testEndUtcMs: index * 2 + 1 })),
      requestedSpecRetained: true,
    };
    const { service } = build({ progress: source, identity });
    const read = await service.read({ role: "USER" } as never, scope, source.run_id);
    expect(read.progress!.overall).toMatchObject({ pct: 80, trials_done: 400, pct_basis: "SOURCE_STAGE_WEIGHTED_V1" });
    expect(read.progress!.folds).toEqual([]);
    expect(read.current.fold_reporting).toEqual({ basis: "P08_ADMISSION_AND_P11_JOURNAL_V1", declared_count: 9, planned_count: 9,
      reported_count: 0, done_count: 0, failed_count: 0, reason_code: "SOURCE_DID_NOT_REPORT_FOLDS" });
    expect(read.current.failed_at).toEqual({ stage: "S4", fold: null, basis: "SOURCE_RUNNING_STAGE" });
    expect(read.current.terminal_reason).toEqual({ ...source.failure, origin: "SOURCE" });
    expect(read.current.may_retry).toBe(false);
    openApiValidator("research-progress.openapi.json", "ProgressRead").assert(read);
  });

  it("reports only real DONE/FAILED fold observations and preserves missing segment facts", async () => {
    const source = sourceSnapshot();
    source.folds[1]!.state = "FAILED";
    const { service } = build({ progress: source });
    const read = await service.read({ role: "USER" } as never, scope, source.run_id);
    expect(read.current.fold_reporting).toMatchObject({ reported_count: 2, done_count: 1, failed_count: 1, reason_code: null });
    expect(read.progress!.folds[0]!.fold_timeline.state).toBe("NOT_PUBLISHED");
  });

  it("cancelled before source stays absent: created-to-cancelled queue age is not runtime", async () => {
    const { service } = build({ jobState: "CANCELLED", lifecycleStatus: "CANCELLED" });
    const read = await service.read({ role: "USER" } as never, scope, "cancelled");
    expect(read.progress).toBeNull();
    expect(read.availability).toBe("CANCELLED_BEFORE_SOURCE");
    expect(read.current.fold_reporting).toMatchObject({ reported_count: null, done_count: null, failed_count: null, reason_code: "SOURCE_PROGRESS_NOT_PUBLISHED" });
    expect(read.current.failed_at).toBeNull();
    expect(read.current.terminal_reason).toBeNull();
    expect(read).not.toHaveProperty("elapsed_s");
  });

  it.each([["ENGINE_ERROR", "ERROR"], ["USER_CANCELLED", "WARN"]])("projects journal failure %s once at its original sequence/time", async (code, tone) => {
    const source = ResearchProgressEventSchema.parse({
      ...fixture.events.at(-1), event_type: "run_failed", sequence: 405, occurred_at_utc_ms: 1_790_000_009_000,
      payload: { code, message: "summary exceeds retained budget", usage: { peak_rss_bytes: null, cpu_seconds: null, scratch_bytes: null, fd_peak: null } },
    });
    const original = structuredClone(source);
    const { service, repository } = build({}, [source]);
    const read = await service.console(scope, source.run_id, 400, 5);
    expect(read.lines).toEqual([{ sequence: 405, occurred_at_utc_ms: 1_790_000_009_000, tone,
      text: `${code}: summary exceeds retained budget`, trial: null, fold: null }]);
    expect(repository.events).toHaveBeenCalledWith(scope, source.run_id, 400, 5);
    expect(source).toEqual(original);
  });

  it("does not manufacture an error when the bounded journal page has no terminal event", async () => {
    const { service } = build({ jobTerminalReason: "LEASE_EXPIRED" });
    expect((await service.console(scope, "failure", 400, 5)).lines).toEqual([]);
  });
});
