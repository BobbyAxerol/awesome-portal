/**
 * W6a · P20 Compare over both lanes (CG-P20-01…11).
 *
 * WFO rows carry the real QuantBT 1.1.1 Delta signal-notional WFO seal W5b
 * retained (summary, fold rows and the selected candidate), shaped exactly
 * as `compare.repository.ts` selects them; P04 rows keep the P13/P14
 * projections of the P20 service spec. The SQL itself is proven against a
 * disposable PostgreSQL in `research-compare-migration.spec.ts`.
 *
 * CG-P20-01: `W6A_WRITE_FIXTURES=1` rewrites the canonical compare fixtures
 * from these projections; every run validates the committed bodies against
 * Zod and the published OpenAPI.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";

import { ResearchCompareResponseSchema, type ResearchCompareResponse } from "../src/research/compare.contract";
import type { CompareRetainedEquityPoint, CompareRunRow } from "../src/research/compare.repository";
import { ResearchCompareService } from "../src/research/compare.service";
import type { CurrentSourceStoredRow } from "../src/research/current-source.repository";
import { p14SplitSourceFixture } from "./research-split.fixture";
import { wfoRequested } from "./research-w1-wfo.fixture";
import { openApiValidator } from "./research-rf05-openapi";

type Kind = "OBSERVATION" | "FOLD" | "TRIAL" | "CANDIDATE" | "SELECTION";
const real = JSON.parse(gunzipSync(readFileSync(join(__dirname, "research-w5b-real-replay.fixture.json.gz"))).toString("utf8")) as {
  run_id: string; table_rows: Record<Kind, number>; manifest_digest: string; summary: Record<string, unknown>;
  rows: Record<Kind, CurrentSourceStoredRow[]>;
};
const scope = { workspaceId: "ws-w6a", actorUserId: "usr-w6a" };
const digest = (character: string) => character.repeat(64);
const compareValidator = openApiValidator("research-compare.openapi.json", "CompareResponse");

function requested(seed: number, overrides: Record<string, unknown> = {}) {
  const base = wfoRequested({
    alpha_binding: { alpha_id: "delta-rsi-polynomial-alpha", alpha_version_id: "av-w6a" },
    data: { dataset_id: "crypto-binance-1m", symbol: "BTCUSDT", timeframe: "1h" },
    random_seed: seed,
  } as never);
  if (overrides.protocol === "three_window_decay") {
    const { walk_forward: _walkForward, ...rest } = base;
    return { ...rest, windows: { is: { start: "2026-06-01", end_exclusive: "2026-07-01" }, oos: { start: "2026-07-01", end_exclusive: "2026-07-15" }, holdout: { start: "2026-07-15", end_exclusive: "2026-07-16" } }, ...overrides };
  }
  return { ...base, ...overrides };
}

const realFolds = [...real.rows.FOLD].sort((left, right) => left.sourceOrdinal - right.sourceOrdinal).map((row) => {
  const payload = row.payload as { fold_id: string; test_start_utc_ms: number; test_end_utc_ms: number; fold_facts: { test_bars: number; oos_score: { oos_sharpe: string; oos_trade_count: string } } };
  return {
    source_ordinal: row.sourceOrdinal, fold_id: payload.fold_id,
    test_start_utc_ms: payload.test_start_utc_ms, test_end_utc_ms: payload.test_end_utc_ms,
    test_bars: payload.fold_facts.test_bars, oos_sharpe: payload.fold_facts.oos_score.oos_sharpe,
    oos_trade_count: payload.fold_facts.oos_score.oos_trade_count,
  };
});
const selectedMetrics = (real.rows.CANDIDATE[0]!.payload as { trial_facts: { metrics: { mean_oos_sharpe: string; mean_decay: string } } }).trial_facts.metrics;

function wfoRow(runId: string, seed: number, overrides: Partial<CompareRunRow> = {}): CompareRunRow {
  return {
    attempt_id: `att-${runId}`, alpha_version_id: "av-w6a", alpha_version_label: "av_1_0_0",
    attempt_state: "READY", intent_kind: "NEW", attempt_created_at: new Date("2026-09-25T00:00:00.000Z"),
    run_id: runId, run_state: "READY", run_created_at: new Date(`2026-09-25T00:0${seed % 10}:00.000Z`),
    display_profile_id: null, display_ordinal: null,
    requested_spec_digest: digest("d"), effective_spec_digest: digest("e"), dataset_binding_digest: digest("f"),
    manifest_digest: digest("b"), requested_spec: requested(seed),
    progress_snapshot: null,
    evidence_revision: null, evidence_projection: null, split_revision: null, split_projection: null,
    current_artifact_revision: 1, current_manifest_digest: real.manifest_digest, current_artifact_sealed: true,
    current_requested_spec_digest: digest("d"), current_effective_spec_digest: digest("e"), current_dataset_binding_digest: digest("f"),
    current_retained_import_digest: digest("9"), current_source_transform_digest: digest("a"),
    evidence_equity_sampling: null, evidence_equity_source_observation_count: null, evidence_equity_values: null,
    alpha_version_lifecycle: "ACTIVE",
    current_profile_id: "rs02.delta-signal-notional-wfo.v1",
    current_source_summary: real.summary,
    current_source_table_rows: real.table_rows,
    current_source_folds: realFolds as unknown as Record<string, unknown>[],
    current_selected_mean_oos_sharpe: selectedMetrics.mean_oos_sharpe,
    current_selected_mean_decay: selectedMetrics.mean_decay,
    ...overrides,
  };
}

function p04Row(runId: string): CompareRunRow {
  const split = p14SplitSourceFixture({ manifestDigest: digest("b") });
  return {
    ...wfoRow(runId, 3),
    requested_spec: requested(3, { protocol: "three_window_decay", optimization_mode: "fixed", optimization_schedule: "none" }),
    evidence_revision: `p13r1_${digest("1")}`,
    evidence_projection: {
      schema_version: "research.evidence-projection.v1",
      direct: { initial_equity: "100", final_equity: "110", num_trades: "2", bars: "3" },
      derived: { net_return_fraction: "0.1", max_drawdown_fraction: "-0.02" },
    },
    split_revision: `p14r1_${digest("2")}`,
    split_projection: { schema_version: "research.split-projection.v1", source: { ...split, windows: { ...split.windows, outer_oos: { ...split.windows.outer_oos, bars: 3 } } } },
    current_manifest_digest: digest("b"),
    evidence_equity_sampling: "FULL", evidence_equity_source_observation_count: 3,
    evidence_equity_values: [
      { at_utc_ms: 1_704_672_000_000, equity: "100", drawdown_fraction: "0" },
      { at_utc_ms: 1_704_675_600_000, equity: "98", drawdown_fraction: "-0.02" },
      { at_utc_ms: 1_704_679_200_000, equity: "110", drawdown_fraction: "0" },
    ] as unknown as Record<string, unknown>,
    alpha_version_lifecycle: "SUPERSEDED",
    current_profile_id: "p04.fixed-qualification.v1",
    current_source_summary: null, current_source_table_rows: null, current_source_folds: null,
    current_selected_mean_oos_sharpe: null, current_selected_mean_decay: null,
  };
}

const observations = [...real.rows.OBSERVATION].sort((left, right) => left.sourceOrdinal - right.sourceOrdinal);
function retainedPoints(runId: string): CompareRetainedEquityPoint[] {
  return observations.filter((_, index) => index % 4 === 0 || index === observations.length - 1).map((row) => ({
    runId, atUtcMs: row.occurredAtUtcMs ?? (row.payload as { at_utc_ms: number }).at_utc_ms,
    equity: (row.payload as { equity: string }).equity, sourceCount: observations.length,
  }));
}

function subject(rows: CompareRunRow[], raw?: Record<string, unknown>) {
  const repository = {
    snapshot: vi.fn().mockResolvedValue({ alpha: { alpha_id: "delta-rsi-polynomial-alpha", name: "Delta-RSI Polynomial Alpha" }, runs: rows, totalAttempts: rows.length, hasMore: false, asOfUtcMs: 1_790_269_300_000 }),
    cached: vi.fn().mockResolvedValue(null),
    pairEnriched: vi.fn().mockResolvedValue(new Map()),
    persistCache: vi.fn().mockResolvedValue(undefined),
    retainedEquity: vi.fn(async (_scope: unknown, runs: Array<{ runId: string }>) => runs.flatMap((run) => retainedPoints(run.runId))),
    pairRaw: vi.fn().mockResolvedValue({
      leftSourceCount: 336, rightSourceCount: 336, leftDistinctTimestampCount: 336, rightDistinctTimestampCount: 336,
      leftValidReturnCount: 336, rightValidReturnCount: 336, leftValidEquityCount: 336, rightValidEquityCount: 336,
      matchedCount: 336, startUtcMs: realFolds[0]!.test_start_utc_ms, endUtcMs: realFolds.at(-1)!.test_end_utc_ms,
      correlation: "0.873421000000", leftCommonReturnFraction: "-0.0034", rightCommonReturnFraction: "-0.0021",
      leftCommonMaxDrawdownFraction: "-0.0067", rightCommonMaxDrawdownFraction: "-0.0051",
      ...raw,
    }),
    pairOverlay: vi.fn().mockResolvedValue([
      { atUtcMs: realFolds[0]!.test_start_utc_ms, leftEquity: "19990", rightEquity: "19995" },
      { atUtcMs: realFolds.at(-1)!.test_end_utc_ms, leftEquity: "19926.5", rightEquity: "19950.1" },
    ]),
  };
  const service = new ResearchCompareService(repository as never, {
    FEATURE_RESEARCH_COMPARE: "true", FEATURE_RESEARCH_RUN_LIBRARY: "true", FEATURE_RESEARCH_EVIDENCE: "true", FEATURE_RESEARCH_SPLIT: "true",
  } as never);
  return { service, repository };
}

async function read(rows: CompareRunRow[], query: { mode: "attempts" | "markets" | "pair"; run_ids: string[] }, raw?: Record<string, unknown>) {
  const response = await subject(rows, raw).service.detail(scope, "delta-rsi-polynomial-alpha", query);
  expect(ResearchCompareResponseSchema.safeParse(response).success).toBe(true);
  compareValidator.assert(response);
  return response;
}

const attempts = (response: ResearchCompareResponse) => {
  if (response.result.mode !== "attempts") throw new Error("expected attempts");
  return response.result;
};

describe("W6a · Compare reads the retained WFO lane and answers CG-P20-02…11", () => {
  const rows = () => [p04Row("run-w6a-p04"), wfoRow("run-w6a-wfo-a", 42), wfoRow("run-w6a-wfo-b", 7, { alpha_version_lifecycle: "SUPERSEDED" })];

  it("a WFO run carries its source-attested claim, retained metrics and lane", async () => {
    const result = attempts(await read(rows(), { mode: "attempts", run_ids: [] }));
    const wfo = result.attempts.find((run) => run.run_id === "run-w6a-wfo-a")!;
    expect(wfo.lane).toBe("RS02_RETAINED_CURRENT_SOURCE");
    expect(wfo.claim).toMatchObject({ family: "WALK_FORWARD_OOS_COMPATIBILITY", rank: 3, origin: "SOURCE_ATTESTED" });
    expect(wfo.claim.text).toContain("validation_claim=walk_forward_oos");
    const metric = Object.fromEntries(wfo.original_metrics.map((item) => [item.key, item]));
    expect(metric.OOS_SHARPE).toMatchObject({ value: selectedMetrics.mean_oos_sharpe, scope: "RS02_OOS_MEAN_OF_FOLDS", availability: { state: "AVAILABLE" } });
    expect(metric.DECAY!.value).toBe(selectedMetrics.mean_decay);
    expect(metric.NET_RETURN_FRACTION!.value).toBe((real.summary.metrics as { net_return_fraction: string }).net_return_fraction);
    expect(metric.TRADE_COUNT!.value).toBe(String(realFolds.reduce((sum, fold) => sum + Number(fold.oos_trade_count), 0)));
    expect(result.attempts.find((run) => run.run_id === "run-w6a-p04")!.lane).toBe("P04_FIXED_PROFILE");
  });

  it("CG-P20-02/03/08 schedule, typed certification absence and the version lifecycle", async () => {
    const result = attempts(await read(rows(), { mode: "attempts", run_ids: [] }));
    const byId = Object.fromEntries(result.attempts.map((run) => [run.run_id, run]));
    expect(byId["run-w6a-wfo-a"]!.schedule).toEqual({ mode: "mode_1_decay", schedule: "global", availability: { state: "AVAILABLE", reason_code: null } });
    expect(byId["run-w6a-wfo-a"]!.certification).toMatchObject({ state: "NOT_PUBLISHED", grade: null, reason_code: "P20_NO_SOURCE_PUBLISHES_A_CERTIFICATION_GRADE" });
    expect(byId["run-w6a-wfo-a"]!.alpha_version_lifecycle).toEqual({ value: "ACTIVE", availability: { state: "AVAILABLE", reason_code: null } });
    expect(byId["run-w6a-wfo-b"]!.alpha_version_lifecycle.value).toBe("SUPERSEDED");
  });

  it("CG-P20-04 per-fold OOS Sharpe comes from the retained fold rows; a P04 run is a typed absence", async () => {
    const result = attempts(await read(rows(), { mode: "attempts", run_ids: [] }));
    const series = Object.fromEntries(result.fold_series.map((item) => [item.run_id, item]));
    expect(result.fold_series.map((item) => item.run_id)).toEqual(result.attempts.map((run) => run.run_id));
    expect(series["run-w6a-wfo-a"]).toMatchObject({ state: "AVAILABLE", source_fold_count: 2, truncated: false });
    expect(series["run-w6a-wfo-a"]!.folds.map((fold) => fold.oos_sharpe)).toEqual(realFolds.map((fold) => fold.oos_sharpe));
    expect(series["run-w6a-p04"]).toMatchObject({ state: "NOT_PUBLISHED", folds: [], availability: { reason_code: "P20_P04_SOURCE_DID_NOT_PUBLISH_PER_FOLD_OOS_SHARPE" } });
    const many = Array.from({ length: 33 }, (_, index) => ({ ...realFolds[0]!, source_ordinal: index, fold_id: String(index) }));
    const wide = attempts(await read([wfoRow("run-w6a-wide", 5, { current_source_folds: many as never, current_source_table_rows: { ...real.table_rows, FOLD: 40 } })], { mode: "attempts", run_ids: [] }));
    expect(wide.fold_series[0]).toMatchObject({ truncated: true, source_fold_count: 40 });
    expect(wide.fold_series[0]!.folds).toHaveLength(32);
  });

  it("CG-P20-05 config diff lists only the allow-listed keys that changed anywhere, with every attempt's value", async () => {
    const result = attempts(await read(rows(), { mode: "attempts", run_ids: [] }));
    expect(result.config_diff.availability.state).toBe("AVAILABLE");
    const paths = Object.fromEntries(result.config_diff.paths.map((item) => [item.path, item.values]));
    expect(Object.keys(paths).sort()).toEqual(["optimization_mode", "optimization_schedule", "random_seed"]);
    expect(paths.random_seed!.map((value) => value.value)).toEqual(result.attempts.map((run) => run.run_id === "run-w6a-wfo-a" ? "42" : run.run_id === "run-w6a-wfo-b" ? "7" : "3"));
    const single = attempts(await read([wfoRow("run-w6a-only", 1)], { mode: "attempts", run_ids: [] }));
    expect(single.config_diff).toEqual({ paths: [], availability: { state: "NOT_APPLICABLE", reason_code: "P20_CONFIG_DIFF_NEEDS_TWO_ATTEMPTS" } });
  });

  it("CG-P20-11 orders by claim rank, then OOS Sharpe, then net return; a missing OOS Sharpe never outranks a real one", async () => {
    const better = wfoRow("run-w6a-better", 8, { current_selected_mean_oos_sharpe: "1.25" });
    const result = attempts(await read([...rows(), better], { mode: "attempts", run_ids: [] }));
    expect(result.order).toBe("CLAIM_RANK_ASC_OOS_SHARPE_DESC_NET_RETURN_DESC");
    expect(result.attempts.map((run) => run.run_id)[0]).toBe("run-w6a-better");
    expect(result.attempts.map((run) => run.run_id).at(-1)).toBe("run-w6a-p04");
  });

  it("markets: a WFO card is an extrema-bucket small multiple of the retained path, never a zero count", async () => {
    const response = await read(rows(), { mode: "markets", run_ids: [] });
    if (response.result.mode !== "markets") throw new Error("expected markets");
    const card = response.result.cards.find((item) => item.run.run_id === "run-w6a-wfo-a")!;
    expect(card.chart).toMatchObject({ state: "AVAILABLE", sampling: "EXTREMA_BUCKET_V1", source_observation_count: observations.length });
    expect(card.chart.emitted_point_count).toBe(card.chart.points.length);
    expect(card.chart.points.length).toBeLessThanOrEqual(192);
    const unsealed = await read([wfoRow("run-w6a-unsealed", 9, { current_artifact_sealed: false })], { mode: "markets", run_ids: [] });
    if (unsealed.result.mode !== "markets") throw new Error("expected markets");
    expect(unsealed.result.cards[0]!.chart).toMatchObject({ state: "NOT_PUBLISHED", emitted_point_count: null, source_observation_count: null });
  });

  it("pair: two WFO runs compare over the retained outer-test span; CG-P20-06/09 are in the contract", async () => {
    const { service, repository } = subject(rows());
    const response = await service.detail(scope, "delta-rsi-polynomial-alpha", { mode: "pair", run_ids: ["run-w6a-wfo-a", "run-w6a-wfo-b"] });
    compareValidator.assert(response);
    expect(repository.pairRaw.mock.calls[0]![1]).toMatchObject({
      left: { outerOosStartUtcMs: realFolds[0]!.test_start_utc_ms, outerOosEndExclusiveUtcMs: realFolds.at(-1)!.test_end_utc_ms + 1, expectedOuterOosBars: 336 },
    });
    if (response.result.mode !== "pair" || response.result.pair === null) throw new Error("expected a comparable pair");
    const common = response.result.pair.common_window;
    expect(common.delta_definition).toBe("RIGHT_MINUS_LEFT");
    expect(common.metrics.map((item) => item.key)).toEqual(["NET_RETURN_FRACTION", "MAX_DRAWDOWN_FRACTION", "TRADE_COUNT", "WIN_RATE_FRACTION", "OOS_SHARPE"]);
    expect(common.metrics[0]!.delta).toBe("0.0013");
    expect(common.metrics[3]!.availability.reason_code).toBe("P20_SOURCE_PUBLISHES_NO_AUDITED_ROUND_TRIPS_FOR_WIN_RATE");
    expect(common.metrics[4]).toMatchObject({ left_value: null, right_value: null, delta: null, availability: { state: "NOT_PUBLISHED", reason_code: "PORTAL_ANALYTICS_COMMON_WINDOW_ZERO_VARIANCE" } });
    expect(response.result.pair.correlation).toMatchObject({ state: "AVAILABLE", value: "0.873421000000", n: 336 });
  });

  it("CG-P20-10 a block that was never measured carries null counts, a measured one keeps its count", async () => {
    const drift = await read([wfoRow("run-w6a-drift-a", 1, { current_requested_spec_digest: digest("0") }), wfoRow("run-w6a-drift-b", 2)], { mode: "pair", run_ids: ["run-w6a-drift-a", "run-w6a-drift-b"] });
    if (drift.result.mode !== "pair" || drift.result.pair === null) throw new Error("expected a partial pair");
    expect(drift.result.state).toBe("PARTIAL");
    expect(drift.result.pair.common_window.matched_observation_count).toBeNull();
    expect(drift.result.pair.correlation.n).toBeNull();
    expect(drift.result.pair.overlay.emitted_point_count).toBeNull();
    const flat = await read(rows(), { mode: "pair", run_ids: ["run-w6a-wfo-a", "run-w6a-wfo-b"] }, { correlation: null });
    if (flat.result.mode !== "pair" || flat.result.pair === null) throw new Error("expected a pair");
    expect(flat.result.pair.correlation).toMatchObject({ state: "NOT_PUBLISHED", n: 336, availability: { reason_code: "P20_ZERO_VARIANCE_RAW_RETURNS" } });
  });
});

/** CG-P20-01 · canonical compare fixtures for Screen 13 (spec 13 §10). */
describe("CG-P20-01 · published compare fixtures", () => {
  const root = resolve(process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts"), "fixtures");
  const files = {
    attempts: "research-compare.attempts.valid.json",
    markets: "research-compare.markets.valid.json",
    pairOk: "research-compare.pair-ok.valid.json",
    pairMismatch: "research-compare.pair-mismatch.valid.json",
    pairNocorr: "research-compare.pair-nocorr.valid.json",
    problems: "research-compare.problems.valid.json",
  } as const;

  it("writes (opt-in) and validates the committed fixtures", async () => {
    if (process.env.W6A_WRITE_FIXTURES === "1") {
      const rows = [p04Row("run-w6a-p04"), wfoRow("run-w6a-wfo-a", 42), wfoRow("run-w6a-wfo-b", 7, { alpha_version_lifecycle: "SUPERSEDED" })];
      const eth = wfoRow("run-w6a-wfo-eth", 11, { requested_spec: requested(11, { data: { dataset_id: "crypto-binance-1m", symbol: "ETHUSDT", timeframe: "1h" } }) });
      const bodies: Array<[string, unknown]> = [
        [files.attempts, await read(rows, { mode: "attempts", run_ids: [] })],
        [files.markets, await read([...rows, eth], { mode: "markets", run_ids: [] })],
        [files.pairOk, await read(rows, { mode: "pair", run_ids: ["run-w6a-wfo-a", "run-w6a-wfo-b"] })],
        [files.pairMismatch, await read([...rows, eth], { mode: "pair", run_ids: ["run-w6a-wfo-a", "run-w6a-wfo-eth"] })],
        [files.pairNocorr, await read(rows, { mode: "pair", run_ids: ["run-w6a-wfo-a", "run-w6a-wfo-b"] }, { correlation: null })],
      ];
      for (const [name, body] of bodies) writeFileSync(join(root, name), `${JSON.stringify(body)}\n`);
      const problem = (status: number, code: string, message: string) => ({ status, body: { error: { code, message }, request_id: "req_fixture" } });
      writeFileSync(join(root, files.problems), `${JSON.stringify([
        problem(400, "RESEARCH_COMPARE_INVALID", "Research compare request is invalid."),
        problem(401, "SESSION_REQUIRED", "Invalid session."),
        problem(403, "RESEARCH_COMPARE_FORBIDDEN", "Access denied."),
        problem(404, "RESEARCH_COMPARE_NOT_FOUND", "Research Alpha was not found."),
        problem(503, "RESEARCH_COMPARE_UNAVAILABLE", "Research Compare is not enabled in this deployment."),
      ])}\n`);
    }
    const load = (name: string) => JSON.parse(readFileSync(join(root, name), "utf8"));
    for (const name of [files.attempts, files.markets, files.pairOk, files.pairMismatch, files.pairNocorr]) {
      expect(ResearchCompareResponseSchema.safeParse(load(name)).success, name).toBe(true);
      compareValidator.assert(load(name));
    }
    expect(load(files.pairMismatch).result).toMatchObject({ state: "REFUSED", pair: null, refusal: { code: "P20_CONTRACT_KEY_MISMATCH" } });
    expect(load(files.pairNocorr).result.pair.correlation.availability.reason_code).toBe("P20_ZERO_VARIANCE_RAW_RETURNS");
    const problemValidator = openApiValidator("research-compare.openapi.json", "Problem");
    for (const problem of load(files.problems)) problemValidator.assert(problem.body);
  });
});
