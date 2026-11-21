/** TEST_ONLY: never run against preview or any shared database. This test
 * exercises candidate SQL on a disposable, owner/ACL-preserving historical
 * clone. It is not a production migration or permission to restore/cut over. */
import {readFile} from "node:fs/promises";
import {randomUUID} from "node:crypto";
import {join,resolve} from "node:path";
import {Pool} from "pg";
import {describe,expect,it} from "vitest";
import {runControlApiMigrations} from "../src/cli/migrate";
import {COMMAND_STATUS_ACK_CENSUS_SQL} from "../src/execution-v2/command-status-ack-census";

const url=process.env.TEST_DATABASE_URL;
const enabled=process.env.PORTAL_C2_HISTORICAL_REHEARSAL==="TEST_ONLY_RESTORED_CLONE"&&!!url;
function target(value:string) {
  let parsed:URL;try{parsed=new URL(value);}catch{throw new Error("TEST_ONLY_RESTORED_CLONE_REQUIRED");}
  if(!["postgres:","postgresql:"].includes(parsed.protocol)||parsed.username!=="portal"||
    !/^control-api-test-postgres-[a-f0-9]{8}$/.test(parsed.hostname)||
    (parsed.port!==""&&parsed.port!=="5432")||parsed.pathname!=="/portal_control_test"||parsed.search||parsed.hash)
    throw new Error("TEST_ONLY_RESTORED_CLONE_REQUIRED");
}
const tables=["public.portal_users","public.auth_sessions","public.auth_audit_events","public.portal_access_grants_v2",
  "public.execution_trusted_commands","public.portal_native_root_obligations","public.portal_native_current_read_obligations",
  "elp210_candidate.authority","elp210_candidate.leases","elp210_candidate.events","elp210_candidate.mutations",
  "elp210_candidate.mutation_events","elp210_candidate.native_read_obligations","elp210_candidate.native_read_events"] as const;
