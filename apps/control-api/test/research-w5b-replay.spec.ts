/**
 * W5b · P17 Execute/Replay on the retained signal-notional lane.
 *
 * The fixture is every retained row + the seal summary of a real QuantBT
 * 1.1.1 Delta signal-notional WFO on BTCUSDT 1h (2026-06-01..07-15, 2 folds,
 * 3 trials, seed 42) exported through the P06 child by the opt-in real-HMD
 * test (`test_research_wfo_real_hmd.py`, PORTAL_W5B_REPLAY_EXPORT_DIR). An
 * in-memory repository with the repository's exact keyset semantics stands
 * in for PostgreSQL; the SQL is proven in `research-w5b-replay-db.spec.ts`.
 *
 * Gate IDs are the guide's (P17-T02/T03/T04/T06/T07/T08/T10/T11/T14).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";

import {
  ResearchCurrentSourceReplayResponseSchema,
  ResearchCurrentSourceReplayTransitionsResponseSchema,
  ResearchCurrentSourceReplayChildAuditResponseSchema,
  ResearchCurrentSourceChildAuditQuerySchema,
  ResearchCurrentSourceTransitionsQuerySchema,
  ResearchCurrentSourcePageQuerySchema,
  type ResearchCurrentSourceNotApplicableResponse,
  type ResearchCurrentSourceReplayResponse,
  type ResearchCurrentSourceReplayTransitionsResponse,
  type ResearchCurrentSourceReplayChildAuditResponse,
} from "../src/research/current-source.contract";
import { ResearchCurrentSourceError } from "../src/research/current-source.error";
import { CurrentSourceSummarySchema, currentSourceRowMatchesKind } from "../src/research/current-source.payload";
import type { CurrentSourceSealRow, CurrentSourceStoredRow } from "../src/research/current-source.repository";
import { ResearchCurrentSourceService } from "../src/research/current-source.service";
import { sha256ResearchJson } from "../src/research/preflight.service";
import { openApiValidator } from "./research-rf05-openapi";

type Kind = "OBSERVATION" | "FOLD" | "TRIAL" | "CANDIDATE" | "SELECTION";
interface Fixture {
  run_id: string;
  table_rows: Record<Kind, number>;
  manifest_digest: string;
  source_transform_digest: string;
  summary: Record<string, unknown> & { replay: Record<string, any> };
  rows: Record<Kind, CurrentSourceStoredRow[]>;
}

const real = JSON.parse(gunzipSync(readFileSync(join(__dirname, "research-w5b-real-replay.fixture.json.gz"))).toString("utf8")) as Fixture;
const w3 = JSON.parse(readFileSync(join(__dirname, "research-w3-real-hmd-seal.fixture.json"), "utf8")) as {
  summary: Record<string, unknown>; table_rows: Record<Kind, number>; rows: Record<Exclude<Kind, "OBSERVATION">, CurrentSourceStoredRow[]>;
};
const scope = { workspaceId: "ws-w5b", actorUserId: "usr-w5b" };
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
    tableRows,
    totalRows: Object.values(tableRows).reduce((sum, count) => sum + count, 0),
    summary,
    retainedAtUtcMs: 1_790_269_236_911,
  };
}

const isTransition = (row: CurrentSourceStoredRow) => (row.payload.bar as { transition?: boolean } | undefined)?.transition === true;

/** In-memory keyset reader with the repository's exact page semantics (rows + transitions). */
function memory(seal: CurrentSourceSealRow, tables: Partial<Record<Kind, CurrentSourceStoredRow[]>>) {
  const window = (all: CurrentSourceStoredRow[], selection: { afterOrdinal?: number; beforeOrdinal?: number; atOrdinal?: number; limit: number }) => {
    let page: CurrentSourceStoredRow[];
    if (selection.afterOrdinal !== undefined) page = all.filter((row) => row.sourceOrdinal > selection.afterOrdinal!).slice(0, selection.limit);
    else if (selection.beforeOrdinal !== undefined) page = all.filter((row) => row.sourceOrdinal < selection.beforeOrdinal!).slice(-selection.limit);
    else if (selection.atOrdinal !== undefined) page = all.filter((row) => row.sourceOrdinal >= selection.atOrdinal!).slice(0, selection.limit);
    else page = all.slice(0, selection.limit);
    const first = page[0]?.sourceOrdinal;
    const last = page.at(-1)?.sourceOrdinal;
    return {
      rows: page,
      hasMore: last !== undefined && all.some((row) => row.sourceOrdinal > last),
      hasPrevious: first !== undefined && all.some((row) => row.sourceOrdinal < first),
      totalRows: all.length,
    };
  };
  const sorted = (kind: Kind) => [...(tables[kind] ?? [])].sort((left, right) => left.sourceOrdinal - right.sourceOrdinal);
  const repository = {
    sealForRead: vi.fn().mockResolvedValue(seal),
    runState: vi.fn(),
    poolFrozenAt: vi.fn().mockResolvedValue(null),
    rows: vi.fn(async (_scope: unknown, _runId: string, _revision: number, kind: Kind, selection: Parameters<typeof window>[1]) => window(sorted(kind), selection)),
    transitions: vi.fn(async (_scope: unknown, _runId: string, _revision: number, selection: Parameters<typeof window>[1]) =>
      window(sorted("OBSERVATION").filter(isTransition), selection)),
    rowBySourceId: vi.fn(async (_scope: unknown, _runId: string, _revision: number, kind: Kind, sourceId: string) =>
      (tables[kind] ?? []).find((row) => row.sourceId === sourceId) ?? null),
    observationSeries: vi.fn(),
    verifyRetainedImport: vi.fn(),
  };
  return { repository, service: new ResearchCurrentSourceService(repository as never, config as never) };
}

