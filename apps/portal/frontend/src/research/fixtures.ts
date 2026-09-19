/**
 * Research Loop — canonical consumer fixtures (P03 FE/consumer scope).
 *
 * These are the shapes a Research screen must already handle before it is
 * built, so that P10/P21/P22 test against one agreed envelope instead of each
 * inventing its own error body. They are fixtures, not a live endpoint: P03
 * exposes no browser route, and nothing here may be cited as evidence that a
 * request was served.
 *
 * The envelope matches `RESEARCH_SCREEN_STATE_SEMANTICS_V1.md` exactly,
 * including its snake_case wire fields.
 */

import type {
  ResearchPresentationMetaV1,
  ResearchRefusalCode,
} from "./state";

export type { ResearchPresentationMetaV1, ResearchPresentationStateV1 } from "./state";

/**
 * A foreign object — one that exists, but in a workspace the actor is not a
 * member of. The fixture deliberately carries no identifier of the owning
 * workspace and no row payload: leaking either would confirm the object's
 * existence and its owner, which is the disclosure `denied` exists to prevent.
 */
export const FOREIGN_OBJECT_DENIED: ResearchPresentationMetaV1 = {
  state: "denied",
  reason_code: "RESEARCH_WORKSPACE_FORBIDDEN",
  display_message: "This object belongs to a workspace you are not a member of.",
  retryable: false,
};

/**
 * The same scope with nothing in it. Kept beside the fixture above on purpose:
 * a screen that renders these two identically has the defect this pair exists
 * to catch.
 */
export const OWN_SCOPE_EMPTY: ResearchPresentationMetaV1 = {
  state: "empty",
  display_message: "No rows in this scope.",
  retryable: true,
};

export const DRAFT_REVISION_CONFLICT: ResearchPresentationMetaV1 = {
  state: "terminal",
  reason_code: "RESEARCH_DRAFT_REVISION_CONFLICT",
  display_message: "This draft changed since you loaded it.",
  retryable: false,
};

export const ADMISSION_SATURATED: ResearchPresentationMetaV1 = {
  state: "unavailable",
  reason_code: "RESEARCH_ADMISSION_SATURATED",
  display_message: "The run queue is full. This request was not accepted.",
  retryable: true,
};

/** Every frozen refusal, so a consumer test can assert it handles all of them. */
export const REFUSAL_FIXTURES: Readonly<Record<ResearchRefusalCode, ResearchPresentationMetaV1>> = {
  RESEARCH_WORKSPACE_FORBIDDEN: FOREIGN_OBJECT_DENIED,
  RESEARCH_DRAFT_REVISION_CONFLICT: DRAFT_REVISION_CONFLICT,
  RESEARCH_ADMISSION_SATURATED: ADMISSION_SATURATED,
};

/**
 * A transport failure with no typed body — the case where a screen is most
 * tempted to invent copy. `display_message` here is fixed local copy for the
 * status class, never an upstream exception string.
 */
export const UPSTREAM_UNAVAILABLE: ResearchPresentationMetaV1 = {
  state: "unavailable",
  display_message: "A dependency did not respond.",
  retryable: true,
};

/** A retained response with authoritative freshness from the server. */
export const RETAINED_STALE: ResearchPresentationMetaV1 = {
  state: "stale",
  as_of: "2026-09-19T00:00:00Z",
  display_message: "Showing the last accepted response.",
  retryable: true,
};

/** Server returned rows but declared named panels unavailable. */
export const PARTIAL_PANELS: ResearchPresentationMetaV1 = {
  state: "partial",
  display_message: "Some panels were not returned.",
  retryable: true,
};

export const ALL_FIXTURES: readonly ResearchPresentationMetaV1[] = [
  FOREIGN_OBJECT_DENIED,
  OWN_SCOPE_EMPTY,
  DRAFT_REVISION_CONFLICT,
  ADMISSION_SATURATED,
  UPSTREAM_UNAVAILABLE,
  RETAINED_STALE,
  PARTIAL_PANELS,
];
