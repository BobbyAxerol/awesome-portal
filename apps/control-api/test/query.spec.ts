import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, QueryResultRow } from "pg";
import { Role } from "../src/domain";
import {
  ControlPlaneQueryService,
  KeysetCursorCodec,
  PostgresListResource,
  QueryContractError,
  QueryTelemetrySample,
  normalizeKeysetQuery,
} from "../src/query";

const DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://portal:portal@127.0.0.1:5432/portal_control_test";
const WORKSPACE = "workspace_alpha";
const OTHER_WORKSPACE = "workspace_beta";
const CORPUS_SIZE = 182_000;

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
