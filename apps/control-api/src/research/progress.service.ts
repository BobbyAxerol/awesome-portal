/** P11 durable Research Progress BFF/service authority. */

import { Inject, Injectable } from "@nestjs/common";

import { ControlApiConfig } from "../config";
import type { PortalUser } from "../domain";
import { CONTROL_API_CONFIG } from "../tokens";
import { type ResearchScope, type ResearchWorkerUsage, ResearchMetadataError } from "./contracts";
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
  type ProgressIngressScope,
  type ProgressRunIdentity,
  type ProgressRunRead,
} from "./progress.repository";
import { ResearchMetadataRepository } from "./repository";
import { ResearchEvidenceService } from "./evidence.service";
import { ResearchSplitService } from "./split.service";
import { ResearchReportService } from "./report.service";
import { DELTA_WFO_PROFILE, DELTA_WFO_PROFILE_ID } from "./delta-wfo.profile";
import { WHATIF_PROFILE, WHATIF_PROFILE_ID } from "./whatif.profile";

/** The installed P04 fixed-qualification child CPU limit (P10 job cost). */
const P04_FIXED_CHILD_CPU_SECONDS = 45;

const ACTIVE_JOB_STATES = new Set(["QUEUED", "CLAIMED", "RUNNING"]);
const TERMINAL_JOB_STATES = new Set(["SUCCEEDED", "FAILED", "CANCELLED"]);

/** CG-P11-03: run identity from the P10 producer row and its immutable P08 manifest. */
export interface ResearchProgressRunIdentity {
  alpha: { alpha_id: string; alpha_name: string | null; alpha_version_id: string };
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
  constructor(
    private readonly progress: ResearchProgressRepository,
    private readonly metadata: ResearchMetadataRepository,
    private readonly fanout: ResearchProgressFanout,
    private readonly portal: ResearchProgressPortalClient,
    private readonly evidence: ResearchEvidenceService,
    private readonly split: ResearchSplitService,
    private readonly reports: ResearchReportService,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
  ) {}

  async ingest(input: ResearchProgressIngress): Promise<{ accepted: true; latest_sequence: number }> {
    this.requireEnabled();
    const ingressScope = await this.progress.resolveIngress(input);
    this.assertProfileBoundIngress(ingressScope, input);
    const persisted = await this.progress.persistIngress(ingressScope, input);
    // P13 is a terminal sidecar only. If its own immutable write temporarily
    // fails, the P11 event remains persisted and the source relay can retry
    // the same digest-bound payload without rerunning QuantBT.
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
    // relation for its parent and nothing P04-shaped.
    if (ingressScope.executionProfileId !== DELTA_WFO_PROFILE_ID && ingressScope.executionProfileId !== WHATIF_PROFILE_ID) {
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

  async read(user: PortalUser, scope: ResearchScope, runId: string): Promise<ResearchProgressReadResponse> {
    this.requireEnabled();
    const current = await this.progress.readRun(scope, runId);
    return this.readResponse(user, current);
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
    const lines = page.events.flatMap((event) => {
      const console = event.payload.console;
      if (!console || typeof console !== "object" || Array.isArray(console)) return [];
      const record = console as Record<string, unknown>;
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
    if (user.role !== "ADMIN") {
      throw new ResearchProgressError("RESEARCH_PROGRESS_FORBIDDEN", "Research cancellation is not allowed.", 403);
    }
    const lease = await this.progress.currentLease(scope, input.runId);
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
      snapshot: envelope.snapshot ? toPublicResearchProgressSnapshot(envelope.snapshot) : null,
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
        may_cancel: user.role === "ADMIN" && ACTIVE_JOB_STATES.has(current.jobState),
        may_retry: false,
        retry_reason: "FAIL_CLOSED_NEW_RUN_FROM_REQUESTED_SPEC",
        new_run_from: identity?.requestedSpecRetained
          ? { state: "AVAILABLE", reason_code: null }
          : { state: "NOT_AVAILABLE", reason_code: "RUN_REQUESTED_SPEC_NOT_RETAINED" },
      },
      progress: current.progress ? toPublicResearchProgressSnapshot(current.progress) : null,
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
    };
  }

  private effectiveStatus(current: ProgressRunRead): ResearchProgressReadResponse["current"]["effective_status"] {
    if (current.jobState === "CANCELLED") return "CANCELLED";
    if (current.terminalMaterialization === "PENDING") return "FINISHING";
    if (current.jobState === "FAILED") return "FAILED";
    if (current.jobState === "SUCCEEDED") return "COMPLETED";
    if (current.progress) return current.progress.status;
    return current.jobState === "RUNNING" ? "RUNNING" : "QUEUED";
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
    const whatIf = scope.executionProfileId === WHATIF_PROFILE_ID;
    const wfo = scope.executionProfileId === DELTA_WFO_PROFILE_ID || whatIf;
    const usage = input.event.payload.usage;
    if (usage && typeof usage === "object" && !Array.isArray(usage)) {
      const cpu = (usage as Record<string, unknown>).cpu_seconds;
      const cap = whatIf
        ? WHATIF_PROFILE.child_limits.cpu_seconds
        : wfo ? DELTA_WFO_PROFILE.child_limits.cpu_seconds : P04_FIXED_CHILD_CPU_SECONDS;
      if (typeof cpu === "number" && cpu > cap) {
        throw new ResearchProgressError("RESEARCH_PROGRESS_INVALID", "Research progress usage exceeds the run profile's child limit.", 400);
      }
    }
    if (wfo && (input.evidence !== undefined || input.split !== undefined
      || input.event.payload.evidence_digest !== undefined || input.event.payload.split_digest !== undefined)) {
      throw new ResearchProgressError(
        "RESEARCH_PROGRESS_INVALID",
        "A Delta WFO run publishes retained current-source evidence, not P04 terminal sidecars.",
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
