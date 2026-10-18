import { AccessPolicyError,type AccessResource } from "../execution-v2/access.contract";
import { accessDigest,currentBoundaryProof,evaluateAccess,type AccessEvaluationContext } from "../execution-v2/access-policy";
import { requireCurrentTsAuditRead } from "../execution-v2/current-audit-read";
import { nativeNoticeValidUntil } from "../execution-v2/read-scope";
import type { ExactReadQualification } from "../operations/current-operational-read";
import { ParentFieldPurposeError,selectedParentFieldSeal } from "./positive-parent.authority";
import type { LiveParentCandidate } from "./live-parent.repository";
export function qualifyLiveParent(context:AccessEvaluationContext,p:LiveParentCandidate):ExactReadQualification{
  const c={...context,now_ms:Math.max(context.now_ms,Date.now())};
  if(c.workspace_id!==p.workspaceId||p.family!=="LIVE_GATE"||p.environment!=="LIVE")
    throw new AccessPolicyError("ACCESS_RESOURCE_NOT_FOUND",404);
  const target:AccessResource={kind:"DEPLOYMENT",id:p.deploymentId};
  const audit=requireCurrentTsAuditRead(c,target,"live");
  const gate=evaluateAccess(c,"governance.live.read",target,"live");
  if(!gate.allowed)throw new AccessPolicyError("ACCESS_RESOURCE_NOT_FOUND",404);
  const root=selectedParentFieldSeal(c,"live",[target],"LIVE_ROOT");
  if(!root)throw new ParentFieldPurposeError();
  let until=Math.min(nativeNoticeValidUntil(c,"live",c.actor_lease_until_ms!),root.seal.valid_until_ms);
  for(const seal of c.policy!.parent_read_fields??[])if(seal.environment==="live")
    for(const t of [seal.valid_from_ms,seal.valid_until_ms])if(t>c.now_ms)until=Math.min(until,t);
  return {proof:accessDigest({domain:"portal.execution.live-parent-qualification.v1",candidate:p,
    policy_revision:c.policy!.revision,root,audit:[audit.policy_revision,audit.scope_revision,audit.field_policy_ref],
    gate:[gate.policy_revision,gate.scope_revision,gate.field_policy_ref],
    source:currentBoundaryProof(c,"live",[target])}),valid_until_ms:until};
}
