import { z } from "zod";

const IdentifierSchema = z.string().regex(/^[A-Za-z0-9._:-]{1,191}$/);
const RequestKeySchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/);
const HashSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const SafeReasonSchema = z
  .string()
  .trim()
  .min(8)
  .max(2000)
  .refine(
    (value) => !/(?:password|secret|token|api[ _-]?key|private[ _-]?key|authorization|cookie)\s*[:=]/i.test(value),
    "SENSITIVE_OPERATOR_TEXT_FORBIDDEN",
  );

export const SandboxCertificationCreateRequestSchema = z.object({
  schema_version: z.literal("governance.sandbox-certification-create-request.v1"),
  workspace_id: z.string().min(3).max(96),
  request_key: RequestKeySchema,
  deployment_id: IdentifierSchema,
  promotion_grant_id: IdentifierSchema,
  account_binding: z.object({
    account_id: IdentifierSchema,
    external_account_ref: IdentifierSchema,
  }).strict(),
}).strict();

export const SandboxCertificationSubmitRequestSchema = z.object({
  schema_version: z.literal("governance.sandbox-certification-submit-request.v1"),
  workspace_id: z.string().min(3).max(96),
  request_key: RequestKeySchema,
  expected_workflow_version: z.number().int().positive(),
  expected_evidence_set_hash: HashSchema,
}).strict();

export const SandboxCertificationDecisionRequestSchema = z.object({
  schema_version: z.literal("governance.sandbox-certification-decision-request.v1"),
  workspace_id: z.string().min(3).max(96),
  request_key: RequestKeySchema,
  expected_workflow_version: z.number().int().positive(),
  expected_evidence_set_hash: HashSchema,
  decision: z.enum(["APPROVE", "DENY"]),
  reason: SafeReasonSchema,
}).strict();

export const SandboxPromotionPlanRequestSchema = z.object({
  schema_version: z.literal("governance.sandbox-promotion-plan-request.v1"),
  workspace_id: z.string().min(3).max(96),
  request_key: RequestKeySchema,
  expected_workflow_version: z.number().int().positive(),
  expected_evidence_set_hash: HashSchema,
  target_stage: z.literal("CANARY"),
  reason: SafeReasonSchema,
}).strict();

export type SandboxCertificationCreateRequest = z.infer<typeof SandboxCertificationCreateRequestSchema>;
export type SandboxCertificationSubmitRequest = z.infer<typeof SandboxCertificationSubmitRequestSchema>;
export type SandboxCertificationDecisionRequest = z.infer<typeof SandboxCertificationDecisionRequestSchema>;
export type SandboxPromotionPlanRequest = z.infer<typeof SandboxPromotionPlanRequestSchema>;

export const SANDBOX_CERTIFICATION_STEPS = [
  "CONNECT",
  "SYNC",
  "ORDER_TYPES",
  "RECONCILIATION",
  "TIMEBOXED_RUN",
  "CLEANUP",
  "EXIT_REVIEW",
] as const;

export type SandboxCertificationStep = (typeof SANDBOX_CERTIFICATION_STEPS)[number];
