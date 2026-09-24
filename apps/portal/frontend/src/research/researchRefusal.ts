/**
 * Research Loop — one refusal mapper (RF01-F4, audit F-05).
 *
 * Six screens used to carry six copies of the same function (S01, S03–S07), each deciding
 * by HTTP status alone and each printing the server's sentence as the notice.
 * That lost two things P03 made on purpose: an admission-saturated `503` is
 * `failed-retryable`, not `unavailable`; and a refusal's words on screen are
 * ours and fixed, while the server's text is diagnostic detail.
 *
 * The order is the contract's, most specific first:
 *
 *  1. a P03 refusal code — the three states `state.ts` froze;
 *  2. a code the reading surface publishes (`RESEARCH_<SURFACE>_<KIND>`);
 *  3. the HTTP status, only when neither says more.
 *
 * `message` is fixed screen copy chosen by the resolved state. `detail` is the
 * server's own sentence, shown only inside the disclosure beside it.
 *
 * A `401` also reports the expired session (`auth/sessionExpiry`), which hands
 * the reader to the existing Frame 01D sign-in path; the panel still resolves
 * to `denied` so nothing underneath claims to be current.
 */

import { reportSessionExpired } from "../auth/sessionExpiry";
import { PortalApiError } from "../lib/api";
import { RESEARCH_REFUSAL_CODES, researchState, type ResearchRefusalCode, type ResearchState } from "./state";

export interface ResearchRefusal {
  code: string | null;
  /** Fixed screen copy for the resolved state. Never the server's text. */
  message: string;
  /** The server's own sentence, for the details disclosure only. */
  detail: string | null;
  status: number;
  requestId: string | null;
  state: ResearchState["state"];
  mayRetry: boolean;
  /** True when asking again cannot change the answer. */
  terminal: boolean;
  /** True when a poll or lazy read must stop rather than retry. */
  stopsPolling: boolean;
  /** True for `401`: the session, not this object, is the problem. */
  sessionExpired: boolean;
  /**
   * True when the server said the addressed object does not exist (404).
   * A screen addressed by a run id renders its not-found page — a way back to
   * the Run Library — rather than an empty frame.
   */
  notFound: boolean;
  /**
   * RF-05 CG-P13-09: the `details.lane_state` a current-source `409` carried,
   * when the error that produced this refusal exposes one (`laneState`).
   * Absent or null on every other refusal. Additive: `message` is unchanged,
   * a screen that wants the lane's own sentence reads `CURRENT_SOURCE_LANE_COPY`.
   */
  laneState?: CurrentSourceLaneState | null;
}

type Kind = "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "UNAVAILABLE" | "INVALID" | "NOT_RETAINED";

/**
 * The codes the five evidence-reading surfaces publish, spelled out rather
 * than matched by suffix: a new code is a contract change and should arrive
 * here on purpose, not be classified by accident.
 */
const SURFACE_CODES: Record<string, Kind> = {
  RESEARCH_EVIDENCE_FORBIDDEN: "FORBIDDEN",
  RESEARCH_EVIDENCE_NOT_FOUND: "NOT_FOUND",
  RESEARCH_EVIDENCE_CONFLICT: "CONFLICT",
  RESEARCH_EVIDENCE_UNAVAILABLE: "UNAVAILABLE",
  RESEARCH_EVIDENCE_INVALID: "INVALID",
  RESEARCH_SPLIT_FORBIDDEN: "FORBIDDEN",
  RESEARCH_SPLIT_NOT_FOUND: "NOT_FOUND",
  RESEARCH_SPLIT_CONFLICT: "CONFLICT",
  RESEARCH_SPLIT_UNAVAILABLE: "UNAVAILABLE",
  RESEARCH_SPLIT_INVALID: "INVALID",
  RESEARCH_SEARCH_FORBIDDEN: "FORBIDDEN",
  RESEARCH_SEARCH_NOT_FOUND: "NOT_FOUND",
  RESEARCH_SEARCH_CONFLICT: "CONFLICT",
  RESEARCH_SEARCH_UNAVAILABLE: "UNAVAILABLE",
  RESEARCH_SEARCH_INVALID: "INVALID",
  RESEARCH_FREEZE_FORBIDDEN: "FORBIDDEN",
  RESEARCH_FREEZE_NOT_FOUND: "NOT_FOUND",
  RESEARCH_FREEZE_UNAVAILABLE: "UNAVAILABLE",
  RESEARCH_FREEZE_INVALID: "INVALID",
  RESEARCH_RUN_LIBRARY_FORBIDDEN: "FORBIDDEN",
  RESEARCH_RUN_LIBRARY_NOT_FOUND: "NOT_FOUND",
  RESEARCH_RUN_LIBRARY_UNAVAILABLE: "UNAVAILABLE",
  RESEARCH_RUN_LIBRARY_INVALID: "INVALID",
  RESEARCH_RUN_LIBRARY_CURSOR_INVALID: "INVALID",
  /* P11 progress. Its CONFLICT is not listed: a lost compare-and-set there is
     terminal, which `toProgressRefusal` states on top of the 409. */
  RESEARCH_PROGRESS_FORBIDDEN: "FORBIDDEN",
  RESEARCH_PROGRESS_NOT_FOUND: "NOT_FOUND",
  RESEARCH_PROGRESS_UNAVAILABLE: "UNAVAILABLE",
  RESEARCH_PROGRESS_INVALID: "INVALID",
  /* RS-02 retained current source (S04–S07 passports and retained lanes).
     On these reads CONFLICT means "no sealed retained artifact for this run"
     — PENDING_RETENTION or a legacy run — not a revision that moved. Found on
     the RF-02 real-API lane, where "This changed since it was read" was a
     false sentence about a run whose retention had simply not happened. */
  RESEARCH_CURRENT_SOURCE_CONFLICT: "NOT_RETAINED",
  RESEARCH_CURRENT_SOURCE_FORBIDDEN: "FORBIDDEN",
  RESEARCH_CURRENT_SOURCE_NOT_FOUND: "NOT_FOUND",
  RESEARCH_CURRENT_SOURCE_UNAVAILABLE: "UNAVAILABLE",
  RESEARCH_CURRENT_SOURCE_INVALID: "INVALID",
  RESEARCH_CURRENT_SOURCE_CURSOR_EXPIRED: "CONFLICT",
};

