import type { PortalUser } from "../domain";
import type { EffectiveAccess } from "../auth/owner-access.service";
import { approvalDecisionPredicate, approvalReadGates } from "../governance/governance.service";

/** Current legacy cockpit advisory, not a plan permit. The actual gate service
 * remains the sole mutation authority. Never call this to fill SCOPED_V2 gaps. */
export function commandCenterGovernanceGates(actor: PortalUser, access: EffectiveAccess, workspaceId: string) {
  const readable = approvalReadGates(actor, access, workspaceId);
  const mayDecide = approvalDecisionPredicate(actor, access, workspaceId);
  return { readable, actionable: readable.filter(mayDecide) };
}

/** Exact shared SQL population for page AND empty-page count.
 * Fixed alias request; $1 workspace, $2 actor, $3 observation, $4 current
 * actionable gates. The existing Inbox view supplies immutable-lineage-backed
 * R2 readiness. No actor label, client grant or guessed source state is used.
 * Paper may need REJECT/EXTEND even for self or blocked promotion; those
 * actions still require a real pending review, quorum1 and an independent plan.
 */
export const commandCenterGovernanceActionableSql = `
  request.workspace_id = $1
  AND request.gate = ANY($4::text[])
  AND request.status = 'PENDING'
  AND request.expires_at > $3
  AND NOT ($2 = ANY(request.decision_actor_ids))
  AND (
    (request.gate IN ('R1', 'R2')
      AND request.requester_user_id <> $2
      AND request.artifact_creator_user_id <> $2
      AND request.evidence_complete = true
      AND request.blocker_count = 0
      AND (request.gate <> 'R2' OR (
        request.r2_parent_ready = true
        AND request.r2_plan_author_user_id IS DISTINCT FROM $2
      )))
    OR (request.gate = 'PAPER_EXIT'
      AND request.quorum_required = 1
      AND EXISTS (
        SELECT 1 FROM governance_paper_exit_reviews review
        WHERE review.workspace_id = request.workspace_id
          AND review.review_id = request.approval_id
          AND review.gate = 'PAPER_EXIT'
          AND review.review_state = 'PENDING'
      ))
  )`;
