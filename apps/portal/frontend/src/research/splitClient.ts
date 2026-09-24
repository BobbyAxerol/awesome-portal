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
 *    observed for the one admitted Advanced-WFO profile. For any other
 *    profile it answers a typed not-applicable 200 (RF-05), never a fallback.
 *
 * Nothing here computes a boundary. `24h` and `72h` are not added to a date,
 * a fold is not inferred, a seal is not derived and a bar is not counted: the
 * screen draws the spans the server sent and says so where it was sent none.
 */

import type { components as SplitComponents } from "@portal/contracts-research-split";
import type { components as CurrentSourceComponents } from "@portal/contracts-research-current-source";

import { PortalApiError } from "../lib/api";
import {
  CURRENT_SOURCE_LANE_COPY,
  ResearchLaneConflictError,
  laneStateOfError,
  readLaneState,
  reasonCodeSentence,
  toResearchRefusal,
  type ResearchRefusal,
} from "./researchRefusal";

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

/* -------------------------------------------------------------------------
 * RS-02 lane answers (RF-05 CG-P13-09)
 *
 * The retained current-source lane now says, in a typed body, whether it can
 * ever answer for a run. The screens stop guessing from their own read
 * (FE-X-12's skip inference) and render what the lane said:
 *
 *  - a 200 `research.current-source-not-applicable.v1` — this run's binding is
 *    never retained, nothing is pending, do not retry;
 *  - a 409 `RESEARCH_CURRENT_SOURCE_CONFLICT` with `details.lane_state` — the
 *    lane could apply and has nothing yet, for one of four named reasons.
 * ---------------------------------------------------------------------- */

export type LaneNotApplicable = SourceSchemas["LaneNotApplicable"];
export type LaneState = SourceSchemas["LaneState"];

export const LANE_NOT_APPLICABLE_SCHEMA = "research.current-source-not-applicable.v1";

/** Whether a 200 from a current-source read is the typed not-applicable answer. */
export function isLaneNotApplicable(body: unknown): body is LaneNotApplicable {
  return (
    typeof body === "object" &&
    body !== null &&
    (body as { schema_version?: unknown }).schema_version === LANE_NOT_APPLICABLE_SCHEMA
  );
}

/**
 * The lane state a refused current-source read carried, or null. The typed
 * error, the parser and the sentences live in the shared refusal module
 * (`ResearchLaneConflictError`, `readLaneState`, `CURRENT_SOURCE_LANE_COPY`),
 * so S04, S05 and S06 read a 409 the same way.
 */
export const laneStateOf = laneStateOfError;
export const LANE_STATE_COPY = CURRENT_SOURCE_LANE_COPY;

const RUN_PROFILE_WORDS: Record<string, string> = {
  P04_FIXED_QUALIFICATION: "the P04 fixed qualification",
};

/** One sentence for the typed not-applicable answer, built from its own fields. */
export function laneNotApplicableSentence(answer: LaneNotApplicable): string {
  const shared = reasonCodeSentence(answer.lane.reason_code);
  if (shared) return shared;
  const profile = RUN_PROFILE_WORDS[answer.lane.run_profile] ?? answer.lane.run_profile;
  return `Not applicable: this run is bound to ${profile}, which the retained lane never holds — it retains ${answer.lane.retainable_profile_id} runs only. Nothing is pending.`;
}

/**
 * The typed refusal a non-2xx response carries. Shared by the split and search
 * clients so both read `details.lane_state` the same way.
 */
export async function problemOf(response: Response): Promise<PortalApiError> {
  let message = `${response.status} ${response.statusText}`;
  let code: string | null = null;
  let requestId: string | null = response.headers.get("x-request-id");
  let laneState: ReturnType<typeof readLaneState> = null;
  try {
    const problem = (await response.json()) as Partial<SourceSchemas["Problem"]>;
    if (problem?.error?.message) message = problem.error.message;
    code = problem?.error?.code ?? null;
    requestId = problem?.request_id ?? requestId;
    laneState = readLaneState(problem?.details?.lane_state);
  } catch {
    /* non-JSON error body: keep the status line the server gave */
  }
  return laneState !== null
    ? new ResearchLaneConflictError(message, response.status, code, requestId, laneState)
    : new PortalApiError(message, response.status, code, requestId);
}

