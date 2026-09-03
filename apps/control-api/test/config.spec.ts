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

describe("Execution realtime feature dependencies", () => {
  const executionEdgeEnv = (): NodeJS.ProcessEnv => ({
    ...baseEnv(),
    QUERY_CURSOR_KEYS_JSON:
      '{"query-k1":"query-realtime-test-key-that-is-longer-than-thirty-two-bytes"}',
    GOVERNANCE_APPLY_KEYS_JSON:
      '{"governance-k1":"governance-realtime-test-key-longer-than-thirty-two-bytes"}',
    FEATURE_EXECUTION_EDGE: "true",
    EXECUTION_EDGE_PRIVATE_KEY_FILE: "/run/secrets/execution-edge/delegation.pem",
    EXECUTION_EDGE_CA_FILE: "/run/secrets/execution-edge/ca.crt",
    EXECUTION_EDGE_CLIENT_CERT_FILE: "/run/secrets/execution-edge/client.crt",
    EXECUTION_EDGE_CLIENT_KEY_FILE: "/run/secrets/execution-edge/client.key",
  });

  it("rejects realtime when the commissioned shadow query and screen are not active", () => {
    expect(() => loadConfig({
      ...executionEdgeEnv(),
      FEATURE_EXECUTION_REALTIME_SSE: "true",
    })).toThrow(/requires FEATURE_EXECUTION_SHADOW_QUERY=true/);
  });

  it("accepts realtime only with the complete N07 read path", () => {
    const config = loadConfig({
      ...executionEdgeEnv(),
      FEATURE_EXECUTION_REALTIME_SSE: "true",
      FEATURE_EXECUTION_SHADOW_QUERY: "true",
      FEATURE_EXECUTION_PAPER_WORKBENCH_SHADOW: "true",
    });

    expect(config.FEATURE_EXECUTION_REALTIME_SSE).toBe("true");
  });
});

describe("P4-D DNSE paper-profile taxonomy config (owner-approved 2026-09-03)", () => {
  const edgeCommon = {
    QUERY_CURSOR_KEYS_JSON:
      '{"query-k1":"query-taxonomy-test-key-that-is-longer-than-thirty-two-bytes"}',
    GOVERNANCE_APPLY_KEYS_JSON:
      '{"governance-k1":"governance-taxonomy-test-key-longer-than-thirty-two-b"}',
    FEATURE_EXECUTION_EDGE: "true",
    EXECUTION_EDGE_PRIVATE_KEY_FILE: "/tmp/delegation.pem",
    EXECUTION_EDGE_CA_FILE: "/tmp/ca.pem",
    EXECUTION_EDGE_CLIENT_CERT_FILE: "/tmp/client.pem",
    EXECUTION_EDGE_CLIENT_KEY_FILE: "/tmp/client-key.pem",
  };

  it("fails closed when the DNSE flag is on without its own origin, profile and audience", () => {
    expect(() => loadConfig({
      ...baseEnv(),
      ...edgeCommon,
      FEATURE_EXECUTION_CURRENT_SOURCE_PAPER_DNSE: "true",
    })).toThrow(/EXECUTION_EDGE_PAPER_DNSE_ORIGIN.*EXECUTION_EDGE_PAPER_DNSE_PROFILE_ID.*EXECUTION_EDGE_PAPER_DNSE_AUDIENCE/);
  });

  it("pins the DNSE profile and audience to the published taxonomy words", () => {
    expect(() => loadConfig({
      ...baseEnv(),
      ...edgeCommon,
      FEATURE_EXECUTION_CURRENT_SOURCE_PAPER_DNSE: "true",
      EXECUTION_EDGE_PAPER_DNSE_ORIGIN: "https://paper-dnse.execution.internal",
      EXECUTION_EDGE_PAPER_DNSE_PROFILE_ID: "PAPER_DNSE_OTHER",
      EXECUTION_EDGE_PAPER_DNSE_AUDIENCE: "portal-execution-edge-paper-dnse",
    })).toThrow(/profile and audience must match the N13B pins/);
  });

  it("loads a complete DNSE profile configuration beside the BINANCE paper profile", () => {
    const config = loadConfig({
      ...baseEnv(),
      ...edgeCommon,
      FEATURE_EXECUTION_CURRENT_SOURCE_PAPER_DNSE: "true",
      EXECUTION_EDGE_PAPER_DNSE_ORIGIN: "https://paper-dnse.execution.internal",
      EXECUTION_EDGE_PAPER_DNSE_PROFILE_ID: "PAPER_DNSE_VNM",
      EXECUTION_EDGE_PAPER_DNSE_AUDIENCE: "portal-execution-edge-paper-dnse",
    });
    expect(config.EXECUTION_EDGE_PAPER_DNSE_PROFILE_ID).toBe("PAPER_DNSE_VNM");
    expect(config.FEATURE_EXECUTION_CURRENT_SOURCE_PAPER_DNSE).toBe("true");
  });

  it("stays inert by default — the flag defaults off", () => {
    expect(loadConfig({ ...baseEnv(), ...edgeCommon, FEATURE_EXECUTION_EDGE: "false" }).FEATURE_EXECUTION_CURRENT_SOURCE_PAPER_DNSE).toBe("false");
  });
});
