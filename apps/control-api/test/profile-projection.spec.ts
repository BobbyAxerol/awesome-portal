import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { buildPool } from "../src/db/pool";
import { ExecutionProductReadSource } from "../src/execution/product-read-source";
import { CurrentSourceProxyError } from "../src/execution/current-source.proxy";
import { ExecutionProfileRealtimeService } from "../src/execution/profile-realtime.service";
import {
  acceptedProjectionAdapters,
  ExecutionProfileReadAdapterService,
} from "../src/execution/profile-read-adapter.service";
import {
  ExecutionProfileProjectionRepository,
  ProfileProjectionDocument,
} from "../src/execution/profile-projection.repository";
import { profileProjectionCatalog } from "../src/execution/profile-projection.catalog";
import { ExecutionProfileProjectionWorker, mergeTimeSeriesWindow } from "../src/execution/profile-projection.worker";
import { WARM_WINDOW_MAX_ROWS } from "../src/execution/profile-projection.catalog";
import { migrateTestDatabase, testConfig, truncateAll } from "./harness";

const workspaceId = "ws_projection_test";
const profileId = "PAPER_BINANCE_USDM";
const relationKey = "manager.strategies:strategies";
let pool: Pool;
let repository: ExecutionProfileProjectionRepository;

const config = testConfig({
  FEATURE_EXECUTION_EDGE: "true",
  EXECUTION_EDGE_PRIVATE_KEY_FILE: "/run/secrets/test/delegation.pem",
  EXECUTION_EDGE_CA_FILE: "/run/secrets/test/ca.crt",
  EXECUTION_EDGE_CLIENT_CERT_FILE: "/run/secrets/test/client.crt",
  EXECUTION_EDGE_CLIENT_KEY_FILE: "/run/secrets/test/client.key",
  FEATURE_EXECUTION_CURRENT_SOURCE_PAPER: "true",
  EXECUTION_EDGE_PAPER_ORIGIN: "https://paper-edge.internal",
  EXECUTION_EDGE_PAPER_PROFILE_ID: profileId,
  EXECUTION_EDGE_PAPER_AUDIENCE: "portal-execution-edge-paper",
  FEATURE_EXECUTION_LOCAL_PROJECTION: "true",
  EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: workspaceId,
  EXECUTION_LOCAL_PROJECTION_POLL_INTERVAL_MS: "15000",
  EXECUTION_LOCAL_PROJECTION_LEASE_TTL_MS: "120000",
});

beforeAll(async () => {
  await migrateTestDatabase(config.DATABASE_URL);
  pool = buildPool(config.DATABASE_URL);
  repository = new ExecutionProfileProjectionRepository(pool);
});

beforeEach(async () => truncateAll(pool));
afterAll(async () => pool.end());

