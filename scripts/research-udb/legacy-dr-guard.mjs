/** The UDB-04 harness fingerprints only its original authority tables.
 * Never use that legacy cutover barrier against the newer Execution policy
 * schema: a matching legacy hash would not protect its grants or custody. */
export const LEGACY_DR_SCHEMA_PROBE = `SELECT
  (to_regnamespace('elp210_candidate') IS NOT NULL OR EXISTS (SELECT 1 FROM unnest(ARRAY[
    'public.portal_access_policy_state', 'public.portal_access_grants_v2',
    'public.portal_native_root_obligations', 'public.portal_native_current_read_obligations',
    'public.execution_command_status_original_fingerprints', 'public.execution_command_status_delivery_acks',
    'public.execution_command_status_context_links', 'public.execution_command_status_preparations'
  ]) AS relation_name WHERE to_regclass(relation_name) IS NOT NULL)) AS has_execution_v2_authority,
  EXISTS (SELECT 1 FROM pgmigrations WHERE CASE WHEN name ~ '^[0-9]{13}_'
    THEN substring(name, 1, 13)::bigint >= 1723680000134 ELSE false END) AS has_execution_v2_migration`;

export function assertLegacyDrSchemaSafe(query) {
  const result = query(LEGACY_DR_SCHEMA_PROBE);
  const rows = result?.rows;
  if (!Array.isArray(rows) || rows.length !== 1 ||
      rows[0].has_execution_v2_authority !== false ||
      rows[0].has_execution_v2_migration !== false) {
    throw new Error('UDB04_DR_LEGACY_AUTHORITY_BARRIER_UNSUPPORTED');
  }
}
