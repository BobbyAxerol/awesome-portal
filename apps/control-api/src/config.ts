import { readFileSync } from "fs";
import { z } from "zod";
import { AUTH_MODES } from "./domain";

const ServiceOriginSchema = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      url.username === "" &&
      url.password === "" &&
      url.pathname === "/" &&
      url.search === "" &&
      url.hash === ""
    );
  }, "service base URL must be an HTTP(S) origin without credentials, path, query or fragment");

const EnvSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORTAL_ENV: z.enum(["local", "research", "paper", "sandbox", "live"]).default("research"),
  AUTH_MODE: z.enum(AUTH_MODES).default("cloudflare_access_local_password"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  PORTAL_PUBLIC_ORIGIN: z.string().min(1).default("http://localhost:8080"),
  CLOUDFLARE_TEAM_DOMAIN: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).optional(),
  ),
  CLOUDFLARE_ACCESS_ISSUER: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).optional(),
  ),
  CLOUDFLARE_ACCESS_AUD: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).optional(),
  ),
  CLOUDFLARE_ACCESS_JWKS_URI: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).optional(),
  ),
  CLOUDFLARE_ALLOWED_EMAIL_DOMAIN: z.string().default("azdag.com"),
  INTERNAL_PRINCIPAL_SECRET: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(16).optional(),
  ),
  QUERY_CURSOR_ACTIVE_KEY_ID: z.string().regex(/^[A-Za-z0-9_-]{1,32}$/).default("query-k1"),
  QUERY_CURSOR_KEYS_JSON: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().default('{"query-k1":"local-only-query-signing-key-32-bytes-minimum"}'),
  ),
  QUERY_CURSOR_KEYS_FILE: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).optional(),
  ),
  QUERY_CURSOR_TTL_SECONDS: z.coerce.number().int().min(30).max(3600).default(15 * 60),
  GOVERNANCE_APPLY_ACTIVE_KEY_ID: z.string().regex(/^[A-Za-z0-9_-]{1,32}$/).default("governance-k1"),
  GOVERNANCE_APPLY_KEYS_JSON: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().default('{"governance-k1":"local-only-governance-apply-key-32-bytes-minimum"}'),
  ),
  GOVERNANCE_APPLY_KEYS_FILE: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).optional(),
  ),
  GOVERNANCE_PLAN_TTL_SECONDS: z.coerce.number().int().min(30).max(15 * 60).default(5 * 60),
  SESSION_IDLE_SECONDS: z.coerce.number().int().positive().default(30 * 60),
  SESSION_ABSOLUTE_SECONDS: z.coerce.number().int().positive().default(8 * 3600),
  ACTIVATION_TTL_SECONDS: z.coerce.number().int().positive().default(24 * 3600),
  ARGON2_MEMORY_KIB: z.coerce.number().int().min(19 * 1024).default(19 * 1024),
  ARGON2_ITERATIONS: z.coerce.number().int().min(2).default(2),
  ARGON2_PARALLELISM: z.coerce.number().int().min(1).default(1),
  LOGIN_FAILED_DELAY_ATTEMPTS: z.coerce.number().int().positive().default(5),
  LOGIN_LOCK_ATTEMPTS: z.coerce.number().int().positive().default(10),
  LOGIN_LOCK_SECONDS: z.coerce.number().int().positive().default(15 * 60),
  JWKS_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  PORTAL_API_BASE_URL: ServiceOriginSchema.default("http://portal-api:8000"),
  PLANNING_API_BASE_URL: ServiceOriginSchema.default("http://roadmap-task-board-api:8000"),
  FEATURE_PROXY_PORTAL: z
    .enum(["true", "false"])
    .default("true"),
  FEATURE_PROXY_PLANNING: z.enum(["true", "false"]).default("true"),
  FEATURE_NATIVE_WORKSPACES: z.enum(["true", "false"]).default("true"),
  PORTAL_SSE_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(250).max(10_000).default(3_000),
  FEATURE_EXECUTION_EDGE: z.enum(["true", "false"]).default("false"),
  FEATURE_EXECUTION_REALTIME_SSE: z.enum(["true", "false"]).default("false"),
  FEATURE_EXECUTION_ANALYTICS_QUERY: z.enum(["true", "false"]).default("false"),
  FEATURE_EXECUTION_SHADOW_QUERY: z.enum(["true", "false"]).default("false"),
  FEATURE_EXECUTION_PAPER_WORKBENCH_SHADOW: z.enum(["true", "false"]).default("false"),
  FEATURE_EXECUTION_COMMAND_CENTER_SNAPSHOT: z.enum(["true", "false"]).default("false"),
  FEATURE_EXECUTION_COMMAND_RELAY: z.enum(["true", "false"]).default("false"),
  COMMAND_CENTER_MAX_RESPONSE_BYTES: z.coerce.number().int().min(16 * 1024).max(512 * 1024).default(128 * 1024),
  EXECUTION_EDGE_ORIGIN: ServiceOriginSchema.default("https://portal-execution-edge:8443"),
  EXECUTION_EDGE_ENVIRONMENT: z.enum(["paper", "sandbox", "live"]).default("paper"),
  EXECUTION_EDGE_PRIVATE_KEY_FILE: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).optional(),
  ),
  EXECUTION_EDGE_KEY_ID: z.string().regex(/^[A-Za-z0-9_-]{1,32}$/).default("execution-k1"),
  EXECUTION_EDGE_DELEGATION_ISSUER: z.string().min(1).default("portal-control-api"),
  EXECUTION_EDGE_DELEGATION_AUDIENCE: z.string().min(1).default("portal-execution-edge"),
  EXECUTION_EDGE_DELEGATION_TTL_SECONDS: z.coerce.number().int().min(1).max(60).default(45),
  EXECUTION_EDGE_CA_FILE: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).optional(),
  ),
  EXECUTION_EDGE_CLIENT_CERT_FILE: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).optional(),
  ),
  EXECUTION_EDGE_CLIENT_KEY_FILE: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).optional(),
  ),
  EXECUTION_EDGE_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(250).max(10_000).default(3_000),
  EXECUTION_EDGE_ANALYTICS_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(250).max(30_000).default(5_000),
  EXECUTION_EDGE_ANALYTICS_MAXIMUM_CONCURRENCY: z.coerce.number().int().min(1).max(512).default(64),
  EXECUTION_EDGE_ANALYTICS_MAXIMUM_QUEUE: z.coerce.number().int().min(0).max(2_048).default(128),
  EXECUTION_EDGE_ANALYTICS_QUEUE_TIMEOUT_MS: z.coerce.number().int().min(10).max(5_000).default(250),
  OUTBOX_MAX_RESPONSE_BYTES: z.coerce.number().int().positive().default(64 * 1024),
});

