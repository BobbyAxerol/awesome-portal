/**
 * FE-068 · advisory, own, per-action eligibility for the stage actions a screen
 * can offer BEFORE the click: a verdict, a readable `reason_class`, the rule the
 * server actually enforces today (`basis`) and a typed step-up state.
 *
 * It reports ONLY what the producing routes check today; it grants nothing:
 *   - no new capability or role. The action names below are display identifiers
 *     for the buttons, NOT capability names and never sent back as authority;
 *   - `ELIGIBLE` means "none of the route's own preconditions that are knowable
 *     without the target refused you". Row-level checks (run completeness, parent
 *     approval, version, projection freshness, idempotency) still happen at
 *     submit and remain authoritative. Every route rechecks current authority;
 *   - an action with no Portal route (canary/live commands) is NOT_COMMISSIONED
 *     regardless of any grant, and says so. No related capability is consulted,
 *     because mapping `live.halt` onto `safety.halt` or `governance.live.decide`
 *     would invent authority;
 *   - no cache/lease semantics: re-ask on mount, workspace switch and focus.
 */
import { z } from "zod";
import { governanceDenial, type GovernanceDenial } from "../auth/governance-access";
import type { EffectiveAccess } from "../auth/owner-access.service";

export const STAGE_ACTIONS = ["approval.create", "sandbox.review_note", "paper.exit_review_request",
  "canary.hold", "canary.reduce", "canary.rollback", "canary.request_scale",
  "live.halt", "live.reduce", "live.emergency_close"] as const;
export type StageAction = typeof STAGE_ACTIONS[number];

export const STAGE_REASONS = ["SUBMIT_CHECKS_REQUIRED", "RETAINED_REVIEW_READ_ONLY", "ADMIN_ROLE_REQUIRED",
  "GOVERNANCE_CAPABILITY_REQUIRED", "GOVERNANCE_SCOPE_MISMATCH", "CAPTURE_PROJECTION_NOT_AUTHORIZED",
  "COMMAND_FAMILY_NOT_COMMISSIONED"] as const;
export type StageReason = typeof STAGE_REASONS[number];
export const STAGE_BASES = ["WORKSPACE_MEMBERSHIP", "ADMIN_ROLE", "ADMIN_ROLE_AND_GOVERNANCE_R2_READ", "NONE_PUBLISHED"] as const;
/** None of the ten actions can require a fresh step-up today (three live routes ask for none, seven have no route),
 * so REQUIRED/ACTIVE are deliberately NOT part of this vocabulary; the capital rows of the batch eligibility carry them. */
export const STAGE_STEP_UP_STATES = ["NOT_REQUIRED", "NOT_DETERMINED"] as const;
export const ALPHA_SCOPES = ["WORKSPACE_ALL_COMPLETED_RUNS"] as const;

type Rule = { basis: typeof STAGE_BASES[number]; stepUp: boolean | null };
/** What each route enforces today. `stepUp` is whether the producing route demands a fresh step-up (none of the
 * three live routes does); null = no route exists, so the requirement is not determined, never "false". */
export const STAGE_RULES: Readonly<Record<StageAction, Rule>> = {
  "approval.create": { basis: "WORKSPACE_MEMBERSHIP", stepUp: false },
  "sandbox.review_note": { basis: "ADMIN_ROLE", stepUp: false },
  "paper.exit_review_request": { basis: "ADMIN_ROLE_AND_GOVERNANCE_R2_READ", stepUp: false },
  "canary.hold": { basis: "NONE_PUBLISHED", stepUp: null }, "canary.reduce": { basis: "NONE_PUBLISHED", stepUp: null },
  "canary.rollback": { basis: "NONE_PUBLISHED", stepUp: null }, "canary.request_scale": { basis: "NONE_PUBLISHED", stepUp: null },
  "live.halt": { basis: "NONE_PUBLISHED", stepUp: null }, "live.reduce": { basis: "NONE_PUBLISHED", stepUp: null },
  "live.emergency_close": { basis: "NONE_PUBLISHED", stepUp: null },
};

