/** PRIVATE bounded additive commissioning, NOT a new migration engine/ledger.
 * Reuses existing withTransaction and exact reviewed source bytes. No policy,
 * identity, credential, membership or existing pgmigrations row is seeded.
 * Golden manifests MUST come from a fresh isolated authoritative specimen,
 * independently pinned by the private operator config, NEVER this live target.
 */
import { createHash } from "node:crypto";
import type { Pool,PoolClient } from "pg";
import { withTransaction } from "../db/pool";
import { accessDigest } from "./access-digest";

export const NATIVE_CORE_COMPONENTS={
  p132:{tables:["public.execution_retained_review_access"],functions:[],guards:[]},
  p134:{tables:["public.portal_access_policy_state","public.portal_access_grants_v2","public.portal_access_proposals","public.portal_access_policy_events"],
    functions:["public.portal_access_immutable_event()","public.portal_access_preserve_proposal()"],guards:[]},
  candidate:{tables:["elp210_candidate.authority","elp210_candidate.leases","elp210_candidate.native_read_obligations",
    "elp210_candidate.native_read_events","elp210_candidate.obligations","elp210_candidate.events","elp210_candidate.mutations","elp210_candidate.mutation_events",
    "elp210_candidate.native_read_events_event_id_seq","elp210_candidate.events_event_id_seq","elp210_candidate.mutation_events_event_id_seq"],
    functions:["elp210_candidate.immutable()","elp210_candidate.native_read_event()","elp210_candidate.mutation_event()",
      "elp210_candidate.lease_event()","elp210_candidate.authority_change()"],
    guards:["public.portal_users","public.auth_sessions","public.external_identity_bindings","public.workspaces","public.workspace_members",
      "public.portal_owner_anchor","public.portal_access_policy_state","public.portal_access_grants_v2","public.portal_capability_grants",
      "public.execution_retained_review_access","public.portal_access_policy_events"]},
} as const;
export const NATIVE_GUARD_NAMES=["elp210_authority_guard","elp210_no_truncate"];

/** Mechanical SAME text in both private adoption SQL copies. Parameters:
 * $1 relation names; $2 function signatures; $3 guarded legacy relation names;
 * $4 relation-trigger exclusions (Candidate guards are checked separately).
 * No rows, credentials, mutable authority or source outcomes are inspected.
 * search_path must be pg_catalog,public; ownership is normalized to the
 * independently verified commissioning login, not guessed fixture role names.
 */
