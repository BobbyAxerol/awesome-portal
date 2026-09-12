import { Inject, Injectable } from "@nestjs/common";
import { ControlApiConfig } from "../config";
import { CONTROL_API_CONFIG } from "../tokens";
import { profileProjectionCatalog } from "./profile-projection.catalog";
import {
  ExecutionProfileProjectionRepository,
  ProjectionEnvironment,
} from "./profile-projection.repository";
import { LocalRealtimeError } from "./profile-realtime.service";

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
  ) {}

  async read(
    environment: ProjectionEnvironment,
    relationKey: string,
    raw: Record<string, unknown> = {},
  ) {
    const binding = profileProjectionCatalog(environment)
      .find((item) => `${item.sourceId}:${item.relation}` === relationKey && item.ladder);
    if (!binding) throw new HistoryReadError("N33_HISTORY_RELATION_NOT_ACCEPTED", 404);
    const workspaceId = this.config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID;
    if (!workspaceId) throw new HistoryReadError("N33_PROJECTION_WORKSPACE_NOT_CONFIGURED", 503);
    const profileId = environment === "paper" ? this.config.EXECUTION_EDGE_PAPER_PROFILE_ID
      : environment === "sandbox" ? this.config.EXECUTION_EDGE_SANDBOX_PROFILE_ID
        : this.config.EXECUTION_EDGE_LIVE_PROFILE_ID;
    if (!profileId) throw new HistoryReadError("N33_PROFILE_NOT_CONFIGURED", 503);
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
