/**
 * Research Loop — Execute Replay client (P17 + RS-02, Screen 08).
 *
 * Two reads and nothing else:
 *
 *  - `researchReplayDetailGetV1` — one bounded window of the run's
 *    retrospective equity samples, the route that produced them and a typed
 *    absence for every execution fact the source did not publish.
 *  - `researchCurrentSourceReplayGetV1` — the retained model-sample replay for
 *    the one admitted Advanced-WFO profile. Read only when the reader asks.
 *
 * The screen's hardest word is **execution**. P17 replays equity samples the
 * source retained after the fact. It has no orders, fills, positions or
 * candles, and `state_at_cursor.execution_state` says so. Nothing in this file
 * turns a sample into an account state.
 *
 * Replay is `Cache-Control: private, no-store`: there is no ETag path and no
 * 304. Navigation tokens are opaque and expire; a `409` means "discard it".
 */

import type { components as ReplayComponents } from "@portal/contracts-research-replay";
import type { components as CurrentSourceComponents } from "@portal/contracts-research-current-source";

import { reportSessionExpired } from "../auth/sessionExpiry";
import { PortalApiError } from "../lib/api";
import { reasonCodeSentence } from "./researchRefusal";
import { isRetainedAnswer } from "./retainedLane";
import type { ResearchState } from "./state";

type ReplaySchemas = ReplayComponents["schemas"];
type SourceSchemas = CurrentSourceComponents["schemas"];

export type Replay = ReplaySchemas["Replay"];
export type ReplayWindow = ReplaySchemas["ReplayWindow"];
export type ReplayPoint = ReplaySchemas["ReplayPoint"];
export type ReplayStateAtCursor = ReplaySchemas["StateAtCursor"];
export type ReplayAvailability = ReplaySchemas["Availability"];
export type ReplaySourceGap = ReplaySchemas["SourceGap"];
export type RouteCapability = ReplaySchemas["RouteCapability"];
export type RouteCapabilityKey = keyof Replay["route_capabilities"];
export type CurrentSourceReplay = SourceSchemas["Replay"];
/** The retained lane's typed "this run is a P04 fixed qualification" answer (200, not a refusal). */
export type CurrentSourceLaneNotApplicable = SourceSchemas["LaneNotApplicable"];
export type CurrentSourceObservation = SourceSchemas["Observation"];
export type CurrentSourceFact = SourceSchemas["Fact"];
export type RetainedCapabilityKey = keyof CurrentSourceReplay["route_capabilities"];
/** W5b: the retained bar ledger (candles, target transitions, fold capital). */
export type FoldSegment = SourceSchemas["FoldSegment"];
export type TransitionRow = SourceSchemas["TransitionRow"];
export type ReplayTransitions = SourceSchemas["ReplayTransitions"];
/** P17-T14: one fold's QuantBT strategy-isolation records. */
export type ReplayChildAudit = SourceSchemas["ReplayChildAudit"];
export type ChildAuditRecord = SourceSchemas["ChildAuditRecord"];

const RUNS = "/api/v1/quantbt/runs";

/** The contract's own ceiling for one window. */
export const REPLAY_LIMIT_MAX = 100;

/**
 * Exactly one navigation input per read, as the contract requires. `at_ordinal`
 * is the public sample ordinal: it is sent only to restore an explicit deep
 * link or to recover once from an expired token — never derived per frame.
 */
export type ReplayNavigation =
  | { kind: "first" }
  | { kind: "cursor"; token: string }
  | { kind: "before"; token: string }
  | { kind: "at"; token: string }
  | { kind: "at_ordinal"; ordinal: number };

function replayQuery(navigation: ReplayNavigation, options: { workspaceId?: string; limit?: number }): string {
  const params = new URLSearchParams();
  if (options.workspaceId) params.set("workspace_id", options.workspaceId);
  if (typeof options.limit === "number") params.set("limit", String(options.limit));
  switch (navigation.kind) {
    case "cursor":
      params.set("cursor", navigation.token);
      break;
    case "before":
      params.set("before", navigation.token);
      break;
    case "at":
      params.set("at", navigation.token);
      break;
    case "at_ordinal":
      params.set("at_ordinal", String(navigation.ordinal));
      break;
    case "first":
      break;
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

async function call<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { credentials: "same-origin", signal });
  if (!response.ok) {
    let code: string | null = null;
    let requestId: string | null = response.headers.get("x-request-id");
    try {
      const problem = (await response.json()) as Partial<ReplaySchemas["Problem"]>;
      code = problem?.error?.code ?? null;
      requestId = problem?.request_id ?? requestId;
    } catch {
      /* non-JSON error body: the status is still typed */
    }
    /*
     * The server's prose is kept on the error for diagnostics but is never
     * rendered: the screen speaks from `REPLAY_REFUSAL_COPY`, keyed by status.
     */
    throw new PortalApiError(`${response.status} ${response.statusText}`, response.status, code, requestId);
  }
  return (await response.json()) as T;
}

