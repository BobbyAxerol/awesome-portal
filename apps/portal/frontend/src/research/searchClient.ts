/**
 * Research Loop — Search client (P15 + RS-02, Screen 06).
 *
 * Two named reads:
 *
 *  - **P15 `researchSearchDetailGetV1`** publishes what the installed source
 *    actually did: a fixed parameter profile with declared bounds, and typed
 *    absences for every optimizer fact a search would have produced.
 *  - **RS-02 `researchCurrentSourceSearchGetV1`** publishes the retained trial
 *    ledger, candidates and selection for the one admitted Advanced-WFO
 *    profile, with opaque keyset cursors.
 *
 * The screen computes no objective, no rank and no digest. `position_percent`
 * is the server's own placement of a value inside its range — the browser does
 * not work out where θ* sits, because that would be a second opinion about a
 * number the source already published.
 */

import type { components as SearchComponents } from "@portal/contracts-research-search";
import type { components as CurrentSourceComponents } from "@portal/contracts-research-current-source";

import { problemOf, type LaneNotApplicable } from "./splitClient";
import { toResearchRefusal, type ResearchRefusal } from "./researchRefusal";

type SearchSchemas = SearchComponents["schemas"];
type SourceSchemas = CurrentSourceComponents["schemas"];

export type SearchDetail = SearchSchemas["SearchDetail"];
export type SearchAvailability = SearchSchemas["Availability"];
export type SearchSourceGap = SearchSchemas["SourceGap"];
export type Parameter = SearchSchemas["Parameter"];
export type Diagnostics = SearchSchemas["Diagnostics"];
export type ClaimRow = SearchSchemas["ClaimRow"];
export type ClaimTokenFact = SearchSchemas["ClaimTokenFact"];
export type OosColumn = SearchSchemas["OosColumn"];
export type ScoringBackend = SearchSchemas["ScoringBackend"];

export type CurrentSourceSearch = SourceSchemas["Search"];
export type SourceTrial = SourceSchemas["Trial"];
export type SourceCandidate = SourceSchemas["Candidate"];

const RUNS = "/api/v1/quantbt/runs";

export const NOT_MODIFIED = Symbol("search.not-modified");
export type Fresh<T> = T | typeof NOT_MODIFIED;

/**
 * The query the browser may send, and all of it.
 *
 * `fold` is the only selector the contract declares; the current source has no
 * optimizer fold, so the server answers `NOT_APPLICABLE` rather than treating
 * a fold as a trial. Nothing else — no relation, cursor, revision or command —
 * is ever assembled here.
 */
function query(options: { workspaceId?: string; fold?: number | null }): string {
  const params = new URLSearchParams();
  if (options.workspaceId) params.set("workspace_id", options.workspaceId);
  if (typeof options.fold === "number") params.set("fold", String(options.fold));
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

async function call<T>(path: string, etag?: string | null, signal?: AbortSignal): Promise<Fresh<T>> {
  const response = await fetch(path, {
    credentials: "same-origin",
    signal,
    headers: etag ? { "If-None-Match": etag } : undefined,
  });
  if (response.status === 304) return NOT_MODIFIED;
  /* One parser for both clients, so a current-source 409's lane state is read the same way. */
  if (!response.ok) throw await problemOf(response);
  return (await response.json()) as T;
}

export const searchApi = {
  /** `researchSearchDetailGetV1` */
  detail: (
    runId: string,
    options: { workspaceId?: string; fold?: number | null; etag?: string | null; signal?: AbortSignal } = {},
  ) =>
    call<SearchDetail>(
      `${RUNS}/${encodeURIComponent(runId)}/search${query(options)}`,
      options.etag,
      options.signal,
    ),

  /** `researchCurrentSourceSearchGetV1` — the retained ledger, or the typed not-applicable answer. */
  currentSource: (
    runId: string,
    options: { workspaceId?: string; cursor?: string | null; candidateCursor?: string | null; fold?: string | null; signal?: AbortSignal } = {},
  ) => {
    const params = new URLSearchParams();
    if (options.workspaceId) params.set("workspace_id", options.workspaceId);
    /* F2: the retained fold id (the split's `fold_id`), echoed as the plan published it — never a number the cursor holds. */
    if (options.fold) params.set("fold", options.fold);
    /* The cursor is echoed exactly as the server minted it; it is never
       decoded, rebuilt or compared. */
    if (options.cursor) params.set("cursor", options.cursor);
    /* The candidate pool pages on its own relation: its cursor is never a trial cursor and is sent alone (it addresses only `candidates`). */
    if (options.candidateCursor) params.set("candidate_cursor", options.candidateCursor);
    const serialized = params.toString();
    return call<CurrentSourceSearch | LaneNotApplicable>(
      `${RUNS}/${encodeURIComponent(runId)}/current-source/search${serialized ? `?${serialized}` : ""}`,
      null,
      options.signal,
    );
  },
} as const;

/* -------------------------------------------------------------------------
 * Presentation
 * ---------------------------------------------------------------------- */

export function isAvailable(availability: SearchAvailability): boolean {
  return availability.state === "AVAILABLE";
}

export const SEARCH_WITHHELD_WORDS: Record<SearchAvailability["state"], string> = {
  AVAILABLE: "available",
  NOT_PUBLISHED: "not published",
  NOT_APPLICABLE: "not applicable",
  PENDING_SOURCE_CALLBACK: "pending source",
  LEGACY_METADATA_ONLY: "legacy metadata",
};

/**
 * `NOT_APPLICABLE` and `NOT_PUBLISHED` are different answers, and
 * `NOT_ASSERTED` is a third.
 *
 * On this screen the difference carries the whole methodology: a trial ledger
 * that does not apply, because no search ran, is not a ledger the source
 * failed to send — and neither is a strict outer-OOS selector nobody asserted.
 */
export const SEARCH_GAP_WORDS: Record<SearchSourceGap["state"], string> = {
  NOT_PUBLISHED: "not published",
  NOT_APPLICABLE: "not applicable",
  NOT_ASSERTED: "not asserted",
};

export function gapReason(gap: { reason_code?: string | null; availability?: SearchAvailability }): string {
  return gap.reason_code ?? gap.availability?.reason_code ?? gap.availability?.state ?? "unknown";
}

/** The seven diagnostics the contract names, in the order Stage A reads them. */
export const DIAGNOSTIC_KEYS = [
  "scatter",
  "distributions",
  "parameter_frequency",
  "progression",
  "prune_reasons",
  "importance",
  "interactions",
] as const;

export type DiagnosticKey = (typeof DIAGNOSTIC_KEYS)[number];

/* -------------------------------------------------------------------------
 * Refusals
 * ---------------------------------------------------------------------- */

/**
 * RF01-F4: one refusal mapper serves every Research surface
 * (`researchRefusal.ts`). These names stay so existing callers and the
 * shared-module rule (additive only) hold.
 */
export type SearchRefusal = ResearchRefusal;
export const toSearchRefusal = toResearchRefusal;
