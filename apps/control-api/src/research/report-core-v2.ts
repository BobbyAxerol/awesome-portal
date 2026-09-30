/**
 * W6a · P18 frozen core v2 assembly (CG-P18-01…11).
 *
 * Two lanes, one shape. A P04 fixed-profile run is assembled from its sealed
 * P13–P17 hubs exactly as v1 was, plus the typed v2 facts those hubs can
 * answer. A Delta WFO run is assembled from the retained current-source
 * reads (claim strip, fold verdicts, fold plan, selection, freeze, replay)
 * that Screens 04–08 already show. Nothing here recomputes an engine value:
 * every number is copied from a sealed read, and the only Portal arithmetic
 * is the exact integer sum of per-fold OOS trade counts, labelled as such.
 */

import type { ResearchEvidenceHubResponse } from "./evidence.contract";
import type { ResearchRetainedAnalyticsV2 } from "./retained-analytics-v2.contract";
import type {
  ResearchCurrentSourceEvidenceResponse,
  ResearchCurrentSourceEvidenceSeriesResponse,
  ResearchCurrentSourceFreezeResponse,
  ResearchCurrentSourceReplayResponse,
  ResearchCurrentSourceSearchResponse,
  ResearchCurrentSourceSplitResponse,
} from "./current-source.contract";
import type { ResearchReportFinalAudit, ResearchReportFrozenCoreFailed, ResearchReportFrozenCoreV2 } from "./report.contract";
import type { ResearchProgressSnapshot } from "./progress.contract";
import type { SealedArtifactParts } from "./report.repository";
import { extremaPreservingSample } from "./run-library.service";

export type Availability = {
  state: "AVAILABLE" | "NOT_PUBLISHED" | "PENDING_SOURCE_CALLBACK" | "LEGACY_METADATA_ONLY" | "NOT_APPLICABLE";
  reason_code: string | null;
};
type CoreV2 = ResearchReportFrozenCoreV2;
type Identity = CoreV2["identity"][number];
type Stage = CoreV2["stages"][number];
type Artifact = CoreV2["artifacts"][number];
type Equity = CoreV2["equity"];
type EquityPoint = Equity["points"][number];
type Hub = ResearchEvidenceHubResponse;

export const AVAILABLE: Availability = { state: "AVAILABLE", reason_code: null };
export const NOT_PUBLISHED = (reasonCode: string): Availability => ({ state: "NOT_PUBLISHED", reason_code: reasonCode });
const NOT_APPLICABLE = (reasonCode: string): Availability => ({ state: "NOT_APPLICABLE", reason_code: reasonCode });

/** Sealed P05 artifacts never reopen private bytes from a GET (P05 policy); a report does not either. */
export const ARTIFACT_DOWNLOAD_NOT_PUBLISHED = {
  state: "NOT_PUBLISHED" as const,
  reason_code: "P05_SOURCE_BYTES_WERE_VERIFIED_AT_IMPORT_BUT_A_GET_NEVER_REOPENS_PRIVATE_ARTIFACT_BYTES",
};

/** CG-P18-02: no source or Portal policy publishes a certification grade or stage caps. */
export const CERTIFICATION_NOT_PUBLISHED = {
  state: "NOT_PUBLISHED" as const,
  grade: null,
  reason_code: "P18_NO_SOURCE_PUBLISHES_A_CERTIFICATION_GRADE",
  availability: NOT_PUBLISHED("P18_NO_SOURCE_PUBLISHES_A_CERTIFICATION_GRADE"),
};

export function fact(
  key: string,
  label: string,
  value: string | null,
  availability: Availability,
  unavailableReason: string,
): CoreV2["passport"][number] {
  if (value !== null && availability.state === "AVAILABLE") {
    return { key, label, state: "AVAILABLE", text: value, reason_code: null, availability };
  }
  const settled = availability.state === "AVAILABLE" ? NOT_PUBLISHED(unavailableReason) : availability;
  const state = settled.state === "NOT_APPLICABLE" ? "NOT_APPLICABLE" as const : "NOT_PUBLISHED" as const;
  return { key, label, state, text: null, reason_code: settled.reason_code ?? unavailableReason, availability: settled };
}

export function identity(
  key: string,
  label: string,
  value: string | null,
  availability: Availability,
  missingReason: string,
  /** E14 · 9.7: what the value does not say on its own; null on every other row. */
  qualifier: Identity["qualifier"] = null,
): Identity {
  if (availability.state === "AVAILABLE" && value !== null) return { key, label, value: value.slice(0, 1_024), availability, qualifier };
  return { key, label, value: null, availability: availability.state === "AVAILABLE" ? NOT_PUBLISHED(missingReason) : availability, qualifier };
}

/**
 * E14 · 9.7 — the fact Screen 06 already states for a fixed-profile run: the
 * request declared an optimizer and the run never executed it. Published only
 * when the search read says so, so a lane that did search carries no
 * qualifier and nothing is asserted about it.
 */
export const OPTIMIZER_DECLARED_NOT_EXECUTED = {
  state: "DECLARED_NOT_EXECUTED",
  text: "declared, not executed",
  reason_code: "P04_FIXED_PROFILE_RUN_DID_NOT_EXECUTE_THE_DECLARED_OPTIMIZER",
} as const;

/** A decimal string of integers only (per-fold OOS trade counts), summed exactly. */
function sumIntegerStrings(values: Array<string | null>): string | null {
  if (values.length === 0 || values.some((value) => value === null || !/^(?:0|[1-9][0-9]*)$/.test(value))) return null;
  return values.reduce((total, value) => total + BigInt(value!), 0n).toString();
}

function parameterText(parameters: Record<string, string> | null | undefined): string | null {
  if (!parameters) return null;
  const entries = Object.entries(parameters);
  if (entries.length === 0) return null;
  return entries.map(([key, value]) => `${key}=${value}`).join(" · ").slice(0, 1_024);
}

/** Hub run identity shared by both lanes (P13 reads it from the P10 producer + P08 manifest). */
export function hubIdentity(hub: Hub) {
  const identityFacts = hub.core.run_identity;
  const binding = identityFacts?.binding;
  const scratch = binding?.availability.state === "NOT_APPLICABLE"
    && binding.availability.reason_code === "P13_SCRATCH_RUN_HAS_NO_PUBLISHABLE_ALPHA_BINDING";
  const bindingAvailability = (binding?.availability ?? NOT_PUBLISHED("P18_RUN_IDENTITY_NOT_PUBLISHED")) as Availability;
  const missing = NOT_PUBLISHED("P18_RUN_IDENTITY_NOT_PUBLISHED");
  const text = (value: { value: string | null; availability: unknown } | undefined) =>
    ({ value: value?.value ?? null, availability: (value?.availability ?? missing) as Availability });
  return {
    alpha: identity("alpha", "Alpha", binding?.alpha_id ?? null, bindingAvailability, "P18_ALPHA_BINDING_NOT_PUBLISHED"),
    alphaVersion: identity("alpha_version", "Alpha version", binding?.alpha_version_id ?? null, bindingAvailability, "P18_ALPHA_BINDING_NOT_PUBLISHED"),
    binding: scratch
      ? identity("binding", "Binding", "scratch — NOT_PUBLISHABLE", AVAILABLE, "P18_ALPHA_BINDING_NOT_PUBLISHED")
      : identity("binding", "Binding", bindingAvailability.state === "AVAILABLE" ? "PUBLISHABLE" : null, bindingAvailability, "P18_ALPHA_BINDING_NOT_PUBLISHED"),
    strategy: identity("strategy", "Strategy", binding?.alpha_name ?? null, bindingAvailability, "P18_ALPHA_BINDING_NOT_PUBLISHED"),
    mode: text(identityFacts?.mode),
    schedule: text(identityFacts?.schedule),
    route: text(identityFacts?.route.id),
    configDigest: text(identityFacts?.config_digest),
    seed: {
      value: identityFacts?.seed.value === null || identityFacts?.seed.value === undefined ? null : String(identityFacts.seed.value),
      availability: (identityFacts?.seed.availability ?? missing) as Availability,
    },
    strategyName: bindingAvailability.state === "AVAILABLE" ? binding?.alpha_name ?? binding?.alpha_id ?? null : null,
  };
}

export function title(strategy: string | null, symbol: string | null, timeframe: string | null): CoreV2["title"] {
  if (strategy === null || symbol === null || timeframe === null) {
    return { text: null, strategy, symbol, timeframe, availability: NOT_PUBLISHED("P18_REPORT_TITLE_FACTS_NOT_PUBLISHED") };
  }
  return { text: `${strategy} on ${symbol} · ${timeframe}`.slice(0, 320), strategy, symbol, timeframe, availability: AVAILABLE };
}

function optimization(mode: { value: string | null; availability: Availability }, schedule: { value: string | null; availability: Availability }) {
  return mode.value !== null && schedule.value !== null && mode.availability.state === "AVAILABLE" && schedule.availability.state === "AVAILABLE"
    ? { value: `${mode.value} × ${schedule.value}`, availability: AVAILABLE }
    : { value: null, availability: mode.availability.state !== "AVAILABLE" ? mode.availability : schedule.availability };
}

