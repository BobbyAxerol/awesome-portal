/** P11 durable Research Progress BFF/service authority. */

import { Inject, Injectable, Optional } from "@nestjs/common";

import { ControlApiConfig } from "../config";
import type { PortalUser } from "../domain";
import { CONTROL_API_CONFIG } from "../tokens";
import { type ResearchScope, type ResearchWorkerUsage, ResearchMetadataError } from "./contracts";
import { DELTA_WFO_V2_PROFILE_ID } from "./delta-wfo-v2.profile";
import { DELTA_CAUSAL_INNER_PROFILE_ID, DELTA_CAUSAL_INNER_PROFILE } from "./delta-causal-inner.profile";
import {
  type ResearchProgressEvent,
  type ResearchProgressIngress,
  type ResearchProgressPublicEvent,
  type ResearchProgressPublicSnapshot,
  toPublicResearchProgressEvent,
  toPublicResearchProgressSnapshot,
} from "./progress.contract";
import { ResearchProgressError } from "./progress.error";
import { ResearchProgressFanout, type ResearchProgressEnvelope } from "./progress.fanout";
import { ResearchProgressPortalClient } from "./progress.portal-client";
import {
  ResearchProgressRepository,
  type ConvergenceCandidate,
  type ProgressIngressScope,
  type ProgressRunIdentity,
  type ProgressRunRead,
  type StrandedTerminal,
} from "./progress.repository";
import { ResearchMetadataRepository } from "./repository";
import { ResearchEvidenceService } from "./evidence.service";
import { ResearchSplitService } from "./split.service";
import { ResearchReportService } from "./report.service";
import { ResearchMethodologyClaimsService, type MethodologyClaim } from "./methodology-claims";
import {
  DELTA_WFO_PREVIEW_LONG_LIMITS,
  DELTA_WFO_PROFILE,
  DELTA_WFO_PROFILE_ID,
  deltaWfoPreviewLongEnabled,
} from "./delta-wfo.profile";
import { WHATIF_PROFILE, WHATIF_PROFILE_ID } from "./whatif.profile";
import { VN_OBSERVED_FIXED_PROFILE_ID } from "./vn-observed-fixed.profile";
import { PINNED_AUDIT_PROFILE, PINNED_AUDIT_PROFILE_ID } from "./final-audit.contract";
import { ENGINE_110_QUALIFICATION_BINDING, ENGINE_110_QUALIFICATION_BINDING_DIGEST } from "./engine-qualification.profile";
import { sha256ResearchJson } from "./preflight.service";
import {
  RETRY_WAIT_DISPATCH_GRACE_SECONDS,
  STRANDED_TERMINAL_MIN_AGE_SECONDS,
  failedAt,
  parseTerminalReason,
  terminalSidecarFailedReason,
  terminalSidecarPayloadLostReason,
  type FailedAt,
} from "./run-state";

/** The installed P04 fixed-qualification child CPU limit (P10 job cost). */
const P04_FIXED_CHILD_CPU_SECONDS = 45;

/** E10: every non-terminal P06 state may be cancelled by its owner. */
const CANCELLABLE_JOB_STATES = new Set(["QUEUED", "CLAIMED", "RUNNING", "RETRY_WAIT", "CANCEL_REQUESTED"]);
const TERMINAL_JOB_STATES = new Set(["SUCCEEDED", "FAILED", "CANCELLED"]);
const EFFECTIVE_STATUSES = new Set(["QUEUED", "RUNNING", "FINISHING", "COMPLETED", "FAILED", "CANCELLED"]);
/** E10: a read reconciles its workspace at most this often per process. */
const RECONCILE_INTERVAL_MS = 10_000;
const STRANDED_TERMINAL_BATCH = 16;
/** E10-O3: a read looks for stuck work in other workspaces at most this often per process. */
const SWEEP_INTERVAL_MS = 60_000;
/** E10-O3: and reconciles at most this many of them, so one read never pays for many. */
const SWEEP_WORKSPACE_BATCH = 2;
/** E10-O3: the oldest candidates the bounded global lookup returns, deduplicated by workspace here. */
const SWEEP_CANDIDATE_LIMIT = 64;
/**
 * E10-O3: a workspace nobody is reading is reconciled by the sweep at most
 * this often. It is read from the same per-workspace clock E10 established,
 * so a workspace someone *is* reading (≤ 10 s) is never swept: it already
 * converges on its own reads, and the sweep rotates on to another one.
 */
const SWEEP_WORKSPACE_COOLDOWN_MS = 300_000;
/** E10-O3: the per-workspace clock is a cache, not a ledger; drop it whole rather than grow it. */
const RECONCILE_CLOCK_LIMIT = 512;

/** CG-P11-03: run identity from the P10 producer row and its immutable P08 manifest. */
export interface ResearchProgressRunIdentity {
  alpha: { alpha_id: string; alpha_name: string | null; alpha_version_id: string };
  /**
   * D1: the short label the hi-fi prints (`R-WFO-118`). Presentation only —
   * no display id is minted as an identity, `run_id` remains the identity and
   * the only value a request may carry. `null` when none can be derived, and
   * the reader prints the short id rather than a guess.
   */
  display_label: string | null;
  execution_profile_id: string;
  protocol: string | null;
  mode: string | null;
  schedule: string | null;
  instrument: { symbol: string | null; timeframe: string | null };
  execution_route: string | null;
  engine_release_id: string | null;
  config_digest: string | null;
  requested_spec_digest: string;
  created_at_utc_ms: number;
  declared_folds:
    | { state: "DECLARED"; count: number; reason_code: null }
    | { state: "NOT_PUBLISHED"; count: null; reason_code: "P08_TOPOLOGY_DID_NOT_DECLARE_FOLDS" };
  /** P08-admitted boundaries; not a claim that source execution observed each fold. */
  planned_folds:
    | { state: "AVAILABLE"; folds: Array<{ fold: number; test_start_utc_ms: number; test_end_utc_ms: number }>; reason_code: null }
    | { state: "NOT_PUBLISHED"; folds: []; reason_code: "P08_TOPOLOGY_DID_NOT_DECLARE_FOLDS" };
}

