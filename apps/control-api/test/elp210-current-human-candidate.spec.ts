/** Real disposable Core PostgreSQL + ephemeral TEST_ONLY Ed25519 trust. This
 * proves candidate ordering/guards, NOT installed PM/Portal authority or G2. */
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { decodeJwt, generateKeyPair, SignJWT } from "jose";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CurrentHumanCandidate, type CurrentHumanCandidateConfig, type CurrentHumanBinding } from "../src/execution-v2/current-human-candidate";
import { captureCurrentHumanSnapshot } from "../src/execution-v2/current-human-snapshot";
import { withTransaction } from "../src/db/pool";
import type { AccessActor } from "../src/execution-v2/access.contract";
import { migrateTestDatabase } from "./harness";

const database = process.env.TEST_DATABASE_URL;
describe.skipIf(!database)("ELP2-10 unmounted authentic-human candidate, real Core DB", () => {
  let pool: Pool, candidate: CurrentHumanCandidate, config: CurrentHumanCandidateConfig;
  let sourceKey: Awaited<ReturnType<typeof generateKeyPair>>, humanKey: Awaited<ReturnType<typeof generateKeyPair>>;
  let actor: AccessActor, binding: CurrentHumanBinding, suffix: string;
  const proof = async (lease: string, phase: "ENTER" | "COMMITTED" | "ROLLED_BACK" | "UNKNOWN" = "ENTER",
    changes: Record<string, unknown> = {}, signer = sourceKey.privateKey) => {
    const now = Math.floor(Date.now() / 1000), terminal = phase === "COMMITTED" || phase === "ROLLED_BACK";
    return new SignJWT({ iss: config.source.issuer, aud: config.source.audience, sub: config.source.workload_id,
      jti: randomUUID(), iat: now, nbf: now, exp: now + 60, purpose: "pma.current-human-lease.v1",
      lease_id: lease, attempt_id: `test-only-attempt-${lease}`, ...binding, phase,
      source_receipt_id: terminal ? `test-only-terminal-${lease}` : null,
      source_receipt_digest: terminal ? `sha256:${"a".repeat(64)}` : null, ...changes,
    }).setProtectedHeader({ alg: "EdDSA", kid: config.source.key_id, typ: "JWT" }).sign(signer);
  };
  const state = async () => (await pool.query("SELECT * FROM elp210_candidate.authority WHERE singleton")).rows[0];
  const phase = async (lease: string) => (await pool.query("SELECT phase FROM elp210_candidate.leases WHERE lease_id=$1", [lease])).rows[0].phase;
  const enter = async () => {
    const lease = await candidate.issue(actor, binding);
    await candidate.enter(lease.token, await proof(lease.lease_id));
    return lease;
  };

  beforeAll(async () => {
    await migrateTestDatabase(database!);
    pool = new Pool({ connectionString: database, max: 3, connectionTimeoutMillis: 2000, query_timeout: 6000 });
    [sourceKey, humanKey] = await Promise.all([generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true }),
      generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true })]);
  });
  beforeEach(async () => {
    suffix = randomUUID();
    actor = { user_id: `test-only-human-${suffix}`, session_id: `test-only-session-${suffix}`, session_generation: 7 };
    binding = { workspace_id: `test-only-workspace-${suffix}`, environment: "paper", workload_id: "test-only-pm-provider",
      request_digest: `sha256:${"b".repeat(64)}` };
    await pool.query(`INSERT INTO portal_users(user_id,username,display_name,role,status,must_change_password,session_version)
      VALUES($1,$1,'TEST_ONLY','USER','ACTIVE',false,7)`, [actor.user_id]);
    await pool.query(`INSERT INTO auth_sessions(session_id,session_token_hash,user_id,state,csrf_secret_hash,
      session_version,idle_expires_at,absolute_expires_at) VALUES($1,$1,$2,'ACTIVE','TEST_ONLY',7,
      clock_timestamp()+interval '10 minutes',clock_timestamp()+interval '20 minutes')`, [actor.session_id, actor.user_id]);
    await pool.query("INSERT INTO workspaces(workspace_id,name,owner_user_id) VALUES($1,'TEST_ONLY',$2)", [binding.workspace_id, actor.user_id]);
    await pool.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'OWNER')", [binding.workspace_id, actor.user_id]);
    await pool.query(`INSERT INTO external_identity_bindings(binding_id,user_id,provider,issuer,subject,normalized_email)
      VALUES($1,$2,'cloudflare_access','TEST_ONLY',$1,$3)`, [suffix, actor.user_id, `${suffix}@example.invalid`]);
    await pool.query(await readFile(join(__dirname, "../src/execution-v2/current-human-candidate.sql"), "utf8"));
    config = { issuer: "test-only-portal", audience: "test-only-pm", key_id: "test-only-human-key", private_key: humanKey.privateKey,
      source: { issuer: "test-only-source", audience: "test-only-portal-authority", key_id: "test-only-source-key",
        public_key: sourceKey.publicKey, workload_id: binding.workload_id },
      limits: { ttl_ms: 30_000, maximum_unresolved: 3, maximum_retained: 10 } };
    candidate = await CurrentHumanCandidate.create(pool, config);
  });
  afterEach(async () => {
    // Exact isolated candidate schema; CASCADE removes only its own dependency
    // triggers, not the public identity tables or unrelated runtime records.
    await pool.query("DROP SCHEMA IF EXISTS elp210_candidate CASCADE");
    await pool.query("DELETE FROM workspaces WHERE workspace_id=$1", [binding.workspace_id]);
    await pool.query("DELETE FROM portal_users WHERE user_id=$1", [actor.user_id]);
  });
  afterAll(async () => { await pool?.end(); });

  it("issues genuine PM-purpose Ed25519 identity from current user/session, without role/business grants", async () => {
    const lease = await candidate.issue(actor, binding), body = decodeJwt(lease.token);
    expect(body).toMatchObject({ purpose: "pma.identity.v1", principal_kind: "human", sub: actor.user_id,
      sid: actor.session_id, session_revision: 7, authority_revision: 0, ...binding });
    expect(body).not.toHaveProperty("roles"); expect(body).not.toHaveProperty("scopes");
    expect(pool.idleCount).toBe(pool.totalCount);
    await candidate.enter(lease.token, await proof(lease.lease_id));
    expect(await phase(lease.lease_id)).toBe("ENTERED");
  });
  it("rejects stale session generation and nonmember workspace instead of borrowing an owner identity", async () => {
    await expect(candidate.issue({ ...actor, session_generation: 6 }, binding)).rejects.toMatchObject({ code: "CURRENT_ACTOR_AUTHORITY_REQUIRED" });
    await expect(candidate.issue(actor, { ...binding, workspace_id: "test-only-other" })).rejects.toMatchObject({ code: "ACCESS_RESOURCE_NOT_FOUND" });
    expect((await pool.query("SELECT count(*)::int AS n FROM elp210_candidate.leases")).rows[0].n).toBe(0);
  });
  it("blocks legacy raw user disable/session revoke while a source transaction is unresolved", async () => {
    await enter();
    await expect(pool.query("UPDATE portal_users SET status='DISABLED' WHERE user_id=$1", [actor.user_id])).rejects.toThrow("CURRENT_HUMAN_DRAIN_REQUIRED");
    await expect(pool.query("UPDATE auth_sessions SET state='REVOKED' WHERE session_id=$1", [actor.session_id])).rejects.toThrow("CURRENT_HUMAN_DRAIN_REQUIRED");
    expect((await state()).revision).toBe("0");
  });
  it("persists drain despite a busy source, closes admission, then allows revoke only after terminal source proof", async () => {
    const lease = await enter();
    expect(await candidate.beginDrain("test-only-revoke")).toMatchObject({ status: "DRAIN_PENDING", pending: 1 });
    expect((await state()).drain_id).toBe("test-only-revoke");
    await expect(candidate.issue(actor, binding)).rejects.toMatchObject({ code: "CURRENT_HUMAN_DRAINING" });
    await expect(candidate.endDrain("test-only-revoke", 0)).rejects.toMatchObject({ code: "CURRENT_HUMAN_DRAIN_UNRESOLVED" });
    await candidate.resolve(await proof(lease.lease_id, "COMMITTED"));
    expect(await candidate.drainStatus("test-only-revoke")).toMatchObject({ status: "DRAIN_READY", pending: 0 });
    await pool.query("UPDATE auth_sessions SET state='REVOKED' WHERE session_id=$1", [actor.session_id]);
    expect((await state()).revision).toBe("1");
    await expect(candidate.endDrain("test-only-revoke", 0)).rejects.toMatchObject({ code: "CURRENT_HUMAN_DRAIN_CONFLICT" });
    await candidate.endDrain("test-only-revoke", 1);
    await expect(candidate.issue(actor, binding)).rejects.toMatchObject({ code: "CURRENT_ACTOR_AUTHORITY_REQUIRED" });
  });
  it("retires unused assertions on drain; a signed token is no permission to enter afterwards", async () => {
    const lease = await candidate.issue(actor, binding);
    expect(await candidate.beginDrain("test-only-drain")).toMatchObject({ status: "DRAIN_READY" });
    expect(await phase(lease.lease_id)).toBe("RETIRED");
    await expect(candidate.enter(lease.token, await proof(lease.lease_id))).rejects.toMatchObject({ code: "CURRENT_HUMAN_DRAINING" });
    await candidate.endDrain("test-only-drain", 0);
    await expect(candidate.enter(lease.token, await proof(lease.lease_id))).rejects.toMatchObject({ code: "CURRENT_HUMAN_ENTRY_NOT_AVAILABLE" });
  });
  it("never interprets UNKNOWN/release loss or expiry as rollback; same source readback resolves it", async () => {
    const lease = await enter();
    await candidate.resolve(await proof(lease.lease_id, "UNKNOWN"));
    expect(await candidate.beginDrain("test-only-partition")).toMatchObject({ status: "DRAIN_UNKNOWN", pending: 1 });
    await expect(pool.query("UPDATE portal_users SET session_version=session_version+1 WHERE user_id=$1", [actor.user_id]))
      .rejects.toThrow("CURRENT_HUMAN_DRAIN_REQUIRED");
    await candidate.resolve(await proof(lease.lease_id, "ROLLED_BACK"));
    expect(await candidate.drainStatus("test-only-partition")).toMatchObject({ status: "DRAIN_READY" });
  });
  it("keeps a used lease mutation-blocking after its actual token expiry", async () => {
    candidate = await CurrentHumanCandidate.create(pool, { ...config, limits: { ...config.limits, ttl_ms: 2000 } });
    const lease = await enter();
    // One bounded expiry fault, not a soak. The DB clock is authoritative.
    await pool.query("SELECT pg_sleep(2.05)");
    expect(await candidate.beginDrain("test-only-expiry")).toMatchObject({ status: "DRAIN_UNKNOWN", pending: 1 });
    expect(await phase(lease.lease_id)).toBe("ENTERED");
    await expect(pool.query("UPDATE auth_sessions SET state='REVOKED' WHERE session_id=$1", [actor.session_id]))
      .rejects.toThrow("CURRENT_HUMAN_DRAIN_REQUIRED");
    await candidate.resolve(await proof(lease.lease_id, "ROLLED_BACK"));
    expect(await candidate.drainStatus("test-only-expiry")).toMatchObject({ status: "DRAIN_READY" });
  });
  it("makes exact terminal readback idempotent but refuses conflicting outcome or receipt", async () => {
    const lease = await enter(), terminal = await proof(lease.lease_id, "COMMITTED");
    expect(await candidate.resolve(terminal)).toEqual({ phase: "COMMITTED", replayed: false });
    expect(await candidate.resolve(terminal)).toEqual({ phase: "COMMITTED", replayed: true });
    await expect(candidate.resolve(await proof(lease.lease_id, "ROLLED_BACK"))).rejects.toMatchObject({ code: "CURRENT_HUMAN_TERMINAL_CONFLICT" });
    await expect(candidate.resolve(await proof(lease.lease_id, "COMMITTED", { source_receipt_id: "different" })))
      .rejects.toMatchObject({ code: "CURRENT_HUMAN_TERMINAL_CONFLICT" });
    expect((await pool.query("SELECT count(*)::int AS n FROM elp210_candidate.events WHERE lease_id=$1", [lease.lease_id])).rows[0].n).toBe(3);
  });
  it("entry is one-use, including same-attempt retry; a second transaction cannot reuse its lease", async () => {
    const lease = await enter();
    await expect(candidate.enter(lease.token, await proof(lease.lease_id))).rejects.toMatchObject({ code: "CURRENT_HUMAN_ENTRY_NOT_AVAILABLE" });
  });
  it("persists exact source attempts for crash recovery without recreating a human token or admission", async () => {
    const lease = await enter();
    const restarted = await CurrentHumanCandidate.create(pool, config);
    const attempts = await restarted.recoverableAttempts();
    expect(attempts).toEqual([{ lease_id: lease.lease_id, attempt_id: `test-only-attempt-${lease.lease_id}`,
      ...binding, human_issuer: config.issuer, subject: actor.user_id, session_id: actor.session_id,
      session_revision: 7, authority_revision: 0, expires_at: lease.expires_at_ms / 1000 }]);
    expect(attempts[0]).not.toHaveProperty("token");
    await restarted.resolve(await proof(lease.lease_id, "COMMITTED"));
    expect(await restarted.recoverableAttempts()).toEqual([]);
  });
  it.each(["workspace_id", "environment", "workload_id", "request_digest", "attempt_id"])("rejects substituted %s in source proofs", async key => {
    const lease = await enter();
    const other = key === "request_digest" ? `sha256:${"c".repeat(64)}` : key === "environment" ? "live" : "different";
    await expect(candidate.resolve(await proof(lease.lease_id, "COMMITTED", { [key]: other })))
      .rejects.toMatchObject({ code: key === "workload_id" ? "CURRENT_HUMAN_SOURCE_PROOF_INVALID" : "CURRENT_HUMAN_BINDING_MISMATCH" });
    expect(await phase(lease.lease_id)).toBe("ENTERED");
  });
  it("requires authentic pinned source signing, not browser-shaped JSON or the human key", async () => {
    const lease = await candidate.issue(actor, binding);
    await expect(candidate.enter(lease.token, "{}")).rejects.toMatchObject({ code: "CURRENT_HUMAN_SOURCE_PROOF_INVALID" });
    await expect(candidate.enter(lease.token, await proof(lease.lease_id, "ENTER", {}, humanKey.privateKey)))
      .rejects.toMatchObject({ code: "CURRENT_HUMAN_SOURCE_PROOF_INVALID" });
    await expect(candidate.enter("x".repeat(8193), await proof(lease.lease_id)))
      .rejects.toMatchObject({ code: "CURRENT_HUMAN_TOKEN_INVALID" });
  });
  it("does not block harmless display/last-seen updates or session lifetime extension", async () => {
    await enter();
    await pool.query("UPDATE portal_users SET display_name='TEST_ONLY_RENAMED',failed_login_count=1 WHERE user_id=$1", [actor.user_id]);
    await pool.query("UPDATE auth_sessions SET last_seen_at=clock_timestamp(),idle_expires_at=idle_expires_at+interval '1 second' WHERE session_id=$1", [actor.session_id]);
    await pool.query("UPDATE external_identity_bindings SET last_seen_at=clock_timestamp() WHERE binding_id=$1", [suffix]);
    await pool.query("UPDATE workspaces SET name='TEST_ONLY_RENAMED' WHERE workspace_id=$1", [binding.workspace_id]);
    expect((await state()).revision).toBe("0");
    await expect(pool.query("UPDATE auth_sessions SET idle_expires_at=clock_timestamp() WHERE session_id=$1", [actor.session_id])).rejects.toThrow("CURRENT_HUMAN_DRAIN_REQUIRED");
  });
  it("fences authority across workspace/owner/policy/grant/binding deletion and TRUNCATE", async () => {
    await enter();
    await expect(pool.query("DELETE FROM workspace_members WHERE workspace_id=$1 AND user_id=$2", [binding.workspace_id, actor.user_id])).rejects.toThrow("CURRENT_HUMAN_DRAIN_REQUIRED");
    await expect(pool.query("DELETE FROM workspaces WHERE workspace_id=$1", [binding.workspace_id])).rejects.toThrow("CURRENT_HUMAN_DRAIN_REQUIRED");
    await expect(pool.query("INSERT INTO portal_owner_anchor(anchor_id,user_id) VALUES('PORTAL_OWNER',$1)", [actor.user_id]))
      .rejects.toThrow("CURRENT_HUMAN_DRAIN_REQUIRED");
    await expect(pool.query(`INSERT INTO external_identity_bindings(binding_id,user_id,provider,issuer,subject,normalized_email)
      VALUES($1,$2,'cloudflare_access','TEST_ONLY','TEST_ONLY','test-only@example.invalid')`, [suffix, actor.user_id]))
      .rejects.toThrow("CURRENT_HUMAN_DRAIN_REQUIRED");
    await expect(pool.query(`INSERT INTO portal_access_policy_state(workspace_id,revision,policy)
      VALUES($1,'TEST_ONLY','{}'::jsonb)`, [binding.workspace_id])).rejects.toThrow("CURRENT_HUMAN_DRAIN_REQUIRED");
    await expect(pool.query("TRUNCATE workspace_members")).rejects.toThrow("CURRENT_HUMAN_HISTORY_IMMUTABLE");
    const guarded = await pool.query(`SELECT count(*)::int AS n FROM pg_trigger WHERE tgname='elp210_authority_guard'`);
    expect(guarded.rows[0].n).toBe(11);
  });
  it("refuses an unbounded candidate pool before installing or issuing any authority", async () => {
    const unbounded = new Pool({ connectionString: database });
    try { await expect(CurrentHumanCandidate.create(unbounded, config)).rejects.toMatchObject({ code: "CURRENT_HUMAN_POOL_TIMEOUT_REQUIRED" }); }
    finally { await unbounded.end(); }
  });
  it("serializes issuance against a real concurrent session revoke commit", async () => {
    const writer = await pool.connect();
    try {
      await writer.query("BEGIN");
      await writer.query("UPDATE auth_sessions SET state='REVOKED' WHERE session_id=$1", [actor.session_id]);
      let settled = false;
      const issuing = candidate.issue(actor, binding).then(value => ({ value }), error => ({ error })).finally(() => { settled = true; });
      await writer.query("SELECT pg_sleep(0.04)");
      expect(settled).toBe(false);
      await writer.query("COMMIT");
      expect(await issuing).toMatchObject({ error: { code: "CURRENT_ACTOR_AUTHORITY_REQUIRED" } });
    } finally { await writer.query("ROLLBACK"); writer.release(); }
  });
  it("rejects a stale REPEATABLE READ revoker whose snapshot predates issuance and source entry", async () => {
    const writer = await pool.connect();
    try {
      await writer.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
      expect((await writer.query("SELECT count(*)::int AS n FROM elp210_candidate.leases")).rows[0].n).toBe(0);
      const lease = await enter();
      await expect(writer.query("UPDATE auth_sessions SET state='REVOKED' WHERE session_id=$1", [actor.session_id]))
        .rejects.toMatchObject({ code: "40001" });
      expect(await phase(lease.lease_id)).toBe("ENTERED");
      expect((await state()).revision).toBe("0");
    } finally { await writer.query("ROLLBACK"); writer.release(); }
  });
  it("serializes source entry against a committed concurrent drain, without a second admission gap", async () => {
    const lease = await candidate.issue(actor, binding), signed = await proof(lease.lease_id), writer = await pool.connect();
    try {
      await writer.query("BEGIN");
      await writer.query("UPDATE elp210_candidate.authority SET drain_id='test-only-race' WHERE singleton");
      let settled = false;
      const entering = candidate.enter(lease.token, signed).then(() => ({}), error => ({ error })).finally(() => { settled = true; });
      await writer.query("SELECT pg_sleep(0.04)");
      expect(settled).toBe(false);
      await writer.query("COMMIT");
      expect(await entering).toMatchObject({ error: { code: "CURRENT_HUMAN_DRAINING" } });
      expect(await phase(lease.lease_id)).toBe("ISSUED");
    } finally { await writer.query("ROLLBACK"); writer.release(); }
  });
  it("uses bounded admission/retained storage and preserves immutable audit, never TTL deletion", async () => {
    candidate = await CurrentHumanCandidate.create(pool, { ...config, limits: { ...config.limits, maximum_unresolved: 1, maximum_retained: 1 } });
    const lease = await enter();
    await expect(candidate.issue(actor, binding)).rejects.toMatchObject({ code: "CURRENT_HUMAN_CAPACITY_EXHAUSTED" });
    await candidate.resolve(await proof(lease.lease_id, "COMMITTED"));
    await expect(candidate.issue(actor, binding)).rejects.toMatchObject({ code: "CURRENT_HUMAN_CAPACITY_EXHAUSTED" });
    await expect(pool.query("DELETE FROM elp210_candidate.leases WHERE lease_id=$1", [lease.lease_id])).rejects.toThrow("CURRENT_HUMAN_HISTORY_IMMUTABLE");
    await expect(pool.query("UPDATE elp210_candidate.events SET phase='RETIRED'")).rejects.toThrow("CURRENT_HUMAN_HISTORY_IMMUTABLE");
  });
  it("shares the real DB-only capture with existing AccessService without changing fingerprint semantics", async () => {
    const snapshot = await withTransaction(pool, db => captureCurrentHumanSnapshot(db, actor, binding.workspace_id));
    expect(snapshot).toMatchObject({ actor_role: "USER", actor_member: true, policy: null, grants: [] });
    // The protected owner is deliberately part of the original fingerprint;
    // migration fixtures may already have installed that independent user.
    expect(snapshot.ids).toContain(actor.user_id); expect(snapshot.active).toContain(actor.user_id);
    if (snapshot.anchor) expect(snapshot.ids).toContain(snapshot.anchor);
    expect(snapshot.authority_fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(snapshot.lease_until_ms).toBeGreaterThan(snapshot.now);
  });
});
