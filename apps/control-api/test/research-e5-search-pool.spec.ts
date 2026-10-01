/**
 * E5 · Screen 06 Stage B (HiFi audit 6.7, 6.8, 6.10, 6.11): the pool a
 * retained WFO run froze, θ*'s per-fold decay and each candidate's max
 * drawdown — every value from the sealed ledger, or a typed absence.
 *
 * Fixtures: the W5b real signal-notional WFO seal and the W3 real WFO seal
 * (both QuantBT 1.1.1, mode_1_decay · global · robust_decay, 3 trials,
 * top_is_fraction 0.1, top_is_k not configured).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";

import {
  ResearchCurrentSourceSearchResponseSchema,
  type ResearchCurrentSourceNotApplicableResponse,
  type ResearchCurrentSourceSearchResponse,
} from "../src/research/current-source.contract";
import type { CurrentSourceSealRow, CurrentSourceStoredRow } from "../src/research/current-source.repository";
import { ResearchCurrentSourceService } from "../src/research/current-source.service";
import { POOL_REASONS, SEARCH_POOL_RULE, candidateDrawdown, quantbtPoolSize } from "../src/research/current-source-pool";
import { sha256ResearchJson } from "../src/research/preflight.service";
import { openApiValidator } from "./research-rf05-openapi";
import { wfoRequested } from "./research-w1-wfo.fixture";

type Kind = "OBSERVATION" | "FOLD" | "TRIAL" | "CANDIDATE" | "SELECTION";
interface Fixture {
  run_id: string;
  table_rows: Record<Kind, number>;
  manifest_digest: string;
  source_transform_digest: string;
  summary: Record<string, any>;
  rows: Record<Kind, CurrentSourceStoredRow[]>;
}

const w5b = JSON.parse(gunzipSync(readFileSync(join(__dirname, "research-w5b-real-replay.fixture.json.gz"))).toString("utf8")) as Fixture;
const w3 = JSON.parse(readFileSync(join(__dirname, "research-w3-real-hmd-seal.fixture.json"), "utf8")) as Fixture;
const scope = { workspaceId: "ws-e5", actorUserId: "usr-e5" };
const config = {
  FEATURE_RESEARCH_CURRENT_SOURCE: "true",
  QUERY_CURSOR_ACTIVE_KEY_ID: "query-k1",
  QUERY_CURSOR_KEYS_JSON: '{"query-k1":"current-source-test-key-is-at-least-32-bytes"}',
  QUERY_CURSOR_TTL_SECONDS: 900,
};
const searchValidator = openApiValidator("research-current-source.openapi.json", "Search");

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function serviceFor(fixture: Fixture, requestedSpec: Record<string, unknown> | null = null) {
  const seal: CurrentSourceSealRow = {
    runId: fixture.run_id,
    artifactRevision: 1,
    sourceAdapterId: "rs02.quantbt-signal-notional-wfo.v1",
    profileId: "rs02.delta-signal-notional-wfo.v1",
    manifestDigest: fixture.manifest_digest,
    sourceTransformDigest: fixture.source_transform_digest,
    retainedImportDigest: "f".repeat(64),
    requestedSpecDigest: "1".repeat(64),
    effectiveSpecDigest: "2".repeat(64),
    datasetBindingDigest: "3".repeat(64),
    tableRows: fixture.table_rows,
    totalRows: Object.values(fixture.table_rows).reduce((sum, n) => sum + n, 0),
    summary: fixture.summary,
    retainedAtUtcMs: 1_790_269_236_911,
  };
  const sorted = (kind: Kind) => [...(fixture.rows[kind] ?? [])].sort((a, b) => a.sourceOrdinal - b.sourceOrdinal);
  const repository = {
    sealForRead: vi.fn().mockResolvedValue(seal),
    runState: vi.fn(),
    poolFrozenAt: vi.fn().mockResolvedValue(1_790_269_230_000),
    admittedRequestedSpec: vi.fn().mockResolvedValue(requestedSpec),
    rows: vi.fn(async (_s: unknown, _r: string, _v: number, kind: Kind, selection: { limit: number }) => {
      const all = sorted(kind);
      return { rows: all.slice(0, selection.limit), hasMore: all.length > selection.limit, hasPrevious: false, totalRows: all.length };
    }),
    verifyRetainedImport: vi.fn().mockResolvedValue("f".repeat(64)),
  };
  return new ResearchCurrentSourceService(repository as never, config as never);
}

async function search(fixture: Fixture): Promise<ResearchCurrentSourceSearchResponse> {
  const value = (await serviceFor(fixture).search(scope, fixture.run_id, { limit: 100 } as never)) as
    | ResearchCurrentSourceSearchResponse
    | ResearchCurrentSourceNotApplicableResponse;
  expect(value.schema_version).toBe("research.current-source-search.v1");
  expect(ResearchCurrentSourceSearchResponseSchema.safeParse(value).success).toBe(true);
  searchValidator.assert(value);
  return value as ResearchCurrentSourceSearchResponse;
}

/** A copy of `fixture` whose sealed search facts are replaced by `patch`. */
function withSearchFacts(fixture: Fixture, patch: Record<string, unknown>): Fixture {
  const next = clone(fixture);
  Object.assign(next.summary.source_facts.search, patch);
  return next;
}

