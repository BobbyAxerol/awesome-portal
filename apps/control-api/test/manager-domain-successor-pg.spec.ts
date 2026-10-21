/** Disposable PostgreSQL + genuine coordinator/triggers; SYNTHETIC authority,
 * not a real source/read/window receipt. No production/stable DB is accepted. */
import { createHash, generateKeyPairSync, randomUUID } from "node:crypto";
import { readFile, lstat, open } from "node:fs/promises";
import { join } from "node:path";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthService } from "../src/auth/auth.service";
import { withTransaction } from "../src/db/pool";
import { ExecutionAccessService } from "../src/execution-v2/access.service";
import { AccessRepository } from "../src/execution-v2/access.repository";
import { accessDigest } from "../src/execution-v2/access-digest";
import { unqualifiedAccessTrust } from "../src/execution-v2/access-trust";
import { CurrentHumanCandidate, type CurrentHumanCandidateConfig } from "../src/execution-v2/current-human-candidate";
import { CurrentHumanMutations } from "../src/execution-v2/current-human-mutations";
import { evaluateManagerDomainRead, evaluateManagerDomainStream } from "../src/execution-v2/current-human-snapshot";
import { readPinnedManagerSuccessor, MANAGER_SUCCESSOR_SCHEMA, type ManagerSuccessorDocument,
  type ManagerSuccessorPin } from "../src/execution-v2/manager-domain-successor";
import { migrateTestDatabase, truncateAll } from "./harness";
import type { ManagerDomainGrant, ReviewedAccessPolicy } from "../src/execution-v2/access.contract";

