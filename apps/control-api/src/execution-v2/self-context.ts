/** FE-057/058/038 · the current session's OWN navigation context, advisory and pure.
 *
 * It publishes only facts the client must otherwise GUESS, and only about the caller:
 *   - default_workspace: which workspace the server resolves for this member, or a typed absence. It is never a
 *     choice between several: more than one candidate is AMBIGUOUS and the member picks. A candidate is a workspace
 *     the caller is a CURRENT MEMBER of; `OWN_CURRENT_GRANT_RECORD` additionally says a stored, unrevoked,
 *     in-interval ALLOW record of the caller's own exists under that workspace's current policy revision. That is
 *     a hint for choosing a workspace, NOT proof of an effective right: the navigation/eligibility reads for the
 *     chosen workspace evaluate the full graph and remain authoritative.
 *   - self_entry: a self-only entry route, distinct from the admin policy matrix (/administration/profile-access).
 *     The admin guards are untouched; this route is for the member's OWN access review and backs onto the existing
 *     own `effective` read only. `AWAITING_CONSUMER_ROUTER` states that the client must implement it first.
 *   - account_operations: the account-management mutation is not commissioned. The credential rotation behind the
 *     "Rotate credential" control is the PM REVISE_BINDING (credential-only) family; Portal has no route for it
 *     (binding.change.propose proposes only) and no source/provider is qualified. So the typed branch is a refusal
 *     that holds for EVERY member, never a permission. A navigation fact never opens a mutation.
 *
 * Pure module: no database, no I/O. The DB capture lives in self-context.store.ts.
 */
import { z } from "zod";
import { AccessPolicyError } from "./access.contract";
import { scopedText } from "./self-eligibility";

/** The distinct self-only presentation. Must never equal or sit under the admin matrix route. */
export const SELF_ACCESS_ENTRY_ROUTE = "/administration/my-access";
export const ADMIN_ACCESS_ROUTE = "/administration/profile-access";
export const MAX_SELF_CONTEXT_WORKSPACES = 16;

const ms = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const candidate = z.object({ workspace_id: scopedText,
  access_basis: z.enum(["OWN_CURRENT_GRANT_RECORD", "MEMBER_ONLY"]) }).strict();
export const defaultWorkspace = z.discriminatedUnion("state", [
  z.object({ state: z.literal("RESOLVED"), workspace_id: scopedText,
    rule: z.enum(["SOLE_WORKSPACE_WITH_CURRENT_GRANT_RECORD", "SOLE_MEMBERSHIP"]) }).strict(),
  z.object({ state: z.literal("AMBIGUOUS"), candidates: z.array(candidate).min(2).max(MAX_SELF_CONTEXT_WORKSPACES) }).strict(),
  z.object({ state: z.literal("NONE"), reason_class: z.literal("NO_WORKSPACE_MEMBERSHIP") }).strict(),
  z.object({ state: z.literal("UNAVAILABLE"), reason_class: z.literal("TOO_MANY_MEMBERSHIPS") }).strict(),
]);
const selfEntry = z.discriminatedUnion("permission", [
  z.object({ feature: z.literal("PROFILE_ACCESS"), mode: z.literal("SELF_ONLY"), permission: z.literal("ALLOWED"),
    route: z.literal(SELF_ACCESS_ENTRY_ROUTE), workspace_scope: z.literal("QUERY_workspace_id"), reason_class: z.null(),
    consumer_state: z.literal("AWAITING_CONSUMER_ROUTER") }).strict(),
  z.object({ feature: z.literal("PROFILE_ACCESS"), mode: z.literal("SELF_ONLY"), permission: z.literal("UNAVAILABLE"),
    route: z.null(), workspace_scope: z.null(), reason_class: z.literal("NO_WORKSPACE_MEMBERSHIP"),
    consumer_state: z.literal("AWAITING_CONSUMER_ROUTER") }).strict(),
]);
/** Display identifiers for a control, NOT capability names, never accepted as authority. */
const accountOperation = z.object({
  operation: z.literal("REVISE_BINDING"), scope: z.literal("CREDENTIAL_ONLY"), target_kind: z.literal("BINDING"),
  availability: z.literal("NOT_COMMISSIONED"), reason_class: z.literal("COMMAND_FAMILY_NOT_COMMISSIONED"),
  basis: z.literal("NONE_PUBLISHED"), step_up_required: z.null(),
}).strict();
export const ACCOUNT_OPERATIONS = [{ operation: "REVISE_BINDING", scope: "CREDENTIAL_ONLY", target_kind: "BINDING",
  availability: "NOT_COMMISSIONED", reason_class: "COMMAND_FAMILY_NOT_COMMISSIONED", basis: "NONE_PUBLISHED",
  step_up_required: null }] as const;

