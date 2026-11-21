/** FE-043 independent review G1/G3. Behaviours of `listWithSnapshot` and the grouped-count helper lent to
 * a snapshot reader, against a real PostgreSQL (disposable test cell only; skipped without a database,
 * and a skipped run is NOT a pass). Uses its own table so it does not depend on the portal migrations. */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import {
  ControlPlaneQueryService,
  KeysetCursorCodec,
  QueryContractError,
  type GroupedCountSpec,
  type PostgresListResource,
  type PostgresSnapshotReader,
} from "../src/query";

const URL = process.env.TEST_DATABASE_URL;
const TABLE = `qsr_${randomUUID().replaceAll("-", "").slice(0, 24)}`;
const WS = "qsr_workspace", WS_NULL = "qsr_workspace_null", WS_OTHER = "qsr_workspace_other";
const actor = (workspaceId = WS) => ({ actorId: "qsr_reader", workspaceId, role: "USER" as const });
interface Row extends QueryResultRow { id: number; severity: string }
interface Item { id: number; severity: string }
const codec = () => new KeysetCursorCodec({ activeKeyId: "qsr", keys: { qsr: "test-only-0123456789abcdef0123456789abcdef" }, ttlSeconds: 900 });
const resource = (statementTimeoutMs = 2000): PostgresListResource<Row, Item> => ({
  resourceId: "qsr.test", table: TABLE, selectColumns: ["id", "severity"], workspaceColumn: "workspace_id", idSortField: "id",
  filters: {
    severity: { column: "severity", kind: "text", operators: ["eq"], maxLength: 191 },
    grade: { column: "grade", kind: "text", operators: ["eq"], maxLength: 191 },
  },
  sorts: { id: { column: "id", kind: "integer" } }, defaultSort: [{ field: "id", direction: "asc" }],
  allowedRoles: ["USER"], statementTimeoutMs, mapRow: row => ({ id: row.id, severity: row.severity }),
});
const raw = (filters: Array<{ field: string; op: "eq"; value: string }> = []) => ({ limit: 10, filters });
const group = (column: string, extra: Partial<GroupedCountSpec> = {}): GroupedCountSpec =>
  ({ column, excludeFilterFields: [], maxGroups: 8, ...extra });

