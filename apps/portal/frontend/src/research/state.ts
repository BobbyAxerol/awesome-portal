/**
 * Research Loop — shared state harness (P03 FE/consumer scope).
 *
 * P03 froze three typed refusals and a scope rule but exposes no browser route,
 * so this file deliberately contains no fetching, no session handling and no
 * workspace selector. It maps an already-obtained outcome onto the Portal's
 * existing `ComponentState` vocabulary from `lib/portalState.ts`; Research does
 * not get a second state language.
 *
 * Truth conditions follow
 * `upgrade/research_loop/release-v1.1/docs/RESEARCH_SCREEN_STATE_SEMANTICS_V1.md`.
 * Two rules there are easy to lose and are enforced by tests:
 *
 *  - a wrong-workspace object is `denied`, never `empty` and never a substituted
 *    object — an empty list would read as "this workspace has none", which is a
 *    different and false claim;
 *  - a missing number stays missing. Nothing here converts `null` to `0`.
 */

import type { ComponentState } from "../lib/portalState";

/** The typed refusals P03 froze. Extending this list is a contract change. */
export type ResearchRefusalCode =
  | "RESEARCH_WORKSPACE_FORBIDDEN"
  | "RESEARCH_DRAFT_REVISION_CONFLICT"
  | "RESEARCH_ADMISSION_SATURATED";

export const RESEARCH_REFUSAL_CODES: readonly ResearchRefusalCode[] = [
  "RESEARCH_WORKSPACE_FORBIDDEN",
  "RESEARCH_DRAFT_REVISION_CONFLICT",
  "RESEARCH_ADMISSION_SATURATED",
] as const;

/**
 * What a caller already knows about one named request for one exact scope.
 * `in-flight` carries `hasAcceptedResponse` because a refetch over data already
 * on screen is `stale`, not `loading` — blanking a populated panel on every
 * poll is the flicker the hi-fi composition rule forbids.
 */
export type ResearchOutcome =
  | { kind: "in-flight"; hasAcceptedResponse: boolean; retainedAsOf?: string | null }
  | {
      kind: "ok";
      rowCount: number;
      /** Fields/panels the server itself declared unavailable. */
      declaredUnavailable?: readonly string[];
      /** Authoritative freshness, when the server publishes one. */
      asOf?: string | null;
      isStale?: boolean;
    }
  | { kind: "refusal"; code: ResearchRefusalCode }
  | { kind: "transport"; status: number | null; retryable: boolean }
  | { kind: "terminal"; reason: string };

export interface ResearchState {
  state: ComponentState;
  /** Why, in one sentence, for the panel's own copy. Never a raw code. */
  reason: string;
  /**
   * Diagnostics behind the sentence — code, the server's own text, request id.
   * Shown only inside the notice's details disclosure (RF01-F4). Optional so
   * every existing caller keeps compiling unchanged.
   */
  detail?: string | null;
  /** False stops automatic retries — `denied` must not spin. */
  mayRetry: boolean;
  /** True when the panel keeps rendering its previous content underneath. */
  retainsContent: boolean;
}

const REFUSAL_STATE: Record<ResearchRefusalCode, ResearchState> = {
  /* 403-class: authorization, not absence. Retrying cannot change the answer. */
  RESEARCH_WORKSPACE_FORBIDDEN: {
    state: "denied",
    reason: "You don't have access to this in your current workspace, or it doesn't exist.",
    mayRetry: false,
    retainsContent: false,
  },
  /*
   * The draft moved under the caller. Resubmitting the same revision fails
   * identically, so it is terminal for this attempt; recovery is a re-read,
   * which is a new operation. Local input is kept so the edit is not lost.
   */
  RESEARCH_DRAFT_REVISION_CONFLICT: {
    state: "terminal",
    reason: "This draft changed since you loaded it. Reload to see the current revision.",
    mayRetry: false,
    retainsContent: true,
  },
  /*
   * The bounded admission queue is full. Unlike the two above this is purely
   * temporal, so it maps to `failed-retryable` rather than `unavailable`: the
   * dependency answered correctly, it answered "not now".
   */
  RESEARCH_ADMISSION_SATURATED: {
    state: "failed-retryable",
    reason: "The run queue is full. This request was not accepted and can be retried.",
    mayRetry: true,
    retainsContent: true,
  },
};

