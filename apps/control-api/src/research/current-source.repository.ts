/**
 * RS-02 Portal-owned retained current-source storage.
 *
 * The private importer appends finite P05-verified batches then writes one
 * immutable seal. Browser readers can only see a sealed run through named
 * BFF methods; they cannot choose a table, a filesystem locator, a source
 * query, or an artifact revision. No method here contacts QuantBT.
 */

import { createHash } from "node:crypto";
import { Inject, Injectable, Optional } from "@nestjs/common";
import type { RunDeclarationInputs } from "./run-declaration.read";
import { readEnriched } from "./enriched-analysis.read";
import { appendRetainedExposure, retainedExposureAuthority, type RetainedExposureFence } from "./retained-exposure";
import { ResearchEnrichedAnalysisSchema, type ResearchEnrichedAnalysis } from "./enriched-analysis.contract";
import type { Pool, PoolClient } from "pg";

import type { ControlApiConfig } from "../config";
import { CONTROL_API_CONFIG, CONTROL_API_POOL } from "../tokens";
import { acquireResearchPoolClient, BoundedResearchReadAdmission } from "./bounded-read";
import { RESEARCH_DB_BUDGET, RESEARCH_DB_RUNTIME_ROLE, type ResearchScope } from "./contracts";
import { ResearchCurrentSourceError } from "./current-source.error";
import { candidatePopulationIds } from "./current-source-facts";
import { CurrentSourceSummarySchema, CurrentSourceCandidatePayloadSchema } from "./current-source.payload";
import { sha256ResearchJson } from "./preflight.service";
import { p11StageEvents, type P11StageEvents } from "./p11-stage-events";
import { ResearchRetainedAnalyticsV2Schema, type ResearchRetainedAnalyticsV2 } from "./retained-analytics-v2.contract";
import { ResearchAllTimeDistributionsSchema, type ResearchAllTimeDistributions } from "./all-time-distributions.contract";
import { assertCausalSealConsistency } from "./causal-seal-consistency";
import { assertFull02SealConsistency } from "./full02-seal-consistency";
import { assertFull04SealConsistency } from "./full04-seal-consistency";
import { currentSourceRetainedIntervalMs, currentSourceRetainedMethod, currentSourceRetainedRecipe, currentSourceRetainedRowBounds,
  isCurrentSourceRetainedPair, isCurrentSourceExecutionProfile } from "./current-source-profile";
import { MAXIMUM_GUARD_ENDPOINTS, type GuardIndexWitness } from "./applied-temporal-guards";
import {
  DELTA_WFO_PREVIEW_LONG_LIMITS,
  deltaWfoPreviewLongEnabled,
} from "./delta-wfo.profile";

export type CurrentSourceTableKind = "OBSERVATION" | "FOLD" | "TRIAL" | "CANDIDATE" | "SELECTION";

export interface CurrentSourceRowInput {
  sourceOrdinal: number;
  sourceId: string;
  occurredAtUtcMs: number | null;
  /** Validated bounded canonical source row; never exposed as a generic API. */
  payload: Record<string, unknown>;
}

export interface CurrentSourceAppendBatch {
  runId: string;
  artifactRevision: number;
  manifestDigest: string;
  sourceTransformDigest: string;
  tableKind: CurrentSourceTableKind;
  batchOrdinal: number;
  batchDigest: string;
  rows: readonly CurrentSourceRowInput[];
}

/** RS-02 admits exact historical/global/causal pairs; never a mix. */
export type CurrentSourceLanePair = { sourceAdapterId: string; profileId: string };

export function isCurrentSourceLanePair(sourceAdapterId: unknown, profileId: unknown): boolean {
  return typeof sourceAdapterId === "string" && typeof profileId === "string"
    && isCurrentSourceRetainedPair(sourceAdapterId,profileId);
}

export type CurrentSourceSealWrite = CurrentSourceLanePair & {
  runId: string;
  artifactRevision: number;
  manifestDigest: string;
  sourceTransformDigest: string;
  requestedSpecDigest: string;
  effectiveSpecDigest: string;
  datasetBindingDigest: string;
  tableRows: Record<CurrentSourceTableKind, number>;
  totalRows: number;
  /** Compact source-derived models generated at seal time, never in a GET. */
  summary: Record<string, unknown>;
  /**
   * Optional private-ingest cross-check: the worker's digest of the batch
   * receipts it sent. The stored digest is always recomputed locally.
   */
  expectedRetainedImportDigest?: string;
  /** Private live-worker fence; not a browser-supplied field. */
  lease?: RetainedExposureFence;
};

type JsonColumn = Record<string, unknown> | string | null;

export type CurrentSourceSealRow = CurrentSourceLanePair & {
  /** Exact immutable run/version inputs; never stored back into a sealed summary. */
  runDeclarationInputs?: RunDeclarationInputs;
  runId: string;
  artifactRevision: number;
  manifestDigest: string;
  sourceTransformDigest: string;
  /** Digest of the immutable, P05-verified local batch receipt set. */
  retainedImportDigest: string;
  requestedSpecDigest: string;
  effectiveSpecDigest: string;
  datasetBindingDigest: string;
  tableRows: Record<CurrentSourceTableKind, number>;
  totalRows: number;
  summary: Record<string, unknown>;
  analyticsSidecar?: { digest: string; sourceRowsDigest: string; analytics: ResearchRetainedAnalyticsV2 };
  distributionsSidecar?: { digest: string; distributions: ResearchAllTimeDistributions };
  enrichedAnalysis?: ResearchEnrichedAnalysis;
  retainedAtUtcMs: number;
};

export interface CurrentSourceStoredRow {
  sourceOrdinal: number;
  sourceId: string;
  occurredAtUtcMs: number | null;
  payload: Record<string, unknown>;
}

export interface CurrentSourcePage {
  rows: CurrentSourceStoredRow[];
  hasMore: boolean;
  hasPrevious: boolean;
  totalRows: number;
}

/** Finite S06 inputs, read under one actor-authorized repeatable-read snapshot. */
export interface CurrentSourceSearchInputs {
  trials: CurrentSourceStoredRow[];
  candidates: CurrentSourceStoredRow[];
  folds: CurrentSourceStoredRow[];
  stageEvents: P11StageEvents;
  requestedSpec: Record<string, unknown> | null;
}

/** One exact retained P05 artifact/attempt, never the newest unrelated producer. */
export const CURRENT_SOURCE_STAGE_EVENTS_SQL = `WITH bound_producer AS (
  SELECT producer.worker_attempt_id, producer.lease_epoch,
         producer.execution_profile_id, producer.execution_profile_digest,
         producer.actor_user_id, producer.preflight_token, artifact.artifact_id
    FROM research.run_producers producer
    JOIN research.artifacts artifact
      ON artifact.workspace_id=producer.workspace_id AND artifact.run_id=producer.run_id
     AND artifact.worker_attempt_id=producer.worker_attempt_id AND artifact.lease_epoch=producer.lease_epoch
   WHERE producer.workspace_id=$1 AND producer.run_id=$2
     AND artifact.state='SEALED' AND artifact.artifact_revision=$3 AND artifact.manifest_digest=$4
     AND producer.requested_spec_digest=$5 AND producer.effective_spec_digest=$6
     AND producer.dataset_binding_digest=$7
), exact_binding AS (
  SELECT * FROM bound_producer WHERE (SELECT count(*) FROM bound_producer)=1
)
SELECT producer.worker_attempt_id, producer.lease_epoch, producer.artifact_id,
       producer.execution_profile_id, producer.execution_profile_digest,
       (SELECT event.occurred_at_utc_ms FROM research.run_progress_events event
         WHERE event.workspace_id=$1 AND event.run_id=$2 AND event.worker_attempt_id=producer.worker_attempt_id
           AND event.event_type='stage_completed' AND event.event_payload->>'stage'='S3'
         ORDER BY event.source_sequence DESC LIMIT 1) AS s3_completed_utc_ms,
       (SELECT event.occurred_at_utc_ms FROM research.run_progress_events event
         WHERE event.workspace_id=$1 AND event.run_id=$2 AND event.worker_attempt_id=producer.worker_attempt_id
           AND event.event_type='stage_started' AND event.event_payload->>'stage'='S4'
         ORDER BY event.source_sequence DESC LIMIT 1) AS s4_started_utc_ms,
       (SELECT event.occurred_at_utc_ms FROM research.run_progress_events event
         WHERE event.workspace_id=$1 AND event.run_id=$2 AND event.worker_attempt_id=producer.worker_attempt_id
           AND event.event_type='stage_completed' AND event.event_payload->>'stage'='S4'
         ORDER BY event.source_sequence DESC LIMIT 1) AS s4_completed_utc_ms,
       (SELECT preflight.requested_spec FROM research.preflight_manifests preflight
         WHERE preflight.workspace_id=$1 AND preflight.preflight_token=producer.preflight_token
           AND preflight.actor_user_id=producer.actor_user_id AND preflight.requested_spec_digest=$5
         LIMIT 1) AS requested_spec
  FROM exact_binding producer`;

interface StageEventsQueryRow {
  worker_attempt_id: string;
  lease_epoch: string | number;
  artifact_id: string;
  execution_profile_id: string;
  execution_profile_digest: string | null;
  s3_completed_utc_ms: string | number | null;
  s4_started_utc_ms: string | number | null;
  s4_completed_utc_ms: string | number | null;
  requested_spec: JsonColumn;
}

/** Run state for the no-seal lane; exported so the PostgreSQL lane runs the exact statement. */
export const CURRENT_SOURCE_RUN_STATE_SQL = `SELECT library.source_kind, library.effective_status, producer.adapter_contract_digest,
       producer.execution_profile_id
  FROM research.run_library_rows_v1 library
  LEFT JOIN research.run_producers producer
    ON producer.workspace_id = library.workspace_id AND producer.run_id = library.run_id
 WHERE library.workspace_id = $1 AND library.run_id = $2
 LIMIT 1`;

