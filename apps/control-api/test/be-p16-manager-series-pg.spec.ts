/** BE-P16 (ELP2-05/06): the Manager series writer on a real, isolated PostgreSQL. Skipped without TEST_DATABASE_URL; the lead runs it under the heavy
 * lock (never against a shared database: it creates and drops its own `be_p16_series_<uuid>` database).
 *
 * Qualification: documents are TEST_ONLY-valued fixtures. SOURCE_VERIFIED here only drives the derivation path; a source is never contacted and nothing
 * below is an installed-authority, connected-source or financial proof. What it proves is the DDL, the SQL, the lease fencing, idempotence, the
 * bounded backfill with restart/resume, and that the series writer can refuse without failing the financial revision. */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { accessDigest } from "../src/execution-v2/access-policy";
import { fenceManagerProjection, ManagerProjectionLeases, type ManagerProjectionLease } from "../src/execution-v2/manager-lease";
import { ManagerProjectionConsumer, type ManagerConsumerBounds, type ManagerConsumerDelivery, type ManagerProjectionSource } from "../src/execution-v2/manager-consumer";
import { managerModelDocument, type ManagerFact, type ManagerMember, type ManagerModelDocument } from "../src/execution-v2/manager-model.contract";
import { deriveSeriesObservations } from "../src/execution-v2/manager-series-observation";
import { materializeManagerSeries, type ManagerSeriesConfig } from "../src/execution-v2/manager-series-materializer";
import { ManagerSeriesRuntime } from "../src/execution-v2/manager-series-runtime";
import { ManagerSeriesStore } from "../src/execution-v2/manager-series.store";
import { ExecutionManagerRuntime, type ManagerRuntimeInstallation } from "../src/execution-v2/manager-runtime";
import { ManagerModelRepository } from "../src/execution-v2/manager-model.store";
import { unqualifiedAccessTrust } from "../src/execution-v2/access-trust";
import { loadPublicationCommissioning } from "../src/execution-v2/publication-adapter";
import { createHash } from "node:crypto";
import type { DatasetPublication } from "../src/execution-v2/publication.contract";
import { EXECUTION_PUBLICATION_CATALOGUE } from "../src/execution-v2/publication-source.generated";

const DAY = 86_400_000, T0 = 1_800_000_000_000;
const contracts = process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts");
const scope = { workspace_id: "TEST_ONLY:series-workspace", environment: "paper" as const, profile_id: "TEST_ONLY:paper" };
const key = [scope.workspace_id, scope.environment, scope.profile_id] as const;
const CFG: ManagerSeriesConfig = { windows: ["30D"], maximum_total_points: 1_000, maximum_history_rows: 1_000 };
const bounds: ManagerConsumerBounds = { maximum_documents_per_tick: 2, maximum_document_bytes: 8 * 1024 * 1024, maximum_document_rows: 30_000, maximum_tick_ms: 10_000,
  source_timeout_ms: 2_000, transaction_timeout_ms: 2_000, lease_ttl_ms: 5_000 };
const tupleA = { alpha_id: "TEST_ONLY:alpha", alpha_version_id: "TEST_ONLY:av1", portfolio_id: "TEST_ONLY:portfolio", deployment_id: "TEST_ONLY:deployment", account_id: "TEST_ONLY:account" };
const member = (tuple: ManagerMember["tuple"]): ManagerMember => ({ tuple, stage: "PAPER", name: "TEST_ONLY:Alpha", owner_user_id: "TEST_ONLY:researcher", lifecycle: "ACTIVE",
  venue: "TEST_ONLY:venue", health: "HEALTHY", source_state: "FRESH", binding_ref: "TEST_ONLY:binding", assignment_revision: "TEST_ONLY:a1", owner_revision: "TEST_ONLY:o1",
  binding_revision: "TEST_ONLY:b1", valid_from_ms: 0, valid_to_ms: null });
const partition = { economic_domain: "PAPER" as const, currency: "USDT", basis: "TEST_ONLY:ledger", native_profile_ref: "TEST_ONLY:native", domain_proof_ref: "TEST_ONLY:domain" };
const fact = (kind: "current_nav" | "net_pnl", value: string, at: number): ManagerFact => ({ fact_id: `TEST_ONLY:${kind}:${at}`, revision: `TEST_ONLY:f${at}`,
  source_receipt_ref: "TEST_ONLY:receipt", tuple: tupleA, partition, economic_account_ref: "TEST_ONLY:economic", ownership_partition_ref: "TEST_ONLY:ownership", kind,
  metric: { value, unit: "MONEY", currency: "USDT", basis: "TEST_ONLY:ledger", window: null, denominator: null, methodology_ref: "TEST_ONLY:method.v1", availability: "AVAILABLE",
    reason_code: null, quality: { completeness: "COMPLETE", freshness: "FRESH", reasons: [] }, source_confidence: "VERIFIED", provenance_refs: ["TEST_ONLY:prov"],
    calculation_revision: "TEST_ONLY:c1", policy_revision: "TEST_ONLY:p1" }, effective_at_ms: at, recorded_at_ms: at, classification: "ECONOMIC",
  transfer_pair_ref: null, counterpart_portfolio_id: null });
