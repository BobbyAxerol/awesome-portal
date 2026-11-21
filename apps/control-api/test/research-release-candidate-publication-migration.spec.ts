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

  it("OL-03/P22-T09 keeps P19 source facts read-only and exposes only the P22 writer", async () => {
    const database = new Pool({ connectionString: urlFor(databaseName) });
    try {
      const result = await database.query(`SELECT
        to_regclass('research.p22_promotion_pick_receipts_v1') IS NOT NULL AS pick_receipt,
        to_regclass('research.p22_run_read_model_bridges_v1') IS NOT NULL AS bridge,
        to_regclass('research.p22_approval_settlements_v1') IS NOT NULL AS settlement,
        has_table_privilege('portal_research_runtime', 'research.p22_promotion_pick_receipts_v1', 'SELECT') AS pick_read,
        has_table_privilege('portal_research_runtime', 'research.p22_promotion_pick_receipts_v1', 'INSERT') AS pick_insert,
        has_table_privilege('portal_research_runtime', 'research.attempt_promotion_pick_facts_v1', 'INSERT') AS p19_insert,
        has_table_privilege('portal_research_runtime', 'research.p22_approval_settlements_v1', 'SELECT') AS settlement_read,
        has_table_privilege('portal_research_runtime', 'research.p22_approval_settlements_v1', 'INSERT') AS settlement_insert,
        has_function_privilege('portal_research_runtime', 'research.p22_record_promotion_pick(text,text,text,text,text,text,text,text,jsonb,text,text,text,text,text,text,text)', 'EXECUTE') AS writer_execute,
        EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'p22_record_promotion_pick') AS writer_exists`);
      expect(result.rows[0]).toEqual({
        pick_receipt: true, bridge: true, settlement: true, pick_read: true, pick_insert: false,
        p19_insert: false, settlement_read: true, settlement_insert: false, writer_execute: true, writer_exists: true,
      });
    } finally { await database.end(); }
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
