/** TEST_ONLY isolated PostgreSQL regressions; execution receipts belong to C7.
 * Actual disposable TEST_DATABASE_URL only, no default DSN or shared migrations.
 * Four ordinary transaction-helper regressions, not native-provider acceptance.
 * The ACK fault is injected AFTER the actual PostgreSQL command resolves; it
 * models an application observation loss, not a physical network fault proxy. */
import { randomBytes } from "node:crypto";
import { Pool, type PoolClient, type QueryResult } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { withTransaction } from "../src/db/pool";

const database = process.env.TEST_DATABASE_URL;
type ReleaseReason = boolean | Error | undefined;
type Fault = "ROLLBACK_AFTER_ACK" | "ROLLBACK_BEFORE_SEND" | "COMMIT_AFTER_ACK" | "NONE";
type BorrowLog = {
  borrows: number; pid: number | null; controls: string[]; releases: ReleaseReason[];
  physicalCommits: number; physicalRollbacks: number; injected: number;
};

async function bounded<T>(work: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("TEST_ONLY_TX_OBSERVATION_DEADLINE")), milliseconds);
    })]);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}

describe.skipIf(!database).sequential("C7 withTransaction: four actual PostgreSQL faults / TEST_ONLY", () => {
  const nonce = randomBytes(12).toString("hex"), schema = "test_elp210_tx_" + nonce;
  const borrowerName = "TEST_ONLY_elp210_tx_" + nonce;
  if (!/^test_elp210_tx_[0-9a-f]{24}$/.test(schema)) throw new Error("TEST_ONLY_TX_IDENTIFIER_INVALID");
  const relation = `"${schema}"."witness"`;
  let pool: Pool | undefined, witness: Pool | undefined;
  let schemaCreated = false, tableCreated = false;
  const cleanupFaults = new Set<() => void>();

  const ownPool = (applicationName: string) => {
    const result = new Pool({ connectionString: database!, max: 1, connectionTimeoutMillis: 1_000,
      statement_timeout: 1_000, query_timeout: 2_000, idle_in_transaction_session_timeout: 5_000,
      idleTimeoutMillis: 30_000, application_name: applicationName });
    // A deliberately terminated borrowed backend emits an error before/alongside
    // query rejection. Handle the event without swallowing any query failures.
    result.on("error", () => undefined);
    result.on("connect", client => client.on("error", () => undefined));
    return result;
  };

  beforeAll(async () => {
    // No setupApp/migrateTestDatabase/truncateAll: this isolated helper has no
    // dependency on the Portal schema and may touch only its fresh owned table.
    pool = ownPool(borrowerName); witness = ownPool(borrowerName + "_witness");
    await witness.query(`CREATE SCHEMA "${schema}"`); schemaCreated = true;
    await witness.query(`CREATE TABLE ${relation} (id text PRIMARY KEY, payload text NOT NULL)`);
    tableCreated = true;
    const roles = await Promise.all([pool.query("SELECT current_database() AS db, current_user AS role"),
      witness.query("SELECT current_database() AS db, current_user AS role")]);
    expect(roles[0].rows).toEqual(roles[1].rows);
  });
  afterEach(() => { for (const cleanup of [...cleanupFaults]) cleanup(); });
  afterAll(async () => {
    const failures: unknown[] = [];
    const attempt = async (work: () => Promise<unknown>) => { try { await work(); } catch (error) { failures.push(error); } };
    for (const cleanup of [...cleanupFaults]) { try { cleanup(); } catch (error) { failures.push(error); } }
    if (pool) await attempt(() => pool!.end());
    // Exact random owned objects only, deliberately no CASCADE or shared reset.
    if (tableCreated) await attempt(() => witness!.query(`DROP TABLE ${relation}`));
    if (schemaCreated) await attempt(() => witness!.query(`DROP SCHEMA "${schema}"`));
    if (witness) await attempt(() => witness!.end());
    if (failures.length) throw new AggregateError(failures, "TEST_ONLY_TX_OWNED_CLEANUP_FAILED");
  });

  function faultOneBorrow(fault: Fault, failure: Error) {
    const target = pool!, originalConnect = target.connect, ownConnect = Object.hasOwn(target, "connect");
    const borrow = originalConnect.bind(target) as () => Promise<PoolClient>;
    const log: BorrowLog = { borrows: 0, pid: null, controls: [], releases: [],
      physicalCommits: 0, physicalRollbacks: 0, injected: 0 };
    let active: PoolClient | undefined;
    let restoreClient: () => void = () => undefined;
    const restoreConnect = () => {
      if (ownConnect) target.connect = originalConnect; else Reflect.deleteProperty(target, "connect");
    };
    const cleanup = () => {
      restoreConnect(); restoreClient();
      const held = active; active = undefined;
      try { held?.release(true); } finally { cleanupFaults.delete(cleanup); }
    };
    cleanupFaults.add(cleanup);
    target.connect = (async () => {
      const client = await borrow(); active = client; log.borrows++; restoreConnect();
      const originalQuery = client.query, originalRelease = client.release;
      const ownQuery = Object.hasOwn(client, "query"), ownRelease = Object.hasOwn(client, "release");
      restoreClient = () => {
        if (ownQuery) client.query = originalQuery; else Reflect.deleteProperty(client, "query");
        if (ownRelease) client.release = originalRelease; else Reflect.deleteProperty(client, "release");
      };
      const invoke = (...args: unknown[]) =>
        (originalQuery as (...args: unknown[]) => Promise<QueryResult>).apply(client, args);
      try { log.pid = Number((await invoke("SELECT pg_backend_pid() AS pid")).rows[0].pid); }
      catch (error) { cleanup(); throw error; }
      client.query = (async (...args: unknown[]) => {
        const sql = typeof args[0] === "string" ? args[0] : (args[0] as { text?: unknown })?.text;
        const control = typeof sql === "string" ? sql.trim().toUpperCase() : "";
        if (["BEGIN", "COMMIT", "ROLLBACK"].includes(control)) log.controls.push(control);
        if (control === "ROLLBACK" && fault === "ROLLBACK_BEFORE_SEND") { log.injected++; throw failure; }
        const result = await invoke(...args);
        if (control === "COMMIT") { expect(result.command).toBe("COMMIT"); log.physicalCommits++; }
        if (control === "ROLLBACK") { expect(result.command).toBe("ROLLBACK"); log.physicalRollbacks++; }
        if ((control === "ROLLBACK" && fault === "ROLLBACK_AFTER_ACK") ||
            (control === "COMMIT" && fault === "COMMIT_AFTER_ACK")) { log.injected++; throw failure; }
        return result;
      }) as PoolClient["query"];
      client.release = ((reason?: ReleaseReason) => {
        log.releases.push(reason); active = undefined; restoreClient(); cleanupFaults.delete(cleanup);
        originalRelease.call(client, reason);
      }) as PoolClient["release"];
      return client;
    }) as Pool["connect"];
    return log;
  }

  const insert = (client: PoolClient, id: string) =>
    client.query(`INSERT INTO ${relation} (id,payload) VALUES($1,'TEST_ONLY')`, [id]);
  const rows = async (id: string) =>
    (await witness!.query(`SELECT id,payload FROM ${relation} WHERE id=$1`, [id])).rows;
  async function healthyBorrowAfter(log: BorrowLog, destroyed: boolean) {
    const next = await pool!.connect();
    try {
      const pid = Number((await next.query("SELECT pg_backend_pid() AS pid")).rows[0].pid);
      expect(Number.isSafeInteger(pid)).toBe(true);
      if (destroyed) expect(pid).not.toBe(log.pid); else expect(pid).toBe(log.pid);
      expect((await next.query("SELECT 1 AS alive")).rows).toEqual([{ alive: 1 }]);
    } finally { next.release(); }
    if (destroyed) {
      // PID is captured from the exact own borrower, not supplied by the caller.
      const deadline = Date.now() + 1_000;
      let remaining = 1;
      for (let count = 0; count < 40; count++) {
        remaining = Number((await witness!.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE pid=$1", [log.pid])).rows[0].n);
        if (!remaining || Date.now() >= deadline) break;
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      expect(remaining).toBe(0);
    }
    expect(pool!.waitingCount).toBe(0); expect(pool!.idleCount).toBe(pool!.totalCount);
  }

  it("preserves original body error when real ROLLBACK succeeds but its application ACK is lost", async () => {
    const original = new Error("TEST_ONLY_BODY_FAILED"), ack = new Error("TEST_ONLY_ROLLBACK_ACK_LOST");
    const log = faultOneBorrow("ROLLBACK_AFTER_ACK", ack); let bodies = 0;
    await expect(withTransaction(pool!, async client => { bodies++; await insert(client, "rollback-ack"); throw original; }))
      .rejects.toBe(original);
    expect(bodies).toBe(1); expect(log.borrows).toBe(1); expect(log.injected).toBe(1);
    expect(log.controls).toEqual(["BEGIN", "ROLLBACK"]); expect(log.physicalRollbacks).toBe(1);
    expect(log.physicalCommits).toBe(0); expect(log.releases).toEqual([true]);
    await healthyBorrowAfter(log, true); expect(await rows("rollback-ack")).toEqual([]);
  });

  it("discards an open transaction after failure before ROLLBACK is sent, without replacing the original error", async () => {
    const original = new Error("TEST_ONLY_BODY_FAILED"), rollback = new Error("TEST_ONLY_ROLLBACK_NOT_SENT");
    const log = faultOneBorrow("ROLLBACK_BEFORE_SEND", rollback); let bodies = 0;
    await expect(withTransaction(pool!, async client => { bodies++; await insert(client, "rollback-unsent"); throw original; }))
      .rejects.toBe(original);
    expect(bodies).toBe(1); expect(log.borrows).toBe(1); expect(log.injected).toBe(1);
    expect(log.controls).toEqual(["BEGIN", "ROLLBACK"]); expect(log.physicalRollbacks).toBe(0);
    expect(log.physicalCommits).toBe(0); expect(log.releases).toEqual([true]);
    // Destruction, not a fabricated successful ROLLBACK, removes the old open tx.
    await healthyBorrowAfter(log, true); expect(await rows("rollback-unsent")).toEqual([]);
  });

  it("preserves the real query failure and replaces only the exact borrower after actual backend termination", async () => {
    const log = faultOneBorrow("NONE", new Error("TEST_ONLY_UNUSED")); let bodies = 0, original: unknown;
    const result = withTransaction(pool!, async client => {
      bodies++; await insert(client, "terminated");
      let onError: ((error: Error) => void) | undefined;
      const terminated = new Promise<Error>(resolve => { onError = resolve; client.once("error", onError); });
      try {
        const killed = await witness!.query(`SELECT pg_terminate_backend(pid) AS terminated
          FROM pg_stat_activity WHERE pid=$1 AND pid<>pg_backend_pid()
          AND datname=current_database() AND usename=current_user AND application_name=$2`, [log.pid, borrowerName]);
        expect(killed.rows).toEqual([{ terminated: true }]);
        expect(await bounded(terminated, 1_000)).toMatchObject({ code: "57P01" });
      } finally { if (onError) client.removeListener("error", onError); }
      try { await client.query("SELECT 1 AS must_fail"); }
      catch (error) { original = error; throw error; }
      throw new Error("TEST_ONLY_TERMINATED_BACKEND_QUERY_UNEXPECTEDLY_SUCCEEDED");
    });
    let received: unknown;
    try { await result; } catch (error) { received = error; }
    expect(original).toBeInstanceOf(Error); expect(received).toBe(original);
    expect(bodies).toBe(1); expect(log.borrows).toBe(1); expect(log.injected).toBe(0);
    expect(log.controls).toEqual(["BEGIN", "ROLLBACK"]); expect(log.physicalRollbacks).toBe(0);
    expect(log.physicalCommits).toBe(0); expect(log.releases).toEqual([true]);
    await healthyBorrowAfter(log, true); expect(await rows("terminated")).toEqual([]);
  });

  it("keeps a physically COMMITTED row after lost application ACK, reports the original error, and never retries", async () => {
    const commit = new Error("TEST_ONLY_COMMIT_ACK_LOST");
    const log = faultOneBorrow("COMMIT_AFTER_ACK", commit); let bodies = 0;
    await expect(withTransaction(pool!, async client => { bodies++; await insert(client, "commit-ack"); return "NOT_RETURNED"; }))
      .rejects.toBe(commit);
    expect(bodies).toBe(1); expect(log.borrows).toBe(1); expect(log.injected).toBe(1);
    expect(log.controls).toEqual(["BEGIN", "COMMIT", "ROLLBACK"]);
    expect(log.physicalCommits).toBe(1); expect(log.physicalRollbacks).toBe(1);
    // ROLLBACK outside the completed transaction is real but proves no absence.
    expect(log.releases).toEqual([undefined]);
    expect(await rows("commit-ack")).toEqual([{ id: "commit-ack", payload: "TEST_ONLY" }]);
    await healthyBorrowAfter(log, false);
    expect((await withTransaction(pool!, client => client.query("SELECT 1 AS ok"))).rows).toEqual([{ ok: 1 }]);
    expect(await rows("commit-ack")).toEqual([{ id: "commit-ack", payload: "TEST_ONLY" }]);
    expect(bodies).toBe(1); expect(log.physicalCommits).toBe(1);
  });
});
