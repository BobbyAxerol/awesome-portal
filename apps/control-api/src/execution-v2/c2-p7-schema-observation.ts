import {createHash} from "node:crypto";
import type {Pool} from "pg";
import {nativeCoreSchemaTarget,type NativeCoreSchemaTarget} from "./current-human-schema";

/** Read-only inventory for an independently reviewed P7 installation.
 * This digest is an observation, not authority, registration, a startup
 * admission decision, or a substitute for privilege/owner qualification. */
export async function observeC2P7Schema(pool:Pool,input:NativeCoreSchemaTarget) {
  const target=nativeCoreSchemaTarget.parse(input);
  const db=await pool.connect();
  try {
    await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await db.query("SET LOCAL lock_timeout='1500ms'; SET LOCAL statement_timeout='15000ms'; SET LOCAL search_path=pg_catalog");
    const actual=await db.query(`SELECT current_database() AS database_name,current_user AS role_name,
      session_user AS session_role_name,(pg_control_system()).system_identifier::text AS database_system_identifier`);
    const a=actual.rows[0];
    if(actual.rowCount!==1||a.database_name!==target.database_name||a.role_name!==target.role_name||
      a.session_role_name!==target.role_name||a.database_system_identifier!==target.database_system_identifier)
      throw new Error("C2_P7_SCHEMA_TARGET_MISMATCH");
    const catalogue=await db.query<{kind:string;name:string;definition:string}>(`
      WITH objects AS (
        SELECT 'namespace' AS kind,n.nspname AS name,concat_ws('|',n.nspowner::text,n.nspacl::text) AS definition
          FROM pg_namespace n WHERE n.nspname='elp210_c2_p7_candidate'
        UNION ALL SELECT 'function',p.proname||pg_get_function_identity_arguments(p.oid),
          concat_ws('|',p.proowner::text,p.proacl::text,pg_get_functiondef(p.oid))
          FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='elp210_c2_p7_candidate'
        UNION ALL SELECT 'relation',c.relname,concat_ws('|',c.relkind,c.relowner::text,c.relacl::text,c.relrowsecurity::text,c.relforcerowsecurity::text)
          FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='elp210_c2_p7_candidate'
        UNION ALL SELECT 'column',c.relname||'.'||a.attname,concat_ws('|',a.attnum::text,
          format_type(a.atttypid,a.atttypmod),a.attnotnull::text,a.attidentity::text,a.attacl::text,pg_get_expr(d.adbin,d.adrelid))
          FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
          LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
          WHERE n.nspname='elp210_c2_p7_candidate' AND a.attnum>0 AND NOT a.attisdropped
        UNION ALL SELECT 'constraint',c.relname||'.'||k.conname,pg_get_constraintdef(k.oid,true)
          FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='elp210_c2_p7_candidate'
        UNION ALL SELECT 'index',c.relname,concat_ws('|',pg_get_indexdef(c.oid),
          i.indisvalid::text,i.indisready::text,i.indislive::text,i.indcheckxmin::text)
          FROM pg_class c JOIN pg_index i ON i.indexrelid=c.oid
          JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='elp210_c2_p7_candidate' AND c.relkind IN ('i','I')
        UNION ALL SELECT 'trigger',c.relname||'.'||t.tgname,concat_ws('|',t.tgenabled,pg_get_triggerdef(t.oid,true))
          FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='elp210_c2_p7_candidate' AND NOT t.tgisinternal
        UNION ALL SELECT 'policy',c.relname||'.'||p.polname,concat_ws('|',p.polcmd,p.polpermissive::text,p.polroles::text,
          pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid))
          FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='elp210_c2_p7_candidate'
      ) SELECT kind,name,definition FROM objects ORDER BY kind COLLATE "C",name COLLATE "C",definition COLLATE "C"`);
    const relations=new Set(catalogue.rows.filter(r=>r.kind==="relation").map(r=>r.name));
    if(!catalogue.rows.some(r=>r.kind==="namespace")||
      !["records","registrations","owner_intents","owner_intent_revocations"].every(n=>relations.has(n)))
      throw new Error("C2_P7_SCHEMA_INCOMPLETE");
    // Include transitive membership and effective rights separately from the
    // catalogue: ACL text can stay unchanged while a role becomes reachable.
    // This is diagnostic only; database/external owners and race-safe trust
    // still require an independently registered installation and fence.
    const rights=await db.query<{kind:string;name:string;definition:string}>(`
      WITH RECURSIVE actor_roles(oid) AS (
        SELECT oid FROM pg_roles WHERE rolname=current_user
        UNION SELECT m.roleid FROM pg_auth_members m JOIN actor_roles r ON r.oid=m.member
      ), objects AS (
        SELECT 'role' AS kind,r.rolname AS name,concat_ws('|',r.oid::text,r.rolsuper::text,r.rolinherit::text,
          r.rolcreaterole::text,r.rolcreatedb::text,r.rolcanlogin::text,r.rolreplication::text,
          r.rolbypassrls::text,r.rolvaliduntil::text) AS definition
          FROM pg_roles r JOIN actor_roles a ON a.oid=r.oid
        UNION ALL SELECT 'membership',m.member::text||':'||m.roleid::text,to_jsonb(m)::text
          FROM pg_auth_members m JOIN actor_roles a ON a.oid=m.member
        UNION ALL SELECT 'database',d.datname,concat_ws('|',d.datdba::text,d.datacl::text)
          FROM pg_database d WHERE d.datname=current_database()
        UNION ALL SELECT 'reachable-parameter',r.rolname||':session_replication_role',
          has_parameter_privilege(r.oid,'session_replication_role','SET')::text
          FROM pg_roles r JOIN actor_roles a ON a.oid=r.oid
        UNION ALL SELECT 'reachable-schema',r.rolname||':'||n.nspname,concat_ws('|',
          has_schema_privilege(r.oid,n.oid,'USAGE')::text,has_schema_privilege(r.oid,n.oid,'CREATE')::text)
          FROM pg_roles r JOIN actor_roles a ON a.oid=r.oid CROSS JOIN pg_namespace n
          WHERE n.nspname='elp210_c2_p7_candidate'
        UNION ALL SELECT 'reachable-table',r.rolname||':'||c.relname,concat_ws('|',
          has_any_column_privilege(r.oid,c.oid,'INSERT')::text,
          has_any_column_privilege(r.oid,c.oid,'UPDATE')::text,
          has_table_privilege(r.oid,c.oid,'DELETE')::text,has_table_privilege(r.oid,c.oid,'TRUNCATE')::text,
          has_table_privilege(r.oid,c.oid,'TRIGGER')::text)
          FROM pg_roles r JOIN actor_roles a ON a.oid=r.oid CROSS JOIN pg_class c
          JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='elp210_c2_p7_candidate' AND c.relkind IN ('r','p','v','m','f')
        UNION ALL SELECT 'effective-schema',n.nspname,concat_ws('|',
          has_schema_privilege(current_user,n.oid,'USAGE')::text,has_schema_privilege(current_user,n.oid,'CREATE')::text)
          FROM pg_namespace n WHERE n.nspname='elp210_c2_p7_candidate'
        UNION ALL SELECT 'effective-table',c.relname,concat_ws('|',
          has_table_privilege(current_user,c.oid,'SELECT')::text,has_table_privilege(current_user,c.oid,'INSERT')::text,
          has_any_column_privilege(current_user,c.oid,'INSERT')::text,
          has_table_privilege(current_user,c.oid,'UPDATE')::text,has_any_column_privilege(current_user,c.oid,'UPDATE')::text,
          has_table_privilege(current_user,c.oid,'DELETE')::text,
          has_table_privilege(current_user,c.oid,'TRUNCATE')::text,has_table_privilege(current_user,c.oid,'TRIGGER')::text)
          FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='elp210_c2_p7_candidate' AND c.relkind IN ('r','p','v','m','f')
        UNION ALL SELECT 'effective-function',p.proname||pg_get_function_identity_arguments(p.oid),
          has_function_privilege(current_user,p.oid,'EXECUTE')::text
          FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='elp210_c2_p7_candidate'
      ) SELECT kind,name,definition FROM objects ORDER BY kind COLLATE "C",name COLLATE "C",definition COLLATE "C"`);
    if(!rights.rows.some(r=>r.kind==="role")||rights.rows.length>4096)throw new Error("C2_P7_SCHEMA_ROLE_INCOMPLETE");
    // Version the observation because index validity was absent from the old
    // digest. A former pin cannot be silently interpreted under this format.
    const catalogueVersion="p7-catalogue-v2" as const;
    const sha256=createHash("sha256").update(JSON.stringify({version:catalogueVersion,objects:catalogue.rows})).digest("hex");
    const rightsSha256=createHash("sha256").update(JSON.stringify(rights.rows)).digest("hex");
    await db.query("COMMIT");
    return Object.freeze({kind:"P7_CATALOGUE_OBSERVATION_NOT_AUTHORITY" as const,catalogue_version:catalogueVersion,sha256,objects:catalogue.rows.length,
      rights_sha256:rightsSha256,rights_objects:rights.rows.length});
  } catch(error) {await db.query("ROLLBACK").catch(()=>undefined);throw error;}
  finally {db.release();}
}