function equityBlock(
  scope: Equity["scope"],
  points: EquityPoint[],
  sourceSampling: "FULL" | "OBSERVATION_EXTREMA_BUCKET_V2" | "EXTREMA_BUCKET_V1",
  maximum: number,
  absentReason: string,
): Equity {
  if (points.length === 0) {
    return {
      state: "NOT_PUBLISHED", scope: "NOT_PUBLISHED", source_observation_count: null, emitted_point_count: null,
      sampling: null, points: [], availability: NOT_PUBLISHED(absentReason),
    };
  }
  const sample = extremaPreservingSample(points, (point) => Number(point.equity), maximum);
  const sampling = sourceSampling === "FULL" ? (sample.sampled ? "EXTREMA_BUCKET_V1" as const : "FULL" as const) : sourceSampling;
  return {
    state: "AVAILABLE",
    scope,
    // An exact source count exists only when the retained series was served in full.
    source_observation_count: sourceSampling === "FULL" ? points.length : null,
    emitted_point_count: sample.points.length,
    sampling,
    points: sample.points,
    availability: AVAILABLE,
  };
}

function stage(hubStage: Hub["stages"][number], check: Stage["check"]): Stage {
  return {
    key: hubStage.key,
    state: hubStage.state,
    started_at_utc_ms: hubStage.started_at_utc_ms,
    completed_at_utc_ms: hubStage.completed_at_utc_ms,
    check,
  };
}

const check = (result: Stage["check"]["result"], text: string | null, sourceKey: string | null, availability: Availability): Stage["check"] =>
  ({ result, text, source_key: sourceKey, availability });
const noCheck = (reason: string): Stage["check"] =>
  ({ result: "NOT_PUBLISHED", text: null, source_key: null, availability: NOT_PUBLISHED(reason) });

/** CG-P18-07: artifact rows bound to the parts of one sealed P05 artifact. */
const TABLE_ARTIFACTS: Array<[Artifact["key"], string]> = [
  ["SELECTION_TRACE", "selection"],
  ["FOLD_PLAN", "folds"],
  ["SEARCH_TRACE", "trials"],
  ["CANDIDATES", "candidates"],
  ["OBSERVATIONS", "observations"],
];

export function tableArtifacts(parts: SealedArtifactParts | null, expectedManifestDigest: string | null, absent: (key: Artifact["key"]) => string): Artifact[] {
  const bound = parts !== null && expectedManifestDigest !== null && parts.manifestDigest === expectedManifestDigest;
  return TABLE_ARTIFACTS.map(([key, tableKind]) => {
    const own = bound ? parts!.parts.filter((part) => part.tableKind === tableKind) : [];
    if (own.length === 0) {
      const reason = parts !== null && !bound ? "P18_SEALED_PARTS_DO_NOT_MATCH_RETAINED_MANIFEST" : absent(key);
      return { key, filename: null, digest: null, state: "NOT_PUBLISHED", part_count: null, download: ARTIFACT_DOWNLOAD_NOT_PUBLISHED, availability: NOT_PUBLISHED(reason) };
    }
    const single = own.length === 1 ? own[0]! : null;
    const filename = single && /^tables\/[a-z_]{2,40}\/part-[0-9]{6}\.parquet$/.test(single.relativePath) ? single.relativePath : null;
    return {
      key,
      filename,
      digest: single ? single.partDigest : null,
      state: "SEALED",
      part_count: own.length,
      download: ARTIFACT_DOWNLOAD_NOT_PUBLISHED,
      availability: single ? AVAILABLE : NOT_PUBLISHED("P18_MULTI_PART_TABLE_HAS_NO_SINGLE_PART_DIGEST"),
    };
  });
}

/* ------------------------------------------------ X2 · P18-T10 final audit */

/** The run's own lineage row (P19): its relationship and any AUDIT_OF_SELECTION child. */
export interface ReportAuditRelation {
  relationshipKind: string;
  parentRunId: string | null;
  auditChildren: ReadonlyArray<{ runId: string; state: string }>;
}

const FINAL_AUDIT_NOT_READ = "P18_RUN_LINEAGE_RELATION_NOT_READ";

function linkedChild(relation: ReportAuditRelation, runId: string, target: ResearchReportFinalAudit["audit_target_kind"]): ResearchReportFinalAudit | null {
  if (relation.relationshipKind === "AUDIT_OF_SELECTION") {
    return {
      schema_version: "research.report-final-audit.v1", kind: "LINKED_CHILD", reason_code: null, audit_target_kind: target,
      final_audit_run_id: runId, audited_run_id: relation.parentRunId, relationship: "AUDIT_OF_SELECTION",
      optimizer_reinvoked: false, optimizer_basis: "AUDIT_OF_SELECTION_RUNS_THE_PINNED_SELECTION",
      source_refs: [{ key: "lineage.relationship", ref: `AUDIT_OF_SELECTION of ${relation.parentRunId ?? "unknown"}` }], folds: [],
    };
  }
  const ready = relation.auditChildren.filter((child) => child.state === "READY");
  if (ready.length === 0) return null;
  const child = ready[ready.length - 1]!;
  return {
    schema_version: "research.report-final-audit.v1", kind: "LINKED_CHILD", reason_code: null, audit_target_kind: target,
    final_audit_run_id: child.runId, audited_run_id: runId, relationship: "AUDIT_OF_SELECTION",
    optimizer_reinvoked: false, optimizer_basis: "AUDIT_OF_SELECTION_RUNS_THE_PINNED_SELECTION",
    source_refs: [{ key: "lineage.audit_child", ref: `${child.runId} · READY · AUDIT_OF_SELECTION` }], folds: [],
  };
}

/**
 * WFO lane: the run is its own final audit unless the lineage names a READY
 * AUDIT_OF_SELECTION child. Reuse is proven per fold by QuantBT's child
 * audit: the out-of-sample generation child ran the frozen candidate
 * (P16-T11), so no second optimisation produced the reported path.
 */
export function retainedFinalAudit(
  runId: string,
  relation: ReportAuditRelation | null,
  freeze: ResearchCurrentSourceFreezeResponse,
  search: ResearchCurrentSourceSearchResponse,
  replay: ResearchCurrentSourceReplayResponse,
): ResearchReportFinalAudit {
  if (relation === null) {
    return {
      schema_version: "research.report-final-audit.v1", kind: "NOT_PUBLISHED", reason_code: FINAL_AUDIT_NOT_READ, audit_target_kind: "SINGLE_PARAMETER_SET",
      final_audit_run_id: null, audited_run_id: null, relationship: null, optimizer_reinvoked: null, optimizer_basis: null, source_refs: [], folds: [],
    };
  }
  const linked = linkedChild(relation, runId, "SINGLE_PARAMETER_SET");
  if (linked) return linked;
  const ordering = (freeze as { fold_ordering?: { frozen_candidate: { candidate_id: string | null }; folds: Array<{ fold_id: string; oos_generation_child: { state: ResearchReportFinalAudit["folds"][number]["state"]; audit_ordinal: number | null; candidate_id: string | null } }> } }).fold_ordering;
  const folds = (ordering?.folds ?? []).map((fold) => ({
    fold_id: fold.fold_id,
    audit_ordinal: fold.oos_generation_child.audit_ordinal,
    candidate_id: fold.oos_generation_child.candidate_id,
    state: fold.oos_generation_child.state,
  }));
  const allMatch = folds.length > 0 && folds.every((fold) => fold.state === "MATCH");
  const anyMismatch = folds.some((fold) => fold.state === "MISMATCH");
  return {
    schema_version: "research.report-final-audit.v1",
    kind: "REUSED_ORIGINAL",
    reason_code: null,
    audit_target_kind: "SINGLE_PARAMETER_SET",
    final_audit_run_id: runId,
    audited_run_id: runId,
    relationship: "PRIMARY",
    optimizer_reinvoked: allMatch ? false : anyMismatch ? true : null,
    optimizer_basis: allMatch
      ? "EVERY_OOS_GENERATION_CHILD_RAN_THE_FROZEN_CANDIDATE"
      : anyMismatch ? "AN_OOS_GENERATION_CHILD_RAN_ANOTHER_CANDIDATE" : "QUANTBT_CHILD_AUDIT_NOT_RETAINED_FOR_EVERY_FOLD",
    source_refs: [
      { key: "selection", ref: `${search.revision} · trial ${search.selection.selected_trial_id ?? "none"}` },
      { key: "frozen_candidate", ref: `QUANTBT_WALKFORWARD_STRATEGY_CANDIDATE_ID_V1 ${ordering?.frozen_candidate.candidate_id ?? "not computable"}` },
      { key: "freeze", ref: freeze.revision },
      { key: "replay", ref: replay.revision },
    ],
    folds,
  };
}

