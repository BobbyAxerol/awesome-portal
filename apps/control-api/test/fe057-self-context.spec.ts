/** FE-057/058/038 · the member's own session context: default workspace, self-only entry, typed no-operation branch.
 * TEST_ONLY. No PostgreSQL: the real capture runs against a scripted client that answers exactly the statements it issues
 * (and records them, so authorization-before-data and actor-keyed access are observable). The mounted HTTP route and
 * the real database are NOT_RUN here. */
import { describe, expect, it, vi } from "vitest";
import { AccessPolicyError, type ScopedAccessGrant } from "../src/execution-v2/access.contract";
import { ExecutionAccessController } from "../src/execution-v2/access.controller";
import { ExecutionAccessService } from "../src/execution-v2/access.service";
import { ACCOUNT_OPERATIONS, ADMIN_ACCESS_ROUTE, SELF_ACCESS_ENTRY_ROUTE, MAX_SELF_CONTEXT_WORKSPACES, projectSelfContext,
  resolveDefaultWorkspace, selfContextResult, type SelfContextFacts } from "../src/execution-v2/self-context";
import { captureSelfContextFacts } from "../src/execution-v2/self-context.store";
import { projectNavigation, projectEligibility } from "../src/execution-v2/self-eligibility";
import { NOW, OWNER, U, WS, fixture, grant } from "./support/access-fixture";

const LEASE = NOW + 60_000;
const m = (workspace_id: string, has_current_grant_record = false) => ({ workspace_id, has_current_grant_record });
const facts = (memberships: SelfContextFacts["memberships"], over: Partial<SelfContextFacts> = {}): SelfContextFacts =>
  ({ now_ms: NOW, lease_until_ms: LEASE, memberships, ...over });

describe("resolveDefaultWorkspace: never a guess", () => {
  it("none -> typed absence; one -> resolved; several -> ambiguous; too many -> typed unavailable", () => {
    expect(resolveDefaultWorkspace([])).toEqual({ state: "NONE", reason_class: "NO_WORKSPACE_MEMBERSHIP" });
    expect(resolveDefaultWorkspace([m("ws_a")])).toEqual({ state: "RESOLVED", workspace_id: "ws_a", rule: "SOLE_MEMBERSHIP" });
    expect(resolveDefaultWorkspace([m("ws_a", true)])).toEqual({ state: "RESOLVED", workspace_id: "ws_a", rule: "SOLE_WORKSPACE_WITH_CURRENT_GRANT_RECORD" });
    expect(resolveDefaultWorkspace([m("ws_a"), m("ws_b")])).toEqual({ state: "AMBIGUOUS", candidates: [
      { workspace_id: "ws_a", access_basis: "MEMBER_ONLY" }, { workspace_id: "ws_b", access_basis: "MEMBER_ONLY" }] });
    const many = Array.from({ length: MAX_SELF_CONTEXT_WORKSPACES + 1 }, (_, i) => m("ws" + String(i).padStart(2, "0")));
    expect(resolveDefaultWorkspace(many)).toEqual({ state: "UNAVAILABLE", reason_class: "TOO_MANY_MEMBERSHIPS" }); // never the first 16
    expect(resolveDefaultWorkspace(many.slice(0, MAX_SELF_CONTEXT_WORKSPACES)).state).toBe("AMBIGUOUS");
  });
  it("a personal workspace beside a shared one with the member's grant record resolves to the shared one; two grant-bearing ones stay ambiguous", () => {
    expect(resolveDefaultWorkspace([m("ws_personal"), m("ws_shared", true)]))
      .toEqual({ state: "RESOLVED", workspace_id: "ws_shared", rule: "SOLE_WORKSPACE_WITH_CURRENT_GRANT_RECORD" });
    expect(resolveDefaultWorkspace([m("ws_personal"), m("ws_x", true), m("ws_y", true)])).toEqual({ state: "AMBIGUOUS", candidates: [
      { workspace_id: "ws_x", access_basis: "OWN_CURRENT_GRANT_RECORD" }, { workspace_id: "ws_y", access_basis: "OWN_CURRENT_GRANT_RECORD" }] });
  });
  it("candidate order is deterministic (code-unit order) whatever order the database returned", () => {
    const out = resolveDefaultWorkspace([m("ws_b"), m("ws_B"), m("ws_a")]);
    expect(out.state === "AMBIGUOUS" && out.candidates.map(c => c.workspace_id)).toEqual(["ws_B", "ws_a", "ws_b"]);
  });
});

