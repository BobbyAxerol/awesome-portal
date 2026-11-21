/**
 * V2 access reader: the caller's own effective access
 * (`GET /api/admin/profile-access/v2/effective`, `portal.access-effective.v1`,
 * operationId `portalScopedAccessEffectiveGetV1`, `execution-access.d.ts`).
 *
 * Boundary rules (review2/04, 06):
 * - the body is `unknown` until every check below passes. One bad grant voids
 *   the whole read, because a silently dropped grant would make "Granted to
 *   you" a lie. There is no partial trust;
 * - a readable body of another `schema_version` is `unsupported_shape`, never
 *   fed to this reader's types;
 * - times are safe-integer UTC epoch milliseconds, never ISO strings;
 * - `action` is an open dotted token here, not the contract's 55-name enum:
 *   the enum belongs to the generated contract, and a name added there must
 *   not turn the whole screen unavailable. Everything that has a closed set
 *   (effect, availability, authority, environment, selector kind) is closed;
 * - the contract is closed: a key the schema does not name voids the read (AE-5), and a selector
 *   id list longer than the schema's 200 is refused (AE-4);
 * - `owner_recovery` is the contract's constant (`enabled: false`,
 *   `OWNER_RECOVERY_NOT_APPROVED`); anything else is refused;
 * - nothing is invented: no "granted by", no preset name. The body carries
 *   neither and so neither is read.
 */
import { readUtcEpochMs, type UtcEpochMs } from "../../screenDataContract";

export const ACCESS_EFFECTIVE_SCHEMA = "portal.access-effective.v1";

export const ACCESS_AVAILABILITIES = ["AVAILABLE", "POLICY_PENDING"] as const;
export type AccessAvailability = (typeof ACCESS_AVAILABILITIES)[number];

export const ACCESS_EFFECTS = ["ALLOW", "DENY"] as const;
export type AccessEffect = (typeof ACCESS_EFFECTS)[number];

export const ACCESS_ENVIRONMENTS = ["paper", "sandbox", "live"] as const;
export type AccessEnvironment = (typeof ACCESS_ENVIRONMENTS)[number];

export const ACCESS_TS_AUTHORITIES = ["NOT_REQUIRED", "PENDING", "ACCEPTED", "REJECTED", "UNKNOWN"] as const;
export type AccessTsAuthority = (typeof ACCESS_TS_AUTHORITIES)[number];

export const ACCESS_RESOURCE_KINDS = ["ROOT", "PORTFOLIO", "ALPHA", "ALPHA_VERSION", "DEPLOYMENT", "ACCOUNT", "BINDING", "USER"] as const;
export type AccessResourceKind = (typeof ACCESS_RESOURCE_KINDS)[number];

export type AccessSelector =
  | { kind: "EXPLICIT_RESOURCE_SET"; resourceKind: AccessResourceKind; ids: readonly string[] }
  | { kind: "OWN_ALPHA" }
  | { kind: "PORTFOLIO_MEMBERSHIP"; portfolioIds: readonly string[] }
  | { kind: "ROOT_SCOPE"; rootId: string };

export interface AccessGrant {
  grantId: string;
  /** Dotted token as published, e.g. `portfolio.read_restricted`. */
  action: string;
  effect: AccessEffect;
  selector: AccessSelector;
  environments: readonly AccessEnvironment[];
  validFrom: UtcEpochMs;
  /** `null` is "no end date" as the source states it. */
  validUntil: UtcEpochMs | null;
  revision: string;
  /** As the server evaluated it; never recomputed here. */
  current: boolean;
  tsAuthority: AccessTsAuthority;
}

export interface AccessEffective {
  workspaceId: string;
  userId: string;
  policyRevision: string | null;
  availability: AccessAvailability;
  /** Present exactly when the policy is pending. */
  reasonCode: string | null;
  grants: readonly AccessGrant[];
  researcherFieldPolicy: { state: "PENDING" | "QUALIFIED"; policyRef: string | null };
  ownerRecovery: { enabled: false; reasonCode: "OWNER_RECOVERY_NOT_APPROVED" };
}

/** What a reader hands back for a readable body that is not this schema. */
export interface UnsupportedAccessShape {
  kind: "unsupported_shape";
  schemaVersion: string | null;
}

export type AccessEffectiveRead = { kind: "effective"; effective: AccessEffective } | UnsupportedAccessShape;

/** The most grants one read may carry; more is a contract the screen was not built for. */
export const MAX_GRANTS = 500;
/** Schema `AccessSelector`: `ids` / `portfolio_ids` have maxItems 200. A longer list is not this contract and voids the read. */
const MAX_IDS = 200;

