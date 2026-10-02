/**
 * W3 · P13–P15 on real WFO data (CG-P13-05/07/08, CG-P14-02, CG-P15-03/04).
 *
 * The fixture is the exact retained rows + seal summary of a real QuantBT
 * 1.1.1 Delta signal-notional WFO on BTCUSDT 1h (3 trials, 2 folds), exported
 * by the opt-in real-HMD test. An in-memory repository with the real keyset
 * semantics stands in for PostgreSQL; the SQL itself is proven in the RS-02
 * PostgreSQL lane.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { mockSearchInputs } from "./research-search-inputs.fixture";

import {
  ResearchCurrentSourceEvidenceResponseSchema,
  ResearchCurrentSourceEvidenceSeriesResponseSchema,
  ResearchCurrentSourceSearchResponseSchema,
  ResearchCurrentSourceSplitResponseSchema,
  type ResearchCurrentSourceEvidenceResponse,
  type ResearchCurrentSourceNotApplicableResponse,
  type ResearchCurrentSourceSearchResponse,
  type ResearchCurrentSourceSplitResponse,
} from "../src/research/current-source.contract";
import { evaluateFold, FOLD_VERDICT_RULE } from "../src/research/current-source-facts";
import {
  CurrentSourceSummarySchema,
  currentSourceRowMatchesKind,
} from "../src/research/current-source.payload";
import type { CurrentSourceSealRow, CurrentSourceStoredRow } from "../src/research/current-source.repository";
import { ResearchCurrentSourceService } from "../src/research/current-source.service";
import { openApiValidator } from "./research-rf05-openapi";

type Kind = "OBSERVATION" | "FOLD" | "TRIAL" | "CANDIDATE" | "SELECTION";
interface Fixture {
  run_id: string;
  table_rows: Record<Kind, number>;
  manifest_digest: string;
  source_transform_digest: string;
  summary: Record<string, unknown>;
  rows: Record<Exclude<Kind, "OBSERVATION">, CurrentSourceStoredRow[]>;
  expected: {
    selection: { trial_id: string; objective: string; parameters: Record<string, string> };
    trials: Record<string, string>;
    folds: Array<{ fold_id: string; oos_sharpe: string; decay: string; oos_trade_count: string }>;
  };
}

const real = JSON.parse(readFileSync(join(__dirname, "research-w3-real-hmd-seal.fixture.json"), "utf8")) as Fixture;
const w1 = JSON.parse(readFileSync(join(__dirname, "research-w1-preview-seal.fixture.json"), "utf8")) as {
  seal: { summary: Record<string, unknown>; table_rows: Record<Kind, number> };
};
const scope = { workspaceId: "ws-w3", actorUserId: "usr-w3" };
const config = {
  FEATURE_RESEARCH_CURRENT_SOURCE: "true",
  QUERY_CURSOR_ACTIVE_KEY_ID: "query-k1",
  QUERY_CURSOR_KEYS_JSON: '{"query-k1":"current-source-test-key-is-at-least-32-bytes"}',
  QUERY_CURSOR_TTL_SECONDS: 900,
};

function sealed<T>(value: T | ResearchCurrentSourceNotApplicableResponse): T {
  if ((value as { schema_version?: string }).schema_version === "research.current-source-not-applicable.v1") {
    throw new Error("expected a sealed current-source response");
  }
  return value as T;
}

function sealRow(summary: Record<string, unknown>, tableRows: Record<Kind, number>): CurrentSourceSealRow {
  return {
    runId: real.run_id,
    artifactRevision: 1,
    sourceAdapterId: "rs02.quantbt-signal-notional-wfo.v1",
    profileId: "rs02.delta-signal-notional-wfo.v1",
    manifestDigest: real.manifest_digest,
    sourceTransformDigest: real.source_transform_digest,
    retainedImportDigest: "f".repeat(64),
    requestedSpecDigest: "1".repeat(64),
    effectiveSpecDigest: "2".repeat(64),
    datasetBindingDigest: "3".repeat(64),
    tableRows: tableRows,
    totalRows: Object.values(tableRows).reduce((sum, count) => sum + count, 0),
    summary,
    retainedAtUtcMs: 1_790_269_236_911,
  };
}

/** In-memory keyset reader with the repository's exact page semantics. */
function memory(seal: CurrentSourceSealRow, tables: Partial<Record<Kind, CurrentSourceStoredRow[]>>) {
  const rows = vi.fn(async (_scope: unknown, _runId: string, _revision: number, kind: Kind,
    selection: { afterOrdinal?: number; beforeOrdinal?: number; atOrdinal?: number; limit: number }) => {
    const all = [...(tables[kind] ?? [])].sort((left, right) => left.sourceOrdinal - right.sourceOrdinal);
    let window: CurrentSourceStoredRow[];
    if (selection.afterOrdinal !== undefined) window = all.filter((row) => row.sourceOrdinal > selection.afterOrdinal!).slice(0, selection.limit);
    else if (selection.beforeOrdinal !== undefined) window = all.filter((row) => row.sourceOrdinal < selection.beforeOrdinal!).slice(-selection.limit);
    else if (selection.atOrdinal !== undefined) window = all.filter((row) => row.sourceOrdinal >= selection.atOrdinal!).slice(0, selection.limit);
    else window = all.slice(0, selection.limit);
    const first = window[0]?.sourceOrdinal;
    const last = window.at(-1)?.sourceOrdinal;
    return {
      rows: window,
      hasMore: last !== undefined && all.some((row) => row.sourceOrdinal > last),
      hasPrevious: first !== undefined && all.some((row) => row.sourceOrdinal < first),
      totalRows: all.length,
    };
  });
  const repository = {
    sealForRead: vi.fn().mockResolvedValue(seal),
    runState: vi.fn(),
    poolFrozenAt: vi.fn().mockResolvedValue(null),
    admittedRequestedSpec: vi.fn().mockResolvedValue(null),
    rows,
    observationSeries: vi.fn(),
    verifyRetainedImport: vi.fn().mockResolvedValue(seal.retainedImportDigest),
  };
  return { repository, service: new ResearchCurrentSourceService({ ...repository, searchInputs: mockSearchInputs(repository) } as never, config as never) };
}

