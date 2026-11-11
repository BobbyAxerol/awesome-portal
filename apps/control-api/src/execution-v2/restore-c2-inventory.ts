import {createHash} from "node:crypto";
import type {PoolClient} from "pg";
import {RESTORE_V2_TABLES} from "./restore-inventory";

/** Frozen candidate profile, not a claim of complete Portal/source coverage.
 * No caller-selected table, row or SQL identifier is accepted. The qualified
 * production profile must be reviewed whenever schema/authority changes. */
export const RESTORE_C2_INVENTORY_TABLES=Object.freeze([...RESTORE_V2_TABLES,
  "elp210_c2_p7_candidate.records","elp210_c2_p7_candidate.owner_intents",
  "elp210_c2_p7_candidate.owner_intent_revocations","elp210_c2_p7_candidate.registrations",
  "elp210_c2_fence_candidate.scopes","elp210_c2_fence_candidate.events","elp210_c2_fence_candidate.procedure_scope_pin",
  "elp210_c2_delivery_candidate.limits","elp210_c2_delivery_candidate.obligations","elp210_c2_delivery_candidate.events",
  "elp210_c2_revision_candidate.baseline","elp210_c2_revision_candidate.events","elp210_c2_revision_candidate.overflow",
  "elp210_c2_preparation.b2_attempts","portal_local_write_fence.head","portal_local_write_fence.writer_history",
  "portal_local_write_fence.freeze_history"] as const);

/** Requires an existing caller-owned READ COMMITTED transaction. Acquires
 * SHARE table locks in stable order before reading: this blocks writes on this
 * exact table set until the caller commits/rolls back, not external sources,
 * privileged DDL, routine/role changes, other tables, old database copies,
 * HTTP or source ACKs. Function catalogue is observed, not DDL-fenced.
 * It returns one commitment only, never source rows or individual hashes. */