describe("projectSelfContext: session-bound, advisory, never a permit", () => {
  it("publishes the session ceiling as valid_until_ms and the later of the DB and process clock as observed_at_ms", () => {
    const out = projectSelfContext(facts([m("ws_a")]), () => NOW + 5);
    expect(out).toMatchObject({ schema_version: "portal.self-context.v1", current_only: true, advisory_only: true, observed_at_ms: NOW + 5, valid_until_ms: LEASE });
    expect(selfContextResult.safeParse(out).success).toBe(true);
    expect(out.self_entry).toMatchObject({ permission: "ALLOWED", route: SELF_ACCESS_ENTRY_ROUTE });
    expect(out.account_operations).toEqual(ACCOUNT_OPERATIONS);
  });
  it("a session that ended while reading answers nothing (403), including exactly at the ceiling and with a bad lease", () => {
    for (const [lease, clock] of [[LEASE, LEASE], [LEASE, LEASE + 1], [0, NOW], [-1, NOW], [Number.NaN, NOW], [Number.MAX_SAFE_INTEGER + 2, NOW]] as const)
      expect(() => projectSelfContext(facts([m("ws_a")], { lease_until_ms: lease }), () => clock), `${lease}/${clock}`)
        .toThrowError(expect.objectContaining({ code: "CURRENT_ACTOR_AUTHORITY_REQUIRED", status: 403 }));
    expect(() => projectSelfContext(facts([m("ws_a")]), () => LEASE - 1)).not.toThrow();
  });
  it("no membership publishes a typed-unavailable self entry with no route, and nothing else", () => {
    const out = projectSelfContext(facts([]), () => NOW);
    expect(out.default_workspace).toEqual({ state: "NONE", reason_class: "NO_WORKSPACE_MEMBERSHIP" });
    expect(out.self_entry).toMatchObject({ permission: "UNAVAILABLE", route: null, workspace_scope: null, reason_class: "NO_WORKSPACE_MEMBERSHIP" });
    expect(out.account_operations).toEqual(ACCOUNT_OPERATIONS); // a refusal that holds for everyone, also for the memberless
  });
  it("the self-only route is distinct from the admin matrix and cannot carry a fragment or query", () => {
    expect(SELF_ACCESS_ENTRY_ROUTE).not.toBe(ADMIN_ACCESS_ROUTE);
    expect(SELF_ACCESS_ENTRY_ROUTE.startsWith(ADMIN_ACCESS_ROUTE)).toBe(false);
    expect(SELF_ACCESS_ENTRY_ROUTE).not.toMatch(/[?#]/);
  });
  it("account management is a typed refusal with no capability name, and an undetermined (never false) step-up", () => {
    expect(ACCOUNT_OPERATIONS).toEqual([{ operation: "REVISE_BINDING", scope: "CREDENTIAL_ONLY", target_kind: "BINDING", availability: "NOT_COMMISSIONED",
      reason_class: "COMMAND_FAMILY_NOT_COMMISSIONED", basis: "NONE_PUBLISHED", step_up_required: null }]);
    const text = JSON.stringify(projectSelfContext(facts([m("ws_a")]), () => NOW));
    expect(text).not.toMatch(/accounts\.manage|binding\.change|capabilit|grant_id|policy_revision|owner|usr_/);
  });
});

/** Scripts exactly the statements captureSelfContextFacts issues. */
function scripted(options: { session?: boolean; memberships?: string[]; policies?: Record<string, unknown>; grants?: Record<string, unknown[]>;
  anchor?: string | null; failPolicyFor?: string; lease?: number } = {}) {
  const log: Array<{ sql: string; params: unknown[] }> = [];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    const text = sql.replace(/\s+/g, " ").trim();
    log.push({ sql: text, params });
    if (/FROM portal_users u JOIN auth_sessions s/.test(text))
      return options.session === false ? { rows: [], rowCount: 0 } : { rows: [{ lease_until_ms: String(options.lease ?? LEASE) }], rowCount: 1 };
    if (/FROM workspace_members m JOIN workspaces w/.test(text)) {
      const ids = (options.memberships ?? []).slice(0, Number(params[1]));
      return { rows: ids.map(workspace_id => ({ workspace_id })), rowCount: ids.length };
    }
    if (/::bigint AS ms$/.test(text)) return { rows: [{ ms: String(NOW) }], rowCount: 1 };
    if (/FROM portal_owner_anchor/.test(text)) return options.anchor === null ? { rows: [], rowCount: 0 } : { rows: [{ user_id: options.anchor ?? OWNER }], rowCount: 1 };
    if (/FROM portal_access_policy_state/.test(text)) {
      if (options.failPolicyFor === params[0]) throw new Error("connection terminated");
      const policy = options.policies?.[String(params[0])];
      return policy ? { rows: [{ policy }], rowCount: 1 } : { rows: [], rowCount: 0 };
    }
    if (/FROM portal_access_grants_v2/.test(text)) {
      const rows = (options.grants?.[String(params[0])] ?? []).map(grant_fact => ({ grant_fact }));
      return { rows, rowCount: rows.length };
    }
    return { rows: [], rowCount: 0 };
  });
  return { db: { query } as never, log };
}
const policyOf = (workspace: string, over: Record<string, unknown> = {}) => ({ workspace_id: workspace, revision: "TEST_ONLY:policy:" + workspace,
  artifact_digest: "sha256:" + "0".repeat(64), approval_ref: "TEST_ONLY", state: "REVIEWED", qualification: "TEST_ONLY", protected_owner_user_id: OWNER,
  researcher_fields: { state: "QUALIFIED", policy_ref: "TEST_ONLY:fields", fields: [] }, ...over });