export const replayApi = {
  /** `researchReplayDetailGetV1` */
  detail: (
    runId: string,
    navigation: ReplayNavigation,
    options: { workspaceId?: string; limit?: number; signal?: AbortSignal } = {},
  ) =>
    call<Replay>(
      `${RUNS}/${encodeURIComponent(runId)}/execute/replay${replayQuery(navigation, options)}`,
      options.signal,
    ),

  /**
   * `researchCurrentSourceReplayGetV1` — the first window, or one opaque
   * `cursor` / `before` / `at` token this lane minted. No `at_ordinal` exists
   * here, so a public deep link cannot be restored on this lane.
   */
  currentSource: (
    runId: string,
    options: {
      workspaceId?: string;
      signal?: AbortSignal;
      limit?: number;
      navigation?: Exclude<ReplayNavigation, { kind: "at_ordinal" }>;
    } = {},
  ) =>
    call<CurrentSourceReplay | CurrentSourceLaneNotApplicable>(
      `${RUNS}/${encodeURIComponent(runId)}/current-source/replay${replayQuery(options.navigation ?? { kind: "first" }, options)}`,
      options.signal,
    ),

  /**
   * `researchCurrentSourceReplayTransitionsGetV1` (W5b) — the close-target
   * transition ledger, one page by the ledger's own opaque cursor.
   */
  currentSourceTransitions: (
    runId: string,
    options: {
      workspaceId?: string;
      signal?: AbortSignal;
      limit?: number;
      navigation?: { kind: "first" } | { kind: "cursor"; token: string } | { kind: "before"; token: string };
    } = {},
  ) =>
    call<ReplayTransitions | CurrentSourceLaneNotApplicable>(
      `${RUNS}/${encodeURIComponent(runId)}/current-source/replay/transitions${replayQuery(options.navigation ?? { kind: "first" }, options)}`,
      options.signal,
    ),

  /** `researchCurrentSourceReplayChildAuditGetV1` (P17-T14) — one fold's child audit. */
  currentSourceChildAudit: (runId: string, fold: string, options: { workspaceId?: string; signal?: AbortSignal } = {}) => {
    const params = new URLSearchParams({ fold });
    if (options.workspaceId) params.set("workspace_id", options.workspaceId);
    return call<ReplayChildAudit | CurrentSourceLaneNotApplicable>(
      `${RUNS}/${encodeURIComponent(runId)}/current-source/replay/child-audit?${params.toString()}`,
      options.signal,
    );
  },
} as const;

/* -------------------------------------------------------------------------
 * Words
 * ---------------------------------------------------------------------- */

export const REPLAY_WITHHELD_WORDS: Record<ReplayAvailability["state"], string> = {
  AVAILABLE: "available",
  NOT_PUBLISHED: "not published",
  NOT_APPLICABLE: "not applicable",
  PENDING_SOURCE_CALLBACK: "pending source",
  LEGACY_METADATA_ONLY: "legacy metadata",
};

export const REPLAY_GAP_WORDS: Record<ReplaySourceGap["state"] | RouteCapability["state"], string> = {
  AVAILABLE: "available",
  NOT_PUBLISHED: "not published",
  NOT_APPLICABLE: "not applicable",
  NOT_ASSERTED: "not asserted",
};

export function gapReason(gap: { reason_code?: string | null; availability?: ReplayAvailability }): string {
  const code = gap.reason_code ?? gap.availability?.reason_code ?? null;
  const sentence = code === null ? null : reasonCodeSentence(code);
  if (sentence !== null && code !== null) return `${sentence} (${code})`;
  return code ?? gap.availability?.state ?? "unknown";
}

