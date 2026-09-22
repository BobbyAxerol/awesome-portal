/**
 * Research Loop — Split client (P14 + RS-02, Screen 05).
 *
 * Two named reads, and the screen is explicit about which one answers what:
 *
 *  - **P14 `researchSplitDetailGetV1`** publishes the run's three-window
 *    truth: warmup, IS, outer OOS and the holdout, each with the server's own
 *    UTC-millisecond boundaries and bar counts, plus typed absences for every
 *    protocol fact the current source does not publish.
 *  - **RS-02 `researchCurrentSourceSplitGetV1`** publishes the folds actually
 *    observed for the one admitted Advanced-WFO profile. It refuses every
 *    other profile rather than falling back.
 *
 * Nothing here computes a boundary. `24h` and `72h` are not added to a date,
 * a fold is not inferred, a seal is not derived and a bar is not counted: the
 * screen draws the spans the server sent and says so where it was sent none.
 */

import type { components as SplitComponents } from "@portal/contracts-research-split";
import type { components as CurrentSourceComponents } from "@portal/contracts-research-current-source";

import { PortalApiError } from "../lib/api";
import type { ResearchState } from "./state";

type SplitSchemas = SplitComponents["schemas"];
type SourceSchemas = CurrentSourceComponents["schemas"];

export type SplitDetail = SplitSchemas["SplitDetail"];
export type SplitAvailability = SplitSchemas["Availability"];
export type AbsentFact = SplitSchemas["AbsentFact"];
export type Range = SplitSchemas["Range"];
export type Warmup = SplitSchemas["Warmup"];
export type IsWindow = SplitSchemas["IsWindow"];
export type OuterOosWindow = SplitSchemas["OuterOosWindow"];
export type HoldoutWindow = SplitSchemas["HoldoutWindow"];

export type CurrentSourceSplit = SourceSchemas["Split"];
export type SourceFold = SourceSchemas["Fold"];

const RUNS = "/api/v1/quantbt/runs";

export const NOT_MODIFIED = Symbol("split.not-modified");
export type Fresh<T> = T | typeof NOT_MODIFIED;

function query(workspaceId?: string): string {
  return workspaceId ? `?workspace_id=${encodeURIComponent(workspaceId)}` : "";
}

async function call<T>(path: string, etag?: string | null, signal?: AbortSignal): Promise<Fresh<T>> {
  const response = await fetch(path, {
    credentials: "same-origin",
    signal,
    headers: etag ? { "If-None-Match": etag } : undefined,
  });
  if (response.status === 304) return NOT_MODIFIED;
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    let code: string | null = null;
    let requestId: string | null = response.headers.get("x-request-id");
    try {
      const problem = (await response.json()) as Partial<SplitSchemas["Problem"]>;
      if (problem?.error?.message) message = problem.error.message;
      code = problem?.error?.code ?? null;
      requestId = problem?.request_id ?? requestId;
    } catch {
      /* non-JSON error body: keep the status line the server gave */
    }
    throw new PortalApiError(message, response.status, code, requestId);
  }
  return (await response.json()) as T;
}

export const splitApi = {
  /** `researchSplitDetailGetV1` */
  detail: (runId: string, options: { workspaceId?: string; etag?: string | null; signal?: AbortSignal } = {}) =>
    call<SplitDetail>(
      `${RUNS}/${encodeURIComponent(runId)}/split${query(options.workspaceId)}`,
      options.etag,
      options.signal,
    ),

  /** `researchCurrentSourceSplitGetV1` */
  currentSource: (runId: string, options: { workspaceId?: string; signal?: AbortSignal } = {}) =>
    call<CurrentSourceSplit>(
      `${RUNS}/${encodeURIComponent(runId)}/current-source/split${query(options.workspaceId)}`,
      null,
      options.signal,
    ),
} as const;

/* -------------------------------------------------------------------------
 * Windows
 * ---------------------------------------------------------------------- */

