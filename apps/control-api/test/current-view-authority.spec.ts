/** Source-only synthetic boundary tests. The scope mint/evaluator/composition
 * are REAL ExecutionReadScopes; Core rows and qualified-source responses are
 * explicitly TEST_ONLY in-process doubles, not PG/native qualification. */
import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import type { AuthService } from "../src/auth/auth.service";
import type { ControlApiConfig } from "../src/config";
import type { AuthSession, PortalUser } from "../src/domain";
import { accessDigest, type AccessEvaluationContext } from "../src/execution-v2/access-policy";
import type { AccessAction, AccessResource, ReviewedAccessPolicy, ScopedAccessGrant } from "../src/execution-v2/access.contract";
import type { ExecutionAccessService } from "../src/execution-v2/access.service";
import { CurrentViewAuthority, type CurrentViewOperation, type CurrentViewSelection } from "../src/execution-v2/current-view-authority";
import { ExecutionReadScopeError, ExecutionReadScopes, scopeReadPopulation, type ReadScopePrincipal } from "../src/execution-v2/read-scope";
import type { ExecutionReadPublication } from "../src/execution-v2/read-publication";

function fixture(options: { capacity?: number; ttl?: number; tuples?: number } = {}) {
  const initial = Date.now();
  let now = initial, identityPresent = true, sourceFailure = false, expired = false, legacy = false;
  let beforeIdentity: (() => void) | undefined;
  const id = (label: string) => `TEST_ONLY:current-view:${label}`;
  const workspace = id("workspace"), profile = id("paper-profile"), owner = id("owner");
  const user: PortalUser = { userId: id("actor"), username: "TEST_ONLY-actor", displayName: "TEST_ONLY Actor", role: "USER",
    status: "ACTIVE", mustChangePassword: false, failedLoginCount: 0, lockedUntil: null,
    sessionVersion: 7, createdAt: new Date(initial - 1000), updatedAt: new Date(initial - 1000),
    disabledAt: null, accountRevision: 1, archivedAt: null };
  const session: AuthSession = { userId: user.userId, sessionId: id("session"), sessionVersion: 7, state: "ACTIVE",
    authenticationTime: new Date(initial - 1000), idleExpiresAt: new Date(initial + 3_600_000), absoluteExpiresAt: new Date(initial + 3_600_000) };
  const principal: ReadScopePrincipal = { user, session, workspaceId: workspace, viewerWorkspaceId: workspace };
  const root: AccessResource = { kind: "ROOT", id: id("root") };
  const tuples = Array.from({ length: options.tuples ?? 2 }, (_, index) => ({ alpha_id: id(`alpha-${index}`), alpha_version_id: id(`av-${index}`),
    portfolio_id: id(`portfolio-${index}`), deployment_id: id(`deployment-${index}`), account_id: id(`account-${index}`) }));
  const resources: AccessResource[] = [root, ...tuples.flatMap(tuple => [
    { kind: "ALPHA" as const, id: tuple.alpha_id }, { kind: "ALPHA_VERSION" as const, id: tuple.alpha_version_id },
    { kind: "PORTFOLIO" as const, id: tuple.portfolio_id }, { kind: "DEPLOYMENT" as const, id: tuple.deployment_id },
    { kind: "ACCOUNT" as const, id: tuple.account_id }])];
  const dataset = { dataset_id: id("selected-dataset"), source_revision: id("source-r1"), projection_generation: id("generation-1"),
    catalogue_revision: id("catalogue-1"), window: null };
  const selection: CurrentViewSelection = { resource_ref: id("resource-reference"), binding: { environment: "paper", profileId: profile },
    read_requirement: { action: "business.read_all", resource: root, dataset }, fields: ["alpha_id", "portfolio_id", "equity"] };
  const policy: ReviewedAccessPolicy = { workspace_id: workspace, revision: id("policy-r1"), artifact_digest: accessDigest(id("policy")),
    approval_ref: id("NOT_OWNER_APPROVAL"), qualification: "TEST_ONLY", state: "REVIEWED", protected_owner_user_id: owner,
    researcher_fields: { state: "QUALIFIED", policy_ref: id("field-policy"), fields: ["alpha_id", "portfolio_id", "equity"] } };
  const membership = { revision: id("membership-r1"), receipt_id: id("receipt-r1"), mapping_revision: id("mapping-r1") };
  const grants: ScopedAccessGrant[] = [];
  function addGrant(action: AccessAction) {
    grants.push({ grant_id: id(`grant:${action}`), action, workspace_id: workspace, subject_user_id: user.userId, issued_by: owner,
      effect: "ALLOW", selector: { kind: "ROOT_SCOPE", root_id: root.id }, environments: ["paper"],
      valid_from_ms: initial - 1000, valid_until_ms: initial + 3_600_000, delegable_actions: [], parent_grant_id: null,
      revision: id("grant-r1"), policy_revision: policy.revision, revoked_at_ms: null, requires_ts_acceptance: true,
      ts_receipt: { ...membership, membership_revision: membership.revision, effective_at_ms: initial - 1000, expires_at_ms: initial + 3_600_000 },
      field_policy_ref: null });
  }
  addGrant("business.read_all");
  const publication: ExecutionReadPublication = { workspace_id: workspace, environment: "paper", profile_id: profile,
    qualification: "TEST_ONLY", publication_revision: id("publication-r1"), binding: dataset,
    population_coverage: "COMPLETE_FOR_DATASET_WINDOW", provenance_ref: id("NOT_NATIVE_SOURCE_QUALIFICATION"), resources,
    tuples, current_linkage: { qualification: "TEST_ONLY", revision: id("current-linkage"), provenance_ref: id("NOT_NATIVE_LINKAGE"),
      pairs: tuples.map(tuple => ({ alpha_id: tuple.alpha_id, portfolio_id: tuple.portfolio_id })) } };
  const relations = () => ({ qualified: true, revision: membership.revision, own_alpha_ids: [], member_portfolio_ids: [],
    roots: { [root.id]: resources }, membership });
  const context = (): AccessEvaluationContext => ({ principal_id: user.userId, workspace_id: workspace, now_ms: now,
    actor_current: identityPresent && !expired, actor_role: user.role, actor_lease_until_ms: session.absoluteExpiresAt.valueOf(),
    authority_fingerprint: accessDigest({ user: user.userId, role: user.role, generation: user.sessionVersion, policy, grants }),
    actor_member: true, policy, grants, active_principals: new Set([user.userId, owner]), relationsFor: relations, allow_test_only: true });
  const query = vi.fn(async (sql: string) => {
    beforeIdentity?.();
    if (sql.includes("AS exact_session_id")) {
      if (!identityPresent) return { rows: [], rowCount: 0 };
      return { rows: [{ user_id: user.userId, username: user.username, display_name: user.displayName, role: user.role,
        status: user.status, must_change_password: user.mustChangePassword, failed_login_count: 0, locked_until: null,
        session_version: user.sessionVersion, created_at: user.createdAt, updated_at: user.updatedAt, disabled_at: user.disabledAt,
        account_revision: user.accountRevision, archived_at: user.archivedAt, exact_session_id: session.sessionId,
        exact_session_state: session.state, exact_session_version: session.sessionVersion,
        authentication_time: session.authenticationTime, idle_expires_at: session.idleExpiresAt, absolute_expires_at: session.absoluteExpiresAt }], rowCount: 1 };
    }
    if (!identityPresent || expired) return { rows: [], rowCount: 0 };
    return { rows: [{ role: user.role, session_version: user.sessionVersion, policy: legacy ? null : policy,
      policy_revision: legacy ? null : policy.revision, policy_seen: !legacy, workspace_exists: true, member: true, owner: false,
      retained: [] }], rowCount: 1 };
  });
  const pool = { query } as unknown as Pool;
  const access = { hasNativeCurrentRelations: () => false,
    readContext: vi.fn(async () => context()), confirmReadContext: vi.fn(async () => context()),
    readPublication: vi.fn(async () => {
      if (sourceFailure) throw new Error("TEST_ONLY private source detail must not escape");
      return structuredClone(publication);
    }),
    realtimeDeliveryBoundary: vi.fn(async (_actor: unknown, _workspace: unknown, _context: unknown, _resource: unknown,
      _environment: unknown, write: () => unknown) => write()) } as unknown as ExecutionAccessService;
  const scopes = new ExecutionReadScopes(pool, access, {} as ControlApiConfig);
  const service = new CurrentViewAuthority({ pool } as Pick<AuthService, "pool">, scopes,
    { now: () => now, ttl_ms: options.ttl, maximum_contexts: options.capacity });
  const request = (registered: { original_context: string }, operation: CurrentViewOperation = "CURRENT") => ({
    original_context: registered.original_context, workload_id: id("workload"), operation, resource_ref: selection.resource_ref });
  const register = (operation: CurrentViewOperation = "CURRENT", chosen = selection) =>
    service.register(principal, id("workload"), chosen, operation);
  return { service, register, request, scopes, access, query, principal, publication, policy, grants, addGrant, selection, tuples,
    setNow: (value: number) => { now = value; }, initial,
    removeIdentity: () => { identityPresent = false; }, failSource: () => { sourceFailure = true; },
    setLegacy: () => { legacy = true; }, onIdentity: (run: () => void) => { beforeIdentity = run; } };
}