const own = (workspace: string, over: Partial<ScopedAccessGrant> = {}) =>
  grant("TEST_ONLY:g:" + workspace, { workspace_id: workspace, policy_revision: "TEST_ONLY:policy:" + workspace, requires_ts_acceptance: false, ts_receipt: null,
    valid_until_ms: NOW + 10_000, ...over });
const actor = { user_id: U, session_id: "sess-1", session_generation: 7 };

describe("captureSelfContextFacts: authorization before data, keyed by the caller", () => {
  it("proves the exact current actor/session FIRST and reads memberships only by that actor's id", async () => {
    const { db, log } = scripted({ memberships: ["ws_a"] });
    const out = await captureSelfContextFacts(db, actor);
    expect(out).toEqual({ now_ms: NOW, lease_until_ms: LEASE, memberships: [{ workspace_id: "ws_a", has_current_grant_record: false }] });
    expect(log[0].sql).toMatch(/portal_users u JOIN auth_sessions s/);
    expect(log[0].params).toEqual([U, 7, "sess-1"]);
    const membership = log.find(entry => /workspace_members/.test(entry.sql))!;
    expect(membership.params[0]).toBe(U);
    expect(log.indexOf(membership)).toBeGreaterThan(0);
    // genuine membership only: no owner-anchor exception in the membership statement
    expect(membership.sql).not.toMatch(/portal_owner_anchor/);
  });
  it.each([["expired, revoked, replaced, disabled or archived session / user", { session: false }]])(
    "%s -> CURRENT_ACTOR_AUTHORITY_REQUIRED and NO membership / policy / grant statement is ever issued", async (_name, options) => {
      const { db, log } = scripted({ memberships: ["ws_a"], ...options });
      await expect(captureSelfContextFacts(db, actor)).rejects.toMatchObject({ code: "CURRENT_ACTOR_AUTHORITY_REQUIRED" });
      expect(log).toHaveLength(1);
    });
  it("membership revoked between two reads disappears from the next answer (nothing cached, nothing stale)", async () => {
    const first = await captureSelfContextFacts(scripted({ memberships: ["ws_a", "ws_b"] }).db, actor);
    const second = await captureSelfContextFacts(scripted({ memberships: ["ws_a"] }).db, actor);
    expect(resolveDefaultWorkspace(first.memberships).state).toBe("AMBIGUOUS");
    expect(resolveDefaultWorkspace(second.memberships)).toMatchObject({ state: "RESOLVED", workspace_id: "ws_a" });
    expect(second.memberships.map(x => x.workspace_id)).not.toContain("ws_b");
  });
  it("a member with no workspace gets a typed absence, never another workspace", async () => {
    const out = await captureSelfContextFacts(scripted({ memberships: [] }).db, actor);
    expect(out.memberships).toEqual([]);
  });
  it("more than the bound is reported without reading a single policy or grant", async () => {
    const ids = Array.from({ length: MAX_SELF_CONTEXT_WORKSPACES + 5 }, (_, i) => "ws" + String(i).padStart(2, "0"));
    const { db, log } = scripted({ memberships: ids });
    const out = await captureSelfContextFacts(db, actor);
    expect(out.memberships).toHaveLength(MAX_SELF_CONTEXT_WORKSPACES + 1);
    expect(log.some(entry => /portal_access_policy_state|portal_access_grants_v2/.test(entry.sql))).toBe(false);
    expect(projectSelfContext(out, () => NOW).default_workspace).toEqual({ state: "UNAVAILABLE", reason_class: "TOO_MANY_MEMBERSHIPS" });
  });
  it("a current grant record needs a REVIEWED policy under the Portal owner, the caller's own unrevoked in-interval ALLOW of the current revision", async () => {
    const ws = "ws_shared";
    const run = async (g: ScopedAccessGrant[], policy: Record<string, unknown> | null = policyOf(ws), anchor: string | null = OWNER) =>
      (await captureSelfContextFacts(scripted({ memberships: [ws], policies: policy ? { [ws]: policy } : {}, grants: { [ws]: g }, anchor }).db, actor))
        .memberships[0].has_current_grant_record;
    expect(await run([own(ws)])).toBe(true);
    expect(await run([own(ws, { action: "capital.top_up" })])).toBe(true);
    expect(await run([])).toBe(false);
    expect(await run([own(ws, { revoked_at_ms: NOW - 1 })])).toBe(false);
    expect(await run([own(ws, { valid_until_ms: NOW })])).toBe(false);
    expect(await run([own(ws, { valid_from_ms: NOW + 1 })])).toBe(false);
    expect(await run([own(ws, { effect: "DENY" })])).toBe(false);
    expect(await run([own(ws, { subject_user_id: OWNER })])).toBe(false); // someone else's grant is invisible
    expect(await run([own(ws, { policy_revision: "TEST_ONLY:policy:old" })])).toBe(false);
    expect(await run([own(ws)], null)).toBe(false); // no policy installed
    expect(await run([own(ws)], policyOf(ws, { state: "PENDING" }))).toBe(false);
    expect(await run([own(ws)], policyOf(ws, { workspace_id: "ws_other" }))).toBe(false);
    expect(await run([own(ws)], policyOf(ws, { protected_owner_user_id: "usr_NOT_THE_ANCHOR" }))).toBe(false);
    expect(await run([own(ws)], policyOf(ws), null)).toBe(false); // owner anchor unreadable/unclaimed
  });
  it("a manager-domain grant record counts like any other own record", async () => {
    const ws = "ws_domain";
    const managerGrant = { schema_version: "portal.manager-domain-grant.v1", grant_id: "TEST_ONLY:domain", workspace_id: ws, subject_user_id: U, issued_by: OWNER,
      parent_grant_id: null, revision: "TEST_ONLY:r1", policy_revision: "TEST_ONLY:policy:" + ws, action: "business.read_all", effect: "ALLOW", environment: "paper",
      domain: { profile_id: "TEST_ONLY:profile", catalogue_sha256: "a".repeat(64), profile_sha256: "b".repeat(64), field_policy_sha256: "c".repeat(64) },
      field_policy_ref: "TEST_ONLY:fields", valid_from_ms: NOW - 1, valid_until_ms: NOW + 1000, revoked_at_ms: null };
    const read = async (fact: unknown) => (await captureSelfContextFacts(scripted({ memberships: [ws], policies: { [ws]: policyOf(ws) }, grants: { [ws]: [fact] } }).db, actor))
      .memberships[0].has_current_grant_record;
    expect(await read(managerGrant)).toBe(true);
    expect(await read({ ...managerGrant, revoked_at_ms: NOW - 1 })).toBe(false);
    expect(await read({ ...managerGrant, subject_user_id: OWNER })).toBe(false);
  });
  it("an unreadable stored grant or policy downgrades only that candidate to MEMBER_ONLY; a database failure is never swallowed", async () => {
    const ws = "ws_bad", good = "ws_good";
    const corrupt = await captureSelfContextFacts(scripted({ memberships: [good, ws], policies: { [ws]: policyOf(ws), [good]: policyOf(good) },
      grants: { [ws]: [{ not: "a grant" }], [good]: [own(good)] } }).db, actor);
    expect(corrupt.memberships).toEqual([{ workspace_id: good, has_current_grant_record: true }, { workspace_id: ws, has_current_grant_record: false }]);
    await expect(captureSelfContextFacts(scripted({ memberships: [ws], failPolicyFor: ws }).db, actor)).rejects.toThrow("connection terminated");
  });
  it("a grant graph above the stored-graph bound is surfaced, not turned into a silent 'no'", async () => {
    const ws = "ws_huge";
    const grants = Array.from({ length: 10001 }, (_, i) => own(ws, { grant_id: "g" + i }));
    await expect(captureSelfContextFacts(scripted({ memberships: [ws], policies: { [ws]: policyOf(ws) }, grants: { [ws]: grants } }).db, actor))
      .rejects.toMatchObject({ code: "ACCESS_SCOPE_LIMIT_EXCEEDED", status: 503 });
  });
});

