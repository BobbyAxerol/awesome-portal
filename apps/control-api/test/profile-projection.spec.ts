import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { buildPool } from "../src/db/pool";
import { ExecutionProductReadSource } from "../src/execution/product-read-source";
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
import { ExecutionProfileProjectionWorker } from "../src/execution/profile-projection.worker";
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
    expect((await realtime.snapshot(workspaceId, "paper", profileId)).event_type).toBe("snapshot");
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