describe.skipIf(!URL)("FE-043 snapshot reader and grouped counts / actual PG / TEST_ONLY", () => {
  let pool: Pool;
  const engine = (use: Pool = pool) => new ControlPlaneQueryService(use, codec());
  /** A pool whose clients record every statement, so transaction control is observable. */
  function recording(): { pool: Pool; sql: string[] } {
    const sql: string[] = [];
    const wrapped = { connect: async () => {
      const db: PoolClient = await pool.connect();
      return { query: async (text: string, values?: unknown[]) => { sql.push(text.trim().split(/\s+/).slice(0, 2).join(" ")); return db.query(text, values); },
        release: () => db.release() } as unknown as PoolClient;
    } } as unknown as Pool;
    return { pool: wrapped, sql };
  }
  beforeAll(async () => {
    pool = new Pool({ connectionString: URL });
    await pool.query(`CREATE TABLE ${TABLE} (id integer PRIMARY KEY, workspace_id text NOT NULL, severity text NOT NULL,
      grade text, secret text NOT NULL DEFAULT 'must-never-be-groupable')`);
    await pool.query(`INSERT INTO ${TABLE}(id, workspace_id, severity, grade) VALUES
      (1,$1,'INFO','A'),(2,$1,'WARNING','A'),(3,$1,'WARNING','B'),(4,$1,'ERROR','B'),(5,$1,'ERROR','B'),(6,$1,'ERROR','A'),
      (7,$2,'INFO',NULL),(8,$2,'INFO','A'),
      (9,$3,'CRITICAL','A')`, [WS, WS_NULL, WS_OTHER]);
  });
  afterAll(async () => { if (pool) { await pool.query(`DROP TABLE IF EXISTS ${TABLE}`); await pool.end(); } });

  it("counts a column excluding ONLY the named own filters, inside the page's snapshot, and never other workspaces", async () => {
    const seen: Array<ReadonlyMap<string, number>> = [];
    const { page, snapshot } = await engine().listWithSnapshot(resource(), actor(), raw([{ field: "severity", op: "eq", value: "ERROR" }]),
      async lent => {
        seen.push(await lent.groupedCounts(group("severity", { excludeFilterFields: ["severity"] })), await lent.groupedCounts(group("grade")));
        return { rows: lent.rows.map(row => row.id) };
      });
    expect(page).toMatchObject({ total_count: 6, filtered_count: 3 }); expect(snapshot.rows).toEqual([4, 5, 6]);
    expect(Object.fromEntries(seen[0])).toEqual({ ERROR: 3, INFO: 1, WARNING: 2 }); // own dimension ignores its own filter
    expect(Object.fromEntries(seen[1])).toEqual({ A: 1, B: 2 }); // other dimensions keep every other filter
  });

  it("G3: a filter value outside the closed domain (severity=BOGUS) filters to 0, its own bucket is 0, and nothing is a 503", async () => {
    const bogus = [{ field: "severity", op: "eq" as const, value: "BOGUS" }];
    const { page, snapshot } = await engine().listWithSnapshot(resource(), actor(), raw(bogus), async lent => ({
      own: await lent.groupedCounts(group("severity", { excludeFilterFields: ["severity"] })),
      other: await lent.groupedCounts(group("grade")) }));
    expect(page).toMatchObject({ total_count: 6, filtered_count: 0, rows: [] });
    expect(snapshot.own.get("BOGUS") ?? 0).toBe(0); expect(snapshot.own.get("ERROR")).toBe(3); // domain buckets are real, the bogus one is absent
    expect(snapshot.other.size).toBe(0); // the bogus filter still applies to every OTHER dimension
  });

  it("G1: QUERY_GROUP_BOUND when the distinct values exceed maxGroups, never a silent cut", async () => {
    const run = engine().listWithSnapshot(resource(), actor(), raw(), lent => lent.groupedCounts(group("severity", { maxGroups: 2 })));
    await expect(run).rejects.toMatchObject({ code: "QUERY_GROUP_BOUND", status: 503 });
    await expect(run).rejects.toBeInstanceOf(QueryContractError);
    // exactly maxGroups distinct values is allowed
    const exact = await engine().listWithSnapshot(resource(), actor(), raw(), lent => lent.groupedCounts(group("severity", { maxGroups: 3 })));
    expect(Object.fromEntries(exact.snapshot)).toEqual({ ERROR: 3, INFO: 1, WARNING: 2 });
  });

  it("G1: QUERY_GROUP_VALUE_UNAVAILABLE when a group value is NULL, never an anonymous or dropped bucket", async () => {
    await expect(engine().listWithSnapshot(resource(), actor(WS_NULL), raw(), lent => lent.groupedCounts(group("grade"))))
      .rejects.toMatchObject({ code: "QUERY_GROUP_VALUE_UNAVAILABLE", status: 503 });
  });

  it("G1: the reader is unusable after COMMIT, for both query and groupedCounts", async () => {
    let held: PostgresSnapshotReader<Row> | undefined;
    await engine().listWithSnapshot(resource(), actor(), raw(), async lent => { held = lent; expect(await lent.query("SELECT 1 AS one", [])).toEqual([{ one: 1 }]); });
    await expect(held!.query("SELECT 1", [])).rejects.toThrow("snapshot reader used after its transaction");
    await expect(held!.groupedCounts(group("severity"))).rejects.toThrow("snapshot reader used after its transaction");
    expect(Object.isFrozen(held!.rows)).toBe(true);
  });

  it("G1: an undeclared column, an unknown excludeFilterFields entry or a maxGroups outside 1..64 is refused before any SQL for it runs", async () => {
    const refusals: Array<[string, GroupedCountSpec]> = [
      ["undeclared column (exists, but is not a declared filter)", group("secret")],
      ["injection-shaped column", group("severity) FROM x --")],
      ["unknown excludeFilterFields", group("severity", { excludeFilterFields: ["nope"] })],
      ["maxGroups 65", group("severity", { maxGroups: 65 })],
      ["maxGroups 0", group("severity", { maxGroups: 0 })],
      ["fractional maxGroups", group("severity", { maxGroups: 1.5 })],
    ];
    for (const [label, spec] of refusals)
      await expect(engine().listWithSnapshot(resource(), actor(), raw(), lent => lent.groupedCounts(spec)), label)
        .rejects.toThrow("grouped count must name a declared filter column, declared filters and a small group bound");
    const ok = await engine().listWithSnapshot(resource(), actor(), raw(), lent => lent.groupedCounts(group("severity", { maxGroups: 64 })));
    expect(ok.snapshot.size).toBe(3); // 64 itself is allowed
  });

  it("G1: a read that throws rolls the transaction back, never commits, releases the connection and does not hide the error", async () => {
    const boom = new Error("TEST_ONLY read failure"), { pool: spy, sql } = recording();
    await expect(engine(spy).listWithSnapshot(resource(), actor(), raw(), async () => { throw boom; })).rejects.toBe(boom);
    expect(sql[0]).toBe("BEGIN ISOLATION"); expect(sql.at(-1)).toBe("ROLLBACK"); expect(sql).not.toContain("COMMIT");
    const okSpy = recording();
    await engine(okSpy.pool).listWithSnapshot(resource(), actor(), raw(), async () => "fine");
    expect(okSpy.sql.at(-1)).toBe("COMMIT"); expect(okSpy.sql).not.toContain("ROLLBACK");
    expect((await pool.query("SELECT 1 AS one")).rows[0].one).toBe(1); // the pool still serves: the client was released, not leaked in a transaction
  });

  it("G1: SQLSTATE 57014 raised INSIDE the read becomes QUERY_TIMEOUT (503) and rolls back", async () => {
    const { pool: spy, sql } = recording(), started = Date.now();
    const run = engine(spy).listWithSnapshot(resource(100), actor(), raw(), lent => lent.query("SELECT pg_sleep(5)", []));
    await expect(run).rejects.toMatchObject({ code: "QUERY_TIMEOUT", status: 503 });
    expect(Date.now() - started).toBeLessThan(4000); // the statement timeout cut it, not the sleep
    expect(sql.at(-1)).toBe("ROLLBACK"); expect(sql).not.toContain("COMMIT");
    // a synthetic 57014 from a reader that does not touch the database maps identically
    await expect(engine().listWithSnapshot(resource(), actor(), raw(), async () => { throw Object.assign(new Error("canceling statement"), { code: "57014" }); }))
      .rejects.toMatchObject({ code: "QUERY_TIMEOUT", status: 503 });
  });

  it("the reader runs in the page's own READ ONLY repeatable-read transaction and cannot write", async () => {
    const seen = await engine().listWithSnapshot(resource(), actor(), raw(), async lent => ({
      isolation: (await lent.query<{ transaction_isolation: string }>("SHOW transaction_isolation", []))[0].transaction_isolation,
      readOnly: (await lent.query<{ transaction_read_only: string }>("SHOW transaction_read_only", []))[0].transaction_read_only,
      write: await lent.query(`UPDATE ${TABLE} SET severity = 'X' WHERE id = 1`, []).then(() => "WROTE", (error: { code?: string }) => error.code) }));
    expect(seen.snapshot).toEqual({ isolation: "repeatable read", readOnly: "on", write: "25006" }); // read_only_sql_transaction
    expect((await pool.query(`SELECT severity FROM ${TABLE} WHERE id = 1`)).rows[0].severity).toBe("INFO");
  });
});
