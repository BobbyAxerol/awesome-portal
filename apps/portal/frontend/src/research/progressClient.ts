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
import { REFUSAL_COPY, toResearchRefusal, type ResearchRefusal } from "./researchRefusal";

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
/** RF01-B3: one retained table in the artifact authority's six-state vocabulary. */
export type RetainedArtifact = Schemas["ProgressRetainedArtifact"];
export type EffectiveStatus = ProgressRead["current"]["effective_status"];
/** CG-P11-03: run identity from the P10 producer row and its P08 manifest. */
export type ProgressRunIdentity = Schemas["ProgressRunIdentity"];
/** CG-P11-03: a declared artifact this viewer may not read (the sealed holdout). */
export type DeniedArtifact = Schemas["ProgressDeniedArtifact"];
/** CG-P11-03: the parameter bundle a fold was evaluated with. */
export type FoldSelection = Schemas["ProgressFoldSelection"];
/** CG-P11-03: the structured cursor a finished run hands to Screen 04. */
export type HandoffCursor = Schemas["ProgressHandoffCursor"];
/** CG-P11-07: the immutable requested spec a new run may start from. */
export type RunRequestedSpec = Schemas["RunRequestedSpec"];
export type ClaimState = ProgressSnapshot["claim"]["state"];

/**
 * The two source-owned display facts added by the P11 amendment.
 *
 * Both are optional in the OpenAPI **only** so a snapshot persisted before the
 * amendment stays decodable. An absent field means exactly `NOT_PUBLISHED`; it
 * is not a licence to synthesize a timeline or a grade.
 */
export type FoldTimeline = Schemas["ProgressFoldTimeline"];
export type FoldSegment = Schemas["ProgressFoldSegment"];
export type MethodologyCertificate = Schemas["ProgressMethodologyCertificate"];

/** The documented meaning of an absent `fold_timeline`. */
export const NOT_PUBLISHED_TIMELINE: FoldTimeline = {
  state: "NOT_PUBLISHED",
  reason_code: "SOURCE_DID_NOT_PUBLISH_PER_FOLD_SEGMENT_FACTS",
  segments: [],
};

/** The documented meaning of an absent fold `selection` (pre-W2 snapshot). */
export const NOT_PUBLISHED_SELECTION: FoldSelection = {
  state: "NOT_PUBLISHED",
  scope: null,
  trial: null,
  objective: null,
  params_digest: null,
  reason_code: "SOURCE_DID_NOT_PUBLISH_FOLD_SELECTION",
};

/** The documented meaning of an absent `methodology_certificate`. */
export const NOT_PUBLISHED_CERTIFICATE: MethodologyCertificate = {
  state: "NOT_PUBLISHED",
  grade: null,
  issued_at_utc_ms: null,
  reason_code: "SOURCE_DID_NOT_PUBLISH_METHODOLOGY_CERTIFICATE",
};

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

  /**
   * CG-P11-07: the admitted requested spec, for Screen 02's `?from=`. The new
   * run is still a NEW intent through a fresh preflight.
   */
  requestedSpec: (runId: string, workspaceId?: string, signal?: AbortSignal) =>
    call<RunRequestedSpec>(
      runPath(runId, `/requested-spec${workspaceId ? `?workspace_id=${encodeURIComponent(workspaceId)}` : ""}`),
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
  | {
      kind: "event";
      event: ProgressEvent;
      snapshot: ProgressSnapshot | null;
      /** CG-P11-08: this viewer's current read; null on a replayed frame. */
      read: ProgressRead | null;
      /** True when the server left the read out for its size: read once. */
      readOmitted: boolean;
    }
  | { kind: "snapshot"; read: ProgressRead }
  | { kind: "heartbeat" }
  | { kind: "terminal"; frame: ProgressTerminalFrame };

/**
 * The SSE event names the Control API writes (`progress.controller.ts`).
 *
 * Every frame is *named*. A browser delivers a named event only to a listener
 * registered under that name — never to `onmessage` — so a stream read through
 * `onmessage` alone receives nothing, raises no error, and never falls back to
 * the poll floor: a running run freezes at its first snapshot (RF-04, FE-S03-01).
 */
export const STREAM_EVENT_NAMES = [
  "research.progress.snapshot",
  "research.progress",
  "research.progress.heartbeat",
  "research.progress.gap",
  "auth.expired",
] as const;

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
  if (
    value.schema_version === "research.progress-read.v1" &&
    value.current !== null &&
    typeof value.current === "object"
  ) {
    return { kind: "snapshot", read: value as unknown as ProgressRead };
  }
  if (value.event && typeof value.event === "object") {
    const wrapper = value as unknown as ProgressStreamEvent;
    if (typeof wrapper.event.event_type !== "string") return null;
    const read =
      wrapper.read && typeof wrapper.read === "object" && wrapper.read.schema_version === "research.progress-read.v1"
        ? wrapper.read
        : null;
    return {
      kind: "event",
      event: wrapper.event,
      snapshot: wrapper.snapshot ?? null,
      read,
      readOmitted: wrapper.read_omitted_reason === "P11_STREAM_READ_OVER_FRAME_BUDGET",
    };
  }
  return null;
}

/* -------------------------------------------------------------------------
 * Refusals
 * ---------------------------------------------------------------------- */

/** The shared Research refusal (RF01-F4), plus the one fact only the stream needs. */
export type ProgressRefusal = ResearchRefusal & {
  /** True when the stream must be closed and not reopened. */
  closesStream: boolean;
};

/**
 * The shared mapper, with P11's one difference: a `409` here is a lost
 * compare-and-set on a run whose state has moved, so it is terminal for this
 * view rather than a reread.
 *
 * `401`, `403` and `409` close the stream: an expired session or a lost
 * compare-and-set will not be fixed by reconnecting, and native EventSource
 * would otherwise retry them forever.
 */
export function toProgressRefusal(error: unknown): ProgressRefusal {
  const refusal = toResearchRefusal(error);
  const conflict = refusal.status === 409;
  return {
    ...refusal,
    ...(conflict ? { state: "terminal" as const, mayRetry: false, message: REFUSAL_COPY.terminal } : {}),
    closesStream: refusal.state === "denied" || conflict,
  };
}
