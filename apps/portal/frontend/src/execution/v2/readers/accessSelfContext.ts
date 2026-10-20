/**
 * V2 reader for the member's own session context (FE-057/058/038, Claude BE-P7 `1449455e`):
 * `GET /api/admin/profile-access/v2/self-context`, schema `portal.self-context.v1` (`AccessSelfContext`), operationId
 * `portalScopedAccessSelfContextGetV1`. The read takes NO query: the workspace is an output, so there is nothing to spoof.
 *
 * What the body is, and is not (kept true for a screen):
 * - ADVISORY and current-only. It names which workspace the server resolves for this member, or a typed absence, plus the self-only
 *   entry route and the typed no-operation branch for account management. It is not a permit: every read and command for the chosen
 *   workspace evaluates the full authority graph itself.
 * - `default_workspace` is NEVER a choice made for a member among several. One candidate is `RESOLVED`; several are `AMBIGUOUS` and
 *   the member picks; none is `NONE`; too many is `UNAVAILABLE` (never "the first N"). A candidate is a workspace the caller is a
 *   current MEMBER of; `OWN_CURRENT_GRANT_RECORD` is a hint for choosing, not proof of a right.
 * - `self_entry.route` is the self-only page (`/administration/my-access`), never the admin matrix, with no query or fragment; the
 *   workspace travels as `?workspace_id=` (`QUERY_workspace_id`). `AWAITING_CONSUMER_ROUTER`: the client implements the route.
 * - `account_operations` is the typed ABSENCE of an account-management mutation (`REVISE_BINDING`, `NOT_COMMISSIONED`): a refusal that
 *   holds for every member, `step_up_required: null` (not determined, never `false`). The identifiers are display names, not
 *   capability names, and nothing here opens a control.
 * - `valid_until_ms` is the end-exclusive ceiling of THIS actor's session only; it can only SHUT the answer (`selfProjectionExpiry`).
 *
 * Runtime rules the schema cannot say and the server enforces (a violation voids the read): `valid_until_ms > observed_at_ms`,
 * candidates unique and strictly ascending by `workspace_id` in code-unit order (as published; the client does not re-sort), one
 * `access_basis` for the whole ambiguity, `NONE` exactly when the self entry is `UNAVAILABLE`. Closed keys everywhere; another
 * `schema_version` is `unsupported_shape`; never throws.
 */
import type { UnsupportedAccessShape } from "./accessEffective";
import { SELF_ENTRY_PATH } from "../../../app/selfNavView";
import { closed, oneOf, projectionTimes, rec, selectorText } from "./accessSelf";

export const ACCESS_SELF_CONTEXT_SCHEMA = "portal.self-context.v1";
export const ACCESS_SELF_CONTEXT_PATH = "/api/admin/profile-access/v2/self-context";
/** The self-only page. The admin matrix stays at `/administration/profile-access`. */
export const SELF_ENTRY_ROUTE = SELF_ENTRY_PATH;
export const MAX_SELF_CONTEXT_CANDIDATES = 16;
export const SELF_CONTEXT_RESOLVED_RULES = ["SOLE_WORKSPACE_WITH_CURRENT_GRANT_RECORD", "SOLE_MEMBERSHIP"] as const;
export type SelfContextResolvedRule = (typeof SELF_CONTEXT_RESOLVED_RULES)[number];
export const SELF_CONTEXT_ACCESS_BASES = ["OWN_CURRENT_GRANT_RECORD", "MEMBER_ONLY"] as const;
export type SelfContextAccessBasis = (typeof SELF_CONTEXT_ACCESS_BASES)[number];

export interface SelfContextCandidate {
  workspaceId: string;
  accessBasis: SelfContextAccessBasis;
}

export type DefaultWorkspace =
  | { state: "RESOLVED"; workspaceId: string; rule: SelfContextResolvedRule }
  | { state: "AMBIGUOUS"; /** 2 to 16, unique, in the order published (ascending by workspace_id). */ candidates: readonly SelfContextCandidate[] }
  | { state: "NONE"; reasonClass: "NO_WORKSPACE_MEMBERSHIP" }
  | { state: "UNAVAILABLE"; reasonClass: "TOO_MANY_MEMBERSHIPS" };

export type SelfEntry =
  | { permission: "ALLOWED"; route: typeof SELF_ENTRY_ROUTE; reasonClass: null }
  | { permission: "UNAVAILABLE"; route: null; reasonClass: "NO_WORKSPACE_MEMBERSHIP" };

/** The typed ABSENCE of an account-management mutation. A refusal for every member, never a permission. */
export interface AccountOperation {
  operation: "REVISE_BINDING";
  scope: "CREDENTIAL_ONLY";
  targetKind: "BINDING";
  availability: "NOT_COMMISSIONED";
  reasonClass: "COMMAND_FAMILY_NOT_COMMISSIONED";
  basis: "NONE_PUBLISHED";
  /** `null` is "not determined", never `false`. */
  stepUpRequired: null;
}

export interface AccessSelfContext {
  currentOnly: true;
  advisoryOnly: true;
  /** Portal evaluation time, UTC epoch ms. */
  observedAtMs: number;
  /** End-exclusive ceiling of this actor's session only, `> observedAtMs`. Not a TTL, lease or readiness. */
  validUntilMs: number;
  defaultWorkspace: DefaultWorkspace;
  selfEntry: SelfEntry;
  accountOperations: readonly [AccountOperation];
}

export type AccessSelfContextRead = { kind: "self_context"; context: AccessSelfContext } | UnsupportedAccessShape;

const CONTEXT_KEYS = [
  "schema_version", "current_only", "advisory_only", "observed_at_ms", "valid_until_ms", "default_workspace", "self_entry", "account_operations",
] as const;

