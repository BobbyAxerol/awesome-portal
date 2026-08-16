import { z } from "zod";
import { AUTH_MODES } from "./domain";

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
  PORTAL_API_BASE_URL: z.string().min(1).default("http://portal-api:8000"),
  FEATURE_PROXY_PORTAL: z
    .enum(["true", "false"])
    .default("true"),
  FEATURE_NATIVE_WORKSPACES: z.enum(["true", "false"]).default("true"),
  OUTBOX_MAX_RESPONSE_BYTES: z.coerce.number().int().positive().default(64 * 1024),
});

export type ControlApiConfig = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ControlApiConfig {
  const config = EnvSchema.parse(env);
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
  return config;
}
