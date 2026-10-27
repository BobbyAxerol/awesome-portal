/**
 * What the Portfolio 360 Actions rail may say about the caller's own eligibility (DEBT-UXM07-011, W6 of the self-contract review;
 * FE-015/060). Pure: no React, no fetch.
 *
 * The source is the self-eligibility BATCH (`portal.self-eligibility-batch.v2`, `api.getSelfEligibilityBatch`), asked once for the
 * one resource `PORTFOLIO:<id>` and the capital actions the rail's controls stand for. It is ADVISORY (`readers/accessSelf.ts`):
 *
 * - `ALLOWED` means "a current own grant exists". It is not a permit, not a preview and not a command: family, entity, source,
 *   step-up freshness and command readiness are all `NOT_CHECKED`, and the rail has no preview (FE-020) and no submit. Every control
 *   therefore stays off whatever the rows say; the rail prints the row as a SENTENCE under the control and never enables it;
 * - `UNAVAILABLE` is the server's own reason class, worded below. It is never a guess from a 403;
 * - a control whose action is not in the 28-action eligibility vocabulary keeps its typed absence ("Not published", FE-015) with the
 *   exact missing item, instead of borrowing a neighbour's row.
 *
 * The control -> action table is this file's only judgement. It is conservative on purpose: a control gets a row only where the
 * action name is the control's own meaning (grant = initial grant and top up, recall = partial and full recall, target = adjust
 * target budget). Return, Lock and Deploy have no action of their own in the vocabulary and say so.
 */
import type { EligibilityAction, EligibilityUnavailableReason } from "../../../readers/accessSelf";
import type { BatchEligibilityRow } from "../../../readers/accessSelfBatch";
import { PF_FE, npReason } from "../fe";

export type RailControlId = "grant" | "recall" | "target" | "return" | "lock" | "deploy";

interface RailMapping {
  /** The eligibility actions this control stands for; empty when the vocabulary has none for it. */
  actions: readonly EligibilityAction[];
  /** For an empty `actions`: what is missing, in one sentence. */
  missing: string | null;
}

export const RAIL_ELIGIBILITY_MAP: Readonly<Record<RailControlId, RailMapping>> = {
  grant: { actions: ["capital.initial_grant", "capital.top_up"], missing: null },
  recall: { actions: ["capital.recall_partial", "capital.recall_full"], missing: null },
  target: { actions: ["capital.adjust_target_budget"], missing: null },
  return: { actions: [], missing: "The eligibility vocabulary has no action for returning capital." },
  lock: { actions: [], missing: "The eligibility vocabulary has no action for locking an allocation." },
  deploy: { actions: [], missing: "The eligibility vocabulary has no action for starting a version on an account (deployment.register registers an instance)." },
};

/** Every action the rail asks about, once and in a fixed order (the request must not repeat an action). */
export const RAIL_ELIGIBILITY_ACTIONS: readonly EligibilityAction[] = [...new Set(Object.values(RAIL_ELIGIBILITY_MAP).flatMap((mapping) => mapping.actions))];

/** The action in words for a sentence. */
const ACTION_WORD: Readonly<Partial<Record<EligibilityAction, string>>> = {
  "capital.initial_grant": "Initial grant",
  "capital.top_up": "Top up",
  "capital.recall_partial": "Partial recall",
  "capital.recall_full": "Full recall",
  "capital.adjust_target_budget": "Target budget",
};

/** PROPOSED copy for the server's reason classes (consumer-review-self-contracts section 8); not yet approved by Bobby. */
export const ELIGIBILITY_REASON_COPY: Readonly<Record<EligibilityUnavailableReason, string>> = {
  NO_CURRENT_PERMISSION: "You don't have access to this action here",
  POLICY_PENDING: "Access policy isn't active for your workspace yet",
  FIELD_POLICY_PENDING: "Restricted view isn't available yet",
  ACTION_TARGET_UNSUPPORTED: "Not available for this kind of item",
};

/** The rail's read of the batch, one value per phase. A row exists only in `ready`. */
export type RailEligibilityView =
  /** Nothing was asked: no workspace in the address, or the rail is closed. */
  | { phase: "idle"; reason: string }
  | { phase: "loading" }
  | { phase: "ready"; rows: ReadonlyMap<EligibilityAction, BatchEligibilityRow> }
  /** The Portal refused the read (401/403) or could not answer it; the sentence is what it said. */
  | { phase: "denied" | "unavailable"; reason: string }
  /** The session ceiling of the body has passed: nothing of it is shown. */
  | { phase: "expired"; reason: string };

export const RAIL_IDLE_NO_WORKSPACE = "Not read. This page's address names no workspace, so it did not ask what you may do here.";
export const RAIL_PREVIEW_NOTE = "Preview is not available here, so nothing can be submitted";

function rowSentence(row: BatchEligibilityRow): string {
  const word = ACTION_WORD[row.action] ?? row.action;
  if (row.permission === "ALLOWED") return `${word}: you hold a current grant. ${RAIL_PREVIEW_NOTE}`;
  return `${word}: ${ELIGIBILITY_REASON_COPY[row.reasonClass]}`;
}

/**
 * True when the caller's own eligibility ALLOWS one of the actions the control stands for (advisory, `ready` only). It lets the rail offer
 * a REVIEW of published figures; it is never a permit and never enables a command: the rail has no submit (FE-020).
 */
export function railControlEligible(control: RailControlId, view: RailEligibilityView): boolean {
  if (view.phase !== "ready") return false;
  return RAIL_ELIGIBILITY_MAP[control].actions.some((action) => view.rows.get(action)?.permission === "ALLOWED");
}

/**
 * The sentence under one control. Never empty: the control stays off in every phase, so there is always a reason to print.
 */
export function railControlReason(control: RailControlId, view: RailEligibilityView): string {
  const mapping = RAIL_ELIGIBILITY_MAP[control];
  if (mapping.actions.length === 0) return npReason(PF_FE.actions, mapping.missing ?? "No eligibility is published for this control.");
  switch (view.phase) {
    case "idle":
    case "denied":
    case "unavailable":
    case "expired":
      return view.reason;
    case "loading":
      return "Reading what you may do here.";
    case "ready": {
      const sentences = mapping.actions.map((action) => {
        const row = view.rows.get(action);
        // The batch answered the question (eligibilityBatchAnswers), so a missing row is a reader-side surprise: say it, never "not allowed".
        return row === undefined ? `${ACTION_WORD[action] ?? action}: Not read` : rowSentence(row);
      });
      return sentences.join(" · ");
    }
  }
}
