/** P18 sealed Report assembly and bounded, restart-safe export transformer. */

import { createHash } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";

import { ControlApiConfig } from "../config";
import { CONTROL_API_CONFIG } from "../tokens";
import type { ResearchScope } from "./contracts";
import { ResearchCurrentSourcePageQuerySchema, type ResearchCurrentSourceNotApplicableResponse } from "./current-source.contract";
import { ResearchCurrentSourceError } from "./current-source.error";
import { ResearchCurrentSourceService } from "./current-source.service";
import { ResearchEvidenceSeriesKindSchema } from "./evidence.contract";
import { ResearchEvidenceService } from "./evidence.service";
import { ResearchFreezeService } from "./freeze.service";
import { canonicalResearchJson } from "./preflight.service";
import { ResearchReplayService } from "./replay.service";
import {
  AVAILABLE,
  NOT_PUBLISHED,
  failedCore,
  fixedFinalAudit,
  fixedProfileCore,
  retainedCore,
  retainedFinalAudit,
  type Availability,
  type ReportAuditRelation,
} from "./report-core-v2";
import type { ResearchProgressSnapshot } from "./progress.contract";
import {
  ResearchReportDetailResponseSchema,
  ResearchReportExportStatusSchema,
  ResearchReportFrozenCoreFailedSchema,
  ResearchReportFrozenCoreV2Schema,
  type ResearchReportDetailResponse,
  type ResearchReportExportFormat,
  type ResearchReportExportStatus,
  type ResearchReportFrozenCore,
} from "./report.contract";
import { ResearchReportError } from "./report.error";
import {
  ResearchReportRepository,
  type ClaimedResearchReportExport,
  type ResearchReportExportJob,
  type StoredResearchReport,
} from "./report.repository";
import { ResearchSearchService } from "./search.service";
import { ResearchSplitService } from "./split.service";

/** Which sealed read model a report is assembled from; the run's P10 profile decides. */
export type ResearchReportLane = "P04_FIXED_PROFILE" | "RS02_RETAINED_CURRENT_SOURCE";

function csvCell(value: string | null): string {
  const raw = value ?? "";
  // Spreadsheet formula operators remain dangerous after leading whitespace
  // in a number of consumers, so quote a literal apostrophe before escaping.
  const guarded = /^[\t\r\n ]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${guarded.replaceAll('"', '""')}"`;
}

/**
 * Report assembly runs only during the idempotent terminal callback path or a
 * separately invoked recovery job. It reads P13--P17 persisted projections
 * (P04) or the retained current-source projections (Delta WFO); it never
 * calls QuantBT, an artifact path, the source DB, or a live worker.
 */
@Injectable()
export class ResearchReportService {
  constructor(
    private readonly repository: ResearchReportRepository,
    private readonly evidence: ResearchEvidenceService,
    private readonly split: ResearchSplitService,
    private readonly search: ResearchSearchService,
    private readonly freeze: ResearchFreezeService,
    private readonly replay: ResearchReplayService,
    private readonly currentSource: ResearchCurrentSourceService,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
  ) {}

  /**
   * Terminal-sidecar hook. A failed/currently incomplete source has no
   * fabricated report; the original terminal journal remains safely retryable.
   */
  async materializeTerminal(
    scope: ResearchScope,
    input: {
      run_id: string;
      event: { event_type: string; sequence?: number; occurred_at_utc_ms?: number; payload?: Record<string, unknown> };
      snapshot?: ResearchProgressSnapshot;
    },
    lane: ResearchReportLane = "P04_FIXED_PROFILE",
  ): Promise<boolean> {
    if (this.config.FEATURE_RESEARCH_REPORTS !== "true") return false;
    if (input.event.event_type === "run_failed") return this.materializeFailureBestEffort(scope, input);
    if (input.event.event_type !== "run_completed") return false;
    if (lane === "RS02_RETAINED_CURRENT_SOURCE" && this.config.FEATURE_RESEARCH_CURRENT_SOURCE !== "true") return false;
    await this.materialize(scope, input.run_id, lane);
    return true;
  }

