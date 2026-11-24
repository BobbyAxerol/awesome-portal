/** BE-P10 task 1, REAL PostgreSQL half. Requires TEST_DATABASE_URL (a DISPOSABLE database); otherwise the whole
 * file is skipped and its result is NOT_RUN. Uses the real Core tables, the real candidate schema/triggers, the real
 * `CurrentHumanMutations` coordinator and the real AccessRepository. The artifact file is the same fake
 * root-owned file as in the fake-backed spec (no real /root file is needed). SYNTHETIC ids only. */
import { randomUUID, generateKeyPairSync } from "node:crypto";
import { constants } from "node:fs";
import { readFile } from "node:fs/promises";
import { lstat, open } from "node:fs/promises";
import { join } from "node:path";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthService } from "../src/auth/auth.service";
import { withTransaction } from "../src/db/pool";
import { ExecutionAccessService } from "../src/execution-v2/access.service";
import { accessDigest } from "../src/execution-v2/access-digest";
import { unqualifiedAccessTrust } from "../src/execution-v2/access-trust";
import { AccessRepository } from "../src/execution-v2/access.repository";
import { CurrentHumanCandidate, type CurrentHumanCandidateConfig } from "../src/execution-v2/current-human-candidate";
import { CurrentHumanMutations } from "../src/execution-v2/current-human-mutations";
import { evaluateManagerDomainRead, evaluateManagerDomainStream } from "../src/execution-v2/current-human-snapshot";
import { readPinnedManagerRevoke } from "../src/execution-v2/manager-domain-revoke";
import { migrateTestDatabase, truncateAll } from "./harness";

vi.mock("node:fs/promises", async original => ({ ...await original<typeof import("node:fs/promises")>(), lstat: vi.fn(), open: vi.fn() }));
const DATABASE = process.env.TEST_DATABASE_URL;
const NOW_BASE = Date.now();

