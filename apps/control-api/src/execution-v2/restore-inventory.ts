import { createHash } from "node:crypto";
import type { Pool } from "pg";

/** A diagnostic inventory, not a recovery authorization. In particular, a
 * matching database copy cannot prove independent source authority, fence a
 * former writer, or preserve terminals/ACKs committed after the snapshot. */
export const RESTORE_V2_TABLES = Object.freeze([
  "public.portal_users", "public.password_credentials", "public.activation_credentials", "public.auth_sessions",
  "public.auth_audit_events", "public.account_lifecycle_operations", "public.owner_step_up_grants",
  "public.external_identity_bindings", "public.portal_owner_anchor", "public.workspaces",
  "public.workspace_members", "public.portal_capability_grants", "public.portal_capability_grant_events",
  "public.governance_promotion_authority_grants", "public.portal_access_policy_state",
  "public.portal_access_grants_v2", "public.portal_access_proposals", "public.portal_access_policy_events",
  "public.portal_native_root_obligations", "public.portal_native_current_read_obligations",
  "public.execution_retained_review_access",
  "public.execution_manager_consumer_fences", "public.execution_trusted_commands",
  "public.execution_trusted_command_events", "public.execution_command_status_preparations",
  "public.execution_command_status_context_links", "public.execution_command_status_original_fingerprints",
  "public.execution_command_status_delivery_acks", "elp210_candidate.authority", "elp210_candidate.leases",
  "elp210_candidate.events", "elp210_candidate.mutations", "elp210_candidate.mutation_events",
  "elp210_candidate.native_read_obligations", "elp210_candidate.native_read_events",
] as const);

type TableName = typeof RESTORE_V2_TABLES[number];
type TableFact = { count: number; digest: string };
/** The coverage marker is a diagnostic assertion from the capturing process,
 * not authenticated evidence when an object comes from an untrusted caller. */
const PRE_C2_COVERAGE = "pre-c2-candidate-absence-checked-v2" as const;
export type RestoreInventory = Readonly<{ version: "portal.restore-inventory.v3"; coverage: typeof PRE_C2_COVERAGE;
  tables: Readonly<Record<TableName, TableFact>>; security_digest: string }>;

/** Capture one consistent, read-only database snapshot. SQL identifiers are a
 * closed source list; no row, credential or token leaves PostgreSQL. A bound
 * rejects oversize tables rather than silently hashing a truncated sample. */
