import { runner as migrate } from "node-pg-migrate";
import { join } from "node:path";
import { Pool } from "pg";
import { loadConfig } from "../src/config";
import { buildPool } from "../src/db/pool";
import { createControlApiApp } from "../src/app";
import { ControlApiConfig } from "../src/config";

export const TEST_TABLES = [
  // P03 Research metadata is deliberately a separate schema.  Explicitly
  // listing it keeps test cleanup bounded and makes a new relation visible to
  // the shared harness rather than relying on an incidental CASCADE path.
  "research.audit_log",
  "research.preflight_manifests",
  "research.command_dedup",
  "research.release_candidates",
  "research.inspection_states",
  "research.exposure_facts",
  // P05 references point at the immutable artifact metadata, so cleanup must
  // name dependants first.  This remains an explicit bounded test list rather
  // than a schema-wide truncate that could hide a new relation from review.
  "research.artifact_references",
  "research.artifact_ingest_batches",
  "research.artifact_parts",
  "research.artifacts",
  "research.evaluations",
  "research.selection_records",
  "research.trial_index",
  "research.studies",
  "research.input_bindings",
  "research.worker_attempts",
  "research.jobs",
  "research.runs",
  "research.attempts",
  // P07 source custody is explicitly listed: tests must never leave source
  // bytes or immutable digest claims behind in a shared database cell.
  "research.import_sessions",
  "research.alpha_digest_claims",
  "research.alpha_versions",
  "research.import_sources",
  "research.alphas",
  "governance_review_captures",
  "execution_financial_query_cursors",
  "execution_durable_mirror_conflicts",
  "execution_durable_mirror_gaps",
  "execution_durable_mirror_continuations",
  "execution_durable_mirror_range_rows",
  "execution_durable_mirror_current_entities",
  "execution_durable_mirror_observations",
  "execution_durable_mirror_revisions",
  "execution_durable_mirror_batches",
  "execution_profile_projection_journal",
  "execution_profile_projection_snapshots",
  "execution_profile_projection_refresh_health",
  "execution_profile_projection_leases",
  "execution_profile_relation_cursors",
  "execution_manager_operation_continuations",
  "execution_timeseries_history",
  "execution_manager_projection_snapshots",
  "execution_alpha_fleet_projection",
  "execution_binding_projection",
  "portal_owner_anchor",
  "auth_audit_events",
  "auth_sessions",
  "activation_credentials",
  "password_credentials",
  "external_identity_bindings",
  "portal_users",
];

