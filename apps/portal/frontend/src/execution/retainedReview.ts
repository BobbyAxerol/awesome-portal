/**
 * UDB-03 · the retained-review context (`GET /api/v1/execution/retained-review`), read once per page and shared.
 *
 * A retained-review stack keeps earlier Portal observations of the Execution source: every value is STALE / PARTIAL, nothing is live,
 * there is no stream and no mutation. The screens keep their approved layout; what changes is what the page is allowed to *do*:
 *  - it reads once and again only when the reader asks (`refreshRetainedReview`), never on a fake live cadence;
 *  - it opens no realtime bootstrap / EventSource (`status === "retained"` says so before any request is made);
 *  - it never words a local observation time as the source's freshness — the source clocks stay separate and nullable.
 * Only a previously unknown / explicitly unconfigured endpoint permits legacy behavior. Auth, malformed and transient failures
 * do not open polling or streaming. Context and displayed permissions never cross a principal/session boundary.
 */
import { useSyncExternalStore } from "react";
import type { AuthPrincipal } from "../auth/authApi";
import { useSession } from "../auth/session";
import { onSessionEnded, reportSessionExpired } from "../auth/sessionExpiry";
import type { components } from "../../../../../packages/contracts/generated/execution-retained-review";

type WireReview = components["schemas"]["RetainedReviewResponse"];

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
  permissions: { read: boolean; query: boolean; isOwner: boolean } | null;
  profiles: RetainedProfile[];
  /** `TS_RESOURCE_MANAGEMENT_CONTRACT_NOT_PUBLISHED` — resource management is a typed gap, not something to infer from rows. */
  managementReason: string;
}

export type RetainedStatus = "idle" | "loading" | "retained" | "absent" | "unavailable" | "denied" | "auth_expired";

const rec = (value: unknown): Record<string, unknown> | null => (value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null);
const str = (v: unknown, max: number, min = 0): v is string => typeof v === "string" && [...v].length >= min && [...v].length <= max;
const nullableText = (v: unknown, max: number): v is string | null => v === null || str(v, max);
const utcMs = (v: unknown): v is number | null => v === null || (typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= 8_640_000_000_000_000);
const shape = (v: Record<string, unknown>, keys: readonly string[]): boolean => Object.keys(v).length === keys.length && keys.every(key => Object.hasOwn(v, key));
const constants = (v: Record<string, unknown>, expected: object): boolean => Object.entries(expected).every(([key, value]) => v[key] === value);
const POLICY = {
  schema_version: "portal.execution.retained-review.v1", read_profile: "retained_review_v1", authority: "PORTAL_RETAINED_OBSERVATION",
  upstream_enabled: false, source_refresh_enabled: false, stream_enabled: false, mutation_enabled: false, live_eligibility: false,
  history_semantics: "BOUNDED_RETAINED_OBSERVATIONS_NOT_AUTHORITATIVE_REPLAY",
} as const satisfies Partial<WireReview>;
const RIGHTS = { read: true, query: true, download: false, manage: false, command: false, stream: false, research_create: false, governance_decide: false } as const satisfies Partial<WireReview["permissions"]>;
const REVOCATION = { http: "EACH_REQUEST_CORE_SESSION_AND_ACCESS", permission_cache_seconds: 0, data_view_cache_milliseconds: 2000,
  data_view_cache_maximum_serialized_bytes: 8388608, delegation_enabled: false,
  upstream_revocation: "SHORT_LIVED_TOKEN_EXPIRY_NOT_INSTANT_REVOCATION" } as const satisfies Partial<WireReview["revocation"]>;
const MANAGEMENT = { state: "NOT_PUBLISHED", reason_code: "TS_RESOURCE_MANAGEMENT_CONTRACT_NOT_PUBLISHED" } as const satisfies WireReview["future_resource_management"];

