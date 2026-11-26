/**
 * Owner-only client for `/api/admin/execution-grants` (DR-30 default execution grants).
 *
 * The server owns every rule (explicit environments, at most 12 months, a user that exists and is active, step-up,
 * the feature flag). This client sends what the owner chose, with the CSRF header and a fresh idempotency key per
 * confirmed intent, and reads the answer strictly: a body that is not the published shape is an unreadable answer, never
 * a repaired one. A 404 on the list read means the feature is off on this server (the panel is then not shown).
 */
import { AuthRequestError, CSRF_HEADER, csrfTokenFromCookie } from "../../auth/authApi";
import { newIdempotencyKey, stepUp } from "./accountApi";

export type GrantEnvironment = "paper" | "sandbox" | "live";
export const GRANT_ENVIRONMENTS: readonly GrantEnvironment[] = ["paper", "sandbox", "live"];
export type GrantStatus = "ACTIVE" | "EXPIRED" | "REVOKED";

export interface ExecutionGrant {
  userId: string;
  username: string;
  displayName: string;
  environments: readonly GrantEnvironment[];
  termStartedAt: string;
  expiresAt: string;
  revokedAt: string | null;
  status: GrantStatus;
}
export interface GrantCandidate { username: string; displayName: string }
export interface ExecutionGrantsRead {
  workspaceId: string;
  maxTermDays: number;
  grants: readonly ExecutionGrant[];
  candidates: readonly GrantCandidate[];
}
export interface GrantChange { outcome: "ISSUED" | "RENEWED" | "REVOKED" | "NO_CHANGE" | "APPLIED"; environments: readonly GrantEnvironment[] }

/** The one shape of refusal the panel prints: the server's own code and words. */
export class GrantsMalformed extends Error {
  readonly code = "GRANTS_MALFORMED";
  constructor(readonly where: string) { super(`The grants answer was malformed at ${where}.`); }
}

const BASE = "/api/admin/execution-grants";
const isEnv = (value: unknown): value is GrantEnvironment => value === "paper" || value === "sandbox" || value === "live";
const text = (value: unknown, where: string): string => { if (typeof value !== "string" || value === "") throw new GrantsMalformed(where); return value; };
const instant = (value: unknown, where: string): string => { const raw = text(value, where); if (Number.isNaN(Date.parse(raw))) throw new GrantsMalformed(where); return raw; };

export function readGrants(body: unknown): ExecutionGrantsRead {
  const root = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  if (!Array.isArray(root.grants) || !Array.isArray(root.candidates)) throw new GrantsMalformed("body");
  const max = root.max_term_days;
  if (typeof max !== "number" || !Number.isInteger(max) || max < 1) throw new GrantsMalformed("max_term_days");
  const grants = root.grants.map((raw, index): ExecutionGrant => {
    const row = (raw ?? {}) as Record<string, unknown>, at = `grants[${index}]`;
    if (!Array.isArray(row.environments) || row.environments.length === 0 || !row.environments.every(isEnv)) throw new GrantsMalformed(`${at}.environments`);
    if (row.status !== "ACTIVE" && row.status !== "EXPIRED" && row.status !== "REVOKED") throw new GrantsMalformed(`${at}.status`);
    return { userId: text(row.user_id, `${at}.user_id`), username: text(row.username, `${at}.username`), displayName: typeof row.display_name === "string" ? row.display_name : "",
      environments: row.environments, termStartedAt: instant(row.term_started_at, `${at}.term_started_at`), expiresAt: instant(row.expires_at, `${at}.expires_at`),
      revokedAt: row.revoked_at === null ? null : instant(row.revoked_at, `${at}.revoked_at`), status: row.status };
  });
  const candidates = root.candidates.map((raw, index): GrantCandidate => {
    const row = (raw ?? {}) as Record<string, unknown>;
    return { username: text(row.username, `candidates[${index}].username`), displayName: typeof row.display_name === "string" ? row.display_name : "" };
  });
  return { workspaceId: text(root.workspace_id, "workspace_id"), maxTermDays: max, grants, candidates };
}

async function failure(response: Response): Promise<AuthRequestError> {
  let body: { error?: { code?: string; message?: string; request_id?: string } } | undefined;
  try { body = (await response.json()) as typeof body; } catch { /* a proxy can answer with a non-JSON body */ }
  return new AuthRequestError(response.status, body?.error?.code ?? "EXECUTION_GRANT_REQUEST_FAILED",
    body?.error?.message ?? "The access change could not be completed.", body?.error?.request_id ?? response.headers.get("x-request-id"));
}

async function send(path: string, method: "POST" | "DELETE", payload: Record<string, unknown> | null, key: string): Promise<GrantChange> {
  const csrf = csrfTokenFromCookie();
  if (!csrf) throw new AuthRequestError(403, "CSRF_MISSING", "The session token is missing. Sign in again.", null);
  const response = await fetch(path, { method, credentials: "same-origin", cache: "no-store",
    headers: { ...(payload ? { "Content-Type": "application/json" } : {}), [CSRF_HEADER]: csrf, "x-portal-idempotency-key": key },
    ...(payload ? { body: JSON.stringify(payload) } : {}) });
  if (!response.ok) throw await failure(response);
  const body = (await response.json()) as Record<string, unknown>;
  const outcome = body.outcome;
  if (outcome !== "ISSUED" && outcome !== "RENEWED" && outcome !== "REVOKED" && outcome !== "NO_CHANGE" && outcome !== "APPLIED") throw new GrantsMalformed("outcome");
  return { outcome, environments: Array.isArray(body.environments) ? body.environments.filter(isEnv) : [] };
}

export interface GrantsClient {
  list(): Promise<ExecutionGrantsRead>;
  grant(input: { username: string; environments: readonly GrantEnvironment[]; termDays: number }, key: string): Promise<GrantChange>;
  renew(input: { username: string; environments: readonly GrantEnvironment[]; termDays: number }, key: string): Promise<GrantChange>;
  revoke(username: string, key: string): Promise<GrantChange>;
  /** The owner's own password, for the step-up the server asks for. Held nowhere. */
  confirmPassword(password: string): Promise<void>;
}

export const executionGrants: GrantsClient = {
  async list() {
    const response = await fetch(BASE, { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) throw await failure(response);
    return readGrants(await response.json());
  },
  grant: (input, key) => send(BASE, "POST", { username: input.username, environments: [...input.environments], term_days: input.termDays }, key),
  renew: (input, key) => send(`${BASE}/${encodeURIComponent(input.username)}/renew`, "POST", { environments: [...input.environments], term_days: input.termDays }, key),
  revoke: (username, key) => send(`${BASE}/${encodeURIComponent(username)}`, "DELETE", null, key),
  async confirmPassword(password) { await stepUp.grant(password); },
};

export { newIdempotencyKey };
