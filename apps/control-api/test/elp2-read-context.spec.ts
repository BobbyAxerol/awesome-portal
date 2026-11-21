/**
 * ELP2-04 real disposable-PostgreSQL read-context regression definitions.
 * TEST_DATABASE_URL is the only database target. Accounts/session leases and
 * the delegated child below are explicit isolated fixtures, not login proof or
 * production authority. Reviewed root policy is installed through the internal
 * TEST_ONLY verifier port. No HTTP listener, runtime activation or TS call.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AuthService } from "../src/auth/auth.service";
import { AccessActor, AccessPolicyError, ReviewedAccessPolicy, ScopedAccessGrant } from "../src/execution-v2/access.contract";
import { AccessEvaluationContext, AccessRelations, accessDigest, evaluateAccess, grantCurrent, policyReady } from "../src/execution-v2/access-policy";
import { AccessRepository } from "../src/execution-v2/access.repository";
import { ExecutionAccessService } from "../src/execution-v2/access.service";
import { AccessTrustProvider, ReviewedPolicyArtifact } from "../src/execution-v2/access-trust";
import { OwnerAccessRepository } from "../src/repos/owner-access";
import { SessionsRepository } from "../src/repos/sessions";
import { migrateTestDatabase, setupApp, teardownApp } from "./harness";

const DATABASE_URL = process.env.TEST_DATABASE_URL;
type Account = { userId: string; sessionId: string; generation: number };
type ContextOutcome = { context: AccessEvaluationContext; error?: never } | { error: unknown; context?: never };

describe.skipIf(!DATABASE_URL)("ELP2-04 fresh read-context authority across adapter awaits (real PG)", () => {
  let ctx: Awaited<ReturnType<typeof setupApp>>;
  let auth: AuthService;
  let owner: Account;
  let replacementOwner: Account;
  let sequence = 0;
  const next = (label: string) => `elp204-context-${label}-${++sequence}`;
  const actor = (account: Account): AccessActor => ({ user_id: account.userId,
    session_id: account.sessionId, session_generation: account.generation });

  /** Explicit current-lease fixture, never a test of authentication itself. */
  async function account(label: string): Promise<Account> {
    const userId = next(label), sessionId = next("session"), generation = 7;
    await ctx.pool.query(`INSERT INTO portal_users
      (user_id,username,display_name,role,status,must_change_password,session_version)
      VALUES($1,$1,$1,'USER','ACTIVE',false,$2)`, [userId, generation]);
    await new SessionsRepository(ctx.pool).create({ sessionId, tokenHash: next("TEST_ONLY-token-hash"),
      userId, accessSubject: `TEST_ONLY:${userId}`, accessTokenExpiresAt: null,
      csrfSecretHash: next("TEST_ONLY-csrf-hash"), activationId: null, sessionVersion: generation,
      idleExpiresAt: new Date(Date.now() + 3_600_000), absoluteExpiresAt: new Date(Date.now() + 7_200_000) });
    return { userId, sessionId, generation };
  }

  class TestOnlyTrust implements AccessTrustProvider {
    beforeRelations?: (userId: string) => Promise<void>;
    relationCalls = 0;
    readonly facts = new Map<string, AccessRelations>();
    constructor(readonly artifact: ReviewedPolicyArtifact) {}
    async verifyPolicy(input: unknown) { return input === this.artifact ? this.artifact : null; }
    async verifyReceipt() { return null; }
    async verifiedHumanMapping() { return null; }
    async relations(userId: string, workspaceId: string) {
      this.relationCalls++;
      if (this.beforeRelations) await this.beforeRelations(userId);
      return workspaceId === this.artifact.policy.workspace_id ? this.facts.get(userId)!
        : { qualified: false, revision: "UNQUALIFIED", own_alpha_ids: [], member_portfolio_ids: [], roots: {}, membership: null };
    }
  }

  async function fixture() {
    const caller = await account("caller"), issuer = await account("issuer"), workspace = next("workspace");
    await ctx.pool.query("INSERT INTO workspaces(workspace_id,name,owner_user_id) VALUES($1,$2,$3)",
      [workspace, "TEST_ONLY isolated read context", owner.userId]);
    for (const user of [owner, caller, issuer]) await ctx.pool.query(
      "INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,$3)",
      [workspace, user.userId, user === owner ? "OWNER" : "MEMBER"]);
    const policy: ReviewedAccessPolicy = { workspace_id: workspace, revision: next("TEST_ONLY-policy"),
      artifact_digest: accessDigest(["TEST_ONLY-not-runtime-policy", workspace]),
      approval_ref: "TEST_ONLY-not-Bobby-approval", state: "REVIEWED", qualification: "TEST_ONLY",
      protected_owner_user_id: owner.userId, researcher_fields: { state: "PENDING", policy_ref: null, fields: [] } };
    const now = Date.now(), rootId = next("TEST_ONLY-root");
    const parent: ScopedAccessGrant = { grant_id: next("TEST_ONLY-parent"), subject_user_id: issuer.userId,
      workspace_id: workspace, action: "access.grant", effect: "ALLOW",
      selector: { kind: "ROOT_SCOPE", root_id: rootId }, environments: ["paper"],
      valid_from_ms: now - 60_000, valid_until_ms: now + 3_600_000, delegable_actions: ["access.read"],
      issued_by: owner.userId, parent_grant_id: null, revision: next("TEST_ONLY-parent-revision"),
      policy_revision: policy.revision, revoked_at_ms: null, requires_ts_acceptance: false,
      ts_receipt: null, field_policy_ref: null };
    const grant: ScopedAccessGrant = { ...parent, grant_id: next("TEST_ONLY-child"), subject_user_id: caller.userId,
      action: "access.read", selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "USER", ids: [replacementOwner.userId] },
      valid_from_ms: now - 1_000, valid_until_ms: now + 1_800_000, delegable_actions: [],
      issued_by: issuer.userId, parent_grant_id: parent.grant_id, revision: next("TEST_ONLY-child-revision") };
    const artifact: ReviewedPolicyArtifact = { policy, root_grants: [parent], provenance_ref: "TEST_ONLY-isolated-read-context" };
    const trust = new TestOnlyTrust(artifact);
    for (const user of [owner, caller, issuer]) trust.facts.set(user.userId, {
      qualified: true, revision: `TEST_ONLY-relations:${user.userId}`, own_alpha_ids: ["TEST_ONLY-alpha-owned"],
      member_portfolio_ids: ["TEST_ONLY-portfolio-member"], roots: { [rootId]: [{ kind: "USER", id: replacementOwner.userId }] },
      membership: { receipt_id: `TEST_ONLY-receipt:${user.userId}`, revision: "TEST_ONLY-membership-v1", mapping_revision: "TEST_ONLY-mapping-v1" },
    });
    const service = new ExecutionAccessService(ctx.pool, auth, trust, true);
    await service.installReviewedPolicy(artifact);
    // This child is a narrowly bound isolated DB fixture, not an accepted TS
    // business grant. access.read is app-only; no business permission is seeded.
    await new AccessRepository(ctx.pool).saveGrant(grant, true);
    return { caller, issuer, workspace, policy, parent, grant, trust, service, rootId };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;

  async function replaceGrant(f: Fixture, changes: Partial<ScopedAccessGrant>) {
    await new AccessRepository(ctx.pool).saveGrant({ ...f.grant, ...changes });
  }
  async function replacePolicy(f: Fixture, changes: Partial<ReviewedAccessPolicy>) {
    await new AccessRepository(ctx.pool).putPolicy({ ...f.policy, ...changes });
  }
  async function totals(f: Fixture) {
    return (await ctx.pool.query(`SELECT
      (SELECT count(*)::int FROM portal_access_policy_events WHERE workspace_id=$1) AS events,
      (SELECT count(*)::int FROM portal_access_grants_v2 WHERE workspace_id=$1) AS grants,
      (SELECT count(*)::int FROM portal_access_proposals WHERE workspace_id=$1) AS proposals`, [f.workspace])).rows[0];
  }
  async function authorityRejected(outcome: ContextOutcome, expected: readonly string[]) {
    expect(outcome.context).toBeUndefined();
    expect(outcome.error).toBeInstanceOf(AccessPolicyError);
    expect(expected).toContain((outcome.error as AccessPolicyError).code);
    expect((outcome.error as AccessPolicyError).message).toBe("The requested access is not available.");
  }
  /** Real DB mutation occurs only after the provider has reached the adapter
   * await. finally always releases the barrier and drains the in-flight read. */
  async function whileRelations(f: Fixture, mutate: () => Promise<void>): Promise<ContextOutcome> {
    let entered!: () => void, release!: () => void;
    const arrived = new Promise<void>(resolve => { entered = resolve; });
    const released = new Promise<void>(resolve => { release = resolve; });
    let once = false;
    f.trust.beforeRelations = async () => {
      if (!once) { once = true; entered(); await released; }
    };
    const outcome: Promise<ContextOutcome> = f.service.readContext(actor(f.caller), f.workspace)
      .then(context => ({ context }), error => ({ error }));
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([arrived, new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("TEST_ONLY relation barrier was not reached")), 3_000);
      })]);
      await mutate();
    } finally {
      if (timer) clearTimeout(timer);
      release();
      f.trust.beforeRelations = undefined;
      await outcome;
    }
    return await outcome;
  }

  beforeAll(async () => {
    await migrateTestDatabase(DATABASE_URL!);
    ctx = await setupApp({ DATABASE_URL: DATABASE_URL! });
    auth = ctx.app.get(AuthService);
    owner = await account("protected-owner");
    replacementOwner = await account("replacement-owner");
    await new OwnerAccessRepository(ctx.pool).claimOwner({ userId: owner.userId, claimedBy: "ELP2-04_TEST_ONLY" });
  });
  afterAll(async () => { if (ctx) await teardownApp(ctx); });

  it("T04 current policy, actor, delegated grant and qualified relation snapshot remain coherent without writes", async () => {
    const f = await fixture(), before = await totals(f);
    const context = await f.service.readContext(actor(f.caller), f.workspace);
    expect(context).toMatchObject({ principal_id: f.caller.userId, workspace_id: f.workspace,
      actor_current: true, policy: f.policy, allow_test_only: true });
    expect(context.now_ms).toBeGreaterThanOrEqual(f.grant.valid_from_ms);
    expect(policyReady(context)).toBe(true);
    expect([...context.active_principals].sort()).toEqual([owner.userId, f.issuer.userId, f.caller.userId].sort());
    expect(context.grants).toEqual(expect.arrayContaining([f.parent, f.grant]));
    expect(grantCurrent(context.grants.find(g => g.grant_id === f.grant.grant_id)!, context)).toBe(true);
    expect(evaluateAccess(context, "access.read", { kind: "USER", id: replacementOwner.userId }, "paper").allowed).toBe(true);
    expect(await totals(f)).toEqual(before);
  });

  it("T04 TEST_ONLY remains policy-pending without explicit internal test authority", async () => {
    const f = await fixture();
    const service = new ExecutionAccessService(ctx.pool, auth, f.trust);
    const context = await service.readContext(actor(f.caller), f.workspace);
    expect(policyReady(context)).toBe(false);
    expect(evaluateAccess(context, "access.read", { kind: "USER", id: replacementOwner.userId }, "paper"))
      .toMatchObject({ allowed: false, reason_code: "POLICY_PENDING" });
  });

  it("T04 a missing policy is absence, not an inferred business entitlement", async () => {
    const f = await fixture();
    await ctx.pool.query("DELETE FROM portal_access_policy_state WHERE workspace_id=$1", [f.workspace]);
    const context = await f.service.readContext(actor(f.caller), f.workspace);
    expect(context.policy).toBeNull();
    expect(policyReady(context)).toBe(false);
    expect(grantCurrent(context.grants.find(g => g.grant_id === f.grant.grant_id)!, context)).toBe(false);
  });

  const staleActorCases: readonly [string, (f: Fixture) => Promise<unknown>][] = [
    ["disabled caller", f => ctx.pool.query("UPDATE portal_users SET status='DISABLED' WHERE user_id=$1", [f.caller.userId])],
    ["invited caller", f => ctx.pool.query("UPDATE portal_users SET status='INVITED' WHERE user_id=$1", [f.caller.userId])],
    ["password change required", f => ctx.pool.query("UPDATE portal_users SET must_change_password=true WHERE user_id=$1", [f.caller.userId])],
    ["archived caller", f => ctx.pool.query("UPDATE portal_users SET status='DISABLED',archived_at=clock_timestamp() WHERE user_id=$1", [f.caller.userId])],
    ["current generation advanced", f => ctx.pool.query("UPDATE portal_users SET session_version=session_version+1 WHERE user_id=$1", [f.caller.userId])],
    ["revoked session", f => ctx.pool.query("UPDATE auth_sessions SET state='REVOKED',revoked_at=clock_timestamp() WHERE session_id=$1", [f.caller.sessionId])],
    ["expired session state", f => ctx.pool.query("UPDATE auth_sessions SET state='EXPIRED' WHERE session_id=$1", [f.caller.sessionId])],
    ["expired idle lease", f => ctx.pool.query("UPDATE auth_sessions SET idle_expires_at=clock_timestamp()-interval '1 millisecond' WHERE session_id=$1", [f.caller.sessionId])],
    ["expired absolute lease", f => ctx.pool.query("UPDATE auth_sessions SET absolute_expires_at=clock_timestamp()-interval '1 millisecond' WHERE session_id=$1", [f.caller.sessionId])],
    ["session generation differs", f => ctx.pool.query("UPDATE auth_sessions SET session_version=session_version-1 WHERE session_id=$1", [f.caller.sessionId])],
    ["session belongs to another user", f => ctx.pool.query("UPDATE auth_sessions SET user_id=$2 WHERE session_id=$1", [f.caller.sessionId, f.issuer.userId])],
  ];
  it.each(staleActorCases)("T04 rejects %s before calling an adapter", async (_label, change) => {
    const f = await fixture();
    await change(f);
    await expect(f.service.readContext(actor(f.caller), f.workspace)).rejects
      .toMatchObject({ code: "CURRENT_ACTOR_AUTHORITY_REQUIRED" });
    expect(f.trust.relationCalls).toBe(0);
  });

  it("T04 opaque/unknown session id cannot mint a current context", async () => {
    const f = await fixture();
    await expect(f.service.readContext({ ...actor(f.caller), session_id: next("missing-session") }, f.workspace))
      .rejects.toMatchObject({ code: "CURRENT_ACTOR_AUTHORITY_REQUIRED" });
    expect(f.trust.relationCalls).toBe(0);
  });

  it("T04 current caller outside the workspace is indistinguishable from a missing workspace", async () => {
    const f = await fixture();
    await ctx.pool.query("DELETE FROM workspace_members WHERE workspace_id=$1 AND user_id=$2", [f.workspace, f.caller.userId]);
    await expect(f.service.readContext(actor(f.caller), f.workspace)).rejects.toMatchObject({ code: "ACCESS_RESOURCE_NOT_FOUND", status: 404 });
    await expect(f.service.readContext(actor(f.caller), next("unknown-workspace"))).rejects
      .toMatchObject({ code: "ACCESS_RESOURCE_NOT_FOUND", status: 404 });
    expect(f.trust.relationCalls).toBe(0);
  });

  it("T04 the current protected owner remains explicit when not a workspace member", async () => {
    const f = await fixture();
    await ctx.pool.query("DELETE FROM workspace_members WHERE workspace_id=$1 AND user_id=$2", [f.workspace, owner.userId]);
    const context = await f.service.readContext(actor(owner), f.workspace);
    expect(context.actor_current).toBe(true);
    expect(context.active_principals.has(owner.userId)).toBe(true);
    expect(context.principal_id).toBe(owner.userId);
  });

  it.each(["membership removed", "disabled", "password reset", "archived"] as const)
    ("T04 delegated chain rechecks issuer lifecycle: %s", async reason => {
      const f = await fixture();
      if (reason === "membership removed") await ctx.pool.query("DELETE FROM workspace_members WHERE workspace_id=$1 AND user_id=$2", [f.workspace, f.issuer.userId]);
      if (reason === "disabled") await ctx.pool.query("UPDATE portal_users SET status='DISABLED' WHERE user_id=$1", [f.issuer.userId]);
      if (reason === "password reset") await ctx.pool.query("UPDATE portal_users SET must_change_password=true WHERE user_id=$1", [f.issuer.userId]);
      if (reason === "archived") await ctx.pool.query("UPDATE portal_users SET status='DISABLED',archived_at=clock_timestamp() WHERE user_id=$1", [f.issuer.userId]);
      const context = await f.service.readContext(actor(f.caller), f.workspace);
      expect(context.active_principals.has(f.issuer.userId)).toBe(false);
      expect(grantCurrent(context.grants.find(g => g.grant_id === f.grant.grant_id)!, context)).toBe(false);
      expect(evaluateAccess(context, "access.read", { kind: "USER", id: replacementOwner.userId }, "paper").allowed).toBe(false);
    });

  const raceCases: readonly [string, (f: Fixture) => Promise<unknown>, readonly string[]][] = [
    ["grant revoke", f => replaceGrant(f, { revoked_at_ms: Date.now(), revision: next("revoked-revision") }), ["ACCESS_RETRY_REQUIRED"]],
    ["grant expires while waiting", f => replaceGrant(f, { valid_until_ms: Date.now() - 1 }), ["ACCESS_RETRY_REQUIRED"]],
    ["grant replacement", f => replaceGrant(f, { selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "USER", ids: [f.issuer.userId] }, revision: next("grant-replaced") }), ["ACCESS_RETRY_REQUIRED"]],
    ["policy revision replacement", f => replacePolicy(f, { revision: next("policy-replaced") }), ["ACCESS_RETRY_REQUIRED"]],
    ["same-revision policy body change", f => replacePolicy(f, { approval_ref: next("policy-approval-changed") }), ["ACCESS_RETRY_REQUIRED"]],
    ["policy removed", f => ctx.pool.query("DELETE FROM portal_access_policy_state WHERE workspace_id=$1", [f.workspace]), ["ACCESS_RETRY_REQUIRED"]],
    ["caller generation bump", f => ctx.pool.query("UPDATE portal_users SET session_version=session_version+1 WHERE user_id=$1", [f.caller.userId]), ["CURRENT_ACTOR_AUTHORITY_REQUIRED"]],
    ["caller session revoke", f => ctx.pool.query("UPDATE auth_sessions SET state='REVOKED' WHERE session_id=$1", [f.caller.sessionId]), ["CURRENT_ACTOR_AUTHORITY_REQUIRED"]],
    ["caller lease expires", f => ctx.pool.query("UPDATE auth_sessions SET idle_expires_at=clock_timestamp()-interval '1 millisecond' WHERE session_id=$1", [f.caller.sessionId]), ["CURRENT_ACTOR_AUTHORITY_REQUIRED"]],
    ["caller disabled", f => ctx.pool.query("UPDATE portal_users SET status='DISABLED' WHERE user_id=$1", [f.caller.userId]), ["CURRENT_ACTOR_AUTHORITY_REQUIRED"]],
    ["caller password reset", f => ctx.pool.query("UPDATE portal_users SET must_change_password=true WHERE user_id=$1", [f.caller.userId]), ["CURRENT_ACTOR_AUTHORITY_REQUIRED"]],
    ["caller membership removed", f => ctx.pool.query("DELETE FROM workspace_members WHERE workspace_id=$1 AND user_id=$2", [f.workspace, f.caller.userId]), ["ACCESS_RESOURCE_NOT_FOUND", "ACCESS_RETRY_REQUIRED"]],
    ["issuer membership removed", f => ctx.pool.query("DELETE FROM workspace_members WHERE workspace_id=$1 AND user_id=$2", [f.workspace, f.issuer.userId]), ["ACCESS_RETRY_REQUIRED"]],
    ["issuer disabled", f => ctx.pool.query("UPDATE portal_users SET status='DISABLED' WHERE user_id=$1", [f.issuer.userId]), ["ACCESS_RETRY_REQUIRED"]],
    ["issuer password reset", f => ctx.pool.query("UPDATE portal_users SET must_change_password=true WHERE user_id=$1", [f.issuer.userId]), ["ACCESS_RETRY_REQUIRED"]],
    ["additional grant inserted", f => new AccessRepository(ctx.pool).saveGrant({ ...f.grant, grant_id: next("extra-grant"), revision: next("extra-revision") }, true), ["ACCESS_RETRY_REQUIRED"]],
  ];
  it.each(raceCases)("T04 adapter-await fence rejects %s without returning stale authority", async (_label, mutate, codes) => {
    const f = await fixture();
    const outcome = await whileRelations(f, async () => { await mutate(f); });
    await authorityRejected(outcome, codes);
  });

  it("T04 an owner-anchor change during the adapter await refuses the captured policy", async () => {
    const f = await fixture();
    try {
      const outcome = await whileRelations(f, async () => {
        // A short timeout proves readContext did not retain anchor/member locks
        // across adapter I/O. This is an isolated test DB, never a real takeover.
        const db = await ctx.pool.connect();
        try {
          await db.query("BEGIN");
          await db.query("SET LOCAL lock_timeout='100ms'");
          await db.query("UPDATE portal_owner_anchor SET user_id=$1 WHERE anchor_id='PORTAL_OWNER'", [replacementOwner.userId]);
          await db.query("COMMIT");
        } catch (error) { await db.query("ROLLBACK"); throw error; }
        finally { db.release(); }
      });
      await authorityRejected(outcome, ["POLICY_PENDING", "ACCESS_RETRY_REQUIRED"]);
    } finally {
      await ctx.pool.query("UPDATE portal_owner_anchor SET user_id=$1 WHERE anchor_id='PORTAL_OWNER'", [owner.userId]);
    }
  });

  it("T04 an unchanged adapter await remains a legitimate successful read", async () => {
    const f = await fixture(), outcome = await whileRelations(f, async () => {});
    expect(outcome.error).toBeUndefined();
    expect(outcome.context?.principal_id).toBe(f.caller.userId);
    expect(evaluateAccess(outcome.context!, "access.read", { kind: "USER", id: replacementOwner.userId }, "paper").allowed).toBe(true);
  });

  it("T04 adapter-owned mutable references cannot change a delivered relation snapshot", async () => {
    const f = await fixture(), expected = structuredClone(f.trust.facts.get(f.caller.userId)!);
    const context = await f.service.readContext(actor(f.caller), f.workspace);
    const providerOwned = f.trust.facts.get(f.caller.userId)!;
    (providerOwned.own_alpha_ids as string[]).push("TEST_ONLY-peer-alpha-must-not-appear");
    (providerOwned.member_portfolio_ids as string[]).push("TEST_ONLY-peer-portfolio-must-not-appear");
    (providerOwned.roots[f.rootId] as { kind: "USER"; id: string }[]).push({ kind: "USER", id: f.caller.userId });
    providerOwned.membership!.revision = "TEST_ONLY-mutated-after-return";
    providerOwned.revision = "TEST_ONLY-mutated-after-return";
    expect(context.relationsFor(f.caller.userId)).toEqual(expected);
  });

  it("T04 a relation object already captured cannot mutate while a later principal awaits", async () => {
    const f = await fixture();
    let firstUser: string | null = null;
    let firstFact: AccessRelations | undefined;
    f.trust.beforeRelations = async userId => {
      if (firstUser === null) { firstUser = userId; firstFact = f.trust.facts.get(userId); }
      else if (firstFact) {
        firstFact.revision = "TEST_ONLY-mutated-during-later-await";
        (firstFact.own_alpha_ids as string[]).push("TEST_ONLY-not-in-original-snapshot");
      }
    };
    const context = await f.service.readContext(actor(f.caller), f.workspace);
    expect(firstUser).not.toBeNull();
    expect(context.relationsFor(firstUser!).revision).toBe(`TEST_ONLY-relations:${firstUser}`);
    expect(context.relationsFor(firstUser!).own_alpha_ids).toEqual(["TEST_ONLY-alpha-owned"]);
  });
});
