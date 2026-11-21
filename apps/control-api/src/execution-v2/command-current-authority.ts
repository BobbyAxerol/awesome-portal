import type { AccessActor, AccessAction } from "./access.contract";
import type { CommandIntent } from "./command.contract";
import type { CommandAuthorization } from "./command-trust";
import { currentAccessRelations, currentGrantProof } from "./access-current-relations";
import { currentGrantAllows, type AccessEvaluationContext } from "./access-policy";

/** Internal candidate compatibility only, NOT a source adapter or new grant.
 * The private command receipt triple must retain its original accepted-fact
 * meaning. Current native leg identity remains opaque; delegation_ref is not a
 * Core grant ID. Real PM authentication/held-COMMIT qualification is separate. */
export function commandMembershipCurrent(
  authorization:Pick<CommandAuthorization,"ts_user_id"|"mapping_revision"|"membership_revision"|"membership_receipt_ref">,
  actor:AccessActor,intent:Pick<CommandIntent,"workspace_id"|"resource"|"environment">,
  context:AccessEvaluationContext,expectedAction:AccessAction,now:number):boolean {
  if(context.principal_id!==actor.user_id||context.workspace_id!==intent.workspace_id)return false;
  const relations=context.relationsFor(actor.user_id);
  if(!Object.hasOwn(relations,"current_authority")) {
    // Absence only: preserve historical private DTO and singleton behavior.
    if(relations.qualified!==true)return false;
    const membership=relations.membership;
    return Boolean(membership&&membership.revision===authorization.membership_revision&&
      membership.mapping_revision===authorization.mapping_revision&&
      membership.receipt_id===authorization.membership_receipt_ref);
  }
  const parsed=currentAccessRelations.safeParse(relations.current_authority);
  if(!relations.qualified||!parsed.success)return false;
  const source=parsed.data;
  if(source.subject_user_id!==actor.user_id||source.workspace_id!==intent.workspace_id||
    source.ts_user_id!==authorization.ts_user_id||source.mapping_revision!==authorization.mapping_revision)return false;
  // Actual final DB time, not the pre-I/O snapshot clock. The full evaluator
  // keeps every DENY and ancestor; source proof alone is not mutation authority.
  const at={...context,now_ms:now};
  let matches=0;
  for(const grant of at.grants) {
    const receipt=grant.ts_receipt;
    if(grant.subject_user_id!==actor.user_id||grant.workspace_id!==intent.workspace_id||
      grant.action!==expectedAction||grant.effect!=="ALLOW"||!grant.environments.includes(intent.environment)||
      !receipt||receipt.receipt_id!==authorization.membership_receipt_ref||
      receipt.membership_revision!==authorization.membership_revision||
      receipt.mapping_revision!==authorization.mapping_revision)continue;
    if(!currentGrantProof(grant,source,intent.resource,intent.environment,now)||
      !currentGrantAllows(at,expectedAction,intent.resource,intent.environment,grant.grant_id))continue;
    // Do not silently select the first of ambiguous accepted correspondences.
    if(++matches>1)return false;
  }
  return matches===1;
}
