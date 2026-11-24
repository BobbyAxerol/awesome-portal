import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { RESTORE_V2_TABLES, captureV2RestoreInventory, compareV2RestoreInventories, type RestoreInventory } from "../src/execution-v2/restore-inventory";

const fact = (digest = "a".repeat(64)) => ({ count: 1, digest });
const inventory = (): RestoreInventory => ({ version: "portal.restore-inventory.v3",
  coverage: "pre-c2-candidate-absence-checked-v2",
  tables: Object.fromEntries(RESTORE_V2_TABLES.map(name => [name, fact()])) as RestoreInventory["tables"],
  security_digest: "b".repeat(64) });

describe("Execution V2 restore inventory is never an automatic cutover grant", () => {
  it("keeps even an exact match as non-authorizing", () => {
    expect(compareV2RestoreInventories(inventory(), inventory())).toEqual({
      state: "LOCAL_MATCH_NOT_A_CUTOVER_FENCE", changed_tables: [], security_changed: false });
  });
  it("detects a changed revoked session and security metadata", () => {
    const old = inventory(), current = inventory();
    const changed = { ...current, tables: { ...current.tables, "public.auth_sessions": fact("c".repeat(64)) },
      security_digest: "d".repeat(64) };
    expect(compareV2RestoreInventories(changed, old)).toEqual({ state: "MISMATCH",
      changed_tables: ["public.auth_sessions"], security_changed: true });
  });
  it("detects used or revoked activations, grant history and account-lifecycle changes", () => {
    for (const name of ["public.activation_credentials", "public.owner_step_up_grants",
      "public.auth_audit_events", "public.account_lifecycle_operations",
      "public.portal_capability_grant_events", "public.governance_promotion_authority_grants"] as const) {
      const before = inventory();
      const after = { ...before, tables: { ...before.tables, [name]: fact("c".repeat(64)) } };
      expect(compareV2RestoreInventories(after, before)).toMatchObject({ state: "MISMATCH", changed_tables: [name] });
    }
    const legacy = { ...inventory(), version: "portal.restore-inventory.v2" } as unknown as RestoreInventory;
    expect(() => compareV2RestoreInventories(legacy, inventory())).toThrow("V2_RESTORE_INVENTORY_VERSION_INVALID");
  });
  it("refuses incomplete or malformed inventories instead of comparing a subset", () => {
    const bad = inventory();
    const { "public.auth_sessions": _missing, ...remaining } = bad.tables;
    expect(() => compareV2RestoreInventories(inventory(), { ...bad, tables: remaining as RestoreInventory["tables"] }))
      .toThrow("V2_RESTORE_INVENTORY_INCOMPLETE");
    expect(() => compareV2RestoreInventories(inventory(), { ...bad, security_digest: "bad" }))
      .toThrow("V2_RESTORE_SECURITY_INCOMPLETE");
    const { coverage: _coverage, ...legacy } = bad;
    expect(() => compareV2RestoreInventories(inventory(), legacy as RestoreInventory))
      .toThrow("V2_RESTORE_INVENTORY_COVERAGE_UNVERIFIED");
  });
  it("refuses a missing V2 relation, rolls back and releases the connection", async () => {
    const query = vi.fn(async (sql: string) => sql.startsWith("SELECT name,to_regclass")
      ? { rows: RESTORE_V2_TABLES.map((name, i) => ({ name, oid: i === 0 ? null : name, rls_active: false })) } : { rows: [] });
    const release = vi.fn();
    const pool = { connect: async () => ({ query, release }) } as unknown as Pool;
    await expect(captureV2RestoreInventory(pool)).rejects.toThrow("V2_RESTORE_INVENTORY_SCHEMA_INCOMPLETE");
    expect(query).toHaveBeenLastCalledWith("ROLLBACK");
    expect(release).toHaveBeenCalledOnce();
    await expect(captureV2RestoreInventory(pool, 0)).rejects.toThrow("V2_RESTORE_INVENTORY_ROW_LIMIT_INVALID");
  });
  it("refuses an oversized table rather than hashing a partial sample", async () => {
    const query = vi.fn(async (sql: string) => sql.startsWith("SELECT name,to_regclass")
      ? { rows: RESTORE_V2_TABLES.map(name => ({ name, oid: name, rls_active: false })) }
      : sql.startsWith("SELECT\n      EXISTS") ? { rows: [{ unsupported: false }] }
      : sql.startsWith("WITH bounded") ? { rows: [{ count: 2, digest: "a".repeat(64) }] } : { rows: [] });
    const release = vi.fn();
    const pool = { connect: async () => ({ query, release }) } as unknown as Pool;
    await expect(captureV2RestoreInventory(pool, 1)).rejects.toThrow("V2_RESTORE_INVENTORY_ROW_LIMIT_EXCEEDED");
    expect(query).toHaveBeenLastCalledWith("ROLLBACK");
    expect(release).toHaveBeenCalledOnce();
  });
  it.each([{ rows: [{ unsupported: true }] }, { rows: [] }, { rows: [{ unsupported: null }] }])(
    "rejects present or unverifiable newer authority scope before row hashing", async result => {
      const query = vi.fn(async (sql: string) => sql.startsWith("SELECT name,to_regclass")
        ? { rows: RESTORE_V2_TABLES.map(name => ({ name, oid: name, rls_active: false })) }
        : sql.startsWith("SELECT\n      EXISTS") ? result : { rows: [] });
      const release = vi.fn();
      const pool = { connect: async () => ({ query, release }) } as unknown as Pool;
      await expect(captureV2RestoreInventory(pool)).rejects.toThrow("V2_RESTORE_INVENTORY_UNSUPPORTED_AUTHORITY_SCOPE");
      expect(query.mock.calls.some(([sql]) => sql.startsWith("WITH bounded"))).toBe(false);
      expect(query).toHaveBeenLastCalledWith("ROLLBACK");
      expect(release).toHaveBeenCalledOnce();
    });
  it("captures the pre-C2 scope with an explicit diagnostic marker, including retained review ACL", async () => {
    expect(RESTORE_V2_TABLES).toContain("public.execution_retained_review_access");
    const query = vi.fn(async (sql: string) => sql.startsWith("SELECT name,to_regclass")
      ? { rows: RESTORE_V2_TABLES.map(name => ({ name, oid: name, rls_active: false })) }
      : sql.startsWith("SELECT\n      EXISTS") ? { rows: [{ unsupported: false }] }
      : sql.startsWith("WITH bounded") ? { rows: [{ count: 1, digest: "a".repeat(64) }] }
      : sql.startsWith("SELECT jsonb_build_object") ? { rows: RESTORE_V2_TABLES.map(name => ({ fact: name })) } : { rows: [] });
    const pool = { connect: async () => ({ query, release: vi.fn() }) } as unknown as Pool;
    const result = await captureV2RestoreInventory(pool);
    expect(result.coverage).toBe("pre-c2-candidate-absence-checked-v2");
    expect(compareV2RestoreInventories(result,result).state).toBe("LOCAL_MATCH_NOT_A_CUTOVER_FENCE");
    const coverage = query.mock.calls.find(([sql]) => sql.startsWith("SELECT\n      EXISTS"))?.[0];
    expect(coverage).toContain("c.relname ~ '^portal_ordinary_profile_'");
  });
  it("discards a connection when rollback fails", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql === "ROLLBACK") throw new Error("connection lost");
      if (sql.startsWith("SELECT name,to_regclass")) return { rows: [] };
      return { rows: [] };
    });
    const release = vi.fn();
    const pool = { connect: async () => ({ query, release }) } as unknown as Pool;
    await expect(captureV2RestoreInventory(pool)).rejects.toThrow("V2_RESTORE_INVENTORY_SCHEMA_INCOMPLETE");
    expect(release).toHaveBeenCalledWith(true);
  });
  it.each([true, null])("rejects a filtered or unverifiable role before hashing rows (rls=%s)", async rls => {
    const query = vi.fn(async (sql: string) => sql.startsWith("SELECT name,to_regclass")
      ? { rows: RESTORE_V2_TABLES.map((name, i) => ({ name, oid: name, rls_active: i === 0 ? rls : false })) }
      : { rows: [] });
    const release = vi.fn();
    const pool = { connect: async () => ({ query, release }) } as unknown as Pool;
    await expect(captureV2RestoreInventory(pool)).rejects.toThrow("V2_RESTORE_INVENTORY_RLS_FILTER_ACTIVE");
    expect(query).toHaveBeenCalledWith("SET LOCAL row_security = off");
    expect(query.mock.calls.some(([sql]) => sql.startsWith("WITH bounded"))).toBe(false);
    expect(query).toHaveBeenLastCalledWith("ROLLBACK");
    expect(release).toHaveBeenCalledWith(false);
  });
  it("rejects duplicate/missing inventory names even if the response has the expected row count", async () => {
    const query = vi.fn(async (sql: string) => sql.startsWith("SELECT name,to_regclass")
      ? { rows: RESTORE_V2_TABLES.map((name, i) => ({ name: i === 1 ? RESTORE_V2_TABLES[0] : name,
        oid: name, rls_active: false })) } : { rows: [] });
    const release = vi.fn();
    const pool = { connect: async () => ({ query, release }) } as unknown as Pool;
    await expect(captureV2RestoreInventory(pool)).rejects.toThrow("V2_RESTORE_INVENTORY_SCHEMA_INCOMPLETE");
    expect(query.mock.calls.some(([sql]) => sql.startsWith("WITH bounded"))).toBe(false);
  });
});
