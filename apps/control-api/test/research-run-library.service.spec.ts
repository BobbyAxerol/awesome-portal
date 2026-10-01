import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { ControlApiConfig } from "../src/config";
import { sha256ResearchJson } from "../src/research/preflight.service";
import { ResearchRunLibraryItemSchema, ResearchRunLibraryResponseSchema } from "../src/research/run-library.contract";
import type {
  RunLibraryRetainedFacts,
  RunLibraryRow,
  RunLibrarySparklineSource,
} from "../src/research/run-library.repository";
import {
  extremaPreservingSample,
  projectionMetricValues,
  retainedCardFacts,
  ResearchRunLibraryService,
} from "../src/research/run-library.service";
import { testConfig } from "./harness";

/**
 * RF-05 / P12 service units over rows shaped from the isolated QuantBT 1.1.1
 * preview (captured read-only 2026-09-24).  The PostgreSQL lane proves the
 * joins; these pin the mapping rules without a database.
 */
const LIVE = JSON.parse(readFileSync(
  join(__dirname, "research-run-library.live-preview.fixture.json"),
  "utf8",
)) as {
  projection_revision: string;
  projection: Record<string, unknown>;
  equity_oos: {
    source_observation_count: number;
    sampling: string;
    series_digest: string;
    payload: Array<{ at_utc_ms: number; equity: string; drawdown_fraction: string }>;
  };
  progress_claim: Record<string, unknown> & { text: string };
};

const scope = { workspaceId: "p12-unit", actorUserId: "p12-unit-user" };
const config = {
  ...testConfig({
    FEATURE_RESEARCH_RUN_LIBRARY: "true",
    QUERY_CURSOR_ACTIVE_KEY_ID: "p12-k1",
    QUERY_CURSOR_KEYS_JSON: '{"p12-k1":"p12-query-signing-key-which-is-longer-than-thirty-two-bytes"}',
  }),
  FEATURE_RESEARCH_EVIDENCE: "true",
  FEATURE_RESEARCH_RELEASE_CANDIDATES: "true",
} as ControlApiConfig;

function snapshot(runId: string) {
  return {
    schema_version: "research.progress-snapshot.v1",
    run_id: runId,
    attempt_id: "rwa_unit",
    lease_epoch: 1,
    status: "COMPLETED",
    created_at_utc_ms: 1_790_235_794_822,
    updated_at_utc_ms: 1_790_235_802_572,
    latest_sequence: 25,
    retention_floor_sequence: 0,
    stages: ["S1", "S2", "S3", "S4", "S5"].map((key) => ({
      key, state: "DONE", started_at_utc_ms: 1_790_235_794_892, completed_at_utc_ms: 1_790_235_802_572,
    })),
    overall: { pct: 100, elapsed_s: 8, eta_s: null, trials_done: 4, trials_declared: 4, tqdm_line: "sealed" },
    budget: { used: "1.00", cap: null, unit: "core-min", pct: 0 },
    folds: [],
    artifacts: [],
    claim: LIVE.progress_claim,
    readiness: { mandatory: "SEALED", optional: "NOT_APPLICABLE" },
    failure: null,
    source: { kind: "DURABLE_P10", coverage: "ACTUAL_HOOKS", partial: false },
    mandatory_bundle: { digest: "c".repeat(64), size: "42" },
  };
}

