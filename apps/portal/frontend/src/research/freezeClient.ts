/**
 * Research Loop — Freeze client (P16 + RS-02, Screen 07).
 *
 * One read, one explicit action, one optional retained check:
 *
 *  - `researchFreezeDetailGetV1` — the immutable freeze snapshot: what was
 *    frozen, the ordering the source can and cannot assert, and three named
 *    integrity checks over retained digests.
 *  - `researchFreezeVerifyPostV1` — a re-read the *reader* asks for. It is the
 *    only POST on this screen, it carries the same-origin CSRF proof, and it
 *    is never sent on mount, on a fold change or by any control that looks
 *    like a slider.
 *  - `researchCurrentSourceFreezeGetV1` — the retained manifest/count/batch
 *    receipt check for the admitted profile.
 *
 * The word this client is most careful with is **match**. A `PARTIAL_MATCH`
 * is a match between digests Portal retained. It is not a statement about
 * artifact bytes, causal order, selection or a broker — and the contract says
 * so itself with `verification_scope`.
 */

import type { components as FreezeComponents } from "@portal/contracts-research-freeze";
import type { components as CurrentSourceComponents } from "@portal/contracts-research-current-source";

import { CSRF_HEADER, csrfTokenFromCookie } from "../auth/authApi";
import { PortalApiError } from "../lib/api";
import { ResearchLaneConflictError, readLaneState, toResearchRefusal, type ResearchRefusal } from "./researchRefusal";

type FreezeSchemas = FreezeComponents["schemas"];
type SourceSchemas = CurrentSourceComponents["schemas"];

export type FreezeDetail = FreezeSchemas["FreezeDetail"];
export type FreezeVerification = FreezeSchemas["FreezeVerification"];
export type FreezeAvailability = FreezeSchemas["Availability"];
export type FreezeSourceGap = FreezeSchemas["SourceGap"];
export type FrozenParameter = FreezeSchemas["Parameter"];
export type IntegrityCheck = FreezeSchemas["IntegrityCheck"];
export type Integrity = FreezeSchemas["Integrity"];
export type FreezeWindow = FreezeSchemas["Window"];
/** A10a: one durable byte-verification receipt (or a typed "not yet"). */
export type ArtifactBytes = FreezeSchemas["ArtifactByteVerification"];

/** The server's rule, restated once: corrupt or missing sealed bytes BLOCK. */
export function bytesBlock(bytes: Pick<ArtifactBytes, "state"> | null | undefined): boolean {
  return bytes?.state === "MISMATCH" || bytes?.state === "MISSING";
}

/** Words for each receipt state; none of them is a pass unless the state is MATCH. */
export const BYTE_STATE_WORDS: Record<ArtifactBytes["state"], string> = {
  MATCH: "bytes match the seal",
  MISMATCH: "bytes differ from the seal",
  MISSING: "bytes missing from the store",
  NOT_VERIFIED: "not verified yet",
  NOT_RETAINED: "no sealed artifact",
  UNAVAILABLE: "verifier unavailable",
  NOT_ENABLED: "byte verification off",
};

export type CurrentSourceFreeze = SourceSchemas["Freeze"];
/** W5a P16-T02/T11: per-fold ordering on two axes, derived by the server. */
export type FoldOrdering = SourceSchemas["FoldOrdering"];
export type FoldOrderingRow = SourceSchemas["FoldOrderingRow"];
/** A10c: the Screen-07 what-if sandbox, as the retained lane serves it. */
export type WhatIf = SourceSchemas["WhatIf"];
export type WhatIfCell = SourceSchemas["WhatIfCell"];
export type WhatIfEvaluateResult = SourceSchemas["WhatIfEvaluateResult"];

/** The one explicit what-if action, as the screen tracks it. */
export type WhatIfEvaluateSlot =
  | { state: "idle" }
  | { state: "submitting" }
  | { state: "done"; result: WhatIfEvaluateResult }
  | { state: "refused"; refusal: FreezeRefusal };

/** Job states during which the grid is still filling. */
export const WHATIF_ACTIVE_JOB_STATES: ReadonlySet<string> = new Set(["DRAFT", "QUEUED", "RUNNING", "SEALING"]);
/** RF-05 CG-P13-09: the typed 200 for a run whose profile the retained lane never holds. */
export type CurrentSourceNotApplicable = SourceSchemas["LaneNotApplicable"];

/** Whether a 200 from the current-source read is the typed not-applicable answer. */
export function isFreezeLaneNotApplicable(
  body: CurrentSourceFreeze | CurrentSourceNotApplicable,
): body is CurrentSourceNotApplicable {
  return (body as { schema_version?: unknown }).schema_version === "research.current-source-not-applicable.v1";
}

const RUNS = "/api/v1/quantbt/runs";

export const NOT_MODIFIED = Symbol("freeze.not-modified");
export type Fresh<T> = T | typeof NOT_MODIFIED;

