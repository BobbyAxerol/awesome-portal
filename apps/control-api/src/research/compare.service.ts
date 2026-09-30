/**
 * P20 Compare reader.
 *
 * The server owns comparability.  It consumes only Portal-persisted Research
 * facts: P08 requested specs, P13 evidence, P14 chronology and RS-02 sealed
 * observations.  It never asks QuantBT to rerun, opens an artifact path, or
 * turns an inspection/rank into a selection, approval or command.
 */

import { Inject, Injectable } from "@nestjs/common";
import { z } from "zod";

import { ControlApiConfig } from "../config";
import { CONTROL_API_CONFIG } from "../tokens";
import type { ResearchScope } from "./contracts";
import {
  ResearchCompareResponseSchema,
  type ResearchCompareContractKey,
  type ResearchCompareQuery,
  type ResearchCompareResponse,
  type ResearchCompareRun,
} from "./compare.contract";
import { ResearchCompareError } from "./compare.error";
import { runDisplayLabel, runDisplayOrdinal } from "./run-display-label";
import {
  compareDigest,
  type ComparePairRawInput,
  type ComparePairRawStats,
  type CompareRunRow,
  type CompareRetainedEquityPoint,
  type CompareSnapshot,
  ResearchCompareRepository,
} from "./compare.repository";
import { CurrentSourceSummarySchema } from "./current-source.payload";
import { RS02_DELTA_WFO_GLOBAL_PROFILE_ID, RS02_SIGNAL_NOTIONAL_PROFILE_ID } from "./delta-wfo.profile";
import { RESEARCH_PERFORMANCE_METRIC_DEFINITIONS } from "./evidence-metric-registry";
import { ResearchRequestedSpecSchema } from "./preflight.contract";
import { ResearchSplitSourceSchema, type ResearchSplitSource } from "./progress.contract";
import { extremaPreservingSample } from "./run-library.service";

type Availability = {
  state: "AVAILABLE" | "NOT_PUBLISHED" | "PARTIAL" | "NOT_APPLICABLE";
  reason_code: string | null;
};
type RequestedSpec = z.infer<typeof ResearchRequestedSpecSchema>;
type ClaimFamily = "STRICT_OUTER_OOS" | "SELECTION_ADJUSTED_OOS" | "WALK_FORWARD_OOS_COMPATIBILITY" | "NONE_FULL_SAMPLE_CALIBRATION" | "NOT_PUBLISHED";

interface StoredSplitProjection {
  schema_version: "research.split-projection.v1";
  source: ResearchSplitSource;
}

const StoredSplitProjectionSchema = z.object({
  schema_version: z.literal("research.split-projection.v1"),
  source: ResearchSplitSourceSchema,
}).strict();

const StoredEvidenceProjectionSchema = z.object({
  schema_version: z.literal("research.evidence-projection.v1"),
  direct: z.object({
    initial_equity: z.string().regex(/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/).max(96),
    final_equity: z.string().regex(/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/).max(96),
    num_trades: z.string().regex(/^[0-9]+$/).max(24),
    bars: z.string().regex(/^[0-9]+$/).max(24),
  }).strict(),
  derived: z.object({
    net_return_fraction: z.string().regex(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/).max(96),
    max_drawdown_fraction: z.string().regex(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/).max(96),
  }).strict(),
}).passthrough();

const EquitySeriesSchema = z.array(z.object({
  at_utc_ms: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  equity: z.string().regex(/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/).max(96),
  drawdown_fraction: z.string().regex(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/).max(96),
}).strict()).max(192);

const RUN_STATES = new Set(["DRAFT", "QUEUED", "RUNNING", "SEALING", "READY", "FAILED", "CANCELLED", "RECOVERY_REQUIRED"]);
const DECIMAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;

type Lane = "P04_FIXED_PROFILE" | "RS02_RETAINED_CURRENT_SOURCE" | "NOT_PUBLISHED";

/** W6a: the retained Delta WFO facts Compare reads for one run. */
interface Retained {
  summary: z.infer<typeof CurrentSourceSummarySchema>;
  folds: RetainedFold[];
  sourceFoldCount: number | null;
  meanOosSharpe: string | null;
  meanDecay: string | null;
}

interface RetainedFold {
  source_ordinal: number;
  fold_id: string;
  test_start_utc_ms: number | null;
  test_end_utc_ms: number | null;
  test_bars: number | null;
  oos_sharpe: string | null;
  oos_trade_count: string | null;
}

interface Candidate {
  row: CompareRunRow;
  run: ResearchCompareRun;
  requested: RequestedSpec | null;
  split: ResearchSplitSource | null;
  retained: Retained | null;
  outerOos: { startUtcMs: number; endExclusiveUtcMs: number; bars: number } | null;
  sourceBindingReady: boolean;
}

const RetainedFoldSchema = z.object({
  source_ordinal: z.number().int().nonnegative().max(4_096),
  fold_id: z.string().min(1).max(160),
  test_start_utc_ms: z.number().int().nonnegative().nullable(),
  test_end_utc_ms: z.number().int().nonnegative().nullable(),
  test_bars: z.number().int().nonnegative().nullable(),
  oos_sharpe: z.string().regex(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/).max(96).nullable(),
  oos_trade_count: z.string().regex(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/).max(96).nullable(),
}).strict();

const CERTIFICATION_NOT_PUBLISHED = {
  state: "NOT_PUBLISHED" as const,
  grade: null,
  reason_code: "P20_NO_SOURCE_PUBLISHES_A_CERTIFICATION_GRADE",
  availability: { state: "NOT_PUBLISHED" as const, reason_code: "P20_NO_SOURCE_PUBLISHES_A_CERTIFICATION_GRADE" },
};
const LIFECYCLES = new Set(["DRAFT", "ACTIVE", "SUPERSEDED", "ABANDONED"]);

/** Only an issued methodology certificate in the persisted progress claim carries a grade. */
function certification(row: CompareRunRow): ResearchCompareRun["certification"] {
  const claim = record(record(row.progress_snapshot)?.claim);
  const certificate = record(claim?.methodology_certificate);
  const grade = certificate?.grade;
  if (certificate?.state === "ISSUED" && (grade === "A" || grade === "B" || grade === "C" || grade === "D")) {
    return { state: "AVAILABLE", grade, reason_code: null, availability: available() };
  }
  return CERTIFICATION_NOT_PUBLISHED;
}

function available(): Availability { return { state: "AVAILABLE", reason_code: null }; }
function absent(reasonCode: string): Availability { return { state: "NOT_PUBLISHED", reason_code: reasonCode }; }
function partial(reasonCode: string): Availability { return { state: "PARTIAL", reason_code: reasonCode }; }
function notApplicable(reasonCode: string): Availability { return { state: "NOT_APPLICABLE", reason_code: reasonCode }; }

function record(value: unknown): Record<string, unknown> | null {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function exactDecimal(value: string | null | undefined): string | null {
  return typeof value === "string" && DECIMAL.test(value) && value.length <= 96 ? value : null;
}

function utcMs(value: Date, label: string): number {
  const result = value.getTime();
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new ResearchCompareError("RESEARCH_COMPARE_UNAVAILABLE", `Compare ${label} is incompatible.`, 503);
  }
  return result;
}