export type ControlApiConfig = z.infer<typeof EnvSchema>;

function signingKeysFromFile(
  env: NodeJS.ProcessEnv,
  jsonName: "QUERY_CURSOR_KEYS_JSON" | "GOVERNANCE_APPLY_KEYS_JSON",
  fileName: "QUERY_CURSOR_KEYS_FILE" | "GOVERNANCE_APPLY_KEYS_FILE",
): NodeJS.ProcessEnv {
  const path = env[fileName];
  if (!path) return env;
  if (env[jsonName]) {
    throw new Error(`${jsonName} and ${fileName} are mutually exclusive`);
  }
  let serialized: string;
  try {
    serialized = readFileSync(path, { encoding: "utf8" });
  } catch {
    throw new Error(`${fileName} could not be read`);
  }
  if (Buffer.byteLength(serialized, "utf8") > 16 * 1024) {
    throw new Error(`${fileName} exceeds 16384 bytes`);
  }
  return { ...env, [jsonName]: serialized.trim() };
}

function parseSigningKeys(serialized: string, activeKeyId: string, name: string): Record<string, string> {
  let keys: unknown;
  try {
    keys = JSON.parse(serialized);
  } catch {
    throw new Error(`${name} must be a JSON object`);
  }
  if (
    !keys ||
    typeof keys !== "object" ||
    Array.isArray(keys) ||
    Object.keys(keys).length === 0 ||
    Object.entries(keys).some(
      ([keyId, secret]) =>
        !/^[A-Za-z0-9_-]{1,32}$/.test(keyId) ||
        typeof secret !== "string" ||
        Buffer.byteLength(secret, "utf8") < 32,
    ) ||
    !(activeKeyId in keys)
  ) {
    throw new Error(`${name} requires 32-byte-or-longer values and the active key`);
  }
  return keys as Record<string, string>;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ControlApiConfig {
  const resolved = signingKeysFromFile(
    signingKeysFromFile(
      { ...env },
      "QUERY_CURSOR_KEYS_JSON",
      "QUERY_CURSOR_KEYS_FILE",
    ),
    "GOVERNANCE_APPLY_KEYS_JSON",
    "GOVERNANCE_APPLY_KEYS_FILE",
  );
  const config = EnvSchema.parse(resolved);
  if (config.PORTAL_ENV !== "local") {
    const missingSigningKeys = ["QUERY_CURSOR_KEYS_JSON", "GOVERNANCE_APPLY_KEYS_JSON"]
      .filter((name) => !resolved[name]);
    if (missingSigningKeys.length > 0) {
      throw new Error(
        `non-local Portal environments require: ${missingSigningKeys.join(", ")}`,
      );
    }
  }
  const queryKeys = parseSigningKeys(
    config.QUERY_CURSOR_KEYS_JSON,
    config.QUERY_CURSOR_ACTIVE_KEY_ID,
    "QUERY_CURSOR_KEYS_JSON",
  );
  const governanceKeys = parseSigningKeys(
    config.GOVERNANCE_APPLY_KEYS_JSON,
    config.GOVERNANCE_APPLY_ACTIVE_KEY_ID,
    "GOVERNANCE_APPLY_KEYS_JSON",
  );
  const querySecrets = new Set(Object.values(queryKeys));
  if (Object.values(governanceKeys).some((secret) => querySecrets.has(secret))) {
    throw new Error("query cursor and governance apply keyrings must not share secret values");
  }
  if (config.AUTH_MODE !== "dev") {
    const missing = [
      "CLOUDFLARE_TEAM_DOMAIN",
      "CLOUDFLARE_ACCESS_ISSUER",
      "CLOUDFLARE_ACCESS_AUD",
      "CLOUDFLARE_ACCESS_JWKS_URI",
      "INTERNAL_PRINCIPAL_SECRET",
    ].filter((key) => config[key as keyof ControlApiConfig] === undefined);
    if (missing.length > 0) {
      throw new Error(
        `AUTH_MODE=${config.AUTH_MODE} requires: ${missing.join(", ")}`,
      );
    }
  }
  if (config.AUTH_MODE === "dev" && !["local"].includes(config.PORTAL_ENV)) {
    throw new Error("AUTH_MODE=dev is only allowed with PORTAL_ENV=local");
  }
  if (config.FEATURE_EXECUTION_EDGE === "true" && !config.EXECUTION_EDGE_PRIVATE_KEY_FILE) {
    throw new Error(
      "FEATURE_EXECUTION_EDGE=true requires EXECUTION_EDGE_PRIVATE_KEY_FILE",
    );
  }
  if (config.FEATURE_EXECUTION_COMMAND_RELAY === "true") {
    throw new Error("FEATURE_EXECUTION_COMMAND_RELAY is not commissioned in EX-BE-05b/F0");
  }
  if (
    config.FEATURE_EXECUTION_REALTIME_SSE === "true" ||
    config.FEATURE_EXECUTION_ANALYTICS_QUERY === "true" ||
    config.FEATURE_EXECUTION_SHADOW_QUERY === "true"
  ) {
    if (config.FEATURE_EXECUTION_EDGE !== "true") {
      throw new Error("execution edge delivery requires FEATURE_EXECUTION_EDGE=true");
    }
    const missing = [
      "EXECUTION_EDGE_CA_FILE",
      "EXECUTION_EDGE_CLIENT_CERT_FILE",
      "EXECUTION_EDGE_CLIENT_KEY_FILE",
    ].filter((key) => config[key as keyof ControlApiConfig] === undefined);
    if (missing.length > 0) {
      throw new Error(`execution edge mTLS requires: ${missing.join(", ")}`);
    }
    if (new URL(config.EXECUTION_EDGE_ORIGIN).protocol !== "https:") {
      throw new Error("execution edge origin must use HTTPS");
    }
  }
  if (
    config.FEATURE_EXECUTION_PAPER_WORKBENCH_SHADOW === "true" &&
    config.FEATURE_EXECUTION_SHADOW_QUERY !== "true"
  ) {
    throw new Error(
      "FEATURE_EXECUTION_PAPER_WORKBENCH_SHADOW=true requires FEATURE_EXECUTION_SHADOW_QUERY=true",
    );
  }
  return config;
}

export function querySigningKeys(config: ControlApiConfig): Record<string, string> {
  return parseSigningKeys(
    config.QUERY_CURSOR_KEYS_JSON,
    config.QUERY_CURSOR_ACTIVE_KEY_ID,
    "QUERY_CURSOR_KEYS_JSON",
  );
}

export function governanceApplySigningKeys(config: ControlApiConfig): Record<string, string> {
  return parseSigningKeys(
    config.GOVERNANCE_APPLY_KEYS_JSON,
    config.GOVERNANCE_APPLY_ACTIVE_KEY_ID,
    "GOVERNANCE_APPLY_KEYS_JSON",
  );
}
