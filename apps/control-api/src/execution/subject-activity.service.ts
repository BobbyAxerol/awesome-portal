import { Inject, Injectable } from "@nestjs/common";
import { ControlApiConfig, querySigningKeys } from "../config";
import { KeysetCursorCodec, QueryContractError, queryFingerprint } from "../query";
import { CONTROL_API_CONFIG } from "../tokens";
import {
  ExecutionProfileProjectionRepository,
  type ProfileProjectionSnapshot,
  type ProjectionEnvironment,
  type ProjectionRelation,
  type ProjectionScalar,
} from "./profile-projection.repository";

const SUBJECT_ID = /^[A-Za-z0-9._:@-]{1,191}$/;
const MAXIMUM_PAGE_ROWS = 500;
const DEFAULT_PAGE_ROWS = 200;
const TIMEFRAMES = new Set(["1m", "5m", "15m", "30m", "1h", "4h", "1d"]);

export type SubjectActivityKind = "alpha" | "account";
export type SubjectActivityRelation = "orders" | "fills";

export interface SubjectActivityPrincipal {
  readonly workspaceId: string;
  /** Cursor context is user-bound even inside the same Portal workspace. */
  readonly userId: string;
}

export interface SubjectActivityRequest {
  readonly environment: ProjectionEnvironment;
  readonly subjectKind: SubjectActivityKind;
  readonly subjectId: string;
  readonly relation: SubjectActivityRelation;
  readonly limit?: number;
  /** Portal-signed continuation; never an Edge/Manager cursor. */
  readonly after?: string | null;
}

export class SubjectActivityError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code);
  }
}

export interface StrategyTimeframe {
  readonly value: "1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1d" | null;
  readonly provenance: "PUBLISHED_SOURCE" | "DERIVED_STRATEGY_ID_SUFFIX" | "UNAVAILABLE";
  readonly source_field: "timeframe" | "bar_interval" | "interval" | "resolution" | null;
}

/**
 * BR-EX-81 subject reads over the Portal-owned retained-current-window mirror.
 *
 * This is deliberately not a generic relation browser.  It exposes only the
 * two product operations the rich Trade Replay / Blotter panels need and
 * preserves their exact retained coverage.  No browser sees an Edge cursor,
 * a Manager selector, a source host, or an upstream credential.
 */
@Injectable()
export class ExecutionSubjectActivityService {
  private readonly cursors: KeysetCursorCodec;

  constructor(
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
    @Inject(ExecutionProfileProjectionRepository) private readonly repository: ExecutionProfileProjectionRepository,
  ) {
    this.cursors = new KeysetCursorCodec({
      activeKeyId: config.QUERY_CURSOR_ACTIVE_KEY_ID,
      keys: querySigningKeys(config),
      ttlSeconds: config.QUERY_CURSOR_TTL_SECONDS,
    });
  }