const ident=(v:string)=>{if(!/^[a-z_][a-z0-9_]*$/.test(v))throw new Error("TEST_ONLY_COLUMN_INVALID");return `"${v}"`;};
describe("C2 historical clone target",()=>{
  it("refuses non-disposable host, user, DB or connection override",()=>{
    expect(()=>target("postgres://portal:test@control-api-test-postgres-1234abcd:5432/portal_control_test")).not.toThrow();
    for(const v of ["postgres://portal:test@localhost/portal_control_test","postgres://portal:test@control-api-test-postgres-1234abcd/portal_control_test?host=other",
      "postgres://portal:test@control-api-test-postgres-1234abcd/portal","postgres://other:test@control-api-test-postgres-1234abcd/portal_control_test"])
      expect(()=>target(v)).toThrow("TEST_ONLY_RESTORED_CLONE_REQUIRED");
  });
});
describe.skipIf(!enabled)("C2 candidate on historical preview clone",()=>{
  it("preserves existing rows and security objects through selected candidate preparation",async()=>{
    target(url!);const db=new Pool({connectionString:url,max:1,connectionTimeoutMillis:3000,query_timeout:60000});
    try {
      const last=await db.query("SELECT name FROM pgmigrations ORDER BY id DESC LIMIT 1");
      expect(last.rows[0]?.name).toBe("1723680000154_execution-operation-health-publication");
      await runControlApiMigrations(url!,resolve(__dirname,"../migrations"),()=>undefined);
      // Add one unmistakably synthetic pre-C2 lease in this isolated clone so
      // NULL/no-backfill checks cannot pass vacuously on an empty snapshot.
      const syntheticLease=`TEST_ONLY_${randomUUID()}`;
      await db.query(`INSERT INTO elp210_candidate.leases(lease_id,authority_revision,subject_id,session_id,session_revision,
        workspace_id,environment,workload_id,request_digest,authority_fingerprint,issued_at_ms,expires_at_ms,phase)
        VALUES($1,0,'TEST_ONLY_subject','TEST_ONLY_session',0,'TEST_ONLY_workspace','paper','TEST_ONLY_workload',
          'sha256:'||repeat('1',64),'sha256:'||repeat('2',64),1,2,'ISSUED')`,[syntheticLease]);
      // Before the candidate writer fence is installed, retain a second
      // TEST_ONLY legacy terminal and its synthetic STATUS link/ACK. No
      // actual historical rows are modified and no source proof is implied.
      const h=(n:string)=>`sha256:${n.repeat(64)}`;
      const censusLease=`TEST_ONLY_census_${randomUUID()}`,context=h("a");
      await db.query(`INSERT INTO elp210_candidate.leases(lease_id,authority_revision,subject_id,session_id,
        session_revision,workspace_id,environment,workload_id,request_digest,authority_fingerprint,issued_at_ms,
        expires_at_ms,phase,attempt_id,terminal_receipt_digest)
        VALUES($1,0,'TEST_ONLY_subject','TEST_ONLY_session',0,'TEST_ONLY_workspace','paper','TEST_ONLY_workload',
          $2,$3,1,2,'COMMITTED','TEST_ONLY_attempt',$4)`,[censusLease,h("1"),h("2"),h("3")]);
      await db.query(`INSERT INTO execution_command_status_context_links(context_digest,context_nonce,delivery_sequence,
        lease_id,previous_lease_id,original_digest,call_digest,binding_digest,authority_fingerprint,assertion_digest,
        status_token_digest,status_request_digest,status_issued_at_ms,request_digest,receiver_id,context_expires_at_ms)
        VALUES($1,$2,0,$3,NULL,$4,$5,$6,$7,$8,$8,$8,1,$9,'TEST_ONLY_receiver',100)`,
      [context,"A".repeat(43),censusLease,h("4"),h("5"),h("6"),h("2"),h("7"),h("1")]);
      await db.query(`INSERT INTO execution_command_status_delivery_acks(lease_id,workspace_id,subject_id,session_id,
        session_revision,environment,workload_id,request_digest,response_digest,terminal_receipt_digest)
        VALUES($1,'TEST_ONLY_workspace','TEST_ONLY_subject','TEST_ONLY_session',0,'paper','TEST_ONLY_workload',$2,$3,$4)`,
      [censusLease,h("1"),h("9"),h("3")]);
      const columns=new Map<string,string[]>();
      for(const table of tables){
        const rows=await db.query<{attname:string}>(`SELECT a.attname FROM pg_attribute a
          WHERE a.attrelid=$1::regclass AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum`,[table]);
        expect(rows.rows.length).toBeGreaterThan(0);columns.set(table,rows.rows.map(x=>ident(x.attname)));
      }
      const fingerprint=async()=>{
        const out:Record<string,unknown>={};
        for(const table of tables){const [schema,name]=table.split(".");
          const result=await db.query(`SELECT count(*)::text AS count,md5(string_agg(row_to_json(t)::text,E'\\n' ORDER BY row_to_json(t)::text)) AS digest
            FROM (SELECT ${columns.get(table)!.join(",")} FROM ${ident(schema)}.${ident(name)}) t`);
          out[table]=result.rows[0];}
        return out;
      };
      const security=async()=>{
        const r=await db.query(`SELECT 'schema:'||n.nspname AS key,jsonb_build_object('owner',pg_get_userbyid(n.nspowner),'acl',n.nspacl)::text AS value
          FROM pg_namespace n WHERE n.nspname IN ('public','research','elp210_candidate')
          UNION ALL SELECT 'relation:'||n.nspname||'.'||c.relname,jsonb_build_object('owner',pg_get_userbyid(c.relowner),'acl',c.relacl,'rls',c.relrowsecurity,'force',c.relforcerowsecurity)::text
          FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','research','elp210_candidate')
          UNION ALL SELECT 'column:'||n.nspname||'.'||c.relname||'.'||a.attname,a.attacl::text
          FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname IN ('public','research','elp210_candidate') AND a.attnum>0 AND NOT a.attisdropped AND a.attacl IS NOT NULL
          UNION ALL SELECT 'function:'||n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
          jsonb_build_object('owner',pg_get_userbyid(p.proowner),'acl',p.proacl,'definer',p.prosecdef,'definition',pg_get_functiondef(p.oid))::text
          FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','research','elp210_candidate') AND p.prokind='f'
          UNION ALL SELECT 'default_acl:'||pg_get_userbyid(d.defaclrole)||':'||coalesce(n.nspname,'')||':'||d.defaclobjtype::text,d.defaclacl::text
          FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
          UNION ALL SELECT 'policy:'||schemaname||'.'||tablename||':'||policyname,
          jsonb_build_object('permissive',permissive,'roles',roles,'cmd',cmd,'qual',qual,'with_check',with_check)::text
          FROM pg_policies WHERE schemaname IN ('public','research','elp210_candidate')
          UNION ALL SELECT 'role:'||rolname,jsonb_build_object('super',rolsuper,'inherit',rolinherit,'create_role',rolcreaterole,
          'create_db',rolcreatedb,'login',rolcanlogin,'replication',rolreplication,'bypass_rls',rolbypassrls)::text
          FROM pg_roles WHERE rolname IN ('portal','portal_research_runtime')
          UNION ALL SELECT 'membership:'||r.rolname||':'||m.rolname||':'||g.rolname,jsonb_build_object('admin',a.admin_option)::text
          FROM pg_auth_members a JOIN pg_roles r ON r.oid=a.roleid JOIN pg_roles m ON m.oid=a.member JOIN pg_roles g ON g.oid=a.grantor
          WHERE r.rolname IN ('portal','portal_research_runtime') OR m.rolname IN ('portal','portal_research_runtime')
          UNION ALL SELECT 'trigger:'||n.nspname||'.'||c.relname||':'||t.tgname,
          jsonb_build_object('definition',pg_get_triggerdef(t.oid,true),'enabled',t.tgenabled)::text
          FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname IN ('public','research','elp210_candidate') AND NOT t.tgisinternal ORDER BY key`);
        const out=new Map<string,string>();for(const row of r.rows){if(out.has(row.key))throw new Error("TEST_ONLY_SECURITY_KEY_COLLISION");out.set(row.key,row.value);}return out;
      };
      const before=await fingerprint(),originalSecurity=await security();
      // The snapshot already has elp210_candidate: fresh CREATE SCHEMA is not
      // a valid upgrade path. Never drop that schema or overwrite its rows.
      await expect(db.query(await readFile(join(__dirname,"../src/execution-v2/current-human-candidate.sql"),"utf8")))
        .rejects.toThrow();
      await db.query("ROLLBACK");
      const scripts=["c2-human-issuer-upgrade-candidate.sql","c2-p7-acceptance.sql","c2-p7-registration-table-candidate.sql",
        "c2-p7-owner-intent-candidate.sql","c2-b2-custody.sql","c2-p5-revision-outbox.sql","c2-block-new-fence-candidate.sql",
        "c2-block-new-procedure-core-candidate.sql",
        "restore-local-generation-fence-candidate.sql","restore-local-generation-c2-extension-candidate.sql",
        "c2-delivery-obligation-candidate.sql","restore-local-generation-delivery-extension-candidate.sql"];
      for(const script of scripts){
        const sql=await readFile(join(__dirname,"../src/execution-v2",script),"utf8");
        if(script!=="c2-block-new-procedure-core-candidate.sql"){await db.query(sql);continue;}
        // Test installation as a NOLOGIN definer without granting rights on
        // the historical public tables. This does not qualify the procedure
        // for operation; the real scoped ACL remains a commissioning gate.
        await db.query(`CREATE ROLE test_c2_clone_definer NOLOGIN NOSUPERUSER NOCREATEROLE NOCREATEDB NOREPLICATION NOBYPASSRLS;
          GRANT USAGE,CREATE ON SCHEMA elp210_c2_fence_candidate TO test_c2_clone_definer`);
        const client=await db.connect();
        try{await client.query("BEGIN");await client.query("SET LOCAL ROLE test_c2_clone_definer");
          await client.query(sql);await client.query("COMMIT");}
        catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
        await db.query("REVOKE CREATE ON SCHEMA elp210_c2_fence_candidate FROM test_c2_clone_definer");
      }
      expect(await fingerprint()).toEqual(before);
      const after=await security();for(const [key,value] of originalSecurity)expect(after.get(key),key).toBe(value);
      const cols=await db.query(`SELECT attname FROM pg_attribute WHERE attrelid='elp210_candidate.leases'::regclass
        AND attname IN ('human_issuer','source_trust_digest','human_signing_key_digest','human_assertion_digest',
          'c2_custody_binding_digest','c2_p7_binding_digest','c2_p7_owner_intent_id') AND NOT attisdropped`);
      expect(cols.rows).toHaveLength(7);
      // No inferred issuer, key or owner for legacy records; no gate activated.
      const legacy=await db.query(`SELECT count(*)::text AS n FROM elp210_candidate.leases WHERE human_issuer IS NOT NULL OR
        source_trust_digest IS NOT NULL OR human_signing_key_digest IS NOT NULL OR human_assertion_digest IS NOT NULL OR
        c2_custody_binding_digest IS NOT NULL OR c2_p7_binding_digest IS NOT NULL OR c2_p7_owner_intent_id IS NOT NULL`);
      expect(legacy.rows[0]?.n).toBe("0");
      const seeded=await db.query("SELECT human_issuer,c2_custody_binding_digest,c2_p7_owner_intent_id FROM elp210_candidate.leases WHERE lease_id=$1",[syntheticLease]);
      expect(seeded.rows).toEqual([{human_issuer:null,c2_custody_binding_digest:null,c2_p7_owner_intent_id:null}]);
      const fence=await db.query("SELECT enabled,writer_oid IS NULL AS no_writer FROM portal_local_write_fence.head WHERE singleton");
      expect(fence.rows).toEqual([{enabled:false,no_writer:true}]);
      // Exercise the actual STATUS census against the upgraded historical
      // schema with the pre-upgrade legacy row. No fence is disabled and the
      // synthetic data disappears with the disposable database.
      const census=await db.query(COMMAND_STATUS_ACK_CENSUS_SQL,[context,h("4"),h("5"),h("6"),
        "TEST_ONLY_subject","TEST_ONLY_session",0,"TEST_ONLY_workspace","TEST_ONLY_workload"]);
      expect(census.rows).toEqual([{total:1,unresolved:0}]);
    }finally{await db.end();}
  },120000);
});