/** P04 lane: the fixed qualification child is its own audit; it runs no optimizer by construction. */
export function fixedFinalAudit(runId: string, relation: ReportAuditRelation | null, revisions: { split: string; replay: string; freeze: string }): ResearchReportFinalAudit {
  if (relation === null) {
    return {
      schema_version: "research.report-final-audit.v1", kind: "NOT_PUBLISHED", reason_code: FINAL_AUDIT_NOT_READ, audit_target_kind: "FIXED_PARAMETER_PROFILE",
      final_audit_run_id: null, audited_run_id: null, relationship: null, optimizer_reinvoked: null, optimizer_basis: null, source_refs: [], folds: [],
    };
  }
  const linked = linkedChild(relation, runId, "FIXED_PARAMETER_PROFILE");
  if (linked) return linked;
  return {
    schema_version: "research.report-final-audit.v1",
    kind: "REUSED_ORIGINAL",
    reason_code: null,
    audit_target_kind: "FIXED_PARAMETER_PROFILE",
    final_audit_run_id: runId,
    audited_run_id: runId,
    relationship: "PRIMARY",
    optimizer_reinvoked: false,
    optimizer_basis: "P04_FIXED_PROFILE_RUNS_NO_OPTIMIZER",
    source_refs: [
      { key: "p14.split_receipt", ref: revisions.split },
      { key: "p16.freeze", ref: revisions.freeze },
      { key: "p17.replay", ref: revisions.replay },
    ],
    folds: [],
  };
}

/* ------------------------------------------ X2 · spec 09 T06 failed-run core */

const STAGE_LABELS: Record<string, string> = {
  S1: "S1 Split", S2: "S2 Search", S3: "S3 Freeze", S4: "S4 Execute", S5: "S5 Claim", SEAL: "the seal",
};

export interface FailedReads {
  hub: Hub | null;
  snapshot: ResearchProgressSnapshot;
  failure: { code: string; message: string | null };
  terminalSequence: number;
  failedAtUtcMs: number;
}

/**
 * The failed-run sheet: no claim, sealed from the terminal snapshot P11
 * persisted with `run_failed`. The failing stage is the one the snapshot
 * shows RUNNING (else the first not DONE; SEAL when all five finished).
 */
export function failedCore(reads: FailedReads): ResearchReportFrozenCoreFailed {
  const { hub, snapshot, failure } = reads;
  const cancelled = failure.code === "USER_CANCELLED";
  const running = snapshot.stages.find((stage) => stage.state === "RUNNING");
  const pending = snapshot.stages.find((stage) => stage.state !== "DONE");
  const failed = (running ?? pending)?.key ?? "SEAL";
  const failedIndex = failed === "SEAL" ? 5 : snapshot.stages.findIndex((stage) => stage.key === failed);
  const label = STAGE_LABELS[failed] ?? failed;
  const verb = cancelled ? "cancelled" : "failed";
  const ids = hub ? hubIdentity(hub) : null;
  const data = hub?.core.data;
  const missing = NOT_PUBLISHED("P18_RUN_IDENTITY_NOT_PUBLISHED");
  const optimizationFact = ids ? optimization(ids.mode, ids.schedule) : { value: null, availability: missing };
  const message = failure.message && failure.message.length > 0 && failure.message.length <= 256 ? failure.message : null;
  return {
    schema_version: "research.report-failed-core.v1",
    report_source: "P11_TERMINAL_FAILURE",
    outcome: {
      state: cancelled ? "CANCELLED" : "FAILED",
      failed_stage: failed as ResearchReportFrozenCoreFailed["outcome"]["failed_stage"],
      failed_stage_label: label,
      headline: `no claim — run ${verb} at ${label}`,
      failure_code: failure.code.slice(0, 160),
      failure_message: message,
      failed_at_utc_ms: reads.failedAtUtcMs,
      terminal_sequence: reads.terminalSequence,
    },
    title: title(ids?.strategyName ?? null, data?.symbol ?? null, data?.timeframe ?? null),
    identity: [
      identity("run_id", "Run ID", snapshot.run_id, AVAILABLE, "P18_RUN_ID_NOT_PUBLISHED"),
      ids?.alpha ?? identity("alpha", "Alpha", null, missing, "P18_ALPHA_BINDING_NOT_PUBLISHED"),
      ids?.alphaVersion ?? identity("alpha_version", "Alpha version", null, missing, "P18_ALPHA_BINDING_NOT_PUBLISHED"),
      ids?.binding ?? identity("binding", "Binding", null, missing, "P18_ALPHA_BINDING_NOT_PUBLISHED"),
      ids?.strategy ?? identity("strategy", "Strategy", null, missing, "P18_ALPHA_BINDING_NOT_PUBLISHED"),
      identity("dataset_id", "Dataset", data?.dataset_id ?? null, hub ? AVAILABLE : missing, "P18_DATASET_NOT_PUBLISHED"),
      identity("symbol", "Symbol", data?.symbol ?? null, hub ? AVAILABLE : missing, "P18_SYMBOL_NOT_PUBLISHED"),
      identity("timeframe", "Timeframe", data?.timeframe ?? null, hub ? AVAILABLE : missing, "P18_TIMEFRAME_NOT_PUBLISHED"),
      identity("route", "Route", ids?.route.value ?? null, ids?.route.availability ?? missing, "P18_ROUTE_NOT_PUBLISHED"),
      identity("optimization", "Optimization", optimizationFact.value, optimizationFact.availability, "P18_OPTIMIZATION_NOT_PUBLISHED"),
      identity("random_seed", "Seed", ids?.seed.value ?? null, ids?.seed.availability ?? missing, "P18_SEED_NOT_PUBLISHED"),
      identity("config_digest", "Config digest", ids?.configDigest.value ?? null, ids?.configDigest.availability ?? missing, "P18_CONFIG_DIGEST_NOT_PUBLISHED"),
      identity("attempt_id", "Attempt", snapshot.attempt_id, AVAILABLE, "P18_ATTEMPT_NOT_PUBLISHED"),
    ],
    stages: snapshot.stages.map((stage, index) => ({
      key: stage.key,
      state: stage.state,
      started_at_utc_ms: stage.started_at_utc_ms,
      completed_at_utc_ms: stage.completed_at_utc_ms,
      check: index < failedIndex
        ? check("NOT_PUBLISHED", "stage finished; no check was sealed because the run ended before its evidence was sealed", "p11.progress.stages", NOT_PUBLISHED("P18_FAILED_RUN_SEALS_NO_STAGE_CHECK"))
        : index === failedIndex
          ? check("FAIL", `run ${verb} here — ${failure.code.slice(0, 160)}${message ? `: ${message}` : ""}`.slice(0, 512), "p11.progress.run_failed", AVAILABLE)
          : check("NOT_APPLICABLE", null, null, NOT_APPLICABLE("P18_RUN_ENDED_BEFORE_THIS_STAGE")),
    })),
    artifacts: snapshot.artifacts.map((artifact) => ({ name: artifact.name, state: artifact.state, size: artifact.size, digest: artifact.digest })),
    mandatory_bundle: snapshot.readiness.mandatory,
    equity: { state: "NOT_PUBLISHED", availability: NOT_PUBLISHED(cancelled ? "P18_CANCELLED_RUN_HAS_NO_EQUITY_TO_REPORT" : "P18_FAILED_RUN_HAS_NO_EQUITY_TO_REPORT") },
    promotion: {
      state: "NOT_PUBLISHED",
      line: `No rc_ can be composed from a ${verb} run — fix the cause and submit a new attempt.`,
      availability: NOT_PUBLISHED("P18_FAILED_RUN_IS_NOT_PROMOTABLE"),
    },
    provenance: {
      line: `P18 failed-run sheet sealed from the P11 terminal snapshot (sequence ${reads.terminalSequence}); it states the failure and reports no metric.`,
      read_model_revision: "research.report-read-model.v2",
      source: "P11_TERMINAL_PROGRESS_SNAPSHOT",
    },
  };
}

export interface RetainedReads {
  hub: Hub;
  evidence: ResearchCurrentSourceEvidenceResponse;
  split: ResearchCurrentSourceSplitResponse;
  search: ResearchCurrentSourceSearchResponse;
  freeze: ResearchCurrentSourceFreezeResponse;
  replay: ResearchCurrentSourceReplayResponse;
  equity: ResearchCurrentSourceEvidenceSeriesResponse;
  parts: SealedArtifactParts | null;
}

