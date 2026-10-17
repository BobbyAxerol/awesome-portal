/** Actual disposable PG + real worker/decoder/mirror +
 * named retained reader. Source and current-authority/publication are SYNTHETIC
 * TEST_ONLY via the existing productReadFixture; this is NOT mounted HTTP,
 * a real Core/PM grant, TLS/source qualification, or runtime commissioning. */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { buildPool } from "../src/db/pool";
import { CurrentSourceProxyError, type CurrentSourceCataloguedOperationPolicy } from "../src/execution/current-source.proxy";
import { ExecutionDurableMirrorRepository } from "../src/execution/durable-mirror.repository";
import { ExecutionProfileProjectionRepository } from "../src/execution/profile-projection.repository";
import { ExecutionProfileProjectionWorker } from "../src/execution/profile-projection.worker";
import { profileProjectionCatalog } from "../src/execution/profile-projection.catalog";
import { MaximumDataOperationService } from "../src/execution/maximum-data-operation.service";
import { managerRelationOperationByRoute } from "../src/execution/eds11r-manager-relation.registry";
import { querySigningKeys } from "../src/config";
import { namedRetainedBusinessResourceId } from "../src/execution/retained-business-aliases";
import { productReadFixture, OWN, PRIVATE } from "./elp2-product-read.fixture";
import { migrateTestDatabase, testConfig, truncateAll } from "./harness";

type Fixture = ReturnType<typeof productReadFixture>;
type Environment = "paper" | "sandbox" | "live";
type Row = Record<string, string | number | boolean | null>;
const TIME = "2026-10-17T00:00:00.000Z", WS = "TEST_ONLY-product-workspace";
const aliases = [
  { relation: "account_sync_current_state", route: "account-sync-current-state",
    source: "manager.current.account-sync-current-state", clock: "updated_at", pk: "account_id" },
  { relation: "account_sync_snapshots", route: "account-sync-snapshots",
    source: "manager.current.account-sync-snapshots", clock: "created_at", pk: "sync_id" },
] as const;
type Alias = (typeof aliases)[number];
const relationKey = (alias: Alias) => alias.source + ":" + alias.relation;
const profile = (environment: Environment) => environment.toUpperCase() + "_BINANCE_USDM";
const config = testConfig({
  FEATURE_EXECUTION_EDGE: "true", EXECUTION_READ_PROFILE: "source_current_v1",
  EXECUTION_EDGE_PRIVATE_KEY_FILE: "/run/secrets/test/delegation.pem",
  EXECUTION_EDGE_CA_FILE: "/run/secrets/test/ca.crt", EXECUTION_EDGE_CLIENT_CERT_FILE: "/run/secrets/test/client.crt",
  EXECUTION_EDGE_CLIENT_KEY_FILE: "/run/secrets/test/client.key", FEATURE_EXECUTION_CURRENT_SOURCE_PAPER: "true",
  EXECUTION_EDGE_PAPER_ORIGIN: "https://paper-edge.internal", EXECUTION_EDGE_PAPER_PROFILE_ID: profile("paper"),
  EXECUTION_EDGE_PAPER_AUDIENCE: "portal-execution-edge-paper",
  FEATURE_EXECUTION_CURRENT_SOURCE_SANDBOX: "false", FEATURE_EXECUTION_CURRENT_SOURCE_LIVE: "false",
  EXECUTION_EDGE_SANDBOX_ORIGIN: "https://sandbox-edge.internal", EXECUTION_EDGE_SANDBOX_PROFILE_ID: profile("sandbox"),
  EXECUTION_EDGE_SANDBOX_AUDIENCE: "portal-execution-edge-sandbox", EXECUTION_EDGE_LIVE_ORIGIN: "https://live-edge.internal",
  EXECUTION_EDGE_LIVE_PROFILE_ID: profile("live"), EXECUTION_EDGE_LIVE_AUDIENCE: "portal-execution-edge-live",
  FEATURE_EXECUTION_LOCAL_PROJECTION: "true", EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: WS,
  EXECUTION_LOCAL_PROJECTION_POLL_INTERVAL_MS: "15000", EXECUTION_LOCAL_PROJECTION_LEASE_TTL_MS: "120000",
  FEATURE_EXECUTION_DURABLE_MIRROR: "true",
});
let pool: Pool, repository: ExecutionProfileProjectionRepository, mirror: ExecutionDurableMirrorRepository;
beforeAll(async () => {
  await migrateTestDatabase(config.DATABASE_URL); pool = buildPool(config.DATABASE_URL);
  mirror = new ExecutionDurableMirrorRepository(config, pool); repository = new ExecutionProfileProjectionRepository(pool, mirror);
});
beforeEach(async () => truncateAll(pool));
afterEach(() => vi.restoreAllMocks());
afterAll(async () => pool.end());