describe("ExecutionAccessService.selfContext / controller", () => {
  const service = (db: unknown) => {
    const client = { query: (db as { query: unknown }).query, release: vi.fn() };
    return new ExecutionAccessService({ connect: async () => client } as never, {} as never, undefined, true);
  };
  it("runs in one read-only repeatable-read snapshot and returns the projected context; an ended session is a 403", async () => {
    const { db, log } = scripted({ memberships: ["ws_a"] });
    const out = await service(db).selfContext(actor);
    expect(out.default_workspace).toEqual({ state: "RESOLVED", workspace_id: "ws_a", rule: "SOLE_MEMBERSHIP" });
    expect(log.map(entry => entry.sql).slice(0, 3)).toEqual(["BEGIN", "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY", "SET LOCAL statement_timeout='5000ms'"]);
    expect(log.at(-1)!.sql).toBe("COMMIT");
    await expect(service(scripted({ memberships: ["ws_a"], lease: NOW - 1 }).db).selfContext(actor)).rejects.toMatchObject({ code: "CURRENT_ACTOR_AUTHORITY_REQUIRED" });
    await expect(service(scripted({ session: false }).db).selfContext(actor)).rejects.toMatchObject({ code: "CURRENT_ACTOR_AUTHORITY_REQUIRED" });
  });
  const controller = (svc: unknown) => new ExecutionAccessController(svc as never, {} as never);
  const request = { portalUser: { userId: U, sessionVersion: 7 }, portalSession: { sessionId: "sess-1", csrfSecretHash: "x" } } as never;
  it("takes no query at all (the workspace is an output; there is nothing to spoof) and always uses the authenticated session as actor", async () => {
    const selfContext = vi.fn(async () => ({ ok: true }));
    const c = controller({ selfContext });
    for (const query of [{ workspace_id: "ws_x" }, { environment: "paper" }, { user_id: "usr_x" }, { as_of_ms: "1" }, { x: "" }])
      await expect(c.selfContext(request, query), JSON.stringify(query)).rejects.toMatchObject({ code: "ACCESS_INPUT_INVALID" });
    expect(selfContext).not.toHaveBeenCalled();
    await c.selfContext(request, {});
    expect(selfContext).toHaveBeenCalledWith({ user_id: U, session_id: "sess-1", session_generation: 7 });
  });
  it("a typed refusal keeps its status through the controller; the route is private/no-store and sits under the same session guard as the other own reads", async () => {
    const c = controller({ selfContext: async () => { throw new AccessPolicyError("CURRENT_ACTOR_AUTHORITY_REQUIRED", 403); } });
    await expect(c.selfContext(request, {})).rejects.toMatchObject({ code: "CURRENT_ACTOR_AUTHORITY_REQUIRED", status: 403 });
    const headers = Reflect.getMetadata("__headers__", ExecutionAccessController.prototype.selfContext) as Array<{ name: string; value: string }>;
    expect(headers).toContainEqual({ name: "Cache-Control", value: "private, no-store" });
    expect(Reflect.getMetadata("path", ExecutionAccessController.prototype.selfContext)).toBe("/self-context");
    expect(Reflect.getMetadata("path", ExecutionAccessController)).toBe("/api/admin/profile-access/v2");
    expect(Reflect.getMetadata("__guards__", ExecutionAccessController)).toHaveLength(1);
  });
});

