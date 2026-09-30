import { describe, expect, it, vi } from "vitest";

import { ResearchCompareResponseSchema } from "../src/research/compare.contract";
import { ResearchCompareService } from "../src/research/compare.service";
import type { CompareRunRow } from "../src/research/compare.repository";
import { p14SplitSourceFixture } from "./research-split.fixture";

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
    ...overrides,
  };
}

function subject(value = snapshot()) {
  const repository = {
    snapshot: vi.fn().mockResolvedValue(value),
    cached: vi.fn().mockResolvedValue(null),
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

    for (const broken of [
      { current_artifact_sealed: false },
      { current_artifact_sealed: null },
      { current_manifest_digest: "not-a-digest" },
    ] as Partial<CompareRunRow>[]) {
      const refused = subject(snapshot([wfo("run-p20-left", broken), wfo("run-p20-right")]));
      const answer = await refused.service.detail(scope, "alpha-p20", { mode: "pair", run_ids: ["run-p20-left", "run-p20-right"] });
      expect(answer.result).toMatchObject({ mode: "pair", state: "PARTIAL" });
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