const realSeal = sealRow(real.summary, real.table_rows);
const realTables = real.rows;

describe("W3 real-HMD fixture enters through the private ingest schemas", () => {
  it("every exported row and the seal summary validate; the W1 seal still validates", () => {
    for (const [kind, rows] of Object.entries(real.rows) as Array<[Kind, CurrentSourceStoredRow[]]>) {
      for (const row of rows) expect(currentSourceRowMatchesKind(kind, row), `${kind} ${row.sourceId}`).toBe(true);
    }
    expect(CurrentSourceSummarySchema.safeParse(real.summary).success).toBe(true);
    expect(CurrentSourceSummarySchema.safeParse(w1.seal.summary).success).toBe(true);
  });

  it("refuses a fact block that is not the declared shape", () => {
    const fold = structuredClone(real.rows.FOLD[0]!);
    (fold.payload.fold_facts as Record<string, unknown>).oos_score = { oos_sharpe: 0 };
    expect(currentSourceRowMatchesKind("FOLD", fold)).toBe(false);
    const trial = structuredClone(real.rows.TRIAL[0]!);
    (trial.payload.trial_facts as Record<string, unknown>).objective_kind = "GUESSED";
    expect(currentSourceRowMatchesKind("TRIAL", trial)).toBe(false);
  });
});