const realSeal = sealRow(real.summary, real.table_rows);
const page = (query: Record<string, unknown> = {}) => ResearchCurrentSourcePageQuerySchema.parse(query);
const ledgerQuery = (query: Record<string, unknown> = {}) => ResearchCurrentSourceTransitionsQuerySchema.parse(query);
const replayValidator = openApiValidator("research-current-source.openapi.json", "Replay");
const transitionsValidator = openApiValidator("research-current-source.openapi.json", "ReplayTransitions");

async function replay(service: ResearchCurrentSourceService, query: Record<string, unknown> = {}) {
  const value = sealed<ResearchCurrentSourceReplayResponse>(await service.replay(scope, real.run_id, page(query)));
  expect(ResearchCurrentSourceReplayResponseSchema.safeParse(value).success).toBe(true);
  replayValidator.assert(value);
  return value;
}

async function transitions(service: ResearchCurrentSourceService, query: Record<string, unknown> = {}) {
  const value = sealed<ResearchCurrentSourceReplayTransitionsResponse>(await service.replayTransitions(scope, real.run_id, ledgerQuery(query)));
  expect(ResearchCurrentSourceReplayTransitionsResponseSchema.safeParse(value).success).toBe(true);
  transitionsValidator.assert(value);
  return value;
}

describe("W5b fixture enters through the private ingest schemas", () => {
  it("every exported row (bars included) and the seal summary validate; older seals still validate", () => {
    for (const [kind, rows] of Object.entries(real.rows) as Array<[Kind, CurrentSourceStoredRow[]]>) {
      for (const row of rows) expect(currentSourceRowMatchesKind(kind, row), `${kind} ${row.sourceId}`).toBe(true);
    }
    expect(real.rows.OBSERVATION).toHaveLength(real.table_rows.OBSERVATION);
    expect(CurrentSourceSummarySchema.safeParse(real.summary).success).toBe(true);
    expect(CurrentSourceSummarySchema.safeParse(w3.summary).success).toBe(true);
  });

  it("refuses a bar block that is not the declared shape", () => {
    const row = structuredClone(real.rows.OBSERVATION[727]!);
    (row.payload.bar as Record<string, unknown>).fill_price = "58744.4";
    expect(currentSourceRowMatchesKind("OBSERVATION", row)).toBe(false);
  });
});

