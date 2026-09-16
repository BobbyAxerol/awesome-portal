import type { Pool, PoolClient } from "pg";
import type { ControlApiConfig } from "../config";
import { durableMirrorMode } from "./durable-mirror-mode";
import { profileProjectionCatalog } from "./profile-projection.catalog";
import type { ProjectionEnvironment } from "./profile-projection.repository";

const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{7,95}$/;
const ADVISORY_LOCK_NAME = "portal.execution.durable-mirror-reseed.v1";

type ReseedConfig = Pick<
  ControlApiConfig,
  | "FEATURE_EXECUTION_LOCAL_PROJECTION"
  | "FEATURE_EXECUTION_DURABLE_MIRROR"
  | "FEATURE_EXECUTION_DURABLE_MIRROR_READS"
  | "FEATURE_EXECUTION_CURRENT_SOURCE_PAPER"
  | "FEATURE_EXECUTION_CURRENT_SOURCE_PAPER_DNSE"
  | "FEATURE_EXECUTION_CURRENT_SOURCE_SANDBOX"
  | "FEATURE_EXECUTION_CURRENT_SOURCE_LIVE"
  | "EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID"
  | "EXECUTION_EDGE_PAPER_PROFILE_ID"
  | "EXECUTION_EDGE_PAPER_DNSE_PROFILE_ID"
  | "EXECUTION_EDGE_SANDBOX_PROFILE_ID"
  | "EXECUTION_EDGE_LIVE_PROFILE_ID"
>;

export interface DurableMirrorReseedScope {
  readonly environment: ProjectionEnvironment;
  readonly profileId: string;
  readonly sourceProfile: "PAPER_BINANCE_USDM" | "PAPER_DNSE_VNM" | "SANDBOX_BINANCE_USDM" | "LIVE_BINANCE_USDM";
  readonly relationKeys: readonly string[];
}

export interface DurableMirrorRangeAggregate {
  readonly row_count: string;
  readonly oldest_ts: string | null;
  readonly newest_ts: string | null;
}

export interface DurableMirrorReseedScopeResult extends DurableMirrorReseedScope {
  readonly legacy_before: DurableMirrorRangeAggregate;
  readonly mirror_before: DurableMirrorRangeAggregate;
  readonly cursors_reset: number;
}

export interface DurableMirrorReseedReport {
  readonly schema_version: "portal.execution.durable-mirror-reseed.v1";
  readonly mode: "DRY_RUN" | "APPLY";
  readonly run_id: string;
  readonly durable_mirror_mode: "DUAL_WRITE_WARMUP";
  readonly workspace_id: string;
  readonly source_read_performed: false;
  readonly business_rows_emitted: false;
  readonly scopes: readonly DurableMirrorReseedScopeResult[];
}

/**
 * Rewind only Portal-owned server-side drain cursors for ladder relations.
 *
 * The normal projection worker then performs the actual bounded, mTLS-backed
 * Manager read in its usual lease and pacing regime. This utility never calls
 * the source, never edits a Trading System store, never deletes mirror rows,
 * and never emits an opaque source cursor or a business row.
 *
 * It is intended to run while the Control API worker is stopped by the
 * protected deployment workflow. The transaction-level advisory lock protects
 * against a second operator invocation; stopping the worker is the separate
 * race-free deployment invariant.
 */