  /**
   * X2 · B5 (spec 09 T06): a run that FAILED or was cancelled gets a sheet
   * that says so — sealed from the terminal snapshot P11 just persisted, the
   * same facts Screen 03 shows. Best-effort like the WFO sidecar (W6A-D02):
   * a report must never refuse a run's own terminal lifecycle.
   */
  private async materializeFailureBestEffort(
    scope: ResearchScope,
    input: {
      run_id: string;
      event: { sequence?: number; occurred_at_utc_ms?: number; payload?: Record<string, unknown> };
      snapshot?: ResearchProgressSnapshot;
    },
  ): Promise<boolean> {
    try {
      if (!input.snapshot) return false;
      const payload = input.event.payload ?? {};
      await this.materializeFailure(scope, input.run_id, {
        snapshot: input.snapshot,
        failure: {
          code: typeof payload.code === "string" && payload.code.length > 0 ? payload.code : input.snapshot.failure?.code ?? "UNTYPED_FAILURE",
          message: typeof payload.message === "string" ? payload.message : input.snapshot.failure?.message ?? null,
        },
        terminalSequence: input.event.sequence ?? input.snapshot.latest_sequence,
        failedAtUtcMs: input.event.occurred_at_utc_ms ?? input.snapshot.updated_at_utc_ms,
      });
      return true;
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : "UNTYPED";
      process.stderr.write(`${JSON.stringify({ event: "research_report_failed_run_materialize_failed", run_id: input.run_id, code })}\n`);
      return false;
    }
  }

  async materializeFailure(
    scope: ResearchScope,
    runId: string,
    facts: { snapshot: ResearchProgressSnapshot; failure: { code: string; message: string | null }; terminalSequence: number; failedAtUtcMs: number },
  ): Promise<ResearchReportDetailResponse> {
    this.requireEnabled();
    // Identity comes from the P13 hub (the P10 producer + P08 manifest); a
    // hub that cannot answer leaves typed identity absences, never a guess.
    const hub = await this.evidence.bundle(scope, runId, []).then((bundle) => bundle.hub).catch(() => null);
    const core = failedCore({ hub, ...facts });
    const parsed = ResearchReportFrozenCoreFailedSchema.safeParse(core);
    if (!parsed.success) {
      const error = new ResearchReportError("RESEARCH_REPORT_UNAVAILABLE", "Failed-run report is incompatible with the terminal facts.", 503);
      (error as Error & { cause?: unknown }).cause = parsed.error;
      throw error;
    }
    const stored = await this.repository.seal(scope, runId, parsed.data);
    return this.detail(stored);
  }

  /** P19 lineage facts for P18-T10; a repository that cannot answer leaves the final audit typed absent. */
  private async auditRelation(scope: ResearchScope, runId: string): Promise<ReportAuditRelation | null> {
    if (typeof this.repository.auditRelation !== "function") return null;
    return this.repository.auditRelation(scope, runId).catch(() => null);
  }

  async materialize(scope: ResearchScope, runId: string, lane: ResearchReportLane = "P04_FIXED_PROFILE"): Promise<ResearchReportDetailResponse> {
    this.requireEnabled();
    const core = lane === "RS02_RETAINED_CURRENT_SOURCE"
      ? await this.retainedCore(scope, runId)
      : await this.fixedProfileCore(scope, runId);
    const parsed = ResearchReportFrozenCoreV2Schema.safeParse(core);
    if (!parsed.success) {
      const error = new ResearchReportError("RESEARCH_REPORT_UNAVAILABLE", "Report assembly is incompatible with sealed source facts.", 503);
      (error as Error & { cause?: unknown }).cause = parsed.error;
      throw error;
    }
    const stored = await this.repository.seal(scope, runId, parsed.data);
    return this.detail(stored);
  }