describe("Phase 1 SGP-local profile projection", () => {
  it("allows only one active writer lease per workspace/profile", async () => {
    expect(await repository.tryAcquireLease(workspaceId, "paper", profileId, "replica-a", 60_000))
      .toBe(true);
    expect(await repository.tryAcquireLease(workspaceId, "paper", profileId, "replica-b", 60_000))
      .toBe(false);
    await repository.releaseLease(workspaceId, "paper", profileId, "replica-a");
    expect(await repository.tryAcquireLease(workspaceId, "paper", profileId, "replica-b", 60_000))
      .toBe(true);
  });

  it("commits atomically, suppresses duplicate deltas and supports cursor replay", async () => {
    const first = await commit(document("alpha-1"), "cursor-1");
    expect(first).toMatchObject({ changed: true, projectionSequence: 1 });

    const duplicate = await commit(document("alpha-1"), "cursor-2");
    expect(duplicate).toMatchObject({
      changed: false,
      projectionEpoch: first.projectionEpoch,
      projectionSequence: 1,
    });

    const second = await commit(document("alpha-2"), "cursor-3");
    expect(second).toMatchObject({
      changed: true,
      projectionEpoch: first.projectionEpoch,
      projectionSequence: 2,
    });
    const replay = await repository.journalAfter(
      workspaceId, "paper", profileId, first.projectionEpoch, 0, 10,
    );
    expect(replay.map((entry) => entry.projectionSequence)).toEqual([1, 2]);
    expect(replay[1].payload).toMatchObject({
      schema_version: "portal.execution.profile-projection-delta.v1",
      changed_relations: [relationKey],
    });
    expect((await repository.snapshot(workspaceId, "paper", profileId))?.sourceCursor)
      .toBe("cursor-3");
  });

  it("never turns browser refreshes or projection misses into AWS-HK reads", async () => {
    await commit(document("123"), "cursor-1");
    let directCalls = 0;
    const source = new ExecutionProductReadSource(config, repository, {
      relation: async () => { directCalls += 1; throw new Error("unexpected AWS read-through"); },
    } as never);
    const principal = {
      principalId: "usr_bobby", sessionId: "ses_1", workspaceId,
      roles: ["ADMIN"], authenticationTime: new Date(), authenticationMethods: ["portal_session"],
    };
    const [left, right] = await Promise.all([
      source.relation(principal, "paper", "EXECUTION_ALPHA_FLEET_LIST_SCREEN",
        "manager.strategies", "strategies", { limit: 1 }),
      source.relation(principal, "paper", "EXECUTION_ALPHA_FLEET_LIST_SCREEN",
        "manager.strategies", "strategies", { limit: 1 }),
    ]);
    expect(left).toEqual(right);
    expect(directCalls).toBe(0);
    expect((left as any).source.data.items[0].fields.strategy_id).toEqual({
      kind: "TEXT", value: "123",
    });

    const otherViewer = await source.relation(
      { ...principal, workspaceId: "ws_other" }, "paper", "EXECUTION_ALPHA_FLEET_LIST_SCREEN",
      "manager.strategies", "strategies", { limit: 1 },
    ) as any;
    expect(otherViewer).toMatchObject({
      workspace_id: workspaceId,
      viewer_workspace_id: "ws_other",
    });
    expect(directCalls).toBe(0);
  });

  it("rejects cross-profile row lineage before persistence", async () => {
    const invalid = document("alpha-1");
    invalid.relations[relationKey].items[0].lineage.profile_id = "LIVE_BINANCE_USDM";
    await expect(commit(invalid, "cursor-invalid"))
      .rejects.toThrow("N31_PROFILE_PROJECTION_DOCUMENT_INVALID");
    expect(await repository.snapshot(workspaceId, "paper", profileId)).toBeNull();
  });

  it("replays a contiguous local delta and emits a terminal typed gap for bad cursors", async () => {
    const first = await commit(document("alpha-1"), "cursor-1");
    await commit(document("alpha-2"), "cursor-2");
    const realtime = new ExecutionProfileRealtimeService(config, repository);
    const handshake = await realtime.snapshot(workspaceId, "paper", profileId);
    expect(handshake).toMatchObject({
      event_type: "snapshot",
      payload: {
        snapshot_mode: "CURSOR_ONLY",
        relation_count: 1,
        source_contract_revision: "manager-v2.test.v1",
      },
    });
    expect(handshake.payload).not.toHaveProperty("document");
    expect(Buffer.byteLength(JSON.stringify(handshake))).toBeLessThan(2_048);
    expect(realtime.heartbeat(workspaceId, "paper", profileId)).toMatchObject({
      event_type: "heartbeat", terminal: false,
    });
    expect(realtime.authExpired(workspaceId, "paper", profileId)).toMatchObject({
      event_type: "auth.expired", terminal: true, reconnect_required: false,
    });
    const events: Array<{ event_type: string; projection_sequence: number | null }> = [];
    const stop = await realtime.subscribe(
      workspaceId, "paper", profileId, `${first.projectionEpoch}:1`,
      (event) => { events.push(event); return true; },
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ event_type: "delta", projection_sequence: 2 });
    stop();

    const gaps: string[] = [];
    await realtime.subscribe(
      workspaceId, "paper", profileId, "00000000-0000-0000-0000-000000000000:2",
      (event) => { gaps.push(event.event_type); return true; },
    );
    expect(gaps).toEqual(["projection.gap"]);
    realtime.onApplicationShutdown();
  });

  it("exposes only the four bounded, read-only existing-source adapters", async () => {
    await commit(document("alpha-1"), "cursor-1");
    const adapters = new ExecutionProfileReadAdapterService(config, repository);
    expect(acceptedProjectionAdapters()).toEqual([
      "admin.broker-read", "admin.inspect", "admin.performance", "event.order-lifecycle",
    ]);
    const value = await adapters.read(workspaceId, "paper", "admin.inspect");
    expect(value).toMatchObject({
      capability_id: "admin.inspect",
      authority: "PORTAL_SGP_PROJECTION",
      state: "PARTIAL",
      bounds: { arbitrary_source_selection: false, browser_cross_cell_access: false },
    });
    expect(value.relations[relationKey]).toMatchObject({ state: "AVAILABLE", truncated: false });
    await expect(adapters.read(workspaceId, "paper", "market.ticks"))
      .rejects.toMatchObject({ code: "N32_ADAPTER_NOT_ACCEPTED" });
    await expect(adapters.read(workspaceId, "paper", "admin.broker-read"))
      .rejects.toMatchObject({ code: "N32_ADAPTER_PROFILE_NOT_ACCEPTED" });
  });

  it("uses one bounded shared ingestion cycle and preserves the last snapshot on source loss", async () => {
    let calls = 0;
    let failed = false;
    const source = {
      relationForProjection: async (
        _workspace: string, environment: string, _screen: string,
        _source: string, relation: string,
      ) => {
        calls += 1;
        if (failed) throw new Error("simulated WAN loss");
        return emptyManagerResponse(environment, relation);
      },
    };
    const worker = new ExecutionProfileProjectionWorker(config, source as never, repository);
    await worker.runOnce();
    expect(calls).toBe(profileProjectionCatalog("paper").length);
    const before = await repository.snapshot(workspaceId, "paper", profileId);
    expect(before).not.toBeNull();

    failed = true;
    await expect(worker.runOnce()).rejects.toThrow(
      "N31_PROFILE_PROJECTION_CYCLE_FAILED:paper:N31_SOURCE_REFRESH_FAILED",
    );
    const after = await repository.snapshot(workspaceId, "paper", profileId);
    expect(after?.projectionEpoch).toBe(before?.projectionEpoch);
    expect(after?.projectionSequence).toBe(before?.projectionSequence);
    await worker.onApplicationShutdown();
  });

  it("commits a truthful PARTIAL hot window when a source relation exceeds the page bound", async () => {
    let calls = 0;
    const source = {
      relationForProjection: async (
        _workspace: string, environment: string, _screen: string,
        _source: string, relation: string,
      ) => {
        calls += 1;
        return {
          ...emptyManagerResponse(environment, relation),
          source: {
            ...(emptyManagerResponse(environment, relation) as any).source,
            data: {
              relation: { schema: "public", relation }, items: [],
              next_cursor: relation === "strategies" ? `cursor-${calls}` : null,
            },
          },
        };
      },
    };
    const worker = new ExecutionProfileProjectionWorker(config, source as never, repository);
    await worker.runOnce();
    const snapshot = await repository.snapshot(workspaceId, "paper", profileId);
    expect(calls).toBe(profileProjectionCatalog("paper").length + 1);
    expect(snapshot?.completeness).toBe("PARTIAL");
    expect(snapshot?.document.relations[relationKey].completeness).toBe("PARTIAL");
    await worker.onApplicationShutdown();
  });

  it("keeps a source-as-is profile usable when one proven relation is contract-unavailable", async () => {
    const source = {
      relationForProjection: async (
        _workspace: string, environment: string, _screen: string,
        _source: string, relation: string,
      ) => {
        if (relation === "portfolio_equity_snapshots") {
          throw new CurrentSourceProxyError("N17B_SOURCE_REJECTED", 422, {
            availability: "UNAVAILABLE",
            reason_code: "MANAGER_V2_SOURCE_CONTRACT_REJECTED",
            retryable: false,
          });
        }
        return emptyManagerResponse(environment, relation);
      },
    };
    const worker = new ExecutionProfileProjectionWorker(config, source as never, repository);
    await worker.runOnce();
    const snapshot = await repository.snapshot(workspaceId, "paper", profileId);
    expect(snapshot?.completeness).toBe("PARTIAL");
    expect(snapshot?.document.relations["manager.performance:portfolio_equity_snapshots"])
      .toMatchObject({
        availability: "UNAVAILABLE",
        reason_code: "MANAGER_V2_SOURCE_CONTRACT_REJECTED",
        completeness: "UNKNOWN",
        items: [],
      });
    await worker.onApplicationShutdown();
  });
});

