import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";

const folders: string[] = [];

function baseEnv(): NodeJS.ProcessEnv {
  return {
    PORTAL_ENV: "research",
    AUTH_MODE: "cloudflare_access_local_password",
    DATABASE_URL: "postgres://portal:portal@postgres:5432/portal",
    PORTAL_PUBLIC_ORIGIN: "https://portal.primusspark.com",
    CLOUDFLARE_TEAM_DOMAIN: "https://primussparkquant.cloudflareaccess.com",
    CLOUDFLARE_ACCESS_ISSUER: "https://primussparkquant.cloudflareaccess.com",
    CLOUDFLARE_ACCESS_AUD: "portal-audience",
    CLOUDFLARE_ACCESS_JWKS_URI:
      "https://primussparkquant.cloudflareaccess.com/cdn-cgi/access/certs",
    INTERNAL_PRINCIPAL_SECRET: "independent-internal-principal-secret",
  };
}

function keyFile(name: string, keyId: string, secret: string): string {
  const folder = mkdtempSync(join(tmpdir(), "portal-control-api-config-"));
  folders.push(folder);
  const path = join(folder, name);
  writeFileSync(path, JSON.stringify({ [keyId]: secret }), { mode: 0o600 });
  return path;
}

afterEach(() => {
  while (folders.length > 0) rmSync(folders.pop()!, { recursive: true, force: true });
});

describe("Control API non-local signing keyrings", () => {
  it("loads independent cursor and governance keyrings from mounted files", () => {
    const queryPath = keyFile(
      "query.json",
      "query-k1",
      "query-file-secret-that-is-longer-than-thirty-two-bytes",
    );
    const governancePath = keyFile(
      "governance.json",
      "governance-k1",
      "governance-file-secret-that-is-longer-than-thirty-two-bytes",
    );
    const config = loadConfig({
      ...baseEnv(),
      QUERY_CURSOR_KEYS_FILE: queryPath,
      GOVERNANCE_APPLY_KEYS_FILE: governancePath,
    });

    expect(config.QUERY_CURSOR_KEYS_FILE).toBe(queryPath);
    expect(config.GOVERNANCE_APPLY_KEYS_FILE).toBe(governancePath);
    expect(JSON.parse(config.QUERY_CURSOR_KEYS_JSON)).toHaveProperty("query-k1");
    expect(JSON.parse(config.GOVERNANCE_APPLY_KEYS_JSON)).toHaveProperty("governance-k1");
  });

  it("rejects ambiguous inline and file-backed key material", () => {
    const queryPath = keyFile(
      "query.json",
      "query-k1",
      "query-file-secret-that-is-longer-than-thirty-two-bytes",
    );
    expect(() => loadConfig({
      ...baseEnv(),
      QUERY_CURSOR_KEYS_FILE: queryPath,
      QUERY_CURSOR_KEYS_JSON:
        '{"query-k1":"inline-query-secret-that-is-longer-than-thirty-two-bytes"}',
      GOVERNANCE_APPLY_KEYS_JSON:
        '{"governance-k1":"inline-governance-secret-longer-than-thirty-two-bytes"}',
    })).toThrow(/mutually exclusive/);
  });

  it("fails closed when a configured keyring file cannot be read", () => {
    expect(() => loadConfig({
      ...baseEnv(),
      QUERY_CURSOR_KEYS_FILE: "/run/secrets/control-api/missing-query.json",
      GOVERNANCE_APPLY_KEYS_JSON:
        '{"governance-k1":"inline-governance-secret-longer-than-thirty-two-bytes"}',
    })).toThrow(/QUERY_CURSOR_KEYS_FILE could not be read/);
  });
});