export interface CurrentSourceRunState {
  sourceKind: "RESEARCH_DURABLE" | "LEGACY_1_0_8_METADATA";
  effectiveStatus: string;
  /** The run's immutable P10 adapter binding; null for a run P10 never admitted. */
  adapterContractDigest: string | null;
  /** W1 immutable P10 execution profile; null for a run P10 never admitted. */
  executionProfileId: string | null;
}

interface SealQueryRow {
  bound_alpha_id?: string | null;
  bound_alpha_version_id?: string | null;
  bound_requested_spec?: Record<string, unknown> | null;
  alpha_declared_contract?: Record<string, unknown> | null;
  alpha_entrypoint?: string | null;
  alpha_source_digest?: string | null;
  run_id: string;
  artifact_revision: string | number;
  source_adapter_id: string;
  profile_id: string;
  manifest_digest: string;
  source_transform_digest: string;
  retained_import_digest: string;
  requested_spec_digest: string;
  effective_spec_digest: string;
  dataset_binding_digest: string;
  table_rows: JsonColumn;
  total_rows: string | number;
  summary: JsonColumn;
  retained_at_utc_ms: string | number;
  sidecar_retained_import_digest?: string | null;
  sidecar_source_rows_digest?: string | null;
  sidecar_analytics_digest?: string | null;
  sidecar_analytics?: JsonColumn;
  distributions_retained_import_digest?: string | null;
  distributions_source_rows_digest?: string | null;
  distributions_digest?: string | null;
  distributions?: JsonColumn;
}

interface SourceRowQueryRow {
  source_ordinal: string | number;
  source_id: string;
  occurred_at_utc_ms: string | number | null;
  payload: JsonColumn;
}

interface CountQueryRow { count: string | number; }
interface TableCountRow {
  table_kind: CurrentSourceTableKind;
  count: string | number;
  minimum_ordinal: string | number | null;
  maximum_ordinal: string | number | null;
}
/** Internal durable receipt shape, exported only for deterministic unit tests. */
export interface CurrentSourceBatchDigestRow {
  table_kind: CurrentSourceTableKind;
  batch_ordinal: string | number;
  batch_digest: string;
  row_count: string | number;
}
interface RunStateQueryRow {
  source_kind: "RESEARCH_DURABLE" | "LEGACY_1_0_8_METADATA";
  effective_status: string;
  adapter_contract_digest: string | null;
  execution_profile_id: string | null;
}

interface IngestAuthorityRow {
  execution_profile_id: string;
  execution_profile_digest: string | null;
  requested_spec_digest: string;
  effective_spec_digest: string;
  dataset_binding_digest: string;
  artifact_run_id: string | null;
  artifact_state: string | null;
  artifact_manifest_digest: string | null;
  artifact_revision: string | number | null;
  artifact_worker_attempt_id: string | null;
  artifact_lease_epoch: string | number | null;
}

/** W1 private-ingest facts; every seal digest comes from here, never the body. */
export interface CurrentSourceIngestAuthority {
  executionProfileId: string;
  executionProfileDigest: string | null;
  requestedSpecDigest: string;
  effectiveSpecDigest: string;
  datasetBindingDigest: string;
  artifact: {
    runId: string;
    state: string;
    manifestDigest: string | null;
    artifactRevision: number;
    workerAttemptId: string | null;
    leaseEpoch: number | null;
  } | null;
}

const MAXIMUM_CONCURRENT_CURRENT_SOURCE_READS = 2;
// Retained inspection is bounded to two active DB reads plus eighteen waiters.
const MAXIMUM_QUEUED_CURRENT_SOURCE_READS = 18;
const MAXIMUM_BATCH_ROWS = 200;
const MAXIMUM_BATCH_BYTES = 1_048_576;
const TABLE_KINDS: readonly CurrentSourceTableKind[] = ["OBSERVATION", "FOLD", "TRIAL", "CANDIDATE", "SELECTION"];

function asSafeNonNegative(value: string | number | null | undefined, label: string): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(numeric) || numeric < 0) {
    throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_UNAVAILABLE", `Current-source ${label} is incompatible.`, 503);
  }
  return numeric;
}

function asJsonRecord(value: JsonColumn, label: string): Record<string, unknown> {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not object");
    return parsed as Record<string, unknown>;
  } catch {
    throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_UNAVAILABLE", `Current-source ${label} is incompatible.`, 503);
  }
}

function canonicalJson(value: unknown): string {
  const normalize = (entry: unknown): unknown => {
    if (Array.isArray(entry)) return entry.map(normalize);
    if (entry && typeof entry === "object") {
      return Object.fromEntries(Object.entries(entry as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, normalize(nested)]));
    }
    return entry;
  };
  return JSON.stringify(normalize(value));
}

/** JSONB text adds one space per structural comma/colon, never inside strings.
 * Source number fields are bounded integer counts; exact decimals are strings.
 */
export function currentSourceSummaryWithinBudget(summary: Record<string, unknown>): boolean {
  const spacedBytes = (value: unknown) => {
    const encoded = canonicalJson(value);
    let extra = 0, quoted = false, escaped = false;
    for (const character of encoded) {
      if (quoted) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') quoted = false;
      } else if (character === '"') quoted = true;
      else if (character === "," || character === ":") extra += 1;
    }
    return Buffer.byteLength(encoded, "utf8") + extra;
  };
  const { enriched_analysis: enriched, ...core } = summary;
  return spacedBytes(core) <= 65_536
    && (enriched === undefined || (enriched !== null && typeof enriched === "object"
      && !Array.isArray(enriched) && spacedBytes(enriched) <= 73_728));
}

export function currentSourceBatchDigest(rows: readonly CurrentSourceRowInput[]): string {
  return createHash("sha256").update(canonicalJson(rows), "utf8").digest("hex");
}

/**
 * A durable local receipt for the exact immutable P05 batches accepted into
 * Portal. This is deliberately not a source-artifact-byte claim: P05 has
 * already checked those bytes before import; this digest proves that the
 * retained local batch set has not changed since the seal.
 */
export function currentSourceImportDigest(rows: readonly CurrentSourceBatchDigestRow[]): string {
  // The digest owns its ordering rather than relying on a PostgreSQL plan.
  // That makes the sealed receipt stable across restart, index changes and
  // the later verification read.
  const canonicalRows = [...rows].sort((left, right) => (
    left.table_kind.localeCompare(right.table_kind)
    || asSafeNonNegative(left.batch_ordinal, "batch ordinal") - asSafeNonNegative(right.batch_ordinal, "batch ordinal")
  ));
  return createHash("sha256").update(canonicalJson(canonicalRows.map((row) => ({
    table_kind: row.table_kind,
    batch_ordinal: asSafeNonNegative(row.batch_ordinal, "batch ordinal"),
    batch_digest: row.batch_digest,
    row_count: asSafeNonNegative(row.row_count, "batch row count"),
  }))), "utf8").digest("hex");
}

/**
 * This repository has a separate two-reader admission lane. A slow retained
 * chart/replay cannot consume the identity pool or turn local retained data
 * into an unbounded viewer queue.
 */
@Injectable()
export class ResearchCurrentSourceRepository {
  private readonly readAdmission = new BoundedResearchReadAdmission<ResearchCurrentSourceError>({
    maximumActive: MAXIMUM_CONCURRENT_CURRENT_SOURCE_READS,
    maximumQueued: MAXIMUM_QUEUED_CURRENT_SOURCE_READS,
    waitTimeoutMs: RESEARCH_DB_BUDGET.boundedReadQueueWaitMs,
    unavailable: () => new ResearchCurrentSourceError(
      "RESEARCH_CURRENT_SOURCE_UNAVAILABLE", "Current-source read admission is temporarily saturated.", 503,
    ),
  });

  constructor(
    @Inject(CONTROL_API_POOL) private readonly pool: Pool,
    // Only the research-preview long WFO flag is read (seal TRIAL ceiling).
    @Optional() @Inject(CONTROL_API_CONFIG) private readonly config?: ControlApiConfig,
  ) {}

