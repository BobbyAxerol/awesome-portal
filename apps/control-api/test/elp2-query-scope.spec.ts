import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Pool, QueryResultRow } from "pg";
import {
  ControlPlaneQueryService,
  KeysetCursorCodec,
  PostgresListResource,
  PostgresRowScope,
  queryFingerprint,
} from "../src/query";

// Disposable control-api test cell only. No production migrations or source rows.
const DATABASE_URL = process.env.TEST_DATABASE_URL ??
  "postgres://portal:portal@127.0.0.1:5432/portal_control_test";
const TABLE = "elp2_query_scope_records";
const WORKSPACE = "elp2_query_scope_workspace";
const actor = { actorId: "elp2_query_scope_reader", workspaceId: WORKSPACE, role: "USER" as const };
const fingerprint = "test-only:current-session-policy-membership-r1";
const scope: PostgresRowScope = {
  columns: ["alpha_id", "alpha_version_id", "portfolio_id"],
  allowedTuples: [["own", "av1", "p1"], ["peer", "av2", "p2"]],
  fingerprint,
};

interface Row extends QueryResultRow {
  id: number;
  label: string;
  score: number;
  enabled: boolean;
}
interface Item { id: number; label: string; score: number }

function resource(rowScope?: PostgresRowScope): PostgresListResource<Row, Item> {
  return {
    resourceId: "elp2.query-scope-test",
    table: TABLE,
    selectColumns: ["id", "label", "score", "enabled"],
    workspaceColumn: "workspace_id",
    idSortField: "id",
    filters: {
      label: { column: "label", kind: "text", operators: ["eq", "contains"] },
      score: { column: "score", kind: "integer", operators: ["eq", "gte", "lte"] },
    },
    sorts: {
      score: { column: "score", kind: "integer" },
      id: { column: "id", kind: "integer" },
    },
    defaultSort: [{ field: "score", direction: "asc" }],
    allowedRoles: ["USER"],
    rowScope,
    mapRow: (row) => ({ id: row.id, label: row.label, score: row.score }),
  };
}

function codec(): KeysetCursorCodec {
  return new KeysetCursorCodec({
    activeKeyId: "elp2-scope",
    keys: { "elp2-scope": "test-only-0123456789abcdef0123456789abcdef" },
    ttlSeconds: 900,
  });
}