  async read(
    principal: SubjectActivityPrincipal,
    request: SubjectActivityRequest,
  ): Promise<Record<string, unknown>> {
    validateRequest(request);
    this.assertEnabled(request.environment);
    const workspaceId = this.config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID;
    if (!workspaceId || principal.workspaceId !== workspaceId) {
      throw new SubjectActivityError("EDS12_SUBJECT_ACTIVITY_WORKSPACE_NOT_FOUND", 404);
    }
    const profileId = profileIdFor(this.config, request.environment);
    if (!profileId) throw new SubjectActivityError("EDS12_SUBJECT_ACTIVITY_PROFILE_NOT_CONFIGURED", 503);
    const snapshot = await this.repository.snapshot(workspaceId, request.environment, profileId);
    if (!snapshot) throw new SubjectActivityError("EDS12_SUBJECT_ACTIVITY_PROJECTION_NOT_READY", 503);
    if (Date.now() - snapshot.lastSuccessfulRefreshAt.valueOf() > this.config.EXECUTION_LOCAL_PROJECTION_STALE_CEILING_MS) {
      throw new SubjectActivityError("EDS12_SUBJECT_ACTIVITY_PROJECTION_STALE", 503);
    }

    const subject = resolveSubject(snapshot, request.subjectKind, request.subjectId);
    const relation = relationSnapshot(snapshot, request.relation);
    const limit = request.limit ?? DEFAULT_PAGE_ROWS;
    const cursor = this.decodeCursor(principal, request, snapshot, profileId, limit);
    const entity = { field: subject.field, value: subject.value };

    if (!relation || relation.availability !== "AVAILABLE") {
      return unavailableResponse(request, profileId, subject, relation, snapshot, limit);
    }

    const [page, coverage] = await Promise.all([
      this.repository.timeSeriesHistory(workspaceId, request.environment, profileId, relationKey(request.relation), {
        entity,
        after: cursor,
        limit,
        order: "DESC",
      }),
      this.repository.timeSeriesHistoryCoverage(workspaceId, request.environment, profileId, relationKey(request.relation), entity),
    ]);
    const last = page.rows.at(-1) ?? null;
    const nextCursor = page.hasMore && last
      ? this.encodeCursor(principal, request, snapshot, profileId, limit, last.ts, last.rowId)
      : null;
    const state = coverage.rowCount === 0
      ? "AUTHORITATIVE_EMPTY"
      : relation.completeness === "COMPLETE" ? "AVAILABLE" : "PARTIAL";

    return {
      schema_version: "portal.execution.subject-records.v1",
      logical_operation_id: operationId(request.subjectKind, request.relation),
      authority: "PORTAL_SGP_RETAINED_CURRENT_WINDOW",
      source_authority: "TRADING_SYSTEM_CURRENT_SOURCE",
      history_semantics: "RETAINED_PORTAL_CURRENT_WINDOW_NOT_AUTHORITATIVE_REPLAY",
      environment: request.environment,
      profile_id: profileId,
      resource: {
        kind: request.subjectKind,
        id: request.subjectId,
        resolution: subject.resolution,
      },
      timeframe: subject.timeframe,
      source_health: sourceHealth(relation, snapshot),
      coverage: {
        retained_row_count: coverage.rowCount,
        oldest_observed_at_ms: epochMs(coverage.oldestTs),
        newest_observed_at_ms: epochMs(coverage.newestTs),
        source_completeness: relation.completeness,
        source_window: "CURRENT_SOURCE_CURSOR_TRAVERSAL",
      },
      state,
      page: {
        limit,
        returned_count: page.rows.length,
        has_more: page.hasMore,
        next_cursor: nextCursor,
      },
      records: page.rows.map((row) => ({ record_id: row.rowId, values: row.fields })),
      projection: projectionMetadata(snapshot),
    };
  }

  private assertEnabled(environment: ProjectionEnvironment): void {
    if (
      this.config.FEATURE_EXECUTION_LOCAL_PROJECTION !== "true" ||
      this.config.FEATURE_EXECUTION_DURABLE_MIRROR !== "true" ||
      this.config.FEATURE_EXECUTION_DURABLE_MIRROR_READS !== "true" ||
      !profileEnabled(this.config, environment)
    ) {
      throw new SubjectActivityError("EDS12_SUBJECT_ACTIVITY_NOT_ACTIVATED", 404);
    }
  }

  private decodeCursor(
    principal: SubjectActivityPrincipal,
    request: SubjectActivityRequest,
    snapshot: ProfileProjectionSnapshot,
    profileId: string,
    limit: number,
  ): { ts: string; rowId: string } | null {
    if (!request.after) return null;
    const resourceId = cursorResourceId(principal, request, profileId);
    try {
      const [payloadDigest, ts, rowId] = this.cursors.decode(request.after, {
        resourceId,
        workspaceId: principal.workspaceId,
        direction: "after",
        queryFingerprint: cursorFingerprint(resourceId, limit),
        boundarySize: 3,
      });
      if (payloadDigest !== snapshot.payloadDigest) {
        throw new SubjectActivityError("EDS12_SUBJECT_ACTIVITY_CURSOR_STALE", 409);
      }
      if (typeof ts !== "string" || Number.isNaN(Date.parse(ts)) || typeof rowId !== "string" || rowId.length === 0) {
        throw new SubjectActivityError("EDS12_SUBJECT_ACTIVITY_CURSOR_INVALID", 400);
      }
      return { ts, rowId };
    } catch (error) {
      if (error instanceof SubjectActivityError) throw error;
      if (error instanceof QueryContractError) {
        throw new SubjectActivityError(`EDS12_SUBJECT_ACTIVITY_${error.code}`, error.status);
      }
      throw error;
    }
  }

