import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { OperationalHealthPublicationRepository, operationalHealthPublication,
  type OperationalHealthPublication, type OperationalHealthPublicationBinding } from "../src/operations/operational-health-publication";
import { createOperationalQueueHealthSource, operationalHealthViewDigest } from "../src/operations/operational-health-source";
import type { PostgresSnapshotReader } from "../src/query";
import type { QueryResultRow } from "pg";
import type { OperationalAuditCohort } from "../src/operations/current-operational-read";

const migration = (name: string) => readFileSync(resolve(__dirname, "../migrations", name), "utf8").split("-- Down Migration")[0]!;
const ws = "TEST_ONLY:health-workspace", source = "TEST_ONLY:health-source", epoch = "TEST_ONLY:health-epoch";
const fixture: OperationalHealthPublication = JSON.parse(readFileSync(resolve(__dirname,
  "fixtures/operational-health-publication.synthetic.json"), "utf8"));
const input = (patch: Partial<OperationalHealthPublication> = {}): OperationalHealthPublication => ({
  ...structuredClone(fixture),
  source_as_of: new Date(Date.now() - 30_000).toISOString(), expires_at: new Date(Date.now() + 120_000).toISOString(),
  ...patch,
});

describe("health publication closed private input", () => {
  it("accepts the checked-in synthetic shape, not its historical clocks as runtime qualification", () => {
    expect(operationalHealthPublication.safeParse(fixture).success).toBe(true);
  });
  it("accepts true zero-row publication, nullable axes, and no qualification string", () => {
    expect(operationalHealthPublication.safeParse(input({ rows: [] })).success).toBe(true);
    const p = input(); p.rows[0]!.delivery_state = null;
    expect(operationalHealthPublication.safeParse(p).success).toBe(true);
    expect(operationalHealthPublication.safeParse({ ...p, qualification: "SOURCE_VERIFIED" }).success).toBe(false);
  });
  it.each(["duplicate", "status-alias", "unknown-field", "bad-clock", "unsafe-version", "bad-sequence", "trailing-newline"])("refuses %s", name => {
    const p: any = input();
    if (name === "duplicate") p.rows.push(structuredClone(p.rows[0]));
    if (name === "status-alias") p.rows[0].delivery_state = "SUCCEEDED";
    if (name === "unknown-field") p.rows[0].source_status = "SUCCEEDED";
    if (name === "bad-clock") p.expires_at = p.source_as_of;
    if (name === "unsafe-version") p.rows[0].workflow_version = Number.MAX_SAFE_INTEGER;
    if (name === "bad-sequence") p.source_sequence = "01";
    if (name === "trailing-newline") p.source_ref += "\n";
    expect(operationalHealthPublication.safeParse(p).success).toBe(false);
  });
});

