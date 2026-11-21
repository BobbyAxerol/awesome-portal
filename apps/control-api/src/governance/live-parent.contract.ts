import { z } from "zod";
const id=z.string().regex(/^[A-Za-z0-9._:-]{1,191}$/);
const text=z.string().min(1).refine(v=>[...v].length<=191&&!/[\u0000-\u001f\u007f]/u.test(v));
const ms=z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),version=ms.refine(v=>v>0);
/** Optional, separately sealed (LIVE_BLOCKERS) read of the SAME approval row/snapshot as the gate fields. Omitted when
 * the purpose is not authorized; ABSENT is typed absence, never zero blockers or a clear gate. */
export const liveBlockers=z.union([
  z.object({availability:z.literal("AVAILABLE"),basis:z.literal("SAME_READ_SNAPSHOT_AS_APPROVAL"),
    approval_id:id,approval_version:version,blocker_count:ms,blocker_summary:text.nullable()}).strict()
    .refine(v=>(v.blocker_count===0)===(v.blocker_summary===null),"LIVE_BLOCKERS_COUNT_SUMMARY_INVALID"),
  z.object({availability:z.literal("ABSENT"),reason_code:z.enum(["BLOCKER_SUMMARY_NOT_PUBLIC","BLOCKER_FIELDS_INVALID"])}).strict(),
]);
export type LiveBlockers=z.infer<typeof liveBlockers>;
/** A stored Portal approval, not an executable Live authorization or TS verdict.
 * No Portfolio/R1/R2 association was captured by this exact parent family. */
const liveParentObject=z.object({
  schema_version:z.literal("portal.execution.live-parent.v2"),family:z.literal("LIVE_GATE"),
  workspace_id:z.string().refine(v=>[...v].length>=3&&[...v].length<=96),
  record_authority:z.literal("PORTAL"),provenance_basis:z.literal("CURRENT_CORE_BASELINE"),
  field_contract_revision:z.literal("portal.execution.parent-fields.v1"),observed_at_ms:ms,
  anchors:z.object({deployment_id:id,environment:z.literal("LIVE")}).strict(),
  source:z.object({authority:z.literal("PORTAL"),source_verdict:z.literal("NOT_ASSERTED"),
    source_side_effect_requested:z.literal(false),runtime_activation_requested:z.literal(false)}).strict(),
  approval:z.object({approval_id:id,gate:z.literal("LIVE_GATE"),
    status:z.enum(["PENDING","APPROVED","APPROVED_WITH_CONDITION","DENIED","CHANGES_REQUESTED","EXPIRED"]),
    approval_version:version,policy_version:text,quorum_required:version,quorum_met:ms,evidence_complete:z.boolean(),
    created_at_ms:ms,updated_at_ms:ms,sla_due_at_ms:ms,expires_at_ms:ms,decided_at_ms:ms.nullable(),
  }).strict().superRefine((v,c)=>{
    if(v.updated_at_ms<v.created_at_ms||v.sla_due_at_ms<v.created_at_ms||v.expires_at_ms<v.created_at_ms||
      v.decided_at_ms!==null&&v.decided_at_ms<v.created_at_ms)
      c.addIssue({code:z.ZodIssueCode.custom,message:"LIVE_PARENT_TIMESTAMP_INVALID"});
  }),
  accepted_manager_facts:z.object({availability:z.literal("NOT_PUBLISHED"),
    reason_code:z.literal("PARENT_ROOT_NOT_SOURCE_SCREEN_COMPOSITION")}).strict(),
  blockers:liveBlockers.optional(),
}).strict();
/** Unrefined object: `.shape` consumers (workflow recorded-portal) keep reading the approval member unchanged. */
export const liveParentReadShape=liveParentObject.shape;
export const liveParentRead=liveParentObject.superRefine((v,c)=>{
  if(v.blockers?.availability==="AVAILABLE"&&(v.blockers.approval_id!==v.approval.approval_id||
    v.blockers.approval_version!==v.approval.approval_version))
    c.addIssue({code:z.ZodIssueCode.custom,message:"LIVE_BLOCKERS_APPROVAL_MISMATCH"});
});
export type LiveParentRead=z.infer<typeof liveParentRead>;
