/** Private root-bootstrap component proofs. TEST_ONLY synthetic provider data,
 * disposable TEST_DATABASE_URL only; never TS wire/runtime qualification. */
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { generateKeyPair, SignJWT } from "jose";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AuthService } from "../src/auth/auth.service";
import { OwnerAccessRepository } from "../src/repos/owner-access";
import { AccessRepository, type AccessReceipt } from "../src/execution-v2/access.repository";
import { ExecutionAccessService } from "../src/execution-v2/access.service";
import { AccessPolicyError, type ScopedAccessGrant, type ReviewedAccessPolicy } from "../src/execution-v2/access.contract";
import { accessDigest, canonicalSelector, grantCurrent } from "../src/execution-v2/access-policy";
import { unqualifiedAccessTrust, type AccessTrustProvider, type ReviewedPolicyArtifact } from "../src/execution-v2/access-trust";
import { acceptRootMembershipReceipt, tsRootMembershipAcceptance, type QualifiedRootMembershipReceipt,
  type TsRootMembershipAcceptance } from "../src/execution-v2/access-root-receipt";
import { CurrentHumanCandidate, type CurrentHumanBinding, type CurrentHumanCandidateConfig } from "../src/execution-v2/current-human-candidate";
import { CurrentHumanMutations, type CurrentHumanRecoveryAttempt } from "../src/execution-v2/current-human-mutations";
import { migrateTestDatabase, setupApp, teardownApp } from "./harness";

const DATABASE_URL = process.env.TEST_DATABASE_URL;
const next = (label: string) => `elp210-root-${label}-${randomUUID()}`;

function sample(): TsRootMembershipAcceptance {
  const now = Date.now();
  return { context: "REVIEWED_POLICY_ROOT", source: "TEST_ONLY-source", source_contract: "TEST_ONLY-normalized",
    trust_profile: "TEST_ONLY", receipt_id: next("receipt"), portal_user_id: "TEST_ONLY-user", ts_user_id: "TEST_ONLY-ts-user",
    mapping_revision: "TEST_ONLY-mapping", human_requester_user_id: "TEST_ONLY-owner", workspace_id: "TEST_ONLY-workspace",
    action: "business.read_all", selector_digest: accessDigest("TEST_ONLY-selector"), environments: ["paper"],
    previous_membership_revision: null, membership_revision: "TEST_ONLY-membership", effective_at_ms: now - 1000,
    expires_at_ms: now + 60000, outcome: "ACCEPTED", payload_digest: accessDigest("TEST_ONLY-payload"),
    provenance_ref: "TEST_ONLY-not-a-source-proof", policy_revision: "TEST_ONLY-policy", policy_artifact_digest: accessDigest("TEST_ONLY-policy"),
    policy_install_digest: accessDigest("TEST_ONLY-install"), approval_ref: "TEST_ONLY-not-owner-approval", grant_id: "TEST_ONLY-grant",
    grant_digest: accessDigest("TEST_ONLY-grant"), expected_grant_revision: "TEST_ONLY-grant-revision" };
}
function proof(fact = sample()): QualifiedRootMembershipReceipt {
  return { fact, mapping: { ts_user_id: fact.ts_user_id, revision: fact.mapping_revision },
    membership: { revision: fact.membership_revision, receipt_id: fact.receipt_id, mapping_revision: fact.mapping_revision },
    assertCurrent() {}, release: vi.fn(async () => {}) };
}

describe("ELP2-10 private root receipt qualification", () => {
  it("has no default verifier and does not connect to Core", async () => {
    const connect = vi.fn(), pool = { connect } as unknown as Pool;
    await expect(acceptRootMembershipReceipt(pool, undefined, {})).rejects.toMatchObject({ code: "RECEIPT_NOT_QUALIFIED", status: 503 });
    await expect(acceptRootMembershipReceipt(pool, async () => null, {})).rejects.toMatchObject({ code: "RECEIPT_NOT_QUALIFIED" });
    expect(connect).not.toHaveBeenCalled();
  });
  it("the actual service fails closed with either default or missing optional root provider", async () => {
    const connect = vi.fn(), pool = { connect } as unknown as Pool;
    const missing: AccessTrustProvider = { ...unqualifiedAccessTrust }; delete missing.verifyRootReceipt;
    for (const trust of [undefined, missing]) {
      const service = new ExecutionAccessService(pool, {} as AuthService, trust);
      await expect(service.acceptRootTsReceipt({ role: "ADMIN" })).rejects.toMatchObject({ code: "RECEIPT_NOT_QUALIFIED", status: 503 });
    }
    expect(connect).not.toHaveBeenCalled();
  });
  it("rejects ordinary proposal-shaped JSON and releases a malformed normalized fact", async () => {
    const lease = proof(), pool = { connect: vi.fn() } as unknown as Pool;
    Object.assign(lease.fact, { proposal_id: "ordinary", proposal_digest: accessDigest("ordinary") });
    expect(tsRootMembershipAcceptance.safeParse(lease.fact).success).toBe(false);
    await expect(acceptRootMembershipReceipt(pool, async () => lease, {})).rejects.toMatchObject({ code: "RECEIPT_BINDING_MISMATCH" });
    expect(lease.release).toHaveBeenCalledOnce();
    expect(pool.connect).not.toHaveBeenCalled();
  });
  it("refuses an async current-source guard before taking any Core connection", async () => {
    const lease = proof(), connect = vi.fn();
    lease.assertCurrent = (async () => { throw new Error("TEST_ONLY revoked asynchronously"); }) as unknown as () => void;
    await expect(acceptRootMembershipReceipt({ connect } as unknown as Pool, async () => lease, {}))
      .rejects.toMatchObject({ code: "RECEIPT_NOT_QUALIFIED" });
    expect(connect).not.toHaveBeenCalled(); expect(lease.release).toHaveBeenCalledOnce();
  });
  it.each(["mapping", "membership"] as const)("refuses unbound %s before Core", async key => {
    const lease = proof(), connect = vi.fn();
    if (key === "mapping") lease.mapping.revision = "TEST_ONLY-other-mapping";
    else lease.membership = null;
    await expect(acceptRootMembershipReceipt({ connect } as unknown as Pool, async () => lease, {}))
      .rejects.toMatchObject({ code: key === "mapping" ? "RECEIPT_BINDING_MISMATCH" : "TS_MEMBERSHIP_REVISION_CONFLICT" });
    expect(connect).not.toHaveBeenCalled(); expect(lease.release).toHaveBeenCalledOnce();
  });
  it("refuses a coordinator on another Core pool before consulting the source", async () => {
    const verify = vi.fn(async () => proof()), connect = vi.fn();
    const coordinator = { usesPool: () => false } as unknown as CurrentHumanMutations;
    await expect(acceptRootMembershipReceipt({ connect } as unknown as Pool, verify, {}, true, coordinator))
      .rejects.toMatchObject({ code: "RECEIPT_NOT_QUALIFIED", status: 503 });
    expect(verify).not.toHaveBeenCalled(); expect(connect).not.toHaveBeenCalled();
  });
});