vi.mock("node:fs/promises", async original => ({ ...await original<typeof import("node:fs/promises")>(), lstat: vi.fn(), open: vi.fn() }));
const DATABASE = process.env.TEST_DATABASE_URL;
describe.skipIf(!DATABASE)("successor writer real disposable PG (synthetic authority, no connected acceptance)", () => {
  let pool: Pool, access: ExecutionAccessService, owner: string, workspace: string, session: string;
  let policy: ReviewedAccessPolicy, read: ManagerDomainGrant, stream: ManagerDomainGrant, pin: ManagerSuccessorPin;
  const domain = { profile_id: "TEST_ONLY-profile", catalogue_sha256: "1".repeat(64), profile_sha256: "2".repeat(64), field_policy_sha256: "3".repeat(64) };
  const request = () => ({ actor: { user_id: owner, session_id: session, session_generation: 7 },
    workspace_id: workspace, environment: "paper" as const, domain });
  beforeAll(async () => {
    if (!DATABASE?.includes("control-api-test-postgres-") || !DATABASE.endsWith("/portal_control_test"))
      throw new Error("DISPOSABLE_DATABASE_REQUIRED");
    await migrateTestDatabase(DATABASE);
    pool = new Pool({ connectionString: DATABASE, max: 4, connectionTimeoutMillis: 2000, query_timeout: 6000 });
    await truncateAll(pool);
  });
  beforeEach(async () => {
    const suffix = randomUUID(), now = Date.now();
    owner = "TEST_ONLY-owner-" + suffix; workspace = "TEST_ONLY-ws-" + suffix; session = "TEST_ONLY-session-" + suffix;
    await pool.query(`INSERT INTO portal_users(user_id,username,display_name,role,status,must_change_password,session_version)
      VALUES($1,$1,'TEST_ONLY','ADMIN','ACTIVE',false,7)`, [owner]);
    await pool.query("INSERT INTO portal_owner_anchor(anchor_id,user_id) VALUES('PORTAL_OWNER',$1)", [owner]);
    await pool.query("INSERT INTO workspaces(workspace_id,name,owner_user_id) VALUES($1,'TEST_ONLY',$2)", [workspace, owner]);
    await pool.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'MEMBER')", [workspace, owner]);
    await pool.query(`INSERT INTO auth_sessions(session_id,session_token_hash,user_id,state,csrf_secret_hash,session_version,idle_expires_at,absolute_expires_at)
      VALUES($1,$1,$2,'ACTIVE','TEST_ONLY',7,clock_timestamp()+interval '30 minutes',clock_timestamp()+interval '60 minutes')`, [session, owner]);
    policy = { workspace_id: workspace, revision: "TEST_ONLY-policy-1", artifact_digest: accessDigest("TEST_ONLY-old"),
      approval_ref: "TEST_ONLY-NOT-REAL", state: "REVIEWED", qualification: "OWNER_VERIFIED", protected_owner_user_id: owner,
      researcher_fields: { state: "PENDING", policy_ref: null, fields: [] }, manager_read_domains: [{ environment: "paper", domain,
        field_policy_ref: "TEST_ONLY-fields", valid_from_ms: now - 60_000, valid_until_ms: now - 10_000 }] };
    const grant = (id: string, action: ManagerDomainGrant["action"]): ManagerDomainGrant => ({ schema_version: "portal.manager-domain-grant.v1",
      grant_id: id + suffix, workspace_id: workspace, subject_user_id: owner, issued_by: owner, parent_grant_id: null,
      revision: "TEST_ONLY-grant-old", policy_revision: policy.revision, action, effect: "ALLOW", environment: "paper", domain,
      field_policy_ref: "TEST_ONLY-fields", valid_from_ms: now - 50_000, valid_until_ms: now - 20_000, revoked_at_ms: null });
    read = grant("TEST_ONLY-read-", "business.read_all"); stream = grant("TEST_ONLY-stream-", "stream.subscribe");
    const repo = new AccessRepository(pool);
    await repo.putPolicy(policy); await repo.saveManagerDomainGrant(read, true); await repo.saveManagerDomainGrant(stream, true);
    const actual = (await pool.query(`SELECT current_database() AS name,current_user AS role,(pg_control_system()).system_identifier::text AS system`)).rows[0];
    pin = { artifact_path: "/root/TEST_ONLY-successor.json", approved_sha256: "0".repeat(64), not_before_ms: now - 1000,
      not_after_ms: now + 119_000, maximum_grant_ms: 120_000, source_expires_at_ms: now + 180_000,
      target: { database_name: actual.name, database_system_identifier: actual.system, role_name: actual.role,
        workspace_id: workspace, protected_owner_user_id: owner, principal_workspace_pins: [{ user_id: owner, workspace_id: workspace }] } };
    await pool.query(await readFile(join(__dirname, "../src/execution-v2/current-human-candidate.sql"), "utf8"));
    const source = generateKeyPairSync("ed25519"), human = generateKeyPairSync("ed25519");
    const candidate = await CurrentHumanCandidate.create(pool, { issuer: "TEST_ONLY-core", audience: "TEST_ONLY-pm", key_id: "TEST_ONLY-human",
      private_key: human.privateKey, source: { issuer: "TEST_ONLY-pm", audience: "TEST_ONLY-authority", key_id: "TEST_ONLY-source",
        public_key: source.publicKey, workload_id: "TEST_ONLY-workload" }, limits: { ttl_ms: 30_000, maximum_unresolved: 3, maximum_retained: 16 } } as unknown as CurrentHumanCandidateConfig);
    const coordinator = new CurrentHumanMutations(pool, candidate, { recover: async () => undefined }, { maximum_intents: 16, maximum_recoveries_per_request: 3 });
    access = new ExecutionAccessService(pool, {} as AuthService, unqualifiedAccessTrust, false, coordinator);
  });
  afterEach(async () => { vi.restoreAllMocks(); await pool.query("DROP SCHEMA IF EXISTS elp210_candidate CASCADE"); await truncateAll(pool); });
  afterAll(async () => { await pool?.end(); });

  function document(id = randomUUID(), both = true): ManagerSuccessorDocument {
    const next: ReviewedAccessPolicy = { ...structuredClone(policy), revision: "TEST_ONLY-policy-2", artifact_digest: accessDigest("TEST_ONLY-new"),
      manager_read_domains: policy.manager_read_domains!.map(s => ({ ...s, valid_from_ms: pin.not_before_ms, valid_until_ms: pin.not_after_ms })) };
    return { schema_version: MANAGER_SUCCESSOR_SCHEMA, successor_id: id, target: pin.target, approval_ref: "TEST_ONLY-NOT-REAL", provenance_ref: "TEST_ONLY",
      expected_policy: { revision: policy.revision, digest: accessDigest(policy) }, policy: next,
      grants: (both ? [read, stream] : [read]).map(g => ({ predecessor_grant_id: g.grant_id, expected_revision: g.revision, expected_digest: accessDigest(g),
        grant: { ...g, grant_id: g.grant_id + "-next", revision: "TEST_ONLY-new-grant", policy_revision: next.revision,
          valid_from_ms: pin.not_before_ms, valid_until_ms: pin.not_after_ms } })) };
  }
  async function token(doc: ManagerSuccessorDocument) {
    const bytes = Buffer.from(JSON.stringify(doc)), stat = { uid: 0, mode: 0o100600, ino: 5, dev: 1, size: bytes.length, isFile: () => true, isSymbolicLink: () => false };
    vi.mocked(lstat).mockResolvedValue(stat as never);
    vi.mocked(open).mockImplementation((async () => {
      let done = false;
      return { stat: async () => stat, close: async () => undefined, read: async (buffer: Buffer, start: number) => {
        if (done) return { bytesRead: 0, buffer }; done = true; bytes.copy(buffer, start); return { bytesRead: bytes.length, buffer }; } };
    }) as never);
    return readPinnedManagerSuccessor({ ...pin, approved_sha256: createHash("sha256").update(bytes).digest("hex") }, Date.now());
  }
  const invoke = async (doc: ManagerSuccessorDocument) => access.installReviewedManagerDomainSuccessor(await token(doc));
  const count = async () => Number((await pool.query("SELECT count(*) AS n FROM portal_access_grants_v2")).rows[0].n);

  it("appends READ/STREAM with immutable predecessor/audit and unchanged owner/session; historical replay never reactivates revoked grants", async () => {
    const before = accessDigest((await pool.query("SELECT * FROM auth_sessions ORDER BY session_id")).rows);
    const doc = document(), receipt = await invoke(doc);
    await expect(withTransaction(pool, db => evaluateManagerDomainRead(db, request()))).resolves.toMatchObject({ grant_id: doc.grants[0]!.grant.grant_id });
    await expect(withTransaction(pool, db => evaluateManagerDomainStream(db, request()))).resolves.toBeDefined();
    expect(await count()).toBe(4);
    expect((await new AccessRepository(pool).storedGrants(workspace)).slice(0, 4).filter(g => [read.grant_id, stream.grant_id].includes(g.fact.grant_id)).map(g => g.fact))
      .toEqual(expect.arrayContaining([read, stream]));
    expect(accessDigest((await pool.query("SELECT * FROM auth_sessions ORDER BY session_id")).rows)).toBe(before);
    expect(await invoke(doc)).toEqual(receipt); expect(await count()).toBe(4);
    // Disposable fixture creates a later legitimate narrowing under the SAME
    // coordinator; no bypass of guarded authority writes even in this test.
    const next = doc.grants[0]!.grant;
    const mutations = (access as unknown as { authorityMutations: CurrentHumanMutations }).authorityMutations;
    await mutations.executeVerified({ family: "REVIEWED_POLICY", operation: "REVOKE_MANAGER_GRANT", key_digest: accessDigest("TEST_ONLY-revoke"),
      request_digest: accessDigest("TEST_ONLY-revoke"), target_id: workspace }, {
      authorize: async () => undefined,
      apply: async db => { await new AccessRepository(db).saveManagerDomainGrant({ ...next, revision: "TEST_ONLY-revoked", revoked_at_ms: Date.now() }); return "TEST_ONLY"; },
      terminal: () => ({ outcome: "APPLIED", receipt_ref: "TEST_ONLY-revoke", reason_code: null }),
    });
    expect(await invoke(doc)).toEqual(receipt);
    await expect(withTransaction(pool, db => evaluateManagerDomainRead(db, request()))).rejects.toBeTruthy();
    await expect(pool.query("DELETE FROM portal_access_policy_events WHERE workspace_id=$1", [workspace])).rejects.toThrow(/immutable/);
  });
  it("READ alone does not create STREAM", async () => {
    const doc = document(randomUUID(), false); await invoke(doc);
    await expect(withTransaction(pool, db => evaluateManagerDomainRead(db, request()))).resolves.toBeDefined();
    await expect(withTransaction(pool, db => evaluateManagerDomainStream(db, request()))).rejects.toBeTruthy();
    expect(await count()).toBe(3);
  });
  it("later STREAM uses the current seal without invalidating READ installed by the preceding policy advance", async () => {
    const readDoc = document(randomUUID(), false);
    await invoke(readDoc);
    await expect(withTransaction(pool, db => evaluateManagerDomainStream(db, request()))).rejects.toBeTruthy();
    const repo = new AccessRepository(pool), current = (await repo.policy(workspace))!;
    const retainedRead = (await repo.storedGrants(workspace)).find(g => g.fact.grant_id === readDoc.grants[0]!.grant.grant_id)!.fact;
    const beforeSessions = accessDigest((await pool.query("SELECT * FROM auth_sessions ORDER BY session_id")).rows);
    const streamDoc = document();
    streamDoc.expected_policy = { revision: current.revision, digest: accessDigest(current) };
    streamDoc.policy = current;
    streamDoc.grants = streamDoc.grants.filter(g => g.grant.action === "stream.subscribe");
    await invoke(streamDoc);
    await expect(withTransaction(pool, db => evaluateManagerDomainRead(db, request()))).resolves.toBeDefined();
    await expect(withTransaction(pool, db => evaluateManagerDomainStream(db, request()))).resolves.toBeDefined();
    expect(await count()).toBe(4);
    expect((await repo.storedGrants(workspace)).find(g => g.fact.grant_id === retainedRead.grant_id)!.fact).toEqual(retainedRead);
    expect((await repo.policy(workspace))!).toEqual(current);
    expect(accessDigest((await pool.query("SELECT * FROM auth_sessions ORDER BY session_id")).rows)).toBe(beforeSessions);
  });
  it.each(["policy", "grant", "target"])("refuses stale %s before writes", async axis => {
    const doc = document();
    if (axis === "policy") doc.expected_policy.digest = accessDigest("TEST_ONLY-wrong");
    if (axis === "grant") doc.grants[0]!.expected_revision = "TEST_ONLY-stale";
    if (axis === "target") doc.target = { ...doc.target, database_system_identifier: "99999" };
    await expect(invoke(doc)).rejects.toBeTruthy(); expect(await count()).toBe(2);
    expect((await new AccessRepository(pool).policy(workspace))!.revision).toBe(policy.revision);
  });
  it("same successor identity/different bytes conflicts; two competing successors cannot both commit", async () => {
    const a = document(), b = document();
    b.policy.revision = "TEST_ONLY-policy-3";
    b.grants = b.grants.map(e => ({ ...e, grant: { ...e.grant, grant_id: e.grant.grant_id + "-other", policy_revision: b.policy.revision } }));
    const ta = await token(a), tb = await token(b);
    const result = await Promise.allSettled([access.installReviewedManagerDomainSuccessor(ta), access.installReviewedManagerDomainSuccessor(tb)]);
    expect(result.filter(r => r.status === "fulfilled")).toHaveLength(1); expect(await count()).toBe(4);
    const winner = result[0]!.status === "fulfilled" ? a : b;
    await expect(invoke({ ...winner, provenance_ref: "TEST_ONLY-different-bytes" })).rejects.toMatchObject({ code: "MANAGER_SUCCESSOR_KEY_CONFLICT" });
  });
  it("UNKNOWN source custody remains unresolved; no successor receipt or grant is synthesized", async () => {
    const now = Date.now();
    await pool.query(`INSERT INTO elp210_candidate.leases(lease_id,authority_revision,subject_id,session_id,session_revision,workspace_id,
      environment,workload_id,request_digest,authority_fingerprint,issued_at_ms,expires_at_ms,phase,attempt_id)
      VALUES($1,0,$2,$3,7,$4,'paper','TEST_ONLY-workload',$5,$5,$6,$7,'UNKNOWN',$8)`,
    [randomUUID(), owner, session, workspace, accessDigest("TEST_ONLY-unresolved"), now, now + 30_000, randomUUID()]);
    await expect(invoke(document())).rejects.toMatchObject({ code: "MANAGER_SUCCESSOR_RETRY_REQUIRED" });
    expect(await count()).toBe(2);
    expect((await pool.query("SELECT phase FROM elp210_candidate.leases")).rows).toEqual([{ phase: "UNKNOWN" }]);
    expect((await pool.query("SELECT count(*)::int AS n FROM portal_access_policy_events")).rows[0].n).toBe(0);
  });
  it("window expiring after actual grant/event inserts rolls back everything before COMMIT", async () => {
    const doc = document(), verified = await token(doc), original = AccessRepository.prototype.event;
    vi.spyOn(AccessRepository.prototype, "event").mockImplementationOnce(async function (event) {
      await original.call(this, event);
      vi.spyOn(Date, "now").mockReturnValue(pin.not_after_ms);
    });
    await expect(access.installReviewedManagerDomainSuccessor(verified)).rejects.toMatchObject({ code: "MANAGER_SUCCESSOR_WINDOW_EXPIRED" });
    expect(await count()).toBe(2);
    expect((await new AccessRepository(pool).policy(workspace))!.revision).toBe(policy.revision);
    expect((await pool.query("SELECT count(*)::int AS n FROM portal_access_policy_events")).rows[0].n).toBe(0);
  });
});