function canonicalDisplay(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.length <= 512 ? value : `sha256:${compareDigest(value)}`;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return `sha256:${compareDigest(value)}`;
}

function boundedText(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= 1_024 ? value : null;
}

function asStoredSplit(value: unknown): ResearchSplitSource | null {
  const parsed = StoredSplitProjectionSchema.safeParse(record(value));
  return parsed.success ? parsed.data.source : null;
}

function asRequestedSpec(value: unknown): RequestedSpec | null {
  const parsed = ResearchRequestedSpecSchema.safeParse(record(value));
  return parsed.success ? parsed.data : null;
}

function asRetained(row: CompareRunRow): Retained | null {
  if (row.current_profile_id !== RS02_DELTA_WFO_GLOBAL_PROFILE_ID && row.current_profile_id !== RS02_SIGNAL_NOTIONAL_PROFILE_ID) return null;
  const summary = CurrentSourceSummarySchema.safeParse(record(row.current_source_summary));
  if (!summary.success) return null;
  const rawFolds = typeof row.current_source_folds === "string" ? (() => { try { return JSON.parse(row.current_source_folds as string); } catch { return null; } })() : row.current_source_folds;
  const folds = z.array(RetainedFoldSchema).max(33).safeParse(rawFolds ?? []);
  if (!folds.success) return null;
  const tableRows = record(row.current_source_table_rows);
  const foldCount = typeof tableRows?.FOLD === "number" && Number.isSafeInteger(tableRows.FOLD) ? tableRows.FOLD : null;
  return {
    summary: summary.data,
    folds: folds.data,
    sourceFoldCount: foldCount,
    meanOosSharpe: exactDecimal(row.current_selected_mean_oos_sharpe),
    meanDecay: exactDecimal(row.current_selected_mean_decay),
  };
}

/** The retained outer-test span: first test bar to the last one, inclusive. */
function retainedOuterOos(retained: Retained | null): Candidate["outerOos"] {
  if (!retained || retained.folds.length === 0 || retained.sourceFoldCount !== retained.folds.length) return null;
  const windows = retained.folds.map((fold) => [fold.test_start_utc_ms, fold.test_end_utc_ms, fold.test_bars] as const);
  if (windows.some(([start, end, bars]) => start === null || end === null || bars === null)) return null;
  return {
    startUtcMs: Math.min(...windows.map(([start]) => start!)),
    endExclusiveUtcMs: Math.max(...windows.map(([, end]) => end!)) + 1,
    bars: windows.reduce((total, [, , bars]) => total + bars!, 0),
  };
}

function retainedBindingReady(row: CompareRunRow): boolean {
  return row.current_artifact_sealed === true
    && row.current_manifest_digest !== null && /^[0-9a-f]{64}$/.test(row.current_manifest_digest)
    && row.requested_spec_digest !== null && row.current_requested_spec_digest === row.requested_spec_digest
    && row.effective_spec_digest !== null && row.current_effective_spec_digest === row.effective_spec_digest
    && row.dataset_binding_digest !== null && row.current_dataset_binding_digest === row.dataset_binding_digest;
}

function sumIntegers(values: Array<string | null>): string | null {
  if (values.length === 0 || values.some((value) => value === null || !/^(?:0|[1-9][0-9]*)$/.test(value))) return null;
  return values.reduce((total, value) => total + BigInt(value!), 0n).toString();
}

function asEvidence(value: unknown) {
  const parsed = StoredEvidenceProjectionSchema.safeParse(record(value));
  return parsed.success ? parsed.data : null;
}

function comparisonKey(requested: RequestedSpec | null): ResearchCompareContractKey {
  if (!requested) {
    return {
      symbol: null, timeframe: null, route: null, protocol: null,
      availability: absent("P20_REQUESTED_SPEC_NOT_AVAILABLE"),
    };
  }
  return {
    symbol: requested.data.symbol,
    timeframe: requested.data.timeframe,
    route: requested.execution_route,
    protocol: requested.protocol,
    availability: available(),
  };
}

function sameKey(left: ResearchCompareContractKey, right: ResearchCompareContractKey): boolean {
  return left.availability.state === "AVAILABLE"
    && right.availability.state === "AVAILABLE"
    && left.symbol === right.symbol
    && left.timeframe === right.timeframe
    && left.route === right.route
    && left.protocol === right.protocol;
}

function outerOos(split: ResearchSplitSource | null): Candidate["outerOos"] {
  if (!split) return null;
  const range = split.windows.outer_oos;
  return {
    startUtcMs: range.start_utc_ms,
    endExclusiveUtcMs: range.end_exclusive_utc_ms,
    bars: range.bars,
  };
}

function sourceBindingReady(row: CompareRunRow, split: ResearchSplitSource | null): boolean {
  if (!split || row.current_artifact_revision === null || row.current_manifest_digest === null
    || row.current_requested_spec_digest === null || row.current_effective_spec_digest === null
    || row.current_dataset_binding_digest === null || row.current_source_transform_digest === null
    || row.manifest_digest === null || row.requested_spec_digest === null
    || row.effective_spec_digest === null || row.dataset_binding_digest === null) return false;
  // CG-P20-12: `manifest_digest` (run_producers) is the preflight dataset/spec
  // manifest and binds to the P14 receipt below; `current_manifest_digest` is
  // the sealed P05 artifact's own manifest and binds to that SEALED artifact
  // row. They are two identities and are never required to be equal.
  return row.current_artifact_sealed === true
    && /^[0-9a-f]{64}$/.test(row.current_manifest_digest)
    && row.current_requested_spec_digest === row.requested_spec_digest
    && row.current_effective_spec_digest === row.effective_spec_digest
    && row.current_dataset_binding_digest === row.dataset_binding_digest
    && split.source.manifest_digest === row.manifest_digest
    && split.source.source_transform_digest === row.current_source_transform_digest;
}

function claim(row: CompareRunRow, split: ResearchSplitSource | null, retained: Retained | null) {
  const snapshot = record(row.progress_snapshot);
  const sourceClaim = record(snapshot?.claim);
  const sourceText = sourceClaim?.state === "ISSUED" ? boundedText(sourceClaim.text) : null;
  if (retained) {
    // W6a: QuantBT itself attests `walk_forward.validation_claim` on the
    // retained lane. It never attests a strict or selection-adjusted OOS
    // claim there (oos_used_for_selection is published beside it), so the
    // family stays the conservative compatibility tier, now source-attested.
    const claims = retained.summary.source_facts?.claims;
    if (claims?.validation_claim === "walk_forward_oos") {
      const text = [
        `validation_claim=${claims.validation_claim}`,
        claims.chronological_validation_claim ? `chronological_claim=${claims.chronological_validation_claim}` : null,
        claims.oos_used_for_selection === null ? null : `oos_used_for_selection=${String(claims.oos_used_for_selection)}`,
      ].filter((item): item is string => item !== null).join(" · ");
      return {
        family: "WALK_FORWARD_OOS_COMPATIBILITY" as const,
        rank: 3,
        origin: "SOURCE_ATTESTED" as const,
        text: sourceText ?? text,
        availability: available(),
      };
    }
  }
  // Current P04 does not attest strict/selection-adjusted claims. Its P14
  // receipt does attest a fixed-profile, outer-OOS observation protocol. That
  // supports only the conservative compatibility tier below.
  if (split?.protocol.kind === "THREE_WINDOW_CURRENT"
    && split.protocol.selection.state === "FIXED_PROFILE_NO_SEARCH"
    && split.windows.outer_oos.data_role === "OUTER_OOS_OBSERVATION") {
    return {
      family: "WALK_FORWARD_OOS_COMPATIBILITY" as const,
      rank: 3,
      origin: "PORTAL_DERIVED_FROM_SOURCE_PROTOCOL" as const,
      text: sourceText,
      availability: available(),
    };
  }
  return {
    family: "NOT_PUBLISHED" as const,
    rank: null,
    origin: "NOT_PUBLISHED" as const,
    text: sourceText,
    availability: absent("P20_STRUCTURED_CLAIM_FAMILY_NOT_PUBLISHED"),
  };
}