/** Revision n at asOf: chained, SOURCE_VERIFIED by default (derivation path only). */
function doc(n: number, asOf: number, nav: string, qualification: "SOURCE_VERIFIED" | "TEST_ONLY" = "SOURCE_VERIFIED"): ManagerModelDocument {
  return managerModelDocument.parse({ schema_version: "portal.execution.manager-model-input.v1", ...scope, qualification, family_id: "alpha_fleet_overview",
    revision: `TEST_ONLY:r${n}`, supersedes_revision: n ? `TEST_ONLY:r${n - 1}` : null, source_epoch: "TEST_ONLY:epoch", source_sequence: `${n + 1}`,
    projection_generation: "TEST_ONLY:g1", catalogue_digest: EXECUTION_PUBLICATION_CATALOGUE.source_catalogue_digest, source_set_digest: accessDigest(["set", n]),
    as_of_ms: asOf, recorded_through_ms: asOf, facts_through_ms: asOf, observed_at_ms: asOf, source_quality: { completeness: "COMPLETE", freshness: "FRESH", reasons: [] },
    members: [member(tupleA)], facts: [fact("current_nav", nav, asOf), fact("net_pnl", `${n}.5`, asOf)] });
}
const AT = [T0 - 31 * DAY, T0 - 10 * DAY, T0 - DAY, T0 - 1000];
const NAV = ["100", "101.5", "99.25", "102"];
const docs = AT.map((at, n) => doc(n, at, NAV[n]));