  /**
   * W6a · the Delta WFO lane. Every read is the retained current-source
   * projection Screens 04–08 already serve; the P13 hub contributes only its
   * stage timeline and the P10/P08 run identity. A run whose retained seal is
   * absent is not ready — never a report of the P04 hubs it never had.
   */
  private async retainedCore(scope: ResearchScope, runId: string): Promise<unknown> {
    if (this.config.FEATURE_RESEARCH_CURRENT_SOURCE !== "true") {
      throw new ResearchReportError("RESEARCH_REPORT_UNAVAILABLE", "Retained current-source reads are not enabled in this deployment.", 503);
    }
    const page = ResearchCurrentSourcePageQuerySchema.parse({ limit: 1 });
    const [evidence, split, search, freeze, replay, equity] = await Promise.all([
      this.currentSource.evidence(scope, runId),
      this.currentSource.split(scope, runId),
      this.currentSource.search(scope, runId, page),
      this.currentSource.freeze(scope, runId),
      this.currentSource.replay(scope, runId, page),
      this.currentSource.evidenceSeries(scope, runId, "EQUITY"),
    ]).catch((error: unknown) => {
      if (error instanceof ResearchCurrentSourceError && error.status === 409) {
        throw new ResearchReportError("RESEARCH_REPORT_NOT_READY", "Report source facts are not sealed yet.", 409);
      }
      throw error;
    });
    const sealed = <T>(value: T | ResearchCurrentSourceNotApplicableResponse): T => {
      if ((value as { schema_version?: string }).schema_version === "research.current-source-not-applicable.v1") {
        throw new ResearchReportError("RESEARCH_REPORT_NOT_READY", "This run has no retained current-source lane.", 409);
      }
      return value as T;
    };
    const hubBundle = await this.evidence.bundle(scope, runId, []);
    const evidenceRead = sealed(evidence);
    const parts = await this.repository.sealedArtifactParts(scope, runId, null);
    const reads = {
      hub: hubBundle.hub,
      evidence: evidenceRead,
      split: sealed(split),
      search: sealed(search),
      freeze: sealed(freeze),
      replay: sealed(replay),
      equity: sealed(equity),
      parts,
    };
    return {
      ...retainedCore(reads),
      // X2 · P18-T10: reused original vs linked child, from P19 lineage + QuantBT's child audit.
      final_audit: retainedFinalAudit(runId, await this.auditRelation(scope, runId), reads.freeze, reads.search, reads.replay),
    };
  }

  private async fixedProfileCore(scope: ResearchScope, runId: string): Promise<unknown> {
    const [evidenceBundle, split, search, freeze, replay] = await Promise.all([
      this.evidence.bundle(scope, runId, [ResearchEvidenceSeriesKindSchema.enum.EQUITY_OOS]),
      this.split.detail(scope, runId),
      this.search.detail(scope, runId, {}),
      this.freeze.detail(scope, runId, {}),
      this.replay.detail(scope, runId, { limit: 1 }),
    ]);
    const equity = evidenceBundle.series.get(ResearchEvidenceSeriesKindSchema.enum.EQUITY_OOS);
    if (!equity) throw new ResearchReportError("RESEARCH_REPORT_UNAVAILABLE", "Evidence report series is incomplete.", 503);
    const revisions = {
      evidence_revision: evidenceBundle.hub.revision,
      split_revision: split.revision,
      search_revision: search.revision,
      freeze_revision: freeze.revision,
      replay_revision: replay.revision,
    };
    if (Object.values(revisions).some((value) => value === null)) {
      throw new ResearchReportError("RESEARCH_REPORT_NOT_READY", "Report source facts are not sealed yet.", 409);
    }
    const points = equity.availability.state === "AVAILABLE"
      ? equity.values.map((value) => {
        const point = value as { at_utc_ms?: unknown; equity?: unknown; drawdown_fraction?: unknown };
        if (typeof point.at_utc_ms !== "number" || typeof point.equity !== "string" || typeof point.drawdown_fraction !== "string") {
          throw new ResearchReportError("RESEARCH_REPORT_UNAVAILABLE", "Evidence equity point is incompatible.", 503);
        }
        return { at_utc_ms: point.at_utc_ms, equity: point.equity, drawdown_fraction: point.drawdown_fraction };
      }) : [];
    const core = fixedProfileCore({
      hub: evidenceBundle.hub,
      equity: {
        availability: equity.availability as Availability,
        source_sample: equity.source_sample as { source_observation_count: number | null; emitted_point_count: number; sampling: string | null },
        points,
      },
      split: { revision: split.revision!, availability: split.availability as Availability, protocolKind: split.protocol.kind },
      search: {
        revision: search.revision!,
        sourceProfileState: search.source_profile.state,
        sourceProfileAvailability: search.source_profile.availability as Availability,
      },
      freeze: {
        revision: freeze.revision!,
        integrityState: freeze.freeze.integrity.state,
        integrityAvailability: freeze.freeze.integrity.availability as Availability,
      },
      replay: { revision: replay.revision!, routeState: replay.route.state },
    });
    return {
      ...core,
      final_audit: fixedFinalAudit(runId, await this.auditRelation(scope, runId), {
        split: split.revision!, freeze: freeze.revision!, replay: replay.revision!,
      }),
    };
  }

