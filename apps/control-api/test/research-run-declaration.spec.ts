import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readRunDeclaration } from "../src/research/run-declaration.read";
import { readSamplerEvidence } from "../src/research/sampler-evidence.read";
import { ResearchRunDeclarationSchema } from "../src/research/run-declaration.contract";
import { ResearchSamplerEvidenceSchema } from "../src/research/sampler-evidence.contract";
import { sha256ResearchJson } from "../src/research/preflight.service";
import { P04_DELTA_BINDING } from "../src/research/p04-delta.binding";
import { p04Requested, wfoRequested } from "./research-w1-wfo.fixture";

const sourceInputs = (requested = p04Requested()) => ({
  alphaId: P04_DELTA_BINDING.alphaId, alphaVersionId: P04_DELTA_BINDING.alphaVersionId,
  requestedSpec: requested, requestedSpecDigest: sha256ResearchJson(requested),
  declaredContract: P04_DELTA_BINDING.declaredContract, entrypoint: P04_DELTA_BINDING.entrypoint,
});

describe("P24 immutable run declaration projection", () => {
  it("publishes builtin v1 Delta's stored declaration, not runtime or current release defaults", () => {
    const inputs = sourceInputs(p04Requested({ parameter_space_overrides: [{ name: "window", kind: "pin", value: 32 }] }));
    const dto = readRunDeclaration(inputs);
    expect(dto).toMatchObject({ state: "AVAILABLE", reason_code: null, alpha_binding: inputs.requestedSpec.alpha_binding,
      requested_overrides: [{ name: "window", kind: "pin", value: 32 }],
      declaration: { entrypoint: P04_DELTA_BINDING.entrypoint, timeframes: ["1h", "4h", "1d"], warmup_bars: 300,
        parameter_space: { window: { kind: "int_range", low: 20, high: 60, step: 2 } } } });
    expect(dto.declaration_digest).toBe(sha256ResearchJson(dto.declaration));
    expect(dto.declaration).not.toHaveProperty("execution");
    expect(dto.declaration).not.toHaveProperty("provenance");
    expect(dto.source_ref).toBe("IMMUTABLE_RUN_REQUEST_AND_ALPHA_VERSION_DECLARATION_V1");
    expect(JSON.stringify(dto)).not.toMatch(/source_locator|research\.(?:run_producers|preflight_manifests|alpha_versions)/i);
    expect(ResearchRunDeclarationSchema.safeParse({ ...dto, source_ref: "research.alpha_versions" }).success).toBe(false);
    expect(ResearchRunDeclarationSchema.safeParse({ ...dto, source_locator: "/private/source" }).success).toBe(false);
  });

  it("uses the same immutable declaration for admitted v2 requests and keeps explicit sweep facts", () => {
    const spec = wfoRequested({ schema_version: "research.requested-spec.v2", parameter_space_overrides: [
      { name: "window", kind: "sweep", low: 22, high: 44 }],
    }, { train_window: "30D", label_horizon_bars: 0, purge_bars: 2, embargo_bars: 1,
      inner: { split_frequency: "weekly", window_mode: "expanding", train_window: "20D" } });
    const dto = readRunDeclaration(sourceInputs(spec));
    expect(dto.state).toBe("AVAILABLE");
    expect(dto.requested_overrides).toEqual(spec.parameter_space_overrides);
    expect(dto.requested_spec_digest).toBe(sha256ResearchJson(spec));
  });

  it("keeps imported historical declarations despite an unrelated active version changing", () => {
    const spec = p04Requested({ alpha_binding: { alpha_id: "imported", alpha_version_id: "av_imported_old" }, strategy_id: "imported" });
    const historical = { ...sourceInputs(spec), alphaId: "imported", alphaVersionId: "av_imported_old",
      declaredContract: { ...P04_DELTA_BINDING.declaredContract, parameter_space: { scale: { kind: "fixed", value: 1000 } } } };
    const before = readRunDeclaration(historical);
    const irrelevantCurrent = { alpha_version_id: "av_new", parameter_space: { scale: { kind: "fixed", value: 2000 } } };
    expect(irrelevantCurrent.alpha_version_id).not.toBe(historical.alphaVersionId);
    expect(readRunDeclaration(historical)).toEqual(before);
    expect(before.declaration?.parameter_space.scale).toEqual({ kind: "fixed", value: 1000 });
  });

  it("does not substitute a current declaration for missing, foreign or digest-mismatched historical input", () => {
    expect(readRunDeclaration({})).toMatchObject({ state: "NOT_PUBLISHED", declaration: null,
      reason_code: "P24_RUN_REQUESTED_SPEC_NOT_RETAINED_OR_INCOMPATIBLE" });
    expect(readRunDeclaration({ ...sourceInputs(), alphaVersionId: "av_other" })).toMatchObject({
      state: "NOT_PUBLISHED", reason_code: "P24_RUN_ALPHA_VERSION_BINDING_MISMATCH" });
    expect(readRunDeclaration({ ...sourceInputs(), requestedSpecDigest: "a".repeat(64) })).toMatchObject({
      state: "NOT_PUBLISHED", reason_code: "P24_RUN_REQUESTED_SPEC_DIGEST_MISMATCH" });
    expect(readRunDeclaration({ ...sourceInputs(), declaredContract: null })).toMatchObject({
      state: "NOT_PUBLISHED", reason_code: "P24_RUN_BOUND_ALPHA_VERSION_DECLARATION_NOT_RECORDED" });
    expect(readRunDeclaration({ ...sourceInputs(), entrypoint: "wrong:entry" })).toMatchObject({
      state: "NOT_PUBLISHED", reason_code: "P24_RUN_BOUND_ALPHA_VERSION_DECLARATION_INCOMPATIBLE" });
  });

  it("labels scratch runs NOT_APPLICABLE without inventing registry input", () => {
    const dto = readRunDeclaration(sourceInputs(p04Requested({ alpha_binding: null, not_publishable: true })));
    expect(dto).toMatchObject({ state: "NOT_APPLICABLE", declaration: null, requested_overrides: null,
      reason_code: "P24_SCRATCH_RUN_HAS_NO_ALPHA_VERSION_DECLARATION" });
  });

  it("keeps existing scoped exact-version joins and no active-pointer/source access", () => {
    for (const name of ["progress", "evidence", "split", "current-source"]) {
      const source = readFileSync(join(__dirname, `../src/research/${name}.repository.ts`), "utf8");
      expect(source).toContain("version.alpha_version_id = producer.alpha_version_id");
      expect(source).toContain("version.alpha_id = producer.alpha_id");
      expect(source).toContain("version.workspace_id = producer.workspace_id");
    }
    const retained = readFileSync(join(__dirname, "../src/research/current-source.repository.ts"), "utf8");
    expect(retained).toContain("producer.requested_spec_digest = seal.requested_spec_digest");
    expect(retained).toContain("producer.effective_spec_digest = seal.effective_spec_digest");
    expect(retained).toContain("producer.dataset_binding_digest = seal.dataset_binding_digest");
  });
});

