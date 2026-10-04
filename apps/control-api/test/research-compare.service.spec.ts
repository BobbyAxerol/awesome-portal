import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";

import { ResearchCompareResponseSchema } from "../src/research/compare.contract";
import { ResearchCompareService } from "../src/research/compare.service";
import type { CompareRunRow } from "../src/research/compare.repository";
import { p14SplitSourceFixture } from "./research-split.fixture";
import { SEALED_PERFORMANCE_DEFINITIONS } from "../src/research/source-aware-metric-resolver";
import { sha256ResearchJson } from "../src/research/preflight.service";
import { DELTA_CAUSAL_INNER_PROFILE } from "../src/research/delta-causal-inner.profile";

const scope = { workspaceId: "ws-p20", actorUserId: "usr-p20" };
const digest = (character: string) => character.repeat(64);

function requested(runId: string, overrides: Record<string, unknown> = {}) {
  return {
    schema_version: "research.requested-spec.v1",
    alpha_binding: { alpha_id: "alpha-p20", alpha_version_id: "av-p20" },
    not_publishable: false,
    strategy_id: "delta-rsi",
    execution_route: "signal_notional",
    route_params: {},
    data: { dataset_id: "hmd", symbol: "BTCUSDT", timeframe: "1h" },
    protocol: "three_window_decay",
    windows: {
      is: { start: "2024-01-01", end_exclusive: "2024-02-01" },
      oos: { start: "2024-02-01", end_exclusive: "2024-03-01" },
      holdout: { start: "2024-03-01", end_exclusive: "2024-04-01" },
    },
    optimization_mode: "grid",
    optimization_schedule: "global",
    parameter_space_overrides: [{ name: "rsi_low", kind: "sweep", low: 20, high: 35 }],
    optuna_trials: 3,
    early_stopping: null,
    random_seed: runId === "run-p20-left" ? 7 : 11,
    optimization_config: {},
    client: { engine_release_id: "quantbt-1.1.1", config_digest: digest("c") },
    ...overrides,
  };
}

function split() {
  const value = p14SplitSourceFixture({ manifestDigest: digest("b") });
  return {
    ...value,
    windows: {
      ...value.windows,
      outer_oos: { ...value.windows.outer_oos, bars: 3 },
    },
  };
}

function row(runId: string, overrides: Partial<CompareRunRow> = {}): CompareRunRow {
  return {
    attempt_id: `att-${runId}`,
    alpha_version_id: "av-p20",
    alpha_version_label: "av_1_0_0",
    attempt_state: "READY",
    intent_kind: "NEW",
    attempt_created_at: new Date("2026-09-22T00:00:00.000Z"),
    run_id: runId,
    run_state: "READY",
    run_created_at: new Date(runId.endsWith("left") ? "2026-09-22T00:00:00.000Z" : "2026-09-22T00:01:00.000Z"),
    display_profile_id: null,
    display_ordinal: null,
    requested_spec_digest: digest("d"),
    effective_spec_digest: digest("e"),
    dataset_binding_digest: digest("f"),
    manifest_digest: digest("b"),
    requested_spec: requested(runId),
    progress_snapshot: { claim: { state: "ISSUED", text: `claim for ${runId}` } },
    evidence_revision: `p13r1_${digest("1")}`,
    evidence_projection: {
      schema_version: "research.evidence-projection.v1",
      direct: { initial_equity: "100", final_equity: runId.endsWith("left") ? "110" : "120", num_trades: "2", bars: "3" },
      derived: { net_return_fraction: runId.endsWith("left") ? "0.1" : "0.2", max_drawdown_fraction: "-0.02" },
    },
    split_revision: `p14r1_${digest("2")}`,
    split_projection: { schema_version: "research.split-projection.v1", source: split() },
    current_artifact_revision: 1,
    current_manifest_digest: digest("b"),
    current_artifact_sealed: true,
    current_requested_spec_digest: digest("d"),
    current_effective_spec_digest: digest("e"),
    current_dataset_binding_digest: digest("f"),
    current_retained_import_digest: digest("9"),
    current_source_transform_digest: digest("a"),
    evidence_equity_sampling: "FULL",
    evidence_equity_source_observation_count: 3,
    evidence_equity_values: [
      { at_utc_ms: 1_704_672_000_000, equity: "100", drawdown_fraction: "0" },
      { at_utc_ms: 1_704_675_600_000, equity: "98", drawdown_fraction: "-0.02" },
      { at_utc_ms: 1_704_679_200_000, equity: runId.endsWith("left") ? "110" : "120", drawdown_fraction: "0" },
    ] as unknown as Record<string, unknown>,
    ...overrides,
  };
}