function retainedMetrics(retained: Retained) {
  const metric = (key: "NET_RETURN_FRACTION" | "MAX_DRAWDOWN_FRACTION" | "TRADE_COUNT" | "OOS_SHARPE" | "DECAY", definition: string, scope: string, value: string | null, reason: string) =>
    ({ key, definition_id: `research.compare.metric.v1.${definition}`, scope, value, availability: value === null ? absent(reason) : available() });
  return [
    metric("NET_RETURN_FRACTION", "original-net-return", "RS02_RETAINED_FINAL_ACCOUNT", exactDecimal(retained.summary.metrics.net_return_fraction), "P20_RS02_NET_RETURN_NOT_RETAINED"),
    metric("MAX_DRAWDOWN_FRACTION", "original-max-drawdown", "RS02_RETAINED_FINAL_ACCOUNT", exactDecimal(retained.summary.metrics.max_drawdown_fraction), "P20_RS02_MAX_DRAWDOWN_NOT_RETAINED"),
    metric("TRADE_COUNT", "rs02-oos-trade-count", "RS02_OOS_SUM_OF_FOLDS",
      retained.sourceFoldCount === retained.folds.length ? sumIntegers(retained.folds.map((fold) => fold.oos_trade_count)) : null,
      "P20_RS02_FOLD_TRADE_COUNTS_NOT_RETAINED"),
    metric("OOS_SHARPE", "oos-sharpe", "RS02_OOS_MEAN_OF_FOLDS", retained.meanOosSharpe, "P20_SOURCE_DID_NOT_PUBLISH_OOS_SHARPE"),
    metric("DECAY", "decay", "RS02_OOS_MEAN_OF_FOLDS", retained.meanDecay, "P20_SOURCE_DID_NOT_PUBLISH_DECAY"),
  ];
}

function originalMetrics(row: CompareRunRow) {
  const evidence = asEvidence(row.evidence_projection);
  const analytics = record(evidence?.oos_analytics);
  const sourceMetric = record(record(analytics?.metrics)?.sharpe);
  const definition = RESEARCH_PERFORMANCE_METRIC_DEFINITIONS.find((item) => item.key === "OOS_SHARPE");
  const oosSharpe = analytics?.state === "AVAILABLE"
    && sourceMetric?.state === "AVAILABLE"
    && definition?.origin === "ENGINE_DIRECT"
    && sourceMetric.locator === definition.sourceLocator
    && typeof sourceMetric.value === "string"
    ? exactDecimal(sourceMetric.value)
    : null;
  const source = evidence ? available() : absent("P20_P13_EVIDENCE_PROJECTION_NOT_AVAILABLE");
  return [
    {
      key: "NET_RETURN_FRACTION" as const,
      definition_id: "research.compare.metric.v1.original-net-return",
      scope: "P13_OOS_EQUITY_SERIES",
      value: evidence?.derived.net_return_fraction ?? null,
      availability: source,
    },
    {
      key: "MAX_DRAWDOWN_FRACTION" as const,
      definition_id: "research.compare.metric.v1.original-max-drawdown",
      scope: "P13_OOS_EQUITY_SERIES",
      value: evidence?.derived.max_drawdown_fraction ?? null,
      availability: source,
    },
    {
      key: "TRADE_COUNT" as const,
      definition_id: "research.compare.metric.v1.original-trade-count",
      scope: "P13_FULL_CHILD_TAPE",
      value: evidence?.direct.num_trades ?? null,
      availability: source,
    },
    {
      key: "OOS_SHARPE" as const,
      definition_id: "research.compare.metric.v1.oos-sharpe",
      scope: oosSharpe === null ? "NOT_PUBLISHED" : "OOS",
      value: oosSharpe,
      availability: oosSharpe === null ? absent("P20_P13_OOS_SHARPE_NOT_AVAILABLE") : available(),
    },
    {
      key: "DECAY" as const,
      definition_id: "research.compare.metric.v1.decay",
      scope: "NOT_PUBLISHED",
      value: null,
      availability: absent("P20_SOURCE_DID_NOT_PUBLISH_DECAY"),
    },
  ];
}

function buildCandidate(row: CompareRunRow): Candidate | null {
  if (row.run_id === null || row.run_state === null || row.run_created_at === null) return null;
  if (!RUN_STATES.has(row.run_state)) {
    throw new ResearchCompareError("RESEARCH_COMPARE_UNAVAILABLE", "Compare run lifecycle is incompatible.", 503);
  }
  const requested = asRequestedSpec(row.requested_spec);
  const split = asStoredSplit(row.split_projection);
  const retained = asRetained(row);
  const lane: Lane = retained ? "RS02_RETAINED_CURRENT_SOURCE"
    : split !== null || row.evidence_projection !== null ? "P04_FIXED_PROFILE" : "NOT_PUBLISHED";
  const lifecycle = row.alpha_version_lifecycle !== null && LIFECYCLES.has(row.alpha_version_lifecycle)
    ? { value: row.alpha_version_lifecycle as "DRAFT" | "ACTIVE" | "SUPERSEDED" | "ABANDONED", availability: available() }
    : { value: null, availability: absent("P20_ALPHA_VERSION_LIFECYCLE_NOT_AVAILABLE") };
  const run: ResearchCompareRun = {
    run_id: row.run_id,
    display_label: runDisplayLabel(row.display_profile_id, runDisplayOrdinal(row.display_ordinal)),
    attempt_id: row.attempt_id,
    alpha_version_id: row.alpha_version_id,
    alpha_version_label: row.alpha_version_label,
    run_state: row.run_state as ResearchCompareRun["run_state"],
    created_at_utc_ms: utcMs(row.run_created_at, "run timestamp"),
    comparison_contract_key: comparisonKey(requested),
    claim: claim(row, split, retained),
    original_metrics: retained ? retainedMetrics(retained) : originalMetrics(row),
    lane,
    schedule: requested
      ? { mode: requested.optimization_mode ?? null, schedule: requested.optimization_schedule ?? null, availability: requested.optimization_mode && requested.optimization_schedule ? available() : absent("P20_REQUESTED_SPEC_HAS_NO_OPTIMIZATION_SCHEDULE") }
      : { mode: null, schedule: null, availability: absent("P20_REQUESTED_SPEC_NOT_AVAILABLE") },
    certification: certification(row),
    alpha_version_lifecycle: lifecycle,
    provenance: {
      requested_spec_digest: row.requested_spec_digest,
      effective_spec_digest: row.effective_spec_digest,
      dataset_binding_digest: row.dataset_binding_digest,
      manifest_digest: row.manifest_digest,
      evidence_revision: row.evidence_revision,
      split_revision: row.split_revision,
      current_source_revision: row.current_artifact_revision === null ? null : String(row.current_artifact_revision),
    },
  };
  return retained
    ? { row, run, requested, split: null, retained, outerOos: retainedOuterOos(retained), sourceBindingReady: retainedBindingReady(row) }
    : { row, run, requested, split, retained: null, outerOos: outerOos(split), sourceBindingReady: sourceBindingReady(row, split) };
}

