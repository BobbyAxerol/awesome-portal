/** BE-P18 B1 m4. `totalDeadlineMs` bounds the WHOLE read transaction, not just each statement. No database: a fake pool
 * records the exact statements the engine sends and delays each one, so the deadline logic is observable and
 * deterministic enough (delays are minimums). The behaviour against real PostgreSQL at scale is the EXPLAIN gate. */
import { describe, expect, it } from "vitest";
import type { Pool, QueryResultRow } from "pg";
import { ControlPlaneQueryService, KeysetCursorCodec, QueryContractError, type PostgresListResource, type PostgresRowScope } from "../src/query";

interface Row extends QueryResultRow { id: number }
const codec = new KeysetCursorCodec({ activeKeyId: "td", keys: { td: "test-only-0123456789abcdef0123456789abcdef" }, ttlSeconds: 900 });
const resource = (extra: Partial<PostgresListResource<Row, number>> = {}): PostgresListResource<Row, number> => ({
  resourceId: "td.test", table: "td_rows", selectColumns: ["id"], workspaceColumn: "workspace_id", idSortField: "id", filters: {},
  sorts: { id: { column: "id", kind: "integer" } }, defaultSort: [{ field: "id", direction: "asc" }], allowedRoles: ["USER"],
  statementTimeoutMs: 400, mapRow: row => row.id, ...extra });
const actor = { actorId: "td_reader", workspaceId: "td_ws", role: "USER" as const };

function fakePool(delayMs: number): { pool: Pool; log: string[]; released: () => number } {
  const log: string[] = []; let released = 0;
  const client = {
    query: async (sql: string, values?: unknown[]) => {
      const control = /^(BEGIN|COMMIT|ROLLBACK)/.test(sql);
      log.push(sql.includes("set_config(") ? `set_config ${(values as string[])[0]}` : control ? sql.split(" ")[0] : sql.slice(0, 24));
      if (!control && !sql.includes("set_config(")) await new Promise(resolve => setTimeout(resolve, delayMs));
      if (sql.startsWith("SELECT COUNT(*)")) return { rows: [{ count: "2" }], rowCount: 1 };
      if (sql.startsWith('SELECT "id"')) return { rows: [{ id: 1 }, { id: 2 }], rowCount: 2 };
      return { rows: [], rowCount: 0 };
    },
    release: () => { released += 1; },
  };
  return { pool: { connect: async () => client } as unknown as Pool, log, released: () => released };
}