  async read(scope: ResearchScope, runId: string): Promise<ResearchReportDetailResponse> {
    this.requireEnabled();
    const stored = await this.repository.read(scope, runId);
    if (!stored) throw new ResearchReportError("RESEARCH_REPORT_NOT_FOUND", "Research report was not found.", 404);
    return this.detail(stored);
  }

  async requestExport(scope: ResearchScope, runId: string, format: ResearchReportExportFormat): Promise<ResearchReportExportStatus> {
    this.requireEnabled();
    const created = await this.repository.requestExport(scope, runId, format);
    return this.exportStatus(created);
  }

  async readExport(scope: ResearchScope, runId: string, jobId: string): Promise<ResearchReportExportStatus> {
    this.requireEnabled();
    const stored = await this.repository.readExport(scope, runId, jobId);
    if (!stored) throw new ResearchReportError("RESEARCH_REPORT_NOT_FOUND", "Research report export was not found.", 404);
    return this.exportStatus(stored);
  }

  async download(scope: ResearchScope, runId: string, jobId: string): Promise<{ status: ResearchReportExportStatus; bytes: Buffer }> {
    this.requireEnabled();
    const stored = await this.repository.download(scope, runId, jobId);
    if (!stored) throw new ResearchReportError("RESEARCH_REPORT_NOT_FOUND", "Research report export was not found.", 404);
    const status = this.exportStatus(stored.status);
    if (status.state !== "READY") {
      throw new ResearchReportError("RESEARCH_REPORT_EXPORT_NOT_READY", "Research report export is not ready.", 409);
    }
    return { status, bytes: stored.bytes };
  }

  /** One bounded, explicit worker claim. Deployment controls invocation. */
  async processOneExport(): Promise<{ processed: false } | { processed: true; job: ResearchReportExportStatus }> {
    this.requireEnabled();
    const claim = await this.repository.claimOne(this.config.RESEARCH_REPORT_EXPORT_LEASE_SECONDS);
    if (!claim) return { processed: false };
    try {
      const rendered = this.renderExport(claim);
      const completed = await this.repository.completeClaim(claim, rendered);
      return { processed: true, job: this.exportStatus(completed) };
    } catch (error) {
      // A transform failure is a durable typed outcome. It must not start a
      // source recomputation or retain a partially built disk/scratch file.
      await this.repository.failClaim(claim, this.failureCode(error));
      if (error instanceof ResearchReportError) throw error;
      throw new ResearchReportError("RESEARCH_REPORT_UNAVAILABLE", "Report export transformer failed.", 503);
    }
  }

