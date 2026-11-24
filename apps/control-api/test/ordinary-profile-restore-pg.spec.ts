/** TEST_ONLY, real separate PG clusters + root-run pg_dump/pg_restore phases.
 * The fixture has ACTUAL ordinary writer facts/coordinator but scripted empty
 * C2 tables. Matching proves bounded inventory only, never C2 barriers/cutover. */
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { withTransaction } from "../src/db/pool";
import { accessDigest } from "../src/execution-v2/access-digest";
import { readRootOwnedPinnedFile } from "../src/execution-v2/private-root-file";
import { RestoreCheckpointAuthority, restoreCheckpointEventHash, type RestoreCheckpointPin }
  from "../src/execution-v2/restore-checkpoint-authority";
import { RestoreCheckpointAuthorityReader } from "../src/execution-v2/restore-checkpoint-authority-reader";
import { captureLockedOrdinaryInventory, assertOrdinaryRestoreSourceBinding, OrdinaryProfileRestoreVerifier, ORDINARY_RESTORE_TABLES,
  type OrdinaryRestoreVerifierPin } from "../src/execution-v2/ordinary-profile-restore";
import { actor, CHILD, CHECKPOINT, DOMAIN, FIRST_DRAIN, FIRST_OPERATION, OLD_OPERATION, ordinary, OWNER,
  rawSha, script, SECOND_DRAIN, SECOND_OPERATION, SECRET_SENTINEL, seed, STAN, state, WORKSPACE }
  from "./ordinary-profile-restore-fixture";