/** The thirteen capabilities, in the order the hi-fi's panels read them. */
export const ROUTE_CAPABILITY_KEYS: readonly RouteCapabilityKey[] = [
  "orders",
  "fills",
  "trades",
  "positions",
  "execution_events",
  "candle_windows",
  "sl_tp_ambiguity",
  "oco_tree",
  "multi_leg",
  "funding",
  "mae_mfe",
  "fold_capital",
  "child_audit_provenance",
] as const;

export const CAPABILITY_LABEL: Record<RouteCapabilityKey, string> = {
  orders: "orders",
  fills: "fills",
  trades: "trades",
  positions: "positions",
  execution_events: "execution events",
  candle_windows: "candle windows",
  sl_tp_ambiguity: "SL/TP ambiguity",
  oco_tree: "OCO tree",
  multi_leg: "multi-leg",
  funding: "funding",
  mae_mfe: "MAE × MFE",
  fold_capital: "fold capital",
  child_audit_provenance: "child audit provenance",
};

/**
 * What the route state means, in one sentence each. The chart and playhead are
 * labelled from this — never as an execution account.
 */
export const ROUTE_STATE_NOTE: Record<Replay["route"]["state"], string> = {
  RETROSPECTIVE_EQUITY_ONLY:
    "This route replays retrospective equity samples the source retained. It has no orders, fills, positions or candles, so the playhead is a sample, not an execution state.",
  PENDING_SOURCE_CALLBACK:
    "The source has not called back yet. There is nothing to replay until it does.",
  LEGACY_METADATA_ONLY:
    "This run carries legacy metadata only. No equity samples were retained for replay.",
  NOT_PUBLISHED: "The source did not publish a replay for this run.",
};

export const SAMPLING_NOTE: Record<"FULL" | "EXTREMA_BUCKET_V1", string> = {
  FULL: "every retained observation is a sample.",
  EXTREMA_BUCKET_V1:
    "samples are bucket extrema, not every observation. Nothing is interpolated between them, and a step between two samples is not a bar.",
};

/* -------------------------------------------------------------------------
 * The retained WFO lane (W3b)
 * ---------------------------------------------------------------------- */

/**
 * What the retained lane replays, in one sentence. Said instead of the P04
 * route note on a run the retained lane answered — the hub's "did not publish"
 * describes the hub, not this run.
 */
export const RETAINED_ROUTE_NOTE =
  "This lane replays the walk-forward observations the run retained and sealed: model position, equity, return and drawdown per observation. It has no orders, fills or candles, so the playhead is a model observation, not an execution state.";

export const RETAINED_SAMPLING_NOTE =
  "every retained observation in source-table order, read a window at a time; nothing is bucketed or interpolated.";

/** A UI-authored code (researchRefusal.ts): the retained lane has no field for this fact. */
export const RETAINED_NO_FIELD = "UI_RETAINED_LANE_HAS_NO_FIELD";

/** The retained lane's five capabilities, in the order the screen reads them. */
export const RETAINED_CAPABILITY_KEYS: readonly RetainedCapabilityKey[] = [
  "model_positions",
  "returns",
  "orders",
  "fills",
  "candles",
] as const;

export const RETAINED_CAPABILITY_LABEL: Record<RetainedCapabilityKey, string> = {
  model_positions: "model positions",
  returns: "returns",
  orders: "orders",
  fills: "fills",
  candles: "candles",
  /* W5b: the bar ledger's facts. */
  transitions: "target transitions",
  fees: "fees",
  funding: "funding",
  fold_capital: "fold capital",
  trades: "trades",
  partial_fills: "partial fills",
  oco: "OCO",
  multi_leg: "multi-leg",
  sl_tp: "SL/TP",
  mae_mfe: "MAE × MFE",
  execution_events: "execution events",
  child_audit: "child audit",
};

/**
 * Which retained capability answers a P04 route capability. A key absent here
 * has no retained field at all, and the screen says so in the retained lane's
 * name — never with the hub's reason code.
 */
export const RETAINED_ANSWER_FOR: Partial<Record<RouteCapabilityKey, RetainedCapabilityKey>> = {
  orders: "orders",
  fills: "fills",
  /* The model's accepted position, labelled as such — not a broker position snapshot. */
  positions: "model_positions",
  candle_windows: "candles",
};

/** Whether a retained-lane body is the replay itself (not the typed not-applicable answer). */
export function isRetainedReplay(
  body: CurrentSourceReplay | CurrentSourceLaneNotApplicable | null | undefined,
): body is CurrentSourceReplay {
  return isRetainedAnswer(body) && (body as { schema_version?: unknown }).schema_version === "research.current-source-replay.v1";
}