  /** Private worker-only batch append; no HTTP controller mounts this method. */
  async append(scope: ResearchScope, input: CurrentSourceAppendBatch): Promise<{ replayed: boolean }> {
    this.assertBatch(input);
    return this.withTransaction(scope, false, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        // Import and seal share one custody lock. A seal can therefore never
        // observe a partial append, and two private import attempts cannot
        // mix manifest/transform identities into the same revision.
        `${scope.workspaceId}:${input.runId}:${input.artifactRevision}:rs02-custody`,
      ]);
      const custody = await client.query<{ manifest_digest: string; source_transform_digest: string }>(
        `SELECT manifest_digest, source_transform_digest
           FROM research.current_source_import_batches_v1
          WHERE workspace_id = $1 AND run_id = $2 AND artifact_revision = $3
          LIMIT 1`,
        [scope.workspaceId, input.runId, input.artifactRevision],
      );
      if (custody.rowCount === 1 && (custody.rows[0]!.manifest_digest !== input.manifestDigest
        || custody.rows[0]!.source_transform_digest !== input.sourceTransformDigest)) {
        throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_CONFLICT", "Current-source revision is already bound to a different immutable artifact receipt.", 409);
      }
      const existing = await client.query<{ batch_digest: string; row_count: string | number }>(
        `SELECT batch_digest, row_count
           FROM research.current_source_import_batches_v1
          WHERE workspace_id = $1 AND run_id = $2 AND artifact_revision = $3
            AND table_kind = $4 AND batch_ordinal = $5`,
        [scope.workspaceId, input.runId, input.artifactRevision, input.tableKind, input.batchOrdinal],
      );
      if (existing.rowCount === 1) {
        if (existing.rows[0]!.batch_digest !== input.batchDigest
          || asSafeNonNegative(existing.rows[0]!.row_count, "batch row count") !== input.rows.length) {
          throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_CONFLICT", "Current-source batch conflicts with immutable retained rows.", 409);
        }
        return { replayed: true };
      }
      await client.query(
        `INSERT INTO research.current_source_import_batches_v1
           (workspace_id, run_id, artifact_revision, manifest_digest, source_transform_digest,
            table_kind, batch_ordinal, batch_digest, row_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [scope.workspaceId, input.runId, input.artifactRevision, input.manifestDigest, input.sourceTransformDigest,
          input.tableKind, input.batchOrdinal, input.batchDigest, input.rows.length],
      );
      // One statement per bounded import batch—not one round trip per row.
      // The 200-row/1-MiB admission cap remains enforced before this point.
      const rows = input.rows.map((row) => ({
        source_ordinal: row.sourceOrdinal,
        source_id: row.sourceId,
        occurred_at_utc_ms: row.occurredAtUtcMs,
        payload: row.payload,
      }));
      await client.query(
        `INSERT INTO research.current_source_rows_v1
           (workspace_id, run_id, artifact_revision, table_kind, source_ordinal, source_id, occurred_at_utc_ms, payload)
         SELECT $1, $2, $3, $4, imported.source_ordinal, imported.source_id, imported.occurred_at_utc_ms, imported.payload
           FROM jsonb_to_recordset($5::jsonb)
             AS imported(source_ordinal bigint, source_id text, occurred_at_utc_ms bigint, payload jsonb)`,
        [scope.workspaceId, input.runId, input.artifactRevision, input.tableKind, canonicalJson(rows)],
      );
      return { replayed: false };
    });
  }

  /** Final immutable publish after every expected local row batch exists. */
  async seal(
    scope: ResearchScope,
    input: CurrentSourceSealWrite,
  ): Promise<{ replayed: boolean; retainedImportDigest: string }> {
    this.assertSeal(input);
    return this.withTransaction(scope, false, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `${scope.workspaceId}:${input.runId}:${input.artifactRevision}:rs02-custody`,
      ]);
      const exposure = input.summary.execution_observation;
      if (exposure !== undefined && !input.lease) {
        throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_CONFLICT", "Exposure retention requires a live execution lease.", 409);
      }
      const exposureAuthority = input.lease
        ? await retainedExposureAuthority(client, scope, input.runId, input.lease) : null;
      const existing = await client.query<SealQueryRow>(
        `SELECT run_id, artifact_revision, source_adapter_id, profile_id, manifest_digest, source_transform_digest, retained_import_digest,
                requested_spec_digest, effective_spec_digest, dataset_binding_digest, table_rows, total_rows,
                summary, floor(extract(epoch FROM retained_at) * 1000)::bigint AS retained_at_utc_ms
           FROM research.current_source_seals_v1
          WHERE workspace_id = $1 AND run_id = $2 AND artifact_revision = $3`,
        [scope.workspaceId, input.runId, input.artifactRevision],
      );
      if (existing.rowCount === 1) {
        const row = this.toSeal(existing.rows[0]!);
        if (row.sourceAdapterId !== input.sourceAdapterId || row.profileId !== input.profileId
          || row.manifestDigest !== input.manifestDigest || row.sourceTransformDigest !== input.sourceTransformDigest
          || row.requestedSpecDigest !== input.requestedSpecDigest || row.effectiveSpecDigest !== input.effectiveSpecDigest
          || row.datasetBindingDigest !== input.datasetBindingDigest || row.totalRows !== input.totalRows
          || canonicalJson(row.tableRows) !== canonicalJson(input.tableRows)
          || canonicalJson(row.summary) !== canonicalJson(input.summary)) {
          throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_CONFLICT", "Current-source seal conflicts with immutable retained facts.", 409);
        }
        if (input.expectedRetainedImportDigest !== undefined && row.retainedImportDigest !== input.expectedRetainedImportDigest) {
          throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_CONFLICT", "Current-source seal conflicts with immutable retained facts.", 409);
        }
        return { replayed: true, retainedImportDigest: row.retainedImportDigest };
      }
      const counts = await client.query<TableCountRow>(
        `SELECT table_kind, count(*) AS count, min(source_ordinal) AS minimum_ordinal, max(source_ordinal) AS maximum_ordinal
           FROM research.current_source_rows_v1
          WHERE workspace_id = $1 AND run_id = $2 AND artifact_revision = $3
          GROUP BY table_kind`,
        [scope.workspaceId, input.runId, input.artifactRevision],
      );
      const actualRows = Object.fromEntries(TABLE_KINDS.map((kind) => [kind, 0])) as Record<CurrentSourceTableKind, number>;
      for (const row of counts.rows) {
        const count = asSafeNonNegative(row.count, "retained row count");
        const minimum = row.minimum_ordinal === null ? null : asSafeNonNegative(row.minimum_ordinal, "minimum row ordinal");
        const maximum = row.maximum_ordinal === null ? null : asSafeNonNegative(row.maximum_ordinal, "maximum row ordinal");
        // The importer normalizes every retained relation to a dense source
        // ordinal. That gives exact, cheap local page/playhead sampling and
        // prevents a hole from being silently treated as an event gap.
        if (count < 1 || minimum !== 0 || maximum !== count - 1) {
          throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_CONFLICT", "Current-source row ordinals are not a dense sealed sequence.", 409);
        }
        actualRows[row.table_kind] = count;
      }
      if (canonicalJson(actualRows) !== canonicalJson(input.tableRows)
        || Object.values(actualRows).reduce((total, value) => total + value, 0) !== input.totalRows) {
        throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_CONFLICT", "Current-source row counts do not match the sealed artifact receipt.", 409);
      }
      const batches = await client.query<CurrentSourceBatchDigestRow>(
        `SELECT table_kind, batch_ordinal, batch_digest, row_count
           FROM research.current_source_import_batches_v1
          WHERE workspace_id = $1 AND run_id = $2 AND artifact_revision = $3
            AND manifest_digest = $4 AND source_transform_digest = $5
          ORDER BY table_kind ASC, batch_ordinal ASC`,
        [scope.workspaceId, input.runId, input.artifactRevision, input.manifestDigest, input.sourceTransformDigest],
      );
      const batchRows = Object.fromEntries(TABLE_KINDS.map((kind) => [kind, 0])) as Record<CurrentSourceTableKind, number>;
      const seenBatchOrdinals = new Map<CurrentSourceTableKind, number[]>();
      for (const batch of batches.rows) {
        if (!TABLE_KINDS.includes(batch.table_kind) || !/^[0-9a-f]{64}$/.test(batch.batch_digest)) {
          throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_CONFLICT", "Current-source batch receipt is incompatible.", 409);
        }
        const ordinal = asSafeNonNegative(batch.batch_ordinal, "batch ordinal");
        batchRows[batch.table_kind] += asSafeNonNegative(batch.row_count, "batch row count");
        const ordinals = seenBatchOrdinals.get(batch.table_kind) ?? [];
        ordinals.push(ordinal);
        seenBatchOrdinals.set(batch.table_kind, ordinals);
      }
      for (const kind of TABLE_KINDS) {
        const ordinals = (seenBatchOrdinals.get(kind) ?? []).sort((left, right) => left - right);
        if (batchRows[kind] !== input.tableRows[kind] || ordinals.some((ordinal, index) => ordinal !== index)) {
          throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_CONFLICT", "Current-source batch receipt does not exactly cover a sealed relation.", 409);
        }
      }
      if (Object.values(batchRows).reduce((total, value) => total + value, 0) !== input.totalRows) {
        throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_CONFLICT", "Current-source batch receipt does not cover the sealed rows.", 409);
      }
      const retainedImportDigest = currentSourceImportDigest(batches.rows);
      if (input.expectedRetainedImportDigest !== undefined && retainedImportDigest !== input.expectedRetainedImportDigest) {
        throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_INVALID", "Current-source retained import digest does not match the accepted batch receipts.", 400);
      }
      const method = currentSourceRetainedMethod(input.profileId,input.sourceAdapterId);
      const sealRecipe = currentSourceRetainedRecipe(input.profileId,input.sourceAdapterId);
      const sealMaximumTrials = sealRecipe && "max_total_trials" in sealRecipe.public_profile
        ? sealRecipe.public_profile.max_total_trials : sealRecipe?.public_profile.trial_count.max ?? 64;
      const sealRelationLimit = 2 * sealMaximumTrials + 18;
      let stoppingAuthority: Record<string, unknown> | undefined;
      if (method === "PER_FOLD_DECAY" || method === "THREE_WINDOW"
          || sealRecipe && sealRecipe.public_profile.optimization_mode !== "mode_1_decay") {
        const pinned = await client.query<{ requested_spec: JsonColumn }>(
          `SELECT preflight.requested_spec FROM research.run_producers producer
             JOIN research.preflight_manifests preflight ON preflight.workspace_id=producer.workspace_id
              AND preflight.preflight_token=producer.preflight_token AND preflight.actor_user_id=producer.actor_user_id
            WHERE producer.workspace_id=$1 AND producer.run_id=$2
              AND producer.requested_spec_digest=$3 AND preflight.requested_spec_digest=$3
              AND producer.effective_spec_digest=$4 AND preflight.effective_spec_digest=$4
              AND producer.dataset_binding_digest=$5 AND preflight.dataset_binding_digest=$5
              AND producer.execution_profile_id=$6 AND producer.execution_profile_digest=$7 LIMIT 1`,
          [scope.workspaceId,input.runId,input.requestedSpecDigest,input.effectiveSpecDigest,input.datasetBindingDigest,
            sealRecipe?.profile_id,sealRecipe?.profile_digest]);
        if (pinned.rowCount !== 1) throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_CONFLICT", "Source stopping policy does not match its immutable admission.",409);
        stoppingAuthority = asJsonRecord(pinned.rows[0]!.requested_spec,"admitted stopping policy");
      }
      if (method === "CAUSAL_INNER") {
        const recipe = currentSourceRetainedRecipe(input.profileId,input.sourceAdapterId)!;
        const pin = await client.query<{ requested_spec: JsonColumn; topology: JsonColumn }>(
          `SELECT preflight.requested_spec, preflight.topology
             FROM research.run_producers producer JOIN research.preflight_manifests preflight
               ON preflight.workspace_id=producer.workspace_id AND preflight.preflight_token=producer.preflight_token
              AND preflight.actor_user_id=producer.actor_user_id
            WHERE producer.workspace_id=$1 AND producer.run_id=$2
              AND producer.execution_profile_id=$3 AND producer.execution_profile_digest=$4
              AND producer.requested_spec_digest=$5 AND preflight.requested_spec_digest=$5
              AND producer.effective_spec_digest=$6 AND preflight.effective_spec_digest=$6
              AND producer.dataset_binding_digest=$7 AND preflight.dataset_binding_digest=$7 LIMIT 1`,
          [scope.workspaceId,input.runId,recipe.profile_id,
            recipe.profile_digest,input.requestedSpecDigest,input.effectiveSpecDigest,input.datasetBindingDigest]);
        if (pin.rowCount !== 1) throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_CONFLICT", "Causal source pins do not match the immutable admission.",409);
        const retained = await client.query<{ table_kind: string; source_ordinal: string | number; source_id: string; payload: JsonColumn }>(
          `SELECT table_kind, source_ordinal, source_id, payload FROM research.current_source_rows_v1
            WHERE workspace_id=$1 AND run_id=$2 AND artifact_revision=$3
              AND table_kind IN ('FOLD','TRIAL','CANDIDATE','SELECTION')
            ORDER BY table_kind, source_ordinal LIMIT $4`, [scope.workspaceId,input.runId,input.artifactRevision,sealRelationLimit]);
        assertCausalSealConsistency(input, retained.rows.map(row => ({ tableKind: row.table_kind,
          sourceOrdinal: asSafeNonNegative(row.source_ordinal,"causal source ordinal"), sourceId: row.source_id,
          payload: asJsonRecord(row.payload,"causal source payload") })), {
          requestedSpec: asJsonRecord(pin.rows[0]!.requested_spec,"causal admitted request"),
          topology: asJsonRecord(pin.rows[0]!.topology,"causal admitted topology"),
          timeframe: recipe.public_profile.timeframe,
          intervalMs: currentSourceRetainedIntervalMs(input.profileId,input.sourceAdapterId)!,
          trialCount: recipe.public_profile.trial_count,
        });
      }
      if (method === "PER_FOLD_DECAY" || method === "THREE_WINDOW") {
        const retained = await client.query<{ table_kind: string; source_ordinal: string | number; source_id: string; payload: JsonColumn }>(
          `SELECT table_kind, source_ordinal, source_id, payload FROM research.current_source_rows_v1
            WHERE workspace_id=$1 AND run_id=$2 AND artifact_revision=$3
              AND table_kind IN ('FOLD','TRIAL','CANDIDATE','SELECTION')
            ORDER BY table_kind, source_ordinal LIMIT $4`, [scope.workspaceId,input.runId,input.artifactRevision,sealRelationLimit]);
        assertFull02SealConsistency(input, retained.rows.map(row => ({ tableKind: row.table_kind,
          sourceOrdinal: asSafeNonNegative(row.source_ordinal,"FULL02 source ordinal"), sourceId: row.source_id,
          payload: asJsonRecord(row.payload,"FULL02 source payload") })), stoppingAuthority);
      }
      if (sealRecipe && sealRecipe.public_profile.optimization_mode !== "mode_1_decay") {
        const retained = await client.query<{table_kind:string;source_ordinal:string|number;source_id:string;payload:JsonColumn}>(
          `SELECT table_kind,source_ordinal,source_id,payload FROM research.current_source_rows_v1
            WHERE workspace_id=$1 AND run_id=$2 AND artifact_revision=$3
              AND table_kind IN ('FOLD','TRIAL','CANDIDATE','SELECTION') ORDER BY table_kind,source_ordinal LIMIT $4`,
          [scope.workspaceId,input.runId,input.artifactRevision,sealRelationLimit]);
        assertFull04SealConsistency(input,retained.rows.map(row=>({tableKind:row.table_kind,sourceOrdinal:asSafeNonNegative(row.source_ordinal,"optimizer source ordinal"),
          sourceId:row.source_id,payload:asJsonRecord(row.payload,"optimizer source payload")})),stoppingAuthority);
      }
      const rawPopulation = input.summary.source_facts as { search?: { candidate_source_trial_ids_ref?: unknown } } | undefined;
      if (rawPopulation?.search?.candidate_source_trial_ids_ref) {
        const population = CurrentSourceSummarySchema.parse(input.summary).source_facts!;
        const retained = await client.query<{ payload: JsonColumn }>(
          `SELECT payload FROM research.current_source_rows_v1
            WHERE workspace_id=$1 AND run_id=$2 AND artifact_revision=$3 AND table_kind='CANDIDATE'
            ORDER BY source_ordinal LIMIT 6401`, [scope.workspaceId, input.runId, input.artifactRevision]);
        if (retained.rows.length !== input.tableRows.CANDIDATE || retained.rows.length > 6400) {
          throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_INVALID", "Candidate population exceeds its retained census.", 400);
        }
        candidatePopulationIds(population, retained.rows.map(row => CurrentSourceCandidatePayloadSchema.parse(asJsonRecord(row.payload, "candidate population"))));
      }
      await client.query(
        `INSERT INTO research.current_source_seals_v1
           (workspace_id, run_id, artifact_revision, source_adapter_id, profile_id, manifest_digest,
            source_transform_digest, requested_spec_digest, effective_spec_digest, dataset_binding_digest,
            retained_import_digest, table_rows, total_rows, summary)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14::jsonb)`,
        [scope.workspaceId, input.runId, input.artifactRevision, input.sourceAdapterId, input.profileId,
          input.manifestDigest, input.sourceTransformDigest, input.requestedSpecDigest,
          input.effectiveSpecDigest, input.datasetBindingDigest, retainedImportDigest,
          canonicalJson(input.tableRows), input.totalRows, canonicalJson(input.summary)],
      );
      if (input.summary.enriched_analysis !== undefined) {
        const enriched = ResearchEnrichedAnalysisSchema.parse(input.summary.enriched_analysis);
        if (enriched.run_id !== input.runId || enriched.scope.observation_count > input.tableRows.OBSERVATION) {
          throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_INVALID", "Enrichment source binding is incompatible.", 400);
        }
        await client.query(`SELECT research.append_source_enrichment_v1($1,$2,'WFO_RETAINED',$3,$4,$5,$6,$7::jsonb)`,
          [scope.workspaceId,input.runId,String(input.artifactRevision),retainedImportDigest,
            sha256ResearchJson(enriched.source_tables),sha256ResearchJson(enriched),JSON.stringify(enriched)]);
      }
      if (exposure !== undefined && exposureAuthority) {
        await appendRetainedExposure(client, scope, {
          runId: input.runId, artifactRevision: input.artifactRevision, manifestDigest: input.manifestDigest,
          snapshotDigest: exposureAuthority.snapshotDigest, observation: exposure,
        });
      }
      return { replayed: false, retainedImportDigest };
    });
  }

  /**
   * W1 private ingest authority: the run's immutable producer facts and the
   * P05 artifact row named by the worker. Read inside this lane's own
   * transaction as the runtime role; no browser membership is implied.
   */
  async ingestAuthority(scope: ResearchScope, runId: string, artifactId: string): Promise<CurrentSourceIngestAuthority | null> {
    return this.withTransaction(scope, true, async (client) => {
      const result = await client.query<IngestAuthorityRow>(
        `SELECT producer.execution_profile_id, producer.execution_profile_digest,
                producer.requested_spec_digest, producer.effective_spec_digest, producer.dataset_binding_digest,
                artifact.run_id AS artifact_run_id, artifact.state AS artifact_state,
                artifact.manifest_digest AS artifact_manifest_digest,
                artifact.artifact_revision, artifact.worker_attempt_id AS artifact_worker_attempt_id,
                artifact.lease_epoch AS artifact_lease_epoch
           FROM research.run_producers producer
           LEFT JOIN research.artifacts artifact
             ON artifact.workspace_id = producer.workspace_id AND artifact.artifact_id = $3
          WHERE producer.workspace_id = $1 AND producer.run_id = $2
          LIMIT 1`,
        [scope.workspaceId, runId, artifactId],
      );
      const row = result.rows[0];
      if (!row) return null;
      return {
        executionProfileId: row.execution_profile_id,
        executionProfileDigest: row.execution_profile_digest ?? null,
        requestedSpecDigest: row.requested_spec_digest,
        effectiveSpecDigest: row.effective_spec_digest,
        datasetBindingDigest: row.dataset_binding_digest,
        artifact: row.artifact_state === null
          ? null
          : {
            runId: row.artifact_run_id!,
            state: row.artifact_state,
            manifestDigest: row.artifact_manifest_digest,
            artifactRevision: asSafeNonNegative(row.artifact_revision, "artifact revision"),
            workerAttemptId: row.artifact_worker_attempt_id,
            leaseEpoch: row.artifact_lease_epoch === null ? null : asSafeNonNegative(row.artifact_lease_epoch, "artifact lease epoch"),
          },
      };
    });
  }

  async sealForRead(scope: ResearchScope, runId: string, signal?: AbortSignal): Promise<CurrentSourceSealRow | null> {
    return this.withScopedRead(scope, (client) => this.readSeal(client, scope, runId, true), signal);
  }

  /** The S06 seal and its finite inputs belong to ONE authorized snapshot.
   * S06 does not serve B6 analytics, so it must not fetch that separate block.
   */
  async searchForRead(scope: ResearchScope, runId: string, signal?: AbortSignal): Promise<{
    seal: CurrentSourceSealRow; inputs: CurrentSourceSearchInputs;
  } | null> {
    return this.withScopedRead(scope, async (client) => {
      const seal = await this.readSeal(client, scope, runId, false);
      return seal ? { seal, inputs: await this.readSearchInputs(client, scope, seal) } : null;
    }, signal);
  }

  private async readSeal(client: PoolClient, scope: ResearchScope, runId: string, includeEnrichment: boolean): Promise<CurrentSourceSealRow | null> {
      const result = await client.query<SealQueryRow>(
        `SELECT seal.run_id, seal.artifact_revision, seal.source_adapter_id, seal.profile_id, seal.manifest_digest,
                seal.source_transform_digest, seal.retained_import_digest, seal.requested_spec_digest,
                seal.effective_spec_digest, seal.dataset_binding_digest, seal.table_rows, seal.total_rows,
                producer.alpha_id AS bound_alpha_id, producer.alpha_version_id AS bound_alpha_version_id,
                preflight.requested_spec AS bound_requested_spec,
                version.declared_contract AS alpha_declared_contract, version.entrypoint AS alpha_entrypoint,
                version.code_digest AS alpha_source_digest,
                seal.summary, floor(extract(epoch FROM seal.retained_at) * 1000)::bigint AS retained_at_utc_ms,
                sidecar.retained_import_digest AS sidecar_retained_import_digest,
                sidecar.source_rows_digest AS sidecar_source_rows_digest,
                sidecar.analytics_digest AS sidecar_analytics_digest,
                sidecar.analytics AS sidecar_analytics,
                distributions.retained_import_digest AS distributions_retained_import_digest,
                distributions.source_rows_digest AS distributions_source_rows_digest,
                distributions.distributions_digest, distributions.distributions
           FROM research.current_source_seals_v1 seal
           LEFT JOIN research.run_producers producer
             ON producer.workspace_id = seal.workspace_id AND producer.run_id = seal.run_id
            AND producer.requested_spec_digest = seal.requested_spec_digest
            AND producer.effective_spec_digest = seal.effective_spec_digest
            AND producer.dataset_binding_digest = seal.dataset_binding_digest
           LEFT JOIN research.preflight_manifests preflight
             ON preflight.workspace_id = producer.workspace_id AND preflight.preflight_token = producer.preflight_token
            AND preflight.actor_user_id = producer.actor_user_id
            AND preflight.requested_spec_digest = seal.requested_spec_digest
           LEFT JOIN research.alpha_versions version
             ON version.workspace_id = producer.workspace_id AND version.alpha_version_id = producer.alpha_version_id
            AND version.alpha_id = producer.alpha_id
           LEFT JOIN research.current_source_analytics_sidecars_v2 sidecar
             ON sidecar.workspace_id = seal.workspace_id AND sidecar.run_id = seal.run_id
            AND sidecar.artifact_revision = seal.artifact_revision
           LEFT JOIN research.current_source_distributions_v1 distributions
             ON distributions.workspace_id = seal.workspace_id AND distributions.run_id = seal.run_id
            AND distributions.artifact_revision = seal.artifact_revision
          WHERE seal.workspace_id = $1 AND seal.run_id = $2
          ORDER BY seal.artifact_revision DESC
          LIMIT 1`,
        [scope.workspaceId, runId],
      );
      if (result.rowCount !== 1) return null;
      const enrichedAnalysis = includeEnrichment ? await readEnriched(client, scope.workspaceId, runId,
        () => new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_UNAVAILABLE", "Stored analytics supplement is incompatible.", 503)) : null;
      const row = result.rows[0]!;
      return { ...this.toSeal(row), runDeclarationInputs: {
        alphaId: row.bound_alpha_id, alphaVersionId: row.bound_alpha_version_id,
        requestedSpec: row.bound_requested_spec, requestedSpecDigest: row.requested_spec_digest,
        declaredContract: row.alpha_declared_contract, entrypoint: row.alpha_entrypoint,
        sourceDigest: row.alpha_source_digest,
      }, ...(enrichedAnalysis ? { enrichedAnalysis } : {}) };
  }

  /**
   * This is only used to turn an absent current-source seal into an honest
   * typed refusal. It does not read legacy request/configuration JSON and it
   * never causes a source/worker lookup. The P10 adapter binding is joined
   * here, inside this lane's own admission, so a no-seal read never takes a
   * split-reader slot (it used to, and could 503 behind slow split reads).
   */
  async runState(scope: ResearchScope, runId: string, signal?: AbortSignal): Promise<CurrentSourceRunState | null> {
    return this.withScopedRead(scope, async (client) => {
      const result = await client.query<RunStateQueryRow>(
        CURRENT_SOURCE_RUN_STATE_SQL,
        [scope.workspaceId, runId],
      );
      if (result.rowCount !== 1) return null;
      const row = result.rows[0]!;
      return {
        sourceKind: row.source_kind,
        effectiveStatus: row.effective_status,
        adapterContractDigest: row.adapter_contract_digest ?? null,
        executionProfileId: row.execution_profile_id ?? null,
      };
    }, signal);
  }

  /**
   * P11 orchestration observations from the exact retained artifact attempt.
   * These never stand in for engine search, freeze or first-OOS-read clocks.
   */
  async stageEventClocks(scope: ResearchScope, seal: CurrentSourceSealRow, signal?: AbortSignal): Promise<P11StageEvents> {
    return this.withScopedRead(scope, async (client) => (await this.readStageInputs(client, scope, seal)).stageEvents, signal);
  }
  /** CG-FG-S06-06: immutable P08 request, pinned to the P05 seal digest. */
  async admittedRequestedSpec(
    scope: ResearchScope,
    runId: string,
    requestedSpecDigest: string,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown> | null> {
    return this.withScopedRead(scope, async (client) => {
      const result = await client.query<{ requested_spec: JsonColumn }>(
        `SELECT preflight.requested_spec
           FROM research.run_producers producer
           JOIN research.preflight_manifests preflight
             ON preflight.workspace_id = producer.workspace_id
            AND preflight.preflight_token = producer.preflight_token
            AND preflight.actor_user_id = producer.actor_user_id
            AND preflight.requested_spec_digest = $3
          WHERE producer.workspace_id = $1 AND producer.run_id = $2
            AND producer.requested_spec_digest = $3
          ORDER BY producer.created_at DESC
          LIMIT 1`,
        [scope.workspaceId, runId, requestedSpecDigest],
      );
      return result.rowCount === 1
        ? asJsonRecord(result.rows[0]!.requested_spec, "admitted requested spec") : null;
    }, signal);
  }


  async rows(
    scope: ResearchScope,
    runId: string,
    artifactRevision: number,
    tableKind: CurrentSourceTableKind,
    selection: { afterOrdinal?: number; beforeOrdinal?: number; atOrdinal?: number; limit: number },
    signal?: AbortSignal,
  ): Promise<CurrentSourcePage> {
    return this.withScopedRead(scope, async (client) => {
      const where = ["workspace_id = $1", "run_id = $2", "artifact_revision = $3", "table_kind = $4"];
      const params: unknown[] = [scope.workspaceId, runId, artifactRevision, tableKind];
      let ordering = "source_ordinal ASC";
      let reverse = false;
      if (selection.afterOrdinal !== undefined) {
        params.push(selection.afterOrdinal);
        where.push(`source_ordinal > $${params.length}`);
      } else if (selection.beforeOrdinal !== undefined) {
        params.push(selection.beforeOrdinal);
        where.push(`source_ordinal < $${params.length}`);
        ordering = "source_ordinal DESC";
        reverse = true;
      } else if (selection.atOrdinal !== undefined) {
        params.push(selection.atOrdinal);
        where.push(`source_ordinal >= $${params.length}`);
      }
      params.push(selection.limit + 1);
      const result = await client.query<SourceRowQueryRow>(
        `SELECT source_ordinal, source_id, occurred_at_utc_ms, payload
           FROM research.current_source_rows_v1
          WHERE ${where.join(" AND ")}
          ORDER BY ${ordering}
          LIMIT $${params.length}`,
        params,
      );
      const hasExtra = result.rows.length > selection.limit;
      const pageRows = result.rows.slice(0, selection.limit);
      if (reverse) pageRows.reverse();
      const firstOrdinal = pageRows[0] ? asSafeNonNegative(pageRows[0].source_ordinal, "row ordinal") : null;
      const lastOrdinal = pageRows.at(-1) ? asSafeNonNegative(pageRows.at(-1)!.source_ordinal, "row ordinal") : null;
      const total = await client.query<CountQueryRow & { previous_count: string | number; following_count: string | number }>(
        `SELECT count(*) AS count,
                count(*) FILTER (WHERE source_ordinal < $5) AS previous_count,
                count(*) FILTER (WHERE source_ordinal > $6) AS following_count
           FROM research.current_source_rows_v1
          WHERE workspace_id = $1 AND run_id = $2 AND artifact_revision = $3 AND table_kind = $4`,
        [scope.workspaceId, runId, artifactRevision, tableKind, firstOrdinal, lastOrdinal],
      );
      const previous = asSafeNonNegative(total.rows[0]?.previous_count, "previous row count");
      const following = asSafeNonNegative(total.rows[0]?.following_count, "following row count");
      return {
        rows: pageRows.map((row) => ({
          sourceOrdinal: asSafeNonNegative(row.source_ordinal, "row ordinal"),
          sourceId: row.source_id,
          occurredAtUtcMs: row.occurred_at_utc_ms === null ? null : asSafeNonNegative(row.occurred_at_utc_ms, "row timestamp"),
          payload: asJsonRecord(row.payload, "row payload"),
        })),
        // Verify keyset edges rather than trusting an old cursor's direction.
        hasMore: following > 0 || (!reverse && hasExtra),
        hasPrevious: previous > 0 || (reverse && hasExtra),
        totalRows: asSafeNonNegative(total.rows[0]?.count, "table total"),
      };
    }, signal);
  }

  /** S06 already needs every bounded trial/fold for its surface and pool.
   * Fetch them once, not through seven separately queued transactions.
   * No cached authorization, unbounded relation, source access or new API.
   */
  async searchInputs(scope: ResearchScope, seal: CurrentSourceSealRow, signal?: AbortSignal): Promise<CurrentSourceSearchInputs> {
    return this.withScopedRead(scope, (client) => this.readSearchInputs(client, scope, seal), signal);
  }

  private async readSearchInputs(client: PoolClient, scope: ResearchScope, seal: CurrentSourceSealRow): Promise<CurrentSourceSearchInputs> {
      // A sealed, qualified historical run remains readable when its producer
      // profile is disabled. The immutable census controls this bounded read,
      // not a flag that admits NEW long-running optimizer jobs. Only an exact
      // expanded retained pair can widen the historical 400/64 ceilings.
      const bounds = currentSourceRetainedRowBounds(seal.profileId, seal.sourceAdapterId);
      const trialLimit = Math.min(bounds.trials, Math.max(64, seal.tableRows.TRIAL));
      const candidateLimit = Math.min(bounds.candidates, Math.max(64, seal.tableRows.CANDIDATE));
      const limits = { TRIAL: trialLimit, CANDIDATE: candidateLimit, FOLD: 256 };
      const rows = await client.query<SourceRowQueryRow & { table_kind: keyof typeof limits }>(
        `WITH bounds(table_kind, row_limit) AS (VALUES ('TRIAL', $4::int), ('CANDIDATE', $5::int), ('FOLD', 256))
         SELECT bounded.* FROM bounds CROSS JOIN LATERAL (
           SELECT table_kind, source_ordinal, source_id, occurred_at_utc_ms, payload
             FROM research.current_source_rows_v1
            WHERE workspace_id=$1 AND run_id=$2 AND artifact_revision=$3 AND table_kind=bounds.table_kind
            ORDER BY source_ordinal ASC LIMIT bounds.row_limit + 1
         ) bounded ORDER BY table_kind, source_ordinal`,
        [scope.workspaceId, seal.runId, seal.artifactRevision, trialLimit, candidateLimit],
      );
      const relations: Record<keyof typeof limits, CurrentSourceStoredRow[]> = { TRIAL: [], CANDIDATE: [], FOLD: [] };
      for (const row of rows.rows) {
        if (!Object.hasOwn(relations, row.table_kind)) {
          throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_UNAVAILABLE", "Retained search relation is incompatible.", 503);
        }
        relations[row.table_kind].push({ sourceOrdinal: asSafeNonNegative(row.source_ordinal, "row ordinal"),
          sourceId: row.source_id, occurredAtUtcMs: row.occurred_at_utc_ms === null ? null
            : asSafeNonNegative(row.occurred_at_utc_ms, "row timestamp"), payload: asJsonRecord(row.payload, "row payload") });
      }
      for (const kind of ["TRIAL", "CANDIDATE", "FOLD"] as const) {
        if (relations[kind].length > limits[kind] || relations[kind].length !== seal.tableRows[kind]) {
          throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_UNAVAILABLE", "Retained search relation exceeds its sealed bound.", 503);
        }
      }
      return { trials: relations.TRIAL, candidates: relations.CANDIDATE, folds: relations.FOLD,
        ...await this.readStageInputs(client, scope, seal) };
  }

  private async readStageInputs(client: PoolClient, scope: ResearchScope, seal: CurrentSourceSealRow): Promise<{
    stageEvents: P11StageEvents; requestedSpec: Record<string, unknown> | null;
  }> {
    const result = await client.query<StageEventsQueryRow>(CURRENT_SOURCE_STAGE_EVENTS_SQL,
      [scope.workspaceId, seal.runId, seal.artifactRevision, seal.manifestDigest,
        seal.requestedSpecDigest, seal.effectiveSpecDigest, seal.datasetBindingDigest]);
    const row = result.rows.length === 1 ? result.rows[0] : undefined;
    // Unknown or mismatched historical profiles are not clock authority.
    if (!row || !isCurrentSourceExecutionProfile(row.execution_profile_id, row.execution_profile_digest)) {
      return { stageEvents: p11StageEvents(), requestedSpec: null };
    }
    const bindingDigest = sha256ResearchJson({ workspace_id: scope.workspaceId, run_id: seal.runId,
      artifact_id: row.artifact_id, artifact_revision: seal.artifactRevision, manifest_digest: seal.manifestDigest,
      worker_attempt_id: row.worker_attempt_id, lease_epoch: asSafeNonNegative(row.lease_epoch, "stage-event lease epoch"),
      requested_spec_digest: seal.requestedSpecDigest, effective_spec_digest: seal.effectiveSpecDigest,
      dataset_binding_digest: seal.datasetBindingDigest, execution_profile_id: row.execution_profile_id,
      execution_profile_digest: row.execution_profile_digest });
    const at = (value: string | number | null, label: string) => value == null ? null : asSafeNonNegative(value, label);
    return {
      stageEvents: p11StageEvents(bindingDigest, {
        s3_completed_utc_ms: at(row.s3_completed_utc_ms, "S3 completed timestamp"),
        s4_started_utc_ms: at(row.s4_started_utc_ms, "S4 started timestamp"),
        s4_completed_utc_ms: at(row.s4_completed_utc_ms, "S4 completed timestamp"),
      }),
      requestedSpec: row.requested_spec == null ? null : asJsonRecord(row.requested_spec, "admitted requested spec"),
    };
  }

  /**
   * P17-T14 · one retained row by its original source id (the table's unique
   * key), e.g. a fold's child-audit block. One indexed row, never a scan.
   */
  async rowBySourceId(
    scope: ResearchScope,
    runId: string,
    artifactRevision: number,
    tableKind: CurrentSourceTableKind,
    sourceId: string,
    signal?: AbortSignal,
  ): Promise<CurrentSourceStoredRow | null> {
    return this.withScopedRead(scope, async (client) => {
      const result = await client.query<SourceRowQueryRow>(
        `SELECT source_ordinal, source_id, occurred_at_utc_ms, payload
           FROM research.current_source_rows_v1
          WHERE workspace_id = $1 AND run_id = $2 AND artifact_revision = $3 AND table_kind = $4 AND source_id = $5`,
        [scope.workspaceId, runId, artifactRevision, tableKind, sourceId],
      );
      const row = result.rows[0];
      if (!row) return null;
      return {
        sourceOrdinal: asSafeNonNegative(row.source_ordinal, "row ordinal"),
        sourceId: row.source_id,
        occurredAtUtcMs: row.occurred_at_utc_ms === null ? null : asSafeNonNegative(row.occurred_at_utc_ms, "row timestamp"),
        payload: asJsonRecord(row.payload, "row payload"),
      };
    }, signal);
  }

  /** BR-F3-02: one finite endpoint witness; no HMD, payload export or per-fold SQL loop. */
  async temporalGuardWitness(scope: ResearchScope, seal: CurrentSourceSealRow, times: readonly number[],
    signal?: AbortSignal): Promise<GuardIndexWitness> {
    if (times.length > MAXIMUM_GUARD_ENDPOINTS || times.some(at => !Number.isSafeInteger(at) || at < 0)
      || new Set(times).size !== times.length) {
      throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_INVALID", "Temporal guard witness exceeds its finite bound.", 400);
    }
    return this.withScopedRead(scope, async client => {
      const params = [scope.workspaceId, seal.runId, seal.artifactRevision];
      const census = await client.query<{ row_count: string; first_ordinal: string | null; last_ordinal: string | null }>(
        `SELECT count(*) AS row_count, min(source_ordinal) AS first_ordinal, max(source_ordinal) AS last_ordinal
           FROM research.current_source_rows_v1
          WHERE workspace_id=$1 AND run_id=$2 AND artifact_revision=$3 AND table_kind='OBSERVATION'`, params);
      const endpoints = await client.query<{ source_ordinal: string; occurred_at_utc_ms: string }>(
        `SELECT source_ordinal, occurred_at_utc_ms FROM research.current_source_rows_v1
          WHERE workspace_id=$1 AND run_id=$2 AND artifact_revision=$3 AND table_kind='OBSERVATION'
            AND occurred_at_utc_ms=ANY($4::bigint[])
          ORDER BY source_ordinal LIMIT $5`, [...params, times, times.length + 1]);
      const population = census.rows[0];
      return {
        rowCount: asSafeNonNegative(population?.row_count, "guard index census"),
        firstOrdinal: population?.first_ordinal == null ? null : asSafeNonNegative(population.first_ordinal, "guard first ordinal"),
        lastOrdinal: population?.last_ordinal == null ? null : asSafeNonNegative(population.last_ordinal, "guard last ordinal"),
        // More matches than endpoints means ambiguous timestamps; withhold the whole witness.
        points: endpoints.rows.length > times.length ? [] : endpoints.rows.map(row => ({
          atUtcMs: asSafeNonNegative(row.occurred_at_utc_ms, "guard boundary"),
          ordinal: asSafeNonNegative(row.source_ordinal, "guard ordinal"),
        })),
      };
    }, signal);
  }

  /**
   * W5b (P17) · the observation rows whose retained bar block records a
   * target transition, keyset-paged over the ORIGINAL observation ordinal.
   * The ordinals are sparse by nature ({10, 12, 90}); next/previous land on
   * the rows that exist and never on an ordinal in between. Backed by the
   * partial index of migration 065.
   */
  async transitions(
    scope: ResearchScope,
    runId: string,
    artifactRevision: number,
    selection: { afterOrdinal?: number; beforeOrdinal?: number; limit: number },
    signal?: AbortSignal,
  ): Promise<CurrentSourcePage> {
    return this.withScopedRead(scope, async (client) => {
      const base = `workspace_id = $1 AND run_id = $2 AND artifact_revision = $3 AND table_kind = 'OBSERVATION'
            AND (payload->'bar'->>'transition') = 'true'`;
      const params: unknown[] = [scope.workspaceId, runId, artifactRevision];
      let where = base;
      let ordering = "source_ordinal ASC";
      let reverse = false;
      if (selection.afterOrdinal !== undefined) {
        params.push(selection.afterOrdinal);
        where += ` AND source_ordinal > $${params.length}`;
      } else if (selection.beforeOrdinal !== undefined) {
        params.push(selection.beforeOrdinal);
        where += ` AND source_ordinal < $${params.length}`;
        ordering = "source_ordinal DESC";
        reverse = true;
      }
      params.push(selection.limit + 1);
      const result = await client.query<SourceRowQueryRow>(
        `SELECT source_ordinal, source_id, occurred_at_utc_ms, payload
           FROM research.current_source_rows_v1
          WHERE ${where}
          ORDER BY ${ordering}
          LIMIT $${params.length}`,
        params,
      );
      const hasExtra = result.rows.length > selection.limit;
      const pageRows = result.rows.slice(0, selection.limit);
      if (reverse) pageRows.reverse();
      const first = pageRows[0] ? asSafeNonNegative(pageRows[0].source_ordinal, "row ordinal") : null;
      const last = pageRows.at(-1) ? asSafeNonNegative(pageRows.at(-1)!.source_ordinal, "row ordinal") : null;
      const exists = async (operator: "<" | ">", ordinal: number) => (await client.query(
        `SELECT 1 FROM research.current_source_rows_v1 WHERE ${base} AND source_ordinal ${operator} $4 LIMIT 1`,
        [scope.workspaceId, runId, artifactRevision, ordinal],
      )).rowCount === 1;
      const total = await client.query<CountQueryRow>(
        `SELECT count(*) AS count FROM research.current_source_rows_v1 WHERE ${base}`,
        [scope.workspaceId, runId, artifactRevision],
      );
      return {
        rows: pageRows.map((row) => ({
          sourceOrdinal: asSafeNonNegative(row.source_ordinal, "row ordinal"),
          sourceId: row.source_id,
          occurredAtUtcMs: row.occurred_at_utc_ms === null ? null : asSafeNonNegative(row.occurred_at_utc_ms, "row timestamp"),
          payload: asJsonRecord(row.payload, "row payload"),
        })),
        hasMore: last === null ? false : (!reverse && hasExtra) || await exists(">", last),
        hasPrevious: first === null ? false : (reverse && hasExtra) || await exists("<", first),
        totalRows: asSafeNonNegative(total.rows[0]?.count, "transition total"),
      };
    }, signal);
  }

  /**
   * W3 · CG-P13-05 (A02): the observation relation for a chart.
   *
   * Up to `maximum` rows, every retained row in source order (FULL). Past it,
   * `floor(maximum / 5)` ordinal buckets each contribute their first and last
   * row plus their minimum-equity, maximum-equity and minimum-drawdown row, so
   * the relation's endpoints (net return) and its extrema (max drawdown,
   * equity range) always survive the downsample. Never more than `maximum`.
   */
  async observationSeries(
    scope: ResearchScope,
    runId: string,
    artifactRevision: number,
    totalRows: number,
    maximum: number,
    signal?: AbortSignal,
  ): Promise<{ rows: CurrentSourceStoredRow[]; sampling: "FULL" | "OBSERVATION_EXTREMA_BUCKET_V2"; extremaEmitted: boolean }> {
    if (!Number.isSafeInteger(totalRows) || totalRows < 1 || !Number.isSafeInteger(maximum) || maximum < 10 || maximum > 2_000) {
      throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_INVALID", "Current-source series request is invalid.", 400);
    }
    const full = totalRows <= maximum;
    const buckets = Math.floor(maximum / 5);
    return this.withScopedRead(scope, async (client) => {
      const result = full
        ? await client.query<SourceRowQueryRow>(
          `SELECT source_ordinal, source_id, occurred_at_utc_ms, payload
             FROM research.current_source_rows_v1
            WHERE workspace_id = $1 AND run_id = $2 AND artifact_revision = $3 AND table_kind = 'OBSERVATION'
            ORDER BY source_ordinal ASC
            LIMIT $4`,
          [scope.workspaceId, runId, artifactRevision, maximum + 1],
        )
        : await client.query<SourceRowQueryRow>(
          `WITH obs AS (
             SELECT source_ordinal,
                    (payload->>'equity')::numeric AS equity,
                    (payload->>'drawdown_fraction')::numeric AS drawdown,
                    (source_ordinal * $4::bigint) / $5::bigint AS bucket
               FROM research.current_source_rows_v1
              WHERE workspace_id = $1 AND run_id = $2 AND artifact_revision = $3 AND table_kind = 'OBSERVATION'
           ), picks AS (
             (SELECT DISTINCT ON (bucket) source_ordinal FROM obs ORDER BY bucket, source_ordinal ASC)
             UNION (SELECT DISTINCT ON (bucket) source_ordinal FROM obs ORDER BY bucket, source_ordinal DESC)
             UNION (SELECT DISTINCT ON (bucket) source_ordinal FROM obs ORDER BY bucket, equity ASC, source_ordinal ASC)
             UNION (SELECT DISTINCT ON (bucket) source_ordinal FROM obs ORDER BY bucket, equity DESC, source_ordinal ASC)
             UNION (SELECT DISTINCT ON (bucket) source_ordinal FROM obs ORDER BY bucket, drawdown ASC, source_ordinal ASC)
           )
           SELECT row.source_ordinal, row.source_id, row.occurred_at_utc_ms, row.payload
             FROM research.current_source_rows_v1 row
             JOIN picks ON picks.source_ordinal = row.source_ordinal
            WHERE row.workspace_id = $1 AND row.run_id = $2 AND row.artifact_revision = $3 AND row.table_kind = 'OBSERVATION'
            ORDER BY row.source_ordinal ASC
            LIMIT $6`,
          [scope.workspaceId, runId, artifactRevision, buckets, totalRows, maximum + 1],
        );
      if ((full && result.rows.length !== totalRows) || result.rows.length > maximum || result.rows.length < 2 && totalRows >= 2) {
        throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_UNAVAILABLE", "Current-source retained series is incomplete.", 503);
      }
      return {
        rows: result.rows.map((row) => ({
          sourceOrdinal: asSafeNonNegative(row.source_ordinal, "row ordinal"),
          sourceId: row.source_id,
          occurredAtUtcMs: row.occurred_at_utc_ms === null ? null : asSafeNonNegative(row.occurred_at_utc_ms, "row timestamp"),
          payload: asJsonRecord(row.payload, "row payload"),
        })),
        sampling: full ? "FULL" as const : "OBSERVATION_EXTREMA_BUCKET_V2" as const,
        extremaEmitted: true,
      };
    }, signal);
  }

  /** Re-hash the sealed local batch receipts without ever reopening P05 bytes. */
  async verifyRetainedImport(scope: ResearchScope, seal: CurrentSourceSealRow, signal?: AbortSignal): Promise<string> {
    return this.withScopedRead(scope, async (client) => {
      const rows = await client.query<CurrentSourceBatchDigestRow>(
        `SELECT table_kind, batch_ordinal, batch_digest, row_count
           FROM research.current_source_import_batches_v1
          WHERE workspace_id = $1 AND run_id = $2 AND artifact_revision = $3
          ORDER BY table_kind ASC, batch_ordinal ASC`,
        [scope.workspaceId, seal.runId, seal.artifactRevision],
      );
      if ((rows.rowCount ?? 0) < 1) {
        throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_UNAVAILABLE", "Current-source retained batch receipt is unavailable.", 503);
      }
      return currentSourceImportDigest(rows.rows);
    }, signal);
  }

  private assertBatch(input: CurrentSourceAppendBatch): void {
    if (!TABLE_KINDS.includes(input.tableKind) || !Number.isSafeInteger(input.artifactRevision) || input.artifactRevision < 1
      || !Number.isSafeInteger(input.batchOrdinal) || input.batchOrdinal < 0
      || input.rows.length < 1 || input.rows.length > MAXIMUM_BATCH_ROWS
      || !/^[0-9a-f]{64}$/.test(input.batchDigest) || !/^[0-9a-f]{64}$/.test(input.manifestDigest)
      || !/^[0-9a-f]{64}$/.test(input.sourceTransformDigest)
      || currentSourceBatchDigest(input.rows) !== input.batchDigest) {
      throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_INVALID", "Current-source batch is invalid.", 400);
    }
    const bytes = Buffer.byteLength(canonicalJson(input.rows), "utf8");
    if (bytes > MAXIMUM_BATCH_BYTES) {
      throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_INVALID", "Current-source batch exceeds its 1 MiB bound.", 400);
    }
    const seen = new Set<number>();
    for (const row of input.rows) {
      if (!Number.isSafeInteger(row.sourceOrdinal) || row.sourceOrdinal < 0 || seen.has(row.sourceOrdinal)
        || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(row.sourceId)
        || (row.occurredAtUtcMs !== null && (!Number.isSafeInteger(row.occurredAtUtcMs) || row.occurredAtUtcMs < 0))) {
        throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_INVALID", "Current-source row identity is invalid.", 400);
      }
      seen.add(row.sourceOrdinal);
    }
  }

  private assertSeal(input: CurrentSourceSealWrite): void {
    if (!Number.isSafeInteger(input.artifactRevision) || input.artifactRevision < 1
      || !Number.isSafeInteger(input.totalRows) || input.totalRows < 1
      || !/^[0-9a-f]{64}$/.test(input.manifestDigest) || !/^[0-9a-f]{64}$/.test(input.sourceTransformDigest)
      || !/^[0-9a-f]{64}$/.test(input.requestedSpecDigest) || !/^[0-9a-f]{64}$/.test(input.effectiveSpecDigest)
      || !/^[0-9a-f]{64}$/.test(input.datasetBindingDigest)
      || !isCurrentSourceLanePair(input.sourceAdapterId, input.profileId)) {
      throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_INVALID", "Current-source seal is invalid.", 400);
    }
    let total = 0;
    // Research preview only: the long WFO seals up to 400 TRIAL rows.
    const method = currentSourceRetainedMethod(input.profileId,input.sourceAdapterId);
    const causal = method === "CAUSAL_INNER", decay = method === "PER_FOLD_DECAY", three = method === "THREE_WINDOW";
    const recipe = currentSourceRetainedRecipe(input.profileId,input.sourceAdapterId);
    const full03 = recipe?.source_requirement === "FULL03_IMMUTABLE_DELTA_BINDING" || recipe?.source_requirement === "IMPORTED_IMMUTABLE_SEARCH_BINDING";
    const foldBounds = recipe?.public_profile.fold_bounds ?? (three ? {min:1,max:1} : null);
    const maximumTrials = full03 ? "max_total_trials" in recipe.public_profile ? recipe.public_profile.max_total_trials : recipe.public_profile.trial_count.max
      : causal || decay ? 48 : three ? 3 : deltaWfoPreviewLongEnabled(this.config) ? DELTA_WFO_PREVIEW_LONG_LIMITS.max_trials : 64;
    for (const kind of TABLE_KINDS) {
      const count = input.tableRows[kind];
      if (!Number.isSafeInteger(count) || count < 0 || (kind !== "SELECTION" && count < 1) || (kind === "SELECTION" && count !== 1)
        || (kind === "TRIAL" && (count < 2 || count > maximumTrials)) || (kind === "CANDIDATE" && count > (full03 ? maximumTrials : 64))
        || (full03 && kind === "OBSERVATION" && count > recipe.budgets.planning_max_bars)
        || (full03 && kind === "FOLD" && (!foldBounds || count < foldBounds.min || count > foldBounds.max))) {
        throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_INVALID", "Current-source table counts are invalid.", 400);
      }
      total += count;
    }
    if (total !== input.totalRows || !currentSourceSummaryWithinBudget(input.summary)) {
      throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_INVALID", "Current-source seal summary is invalid.", 400);
    }
  }

  private toSeal(row: SealQueryRow): CurrentSourceSealRow {
    const tableRows = asJsonRecord(row.table_rows, "table rows") as Record<string, unknown>;
    const mapped = Object.fromEntries(
      TABLE_KINDS.map((kind) => [kind, asSafeNonNegative(tableRows[kind] as string | number | null, `${kind} count`)]),
    ) as Record<CurrentSourceTableKind, number>;
    if (!isCurrentSourceLanePair(row.source_adapter_id, row.profile_id)) {
      throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_UNAVAILABLE", "Current-source lane pair is incompatible.", 503);
    }
    const summary = asJsonRecord(row.summary, "summary");
    let analyticsSidecar: CurrentSourceSealRow["analyticsSidecar"];
    if (row.sidecar_analytics != null) {
      const parsed = ResearchRetainedAnalyticsV2Schema.safeParse(asJsonRecord(row.sidecar_analytics, "analytics sidecar"));
      const digest = parsed.success ? sha256ResearchJson(parsed.data) : null;
      if (!parsed.success || !row.sidecar_analytics_digest || digest !== row.sidecar_analytics_digest
        || !row.sidecar_source_rows_digest || !/^[0-9a-f]{64}$/.test(row.sidecar_source_rows_digest)
        || row.sidecar_retained_import_digest !== row.retained_import_digest
        || summary.summary_analytics_v2 !== undefined) {
        throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_UNAVAILABLE", "Retained analytics sidecar is incompatible with its immutable seal.", 503);
      }
      analyticsSidecar = {
        digest: row.sidecar_analytics_digest,
        sourceRowsDigest: row.sidecar_source_rows_digest,
        analytics: parsed.data,
      };
    }
    let distributionsSidecar: CurrentSourceSealRow["distributionsSidecar"];
    if (row.distributions != null) {
      const parsed = ResearchAllTimeDistributionsSchema.safeParse(asJsonRecord(row.distributions, "distributions sidecar"));
      if (!parsed.success || sha256ResearchJson(parsed.data) !== row.distributions_digest
        || row.distributions_retained_import_digest !== row.retained_import_digest
        || !row.distributions_source_rows_digest || !/^[0-9a-f]{64}$/.test(row.distributions_source_rows_digest)
        || (analyticsSidecar && row.distributions_source_rows_digest !== analyticsSidecar.sourceRowsDigest)
        || parsed.data.oos_observation_count > mapped.OBSERVATION) {
        throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_UNAVAILABLE", "Distribution companion does not match its immutable source seal.", 503);
      }
      distributionsSidecar = { digest: row.distributions_digest!, distributions: parsed.data };
    }
    return {
      runId: row.run_id,
      artifactRevision: asSafeNonNegative(row.artifact_revision, "artifact revision"),
      ...({ sourceAdapterId: row.source_adapter_id, profileId: row.profile_id } as CurrentSourceLanePair),
      manifestDigest: row.manifest_digest,
      sourceTransformDigest: row.source_transform_digest,
      retainedImportDigest: row.retained_import_digest,
      requestedSpecDigest: row.requested_spec_digest,
      effectiveSpecDigest: row.effective_spec_digest,
      datasetBindingDigest: row.dataset_binding_digest,
      tableRows: mapped,
      totalRows: asSafeNonNegative(row.total_rows, "total rows"),
      summary,
      ...(analyticsSidecar ? { analyticsSidecar } : {}),
      ...(distributionsSidecar ? { distributionsSidecar } : {}),
      retainedAtUtcMs: asSafeNonNegative(row.retained_at_utc_ms, "retained timestamp"),
    };
  }

  private async withScopedRead<T>(scope: ResearchScope, work: (client: PoolClient) => Promise<T>, signal?: AbortSignal): Promise<T> {
    const release = await this.readAdmission.acquire(signal);
    try {
      return await this.withTransaction(scope, true, async (client) => {
        const membership = await client.query("SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2", [scope.workspaceId, scope.actorUserId]);
        if (membership.rowCount !== 1) {
          throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_FORBIDDEN", "Access denied.", 403);
        }
        return work(client);
      }, signal);
    } finally {
      release();
    }
  }

  private async withTransaction<T>(scope: ResearchScope, readOnly: boolean, work: (client: PoolClient) => Promise<T>, signal?: AbortSignal): Promise<T> {
    let client: PoolClient | undefined;
    let began = false;
    try {
      client = readOnly
        ? await acquireResearchPoolClient(this.pool.connect(), RESEARCH_DB_BUDGET.boundedReadAcquireTimeoutMs,
          () => new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_UNAVAILABLE", "Current-source database acquisition timed out.", 503), signal)
        : await this.pool.connect();
      await client.query(readOnly ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY" : "BEGIN");
      began = true;
      try {
        await client.query(`SET LOCAL ROLE ${RESEARCH_DB_RUNTIME_ROLE}`);
      } catch {
        throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_UNAVAILABLE", "Current-source authority is not configured.", 503);
      }
      // Same transaction-local bounds and RLS identity as before, in one
      // round-trip (the Library lane already uses this pattern). Never skip
      // per-actor membership or keep settings outside this transaction.
      await client.query(
        `SELECT set_config('statement_timeout', $1, true),
                set_config('lock_timeout', $2, true),
                set_config('idle_in_transaction_session_timeout', $3, true),
                set_config('research.workspace_id', $4, true),
                set_config('research.actor_user_id', $5, true)`,
        [`${RESEARCH_DB_BUDGET.statementTimeoutMs}ms`, `${RESEARCH_DB_BUDGET.lockTimeoutMs}ms`,
          `${RESEARCH_DB_BUDGET.idleTransactionTimeoutMs}ms`, scope.workspaceId, scope.actorUserId],
      );
      const result = await work(client);
      await client.query("COMMIT");
      began = false;
      return result;
    } catch (error) {
      if (began && client) await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof ResearchCurrentSourceError) throw error;
      const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code?: unknown }).code) : "";
      if (code === "40001" || code === "40P01") {
        throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_UNAVAILABLE", "Current-source data changed concurrently; reload it.", 503);
      }
      const wrapped = new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_UNAVAILABLE", "Current-source data is temporarily unavailable.", 503);
      (wrapped as Error & { cause?: unknown }).cause = error;
      throw wrapped;
    } finally {
      client?.release();
    }
  }
}