export const CORE_NATIVE_MANIFEST_SQL=String.raw`
WITH relations AS (
 SELECT name,to_regclass(name) AS oid FROM unnest($1::text[]) name
), functions AS (
 SELECT name,to_regprocedure(name) AS oid FROM unnest($2::text[]) name
), guards AS (
 SELECT name,to_regclass(name) AS oid FROM unnest($3::text[]) name
)
SELECT jsonb_build_object(
 'relations',COALESCE((SELECT jsonb_agg(jsonb_build_object(
  'name',r.name,'present',r.oid IS NOT NULL,'kind',c.relkind::text,'persistence',c.relpersistence::text,
  'owner_is_current',c.relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user),
  'public_privileges',COALESCE((SELECT jsonb_agg(a.privilege_type ORDER BY a.privilege_type)
   FROM aclexplode(COALESCE(c.relacl,acldefault(CASE WHEN c.relkind='S' THEN 'S'::"char" ELSE 'r'::"char" END,c.relowner))) a WHERE a.grantee=0),'[]'::jsonb),
  'non_owner_privileges',COALESCE((SELECT jsonb_agg(jsonb_build_object(
   'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
   'grantor',CASE WHEN a.grantor=c.relowner THEN 'OWNER' ELSE pg_get_userbyid(a.grantor) END,
   'privilege',a.privilege_type,'grantable',a.is_grantable)
   ORDER BY a.grantee,a.grantor,a.privilege_type,a.is_grantable)
   FROM aclexplode(COALESCE(c.relacl,acldefault(CASE WHEN c.relkind='S' THEN 'S'::"char" ELSE 'r'::"char" END,c.relowner))) a
   WHERE a.grantee<>c.relowner),'[]'::jsonb),
  'sequence',CASE WHEN c.relkind='S' THEN(SELECT jsonb_build_object('start',s.seqstart::text,'increment',s.seqincrement::text,
   'max',s.seqmax::text,'min',s.seqmin::text,'cache',s.seqcache::text,'cycle',s.seqcycle) FROM pg_sequence s WHERE s.seqrelid=c.oid) ELSE NULL END,
  'columns',COALESCE((SELECT jsonb_agg(jsonb_build_object('ordinal',a.attnum,'name',a.attname,
   'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'identity',a.attidentity::text,
   'generated',a.attgenerated::text,'default',pg_get_expr(d.adbin,d.adrelid),
   'collation',CASE WHEN a.attcollation=0 THEN NULL ELSE a.attcollation::regcollation::text END)
   ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
   WHERE a.attrelid=r.oid AND a.attnum>0 AND NOT a.attisdropped),'[]'::jsonb),
  'constraints',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',k.conname,'type',k.contype::text,
   'deferrable',k.condeferrable,'deferred',k.condeferred,'validated',k.convalidated,
   'definition',pg_get_constraintdef(k.oid,false)) ORDER BY k.conname) FROM pg_constraint k WHERE k.conrelid=r.oid),'[]'::jsonb),
  'indexes',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',i.relname,'definition',pg_get_indexdef(i.oid),
   'valid',x.indisvalid,'ready',x.indisready) ORDER BY i.relname) FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid
   WHERE x.indrelid=r.oid),'[]'::jsonb),
  'triggers',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',t.tgname,'enabled',t.tgenabled::text,
   'definition',pg_get_triggerdef(t.oid,false)) ORDER BY t.tgname) FROM pg_trigger t
   WHERE t.tgrelid=r.oid AND NOT t.tgisinternal AND NOT(t.tgname=ANY($4::text[]))),'[]'::jsonb),
  'view',CASE WHEN c.relkind IN('v','m') THEN pg_get_viewdef(r.oid,false) ELSE NULL END)
  ORDER BY r.name) FROM relations r LEFT JOIN pg_class c ON c.oid=r.oid),'[]'::jsonb),
 'functions',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',f.name,'present',f.oid IS NOT NULL,
  'owner_is_current',p.proowner=(SELECT oid FROM pg_roles WHERE rolname=current_user),
  'public_privileges',COALESCE((SELECT jsonb_agg(a.privilege_type ORDER BY a.privilege_type)
   FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0),'[]'::jsonb),
  'non_owner_privileges',COALESCE((SELECT jsonb_agg(jsonb_build_object(
   'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
   'grantor',CASE WHEN a.grantor=p.proowner THEN 'OWNER' ELSE pg_get_userbyid(a.grantor) END,
   'privilege',a.privilege_type,'grantable',a.is_grantable)
   ORDER BY a.grantee,a.grantor,a.privilege_type,a.is_grantable)
   FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
   WHERE a.grantee<>p.proowner),'[]'::jsonb),
  'definition',CASE WHEN f.oid IS NOT NULL THEN pg_get_functiondef(f.oid) ELSE NULL END)
  ORDER BY f.name) FROM functions f LEFT JOIN pg_proc p ON p.oid=f.oid),'[]'::jsonb),
 'guards',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',g.name,'present',g.oid IS NOT NULL,
  'triggers',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',t.tgname,'enabled',t.tgenabled::text,
   'definition',pg_get_triggerdef(t.oid,false)) ORDER BY t.tgname) FROM pg_trigger t
   WHERE t.tgrelid=g.oid AND NOT t.tgisinternal AND t.tgname IN('elp210_authority_guard','elp210_no_truncate')),'[]'::jsonb))
  ORDER BY g.name) FROM guards g),'[]'::jsonb)
) AS manifest`;