describe.skipIf(!process.env.TEST_DATABASE_URL)("BE-P16 Manager series writer on real PostgreSQL (TEST_ONLY)", () => {
  const name = `be_p16_series_${randomUUID().replaceAll("-", "")}`, base = process.env.TEST_DATABASE_URL!;
  const connection = (db: string) => { const url = new URL(base); url.pathname = `/${db}`; return url.toString(); };
  let pool: Pool, leases: ManagerProjectionLeases, store: ManagerSeriesStore;
  const consumers: ManagerProjectionConsumer[] = [];
  const runtimes: ExecutionManagerRuntime[] = [];
  const abort = new AbortController();
  const count = async (table: string) => Number((await pool.query(`SELECT count(*)::text AS n FROM ${table}`)).rows[0].n);
  /** The retained revision as the Manager consumer would have persisted it (the writer reads only this). */
  const seed = async (d: ManagerModelDocument, digest = accessDigest(d)) => pool.query(`INSERT INTO execution_manager_model_revisions
    (workspace_id,environment,profile_id,revision,source_epoch,source_sequence,projection_generation,payload_digest,payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
  [...key, d.revision, d.source_epoch, d.source_sequence, d.projection_generation, digest, JSON.stringify(d)]);
  const lease = async (ttl = 30_000): Promise<ManagerProjectionLease> => (await leases.acquire(scope, randomUUID(), ttl))!;
  const input = (l: ManagerProjectionLease, maximum_revisions: number) => ({ lease: l, signal: abort.signal, deadline_ms: performance.now() + 20_000,
    transaction_timeout_ms: 5_000, lease_ttl_ms: 30_000, maximum_revisions });
  const inTransaction = async <T>(l: ManagerProjectionLease, work: (c: import("pg").PoolClient) => Promise<T>) => {
    const client = await pool.connect();
    try { await client.query("BEGIN"); await fenceManagerProjection(client, l, scope); const r = await work(client); await client.query("COMMIT"); return r; }
    catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; } finally { client.release(); }
  };

  beforeAll(async () => {
    const admin = new Pool({ connectionString: connection("postgres"), max: 1 });
    try { await admin.query(`CREATE DATABASE ${name}`); } finally { await admin.end(); }
    pool = new Pool({ connectionString: connection(name), max: 4, connectionTimeoutMillis: 2_000, query_timeout: 8_000 });
    for (const filename of ["1723680000135_execution-manager-models.sql", "1723680000137_execution-manager-consumer-fence.sql", "1723680000147_execution-manager-series-observations.sql"])
      await pool.query(readFileSync(resolve(__dirname, "../migrations", filename), "utf8").split("-- Down Migration")[0]);
    leases = new ManagerProjectionLeases(pool); store = new ManagerSeriesStore(pool);
  }, 60_000);
  beforeEach(async () => {
    for (const c of consumers.splice(0)) await c.stop();
    for (const r of runtimes.splice(0)) await r.beforeApplicationShutdown();
    await pool.query(`DROP TRIGGER IF EXISTS series_boom ON execution_manager_series_revisions`);
    await pool.query(`TRUNCATE execution_manager_series_observations,execution_manager_series_revisions,execution_manager_series_checkpoints,
      execution_manager_model_heads,execution_manager_model_revisions,execution_manager_consumer_fences`);
  });
  afterAll(async () => {
    for (const c of consumers.splice(0)) await c.stop();
    for (const r of runtimes.splice(0)) await r.beforeApplicationShutdown();
    await pool?.end();
    const admin = new Pool({ connectionString: connection("postgres"), max: 1 });
    try {
      if (!/^be_p16_series_[a-f0-9]{32}$/.test(name)) throw new Error("TEST_DATABASE_NAME_INVALID");
      await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    } finally { await admin.end(); }
  }, 60_000);

  describe("DDL", () => {
    it("is append-only, rejects a value with a reason, a point without a value, and a bad digest or fraction", async () => {
      await seed(docs[0]);
      const derived = deriveSeriesObservations(docs[0]), l = await lease();
      expect(await inTransaction(l, c => store.recordRevision(c, scope, derived))).toBe("RECORDED");
      await expect(pool.query(`UPDATE execution_manager_series_observations SET value='1'`)).rejects.toThrow(/append-only/);
      await expect(pool.query(`DELETE FROM execution_manager_series_revisions`)).rejects.toThrow(/append-only/);
      const row = (await pool.query(`SELECT * FROM execution_manager_series_observations LIMIT 1`)).rows[0];
      const insert = (patch: Record<string, unknown>) => {
        const r = { ...row, revision: docs[0].revision, subject_id: `x-${randomUUID()}`, ...patch }, cols = Object.keys(r);
        return pool.query(`INSERT INTO execution_manager_series_observations(${cols.join(",")}) VALUES(${cols.map((_, i) => `$${i + 1}`).join(",")})`,
          cols.map(c => (c === "economic_partition" ? JSON.stringify(r[c]) : r[c])));
      };
      await expect(insert({ reason_code: "SOME_REASON" })).rejects.toThrow(/value_xor_reason/);
      await expect(insert({ value: null, reason_code: "SOME_REASON" })).rejects.toThrow(/value_has_point/);
      await expect(insert({ value: "1e3" })).rejects.toThrow();
      await expect(insert({ partition_key: "not-a-digest" })).rejects.toThrow();
      await expect(insert({ revision: "TEST_ONLY:no-such-revision" })).rejects.toThrow(/foreign key/i);
    });
  });

  describe("live record (inside the caller's lease-fenced transaction)", () => {
    it("records once, repeats as a no-op, refuses (never overwrites) a different digest, and never moves the head backwards", async () => {
      for (const d of docs) await seed(d);
      const l = await lease(), d3 = deriveSeriesObservations(docs[3]), d1 = deriveSeriesObservations(docs[1]);
      expect(await inTransaction(l, c => store.recordRevision(c, scope, d3))).toBe("RECORDED");
      expect(await inTransaction(l, c => store.recordRevision(c, scope, d3))).toBe("DUPLICATE");
      expect(await inTransaction(l, c => store.recordRevision(c, scope, { ...d3, observation_digest: accessDigest("different") }))).toBe("DIGEST_MISMATCH");
      expect(await count("execution_manager_series_revisions")).toBe(1);
      expect(await count("execution_manager_series_observations")).toBe(d3.observations.length);
      // an older revision recorded later (backfill) must not regress the checkpoint head
      expect(await inTransaction(l, c => store.recordRevision(c, scope, d1))).toBe("RECORDED");
      expect(await store.checkpoint(scope)).toMatchObject({ head_revision: docs[3].revision, head_as_of_ms: docs[3].as_of_ms });
    });
    it("a stale lease cannot write: the fence refuses before any row and the transaction leaves nothing", async () => {
      await seed(docs[0]);
      const old = await lease(1_000);
      await pool.query(`UPDATE execution_manager_consumer_fences SET expires_at=clock_timestamp()-interval '1 second'`);
      const next = await lease();
      expect(next.fencing_token).not.toBe(old.fencing_token);
      await expect(inTransaction(old, c => store.recordRevision(c, scope, deriveSeriesObservations(docs[0])))).rejects.toThrow("MANAGER_LEASE_LOST");
      expect(await count("execution_manager_series_revisions")).toBe(0);
      await expect(store.backfill(input(old, 4))).rejects.toThrow(/MANAGER_LEASE_LOST/);
      expect(await count("execution_manager_series_revisions")).toBe(0);
    });
  });

  describe("history and parity with the pure materializer", () => {
    it("history is bounded, excludes the revision being published, and includes the last revision before the floor", async () => {
      for (const d of docs) await seed(d);
      const l = await lease();
      for (const d of docs) await inTransaction(l, c => store.recordRevision(c, scope, deriveSeriesObservations(d)));
      const h = await store.history(scope, { floor_ms: T0 - 30 * DAY, to_ms: T0, exclude_revision: docs[3].revision, maximum_rows: 100 });
      expect(h.revisions.map(r => r.revision)).toEqual([docs[0].revision, docs[1].revision, docs[2].revision]);
      // CR-03: the anchor revision's OBSERVATIONS come back too (a marker alone does not prove the key was observed at the window start)
      expect(new Set(h.observations.map(o => o.revision))).toEqual(new Set([docs[0].revision, docs[1].revision, docs[2].revision]));
      const capped = await store.history(scope, { floor_ms: T0 - 30 * DAY, to_ms: T0, exclude_revision: docs[3].revision, maximum_rows: 2 });
      expect(capped.observations).toHaveLength(3);   // maximum + 1: the overflow is visible to the materializer, never silently cut
    });
    it("the series built from stored history equals the one built from in-memory history, byte for byte", async () => {
      for (const d of docs) await seed(d);
      const l = await lease();
      for (const d of docs.slice(0, 3)) await inTransaction(l, c => store.recordRevision(c, scope, deriveSeriesObservations(d)));
      const runtime = new ManagerSeriesRuntime(pool, { ...CFG, maximum_backfill_revisions: 4 });
      const fromDb = await runtime.materialize(docs[3], abort.signal);
      const fromMemory = materializeManagerSeries(docs[3], { revisions: docs.slice(0, 3).map(d => deriveSeriesObservations(d).marker),
        observations: docs.slice(0, 3).flatMap(d => deriveSeriesObservations(d).observations) }, CFG);
      expect(fromDb.publications).toEqual(fromMemory.publications);
      expect(fromDb.publications.length).toBeGreaterThan(0);
      expect(managerModelDocument.safeParse({ ...docs[3], precomputed_series: fromDb.publications }).success).toBe(true);
    });
  });

  describe("bounded backfill: restart and resume", () => {
    it("replays at most N revisions per call, resumes from the cursor on a new holder after a restart, and ends COMPLETE", async () => {
      for (const d of docs) await seed(d);
      const first = await lease();
      expect(await store.backfill(input(first, 2))).toEqual({ state: "PROGRESS", processed: 2, failed: 0 });
      expect(await count("execution_manager_series_revisions")).toBe(2);
      expect(await store.checkpoint(scope)).toMatchObject({ backfill_state: "IN_PROGRESS", backfill_processed: 2 });
      // restart: the old holder is gone, a new store and a new holder take over
      await pool.query(`UPDATE execution_manager_consumer_fences SET expires_at=clock_timestamp()-interval '1 second'`);
      const restarted = new ManagerSeriesStore(pool), second = await lease();
      expect(await restarted.backfill(input(second, 2))).toEqual({ state: "PROGRESS", processed: 2, failed: 0 });
      expect(await count("execution_manager_series_revisions")).toBe(4);
      expect(await restarted.backfill(input(second, 2))).toEqual({ state: "COMPLETE", processed: 0, failed: 0 });
      expect(await store.checkpoint(scope)).toMatchObject({ backfill_state: "COMPLETE", backfill_processed: 4 });
      // COMPLETE is terminal and cheap; a revision recorded live afterwards is not touched again
      expect(await restarted.backfill(input(second, 2))).toEqual({ state: "NO_WORK", processed: 0, failed: 0 });
      expect(await count("execution_manager_series_observations")).toBe(docs.reduce((n, d) => n + deriveSeriesObservations(d).observations.length, 0));
    });
    it("a revision recorded live is not replayed, and replay is idempotent", async () => {
      for (const d of docs) await seed(d);
      const l = await lease();
      await inTransaction(l, c => store.recordRevision(c, scope, deriveSeriesObservations(docs[1])));
      expect(await store.backfill(input(l, 10))).toEqual({ state: "COMPLETE", processed: 3, failed: 0 });
      expect(await count("execution_manager_series_revisions")).toBe(4);
    });
    it("an unreadable revision (payload no longer matches its digest) is skipped with its code and never blocks the others", async () => {
      await seed(docs[0]); await seed(docs[1], accessDigest("tampered")); await seed(docs[2]);
      const l = await lease();
      expect(await store.backfill(input(l, 10))).toEqual({ state: "COMPLETE", processed: 2, failed: 1 });
      expect(await count("execution_manager_series_revisions")).toBe(2);
      expect(await store.checkpoint(scope)).toMatchObject({ last_error_code: "SERIES_PAYLOAD_DIGEST_MISMATCH", last_error_revision: docs[1].revision, backfill_state: "COMPLETE" });
    });
    it("the deadline and cancellation stop it between revisions", async () => {
      for (const d of docs) await seed(d);
      const l = await lease();
      expect(await store.backfill({ ...input(l, 10), deadline_ms: performance.now() - 1 })).toEqual({ state: "TIME_LIMIT", processed: 0, failed: 0 });
      const stop = new AbortController(); stop.abort(new Error("MANAGER_RUNTIME_STOPPED"));
      await expect(store.backfill({ ...input(l, 10), signal: stop.signal })).rejects.toThrow("MANAGER_RUNTIME_STOPPED");
      expect(await count("execution_manager_series_revisions")).toBe(0);
    });
  });

  describe("CR-02 recovery and dispositions at the store", () => {
    const snapshot = async () => ({ revisions: (await pool.query(`SELECT revision,observation_digest FROM execution_manager_series_revisions ORDER BY 1`)).rows,
      observations: (await pool.query(`SELECT revision,subject_id,metric,partition_key,value,reason_code,input_digest FROM execution_manager_series_observations ORDER BY 1,2,3,4`)).rows });
    it("a live DIGEST_MISMATCH changes nothing stored, is recorded as SERIES_DIGEST_MISMATCH, and does not reopen a COMPLETE backfill", async () => {
      for (const d of docs) await seed(d);
      const l = await lease();
      expect(await store.backfill(input(l, 10))).toEqual({ state: "COMPLETE", processed: 4, failed: 0 });
      const before = await snapshot(), d3 = deriveSeriesObservations(docs[3]);
      expect(await inTransaction(l, c => store.recordLive(c, scope, { ...d3, observation_digest: accessDigest("different") }))).toBe("DIGEST_MISMATCH");
      expect(await snapshot()).toEqual(before);
      expect(await store.checkpoint(scope)).toMatchObject({ backfill_state: "COMPLETE", last_error_code: "SERIES_DIGEST_MISMATCH", last_error_revision: docs[3].revision });
      expect(await store.backfill(input(l, 10))).toEqual({ state: "NO_WORK", processed: 0, failed: 0 });
      // a compatible replay is a plain DUPLICATE and does not erase the standing disposition
      expect(await inTransaction(l, c => store.recordLive(c, scope, d3))).toBe("DUPLICATE");
      expect(await store.checkpoint(scope)).toMatchObject({ last_error_code: "SERIES_DIGEST_MISMATCH" });
    });
    it("a DIGEST_MISMATCH met by the backfill replay is an explicit disposition and the cursor passes it (no silent advance, no overwrite)", async () => {
      for (const d of docs.slice(0, 2)) await seed(d);
      const l = await lease();
      await inTransaction(l, c => store.recordRevision(c, scope, deriveSeriesObservations(docs[1])));
      const before = await snapshot(), stamp = (await pool.query(`SELECT created_at::text FROM execution_manager_model_revisions WHERE revision=$1`, [docs[1].revision])).rows[0].created_at;
      const replay = (store as unknown as { replay: (i: unknown, s: unknown, d: unknown, r: unknown) => Promise<string> }).replay.bind(store);
      expect(await replay(input(l, 1), scope, { ...deriveSeriesObservations(docs[1]), observation_digest: accessDigest("different") }, { created_at: stamp, revision: docs[1].revision }))
        .toBe("DIGEST_MISMATCH");
      expect(await snapshot()).toEqual(before);
      expect(await store.checkpoint(scope)).toMatchObject({ last_error_code: "SERIES_DIGEST_MISMATCH", last_error_revision: docs[1].revision, backfill_state: "IN_PROGRESS" });
      expect((await pool.query(`SELECT backfill_cursor_revision FROM execution_manager_series_checkpoints`)).rows[0].backfill_cursor_revision).toBe(docs[1].revision);
    });
    it("a refusal that persists is retried once per tick, at most SERIES_REPAIR_ATTEMPTS times, then becomes a stated gap and never blocks or loops", async () => {
      for (const d of docs.slice(0, 2)) await seed(d);
      await pool.query(`CREATE OR REPLACE FUNCTION series_boom() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'SERIES_BOOM'; END $$`);
      await pool.query(`CREATE TRIGGER series_boom BEFORE INSERT ON execution_manager_series_revisions FOR EACH ROW EXECUTE FUNCTION series_boom()`);
      const l = await lease();
      expect(await store.backfill(input(l, 4))).toEqual({ state: "PROGRESS", processed: 0, failed: 0 });
      expect(await store.checkpoint(scope)).toMatchObject({ last_error_code: "SERIES_REPAIR_RETRY_1", last_error_revision: docs[0].revision });
      expect(await store.backfill(input(l, 4))).toEqual({ state: "PROGRESS", processed: 0, failed: 0 });
      expect(await store.checkpoint(scope)).toMatchObject({ last_error_code: "SERIES_REPAIR_RETRY_2", last_error_revision: docs[0].revision });
      expect(await store.backfill(input(l, 4))).toEqual({ state: "PROGRESS", processed: 0, failed: 1 });   // r0 is a stated gap; r1 starts its own attempts
      expect(await store.checkpoint(scope)).toMatchObject({ last_error_code: "SERIES_REPAIR_RETRY_1", last_error_revision: docs[1].revision });
      await pool.query(`DROP TRIGGER series_boom ON execution_manager_series_revisions`);
      expect(await store.backfill(input(l, 4))).toEqual({ state: "COMPLETE", processed: 1, failed: 0 });
      expect((await pool.query(`SELECT revision FROM execution_manager_series_revisions`)).rows.map(r => r.revision)).toEqual([docs[1].revision]);
      expect(await store.backfill(input(l, 4))).toEqual({ state: "NO_WORK", processed: 0, failed: 0 });
    });
    it("a repair is lease fenced: a holder that lost its lease cannot repair, and a reopened backfill resumes on the new holder", async () => {
      for (const d of docs.slice(0, 2)) await seed(d);
      const old = await lease();
      expect(await store.backfill(input(old, 10))).toEqual({ state: "COMPLETE", processed: 2, failed: 0 });
      await seed(docs[2]);                                                          // a later retained revision whose live series write never happened
      await inTransaction(old, c => store.recordFailure(c, scope, docs[2].revision, "SERIES_RECORD_REFUSED"));
      expect(await store.checkpoint(scope)).toMatchObject({ backfill_state: "IN_PROGRESS" });
      await pool.query(`UPDATE execution_manager_consumer_fences SET expires_at=clock_timestamp()-interval '1 second'`);
      const next = await lease();
      await expect(store.backfill(input(old, 10))).rejects.toThrow(/MANAGER_LEASE_LOST/);
      expect(await count("execution_manager_series_revisions")).toBe(2);
      expect(await new ManagerSeriesStore(pool).backfill(input(next, 10))).toEqual({ state: "COMPLETE", processed: 1, failed: 0 });
      expect(await count("execution_manager_series_revisions")).toBe(3);
    });
  });

  describe("end to end through the real ExecutionManagerRuntime (SOURCE_VERIFIED under SYNTHETIC commissioning)", () => {
    const hash = (t: string) => "sha256:" + createHash("sha256").update(t).digest("hex");
    /** Retained history (r0..r2, 31d / 10d / 1d ago) as the consumer would have left it, plus the live revision r3 the source delivers now. */
    function world() {
      const now = Date.now(), at = [now - 31 * DAY, now - 10 * DAY, now - DAY, now - 5_000];
      const retained = at.slice(0, 3).map((t, n) => doc(n, t, NAV[n]));
      const live = managerModelDocument.parse({ ...doc(3, at[3], "102"), source_set_digest: accessDigest([tupleA]), observed_at_ms: now - 4_000 });
      const artifact = { schema_version: "portal.execution.publication-commissioning.v1", scope, catalogue_digest: live.catalogue_digest, adapter_id: "SYNTHETIC_NOT_SOURCE_AUTHORITY",
        family_ids: [live.family_id], purposes: ["BUSINESS"], receipt_pins: { source_read: "SYNTHETIC:read", transport_trust: "SYNTHETIC:transport", privacy: "SYNTHETIC:privacy", field_policy: "SYNTHETIC:fields" } };
      const bytes = JSON.stringify(artifact), commissioning = loadPublicationCommissioning(bytes, { artifact_sha256: hash(bytes), adapter_id: artifact.adapter_id,
        approval_ref: "SYNTHETIC_NOT_OWNER_APPROVAL", approved_at_ms: at[3] - 1000, valid_until_ms: Date.now() + 120_000 }, Date.now());
      const publication = JSON.parse(readFileSync(resolve(contracts, "fixtures/execution-dataset-publication.synthetic.valid.json"), "utf8")).value as DatasetPublication;
      Object.assign(publication, { environment: scope.environment, profile_id: scope.profile_id, family_id: live.family_id, catalogue_digest: live.catalogue_digest,
        history_capability: "CURRENT_ONLY", barrier: null, issued_at_ms: at[3] - 1000, expires_at_ms: Date.now() + 120_000, source_as_of_ms: live.as_of_ms, observed_at_ms: live.observed_at_ms });
      for (const k of ["source_read", "transport_trust", "privacy", "field_policy"] as const) publication[k] = { qualification: "SOURCE_VERIFIED", receipt_ref: artifact.receipt_pins[k] };
      publication.authority = { ...publication.authority, ...scope, qualification: "SOURCE_VERIFIED", tuples: [tupleA], resources: [],
        binding: { dataset_id: live.family_id, source_revision: live.revision, projection_generation: live.projection_generation, catalogue_revision: live.catalogue_digest, window: null } };
      return { retained, live, publication, commissioning };
    }
    async function install(w: ReturnType<typeof world>, pending: { value: boolean }) {
      for (const d of w.retained) await seed(d);
      const last = w.retained[2];
      await pool.query(`INSERT INTO execution_manager_model_heads(workspace_id,environment,profile_id,revision,source_epoch,source_sequence,projection_generation,payload_digest,catalogue_digest)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [...key, last.revision, last.source_epoch, last.source_sequence, last.projection_generation, accessDigest(last), last.catalogue_digest]);
      const acknowledge = vi.fn(async () => undefined);
      const source: ManagerProjectionSource = { read: vi.fn(async () => { if (!pending.value) return null; pending.value = false;
        return structuredClone({ document: w.live, publication: w.publication }) as ManagerConsumerDelivery; }), recheck: vi.fn(async () => ({})), acknowledge };
      const series = new ManagerSeriesRuntime(pool, { ...CFG, maximum_backfill_revisions: 4 });
      const installation: ManagerRuntimeInstallation = { trust: unqualifiedAccessTrust, cadence_ms: 1000, maximum_publication_reads: 1,
        partitions: [{ scope, commissioning: w.commissioning, source, publication: async () => w.publication,
          bounds: { ...bounds, maximum_documents_per_tick: 1, maximum_document_bytes: 1_048_576, maximum_document_rows: 200 }, series: { runtime: series } }] };
      const runtime = new ExecutionManagerRuntime(pool, installation); runtimes.push(runtime);
      return { runtime, installation, source, acknowledge };
    }
    const head = async () => new ManagerModelRepository(pool).document(...key, "TEST_ONLY:r3");

    it("idle ticks backfill the retained history, the next revision is published WITH its series, and the writer is idempotent across a lost ACK and a restart", async () => {
      const w = world(), pending = { value: false }, h = await install(w, pending);
      await h.runtime.tick();                                                       // nothing new: IDLE -> bounded backfill of r0..r2
      expect(h.runtime.status().state).toBe("TICK_OK");
      expect(await count("execution_manager_series_revisions")).toBe(3);
      expect(await store.checkpoint(scope)).toMatchObject({ backfill_state: "COMPLETE", backfill_processed: 3 });
      pending.value = true; h.acknowledge.mockRejectedValueOnce(new Error("SYNTHETIC_ACK_LOST"));
      await h.runtime.tick();                                                       // commits r3 with series, then the ACK is lost
      expect(h.runtime.status().state).toBe("TICK_REFUSED");
      const stored = await head();
      expect(stored?.precomputed_series).toHaveLength(4);                           // fund + portfolio, NAV + NET_PNL
      const fundNav = stored!.precomputed_series!.find(p => p.binding.subject_type === "manager_book" && p.binding.metric === "NAV")!;
      expect(fundNav.series.points.map(p => p.value)).toEqual(["101.5", "99.25", "102"]);
      expect(fundNav.quality).toEqual({ completeness: "COMPLETE", freshness: "FRESH", reasons: [] });
      expect(stored!.precomputed_series!.some(p => (p.binding.metric as string) === "RETURN")).toBe(false);
      expect(await count("execution_manager_series_revisions")).toBe(4);
      const bytes = (await pool.query(`SELECT payload::text AS p FROM execution_manager_model_revisions WHERE revision='TEST_ONLY:r3'`)).rows[0].p;
      const observations = await count("execution_manager_series_observations");
      // restart: a new runtime sees the identical head again, reuses the stored bytes (series included) and records nothing new
      await h.runtime.beforeApplicationShutdown(); pending.value = true;
      const restarted = new ExecutionManagerRuntime(pool, h.installation); runtimes.push(restarted);
      await restarted.tick();
      expect(restarted.status().state).toBe("TICK_OK");
      expect((await pool.query(`SELECT payload::text AS p FROM execution_manager_model_revisions WHERE revision='TEST_ONLY:r3'`)).rows[0].p).toBe(bytes);
      expect(await count("execution_manager_model_revisions")).toBe(4);
      expect(await count("execution_manager_series_revisions")).toBe(4);
      expect(await count("execution_manager_series_observations")).toBe(observations);
      expect(h.acknowledge).toHaveBeenCalledTimes(2);
    });
    it("CR-02: backfill COMPLETE -> one live series write refused while the financial revision commits -> fault removed -> bounded idle repair -> restart -> exactly one immutable observation set", async () => {
      const w = world(), pending = { value: false }, h = await install(w, pending);
      await h.runtime.tick();                                                       // initial backfill of r0..r2
      expect(await store.checkpoint(scope)).toMatchObject({ backfill_state: "COMPLETE", backfill_processed: 3 });
      await pool.query(`CREATE OR REPLACE FUNCTION series_boom() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'SERIES_BOOM'; END $$`);
      await pool.query(`CREATE TRIGGER series_boom BEFORE INSERT ON execution_manager_series_revisions FOR EACH ROW WHEN (NEW.revision='TEST_ONLY:r3') EXECUTE FUNCTION series_boom()`);
      pending.value = true;
      await h.runtime.tick();                                                       // r3: the series write is refused, the financial revision is NOT
      expect(h.runtime.status().state).toBe("TICK_OK");
      expect(h.acknowledge).toHaveBeenCalledTimes(1);
      expect(await count("execution_manager_model_revisions")).toBe(4);
      expect(await count("execution_manager_series_revisions")).toBe(3);
      expect(await store.checkpoint(scope)).toMatchObject({ backfill_state: "IN_PROGRESS", last_error_code: "SERIES_BOOM", last_error_revision: "TEST_ONLY:r3" });
      // the fault is still there: one idle tick makes one bounded attempt, remembers it, and neither skips nor re-scans the history
      await h.runtime.tick();
      expect(await count("execution_manager_series_revisions")).toBe(3);
      expect(await store.checkpoint(scope)).toMatchObject({ backfill_state: "IN_PROGRESS", last_error_code: "SERIES_REPAIR_RETRY_1", last_error_revision: "TEST_ONLY:r3" });
      await pool.query(`DROP TRIGGER series_boom ON execution_manager_series_revisions`);
      await h.runtime.tick();                                                       // idle repair: only r3 is revisited
      expect(h.runtime.status().state).toBe("TICK_OK");
      expect(await count("execution_manager_series_revisions")).toBe(4);
      const expected = deriveSeriesObservations(w.live);
      expect(Number((await pool.query(`SELECT count(*)::text AS n FROM execution_manager_series_observations WHERE revision='TEST_ONLY:r3'`)).rows[0].n)).toBe(expected.observations.length);
      expect((await pool.query(`SELECT observation_digest FROM execution_manager_series_revisions WHERE revision='TEST_ONLY:r3'`)).rows[0].observation_digest).toBe(expected.observation_digest);
      const closed = await pool.query(`SELECT backfill_state,backfill_cursor_revision,last_error_code,last_error_revision,backfill_processed::text FROM execution_manager_series_checkpoints`);
      expect(closed.rows[0]).toEqual({ backfill_state: "COMPLETE", backfill_cursor_revision: "TEST_ONLY:r3", last_error_code: null, last_error_revision: null, backfill_processed: "4" });
      const snapshot = async () => (await pool.query(`SELECT revision,subject_id,metric,partition_key,value,reason_code,input_digest FROM execution_manager_series_observations ORDER BY 1,2,3,4`)).rows;
      const before = await snapshot();
      await h.runtime.beforeApplicationShutdown();                                  // restart the holder: nothing new, nothing rewritten
      const restarted = new ExecutionManagerRuntime(pool, h.installation); runtimes.push(restarted);
      await restarted.tick(); await restarted.tick();
      expect(restarted.status().state).toBe("TICK_OK");
      expect(await snapshot()).toEqual(before);
      expect(await count("execution_manager_series_revisions")).toBe(4);
      expect(await store.checkpoint(scope)).toMatchObject({ backfill_state: "COMPLETE", backfill_processed: 4 });
      await expect(pool.query(`UPDATE execution_manager_series_observations SET value='1' WHERE revision='TEST_ONLY:r3'`)).rejects.toThrow(/append-only/);
    });
    it("without the opt-in slot nothing changes: no series, no series rows", async () => {
      const w = world(), pending = { value: true }, h = await install(w, pending);
      const plain: ManagerRuntimeInstallation = { ...h.installation, partitions: [{ ...h.installation.partitions[0], series: undefined }] };
      const runtime = new ExecutionManagerRuntime(pool, plain); runtimes.push(runtime);
      await runtime.tick();
      expect(runtime.status().state).toBe("TICK_OK");
      expect((await head())?.precomputed_series).toBeUndefined();
      expect(await count("execution_manager_series_revisions")).toBe(0);
    });
  });

  describe("wired into the Manager consumer (TEST_ONLY revisions: markers only, never points)", () => {
    function delivery(n: number, previous: ManagerModelDocument | null): ManagerConsumerDelivery {
      const d = doc(n, Date.now() - 1000 + n, `${100 + n}`, "TEST_ONLY");
      const fixture = JSON.parse(readFileSync(resolve(contracts, "fixtures/execution-dataset-publication.synthetic.valid.json"), "utf8")).value as DatasetPublication;
      const now = Date.now();
      const document = { ...d, supersedes_revision: previous?.revision ?? null, observed_at_ms: now, recorded_through_ms: d.as_of_ms, facts_through_ms: d.as_of_ms };
      const publication: DatasetPublication = { ...fixture, family_id: d.family_id, catalogue_digest: d.catalogue_digest, environment: d.environment, profile_id: d.profile_id,
        issued_at_ms: now - 2000, expires_at_ms: now + 60_000, source_as_of_ms: d.as_of_ms, observed_at_ms: now, history_capability: "CURRENT_ONLY", barrier: null,
        authority: { ...fixture.authority, ...scope, publication_revision: `TEST_ONLY:publication-${n}`, binding: { dataset_id: d.family_id, source_revision: d.revision,
          projection_generation: d.projection_generation, catalogue_revision: d.catalogue_digest, window: null }, tuples: [tupleA], resources: [] } };
      return { document: { ...document, source_set_digest: accessDigest([tupleA]) }, publication };
    }
    const runtime = () => new ManagerSeriesRuntime(pool, { ...CFG, maximum_backfill_revisions: 2 });
    /** What `ExecutionManagerRuntime.materializingSource` does for a `series` partition, without the Score/Composition/Regime slots. */
    function sourceFor(values: ManagerConsumerDelivery[], series: ManagerSeriesRuntime): ManagerProjectionSource {
      return { read: vi.fn(async () => {
        const next = values.shift(); if (!next) return null;
        const parsed = managerModelDocument.parse(next.document), materialized = await series.materialize(parsed, abort.signal);
        const result = { ...next, document: { ...parsed, ...(materialized.publications.length ? { precomputed_series: materialized.publications } : {}) } };
        series.attach(result, materialized); return result;
      }), recheck: vi.fn(async () => ({})), acknowledge: vi.fn(async () => undefined) };
    }
    const consumerFor = (source: ManagerProjectionSource, series: ManagerSeriesRuntime) => {
      const c = new ManagerProjectionConsumer({ pool, source, scope, bounds, allowTestOnly: true, recalculation: series.lifecycle() }); consumers.push(c); return c;
    };

    it("a committed revision and its series marker commit together; a lost ACK replays the same bytes and records nothing new", async () => {
      const series = runtime(), first = delivery(0, null);
      const acknowledge = vi.fn().mockRejectedValueOnce(new Error("ACK_LOST")).mockResolvedValue(undefined);
      const source = sourceFor([first], series); source.acknowledge = acknowledge;
      await expect(consumerFor(source, series).tick()).rejects.toThrow("ACK_LOST");
      expect(await count("execution_manager_model_revisions")).toBe(1);
      expect(await count("execution_manager_series_revisions")).toBe(1);
      expect((await pool.query(`SELECT qualification,observation_count FROM execution_manager_series_revisions`)).rows[0]).toEqual({ qualification: "TEST_ONLY", observation_count: 0 });
      // the restarted consumer sees the identical document as the head again: DUPLICATE_CURRENT, the marker is not written twice
      const again = sourceFor([first], series);
      expect(await consumerFor(again, series).tick()).toMatchObject({ committed: 1 });
      expect(await count("execution_manager_model_revisions")).toBe(1);
      expect(await count("execution_manager_series_revisions")).toBe(1);
    });
    it("the series writer can refuse and the financial revision still commits and is acknowledged", async () => {
      await pool.query(`CREATE FUNCTION series_boom() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'SERIES_BOOM'; END $$`).catch(() => undefined);
      await pool.query(`CREATE TRIGGER series_boom BEFORE INSERT ON execution_manager_series_revisions FOR EACH ROW EXECUTE FUNCTION series_boom()`);
      const series = runtime(), source = sourceFor([delivery(0, null)], series);
      expect(await consumerFor(source, series).tick()).toMatchObject({ state: "COMMITTED", committed: 1, acknowledged: 1 });
      expect(await count("execution_manager_model_revisions")).toBe(1);
      expect(await count("execution_manager_series_revisions")).toBe(0);
      // the live refusal (SERIES_BOOM) is followed, in the idle iteration of the same tick, by the first (also refused) bounded repair attempt (CR-02)
      expect(await store.checkpoint(scope)).toMatchObject({ last_error_code: "SERIES_REPAIR_RETRY_1", last_error_revision: "TEST_ONLY:r0", backfill_state: "NOT_STARTED" });
      await pool.query(`DROP TRIGGER series_boom ON execution_manager_series_revisions`);
    });
    it("when the source has nothing new the idle tick backfills retained revisions a bounded number at a time", async () => {
      for (const d of docs) await seed(d);
      const series = runtime(), consumer = consumerFor(sourceFor([], series), series);
      expect(await consumer.tick()).toMatchObject({ state: "IDLE" });
      expect(await count("execution_manager_series_revisions")).toBe(2);     // maximum_backfill_revisions: 2
      await consumer.tick();
      expect(await count("execution_manager_series_revisions")).toBe(4);
      await consumer.tick();
      expect(await store.checkpoint(scope)).toMatchObject({ backfill_state: "COMPLETE" });
    });
  });
});