/** Necessary negative checks for a restricted P7 login. Passing is not a
 * sufficient installation verifier: provenance, trusted owner/definer roles,
 * external dependencies and concurrent policy changes remain independent. */
export async function assertC2P7RestrictedRoleCandidate(pool:Pool,input:NativeCoreSchemaTarget):Promise<void> {
  const target=nativeCoreSchemaTarget.parse(input),db=await pool.connect();
  try {
    await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await db.query("SET LOCAL lock_timeout='1500ms'; SET LOCAL statement_timeout='15000ms'; SET LOCAL search_path=pg_catalog");
    const actual=await db.query(`SELECT current_database() AS database_name,current_user AS role_name,
      session_user AS session_role_name,(pg_control_system()).system_identifier::text AS database_system_identifier`);
    const a=actual.rows[0];
    if(actual.rowCount!==1||a.database_name!==target.database_name||a.role_name!==target.role_name||
      a.session_role_name!==target.role_name||a.database_system_identifier!==target.database_system_identifier)
      throw new Error("C2_P7_SCHEMA_TARGET_MISMATCH");
    const check=await db.query<{unsafe:boolean;complete:boolean}>(`
      WITH RECURSIVE actor_roles(oid) AS (
        SELECT oid FROM pg_roles WHERE rolname=current_user
        UNION SELECT m.roleid FROM pg_auth_members m JOIN actor_roles r ON r.oid=m.member
      ), namespace AS (SELECT oid,nspowner FROM pg_namespace WHERE nspname='elp210_c2_p7_candidate'),
      guarded AS (SELECT c.oid,c.relowner,c.relname FROM pg_class c JOIN namespace n ON n.oid=c.relnamespace
        WHERE c.relname IN ('records','registrations','owner_intents','owner_intent_revocations') AND c.relkind IN ('r','p'))
      SELECT ((SELECT count(*) FROM namespace)=1 AND (SELECT count(*) FROM guarded)=4 AND
        COALESCE((SELECT has_schema_privilege(current_user,oid,'USAGE') FROM namespace),false)) AS complete,
      (EXISTS(SELECT 1 FROM pg_roles r JOIN actor_roles a ON a.oid=r.oid WHERE
        r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication OR r.rolbypassrls)
        OR EXISTS(SELECT 1 FROM pg_database d JOIN actor_roles a ON a.oid=d.datdba WHERE d.datname=current_database())
        OR EXISTS(SELECT 1 FROM actor_roles a WHERE has_parameter_privilege(a.oid,'session_replication_role','SET'))
        OR EXISTS(SELECT 1 FROM namespace n JOIN actor_roles a ON a.oid=n.nspowner)
        OR EXISTS(SELECT 1 FROM namespace n CROSS JOIN actor_roles a WHERE has_schema_privilege(a.oid,n.oid,'CREATE'))
        OR EXISTS(SELECT 1 FROM pg_class c JOIN namespace n ON n.oid=c.relnamespace JOIN actor_roles a ON a.oid=c.relowner)
        OR EXISTS(SELECT 1 FROM pg_proc p JOIN namespace n ON n.oid=p.pronamespace JOIN actor_roles a ON a.oid=p.proowner)
        OR EXISTS(SELECT 1 FROM guarded c CROSS JOIN actor_roles a WHERE has_any_column_privilege(a.oid,c.oid,'INSERT') OR
          has_table_privilege(a.oid,c.oid,'DELETE') OR
          has_table_privilege(a.oid,c.oid,'TRUNCATE') OR has_table_privilege(a.oid,c.oid,'TRIGGER') OR
          has_any_column_privilege(a.oid,c.oid,'UPDATE'))) AS unsafe`);
    if(check.rowCount!==1||check.rows[0]?.complete!==true||check.rows[0]?.unsafe!==false)
      throw new Error("C2_P7_RUNTIME_ROLE_UNSAFE");
    await db.query("COMMIT");
  } catch(error){await db.query("ROLLBACK").catch(()=>undefined);throw error;}
  finally{db.release();}
}
