/**
 * Research Loop — Attempt Lineage client (P19, Screen 10).
 *
 * One named read and nothing else:
 *
 *  - `researchAttemptLineageGetV1` — one bounded, persisted lineage snapshot
 *    for one Alpha: its versions, up to 128 attempts in chronological order,
 *    exact counts, the coverage boundary and a typed absence for every fact
 *    the source did not publish.
 *
 * The contract declares no ETag and no `304`, so this module sends no
 * validator and keeps no copy. It has no cursor either: when the graph is
 * larger than the bound the answer says so (`P19_BOUNDED_GRAPH_LIMIT_REACHED`)
 * and the screen shows the boundary instead of reading on.
 *
 * Nothing here orders, compares or picks an attempt. A promotion pick is a
 * source fact or a typed absence, never a browser decision.
 */

import type { components as LineageComponents } from "@portal/contracts-research-attempt-lineage";

import { PortalApiError } from "../lib/api";
import type { ResearchState } from "./state";

type LineageSchemas = LineageComponents["schemas"];

export type Lineage = LineageSchemas["AttemptLineageResponse"];
export type LineageAlpha = Lineage["alpha"];
export type LineageVersion = LineageSchemas["AlphaVersion"];
export type LineageAttempt = LineageSchemas["AttemptNode"];
export type LineageAttemptState = LineageAttempt["state"];
export type LineageAvailability = LineageSchemas["Availability"];
export type PromotionPick = LineageSchemas["PromotionPick"];
export type SemanticDiff = LineageSchemas["SemanticDiff"];
export type SemanticChange = LineageSchemas["SemanticChange"];
export type ChildRun = LineageSchemas["ChildRun"];
export type ChildRunsCoverage = LineageSchemas["ChildRunsCoverage"];
export type Exposure = LineageSchemas["Exposure"];
export type LineageCounts = Lineage["counts"];
export type LineageCoverage = Lineage["coverage"];

const ALPHAS = "/api/v1/research/alphas";

/** The contract's own ceiling for one graph, and the hook's default. */
export const LINEAGE_LIMIT_MAX = 128;

export function lineageHref(alphaId: string): string {
  return "/research/quantbt/alphas/" + encodeURIComponent(alphaId) + "/lineage";
}

/** Reason codes the P19 service publishes (`lineage.service.ts`). */
export const LINEAGE_REASON = {
  boundedGraph: "P19_BOUNDED_GRAPH_LIMIT_REACHED",
  childRunsBounded: "P19_CHILD_RUNS_BOUNDED_PER_ATTEMPT",
  promotionPickAbsent: "P19_SOURCE_DID_NOT_PUBLISH_PROMOTION_PICK",
  parentOutside: "P19_PARENT_OUTSIDE_BOUNDED_GRAPH",
  diffManifestAbsent: "P19_PERSISTED_PREFLIGHT_MANIFEST_NOT_AVAILABLE_FOR_PARENT_DIFF",
  exposureAbsent: "P19_NO_EXPOSURE_FACT_PUBLISHED_FOR_ATTEMPT",
  noActiveVersion: "P19_ALPHA_HAS_NO_ACTIVE_VERSION",
} as const;

function lineageQuery(options: { workspaceId?: string; limit?: number }): string {
  const params = new URLSearchParams();
  if (options.workspaceId) params.set("workspace_id", options.workspaceId);
  if (typeof options.limit === "number") params.set("limit", String(options.limit));
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

async function call<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { credentials: "same-origin", signal });
  if (!response.ok) {
    let code: string | null = null;
    let requestId: string | null = response.headers.get("x-request-id");
    try {
      const problem = (await response.json()) as Partial<LineageSchemas["Problem"]>;
      code = problem?.error?.code ?? null;
      requestId = problem?.request_id ?? requestId;
    } catch {
      /* non-JSON error body: the status is still typed */
    }
    /* The server's prose is never rendered: the screen speaks from
       `LINEAGE_REFUSAL_COPY`, keyed by status. */
    throw new PortalApiError(`${response.status} ${response.statusText}`, response.status, code, requestId);
  }
  return (await response.json()) as T;
}

export function lineagePath(alphaId: string, options: { workspaceId?: string; limit?: number } = {}): string {
  return `${ALPHAS}/${encodeURIComponent(alphaId)}/lineage${lineageQuery(options)}`;
}

export const lineageApi = {
  /** `researchAttemptLineageGetV1` */
  get: (alphaId: string, options: { workspaceId?: string; limit?: number; signal?: AbortSignal } = {}) =>
    call<Lineage>(lineagePath(alphaId, options), options.signal),
} as const;