function rank(candidate: Candidate): number {
  return candidate.run.claim.rank ?? Number.MAX_SAFE_INTEGER;
}

function originalMetric(candidate: Candidate, key: "NET_RETURN_FRACTION" | "OOS_SHARPE"): string | null {
  const metric = candidate.run.original_metrics.find((item) => item.key === key);
  return metric?.availability.state === "AVAILABLE" ? metric.value : null;
}

function compareDecimalDescending(left: string | null, right: string | null): number {
  // Exact decimals stay strings in DTOs. This ordering is only a deterministic
  // display tie-breaker inside an already equal claim tier; it never selects.
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  const negativeLeft = left.startsWith("-");
  const negativeRight = right.startsWith("-");
  if (negativeLeft !== negativeRight) return negativeLeft ? 1 : -1;
  const [leftWhole, leftFraction = ""] = left.replace("-", "").split(".");
  const [rightWhole, rightFraction = ""] = right.replace("-", "").split(".");
  const whole = leftWhole.length === rightWhole.length ? leftWhole.localeCompare(rightWhole) : leftWhole.length - rightWhole.length;
  const fraction = leftFraction.padEnd(96, "0").localeCompare(rightFraction.padEnd(96, "0"));
  const result = whole || fraction;
  return negativeLeft ? result : -result;
}

function sortCandidates(candidates: Candidate[]): Candidate[] {
  return [...candidates].sort((left, right) => {
    const rankDifference = rank(left) - rank(right);
    if (rankDifference !== 0) return rankDifference;
    // CG-P20-11 (spec 13 §5): OOS Sharpe first inside a claim tier; the
    // original net return breaks the tie when a source published no OOS
    // Sharpe (every P04 run), so a missing number never outranks a real one.
    const oosDifference = compareDecimalDescending(originalMetric(left, "OOS_SHARPE"), originalMetric(right, "OOS_SHARPE"));
    if (oosDifference !== 0) return oosDifference;
    const metricDifference = compareDecimalDescending(originalMetric(left, "NET_RETURN_FRACTION"), originalMetric(right, "NET_RETURN_FRACTION"));
    if (metricDifference !== 0) return metricDifference;
    const creationDifference = left.run.created_at_utc_ms - right.run.created_at_utc_ms;
    return creationDifference || left.run.run_id.localeCompare(right.run.run_id);
  });
}

type IntentPath = "alpha_version" | "parameter_space_overrides" | "random_seed" | "optimization_mode" | "optimization_schedule" | "engine_config_digest";
const INTENT_PATHS: IntentPath[] = ["alpha_version", "parameter_space_overrides", "random_seed", "optimization_mode", "optimization_schedule", "engine_config_digest"];

/** The allow-listed config value of one run (P19 semantic diff / P20 intentional differences). */
function intentValue(candidate: Candidate, path: IntentPath): string | null {
  const requested = candidate.requested;
  switch (path) {
    case "alpha_version": return canonicalDisplay(requested?.alpha_binding?.alpha_version_id ?? candidate.run.alpha_version_id);
    case "parameter_space_overrides": return canonicalDisplay(requested?.parameter_space_overrides);
    case "random_seed": return canonicalDisplay(requested?.random_seed);
    case "optimization_mode": return canonicalDisplay(requested?.optimization_mode);
    case "optimization_schedule": return canonicalDisplay(requested?.optimization_schedule);
    default: return canonicalDisplay(requested?.client.config_digest);
  }
}

function intentDifferences(left: Candidate, right: Candidate) {
  return INTENT_PATHS
    .map((path) => ({ path, before: intentValue(left, path), after: intentValue(right, path) }))
    .filter((item) => item.before !== item.after);
}

/** CG-P20-05: the keys that changed anywhere across the attempts, each with every attempt's value. */
function configDiff(candidates: Candidate[]) {
  if (candidates.length < 2) {
    return { paths: [], availability: notApplicable("P20_CONFIG_DIFF_NEEDS_TWO_ATTEMPTS") };
  }
  if (candidates.some((candidate) => candidate.requested === null)) {
    return { paths: [], availability: absent("P20_REQUESTED_SPEC_NOT_AVAILABLE") };
  }
  const paths = INTENT_PATHS.map((path) => ({
    path,
    values: candidates.map((candidate) => ({ run_id: candidate.run.run_id, value: intentValue(candidate, path) })),
  })).filter((item) => new Set(item.values.map((value) => value.value)).size > 1);
  return { paths, availability: available() };
}

/** CG-P20-04: per-fold OOS Sharpe as retained; a P04 run has no per-fold facts. */
function foldSeries(candidate: Candidate) {
  const retained = candidate.retained;
  if (!retained) {
    return {
      run_id: candidate.run.run_id, state: "NOT_PUBLISHED" as const, source_fold_count: null, truncated: false, folds: [],
      availability: absent(candidate.run.lane === "P04_FIXED_PROFILE" ? "P20_P04_SOURCE_DID_NOT_PUBLISH_PER_FOLD_OOS_SHARPE" : "P20_RUN_HAS_NO_RETAINED_FOLD_FACTS"),
    };
  }
  const shown = retained.folds.slice(0, 32);
  return {
    run_id: candidate.run.run_id,
    state: "AVAILABLE" as const,
    source_fold_count: retained.sourceFoldCount,
    truncated: retained.folds.length > 32 || (retained.sourceFoldCount !== null && retained.sourceFoldCount > shown.length),
    folds: shown.map((fold) => ({
      fold_id: fold.fold_id,
      source_ordinal: fold.source_ordinal,
      oos_sharpe: exactDecimal(fold.oos_sharpe),
      availability: exactDecimal(fold.oos_sharpe) === null ? absent("QUANTBT_DID_NOT_RETAIN_SELECTED_TRIAL_FOLD_METRICS") : available(),
    })),
    availability: available(),
  };
}

