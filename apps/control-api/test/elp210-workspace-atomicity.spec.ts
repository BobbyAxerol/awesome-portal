/** Actual disposable PostgreSQL proves paired workspace/member atomicity.
 * The trigger is an explicitly synthetic failure, not a source trust proof.
 * No candidate installer, permission, concurrent-dedup or session fence is
 * introduced or claimed by this repository-only regression suite. */
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomId } from "../src/domain";
import { UsersRepository } from "../src/repos/users";
import { WorkspacesRepository } from "../src/repos/workspaces";
import { migrateTestDatabase } from "./harness";

const DATABASE_URL = process.env.TEST_DATABASE_URL;
describe.skipIf(!DATABASE_URL)("ELP2-10 personal-workspace atomicity, real Core DB", () => {
  let pool: Pool;
  const userIds: string[] = [];
  // Only generated hex enters SQL identifiers; every fixture and cleanup
  // target belongs to this test invocation, including failed setup paths.
  const suffix = randomUUID().replaceAll("-", "");
  const refusalFunction = `elp210_ws_refusal_${suffix}`;
  const refusalTrigger = `elp210_ws_refusal_${suffix}`;

  beforeAll(async () => {
    await migrateTestDatabase(DATABASE_URL!);
    pool = new Pool({ connectionString: DATABASE_URL, max: 3,
      connectionTimeoutMillis: 2000, query_timeout: 6000 });
  });
  async function removeRefusal() {
    await pool.query(`DROP TRIGGER IF EXISTS ${refusalTrigger} ON workspace_members`);
    await pool.query(`DROP FUNCTION IF EXISTS public.${refusalFunction}()`);
  }
  afterAll(async () => {
    if (!pool) return;
    try {
      await removeRefusal();
      // Existing FKs remove only workspaces/members belonging to these exact
      // disposable identities; no truncate or unrelated fixture cleanup.
      if (userIds.length) await pool.query("DELETE FROM portal_users WHERE user_id=ANY($1::text[])", [userIds]);
    } finally { await pool.end(); }
  });

  async function account() {
    const userId = randomId("usr");
    userIds.push(userId);
    return new UsersRepository(pool).create({ userId,
      username: `elp210-workspace-${userId}`, displayName: "TEST_ONLY workspace atomicity", role: "USER" });
  }
  async function owned(userId: string) {
    return (await pool.query("SELECT * FROM workspaces WHERE owner_user_id=$1 ORDER BY workspace_id", [userId])).rows;
  }
  async function memberships(userId: string) {
    return (await pool.query("SELECT * FROM workspace_members WHERE user_id=$1 ORDER BY workspace_id", [userId])).rows;
  }

  it("a membership trigger failure commits neither workspace nor membership", async () => {
    const user = await account();
    // The generated fixture ID is still quoted as a SQL literal. The actual
    // refusal is raised by PostgreSQL during the second data-modifying CTE.
    const targetLiteral = user.userId.replaceAll("'", "''");
    try {
      await pool.query(`CREATE FUNCTION public.${refusalFunction}() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW.user_id=TG_ARGV[0] THEN
            RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='TEST_ONLY_MEMBERSHIP_REFUSED';
          END IF;
          RETURN NEW;
        END $$`);
      await pool.query(`CREATE TRIGGER ${refusalTrigger} BEFORE INSERT ON workspace_members
        FOR EACH ROW EXECUTE FUNCTION public.${refusalFunction}('${targetLiteral}')`);
      await expect(new WorkspacesRepository(pool).ensurePersonal(user.userId, user.username))
        .rejects.toMatchObject({ code: "P0001", message: "TEST_ONLY_MEMBERSHIP_REFUSED" });
      expect(await owned(user.userId)).toEqual([]);
      expect(await memberships(user.userId)).toEqual([]);
    } finally { await removeRefusal(); }
    const id = await new WorkspacesRepository(pool).ensurePersonal(user.userId, user.username);
    expect(await owned(user.userId)).toMatchObject([{ workspace_id: id }]);
    expect(await memberships(user.userId)).toMatchObject([{ workspace_id: id, role: "OWNER" }]);
  });

  it("an existing owned membership is returned without changing its rows or name", async () => {
    const user = await account(), repo = new WorkspacesRepository(pool);
    const id = await repo.ensurePersonal(user.userId, user.username);
    const before = { workspaces: await owned(user.userId), members: await memberships(user.userId) };
    expect(await repo.ensurePersonal(user.userId, "different-display-name")).toBe(id);
    expect({ workspaces: await owned(user.userId), members: await memberships(user.userId) }).toEqual(before);
  });

  it("unrelated membership and orphan ownership are not silently promoted or repaired", async () => {
    const user = await account(), other = await account();
    const unrelatedId = randomId("ws"), orphanId = randomId("ws");
    await pool.query(`INSERT INTO workspaces(workspace_id,name,owner_user_id)
      VALUES($1,'TEST_ONLY unrelated',$2),($3,'TEST_ONLY orphan',$4)`,
    [unrelatedId, other.userId, orphanId, user.userId]);
    await pool.query(`INSERT INTO workspace_members(workspace_id,user_id,role)
      VALUES($1,$2,'OWNER'),($1,$3,'MEMBER')`, [unrelatedId, other.userId, user.userId]);
    const orphan = (await pool.query("SELECT * FROM workspaces WHERE workspace_id=$1", [orphanId])).rows;
    const unrelated = (await memberships(user.userId))[0];
    const id = await new WorkspacesRepository(pool).ensurePersonal(user.userId, user.username);
    expect(id).not.toBe(unrelatedId);
    expect(id).not.toBe(orphanId);
    expect((await pool.query("SELECT * FROM workspaces WHERE workspace_id=$1", [orphanId])).rows).toEqual(orphan);
    expect((await pool.query("SELECT * FROM workspace_members WHERE workspace_id=$1", [orphanId])).rows).toEqual([]);
    expect((await memberships(user.userId)).find(row => row.workspace_id === unrelatedId)).toEqual(unrelated);
    expect((await memberships(user.userId)).find(row => row.workspace_id === id)).toMatchObject({ role: "OWNER" });
    expect(await owned(user.userId)).toHaveLength(2); // Original orphan is preserved, not adopted/deleted.
  });

  it("a supplied PoolClient keeps the outer transaction and rollback caller-owned", async () => {
    const user = await account(), client = await pool.connect();
    try {
      await client.query("BEGIN");
      const before = (await client.query("SELECT txid_current()::text AS id")).rows[0].id;
      const id = await new WorkspacesRepository(client).ensurePersonal(user.userId, user.username);
      expect((await client.query("SELECT txid_current()::text AS id")).rows[0].id).toBe(before);
      expect((await client.query("SELECT role FROM workspace_members WHERE workspace_id=$1 AND user_id=$2", [id, user.userId])).rows)
        .toEqual([{ role: "OWNER" }]);
      // An independent connection sees no prematurely committed workspace.
      expect(await owned(user.userId)).toEqual([]);
      expect(await memberships(user.userId)).toEqual([]);
      await client.query("ROLLBACK");
      expect(await owned(user.userId)).toEqual([]);
      expect(await memberships(user.userId)).toEqual([]);
      expect((await client.query("SELECT 1 AS usable")).rows).toEqual([{ usable: 1 }]);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
});
