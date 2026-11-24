/** TEST_ONLY pure vectors and scripted SQL boundaries. These are not runtime,
 * PostgreSQL, source qualification or owner acceptance receipts. */
import type { Pool, PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";
import { AuthService } from "../src/auth/auth.service";
import { CurrentHumanMutations } from "../src/execution-v2/current-human-mutations";
import { accessDigest } from "../src/execution-v2/access-digest";
import type { ScopedAccessGrant, ReviewedAccessPolicy } from "../src/execution-v2/access.contract";
import { OrdinaryProfileAuthority, OrdinaryProfileAuthorityRepository, ordinaryAuthorityStateDigest,
  readPinnedOrdinaryProfileInstall, selectOrdinaryProfileGrant } from "../src/execution-v2/ordinary-profile-authority";
import { ordinaryDelegateRequest, ordinaryProfileGrant, ordinaryRevokeRequest, OrdinaryProfileAuthorityError }
  from "../src/execution-v2/ordinary-profile-authority.contract";
import { CHILD, DOMAIN, NOW, OWNER, STAN, WS, ordinaryFixture } from "./ordinary-profile-authority-fixture";

describe("ordinary READ authority, independent of native and legacy policy", () => {
  it("selects owner, administrator and bounded child through one exact chain", () => {
    const { c, owner, stan, child } = ordinaryFixture();
    expect(selectOrdinaryProfileGrant(c, OWNER, "paper", DOMAIN)).toEqual(owner);
    expect(selectOrdinaryProfileGrant(c, STAN, "paper", DOMAIN.profile_id)).toEqual(stan);
    expect(selectOrdinaryProfileGrant(c, CHILD, "paper", DOMAIN)).toEqual(child);
    expect(c.current.policy).toBeNull();
  });
  it.each(["owner", "administrator", "child"])("inactive %s fails closed without role inference", kind => {
    const { c } = ordinaryFixture(); c.active.delete(kind === "owner" ? OWNER : kind === "administrator" ? STAN : CHILD);
    expect(selectOrdinaryProfileGrant(c, CHILD, "paper", DOMAIN)).toBeNull();
  });
  it.each(["revoke-parent", "revoke-child", "expired-parent", "future-parent", "missing-parent", "cycle", "wrong-issuer",
    "no-delegation", "no-owner-coverage", "wide-window", "wrong-field-policy", "cross-workspace"])("refuses %s", change => {
    const { c, owner, stan, child } = ordinaryFixture();
    if (change === "revoke-parent" || change === "revoke-child") {
      const g = change === "revoke-parent" ? stan : child;
      c.state.revocations.push({ grant_id: g.grant_id, revision: g.revision, digest: accessDigest(g) });
    }
    if (change === "expired-parent") stan.valid_until_ms = NOW;
    if (change === "future-parent") stan.valid_from_ms = NOW + 1;
    if (change === "missing-parent") child.parent_grant_id = "TEST_ONLY-missing";
    if (change === "cycle") stan.parent_grant_id = child.grant_id;
    if (change === "wrong-issuer") child.issued_by = OWNER;
    if (change === "no-delegation") stan.delegable_actions = [];
    if (change === "no-owner-coverage") owner.valid_until_ms = NOW + 1;
    if (change === "wide-window") child.valid_until_ms = stan.valid_until_ms + 1;
    if (change === "wrong-field-policy") child.field_policy_ref = "TEST_ONLY-other";
    if (change === "cross-workspace") child.workspace_id = "TEST_ONLY-other";
    expect(selectOrdinaryProfileGrant(c, CHILD, "paper", DOMAIN)).toBeNull();
  });
  it("keeps environment and each Paper profile separate and refuses overlapping ambiguous seals", () => {
    const { c, seal } = ordinaryFixture();
    expect(selectOrdinaryProfileGrant(c, CHILD, "live", DOMAIN)).toBeNull();
    expect(selectOrdinaryProfileGrant(c, CHILD, "paper", { ...DOMAIN, profile_id: "TEST_ONLY_OTHER_PAPER" })).toBeNull();
    c.state.head.profile_seals.push({ ...seal, domain: { ...DOMAIN, catalogue_sha256: "e".repeat(64) } });
    expect(selectOrdinaryProfileGrant(c, CHILD, "paper", DOMAIN.profile_id)).toBeNull();
    expect(selectOrdinaryProfileGrant(c, CHILD, "paper", DOMAIN)?.subject_user_id).toBe(CHILD);
  });
  it("intersects a current legacy DENY conservatively, preserving its original revision", () => {
    const { c, child } = ordinaryFixture();
    c.current.policy = { workspace_id: WS, revision: "TEST_ONLY-legacy-r1" } as ReviewedAccessPolicy;
    const deny: ScopedAccessGrant = { grant_id: "TEST_ONLY-deny", subject_user_id: CHILD, issued_by: OWNER, workspace_id: WS,
      parent_grant_id: null, revision: "TEST_ONLY-deny-r1", policy_revision: c.current.policy.revision, action: "alpha.read",
      effect: "DENY", selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "ALPHA", ids: ["TEST_ONLY-alpha"] },
      environments: ["paper"], valid_from_ms: NOW - 1, valid_until_ms: NOW + 10_000, revoked_at_ms: null,
      delegable_actions: [], requires_ts_acceptance: false, ts_receipt: null, field_policy_ref: null };
    c.current.grants.push(deny); const before = structuredClone(deny);
    expect(selectOrdinaryProfileGrant(c, CHILD, "paper", DOMAIN)).toBeNull();
    expect(deny).toEqual(before);
    deny.environments = ["sandbox"];
    expect(selectOrdinaryProfileGrant(c, CHILD, "paper", DOMAIN)).toBe(child);
  });
  it("native-domain DENY also blocks a child or its administrator ancestor", () => {
    const { c, stan } = ordinaryFixture();
    c.current.policy = { workspace_id: WS, revision: "TEST_ONLY-native-r1" } as ReviewedAccessPolicy;
    c.current.manager_domain_grants.push({ ...stan, schema_version: "portal.manager-domain-grant.v1",
      delegable_actions: undefined, effect: "DENY", revoked_at_ms: null, policy_revision: c.current.policy.revision } as never);
    expect(selectOrdinaryProfileGrant(c, CHILD, "paper", DOMAIN)).toBeNull();
  });
  it("does not resurrect a child by adding a fresh administrator grant after revocation", () => {
    const { c, stan } = ordinaryFixture();
    c.state.revocations.push({ grant_id: stan.grant_id, revision: stan.revision, digest: accessDigest(stan) });
    c.state.grants.push({ ...stan, grant_id: "TEST_ONLY-renewed-stan", revision: "TEST_ONLY-renewed-r1" });
    expect(selectOrdinaryProfileGrant(c, STAN, "paper", DOMAIN)).not.toBeNull();
    expect(selectOrdinaryProfileGrant(c, CHILD, "paper", DOMAIN)).toBeNull();
  });
  it("closed ordinary facts cannot express STREAM, DENY, resource selectors or onward child delegation", () => {
    const { child } = ordinaryFixture();
    for (const override of [{ action: "stream.subscribe" }, { effect: "DENY" }, { selector: { kind: "ROOT_SCOPE", root_id: "x" } },
      { delegable_actions: ["business.read_all"] }, { domain: { ...DOMAIN, token: "TEST_ONLY_SENTINEL" } }])
      expect(ordinaryProfileGrant.safeParse({ ...child, ...override }).success).toBe(false);
    expect(ordinaryDelegateRequest.safeParse({}).success).toBe(false);
    expect(ordinaryRevokeRequest.safeParse({}).success).toBe(false);
  });
  it("state digest is stable under SQL row order, but binds every immutable fact and revocation", () => {
    const { c, child } = ordinaryFixture();
    expect(ordinaryAuthorityStateDigest(c.state.head, [...c.state.grants].reverse(), [])).toBe(c.state.digest);
    expect(ordinaryAuthorityStateDigest(c.state.head, c.state.grants, [{ grant_id: child.grant_id,
      revision: child.revision, digest: accessDigest(child) }])).not.toBe(c.state.digest);
    expect(ordinaryAuthorityStateDigest({ ...c.state.head, revision: "TEST_ONLY-other" }, c.state.grants, [])).not.toBe(c.state.digest);
  });
  it("never consults the process locale when hashing or selecting grant identities", () => {
    const { c } = ordinaryFixture();
    const locale = vi.spyOn(String.prototype, "localeCompare").mockImplementation(() => { throw new Error("TEST_ONLY_LOCALE_USED"); });
    try {
      expect(ordinaryAuthorityStateDigest(c.state.head, [...c.state.grants].reverse(), [])).toBe(c.state.digest);
      expect(selectOrdinaryProfileGrant(c, CHILD, "paper", DOMAIN)).not.toBeNull();
    } finally { locale.mockRestore(); }
  });
  it("refuses a missing/forged coordinator rather than writing through a local fallback", () => {
    const pool = {} as Pool;
    expect(() => new OrdinaryProfileAuthority(pool, undefined as never)).toThrow(OrdinaryProfileAuthorityError);
    expect(() => new OrdinaryProfileAuthority(pool, { usesPool: () => true } as never)).toThrow(OrdinaryProfileAuthorityError);
  });
  it("cannot turn supplied JSON or an unverified G2 artifact into a verified install token", async () => {
    await expect(readPinnedOrdinaryProfileInstall({ artifact_path: "/TEST_ONLY_SENTINEL", approved_sha256: "bad" } as never, NOW))
      .rejects.toMatchObject({ code: "ORDINARY_AUTHORITY_INVALID", message: "The requested ordinary profile authority is not available." });
  });
});

