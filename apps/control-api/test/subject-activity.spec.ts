import { describe, expect, it, vi } from "vitest";
import { ControlApiConfig } from "../src/config";
import {
  ExecutionSubjectActivityService,
  strategyTimeframe,
} from "../src/execution/subject-activity.service";
import type {
  ExecutionProfileProjectionRepository,
  ProfileProjectionDocument,
  ProfileProjectionSnapshot,
  ProjectionRelation,
  ProjectionScalar,
} from "../src/execution/profile-projection.repository";
import { testConfig } from "./harness";

const workspaceId = "ws_subject_activity";
const profileId = "PAPER_SUBJECT_PROFILE";
type Row = Record<string, ProjectionScalar>;

function config(): ControlApiConfig {
  return {
    ...testConfig(),
    FEATURE_EXECUTION_LOCAL_PROJECTION: "true",
    FEATURE_EXECUTION_DURABLE_MIRROR: "true",
    FEATURE_EXECUTION_DURABLE_MIRROR_READS: "true",
    FEATURE_EXECUTION_CURRENT_SOURCE_PAPER: "true",
    FEATURE_EXECUTION_CURRENT_SOURCE_SANDBOX: "true",
    FEATURE_EXECUTION_CURRENT_SOURCE_LIVE: "true",
    EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: workspaceId,
    EXECUTION_EDGE_PAPER_PROFILE_ID: profileId,
    EXECUTION_EDGE_SANDBOX_PROFILE_ID: "SANDBOX_SUBJECT_PROFILE",
    EXECUTION_EDGE_LIVE_PROFILE_ID: "LIVE_SUBJECT_PROFILE",
    EXECUTION_LOCAL_PROJECTION_STALE_CEILING_MS: 60_000,
    QUERY_CURSOR_ACTIVE_KEY_ID: "subject-k1",
    QUERY_CURSOR_KEYS_JSON: JSON.stringify({ "subject-k1": "01234567890123456789012345678901" }),
    QUERY_CURSOR_TTL_SECONDS: 900,
  } as ControlApiConfig;
}

function relation(name: string, rows: readonly Row[], availability: "AVAILABLE" | "UNAVAILABLE" = "AVAILABLE"): ProjectionRelation {
  return {
    source_id: "manager.current", relation: name, availability, reason_code: availability === "AVAILABLE" ? null : "SOURCE_GAP",
    as_of: "2026-09-07T12:00:00.000Z", freshness: "FRESH", completeness: "COMPLETE",
    items: rows.map((fields) => ({
      lineage: { workspace_id: workspaceId, profile_id: profileId, source_contract_revision: "manager-v2.current.v1" },
      fields,
    })),
  };
}

function snapshot(): ProfileProjectionSnapshot {
  const document: ProfileProjectionDocument = {
    schema_version: "portal.execution.profile-projection.v1",
    workspace_id: workspaceId,
    environment: "paper",
    profile_id: profileId,
    source_contract_revision: "manager-v2.current.v1",
    relations: {
      "manager.strategies:strategies": relation("strategies", [{ strategy_id: "adaptive_hma_cpp_00115m", active: true }]),
      "manager.deployments:strategy_deployments": relation("strategy_deployments", [{ strategy_id: "adaptive_hma_cpp_00115m", account_id: "acc_a", venue: "BINANCE" }]),
      "manager.orders:orders": relation("orders", []),
      "manager.fills:fills": relation("fills", []),
    },
  };
  const now = new Date();
  return {
    document,
    sourceEpoch: "manager-epoch",
    sourceCursor: "must-not-leak",
    sourceAsOf: new Date("2026-09-07T12:00:00.000Z"),
    receivedAt: now,
    lastSuccessfulRefreshAt: now,
    completeness: "COMPLETE",
    projectionEpoch: "portal-epoch",
    projectionSequence: 7,
    payloadDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    sourceCatalogueSha256: null,
  };
}