describe("P17-T02 · route semantics: what signal_notional really publishes", () => {
  it("counts the engine's own order/fill/trade records (0) and never fabricates a ledger", async () => {
    const { service } = memory(realSeal, real.rows);
    const value = await replay(service);
    const capabilities = value.route_capabilities;
    expect(capabilities.orders).toMatchObject({ state: "NOT_PUBLISHED", reason_code: "QUANTBT_ROUTE_EMITTED_NO_ORDER_RECORDS" });
    expect(capabilities.fills).toMatchObject({ state: "NOT_PUBLISHED", reason_code: "QUANTBT_ROUTE_EMITTED_NO_FILL_RECORDS" });
    expect(capabilities.trades).toMatchObject({ state: "NOT_PUBLISHED", reason_code: "QUANTBT_ROUTE_EMITTED_NO_TRADE_RECORDS" });
    expect(capabilities.mae_mfe.reason_code).toBe("QUANTBT_ROUTE_EMITTED_NO_TRADE_RECORDS");
    expect(capabilities.partial_fills).toMatchObject({ state: "NOT_APPLICABLE", reason_code: "QUANTBT_EXECUTION_ALLOW_PARTIAL_FILL_FALSE" });
    expect(capabilities.oco).toMatchObject({ state: "NOT_APPLICABLE", reason_code: "QUANTBT_CLOSE_TARGET_V2_HAS_NO_CONTINGENT_ORDERS" });
    expect(capabilities.multi_leg).toMatchObject({ state: "NOT_APPLICABLE", reason_code: "QUANTBT_SINGLE_SYMBOL_NETTING_ACCOUNT_HAS_NO_LEGS" });
    expect(capabilities.sl_tp).toMatchObject({ state: "NOT_APPLICABLE", reason_code: "QUANTBT_INTRABAR_EXIT_MODEL_NONE" });
    expect(capabilities.funding).toMatchObject({ state: "NOT_APPLICABLE", reason_code: "QUANTBT_RUN_CONFIG_USE_FUNDING_FALSE" });
    for (const key of ["candles", "transitions", "fees", "fold_capital", "model_positions", "returns"] as const) {
      expect(capabilities[key].state, key).toBe("AVAILABLE");
    }
    expect(value.execution).toMatchObject({
      state: "AVAILABLE",
      route: { engine_id: "close_target_v2", signal_phase: "bar_close", fill_phase: "same_close", fill_price_policy: "close", target_intent_kind: "units", allow_partial_fill: false, oms_mode: "netting", use_funding: false },
      counts: { bars: 1056, orders_published: 0, fills_published: 0, trades_published: 0, transitions: 8, bars_with_turnover: 8, rejected_orders: 0 },
      totals: { fee: "8.0327295941789174", funding: "0" },
    });
    // The response never names a fill, order or trade row.
    const text = JSON.stringify(value);
    for (const forbidden of ["\"fill_id\"", "\"order_id\"", "\"trade_id\"", "\"fills\":[", "\"orders\":["]) expect(text).not.toContain(forbidden);
  });

  it("each transition's fee is the account's own and a fee is charged exactly where the target moved", async () => {
    const { service } = memory(realSeal, real.rows);
    const ledger = await transitions(service, { limit: 200 });
    expect(ledger.semantics).toBe("TARGET_TRANSITION_SETTLED_AT_CLOSE_NOT_A_FILL");
    expect(ledger.source_transition_count).toBe(8);
    expect(ledger.rows.map((row) => [row.source_ordinal, row.kind, row.side_after])).toEqual([
      [727, "ENTRY", "SHORT"], [736, "EXIT", "FLAT"], [867, "ENTRY", "SHORT"], [880, "EXIT", "FLAT"],
      [890, "ENTRY", "SHORT"], [946, "EXIT", "FLAT"], [951, "ENTRY", "SHORT"], [1023, "EXIT", "FLAT"],
    ]);
    const fees = ledger.rows.map((row) => Number(row.fee));
    expect(fees.reduce((sum, fee) => sum + fee, 0)).toBeCloseTo(8.0327295941789174, 12);
    for (const row of ledger.rows) {
      const source = real.rows.OBSERVATION[row.source_ordinal]!;
      expect(row.source_index_utc).toBe(source.sourceId);
      expect(row.fee).toBe((source.payload.bar as { fee: string }).fee);
      expect(row.close).toBe((source.payload.bar as { candle: { close: string } }).candle.close);
    }
    // The entry notional is QuantBT's alloc_per_trade (2,000) at the bar close.
    expect(Number(ledger.rows[0]!.turnover)).toBeCloseTo(2_000, 9);
  });
});