/** Every surface code this mapper classifies, for exhaustiveness tests. */
export const RESEARCH_SURFACE_CODES = Object.keys(SURFACE_CODES);

const KIND_STATE: Record<Kind, ResearchState["state"]> = {
  FORBIDDEN: "denied",
  /* RF-06 FE-X-11: `empty` is a successful answer with zero rows (state
     semantics v1). A 404 is not that — nothing with this id exists — so it is
     terminal, with its own sentence. */
  NOT_FOUND: "terminal",
  CONFLICT: "stale",
  UNAVAILABLE: "unavailable",
  INVALID: "terminal",
  NOT_RETAINED: "unavailable",
};

/** Kinds whose sentence is more specific than their state's. */
const KIND_COPY: Partial<Record<Kind, string>> = {
  NOT_RETAINED:
    "No sealed retained source exists for this run yet — it is pending retention, or the run predates it. Nothing here is taken from the live output instead.",
};

/**
 * The screen's words per state.
 *
 * `denied` neither confirms that the object exists nor says whose it is — that
 * is what `denied` exists to hide (audit F-04). `empty` is worded as a scope
 * fact, not as "deleted".
 */
export const REFUSAL_COPY: Record<string, string> = {
  denied: "You don't have access to this in your current workspace, or it doesn't exist.",
  session: "Your session has expired. Sign in again to continue.",
  empty: "Nothing was found for this in your current workspace.",
  "not-found": "Nothing with this id exists in your current workspace.",
  conflict: "This changed while it was being read. Read it again.",
  stale: "This changed since it was read. Read it again to see the current revision.",
  unavailable: "The Research service did not answer. Try again.",
  "failed-retryable": "The request was not accepted this time. It can be tried again.",
  terminal: "The server refused this request.",
  transport: "The request did not reach the server.",
};

function stateOfStatus(status: number): ResearchState["state"] {
  if (status === 401 || status === 403) return "denied";
  if (status === 404) return "terminal";
  if (status === 409) return "stale";
  if (status >= 500) return "unavailable";
  return "terminal";
}

function isP03Code(code: string | null): code is ResearchRefusalCode {
  return code !== null && (RESEARCH_REFUSAL_CODES as readonly string[]).includes(code);
}