/** CG-P11-03: a declared artifact this viewer may not read. Never a link. */
export interface ResearchProgressDeniedArtifact {
  name: "sealed holdout";
  state: "DENIED";
  reason_code: "P08_SEALED_HOLDOUT_UNLOCK_NOT_INSTALLED";
  rows: string | null;
  range: { start_utc_ms: number; end_exclusive_utc_ms: number } | null;
  reader_href: null;
}

export interface ResearchProgressReadResponse {
  schema_version: "research.progress-read.v1";
  run_id: string;
  run: ResearchProgressRunIdentity | null;
  /** Four run-scoped methodology facts. Optional on older/SSE read frames. */
  claims?: MethodologyClaim[];
  queue: {
    queue_class: "INTERACTIVE" | "HEAVY" | "BACKGROUND";
    queued_at_utc_ms: number;
    /** CG-P11-06: set only while the job is in RETRY_WAIT; a stale column never leaks. */
    retry_not_before_utc_ms: number | null;
  };
  attempts: Array<{
    ordinal: number;
    state: "CLAIMED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "LOST_LEASE" | "CANCELLED";
    claimed_at_utc_ms: number;
    started_at_utc_ms: number | null;
    /** For LOST_LEASE: when the scheduler recorded the loss, not when the lease lapsed. */
    ended_at_utc_ms: number | null;
    /** CG-P11-06: when a LOST_LEASE attempt's lease actually lapsed; null otherwise. */
    lease_expired_at_utc_ms: number | null;
  }>;
  availability: "AVAILABLE" | "QUEUED_NO_SOURCE" | "CANCELLED_BEFORE_SOURCE" | "PENDING_SOURCE_CALLBACK";
  current: {
    job_state: string;
    effective_status: "QUEUED" | "RUNNING" | "FINISHING" | "COMPLETED" | "FAILED" | "CANCELLED";
    terminal_resolution: "SOURCE" | "CONTROL_CANCELLATION" | "PENDING";
    /** Journal terminal fact exists but sidecars/lifecycle may still be retrying. */
    terminal_materialization: "NOT_REQUIRED" | "PENDING" | "READY";
    source_latest_sequence: number;
    retention_floor_sequence: number;
    last_received_at_utc_ms: number | null;
    may_cancel: boolean;
    may_retry: false;
    /**
     * CG-P11-07: there is no automatic or in-place retry. The one action is a
     * new run seeded from this run's requested spec
     * (`GET /api/v1/research/runs/{runId}/requested-spec`, then a NEW create).
     */
    retry_reason: "FAIL_CLOSED_NEW_RUN_FROM_REQUESTED_SPEC";
    new_run_from:
      | { state: "AVAILABLE"; reason_code: null }
      | { state: "NOT_AVAILABLE"; reason_code: "RUN_REQUESTED_SPEC_NOT_RETAINED" };
    /** E10: where a FAILED run stopped (the Run Library trail's derivation); null otherwise. */
    failed_at: FailedAt | null;
    /** E10: why a FAILED run failed — the source's failure, else the typed control reason; null otherwise. */
    terminal_reason: { code: string; message: string; origin: "SOURCE" | "CONTROL" } | null;
    /** Planned admission and reported execution are different authorities. Null counts mean no source snapshot. */
    fold_reporting: {
      basis: "P08_ADMISSION_AND_P11_JOURNAL_V1";
      declared_count: number | null;
      planned_count: number | null;
      reported_count: number | null;
      done_count: number | null;
      failed_count: number | null;
      reason_code: "SOURCE_PROGRESS_NOT_PUBLISHED" | "SOURCE_DID_NOT_REPORT_FOLDS" | null;
    };
  };
  progress: ResearchProgressPublicSnapshot | null;
  /**
   * RF01-B3: the run's retained P05 tables in the authority's six-state
   * vocabulary. `artifacts` inside `progress` stays the bundle-readiness list
   * the source journals; this is a different set of things, read from the
   * artifact authority, and the only place `CORRUPT`/`MISSING` can appear.
   */
  retained_artifacts: Array<{
    table_kind: string;
    state: "PENDING" | "WRITING" | "SEALED" | "ABORTED" | "CORRUPT" | "MISSING";
    total_rows: string;
    total_bytes: string;
    sealed_at_utc_ms: number | null;
    reader_href: null;
  }>;
  /** CG-P11-03: declared-but-withheld artifacts (the P08 sealed holdout). */
  denied_artifacts: ResearchProgressDeniedArtifact[];
}

export interface ResearchProgressPublicEnvelope {
  event: ResearchProgressPublicEvent;
  snapshot: ResearchProgressPublicSnapshot | null;
  /** CG-P11-08: this viewer's current read, or null when it could not be materialised. */
  read: ResearchProgressReadResponse | null;
}

/** CG-P11-07: the immutable requested spec a new run may start from. */
export interface ResearchRunRequestedSpecResponse {
  schema_version: "research.run-requested-spec.v1";
  run_id: string;
  requested_spec: Record<string, unknown>;
  requested_spec_digest: string;
  alpha_id: string;
  alpha_version_id: string;
  execution_profile_id: string;
  created_at_utc_ms: number;
  clone: { intent_kind: "NEW"; requires_fresh_preflight: true };
}

export interface ResearchProgressConsoleResponse {
  schema_version: "research.progress-console.v1";
  run_id: string;
  after_seq: number;
  source_latest_sequence: number;
  retention_floor_sequence: number;
  lines: Array<{
    sequence: number;
    occurred_at_utc_ms: number;
    tone: "INFO" | "COMPLETE" | "WARN" | "ERROR";
    text: string;
    trial: number | null;
    fold: number | null;
  }>;
}

/**
 * Source callbacks are accepted only from the exact P10/P06 tuple.  The
 * worker-owned journal is persisted first; lifecycle application is then
 * intentionally idempotent, so an HTTP acknowledgement loss cannot erase a
 * source event or cause a duplicate terminal transition.
 */