const GRANT_KEYS = [
  "grant_id", "action", "effect", "selector", "environments", "valid_from_ms", "valid_until_ms", "revision", "current", "ts_authority",
] as const;
const ROOT_KEYS = [
  "schema_version", "workspace_id", "user_id", "policy_revision", "availability", "reason_code", "grants", "researcher_field_policy", "owner_recovery",
] as const;

const TOKEN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const ACTION = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

/** The contract pins this flag to exactly `false`; anything unreadable is refused, never defaulted. */
const isFalse = (value: unknown): boolean => value === false;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/**
 * The contract is closed (`additionalProperties: false` on the body, a grant, a selector, the field policy and owner
 * recovery): a key the schema does not name is not this contract and voids the read, as accessSelf does. The answer to a
 * server that adds a field is a schema change, not a reader that quietly drops it.
 */
function hasOnly(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? value as T : null;
}

/** `valid_from_ms` / `valid_until_ms`: schema integer, minimum 0 (execution-access.openapi AccessEffective.grants). */
function clockMs(value: unknown): UtcEpochMs | null {
  return typeof value === "number" && value >= 0 ? readUtcEpochMs(value) : null;
}

function token(value: unknown): string | null {
  return typeof value === "string" && TOKEN.test(value) ? value : null;
}

/**
 * Characters an identifier must not contain in this reader: C0/C1 controls and DEL,
 * zero-width and bidi-control format characters (U+200B..U+200F, U+202A..U+202E,
 * U+2060..U+2064, U+2066..U+2069, U+061C, U+180E, U+FEFF).
 */
const UNSAFE_ID_CHARS = /[\u0000-\u001f\u007f-\u009f\u061c\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/;

/**
 * Ids are opaque server strings: bounded and printable, not held to the token grammar.
 *
 * DISPLAY SAFETY, STRICTER THAN THE PUBLISHED SCHEMA: the schema allows
 * `^[^\u0000-\u001f\u007f]+$`, which admits whitespace-only text and bidi or
 * zero-width characters (a U+202E override can reorder the id shown in "Granted
 * to you"). This reader refuses both, so the whole read is unavailable rather
 * than showing an id that can misread. That is a FE defence, not a schema claim:
 * a server id that is legitimately whitespace-only or carries such a character
 * would be refused here, and the answer to that is a schema change, not a looser reader.
 */
function opaque(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= 256
    && value.trim().length > 0 && !UNSAFE_ID_CHARS.test(value) ? value : null;
}

function idList(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_IDS) return null;
  const out: string[] = [];
  for (const entry of value) {
    const id = opaque(entry);
    if (id === null) return null;
    out.push(id);
  }
  return new Set(out).size === out.length ? out : null;
}

function readSelector(raw: unknown): AccessSelector | null {
  const selector = record(raw);
  if (selector === null) return null;
  const keys: Record<string, readonly string[]> = {
    EXPLICIT_RESOURCE_SET: ["kind", "resource_kind", "ids"],
    OWN_ALPHA: ["kind"],
    PORTFOLIO_MEMBERSHIP: ["kind", "portfolio_ids"],
    ROOT_SCOPE: ["kind", "root_id"],
  };
  const allowed = typeof selector.kind === "string" && Object.prototype.hasOwnProperty.call(keys, selector.kind) ? keys[selector.kind] : null;
  if (allowed === null || !hasOnly(selector, allowed)) return null;
  switch (selector.kind) {
    case "EXPLICIT_RESOURCE_SET": {
      const resourceKind = oneOf(selector.resource_kind, ACCESS_RESOURCE_KINDS);
      const ids = idList(selector.ids);
      return resourceKind === null || ids === null ? null : { kind: "EXPLICIT_RESOURCE_SET", resourceKind, ids };
    }
    case "OWN_ALPHA":
      return { kind: "OWN_ALPHA" };
    case "PORTFOLIO_MEMBERSHIP": {
      const portfolioIds = idList(selector.portfolio_ids);
      return portfolioIds === null ? null : { kind: "PORTFOLIO_MEMBERSHIP", portfolioIds };
    }
    case "ROOT_SCOPE": {
      const rootId = opaque(selector.root_id);
      return rootId === null ? null : { kind: "ROOT_SCOPE", rootId };
    }
    default:
      return null;
  }
}

function readEnvironments(raw: unknown): readonly AccessEnvironment[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > ACCESS_ENVIRONMENTS.length) return null;
  const out: AccessEnvironment[] = [];
  for (const entry of raw) {
    const env = oneOf(entry, ACCESS_ENVIRONMENTS);
    if (env === null) return null;
    out.push(env);
  }
  return new Set(out).size === out.length ? out : null;
}