export async function captureLockedC2Inventory(db:PoolClient,maximumRows:number):Promise<string> {
  if(!Number.isSafeInteger(maximumRows)||maximumRows<1||maximumRows>10000)throw new Error("V2_C2_INVENTORY_LIMIT_INVALID");
  const names=[...RESTORE_C2_INVENTORY_TABLES].sort();
  if(new Set(names).size!==names.length)throw new Error("V2_C2_INVENTORY_PROFILE_INVALID");
  const started=Date.now();
  // Constant identifiers only. A missing relation or insufficient LOCK/SELECT
  // privilege causes PostgreSQL to fail before any checkpoint is written.
  await db.query(`LOCK TABLE ${names.join(",")} IN SHARE MODE`);
  await db.query("SET LOCAL row_security=off");
  const found=await db.query<{name:string;kind:string;rls_active:boolean}>(`SELECT name,c.relkind AS kind,
    row_security_active(c.oid) AS rls_active FROM unnest($1::text[]) name
    JOIN pg_catalog.pg_class c ON c.oid=to_regclass(name)`,[names]);
  if(found.rows.length!==names.length||new Set(found.rows.map(row=>row.name)).size!==names.length||
    found.rows.some(row=>!names.includes(row.name as typeof names[number])||row.kind!=="r"||row.rls_active!==false))
    throw new Error("V2_C2_INVENTORY_SCHEMA_OR_RLS_INVALID");
  const unknown=await db.query<{unsupported:boolean}>(`SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE
    (n.nspname='elp210_candidate' OR left(n.nspname,10)='elp210_c2_' OR n.nspname='portal_local_write_fence')
    AND c.relkind IN ('r','p','f','m') AND NOT (n.nspname||'.'||c.relname=ANY($1::text[])))
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname IN
      ('portal_restore_authority','portal_restore_original_custody')) AS unsupported`,[names]);
  if(unknown.rows.length!==1||unknown.rows[0]?.unsupported!==false)throw new Error("V2_C2_INVENTORY_SCOPE_UNSUPPORTED");
  const facts:Array<[string,number,string]>=[];
  for(const name of names) {
    if(Date.now()-started>15000)throw new Error("V2_C2_INVENTORY_DEADLINE");
    const result=await db.query<{count:number;digest:string}>(`WITH bounded AS (
      SELECT encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') AS h FROM ${name} t LIMIT $1
    ) SELECT count(*)::int AS count,encode(sha256(convert_to(coalesce(string_agg(h,'' ORDER BY h),''),'UTF8')),'hex') AS digest FROM bounded`,[maximumRows+1]);
    const row=result.rows[0];
    if(result.rows.length!==1||!row||!Number.isSafeInteger(row.count)||row.count<0||row.count>maximumRows||!/^[a-f0-9]{64}$/.test(row.digest))
      throw new Error("V2_C2_INVENTORY_ROW_LIMIT_EXCEEDED");
    facts.push([name,row.count,row.digest]);
  }
  const security=await db.query<{fact:string}>(`SELECT jsonb_build_object(
    'schema',n.nspname,'table',c.relname,'owner',pg_get_userbyid(c.relowner),
    'acl',coalesce(c.relacl,acldefault('r',c.relowner))::text,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,
    'columns',coalesce((SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),
      a.attnotnull,a.attidentity,a.attgenerated,coalesce(a.attacl::text,'{}'),pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum)
      FROM pg_catalog.pg_attribute a LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),'[]'::jsonb),
    'constraints',coalesce((SELECT jsonb_agg(jsonb_build_array(k.conname,pg_get_constraintdef(k.oid)) ORDER BY k.conname)
      FROM pg_catalog.pg_constraint k WHERE k.conrelid=c.oid),'[]'::jsonb),
    'triggers',coalesce((SELECT jsonb_agg(jsonb_build_array(t.tgname,t.tgenabled,pg_get_triggerdef(t.oid),
      pg_get_functiondef(t.tgfoid)) ORDER BY t.tgname) FROM pg_catalog.pg_trigger t
      WHERE t.tgrelid=c.oid AND NOT t.tgisinternal),'[]'::jsonb),
    'policies',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.policyname) FROM pg_catalog.pg_policies p
      WHERE p.schemaname=n.nspname AND p.tablename=c.relname),'[]'::jsonb))::text AS fact
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE c.oid=ANY($1::regclass[]) ORDER BY n.nspname,c.relname`,[names]);
  if(security.rows.length!==names.length||security.rows.some(row=>typeof row.fact!=="string"))
    throw new Error("V2_C2_INVENTORY_SECURITY_INCOMPLETE");
  // Procedure/definer bodies and EXECUTE ACLs can affect the fence without
  // appearing as triggers on any captured table. Observe the bounded C2
  // namespace catalogue as facts, not as proof these functions are safe or
  // that their definitions cannot change concurrently or after this query.
  const routines=await db.query<{fact:string;kind:string}>(`SELECT p.prokind AS kind,jsonb_build_object(
    'schema',n.nspname,'name',p.proname,'arguments',pg_get_function_identity_arguments(p.oid),
    'kind',p.prokind,'owner',pg_get_userbyid(p.proowner),
    'acl',coalesce(p.proacl,acldefault('f',p.proowner))::text,'security_definer',p.prosecdef,
    'leakproof',p.proleakproof,'config',p.proconfig,
    'definition',CASE WHEN p.prokind IN ('f','p') THEN pg_get_functiondef(p.oid) ELSE NULL END)::text AS fact
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE (n.nspname='elp210_candidate' OR left(n.nspname,10)='elp210_c2_' OR n.nspname='portal_local_write_fence')
    ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) LIMIT 10001`);
  if(routines.rows.length>10000||routines.rows.some(row=>typeof row.fact!=="string"||!["f","p"].includes(row.kind)))
    throw new Error("V2_C2_INVENTORY_ROUTINE_LIMIT_OR_SCHEMA_INVALID");
  if(Date.now()-started>15000)throw new Error("V2_C2_INVENTORY_DEADLINE");
  return createHash("sha256").update(JSON.stringify(["portal.restore-c2-inventory.candidate.v4",facts,
    security.rows.map(row=>row.fact),routines.rows.map(row=>row.fact)]),"utf8").digest("hex");
}
