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
 * Contract 1.1.0 (W6b) publishes a private weak ETag and a `304`
 * (CG-P19-02): this module keeps one copy per exact request and resends its
 * validator, so coming back to Screen 10 costs a `304`, not the graph again.
 * A bounded history (`P19_BOUNDED_GRAPH_LIMIT_REACHED`) is the NEWEST page;
 * older attempts are read only with the opaque `older_cursor` the server
 * issued (CG-P19-09) — the browser never builds a boundary.
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
export type ReleaseCandidateRef = LineageSchemas["ReleaseCandidateRef"];
export type RunFacts = LineageSchemas["RunFacts"];
export type RunMetricFact = LineageSchemas["RunMetricFact"];
export type ParamRange = LineageSchemas["ParamRange"];
export type PresentationReason = LineageSchemas["PresentationReason"];
export type PromotionState = LineageAttempt["promotion_state"];

const ALPHAS = "/api/v1/research/alphas";

/** The contract's own ceiling for one graph, and the hook's default. */
export const LINEAGE_LIMIT_MAX = 128;

export function lineageHref(alphaId: string, options: { attempt?: string | null; av?: string | null } = {}): string {
  const params = new URLSearchParams();
  if (options.av) params.set("av", options.av);
  if (options.attempt) params.set("attempt", options.attempt);
  const query = params.toString();
  return "/research/quantbt/alphas/" + encodeURIComponent(alphaId) + "/lineage" + (query ? `?${query}` : "");
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
  /** A server older than contract 1.1.0 did not send this field at all. */
  serverPredatesW6b: "P19_SERVER_PREDATES_LINEAGE_CONTRACT_1_1",
} as const;

interface LineageRequest {
  workspaceId?: string;
  limit?: number;
  /** Only a `coverage.older_cursor` this route issued. */
  cursor?: string | null;
}

