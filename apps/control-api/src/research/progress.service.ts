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
import { ResearchProgressRepository, type ProgressIngressScope, type ProgressRunRead } from "./progress.repository";
import { ResearchMetadataRepository } from "./repository";
import { ResearchEvidenceService } from "./evidence.service";
import { ResearchSplitService } from "./split.service";
import { ResearchReportService } from "./report.service";

const ACTIVE_JOB_STATES = new Set(["QUEUED", "CLAIMED", "RUNNING"]);
const TERMINAL_JOB_STATES = new Set(["SUCCEEDED", "FAILED", "CANCELLED"]);

export interface ResearchProgressReadResponse {
  schema_version: "research.progress-read.v1";
  run_id: string;
  availability: "AVAILABLE" | "PENDING_SOURCE_CALLBACK";
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
    retry_reason: "P12_OWNED_NO_P11_RETRY_ROUTE";
  };
  progress: ResearchProgressPublicSnapshot | null;
}

export interface ResearchProgressPublicEnvelope {
  event: ResearchProgressPublicEvent;
  snapshot: ResearchProgressPublicSnapshot | null;
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
    await this.reports.materializeTerminal(ingressScope, input);
    await this.applyLifecycle(ingressScope, input);
    const isTerminal = input.event.event_type === "run_completed" || input.event.event_type === "run_failed";
    if (isTerminal) await this.progress.markTerminalMaterialized(ingressScope, input);
    // Duplicate terminal delivery is the recovery mechanism after a sidecar
    // or fanout failure.  The immutable journal sequence makes the repeated
    // notification idempotent for SSE consumers.
    if (persisted.inserted || isTerminal) {
      this.fanout.publish(input.run_id, { event: persisted.event, snapshot: persisted.snapshot });
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

  subscribe(runId: string, listener: (event: ResearchProgressPublicEnvelope) => void): () => void {
    this.requireEnabled();
    return this.fanout.subscribe(runId, (envelope: ResearchProgressEnvelope) => listener({
      event: toPublicResearchProgressEvent(envelope.event),
      snapshot: envelope.snapshot ? toPublicResearchProgressSnapshot(envelope.snapshot) : null,
    }));
  }

  private readResponse(user: PortalUser, current: ProgressRunRead): ResearchProgressReadResponse {
    const effectiveStatus = this.effectiveStatus(current);
    return {
      schema_version: "research.progress-read.v1",
      run_id: current.runId,
      availability: current.progress ? "AVAILABLE" : "PENDING_SOURCE_CALLBACK",
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
        retry_reason: "P12_OWNED_NO_P11_RETRY_ROUTE",
      },
      progress: current.progress ? toPublicResearchProgressSnapshot(current.progress) : null,
    };
  }

  private effectiveStatus(current: ProgressRunRead): ResearchProgressReadResponse["current"]["effective_status"] {
    if (current.jobState === "CANCELLED") return "CANCELLED";
    if ((current.jobState === "FAILED" || current.jobState === "SUCCEEDED") && current.terminalMaterialization !== "READY") {
      return "FINISHING";
    }
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

  private usage(event: ResearchProgressEvent): ResearchWorkerUsage {
    const candidate = event.payload.usage;
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      throw new ResearchProgressError("RESEARCH_PROGRESS_SOURCE_REJECTED", "Research terminal progress is missing measured usage.", 409);
    }
    const record = candidate as Record<string, unknown>;
    const value = (key: string): number => {
      const item = record[key];
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
