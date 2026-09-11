import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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
  documentInvalidReason,
  ExecutionProfileProjectionRepository,
  ProfileProjectionDocument,
} from "../src/execution/profile-projection.repository";
import type { DurableMirrorWriter } from "../src/execution/durable-mirror.contract";
import {
  profileObservationAffectedScreens,
  profileProjectionBindingAdmission,
  profileProjectionCatalog,
} from "../src/execution/profile-projection.catalog";
import { ExecutionProfileProjectionWorker, mergeTimeSeriesWindow, provenanceCompatibleRows } from "../src/execution/profile-projection.worker";
import { WARM_WINDOW_MAX_ROWS } from "../src/execution/profile-projection.catalog";
import { MAXIMUM_DATA_INTAKE_V1 } from "../src/execution/maximum-data-intake";
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
      schema_version: "portal.execution.observation-revision.v1",
      observation_authority: "PORTAL_OBSERVATION",
      observation_semantics: "BOUNDED_CURRENT_PAGE",
      operation_id: "EXECUTION_PROFILE_OBSERVATION_REVISION",
      affected_screen_ids: [
        "EXECUTION_ALPHA_360_SCREEN",
        "EXECUTION_ALPHA_FLEET_LIST_SCREEN",
        "EXECUTION_PORTFOLIO_360_SCREEN",
      ],
      revalidation: {
        schema_version: "portal.execution.observation-revalidation.v1",
        mode: "REFETCH_CURRENT_ROUTE_NAMED_BFF",
        profile_scope: "CURRENT_STREAM_PROFILE_ONLY",
        affected_operation_ids: [
          "executionAlphaFleetListV2",
          "executionAlphaQueryAnalyticsV1",
          "executionPortfolioQueryAnalyticsV1",
        ],
        revision_tick: {
          projection_epoch: first.projectionEpoch,
          projection_sequence: 2,
        },
        redaction: {
          raw_source_relation: "WITHHELD",
          source_cursor: "WITHHELD",
          resource_selector: "WITHHELD",
        },
      },
    });
    expect(replay[1].sourceContractRevision).toBe("manager-v2.test.v1");
    expect(JSON.stringify(replay[1].payload)).not.toContain("manager.");
    // The redaction field names the withheld category, but no raw checkpoint
    // value may cross the local replay boundary.
    expect(JSON.stringify(replay[1].payload)).not.toContain("cursor-3");
    expect((await repository.snapshot(workspaceId, "paper", profileId))?.sourceCursor)
      .toBe("cursor-3");
  });

  it("starts a new local epoch when the accepted source catalogue changes", async () => {
    const firstCatalogue = `sha256:${"1".repeat(64)}`;
    const secondCatalogue = `sha256:${"2".repeat(64)}`;
    const first = await commit(
      cataloguedDocument("alpha-1", firstCatalogue),
      "cursor-catalogue-1",
      `manager-v2:test:${firstCatalogue}`,
    );
    const second = await commit(
      cataloguedDocument("alpha-1", secondCatalogue),
      "cursor-catalogue-2",
      `manager-v2:test:${secondCatalogue}`,
    );
    expect(second).toMatchObject({ changed: true, projectionSequence: 1 });
    expect(second.projectionEpoch).not.toBe(first.projectionEpoch);
    expect((await repository.snapshot(workspaceId, "paper", profileId))?.sourceCatalogueSha256)
      .toBe(secondCatalogue);

    const realtime = new ExecutionProfileRealtimeService(config, repository);
    const events: Array<{ event_type: string }> = [];
    await realtime.subscribe(
      workspaceId, "paper", profileId, `${first.projectionEpoch}:${first.projectionSequence}`,
      (event) => { events.push(event); return true; },
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ event_type: "projection.gap", terminal: true, reconnect_required: true });
    realtime.onApplicationShutdown();
  });

  it("keeps retained row provenance when a newer catalogue starts a new snapshot epoch", async () => {
    const firstCatalogue = `sha256:${"a".repeat(64)}`;
    const secondCatalogue = `sha256:${"b".repeat(64)}`;
    await commit(
      cataloguedDocument("alpha-1", firstCatalogue),
      "cursor-retained-first",
      `manager-v2:test:${firstCatalogue}`,
    );
    const next = cataloguedDocument("alpha-1", secondCatalogue);
    const retained = next.relations[relationKey]!.items[0]!;
    retained.lineage.source_contract_revision = "manager-v2.test.v0";
    retained.lineage.source_catalogue_sha256 = firstCatalogue;

    await commit(next, "cursor-retained-next", `manager-v2:test:${secondCatalogue}`);
    const snapshot = await repository.snapshot(workspaceId, "paper", profileId);
    expect(snapshot?.sourceCatalogueSha256).toBe(secondCatalogue);
    expect(snapshot?.document.relations[relationKey]?.source_catalogue_sha256).toBe(secondCatalogue);
    expect(snapshot?.document.relations[relationKey]?.items[0]?.lineage).toMatchObject({
      source_contract_revision: "manager-v2.test.v0",
      source_catalogue_sha256: firstCatalogue,
    });
  });

  it("never turns browser refreshes or projection misses into AWS-HK reads", async () => {
    await commit(document("123"), "cursor-1");
    let namedCalls = 0;
    const source = new ExecutionProductReadSource(config, repository, {
      relationPage: async () => { namedCalls += 1; throw new Error("unexpected named warm-up read"); },
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
    expect(namedCalls).toBe(0);
    expect((left as any).source.data.items[0].fields.strategy_id).toEqual({
      kind: "TEXT", value: "123",
    });
    expect((left as any).projection.source_cursor).toBeNull();
    expect(JSON.stringify(left)).not.toContain("cursor-1");

    const otherViewer = await source.relation(
      { ...principal, workspaceId: "ws_other" }, "paper", "EXECUTION_ALPHA_FLEET_LIST_SCREEN",
      "manager.strategies", "strategies", { limit: 1 },
    ) as any;
    expect(otherViewer).toMatchObject({
      workspace_id: workspaceId,
      viewer_workspace_id: "ws_other",
    });
    expect(namedCalls).toBe(0);
  });

  it("resolves a deployment before applying the 200-row product page bound", async () => {
    const scoped = deploymentScopeDocument();
    await commit(scoped, "cursor-eds03-scope");
    let namedCalls = 0;
    const source = new ExecutionProductReadSource(config, repository, {
      relationPage: async () => { namedCalls += 1; throw new Error("unexpected named warm-up read"); },
    } as never);
    const principal = {
      principalId: "usr_bobby", sessionId: "ses_eds03", workspaceId,
      roles: ["ADMIN"], authenticationTime: new Date(), authenticationMethods: ["portal_session"],
    };

    const resolution = await source.resolveDeploymentScope(
      principal, "paper", "EXECUTION_PAPER_WORKBENCH_SCREEN", "dep_200",
    );
    expect(resolution).toMatchObject({ state: "FOUND", scope: { deploymentId: "dep_200", tupleUnique: true } });
    if (resolution.state !== "FOUND") throw new Error("expected exact deployment scope");

    const result = await source.relation(
      principal, "paper", "EXECUTION_PAPER_WORKBENCH_SCREEN", "manager.orders", "orders",
      { limit: 200, deploymentScope: resolution.scope },
    ) as any;
    expect(result.source.data).toMatchObject({
      filtered_total_items: 1,
      scope: { resource_kind: "DEPLOYMENT", resource_id: "dep_200", state: "EXACT", reason_code: null },
    });
    expect(result.source.data.items).toHaveLength(1);
    expect(result.source.data.items[0].fields.order_id.value).toBe("ord_200");
    expect(namedCalls).toBe(0);
  });

  it("publishes Blotter derived totals only for a complete local orders population and aggregates the filtered scope", async () => {
    const complete = deploymentScopeDocument();
    complete.relations["manager.orders:orders"].items[0]!.fields.status = "FILLED";
    await commit(complete, "cursor-r2-3-complete");
    const source = new ExecutionProductReadSource(config, repository, {
      relationPage: async () => { throw new Error("unexpected named warm-up read"); },
    } as never);
    const principal = {
      principalId: "usr_bobby", sessionId: "ses_r2_3", workspaceId,
      roles: ["ADMIN"], authenticationTime: new Date(), authenticationMethods: ["portal_session"],
    };

    const exact = await source.relation(
      principal, "paper", "EXECUTION_FULL_BLOTTER_SCREEN", "manager.orders", "orders",
      { limit: 50, status: "FILLED", sort: "submitted_at_desc" },
    ) as any;
    expect(exact.source.data).toMatchObject({
      projected_total_items: 201,
      filtered_total_items: 1,
      window_aggregates: { status: { FILLED: 1 }, venue: { BINANCE: 1 }, side: { UNKNOWN: 1 } },
    });

    const partial = deploymentScopeDocument();
    partial.relations["manager.orders:orders"].items[0]!.fields.status = "FILLED";
    partial.relations["manager.orders:orders"].completeness = "PARTIAL";
    await commit(partial, "cursor-r2-3-partial");
    const withheld = await source.relation(
      principal, "paper", "EXECUTION_FULL_BLOTTER_SCREEN", "manager.orders", "orders",
      { limit: 50, status: "FILLED", sort: "submitted_at_desc" },
    ) as any;
    expect(withheld.source.data).not.toHaveProperty("projected_total_items");
    expect(withheld.source.data).not.toHaveProperty("filtered_total_items");
    expect(withheld.source.data).not.toHaveProperty("window_aggregates");
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
      availability: "AVAILABLE",
      observation: {
        authority: "PORTAL_OBSERVATION",
        semantics: "BOUNDED_CURRENT_PAGE",
        operation_id: "EXECUTION_PROFILE_OBSERVATION_REVISION",
        source: { contract_revision: "manager-v2.test.v1", as_of_ms: 1_788_307_200_000 },
      },
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
    expect(events[0]).toMatchObject({
      event_type: "delta",
      projection_sequence: 2,
      availability: "AVAILABLE",
      observation: {
        authority: "PORTAL_OBSERVATION",
        semantics: "BOUNDED_CURRENT_PAGE",
      },
      payload: {
        schema_version: "portal.execution.observation-revision.v1",
        affected_screen_ids: [
          "EXECUTION_ALPHA_360_SCREEN",
          "EXECUTION_ALPHA_FLEET_LIST_SCREEN",
          "EXECUTION_PORTFOLIO_360_SCREEN",
        ],
        revalidation: {
          mode: "REFETCH_CURRENT_ROUTE_NAMED_BFF",
          affected_operation_ids: [
            "executionAlphaFleetListV2",
            "executionAlphaQueryAnalyticsV1",
            "executionPortfolioQueryAnalyticsV1",
          ],
          redaction: {
            raw_source_relation: "WITHHELD",
            source_cursor: "WITHHELD",
            resource_selector: "WITHHELD",
          },
        },
      },
    });
    expect(JSON.stringify(events[0])).not.toContain("manager.");
    expect(JSON.stringify(events[0])).not.toContain("changed_relations");
    stop();

    const gaps: string[] = [];
    await realtime.subscribe(
      workspaceId, "paper", profileId, "00000000-0000-0000-0000-000000000000:2",
      (event) => { gaps.push(event.event_type); return true; },
    );
    expect(gaps).toEqual(["projection.gap"]);
    realtime.onApplicationShutdown();
  });

  it("maps observation revisions to profile-compatible named BFFs only", () => {
    const paper = profileObservationAffectedScreens("paper", ["manager.strategies:strategies"]);
    expect(paper).toEqual([
      "EXECUTION_ALPHA_360_SCREEN",
      "EXECUTION_ALPHA_FLEET_LIST_SCREEN",
      "EXECUTION_PORTFOLIO_360_SCREEN",
    ]);

    const sandbox = profileObservationAffectedScreens("sandbox", ["manager.sessions:execution_sessions"]);
    expect(sandbox).toEqual(expect.arrayContaining([
      "SANDBOX_TRADING_SCREEN",
      "EXECUTION_SANDBOX_CERTIFICATION_SCREEN",
    ]));
    expect(sandbox).not.toContain("PAPER_TRADING_SCREEN");

    const live = profileObservationAffectedScreens("live", ["manager.orders:orders"]);
    expect(live).toEqual(expect.arrayContaining([
      "LIVE_OPERATIONS_SCREEN",
      "EXECUTION_CANARY_CONTROL_ROOM_SCREEN",
      "EXECUTION_LIVE_FULL_OPERATIONS_SCREEN",
    ]));
    expect(live).not.toContain("EXECUTION_PAPER_WORKBENCH_SCREEN");
    expect(profileObservationAffectedScreens("paper", ["manager.private:never_publish"]))
      .toEqual([]);
  });

  it("keeps the versioned observation fixture browser-safe and operation-bound", () => {
    const fixture = JSON.parse(readFileSync(
      resolve(__dirname, "fixtures/eds11-observation-revalidation.v1.json"),
      "utf8",
    )) as { cases: Array<{ payload: { revalidation: Record<string, unknown> } }> };
    expect(fixture.cases).toHaveLength(2);
    for (const entry of fixture.cases) {
      const serialized = JSON.stringify(entry.payload);
      expect(entry.payload.revalidation).toMatchObject({
        schema_version: "portal.execution.observation-revalidation.v1",
        mode: "REFETCH_CURRENT_ROUTE_NAMED_BFF",
        profile_scope: "CURRENT_STREAM_PROFILE_ONLY",
        redaction: {
          raw_source_relation: "WITHHELD",
          source_cursor: "WITHHELD",
          resource_selector: "WITHHELD",
        },
      });
      expect(serialized).not.toContain("manager.");
      expect(serialized).not.toContain("cursor-");
      expect(serialized).not.toContain("https://");
    }
  });

  it("fans one sanitized local revision to 100 clients without multiplying journal reads", async () => {
    vi.useFakeTimers();
    const realtime = new ExecutionProfileRealtimeService(config, repository);
    const stops: Array<() => void> = [];
    const batches: Array<Array<Record<string, unknown>>> = [];
    let journalAfter: { mockRestore: () => void } | null = null;
    try {
      const first = await commit(document("alpha-1"), "cursor-private-first");
      for (let index = 0; index < 100; index += 1) {
        const batch: Array<Record<string, unknown>> = [];
        batches.push(batch);
        stops.push(await realtime.subscribe(
          workspaceId,
          "paper",
          profileId,
          `${first.projectionEpoch}:${first.projectionSequence}`,
          (event) => { batch.push(event as unknown as Record<string, unknown>); return true; },
        ));
      }
      journalAfter = vi.spyOn(repository, "journalAfter");
      await commit(document("alpha-2"), "cursor-private-second");
      await (realtime as unknown as { tick(): Promise<void> }).tick();

      expect(journalAfter).toHaveBeenCalledTimes(1);
      expect(batches).toHaveLength(100);
      for (const batch of batches) {
        expect(batch).toHaveLength(1);
        expect(batch[0]).toMatchObject({
          event_type: "delta",
          payload: {
            schema_version: "portal.execution.observation-revision.v1",
            revalidation: {
              mode: "REFETCH_CURRENT_ROUTE_NAMED_BFF",
              revision_tick: {
                projection_epoch: first.projectionEpoch,
                projection_sequence: 2,
              },
            },
          },
        });
        expect(JSON.stringify(batch[0])).not.toContain("cursor-private");
        expect(JSON.stringify(batch[0])).not.toContain("manager.");
      }
    } finally {
      for (const stop of stops) stop();
      journalAfter?.mockRestore();
      realtime.onApplicationShutdown();
      vi.useRealTimers();
    }
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
    expect(value.relations.strategies).toMatchObject({ state: "AVAILABLE", truncated: false });
    expect(JSON.stringify(value)).not.toContain("manager.");
    expect(JSON.stringify(value)).not.toContain("cursor-1");
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

  /**
   * PHASE 5 (round 2) · the mandatory test: COMPLETE has to be reachable.
   *
   * On dev, 6,360 journal rows and three snapshots had never once been
   * COMPLETE. The cause was not the source and not the condition — it was that
   * `account_balances` carries no `mode`, so the source hands the SAME rows to
   * every profile and each profile keeps its own. Live kept 0 of 85, Paper 42
   * of 85, Sandbox 35 of 85, and all three were marked PARTIAL for correctly
   * discarding rows that were never theirs. COMPLETE was unreachable by
   * construction.
   *
   * This builds exactly that cycle — a profile-owned parent, a child relation
   * carrying both its own rows and a foreign one — and asserts the outcome is
   * COMPLETE with the foreign row gone and counted.
   */
  it("reaches COMPLETE when the only dropped rows belonged to another profile", async () => {
    const source = {
      relationForProjection: async (
        _workspace: string, environment: string, _screen: string,
        _source: string, relation: string,
      ) => {
        if (relation === "accounts") {
          return managerResponseWith(environment, relation, [
            { account_id: "acc_paper", mode: environment, external_account_ref: "ext_paper" },
          ]);
        }
        if (relation === "account_balances") {
          // No `mode` on this relation — which is the whole reason the source
          // cannot scope it and Portal has to.
          return managerResponseWith(environment, relation, [
            { account_id: "acc_paper", currency: "USDT", total: "10" },
            { account_id: "acc_live", currency: "USDT", total: "9000" },
          ]);
        }
        return emptyManagerResponse(environment, relation);
      },
    };
    const worker = new ExecutionProfileProjectionWorker(config, source as never, repository);
    await worker.runOnce();
    const snapshot = await repository.snapshot(workspaceId, "paper", profileId);

    expect(snapshot?.completeness).toBe("COMPLETE");
    const balances = snapshot?.document.relations["manager.accounts:account_balances"];
    expect(balances?.completeness).toBe("COMPLETE");
    expect(balances?.items).toHaveLength(1);
    // Document rows keep the source's narrowed values under `fields`, beside
    // the lineage stamp the projection adds.
    expect(balances?.items[0]).toMatchObject({ fields: { account_id: "acc_paper", currency: "USDT" } });
    // The dropped row is not hidden: it is counted, under a name that says it
    // was never ours rather than that we lost it.
    expect(balances?.lineage_scoped_out).toEqual({ account: 1 });
    expect(balances?.lineage_rejects).toBeUndefined();
    await worker.onApplicationShutdown();
  });

  it("still reports PARTIAL when the parent page was cut short, because then the row is unaccounted for", async () => {
    const source = {
      relationForProjection: async (
        _workspace: string, environment: string, _screen: string,
        _source: string, relation: string,
      ) => {
        if (relation === "accounts") {
          // The source itself says this page is incomplete, so an account we
          // have not seen may still exist and the orphan proves nothing.
          const response = managerResponseWith(environment, relation, [
            { account_id: "acc_paper", mode: environment, external_account_ref: "ext_paper" },
          ]) as Record<string, any>;
          response.source.completeness = "PARTIAL";
          return response;
        }
        if (relation === "account_balances") {
          return managerResponseWith(environment, relation, [
            { account_id: "acc_paper", currency: "USDT", total: "10" },
            { account_id: "acc_unseen", currency: "USDT", total: "1" },
          ]);
        }
        return emptyManagerResponse(environment, relation);
      },
    };
    const worker = new ExecutionProfileProjectionWorker(config, source as never, repository);
    await worker.runOnce();
    const snapshot = await repository.snapshot(workspaceId, "paper", profileId);

    expect(snapshot?.completeness).toBe("PARTIAL");
    const balances = snapshot?.document.relations["manager.accounts:account_balances"];
    expect(balances?.completeness).toBe("PARTIAL");
    expect(balances?.lineage_rejects).toEqual({ account: 1 });
    await worker.onApplicationShutdown();
  });

  it("isolates a source relation that remains over the wire budget after bounded page reduction", async () => {
    const source = {
      relationForProjection: async (
        _workspace: string, environment: string, _screen: string,
        _source: string, relation: string,
      ) => {
        if (relation === "broker_account_sync_effective") {
          throw new CurrentSourceProxyError("N17B_SOURCE_RESPONSE_TOO_LARGE", 413, {
            reason_code: "MANAGER_V2_SOURCE_RESPONSE_TOO_LARGE",
          });
        }
        return emptyManagerResponse(environment, relation);
      },
    };
    const worker = new ExecutionProfileProjectionWorker(config, source as never, repository);
    await expect(worker.runOnce()).resolves.toBeUndefined();
    const snapshot = await repository.snapshot(workspaceId, "paper", profileId);
    expect(snapshot?.completeness).toBe("PARTIAL");
    expect(snapshot?.document.relations["manager.accounts:broker_account_sync_effective"]).toMatchObject({
      availability: "UNAVAILABLE",
      reason_code: "MANAGER_V2_SOURCE_RESPONSE_TOO_LARGE",
      items: [],
    });
    expect(snapshot?.document.relations["manager.strategies:strategies"]?.availability).toBe("AVAILABLE");
    await worker.onApplicationShutdown();
  });

  it("fails a paced refresh closed when durable observation admission quarantines", async () => {
    const quarantiningMirror: DurableMirrorWriter = {
      commitAcceptedProjection: async () => ({
        outcome: "QUARANTINED",
        reasonCode: "EDS09B_DURABLE_OBSERVATION_QUARANTINED",
      }),
    };
    const quarantinedRepository = new ExecutionProfileProjectionRepository(pool, quarantiningMirror);
    const source = {
      relationForProjection: async (
        _workspace: string, environment: string, _screen: string,
        _source: string, relation: string,
      ) => emptyManagerResponse(environment, relation),
    };
    const worker = new ExecutionProfileProjectionWorker(config, source as never, quarantinedRepository);
    await expect(worker.runOnce()).rejects.toThrow(
      "N31_PROFILE_PROJECTION_CYCLE_FAILED:paper:EDS09B_DURABLE_OBSERVATION_QUARANTINED",
    );
    expect(await quarantinedRepository.snapshot(workspaceId, "paper", profileId)).toBeNull();
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
    expect(calls).toBe(profileProjectionCatalog("paper").length + 9);
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

  it("persists the accepted catalogue identity through worker, journal and local SSE", async () => {
    const source = {
      relationForProjection: async (
        _workspace: string, environment: string, _screen: string,
        _source: string, relation: string,
      ) => emptyManagerResponse(environment, relation),
    };
    const worker = new ExecutionProfileProjectionWorker(config, source as never, repository);
    await worker.runOnce();

    const expected = MAXIMUM_DATA_INTAKE_V1.returnPack.catalogueDigest;
    const snapshot = await repository.snapshot(workspaceId, "paper", profileId);
    expect(snapshot?.sourceCatalogueSha256).toBe(expected);
    expect(snapshot?.sourceEpoch).toContain(expected);
    expect(snapshot?.document.source_catalogue_sha256).toBe(expected);
    for (const relation of Object.values(snapshot?.document.relations ?? {})) {
      expect(relation.source_catalogue_sha256).toBe(expected);
      expect(relation.items.every((row) => row.lineage.source_catalogue_sha256 === expected)).toBe(true);
    }

    const [entry] = await repository.journalAfter(
      workspaceId, "paper", profileId, snapshot!.projectionEpoch, 0, 1,
    );
    expect(entry.sourceCatalogueSha256).toBe(expected);

    const realtime = new ExecutionProfileRealtimeService(config, repository);
    const envelope = await realtime.snapshot(workspaceId, "paper", profileId);
    expect(envelope.observation?.source.catalogue_revision).toBe(expected);
    expect(envelope.payload).toMatchObject({ source_catalogue_sha256: expected });
    expect(JSON.stringify(envelope)).not.toContain("manager.");
    realtime.onApplicationShutdown();
    await worker.onApplicationShutdown();
  });

  it("admits only R1 named or explicit projection-input relations into the static projection catalog", () => {
    for (const environment of ["paper", "sandbox", "live"] as const) {
      for (const binding of profileProjectionCatalog(environment)) {
        expect(profileProjectionBindingAdmission(binding)).toMatch(/SCREEN_BOUND_NAMED_OPERATION|PORTAL_PROJECTION_ONLY/);
      }
    }
    expect(() => profileProjectionBindingAdmission({ relation: "audit_log" }))
      .toThrow("EDS11R projection relation is not admissible");
    expect(() => profileProjectionBindingAdmission({ relation: "venue_credentials" }))
      .toThrow("EDS11R projection relation is not admissible");
  });

  it("routes catalogued projection relations through fixed EDS-11R operations", async () => {
    const policies: Array<{ relation: string; policy?: { relation: string; sourceId: string } }> = [];
    const source = {
      relationForProjection: async (
        _workspace: string, environment: string, _screen: string,
        _source: string, relation: string, _query: unknown,
        policy?: { relation: string; sourceId: string },
      ) => {
        policies.push({ relation, policy });
        return emptyManagerResponse(environment, relation);
      },
    };
    const worker = new ExecutionProfileProjectionWorker(config, source as never, repository);
    await worker.runOnce();

    for (const relation of ["portfolio_equity_snapshots", "sizing_decisions", "risk_grants"]) {
      expect(policies.find((call) => call.relation === relation)?.policy).toMatchObject({
        relation,
        sourceId: expect.stringMatching(/^manager\.current\./),
      });
    }
    expect(profileProjectionCatalog("sandbox").find((binding) => binding.relation === "risk_grants"))
      .toMatchObject({ screenId: "EXECUTION_GATE_R2_REVIEW_SCREEN" });
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

function deploymentScopeDocument(): ProfileProjectionDocument {
  const lineage = {
    workspace_id: workspaceId,
    profile_id: profileId,
    source_contract_revision: "manager-v2.test.v1",
  };
  const deployments = Array.from({ length: 201 }, (_, ordinal) => ({
    lineage,
    fields: {
      deployment_id: `dep_${ordinal}`,
      strategy_id: `strat_${ordinal}`,
      account_id: `acct_${ordinal}`,
      mode: "paper",
      venue: "BINANCE",
    },
  }));
  const orders = Array.from({ length: 201 }, (_, ordinal) => ({
    lineage,
    fields: {
      order_id: `ord_${ordinal}`,
      deployment_id: `dep_${ordinal}`,
      strategy_id: `strat_${ordinal}`,
      account_id: `acct_${ordinal}`,
      mode: "paper",
      venue: "BINANCE",
      status: "WORKING",
      submitted_at: `2026-09-02T00:${String(ordinal % 60).padStart(2, "0")}:00.000Z`,
    },
  }));
  return {
    schema_version: "portal.execution.profile-projection.v1",
    workspace_id: workspaceId,
    environment: "paper",
    profile_id: profileId,
    source_contract_revision: "manager-v2.test.v1",
    relations: {
      "manager.deployments:strategy_deployments": relation("manager.deployments", "strategy_deployments", deployments),
      "manager.orders:orders": relation("manager.orders", "orders", orders),
    },
  };
}

function relation(
  sourceId: string,
  relationName: string,
  items: ProfileProjectionDocument["relations"][string]["items"],
) {
  return {
    source_id: sourceId,
    relation: relationName,
    availability: "AVAILABLE" as const,
    reason_code: null,
    as_of: "2026-09-02T00:00:00.000Z",
    freshness: "FRESH" as const,
    completeness: "COMPLETE" as const,
    items,
  };
}

function commit(value: ProfileProjectionDocument, cursor: string, sourceEpoch = "manager-v2:test") {
  return repository.commit(value, {
    sourceEpoch,
    sourceCursor: cursor,
    sourceAsOf: new Date("2026-09-02T00:00:00.000Z"),
    receivedAt: new Date(),
    completeness: "COMPLETE",
    retentionSeconds: 86_400,
    maximumJournalEntries: 10_000,
  });
}

function cataloguedDocument(alphaId: string, catalogue: string): ProfileProjectionDocument {
  const value = document(alphaId);
  value.source_catalogue_sha256 = catalogue;
  for (const relation of Object.values(value.relations)) {
    relation.source_catalogue_sha256 = catalogue;
    for (const row of relation.items) row.lineage.source_catalogue_sha256 = catalogue;
  }
  return value;
}

/** The same envelope with rows, tagged the way the source tags them. */
function managerResponseWith(
  environment: string, relation: string,
  rows: readonly Record<string, string>[],
) {
  const response = emptyManagerResponse(environment, relation) as Record<string, any>;
  response.source.data.items = rows.map((row) => ({
    relation: { schema: "public", relation }, record_key: "opaque",
    fields: Object.fromEntries(Object.entries(row).map(([key, value]) => [key, { kind: "TEXT", value }])),
  }));
  return response;
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

  it("keeps the tail cursor young by forcing a fresh issue from the final overlap page", async () => {
    // The source's opaque cursors expire five minutes after issue and a tail
    // page issues none — the drain must trade one bounded re-read (limit K-1)
    // for a freshly issued cursor, or the dwell would decay into a full
    // head re-walk every TTL.
    const calls: Array<{ cursor?: string; limit?: number }> = [];
    const tailRow = (n: number) => ({
      relation: { schema: "public", relation: "account_equity_snapshots" }, record_key: "opaque",
      fields: {
        id: { kind: "INTEGER", value: n },
        ts: { kind: "TIMESTAMP", value: new Date().toISOString() },
        account_id: { kind: "TEXT", value: "acc_a" },
        mode: { kind: "TEXT", value: "paper" },
      },
    });
    const source = {
      relationForProjection: async (
        _workspace: string, environment: string, _screen: string,
        _source: string, relation: string, query: { cursor?: string; limit?: number },
      ) => {
        const response = emptyManagerResponse(environment, relation) as Record<string, any>;
        if (relation !== "account_equity_snapshots") return response;
        calls.push({ cursor: query.cursor, limit: query.limit });
        if (!query.cursor) {
          response.source.data.items = [tailRow(1)];
          response.source.data.next_cursor = "held";
        } else if (query.cursor === "held" && query.limit === 200) {
          response.source.data.items = [tailRow(2), tailRow(3)];
          response.source.data.next_cursor = null;
        } else if (query.cursor === "held" && query.limit === 1) {
          response.source.data.items = [tailRow(2)];
          response.source.data.next_cursor = "held_fresh";
        }
        return response;
      },
    };
    const worker = new ExecutionProfileProjectionWorker(config, source as never, repository);
    await worker.runOnce();
    expect(calls.some((call) => call.cursor === "held" && call.limit === 1)).toBe(true);
    expect(await repository.relationCursor(workspaceId, "paper", profileId, "manager.performance:account_equity_snapshots"))
      .toBe("held_fresh");
    await worker.onApplicationShutdown();
  });

  it("defers a failed ladder refresh instead of erasing the accumulated window", async () => {
    const equityKey = "manager.performance:account_equity_snapshots";
    let failEquity = false;
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
          if (failEquity) {
            throw new CurrentSourceProxyError("N17B_SOURCE_REJECTED", 422, {
              availability: "UNAVAILABLE",
              reason_code: "MANAGER_V2_SOURCE_CONTRACT_REJECTED",
              retryable: false,
            });
          }
          response.source.data.items = [{
            relation: { schema: "public", relation }, record_key: "opaque",
            fields: {
              id: { kind: "INTEGER", value: 7 },
              ts: { kind: "TIMESTAMP", value: new Date().toISOString() },
              account_id: { kind: "TEXT", value: "acc_a" },
              equity: { kind: "DECIMAL", value: "100" },
              mode: { kind: "TEXT", value: environment },
            },
          }];
        }
        return response;
      },
    };
    const worker = new ExecutionProfileProjectionWorker(config, source as never, repository);
    await worker.runOnce();
    expect((await repository.snapshot(workspaceId, "paper", profileId))
      ?.document.relations[equityKey].items).toHaveLength(1);

    failEquity = true;
    await repository.saveRelationCursor(workspaceId, "paper", profileId, equityKey, "about_to_expire");
    await worker.runOnce();
    const relation = (await repository.snapshot(workspaceId, "paper", profileId))?.document.relations[equityKey];
    expect(relation).toMatchObject({
      availability: "AVAILABLE",
      reason_code: "N31_LADDER_REFRESH_DEFERRED",
      completeness: "PARTIAL",
    });
    expect(relation?.items).toHaveLength(1);
    // The rejected cursor is still dropped so the next cycle can re-seek.
    expect(await repository.relationCursor(workspaceId, "paper", profileId, equityKey)).toBeNull();
    await worker.onApplicationShutdown();
  });

  it("isolates a relation the proxy does not accept instead of failing the whole profile (DR-16)", async () => {
    const source = {
      relationForProjection: async (
        _workspace: string, environment: string, _screen: string,
        _source: string, relation: string,
      ) => {
        if (relation === "risk_grants") {
          const error = new Error("not accepted") as Error & { code: string };
          error.code = "N23_PROFILE_READ_NOT_ACCEPTED";
          throw error;
        }
        return emptyManagerResponse(environment, relation);
      },
    };
    const worker = new ExecutionProfileProjectionWorker(config, source as never, repository);
    await worker.runOnce();
    const snapshot = await repository.snapshot(workspaceId, "paper", profileId);
    expect(snapshot).not.toBeNull();
    const rejected = Object.entries(snapshot!.document.relations)
      .filter(([, relation]) => relation.availability === "UNAVAILABLE");
    expect(rejected.map(([key]) => key)).toEqual(
      expect.arrayContaining([expect.stringContaining("risk_grants")]));
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
    await expect(worker.runOnce()).resolves.toBeUndefined();
    expect(await repository.relationCursor(workspaceId, "paper", profileId, "manager.performance:account_equity_snapshots")).toBeNull();
    await worker.onApplicationShutdown();
  });

  it("isolates a typed source-unavailable relation without aborting the profile cycle", async () => {
    const source = {
      relationForProjection: async (
        _workspace: string, environment: string, _screen: string,
        _source: string, relation: string,
      ) => {
        if (relation === "command_journal") {
          const error = new Error("source unavailable") as Error & { code: string; details: Record<string, unknown> };
          error.code = "N17B_SOURCE_REJECTED";
          error.details = { availability: "UNAVAILABLE", reason_code: "MANAGER_V2_SOURCE_UNAVAILABLE", retryable: false };
          throw error;
        }
        return emptyManagerResponse(environment, relation);
      },
    };
    const worker = new ExecutionProfileProjectionWorker(config, source as never, repository);
    await expect(worker.runOnce()).resolves.toBeUndefined();
    const snapshot = await repository.snapshot(workspaceId, "paper", profileId);
    expect(snapshot?.document.relations["manager.command-journal:command_journal"]).toMatchObject({
      availability: "UNAVAILABLE",
      reason_code: "MANAGER_V2_SOURCE_UNAVAILABLE",
      items: [],
    });
    await worker.onApplicationShutdown();
  });
});

describe("Full-depth time-series history store (owner directive 2026-09-03)", () => {
  const equityKey = "manager.performance:account_equity_snapshots";
  // The live source serves INTEGER sequence ids for the time-series
  // relations — the store must keep them, not just TEXT ids.
  const typedRow = (id: number, ts: string, accountId: string) => ({
    relation: { schema: "public", relation: "account_equity_snapshots" }, record_key: "opaque",
    fields: {
      id: { kind: "INTEGER", value: id },
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
            typedRow(101, "2026-06-30T00:00:00.000Z", "acc_a"),
            typedRow(102, "2026-09-03T00:00:00.000Z", "acc_a"),
            typedRow(103, "2026-09-03T01:00:00.000Z", "acc_ghost"),
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
    expect(page.rows.map((row) => row.rowId)).toEqual(["101", "102"]);
    // The snapshot ladder still applies its declared window: the June row is
    // outside it, so screens embed only the recent point.
    const snapshot = await repository.snapshot(workspaceId, "paper", profileId);
    expect(snapshot?.document.relations[equityKey].items.map((row) => row.fields.id)).toEqual([102]);
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

    const retainedOrders = await service.read("paper", "manager.orders:orders", {});
    expect(retainedOrders).toMatchObject({
      authority: "PORTAL_SGP_HISTORY_MIRROR",
      relation_key: "manager.orders:orders",
      state: "EMPTY",
      coverage: { row_count: 0 },
    });
    await expect(service.read("paper", "manager.strategies:strategies", {}))
      .rejects.toMatchObject({ code: "N33_HISTORY_RELATION_NOT_ACCEPTED" });
    await expect(service.read("paper", equityKey, { limit: 999_999 }))
      .rejects.toMatchObject({ code: "N33_HISTORY_LIMIT_INVALID" });
    await expect(service.read("paper", equityKey, { after_ts: "2026-08-01T00:00:00.000Z" }))
      .rejects.toMatchObject({ code: "N33_HISTORY_CURSOR_INVALID" });
  });
});

describe("Full-range downsampled history read (owner directive 2026-09-03)", () => {
  const equityKey = "manager.performance:account_equity_snapshots";
  const seed = async () => {
    const rows: Array<{ rowId: string; ts: string; fields: Record<string, string | number> }> = [];
    const start = Date.UTC(2026, 7, 1);
    for (const account of ["acc_a", "acc_b"]) {
      for (let hour = 0; hour < 240; hour += 1) {
        const ts = new Date(start + hour * 3_600_000).toISOString();
        const id = `${account}_${hour}`;
        const equity = account === "acc_a" && hour === 120 ? "1"
          : account === "acc_a" && hour === 168 ? "99999"
            : "1000";
        rows.push({ rowId: id, ts, fields: { id, ts, account_id: account, deployment_id: "dep_1", equity } });
      }
    }
    await repository.appendTimeSeriesHistory(workspaceId, "paper", profileId, equityKey, rows as never);
    return { start, total: rows.length };
  };

  it("covers the whole range and preserves per-bucket extrema with real rows only", async () => {
    const { start, total } = await seed();
    const page = await repository.timeSeriesHistoryDownsampled(workspaceId, "paper", profileId, equityKey, {
      from: new Date(start - 1000).toISOString(),
      seriesField: "account_id", valueField: "equity", targetPoints: 60,
    });
    expect(page.sourceRows).toBe(total);
    expect(page.downsample).toMatchObject({ method: "PER_SERIES_BUCKET_EXTREMA", series_count: 2 });
    expect(page.rows.length).toBeLessThanOrEqual(60);
    // Whole range: first and last day are both represented.
    expect(Date.parse(page.rows[0].ts)).toBeLessThan(start + 86_400_000);
    expect(Date.parse(page.rows.at(-1)!.ts)).toBeGreaterThan(start + 9 * 86_400_000);
    // Extrema survive by construction; every row is a real seeded row.
    const ids = page.rows.map((row) => row.rowId);
    expect(ids).toContain("acc_a_120");
    expect(ids).toContain("acc_a_168");
    expect(ids.every((id) => /^acc_[ab]_\d+$/.test(id))).toBe(true);

    // A small range needs no downsampling: exact rows come back declared so.
    const exact = await repository.timeSeriesHistoryDownsampled(workspaceId, "paper", profileId, equityKey, {
      from: new Date(start - 1000).toISOString(),
      seriesField: "account_id", valueField: "equity", targetPoints: 1_000,
    });
    expect(exact.downsample).toBeNull();
    expect(exact.rows).toHaveLength(total);

    // Entity filtering narrows before bucketing.
    const filtered = await repository.timeSeriesHistoryDownsampled(workspaceId, "paper", profileId, equityKey, {
      from: new Date(start - 1000).toISOString(),
      entity: { field: "account_id", value: "acc_b" },
      seriesField: "account_id", valueField: "equity", targetPoints: 30,
    });
    expect(filtered.sourceRows).toBe(240);
    expect(filtered.rows.every((row) => row.rowId.startsWith("acc_b_"))).toBe(true);
  });
});

describe("Daily closes for cross-alpha statistics (§14 E1)", () => {
  const equityKey = "manager.performance:account_equity_snapshots";
  it("returns one real last-close row per strategy/account/day", async () => {
    const rows = [];
    for (const [account, base] of [["acc_a", 100], ["acc_b", 500]] as const) {
      for (let day = 0; day < 2; day += 1) {
        for (let sample = 0; sample < 3; sample += 1) {
          const ts = new Date(Date.UTC(2026, 8, 1 + day, 4 + sample * 8)).toISOString();
          const id = `${account}_${day}_${sample}`;
          rows.push({ rowId: id, ts, fields: {
            id, ts, strategy_id: "alpha_x", account_id: account,
            equity: String(base + day * 10 + sample),
          }});
        }
      }
    }
    await repository.appendTimeSeriesHistory(workspaceId, "paper", profileId, equityKey, rows as never);
    const closes = await repository.timeSeriesDailyCloses(workspaceId, "paper", profileId, equityKey, {
      from: "2026-08-31T00:00:00.000Z", valueField: "equity",
    });
    expect(closes).toEqual([
      { strategyId: "alpha_x", accountId: "acc_a", day: "2026-09-01", value: "102" },
      { strategyId: "alpha_x", accountId: "acc_a", day: "2026-09-02", value: "112" },
      { strategyId: "alpha_x", accountId: "acc_b", day: "2026-09-01", value: "502" },
      { strategyId: "alpha_x", accountId: "acc_b", day: "2026-09-02", value: "512" },
    ]);
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

describe("row provenance across catalogues (dev 2026-09-07: a pre-catalogue warm window froze the paper projection)", () => {
  const digest = MAXIMUM_DATA_INTAKE_V1.returnPack.catalogueDigest;
  const base = { workspace_id: "ws", profile_id: "PAPER_BINANCE_USDM", source_contract_revision: "r" };
  const bare = { lineage: { ...base }, fields: { id: "old", ts: "2026-09-01T00:00:00.000Z" } };
  const stamped = { lineage: { ...base, source_catalogue_sha256: digest }, fields: { id: "new", ts: "2026-09-02T00:00:00.000Z" } };

  it("drops rows without a catalogue under a catalogued document, rows with one under a bare document, and keeps the rest", () => {
    expect(provenanceCompatibleRows([bare, stamped], digest)).toEqual({ rows: [stamped], dropped: 1 });
    expect(provenanceCompatibleRows([bare, stamped], undefined)).toEqual({ rows: [bare], dropped: 1 });
    expect(provenanceCompatibleRows([], digest)).toEqual({ rows: [], dropped: 0 });
  });

  it("names the refused check instead of a bare code, and accepts the same document once the rows fit", () => {
    const relationKey = "manager.performance:account_equity_snapshots";
    const document = {
      schema_version: "portal.execution.profile-projection.v1", environment: "paper", profile_id: "PAPER_BINANCE_USDM",
      workspace_id: "ws", source_contract_revision: "r", source_catalogue_sha256: digest,
      relations: { [relationKey]: { source_id: "manager.performance", relation: "account_equity_snapshots", availability: "AVAILABLE", reason_code: null, as_of: null, freshness: "FRESH", completeness: "COMPLETE", source_catalogue_sha256: digest, items: [bare, stamped] } },
    } as unknown as ProfileProjectionDocument;
    expect(documentInvalidReason(document)).toBe(`relation ${relationKey}: 1 rows whose lineage catalogue does not fit the document (catalogued document, rows without a catalogue)`);
    const repaired = { ...document, relations: { [relationKey]: { ...document.relations[relationKey], items: provenanceCompatibleRows([bare, stamped], digest).rows } } };
    expect(documentInvalidReason(repaired)).toBeNull();
    expect(documentInvalidReason({ ...document, relations: {} })).toBe("no relations");
    expect(documentInvalidReason({ ...document, relations: { [relationKey]: { ...document.relations[relationKey], source_catalogue_sha256: undefined, items: [] } } })).toBe(`relation ${relationKey}: relation catalogue missing under a catalogued document`);
  });
});
