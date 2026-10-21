/** BE-P18 B1 (FE-042 links + FE-043 status_counts) LARGE-SCALE EXPLAIN gate.
 *
 * Closes B1 handoff section 12 M2/m4 / G4-G5: the operations queue V2 runs total, filtered, page, edge probes, four
 * always-on group counts and the link lookup in ONE repeatable-read read-only transaction. This gate runs that real
 * path (ControlPlaneQueryService + OperationalReadRepository, via `queueSnapshotPage`) against a deterministic
 * synthetic corpus of ~1,000,000 operations / 200,000 incidents / ~0.5M links in a DISPOSABLE database created here,
 * migrated with the repo migrations, and records EXPLAIN (ANALYZE, BUFFERS) of EVERY statement of EVERY request.
 *
 * It is heavy and therefore OFF by default. Use `scripts/be-p18-b1-explain.sh` (docker container it creates and removes,
 * under flock /tmp/portal-heavy.lock). It refuses to run unless B1_EXPLAIN=1 and the server is loopback. The receipt
 * (JSON plans + Vietnamese markdown) is written ONLY by this spec, never by hand. */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { Pool, type QueryResultRow } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { KeysetCursorCodec, ControlPlaneQueryService, type PostgresRowScope } from "../src/query";
import { operationalQueueQuery } from "../src/operations/operational-read.contract";
import { OperationalReadRepository } from "../src/operations/operational-read.repository";
import { OPERATIONAL_QUEUE_TOTAL_DEADLINE_MS, queueSnapshotPage } from "../src/operations/operational-read.service";
import { SEED_USER, seedCorpus, seedWorkspaces, targetTuple, type SeedWorkspace } from "./support/b1-explain-seed";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const migrate = (require("node-pg-migrate") as { runner: (o: Record<string, unknown>) => Promise<unknown> }).runner;

const URL = process.env.TEST_DATABASE_URL;
const ENABLED = process.env.B1_EXPLAIN === "1";
const SCALE = Number(process.env.B1_EXPLAIN_SCALE ?? "1");
const OUT_DIR = process.env.B1_EXPLAIN_OUT_DIR;
const TIMED_RUNS = 3;

/** Stated budgets. The production caps are statement_timeout 2000 ms and a 5000 ms request deadline; the gate asks for
 * HALF of each so a 2x slower host (this one runs other containers and hooks) still stays inside the real cap. */
export const PER_STATEMENT_BUDGET_MS = 1000;
export const TOTAL_REQUEST_BUDGET_MS = 2500;
/** A Seq Scan of a big table is a violation when it keeps less than this share of the rows it reads. */
export const SEQ_SCAN_MIN_KEPT_FRACTION = 0.25;
/** ... and only counts when it read at least this many rows per loop (a LIMIT 1 probe that stops early is not a scan). */
export const SEQ_SCAN_MIN_ROWS_READ = 10_000;
const FILTER_KEYS = ["triage_state", "severity", "source_status", "verification_result", "environment", "target_type", "target_id", "command_key"];
const BIG_TABLES = ["execution_operation_queue_items", "execution_incidents", "execution_incident_operation_links"] as const;

/** Things the receipt says are NOT closed by this gate. Edit here, never in the generated markdown. */
const REMAINING: readonly string[] = [
  "Số đo là cache nóng (warm) trên một container PG 16 giới hạn 3 CPU/3 GB; chưa có số cold-cache hay số trên máy production thật.",
  "Bộ lọc phụ (severity, source_status, verification_result, environment, target_type, command_key) không có index riêng: scope rộng + lọc chọn lọc đọc cả bảng (Seq Scan, dấu * ở bảng) nhưng vẫn nằm trong ngân sách thời gian (<= 1.6 s/request đo được). Thêm 6 index lọc chưa làm: chi phí ghi + dung lượng, chưa có số liệu cho thấy cần.",
  "Câu `page` của scope rộng vẫn sort toàn bộ tập trong scope (top-N heapsort trên biểu thức to_char của view, ~0.6 s ở 340k dòng): index đúng thứ tự cần hàm to_char IMMUTABLE và thay view của migration 141 (CREATE OR REPLACE VIEW), nên để lại cho Codex quyết, không làm ở đây.",
  "Ngưỡng `rowScopeIndexMaxTuples`=500 được chọn giữa hai điểm đo (200 tuple: index nhanh hơn; 2000 tuple: scan nhanh hơn); gate đo thêm 400 và 800 tuple để kiểm hai phía của ngưỡng. Hình dạng phụ thuộc phân bố dòng/target thật; cần đo lại khi có số liệu production.",
  "Không đo tải đồng thời (nhiều request song song) và không đo bảng đang bị ghi; chỉ một request tuần tự.",
  "Corpus tổng hợp (TEST_ONLY): phân bố target/trạng thái là giả định có chủ đích (lệch mạnh), không phải dữ liệu thật.",
];

