/**
 * FE-068 · the ONE pre-click authority predicate of the Portal review-capture routes.
 *
 * Three readers used to carry their own copy of "may this member start a review capture here":
 *   - GovernanceReviewCaptureService.capabilities()  (what the screen's capture button was gated on),
 *   - the stage-action eligibility read               (the words next to a shut control),
 *   - the routes themselves (SessionGuard, capture(), assertDecisionAuthority, paperSnapshot()).
 * The first two could disagree with each other and with the routes (a retained-review build or a missing gate
 * grant still said AVAILABLE). Now `captureRefusal` is the single statement of the knowable preconditions, in the
 * order the routes refuse; capabilities() and the eligibility read both call it, and the routes' own projection
 * check calls `paperProjectionAuthorized`. A parity test runs the REAL guards (capture(), assertDecisionAuthority)
 * against this function.
 *
 * It is advisory: it reports a refusal the route WOULD give, never an allowance. A null result means only "none of
 * the preconditions that are knowable without the target refused you"; run completeness, parent approvals,
 * versions, projection freshness and idempotency still happen at submit and stay authoritative. It grants nothing
 * and consults no capability that the route does not consult (no canary/live name is ever read here).
 */
import { governanceDenial, type GovernanceDenial } from "../auth/governance-access";
import type { EffectiveAccess } from "../auth/owner-access.service";

export const CAPTURE_ACTIONS = ["R2_CREATE", "PAPER_EXIT_CREATE", "SANDBOX_NOTE"] as const;
export type CaptureAction = typeof CAPTURE_ACTIONS[number];

export type CaptureRefusal = "RETAINED_REVIEW_READ_ONLY" | "ADMIN_ROLE_REQUIRED" | GovernanceDenial |
  "CAPTURE_PROJECTION_NOT_AUTHORIZED";

export interface CaptureAuthorityFacts {
  workspace_id: string;
  /** The verified session user's current role. */
  role: string;
  /** The capability set the decision routes use (A4-3 adapter input). */
  access: EffectiveAccess;
  /** retainedReview(config): SessionGuard refuses every non-GET execution request first. */
  retained_review: boolean;
  /** paperProjectionAuthorized(config, workspace_id). */
  paper_projection_authorized: boolean;
}

/** The exact config predicate GovernanceReviewCaptureService enforces (context() and paperSnapshot()) for a workspace. */
export function paperProjectionAuthorized(config: {
  FEATURE_EXECUTION_LOCAL_PROJECTION?: string; FEATURE_EXECUTION_CURRENT_SOURCE_PAPER?: string;
  EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID?: string; EXECUTION_EDGE_PAPER_PROFILE_ID?: string;
}, workspaceId: string): boolean {
  return config.FEATURE_EXECUTION_LOCAL_PROJECTION === "true" && config.FEATURE_EXECUTION_CURRENT_SOURCE_PAPER === "true" &&
    config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID === workspaceId && Boolean(config.EXECUTION_EDGE_PAPER_PROFILE_ID);
}

/** Refusal order = the order the routes refuse in: SessionGuard (retained review) -> capture() ADMIN role ->
 * assertDecisionAuthority (SANDBOX_NOTE: gate PAPER_EXIT is role-only; PAPER_EXIT_CREATE: R2 read; R2_CREATE: R2 read
 * then R1 read) -> the paper projection configuration. */
export function captureRefusal(action: CaptureAction, facts: CaptureAuthorityFacts): CaptureRefusal | null {
  if (facts.retained_review) return "RETAINED_REVIEW_READ_ONLY";
  if (facts.role !== "ADMIN") return "ADMIN_ROLE_REQUIRED";
  if (action === "SANDBOX_NOTE") return null;
  const gates = action === "R2_CREATE" ? (["r2", "r1"] as const) : (["r2"] as const);
  for (const gate of gates) {
    const denied = governanceDenial({ access: facts.access, gate, mode: "read", workspaceId: facts.workspace_id });
    if (denied) return denied;
  }
  return facts.paper_projection_authorized ? null : "CAPTURE_PROJECTION_NOT_AUTHORIZED";
}
