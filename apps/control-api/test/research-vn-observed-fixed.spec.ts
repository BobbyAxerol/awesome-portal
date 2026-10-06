/** Contract/producer regression only; real source qualification is a separate receipt. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config";
import { ResearchRunAdmissionService } from "../src/research/run-admission.service";
import { ResearchRunCreateService } from "../src/research/run-create.service";
import { ResearchMetadataRepository } from "../src/research/repository";
import type { ResearchRunProducerInput } from "../src/research/contracts";
import { ResearchPreflightPrivateResponseSchema, type ResearchRequestedSpec } from "../src/research/preflight.contract";
import { sha256ResearchJson, ResearchPreflightService } from "../src/research/preflight.service";
import { P04_DELTA_BINDING, P04_DELTA_ADAPTER_CONTRACT_DIGEST, P04_DELTA_FIXED_PARAMETERS, P04_DELTA_DECLARED_CONTRACT } from "../src/research/p04-delta.binding";
import { researchPortalAdmission } from "../src/research/portal-admission";
import { runDisplayLabel } from "../src/research/run-display-label";
import { declarationConditions } from "../src/research/declaration-conditions";
import { ResearchSearchService } from "../src/research/search.service";
import { ResearchFreezeService } from "../src/research/freeze.service";
import { ResearchCurrentSourceService } from "../src/research/current-source.service";
import { isFixedReplayProfile, fixedReplayCustodyProof, FixedReplayCompanionSealIngressSchema } from "../src/research/fixed-replay-companion.contract";
import { VN_OBSERVED_FIXED_PROFILE, VN_OBSERVED_FIXED_PROFILE_ID as ID, VN_OBSERVED_FIXED_PROFILE_DIGEST as DIGEST,
  vnObservedFixedProfileDigest, vnObservedSourceDateMs } from "../src/research/vn-observed-fixed.profile";
import { p04Requested, manifestFor, admissionRepository, flagConfig, w1Admin, w1Scope } from "./research-w1-wfo.fixture";
import { p14SplitSourceFixture } from "./research-split.fixture";
import { replayRow, replaySeal } from "./research-fixed-replay-companion.fixture";

// The isolated Control test cell mounts canonical contracts at /contracts;
// source checkout-relative paths are only the host fallback.
const contractsRoot = process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts");

const provenance = {
  clock_basis: "OBSERVED_SOURCE_LOCAL_DATE_V1", source_timezone: "Asia/Ho_Chi_Minh",
  metadata_index_revision: "a".repeat(64), metadata_index_source_manifest_digest: "d".repeat(64),
  metadata_index_as_of_utc_ms: Date.parse("2026-10-01T00:00:00Z"),
  warmup_semantics: "LAST_N_OBSERVED_PREDECESSORS_V1", warmup_start_utc_ms: Date.parse("2023-10-01T17:00:00Z"),
};
const policy = "SOURCE_LOCAL_DATE_OBSERVED_AT_AS_OF_V1";
const config = { ...flagConfig(true), FEATURE_RESEARCH_VN_OBSERVED_PROFILE: "true" };
function requested(overrides: Partial<ResearchRequestedSpec> = {}) {
  return p04Requested({ data: { dataset_id: "vn-stock-daily", symbol: "FPT", timeframe: "1d" },
    windows: { is: { start: "2025-01-01", end_exclusive: "2025-04-01" },
      oos: { start: "2025-04-01", end_exclusive: "2025-07-01" },
      holdout: { start: "2025-07-01", end_exclusive: "2025-10-01" } }, ...overrides });
}
function manifest(spec = requested()) {
  const original = manifestFor(spec), rangeEnd = Date.parse("2025-09-30T17:00:00Z");
  const dataBinding = { ...original.datasetBinding, dataset_id: "vn-stock-daily", symbol: "FPT", timeframe: "1d",
    timezone: "Asia/Ho_Chi_Minh", closed_bar_policy: policy, provenance,
    range_start_utc_ms: provenance.warmup_start_utc_ms, range_end_exclusive_utc_ms: rangeEnd };
  const effectiveSpec = { ...original.effectiveSpec, data_binding: { ...dataBinding, warmup_bars: 300 } };
  const snapshot = { ...original.snapshot, snapshot_id: original.snapshot.snapshot_id,
    snapshot_content_hash: original.snapshot.snapshot_content_hash,
    warmup: { requested_bars: 300, bars: 300, start_utc_ms: provenance.warmup_start_utc_ms } };
  return { ...original, datasetBinding: dataBinding, effectiveSpec, snapshot,
    datasetBindingDigest: sha256ResearchJson(dataBinding), effectiveSpecDigest: sha256ResearchJson(effectiveSpec),
    manifestDigest: sha256ResearchJson({ dataBinding, effectiveSpec, snapshot }) };
}
function admission(m = manifest(), enabled = true) {
  return new ResearchRunAdmissionService(admissionRepository(m) as never,
    { ...config, FEATURE_RESEARCH_VN_OBSERVED_PROFILE: enabled ? "true" : "false" } as never);
}
const qualification = { state: "AVAILABLE" as const, reason_code: null, profile_id: ID, profile_digest: DIGEST,
  dataset_id: "vn-stock-daily" as const, symbol: "FPT" as const, timeframe: "1d" as const,
  source_timezone: "Asia/Ho_Chi_Minh" as const, clock_basis: "OBSERVED_SOURCE_LOCAL_DATE_V1" as const,
  index_revision: provenance.metadata_index_revision };

describe("one pinned source-qualified VN observed-date profile", () => {
  it("keeps actual runtime admission equal to its canonical fixture and valid against the published schema", () => {
    const root = contractsRoot;
    const document = JSON.parse(readFileSync(resolve(root, "openapi/research-foundation.openapi.json"), "utf8"));
    const validate = new Ajv2020({ allErrors: true, strict: false }).compile(JSON.parse(JSON.stringify({
      ...document.components.schemas.PortalAdmission, $defs: document.components.schemas,
    }).replaceAll("#/components/schemas/", "#/$defs/")));
    const flags = { FEATURE_RESEARCH_RUN_PRODUCER: "true", FEATURE_RESEARCH_WFO_PROFILE: "true",
      FEATURE_RESEARCH_PREVIEW_LONG_WFO: "false" };
    const fixture = JSON.parse(readFileSync(resolve(root, "fixtures/research-foundation.portal-admission-causal-inner.valid.json"), "utf8"));
    expect(researchPortalAdmission(flags as never, { release_id: "er_quantbt_111", verified: true })).toEqual(fixture);
    for (const preview of ["true", "false"] as const) for (const verified of [true, false]) {
      const runtime = researchPortalAdmission({ ...flags, FEATURE_RESEARCH_PREVIEW_LONG_WFO: preview } as never,
        { release_id: "er_quantbt_111", verified });
      expect(validate(runtime), JSON.stringify(validate.errors)).toBe(true);
      expect(runtime.profiles[3].trial_count).toEqual({ min: 3, max: 3 });
    }
    const qualified = researchPortalAdmission({ ...flags, FEATURE_RESEARCH_VN_OBSERVED_PROFILE: "true" } as never,
      { release_id: "er_quantbt_111", verified: true, vn_observed_daily_qualification: qualification });
    expect(validate(qualified), JSON.stringify(validate.errors)).toBe(true);
    expect(qualified.profiles[4]).toMatchObject({ profile_id: ID, state: "ENABLED", reason: null });
    const full02 = researchPortalAdmission({ ...flags, FEATURE_RESEARCH_VN_OBSERVED_PROFILE: "true",
      FEATURE_RESEARCH_FULL02_PROFILE: "true" } as never,
      { release_id: "er_quantbt_111", verified: true, vn_observed_daily_qualification: qualification });
    expect(full02.profiles.slice(0, 5)).toEqual(qualified.profiles);
    expect(validate(full02), JSON.stringify(validate.errors)).toBe(true);
    expect(full02.profiles.slice(5).map(profile => profile.profile_id)).toEqual([
      "p10.delta-signal-notional-per-fold-decay.v1", "p10.delta-signal-notional-three-window-optimized.v1"]);
    expect(document.components.schemas.PortalAdmission.properties.profiles.items.properties.profile_id.enum)
      .toEqual(full02.profiles.map(profile => profile.profile_id));
  });
  it("pins immutable exact source and generic accounting without claiming a VN calendar", () => {
    expect(vnObservedFixedProfileDigest()).toBe(DIGEST);
    expect(sha256ResearchJson(VN_OBSERVED_FIXED_PROFILE)).toBe(DIGEST);
    expect(VN_OBSERVED_FIXED_PROFILE).toMatchObject({ symbol: "FPT", calendar_authority: "NOT_PUBLISHED",
      account_model: "GENERIC_SIGNAL_NOTIONAL_RESEARCH_NOT_VN_VENUE", warmup_bars: 300 });
    expect(runDisplayLabel(ID, 1)).toBe("R-VN-001");
  });
  it("binds naive, explicit +07 and UTC source instants equally, never UTC-midnight daily or sub-ms truncation", () => {
    const expected = Date.parse("2025-03-31T17:00:00Z");
    for (const date of ["2025-04-01", "2025-04-01T00:00:00+07:00", "2025-03-31T17:00:00Z"])
      expect(vnObservedSourceDateMs(date)).toBe(expected);
    for (const date of ["2025-04-01T00:00:00Z", "2025-02-30", "2025-04-01T00:00:00.000000001+07:00"])
      expect(vnObservedSourceDateMs(date)).toBeNull();
  });
  it("defaults dark and cannot be opted in without the existing fixed producer/retention lane", () => {
    const env = { NODE_ENV: "test", DATABASE_URL: "postgres://x:y@127.0.0.1:5432/z", PORTAL_ENV: "local", AUTH_MODE: "dev" };
    expect(loadConfig(env as never).FEATURE_RESEARCH_VN_OBSERVED_PROFILE).toBe("false");
    expect(() => loadConfig({ ...env, FEATURE_RESEARCH_VN_OBSERVED_PROFILE: "true" } as never)).toThrow("FEATURE_RESEARCH_VN_OBSERVED_PROFILE=true requires");
  });
  it("does not make a dataset AVAILABLE merely because a flag is on", () => {
    const flags = { ...config, FEATURE_RESEARCH_PREVIEW_LONG_WFO: "false" };
    const before = researchPortalAdmission(flags as never, { release_id: "er_quantbt_111", verified: true });
    expect(before.profiles[4]).toMatchObject({ profile_id: ID, state: "DISABLED", reason: "SOURCE_PROFILE_UNQUALIFIED" });
    const after = researchPortalAdmission(flags as never, { release_id: "er_quantbt_111", verified: true, vn_observed_daily_qualification: qualification });
    expect(after.profiles.slice(0, 4)).toEqual(before.profiles.slice(0, 4));
    expect(after.profiles[4]).toMatchObject({ state: "ENABLED", reason: null, calendar_authority: "NOT_PUBLISHED" });
  });
  it("S02 conditions choose the source-qualified fifth profile rather than the legacy 1h fixed descriptor", () => {
    const profiles = researchPortalAdmission({ ...config, FEATURE_RESEARCH_PREVIEW_LONG_WFO: "false" } as never,
      { release_id: "er_quantbt_111", verified: true, vn_observed_daily_qualification: qualification }).profiles;
    const metadata: any = { planned_folds: { availability: "AVAILABLE", reason_code: null, count: 1 },
      windows: ["IS", "OOS", "HOLDOUT"].map(window => ({ window, bars: 60, reason_code: null, warmup_bars_required: 300,
        warmup_bars_available_before_start: 300 })) };
    expect(declarationConditions(requested(), metadata, profiles, ["1d"]))
      .toMatchObject({ profile_id: ID, ready_for_preflight: true });
    expect(declarationConditions(requested({ schema_version: "research.requested-spec.v2" }), metadata, profiles, ["1d"]).ready_for_preflight).toBe(false);
    expect(declarationConditions(requested({ data: { dataset_id: "vn-stock-daily", symbol: "HPG", timeframe: "1d" } }), metadata, profiles, ["1d"]).profile_id).toBeNull();
  });
  it("admits the same immutable Delta AV only with exact observed provenance and 300 predecessors", async () => {
    const m = manifest();
    const result = await admission(m).require(w1Admin, w1Scope, m.preflightToken, requested());
    expect(result.profile).toEqual({ id: ID, digest: DIGEST });
    expect(result.alpha).toMatchObject({ alphaVersionId: P04_DELTA_BINDING.alphaVersionId,
      adapterContractDigest: P04_DELTA_ADAPTER_CONTRACT_DIGEST, fixedParameters: P04_DELTA_FIXED_PARAMETERS });
    await expect(admission(m, false).require(w1Admin, w1Scope, m.preflightToken, requested()))
      .rejects.toMatchObject({ status: 409, code: "RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE" });
  });
  for (const [label, mutate] of [
    ["symbol", (m: ReturnType<typeof manifest>) => { m.requestedSpec = requested({ data: { dataset_id: "vn-stock-daily", symbol: "HPG", timeframe: "1d" } }) as never; }],
    ["source clock", (m: ReturnType<typeof manifest>) => { m.datasetBinding.provenance = { ...provenance, clock_basis: "UTC" } as never; }],
    ["legacy closed-bar authority", (m: ReturnType<typeof manifest>) => { m.datasetBinding.closed_bar_policy = "CLOSED_BARS_ONLY"; }],
    ["index revision", (m: ReturnType<typeof manifest>) => { m.datasetBinding.provenance = { ...provenance, metadata_index_revision: "" }; }],
    ["warmup population", (m: ReturnType<typeof manifest>) => { m.snapshot.warmup.bars = 299; }],
    ["binding range", (m: ReturnType<typeof manifest>) => { m.datasetBinding.range_start_utc_ms += 1; }],
    ["wrong effective provenance", (m: ReturnType<typeof manifest>) => { m.effectiveSpec.data_binding.provenance = { ...provenance, metadata_index_revision: "b".repeat(64) }; }],
    ["optimizer trial", (m: ReturnType<typeof manifest>) => { m.requestedSpec = requested({ optuna_trials: 2 }) as never; }],
  ] as const) it(`refuses ${label} instead of falling back to crypto`, async () => {
    const m = manifest(); mutate(m);
    m.requestedSpecDigest = sha256ResearchJson(m.requestedSpec);
    await expect(admission(m).require(w1Admin, w1Scope, m.preflightToken, m.requestedSpec as unknown as ResearchRequestedSpec))
      .rejects.toMatchObject({ status: 409, code: "RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE" });
  });
  it("binds the observed index into the distinct worker work digest and existing durable intent", async () => {
    const m = manifest(), captures: any[] = [];
    const repo = { ...admissionRepository(m), createOrReplayRunProducerIntent: vi.fn(async (_scope: unknown, input: any) => {
      captures.push(input); return { producer: { ...input, dispatchState: "DISPATCHED" }, replayed: false }; }) };
    const service = new ResearchRunCreateService(repo as never, new ResearchRunAdmissionService(repo as never, config as never), {} as never, config as never);
    await service.create(w1Admin, w1Scope, { schema_version: "research.run-create.v1", client_intent_id: "vn-unit-intent",
      preflight_token: m.preflightToken, requested_spec: requested(), intent_kind: "NEW" }, "request-unit");
    const [input] = captures, sourceObservation = { ...provenance, dataset_id: "vn-stock-daily", symbol: "FPT", timeframe: "1d" };
    expect(input.workDigest).toBe(sha256ResearchJson({ schema_version: "research.p10.vn-observed-fixed-work.v1",
      requested_spec_digest: m.requestedSpecDigest, effective_spec_digest: m.effectiveSpecDigest,
      dataset_binding_digest: m.datasetBindingDigest, manifest_digest: m.manifestDigest,
      snapshot: { snapshot_id: m.snapshot.snapshot_id, snapshot_content_hash: m.snapshot.snapshot_content_hash },
      alpha: { alpha_id: P04_DELTA_BINDING.alphaId, alpha_version_id: P04_DELTA_BINDING.alphaVersionId,
        adapter_id: "p04.delta-rsi.v1", adapter_contract_digest: P04_DELTA_ADAPTER_CONTRACT_DIGEST, fixed_parameters: P04_DELTA_FIXED_PARAMETERS },
      execution_profile: { profile_id: ID, profile_digest: DIGEST }, source_observation: sourceObservation,
      engine_release_id: "er_quantbt_111", requested_spec: requested() }));
    expect(input).toMatchObject({ executionProfileId: ID, executionProfileDigest: DIGEST, resourceClass: "p10-vn-observed-fixed-v1" });
    expect(input.legacyRequest.research).toMatchObject({ execution_profile_id: ID, execution_profile_digest: DIGEST,
      source_observation: sourceObservation, p04_parameters: P04_DELTA_FIXED_PARAMETERS });
    // Invoke the real repository validator: a mocked repository hid the
    // runtime profile allowlist regression despite a valid P10 admission.
    const repository = new ResearchMetadataRepository({} as never) as unknown as {
      assertRunProducerInput: (producer: ResearchRunProducerInput) => void;
    };
    expect(() => repository.assertRunProducerInput(input)).not.toThrow();
    for (const changed of [
      { executionProfileDigest: null },
      { executionProfileDigest: "b".repeat(64) },
      { executionAdapterId: "p17.imported-signal-notional.v1" as const },
      { adapterContractDigest: "b".repeat(64) },
    ]) expect(() => repository.assertRunProducerInput({ ...input, ...changed }))
      .toThrow("Research execution profile is unsupported.");
    expect(() => repository.assertRunProducerInput({ ...input,
      executionProfileId: "p04.fixed-qualification.v1", executionProfileDigest: null })).not.toThrow();
  });
  it("keeps unknown calendar gaps null while enforcing the seven source provenance fields", () => {
    const publicResponse = JSON.parse(readFileSync(resolve(contractsRoot, "fixtures/research-preflight.response.valid.json"), "utf8"));
    const raw = Object.fromEntries(["requested_spec_digest", "effective_spec", "effective_spec_digest", "dataset_binding", "dataset_binding_digest",
      "snapshot", "topology", "resource_estimate", "capability"].map(key => [key, publicResponse[key]]));
    const p: any = { ...raw, schema_version: "research.preflight-snapshot.v1" };
    p.dataset_binding = { ...p.dataset_binding, dataset_id: "vn-stock-daily", symbol: "FPT", timeframe: "1d",
      timezone: "Asia/Ho_Chi_Minh", closed_bar_policy: policy, provenance };
    Object.assign(p.effective_spec.data_binding, { timezone: "Asia/Ho_Chi_Minh", closed_bar_policy: policy, provenance });
    Object.assign(p.snapshot, { timezone: "Asia/Ho_Chi_Minh", closed_bar_policy: policy, provenance,
      quality: { rows: p.snapshot.row_count, gaps: null, duplicates: 0, gap_ratio: null, passed: true,
        reason_codes: [], missing_bar_count: null, state: "OBSERVED_TAPE_INTEGRITY_ONLY" } });
    expect(ResearchPreflightPrivateResponseSchema.safeParse(p).success).toBe(true);
    expect(ResearchPreflightPrivateResponseSchema.safeParse({ ...p, snapshot: { ...p.snapshot,
      quality: { ...p.snapshot.quality, missing_bar_count: 0 } } }).success).toBe(false);
    expect(ResearchPreflightPrivateResponseSchema.safeParse({ ...p, dataset_binding: { ...p.dataset_binding, symbol: "HPG" } }).success).toBe(false);
  });
  it("complete P08 create/store/read path accepts only qualified observed VN while preserving legacy crypto", async () => {
    async function create({ vn = true, enabled = true, wrongRequestedSource = false, wrongCalendar = false } = {}) {
      const fixture: any = JSON.parse(readFileSync(resolve(contractsRoot, "fixtures/research-preflight.response.valid.json"), "utf8"));
      const spec = vn && !wrongRequestedSource ? requested() : p04Requested();
      const raw: any = Object.fromEntries(["requested_spec_digest", "effective_spec", "effective_spec_digest", "dataset_binding", "dataset_binding_digest",
        "snapshot", "topology", "resource_estimate", "capability"].map(key => [key, fixture[key]]));
      raw.schema_version = "research.preflight-snapshot.v1";
      raw.requested_spec_digest = sha256ResearchJson(spec);
      raw.effective_spec.requested_spec_digest = raw.requested_spec_digest;
      Object.assign(raw.effective_spec.optimization, { trial_count: spec.optuna_trials, random_seed: spec.random_seed,
        early_stopping: spec.early_stopping });
      if(vn) {
        Object.assign(raw.dataset_binding, { dataset_id: "vn-stock-daily", symbol: "FPT", timeframe: "1d",
          timezone: "Asia/Ho_Chi_Minh", calendar_policy: wrongCalendar ? "CRYPTO_24_7" : "SOURCE_DECLARED", closed_bar_policy: policy, provenance });
        Object.assign(raw.effective_spec.data_binding, { timezone: "Asia/Ho_Chi_Minh", calendar_policy: raw.dataset_binding.calendar_policy,
          closed_bar_policy: policy, provenance, warmup_bars: 300 });
        Object.assign(raw.snapshot, { timezone: "Asia/Ho_Chi_Minh", calendar_policy: raw.dataset_binding.calendar_policy,
          closed_bar_policy: policy, provenance, quality: { rows: raw.snapshot.row_count, gaps: null, duplicates: 0, gap_ratio: null,
            passed: true, reason_codes: [], missing_bar_count: null, state: "OBSERVED_TAPE_INTEGRITY_ONLY" } });
        Object.assign(raw.snapshot.warmup, { bars: 300, requested_bars: 300, start_utc_ms: provenance.warmup_start_utc_ms });
      }
      raw.effective_spec_digest = sha256ResearchJson(raw.effective_spec);
      raw.dataset_binding_digest = sha256ResearchJson(raw.dataset_binding);
      const parsed = ResearchPreflightPrivateResponseSchema.parse(raw);
      const repo = { cleanupExpiredPreflightManifests: vi.fn().mockResolvedValue(0),
        loadAlphaVersionDataContract: vi.fn().mockResolvedValue({ alphaId: P04_DELTA_BINDING.alphaId,
          alphaVersionId: P04_DELTA_BINDING.alphaVersionId, entrypoint: P04_DELTA_BINDING.entrypoint, declaredContract: P04_DELTA_DECLARED_CONTRACT }),
        storePreflightManifest: vi.fn(async (_scope, input) => ({ ...input, createdAt: new Date("2026-10-02T00:00:00Z") })) };
      const client = { create: vi.fn().mockResolvedValue(parsed) };
      const service = new ResearchPreflightService(repo as never, client as never, { ...config,
        FEATURE_RESEARCH_VN_OBSERVED_PROFILE: enabled ? "true" : "false", RESEARCH_PREFLIGHT_TTL_SECONDS: 300,
        RESEARCH_PREFLIGHT_MAXIMUM_ACTIVE_MANIFESTS_PER_ACTOR: 8 } as never);
      return { output: await service.create(w1Admin, w1Scope, spec, "vn-p08-unit"), repo, client };
    }
    const { output, repo } = await create();
    expect(repo.storePreflightManifest).toHaveBeenCalledOnce();
    expect(output).toMatchObject({ may_create_run: false, snapshot: { closed_bar_policy: policy,
      quality: { state: "OBSERVED_TAPE_INTEGRITY_ONLY", missing_bar_count: null } } });
    expect(output.gates?.find(row => row.gate === "snapshot_quality")?.message).not.toContain("0 gaps");
    expect((await create({ vn: false })).output.snapshot.closed_bar_policy).toBe("CLOSED_BARS_ONLY");
    for(const options of [{ enabled: false }, { wrongRequestedSource: true }, { wrongCalendar: true }])
      await expect(create(options)).rejects.toMatchObject({ code: "RESEARCH_PREFLIGHT_REJECTED", status: 502 });
  });
  it("accepts custody only when the fresh receipt also proves the exact VN profile pair", () => {
    expect(isFixedReplayProfile(ID, DIGEST)).toBe(true);
    expect(isFixedReplayProfile(ID, null)).toBe(false);
    const old = replaySeal([replayRow(0)]), hash = (v: string) => createHash("sha256").update(v).digest("hex");
    const receipt = { ...JSON.parse(old.run_receipt_json), execution_profile_id: ID, execution_profile_digest: DIGEST };
    const run_receipt_json = JSON.stringify(receipt), artifact = JSON.parse(old.artifact_manifest_json);
    Object.assign(artifact.documents[0], { sha256: hash(run_receipt_json), bytes: Buffer.byteLength(run_receipt_json) });
    const artifact_manifest_json = JSON.stringify(artifact), manifest_digest = hash(artifact_manifest_json);
    const m = { ...old.manifest, manifest_digest, execution_profile_id: ID, execution_profile_digest: DIGEST };
    const seal = { ...old, run_receipt_json, artifact_manifest_json, manifest_digest, manifest: m, companion_digest: sha256ResearchJson(m) };
    expect(FixedReplayCompanionSealIngressSchema.safeParse(seal).success).toBe(true);
    expect(() => fixedReplayCustodyProof(seal)).not.toThrow();
    expect(() => fixedReplayCustodyProof({ ...old, manifest: { ...old.manifest, execution_profile_id: ID, execution_profile_digest: DIGEST } })).toThrow();
  });
  it("uses the fixed evidence reads, but never waits for WFO retention on this profile", async () => {
    const original = p14SplitSourceFixture();
    const source = { ...original, protocol: { ...original.protocol,
      selection: { ...original.protocol.selection, parameter_bundle_digest: sha256ResearchJson(P04_DELTA_FIXED_PARAMETERS) } } };
    const row = { kind: "DURABLE", runId: "run_vn", adapterContractDigest: P04_DELTA_ADAPTER_CONTRACT_DIGEST,
      executionProfileId: ID, requestedSpecDigest: "1".repeat(64), effectiveSpecDigest: "2".repeat(64),
      datasetBindingDigest: "3".repeat(64), manifestDigest: "b".repeat(64), legacyRequest: null, progressSnapshot: null,
      jobState: "SUCCEEDED", revision: "p14r1_" + "f".repeat(64), projection: { schema_version: "research.split-projection.v1", source },
      readiness: "PARTIAL", sourceSplitDigest: sha256ResearchJson(source), receivedAt: new Date("2026-10-02T00:00:00Z"),
      datasetBinding: null, sourceAsOfUtcMs: 1_727_000_000_000, sourceAsOfBasis: "P14_PROJECTION_RECEIVED_AT", asOfUtcMs: 1_727_000_000_000 };
    const repo = { hub: vi.fn().mockResolvedValue(row) };
    const search = await new ResearchSearchService(repo as never, { FEATURE_RESEARCH_SEARCH: "true" } as never).detail(w1Scope, "run_vn", {});
    expect(search).toMatchObject({ availability: { state: "AVAILABLE" }, source_profile: {
      reason_code: "VN_OBSERVED_FIXED_PROFILE_DOES_NOT_CREATE_OPTIMIZER_STUDY" } });
    const freeze = await new ResearchFreezeService(repo as never, { FEATURE_RESEARCH_FREEZE: "true" } as never).detail(w1Scope, "run_vn", {});
    expect(freeze.freeze.integrity.state).toBe("PARTIAL");
    const currentRepo = { sealForRead: vi.fn().mockResolvedValue(null), runState: vi.fn().mockResolvedValue({ sourceKind: "RESEARCH_DURABLE",
      effectiveStatus: "COMPLETED", adapterContractDigest: P04_DELTA_ADAPTER_CONTRACT_DIGEST, executionProfileId: ID }) };
    const current = new ResearchCurrentSourceService(currentRepo as never, { FEATURE_RESEARCH_CURRENT_SOURCE: "true",
      QUERY_CURSOR_ACTIVE_KEY_ID: "query-k1", QUERY_CURSOR_KEYS_JSON: '{"query-k1":"current-source-test-key-is-at-least-32-bytes"}', QUERY_CURSOR_TTL_SECONDS: 900 } as never);
    expect(await current.split(w1Scope, "run_vn")).toMatchObject({ availability: { state: "NOT_APPLICABLE" },
      lane: { run_profile: "VN_OBSERVED_FIXED_QUALIFICATION" } });
  });
});
