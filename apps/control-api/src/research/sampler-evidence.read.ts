import { ResearchRequestedSpecSchema } from "./preflight.contract";
import { sha256ResearchJson } from "./preflight.service";
import { ResearchSamplerEvidenceSchema, type ResearchSamplerEvidence } from "./sampler-evidence.contract";

export function readSamplerEvidence(requested: unknown, digest: string, trialCount: number): ResearchSamplerEvidence {
  const parsed = ResearchRequestedSpecSchema.safeParse(requested);
  const valid = parsed.success && sha256ResearchJson(requested) === digest;
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
  });
}
