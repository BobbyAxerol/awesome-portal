/** The UDB-04 harness fingerprints only its original authority tables.
 * Never use that legacy cutover barrier against the newer Execution policy
 * schema: a matching legacy hash would not protect its grants or custody. */
export const LEGACY_DR_SCHEMA_PROBE = `SELECT
  (EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname IN
    ('elp210_candidate', 'portal_local_write_fence', 'portal_restore_authority', 'portal_restore_original_custody')
    OR left(nspname, 10) = 'elp210_c2_') OR EXISTS (SELECT 1 FROM unnest(ARRAY[
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

/** A safe target before pg_restore does not prove the archive is legacy.
 * Check again after each restore while applications remain stopped. If either
 * probe or restore fails the caller must leave cutover disabled. This does not
 * provide quiescence, an independent authority checkpoint or V2 recovery. */
export function restoreLegacyCoreGuarded(restore, verify) {
  verify();
  restore();
  verify();
}