describe("P17-T03/T14 · fold capital is QuantBT's convention, fold switch keeps original ids", () => {
  it("one stitched carry-position account: fold 1 starts at fold 0's end equity", async () => {
    const { service } = memory(realSeal, real.rows);
    const value = await replay(service);
    const capital = value.execution.fold_capital;
    const sealedParamsDigest = sha256ResearchJson(CurrentSourceSummarySchema.parse(real.summary).selection.parameters);
    for (const segment of capital.segments) {
      expect(segment).toMatchObject({ params_digest: sealedParamsDigest, params_digest_reason_code: null });
    }
    expect(capital).toMatchObject({ policy: "carry_position", account_execution: "single_stitched_run", equity_continuity: "CONTINUOUS_ACROSS_FOLDS", reason_code: null });
    const [fold0, fold1] = capital.segments;
    expect(fold0).toMatchObject({ fold_id: "0", first_ordinal: 720, last_ordinal: 887, bars: 168, start_equity: "20000", end_equity: "19931.280844135865", transitions: 4 });
    expect(fold1).toMatchObject({ fold_id: "1", first_ordinal: 888, last_ordinal: 1055, bars: 168, start_equity: fold0!.end_equity, end_equity: "19926.50808204798", transitions: 4 });
    expect(capital.boundary_events).toEqual([{ previous_fold_id: "0", fold_id: "1", boundary_utc_ms: real.rows.OBSERVATION[887]!.occurredAtUtcMs, next_test_start_utc_ms: real.rows.OBSERVATION[888]!.occurredAtUtcMs, gap_bars: 0, policy: "carry_position" }]);
  });

  it("a fold switch seeks the fold's first bar with its checkpoint; original bar ids survive, no compute", async () => {
    const { service, repository } = memory(realSeal, real.rows);
    const first = await replay(service);
    for (const segment of first.execution.fold_capital.segments) {
      const value = await replay(service, { at: segment.start_cursor, limit: 200 });
      expect(value.replay.rows[0]!.source_ordinal).toBe(segment.first_ordinal);
      expect(value.replay.rows[0]!.source_index_utc).toBe(real.rows.OBSERVATION[segment.first_ordinal]!.sourceId);
      expect(value.replay.state_at_cursor).toMatchObject({ state: "AVAILABLE_RETAINED_MODEL_SAMPLE", source_ordinal: segment.first_ordinal });
      expect(value.replay.state_at_cursor.bar?.fold_id).toBe(segment.fold_id);
      expect(value.replay.rows.filter((row) => row.bar?.fold_id === segment.fold_id)).toHaveLength(segment.bars);
    }
    // P17-T07: seek/fold switch reads only the sealed relation.
    expect(Object.keys(repository).filter((key) => (repository as Record<string, { mock?: { calls: unknown[] } }>)[key]!.mock?.calls.length))
      .toEqual(expect.arrayContaining(["sealForRead", "rows"]));
    expect(repository.runState).not.toHaveBeenCalled();
    expect(repository.observationSeries).not.toHaveBeenCalled();
  });
  it("keeps an old seal's missing selected parameters typed rather than inventing a fold digest", async () => {
    const summary = structuredClone(real.summary);
    (summary.selection as { parameters: Record<string, string> }).parameters = {};
    const { service } = memory(sealRow(summary, real.table_rows), real.rows);
    const value = await replay(service);
    expect(value.execution.fold_capital.segments).toHaveLength(2);
    for (const segment of value.execution.fold_capital.segments) {
      expect(segment).toMatchObject({ params_digest: null, params_digest_reason_code: "RS02_SEAL_DID_NOT_RETAIN_SELECTED_PARAMETERS" });
    }
  });


  it("a reset_flat policy is never presented as one compounding account", async () => {
    const summary = structuredClone(real.summary);
    summary.replay.fold_capital.policy = "reset_flat";
    summary.replay.fold_capital.account_execution = "segmented_reset_flat_required";
    const { service } = memory(sealRow(summary, real.table_rows), real.rows);
    const value = await replay(service);
    expect(value.execution.fold_capital).toMatchObject({ policy: "reset_flat", equity_continuity: "RESET_PER_FOLD" });
    const unknown = structuredClone(real.summary);
    unknown.replay.fold_capital.policy = null;
    (unknown as unknown as { source_facts: { execution: { fold_account_policy: string | null } } }).source_facts.execution.fold_account_policy = null;
    const missing = await replay(memory(sealRow(unknown, real.table_rows), real.rows).service);
    expect(missing.execution.fold_capital).toMatchObject({ policy: null, equity_continuity: "NOT_ASSERTED", reason_code: "QUANTBT_WALK_FORWARD_DID_NOT_PUBLISH_FOLD_ACCOUNT_POLICY" });
    expect(missing.route_capabilities.fold_capital.state).toBe("NOT_PUBLISHED");
  });
});

const childAuditValidator = openApiValidator("research-current-source.openapi.json", "ReplayChildAudit");
async function childAudit(service: ResearchCurrentSourceService, fold: string) {
  const value = sealed<ResearchCurrentSourceReplayChildAuditResponse>(
    await service.replayChildAudit(scope, real.run_id, ResearchCurrentSourceChildAuditQuerySchema.parse({ fold })),
  );
  expect(ResearchCurrentSourceReplayChildAuditResponseSchema.safeParse(value).success).toBe(true);
  childAuditValidator.assert(value);
  return value;
}

