import { z } from "zod";

const IdentifierSchema = z.string().regex(/^[A-Za-z0-9._:-]{1,191}$/);
const RequestKeySchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/);
const HashSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const PositiveDecimalSchema = z.string()
  .regex(/^(?:[1-9][0-9]*(?:\.[0-9]+)?|0\.0*[1-9][0-9]*)$/)
  .refine((value) => value.replace(".", "").length <= 38, "DECIMAL_PRECISION_EXCEEDED")
  .refine((value) => (value.split(".")[1]?.length ?? 0) <= 18, "DECIMAL_SCALE_EXCEEDED");
const SafeReasonSchema = z.string().trim().min(8).max(2000).refine(
  (value) => !/(?:password|secret|token|api[ _-]?key|private[ _-]?key|authorization|cookie)\s*[:=]/i.test(value),
  "SENSITIVE_OPERATOR_TEXT_FORBIDDEN",
);

export const CanaryEnvelopeCreateRequestSchema = z.object({
  schema_version: z.literal("governance.canary-envelope-create-request.v1"),
  workspace_id: z.string().min(3).max(96),
  request_key: RequestKeySchema,
  deployment_id: IdentifierSchema,
  certification_id: IdentifierSchema,
  promotion_plan_id: IdentifierSchema,
  expected_certification_workflow_version: z.number().int().positive(),
  expected_evidence_set_hash: HashSchema,
  expected_latest_envelope_id: IdentifierSchema.nullable(),
  base_risk_profile_revision: IdentifierSchema,
  currency: z.string().regex(/^[A-Z0-9]{2,12}$/),
  limits: z.object({
    capital_cap: PositiveDecimalSchema,
    gross_notional_cap: PositiveDecimalSchema,
    daily_loss_cap: PositiveDecimalSchema,
    max_open_orders: z.number().int().min(1).max(1_000_000),
    duration_days: z.number().int().min(1).max(90),
  }).strict(),
  reason: SafeReasonSchema,
}).strict();

export type CanaryEnvelopeCreateRequest = z.infer<typeof CanaryEnvelopeCreateRequestSchema>;
