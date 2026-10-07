/**
 * Research · completed-window analytics, retained observations and the native execution journal (§44 / WEX).
 *
 * Four named same-origin reads from the generated `research-window-execution` contract:
 *  - `researchWindowAnalyticsGetV1`          one full-population analytical block for a window (and a WFO fold);
 *  - `researchWindowObservationsGetV1`       the complete retained observations of that window, keyset-paged (≤ 200 rows / 1 MiB);
 *  - `researchNativeExecutionRecordsGetV1`   the engine journal (orders, fills, trades, commands, order reports, lifecycle);
 *  - `researchWindowCompareGetV1`            two runs on one explicit window, independent accounts, no forward fill.
 *
 * Nothing here parses a server sentence or reconstructs an order, a fill or a PnL: a value is printed as served and an absence stays a
 * typed absence (`NOT_PUBLISHED` / `NOT_APPLICABLE` with its reason code). An opaque `next_cursor` is bound to the exact selector it was
 * issued for (actor, workspace, run, operation, window, fold, filters, limit, revision): the caller resets the page when any of them
 * changes, and this client never rewrites a cursor.
 */

import type { components } from "@portal/contracts-research-window-execution";

import { PortalApiError } from "../lib/api";

type Schemas = components["schemas"];

export type WindowName = Schemas["WindowDescriptor"]["window"];
export type WindowDescriptor = Schemas["WindowDescriptor"];
export type WindowAnalytics = Schemas["WindowAnalytics"];
export type WindowExecutionPage = Schemas["WindowExecutionPage"];
export type WindowExecutionRow = Schemas["WindowExecutionRow"];
export type NativeExecutionRecord = Schemas["NativeExecutionRecord"];
export type WindowCompare = Schemas["WindowCompare"];

export type ObservationRow = Extract<WindowExecutionRow, { kind: "OBSERVATION" }>;
export type AnalyticsRow = Extract<WindowExecutionRow, { kind: "ANALYTICS" }>;
export type ExecutionRow = Extract<WindowExecutionRow, { kind: "EXECUTION" }>;

export const WINDOW_NAMES: readonly WindowName[] = ["IS", "OOS", "HOLDOUT", "FULL_SAMPLE"];
export type RecordKind = "ORDER" | "FILL" | "TRADE" | "COMMAND" | "ORDER_REPORT" | "LIFECYCLE";
export const RECORD_KINDS: readonly RecordKind[] = ["ORDER", "FILL", "TRADE", "COMMAND", "ORDER_REPORT", "LIFECYCLE"];

/** Page size the screens ask for: the contract's ceiling is 200 rows. */
export const WINDOW_PAGE_LIMIT = 200;

const RUNS = "/api/v1/quantbt/runs";
const COMPARE = "/api/v1/quantbt/windows/compare";

/** The selector every window read carries; `foldId` only names a Walk-forward IS fold. */
export interface WindowScope {
  window: WindowName;
  foldId?: string | null;
}

function params(workspaceId: string | undefined, scope: WindowScope | null, extra: Record<string, string | number | undefined | null> = {}): string {
  const search = new URLSearchParams();
  if (workspaceId) search.set("workspace_id", workspaceId);
  if (scope !== null) {
    search.set("window", scope.window);
    if (scope.foldId !== undefined && scope.foldId !== null && scope.foldId !== "") search.set("fold_id", scope.foldId);
  }
  for (const [key, value] of Object.entries(extra)) if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  const serialized = search.toString();
  return serialized ? `?${serialized}` : "";
}

async function call<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { credentials: "same-origin", signal });
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    let code: string | null = null;
    let requestId: string | null = response.headers.get("x-request-id");
    try {
      const problem = (await response.json()) as { error?: { code?: string; message?: string }; request_id?: string };
      if (problem?.error?.message) message = problem.error.message;
      code = problem?.error?.code ?? null;
      requestId = problem?.request_id ?? requestId;
    } catch {
      /* non-JSON error body: keep the status line */
    }
    throw new PortalApiError(message, response.status, code, requestId);
  }
  return (await response.json()) as T;
}

export const windowExecutionApi = {
  /** `researchWindowAnalyticsGetV1`: the answer is a page whose single row is the `ANALYTICS` block. */
  analytics: (runId: string, scope: WindowScope, options: { workspaceId?: string; signal?: AbortSignal } = {}) =>
    call<WindowExecutionPage>(`${RUNS}/${encodeURIComponent(runId)}/windows/analytics${params(options.workspaceId, scope)}`, options.signal),

  /** `researchWindowObservationsGetV1` */
  observations: (
    runId: string,
    scope: WindowScope,
    options: { workspaceId?: string; limit?: number; cursor?: string | null; atUtcMs?: number | null; signal?: AbortSignal } = {},
  ) =>
    call<WindowExecutionPage>(
      `${RUNS}/${encodeURIComponent(runId)}/windows/observations${params(options.workspaceId, scope, { limit: options.limit ?? WINDOW_PAGE_LIMIT, cursor: options.cursor, at_utc_ms: options.atUtcMs })}`,
      options.signal,
    ),

  /** `researchNativeExecutionRecordsGetV1` */
  records: (
    runId: string,
    scope: WindowScope,
    options: { workspaceId?: string; kind?: RecordKind | null; limit?: number; cursor?: string | null; signal?: AbortSignal } = {},
  ) =>
    call<WindowExecutionPage>(
      `${RUNS}/${encodeURIComponent(runId)}/execution/records${params(options.workspaceId, scope, { record_kind: options.kind, limit: options.limit ?? WINDOW_PAGE_LIMIT, cursor: options.cursor })}`,
      options.signal,
    ),

  /** `researchWindowCompareGetV1` */
  compare: (leftRunId: string, rightRunId: string, scope: WindowScope, options: { workspaceId?: string; signal?: AbortSignal } = {}) =>
    call<WindowCompare>(
      `${COMPARE}${params(options.workspaceId, scope, { runs: `${leftRunId},${rightRunId}` })}`,
      options.signal,
    ),
};

/* ------------------------------------------------------------------ readers (no parsing of prose, no defaults) */

export interface Absence {
  state: "NOT_PUBLISHED" | "NOT_APPLICABLE";
  reasonCode: string | null;
}

/** The typed absence a page or descriptor carries, or null when it is `AVAILABLE`. */
export function absenceOf(page: Pick<WindowExecutionPage, "availability">): Absence | null {
  const { state, reason_code } = page.availability;
  return state === "AVAILABLE" ? null : { state, reasonCode: reason_code };
}

/** The one analytical block of an analytics page; null when the page carries none (an absence, or no matching row). */
export function analyticsOf(page: WindowExecutionPage): WindowAnalytics | null {
  const row = page.rows.find((entry): entry is AnalyticsRow => entry.kind === "ANALYTICS");
  return row?.payload ?? null;
}

export function observationRows(page: WindowExecutionPage): readonly ObservationRow[] {
  return page.rows.filter((entry): entry is ObservationRow => entry.kind === "OBSERVATION");
}

export function executionRows(page: WindowExecutionPage): readonly ExecutionRow[] {
  return page.rows.filter((entry): entry is ExecutionRow => entry.kind === "EXECUTION");
}

/** True when `next` is a window the page really answered for (the response echoes the selector it served). */
export function answeredFor(page: WindowExecutionPage, scope: WindowScope): boolean {
  return page.window === scope.window && (page.fold_id ?? null) === (scope.foldId ?? null);
}
