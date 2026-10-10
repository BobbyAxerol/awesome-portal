/**
 * UDB-03 · the retained-review context (`GET /api/v1/execution/retained-review`), read once per page and shared.
 *
 * A retained-review stack keeps earlier Portal observations of the Execution source: every value is STALE / PARTIAL, nothing is live,
 * there is no stream and no mutation. The screens keep their approved layout; what changes is what the page is allowed to *do*:
 *  - it reads once and again only when the reader asks (`refreshRetainedReview`), never on a fake live cadence;
 *  - it opens no realtime bootstrap / EventSource (`status === "retained"` says so before any request is made);
 *  - it never words a local observation time as the source's freshness — the source clocks stay separate and nullable.
 * Any other answer (404, 401, malformed, network) is `absent`: the page behaves exactly as it did before this context existed.
 */
import { useSyncExternalStore } from "react";

export type RetainedState = "PARTIAL" | "UNAVAILABLE";

export interface RetainedPanel {
  panelId: string;
  screenId: string;
  state: RetainedState;
  currentRows: number;
  /** An exact decimal string: it may exceed a safe integer. */
  historyRows: string;
  sourceAvailability: "AVAILABLE" | "UNAVAILABLE" | "NOT_PUBLISHED";
  sourceReasonCode: string | null;
  sourceAsOfMs: number | null;
  observedAtMs: number | null;
  oldestMs: number | null;
  newestMs: number | null;
  reasonCode: string;
}

export interface RetainedProfile {
  environment: "paper" | "sandbox" | "live";
  profileId: string;
  sourceAsOfMs: number | null;
  observedMs: number | null;
  panels: RetainedPanel[];
}

export interface RetainedReview {
  workspaceId: string;
  /** Effective rights inside THIS profile only — not the caller's Research / Core / account-admin rights. */
  permissions: { read: boolean; query: boolean; isOwner: boolean };
  profiles: RetainedProfile[];
  /** `TS_RESOURCE_MANAGEMENT_CONTRACT_NOT_PUBLISHED` — resource management is a typed gap, not something to infer from rows. */
  managementReason: string;
}

export type RetainedStatus = "idle" | "loading" | "retained" | "absent";

const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
const text = (value: unknown): string | null => (typeof value === "string" ? value : null);
const rec = (value: unknown): Record<string, unknown> | null => (value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null);

function readPanel(raw: unknown): RetainedPanel | null {
  const p = rec(raw);
  if (!p || typeof p.panel_id !== "string" || typeof p.screen_id !== "string") return null;
  if (p.retained_state !== "PARTIAL" && p.retained_state !== "UNAVAILABLE") return null;
  if (p.source_availability !== "AVAILABLE" && p.source_availability !== "UNAVAILABLE" && p.source_availability !== "NOT_PUBLISHED") return null;
  if (typeof p.history_row_count !== "string" || !/^\d+$/.test(p.history_row_count)) return null;
  if (typeof p.current_row_count !== "number" || !Number.isSafeInteger(p.current_row_count)) return null;
  return {
    panelId: p.panel_id, screenId: p.screen_id, state: p.retained_state,
    currentRows: p.current_row_count, historyRows: p.history_row_count,
    sourceAvailability: p.source_availability, sourceReasonCode: text(p.source_reason_code), sourceAsOfMs: num(p.source_as_of_ms),
    observedAtMs: num(p.observed_at_ms), oldestMs: num(p.oldest_available_ms), newestMs: num(p.newest_available_ms),
    reasonCode: text(p.reason_code) ?? "",
  };
}

/** Strict: the documented constants must all hold, or this is not a retained-review context and the page stays as it was. */
export function readRetainedReview(raw: unknown): RetainedReview | null {
  const r = rec(raw);
  if (!r || r.schema_version !== "portal.execution.retained-review.v1" || r.read_profile !== "retained_review_v1") return null;
  if (r.stream_enabled !== false || r.mutation_enabled !== false || r.upstream_enabled !== false || r.source_refresh_enabled !== false) return null;
  const permissions = rec(r.permissions);
  if (!permissions || permissions.read !== true || typeof permissions.is_owner !== "boolean") return null;
  if (!Array.isArray(r.profiles) || typeof r.workspace_id !== "string") return null;
  const profiles: RetainedProfile[] = [];
  for (const item of r.profiles) {
    const p = rec(item);
    if (!p || (p.environment !== "paper" && p.environment !== "sandbox" && p.environment !== "live") || typeof p.profile_id !== "string" || !Array.isArray(p.panels)) return null;
    const panels = p.panels.map(readPanel);
    if (panels.some((panel) => panel === null)) return null;
    profiles.push({ environment: p.environment, profileId: p.profile_id, sourceAsOfMs: num(p.source_as_of_ms), observedMs: num(p.snapshot_observed_ms), panels: panels as RetainedPanel[] });
  }
  return {
    workspaceId: r.workspace_id,
    permissions: { read: true, query: permissions.query === true, isOwner: permissions.is_owner },
    profiles,
    managementReason: text(rec(r.future_resource_management)?.reason_code) ?? "TS_RESOURCE_MANAGEMENT_CONTRACT_NOT_PUBLISHED",
  };
}

interface Snapshot { status: RetainedStatus; review: RetainedReview | null; epoch: number; readAtMs: number | null }

let snapshot: Snapshot = { status: "idle", review: null, epoch: 0, readAtMs: null };
const listeners = new Set<() => void>();
let inflight: AbortController | null = null;

function publish(next: Snapshot): void {
  snapshot = next;
  for (const listener of listeners) listener();
}

async function read(): Promise<void> {
  inflight?.abort();
  const abort = new AbortController();
  inflight = abort;
  let next: Pick<Snapshot, "status" | "review">;
  try {
    const response = await fetch("/api/v1/execution/retained-review", {
      credentials: "same-origin", cache: "no-store", headers: { accept: "application/json" }, signal: abort.signal,
    });
    const review = response.ok ? readRetainedReview(await response.json().catch(() => null)) : null;
    next = review ? { status: "retained", review } : { status: "absent", review: null };
  } catch {
    if (abort.signal.aborted) return;
    next = { status: "absent", review: null };
  }
  if (abort.signal.aborted) return;
  publish({ ...snapshot, ...next, readAtMs: Date.now() });
}

/** Start the one read for this page (idempotent). Called while a product route renders, so it precedes its children's effects. */
export function ensureRetainedReview(): void {
  if (snapshot.status !== "idle" || typeof fetch !== "function") return;
  snapshot = { ...snapshot, status: "loading" };
  void read();
}

/** The reader asked to look again: re-read the context and tell every static consumer to re-read its data once. */
export function refreshRetainedReview(): void {
  if (snapshot.status !== "retained") return;
  publish({ ...snapshot, epoch: snapshot.epoch + 1 });
  void read();
}

/** True once the stack has said it is a retained review: no periodic re-read, no stream. */
export function retainedStatic(): boolean {
  return snapshot.status === "retained";
}
export function retainedLoading(): boolean {
  return snapshot.status === "loading";
}
export function retainedEpoch(): number {
  return snapshot.epoch;
}

export function subscribeRetained(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

const getSnapshot = () => snapshot;

export function useRetainedReview(): Snapshot {
  return useSyncExternalStore(subscribeRetained, getSnapshot, getSnapshot);
}

export function resetRetainedReviewForTests(): void {
  inflight?.abort();
  inflight = null;
  snapshot = { status: "idle", review: null, epoch: 0, readAtMs: null };
  for (const listener of listeners) listener();
}
