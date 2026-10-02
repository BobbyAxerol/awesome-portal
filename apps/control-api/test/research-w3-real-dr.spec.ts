/**
 * W3 · V11-P13/P14/P15-DR — opt-in real-data receipt.
 *
 * Run the real-HMD Python test with `PORTAL_W3_DR_EXPORT_DIR=<dir>` first; it
 * runs the QuantBT 1.1.1 Delta WFO through the P06 child on BTCUSDT 1h,
 * exports the exact rows the worker would POST plus a recomputation straight
 * from QuantBT's raw Parquet/JSON output, then set
 * `PORTAL_W3_DR_EXPORT=<dir>/w3-real-hmd-dr.json` here. This spec feeds those
 * rows through the private ingest schemas and the named readers, and requires
 * every served number to equal the raw recomputation: exact decimal equality
 * (after dropping trailing zeros), 1e-12 only on the float-recomputed fold
 * path facts.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { mockSearchInputs } from "./research-search-inputs.fixture";

import type {
  ResearchCurrentSourceEvidenceResponse,
  ResearchCurrentSourceSearchResponse,
  ResearchCurrentSourceSplitResponse,
} from "../src/research/current-source.contract";
import { CurrentSourceSummarySchema, currentSourceRowMatchesKind } from "../src/research/current-source.payload";
import type { CurrentSourceStoredRow, CurrentSourceTableKind } from "../src/research/current-source.repository";
import { ResearchCurrentSourceService } from "../src/research/current-source.service";

const exportPath = process.env.PORTAL_W3_DR_EXPORT;

interface DrExport {
  run_id: string;
  table_rows: Record<CurrentSourceTableKind, number>;
  manifest_digest: string;
  source_transform_digest: string;
  summary: Record<string, unknown>;
  batches: Array<{ table_kind: CurrentSourceTableKind; rows: CurrentSourceStoredRow[] }>;
  expected: {
    passport: { initial_equity: string; final_equity: string; max_drawdown_fraction: string };
    selection: { trial_id: string; objective: string; parameters: Record<string, string> };
    trials: Record<string, string>;
    folds: Array<{ fold_id: string; oos_sharpe: string; decay: string; oos_trade_count: string;
      return_fraction: number; max_drawdown_fraction: number; worst_return_fraction: number }>;
  };
}

/** Exact decimal text equality: "5.0" and "5" are the same decimal. */
function decimal(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return value.includes(".") ? value.replace(/0+$/, "").replace(/\.$/, "") : value;
}

