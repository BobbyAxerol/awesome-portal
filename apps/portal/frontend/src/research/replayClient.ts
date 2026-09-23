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

import { PortalApiError } from "../lib/api";
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

  /** `researchCurrentSourceReplayGetV1` — first window only; no `at_ordinal` exists here. */
  currentSource: (runId: string, options: { workspaceId?: string; signal?: AbortSignal } = {}) =>
    call<CurrentSourceReplay>(
      `${RUNS}/${encodeURIComponent(runId)}/current-source/replay${replayQuery({ kind: "first" }, options)}`,
      options.signal,
    ),
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
  return gap.reason_code ?? gap.availability?.reason_code ?? gap.availability?.state ?? "unknown";
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
  403: "This run belongs to a workspace you are not a member of.",
  404: "No replay exists for this run in this workspace.",
  409: "The replay position expired. It was discarded and the replay was read again once.",
  503: "Replay is unavailable right now. Nothing on this screen was changed.",
  other: "The replay could not be read.",
} as const;

/**
 * The retained lane refuses a run outside its one admitted profile with 404 or
 * 409. Neither is an expired cursor — that lane is read without one — so it
 * gets its own sentence rather than the replay's 409 copy.
 */
export const RETAINED_NOT_ADMITTED =
  "This run is outside the one admitted retained-source profile, so there is no retained model replay to show.";

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
  const denied = status === 401 || status === 403;
  const notAdmitted = lane === "retained" && (status === 404 || status === 409);
  const copy = notAdmitted
    ? RETAINED_NOT_ADMITTED
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
      : status === 404
        ? "empty"
        : status === 409
          ? "stale"
          : status >= 500
            ? "unavailable"
            : "terminal",
    mayRetry: status >= 500,
    terminal: denied || status === 404 || status === 400,
    cursorExpired: lane === "replay" && status === 409 && error.code === "RESEARCH_REPLAY_CURSOR_EXPIRED",
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
    reason: "Equity samples only. Every execution fact below is named with the reason the source gave.",
    mayRetry: false,
    retainsContent: true,
  };
}