function document(alphaId: string): ProfileProjectionDocument {
  return {
    schema_version: "portal.execution.profile-projection.v1",
    workspace_id: workspaceId,
    environment: "paper",
    profile_id: profileId,
    source_contract_revision: "manager-v2.test.v1",
    relations: {
      [relationKey]: {
        source_id: "manager.strategies",
        relation: "strategies",
        availability: "AVAILABLE",
        reason_code: null,
        as_of: "2026-09-02T00:00:00.000Z",
        freshness: "FRESH",
        completeness: "COMPLETE",
        items: [{
          lineage: {
            workspace_id: workspaceId,
            profile_id: profileId,
            source_contract_revision: "manager-v2.test.v1",
          },
          fields: { strategy_id: alphaId, name: `Alpha ${alphaId}` },
        }],
      },
    },
  };
}

function commit(value: ProfileProjectionDocument, cursor: string) {
  return repository.commit(value, {
    sourceEpoch: "manager-v2:test",
    sourceCursor: cursor,
    sourceAsOf: new Date("2026-09-02T00:00:00.000Z"),
    receivedAt: new Date(),
    completeness: "COMPLETE",
    retentionSeconds: 86_400,
    maximumJournalEntries: 10_000,
  });
}

function emptyManagerResponse(environment: string, relation: string) {
  return {
    schema_version: "portal.execution.current-source-bff.v2",
    source_environment: environment,
    profile_id: profileId,
    source: {
      authority: "EXECUTION_CELL", profile_id: profileId, availability: "AVAILABLE",
      freshness: "FRESH", completeness: "COMPLETE", as_of: "2026-09-02T00:00:00.000Z",
      data: { relation: { schema: "public", relation }, items: [], next_cursor: null },
    },
  };
}

