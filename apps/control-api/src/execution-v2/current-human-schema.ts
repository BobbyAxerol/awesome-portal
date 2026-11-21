/** Explicit offline Research installation, never called by main/AppModule or
 * ordinary migrations. Startup uses only the read-only registered-schema check.
 * Frozen custody SQL is not permission to run it elsewhere. */
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import type {Pool,PoolClient} from "pg";
import {z} from "zod";

export const CURRENT_HUMAN_RESEARCH_SCHEMA_VERSION="research-current-human.v1";
export const CURRENT_HUMAN_RESEARCH_SCHEMA_SHA256="efdfc8d3246acbd81df170cbdb5440925148d97abd0b0aa16f20c69fc17d7189";
const text=z.string().min(1).max(256);
export const nativeCoreSchemaTarget=z.object({database_name:text,database_system_identifier:z.string().regex(/^[0-9]{1,20}$/),
  role_name:text,protected_owner_user_id:text,workspace_id:text,
  principal_workspace_pins:z.array(z.object({user_id:text,workspace_id:text}).strict()).length(1)}).strict();
export type NativeCoreSchemaTarget=z.infer<typeof nativeCoreSchemaTarget>;
const dependencies=["auth_sessions","execution_retained_review_access","external_identity_bindings",
  "portal_access_grants_v2","portal_access_policy_events","portal_access_policy_state","portal_capability_grants",
  "portal_owner_anchor","portal_users","workspace_members","workspaces"] as const;
const schemaRelations=["authority","events","leases","mutation_events","mutations","native_read_events","native_read_obligations","obligations"];
const digest=(value:string)=>createHash("sha256").update(value).digest("hex");
function fail(code:string):never{throw new Error(`CURRENT_HUMAN_SCHEMA_${code}`);}

/** Catalog definitions, not data/credentials. This seals every function,
 * relation column/default/constraint/index and enabled guard, not a ledger
 * digest row alone. Stable sorting makes same-target restart comparisons exact. */
async function catalogue(db:PoolClient):Promise<string>{
  const rows=await db.query<{kind:string;name:string;definition:string}>(`
    WITH objects AS (
      SELECT 'function' AS kind,p.proname AS name,concat_ws('|',p.proowner::text,p.proacl::text,pg_get_functiondef(p.oid)) AS definition
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='elp210_candidate'
      UNION ALL SELECT 'namespace',n.nspname,concat_ws('|',n.nspowner::text,n.nspacl::text)
      FROM pg_namespace n WHERE n.nspname='elp210_candidate'
      UNION ALL SELECT 'relation',c.relname,concat_ws('|',c.relkind,c.relowner::text,c.relacl::text)
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='elp210_candidate'
        OR n.nspname='public' AND c.relname IN('portal_native_review_schema','portal_native_review_schema_pkey')
      UNION ALL SELECT 'column',c.relname||'.'||a.attname,
        concat_ws('|',a.attnum::text,format_type(a.atttypid,a.atttypmod),a.attnotnull::text,a.attidentity::text,pg_get_expr(d.adbin,d.adrelid))
      FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
      WHERE (n.nspname='elp210_candidate' OR n.nspname='public' AND c.relname='portal_native_review_schema') AND a.attnum>0 AND NOT a.attisdropped
      UNION ALL SELECT 'constraint',c.relname||'.'||k.conname,pg_get_constraintdef(k.oid,true)
      FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='elp210_candidate' OR n.nspname='public' AND c.relname='portal_native_review_schema'
      UNION ALL SELECT 'index',c.relname,pg_get_indexdef(c.oid)
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE (n.nspname='elp210_candidate'
        OR n.nspname='public' AND c.relname='portal_native_review_schema_pkey') AND c.relkind='i'
      UNION ALL SELECT 'view',c.relname,pg_get_viewdef(c.oid,true)
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='elp210_candidate' AND c.relkind='v'
      UNION ALL SELECT 'trigger',n.nspname||'.'||c.relname||'.'||t.tgname,concat_ws('|',t.tgenabled,pg_get_triggerdef(t.oid,true))
      FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE NOT t.tgisinternal AND (n.nspname='elp210_candidate' OR n.nspname='public' AND
        (t.tgname IN('elp210_authority_guard','elp210_no_truncate') OR c.relname='portal_native_review_schema'))
    ) SELECT kind,name,definition FROM objects ORDER BY kind COLLATE "C",name COLLATE "C",definition COLLATE "C"`);
  if(rows.rows.length<50)fail("DRIFT");
  return digest(JSON.stringify(rows.rows));
}
async function assertTarget(db:PoolClient,target:NativeCoreSchemaTarget,lock:boolean):Promise<void>{
  const actual=await db.query(`SELECT current_database() AS database_name,current_user AS role_name,
    session_user AS session_role_name,(pg_control_system()).system_identifier::text AS database_system_identifier`);
  const row=actual.rows[0];
  if(actual.rowCount!==1||row.database_name!==target.database_name||row.role_name!==target.role_name||
    row.session_role_name!==target.role_name||row.database_system_identifier!==target.database_system_identifier)fail("TARGET_MISMATCH");
  const found=await db.query("SELECT name,to_regclass('public.'||name)::text AS relation FROM unnest($1::text[]) name",[dependencies]);
  if(found.rows.length!==dependencies.length||found.rows.some(r=>!r.relation))fail("DEPENDENCY_MISSING");
  const owner=await db.query("SELECT user_id FROM portal_owner_anchor WHERE anchor_id='PORTAL_OWNER'"+(lock?" FOR SHARE":""));
  if(owner.rowCount!==1||owner.rows[0].user_id!==target.protected_owner_user_id)fail("TARGET_MISMATCH");
  for(const pin of target.principal_workspace_pins){
    if(pin.workspace_id!==target.workspace_id)fail("TARGET_MISMATCH");
    const member=await db.query(`SELECT u.user_id FROM portal_users u JOIN workspace_members m ON m.user_id=u.user_id
      JOIN workspaces w ON w.workspace_id=m.workspace_id
      WHERE u.user_id=$1 AND m.workspace_id=$2 AND u.status='ACTIVE' AND NOT u.must_change_password AND u.archived_at IS NULL
      ${lock?"FOR SHARE OF u,m,w":""}`,[pin.user_id,pin.workspace_id]);
    if(member.rowCount!==1)fail("TARGET_MISMATCH");
  }
}

