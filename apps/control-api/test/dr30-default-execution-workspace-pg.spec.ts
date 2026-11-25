/** DR-30 database proofs. Needs Postgres (TEST_DATABASE_URL); NOT_RUN where none is available. */
import "reflect-metadata";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { runControlApiMigrations } from "../src/cli/migrate";
import { WorkspacesRepository } from "../src/repos/workspaces";
import { provisionDefaultExecutionGrant, parseGrantEnvironments } from "../src/execution/default-execution-grants";
import { testConfig } from "./harness";

describe("DR-30 grants against a real database", () => {
  const base = process.env.TEST_DATABASE_URL ?? "postgres://portal:portal@127.0.0.1:5432/portal_control_test";
  const name = "dr30_core_" + randomUUID().replaceAll("-", "");
  const url = (db: string) => { const u = new URL(base); u.pathname = "/" + db; return u.toString(); };
  const ws = "ws_dr30_bound", other = "ws_dr30_other";
  const cfg = (extra: Record<string, string> = {}) => testConfig({ DATABASE_URL: url(name), EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: ws,
    FEATURE_EXECUTION_DEFAULT_WORKSPACE_GRANTS: "true", ...extra });
  let core: Pool;
  beforeAll(async () => {
    const admin = new Pool({ connectionString: url("postgres") });
    try { await admin.query(`CREATE DATABASE ${name}`); } finally { await admin.end(); }
    core = new Pool({ connectionString: url(name), max: 3 });
    await runControlApiMigrations(url(name), undefined, () => {});
    await core.query(`INSERT INTO portal_users(user_id,username,display_name,role,status,must_change_password) VALUES
      ('usr_owner','owner','Owner','ADMIN','ACTIVE',false),('usr_stan','stan','Stan','ADMIN','ACTIVE',false),
      ('usr_none','nogrant','None','ADMIN','ACTIVE',false);
      INSERT INTO portal_owner_anchor(anchor_id,user_id) VALUES('PORTAL_OWNER','usr_owner');
      INSERT INTO workspaces(workspace_id,name,owner_user_id) VALUES('${ws}','bound','usr_owner'),('${other}','stan personal','usr_stan');
      INSERT INTO workspace_members(workspace_id,user_id,role) VALUES('${ws}','usr_owner','OWNER'),('${other}','usr_stan','OWNER')`);
  }, 90_000);
  afterAll(async () => {
    await core?.end(); const admin = new Pool({ connectionString: url("postgres") });
    try { await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`); } finally { await admin.end(); }
  });

  it("issue, renew, revoke: scope, 12 month term, audit actor is the owner, no membership change", async () => {
    const issued = await provisionDefaultExecutionGrant(core, cfg(), { username: "stan", environments: parseGrantEnvironments("paper,sandbox,live") });
    expect(issued).toMatchObject({ changed: true, kind: "ISSUED", environments: ["live", "paper", "sandbox"] });
    const repo = new WorkspacesRepository(core, cfg());
    expect(await repo.canReadExecution(ws, "usr_stan", "live")).toBe(true);
    expect(await repo.canReadExecution(ws, "usr_none", "paper")).toBe(false);
    expect(await repo.canReadExecution(other, "usr_stan", "paper")).toBe(true); // own membership, unchanged
    expect(await repo.isMember(ws, "usr_stan")).toBe(false);
    const audit = (await core.query(`SELECT actor_user_id,metadata_json FROM product_audit_events WHERE event_type='DR30_DEFAULT_EXECUTION_GRANT_ISSUED'`)).rows;
    expect(audit).toHaveLength(1); expect(audit[0].actor_user_id).toBe("usr_owner"); expect(audit[0].metadata_json.writes).toBe(false);
    expect((await provisionDefaultExecutionGrant(core, cfg(), { username: "stan", environments: ["paper"] }))).toMatchObject({ kind: "RENEWED" });
    expect(await repo.canReadExecution(ws, "usr_stan", "live")).toBe(false); // renewal narrowed the scope
    expect(await provisionDefaultExecutionGrant(core, cfg(), { username: "stan", revoke: true })).toMatchObject({ kind: "REVOKED" });
    expect(await repo.canReadExecution(ws, "usr_stan", "paper")).toBe(false);
  });
  it("refuses: no explicit environments, owner as subject, disabled flag, term above 366 days, expired grant", async () => {
    await expect(provisionDefaultExecutionGrant(core, cfg(), { username: "stan", environments: [] })).rejects.toThrow("DR30_ENVIRONMENTS_REQUIRED_EXPLICIT");
    expect(() => parseGrantEnvironments("")).toThrow(); expect(() => parseGrantEnvironments("paper,prod")).toThrow();
    await expect(provisionDefaultExecutionGrant(core, cfg(), { username: "owner", environments: ["paper"] })).rejects.toThrow("DR30_OWNER_NEEDS_NO_GRANT");
    await expect(provisionDefaultExecutionGrant(core, cfg({ FEATURE_EXECUTION_DEFAULT_WORKSPACE_GRANTS: "false" }), { username: "stan", environments: ["paper"] })).rejects.toThrow("DR30_GRANT_REFUSED");
    await expect(core.query(`INSERT INTO execution_retained_review_access(workspace_id,user_id,issued_by,expires_at,execution_environments)
      VALUES($1,'usr_none','usr_owner',now()+interval '400 days','{paper}')`, [ws])).rejects.toThrow();
    await core.query(`INSERT INTO execution_retained_review_access(workspace_id,user_id,issued_by,created_at,term_started_at,expires_at,execution_environments)
      VALUES($1,'usr_none','usr_owner',now()-interval '3 days',now()-interval '3 days',now()-interval '1 day','{paper}')`, [ws]);
    expect(await new WorkspacesRepository(core, cfg()).canReadExecution(ws, "usr_none", "paper")).toBe(false);
  });
  it("legacy 30-day rows keep their constraint and stay inert for the default workspace", async () => {
    await expect(core.query(`INSERT INTO execution_retained_review_access(workspace_id,user_id,issued_by,expires_at) VALUES($1,'usr_stan','usr_owner',now()+interval '90 days')`, [ws])).rejects.toThrow();
    await core.query(`DELETE FROM execution_retained_review_access`);
    await core.query(`INSERT INTO execution_retained_review_access(workspace_id,user_id,issued_by,expires_at) VALUES($1,'usr_stan','usr_owner',now()+interval '10 days')`, [ws]);
    expect(await new WorkspacesRepository(core, cfg()).defaultExecutionGrant("usr_stan")).toEqual({ state: "NONE" });
  });
});
