/**
 * Strict reader of `portal.execution.entity-search.v1` (WP-K slice 7; operationId `executionEntitySearchGetV1`): the command bar's cross-entity
 * search. Per kind at most `limit` rows already scoped to the caller: an entity the caller may not see is ABSENT (there is no denied row). `total_matched`
 * is an integer or `null` (the source did not count it); 0 is a counted zero. Named rules stricter than the schema: ES-1 a row's kind is its group's kind,
 * ES-2 groups are unique per kind and inside the asked kinds, ES-3 rows are unique per id and never more than `limit`, a route hint is an in-app path.
 * ES-4 a group with `state: NOT_COMMISSIONED` has a null count and no rows (an answered group may state either).
 * Never throws: a malformed body is `null`; another schema is `unsupported_shape`.
 */
import type { UtcEpochMs } from "../../screenDataContract";
import { clockMs, hasOnly, managerText, oneOf, record } from "./managerMetric";

export const ENTITY_SEARCH_SCHEMA = "portal.execution.entity-search.v1";
export const ENTITY_KINDS = ["alpha", "portfolio", "account", "operation", "incident", "approval"] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];
const ID = /^[A-Za-z0-9._:-]{1,191}$/;
const HINT = /^\/[^\u0000-\u001f\u007f\s]*$/;

export interface EntityHit { kind: EntityKind; id: string; label: string; detail: string | null; routeHint: string }
/** `notCommissioned`: the server says no source answers for this kind. It is not "no match": the count is null and the rows empty by rule ES-4. */
export interface EntityGroup { kind: EntityKind; totalMatched: number | null; rows: readonly EntityHit[]; notCommissioned?: true }
export interface EntitySearch { workspaceId: string; readAtMs: UtcEpochMs; query: { q: string; kinds: readonly EntityKind[]; limit: number }; groups: readonly EntityGroup[] }
export type EntitySearchRead = { kind: "entity_search"; search: EntitySearch } | { kind: "unsupported_shape"; schemaVersion: string | null };

export function readEntitySearchV1(raw: unknown): EntitySearchRead | null {
  try {
    const root = record(raw);
    if (root === null) return null;
    const schemaVersion = typeof root.schema_version === "string" ? root.schema_version : null;
    if (schemaVersion !== ENTITY_SEARCH_SCHEMA) return { kind: "unsupported_shape", schemaVersion };
    if (!hasOnly(root, ["schema_version", "workspace_id", "record_authority", "read_at_ms", "query", "groups"]) || root.record_authority !== "PORTAL_PROJECTION") return null;
    const workspaceId = managerText(root.workspace_id);
    const readAtMs = clockMs(root.read_at_ms);
    const q = record(root.query);
    if (workspaceId === null || readAtMs === null || q === null || !hasOnly(q, ["q", "kinds", "limit"]) || !Array.isArray(q.kinds) || !Array.isArray(root.groups) || root.groups.length > 6) return null;
    const text = managerText(q.q, 128);
    const limit = typeof q.limit === "number" && Number.isInteger(q.limit) && q.limit >= 1 && q.limit <= 50 ? q.limit : null;
    const kinds: EntityKind[] = [];
    for (const item of q.kinds) { const k = oneOf(item, ENTITY_KINDS); if (k === null || kinds.includes(k)) return null; kinds.push(k); }
    if (text === null || limit === null || kinds.length < 1) return null;
    const groups: EntityGroup[] = [];
    for (const entry of root.groups) {
      const g = record(entry);
      if (g === null || !hasOnly(g, ["kind", "total_matched", "rows", "state"]) || !Array.isArray(g.rows)) return null;
      if (g.state !== undefined && g.state !== "NOT_COMMISSIONED") return null;
      const kind = oneOf(g.kind, ENTITY_KINDS);
      const totalMatched = g.total_matched === null ? null : typeof g.total_matched === "number" && Number.isSafeInteger(g.total_matched) && g.total_matched >= 0 ? g.total_matched : undefined;
      if (kind === null || totalMatched === undefined || groups.some((x) => x.kind === kind) || !kinds.includes(kind) || g.rows.length > limit) return null; // ES-2, ES-3
      const rows: EntityHit[] = [];
      const seen = new Set<string>();
      for (const item of g.rows) {
        const r = record(item);
        if (r === null || !hasOnly(r, ["kind", "id", "label", "detail", "route_hint"])) return null;
        const rowKind = oneOf(r.kind, ENTITY_KINDS);
        const id = typeof r.id === "string" && ID.test(r.id) ? r.id : null;
        const label = managerText(r.label);
        const detail = r.detail === null ? null : managerText(r.detail);
        if (rowKind !== kind || id === null || label === null || (r.detail !== null && detail === null) || typeof r.route_hint !== "string" || !HINT.test(r.route_hint) || seen.has(id)) return null; // ES-1, ES-3
        seen.add(id);
        rows.push({ kind, id, label, detail, routeHint: r.route_hint });
      }
      if (totalMatched !== null && totalMatched < rows.length) return null;
      if (g.state === "NOT_COMMISSIONED") {
        if (totalMatched !== null || rows.length > 0) return null; // ES-4
        groups.push({ kind, totalMatched, rows, notCommissioned: true });
        continue;
      }
      groups.push({ kind, totalMatched, rows });
    }
    return { kind: "entity_search", search: { workspaceId, readAtMs, query: { q: text, kinds, limit }, groups } };
  } catch {
    return null;
  }
}

/** Whether the body answers the question asked (the same text, and no kind outside the asked ones, already checked by ES-2). */
export const entitySearchAnswers = (search: EntitySearch, q: string): boolean => search.query.q === q;

export function entitySearchPath(query: { q: string; kinds?: readonly EntityKind[]; limit?: number; workspaceId?: string }): string | null {
  const text = query.q.trim();
  if (text.length < 1 || text.length > 128 || /[\u0000-\u001f\u007f]/.test(text)) return null;
  if (query.limit !== undefined && !(Number.isInteger(query.limit) && query.limit >= 1 && query.limit <= 50)) return null;
  if (query.kinds !== undefined && (query.kinds.length < 1 || new Set(query.kinds).size !== query.kinds.length)) return null;
  const params = new URLSearchParams({ q: text });
  if (query.kinds) params.set("kinds", query.kinds.join(","));
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  if (query.workspaceId) params.set("workspace_id", query.workspaceId);
  return `/search?${params.toString()}`;
}
