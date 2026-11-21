import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import type { ControlApiConfig } from "../src/config";
import { ResearchRunLibraryService } from "../src/research/run-library.service";
import { testConfig } from "./harness";

/**
 * RF-05 / CG-P12-02: CG-P13-03 publishes OOS Sharpe and the IS→OOS Sharpe
 * decay as performance (v3) definitions whose values live in the P13
 * projection's `oos_analytics.metrics`.  The Library applies the Hub's rule
 * and needs no change when they appear.  The registry is pinned here so this
 * test does not depend on the order in which the concurrent P13 work lands.
 */
vi.mock("../src/research/evidence-metric-registry", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/research/evidence-metric-registry")>();
  return {
    ...original,
    RESEARCH_PERFORMANCE_METRIC_DEFINITIONS: [
      {
        key: "OOS_SHARPE", sourceField: "sharpe", label: "OOS Sharpe", unit: "RATIO", scope: "OOS", frequency: "RUN_FINAL",
        origin: "ENGINE_DIRECT", definitionId: "research.metric.v3.oos_sharpe", sourceLocator: "full_report.sharpe", nullRule: "test",
      },
      {
        key: "OOS_SHARPE_DECAY", sourceField: "sharpe_decay", label: "Sharpe decay", unit: "RATIO", scope: "OOS", frequency: "RUN_FINAL",
        origin: "NOT_PUBLISHED", definitionId: "research.metric.v3.oos_sharpe_decay", sourceLocator: null, nullRule: "test",
      },
    ],
  };
});

const config = {
  ...testConfig({
    FEATURE_RESEARCH_RUN_LIBRARY: "true",
    QUERY_CURSOR_ACTIVE_KEY_ID: "p12-k1",
    QUERY_CURSOR_KEYS_JSON: '{"p12-k1":"p12-query-signing-key-which-is-longer-than-thirty-two-bytes"}',
  }),
  FEATURE_RESEARCH_EVIDENCE: "true",
} as ControlApiConfig;

function libraryRow(projection: Record<string, unknown>) {
  return {
    workspace_id: "p12-flow", run_id: "rrun_flow", attempt_id: "attempt_flow", source_kind: "RESEARCH_DURABLE",
    run_kind: "PRIMARY", relationship_kind: "PRIMARY", logical_run_key: "logical-flow", parent_run_id: null,
    created_at: new Date("2026-09-24T00:00:00.000Z"), updated_at: new Date("2026-09-24T00:00:00.000Z"),
    effective_status: "COMPLETED", intent_kind: "NEW", alpha_id: null, alpha_name: null, alpha_version_label: null,
    alpha_version_id: null, alpha_code_digest: null, legacy_request: {}, requested_spec: null, portal_receipt: null,
    progress_snapshot: null, progress_received_at: null, source_latest_sequence: null, retention_floor_sequence: null,
    job_state: "SUCCEEDED", current_worker_ordinal: 1, alpha_filter_key: "scratch", mode_key: null,
    created_at_cursor: "2026-09-24T00:00:00.000000Z",
    evidence_revision: `p13r1_${"e".repeat(64)}`, evidence_projection: projection,
    evidence_equity_state: "AVAILABLE", evidence_equity_reason: null,
    rc_release_candidate_id: null, rc_delivery_state: null, rc_approval_state: null, rc_sealed_at_utc_ms: null,
    rc_draft_id: null,
  };
}

async function stats(projection: Record<string, unknown>) {
  const repository = {
    list: vi.fn().mockResolvedValue({
      rows: [libraryRow(projection)], asOfUtcMs: 1, totalRows: 1, filteredRows: 1, hasMore: false, hasPrevious: false,
      counters: { logicalRuns: 1, workerChildren: 0, technicalRetries: 0, legacyMetadataRows: 0 },
      claimLedger: { issued: 0, notIssued: 0, pendingSource: 1, failed: 0, cancelledBeforeSource: 0, legacyMetadataOnly: 0 },
      statusCounts: { completed: 1, running: 0, failed: 0, queued: 0, draft: 0, cancelled: 0, recoveryRequired: 0 },
      filterCatalog: { alphas: [], modes: [], scratchAvailable: true },
    }),
    retainedFacts: vi.fn().mockResolvedValue([]),
    findSparklineSource: vi.fn(),
  };
  const response = await new ResearchRunLibraryService(repository as never, config).list(
    { workspaceId: "p12-flow", actorUserId: "p12-flow-user" },
    { workspace_id: "p12-flow", q: undefined, status: [], mode: [], alpha: [], ids: [], cursor: null, before: null, limit: 50 },
  );
  return response.items[0]!.stats;
}