@Injectable()
export class ResearchProgressService {
  private readonly reconciledAt = new Map<string, number>();
  /** E10-O3: when this process last looked for stuck work outside the workspace being read. */
  private sweptAt = 0;

  constructor(
    private readonly progress: ResearchProgressRepository,
    private readonly metadata: ResearchMetadataRepository,
    private readonly fanout: ResearchProgressFanout,
    private readonly portal: ResearchProgressPortalClient,
    private readonly evidence: ResearchEvidenceService,
    private readonly split: ResearchSplitService,
    private readonly reports: ResearchReportService,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
    @Optional() private readonly methodologyClaims?: ResearchMethodologyClaimsService,
  ) {}

  async ingest(input: ResearchProgressIngress): Promise<{ accepted: true; latest_sequence: number }> {
    this.requireEnabled();
    const ingressScope = await this.progress.resolveIngress(input);
    for (const source of [input.evidence?.source, input.split?.source]) {
      if (!source) continue;
      const expectedVersion = ingressScope.engineReleaseId === "er_quantbt_110" ? "1.1.0" : "1.1.1";
      const oldBinding = { ...ENGINE_110_QUALIFICATION_BINDING, binding_digest: ENGINE_110_QUALIFICATION_BINDING_DIGEST };
      if (source.engine_version !== expectedVersion || expectedVersion === "1.1.0"
          && (ingressScope.executionProfileId !== "p04.fixed-qualification.v1"
            || sha256ResearchJson(ingressScope.qualificationBinding) !== sha256ResearchJson(oldBinding))) {
        throw new ResearchProgressError("RESEARCH_PROGRESS_INVALID", "Source engine version does not match its immutable producer binding.", 400);
      }
    }
    this.assertProfileBoundIngress(ingressScope, input);
    const persisted = await this.progress.persistIngress(ingressScope, input);
    // P13 is a terminal sidecar only. If its own immutable write temporarily
    // fails, the P11 event remains persisted and the source relay can retry
    // the same digest-bound payload without rerunning QuantBT.
    await this.materializeSidecars(ingressScope, input);
    await this.applyLifecycle(ingressScope, input);
    const isTerminal = input.event.event_type === "run_completed" || input.event.event_type === "run_failed";
    if (isTerminal) await this.progress.markTerminalMaterialized(ingressScope, input);
    // Duplicate terminal delivery is the recovery mechanism after a sidecar
    // or fanout failure.  The immutable journal sequence makes the repeated
    // notification idempotent for SSE consumers.
    if (persisted.inserted || isTerminal) {
      // CG-P11-08 (DQ-13): one read per committed event, shared by every
      // viewer, so the stream carries `current`/`availability` too. A failed
      // read never withholds the already-durable event.
      const run = await this.progress
        .readRun({ workspaceId: ingressScope.workspaceId, actorUserId: ingressScope.actorUserId }, input.run_id)
        .catch(() => null);
      this.fanout.publish(input.run_id, { event: persisted.event, snapshot: persisted.snapshot, run });
    }
    return { accepted: true, latest_sequence: input.snapshot.latest_sequence };
  }

  /**
   * The terminal sidecars, in the one order both paths use: the source's
   * callback (`ingest`) and the E10 settlement of a lost terminal write
   * (`settleStranded`). Each is idempotent over the immutable journal event.
   */
  private async materializeSidecars(ingressScope: ProgressIngressScope, input: ResearchProgressIngress): Promise<void> {
    await this.evidence.ingest(ingressScope, input);
    // P14 follows the same terminal-only idempotent sidecar rule as P13.
    // Its reader has a separate feature flag; persisting a verified source
    // receipt does not activate a browser route or any holdout operation.
    await this.split.ingest(ingressScope, input);
    // P18 is an optional terminal sidecar over the already persisted P13--17
    // projections. It is never an engine/export trigger: a duplicate sealed
    // completion callback is the only recovery path if report assembly needs
    // retrying after a transient local failure.
    // The P18 report is assembled over the P04-shaped P13–P17 projections. A
    // Delta WFO run publishes its facts through the retained current-source
    // lane instead and never has those sidecars, so assembling here would
    // refuse its terminal event forever (seen on the W1 preview with REPORTS
    // on). Its report is P18 work over current-source, not this sidecar.
    // A W5a what-if diagnostic has no report either: it seals one WHATIF_GRID
    // relation for its parent and nothing P04-shaped. A pinned audit likewise
    // seals P05 proof for its parent, not a synthetic fixed/WFO report of its
    // own. Sending that terminal callback to P18 would strand a verified child.
    if (ingressScope.executionProfileId === PINNED_AUDIT_PROFILE_ID) return;
    if (ingressScope.executionProfileId !== DELTA_WFO_PROFILE_ID && ingressScope.executionProfileId !== DELTA_WFO_V2_PROFILE_ID
      && ingressScope.executionProfileId !== DELTA_CAUSAL_INNER_PROFILE_ID && ingressScope.executionProfileId !== WHATIF_PROFILE_ID) {
      await this.reports.materializeTerminal(ingressScope, input);
    } else if (ingressScope.executionProfileId !== WHATIF_PROFILE_ID) {
      // W6a (P18 over current-source): the WFO report is sealed from the
      // retained lane, which the worker seals before `run_completed`. It is a
      // best-effort sidecar (decision W6A-D02): a report failure is logged
      // and never refuses the run's own terminal lifecycle; a duplicate
      // terminal callback retries it idempotently. X2: a `run_failed` seals
      // the failed-run sheet (spec 09 T06) from the terminal snapshot, on
      // both lanes; a what-if diagnostic run seals no report of its own.
      try {
        await this.reports.materializeTerminal(ingressScope, input, "RS02_RETAINED_CURRENT_SOURCE");
      } catch (error) {
        const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : "UNTYPED";
        process.stderr.write(`${JSON.stringify({ event: "research_report_rs02_materialize_failed", run_id: input.run_id, code })}\n`);
      }
    }
  }