function row(overrides: Partial<RunLibraryRow> = {}): RunLibraryRow {
  return {
    workspace_id: scope.workspaceId,
    run_id: "rrun_unit",
    attempt_id: "attempt_unit",
    source_kind: "RESEARCH_DURABLE",
    run_kind: "PRIMARY",
    relationship_kind: "PRIMARY",
    logical_run_key: "logical-unit",
    parent_run_id: null,
    created_at: new Date("2026-09-24T07:43:14.885Z"),
    updated_at: new Date("2026-09-24T07:43:14.885Z"),
    effective_status: "COMPLETED",
    intent_kind: "NEW",
    alpha_id: null,
    alpha_name: null,
    alpha_version_label: null,
    alpha_version_id: null,
    alpha_code_digest: null,
    legacy_request: { protocol: "three_window_decay" },
    requested_spec: null,
    portal_receipt: null,
    progress_snapshot: snapshot("rrun_unit"),
    progress_received_at: null,
    source_latest_sequence: 25,
    retention_floor_sequence: 0,
    job_state: "SUCCEEDED",
    current_worker_ordinal: 1,
    alpha_filter_key: "scratch",
    mode_key: "three_window_decay",
    created_at_cursor: "2026-09-24T07:43:14.885092Z",
    evidence_revision: LIVE.projection_revision,
    evidence_projection: LIVE.projection,
    evidence_equity_state: "AVAILABLE",
    evidence_equity_reason: null,
    rc_release_candidate_id: null,
    rc_delivery_state: null,
    rc_approval_state: null,
    rc_sealed_at_utc_ms: null,
    rc_draft_id: null,
    display_profile_id: "p10.delta-signal-notional-wfo.v1",
    display_ordinal: "118",
    ...overrides,
  };
}

function page(rows: RunLibraryRow[]) {
  return {
    rows,
    asOfUtcMs: 1_790_242_989_751,
    totalRows: rows.length,
    filteredRows: rows.length,
    hasMore: false,
    hasPrevious: false,
    counters: { logicalRuns: rows.length, workerChildren: 0, technicalRetries: 0, legacyMetadataRows: 0 },
    claimLedger: { issued: 0, notIssued: rows.length, pendingSource: 0, failed: 0, cancelledBeforeSource: 0, legacyMetadataOnly: 0 },
    statusCounts: {
      completed: rows.filter((candidate) => candidate.effective_status === "COMPLETED").length,
      running: rows.filter((candidate) => candidate.effective_status === "RUNNING").length,
      failed: rows.filter((candidate) => candidate.effective_status === "FAILED").length,
      queued: 0, draft: 0, cancelled: 0, recoveryRequired: 0,
    },
    filterCatalog: { alphas: [], modes: [], scratchAvailable: true },
  };
}

function sparklineSource(overrides: Partial<RunLibrarySparklineSource> = {}): RunLibrarySparklineSource {
  return {
    run_id: "rrun_unit",
    source_kind: "RESEARCH_DURABLE",
    effective_status: "COMPLETED",
    source_latest_sequence: 25,
    progress_snapshot: snapshot("rrun_unit"),
    evidence_revision: LIVE.projection_revision,
    equity_availability_state: "AVAILABLE",
    equity_reason_code: null,
    equity_source_observation_count: LIVE.equity_oos.source_observation_count,
    equity_emitted_point_count: LIVE.equity_oos.payload.length,
    equity_sampling: LIVE.equity_oos.sampling,
    equity_series_payload: LIVE.equity_oos.payload,
    equity_series_digest: LIVE.equity_oos.series_digest,
    ...overrides,
  };
}

const QUERY = {
  workspace_id: scope.workspaceId, q: undefined, status: [], mode: [], alpha: [], ids: [],
  cursor: null, before: null, limit: 50,
};