const analytics = (metrics: Record<string, unknown>, state = "AVAILABLE") => ({
  metric_registry_version: "research.metric-registry.v2",
  direct: { num_trades: "45" },
  oos_analytics: {
    schema_version: "research.p13.oos-analytics.v1", state, reason_code: state === "AVAILABLE" ? null : "P13_OOS_ANALYTICS_NOT_PUBLISHED",
    scope_locator: "oos", report_locator: "full_report", return_sample: null, metrics,
  },
});

describe("RF-05 P12 · CG-P13-03 performance facts flow into the COMPLETED card", () => {
  it("shows an ENGINE_DIRECT OOS Sharpe with its v3 definition; decay stays the Hub's typed absence", async () => {
    const cells = await stats(analytics({
      sharpe: { state: "AVAILABLE", reason_code: null, value: "1.07", locator: "full_report.sharpe" },
      sharpe_decay: { state: "NOT_PUBLISHED", reason_code: "P13_IS_NOT_SEPARABLE_FROM_WARMUP", value: null, locator: null },
    }));
    expect(cells.map((cell) => [cell.role, cell.value, cell.scope, cell.definition_id, cell.availability.reason_code])).toEqual([
      ["OOS_SHARPE", "1.07", "OOS", "research.metric.v3.oos_sharpe", null],
      ["DECAY", null, null, null, "P13_IS_NOT_SEPARABLE_FROM_WARMUP"],
      ["TRADE_COUNT", "45", "CHILD_TAPE", "research.metric.v1.trade_count", null],
    ]);
  });

  it("refuses a locator mismatch, keeps a NOT_APPLICABLE reason, and types a pre-analytics projection", async () => {
    const mismatch = await stats(analytics({
      sharpe: { state: "AVAILABLE", reason_code: null, value: "9.9", locator: "full_report.sortino" },
    }));
    expect(mismatch[0]).toMatchObject({ value: null, availability: { state: "NOT_PUBLISHED", reason_code: "P13_ENGINE_LOCATOR_MISMATCH" } });
    const notApplicable = await stats(analytics({
      sharpe: { state: "NOT_APPLICABLE", reason_code: "QUANTBT_ZERO_VARIANCE_OOS_RETURNS", value: null, locator: null },
    }));
    expect(notApplicable[0]!.availability).toEqual({ state: "NOT_PUBLISHED", reason_code: "QUANTBT_ZERO_VARIANCE_OOS_RETURNS" });
    const blocked = await stats(analytics({}, "NOT_PUBLISHED"));
    expect(blocked[0]!.availability.reason_code).toBe("P13_OOS_ANALYTICS_NOT_PUBLISHED");
    const legacyProjection = await stats({ metric_registry_version: "research.metric-registry.v2", direct: { num_trades: "45" } });
    expect(legacyProjection[0]!.availability.reason_code).toBe("P13_SOURCE_PREDATES_OOS_ANALYTICS");
    expect(legacyProjection[2]!.value).toBe("45");
  });
});


