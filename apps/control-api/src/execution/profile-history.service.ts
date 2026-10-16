import { Inject, Injectable, Optional } from "@nestjs/common";
import { ControlApiConfig, querySigningKeys } from "../config";
import { CONTROL_API_CONFIG } from "../tokens";
import { profileProjectionCatalog } from "./profile-projection.catalog";
import {
  ExecutionProfileProjectionRepository,
  ProjectionEnvironment,
} from "./profile-projection.repository";
import { LocalRealtimeError } from "./profile-realtime.service";
import { ExecutionReadScopes, ExecutionReadScopeError, scopeAllowsQueryField,
  type ReadScopePrincipal, type AuthorizedExecutionReadScope } from "../execution-v2/read-scope";
import { redactProjectionFields } from "../execution-v2/read-projection";
import { KeysetCursorCodec } from "../query/cursor";
import { accessDigest } from "../execution-v2/access-policy";
import { HISTORY_PUBLIC_FIELDS, historyRowSchema, historyV2Schema } from "../execution-v2/history.contract";

const MAXIMUM_ROWS_PER_PAGE = 2_000;
const DEFAULT_ROWS_PER_PAGE = 500;
const MAXIMUM_RESPONSE_BYTES = 1024 * 1024;
const ENTITY_FILTER_FIELDS = Object.freeze([
  "account_id", "portfolio_id", "deployment_id", "strategy_id", "instrument_id",
]);

/**
 * Full-depth time-series read (owner directive 2026-09-03): exact rows from
 * the SGP history store, keyset-paged in source (ts, id) order, with declared
 * coverage so a partially backfilled range is a visible fact, not a guess.
 */
@Injectable()
export class ExecutionProfileHistoryService {
  constructor(
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
    @Inject(ExecutionProfileProjectionRepository) private readonly repository: ExecutionProfileProjectionRepository,
    @Optional() @Inject(ExecutionReadScopes) private readonly scopes?: ExecutionReadScopes,
  ) {}