  private encodeCursor(
    principal: SubjectActivityPrincipal,
    request: SubjectActivityRequest,
    snapshot: ProfileProjectionSnapshot,
    profileId: string,
    limit: number,
    ts: string,
    rowId: string,
  ): string {
    const resourceId = cursorResourceId(principal, request, profileId);
    return this.cursors.encode({
      resource_id: resourceId,
      workspace_id: principal.workspaceId,
      direction: "after",
      query_fingerprint: cursorFingerprint(resourceId, limit),
      boundary: [snapshot.payloadDigest, ts, rowId],
    });
  }
}

function validateRequest(request: SubjectActivityRequest): void {
  if (!SUBJECT_ID.test(request.subjectId)) throw new SubjectActivityError("EDS12_SUBJECT_ACTIVITY_IDENTIFIER_INVALID", 400);
  const limit = request.limit ?? DEFAULT_PAGE_ROWS;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAXIMUM_PAGE_ROWS) {
    throw new SubjectActivityError("EDS12_SUBJECT_ACTIVITY_LIMIT_INVALID", 400);
  }
}

function profileIdFor(config: ControlApiConfig, environment: ProjectionEnvironment): string | undefined {
  return environment === "paper" ? config.EXECUTION_EDGE_PAPER_PROFILE_ID
    : environment === "sandbox" ? config.EXECUTION_EDGE_SANDBOX_PROFILE_ID
      : config.EXECUTION_EDGE_LIVE_PROFILE_ID;
}

function profileEnabled(config: ControlApiConfig, environment: ProjectionEnvironment): boolean {
  return environment === "paper" ? config.FEATURE_EXECUTION_CURRENT_SOURCE_PAPER === "true"
    : environment === "sandbox" ? config.FEATURE_EXECUTION_CURRENT_SOURCE_SANDBOX === "true"
      : config.FEATURE_EXECUTION_CURRENT_SOURCE_LIVE === "true";
}

function relationKey(relation: SubjectActivityRelation): string {
  return relation === "orders" ? "manager.orders:orders" : "manager.fills:fills";
}

function operationId(kind: SubjectActivityKind, relation: SubjectActivityRelation): string {
  return `execution${kind === "alpha" ? "Alpha" : "Account"}${relation === "orders" ? "Orders" : "Fills"}V1`;
}

function relationSnapshot(snapshot: ProfileProjectionSnapshot, relation: SubjectActivityRelation): ProjectionRelation | null {
  return snapshot.document.relations[relationKey(relation)] ?? null;
}

function resolveSubject(
  snapshot: ProfileProjectionSnapshot,
  kind: SubjectActivityKind,
  subjectId: string,
): {
  field: "strategy_id" | "account_id";
  value: string;
  resolution: "EXACT_ACCOUNT_ID" | "PUBLISHED_STRATEGY_ID" | "PUBLISHED_ALPHA_ID" | "DERIVED_REQUESTED_STRATEGY_ID";
  timeframe: StrategyTimeframe;
} {
  if (kind === "account") {
    return {
      field: "account_id",
      value: subjectId,
      resolution: "EXACT_ACCOUNT_ID",
      timeframe: { value: null, provenance: "UNAVAILABLE", source_field: null },
    };
  }
  const strategies = rows(snapshot, "manager.strategies:strategies");
  const exact = strategies.find((row) => text(row.strategy_id) === subjectId);
  const alpha = exact ?? strategies.find((row) => text(row.alpha_id) === subjectId || text(row.id) === subjectId);
  const strategyId = text(alpha?.strategy_id) ?? subjectId;
  const deployments = rows(snapshot, "manager.deployments:strategy_deployments")
    .filter((row) => text(row.strategy_id) === strategyId);
  return {
    field: "strategy_id",
    value: strategyId,
    resolution: exact ? "PUBLISHED_STRATEGY_ID" : alpha ? "PUBLISHED_ALPHA_ID" : "DERIVED_REQUESTED_STRATEGY_ID",
    timeframe: strategyTimeframe([...strategies.filter((row) => text(row.strategy_id) === strategyId), ...deployments], strategyId),
  };
}

