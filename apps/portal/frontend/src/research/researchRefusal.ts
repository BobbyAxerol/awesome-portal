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
   * True when the addressed object cannot be shown here: a 403 or a 404,
   * deliberately not told apart (F-04). A screen addressed by a run id renders
   * its neutral not-available page — a way back to the Run Library — rather
   * than an empty frame.
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
  /* P21 Screen 11. CONFLICT is a lost draft/source CAS fence: the screen reads
     the composition again and keeps what the reader typed. NOT_PUBLISHABLE is
     the server's 422 "cannot be locally sealed" — terminal for that request. */
  RESEARCH_RELEASE_CANDIDATE_FORBIDDEN: "FORBIDDEN",
  RESEARCH_RELEASE_CANDIDATE_NOT_FOUND: "NOT_FOUND",
  RESEARCH_RELEASE_CANDIDATE_CONFLICT: "CONFLICT",
  RESEARCH_RELEASE_CANDIDATE_UNAVAILABLE: "UNAVAILABLE",
  RESEARCH_RELEASE_CANDIDATE_INVALID: "INVALID",
  RESEARCH_RELEASE_CANDIDATE_NOT_PUBLISHABLE: "INVALID",
};

/** Every surface code this mapper classifies, for exhaustiveness tests. */
export const RESEARCH_SURFACE_CODES = Object.keys(SURFACE_CODES);

