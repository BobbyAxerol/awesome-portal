/** Real disposable PostgreSQL + REAL current-human mutation coordinator.
 * Principals, signing keys and root-file bytes are TEST_ONLY synthetic. The
 * filesystem boundary is mocked; this proves no installed/source authority. */
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { generateKeyPair } from "jose";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { withTransaction } from "../src/db/pool";
import { CurrentHumanCandidate } from "../src/execution-v2/current-human-candidate";
import { CurrentHumanMutations } from "../src/execution-v2/current-human-mutations";
import { buildAccessProfileArtifact, type AccessProfileBuildInput } from "../src/execution-v2/access-profile-artifact";
import { OrdinaryProfileAuthority, OrdinaryProfileAuthorityRepository, ordinaryAuthorityStateDigest,
  readPinnedOrdinaryProfileInstall } from "../src/execution-v2/ordinary-profile-authority";
import { readRootOwnedPinnedFile } from "../src/execution-v2/private-root-file";
import { accessDigest } from "../src/execution-v2/access-digest";
import type { AccessActor } from "../src/execution-v2/access.contract";
import { migrateTestDatabase } from "./harness";
import { CHILD, DOMAIN, OWNER, STAN } from "./ordinary-profile-authority-fixture";

vi.mock("../src/execution-v2/private-root-file", async original => ({
  ...await original<typeof import("../src/execution-v2/private-root-file")>(), readRootOwnedPinnedFile: vi.fn(),
}));
const DATABASE = process.env.TEST_DATABASE_URL;
const databaseName = `ordinary_${randomUUID().replaceAll("-", "")}`;
function url(name: string): string { const value = new URL(DATABASE!); value.pathname = `/${name}`; return value.toString(); }
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
describe.skipIf(!DATABASE)("ordinary authority real PG/CAS/coordinator, TEST_ONLY facts", () => {
  let pool: Pool, authority: OrdinaryProfileAuthority, workspace: string, input: AccessProfileBuildInput;
  let stan: AccessActor, owner: AccessActor, child: AccessActor, target: AccessProfileBuildInput["target"];
  let created = false;
  const state = () => withTransaction(pool, db => new OrdinaryProfileAuthorityRepository(db).load(workspace));
  async function token(next: AccessProfileBuildInput, operation: "BOOTSTRAP" | "RENEW" | "HOT_ADD" = "BOOTSTRAP",
    current: ReturnType<typeof buildAccessProfileArtifact> | null = null, id = randomUUID()) {
    const before = await state();
    const document = { schema_version: "portal.ordinary-profile-install.v1", operation_id: id,
      lifecycle: { schema_version: "portal.ordinary-profile-lifecycle.v1", operation,
        expected_current_sha256: current?.sha256 ?? null, next }, current_artifact_bytes: current?.bytes ?? null,
      expected_head: before && { revision: before.head.revision, digest: before.digest }, administrator_user_ids: [STAN] };
    const bytes = JSON.stringify(document);
    vi.mocked(readRootOwnedPinnedFile).mockImplementation(async (_path, expected) => {
      if (expected !== sha(bytes)) throw new Error("TEST_ONLY_PIN_MISMATCH"); return Buffer.from(bytes);
    });
    return readPinnedOrdinaryProfileInstall({ artifact_path: "/TEST_ONLY/ordinary-owner-artifact.json", approved_sha256: sha(bytes),
      target, not_before_ms: Date.now() - 60_000, not_after_ms: Date.now() + 600_000 });
  }
  beforeAll(async () => {
    const admin = new Pool({ connectionString: url("postgres") });
    try { await admin.query(`CREATE DATABASE ${databaseName}`); created = true; } finally { await admin.end(); }
    await migrateTestDatabase(url(databaseName));
    pool = new Pool({ connectionString: url(databaseName), max: 4, connectionTimeoutMillis: 2000, query_timeout: 6000 });
    for (const id of [OWNER, STAN, CHILD]) await pool.query(`INSERT INTO portal_users
      (user_id,username,display_name,role,status,must_change_password,session_version)
      VALUES($1,$1,'TEST_ONLY','USER','ACTIVE',false,7)`, [id]);
    await pool.query("INSERT INTO portal_owner_anchor(anchor_id,user_id) VALUES('PORTAL_OWNER',$1)", [OWNER]);
    await pool.query(await readFile(join(__dirname, "../src/execution-v2/current-human-candidate.sql"), "utf8"));
    const human = await generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true });
    const source = await generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true });
    const candidate = await CurrentHumanCandidate.create(pool, {
      issuer: "TEST_ONLY-ordinary-core", audience: "TEST_ONLY-source", key_id: "TEST_ONLY-human-key", private_key: human.privateKey,
      source: { issuer: "TEST_ONLY-source", audience: "TEST_ONLY-ordinary-core", key_id: "TEST_ONLY-source-key",
        public_key: source.publicKey, workload_id: "TEST_ONLY-workload" },
      limits: { ttl_ms: 30_000, maximum_unresolved: 8, maximum_retained: 128 },
    });
    const mutations = new CurrentHumanMutations(pool, candidate, { recover: async () => { throw new Error("NO_TEST_SOURCE"); } },
      { maximum_intents: 128, maximum_recoveries_per_request: 1 });
    authority = new OrdinaryProfileAuthority(pool, mutations);
  }, 120_000);
  beforeEach(async () => {
    workspace = `TEST_ONLY-ordinary-${randomUUID()}`;
    await pool.query("INSERT INTO workspaces(workspace_id,name,owner_user_id) VALUES($1,'TEST_ONLY',$2)", [workspace, OWNER]);
    for (const id of [OWNER, STAN, CHILD]) await pool.query(
      "INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'MEMBER')", [workspace, id]);
    const actor = async (user_id: string): Promise<AccessActor> => {
      const session_id = `TEST_ONLY-session-${randomUUID()}`;
      await pool.query(`INSERT INTO auth_sessions(session_id,session_token_hash,user_id,state,csrf_secret_hash,
        session_version,idle_expires_at,absolute_expires_at) VALUES($1,$1,$2,'ACTIVE','TEST_ONLY',7,
        clock_timestamp()+interval '10 minutes',clock_timestamp()+interval '20 minutes')`, [session_id, user_id]);
      await pool.query(`INSERT INTO owner_step_up_grants(step_up_id,session_id,user_id,expires_at)
        VALUES($1,$2,$3,clock_timestamp()+interval '5 minutes')`, [`stp_${randomUUID()}`, session_id, user_id]);
      return { user_id, session_id, session_generation: 7 };
    };
    owner = await actor(OWNER); stan = await actor(STAN); child = await actor(CHILD);
    const physical = (await pool.query(`SELECT current_database() AS db,session_user AS role,
      (pg_control_system()).system_identifier::text AS system_identifier`)).rows[0];
    target = { database_name: physical.db, database_system_identifier: physical.system_identifier, role_name: physical.role,
      protected_owner_user_id: OWNER, workspace_id: workspace,
      principal_workspace_pins: [OWNER, STAN, CHILD].map(user_id => ({ user_id, workspace_id: workspace })) };
    input = { schema_version: "portal.access-profile-input.v1", target, policy_revision: `TEST_ONLY-r1-${randomUUID()}`,
      approval_ref: "TEST_ONLY_APPROVAL", provenance_ref: "TEST_ONLY_PROVENANCE", valid_from_ms: Date.now() - 10_000,
      profiles: [{ profile_key: "paper", version: 1, namespace: "execution", environment: "paper", ...DOMAIN,
        field_policy_dir: "TEST_ONLY_fields" }], users: [
        { user_id: OWNER, role: "OWNER", granted_by: OWNER, profiles: "ALL" },
        { user_id: STAN, role: "ADMIN_READER", granted_by: OWNER, profiles: "ALL" },
      ] };
  });
  afterAll(async () => {
    await pool?.end();
    if (created) {
      const admin = new Pool({ connectionString: url("postgres") });
      try { await admin.query(`DROP DATABASE ${databaseName} WITH (FORCE)`); } finally { await admin.end(); }
    }
  });
  async function delegate() {
    const before = (await state())!, parent = before.grants.find(g => g.subject_user_id === STAN)!;
    const request = { operation_id: randomUUID(), workspace_id: workspace, subject_user_id: CHILD,
      parent_grant_id: parent.grant_id, expected_parent_revision: parent.revision,
      expected_head: { revision: before.head.revision, digest: before.digest }, valid_from_ms: Date.now() - 1000,
      valid_until_ms: Date.now() + 60_000, reason: "TEST_ONLY_CHILD_READ" };
    return { request, receipt: await authority.delegate(stan, request) };
  }
  it("installs via actual coordinator and preserves null legacy policy and policy_seen", async () => {
    const prepared = await token(input), ack = await authority.install(prepared);
    expect(ack).toMatchObject({ operation: "INSTALL", source_qualified: false, stream_commissioned: false });
    expect(await authority.install(prepared)).toEqual(ack);
    expect((await pool.query("SELECT 1 FROM portal_access_policy_state WHERE workspace_id=$1", [workspace])).rowCount).toBe(0);
    expect((await pool.query("SELECT 1 FROM portal_access_policy_events WHERE workspace_id=$1", [workspace])).rowCount).toBe(0);
    const event = (await pool.query("SELECT key_digest FROM portal_ordinary_profile_events WHERE workspace_id=$1", [workspace])).rows[0];
    expect((await pool.query("SELECT state FROM elp210_candidate.mutations WHERE key_digest=$1", [event.key_digest])).rows[0].state).toBe("FINISHED");
    const decision = await authority.read(stan, workspace, "paper", DOMAIN.profile_id);
    expect(decision).toMatchObject({ actor: stan, domain: DOMAIN, head_revision: ack.head_revision });
    expect(Object.isFrozen(decision)).toBe(true);
    expect(await authority.confirmMany([decision!])).not.toBeNull();
    expect(await authority.confirmMany([{ ...decision! }])).toBeNull();
  });
  it.each(["database_name", "database_system_identifier", "role_name"] as const)(
    "refuses a consistently digested copied head with a different physical %s", async field => {
      await authority.install(await token(input));
      const decision = await authority.read(stan, workspace, "paper", DOMAIN);
      expect(decision).not.toBeNull();
      await withTransaction(pool, async db => {
        const repo = new OrdinaryProfileAuthorityRepository(db), before = (await repo.load(workspace))!;
        // Model a copied/restored head rather than malformed bytes: owner,
        // principals and grants stay exact, and the head digest stays valid.
        const head = { ...before.head, revision: `TEST_ONLY-copied-head-${randomUUID()}`,
          target: { ...before.head.target, [field]: field === "database_system_identifier"
            ? `${target.database_system_identifier === "1" ? 2 : 1}` : `TEST_ONLY-foreign-${field}` } };
        await repo.cas(before, head, ordinaryAuthorityStateDigest(head, before.grants, before.revocations));
      });
      expect((await state())!.head.target[field]).not.toBe(target[field]);
      await expect(authority.read(stan, workspace, "paper", DOMAIN))
        .rejects.toMatchObject({ code: "ORDINARY_AUTHORITY_TARGET_MISMATCH" });
      await expect(authority.confirmMany([decision!]))
        .rejects.toMatchObject({ code: "ORDINARY_AUTHORITY_TARGET_MISMATCH" });
    });
  it("delegates, replays exactly, revokes an ancestor and does not repair children on old install replay", async () => {
    const prepared = await token(input); await authority.install(prepared);
    const { request, receipt } = await delegate();
    expect(await authority.delegate(stan, request)).toEqual(receipt);
    const old = await authority.read(child, workspace, "paper", DOMAIN);
    expect(old?.grant_id).toBe(receipt.grant_id);
    const before = (await state())!, parent = before.grants.find(g => g.subject_user_id === STAN)!;
    const revoke = { operation_id: randomUUID(), workspace_id: workspace, grant_id: parent.grant_id,
      expected_grant_revision: parent.revision, expected_head: { revision: before.head.revision, digest: before.digest }, reason: "TEST_ONLY_REVOKE" };
    await authority.revoke(owner, revoke);
    expect(await authority.read(child, workspace, "paper", DOMAIN)).toBeNull();
    expect(await authority.confirmMany([old!])).toBeNull();
    await authority.install(prepared);
    expect(await authority.read(child, workspace, "paper", DOMAIN)).toBeNull();
    expect((await pool.query("SELECT count(*)::int AS n FROM portal_ordinary_profile_events WHERE workspace_id=$1", [workspace])).rows[0].n).toBe(3);
    expect((await pool.query("SELECT 1 FROM portal_access_policy_events WHERE workspace_id=$1", [workspace])).rowCount).toBe(0);
  });
  it("same-head concurrent delegate commands have exactly one durable winner", async () => {
    await authority.install(await token(input));
    const before = (await state())!, parent = before.grants.find(g => g.subject_user_id === STAN)!;
    const request = { operation_id: randomUUID(), workspace_id: workspace, subject_user_id: CHILD, parent_grant_id: parent.grant_id,
      expected_parent_revision: parent.revision, expected_head: { revision: before.head.revision, digest: before.digest },
      valid_from_ms: Date.now() - 1000, valid_until_ms: Date.now() + 60_000, reason: "TEST_ONLY_CAS" };
    const results = await Promise.allSettled([authority.delegate(stan, request),
      authority.delegate(stan, { ...request, operation_id: randomUUID() })]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect((await state())!.grants.filter(g => g.subject_user_id === CHILD)).toHaveLength(1);
  });
  it("renewal/hot-add append real ordinary facts, independently of native policy revision", async () => {
    await authority.install(await token(input));
    const previous = buildAccessProfileArtifact(input);
    const renewed = { ...input, policy_revision: `TEST_ONLY-r2-${randomUUID()}`, valid_from_ms: input.valid_from_ms + 1000 };
    await authority.install(await token(renewed, "RENEW", previous));
    const current = buildAccessProfileArtifact(renewed);
    const hot = { ...renewed, policy_revision: `TEST_ONLY-r3-${randomUUID()}`, profiles: [
      ...(renewed.profiles as Exclude<AccessProfileBuildInput["profiles"], string>),
      { profile_key: "sandbox", version: 1, namespace: "execution", environment: "sandbox" as const, ...DOMAIN,
        profile_id: "TEST_ONLY_SANDBOX", field_policy_dir: "TEST_ONLY_sandbox_fields" },
    ] };
    await authority.install(await token(hot, "HOT_ADD", current));
    expect((await state())!.grants).toHaveLength(8);
    expect(await authority.read(stan, workspace, "paper", DOMAIN.profile_id)).not.toBeNull();
    expect(await authority.read(stan, workspace, "sandbox", "TEST_ONLY_SANDBOX")).not.toBeNull();
  });
  it("refuses owner revoke, employee self-elevation and a proof belonging to another session", async () => {
    await authority.install(await token(input));
    const before = (await state())!, root = before.grants.find(g => g.subject_user_id === OWNER)!;
    await expect(authority.revoke(owner, { operation_id: randomUUID(), workspace_id: workspace, grant_id: root.grant_id,
      expected_grant_revision: root.revision, expected_head: { revision: before.head.revision, digest: before.digest }, reason: "TEST_ONLY" }))
      .rejects.toBeDefined();
    const { request } = await delegate();
    await expect(authority.delegate(child, { ...request, operation_id: randomUUID() })).rejects.toBeDefined();
    const otherSession = { ...stan, session_id: child.session_id };
    await expect(authority.delegate(otherSession, { ...request, operation_id: randomUUID() })).rejects.toBeDefined();
  });
  it("CAS conflict rolls back an appended grant in the SAME PostgreSQL transaction", async () => {
    await authority.install(await token(input)); const before = (await state())!;
    const added = { ...before.grants[0]!, grant_id: `TEST_ONLY-rollback-${randomUUID()}` };
    await expect(withTransaction(pool, async db => {
      const repo = new OrdinaryProfileAuthorityRepository(db); await repo.append(added);
      await repo.cas({ ...before, digest: accessDigest("TEST_ONLY-stale") }, before.head,
        ordinaryAuthorityStateDigest(before.head, [...before.grants, added], []));
    })).rejects.toMatchObject({ code: "ORDINARY_AUTHORITY_REVISION_CONFLICT" });
    expect((await pool.query("SELECT 1 FROM portal_ordinary_profile_grants WHERE grant_id=$1", [added.grant_id])).rowCount).toBe(0);
  });
  it("immutable grants/events reject UPDATE/DELETE/TRUNCATE and raw writes respect a foreign pending drain", async () => {
    await authority.install(await token(input));
    await expect(pool.query("UPDATE portal_ordinary_profile_grants SET revision='TEST_ONLY-changed' WHERE workspace_id=$1", [workspace])).rejects.toBeDefined();
    await expect(pool.query("DELETE FROM portal_ordinary_profile_events WHERE workspace_id=$1", [workspace])).rejects.toBeDefined();
    await expect(pool.query("TRUNCATE portal_ordinary_profile_events")).rejects.toBeDefined();
    const before = (await state())!, added = { ...before.grants[0]!, grant_id: `TEST_ONLY-foreign-drain-${randomUUID()}` };
    await withTransaction(pool, async db => {
      const id = randomUUID();
      await db.query(`INSERT INTO elp210_candidate.mutations(mutation_id,key_digest,binding_digest,replay_digest,family)
        VALUES($1,$2,$3,$3,'REVIEWED_POLICY')`, [id, accessDigest(id), accessDigest("TEST_ONLY-drain")]);
      await db.query("UPDATE elp210_candidate.authority SET drain_id=$1 WHERE singleton", [id]);
      await db.query("SAVEPOINT ordinary_guard_probe");
      await expect(new OrdinaryProfileAuthorityRepository(db).append(added)).rejects.toThrow("CURRENT_HUMAN_DRAIN_COORDINATOR_REQUIRED");
      await db.query("ROLLBACK TO SAVEPOINT ordinary_guard_probe");
      // Leave no invented permanent drain behind: this is one rollback-only probe.
      throw new Error("TEST_ONLY_ROLLBACK_DRAIN_PROBE");
    }).catch(e => { expect(e.message).toBe("TEST_ONLY_ROLLBACK_DRAIN_PROBE"); });
  });
  it("a real unresolved obligation blocks direct ordinary writes until a real settlement, never TTL", async () => {
    await authority.install(await token(input));
    const before = (await state())!, added = { ...before.grants[0]!, grant_id: `TEST_ONLY-obligation-${randomUUID()}` };
    await expect(withTransaction(pool, async db => {
      const now = Date.now(), revision = (await db.query("SELECT revision FROM elp210_candidate.authority WHERE singleton")).rows[0].revision;
      await db.query(`INSERT INTO elp210_candidate.leases(lease_id,authority_revision,subject_id,session_id,session_revision,
        workspace_id,environment,workload_id,request_digest,authority_fingerprint,issued_at_ms,expires_at_ms)
        VALUES($1,$2,$3,$4,7,$5,'paper','TEST_ONLY-workload',$6,$6,$7,$8)`,
      [randomUUID(), revision, STAN, stan.session_id, workspace, accessDigest("TEST_ONLY-obligation"), now - 60_000, now - 1]);
      await db.query("SAVEPOINT ordinary_obligation_probe");
      await expect(new OrdinaryProfileAuthorityRepository(db).append(added)).rejects.toThrow("CURRENT_HUMAN_DRAIN_REQUIRED");
      await db.query("ROLLBACK TO SAVEPOINT ordinary_obligation_probe");
      throw new Error("TEST_ONLY_ROLLBACK_OBLIGATION_PROBE");
    })).rejects.toThrow("TEST_ONLY_ROLLBACK_OBLIGATION_PROBE");
  });
  it.each([-60_000, 60_000])("direct ordinary writes preserve independent native ROOT custody (expiry offset %i)", async offset => {
    await authority.install(await token(input));
    const before = (await state())!, added = { ...before.grants[0]!, grant_id: `TEST_ONLY-root-obligation-${randomUUID()}` };
    await expect(withTransaction(pool, async db => {
      const lease = randomUUID(), digest = accessDigest("TEST_ONLY-root-custody");
      // Synthetic custody facts exercise the SQL guard, not source signature or
      // settlement verification. No candidate obligation or pending drain exists.
      await db.query(`INSERT INTO portal_native_root_obligations
        (lease_id,attempt_id,purpose,source_config_digest,base_digest,base_body,phase,
         source_digest,source_fingerprint,source_expires_at)
        VALUES($1,$2,'QUALIFY',$3,$3,'TEST_ONLY','UNKNOWN',$4,$4,$5)`,
      [lease, randomUUID(), digest, sha("TEST_ONLY-root-source"), new Date(Date.now() + offset).toISOString()]);
      const probe = async () => {
        await db.query("SAVEPOINT ordinary_root_obligation_probe");
        await expect(new OrdinaryProfileAuthorityRepository(db).append(added)).rejects.toThrow("NATIVE_ROOT_DRAIN_REQUIRED");
        await db.query("ROLLBACK TO SAVEPOINT ordinary_root_obligation_probe");
      };
      await probe();
      await db.query(`UPDATE portal_native_root_obligations SET phase='ROLLED_BACK',terminal_receipt_id=$2,
        terminal_receipt_digest=$3,terminal_fact='{"TEST_ONLY":"rolled_back"}'::jsonb WHERE lease_id=$1`,
      [lease, randomUUID(), digest]);
      await probe(); // A durable terminal fact without source ACK still holds custody.
      await db.query(`UPDATE portal_native_root_obligations SET source_settled=true,source_ack_digest=$2 WHERE lease_id=$1`, [lease, digest]);
      await expect(new OrdinaryProfileAuthorityRepository(db).append(added)).resolves.toBeUndefined();
      throw new Error("TEST_ONLY_ROLLBACK_ROOT_OBLIGATION_PROBE");
    })).rejects.toThrow("TEST_ONLY_ROLLBACK_ROOT_OBLIGATION_PROBE");
  });
});
