/**
 * BR-EX-81 exact subject activity BFF.
 *
 * Product screens ask for one of four named operations only: alpha/account ×
 * orders/fills.  The Portal owns cursor signing and reads its durable retained
 * current-source window; neither a relation selector nor an Edge cursor ever
 * crosses the browser boundary.
 */
import type { RelationEnvironment, RelationScalar } from "./managerRelations";

export type SubjectActivityKind = "alpha" | "account";
export type SubjectActivityRelation = "orders" | "fills";
export type StrategyTimeframeProvenance = "PUBLISHED_SOURCE" | "DERIVED_STRATEGY_ID_SUFFIX" | "UNAVAILABLE";

export interface SubjectActivityQuery {
  environment: RelationEnvironment;
  subjectKind: SubjectActivityKind;
  subjectId: string;
  relation: SubjectActivityRelation;
  limit?: number;
  /** Opaque Portal continuation; it is only echoed to this exact operation. */
  after?: string | null;
}

export interface SubjectActivityPage {
  schemaVersion: string;
  operationId: string | null;
  authority: string | null;
  sourceAuthority: string | null;
  historySemantics: string | null;
  environment: RelationEnvironment | null;
  profileId: string | null;
  resource: { kind: SubjectActivityKind | null; id: string | null; resolution: string | null };
  timeframe: { value: "1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1d" | null; provenance: StrategyTimeframeProvenance; sourceField: string | null } | null;
  sourceHealth: { availability: string | null; freshness: string | null; completeness: string | null; asOfMs: number | null };
  coverage: { retainedRowCount: number | null; oldestObservedAtMs: number | null; newestObservedAtMs: number | null; sourceCompleteness: string | null; sourceWindow: string | null };
  state: string;
  page: { limit: number | null; returnedCount: number | null; hasMore: boolean; nextCursor: string | null };
  records: readonly { recordId: string; values: Record<string, RelationScalar> }[];
  projection: { epochId: string | null; sequence: number | null; sourceAsOfMs: number | null; lastRefreshMs: number | null; completeness: string | null };
}

const obj = (value: unknown): Record<string, unknown> => (typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {});
const str = (value: unknown): string | null => typeof value === "string" && value.length > 0 ? value : null;
const int = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;
const env = (value: unknown): RelationEnvironment | null => value === "paper" || value === "sandbox" || value === "live" ? value : null;
const kind = (value: unknown): SubjectActivityKind | null => value === "alpha" || value === "account" ? value : null;
const interval = (value: unknown): SubjectActivityPage["timeframe"] extends { value: infer T } | null ? T : never => {
  const v = str(value)?.toLowerCase() ?? null;
  return v === "1m" || v === "5m" || v === "15m" || v === "30m" || v === "1h" || v === "4h" || v === "1d" ? v as never : null as never;
};

export function readSubjectActivity(raw: unknown): SubjectActivityPage | null {
  const root = obj(raw);
  const schemaVersion = str(root.schema_version);
  if (!schemaVersion) return null;
  const resource = obj(root.resource);
  const timeframe = obj(root.timeframe);
  const sourceHealth = obj(root.source_health);
  const coverage = obj(root.coverage);
  const page = obj(root.page);
  const projection = obj(root.projection);
  const timeframeValue = interval(timeframe.value);
  const provenance = str(timeframe.provenance);
  const records = (Array.isArray(root.records) ? root.records : []).flatMap((candidate) => {
    const row = obj(candidate);
    const recordId = str(row.record_id);
    if (!recordId) return [];
    const values: Record<string, RelationScalar> = {};
    for (const [key, value] of Object.entries(obj(row.values))) {
      if (value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) values[key] = value;
    }
    return [{ recordId, values }];
  });
  return {
    schemaVersion,
    operationId: str(root.logical_operation_id),
    authority: str(root.authority),
    sourceAuthority: str(root.source_authority),
    historySemantics: str(root.history_semantics),
    environment: env(root.environment),
    profileId: str(root.profile_id),
    resource: { kind: kind(resource.kind), id: str(resource.id), resolution: str(resource.resolution) },
    timeframe: provenance === "PUBLISHED_SOURCE" || provenance === "DERIVED_STRATEGY_ID_SUFFIX" || provenance === "UNAVAILABLE"
      ? { value: timeframeValue, provenance, sourceField: str(timeframe.source_field) }
      : null,
    sourceHealth: { availability: str(sourceHealth.availability), freshness: str(sourceHealth.freshness), completeness: str(sourceHealth.completeness), asOfMs: int(sourceHealth.as_of_ms) },
    coverage: { retainedRowCount: int(coverage.retained_row_count), oldestObservedAtMs: int(coverage.oldest_observed_at_ms), newestObservedAtMs: int(coverage.newest_observed_at_ms), sourceCompleteness: str(coverage.source_completeness), sourceWindow: str(coverage.source_window) },
    state: str(root.state) ?? "UNAVAILABLE",
    page: { limit: int(page.limit), returnedCount: int(page.returned_count), hasMore: page.has_more === true, nextCursor: str(page.next_cursor) },
    records,
    projection: { epochId: str(projection.epoch_id), sequence: int(projection.sequence), sourceAsOfMs: int(projection.source_as_of_ms), lastRefreshMs: int(projection.last_successful_refresh_at_ms), completeness: str(projection.completeness) },
  };
}

export function subjectActivityPath(query: SubjectActivityQuery): string {
  const prefix = query.subjectKind === "alpha" ? "alphas" : "accounts";
  const params = new URLSearchParams({ environment: query.environment, limit: String(Math.max(1, Math.min(500, Math.round(query.limit ?? 200)))) });
  if (query.after) params.set("after", query.after);
  return `/resources/${prefix}/${encodeURIComponent(query.subjectId)}/${query.relation}?${params.toString()}`;
}