  async read(user: PortalUser, scope: ResearchScope, runId: string): Promise<ResearchProgressReadResponse> {
    this.requireEnabled();
    await this.reconcileBestEffort(scope);
    const current = await this.progress.readRun(scope, runId);
    const response = this.readResponse(user, current);
    const identity = current.identity;
    if (this.methodologyClaims) {
      response.claims = await this.methodologyClaims.read(user, scope, runId, {
        releaseId: identity?.engineReleaseId ?? null, mode: identity?.mode ?? null, schedule: identity?.schedule ?? null,
      }, response.current.effective_status === "COMPLETED");
    }
    return response;
  }

  /**
   * E10: converge every run in the workspace that can no longer converge on
   * its own. Control API has no background worker by design, so reads and
   * claims drive this; it is idempotent and bounded.
   *
   * 1. P06 lease recovery (an attempt that journaled a terminal is skipped).
   * 2. A lost terminal write is settled from the journal: the sidecars are
   *    replayed, then the job is finalized — or FAILED with a typed reason
   *    when a sidecar cannot be recorded — and the RS-01 checkpoint written.
   * 3. An overdue RETRY_WAIT with no dispatcher is FAILED with a typed reason.
   */
  async reconcile(scope: ResearchScope): Promise<{ recovered: number; settled: string[]; expired: string[] }> {
    this.requireEnabled();
    const recovered = await this.metadata.recoverExpiredDurableJobs(scope);
    const stranded = await this.progress.strandedTerminals(scope, STRANDED_TERMINAL_MIN_AGE_SECONDS, STRANDED_TERMINAL_BATCH);
    const settled: string[] = [];
    for (const row of stranded) {
      try {
        if (await this.settleStranded(row)) settled.push(row.input.run_id);
      } catch (error) {
        const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : "UNTYPED";
        process.stderr.write(`${JSON.stringify({ event: "research_terminal_settle_failed", run_id: row.input.run_id, code })}\n`);
      }
    }
    const { expired } = await this.metadata.expireOverdueRetryWait(scope);
    return { recovered: recovered.recovered, settled, expired };
  }

  /**
   * A throttled, never-throwing `reconcile` for read paths (Run Progress,
   * Run Library). It converges the workspace being read, and then — E10-O3 —
   * a bounded number of workspaces nobody is reading.
   *
   * The two are deliberately separate budgets. A hot workspace read every
   * second must not starve the sweep, and the sweep must not make a read of
   * one workspace pay for many.
   */
  async reconcileBestEffort(scope: ResearchScope): Promise<void> {
    if (this.config.FEATURE_RESEARCH_PROGRESS !== "true") return;
    await this.reconcileWorkspaceBestEffort(scope, RECONCILE_INTERVAL_MS);
    await this.sweepPendingWorkspacesBestEffort(scope);
  }

  /** One workspace, at most once per `minIntervalMs` per process, never throwing. */
  private async reconcileWorkspaceBestEffort(scope: ResearchScope, minIntervalMs: number): Promise<void> {
    const now = Date.now();
    const last = this.reconciledAt.get(scope.workspaceId);
    if (last !== undefined && now - last < minIntervalMs) return;
    if (this.reconciledAt.size >= RECONCILE_CLOCK_LIMIT) this.reconciledAt.clear();
    this.reconciledAt.set(scope.workspaceId, now);
    try {
      await this.reconcile(scope);
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : "UNTYPED";
      process.stderr.write(`${JSON.stringify({ event: "research_run_reconcile_failed", workspace_id: scope.workspaceId, code })}\n`);
    }
  }

  /**
   * E10-O3: a run stuck in a workspace nobody opens stays stuck, because E10
   * made convergence read-driven and Control API has no Research worker by
   * design. So a read repairs further than it reports: after converging its
   * own workspace it reconciles up to `SWEEP_WORKSPACE_BATCH` others that
   * hold work which can no longer converge on its own.
   *
   * Nothing here reaches the caller. The sweep returns no value, changes no
   * response field, and never throws — a failure is logged and the read that
   * triggered it answers exactly as before. Each swept workspace is
   * reconciled under the identity that already owns the stuck work (the
   * job's requester); if that account is no longer a member the repository's
   * own membership check refuses it and this skips that workspace.
   *
   * Bounded: one indexed lookup per minute per process (migration 069),
   * at most `SWEEP_CANDIDATE_LIMIT` rows from it, at most
   * `SWEEP_WORKSPACE_BATCH` workspaces reconciled per tick, and each of
   * those runs the same already-bounded per-workspace `reconcile`.
   */
  private async sweepPendingWorkspacesBestEffort(scope: ResearchScope): Promise<void> {
    const now = Date.now();
    if (now - this.sweptAt < SWEEP_INTERVAL_MS) return;
    this.sweptAt = now;
    let candidates: ConvergenceCandidate[];
    try {
      candidates = await this.progress.workspacesPendingConvergence(
        scope.actorUserId,
        RETRY_WAIT_DISPATCH_GRACE_SECONDS,
        SWEEP_CANDIDATE_LIMIT,
      );
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : "UNTYPED";
      process.stderr.write(`${JSON.stringify({ event: "research_run_convergence_sweep_failed", code })}\n`);
      return;
    }
    const seen = new Set<string>([scope.workspaceId]);
    let budget = SWEEP_WORKSPACE_BATCH;
    for (const candidate of candidates) {
      if (budget === 0) break;
      if (seen.has(candidate.workspaceId)) continue;
      seen.add(candidate.workspaceId);
      const last = this.reconciledAt.get(candidate.workspaceId);
      if (last !== undefined && now - last < SWEEP_WORKSPACE_COOLDOWN_MS) continue;
      budget -= 1;
      await this.reconcileWorkspaceBestEffort(candidate, SWEEP_WORKSPACE_COOLDOWN_MS);
    }
  }