type Component=keyof typeof NATIVE_CORE_COMPONENTS;
export type CoreNativeManifests=Record<Component,unknown>;
export interface CoreNativeInstallationInput {
  target:{database_name:string;database_system_identifier:string;role_name:string};
  source:Record<Component,string>;
  approved_sha256:Record<Component,string>;
  expected_manifests:CoreNativeManifests;
  expected_manifest_digest:string;
  /** Exact actual stable ledger census, not an assumed count of 36 entries. */
  expected_migration_names:readonly string[];
  baseline_maximum_rows:number;
}
export class CoreNativeInstallationError extends Error {
  constructor(readonly code:string){super("Native Core schema commissioning is not qualified.");}
}
const fail=(code:string):never=>{throw new CoreNativeInstallationError(code);};
const digest=(v:string)=>createHash("sha256").update(v,"utf8").digest("hex");
/** Same exact Up/Down delimiter used by existing cli/migrate.ts upSqlOf. */
export function nativeMigrationUp(source:string):string{
  const marker="\n-- Down Migration",end=source.indexOf(marker);
  if(!source.startsWith("-- Up Migration\n")||end<0||source.indexOf(marker,end+1)>=0)return fail("NATIVE_SOURCE_WRAPPER_INVALID");
  return source.slice(0,end);
}
export function nativeCandidateBody(source:string):string{
  const match=/^((?:--[^\n]*\n|\s*\n)*)BEGIN;\r?\n([\s\S]*)\r?\nCOMMIT;\s*$/.exec(source);
  if(!match)return fail("NATIVE_SOURCE_WRAPPER_INVALID");
  return match[2]!;
}
export async function readCoreNativeManifest(db:PoolClient,component:Component):Promise<unknown>{
  const spec=NATIVE_CORE_COMPONENTS[component];
  return (await db.query(CORE_NATIVE_MANIFEST_SQL,[spec.tables,spec.functions,spec.guards,
    component==="candidate"?[]:NATIVE_GUARD_NAMES])).rows[0].manifest;
}
const OLD_AUTHORITY=["public.portal_users","public.auth_sessions","public.external_identity_bindings","public.workspaces",
  "public.workspace_members","public.portal_owner_anchor","public.portal_capability_grants","public.pgmigrations"];

/** No secret parser/new provider. This takes already private-reviewed source
 * pins/manifests, never caller SQL or a browser reviewed=true assertion. */