describe("P4-D follow-on: resumable time-series drains", () => {
  it("persists the drain cursor, resumes from it next cycle and clears it at the tail", async () => {
    const equityCursors: Array<string | undefined> = [];
    let tail = false;
    const source = {
      relationForProjection: async (
        _workspace: string, environment: string, _screen: string,
        _source: string, relation: string, query: { cursor?: string },
      ) => {
        if (relation !== "account_equity_snapshots") return emptyManagerResponse(environment, relation);
        equityCursors.push(query.cursor);
        const ordinal = equityCursors.length;
        const response = emptyManagerResponse(environment, relation) as Record<string, any>;
        response.source.data.items = [{
          relation: { schema: "public", relation }, record_key: "opaque",
          fields: {
            id: { kind: "TEXT", value: `eq_${ordinal}` },
            ts: { kind: "TIMESTAMP", value: new Date().toISOString() },
            account_id: { kind: "TEXT", value: "acc_a" },
            equity: { kind: "DECIMAL", value: "100" },
            mode: { kind: "TEXT", value: environment },
          },
        }];
        response.source.data.next_cursor = tail ? null : `cursor_${ordinal}`;
        return response;
      },
    };
    const worker = new ExecutionProfileProjectionWorker(config, source as never, repository);

    // Cycle 1: no persisted cursor — the drain starts from the beginning and
    // exhausts its ladder page budget; the last next_cursor is persisted.
    await worker.runOnce();
    expect(equityCursors[0]).toBeUndefined();
    const afterFirst = await repository.relationCursor(workspaceId, "paper", profileId, "manager.performance:account_equity_snapshots");
    expect(afterFirst).toBe(`cursor_${equityCursors.length}`);

    // Cycle 2: the drain RESUMES exactly where cycle 1 stopped.
    const resumePoint = afterFirst;
    await worker.runOnce();
    expect(equityCursors.filter((cursor) => cursor === resumePoint).length).toBe(1);

    // Tail: the source stops issuing cursors — the drain KEEPS the last held
    // cursor and follows the (ts, id)-ordered stream forward from there; new
    // rows land strictly after it and the overlap page dedups in the ladder.
    tail = true;
    const beforeTail = await repository.relationCursor(workspaceId, "paper", profileId, "manager.performance:account_equity_snapshots");
    await worker.runOnce();
    expect(await repository.relationCursor(workspaceId, "paper", profileId, "manager.performance:account_equity_snapshots")).toBe(beforeTail);
    await worker.onApplicationShutdown();
  });

  it("drops a persisted cursor the source refuses instead of failing forever", async () => {
    await repository.saveRelationCursor(workspaceId, "paper", profileId, "manager.performance:account_equity_snapshots", "rotted_cursor");
    const source = {
      relationForProjection: async (
        _workspace: string, environment: string, _screen: string,
        _source: string, relation: string, query: { cursor?: string },
      ) => {
        if (relation === "account_equity_snapshots" && query.cursor === "rotted_cursor") {
          const error = new Error("cursor rejected") as Error & { code: string; details: Record<string, unknown> };
          error.code = "N17B_SOURCE_REJECTED";
          error.details = { availability: "UNAVAILABLE", reason_code: "CURSOR_REJECTED", retryable: false };
          throw error;
        }
        return emptyManagerResponse(environment, relation);
      },
    };
    const worker = new ExecutionProfileProjectionWorker(config, source as never, repository);
    await worker.runOnce().catch(() => undefined);
    expect(await repository.relationCursor(workspaceId, "paper", profileId, "manager.performance:account_equity_snapshots")).toBeNull();
    await worker.onApplicationShutdown();
  });
});