export function toResearchRefusal(error: unknown): ResearchRefusal {
  if (!(error instanceof PortalApiError)) {
    return {
      code: null,
      message: REFUSAL_COPY.transport,
      detail: null,
      status: 0,
      requestId: null,
      state: "failed-retryable",
      mayRetry: true,
      terminal: false,
      stopsPolling: false,
      sessionExpired: false,
      notFound: false,
    };
  }

  const { status, code } = error;
  const sessionExpired = status === 401;
  if (sessionExpired) reportSessionExpired();

  let state: ResearchState["state"];
  let mayRetry: boolean;
  let message: string;
  if (isP03Code(code)) {
    const frozen = researchState({ kind: "refusal", code });
    state = frozen.state;
    mayRetry = frozen.mayRetry;
    message = frozen.reason;
  } else {
    const kind = code !== null && code in SURFACE_CODES ? SURFACE_CODES[code] : null;
    state = kind ? KIND_STATE[kind] : stateOfStatus(status);
    mayRetry = state === "unavailable" || state === "stale" || state === "failed-retryable";
    message = sessionExpired
      ? REFUSAL_COPY.session
      : (kind ? KIND_COPY[kind] : undefined) ??
        (status === 404 ? REFUSAL_COPY["not-found"] : undefined) ??
        REFUSAL_COPY[state] ??
        REFUSAL_COPY.terminal;
  }
  const notFound = status === 404 && state === "terminal";
  const closed = state === "denied" || state === "empty" || notFound;

  return {
    code,
    message,
    detail: error.message || null,
    status,
    requestId: error.requestId,
    state,
    mayRetry,
    terminal: closed,
    stopsPolling: closed,
    sessionExpired,
    notFound,
    /* Only a refusal that carried a lane state gains the key, so every other
       refusal is exactly the object it was before RF-05. */
    ...(laneStateOfError(error) !== null ? { laneState: laneStateOfError(error) } : {}),
  };
}

/** The panel state a refusal resolves to; the server's text rides as detail. */
export function refusalState(refusal: ResearchRefusal, retainsContent: boolean): ResearchState {
  /* RF-06 FE-X-11: `stale` means a retained value is shown with a newer one
     pending. A conflict on a first read has nothing retained, so it is a
     retryable failure, not "this changed since it was read". */
  if (refusal.state === "stale" && !retainsContent) {
    return {
      state: "failed-retryable",
      reason: REFUSAL_COPY.conflict,
      detail: refusalDetail(refusal),
      mayRetry: true,
      retainsContent: false,
    };
  }
  return {
    state: refusal.state,
    reason: refusal.message,
    detail: refusalDetail(refusal),
    mayRetry: refusal.mayRetry,
    retainsContent,
  };
}

/** One line of diagnostics: code, server sentence, request id — whichever exist. */
export function refusalDetail(refusal: Pick<ResearchRefusal, "code" | "detail" | "requestId">): string | null {
  const parts = [refusal.code, refusal.detail, refusal.requestId ? `request_id ${refusal.requestId}` : null].filter(
    (part): part is string => Boolean(part),
  );
  return parts.length > 0 ? parts.join(" · ") : null;
}

/* -------------------------------------------------------------------------
 * RF-05 additions (RF-06 wave C) — additive only.
 *
 * 1. The current-source lane state. A `409 RESEARCH_CURRENT_SOURCE_CONFLICT`
 *    now carries `details.lane_state` (contract `LaneState`), so a screen says
 *    which of the four it is instead of reading the server's message text.
 * 2. Screen sentences for the reason codes RF-05 introduced. A reason code is
 *    diagnostics; the sentence is what a person reads.
 * ---------------------------------------------------------------------- */

/** Contract `research-current-source` `LaneState`, spelled out. */
export type CurrentSourceLaneState =
  | "PENDING_SOURCE"
  | "PENDING_RETENTION"
  | "NOT_RETAINED_LEGACY"
  | "NOT_RETAINED_TERMINAL";

export const CURRENT_SOURCE_LANE_STATES: readonly CurrentSourceLaneState[] = [
  "PENDING_SOURCE",
  "PENDING_RETENTION",
  "NOT_RETAINED_LEGACY",
  "NOT_RETAINED_TERMINAL",
];

/** A value from the wire, accepted only if it is one of the four. */
export function readLaneState(value: unknown): CurrentSourceLaneState | null {
  return typeof value === "string" && (CURRENT_SOURCE_LANE_STATES as readonly string[]).includes(value)
    ? (value as CurrentSourceLaneState)
    : null;
}

/**
 * The lane state an error carries, if any. Duck-typed on `laneState` so any
 * client's typed conflict error (a `PortalApiError` subclass that keeps the
 * `details.lane_state` of its problem body) resolves the same way.
 */
export function laneStateOfError(error: unknown): CurrentSourceLaneState | null {
  if (typeof error !== "object" || error === null || !("laneState" in error)) return null;
  return readLaneState((error as { laneState: unknown }).laneState);
}

/**
 * A current-source 409 that names its lane state. Still a `PortalApiError`,
 * so `toResearchRefusal` classifies it exactly as before and adds `laneState`.
 */
export class ResearchLaneConflictError extends PortalApiError {
  readonly laneState: CurrentSourceLaneState;

  constructor(message: string, status: number, code: string | null, requestId: string | null, laneState: CurrentSourceLaneState) {
    super(message, status, code, requestId);
    this.name = "ResearchLaneConflictError";
    this.laneState = laneState;
  }
}