type AnalyticsFact = ResearchRetainedAnalyticsV2["metrics"]["sharpe"];
const REPORT_ANALYTICS: Array<{
  key: string; label: string; unit: CoreV2["metrics"][number]["unit"];
  fact: (block: ResearchRetainedAnalyticsV2) => AnalyticsFact;
}> = [
  ["ALL_TIME_OOS_SHARPE", "All-time OOS Sharpe", "RATIO", (b: ResearchRetainedAnalyticsV2) => b.metrics.sharpe],
  ["OOS_SORTINO", "OOS Sortino", "RATIO", (b: ResearchRetainedAnalyticsV2) => b.metrics.sortino],
  ["OOS_CAGR_FRACTION", "OOS CAGR", "FRACTION", (b: ResearchRetainedAnalyticsV2) => b.metrics.cagr_fraction],
  ["OOS_PROFIT_FACTOR", "OOS profit factor · bar returns", "RATIO", (b: ResearchRetainedAnalyticsV2) => b.metrics.profit_factor],
  ["OOS_LONG_HIT_RATE_FRACTION", "Long-bar hit rate", "FRACTION", (b: ResearchRetainedAnalyticsV2) => b.metrics.long_hit_rate_fraction],
  ["OOS_SHORT_HIT_RATE_FRACTION", "Short-bar hit rate", "FRACTION", (b: ResearchRetainedAnalyticsV2) => b.metrics.short_hit_rate_fraction],
  ["OOS_VOLATILITY_FRACTION", "OOS annualised volatility", "FRACTION", (b: ResearchRetainedAnalyticsV2) => b.metrics.volatility_fraction],
  ["OOS_SKEW", "OOS skew", "RATIO", (b: ResearchRetainedAnalyticsV2) => b.metrics.skew],
  ["OOS_EXCESS_KURTOSIS", "OOS excess kurtosis", "RATIO", (b: ResearchRetainedAnalyticsV2) => b.metrics.excess_kurtosis],
  ["OOS_BETA", "OOS beta vs run benchmark", "RATIO", (b: ResearchRetainedAnalyticsV2) => b.metrics.beta],
  ["OOS_CORRELATION", "OOS correlation vs run benchmark", "RATIO", (b: ResearchRetainedAnalyticsV2) => b.metrics.correlation],
  ["OOS_BENCHMARK_RETURN_FRACTION", "OOS benchmark return", "FRACTION", (b: ResearchRetainedAnalyticsV2) => b.metrics.benchmark_return_fraction],
  ["OOS_MAX_DRAWDOWN_DURATION_DAYS", "OOS max drawdown duration · days", "COUNT", (b: ResearchRetainedAnalyticsV2) => b.metrics.max_drawdown_duration_days],
  ["OOS_SHARPE_DECAY", "IS minus OOS Sharpe", "RATIO", (b: ResearchRetainedAnalyticsV2) => b.metrics.sharpe_decay],
  ["OOS_EXPOSURE_LONG_FRACTION", "OOS long exposure", "FRACTION", (b: ResearchRetainedAnalyticsV2) => b.behaviour.exposure_long_fraction],
  ["OOS_EXPOSURE_SHORT_FRACTION", "OOS short exposure", "FRACTION", (b: ResearchRetainedAnalyticsV2) => b.behaviour.exposure_short_fraction],
  ["OOS_EXPOSURE_FLAT_FRACTION", "OOS flat exposure", "FRACTION", (b: ResearchRetainedAnalyticsV2) => b.behaviour.exposure_flat_fraction],
  ["OOS_EPISODE_WIN_RATE", "OOS episode win rate · not audited trades", "FRACTION", (b: ResearchRetainedAnalyticsV2) => b.behaviour.win_rate],
  ["OOS_EPISODE_PAYOFF_RATIO", "OOS episode payoff · not audited trades", "RATIO", (b: ResearchRetainedAnalyticsV2) => b.behaviour.payoff_ratio],
  ["OOS_EPISODE_AVG_HOLD_SECONDS", "OOS episode average hold · seconds", "COUNT", (b: ResearchRetainedAnalyticsV2) => b.behaviour.average_hold_seconds],
  ["OOS_EPISODE_MAX_CONSECUTIVE_LOSSES", "OOS episode max consecutive losses", "COUNT", (b: ResearchRetainedAnalyticsV2) => b.behaviour.max_consecutive_losses],
  ["OOS_TURNOVER_NOTIONAL", "OOS turnover notional", "CURRENCY", (b: ResearchRetainedAnalyticsV2) => b.behaviour.turnover_notional],
].map(([key, label, unit, fact]) => ({ key, label, unit, fact })) as typeof REPORT_ANALYTICS;

function descriptiveMetrics(block: ResearchRetainedAnalyticsV2 | undefined): CoreV2["metrics"] {
  if (!block) return [];
  return REPORT_ANALYTICS.map(({ key, label, unit, fact }) => {
    const value = fact(block);
    return {
      key, label, unit, scope: "OOS" as const, origin: value.origin,
      definition_id: `research.metric.v2.portal_${key.toLowerCase()}`,
      value: value.value,
      availability: { state: value.state, reason_code: value.reason_code },
    };
  });
}

function descriptiveFact(fact: AnalyticsFact | undefined, fallback: string) {
  return fact
    ? { value: fact.value, availability: { state: fact.state, reason_code: fact.reason_code } as Availability }
    : { value: null, availability: NOT_PUBLISHED(fallback) };
}