function row(alias: Alias, account = PRIVATE.account_id, id = "PRIVATE-sync", extra: Row = {}): Row {
  return { account_id: account, ...(alias.pk === "sync_id" ? { sync_id: id } : {}), currency: "USDT",
    mode: "paper", status: "READY", [alias.clock]: TIME,
    buying_power: "98765432101234567890.0001", raw_checksum: "MUST_NOT_CAPTURE",
    archive_manifest_id: "MUST_NOT_CAPTURE", source: "MUST_NOT_CAPTURE", venue: "MUST_NOT_CAPTURE", ...extra };
}
function response(environment: Environment, relation: string, rows: Row[] = [], next: string | null = null,
  completeness: "COMPLETE" | "PARTIAL" | "UNKNOWN" = "COMPLETE", freshness = "FRESH") {
  return { schema_version: "portal.execution.current-source-bff.v2", source_environment: environment, profile_id: profile(environment),
    source: { authority: "EXECUTION_CELL", profile_id: profile(environment), availability: "AVAILABLE", freshness, completeness,
      as_of: TIME, data: { relation: { schema: "public", relation }, next_cursor: next,
        items: rows.map(fields => ({ relation: { schema: "public", relation }, record_key: "TEST_ONLY-private-source-key",
          fields: Object.fromEntries(Object.entries(fields).map(([name, value]) => [name, { kind: value === null ? "NULL"
            : typeof value === "boolean" ? "BOOLEAN" : typeof value === "number" ? "INTEGER"
              : name.endsWith("_at") ? "TIMESTAMP" : name === "buying_power" ? "DECIMAL" : "TEXT", value }])) })) } } };
}
type Override = (environment: Environment, relation: string, query: { limit: number; cursor?: string }) => unknown | Promise<unknown>;
function source(override?: Override) {
  return { relationForProjection: vi.fn(async (_workspace: string, environment: Environment, _screen: string,
    _source: string, relation: string, query: { limit: number; cursor?: string }, _policy?: CurrentSourceCataloguedOperationPolicy) => {
      const changed = await override?.(environment, relation, query); if (changed !== undefined) return changed;
      if (relation === "accounts") return response(environment, relation, [PRIVATE.account_id, OWN.account_id].map(account_id => ({ account_id, mode: environment })));
      const alias = aliases.find(value => value.relation === relation);
      return response(environment, relation, alias ? [row(alias, PRIVATE.account_id, "PRIVATE-sync", { mode: environment }),
        row(alias, OWN.account_id, "HIDDEN-sync", { mode: environment, status: "HIDDEN-status" })] : []);
    }) };
}
async function capture(input = source(), cfg = config) {
  const worker = new ExecutionProfileProjectionWorker(cfg, input as never, repository);
  try { await worker.runOnce(); } finally { await worker.onApplicationShutdown(); }
  const snapshot = await repository.rawSnapshot(WS, "paper", profile("paper"));
  if (!snapshot) throw new Error("TEST_ONLY capture did not persist a snapshot");
  return snapshot;
}
function reader(f: Fixture) {
  return new MaximumDataOperationService(f.upstream as never, {} as never, f.config, repository, f.scopes);
}
function read(f: Fixture, alias: Alias, query: { limit?: number; cursor?: string } = {}) {
  return reader(f).relationPage(f.principal, alias.route, { environment: "paper", limit: 20, ...query });
}