function snapshot(rows: CompareRunRow[] = [row("run-p20-left"), row("run-p20-right")]) {
  return {
    alpha: { alpha_id: "alpha-p20", name: "P20 Alpha" },
    runs: rows,
    totalAttempts: rows.length,
    hasMore: false,
    asOfUtcMs: 1_790_000_000_000,
  };
}

function raw(overrides: Record<string, unknown> = {}) {
  return {
    leftSourceCount: 3, rightSourceCount: 3,
    leftDistinctTimestampCount: 3, rightDistinctTimestampCount: 3,
    leftValidReturnCount: 3, rightValidReturnCount: 3,
    leftValidEquityCount: 3, rightValidEquityCount: 3,
    matchedCount: 3, startUtcMs: 1_704_672_000_000, endUtcMs: 1_704_679_200_000,
    correlation: "0.5",
    leftCommonReturnFraction: "0.1", rightCommonReturnFraction: "0.2",
    leftCommonMaxDrawdownFraction: "-0.02", rightCommonMaxDrawdownFraction: "-0.01",
    commonDailyReturnCount: 3, leftCommonDailySharpe: "1.25", rightCommonDailySharpe: "2.5",
    ...overrides,
  };
}

function subject(value = snapshot()) {
  const repository = {
    snapshot: vi.fn().mockResolvedValue(value),
    cached: vi.fn().mockResolvedValue(null),
    pairEnriched: vi.fn().mockResolvedValue(new Map()),
    persistCache: vi.fn().mockResolvedValue(undefined),
    retainedEquity: vi.fn().mockResolvedValue([]),
    pairRaw: vi.fn().mockResolvedValue(raw()),
    pairOverlay: vi.fn().mockResolvedValue([
      { atUtcMs: 1_704_672_000_000, leftEquity: "100", rightEquity: "100" },
      { atUtcMs: 1_704_679_200_000, leftEquity: "110", rightEquity: "120" },
    ]),
  };
  const config = {
    FEATURE_RESEARCH_COMPARE: "true",
    FEATURE_RESEARCH_RUN_LIBRARY: "true",
    FEATURE_RESEARCH_EVIDENCE: "true",
    FEATURE_RESEARCH_SPLIT: "true",
  };
  return { service: new ResearchCompareService(repository as never, config as never), repository };
}

