/** SOURCE_ONLY security tests: actual scope mint/evaluator and CurrentView
 * authority, explicit TEST_ONLY DB/source/physical-egress doubles. These prove
 * held-ticket and app fences, NOT PostgreSQL, Edge, native custody or connected
 * acceptance. The native provider's own suite owns actual terminal/ACK proof. */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import type { ServerResponse } from "node:http";
import type { AuthService } from "../src/auth/auth.service";
import type { ExecutionAccessService } from "../src/execution-v2/access.service";
import { accessDigest, type AccessEvaluationContext } from "../src/execution-v2/access-policy";
import { CurrentViewAuthority, type CurrentViewOperation, type CurrentViewSelection } from "../src/execution-v2/current-view-authority";
import { ExecutionReadScopes, type HeldNativeReadScopes, type ReadScopePrincipal } from "../src/execution-v2/read-scope";
import { BUSINESS_READ_FIELDS } from "../src/execution-v2/read-fields";
import { productReadFixture, OWN, PRIVATE } from "./elp2-product-read.fixture";

const NOW = 1_800_000_000_000;
type CompositionArgs = Parameters<ExecutionAccessService["deliverNativeCurrentComposition"]>;

function fixture() {
  const base = productReadFixture({ full: true, fields: [...BUSINESS_READ_FIELDS] });
  let now = NOW, present = true;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  const principal: ReadScopePrincipal = structuredClone(base.principal);
  const snapshot = (): AccessEvaluationContext => {
    const relations = structuredClone(base.context.relationsFor(principal.user.userId));
    return { ...base.context, policy: structuredClone(base.context.policy), grants: structuredClone(base.context.grants),
      active_principals: new Set(base.context.active_principals), relationsFor: () => structuredClone(relations),
      now_ms: now, actor_role: principal.user.role, actor_current: present,
      actor_lease_until_ms: principal.session.idleExpiresAt.valueOf(),
      authority_fingerprint: accessDigest({ user: principal.user.userId, role: principal.user.role,
        generation: principal.session.sessionVersion, policy: base.context.policy, grants: base.context.grants, present }) };
  };
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    if (sql.includes("AS exact_session_id")) {
      const valid = present && values?.[0] === principal.user.userId && values?.[1] === principal.session.sessionId &&
        values?.[2] === principal.session.sessionVersion && values?.[3] === principal.workspaceId &&
        principal.session.state === "ACTIVE" && principal.user.status === "ACTIVE";
      return { rows: valid ? [{ user_id: principal.user.userId, username: principal.user.username,
        display_name: principal.user.displayName, role: principal.user.role, status: principal.user.status,
        must_change_password: principal.user.mustChangePassword, failed_login_count: 0, locked_until: null,
        session_version: principal.user.sessionVersion, created_at: principal.user.createdAt, updated_at: principal.user.updatedAt,
        disabled_at: principal.user.disabledAt, account_revision: principal.user.accountRevision, archived_at: principal.user.archivedAt,
        exact_session_id: principal.session.sessionId, exact_session_state: principal.session.state,
        exact_session_version: principal.session.sessionVersion, authentication_time: principal.session.authenticationTime,
        idle_expires_at: principal.session.idleExpiresAt, absolute_expires_at: principal.session.absoluteExpiresAt }] : [] };
    }
    return { rows: present ? [{ role: principal.user.role, session_version: principal.session.sessionVersion,
      policy: base.context.policy, policy_revision: base.context.policy!.revision, policy_seen: true,
      workspace_exists: true, member: true, owner: false, retained: [] }] : [] };
  });
  const pool = { query } as unknown as Pool;
  const access = Object.assign(base.access, { hasNativeCurrentRelations: () => true,
    readContext: vi.fn(async () => snapshot()), confirmReadContext: vi.fn(async () => snapshot()) });
  const scopes = new ExecutionReadScopes(pool, access as unknown as ExecutionAccessService, base.config);
  const authority = new CurrentViewAuthority({ pool } as Pick<AuthService, "pool">, scopes,
    { now: () => now, ttl_ms: 30_000 });
  const dataset = { dataset_id: "TEST_ONLY-held-native-dataset", source_revision: "TEST_ONLY-source-r1",
    projection_generation: "TEST_ONLY-generation", catalogue_revision: "TEST_ONLY-catalogue", window: null };
  const profileId = base.config.EXECUTION_EDGE_PAPER_PROFILE_ID;
  if (!profileId) throw new Error("TEST_ONLY_PAPER_PROFILE_REQUIRED");
  const selection: CurrentViewSelection = { resource_ref: "TEST_ONLY.account-current", binding: {
    environment: "paper", profileId }, read_requirement: {
    action: "business.read_all", resource: { kind: "ACCOUNT", id: OWN.account_id }, dataset,
    requireWholePopulation: true }, fields: ["account_id", "equity"] };
  const sourceSelection: CurrentViewSelection = { ...structuredClone(selection), resource_ref: "TEST_ONLY.source-pin",
    read_requirement: { ...structuredClone(selection.read_requirement), resource: { kind: "ACCOUNT", id: PRIVATE.account_id } } };
  const sent: Buffer[] = [], order: string[] = [];
  let transform = (contexts: readonly AccessEvaluationContext[]) => contexts;
  const composition = vi.fn(async (...args: CompositionArgs) => {
    const [_actor, _workspace, purposes, _scopeDigest, _response, build, assertAllowed, validation] = args;
    // Synthetic held source cuts. A private reverse callback completing here
    // is not source ENTER, SERVED or a browser delivery.
    const contexts = transform(purposes.map(() => snapshot()));
    order.push("PRIVATE_BUILD");
    const body = await build(contexts);
    order.push("SOURCE_ENTER_DOUBLE"); await validation?.afterEnter?.();
    assertAllowed(purposes.map(() => snapshot()));
    order.push("FINAL_CORE_DOUBLE"); validation?.beforeDispatch?.();
    sent.push(body); order.push("PHYSICAL_SEND_DOUBLE");
  });
  Object.assign(access, { deliverNativeCurrentComposition: composition });
  const request = (context: { original_context: string }, chosen = selection, operation: CurrentViewOperation = "CURRENT") => ({
    original_context: context.original_context, workload_id: "TEST_ONLY-workload", operation, resource_ref: chosen.resource_ref });
  const prepare = (chosen = selection) => authority.prepareNativeCurrent(principal, chosen);
  return { ...base, principal, query, pool, access, scopes, authority, selection, sourceSelection, sent, order, composition,
    request, prepare, setNow: (value: number) => { now = value; }, removeIdentity: () => { present = false; },
    revokeGrant: () => { base.context.grants[0].revoked_at_ms = now - 1; },
    transform: (next: typeof transform) => { transform = next; } };
}