/** Hand-entered once, from the runs that led to the two fixes. Everything else in the receipt is generated. */
const MEASUREMENT_HISTORY: readonly string[] = [
  "Lab (scale 0.3, workspace lớn 180k dòng, scope 2000 tuple), dạng predicate CŨ (row-IN literal): COUNT(*) 312 s (bị hủy bởi trần 120 s), page 575 s, tức là 503 chắc chắn ở trần 2 s của production. 50 tuple: 225 ms; 200 tuple: 1161 ms (tuyến tính theo số tuple x số dòng).",
  "Lab, dạng MỚI (text[] + semi-join), cùng dữ liệu: COUNT 118 ms, page 168 ms, GROUP 123 ms (Hash Join + Parallel Seq Scan workspace).",
  "Chạy gate scale 1.0 SAU khi sửa predicate nhưng TRƯỚC migration 148: mọi request <= 2.0 s tổng (broad default 1776 ms, page 628 ms là câu chậm nhất), nhưng scope hẹp (3 tuple, 155 dòng) vẫn 932 ms vì đọc cả bảng 1M dòng ở 6 câu; 268 vi phạm Seq Scan; mid1/broad 15% bảng cũng Seq Scan.",
  "Chạy gate scale 1.0 SAU migration 148 nhưng CHƯA có ngưỡng `rowScopeIndexMaxTuples`: scope hẹp rất nhanh (cold 24 ms, hot 170 ms, 200 tuple 750 ms, 0 Seq Scan vi phạm) nhưng scope 2000 tuple CHẬM HƠN 2x (broad default 3904 ms, page 1640 ms, limit250 vượt 2 s = 503) vì planner nhân selectivity từng cột, đánh giá thấp số dòng khớp và chọn hàng nghìn probe index. Đó là lý do có ngưỡng.",
];

type Json = Record<string, unknown>;
interface PlanNode { type: string; relation?: string; index?: string; rows: number; loops: number; ms: number;
  hit: number; read: number; removed?: number; children: PlanNode[] }
interface Stmt { kind: string; ms: number; rows: number; sql: string; plan?: { exec_ms: number; plan_ms: number; root: PlanNode } }
interface CaseDef { name: string; query: Record<string, unknown>; cursor?: "after" | "before" }
interface ScopeDef { name: string; description: string; indexes: readonly number[] }
interface RunRow { ws: string; scope: string; scopeTuples: number; caseName: string; filtered: number; totalCount: number;
  totalMs: number[]; stmts: { kind: string; ms: number[] }[]; plans: Stmt[]; seqScans: string[]; scopeOnly?: boolean; failures: string[] }

