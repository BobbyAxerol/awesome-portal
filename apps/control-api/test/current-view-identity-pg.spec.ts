/** Real migrated PostgreSQL identity/session/workspace JOIN + real scope mint.
 * Native publication, app policy and membership-source responses deliberately
 * reuse the shared TEST_ONLY product fixture: this is NOT financial-source,
 * Edge/mTLS, runtime commissioning or connected acceptance evidence.
 * Only the canonical disposable harness URL is accepted. This suite creates,
 * migrates and finally drops its OWN database; no shared table is truncated. */
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AuthService } from "../src/auth/auth.service";
import type { AuthSession } from "../src/domain";
import { AccessRepository } from "../src/execution-v2/access.repository";
import { CurrentViewAuthority, type CurrentViewSelection } from "../src/execution-v2/current-view-authority";
import type { ExecutionAccessService } from "../src/execution-v2/access.service";
import { ExecutionReadScopes, type ReadScopePrincipal } from "../src/execution-v2/read-scope";
import { productReadFixture } from "./elp2-product-read.fixture";
import { migrateTestDatabase, truncateAll } from "./harness";

const configured = process.env.TEST_DATABASE_URL;

describe.skipIf(!configured).sequential("current-view exact original identity on disposable PostgreSQL / TEST_ONLY source", () => {
  const databaseName = `elp210_current_view_${randomUUID().replaceAll("-", "")}`;
  const databasePattern = /^elp210_current_view_[a-f0-9]{32}$/u;
  let pool: Pool | undefined, created = false;
  let f: ReturnType<typeof productReadFixture>, principal: ReadScopePrincipal;
  let authority: CurrentViewAuthority, selection: CurrentViewSelection;
  const workload = "TEST_ONLY:current-view:pg-workload";
  const targetUrl = (database: string) => {
    const value = new URL(configured!);
    // Match the existing canonical harness guard, not an arbitrary DATABASE_URL
    // or a production/dev/Research connection supplied under another name.
    if (!/^control-api-test-postgres-[a-zA-Z0-9_-]+$/u.test(value.hostname) || value.pathname !== "/portal_control_test")
      throw new Error("CURRENT_VIEW_DISPOSABLE_DATABASE_REQUIRED");
    value.pathname = `/${database}`;
    return value.toString();
  };
  const db = () => {
    if (!pool || !created) throw new Error("CURRENT_VIEW_OWNED_DATABASE_REQUIRED");
    return pool;
  };
  const request = (registration: { original_context: string }) => ({
    original_context: registration.original_context, workload_id: workload,
    operation: "CURRENT" as const, resource_ref: selection.resource_ref,
  });
  const register = (actor = principal) => authority.register(actor, workload, selection, "CURRENT");
  const insertSession = async (sessionId: string, actor = principal.user.userId): Promise<AuthSession> => {
    const result = await db().query(`INSERT INTO auth_sessions
      (session_id,session_token_hash,user_id,state,csrf_secret_hash,session_version,idle_expires_at,absolute_expires_at)
      VALUES($1,$1,$2,'ACTIVE','TEST_ONLY_INERT_NOT_A_CREDENTIAL',1,
        clock_timestamp()+interval '30 minutes',clock_timestamp()+interval '1 hour')
      RETURNING session_id,user_id,state,session_version,created_at,idle_expires_at,absolute_expires_at`, [sessionId, actor]);
    const row = result.rows[0];
    return { sessionId: row.session_id, userId: row.user_id, state: row.state, sessionVersion: row.session_version,
      authenticationTime: row.created_at, idleExpiresAt: row.idle_expires_at, absoluteExpiresAt: row.absolute_expires_at };
  };

  beforeAll(async () => {
    if (!databasePattern.test(databaseName)) throw new Error("CURRENT_VIEW_OWNED_DATABASE_NAME_INVALID");
    const admin = new Pool({ connectionString: targetUrl("postgres"), max: 1, connectionTimeoutMillis: 2000 });
    try { await admin.query(`CREATE DATABASE ${databaseName}`); created = true; }
    finally { await admin.end(); }
    await migrateTestDatabase(targetUrl(databaseName));
    pool = new Pool({ connectionString: targetUrl(databaseName), max: 2,
      connectionTimeoutMillis: 2000, query_timeout: 6000 });
    expect((await db().query("SELECT current_database() AS name")).rows[0].name).toBe(databaseName);
  }, 120_000);

  beforeEach(async () => {
    // Guarded fresh database created above; never the harness's base database.
    await truncateAll(db());
    f = productReadFixture({ full: true });
    principal = structuredClone(f.principal) as ReadScopePrincipal;
    const owner = f.context.policy!.protected_owner_user_id;
    await db().query(`INSERT INTO portal_users
      (user_id,username,display_name,role,status,must_change_password,session_version)
      VALUES($1,$1,'TEST_ONLY actual actor','USER','ACTIVE',false,1),
        ($2,$2,'TEST_ONLY fixture policy owner','USER','ACTIVE',false,1)`, [principal.user.userId, owner]);
    await db().query("INSERT INTO workspaces(workspace_id,name,owner_user_id) VALUES($1,'TEST_ONLY owned identity test',$2)",
      [principal.workspaceId, owner]);
    await db().query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'MEMBER')",
      [principal.workspaceId, principal.user.userId]);
    // Deliberately do NOT anchor this actor as PORTAL_OWNER: removal of its
    // actual workspace membership must not pass through the owner exception.
    principal.session = await insertSession(principal.session.sessionId);
    const user = (await db().query("SELECT * FROM portal_users WHERE user_id=$1", [principal.user.userId])).rows[0];
    principal.user.createdAt = user.created_at;
    principal.user.updatedAt = user.updated_at;
    const now = Date.now();
    f.context.now_ms = now;
    f.context.actor_lease_until_ms = principal.session.idleExpiresAt.valueOf();
    for (const grant of f.context.grants) {
      grant.valid_from_ms = now - 1000;
      grant.valid_until_ms = principal.session.idleExpiresAt.valueOf();
      if (grant.ts_receipt) {
        grant.ts_receipt.effective_at_ms = now - 1000;
        grant.ts_receipt.expires_at_ms = principal.session.idleExpiresAt.valueOf();
      }
    }
    await new AccessRepository(db()).putPolicy(f.context.policy!);
    const dataset = { dataset_id: "TEST_ONLY:current-view:identity", source_revision: "TEST_ONLY:source-r1",
      projection_generation: "TEST_ONLY:generation-r1", catalogue_revision: "TEST_ONLY:catalogue-r1", window: null };
    selection = { resource_ref: "TEST_ONLY:current-view:root", binding: { environment: "paper",
      profileId: f.config.EXECUTION_EDGE_PAPER_PROFILE_ID! }, read_requirement: {
      action: "business.read_all", resource: { kind: "ROOT", id: "root" }, dataset }, fields: ["equity"] };
    const scopes = new ExecutionReadScopes(db(), f.access as unknown as ExecutionAccessService, f.config);
    authority = new CurrentViewAuthority({ pool: db() } as Pick<AuthService, "pool">, scopes);
  });

  afterAll(async () => {
    await pool?.end(); pool = undefined;
    if (!created) return;
    if (!databasePattern.test(databaseName)) throw new Error("CURRENT_VIEW_OWNED_DATABASE_NAME_INVALID");
    const admin = new Pool({ connectionString: targetUrl("postgres"), max: 1, connectionTimeoutMillis: 2000 });
    try { await admin.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`); created = false; }
    finally { await admin.end(); }
  }, 60_000);

  it("reads the migrated actual columns, exact session and workspace through register/resolve/recheck", async () => {
    const registration = await register(), input = request(registration), decision = await authority.resolve(input);
    expect(decision.workspace_id).toBe(principal.workspaceId);
    expect(decision.operation).toBe("CURRENT");
    expect(decision.whole_population).toBe(true);
    expect(decision.fields).toEqual(["equity"]);
    expect(decision.allowed_tuples).toHaveLength(3);
    expect(await authority.recheck({ ...input, decision_digest: decision.decision_digest })).toEqual(decision);
    expect(JSON.stringify(decision)).not.toContain(principal.session.sessionId);
    authority.release(registration.original_context);
  }, 20_000);

  const changes = [
    ["disabled user", "UPDATE portal_users SET status='DISABLED',disabled_at=clock_timestamp() WHERE user_id=$1", "user"],
    ["archived user", "UPDATE portal_users SET archived_at=clock_timestamp() WHERE user_id=$1", "user"],
    ["mandatory password change", "UPDATE portal_users SET must_change_password=true WHERE user_id=$1", "user"],
    ["revoked original session", "UPDATE auth_sessions SET state='REVOKED' WHERE session_id=$1", "session"],
    ["changed user generation", "UPDATE portal_users SET session_version=session_version+1 WHERE user_id=$1", "user"],
    ["expired original idle deadline", "UPDATE auth_sessions SET idle_expires_at=clock_timestamp()-interval '1 second' WHERE session_id=$1", "session"],
    ["removed workspace membership", "DELETE FROM workspace_members WHERE user_id=$1", "user"],
  ] as const;
  it.each(changes)("refuses %s from actual rows instead of reusing the previous allowance", async (_name, sql, key) => {
    const registration = await register(), input = request(registration), before = await authority.resolve(input);
    expect((await db().query(sql, [key === "session" ? principal.session.sessionId : principal.user.userId])).rowCount).toBe(1);
    await expect(authority.resolve(input)).rejects.toMatchObject({ code: "CURRENT_VIEW_IDENTITY_REQUIRED", status: 401 });
    await expect(authority.recheck({ ...input, decision_digest: before.decision_digest }))
      .rejects.toMatchObject({ code: "CURRENT_VIEW_IDENTITY_REQUIRED", status: 401 });
    authority.release(registration.original_context);
  }, 20_000);

  it("does not merge equivalent views or replace the revoked original with the same user's sibling session", async () => {
    const first = await register();
    const sibling = { ...structuredClone(principal), session: await insertSession(`TEST_ONLY:sibling:${randomUUID()}`) };
    const second = await register(sibling);
    const a = await authority.resolve(request(first)), b = await authority.resolve(request(second));
    expect(a.allowed_tuples).toEqual(b.allowed_tuples);
    expect(a.session_digest).not.toBe(b.session_digest);
    expect(a.context_digest).not.toBe(b.context_digest);
    expect((await db().query("UPDATE auth_sessions SET state='REVOKED' WHERE session_id=$1", [principal.session.sessionId])).rowCount).toBe(1);
    await expect(authority.resolve(request(first))).rejects.toMatchObject({ code: "CURRENT_VIEW_IDENTITY_REQUIRED", status: 401 });
    await expect(authority.resolve(request(second))).resolves.toMatchObject({ session_digest: b.session_digest });
    authority.release(first.original_context); authority.release(second.original_context);
  }, 20_000);

  it("rejects a foreign user's session and a nonexistent workspace rather than accepting supplied identity labels", async () => {
    const owner = f.context.policy!.protected_owner_user_id;
    const foreign = { ...structuredClone(principal), session: await insertSession(`TEST_ONLY:foreign:${randomUUID()}`, owner) };
    // Retain the actor label to exercise the exact SQL JOIN, not merely the
    // fast principal.session.userId precondition.
    foreign.session.userId = principal.user.userId;
    await expect(register(foreign)).rejects.toMatchObject({ code: "CURRENT_VIEW_IDENTITY_REQUIRED", status: 401 });
    await expect(register({ ...structuredClone(principal), workspaceId: `TEST_ONLY:absent:${randomUUID()}` }))
      .rejects.toMatchObject({ code: "CURRENT_VIEW_IDENTITY_REQUIRED", status: 401 });
  }, 20_000);
});
