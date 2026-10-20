/** FE-015/060/068 · which password re-authentication proof (step-up) may satisfy which action.
 *
 * A step-up proof is only "this actor re-entered their OWN password in THIS session recently". It is never a
 * capability: every consumer re-evaluates its own authority at the moment of use, and no proof here grants or
 * implies any access. The family says which kind of actor the proof was issued to, so a capital delegate can
 * prove themselves WITHOUT being given (or needing) access.grant / access.revoke, and so that proof does not
 * silently satisfy an access-administration, owner-lifecycle or governance-grant mutation.
 *
 *   ACCESS_ADMIN     issued only to an actor holding a current own access.grant / access.revoke ALLOW (the
 *                    pre-existing route rule, unchanged). Satisfies everything a step-up ever satisfied.
 *   CAPITAL_COMMAND  issued only to an actor holding a current own ALLOW of a step-up-requiring capital /
 *                    pending-control / registration action. Satisfies ONLY those command actions.
 *
 * Pure module: no database, no I/O, no imports beyond a type. The storage tag lives in AccountLifecycleRepository.
 */
import type { AccessAction } from "./access.contract";

export const STEP_UP_FAMILIES = ["ACCESS_ADMIN", "CAPITAL_COMMAND"] as const;
export type StepUpFamily = typeof STEP_UP_FAMILIES[number];

/** Exactly the actions whose producing route demands a fresh step-up and whose authority is a capital/command
 * grant. Pinned by test to `RULES[action].stepUp === true` in self-eligibility.ts (one list, two readers). */
export const CAPITAL_STEP_UP_ACTIONS = ["capital.fund", "capital.initial_grant", "capital.top_up",
  "capital.immediate_decrease", "capital.recall_partial", "capital.recall_full", "capital.adjust_target_budget",
  "capital.set_root_limit", "capital.apply_pending", "capital.cancel_remaining", "deployment.register",
] as const satisfies readonly AccessAction[];

/** Proofs that satisfy an access / owner / governance-grant mutation: the historical rule, nothing wider. */
export const ACCESS_STEP_UP_PROOFS: readonly StepUpFamily[] = Object.freeze(["ACCESS_ADMIN"] as const);
/** Proofs that satisfy a capital / pending-control / registration command. ACCESS_ADMIN stays accepted so an
 * actor that could already step up through the access route loses nothing. */
export const COMMAND_STEP_UP_PROOFS: readonly StepUpFamily[] = Object.freeze(["ACCESS_ADMIN", "CAPITAL_COMMAND"] as const);

/** Fail closed: an action that is not a known step-up-requiring command action accepts only the narrow proof. */
export function stepUpProofsFor(action: AccessAction): readonly StepUpFamily[] {
  return (CAPITAL_STEP_UP_ACTIONS as readonly string[]).includes(action) ? COMMAND_STEP_UP_PROOFS : ACCESS_STEP_UP_PROOFS;
}