function readPanel(raw: unknown): RetainedPanel | null {
  const p = rec(raw);
  if (!p || !shape(p, ["panel_id", "screen_id", "retained_state", "current_row_count", "history_row_count", "source_availability",
    "source_reason_code", "source_as_of_ms", "source_freshness", "observed_at_ms", "oldest_available_ms", "newest_available_ms", "reason_code"])) return null;
  if (!str(p.panel_id, 96) || !str(p.screen_id, 96)) return null;
  if (p.retained_state !== "PARTIAL" && p.retained_state !== "UNAVAILABLE") return null;
  if (p.source_availability !== "AVAILABLE" && p.source_availability !== "UNAVAILABLE" && p.source_availability !== "NOT_PUBLISHED") return null;
  if (typeof p.history_row_count !== "string" || !/^(0|[1-9][0-9]*)$/.test(p.history_row_count)) return null;
  if (typeof p.current_row_count !== "number" || !Number.isSafeInteger(p.current_row_count) || p.current_row_count < 0 || p.current_row_count > 10_000) return null;
  if (!nullableText(p.source_reason_code, 191) || typeof p.source_freshness !== "string" || !["FRESH", "AGING", "STALE", "UNKNOWN"].includes(p.source_freshness)) return null;
  if (![p.source_as_of_ms, p.observed_at_ms, p.oldest_available_ms, p.newest_available_ms].every(utcMs)) return null;
  if (p.reason_code !== "UDB_RETAINED_OBSERVATION_NOT_CURRENT_SOURCE" && p.reason_code !== "UDB_RETAINED_PANEL_NOT_CAPTURED") return null;
  return {
    panelId: p.panel_id, screenId: p.screen_id, state: p.retained_state,
    currentRows: p.current_row_count, historyRows: p.history_row_count,
    sourceAvailability: p.source_availability, sourceReasonCode: p.source_reason_code, sourceAsOfMs: p.source_as_of_ms as number | null,
    observedAtMs: p.observed_at_ms as number | null, oldestMs: p.oldest_available_ms as number | null, newestMs: p.newest_available_ms as number | null,
    reasonCode: p.reason_code,
  };
}

/** Validate the published v1 boundary before mapping; invalid does not mean legacy/live. */
export function readRetainedReview(raw: unknown): RetainedReview | null {
  const r = rec(raw);
  if (!r || !shape(r, [...Object.keys(POLICY), "workspace_id", "permissions", "revocation", "profiles", "future_resource_management"]) || !constants(r, POLICY)) return null;
  const permissions = rec(r.permissions);
  if (!permissions || !shape(permissions, [...Object.keys(RIGHTS), "is_owner"]) || !constants(permissions, RIGHTS) || typeof permissions.is_owner !== "boolean") return null;
  const revocation = rec(r.revocation), management = rec(r.future_resource_management);
  if (!revocation || !shape(revocation, [...Object.keys(REVOCATION), "delegated_jwt_ttl_seconds"]) || !constants(revocation, REVOCATION) ||
    typeof revocation.delegated_jwt_ttl_seconds !== "number" || !Number.isInteger(revocation.delegated_jwt_ttl_seconds) || revocation.delegated_jwt_ttl_seconds < 1 || revocation.delegated_jwt_ttl_seconds > 60) return null;
  if (!management || !shape(management, Object.keys(MANAGEMENT)) || !constants(management, MANAGEMENT)) return null;
  if (!Array.isArray(r.profiles) || r.profiles.length !== 3 || !str(r.workspace_id, 128, 1)) return null;
  const profiles: RetainedProfile[] = [];
  const environments = new Set<string>();
  for (const item of r.profiles) {
    const p = rec(item);
    if (!p || !shape(p, ["environment", "profile_id", "source_as_of_ms", "snapshot_observed_ms", "source_payload_digest", "freshness", "completeness", "panels"]) ||
      (p.environment !== "paper" && p.environment !== "sandbox" && p.environment !== "live") || environments.has(p.environment) ||
      typeof p.profile_id !== "string" || !new RegExp(`^${p.environment.toUpperCase()}_[A-Z0-9_]+$`).test(p.profile_id) ||
      p.freshness !== "STALE" || p.completeness !== "PARTIAL" || !nullableText(p.source_payload_digest, 80) ||
      !utcMs(p.source_as_of_ms) || !utcMs(p.snapshot_observed_ms) || !Array.isArray(p.panels) || p.panels.length > 96) return null;
    environments.add(p.environment);
    const panels = p.panels.map(readPanel);
    if (panels.some((panel) => panel === null)) return null;
    profiles.push({ environment: p.environment, profileId: p.profile_id, sourceAsOfMs: p.source_as_of_ms, observedMs: p.snapshot_observed_ms, panels: panels as RetainedPanel[] });
  }
  return {
    workspaceId: r.workspace_id,
    permissions: { read: true, query: true, isOwner: permissions.is_owner },
    profiles,
    managementReason: MANAGEMENT.reason_code,
  };
}