/** The Delta WFO lane: every fact from the retained current-source reads. */
export function retainedCore(reads: RetainedReads): CoreV2 {
  const { hub, evidence, split, search, freeze, replay, equity, parts } = reads;
  const provenance = evidence.provenance;
  const claim = evidence.claim;
  const verdicts = evidence.fold_verdicts;
  const contract = search.search_contract;
  const ids = hubIdentity(hub);
  const data = hub.core.data;
  const symbol = data.symbol ?? null;
  const timeframe = data.timeframe ?? null;
  const folds = [...verdicts.rows].sort((left, right) => left.source_ordinal - right.source_ordinal);
  const schedule = contract.optimization_schedule;
  const params = parameterText(search.selection.parameters);
  const globalParams = schedule === "global" && params !== null;
  const claimText = (value: { value: unknown; availability: unknown }) =>
    ({ value: value.value === null || value.value === undefined ? null : String(value.value), availability: value.availability as Availability });
  const modeSchedule = contract.optimization_mode !== null && schedule !== null
    ? { value: `${contract.optimization_mode} × ${schedule}`, availability: AVAILABLE }
    : { value: null, availability: NOT_PUBLISHED("QUANTBT_SEARCH_CONTRACT_NOT_PUBLISHED") };
  const guards = split.guards;
  const foldCount = split.fold_plan.folds.length;
  const protocol = claim.validation_claim.value !== null
    ? `${claim.validation_claim.value} · ${foldCount} outer folds · purge ${guards.purge_bars.value ?? "n/a"} bars · embargo ${guards.embargo_bars.value ?? "n/a"} bars`
    : null;
  const runtime = claim.runtime_authority;
  const runtimeText = runtime.value !== null
    ? [String(runtime.value), runtime.final_account_runtime ? `final account ${runtime.final_account_runtime}` : null, runtime.scoring_backend ? `scoring ${runtime.scoring_backend}` : null]
      .filter((item): item is string => item !== null).join(" · ")
    : null;

  // CG-P18-06: one retained final-account path, partitioned by the source fold plan.
  const testWindows = folds
    .filter((row) => row.test_start_utc_ms !== null && row.test_end_utc_ms !== null)
    .map((row) => [row.test_start_utc_ms!, row.test_end_utc_ms!] as const);
  const firstTest = testWindows.length > 0 ? Math.min(...testWindows.map(([start]) => start)) : null;
  const points = equity.availability.state === "AVAILABLE"
    ? (equity.values as Array<{ at_utc_ms: number; equity: string; drawdown_fraction: string }>)
      .map((value) => ({ at_utc_ms: value.at_utc_ms, equity: value.equity, drawdown_fraction: value.drawdown_fraction }))
    : [];
  const seriesSampling = (equity.source_sample as { sampling?: string }).sampling === "FULL" ? "FULL" as const : "OBSERVATION_EXTREMA_BUCKET_V2" as const;
  const oosPoints = points.filter((point) => testWindows.some(([start, end]) => point.at_utc_ms >= start && point.at_utc_ms <= end));
  const isPoints = firstTest === null ? [] : points.filter((point) => point.at_utc_ms < firstTest);

  const oosTrades = sumIntegerStrings(folds.map((row) => row.oos_trades));
  const decimalFact = (value: string | null, reason: string) => ({ value, availability: value === null ? NOT_PUBLISHED(reason) : AVAILABLE });
  const passport = evidence.passport;
  const netOos = evidence.summary_analytics?.net_oos_return;
  const netOosValue = netOos?.state === "AVAILABLE" ? netOos.value : null;
  const netOosReason = netOos?.reason_code ?? "RS02_SOURCE_PREDATES_RETAINED_OOS_RETURN";
  const analyticsV2 = evidence.summary_analytics_v2;
  const scoped = (key: string, label: string, unit: "CURRENCY" | "FRACTION" | "COUNT" | "RATIO", scope: CoreV2["metrics"][number]["scope"], origin: "ENGINE_DIRECT" | "SOURCE_DERIVED", value: string | null, reason: string) =>
    ({ key, label, unit, scope, origin, definition_id: `research.metric.v1.rs02_${key.toLowerCase()}`, value, availability: value === null ? NOT_PUBLISHED(reason) : AVAILABLE });
  const oosUsed = claim.oos_used_for_selection.value;
  const integrityMatch = freeze.integrity.state === "MATCH";
  const drag = verdicts.counts.drag;
  const warn = verdicts.counts.warn;

  return {
    schema_version: "research.report-frozen-core.v2",
    report_source: "RS02_RETAINED_CURRENT_SOURCE",
    source_revisions: {
      evidence_revision: evidence.revision,
      split_revision: split.revision,
      search_revision: search.revision,
      freeze_revision: freeze.revision,
      replay_revision: replay.revision,
    },
    source_digests: {
      source_transform_digest: provenance.source_transform_digest,
      requested_spec_digest: provenance.requested_spec_digest,
      effective_spec_digest: provenance.effective_spec_digest,
      dataset_binding_digest: provenance.dataset_binding_digest,
      manifest_digest: provenance.source_manifest_digest,
    },
    title: title(ids.strategyName, symbol, timeframe),
    certification: CERTIFICATION_NOT_PUBLISHED,
    // CG-P18-01: the hi-fi passport — verbatim QuantBT claim facts, each with its key.
    passport: [
      fact("validation_claim", "validation_claim", claimText(claim.validation_claim).value, claimText(claim.validation_claim).availability, "QUANTBT_VALIDATION_CLAIM_NOT_PUBLISHED"),
      fact("chronological_claim", "chronological_claim", claimText(claim.chronological_claim).value, claimText(claim.chronological_claim).availability, "QUANTBT_CHRONOLOGICAL_CLAIM_NOT_PUBLISHED"),
      fact("oos_used_for_selection", "oos_used_for_selection", claimText(claim.oos_used_for_selection).value, claimText(claim.oos_used_for_selection).availability, "QUANTBT_OOS_SELECTION_FACT_NOT_PUBLISHED"),
      fact("holdout_state", "holdout_state", claimText(claim.holdout).value, claimText(claim.holdout).availability, "QUANTBT_HOLDOUT_FACT_NOT_PUBLISHED"),
      fact("scoring_backend", "scoring_backend", runtime.scoring_backend ?? null, runtime.scoring_backend ? AVAILABLE : NOT_PUBLISHED("QUANTBT_SCORING_BACKEND_NOT_PUBLISHED"), "QUANTBT_SCORING_BACKEND_NOT_PUBLISHED"),
      fact("mode_schedule", "mode × schedule", modeSchedule.value, modeSchedule.availability, "QUANTBT_SEARCH_CONTRACT_NOT_PUBLISHED"),
    ],
    // CG-P18-03/11: the §16.3 identity, in the hi-fi order.
    identity: [
      identity("run_id", "Run ID", hub.run_id, AVAILABLE, "P18_RUN_ID_NOT_PUBLISHED"),
      ids.alpha,
      ids.alphaVersion,
      ids.binding,
      ids.strategy,
      identity("source_adapter", "Source adapter", provenance.source_adapter_id, AVAILABLE, "RS02_SOURCE_ADAPTER_NOT_PUBLISHED"),
      identity("engine_version", "Engine version", provenance.engine_version, AVAILABLE, "RS02_ENGINE_VERSION_NOT_PUBLISHED"),
      identity("execution_profile", "Execution profile", provenance.profile_id, AVAILABLE, "RS02_PROFILE_NOT_PUBLISHED"),
      identity("dataset_id", "Dataset", data.dataset_id ?? null, AVAILABLE, "P18_DATASET_NOT_PUBLISHED"),
      identity("symbol", "Symbol", symbol, AVAILABLE, "P18_SYMBOL_NOT_PUBLISHED"),
      identity("timeframe", "Timeframe", timeframe, AVAILABLE, "P18_TIMEFRAME_NOT_PUBLISHED"),
      identity("protocol", "Protocol", protocol, AVAILABLE, "QUANTBT_VALIDATION_CLAIM_NOT_PUBLISHED"),
      identity("route", "Route", ids.route.value, ids.route.availability, "P18_ROUTE_NOT_PUBLISHED"),
      identity("runtime_authority", "Runtime", runtimeText, runtime.availability as Availability, "QUANTBT_RUNTIME_AUTHORITY_NOT_PUBLISHED"),
      identity("optimization", "Optimization", modeSchedule.value, modeSchedule.availability, "QUANTBT_SEARCH_CONTRACT_NOT_PUBLISHED"),
      identity("selected_params", "Selected parameters", params, search.selection.availability as Availability, "QUANTBT_SELECTION_NOT_PUBLISHED"),
      identity("random_seed", "Seed", ids.seed.value, ids.seed.availability, "P18_SEED_NOT_PUBLISHED"),
      identity("config_digest", "Config digest", ids.configDigest.value, ids.configDigest.availability, "P18_CONFIG_DIGEST_NOT_PUBLISHED"),
      identity("evidence_revision", "Evidence revision", evidence.revision, AVAILABLE, "P18_REVISION_NOT_PUBLISHED"),
      identity("split_revision", "Split revision", split.revision, AVAILABLE, "P18_REVISION_NOT_PUBLISHED"),
      identity("search_revision", "Search revision", search.revision, AVAILABLE, "P18_REVISION_NOT_PUBLISHED"),
      identity("freeze_revision", "Freeze revision", freeze.revision, AVAILABLE, "P18_REVISION_NOT_PUBLISHED"),
      identity("replay_revision", "Replay revision", replay.revision, AVAILABLE, "P18_REVISION_NOT_PUBLISHED"),
    ],
    metrics: [
      scoped("INITIAL_EQUITY", "Initial equity", "CURRENCY", "IS_PLUS_OOS", "ENGINE_DIRECT", passport.initial_equity, "RS02_INITIAL_EQUITY_NOT_PUBLISHED"),
      scoped("FINAL_EQUITY", "Final equity", "CURRENCY", "IS_PLUS_OOS", "ENGINE_DIRECT", passport.final_equity, "RS02_FINAL_EQUITY_NOT_PUBLISHED"),
      scoped("NET_RETURN_FRACTION", "Net return", "FRACTION", "IS_PLUS_OOS", "SOURCE_DERIVED", passport.net_return_fraction, "RS02_NET_RETURN_NOT_PUBLISHED"),
      scoped("NET_OOS_RETURN_FRACTION", "Net OOS return", "FRACTION", "OOS", "ENGINE_DIRECT", netOosValue, netOosReason),
      scoped("MAX_DRAWDOWN_FRACTION", "Max drawdown", "FRACTION", "IS_PLUS_OOS", "SOURCE_DERIVED", passport.max_drawdown_fraction, "RS02_MAX_DRAWDOWN_NOT_PUBLISHED"),
      scoped("MEAN_OOS_SHARPE", "Mean OOS Sharpe", "RATIO", "OOS_MEAN_OF_FOLDS", "ENGINE_DIRECT", verdicts.mean_oos_sharpe, "QUANTBT_SELECTED_CANDIDATE_OOS_SHARPE_NOT_PUBLISHED"),
      scoped("MEAN_DECAY", "Mean decay", "RATIO", "OOS_MEAN_OF_FOLDS", "ENGINE_DIRECT", verdicts.mean_decay, "QUANTBT_SELECTED_CANDIDATE_DECAY_NOT_PUBLISHED"),
      scoped("OOS_TRADE_COUNT", "OOS trades", "COUNT", "OOS_SUM_OF_FOLDS", "SOURCE_DERIVED", oosTrades, "QUANTBT_FOLD_OOS_TRADES_NOT_PUBLISHED"),
      ...descriptiveMetrics(analyticsV2),
    ],
    headline: [
      // Real engine OOS fact; old seals stay absent, never relabelled on GET.
      { key: "NET_RETURN", label: "Net OOS return", scope: "OOS", ...decimalFact(netOosValue, netOosReason) },
      { key: "OOS_SHARPE", label: analyticsV2 ? "All-time OOS Sharpe" : "OOS Sharpe · fold mean", scope: analyticsV2 ? "OOS" : "OOS_MEAN_OF_FOLDS", ...(analyticsV2 ? descriptiveFact(analyticsV2.metrics.sharpe, "PORTAL_ANALYTICS_SHARPE_NOT_AVAILABLE") : decimalFact(verdicts.mean_oos_sharpe, "QUANTBT_SELECTED_CANDIDATE_OOS_SHARPE_NOT_PUBLISHED")) },
      { key: "DECAY_MEAN", label: "Decay mean", scope: "OOS_MEAN_OF_FOLDS", ...decimalFact(verdicts.mean_decay, "QUANTBT_SELECTED_CANDIDATE_DECAY_NOT_PUBLISHED") },
      { key: "MAX_DRAWDOWN", label: "Max drawdown", scope: "IS_PLUS_OOS", ...decimalFact(passport.max_drawdown_fraction, "RS02_MAX_DRAWDOWN_NOT_PUBLISHED") },
      { key: "TRADES", label: "OOS trades", scope: "OOS_SUM_OF_FOLDS", ...decimalFact(oosTrades, "QUANTBT_FOLD_OOS_TRADES_NOT_PUBLISHED") },
      { key: "WIN_RATE", label: analyticsV2 ? "Episode win rate · not audited trades" : "Win rate", scope: analyticsV2 ? "OOS" : "NOT_PUBLISHED", ...(analyticsV2 ? descriptiveFact(analyticsV2.behaviour.win_rate, "PORTAL_ANALYTICS_EPISODE_WIN_RATE_UNAVAILABLE") : { value: null, availability: NOT_PUBLISHED("QUANTBT_ADVANCED_WFO_DID_NOT_PUBLISH_AUDITED_FILLS") }) },
      { key: "FUNDING", label: "Funding", scope: "NOT_PUBLISHED", value: null, availability: NOT_PUBLISHED("RS02_SUMMARY_PUBLISHES_NO_FUNDING_TOTAL") },
    ],
    headline_footnote: "Net OOS return is QuantBT full_report(total_return_pct)/100 on outer-test windows. New seals carry all-time OOS Sharpe and descriptive episode win rate. Older seals retain typed fold-mean/absence. Drawdown covers the whole retained account path; decay remains a fold mean and trade count is not an audited trade ledger.",
    equity: equityBlock("RS02_STITCHED_OUTER_TEST_WINDOWS", oosPoints, seriesSampling, 600, "RS02_OUTER_TEST_WINDOWS_HAVE_NO_RETAINED_OBSERVATIONS"),
    equity_is: equityBlock("RS02_FINAL_ACCOUNT_BEFORE_FIRST_OUTER_TEST", isPoints, seriesSampling, 300, "RS02_NO_RETAINED_OBSERVATION_BEFORE_FIRST_OUTER_TEST"),
    folds: {
      state: verdicts.state === "AVAILABLE" ? "AVAILABLE" : "NOT_PUBLISHED",
      reason_code: verdicts.state === "AVAILABLE" ? null : verdicts.reason_code,
      rule: { version: verdicts.rule.version, pass: verdicts.rule.pass, warn: verdicts.rule.warn },
      order: "SOURCE_ORDINAL_ASC",
      // CG-P18-08: a global schedule freezes one selection for every fold boundary.
      params_handoff: globalParams
        ? { scope: "GLOBAL_SELECTION_APPLIES_TO_EVERY_FOLD", text: params, availability: AVAILABLE }
        : { scope: "NOT_PUBLISHED", text: null, availability: NOT_PUBLISHED("QUANTBT_PER_FOLD_PARAMETERS_NOT_RETAINED") },
      rows: folds.map((row) => ({
        fold_id: row.fold_id,
        source_ordinal: row.source_ordinal,
        test_start_utc_ms: row.test_start_utc_ms,
        test_last_bar_utc_ms: row.test_end_utc_ms,
        verdict: row.verdict,
        failed_criteria: row.failed_criteria,
        drag_target: row.drag_target,
        params: globalParams
          ? { text: params, availability: AVAILABLE }
          : { text: null, availability: NOT_PUBLISHED("QUANTBT_PER_FOLD_PARAMETERS_NOT_RETAINED") },
        is_sharpe: decimalFact(row.is_sharpe, "QUANTBT_FOLD_IS_SHARPE_NOT_PUBLISHED"),
        oos_sharpe: decimalFact(row.oos_sharpe, "QUANTBT_FOLD_OOS_SHARPE_NOT_PUBLISHED"),
        decay: decimalFact(row.decay, "QUANTBT_FOLD_DECAY_NOT_PUBLISHED"),
        contribution_fraction: decimalFact(row.return_fraction, "RS02_FOLD_RETURN_NOT_RETAINED"),
        max_drawdown_fraction: decimalFact(row.max_drawdown_fraction, "RS02_FOLD_DRAWDOWN_NOT_RETAINED"),
        oos_trades: decimalFact(row.oos_trades, "QUANTBT_FOLD_OOS_TRADES_NOT_PUBLISHED"),
      })),
      availability: verdicts.availability as Availability,
    },
    // CG-P18-05: each stage's check is one sourced fact; progress stays in `state`.
    stages: hub.stages.map((hubStage) => {
      switch (hubStage.key) {
        case "S1":
          return stage(hubStage, claim.holdout.state === "AVAILABLE"
            ? check("PASS", `${foldCount} outer folds retained · holdout ${String(claim.holdout.value)}`, "p10.delta_wfo_profile.segments", AVAILABLE)
            : check("CAVEAT", `${foldCount} outer folds retained · no holdout segment`, "p10.delta_wfo_profile.segments", AVAILABLE));
        case "S2":
          return stage(hubStage, oosUsed === null
            ? noCheck("QUANTBT_OOS_SELECTION_FACT_NOT_PUBLISHED")
            : oosUsed === true
              ? check("CAVEAT", "selection saw the outer test windows", "walk_forward.oos_used_for_selection", AVAILABLE)
              : check("PASS", "selection never saw the outer test windows", "walk_forward.oos_used_for_selection", AVAILABLE));
        case "S3":
          return stage(hubStage, integrityMatch
            ? check("PASS", "retained manifest and import digests match", "rs02.freeze.integrity", AVAILABLE)
            : check("FAIL", "retained import digest does not match its seal", "rs02.freeze.integrity", AVAILABLE));
        case "S4":
          return stage(hubStage, replay.route_capabilities.model_positions.state === "AVAILABLE"
            ? check("PASS", `${replay.replay.source_observation_count} retained model observations · orders and fills not published`, "rs02.replay.model_positions", AVAILABLE)
            : noCheck(replay.route_capabilities.model_positions.reason_code ?? "RS02_REPLAY_NOT_RETAINED"));
        default:
          return stage(hubStage, verdicts.state !== "AVAILABLE"
            ? noCheck(verdicts.reason_code ?? "RS02_FOLD_VERDICTS_NOT_PUBLISHED")
            : check(drag > 0 ? "FAIL" : warn > 0 ? "CAVEAT" : "PASS",
              `${verdicts.counts.pass} pass · ${warn} warn · ${drag} drag of ${verdicts.counts.folds} folds`, "research.fold-verdict.v1", AVAILABLE));
      }
    }),
    artifacts: [
      { key: "RUN_SPEC", filename: null, digest: null, state: "NOT_PUBLISHED", part_count: null, download: ARTIFACT_DOWNLOAD_NOT_PUBLISHED, availability: NOT_PUBLISHED("P18_REQUESTED_SPEC_BYTES_NOT_PUBLISHED") },
      ...tableArtifacts(parts, provenance.source_manifest_digest, () => "RS02_RETAINED_TABLE_HAS_NO_SEALED_PART"),
      { key: "FILL_LEDGER", filename: null, digest: null, state: "NOT_PUBLISHED", part_count: null, download: ARTIFACT_DOWNLOAD_NOT_PUBLISHED, availability: NOT_PUBLISHED("QUANTBT_ADVANCED_WFO_DID_NOT_PUBLISH_AUDITED_FILLS") },
      { key: "METRICS_SUMMARY", filename: null, digest: null, state: "NOT_PUBLISHED", part_count: null, download: ARTIFACT_DOWNLOAD_NOT_PUBLISHED, availability: NOT_PUBLISHED("P05_ARTIFACT_DOCUMENT_DIGEST_IS_NOT_RETAINED") },
      { key: "CLAIM", filename: null, digest: null, state: "NOT_PUBLISHED", part_count: null, download: ARTIFACT_DOWNLOAD_NOT_PUBLISHED, availability: NOT_PUBLISHED("P05_ARTIFACT_DOCUMENT_DIGEST_IS_NOT_RETAINED") },
      {
        key: "BUNDLE", filename: null, digest: provenance.source_manifest_digest, state: "SEALED", part_count: null,
        download: ARTIFACT_DOWNLOAD_NOT_PUBLISHED, availability: AVAILABLE,
      },
    ],
    warnings: [
      ...(oosUsed === true ? [{
        definition_id: "research.warning.v1.oos-used-for-selection",
        state: "ACTIVE" as const,
        reason_code: "QUANTBT_OOS_USED_FOR_SELECTION",
        copy: "QuantBT reports that selection saw the outer test windows (walk_forward.oos_used_for_selection); these OOS figures are not an untouched holdout.",
      }] : []),
      ...(claim.causality_claim.value === "retrospective_global_calibration" ? [{
        definition_id: "research.warning.v1.retrospective-global-calibration",
        state: "ACTIVE" as const,
        reason_code: "QUANTBT_RETROSPECTIVE_GLOBAL_CALIBRATION",
        copy: "QuantBT reports a retrospective global calibration (walk_forward.causality_claim): one parameter set chosen over every fold, not a causal per-fold refit.",
      }] : []),
    ],
    promotion: {
      state: "NOT_PUBLISHED",
      line: "Promotion/governance approval is not published by the retained Delta WFO source; a report never promotes a run.",
      availability: NOT_PUBLISHED("RS02_SOURCE_DID_NOT_PUBLISH_PROMOTION_APPROVAL"),
    },
    provenance: {
      line: `P18 report sealed from ${evidence.revision}, ${split.revision}, ${search.revision}, ${freeze.revision} and ${replay.revision}; every value is copied from the retained current-source reads.`.slice(0, 1_024),
      metric_registry_version: "research.current-source-metrics.v1",
      data_signature: provenance.dataset_binding_digest,
      read_model_revision: "research.report-read-model.v2",
      verdict_rule_revision: "research.fold-verdict.v1",
    },
    source_absences: {
      ...Object.fromEntries(Object.entries(evidence.source_absences).map(([key, value]) => [key, {
        state: value.state === "NOT_APPLICABLE" ? "NOT_APPLICABLE" as const : "NOT_PUBLISHED" as const,
        text: null,
        reason_code: value.reason_code ?? "RS02_SOURCE_FACT_NOT_PUBLISHED",
        availability: value.availability as Availability,
      }])),
      approval_annotation: { state: "NOT_PUBLISHED", text: null, reason_code: "P18_APPROVAL_ANNOTATION_NOT_PUBLISHED", availability: NOT_PUBLISHED("P18_APPROVAL_ANNOTATION_NOT_PUBLISHED") },
    },
  };
}