describe("BE-P18 B1 m4: total request deadline of the query engine", () => {
  it("is off by default: one statement_timeout set, no per-statement tightening, nothing refused", async () => {
    const { pool, log } = fakePool(5);
    const { page } = await new ControlPlaneQueryService(pool, codec).listWithSnapshot(resource(), actor, { limit: 10 },
      async lent => (await lent.query("SELECT 1", [])).length);
    expect(page.rows).toEqual([1, 2]);
    expect(log.filter(entry => entry.startsWith("set_config"))).toEqual(["set_config 400ms"]);
  });

  it("tightens statement_timeout to the remaining budget and refuses to START a statement once it is spent (503 QUERY_TIMEOUT, rolled back)", async () => {
    const { pool, log, released } = fakePool(300);
    const failure = await new ControlPlaneQueryService(pool, codec).listWithSnapshot(resource({ totalDeadlineMs: 1000 }), actor, { limit: 10 },
      async lent => { await lent.query("SELECT 1 AS a", []); await lent.query("SELECT 1 AS b", []); await lent.query("SELECT 1 AS c", []); return 1; })
      .then(() => null, (error: unknown) => error);
    expect(failure).toBeInstanceOf(QueryContractError);
    expect(failure).toMatchObject({ code: "QUERY_TIMEOUT", status: 503 });
    const tightened = log.filter(entry => entry.startsWith("set_config")).slice(1).map(entry => Number.parseInt(entry.split(" ")[1], 10));
    expect(tightened.length).toBeGreaterThan(0);
    for (const value of tightened) { expect(value).toBeGreaterThanOrEqual(1); expect(value).toBeLessThan(400); } // only ever lowered
    expect(tightened).toEqual([...tightened].sort((a, b) => b - a)); // and monotonically
    expect(log.at(-1)).toBe("ROLLBACK"); expect(log).not.toContain("COMMIT");
    expect(log.filter(entry => entry.startsWith("SELECT 1 AS"))).not.toContain("SELECT 1 AS c"); // never sent: deadline spent first
    expect(released()).toBe(1);
  });

  it("refuses a final reader that finishes LATE without issuing another statement (503 QUERY_TIMEOUT, rolled back, never committed)", async () => {
    const { pool, log, released } = fakePool(5);
    const failure = await new ControlPlaneQueryService(pool, codec).listWithSnapshot(resource({ totalDeadlineMs: 400 }), actor, { limit: 10 },
      async () => { await new Promise(resolve => setTimeout(resolve, 600)); return 1; }) // no lent.query: only wall time passes
      .then(() => null, (error: unknown) => error);
    expect(failure).toBeInstanceOf(QueryContractError);
    expect(failure).toMatchObject({ code: "QUERY_TIMEOUT", status: 503 });
    expect(log).not.toContain("COMMIT"); expect(log.at(-1)).toBe("ROLLBACK");
    expect(released()).toBe(1);
  });

  it("re-checks the budget after the statement_timeout arming round trip, before the statement starts", async () => {
    const log: string[] = []; let released = 0;
    const client = {
      query: async (sql: string, values?: unknown[]) => {
        const control = /^(BEGIN|COMMIT|ROLLBACK)/.test(sql);
        log.push(sql.includes("set_config(") ? `set_config ${(values as string[])[0]}` : control ? sql.split(" ")[0] : sql.slice(0, 24));
        // the arming call itself is slow (only the ones after the first, which is the initial 400 ms), spending the whole budget
        if (sql.includes("set_config(") && log.filter(entry => entry.startsWith("set_config")).length > 1) await new Promise(resolve => setTimeout(resolve, 450));
        if (sql.startsWith("SELECT COUNT(*)")) { await new Promise(resolve => setTimeout(resolve, 50)); return { rows: [{ count: "2" }], rowCount: 1 }; }
        if (sql.startsWith('SELECT "id"')) return { rows: [{ id: 1 }], rowCount: 1 };
        return { rows: [], rowCount: 0 };
      },
      release: () => { released += 1; },
    };
    const pool = { connect: async () => client } as unknown as Pool;
    const failure = await new ControlPlaneQueryService(pool, codec).listWithSnapshot(resource({ totalDeadlineMs: 400 }), actor, { limit: 10 },
      async () => 1).then(() => null, (error: unknown) => error);
    expect(failure).toMatchObject({ code: "QUERY_TIMEOUT", status: 503 });
    expect(log).not.toContain("COMMIT"); expect(log.at(-1)).toBe("ROLLBACK");
    expect(released).toBe(1);
  });

  it("does not interfere when the request finishes inside the budget", async () => {
    const { pool, log } = fakePool(5);
    const { page, snapshot } = await new ControlPlaneQueryService(pool, codec).listWithSnapshot(resource({ totalDeadlineMs: 5000 }), actor,
      { limit: 10 }, async lent => (await lent.query("SELECT 1", [])).length);
    expect(page.total_count).toBe(2); expect(snapshot).toBe(0);
    expect(log).toContain("COMMIT"); expect(log).not.toContain("ROLLBACK");
  });

  it("rejects an unsafe deadline: not an integer, below the statement timeout, or above 30 s", async () => {
    const { pool } = fakePool(1);
    for (const bad of [399, 30_001, 1000.5, Number.NaN]) {
      await expect(new ControlPlaneQueryService(pool, codec).list(resource({ totalDeadlineMs: bad }), actor, { limit: 10 }))
        .rejects.toThrow("query total deadline");
    }
  });
});