describe.skipIf(!exportPath)("W3 real-HMD DR receipt (V11-P13/P14/P15-DR)", () => {
  it("serves exactly QuantBT's numbers for the passport, folds, trials and selection", async () => {
    const dr = JSON.parse(readFileSync(exportPath!, "utf8")) as DrExport;
    const tables: Partial<Record<CurrentSourceTableKind, CurrentSourceStoredRow[]>> = {};
    for (const batch of dr.batches) {
      for (const row of batch.rows) expect(currentSourceRowMatchesKind(batch.table_kind, row)).toBe(true);
      (tables[batch.table_kind] ??= []).push(...batch.rows);
    }
    expect(CurrentSourceSummarySchema.safeParse(dr.summary).success).toBe(true);
    for (const [kind, count] of Object.entries(dr.table_rows)) expect(tables[kind as CurrentSourceTableKind]).toHaveLength(count);

    const seal = {
      runId: dr.run_id, artifactRevision: 1,
      sourceAdapterId: "rs02.quantbt-signal-notional-wfo.v1" as const, profileId: "rs02.delta-signal-notional-wfo.v1" as const,
      manifestDigest: dr.manifest_digest, sourceTransformDigest: dr.source_transform_digest,
      retainedImportDigest: "f".repeat(64), requestedSpecDigest: "1".repeat(64), effectiveSpecDigest: "2".repeat(64),
      datasetBindingDigest: "3".repeat(64), tableRows: dr.table_rows,
      totalRows: Object.values(dr.table_rows).reduce((sum, count) => sum + count, 0),
      summary: dr.summary, retainedAtUtcMs: 1_790_269_236_911,
    };
    const all = (kind: CurrentSourceTableKind) => [...(tables[kind] ?? [])].sort((left, right) => left.sourceOrdinal - right.sourceOrdinal);
    const repository = {
      sealForRead: vi.fn().mockResolvedValue(seal),
      runState: vi.fn(),
      poolFrozenAt: vi.fn().mockResolvedValue(null),
      admittedRequestedSpec: vi.fn().mockResolvedValue(null),
      rows: vi.fn(async (_scope: unknown, _run: string, _revision: number, kind: CurrentSourceTableKind, selection: { limit: number }) => {
        const rows = all(kind);
        return { rows: rows.slice(0, selection.limit), hasMore: rows.length > selection.limit, hasPrevious: false, totalRows: rows.length };
      }),
      // 1056 retained rows ≤ 2000: the reader serves the whole relation (FULL).
      observationSeries: vi.fn(async () => ({ rows: all("OBSERVATION"), sampling: "FULL", extremaEmitted: true })),
      verifyRetainedImport: vi.fn(),
    };
    const service = new ResearchCurrentSourceService({ ...repository, searchInputs: mockSearchInputs(repository) } as never, {
      FEATURE_RESEARCH_CURRENT_SOURCE: "true",
      QUERY_CURSOR_ACTIVE_KEY_ID: "query-k1",
      QUERY_CURSOR_KEYS_JSON: '{"query-k1":"current-source-test-key-is-at-least-32-bytes"}',
      QUERY_CURSOR_TTL_SECONDS: 900,
    } as never);
    const scope = { workspaceId: "ws-w3-dr", actorUserId: "usr-w3-dr" };

    const evidence = await service.evidence(scope, dr.run_id) as ResearchCurrentSourceEvidenceResponse;
    expect(decimal(evidence.passport.initial_equity)).toBe(decimal(dr.expected.passport.initial_equity));
    expect(decimal(evidence.passport.final_equity)).toBe(decimal(dr.expected.passport.final_equity));
    expect(decimal(evidence.passport.max_drawdown_fraction)).toBe(decimal(dr.expected.passport.max_drawdown_fraction));
    for (const expected of dr.expected.folds) {
      const row = evidence.fold_verdicts.rows.find((candidate) => candidate.fold_id === expected.fold_id)!;
      expect(decimal(row.oos_sharpe)).toBe(decimal(expected.oos_sharpe));
      expect(decimal(row.decay)).toBe(decimal(expected.decay));
      expect(decimal(row.oos_trades)).toBe(decimal(expected.oos_trade_count));
      expect(Math.abs(Number(row.return_fraction) - expected.return_fraction)).toBeLessThanOrEqual(1e-12);
      expect(Math.abs(Number(row.max_drawdown_fraction) - expected.max_drawdown_fraction)).toBeLessThanOrEqual(1e-12);
      expect(Math.abs(Number(row.worst_return_fraction) - expected.worst_return_fraction)).toBeLessThanOrEqual(1e-12);
    }

    const series = await service.evidenceSeries(scope, dr.run_id, "EQUITY") as { source_sample: { sampling: string; emitted_point_count: number; envelope: Record<string, string> } };
    expect(series.source_sample).toMatchObject({ sampling: "FULL", emitted_point_count: dr.table_rows.OBSERVATION });
    expect(decimal(series.source_sample.envelope.first_equity)).toBe(decimal(dr.expected.passport.initial_equity));
    expect(decimal(series.source_sample.envelope.last_equity)).toBe(decimal(dr.expected.passport.final_equity));
    expect(decimal(series.source_sample.envelope.min_drawdown_fraction)).toBe(decimal(dr.expected.passport.max_drawdown_fraction));

    const split = await service.split(scope, dr.run_id) as ResearchCurrentSourceSplitResponse;
    expect(split.fold_plan.folds.map((fold) => fold.fold_id)).toEqual(dr.expected.folds.map((fold) => fold.fold_id));

    const search = await service.search(scope, dr.run_id, { limit: 100 }) as ResearchCurrentSourceSearchResponse;
    expect(search.ledger.trials).toHaveLength(Object.keys(dr.expected.trials).length);
    for (const trial of search.ledger.trials) expect(decimal(trial.objective)).toBe(decimal(dr.expected.trials[trial.trial_id]));
    expect(search.selection.selected_trial_id).toBe(dr.expected.selection.trial_id);
    expect(decimal(search.selection.objective)).toBe(decimal(dr.expected.selection.objective));
    expect(Object.fromEntries(Object.entries(search.selection.parameters).map(([key, value]) => [key, decimal(value)])))
      .toEqual(Object.fromEntries(Object.entries(dr.expected.selection.parameters).map(([key, value]) => [key, decimal(value)])));

    console.log(`W3_REAL_DR_SERVED ${JSON.stringify({
      passport: evidence.passport,
      claim: Object.fromEntries(Object.entries(evidence.claim).filter(([key]) => key !== "schema_version").map(([key, value]) => [key, (value as { value: unknown }).value])),
      fold_verdicts: evidence.fold_verdicts.rows.map((row) => ({ fold: row.fold_id, s_oos: row.oos_sharpe, decay: row.decay, trades: row.oos_trades, max_dd: row.max_drawdown_fraction, return: row.return_fraction, verdict: row.verdict, drag_target: row.drag_target })),
      selection: { trial: search.selection.selected_trial_id, objective: search.selection.objective, kind: search.selection.objective_kind },
      trials: search.ledger.trials.map((trial) => ({ id: trial.trial_id, objective: trial.objective, kind: trial.facts.objective_kind })),
    })}`);
  });
});