export async function reseedDurableMirrorCursors(
  pool: Pick<Pool, "connect">,
  config: ReseedConfig,
  input: { mode: "DRY_RUN" | "APPLY"; runId: string },
): Promise<DurableMirrorReseedReport> {
  validate(config, input);
  const workspaceId = config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID!;
  const scopes = configuredScopes(config);
  if (scopes.length === 0) throw new DurableMirrorReseedError("DURABLE_MIRROR_RESEED_NO_ACTIVE_PROFILES");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const lock = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_xact_lock(hashtext($1)) AS locked",
      [ADVISORY_LOCK_NAME],
    );
    if (lock.rows[0]?.locked !== true) {
      throw new DurableMirrorReseedError("DURABLE_MIRROR_RESEED_ALREADY_RUNNING");
    }
    const results: DurableMirrorReseedScopeResult[] = [];
    for (const scope of scopes) {
      const [legacyBefore, mirrorBefore] = await Promise.all([
        rangeAggregate(client, "execution_timeseries_history", workspaceId, scope),
        rangeAggregate(client, "execution_durable_mirror_range_rows", workspaceId, scope),
      ]);
      const cursorsReset = input.mode === "APPLY"
        ? await resetCursors(client, workspaceId, scope)
        : await countCursors(client, workspaceId, scope);
      results.push({
        ...scope,
        legacy_before: legacyBefore,
        mirror_before: mirrorBefore,
        cursors_reset: cursorsReset,
      });
    }
    if (input.mode === "APPLY") await client.query("COMMIT");
    else await client.query("ROLLBACK");
    return {
      schema_version: "portal.execution.durable-mirror-reseed.v1",
      mode: input.mode,
      run_id: input.runId,
      durable_mirror_mode: "DUAL_WRITE_WARMUP",
      workspace_id: workspaceId,
      source_read_performed: false,
      business_rows_emitted: false,
      scopes: results,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export class DurableMirrorReseedError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

function validate(config: ReseedConfig, input: { mode: "DRY_RUN" | "APPLY"; runId: string }): void {
  if (!RUN_ID.test(input.runId)) throw new DurableMirrorReseedError("DURABLE_MIRROR_RESEED_RUN_ID_INVALID");
  if (config.FEATURE_EXECUTION_LOCAL_PROJECTION !== "true") {
    throw new DurableMirrorReseedError("DURABLE_MIRROR_RESEED_LOCAL_PROJECTION_DISABLED");
  }
  if (durableMirrorMode(config) !== "DUAL_WRITE_WARMUP") {
    throw new DurableMirrorReseedError("DURABLE_MIRROR_RESEED_REQUIRES_WRITE_ONLY_WARMUP");
  }
  if (!config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID) {
    throw new DurableMirrorReseedError("DURABLE_MIRROR_RESEED_WORKSPACE_NOT_CONFIGURED");
  }
}

function configuredScopes(config: ReseedConfig): DurableMirrorReseedScope[] {
  const candidates: Array<{
    environment: ProjectionEnvironment;
    enabled: "true" | "false";
    profileId: string | undefined;
    sourceProfile: DurableMirrorReseedScope["sourceProfile"];
  }> = [
    { environment: "paper", enabled: config.FEATURE_EXECUTION_CURRENT_SOURCE_PAPER,
      profileId: config.EXECUTION_EDGE_PAPER_PROFILE_ID, sourceProfile: "PAPER_BINANCE_USDM" },
    { environment: "paper", enabled: config.FEATURE_EXECUTION_CURRENT_SOURCE_PAPER_DNSE,
      profileId: config.EXECUTION_EDGE_PAPER_DNSE_PROFILE_ID, sourceProfile: "PAPER_DNSE_VNM" },
    { environment: "sandbox", enabled: config.FEATURE_EXECUTION_CURRENT_SOURCE_SANDBOX,
      profileId: config.EXECUTION_EDGE_SANDBOX_PROFILE_ID, sourceProfile: "SANDBOX_BINANCE_USDM" },
    { environment: "live", enabled: config.FEATURE_EXECUTION_CURRENT_SOURCE_LIVE,
      profileId: config.EXECUTION_EDGE_LIVE_PROFILE_ID, sourceProfile: "LIVE_BINANCE_USDM" },
  ];
  return candidates
    .filter((candidate) => candidate.enabled === "true" && Boolean(candidate.profileId))
    .map((candidate) => ({
      environment: candidate.environment,
      profileId: candidate.profileId!,
      sourceProfile: candidate.sourceProfile,
      relationKeys: profileProjectionCatalog(candidate.environment)
        .filter((binding) => binding.ladder)
        .map((binding) => `${binding.sourceId}:${binding.relation}`)
        .sort(),
    }))
    .filter((scope) => scope.relationKeys.length > 0);
}

async function rangeAggregate(
  client: Pick<PoolClient, "query">,
  table: "execution_timeseries_history" | "execution_durable_mirror_range_rows",
  workspaceId: string,
  scope: DurableMirrorReseedScope,
): Promise<DurableMirrorRangeAggregate> {
  const result = await client.query<DurableMirrorRangeAggregate>(
    `SELECT count(*)::text AS row_count,
            to_char(min(ts) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS oldest_ts,
            to_char(max(ts) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS newest_ts
       FROM ${table}
      WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3
        AND relation_key = ANY($4::text[])`,
    [workspaceId, scope.environment, scope.profileId, scope.relationKeys],
  );
  return result.rows[0] ?? { row_count: "0", oldest_ts: null, newest_ts: null };
}

async function countCursors(
  client: Pick<PoolClient, "query">,
  workspaceId: string,
  scope: DurableMirrorReseedScope,
): Promise<number> {
  const result = await client.query<{ count: string }>(
    `SELECT count(*)::text AS count
       FROM execution_profile_relation_cursors
      WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3
        AND relation_key = ANY($4::text[]) AND source_cursor IS NOT NULL`,
    [workspaceId, scope.environment, scope.profileId, scope.relationKeys],
  );
  return Number(result.rows[0]?.count ?? "0");
}

async function resetCursors(
  client: Pick<PoolClient, "query">,
  workspaceId: string,
  scope: DurableMirrorReseedScope,
): Promise<number> {
  const result = await client.query(
    `UPDATE execution_profile_relation_cursors
        SET source_cursor=NULL, pass_started_at=clock_timestamp(), updated_at=clock_timestamp()
      WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3
        AND relation_key = ANY($4::text[]) AND source_cursor IS NOT NULL`,
    [workspaceId, scope.environment, scope.profileId, scope.relationKeys],
  );
  return result.rowCount ?? 0;
}
