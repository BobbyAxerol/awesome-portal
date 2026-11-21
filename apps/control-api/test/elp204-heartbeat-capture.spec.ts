/** Actual disposable PG + real worker/decoder/projection/mirror.
 * All source envelopes are SYNTHETIC. No HTTP/TLS/source authority or runtime
 * commissioning. This tests capture only; V2 public purpose remains closed. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { buildPool } from "../src/db/pool";
import { CurrentSourceProxyError, type CurrentSourceCataloguedOperationPolicy } from "../src/execution/current-source.proxy";
import { ExecutionDurableMirrorRepository } from "../src/execution/durable-mirror.repository";
import { ExecutionProfileProjectionRepository } from "../src/execution/profile-projection.repository";
import { ExecutionProfileProjectionWorker } from "../src/execution/profile-projection.worker";
import { profileProjectionCatalog, profileObservationAffectedScreens } from "../src/execution/profile-projection.catalog";
import { managerRelationOperationByRelation, managerRelationProfileBinding } from "../src/execution/eds11r-manager-relation.registry";
import { namedRetainedRelationAction } from "../src/execution/retained-operation-page";
import { migrateTestDatabase, testConfig, truncateAll } from "./harness";

const WS = "TEST_ONLY-heartbeat-capture", TIME = "2026-10-17T00:00:00.000Z";
const SOURCE = "manager.current.service-heartbeats", RELATION = "service_heartbeats", KEY = SOURCE + ":" + RELATION;
type Environment = "paper" | "sandbox" | "live";
type Quality = "COMPLETE" | "PARTIAL" | "UNKNOWN";
type Row = Record<string, string | number | boolean | null>;
const profile = (environment: Environment) => environment.toUpperCase() + "_BINANCE_USDM";
const config = testConfig({
  FEATURE_EXECUTION_EDGE: "true", EXECUTION_EDGE_PRIVATE_KEY_FILE: "/run/secrets/test/delegation.pem",
  EXECUTION_EDGE_CA_FILE: "/run/secrets/test/ca.crt", EXECUTION_EDGE_CLIENT_CERT_FILE: "/run/secrets/test/client.crt",
  EXECUTION_EDGE_CLIENT_KEY_FILE: "/run/secrets/test/client.key",
  FEATURE_EXECUTION_CURRENT_SOURCE_PAPER: "true", EXECUTION_EDGE_PAPER_ORIGIN: "https://paper-edge.internal",
  EXECUTION_EDGE_PAPER_PROFILE_ID: profile("paper"), EXECUTION_EDGE_PAPER_AUDIENCE: "portal-execution-edge-paper",
  FEATURE_EXECUTION_CURRENT_SOURCE_SANDBOX: "true", EXECUTION_EDGE_SANDBOX_ORIGIN: "https://sandbox-edge.internal",
  EXECUTION_EDGE_SANDBOX_PROFILE_ID: profile("sandbox"), EXECUTION_EDGE_SANDBOX_AUDIENCE: "portal-execution-edge-sandbox",
  FEATURE_EXECUTION_CURRENT_SOURCE_LIVE: "true", EXECUTION_EDGE_LIVE_ORIGIN: "https://live-edge.internal",
  EXECUTION_EDGE_LIVE_PROFILE_ID: profile("live"), EXECUTION_EDGE_LIVE_AUDIENCE: "portal-execution-edge-live",
  FEATURE_EXECUTION_CURRENT_SOURCE_PAPER_DNSE: "false", FEATURE_EXECUTION_LOCAL_PROJECTION: "true",
  EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: WS, EXECUTION_LOCAL_PROJECTION_POLL_INTERVAL_MS: "15000",
  EXECUTION_LOCAL_PROJECTION_LEASE_TTL_MS: "120000", FEATURE_EXECUTION_DURABLE_MIRROR: "true",
});
let pool: Pool, repository: ExecutionProfileProjectionRepository, mirror: ExecutionDurableMirrorRepository;
beforeAll(async () => {
  await migrateTestDatabase(config.DATABASE_URL); pool = buildPool(config.DATABASE_URL);
  mirror = new ExecutionDurableMirrorRepository(config, pool);
  repository = new ExecutionProfileProjectionRepository(pool, mirror);
});
beforeEach(async () => truncateAll(pool));
afterAll(async () => pool.end());

function response(environment: Environment, relation: string, rows: Row[] = [], next: string | null = null,
  completeness: Quality = "COMPLETE", freshness = "FRESH", asOf: string | null = TIME) {
  return { schema_version: "portal.execution.current-source-bff.v2", source_environment: environment, profile_id: profile(environment),
    source: { authority: "EXECUTION_CELL", profile_id: profile(environment), availability: "AVAILABLE", freshness,
      completeness, as_of: asOf, data: { relation: { schema: "public", relation }, next_cursor: next,
        items: rows.map(row => ({ relation: { schema: "public", relation }, record_key: "TEST_ONLY-private-source-key",
          fields: Object.fromEntries(Object.entries(row).map(([key, value]) => [key, {
            kind: value === null ? "NULL" : typeof value === "boolean" ? "BOOLEAN"
              : typeof value === "number" ? "INTEGER" : key.endsWith("_at") ? "TIMESTAMP" : "TEXT", value,
          }])) })) } } };
}
function heartbeat(environment: Environment, name = "TEST_ONLY-service", extra: Row = {}): Row {
  return { service_name: name, last_seen_at: TIME, status: "TEST_ONLY_" + environment + "_UNINTERPRETED", ...extra };
}
type Override = (environment: Environment, relation: string, query: { limit: number; cursor?: string }) => unknown | Promise<unknown>;
function source(override?: Override) {
  return { relationForProjection: vi.fn(async (_workspace: string, environment: Environment, _screen: string,
    _source: string, relation: string, query: { limit: number; cursor?: string }, _operationPolicy?: CurrentSourceCataloguedOperationPolicy) => {
      const overridden = await override?.(environment, relation, query);
      return overridden !== undefined ? overridden : response(environment, relation,
        relation === RELATION ? [heartbeat(environment)] : []);
    }) };
}
async function capture(input: ReturnType<typeof source>, cfg = config) {
  const worker = new ExecutionProfileProjectionWorker(cfg, input as never, repository);
  try { await worker.runOnce(); } finally { await worker.onApplicationShutdown(); }
  return repository.rawSnapshot(WS, "paper", profile("paper"));
}
const heartbeatCalls = (input: ReturnType<typeof source>) => input.relationForProjection.mock.calls.filter(call => call[4] === RELATION);

describe("ELP2-04 finite heartbeat capture, not public reader commissioning", () => {
  it("adds one exact generated operation per existing profile, no ladder, topology field or V2 purpose", () => {
    expect(managerRelationOperationByRelation(RELATION)).toMatchObject({ operationId: "managerServiceHeartbeatsPageV1",
      sourceId: SOURCE, relation: RELATION, identityFields: ["service_name"], identityDisposition: "DECLARED_PRIMARY_KEY" });
    for (const environment of ["paper", "sandbox", "live"] as const) {
      const bindings = profileProjectionCatalog(environment).filter(binding => binding.relation === RELATION);
      expect(bindings).toHaveLength(1);
      expect(bindings[0]).toMatchObject({ key: "service_heartbeats", screenId: "EXECUTION_COMMAND_CENTER_SCREEN",
        sourceId: SOURCE, fields: ["service_name", "last_seen_at", "status"] });
      expect(bindings[0].ladder).toBeUndefined();
      expect(profileObservationAffectedScreens(environment, [KEY])).toContain("EXECUTION_COMMAND_CENTER_SCREEN");
    }
    expect(() => namedRetainedRelationAction(RELATION)).toThrow("EXECUTION_NAMED_PURPOSE_NOT_COMMISSIONED");
  });

  it("persists source scalars exactly under declared PK and strips instance topology/other source fields", async () => {
    const input = source((environment, relation) => relation === RELATION ? response(environment, relation,
      [heartbeat(environment, "TEST_ONLY-service", { instance_id: "MUST_NOT_CAPTURE", arbitrary_field: "MUST_NOT_CAPTURE" })]) : undefined);
    const snapshot = await capture(input);
    const relation = snapshot!.document.relations[KEY];
    expect(relation).toMatchObject({ availability: "AVAILABLE", completeness: "COMPLETE", freshness: "FRESH", as_of: TIME,
      items: [{ fields: heartbeat("paper"), lineage: { workspace_id: WS, profile_id: profile("paper") } }] });
    expect(JSON.stringify(relation)).not.toContain("MUST_NOT_CAPTURE");
    expect(relation.window).toBeUndefined();
    const calls = heartbeatCalls(input); expect(calls).toHaveLength(3);
    for (const call of calls) {
      expect(call[0]).toBe(WS); expect(call[2]).toBe("EXECUTION_COMMAND_CENTER_SCREEN"); expect(call[3]).toBe(SOURCE);
      expect(call[5]).toEqual({ limit: 200 });
      expect(call[6]).toMatchObject({ operationId: "managerServiceHeartbeatsPageV1", sourceId: SOURCE, relation: RELATION,
        maximumResponseBytes: 1048576, sourceMaximumConcurrency: 4,
        profileMaximumConcurrency: managerRelationProfileBinding(call[1]).maximumObservedConcurrency });
    }
    const gaps = await pool.query("SELECT reason_code FROM execution_durable_mirror_gaps WHERE workspace_id=$1 AND relation_key=$2", [WS, KEY]);
    expect(gaps.rows).toEqual([]);
    for (const environment of ["paper", "sandbox", "live"] as const) {
      const current = await mirror.currentPage({ workspaceId: WS, environment, profileId: profile(environment), relationKey: KEY, limit: 20 });
      expect(current.rows).toEqual([{ entity_key: '["TEST_ONLY-service"]', fields: heartbeat(environment) }]);
    }
  });

  it("updates the same source PK rather than appending a new identity when status/time changes", async () => {
    await capture(source());
    const later = "2026-10-17T00:01:00.000Z";
    await capture(source((environment, relation) => relation === RELATION ? response(environment, relation,
      [heartbeat(environment, "TEST_ONLY-service", { status: "TEST_ONLY_NEW_TEXT", last_seen_at: later })], null, "COMPLETE", "FRESH", later) : undefined));
    const rows = await pool.query("SELECT entity_key,fields FROM execution_durable_mirror_current_entities WHERE workspace_id=$1 AND environment='paper' AND relation_key=$2", [WS, KEY]);
    expect(rows.rows).toEqual([{ entity_key: '["TEST_ONLY-service"]', fields: heartbeat("paper", "TEST_ONLY-service", {
      status: "TEST_ONLY_NEW_TEXT", last_seen_at: later }) }]);
  });

  it.each(["worker-disabled", "retained-review", "all-source-profiles-disabled"] as const)("does not activate collection in %s", async mode => {
    const input = source();
    const cfg = { ...config, ...(mode === "worker-disabled" ? { FEATURE_EXECUTION_LOCAL_PROJECTION: "false" as const }
      : mode === "retained-review" ? { EXECUTION_READ_PROFILE: "retained_review_v1" as const }
        : { FEATURE_EXECUTION_CURRENT_SOURCE_PAPER: "false" as const, FEATURE_EXECUTION_CURRENT_SOURCE_SANDBOX: "false" as const,
          FEATURE_EXECUTION_CURRENT_SOURCE_LIVE: "false" as const }) };
    expect(await capture(input, cfg)).toBeNull(); expect(input.relationForProjection).not.toHaveBeenCalled();
  });

  it("never copies a disabled profile's heartbeat from an enabled profile", async () => {
    const input = source(); await capture(input, { ...config, FEATURE_EXECUTION_CURRENT_SOURCE_LIVE: "false" });
    expect(heartbeatCalls(input).map(call => call[1])).toEqual(["paper", "sandbox"]);
    expect(await repository.rawSnapshot(WS, "live", profile("live"))).toBeNull();
    for (const environment of ["paper", "sandbox"] as const) {
      const snapshot = await repository.rawSnapshot(WS, environment, profile(environment));
      expect(snapshot!.document.relations[KEY].items[0]).toMatchObject({ lineage: { profile_id: profile(environment) },
        fields: { status: "TEST_ONLY_" + environment + "_UNINTERPRETED" } });
    }
  });

  it.each(["PARTIAL", "UNKNOWN"] as const)("preserves source %s even with no next page", async quality => {
    const snapshot = await capture(source((environment, relation) => relation === RELATION
      ? response(environment, relation, [heartbeat(environment)], null, quality) : undefined));
    expect(snapshot!.document.relations[KEY].completeness).toBe(quality);
  });

  it("does not replace absent source/row clocks with the Portal observation clock or reinterpret status", async () => {
    const snapshot = await capture(source((environment, relation) => relation === RELATION
      ? response(environment, relation, [heartbeat(environment, "TEST_ONLY-service", { last_seen_at: null, status: null })], null, "COMPLETE", "STALE", null) : undefined));
    expect(snapshot!.document.relations[KEY]).toMatchObject({ as_of: null, freshness: "STALE",
      items: [{ fields: { last_seen_at: null, status: null } }] });
  });

  it.each(["tail-at-cap", "continuation-at-cap"] as const)("retains the unchanged ten-page bound with %s", async mode => {
    const input = source((environment, relation, query) => {
      if (environment !== "paper" || relation !== RELATION) return undefined;
      const offset = query.cursor ? Number(query.cursor.split("-").at(-1)) : 0;
      return response(environment, relation, Array.from({ length: 200 }, (_, index) => heartbeat(environment, "TEST_ONLY-service-" + (offset + index))),
        mode === "tail-at-cap" && offset === 1800 ? null : "TEST_ONLY-offset-" + (offset + 200));
    });
    const snapshot = await capture(input), relation = snapshot!.document.relations[KEY];
    const calls = heartbeatCalls(input).filter(call => call[1] === "paper");
    expect(calls).toHaveLength(10); expect(calls.every(call => call[5].limit === 200)).toBe(true);
    expect(relation.items).toHaveLength(2000); expect(relation.completeness).toBe(mode === "tail-at-cap" ? "COMPLETE" : "PARTIAL");
  });

  it("keeps a declared unavailable relation unavailable without copying an older successful current page", async () => {
    await capture(source());
    const snapshot = await capture(source((_environment, relation) => {
      if (relation === RELATION) throw new CurrentSourceProxyError("N17B_SOURCE_RELATION_UNAVAILABLE", 503);
      return undefined;
    }));
    expect(snapshot!.document.relations[KEY]).toMatchObject({ availability: "UNAVAILABLE", completeness: "UNKNOWN",
      as_of: null, items: [], reason_code: "N17B_SOURCE_RELATION_UNAVAILABLE" });
  });

  it("refuses a wrong-profile source envelope, persists recovery and never commits those rows", async () => {
    const input = source((environment, relation) => {
      if (environment !== "paper" || relation !== RELATION) return undefined;
      return { ...response(environment, relation, [heartbeat(environment)]), profile_id: profile("live") };
    });
    await expect(capture(input)).resolves.toBeNull();
    expect(await repository.rawSnapshot(WS, "paper", profile("paper"))).toBeNull();
    const health = await repository.refreshHealth(WS, "paper", profile("paper"));
    expect(health).toMatchObject({ state: "RECOVERING", consecutiveFailures: 1,
      reasonCode: "N22_PROFILE_CONTEXT_MISMATCH" });
    expect(health.retryNotBefore!.valueOf()).toBeGreaterThan(health.lastFailureAt!.valueOf());
    expect((await mirror.currentPage({ workspaceId: WS, environment: "paper", profileId: profile("paper"),
      relationKey: KEY, limit: 20 })).rows).toEqual([]);
    for (const environment of ["sandbox", "live"] as const) {
      const snapshot = await repository.rawSnapshot(WS, environment, profile(environment));
      expect(snapshot!.document.relations[KEY].items[0].fields).toEqual(heartbeat(environment));
    }
  });

  it("refuses repeated source cursors instead of looping or labelling the truncated corpus COMPLETE", async () => {
    const input = source((environment, relation) => environment === "paper" && relation === RELATION
      ? response(environment, relation, [heartbeat(environment)], "TEST_ONLY-repeated") : undefined);
    await expect(capture(input)).rejects.toThrow("N31_SOURCE_CURSOR_CYCLE");
    expect(heartbeatCalls(input).filter(call => call[1] === "paper")).toHaveLength(2);
    expect(await repository.rawSnapshot(WS, "paper", profile("paper"))).toBeNull();
  });
});