  private async settleStranded(row: StrandedTerminal): Promise<boolean> {
    const { scope, input } = row;
    const jobTerminal = TERMINAL_JOB_STATES.has(row.jobState);
    let outcome: "SUCCEEDED" | "FAILED" | "CANCELLED";
    let reason: string | undefined;
    if (row.sidecarPayloadLost) {
      outcome = "FAILED";
      reason = terminalSidecarPayloadLostReason();
    } else {
      try {
        await this.materializeSidecars(scope, input);
        if (input.event.event_type === "run_completed") {
          const sealed = input.snapshot.status === "COMPLETED" && input.snapshot.readiness.mandatory === "SEALED";
          outcome = sealed ? "SUCCEEDED" : "FAILED";
          reason = sealed ? undefined : terminalSidecarFailedReason();
        } else {
          outcome = input.event.payload.code === "USER_CANCELLED" ? "CANCELLED" : "FAILED";
          reason = this.failureReason(input.event);
        }
      } catch {
        // The job already closed but its checkpoint did not: the sidecars
        // succeeded once before, so a transient failure is retried next time
        // rather than rewriting a terminal job.
        if (jobTerminal) return false;
        outcome = "FAILED";
        reason = terminalSidecarFailedReason();
      }
    }
    if (!jobTerminal) {
      let usage: ResearchWorkerUsage;
      try {
        usage = this.usage(input.event);
      } catch {
        usage = { peakRssBytes: null, cpuSeconds: null, scratchBytes: null, fdPeak: null };
      }
      await this.metadata.settleJournaledTerminal(
        { workspaceId: scope.workspaceId, actorUserId: scope.actorUserId },
        { jobId: scope.jobId, workerAttemptId: scope.workerAttemptId, leaseEpoch: scope.leaseEpoch, outcome, reason, usage },
      );
    }
    await this.progress.markTerminalMaterialized(scope, input);
    const run = await this.progress
      .readRun({ workspaceId: scope.workspaceId, actorUserId: scope.actorUserId }, input.run_id)
      .catch(() => null);
    this.fanout.publish(input.run_id, { event: input.event, snapshot: input.snapshot, run });
    return true;
  }

  async events(
    scope: ResearchScope,
    runId: string,
    afterSequence: number,
    limit: number,
  ) {
    this.requireEnabled();
    const page = await this.progress.events(scope, runId, afterSequence, limit);
    return {
      ...page,
      events: page.events.map(toPublicResearchProgressEvent),
    };
  }

  async console(
    scope: ResearchScope,
    runId: string,
    afterSequence: number,
    limit: number,
  ): Promise<ResearchProgressConsoleResponse> {
    this.requireEnabled();
    const page = await this.progress.events(scope, runId, afterSequence, limit);
    const lines = page.events.flatMap<ResearchProgressConsoleResponse["lines"][number]>((event) => {
      const console = event.payload.console;
      const record = console && typeof console === "object" && !Array.isArray(console)
        ? console as Record<string, unknown> : null;
      // The structured terminal event is itself a real journal observation.
      // Project it once at its original sequence/time; never append a new event,
      // infer a stage, or duplicate an explicit source console observation.
      if (!record && event.event_type === "run_failed") {
        const { code, message } = event.payload;
        if (typeof code !== "string" || typeof message !== "string") return [];
        return [{
          sequence: event.sequence,
          occurred_at_utc_ms: event.occurred_at_utc_ms,
          tone: code === "USER_CANCELLED" ? "WARN" as const : "ERROR" as const,
          text: `${code}: ${message || code}`.slice(0, 1_024),
          trial: null,
          fold: null,
        }];
      }
      if (!record) return [];
      const text = record.text;
      if (typeof text !== "string" || text.length === 0 || text.length > 1_024) return [];
      const tone = record.tone;
      const safeTone: "INFO" | "COMPLETE" | "WARN" | "ERROR" =
        tone === "COMPLETE" || tone === "WARN" || tone === "ERROR" ? tone : "INFO";
      const asPositiveInteger = (value: unknown): number | null =>
        typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
      return [{
        sequence: event.sequence,
        occurred_at_utc_ms: event.occurred_at_utc_ms,
        tone: safeTone,
        text,
        trial: asPositiveInteger(record.trial),
        fold: asPositiveInteger(record.fold),
      }];
    });
    return {
      schema_version: "research.progress-console.v1",
      run_id: runId,
      after_seq: afterSequence,
      source_latest_sequence: page.sourceLatestSequence,
      retention_floor_sequence: page.retentionFloorSequence,
      lines,
    };
  }

  /** A single admin-only cooperative cancellation; P12 owns retry/requeue. */
  async cancel(
    user: PortalUser,
    scope: ResearchScope,
    input: { runId: string; reason: string; requestId: string },
  ): Promise<{
    schema_version: "research.progress-cancel.v1";
    run_id: string;
    status: "CANCELLED" | "CANCEL_REQUESTED" | "ALREADY_TERMINAL";
    source_marker: "REQUESTED" | "NOT_REQUIRED" | "PENDING_RECONCILIATION";
  }> {
    this.requireEnabled();
    const lease = await this.progress.currentLease(scope, input.runId);
    // E10: the run's owner (its requester) may cancel it, as may an ADMIN.
    if (!this.mayCancelAs(user, lease.requestedByUserId)) {
      throw new ResearchProgressError("RESEARCH_PROGRESS_FORBIDDEN", "Research cancellation is not allowed.", 403);
    }
    let requested;
    try {
      requested = await this.metadata.requestDurableJobCancellation(scope, {
        jobId: lease.jobId,
        reason: input.reason,
      });
    } catch (error) {
      throw this.mapMetadata(error);
    }
    if (TERMINAL_JOB_STATES.has(lease.jobState)) {
      return this.cancelResponse(input.runId, "ALREADY_TERMINAL", "NOT_REQUIRED");
    }
    if (requested.terminal || !lease.workerAttemptId || !lease.leaseEpoch) {
      return this.cancelResponse(input.runId, "CANCELLED", "NOT_REQUIRED");
    }
    try {
      const marker = await this.portal.requestCancellation({
        user,
        runId: input.runId,
        workerAttemptId: lease.workerAttemptId,
        leaseEpoch: lease.leaseEpoch,
        requestId: input.requestId,
      });
      return this.cancelResponse(
        input.runId,
        "CANCEL_REQUESTED",
        marker === "REQUESTED" ? "REQUESTED" : "PENDING_RECONCILIATION",
      );
    } catch (error) {
      // The durable DB cancellation CAS has already won.  A private source
      // outage is a truthful pending delivery state, not a reason to undo it
      // or tell the browser that the worker definitely continued.
      if (error instanceof ResearchProgressError) {
        return this.cancelResponse(input.runId, "CANCEL_REQUESTED", "PENDING_RECONCILIATION");
      }
      throw error;
    }
  }