function weakerClaim(left: Candidate, right: Candidate) {
  const leftRank = left.run.claim.rank;
  const rightRank = right.run.claim.rank;
  if (leftRank === null || rightRank === null) {
    return { family: "NOT_PUBLISHED" as const, rank: null, availability: absent("P20_WEAKER_CLAIM_NOT_PUBLISHED") };
  }
  if (leftRank === rightRank && left.run.claim.family !== right.run.claim.family) {
    return { family: "NOT_PUBLISHED" as const, rank: null, availability: partial("P20_EQUAL_CLAIM_RANK_FAMILY_NOT_RESOLVED") };
  }
  const chosen = leftRank >= rightRank ? left.run.claim : right.run.claim;
  return { family: chosen.family, rank: chosen.rank, availability: chosen.availability };
}

function unavailableCommon(reasonCode: string) {
  const absence = absent(reasonCode);
  return {
    state: "NOT_PUBLISHED" as const,
    definition_id: "research.compare-common-window.v1" as const,
    left_source_observation_count: null,
    right_source_observation_count: null,
    matched_observation_count: null as number | null,
    start_utc_ms: null as number | null,
    end_utc_ms: null as number | null,
    delta_definition: "RIGHT_MINUS_LEFT" as const,
    metrics: [
      { key: "NET_RETURN_FRACTION" as const, definition_id: "research.compare.metric.v1.common-window-net-return", left_value: null, right_value: null, delta: null, availability: absence },
      { key: "MAX_DRAWDOWN_FRACTION" as const, definition_id: "research.compare.metric.v1.common-window-max-drawdown", left_value: null, right_value: null, delta: null, availability: absence },
      ...UNDEFINED_COMMON_METRICS,
    ],
    availability: absence,
  };
}

/**
 * CG-P20-06: the common window defines no trade count, no Sharpe and no win
 * rate. A Sharpe would need the source's annualization; a win rate needs
 * audited round-trip trades, which no current source publishes.
 */
const UNDEFINED_COMMON_METRICS = [
  { key: "TRADE_COUNT" as const, definition_id: "research.compare.metric.v1.common-window-trade-count", left_value: null, right_value: null, delta: null, availability: notApplicable("P20_COMMON_WINDOW_DOES_NOT_DEFINE_TRADE_COUNT") },
  { key: "OOS_SHARPE" as const, definition_id: "research.compare.metric.v1.common-window-oos-sharpe", left_value: null, right_value: null, delta: null, availability: notApplicable("P20_COMMON_WINDOW_SHARPE_NEEDS_SOURCE_ANNUALIZATION") },
  { key: "WIN_RATE_FRACTION" as const, definition_id: "research.compare.metric.v1.common-window-win-rate", left_value: null, right_value: null, delta: null, availability: notApplicable("P20_SOURCE_PUBLISHES_NO_AUDITED_ROUND_TRIPS_FOR_WIN_RATE") },
];

function unavailableCorrelation(reasonCode: string, n: number | null = null, start: number | null = null, end: number | null = null) {
  return {
    state: "NOT_PUBLISHED" as const,
    source_label: "NOT_PUBLISHED" as const,
    formula_id: "pearson-product-moment-correlation" as const,
    formula_version: "p20.raw-return-v1" as const,
    value: null,
    n,
    common_window_start_utc_ms: start,
    common_window_end_utc_ms: end,
    missing_policy: "INNER_JOIN_EXACT_TIMESTAMP_NO_FORWARD_FILL" as const,
    availability: absent(reasonCode),
  };
}

function unavailableOverlay(reasonCode: string) {
  return {
    state: "NOT_PUBLISHED" as const,
    sampling: "NOT_APPLICABLE" as const,
    source_observation_count: null,
    emitted_point_count: null,
    points: [],
    availability: absent(reasonCode),
  };
}