const median = (values: readonly number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const round = (value: number) => Math.round(value * 10) / 10;

function trim(node: Json): PlanNode {
  const children = (node.Plans as Json[] | undefined ?? []).map(trim);
  return { type: String(node["Node Type"]), relation: node["Relation Name"] as string | undefined, index: node["Index Name"] as string | undefined,
    rows: Number(node["Actual Rows"]), loops: Number(node["Actual Loops"]), ms: round(Number(node["Actual Total Time"])),
    hit: Number(node["Shared Hit Blocks"] ?? 0), read: Number(node["Shared Read Blocks"] ?? 0),
    removed: node["Rows Removed by Filter"] === undefined ? undefined : Number(node["Rows Removed by Filter"]), children };
}
function* walk(node: PlanNode): Generator<PlanNode> { yield node; for (const child of node.children) yield* walk(child); }
const summary = (node: PlanNode) => [...walk(node)].filter(n => n.relation !== undefined)
  .map(n => `${n.type.replace(" using", "")}${n.index ? `(${n.index})` : ""}${n.relation && !n.index ? `[${n.relation}]` : ""}`).join(" + ");

function classify(sql: string, counts: { seen: number }): string {
  if (sql.includes("execution_incident_operation_links")) return "links";
  if (sql.includes("GROUP BY")) return `facet:${/SELECT "([a-z_]+)"::text AS value/.exec(sql)![1]}`;
  if (sql.startsWith("SELECT COUNT(*)")) return counts.seen++ === 0 ? "total" : "filtered";
  if (sql.startsWith("SELECT 1 FROM")) return "edge";
  return "page";
}

/** A pg Pool look-alike: every non-control statement is timed; in `explain` mode it is also re-run under EXPLAIN. */
function instrument(pool: Pool, explain: boolean, sink: Stmt[]): Pool {
  const counts = { seen: 0 };
  return {
    connect: async () => {
      const client = await pool.connect();
      return {
        query: async (sql: string, values?: unknown[]) => {
          if (/^(BEGIN|COMMIT|ROLLBACK)/.test(sql) || sql.includes("set_config(")) return client.query(sql, values);
          const kind = classify(sql, counts), t0 = performance.now();
          const result = await client.query(sql, values).catch((error: Error) => {
            console.error(`B1 gate: statement ${kind} failed after ${round(performance.now() - t0)} ms: ${error.message}\n${sql.slice(0, 600)}`);
            throw Object.assign(new Error(`statement ${kind} failed: ${error.message}`, { cause: error }), { code: (error as { code?: string }).code });
          });
          const ms = performance.now() - t0;
          const stmt: Stmt = { kind, ms, rows: result.rowCount ?? 0, sql };
          if (explain) {
            const e = await client.query("EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) " + sql, values);
            const top = e.rows[0]["QUERY PLAN"][0] as Json;
            stmt.plan = { exec_ms: round(Number(top["Execution Time"])), plan_ms: round(Number(top["Planning Time"])), root: trim(top.Plan as Json) };
          }
          sink.push(stmt); return result;
        },
        release: () => client.release(),
      };
    },
  } as unknown as Pool;
}

describe.skipIf(!URL || !ENABLED)("BE-P18 B1 / large-scale EXPLAIN gate / disposable PostgreSQL / TEST_ONLY", () => {
  const dbName = `b1x_explain_${process.pid}`;
  let admin: Pool, pool: Pool, dbUrl: string;
  let workspaces: readonly SeedWorkspace[];
  const rows: RunRow[] = [];
  const meta: Json = {};
  const codec = new KeysetCursorCodec({ activeKeyId: "b1x", keys: { b1x: "B1_EXPLAIN_cursor_key_0123456789abcdef0123" }, ttlSeconds: 3600 });
  const cursors = new Map<string, string>();

  beforeAll(async () => {
    const parsed = new globalThis.URL(URL!);
    if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(parsed.hostname)) throw new Error("B1 EXPLAIN gate refuses a non-loopback database");
    if (process.env.B1_EXPLAIN_DISPOSABLE !== "1") throw new Error("B1 EXPLAIN gate requires the disposable container started by its script");
    admin = new Pool({ connectionString: URL, max: 1 });
    await admin.query(`CREATE DATABASE ${dbName}`);
    parsed.pathname = `/${dbName}`; dbUrl = parsed.toString();
    const t0 = performance.now();
    await migrate({ databaseUrl: dbUrl, dir: join(__dirname, "..", "migrations"), direction: "up", migrationsTable: "pgmigrations", count: Infinity, noLock: true, log: () => {} });
    meta.migrate_seconds = round((performance.now() - t0) / 1000);
    pool = new Pool({ connectionString: dbUrl, max: 2 });
    workspaces = seedWorkspaces(SCALE);
    const t1 = performance.now();
    meta.seeded = await seedCorpus(pool, SCALE);
    meta.seed_seconds = round((performance.now() - t1) / 1000);
    meta.postgres = (await pool.query("SELECT version() AS v")).rows[0].v;
    meta.migrations_applied = (await pool.query("SELECT count(*)::int AS n, max(name) AS last FROM pgmigrations")).rows[0];
    meta.tables = (await pool.query(`SELECT c.relname AS name, c.reltuples::bigint AS est_rows, pg_total_relation_size(c.oid) AS total_bytes
      FROM pg_class c WHERE c.relname = ANY($1) ORDER BY 1`, [[...BIG_TABLES]])).rows;
    meta.indexes = (await pool.query(`SELECT indexname, tablename, pg_relation_size(quote_ident(indexname)::regclass) AS bytes, indexdef
      FROM pg_indexes WHERE schemaname = current_schema() AND tablename = ANY($1) ORDER BY tablename, indexname`, [[...BIG_TABLES]])).rows;
    meta.settings = Object.fromEntries((await pool.query(`SELECT name, setting, unit FROM pg_settings WHERE name IN
      ('shared_buffers','work_mem','effective_cache_size','max_parallel_workers_per_gather','random_page_cost','jit')`)).rows.map(r => [r.name, `${r.setting}${r.unit ?? ""}`]));
  }, 3_600_000);

  afterAll(async () => {
    await pool?.end().catch(() => undefined);
    await admin?.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`).catch(() => undefined);
    await admin?.end().catch(() => undefined);
  }, 120_000);

  const scopeOf = (ws: SeedWorkspace, def: ScopeDef): PostgresRowScope => ({
    columns: ["target_type", "target_id", "environment"], fingerprint: `b1x-${ws.label}-${def.name}`,
    allowedTuples: def.indexes.map(idx => targetTuple(ws, idx)) });
  const range = (from: number, count: number, step = 1) => Array.from({ length: count }, (_, i) => from + i * step);

  /** Scope shapes: the largest the minting code can produce (2000 tuples), a spread mid-size, and tiny hot/cold ones. */
  function scopes(ws: SeedWorkspace): ScopeDef[] {
    const broadCount = Math.min(2000, ws.targets);
    return [
      { name: "broad", description: `${broadCount} tuple (the 2000 cap, hot head of the skew)`, indexes: range(0, broadCount) },
      { name: "mid", description: "200 tuple rải đều", indexes: range(0, Math.min(200, Math.floor(ws.targets / 4)), 4) },
      { name: "hot", description: "3 tuple nóng nhất", indexes: [0, 1, 2] },
      { name: "cold", description: "3 tuple đuôi lạnh", indexes: [ws.targets - 3, ws.targets - 2, ws.targets - 1] },
      { name: "t400", description: "400 tuple rải đều (dưới ngưỡng 500: đường index)", indexes: range(0, Math.min(400, Math.floor(ws.targets / 5)), 5) },
      { name: "t800", description: "800 tuple rải đều (trên ngưỡng 500: đường scan)", indexes: range(0, Math.min(800, Math.floor(ws.targets / 2)), 2) },
    ];
  }
  const baseCases: CaseDef[] = [
    { name: "default", query: { limit: 100 } },
    { name: "limit250", query: { limit: 250 } },
    { name: "sort asc", query: { limit: 100, sort: "created_at:asc" } },
    { name: "triage_state", query: { limit: 100, triage_state: "UNACKNOWLEDGED" } },
    { name: "severity common", query: { limit: 100, severity: "INFO" } },
    { name: "severity rare", query: { limit: 100, severity: "CRITICAL" } },
    { name: "source_status", query: { limit: 100, source_status: "FAILED" } },
    { name: "verification_result", query: { limit: 100, verification_result: "PARTIAL" } },
    { name: "environment", query: { limit: 100, environment: "LIVE" } },
    { name: "target_type", query: { limit: 100, target_type: "PORTFOLIO" } },
    { name: "target_id", query: { limit: 100, target_id: "__first__" } },
    { name: "command_key", query: { limit: 100, command_key: "deployment/pause" } },
    { name: "four filters", query: { limit: 100, triage_state: "RESOLVED", severity: "WARNING", source_status: "SUCCEEDED", verification_result: "SUCCEEDED" } },
    { name: "cursor after p10", query: { limit: 100 }, cursor: "after" },
    { name: "cursor before p10", query: { limit: 100 }, cursor: "before" },
  ];
  const short = new Set(["default", "triage_state", "severity rare", "four filters"]);
  const matrix = (): { ws: SeedWorkspace; scope: ScopeDef; cases: CaseDef[] }[] => {
    const big = workspaces[0], mid = workspaces[1], small = workspaces[3];
    const [broad, medium, hot, cold, t400, t800] = scopes(big);
    return [
      { ws: big, scope: broad, cases: baseCases },
      { ws: big, scope: hot, cases: baseCases },
      { ws: big, scope: medium, cases: baseCases.filter(c => short.has(c.name) || c.cursor) },
      { ws: big, scope: cold, cases: baseCases.filter(c => short.has(c.name)) },
      { ws: big, scope: t400, cases: baseCases.filter(c => short.has(c.name) || c.cursor) },
      { ws: big, scope: t800, cases: baseCases.filter(c => short.has(c.name) || c.cursor) },
      { ws: mid, scope: scopes(mid)[0], cases: baseCases.filter(c => short.has(c.name)) },
      { ws: small, scope: scopes(small)[0], cases: baseCases.filter(c => short.has(c.name)) },
    ];
  };

  async function request(ws: SeedWorkspace, scope: PostgresRowScope, def: CaseDef, rawQuery: Record<string, unknown>,
    mode: "time" | "explain", override = {}) {
    const sink: Stmt[] = [];
    const engine = new ControlPlaneQueryService(instrument(pool, mode === "explain", sink), codec);
    const repository = new OperationalReadRepository(pool);
    const query = operationalQueueQuery.parse(rawQuery);
    const t0 = performance.now();
    const { page, snapshot } = await queueSnapshotPage(engine, repository, { actorId: SEED_USER, workspaceId: ws.id, role: "ADMIN" },
      scope, query, 100, override);
    const totalMs = performance.now() - t0;
    return { page, snapshot, sink, totalMs };
  }

  it("runs the real queue V2 transaction on the large corpus and records every plan", async () => {
    expect(meta.seeded).toMatchObject({ operations: workspaces.reduce((n, w) => n + w.operations, 0) });
    for (const { ws, scope: scopeDef, cases } of matrix()) {
      const scope = scopeOf(ws, scopeDef);
      const hotTarget = targetTuple(ws, 0)[1];
      // Cursors from page 10 of the default sort, for this scope, via the real engine (real sealed cursors).
      let after: string | null = null, before: string | null = null;
      if (cases.some(c => c.cursor)) try {
        let current: string | null = null;
        for (let page = 0; page < 10; page += 1) {
          const step = await request(ws, scope, cases[0], { limit: 100, ...(current ? { after: current } : {}) }, "time");
          current = step.page.next_cursor; if (!current) break;
        }
        after = current;
        if (current) before = (await request(ws, scope, cases[0], { limit: 100, after: current }, "time")).page.prev_cursor;
      } catch (error) {
        rows.push({ ws: ws.label, scope: scopeDef.name, scopeTuples: scope.allowedTuples.length, caseName: "cursor prelude", filtered: -1, totalCount: -1,
          totalMs: [0], stmts: [], plans: [], seqScans: [], failures: [`request failed: ${(error as Error).message}`] });
      }
      for (const def of cases) {
        try {
        if (def.cursor && !(def.cursor === "after" ? after : before)) continue;
        const raw: Record<string, unknown> = { ...def.query };
        if (raw.target_id === "__first__") raw.target_id = hotTarget;
        if (def.cursor) raw[def.cursor] = def.cursor === "after" ? after : before;
        await request(ws, scope, def, raw, "time"); // warm: plan cache is per-statement, buffers are what warms
        const totals: number[] = []; const perKind = new Map<string, number[]>(); let last: Awaited<ReturnType<typeof request>> | undefined;
        for (let run = 0; run < TIMED_RUNS; run += 1) {
          last = await request(ws, scope, def, raw, "time"); totals.push(last.totalMs);
          const seen = new Map<string, number>();
          for (const stmt of last.sink) {
            const n = (seen.get(stmt.kind) ?? 0) + 1; seen.set(stmt.kind, n);
            const key = n === 1 ? stmt.kind : `${stmt.kind}#${n}`;
            perKind.set(key, [...perKind.get(key) ?? [], stmt.ms]);
          }
        }
        // Plans: one extra run under EXPLAIN (ANALYZE, BUFFERS), with the request deadline lifted so EXPLAIN's own time
        // is not charged to the budget (timings above are the budgeted numbers, plans below are evidence of HOW).
        const explained = await request(ws, scope, def, raw, "explain", { statementTimeoutMs: 10_000, totalDeadlineMs: 30_000 });
        const seqScans: string[] = [], failures: string[] = [];
        for (const stmt of explained.sink) for (const node of walk(stmt.plan!.root)) {
          // Reading most of a table is what a scan SHOULD do; reading the whole table to keep a sliver is a missing index.
          const kept = node.rows / Math.max(1, node.rows + (node.removed ?? 0));
          if (node.type === "Seq Scan" && node.relation && (BIG_TABLES as readonly string[]).includes(node.relation) && kept < SEQ_SCAN_MIN_KEPT_FRACTION &&
              node.rows + (node.removed ?? 0) >= SEQ_SCAN_MIN_ROWS_READ)
            seqScans.push(`${stmt.kind}: Seq Scan ${node.relation} (${node.rows} rows, ${node.removed ?? 0} removed)`);
        }
        const { filtered_count, total_count } = explained.page;
        const dims = (explained.snapshot.counts as unknown as { dimensions: Record<string, { total: number }> }).dimensions;
        if (!["triage_state", "severity", "source_status", "verification_result", "environment", "target_type", "target_id", "command_key"].some(k => k in raw))
          for (const [field, dimension] of Object.entries(dims))
            if (dimension.total !== filtered_count) failures.push(`facet ${field} total ${dimension.total} != filtered ${filtered_count}`);
        const medTotal = median(totals);
        if (medTotal > TOTAL_REQUEST_BUDGET_MS) failures.push(`total ${round(medTotal)} ms > ${TOTAL_REQUEST_BUDGET_MS} ms`);
        for (const [kind, values] of perKind) if (median(values) > PER_STATEMENT_BUDGET_MS) failures.push(`${kind} ${round(median(values))} ms > ${PER_STATEMENT_BUDGET_MS} ms`);
        // Scope-only requests must never scan around the scope. A request that adds a secondary filter column with no index of
        // its own (severity, source_status, ...) is recorded but judged by the time budgets only.
        const scopeOnly = !FILTER_KEYS.some(k => k in raw);
        if (scopeOnly && seqScans.length) failures.push(...seqScans.map(s => `seq scan: ${s}`));
        if (explained.sink.length > 11) failures.push(`${explained.sink.length} statements`);
        rows.push({ ws: ws.label, scope: scopeDef.name, scopeTuples: scope.allowedTuples.length, caseName: def.name, filtered: filtered_count,
          totalCount: total_count, totalMs: totals.map(round), stmts: [...perKind].map(([kind, ms]) => ({ kind, ms: ms.map(round) })),
          plans: explained.sink, seqScans, scopeOnly, failures });
        } catch (error) {
          // A request that errors (for example the 503 QUERY_TIMEOUT) is a recorded violation, not an aborted gate.
          rows.push({ ws: ws.label, scope: scopeDef.name, scopeTuples: scope.allowedTuples.length, caseName: def.name, filtered: -1,
            totalCount: -1, totalMs: [0], stmts: [], plans: [], seqScans: [],
            failures: [`request failed: ${(error as Error).message}${(error as { code?: string }).code ? ` (${(error as { code?: string }).code})` : ""}`] });
        }
      }
    }
    // Evidence for the predicate fix (not an assertion): the PREVIOUS shape of the row-scope predicate, a literal row-IN of
    // every tuple, on the same corpus, the broadest scope the minting code can produce, under a 10 s cap.
    {
      const big = workspaces[0], tuples = scopes(big)[0].indexes.map(idx => targetTuple(big, idx));
      const params = tuples.map((_, k) => `($${2 + 3 * k}, $${3 + 3 * k}, $${4 + 3 * k})`);
      const sorted = tuples.map(([type, id, env]) => [env, id, type]).flat();
      const client = await pool.connect(); let outcome: Json;
      try {
        await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"); await client.query("SET LOCAL statement_timeout = '10s'");
        const t0 = performance.now();
        try {
          await client.query(`SELECT COUNT(*) FROM execution_operation_queue_v2 WHERE workspace_id = $1 AND ("environment", "target_id", "target_type") IN (${params.join(", ")})`, [big.id, ...sorted]);
          outcome = { tuples: tuples.length, ms: round(performance.now() - t0), timed_out: false };
        } catch (error) { outcome = { tuples: tuples.length, ms: round(performance.now() - t0), timed_out: (error as { code?: string }).code === "57014" }; }
      } finally { await client.query("ROLLBACK").catch(() => undefined); client.release(); }
      meta.legacy_literal_row_in = outcome;
    }
    expect(rows.length).toBeGreaterThan(20);
  }, 3_600_000);

  it("writes the receipt, then fails on any budget or index violation", () => {
    const failures = rows.flatMap(row => row.failures.map(f => `${row.ws}/${row.scope}/${row.caseName}: ${f}`));
    if (OUT_DIR) {
      mkdirSync(OUT_DIR, { recursive: true });
      writeFileSync(join(OUT_DIR, "BE-P18-b1-explain.plans.json"), JSON.stringify({ schema: "portal.be-p18.b1-explain.v1", scale: SCALE, meta,
        budgets: { per_statement_ms: PER_STATEMENT_BUDGET_MS, total_request_ms: TOTAL_REQUEST_BUDGET_MS, request_deadline_ms: OPERATIONAL_QUEUE_TOTAL_DEADLINE_MS },
        cases: rows.map(({ plans, ...rest }) => ({ ...rest, statements: plans.map(({ sql, ...p }) => ({ ...p, sql_head: sql.slice(0, 160) })) })) }, null, 1) + "\n");
      writeFileSync(join(OUT_DIR, "BE-P18-b1-explain.md"), renderMarkdown(rows, meta, failures));
    }
    expect(failures).toEqual([]);
  });
});

