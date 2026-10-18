import { z } from "zod";
const id=z.string().min(1).max(191).regex(/^[A-Za-z0-9._:-]+$/);
const text=z.string().min(1).refine(v=>[...v].length<=191&&!/[\u0000-\u001f\u007f]/u.test(v));
const ms=z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),version=ms.refine(v=>v>0);
export const followingSteps=["CONNECT","SYNC","ORDER_TYPES","RECONCILIATION","TIMEBOXED_RUN","CLEANUP","EXIT_REVIEW"] as const;
const absent=z.object({availability:z.literal("NOT_PUBLISHED"),reason_code:z.literal("PARENT_FIELD_PURPOSE_NOT_QUALIFIED")}).strict();
const source=z.object({authority:z.literal("PORTAL"),source_verdict:z.literal("NOT_ASSERTED"),
  source_side_effect_requested:z.literal(false),runtime_activation_requested:z.literal(false),
  promotion_execution_requested:z.literal(false)}).strict();
const base={schema_version:z.literal("portal.execution.following-parent.v2"),
  workspace_id:z.string().refine(v=>[...v].length>=3&&[...v].length<=96),record_authority:z.literal("PORTAL"),
  provenance_basis:z.literal("CURRENT_CORE_BASELINE"),field_contract_revision:z.literal("portal.execution.parent-fields.v1"),
  observed_at_ms:ms,source,accepted_manager_facts:z.object({availability:z.literal("NOT_PUBLISHED"),
    reason_code:z.literal("PARENT_ROOT_NOT_SOURCE_SCREEN_COMPOSITION")}).strict()};
const anchors=<T extends "SANDBOX"|"LIVE">(env:T)=>z.object({deployment_id:id,portfolio_id:id,environment:z.literal(env),
  association_basis:z.literal("CURRENT_NATIVE_TARGET_CORRESPONDENCE"),captured_environment_attested:z.literal(false)}).strict();
const sandboxLineage=z.object({availability:z.literal("AVAILABLE"),basis:z.literal("STORED_PORTAL_REFERENCE"),
  promotion_grant_id:id,paper_exit_review_id:id,r1_approval_id:id,r2_approval_id:id}).strict();
const step=z.object({step_key:z.enum(followingSteps),availability:z.enum(["AVAILABLE","NOT_RECORDED"]),
  evidence_id:id.nullable(),stored_evaluation_state:z.enum(["PASS","FAIL","STALE","UNAVAILABLE"]).nullable(),
  source_authority:z.enum(["PORTAL","EXECUTION","BROKER","DERIVED"]).nullable(),
  source_verification_state:z.enum(["VERIFIED","UNAVAILABLE"]).nullable(),as_of_ms:ms.nullable(),expires_at_ms:ms.nullable(),
}).strict().superRefine((v,c)=>{
  if(v.availability==="NOT_RECORDED"&&Object.entries(v).some(([k,x])=>!["step_key","availability"].includes(k)&&x!==null)||
    v.availability==="AVAILABLE"&&(v.evidence_id===null||v.stored_evaluation_state===null||v.source_authority===null||v.source_verification_state===null))
    c.addIssue({code:z.ZodIssueCode.custom,message:"PARENT_STEP_SHAPE_INVALID"});
});
export const sandboxParentRead=z.object({...base,family:z.literal("SANDBOX"),anchors:anchors("SANDBOX"),
  certification:z.object({certification_id:id,workflow_state:z.enum(["DRAFT","IN_REVIEW","APPROVED","DENIED"]),
    workflow_version:version,policy_version:text,formula_version:text,created_at_ms:ms,updated_at_ms:ms,
    submitted_at_ms:ms.nullable(),decided_at_ms:ms.nullable(),source_integration_state:z.enum(["UNAVAILABLE","SHADOW"]),
    delivery_profile:z.enum(["fixture","shadow"])}).strict(),
  steps:z.union([z.object({availability:z.literal("AVAILABLE"),basis:z.literal("CURRENT_LATEST_STORED"),
    items:z.array(step).length(7)}).strict().refine(v=>followingSteps.every(k=>v.items.filter(x=>x.step_key===k).length===1),"PARENT_STEP_SET_INVALID"),absent]),
  lineage:z.union([sandboxLineage,absent]),
}).strict().superRefine((v,c)=>{
  const r=v.certification;
  if(r.updated_at_ms<r.created_at_ms||r.submitted_at_ms!==null&&r.submitted_at_ms<r.created_at_ms||
    r.decided_at_ms!==null&&(r.submitted_at_ms===null||r.decided_at_ms<r.submitted_at_ms)||
    (r.workflow_state==="DRAFT")!==(r.submitted_at_ms===null)||
    ["APPROVED","DENIED"].includes(r.workflow_state)!==(r.decided_at_ms!==null))
    c.addIssue({code:z.ZodIssueCode.custom,message:"PARENT_WORKFLOW_TIME_INVALID"});
});
const decimal=z.string().regex(/^(?:0|[1-9][0-9]{0,19})(?:\.[0-9]{1,18})?$/).refine(v=>/[1-9]/.test(v),"POSITIVE_DECIMAL_REQUIRED");
export const canaryParentRead=z.object({...base,family:z.literal("CANARY"),anchors:anchors("LIVE"),
  envelope:z.object({envelope_id:id,revision:version,previous_envelope_id:id.nullable(),status:z.literal("DRAFT"),
    expected_certification_version:version,created_at_ms:ms,source_integration_state:z.literal("UNAVAILABLE"),
    delivery_profile:z.literal("fixture"),production_command_active:z.literal(false)}).strict(),
  proposal:z.union([z.object({availability:z.literal("AVAILABLE"),basis:z.literal("PROPOSED_NOT_EFFECTIVE"),
    base_risk_profile_revision:text,currency:z.string().regex(/^[A-Z0-9]{2,12}$/),capital_cap:decimal,
    gross_notional_cap:decimal,daily_loss_cap:decimal,max_open_orders:z.number().int().min(1).max(1_000_000),
    duration_days:z.number().int().min(1).max(90)}).strict(),absent]),
  lineage:z.union([z.object({availability:z.literal("AVAILABLE"),basis:z.literal("STORED_PORTAL_REFERENCE"),
    certification_id:id,promotion_plan_id:id,paper_exit_review_id:id,r1_approval_id:id,r2_approval_id:id}).strict(),absent]),
}).strict().refine(v=>(v.envelope.revision===1)===(v.envelope.previous_envelope_id===null),"PARENT_PREDECESSOR_INVALID");
export const followingParentRead=z.union([sandboxParentRead,canaryParentRead]);
export type FollowingParentRead=z.infer<typeof followingParentRead>;
