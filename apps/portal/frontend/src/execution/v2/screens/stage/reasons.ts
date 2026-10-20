/**
 * Why a stage control is off, in one place (S3 plan s1; hi-fi kit.js `KIT.WHY`).
 *
 * The five sentences the Sandbox, Canary, Live and New request screens share for a
 * disabled button. Every string is the one the hi-fi prints; screens pass the sentence
 * as the `reason` of a `DockAction` (which ties it to the button with `aria-describedby`
 * and adds the "My access" link) or beside a plain disabled `<button>`.
 *
 * Choosing the key is the caller's job and follows the server, not the role name (D10):
 * `noGrant` only when the server refused for a missing grant, `liveClosed` when the
 * command policy is closed, `notEnabled` when the profile does not offer the action.
 * The hi-fi keys `noExport`, `author` and `needNote` belong to other screens and are not
 * stage reasons (`needNote` says 12 characters; the stage note needs 24 and the request
 * summary 8, D8a, so they print their own count).
 */
export const STAGE_WHY = {
  /** The signed-in person lacks the grant the server asked for. */
  noGrant: "Needs the approver grant",
  /** The action exists but this profile does not offer it. */
  notEnabled: "Not enabled for this profile",
  /** Real-funded decisions (Hold, Reduce, Rollback, Halt, Emergency close, Request scale) cannot be sent from this build. */
  liveClosed: "Live decisions are closed on this build",
  /** The screen is a read-only view on this build. */
  readOnly: "Read-only on this build",
  /** The command relay is not qualified, so nothing can be sent through it. */
  relay: "Relay is not qualified yet",
} as const;

import type { StageAction, StageActionEligibility, StageActionRow, StageBasis, StageReasonClass, StageStepUpState } from "../../readers/stageActionEligibility";

export type StageWhyKey = keyof typeof STAGE_WHY;

export const STAGE_WHY_KEYS = Object.keys(STAGE_WHY) as readonly StageWhyKey[];

/** The sentence for a key. An unknown key (a caller cast) reads as `notEnabled`, never as a permission. */
export function stageWhy(key: StageWhyKey): string {
  return Object.hasOwn(STAGE_WHY, key) ? STAGE_WHY[key] : STAGE_WHY.notEnabled;
}

/* ── FE-068: the server's own reason, when it published one ───────────────────────────────────────────────────────────────── */

/** What `COMMAND_FAMILY_NOT_COMMISSIONED` reads as: no Portal route exists for the action, whatever the reader holds. */
export const NOT_COMMISSIONED_WHY = "Not offered in the portal yet";

/**
 * The sentence for each class of reason the stage-action eligibility publishes (D10: it follows the server's class, not a role name,
 * and invents no capability name). `SUBMIT_CHECKS_REQUIRED` is the one class that is NOT a refusal: it has no sentence here, because
 * an eligible verdict never changes a control that is already off.
 */
export const STAGE_REASON_WHY: Readonly<Record<Exclude<StageReasonClass, "SUBMIT_CHECKS_REQUIRED">, string>> = {
  RETAINED_REVIEW_READ_ONLY: STAGE_WHY.readOnly,
  ADMIN_ROLE_REQUIRED: STAGE_WHY.noGrant,
  GOVERNANCE_CAPABILITY_REQUIRED: STAGE_WHY.noGrant,
  GOVERNANCE_SCOPE_MISMATCH: STAGE_WHY.noGrant,
  CAPTURE_PROJECTION_NOT_AUTHORIZED: STAGE_WHY.notEnabled,
  COMMAND_FAMILY_NOT_COMMISSIONED: NOT_COMMISSIONED_WHY,
};

/**
 * FE-068 (BE-P7 `594c298f`): `review-capture-capabilities` and the stage-action eligibility now answer from ONE predicate, in the
 * order the routes refuse, so a capture that is off carries the SAME reason classes as the eligibility row (`RETAINED_REVIEW_READ_ONLY`,
 * `ADMIN_ROLE_REQUIRED`, `GOVERNANCE_CAPABILITY_REQUIRED`, `GOVERNANCE_SCOPE_MISMATCH`, `CAPTURE_PROJECTION_NOT_AUTHORIZED`). The
 * capabilities row's `reason_code` is a free string in the schema; this reads the known ones through the SAME dictionary as the
 * eligibility (one set of words, no second table) and says `null` for any other code, so a screen keeps the code as the server sent it
 * and its own generic sentence. Text only: nothing it returns can enable a control.
 */
export function captureReasonText(code: string | null | undefined): string | null {
  if (typeof code !== "string" || !Object.hasOwn(STAGE_REASON_WHY, code)) return null;
  return STAGE_REASON_WHY[code as keyof typeof STAGE_REASON_WHY];
}

/** The rule the producing route enforces today, in words (the basis is published; it is not a capability name). */
export const STAGE_BASIS_TEXT: Readonly<Record<StageBasis, string>> = {
  WORKSPACE_MEMBERSHIP: "workspace membership",
  ADMIN_ROLE: "Admin role",
  ADMIN_ROLE_AND_GOVERNANCE_R2_READ: "Admin role and the R2 read grant",
  NONE_PUBLISHED: "none published",
};

/** `step_up_state` as text. `NOT_DETERMINED` is not "not required": no route exists to ask. */
export const STAGE_STEP_UP_TEXT: Readonly<Record<StageStepUpState, string>> = {
  NOT_REQUIRED: "not required",
  NOT_DETERMINED: "not determined",
};

/**
 * The reason a control that is ALREADY OFF reads with, given the caller's own advisory eligibility.
 *
 * - no eligibility (the read is missing, failed, or is for another workspace) or an `ELIGIBLE` row: the control's own `fallback`,
 *   unchanged. An `ELIGIBLE` verdict only says the route's knowable preconditions did not refuse the reader; it never turns a control
 *   on and never rewrites why it is off;
 * - a refusing row: the sentence for its `reason_class`, then the basis and the step-up state as text;
 * - `NOT_COMMISSIONED`: "Not offered in the portal yet", the basis ("none published") and the step-up state ("not determined").
 *
 * This function returns TEXT. Nothing it returns can enable anything.
 */
export function stageActionReason(eligibility: StageActionEligibility | null | undefined, action: StageAction, fallback: string): string {
  const row: StageActionRow | undefined = eligibility?.actions.find((candidate) => candidate.action === action);
  if (row === undefined || row.verdict === "ELIGIBLE" || row.reasonClass === "SUBMIT_CHECKS_REQUIRED") return fallback;
  return [
    STAGE_REASON_WHY[row.reasonClass],
    `Basis: ${STAGE_BASIS_TEXT[row.basis]}`,
    `Step-up: ${STAGE_STEP_UP_TEXT[row.stepUpState]}`,
  ].join(" · ");
}

/** This session's step-up as one sentence, for a screen that wants to say it. A statement of fact about the session, not a permission. */
export function sessionStepUpText(eligibility: StageActionEligibility | null | undefined, format: (ms: number) => string): string | null {
  if (!eligibility) return null;
  const step = eligibility.sessionStepUp;
  return step.state === "ACTIVE" ? `This session has an active step-up until ${format(step.validUntilMs)}` : "This session has no active step-up";
}

/** Re-exported so a screen imports the action names from the same place as the reasons. */
export type { StageAction };