  private detail(stored: StoredResearchReport): ResearchReportDetailResponse {
    const response = {
      schema_version: "research.report-detail.v1" as const,
      read_authority: "PORTAL_PERSISTED_RESEARCH" as const,
      run_id: stored.runId,
      report_revision: stored.reportRevision,
      etag: `"${stored.reportRevision}"`,
      sealed_at_utc_ms: stored.sealedAtUtcMs,
      presentation_revision: "research.report-presentation.v1" as const,
      frozen_core: stored.frozenCore,
      approval_annotation: {
        state: stored.annotation.state,
        text: stored.annotation.text,
        source_updated_at_utc_ms: stored.annotation.sourceUpdatedAtUtcMs,
        availability: stored.annotation.state === "AVAILABLE" ? AVAILABLE : NOT_PUBLISHED("P18_APPROVAL_ANNOTATION_NOT_PUBLISHED"),
      },
      exports: {
        formats: ["REPORT_JSON", "REPORT_CSV"] as const,
        maximum_bytes: this.config.RESEARCH_REPORT_EXPORT_MAXIMUM_BYTES,
        // X2 · B5 decision (X2-D09): no bounded, safe path exists for either.
        //  - ARCHIVE of the sealed P05 parts would hand out private retained
        //    bytes, including the OHLCV bars the observation parts carry (P05:
        //    a GET never reopens private artifact bytes; this contract carries
        //    no raw market rows).
        //  - PARQUET of the report rowset needs a pinned Parquet writer; the
        //    Control API ships none and the report is already JSON/CSV exact.
        unavailable_formats: [
          { format: "PARQUET" as const, reason_code: "P18_CONTROL_API_HAS_NO_PINNED_PARQUET_WRITER" },
          { format: "ARCHIVE" as const, reason_code: "P18_ARCHIVE_WOULD_EXPOSE_PRIVATE_P05_BYTES_AND_RAW_MARKET_ROWS" },
        ],
      },
    };
    const parsed = ResearchReportDetailResponseSchema.safeParse(response);
    if (!parsed.success) throw new ResearchReportError("RESEARCH_REPORT_UNAVAILABLE", "Stored report is incompatible.", 503);
    return parsed.data;
  }

  private exportStatus(job: ResearchReportExportJob): ResearchReportExportStatus {
    const response = {
      schema_version: "research.report-export.v1" as const,
      job_id: job.jobId,
      run_id: job.runId,
      report_revision: job.reportRevision,
      format: job.format,
      state: job.state,
      requested_at_utc_ms: job.requestedAtUtcMs,
      completed_at_utc_ms: job.completedAtUtcMs,
      size_bytes: job.sizeBytes,
      sha256: job.sha256,
      content_type: job.contentType,
      filename: job.filename,
      download_href: job.state === "READY" ? `/api/v1/quantbt/runs/${job.runId}/report/exports/${job.jobId}/download` : null,
      failure_code: job.failureCode,
    };
    const parsed = ResearchReportExportStatusSchema.safeParse(response);
    if (!parsed.success) throw new ResearchReportError("RESEARCH_REPORT_UNAVAILABLE", "Report export state is incompatible.", 503);
    return parsed.data;
  }

  private renderExport(claim: ClaimedResearchReportExport): {
    bytes: Buffer; sha256: string; contentType: "application/json" | "text/csv"; filename: string;
  } {
    const payload = {
      schema_version: "research.report-export-document.v1",
      report_revision: claim.reportRevision,
      frozen_core_sha256: claim.frozenCoreDigest,
      sealed_at_utc_ms: claim.sealedAtUtcMs,
      presentation_revision: "research.report-presentation.v1",
      frozen_core: claim.frozenCore,
      approval_annotation: claim.annotation,
    };
    const bytes = claim.format === "REPORT_JSON"
      ? Buffer.from(canonicalResearchJson(payload), "utf8")
      : Buffer.from(this.csv(payload), "utf8");
    if (bytes.byteLength > this.config.RESEARCH_REPORT_EXPORT_MAXIMUM_BYTES) {
      throw new ResearchReportError("RESEARCH_REPORT_UNAVAILABLE", "Report export exceeds its declared byte budget.", 503);
    }
    const extension = claim.format === "REPORT_JSON" ? "json" : "csv";
    return {
      bytes,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      contentType: claim.format === "REPORT_JSON" ? "application/json" : "text/csv",
      filename: `quantbt-${claim.runId}-${claim.reportRevision}.${extension}`,
    };
  }