describe("P17-T14 · child audit keeps QuantBT's isolation records and original ids", () => {
  it("each fold's sub-read returns its records verbatim, in QuantBT's order, with the run-level facts", async () => {
    const { service, repository } = memory(realSeal, real.rows);
    const value = await replay(service);
    expect(value.route_capabilities.child_audit.state).toBe("AVAILABLE");
    expect(value.execution.child_audit).toMatchObject({ state: "AVAILABLE", policy: "isolated_v1", records_dropped_by_source: 0, source_record_count: 12 });
    const seen: number[] = [];
    for (const segment of value.execution.fold_capital.segments) {
      const audit = await childAudit(service, segment.fold_id);
      const retained = (real.rows.FOLD.find((row) => row.sourceId === segment.fold_id)!.payload.child_audit as { records: unknown[] }).records;
      expect(audit.records).toEqual(retained);
      expect(audit.records.every((record) => record.fold_id === segment.fold_id && record.certified_isolation === true)).toBe(true);
      expect(audit.source_run_fingerprint).toBe(value.execution.child_audit.source_run_fingerprint);
      /* The child that generated this fold's replayed bars: one, on the fold's first test bar. */
      const generation = audit.records.filter((record) => record.context === "out-of-sample generation");
      expect(generation).toHaveLength(1);
      expect(generation[0]!.test_start_utc_ms).toBe(real.rows.OBSERVATION[segment.first_ordinal]!.occurredAtUtcMs);
      seen.push(...audit.records.map((record) => record.audit_ordinal));
    }
    expect([...seen].sort((a, b) => a - b)).toEqual(Array.from({ length: 12 }, (_, index) => index));
    /* A fold switch + audit read touches only sealed local rows: no compute, no run-state read. */
    expect(repository.runState).not.toHaveBeenCalled();
    expect(repository.rowBySourceId).toHaveBeenCalledTimes(2);
  });

  it("an unknown fold is a 404; a seal without the table is a typed absence", async () => {
    const { service } = memory(realSeal, real.rows);
    await expect(service.replayChildAudit(scope, real.run_id, ResearchCurrentSourceChildAuditQuerySchema.parse({ fold: "99" })))
      .rejects.toMatchObject({ code: "RESEARCH_CURRENT_SOURCE_NOT_FOUND", status: 404 });
    const summary = structuredClone(real.summary);
    delete (summary.replay as Record<string, unknown>).child_audit;
    const older = memory(sealRow(summary, real.table_rows), real.rows).service;
    const replayed = await replay(older);
    expect(replayed.route_capabilities.child_audit).toMatchObject({ state: "NOT_PUBLISHED", reason_code: "RS02_SEAL_PREDATES_P17_CHILD_AUDIT" });
    expect(replayed.execution.child_audit.state).toBe("NOT_PUBLISHED");
    const audit = await childAudit(older, "0");
    expect(audit).toMatchObject({ availability: { state: "NOT_RETAINED_LEGACY" }, records: [], reason_code: "RS02_SEAL_PREDATES_P17_CHILD_AUDIT" });
  });
});

