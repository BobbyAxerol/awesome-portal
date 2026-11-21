import { z } from "zod";
import { ACTIVATION_CAPABILITIES, DELIVERY_PROFILES } from "./contracts";
export const activationPerspectiveEnvironment=z.enum(["paper","sandbox","live"]);
const id=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,511}$/);
const revision=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/);
const hash=z.string().regex(/^sha256:[0-9a-f]{64}$/);
const count=z.number().int().positive().safe();
// Historical UTC-ms may be negative. Current authorization clocks remain >=0.
const time=z.number().int().min(-62135596800000).max(253402300799999).safe();
const key=z.enum(ACTIVATION_CAPABILITIES),profile=z.enum(DELIVERY_PROFILES);
export const currentActivationCapability=z.discriminatedUnion("record_state",[
  z.object({capability_key:key,record_state:z.literal("NOT_RECORDED")}).strict(),
  z.object({capability_key:key,record_state:z.literal("RECORDED"),effective_profile:z.literal("fixture"),
    desired_profile:profile,capability_version:count,source_enabled:z.literal(false),runtime_enabled:z.literal(false),
    kill_switch_engaged:z.literal(true),last_plan_id:id.nullable(),created_at_ms:time,updated_at_ms:time}).strict(),
]);
export const currentActivationPlan=z.object({plan_id:id,capability_key:key,action:z.enum(["PROMOTE","ROLLBACK"]),
  from_profile:profile,target_profile:profile,expected_capability_version:count,plan_version:count,
  stored_status:z.enum(["READY","BLOCKED","DENIED","APPLIED","VERIFIED"]),
  expiry_basis:z.literal("HISTORICAL_CAPTURE_NOT_CURRENT_READ_AUTHORITY"),expires_at_ms:time,
  applied_at_ms:time.nullable(),verified_at_ms:time.nullable(),resulting_capability_version:count.nullable(),
  created_at_ms:time,updated_at_ms:time,source_side_effect_requested:z.literal(false),
  runtime_activation_requested:z.literal(false),owner_artifact_imported:z.literal(false)}).strict().refine(value=>
    value.expires_at_ms>=value.created_at_ms&&value.updated_at_ms>=value.created_at_ms&&
    (value.applied_at_ms===null||value.applied_at_ms>=value.created_at_ms&&value.applied_at_ms<=value.updated_at_ms)&&
    (value.verified_at_ms===null||value.applied_at_ms!==null&&value.verified_at_ms>=value.applied_at_ms&&value.verified_at_ms<=value.updated_at_ms),
    "ACTIVATION_STORED_CHRONOLOGY");
export const currentActivationEvidenceItem=z.object({ordinal:z.number().int().min(0).max(15),
  kind:z.enum(["CONTRACT","IMAGE","SCHEMA","QUALIFICATION","ROLLBACK"]),reference_id:id,artifact_digest:hash,
  schema_version:revision,compatibility_revision:revision,expires_at_ms:time,
  structure_valid:z.literal(true),owner_accepted:z.literal(false),trusted_for_activation:z.literal(false)}).strict();
export const currentActivationRequirementItem=z.object({ordinal:z.number().int().min(0).max(15),
  kind:z.enum(["CONTRACT","IMAGE","SCHEMA","CAPABILITY"]),component:revision,exact_revision:revision,expected_digest:hash}).strict();
const absent=z.object({availability:z.literal("NOT_AUTHORIZED")}).strict();
const evidence=z.union([absent,z.object({availability:z.literal("AVAILABLE"),basis:z.literal("STORED_NOT_ACTIVATION_TRUST"),
  items:z.array(currentActivationEvidenceItem).max(16)}).strict()]);
const compatibility=z.union([absent,z.object({availability:z.literal("AVAILABLE"),basis:z.literal("STORED_REQUIREMENTS_NOT_COMPATIBILITY_VERDICT"),
  items:z.array(currentActivationRequirementItem).max(16)}).strict()]);
const base={record_authority:z.literal("PORTAL"),provenance_basis:z.literal("CURRENT_CORE_BASELINE"),
  field_contract_revision:z.literal("portal.execution.parent-fields.v1"),workspace_id:id,
  perspective:z.object({environment:activationPerspectiveEnvironment,root_id:id,basis:z.literal("CURRENT_PUBLISHED_TECHNICAL_ROOT"),
    captured_native_environment:z.null()}).strict(),observed_at_ms:z.number().int().nonnegative().safe(),snapshot_revision:hash};
export const currentActivationCapabilities=z.object({...base,schema_version:z.literal("portal.execution.activation-capabilities-read.v2"),
  capabilities:z.array(currentActivationCapability).length(7)}).strict().refine(value=>
    new Set(value.capabilities.map(item=>item.capability_key)).size===7,"CAPABILITY_KEY_COHORT");
export const currentActivationPlanRead=z.object({...base,schema_version:z.literal("portal.execution.activation-plan-read.v2"),
  plan:currentActivationPlan,capability:currentActivationCapability,evidence,compatibility}).strict().refine(value=>
    value.capability.record_state==="RECORDED"&&value.capability.capability_key===value.plan.capability_key,"PLAN_CAPABILITY_COHERENCE");
export type CurrentActivationCapabilities=z.infer<typeof currentActivationCapabilities>;
export type CurrentActivationPlanRead=z.infer<typeof currentActivationPlanRead>;
export type ActivationReadEnvironment=z.infer<typeof activationPerspectiveEnvironment>;