async function call<T>(path: string, etag?: string | null, signal?: AbortSignal): Promise<Fresh<T>> {
  const response = await fetch(path, {
    credentials: "same-origin",
    signal,
    headers: etag ? { "If-None-Match": etag } : undefined,
  });
  if (response.status === 304) return NOT_MODIFIED;
  if (!response.ok) throw await problemOf(response);
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

  /** `researchCurrentSourceSplitGetV1` — the fold plan, or the typed not-applicable answer. */
  currentSource: (runId: string, options: { workspaceId?: string; signal?: AbortSignal } = {}) =>
    call<CurrentSourceSplit | LaneNotApplicable>(
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
 * RF-05 facts: as-of basis, dataset, not-applicable, absence index
 * ---------------------------------------------------------------------- */

export type AsOfBasis = SplitDetail["as_of_basis"];
export type DatasetFact = SplitSchemas["DatasetFact"];
export type AbsenceIndexEntry = SplitSchemas["AbsenceIndexEntry"];

/**
 * What an as-of time is the time of (CG-P14-04). The number is stable for one
 * immutable revision and is never the read time; the basis says which durable
 * fact it dates. Shared with Screen 06, whose read carries the same enum.
 */
export const AS_OF_BASIS_WORDS: Record<AsOfBasis, string> = {
  P14_PROJECTION_RECEIVED_AT: "when the P14 projection for this run was received",
  RUN_STATE_UPDATED_AT: "when the run's state last changed — no projection has been received",
  LEGACY_READ_MODEL_UPDATED_AT: "when the legacy read model was last updated",
};

/** `1h bars` from the bound dataset (CG-P14-05), or null when none is bound. */
export function barsWord(dataset: DatasetFact): string | null {
  return dataset.state === "AVAILABLE" ? `${dataset.timeframe} bars` : null;
}

/** The dataset binding behind the span, for the fact's title — never guessed. */
export function datasetTitle(dataset: DatasetFact): string {
  if (dataset.state !== "AVAILABLE") return `dataset ${dataset.state.toLowerCase().replace(/_/g, " ")} · ${dataset.reason_code}`;
  const interval =
    dataset.bar_interval_ms === null
      ? `bar interval not fixed${dataset.reason_code ? ` (${dataset.reason_code})` : ""}`
      : `bar interval ${dataset.bar_interval_ms} ms`;
  return `dataset ${dataset.dataset_id} · ${dataset.symbol} · ${dataset.timeframe} · ${interval} · from the P08 dataset binding`;
}

/**
 * The words for a protocol fact the run's protocol has no place for
 * (CG-P14-03): `n/a · three-window`. It is not an absence — nothing is missing
 * — so it is printed as a value, not in the italic of "not published".
 */
export function notApplicableWords(detail: Pick<SplitDetail, "protocol">): string {
  return detail.protocol.kind === "THREE_WINDOW_CURRENT" ? "n/a · three-window" : "n/a";
}

/** RFC 6901: resolve a JSON pointer inside a document, or undefined. */
export function resolvePointer(document: unknown, pointer: string): unknown {
  if (pointer === "") return document;
  if (!pointer.startsWith("/")) return undefined;
  let node: unknown = document;
  for (const raw of pointer.slice(1).split("/")) {
    const token = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    if (typeof node !== "object" || node === null || !(token in node)) return undefined;
    node = (node as Record<string, unknown>)[token];
  }
  return node;
}

/**
 * CG-P14-06: each absence is stated once, from `absence_index`, at the field
 * that owns it. Returns the field-local fact the entry points at.
 */
export function absenceAt(detail: SplitDetail, entry: AbsenceIndexEntry): AbsentFact | null {
  const fact = resolvePointer(detail, entry.pointer);
  if (typeof fact !== "object" || fact === null || !("state" in fact)) return null;
  const { state } = fact as { state: string };
  if (state !== "NOT_PUBLISHED" && state !== "NOT_ASSERTED" && state !== "NOT_APPLICABLE") return null;
  const reason = (fact as { reason_code?: string | null }).reason_code;
  const availability = (fact as { availability?: SplitAvailability }).availability;
  return {
    state,
    reason_code: reason ?? availability?.reason_code ?? state,
    availability: availability ?? { state: "NOT_PUBLISHED", reason_code: reason ?? null },
  } as AbsentFact;
}

/**
 * Reason codes this screen explains in a sentence. The code stays in the
 * title; the sentence is ours. Defined here rather than in `researchRefusal.ts`
 * (owned elsewhere) — see the RF-06 wave C receipt.
 */
export const SPLIT_REASON_WORDS: Record<string, string> = {
  P10_HOLDOUT_BARS_NOT_COUNTED_OUTSIDE_CHILD_TAPE:
    "not counted — P10 counts only rows copied into the child tape, and the holdout is never copied",
  P14_THREE_WINDOW_PROTOCOL_HAS_NO_PURGE: "a three-window run has no train/test boundary to purge",
  P14_THREE_WINDOW_PROTOCOL_HAS_NO_EMBARGO: "a three-window run has no test window to embargo after",
  P14_THREE_WINDOW_PROTOCOL_HAS_NO_INNER_FOLDS: "a three-window run has no nested folds",
};

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
