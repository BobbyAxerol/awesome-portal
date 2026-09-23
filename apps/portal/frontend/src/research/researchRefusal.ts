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
}

type Kind = "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "UNAVAILABLE" | "INVALID";

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
};

/** Every surface code this mapper classifies, for exhaustiveness tests. */
export const RESEARCH_SURFACE_CODES = Object.keys(SURFACE_CODES);

const KIND_STATE: Record<Kind, ResearchState["state"]> = {
  FORBIDDEN: "denied",
  NOT_FOUND: "empty",
  CONFLICT: "stale",
  UNAVAILABLE: "unavailable",
  INVALID: "terminal",
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
  stale: "This changed since it was read. Read it again to see the current revision.",
  unavailable: "The Research service did not answer. Try again.",
  "failed-retryable": "The request was not accepted this time. It can be tried again.",
  terminal: "The server refused this request.",
  transport: "The request did not reach the server.",
};

function stateOfStatus(status: number): ResearchState["state"] {
  if (status === 401 || status === 403) return "denied";
  if (status === 404) return "empty";
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
    state = code !== null && code in SURFACE_CODES ? KIND_STATE[SURFACE_CODES[code]] : stateOfStatus(status);
    mayRetry = state === "unavailable" || state === "stale" || state === "failed-retryable";
    message = sessionExpired ? REFUSAL_COPY.session : REFUSAL_COPY[state] ?? REFUSAL_COPY.terminal;
  }
  const closed = state === "denied" || state === "empty";

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
  };
}

/** The panel state a refusal resolves to; the server's text rides as detail. */
export function refusalState(refusal: ResearchRefusal, retainsContent: boolean): ResearchState {
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