describe("Core current-view authority — synthetic boundary tests over real scope evaluator", () => {
  it("mints original custody only on Core, re-resolves actual actor and returns exact correlated tuples", async () => {
    const f = fixture(), registered = await f.register(), input = f.request(registered);
    expect(registered.original_context).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const before = f.query.mock.calls.length;
    const result = await f.service.resolve(input);
    expect(f.query.mock.calls.length).toBeGreaterThan(before);
    expect(result.allowed_tuples).toEqual(f.tuples);
    expect(result.allowed_tuples).not.toContainEqual({ ...f.tuples[0], portfolio_id: f.tuples[1].portfolio_id });
    expect(result.fields).toEqual(f.selection.fields);
    expect(result).not.toHaveProperty("original_context");
    expect(JSON.stringify(result)).not.toContain(f.principal.session.sessionId);
    expect(result.policy_revision).toBe(f.policy.revision);
    expect(result.schema_version).toBe("portal.execution.current-view-decision.v1");
    expect(result.whole_population).toBe(true);
    expect(await f.service.recheck({ ...input, decision_digest: result.decision_digest })).toEqual(result);
  });

  it.each(["workload_id", "operation", "resource_ref"] as const)("refuses changing the original %s", async key => {
    const f = fixture(), registered = await f.register(), input = f.request(registered);
    const changed = { ...input, [key]: key === "operation" ? "STREAM" : "TEST_ONLY:other" };
    await expect(f.service.resolve(changed)).rejects.toMatchObject({ code: "CURRENT_VIEW_BINDING_MISMATCH", status: 409 });
  });

  it("cannot use an opaque context from another process/service or after explicit cleanup", async () => {
    const a = fixture(), b = fixture(), registered = await a.register();
    await expect(b.service.resolve(a.request(registered))).rejects.toMatchObject({ code: "CURRENT_VIEW_CONTEXT_REQUIRED" });
    a.service.release(registered.original_context);
    await expect(a.service.resolve(a.request(registered))).rejects.toMatchObject({ code: "CURRENT_VIEW_CONTEXT_REQUIRED" });
  });

  it.each(["success", "error", "abort"] as const)("server composition releases the same original context on %s", async outcome => {
    const f = fixture();
    let originalContext: string | undefined;
    const composed = f.service.withOriginalContext(f.principal, f.request({ original_context: "unused" }).workload_id,
      f.selection, "CURRENT", async context => {
        originalContext = context.original_context;
        expect((await f.service.resolve(f.request(context))).context_digest).toBe(context.context_digest);
        if (outcome === "error") throw new Error("TEST_ONLY:upstream-refused");
        if (outcome === "abort") throw new DOMException("TEST_ONLY:cancelled", "AbortError");
        return "TEST_ONLY:completed";
      });
    if (outcome === "success") await expect(composed).resolves.toBe("TEST_ONLY:completed");
    else await expect(composed).rejects.toBeDefined();
    expect(originalContext).toBeDefined();
    await expect(f.service.resolve(f.request({ original_context: originalContext! })))
      .rejects.toMatchObject({ code: "CURRENT_VIEW_CONTEXT_REQUIRED", status: 403 });
  });

  it.each(["HISTORY", "REPLAY"] as const)("does not infer %s from CURRENT, even with broad business.read_all", async operation => {
    const f = fixture();
    f.addGrant("stream.subscribe");
    await expect(f.register(operation)).rejects.toMatchObject({ code: "CURRENT_VIEW_OPERATION_NOT_COMMISSIONED", status: 503 });
  });

  it.each(["EXPORT", "STREAM"] as const)("requires independent %s authority", async operation => {
    const f = fixture();
    await expect(f.register(operation)).rejects.toBeInstanceOf(ExecutionReadScopeError);
    f.addGrant(operation === "EXPORT" ? "report.export" : "stream.subscribe");
    const registered = await f.register(operation), decision = await f.service.resolve(f.request(registered, operation));
    expect(decision.operation).toBe(operation);
    await expect(f.service.resolve(f.request(registered))).rejects.toMatchObject({ code: "CURRENT_VIEW_BINDING_MISMATCH" });
  });

  it("evaluates an explicit TEST_ONLY historical purpose without treating CURRENT as its grant", async () => {
    const f = fixture(), selected = structuredClone(f.selection);
    // Synthetic catalogue mapping only: NOT a claim audit.read universally
    // means financial history, and NOT a current native source commission.
    selected.read_requirement.dataset.window = { from_ms: f.initial - 86_400_000, to_ms: f.initial };
    f.publication.binding = structuredClone(selected.read_requirement.dataset);
    const chosen: CurrentViewSelection = { ...selected, operation_requirements: { HISTORY: { action: "audit.read", resource: selected.read_requirement.resource,
      dataset: structuredClone(selected.read_requirement.dataset) } } };
    await expect(f.register("HISTORY", chosen)).rejects.toBeInstanceOf(ExecutionReadScopeError);
    f.addGrant("audit.read");
    const registered = await f.register("HISTORY", chosen);
    expect((await f.service.resolve(f.request(registered, "HISTORY"))).operation).toBe("HISTORY");
  });

  it("requires both explicitly commissioned REPLAY purpose and independent STREAM", async () => {
    const f = fixture(), selected = structuredClone(f.selection);
    selected.read_requirement.dataset.window = { from_ms: f.initial - 86_400_000, to_ms: f.initial };
    f.publication.binding = structuredClone(selected.read_requirement.dataset);
    const chosen: CurrentViewSelection = { ...selected, operation_requirements: { REPLAY: { action: "audit.read", resource: selected.read_requirement.resource,
      dataset: structuredClone(selected.read_requirement.dataset) } } };
    f.addGrant("audit.read");
    await expect(f.register("REPLAY", chosen)).rejects.toBeInstanceOf(ExecutionReadScopeError);
    f.addGrant("stream.subscribe");
    const registered = await f.register("REPLAY", chosen);
    expect((await f.service.resolve(f.request(registered, "REPLAY"))).operation).toBe("REPLAY");
  });

  it("will not accept a copied CURRENT business requirement as a historical operation", async () => {
    const f = fixture(), selected: CurrentViewSelection = { ...structuredClone(f.selection),
      operation_requirements: { HISTORY: structuredClone(f.selection.read_requirement) } };
    await expect(f.register("HISTORY", selected)).rejects.toMatchObject({ code: "CURRENT_VIEW_OPERATION_NOT_COMMISSIONED" });
  });

  it("does not issue a scope in legacy compatibility", async () => {
    const f = fixture(); f.setLegacy();
    await expect(f.register()).rejects.toMatchObject({ code: "CURRENT_VIEW_OPERATION_NOT_COMMISSIONED" });
  });

  it("bound context expiry is not extended by resolve/recheck", async () => {
    const f = fixture({ ttl: 250 }), registered = await f.register(), input = f.request(registered), first = await f.service.resolve(input);
    f.setNow(f.initial + 249);
    expect((await f.service.recheck({ ...input, decision_digest: first.decision_digest })).expires_at_ms).toBe(registered.expires_at_ms);
    f.setNow(registered.expires_at_ms);
    await expect(f.service.resolve(input)).rejects.toMatchObject({ code: "CURRENT_VIEW_CONTEXT_EXPIRED", status: 409 });
  });

  it("bounds in-flight custody and reuses capacity only after explicit release or expiry", async () => {
    const f = fixture({ capacity: 1 }), first = await f.register();
    await expect(f.register()).rejects.toMatchObject({ code: "CURRENT_VIEW_CAPACITY", status: 503 });
    f.service.release(first.original_context);
    expect((await f.register()).original_context).not.toBe(first.original_context);
  });

  it.each(["revoked", "generation", "disabled", "archived", "role"] as const)("rechecks %s before cache disclosure", async change => {
    const f = fixture(), registered = await f.register(), input = f.request(registered), decision = await f.service.resolve(input);
    if (change === "revoked") f.principal.session.state = "REVOKED";
    if (change === "generation") f.principal.user.sessionVersion++;
    if (change === "disabled") f.principal.user.status = "DISABLED";
    if (change === "archived") f.principal.user.archivedAt = new Date(f.initial);
    if (change === "role") f.principal.user.role = "ADMIN";
    const cache = vi.fn(async () => ({ private_value: "must not disclose" }));
    await expect(f.service.deliver({ ...input, decision_digest: decision.decision_digest }, cache)).rejects.toBeDefined();
    expect(cache).not.toHaveBeenCalled();
  });

  it("does not replace the original session with a fresh valid session", async () => {
    const f = fixture(), registered = await f.register();
    f.principal.session.sessionId = "TEST_ONLY:a-new-session-for-the-same-user";
    await expect(f.service.resolve(f.request(registered))).rejects.toMatchObject({ code: "CURRENT_VIEW_IDENTITY_REQUIRED", status: 401 });
  });

  it("does not resurrect a cached ALLOW after policy/field revision change", async () => {
    const f = fixture(), registered = await f.register(), input = f.request(registered), first = await f.service.resolve(input);
    f.policy.revision = "TEST_ONLY:new-policy";
    f.grants.forEach(grant => { grant.policy_revision = f.policy.revision; });
    await expect(f.service.recheck({ ...input, decision_digest: first.decision_digest })).rejects.toMatchObject({ code: "CURRENT_VIEW_AUTHORITY_CHANGED" });
  });

  it("refuses current source generation drift and source outages rather than returning previous allowance", async () => {
    const f = fixture(), registered = await f.register(), input = f.request(registered);
    f.publication.binding.projection_generation = "TEST_ONLY:generation-two";
    await expect(f.service.resolve(input)).rejects.toMatchObject({ code: "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED" });
    f.failSource();
    await expect(f.service.resolve(input)).rejects.toMatchObject({ code: "EXECUTION_READ_AUTHORITY_UNAVAILABLE", status: 503 });
  });

  it("fences cache-hit/I/O after work and never releases on mid-flight revoke", async () => {
    const f = fixture(), registered = await f.register(), input = f.request(registered), decision = await f.service.resolve(input);
    let observedRealScope = false;
    await expect(f.service.deliver({ ...input, decision_digest: decision.decision_digest }, async scope => {
      observedRealScope = scopeReadPopulation(scope).allowedTuples.length === 2;
      f.removeIdentity();
      return { secret: "held result" };
    })).rejects.toBeInstanceOf(ExecutionReadScopeError);
    expect(observedRealScope).toBe(true);
  });

  it("does not release an in-flight value after original custody is cleaned up", async () => {
    const f = fixture(), registered = await f.register(), input = f.request(registered), decision = await f.service.resolve(input);
    await expect(f.service.deliver({ ...input, decision_digest: decision.decision_digest }, async () => {
      f.service.release(registered.original_context);
      return { private_value: "must remain held" };
    })).rejects.toMatchObject({ code: "CURRENT_VIEW_CONTEXT_REQUIRED", status: 403 });
  });

  it("keeps independent STREAM and rechecks every actual synchronous frame", async () => {
    const f = fixture(); f.addGrant("stream.subscribe");
    const registered = await f.register("STREAM"), input = f.request(registered, "STREAM"), decision = await f.service.resolve(input);
    const writer = vi.fn(() => "TEST_ONLY:frame");
    expect(await f.service.deliverFrame({ ...input, decision_digest: decision.decision_digest }, writer)).toBe("TEST_ONLY:frame");
    expect(writer).toHaveBeenCalledTimes(1);
    f.grants.find(grant => grant.action === "stream.subscribe")!.revoked_at_ms = f.initial;
    await expect(f.service.deliverFrame({ ...input, decision_digest: decision.decision_digest }, writer)).rejects.toBeDefined();
    expect(writer).toHaveBeenCalledTimes(1);
  });

  it("refuses an explicit async physical writer before invoking it", async () => {
    const f = fixture(); f.addGrant("stream.subscribe");
    const registered = await f.register("STREAM"), input = f.request(registered, "STREAM"), decision = await f.service.resolve(input);
    const sideEffect = vi.fn();
    const writer = async () => { sideEffect(); };
    await expect(f.service.deliverFrame({ ...input, decision_digest: decision.decision_digest }, writer))
      .rejects.toMatchObject({ code: "CURRENT_VIEW_AUTHORITY_UNAVAILABLE" });
    expect(sideEffect).not.toHaveBeenCalled();
  });

  it("CURRENT decision cannot be used as a frame, export, or another decision digest", async () => {
    const f = fixture(), registered = await f.register(), input = f.request(registered);
    await expect(f.service.deliverFrame({ ...input, decision_digest: "TEST_ONLY:forged" }, () => undefined))
      .rejects.toMatchObject({ code: "CURRENT_VIEW_OPERATION_NOT_COMMISSIONED" });
    await expect(f.service.recheck({ ...input, decision_digest: "TEST_ONLY:forged" }))
      .rejects.toMatchObject({ code: "CURRENT_VIEW_AUTHORITY_CHANGED" });
  });

  it("detaches mutable caller selection and principal before await", async () => {
    const f = fixture(), copy = structuredClone(f.principal), selection = structuredClone(f.selection);
    const pending = f.service.register(copy, "TEST_ONLY:workload", selection, "CURRENT");
    copy.user.role = "ADMIN";
    selection.binding.profileId = "TEST_ONLY:foreign-profile";
    const registered = await pending;
    const result = await f.service.resolve({ original_context: registered.original_context, workload_id: "TEST_ONLY:workload",
      operation: "CURRENT", resource_ref: f.selection.resource_ref });
    expect(result.profile_id).toBe(f.selection.binding.profileId);
  });

  it("refuses over-large exact scope instead of truncating it into a misleading complete scope", async () => {
    const f = fixture({ tuples: 200 });
    await expect(f.register()).rejects.toMatchObject({ code: "CURRENT_VIEW_CAPACITY", status: 503 });
  });

  it("does not swallow Core DB failure or disclose its driver prose", async () => {
    const f = fixture(); f.query.mockRejectedValueOnce(new Error("password=TEST_ONLY-never-public"));
    try { await f.register(); throw new Error("expected refusal"); }
    catch (error) {
      expect(error).toMatchObject({ code: "CURRENT_VIEW_AUTHORITY_UNAVAILABLE", status: 503 });
      expect(String(error)).not.toContain("password=");
    }
  });
});
