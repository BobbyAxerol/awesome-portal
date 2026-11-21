/** ELP2-11 data-preservation evidence, not authorization or recovery readiness.
 * Use a dedicated pg-compatible client: this helper owns one READ ONLY,
 * REPEATABLE READ transaction. It never connects, reads credentials, writes
 * data, invokes a shell, or accepts SQL/table names from its caller.
 *
 * Capture the quiesced source immediately before pg_dump and the restored DB
 * before any reset/recovery writer. Equal hashes do NOT make restored sessions,
 * leases or command attempts safe to reactivate; the separate fencing drill is
 * still required. No row, credential hash, original command or custody body is
 * returned: PostgreSQL hashes the complete JSONB row before sending a page.
 */
import { createHash } from 'node:crypto';

export const PRESERVATION_VERSION = 'portal.elp2-11.preservation.v1';
export const NATIVE_SCHEMA_V1 = Object.freeze({
  version: 'research-current-human.v1',
  schema_sha256: '826e4e083c8db536fc80a0f0ec272e3a71387a5e5d53a9cde48563f41fe32728',
});
export const PRESERVATION_PROFILES = Object.freeze(['PORTAL_V1', 'RESEARCH_CURRENT_HUMAN_V1']);
const SHA = /^[a-f0-9]{64}$(?![\s\S])/;
const canonical = value => JSON.stringify(Array.isArray(value) ? value.map(item => JSON.parse(canonical(item)))
  : value !== null && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, JSON.parse(canonical(value[key]))])) : value);
const hash = value => createHash('sha256').update(value).digest('hex');
const fail = code => { throw new Error(`MIGRATION_PRESERVATION_${code}`); };
const relation = (id, keys, native = false, sequence = null) => Object.freeze({
  id, keys: Object.freeze(keys), native, sequence,
});
// Versioned, closed allowlist. New authority tables/schema versions require an
// explicit inventory revision rather than an ignore-missing fallback.
export const PRESERVATION_RELATIONS = Object.freeze([
  relation('public.pgmigrations', ['id'], false, 'public.pgmigrations_id_seq'),
  relation('public.portal_users', ['user_id']),
  relation('public.external_identity_bindings', ['binding_id']),
  relation('public.password_credentials', ['credential_id']),
  relation('public.activation_credentials', ['activation_id']),
  relation('public.auth_sessions', ['session_id']),
  relation('public.auth_audit_events', ['event_id']),
  relation('public.workspaces', ['workspace_id']),
  relation('public.workspace_members', ['workspace_id', 'user_id']),
  relation('public.portal_owner_anchor', ['anchor_id']),
  relation('public.owner_step_up_grants', ['step_up_id']),
  relation('public.account_lifecycle_operations', ['operation_id']),
  relation('public.portal_capability_grants', ['grant_id']),
  relation('public.portal_capability_grant_events', ['event_id']),
  relation('public.execution_retained_review_access', ['workspace_id', 'user_id']),
  relation('public.portal_access_policy_state', ['workspace_id']),
  relation('public.portal_access_grants_v2', ['grant_id']),
  relation('public.portal_access_proposals', ['proposal_id']),
  relation('public.portal_access_policy_events', ['event_id']),
  relation('public.execution_trusted_commands', ['command_id']),
  relation('public.execution_trusted_command_events', ['command_id', 'event_id']),
  relation('public.portal_native_review_schema', ['version'], true),
  relation('elp210_candidate.authority', ['singleton'], true),
  relation('elp210_candidate.leases', ['lease_id'], true),
  relation('elp210_candidate.events', ['event_id'], true, 'elp210_candidate.events_event_id_seq'),
  relation('elp210_candidate.native_read_obligations', ['lease_id'], true),
  relation('elp210_candidate.native_read_events', ['event_id'], true, 'elp210_candidate.native_read_events_event_id_seq'),
  relation('elp210_candidate.mutations', ['mutation_id'], true),
  relation('elp210_candidate.mutation_events', ['event_id'], true, 'elp210_candidate.mutation_events_event_id_seq'),
  // The union view is also preserved. It is not a new source of authority.
  relation('elp210_candidate.obligations', ['family', 'lease_id'], true),
]);
const ids = PRESERVATION_RELATIONS.map(item => item.id);
const quoted = id => id.split('.').map(part => `"${part}"`).join('.'); // fixed allowlist only
const isNative = profile => profile === 'RESEARCH_CURRENT_HUMAN_V1';