describe("P17-T04 · checkpoint/seek equivalence and gap refusal", () => {
  it("sequential pages, random seeks and a far seek read the same state", async () => {
    const { service } = memory(realSeal, real.rows);
    const sequential = new Map<number, { cumulative_fee: string | null; transition_count: number; equity: string }>();
    let fee = 0;
    let count = 0;
    let cursor: string | null = null;
    let playheads = new Map<number, string>();
    do {
      const value: ResearchCurrentSourceReplayResponse = await replay(service, cursor ? { cursor, limit: 200 } : { limit: 200 });
      for (const row of value.replay.rows) {
        fee += Number(row.bar!.fee);
        count += row.bar!.transition ? 1 : 0;
        expect(Number(row.bar!.checkpoint.cumulative_fee)).toBeCloseTo(fee, 12);
        expect(row.bar!.checkpoint.transition_count).toBe(count);
        sequential.set(row.source_ordinal, { cumulative_fee: row.bar!.checkpoint.cumulative_fee, transition_count: count, equity: row.equity });
        playheads.set(row.source_ordinal, row.playback_cursor);
      }
      cursor = value.replay.page.next_cursor;
    } while (cursor);
    expect(sequential.size).toBe(1056);
    // A deterministic spread of seeks, including the far end.
    for (const ordinal of [0, 1, 727, 736, 887, 888, 951, 1023, 1054, 1055]) {
      const value = await replay(service, { at: playheads.get(ordinal)!, limit: 5 });
      const state = value.replay.state_at_cursor;
      expect(state.source_ordinal).toBe(ordinal);
      expect(state.bar!.checkpoint.cumulative_fee).toBe(sequential.get(ordinal)!.cumulative_fee);
      expect(state.bar!.checkpoint.transition_count).toBe(sequential.get(ordinal)!.transition_count);
      expect(state.equity).toBe(sequential.get(ordinal)!.equity);
    }
    playheads = new Map();
    expect(Number(real.summary.replay.totals.fee)).toBeCloseTo(fee, 12);
  });

  it("a window with a hole in its dense sealed ordinals is refused, never played through", async () => {
    const gapped = real.rows.OBSERVATION.filter((row) => row.sourceOrdinal !== 2);
    const { service } = memory(realSeal, { ...real.rows, OBSERVATION: gapped });
    const refusal = await service.replay(scope, real.run_id, page({ limit: 5 })).catch((error: unknown) => error);
    expect(refusal).toBeInstanceOf(ResearchCurrentSourceError);
    expect(refusal).toMatchObject({ code: "RESEARCH_CURRENT_SOURCE_SEQUENCE_GAP", status: 503 });
    // A window that does not straddle the hole still reads.
    const after = await replay(service, { limit: 5, at: (await replay(memory(realSeal, real.rows).service, { limit: 10 })).replay.rows[5]!.playback_cursor });
    expect(after.replay.rows.map((row) => row.source_ordinal)).toEqual([5, 6, 7, 8, 9]);
  });

  it("a transition ledger that disagrees with the sealed count is refused", async () => {
    const missing = real.rows.OBSERVATION.filter((row) => row.sourceOrdinal !== 867);
    const { service } = memory(realSeal, { ...real.rows, OBSERVATION: missing });
    await expect(service.replayTransitions(scope, real.run_id, ledgerQuery())).rejects.toMatchObject({ code: "RESEARCH_CURRENT_SOURCE_SEQUENCE_GAP" });
  });
});

/** Build n dense observation rows; `transitions` names the ordinals whose position changes. */
function synthetic(n: number, transitionsAt: readonly number[], sameTimestamp: readonly number[] = []) {
  let position = "0";
  let fee = 0;
  let count = 0;
  const rows: CurrentSourceStoredRow[] = [];
  for (let ordinal = 0; ordinal < n; ordinal += 1) {
    const before = ordinal === 0 ? null : position;
    const transition = transitionsAt.includes(ordinal);
    if (transition) position = position === "0" ? "-0.5" : "0";
    if (transition) { fee += 1; count += 1; }
    const shift = sameTimestamp.includes(ordinal) ? ordinal - 1 : ordinal;
    const at = 1_782_864_000_000 + shift * 3_600_000;
    const id = `${new Date(at).toISOString().replace(".000Z", "Z").slice(0, -1)}.${String(ordinal).padStart(3, "0")}Z`;
    rows.push({
      sourceOrdinal: ordinal,
      sourceId: id,
      occurredAtUtcMs: at,
      payload: {
        source_index_utc: id, at_utc_ms: at, equity: "100", return_fraction: "0", accepted_position: position,
        drawdown_fraction: "0", signal_target: null,
        bar: {
          schema_version: "research.current-source-bar.v1",
          candle: { open: "10", high: "11", low: "9", close: "10", volume: "1" },
          fee: transition ? "1" : "0", turnover: transition ? "5" : "0", funding: "0", rejected_orders: 0, reject_code: 0,
          position_before: before, transition, fold_id: "0",
          checkpoint: { cumulative_fee: String(fee), cumulative_turnover: String(count * 5), cumulative_funding: "0", transition_count: count, rejected_orders: 0 },
        },
      },
    });
  }
  const summary = structuredClone(real.summary);
  summary.replay.totals = { ...summary.replay.totals, bars: n, transitions: count, bars_with_turnover: count, fee: String(fee) };
  return { rows, seal: sealRow(summary, { ...real.table_rows, OBSERVATION: n }) };
}