function query(options: { workspaceId?: string; fold?: number | null }): string {
  const params = new URLSearchParams();
  if (options.workspaceId) params.set("workspace_id", options.workspaceId);
  if (typeof options.fold === "number") params.set("fold", String(options.fold));
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

async function call<T>(path: string, init?: RequestInit & { etag?: string | null }): Promise<Fresh<T>> {
  const { etag, ...rest } = init ?? {};
  const method = (rest.method ?? "GET").toUpperCase();
  /*
   * The CSRF proof rides on the one write this screen has, and on nothing
   * else. A GET that carried it would suggest reading needs permission it
   * does not need.
   */
  const csrf = method === "POST" ? csrfTokenFromCookie() : null;
  const response = await fetch(path, {
    ...rest,
    credentials: "same-origin",
    headers: {
      ...(etag ? { "If-None-Match": etag } : {}),
      ...(csrf ? { [CSRF_HEADER]: csrf } : {}),
      ...(method === "POST" ? { "content-type": "application/json" } : {}),
    },
  });
  if (response.status === 304) return NOT_MODIFIED;
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    let code: string | null = null;
    let requestId: string | null = response.headers.get("x-request-id");
    let laneState: ReturnType<typeof readLaneState> = null;
    try {
      const problem = (await response.json()) as Partial<FreezeSchemas["Problem"]> & {
        details?: { lane_state?: unknown };
      };
      if (problem?.error?.message) message = problem.error.message;
      code = problem?.error?.code ?? null;
      requestId = problem?.request_id ?? requestId;
      laneState = readLaneState(problem?.details?.lane_state);
    } catch {
      /* non-JSON error body: keep the status line the server gave */
    }
    /* RF-05 CG-P13-09: a current-source conflict names its lane state. */
    if (laneState !== null) throw new ResearchLaneConflictError(message, response.status, code, requestId, laneState);
    throw new PortalApiError(message, response.status, code, requestId);
  }
  return (await response.json()) as T;
}

export const freezeApi = {
  /** `researchFreezeDetailGetV1` */
  detail: (
    runId: string,
    options: { workspaceId?: string; fold?: number | null; etag?: string | null; signal?: AbortSignal } = {},
  ) =>
    call<FreezeDetail>(`${RUNS}/${encodeURIComponent(runId)}/freeze${query(options)}`, {
      etag: options.etag,
      signal: options.signal,
    }),

  /** `researchFreezeVerifyPostV1` — only ever from an explicit click. */
  verify: (runId: string, options: { workspaceId?: string; signal?: AbortSignal } = {}) =>
    call<FreezeVerification>(
      `${RUNS}/${encodeURIComponent(runId)}/freeze/verify${query({ workspaceId: options.workspaceId })}`,
      { method: "POST", body: JSON.stringify({}), signal: options.signal },
    ),

  /** `researchCurrentSourceFreezeGetV1` */
  currentSource: (runId: string, options: { workspaceId?: string; signal?: AbortSignal; etag?: string | null } = {}) =>
    call<CurrentSourceFreeze | CurrentSourceNotApplicable>(
      `${RUNS}/${encodeURIComponent(runId)}/current-source/freeze${query({ workspaceId: options.workspaceId })}`,
      { signal: options.signal, etag: options.etag },
    ),

  /**
   * `researchCurrentSourceWhatIfEvaluatePostV1` — the one explicit "evaluate
   * grid" click. It names the grid the reader saw; a different current grid
   * is the server's 409, never a silent re-target.
   */
  evaluateWhatIf: (runId: string, gridKey: string, options: { workspaceId?: string; signal?: AbortSignal } = {}) =>
    call<WhatIfEvaluateResult>(
      `${RUNS}/${encodeURIComponent(runId)}/current-source/freeze/what-if/evaluate${query({ workspaceId: options.workspaceId })}`,
      {
        method: "POST",
        body: JSON.stringify({ schema_version: "research.whatif-evaluate.v1", grid_key: gridKey }),
        signal: options.signal,
      },
    ),
} as const;

/* -------------------------------------------------------------------------
 * What a match means
 * ---------------------------------------------------------------------- */

/**
 * The sentence that keeps `PARTIAL` honest.
 *
 * Every place the screen shows a match, it shows this beside it. The contract
 * publishes `verification_scope: PORTAL_RETAINED_DIGEST_BINDING_ONLY`; the
 * copy is that scope in words a reader can act on.
 */
export const PARTIAL_SCOPE_NOTE =
  "this compares digests Portal retained when the run was bound. It is not a check of the source artifact's bytes, of causal ordering, of a selection, or of anything a broker saw.";

export const BLOCKED_NOTE =
  "one of the retained bindings does not match, so nothing below is presented as frozen. The mismatched check is named with both digests; the frozen table is empty because a table filled from anywhere else would not be this run's.";

export function isAvailable(availability: FreezeAvailability): boolean {
  return availability.state === "AVAILABLE";
}

export const FREEZE_WITHHELD_WORDS: Record<FreezeAvailability["state"], string> = {
  AVAILABLE: "available",
  NOT_PUBLISHED: "not published",
  NOT_APPLICABLE: "not applicable",
  PENDING_SOURCE_CALLBACK: "pending source",
  LEGACY_METADATA_ONLY: "legacy metadata",
};

/** Four kinds of absence, four words. `NOT_ATTESTED` is the one this screen adds. */
export const FREEZE_GAP_WORDS: Record<FreezeSourceGap["state"], string> = {
  NOT_PUBLISHED: "not published",
  NOT_APPLICABLE: "not applicable",
  NOT_ASSERTED: "not asserted",
  NOT_ATTESTED: "not attested",
};

export function freezeGapReason(gap: {
  reason_code?: string | null;
  availability?: FreezeAvailability;
}): string {
  return gap.reason_code ?? gap.availability?.reason_code ?? gap.availability?.state ?? "unknown";
}

/** The three checks the contract names, in the order the screen reads them. */
export const INTEGRITY_KEYS = [
  "P04_ADAPTER_CONTRACT",
  "P10_MANIFEST_BINDING",
  "P04_FIXED_PARAMETER_BUNDLE",
] as const;

/* -------------------------------------------------------------------------
 * Refusals
 * ---------------------------------------------------------------------- */

/**
 * RF01-F4: one refusal mapper serves every Research surface
 * (`researchRefusal.ts`). These names stay so existing callers and the
 * shared-module rule (additive only) hold.
 */
export type FreezeRefusal = ResearchRefusal;
export const toFreezeRefusal = toResearchRefusal;