describe.skipIf(!DATABASE)("BE-P10 manager-domain revoke on real PostgreSQL (SYNTHETIC; NOT_RUN without TEST_DATABASE_URL)", () => {
  let pool: Pool, owner: string, workspace: string, session: string, db: { name: string; system: string; role: string };
  const DOMAIN = { profile_id: "TEST_ONLY-profile", catalogue_sha256: "1".repeat(64), profile_sha256: "2".repeat(64), field_policy_sha256: "3".repeat(64) };
  let read: any, stream: any, coordinator: CurrentHumanMutations, access: ExecutionAccessService;
  const actor = () => ({ user_id: owner, session_id: session, session_generation: 7 });
  const request = () => ({ actor: actor(), workspace_id: workspace, environment: "paper" as const, domain: DOMAIN });

  async function artifact(items: object[], revocationId: string) {
    const target = { database_name: db.name, database_system_identifier: db.system, role_name: db.role, protected_owner_user_id: owner, workspace_id: workspace,
      principal_workspace_pins: [{ user_id: owner, workspace_id: workspace }] };
    const bytes = Buffer.from(JSON.stringify({ schema_version: "portal.private-owner-manager-revoke.v1", target, revocation_id: revocationId,
      approval_ref: "TEST_ONLY-NOT-REAL-APPROVAL", reason: "pg", items, provenance_ref: "TEST_ONLY" }));
    const st = { uid: 0, mode: 0o100600, ino: 5, dev: 1, size: bytes.length, isFile: () => true, isSymbolicLink: () => false };
    vi.mocked(lstat).mockResolvedValue(st as any);
    vi.mocked(open).mockImplementation((async (_p: unknown, flags: unknown) => {
      expect(flags).toBe(constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      let done = false;
      return { stat: async () => st, close: async () => undefined, read: async (b: Buffer, start: number) => {
        if (done) return { bytesRead: 0, buffer: b }; done = true; bytes.copy(b, start); return { bytesRead: bytes.length, buffer: b }; } };
    }) as any);
    const { createHash } = await import("node:crypto");
    return readPinnedManagerRevoke({ artifact_path: "/root/TEST_ONLY-pg-revoke.json", approved_sha256: createHash("sha256").update(bytes).digest("hex"),
      target, not_before_ms: Date.now() - 60_000, not_after_ms: Date.now() + 3_600_000 }, Date.now());
  }

  beforeAll(async () => {
    await migrateTestDatabase(DATABASE!);
    pool = new Pool({ connectionString: DATABASE, max: 4, connectionTimeoutMillis: 2000, query_timeout: 6000 });
    await truncateAll(pool);
    const target = (await pool.query(`SELECT current_database() AS name,current_user AS role,(pg_control_system()).system_identifier::text AS system`)).rows[0];
    db = { name: target.name, system: target.system, role: target.role };
  });
  beforeEach(async () => {
    const suffix = randomUUID();
    owner = "TEST_ONLY-owner-" + suffix; workspace = "TEST_ONLY-workspace-" + suffix; session = "TEST_ONLY-session-" + suffix;
    await pool.query(`INSERT INTO portal_users(user_id,username,display_name,role,status,must_change_password,session_version)
      VALUES($1,$1,'TEST_ONLY','ADMIN','ACTIVE',false,7)`, [owner]);
    await pool.query("INSERT INTO portal_owner_anchor(anchor_id,user_id) VALUES('PORTAL_OWNER',$1)", [owner]);
    await pool.query("INSERT INTO workspaces(workspace_id,name,owner_user_id) VALUES($1,'TEST_ONLY',$2)", [workspace, owner]);
    await pool.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'MEMBER')", [workspace, owner]);
    await pool.query(`INSERT INTO auth_sessions(session_id,session_token_hash,user_id,state,csrf_secret_hash,session_version,idle_expires_at,absolute_expires_at)
      VALUES($1,$1,$2,'ACTIVE','TEST_ONLY',7,clock_timestamp()+interval '30 minutes',clock_timestamp()+interval '60 minutes')`, [session, owner]);
    const now = Date.now(), seal = { environment: "paper" as const, domain: DOMAIN, field_policy_ref: "TEST_ONLY-fields", valid_from_ms: now - 1000, valid_until_ms: now + 600_000 };
    const policy = { workspace_id: workspace, revision: "TEST_ONLY-policy", artifact_digest: accessDigest(["TEST_ONLY"]), approval_ref: "TEST_ONLY-NOT-REAL",
      state: "REVIEWED" as const, qualification: "OWNER_VERIFIED" as const, protected_owner_user_id: owner, researcher_fields: { state: "PENDING" as const, policy_ref: null, fields: [] },
      manager_read_domains: [seal] };
    const grant = (id: string, action: "business.read_all" | "stream.subscribe") => ({ schema_version: "portal.manager-domain-grant.v1" as const, grant_id: id + suffix,
      workspace_id: workspace, subject_user_id: owner, issued_by: owner, parent_grant_id: null, revision: "r1", policy_revision: policy.revision, action,
      effect: "ALLOW" as const, environment: "paper" as const, domain: DOMAIN, field_policy_ref: seal.field_policy_ref, valid_from_ms: now - 500, valid_until_ms: now + 300_000, revoked_at_ms: null });
    read = grant("TEST_ONLY-read-", "business.read_all"); stream = grant("TEST_ONLY-stream-", "stream.subscribe");
    const repo = new AccessRepository(pool);
    await repo.putPolicy(policy); await repo.saveManagerDomainGrant(read, true); await repo.saveManagerDomainGrant(stream, true);
    await pool.query(await readFile(join(__dirname, "../src/execution-v2/current-human-candidate.sql"), "utf8"));
    const [source, human] = [generateKeyPairSync("ed25519"), generateKeyPairSync("ed25519")];
    const config = { issuer: "TEST_ONLY-portal", audience: "TEST_ONLY-pm", key_id: "TEST_ONLY-human", private_key: human.privateKey as any,
      source: { issuer: "TEST_ONLY-pm", audience: "TEST_ONLY-portal-authority", key_id: "TEST_ONLY-source", public_key: source.publicKey as any, workload_id: "TEST_ONLY-wl" },
      limits: { ttl_ms: 30_000, maximum_unresolved: 3, maximum_retained: 10 } } as unknown as CurrentHumanCandidateConfig;
    const candidate = await CurrentHumanCandidate.create(pool, config);
    coordinator = new CurrentHumanMutations(pool, candidate, { recover: async () => undefined }, { maximum_intents: 16, maximum_recoveries_per_request: 3 });
    access = new ExecutionAccessService(pool, {} as AuthService, unqualifiedAccessTrust, false, coordinator);
  });
  afterEach(async () => { await pool.query("DROP SCHEMA IF EXISTS elp210_candidate CASCADE"); await truncateAll(pool); });
  afterAll(async () => { await pool?.end(); });

  const item = (g: any) => ({ mode: "REVOKE", grant_id: g.grant_id, action: g.action, expected_grant_revision: g.revision });

  it("revokes READ and STREAM through the real coordinator and triggers; both deny at once; the audit rows are append-only; replay writes nothing", async () => {
    await withTransaction(pool, db => evaluateManagerDomainStream(db, request()));
    const verified = await artifact([item(read), item(stream)], "TEST_ONLY-pg-1");
    const receipts = await access.revokeReviewedManagerDomainGrants(verified);
    expect(receipts.map(r => r.outcome)).toEqual(["REVOKED", "REVOKED"]);
    await expect(withTransaction(pool, db => evaluateManagerDomainRead(db, request()))).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    await expect(withTransaction(pool, db => evaluateManagerDomainStream(db, request()))).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    const events = (await pool.query("SELECT * FROM portal_access_policy_events WHERE workspace_id=$1 AND operation='REVOKE'", [workspace])).rows;
    expect(events).toHaveLength(2);
    await expect(pool.query("UPDATE portal_access_policy_events SET operation='REVOKE' WHERE workspace_id=$1", [workspace])).rejects.toThrow(/immutable/);
    await expect(pool.query("DELETE FROM portal_access_policy_events WHERE workspace_id=$1", [workspace])).rejects.toThrow(/immutable/);
    const again = await access.revokeReviewedManagerDomainGrants(await artifact([item(read), item(stream)], "TEST_ONLY-pg-1"));
    expect(again.every(r => r.replayed)).toBe(true);
    expect((await pool.query("SELECT count(*)::int AS n FROM portal_access_policy_events WHERE workspace_id=$1 AND operation='REVOKE'", [workspace])).rows[0].n).toBe(2);
  });

  it("a reader holding the Core snapshot makes the revoke fail closed and retryable; once the reader finishes the SAME artifact completes", async () => {
    const reader = await pool.connect();
    try {
      await reader.query("BEGIN");
      await evaluateManagerDomainRead(reader, request()); // holds authority FOR UPDATE + the workspace advisory lock until ROLLBACK
      await expect(access.revokeReviewedManagerDomainGrants(await artifact([item(read)], "TEST_ONLY-pg-2")))
        .rejects.toMatchObject({ code: expect.stringMatching(/^MANAGER_REVOKE_(RETRY_REQUIRED|DRAIN_PENDING)$/) });
      expect(((await pool.query("SELECT grant_fact FROM portal_access_grants_v2 WHERE grant_id=$1", [read.grant_id])).rows[0].grant_fact).revoked_at_ms).toBeNull();
    } finally { await reader.query("ROLLBACK"); reader.release(); }
    const receipts = await access.revokeReviewedManagerDomainGrants(await artifact([item(read)], "TEST_ONLY-pg-2"));
    expect(receipts[0]!.outcome).toBe("REVOKED");
  });

  it("a read that arrives while a revoke holds the authority lock does not authorize (bounded lock timeout, never a stale allow)", async () => {
    const holder = await pool.connect();
    try {
      await holder.query("BEGIN");
      await holder.query("SELECT singleton FROM elp210_candidate.authority WHERE singleton FOR UPDATE");
      await expect(withTransaction(pool, db => evaluateManagerDomainRead(db, request()))).rejects.toBeTruthy();
    } finally { await holder.query("ROLLBACK"); holder.release(); }
    await expect(withTransaction(pool, db => evaluateManagerDomainRead(db, request()))).resolves.toMatchObject({ grant_id: read.grant_id });
  });
});