function lineageQuery(options: LineageRequest): string {
  const params = new URLSearchParams();
  if (options.workspaceId) params.set("workspace_id", options.workspaceId);
  if (typeof options.limit === "number") params.set("limit", String(options.limit));
  if (options.cursor) params.set("cursor", options.cursor);
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

/* -------------------------------------------------------------------------
 * A server that predates contract 1.1.0
 * ---------------------------------------------------------------------- */

const PRE_W6B: LineageAvailability = { state: "NOT_PUBLISHED", reason_code: LINEAGE_REASON.serverPredatesW6b };

/**
 * Contract 1.1.0 only added fields. When an older server answers, each missing
 * field becomes its typed absence here — never a zero, never a guessed value —
 * so the screen renders one shape. A field the server did send is untouched.
 */
export function normalizeLineage(raw: Lineage): Lineage {
  const metric = { value: null, source: null, scope: null, definition_id: null, availability: PRE_W6B };
  const versions = raw.alpha.versions.map((version) => ({
    ...version,
    promotion_pick: {
      ...version.promotion_pick,
      source_authority: version.promotion_pick.source_authority ?? {
        owner: "P22_RELEASE_CANDIDATE_APPROVAL" as const,
        state: version.promotion_pick.state === "PUBLISHED" ? ("CONNECTED" as const) : ("NOT_CONNECTED" as const),
      },
      release_candidate: version.promotion_pick.release_candidate ?? null,
      release_candidate_availability: version.promotion_pick.release_candidate_availability ?? PRE_W6B,
    },
    outcome: version.outcome ?? { text: null, rule: "research.lineage-version-outcome.v1" as const, availability: PRE_W6B },
    supersession: version.supersession ?? {
      state: "NOT_RECORDED" as const,
      superseded_by_version_id: null,
      superseded_by_label: null,
      reason_code: LINEAGE_REASON.serverPredatesW6b,
    },
    exercised: version.exercised ?? {
      routes: [], modes: [], param_ranges: [], attempts_considered: 0, attempts_without_manifest: 0, availability: PRE_W6B,
    },
    untried: version.untried ?? { routes: [], availability: PRE_W6B },
    presentation: version.presentation ?? null,
  }));
  const attempts = raw.attempts.map((attempt) => ({
    ...attempt,
    primary_run: { ...attempt.primary_run, execution_profile_id: attempt.primary_run.execution_profile_id ?? null },
    presentation_kind: attempt.presentation_kind ?? ("STORIED" as const),
    presentation_reasons: attempt.presentation_reasons ?? [],
    promotion_state: attempt.promotion_state ?? null,
    promotion_reason_code: attempt.promotion_reason_code ?? LINEAGE_REASON.serverPredatesW6b,
    spec_label: attempt.spec_label ?? { text: null, space: null, availability: PRE_W6B },
    release_candidate: attempt.release_candidate ?? null,
    release_candidate_availability: attempt.release_candidate_availability ?? PRE_W6B,
    run_facts: attempt.run_facts ?? {
      certificate: { grade: null, availability: PRE_W6B },
      claim: { state: null, text: null, availability: PRE_W6B },
      oos_sharpe: metric,
      decay: metric,
    },
    outcome: attempt.outcome ?? { text: null, source: null, availability: PRE_W6B },
  }));
  return {
    ...raw,
    alpha: { ...raw.alpha, versions: versions as unknown as LineageVersion[] },
    attempts: attempts as unknown as LineageAttempt[],
    coverage: {
      ...raw.coverage,
      window: raw.coverage.window ?? "NEWEST",
      older_cursor: raw.coverage.older_cursor ?? null,
    },
  };
}

/** Whether the answering server publishes the 1.1.0 facts (probe/storied split in particular). */
export function lineageHasPresentation(lineage: Lineage): boolean {
  return lineage.presentation_rule !== undefined && lineage.presentation_rule !== null;
}

/* -------------------------------------------------------------------------
 * Transport with one held copy per exact request (CG-P19-02)
 * ---------------------------------------------------------------------- */

interface Held {
  etag: string;
  lineage: Lineage;
}

/** Most recent answers first; a handful is enough for back/forward between Alphas. */
const HELD_LIMIT = 12;
const held = new Map<string, Held>();

function hold(path: string, etag: string | null, lineage: Lineage) {
  if (!etag) return;
  held.delete(path);
  held.set(path, { etag, lineage });
  while (held.size > HELD_LIMIT) held.delete(held.keys().next().value as string);
}

/** Tests only: forget every held copy. */
export function resetLineageCache(): void {
  held.clear();
}

async function problem(response: Response): Promise<PortalApiError> {
  let code: string | null = null;
  let requestId: string | null = response.headers.get("x-request-id");
  try {
    const body = (await response.json()) as Partial<LineageSchemas["Problem"]>;
    code = body?.error?.code ?? null;
    requestId = body?.request_id ?? requestId;
  } catch {
    /* non-JSON error body: the status is still typed */
  }
  /* The server's prose is never rendered: the screen speaks from
     `LINEAGE_REFUSAL_COPY`, keyed by status. */
  return new PortalApiError(`${response.status} ${response.statusText}`, response.status, code, requestId);
}

export interface LineageAnswer {
  lineage: Lineage;
  /** True when the server answered `304` and the held copy is still current. */
  revalidated: boolean;
}

async function read(path: string, signal?: AbortSignal): Promise<LineageAnswer> {
  const copy = held.get(path) ?? null;
  const response = await fetch(path, {
    credentials: "same-origin",
    signal,
    headers: copy ? { "If-None-Match": copy.etag } : undefined,
  });
  if (response.status === 304) {
    if (copy) return { lineage: copy.lineage, revalidated: true };
    /* The copy was dropped between the request and the answer: ask once more, unconditionally. */
    const retry = await fetch(path, { credentials: "same-origin", signal, cache: "reload" });
    if (!retry.ok) throw await problem(retry);
    const lineage = normalizeLineage((await retry.json()) as Lineage);
    hold(path, retry.headers.get("ETag") ?? lineage.etag ?? null, lineage);
    return { lineage, revalidated: false };
  }
  if (!response.ok) {
    held.delete(path);
    throw await problem(response);
  }
  const lineage = normalizeLineage((await response.json()) as Lineage);
  hold(path, response.headers.get("ETag") ?? lineage.etag ?? null, lineage);
  return { lineage, revalidated: false };
}

export function lineagePath(alphaId: string, options: LineageRequest = {}): string {
  return `${ALPHAS}/${encodeURIComponent(alphaId)}/lineage${lineageQuery(options)}`;
}

export const lineageApi = {
  /** `researchAttemptLineageGetV1`; resends the held validator for the same exact request. */
  get: (alphaId: string, options: LineageRequest & { signal?: AbortSignal } = {}) =>
    read(lineagePath(alphaId, options), options.signal),
} as const;

/* -------------------------------------------------------------------------
 * Older pages (CG-P19-09)
 * ---------------------------------------------------------------------- */

/**
 * The newest page with an older page in front of it. Attempts are concatenated
 * as the server returned them (both pages are chronological, the older page
 * strictly older); nothing is re-sorted. Counts stay the server's, with
 * `returned_attempts` and the storied/probe split taken from the attempts in
 * hand. Coverage is COMPLETE only when the server's total is now in hand.
 */
export function mergeOlder(newest: Lineage, older: Lineage): Lineage {
  const seen = new Set(newest.attempts.map((attempt) => attempt.attempt_id));
  const attempts = [...older.attempts.filter((attempt) => !seen.has(attempt.attempt_id)), ...newest.attempts];
  const all = attempts.length >= newest.counts.total_attempts;
  return {
    ...newest,
    attempts,
    counts: {
      ...newest.counts,
      returned_attempts: attempts.length,
      storied_returned: attempts.filter((attempt) => attempt.presentation_kind === "STORIED").length,
      probe_returned: attempts.filter((attempt) => attempt.presentation_kind === "PROBE").length,
    },
    coverage: {
      ...newest.coverage,
      state: all ? "COMPLETE" : "PARTIAL",
      reason_code: all ? null : newest.coverage.reason_code,
      oldest_returned_created_at_utc_ms: attempts[0]?.created_at_utc_ms ?? null,
      older_cursor: all ? null : older.coverage.older_cursor,
    },
  };
}

/* -------------------------------------------------------------------------
 * Words
 * ---------------------------------------------------------------------- */

export const LINEAGE_WITHHELD_WORDS: Record<LineageAvailability["state"], string> = {
  AVAILABLE: "available",
  NOT_PUBLISHED: "not published",
  PARTIAL: "partial",
  NOT_APPLICABLE: "not applicable",
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
