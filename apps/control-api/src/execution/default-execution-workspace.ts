/** DR-30: pure rules for the read-only default execution workspace.
 *
 * A user holding a scoped review grant (execution_retained_review_access.execution_environments non-empty) may
 * READ the configured projection workspace for exactly the granted environments. This module has no I/O. It never
 * grants a write, membership, stream, command or any workspace other than EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID. */

export const EXECUTION_ENVIRONMENTS = ["paper", "sandbox", "live"] as const;
export type ExecutionEnvironment = (typeof EXECUTION_ENVIRONMENTS)[number];

export type DefaultExecutionGrant =
  | { state: "GRANTED"; workspaceId: string; environments: readonly ExecutionEnvironment[] }
  | { state: "NONE" }
  | { state: "AMBIGUOUS" }
  | { state: "UNAVAILABLE" };

export function defaultWorkspaceGrantsEnabled(config?: {
  FEATURE_EXECUTION_DEFAULT_WORKSPACE_GRANTS?: string; EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID?: string;
}): boolean {
  return config?.FEATURE_EXECUTION_DEFAULT_WORKSPACE_GRANTS === "true" && Boolean(config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID);
}

/** Environments a request needs. undefined means the route default, which is paper, never live.
 * `all` needs every environment, `canary` is a live read. null = unknown value: deny. */
export function requiredEnvironments(environment: unknown): readonly ExecutionEnvironment[] | null {
  if (environment === undefined) return ["paper"];
  if (typeof environment !== "string") return null;
  if ((EXECUTION_ENVIRONMENTS as readonly string[]).includes(environment)) return [environment as ExecutionEnvironment];
  if (environment === "all") return EXECUTION_ENVIRONMENTS;
  if (environment === "canary") return ["live"];
  return null;
}

export function grantCovers(granted: readonly string[], required: readonly ExecutionEnvironment[] | null): boolean {
  return required !== null && required.length > 0 && required.every(item => granted.includes(item));
}

/** Union of every environment a GET names: `environment`, `environments` (comma list) and the screen path
 * (/screens/{paper,sandbox,live}). Any malformed value (array, unknown token) returns null and is denied. */
export function requestRequiredEnvironments(path: string, query: Record<string, unknown> | undefined):
  readonly ExecutionEnvironment[] | null {
  const named: unknown[] = [];
  const q = query ?? {};
  if (q.environment !== undefined) named.push(q.environment);
  if (q.environments !== undefined) {
    if (typeof q.environments !== "string") return null;
    named.push(...q.environments.split(","));
  }
  const screen = /^\/api\/v1\/execution\/screens\/(paper|sandbox|live)(?:\/|$)/.exec(path);
  if (screen) named.push(screen[1]);
  if (named.length === 0) return requiredEnvironments(undefined);
  const out = new Set<ExecutionEnvironment>();
  for (const item of named) {
    const required = requiredEnvironments(item);
    if (required === null) return null;
    required.forEach(env => out.add(env));
  }
  return [...out];
}

/** Execution GET families that read the configured projection workspace through canReadExecution or the read
 * scopes. Anything else (Governance, Research, command-center, live/canary/sandbox detail, incidents, streams)
 * keeps the personal workspace and its own membership check. */
const DEFAULT_WORKSPACE_PATHS = [
  /^\/api\/v1\/execution\/alphas(?:\/|$)/, /^\/api\/v1\/execution\/portfolios(?:\/|$)/,
  /^\/api\/v1\/execution\/broker-bindings(?:\/|$)/, /^\/api\/v1\/execution\/manager\//,
  /^\/api\/v1\/execution\/screens\//, /^\/api\/v1\/execution\/resources\//,
  /^\/api\/v1\/execution\/derivations\//, /^\/api\/v1\/execution\/views\//,
  /^\/api\/v1\/execution\/observed\//, /^\/api\/v1\/execution\/screen-contracts(?:\/|$)/,
];

export function defaultWorkspacePath(path: string): boolean {
  return DEFAULT_WORKSPACE_PATHS.some(pattern => pattern.test(path));
}

export function readMethod(method: string | undefined): boolean {
  return method === "GET" || method === "HEAD";
}
