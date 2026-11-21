/**
 * Cockpit step-up model (FE-015/060, BE-P7): when may a control OFFER a password re-check? Pure, no DOM, no network; re-exported by
 * `laneModel.ts` so the cockpit has one model module.
 *
 * Doctrine, each line pinned by a test:
 * - ADVISORY. A batch row says `ALLOWED` and `REQUIRED`; a challenge says its precondition holds. Together they are an OFFER to ask for
 *   the caller's own password, never an authorisation: the command behind it re-checks every authority, and a 200 from the step-up
 *   route is not an `ACTIVE` row (the batch is re-read, nothing is inferred).
 * - NO DEAD BUTTON. No challenge with `precondition_met` means no button, and the reason is said instead.
 * - CAPITAL FIRST. A capital delegate has no `access.grant`; the `CAPITAL_COMMAND` challenge is preferred whenever it is met.
 * - FAIL CLOSED. A missing row, a row that is not ALLOWED, a rule that is not `REQUIRED`: no offer.
 */
import type { BatchEligibilityRow, BatchSessionStepUp, StepUpFamily } from "../../readers/accessSelfBatch";

/**
 * The words a step-up block prints. Advisory text only: nothing here enables a control, and none of it is a permission.
 * Sentences marked NEW are not in the approved copy yet (recorded in `consumer-receipt-be-p7-2026-10-20.md` for Bobby).
 */
export const STEP_UP_COPY = {
  /** NEW. The block's lead when a re-check is on offer. */
  needsRecheck: "This action needs a fresh password check.",
  /** NEW. NOT_REQUIRED row. */
  notRequired: "No step-up is required for this action.",
  /** NEW. PLAN_DEPENDENT row: the plan, not the action, decides. */
  planDecides: "The plan decides whether a step-up is needed.",
  /** NEW. No challenge can be started (no `precondition_met`), so no button is drawn. */
  noChallenge: "No step-up can be started for this session.",
  /** NEW. The row is not ALLOWED: the control's own reason stays, this block offers nothing. */
  notAllowed: "No step-up is offered because this action is not allowed for you.",
  /** NEW. The batch read is missing or failed: no state is shown, not even "required". */
  unread: "The step-up state could not be read.",
  /** NEW. The batch carries no row for the action asked. */
  noRow: "The step-up state was not published for this action.",
  /** Existing (stage reasons `sessionStepUpText`). */
  activeUntil: (when: string) => `This session has an active step-up until ${when}`,
  /** Existing (V1 StepUpPrompt). */
  passwordLabel: "Your password",
  confirm: "Confirm",
  checking: "Checking…",
  enterFirst: "Enter your password first.",
  withServer: "Your password is with the server; wait for its answer.",
  /** NEW. Failure sentences, one per code BE-P7 names, and the fallbacks. */
  rejected: "That password was not accepted.",
  denied: "A step-up is no longer open to you for this action.",
  authorityChanged: "Your password or session changed. Sign in again, then retry.",
  refusedOther: (code: string | null) => `The Portal refused the step-up${code === null ? "" : ` (${code})`}.`,
  notCompleted: "The step-up did not complete. Nothing was confirmed.",
  wrongFamily: "The answer was for another proof than the one asked, so it is not used.",
} as const;

/**
 * What a control may do about a step-up, from ONE row of the eligibility batch and this session's `session_step_up`.
 *
 * - `reauth`: the row is `ALLOWED` and `REQUIRED` (the rule demands a step-up and this session holds none) AND some challenge has
 *   `precondition_met`. The family is `CAPITAL_COMMAND` when that challenge is met (preferred), else `ACCESS_ADMIN` when that one is.
 * - `none`: every other state, each with its reason. `ACTIVE` carries the end time; only the batch may say it.
 */
export type StepUpOffer =
  | { kind: "reauth"; family: StepUpFamily }
  | { kind: "none"; why: "NOT_ALLOWED" | "NOT_REQUIRED" | "PLAN_DEPENDENT" | "ACTIVE" | "NO_CHALLENGE" | "NO_ROW"; text: string; activeUntilMs: number | null };

export function stepUpOffer(row: BatchEligibilityRow | undefined, session: BatchSessionStepUp): StepUpOffer {
  const none = (why: Extract<StepUpOffer, { kind: "none" }>["why"], text: string, activeUntilMs: number | null = null): StepUpOffer => ({ kind: "none", why, text, activeUntilMs });
  if (row === undefined) return none("NO_ROW", STEP_UP_COPY.noRow);
  if (row.permission !== "ALLOWED") return none("NOT_ALLOWED", STEP_UP_COPY.notAllowed);
  switch (row.stepUpState) {
    case "NOT_REQUIRED":
      return none("NOT_REQUIRED", STEP_UP_COPY.notRequired);
    case "PLAN_DEPENDENT":
      return none("PLAN_DEPENDENT", STEP_UP_COPY.planDecides);
    case "ACTIVE":
      return none("ACTIVE", "", session.validUntilMs);
    case "REQUIRED": {
      // The batch lists CAPITAL_COMMAND first, so "first met" is "capital preferred". A challenge counts only when it says so.
      const met = session.challenges.find((challenge) => challenge.preconditionMet === true);
      return met === undefined ? none("NO_CHALLENGE", STEP_UP_COPY.noChallenge) : { kind: "reauth", family: met.family };
    }
  }
}

/** The sentence for a refusal. Only the three codes BE-P7 names are mapped; any other code is the Portal's own word, shown as such. */
export function stepUpRefusalText(code: string | null): string {
  switch (code) {
    case "STEP_UP_REJECTED":
      return STEP_UP_COPY.rejected;
    case "ACCESS_DENIED":
      return STEP_UP_COPY.denied;
    case "CURRENT_ACTOR_AUTHORITY_REQUIRED":
      return STEP_UP_COPY.authorityChanged;
    default:
      return STEP_UP_COPY.refusedOther(code);
  }
}