function readGrant(raw: unknown): AccessGrant | null {
  const grant = record(raw);
  if (grant === null || !hasOnly(grant, GRANT_KEYS)) return null;
  const grantId = opaque(grant.grant_id);
  const action = typeof grant.action === "string" && ACTION.test(grant.action) && grant.action.length <= 128 ? grant.action : null;
  const effect = oneOf(grant.effect, ACCESS_EFFECTS);
  const selector = readSelector(grant.selector);
  const environments = readEnvironments(grant.environments);
  const validFrom = clockMs(grant.valid_from_ms);
  const validUntil = grant.valid_until_ms === null ? null : clockMs(grant.valid_until_ms);
  const revision = opaque(grant.revision);
  const tsAuthority = oneOf(grant.ts_authority, ACCESS_TS_AUTHORITIES);
  if (
    grantId === null || action === null || effect === null || selector === null || environments === null
    || validFrom === null || (grant.valid_until_ms !== null && validUntil === null) || revision === null
    || typeof grant.current !== "boolean" || tsAuthority === null
  ) return null;
  // The contract's interval is end-exclusive and non-empty.
  if (validUntil !== null && validUntil <= validFrom) return null;
  return { grantId, action, effect, selector, environments, validFrom, validUntil, revision, current: grant.current, tsAuthority };
}

function readFieldPolicy(raw: unknown): AccessEffective["researcherFieldPolicy"] | null {
  const policy = record(raw);
  if (policy === null || !hasOnly(policy, ["state", "policy_ref"])) return null;
  const state = oneOf(policy.state, ["PENDING", "QUALIFIED"] as const);
  const policyRef = policy.policy_ref === null ? null : opaque(policy.policy_ref);
  if (state === null || (policy.policy_ref !== null && policyRef === null)) return null;
  // A qualified policy names the reference it was qualified under.
  if (state === "QUALIFIED" && policyRef === null) return null;
  return { state, policyRef };
}

function readOwnerRecovery(raw: unknown): AccessEffective["ownerRecovery"] | null {
  const recovery = record(raw);
  if (recovery === null || !hasOnly(recovery, ["enabled", "reason_code"]) || !isFalse(recovery.enabled) || recovery.reason_code !== "OWNER_RECOVERY_NOT_APPROVED") return null;
  return { enabled: false, reasonCode: "OWNER_RECOVERY_NOT_APPROVED" };
}

/**
 * Effective-access body -> typed read.
 *
 * `null` is "malformed" and must render as unavailable. A body of another
 * schema is `unsupported_shape`. The result is the contract's facts and
 * nothing the screen could confuse with a grant it made up.
 */
export function readAccessEffective(raw: unknown): AccessEffectiveRead | null {
  const root = record(raw);
  if (root === null) return null;
  const version = typeof root.schema_version === "string" ? root.schema_version : null;
  if (version !== ACCESS_EFFECTIVE_SCHEMA) return { kind: "unsupported_shape", schemaVersion: version };

  // The version is read first so another schema stays `unsupported_shape`; only this schema's body is held to its keys.
  if (!hasOnly(root, ROOT_KEYS)) return null;

  const workspaceId = opaque(root.workspace_id);
  const userId = opaque(root.user_id);
  const policyRevision = root.policy_revision === null ? null : opaque(root.policy_revision);
  const availability = oneOf(root.availability, ACCESS_AVAILABILITIES);
  const reasonCode = root.reason_code === null ? null : token(root.reason_code);
  const fieldPolicy = readFieldPolicy(root.researcher_field_policy);
  const ownerRecovery = readOwnerRecovery(root.owner_recovery);
  if (
    workspaceId === null || userId === null || (root.policy_revision !== null && policyRevision === null)
    || availability === null || (root.reason_code !== null && reasonCode === null)
    || fieldPolicy === null || ownerRecovery === null
    || !Array.isArray(root.grants) || root.grants.length > MAX_GRANTS
  ) return null;
  // The server states a reason exactly when the policy is pending.
  if ((availability === "POLICY_PENDING") !== (reasonCode !== null)) return null;

  const grants: AccessGrant[] = [];
  for (const entry of root.grants) {
    const grant = readGrant(entry);
    if (grant === null) return null;
    grants.push(grant);
  }
  if (new Set(grants.map((grant) => grant.grantId)).size !== grants.length) return null;

  return {
    kind: "effective",
    effective: { workspaceId, userId, policyRevision, availability, reasonCode, grants, researcherFieldPolicy: fieldPolicy, ownerRecovery },
  };
}

/** The request path. The query is strict on the server: `workspace_id` and nothing else. */
export const ACCESS_EFFECTIVE_PATH = "/api/admin/profile-access/v2/effective";

export function accessEffectiveUrl(workspaceId: string): string {
  return `${ACCESS_EFFECTIVE_PATH}?workspace_id=${encodeURIComponent(workspaceId)}`;
}
