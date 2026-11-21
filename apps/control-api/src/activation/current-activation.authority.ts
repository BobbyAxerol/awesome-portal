import { AccessPolicyError } from "../execution-v2/access.contract";
import { accessDigest,currentBoundaryProof,environmentRelations,evaluateAccess,type AccessEvaluationContext } from "../execution-v2/access-policy";
import { currentAccessRelations } from "../execution-v2/access-current-relations";
import { requireCurrentTsAuditRead } from "../execution-v2/current-audit-read";
import { nativeNoticeValidUntil } from "../execution-v2/read-scope";
import { selectedParentFieldSeal,ParentFieldPurposeError } from "../governance/positive-parent.authority";
import type { ExactReadQualification } from "../operations/current-operational-read";
import type { ParentFieldPurpose } from "../execution-v2/parent-read-fields";
import type { ActivationReadEnvironment } from "./current-activation.contract";

export interface ActivationSelection {workspaceId:string;environment:ActivationReadEnvironment;rootId:string;
  kind:"CAPABILITIES"|"PLAN";planId?:string;capabilityKey?:string}
const refused=():never=>{throw new AccessPolicyError("ACCESS_RESOURCE_NOT_FOUND",404);};
/** Current explicitly published technical perspective, never a captured native
 * environment. Present-invalid/missing versioned publication has no fallback. */
export function activationRoot(context:AccessEvaluationContext,environment:ActivationReadEnvironment):string{
  const relation=context.relationsFor(context.principal_id);
  const source=currentAccessRelations.safeParse(relation.current_authority);
  if(relation.qualified!==true||!source.success||source.data.subject_user_id!==context.principal_id||
    source.data.workspace_id!==context.workspace_id) return refused();
  const roots=Object.keys(environmentRelations(relation,environment).roots);
  if(roots.length!==1)return refused();
  return roots[0]!;
}
function selected(context:AccessEvaluationContext,s:ActivationSelection,purpose:ParentFieldPurpose){
  return selectedParentFieldSeal(context,s.environment,[{kind:"ROOT",id:s.rootId}],purpose);
}
export function activationSections(context:AccessEvaluationContext,s:ActivationSelection){
  return {evidence:selected(context,s,"ACTIVATION_PLAN_EVIDENCE")!==null,
    compatibility:selected(context,s,"ACTIVATION_PLAN_COMPATIBILITY")!==null};
}
export function qualifyActivation(context:AccessEvaluationContext,s:ActivationSelection):ExactReadQualification{
  const effective={...context,now_ms:Math.max(context.now_ms,Date.now())};
  if(effective.workspace_id!==s.workspaceId||activationRoot(effective,s.environment)!==s.rootId)return refused();
  const target={kind:"ROOT" as const,id:s.rootId},gate=evaluateAccess(effective,"maintenance.read",target,s.environment);
  if(!gate.allowed)return refused();
  const audit=requireCurrentTsAuditRead(effective,target,s.environment);
  const root=selected(effective,s,s.kind==="CAPABILITIES"?"ACTIVATION_CAPABILITIES":"ACTIVATION_PLAN_ROOT");
  if(!root)throw new ParentFieldPurposeError();
  const optional=s.kind==="PLAN"?["ACTIVATION_PLAN_EVIDENCE","ACTIVATION_PLAN_COMPATIBILITY"] as const:[];
  const sections=optional.map(purpose=>[purpose,selected(effective,s,purpose)]);
  let until=Math.min(nativeNoticeValidUntil(effective,s.environment,effective.actor_lease_until_ms!),root.seal.valid_until_ms);
  for(const seal of effective.policy!.parent_read_fields??[]){
    if(seal.environment!==s.environment)continue;
    for(const at of [seal.valid_from_ms,seal.valid_until_ms])if(at>effective.now_ms)until=Math.min(until,at);
  }
  return {proof:accessDigest({domain:"portal.execution.activation-qualification.v1",selection:s,
    policy_revision:effective.policy!.revision,root,sections,
    gate:[gate.policy_revision,gate.scope_revision,gate.field_policy_ref],
    audit:[audit.policy_revision,audit.scope_revision,audit.field_policy_ref],
    source:currentBoundaryProof(effective,s.environment,[target])}),valid_until_ms:until};
}