const CATALOGUE_SQL = `/* preservation:catalogue */
  SELECT wanted.id, c.relkind AS kind,
    CASE WHEN c.oid IS NULL THEN NULL ELSE jsonb_build_object(
      'owner',pg_get_userbyid(c.relowner),'acl',c.relacl::text,
      'row_security',c.relrowsecurity,'force_row_security',c.relforcerowsecurity,
      'columns', (SELECT jsonb_agg(jsonb_build_object('name', a.attname,
        'type', format_type(a.atttypid,a.atttypmod), 'not_null',a.attnotnull,
        'identity',a.attidentity,'generated',a.attgenerated,'collation',coll.collname,
        'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum)
        FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
        LEFT JOIN pg_collation coll ON coll.oid=a.attcollation
        WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
      'primary_key', COALESCE((SELECT jsonb_agg(a.attname ORDER BY k.ordinality)
        FROM pg_index i CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY k(attnum,ordinality)
        JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.attnum
        WHERE i.indrelid=c.oid AND i.indisprimary),'[]'::jsonb),
      'constraints', COALESCE((SELECT jsonb_agg(pg_get_constraintdef(k.oid,true) ORDER BY k.conname COLLATE "C")
        FROM pg_constraint k WHERE k.conrelid=c.oid),'[]'::jsonb),
      'indexes', COALESCE((SELECT jsonb_agg(pg_get_indexdef(i.indexrelid) ORDER BY i.indexrelid::regclass::text COLLATE "C")
        FROM pg_index i WHERE i.indrelid=c.oid),'[]'::jsonb),
      'triggers', COALESCE((SELECT jsonb_agg(jsonb_build_object('definition',pg_get_triggerdef(t.oid,true),
        'enabled',t.tgenabled) ORDER BY t.tgname COLLATE "C") FROM pg_trigger t
        WHERE t.tgrelid=c.oid AND NOT t.tgisinternal),'[]'::jsonb),
      'policies', COALESCE((SELECT jsonb_agg(jsonb_build_object('name',p.polname,
        'command',p.polcmd,'permissive',p.polpermissive,'roles',p.polroles::text,
        'qual',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid))
        ORDER BY p.polname COLLATE "C") FROM pg_policy p WHERE p.polrelid=c.oid),'[]'::jsonb),
      'view', CASE WHEN c.relkind='v' THEN pg_get_viewdef(c.oid,true) ELSE NULL END,
      'owned_sequences', COALESCE((SELECT jsonb_agg(jsonb_build_object('name',sn.nspname||'.'||s.relname,
        'column',a.attname) ORDER BY s.relname COLLATE "C") FROM pg_depend d
        JOIN pg_class s ON s.oid=d.objid AND s.relkind='S' JOIN pg_namespace sn ON sn.oid=s.relnamespace
        JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=d.refobjsubid
        WHERE d.classid='pg_class'::regclass AND d.refclassid='pg_class'::regclass
          AND d.refobjid=c.oid AND d.deptype IN('a','i')),'[]'::jsonb)
    ) END AS definition
  FROM unnest($1::text[]) wanted(id)
  LEFT JOIN pg_class c ON c.oid=to_regclass(wanted.id) ORDER BY wanted.id COLLATE "C"`;

function limits(input = {}) {
  const defaults = { page_rows: 256, maximum_rows: 1_000_000, maximum_bytes: 256 * 1024 * 1024 };
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some(key => !Object.hasOwn(defaults, key))) fail('LIMITS_INVALID');
  const value = { ...defaults, ...input };
  if (!Number.isSafeInteger(value.page_rows) || value.page_rows < 1 || value.page_rows > 2048
    || !Number.isSafeInteger(value.maximum_rows) || value.maximum_rows < 1 || value.maximum_rows > defaults.maximum_rows
    || !Number.isSafeInteger(value.maximum_bytes) || value.maximum_bytes < 1 || value.maximum_bytes > defaults.maximum_bytes)
    fail('LIMITS_INVALID');
  return value;
}

/** query(text, values) is the only adapter. It must use one dedicated connection.
 * A profile without native installation rejects ANY partial/present native
 * relation; a native profile requires the exact registered schema and all rows.
 * Schema/sequence comparisons are exact within a PostgreSQL major version. */