describe("ELP2-04 server-owned composite row scope validation", () => {
  const invalidScopes: readonly [string, unknown][] = [
    ["null", null],
    ["array", []],
    ["missing fingerprint", { columns: ["id"], allowedTuples: [[2]] }],
    ["extra property", { columns: ["id"], allowedTuples: [[2]], fingerprint, all: true }],
    ["unsafe column", { columns: ["id) OR TRUE --"], allowedTuples: [[2]], fingerprint }],
    ["PostgreSQL-truncated column", { columns: ["a".repeat(64)], allowedTuples: [[2]], fingerprint }],
    ["duplicate columns", { columns: ["id", "id"], allowedTuples: [[2, 2]], fingerprint }],
    ["zero columns", { columns: [], allowedTuples: [], fingerprint }],
    ["too many columns", { columns: Array.from({ length: 9 }, (_, i) => `c${i}`), allowedTuples: [], fingerprint }],
    ["sparse columns", { columns: new Array(1), allowedTuples: [], fingerprint }],
    ["non-array tuples", { columns: ["id"], allowedTuples: {}, fingerprint }],
    ["too many tuples", { columns: ["id"], allowedTuples: Array.from({ length: 2_001 }, () => [2]), fingerprint }],
    ["non-array tuple", { columns: ["id"], allowedTuples: [2], fingerprint }],
    ["short tuple", { columns: ["id", "label"], allowedTuples: [[2]], fingerprint }],
    ["long tuple", { columns: ["id"], allowedTuples: [[2, "extra"]], fingerprint }],
    ["sparse tuple", { columns: ["id"], allowedTuples: [new Array(1)], fingerprint }],
    ["null scalar", { columns: ["id"], allowedTuples: [[null]], fingerprint }],
    ["undefined scalar", { columns: ["id"], allowedTuples: [[undefined]], fingerprint }],
    ["object scalar", { columns: ["id"], allowedTuples: [[{ toString: () => "2" }]], fingerprint }],
    ["bigint scalar", { columns: ["id"], allowedTuples: [[2n]], fingerprint }],
    ["non-finite number", { columns: ["id"], allowedTuples: [[Infinity]], fingerprint }],
    ["NaN", { columns: ["id"], allowedTuples: [[NaN]], fingerprint }],
    ["unsafe integer", { columns: ["id"], allowedTuples: [[Number.MAX_SAFE_INTEGER + 1]], fingerprint }],
    ["nul string", { columns: ["label"], allowedTuples: [["a\0b"]], fingerprint }],
    ["oversized scalar", { columns: ["label"], allowedTuples: [["a".repeat(4_097)]], fingerprint }],
    ["oversized UTF-8 scalar", { columns: ["label"], allowedTuples: [["界".repeat(1_366)]], fingerprint }],
    ["oversized scope", { columns: ["label"], allowedTuples: Array.from({ length: 300 }, () => ["a".repeat(4_096)]), fingerprint }],
    ["empty fingerprint", { columns: ["id"], allowedTuples: [[2]], fingerprint: "" }],
    ["non-string fingerprint", { columns: ["id"], allowedTuples: [[2]], fingerprint: 2 }],
    ["oversized fingerprint", { columns: ["id"], allowedTuples: [[2]], fingerprint: "a".repeat(257) }],
    ["control fingerprint", { columns: ["id"], allowedTuples: [[2]], fingerprint: "rev\n1" }],
  ];

  it.each(invalidScopes)("rejects %s before connecting to PostgreSQL", async (_name, invalid) => {
    const connect = vi.fn();
    const service = new ControlPlaneQueryService({ connect } as unknown as Pool, codec());
    await expect(service.list(resource(invalid as PostgresRowScope), actor, {}))
      .rejects.toThrow("query row scope is invalid");
    expect(connect).not.toHaveBeenCalled();
  });
});

