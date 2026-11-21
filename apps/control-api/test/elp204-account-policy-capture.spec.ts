/** Actual disposable PostgreSQL capture regressions; synthetic source only.
 * Actual disposable PG + real worker/decoder/snapshot/mirror when run by the
 * primary. Source envelopes are SYNTHETIC, never a source/publication grant.
 * Six captured metadata fields only. Public metadata still needs current
 * account.read, reviewed fields and qualified population; never a live grant.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { buildPool } from "../src/db/pool";
import { CurrentSourceProxyError, type CurrentSourceCataloguedOperationPolicy } from "../src/execution/current-source.proxy";
import { ExecutionDurableMirrorRepository } from "../src/execution/durable-mirror.repository";
import { ExecutionProfileProjectionRepository } from "../src/execution/profile-projection.repository";
import { ExecutionProfileProjectionWorker } from "../src/execution/profile-projection.worker";
import { profileProjectionCatalog, profileObservationAffectedScreens } from "../src/execution/profile-projection.catalog";
import { managerRelationOperationByRelation, managerRelationProfileBinding } from "../src/execution/eds11r-manager-relation.registry";
import { NAMED_RETAINED_PURPOSES, namedRetainedRelationAction } from "../src/execution/retained-operation-page";
import { migrateTestDatabase, testConfig, truncateAll } from "./harness";
import { productReadFixture, PRIVATE } from "./elp2-product-read.fixture";

const WS = productReadFixture().principal.workspaceId, TIME = "2026-10-17T00:00:00.000Z";
const SOURCE = "manager.current.account-policies", RELATION = "account_policies", KEY = SOURCE + ":" + RELATION;
const ACCOUNT = PRIVATE.account_id, POLICY = "TEST_ONLY-policy-A";
const FIELDS = ["account_policy_id", "account_id", "mode", "venue", "created_at", "updated_at"];
type Environment = "paper" | "sandbox" | "live";
type Quality = "COMPLETE" | "PARTIAL" | "UNKNOWN";
type Row = Record<string, string | number | boolean | null>;
const environments = ["paper", "sandbox", "live"] as const;
const profile = (environment: Environment) => environment.toUpperCase() + "_BINANCE_USDM";
const config = testConfig({
  FEATURE_EXECUTION_EDGE: "true", EXECUTION_READ_PROFILE: "source_current_v1",
  EXECUTION_EDGE_PRIVATE_KEY_FILE: "/run/secrets/test/delegation.pem", EXECUTION_EDGE_CA_FILE: "/run/secrets/test/ca.crt",
  EXECUTION_EDGE_CLIENT_CERT_FILE: "/run/secrets/test/client.crt", EXECUTION_EDGE_CLIENT_KEY_FILE: "/run/secrets/test/client.key",
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
type Override = (environment: Environment, relation: string, query: { limit: number; cursor?: string }) => unknown | Promise<unknown>;
function response(environment: Environment, relation: string, rows: Row[] = [], next: string | null = null,
  completeness: Quality = "COMPLETE", freshness = "FRESH", asOf: string | null = TIME) {
  return { schema_version: "portal.execution.current-source-bff.v2", source_environment: environment, profile_id: profile(environment),
    source: { authority: "EXECUTION_CELL", profile_id: profile(environment), availability: "AVAILABLE", freshness,
      completeness, as_of: asOf, data: { relation: { schema: "public", relation }, next_cursor: next,
        items: rows.map(fields => ({ relation: { schema: "public", relation }, record_key: "TEST_ONLY-opaque-not-the-current-PK",
          fields: Object.fromEntries(Object.entries(fields).map(([name, value]) => [name, { kind: value === null ? "NULL"
            : typeof value === "boolean" ? "BOOLEAN" : typeof value === "number" ? "INTEGER"
              : name.endsWith("_at") ? "TIMESTAMP" : ["maker_fee_bps", "default_leverage"].includes(name) ? "DECIMAL" : "TEXT", value }])) })) } } };
}
function row(environment: Environment, id = POLICY, extra: Row = {}): Row {
  return { account_policy_id: id, account_id: ACCOUNT, mode: environment, venue: "BINANCE_USDM", created_at: TIME, updated_at: TIME, ...extra };
}
function source(override?: Override) {
  return { relationForProjection: vi.fn(async (_workspace: string, environment: Environment, _screen: string,
    _source: string, relation: string, query: { limit: number; cursor?: string }, _policy?: CurrentSourceCataloguedOperationPolicy) => {
      const changed = await override?.(environment, relation, query); if (changed !== undefined) return changed;
      // Genuine post-profile-filter parent is necessary: account IDs in policy
      // rows must not bypass the existing generic profile-lineage predicate.
      return response(environment, relation, relation === "accounts" ? [{ account_id: ACCOUNT, mode: environment }]
        : relation === RELATION ? [row(environment)] : []);
    }) };
}
const policyCalls = (input: ReturnType<typeof source>) => input.relationForProjection.mock.calls.filter(call => call[4] === RELATION);

describe.skipIf(!process.env.TEST_DATABASE_URL)("ELP2-04 account-policy six-field private capture / actual PG, synthetic source", () => {
  let pool: Pool, repository: ExecutionProfileProjectionRepository, mirror: ExecutionDurableMirrorRepository;
  beforeAll(async () => {
    await migrateTestDatabase(config.DATABASE_URL); pool = buildPool(config.DATABASE_URL);
    mirror = new ExecutionDurableMirrorRepository(config, pool); repository = new ExecutionProfileProjectionRepository(pool, mirror);
  });
  beforeEach(async () => truncateAll(pool));
  afterAll(async () => { vi.restoreAllMocks(); if (pool) await pool.end(); });
  async function capture(input = source(), cfg = config) {
    const worker = new ExecutionProfileProjectionWorker(cfg, input as never, repository);
    try { await worker.runOnce(); } finally { await worker.onApplicationShutdown(); }
    return repository.rawSnapshot(WS, "paper", profile("paper"));
  }
  const current = (environment: Environment = "paper") => mirror.currentPage({ workspaceId: WS, environment,
    profileId: profile(environment), relationKey: KEY, limit: 200 });

  it("uses one exact declared-PK metadata binding per existing environment with finite account-read purpose", () => {
    expect(managerRelationOperationByRelation(RELATION)).toMatchObject({ operationId: "managerAccountPoliciesPageV1",
      sourceId: SOURCE, relation: RELATION, identityFields: ["account_policy_id"], identityDisposition: "DECLARED_PRIMARY_KEY" });
    for (const environment of environments) {
      const bindings = profileProjectionCatalog(environment).filter(binding => binding.relation === RELATION);
      expect(bindings).toHaveLength(1); expect(bindings[0]).toMatchObject({ key: "account_policies",
        screenId: "EXECUTION_ACCOUNT_BROKER_360_SCREEN", sourceId: SOURCE, fields: FIELDS });
      expect(bindings[0].ladder).toBeUndefined();
      expect(profileObservationAffectedScreens(environment, [KEY])).toContain("EXECUTION_ACCOUNT_BROKER_360_SCREEN");
    }
    expect(NAMED_RETAINED_PURPOSES.account_policies).toBe("account.read");
    expect(namedRetainedRelationAction(RELATION)).toBe("account.read");
  });
  it("real worker→snapshot→mirror keeps six exact fields in all three configured profiles and strips economic/private extras", async () => {
    const input = source((environment, relation) => relation === RELATION ? response(environment, relation, [row(environment, POLICY, {
      maker_fee_bps: "12.5", default_leverage: "20", allow_borrowing: true, loan_package_id: "MUST_NOT_CAPTURE",
      maintenance_margin_rate: "0.005", raw_secret_token: "MUST_NOT_CAPTURE", arbitrary_field: "MUST_NOT_CAPTURE" })]) : undefined);
    await capture(input);
    for (const environment of environments) {
      const snapshot = await repository.rawSnapshot(WS, environment, profile(environment));
      const relation = snapshot!.document.relations[KEY];
      expect(relation).toMatchObject({ availability: "AVAILABLE", completeness: "COMPLETE", freshness: "FRESH", as_of: TIME,
        items: [{ fields: row(environment), lineage: { workspace_id: WS, profile_id: profile(environment) } }] });
      expect(Object.keys(relation.items[0].fields).sort()).toEqual([...FIELDS].sort());
      expect(JSON.stringify(relation)).not.toMatch(/maker_fee_bps|default_leverage|allow_borrowing|loan_package_id|maintenance_margin_rate|MUST_NOT_CAPTURE|opaque-not-the-current-PK/);
      expect(relation.window).toBeUndefined(); expect((await current(environment)).rows).toEqual([{ entity_key: JSON.stringify([POLICY]), fields: row(environment) }]);
    }
    const calls = policyCalls(input); expect(calls).toHaveLength(3);
    for (const call of calls) { expect(call[0]).toBe(WS); expect(call[2]).toBe("EXECUTION_ACCOUNT_BROKER_360_SCREEN");
      expect(call[3]).toBe(SOURCE); expect(call[5]).toEqual({ limit: 200 });
      expect(call[6]).toMatchObject({ operationId: "managerAccountPoliciesPageV1", sourceId: SOURCE, relation: RELATION,
        maximumResponseBytes: 1048576, sourceMaximumConcurrency: 4,
        profileMaximumConcurrency: managerRelationProfileBinding(call[1]).maximumObservedConcurrency }); }
    expect((await pool.query("SELECT reason_code FROM execution_durable_mirror_gaps WHERE workspace_id=$1 AND relation_key=$2", [WS, KEY])).rows).toEqual([]);
  });
  it("keys policies by declared policy ID, not shared account ID or source record_key, and updates existing current identity", async () => {
    await capture(source((environment, relation) => relation === RELATION ? response(environment, relation,
      [row(environment), row(environment, "TEST_ONLY-policy-B")]) : undefined));
    const first = await pool.query("SELECT entity_key,first_observed_batch_id FROM execution_durable_mirror_current_entities WHERE workspace_id=$1 AND environment='paper' AND relation_key=$2 ORDER BY entity_key", [WS, KEY]);
    expect(first.rows.map(value => value.entity_key)).toEqual([JSON.stringify([POLICY]), '["TEST_ONLY-policy-B"]']);
    const later = "2026-10-17T00:01:00.000Z";
    await capture(source((environment, relation) => relation === RELATION ? response(environment, relation,
      [row(environment, POLICY, { venue: "BINANCE_USDM_RETAINED_TEXT", updated_at: later }), row(environment, "TEST_ONLY-policy-B")], null, "COMPLETE", "FRESH", later) : undefined));
    expect((await current()).rows).toEqual([{ entity_key: JSON.stringify([POLICY]), fields: row("paper", POLICY, { venue: "BINANCE_USDM_RETAINED_TEXT", updated_at: later }) },
      { entity_key: '["TEST_ONLY-policy-B"]', fields: row("paper", "TEST_ONLY-policy-B") }]);
    const after = await pool.query("SELECT entity_key,first_observed_batch_id FROM execution_durable_mirror_current_entities WHERE workspace_id=$1 AND environment='paper' AND relation_key=$2 ORDER BY entity_key", [WS, KEY]);
    expect(after.rows).toEqual(first.rows);
  });
  it("serves the genuine worker-captured uppercase mode through the finite reader without rewriting source case", async () => {
    const snapshot = await capture(source((environment, relation) => relation === RELATION
      ? response(environment, relation, [row(environment, POLICY, { mode: environment.toUpperCase() })]) : undefined));
    const f = productReadFixture();
    f.repository.rawSnapshot.mockResolvedValue(snapshot!);
    f.repository.snapshotMetadata.mockResolvedValue(snapshot!);
    f.repository.snapshot.mockResolvedValue(snapshot!);
    const value = await f.maximum.relationPage(f.principal, "account-policies", { environment: "paper", limit: 20 });
    expect(value.records).toHaveLength(1);
    expect(value.records[0].values).toEqual({ account_id: ACCOUNT, mode: "PAPER", venue: "BINANCE_USDM",
      created_at: Date.parse(TIME), updated_at: Date.parse(TIME) });
    expect(JSON.stringify(value)).not.toContain(POLICY);
    expect((await current()).rows[0].fields.mode).toBe("PAPER");
    expect(f.upstream.relationForCataloguedOperation).not.toHaveBeenCalled();
  });
  it("preserves null/omitted source clocks and UTC epoch zero without replacing them with observation time", async () => {
    const input = source((environment, relation) => {
      if (relation !== RELATION) return undefined;
      const omitted = row(environment, "TEST_ONLY-no-updated-at"); delete omitted.updated_at;
      return response(environment, relation, [row(environment, POLICY, { created_at: "1970-01-01T00:00:00.000000Z", updated_at: null }), omitted], null, "COMPLETE", "STALE", null);
    });
    const snapshot = await capture(input), relation = snapshot!.document.relations[KEY];
    expect(relation).toMatchObject({ as_of: null, freshness: "STALE" });
    expect(relation.items[0].fields).toMatchObject({ created_at: "1970-01-01T00:00:00.000000Z", updated_at: null });
    expect(Object.hasOwn(relation.items[1].fields, "updated_at")).toBe(false);
    expect((await current()).rows.map(value => value.fields)).toEqual(expect.arrayContaining(relation.items.map(value => value.fields)));
  });
  it.each(["COMPLETE", "PARTIAL"] as const)("does not accept a policy outside the same-cycle %s account parent population", async quality => {
    const snapshot = await capture(source((environment, relation) => relation === "accounts"
      ? response(environment, relation, [], null, quality) : undefined));
    const relation = snapshot!.document.relations[KEY];
    expect(relation.items).toEqual([]);
    expect(relation.completeness).toBe(quality);
    expect((await current()).rows).toEqual([]);
    if (quality === "COMPLETE") {
      expect(relation.lineage_scoped_out).toEqual({ account: 1 });
      expect(relation.lineage_rejects).toBeUndefined();
    } else {
      expect(relation.reason_code).toBe("N30_PROFILE_LINEAGE_REJECTED");
      expect(relation.lineage_rejects).toEqual({ account: 1 });
      expect(relation.lineage_scoped_out).toBeUndefined();
    }
  });
  it("does not substitute account ID when the declared policy PK is absent; mirror records its existing typed key gap", async () => {
    const snapshot = await capture(source((environment, relation) => {
      if (relation !== RELATION) return undefined; const missingKey = row(environment); delete missingKey.account_policy_id;
      return response(environment, relation, [missingKey]);
    }));
    expect(snapshot!.document.relations[KEY].items).toHaveLength(1); expect((await current()).rows).toEqual([]);
    expect((await pool.query("SELECT reason_code FROM execution_durable_mirror_gaps WHERE workspace_id=$1 AND environment='paper' AND relation_key=$2", [WS, KEY])).rows)
      .toEqual([{ reason_code: "EDS06_CURRENT_ENTITY_KEY_MISSING" }]);
  });
  it.each(["PARTIAL", "UNKNOWN"] as const)("does not promote new policy source %s to COMPLETE just because no cursor remains", async quality => {
    const snapshot = await capture(source((environment, relation) => relation === RELATION ? response(environment, relation, [row(environment)], null, quality) : undefined));
    expect(snapshot!.document.relations[KEY].completeness).toBe(quality);
  });
  it.each(["tail-at-cap", "continuation-at-cap"] as const)("the added static binding inherits ten×200 drain semantics at %s", async mode => {
    const input = source((environment, relation, query) => {
      if (environment !== "paper" || relation !== RELATION) return undefined;
      const offset = query.cursor ? Number(query.cursor.split("-").at(-1)) : 0;
      return response(environment, relation, Array.from({ length: 200 }, (_, index) => row(environment, "TEST_ONLY-policy-" + (offset + index))),
        mode === "tail-at-cap" && offset === 1800 ? null : "TEST_ONLY-offset-" + (offset + 200));
    });
    const snapshot = await capture(input), relation = snapshot!.document.relations[KEY];
    const calls = policyCalls(input).filter(call => call[1] === "paper");
    expect(calls).toHaveLength(10); expect(calls.every(call => call[5].limit === 200)).toBe(true);
    expect(relation.items).toHaveLength(2000); expect(relation.completeness).toBe(mode === "tail-at-cap" ? "COMPLETE" : "PARTIAL");
    expect(Number((await pool.query("SELECT count(*) FROM execution_durable_mirror_current_entities WHERE workspace_id=$1 AND environment='paper' AND relation_key=$2", [WS, KEY])).rows[0].count)).toBe(2000);
  });
  it("source absence remains UNAVAILABLE rather than reusing an older COMPLETE policy snapshot", async () => {
    await capture(); const snapshot = await capture(source((_environment, relation) => {
      if (relation === RELATION) throw new CurrentSourceProxyError("N17B_SOURCE_RELATION_UNAVAILABLE", 503); return undefined;
    }));
    expect(snapshot!.document.relations[KEY]).toMatchObject({ availability: "UNAVAILABLE", completeness: "UNKNOWN", as_of: null,
      items: [], reason_code: "N17B_SOURCE_RELATION_UNAVAILABLE" });
    // No destructive cleanup or removal of old durable observations is inferred
    // from source absence. Current-page availability is read-model revision-bound.
    expect((await current()).rows).toEqual([]);
  });
  it("wrong-profile policy envelope puts only that profile in recovery, never commits its policy rows", async () => {
    const input = source((environment, relation) => environment === "paper" && relation === RELATION
      ? { ...response(environment, relation, [row(environment)]), profile_id: profile("live") } : undefined);
    expect(await capture(input)).toBeNull(); expect((await current()).rows).toEqual([]);
    expect(await repository.refreshHealth(WS, "paper", profile("paper"))).toMatchObject({ state: "RECOVERING", consecutiveFailures: 1,
      reasonCode: "N22_PROFILE_CONTEXT_MISMATCH" });
    for (const environment of ["sandbox", "live"] as const) expect((await current(environment)).rows).toEqual([{ entity_key: JSON.stringify([POLICY]), fields: row(environment) }]);
  });
  it.each(["worker-disabled", "retained-review", "all-source-profiles-disabled"] as const)("does not activate capture or source calls in %s", async mode => {
    const cfg = { ...config, ...(mode === "worker-disabled" ? { FEATURE_EXECUTION_LOCAL_PROJECTION: "false" as const }
      : mode === "retained-review" ? { EXECUTION_READ_PROFILE: "retained_review_v1" as const }
        : { FEATURE_EXECUTION_CURRENT_SOURCE_PAPER: "false" as const, FEATURE_EXECUTION_CURRENT_SOURCE_SANDBOX: "false" as const, FEATURE_EXECUTION_CURRENT_SOURCE_LIVE: "false" as const }) };
    const input = source(); expect(await capture(input, cfg)).toBeNull(); expect(input.relationForProjection).not.toHaveBeenCalled();
  });
  it("a disabled profile cannot borrow another environment's policy capture or current identity", async () => {
    const input = source(); await capture(input, { ...config, FEATURE_EXECUTION_CURRENT_SOURCE_LIVE: "false" });
    expect(policyCalls(input).map(call => call[1])).toEqual(["paper", "sandbox"]);
    expect(await repository.rawSnapshot(WS, "live", profile("live"))).toBeNull(); expect((await current("live")).rows).toEqual([]);
  });
});