describe("W3 · S04 evidence: claim strip and fold verdicts (CG-P13-07/08)", () => {
  it("publishes QuantBT's own claim tokens and the versioned fold verdicts, valid in Zod and OpenAPI", async () => {
    const { service } = memory(realSeal, realTables);
    const evidence = sealed<ResearchCurrentSourceEvidenceResponse>(await service.evidence(scope, real.run_id));
    expect(ResearchCurrentSourceEvidenceResponseSchema.safeParse(evidence).success).toBe(true);
    openApiValidator("research-current-source.openapi.json", "Evidence").assert(evidence);

    expect(evidence.claim.validation_claim).toMatchObject({ value: "walk_forward_oos", state: "AVAILABLE" });
    expect(evidence.claim.chronological_claim.value).toBe("not_causal_multi_fold_global_calibration");
    expect(evidence.claim.causality_claim.value).toBe("retrospective_global_calibration");
    expect(evidence.claim.oos_used_for_selection.value).toBe(true);
    expect(evidence.claim.execution_contract).toMatchObject({ value: "close_target_v2", signal_phase: "bar_close", fill_phase: "same_close" });
    expect(evidence.claim.runtime_authority).toMatchObject({ value: "native_vectorized", final_account_runtime: "numba_units_v2" });
    expect(evidence.claim.runtime_authority.promotion_reason.state).toBe("NOT_PUBLISHED");
    expect(evidence.claim.holdout).toMatchObject({ value: null, state: "NOT_APPLICABLE", reason_code: "P10_DELTA_WFO_PROFILE_HAS_NO_HOLDOUT_SEGMENT" });

    const verdicts = evidence.fold_verdicts;
    expect(verdicts.rule).toEqual(FOLD_VERDICT_RULE);
    expect(verdicts.counts).toEqual({ folds: 2, pass: 0, warn: 0, drag: 2, not_evaluated: 0 });
    // Worst first: both DRAG, fold 0 has the lower S_OOS (−7.80 vs −2.91).
    expect(verdicts.rows.map((row) => row.fold_id)).toEqual(["0", "1"]);
    for (const row of verdicts.rows) {
      const expected = real.expected.folds.find((fold) => fold.fold_id === row.fold_id)!;
      expect(row.oos_sharpe).toBe(expected.oos_sharpe);
      expect(row.decay).toBe(expected.decay);
      expect(Number(row.oos_trades)).toBe(Number(expected.oos_trade_count));
      expect(row.verdict).toBe("DRAG");
      expect(row.drag_target).toBe("search");
      expect(row.failed_criteria).toContain("OOS_SHARPE");
    }
    expect(verdicts.mean_oos_sharpe).toBe("-5.354970424211971");
    expect(verdicts.mean_decay).toBe("3.911439612138451");

    /* E11 (audit 04-6): the run's OOS trade count is the sum of the published
       per-fold counts, under the same score basis as the means. */
    expect(verdicts.total_oos_trades).toEqual({
      state: "AVAILABLE",
      reason_code: null,
      availability: { state: "AVAILABLE", reason_code: null },
      value: real.expected.folds.reduce((sum, fold) => sum + Number(fold.oos_trade_count), 0),
      basis: "SUM_OF_PUBLISHED_FOLD_OOS_TRADE_COUNTS_V1",
      folds_counted: 2,
      folds: 2,
    });

    /* E11 (audit 04-7, 04-10): the lane names what it structurally lacks, so
       Screen 04 states it instead of leaving a legend one series short. */
    expect(evidence.source_absences.in_sample_account).toMatchObject({
      state: "NOT_PUBLISHED", reason_code: "QUANTBT_ADVANCED_WFO_RETAINED_NO_IN_SAMPLE_ACCOUNT",
    });
    expect(evidence.source_absences.rolling_sharpe).toMatchObject({
      state: "NOT_PUBLISHED", reason_code: "RS02_SOURCE_PREDATES_RETAINED_ANALYTICS",
    });
  });

  it("E11: withholds the OOS trade total rather than publishing a partial sum", async () => {
    /* One fold predates the W3 fact block, so it retained no trade count; the
       sum would be the other fold's alone, wearing the run's name. */
    const folds = real.rows.FOLD.map((row, index) => index !== 0 ? row : {
      ...row,
      payload: Object.fromEntries(Object.entries(row.payload).filter(([key]) => key !== "fold_facts")),
    });
    const { service } = memory(realSeal, { ...realTables, FOLD: folds } as never);
    const evidence = sealed<ResearchCurrentSourceEvidenceResponse>(await service.evidence(scope, real.run_id));
    expect(evidence.fold_verdicts.total_oos_trades).toMatchObject({
      state: "NOT_PUBLISHED",
      reason_code: "QUANTBT_DID_NOT_RETAIN_EVERY_FOLD_OOS_TRADE_COUNT",
      value: null,
      folds_counted: 1,
      folds: 2,
    });
  });

  it("P13-T08: every required S04 field carries a value or a typed absence, never a silent null", async () => {
    for (const [label, seal, tables] of [
      ["real W3", realSeal, realTables],
      ["pre-W3 seal", sealRow(w1.seal.summary, w1.seal.table_rows), {
        FOLD: real.rows.FOLD.map((row) => ({ ...row, payload: Object.fromEntries(Object.entries(row.payload).filter(([key]) => key !== "fold_facts")) })),
        CANDIDATE: real.rows.CANDIDATE.map((row) => ({ ...row, payload: Object.fromEntries(Object.entries(row.payload).filter(([key]) => key !== "trial_facts")) })),
      }],
    ] as const) {
      const { service } = memory(seal as CurrentSourceSealRow, tables as never);
      const evidence = sealed<ResearchCurrentSourceEvidenceResponse>(await service.evidence(scope, real.run_id));
      for (const [key, value] of Object.entries(evidence.claim)) {
        if (key === "schema_version") continue;
        const claim = value as { value: unknown; state: string; reason_code: string | null };
        if (claim.value === null) expect(claim.reason_code, `${label} ${key}`).toMatch(/^[A-Z][A-Z0-9_]+$/);
        else expect(claim.state, `${label} ${key}`).toBe("AVAILABLE");
      }
      for (const row of evidence.fold_verdicts.rows) {
        if (row.verdict === "NOT_EVALUATED") expect(row.reason_code, label).toMatch(/^[A-Z][A-Z0-9_]+$/);
        else for (const field of ["oos_sharpe", "decay", "max_drawdown_fraction"] as const) expect(row[field], `${label} ${field}`).not.toBeNull();
      }
      if (label === "pre-W3 seal") {
        expect(evidence.fold_verdicts).toMatchObject({ state: "NOT_PUBLISHED", reason_code: "RS02_SEAL_PREDATES_W3_SOURCE_FACTS_V1" });
        expect(evidence.fold_verdicts.rows.every((row) => row.oos_sharpe === null && row.verdict === "NOT_EVALUATED")).toBe(true);
        expect(evidence.claim.validation_claim.reason_code).toBe("RS02_SEAL_PREDATES_W3_SOURCE_FACTS_V1");
      }
    }
  });

  it("applies spec 04 §24 exactly (parity table the frontend never recomputes)", () => {
    expect(evaluateFold(1.2, 0.1, -0.05)).toEqual({ verdict: "PASS", failed: [], dragTarget: null });
    expect(evaluateFold(0.6, 0.35, -0.15)).toEqual({ verdict: "PASS", failed: [], dragTarget: null });
    expect(evaluateFold(0.45, 0.1, -0.05)).toEqual({ verdict: "WARN", failed: ["OOS_SHARPE"], dragTarget: null });
    expect(evaluateFold(1.0, 0.5, -0.05)).toEqual({ verdict: "WARN", failed: ["DECAY"], dragTarget: null });
    expect(evaluateFold(1.0, 0.1, -0.2)).toEqual({ verdict: "WARN", failed: ["MAX_DRAWDOWN"], dragTarget: null });
    expect(evaluateFold(1.0, 0.8, -0.05)).toEqual({ verdict: "DRAG", failed: ["DECAY"], dragTarget: "search" });
    expect(evaluateFold(1.0, 0.1, -0.3)).toEqual({ verdict: "DRAG", failed: ["MAX_DRAWDOWN"], dragTarget: "execute" });
    expect(evaluateFold(0.1, 0.1, -0.05)).toEqual({ verdict: "DRAG", failed: ["OOS_SHARPE"], dragTarget: null });
    expect(evaluateFold(0.45, 0.5, -0.05)).toEqual({ verdict: "DRAG", failed: ["OOS_SHARPE", "DECAY"], dragTarget: "search" });
  });
});