function renderMarkdown(rows: readonly RunRow[], meta: Json, failures: readonly string[]): string {
  let git = "unknown";
  try { git = execFileSync("git", ["rev-parse", "--short=12", "HEAD"], { cwd: __dirname }).toString().trim(); } catch { /* not a checkout */ }
  const seeded = meta.seeded as { operations: number; incidents: number; links: number };
  const mb = (bytes: unknown) => `${Math.round(Number(bytes) / 1048576)} MB`;
  const fmt = (values: readonly number[]) => `${round(median(values))}`;
  const lines: string[] = [];
  lines.push("# BE-P18 B1: gate EXPLAIN quy mô lớn cho operations queue V2", "",
    `Sinh tự động bởi \`apps/control-api/test/be-p18-b1-explain.pg.spec.ts\` (qua \`scripts/be-p18-b1-explain.sh\`). Không sửa tay. Commit mã: \`${git}\`.`, "",
    `**Verdict: ${failures.length === 0 ? "PASS" : "FAIL"}**${failures.length ? ` (${failures.length} vi phạm, xem cuối)` : ""}`, "",
    "## Quy mô và môi trường", "",
    `- Corpus TEST_ONLY, seed xác định (${meta.seed_seconds} s), scale ${seeded.operations === 1_000_000 ? "1.0" : "giảm"}: **${seeded.operations.toLocaleString("en-US")} operation, ${seeded.incidents.toLocaleString("en-US")} incident, ${seeded.links.toLocaleString("en-US")} link**, 5 workspace (600k/150k/150k/50k/50k op), target lệch (hot head, cold tail), \`created_at\` là hoán vị của thứ tự chèn (heap KHÔNG tương quan với khóa sort).`,
    `- DB dùng một lần, migrate bằng migration của repo (${(meta.migrations_applied as Json).n} migration, cuối: \`${(meta.migrations_applied as Json).last}\`).`,
    `- ${String(meta.postgres).split(" on ")[0]}; ${Object.entries(meta.settings as Json).map(([k, v]) => `${k}=${v}`).join(", ")}.`,
    `- Cache nóng: 1 lần warm + ${TIMED_RUNS} lần đo, lấy median; plan lấy từ một lần chạy riêng dưới EXPLAIN (ANALYZE, BUFFERS) (không tính vào ngân sách).`, "",
    "| Bảng | Kích thước (gồm index) |", "|---|---|",
    ...(meta.tables as Json[]).map(t => `| ${t.name} | ${mb(t.total_bytes)} |`), "",
    "| Index | Bảng | Kích thước |", "|---|---|---|",
    ...(meta.indexes as Json[]).map(i => `| ${i.indexname} | ${i.tablename} | ${mb(i.bytes)} |`), "",
    "## Ngân sách (nêu trước khi đo)", "",
    `- Mỗi câu SQL: median <= **${PER_STATEMENT_BUDGET_MS} ms** (trần production: statement_timeout 2000 ms).`,
    `- Cả request (một transaction, mọi câu): median <= **${TOTAL_REQUEST_BUDGET_MS} ms** (trần production: deadline tổng ${OPERATIONAL_QUEUE_TOTAL_DEADLINE_MS} ms, mới thêm ở lần này).`,
    `- Seq Scan trên 3 bảng lớn (queue_items, incidents, incident_operation_links) chỉ được phép khi nó GIỮ LẠI >= ${SEQ_SCAN_MIN_KEPT_FRACTION * 100}% số dòng nó đọc (đọc phần lớn bảng là đúng; đọc cả bảng để lấy một mẩu là thiếu chỉ mục). Vi phạm = ngược lại, ở BẤT KỲ câu nào, mọi scope.`,
    "- Tối đa 11 câu / request. Không bỏ facet, không đổi count thành 0.", "",
    "## Lịch sử đo (số ghi tay từ các lần chạy TRƯỚC, cùng corpus scale 1.0; lần chạy này là số trong bảng bên dưới)", "",
    ...MEASUREMENT_HISTORY.map(item => `- ${item}`), "",
    "## Kết quả theo request", "",
    "`n` = filtered_count của request. `ms` = tổng request median (min..max). `max stmt` = câu chậm nhất (median). Seq = số Seq Scan giữ < 25% dòng đọc (đọc >= 10k dòng/loop). Dòng có dấu `*` là request có bộ lọc phụ chưa có index riêng: chỉ ghi nhận, kiểm bằng ngân sách thời gian (xem phần Còn lại); dòng không dấu: vi phạm = lỗi gate.", "",
    "| ws | scope (tuple) | case | n | ms | max stmt | #stmt | Seq |", "|---|---|---|---|---|---|---|---|",
    ...rows.map(r => {
      const slow = r.stmts.map(s => ({ kind: s.kind, ms: median(s.ms) })).sort((a, b) => b.ms - a.ms)[0];
      if (!slow) return `| ${r.ws} | ${r.scope} (${r.scopeTuples}) | ${r.caseName} | - | LỖI | - | - | - |`;
      return `| ${r.ws} | ${r.scope} (${r.scopeTuples}) | ${r.caseName} | ${r.filtered} | ${fmt(r.totalMs)} (${round(Math.min(...r.totalMs))}..${round(Math.max(...r.totalMs))}) | ${slow.kind} ${round(slow.ms)} | ${r.plans.length} | ${r.seqScans.length}${r.scopeOnly === false ? "*" : ""} |`;
    }), "");
  const focus = rows.find(r => r.ws === "big" && r.scope === "broad" && r.caseName === "default");
  const focusHot = rows.find(r => r.ws === "big" && r.scope === "hot" && r.caseName === "default");
  for (const [title, row] of [["big / broad / default", focus], ["big / hot / default", focusHot]] as const) {
    if (!row) continue;
    lines.push(`## Plan từng câu: ${title}`, "", "| câu | ms (median) | rows | plan (scan nodes) | exec trong plan ms |", "|---|---|---|---|---|");
    for (const stmt of row.plans) {
      const timing = row.stmts.find(s => s.kind === stmt.kind);
      lines.push(`| ${stmt.kind} | ${timing ? fmt(timing.ms) : "-"} | ${stmt.rows} | ${summary(stmt.plan!.root)} | ${stmt.plan!.exec_ms} |`);
    }
    lines.push("");
  }
  const legacy = meta.legacy_literal_row_in as { tuples: number; ms: number; timed_out: boolean } | undefined;
  if (legacy) lines.push("## Dạng predicate scope cũ (bằng chứng cho thay đổi `rowScopeSql`)", "",
    `Cùng corpus, workspace lớn nhất, scope rộng nhất (${legacy.tuples} tuple), \`SELECT COUNT(*)\` với row-IN literal của MỌI tuple (dạng trước BE-P18, OR của N điều kiện, O(dòng x N)): ` +
    `**${legacy.timed_out ? `quá trần 10 s (bị hủy sau ${legacy.ms} ms; production sẽ là 503 QUERY_TIMEOUT ở 2 s)` : `${legacy.ms} ms`}**. ` +
    "Dạng mới: một bind text[] mỗi cột + `IN (SELECT * FROM unnest(...))`, planner chọn semi-join (xem bảng trên).", "");
  lines.push("Plan đầy đủ của MỌI câu của MỌI request (cây node, rows, loops, ms, buffers hit/read) nằm trong `BE-P18-b1-explain.plans.json`.", "",
    "## Việc còn lại / không khẳng định", "", ...REMAINING.map(item => `- ${item}`), "");
  if (failures.length) lines.push("## Vi phạm", "", ...failures.map(f => `- ${f}`), "");
  return lines.join("\n");
}
