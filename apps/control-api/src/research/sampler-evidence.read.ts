import { ResearchRequestedSpecSchema } from "./preflight.contract";
import { sha256ResearchJson } from "./preflight.service";
import { ResearchSamplerCaptureSchema, ResearchSamplerEvidenceSchema, type ResearchSamplerEvidence } from "./sampler-evidence.contract";

export function readSamplerEvidence(requested: unknown, digest: string, trialCount: number, captured?: unknown): ResearchSamplerEvidence {
  const parsed = ResearchRequestedSpecSchema.safeParse(requested);
  const valid = parsed.success && sha256ResearchJson(requested) === digest;
  const trace = ResearchSamplerCaptureSchema.safeParse(captured);
  let executionTrace: NonNullable<ResearchSamplerEvidence["execution_trace"]> = {
    state: "NOT_PUBLISHED", scope: "OPTUNA_PUBLIC_SAMPLER_INVOCATIONS_NOT_TPE_DENSITY",
      source_ref: "SEALED_CHILD_OPTUNA_PUBLIC_HOOK_CAPTURE_V1", reason_code: captured === undefined || captured === null
        ? "SAMPLER_PUBLIC_HOOK_TRACE_NOT_RECORDED" : "SAMPLER_PUBLIC_HOOK_TRACE_INCOMPATIBLE", capture: null };
  if (trace.success && trace.data.state === "AVAILABLE") executionTrace = {
    state: "AVAILABLE", scope: trace.data.scope, source_ref: "SEALED_CHILD_OPTUNA_PUBLIC_HOOK_CAPTURE_V1", reason_code: null, capture: trace.data };
  if (trace.success && trace.data.state === "PARTIAL" && trace.data.reason_code) executionTrace = {
    state: "PARTIAL", scope: trace.data.scope, source_ref: "SEALED_CHILD_OPTUNA_PUBLIC_HOOK_CAPTURE_V1", reason_code: trace.data.reason_code, capture: trace.data };
  return ResearchSamplerEvidenceSchema.parse({
    schema_version: "research.sampler-evidence.v1",
    requested_configuration: {
      state: valid ? "AVAILABLE" : "NOT_PUBLISHED", scope: "RUN_REQUESTED_SPEC",
      reason_code: valid ? null : parsed.success ? "P24_RUN_REQUESTED_SPEC_DIGEST_MISMATCH" : "P08_REQUESTED_SPEC_NOT_RETAINED_OR_INCOMPATIBLE",
      source_ref: "IMMUTABLE_RUN_REQUESTED_OPTIMIZER_CONFIG_V1",
      requested_spec_digest: /^[0-9a-f]{64}$/.test(digest) ? digest : null,
      optimization_config: valid && parsed.success ? parsed.data.optimization_config : null,
      random_seed: valid && parsed.success ? parsed.data.random_seed : null,
    },
    internal_trace: { state: "NOT_PUBLISHED",
      reason_code: "QUANTBT_WALK_FORWARD_DID_NOT_PUBLISH_SAMPLER_INTERNAL_TRACE",
      source_ref: "QUANTBT_1_1_1_RETAINED_NATIVE_WFO_RESULT_V2",
    },
    observed_trials: { state: "AVAILABLE", scope: "RETAINED_SOURCE_TRIAL_ROWS_NOT_SAMPLER_INTERNAL_TRACE",
      source_ref: "SEALED_RETAINED_TRIAL_LEDGER_V1", source_trial_count: trialCount },
    execution_trace: executionTrace,
  });
}
