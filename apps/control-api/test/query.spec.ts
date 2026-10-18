import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Pool, QueryResultRow } from "pg";
import { Role } from "../src/domain";
import {
  ControlPlaneQueryService,
  KeysetCursorCodec,
  PostgresListResource,
  QueryContractError,
  QueryTelemetrySample,
  normalizeKeysetQuery,
  queryFingerprint,
} from "../src/query";
import { exactPageReadTruth } from "../src/query/read-truth";

const DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://portal:portal@127.0.0.1:5432/portal_control_test";
const WORKSPACE = "workspace_alpha";
const OTHER_WORKSPACE = "workspace_beta";
const CORPUS_SIZE = 182_000;
const PRECISE_WORKSPACE = "workspace_microsecond_keyset";
// All eight timestamps collapse to the same JS Date. Identical-time groups
// also cross page boundaries, so neither Date precision nor timestamp alone
// can stand in for the native timestamp + immutable-ID keyset.
const PRECISE_FIXTURES = [
  { id: 600001, createdAt: "2026-05-01T12:00:00.123900Z" },
  { id: 600002, createdAt: "2026-05-01T12:00:00.123001Z" },
  { id: 600003, createdAt: "2026-05-01T12:00:00.123900Z" },
  { id: 600004, createdAt: "2026-05-01T12:00:00.123500Z" },
  { id: 600005, createdAt: "2026-05-01T12:00:00.123000Z" },
  { id: 600006, createdAt: "2026-05-01T12:00:00.123900Z" },
  { id: 600007, createdAt: "2026-05-01T12:00:00.123500Z" },
  { id: 600008, createdAt: "2026-05-01T12:00:00.123999Z" },
] as const;

interface ApprovalRow extends QueryResultRow {
  approval_id: number;
  workspace_id: string;
  status: string;
  gate: string;
  environment: string;
  requester: string;
  evidence_complete: boolean;
  sla_due_at: Date;
  created_at: Date;
}

interface ApprovalItem {
  id: number;
  status: string;
  requester: string;
  slaDueAt: string;
}

const approvalResource = {
  resourceId: "governance.approvals",
  table: "ex_be_04a_query_records",
  selectColumns: [
    "approval_id",
    "workspace_id",
    "status",
    "gate",
    "environment",
    "requester",
    "evidence_complete",
    "sla_due_at",
    "created_at",
  ],
  workspaceColumn: "workspace_id",
  idSortField: "approval_id",
  filters: {
    status: {
      column: "status",
      kind: "enum",
      operators: ["eq", "in"],
      enumValues: ["PENDING", "APPROVED", "DENIED", "EXPIRED"],
    },
    gate: {
      column: "gate",
      kind: "enum",
      operators: ["eq", "in"],
      enumValues: ["R1", "R2"],
    },
    environment: {
      column: "environment",
      kind: "enum",
      operators: ["eq", "in"],
      enumValues: ["PAPER", "SANDBOX", "LIVE"],
    },
    requester: {
      column: "requester",
      kind: "text",
      operators: ["eq", "in", "contains"],
      maxLength: 64,
    },
    evidence_complete: {
      column: "evidence_complete",
      kind: "boolean",
      operators: ["eq"],
    },
    sla_due_at: {
      column: "sla_due_at",
      kind: "timestamp",
      operators: ["gte", "lte"],
    },
  },
  sorts: {
    sla_due_at: { column: "sla_due_at", kind: "timestamp" },
    created_at: { column: "created_at", kind: "timestamp" },
    requester: { column: "requester", kind: "text" },
    approval_id: { column: "approval_id", kind: "integer" },
  },
  defaultSort: [{ field: "sla_due_at", direction: "asc" }],
  allowedRoles: ["ADMIN", "USER"],
  statementTimeoutMs: 2_000,
  mapRow: (row: ApprovalRow): ApprovalItem => ({
    id: row.approval_id,
    status: row.status,
    requester: row.requester,
    slaDueAt: row.sla_due_at.toISOString(),
  }),
} satisfies PostgresListResource<ApprovalRow, ApprovalItem>;

