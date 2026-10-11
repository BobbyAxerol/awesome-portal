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
import { SEALED_PERFORMANCE_DEFINITIONS } from "../src/research/source-aware-metric-resolver";
import { freezeReadValue } from "../src/research/immutable-read-json";

describe("UDB04 exact-current Library card calculations", () => {
  it("reuses pure mapping across fresh identical snapshots, never changed draft/state/date/bytes", () => {
    const service = new ResearchRunLibraryService({} as never, config);
    const source = row();
    const first = freezeReadValue(source);
    const map = (value: RunLibraryRow) => (service as any).mapPageRow(value);
    const a = map(first);
    const same = freezeReadValue({ ...source, created_at: new Date(source.created_at), updated_at: new Date(source.updated_at) });
    expect(map(same)).toBe(a);
    expect(Object.isFrozen(a)).toBe(true);
    const privateDraft = freezeReadValue({ ...source, rc_draft_id: "rcd_other" });
    expect(map(privateDraft)).not.toBe(a);
    const changedState = freezeReadValue({ ...source, effective_status: "FAILED" });
    expect(map(changedState).status).toBe("FAILED");
    expect(map(freezeReadValue({ ...source, created_at: new Date(source.created_at.getTime()+1) })).created_at_utc_ms)
      .toBe(a.created_at_utc_ms+1);
    expect(() => map(freezeReadValue({ ...source, enriched_analysis: '{"run_id":"other"}', enriched_digest: "a".repeat(64) })))
      .toThrow("Stored analytics supplement is incompatible.");
    expect(map(freezeReadValue({ ...source }))).toBe(a);
  });
  it("does not memoize caller-owned mutable rows", () => {
    const service = new ResearchRunLibraryService({} as never, config), source = row();
    const a = (service as any).mapPageRow(source);
    source.effective_status = "FAILED";
    const b = (service as any).mapPageRow(source);
    expect(b).not.toBe(a); expect(b.status).toBe("FAILED");
  });
});

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

