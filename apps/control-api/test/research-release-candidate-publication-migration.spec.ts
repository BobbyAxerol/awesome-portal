import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { migrateTestDatabase } from "./harness";

const baseUrl = process.env.TEST_DATABASE_URL ?? "postgres://portal:portal@127.0.0.1:5432/portal_control_test";
const databaseName = `portal_p22_${randomUUID().replaceAll("-", "")}`;
function urlFor(name: string): string {
  const url = new URL(baseUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

describe("P22 disposable PostgreSQL publication migration", () => {
  beforeAll(async () => {
    const admin = new Pool({ connectionString: urlFor("postgres") });
    try { await admin.query(`CREATE DATABASE ${databaseName}`); } finally { await admin.end(); }
    await migrateTestDatabase(urlFor(databaseName));
  });
  afterAll(async () => {
    const admin = new Pool({ connectionString: urlFor("postgres") });
    try { await admin.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`); } finally { await admin.end(); }
  });

  it("P22-T04/T05/T14 installs actor-bound, retained intent and narrow runtime grants", async () => {
    const database = new Pool({ connectionString: urlFor(databaseName) });
    try {
      const result = await database.query(`SELECT
        to_regclass('research.release_candidate_publications_v1') IS NOT NULL AS publication,
        EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'research_release_candidate_publications_v1_guard' AND NOT tgisinternal) AS guard,
        has_table_privilege('portal_research_runtime', 'research.release_candidate_publications_v1', 'SELECT') AS can_read,
        has_table_privilege('portal_research_runtime', 'research.release_candidate_publications_v1', 'INSERT') AS can_insert,
        has_column_privilege('portal_research_runtime', 'research.release_candidate_publications_v1', 'state', 'UPDATE') AS can_update_state,
        has_column_privilege('portal_research_runtime', 'research.release_candidate_publications_v1', 'request_payload', 'UPDATE') AS can_rewrite_request,
        has_column_privilege('portal_research_runtime', 'research.release_candidate_delivery_states_v1', 'approval_id', 'UPDATE') AS can_link_approval`);
      expect(result.rows[0]).toEqual({
        publication: true, guard: true, can_read: true, can_insert: true,
        can_update_state: true, can_rewrite_request: false, can_link_approval: true,
      });
    } finally { await database.end(); }
  });
});