  subscribe(
    user: PortalUser,
    runId: string,
    listener: (event: ResearchProgressPublicEnvelope) => void,
  ): () => void {
    this.requireEnabled();
    return this.fanout.subscribe(runId, (envelope: ResearchProgressEnvelope) => listener({
      event: toPublicResearchProgressEvent(envelope.event),
      snapshot: envelope.snapshot ? toPublicResearchProgressSnapshot(envelope.snapshot, envelope.run?.identity?.executionProfileId) : null,
      read: envelope.run ? this.readResponse(user, envelope.run) : null,
    }));
  }

  /** CG-P11-07: read-only clone seed. A new run is still a NEW, freshly preflighted intent. */
  async requestedSpec(scope: ResearchScope, runId: string): Promise<ResearchRunRequestedSpecResponse> {
    if (this.config.FEATURE_RESEARCH_RUN_PRODUCER !== "true") {
      throw new ResearchProgressError(
        "RESEARCH_PROGRESS_UNAVAILABLE",
        "Research run creation is not enabled in this environment.",
        503,
      );
    }
    const spec = await this.progress.requestedSpec(scope, runId);
    return {
      schema_version: "research.run-requested-spec.v1",
      run_id: spec.runId,
      requested_spec: spec.requestedSpec,
      requested_spec_digest: spec.requestedSpecDigest,
      alpha_id: spec.alphaId,
      alpha_version_id: spec.alphaVersionId,
      execution_profile_id: spec.executionProfileId,
      created_at_utc_ms: spec.createdAt.valueOf(),
      clone: { intent_kind: "NEW", requires_fresh_preflight: true },
    };
  }

  private readResponse(user: PortalUser, current: ProgressRunRead): ResearchProgressReadResponse {
    const effectiveStatus = this.effectiveStatus(current);
    const identity = current.identity ?? null;
    return {
      schema_version: "research.progress-read.v1",
      run_id: current.runId,
      run: identity ? this.runIdentity(identity) : null,
      queue: {
        queue_class: current.queueClass,
        queued_at_utc_ms: current.queuedAt.valueOf(),
        // The column is only meaningful while the scheduler waits to retry. A
        // cancelled/terminal/running job must not advertise a retry instant.
        retry_not_before_utc_ms: current.jobState === "RETRY_WAIT"
          ? current.retryNotBefore?.valueOf() ?? null
          : null,
      },
      attempts: current.attempts.map((attempt) => ({
        ordinal: attempt.ordinal,
        state: attempt.state,
        claimed_at_utc_ms: attempt.claimedAt.valueOf(),
        started_at_utc_ms: attempt.startedAt?.valueOf() ?? null,
        ended_at_utc_ms: attempt.endedAt?.valueOf() ?? null,
        lease_expired_at_utc_ms: attempt.state === "LOST_LEASE"
          ? attempt.leaseExpiresAt?.valueOf() ?? null
          : null,
      })),
      availability: current.progress ? "AVAILABLE"
        : current.jobState === "CANCELLED" ? "CANCELLED_BEFORE_SOURCE"
        : current.jobState === "QUEUED" ? "QUEUED_NO_SOURCE"
        : "PENDING_SOURCE_CALLBACK",
      current: {
        job_state: current.jobState,
        effective_status: effectiveStatus,
        terminal_resolution: current.jobState === "CANCELLED"
          ? "CONTROL_CANCELLATION"
          : current.progress ? "SOURCE" : "PENDING",
        terminal_materialization: current.terminalMaterialization,
        source_latest_sequence: current.sourceLatestSequence,
        retention_floor_sequence: current.retentionFloorSequence,
        last_received_at_utc_ms: current.receivedAt?.valueOf() ?? null,
        may_cancel: CANCELLABLE_JOB_STATES.has(current.jobState) && this.mayCancelAs(user, current.requestedByUserId),
        may_retry: false,
        retry_reason: "FAIL_CLOSED_NEW_RUN_FROM_REQUESTED_SPEC",
        new_run_from: identity?.requestedSpecRetained
          ? { state: "AVAILABLE", reason_code: null }
          : { state: "NOT_AVAILABLE", reason_code: "RUN_REQUESTED_SPEC_NOT_RETAINED" },
        failed_at: effectiveStatus === "FAILED" ? failedAt(current.progress) : null,
        terminal_reason: effectiveStatus === "FAILED" ? this.terminalReason(current) : null,
        fold_reporting: {
          basis: "P08_ADMISSION_AND_P11_JOURNAL_V1",
          declared_count: identity?.declaredFoldCount ?? null,
          planned_count: identity?.plannedFolds?.length ?? null,
          reported_count: current.progress?.folds.length ?? null,
          done_count: current.progress ? current.progress.folds.filter((fold) => fold.state === "DONE").length : null,
          failed_count: current.progress ? current.progress.folds.filter((fold) => fold.state === "FAILED").length : null,
          reason_code: !current.progress ? "SOURCE_PROGRESS_NOT_PUBLISHED"
            : current.progress.folds.length === 0 ? "SOURCE_DID_NOT_REPORT_FOLDS" : null,
        },
      },
      progress: current.progress ? toPublicResearchProgressSnapshot(current.progress, identity?.executionProfileId) : null,
      retained_artifacts: current.retainedArtifacts.map((artifact) => ({
        table_kind: artifact.tableKind,
        state: artifact.state,
        total_rows: artifact.totalRows,
        total_bytes: artifact.totalBytes,
        sealed_at_utc_ms: artifact.sealedAt?.valueOf() ?? null,
        reader_href: null,
      })),
      denied_artifacts: identity?.sealedHoldout
        ? [{
            name: "sealed holdout",
            state: "DENIED",
            reason_code: "P08_SEALED_HOLDOUT_UNLOCK_NOT_INSTALLED",
            rows: identity.sealedHoldout.bars === null ? null : String(identity.sealedHoldout.bars),
            range: {
              start_utc_ms: identity.sealedHoldout.startUtcMs,
              end_exclusive_utc_ms: identity.sealedHoldout.endExclusiveUtcMs,
            },
            reader_href: null,
          }]
        : [],
    };
  }