describe("§56 Library current R1 claim facts", () => {
  const service = () => new ResearchRunLibraryService({} as never, config);
  const source = (): Partial<RunLibraryRow> => ({
    governance_run_id: "rrun_unit", governance_run_status: "COMPLETED",
    governance_alpha_id: "alpha_unit", governance_methodology_claim_ids: ["claim_1", "claim_2", "claim_1"],
  });
  it("publishes exact ids without assigning the run certificate to individual claims", () => {
    const item = service().mapRow(row(source()));
    expect(item.eligible_methodology_claim_ids).toEqual(["claim_1", "claim_2"]);
    expect(item.methodology_claims).toEqual(["claim_1", "claim_2"].map(id => ({
      id, grade: null, state: null,
      metadata_availability: { state: "NOT_PUBLISHED", reason_code: "R1_CLAIM_GRADE_STATE_NOT_RECORDED" },
    })));
    expect(item.methodology_claims_availability).toEqual({ state: "AVAILABLE", reason_code: null });
  });
  it("distinguishes an authoritative empty list from absent intake, never writes on GET", () => {
    expect(service().mapRow(row({ ...source(), governance_methodology_claim_ids: [] })))
      .toMatchObject({ eligible_methodology_claim_ids: [], methodology_claims: [], methodology_claims_availability: { state: "AVAILABLE" } });
    expect(service().mapRow(row())).toMatchObject({
      eligible_methodology_claim_ids: null, methodology_claims: null,
      methodology_claims_availability: { state: "NOT_PUBLISHED", reason_code: "R1_INTAKE_RUN_NOT_PUBLISHED" },
    });
  });
  it.each([
    [{ governance_run_id: "run_other" }, "R1_INTAKE_RUN_BINDING_MISMATCH"],
    [{ alpha_id: "alpha_other" }, "R1_INTAKE_RUN_BINDING_MISMATCH"],
    [{ governance_run_status: "RUNNING" }, "R1_INTAKE_RUN_NOT_COMPLETED"],
    [{ effective_status: "FAILED" }, "R1_INTAKE_RUN_NOT_COMPLETED"],
  ] as const)("preserves typed absence when current intake is not eligible %j", (override, reason) => {
    expect(service().mapRow(row({ ...source(), ...override }))).toMatchObject({
      eligible_methodology_claim_ids: null, methodology_claims: null,
      methodology_claims_availability: { state: "NOT_PUBLISHED", reason_code: reason },
    });
  });
  it.each([null, ["../private"], Array(65).fill("claim_1"), "claim_1"])("fails closed on malformed/bound-breaking source ids %j", ids => {
    expect(() => service().mapRow(row({ ...source(), governance_methodology_claim_ids: ids })))
      .toThrow("Stored R1 claim identifiers are incompatible.");
  });
  it("memoizes only exact current bytes, so changed ids invalidate pure mapping", () => {
    const mapper = service() as any;
    const first = mapper.mapPageRow(freezeReadValue(row(source())));
    const changed = mapper.mapPageRow(freezeReadValue(row({ ...source(), governance_methodology_claim_ids: ["claim_new"] })));
    expect(changed).not.toBe(first);
    expect(changed.eligible_methodology_claim_ids).toEqual(["claim_new"]);
  });
});

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
  it("validates one immutable shared card once, but every list still reads its actor-scoped page", async () => {
    const shared = freezeReadValue(row());
    const repository = { list: vi.fn().mockResolvedValue(page([shared])) };
    const service = new ResearchRunLibraryService(repository as never, config);
    const mapping = vi.spyOn(service, "mapRow");
    const responses = await Promise.all(Array.from({ length: 20 }, (_, i) =>
      service.list({ ...scope, actorUserId: `reader_${i}` }, QUERY)));
    expect(repository.list).toHaveBeenCalledTimes(20);
    expect(mapping).toHaveBeenCalledTimes(1);
    expect(responses.every(response => response.items[0] === responses[0]!.items[0])).toBe(true);
    expect(Object.isFrozen(responses[0]!.items[0])).toBe(true);
    expect(() => { responses[0]!.items[0]!.status = "FAILED"; }).toThrow();
    const next = freezeReadValue(row({ rc_draft_id: "rcd_second_actor" }));
    repository.list.mockResolvedValue(page([next]));
    await service.list(scope, QUERY);
    expect(mapping).toHaveBeenCalledTimes(2);
  });

  it("does not reuse a shared card across mutable dates or independent snapshots", async () => {
    const shared = freezeReadValue(row());
    const repository = { list: vi.fn().mockResolvedValue(page([shared])) };
    const service = new ResearchRunLibraryService(repository as never, config);
    const mapping = vi.spyOn(service, "mapRow");
    await service.list(scope, QUERY);
    shared.updated_at.setTime(shared.updated_at.getTime() + 1000);
    await service.list(scope, QUERY);
    expect(mapping).toHaveBeenCalledTimes(2);
    repository.list.mockResolvedValue(page([row()]));
    await service.list(scope, QUERY);
    await service.list(scope, QUERY);
    expect(mapping).toHaveBeenCalledTimes(4);
  });
  it("B8: cancelled actual child progress stays readable without AVAILABLE/null placeholders", () => {
    // Cancellation belongs to durable lifecycle; the retained child snapshot
    // is the last genuine RUNNING observation, not an invented CANCELLED hook.
    const progress = { ...snapshot("rrun_unit"), status: "RUNNING" };
    const item = new ResearchRunLibraryService({} as never, config).mapRow(row({
      effective_status: "CANCELLED", job_state: "CANCELLED", progress_snapshot: progress,
    }));
    expect(item.status).toBe("CANCELLED");
    expect(item.stats.map((metric) => metric.value)).toEqual(["100%", "4 / 4", "8 s"]);
    expect(item.stats.every((metric) => metric.availability.state === "AVAILABLE")).toBe(true);
    expect(item.last_30d).toMatchObject({ data: null, availability: {
      state: "NOT_PUBLISHED", reason_code: "RUN_NOT_COMPLETED",
    } });
  });

  it.each(["QUEUED", "DRAFT", "RECOVERY_REQUIRED"])("B8: %s source custody is not availability of absent metrics", (status) => {
    const item = new ResearchRunLibraryService({} as never, config).mapRow(row({ effective_status: status }));
    expect(item.stats.every((metric) => metric.value === null && metric.availability.state === "NOT_PUBLISHED")).toBe(true);
    expect(item.stats[0].availability.reason_code).toBe("P12_STATUS_METRICS_NOT_PUBLISHED");
  });

  it("publishes distinct enrichment absence for unsealed and retained runs", () => {
    const service = new ResearchRunLibraryService({} as never, config);
    const absent = row({evidence_revision:null,evidence_projection:null});
    expect(service.mapRow(absent).enriched_analysis_availability?.reason_code).toBe("SOURCE_EVIDENCE_NOT_SEALED");
    expect(service.mapRow(row()).enriched_analysis_availability?.reason_code).toBe("SEALED_ENRICHMENT_NOT_COMPUTED");
    expect(service.mapRow(absent, {artifactRevision:1,meanOosSharpe:null,meanDecay:null,oosTrades:null,oosTradesReason:null,observationCount:2,analyticsV2:null})
      .enriched_analysis_availability?.reason_code).toBe("SEALED_ENRICHMENT_NOT_COMPUTED");
  });
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

  it("REQ-B: verified P04 v2 scalars survive a legacy oos_analytics block absence", () => {
    const analytics = JSON.parse(readFileSync(join(process.env.PORTAL_CONTRACTS_DIR ?? join(__dirname, "../../../packages/contracts"), "fixtures/research-retained-analytics-v2.fixed.valid.json"), "utf8"));
    const source = row({ display_profile_id: "p04.fixed-qualification.v1", evidence_projection: {
      ...LIVE.projection, summary_analytics_v2: analytics,
      oos_analytics: { state: "NOT_PUBLISHED", reason_code: "P13_ENGINE_RESULT_NOT_AVAILABLE_TO_ANALYTICS", metrics: {} },
    } });
    const before = JSON.stringify(source);
    const item = new ResearchRunLibraryService({} as never, config).mapRow(source);
    for (const [index, key, definition] of [
      [0, "sharpe", SEALED_PERFORMANCE_DEFINITIONS.engineSharpe],
      [1, "sharpe_decay", SEALED_PERFORMANCE_DEFINITIONS.portalDecay],
    ] as const) {
      const fact = analytics.metrics[key];
      expect(item.stats[index]).toMatchObject({
        value: fact.value, scope: "OOS", availability: { state: "AVAILABLE", reason_code: null },
        definition_id: definition, source: "SUMMARY_ANALYTICS_V2", origin: fact.origin,
        source_locator: fact.source_locator, input_digest: fact.input_digest,
      });
    }
    expect(item.stats[2]).toMatchObject({ value: "45", scope: "CHILD_TAPE", definition_id: "research.metric.v1.trade_count" });
    expect(JSON.stringify(source)).toBe(before);
    const disabled = new ResearchRunLibraryService({} as never, { ...config, FEATURE_RESEARCH_EVIDENCE: "false" });
    expect(disabled.mapRow(source).stats.every((cell) => cell.value === null)).toBe(true);
  });

  it("REQ-B: a valid original engine scalar outranks a different sealed fallback", () => {
    const analytics = JSON.parse(readFileSync(join(process.env.PORTAL_CONTRACTS_DIR ?? join(__dirname, "../../../packages/contracts"), "fixtures/research-retained-analytics-v2.fixed.valid.json"), "utf8"));
    const item = new ResearchRunLibraryService({} as never, config).mapRow(row({ evidence_projection: {
      ...LIVE.projection, summary_analytics_v2: analytics,
      oos_analytics: { state: "AVAILABLE", reason_code: null, metrics: {
        sharpe: { state: "AVAILABLE", reason_code: null, value: "0.7440081232022494", locator: "full_report.sharpe" },
        sharpe_decay: { state: "NOT_PUBLISHED", reason_code: "P13_IS_BOUNDARY_NOT_IN_CHILD_RECEIPT", value: null, locator: null },
      } },
    } }));
    expect(item.stats[0]).toMatchObject({ value: "0.7440081232022494", definition_id: "research.metric.v3.oos_sharpe" });
    expect(item.stats[0].origin).toBeUndefined();
    expect(item.stats[1]).toMatchObject({ value: analytics.metrics.sharpe_decay.value, origin: "PORTAL_DERIVED" });
  });

  it("REQ-B: verified enrichment preserves Portal origin; absent decay never becomes a zero", () => {
    const block = JSON.parse(readFileSync(join(process.env.PORTAL_CONTRACTS_DIR ?? join(__dirname, "../../../packages/contracts"), "fixtures/research-enriched-analysis.healthy.valid.json"), "utf8"));
    const source = row({ run_id: block.run_id, enriched_analysis: block, enriched_digest: sha256ResearchJson(block) });
    const item = new ResearchRunLibraryService({} as never, config).mapRow(source);
    expect(item.stats[0]).toMatchObject({
      value: block.facts.metrics.sharpe.value, origin: "PORTAL_DERIVED", source: "ENRICHED_ANALYSIS",
      source_locator: block.facts.metrics.sharpe.source_locator, input_digest: block.input_digest,
      definition_id: SEALED_PERFORMANCE_DEFINITIONS.portalSharpe, scope: "OOS",
    });
    expect(item.stats[1]).toMatchObject({ value: null, origin: "PORTAL_DERIVED", availability: {
      state: "NOT_PUBLISHED", reason_code: block.facts.metrics.sharpe_decay.reason_code,
    } });
    expect(() => new ResearchRunLibraryService({} as never, config).mapRow({ ...source, enriched_digest: "0".repeat(64) }))
      .toThrow(/Stored analytics supplement is incompatible/);
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
    expect(good.points).toEqual(extremaPreservingSample(LIVE.equity_oos.payload, (point) => Number(point.equity))
      .points.map((point) => ({ at_utc_ms: point.at_utc_ms, equity: point.equity })));
    expect(good.points!.map((point) => point.equity)).toEqual(good.values);
    await expect(service.sparkline(scope, "rrun_unit")).rejects.toMatchObject({
      code: "RESEARCH_RUN_LIBRARY_UNAVAILABLE", status: 503,
    });
    expect(createHash("sha256").update(JSON.stringify(LIVE.equity_oos.payload.map((point) => ({
      at_utc_ms: point.at_utc_ms, drawdown_fraction: point.drawdown_fraction, equity: point.equity,
    })))).digest("hex")).toBe(LIVE.equity_oos.series_digest);
  });

  it("B9-4: P13 irregular timestamps and exact equity text follow the unchanged extrema selection", async () => {
    const payload = Array.from({ length: 48 }, (_, index) => ({
      at_utc_ms: 1725000000000 + index * index * 3600000,
      equity: index === 11 ? "95.000000000000000001" : index === 37 ? "130.000000000000000002" : `${100 + index % 5}.000000000000000003`,
      drawdown_fraction: "0",
    }));
    const before = JSON.stringify(payload);
    const repository = {
      findSparklineSource: vi.fn().mockResolvedValue(sparklineSource({
        equity_series_payload: payload, equity_emitted_point_count: payload.length,
        equity_series_digest: sha256ResearchJson(payload), equity_source_observation_count: payload.length,
      })),
    };
    const response = await new ResearchRunLibraryService(repository as never, config).sparkline(scope, "rrun_unit");
    const selected = extremaPreservingSample(payload, (point) => Number(point.equity)).points;
    expect(response.values).toEqual(selected.map((point) => point.equity));
    expect(response.points).toEqual(selected.map((point) => ({ at_utc_ms: point.at_utc_ms, equity: point.equity })));
    expect(response.points!.length).toBeLessThanOrEqual(24);
    expect(response.points).toContainEqual({ at_utc_ms: payload[11]!.at_utc_ms, equity: payload[11]!.equity });
    expect(response.points).toContainEqual({ at_utc_ms: payload[37]!.at_utc_ms, equity: payload[37]!.equity });
    expect(response.points![0]!.at_utc_ms).toBe(payload[0]!.at_utc_ms);
    expect(response.points!.at(-1)!.at_utc_ms).toBe(payload.at(-1)!.at_utc_ms);
    expect(JSON.stringify(payload)).toBe(before);
  });

  it("B9-4: legacy metadata and noncompleted sources publish empty timestamped points", async () => {
    const repository = {
      findSparklineSource: vi.fn()
        .mockResolvedValueOnce(sparklineSource({ source_kind: "LEGACY_1_0_8_METADATA" }))
        .mockResolvedValueOnce(sparklineSource({ effective_status: "RUNNING" })),
    };
    const service = new ResearchRunLibraryService(repository as never, config);
    for (let index = 0; index < 2; index += 1) {
      const response = await service.sparkline(scope, "rrun_unit");
      expect(response).toMatchObject({ values: [], points: [], source: null });
      expect(response.availability.state).not.toBe("AVAILABLE");
    }
  });

  it("B9-4: a digest-valid source with duplicate timestamps is incompatible, not re-spaced", async () => {
    const payload = [
      { at_utc_ms: 1725000000000, equity: "100", drawdown_fraction: "0" },
      { at_utc_ms: 1725000000000, equity: "99", drawdown_fraction: "-0.01" },
    ];
    const repository = {
      findSparklineSource: vi.fn().mockResolvedValue(sparklineSource({
        equity_series_payload: payload, equity_emitted_point_count: 2,
        equity_series_digest: sha256ResearchJson(payload), equity_source_observation_count: 2,
      })),
    };
    await expect(new ResearchRunLibraryService(repository as never, config).sparkline(scope, "rrun_unit"))
      .rejects.toMatchObject({ code: "RESEARCH_RUN_LIBRARY_UNAVAILABLE", status: 503 });
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

  it("AN-29 consumes the production same-snapshot page facts without an extra read", async () => {
    const analytics = JSON.parse(readFileSync(join(process.env.PORTAL_CONTRACTS_DIR ?? join(__dirname, "../../../packages/contracts"), "fixtures/research-retained-analytics-v2.fixed.valid.json"), "utf8"));
    const repository = {
      list: vi.fn().mockResolvedValue({ ...page([hubless()]), retainedFacts: [retainedRow({
        analytics_v2: analytics, analytics_v2_digest: sha256ResearchJson(analytics),
      })] }),
      retainedFacts: vi.fn(),
    };
    const response = await new ResearchRunLibraryService(repository as never, config).list(scope, QUERY);
    expect(response.items[0]!.last_30d).toMatchObject({
      availability: { state: "AVAILABLE" }, data: analytics.last_30d,
    });
    expect(repository.retainedFacts).not.toHaveBeenCalled();
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
    expect(response.points).toEqual([
      { at_utc_ms: 1725000000000, equity: "100" },
      { at_utc_ms: 1725003600000, equity: "110" },
    ]);
    expect(response.points!.map((point) => point.equity)).toEqual(response.values);
    expect(repository.findRetainedSparklineValues).toHaveBeenCalledWith(scope, "rrun_unit", 1, 192);
  });

  it("B9-4: retained source without a usable series publishes empty timestamped points", async () => {
    const repository = {
      findSparklineSource: vi.fn().mockResolvedValue(hubless()),
      retainedFacts: vi.fn().mockResolvedValue([retainedRow()]),
      findRetainedSparklineValues: vi.fn().mockResolvedValue([]),
    };
    const response = await new ResearchRunLibraryService(repository as never, config).sparkline(scope, "rrun_unit");
    expect(response).toMatchObject({
      values: [], points: [], source: null,
      availability: { state: "NOT_PUBLISHED", reason_code: "RS02_RETAINED_OBSERVATIONS_DO_NOT_FORM_A_SERIES" },
    });
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