export const selfContextResult = z.object({
  schema_version: z.literal("portal.self-context.v1"),
  current_only: z.literal(true), advisory_only: z.literal(true),
  observed_at_ms: ms.describe("Portal evaluation time in UTC epoch milliseconds, not a source observation time."),
  valid_until_ms: ms.describe("End-exclusive ceiling of this actor's current session only, not the validity of any right. Discard on a session, workspace-membership or environment change; never a cache TTL."),
  default_workspace: defaultWorkspace,
  self_entry: selfEntry,
  account_operations: z.array(accountOperation).length(ACCOUNT_OPERATIONS.length),
}).strict().superRefine((value, ctx) => {
  const bad = (message: string, path: (string | number)[]) => ctx.addIssue({ code: z.ZodIssueCode.custom, message, path });
  if (value.valid_until_ms <= value.observed_at_ms) bad("PROJECTION_INTERVAL_INVALID", ["valid_until_ms"]);
  const wd = value.default_workspace;
  if ((wd.state === "NONE") !== (value.self_entry.permission === "UNAVAILABLE")) bad("SELF_ENTRY_INCONSISTENT", ["self_entry"]);
  if (wd.state === "AMBIGUOUS") {
    const ids = wd.candidates.map(item => item.workspace_id);
    if (new Set(ids).size !== ids.length || ids.some((id, index) => index > 0 && ids[index - 1] >= id)) bad("CANDIDATES_NOT_UNIQUE_SORTED", ["default_workspace", "candidates"]);
    // An ambiguity among grant-bearing workspaces lists only those; a member-only ambiguity lists only member-only ones.
    const bases = new Set(wd.candidates.map(item => item.access_basis));
    if (bases.size !== 1) bad("CANDIDATE_BASES_MIXED", ["default_workspace", "candidates"]);
  }
  if (wd.state === "RESOLVED" && value.self_entry.permission !== "ALLOWED") bad("SELF_ENTRY_INCONSISTENT", ["self_entry"]);
  const route: string | null = value.self_entry.route;
  if (route !== null && (route === ADMIN_ACCESS_ROUTE || route.startsWith(ADMIN_ACCESS_ROUTE + "/") || route.includes("?") || route.includes("#")))
    bad("SELF_ENTRY_ROUTE_IS_ADMIN_MATRIX", ["self_entry", "route"]);
});
export type SelfContext = z.infer<typeof selfContextResult>;

/** Captured by the store inside one short read-only snapshot, after the exact current-actor fence. */
export interface SelfContextFacts {
  now_ms: number;
  lease_until_ms: number;
  /** The caller's current memberships, sorted by workspace_id, at most MAX+1 (the +1 only signals overflow). */
  memberships: ReadonlyArray<{ workspace_id: string; has_current_grant_record: boolean }>;
}

/** Never guess: one candidate is the answer, several are AMBIGUOUS, too many are typed-unavailable (never the first N). */
export function resolveDefaultWorkspace(input: SelfContextFacts["memberships"]): z.infer<typeof defaultWorkspace> {
  // Code-unit order, independent of the database collation, so the published order is deterministic.
  const memberships = [...input].sort((a, b) => a.workspace_id < b.workspace_id ? -1 : a.workspace_id > b.workspace_id ? 1 : 0);
  if (memberships.length === 0) return { state: "NONE", reason_class: "NO_WORKSPACE_MEMBERSHIP" };
  if (memberships.length > MAX_SELF_CONTEXT_WORKSPACES) return { state: "UNAVAILABLE", reason_class: "TOO_MANY_MEMBERSHIPS" };
  const withGrant = memberships.filter(item => item.has_current_grant_record);
  if (withGrant.length === 1) return { state: "RESOLVED", workspace_id: withGrant[0].workspace_id, rule: "SOLE_WORKSPACE_WITH_CURRENT_GRANT_RECORD" };
  if (withGrant.length > 1) return { state: "AMBIGUOUS", candidates: withGrant.map(item => ({ workspace_id: item.workspace_id, access_basis: "OWN_CURRENT_GRANT_RECORD" as const })) };
  if (memberships.length === 1) return { state: "RESOLVED", workspace_id: memberships[0].workspace_id, rule: "SOLE_MEMBERSHIP" };
  return { state: "AMBIGUOUS", candidates: memberships.map(item => ({ workspace_id: item.workspace_id, access_basis: "MEMBER_ONLY" as const })) };
}

export function projectSelfContext(facts: SelfContextFacts, clock: () => number = Date.now): SelfContext {
  const now = Math.max(facts.now_ms, clock());
  // The caller's own session wins over everything: a session that ended while we read answers nothing.
  if (!Number.isSafeInteger(now) || !Number.isSafeInteger(facts.lease_until_ms) || facts.lease_until_ms <= 0 || now >= facts.lease_until_ms)
    throw new AccessPolicyError("CURRENT_ACTOR_AUTHORITY_REQUIRED", 403);
  const default_workspace = resolveDefaultWorkspace(facts.memberships);
  return selfContextResult.parse({
    schema_version: "portal.self-context.v1", current_only: true, advisory_only: true,
    observed_at_ms: now, valid_until_ms: facts.lease_until_ms, default_workspace,
    self_entry: default_workspace.state === "NONE"
      ? { feature: "PROFILE_ACCESS", mode: "SELF_ONLY", permission: "UNAVAILABLE", route: null, workspace_scope: null,
        reason_class: "NO_WORKSPACE_MEMBERSHIP", consumer_state: "AWAITING_CONSUMER_ROUTER" }
      : { feature: "PROFILE_ACCESS", mode: "SELF_ONLY", permission: "ALLOWED", route: SELF_ACCESS_ENTRY_ROUTE,
        workspace_scope: "QUERY_workspace_id", reason_class: null, consumer_state: "AWAITING_CONSUMER_ROUTER" },
    account_operations: ACCOUNT_OPERATIONS,
  });
}