describe.skipIf(!process.env.TEST_DATABASE_URL)("health ingress and exact queue view on real disposable PostgreSQL (TEST_ONLY)", () => {
  const base = process.env.TEST_DATABASE_URL!, name = `operation_health_${randomUUID().replaceAll("-", "")}`;
  const url = (database: string) => { const value = new URL(base); value.pathname = `/${database}`; return value.toString(); };
  let pool: Pool;
  const binding = (patch: Partial<OperationalHealthPublicationBinding> = {}): OperationalHealthPublicationBinding => ({
    workspaceId: ws, sourceRef: source, sourceEpoch: epoch, maximumReceipts: 8,
    // TEST-ONLY source-proof double. This is never installed/claimed as Edge authority.
    withVerifiedSource: async (_p, write) => write(), ...patch,
  });
  const writer = (patch: Partial<OperationalHealthPublicationBinding> = {}, now?: () => number) =>
    new OperationalHealthPublicationRepository(pool, binding(patch), now);
  const view = async () => (await pool.query(`SELECT operation_id,source_status,verification_result,delivery_state,display_state
    FROM execution_operation_queue_health_v2 ORDER BY operation_id`)).rows;
  const next = (p: OperationalHealthPublication, patch: Partial<OperationalHealthPublication> = {}) => ({ ...p,
    source_revision: "TEST_ONLY:health-r2", source_sequence: "2", previous_revision: p.source_revision, ...patch });
  const counts = async () => (await pool.query(`SELECT
    (SELECT count(*)::int FROM execution_operation_health_receipts) receipts,
    (SELECT count(*)::int FROM execution_operation_health_heads) heads,
    (SELECT count(*)::int FROM execution_operation_health_observations) observations`)).rows[0];

  beforeAll(async () => {
    const admin = new Pool({ connectionString: url("postgres"), max: 1 });
    try { await admin.query(`CREATE DATABASE ${name}`); } finally { await admin.end(); }
    pool = new Pool({ connectionString: url(name), max: 4 });
    // Minimal identity prerequisites only; queue, guard and views are REAL
    // checked-in migration bytes, not retyped test tables.
    await pool.query("CREATE TABLE portal_users(user_id text PRIMARY KEY); CREATE TABLE workspaces(workspace_id text PRIMARY KEY)");
    await pool.query(migration("1723680000008_execution-operations-queue.sql").split("INSERT INTO execution_operation_queue_items")[0]!);
    await pool.query(migration("1723680000141_execution-operational-current-reads.sql"));
    await pool.query(migration("1723680000154_execution-operation-health-publication.sql"));
  }, 60_000);
  beforeEach(async () => {
    await pool.query(`TRUNCATE execution_operation_health_observations,execution_operation_health_receipts,
      execution_operation_health_heads,execution_operation_queue_items,execution_operation_workflow_events,workspaces CASCADE`);
    await pool.query("INSERT INTO workspaces VALUES($1),('TEST_ONLY:other-workspace')", [ws]);
    for (const suffix of ["a", "b"]) await pool.query(`INSERT INTO execution_operation_queue_items
      (operation_id,workspace_id,operation_kind,command_key,environment,target_type,target_id,risk_tier,severity,
       source_authority,source_status,verification_result,triage_state,workflow_version,created_at,updated_at)
      VALUES($1,$2,'EXECUTION_COMMAND','paper/health','PAPER','ACCOUNT',$3,'R1_PAPER_MUTATION','WARNING',
       'PORTAL','BLOCKED','NOT_STARTED','UNACKNOWLEDGED',1,now(),now())`,
    [`TEST_ONLY:op-${suffix}`, ws, `TEST_ONLY:account-${suffix}`]);
  });
  afterAll(async () => {
    await pool?.end();
    const admin = new Pool({ connectionString: url("postgres"), max: 1 });
    try {
      if (!/^operation_health_[a-f0-9]{32}$/.test(name)) throw new Error("TEST_DATABASE_NAME_INVALID");
      await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    } finally { await admin.end(); }
  }, 60_000);

  it("pins the installed view descriptor and refuses drift in a real PostgreSQL transaction", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const snapshot = { rows: [], query: async (sql: string, values: readonly unknown[]) =>
        (await client.query(sql, [...values])).rows, groupedCounts: async () => new Map() } as PostgresSnapshotReader<QueryResultRow>;
      const pin = await operationalHealthViewDigest(snapshot);
      const fingerprint = `sha256:${"a".repeat(64)}`;
      const cohort = { fingerprint, scope: { fingerprint } } as OperationalAuditCohort;
      const source = createOperationalQueueHealthSource({ authority: "PORTAL", source_ref: "TEST_ONLY:view",
        schema_sha256: `sha256:${"b".repeat(64)}`, view_definition_sha256_v1: pin,
        table: "execution_operation_queue_health_v2", delivery_axis: "delivery_state", display_axis: "display_state" });
      const plan = source.select(cohort, {})!.plan;
      await expect(plan.verify!(snapshot)).resolves.toBeUndefined();
      await client.query("ALTER VIEW public.execution_operation_queue_health_v2 RENAME COLUMN delivery_state TO altered_delivery_state");
      await expect(plan.verify!(snapshot)).rejects.toThrow();
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  it("persists source axes separately; base population/status/result never change", async () => {
    const before = (await pool.query("SELECT * FROM execution_operation_queue_v2 ORDER BY operation_id")).rows;
    const p = input();
    expect(await writer().publish(p)).toMatchObject({ state: "COMMITTED", receipt_digest: expect.stringMatching(/^sha256:/) });
    expect(await view()).toEqual([
      { operation_id: "TEST_ONLY:op-a", source_status: "BLOCKED", verification_result: "NOT_STARTED", delivery_state: "AWAITING_RECEIPT", display_state: "CATCHING_UP" },
      { operation_id: "TEST_ONLY:op-b", source_status: "BLOCKED", verification_result: "NOT_STARTED", delivery_state: "NOT_REPORTED", display_state: "NOT_REPORTED" },
    ]);
    expect((await pool.query("SELECT * FROM execution_operation_queue_v2 ORDER BY operation_id")).rows).toEqual(before);
    expect(await counts()).toEqual({ receipts: 1, heads: 1, observations: 1 });
  });
  it("restarts/retries with the same digest and never emits a second receipt", async () => {
    const p = input(), first = await writer().publish(p);
    expect(await writer().publish(p)).toEqual({ ...first, state: "REPLAY" });
    const changed = structuredClone(p); changed.rows[0]!.display_state = "CURRENT";
    await expect(writer().publish(changed)).rejects.toMatchObject({ code: "OPERATIONAL_HEALTH_RECEIPT_CONFLICT" });
    expect(await counts()).toEqual({ receipts: 1, heads: 1, observations: 1 });
  });
  it("serializes concurrent same-source retries across independent writers", async () => {
    const p = input();
    const result = await Promise.all([writer().publish(p), writer().publish(p)]);
    expect(result.map(r => r.state).sort()).toEqual(["COMMITTED", "REPLAY"]);
    expect(result[0]!.receipt_digest).toBe(result[1]!.receipt_digest);
    expect(await counts()).toEqual({ receipts: 1, heads: 1, observations: 1 });
  });
  it("holds the source verifier around the COMMIT; denial never writes a receipt", async () => {
    await expect(writer({ withVerifiedSource: async () => { throw new Error("TEST_ONLY_SOURCE_DENIED"); } }).publish(input()))
      .rejects.toThrow("TEST_ONLY_SOURCE_DENIED");
    expect(await counts()).toEqual({ receipts: 0, heads: 0, observations: 0 });
    let committedInside = false;
    await writer({ withVerifiedSource: async (_p, write) => {
      const result = await write(); committedInside = (await counts()).receipts === 1; return result;
    } }).publish(input());
    expect(committedInside).toBe(true);
  });
  it("rejects future/expired clocks and an oversized envelope before persistence", async () => {
    const p = input();
    await expect(writer().publish({ ...p, source_as_of: new Date(Date.now() + 60_000).toISOString() }))
      .rejects.toMatchObject({ code: "OPERATIONAL_HEALTH_SOURCE_CHANGED" });
    await expect(writer().publish({ ...p, expires_at: new Date(Date.now() - 1_000).toISOString() }))
      .rejects.toMatchObject({ code: "OPERATIONAL_HEALTH_SOURCE_CHANGED" });
    await expect(writer().publish({ ...p, extra: "x".repeat(524_288) }))
      .rejects.toMatchObject({ code: "OPERATIONAL_HEALTH_PUBLICATION_INVALID" });
    expect(await counts()).toEqual({ receipts: 0, heads: 0, observations: 0 });
  });
  it.each(["target_id", "target_type", "environment", "workflow_version", "operation_id"])("refuses changed %s and rolls back the whole batch", async field => {
    const p = input(), bad = { ...p.rows[0]!, operation_id: "TEST_ONLY:op-b", target_id: "TEST_ONLY:account-b" };
    if (field === "target_id") bad.target_id = "TEST_ONLY:wrong";
    if (field === "target_type") bad.target_type = "PORTFOLIO";
    if (field === "environment") bad.environment = "LIVE";
    if (field === "workflow_version") bad.workflow_version = 2;
    if (field === "operation_id") bad.operation_id = "TEST_ONLY:missing";
    p.rows.push(bad);
    await expect(writer().publish(p)).rejects.toMatchObject({ code: "OPERATIONAL_HEALTH_TARGET_CHANGED" });
    expect(await counts()).toEqual({ receipts: 0, heads: 0, observations: 0 });
  });
  it.each(["workspace", "source", "epoch"])("refuses a different %s without borrowing original binding", async field => {
    const p = input();
    if (field === "workspace") p.workspace_id = "TEST_ONLY:other-workspace";
    if (field === "source") p.source_ref = "TEST_ONLY:other-source";
    if (field === "epoch") p.source_epoch = "TEST_ONLY:other-epoch";
    await expect(writer().publish(p)).rejects.toMatchObject({ code: "OPERATIONAL_HEALTH_SOURCE_CHANGED" });
    expect(await counts()).toEqual({ receipts: 0, heads: 0, observations: 0 });
  });
  it("binds original previous revision, numeric sequence and monotone source cut", async () => {
    const p = input(); await writer().publish(p);
    for (const delta of [{ source_sequence: "3" }, { previous_revision: "TEST_ONLY:wrong" },
      { source_as_of: new Date(Date.parse(p.source_as_of) - 1).toISOString() }]) {
      await expect(writer().publish(next(p, delta))).rejects.toMatchObject({ code: "OPERATIONAL_HEALTH_CURSOR_MISMATCH" });
    }
    await writer().publish(next(p));
    // An old exact retry is acknowledged but does not rewind the current head.
    expect((await writer().publish(p)).state).toBe("REPLAY");
    expect((await pool.query("SELECT source_sequence::text FROM execution_operation_health_heads")).rows[0].source_sequence).toBe("2");
  });
  it("never lets another source overwrite an already owned operation", async () => {
    await writer().publish(input());
    const other = input({ source_ref: "TEST_ONLY:other-source" });
    await expect(writer({ sourceRef: other.source_ref }).publish(other)).rejects.toMatchObject({ code: "OPERATIONAL_HEALTH_SOURCE_CHANGED" });
    expect(await counts()).toEqual({ receipts: 1, heads: 1, observations: 1 });
  });
  it("retention capacity is explicit: retries work but new receipts are not silently deleted", async () => {
    const p = input(); await writer({ maximumReceipts: 1 }).publish(p);
    expect((await writer({ maximumReceipts: 1 }).publish(p)).state).toBe("REPLAY");
    await expect(writer({ maximumReceipts: 1 }).publish(next(p))).rejects.toMatchObject({ code: "OPERATIONAL_HEALTH_CAPACITY" });
    expect(await counts()).toEqual({ receipts: 1, heads: 1, observations: 1 });
  });
  it("retirement is durable, withdraws axes and preserves immutable receipts", async () => {
    const p = input(); await writer().publish(p); await writer().retire();
    expect((await view()).every(row => row.delivery_state === "NOT_REPORTED" && row.display_state === "NOT_REPORTED")).toBe(true);
    await expect(writer().publish(p)).rejects.toMatchObject({ code: "OPERATIONAL_HEALTH_SOURCE_CHANGED" });
    await expect(pool.query("UPDATE execution_operation_health_receipts SET payload_digest=$1", [`sha256:${"a".repeat(64)}`])).rejects.toThrow("immutable");
    await expect(pool.query("DELETE FROM execution_operation_health_receipts")).rejects.toThrow("immutable");
    expect(await counts()).toEqual({ receipts: 1, heads: 1, observations: 1 });
  });
  it("a retirement before first publish is a tombstone, not an invented receipt/ordinal", async () => {
    await writer().retire();
    const head = (await pool.query("SELECT source_sequence,source_revision,retired FROM execution_operation_health_heads")).rows[0];
    expect(head).toEqual({ source_sequence: null, source_revision: null, retired: true });
    await expect(writer().publish(input())).rejects.toMatchObject({ code: "OPERATIONAL_HEALTH_SOURCE_CHANGED" });
    expect(await counts()).toEqual({ receipts: 0, heads: 1, observations: 0 });
  });
  it("a newer workflow version and a database-expired source never retain positive axes", async () => {
    await writer().publish(input());
    await pool.query("UPDATE execution_operation_queue_items SET workflow_version=2 WHERE operation_id='TEST_ONLY:op-a'");
    expect((await view())[0].display_state).toBe("NOT_REPORTED");
    await writer().retire();
    const past = Date.now() - 300_000;
    const p = input({ source_ref: "TEST_ONLY:expired-source", source_as_of: new Date(past - 30_000).toISOString(),
      expires_at: new Date(past + 30_000).toISOString() });
    p.rows = [{ ...p.rows[0]!, operation_id: "TEST_ONLY:op-b", target_id: "TEST_ONLY:account-b" }];
    await writer({ sourceRef: p.source_ref }, () => past).publish(p);
    expect((await view())[1].display_state).toBe("NOT_REPORTED");
  });
  it("nullable source axes stay unknown, never turn into zero or NOT_APPLICABLE", async () => {
    const p = input(); p.rows[0]!.display_state = null; p.rows[0]!.delivery_state = null;
    await writer().publish(p);
    expect((await view())[0]).toMatchObject({ delivery_state: "NOT_REPORTED", display_state: "NOT_REPORTED" });
  });
  it("non-destructive down migration removes only the view and preserves all queue/receipt bytes", async () => {
    await writer().publish(input());
    const file = readFileSync(resolve(__dirname, "../migrations/1723680000154_execution-operation-health-publication.sql"), "utf8");
    await pool.query(file.split("-- Down Migration")[1]!);
    expect(await counts()).toEqual({ receipts: 1, heads: 1, observations: 1 });
    expect((await pool.query("SELECT count(*)::int count FROM execution_operation_queue_items")).rows[0].count).toBe(2);
    // Reinstall precisely the checked-in VIEW statement, not the retained tables.
    await pool.query(file.slice(file.indexOf("CREATE VIEW"), file.indexOf("-- Down Migration")));
  });
});