describe("P17-T10 · a sparse transition sequence {10, 12, 90}", () => {
  it("next/previous land only on existing rows; 11 is never invented", async () => {
    const { rows, seal } = synthetic(100, [10, 12, 90]);
    const { service } = memory(seal, { ...real.rows, OBSERVATION: rows });
    const one = await transitions(service, { limit: 1 });
    expect(one.rows.map((row) => row.source_ordinal)).toEqual([10]);
    const two = await transitions(service, { limit: 1, cursor: one.page.next_cursor });
    expect(two.rows.map((row) => [row.source_ordinal, row.transition_number])).toEqual([[12, 2]]);
    const three = await transitions(service, { limit: 1, cursor: two.page.next_cursor });
    expect(three.rows.map((row) => row.source_ordinal)).toEqual([90]);
    expect(three.page.has_more).toBe(false);
    const back = await transitions(service, { limit: 1, before: three.page.prev_cursor });
    expect(back.rows.map((row) => row.source_ordinal)).toEqual([12]);
    expect(back.rows[0]!.kind).toBe("EXIT");
    // Seeking the replay from a transition row lands on that exact bar.
    const seek = await replay(service, { at: two.rows[0]!.playback_cursor, limit: 3 });
    expect(seek.replay.rows.map((row) => row.source_ordinal)).toEqual([12, 13, 14]);
    // Row 11 exists as a bar but is not a transition: it is never listed as one.
    const all = await transitions(service, { limit: 200 });
    expect(all.rows.map((row) => row.source_ordinal)).toEqual([10, 12, 90]);
  });

  it("a real gap in the bars (a missing ordinal) is still detected", async () => {
    const { rows, seal } = synthetic(100, [10, 12, 90]);
    const { service } = memory(seal, { ...real.rows, OBSERVATION: rows.filter((row) => row.sourceOrdinal !== 11) });
    await expect(service.replay(scope, real.run_id, page({ limit: 20 }))).rejects.toMatchObject({ code: "RESEARCH_CURRENT_SOURCE_SEQUENCE_GAP" });
  });
});

