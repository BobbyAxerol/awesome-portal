import { runner as migrate } from "node-pg-migrate";
import { join } from "node:path";
import { Pool } from "pg";
import { loadConfig } from "../src/config";
import { buildPool } from "../src/db/pool";
import { createControlApiApp } from "../src/app";
import { ControlApiConfig } from "../src/config";

export const TEST_TABLES = [
  "execution_command_center_pins",
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
         ) AS has_hash_only_constraint`,
    );
    const row = result.rows[0];
    if (
      row.migration_count < 8 ||
      !row.has_f0 ||
      !row.has_hash_only_policy ||
      !row.has_hash_only_constraint
    ) {
      throw new Error(
        `Control API test migration gate did not reach EX-BE-05b/F0 ` +
        `(count=${row.migration_count}, has_f0=${row.has_f0}, ` +
        `hash_only_policy=${row.has_hash_only_policy}, ` +
        `hash_only_constraint=${row.has_hash_only_constraint}, ` +
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