vi.mock("../src/execution-v2/private-root-file", async original => ({
  ...await original<typeof import("../src/execution-v2/private-root-file")>(), readRootOwnedPinnedFile: vi.fn(),
}));
const sourceUrl = process.env.TEST_DATABASE_URL, authorityUrl = process.env.TEST_AUTHORITY_DATABASE_URL;
const copyUrl = process.env.TEST_ORDINARY_RESTORED_DATABASE_URL, phase = process.env.PORTAL_TEST_ORDINARY_RESTORE_PHASE;
const enabled = process.env.PORTAL_TEST_RESTORE_CHECKPOINT === "TEST_ONLY_DISPOSABLE_TWO_CLUSTERS" && !!sourceUrl && !!authorityUrl && !!copyUrl;
describe.skipIf(!enabled)("ordinary populated restore qualification, UNMOUNTED two-cluster candidate", () => {
  let source: Pool, authority: Pool, copy: Pool, pin: RestoreCheckpointPin;
  const options = { max: 3, connectionTimeoutMillis: 2000, query_timeout: 6000 };
  async function physical(pool: Pool) {
    const row = (await pool.query(`SELECT current_database() AS database_name,session_user AS role_name,
      (pg_control_system()).system_identifier::text AS database_system_identifier`)).rows[0];
    return row as OrdinaryRestoreVerifierPin["restored"];
  }
  const revision = async () => (await source.query("SELECT revision::text AS revision FROM elp210_candidate.authority WHERE singleton")).rows[0].revision as string;
  const store = () => new RestoreCheckpointAuthority(source, authority, pin, 16);
  async function verifier(restored = copy) {
    return new OrdinaryProfileRestoreVerifier(restored, authority,
      { checkpoint: pin, restored: await physical(restored), authority: await physical(authority) }, 1000, 16);
  }
  const inventory = (pool: Pool) => withTransaction(pool, db => captureLockedOrdinaryInventory(db, 1000));
  async function components(pool: Pool) {
    const rows: Record<string, { count: number; digest: string }> = {}, security: string[] = [], routines: string[] = [];
    const digest = await withTransaction(pool, db => captureLockedOrdinaryInventory(new Proxy(db, {
      get(client, property) {
        if (property === "query") return async (...args: unknown[]) => {
          const result = await Reflect.apply(client.query, client, args) as { rows: { count: number; digest: string; fact: string }[] };
          const sql = String(args[0]), table = /FROM ([a-z_0-9.]+) t LIMIT/u.exec(sql)?.[1];
          if (table && (ORDINARY_RESTORE_TABLES as readonly string[]).includes(table)) {
            const row = result.rows[0]!; rows[table] = { count: row.count, digest: row.digest };
          }
          if (sql.includes("AS fact") && sql.includes("'table',c.relname")) security.push(...result.rows.map(r => r.fact));
          if (sql.includes("AS fact") && sql.includes("'arguments',pg_get_function_identity_arguments")) routines.push(...result.rows.map(r => r.fact));
          return result;
        };
        const value = Reflect.get(client, property, client);
        return typeof value === "function" ? value.bind(client) : value;
      },
    }), 1000));
    const constraints = (await pool.query<{ conname: string; definition: string; pretty: string }>(
      `SELECT conname,pg_get_constraintdef(oid) AS definition,pg_get_constraintdef(oid,true) AS pretty
       FROM pg_constraint WHERE conrelid='elp210_candidate.leases'::regclass ORDER BY conname`)).rows;
    return { digest, rows, security, routines, constraints };
  }
  function changedFields(a: unknown, b: unknown, path: string, out: string[], depth = 0): void {
    if (JSON.stringify(a) === JSON.stringify(b)) return;
    // Only paths/indices and hashes leave this diagnostic. Never stringify
    // values, credential rows, routine bodies, ACLs or arbitrary identifiers.
    if (depth < 6 && a && b && typeof a === "object" && typeof b === "object") {
      const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
      for (const key of keys) changedFields((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key],
        `${path}.${/^[A-Za-z_0-9]+$/.test(key) ? key : "field"}`, out, depth + 1);
    } else out.push(`${path}: ${rawSha(JSON.stringify(a) ?? "undefined")} != ${rawSha(JSON.stringify(b) ?? "undefined")}`);
  }
  function diagnose(a: Awaited<ReturnType<typeof components>>, b: Awaited<ReturnType<typeof components>>): void {
    if (a.digest === b.digest) return;
    const fields: string[] = [];
    for (const name of ORDINARY_RESTORE_TABLES) if (JSON.stringify(a.rows[name]) !== JSON.stringify(b.rows[name]))
      fields.push(`table.${name}: ${JSON.stringify(a.rows[name])} != ${JSON.stringify(b.rows[name])}`);
    for (const kind of ["security", "routines"] as const) {
      for (let i = 0; i < Math.max(a[kind].length, b[kind].length); i++)
        changedFields(a[kind][i] && JSON.parse(a[kind][i]!), b[kind][i] && JSON.parse(b[kind][i]!), `${kind}[${i}]`, fields);
    }
    for (const original of a.constraints) {
      const restored = b.constraints.find(c => c.conname === original.conname);
      if (restored?.definition !== original.definition) fields.push(`lease_constraint.${original.conname}: ` +
        JSON.stringify({ raw_equal: false, postgres_pretty_equal: restored?.pretty === original.pretty,
          source_structure: original.definition.replace(/'(?:''|[^'])*'/g, "'<literal>'"),
          restored_structure: restored?.definition.replace(/'(?:''|[^'])*'/g, "'<literal>'") }));
    }
    console.error("TEST_ONLY_ORDINARY_RESTORE_COMPONENT_DIFFERENCES=" + JSON.stringify(fields));
  }
  beforeAll(async () => {
    const sourceParsed = new URL(sourceUrl!), authorityParsed = new URL(authorityUrl!), copyParsed = new URL(copyUrl!);
    const match = /^\/portal_restore_checkpoint_([a-f0-9]{8})$/.exec(sourceParsed.pathname);
    if (!match || !/^elp2-ckpt-source-[a-f0-9]{8}$/.test(sourceParsed.hostname) ||
      !/^elp2-ckpt-authority-[a-f0-9]{8}$/.test(authorityParsed.hostname) || sourceParsed.hostname === authorityParsed.hostname ||
      authorityParsed.pathname !== sourceParsed.pathname || copyParsed.host !== sourceParsed.host ||
      copyParsed.pathname !== `${sourceParsed.pathname}_copy` ||
      [sourceParsed, authorityParsed, copyParsed].some(u => u.protocol !== "postgres:" || u.username !== "portal" || u.search || u.hash))
      throw new Error("TEST_ONLY_ORDINARY_RESTORE_DISPOSABLE_CELL_REQUIRED");
    source = new Pool({ connectionString: sourceUrl, ...options });
    authority = new Pool({ connectionString: authorityUrl, ...options });
    copy = new Pool({ connectionString: copyUrl, ...options });
    const s = await physical(source), a = await physical(authority);
    if (s.database_system_identifier === a.database_system_identifier) throw new Error("TEST_ONLY_TWO_CLUSTERS_REQUIRED");
    pin = { checkpoint_id: CHECKPOINT, source_system_identifier: s.database_system_identifier,
      authority_system_identifier: a.database_system_identifier };
  });
  afterAll(async () => { await Promise.all([source?.end(), authority?.end(), copy?.end()]); });

  it.skipIf(phase !== "SEED")("SEED: checkpoints actual populated ordinary history, replays exactly, rejects caller digest/conflict", async () => {
    await seed(source, sourceUrl!, bytes => vi.mocked(readRootOwnedPinnedFile).mockImplementation(async (_path, expected) => {
      if (expected !== rawSha(bytes)) throw new Error("TEST_ONLY_PIN_MISMATCH"); return Buffer.from(bytes);
    }));
    for (const file of ["restore-checkpoint-authority.sql", "restore-checkpoint-read-lock-candidate.sql",
      "restore-checkpoint-ordinary-upgrade-candidate.sql"]) await script(authority, file);
    // Valid synthetic old closed observation tests mixed-profile history
    // validation. It is NOT proof of actual C2 closed-DB/floor barriers.
    const observation = JSON.stringify(["portal.restore-frozen-closed-db-observation.v1", CHECKPOINT,
      pin.source_system_identifier, FIRST_DRAIN, "0", OLD_OPERATION, "1", "1", "2",
      { target_oid: "1", operator_role: "portal", observer_pid: 1, observer_start: "TEST_ONLY-observer-start",
        application_name: "portal.restore.observer." + "a".repeat(32) }, "b".repeat(64)]);
    const old = { operation_id: OLD_OPERATION, expected_generation: "0", source_revision: "0", inventory_digest: rawSha(observation) };
    const oldHash = restoreCheckpointEventHash(CHECKPOINT, old, "1", "0".repeat(64), "FROZEN_CLOSED_DB_OBSERVATION");
    await authority.query(`INSERT INTO portal_restore_authority.checkpoints(checkpoint_id,source_system_identifier,
      authority_system_identifier,generation,source_revision,event_hash,event_count) VALUES($1,$2,$3,1,0,$4,1)`,
    [CHECKPOINT, pin.source_system_identifier, pin.authority_system_identifier, oldHash]);
    await authority.query(`INSERT INTO portal_restore_authority.events(checkpoint_id,operation_id,expected_generation,generation,
      source_revision,inventory_digest,predecessor_hash,event_hash,capture_kind) VALUES($1,$2,0,1,0,$3,$4,$5,'FROZEN_CLOSED_DB_OBSERVATION')`,
    [CHECKPOINT, OLD_OPERATION, old.inventory_digest, "0".repeat(64), oldHash]);
    await authority.query("INSERT INTO portal_restore_authority.closed_observations VALUES($1,$2,$3)", [CHECKPOINT, OLD_OPERATION, observation]);
    await source.query("UPDATE elp210_candidate.authority SET drain_id=$1 WHERE singleton", [FIRST_DRAIN]);
    const input = { operation_id: FIRST_OPERATION, expected_generation: "1", source_revision: await revision() };
    const result = await store().captureOrdinaryAndAppend(input, FIRST_DRAIN, 1000);
    expect(result).toMatchObject({ state: "STORED_NOT_CUTOVER", generation: "2", capture_kind: "LOCKED_ORDINARY_SOURCE_CAPTURE" });
    expect(await store().captureOrdinaryAndAppend(input, FIRST_DRAIN, 1000)).toMatchObject({ ...result, replayed: true });
    await expect(store().captureOrdinaryAndAppend({ ...input, inventory_digest: "a".repeat(64) } as typeof input, FIRST_DRAIN, 1000))
      .rejects.toThrow("V2_CHECKPOINT_INVALID");
    await expect(store().captureOrdinaryAndAppend({ ...input, expected_generation: "2" }, FIRST_DRAIN, 1000))
      .rejects.toThrow("V2_CHECKPOINT_OPERATION_CONFLICT");
    await expect(store().captureOrdinaryAndAppend(input, SECOND_DRAIN, 1000)).rejects.toThrow("V2_CHECKPOINT_DRAIN_OR_REVISION_CHANGED");
    const installed = (await state(source))!;
    expect(installed.grants).toHaveLength(3);
    expect((await source.query("SELECT count(*)::int AS n FROM portal_ordinary_profile_events")).rows[0].n).toBe(2);
    expect(await (await ordinary(source)).read(actor(CHILD), WORKSPACE, "paper", DOMAIN)).not.toBeNull();
    expect((await authority.query("SELECT count(*)::int AS n FROM portal_restore_authority.events")).rows[0].n).toBe(2);
    expect(JSON.stringify(result)).not.toContain(SECRET_SENTINEL);
  }, 120_000);

  it.skipIf(phase !== "CHECK_COPY")("CHECK_COPY: real pg_dump/pg_restore preserves populated state/security and explicit checkpoint profile", async () => {
    const original = await components(source), restored = await components(copy);
    diagnose(original, restored);
    const rawDifferent = original.constraints.filter(c => restored.constraints.find(r => r.conname === c.conname)?.definition !== c.definition);
    expect(rawDifferent.map(c => c.conname)).toEqual(["leases_human_issuer_check"]);
    expect(original.constraints.map(c => [c.conname, c.pretty])).toEqual(restored.constraints.map(c => [c.conname, c.pretty]));
    console.log("TEST_ONLY_POSTGRES_CONSTRAINT_CANONICALIZATION=" + JSON.stringify({
      raw_different: rawDifferent.map(c => c.conname), postgres_pretty_equal: true }));
    expect(restored.digest).toBe(original.digest);
    expect(await state(copy)).toEqual(await state(source));
    const observed = await (await verifier()).verifyLatest();
    expect(observed).toMatchObject({ state: "MATCH_NOT_CUTOVER", mounting: "UNMOUNTED", generation: "2",
      existing_c2_barriers: "REQUIRED_NOT_PROVEN" });
    expect(JSON.stringify(observed)).not.toContain(SECRET_SENTINEL);
    await expect(withTransaction(copy, db => assertOrdinaryRestoreSourceBinding(db))).rejects.toThrow("ORDINARY_RESTORE_TARGET");
    await withTransaction(source, db => assertOrdinaryRestoreSourceBinding(db));
    const reader = new RestoreCheckpointAuthorityReader(authority, pin, 16);
    await expect(reader.readLatestClosed({ generation: observed.generation, event_hash: observed.event_hash,
      operation_id: observed.operation_id })).rejects.toThrow("V2_CHECKPOINT_READ_INVALID");
  });
  it.skipIf(phase !== "CHECK_COPY")("CHECK_COPY: refuses wrong pools/DBs/authority pins, changed immutable guards and mixed closed evidence", async () => {
    const selected = { checkpoint: pin, restored: await physical(copy), authority: await physical(authority) };
    expect(() => new OrdinaryProfileRestoreVerifier(copy, copy, selected, 1000, 16)).toThrow("ORDINARY_RESTORE_INVALID");
    await expect(new OrdinaryProfileRestoreVerifier(source, authority, selected, 1000, 16).verifyLatest()).rejects.toThrow("ORDINARY_RESTORE_TARGET");
    await expect(new OrdinaryProfileRestoreVerifier(copy, source, selected, 1000, 16).verifyLatest()).rejects.toThrow("ORDINARY_RESTORE_TARGET");
    await authority.query("ALTER TABLE portal_restore_authority.events DISABLE TRIGGER events_immutable");
    try { await expect((await verifier()).verifyLatest()).rejects.toThrow("ORDINARY_RESTORE_JOURNAL"); }
    finally { await authority.query("ALTER TABLE portal_restore_authority.events ENABLE TRIGGER events_immutable"); }
    const before = (await authority.query("SELECT observation FROM portal_restore_authority.closed_observations WHERE operation_id=$1", [OLD_OPERATION])).rows[0].observation;
    // Disposable administrator corruption, not an application bypass. Restore
    // exact bytes/guard after each probe; no source/runtime state is changed.
    const rewrite = async (text: string) => {
      const db = await authority.connect();
      try { await db.query("BEGIN"); await db.query("ALTER TABLE portal_restore_authority.closed_observations DISABLE TRIGGER closed_observations_immutable");
        await db.query("UPDATE portal_restore_authority.closed_observations SET observation=$1 WHERE operation_id=$2", [text, OLD_OPERATION]);
        await db.query("ALTER TABLE portal_restore_authority.closed_observations ENABLE TRIGGER closed_observations_immutable"); await db.query("COMMIT");
      } catch (e) { await db.query("ROLLBACK"); throw e; } finally { db.release(); }
    };
    await rewrite("[]");
    try { await expect((await verifier()).verifyLatest()).rejects.toThrow("ORDINARY_RESTORE_JOURNAL"); }
    finally { await rewrite(before); }
    // Same constraint name, genuinely different predicate: canonicalizing
    // PostgreSQL's deparse format must not hide a changed security bound.
    const replaceIssuerCheck = async (limit: 127 | 128) => copy.query(`ALTER TABLE elp210_candidate.leases
      DROP CONSTRAINT leases_human_issuer_check; ALTER TABLE elp210_candidate.leases ADD CONSTRAINT
      leases_human_issuer_check CHECK (human_issuer IS NULL OR
      (octet_length(human_issuer) BETWEEN 1 AND ${limit} AND human_issuer=btrim(human_issuer)))`);
    await replaceIssuerCheck(127);
    try { await expect((await verifier()).verifyLatest()).rejects.toThrow("ORDINARY_RESTORE_MISMATCH"); }
    finally { await replaceIssuerCheck(128); }
    expect((await (await verifier()).verifyLatest()).state).toBe("MATCH_NOT_CUTOVER");
  });
  it.skipIf(phase !== "CHECK_COPY")("CHECK_COPY: bounded captures detect changed credentials/session/security/history and reject unknown views/custody", async () => {
    const baseline = await inventory(copy);
    const probe = async (change: (db: PoolClient) => Promise<unknown>, expected?: string) => {
      const db = await copy.connect();
      try { await db.query("BEGIN"); await change(db);
        if (expected) await expect(captureLockedOrdinaryInventory(db, 1000)).rejects.toThrow(expected);
        else expect(await captureLockedOrdinaryInventory(db, 1000)).not.toBe(baseline);
      } finally { await db.query("ROLLBACK"); db.release(); }
    };
    await probe(db => db.query("UPDATE password_credentials SET password_hash='TEST_ONLY-changed' WHERE user_id=$1", [STAN]));
    await probe(db => db.query("UPDATE auth_sessions SET state='REVOKED' WHERE session_id=$1", [actor(STAN).session_id]));
    await probe(db => db.query("UPDATE elp210_candidate.authority SET revision=revision+1 WHERE singleton"));
    await probe(db => db.query("ALTER TABLE portal_ordinary_profile_events DISABLE TRIGGER ordinary_profile_events_immutable"), "ORDINARY_RESTORE_SECURITY");
    await probe(db => db.query("GRANT SELECT ON portal_ordinary_profile_events TO PUBLIC"));
    await probe(db => db.query("CREATE VIEW public.portal_ordinary_profile_future AS SELECT 1 AS test_only"), "ORDINARY_RESTORE_SCHEMA");
    await probe(db => db.query("CREATE TABLE public.portal_ordinary_profile_future(test_only text)"), "ORDINARY_RESTORE_SCHEMA");
    await probe(db => db.query(`INSERT INTO portal_native_root_obligations(lease_id,attempt_id,purpose,source_config_digest,
      base_digest,base_body,phase,source_digest,source_fingerprint,source_expires_at)
      VALUES($1,$2,'QUALIFY',$3,$3,'TEST_ONLY','UNKNOWN',$4,$4,clock_timestamp()-interval '1 minute')`,
      [randomUUID(), randomUUID(), accessDigest("TEST_ONLY-root"), rawSha("TEST_ONLY-root")] ), "ORDINARY_RESTORE_CUSTODY_BUSY");
    await expect(withTransaction(copy, db => captureLockedOrdinaryInventory(db, 1))).rejects.toThrow("ORDINARY_RESTORE_LIMIT");
    expect(await inventory(copy)).toBe(baseline);
  });
  it.skipIf(phase !== "CHECK_COPY")("CHECK_COPY: cross-cluster lock-order contention is bounded and exact capture retry adds no journal event", async () => {
    let release!: () => void, readLocked = false;
    const gate = new Promise<void>(resolve => { release = resolve; });
    // Actual Pool/Client and actual SQL locks. Only a scheduling barrier is
    // injected, not an authority result, digest or an invented lock response.
    const gatedAuthority = new Proxy(authority, { get(pool, property) {
      if (property === "connect") return async () => {
        const client = await pool.connect();
        return new Proxy(client, { get(db, field) {
          if (field === "query") return async (...args: unknown[]) => {
            const result = await Reflect.apply(db.query, db, args) as unknown;
            if (args[0] === "SELECT portal_restore_authority.lock_journal_for_read()") { readLocked = true; await gate; }
            return result;
          };
          const value = Reflect.get(db, field, db); return typeof value === "function" ? value.bind(db) : value;
        } });
      };
      const value = Reflect.get(pool, property, pool); return typeof value === "function" ? value.bind(pool) : value;
    } });
    const selected = { checkpoint: pin, restored: await physical(source), authority: await physical(authority) };
    const verifying = new OrdinaryProfileRestoreVerifier(source, gatedAuthority, selected, 1000, 16).verifyLatest()
      .then(value => ({ value, error: undefined }), error => ({ value: undefined, error }));
    let capturing: Promise<{ value: unknown; error?: { code?: string } }> | undefined;
    const input = { operation_id: FIRST_OPERATION, expected_generation: "1", source_revision: await revision() };
    try {
      await expect.poll(() => readLocked, { timeout: 1500, interval: 20 }).toBe(true);
      capturing = store().captureOrdinaryAndAppend(input, FIRST_DRAIN, 1000)
        .then(value => ({ value }), error => ({ value: undefined, error }));
      await expect.poll(async () => (await authority.query(`SELECT count(*)::int AS n FROM pg_stat_activity
        WHERE datname=current_database() AND wait_event_type='Lock'
        AND query LIKE 'LOCK TABLE portal_restore_authority.events IN ROW EXCLUSIVE MODE%'`)).rows[0].n,
      { timeout: 1500, interval: 20 }).toBeGreaterThan(0);
      release();
      expect((await capturing).error?.code).toBe("55P03");
      const checked = await verifying;
      if (checked.error) expect(checked.error.message).toBe("ORDINARY_RESTORE_UNAVAILABLE");
      else expect(checked.value?.state).toBe("MATCH_NOT_CUTOVER");
    } finally { release(); await Promise.allSettled([verifying, ...(capturing ? [capturing] : [])]); }
    expect(await store().captureOrdinaryAndAppend(input, FIRST_DRAIN, 1000)).toMatchObject({ generation: "2", replayed: true });
    expect((await authority.query("SELECT count(*)::int AS n FROM portal_restore_authority.events")).rows[0].n).toBe(2);
  }, 15_000);

  it.skipIf(phase !== "POST_SNAPSHOT")("POST_SNAPSHOT: actual owner revoke stops source child read and advances independent checkpoint", async () => {
    const service = await ordinary(source), before = (await state(source))!;
    const old = await service.read(actor(CHILD), WORKSPACE, "paper", DOMAIN);
    expect(old).not.toBeNull();
    await source.query("UPDATE elp210_candidate.authority SET drain_id=NULL WHERE singleton");
    const parent = before.grants.find(g => g.subject_user_id === STAN)!;
    await service.revoke(actor(OWNER), { operation_id: "TEST_ONLY-post-snapshot-owner-revoke", workspace_id: WORKSPACE,
      grant_id: parent.grant_id, expected_grant_revision: parent.revision,
      expected_head: { revision: before.head.revision, digest: before.digest }, reason: "TEST_ONLY_POST_SNAPSHOT_REVOKE" });
    expect(await service.read(actor(CHILD), WORKSPACE, "paper", DOMAIN)).toBeNull();
    expect(await service.confirmMany([old!])).toBeNull();
    await source.query("UPDATE elp210_candidate.authority SET drain_id=$1 WHERE singleton", [SECOND_DRAIN]);
    const input = { operation_id: SECOND_OPERATION, expected_generation: "2", source_revision: await revision() };
    expect(await store().captureOrdinaryAndAppend(input, SECOND_DRAIN, 1000)).toMatchObject({ generation: "3", replayed: false });
    expect(await store().captureOrdinaryAndAppend(input, SECOND_DRAIN, 1000)).toMatchObject({ generation: "3", replayed: true });
    await expect((await verifier()).verifyLatest()).rejects.toThrow("ORDINARY_RESTORE_MISMATCH");
    expect((await authority.query("SELECT count(*)::int AS n FROM portal_restore_authority.events")).rows[0].n).toBe(3);
  });
  it.skipIf(phase !== "VERIFY_STALE")("VERIFY_STALE: old clone has exact original physical identity and READ-allows, independent latest checkpoint refuses", async () => {
    // Root runner renamed the post-revoke source aside and the dump clone to
    // its ORIGINAL DB name. Cluster, name and role match old immutable pins:
    // this is not a physical-repin or a name-mismatch-only refusal test.
    await withTransaction(source, db => assertOrdinaryRestoreSourceBinding(db));
    const service = await ordinary(source), old = await service.read(actor(CHILD), WORKSPACE, "paper", DOMAIN);
    expect(old).not.toBeNull();
    expect(await service.confirmMany([old!])).not.toBeNull();
    expect((await state(source))!.revocations).toHaveLength(0);
    await expect((await verifier(source)).verifyLatest()).rejects.toThrow("ORDINARY_RESTORE_MISMATCH");
    expect((await authority.query("SELECT generation::text AS generation FROM portal_restore_authority.checkpoints WHERE checkpoint_id=$1", [CHECKPOINT])).rows[0].generation).toBe("3");
    expect((await authority.query("SELECT count(*)::int AS n FROM portal_restore_authority.events")).rows[0].n).toBe(3);
  });
});
