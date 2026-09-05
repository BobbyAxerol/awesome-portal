import { panelEnvelope, type PanelEnvelope, utcEpochMs } from "./contract-authority";
import type { ManagerPage } from "../paper-read/manager-records";

export type StageCapabilityState = "AVAILABLE" | "EMPTY" | "PARTIAL" | "UNAVAILABLE";

export interface StageRelation {
  readonly key: string;
  readonly page: ManagerPage | null;
  readonly state: StageCapabilityState;
  readonly reasonCode: string | null;
}

const TIMESTAMP_KEYS = new Set([
  "ts", "created_at", "updated_at", "opened_at", "closed_at", "mark_price_at",
  "started_at", "completed_at", "submitted_at", "trade_time", "synced_at", "accepted_at",
  "dispatched_at", "acknowledged_at", "terminal_at", "resolved_at",
]);

/**
 * EDS-03 is an additive wire migration for frozen product screens.  The
 * canonical timestamp is the added `*_ms` value; keeping the original source
 * key lets existing specialised screen DTOs remain backwards-compatible while
 * their containers move to the generated UTC reader.
 */
export function wireStageValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(wireStageValue);
  if (!isRecord(value)) return value;
  const output: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    output[key] = wireStageValue(nested);
    if (TIMESTAMP_KEYS.has(key) && typeof nested === "string") {
      const milliseconds = Date.parse(nested);
      if (Number.isSafeInteger(milliseconds)) output[`${key}_ms`] = utcEpochMs(milliseconds);
    }
  }
  return output;
}

export function wireStageRows(rows: readonly Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map((row) => wireStageValue(row) as Record<string, unknown>);
}

export function latestStageAsOfMs(relations: readonly StageRelation[]): number | null {
  const values = relations.flatMap((relation) => {
    const raw = relation.page?.asOf;
    if (!raw) return [];
    const milliseconds = Date.parse(raw);
    return Number.isSafeInteger(milliseconds) ? [milliseconds] : [];
  });
  return values.length === 0 ? null : utcEpochMs(Math.max(...values));
}

export function stagePanels(relations: readonly StageRelation[], readAtMs: number): Record<string, PanelEnvelope<unknown>> {
  return Object.fromEntries(relations.map((relation) => [relation.key, stagePanel(relation, readAtMs)]));
}

export function stagePanel(relation: StageRelation, readAtMs: number): PanelEnvelope<unknown> {
  const sourceAsOfMs = epochMs(relation.page?.asOf ?? null);
  const rows = relation.page ? wireStageRows(relation.page.items as Record<string, unknown>[]) : [];
  const state = relation.state === "UNAVAILABLE" ? "UNAVAILABLE" as const
    : relation.state === "EMPTY" ? "EMPTY" as const
      : relation.state === "PARTIAL" ? "PARTIAL" as const
        : relation.page?.freshness === "STALE" ? "STALE" as const
          : rows.length === 0 ? "EMPTY" as const : "READY" as const;
  const data = state === "READY" || state === "PARTIAL" || state === "STALE" ? { rows } : null;
  return panelEnvelope({
    state,
    data,
    clocks: {
      event_time_ms: sourceAsOfMs,
      source_published_at_ms: sourceAsOfMs,
      received_at_ms: sourceAsOfMs,
      ingested_at_ms: sourceAsOfMs,
      processed_at_ms: sourceAsOfMs,
      as_of_ms: sourceAsOfMs,
      read_at_ms: utcEpochMs(readAtMs),
    },
    coverage: {
      from_ms: null,
      to_ms: sourceAsOfMs,
      source_total: relation.page?.exactTotal === null || relation.page?.exactTotal === undefined
        ? null : String(relation.page.exactTotal),
      filtered_total: relation.page?.filteredTotal === null || relation.page?.filteredTotal === undefined
        ? null : String(relation.page.filteredTotal),
      returned_count: rows.length,
      truncated: relation.page?.nextCursor !== null && relation.page?.nextCursor !== undefined,
      downsampled: false,
      has_more: relation.page?.nextCursor !== null && relation.page?.nextCursor !== undefined,
      next_cursor: relation.page?.nextCursor ?? null,
      gaps: relation.state === "PARTIAL" && relation.reasonCode
        ? sourceAsOfMs === null ? [] : [{ from_ms: sourceAsOfMs, to_ms: sourceAsOfMs, reason_code: relation.reasonCode }]
        : [],
    },
    source_history_semantics: historySemantics(relation.key),
    formula: null,
    reason_code: relation.reasonCode,
    retryable: relation.state === "UNAVAILABLE" && relation.reasonCode !== "EDS03_DEPLOYMENT_NOT_FOUND",
  });
}

function historySemantics(key: string): string {
  return ["performance", "account_equity", "portfolio_equity"].includes(key)
    ? "RETAINED_RANGE_OR_CURRENT_WINDOW"
    : "CURRENT_STATE_ONLY";
}

function epochMs(value: string | null): ReturnType<typeof utcEpochMs> | null {
  if (!value) return null;
  const milliseconds = Date.parse(value);
  return Number.isSafeInteger(milliseconds) ? utcEpochMs(milliseconds) : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