describe("W3 · S04 series envelope (CG-P13-05)", () => {
  it("serves every retained observation up to 2000 and names the whole-relation extrema", async () => {
    const observations: CurrentSourceStoredRow[] = [100, 104, 97, 101, 110, 108].map((equity, ordinal, all) => {
      const peak = Math.max(...all.slice(0, ordinal + 1));
      return {
        sourceOrdinal: ordinal,
        sourceId: new Date(1_782_864_000_000 + ordinal * 3_600_000).toISOString().replace(".000Z", "Z"),
        occurredAtUtcMs: 1_782_864_000_000 + ordinal * 3_600_000,
        payload: {
          source_index_utc: new Date(1_782_864_000_000 + ordinal * 3_600_000).toISOString().replace(".000Z", "Z"),
          at_utc_ms: 1_782_864_000_000 + ordinal * 3_600_000,
          equity: String(equity), return_fraction: "0", accepted_position: "0",
          drawdown_fraction: String(equity / peak - 1), signal_target: null,
        },
      };
    });
    const seal = sealRow(real.summary, { ...real.table_rows, OBSERVATION: observations.length });
    const { service, repository } = memory(seal, { ...realTables, OBSERVATION: observations });
    repository.observationSeries.mockResolvedValue({ rows: observations, sampling: "FULL", extremaEmitted: true });
    const series = sealed(await service.evidenceSeries(scope, real.run_id, "EQUITY")) as { source_sample: { envelope: Record<string, unknown>; sampling: string }; values: unknown[] };
    expect(ResearchCurrentSourceEvidenceSeriesResponseSchema.safeParse(series).success).toBe(true);
    openApiValidator("research-current-source.openapi.json", "EvidenceSeries").assert(series);
    expect(repository.observationSeries).toHaveBeenCalledWith(scope, real.run_id, 1, observations.length, 2_000, undefined);
    expect(series.values).toHaveLength(6);
    expect(series.source_sample.envelope).toMatchObject({
      first_equity: "100", last_equity: "108", min_equity: "97", max_equity: "110",
      min_equity_at_utc_ms: 1_782_864_000_000 + 2 * 3_600_000,
      min_drawdown_at_utc_ms: 1_782_864_000_000 + 2 * 3_600_000,
      extrema_emitted: true,
    });
  });
});