function preciseApprovalResource(): PostgresListResource<ApprovalRow, ApprovalItem & { createdAt: string }> {
  return {
    ...approvalResource,
    resourceId: "governance.approvals.precise-v2",
    sorts: {
      ...approvalResource.sorts,
      created_at: { column: "created_at", kind: "timestamp", timestampPrecision: "microseconds" },
    },
    defaultSort: [{ field: "created_at", direction: "desc" }],
    mapRow: row => ({ ...approvalResource.mapRow(row), createdAt: row.created_at.toISOString() }),
  };
}

function actor(
  workspaceId = WORKSPACE,
  role: Role = "ADMIN",
) {
  return { actorId: "usr_bobby", workspaceId, role };
}

function codec(now?: () => number): KeysetCursorCodec {
  return new KeysetCursorCodec({
    activeKeyId: "query-k1",
    keys: { "query-k1": "0123456789abcdef0123456789abcdef" },
    ttlSeconds: 900,
    now,
  });
}

describe("EX-BE-04a control-plane query primitives", () => {
  const pool = new Pool({ connectionString: DATABASE_URL });

  beforeAll(async () => {
    await pool.query("DROP TABLE IF EXISTS ex_be_04a_query_records");
    await pool.query(`
      CREATE UNLOGGED TABLE ex_be_04a_query_records (
        approval_id integer PRIMARY KEY,
        workspace_id text NOT NULL,
        status text NOT NULL,
        gate text NOT NULL,
        environment text NOT NULL,
        requester text NOT NULL,
        evidence_complete boolean NOT NULL,
        sla_due_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL,
        sensitive_secret text NOT NULL
      )
    `);
    await pool.query(
      `INSERT INTO ex_be_04a_query_records (
         approval_id, workspace_id, status, gate, environment, requester,
         evidence_complete, sla_due_at, created_at, sensitive_secret
       )
       SELECT
         item,
         $1,
         (ARRAY['PENDING','APPROVED','DENIED','EXPIRED'])[(item % 4) + 1],
         (ARRAY['R1','R2'])[(item % 2) + 1],
         (ARRAY['PAPER','SANDBOX','LIVE'])[(item % 3) + 1],
         'user_' || (item % 100)::text,
         item % 3 <> 0,
         timestamptz '2026-01-01T00:00:00Z' + ((item - 1) / 5) * interval '1 second',
         timestamptz '2025-12-01T00:00:00Z' + item * interval '1 millisecond',
         'must-never-cross-the-query-projection'
       FROM generate_series(1, $2::integer) AS item`,
      [WORKSPACE, CORPUS_SIZE],
    );
    await pool.query(
      `INSERT INTO ex_be_04a_query_records
       SELECT
         800000 + item, $1, 'PENDING', 'R1', 'PAPER', 'outsider', true,
         timestamptz '2026-01-01T00:00:00Z' + item * interval '1 second',
         timestamptz '2025-12-01T00:00:00Z' + item * interval '1 second',
         'other-workspace-secret'
       FROM generate_series(1, 100) AS item`,
      [OTHER_WORKSPACE],
    );
    await pool.query(
      `INSERT INTO ex_be_04a_query_records
         (approval_id, workspace_id, status, gate, environment, requester,
          evidence_complete, sla_due_at, created_at, sensitive_secret)
       SELECT fixture.id, $1, 'PENDING', 'R1', 'PAPER', 'precise-user', true,
              fixture.created_at, fixture.created_at, 'precise-private-secret'
       FROM unnest($2::integer[], $3::timestamptz[]) AS fixture(id, created_at)`,
      [PRECISE_WORKSPACE, PRECISE_FIXTURES.map(row => row.id), PRECISE_FIXTURES.map(row => row.createdAt)],
    );
    await pool.query(
      `CREATE INDEX ex_be_04a_query_order_idx
       ON ex_be_04a_query_records (workspace_id, sla_due_at, approval_id)`,
    );
    await pool.query(
      `CREATE INDEX ex_be_04a_query_filter_idx
       ON ex_be_04a_query_records
       (workspace_id, status, gate, environment, evidence_complete, sla_due_at, approval_id)`,
    );
    await pool.query("ANALYZE ex_be_04a_query_records");
  }, 60_000);

  afterAll(async () => {
    await pool.query("DROP TABLE IF EXISTS ex_be_04a_query_records");
    await pool.end();
  });

  it("normalizes defaults and appends the immutable ID tie-break", () => {
    const normalized = normalizeKeysetQuery(approvalResource, {});
    expect(normalized.limit).toBe(100);
    expect(normalized.sort).toEqual([
      { field: "sla_due_at", direction: "asc" },
      { field: "approval_id", direction: "asc" },
    ]);
  });

  it("publishes request-scoped empty truth only from the exact filtered count", () => {
    expect(exactPageReadTruth({ filtered_count: 0 }, "NO_MATCHING_TEST_RECORDS")).toEqual({
      state: "EMPTY",
      reason_code: "NO_MATCHING_TEST_RECORDS",
      scope: "REQUEST",
    });
    // A cursor can be stale or point beyond the returned slice while matching
    // records still exist. That is not permission to claim the scope is empty.
    expect(exactPageReadTruth({ filtered_count: 4 }, "NO_MATCHING_TEST_RECORDS")).toEqual({
      state: "AVAILABLE",
      reason_code: null,
      scope: "REQUEST",
    });
  });

  it("returns an exact 182k count, a bounded first page, and no sensitive column", async () => {
    const page = await new ControlPlaneQueryService(pool, codec()).list(
      approvalResource,
      actor(),
      {},
    );
    expect(page.rows).toHaveLength(100);
    expect(page.rows[0].id).toBe(1);
    expect(page.rows[99].id).toBe(100);
    expect(page.total_count).toBe(CORPUS_SIZE);
    expect(page.filtered_count).toBe(CORPUS_SIZE);
    expect(page.next_cursor).toMatch(/^kc1\./);
    expect(page.prev_cursor).toBeNull();
    expect(page.has_more).toBe(true);
    expect(page.has_previous).toBe(false);
    expect(JSON.stringify(page)).not.toContain("must-never-cross");
  });

  it("applies allowlisted filters before exact count and echoes canonical filters", async () => {
    const page = await new ControlPlaneQueryService(pool, codec()).list(
      approvalResource,
      actor(),
      {
        filters: [
          { field: "gate", op: "eq", value: "R1" },
          { field: "status", op: "in", value: ["PENDING", "APPROVED", "PENDING"] },
        ],
      },
    );
    const truth = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM ex_be_04a_query_records
       WHERE workspace_id = $1 AND gate = 'R1' AND status IN ('PENDING', 'APPROVED')`,
      [WORKSPACE],
    );
    expect(page.total_count).toBe(CORPUS_SIZE);
    expect(page.filtered_count).toBe(Number(truth.rows[0].count));
    expect(page.applied_filters).toEqual([
      { field: "gate", op: "eq", value: "R1" },
      { field: "status", op: "in", value: "APPROVED,PENDING" },
    ]);
  });

  it("moves forward and back without offset drift", async () => {
    const service = new ControlPlaneQueryService(pool, codec());
    const first = await service.list(approvalResource, actor(), { limit: 25 });
    const second = await service.list(approvalResource, actor(), {
      limit: 25,
      after: first.next_cursor,
    });
    const back = await service.list(approvalResource, actor(), {
      limit: 25,
      before: second.prev_cursor,
    });

    expect(first.rows.map((row) => row.id)).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
    expect(second.rows.map((row) => row.id)).toEqual(Array.from({ length: 25 }, (_, i) => i + 26));
    expect(back.rows.map((row) => row.id)).toEqual(first.rows.map((row) => row.id));
    expect(back.has_previous).toBe(false);
    expect(back.has_more).toBe(true);
  });

  it.each(["asc", "desc"] as const)(
    "round-trips native microsecond boundaries and identical-time ID ties in %s order",
    async direction => {
      const resource = preciseApprovalResource();
      const mappedKeys: string[][] = [];
      const mapRow = resource.mapRow;
      resource.mapRow = row => {
        mappedKeys.push(Object.keys(row).sort());
        return mapRow(row);
      };
      const cursors = codec();
      const service = new ControlPlaneQueryService(pool, cursors);
      // The branch selects only a server-owned SQL keyword, not client input.
      const order = direction === "asc" ? "ASC" : "DESC";
      const truth = await pool.query<{ approval_id: number; exact_created_at: string }>(
        `SELECT approval_id,
                to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS exact_created_at
         FROM ex_be_04a_query_records WHERE workspace_id = $1
         ORDER BY created_at ${order}, approval_id ${order}`,
        [PRECISE_WORKSPACE],
      );
      expect(truth.rows).toHaveLength(PRECISE_FIXTURES.length);
      expect(truth.rows.every(row => row.exact_created_at.endsWith("Z"))).toBe(true);
      const sort = [{ field: "created_at", direction }];
      const first = await service.list(resource, actor(PRECISE_WORKSPACE), { limit: 2, sort });
      const pages = [first];
      for (let index = 1; index < PRECISE_FIXTURES.length / 2; index += 1) {
        expect(pages[index - 1].next_cursor).toBeTypeOf("string");
        pages.push(await service.list(resource, actor(PRECISE_WORKSPACE), {
          limit: 2, sort, after: pages[index - 1].next_cursor,
        }));
      }
      expect(pages.flatMap(page => page.rows.map(row => row.id))).toEqual(truth.rows.map(row => row.approval_id));
      expect(new Set(pages.flatMap(page => page.rows.map(row => row.id))).size).toBe(PRECISE_FIXTURES.length);
      for (const [index, page] of pages.entries()) {
        expect(page.total_count).toBe(PRECISE_FIXTURES.length);
        expect(page.filtered_count).toBe(PRECISE_FIXTURES.length);
        expect(page.rows).toHaveLength(2);
        expect(page.has_previous).toBe(index > 0);
        expect(page.has_more).toBe(index < pages.length - 1);
        expect(page.rows.every(row => row.createdAt === "2026-05-01T12:00:00.123Z")).toBe(true);
        if (page.next_cursor) {
          const edge = truth.rows[index * 2 + 1];
          expect(cursors.decode(page.next_cursor, {
            resourceId: resource.resourceId, workspaceId: PRECISE_WORKSPACE, direction: "after",
            queryFingerprint: queryFingerprint({
              resourceId: resource.resourceId, limit: 2, filters: [], sort: page.applied_sort, rowVisibility: null,
            }),
            boundarySize: 2,
          })).toEqual([edge.exact_created_at, edge.approval_id]);
        }
      }
      expect(pages[0].prev_cursor).toBeNull();
      expect(pages.at(-1)!.next_cursor).toBeNull();
      let reverse = pages.at(-1)!;
      for (let index = pages.length - 2; index >= 0; index -= 1) {
        expect(reverse.prev_cursor).toBeTypeOf("string");
        reverse = await service.list(resource, actor(PRECISE_WORKSPACE), {
          limit: 2, sort, before: reverse.prev_cursor,
        });
        expect(reverse.rows).toEqual(pages[index].rows);
        expect(reverse.has_previous).toBe(index > 0);
        expect(reverse.has_more).toBe(true);
      }
      expect(reverse.prev_cursor).toBeNull();
      expect(mappedKeys.every(keys => JSON.stringify(keys) === JSON.stringify([...resource.selectColumns].sort()))).toBe(true);
      expect(JSON.stringify(pages)).not.toContain("__query_timestamp_boundary_");
      expect(JSON.stringify(pages)).not.toContain("precise-private-secret");
    },
  );

  it("keeps ID-only pagination valid on a resource with an unapplied precise timestamp sort", async () => {
    const resource = preciseApprovalResource();
    const service = new ControlPlaneQueryService(pool, codec());
    const query = { limit: 3, sort: [{ field: "approval_id", direction: "desc" as const }] };
    const first = await service.list(resource, actor(PRECISE_WORKSPACE), query);
    const second = await service.list(resource, actor(PRECISE_WORKSPACE), { ...query, after: first.next_cursor });
    const back = await service.list(resource, actor(PRECISE_WORKSPACE), { ...query, before: second.prev_cursor });
    expect(first.rows.map(row => row.id)).toEqual([600008, 600007, 600006]);
    expect(second.rows.map(row => row.id)).toEqual([600005, 600004, 600003]);
    expect(back.rows).toEqual(first.rows);
    expect(first.applied_sort).toEqual(query.sort);
  });

  it("rejects old resource cursors when a resource opts into precise timestamp keys", async () => {
    const service = new ControlPlaneQueryService(pool, codec());
    const query = { limit: 2, sort: [{ field: "created_at", direction: "desc" as const }] };
    const oldPage = await service.list(approvalResource, actor(PRECISE_WORKSPACE), query);
    const precise = preciseApprovalResource();
    const precisePage = await service.list(precise, actor(PRECISE_WORKSPACE), query);
    for (const [resource, after] of [
      [precise, oldPage.next_cursor], [approvalResource, precisePage.next_cursor],
    ] as const) {
      await expect(service.list(resource, actor(PRECISE_WORKSPACE), { ...query, after }))
        .rejects.toMatchObject({ code: "CURSOR_CONTEXT_MISMATCH", status: 400 });
    }
  });

  it("retains pre-1970 AD microseconds without changing the public Date precision", async () => {
    const workspace = "workspace_precise_pre_epoch";
    await pool.query(
      `INSERT INTO ex_be_04a_query_records
       SELECT 610000 + item, $1, 'PENDING', 'R1', 'PAPER', 'pre-epoch', true,
              timestamptz '1969-12-31 23:59:59.123900+00' + item * interval '1 microsecond',
              timestamptz '1969-12-31 23:59:59.123900+00' + item * interval '1 microsecond', 'secret'
       FROM generate_series(1, 3) item`,
      [workspace],
    );
    try {
      const service = new ControlPlaneQueryService(pool, codec());
      const resource = preciseApprovalResource();
      const first = await service.list(resource, actor(workspace), { limit: 1 });
      const second = await service.list(resource, actor(workspace), { limit: 1, after: first.next_cursor });
      const back = await service.list(resource, actor(workspace), { limit: 1, before: second.prev_cursor });
      expect(first.rows).toMatchObject([{ id: 610003, createdAt: "1969-12-31T23:59:59.123Z" }]);
      expect(second.rows.map(row => row.id)).toEqual([610002]);
      expect(back.rows).toEqual(first.rows);
    } finally {
      await pool.query("DELETE FROM ex_be_04a_query_records WHERE workspace_id = $1", [workspace]);
    }
  });

  it.each([
    ["BC", "0001-01-01 00:00:00+00 BC"],
    ["extended-year", "10000-01-01 00:00:00+00"],
    ["positive-infinity", "infinity"],
    ["negative-infinity", "-infinity"],
  ])("refuses unsafe %s native timestamp boundaries instead of rebinding a different AD date", async (label, timestamp) => {
    const workspace = `workspace_precise_unsafe_${label}`;
    await pool.query(
      `INSERT INTO ex_be_04a_query_records VALUES
       (620001, $1, 'PENDING', 'R1', 'PAPER', 'unsafe-time', true,
        $2::timestamptz, $2::timestamptz, 'secret')`,
      [workspace, timestamp],
    );
    try {
      await expect(new ControlPlaneQueryService(pool, codec()).list(preciseApprovalResource(), actor(workspace), {}))
        .rejects.toMatchObject({ code: "QUERY_CURSOR_BOUNDARY_UNAVAILABLE", status: 500 });
    } finally {
      await pool.query("DELETE FROM ex_be_04a_query_records WHERE workspace_id = $1", [workspace]);
    }
  });

  it.each([
    { label: "missing", present: false, value: undefined },
    { label: "null", present: true, value: null },
    { label: "millisecond-only", present: true, value: "2026-05-01T12:00:00.123Z" },
    { label: "offset-not-UTC", present: true, value: "2026-05-01T12:00:00.123456+00:00" },
    { label: "Date-instance", present: true, value: new Date("2026-05-01T12:00:00.123Z") },
  ])("fails closed on $label precise SQL metadata without falling back to the row Date", async ({ present, value }) => {
    // Decoder failure vector only. Positive precision/pagination evidence above
    // uses actual PostgreSQL; this stub cannot qualify a source or authority.
    const row: ApprovalRow = {
      approval_id: 1, workspace_id: WORKSPACE, status: "PENDING", gate: "R1", environment: "PAPER",
      requester: "boundary-vector", evidence_complete: true,
      sla_due_at: new Date("2026-05-01T12:00:00.123Z"), created_at: new Date("2026-05-01T12:00:00.123Z"),
    };
    if (present) row.__query_timestamp_boundary_0 = value;
    const client = {
      query: vi.fn(async (sql: string) => ({
        rows: sql.startsWith("SELECT COUNT(*)") ? [{ count: "1" }]
          : sql.startsWith("SELECT ") && sql.includes(' FROM "ex_be_04a_query_records" ') ? [row] : [],
        rowCount: 0,
      })),
      release: vi.fn(),
    };
    const syntheticPool = { connect: vi.fn(async () => client) } as unknown as Pool;
    await expect(new ControlPlaneQueryService(syntheticPool, codec()).list(preciseApprovalResource(), actor(), { limit: 1 }))
      .rejects.toMatchObject({ code: "QUERY_CURSOR_BOUNDARY_UNAVAILABLE", status: 500 });
    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("rejects illegal precision metadata and private-alias column collisions before SQL", async () => {
    const resource = preciseApprovalResource();
    const invalid = {
      ...resource,
      sorts: {
        ...resource.sorts,
        requester: { column: "requester", kind: "text" as const, timestampPrecision: "microseconds" as const },
      },
    };
    const service = new ControlPlaneQueryService(pool, codec());
    await expect(service.list(invalid, actor(), {})).rejects.toThrow("timestamp cursor precision requires a timestamp sort");
    await expect(service.list({ ...resource, selectColumns: [...resource.selectColumns, "__query_timestamp_boundary_0"] }, actor(), {}))
      .rejects.toThrow("selected columns collide with the private timestamp cursor namespace");
  });

  it("keeps mixed-direction multi-sort stable across canonicalized filter order", async () => {
    const service = new ControlPlaneQueryService(pool, codec());
    const sort = [
      { field: "requester", direction: "asc" as const },
      { field: "created_at", direction: "desc" as const },
    ];
    const first = await service.list(approvalResource, actor(), {
      limit: 40,
      sort,
      filters: [
        { field: "status", op: "in", value: ["PENDING", "APPROVED"] },
        { field: "gate", op: "eq", value: "R1" },
      ],
    });
    const second = await service.list(approvalResource, actor(), {
      limit: 40,
      sort,
      after: first.next_cursor,
      filters: [
        { field: "gate", op: "eq", value: "R1" },
        { field: "status", op: "in", value: ["APPROVED", "PENDING"] },
      ],
    });
    const truth = await pool.query<{ approval_id: number }>(
      `SELECT approval_id FROM ex_be_04a_query_records
       WHERE workspace_id = $1 AND status IN ('PENDING', 'APPROVED') AND gate = 'R1'
       ORDER BY requester ASC, created_at DESC, approval_id DESC
       LIMIT 80`,
      [WORKSPACE],
    );
    expect([...first.rows, ...second.rows].map((row) => row.id)).toEqual(
      truth.rows.map((row) => row.approval_id),
    );
    expect(first.applied_sort).toEqual([
      ...sort,
      { field: "approval_id", direction: "desc" },
    ]);
  });

  it("does not duplicate rows when a concurrent insert lands before the cursor", async () => {
    const service = new ControlPlaneQueryService(pool, codec());
    const first = await service.list(approvalResource, actor(), { limit: 20 });
    await pool.query(
      `INSERT INTO ex_be_04a_query_records VALUES
       (900001, $1, 'PENDING', 'R1', 'PAPER', 'concurrent', true,
        '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z', 'secret')`,
      [WORKSPACE],
    );
    try {
      const second = await service.list(approvalResource, actor(), {
        limit: 20,
        after: first.next_cursor,
      });
      expect(second.rows.map((row) => row.id)).toEqual(
        Array.from({ length: 20 }, (_, i) => i + 21),
      );
      expect(second.total_count).toBe(CORPUS_SIZE + 1);
      expect(new Set([...first.rows, ...second.rows].map((row) => row.id)).size).toBe(40);
    } finally {
      await pool.query("DELETE FROM ex_be_04a_query_records WHERE approval_id = 900001");
    }
  });

  it("recomputes reverse availability when rows before a cursor are evicted", async () => {
    const evictionWorkspace = "workspace_eviction";
    await pool.query(
      `INSERT INTO ex_be_04a_query_records
       SELECT
         700000 + item, $1, 'PENDING', 'R1', 'PAPER', 'eviction-user', true,
         timestamptz '2026-04-01T00:00:00Z' + item * interval '1 second',
         timestamptz '2026-04-01T00:00:00Z' + item * interval '1 second',
         'secret'
       FROM generate_series(1, 10) AS item`,
      [evictionWorkspace],
    );
    try {
      const service = new ControlPlaneQueryService(pool, codec());
      const first = await service.list(approvalResource, actor(evictionWorkspace), { limit: 5 });
      await pool.query(
        `DELETE FROM ex_be_04a_query_records
         WHERE workspace_id = $1 AND approval_id <= 700005`,
        [evictionWorkspace],
      );
      const second = await service.list(approvalResource, actor(evictionWorkspace), {
        limit: 5,
        after: first.next_cursor,
      });
      expect(second.rows.map((row) => row.id)).toEqual([700006, 700007, 700008, 700009, 700010]);
      expect(second.total_count).toBe(5);
      expect(second.has_previous).toBe(false);
      expect(second.prev_cursor).toBeNull();
      expect(second.has_more).toBe(false);
    } finally {
      await pool.query("DELETE FROM ex_be_04a_query_records WHERE workspace_id = $1", [
        evictionWorkspace,
      ]);
    }
  });

  it("binds cursors to direction, resource, workspace, filters, sort, and limit", async () => {
    const service = new ControlPlaneQueryService(pool, codec());
    const page = await service.list(approvalResource, actor(), { limit: 10 });
    const token = page.next_cursor!;
    const attempts = [
      () => service.list(approvalResource, actor(), { limit: 11, after: token }),
      () => service.list(approvalResource, actor(OTHER_WORKSPACE), { limit: 10, after: token }),
      () => service.list(approvalResource, actor(), {
        limit: 10,
        after: token,
        filters: [{ field: "status", op: "eq", value: "PENDING" }],
      }),
      () => service.list(approvalResource, actor(), { limit: 10, before: token }),
      () => service.list(
        { ...approvalResource, resourceId: "governance.operations" },
        actor(),
        { limit: 10, after: token },
      ),
    ];
    for (const attempt of attempts) {
      await expect(attempt()).rejects.toMatchObject({
        code: "CURSOR_CONTEXT_MISMATCH",
        status: 400,
      });
    }
  });

  it("rejects cursor tampering and ambiguous navigation", async () => {
    const service = new ControlPlaneQueryService(pool, codec());
    const page = await service.list(approvalResource, actor(), { limit: 10 });
    const token = page.next_cursor!;
    const tampered = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;
    await expect(
      service.list(approvalResource, actor(), { limit: 10, after: tampered }),
    ).rejects.toMatchObject({ code: "INVALID_CURSOR" });
    await expect(
      service.list(approvalResource, actor(), { after: token, before: token }),
    ).rejects.toMatchObject({ code: "AMBIGUOUS_CURSOR" });
  });

  it("fails closed on non-allowlisted fields and parameterizes hostile values", async () => {
    const service = new ControlPlaneQueryService(pool, codec());
    await expect(
      service.list(approvalResource, actor(), { sort: "sla_due_at;DROP TABLE ex_be_04a_query_records" }),
    ).rejects.toMatchObject({ code: "SORT_NOT_ALLOWED" });
    await expect(
      service.list(approvalResource, actor(), {
        filters: [{ field: "status) OR true --", op: "eq", value: "PENDING" }],
      }),
    ).rejects.toMatchObject({ code: "FILTER_NOT_ALLOWED" });

    const hostile = "%' OR true; DROP TABLE ex_be_04a_query_records; --";
    const page = await service.list(approvalResource, actor(), {
      filters: [{ field: "requester", op: "contains", value: hostile }],
    });
    expect(page.filtered_count).toBe(0);
    const table = await pool.query<{ relation: string | null }>(
      "SELECT to_regclass('ex_be_04a_query_records')::text AS relation",
    );
    expect(table.rows[0].relation).toBe("ex_be_04a_query_records");
  });

  it("enforces RBAC and workspace scope outside client-controlled filters", async () => {
    const service = new ControlPlaneQueryService(pool, codec());
    const adminOnly = {
      ...approvalResource,
      resourceId: "governance.admin-approvals",
      allowedRoles: ["ADMIN"] as const,
    };
    await expect(
      service.list(adminOnly, actor(WORKSPACE, "USER"), {}),
    ).rejects.toMatchObject({ code: "QUERY_FORBIDDEN", status: 403 });

    const other = await service.list(approvalResource, actor(OTHER_WORKSPACE), {});
    expect(other.total_count).toBe(100);
    expect(other.rows.every((row) => row.requester === "outsider")).toBe(true);
  });

  it("caps pages at 250 and keeps telemetry free of actor/filter values", async () => {
    const samples: QueryTelemetrySample[] = [];
    const service = new ControlPlaneQueryService(pool, codec(), (sample) => samples.push(sample));
    const page = await service.list(approvalResource, actor(), {
      limit: 250,
      filters: [{ field: "requester", op: "contains", value: "user_7" }],
    });
    expect(page.rows.length).toBeLessThanOrEqual(250);
    expect(samples).toHaveLength(1);
    expect(JSON.stringify(samples[0])).not.toContain("user_7");
    expect(JSON.stringify(samples[0])).not.toContain("usr_bobby");
    await expect(
      service.list(approvalResource, actor(), { limit: 251 }),
    ).rejects.toMatchObject({ code: "INVALID_PAGE_LIMIT" });
  });

  it("does not fail a committed read when the telemetry sink fails", async () => {
    const service = new ControlPlaneQueryService(pool, codec(), () => {
      throw new Error("telemetry unavailable");
    });
    await expect(service.list(approvalResource, actor(), { limit: 1 })).resolves.toMatchObject({
      total_count: CORPUS_SIZE,
      rows: [{ id: 1 }],
    });
  });

  it("supports signing-key rotation and rejects expired cursors", () => {
    let now = 1_000;
    const oldCodec = new KeysetCursorCodec({
      activeKeyId: "old",
      keys: { old: "old-key-0123456789abcdef0123456789" },
      ttlSeconds: 30,
      now: () => now,
    });
    const token = oldCodec.encode({
      resource_id: approvalResource.resourceId,
      workspace_id: WORKSPACE,
      direction: "after",
      query_fingerprint: "fingerprint",
      boundary: [1],
    });
    const rotatedCodec = new KeysetCursorCodec({
      activeKeyId: "new",
      keys: {
        old: "old-key-0123456789abcdef0123456789",
        new: "new-key-0123456789abcdef0123456789",
      },
      ttlSeconds: 30,
      now: () => now,
    });
    const expectation = {
      resourceId: approvalResource.resourceId,
      workspaceId: WORKSPACE,
      direction: "after" as const,
      queryFingerprint: "fingerprint",
      boundarySize: 1,
    };
    expect(rotatedCodec.decode(token, expectation)).toEqual([1]);
    now = 1_030;
    expect(() => rotatedCodec.decode(token, expectation)).toThrowError(QueryContractError);
    expect(() => rotatedCodec.decode(token, expectation)).toThrowError(
      expect.objectContaining({ code: "CURSOR_EXPIRED", status: 400 }),
    );
  });
});