afterEach(() => vi.restoreAllMocks());

describe("CurrentView held native query capability — explicit TEST_ONLY port", () => {
  it("reuses the identical genuine scope without another observe/publication/authorize and sends only after private build", async () => {
    const f = fixture(), original = await f.prepare(), authorize = vi.spyOn(f.scopes, "authorize");
    const observations = f.access.readContext.mock.calls.length, publications = f.access.readPublication.mock.calls.length;
    let ticketSeen: HeldNativeReadScopes | undefined, contextSeen: string | undefined;
    await f.scopes.deliverNativeTogether([original], {} as ServerResponse, async ticket => {
      ticketSeen = ticket;
      expect(await f.scopes.heldNativeScope(ticket, f.principal, f.selection.binding, f.selection.read_requirement)).toBe(original);
      expect(f.sent).toHaveLength(0);
      return f.authority.withOriginalContext(f.principal, "TEST_ONLY-workload", f.selection, "CURRENT", async registered => {
        contextSeen = registered.original_context;
        const input = f.request(registered), decision = await f.authority.resolve(input);
        const bytes = await f.authority.deliver({ ...input, decision_digest: decision.decision_digest }, async scope => {
          expect(scope).toBe(original); expect(f.sent).toHaveLength(0);
          return Buffer.from('{"TEST_ONLY":"private-until-native-egress"}');
        });
        expect(decision.fields).toEqual(f.selection.fields);
        expect(JSON.stringify(decision)).not.toContain(f.principal.session.sessionId);
        return bytes;
      }, ticket);
    });
    expect(f.access.readContext).toHaveBeenCalledTimes(observations);
    expect(f.access.readPublication).toHaveBeenCalledTimes(publications);
    expect(authorize).not.toHaveBeenCalled();
    expect(f.access.confirmReadContext).toHaveBeenCalled();
    expect(f.sent).toHaveLength(1);
    expect(f.order).toEqual(["PRIVATE_BUILD", "SOURCE_ENTER_DOUBLE", "FINAL_CORE_DOUBLE", "PHYSICAL_SEND_DOUBLE"]);
    expect(() => f.scopes.assertHeldNativeScopes(ticketSeen!)).toThrowError();
    await expect(f.authority.resolve(f.request({ original_context: contextSeen! }))).rejects.toMatchObject({ code: "CURRENT_VIEW_CONTEXT_REQUIRED" });
  });

  it("retains target ACCOUNT and independent source-pin requirements instead of borrowing the first scope", async () => {
    const f = fixture(), target = await f.prepare(), pin = await f.prepare(f.sourceSelection);
    await f.scopes.deliverNativeTogether([target, pin], {} as ServerResponse, async ticket => {
      expect(await f.scopes.heldNativeScope(ticket, f.principal, f.selection.binding, f.selection.read_requirement)).toBe(target);
      expect(await f.scopes.heldNativeScope(ticket, f.principal, f.sourceSelection.binding, f.sourceSelection.read_requirement)).toBe(pin);
      const changed = structuredClone(f.selection.read_requirement); changed.resource.id = "TEST_ONLY-not-held-account";
      await expect(f.scopes.heldNativeScope(ticket, f.principal, f.selection.binding, changed))
        .rejects.toMatchObject({ code: "EXECUTION_READ_SCOPE_REQUIRED" });
      return Buffer.from("{}");
    });
    const purposes = f.composition.mock.calls[0][2];
    expect(purposes).toHaveLength(2);
    expect(purposes[0].resources).toContainEqual(f.selection.read_requirement.resource);
    expect(purposes[1].resources).toContainEqual(f.sourceSelection.read_requirement.resource);
  });

  it("cannot reconstruct a ticket by cast, object copy or JSON, or redeem it at another issuer", async () => {
    const f = fixture(), other = fixture(), scope = await f.prepare();
    await f.scopes.deliverNativeTogether([scope], {} as ServerResponse, async ticket => {
      for (const fake of [{}, { ...ticket }, JSON.parse(JSON.stringify(ticket))])
        await expect(f.scopes.heldNativeScope(fake as HeldNativeReadScopes, f.principal, f.selection.binding, f.selection.read_requirement))
          .rejects.toMatchObject({ code: "EXECUTION_READ_SCOPE_REQUIRED" });
      await expect(other.scopes.heldNativeScope(ticket, f.principal, f.selection.binding, f.selection.read_requirement))
        .rejects.toMatchObject({ code: "EXECUTION_READ_SCOPE_REQUIRED" });
      return Buffer.from("{}");
    });
  });

  it.each(["success", "error"] as const)("kills the ticket at build exit on %s without using context release as source settlement", async outcome => {
    const f = fixture(), scope = await f.prepare(); let retained: HeldNativeReadScopes | undefined;
    const run = f.scopes.deliverNativeTogether([scope], {} as ServerResponse, async ticket => {
      retained = ticket; if (outcome === "error") throw new Error("TEST_ONLY-private-build-failed");
      return Buffer.from("{}");
    });
    if (outcome === "success") await expect(run).resolves.toBeUndefined(); else await expect(run).rejects.toThrow("TEST_ONLY-private-build-failed");
    await expect(f.scopes.heldNativeScope(retained!, f.principal, f.selection.binding, f.selection.read_requirement))
      .rejects.toMatchObject({ code: "EXECUTION_READ_SCOPE_REQUIRED" });
    expect(f.sent).toHaveLength(outcome === "success" ? 1 : 0);
  });

  it.each(["user", "role", "session", "generation", "workspace", "viewer", "authentication_time", "profile", "dataset", "action", "whole_population"] as const)
    ("rejects changing the held exact %s", async changed => {
      const f = fixture(), scope = await f.prepare();
      await f.scopes.deliverNativeTogether([scope], {} as ServerResponse, async ticket => {
        const principal = structuredClone(f.principal), binding = structuredClone(f.selection.binding), requirement = structuredClone(f.selection.read_requirement);
        if (changed === "user") { principal.user.userId = "TEST_ONLY-other"; principal.session.userId = principal.user.userId; }
        if (changed === "role") principal.user.role = "ADMIN";
        if (changed === "session") principal.session.sessionId = "TEST_ONLY-other-session";
        if (changed === "generation") { principal.user.sessionVersion++; principal.session.sessionVersion++; }
        if (changed === "workspace") principal.workspaceId = "TEST_ONLY-other-workspace";
        if (changed === "viewer") principal.viewerWorkspaceId = "TEST_ONLY-other-viewer";
        if (changed === "authentication_time") principal.session.authenticationTime = new Date(NOW - 1);
        if (changed === "profile") binding.profileId = "TEST_ONLY-other-profile";
        if (changed === "dataset") requirement.dataset.source_revision = "TEST_ONLY-other-revision";
        if (changed === "action") requirement.action = "account.read";
        if (changed === "whole_population") requirement.requireWholePopulation = false;
        await expect(f.scopes.heldNativeScope(ticket, principal, binding, requirement))
          .rejects.toMatchObject({ code: "EXECUTION_READ_SCOPE_REQUIRED" });
        return Buffer.from("{}");
      });
    });

  it.each(["HISTORY", "EXPORT", "STREAM", "REPLAY"] as const)("never converts held CURRENT authority into %s", async operation => {
    const f = fixture(), scope = await f.prepare();
    await f.scopes.deliverNativeTogether([scope], {} as ServerResponse, async ticket => {
      await expect(f.authority.register(f.principal, "TEST_ONLY-workload", f.selection, operation, ticket))
        .rejects.toMatchObject({ code: "CURRENT_VIEW_OPERATION_NOT_COMMISSIONED", status: 503 });
      return Buffer.from("{}");
    });
  });

  it("refuses non-Paper or historical requirements and unauthorized fields without querying the reverse source", async () => {
    const f = fixture(), scope = await f.prepare();
    await f.scopes.deliverNativeTogether([scope], {} as ServerResponse, async ticket => {
      for (const changed of [
        { ...structuredClone(f.selection), binding: { ...f.selection.binding, environment: "live" as const } },
        { ...structuredClone(f.selection), read_requirement: { ...f.selection.read_requirement,
          dataset: { ...f.selection.read_requirement.dataset, window: { from_ms: NOW - 1000, to_ms: NOW } } } },
      ]) await expect(f.authority.register(f.principal, "TEST_ONLY-workload", changed, "CURRENT", ticket))
        .rejects.toMatchObject({ code: "CURRENT_VIEW_OPERATION_NOT_COMMISSIONED", status: 503 });
      await expect(f.authority.register(f.principal, "TEST_ONLY-workload", { ...f.selection, fields: ["password"] }, "CURRENT", ticket))
        .rejects.toMatchObject({ code: "CURRENT_VIEW_BINDING_MISMATCH", status: 400 });
      return Buffer.from("{}");
    });
  });

  it("does not widen a genuine held scope's qualified researcher field mask", async () => {
    const f = fixture(), grant = f.context.grants[0];
    f.context.grants = [{ ...grant, action: "account.read",
      selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "ACCOUNT", ids: [OWN.account_id, PRIVATE.account_id] } },
      ...f.context.grants.slice(1)];
    f.context.policy!.researcher_fields.fields = ["account_id"];
    const selected: CurrentViewSelection = { ...f.selection, fields: ["account_id"], read_requirement: {
      ...f.selection.read_requirement, action: "account.read", requireWholePopulation: false } };
    const scope = await f.prepare(selected);
    await f.scopes.deliverNativeTogether([scope], {} as ServerResponse, async ticket => {
      await expect(f.authority.register(f.principal, "TEST_ONLY-workload", { ...selected, fields: ["account_id", "equity"] }, "CURRENT", ticket))
        .rejects.toMatchObject({ code: "CURRENT_VIEW_AUTHORITY_CHANGED", status: 409 });
      return Buffer.from("{}");
    });
  });

  it("revoked current human before context registration cannot receive private bytes", async () => {
    const f = fixture(), scope = await f.prepare();
    await expect(f.scopes.deliverNativeTogether([scope], {} as ServerResponse, async ticket => {
      f.removeIdentity();
      await f.authority.register(f.principal, "TEST_ONLY-workload", f.selection, "CURRENT", ticket);
      return Buffer.from("TEST_ONLY-never-send");
    })).rejects.toMatchObject({ code: "CURRENT_VIEW_IDENTITY_REQUIRED", status: 401 });
    expect(f.sent).toHaveLength(0);
  });

  it.each(["identity", "grant", "role"] as const)("rechecks %s after the last awaited reverse read, before returning its result", async changed => {
    const f = fixture(), scope = await f.prepare(); let original: string | undefined;
    await expect(f.scopes.deliverNativeTogether([scope], {} as ServerResponse, ticket =>
      f.authority.withOriginalContext(f.principal, "TEST_ONLY-workload", f.selection, "CURRENT", async context => {
        original = context.original_context;
        const input = f.request(context), decision = await f.authority.resolve(input);
        return f.authority.deliver({ ...input, decision_digest: decision.decision_digest }, async () => {
          await Promise.resolve();
          if (changed === "identity") f.removeIdentity();
          if (changed === "grant") f.revokeGrant();
          if (changed === "role") f.principal.user.role = "ADMIN";
          return Buffer.from("TEST_ONLY-never-send");
        });
      }, ticket))).rejects.toMatchObject({ code: changed === "identity" ? "CURRENT_VIEW_IDENTITY_REQUIRED" :
        changed === "role" ? "CURRENT_VIEW_AUTHORITY_CHANGED" : "EXECUTION_READ_ACCESS_CHANGED" });
    expect(f.sent).toHaveLength(0);
    expect(f.order).toEqual(["PRIVATE_BUILD"]);
    await expect(f.authority.resolve(f.request({ original_context: original! })))
      .rejects.toMatchObject({ code: "CURRENT_VIEW_CONTEXT_REQUIRED" });
  });

  it("current-human refusal outranks an upstream exception held across the await", async () => {
    const f = fixture(), scope = await f.prepare();
    await expect(f.scopes.deliverNativeTogether([scope], {} as ServerResponse, ticket =>
      f.authority.withOriginalContext(f.principal, "TEST_ONLY-workload", f.selection, "CURRENT", async context => {
        const input = f.request(context), decision = await f.authority.resolve(input);
        return f.authority.deliver({ ...input, decision_digest: decision.decision_digest }, async () => {
          f.removeIdentity(); throw new Error("TEST_ONLY-private-upstream-diagnostic");
        });
      }, ticket))).rejects.toMatchObject({ code: "CURRENT_VIEW_IDENTITY_REQUIRED", status: 401 });
    expect(f.sent).toHaveLength(0);
  });

  it.each(["grant", "session"] as const)("checks real current time, not the old held context clock, at the %s ceiling", async ceiling => {
    const f = fixture();
    if (ceiling === "grant") f.context.grants[0].valid_until_ms = NOW + 10;
    const scope = await f.prepare();
    await expect(f.scopes.deliverNativeTogether([scope], {} as ServerResponse, async ticket => {
      f.setNow(NOW + (ceiling === "grant" ? 10 : 60_000));
      await f.scopes.heldNativeScope(ticket, f.principal, f.selection.binding, f.selection.read_requirement);
      return Buffer.from("TEST_ONLY-never-send");
    })).rejects.toMatchObject({ code: "EXECUTION_READ_ACCESS_CHANGED", status: 409 });
    expect(f.sent).toHaveLength(0);
  });

  it("checks every genuine source cut before exposing even the provisional build ticket", async () => {
    const f = fixture(), a = await f.prepare(), b = await f.prepare(f.sourceSelection), build = vi.fn(async () => Buffer.from("{}"));
    f.transform(contexts => contexts.map((context, index) => index === 1 ? { ...context,
      authority_fingerprint: "TEST_ONLY-mismatched-later-cut" } : context));
    await expect(f.scopes.deliverNativeTogether([a, b], {} as ServerResponse, build))
      .rejects.toMatchObject({ code: "EXECUTION_READ_ACCESS_CHANGED", status: 409 });
    expect(build).not.toHaveBeenCalled(); expect(f.sent).toHaveLength(0);
  });
});