describe.skipIf(!DATABASE_URL)("ELP2-10 exact root receipt through reviewed policy installation, disposable PG", () => {
  let ctx: Awaited<ReturnType<typeof setupApp>>, auth: AuthService, owner: string, other: string;
  beforeAll(async () => {
    await migrateTestDatabase(DATABASE_URL!); ctx = await setupApp({ DATABASE_URL: DATABASE_URL! });
    auth = ctx.app.get(AuthService); owner = next("owner"); other = next("subject");
    // Deliberately USER, not ADMIN: the explicit protected anchor is authority.
    for (const id of [owner, other]) await ctx.pool.query(
      "INSERT INTO portal_users(user_id,username,display_name,role,status,must_change_password) VALUES($1,$1,$1,'USER','ACTIVE',false)", [id]);
    await new OwnerAccessRepository(ctx.pool).claimOwner({ userId: owner, claimedBy: "ELP210_TEST_ONLY" });
  });
  afterAll(async () => { vi.restoreAllMocks(); if (ctx) await teardownApp(ctx); });

  async function fixture(options: { target?: "owner" | "other"; action?: ScopedAccessGrant["action"]; install?: boolean; fieldPolicy?: string } = {}) {
    const workspace = next("workspace"), target = options.target === "other" ? other : owner, now = Date.now();
    await ctx.pool.query("INSERT INTO workspaces(workspace_id,name,owner_user_id) VALUES($1,'TEST_ONLY root receipt',$2)", [workspace, owner]);
    if (target !== owner) await ctx.pool.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'MEMBER')", [workspace, target]);
    const policy: ReviewedAccessPolicy = { workspace_id: workspace, revision: next("policy"), artifact_digest: accessDigest(workspace),
      approval_ref: "TEST_ONLY-independent-owner-review", state: "REVIEWED", qualification: "TEST_ONLY", protected_owner_user_id: owner,
      researcher_fields: { state: "QUALIFIED", policy_ref: "TEST_ONLY-field-policy", fields: ["portfolio_id"] } };
    const grant: ScopedAccessGrant = { grant_id: next("grant"), subject_user_id: target, workspace_id: workspace,
      action: options.action ?? "business.read_all", effect: "ALLOW", selector: { kind: "ROOT_SCOPE", root_id: "TEST_ONLY-root" },
      environments: ["paper", "sandbox"], valid_from_ms: now - 60000, valid_until_ms: now + 3600000,
      delegable_actions: [], issued_by: owner, parent_grant_id: null, revision: next("grant-revision"), policy_revision: policy.revision,
      revoked_at_ms: null, requires_ts_acceptance: true, ts_receipt: null,
      field_policy_ref: options.fieldPolicy ?? (options.action === "portfolio.read_restricted" ? policy.researcher_fields.policy_ref : null) };
    const artifact: ReviewedPolicyArtifact = { policy, root_grants: [grant], provenance_ref: "TEST_ONLY-artifact" };
    const trust: AccessTrustProvider = { verifyPolicy: async value => value === artifact ? artifact : null,
      verifyReceipt: async () => null, verifiedHumanMapping: async () => null,
      relations: async () => ({ qualified: false, revision: "UNQUALIFIED", own_alpha_ids: [], member_portfolio_ids: [], roots: {}, membership: null }) };
    const service = new ExecutionAccessService(ctx.pool, auth, trust, true);
    if (options.install !== false) await service.installReviewedPolicy(artifact);
    const fact: TsRootMembershipAcceptance = { ...sample(), portal_user_id: target, ts_user_id: `TEST_ONLY-ts:${target}`,
      human_requester_user_id: owner, workspace_id: workspace, action: grant.action,
      selector_digest: accessDigest(canonicalSelector(grant.selector)), environments: [...grant.environments], effective_at_ms: now - 1000,
      expires_at_ms: now + 600000, policy_revision: policy.revision, policy_artifact_digest: policy.artifact_digest,
      policy_install_digest: accessDigest(artifact), approval_ref: policy.approval_ref, grant_id: grant.grant_id,
      grant_digest: accessDigest(grant), expected_grant_revision: grant.revision };
    const lease = proof(fact), token = Object.freeze({ TEST_ONLY_qualified_handle: randomUUID() });
    let guardCalls = 0, onGuard: ((calls: number) => void) | undefined;
    lease.assertCurrent = () => { guardCalls++; onGuard?.(guardCalls); };
    const verify = vi.fn(async (input: unknown) => input === token ? lease : null);
    const accept = (pool = ctx.pool, testOnly = true) => acceptRootMembershipReceipt(pool, verify, token, testOnly);
    const stored = async () => (await ctx.pool.query("SELECT grant_fact FROM portal_access_grants_v2 WHERE grant_id=$1", [grant.grant_id])).rows[0]?.grant_fact as ScopedAccessGrant | undefined;
    const events = async () => Number((await ctx.pool.query("SELECT count(*) AS n FROM portal_access_policy_events WHERE workspace_id=$1 AND operation='TS_RECEIPT'", [workspace])).rows[0].n);
    return { workspace, target, policy, grant, artifact, service, lease, fact, verify, token, accept, stored, events,
      onGuard(fn: (calls: number) => void) { onGuard = fn; } };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  async function changeGrant(f: Fixture, update: Partial<ScopedAccessGrant>) {
    await new AccessRepository(ctx.pool).saveGrant({ ...f.grant, ...update });
  }

  /** This candidate and its ephemeral signing keys exist only for one test.
   * A max=1 real Core pool proves both verifier acquisition and source recovery
   * run after every Core transaction/connection has been released. */
  async function withAuthority(f: Fixture, test: (h: {
    pool: Pool; candidate: CurrentHumanCandidate; coordinator: CurrentHumanMutations;
    accept(): Promise<{ receipt: AccessReceipt; replayed: boolean }>;
    enter(): Promise<{ token: string; lease_id: string; expires_at_ms: number }>;
    sign(lease: string, phase: "ENTER" | "COMMITTED" | "ROLLED_BACK" | "UNKNOWN"): Promise<string>;
    recovery(fn: (attempt: CurrentHumanRecoveryAttempt) => Promise<unknown>): void;
    transform(fn: (lease: QualifiedRootMembershipReceipt, call: number) => void): void;
    held(): number; verify: ReturnType<typeof vi.fn>; releases(): number;
    intent(): Promise<Record<string, unknown>[]>;
  }) => Promise<void>, ttl = 30000) {
    const pool = new Pool({ connectionString: DATABASE_URL, max: 1, connectionTimeoutMillis: 2000, query_timeout: 6000 });
    const sid = next("source-session");
    try {
      await pool.query(`INSERT INTO auth_sessions(session_id,session_token_hash,user_id,state,csrf_secret_hash,
        session_version,idle_expires_at,absolute_expires_at) VALUES($1,$1,$2,'ACTIVE','TEST_ONLY',0,
        clock_timestamp()+interval '10 minutes',clock_timestamp()+interval '20 minutes')`, [sid, owner]);
      await pool.query(await readFile(join(__dirname, "../src/execution-v2/current-human-candidate.sql"), "utf8"));
      const [source, human] = await Promise.all([generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true }),
        generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true })]);
      const binding: CurrentHumanBinding = { workspace_id: f.workspace, environment: "paper",
        workload_id: "TEST_ONLY-root-provider", request_digest: accessDigest(["TEST_ONLY-root-source", sid]) };
      const config: CurrentHumanCandidateConfig = { issuer: "TEST_ONLY-portal", audience: "TEST_ONLY-pm", key_id: "TEST_ONLY-human",
        private_key: human.privateKey, source: { issuer: "TEST_ONLY-pm", audience: "TEST_ONLY-portal-authority",
          key_id: "TEST_ONLY-source", public_key: source.publicKey, workload_id: binding.workload_id },
        limits: { ttl_ms: ttl, maximum_unresolved: 3, maximum_retained: 10 } };
      const candidate = await CurrentHumanCandidate.create(pool, config);
      const sign = async (lease: string, phase: "ENTER" | "COMMITTED" | "ROLLED_BACK" | "UNKNOWN") => {
        const now = Math.floor(Date.now() / 1000), terminal = phase === "COMMITTED" || phase === "ROLLED_BACK";
        return new SignJWT({ iss: config.source.issuer, aud: config.source.audience, sub: binding.workload_id,
          jti: randomUUID(), iat: now, nbf: now, exp: now + 60, purpose: "pma.current-human-lease.v1",
          lease_id: lease, attempt_id: `TEST_ONLY-${lease}`, ...binding, phase,
          source_receipt_id: terminal ? `TEST_ONLY-terminal-${lease}` : null,
          source_receipt_digest: terminal ? accessDigest(["TEST_ONLY-terminal", lease, phase]) : null,
        }).setProtectedHeader({ alg: "EdDSA", kid: config.source.key_id, typ: "JWT" }).sign(source.privateKey);
      };
      let held = 0, releases = 0, calls = 0;
      let transform: (lease: QualifiedRootMembershipReceipt, call: number) => void = () => {};
      let recover: (attempt: CurrentHumanRecoveryAttempt) => Promise<unknown> = async () => {};
      const verify = vi.fn(async (input: unknown) => {
        if (input !== f.token) return null;
        expect(held).toBe(0); expect(pool.idleCount).toBe(pool.totalCount);
        expect((await pool.query("SELECT 1 AS source_outside_core")).rows[0].source_outside_core).toBe(1);
        const lease = proof(structuredClone(f.fact)); held++;
        lease.assertCurrent = () => { expect(held).toBe(1); };
        lease.release = vi.fn(async () => {
          expect(pool.idleCount).toBe(pool.totalCount);
          expect((await pool.query("SELECT 1 AS release_after_core")).rows[0].release_after_core).toBe(1);
          held--; releases++;
        });
        transform(lease, ++calls);
        return lease;
      });
      const coordinator = new CurrentHumanMutations(pool, candidate, { recover: async attempt => {
        expect(held).toBe(0); expect(pool.idleCount).toBe(pool.totalCount);
        expect((await pool.query("SELECT 1 AS recovery_outside_core")).rows[0].recovery_outside_core).toBe(1);
        return recover(attempt);
      } }, { maximum_intents: 8, maximum_recoveries_per_request: 3 });
      await test({ pool, candidate, coordinator, verify, sign,
        accept: () => acceptRootMembershipReceipt(pool, verify, f.token, true, coordinator),
        enter: async () => {
          const lease = await candidate.issue({ user_id: owner, session_id: sid, session_generation: 0 }, binding);
          await candidate.enter(lease.token, await sign(lease.lease_id, "ENTER")); return lease;
        }, recovery(fn) { recover = fn; }, transform(fn) { transform = fn; }, held: () => held, releases: () => releases,
        intent: async () => (await pool.query("SELECT * FROM elp210_candidate.mutations ORDER BY mutation_id")).rows });
      expect(held).toBe(0);
    } finally {
      // Exact disposable candidate only; never the shared preview schema.
      await pool.query("DROP SCHEMA IF EXISTS elp210_candidate CASCADE");
      await pool.query("DELETE FROM auth_sessions WHERE session_id=$1", [sid]);
      await pool.end();
    }
  }

  it.each(["owner", "other"] as const)("activates the explicitly approved pending %s root, not an ADMIN preset", async target => {
    const f = await fixture({ target });
    const installed = await new AccessRepository(ctx.pool).policyInstall(f.workspace, f.policy.revision);
    expect(installed!.after_fact).toMatchObject({ root_grant_digests: [{ grant_id: f.grant.grant_id, grant_digest: accessDigest(f.grant) }] });
    expect((await f.stored())!.ts_receipt).toBeNull();
    const release = vi.fn(async () => { expect((await f.stored())!.ts_receipt?.receipt_id).toBe(f.fact.receipt_id); });
    f.lease.release = release;
    const result = await f.accept(), stored = (await f.stored())!;
    expect(result).toMatchObject({ replayed: false, receipt: { proposal_id: null, grant_id: f.grant.grant_id, outcome: "TS_APPLIED" } });
    expect(release).toHaveBeenCalledOnce(); expect(await f.events()).toBe(1);
    expect(grantCurrent(stored, { principal_id: f.target, workspace_id: f.workspace, now_ms: Date.now(), actor_current: true,
      policy: f.policy, grants: [stored], active_principals: new Set([owner, other]), allow_test_only: true,
      relationsFor: () => ({ qualified: true, revision: "TEST_ONLY-current", own_alpha_ids: [], member_portfolio_ids: [], roots: {}, membership: f.lease.membership }) })).toBe(true);
  });
  it("exact source replay is historical and cannot reactivate a later revoked root", async () => {
    const f = await fixture(), first = await f.accept(), accepted = (await f.stored())!;
    await new AccessRepository(ctx.pool).saveGrant({ ...accepted, revision: next("revoked-revision"), revoked_at_ms: Date.now() });
    expect(await f.accept()).toEqual({ receipt: first.receipt, replayed: true });
    expect((await f.stored())!.revoked_at_ms).not.toBeNull(); expect(await f.events()).toBe(1);
  });
  it("same source id with changed context conflicts rather than overwriting the immutable receipt", async () => {
    const f = await fixture(); await f.accept(); f.fact.payload_digest = accessDigest("changed");
    await expect(f.accept()).rejects.toMatchObject({ code: "RECEIPT_PAYLOAD_CONFLICT", status: 409 });
    expect(await f.events()).toBe(1);
  });
  it.each(["REJECTED", "UNKNOWN"] as const)("records %s without an effective business grant", async outcome => {
    const f = await fixture(); f.fact.outcome = outcome;
    const result = await f.accept();
    expect(result.receipt.outcome).toBe(outcome === "REJECTED" ? "TS_REJECTED" : "TS_UNKNOWN");
    expect((await f.stored())!.ts_receipt).toBeNull(); expect(await f.events()).toBe(1);
  });
  it("does not accept a TEST_ONLY policy when the explicit test lane is absent", async () => {
    const f = await fixture(); await expect(f.accept(ctx.pool, false)).rejects.toMatchObject({ code: "RECEIPT_NOT_QUALIFIED" });
    expect((await f.stored())!.ts_receipt).toBeNull(); expect(await f.events()).toBe(0);
  });
  it("does not accept a root without a real policy installation", async () => {
    const f = await fixture({ install: false }); await expect(f.accept()).rejects.toMatchObject({ code: "RECEIPT_NOT_QUALIFIED" });
    expect(await f.events()).toBe(0);
  });
  it("refuses an immutable historical install lacking root digests without rewriting its evidence", async () => {
    const f = await fixture({ install: false }), repo = new AccessRepository(ctx.pool), eventId = next("historical-install");
    // Synthetic old-format installation, not an UPDATE of an immutable event.
    // This negative fixture intentionally predates the root digest field.
    await repo.putPolicy(f.policy); await repo.saveGrant(f.grant, true);
    await repo.event({ event_id: eventId, workspace_id: f.workspace, actor_user_id: owner, subject_user_id: null,
      operation: "POLICY_INSTALL", key_digest: null, request_digest: accessDigest(f.artifact), policy_revision: f.policy.revision,
      grant_id: null, proposal_id: null, source: null, source_receipt_id: null, before_fact: null,
      after_fact: { policy: f.policy, provenance_ref: f.artifact.provenance_ref },
      receipt: { schema_version: "portal.access-operation.v1", operation_id: next("historical-operation"), proposal_id: null,
        grant_id: null, outcome: "APP_APPLIED", http_status: 200, reason_code: null, policy_revision: f.policy.revision,
        grant_revision: null, decided_at_ms: Date.now(), ts_authority: "NOT_REQUIRED" } });
    const before = await repo.policyInstall(f.workspace, f.policy.revision);
    await expect(f.accept()).rejects.toMatchObject({ code: "RECEIPT_BINDING_MISMATCH", status: 409 });
    expect(await f.stored()).toEqual(f.grant); expect(await f.events()).toBe(0);
    expect(await repo.policyInstall(f.workspace, f.policy.revision)).toEqual(before);
    expect(f.lease.release).toHaveBeenCalledOnce();
  });
  it("the actual service preserves a qualified root verifier's this binding", async () => {
    const f = await fixture();
    const trust = { ...unqualifiedAccessTrust, expectedInput: f.token, lease: f.lease,
      async verifyRootReceipt(input: unknown) { return input === this.expectedInput ? this.lease : null; } };
    const verify = vi.spyOn(trust, "verifyRootReceipt");
    const service = new ExecutionAccessService(ctx.pool, auth, trust, true);
    expect((await service.acceptRootTsReceipt(f.token)).receipt.outcome).toBe("TS_APPLIED");
    expect(verify).toHaveBeenCalledWith(f.token); expect((await f.stored())!.ts_receipt?.receipt_id).toBe(f.fact.receipt_id);
    expect(f.lease.release).toHaveBeenCalledOnce(); expect(await f.events()).toBe(1);
  });
  it.each(["policy_revision", "policy_artifact_digest", "policy_install_digest", "approval_ref", "grant_digest", "expected_grant_revision",
    "action", "selector_digest", "environments", "human_requester_user_id", "previous_membership_revision"] as const)(
    "rejects mismatched %s without changing the root or audit", async key => {
      const f = await fixture();
      const changes: Record<typeof key, unknown> = { [key]: key.endsWith("digest") ? accessDigest("TEST_ONLY-other") :
        key === "action" ? "capital.fund" : key === "environments" ? ["live"] : "TEST_ONLY-other" } as Record<typeof key, unknown>;
      Object.assign(f.fact, changes);
      await expect(f.accept()).rejects.toMatchObject({ code: "RECEIPT_BINDING_MISMATCH" });
      expect((await f.stored())!.ts_receipt).toBeNull(); expect(await f.events()).toBe(0); expect(f.lease.release).toHaveBeenCalledOnce();
    });
  it.each(["parent_grant_id", "requires_ts_acceptance", "effect", "revoked_at_ms", "field_policy_ref"] as const)(
    "cannot elevate a changed or delegated root via %s", async key => {
      const f = await fixture();
      const update = key === "parent_grant_id" ? { parent_grant_id: f.grant.grant_id } : key === "requires_ts_acceptance" ? { requires_ts_acceptance: false } :
        key === "effect" ? { effect: "DENY" as const } : key === "revoked_at_ms" ? { revoked_at_ms: Date.now() } : { field_policy_ref: "TEST_ONLY-other-policy" };
      await changeGrant(f, update);
      // Even if a verifier knows changed bytes, they are not the reviewed root.
      f.fact.grant_digest = accessDigest((await f.stored())!);
      await expect(f.accept()).rejects.toMatchObject({ code: "RECEIPT_BINDING_MISMATCH" });
      expect((await f.stored())!.ts_receipt).toBeNull(); expect(await f.events()).toBe(0);
    });
  it("the installed field policy must still match a restricted root", async () => {
    const f = await fixture({ action: "portfolio.read_restricted" });
    const changed = { ...f.policy, researcher_fields: { ...f.policy.researcher_fields, policy_ref: "TEST_ONLY-changed-field-policy" } };
    await new AccessRepository(ctx.pool).putPolicy(changed);
    await expect(f.accept()).rejects.toMatchObject({ code: "RECEIPT_BINDING_MISMATCH" });
    expect(await f.events()).toBe(0);
  });
  it("permits an independently approved manager field policy distinct from researcher fields", async () => {
    const f = await fixture({ fieldPolicy: "TEST_ONLY-manager-business-policy" });
    expect((await f.accept()).receipt.outcome).toBe("TS_APPLIED");
    expect((await f.stored())!.field_policy_ref).toBe("TEST_ONLY-manager-business-policy");
  });
  it("does not bootstrap a root while the anchored owner is disabled", async () => {
    const f = await fixture({ target: "other" });
    try {
      await ctx.pool.query("UPDATE portal_users SET status='DISABLED' WHERE user_id=$1", [owner]);
      await expect(f.accept()).rejects.toMatchObject({ code: "CURRENT_ACTOR_AUTHORITY_REQUIRED" });
      expect((await f.stored())!.ts_receipt).toBeNull(); expect(await f.events()).toBe(0);
    } finally { await ctx.pool.query("UPDATE portal_users SET status='ACTIVE' WHERE user_id=$1", [owner]); }
  });
  it.each(["disabled", "archived", "password-change", "member-removed"] as const)("rejects a %s subject before writing", async state => {
    const f = await fixture({ target: "other" });
    try {
      if (state === "member-removed") await ctx.pool.query("DELETE FROM workspace_members WHERE workspace_id=$1 AND user_id=$2", [f.workspace, other]);
      else if (state === "disabled") await ctx.pool.query("UPDATE portal_users SET status='DISABLED' WHERE user_id=$1", [other]);
      else if (state === "archived") await ctx.pool.query("UPDATE portal_users SET status='DISABLED',archived_at=clock_timestamp() WHERE user_id=$1", [other]);
      else await ctx.pool.query("UPDATE portal_users SET must_change_password=true WHERE user_id=$1", [other]);
      await expect(f.accept()).rejects.toMatchObject({ code: "CURRENT_ACTOR_AUTHORITY_REQUIRED" });
      expect((await f.stored())!.ts_receipt).toBeNull(); expect(await f.events()).toBe(0);
    } finally { await ctx.pool.query("UPDATE portal_users SET status='ACTIVE',archived_at=NULL,must_change_password=false WHERE user_id=$1", [other]); }
  });
  it.each(["expired", "future", "outside-grant"] as const)("refuses a %s receipt interval", async state => {
    const f = await fixture();
    if (state === "expired") f.fact.expires_at_ms = Date.now() - 1;
    else if (state === "future") f.fact.effective_at_ms = Date.now() + 60000;
    else f.fact.expires_at_ms = f.grant.valid_until_ms! + 1;
    await expect(f.accept()).rejects.toMatchObject({ code: "RECEIPT_REVISION_CONFLICT" });
    expect((await f.stored())!.ts_receipt).toBeNull(); expect(await f.events()).toBe(0);
  });
  it("holds the provider fence through final writes and rolls back if it is revoked", async () => {
    const f = await fixture();
    f.onGuard(calls => { if (calls === 3) throw new Error("TEST_ONLY authority revoked after INSERT"); });
    await expect(f.accept()).rejects.toMatchObject({ code: "RECEIPT_NOT_QUALIFIED" });
    expect((await f.stored())!.ts_receipt).toBeNull(); expect(await f.events()).toBe(0); expect(f.lease.release).toHaveBeenCalledOnce();
  });
  it("refuses expiry after an awaited write and rolls the entire transaction back", async () => {
    const f = await fixture(); f.fact.expires_at_ms = Date.now() + 2000;
    const pool = { connect: async () => {
      const client = await ctx.pool.connect(), query = client.query.bind(client);
      return { query: async (text: string, values?: unknown[]) => {
        const result = await query(text, values);
        if (text.startsWith("INSERT INTO portal_access_policy_events")) {
          const time = Number((await query("SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS ms")).rows[0].ms);
          await query("SELECT pg_sleep($1)", [Math.max(0, f.fact.expires_at_ms! - time + 20) / 1000]);
        }
        return result;
      }, release: () => client.release() } as unknown as PoolClient;
    } } as unknown as Pool;
    await expect(f.accept(pool)).rejects.toMatchObject({ code: "RECEIPT_REVISION_CONFLICT" });
    expect((await f.stored())!.ts_receipt).toBeNull(); expect(await f.events()).toBe(0);
  });
  it("release follows COMMIT and Core connection release, not merely the last INSERT", async () => {
    const f = await fixture(); let committed = false, returned = false;
    const pool = { connect: async () => {
      const client = await ctx.pool.connect(), query = client.query.bind(client);
      return { query: async (text: string, values?: unknown[]) => { const result = await query(text, values); if (text === "COMMIT") committed = true; return result; },
        release() { returned = true; client.release(); } } as unknown as PoolClient;
    } } as unknown as Pool;
    f.lease.release = vi.fn(async () => { expect(committed).toBe(true); expect(returned).toBe(true); });
    await f.accept(pool); expect(f.lease.release).toHaveBeenCalledOnce();
  });
  it("release failure reports an uncertain acknowledgement; exact retry does not double apply", async () => {
    const f = await fixture(); f.lease.release = vi.fn(async () => { throw new Error("TEST_ONLY release lost"); });
    await expect(f.accept()).rejects.toMatchObject({ code: "ACCESS_RETRY_REQUIRED", status: 503 });
    const accepted = await f.stored(); expect(accepted!.ts_receipt).not.toBeNull(); expect(await f.events()).toBe(1);
    f.lease.release = vi.fn(async () => {});
    expect((await f.accept()).replayed).toBe(true); expect(await f.stored()).toEqual(accepted); expect(await f.events()).toBe(1);
  });
  it("post-COMMIT provider fence failure is an uncertain acknowledgement with an immutable receipt", async () => {
    const f = await fixture(); f.onGuard(calls => { if (calls === 4) throw new Error("TEST_ONLY post-COMMIT fence unavailable"); });
    await expect(f.accept()).rejects.toMatchObject({ code: "ACCESS_RETRY_REQUIRED", status: 503 });
    const committed = await f.stored(); expect(committed!.ts_receipt).not.toBeNull(); expect(await f.events()).toBe(1);
    f.onGuard(() => {}); expect((await f.accept()).replayed).toBe(true);
    expect(await f.stored()).toEqual(committed); expect(await f.events()).toBe(1);
  });
  it("an accidental async guard on the final fence also rolls back all writes", async () => {
    const f = await fixture(); let calls = 0;
    f.lease.assertCurrent = (() => { if (++calls === 3) return Promise.resolve(); }) as () => void;
    await expect(f.accept()).rejects.toMatchObject({ code: "RECEIPT_NOT_QUALIFIED" });
    expect((await f.stored())!.ts_receipt).toBeNull(); expect(await f.events()).toBe(0);
  });
  it("mutable provider references cannot rebind the detached fact during Core work", async () => {
    const f = await fixture(), original = f.fact.receipt_id;
    f.onGuard(calls => { if (calls === 1) { f.fact.receipt_id = next("mutated"); f.lease.mapping.ts_user_id = "TEST_ONLY-other"; } });
    const result = await f.accept();
    expect(result.receipt.outcome).toBe("TS_APPLIED"); expect((await f.stored())!.ts_receipt?.receipt_id).toBe(original);
  });
  it("a provider refusal is redacted and never creates an event", async () => {
    const f = await fixture(); f.onGuard(() => { throw new AccessPolicyError("ACCESS_DENIED"); });
    await expect(f.accept()).rejects.toMatchObject({ code: "RECEIPT_NOT_QUALIFIED" }); expect(await f.events()).toBe(0);
  });

  it("coordinated root intake keeps an expired source UNKNOWN pending, without borrowing a human session", async () => {
    const f = await fixture();
    await withAuthority(f, async h => {
      const lease = await h.enter();
      await h.candidate.resolve(await h.sign(lease.lease_id, "UNKNOWN"));
      await expect(h.accept()).rejects.toMatchObject({ code: "ACCESS_RETRY_REQUIRED", status: 503 });
      const first = (await h.intent())[0];
      await h.pool.query("SELECT pg_sleep(GREATEST(0,($1::bigint-floor(extract(epoch FROM clock_timestamp())*1000))/1000.0)+0.05)", [lease.expires_at_ms]);
      await expect(h.accept()).rejects.toMatchObject({ code: "ACCESS_RETRY_REQUIRED", status: 503 });
      expect(await h.intent()).toMatchObject([{ mutation_id: first.mutation_id, family: "QUALIFIED_ROOT_RECEIPT", state: "PENDING",
        actor_id: null, session_id: null, session_revision: null }]);
      expect((await h.pool.query("SELECT phase FROM elp210_candidate.leases WHERE lease_id=$1", [lease.lease_id])).rows[0].phase).toBe("UNKNOWN");
      expect((await f.stored())!.ts_receipt).toBeNull(); expect(await f.events()).toBe(0); expect(h.held()).toBe(0);
    }, 2000);
  });
  it.each(["COMMITTED", "ROLLED_BACK"] as const)("releases initial qualification before signed %s recovery and reacquires outside a one-connection Core pool", async phase => {
    const f = await fixture();
    await withAuthority(f, async h => {
      const lease = await h.enter();
      await expect(h.accept()).rejects.toMatchObject({ code: "ACCESS_RETRY_REQUIRED", status: 503 });
      const pending = (await h.intent())[0];
      const recover = vi.fn(async (attempt: CurrentHumanRecoveryAttempt) => {
        expect(attempt.lease_id).toBe(lease.lease_id); expect(h.held()).toBe(0);
        return h.candidate.resolve(await h.sign(attempt.lease_id, phase));
      });
      h.recovery(recover);
      const result = await h.accept(), stored = await f.stored();
      expect(result).toMatchObject({ replayed: false, receipt: { outcome: "TS_APPLIED" } });
      expect(stored!.ts_receipt?.receipt_id).toBe(f.fact.receipt_id);
      expect(await h.intent()).toMatchObject([{ mutation_id: pending.mutation_id, family: "QUALIFIED_ROOT_RECEIPT", state: "FINISHED",
        actor_id: null, session_id: null, session_revision: null,
        terminal_digest: accessDigest({ outcome: "APPLIED", receipt_ref: result.receipt.operation_id, reason_code: null }) }]);
      expect(recover).toHaveBeenCalledOnce(); expect(h.pool.totalCount).toBe(1);
      expect(h.verify).toHaveBeenCalledTimes(3); expect(h.releases()).toBe(3); expect(await f.events()).toBe(1);
      expect(await h.accept()).toEqual({ receipt: result.receipt, replayed: true });
      expect(await f.stored()).toEqual(stored); expect(await f.events()).toBe(1); expect(recover).toHaveBeenCalledOnce();
    });
  });
  it("a changed payload under a pending source receipt is a permanent conflict, not a recovery retry", async () => {
    const f = await fixture();
    await withAuthority(f, async h => {
      const lease = await h.enter();
      await expect(h.accept()).rejects.toMatchObject({ code: "ACCESS_RETRY_REQUIRED", status: 503 });
      const pending = await h.intent(), grant = await f.stored();
      const authority = (await h.pool.query("SELECT * FROM elp210_candidate.authority WHERE singleton")).rows;
      const recover = vi.fn(async () => {}); h.recovery(recover);
      f.fact.payload_digest = accessDigest("TEST_ONLY-pending-payload-change");
      await expect(h.accept()).rejects.toMatchObject({ code: "RECEIPT_PAYLOAD_CONFLICT", status: 409 });
      expect(await h.intent()).toEqual(pending); expect(recover).not.toHaveBeenCalled();
      expect((await h.pool.query("SELECT * FROM elp210_candidate.authority WHERE singleton")).rows).toEqual(authority);
      expect((await h.pool.query("SELECT phase FROM elp210_candidate.leases WHERE lease_id=$1", [lease.lease_id])).rows[0].phase).toBe("ENTERED");
      expect(await f.stored()).toEqual(grant); expect(await f.events()).toBe(0); expect(h.held()).toBe(0);
    });
  });
  it.each(["fact", "mapping", "membership"] as const)("rejects changed %s on post-recovery qualification without changing a grant or replacing the intent", async part => {
    const f = await fixture();
    await withAuthority(f, async h => {
      h.transform((lease, call) => {
        if (call !== 2) return;
        if (part === "fact") lease.fact.payload_digest = accessDigest("TEST_ONLY-changed-after-recovery");
        else if (part === "mapping") lease.mapping.revision = "TEST_ONLY-other-current-mapping";
        else lease.membership = { ...lease.membership!, revision: "TEST_ONLY-other-current-membership" };
      });
      await expect(h.accept()).rejects.toMatchObject({ code: "RECEIPT_BINDING_MISMATCH", status: 409 });
      const pending = (await h.intent())[0];
      expect(pending.state).toBe("PENDING"); expect(h.releases()).toBe(2); expect(h.held()).toBe(0);
      expect((await f.stored())!.ts_receipt).toBeNull(); expect(await f.events()).toBe(0);
      h.transform(() => {});
      expect((await h.accept()).receipt.outcome).toBe("TS_APPLIED");
      expect(await h.intent()).toMatchObject([{ mutation_id: pending.mutation_id, state: "FINISHED" }]);
      expect(await f.events()).toBe(1);
    });
  });
  it("authenticates an old source receipt read-only despite a later Core revoke and policy, without draining unrelated UNKNOWN work", async () => {
    const f = await fixture({ target: "other" }), original = await f.accept(), accepted = (await f.stored())!;
    const revoked = { ...accepted, revision: next("revoked"), revoked_at_ms: Date.now() };
    await new AccessRepository(ctx.pool).saveGrant(revoked);
    await new AccessRepository(ctx.pool).putPolicy({ ...f.policy, revision: next("newer-policy") });
    await withAuthority(f, async h => {
      const lease = await h.enter(); await h.candidate.resolve(await h.sign(lease.lease_id, "UNKNOWN"));
      const authority = (await h.pool.query("SELECT * FROM elp210_candidate.authority WHERE singleton")).rows;
      const recovery = vi.fn(async () => {}); h.recovery(recovery);
      expect(await h.accept()).toEqual({ receipt: original.receipt, replayed: true });
      expect(await h.intent()).toEqual([]); expect(recovery).not.toHaveBeenCalled();
      expect((await h.pool.query("SELECT * FROM elp210_candidate.authority WHERE singleton")).rows).toEqual(authority);
      expect((await h.pool.query("SELECT phase FROM elp210_candidate.leases WHERE lease_id=$1", [lease.lease_id])).rows[0].phase).toBe("UNKNOWN");
      expect(await f.stored()).toEqual(revoked); expect(await f.events()).toBe(1);
      // Historical Core authority is not rechecked, but this adapter still
      // requires its provider to authenticate the old immutable fact. A
      // revoked/unavailable provider never becomes a browser-only replay.
      h.transform(lease => { lease.assertCurrent = () => { throw new Error("TEST_ONLY-source-unavailable"); }; });
      await expect(h.accept()).rejects.toMatchObject({ code: "RECEIPT_NOT_QUALIFIED", status: 503 });
      expect(await h.intent()).toEqual([]); expect(await f.stored()).toEqual(revoked); expect(await f.events()).toBe(1);
    });
  });
  it("a changed immutable source id conflicts without a new intent or recovery", async () => {
    const f = await fixture(); await f.accept(); f.fact.payload_digest = accessDigest("TEST_ONLY-historical-payload-change");
    await withAuthority(f, async h => {
      const recover = vi.fn(async () => {}); h.recovery(recover);
      await expect(h.accept()).rejects.toMatchObject({ code: "RECEIPT_PAYLOAD_CONFLICT", status: 409 });
      expect(await h.intent()).toEqual([]); expect(recover).not.toHaveBeenCalled();
      expect(h.releases()).toBe(1); expect(await f.events()).toBe(1);
    });
  });
  it("holds the reacquired fence through writes and rolls back both grant and source receipt if it changes", async () => {
    const f = await fixture();
    await withAuthority(f, async h => {
      let valid = true;
      h.transform(lease => { lease.assertCurrent = () => { if (!valid) throw new Error("TEST_ONLY-revoked-during-Core"); }; });
      const original = AccessRepository.prototype.event;
      const spy = vi.spyOn(AccessRepository.prototype, "event").mockImplementation(async function (this: AccessRepository, event) {
        await original.call(this, event); if (event.operation === "TS_RECEIPT") valid = false;
      });
      try {
        await expect(h.accept()).rejects.toMatchObject({ code: "RECEIPT_NOT_QUALIFIED", status: 503 });
        expect((await f.stored())!.ts_receipt).toBeNull(); expect(await f.events()).toBe(0);
        expect(await h.intent()).toMatchObject([{ state: "PENDING" }]); expect(h.releases()).toBe(2);
      } finally { spy.mockRestore(); }
      valid = true; expect((await h.accept()).receipt.outcome).toBe("TS_APPLIED"); expect(await f.events()).toBe(1);
    });
  });
  it("a reacquired release failure preserves the committed immutable result and retry cannot apply twice", async () => {
    const f = await fixture();
    await withAuthority(f, async h => {
      h.transform((lease, call) => {
        if (call !== 2) return;
        const release = lease.release.bind(lease);
        lease.release = async () => { await release(); throw new Error("TEST_ONLY-release-ack-lost"); };
      });
      await expect(h.accept()).rejects.toMatchObject({ code: "ACCESS_RETRY_REQUIRED", status: 503 });
      const accepted = await f.stored();
      expect(accepted!.ts_receipt).not.toBeNull(); expect(await h.intent()).toMatchObject([{ state: "FINISHED" }]);
      expect((await h.accept()).replayed).toBe(true); expect(await f.stored()).toEqual(accepted); expect(await f.events()).toBe(1);
    });
  });
});
