/** Real disposable PostgreSQL, real Core command
 * boundary + store; TEST_ONLY detached source correspondences, never native
 * PM authentication, a held source-revoke fence, or physical TS COMMIT proof. */
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AuthService } from "../src/auth/auth.service";
import { AdminService } from "../src/admin/admin.service";
import { OwnerAccessRepository } from "../src/repos/owner-access";
import { AccountLifecycleRepository } from "../src/repos/account-lifecycle";
import { AccessRepository } from "../src/execution-v2/access.repository";
import { ExecutionAccessService } from "../src/execution-v2/access.service";
import type { AccessTrustProvider } from "../src/execution-v2/access-trust";
import { tsRootMembershipAcceptance, type AccessActor, type ReviewedAccessPolicy,
  type ScopedAccessGrant, type AccessAction, type AccessResource } from "../src/execution-v2/access.contract";
import { accessDigest, canonicalSelector, evaluateAccess, type AccessEvaluationContext,
  type AccessRelations } from "../src/execution-v2/access-policy";
import { currentAccessRelations, grantBindingDigest,
  type CurrentAccessRelations } from "../src/execution-v2/access-current-relations";
import { ExecutionCommandService, intentHash, previewHash } from "../src/execution-v2/command.service";
import { CommandStore, type CommandRecord } from "../src/execution-v2/command.store";
import type { CommandIntent } from "../src/execution-v2/command.contract";
import { commandAuthorization, type CommandTrust } from "../src/execution-v2/command-trust";
import { migrateTestDatabase, setupApp, teardownApp } from "./harness";

const URL = process.env.TEST_DATABASE_URL;
const next = (label: string) => `TEST_ONLY:${label}:${randomUUID()}`;
type Environment = "paper" | "sandbox" | "live";
const dbNow = async (db: Pick<PoolClient, "query">) => Number((await db.query(
  "SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS ms")).rows[0].ms);

