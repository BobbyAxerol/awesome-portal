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
      this.repository.timeSeriesHistoryCoverage(workspaceId, environment, profileId, relationKey),
    ]);
    const last = page.rows.at(-1) ?? null;
    return {
      schema_version: "portal.execution.timeseries-history.v1",
      authority: "PORTAL_SGP_HISTORY_MIRROR",
      environment,
      profile_id: profileId,
      relation_key: relationKey,
      state: coverage.rowCount === 0 ? "EMPTY" : "AVAILABLE",
      coverage: {
        row_count: coverage.rowCount,
        oldest_ts: coverage.oldestTs,
        newest_ts: coverage.newestTs,
      },
      page: {
        returned_count: page.rows.length,
        limit: query.limit,
        has_more: page.hasMore,
        next_after_ts: page.hasMore && last ? last.ts : null,
        next_after_id: page.hasMore && last ? last.rowId : null,
      },
      items: page.rows.map((row) => row.fields),
    };
  }
}

function historyQuery(raw: Record<string, unknown>) {
  const timestamp = (key: string): string | null => {
    const value = raw[key];
    if (value === undefined || value === null || value === "") return null;
    if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
      throw new HistoryReadError("N33_HISTORY_RANGE_INVALID", 400);
    }
    return value;
  };
  const from = timestamp("from");
  const to = timestamp("to");
  const afterTs = timestamp("after_ts");
  const afterId = typeof raw.after_id === "string" && raw.after_id.length > 0 ? raw.after_id : null;
  if ((afterTs === null) !== (afterId === null)) {
    throw new HistoryReadError("N33_HISTORY_CURSOR_INVALID", 400);
  }
  const rawLimit = raw.limit === undefined || raw.limit === null || raw.limit === ""
    ? DEFAULT_ROWS_PER_PAGE : Number(raw.limit);
  if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > MAXIMUM_ROWS_PER_PAGE) {
    throw new HistoryReadError("N33_HISTORY_LIMIT_INVALID", 400);
  }
  const entities = ENTITY_FILTER_FIELDS.flatMap((field) => {
    const value = raw[field];
    if (value === undefined || value === null || value === "") return [];
    if (typeof value !== "string") throw new HistoryReadError("N33_HISTORY_FILTER_INVALID", 400);
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