describe("ELP2-04 finite account-sync collector through retained named reader (TEST_ONLY)", () => {
  it("adds only two exact static collector/PK contracts; neither becomes a history ladder", () => {
    for (const environment of ["paper", "sandbox", "live"] as const) {
      const bindings = profileProjectionCatalog(environment).filter(binding => aliases.some(alias => alias.relation === binding.relation));
      expect(bindings).toHaveLength(2);
      for (const alias of aliases) {
        const binding = bindings.find(value => value.relation === alias.relation)!;
        expect(binding.sourceId).toBe(alias.source); expect(binding.ladder).toBeUndefined();
        expect(binding.fields).toEqual(alias.pk === "sync_id"
          ? ["sync_id", "account_id", "currency", "mode", "status", "created_at"]
          : ["account_id", "currency", "mode", "status", "updated_at"]);
        expect(managerRelationOperationByRoute(alias.route)).toMatchObject({ identityFields: [alias.pk], sourceId: alias.source });
      }
    }
  });

  it("captures both into real PG/mirror, then serves exact account scope with no private fields or source call on GET", async () => {
    const input = source(), snapshot = await capture(input), f = productReadFixture();
    const authorize = vi.spyOn(f.scopes, "authorize");
    const queries = vi.spyOn(pool, "query");
    const callsAtCapture = input.relationForProjection.mock.calls.length;
    for (const alias of aliases) {
      const relation = snapshot.document.relations[relationKey(alias)];
      expect(relation).toMatchObject({ availability: "AVAILABLE", completeness: "COMPLETE", freshness: "FRESH", as_of: TIME });
      expect(JSON.stringify(relation)).not.toMatch(/MUST_NOT_CAPTURE|98765432101234567890|buying_power|raw_checksum|archive_manifest_id|venue/);
      if (alias.pk === "sync_id") expect(relation.items[0].fields.sync_id).toBe("PRIVATE-sync");
      const mirrored = await mirror.currentPage({ workspaceId: WS, environment: "paper", profileId: profile("paper"), relationKey: relationKey(alias), limit: 20 });
      expect(mirrored.rows).toHaveLength(2);
      const value = await read(f, alias);
      expect(value.records).toHaveLength(1);
      expect(value.records[0].values).toEqual({ account_id: PRIVATE.account_id, currency: "USDT", mode: "paper", status: "READY", [alias.clock]: Date.parse(TIME) });
      expect(value.records[0].resource_id).toBe(namedRetainedBusinessResourceId(querySigningKeys(f.config)[f.config.QUERY_CURSOR_ACTIVE_KEY_ID],
        WS, "paper", profile("paper"), value.logical_operation_id, [`${alias.pk}\u0000${alias.pk === "sync_id" ? "PRIVATE-sync" : PRIVATE.account_id}`]));
      expect(JSON.stringify(value)).not.toMatch(/PRIVATE-sync|HIDDEN-sync|HIDDEN-status|buying_power|raw_checksum|archive_manifest_id|MUST_NOT_CAPTURE/);
      expect(value).toMatchObject({ state: "PARTIAL", coverage: "AUTHORIZED_ONLY", source_health: {
        freshness: "STALE", completeness: "PARTIAL", as_of_ms: null, replay_eligible: false } });
      expect(authorize.mock.calls.some(([, , requirement]) => requirement.action === "account.read" &&
        requirement.dataset?.dataset_id === "relation:" + relationKey(alias) && requirement.dataset.source_revision === snapshot.payloadDigest &&
        requirement.dataset.projection_generation === snapshot.projectionEpoch)).toBe(true);
    }
    expect(input.relationForProjection).toHaveBeenCalledTimes(callsAtCapture);
    expect(f.upstream.relationForCataloguedOperation).not.toHaveBeenCalled();
    expect(f.upstream.relationForNamedOperation).not.toHaveBeenCalled();
    // Real repository reads above use this pool. Genuine scopes are minted by
    // the existing SYNTHETIC authority fixture, not by a claimed real PM grant.
    const statements = queries.mock.calls.map(call => {
      const statement: unknown = call[0];
      if (typeof statement === "string") return statement;
      if (statement && typeof statement === "object" && "text" in statement && typeof statement.text === "string") return statement.text;
      return "TEST_ONLY-unrecognized-query";
    });
    expect(statements.every(statement => /^\s*(?:SELECT|WITH)\b/iu.test(statement))).toBe(true);
    queries.mockRestore();
    const calls = input.relationForProjection.mock.calls.filter(call => aliases.some(alias => alias.relation === call[4]));
    expect(calls).toHaveLength(2);
    for (const call of calls) { expect(call[5]).toEqual({ limit: 200 }); expect(call[6]).toMatchObject({ sourceId: call[3], relation: call[4], maximumResponseBytes: 1048576 }); }
  });

  it("full business authority reads both correlated accounts, without converting either into custody/history authority", async () => {
    await capture(); const f = productReadFixture({ full: true });
    for (const alias of aliases) {
      const value = await read(f, alias); expect(value.records).toHaveLength(2);
      expect(value.records.map(record => record.values.account_id).sort()).toEqual([PRIVATE.account_id, OWN.account_id].sort());
      expect(value.source_history_semantics).toBe("BOUNDED_RETAINED_OBSERVATIONS_NOT_AUTHORITATIVE_REPLAY");
    }
  });

  it("still intersects each new finite alias with the current reviewed fields", async () => {
    await capture(); const f = productReadFixture({ fields: ["status"] });
    for (const alias of aliases) expect((await read(f, alias)).records[0].values).toEqual({ status: "READY" });
  });

  it("preserves real UTC epoch zero, explicit null and an omitted clock rather than inventing observations", async () => {
    await capture(source((environment, relation) => {
      if (environment !== "paper") return undefined;
      if (relation === aliases[0].relation) return response(environment, relation, [row(aliases[0], PRIVATE.account_id, "unused", { updated_at: "1970-01-01T00:00:00.000000Z", status: "0" })]);
      if (relation === aliases[1].relation) { const absent = row(aliases[1], PRIVATE.account_id, "absent"); delete absent.created_at;
        return response(environment, relation, [row(aliases[1], PRIVATE.account_id, "null", { created_at: null }), absent]); }
      return undefined;
    }));
    const f = productReadFixture();
    expect((await read(f, aliases[0])).records[0].values).toMatchObject({ updated_at: 0, status: "0" });
    const values = (await read(f, aliases[1])).records.map(record => record.values);
    expect(values.some(value => Object.hasOwn(value, "created_at") && value.created_at === null)).toBe(true);
    expect(values.some(value => !Object.hasOwn(value, "created_at"))).toBe(true);
  });

  it.each(["tail-at-cap", "continuation-at-cap", "source-partial", "source-unknown"] as const)(
    "retains the existing drain bound and honest snapshot completeness for %s", async mode => {
      const input = source((environment, relation, query) => {
        if (environment !== "paper" || relation !== aliases[1].relation) return undefined;
        if (mode === "source-partial" || mode === "source-unknown") return response(environment, relation,
          [row(aliases[1])], null, mode === "source-partial" ? "PARTIAL" : "UNKNOWN");
        const offset = query.cursor ? Number(query.cursor.split("-").at(-1)) : 0;
        return response(environment, relation, Array.from({ length: 200 }, (_, index) => row(aliases[1], PRIVATE.account_id, `sync-${offset + index}`)),
          mode === "tail-at-cap" && offset === 1800 ? null : `TEST_ONLY-offset-${offset + 200}`);
      });
      const snapshot = await capture(input), relation = snapshot.document.relations[relationKey(aliases[1])];
      const bounded = mode === "tail-at-cap" || mode === "continuation-at-cap";
      expect(input.relationForProjection.mock.calls.filter(call => call[1] === "paper" && call[4] === aliases[1].relation)).toHaveLength(bounded ? 10 : 1);
      expect(relation.items).toHaveLength(bounded ? 2000 : 1);
      expect(relation.completeness).toBe(mode === "tail-at-cap" ? "COMPLETE" : mode === "source-unknown" ? "UNKNOWN" : "PARTIAL");
      const f = productReadFixture(), first = await read(f, aliases[1], { limit: 1 });
      expect(first).toMatchObject({ state: "PARTIAL", source_health: { completeness: "PARTIAL" }, page: { total_unknown: true, maximum_page_rows: 200 } });
      if (bounded) {
        expect(first.page.next_cursor).toEqual(expect.any(String));
        const second = await read(f, aliases[1], { limit: 1, cursor: first.page.next_cursor! });
        expect(second.records[0].resource_id).not.toBe(first.records[0].resource_id);
      }
    });

  it("keeps declared source absence honest instead of carrying older rows or claiming COMPLETE empty", async () => {
    await capture();
    const snapshot = await capture(source((_environment, relation) => {
      if (aliases.some(alias => alias.relation === relation)) throw new CurrentSourceProxyError("N17B_SOURCE_RELATION_UNAVAILABLE", 503);
      return undefined;
    }));
    const f = productReadFixture();
    for (const alias of aliases) {
      expect(snapshot.document.relations[relationKey(alias)]).toMatchObject({ availability: "UNAVAILABLE", items: [] });
      expect(await read(f, alias)).toMatchObject({ records: [], state: "PARTIAL", source_health: { availability: "UNAVAILABLE", completeness: "PARTIAL" } });
    }
  });

  it("isolates same private IDs by configured environment/profile and never captures when the worker is disabled", async () => {
    const input = source();
    await capture(input, { ...config, FEATURE_EXECUTION_CURRENT_SOURCE_SANDBOX: "true", FEATURE_EXECUTION_CURRENT_SOURCE_LIVE: "true" });
    for (const environment of ["paper", "sandbox", "live"] as const) {
      const snapshot = await repository.rawSnapshot(WS, environment, profile(environment));
      for (const alias of aliases) expect(snapshot?.document.relations[relationKey(alias)].items[0]).toMatchObject({
        fields: { mode: environment }, lineage: { workspace_id: WS, profile_id: profile(environment) } });
    }
    const count = input.relationForProjection.mock.calls.length;
    await capture(input, { ...config, FEATURE_EXECUTION_LOCAL_PROJECTION: "false" });
    expect(input.relationForProjection).toHaveBeenCalledTimes(count);
  });

  it("rechecks current account authority after the genuine raw snapshot await and rejects the old cursor", async () => {
    await capture(source((environment, relation) => relation === aliases[1].relation ? response(environment, relation,
      [row(aliases[1], PRIVATE.account_id, "first"), row(aliases[1], PRIVATE.account_id, "second")]) : undefined));
    const f = productReadFixture(), old = await read(f, aliases[1], { limit: 1 });
    expect(old.page.next_cursor).toEqual(expect.any(String));
    const original = repository.rawSnapshot.bind(repository);
    const hook = vi.spyOn(repository, "rawSnapshot").mockImplementationOnce(async (...args) => {
      const snapshot = await original(...args);
      f.context.grants = f.context.grants.filter(grant => grant.action !== "account.read");
      return snapshot;
    });
    try { await expect(read(f, aliases[1], { limit: 1, cursor: old.page.next_cursor! })).rejects.toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE", status: 404 }); }
    finally { hook.mockRestore(); }
    expect(f.upstream.relationForCataloguedOperation).not.toHaveBeenCalled();
  });
});