/**
 * Whether a window carries a real span.
 *
 * Each window in the contract is a union: a span-bearing shape, or an
 * `AbsentFact`. Narrowing on `start_utc_ms` is the only honest test — a
 * window without one has no boundary to draw, whatever else it carries.
 */
export function hasRange(window: unknown): window is Range & { availability: SplitAvailability } {
  return typeof window === "object" && window !== null && "start_utc_ms" in window;
}

/** The bar count a window published, or null where it published none. */
export function barsOf(window: unknown): number | null {
  if (typeof window !== "object" || window === null || !("bars" in window)) return null;
  const bars = (window as { bars: number | null }).bars;
  return typeof bars === "number" ? bars : null;
}

/**
 * Where a span sits inside the timeline, as a percentage.
 *
 * This is geometry, not derivation: both ends come from the server and the
 * only arithmetic is the one that turns two timestamps into a left offset and
 * a width. No boundary is invented, moved or rounded into a different date.
 */
export function placeInTimeline(
  timeline: Range,
  span: Range,
): { leftPercent: number; widthPercent: number } {
  const total = timeline.end_exclusive_utc_ms - timeline.start_utc_ms;
  if (total <= 0) return { leftPercent: 0, widthPercent: 0 };
  const left = ((span.start_utc_ms - timeline.start_utc_ms) / total) * 100;
  const width = ((span.end_exclusive_utc_ms - span.start_utc_ms) / total) * 100;
  return {
    leftPercent: Math.max(0, Math.min(100, left)),
    widthPercent: Math.max(0, Math.min(100 - Math.max(0, left), width)),
  };
}

/** A span too thin to see is still a span: it gets a floor, and says so. */
export const HAIRLINE_PERCENT = 0.35;

/* -------------------------------------------------------------------------
 * Availability presentation
 * ---------------------------------------------------------------------- */

export function isAvailable(availability: SplitAvailability): boolean {
  return availability.state === "AVAILABLE";
}

export const SPLIT_WITHHELD_WORDS: Record<SplitAvailability["state"], string> = {
  AVAILABLE: "available",
  NOT_PUBLISHED: "not published",
  NOT_APPLICABLE: "not applicable",
  PENDING_SOURCE_CALLBACK: "pending source",
  LEGACY_METADATA_ONLY: "legacy metadata",
};

/**
 * `NOT_ASSERTED` is its own answer.
 *
 * The strict outer-OOS selector was neither passed nor failed: nobody
 * asserted it for this run. A screen that folded that into "not published"
 * would lose the distinction the handoff is most explicit about.
 */
export const ABSENT_WORDS: Record<AbsentFact["state"], string> = {
  NOT_PUBLISHED: "not published",
  NOT_ASSERTED: "not asserted",
};

export function reasonOf(fact: { reason_code?: string | null; availability?: SplitAvailability }): string {
  return fact.reason_code ?? fact.availability?.reason_code ?? fact.availability?.state ?? "unknown";
}

/* -------------------------------------------------------------------------
 * Refusals
 * ---------------------------------------------------------------------- */

export interface SplitRefusal {
  code: string | null;
  message: string;
  status: number;
  requestId: string | null;
  state: ResearchState["state"];
  mayRetry: boolean;
  terminal: boolean;
}

export function toSplitRefusal(error: unknown): SplitRefusal {
  if (!(error instanceof PortalApiError)) {
    return {
      code: null,
      message: "The request did not reach the server.",
      status: 0,
      requestId: null,
      state: "failed-retryable",
      mayRetry: true,
      terminal: false,
    };
  }
  const { status } = error;
  const denied = status === 401 || status === 403;
  return {
    code: error.code,
    message: error.message,
    status,
    requestId: error.requestId,
    state:
      denied
        ? "denied"
        : status === 404
          ? "empty"
          : status === 409
            ? "stale"
            : status >= 500
              ? "unavailable"
              : "terminal",
    mayRetry: status >= 500 || status === 409,
    terminal: denied || status === 404,
  };
}