describe("a navigation fact never opens a mutation; an uncommissioned family stays locked", () => {
  it("even a member with every read, binding and capital grant gets menu facts only: no command/family/step-up readiness, no account-management token", () => {
    const gs = [grant("TEST_ONLY:p", { action: "portfolio.read" }), grant("TEST_ONLY:a", { action: "account.read" }),
      grant("TEST_ONLY:b", { action: "binding.read" }), grant("TEST_ONLY:c", { action: "capital.top_up" })];
    const { context } = fixture(gs);
    const nav = projectNavigation(context, { workspace_id: WS, environment: "paper" }, undefined);
    expect(nav.features.some(feature => feature.state === "ENTERABLE")).toBe(true);
    for (const feature of nav.features) expect(feature).toMatchObject({ family_check: "NOT_CHECKED", source_readiness: "NOT_CHECKED",
      field_readiness: "NOT_CHECKED", command_readiness: "NOT_CHECKED" });
    expect(JSON.stringify(nav)).not.toMatch(/accounts\.manage|manage|rotate|REVISE_BINDING/i);
    // the legacy nav's self entry stays unrouted: the routed self entry lives only in self-context
    expect(nav.self_entry.route).toBeNull();
  });
  it("there is no eligibility row for credential rotation: the action vocabulary has no account-management mutation to ask about", () => {
    const { context } = fixture([grant("TEST_ONLY:b", { action: "binding.read" })]);
    const row = projectEligibility(context, { workspace_id: WS, environment: "paper", resource: { kind: "BINDING", id: "binding_TEST_ONLY" }, actions: ["binding.read"] });
    expect(row.actions[0]).toMatchObject({ command_readiness: "NOT_CHECKED", step_up_required: false, family_check: "BUSINESS_READ_SCOPE" });
    expect(selfContextResult.safeParse({ ...projectSelfContext(facts([m(WS, true)]), () => NOW), account_operations: [] }).success).toBe(false);
  });
});