describe("ordinary authority SQL CAS, scripted diagnostic only", () => {
  it("compares workspace, expected revision and digest and refuses zero affected rows", async () => {
    const { c } = ordinaryFixture(), query = vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [], rowCount: 0 }));
    const repo = new OrdinaryProfileAuthorityRepository({ query } as unknown as PoolClient);
    await expect(repo.cas(c.state, { ...c.state.head, revision: "TEST_ONLY-next" }, accessDigest("next")))
      .rejects.toMatchObject({ code: "ORDINARY_AUTHORITY_REVISION_CONFLICT" });
    expect(query.mock.calls[0]?.[0]).toContain("WHERE workspace_id=$1 AND revision=$5 AND head_digest=$6");
  });
  it("never touches a legacy table while appending ordinary grants or CASing the head", async () => {
    const { c, child } = ordinaryFixture();
    const query = vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [], rowCount: 1 }));
    const repo = new OrdinaryProfileAuthorityRepository({ query } as unknown as PoolClient);
    await repo.append(child); await repo.cas(c.state, c.state.head, c.state.digest);
    for (const call of query.mock.calls) {
      expect(call[0]).not.toContain("portal_access_policy_"); expect(call[0]).not.toContain("portal_access_grants_v2");
    }
  });
});

describe("ordinary-only own-password step-up, scripted diagnostics", () => {
  function setup(options: { valid?: boolean; changed?: boolean; child?: boolean; expired?: boolean } = {}) {
    const { c } = ordinaryFixture(Date.now());
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FROM password_credentials")) return { rows: [{ credential_id: "TEST_ONLY-credential", user_id: STAN,
        password_hash: options.changed ? "TEST_ONLY-changed" : "TEST_ONLY-hash", algorithm: "argon2id", parameters_json: {} }], rowCount: 1 };
      if (sql.includes("clock_timestamp())*1000")) return { rows: [{ ms: c.now }], rowCount: 1 };
      if (sql.includes("INSERT INTO owner_step_up_grants")) return { rows: [{ expires_at: new Date(c.now + 60_000) }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    const reader = { query, release: vi.fn() }, connect = vi.fn(async () => reader);
    const pool = { connect } as unknown as Pool;
    // Actual coordinator object; no mutation is executed by this password-only
    // proof test. Candidate/source are scripted, not installation evidence.
    const coordinator = new CurrentHumanMutations(pool, { usesPool: () => true } as never,
      { recover: async () => undefined }, { maximum_intents: 8, maximum_recoveries_per_request: 1 });
    const authority = new OrdinaryProfileAuthority(pool, coordinator);
    vi.spyOn(authority as unknown as {capture:()=>Promise<typeof c>}, "capture").mockResolvedValue(c);
    if (options.expired) c.state.grants.forEach(g => { g.valid_until_ms = c.now; });
    const actor = { user_id: options.child ? CHILD : STAN, session_id: "TEST_ONLY-session", session_generation: 7 };
    const auth = Object.assign(Object.create(AuthService.prototype), { pool,
      credentials: { findPassword: vi.fn(async () => ({ passwordHash: "TEST_ONLY-hash" })) },
      argon2: { verify: vi.fn(async () => options.valid ?? true), verifyAgainstDecoy: vi.fn(async () => undefined) },
      config: { OWNER_STEP_UP_TTL_SECONDS: 60 } }) as AuthService;
    return { authority, actor, auth, query, connect, pool, coordinator };
  }
  it("composition provenance cannot be minted by copying mutable instance fields", async () => {
    const f = setup();
    expect(f.authority.usesPool(f.pool)).toBe(true);
    expect(f.authority.usesCoordinator(f.coordinator)).toBe(true);
    const forged = Object.assign(Object.create(OrdinaryProfileAuthority.prototype), { pool: f.pool, mutations: f.coordinator }) as OrdinaryProfileAuthority;
    expect(forged.usesPool(f.pool)).toBe(false); expect(forged.usesCoordinator(f.coordinator)).toBe(false);
    await expect(forged.read(f.actor, WS, "paper", DOMAIN)).rejects.toMatchObject({ code: "ORDINARY_AUTHORITY_INVALID" });
    Object.assign(f.authority, { pool: {} });
    expect(f.authority.usesPool(f.pool)).toBe(false);
    await expect(f.authority.read(f.actor, WS, "paper", DOMAIN)).rejects.toMatchObject({ code: "ORDINARY_AUTHORITY_INVALID" });
  });
  it("rejects the wrong own password before opening a transaction", async () => {
    const f = setup({ valid: false });
    await expect(f.authority.stepUp(f.actor, WS, "TEST_ONLY_PASSWORD_SENTINEL", f.auth)).rejects.toMatchObject({ code: "ORDINARY_AUTHORITY_DENIED" });
    expect(f.connect).not.toHaveBeenCalled();
  });
  it.each([{ changed: true }, { child: true }, { expired: true }])("refuses changed credentials or absent current administrator ceiling: %j", async options => {
    const f = setup(options);
    await expect(f.authority.stepUp(f.actor, WS, "TEST_ONLY_PASSWORD_SENTINEL", f.auth)).rejects.toBeDefined();
    expect(f.query.mock.calls.some(([sql]) => sql.includes("INSERT INTO owner_step_up_grants"))).toBe(false);
  });
  it("records a short own-session proof without legacy policy_seen or plaintext password", async () => {
    const f = setup();
    expect(await f.authority.stepUp(f.actor, WS, "TEST_ONLY_PASSWORD_SENTINEL", f.auth)).toMatchObject({
      schema_version: "portal.access-step-up.v1", family: "ACCESS_ADMIN", state: "ACTIVE" });
    const writes = f.query.mock.calls.filter(([sql]) => sql.includes("INSERT"));
    expect(writes).toHaveLength(1); expect(writes[0]![0]).toContain("owner_step_up_grants");
    expect(JSON.stringify(f.query.mock.calls)).not.toContain("TEST_ONLY_PASSWORD_SENTINEL");
    expect(JSON.stringify(f.query.mock.calls)).not.toContain("portal_access_policy_events");
  });
});
