/** Disposable PostgreSQL only. No alpha execution or source qualification. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { buildPool } from "../src/db/pool";
import { ResearchRunLibraryRepository } from "../src/research/run-library.repository";
import { ResearchRunLibraryService } from "../src/research/run-library.service";
import { migrateTestDatabase, testConfig, truncateAll } from "./harness";

const config = testConfig({ FEATURE_RESEARCH_RUN_LIBRARY: "true",
  QUERY_CURSOR_ACTIVE_KEY_ID: "catalogue-pg",
  QUERY_CURSOR_KEYS_JSON: '{"catalogue-pg":"TEST_ONLY-alpha-catalogue-pg-key-over-thirty-two-bytes"}' });
const scope = { workspaceId: "catalogue-test-workspace", actorUserId: "catalogue-test-user" };
let pool: Pool, service: ResearchRunLibraryService;

beforeAll(async () => {
  await migrateTestDatabase(config.DATABASE_URL);
  pool = buildPool(config.DATABASE_URL);
  await truncateAll(pool);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`INSERT INTO portal_users(user_id,username,display_name,role,status,must_change_password)
      VALUES ('catalogue-test-user','catalogue-test-user','Test','ADMIN','ACTIVE',false)`);
    await client.query(`INSERT INTO workspaces(workspace_id,name,owner_user_id)
      VALUES ('catalogue-test-workspace','Test','catalogue-test-user'),('catalogue-peer-workspace','Peer','catalogue-test-user')`);
    await client.query(`INSERT INTO workspace_members(workspace_id,user_id,role)
      VALUES ('catalogue-test-workspace','catalogue-test-user','OWNER')`);
    // Valid linked identities in a disposable DB; disable unrelated trigger
    // work for this catalogue-reader test, not runtime authorization.
    await client.query("SET LOCAL session_replication_role = replica");
    await client.query(`INSERT INTO research.alphas(workspace_id,alpha_id,name,owner_user_id,execution_subject_id)
      SELECT w, 'alpha-'||lpad(n::text,4,'0'), 'Strategy '||n, 'catalogue-test-user', 'TEST_ONLY:'||n
      FROM (SELECT 'catalogue-test-workspace'::text AS w,generate_series(0,404) AS n
            UNION ALL SELECT 'catalogue-peer-workspace',9999) x`);
    await client.query(`INSERT INTO research.alpha_versions(workspace_id,alpha_id,alpha_version_id,code_digest,entrypoint,dependency_ref,declared_contract,lifecycle_state,registered_by_user_id)
      SELECT workspace_id,alpha_id,'av-'||alpha_id,repeat('a',64),'strategy:main','test','{}'::jsonb,'DRAFT','catalogue-test-user'
      FROM research.alphas WHERE workspace_id IN ('catalogue-test-workspace','catalogue-peer-workspace')`);
    await client.query(`INSERT INTO research.attempts(workspace_id,attempt_id,alpha_version_id,client_intent_id,request_payload_digest,intent_kind,state,created_by_user_id)
      SELECT workspace_id,'attempt-'||alpha_id,alpha_version_id,'intent-'||alpha_id,repeat('a',64),'NEW','READY','catalogue-test-user'
      FROM research.alpha_versions WHERE workspace_id IN ('catalogue-test-workspace','catalogue-peer-workspace')`);
    await client.query(`INSERT INTO research.runs(workspace_id,run_id,attempt_id,run_kind,relationship_kind,logical_run_key,request_spec_digest,effective_spec_digest,engine_release_id,dataset_binding_digest,state,submitted_by_user_id)
      SELECT workspace_id,'run-'||attempt_id,attempt_id,'PRIMARY','PRIMARY','primary',repeat('a',64),repeat('a',64),'test',repeat('a',64),'READY','catalogue-test-user'
      FROM research.attempts WHERE workspace_id IN ('catalogue-test-workspace','catalogue-peer-workspace')`);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  service = new ResearchRunLibraryService(new ResearchRunLibraryRepository(pool), config);
}, 120_000);
afterAll(async () => { await pool?.end(); });

describe("alpha catalogue against isolated PostgreSQL", () => {
  it("walks 405 distinct ids across three real SQL pages and excludes another workspace", async () => {
    const seen: string[] = []; let cursor: string | undefined;
    for (let i = 0; i < 3; i++) {
      const page = await service.alphaCatalogue(scope, { limit: 200, cursor });
      seen.push(...page.items.map(item => item.alpha_id));
      expect(page.page.has_more).toBe(i < 2); cursor = page.page.next_cursor ?? undefined;
    }
    expect(seen).toEqual(Array.from({ length: 405 }, (_, i) => `alpha-${String(i).padStart(4, "0")}`));
    expect(seen).not.toContain("alpha-9999");
  });
  it("rechecks membership on a subsequent page", async () => {
    const page = await service.alphaCatalogue(scope, { limit: 100 });
    await pool.query("DELETE FROM workspace_members WHERE workspace_id=$1 AND user_id=$2", [scope.workspaceId, scope.actorUserId]);
    try {
      await expect(service.alphaCatalogue(scope, { limit: 100, cursor: page.page.next_cursor! }))
        .rejects.toMatchObject({ code: "RESEARCH_RUN_LIBRARY_FORBIDDEN" });
    } finally {
      await pool.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'OWNER')", [scope.workspaceId, scope.actorUserId]);
    }
  });
});