const KIND_STATE: Record<Kind, ResearchState["state"]> = {
  FORBIDDEN: "denied",
  /* X3 2026-09-26 (VD-P23-03 / B3, one rule for every Research screen): a
     404 is never `empty` (RF-06 FE-X-11 stands), and it is not told apart
     from a 403 either. The server answers a foreign workspace and a missing
     id alike (P18/P19/P20 handoffs: "foreign/not-found objects must remain
     indistinguishable"), so both resolve to `denied` with the one F-04
     sentence and the same way back. */
  NOT_FOUND: "denied",
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

/**
 * The screen's fixed sentence for a refusal that resolved to `state` (VD-P23-01).
 * For the clients that keep their own code tables (foundation, alpha import):
 * the server's text rides as `detail`, never as this sentence.
 */
export function refusalCopy(state: ResearchState["state"], status: number): string {
  if (status === 401) return REFUSAL_COPY.session;
  return REFUSAL_COPY[state] ?? REFUSAL_COPY.terminal;
}

/** The state a bare HTTP status resolves to when no code says more (403 = 404, F-04). */
export function stateOfStatus(status: number): ResearchState["state"] {
  if (status === 401 || status === 403 || status === 404) return "denied";
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
      : (kind ? KIND_COPY[kind] : undefined) ?? REFUSAL_COPY[state] ?? REFUSAL_COPY.terminal;
  }
  /* The addressed object cannot be shown here — 403 and 404 alike (F-04), so
     a run-addressed screen renders the same neutral page for both. */
  const notFound = (status === 403 || status === 404) && state === "denied";
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
  /* E10: failures the Portal closed itself — the server's typed control reason. */
  P06_RETRY_NOT_DISPATCHED: "The run lost its worker and no retry was ever dispatched, so the Portal closed it. Start a new run from the same spec.",
  P11_TERMINAL_SIDECAR_FAILED: "The engine finished, but the Portal could not record its terminal result, so the run was closed as failed.",
  P11_TERMINAL_SIDECAR_PAYLOAD_LOST: "The engine finished, but its terminal payload was lost before the Portal could record it, so the run was closed as failed.",
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
  /*
   * E16 (P17): the P04 hub lane's replay absences, as sentences.
   *
   * These are the source's own answer, not a gap in the Portal. The P04
   * qualification publishes a bounded evidence receipt — equity, returns and
   * their distributions — and no execution tape, so a replay of it can show
   * the account over time and nothing that happened bar by bar. The candle
   * sentence is deliberately about what the read holds, not about why:
   * whether the source could retain bars is the engine's question, recorded
   * in the P17 evidence, and the screen does not answer it.
   */
  P04_SOURCE_DID_NOT_PUBLISH_REPLAY_CANDLE_WINDOWS:
    "This run's adapter published no price bars with its evidence, so the replay draws the equity samples it did publish and no candles.",
  P04_SOURCE_DID_NOT_PUBLISH_EXECUTION_ORDER_LEDGER:
    "This run's adapter published no order ledger, so no order can be replayed.",
  P04_SOURCE_DID_NOT_PUBLISH_AUDITED_FILLS:
    "This run's adapter published no audited fills, so no fill can be replayed.",
  P04_SOURCE_DID_NOT_PUBLISH_EXECUTION_TRADE_LEDGER:
    "This run's adapter published no trade ledger, so no trade can be replayed.",
  P04_SOURCE_DID_NOT_PUBLISH_POSITION_STATE_SNAPSHOTS:
    "This run's adapter published no position snapshots, so no position is shown at the playhead.",
  P04_SOURCE_DID_NOT_PUBLISH_EXECUTION_EVENT_STREAM:
    "This run's adapter published no execution event stream, so the ledger holds samples rather than events.",
  P04_SOURCE_DID_NOT_PUBLISH_EXECUTION_STATE_SNAPSHOTS:
    "This run's adapter published no execution state, so the playhead reads a retrospective equity sample and says so.",
  RS02_RETAINED_LANE_NOT_APPLICABLE_TO_P04_FIXED_QUALIFICATION:
    "This run is bound to the P04 fixed qualification, which the retained lane never holds. Nothing is pending.",
  /* W3b: the retained WFO lane's own absences (research.current-source-*.v1). */
  QUANTBT_ADVANCED_WFO_DID_NOT_PUBLISH_BENCHMARK_SERIES:
    "QuantBT's advanced walk-forward published no benchmark series, so nothing is measured against a benchmark.",
  QUANTBT_ADVANCED_WFO_DID_NOT_PUBLISH_ROUTE_LEDGER:
    "QuantBT's advanced walk-forward published no route ledger for this run.",
  QUANTBT_ADVANCED_WFO_DID_NOT_PUBLISH_AUDITED_FILLS:
    "QuantBT's advanced walk-forward published no audited fills for this run.",
  UI_RETAINED_LANE_HAS_NO_FIELD:
    "The retained walk-forward lane has no field for this figure, and this screen does not compute one.",
  UI_RETAINED_LANE_HAS_NO_SERIES:
    "The retained walk-forward lane publishes no such series (its series are equity, returns, positions, monthly returns, the 20-observation rolling return and the return distribution).",
  P10_DELTA_WFO_PROFILE_HAS_NO_HOLDOUT_SEGMENT: "This walk-forward profile declares no holdout segment.",
  /* E14 · 5.11/5.12: the split read's boundary scan and stitch provenance. */
  RS02_SEAL_PREDATES_W5B_REPLAY_LEDGER_V1:
    "This run was sealed before the replay ledger was retained, so the seal holds no fold boundaries and no stitch plan.",
  QUANTBT_ACCOUNT_EXECUTION_PLAN_PUBLISHED_NO_BOUNDARY_EVENT:
    "QuantBT's account execution plan published no fold-boundary event for this run, so no crossing was scanned.",
  RETAINED_FOLD_PLAN_HAS_NO_OUTER_FOLD_CROSSING:
    "The retained fold plan has one outer fold, so there is no crossing between fold windows to scan.",
  RS02_REPLAY_LEDGER_RETAINED_NO_FOLD_SEGMENT:
    "The retained replay ledger holds no fold segment, so there is no stitch plan to identify.",
  RETAINED_STITCH_SEGMENT_NAMES_A_FOLD_THE_PLAN_DOES_NOT_HAVE:
    "A stitched segment names a fold the retained plan does not have, so the stitch and the fold plan disagree.",
  RETAINED_STITCH_SEGMENTS_DO_NOT_COVER_EVERY_RETAINED_FOLD_ONCE:
    "The stitched segments do not cover every retained fold exactly once, so the stitch and the fold plan disagree.",
  RETAINED_STITCH_SEGMENTS_ARE_NOT_IN_RETAINED_FOLD_PLAN_ORDER:
    "The stitched segments are not in the retained fold plan's order, so the stitch and the fold plan disagree.",
  RETAINED_STITCH_SEGMENT_OBSERVATION_RANGES_OVERLAP:
    "Two stitched segments claim the same retained observations, so the stitch and the fold plan disagree.",
  RETAINED_STITCH_SEGMENT_BAR_COUNT_DISAGREES_WITH_ITS_OBSERVATION_RANGE:
    "A stitched segment's bar count does not match its own observation range, so the stitch and the fold plan disagree.",
  /* E14 · 9.7: the identity qualifier on a fixed-profile run. */
  P04_FIXED_PROFILE_RUN_DID_NOT_EXECUTE_THE_DECLARED_OPTIMIZER:
    "The request declared this optimizer, and the run qualified a fixed parameter profile instead — no search was executed.",
  /* E11: what the retained walk-forward lane structurally does not hold, in
     the lane's own words rather than the screen's placeholder. */
  QUANTBT_ADVANCED_WFO_RETAINED_NO_IN_SAMPLE_ACCOUNT:
    "The retained walk-forward lane holds one stitched account and no in-sample equity, so there is no IS curve to draw beside it.",
  RS02_RETAINED_LANE_HAS_NO_DAILY_RETURN_SERIES:
    "Rolling Sharpe is measured over 63 daily returns, and the retained tape is per bar with no daily-return series, so this screen has nothing to read and computes nothing.",
  QUANTBT_DID_NOT_RETAIN_SELECTED_TRIAL_FOLD_METRICS:
    "QuantBT retained no fold metrics for the selected trial, so this figure has no source.",
  QUANTBT_DID_NOT_RETAIN_EVERY_FOLD_OOS_TRADE_COUNT:
    "At least one fold retained no OOS trade count, and a sum over the rest would be a smaller number wearing the run's name.",
  QUANTBT_RETAINED_A_FOLD_OOS_TRADE_COUNT_THAT_IS_NOT_A_COUNT:
    "A retained fold's OOS trade count is not a whole count, so no total is stated.",
  RS02_SEAL_RETAINED_NO_FOLD_ROWS: "This run's retained seal holds no fold rows, so there is nothing to total.",
  RS02_RETAINED_OBSERVATIONS_DO_NOT_FORM_A_SERIES:
    "The retained tape holds fewer than two usable observations, so no curve is drawn.",
};

/** The sentence for a reason code, or null when this module has none. */
export function reasonCodeSentence(code: string | null | undefined): string | null {
  return code && code in REASON_CODE_SENTENCES ? REASON_CODE_SENTENCES[code] : null;
}