describe("E5 · 6.7/6.8 the frozen pool, from the retained ledger", () => {
  it("S06 trial digest matches canonical selected θ*; the P08 seed is request-scoped, never per-trial", async () => {
    const request = wfoRequested();
    const value = await serviceFor(w5b, request).search(scope, w5b.run_id, { limit: 100 } as never);
    expect(value.schema_version).toBe("research.current-source-search.v1");
    const body = value as ResearchCurrentSourceSearchResponse;
    expect(body.search_contract.requested_seed).toEqual({
      value: 42, scope: "ADMITTED_RUN_REQUEST_BASE_SEED", availability: { state: "AVAILABLE", reason_code: null },
    });
    for (const trial of body.ledger.trials) {
      expect(trial.params_digest).toBe(sha256ResearchJson(trial.parameters));
      expect(trial.params_digest_source).toBe("PORTAL_CANONICAL_TRIAL_PARAMETERS_V1");
      expect("seed" in trial).toBe(false);
    }
    expect(body.ledger.trials.find((trial) => trial.trial_id === "0")?.params_digest)
      .toBe(sha256ResearchJson(w5b.summary.selection.parameters));
    expect((await search(w5b)).search_contract.requested_seed).toMatchObject({
      value: null, scope: "ADMITTED_RUN_REQUEST_BASE_SEED",
      availability: { state: "NOT_PUBLISHED", reason_code: "P08_REQUESTED_SPEC_NOT_RETAINED" },
    });
  });

  it("S06 selector confidence is source-confirmed only for a sealed metric; no Portal default is invented", async () => {
    const confirmed = await search(w5b);
    expect(confirmed.search_contract.selector_confidence).toEqual({
      state: "CONFIRMED", reason_code: null, source: "QUANTBT_SEALED_SEARCH_FACT",
    });
    const missing = await search(withSearchFacts(w5b, { candidate_selection_metric: null }));
    expect(missing.search_contract.selector_confidence).toEqual({
      state: "NOT_PUBLISHED", reason_code: "QUANTBT_SELECTOR_METRIC_NOT_IN_SEALED_SEARCH_FACT", source: null,
    });
  });

  it.each([["W5b", w5b], ["W3", w3]] as const)("%s real seal: 3 trials, feasible does not arise, K = 1 by ⌈3 × 0.1⌉, 1 re-evaluated on every outer fold, 1 selected", async (_name, fixture) => {
    const body = await search(fixture);
    expect(body.pool.frozen_at_utc_ms).toBe(1_790_269_230_000);
    expect(body.pool.frozen_at_source).toBe("P11_STAGE_COMPLETED_S4_EVENT");
    expect(body.pool.frozen_at_reason_code).toBeNull();
    expect(body.pool.schema_version).toBe(SEARCH_POOL_RULE);
    expect(body.pool.trials_evaluated).toEqual({ state: "AVAILABLE", value: 3, reason_code: null, source: "RETAINED_TRIAL_LEDGER" });
    expect(body.pool.scored_unpruned).toEqual({ state: "AVAILABLE", value: 3, reason_code: null, source: "RETAINED_TRIAL_LEDGER" });
    expect(body.pool.feasible).toEqual({ state: "NOT_APPLICABLE", value: null, reason_code: POOL_REASONS.noConstraints, source: null });
    expect(body.pool.top_is_k).toEqual({ state: "AVAILABLE", value: 1, reason_code: null, source: "RETAINED_CANDIDATE_LEDGER" });
    expect(body.pool.rule).toEqual({
      state: "AVAILABLE",
      reason_code: null,
      expression: "CEIL_N_TIMES_TOP_IS_FRACTION",
      n: 3,
      top_is_fraction: "0.1",
      configured_top_is_k: null,
      k: 1,
    });
    expect(body.pool.reevaluated).toEqual({ state: "AVAILABLE", value: 1, reason_code: null, source: "RETAINED_CANDIDATE_LEDGER" });
    expect(body.pool.reevaluation_scope).toBe("ALL_OUTER_FOLDS");
    expect(body.pool.selected).toEqual({ state: "AVAILABLE", value: 1, reason_code: null, source: "RETAINED_SELECTION" });
  });

  it("6.7: search_contract.top_is_k is the retained K — no longer null on the real WFO run; the configured value stays null in the seal", async () => {
    expect(w5b.summary.source_facts.search.top_is_k).toBeNull();
    const body = await search(w5b);
    expect(body.search_contract.top_is_k).toBe(1);
    expect(body.search_contract.top_is_fraction).toBe("0.1");
  });

  it("publishes no K when the ledger and QuantBT's rule describe different pools (fraction 0.9 → ⌈2.7⌉ = 3 ≠ 1 candidate)", async () => {
    const body = await search(withSearchFacts(w5b, { top_is_fraction: "0.9" }));
    expect(body.pool.top_is_k).toEqual({ state: "NOT_PUBLISHED", value: null, reason_code: POOL_REASONS.poolDisagrees, source: null });
    expect(body.pool.rule).toMatchObject({ state: "NOT_PUBLISHED", reason_code: POOL_REASONS.poolDisagrees, n: 3, k: 3 });
    expect(body.search_contract.top_is_k).toBeNull();
  });

  it("a configured top_is_k sizes the pool by QuantBT's other branch, and still must match the ledger", async () => {
    const agrees = await search(withSearchFacts(w5b, { top_is_k: 1 }));
    expect(agrees.pool.rule).toMatchObject({ state: "AVAILABLE", expression: "CONFIGURED_TOP_IS_K", configured_top_is_k: 1, k: 1 });
    expect(agrees.pool.top_is_k.value).toBe(1);
    const disagrees = await search(withSearchFacts(w5b, { top_is_k: 2 }));
    expect(disagrees.pool.top_is_k.state).toBe("NOT_PUBLISHED");
    expect(disagrees.search_contract.top_is_k).toBe(2);
  });

  it("a selector that prepends a robust pick to the pool leaves K a typed absence — the ledger no longer isolates the pool", async () => {
    const body = await search(withSearchFacts(w5b, { candidate_selection_metric: "is_plateau_robust" }));
    expect(body.pool.top_is_k).toEqual({ state: "NOT_PUBLISHED", value: null, reason_code: POOL_REASONS.poolNotIsolated, source: null });
    expect(body.pool.reevaluated.value).toBe(1);
  });

  it("no rule published → no K; a seal without facts answers every derived count with its reason, never a zero", async () => {
    const noRule = await search(withSearchFacts(w5b, { top_is_fraction: null, top_is_k: null }));
    expect(noRule.pool.top_is_k.reason_code).toBe(POOL_REASONS.poolRuleNotPublished);

    const bare = clone(w5b);
    delete bare.summary.source_facts;
    for (const kind of ["TRIAL", "CANDIDATE"] as const) for (const row of bare.rows[kind]) delete (row.payload as Record<string, unknown>).trial_facts;
    for (const row of bare.rows.FOLD) delete (row.payload as Record<string, unknown>).fold_facts;
    const body = await search(bare);
    expect(body.pool.trials_evaluated.value).toBe(3);
    expect(body.pool.scored_unpruned).toMatchObject({ state: "NOT_PUBLISHED", value: null, reason_code: POOL_REASONS.rowPredatesFacts });
    expect(body.pool.feasible).toMatchObject({ state: "NOT_PUBLISHED", value: null, reason_code: POOL_REASONS.sealPredatesFacts });
    expect(body.pool.top_is_k).toMatchObject({ state: "NOT_PUBLISHED", value: null, reason_code: POOL_REASONS.sealPredatesFacts });
    expect(body.pool.reevaluated).toMatchObject({ state: "NOT_PUBLISHED", value: null, reason_code: POOL_REASONS.rowPredatesFacts });
    expect(body.pool.reevaluation_scope).toBe("NOT_PUBLISHED");
    expect(body.pool.per_fold_decay).toEqual({ state: "NOT_PUBLISHED", reason_code: POOL_REASONS.rowPredatesFacts, basis: null, rows: [] });
    expect(body.candidates.rows[0]!.max_drawdown).toMatchObject({ state: "NOT_PUBLISHED", value: null, reason_code: POOL_REASONS.rowPredatesFacts });
    expect(body.search_contract.top_is_k).toBeNull();
  });

  it("QuantBT's rule is evaluated in float64, as the engine evaluates it (25 × 0.28 → 8, not 7)", () => {
    expect(quantbtPoolSize(25, "0.28", null)).toBe(8);
    expect(quantbtPoolSize(3, "0.1", null)).toBe(1);
    expect(quantbtPoolSize(512, "0.1", null)).toBe(52);
    expect(quantbtPoolSize(3, "0.1", 9)).toBe(3);
    expect(quantbtPoolSize(0, "0.1", null)).toBe(0);
    expect(quantbtPoolSize(5, null, null)).toBeNull();
  });
});