function subtractDecimal(left: string, right: string): string | null {
  // Both operands have already passed the wire decimal grammar. Scale them to
  // integers and use BigInt, never IEEE-754. `right - left` is therefore an
  // exact common-window delta rather than a browser float approximation.
  if (!DECIMAL.test(left) || !DECIMAL.test(right)) return null;
  const fractionLength = (value: string) => value.split(".")[1]?.length ?? 0;
  const scale = Math.max(fractionLength(left), fractionLength(right));
  const unscaled = (value: string): bigint => {
    const negative = value.startsWith("-");
    const unsigned = negative ? value.slice(1) : value;
    const [whole, fraction = ""] = unsigned.split(".");
    const normalized = `${whole}${fraction.padEnd(scale, "0")}`.replace(/^0+(?=\d)/, "");
    const result = BigInt(normalized || "0");
    return negative ? -result : result;
  };
  const result = unscaled(right) - unscaled(left);
  const negative = result < 0n;
  const unsigned = (negative ? -result : result).toString().padStart(scale + 1, "0");
  const whole = scale === 0 ? unsigned : unsigned.slice(0, -scale);
  const fraction = scale === 0 ? "" : unsigned.slice(-scale).replace(/0+$/, "");
  const text = `${negative && result !== 0n ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
  return DECIMAL.test(text) ? text : null;
}

function commonFromRaw(raw: ComparePairRawStats) {
  const quality = raw.leftSourceCount > 0
    && raw.leftSourceCount === raw.leftDistinctTimestampCount
    && raw.leftSourceCount === raw.leftValidReturnCount
    && raw.leftSourceCount === raw.leftValidEquityCount
    && raw.rightSourceCount > 0
    && raw.rightSourceCount === raw.rightDistinctTimestampCount
    && raw.rightSourceCount === raw.rightValidReturnCount
    && raw.rightSourceCount === raw.rightValidEquityCount;
  if (!quality) return { common: unavailableCommon("P20_RAW_OBSERVATION_FACTS_INCOMPATIBLE"), correlation: unavailableCorrelation("P20_RAW_OBSERVATION_FACTS_INCOMPATIBLE") };
  if (raw.matchedCount === 0 || raw.startUtcMs === null || raw.endUtcMs === null) {
    return { common: { ...unavailableCommon("P20_NO_COMMON_RAW_RETURN_WINDOW"), left_source_observation_count: raw.leftSourceCount, right_source_observation_count: raw.rightSourceCount, matched_observation_count: raw.matchedCount }, correlation: unavailableCorrelation("P20_NO_COMMON_RAW_RETURN_WINDOW", raw.matchedCount) };
  }
  const leftReturn = exactDecimal(raw.leftCommonReturnFraction);
  const rightReturn = exactDecimal(raw.rightCommonReturnFraction);
  const leftDrawdown = exactDecimal(raw.leftCommonMaxDrawdownFraction);
  const rightDrawdown = exactDecimal(raw.rightCommonMaxDrawdownFraction);
  if (!leftReturn || !rightReturn || !leftDrawdown || !rightDrawdown) {
    return { common: unavailableCommon("P20_COMMON_WINDOW_NUMERIC_FACTS_INCOMPATIBLE"), correlation: unavailableCorrelation("P20_COMMON_WINDOW_NUMERIC_FACTS_INCOMPATIBLE", raw.matchedCount, raw.startUtcMs, raw.endUtcMs) };
  }
  const common = {
    state: "AVAILABLE" as const,
    definition_id: "research.compare-common-window.v1" as const,
    left_source_observation_count: raw.leftSourceCount,
    right_source_observation_count: raw.rightSourceCount,
    matched_observation_count: raw.matchedCount,
    start_utc_ms: raw.startUtcMs,
    end_utc_ms: raw.endUtcMs,
    delta_definition: "RIGHT_MINUS_LEFT" as const,
    metrics: [
      { key: "NET_RETURN_FRACTION" as const, definition_id: "research.compare.metric.v1.common-window-net-return", left_value: leftReturn, right_value: rightReturn, delta: subtractDecimal(leftReturn, rightReturn), availability: available() },
      { key: "MAX_DRAWDOWN_FRACTION" as const, definition_id: "research.compare.metric.v1.common-window-max-drawdown", left_value: leftDrawdown, right_value: rightDrawdown, delta: subtractDecimal(leftDrawdown, rightDrawdown), availability: available() },
      ...UNDEFINED_COMMON_METRICS,
    ],
    availability: available(),
  };
  if (raw.matchedCount < 3) {
    return { common, correlation: unavailableCorrelation("P20_INSUFFICIENT_COMMON_RAW_RETURNS", raw.matchedCount, raw.startUtcMs, raw.endUtcMs) };
  }
  const correlation = exactDecimal(raw.correlation);
  if (!correlation) {
    return { common, correlation: unavailableCorrelation("P20_ZERO_VARIANCE_RAW_RETURNS", raw.matchedCount, raw.startUtcMs, raw.endUtcMs) };
  }
  return {
    common,
    correlation: {
      state: "AVAILABLE" as const,
      source_label: "PORTAL_DERIVED" as const,
      formula_id: "pearson-product-moment-correlation" as const,
      formula_version: "p20.raw-return-v1" as const,
      value: correlation,
      n: raw.matchedCount,
      common_window_start_utc_ms: raw.startUtcMs,
      common_window_end_utc_ms: raw.endUtcMs,
      missing_policy: "INNER_JOIN_EXACT_TIMESTAMP_NO_FORWARD_FILL" as const,
      availability: available(),
    },
  };
}

function chart(candidate: Candidate) {
  const values = EquitySeriesSchema.safeParse(record(candidate.row.evidence_equity_values) ?? candidate.row.evidence_equity_values);
  const sourceCount = candidate.row.evidence_equity_source_observation_count === null
    ? null : Number(candidate.row.evidence_equity_source_observation_count);
  const sampling = candidate.row.evidence_equity_sampling;
  if (!values.success || !Number.isSafeInteger(sourceCount) || sourceCount! < values.data.length
    || !["FULL", "EXTREMA_BUCKET_V1", "TAIL_WINDOW_V1"].includes(sampling ?? "")) {
    return {
      state: "NOT_PUBLISHED" as const,
      sampling: "NOT_APPLICABLE" as const,
      source_observation_count: null,
      emitted_point_count: null,
      points: [],
      availability: absent("P20_P13_EQUITY_SERIES_NOT_AVAILABLE"),
    };
  }
  for (let index = 1; index < values.data.length; index += 1) {
    if (values.data[index]!.at_utc_ms <= values.data[index - 1]!.at_utc_ms) {
      return {
        state: "NOT_PUBLISHED" as const, sampling: "NOT_APPLICABLE" as const,
        source_observation_count: null, emitted_point_count: null, points: [],
        availability: absent("P20_P13_EQUITY_SERIES_CHRONOLOGY_INCOMPATIBLE"),
      };
    }
  }
  return {
    state: "AVAILABLE" as const,
    sampling: sampling as "FULL" | "EXTREMA_BUCKET_V1" | "TAIL_WINDOW_V1",
    source_observation_count: sourceCount,
    emitted_point_count: values.data.length,
    points: values.data.map((point) => ({ at_utc_ms: point.at_utc_ms, equity: point.equity })),
    availability: available(),
  };
}

/** W6a · a retained WFO run's small multiple, from the repository's extrema buckets. */
function retainedChart(points: CompareRetainedEquityPoint[] | undefined) {
  if (!points || points.length === 0) {
    return {
      state: "NOT_PUBLISHED" as const, sampling: "NOT_APPLICABLE" as const,
      source_observation_count: null, emitted_point_count: null, points: [],
      availability: absent("P20_RS02_RETAINED_OBSERVATIONS_NOT_AVAILABLE"),
    };
  }
  const sourceCount = points[0]!.sourceCount;
  const sample = extremaPreservingSample(points, (point) => Number(point.equity), 192);
  const full = !sample.sampled && points.length === sourceCount;
  return {
    state: "AVAILABLE" as const,
    sampling: full ? "FULL" as const : "EXTREMA_BUCKET_V1" as const,
    source_observation_count: sourceCount,
    emitted_point_count: sample.points.length,
    points: sample.points.map((point) => ({ at_utc_ms: point.atUtcMs, equity: point.equity })),
    availability: available(),
  };
}

/** D10 · at most this many market small multiples (the retained-equity read budget). */
const MARKET_CARD_LIMIT = 24;

interface MarketGroup {
  market: { symbol: string | null; timeframe: string | null };
  selection: "LATEST_ACTIVE_VERSION_RUN" | "LATEST_RUN" | "MARKET_NOT_PUBLISHED";
  members: number;
  representative: Candidate;
}

function later(left: Candidate, right: Candidate): Candidate {
  const difference = left.run.created_at_utc_ms - right.run.created_at_utc_ms;
  if (difference !== 0) return difference > 0 ? left : right;
  return left.run.run_id.localeCompare(right.run.run_id) >= 0 ? left : right;
}

/**
 * D10 (Unified 13.4.1 E-D) · one card per market — the symbol · timeframe
 * part of the ComparisonContractKey. The market's run is the latest run of an
 * ACTIVE alpha version on it, else its latest run. Cards keep the claim-first
 * order of their representative runs; a key without a market part is never
 * merged with another. Nothing here ranks a metric.
 */
function marketGroups(sorted: Candidate[]): MarketGroup[] {
  const byMarket = new Map<string, Candidate[]>();
  for (const item of sorted) {
    const key = item.run.comparison_contract_key;
    const id = key.symbol !== null && key.timeframe !== null
      ? JSON.stringify([key.symbol, key.timeframe])
      : `run:${item.run.run_id}`;
    byMarket.set(id, [...(byMarket.get(id) ?? []), item]);
  }
  const groups = [...byMarket.values()].map((members): MarketGroup => {
    const key = members[0]!.run.comparison_contract_key;
    const known = key.symbol !== null && key.timeframe !== null;
    const active = members.filter((item) => item.run.alpha_version_lifecycle.value === "ACTIVE");
    const representative = (active.length > 0 ? active : members).reduce(later);
    return {
      market: { symbol: key.symbol, timeframe: key.timeframe },
      selection: !known ? "MARKET_NOT_PUBLISHED" : active.length > 0 ? "LATEST_ACTIVE_VERSION_RUN" : "LATEST_RUN",
      members: members.length,
      representative,
    };
  });
  const position = new Map(sorted.map((item, index) => [item.run.run_id, index]));
  return groups.sort((left, right) => position.get(left.representative.run.run_id)! - position.get(right.representative.run.run_id)!);
}

@Injectable()
export class ResearchCompareService {
  constructor(
    private readonly repository: ResearchCompareRepository,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
  ) {}

  async detail(scope: ResearchScope, alphaId: string, query: ResearchCompareQuery): Promise<ResearchCompareResponse> {
    this.requireEnabled();
    // D10: markets groups every returned run by market, so it reads the full
    // attempts budget; at most 24 market cards leave the service.
    const maximumRows = query.mode === "pair" ? 2 : 128;
    const snapshot = await this.repository.snapshot(
      scope,
      alphaId,
      query.mode === "pair" ? query.run_ids : [],
      maximumRows,
    );
    if (!snapshot) throw new ResearchCompareError("RESEARCH_COMPARE_NOT_FOUND", "Research Alpha was not found.", 404);
    const candidates = snapshot.runs.map(buildCandidate).filter((item): item is Candidate => item !== null);
    const requested = query.mode === "pair" ? this.pairCandidates(candidates, query.run_ids) : [];
    const requestDigest = compareDigest({ alpha_id: alphaId, mode: query.mode, run_ids: query.run_ids });
    const sourceBindingDigest = compareDigest({
      alpha_id: alphaId,
      rows: snapshot.runs.map((row) => ({
        attempt_id: row.attempt_id, run_id: row.run_id, run_state: row.run_state,
        requested_spec_digest: row.requested_spec_digest, effective_spec_digest: row.effective_spec_digest,
        dataset_binding_digest: row.dataset_binding_digest, manifest_digest: row.manifest_digest,
        evidence_revision: row.evidence_revision, split_revision: row.split_revision,
        current_artifact_revision: row.current_artifact_revision,
        current_manifest_digest: row.current_manifest_digest,
        current_requested_spec_digest: row.current_requested_spec_digest,
        current_effective_spec_digest: row.current_effective_spec_digest,
        current_dataset_binding_digest: row.current_dataset_binding_digest,
        current_retained_import_digest: row.current_retained_import_digest,
        current_source_transform_digest: row.current_source_transform_digest,
      })),
    });
    const cached = await this.repository.cached(scope, alphaId, query.mode, requestDigest, sourceBindingDigest);
    if (cached) {
      const parsed = ResearchCompareResponseSchema.safeParse(cached);
      if (parsed.success) return parsed.data;
      // A stale incompatible cache is operational noise, never a reason to
      // return unchecked bytes. A correct projection below supersedes it.
    }
    const response = query.mode === "attempts"
      ? this.attempts(snapshot, candidates)
      : query.mode === "markets"
        ? await this.markets(scope, snapshot, candidates)
        : await this.pairForScope(scope, requested[0]!, requested[1]!);
    const body = this.finalize(snapshot, alphaId, response, candidates);
    await this.repository.persistCache(scope, {
      alphaId,
      mode: query.mode,
      requestDigest,
      sourceBindingDigest,
      projectionRevision: body.revision,
      projectionDigest: body.revision.slice("p20r1_".length),
      projection: body,
    });
    return body;
  }

  private attempts(snapshot: CompareSnapshot, candidates: Candidate[]) {
    const sorted = sortCandidates(candidates);
    const incomplete = snapshot.hasMore || candidates.length !== snapshot.totalAttempts;
    return {
      mode: "attempts" as const,
      order: "CLAIM_RANK_ASC_OOS_SHARPE_DESC_NET_RETURN_DESC" as const,
      attempts: sorted.map((item) => item.run),
      fold_series: sorted.map(foldSeries),
      config_diff: configDiff(sorted),
      coverage: {
        state: incomplete ? "PARTIAL" as const : "COMPLETE" as const,
        total_attempts: snapshot.totalAttempts,
        reason_code: snapshot.hasMore ? "P20_BOUNDED_ATTEMPT_LIMIT_REACHED"
          : candidates.length !== snapshot.totalAttempts ? "P20_ATTEMPTS_WITHOUT_PRIMARY_RUN_NOT_COMPAREABLE" : null,
      },
      trajectory: {
        template_id: "P20_ATTEMPT_TRAJECTORY_V1" as const,
        text: "claims rank before numbers — inspection never selects, promotes, approves, or publishes a run." as const,
        availability: available(),
      },
    };
  }

  private async markets(scope: ResearchScope, snapshot: CompareSnapshot, candidates: Candidate[]) {
    const groups = marketGroups(sortCandidates(candidates));
    const shown = groups.slice(0, MARKET_CARD_LIMIT);
    const sorted = shown.map((group) => group.representative);
    const retainedRuns = sorted
      .filter((item) => item.retained !== null && item.sourceBindingReady && Number.isSafeInteger(Number(item.row.current_artifact_revision)))
      .map((item) => ({ runId: item.run.run_id, artifactRevision: Number(item.row.current_artifact_revision) }));
    const retainedPoints = new Map<string, CompareRetainedEquityPoint[]>();
    for (const point of await this.repository.retainedEquity(scope, retainedRuns)) {
      retainedPoints.set(point.runId, [...(retainedPoints.get(point.runId) ?? []), point]);
    }
    const bounded = snapshot.hasMore || groups.length > shown.length;
    const incomplete = bounded || candidates.length !== snapshot.totalAttempts;
    return {
      mode: "markets" as const,
      caption: "different contract keys — small multiples only; an overlay across keys would be a comparison lie." as const,
      grouping: "MARKET_KEY_ACTIVE_OR_LATEST_V1" as const,
      cards: shown.map((group) => ({
        market: group.market,
        selection: group.selection,
        runs_in_market: group.members,
        run: group.representative.run,
        chart: group.representative.retained ? retainedChart(retainedPoints.get(group.representative.run.run_id)) : chart(group.representative),
      })),
      coverage: {
        state: incomplete ? "PARTIAL" as const : "COMPLETE" as const,
        total_attempts: snapshot.totalAttempts,
        // A bounded read cannot promise the latest run per market, so it says so.
        reason_code: bounded ? "P20_MARKET_SMALL_MULTIPLES_BOUNDED"
          : candidates.length !== snapshot.totalAttempts ? "P20_ATTEMPTS_WITHOUT_PRIMARY_RUN_NOT_COMPAREABLE" : null,
      },
    };
  }

  private async pairForScope(scope: ResearchScope, left: Candidate, right: Candidate) {
    if (!sameKey(left.run.comparison_contract_key, right.run.comparison_contract_key)) {
      return {
        mode: "pair" as const,
        state: "REFUSED" as const,
        refusal: {
          code: "P20_CONTRACT_KEY_MISMATCH" as const,
          message: "these two runs do not share a ComparisonContractKey (symbol · timeframe · route · protocol) — a side-by-side would be a comparison lie, so the button refuses." as const,
          left_key: left.run.comparison_contract_key,
          right_key: right.run.comparison_contract_key,
        },
        pair: null,
      };
    }
    const rawInput = this.rawInput(left, right);
    if (!rawInput) return this.partialPair(left, right, "P20_CURRENT_SOURCE_SEAL_DOES_NOT_MATCH_P14_AND_RUN_BINDINGS");
    const raw = await this.repository.pairRaw(scope, rawInput);
    const expected = raw.leftSourceCount === rawInput.left.expectedOuterOosBars
      && raw.rightSourceCount === rawInput.right.expectedOuterOosBars;
    if (!expected) return this.partialPair(left, right, "P20_OUTER_OOS_SOURCE_COUNT_DOES_NOT_MATCH_P14_RECEIPT", raw);
    const derived = commonFromRaw(raw);
    const overlay = derived.common.state === "AVAILABLE"
      ? await this.repository.pairOverlay(scope, rawInput).then((points) => ({
        state: "AVAILABLE" as const,
        sampling: "RETENTION_STRIDE_V1" as const,
        source_observation_count: raw.matchedCount,
        emitted_point_count: points.length,
        points: points.map((point) => ({ at_utc_ms: point.atUtcMs, left_equity: point.leftEquity, right_equity: point.rightEquity })),
        availability: available(),
      }))
      : unavailableOverlay(derived.common.availability.reason_code ?? "P20_COMMON_WINDOW_NOT_AVAILABLE");
    return {
      mode: "pair" as const,
      state: derived.common.state === "AVAILABLE" ? "AVAILABLE" as const : "PARTIAL" as const,
      refusal: null,
      pair: {
        key: left.run.comparison_contract_key,
        runs: [left.run, right.run] as [ResearchCompareRun, ResearchCompareRun],
        intentional_differences: intentDifferences(left, right),
        weaker_claim: weakerClaim(left, right),
        common_window: derived.common,
        correlation: derived.correlation,
        overlay,
      },
    };
  }

  private partialPair(left: Candidate, right: Candidate, reason: string, raw?: ComparePairRawStats) {
    return {
      mode: "pair" as const,
      state: "PARTIAL" as const,
      refusal: null,
      pair: {
        key: left.run.comparison_contract_key,
        runs: [left.run, right.run] as [ResearchCompareRun, ResearchCompareRun],
        intentional_differences: intentDifferences(left, right),
        weaker_claim: weakerClaim(left, right),
        common_window: raw ? {
          ...unavailableCommon(reason),
          left_source_observation_count: raw.leftSourceCount,
          right_source_observation_count: raw.rightSourceCount,
          matched_observation_count: raw.matchedCount,
          start_utc_ms: raw.startUtcMs,
          end_utc_ms: raw.endUtcMs,
        } : unavailableCommon(reason),
        correlation: raw ? unavailableCorrelation(reason, raw.matchedCount, raw.startUtcMs, raw.endUtcMs) : unavailableCorrelation(reason),
        overlay: unavailableOverlay(reason),
      },
    };
  }

  private rawInput(left: Candidate, right: Candidate): ComparePairRawInput | null {
    const leftArtifactRevision = Number(left.row.current_artifact_revision);
    const rightArtifactRevision = Number(right.row.current_artifact_revision);
    if (!left.sourceBindingReady || !right.sourceBindingReady || !left.outerOos || !right.outerOos
      || !Number.isSafeInteger(leftArtifactRevision) || leftArtifactRevision <= 0
      || !Number.isSafeInteger(rightArtifactRevision) || rightArtifactRevision <= 0) return null;
    return {
      left: {
        runId: left.run.run_id,
        artifactRevision: leftArtifactRevision,
        outerOosStartUtcMs: left.outerOos.startUtcMs,
        outerOosEndExclusiveUtcMs: left.outerOos.endExclusiveUtcMs,
        expectedOuterOosBars: left.outerOos.bars,
      },
      right: {
        runId: right.run.run_id,
        artifactRevision: rightArtifactRevision,
        outerOosStartUtcMs: right.outerOos.startUtcMs,
        outerOosEndExclusiveUtcMs: right.outerOos.endExclusiveUtcMs,
        expectedOuterOosBars: right.outerOos.bars,
      },
    };
  }

  private pairCandidates(candidates: Candidate[], runIds: string[]): [Candidate, Candidate] {
    const byRunId = new Map(candidates.map((item) => [item.run.run_id, item]));
    const left = byRunId.get(runIds[0]!);
    const right = byRunId.get(runIds[1]!);
    if (!left || !right) {
      // A foreign/missing run yields one ordinary Alpha-scoped absence. No
      // cross-Alpha run metadata enters the response or an error detail.
      throw new ResearchCompareError("RESEARCH_COMPARE_NOT_FOUND", "Research compare run was not found.", 404);
    }
    return [left, right];
  }

  private finalize(snapshot: CompareSnapshot, alphaId: string, result: unknown, candidates: Candidate[]): ResearchCompareResponse {
    const sourceAbsences = {
      structured_claim_family: candidates.length > 0 && candidates.every((item) => item.run.claim.availability.state === "AVAILABLE")
        ? available() : absent("P20_STRUCTURED_CLAIM_FAMILY_NOT_PUBLISHED"),
      full_resolution_outer_oos_returns: result && typeof result === "object" && (result as { mode?: string }).mode === "pair"
        && (result as { pair?: { common_window?: { availability?: Availability } } | null }).pair?.common_window?.availability
        ? (result as { pair: { common_window: { availability: Availability } } }).pair.common_window.availability
        : notApplicable("P20_FULL_RESOLUTION_RETURNS_APPLY_TO_PAIR_MODE_ONLY"),
    };
    const fingerprint = compareDigest({
      schema_version: "research.compare.v1", alpha: { alpha_id: alphaId, name: snapshot.alpha.name },
      as_of_utc_ms: snapshot.asOfUtcMs, result, source_absences: sourceAbsences,
    });
    const response = {
      schema_version: "research.compare.v1" as const,
      read_authority: "PORTAL_PERSISTED_RESEARCH" as const,
      alpha: { alpha_id: alphaId, name: snapshot.alpha.name },
      revision: `p20r1_${fingerprint}`,
      etag: `"p20r1_${fingerprint}"`,
      availability: candidates.length > 0 ? available() : absent("P20_ALPHA_HAS_NO_COMPAREABLE_PRIMARY_RUN"),
      as_of_utc_ms: snapshot.asOfUtcMs,
      result,
      source_absences: sourceAbsences,
    };
    const parsed = ResearchCompareResponseSchema.safeParse(response);
    if (!parsed.success) {
      throw new ResearchCompareError("RESEARCH_COMPARE_UNAVAILABLE", "Compare could not form a compatible persisted response.", 503);
    }
    return parsed.data;
  }

  private requireEnabled(): void {
    if (this.config.FEATURE_RESEARCH_COMPARE !== "true") {
      throw new ResearchCompareError("RESEARCH_COMPARE_UNAVAILABLE", "Research Compare is not enabled in this deployment.", 503);
    }
    if (this.config.FEATURE_RESEARCH_RUN_LIBRARY !== "true" || this.config.FEATURE_RESEARCH_EVIDENCE !== "true"
      || this.config.FEATURE_RESEARCH_SPLIT !== "true") {
      throw new ResearchCompareError("RESEARCH_COMPARE_UNAVAILABLE", "Research Compare requires the retained Library, Evidence and Split readers.", 503);
    }
  }
}