/** Screen copy per lane state (the contract's `LaneState` description, as sentences). */
export const CURRENT_SOURCE_LANE_COPY: Record<CurrentSourceLaneState, string> = {
  PENDING_SOURCE: "The run has not completed, so the retained source has nothing for it yet.",
  PENDING_RETENTION: "The run completed; its sealed artifact has not been retained yet.",
  NOT_RETAINED_LEGACY: "This is a legacy 1.0.8 metadata run. It was never retained, and never will be.",
  NOT_RETAINED_TERMINAL: "The run was cancelled or failed before a sealed artifact was retained.",
};

/**
 * Sentences for the reason codes the RF-05 contracts publish (research-evidence
 * registry v3 and series, current-source not-applicable). An unknown code has
 * no sentence here; the caller falls back to its availability word.
 */
export const REASON_CODE_SENTENCES: Record<string, string> = {
  P13_SOURCE_PREDATES_OOS_ANALYTICS:
    "This run was sealed before OOS analytics were published, so the engine's OOS figures were never recorded for it.",
  P13_SOURCE_EVIDENCE_NOT_PUBLISHED: "This run published no sealed evidence.",
  P13_OOS_HAS_NO_MONTH_WITH_PRIOR_CALENDAR_CLOSE:
    "No OOS month has a prior calendar month-end close to measure from, so no monthly return exists.",
  P13_OOS_DAILY_RETURNS_BELOW_ROLLING_WINDOW:
    "The OOS window has fewer daily returns than the 63-day rolling window, so no rolling value exists.",
  P13_IS_BOUNDARY_NOT_IN_CHILD_RECEIPT:
    "The IS/OOS boundary is not in the run's receipt, so no IS Sharpe was measured and no decay can be stated.",
  P13_OOS_RETURN_ZERO_VARIANCE:
    "OOS returns have zero variance; the engine's ratio would be a placeholder, not a measurement.",
  P13_OOS_HAS_NO_DOWNSIDE_RETURNS: "OOS has no downside return, so the Sortino ratio is undefined.",
  P13_OOS_HAS_NO_LOSING_RETURNS: "OOS has no losing return, so the profit factor is undefined.",
  P13_OOS_HAS_NO_LONG_EXPOSURE_BARS: "No OOS bar held a long position, so there is no long-bar hit rate.",
  P13_OOS_HAS_NO_SHORT_EXPOSURE_BARS: "No OOS bar held a short position, so there is no short-bar hit rate.",
  P13_OOS_LONG_EXPOSURE_NOT_IN_EVERY_SYMBOL:
    "Not every symbol held a long position in OOS, so the engine's long-bar hit rate is not one figure for the run.",
  P13_OOS_SHORT_EXPOSURE_NOT_IN_EVERY_SYMBOL:
    "Not every symbol held a short position in OOS, so the engine's short-bar hit rate is not one figure for the run.",
  P13_OOS_SPAN_BELOW_ONE_DAY: "The OOS span is shorter than one day, so no annualised figure is defined.",
  P13_QUANTBT_CAGR_CLAMPED: "QuantBT clamped the CAGR at its bound, so the value would be a limit, not a measurement.",
  P13_RECEIPT_BYTE_BUDGET_EXHAUSTED: "The run's receipt reached its size budget before this analytic was recorded.",
  P13_ENGINE_LOCATOR_MISMATCH:
    "The engine field this figure is read from did not match its declared locator, so it is withheld rather than guessed.",
  P13_ENGINE_RESULT_NOT_AVAILABLE_TO_ANALYTICS:
    "The engine result was not available to the analytics step, so nothing was read from it.",
  P13_ROLLING_SHARPE_ZERO_VARIANCE_WINDOWS:
    "Some 63-day windows have zero variance; their Sharpe would be a placeholder, so the series is withheld.",
  P13_LEADING_MONTH_NOT_CONTIGUOUS_WITH_SOURCE_MONTHS:
    "The first month is not contiguous with the published months, so the monthly series is withheld.",
  P04_SOURCE_DID_NOT_PUBLISH_BENCHMARK:
    "This run's adapter published no benchmark series, so no beta against a benchmark can be stated.",
  RS02_RETAINED_LANE_NOT_APPLICABLE_TO_P04_FIXED_QUALIFICATION:
    "This run is bound to the P04 fixed qualification, which the retained lane never holds. Nothing is pending.",
};

/** The sentence for a reason code, or null when this module has none. */
export function reasonCodeSentence(code: string | null | undefined): string | null {
  return code && code in REASON_CODE_SENTENCES ? REASON_CODE_SENTENCES[code] : null;
}