describe("P24 sampler source scope", () => {
  it("publishes only explicit request config; empty config does not invent TPE defaults", () => {
    const spec = wfoRequested();
    const dto = readSamplerEvidence(spec, sha256ResearchJson(spec), 12);
    expect(dto.requested_configuration).toMatchObject({ state: "AVAILABLE", scope: "RUN_REQUESTED_SPEC", optimization_config: {}, random_seed: 42 });
    expect(dto.internal_trace).toMatchObject({ state: "NOT_PUBLISHED",
      reason_code: "QUANTBT_WALK_FORWARD_DID_NOT_PUBLISH_SAMPLER_INTERNAL_TRACE" });
    expect(dto.internal_trace.source_ref).toBe("QUANTBT_1_1_1_RETAINED_NATIVE_WFO_RESULT_V2");
    expect(JSON.stringify(dto)).not.toMatch(/source_locator|research\.(?:preflight_manifests|current_source_rows)|quantbt\./i);
    expect(dto.requested_configuration.source_ref).toBe("IMMUTABLE_RUN_REQUESTED_OPTIMIZER_CONFIG_V1");
    expect(dto.observed_trials.source_ref).toBe("SEALED_RETAINED_TRIAL_LEDGER_V1");
    expect(ResearchSamplerEvidenceSchema.safeParse({ ...dto, internal_trace: {
      ...dto.internal_trace, source_ref: "https://private-source.invalid/path" } }).success).toBe(false);
    expect(dto.observed_trials).toMatchObject({ scope: "RETAINED_SOURCE_TRIAL_ROWS_NOT_SAMPLER_INTERNAL_TRACE", source_trial_count: 12 });
    expect(JSON.stringify(dto)).not.toContain('"tpe"');
  });

  it("preserves explicit sampler-like request tokens without calling them actual execution proof", () => {
    const spec = wfoRequested({ optimization_config: { sampler_name: "random", n_startup_trials: 10 } });
    expect(readSamplerEvidence(spec, sha256ResearchJson(spec), 12).requested_configuration).toMatchObject({
      scope: "RUN_REQUESTED_SPEC", optimization_config: { sampler_name: "random", n_startup_trials: 10 } });
    expect(readSamplerEvidence(spec, "b".repeat(64), 12).requested_configuration).toMatchObject({
      state: "NOT_PUBLISHED", optimization_config: null, random_seed: null, reason_code: "P24_RUN_REQUESTED_SPEC_DIGEST_MISMATCH" });
    expect(readSamplerEvidence(null, "b".repeat(64), 12).requested_configuration.state).toBe("NOT_PUBLISHED");
  });
});