  /** Mounted HTTP boundary. Legacy compatibility is selected only by the
   * server's sticky policy state, never by a requested response version. */
  async readAuthorized(principal: ReadScopePrincipal, environment: ProjectionEnvironment, relationKey: string,
    raw: Record<string, unknown> = {}) {
    if (!this.scopes) throw new ExecutionReadScopeError("EXECUTION_READ_AUTHORITY_UNAVAILABLE", 503);
    const { workspaceId, profileId } = this.binding(environment, relationKey);
    if (principal.workspaceId !== workspaceId) throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 404);
    const { cursor: rawCursor, ...parameters } = raw;
    if (rawCursor !== undefined && (typeof rawCursor !== "string" || !rawCursor.length || rawCursor.length > 4096))
      throw new HistoryReadError("N33_HISTORY_CURSOR_INVALID", 400);
    const query = historyQuery(parameters);
    const metadata = await this.repository.snapshotMetadata(workspaceId, environment, profileId);
    const revision = metadata?.payloadDigest ?? "UNQUALIFIED_SNAPSHOT_NOT_RECORDED";
    const scope = await this.scopes.authorize(principal, { environment, profileId }, { action: "alpha.read",
      dataset: { dataset_id: `history:${relationKey}`, source_revision: revision,
        projection_generation: metadata?.projectionEpoch ?? "UNQUALIFIED_PROJECTION_NOT_RECORDED",
        catalogue_revision: metadata?.sourceCatalogueSha256 ?? null,
        window: query.from && query.to && Date.parse(query.from) < Date.parse(query.to)
          ? { from_ms: Date.parse(query.from), to_ms: Date.parse(query.to) } : null } });
    if (scope.mode === "LEGACY_COMPATIBILITY") {
      if (rawCursor !== undefined) throw new HistoryReadError("N33_HISTORY_CURSOR_INVALID", 400);
      return this.scopes.deliver(scope, () => this.read(environment, relationKey, parameters));
    }
    if (raw.after_id !== undefined || raw.after_ts !== undefined)
      throw new HistoryReadError("N33_HISTORY_CURSOR_INVALID", 400);
    if (query.from && query.to && Date.parse(query.from) >= Date.parse(query.to))
      throw new HistoryReadError("N33_HISTORY_RANGE_INVALID", 400);
    if (!scopeAllowsQueryField(scope, "timestamp_ms"))
      throw new ExecutionReadScopeError("EXECUTION_READ_FIELD_POLICY_PENDING", 503);
    if (query.entity && !scopeAllowsQueryField(scope, query.entity.field))
      throw new HistoryReadError("N33_HISTORY_FILTER_INVALID", 400);
    const codec = new KeysetCursorCodec({ activeKeyId: this.config.QUERY_CURSOR_ACTIVE_KEY_ID,
      keys: querySigningKeys(this.config), ttlSeconds: this.config.QUERY_CURSOR_TTL_SECONDS });
    const resourceId = `execution-history:${environment}:${profileId}:${relationKey}`;
    const fingerprint = accessDigest({ scope: scope.fingerprint, from: query.from, to: query.to,
      entity: query.entity, limit: query.limit, range: "START_INCLUSIVE_END_EXCLUSIVE" });
    if (rawCursor !== undefined) {
      const [ts, rowId] = codec.decode(rawCursor as string, { resourceId, workspaceId,
        direction: "after", queryFingerprint: fingerprint, boundarySize: 2 });
      if (typeof ts !== "string" || typeof rowId !== "string" || !rowId.length || rowId.length > 512 ||
        ts.length > 35 || !/T.*Z$/.test(ts) || !Number.isFinite(Date.parse(ts)))
        throw new HistoryReadError("N33_HISTORY_CURSOR_INVALID", 400);
      query.after = { ts, rowId };
    }
    return this.scopes.deliver(scope, async () => {
      const { page, coverage } = await this.repository.scopedTimeSeriesHistory(workspaceId, environment, profileId,
        relationKey, { ...query, scope });
      if (!Number.isSafeInteger(coverage.rowCount) || coverage.rowCount < 0)
        throw new HistoryReadError("N33_HISTORY_SCOPE_RESPONSE_INVALID", 503);
      const rows = [], items = [];
      let remaining = MAXIMUM_RESPONSE_BYTES - 16_384;
      for (const row of page.rows) {
        const item = scopedHistoryFields(scope, row);
        const bytes = Buffer.byteLength(JSON.stringify(item), "utf8") + 1;
        if (bytes > remaining) break;
        rows.push(row); items.push(item); remaining -= bytes;
      }
      if (page.rows.length && !rows.length) throw new HistoryReadError("N33_HISTORY_ROW_TOO_LARGE", 503);
      const hasMore = page.hasMore || rows.length < page.rows.length, last = rows.at(-1);
      const response = {
        schema_version: "portal.execution.timeseries-history.v2" as const,
        authority: "PORTAL_SGP_HISTORY_MIRROR" as const, environment, profile_id: profileId, relation_key: relationKey,
        state: coverage.rowCount === 0 ? "EMPTY" as const : "AVAILABLE" as const,
        completeness: "PARTIAL" as const, reason_code: "N33_RETAINED_RANGE_NOT_AUTHORITATIVE_HISTORY" as const,
        read_scope: { visibility: "SCOPED" as const, coverage: "AUTHORIZED_ONLY" as const, policy_revision: scope.policyRevision },
        coverage: { basis: "EXACT_AUTHORIZED_RETAINED_RANGE" as const, row_count: coverage.rowCount,
          oldest_ms: coverage.oldestTs === null ? null : Date.parse(coverage.oldestTs),
          newest_ms: coverage.newestTs === null ? null : Date.parse(coverage.newestTs),
          range: "START_INCLUSIVE_END_EXCLUSIVE" as const },
        page: { returned_count: rows.length, limit: query.limit, maximum_response_bytes: MAXIMUM_RESPONSE_BYTES,
          has_more: hasMore, next_cursor: hasMore && last ? codec.encode({ resource_id: resourceId, workspace_id: workspaceId,
            direction: "after", query_fingerprint: fingerprint, boundary: [last.ts, last.rowId] }) : null },
        items,
      };
      // Storage revision is not an entitlement. Refuse a source cutover while
      // the flight was assembling rows; access.deliver separately fences policy.
      const current = await this.repository.snapshotMetadata(workspaceId, environment, profileId);
      if (!current || current.payloadDigest !== revision || current.projectionEpoch !== metadata?.projectionEpoch ||
          current.sourceCatalogueSha256 !== metadata?.sourceCatalogueSha256)
        throw new ExecutionReadScopeError("EXECUTION_READ_ACCESS_CHANGED", 409);
      const validated = historyV2Schema.safeParse(response);
      if (!validated.success) throw new HistoryReadError("N33_HISTORY_SCOPE_RESPONSE_INVALID", 503);
      return validated.data;
    });
  }

  private binding(environment: ProjectionEnvironment, relationKey: string) {
    const binding = profileProjectionCatalog(environment)
      .find(item => `${item.sourceId}:${item.relation}` === relationKey && item.ladder);
    if (!binding) throw new HistoryReadError("N33_HISTORY_RELATION_NOT_ACCEPTED", 404);
    const workspaceId = this.config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID;
    if (!workspaceId) throw new HistoryReadError("N33_PROJECTION_WORKSPACE_NOT_CONFIGURED", 503);
    const profileId = environment === "paper" ? this.config.EXECUTION_EDGE_PAPER_PROFILE_ID
      : environment === "sandbox" ? this.config.EXECUTION_EDGE_SANDBOX_PROFILE_ID : this.config.EXECUTION_EDGE_LIVE_PROFILE_ID;
    if (!profileId) throw new HistoryReadError("N33_PROFILE_NOT_CONFIGURED", 503);
    return { workspaceId, profileId };
  }

  async read(
    environment: ProjectionEnvironment,
    relationKey: string,
    raw: Record<string, unknown> = {},
  ) {
    const { workspaceId, profileId } = this.binding(environment, relationKey);
    const query = historyQuery(raw);
    const [page, coverage] = await Promise.all([
      this.repository.timeSeriesHistory(workspaceId, environment, profileId, relationKey, query),
      this.repository.timeSeriesHistoryCoverage(workspaceId, environment, profileId, relationKey, query.entity, query),
    ]);
    // Keep the legacy row limit, but bound serialized bytes too. Reserve the
    // envelope budget; the next keyset starts after the last row actually sent.
    let remaining = MAXIMUM_RESPONSE_BYTES - 4096;
    const rows = [];
    for (const row of page.rows) {
      const bytes = Buffer.byteLength(JSON.stringify(row.fields), "utf8") + 1;
      if (bytes > remaining) break;
      rows.push(row); remaining -= bytes;
    }
    if (page.rows.length && !rows.length) throw new HistoryReadError("N33_HISTORY_ROW_TOO_LARGE", 503);
    const hasMore = page.hasMore || rows.length < page.rows.length;
    const last = rows.at(-1) ?? null;
    return {
      schema_version: "portal.execution.timeseries-history.v1",
      authority: "PORTAL_SGP_HISTORY_MIRROR",
      environment,
      profile_id: profileId,
      relation_key: relationKey,
      state: coverage.rowCount === 0 ? "EMPTY" : "AVAILABLE",
      completeness: "PARTIAL",
      reason_code: "N33_RETAINED_RANGE_NOT_AUTHORITATIVE_HISTORY",
      coverage: {
        basis: "EXACT_REQUESTED_RETAINED_RANGE",
        row_count: coverage.rowCount,
        oldest_ts: coverage.oldestTs,
        newest_ts: coverage.newestTs,
      },
      page: {
        returned_count: rows.length,
        limit: query.limit,
        maximum_response_bytes: MAXIMUM_RESPONSE_BYTES,
        has_more: hasMore,
        next_after_ts: hasMore && last ? last.ts : null,
        next_after_id: hasMore && last ? last.rowId : null,
      },
      items: rows.map((row) => row.fields),
    };
  }
}