describe.skipIf(!URL)("ELP2-07 selected command correspondence through real Core PG rollback (TEST_ONLY source)", () => {
  let ctx: Awaited<ReturnType<typeof setupApp>>, auth: AuthService, ownerId: string;
  let actor: AccessActor;
  beforeAll(async () => {
    await migrateTestDatabase(URL!); ctx = await setupApp({ DATABASE_URL: URL! }); auth = ctx.app.get(AuthService);
    vi.spyOn(auth, "verifyAccessIdentity").mockImplementation(async assertion => ({
      iss: "https://test-only.cloudflareaccess.com", sub: `TEST_ONLY:${assertion}`, aud: "test-audience",
      email: `${assertion}@azdag.com`, normalizedEmail: `${assertion}@azdag.com`,
      authenticationTime: new Date(), tokenExpiresAt: new Date(Date.now() + 60_000),
    }));
    const admin = new AdminService(ctx.pool, ctx.config, auth), name = `elp207-pg-${randomUUID()}`;
    const made = await admin.createUser({ username: name, displayName: name, role: "USER" }); ownerId = made.userId;
    const activation = await admin.resetCredential(ownerId);
    const initial = await auth.login({ assertion: name, username: name, credential: activation.activationToken });
    const password = "TEST-only-ELP207-private-PG-regression-correct-horse-2026";
    await auth.changePassword({ sessionToken: initial.token, csrfToken: initial.csrfToken,
      currentPassword: activation.activationToken, newPassword: password });
    const session = await auth.login({ assertion: name, username: name, credential: password });
    const user = (await auth.users.findById(ownerId))!;
    actor = { user_id: ownerId, session_id: session.sessionId, session_generation: user.sessionVersion };
    await new OwnerAccessRepository(ctx.pool).claimOwner({ userId: ownerId, claimedBy: "ELP207_PRIVATE_TEST_ONLY" });
    await new AccountLifecycleRepository(ctx.pool).grantStepUp({ stepUpId: next("step-up"),
      sessionId: actor.session_id, userId: ownerId, ttlSeconds: 600 });
  });
  afterAll(async () => { vi.restoreAllMocks(); if (ctx) await teardownApp(ctx); });

  async function fixture() {
    const workspace = next("workspace"), now = await dbNow(ctx.pool), a = next("portfolio-a"), b = next("portfolio-b");
    await ctx.pool.query("INSERT INTO workspaces(workspace_id,name,owner_user_id) VALUES($1,'TEST_ONLY command correspondence',$2)", [workspace, ownerId]);
    await ctx.pool.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'OWNER')", [workspace, ownerId]);
    const policy: ReviewedAccessPolicy = { workspace_id: workspace, revision: next("policy"),
      artifact_digest: accessDigest(["TEST_ONLY:policy", workspace]), approval_ref: next("not-owner-approval"),
      state: "REVIEWED", qualification: "TEST_ONLY", protected_owner_user_id: ownerId,
      researcher_fields: { state: "PENDING", policy_ref: null, fields: [] } };
    const source: CurrentAccessRelations = { schema_version: "pma.core-current-relations.v1",
      subject_user_id: ownerId, workspace_id: workspace, ts_user_id: next("ts-user"), mapping_revision: next("mapping"),
      resources: (["paper", "live"] as const).map(environment => ({ environment, revision: next("cut"),
        own_alpha_ids: [], member_portfolio_ids: [a, b], roots: [] })), grants: [] };
    const grants: ScopedAccessGrant[] = [];
    function add(resourceId: string, action: AccessAction = "capital.top_up") {
      const g: ScopedAccessGrant = { grant_id: next("grant"), workspace_id: workspace, subject_user_id: ownerId,
        action, effect: "ALLOW", selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "PORTFOLIO", ids: [resourceId] },
        environments: ["paper", "live"], valid_from_ms: now - 60_000, valid_until_ms: now + 300_000,
        delegable_actions: [], issued_by: ownerId, parent_grant_id: null, revision: next("grant-revision"),
        policy_revision: policy.revision, revoked_at_ms: null, requires_ts_acceptance: true,
        ts_receipt: null, field_policy_ref: null };
      // Synthetic original REVIEWED_POLICY_ROOT fact, not a fabricated ordinary
      // proposal receipt or actual accepted policy/authority installation.
      const fact = tsRootMembershipAcceptance.parse({ context: "REVIEWED_POLICY_ROOT", source: "TEST_ONLY:PM",
        source_contract: "TEST_ONLY:normalized", trust_profile: "TEST_ONLY:uninstalled", receipt_id: next("receipt"),
        portal_user_id: ownerId, ts_user_id: source.ts_user_id, mapping_revision: source.mapping_revision,
        human_requester_user_id: ownerId, workspace_id: workspace, action,
        selector_digest: accessDigest(canonicalSelector(g.selector)), environments: [...g.environments],
        previous_membership_revision: null, membership_revision: next("membership"), effective_at_ms: now - 30_000,
        expires_at_ms: now + 240_000, outcome: "ACCEPTED", payload_digest: accessDigest(["TEST_ONLY:payload", g.grant_id]),
        provenance_ref: "TEST_ONLY:NOT_REAL_SOURCE_ACCEPTANCE", policy_revision: policy.revision,
        policy_artifact_digest: policy.artifact_digest, policy_install_digest: accessDigest(["TEST_ONLY:install", workspace]),
        approval_ref: policy.approval_ref, grant_id: g.grant_id, grant_digest: accessDigest(g), expected_grant_revision: g.revision });
      g.ts_receipt = { receipt_id: fact.receipt_id, membership_revision: fact.membership_revision,
        mapping_revision: fact.mapping_revision, effective_at_ms: fact.effective_at_ms, expires_at_ms: fact.expires_at_ms };
      g.ts_acceptance_digest = accessDigest(fact);
      source.grants.push({ grant_id: g.grant_id, binding_digest: grantBindingDigest(g), accepted: fact,
        targets: g.environments.map(environment => ({ environment, resource: { kind: "PORTFOLIO", id: resourceId },
          revision: next("native-leg"), native_reference_digest: accessDigest(["TEST_ONLY:leg", g.grant_id, environment]),
          valid_from_ms: now - 20_000, valid_until_ms: now + 180_000 })) });
      grants.push(g); return g;
    }
    const selected = add(a), fallback = add(a), sibling = add(b), audit = add(a, "audit.read");
    const repo = new AccessRepository(ctx.pool); await repo.putPolicy(policy);
    for (const g of grants) await repo.saveGrant(g, true);
    const relations: AccessRelations = { qualified: true, revision: next("observation"), own_alpha_ids: [],
      member_portfolio_ids: [a, b], roots: {}, membership: null, current_authority: source };
    const accessTrust: AccessTrustProvider = { verifyPolicy: async () => null, verifyReceipt: async () => null,
      relations: async () => relations,
      verifiedHumanMapping: async () => ({ ts_user_id: source.ts_user_id, revision: source.mapping_revision }) };
    const access = new ExecutionAccessService(ctx.pool, auth, accessTrust, true);
    function intent(resource = a, environment: Environment = "paper"): CommandIntent {
      return { schema_version: "execution.capital-intent.v2", workspace_id: workspace,
        resource: { kind: "PORTFOLIO", id: resource }, environment, expected_policy_revision: policy.revision,
        business_payload: { schema_version: "pma.capital-command.v1.1", operation: "TOP_UP", idempotency_key: next("key"),
          recipient_kind: "PORTFOLIO", currency: "USDT", reason: "TEST_ONLY real PG boundary",
          amount: "10.000000000000000001", expected_versions: { budget: "9007199254740993", source: "2", parent: "3" } } };
    }
    let selectedReceipt = selected;
    function authorization(i: CommandIntent) {
      const r = selectedReceipt.ts_receipt!;
      return commandAuthorization.parse({ qualification: "TEST_ONLY", reference: next("authorization"),
        authority_ref: "TEST_ONLY:PM", profile_ref: "TEST_ONLY:uninstalled", audience: "pma.management.v1",
        actor_id: ownerId, ts_user_id: source.ts_user_id, workload_ref: "TEST_ONLY:workload",
        delegation_ref: "TEST_ONLY:opaque-native-reference-not-Core-grant-id", mapping_revision: r.mapping_revision,
        membership_revision: r.membership_revision, membership_receipt_ref: r.receipt_id,
        workspace_id: workspace, environment: i.environment, operation: i.business_payload.operation,
        resource_kind: i.resource.kind, resource_id: i.resource.id, policy_revision: policy.revision,
        intent_hash: intentHash(actor, i), source_intent_digest: accessDigest(["TEST_ONLY:source-intent", i]).slice(7),
        expected_versions: i.business_payload.expected_versions, issued_at_ms: now - 1_000, expires_at_ms: now + 50_000,
        idempotency_retained_until_ms: now + 240_000, approval_required: false, required_approval_gate: null,
        approval: null, r2_basis: null,
        commit_checks: { human: true, workload: true, membership: true, scope: true, versions: true, capacity: true, approval: true } });
    }
    const send = vi.fn<CommandTrust["send"]>(async () => { throw new Error("TEST_ONLY no authoritative source result"); });
    const trust: CommandTrust = { prepare: async ({ intent: i }) => authorization(i), send, lookup: async () => null };
    const service = new ExecutionCommandService(ctx.pool, access, trust, true);
    const submit = (i: CommandIntent) => service.submit(actor, i, previewHash(authorization(i)));
    return { workspace, a, b, policy, source, grants, selected, fallback, sibling, audit,
      relations, access, service, send, submit, intent, authorization,
      choose(g: ScopedAccessGrant) { selectedReceipt = g; } };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;

  async function commandRows(f: Fixture) {
    return (await ctx.pool.query(`SELECT
      (SELECT count(*)::int FROM execution_trusted_commands WHERE workspace_id=$1) AS commands,
      (SELECT count(*)::int FROM execution_trusted_command_events e JOIN execution_trusted_commands c USING(command_id)
        WHERE c.workspace_id=$1) AS events,
      (SELECT count(*)::int FROM product_audit_events WHERE workspace_id=$1 AND aggregate_type='execution_command') AS audit`, [f.workspace])).rows[0];
  }
  async function afterInsert(f: Fixture, change: (db: PoolClient, record: CommandRecord) => Promise<void>, body: () => Promise<void>) {
    const original = CommandStore.prototype.insert; let inserted = 0;
    const hook = vi.spyOn(CommandStore.prototype, "insert").mockImplementation(async function (this: CommandStore, db, user, intent, hash, a) {
      const record = await original.call(this, db, user, intent, hash, a);
      if (intent.workspace_id === f.workspace) {
        inserted++;
        expect((await db.query("SELECT count(*)::int AS n FROM execution_trusted_commands WHERE command_id=$1", [record.id])).rows[0].n).toBe(1);
        expect((await db.query("SELECT count(*)::int AS n FROM execution_trusted_command_events WHERE command_id=$1", [record.id])).rows[0].n).toBe(1);
        await change(db, record);
      }
      return record;
    });
    try { await body(); expect(inserted).toBe(1); }
    finally { hook.mockRestore(); }
  }

  it.each(["paper", "live"] as const)("persists and dispatches the exact selected receipt/target in %s", async environment => {
    const f = await fixture();
    for (const [g, id] of [[f.selected, f.a], [f.sibling, f.b]] as const) {
      f.choose(g); const i = f.intent(id, environment), before = await f.service.preview(actor, i);
      expect(before.allowed).toBe(true);
      const result = await f.submit(i);
      expect(result).toMatchObject({ environment, resource: i.resource, delivery: "DELIVERY_UNKNOWN", business: { state: "UNKNOWN" } });
      const stored = await new CommandStore(ctx.pool).get(f.workspace, result.command_id);
      expect(stored!.authorization.membership_receipt_ref).toBe(g.ts_receipt!.receipt_id);
      expect(stored!.authorization.membership_revision).toBe(g.ts_receipt!.membership_revision);
      expect(stored!.intent).toEqual(i);
    }
    expect(f.send).toHaveBeenCalledTimes(2);
    expect(await commandRows(f)).toEqual({ commands: 2, events: 6, audit: 6 });
  });

  it.each(["wrong-resource", "wrong-native-environment", "missing-selected-native-leg", "wrong-action"] as const)(
    "%s cannot borrow another valid ALLOW before any INSERT", async fault => {
      const f = await fixture(), i = f.intent();
      if (fault === "wrong-resource") f.choose(f.sibling);
      if (fault === "wrong-action") f.choose(f.audit);
      const entry = f.source.grants.find(g => g.grant_id === f.selected.grant_id)!;
      if (fault === "wrong-native-environment") entry.targets.find(t => t.environment === "paper")!.environment = "sandbox";
      if (fault === "missing-selected-native-leg") entry.targets = entry.targets.filter(t => t.environment !== "paper");
      const context = await f.access.readContext(actor, f.workspace);
      expect(currentAccessRelations.safeParse(f.source).success).toBe(true);
      expect(evaluateAccess(context, "capital.top_up", i.resource, i.environment).allowed).toBe(true);
      expect(await f.service.preview(actor, i)).toMatchObject({ allowed: false, reason_code: "COMMAND_CONTEXT_INVALID" });
      await expect(f.submit(i)).rejects.toMatchObject({ code: "COMMAND_CONTEXT_INVALID", status: 403 });
      expect(await commandRows(f)).toEqual({ commands: 0, events: 0, audit: 0 }); expect(f.send).not.toHaveBeenCalled();
    });

  it("absent current-authority extension retains legacy singleton and private command DTO compatibility", async () => {
    const f = await fixture(), i = f.intent(), a = f.authorization(i), bytes = JSON.stringify(a);
    delete f.relations.current_authority;
    f.relations.membership = { receipt_id: a.membership_receipt_ref, revision: a.membership_revision, mapping_revision: a.mapping_revision };
    expect((await f.service.preview(actor, i)).allowed).toBe(true);
    const result = await f.submit(i), stored = await new CommandStore(ctx.pool).get(f.workspace, result.command_id);
    expect(commandAuthorization.parse(JSON.parse(bytes))).toEqual(a);
    expect(stored!.authorization.membership_receipt_ref).toBe(a.membership_receipt_ref);
    expect(f.send).toHaveBeenCalledOnce();
  });

  it.each([null, undefined, {}, { schema_version: "UNKNOWN" }])("present invalid extension fails closed despite matching legacy receipt: %j", async invalid => {
    const f = await fixture(), i = f.intent(), a = f.authorization(i);
    f.relations.membership = { receipt_id: a.membership_receipt_ref, revision: a.membership_revision, mapping_revision: a.mapping_revision };
    (f.relations as unknown as { current_authority: unknown }).current_authority = invalid;
    await expect(f.submit(i)).rejects.toMatchObject({ code: "ACCESS_DENIED", status: 403 });
    expect(await commandRows(f)).toEqual({ commands: 0, events: 0, audit: 0 }); expect(f.send).not.toHaveBeenCalled();
  });

  it.each(["revoked", "expired"] as const)("real same-TX Core session %s AFTER actual INSERT rolls back command/events/audit and never sends", async fault => {
    const f = await fixture(), i = f.intent();
    expect((await f.service.preview(actor, i)).allowed).toBe(true);
    await afterInsert(f, async db => {
      if (fault === "revoked") await db.query("UPDATE auth_sessions SET state='REVOKED',revoked_at=clock_timestamp(),revoke_reason='TEST_ONLY fault' WHERE session_id=$1", [actor.session_id]);
      else await db.query("UPDATE auth_sessions SET idle_expires_at=clock_timestamp()-interval '1 millisecond' WHERE session_id=$1", [actor.session_id]);
    }, async () => {
      await expect(f.submit(i)).rejects.toMatchObject({ code: "CURRENT_ACTOR_AUTHORITY_REQUIRED", status: 403 });
    });
    expect(await commandRows(f)).toEqual({ commands: 0, events: 0, audit: 0 }); expect(f.send).not.toHaveBeenCalled();
    const session = (await ctx.pool.query("SELECT state,idle_expires_at>clock_timestamp() AS current FROM auth_sessions WHERE session_id=$1", [actor.session_id])).rows[0];
    expect(session).toMatchObject({ state: "ACTIVE", current: true }); // isolated session fault rolled back too
  });

  it.each(["revoked-target", "expired-target"] as const)("detached TEST_ONLY selected proof %s AFTER actual INSERT is rechecked at real DB time, not rescued by a sibling", async fault => {
    const f = await fixture(), i = f.intent(); let inTx: AccessEvaluationContext | undefined, expiry: number | undefined;
    const original: ExecutionAccessService["commandBoundary"] = f.access.commandBoundary.bind(f.access);
    // Observe, but do not replace, the real DB boundary/context/transaction.
    // Only the detached synthetic source fact is faulted; the callback forwards
    // the actual transaction context and final database clock unchanged.
    const boundary = vi.spyOn(f.access, "commandBoundary").mockImplementation(async <T>(
      actorArg: AccessActor, workspace: string, expected: AccessEvaluationContext, action: AccessAction,
      resource: AccessResource, environment: Environment,
      check: (now: number, current: AccessEvaluationContext) => void, fn: (db: PoolClient) => Promise<T>,
    ): Promise<T> => original(actorArg, workspace, expected, action, resource, environment, (now, current) => {
      inTx = current; check(now, current);
    }, fn));
    try {
      expect((await f.service.preview(actor, i)).allowed).toBe(true);
      await afterInsert(f, async db => {
        expect(inTx).toBeDefined();
        const current = inTx!.relationsFor(ownerId).current_authority!;
        const entry = current.grants.find(g => g.grant_id === f.selected.grant_id)!;
        if (fault === "revoked-target") entry.targets = entry.targets.filter(t => t.environment !== "paper");
        else { expiry = await dbNow(db); entry.targets.find(t => t.environment === "paper")!.valid_until_ms = expiry; }
        // A genuinely independent still-current ALLOW keeps the broad policy
        // decision true. Only the exact selected command receipt must refuse.
        expect(evaluateAccess(inTx!, "capital.top_up", i.resource, i.environment).allowed).toBe(true);
      }, async () => {
        await expect(f.submit(i)).rejects.toMatchObject({ code: "COMMAND_CONTEXT_INVALID", status: 403 });
      });
      if (expiry !== undefined) expect(inTx!.now_ms).toBeGreaterThanOrEqual(expiry);
      expect(await commandRows(f)).toEqual({ commands: 0, events: 0, audit: 0 }); expect(f.send).not.toHaveBeenCalled();
      expect(f.source.grants.find(g => g.grant_id === f.selected.grant_id)!.targets).toHaveLength(2); // original provider input remained detached
    } finally { boundary.mockRestore(); }
  });
});
