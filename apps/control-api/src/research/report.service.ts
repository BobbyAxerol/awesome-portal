/** P18 sealed Report assembly and bounded, restart-safe export transformer. */

import { createHash } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";

import { ControlApiConfig } from "../config";
import { CONTROL_API_CONFIG } from "../tokens";
import type { ResearchScope } from "./contracts";
import { ResearchEvidenceSeriesKindSchema, type ResearchEvidenceHubResponse } from "./evidence.contract";
import { ResearchEvidenceService } from "./evidence.service";
import { ResearchFreezeService } from "./freeze.service";
import { canonicalResearchJson } from "./preflight.service";
import { ResearchReplayService } from "./replay.service";
import {
  ResearchReportDetailResponseSchema,
  ResearchReportExportStatusSchema,
  ResearchReportFrozenCoreSchema,
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

type Availability = {
  state: "AVAILABLE" | "NOT_PUBLISHED" | "PENDING_SOURCE_CALLBACK" | "LEGACY_METADATA_ONLY" | "NOT_APPLICABLE";
  reason_code: string | null;
};

const NOT_PUBLISHED = (reasonCode: string): Availability => ({ state: "NOT_PUBLISHED", reason_code: reasonCode });
const AVAILABLE: Availability = { state: "AVAILABLE", reason_code: null };

function sourceFact(
  value: string | null,
  availability: Availability,
  unavailableReason: string,
): { state: "AVAILABLE" | "NOT_PUBLISHED"; text: string | null; reason_code: string | null; availability: Availability } {
  return value !== null && availability.state === "AVAILABLE"
    ? { state: "AVAILABLE", text: value, reason_code: null, availability }
    : { state: "NOT_PUBLISHED", text: null, reason_code: availability.reason_code ?? unavailableReason, availability: availability.state === "AVAILABLE" ? NOT_PUBLISHED(unavailableReason) : availability };
}

function reportAvailability(value: Availability): Availability {
  return value;
}

function csvCell(value: string | null): string {
  const raw = value ?? "";
  // Spreadsheet formula operators remain dangerous after leading whitespace
  // in a number of consumers, so quote a literal apostrophe before escaping.
  const guarded = /^[\t\r\n ]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${guarded.replaceAll('"', '""')}"`;
}

/**
 * Report assembly runs only during the idempotent terminal callback path or a
 * separately invoked recovery job. It reads P13--P17 persisted projections;
 * it never calls QuantBT, an artifact path, the source DB, or a live worker.
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
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
  ) {}

  /**
   * Terminal-sidecar hook. A failed/currently incomplete source has no
   * fabricated report; the original terminal journal remains safely retryable.
   */
  async materializeTerminal(scope: ResearchScope, input: { run_id: string; event: { event_type: string } }): Promise<boolean> {
    if (this.config.FEATURE_RESEARCH_REPORTS !== "true" || input.event.event_type !== "run_completed") return false;
    await this.materialize(scope, input.run_id);
    return true;
  }

  async materialize(scope: ResearchScope, runId: string): Promise<ResearchReportDetailResponse> {
    this.requireEnabled();
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
    const core = this.buildCore(evidenceBundle.hub, equity, split, search, freeze, replay, revisions as {
      evidence_revision: string; split_revision: string; search_revision: string; freeze_revision: string; replay_revision: string;
    });
    const parsed = ResearchReportFrozenCoreSchema.safeParse(core);
    if (!parsed.success) {
      throw new ResearchReportError("RESEARCH_REPORT_UNAVAILABLE", "Report assembly is incompatible with sealed source facts.", 503);
    }
    const stored = await this.repository.seal(scope, runId, parsed.data);
    return this.detail(stored);
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

  private buildCore(
    hub: ResearchEvidenceHubResponse,
    equity: { availability: Availability; source_sample: { source_observation_count: number | null; emitted_point_count: number; sampling: string | null }; values: unknown[] },
    split: Awaited<ReturnType<ResearchSplitService["detail"]>>,
    search: Awaited<ReturnType<ResearchSearchService["detail"]>>,
    freeze: Awaited<ReturnType<ResearchFreezeService["detail"]>>,
    replay: Awaited<ReturnType<ResearchReplayService["detail"]>>,
    revisions: { evidence_revision: string; split_revision: string; search_revision: string; freeze_revision: string; replay_revision: string },
  ): unknown {
    const sourceAvailability = hub.availability as Availability;
    const sourceCore = hub.core;
    const metric = (key: string) => hub.metrics.find((item) => item.key === key)!;
    const metricValue = (key: string) => metric(key)?.value ?? null;
    const metricAvailability = (key: string) => (metric(key)?.availability ?? NOT_PUBLISHED("P18_METRIC_NOT_PUBLISHED")) as Availability;
    const foldAvailability = split.availability as Availability;
    const noFold = NOT_PUBLISHED("P04_SOURCE_DID_NOT_PUBLISH_PER_FOLD_REPORT_ROWS");
    const absent = (reasonCode: string) => sourceFact(null, NOT_PUBLISHED(reasonCode), reasonCode);
    const equityPoints = equity.availability.state === "AVAILABLE"
      ? equity.values.map((value) => {
        const point = value as { at_utc_ms?: unknown; equity?: unknown; drawdown_fraction?: unknown };
        if (typeof point.at_utc_ms !== "number" || typeof point.equity !== "string" || typeof point.drawdown_fraction !== "string") {
          throw new ResearchReportError("RESEARCH_REPORT_UNAVAILABLE", "Evidence equity point is incompatible.", 503);
        }
        return { at_utc_ms: point.at_utc_ms, equity: point.equity, drawdown_fraction: point.drawdown_fraction };
      }) : [];
    return {
      schema_version: "research.report-frozen-core.v1",
      report_source: "P13_P17_FIXED_PROFILE",
      source_revisions: revisions,
      source_digests: {
        source_transform_digest: sourceCore.source_transform_digest,
        requested_spec_digest: sourceCore.requested_spec_digest,
        effective_spec_digest: sourceCore.effective_spec_digest,
        dataset_binding_digest: sourceCore.dataset_binding_digest,
        manifest_digest: sourceCore.manifest_digest,
      },
      passport: [
        sourceFact(sourceCore.source_adapter_id, sourceAvailability, "P18_SOURCE_ADAPTER_NOT_PUBLISHED"),
        sourceFact(sourceCore.engine_version, sourceAvailability, "P18_ENGINE_VERSION_NOT_PUBLISHED"),
        sourceFact(sourceCore.input_scope, sourceAvailability, "P18_INPUT_SCOPE_NOT_PUBLISHED"),
        sourceFact(split.protocol.kind, foldAvailability, "P18_SPLIT_PROTOCOL_NOT_PUBLISHED"),
        sourceFact(search.source_profile.state === "FIXED_PROFILE_NO_SEARCH" ? search.source_profile.state : null, search.source_profile.availability as Availability, "P18_SOURCE_PROFILE_NOT_PUBLISHED"),
        sourceFact(freeze.freeze.integrity.state, freeze.freeze.integrity.availability as Availability, "P18_INTEGRITY_NOT_PUBLISHED"),
      ],
      identity: [
        { key: "run_id", label: "Run ID", value: hub.run_id, availability: AVAILABLE },
        { key: "source_adapter", label: "Source adapter", value: sourceCore.source_adapter_id, availability: sourceAvailability },
        { key: "engine_version", label: "Engine version", value: sourceCore.engine_version, availability: sourceAvailability },
        { key: "input_scope", label: "Input scope", value: sourceCore.input_scope, availability: sourceAvailability },
        { key: "dataset_id", label: "Dataset", value: sourceCore.data.dataset_id, availability: sourceAvailability },
        { key: "symbol", label: "Symbol", value: sourceCore.data.symbol, availability: sourceAvailability },
        { key: "timeframe", label: "Timeframe", value: sourceCore.data.timeframe, availability: sourceAvailability },
        { key: "evidence_revision", label: "Evidence revision", value: revisions.evidence_revision, availability: AVAILABLE },
        { key: "split_revision", label: "Split revision", value: revisions.split_revision, availability: AVAILABLE },
        { key: "search_revision", label: "Search revision", value: revisions.search_revision, availability: AVAILABLE },
        { key: "freeze_revision", label: "Freeze revision", value: revisions.freeze_revision, availability: AVAILABLE },
        { key: "replay_revision", label: "Replay revision", value: revisions.replay_revision, availability: AVAILABLE },
      ],
      metrics: hub.metrics.map((item) => ({
        key: item.key, label: item.label, unit: item.unit, scope: item.scope,
        origin: item.origin, definition_id: item.definition_id, value: item.value,
        availability: reportAvailability(item.availability as Availability),
      })),
      headline: [
        { key: "OOS_SHARPE", label: "OOS Sharpe", value: null, availability: NOT_PUBLISHED("P04_SOURCE_DID_NOT_PUBLISH_OOS_SHARPE") },
        { key: "DECAY_MEAN", label: "Decay mean", value: null, availability: NOT_PUBLISHED("P04_SOURCE_DID_NOT_PUBLISH_DECAY_MEAN") },
        { key: "MAX_DRAWDOWN", label: "Max drawdown", value: metricValue("MAX_DRAWDOWN_FRACTION"), availability: metricAvailability("MAX_DRAWDOWN_FRACTION") },
        { key: "TRADES", label: "Trades", value: metricValue("TRADE_COUNT"), availability: metricAvailability("TRADE_COUNT") },
        { key: "WIN_RATE", label: "Win rate", value: null, availability: NOT_PUBLISHED("P04_SOURCE_DID_NOT_PUBLISH_WIN_RATE") },
        { key: "FUNDING", label: "Funding", value: metricValue("FUNDING_TOTAL"), availability: metricAvailability("FUNDING_TOTAL") },
      ],
      headline_footnote: "All values retain the scope and availability stated by the sealed Evidence Hub; missing optimizer and execution facts are not inferred.",
      equity: {
        state: equity.availability.state === "AVAILABLE" ? "AVAILABLE" : "NOT_PUBLISHED",
        source_observation_count: equity.source_sample.source_observation_count,
        emitted_point_count: equity.source_sample.emitted_point_count,
        sampling: equity.availability.state === "AVAILABLE" && (equity.source_sample.sampling === "FULL" || equity.source_sample.sampling === "EXTREMA_BUCKET_V1") ? equity.source_sample.sampling : null,
        points: equityPoints,
        availability: equity.availability,
      },
      folds: {
        state: "NOT_PUBLISHED",
        reason_code: noFold.reason_code,
        rows: [],
        availability: noFold,
      },
      stages: hub.stages,
      artifacts: [
        // The P04/P13–P17 current profile publishes identifying digests, not
        // retrievable artifact bytes. A digest remains in source_digests; it
        // must not be relabelled as a sealed downloadable artifact here.
        { key: "RUN_SPEC", digest: null, state: "NOT_PUBLISHED", availability: NOT_PUBLISHED("P18_REQUESTED_SPEC_BYTES_NOT_PUBLISHED") },
        { key: "SELECTION_TRACE", digest: null, state: "NOT_PUBLISHED", availability: NOT_PUBLISHED("P04_FIXED_PROFILE_HAS_NO_SELECTION_TRACE") },
        { key: "FOLD_PLAN", digest: null, state: "NOT_PUBLISHED", availability: NOT_PUBLISHED("P04_SOURCE_DID_NOT_PUBLISH_FOLD_PLAN") },
        { key: "FILL_LEDGER", digest: null, state: "NOT_PUBLISHED", availability: NOT_PUBLISHED("P04_SOURCE_DID_NOT_PUBLISH_AUDITED_FILLS") },
        { key: "METRICS_SUMMARY", digest: null, state: "NOT_PUBLISHED", availability: NOT_PUBLISHED("P13_EVIDENCE_PROJECTION_IS_NOT_ARTIFACT_FILE") },
        { key: "CLAIM", digest: null, state: "NOT_PUBLISHED", availability: NOT_PUBLISHED("P13_CLAIM_IS_NOT_AN_ARTIFACT_DIGEST") },
        { key: "BUNDLE", digest: null, state: "NOT_PUBLISHED", availability: NOT_PUBLISHED("P18_MANIFEST_BYTES_NOT_PUBLISHED") },
      ],
      warnings: hub.warnings,
      promotion: {
        state: "NOT_PUBLISHED",
        line: "Promotion/governance approval is not published by the current P04 source.",
        availability: NOT_PUBLISHED("P04_SOURCE_DID_NOT_PUBLISH_PROMOTION_APPROVAL"),
      },
      provenance: {
        line: `P18 report sealed from ${revisions.evidence_revision}, ${revisions.split_revision}, ${revisions.search_revision}, ${revisions.freeze_revision} and ${revisions.replay_revision}; replay remains retrospective equity only (${replay.route.state}).`,
        metric_registry_version: hub.metric_registry_version,
        data_signature: sourceCore.dataset_binding_digest,
        read_model_revision: "research.report-read-model.v1",
        verdict_rule_revision: "research.report-verdict-rule.v1",
      },
      source_absences: {
        ...Object.fromEntries(Object.entries(hub.source_absences).map(([key, availability]) => [key, absent((availability as Availability).reason_code ?? "P18_SOURCE_FACT_NOT_PUBLISHED")])),
        per_fold_rows: absent("P04_SOURCE_DID_NOT_PUBLISH_PER_FOLD_REPORT_ROWS"),
        approval_annotation: absent("P18_APPROVAL_ANNOTATION_NOT_PUBLISHED"),
        replay_execution_state: absent("P04_SOURCE_DID_NOT_PUBLISH_EXECUTION_STATE_SNAPSHOTS"),
      },
    };
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