describe("W3 · S05 split: fold anatomy and guards (CG-P14-02)", () => {
  it("publishes QuantBT's per-fold windows and run-level guards; nested inner folds are not applicable", async () => {
    const { service } = memory(realSeal, realTables);
    const split = sealed<ResearchCurrentSourceSplitResponse>(await service.split(scope, real.run_id));
    expect(ResearchCurrentSourceSplitResponseSchema.safeParse(split).success).toBe(true);
    openApiValidator("research-current-source.openapi.json", "Split").assert(split);
    expect(split.fold_plan.folds.map((fold) => [fold.anatomy.train_bars, fold.anatomy.test_bars])).toEqual([[720, 168], [888, 168]]);
    for (const fold of split.fold_plan.folds) {
      expect(fold.anatomy.state).toBe("AVAILABLE");
      for (const window of [fold.anatomy.warmup, fold.anatomy.label_horizon, fold.anatomy.purge, fold.anatomy.embargo]) {
        expect(window).toEqual({ state: "AVAILABLE", reason_code: null, bars: 0, start_utc_ms: null, end_utc_ms: null });
      }
      expect(fold.anatomy.account_policy).toBe("carry_position");
      expect(fold.anatomy.cutoff_utc_ms).toBe(fold.test_end_utc_ms);
    }
    expect(split.guards).toEqual({
      label_horizon_bars: { value: 0, state: "AVAILABLE", reason_code: null },
      purge_bars: { value: 0, state: "AVAILABLE", reason_code: null },
      embargo_bars: { value: 0, state: "AVAILABLE", reason_code: null },
      warmup_policy: { value: "none", state: "AVAILABLE", reason_code: null },
      warmup_bars: { value: null, state: "NOT_APPLICABLE", reason_code: "QUANTBT_WARMUP_POLICY_IS_NONE" },
      inner_folds: { value: null, state: "NOT_APPLICABLE", reason_code: "QUANTBT_SCHEDULE_HAS_NO_NESTED_INNER_VALIDATION" },
      oos_used_for_selection: { value: true, state: "AVAILABLE", reason_code: null },
      train_test_disjoint: {
        verdict: "PASS", basis: "RETAINED_FOLD_UTC_WINDOWS_AND_PUBLISHED_TEMPORAL_GUARDS_V1", reason_code: null,
      },
    });
    expect(split.fold_plan.folds.map((fold) => fold.score)).toEqual(real.expected.folds.map((fold) => expect.objectContaining({
      state: "AVAILABLE", oos_sharpe: fold.oos_sharpe, decay: fold.decay,
    })));
    expect(Object.values(split.data_use).map((fact) => fact.state)).toEqual(["AVAILABLE", "AVAILABLE", "AVAILABLE", "AVAILABLE"]);
  });

  it("a pre-W3 fold row reads as a typed absence, never as zero bars", async () => {
    const tables = { ...realTables, FOLD: real.rows.FOLD.map((row) => ({ ...row, payload: Object.fromEntries(Object.entries(row.payload).filter(([key]) => key !== "fold_facts")) })) };
    const { service } = memory(sealRow(w1.seal.summary, w1.seal.table_rows), tables);
    const split = sealed<ResearchCurrentSourceSplitResponse>(await service.split(scope, real.run_id));
    for (const fold of split.fold_plan.folds) {
      expect(fold.anatomy).toMatchObject({ state: "NOT_PUBLISHED", reason_code: "RS02_RETAINED_ROW_PREDATES_W3_FACT_BLOCK_V1", train_bars: null });
      expect(fold.anatomy.purge.bars).toBeNull();
      expect(fold.score).toMatchObject({ state: "NOT_PUBLISHED", oos_sharpe: null });
    }
    expect(split.guards.purge_bars).toEqual({ value: null, state: "NOT_PUBLISHED", reason_code: "RS02_SEAL_PREDATES_W3_SOURCE_FACTS_V1" });
  });
});