interface Snapshot { status: RetainedStatus; review: RetainedReview | null; epoch: number; readAtMs: number | null; sessionKey: string | null; error: string | null }

const UNWIRED = "unwired";
const UNBOUND: Snapshot = { status: "loading", review: null, epoch: 0, readAtMs: null, sessionKey: null, error: null };
let snapshot: Snapshot = { ...UNBOUND, status: "idle", sessionKey: UNWIRED };
const listeners = new Set<() => void>();
let inflight: AbortController | null = null;
let generation = 0;

export function retainedSessionKey(principal: AuthPrincipal | null): string {
  return principal ? JSON.stringify([principal.principalId, principal.sessionId, principal.role]) : UNWIRED;
}

function publish(next: Snapshot): void {
  snapshot = next;
  for (const listener of listeners) listener();
}

async function read(): Promise<void> {
  inflight?.abort();
  const abort = new AbortController();
  inflight = abort;
  const requestGeneration = ++generation, sessionKey = snapshot.sessionKey;
  let timedOut = false;
  const deadline = setTimeout(() => { timedOut = true; abort.abort(); }, 10_000);
  const failed = (error: string): Pick<Snapshot, "status" | "review" | "error"> => snapshot.review
    ? { status: "retained", review: { ...snapshot.review, permissions: null }, error }
    : { status: "unavailable", review: null, error };
  let next: Pick<Snapshot, "status" | "review" | "error">;
  try {
    const response = await fetch("/api/v1/execution/retained-review", {
      credentials: "same-origin", cache: "no-store", headers: { accept: "application/json" }, signal: abort.signal,
    });
    const body: unknown = await response.json().catch(() => null);
    if (requestGeneration !== generation || (abort.signal.aborted && !timedOut)) return;
    if (timedOut) throw new Error("context timeout");
    const problem = rec(body), nested = rec(problem?.error);
    const reason = problem?.reason_code ?? problem?.code ?? nested?.code;
    if (response.status === 401) {
      publish({ ...snapshot, status: "auth_expired", review: null, error: "SESSION_EXPIRED", readAtMs: Date.now() });
      reportSessionExpired();
      return;
    }
    if (response.status === 403 || reason === "WORKSPACE_NOT_FOUND") next = { status: "denied", review: null, error: "UDB_CONTEXT_ACCESS_DENIED" };
    else if (response.status === 404 && (!snapshot.review || reason === "UDB_RETAINED_REVIEW_NOT_CONFIGURED")) next = { status: "absent", review: null, error: null };
    else if (!response.ok) next = failed(`UDB_CONTEXT_HTTP_${response.status}`);
    else {
      const review = readRetainedReview(body);
      next = review ? { status: "retained", review, error: null } : failed("UDB_CONTEXT_INVALID");
    }
  } catch {
    if (abort.signal.aborted && !timedOut) return;
    next = failed(timedOut ? "UDB_CONTEXT_READ_TIMEOUT" : "UDB_CONTEXT_NETWORK_ERROR");
  } finally {
    clearTimeout(deadline);
  }
  if (requestGeneration !== generation || sessionKey !== snapshot.sessionKey || (abort.signal.aborted && !timedOut)) return;
  publish({ ...snapshot, ...next, readAtMs: Date.now() });
}

/** Bind/read once per principal+session; called in the frame's layout effect before stream/poll effects. */
export function ensureRetainedReview(sessionKey = UNWIRED): void {
  if (sessionKey !== snapshot.sessionKey) {
    generation++;
    inflight?.abort();
    snapshot = { ...UNBOUND, status: "idle", sessionKey };
  }
  if (snapshot.status !== "idle" || typeof fetch !== "function") return;
  publish({ ...snapshot, status: "loading" });
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

export function useRetainedReview(): Snapshot {
  const key = retainedSessionKey(useSession().principal);
  const getSnapshot = () => snapshot.sessionKey === key ? snapshot : UNBOUND;
  return useSyncExternalStore(subscribeRetained, getSnapshot, getSnapshot);
}

function endSession(): void {
  generation++;
  inflight?.abort();
  inflight = null;
  publish({ ...UNBOUND, status: "auth_expired", error: "SESSION_EXPIRED" });
}
onSessionEnded(endSession);

export function resetRetainedReviewForTests(): void {
  endSession();
  publish({ ...UNBOUND, status: "idle", sessionKey: UNWIRED });
}