describe("RF-05 P12 Run Library service mapping", () => {
  it("validates every card and envelope once without relaxing canonical response or array bounds", async () => {
    const repository = { list: vi.fn().mockResolvedValue(page([row()])) };
    const service = new ResearchRunLibraryService(repository as never, config);
    const mapped = await service.list(scope, QUERY);
    expect(ResearchRunLibraryResponseSchema.parse(mapped)).toEqual(mapped);
    repository.list.mockResolvedValueOnce(page([row({ created_at: new Date(NaN) })]));
    await expect(service.list(scope, QUERY)).rejects.toMatchObject({ code: "RESEARCH_RUN_LIBRARY_UNAVAILABLE" });
    repository.list.mockResolvedValueOnce({ ...page([row()]), totalRows: -1 });
    await expect(service.list(scope, QUERY)).rejects.toMatchObject({ code: "RESEARCH_RUN_LIBRARY_UNAVAILABLE" });
    repository.list.mockResolvedValueOnce(page(Array.from({ length: 51 }, (_, index) => row({ run_id: `rrun_${index}` }))));
    await expect(service.list(scope, QUERY)).rejects.toMatchObject({ code: "RESEARCH_RUN_LIBRARY_UNAVAILABLE" });
  });

  it("CG-P12-03: extrema-preserving sample keeps first, last, min and max within 24 ordered points", () => {
    const values = Array.from({ length: 192 }, (_, index) => Math.sin(index / 7) * 100 + (index === 97 ? 500 : 0) - (index === 150 ? 400 : 0));
    const { points, sampled } = extremaPreservingSample(values.map((value, index) => ({ index, value })), (point) => point.value);
    expect(sampled).toBe(true);
    expect(points.length).toBeLessThanOrEqual(24);
    expect(points.length).toBeGreaterThanOrEqual(22);
    expect(points[0]!.index).toBe(0);
    expect(points[points.length - 1]!.index).toBe(191);
    expect(points.map((point) => point.index)).toContain(97);
    expect(points.map((point) => point.index)).toContain(150);
    expect(points.map((point) => point.index)).toEqual([...points.map((point) => point.index)].sort((a, b) => a - b));
    // Flat and short series.
    expect(extremaPreservingSample(Array.from({ length: 40 }, () => 1), (value) => value).points.length).toBeLessThanOrEqual(24);
    expect(extremaPreservingSample([3, 1, 2], (value) => value)).toEqual({ points: [3, 1, 2], sampled: false });
  });

  it("CG-P12-02: base projection metric values are keyed by registry key without being computed", () => {
    const values = projectionMetricValues(LIVE.projection);
    expect(values.get("TRADE_COUNT")).toBe("45");
    expect(values.get("BARS_PROCESSED")).toBe("2508");
    expect(values.has("OOS_SHARPE")).toBe(false);
    const extended = projectionMetricValues({
      ...LIVE.projection,
      derived: { ...(LIVE.projection.derived as object), oos_sharpe: "1.25", decay_fraction: "-0.4" },
      metrics: [{ key: "OOS_SORTINO", value: "1.9" }, { key: "BAD", value: "NaN" }],
    });
    expect(extended.get("OOS_SHARPE")).toBe("1.25");
    expect(extended.get("DECAY_FRACTION")).toBe("-0.4");
    expect(extended.get("OOS_SORTINO")).toBe("1.9");
    expect(extended.has("BAD")).toBe(false);
    expect(projectionMetricValues({ metrics: { OOS_SHARPE: { value: "0.8" } } }).get("OOS_SHARPE")).toBe("0.8");
  });

  it("CG-P12-02/04/09: COMPLETED card from a live-shaped row — trades, typed Sharpe/decay, mode, Hub claim", async () => {
    const repository = { list: vi.fn().mockResolvedValue(page([row()])), findSparklineSource: vi.fn() };
    const service = new ResearchRunLibraryService(repository as never, config);
    const item = (await service.list(scope, QUERY)).items[0]!;
    expect(item.stats.map((cell) => [cell.role, cell.value, cell.scope])).toEqual([
      ["OOS_SHARPE", null, null], ["DECAY", null, null], ["TRADE_COUNT", "45", "CHILD_TAPE"],
    ]);
    // The live projection predates CG-P13-03 analytics (or the registry does).
    expect(item.stats[0]!.availability.reason_code).toMatch(/^P13_(SOURCE_PREDATES_OOS_ANALYTICS|METRIC_REGISTRY_DOES_NOT_DEFINE_OOS_SHARPE)$/);
    expect(item.stats[2]!.definition_id).toBe("research.metric.v1.trade_count");
    expect(item.claim).toEqual({
      state: "NOT_ISSUED", text: LIVE.progress_claim.text, availability: { state: "AVAILABLE", reason_code: null },
    });
    // No parsed requested spec: protocol only, never a mode key.
    expect(item.mode).toEqual({
      display: "three_window_decay", key: null, schedule: null, protocol: "three_window_decay",
      availability: { state: "NOT_PUBLISHED", reason_code: "REQUESTED_SPEC_DOES_NOT_PUBLISH_OPTIMIZATION_MODE" },
    });
    expect(item.evidence_revision).toBe(LIVE.projection_revision);
  });

  it("CG-P12-09: a claim whose source is still pending carries no sentence, like the Hub", async () => {
    const pending = snapshot("rrun_unit");
    pending.source = { ...pending.source, coverage: "PENDING_SOURCE_CALLBACK" };
    pending.status = "RUNNING";
    const repository = {
      list: vi.fn().mockResolvedValue(page([row({ progress_snapshot: pending, effective_status: "RUNNING", job_state: "RUNNING" })])),
      findSparklineSource: vi.fn(),
    };
    const service = new ResearchRunLibraryService(repository as never, config);
    const item = (await service.list(scope, QUERY)).items[0]!;
    expect(ResearchRunLibraryItemSchema.safeParse(item).success).toBe(true);
    expect(item.claim).toEqual({
      state: LIVE.progress_claim.state, text: null,
      availability: { state: "PENDING_SOURCE_CALLBACK", reason_code: "P11_SOURCE_COVERAGE_PENDING_CALLBACK" },
    });
  });

  it("CG-P12-06: an incompatible persisted rc shape is a typed absence, not a 503", async () => {
    const repository = {
      list: vi.fn().mockResolvedValue(page([row({
        rc_release_candidate_id: "rc_not-a-ulid", rc_delivery_state: "NOT_DELIVERED",
        rc_approval_state: "NOT_APPROVED", rc_sealed_at_utc_ms: "1790242989751",
      })])),
      findSparklineSource: vi.fn(),
    };
    const item = (await new ResearchRunLibraryService(repository as never, config).list(scope, QUERY)).items[0]!;
    expect(item.rc).toBeNull();
    expect(item.rc_availability).toEqual({ state: "NOT_PUBLISHED", reason_code: "P21_RELEASE_CANDIDATE_REF_INCOMPATIBLE" });
  });

  it("CG-P12-03: sparkline refuses a series whose digest does not match (no silent wrong curve)", async () => {
    const tampered = LIVE.equity_oos.payload.map((point, index) => index === 3 ? { ...point, equity: "1" } : point);
    const repository = {
      list: vi.fn(),
      findSparklineSource: vi.fn()
        .mockResolvedValueOnce(sparklineSource())
        .mockResolvedValueOnce(sparklineSource({ equity_series_payload: tampered })),
    };
    const service = new ResearchRunLibraryService(repository as never, config);
    const good = await service.sparkline(scope, "rrun_unit");
    expect(good.values.length).toBeLessThanOrEqual(24);
    expect(good.source?.display_sampling).toBe("EXTREMA_BUCKET_24_V1");
    await expect(service.sparkline(scope, "rrun_unit")).rejects.toMatchObject({
      code: "RESEARCH_RUN_LIBRARY_UNAVAILABLE", status: 503,
    });
    expect(createHash("sha256").update(JSON.stringify(LIVE.equity_oos.payload.map((point) => ({
      at_utc_ms: point.at_utc_ms, drawdown_fraction: point.drawdown_fraction, equity: point.equity,
    })))).digest("hex")).toBe(LIVE.equity_oos.series_digest);
  });

  it("CG-P12-08: cursors carry exact microsecond boundaries", async () => {
    const repository = {
      list: vi.fn()
        .mockResolvedValueOnce({ ...page([row()]), hasMore: true })
        .mockResolvedValueOnce(page([row({ run_id: "rrun_older" })])),
      findSparklineSource: vi.fn(),
    };
    const service = new ResearchRunLibraryService(repository as never, config);
    const first = await service.list(scope, { ...QUERY, limit: 1 });
    expect(first.page.next_cursor).toBeTruthy();
    await service.list(scope, { ...QUERY, limit: 1, cursor: first.page.next_cursor });
    expect(repository.list.mock.calls[1]![2]).toEqual({
      createdAt: "2026-09-24T07:43:14.885092Z", runId: "rrun_unit", direction: "after",
    });
  });

  it("E10 (audit 01-5): a FAILED card marks the failing stage `blocked` and says where and why", async () => {
    const failedSnapshot = {
      ...snapshot("rrun_unit"),
      status: "FAILED",
      readiness: { mandatory: "FAILED", optional: "NOT_APPLICABLE" },
      failure: { code: "inner_min_folds", message: "outer IS too short for inner_min_folds = 3" },
      overall: { pct: 40, elapsed_s: 660, eta_s: null, trials_done: 2, trials_declared: 4, tqdm_line: "failed" },
      stages: ["S1", "S2", "S3", "S4", "S5"].map((key, index) => ({
        key,
        state: index === 0 ? "DONE" : index === 1 ? "RUNNING" : "PENDING",
        started_at_utc_ms: index <= 1 ? 1_790_235_794_892 : null,
        completed_at_utc_ms: index === 0 ? 1_790_235_794_900 : null,
      })),
      folds: [
        { fold: 1, state: "DONE", started_at_utc_ms: 1_790_235_794_892, completed_at_utc_ms: 1_790_235_794_900 },
        { fold: 2, state: "FAILED", started_at_utc_ms: 1_790_235_794_900, completed_at_utc_ms: 1_790_235_794_950 },
      ],
      mandatory_bundle: undefined,
    };
    const repository = {
      list: vi.fn().mockResolvedValue(page([
        row({ run_id: "rrun_source_failed", effective_status: "FAILED", job_state: "FAILED", progress_snapshot: failedSnapshot }),
        // A control-side close: the lease was lost while S4 ran and no
        // dispatcher claimed the retry. The source never reported a failure.
        row({
          run_id: "rrun_retry_expired", effective_status: "FAILED", job_state: "FAILED",
          progress_snapshot: {
            ...failedSnapshot, status: "RUNNING", failure: null, folds: [],
            readiness: { mandatory: "PENDING", optional: "NOT_APPLICABLE" },
            stages: failedSnapshot.stages.map((stage, index) => ({
              ...stage,
              state: index < 3 ? "DONE" : index === 3 ? "RUNNING" : "PENDING",
              started_at_utc_ms: index <= 3 ? 1_790_235_794_892 : null,
              completed_at_utc_ms: index < 3 ? 1_790_235_794_900 : null,
            })),
          },
          job_terminal_reason: "P06_RETRY_NOT_DISPATCHED: the worker lease expired and no dispatcher claimed the scheduled retry within 300 s.",
        }),
        // Failed before any source progress: nothing to point at, reason still typed.
        row({
          run_id: "rrun_no_source", effective_status: "FAILED", job_state: "FAILED", progress_snapshot: null,
          job_terminal_reason: "LEASE_EXPIRED",
        }),
      ])),
      findSparklineSource: vi.fn(),
    };
    const service = new ResearchRunLibraryService(repository as never, config);
    const [source, control, none] = (await service.list(scope, QUERY)).items;
    for (const item of [source!, control!, none!]) expect(ResearchRunLibraryItemSchema.safeParse(item).success).toBe(true);

    // HiFi R-WFO-116: S1 done, S2 red, S3–S5 never reached; "failed at fold 2 · S2".
    expect(source!.stages.map((cell) => cell.state)).toEqual(["done", "blocked", "pend", "pend", "pend"]);
    expect(source!.stages[1]).toMatchObject({ tooltip_source: "DERIVED_FROM_PERSISTED_STATE" });
    expect(source!.stages[1]!.tip).toBe("The run failed during S2 at fold 2; persisted S2 state: RUNNING.");
    expect(source!.stats.map((cell) => [cell.role, cell.value, cell.tone])).toEqual([
      ["FAILED_AT", "fold 2 · S2", "BAD"], ["FAILURE_REASON", "inner_min_folds", "BAD"], ["RUNTIME", "660 s", "BAD"],
    ]);

    expect(control!.stages.map((cell) => cell.state)).toEqual(["done", "done", "done", "blocked", "pend"]);
    expect(control!.stats.map((cell) => [cell.role, cell.value])).toEqual([
      ["FAILED_AT", "S4"], ["FAILURE_REASON", "P06_RETRY_NOT_DISPATCHED"], ["RUNTIME", "660 s"],
    ]);

    expect(none!.stages.every((cell) => cell.state === "pend")).toBe(true);
    expect(none!.stats[0]).toMatchObject({ role: "FAILED_AT", value: null, availability: { state: "NOT_PUBLISHED", reason_code: "P11_FAILED_STAGE_NOT_PUBLISHED" } });
    expect(none!.stats[1]).toMatchObject({ role: "FAILURE_REASON", value: "LEASE_EXPIRED" });
  });

  it("D1: prints the label the hi-fi names a run by", async () => {
    const repository = { list: vi.fn().mockResolvedValue(page([row()])), findSparklineSource: vi.fn() };
    const service = new ResearchRunLibraryService(repository as never, config);
    /* The Library is the read that teaches every other screen this run's
       label, so `R-WFO-118` has to survive the mapper intact. */
    expect((await service.list(scope, QUERY)).items[0]!.display_label).toBe("R-WFO-118");
    expect(
      service.mapRow(row({ display_profile_id: "p04.fixed-qualification.v1", display_ordinal: 7 }))
        .display_label,
    ).toBe("R-P04-007");
  });

  it("D1: a row with no ordinal of its own is unlabelled, never numbered", () => {
    const repository = { list: vi.fn(), findSparklineSource: vi.fn() };
    const service = new ResearchRunLibraryService(repository as never, config);
    /* A worker child and a retired 1.0.8 row are not logical runs. The SQL
       gives them no ordinal; the mapper must publish `null` rather than fall
       back to a number, so the reader prints the short id instead. */
    const child = service.mapRow(row({
      run_kind: "AUDIT", relationship_kind: "AUDIT_OF_SELECTION", display_ordinal: null,
    }));
    expect(child.display_label).toBeNull();
    const legacy = service.mapRow(row({
      source_kind: "LEGACY_1_0_8_METADATA", relationship_kind: "LEGACY_UNKNOWN",
      display_profile_id: null, display_ordinal: null,
    }));
    expect(legacy.display_label).toBeNull();
    /* Still valid items: the contract makes the field nullable, not absent. */
    for (const item of [child, legacy]) {
      expect(ResearchRunLibraryItemSchema.safeParse(item).success).toBe(true);
    }
  });
});

