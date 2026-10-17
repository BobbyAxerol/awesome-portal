/** Actual disposable PG + real worker/decoder/lineage/snapshot/mirror.
 * Source envelopes are SYNTHETIC; no HTTP/TLS/TS/runtime commissioning. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { buildPool } from "../src/db/pool";
import { CurrentSourceProxyError, type CurrentSourceCataloguedOperationPolicy } from "../src/execution/current-source.proxy";
import { ExecutionDurableMirrorRepository } from "../src/execution/durable-mirror.repository";
import { ExecutionProfileProjectionRepository } from "../src/execution/profile-projection.repository";
import { ExecutionProfileProjectionWorker } from "../src/execution/profile-projection.worker";
import { profileProjectionCatalog, profileObservationAffectedScreens } from "../src/execution/profile-projection.catalog";
import { enforceProfileLineage } from "../src/execution/profile-lineage";
import { migrateTestDatabase, testConfig, truncateAll } from "./harness";

const WS = "TEST_ONLY-bracket-capture", TIME = "2026-10-17T00:00:00.000Z";
const PARENT = "manager.current.order-brackets:order_brackets";
const CHILD = "manager.current.order-bracket-legs:order_bracket_legs";
type Environment = "paper" | "sandbox" | "live";
type Row = Record<string, string | number | boolean | null>;
const profile = (environment: Environment) => environment.toUpperCase() + "_BINANCE_USDM";
const config = testConfig({
  FEATURE_EXECUTION_EDGE: "true",
  EXECUTION_EDGE_PRIVATE_KEY_FILE: "/run/secrets/test/delegation.pem",
  EXECUTION_EDGE_CA_FILE: "/run/secrets/test/ca.crt",
  EXECUTION_EDGE_CLIENT_CERT_FILE: "/run/secrets/test/client.crt",
  EXECUTION_EDGE_CLIENT_KEY_FILE: "/run/secrets/test/client.key",
  FEATURE_EXECUTION_CURRENT_SOURCE_PAPER: "true",
  EXECUTION_EDGE_PAPER_ORIGIN: "https://paper-edge.internal",
  EXECUTION_EDGE_PAPER_PROFILE_ID: profile("paper"),
  EXECUTION_EDGE_PAPER_AUDIENCE: "portal-execution-edge-paper",
  FEATURE_EXECUTION_CURRENT_SOURCE_SANDBOX: "true",
  EXECUTION_EDGE_SANDBOX_ORIGIN: "https://sandbox-edge.internal",
  EXECUTION_EDGE_SANDBOX_PROFILE_ID: profile("sandbox"),
  EXECUTION_EDGE_SANDBOX_AUDIENCE: "portal-execution-edge-sandbox",
  FEATURE_EXECUTION_CURRENT_SOURCE_LIVE: "true",
  EXECUTION_EDGE_LIVE_ORIGIN: "https://live-edge.internal",
  EXECUTION_EDGE_LIVE_PROFILE_ID: profile("live"),
  EXECUTION_EDGE_LIVE_AUDIENCE: "portal-execution-edge-live",
  FEATURE_EXECUTION_LOCAL_PROJECTION: "true",
  EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: WS,
  EXECUTION_LOCAL_PROJECTION_POLL_INTERVAL_MS: "15000",
  EXECUTION_LOCAL_PROJECTION_LEASE_TTL_MS: "120000",
  FEATURE_EXECUTION_DURABLE_MIRROR: "true",
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
  completeness: "COMPLETE" | "PARTIAL" | "UNKNOWN" = "COMPLETE", freshness = "FRESH", asOf = TIME) {
  return { schema_version: "portal.execution.current-source-bff.v2", source_environment: environment, profile_id: profile(environment),
    source: { authority: "EXECUTION_CELL", profile_id: profile(environment), availability: "AVAILABLE",
      freshness, completeness, as_of: asOf, data: { relation: { schema: "public", relation }, next_cursor: next,
        items: rows.map(row => ({ relation: { schema: "public", relation }, record_key: "TEST_ONLY-private-source-key",
          fields: Object.fromEntries(Object.entries(row).map(([key, value]) => [key, {
            kind: value === null ? "NULL" : typeof value === "boolean" ? "BOOLEAN"
              : typeof value === "number" || key === "leg_id" ? "INTEGER"
                : ["quantity", "price"].includes(key) ? "DECIMAL" : key.endsWith("_at") ? "TIMESTAMP" : "TEXT",
            value,
          }])) })) } } };
}
function parent(environment: Environment, id = "same-bracket", extra: Row = {}): Row {
  return { bracket_group_id: id, account_id: environment + "-account", strategy_id: null,
    execution_session_id: null, mode: environment, created_at: TIME, updated_at: TIME, ...extra };
}
function leg(id = "1", group = "same-bracket"): Row {
  return { bracket_group_id: group, leg_id: id, quantity: "0", price: "12345678901234567890.0001",
    side: "BUY", status: "SUBMITTED", created_at: TIME, updated_at: TIME, submitted_at: TIME };
}
type Override = (environment: Environment, relation: string, query: { limit: number; cursor?: string }) => unknown | Promise<unknown>;
function source(override?: Override) {
  return { relationForProjection: vi.fn(async (_workspace: string, environment: Environment, _screen: string,
    _source: string, relation: string, query: { limit: number; cursor?: string }, _operationPolicy?: CurrentSourceCataloguedOperationPolicy) => {
      const overridden = await override?.(environment, relation, query);
      if (overridden !== undefined) return overridden;
      if (relation === "accounts") return response(environment, relation, [{ account_id: environment + "-account", mode: environment }]);
      if (relation === "order_brackets") return response(environment, relation, [parent(environment)]);
      if (relation === "order_bracket_legs") return response(environment, relation, [leg()]);
      return response(environment, relation);
    }) };
}
async function capture(input: ReturnType<typeof source>, cfg = config) {
  const worker = new ExecutionProfileProjectionWorker(cfg, input as never, repository);
  try { await worker.runOnce(); } finally { await worker.onApplicationShutdown(); }
  return repository.rawSnapshot(WS, "paper", profile("paper"));
}

describe("ELP2-04 bounded exact bracket capture", () => {
  it("selects exactly two static typed operations in each profile with no ladder/history admission", () => {
    for (const environment of ["paper", "sandbox", "live"] as const) {
      const bindings = profileProjectionCatalog(environment).filter(binding => binding.key === "brackets" || binding.key === "bracket_legs");
      expect(bindings.map(binding => binding.sourceId + ":" + binding.relation)).toEqual([PARENT, CHILD]);
      expect(bindings.every(binding => binding.ladder === undefined)).toBe(true);
      expect(bindings[0].fields).not.toContain("error_message");
      expect(bindings[1].fields).not.toContain("client_order_id");
      expect(profileObservationAffectedScreens(environment, [PARENT, CHILD])).toContain("EXECUTION_FULL_BLOTTER_SCREEN");
    }
  });

  it("atomically persists both exact aliases and declared PKs without fake mirror gaps or private diagnostics", async () => {
    const input = source((environment, relation) => relation === "order_brackets"
      ? response(environment, relation, [parent(environment, "same-bracket", { error_message: "MUST_NOT_CAPTURE", risk_grant_id: "MUST_NOT_CAPTURE" })])
      : relation === "order_bracket_legs" ? response(environment, relation, [{ ...leg(), client_order_id: "MUST_NOT_CAPTURE", trigger_price: "90000" }]) : undefined);
    const snapshot = await capture(input);
    expect(snapshot?.document.relations[PARENT]).toMatchObject({ availability: "AVAILABLE", completeness: "COMPLETE",
      items: [{ fields: { bracket_group_id: "same-bracket", account_id: "paper-account", strategy_id: null } }] });
    expect(snapshot?.document.relations[CHILD]).toMatchObject({ availability: "AVAILABLE", completeness: "COMPLETE",
      items: [{ fields: { leg_id: "1", quantity: "0", price: "12345678901234567890.0001" } }] });
    expect(JSON.stringify(snapshot?.document.relations[PARENT])).not.toContain("MUST_NOT_CAPTURE");
    expect(JSON.stringify(snapshot?.document.relations[CHILD])).not.toMatch(/MUST_NOT_CAPTURE|trigger_price/);
    const calls = input.relationForProjection.mock.calls.filter(call => call[4] === "order_brackets" || call[4] === "order_bracket_legs");
    expect(calls).toHaveLength(6);
    for (const call of calls) {
      expect(call[5]).toEqual({ limit: 200 });
      const policy = call[6];
      expect(policy).toMatchObject({ relation: call[4], sourceId: call[3], maximumResponseBytes: 1048576 });
    }
    const gaps = await pool.query("SELECT reason_code FROM execution_durable_mirror_gaps WHERE workspace_id=$1 AND relation_key=ANY($2::text[])", [WS, [PARENT, CHILD]]);
    expect(gaps.rows).toEqual([]);
    for (const relationKey of [PARENT, CHILD]) {
      const current = await mirror.currentPage({ workspaceId: WS, environment: "paper", profileId: profile("paper"), relationKey, limit: 20 });
      expect(current.rows).toHaveLength(1);
    }
  });

  it("keeps same source IDs independent by environment/profile and never enables a disabled worker", async () => {
    const input = source(); await capture(input);
    for (const environment of ["paper", "sandbox", "live"] as const) {
      const snapshot = await repository.rawSnapshot(WS, environment, profile(environment));
      expect(snapshot?.document.relations[PARENT].items[0].fields.account_id).toBe(environment + "-account");
      expect(snapshot?.document.relations[CHILD].items[0].lineage.profile_id).toBe(profile(environment));
    }
    const count = input.relationForProjection.mock.calls.length;
    await capture(input, { ...config, FEATURE_EXECUTION_LOCAL_PROJECTION: "false" });
    expect(input.relationForProjection).toHaveBeenCalledTimes(count);
  });

  it.each(["tail-at-cap", "cap-with-continuation", "source-partial", "source-unknown"] as const)(
    "preserves parent census completeness through %s", async mode => {
      let paperParentCalls = 0;
      const input = source((environment, relation, query) => {
        if (environment !== "paper" || relation !== "order_brackets") return undefined;
        paperParentCalls += 1;
        if (mode === "source-partial" || mode === "source-unknown")
          return response(environment, relation, [parent(environment)], null, mode === "source-partial" ? "PARTIAL" : "UNKNOWN");
        const offset = query.cursor ? Number(query.cursor.split("-").at(-1)) : 0;
        const rows = Array.from({ length: 200 }, (_, index) => parent(environment, offset + index === 0 ? "same-bracket" : "bracket-" + (offset + index)));
        return response(environment, relation, rows,
          mode === "tail-at-cap" && offset === 1800 ? null : "TEST_ONLY-offset-" + (offset + 200));
      });
      const snapshot = await capture(input);
      const parentRelation = snapshot!.document.relations[PARENT], child = snapshot!.document.relations[CHILD];
      if (mode === "tail-at-cap") {
        expect(paperParentCalls).toBe(10); expect(parentRelation.items).toHaveLength(2000);
        expect(parentRelation.completeness).toBe("COMPLETE"); expect(child.completeness).toBe("COMPLETE");
      } else {
        expect(parentRelation.completeness).toBe(mode === "source-unknown" ? "UNKNOWN" : "PARTIAL");
        expect(child.completeness).toBe(mode === "source-unknown" ? "UNKNOWN" : "PARTIAL");
        if (mode === "cap-with-continuation") { expect(paperParentCalls).toBe(10); expect(parentRelation.items).toHaveLength(2000); }
        else expect(paperParentCalls).toBe(1);
      }
      expect(snapshot?.document.relations[PARENT].items.length).toBeLessThanOrEqual(2000);
    });

  it("does not replace an unavailable parent with an older COMPLETE census or empty COMPLETE child", async () => {
    await capture(source());
    const snapshot = await capture(source((_environment, relation) => {
      if (relation === "order_brackets") throw new CurrentSourceProxyError("N17B_SOURCE_RELATION_UNAVAILABLE", 503);
      return undefined;
    }));
    expect(snapshot?.document.relations[PARENT]).toMatchObject({ availability: "UNAVAILABLE", items: [] });
    expect(snapshot?.document.relations[CHILD]).toMatchObject({ items: [], completeness: "PARTIAL",
      reason_code: "N30_BRACKET_PARENT_CENSUS_UNQUALIFIED" });
  });

  it("joins mode-less children only to accepted post-profile-filter parent rows", async () => {
    const snapshot = await capture(source((environment, relation) => relation === "order_brackets"
      ? response(environment, relation, [parent(environment, "same-bracket", { account_id: "foreign-account" })]) : undefined));
    expect(snapshot?.document.relations[PARENT].items).toEqual([]);
    expect(snapshot?.document.relations[CHILD]).toMatchObject({ items: [], completeness: "PARTIAL" });
  });

  it("keeps duplicate parent keys unresolvable and source freshness/source clocks unchanged", async () => {
    const snapshot = await capture(source((environment, relation) =>
      relation === "order_brackets" ? response(environment, relation, [parent(environment), parent(environment)], null, "COMPLETE", "STALE")
        : relation === "order_bracket_legs" ? response(environment, relation, [leg()], null, "COMPLETE", "STALE") : undefined));
    expect(snapshot?.document.relations[PARENT]).toMatchObject({ freshness: "STALE", as_of: TIME, completeness: "COMPLETE" });
    expect(snapshot?.document.relations[CHILD]).toMatchObject({ freshness: "STALE", as_of: TIME, completeness: "PARTIAL", items: [] });
  });

  it("never calls a missing or UNKNOWN parent corpus empty COMPLETE even when child input is empty", () => {
    const child = { spec: { key: "bracket_legs" }, state: "EMPTY" as const, reasonCode: null,
      page: { items: [], asOf: TIME, freshness: "FRESH" as const, completeness: "COMPLETE" as const, nextCursor: null } };
    expect(enforceProfileLineage([child], "N30")[0].page?.completeness).toBe("PARTIAL");
    const result = enforceProfileLineage([{ ...child, spec: { key: "brackets" },
      page: { ...child.page, completeness: "UNKNOWN" as const } }, child], "N30");
    expect(result[1].page?.completeness).toBe("UNKNOWN");
  });
});