/** Optional workspace only (defaults to the session workspace, then membership-checked); no actor/role/as-of selector. */
export const stageActionEligibilityQuery = z.object({ workspace_id: z.string().min(3).max(96).optional() }).strict();
const ms = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const row = z.object({
  stage_action: z.enum(STAGE_ACTIONS),
  verdict: z.enum(["ELIGIBLE", "NOT_ELIGIBLE", "NOT_COMMISSIONED"]),
  eligible: z.boolean(),
  reason_class: z.enum(STAGE_REASONS), public_copy_key: z.enum(STAGE_REASONS),
  basis: z.enum(STAGE_BASES),
  step_up_required: z.boolean().nullable(),
  step_up_state: z.enum(STAGE_STEP_UP_STATES),
  /** Only the approval-creation row: which alphas the route lets this member request on (FE-069). */
  alpha_scope: z.enum(ALPHA_SCOPES).nullable(),
}).strict().superRefine((value, ctx) => {
  const rule = STAGE_RULES[value.stage_action];
  const bad = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  if (value.public_copy_key !== value.reason_class || value.basis !== rule.basis || value.step_up_required !== rule.stepUp ||
    value.eligible !== (value.verdict === "ELIGIBLE") ||
    (value.verdict === "ELIGIBLE") !== (value.reason_class === "SUBMIT_CHECKS_REQUIRED") ||
    (value.verdict === "NOT_COMMISSIONED") !== (value.reason_class === "COMMAND_FAMILY_NOT_COMMISSIONED") ||
    (value.verdict === "NOT_COMMISSIONED") !== (rule.basis === "NONE_PUBLISHED") ||
    (value.alpha_scope !== null) !== (value.stage_action === "approval.create"))
    bad("STAGE_ACTION_ROW_INCONSISTENT");
  if (value.step_up_state !== (rule.stepUp === null ? "NOT_DETERMINED" : "NOT_REQUIRED"))
    bad("STAGE_ACTION_STEP_UP_INCONSISTENT");
});
export const stageActionEligibility = z.object({
  schema_version: z.literal("portal.stage-action-eligibility.v1"),
  workspace_id: z.string().min(3).max(96),
  current_only: z.literal(true), advisory_only: z.literal(true),
  /** Portal evaluation time, not a source observation time and not a permission lease. */
  observed_at_ms: ms,
  /** This session's step-up fact, the same one the capital/access mutations recheck. */
  session_step_up: z.object({ state: z.enum(["ACTIVE", "NOT_ACTIVE"]), valid_until_ms: ms.nullable() }).strict(),
  actions: z.array(row).length(STAGE_ACTIONS.length),
}).strict().superRefine((value, ctx) => {
  const bad = (message: string, path: (string | number)[]) => ctx.addIssue({ code: z.ZodIssueCode.custom, message, path });
  if ((value.session_step_up.state === "ACTIVE") !== (value.session_step_up.valid_until_ms !== null) ||
    (value.session_step_up.valid_until_ms !== null && value.session_step_up.valid_until_ms <= value.observed_at_ms))
    bad("STAGE_ACTION_SESSION_STEP_UP_INVALID", ["session_step_up"]);
  value.actions.forEach((entry, index) => {
    if (entry.stage_action !== STAGE_ACTIONS[index]) bad("STAGE_ACTION_ORDER_INVALID", ["actions", index]);
  });
});
export type StageActionEligibility = z.infer<typeof stageActionEligibility>;

/** Server facts, gathered by the service AFTER the exact session/workspace-member fence. Never browser input. */
export interface StageEligibilityFacts {
  workspace_id: string;
  /** The user's current role from the verified session user. */
  role: string;
  /** The same capability set the decision routes use (A4-3 adapter input). */
  access: EffectiveAccess;
  retained_review: boolean;
  /** Same config predicate paperSnapshot() enforces for this workspace. */
  paper_projection_authorized: boolean;
  /** End of THIS session's active step-up, or null. */
  step_up_until_ms: number | null;
  observed_at_ms: number;
}

function denial(facts: StageEligibilityFacts): GovernanceDenial | null {
  return governanceDenial({ access: facts.access, gate: "r2", mode: "read", workspaceId: facts.workspace_id });
}
function verdictFor(action: StageAction, facts: StageEligibilityFacts): StageReason {
  const rule = STAGE_RULES[action];
  if (rule.basis === "NONE_PUBLISHED") return "COMMAND_FAMILY_NOT_COMMISSIONED";
  // SessionGuard refuses every non-GET execution request in a retained-review build before any route runs.
  if (facts.retained_review) return "RETAINED_REVIEW_READ_ONLY";
  if (rule.basis === "WORKSPACE_MEMBERSHIP") return "SUBMIT_CHECKS_REQUIRED";
  // Same order as GovernanceReviewCaptureService.capture(): ADMIN role first, then the gate authority.
  if (facts.role !== "ADMIN") return "ADMIN_ROLE_REQUIRED";
  if (rule.basis === "ADMIN_ROLE") return "SUBMIT_CHECKS_REQUIRED";
  const refused = denial(facts);
  if (refused) return refused;
  return facts.paper_projection_authorized ? "SUBMIT_CHECKS_REQUIRED" : "CAPTURE_PROJECTION_NOT_AUTHORIZED";
}

/** Pure projection of server-gathered facts. */
export function projectStageActionEligibility(facts: StageEligibilityFacts): StageActionEligibility {
  const stepUpActive = facts.step_up_until_ms !== null && facts.step_up_until_ms > facts.observed_at_ms;
  return stageActionEligibility.parse({
    schema_version: "portal.stage-action-eligibility.v1", workspace_id: facts.workspace_id,
    current_only: true, advisory_only: true, observed_at_ms: facts.observed_at_ms,
    session_step_up: { state: stepUpActive ? "ACTIVE" : "NOT_ACTIVE", valid_until_ms: stepUpActive ? facts.step_up_until_ms : null },
    actions: STAGE_ACTIONS.map(action => {
      const rule = STAGE_RULES[action], reason = verdictFor(action, facts);
      const verdict = reason === "SUBMIT_CHECKS_REQUIRED" ? "ELIGIBLE" :
        reason === "COMMAND_FAMILY_NOT_COMMISSIONED" ? "NOT_COMMISSIONED" : "NOT_ELIGIBLE";
      return { stage_action: action, verdict, eligible: verdict === "ELIGIBLE", reason_class: reason, public_copy_key: reason,
        basis: rule.basis, step_up_required: rule.stepUp,
        step_up_state: rule.stepUp === null ? "NOT_DETERMINED" : "NOT_REQUIRED",
        alpha_scope: action === "approval.create" ? "WORKSPACE_ALL_COMPLETED_RUNS" : null };
    }),
  });
}