function readDefaultWorkspace(raw: unknown): DefaultWorkspace | null {
  const state = rec(raw)?.state;
  if (state === "RESOLVED") {
    const body = closed(raw, ["state", "workspace_id", "rule"]);
    const workspaceId = selectorText(body?.workspace_id);
    const rule = oneOf(body?.rule, SELF_CONTEXT_RESOLVED_RULES);
    return body === null || workspaceId === null || rule === null ? null : { state: "RESOLVED", workspaceId, rule };
  }
  if (state === "AMBIGUOUS") {
    const body = closed(raw, ["state", "candidates"]);
    if (body === null || !Array.isArray(body.candidates) || body.candidates.length < 2 || body.candidates.length > MAX_SELF_CONTEXT_CANDIDATES) return null;
    const candidates: SelfContextCandidate[] = [];
    for (const entry of body.candidates) {
      const item = closed(entry, ["workspace_id", "access_basis"]);
      const workspaceId = selectorText(item?.workspace_id);
      const accessBasis = oneOf(item?.access_basis, SELF_CONTEXT_ACCESS_BASES);
      if (item === null || workspaceId === null || accessBasis === null) return null;
      candidates.push({ workspaceId, accessBasis });
    }
    // Unique and strictly ascending in code-unit order (the server's own order), one basis for the whole ambiguity. The client never re-sorts.
    for (let index = 1; index < candidates.length; index += 1) {
      if (!(candidates[index - 1]!.workspaceId < candidates[index]!.workspaceId)) return null;
    }
    if (new Set(candidates.map((candidate) => candidate.accessBasis)).size !== 1) return null;
    return { state: "AMBIGUOUS", candidates };
  }
  if (state === "NONE") {
    const body = closed(raw, ["state", "reason_class"]);
    return body !== null && body.reason_class === "NO_WORKSPACE_MEMBERSHIP" ? { state: "NONE", reasonClass: "NO_WORKSPACE_MEMBERSHIP" } : null;
  }
  if (state === "UNAVAILABLE") {
    const body = closed(raw, ["state", "reason_class"]);
    return body !== null && body.reason_class === "TOO_MANY_MEMBERSHIPS" ? { state: "UNAVAILABLE", reasonClass: "TOO_MANY_MEMBERSHIPS" } : null;
  }
  return null;
}

const ENTRY_KEYS = ["feature", "mode", "permission", "route", "workspace_scope", "reason_class", "consumer_state"] as const;

function readSelfEntry(raw: unknown): SelfEntry | null {
  const body = closed(raw, ENTRY_KEYS);
  if (body === null || body.feature !== "PROFILE_ACCESS" || body.mode !== "SELF_ONLY" || body.consumer_state !== "AWAITING_CONSUMER_ROUTER") return null;
  if (body.permission === "ALLOWED") {
    return body.route === SELF_ENTRY_ROUTE && body.workspace_scope === "QUERY_workspace_id" && body.reason_class === null
      ? { permission: "ALLOWED", route: SELF_ENTRY_ROUTE, reasonClass: null }
      : null;
  }
  if (body.permission === "UNAVAILABLE") {
    return body.route === null && body.workspace_scope === null && body.reason_class === "NO_WORKSPACE_MEMBERSHIP"
      ? { permission: "UNAVAILABLE", route: null, reasonClass: "NO_WORKSPACE_MEMBERSHIP" }
      : null;
  }
  return null;
}

function readAccountOperations(raw: unknown): readonly [AccountOperation] | null {
  if (!Array.isArray(raw) || raw.length !== 1) return null;
  const op = closed(raw[0], ["operation", "scope", "target_kind", "availability", "reason_class", "basis", "step_up_required"]);
  if (
    op === null || op.operation !== "REVISE_BINDING" || op.scope !== "CREDENTIAL_ONLY" || op.target_kind !== "BINDING"
    || op.availability !== "NOT_COMMISSIONED" || op.reason_class !== "COMMAND_FAMILY_NOT_COMMISSIONED" || op.basis !== "NONE_PUBLISHED"
    || op.step_up_required !== null
  ) return null;
  return [{
    operation: "REVISE_BINDING", scope: "CREDENTIAL_ONLY", targetKind: "BINDING", availability: "NOT_COMMISSIONED",
    reasonClass: "COMMAND_FAMILY_NOT_COMMISSIONED", basis: "NONE_PUBLISHED", stepUpRequired: null,
  }];
}

/** Body -> typed read. `null` is "malformed" and renders as unavailable; another `schema_version` is `unsupported_shape`. */
export function readAccessSelfContext(raw: unknown): AccessSelfContextRead | null {
  const root = rec(raw);
  if (root === null) return null;
  const version = typeof root.schema_version === "string" ? root.schema_version : null;
  if (version !== ACCESS_SELF_CONTEXT_SCHEMA) return { kind: "unsupported_shape", schemaVersion: version };
  const body = closed(root, CONTEXT_KEYS);
  if (body === null || body.current_only !== true || body.advisory_only !== true) return null;
  const times = projectionTimes(body);
  const defaultWorkspace = readDefaultWorkspace(body.default_workspace);
  const selfEntry = readSelfEntry(body.self_entry);
  const accountOperations = readAccountOperations(body.account_operations);
  if (times === null || defaultWorkspace === null || selfEntry === null || accountOperations === null) return null;
  // NONE exactly when the self entry is UNAVAILABLE: a member with no membership has no page to open, any other member has one.
  if ((defaultWorkspace.state === "NONE") !== (selfEntry.permission === "UNAVAILABLE")) return null;
  return { kind: "self_context", context: { currentOnly: true, advisoryOnly: true, ...times, defaultWorkspace, selfEntry, accountOperations } };
}