function service() {
  const snap = snapshot();
  const timeSeriesHistory = vi.fn(async (_workspace: string, _environment: string, _profile: string, relationKey: string, query: { entity?: { field: string; value: string } | null; after?: unknown; order?: string }) => {
    expect(query.entity).toEqual({ field: "strategy_id", value: "adaptive_hma_cpp_00115m" });
    expect(query.order).toBe("DESC");
    if (relationKey.endsWith("orders")) {
      return {
        rows: [{ rowId: "ord_2", ts: "2026-09-07T12:00:00.000Z", fields: { order_id: "ord_2", strategy_id: "adaptive_hma_cpp_00115m", account_id: "acc_a", status: "FILLED", updated_at: "2026-09-07T12:00:00.000Z" } }],
        hasMore: true,
      };
    }
    return { rows: [], hasMore: false };
  });
  const timeSeriesHistoryCoverage = vi.fn(async () => ({ rowCount: 1, oldestTs: "2026-09-07T12:00:00.000Z", newestTs: "2026-09-07T12:00:00.000Z" }));
  const repository = { snapshot: vi.fn(async () => snap), timeSeriesHistory, timeSeriesHistoryCoverage };
  return { service: new ExecutionSubjectActivityService(config(), repository as unknown as ExecutionProfileProjectionRepository), repository };
}

describe("BR-EX-80 / BR-EX-81 retained subject BFF", () => {
  it("uses a published interval first and otherwise only the known strategy-id suffix", () => {
    expect(strategyTimeframe([{ timeframe: "1H" }], "adaptive_hma_cpp_00115m")).toEqual({ value: "1h", provenance: "PUBLISHED_SOURCE", source_field: "timeframe" });
    expect(strategyTimeframe([{ timeframe: "2h" }], "adaptive_hma_cpp_00115m")).toEqual({ value: "15m", provenance: "DERIVED_STRATEGY_ID_SUFFIX", source_field: null });
    expect(strategyTimeframe([], "no_interval_here")).toEqual({ value: null, provenance: "UNAVAILABLE", source_field: null });
  });

  it("returns newest retained subject rows through a Portal-signed continuation without leaking an Edge cursor", async () => {
    const { service: read, repository } = service();
    const value = await read.read(
      { workspaceId, userId: "usr_bobby" },
      { environment: "paper", subjectKind: "alpha", subjectId: "adaptive_hma_cpp_00115m", relation: "orders", limit: 1 },
    );
    expect(repository.timeSeriesHistory).toHaveBeenCalledTimes(1);
    expect(value).toMatchObject({
      schema_version: "portal.execution.subject-records.v1",
      authority: "PORTAL_SGP_RETAINED_CURRENT_WINDOW",
      history_semantics: "RETAINED_PORTAL_CURRENT_WINDOW_NOT_AUTHORITATIVE_REPLAY",
      resource: { kind: "alpha", id: "adaptive_hma_cpp_00115m", resolution: "PUBLISHED_STRATEGY_ID" },
      timeframe: { value: "15m", provenance: "DERIVED_STRATEGY_ID_SUFFIX" },
      coverage: { retained_row_count: 1, source_window: "CURRENT_SOURCE_CURSOR_TRAVERSAL" },
      state: "AVAILABLE",
      page: { returned_count: 1, has_more: true },
      records: [{ record_id: "ord_2", values: { order_id: "ord_2" } }],
    });
    const wire = JSON.stringify(value);
    expect(wire).not.toContain("must-not-leak");
    expect(wire).not.toContain("manager.orders");
    expect(wire).not.toContain("payload_digest");
    // KeysetCursorCodec's versioned token is opaque to the product protocol;
    // it is signed by the Portal and cannot be replayed by another user or
    // operation (asserted below).  It is intentionally not an Edge cursor.
    expect((value.page as { next_cursor: string | null }).next_cursor).toMatch(/^kc1\.subject-k1\./);
  });

  it("binds a continuation to the Portal user and exact subject operation", async () => {
    const { service: read } = service();
    const first = await read.read(
      { workspaceId, userId: "usr_bobby" },
      { environment: "paper", subjectKind: "alpha", subjectId: "adaptive_hma_cpp_00115m", relation: "orders", limit: 1 },
    );
    const token = (first.page as { next_cursor: string }).next_cursor;
    await expect(read.read(
      { workspaceId, userId: "usr_stan" },
      { environment: "paper", subjectKind: "alpha", subjectId: "adaptive_hma_cpp_00115m", relation: "orders", limit: 1, after: token },
    )).rejects.toMatchObject({ code: expect.stringMatching(/^EDS12_SUBJECT_ACTIVITY_/) });
  });
});
