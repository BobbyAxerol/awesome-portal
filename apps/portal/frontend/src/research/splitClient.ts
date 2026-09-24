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
import { toResearchRefusal, type ResearchRefusal } from "./researchRefusal";

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

/**
 * Axis ticks, as presentation metadata.
 *
 * The P14 ruling of 2026-09-23 settles what this is and is not: choosing tick
 * positions inside the published timeline and formatting them in UTC is a
 * coordinate system for the chart, not a new chronology. So the rules here are
 * narrow and testable — every tick lies inside the published range, every
 * label is UTC, the count changes with width and nothing else does. A tick is
 * never a fold, a seal, a purge edge or a holdout fact, and it never leaves
 * this module: no hash, no request, no export, no cache key.
 */
export function axisTicks(timeline: Range, count: number): { at_utc_ms: number; label: string }[] {
  const span = timeline.end_exclusive_utc_ms - timeline.start_utc_ms;
  if (span <= 0 || count < 2) return [];
  const format = new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const ticks: { at_utc_ms: number; label: string }[] = [];
  for (let index = 0; index < count; index += 1) {
    /* Evenly spaced inside the published range, endpoints included. The
       positions come from the server's two timestamps and nothing else. */
    const at = timeline.start_utc_ms + Math.round((span * index) / (count - 1));
    ticks.push({ at_utc_ms: at, label: format.format(new Date(at)) });
  }
  return ticks;
}

/**
 * RF-06 FE-S05-07: month-start ticks.
 *
 * Still presentation under the P14 ruling — UTC month starts that fall inside
 * the published range, labelled `YYYY-MM`. A reader scans "2026-05" faster
 * than an arbitrary evenly-spaced day. When the range holds fewer than two
 * month starts the evenly-spaced ticks are used instead; when it holds more
 * than `maxCount`, every n-th month is kept so the labels never collide.
 */
export function monthTicks(timeline: Range, maxCount: number): { at_utc_ms: number; label: string }[] {
  const { start_utc_ms: start, end_exclusive_utc_ms: end } = timeline;
  if (end <= start || maxCount < 2) return [];
  const starts: number[] = [];
  const first = new Date(start);
  let year = first.getUTCFullYear();
  let month = first.getUTCMonth();
  if (Date.UTC(year, month, 1) < start) month += 1;
  for (;;) {
    const at = Date.UTC(year, month, 1);
    if (at >= end) break;
    starts.push(at);
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
    if (starts.length > 600) break;
  }
  if (starts.length < 2) return axisTicks(timeline, maxCount);
  const every = Math.ceil(starts.length / maxCount);
  return starts
    .filter((_, index) => index % every === 0)
    .map((at) => ({ at_utc_ms: at, label: new Date(at).toISOString().slice(0, 7) }));
}

/** How many ticks a width can carry without the labels colliding. */
export function tickCountForWidth(width: number): number {
  if (width < 520) return 2;
  if (width < 900) return 3;
  return 5;
}

/** How many month labels (`YYYY-MM`, ~52px each) a track width carries. */
export function monthTickBudget(width: number): number {
  return Math.max(2, Math.min(12, Math.floor(width / 90)));
}

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
  /* RF-05 CG-P14-03: a fact the protocol has no place for (e.g. purge on a
     three-window run) is not missing — it does not apply. */
  NOT_APPLICABLE: "not applicable",
};

export function reasonOf(fact: { reason_code?: string | null; availability?: SplitAvailability }): string {
  return fact.reason_code ?? fact.availability?.reason_code ?? fact.availability?.state ?? "unknown";
}

/* -------------------------------------------------------------------------
 * Refusals
 * ---------------------------------------------------------------------- */

/**
 * RF01-F4: one refusal mapper serves every Research surface
 * (`researchRefusal.ts`). These names stay so existing callers and the
 * shared-module rule (additive only) hold.
 */
export type SplitRefusal = ResearchRefusal;
export const toSplitRefusal = toResearchRefusal;
