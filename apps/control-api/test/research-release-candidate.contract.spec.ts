import { describe, expect, it } from "vitest";

import {
  ResearchReleaseCandidateComposeResponseSchema,
  ResearchReleaseCandidateDraftPatchSchema,
  ResearchReleaseCandidateSealSchema,
} from "../src/research/release-candidate.contract";

describe("P21 Release Candidate contract invariants", () => {
  it("requires an explicit declaration and source/draft CAS fences", () => {
    expect(ResearchReleaseCandidateDraftPatchSchema.safeParse({
      expected_revision: 0, expected_source_fingerprint: "a".repeat(64), known_limitations: null, proposed_use_restrictions: null,
    }).success).toBe(false);
    expect(ResearchReleaseCandidateSealSchema.safeParse({
      draft_id: `rcd_${"0".repeat(26)}`, expected_draft_revision: 0, expected_source_fingerprint: "a".repeat(64),
    }).success).toBe(false);
  });

  it("rejects a composer response that quietly changes the 17/12 contract, aliases fields, or lies about a local seal", () => {
    const fieldKeys = [
      "release_candidate_id", "alpha_id", "alpha_version_id", "alpha_code_digest", "alpha_entrypoint",
      "final_audit_run_id", "final_audit_attempt_id", "requested_spec_digest", "effective_spec_digest",
      "dataset_binding_digest", "manifest_digest", "source_transform_digest", "engine_release_id",
      "adapter_contract_digest", "parameter_bundle_digest", "evidence_revision", "report_revision",
    ];
    const packKeys = [
      "ALPHA_VERSION_PASSPORT", "ENGINE_CAPABILITY_BACKEND", "DATASET_UNIVERSE_SNAPSHOTS", "METHODOLOGY_CLAIM",
      "SELECTED_PARAMS_LINEAGE", "FINAL_AUDIT_REPLAY", "METRICS_SEMANTICS", "EXECUTION_ASSUMPTIONS",
      "ROBUSTNESS_PARAM_STABILITY_REGIME", "KNOWN_LIMITATIONS_WAIVERS", "REPRODUCIBILITY_PARITY_CHECKSUMS", "PROPOSED_USE_RESTRICTIONS",
    ];
    const base = {
      schema_version: "research.release-candidate-compose.v1", read_authority: "PORTAL_PERSISTED_RESEARCH", run_id: "run-p21", state: "DRAFT",
      display_label: null,
      availability: { state: "AVAILABLE", reason_code: null }, as_of_utc_ms: 1, source_fingerprint: "a".repeat(64),
      run: { id: "run-p21", attempt: "att-p21", binding: null },
      rail: Array.from({ length: 5 }, () => ({ key: "run", value: "run-p21", detail: null, tone: "ink" })),
      selected_params: {
        param_set_id: null, param_set_id_availability: { state: "NOT_PUBLISHED", reason_code: "P21_PARAM_SET_ID_NOT_PUBLISHED" },
        selected_trial_number: null, selected_trial_number_availability: { state: "NOT_PUBLISHED", reason_code: "P21_SELECTED_TRIAL_ORDINAL_NOT_PUBLISHED" },
      },
      taxonomy: Array.from({ length: 4 }, () => ({ what: "x", state: "UNSET", consequence: "x" })),
      published_comparison: {
        last_release_candidate_id: null,
        availability: { state: "NOT_PUBLISHED", reason_code: "P22_PUBLISHED_COMPARISON_NOT_COMMISSIONED" },
      },
      certification_axes: {
        methodology_claim: {
          value: null,
          availability: { state: "NOT_PUBLISHED", reason_code: "P21_METHODOLOGY_CERTIFICATION_NOT_PUBLISHED" },
        },
        engine_execution_contract: {
          value: null,
          availability: { state: "NOT_PUBLISHED", reason_code: "P21_ENGINE_EXECUTION_CERTIFICATION_NOT_PUBLISHED" },
        },
      },
      gate_verdict: { title: "x", body: "x" },
      draft: { draft_id: null, revision: 0, source_fingerprint: "a".repeat(64), known_limitations: null, proposed_use_restrictions: null, state: "VIRTUAL", updated_at_utc_ms: null },
      fields: fieldKeys.map((key) => ({ key, label: "x", value: "alpha", tone: "ink", availability: { state: "AVAILABLE", reason_code: null } })),
      yaml: fieldKeys.map((key) => ({ key, label: "x", value: "alpha", tone: "ink", availability: { state: "AVAILABLE", reason_code: null } })),
      pack: packKeys.map((key, index) => ({ key, n: index + 1, item: "x", status: "COMPLETE", digest: "a".repeat(64), source: { label: "x", href: null }, note: "x", availability: { state: "AVAILABLE", reason_code: null } })),
      pack_counts: { complete: 12, degraded: 0, input: 0, missing: 0 },
      local_seal: { state: "UNSEALED", release_candidate_id: null, pack_digest: null, sealed_at_utc_ms: null, delivery_state: null, approval_state: null, availability: { state: "NOT_PUBLISHED", reason_code: "P21_LOCAL_SEAL_NOT_CREATED" } },
      actions: { may_edit_draft: true, may_seal: false, seal_blocked_reason: "P21_REQUIRED_EVIDENCE_MISSING", publish: { enabled: false, blocked_reason: "P22_LOCAL_SEAL_REQUIRED" } },
      mirror: null, source_absences: {},
    };
    expect(ResearchReleaseCandidateComposeResponseSchema.safeParse(base).success).toBe(true);
    expect(ResearchReleaseCandidateComposeResponseSchema.safeParse({ ...base, selected_params: { ...base.selected_params, selected_trial_number: 0 } }).success).toBe(false);
    expect(ResearchReleaseCandidateComposeResponseSchema.safeParse({ ...base, fields: base.fields.slice(1) }).success).toBe(false);
    expect(ResearchReleaseCandidateComposeResponseSchema.safeParse({ ...base, pack_counts: { ...base.pack_counts, missing: 1 } }).success).toBe(false);
    expect(ResearchReleaseCandidateComposeResponseSchema.safeParse({ ...base, yaml: [...base.yaml.slice(0, 16), { ...base.yaml[16]!, value: "drift" }] }).success).toBe(false);
    expect(ResearchReleaseCandidateComposeResponseSchema.safeParse({ ...base, local_seal: { ...base.local_seal, release_candidate_id: `rc_${"0".repeat(26)}` } }).success).toBe(false);
  });
});