describe("Full-depth time-series history store (owner directive 2026-09-03)", () => {
  const equityKey = "manager.performance:account_equity_snapshots";
  const typedRow = (id: string, ts: string, accountId: string) => ({
    relation: { schema: "public", relation: "account_equity_snapshots" }, record_key: "opaque",
    fields: {
      id: { kind: "TEXT", value: id },
      ts: { kind: "TIMESTAMP", value: ts },
      account_id: { kind: "TEXT", value: accountId },
      equity: { kind: "DECIMAL", value: "100" },
      mode: { kind: "TEXT", value: "paper" },
    },
  });

  it("persists every lineage-accepted drained row exactly once, at full depth", async () => {
    const source = {
      relationForProjection: async (
        _workspace: string, environment: string, _screen: string,
        _source: string, relation: string,
      ) => {
        const response = emptyManagerResponse(environment, relation) as Record<string, any>;
        if (relation === "accounts") {
          response.source.data.items = [{
            relation: { schema: "public", relation }, record_key: "opaque",
            fields: { account_id: { kind: "TEXT", value: "acc_a" }, mode: { kind: "TEXT", value: environment } },
          }];
        }
        if (relation === "account_equity_snapshots") {
          response.source.data.items = [
            typedRow("eq_1", "2026-06-30T00:00:00.000Z", "acc_a"),
            typedRow("eq_2", "2026-09-03T00:00:00.000Z", "acc_a"),
            typedRow("eq_ghost", "2026-09-03T01:00:00.000Z", "acc_ghost"),
          ];
        }
        return response;
      },
    };
    const worker = new ExecutionProfileProjectionWorker(config, source as never, repository);
    await worker.runOnce();
    await worker.runOnce(); // overlapping tail pages must stay idempotent

    const coverage = await repository.timeSeriesHistoryCoverage(workspaceId, "paper", profileId, equityKey);
    // eq_ghost is lineage-rejected (no acc_ghost parent) and must NOT reach
    // the store; eq_1 predates the hot window yet IS kept — full depth.
    expect(coverage).toEqual({
      rowCount: 2,
      oldestTs: "2026-06-30T00:00:00.000Z",
      newestTs: "2026-09-03T00:00:00.000Z",
    });
    const page = await repository.timeSeriesHistory(workspaceId, "paper", profileId, equityKey, { limit: 10 });
    expect(page.hasMore).toBe(false);
    expect(page.rows.map((row) => row.rowId)).toEqual(["eq_1", "eq_2"]);
    // The snapshot ladder still applies its declared window: the June row is
    // outside it, so screens embed only the recent point.
    const snapshot = await repository.snapshot(workspaceId, "paper", profileId);
    expect(snapshot?.document.relations[equityKey].items.map((row) => row.fields.id)).toEqual(["eq_2"]);
    await worker.onApplicationShutdown();
  });

  it("serves the history read: keyset pages, range and entity filters, honest coverage", async () => {
    const { ExecutionProfileHistoryService } = await import("../src/execution/profile-history.service");
    const service = new ExecutionProfileHistoryService(config, repository);

    const empty = await service.read("paper", equityKey, {});
    expect(empty).toMatchObject({
      authority: "PORTAL_SGP_HISTORY_MIRROR",
      state: "EMPTY",
      coverage: { row_count: 0, oldest_ts: null, newest_ts: null },
      items: [],
    });

    await repository.appendTimeSeriesHistory(workspaceId, "paper", profileId, equityKey, [
      { rowId: "eq_1", ts: "2026-07-01T00:00:00.000Z", fields: { id: "eq_1", ts: "2026-07-01T00:00:00.000Z", account_id: "acc_a", equity: "1" } },
      { rowId: "eq_2", ts: "2026-08-01T00:00:00.000Z", fields: { id: "eq_2", ts: "2026-08-01T00:00:00.000Z", account_id: "acc_b", equity: "2" } },
      { rowId: "eq_3", ts: "2026-09-01T00:00:00.000Z", fields: { id: "eq_3", ts: "2026-09-01T00:00:00.000Z", account_id: "acc_a", equity: "3" } },
    ]);

    const first = await service.read("paper", equityKey, { limit: 2 });
    expect(first.state).toBe("AVAILABLE");
    expect(first.coverage.row_count).toBe(3);
    expect(first.items.map((item: Record<string, unknown>) => item.id)).toEqual(["eq_1", "eq_2"]);
    expect(first.page).toMatchObject({ has_more: true, next_after_id: "eq_2" });

    const second = await service.read("paper", equityKey, {
      limit: 2, after_ts: first.page.next_after_ts, after_id: first.page.next_after_id,
    });
    expect(second.items.map((item: Record<string, unknown>) => item.id)).toEqual(["eq_3"]);
    expect(second.page.has_more).toBe(false);

    const ranged = await service.read("paper", equityKey, { from: "2026-07-15T00:00:00.000Z", to: "2026-08-15T00:00:00.000Z" });
    expect(ranged.items.map((item: Record<string, unknown>) => item.id)).toEqual(["eq_2"]);

    const filtered = await service.read("paper", equityKey, { account_id: "acc_a" });
    expect(filtered.items.map((item: Record<string, unknown>) => item.id)).toEqual(["eq_1", "eq_3"]);

    await expect(service.read("paper", "manager.orders:orders", {}))
      .rejects.toMatchObject({ code: "N33_HISTORY_RELATION_NOT_ACCEPTED" });
    await expect(service.read("paper", equityKey, { limit: 999_999 }))
      .rejects.toMatchObject({ code: "N33_HISTORY_LIMIT_INVALID" });
    await expect(service.read("paper", equityKey, { after_ts: "2026-08-01T00:00:00.000Z" }))
      .rejects.toMatchObject({ code: "N33_HISTORY_CURSOR_INVALID" });
  });
});