  private csv(payload: { frozen_core: ResearchReportFrozenCore; approval_annotation: ClaimedResearchReportExport["annotation"] }): string {
    const lines = ["section,key,label,value,state,reason_code"];
    if (payload.frozen_core.schema_version === "research.report-failed-core.v1") {
      // X2: a failed-run sheet exports its outcome, identity, stages and artifacts — no metric exists.
      const failed = payload.frozen_core;
      lines.push(["outcome", "state", "Outcome", failed.outcome.state, "AVAILABLE", null].map(csvCell).join(","));
      lines.push(["outcome", "headline", "Headline", failed.outcome.headline, "AVAILABLE", null].map(csvCell).join(","));
      lines.push(["outcome", "failure_code", "Failure code", failed.outcome.failure_code, "AVAILABLE", null].map(csvCell).join(","));
      for (const field of failed.identity) {
        lines.push(["identity", field.key, field.label, field.value, field.availability.state, field.availability.reason_code].map(csvCell).join(","));
      }
      for (const stage of failed.stages) {
        lines.push(["stage", stage.key, stage.state, stage.check.text, stage.check.result, stage.check.availability.reason_code].map(csvCell).join(","));
      }
      for (const artifact of failed.artifacts) {
        lines.push(["artifact", artifact.name, artifact.state, artifact.digest, artifact.state, null].map(csvCell).join(","));
      }
      lines.push(["annotation", "approval_annotation", "Approval annotation", payload.approval_annotation.text, payload.approval_annotation.state, payload.approval_annotation.state === "AVAILABLE" ? null : "P18_APPROVAL_ANNOTATION_NOT_PUBLISHED"].map(csvCell).join(","));
      return `${lines.join("\r\n")}\r\n`;
    }
    for (const field of payload.frozen_core.identity) {
      lines.push(["identity", field.key, field.label, field.value, field.availability.state, field.availability.reason_code].map(csvCell).join(","));
    }
    for (const metric of payload.frozen_core.metrics) {
      lines.push(["metric", metric.key, metric.label, metric.value, metric.availability.state, metric.availability.reason_code].map(csvCell).join(","));
    }
    for (const item of payload.frozen_core.headline) {
      lines.push(["headline", item.key, item.label, item.value, item.availability.state, item.availability.reason_code].map(csvCell).join(","));
    }
    const core = payload.frozen_core;
    if (core.schema_version === "research.report-frozen-core.v2") {
      // v2 only: a v1 export stays byte-identical to what it always produced.
      for (const item of core.passport) {
        lines.push(["passport", item.key, item.label, item.text, item.state, item.reason_code].map(csvCell).join(","));
      }
      for (const row of core.folds.rows) {
        for (const [key, label, value] of [
          ["is_sharpe", "IS Sharpe", row.is_sharpe], ["oos_sharpe", "OOS Sharpe", row.oos_sharpe],
          ["decay", "Decay", row.decay], ["contribution_fraction", "Contribution", row.contribution_fraction],
          ["max_drawdown_fraction", "Max drawdown", row.max_drawdown_fraction], ["oos_trades", "OOS trades", row.oos_trades],
        ] as const) {
          lines.push([`fold:${row.fold_id}`, key, label, value.value, value.availability.state, value.availability.reason_code].map(csvCell).join(","));
        }
        lines.push([`fold:${row.fold_id}`, "verdict", "Verdict", row.verdict, "AVAILABLE", null].map(csvCell).join(","));
      }
    }
    lines.push(["annotation", "approval_annotation", "Approval annotation", payload.approval_annotation.text, payload.approval_annotation.state, payload.approval_annotation.state === "AVAILABLE" ? null : "P18_APPROVAL_ANNOTATION_NOT_PUBLISHED"].map(csvCell).join(","));
    return `${lines.join("\r\n")}\r\n`;
  }

  private failureCode(error: unknown): string {
    if (error instanceof ResearchReportError && error.message.includes("byte budget")) return "P18_EXPORT_MAXIMUM_BYTES_EXCEEDED";
    return "P18_EXPORT_TRANSFORM_FAILED";
  }

  private requireEnabled(): void {
    if (this.config.FEATURE_RESEARCH_REPORTS !== "true") {
      throw new ResearchReportError("RESEARCH_REPORT_UNAVAILABLE", "Research Report is not enabled in this deployment.", 503);
    }
  }
}