describe("BE-P18 B1: the row-scope predicate is a semi-join on text[] binds, not an OR of N conjunctions", () => {
  function capture() {
    const statements: Array<{ sql: string; values: unknown[] }> = [];
    const client = { query: async (sql: string, values: unknown[] = []) => {
      if (!/^(BEGIN|COMMIT|ROLLBACK)/.test(sql) && !sql.includes("set_config(")) statements.push({ sql, values });
      return sql.startsWith("SELECT COUNT(*)") ? { rows: [{ count: "0" }], rowCount: 1 } : { rows: [], rowCount: 0 };
    }, release: () => undefined };
    return { pool: { connect: async () => client } as unknown as Pool, statements };
  }
  const scopedResource = (rowScope: PostgresRowScope) => ({ ...resource(), filters: {}, rowScope });
  it("binds one text[] per column (composite equality preserved, hostile characters stay data) for an all-text scope", async () => {
    const { pool, statements } = capture();
    const tuples = [["ACCOUNT", "a,b", "PAPER"], ["PORTFOLIO", "q\"uote'}{\\", "LIVE"], ["DEPLOYMENT", "NULL", "SANDBOX"]];
    await new ControlPlaneQueryService(pool, codec).list(scopedResource({ columns: ["target_type", "target_id", "environment"], allowedTuples: tuples, fingerprint: "fp" }),
      actor, { limit: 10 });
    const total = statements[0];
    expect(total.sql).toContain('("environment", "target_id", "target_type") IN (SELECT * FROM unnest($2::text[], $3::text[], $4::text[]))');
    expect(total.values).toHaveLength(4); // workspace + 3 arrays, regardless of the number of tuples
    const [, environments, ids, types] = total.values as [string, string[], string[], string[]];
    const rows = types.map((type, i) => [type, ids[i], environments[i]]).sort();
    expect(rows).toEqual([...tuples].sort()); // row i of the arrays is exactly one authorized tuple: no cross-product
    expect(total.sql).not.toMatch(/\$5/);
  });
  it("above rowScopeIndexMaxTuples the scope columns are compared as (col || '') so no per-tuple btree path is offered; at or below, plain columns", async () => {
    const tuples = [["ACCOUNT", "a", "PAPER"], ["PORTFOLIO", "b", "LIVE"], ["DEPLOYMENT", "c", "SANDBOX"]];
    const scope = { columns: ["target_type", "target_id", "environment"], allowedTuples: tuples, fingerprint: "fp" };
    const run = async (rowScopeIndexMaxTuples: number | undefined) => {
      const { pool, statements } = capture();
      await new ControlPlaneQueryService(pool, codec).list({ ...scopedResource(scope), rowScopeIndexMaxTuples }, actor, { limit: 10 });
      return statements[0];
    };
    const wide = await run(2);
    expect(wide.sql).toContain(`(("environment" || ''), ("target_id" || ''), ("target_type" || '')) IN (SELECT * FROM unnest($2::text[], $3::text[], $4::text[]))`);
    expect(wide.values).toHaveLength(4); // identical binds: the semantics and the data sent are the same
    for (const limit of [3, undefined]) expect((await run(limit)).sql).toContain('("environment", "target_id", "target_type") IN (SELECT * FROM unnest(');
    for (const bad of [0, 2001, 1.5]) {
      const { pool } = capture();
      await expect(new ControlPlaneQueryService(pool, codec).list({ ...scopedResource(scope), rowScopeIndexMaxTuples: bad }, actor, { limit: 10 }))
        .rejects.toThrow("row scope index threshold");
    }
  });
  it("keeps the literal row-IN when a scope value is not a string", async () => {
    const { pool, statements } = capture();
    await new ControlPlaneQueryService(pool, codec).list(scopedResource({ columns: ["a", "b"], allowedTuples: [["x", 1]], fingerprint: "fp" }), actor, { limit: 10 });
    expect(statements[0].sql).toContain('("a", "b") IN (($2, $3))');
    expect(statements[0].sql).not.toContain("unnest");
  });
});