export async function migrateTestDatabase(databaseUrl: string): Promise<void> {
  const migrationsDir = join(__dirname, "..", "migrations");
  await migrate({
    databaseUrl,
    dir: migrationsDir,
    direction: "up",
    migrationsTable: "pgmigrations",
    count: Infinity,
    noLock: true,
    log: () => {},
  });
  const gate = new Pool({ connectionString: databaseUrl });
  try {
    const result = await gate.query<{
      migration_count: number;
      has_f0: boolean;
      has_hash_only_policy: boolean;
      has_hash_only_constraint: boolean;
      has_operations_queue: boolean;
      has_workflow_events: boolean;
      has_incidents: boolean;
      has_incident_events: boolean;
      has_sandbox_certifications: boolean;
      has_sandbox_events: boolean;
      has_canary_envelopes: boolean;
      has_activation_capabilities: boolean;
      has_activation_plans: boolean;
      has_activation_events: boolean;
      has_shared_admission: boolean;
      has_shared_cache: boolean;
      has_manager_projection_snapshots: boolean;
      has_alpha_fleet_projection: boolean;
      has_binding_projection: boolean;
      has_profile_projection_leases: boolean;
      has_profile_projection_snapshots: boolean;
      has_profile_projection_journal: boolean;
      has_profile_projection_refresh_health: boolean;
      has_manager_operation_continuations: boolean;
      has_durable_batches: boolean;
      has_durable_revisions: boolean;
      has_durable_observations: boolean;
      has_durable_current_entities: boolean;
      has_durable_range_rows: boolean;
      has_durable_continuations: boolean;
      has_durable_gaps: boolean;
      has_durable_conflicts: boolean;
      has_financial_query_cursors: boolean;
      has_research_schema: boolean;
      has_research_attempts: boolean;
      has_research_runs_cursor_index: boolean;
      has_research_runtime_role: boolean;
      has_research_artifact_parts: boolean;
      has_research_artifact_references: boolean;
      has_research_artifact_ingest_batches: boolean;
      has_research_artifact_transition_guard: boolean;
      has_research_import_sources: boolean;
      has_research_alpha_digest_claims: boolean;
      has_research_import_source_guard: boolean;
      has_research_alpha_source_reference: boolean;
      has_research_preflight_manifests: boolean;
      has_research_preflight_immutable_guard: boolean;
      has_research_journey_descriptor_registry: boolean;
      has_research_journey_descriptor_immutable_guard: boolean;
      research_role_can_write_execution: boolean;
      source_dark_constraint_count: number;
    }>(
      `SELECT
         (SELECT count(*)::integer FROM pgmigrations) AS migration_count,
         to_regclass('public.execution_command_plans_f0') IS NOT NULL AS has_f0,
         EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public'
             AND table_name = 'execution_command_plans_f0'
             AND column_name = 'payload_storage_policy'
         ) AS has_hash_only_policy,
         EXISTS (
           SELECT 1 FROM pg_constraint
           WHERE conname = 'execution_command_plans_f0_payload_hash_only'
         ) AS has_hash_only_constraint,
         to_regclass('public.execution_operation_queue_items') IS NOT NULL AS has_operations_queue,
         to_regclass('public.execution_operation_workflow_events') IS NOT NULL AS has_workflow_events,
         to_regclass('public.execution_incidents') IS NOT NULL AS has_incidents,
         to_regclass('public.execution_incident_events') IS NOT NULL AS has_incident_events,
         to_regclass('public.governance_sandbox_certifications') IS NOT NULL AS has_sandbox_certifications,
         to_regclass('public.governance_sandbox_certification_events') IS NOT NULL AS has_sandbox_events,
         to_regclass('public.governance_canary_envelopes') IS NOT NULL AS has_canary_envelopes,
         to_regclass('public.execution_activation_capabilities') IS NOT NULL AS has_activation_capabilities,
         to_regclass('public.execution_activation_plans') IS NOT NULL AS has_activation_plans,
         to_regclass('public.execution_activation_events') IS NOT NULL AS has_activation_events,
         to_regclass('public.execution_shared_admission_state') IS NOT NULL AS has_shared_admission,
         to_regclass('public.execution_shared_read_cache') IS NOT NULL AS has_shared_cache,
         to_regclass('public.execution_manager_projection_snapshots') IS NOT NULL AS has_manager_projection_snapshots,
         to_regclass('public.execution_alpha_fleet_projection') IS NOT NULL AS has_alpha_fleet_projection,
         to_regclass('public.execution_binding_projection') IS NOT NULL AS has_binding_projection,
         to_regclass('public.execution_profile_projection_leases') IS NOT NULL AS has_profile_projection_leases,
         to_regclass('public.execution_profile_projection_snapshots') IS NOT NULL AS has_profile_projection_snapshots,
         to_regclass('public.execution_profile_projection_journal') IS NOT NULL AS has_profile_projection_journal,
         to_regclass('public.execution_profile_projection_refresh_health') IS NOT NULL AS has_profile_projection_refresh_health,
         to_regclass('public.execution_manager_operation_continuations') IS NOT NULL AS has_manager_operation_continuations,
         to_regclass('public.execution_durable_mirror_batches') IS NOT NULL AS has_durable_batches,
         to_regclass('public.execution_durable_mirror_revisions') IS NOT NULL AS has_durable_revisions,
         to_regclass('public.execution_durable_mirror_observations') IS NOT NULL AS has_durable_observations,
         to_regclass('public.execution_durable_mirror_current_entities') IS NOT NULL AS has_durable_current_entities,
         to_regclass('public.execution_durable_mirror_range_rows') IS NOT NULL AS has_durable_range_rows,
         to_regclass('public.execution_durable_mirror_continuations') IS NOT NULL AS has_durable_continuations,
         to_regclass('public.execution_durable_mirror_gaps') IS NOT NULL AS has_durable_gaps,
         to_regclass('public.execution_durable_mirror_conflicts') IS NOT NULL AS has_durable_conflicts,
         to_regclass('public.execution_financial_query_cursors') IS NOT NULL AS has_financial_query_cursors,
         EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'research') AS has_research_schema,
         to_regclass('research.attempts') IS NOT NULL AS has_research_attempts,
         EXISTS (
           SELECT 1 FROM pg_indexes
            WHERE schemaname = 'research'
              AND indexname = 'research_runs_library_cursor_idx'
         ) AS has_research_runs_cursor_index,
         EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_research_runtime') AS has_research_runtime_role,
         to_regclass('research.artifact_parts') IS NOT NULL AS has_research_artifact_parts,
         to_regclass('research.artifact_references') IS NOT NULL AS has_research_artifact_references,
         to_regclass('research.artifact_ingest_batches') IS NOT NULL AS has_research_artifact_ingest_batches,
         EXISTS (
           SELECT 1 FROM pg_trigger
            WHERE tgname = 'research_artifacts_p05_transition_guard'
             AND NOT tgisinternal
         ) AS has_research_artifact_transition_guard,
         to_regclass('research.import_sources') IS NOT NULL AS has_research_import_sources,
         to_regclass('research.alpha_digest_claims') IS NOT NULL AS has_research_alpha_digest_claims,
         EXISTS (
           SELECT 1 FROM pg_trigger
            WHERE tgname = 'research_import_sources_immutable_guard'
              AND NOT tgisinternal
         ) AS has_research_import_source_guard,
         EXISTS (
           SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'research'
              AND table_name = 'alpha_versions'
              AND column_name = 'source_file_ref'
         ) AS has_research_alpha_source_reference,
         to_regclass('research.preflight_manifests') IS NOT NULL AS has_research_preflight_manifests,
         EXISTS (
           SELECT 1 FROM pg_trigger
            WHERE tgname = 'research_preflight_manifests_immutable_guard'
              AND NOT tgisinternal
         ) AS has_research_preflight_immutable_guard,
         to_regclass('research.journey_descriptor_registry') IS NOT NULL AS has_research_journey_descriptor_registry,
         EXISTS (
           SELECT 1 FROM pg_trigger
            WHERE tgname = 'research_journey_descriptor_registry_immutable_guard'
              AND NOT tgisinternal
         ) AS has_research_journey_descriptor_immutable_guard,
         has_table_privilege('portal_research_runtime', 'public.run_read_models', 'UPDATE') AS research_role_can_write_execution,
         (SELECT count(*)::integer FROM pg_constraint
          WHERE conname IN (
            'execution_activation_capabilities_effective_profile_check',
            'execution_activation_capabilities_source_enabled_check',
            'execution_activation_capabilities_runtime_enabled_check',
            'execution_activation_capabilities_kill_switch_engaged_check'
          )) AS source_dark_constraint_count`,
    );
    const row = result.rows[0];
    if (
      row.migration_count < 23 ||
      !row.has_f0 ||
      !row.has_hash_only_policy ||
      !row.has_hash_only_constraint ||
      !row.has_operations_queue ||
      !row.has_workflow_events ||
      !row.has_incidents ||
      !row.has_incident_events ||
      !row.has_sandbox_certifications ||
      !row.has_sandbox_events ||
      !row.has_canary_envelopes ||
      !row.has_activation_capabilities ||
      !row.has_activation_plans ||
      !row.has_activation_events ||
      !row.has_shared_admission ||
      !row.has_shared_cache ||
      !row.has_manager_projection_snapshots ||
      !row.has_alpha_fleet_projection ||
      !row.has_binding_projection ||
      !row.has_profile_projection_leases ||
      !row.has_profile_projection_snapshots ||
      !row.has_profile_projection_journal ||
      !row.has_profile_projection_refresh_health ||
      !row.has_manager_operation_continuations ||
      !row.has_durable_batches ||
      !row.has_durable_revisions ||
      !row.has_durable_observations ||
      !row.has_durable_current_entities ||
      !row.has_durable_range_rows ||
      !row.has_durable_continuations ||
      !row.has_durable_gaps ||
      !row.has_durable_conflicts ||
      !row.has_financial_query_cursors ||
      !row.has_research_schema ||
      !row.has_research_attempts ||
      !row.has_research_runs_cursor_index ||
      !row.has_research_runtime_role ||
      !row.has_research_artifact_parts ||
      !row.has_research_artifact_references ||
      !row.has_research_artifact_ingest_batches ||
      !row.has_research_artifact_transition_guard ||
      !row.has_research_import_sources ||
      !row.has_research_alpha_digest_claims ||
      !row.has_research_import_source_guard ||
      !row.has_research_alpha_source_reference ||
      !row.has_research_preflight_manifests ||
      !row.has_research_preflight_immutable_guard ||
      !row.has_research_journey_descriptor_registry ||
      !row.has_research_journey_descriptor_immutable_guard ||
      row.research_role_can_write_execution ||
      row.source_dark_constraint_count !== 4
    ) {
      throw new Error(
        `Control API test migration gate did not reach EDS-07 financial query plane ` +
        `(count=${row.migration_count}, has_f0=${row.has_f0}, ` +
        `hash_only_policy=${row.has_hash_only_policy}, ` +
        `hash_only_constraint=${row.has_hash_only_constraint}, ` +
        `operations_queue=${row.has_operations_queue}, ` +
        `workflow_events=${row.has_workflow_events}, ` +
        `incidents=${row.has_incidents}, ` +
        `incident_events=${row.has_incident_events}, ` +
        `sandbox_certifications=${row.has_sandbox_certifications}, ` +
        `sandbox_events=${row.has_sandbox_events}, ` +
        `canary_envelopes=${row.has_canary_envelopes}, ` +
        `activation_capabilities=${row.has_activation_capabilities}, ` +
        `activation_plans=${row.has_activation_plans}, ` +
        `activation_events=${row.has_activation_events}, ` +
        `shared_admission=${row.has_shared_admission}, ` +
        `shared_cache=${row.has_shared_cache}, ` +
        `manager_projection_snapshots=${row.has_manager_projection_snapshots}, ` +
        `alpha_fleet_projection=${row.has_alpha_fleet_projection}, ` +
        `binding_projection=${row.has_binding_projection}, ` +
        `profile_projection_leases=${row.has_profile_projection_leases}, ` +
        `profile_projection_snapshots=${row.has_profile_projection_snapshots}, ` +
        `profile_projection_journal=${row.has_profile_projection_journal}, ` +
        `profile_projection_refresh_health=${row.has_profile_projection_refresh_health}, ` +
        `manager_operation_continuations=${row.has_manager_operation_continuations}, ` +
        `durable_batches=${row.has_durable_batches}, ` +
        `durable_revisions=${row.has_durable_revisions}, ` +
        `durable_observations=${row.has_durable_observations}, ` +
        `durable_current_entities=${row.has_durable_current_entities}, ` +
        `durable_range_rows=${row.has_durable_range_rows}, ` +
        `durable_continuations=${row.has_durable_continuations}, ` +
        `durable_gaps=${row.has_durable_gaps}, ` +
        `durable_conflicts=${row.has_durable_conflicts}, ` +
        `financial_query_cursors=${row.has_financial_query_cursors}, ` +
        `research_schema=${row.has_research_schema}, ` +
        `research_attempts=${row.has_research_attempts}, ` +
        `research_runs_cursor_index=${row.has_research_runs_cursor_index}, ` +
        `research_runtime_role=${row.has_research_runtime_role}, ` +
        `research_artifact_parts=${row.has_research_artifact_parts}, ` +
        `research_artifact_references=${row.has_research_artifact_references}, ` +
        `research_artifact_ingest_batches=${row.has_research_artifact_ingest_batches}, ` +
        `research_artifact_transition_guard=${row.has_research_artifact_transition_guard}, ` +
        `research_import_sources=${row.has_research_import_sources}, ` +
        `research_alpha_digest_claims=${row.has_research_alpha_digest_claims}, ` +
        `research_import_source_guard=${row.has_research_import_source_guard}, ` +
        `research_alpha_source_reference=${row.has_research_alpha_source_reference}, ` +
        `research_preflight_manifests=${row.has_research_preflight_manifests}, ` +
        `research_preflight_immutable_guard=${row.has_research_preflight_immutable_guard}, ` +
        `research_journey_descriptor_registry=${row.has_research_journey_descriptor_registry}, ` +
        `research_journey_descriptor_immutable_guard=${row.has_research_journey_descriptor_immutable_guard}, ` +
        `research_role_can_write_execution=${row.research_role_can_write_execution}, ` +
        `source_dark_constraints=${row.source_dark_constraint_count}, ` +
        `dir=${migrationsDir})`,
      );
    }
  } finally {
    await gate.end();
  }
}

