import { z } from "zod";

export const ACTIVATION_CAPABILITIES = [
  "PROJECTION", "QUERY", "SSE",
  "COMMAND_R1", "COMMAND_R2", "COMMAND_R3", "COMMAND_R4",
] as const;
export const DELIVERY_PROFILES = [
  "fixture", "shadow", "paper", "sandbox", "live_canary", "live_full",
] as const;

export type ActivationCapability = (typeof ACTIVATION_CAPABILITIES)[number];
export type DeliveryProfile = (typeof DELIVERY_PROFILES)[number];

const Identifier = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,511}$/);
const Revision = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/);
const Hash = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const Signature = z.string().regex(/^[A-Za-z0-9_-]{43,4096}$/);
const RequestKey = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/);
const SafeReason = z.string().trim().min(8).max(2000).refine(
  (value) => !/(?:password|secret|token|api[ _-]?key|private[ _-]?key|authorization|cookie)\s*[:=]/i.test(value),
  "SENSITIVE_OPERATOR_TEXT_FORBIDDEN",
);
const Timestamp = z.string().datetime({ offset: true });

export const ActivationEvidenceReferenceSchema = z.object({
  kind: z.enum(["CONTRACT", "IMAGE", "SCHEMA", "QUALIFICATION", "ROLLBACK"]),
  reference_id: Identifier,
  artifact_digest: Hash,
  schema_version: Revision,
  signer_fingerprint: Hash,
  detached_signature: Signature,
  compatibility_revision: Revision,
  expires_at: Timestamp,
}).strict();

export const ActivationCompatibilityRequirementSchema = z.object({
  kind: z.enum(["CONTRACT", "IMAGE", "SCHEMA", "CAPABILITY"]),
  component: Revision,
  exact_revision: Revision,
  expected_digest: Hash,
}).strict();

export const StagedActivationPlanRequestSchema = z.object({
  schema_version: z.literal("execution.staged-activation-plan-request.v1"),
  workspace_id: z.string().min(3).max(96),
  request_key: RequestKey,
  capability_key: z.enum(ACTIVATION_CAPABILITIES),
  action: z.enum(["PROMOTE", "ROLLBACK"]),
  target_profile: z.enum(DELIVERY_PROFILES),
  expected_capability_version: z.number().int().positive(),
  compatibility_requirements: z.array(ActivationCompatibilityRequirementSchema).max(16),
  evidence_refs: z.array(ActivationEvidenceReferenceSchema).max(16),
  reason: SafeReason,
}).strict().superRefine((value, context) => {
  const refs = value.evidence_refs.map((item) => item.reference_id);
  if (new Set(refs).size !== refs.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "DUPLICATE_EVIDENCE_REFERENCE" });
  }
  const requirements = value.compatibility_requirements.map((item) => `${item.kind}:${item.component}`);
  if (new Set(requirements).size !== requirements.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "DUPLICATE_COMPATIBILITY_REQUIREMENT" });
  }
});

export const StagedActivationApplyRequestSchema = z.object({
  schema_version: z.literal("execution.staged-activation-apply-request.v1"),
  workspace_id: z.string().min(3).max(96),
  request_key: RequestKey,
  expected_plan_version: z.number().int().positive(),
  expected_capability_version: z.number().int().positive(),
}).strict();

export const StagedActivationVerifyRequestSchema = z.object({
  schema_version: z.literal("execution.staged-activation-verify-request.v1"),
  workspace_id: z.string().min(3).max(96),
  request_key: RequestKey,
  expected_plan_version: z.number().int().positive(),
  expected_capability_version: z.number().int().positive(),
}).strict();

export type StagedActivationPlanRequest = z.infer<typeof StagedActivationPlanRequestSchema>;
export type StagedActivationApplyRequest = z.infer<typeof StagedActivationApplyRequestSchema>;
export type StagedActivationVerifyRequest = z.infer<typeof StagedActivationVerifyRequestSchema>;