/* ------------------------------------------------------------------ E11 */

describe("E11 (audit 01-7) — a COMPLETED card reads the retained lane the hub never published", () => {
  /** The real Delta walk-forward seal's shape, values from `w3RealWfo.fixture.json`. */
  const retainedRow = (overrides: Partial<RunLibraryRetainedFacts> = {}): RunLibraryRetainedFacts => ({
    run_id: "rrun_unit",
    artifact_revision: "1",
    metrics: { mean_oos_sharpe: "-5.354970424211971", mean_decay: "3.911439612138451" },
    fold_count: "2",
    trade_fold_count: "2",
    trade_sum: "10",
    observation_count: "1056",
    ...overrides,
  });
  /** A hub-less row: exactly what a Delta WFO run looks like to the Library. */
  const hubless = () => row({ evidence_revision: null, evidence_projection: null, evidence_equity_state: null });

  async function card(retained: RunLibraryRetainedFacts[], rows = [hubless()]) {
    const repository = {
      list: vi.fn().mockResolvedValue(page(rows)),
      retainedFacts: vi.fn().mockResolvedValue(retained),
      findSparklineSource: vi.fn(),
    };
    const service = new ResearchRunLibraryService(repository as never, config);
    const response = await service.list(scope, QUERY);
    return { item: response.items[0]!, response, repository };
  }

  it("D-AN-01 maps only sealed last-30D card facts and types old-seal absence", async () => {
    const analytics = JSON.parse(readFileSync(join(process.env.PORTAL_CONTRACTS_DIR ?? join(__dirname, "../../../packages/contracts"), "fixtures/research-retained-analytics-v2.fixed.valid.json"), "utf8"));
    const { item } = await card([retainedRow({ analytics_v2: analytics })]);
    expect(item.last_30d).toMatchObject({
      availability: { state: "AVAILABLE" }, input_digest: analytics.input_digest,
      data: { label: "last 30D", points: analytics.last_30d.points },
    });
    const oldSeal = await card([retainedRow()]);
    expect(oldSeal.item.last_30d).toMatchObject({
      availability: { state: "NOT_PUBLISHED", reason_code: "PORTAL_ANALYTICS_V2_NOT_COMPUTED_FOR_SEAL" },
      data: null,
    });
  });
  it("AN-29 accepts a digest-bound sidecar and rejects a changed block", async () => {
    const analytics = JSON.parse(readFileSync(join(process.env.PORTAL_CONTRACTS_DIR ?? join(__dirname, "../../../packages/contracts"), "fixtures/research-retained-analytics-v2.fixed.valid.json"), "utf8"));
    const digest = sha256ResearchJson(analytics);
    const { item } = await card([retainedRow({ analytics_v2: analytics, analytics_v2_digest: digest })]);
    expect(item.last_30d.availability.state).toBe("AVAILABLE");
    await expect(card([retainedRow({ analytics_v2: analytics, analytics_v2_digest: "0".repeat(64) })]))
      .rejects.toMatchObject({ code: "RESEARCH_RUN_LIBRARY_UNAVAILABLE" });
  });


  it("prints QuantBT's own fold means and the summed OOS trades instead of P13_SOURCE_EVIDENCE_NOT_PUBLISHED", async () => {
    const { item } = await card([retainedRow()]);
    expect(ResearchRunLibraryItemSchema.safeParse(item).success).toBe(true);
    expect(item.stats.map((cell) => [cell.role, cell.value, cell.scope])).toEqual([
      ["OOS_SHARPE", "-5.354970424211971", "OOS"],
      ["DECAY", "3.911439612138451", "OOS"],
      ["TRADE_COUNT", "10", "OOS"],
    ]);
    /* The same definition ids Screen 10 publishes, so 01 and 10 cannot disagree. */
    expect(item.stats[0]!.definition_id).toBe("research.current-source.v1.selected-trial-mean-oos-sharpe");
    expect(item.stats[1]!.definition_id).toBe("research.current-source.v1.selected-trial-mean-decay");
    /* And the card may now ask for its curve. */
    expect(item.sparkline).toMatchObject({ kind: "oos_equity", availability: { state: "AVAILABLE" } });
  });

  it("withholds the trade count rather than publishing a partial sum", async () => {
    const { item } = await card([retainedRow({ fold_count: "5", trade_fold_count: "2", trade_sum: "10" })]);
    expect(item.stats[2]).toMatchObject({
      role: "TRADE_COUNT",
      value: null,
      availability: { state: "NOT_PUBLISHED", reason_code: "QUANTBT_DID_NOT_RETAIN_EVERY_FOLD_OOS_TRADE_COUNT" },
    });
    /* The two means the lane did retain are still published. */
    expect(item.stats[0]!.value).toBe("-5.354970424211971");
  });

  it("names the lane's own absence when the selected trial retained no metrics", async () => {
    const { item } = await card([retainedRow({ metrics: null })]);
    expect(item.stats.map((cell) => [cell.role, cell.value, cell.availability.reason_code])).toEqual([
      ["OOS_SHARPE", null, "QUANTBT_DID_NOT_RETAIN_SELECTED_TRIAL_FOLD_METRICS"],
      ["DECAY", null, "QUANTBT_DID_NOT_RETAIN_SELECTED_TRIAL_FOLD_METRICS"],
      ["TRADE_COUNT", "10", null],
    ]);
  });

  it("keeps the hub's absence for a run that has no retained seal either", async () => {
    const { item, repository } = await card([]);
    expect(repository.retainedFacts).toHaveBeenCalledWith(scope, ["rrun_unit"]);
    for (const cell of item.stats) {
      expect(cell.value).toBeNull();
      expect(cell.availability.reason_code).toBe("P13_SOURCE_EVIDENCE_NOT_PUBLISHED");
    }
    expect(item.sparkline.availability.reason_code).toBe("P13_SOURCE_EVIDENCE_NOT_PUBLISHED");
  });

  it("never asks the retained lane about a run the hub already published", async () => {
    const repository = {
      list: vi.fn().mockResolvedValue(page([row()])),
      retainedFacts: vi.fn().mockResolvedValue([]),
      findSparklineSource: vi.fn(),
    };
    const service = new ResearchRunLibraryService(repository as never, config);
    await service.list(scope, QUERY);
    expect(repository.retainedFacts).not.toHaveBeenCalled();
  });

  it("uses retained aggregates from the Library snapshot without a second transaction", async () => {
    const repository = {
      list: vi.fn().mockResolvedValue({ ...page([hubless()]), retainedFacts: [retainedRow()] }),
      retainedFacts: vi.fn().mockRejectedValue(new Error("SECOND_SNAPSHOT_FORBIDDEN")),
    };
    const response = await new ResearchRunLibraryService(repository as never, config).list(scope, QUERY);
    expect(response.items[0]!.stats.map(cell => cell.value)).toEqual(["-5.354970424211971", "3.911439612138451", "10"]);
    expect(response.items[0]!.stats[2]).toMatchObject({
      label: "OOS fold trades", scope: "OOS",
      definition_id: "research.current-source.v1.sum-of-published-fold-oos-trade-counts",
    });
    expect(repository.retainedFacts).not.toHaveBeenCalled();
  });

  it("an empty same-snapshot retained set never falls back to a newer seal", async () => {
    const repository = {
      list: vi.fn().mockResolvedValue({ ...page([hubless()]), retainedFacts: [] }),
      retainedFacts: vi.fn().mockResolvedValue([retainedRow()]),
    };
    const response = await new ResearchRunLibraryService(repository as never, config).list(scope, QUERY);
    expect(response.items[0]!.stats[0]!.value).toBeNull();
    expect(repository.retainedFacts).not.toHaveBeenCalled();
  });

  it("D3: publishes the status counts the HiFi's first summary line reads", async () => {
    const { response } = await card([retainedRow()]);
    expect(response.status_counts).toEqual({
      COMPLETED: 1, RUNNING: 0, FAILED: 0, QUEUED: 0, DRAFT: 0, CANCELLED: 0, RECOVERY_REQUIRED: 0,
    });
  });

  it("LW-04: retained WFO sparkline uses OOS count, not full stitched tape count", async () => {
    const repository = {
      findSparklineSource: vi.fn().mockResolvedValue(hubless()),
      retainedFacts: vi.fn().mockResolvedValue([retainedRow({ observation_count: "2184" })]),
      findRetainedSparklineValues: vi.fn().mockResolvedValue([
        { at_utc_ms: "1725000000000", equity: "100", oos_count: "1440" },
        { at_utc_ms: "1725003600000", equity: "110", oos_count: "1440" },
      ]),
    };
    const response = await new ResearchRunLibraryService(repository as never, config).sparkline(scope, "rrun_unit");
    expect(response.availability.state).toBe("AVAILABLE");
    expect(response.source).toMatchObject({
      series_kind: "EQUITY_OOS", source_observation_count: 1440,
      first_at_utc_ms: 1725000000000, last_at_utc_ms: 1725003600000,
    });
    expect(repository.findRetainedSparklineValues).toHaveBeenCalledWith(scope, "rrun_unit", 1, 192);
  });

  it("reads a retained row into the card's shape, and refuses one that is not a seal", () => {
    expect(retainedCardFacts(retainedRow())).toMatchObject({
      artifactRevision: 1, meanOosSharpe: "-5.354970424211971", meanDecay: "3.911439612138451",
      oosTrades: 10, oosTradesReason: null, observationCount: 1056,
    });
    expect(retainedCardFacts(retainedRow({ artifact_revision: "not-a-revision" }))).toBeNull();
    /* A value that is not an exact decimal is dropped, never coerced. */
    expect(retainedCardFacts(retainedRow({ metrics: { mean_oos_sharpe: "NaN", mean_decay: 3.9 } })))
      .toMatchObject({ meanOosSharpe: null, meanDecay: null });
    expect(retainedCardFacts(retainedRow({ fold_count: "0", trade_fold_count: "0", trade_sum: null })))
      .toMatchObject({ oosTrades: null, oosTradesReason: "RS02_SEAL_RETAINED_NO_FOLD_ROWS" });
  });
});