function historyQuery(raw: Record<string, unknown>) {
  const allowed = new Set(["from", "to", "after_ts", "after_id", "limit", ...ENTITY_FILTER_FIELDS]);
  if (Object.keys(raw).some((key) => !allowed.has(key))) throw new HistoryReadError("N33_HISTORY_QUERY_INVALID", 400);
  const timestamp = (key: string): string | null => {
    const value = raw[key];
    if (value === undefined || value === null || value === "") return null;
    if (typeof value !== "string" || value.length > 35 || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) || Number.isNaN(Date.parse(value))) {
      throw new HistoryReadError("N33_HISTORY_RANGE_INVALID", 400);
    }
    return value;
  };
  const from = timestamp("from");
  const to = timestamp("to");
  const afterTs = timestamp("after_ts");
  if (raw.after_id !== undefined && raw.after_id !== null && typeof raw.after_id !== "string") {
    throw new HistoryReadError("N33_HISTORY_CURSOR_INVALID", 400);
  }
  const afterId = typeof raw.after_id === "string" && raw.after_id.length > 0 ? raw.after_id : null;
  if (afterId && afterId.length > 512) throw new HistoryReadError("N33_HISTORY_CURSOR_INVALID", 400);
  if (from && to && Date.parse(from) > Date.parse(to)) throw new HistoryReadError("N33_HISTORY_RANGE_INVALID", 400);
  if ((afterTs === null) !== (afterId === null)) {
    throw new HistoryReadError("N33_HISTORY_CURSOR_INVALID", 400);
  }
  if (raw.limit !== undefined && raw.limit !== null && typeof raw.limit !== "string" && typeof raw.limit !== "number") {
    throw new HistoryReadError("N33_HISTORY_LIMIT_INVALID", 400);
  }
  const rawLimit = raw.limit === undefined || raw.limit === null || raw.limit === ""
    ? DEFAULT_ROWS_PER_PAGE : Number(raw.limit);
  if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > MAXIMUM_ROWS_PER_PAGE) {
    throw new HistoryReadError("N33_HISTORY_LIMIT_INVALID", 400);
  }
  const entities = ENTITY_FILTER_FIELDS.flatMap((field) => {
    const value = raw[field];
    if (value === undefined || value === null || value === "") return [];
    if (typeof value !== "string" || value.length > 192) throw new HistoryReadError("N33_HISTORY_FILTER_INVALID", 400);
    return [{ field, value }];
  });
  if (entities.length > 1) throw new HistoryReadError("N33_HISTORY_FILTER_INVALID", 400);
  return {
    from, to,
    after: afterTs && afterId ? { ts: afterTs, rowId: afterId } : null,
    entity: entities[0] ?? null,
    limit: rawLimit,
  };
}

export class HistoryReadError extends LocalRealtimeError {}

function scopedHistoryFields(scope: AuthorizedExecutionReadScope,
  row: { ts: string; fields: Record<string, unknown> }) {
  const timestamp = Date.parse(row.ts);
  if (!Number.isSafeInteger(timestamp) || timestamp < 0)
    throw new HistoryReadError("N33_HISTORY_SCOPE_RESPONSE_INVALID", 503);
  const redacted = redactProjectionFields(scope, { ...row.fields, timestamp_ms: timestamp });
  const projected = Object.fromEntries(Object.entries(redacted).filter(([key]) => HISTORY_PUBLIC_FIELDS.has(key)));
  const parsed = historyRowSchema.safeParse(projected);
  if (!parsed.success) throw new HistoryReadError("N33_HISTORY_SCOPE_RESPONSE_INVALID", 503);
  return parsed.data;
}