describe("P4-D window ladder merge", () => {
  const row = (id: string, ts: string, entity = "acc_a") => ({
    lineage: { workspace_id: "ws", profile_id: "PAPER_BINANCE_USDM", source_contract_revision: "r" },
    fields: { id, ts, account_id: entity, equity: "1" },
  });
  const ladder = { class: "TIME_SERIES" as const, idField: "id", timestampField: "ts" };

  it("accumulates history across refreshes, dedups by id and drops beyond the window", () => {
    const now = Date.now();
    const iso = (deltaMs: number) => new Date(now - deltaMs).toISOString();
    const previous = [
      row("old", iso(31 * 86_400_000)),
      row("kept", iso(2 * 86_400_000)),
      row("dup", iso(1 * 86_400_000)),
    ];
    const fresh = [row("dup", iso(1 * 86_400_000)), row("new", iso(0))];
    const merged = mergeTimeSeriesWindow(fresh, previous, ladder);
    expect(merged.truncated).toBe(false);
    expect(merged.items.map((item) => item.fields.id)).toEqual(["kept", "dup", "new"]);
  });

  it("keeps the newest rows and flags truncation when the cap bites", () => {
    const now = Date.now();
    const previous = Array.from({ length: WARM_WINDOW_MAX_ROWS }, (_, index) =>
      row(`p${index}`, new Date(now - (WARM_WINDOW_MAX_ROWS - index) * 60_000).toISOString()));
    const fresh = [row("newest", new Date(now).toISOString())];
    const merged = mergeTimeSeriesWindow(fresh, previous, ladder);
    expect(merged.truncated).toBe(true);
    expect(merged.items).toHaveLength(WARM_WINDOW_MAX_ROWS);
    expect(merged.items.at(-1)?.fields.id).toBe("newest");
    expect(merged.items[0]?.fields.id).toBe("p1");
  });
});