describe("W3 · S06 search: ledger, roles, diagnostics (CG-P15-03/04)", () => {
  it("each trial carries its own parameters and a labelled objective; the selected J is not a trial's IS score", async () => {
    const { service } = memory(realSeal, realTables);
    const search = sealed<ResearchCurrentSourceSearchResponse>(await service.search(scope, real.run_id, { limit: 100 }));
    expect(ResearchCurrentSourceSearchResponseSchema.safeParse(search).success).toBe(true);
    openApiValidator("research-current-source.openapi.json", "Search").assert(search);
    for (const trial of search.ledger.trials) {
      expect(Object.keys(trial.parameters)).toHaveLength(8);
      expect(trial.objective).toBe(real.expected.trials[trial.trial_id]);
      expect(trial.state).toBe("COMPLETE");
      expect(trial.facts).toMatchObject({ state: "AVAILABLE", stage: "is_search", objective_kind: "IS_MEAN_SHARPE",
        fold_scope: { kind: "ALL_OUTER_FOLDS", fold_id: null } });
      // The IS search never scores OOS: QuantBT's 0.0 placeholder is not served.
      expect(trial.facts.metrics.mean_oos_sharpe).toEqual({ value: null, reason_code: "QUANTBT_IS_SEARCH_STAGE_DOES_NOT_EVALUATE_OOS" });
    }
    expect(search.selection).toMatchObject({ selected_trial_id: "0", objective: real.expected.selection.objective, objective_kind: "MODE_1_DECAY_J" });
    expect(search.selection.parameters).toEqual(real.expected.selection.parameters);
    expect(search.selection.roles.raw_best_is).toMatchObject({ trial_id: "0", objective: "-1.4435308120735202", objective_kind: "IS_MEAN_SHARPE" });
    expect(search.selection.roles.selected).toMatchObject({ trial_id: "0", objective: "-9.806075711302508", objective_kind: "MODE_1_DECAY_J" });
    expect(search.selection.roles.raw_best_is_equals_selected).toBe(true);
    expect(search.candidates.rows[0]!.facts).toMatchObject({ stage: "oos_candidate_selection", objective_kind: "MODE_1_DECAY_J", source_trial_id: "0" });
    expect(search.candidates.rows[0]!.facts.metrics.mean_oos_sharpe.value).toBe("-5.354970424211971");
    expect(search.search_contract).toMatchObject({ optimization_schedule: "global", n_studies: 1, optuna_trials_scope: "global", trial_ledger_mode: "compact",
      validation_claim: "walk_forward_oos", oos_used_for_selection: true, scoring_backend: "endpoint" });
  });

  it("P15-T04/T05/T08: constraints do not arise (no constraints function), dedupe and sampler/warm-start stay typed absences; the probe recomposes every objective", async () => {
    const { service } = memory(realSeal, realTables);
    const search = sealed<ResearchCurrentSourceSearchResponse>(await service.search(scope, real.run_id, { limit: 100 }));
    for (const row of [...search.ledger.trials, ...search.candidates.rows]) {
      expect(row.facts.constraints).toMatchObject({ state: "NOT_APPLICABLE", reason_code: "QUANTBT_WALK_FORWARD_STUDY_DECLARES_NO_CONSTRAINTS" });
      expect(row.facts.feasible).toMatchObject({ state: "NOT_APPLICABLE", reason_code: "QUANTBT_WALK_FORWARD_STUDY_DECLARES_NO_CONSTRAINTS" });
      expect(row.facts.objective_components.state).toBe("AVAILABLE");
    }
    expect(search.diagnostics.objective_components.state).toBe("AVAILABLE");
    expect(search.diagnostics.prune_reasons).toMatchObject({ state: "NOT_APPLICABLE", reason_code: "NO_TRIAL_WAS_PRUNED" });
    expect(search.diagnostics.importance.state).toBe("NOT_PUBLISHED");
    expect(search.diagnostics.probe).toMatchObject({
      objective_rows: 4, objective_rows_recomposed: 4, pruned_trial_count: 0,
      sampler: { state: "NOT_PUBLISHED", reason_code: "QUANTBT_WALK_FORWARD_DID_NOT_PUBLISH_SAMPLER_TRACE" },
      warm_start: { state: "NOT_PUBLISHED" },
      dedupe: { state: "NOT_PUBLISHED", reason_code: "QUANTBT_DUPLICATE_PRUNER_DOES_NOT_PUBLISH_A_DEDUPE_REASON" },
    });
    const candidate = search.candidates.rows[0]!.facts.objective_components;
    expect(candidate.formula).toBe("MODE_1_DECAY_OOS_MEAN_MINUS_LAMBDA_STD_MINUS_GAMMA_POSITIVE_DECAY");
    expect(candidate.terms.reduce((sum, term) => sum + Number(term.contribution), 0)).toBeCloseTo(Number(search.selection.objective), 12);
  });

  it("P15-T05/T12: a pruned row is typed PRUNED, prune reasons turn NOT_PUBLISHED, and totals reconcile", async () => {
    const trials = structuredClone(real.rows.TRIAL);
    trials[2]!.payload.state = "PRUNED";
    (trials[2]!.payload.trial_facts as { pruned: boolean }).pruned = true;
    const summary = structuredClone(real.summary) as { source_facts: { search: { pruned_trial_count: number } } };
    summary.source_facts.search.pruned_trial_count = 1;
    const { service } = memory(sealRow(summary as never, real.table_rows), { ...realTables, TRIAL: trials });
    const search = sealed<ResearchCurrentSourceSearchResponse>(await service.search(scope, real.run_id, { limit: 100 }));
    const states = search.ledger.trials.map((trial) => trial.state);
    expect(states).toEqual(["COMPLETE", "COMPLETE", "PRUNED"]);
    expect(search.diagnostics.prune_reasons).toMatchObject({ state: "NOT_PUBLISHED", reason_code: "QUANTBT_PUBLISHES_A_PRUNED_FLAG_WITHOUT_A_REASON" });
    expect(search.diagnostics.probe.pruned_trial_count).toBe(states.filter((state) => state === "PRUNED").length);
    expect(search.ledger.source_trial_count).toBe(states.length);
    expect(search.selection.roles.candidate_source_trial_ids).toContain(search.selection.selected_trial_id);
    expect(search.candidates.source_candidate_count).toBe(search.candidates.rows.length);
  });

  it("P15-T07: a limit-1 keyset walk reaches every row and reconciles the count, also under a fold filter", async () => {
    const { service } = memory(realSeal, realTables);
    for (const fold of [undefined, "0", "1"]) {
      const seen: string[] = [];
      let cursor: string | undefined;
      for (let guard = 0; guard < 10; guard += 1) {
        const page = sealed<ResearchCurrentSourceSearchResponse>(await service.search(scope, real.run_id, {
          limit: 1, ...(cursor ? { cursor } : {}), ...(fold ? { fold } : {}),
        }));
        seen.push(...page.ledger.trials.map((trial) => trial.trial_id));
        expect(page.ledger.fold_filter).toEqual({ fold_id: fold ?? null, rule: "TRIAL_FOLD_SCOPE_COVERS_FOLD", matched_rows: 3 });
        if (!page.ledger.page.next_cursor) break;
        cursor = page.ledger.page.next_cursor;
      }
      expect(seen).toEqual(["0", "1", "2"]);
      expect(seen).toHaveLength(real.table_rows.TRIAL);
    }
    const foldZero = sealed<ResearchCurrentSourceSearchResponse>(await service.search(scope, real.run_id, { limit: 1, fold: "0" }));
    await expect(service.search(scope, real.run_id, { limit: 1, fold: "1", cursor: foldZero.ledger.page.next_cursor! }))
      .rejects.toMatchObject({ code: "RESEARCH_CURRENT_SOURCE_INVALID", status: 400 });
    await expect(service.search(scope, real.run_id, { limit: 1, fold: "9" }))
      .rejects.toMatchObject({ code: "RESEARCH_CURRENT_SOURCE_INVALID", status: 400 });
  });

  it("P15-T02/T03: no selection is never replaced by the raw best; a missing objective is null, never 0", async () => {
    const summary = structuredClone(real.summary) as { selection: { trial_id: string | null; objective: string | null } };
    summary.selection.trial_id = null;
    summary.selection.objective = null;
    const trials = structuredClone(real.rows.TRIAL);
    trials[1]!.payload.objective = null;
    const { service } = memory(sealRow(summary as never, real.table_rows), { ...realTables, TRIAL: trials });
    const search = sealed<ResearchCurrentSourceSearchResponse>(await service.search(scope, real.run_id, { limit: 100 }));
    expect(search.selection.selected_trial_id).toBeNull();
    expect(search.selection.roles.selected).toMatchObject({ trial_id: null, objective: null });
    expect(search.selection.roles.raw_best_is.trial_id).toBe("0");
    expect(search.selection.roles.raw_best_is_equals_selected).toBeNull();
    expect(search.ledger.trials[1]!.objective).toBeNull();
  });

  it("P15-T11: a centroid selector without a published centroid names the gap and invents no trial id", async () => {
    const summary = structuredClone(real.summary) as { source_facts: { search: { candidate_selection_metric: string } } };
    const { service: decay } = memory(realSeal, realTables);
    const decaySearch = sealed<ResearchCurrentSourceSearchResponse>(await decay.search(scope, real.run_id, { limit: 100 }));
    expect(decaySearch.selection.roles.centroid).toEqual({ state: "NOT_APPLICABLE", reason_code: "QUANTBT_SELECTOR_HAS_NO_CENTROID", trial_id: null, objective: null, objective_kind: "NOT_PUBLISHED" });
    summary.source_facts.search.candidate_selection_metric = "is_plateau_robust";
    const { service: plateau } = memory(sealRow(summary as never, real.table_rows), realTables);
    const plateauSearch = sealed<ResearchCurrentSourceSearchResponse>(await plateau.search(scope, real.run_id, { limit: 100 }));
    expect(plateauSearch.selection.roles.centroid).toMatchObject({ state: "NOT_PUBLISHED", reason_code: "QUANTBT_DID_NOT_PUBLISH_THE_PLATEAU_CENTROID", trial_id: null });
  });

  it("P15-T06: one admitted study; every trial is scoped to all outer folds by id, not by ordinal", async () => {
    const { service } = memory(realSeal, realTables);
    const search = sealed<ResearchCurrentSourceSearchResponse>(await service.search(scope, real.run_id, { limit: 100 }));
    expect(search.search_contract.n_studies).toBe(1);
    expect(new Set(search.ledger.trials.map((trial) => trial.trial_id)).size).toBe(search.ledger.trials.length);
    expect(search.ledger.trials.every((trial) => trial.facts.fold_scope.kind === "ALL_OUTER_FOLDS")).toBe(true);
  });

  it("a pre-W3 trial row keeps parameters and objective but every new fact is a typed absence", async () => {
    const trials = real.rows.TRIAL.map((row) => ({ ...row, payload: Object.fromEntries(Object.entries(row.payload).filter(([key]) => key !== "trial_facts")) }));
    const candidates = real.rows.CANDIDATE.map((row) => ({ ...row, payload: Object.fromEntries(Object.entries(row.payload).filter(([key]) => key !== "trial_facts")) }));
    const { service } = memory(sealRow(w1.seal.summary, w1.seal.table_rows), { ...realTables, TRIAL: trials, CANDIDATE: candidates });
    const search = sealed<ResearchCurrentSourceSearchResponse>(await service.search(scope, real.run_id, { limit: 100 }));
    expect(ResearchCurrentSourceSearchResponseSchema.safeParse(search).success).toBe(true);
    for (const trial of search.ledger.trials) {
      expect(trial.facts).toMatchObject({ state: "NOT_PUBLISHED", reason_code: "RS02_RETAINED_ROW_PREDATES_W3_FACT_BLOCK_V1", objective_kind: "NOT_PUBLISHED" });
      expect(trial.facts.metrics.mean_is_sharpe.value).toBeNull();
    }
    expect(search.selection.roles.raw_best_is.state).toBe("NOT_PUBLISHED");
    expect(search.diagnostics.objective_components.reason_code).toBe("RS02_SEAL_PREDATES_W3_SOURCE_FACTS_V1");
  });
});
