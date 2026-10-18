import { followingParentRead,type FollowingParentRead } from "./following-parent.contract";
import type { FollowingRaw,FollowingSections } from "./following-parent.repository";
const absent={availability:"NOT_PUBLISHED",reason_code:"PARENT_FIELD_PURPOSE_NOT_QUALIFIED"} as const;
function ms(value:unknown):number{
  if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(value))throw Error("FOLLOWING_PARENT_TIME_INVALID");
  const n=Date.parse(value);if(!Number.isSafeInteger(n)||n<0)throw Error("FOLLOWING_PARENT_TIME_INVALID");return n;
}
const maybeMs=(value:unknown)=>value===null?null:ms(value);
export function mapFollowingParent(raw:FollowingRaw,sections:FollowingSections,observed:number):FollowingParentRead{
  const p=raw.identity,r=raw.root;
  if(p.family==="SANDBOX"?r.certification_id!==p.certificationId:r.envelope_id!==p.envelopeId)throw Error("FOLLOWING_PARENT_IDENTITY_INVALID");
  for(const key of ["source_side_effect_requested","runtime_activation_requested","promotion_execution_requested"])
    if(r[key]!==false)throw Error("FOLLOWING_PARENT_SIDE_EFFECT_CONFLICT");
  const base={schema_version:"portal.execution.following-parent.v2",workspace_id:p.workspaceId,record_authority:"PORTAL",
    provenance_basis:"CURRENT_CORE_BASELINE",field_contract_revision:"portal.execution.parent-fields.v1",observed_at_ms:observed,
    source:{authority:"PORTAL",source_verdict:"NOT_ASSERTED",source_side_effect_requested:false,
      runtime_activation_requested:false,promotion_execution_requested:false},
    anchors:{deployment_id:p.deploymentId,portfolio_id:p.portfolioId,
      environment:p.requestedEnvironment.toUpperCase(),association_basis:"CURRENT_NATIVE_TARGET_CORRESPONDENCE",
      captured_environment_attested:false},
    accepted_manager_facts:{availability:"NOT_PUBLISHED",reason_code:"PARENT_ROOT_NOT_SOURCE_SCREEN_COMPOSITION"}};
  if(p.family==="SANDBOX")return followingParentRead.parse({...base,family:"SANDBOX",
    certification:{certification_id:r.certification_id,workflow_state:r.workflow_state,workflow_version:r.workflow_version,
      policy_version:r.policy_version,formula_version:r.formula_version,created_at_ms:ms(r.created_at),updated_at_ms:ms(r.updated_at),
      submitted_at_ms:maybeMs(r.submitted_at),decided_at_ms:maybeMs(r.decided_at),
      source_integration_state:r.source_integration_state,delivery_profile:r.delivery_profile},
    steps:sections.steps?{availability:"AVAILABLE",basis:"CURRENT_LATEST_STORED",items:raw.steps.map(s=>({
      step_key:s.step_key,availability:s.evidence_id===null?"NOT_RECORDED":"AVAILABLE",evidence_id:s.evidence_id,
      stored_evaluation_state:s.evaluation_state,source_authority:s.source_authority,source_verification_state:s.source_verification_state,
      as_of_ms:maybeMs(s.as_of),expires_at_ms:maybeMs(s.expires_at)}))}:absent,
    lineage:sections.lineage?{availability:"AVAILABLE",basis:"STORED_PORTAL_REFERENCE",
      promotion_grant_id:p.promotionGrantId,paper_exit_review_id:p.paperExitReviewId,r1_approval_id:p.r1ApprovalId,r2_approval_id:p.r2ApprovalId}:absent});
  const q=raw.proposal;if(sections.proposal&&q===null)throw Error("FOLLOWING_PARENT_PROPOSAL_INVALID");
  return followingParentRead.parse({...base,family:"CANARY",
    envelope:{envelope_id:r.envelope_id,revision:r.revision,previous_envelope_id:r.previous_envelope_id,
      expected_certification_version:r.expected_certification_version,status:r.status,created_at_ms:ms(r.created_at),
      source_integration_state:r.source_integration_state,delivery_profile:r.delivery_profile,production_command_active:r.production_command_active},
    proposal:sections.proposal&&q?{availability:"AVAILABLE",basis:"PROPOSED_NOT_EFFECTIVE",
      base_risk_profile_revision:q.base_risk_profile_revision,currency:q.currency,capital_cap:q.capital_cap,
      gross_notional_cap:q.gross_notional_cap,daily_loss_cap:q.daily_loss_cap,max_open_orders:q.max_open_orders,duration_days:q.duration_days}:absent,
    lineage:sections.lineage?{availability:"AVAILABLE",basis:"STORED_PORTAL_REFERENCE",certification_id:p.certificationId,
      promotion_plan_id:p.promotionPlanId,paper_exit_review_id:p.paperExitReviewId,r1_approval_id:p.r1ApprovalId,r2_approval_id:p.r2ApprovalId}:absent});
}