  private runIdentity(identity: ProgressRunIdentity): ResearchProgressRunIdentity {
    return {
      alpha: {
        alpha_id: identity.alphaId,
        alpha_name: identity.alphaName,
        alpha_version_id: identity.alphaVersionId,
      },
      display_label: identity.displayLabel,
      execution_profile_id: identity.executionProfileId,
      protocol: identity.protocol,
      mode: identity.mode,
      schedule: identity.schedule,
      instrument: { symbol: identity.symbol, timeframe: identity.timeframe },
      execution_route: identity.executionRoute,
      engine_release_id: identity.engineReleaseId,
      config_digest: identity.configDigest,
      requested_spec_digest: identity.requestedSpecDigest,
      created_at_utc_ms: identity.createdAt.valueOf(),
      declared_folds: identity.declaredFoldCount === null
        ? { state: "NOT_PUBLISHED", count: null, reason_code: "P08_TOPOLOGY_DID_NOT_DECLARE_FOLDS" }
        : { state: "DECLARED", count: identity.declaredFoldCount, reason_code: null },
      planned_folds: identity.plannedFolds === null
        ? { state: "NOT_PUBLISHED", folds: [], reason_code: "P08_TOPOLOGY_DID_NOT_DECLARE_FOLDS" }
        : { state: "AVAILABLE", folds: identity.plannedFolds.map((fold) => ({
          fold: fold.fold, test_start_utc_ms: fold.testStartUtcMs, test_end_utc_ms: fold.testEndUtcMs,
        })), reason_code: null },
    };
  }

  /**
   * E10: the status is `research.run_lifecycle_status_v1`, computed in the
   * same statement as the rest of this read — the function the Run Library
   * view calls. No second derivation lives here.
   */
  private effectiveStatus(current: ProgressRunRead): ResearchProgressReadResponse["current"]["effective_status"] {
    if (!EFFECTIVE_STATUSES.has(current.lifecycleStatus)) {
      throw new ResearchProgressError("RESEARCH_PROGRESS_CONFLICT", "Research run lifecycle status is incompatible.", 409);
    }
    return current.lifecycleStatus as ResearchProgressReadResponse["current"]["effective_status"];
  }

  /** E10: the source's own failure first; else the reason the scheduler recorded when it closed the job. */
  private terminalReason(current: ProgressRunRead): ResearchProgressReadResponse["current"]["terminal_reason"] {
    const failure = current.progress?.failure;
    if (failure) {
      return { code: failure.code, message: failure.message.length > 0 ? failure.message : failure.code, origin: "SOURCE" };
    }
    const control = parseTerminalReason(current.jobTerminalReason);
    return control ? { ...control, origin: "CONTROL" } : null;
  }

  private mayCancelAs(user: PortalUser, requestedByUserId: string | null): boolean {
    return user.role === "ADMIN"
      || (typeof requestedByUserId === "string" && requestedByUserId.length > 0 && user.userId === requestedByUserId);
  }

  private async applyLifecycle(scope: ProgressIngressScope, input: ResearchProgressIngress): Promise<void> {
    const claim = {
      jobId: scope.jobId,
      workerAttemptId: scope.workerAttemptId,
      leaseEpoch: scope.leaseEpoch,
    };
    try {
      if (input.event.event_type === "run_started") {
        await this.metadata.markDurableJobRunning(scope, claim);
        return;
      }
      if (input.event.event_type === "heartbeat") {
        await this.metadata.heartbeatDurableJob(scope, claim, this.config.RESEARCH_RUN_PRODUCER_LEASE_SECONDS);
        return;
      }
      if (input.event.event_type === "run_completed") {
        if (input.snapshot.status !== "COMPLETED" || input.snapshot.readiness.mandatory !== "SEALED") {
          throw new ResearchProgressError("RESEARCH_PROGRESS_SOURCE_REJECTED", "Research completion is missing its mandatory seal.", 409);
        }
        await this.metadata.finishDurableJob(scope, {
          ...claim,
          outcome: "SUCCEEDED",
          usage: this.usage(input.event),
        });
        return;
      }
      if (input.event.event_type === "run_failed") {
        const cancelled = input.event.payload.code === "USER_CANCELLED";
        await this.metadata.finishDurableJob(scope, {
          ...claim,
          outcome: cancelled ? "CANCELLED" : "FAILED",
          reason: this.failureReason(input.event),
          usage: this.usage(input.event),
        });
      }
    } catch (error) {
      if (await this.isTerminalReplay(scope, input, error)) return;
      throw this.mapMetadata(error);
    }
  }

