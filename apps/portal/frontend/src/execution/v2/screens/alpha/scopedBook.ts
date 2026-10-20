/**
 * A SCOPED_V2 subject-records page as the page type the book already reads (`SubjectActivityPage`).
 *
 * The orders / fills tables and the Trade Replay read `SubjectActivityPage`, whatever the variant. A scoped page maps onto it
 * without borrowing anything it did not state:
 *
 * - `timeframe`, `sourceHealth`, `projection` and `resource.resolution` are `null`: the v2 body has none of them (the replay
 *   then says its interval is not published, and no "as of" is printed for the book);
 * - a record's `values` keep their own names; the one addition is the ISO instant the replay reads for placing a trade on the
 *   time axis, built ONLY from `occurred_at_ms`, else `timestamp_ms` (`submitted_at` for an order, `trade_time` for a fill).
 *   `observed_at_ms` is the Portal's observation clock and is never used as a trade or order time; the integer `created_at` /
 *   `updated_at` members state no unit and are passed on as numbers the replay's text reader ignores;
 * - a record with no such instant therefore has no time, and the replay's own audit counts it as left out (never dated by guess).
 */
import type { RelationScalar } from "../../../api/managerRelations";
import { readUtcEpochMs } from "../../../screenDataContract";
import { SUBJECT_RECORDS_V2_SCHEMA, type SubjectRecordsScoped } from "../../readers/subjectRecordsScoped";
import type { SubjectActivityPage } from "../../../api/subjectActivity";
import type { ScopedCell } from "../../readers/alphaResourceScoped";

const scalar = (cell: ScopedCell): RelationScalar => {
  switch (cell.kind) {
    case "absent": return null;
    case "text": return cell.text;
    case "decimal": return cell.exact;
    case "stamp-text": return cell.text;
    case "counter": return cell.exact;
    case "integer": return cell.value;
    case "book": return cell.book;
  }
};

export const isScopedPage = (page: SubjectActivityPage): boolean => page.schemaVersion === SUBJECT_RECORDS_V2_SCHEMA;

export function scopedPageAsActivity(page: SubjectRecordsScoped): SubjectActivityPage {
  const timeKey = page.operationId.endsWith("OrdersV1") ? "submitted_at" : "trade_time";
  return {
    schemaVersion: page.schemaVersion,
    operationId: page.operationId,
    authority: "PORTAL_SGP_RETAINED_CURRENT_WINDOW",
    sourceAuthority: "TRADING_SYSTEM_CURRENT_SOURCE",
    historySemantics: "RETAINED_PORTAL_CURRENT_WINDOW_NOT_AUTHORITATIVE_REPLAY",
    environment: page.environment,
    profileId: page.profileId,
    resource: { kind: page.resource.kind, id: page.resource.id, resolution: null },
    timeframe: null,
    sourceHealth: { availability: null, freshness: null, completeness: null, asOfMs: null },
    coverage: {
      retainedRowCount: page.coverage.retainedRowCount,
      oldestObservedAtMs: page.coverage.oldestObservedAtMs,
      newestObservedAtMs: page.coverage.newestObservedAtMs,
      sourceCompleteness: null,
      sourceWindow: null,
    },
    state: page.state,
    page: { limit: page.page.limit, maximumPageRows: page.page.maximumPageRows, returnedCount: page.page.returnedCount, hasMore: page.page.hasMore, nextCursor: page.page.nextCursor },
    records: page.records.map((record) => {
      const values: Record<string, RelationScalar> = {};
      for (const [key, cell] of Object.entries(record.values)) values[key] = scalar(cell);
      for (const key of ["occurred_at_ms", "timestamp_ms"] as const) {
        const cell = record.values[key];
        const at = cell !== undefined && cell.kind === "integer" ? readUtcEpochMs(cell.value) : null;
        if (at === null) continue;
        values[timeKey] = new Date(at).toISOString();
        break;
      }
      return { recordId: record.recordId, values };
    }),
    projection: { epochId: null, sequence: null, sourceAsOfMs: null, lastRefreshMs: null, completeness: null },
  };
}
