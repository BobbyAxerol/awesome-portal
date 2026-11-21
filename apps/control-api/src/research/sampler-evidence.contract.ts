/** Explicit request configuration is not evidence of a sampler's internal proposal trace. */
import { z } from "zod";

const Scalar = z.union([z.string().max(191), z.number().finite(), z.boolean()]);
const Reason = z.string().regex(/^[A-Z][A-Z0-9_]{2,159}$/).nullable();
const Count = z.number().int().nonnegative().max(131072);
const Token = z.string().regex(/^[A-Za-z0-9_-]{1,96}$/);
const Decimal = z.string().max(96).regex(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/);
const Hook = z.enum(["before_trial", "infer_relative_search_space", "sample_relative", "sample_independent", "after_trial"]);

/** Exact new-child observations, not reconstructed from retained trial order. */
export const ResearchSamplerCaptureSchema = z.object({
  schema_version: z.literal("research.sampler-public-observer.v1"),
  state: z.enum(["AVAILABLE", "PARTIAL", "NOT_PUBLISHED"]),
  reason_code: Reason,
  scope: z.literal("OPTUNA_PUBLIC_SAMPLER_INVOCATIONS_NOT_TPE_DENSITY"),
  engine_version: z.literal("1.1.1"),
  optuna_version: z.string().regex(/^[0-9]+\.[0-9]+\.[0-9]+$/),
  capture_complete: z.boolean(),
  invocation_count: Count,
  recorded_trial_count: Count,
  omitted_trial_count: Count,
  study_count: Count,
  artifact_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  size_bytes: z.number().int().positive().max(262144),
  studies: z.array(z.object({
    observer_study_index: Count,
    source_study_id: Token.nullable(),
    sampler_class: Token,
    pruner_class: Token,
    directions: z.array(z.enum(["MAXIMIZE", "MINIMIZE"])).min(1).max(8),
    effective_configuration_state: z.literal("NOT_PUBLISHED"),
  }).strict()).max(16),
  sampled_trial_count: z.number().int().nonnegative().max(8),
  omitted_sample_trial_count: Count,
  sample_trials: z.array(z.object({
    observer_study_index: Count,
    source_study_id: Token.nullable(),
    trial_number: Count,
    started_at_utc_ms: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    completed_at_utc_ms: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),
    state: z.enum(["COMPLETE", "PRUNED", "FAIL", "RUNNING", "WAITING"]),
    invocation_kinds: z.array(Hook).max(5),
    invocation_count: Count,
    returned_parameters: z.record(Token, z.union([Decimal, z.boolean()])).refine(value => Object.keys(value).length <= 12),
    values: z.array(Decimal).max(8).nullable(),
  }).strict()).max(8),
}).strict().superRefine((value, context) => {
  const invalid = (message: string) => context.addIssue({ code: z.ZodIssueCode.custom, message });
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > 8192) invalid("sampler capture exceeds bounded summary");
  if (value.sampled_trial_count !== value.sample_trials.length || value.sampled_trial_count + value.omitted_sample_trial_count !== value.recorded_trial_count)
    invalid("sampler capture counts must disclose exact retained and omitted samples");
  if (value.studies.length !== value.study_count || new Set(value.studies.map(study => study.observer_study_index)).size !== value.study_count)
    invalid("sampler capture study identity must be complete and unique");
  if ((value.state === "AVAILABLE") !== (value.capture_complete && value.reason_code === null && value.omitted_trial_count === 0))
    invalid("sampler capture completeness must not promote missing observations");
  if (value.state !== "AVAILABLE" && !value.reason_code) invalid("partial sampler capture needs a reason");
  const identities = new Set<string>();
  for (const trial of value.sample_trials) {
    const study = value.studies.find(row => row.observer_study_index === trial.observer_study_index);
    const key = `${trial.observer_study_index}:${trial.trial_number}`;
    if (!study || study.source_study_id !== trial.source_study_id || identities.has(key)) invalid("sampler trial must bind its actual observed study uniquely");
    if (trial.completed_at_utc_ms !== null && trial.completed_at_utc_ms < trial.started_at_utc_ms) invalid("sampler clocks must be ordered");
    identities.add(key);
  }
});
export type ResearchSamplerCapture = z.infer<typeof ResearchSamplerCaptureSchema>;

const TraceBoundary = {
  scope: z.literal("OPTUNA_PUBLIC_SAMPLER_INVOCATIONS_NOT_TPE_DENSITY"),
  source_ref: z.literal("SEALED_CHILD_OPTUNA_PUBLIC_HOOK_CAPTURE_V1"),
};
export const ResearchSamplerExecutionTraceSchema = z.discriminatedUnion("state", [
  z.object({ ...TraceBoundary, state: z.literal("NOT_PUBLISHED"),
    reason_code: z.enum(["SAMPLER_PUBLIC_HOOK_TRACE_NOT_RECORDED", "SAMPLER_PUBLIC_HOOK_TRACE_INCOMPATIBLE"]), capture: z.null() }).strict(),
  z.object({ ...TraceBoundary, state: z.literal("AVAILABLE"), reason_code: z.null(), capture: ResearchSamplerCaptureSchema }).strict(),
  z.object({ ...TraceBoundary, state: z.literal("PARTIAL"), reason_code: z.string().regex(/^[A-Z][A-Z0-9_]{2,159}$/), capture: ResearchSamplerCaptureSchema }).strict(),
]);
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
    source_trial_count: z.number().int().nonnegative().max(6400),
  }).strict(),
  execution_trace: ResearchSamplerExecutionTraceSchema.optional(),
}).strict().superRefine((value, context) => {
  const config = value.requested_configuration;
  if (config.state === "AVAILABLE" && (!config.requested_spec_digest || config.optimization_config === null || config.reason_code !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "request configuration requires a verified immutable request" });
  }
  if (config.state === "NOT_PUBLISHED" && (!config.reason_code || config.optimization_config !== null || config.random_seed !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "missing request configuration must not fabricate configuration or seed" });
  }
  if (value.execution_trace?.capture && value.execution_trace.state !== value.execution_trace.capture.state) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "trace availability must match source capture" });
  }
});
export type ResearchSamplerEvidence = z.infer<typeof ResearchSamplerEvidenceSchema>;