export interface FixedProfileReads {
  hub: Hub;
  equity: { availability: Availability; source_sample: { source_observation_count: number | null; emitted_point_count: number; sampling: string | null }; points: EquityPoint[] };
  split: { revision: string; availability: Availability; protocolKind: string | null };
  search: {
    revision: string;
    sourceProfileState: string | null;
    sourceProfileAvailability: Availability;
    /** E14 · 9.7: Screen 06's `requested_optimizer.state` for this run. */
    requestedOptimizerState?: string | null;
  };
  freeze: { revision: string; integrityState: string; integrityAvailability: Availability };
  replay: { revision: string; routeState: string };
}

/** The P04 fixed-profile lane: v1's facts, in the v2 shape, plus what the hubs can answer. */
export function fixedProfileCore(reads: FixedProfileReads): CoreV2 {
  const { hub, equity, split, search, freeze, replay } = reads;
  const sourceAvailability = hub.availability as Availability;
  const core = hub.core;
  const analyticsV2 = hub.summary_analytics_v2;
  const ids = hubIdentity(hub);
  const metric = (key: string) => hub.metrics.find((item) => item.key === key);
  const metricFact = (key: string) => ({
    value: metric(key)?.value ?? null,
    availability: (metric(key)?.availability ?? NOT_PUBLISHED("P18_METRIC_NOT_PUBLISHED")) as Availability,
  });
  const metricScope = (key: string) => (metric(key)?.scope ?? "NOT_PUBLISHED") as CoreV2["headline"][number]["scope"];
  const oosSharpe = hub.oos_performance?.metrics.find((item) => item.key === "OOS_SHARPE");
  const netOos = hub.summary_analytics?.net_oos_return;
  const netOosFact = netOos ? {
    value: netOos.value,
    availability: netOos.state === "AVAILABLE" ? AVAILABLE : NOT_PUBLISHED(netOos.reason_code!),
  } : null;
  const optimizationFact = optimization(ids.mode, ids.schedule);
  /* E14 · 9.7: only the search read may say the declared optimizer never ran. */
  const optimizerQualifier = search.requestedOptimizerState === "DECLARED_NOT_EXECUTED"
    ? OPTIMIZER_DECLARED_NOT_EXECUTED
    : null;
  const noFold = NOT_APPLICABLE("P04_SINGLE_WINDOW_HAS_NO_PER_FOLD_METRICS");
  const absent = (reasonCode: string) => ({ state: "NOT_PUBLISHED" as const, text: null, reason_code: reasonCode, availability: NOT_PUBLISHED(reasonCode) });
  const sampling = equity.source_sample.sampling === "FULL" || equity.source_sample.sampling === "EXTREMA_BUCKET_V1" ? equity.source_sample.sampling : null;
  const integrity = freeze.integrityState;
  const noStageCheck = noCheck("P04_SOURCE_PUBLISHES_NO_STAGE_CHECK");
  return {
    schema_version: "research.report-frozen-core.v2",
    report_source: "P13_P17_FIXED_PROFILE",
    source_revisions: {
      evidence_revision: hub.revision!,
      split_revision: split.revision,
      search_revision: search.revision,
      freeze_revision: freeze.revision,
      replay_revision: replay.revision,
    },
    source_digests: {
      source_transform_digest: core.source_transform_digest,
      requested_spec_digest: core.requested_spec_digest,
      effective_spec_digest: core.effective_spec_digest,
      dataset_binding_digest: core.dataset_binding_digest,
      manifest_digest: core.manifest_digest,
    },
    title: title(ids.strategyName, core.data.symbol ?? null, core.data.timeframe ?? null),
    certification: CERTIFICATION_NOT_PUBLISHED,
    passport: [
      fact("source_adapter", "Source adapter", core.source_adapter_id, sourceAvailability, "P18_SOURCE_ADAPTER_NOT_PUBLISHED"),
      fact("engine_version", "Engine version", core.engine_version, sourceAvailability, "P18_ENGINE_VERSION_NOT_PUBLISHED"),
      fact("input_scope", "Input scope", core.input_scope, sourceAvailability, "P18_INPUT_SCOPE_NOT_PUBLISHED"),
      fact("split_protocol", "Split protocol", split.protocolKind, split.availability, "P18_SPLIT_PROTOCOL_NOT_PUBLISHED"),
      fact("source_profile", "Source profile", search.sourceProfileState === "FIXED_PROFILE_NO_SEARCH" ? search.sourceProfileState : null, search.sourceProfileAvailability, "P18_SOURCE_PROFILE_NOT_PUBLISHED"),
      fact("integrity", "Integrity", integrity, freeze.integrityAvailability, "P18_INTEGRITY_NOT_PUBLISHED"),
    ],
    identity: [
      identity("run_id", "Run ID", hub.run_id, AVAILABLE, "P18_RUN_ID_NOT_PUBLISHED"),
      ids.alpha,
      ids.alphaVersion,
      ids.binding,
      ids.strategy,
      identity("source_adapter", "Source adapter", core.source_adapter_id, sourceAvailability, "P18_SOURCE_ADAPTER_NOT_PUBLISHED"),
      identity("engine_version", "Engine version", core.engine_version, sourceAvailability, "P18_ENGINE_VERSION_NOT_PUBLISHED"),
      identity("input_scope", "Input scope", core.input_scope, sourceAvailability, "P18_INPUT_SCOPE_NOT_PUBLISHED"),
      identity("dataset_id", "Dataset", core.data.dataset_id, sourceAvailability, "P18_DATASET_NOT_PUBLISHED"),
      identity("symbol", "Symbol", core.data.symbol, sourceAvailability, "P18_SYMBOL_NOT_PUBLISHED"),
      identity("timeframe", "Timeframe", core.data.timeframe, sourceAvailability, "P18_TIMEFRAME_NOT_PUBLISHED"),
      identity("protocol", "Protocol", split.protocolKind, split.availability, "P18_SPLIT_PROTOCOL_NOT_PUBLISHED"),
      identity("route", "Route", ids.route.value, ids.route.availability, "P18_ROUTE_NOT_PUBLISHED"),
      identity("runtime_authority", "Runtime", null, NOT_PUBLISHED("P04_SOURCE_DID_NOT_PUBLISH_RUNTIME_AUTHORITY"), "P04_SOURCE_DID_NOT_PUBLISH_RUNTIME_AUTHORITY"),
      identity("optimization", "Optimization", optimizationFact.value, optimizationFact.availability, "P18_OPTIMIZATION_NOT_PUBLISHED", optimizerQualifier),
      identity("selected_params", "Selected parameters", null, NOT_APPLICABLE("P04_FIXED_PROFILE_HAS_NO_SELECTION_TRACE"), "P04_FIXED_PROFILE_HAS_NO_SELECTION_TRACE"),
      identity("random_seed", "Seed", ids.seed.value, ids.seed.availability, "P18_SEED_NOT_PUBLISHED"),
      identity("config_digest", "Config digest", ids.configDigest.value, ids.configDigest.availability, "P18_CONFIG_DIGEST_NOT_PUBLISHED"),
      identity("evidence_revision", "Evidence revision", hub.revision, AVAILABLE, "P18_REVISION_NOT_PUBLISHED"),
      identity("split_revision", "Split revision", split.revision, AVAILABLE, "P18_REVISION_NOT_PUBLISHED"),
      identity("search_revision", "Search revision", search.revision, AVAILABLE, "P18_REVISION_NOT_PUBLISHED"),
      identity("freeze_revision", "Freeze revision", freeze.revision, AVAILABLE, "P18_REVISION_NOT_PUBLISHED"),
      identity("replay_revision", "Replay revision", replay.revision, AVAILABLE, "P18_REVISION_NOT_PUBLISHED"),
    ],
    metrics: [...hub.metrics.map((item) => ({
      key: item.key, label: item.label, unit: item.unit, scope: item.scope,
      origin: item.origin, definition_id: item.definition_id, value: item.value,
      availability: item.availability as Availability,
    })), ...(netOosFact ? [{
      key: "NET_OOS_RETURN_FRACTION", label: "Net OOS return", unit: "FRACTION" as const, scope: "OOS" as const,
      origin: "ENGINE_DIRECT" as const, definition_id: "research.metric.v1.p04_net_oos_return_fraction",
      ...netOosFact,
    }] : []), ...descriptiveMetrics(analyticsV2)],
    headline: [
      // New source-time seals supply the actual engine OOS report, not a renamed full-account ratio.
      netOosFact
        ? { key: "NET_RETURN", label: "Net OOS return", scope: "OOS", ...netOosFact }
        : { key: "NET_RETURN", label: "Net return", scope: metricScope("NET_RETURN_FRACTION"), ...metricFact("NET_RETURN_FRACTION") },
      { key: "OOS_SHARPE", label: "All-time OOS Sharpe",
        scope: analyticsV2 || oosSharpe ? "OOS" : "NOT_PUBLISHED",
        ...(analyticsV2 ? descriptiveFact(analyticsV2.metrics.sharpe, "PORTAL_ANALYTICS_SHARPE_NOT_AVAILABLE") : {
          value: oosSharpe?.value ?? null,
          availability: (oosSharpe?.availability ?? NOT_PUBLISHED("P13_OOS_ANALYTICS_NOT_PUBLISHED")) as Availability,
        }),
      },
      { key: "DECAY_MEAN", label: "IS–OOS Sharpe decay", scope: analyticsV2 ? "OOS" : "NOT_PUBLISHED", ...descriptiveFact(analyticsV2?.metrics.sharpe_decay, "PORTAL_ANALYTICS_V2_NOT_COMPUTED_FOR_SEAL") },
      { key: "MAX_DRAWDOWN", label: "Max drawdown", scope: metricScope("MAX_DRAWDOWN_FRACTION"), ...metricFact("MAX_DRAWDOWN_FRACTION") },
      { key: "TRADES", label: "Trades", scope: metricScope("TRADE_COUNT"), ...metricFact("TRADE_COUNT") },
      { key: "WIN_RATE", label: "Episode win rate · not audited trades", scope: analyticsV2 ? "OOS" : "NOT_PUBLISHED", ...descriptiveFact(analyticsV2?.behaviour.win_rate, "PORTAL_ANALYTICS_V2_NOT_COMPUTED_FOR_SEAL") },
      { key: "FUNDING", label: "Funding", scope: metricScope("FUNDING_TOTAL"), ...metricFact("FUNDING_TOTAL") },
    ],
    headline_footnote: netOosFact
      ? "Net OOS return is QuantBT full_report(total_return_pct)/100 on the immutable P08 OOS slice. Other values retain their sealed Evidence Hub scopes; child-tape trade count is not an audited OOS trade ledger."
      : "All values retain the scope and availability stated by the sealed Evidence Hub; missing optimizer and execution facts are not inferred.",
    equity: equity.availability.state === "AVAILABLE" && equity.points.length > 0
      ? {
        state: "AVAILABLE",
        scope: "P13_OOS_EQUITY",
        source_observation_count: equity.source_sample.source_observation_count,
        emitted_point_count: equity.source_sample.emitted_point_count,
        sampling,
        points: equity.points,
        availability: equity.availability,
      }
      : {
        state: "NOT_PUBLISHED", scope: "NOT_PUBLISHED", source_observation_count: null, emitted_point_count: null,
        sampling: null, points: [], availability: equity.availability.state === "AVAILABLE" ? NOT_PUBLISHED("P13_EQUITY_SERIES_EMPTY") : equity.availability,
      },
    equity_is: {
      state: "NOT_PUBLISHED", scope: "NOT_PUBLISHED", source_observation_count: null, emitted_point_count: null,
      sampling: null, points: [], availability: NOT_PUBLISHED("P04_SOURCE_DID_NOT_PUBLISH_IS_EQUITY_SERIES"),
    },
    folds: {
      state: "NOT_APPLICABLE",
      reason_code: noFold.reason_code,
      rule: null,
      order: "SOURCE_ORDINAL_ASC",
      params_handoff: { scope: "NOT_PUBLISHED", text: null, availability: NOT_PUBLISHED("P04_FIXED_PROFILE_HAS_NO_SELECTION_TRACE") },
      rows: [],
      availability: noFold,
    },
    stages: hub.stages.map((hubStage) => stage(hubStage, hubStage.key !== "S3"
      ? noStageCheck
      : integrity === "PARTIAL"
        ? check("CAVEAT", "digest binding only — source artifact bytes are not re-read", "p16.freeze.integrity", AVAILABLE)
        : integrity === "BLOCKED"
          ? check("FAIL", "a bound digest does not match", "p16.freeze.integrity", AVAILABLE)
          : noCheck("P18_INTEGRITY_NOT_PUBLISHED"))),
    artifacts: [
      { key: "RUN_SPEC", filename: null, digest: null, state: "NOT_PUBLISHED", part_count: null, download: ARTIFACT_DOWNLOAD_NOT_PUBLISHED, availability: NOT_PUBLISHED("P18_REQUESTED_SPEC_BYTES_NOT_PUBLISHED") },
      { key: "SELECTION_TRACE", filename: null, digest: null, state: "NOT_PUBLISHED", part_count: null, download: ARTIFACT_DOWNLOAD_NOT_PUBLISHED, availability: NOT_PUBLISHED("P04_FIXED_PROFILE_HAS_NO_SELECTION_TRACE") },
      { key: "FOLD_PLAN", filename: null, digest: null, state: "NOT_PUBLISHED", part_count: null, download: ARTIFACT_DOWNLOAD_NOT_PUBLISHED, availability: NOT_PUBLISHED("P04_SOURCE_DID_NOT_PUBLISH_FOLD_PLAN") },
      { key: "FILL_LEDGER", filename: null, digest: null, state: "NOT_PUBLISHED", part_count: null, download: ARTIFACT_DOWNLOAD_NOT_PUBLISHED, availability: NOT_PUBLISHED("P04_SOURCE_DID_NOT_PUBLISH_AUDITED_FILLS") },
      { key: "METRICS_SUMMARY", filename: null, digest: null, state: "NOT_PUBLISHED", part_count: null, download: ARTIFACT_DOWNLOAD_NOT_PUBLISHED, availability: NOT_PUBLISHED("P13_EVIDENCE_PROJECTION_IS_NOT_ARTIFACT_FILE") },
      { key: "CLAIM", filename: null, digest: null, state: "NOT_PUBLISHED", part_count: null, download: ARTIFACT_DOWNLOAD_NOT_PUBLISHED, availability: NOT_PUBLISHED("P13_CLAIM_IS_NOT_AN_ARTIFACT_DIGEST") },
      { key: "BUNDLE", filename: null, digest: null, state: "NOT_PUBLISHED", part_count: null, download: ARTIFACT_DOWNLOAD_NOT_PUBLISHED, availability: NOT_PUBLISHED("P18_MANIFEST_BYTES_NOT_PUBLISHED") },
    ],
    warnings: hub.warnings,
    promotion: {
      state: "NOT_PUBLISHED",
      line: "Promotion/governance approval is not published by the current P04 source.",
      availability: NOT_PUBLISHED("P04_SOURCE_DID_NOT_PUBLISH_PROMOTION_APPROVAL"),
    },
    provenance: {
      line: `P18 report sealed from ${hub.revision}, ${split.revision}, ${search.revision}, ${freeze.revision} and ${replay.revision}; replay remains retrospective equity only (${replay.routeState}).`,
      metric_registry_version: hub.metric_registry_version,
      data_signature: core.dataset_binding_digest,
      read_model_revision: "research.report-read-model.v2",
      verdict_rule_revision: "research.report-verdict-rule.v1",
    },
    source_absences: {
      ...Object.fromEntries(Object.entries(hub.source_absences).map(([key, source]) => {
        const item = source as Availability;
        const reason = item.reason_code ?? "P18_SOURCE_FACT_NOT_PUBLISHED";
        return [key, item.state === "NOT_APPLICABLE"
          ? { state: "NOT_APPLICABLE", text: null, reason_code: reason, availability: item }
          : absent(reason)];
      })),
      per_fold_rows: { state: "NOT_APPLICABLE", text: null, reason_code: noFold.reason_code!, availability: noFold },
      approval_annotation: absent("P18_APPROVAL_ANNOTATION_NOT_PUBLISHED"),
      replay_execution_state: absent("P04_SOURCE_DID_NOT_PUBLISH_EXECUTION_STATE_SNAPSHOTS"),
    },
  };
}