describe("P17-T11 · same-timestamp rows keep source order", () => {
  it("two bars with one timestamp are returned in table order; cross-stream order stays NOT_ASSERTED", async () => {
    const { rows, seal } = synthetic(10, [4, 5], [5]);
    expect(rows[4]!.occurredAtUtcMs).toBe(rows[5]!.occurredAtUtcMs);
    const { service } = memory(seal, { ...real.rows, OBSERVATION: rows });
    const value = await replay(service, { limit: 10 });
    expect(value.replay.rows.map((row) => row.source_ordinal)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(value.replay.rows[4]!.at_utc_ms).toBe(value.replay.rows[5]!.at_utc_ms);
    expect(value.execution.sequence).toEqual({
      order: "SOURCE_TABLE_ORDINAL_ASC", density: "DENSE_SEALED_ORDINALS",
      gap_policy: "REFUSE_RESEARCH_CURRENT_SOURCE_SEQUENCE_GAP", cross_stream_order: "NOT_ASSERTED",
    });
    const ledger = await transitions(service, { limit: 10 });
    expect(ledger.rows.map((row) => [row.source_ordinal, row.kind])).toEqual([[4, "ENTRY"], [5, "EXIT"]]);
  });
});

describe("P17-T06 · server-side bounds", () => {
  it("a page is capped at 200 rows and one response stays under 1 MiB with every bar block", async () => {
    expect(ResearchCurrentSourcePageQuerySchema.safeParse({ limit: 201 }).success).toBe(false);
    expect(ResearchCurrentSourceTransitionsQuerySchema.safeParse({ limit: 201 }).success).toBe(false);
    const { service } = memory(realSeal, real.rows);
    const value = await replay(service, { limit: 200 });
    expect(value.replay.rows).toHaveLength(200);
    expect(Buffer.byteLength(JSON.stringify(value), "utf8")).toBeLessThan(1_048_576);
    expect(value.execution.candle_overview!.emitted_bucket_count).toBeLessThanOrEqual(160);
  });

  it("the overview keeps the run's extrema and every transition", async () => {
    const { service } = memory(realSeal, real.rows);
    const overview = (await replay(service)).execution.candle_overview!;
    const highs = real.rows.OBSERVATION.map((row) => Number((row.payload.bar as { candle: { high: string } }).candle.high));
    const lows = real.rows.OBSERVATION.map((row) => Number((row.payload.bar as { candle: { low: string } }).candle.low));
    expect(Number(overview.envelope.max_high)).toBe(Math.max(...highs));
    expect(Number(overview.envelope.min_low)).toBe(Math.min(...lows));
    expect(Math.max(...overview.values.map((value) => Number(value.high)))).toBe(Math.max(...highs));
    expect(overview.values.reduce((sum, value) => sum + value.transitions, 0)).toBe(8);
    expect(overview).toMatchObject({ source_bar_count: 1056, bucket_bars: 7, sampling: "OHLC_BUCKET_V1" });
  });
});

describe("P17-T08 · no certificate without evidence", () => {
  it("the replay contract has no certificate key and the response names none", async () => {
    const { service } = memory(realSeal, real.rows);
    const value = await replay(service);
    expect(JSON.stringify(value)).not.toMatch(/certif(icate|ied_badge)/i);
    const shape = ResearchCurrentSourceReplayResponseSchema as unknown;
    expect(JSON.stringify(Object.keys((shape as { shape?: Record<string, unknown> }).shape ?? {}))).not.toContain("certificate");
    // `accounting_certified` is QuantBT's own execution-contract flag, carried verbatim.
    expect(value.execution.route.accounting_certified).toBe(true);
  });
});

describe("W5b · a seal retained before the bar ledger", () => {
  it("answers bar: null and a typed legacy execution block; no bar is inferred", async () => {
    const legacyRows = real.rows.OBSERVATION.map((row) => ({ ...row, payload: Object.fromEntries(Object.entries(row.payload).filter(([key]) => key !== "bar")) }));
    const { service } = memory(sealRow(w3.summary, { ...w3.table_rows }), { ...w3.rows, OBSERVATION: legacyRows });
    const value = await replay(service, { limit: 3 });
    expect(value.replay.rows.every((row) => row.bar === null)).toBe(true);
    expect(value.execution).toMatchObject({ state: "NOT_RETAINED_LEGACY", reason_code: "RS02_SEAL_PREDATES_W5B_REPLAY_BAR_LEDGER", candle_overview: null });
    expect(value.execution.fold_capital.segments).toEqual([]);
    expect(value.route_capabilities.candles.reason_code).toBe("RS02_SEAL_PREDATES_W5B_REPLAY_BAR_LEDGER");
    const ledger = await transitions(service);
    expect(ledger).toMatchObject({ availability: { state: "NOT_RETAINED_LEGACY" }, rows: [], source_transition_count: null });
  });
});

/**
 * CG-P17-01 · canonical frontend fixtures. `W5B_WRITE_FIXTURES=1` rewrites
 * them from the real seal; every run validates the committed bodies against
 * Zod and OpenAPI so a frontend test can load them instead of a stub.
 */
describe("CG-P17-01 · published replay fixtures", () => {
  const root = resolve(process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts"), "fixtures");
  const files = {
    replay: "research-current-source.replay.fold0.valid.json",
    transitions: "research-current-source.replay-transitions.valid.json",
    legacy: "research-current-source.replay.legacy-seal.valid.json",
    childAudit: "research-current-source.replay-child-audit.fold0.valid.json",
  } as const;

  it("writes (opt-in) and validates the committed fixtures", async () => {
    if (process.env.W5B_WRITE_FIXTURES === "1") {
      const { service } = memory(realSeal, real.rows);
      const first = await replay(service);
      const fold0 = await replay(service, { at: first.execution.fold_capital.segments[0]!.start_cursor, limit: first.execution.fold_capital.segments[0]!.bars });
      const ledger = await transitions(service, { limit: 50 });
      const legacyRows = real.rows.OBSERVATION.map((row) => ({ ...row, payload: Object.fromEntries(Object.entries(row.payload).filter(([key]) => key !== "bar")) }));
      const legacy = await replay(memory(sealRow(w3.summary, { ...w3.table_rows }), { ...w3.rows, OBSERVATION: legacyRows }).service, { limit: 24 });
      const audit = await childAudit(service, "0");
      for (const [name, body] of [[files.replay, fold0], [files.transitions, ledger], [files.legacy, legacy], [files.childAudit, audit]] as const) {
        writeFileSync(join(root, name), `${JSON.stringify(body)}\n`);
      }
    }
    const read = (name: string) => JSON.parse(readFileSync(join(root, name), "utf8"));
    for (const name of [files.replay, files.legacy]) {
      expect(ResearchCurrentSourceReplayResponseSchema.safeParse(read(name)).success, name).toBe(true);
      replayValidator.assert(read(name));
    }
    expect(ResearchCurrentSourceReplayTransitionsResponseSchema.safeParse(read(files.transitions)).success).toBe(true);
    transitionsValidator.assert(read(files.transitions));
    expect(read(files.replay).replay.rows[0].source_ordinal).toBe(720);
    expect(read(files.legacy).execution.state).toBe("NOT_RETAINED_LEGACY");
    expect(ResearchCurrentSourceReplayChildAuditResponseSchema.safeParse(read(files.childAudit)).success).toBe(true);
    childAuditValidator.assert(read(files.childAudit));
  });
});