describe("E11 retained WFO cards", () => {
  const retained = JSON.parse(readFileSync(join(__dirname, "research-w3-real-hmd-seal.fixture.json"), "utf8")) as {
    summary: Record<string, unknown>;
    rows: { CANDIDATE: Array<{ payload: Record<string, unknown> }>; FOLD: Array<{ payload: Record<string, unknown> }> };
  };

  async function retainedCells(candidate = retained.rows.CANDIDATE[0]!.payload) {
    const foldTradeCounts = retained.rows.FOLD
      .map((entry) => (entry.payload.fold_facts as { oos_score?: { oos_trade_count?: unknown } } | undefined)?.oos_score?.oos_trade_count)
      .filter((value): value is string => typeof value === "string");
    const trialFacts = candidate.trial_facts as { metrics?: Record<string, unknown> } | undefined;
    const row = {
      ...libraryRow({}),
      evidence_revision: null,
      evidence_projection: null,
      evidence_equity_state: null,
      evidence_equity_reason: null,
      retained_revision: `p13r2_${"f".repeat(64)}`,
      retained_summary: retained.summary,
      retained_candidate: candidate,
      retained_folds: retained.rows.FOLD.map((entry) => entry.payload),
    };
    const repository = {
      list: vi.fn().mockResolvedValue({
        rows: [row], asOfUtcMs: 1, totalRows: 1, filteredRows: 1, hasMore: false, hasPrevious: false,
        counters: { logicalRuns: 1, workerChildren: 0, technicalRetries: 0, legacyMetadataRows: 0 },
        claimLedger: { issued: 0, notIssued: 0, pendingSource: 1, failed: 0, cancelledBeforeSource: 0, legacyMetadataOnly: 0 },
        statusCounts: { completed: 1, running: 0, failed: 0, queued: 0, draft: 0, cancelled: 0, recoveryRequired: 0 },
        filterCatalog: { alphas: [], modes: [], scratchAvailable: true },
      }),
      retainedFacts: vi.fn().mockResolvedValue([{
        run_id: row.run_id,
        artifact_revision: "1",
        metrics: trialFacts?.metrics ?? null,
        fold_count: String(retained.rows.FOLD.length),
        trade_fold_count: String(foldTradeCounts.length),
        trade_sum: foldTradeCounts.reduce((total, value) => total + Number(value), 0).toString(),
        observation_count: "1056",
      }]),
      findSparklineSource: vi.fn(),
    };
    const response = await new ResearchRunLibraryService(repository as never, config).list(
      { workspaceId: "p12-flow", actorUserId: "p12-flow-user" },
      { workspace_id: "p12-flow", q: undefined, status: [], mode: [], alpha: [], ids: [], cursor: null, before: null, limit: 50 },
    );
    return response.items[0]!;
  }

  it("maps selected retained facts to the card with exact totals and immutable revision", async () => {
    const item = await retainedCells();
    /* Retained facts do not impersonate a P13 Hub revision. */
    expect(item.evidence_revision).toBeNull();
    expect(item.stats.map((cell) => [cell.role, cell.value, cell.availability.state])).toEqual([
      ["OOS_SHARPE", "-5.354970424211971", "AVAILABLE"],
      ["DECAY", "3.911439612138451", "AVAILABLE"],
      ["TRADE_COUNT", "10", "AVAILABLE"],
    ]);
    expect(item.stats.every((cell) => cell.value !== null || cell.availability.state !== "AVAILABLE")).toBe(true);
  });

  it("returns exact typed absences when an older retained candidate lacks its W3 fact block", async () => {
    const candidate = structuredClone(retained.rows.CANDIDATE[0]!.payload);
    delete candidate.trial_facts;
    const item = await retainedCells(candidate);
    expect(item.stats.map((cell) => [cell.role, cell.value, cell.availability.state])).toEqual([
      ["OOS_SHARPE", null, "NOT_PUBLISHED"],
      ["DECAY", null, "NOT_PUBLISHED"],
      ["TRADE_COUNT", "10", "AVAILABLE"],
    ]);
    expect(item.stats.slice(0, 2).map((cell) => cell.availability.reason_code)).toEqual([
      "QUANTBT_DID_NOT_RETAIN_SELECTED_TRIAL_FOLD_METRICS",
      "QUANTBT_DID_NOT_RETAIN_SELECTED_TRIAL_FOLD_METRICS",
    ]);
    expect(item.stats.every((cell) => cell.value !== null || cell.availability.state !== "AVAILABLE")).toBe(true);
  });
});
