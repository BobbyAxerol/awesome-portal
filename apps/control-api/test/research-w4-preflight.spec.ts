/**
 * W4 · CG-P02-02 / CG-P08-02 / -03 / -05 (Control API side).
 *
 * Requested-spec v2 is additive and versioned; every refusal names the gate
 * and the requested-spec field path; the gate list is a projection of the
 * immutable manifest; P10 admission refuses v2 because no installed executor
 * runs it. The W1/P04 golden suites stay green alongside this file.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ADMISSION_REASON_FIELD_PATHS, admissionFieldPath, preflightGates } from "../src/research/preflight-gates";
import {
  ResearchPreflightCreateRequestSchema,
  ResearchPreflightPrivateResponseSchema,
  ResearchRequestedSpecSchema,
  type ResearchRequestedSpec,
} from "../src/research/preflight.contract";
import { ResearchPreflightController } from "../src/research/preflight.controller";
import { ResearchPreflightError } from "../src/research/preflight.error";
import { sweptDimensionCount } from "../src/research/preflight.service";
import { ResearchRunAdmissionService } from "../src/research/run-admission.service";
import { admissionRepository, flagConfig, manifestFor, w1Admin, w1Scope, wfoRequested } from "./research-w1-wfo.fixture";

const v1Advanced = (): ResearchRequestedSpec => wfoRequested();
const v2 = (walkForward: Record<string, unknown>): Record<string, unknown> => {
  const base = v1Advanced();
  return { ...base, schema_version: "research.requested-spec.v2", walk_forward: { ...base.walk_forward, ...walkForward } };
};

describe("CG-P02-02 requested-spec v2 is additive and versioned", () => {
  it("keeps every v1 document valid and byte-identical", () => {
    const spec = v1Advanced();
    expect(ResearchRequestedSpecSchema.parse(spec)).toEqual(spec);
  });

  it("refuses a v2-only field on a v1 document at its exact path", () => {
    const base = v1Advanced();
    const parsed = ResearchRequestedSpecSchema.safeParse({ ...base, walk_forward: { ...base.walk_forward, purge_bars: 2 } });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((issue) => issue.path)).toContainEqual(["walk_forward", "purge_bars"]);
  });

  it("accepts v2 guards, rolling width and inner folds, and requires a width for rolling", () => {
    expect(ResearchRequestedSpecSchema.safeParse(v2({
      window_mode: "rolling", train_window: "30D", label_horizon_bars: 2, purge_bars: 3, embargo_bars: 4,
    })).success).toBe(true);
    expect(ResearchRequestedSpecSchema.safeParse(v2({
      inner: { split_frequency: "monthly", window_mode: "expanding", train_window: "180D", min_folds: 2 },
    })).success).toBe(true);
    const rolling = ResearchRequestedSpecSchema.safeParse(v2({ window_mode: "rolling" }));
    expect(rolling.error?.issues.map((issue) => issue.path)).toContainEqual(["walk_forward", "train_window"]);
    for (const bad of [{ train_window: "30 days" }, { purge_bars: -1 }, { embargo_bars: 10_001 }]) {
      expect(ResearchRequestedSpecSchema.safeParse(v2(bad)).success).toBe(false);
    }
  });
});

describe("CG-P08-03 field paths on a 400", () => {
  it("names every invalid requested-spec field, never a value", () => {
    const controller = new ResearchPreflightController({} as never, {} as never, {} as never, {} as never);
    const base = v1Advanced();
    const parsed = ResearchPreflightCreateRequestSchema.safeParse({
      requested_spec: { ...base, optuna_trials: 0, walk_forward: { ...base.walk_forward, embargo_bars: 1 } },
    });
    expect(parsed.success).toBe(false);
    let error: ResearchPreflightError | undefined;
    try {
      (controller as unknown as { invalid: (issues: unknown) => never }).invalid(parsed.error!.issues);
    } catch (thrown) {
      error = thrown as ResearchPreflightError;
    }
    expect(error?.status).toBe(400);
    expect(error?.details?.field_paths).toEqual(expect.arrayContaining([["optuna_trials"], ["walk_forward", "embargo_bars"]]));
    expect(JSON.stringify(error?.details)).not.toContain("1");
  });
});

describe("CG-P08-03 admission reason → field path", () => {
  it("maps every literal refusal sentence of the P10 predicate", () => {
    const source = readFileSync(join(__dirname, "..", "src", "research", "run-admission.service.ts"), "utf8");
    const sentences = [
      ...source.matchAll(/return "([^"]+\.)";/g),
      ...source.matchAll(/denied\(\s*"[A-Z_]+",\s*"([^"]+\.)"/g),
    ].map((match) => match[1]);
    expect(sentences.length).toBeGreaterThan(20);
    for (const sentence of sentences) expect(ADMISSION_REASON_FIELD_PATHS, sentence).toHaveProperty([sentence]);
    expect(admissionFieldPath("The Delta walk-forward profile runs exactly 3 Optuna trials.")).toEqual(["optuna_trials"]);
    expect(admissionFieldPath(null)).toEqual([]);
  });

  it("refuses a v2 request at P10 even with the WFO profile on, keeping the typed sentence", async () => {
    const spec = v2({ purge_bars: 2 }) as unknown as ResearchRequestedSpec;
    const manifest = manifestFor(spec);
    const service = new ResearchRunAdmissionService(admissionRepository(manifest) as never, flagConfig(true) as never);
    const facts = await service.admissionFacts(w1Admin, w1Scope, manifest.preflightToken);
    expect(facts).toMatchObject({ allowed: false, code: "RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE" });
    expect(admissionFieldPath(facts.message)).toEqual(["schema_version"]);
    // The unchanged v1 profile is still admitted.
    const v1Manifest = manifestFor(v1Advanced());
    const v1Service = new ResearchRunAdmissionService(admissionRepository(v1Manifest) as never, flagConfig(true) as never);
    expect((await v1Service.admissionFacts(w1Admin, w1Scope, v1Manifest.preflightToken)).allowed).toBe(true);
  });
});

describe("CG-P08-05 swept dimensions are counted from the declaration", () => {
  it("counts declared ranges and categoricals unless pinned; fixed never; scratch counts sweep overrides", () => {
    const space = { a: { kind: "int_range" }, b: { kind: "categorical" }, c: { kind: "fixed" }, d: { kind: "float_range" } };
    const spec = { ...v1Advanced(), parameter_space_overrides: [{ name: "d", kind: "pin", value: 1 }] } as ResearchRequestedSpec;
    expect(sweptDimensionCount(space, spec)).toBe(2);
    const scratch = { ...v1Advanced(), parameter_space_overrides: [
      { name: "x", kind: "sweep", low: 1, high: 2 }, { name: "y", kind: "pin", value: 1 },
    ] } as ResearchRequestedSpec;
    expect(sweptDimensionCount(null, scratch)).toBe(1);
  });
});

describe("CG-P08-03 gate list is a projection of the immutable manifest", () => {
  it("returns PASS rows with field paths, and NOT_RECORDED for gates a pre-W4 manifest never recorded", () => {
    // The pre-commit hook mounts only apps/control-api, so the canonical
    // fixture's equality is proven by the P08 PostgreSQL lane; this builds the
    // same documents inline.
    const fixture = inlinePreflightFixture();
    const source = ResearchPreflightPrivateResponseSchema.parse({
      schema_version: "research.preflight-snapshot.v1",
      requested_spec_digest: fixture.requested_spec_digest,
      effective_spec: fixture.effective_spec,
      effective_spec_digest: fixture.effective_spec_digest,
      dataset_binding: fixture.dataset_binding,
      dataset_binding_digest: fixture.dataset_binding_digest,
      snapshot: fixture.snapshot,
      topology: fixture.topology,
      resource_estimate: fixture.resource_estimate,
      capability: fixture.capability,
    });
    const spec = { ...v1Advanced(), protocol: "three_window_decay", walk_forward: undefined, alpha_binding: null } as unknown as ResearchRequestedSpec;
    const rows = preflightGates(source, spec);
    const byGate = Object.fromEntries(rows.map((row) => [row.gate, row]));
    expect(byGate.topology).toMatchObject({ state: "PASS", field_path: ["windows"] });
    expect(byGate.release_current.field_path).toEqual(["client", "engine_release_id"]);
    expect(byGate.sweep_ceiling).toMatchObject({ state: "PASS", field_path: ["parameter_space_overrides"], message: "0 swept dimensions ≤ ceiling 8." });
    expect(byGate.gap_scan).toMatchObject({ state: "PASS", message: "2 windows scanned · 0 critical · 0 watch." });

    const legacy = preflightGates({
      ...source,
      snapshot: { ...source.snapshot, gap_scan: undefined, holdout_seal: undefined },
      resource_estimate: { ...source.resource_estimate, ceilings: undefined },
    }, spec);
    const legacyByGate = Object.fromEntries(legacy.map((row) => [row.gate, row]));
    expect(legacyByGate.sweep_ceiling.state).toBe("NOT_RECORDED");
    expect(legacyByGate.gap_scan.state).toBe("NOT_RECORDED");
  });
});

/** The P08 canonical response documents (packages/contracts fixture), inlined. */
function inlinePreflightFixture(): Record<string, any> {
  return JSON.parse("{\"requested_spec_digest\":\"e64e1cd2fb8b00ebf92934ee5854452e1708d9fa26d9b7234f56faf4f461d506\",\"effective_spec\":{\"schema_version\":\"research.effective-spec.v1\",\"requested_spec_digest\":\"e64e1cd2fb8b00ebf92934ee5854452e1708d9fa26d9b7234f56faf4f461d506\",\"engine\":{\"engine_release_id\":\"er_quantbt_111\",\"engine_catalog_digest\":\"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\",\"execution_route\":\"signal_notional\",\"required_input_class\":\"candle\",\"route_axes\":{\"engine\":\"SUPPORTED\",\"integration\":\"ADAPTER_AVAILABLE\",\"evidence\":\"EVIDENCE_MAPPED\",\"admission\":\"P04_BASELINE_ONLY\"},\"preflight_admission\":\"PREFLIGHT_ONLY\",\"optimization_mode\":\"mode_1_decay\",\"optimization_schedule\":\"global\"},\"data_binding\":{\"snapshot_id\":\"dss_0123456789abcdef0123456789abcdef\",\"snapshot_content_hash\":\"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc\",\"market_content_hash\":\"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd\",\"source_manifest_digest\":\"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee\",\"timezone\":\"UTC\",\"calendar_policy\":\"CRYPTO_24_7\",\"closed_bar_policy\":\"CLOSED_BARS_ONLY\",\"columns\":[\"open\",\"high\",\"low\",\"close\",\"volume\"],\"warmup_bars\":0,\"range_start_utc_ms\":1767484800000,\"range_end_exclusive_utc_ms\":1768694400000},\"topology\":{\"protocol\":\"three_window_decay\",\"folds\":[{\"fold_id\":\"fold_000\",\"train\":{\"start_utc\":\"2026-01-04T00:00:00+00:00\",\"end_exclusive_utc\":\"2026-01-10T00:00:00+00:00\",\"start_utc_ms\":1767484800000,\"end_exclusive_utc_ms\":1768003200000,\"bars\":144},\"outer_oos\":{\"start_utc\":\"2026-01-10T00:00:00+00:00\",\"end_exclusive_utc\":\"2026-01-14T00:00:00+00:00\",\"start_utc_ms\":1768003200000,\"end_exclusive_utc_ms\":1768348800000,\"bars\":96},\"state\":\"BOUNDARY_FIXED_NOT_EVALUATED\"}],\"sealed_holdout\":{\"start_utc\":\"2026-01-14T00:00:00+00:00\",\"end_exclusive_utc\":\"2026-01-18T00:00:00+00:00\",\"start_utc_ms\":1768348800000,\"end_exclusive_utc_ms\":1768694400000,\"bars\":96,\"snapshot_read_state\":\"OPAQUE_SNAPSHOT_ONLY\",\"evaluation_state\":\"NOT_EVALUATED\",\"disclosure\":\"Snapshot integrity metadata only; no raw sealed-holdout values are returned.\"},\"topology_digest\":\"96d5f9ce5c2680164339ca00cdc16addb117e903dd34b4419ff768d8a9aebd13\"},\"optimization\":{\"mode\":\"mode_1_decay\",\"schedule\":\"global\",\"trial_count\":8,\"early_stopping\":null,\"random_seed\":42,\"scope\":\"per_study_per_fold_per_seed\"},\"intent\":{\"kind\":\"NEW\",\"reproduction_semantics\":\"P10 supplies archived effective inputs.\",\"upgrade_semantics\":\"P10 creates an explicit upgrade.\"}},\"effective_spec_digest\":\"13330cbe2836c37562ca53ce4048d15ad2a06817fb8906d49c3c567aba264299\",\"dataset_binding\":{\"schema_version\":\"research.dataset-binding.v1\",\"snapshot_id\":\"dss_0123456789abcdef0123456789abcdef\",\"snapshot_content_hash\":\"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc\",\"market_content_hash\":\"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd\",\"source_manifest_digest\":\"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee\",\"dataset_id\":\"crypto-binance-1m\",\"symbol\":\"BTCUSDT\",\"timeframe\":\"1h\",\"range_start_utc_ms\":1767484800000,\"range_end_exclusive_utc_ms\":1768694400000,\"timezone\":\"UTC\",\"calendar_policy\":\"CRYPTO_24_7\",\"closed_bar_policy\":\"CLOSED_BARS_ONLY\"},\"dataset_binding_digest\":\"bef5f6103d67199c69f0d40fefff3f42c921190c53f1ea25b7c7fc8455e335ce\",\"snapshot\":{\"snapshot_id\":\"dss_0123456789abcdef0123456789abcdef\",\"snapshot_content_hash\":\"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc\",\"market_content_hash\":\"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd\",\"source_manifest_digest\":\"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee\",\"row_count\":336,\"byte_count\":16384,\"query\":{\"start_utc\":\"2026-01-04T00:00:00+00:00\",\"end_exclusive_utc\":\"2026-01-10T00:00:00+00:00\",\"start_utc_ms\":1767484800000,\"end_exclusive_utc_ms\":1768003200000,\"bars\":144},\"logical_range\":{\"start_utc\":\"2026-01-04T00:00:00+00:00\",\"end_exclusive_utc\":\"2026-01-10T00:00:00+00:00\",\"start_utc_ms\":1767484800000,\"end_exclusive_utc_ms\":1768003200000,\"bars\":144},\"warmup\":{\"start_utc\":\"2026-01-04T00:00:00+00:00\",\"end_exclusive_utc\":\"2026-01-10T00:00:00+00:00\",\"start_utc_ms\":1767484800000,\"end_exclusive_utc_ms\":1768003200000,\"bars\":144,\"requested_bars\":0,\"state\":\"BOUNDARY_ONLY_NOT_FIT\"},\"timezone\":\"UTC\",\"calendar_policy\":\"CRYPTO_24_7\",\"closed_bar_policy\":\"CLOSED_BARS_ONLY\",\"columns\":[\"open\",\"high\",\"low\",\"close\",\"volume\"],\"quality\":{\"rows\":336,\"gaps\":0,\"duplicates\":0,\"gap_ratio\":0,\"passed\":true,\"reason_codes\":[],\"missing_bar_count\":0,\"state\":\"SNAPSHOT_INTEGRITY_ONLY\"},\"provenance\":{\"loader_contract\":\"hmd-loader-v1\"},\"gap_scan\":{\"state\":\"SCANNED\",\"reason\":null,\"max_gap_ratio\":0.05,\"classification\":\"WATCH when a window misses any bar; CRITICAL when its missing ratio exceeds the snapshot quality profile. The source publishes no per-run severity.\",\"windows\":[{\"window\":\"IS\",\"start_utc_ms\":1767484800000,\"end_exclusive_utc_ms\":1768003200000,\"state\":\"SCANNED\",\"bars\":144,\"expected_bars\":144,\"missing_bars\":0,\"gap_runs\":0,\"verdict\":\"PASS\",\"items\":[],\"items_omitted\":0,\"note\":null},{\"window\":\"OOS\",\"start_utc_ms\":1768003200000,\"end_exclusive_utc_ms\":1768348800000,\"state\":\"SCANNED\",\"bars\":96,\"expected_bars\":96,\"missing_bars\":0,\"gap_runs\":0,\"verdict\":\"PASS\",\"items\":[],\"items_omitted\":0,\"note\":null},{\"window\":\"holdout\",\"start_utc_ms\":1768348800000,\"end_exclusive_utc_ms\":1768694400000,\"state\":\"SEALED\",\"bars\":null,\"expected_bars\":null,\"missing_bars\":null,\"gap_runs\":null,\"verdict\":null,\"items\":[],\"items_omitted\":0,\"note\":\"sealed — integrity checked at snapshot time, content unread\"}]},\"holdout_seal\":{\"schema_version\":\"research.holdout-seal.v1\",\"seal_digest\":\"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff\",\"digest_basis\":\"sha256 of the half-open holdout range, its bar count, the snapshot content hash and the source manifest digest\",\"read_log\":{\"state\":\"NO_READER\",\"reads\":[],\"reason\":\"No Research route or worker reads sealed holdout values; P08 returns boundaries only.\"},\"unlock\":{\"state\":\"OWNER_SCOPE_REQUIRED\",\"reason\":\"DR-01: no holdout unlock authority, route or actor is published; nothing may unseal or evaluate it.\"},\"cap\":{\"state\":\"NOT_PUBLISHED\",\"reason\":\"QuantBT 1.1.1 publishes no per-mode certification cap (CG-P04-05), so no holdout cap is claimed.\"}}},\"topology\":{\"protocol\":\"three_window_decay\",\"folds\":[{\"fold_id\":\"fold_000\",\"train\":{\"start_utc\":\"2026-01-04T00:00:00+00:00\",\"end_exclusive_utc\":\"2026-01-10T00:00:00+00:00\",\"start_utc_ms\":1767484800000,\"end_exclusive_utc_ms\":1768003200000,\"bars\":144},\"outer_oos\":{\"start_utc\":\"2026-01-10T00:00:00+00:00\",\"end_exclusive_utc\":\"2026-01-14T00:00:00+00:00\",\"start_utc_ms\":1768003200000,\"end_exclusive_utc_ms\":1768348800000,\"bars\":96},\"state\":\"BOUNDARY_FIXED_NOT_EVALUATED\"}],\"sealed_holdout\":{\"start_utc\":\"2026-01-14T00:00:00+00:00\",\"end_exclusive_utc\":\"2026-01-18T00:00:00+00:00\",\"start_utc_ms\":1768348800000,\"end_exclusive_utc_ms\":1768694400000,\"bars\":96,\"snapshot_read_state\":\"OPAQUE_SNAPSHOT_ONLY\",\"evaluation_state\":\"NOT_EVALUATED\",\"disclosure\":\"Snapshot integrity metadata only; no raw sealed-holdout values are returned.\"},\"topology_digest\":\"96d5f9ce5c2680164339ca00cdc16addb117e903dd34b4419ff768d8a9aebd13\"},\"resource_estimate\":{\"schema_version\":\"research.resource-estimate.v1\",\"scope\":\"per_study_per_fold_per_seed; no product-wide trial claim is implied\",\"trial_count\":8,\"seed_count\":1,\"outer_fold_count\":1,\"evaluation_count\":8,\"raw_frame_bytes\":16384,\"snapshot_bytes\":16384,\"estimated_memory_bytes\":8388608,\"estimated_scratch_bytes\":32768,\"estimated_cpu_seconds\":1,\"admission_state\":\"PREFLIGHT_WITHIN_P10_DECLARATION_CEILING\",\"disclosure\":\"Estimate only. P10 must reserve worker resources.\",\"ceilings\":{\"trial_ceiling\":4000,\"sweep_dimension_ceiling\":8,\"swept_dimensions\":0,\"outer_fold_ceiling\":128,\"estimated_cpu_seconds_ceiling\":86400}},\"capability\":{\"engine_release_id\":\"er_quantbt_111\",\"engine_catalog_digest\":\"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\",\"execution_route\":\"signal_notional\",\"required_input_class\":\"candle\",\"route_axes\":{\"engine\":\"SUPPORTED\",\"integration\":\"ADAPTER_AVAILABLE\",\"evidence\":\"EVIDENCE_MAPPED\",\"admission\":\"P04_BASELINE_ONLY\"},\"preflight_admission\":\"PREFLIGHT_ONLY\",\"optimization_mode\":\"mode_1_decay\",\"optimization_schedule\":\"global\"}}");
}