export async function captureV2RestoreInventory(pool: Pool, maximumRows = 100_000): Promise<RestoreInventory> {
  if (!Number.isSafeInteger(maximumRows) || maximumRows < 1 || maximumRows > 100_000)
    throw new Error("V2_RESTORE_INVENTORY_ROW_LIMIT_INVALID");
  const client = await pool.connect();
  let discard = false;
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await client.query("SET LOCAL statement_timeout = '10000ms'");
    // PostgreSQL raises an error instead of silently applying an RLS filter when
    // row_security is off; it does not grant BYPASSRLS to this role.
    await client.query("SET LOCAL row_security = off");
    const found = await client.query<{ name: string; oid: string | null; rls_active: boolean | null }>(
      `SELECT name,to_regclass(name)::text AS oid,
        CASE WHEN to_regclass(name) IS NULL THEN NULL ELSE row_security_active(to_regclass(name)) END AS rls_active
        FROM unnest($1::text[]) name`, [RESTORE_V2_TABLES]);
    const expected = new Set<string>(RESTORE_V2_TABLES);
    const actual = new Set(found.rows.map(row => row.name));
    if (found.rows.length !== RESTORE_V2_TABLES.length || actual.size !== expected.size ||
        [...actual].some(name => !expected.has(name)) || found.rows.some(row => row.oid === null))
      throw new Error("V2_RESTORE_INVENTORY_SCHEMA_INCOMPLETE");
    if (found.rows.some(row => row.rls_active !== false))
      throw new Error("V2_RESTORE_INVENTORY_RLS_FILTER_ACTIVE");
    // This v2 format cannot represent candidate C2 authority, preparation,
    // delivery or independent-restore state. Never return a misleading
    // partial match when any such schema, or an extra candidate relation,
    // exists in this same snapshot. Unknown external schemas are not covered.
    const coverage = await client.query<{ unsupported: boolean }>(`SELECT
      EXISTS(SELECT 1 FROM pg_catalog.pg_namespace n WHERE left(n.nspname,10)='elp210_c2_'
        OR n.nspname IN ('portal_local_write_fence','portal_restore_authority','portal_restore_original_custody'))
      OR EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='elp210_candidate' AND c.relkind IN ('r','p','f','m')
          AND NOT (n.nspname||'.'||c.relname=ANY($1::text[]))) AS unsupported`, [RESTORE_V2_TABLES]);
    if (coverage.rows.length !== 1 || typeof coverage.rows[0]?.unsupported !== "boolean" || coverage.rows[0].unsupported)
      throw new Error("V2_RESTORE_INVENTORY_UNSUPPORTED_AUTHORITY_SCOPE");
    const tables = {} as Record<TableName, TableFact>;
    for (const name of RESTORE_V2_TABLES) {
      // Every identifier comes from RESTORE_V2_TABLES, never from caller input.
      const result = await client.query<{ count: number; digest: string }>(`WITH bounded AS (
        SELECT encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') AS h FROM ${name} t LIMIT $1
      ) SELECT count(*)::int AS count,
        encode(sha256(convert_to(coalesce(string_agg(h,'' ORDER BY h),''),'UTF8')),'hex') AS digest FROM bounded`,
      [maximumRows + 1]);
      const fact = result.rows[0];
      if (result.rows.length !== 1 || !fact || !Number.isSafeInteger(fact.count) || fact.count < 0 ||
          fact.count > maximumRows || !/^[a-f0-9]{64}$/.test(fact.digest))
        throw new Error("V2_RESTORE_INVENTORY_ROW_LIMIT_EXCEEDED");
      tables[name] = { count: fact.count, digest: fact.digest };
    }
    const security = await client.query<{ fact: string }>(`SELECT jsonb_build_object(
      'schema',n.nspname,'table',c.relname,'owner',pg_get_userbyid(c.relowner),
      'acl',coalesce(c.relacl,acldefault('r',c.relowner))::text,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,
      'columns',coalesce((SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),
        a.attnotnull,a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum)
        FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
        WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),'[]'::jsonb),
      'constraints',coalesce((SELECT jsonb_agg(jsonb_build_array(k.conname,pg_get_constraintdef(k.oid)) ORDER BY k.conname)
        FROM pg_constraint k WHERE k.conrelid=c.oid),'[]'::jsonb),
      'triggers',coalesce((SELECT jsonb_agg(jsonb_build_array(t.tgname,t.tgenabled,pg_get_triggerdef(t.oid),
        pg_get_functiondef(t.tgfoid)) ORDER BY t.tgname)
        FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal),'[]'::jsonb),
      'policies',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.policyname) FROM pg_policies p
        WHERE p.schemaname=n.nspname AND p.tablename=c.relname),'[]'::jsonb))::text AS fact
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE c.oid=ANY($1::regclass[]) ORDER BY n.nspname,c.relname`, [RESTORE_V2_TABLES]);
    if (security.rows.length !== RESTORE_V2_TABLES.length) throw new Error("V2_RESTORE_SECURITY_INCOMPLETE");
    const security_digest = createHash("sha256").update(JSON.stringify(security.rows.map(row => row.fact))).digest("hex");
    await client.query("COMMIT");
    return { version: "portal.restore-inventory.v3", coverage: PRE_C2_COVERAGE, tables, security_digest };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { discard = true; }
    throw error;
  } finally { client.release(discard); }
}

/** Strict mismatch detection only. MATCH is deliberately not a cutover PASS. */
export function compareV2RestoreInventories(source: RestoreInventory, restored: RestoreInventory): {
  state: "MISMATCH" | "LOCAL_MATCH_NOT_A_CUTOVER_FENCE"; changed_tables: TableName[]; security_changed: boolean } {
  if (source.version !== "portal.restore-inventory.v3" || restored.version !== "portal.restore-inventory.v3")
    throw new Error("V2_RESTORE_INVENTORY_VERSION_INVALID");
  // Legacy captures lack the check and must not be silently reinterpreted as
  // pre-C2. This marker itself is not proof that arbitrary JSON is truthful.
  if (source.coverage !== PRE_C2_COVERAGE || restored.coverage !== PRE_C2_COVERAGE)
    throw new Error("V2_RESTORE_INVENTORY_COVERAGE_UNVERIFIED");
  const changed_tables = RESTORE_V2_TABLES.filter(name => {
    const a = source.tables[name], b = restored.tables[name];
    if (!a || !b || !Number.isSafeInteger(a.count) || !Number.isSafeInteger(b.count)
      || a.count < 0 || b.count < 0 || !/^[a-f0-9]{64}$/.test(a.digest) || !/^[a-f0-9]{64}$/.test(b.digest))
      throw new Error("V2_RESTORE_INVENTORY_INCOMPLETE");
    return a.count !== b.count || a.digest !== b.digest;
  });
  if (!/^[a-f0-9]{64}$/.test(source.security_digest) || !/^[a-f0-9]{64}$/.test(restored.security_digest))
    throw new Error("V2_RESTORE_SECURITY_INCOMPLETE");
  const security_changed = source.security_digest !== restored.security_digest;
  return { state: changed_tables.length || security_changed ? "MISMATCH" : "LOCAL_MATCH_NOT_A_CUTOVER_FENCE",
    changed_tables, security_changed };
}
