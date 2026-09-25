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
import { AVAILABLE, NOT_PUBLISHED, fixedProfileCore, retainedCore, type Availability } from "./report-core-v2";
import {
  ResearchReportDetailResponseSchema,
  ResearchReportExportStatusSchema,
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
    input: { run_id: string; event: { event_type: string } },
    lane: ResearchReportLane = "P04_FIXED_PROFILE",
  ): Promise<boolean> {
    if (this.config.FEATURE_RESEARCH_REPORTS !== "true" || input.event.event_type !== "run_completed") return false;
    if (lane === "RS02_RETAINED_CURRENT_SOURCE" && this.config.FEATURE_RESEARCH_CURRENT_SOURCE !== "true") return false;
    await this.materialize(scope, input.run_id, lane);
    return true;
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
    return retainedCore({
      hub: hubBundle.hub,
      evidence: evidenceRead,
      split: sealed(split),
      search: sealed(search),
      freeze: sealed(freeze),
      replay: sealed(replay),
      equity: sealed(equity),
      parts,
    });
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
    return fixedProfileCore({
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
        unavailable_formats: [
          { format: "PARQUET" as const, reason_code: "P18_SOURCE_DID_NOT_PUBLISH_REPORT_ROWSET_FOR_PARQUET" },
          { format: "ARCHIVE" as const, reason_code: "P18_SOURCE_ARTIFACT_ARCHIVE_NOT_EXPOSED_TO_REPORT" },
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