describe("E5 · 6.10 θ*'s per-fold decay, verbatim", () => {
  it("serves QuantBT's selected-trial fold metrics in fold order — decay is the engine's d = S_IS − S_OOS, not recomputed", async () => {
    const body = await search(w5b);
    const folds = [...w5b.rows.FOLD].sort((a, b) => a.sourceOrdinal - b.sourceOrdinal);
    expect(body.pool.per_fold_decay.state).toBe("AVAILABLE");
    expect(body.pool.per_fold_decay.basis).toBe("QUANTBT_SELECTED_TRIAL_FOLD_METRICS_V1");
    expect(body.pool.per_fold_decay.rows).toEqual(folds.map((row) => {
      const score = (row.payload as any).fold_facts.oos_score;
      return { fold_id: (row.payload as any).fold_id, source_ordinal: row.sourceOrdinal, is_sharpe: score.is_sharpe, oos_sharpe: score.oos_sharpe, decay: score.decay };
    }));
    expect(body.pool.per_fold_decay.rows.map((row) => row.decay)).toEqual(["7.440447602747699", "0.3824316215292036"]);
  });

  it("one fold without a score makes the whole series a typed absence, not a shorter series", async () => {
    const partial = clone(w5b);
    (partial.rows.FOLD[1]!.payload as any).fold_facts.oos_score = null;
    const body = await search(partial);
    expect(body.pool.per_fold_decay).toEqual({ state: "NOT_PUBLISHED", reason_code: POOL_REASONS.noFoldScore, basis: null, rows: [] });
  });
});