describe("ELP2-04 exact tuple predicates on real PostgreSQL", () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const cursors = codec();
  const service = new ControlPlaneQueryService(pool, cursors);

  beforeAll(async () => {
    await pool.query(`CREATE UNLOGGED TABLE ${TABLE} (
      id integer PRIMARY KEY, workspace_id text NOT NULL,
      alpha_id text NOT NULL, alpha_version_id text NOT NULL, portfolio_id text NOT NULL,
      label text NOT NULL, score integer NOT NULL, enabled boolean NOT NULL
    )`);
  });

  beforeEach(async () => {
    await pool.query(`TRUNCATE ${TABLE}`);
    await pool.query(`INSERT INTO ${TABLE} VALUES
      (1, $1, 'own',  'av1', 'private', 'hidden_before', -100, true),
      (2, $1, 'own',  'av1', 'p1',      'visible_alpha_one', 10, true),
      (3, $1, 'peer', 'av2', 'p1',      'hidden_cross_product_one', 11, true),
      (4, $1, 'peer', 'av2', 'p2',      'visible_peer', 20, false),
      (5, $1, 'own',  'av1', 'p2',      'hidden_cross_product_two', 21, true),
      (6, $1, 'own',  'av1', 'p1',      'visible_alpha_two', 30, true),
      (7, $1, 'peer', 'av2', 'private', 'hidden_after', 999, true),
      (8, $2, 'own',  'av1', 'p1',      'hidden_workspace', 0, true),
      (9, $1, $3,    'av3', 'p3',      'hidden_sql_literal', 40, true)`,
    [WORKSPACE, "elp2_query_scope_other_workspace", "own'); DROP TABLE elp2_query_scope_records; --"]);
  });

  afterAll(async () => {
    await pool.query(`DROP TABLE IF EXISTS ${TABLE}`);
    await pool.end();
  });

  it("scopes before total/count/page and never admits tuple cross-products or private authority columns", async () => {
    const page = await service.list(resource(scope), actor, { limit: 1 });
    expect(page.total_count).toBe(3);
    expect(page.filtered_count).toBe(3);
    expect(page.rows).toEqual([{ id: 2, label: "visible_alpha_one", score: 10 }]);
    expect(page.has_more).toBe(true);
    expect(page.has_previous).toBe(false);
    expect(JSON.stringify(page)).not.toMatch(/hidden|private|alpha_id|portfolio_id/);
  });

  it("scopes hidden-name search and filtered counts before applying filters", async () => {
    const hidden = await service.list(resource(scope), actor, {
      filters: [{ field: "label", op: "contains", value: "hidden" }],
    });
    expect(hidden).toMatchObject({ rows: [], total_count: 3, filtered_count: 0, has_more: false, has_previous: false });
    const own = await service.list(resource(scope), actor, {
      filters: [{ field: "label", op: "contains", value: "alpha" }],
    });
    expect(own.total_count).toBe(3);
    expect(own.filtered_count).toBe(2);
    expect(own.rows.map((row) => row.id)).toEqual([2, 6]);
  });

  it("sorts and paginates only the authorized set forwards and backwards", async () => {
    const first = await service.list(resource(scope), actor, { limit: 1 });
    const second = await service.list(resource(scope), actor, { limit: 1, after: first.next_cursor });
    const third = await service.list(resource(scope), actor, { limit: 1, after: second.next_cursor });
    const back = await service.list(resource(scope), actor, { limit: 1, before: second.prev_cursor });
    expect([first, second, third].flatMap((page) => page.rows.map((row) => row.id))).toEqual([2, 4, 6]);
    expect(back.rows).toEqual(first.rows);
    expect(back).toMatchObject({ has_previous: false, has_more: true });
    expect(third).toMatchObject({ has_previous: true, has_more: false, next_cursor: null });
    const descending = await service.list(resource(scope), actor, { sort: [{ field: "score", direction: "desc" }] });
    expect(descending.rows.map((row) => row.id)).toEqual([6, 4, 2]);
  });

  it("keeps the after-page previous-edge existence query inside scope", async () => {
    const ownScope = { ...scope, allowedTuples: [["own", "av1", "p1"]] };
    const first = await service.list(resource(ownScope), actor, { limit: 1 });
    await pool.query(`DELETE FROM ${TABLE} WHERE id = 2`);
    const page = await service.list(resource(ownScope), actor, { limit: 1, after: first.next_cursor });
    expect(page.rows.map((row) => row.id)).toEqual([6]);
    expect(page).toMatchObject({ total_count: 1, filtered_count: 1, has_previous: false, prev_cursor: null });
  });

  it("keeps the before-page next-edge existence query inside scope", async () => {
    const ownScope = { ...scope, allowedTuples: [["own", "av1", "p1"]] };
    const first = await service.list(resource(ownScope), actor, { limit: 1 });
    const second = await service.list(resource(ownScope), actor, { limit: 1, after: first.next_cursor });
    await pool.query(`DELETE FROM ${TABLE} WHERE id = 6`);
    const page = await service.list(resource(ownScope), actor, { limit: 1, before: second.prev_cursor });
    expect(page.rows.map((row) => row.id)).toEqual([2]);
    expect(page).toMatchObject({ total_count: 1, filtered_count: 1, has_more: false, next_cursor: null });
  });

  it("treats zero tuples as FALSE for counts, filters and pages, not a vacuous full grant", async () => {
    const page = await service.list(resource({ ...scope, allowedTuples: [] }), actor, {
      filters: [{ field: "score", op: "gte", value: -1000 }],
    });
    expect(page).toMatchObject({ rows: [], total_count: 0, filtered_count: 0, has_more: false, has_previous: false, next_cursor: null, prev_cursor: null });
  });

  it("ANDs the composite scope with existing finite row visibility", async () => {
    const scoped = { ...resource(scope), rowVisibility: { column: "enabled", allowedValues: [true] } };
    const page = await service.list(scoped, actor, {});
    expect(page.total_count).toBe(2);
    expect(page.rows.map((row) => row.id)).toEqual([2, 6]);
  });

  it("parameterizes string literals and supports exact numeric/boolean tuple types", async () => {
    const literal = "own'); DROP TABLE elp2_query_scope_records; --";
    const page = await service.list(resource({ columns: ["alpha_id"], allowedTuples: [[literal]], fingerprint }), actor, {});
    expect(page.rows.map((row) => row.id)).toEqual([9]);
    const mixed = await service.list(resource({ columns: ["score", "enabled"], allowedTuples: [[20, false]], fingerprint }), actor, {});
    expect(mixed.rows.map((row) => row.id)).toEqual([4]);
    expect((await pool.query(`SELECT COUNT(*)::integer AS count FROM ${TABLE}`)).rows[0].count).toBe(9);
  });

  it.each(["authority", "tuples", "columns", "removed"] as const)("rejects a continuation after its %s changes", async (change) => {
    const first = await service.list(resource(scope), actor, { limit: 1 });
    const changed = change === "authority" ? { ...scope, fingerprint: "current-policy-revision-2" }
      : change === "tuples" ? { ...scope, allowedTuples: [["own", "av1", "p1"]] }
      : change === "columns" ? { columns: ["alpha_id", "portfolio_id"], allowedTuples: [["own", "p1"], ["peer", "p2"]], fingerprint }
      : undefined;
    await expect(service.list(resource(changed), actor, { limit: 1, after: first.next_cursor }))
      .rejects.toMatchObject({ code: "CURSOR_CONTEXT_MISMATCH" });
  });

  it("canonicalizes column/tuple ordering without changing equivalent authority", async () => {
    const first = await service.list(resource(scope), actor, { limit: 1 });
    const reordered: PostgresRowScope = {
      columns: ["portfolio_id", "alpha_version_id", "alpha_id"],
      allowedTuples: [["p2", "av2", "peer"], ["p1", "av1", "own"], ["p1", "av1", "own"]],
      fingerprint,
    };
    const second = await service.list(resource(reordered), actor, { limit: 1, after: first.next_cursor });
    expect(second.rows.map((row) => row.id)).toEqual([4]);
  });

  it("detaches caller-owned tuple arrays before awaiting a connection", async () => {
    const tuples = [["own", "av1", "p1"]];
    const columns = ["alpha_id", "alpha_version_id", "portfolio_id"];
    const mutable = { columns, allowedTuples: tuples, fingerprint };
    const delayedPool = { connect: async () => {
      tuples[0][2] = "private";
      columns[0] = "label";
      mutable.fingerprint = "mutated-after-validation";
      return pool.connect();
    } } as unknown as Pool;
    const page = await new ControlPlaneQueryService(delayedPool, codec()).list(resource(mutable), actor, {});
    expect(page.total_count).toBe(2);
    expect(page.rows.map((row) => row.id)).toEqual([2, 6]);
  });

  it("preserves the previous unscoped Research/Planning cursor semantics when rowScope is absent", async () => {
    const first = await service.list(resource(), actor, { limit: 1 });
    expect(first.total_count).toBe(8);
    expect(first.rows.map((row) => row.id)).toEqual([1]);
    expect(cursors.decode(first.next_cursor!, {
      resourceId: "elp2.query-scope-test", workspaceId: WORKSPACE, direction: "after", boundarySize: 2,
      queryFingerprint: queryFingerprint({
        resourceId: "elp2.query-scope-test", limit: 1, filters: [],
        sort: [{ field: "score", direction: "asc" }, { field: "id", direction: "asc" }],
        rowVisibility: null,
      }),
    })).toEqual([-100, 1]);
  });
});
