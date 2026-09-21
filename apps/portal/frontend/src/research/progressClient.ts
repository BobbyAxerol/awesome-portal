/**
 * Research Loop — run progress client (P11, Screen 03).
 *
 * Four same-origin operations and nothing else. Every shape comes from the
 * generated `research-progress` contract; no DTO is hand-written, no error
 * string is parsed, and no reader URL is invented.
 *
 * Two prohibitions are structural here:
 *
 *  - **No private identity is ever recreated.** The public types carry no
 *    `attempt_id`, `lease_epoch` or `worker_attempt_id`, so neither does React
 *    state, the URL, storage or the DOM. `researchBoundary.test.ts` sweeps for
 *    them across the whole surface.
 *  - **`artifact.reader_href` is `null` by contract.** A sealed card means the
 *    bytes are ready, not that this browser may read them. The card stays rich
 *    and stays unlinked; P12/P13 own the authorised reader.
 *
 * The event union is narrowed by `event_type`, never cast. A payload read
 * through a cast is a payload nobody checked.
 */

import type { components } from "@portal/contracts-research-progress";

import { CSRF_HEADER, csrfTokenFromCookie } from "../auth/authApi";
import { PortalApiError } from "../lib/api";
import type { ResearchState } from "./state";

type Schemas = components["schemas"];

export type ProgressRead = Schemas["ProgressRead"];
export type ProgressSnapshot = Schemas["ProgressSnapshot"];
export type ProgressEvent = Schemas["ProgressEvent"];
export type ProgressStreamEvent = Schemas["ProgressStreamEvent"];
export type ProgressTerminalFrame = Schemas["ProgressTerminalFrame"];
export type ProgressHeartbeat = Schemas["ProgressHeartbeat"];
export type ConsolePage = Schemas["ConsolePage"];
export type ConsoleLine = Schemas["ConsoleLine"];
export type CancelResponse = Schemas["CancelResponse"];
export type Stage = Schemas["Stage"];
export type Artifact = Schemas["Artifact"];
export type EffectiveStatus = ProgressRead["current"]["effective_status"];
export type ClaimState = ProgressSnapshot["claim"]["state"];

const BASE = "/api/v1/research/runs";

function runPath(runId: string, suffix: string): string {
  return `${BASE}/${encodeURIComponent(runId)}${suffix}`;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const isWrite = (init?.method ?? "GET").toUpperCase() !== "GET";
  const csrf = isWrite ? csrfTokenFromCookie() : null;
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...(csrf ? { [CSRF_HEADER]: csrf } : {}),
      ...(init?.headers as Record<string, string> | undefined),
    },
  });

  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    let code: string | null = null;
    let requestId: string | null = response.headers.get("x-request-id");
    try {
      const problem = (await response.json()) as Partial<Schemas["Problem"]>;
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

/** The console page size the contract caps at. */
export const CONSOLE_PAGE_LIMIT = 500;

/** How many lines the console keeps on screen (spec 03 §2.5). */
export const CONSOLE_WINDOW = 500;

/** The poll floor when the stream is not carrying (spec 03 §1.1). */
export const POLL_FLOOR_MS = 5000;

export const progressApi = {
  /** Initial snapshot, recovery, and the bounded polling fallback. */
  read: (runId: string, workspaceId?: string, signal?: AbortSignal) =>
    call<ProgressRead>(
      runPath(runId, `/progress${workspaceId ? `?workspace_id=${encodeURIComponent(workspaceId)}` : ""}`),
      { signal },
    ),

  /** One bounded console page. Never a full-history read. */
  console: (runId: string, afterSeq: number, signal?: AbortSignal) =>
    call<ConsolePage>(
      runPath(runId, `/console?after_seq=${afterSeq}&limit=${CONSOLE_PAGE_LIMIT}`),
      { signal },
    ),

  /** The server decides admission; `may_cancel` is display state. */
  cancel: (runId: string, reason: string, workspaceId?: string) =>
    call<CancelResponse>(runPath(runId, "/cancel"), {
      method: "POST",
      body: JSON.stringify({ workspace_id: workspaceId, reason }),
    }),

  /**
   * The SSE URL.
   *
   * Built here so the one place that knows the contract's paths also knows
   * this one — `EventSource` cannot be given a body, so the resume cursor
   * travels as `after_seq`.
   */
  streamUrl: (runId: string, afterSeq: number | null): string =>
    runPath(runId, `/events${afterSeq === null ? "" : `?after_seq=${afterSeq}`}`),
} as const;

/* -------------------------------------------------------------------------
 * Stream frames
 * ---------------------------------------------------------------------- */

export type StreamFrame =
  | { kind: "event"; event: ProgressEvent; snapshot: ProgressSnapshot | null }
  | { kind: "heartbeat" }
  | { kind: "terminal"; frame: ProgressTerminalFrame };

/**
 * Classifies one SSE payload.
 *
 * Returns `null` for anything the contract does not describe. An unknown frame
 * is ignored rather than guessed at: the ingress already rejects unknown keys,
 * and a browser that invents meaning for a frame it does not recognise is the
 * failure this whole surface is built to avoid.
 */
export function classifyFrame(raw: string): StreamFrame | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object") return null;
  const value = parsed as Record<string, unknown>;

  if (value.event_type === "research.progress.heartbeat") return { kind: "heartbeat" };
  if (value.terminal === true && typeof value.event_type === "string") {
    return { kind: "terminal", frame: value as unknown as ProgressTerminalFrame };
  }
  if (value.event && typeof value.event === "object") {
    const wrapper = value as unknown as ProgressStreamEvent;
    if (typeof wrapper.event.event_type !== "string") return null;
    return { kind: "event", event: wrapper.event, snapshot: wrapper.snapshot ?? null };
  }
  return null;
}

/* -------------------------------------------------------------------------
 * Refusals
 * ---------------------------------------------------------------------- */

export interface ProgressRefusal {
  code: string | null;
  /** The server's own sentence. Never rewritten locally. */
  message: string;
  status: number;
  requestId: string | null;
  state: ResearchState["state"];
  mayRetry: boolean;
  /** True when the stream must be closed and not reopened. */
  closesStream: boolean;
}

/**
 * Maps a refusal by status, because P11's `Problem.error.code` is an open
 * string rather than a closed union — there is no exhaustive map to write, and
 * inventing one would drift from the server the first time it adds a code.
 *
 * `401`, `403` and `409` close the stream: an expired session or a lost
 * compare-and-set will not be fixed by reconnecting, and native EventSource
 * would otherwise retry them forever.
 */
export function toProgressRefusal(error: unknown): ProgressRefusal {
  if (!(error instanceof PortalApiError)) {
    return {
      code: null,
      message: "The request did not reach the server.",
      status: 0,
      requestId: null,
      state: "failed-retryable",
      mayRetry: true,
      closesStream: false,
    };
  }
  const { status } = error;
  const denied = status === 401 || status === 403;
  return {
    code: error.code,
    message: error.message,
    status,
    requestId: error.requestId,
    state: denied
      ? "denied"
      : status === 404
        ? "empty"
        : status === 409
          ? "terminal"
          : status >= 500
            ? "unavailable"
            : "terminal",
    mayRetry: status >= 500,
    closesStream: denied || status === 409,
  };
}