export async function truncateAll(pool: Pool): Promise<void> {
  await pool.query(`TRUNCATE ${TEST_TABLES.join(", ")} CASCADE`);
}

export function testConfig(overrides: Partial<Record<string, string>> = {}): ControlApiConfig {
  const env: Record<string, string> = {
    NODE_ENV: "test",
    PORTAL_ENV: "local",
    AUTH_MODE: "cloudflare_access_local_password",
    DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://portal:portal@127.0.0.1:5432/portal_control_test",
    PORTAL_PUBLIC_ORIGIN: "https://portal.primusspark.com",
    CLOUDFLARE_TEAM_DOMAIN: "https://primussparkquant.cloudflareaccess.com",
    CLOUDFLARE_ACCESS_ISSUER: "https://primussparkquant.cloudflareaccess.com",
    CLOUDFLARE_ACCESS_AUD: "test-audience",
    CLOUDFLARE_ACCESS_JWKS_URI: "http://127.0.0.1:1/cdn-cgi/access/certs",
    CLOUDFLARE_ALLOWED_EMAIL_DOMAIN: "azdag.com",
    INTERNAL_PRINCIPAL_SECRET: "test-principal-secret-0123456789",
    SESSION_IDLE_SECONDS: "1800",
    SESSION_ABSOLUTE_SECONDS: "28800",
    ACTIVATION_TTL_SECONDS: "86400",
    ARGON2_MEMORY_KIB: "19456",
    ARGON2_ITERATIONS: "2",
    ARGON2_PARALLELISM: "1",
    ...overrides,
  };
  return loadConfig(env);
}

export async function setupApp(overrides: Partial<Record<string, string>> = {}) {
  const config = testConfig(overrides);
  const pool = buildPool(config.DATABASE_URL);
  await truncateAll(pool);
  const app = await createControlApiApp(config, pool);
  return { config, pool, app };
}

export async function teardownApp(app: Awaited<ReturnType<typeof setupApp>>): Promise<void> {
  await app.app.close();
  await app.pool.end();
}