export async function capturePreservation(query, { profile, bounds } = {}) {
  if (typeof query !== 'function' || !PRESERVATION_PROFILES.includes(profile)) fail('INPUT_INVALID');
  const budget = limits(bounds);
  let transaction = false;
  const run = async (sql, params = []) => {
    let result;
    try { result = await query(sql, params); } catch { fail('QUERY_FAILED'); }
    if (!result || !Array.isArray(result.rows)) fail('ADAPTER_INVALID');
    return result.rows;
  };
  try {
    await run('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); transaction = true;
    await run(`/* preservation:settings */ SELECT set_config('TimeZone','UTC',true),
      set_config('DateStyle','ISO, YMD',true),set_config('extra_float_digits','3',true),
      set_config('bytea_output','hex',true),set_config('search_path','pg_catalog',true),
      set_config('statement_timeout','5000ms',true),set_config('lock_timeout','1000ms',true)`);
    const context = await run(`/* preservation:context */ SELECT current_database() AS database_name,
      current_setting('server_version_num') AS server_version_num,
      current_setting('server_encoding') AS server_encoding,
      current_setting('transaction_read_only') AS read_only,
      current_setting('transaction_isolation') AS isolation,
      to_regnamespace('elp210_candidate') IS NOT NULL AS native_namespace`);
    const c = context[0];
    if (context.length !== 1 || c?.read_only !== 'on' || c.isolation !== 'repeatable read'
      || c.server_encoding !== 'UTF8' || !/^[0-9]{6}$/.test(c.server_version_num)
      || Number(c.server_version_num) < 140000 || typeof c.database_name !== 'string') fail('SNAPSHOT_REQUIRED');
    if (c.native_namespace !== isNative(profile)) fail('NATIVE_PROFILE_MISMATCH');
    const catalogue = await run(CATALOGUE_SQL, [ids]);
    if (catalogue.length !== ids.length || new Set(catalogue.map(row => row.id)).size !== ids.length
      || catalogue.some(row => !ids.includes(row.id))) fail('CATALOGUE_INVALID');
    const byId = new Map(catalogue.map(row => [row.id, row]));
    if (isNative(profile)) {
      if (!byId.get('public.portal_native_review_schema')?.kind) fail('REQUIRED_RELATION_MISSING');
      const ledger = await run(`/* preservation:native-version */ SELECT version,schema_digest
        FROM public.portal_native_review_schema ORDER BY version COLLATE "C"`);
      if (ledger.length !== 1 || ledger[0].version !== NATIVE_SCHEMA_V1.version
        || ledger[0].schema_digest !== NATIVE_SCHEMA_V1.schema_sha256) fail('NATIVE_VERSION_UNSUPPORTED');
    }
    const entries = [];
    let totalRows = 0, totalBytes = 0;
    for (const item of PRESERVATION_RELATIONS) {
      const meta = byId.get(item.id);
      if (item.native && !isNative(profile)) {
        if (meta.kind !== null || meta.definition !== null) fail('NATIVE_PROFILE_MISMATCH');
        entries.push({ relation: item.id, state: 'ABSENT_BY_PROFILE' });
        continue;
      }
      if (!meta.kind || !meta.definition) fail('REQUIRED_RELATION_MISSING');
      const view = item.id === 'elp210_candidate.obligations';
      if (meta.kind !== (view ? 'v' : 'r') || !Array.isArray(meta.definition.columns)
        || !item.keys.every(key => meta.definition.columns.some(column => column.name === key))
        || canonical(meta.definition.primary_key) !== canonical(view ? [] : item.keys)) fail('RELATION_SCHEMA_MISMATCH');
      const expectedSequences = item.sequence ? [{ name: item.sequence, column: item.keys[0] }] : [];
      if (canonical(meta.definition.owned_sequences) !== canonical(expectedSequences)) fail('SEQUENCE_SCHEMA_MISMATCH');
      const schema_sha256 = hash(canonical({ kind: meta.kind, definition: meta.definition }));
      const rowsHash = createHash('sha256').update(`${PRESERVATION_VERSION}\0${item.id}\0`);
      const key = `jsonb_build_array(${item.keys.map(name => `t."${name}"::text`).join(',')})::text`;
      const sql = `/* preservation:rows:${item.id} */ SELECT ${key} AS cursor,
        encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') AS row_sha256,
        octet_length(to_jsonb(t)::text)::text AS row_bytes FROM ${quoted(item.id)} t
        WHERE $1::text IS NULL OR (${key}) COLLATE "C">$1::text COLLATE "C"
        ORDER BY (${key}) COLLATE "C" LIMIT $2`;
      let cursor = null, row_count = 0, row_bytes = 0;
      for (;;) {
        const page = await run(sql, [cursor, budget.page_rows]);
        if (page.length > budget.page_rows) fail('PAGE_INVALID');
        for (const row of page) {
          if (typeof row.cursor !== 'string' || row.cursor.length > 65536 || !SHA.test(row.row_sha256)
            || !/^[1-9][0-9]{0,15}$/.test(row.row_bytes)
            || cursor !== null && Buffer.compare(Buffer.from(row.cursor), Buffer.from(cursor)) <= 0) fail('PAGE_INVALID');
          const size = Number(row.row_bytes);
          totalRows++; totalBytes += size; row_count++; row_bytes += size;
          if (totalRows > budget.maximum_rows || totalBytes > budget.maximum_bytes) fail('BOUND_EXCEEDED');
          cursor = row.cursor;
          rowsHash.update(row.row_sha256).update('\n');
        }
        if (page.length < budget.page_rows) break;
      }
      let sequence = null;
      if (item.sequence) {
        const values = await run(`/* preservation:sequence:${item.sequence} */
          SELECT last_value::text AS last_value,is_called FROM ${quoted(item.sequence)}`);
        sequence = values[0];
        if (values.length !== 1 || !/^[1-9][0-9]{0,18}$/.test(sequence?.last_value)
          || BigInt(sequence.last_value) > 9223372036854775807n || typeof sequence.is_called !== 'boolean') fail('SEQUENCE_STATE_INVALID');
      }
      entries.push({ relation: item.id, state: 'PRESENT', schema_sha256, row_count, row_bytes,
        rows_sha256: rowsHash.digest('hex'), sequence });
    }
    await run('COMMIT'); transaction = false;
    const snapshot = { schema_version: PRESERVATION_VERSION, profile,
      claim: 'DATA_PRESERVATION_ONLY_NOT_AUTHORITY_OR_RECOVERY_READY',
      database_name: c.database_name, postgres_major: Math.floor(Number(c.server_version_num) / 10000),
      native_schema: isNative(profile) ? NATIVE_SCHEMA_V1 : null, entries };
    return { ...snapshot, fingerprint_sha256: hash(canonical({ ...snapshot, database_name: null })) };
  } finally {
    if (transaction) { try { await query('ROLLBACK', []); } catch { /* preserve safe original error */ } }
  }
}

function validSnapshot(snapshot) {
  if (!snapshot || snapshot.schema_version !== PRESERVATION_VERSION
    || !PRESERVATION_PROFILES.includes(snapshot.profile) || !Array.isArray(snapshot.entries)
    || snapshot.entries.length !== ids.length || !Number.isSafeInteger(snapshot.postgres_major)
    || snapshot.claim !== 'DATA_PRESERVATION_ONLY_NOT_AUTHORITY_OR_RECOVERY_READY'
    || canonical(snapshot.native_schema) !== canonical(isNative(snapshot.profile) ? NATIVE_SCHEMA_V1 : null)) return false;
  for (const [index, item] of PRESERVATION_RELATIONS.entries()) {
    const entry = snapshot.entries[index];
    if (!entry || entry.relation !== item.id) return false;
    if (item.native && !isNative(snapshot.profile)) {
      if (canonical(entry) !== canonical({ relation: item.id, state: 'ABSENT_BY_PROFILE' })) return false;
    } else if (entry.state !== 'PRESENT' || !SHA.test(entry.schema_sha256) || !SHA.test(entry.rows_sha256)
      || !Number.isSafeInteger(entry.row_count) || entry.row_count < 0
      || !Number.isSafeInteger(entry.row_bytes) || entry.row_bytes < 0
      || (item.sequence ? !entry.sequence || !/^[1-9][0-9]{0,18}$/.test(entry.sequence.last_value)
        || BigInt(entry.sequence.last_value) > 9223372036854775807n || typeof entry.sequence.is_called !== 'boolean'
        : entry.sequence !== null)) return false;
  }
  const { fingerprint_sha256, ...body } = snapshot;
  return SHA.test(fingerprint_sha256) && fingerprint_sha256 === hash(canonical({ ...body, database_name: null }));
}

/** No migration/absence/major-version downgrade is inferred. A new profile or
 * schema needs an independently reviewed compatibility mapping, not PASS. */
export function comparePreservation(source, restored) {
  let valid = false;
  try { valid = validSnapshot(source) && validSnapshot(restored); } catch { /* malformed input is never evidence */ }
  if (!valid) fail('MANIFEST_INVALID');
  if (source.profile !== restored.profile || source.postgres_major !== restored.postgres_major)
    return { status: 'INCOMPATIBLE', reasons: ['PROFILE_OR_POSTGRES_MAJOR_CHANGED'], changed_relations: [] };
  const changed_relations = source.entries.flatMap((entry, index) => canonical(entry) === canonical(restored.entries[index])
    ? [] : [entry.relation]);
  return { status: changed_relations.length ? 'CHANGED' : 'PRESERVED',
    reasons: changed_relations.length ? ['SCHEMA_ROWS_OR_SEQUENCE_CHANGED'] : [], changed_relations,
    claim: 'DATA_PRESERVATION_ONLY_NOT_AUTHORITY_OR_RECOVERY_READY' };
}