export class CoreNativeInstallation {
  private readonly input:CoreNativeInstallationInput;
  constructor(private readonly pool:Pool,input:CoreNativeInstallationInput){
    this.input=structuredClone(input);
    if(!pool.options||[pool.options.connectionTimeoutMillis,pool.options.query_timeout]
      .some(n=>!Number.isSafeInteger(n)||Number(n)<1||Number(n)>60000))return fail("NATIVE_POOL_TIMEOUT_REQUIRED");
    const c=this.input;
    if(!c.target||Object.values(c.target).some(v=>typeof v!=="string"||!v)||
      !Number.isSafeInteger(c.baseline_maximum_rows)||c.baseline_maximum_rows<1||c.baseline_maximum_rows>100000||
      !Array.isArray(c.expected_migration_names)||c.expected_migration_names.length<1||new Set(c.expected_migration_names).size!==c.expected_migration_names.length||
      !c.expected_manifests||accessDigest(c.expected_manifests)!==c.expected_manifest_digest)return fail("NATIVE_PRIVATE_CONFIG_INVALID");
    for(const key of Object.keys(NATIVE_CORE_COMPONENTS) as Component[]){
      if(typeof c.source[key]!=="string"||c.source[key].length>1048576||!/^[a-f0-9]{64}$/.test(c.approved_sha256[key])||
        digest(c.source[key])!==c.approved_sha256[key]||!c.expected_manifests[key])return fail("NATIVE_SOURCE_PIN_INVALID");
    }
    nativeMigrationUp(c.source.p132);nativeMigrationUp(c.source.p134);nativeCandidateBody(c.source.candidate);
  }
  private async checked(db:PoolClient){
    await db.query("SET LOCAL search_path=pg_catalog,public; SET LOCAL lock_timeout='1000ms'; SET LOCAL statement_timeout='3000ms'");
    const row=(await db.query(`SELECT current_database() AS database_name,(pg_control_system()).system_identifier::text AS database_system_identifier,
      current_user AS role_name,session_user AS login`)).rows[0];
    if(!row||row.database_name!==this.input.target.database_name||row.database_system_identifier!==this.input.target.database_system_identifier||
      row.role_name!==this.input.target.role_name||row.login!==row.role_name)return fail("NATIVE_DATABASE_TARGET_MISMATCH");
    const names=(await db.query("SELECT name FROM public.pgmigrations ORDER BY name")).rows.map(r=>r.name);
    if(accessDigest(names)!==accessDigest([...this.input.expected_migration_names].sort()))return fail("NATIVE_BASELINE_LEDGER_MISMATCH");
  }
  private async state(db:PoolClient){
    const objects=Object.values(NATIVE_CORE_COMPONENTS).flatMap(c=>[...c.tables] as string[]);
    const funcs=Object.values(NATIVE_CORE_COMPONENTS).flatMap(c=>[...c.functions] as string[]);
    const counts=(await db.query(`SELECT
      (SELECT count(*)::int FROM unnest($1::text[]) x WHERE to_regclass(x) IS NOT NULL) relations,
      (SELECT count(*)::int FROM unnest($2::text[]) x WHERE to_regprocedure(x) IS NOT NULL) functions,
      to_regnamespace('elp210_candidate') IS NOT NULL AS candidate_schema`,[objects,funcs])).rows[0];
    if(counts.relations===0&&counts.functions===0&&!counts.candidate_schema)return "ABSENT" as const;
    const ns=(await db.query(`SELECT n.nspowner=(SELECT oid FROM pg_roles WHERE rolname=current_user) owner_matches,
      NOT EXISTS(SELECT 1 FROM aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) a WHERE a.grantee<>n.nspowner) nonowner_revoked,
      (SELECT array_agg('elp210_candidate.'||c.relname ORDER BY c.relname) FROM pg_class c
       WHERE c.relnamespace=n.oid AND c.relkind IN('r','p','v','m','S')) relations,
      (SELECT array_agg(p.oid::regprocedure::text ORDER BY p.oid::regprocedure::text) FROM pg_proc p WHERE p.pronamespace=n.oid) functions
      FROM pg_namespace n WHERE n.nspname='elp210_candidate'`)).rows[0];
    if(!ns||!ns.owner_matches||!ns.nonowner_revoked||
      accessDigest(ns.relations??[])!==accessDigest([...NATIVE_CORE_COMPONENTS.candidate.tables].sort())||
      accessDigest(ns.functions??[])!==accessDigest([...NATIVE_CORE_COMPONENTS.candidate.functions].sort()))return "PARTIAL_OR_DRIFT" as const;
    const manifests={} as CoreNativeManifests;
    for(const key of Object.keys(NATIVE_CORE_COMPONENTS) as Component[])manifests[key]=await readCoreNativeManifest(db,key);
    return accessDigest(manifests)===this.input.expected_manifest_digest?"COMPLETE_EXACT" as const:"PARTIAL_OR_DRIFT" as const;
  }
  private async baseline(db:PoolClient){
    const names=(await db.query(`SELECT 'public.'||c.relname name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind IN('r','p','v','m') AND NOT(c.relname=ANY($1::text[])) ORDER BY c.relname`,
      [[...NATIVE_CORE_COMPONENTS.p132.tables,...NATIVE_CORE_COMPONENTS.p134.tables].map(n=>n.split('.')[1])])).rows.map(r=>r.name);
    const funcs=(await db.query(`SELECT p.oid::regprocedure::text name FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.prokind IN('f','p') AND NOT(p.proname=ANY($1::text[])) ORDER BY 1`,[["portal_access_immutable_event","portal_access_preserve_proposal"]])).rows.map(r=>r.name);
    const shape=(await db.query(CORE_NATIVE_MANIFEST_SQL,[names,funcs,[],NATIVE_GUARD_NAMES])).rows[0].manifest;
    const rows:Record<string,string[]>={};
    for(const table of OLD_AUTHORITY){
      // Only fixed source-authority/ledger identifiers; never caller tables or
      // raw row values. Bound the server result, not an unbounded client dump.
      const found=(await db.query(`SELECT encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') digest
        FROM ${table} t ORDER BY 1 LIMIT $1`,[this.input.baseline_maximum_rows+1])).rows.map(r=>r.digest);
      if(found.length>this.input.baseline_maximum_rows)return fail("NATIVE_BASELINE_BOUND_EXCEEDED");rows[table]=found;
    }
    return accessDigest({shape,rows});
  }
  async status(){return withTransaction(this.pool,async db=>{
    await db.query("SET TRANSACTION READ ONLY");await this.checked(db);return {state:await this.state(db)};
  });}
  async prepare(){
    try{return await withTransaction(this.pool,async db=>{
      await this.checked(db);
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended('portal-native-core-schema-v1',0))");
      await db.query("LOCK TABLE "+OLD_AUTHORITY.join(",")+" IN SHARE ROW EXCLUSIVE MODE");
      const state=await this.state(db);
      if(state==="COMPLETE_EXACT")return {state,disposition:"ACKNOWLEDGED_EXISTING"};
      if(state!=="ABSENT")return fail("NATIVE_SCHEMA_PARTIAL_OR_DRIFT");
      const privilege=(await db.query(`SELECT has_database_privilege(current_user,current_database(),'CREATE')
        AND has_schema_privilege(current_user,'public','CREATE')
        AND NOT EXISTS(SELECT 1 FROM unnest($1::text[]) t WHERE NOT has_table_privilege(current_user,t,'TRIGGER')) allowed`,
        [OLD_AUTHORITY.slice(0,-1)])).rows[0];
      if(!privilege?.allowed)return fail("NATIVE_SCHEMA_PRIVILEGE_MISSING");
      const before=await this.baseline(db);
      // Implicit pg_catalog lookup stays first, while unqualified original
      // CREATE statements target public rather than the system catalog.
      await db.query("SET LOCAL search_path=public");
      await db.query(nativeMigrationUp(this.input.source.p132));
      await db.query(nativeMigrationUp(this.input.source.p134));
      await db.query(nativeCandidateBody(this.input.source.candidate));
      await db.query("SET LOCAL search_path=pg_catalog,public");
      if(await this.state(db)!=="COMPLETE_EXACT")return fail("NATIVE_SCHEMA_MANIFEST_MISMATCH");
      if(await this.baseline(db)!==before)return fail("NATIVE_EXISTING_BASELINE_CHANGED");
      return {state:"COMPLETE_EXACT",disposition:"ADDITIVE_INSTALL_COMMITTED"};
    });}catch(error){
      // Existing withTransaction owns rollback/release. A COMMIT ACK loss is
      // not absence; exact checked status is the only permitted resumption.
      try{if((await this.status()).state==="COMPLETE_EXACT")return {state:"COMPLETE_EXACT",disposition:"EXACT_STATE_ACKNOWLEDGED_AFTER_ERROR"};}catch{}
      if(error instanceof CoreNativeInstallationError)throw error;
      return fail("NATIVE_SCHEMA_OUTCOME_UNCERTAIN");
    }
  }
}