/** Transport statuses that mean "authorization", not "transient". */
const DENIED_STATUSES = new Set([401, 403]);

export function researchState(outcome: ResearchOutcome): ResearchState {
  switch (outcome.kind) {
    case "in-flight":
      return outcome.hasAcceptedResponse
        ? {
            state: "stale",
            reason: outcome.retainedAsOf
              ? `Showing the response accepted at ${outcome.retainedAsOf} while refreshing.`
              : "Showing the previously accepted response while refreshing.",
            mayRetry: true,
            retainsContent: true,
          }
        : {
            state: "loading",
            reason: "Loading.",
            mayRetry: true,
            retainsContent: false,
          };

    case "ok": {
      const declared = outcome.declaredUnavailable ?? [];
      if (declared.length > 0) {
        return {
          state: "partial",
          reason: `The server did not return ${declared.join(", ")}.`,
          mayRetry: true,
          retainsContent: true,
        };
      }
      if (outcome.isStale) {
        return {
          state: "stale",
          reason: outcome.asOf ? `Data as of ${outcome.asOf}.` : "Data is not current.",
          mayRetry: true,
          retainsContent: true,
        };
      }
      if (outcome.rowCount === 0) {
        return {
          state: "empty",
          reason: "No rows in this scope.",
          mayRetry: true,
          retainsContent: false,
        };
      }
      return { state: "available", reason: "", mayRetry: true, retainsContent: true };
    }

    case "refusal":
      return REFUSAL_STATE[outcome.code];

    case "transport":
      if (outcome.status !== null && DENIED_STATUSES.has(outcome.status)) {
        return {
          state: "denied",
          reason: "Your session is not authorized for this scope.",
          mayRetry: false,
          retainsContent: false,
        };
      }
      return {
        state: outcome.retryable ? "failed-retryable" : "unavailable",
        reason: "A dependency did not respond.",
        mayRetry: outcome.retryable,
        retainsContent: true,
      };

    case "terminal":
      return {
        state: "terminal",
        reason: outcome.reason,
        mayRetry: false,
        retainsContent: true,
      };
  }
}

/**
 * A number that the server did not send must not be rendered.
 * Returns `null` so the caller shows its state badge instead of a digit —
 * `selected_trial_id` is legitimately null for centroid/composite truth and is
 * not the number zero.
 */
export function researchNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/* -------------------------------------------------------------------------
 * Wire envelope
 *
 * `RESEARCH_SCREEN_STATE_SEMANTICS_V1.md` publishes a seven-value outer state,
 * while the Portal's internal `ComponentState` has ten. Both are correct for
 * their level, and the bridge lives here so a screen never has to pick one and
 * quietly diverge from the other.
 * ---------------------------------------------------------------------- */

export type ResearchPresentationStateV1 =
  | "loading"
  | "empty"
  | "partial"
  | "stale"
  | "denied"
  | "unavailable"
  | "terminal";

export interface ResearchPresentationMetaV1 {
  state: ResearchPresentationStateV1;
  /** Only from source; absent rather than guessed. */
  as_of?: string;
  reason_code?: string;
  display_message?: string;
  retryable: boolean;
}

const WIRE_STATE: Record<ComponentState, ResearchPresentationStateV1 | null> = {
  loading: "loading",
  empty: "empty",
  /* Content is present, so the panel needs no outer state at all. */
  available: null,
  partial: "partial",
  stale: "stale",
  denied: "denied",
  unavailable: "unavailable",
  /* Not expected in Research; a described-but-unbuilt panel cannot serve data. */
  commissioned: "unavailable",
  /* The wire vocabulary has no retryable variant — `retryable` carries it. */
  "failed-retryable": "unavailable",
  terminal: "terminal",
};

/**
 * Projects an internal state onto the published envelope.
 * Returns `null` when there is nothing to declare, i.e. content is available.
 */
export function toPresentationMeta(
  resolved: ResearchState,
  extra: { asOf?: string; reasonCode?: string } = {},
): ResearchPresentationMetaV1 | null {
  const wire = WIRE_STATE[resolved.state];
  if (wire === null) return null;
  return {
    state: wire,
    retryable: resolved.mayRetry,
    ...(extra.asOf ? { as_of: extra.asOf } : {}),
    ...(extra.reasonCode ? { reason_code: extra.reasonCode } : {}),
    ...(resolved.reason ? { display_message: resolved.reason } : {}),
  };
}