  /**
   * W1: the wire admits the largest installed child cap; this binds each
   * attempt to its own run's immutable execution profile before anything is
   * persisted. A P04 attempt keeps its 45 CPU-second cap, and a Delta WFO
   * attempt can never attach P04 P13/P14 terminal sidecars (its evidence is
   * the retained RS-02 lane, not a fixed-qualification receipt).
   */
  private assertProfileBoundIngress(scope: ProgressIngressScope, input: ResearchProgressIngress): void {
    // The VN observed tape remains a distinct source lane even though it
    // reuses the immutable Delta fixed kernel and P13/P14 sidecars.
    if (input.split !== undefined) {
      // Keep service-level refusal typed even when a caller/test bypasses the
      // controller's full wire validation. Never dereference a malformed
      // sidecar before the existing pre-persistence profile fence.
      const evaluation = input.split?.windows?.outer_oos?.evaluation_state;
      if (typeof evaluation !== "string" || (scope.executionProfileId === VN_OBSERVED_FIXED_PROFILE_ID) !==
          (evaluation === "VN_OBSERVED_AFTER_FIXED_PROFILE")) {
        throw new ResearchProgressError("RESEARCH_PROGRESS_INVALID", "Research split evaluation does not match the run's source profile.", 400);
      }
    }
    const whatIf = scope.executionProfileId === WHATIF_PROFILE_ID;
    const pinnedAudit = scope.executionProfileId === PINNED_AUDIT_PROFILE_ID;
    const causal = scope.executionProfileId === DELTA_CAUSAL_INNER_PROFILE_ID;
    const wfo = scope.executionProfileId === DELTA_WFO_PROFILE_ID || scope.executionProfileId === DELTA_WFO_V2_PROFILE_ID || causal || whatIf;
    const usage = input.event.payload.usage;
    if (usage && typeof usage === "object" && !Array.isArray(usage)) {
      const cpu = (usage as Record<string, unknown>).cpu_seconds;
      const cap = pinnedAudit ? PINNED_AUDIT_PROFILE.cpu_seconds : whatIf
        ? WHATIF_PROFILE.child_limits.cpu_seconds
        : causal ? DELTA_CAUSAL_INNER_PROFILE.child_limits.cpu_seconds
        : wfo
          // Research preview only: the long WFO child's own CPU cap.
          ? (deltaWfoPreviewLongEnabled(this.config)
            ? DELTA_WFO_PREVIEW_LONG_LIMITS.cpu_seconds
            : DELTA_WFO_PROFILE.child_limits.cpu_seconds)
          : P04_FIXED_CHILD_CPU_SECONDS;
      if (typeof cpu === "number" && cpu > cap) {
        throw new ResearchProgressError("RESEARCH_PROGRESS_INVALID", "Research progress usage exceeds the run profile's child limit.", 400);
      }
    }
    if ((wfo || pinnedAudit) && (input.evidence !== undefined || input.split !== undefined
      || input.event.payload.evidence_digest !== undefined || input.event.payload.split_digest !== undefined)) {
      throw new ResearchProgressError(
        "RESEARCH_PROGRESS_INVALID",
        "This source profile publishes retained evidence, not P04 terminal sidecars.",
        400,
      );
    }
  }

  private usage(event: ResearchProgressEvent): ResearchWorkerUsage {
    const candidate = event.payload.usage;
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      throw new ResearchProgressError("RESEARCH_PROGRESS_SOURCE_REJECTED", "Research terminal progress is missing measured usage.", 409);
    }
    const record = candidate as Record<string, unknown>;
    const value = (key: string): number | null => {
      const item = record[key];
      // CG-P11-09: an explicit null is an unmeasured quantity, kept as null.
      if (item === null) return null;
      if (typeof item !== "number" || !Number.isSafeInteger(item) || item < 0) {
        throw new ResearchProgressError("RESEARCH_PROGRESS_SOURCE_REJECTED", "Research terminal progress usage is invalid.", 409);
      }
      return item;
    };
    return {
      peakRssBytes: value("peak_rss_bytes"),
      cpuSeconds: value("cpu_seconds"),
      scratchBytes: value("scratch_bytes"),
      fdPeak: value("fd_peak"),
    };
  }

  private failureReason(event: ResearchProgressEvent): string {
    const message = event.payload.message;
    if (typeof message !== "string" || message.length === 0 || message.length > 256) {
      return "Research worker reported a bounded terminal failure.";
    }
    return message;
  }

  private async isTerminalReplay(
    scope: ProgressIngressScope,
    input: ResearchProgressIngress,
    error: unknown,
  ): Promise<boolean> {
    if (!(error instanceof ResearchMetadataError)
      || (error.code !== "RESEARCH_JOB_STATE_CONFLICT" && error.code !== "RESEARCH_JOB_LEASE_REJECTED")) {
      return false;
    }
    try {
      const current = await this.progress.currentLease(
        { workspaceId: scope.workspaceId, actorUserId: scope.actorUserId },
        input.run_id,
      );
      // Only the same exact fenced source tuple may be treated as an
      // acknowledgement-loss replay. A reclaimed attempt must still fail
      // closed, even if the later job is terminal.
      return current.workerAttemptId === scope.workerAttemptId
        && current.leaseEpoch === scope.leaseEpoch
        && TERMINAL_JOB_STATES.has(current.jobState);
    } catch {
      return false;
    }
  }

  private mapMetadata(error: unknown): ResearchProgressError {
    if (error instanceof ResearchProgressError) return error;
    if (error instanceof ResearchMetadataError) {
      if (error.code === "RESEARCH_JOB_NOT_FOUND") {
        return new ResearchProgressError("RESEARCH_PROGRESS_NOT_FOUND", "Research run was not found.", 404);
      }
      if (error.code === "RESEARCH_JOB_LEASE_REJECTED" || error.code === "RESEARCH_JOB_STATE_CONFLICT") {
        return new ResearchProgressError("RESEARCH_PROGRESS_STALE_LEASE", "Research progress source lease is no longer current.", 409);
      }
    }
    return new ResearchProgressError("RESEARCH_PROGRESS_UNAVAILABLE", "Research progress is temporarily unavailable.", 503);
  }

  private cancelResponse(
    runId: string,
    status: "CANCELLED" | "CANCEL_REQUESTED" | "ALREADY_TERMINAL",
    sourceMarker: "REQUESTED" | "NOT_REQUIRED" | "PENDING_RECONCILIATION",
  ) {
    return {
      schema_version: "research.progress-cancel.v1" as const,
      run_id: runId,
      status,
      source_marker: sourceMarker,
    };
  }

  private requireEnabled(): void {
    if (this.config.FEATURE_RESEARCH_PROGRESS !== "true") {
      throw new ResearchProgressError("RESEARCH_PROGRESS_UNAVAILABLE", "Research progress is not enabled in this environment.", 503);
    }
  }
}
