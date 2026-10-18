import { AccessPolicyError,type AccessResource } from "../execution-v2/access.contract";
import { currentAccessRelations } from "../execution-v2/access-current-relations";
import { accessDigest,currentBoundaryProof,evaluateAccess,type AccessEvaluationContext } from "../execution-v2/access-policy";
import { requireCurrentTsAuditRead } from "../execution-v2/current-audit-read";
import { nativeNoticeValidUntil } from "../execution-v2/read-scope";
import { selectedParentSeal,ParentFieldPurposeError } from "./positive-parent.authority";
import type { FollowingCandidate,FollowingSections } from "./following-parent.repository";
import type { ExactReadQualification } from "../operations/current-operational-read";
const targets=(p:FollowingCandidate):readonly AccessResource[]=>[
  {kind:"DEPLOYMENT",id:p.deploymentId},{kind:"PORTFOLIO",id:p.portfolioId}];
const effective=(context:AccessEvaluationContext)=>({...context,now_ms:Math.max(context.now_ms,Date.now())});
export function followingSections(context:AccessEvaluationContext,p:FollowingCandidate):FollowingSections{
  const root={...p,environment:p.requestedEnvironment};
  return p.family==="SANDBOX"?{steps:selectedParentSeal(context,root,"SANDBOX_STEPS")!==null,
    lineage:selectedParentSeal(context,root,"SANDBOX_LINEAGE")!==null,proposal:false}:
    {steps:false,lineage:selectedParentSeal(context,root,"CANARY_LINEAGE")!==null,
      proposal:selectedParentSeal(context,root,"CANARY_PROPOSAL")!==null};
}
export function qualifyFollowingParent(context:AccessEvaluationContext,p:FollowingCandidate):ExactReadQualification{
  const c=effective(context),env=p.requestedEnvironment,resources=targets(p);
  if(c.workspace_id!==p.workspaceId)throw new AccessPolicyError("ACCESS_RESOURCE_NOT_FOUND",404);
  // No flattened historical membership can attest a current native association.
  const source=currentAccessRelations.safeParse(c.relationsFor(c.principal_id).current_authority);
  if(!source.success||source.data.subject_user_id!==c.principal_id||source.data.workspace_id!==c.workspace_id)
    throw new AccessPolicyError("SOURCE_RELATION_NOT_QUALIFIED");
  const audits=resources.map(resource=>requireCurrentTsAuditRead(c,resource,env));
  const gate=p.family==="CANARY"?evaluateAccess(c,"governance.canary.read",resources[0]!,env):null;
  if(gate?!gate.allowed:c.actor_member!==true)throw new AccessPolicyError("ACCESS_RESOURCE_NOT_FOUND",404);
  const root=selectedParentSeal(c,{...p,environment:env},p.family==="SANDBOX"?"SANDBOX_ROOT":"CANARY_ROOT");
  if(!root)throw new ParentFieldPurposeError();
  const sections=followingSections(c,p);
  let until=Math.min(nativeNoticeValidUntil(c,env,c.actor_lease_until_ms!),root.seal.valid_until_ms);
  for(const seal of c.policy!.parent_read_fields??[])if(seal.environment===env)
    for(const t of [seal.valid_from_ms,seal.valid_until_ms])if(t>c.now_ms)until=Math.min(until,t);
  return {proof:accessDigest({domain:"portal.execution.following-parent-qualification.v1",candidate:p,
    policy:c.policy!.revision,root,sections,audits:audits.map(x=>[x.policy_revision,x.scope_revision,x.field_policy_ref]),
    gate:gate?[gate.policy_revision,gate.scope_revision,gate.field_policy_ref]:"CURRENT_ACTIVE_WORKSPACE_MEMBER",
    native:currentBoundaryProof(c,env,resources)}),valid_until_ms:until};
}
