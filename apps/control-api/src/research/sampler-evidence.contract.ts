/** Explicit request configuration is not evidence of a sampler's internal proposal trace. */
import { z } from "zod";

const Scalar = z.union([z.string().max(191), z.number().finite(), z.boolean()]);
const Reason = z.string().regex(/^[A-Z][A-Z0-9_]{2,159}$/).nullable();
export const ResearchSamplerEvidenceSchema = z.object({
  schema_version: z.literal("research.sampler-evidence.v1"),
  requested_configuration: z.object({
    state: z.enum(["AVAILABLE", "NOT_PUBLISHED"]),
    scope: z.literal("RUN_REQUESTED_SPEC"),
    reason_code: Reason,
    source_ref: z.literal("IMMUTABLE_RUN_REQUESTED_OPTIMIZER_CONFIG_V1"),
    requested_spec_digest: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
    optimization_config: z.record(z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/), Scalar)
      .refine(value => Object.keys(value).length <= 64).nullable(),
    random_seed: z.number().int().nonnegative().nullable(),
  }).strict(),
  internal_trace: z.object({
    state: z.literal("NOT_PUBLISHED"),
    reason_code: z.literal("QUANTBT_WALK_FORWARD_DID_NOT_PUBLISH_SAMPLER_INTERNAL_TRACE"),
    source_ref: z.literal("QUANTBT_1_1_1_RETAINED_NATIVE_WFO_RESULT_V2"),
  }).strict(),
  observed_trials: z.object({
    state: z.literal("AVAILABLE"),
    scope: z.literal("RETAINED_SOURCE_TRIAL_ROWS_NOT_SAMPLER_INTERNAL_TRACE"),
    source_ref: z.literal("SEALED_RETAINED_TRIAL_LEDGER_V1"),
    source_trial_count: z.number().int().nonnegative().max(4096),
  }).strict(),
}).strict().superRefine((value, context) => {
  const config = value.requested_configuration;
  if (config.state === "AVAILABLE" && (!config.requested_spec_digest || config.optimization_config === null || config.reason_code !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "request configuration requires a verified immutable request" });
  }
  if (config.state === "NOT_PUBLISHED" && (!config.reason_code || config.optimization_config !== null || config.random_seed !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "missing request configuration must not fabricate configuration or seed" });
  }
});
export type ResearchSamplerEvidence = z.infer<typeof ResearchSamplerEvidenceSchema>;