/* -------------------------------------------------------------------------
 * Words
 * ---------------------------------------------------------------------- */

export const LINEAGE_WITHHELD_WORDS: Record<LineageAvailability["state"], string> = {
  AVAILABLE: "available",
  NOT_PUBLISHED: "not published",
  PARTIAL: "partial",
};

/** The reason an absence carries, most specific first. */
export function absenceReason(fact: { reason_code?: string | null; availability?: LineageAvailability }): string {
  return fact.reason_code ?? fact.availability?.reason_code ?? fact.availability?.state ?? "unknown";
}

/* -------------------------------------------------------------------------
 * Refusals
 * ---------------------------------------------------------------------- */

/**
 * Fixed copy per refusal. 403 and 404 say the same sentence and take the same
 * state (and so the same badge) on purpose: the server answers a foreign
 * workspace and an unknown Alpha identically, so the screen must not turn
 * either into an existence hint (audit F-04). `denied` is the state both take:
 * it withholds content without claiming the alpha has none, which `empty`
 * would.
 */
export const LINEAGE_NEUTRAL_REFUSAL =
  "This alpha may not exist or may be outside your access — nothing here confirms either.";

export const LINEAGE_REFUSAL_COPY = {
  network: "The request did not reach the server.",
  400: "This lineage request is not valid. Reopen the lineage from the run library.",
  401: "Your session has ended. Sign in again to read this lineage.",
  403: LINEAGE_NEUTRAL_REFUSAL,
  404: LINEAGE_NEUTRAL_REFUSAL,
  503: "Attempt lineage is unavailable right now. Nothing on this screen was changed.",
  other: "The lineage could not be read.",
} as const;

export interface LineageRefusal {
  code: string | null;
  message: string;
  status: number;
  requestId: string | null;
  state: ResearchState["state"];
  mayRetry: boolean;
  /** True when asking again cannot change the answer. */
  terminal: boolean;
}

export function toLineageRefusal(error: unknown): LineageRefusal {
  if (!(error instanceof PortalApiError)) {
    return {
      code: null,
      message: LINEAGE_REFUSAL_COPY.network,
      status: 0,
      requestId: null,
      state: "failed-retryable",
      mayRetry: true,
      terminal: false,
    };
  }
  const { status } = error;
  const known = status === 400 || status === 401 || status === 403 || status === 404 || status === 503;
  return {
    code: error.code,
    message: known ? LINEAGE_REFUSAL_COPY[status] : LINEAGE_REFUSAL_COPY.other,
    status,
    requestId: error.requestId,
    state:
      status === 401 || status === 403 || status === 404
        ? "denied"
        : status >= 500
          ? "unavailable"
          : "terminal",
    mayRetry: status >= 500,
    terminal: status === 400 || status === 401 || status === 403 || status === 404,
  };
}

/* -------------------------------------------------------------------------
 * Screen state from a typed answer
 * ---------------------------------------------------------------------- */

/** The boundaries and absences the answer itself declares, for the partial notice. */
export function lineageGaps(lineage: Lineage): string[] {
  const gaps: string[] = [];
  if (lineage.coverage.state === "PARTIAL") {
    gaps.push(`bounded history (${lineage.coverage.reason_code ?? LINEAGE_REASON.boundedGraph})`);
  }
  if (lineage.attempts.some((attempt) => attempt.child_runs_coverage.state === "PARTIAL")) {
    gaps.push(`bounded child runs (${LINEAGE_REASON.childRunsBounded})`);
  }
  const absences = lineage.source_absences;
  if (absences.promotion_pick.state !== "AVAILABLE") {
    gaps.push(`promotion pick (${absenceReason(absences.promotion_pick)})`);
  }
  if (absences.historical_semantic_diff.state !== "AVAILABLE") {
    gaps.push(`historical semantic diff (${absenceReason(absences.historical_semantic_diff)})`);
  }
  return gaps;
}

export function lineageState(lineage: Lineage): ResearchState {
  if (lineage.counts.returned_attempts === 0) {
    return {
      state: "empty",
      reason: "No attempt is recorded for this alpha yet. Its versions are shown above.",
      mayRetry: false,
      retainsContent: true,
    };
  }
  const gaps = lineageGaps(lineage);
  if (gaps.length > 0) {
    return {
      state: "partial",
      reason: `Persisted lineage with declared gaps: ${gaps.join(", ")}. Each is named where it applies.`,
      mayRetry: false,
      retainsContent: true,
    };
  }
  return { state: "available", reason: "", mayRetry: false, retainsContent: true };
}