export async function installResearchCurrentHumanSchema(pool:Pool,input:NativeCoreSchemaTarget,
  sourcePath=join(__dirname,"../../native-schema/current-human-candidate.sql")){
  return researchSchema(pool,input,sourcePath,true);
}
export async function assertRegisteredResearchCurrentHumanSchema(pool:Pool,input:NativeCoreSchemaTarget,
  sourcePath=join(__dirname,"../../native-schema/current-human-candidate.sql")){
  return researchSchema(pool,input,sourcePath,false);
}
async function researchSchema(pool:Pool,input:NativeCoreSchemaTarget,sourcePath:string,install:boolean){
  const parsed=nativeCoreSchemaTarget.safeParse(input);if(!parsed.success)fail("TARGET_MISMATCH");
  const target=parsed.data;
  let source:string;try{source=readFileSync(sourcePath,"utf8");}catch{return fail("INPUT_CHANGED");}
  if(digest(source)!==CURRENT_HUMAN_RESEARCH_SCHEMA_SHA256)fail("INPUT_CHANGED");
  const prefix=source.indexOf("\nBEGIN;\n");
  if(prefix<0||!source.endsWith("\nCOMMIT;\n"))fail("INPUT_CHANGED");
  // Do NOT strip the BEGINs inside PL/pgSQL or commit before verification.
  const body=source.slice(prefix+"\nBEGIN;\n".length,-"COMMIT;\n".length);
  const db=await pool.connect();
  try{
    await db.query(install?"BEGIN":"BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await db.query("SET LOCAL lock_timeout='1500ms'; SET LOCAL statement_timeout='15000ms'; SET LOCAL search_path=public,pg_catalog");
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended('research-current-human-schema',0))");
    await assertTarget(db,target,install);
    await db.query(`LOCK TABLE ${dependencies.map(name=>`public.${name}`).join(",")} IN ${install?"SHARE ROW EXCLUSIVE":"ACCESS SHARE"} MODE`);
    const existing=await db.query("SELECT to_regnamespace('elp210_candidate') AS schema,to_regclass('public.portal_native_review_schema') AS ledger");
    let installed=false,observed:string;
    const targetDigest=digest(JSON.stringify(target));
    if(existing.rows[0].schema||existing.rows[0].ledger){
      if(!existing.rows[0].schema||!existing.rows[0].ledger)fail("UNREGISTERED");
      const recorded=await db.query("SELECT schema_digest,target_digest,catalogue_digest FROM portal_native_review_schema WHERE version=$1",[CURRENT_HUMAN_RESEARCH_SCHEMA_VERSION]);
      if(recorded.rowCount!==1||recorded.rows[0].schema_digest!==CURRENT_HUMAN_RESEARCH_SCHEMA_SHA256||
        recorded.rows[0].target_digest!==targetDigest)fail("DRIFT");
      observed=await catalogue(db);
      if(observed!==recorded.rows[0].catalogue_digest)fail("DRIFT");
    }else{
      if(!install)fail("UNREGISTERED");
      const collision=await db.query(`SELECT 1 FROM pg_trigger WHERE NOT tgisinternal AND tgname IN('elp210_authority_guard','elp210_no_truncate') LIMIT 1`);
      if(collision.rowCount)fail("UNREGISTERED");
      await db.query(body);
      const inventory=await db.query(`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='elp210_candidate' AND c.relkind IN('r','v') ORDER BY c.relname COLLATE "C"`);
      if(JSON.stringify(inventory.rows.map(r=>r.relname))!==JSON.stringify(schemaRelations))fail("DRIFT");
      await db.query(`CREATE TABLE portal_native_review_schema(version text PRIMARY KEY,schema_digest text NOT NULL,
        target_digest text NOT NULL,catalogue_digest text NOT NULL,installed_at timestamptz NOT NULL DEFAULT clock_timestamp());
        REVOKE ALL ON portal_native_review_schema FROM PUBLIC;
        CREATE TRIGGER preserve_native_schema_ledger BEFORE UPDATE OR DELETE OR TRUNCATE ON portal_native_review_schema
        FOR EACH STATEMENT EXECUTE FUNCTION elp210_candidate.immutable()`);
      observed=await catalogue(db);
      await db.query("INSERT INTO portal_native_review_schema(version,schema_digest,target_digest,catalogue_digest) VALUES($1,$2,$3,$4)",
        [CURRENT_HUMAN_RESEARCH_SCHEMA_VERSION,CURRENT_HUMAN_RESEARCH_SCHEMA_SHA256,targetDigest,observed]);
      installed=true;
    }
    await db.query("COMMIT");
    return {schema_version:CURRENT_HUMAN_RESEARCH_SCHEMA_VERSION,schema_sha256:CURRENT_HUMAN_RESEARCH_SCHEMA_SHA256,
      catalogue_sha256:observed,installed};
  }catch(error){await db.query("ROLLBACK").catch(()=>undefined);throw error;}
  finally{db.release();}
}