/* -------------------------------------------------------------------------
 * Refusals
 * ---------------------------------------------------------------------- */

/**
 * Fixed copy per refusal. The server's message is not shown: it may carry
 * implementation prose the reader cannot act on. When the shared
 * `toResearchRefusal` lands on this branch, this function is the one place to
 * swap.
 */
export const REPLAY_REFUSAL_COPY = {
  network: "The request did not reach the server.",
  400: "This replay position is not valid for this run's evidence. Reopen the replay from the start.",
  401: "Your session has ended. Sign in again to read this replay.",
  /* Neutral on purpose: a denial must not confirm the run exists or say whose it is (audit F-04). */
  403: "You don't have access to this in your current workspace, or it doesn't exist.",
  /* X3 2026-09-26 (VD-P23-03, F-04): a 404 says exactly what a 403 says. */
  404: "You don't have access to this in your current workspace, or it doesn't exist.",
  409: "The replay position expired. It was discarded and the replay was read again once.",
  503: "Replay is unavailable right now. Nothing on this screen was changed.",
  other: "The replay could not be read.",
} as const;

/**
 * On the retained lane a 409 is not an expired cursor — that lane is read
 * without one. It means no sealed retained source exists for this run: pending
 * retention, or a run that predates it (RF-02 found this on the real API). The
 * sentence is the shared mapper's, word for word, so S08 says what S04–S07 say.
 */
export const RETAINED_NOT_RETAINED = "No retained source for this run yet.";


export interface ReplayRefusal {
  code: string | null;
  message: string;
  status: number;
  requestId: string | null;
  state: ResearchState["state"];
  mayRetry: boolean;
  terminal: boolean;
  /** A 409 whose token must be discarded before anything else is sent. */
  cursorExpired: boolean;
}

export function toReplayRefusal(error: unknown, lane: "replay" | "retained" = "replay"): ReplayRefusal {
  if (!(error instanceof PortalApiError)) {
    return {
      code: null,
      message: REPLAY_REFUSAL_COPY.network,
      status: 0,
      requestId: null,
      state: "failed-retryable",
      mayRetry: true,
      terminal: false,
      cursorExpired: false,
    };
  }
  const { status } = error;
  /* RF01-F3 / VD-P23-02: an expired session goes to the shell's Frame 01D. */
  if (status === 401) reportSessionExpired();
  /* F-04 (X3 2026-09-26): 403 and 404 are one state on every Research screen. */
  const denied = status === 401 || status === 403 || status === 404;
  /* The retained lane mints its own opaque tokens; an expired one is a stale
     position, not a missing retention. */
  const retainedCursorExpired =
    lane === "retained" && status === 409 && error.code === "RESEARCH_CURRENT_SOURCE_CURSOR_EXPIRED";
  const notRetained = lane === "retained" && status === 409 && !retainedCursorExpired;
  const copy = notRetained
    ? RETAINED_NOT_RETAINED
    : status === 400 || status === 401 || status === 403 || status === 404 || status === 409 || status === 503
      ? REPLAY_REFUSAL_COPY[status]
      : REPLAY_REFUSAL_COPY.other;
  return {
    code: error.code,
    message: copy,
    status,
    requestId: error.requestId,
    state: denied
      ? "denied"
      : notRetained
        ? "unavailable"
      : status === 409
          ? "stale"
          : status >= 500
            ? "unavailable"
            : "terminal",
    mayRetry: status >= 500,
    terminal: denied || status === 404 || status === 400,
    cursorExpired:
      (lane === "replay" && status === 409 && error.code === "RESEARCH_REPLAY_CURSOR_EXPIRED") || retainedCursorExpired,
  };
}

/* -------------------------------------------------------------------------
 * Screen state from a typed answer
 * ---------------------------------------------------------------------- */

export function replayState(replay: Replay): ResearchState {
  const route = replay.route.state;
  if (route !== "RETROSPECTIVE_EQUITY_ONLY") {
    return { state: "unavailable", reason: ROUTE_STATE_NOTE[route], mayRetry: false, retainsContent: true };
  }
  if (replay.equity_replay.items.length === 0) {
    return { state: "empty", reason: "No samples in this window.", mayRetry: false, retainsContent: true };
  }
  return {
    state: "partial",
    reason: "Equity samples only.",
    mayRetry: false,
    retainsContent: true,
  };
}