/** BR-EX-80: source vocabulary wins; otherwise derive only the known id suffix. */
export function strategyTimeframe(
  sourceRows: readonly Record<string, ProjectionScalar>[],
  strategyId: string,
): StrategyTimeframe {
  for (const field of ["timeframe", "bar_interval", "interval", "resolution"] as const) {
    for (const row of sourceRows) {
      const value = normalizedTimeframe(row[field]);
      if (value) return { value, provenance: "PUBLISHED_SOURCE", source_field: field };
    }
  }
  const suffix = /(?:1d|4h|1h|30m|15m|5m|1m)$/i.exec(strategyId)?.[0]?.toLowerCase() ?? null;
  if (suffix && TIMEFRAMES.has(suffix)) {
    return { value: suffix as StrategyTimeframe["value"], provenance: "DERIVED_STRATEGY_ID_SUFFIX", source_field: null };
  }
  return { value: null, provenance: "UNAVAILABLE", source_field: null };
}

function normalizedTimeframe(value: ProjectionScalar | undefined): StrategyTimeframe["value"] {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return TIMEFRAMES.has(normalized) ? normalized as StrategyTimeframe["value"] : null;
}

function rows(snapshot: ProfileProjectionSnapshot, key: string): Record<string, ProjectionScalar>[] {
  return (snapshot.document.relations[key]?.items ?? []).map((row) => row.fields);
}

function text(value: ProjectionScalar | undefined): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function sourceHealth(relation: ProjectionRelation, snapshot: ProfileProjectionSnapshot) {
  return {
    availability: relation.availability,
    freshness: relation.freshness,
    completeness: relation.completeness,
    as_of_ms: epochMs(relation.as_of) ?? epochMs(snapshot.sourceAsOf?.toISOString() ?? null),
  };
}

function projectionMetadata(snapshot: ProfileProjectionSnapshot) {
  return {
    epoch_id: snapshot.projectionEpoch,
    sequence: snapshot.projectionSequence,
    source_as_of_ms: epochMs(snapshot.sourceAsOf?.toISOString() ?? null),
    received_at_ms: snapshot.receivedAt.valueOf(),
    last_successful_refresh_at_ms: snapshot.lastSuccessfulRefreshAt.valueOf(),
  };
}

function unavailableResponse(
  request: SubjectActivityRequest,
  profileId: string,
  subject: ReturnType<typeof resolveSubject>,
  relation: ProjectionRelation | null,
  snapshot: ProfileProjectionSnapshot,
  limit: number,
) {
  return {
    schema_version: "portal.execution.subject-records.v1",
    logical_operation_id: operationId(request.subjectKind, request.relation),
    authority: "PORTAL_SGP_RETAINED_CURRENT_WINDOW",
    source_authority: "TRADING_SYSTEM_CURRENT_SOURCE",
    history_semantics: "RETAINED_PORTAL_CURRENT_WINDOW_NOT_AUTHORITATIVE_REPLAY",
    environment: request.environment,
    profile_id: profileId,
    resource: { kind: request.subjectKind, id: request.subjectId, resolution: subject.resolution },
    timeframe: subject.timeframe,
    source_health: relation ? sourceHealth(relation, snapshot) : {
      availability: "UNAVAILABLE", freshness: "UNKNOWN", completeness: "UNKNOWN", as_of_ms: null,
    },
    coverage: {
      retained_row_count: 0,
      oldest_observed_at_ms: null,
      newest_observed_at_ms: null,
      source_completeness: relation?.completeness ?? "UNKNOWN",
      source_window: "CURRENT_SOURCE_CURSOR_TRAVERSAL",
    },
    state: "UNAVAILABLE",
    page: { limit, returned_count: 0, has_more: false, next_cursor: null },
    records: [],
    projection: projectionMetadata(snapshot),
  };
}

function epochMs(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function cursorResourceId(principal: SubjectActivityPrincipal, request: SubjectActivityRequest, profileId: string): string {
  return `execution-subject-records:${principal.userId}:${request.environment}:${profileId}:${request.subjectKind}:${request.subjectId}:${request.relation}`;
}

function cursorFingerprint(resourceId: string, limit: number): string {
  return queryFingerprint({
    resourceId,
    limit,
    filters: [{ field: "subject", op: "eq", value: resourceId, values: [resourceId] }],
    sort: [{ field: "observed_at", direction: "desc" }, { field: "record_id", direction: "desc" }],
  });
}
