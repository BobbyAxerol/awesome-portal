/** TEST_ONLY disposable fixture. Actual ordinary writer + current-human
 * coordinator; empty scripted C2 relations supply inventory coverage, NOT a
 * qualified C2 freeze/quarantine/source barrier. No runtime or owner files. */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { generateKeyPair } from "jose";
import type { Pool } from "pg";
import { buildAccessProfileArtifact } from "../src/execution-v2/access-profile-artifact";
import { CurrentHumanCandidate } from "../src/execution-v2/current-human-candidate";
import { CurrentHumanMutations } from "../src/execution-v2/current-human-mutations";
import { OrdinaryProfileAuthority, OrdinaryProfileAuthorityRepository, readPinnedOrdinaryProfileInstall }
  from "../src/execution-v2/ordinary-profile-authority";
import { RESTORE_C2_INVENTORY_TABLES } from "../src/execution-v2/restore-c2-inventory";
import { RESTORE_V2_TABLES } from "../src/execution-v2/restore-inventory";
import { withTransaction } from "../src/db/pool";
import type { AccessActor } from "../src/execution-v2/access.contract";
import { migrateTestDatabase } from "./harness";
import { CHILD, DOMAIN, OWNER, STAN } from "./ordinary-profile-authority-fixture";

export { CHILD, DOMAIN, OWNER, STAN };
export const WORKSPACE = "TEST_ONLY-ordinary-restore-workspace";
export const CHECKPOINT = "10000000-0000-4000-8000-000000000001";
export const OLD_OPERATION = "10000000-0000-4000-8000-000000000002";
export const FIRST_OPERATION = "10000000-0000-4000-8000-000000000003";
export const SECOND_OPERATION = "10000000-0000-4000-8000-000000000004";
export const FIRST_DRAIN = "restore_v2:10000000-0000-4000-8000-000000000005";
export const SECOND_DRAIN = "restore_v2:10000000-0000-4000-8000-000000000006";
export const SECRET_SENTINEL = "TEST_ONLY_RESTORE_SECRET_MUST_NOT_ESCAPE";
export const actor = (user_id: string): AccessActor => ({ user_id, session_id: `TEST_ONLY-restore-session-${user_id}`, session_generation: 7 });
export const rawSha = (value: string) => createHash("sha256").update(value).digest("hex");
export async function script(pool: Pool, file: string): Promise<void> {
  await pool.query(await readFile(join(__dirname, "../src/execution-v2", file), "utf8"));
}
export async function ordinary(pool: Pool): Promise<OrdinaryProfileAuthority> {
  const human = await generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true });
  const source = await generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true });
  const candidate = await CurrentHumanCandidate.create(pool, {
    issuer: "TEST_ONLY-ordinary-restore-core", audience: "TEST_ONLY-source", key_id: "TEST_ONLY-key", private_key: human.privateKey,
    source: { issuer: "TEST_ONLY-source", audience: "TEST_ONLY-ordinary-restore-core", key_id: "TEST_ONLY-source-key",
      public_key: source.publicKey, workload_id: "TEST_ONLY-workload" },
    limits: { ttl_ms: 30_000, maximum_unresolved: 8, maximum_retained: 128 },
  });
  return new OrdinaryProfileAuthority(pool, new CurrentHumanMutations(pool, candidate,
    { recover: async () => { throw new Error("TEST_ONLY_NO_EXTERNAL_SOURCE"); } },
    { maximum_intents: 128, maximum_recoveries_per_request: 1 }));
}
export async function state(pool: Pool) {
  return withTransaction(pool, db => new OrdinaryProfileAuthorityRepository(db).load(WORKSPACE));
}
export async function seed(pool: Pool, databaseUrl: string, pinnedFile: (bytes: string) => void): Promise<void> {
  await migrateTestDatabase(databaseUrl);
  await script(pool, "current-human-candidate.sql");
  for (const id of [OWNER, STAN, CHILD]) {
    await pool.query(`INSERT INTO portal_users(user_id,username,display_name,role,status,must_change_password,session_version)
      VALUES($1,$1,'TEST_ONLY','USER','ACTIVE',false,7)`, [id]);
    await pool.query(`INSERT INTO auth_sessions(session_id,session_token_hash,user_id,state,csrf_secret_hash,session_version,
      idle_expires_at,absolute_expires_at) VALUES($1,$2,$3,'ACTIVE',$2,7,clock_timestamp()+interval '30 minutes',
      clock_timestamp()+interval '1 hour')`, [actor(id).session_id, `${SECRET_SENTINEL}-${id}`, id]);
    await pool.query(`INSERT INTO owner_step_up_grants(step_up_id,session_id,user_id,expires_at)
      VALUES($1,$2,$3,clock_timestamp()+interval '30 minutes')`, [`TEST_ONLY-restore-proof-${id}`, actor(id).session_id, id]);
  }
  await pool.query("INSERT INTO portal_owner_anchor(anchor_id,user_id) VALUES('PORTAL_OWNER',$1)", [OWNER]);
  await pool.query("INSERT INTO workspaces(workspace_id,name,owner_user_id) VALUES($1,'TEST_ONLY',$2)", [WORKSPACE, OWNER]);
  for (const id of [OWNER, STAN, CHILD]) await pool.query(
    "INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'MEMBER')", [WORKSPACE, id]);
  await pool.query(`INSERT INTO password_credentials(credential_id,user_id,password_hash,algorithm,parameters_json)
    VALUES('TEST_ONLY-restore-credential',$1,$2,'argon2id','{}')`, [STAN, SECRET_SENTINEL]);
  const physical = (await pool.query(`SELECT current_database() AS db,session_user AS role,
    (pg_control_system()).system_identifier::text AS system_identifier`)).rows[0];
  const target = { database_name: physical.db, database_system_identifier: physical.system_identifier, role_name: physical.role,
    workspace_id: WORKSPACE, protected_owner_user_id: OWNER,
    principal_workspace_pins: [OWNER, STAN, CHILD].map(user_id => ({ user_id, workspace_id: WORKSPACE })) };
  const input = { schema_version: "portal.access-profile-input.v1" as const, target, policy_revision: "TEST_ONLY-restore-r1",
    approval_ref: "TEST_ONLY_APPROVAL", provenance_ref: "TEST_ONLY_PROVENANCE", valid_from_ms: Date.now() - 10_000,
    profiles: [{ profile_key: "paper", version: 1, namespace: "execution", environment: "paper" as const, ...DOMAIN,
      field_policy_dir: "TEST_ONLY-fields" }], users: [
      { user_id: OWNER, role: "OWNER" as const, granted_by: OWNER, profiles: "ALL" as const },
      { user_id: STAN, role: "ADMIN_READER" as const, granted_by: OWNER, profiles: "ALL" as const },
    ] };
  buildAccessProfileArtifact(input); // same canonical builder used by the actual intake
  const bytes = JSON.stringify({ schema_version: "portal.ordinary-profile-install.v1", operation_id: "TEST_ONLY-restore-install",
    lifecycle: { schema_version: "portal.ordinary-profile-lifecycle.v1", operation: "BOOTSTRAP", expected_current_sha256: null,
      next: input }, current_artifact_bytes: null, expected_head: null, administrator_user_ids: [STAN] });
  pinnedFile(bytes);
  const authority = await ordinary(pool);
  await authority.install(await readPinnedOrdinaryProfileInstall({ artifact_path: "/TEST_ONLY/restore-install.json",
    approved_sha256: rawSha(bytes), target, not_before_ms: Date.now() - 1000, not_after_ms: Date.now() + 600_000 }));
  const before = (await state(pool))!, parent = before.grants.find(g => g.subject_user_id === STAN)!;
  await authority.delegate(actor(STAN), { operation_id: "TEST_ONLY-restore-delegate", workspace_id: WORKSPACE,
    subject_user_id: CHILD, parent_grant_id: parent.grant_id, expected_parent_revision: parent.revision,
    expected_head: { revision: before.head.revision, digest: before.digest }, valid_from_ms: Date.now() - 1000,
    valid_until_ms: Date.now() + 600_000, reason: "TEST_ONLY_RESTORE_CHILD" });
  // Empty, deliberately scripted C2 inventory relations: no claim of a real
  // frozen writer, quarantine, external ACK reconciliation or floor authority.
  for (const table of RESTORE_C2_INVENTORY_TABLES.filter(name => !(RESTORE_V2_TABLES as readonly string[]).includes(name))) {
    const [schema] = table.split("."); await pool.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
    await pool.query(`CREATE TABLE ${table}(test_only_value text${table.endsWith("b2_attempts") ? ",state text" : ""})`);
  }
}
