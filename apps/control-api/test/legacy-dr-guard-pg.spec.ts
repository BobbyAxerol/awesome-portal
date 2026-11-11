/** TEST ONLY: exercise the actual legacy DR probe against a fresh bounded PG.
 * No source or shared database is accepted, modified, or deleted. */
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";

const enabled=process.env.PORTAL_TEST_RESTORE_RLS==="TEST_ONLY_DISPOSABLE_RLS";
describe.skipIf(!enabled)("legacy DR schema probe on disposable PostgreSQL",()=>{
  it("rejects every standalone C2 or recovery namespace even without the core schema",async()=>{
    const value=process.env.TEST_DATABASE_URL;
    if(!value)throw new Error("TEST_ONLY_DISPOSABLE_DATABASE_REQUIRED");
    const url=new URL(value);
    if(!["postgres:","postgresql:"].includes(url.protocol)||
      !/^control-api-test-postgres-[a-f0-9]{8}$/.test(url.hostname)||
      !/^\/portal_restore_rls_[a-f0-9]{8}$/.test(url.pathname)||
      url.username!=="portal"||(url.port!==""&&url.port!=="5432")||url.search||url.hash)
      throw new Error("TEST_ONLY_DISPOSABLE_DATABASE_REQUIRED");
    const source=await readFile("/cell/research-udb/legacy-dr-guard.mjs","utf8");
    const probe=/export const LEGACY_DR_SCHEMA_PROBE = `([\s\S]*?)`;/u.exec(source)?.[1];
    if(!probe)throw new Error("TEST_ONLY_PROBE_NOT_FOUND");
    const db=new Pool({connectionString:value,max:1,connectionTimeoutMillis:2000,query_timeout:6000});
    try {
      const present=await db.query("SELECT to_regclass('public.pgmigrations') IS NOT NULL AS occupied");
      if(present.rows[0]?.occupied!==false)throw new Error("TEST_ONLY_DATABASE_NOT_EMPTY");
      await db.query("CREATE TABLE public.pgmigrations(name text NOT NULL)");
      expect((await db.query(probe)).rows).toEqual([{has_execution_v2_authority:false,has_execution_v2_migration:false}]);
      for(const name of ["elp210_candidate","elp210_c2_p7_candidate","elp210_c2_delivery_candidate",
        "portal_local_write_fence","portal_restore_authority","portal_restore_original_custody"]) {
        // Fixed test literals in the validated disposable DB only.
        await db.query(`CREATE SCHEMA ${name}`);
        expect((await db.query(probe)).rows).toEqual([{has_execution_v2_authority:true,has_execution_v2_migration:false}]);
        await db.query(`DROP SCHEMA ${name}`);
      }
      await db.query("CREATE SCHEMA elp210_c2x_not_authority");
      expect((await db.query(probe)).rows[0].has_execution_v2_authority).toBe(false);
      await db.query("INSERT INTO public.pgmigrations(name) VALUES ('1723680000134_test')");
      expect((await db.query(probe)).rows[0].has_execution_v2_migration).toBe(true);
    } finally {await db.end();}
  });
});