describe("P20 bounded Compare persisted truth", () => {
  it("causal outer means use complete sealed fold aggregates, never the deployment singleton's inner metrics", async () => {
    // Synthetic causal unit based on an unchanged historical retained fixture.
    const fixture = JSON.parse(gunzipSync(readFileSync(resolve(__dirname, "research-w5b-real-replay.fixture.json.gz"))).toString("utf8"));
    const summary = structuredClone(fixture.summary);
    summary.source_facts.claims.validation_claim = "strict_nested_fold_local_retraining";
    const folds = fixture.rows.FOLD.map((entry: { sourceOrdinal: number; payload: Record<string, any> }) => ({
      source_ordinal: entry.sourceOrdinal, fold_id: entry.payload.fold_id,
      test_start_utc_ms: entry.payload.test_start_utc_ms, test_end_utc_ms: entry.payload.test_end_utc_ms,
      test_bars: entry.payload.fold_facts.test_bars,
      oos_sharpe: entry.payload.fold_facts.oos_score.oos_sharpe,
      oos_trade_count: entry.payload.fold_facts.oos_score.oos_trade_count,
    }));
    const retained = (overrides: Partial<CompareRunRow> = {}) => row("run-p20-left", {
      current_profile_id: DELTA_CAUSAL_INNER_PROFILE.current_source.profile_id,
      current_source_summary: summary, current_source_folds: folds, current_source_table_rows: fixture.table_rows,
      current_selected_mean_oos_sharpe: "99", current_selected_mean_decay: "98",
      current_outer_mean_oos_sharpe: "1.25", current_outer_mean_decay: "0.5", ...overrides,
    });
    for (const [overrides, expected] of [
      [{}, "1.25"], [{ current_outer_mean_oos_sharpe: null, current_outer_mean_decay: null }, null],
      [{ current_artifact_sealed: false }, null], [{ current_source_folds: folds.slice(0, 1) }, null],
    ] as Array<[Partial<CompareRunRow>, string | null]>) {
      const response = await subject(snapshot([retained(overrides)])).service.detail(scope, "alpha-p20", { mode: "attempts", run_ids: [] });
      if (response.result.mode !== "attempts") throw new Error("test guard");
      expect(response.result.attempts[0]!.original_metrics.find(metric => metric.key === "OOS_SHARPE")).toMatchObject({
        value: expected, scope: "RS02_OOS_MEAN_OF_FOLDS", availability: { state: expected === null ? "NOT_PUBLISHED" : "AVAILABLE" },
      });
      expect(response.result.attempts[0]!.original_metrics.find(metric => metric.key === "DECAY")).toMatchObject({
        value: expected === null ? null : "0.5",
        definition_id: "research.compare.metric.v1.outer-fold-mean-inner-is-mean-minus-outer-oos",
      });
      if (Object.keys(overrides).length === 0) expect(response.result.attempts[0]!.claim.family).toBe("STRICT_OUTER_OOS");
    }
  });
  it.each(["attempts", "pair", "markets"] as const)("historical companion-only scalars retain provenance in %s mode", async (mode) => {
    const root = process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts");
    const block = JSON.parse(readFileSync(resolve(root, "fixtures/research-enriched-analysis.healthy.valid.json"), "utf8"));
    // A typed fixed-lane unit companion; no runtime source or canonical fixture is rewritten.
    block.lane = "FIXED";
    const historical = row(block.run_id, { enriched_analysis: block, enriched_digest: sha256ResearchJson(block) });
    const rightId = "rrun_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const right = row(rightId, mode === "markets" ? { requested_spec: requested(rightId, {
      data: { dataset_id: "hmd", symbol: "ETHUSDT", timeframe: "1h" },
    }) } : {});
    const { service, repository } = subject(snapshot([historical, right]));
    const response = await service.detail(scope, "alpha-p20", { mode, run_ids: mode === "pair" ? [historical.run_id!, right.run_id!] : [] });
    const found = response.result.mode === "attempts" ? response.result.attempts.find((run) => run.run_id === block.run_id)
      : response.result.mode === "markets" ? response.result.cards.find((card) => card.run.run_id === block.run_id)?.run
      : response.result.pair?.runs.find((run) => run.run_id === block.run_id);
    expect(found?.original_metrics.find((metric) => metric.key === "OOS_SHARPE")).toMatchObject({
      value: block.facts.metrics.sharpe.value, origin: block.facts.metrics.sharpe.origin,
      source: "ENRICHED_ANALYSIS", source_locator: block.facts.metrics.sharpe.source_locator,
      input_digest: block.input_digest, scope: "OOS", definition_id: SEALED_PERFORMANCE_DEFINITIONS.portalSharpe,
      availability: { state: "AVAILABLE", reason_code: null },
    });
    expect(found?.original_metrics.find((metric) => metric.key === "DECAY")).toMatchObject({
      value: null, source: "ENRICHED_ANALYSIS", origin: "PORTAL_DERIVED", availability: {
        state: "NOT_APPLICABLE", reason_code: block.facts.metrics.sharpe_decay.reason_code,
      },
    });
    expect(repository.pairEnriched).toHaveBeenCalledTimes(mode === "pair" ? 1 : 0);
    expect(repository.snapshot).toHaveBeenCalledTimes(1);
  });

  it("historical companion verification rejects tampering/run mismatch before cache use", async () => {
    const root = process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts");
    for (const mismatch of ["digest", "run"] as const) {
      const block = JSON.parse(readFileSync(resolve(root, "fixtures/research-enriched-analysis.healthy.valid.json"), "utf8"));
      const { service, repository } = subject(snapshot([row(mismatch === "run" ? "rrun_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" : block.run_id, {
        enriched_analysis: block, enriched_digest: mismatch === "digest" ? "0".repeat(64) : sha256ResearchJson(block),
      })]));
      await expect(service.detail(scope, "alpha-p20", { mode: "attempts", run_ids: [] }))
        .rejects.toMatchObject({ code: "RESEARCH_COMPARE_UNAVAILABLE", status: 503 });
      expect(repository.cached).not.toHaveBeenCalled();
    }
  });

  it("an amended companion moves scalar cache binding without changing the immutable engine receipt", async () => {
    const root = process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts");
    const original = JSON.parse(readFileSync(resolve(root, "fixtures/research-enriched-analysis.healthy.valid.json"), "utf8"));
    const amendment = structuredClone(original);
    amendment.facts.metrics.sharpe.value = "3.650968955554157";
    amendment.library_summary.sharpe.value = amendment.facts.metrics.sharpe.value;
    const { service, repository } = subject(snapshot([row(original.run_id, { enriched_analysis: original, enriched_digest: sha256ResearchJson(original) })]));
    await service.detail(scope, "alpha-p20", { mode: "attempts", run_ids: [] });
    repository.snapshot.mockResolvedValueOnce(snapshot([row(amendment.run_id, { enriched_analysis: amendment, enriched_digest: sha256ResearchJson(amendment) })]));
    await service.detail(scope, "alpha-p20", { mode: "attempts", run_ids: [] });
    const cachedCalls = repository.cached.mock.calls as unknown[][];
    expect(cachedCalls[0]![4]).not.toBe(cachedCalls[1]![4]);
  });

  it("REQ-B: P04 sealed v2 supplies exact absent headline facts, preserving original engine priority", async () => {
    const root = process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts");
    const block = JSON.parse(readFileSync(resolve(root, "fixtures/research-retained-analytics-v2.fixed.valid.json"), "utf8"));
    const before = JSON.stringify(block);
    const embedded = (runId: string, engine = false) => {
      const source = row(runId);
      return row(runId, { evidence_projection: {
        ...source.evidence_projection as Record<string, unknown>, summary_analytics_v2: block,
        oos_analytics: engine
          ? { state: "AVAILABLE", metrics: { sharpe: { state: "AVAILABLE", reason_code: null, value: "0.744", locator: "full_report.sharpe" } } }
          : { state: "NOT_PUBLISHED", reason_code: "P13_ENGINE_RESULT_NOT_AVAILABLE_TO_ANALYTICS", metrics: {} },
      } });
    };
    const { service } = subject(snapshot([embedded("run-p20-left"), embedded("run-p20-right", true)]));
    const response = await service.detail(scope, "alpha-p20", { mode: "attempts", run_ids: [] });
    if (response.result.mode !== "attempts") throw new Error("test guard");
    const left = response.result.attempts.find((run) => run.run_id === "run-p20-left")!;
    const right = response.result.attempts.find((run) => run.run_id === "run-p20-right")!;
    for (const [key, field, definition] of [
      ["OOS_SHARPE", "sharpe", SEALED_PERFORMANCE_DEFINITIONS.engineSharpe],
      ["DECAY", "sharpe_decay", SEALED_PERFORMANCE_DEFINITIONS.portalDecay],
    ] as const) {
      const fact = block.metrics[field];
      expect(left.original_metrics.find((metric) => metric.key === key)).toMatchObject({
        value: fact.value, scope: "OOS", definition_id: definition, source: "SUMMARY_ANALYTICS_V2",
        origin: fact.origin, source_locator: fact.source_locator, input_digest: fact.input_digest,
        availability: { state: "AVAILABLE", reason_code: null },
      });
    }
    expect(right.original_metrics.find((metric) => metric.key === "OOS_SHARPE")).toMatchObject({
      value: "0.744", definition_id: "research.compare.metric.v1.oos-sharpe",
    });
    expect(right.original_metrics.find((metric) => metric.key === "OOS_SHARPE")!.origin).toBeUndefined();
    expect(JSON.stringify(block)).toBe(before);
  });

  it("REQ-B: invalid v2 digest consistency leaves source gaps unavailable; no sampled reconstruction", async () => {
    const root = process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts");
    const block = JSON.parse(readFileSync(resolve(root, "fixtures/research-retained-analytics-v2.fixed.valid.json"), "utf8"));
    block.metrics.sharpe.input_digest = "0".repeat(64);
    const source = row("run-p20-left");
    const { service } = subject(snapshot([row("run-p20-left", { evidence_projection: {
      ...source.evidence_projection as Record<string, unknown>, summary_analytics_v2: block,
    } })]));
    const response = await service.detail(scope, "alpha-p20", { mode: "attempts", run_ids: [] });
    if (response.result.mode !== "attempts") throw new Error("test guard");
    expect(response.result.attempts[0]!.original_metrics.find((metric) => metric.key === "OOS_SHARPE"))
      .toMatchObject({ value: null, availability: { state: "NOT_PUBLISHED" } });
    expect(response.result.attempts[0]!.original_metrics.find((metric) => metric.key === "DECAY"))
      .toMatchObject({ value: null, availability: { state: "NOT_PUBLISHED" } });
  });

  it("CG-FG-S13-02 publishes only the persisted ISSUED methodology grade", async () => {
    const certified = row("run-p20-left", { progress_snapshot: {
      claim: { state: "ISSUED", text: "Claim issued",
        methodology_certificate: { state: "ISSUED", grade: "B", issued_at_utc_ms: 1_790_000_000_000, reason_code: null } },
    } });
    const { service } = subject(snapshot([certified, row("run-p20-right")]));
    const response = await service.detail(scope, "alpha-p20", { mode: "attempts", run_ids: [] });
    if (response.result.mode !== "attempts") throw new Error("test guard");
    expect(response.result.attempts.find((item) => item.run_id === "run-p20-left")?.certification).toEqual({
      state: "AVAILABLE", grade: "B", reason_code: null, availability: { state: "AVAILABLE", reason_code: null },
    });
    expect(response.result.attempts.find((item) => item.run_id === "run-p20-right")?.certification).toMatchObject({
      state: "NOT_PUBLISHED", grade: null, availability: { state: "NOT_PUBLISHED" },
    });
  });
  it("AN-22 projects only locator-verified P13 OOS Sharpe into the P04 Compare run", async () => {
    const withMetric = (runId: string, locator: string) => {
      const base = row(runId);
      return row(runId, { evidence_projection: {
        ...(base.evidence_projection as Record<string, unknown>),
        oos_analytics: { state: "AVAILABLE", metrics: { sharpe: {
          state: "AVAILABLE", reason_code: null, value: "0.744", locator,
        } } },
      } });
    };
    const { service } = subject(snapshot([
      withMetric("run-p20-left", "full_report.sharpe"),
      withMetric("run-p20-right", "unrelated.sharpe"),
    ]));
    const response = await service.detail(scope, "alpha-p20", { mode: "attempts", run_ids: [] });
    if (response.result.mode !== "attempts") throw new Error("test guard");
    const good = response.result.attempts.find((item) => item.run_id === "run-p20-left");
    const bad = response.result.attempts.find((item) => item.run_id === "run-p20-right");
    expect(good?.original_metrics.find((item) => item.key === "OOS_SHARPE")).toMatchObject({
      scope: "OOS", value: "0.744", availability: { state: "AVAILABLE", reason_code: null },
    });
    expect(bad?.original_metrics.find((item) => item.key === "OOS_SHARPE")).toMatchObject({
      value: null, availability: { state: "NOT_PUBLISHED" },
    });
  });

  it("P20-T04/T07/T09 sorts claim before metrics and cannot obtain a promotion or command collaborator", async () => {
    const noClaim = row("run-p20-no-claim", {
      split_projection: null,
      evidence_projection: {
        schema_version: "research.evidence-projection.v1",
        direct: { initial_equity: "100", final_equity: "200", num_trades: "2", bars: "3" },
        derived: { net_return_fraction: "1", max_drawdown_fraction: "-0.02" },
      },
    });
    const { service, repository } = subject(snapshot([noClaim, row("run-p20-left")]));
    const response = await service.detail(scope, "alpha-p20", { mode: "attempts", run_ids: [] });
    expect(response.result.mode).toBe("attempts");
    if (response.result.mode !== "attempts") throw new Error("test guard");
    expect(response.result.attempts.map((value) => value.run_id)).toEqual(["run-p20-left", "run-p20-no-claim"]);
    expect(response.result.trajectory.text).toContain("inspection never selects");
    expect(repository.pairRaw).not.toHaveBeenCalled();
    expect(repository.pairOverlay).not.toHaveBeenCalled();
    expect(repository.snapshot).toHaveBeenCalledWith(scope, "alpha-p20", [], 128);
  });

  it("P20-T01/T02 refuses a same-Alpha key mismatch before raw math or an overlay can exist", async () => {
    const right = row("run-p20-right", { requested_spec: requested("run-p20-right", { data: { dataset_id: "hmd", symbol: "BTCUSDT", timeframe: "4h" } }) });
    const { service, repository } = subject(snapshot([row("run-p20-left"), right]));
    const response = await service.detail(scope, "alpha-p20", { mode: "pair", run_ids: ["run-p20-left", "run-p20-right"] });
    expect(response.result).toMatchObject({ mode: "pair", state: "REFUSED", pair: null, refusal: { code: "P20_CONTRACT_KEY_MISMATCH" } });
    expect(repository.pairRaw).not.toHaveBeenCalled();
    expect(repository.pairOverlay).not.toHaveBeenCalled();
    expect(repository.snapshot).toHaveBeenCalledWith(scope, "alpha-p20", ["run-p20-left", "run-p20-right"], 2);
  });

  it("P20-T05/T06/T10 computes only scoped exact raw facts, labels the formula and preserves original values separately", async () => {
    const { service, repository } = subject();
    const response = await service.detail(scope, "alpha-p20", { mode: "pair", run_ids: ["run-p20-left", "run-p20-right"] });
    expect(repository.pairRaw).toHaveBeenCalledTimes(1);
    expect(response.result).toMatchObject({ mode: "pair", state: "AVAILABLE" });
    if (response.result.mode !== "pair" || response.result.pair === null) throw new Error("test guard");
    expect(response.result.pair.correlation).toEqual(expect.objectContaining({
      state: "AVAILABLE", source_label: "PORTAL_DERIVED", formula_id: "pearson-product-moment-correlation",
      formula_version: "p20.raw-return-v1", value: "0.5", n: 3,
      missing_policy: "INNER_JOIN_EXACT_TIMESTAMP_NO_FORWARD_FILL",
    }));
    expect(response.result.pair.common_window.metrics[0]).toMatchObject({
      left_value: "0.1", right_value: "0.2", delta: "0.1", definition_id: "research.compare.metric.v1.common-window-net-return",
    });
    expect(response.result.pair.runs[0].original_metrics[0]).toMatchObject({ scope: "P13_OOS_EQUITY_SERIES", value: "0.1" });
    expect(response.result.pair.common_window.metrics[2]).toMatchObject({ key: "TRADE_COUNT", availability: { state: "NOT_APPLICABLE" } });
    expect(response.result.pair.common_window.metrics.find((metric) => metric.key === "OOS_SHARPE")).toMatchObject({
      definition_id: "research.compare.metric.v2.common-window-utc-daily-sharpe-365",
      left_value: "1.25", right_value: "2.5", delta: "1.25", availability: { state: "AVAILABLE" },
    });
  });

  /*
   * CG-P20-12 (W5c). `run_producers.manifest_digest` is the preflight
   * (dataset/spec) manifest; `current_source_seals_v1.manifest_digest` is the
   * sealed P05 artifact's own manifest. On a real WFO run they always differ,
   * so requiring them equal made every WFO pair "not source-bound". Each is
   * now bound to its own identity: the preflight manifest to the P14 receipt,
   * the retained seal to the SEALED artifact row at the same revision.
   */
  it("CG-P20-12 binds the retained seal to its own sealed artifact, not to the preflight manifest", async () => {
    const wfo = (runId: string, overrides: Partial<CompareRunRow> = {}) =>
      row(runId, { current_manifest_digest: digest(runId.endsWith("left") ? "c" : "7"), current_artifact_sealed: true, ...overrides });
    const bound = subject(snapshot([wfo("run-p20-left"), wfo("run-p20-right")]));
    const ok = await bound.service.detail(scope, "alpha-p20", { mode: "pair", run_ids: ["run-p20-left", "run-p20-right"] });
    expect(ok.result).toMatchObject({ mode: "pair", state: "AVAILABLE" });
    expect(bound.repository.pairRaw).toHaveBeenCalledTimes(1);
    if (ok.result.mode !== "pair" || !ok.result.pair) throw new Error("test guard");
    expect(ok.result.pair.runs[0].provenance).toMatchObject({
      manifest_digest_scope: "PREFLIGHT_DATASET_SPEC", source_manifest_digest: digest("c"),
    });
    expect(ok.result.pair.runs[1].provenance.source_manifest_digest).toBe(digest("7"));

    for (const broken of [
      { current_artifact_sealed: false },
      { current_artifact_sealed: null },
      { current_manifest_digest: "not-a-digest" },
    ] as Partial<CompareRunRow>[]) {
      const refused = subject(snapshot([wfo("run-p20-left", broken), wfo("run-p20-right")]));
      const answer = await refused.service.detail(scope, "alpha-p20", { mode: "pair", run_ids: ["run-p20-left", "run-p20-right"] });
      expect(answer.result).toMatchObject({ mode: "pair", state: "PARTIAL" });
      if (answer.result.mode !== "pair" || !answer.result.pair) throw new Error("test guard");
      expect(answer.result.pair.runs[0].provenance.source_manifest_digest).toBeNull();
      expect(JSON.stringify(answer.result)).toContain("P20_CURRENT_SOURCE_SEAL_DOES_NOT_MATCH_P14_AND_RUN_BINDINGS");
      expect(refused.repository.pairRaw).not.toHaveBeenCalled();
    }

    /* The preflight manifest is still bound to the P14 receipt. */
    const splitMismatch = subject(snapshot([wfo("run-p20-left", { manifest_digest: digest("8") }), wfo("run-p20-right")]));
    const mismatch = await splitMismatch.service.detail(scope, "alpha-p20", { mode: "pair", run_ids: ["run-p20-left", "run-p20-right"] });
    expect(mismatch.result).toMatchObject({ mode: "pair", state: "PARTIAL" });
    expect(splitMismatch.repository.pairRaw).not.toHaveBeenCalled();

    /* A run with no retained seal (the P04 fixed qualification) stays unbound, as before. */
    const p04 = subject(snapshot([row("run-p20-left", { current_artifact_revision: null, current_manifest_digest: null, current_artifact_sealed: null }), wfo("run-p20-right")]));
    const unbound = await p04.service.detail(scope, "alpha-p20", { mode: "pair", run_ids: ["run-p20-left", "run-p20-right"] });
    expect(unbound.result).toMatchObject({ mode: "pair", state: "PARTIAL" });
    expect(p04.repository.pairRaw).not.toHaveBeenCalled();
  });

  it("P20-T05/T11 never substitutes zero for insufficient, zero-variance or no-overlap correlation", async () => {
    const { service, repository } = subject();
    repository.pairRaw.mockResolvedValue(raw({ correlation: null }));
    const zeroVariance = await service.detail(scope, "alpha-p20", { mode: "pair", run_ids: ["run-p20-left", "run-p20-right"] });
    if (zeroVariance.result.mode !== "pair" || zeroVariance.result.pair === null) throw new Error("test guard");
    expect(zeroVariance.result.pair.correlation).toMatchObject({ state: "NOT_PUBLISHED", value: null, availability: { reason_code: "P20_ZERO_VARIANCE_RAW_RETURNS" } });

    repository.cached.mockResolvedValue(null);
    repository.pairRaw.mockResolvedValue(raw({ matchedCount: 0, startUtcMs: null, endUtcMs: null, correlation: null, leftCommonReturnFraction: null, rightCommonReturnFraction: null, leftCommonMaxDrawdownFraction: null, rightCommonMaxDrawdownFraction: null }));
    const noOverlap = await service.detail(scope, "alpha-p20", { mode: "pair", run_ids: ["run-p20-left", "run-p20-right"] });
    if (noOverlap.result.mode !== "pair" || noOverlap.result.pair === null) throw new Error("test guard");
    expect(noOverlap.result.pair.correlation).toMatchObject({ state: "NOT_PUBLISHED", value: null, n: 0, availability: { reason_code: "P20_NO_COMMON_RAW_RETURN_WINDOW" } });
    expect(noOverlap.result.pair.overlay.points).toEqual([]);
  });

  it("P20-T05/T10 rejects duplicate or malformed sealed observations rather than filtering them into a smaller correlation", async () => {
    const { service, repository } = subject();
    repository.pairRaw.mockResolvedValue(raw({
      leftDistinctTimestampCount: 2,
      leftValidReturnCount: 2,
      correlation: "0.999999999999",
    }));

    const response = await service.detail(scope, "alpha-p20", {
      mode: "pair", run_ids: ["run-p20-left", "run-p20-right"],
    });

    if (response.result.mode !== "pair" || response.result.pair === null) throw new Error("test guard");
    expect(response.result.state).toBe("PARTIAL");
    expect(response.result.pair.common_window).toMatchObject({
      state: "NOT_PUBLISHED",
      availability: { reason_code: "P20_RAW_OBSERVATION_FACTS_INCOMPATIBLE" },
    });
    expect(response.result.pair.correlation).toMatchObject({
      state: "NOT_PUBLISHED", value: null,
      availability: { reason_code: "P20_RAW_OBSERVATION_FACTS_INCOMPATIBLE" },
    });
    expect(response.result.pair.overlay.points).toEqual([]);
    expect(repository.pairOverlay).not.toHaveBeenCalled();
  });

  it("P20-T03 keeps market cards separate, bounded and without a cross-key overlay", async () => {
    const rows = Array.from({ length: 25 }, (_, index) => row(`run-p20-market-${index}`, {
      requested_spec: requested(`run-p20-market-${index}`, { data: { dataset_id: "hmd", symbol: `SYM${index}`, timeframe: "1h" } }),
    }));
    const { service, repository } = subject(snapshot(rows));
    const response = await service.detail(scope, "alpha-p20", { mode: "markets", run_ids: [] });
    expect(response.result).toMatchObject({
      mode: "markets",
      caption: "different contract keys — small multiples only; an overlay across keys would be a comparison lie.",
      grouping: "MARKET_KEY_ACTIVE_OR_LATEST_V1",
    });
    if (response.result.mode !== "markets") throw new Error("test guard");
    /* 25 markets, 24 cards: the bound is stated, never a silent cut. */
    expect(response.result.cards).toHaveLength(24);
    expect(new Set(response.result.cards.map((card) => card.market.symbol)).size).toBe(24);
    expect(response.result.coverage).toMatchObject({ state: "PARTIAL", reason_code: "P20_MARKET_SMALL_MULTIPLES_BOUNDED" });
    expect(repository.pairRaw).not.toHaveBeenCalled();
    /* D10: markets reads the full attempts budget so it can group. */
    expect(repository.snapshot).toHaveBeenCalledWith(scope, "alpha-p20", [], 128);
  });

  it("D10 groups runs by the market part of the key and shows the latest ACTIVE-version run per market", async () => {
    const market = (symbol: string, timeframe: string) => ({ data: { dataset_id: "hmd", symbol, timeframe } });
    const at = (minute: number) => new Date(`2026-09-22T00:${String(minute).padStart(2, "0")}:00.000Z`);
    const rows = [
      row("run-btc-old-active", { requested_spec: requested("run-btc-old-active", market("BTCUSDT", "1h")), run_created_at: at(1), alpha_version_lifecycle: "ACTIVE" }),
      row("run-btc-new-active", { requested_spec: requested("run-btc-new-active", market("BTCUSDT", "1h")), run_created_at: at(5), alpha_version_lifecycle: "ACTIVE" }),
      /* Newer, but its version is superseded: the ACTIVE version's run stands for the market. */
      row("run-btc-newest-superseded", { requested_spec: requested("run-btc-newest-superseded", market("BTCUSDT", "1h")), run_created_at: at(9), alpha_version_lifecycle: "SUPERSEDED" }),
      /* A different route on the same market is the same market card. */
      row("run-btc-other-route", { requested_spec: requested("run-btc-other-route", { ...market("BTCUSDT", "1h"), execution_route: "pct_equity" }), run_created_at: at(2), alpha_version_lifecycle: "ACTIVE" }),
      /* The same symbol at another timeframe is another market. */
      row("run-btc-4h", { requested_spec: requested("run-btc-4h", market("BTCUSDT", "4h")), run_created_at: at(3), alpha_version_lifecycle: "SUPERSEDED" }),
      row("run-eth-a", { requested_spec: requested("run-eth-a", market("ETHUSDT", "1h")), run_created_at: at(4), alpha_version_lifecycle: "SUPERSEDED" }),
      row("run-eth-b", { requested_spec: requested("run-eth-b", market("ETHUSDT", "1h")), run_created_at: at(6), alpha_version_lifecycle: "SUPERSEDED" }),
    ];
    const { service } = subject(snapshot(rows));
    const response = await service.detail(scope, "alpha-p20", { mode: "markets", run_ids: [] });
    expect(ResearchCompareResponseSchema.safeParse(response).success).toBe(true);
    if (response.result.mode !== "markets") throw new Error("test guard");
    const cards = Object.fromEntries(response.result.cards.map((card) => [`${card.market.symbol} · ${card.market.timeframe}`, card]));
    expect(Object.keys(cards).sort()).toEqual(["BTCUSDT · 1h", "BTCUSDT · 4h", "ETHUSDT · 1h"]);
    expect(cards["BTCUSDT · 1h"]).toMatchObject({ selection: "LATEST_ACTIVE_VERSION_RUN", runs_in_market: 4, run: { run_id: "run-btc-new-active" } });
    expect(cards["ETHUSDT · 1h"]).toMatchObject({ selection: "LATEST_RUN", runs_in_market: 2, run: { run_id: "run-eth-b" } });
    expect(cards["BTCUSDT · 4h"]).toMatchObject({ selection: "LATEST_RUN", runs_in_market: 1, run: { run_id: "run-btc-4h" } });
    expect(response.result.coverage).toMatchObject({ state: "COMPLETE", total_attempts: 7, reason_code: null });
  });

  it("D10 never merges two runs whose key publishes no market part", async () => {
    const rows = [
      row("run-nomarket-a", { requested_spec: null }),
      row("run-nomarket-b", { requested_spec: null }),
    ];
    const { service } = subject(snapshot(rows));
    const response = await service.detail(scope, "alpha-p20", { mode: "markets", run_ids: [] });
    if (response.result.mode !== "markets") throw new Error("test guard");
    const unknown = response.result.cards.filter((card) => card.selection === "MARKET_NOT_PUBLISHED");
    expect(unknown).toHaveLength(2);
    expect(unknown.length).toBe(response.result.cards.filter((card) => card.market.symbol === null || card.market.timeframe === null).length);
    for (const card of unknown) expect(card.runs_in_market).toBe(1);
  });

  it("publishes the same server-derived run label in Compare and keeps unknown profiles nullable", async () => {
    const { service } = subject(snapshot([
      row("run-p20-left", { display_profile_id: "p04.fixed-qualification.v1", display_ordinal: "1" }),
      row("run-p20-right", { display_profile_id: "unmapped-profile", display_ordinal: "2" }),
    ]));
    const response = await service.detail(scope, "alpha-p20", { mode: "attempts", run_ids: [] });
    if (response.result.mode !== "attempts") throw new Error("test guard");
    const labels = new Map(response.result.attempts.map((attempt) => [attempt.run_id, attempt.display_label]));
    expect(labels.get("run-p20-left")).toBe("R-P04-001");
    expect(labels.get("run-p20-right")).toBeNull();
  });

  it("fails closed while its retained-reader prerequisites are dark", async () => {
    const { repository } = subject();
    const service = new ResearchCompareService(repository as never, {
      FEATURE_RESEARCH_COMPARE: "true", FEATURE_RESEARCH_RUN_LIBRARY: "true",
      FEATURE_RESEARCH_EVIDENCE: "false", FEATURE_RESEARCH_SPLIT: "true",
    } as never);
    await expect(service.detail(scope, "alpha-p20", { mode: "attempts", run_ids: [] }))
      .rejects.toMatchObject({ code: "RESEARCH_COMPARE_UNAVAILABLE", status: 503 });
    expect(repository.snapshot).not.toHaveBeenCalled();
  });
});