describe("E5 · 6.11 candidates[].max_drawdown", () => {
  it("the selected candidate under the global schedule carries the stitched OOS path's drawdown, tagged with that source", async () => {
    const body = await search(w5b);
    expect(body.candidates.rows).toHaveLength(1);
    expect(body.candidates.rows[0]!.max_drawdown).toEqual({
      state: "AVAILABLE",
      value: w5b.summary.metrics.max_drawdown_fraction,
      reason_code: null,
      source: "RETAINED_STITCHED_OOS_PATH",
    });
  });

  it("any other candidate, or a schedule whose stitched path mixes θ*s, is a typed absence", () => {
    const facts = (w5b.rows.CANDIDATE[0]!.payload as any).trial_facts;
    const candidate = { candidateId: "0", objective: "-9.806075711302508", facts };
    const selection = { trial_id: "0", objective: "-9.806075711302508" };
    expect(candidateDrawdown({ candidate, selection: { trial_id: "7", objective: "1" }, schedule: "global", passportMaxDrawdown: "-0.1" }))
      .toEqual({ state: "NOT_PUBLISHED", value: null, reason_code: POOL_REASONS.candidateDrawdown, source: null });
    expect(candidateDrawdown({ candidate, selection, schedule: "per_fold_causal", passportMaxDrawdown: "-0.1" }))
      .toEqual({ state: "NOT_PUBLISHED", value: null, reason_code: POOL_REASONS.pathNotThisCandidate, source: null });
    expect(candidateDrawdown({ candidate, selection, schedule: "global", passportMaxDrawdown: "-0.1" }).value).toBe("-0.1");
  });
});

describe("E5 · the published canonical search fixture carries the pool", () => {
  it("matches what this service serves for the real W5b seal", async () => {
    const root = join(process.env.PORTAL_CONTRACTS_DIR ?? join(__dirname, "../../../packages/contracts"), "fixtures");
    const fixture = JSON.parse(readFileSync(join(root, "research-current-source.search-surface.valid.json"), "utf8"));
    const body = await search(w5b);
    expect(fixture.pool).toEqual(body.pool);
    expect(fixture.candidates.rows.map((row: { max_drawdown: unknown }) => row.max_drawdown)).toEqual(body.candidates.rows.map((row) => row.max_drawdown));
    expect(fixture.search_contract.top_is_k).toBe(1);
  });
});
