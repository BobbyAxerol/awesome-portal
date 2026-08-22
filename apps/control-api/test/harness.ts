import { runner as migrate } from "node-pg-migrate";
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
  await migrate({
    databaseUrl,
    dir: "migrations",
    direction: "up",
    migrationsTable: "pgmigrations",
    count: Infinity,
    noLock: true,
    log: () => {},
  });
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
