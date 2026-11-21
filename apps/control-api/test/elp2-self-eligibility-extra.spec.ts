/** TEST_ONLY additional pure C3 vectors, not installed owner/source authority,
 * service/session/HTTP proof or a duplicate PostgreSQL harness.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type AccessResource, type ManagerDomainFieldSeal, type ManagerDomainGrant,
  type ScopedAccessGrant, type TsMembershipAcceptance } from "../src/execution-v2/access.contract";
import { accessDigest, canonicalSelector, type AccessRelations } from "../src/execution-v2/access-policy";
import { currentAccessRelations, grantBindingDigest } from "../src/execution-v2/access-current-relations";
import { FEATURES, eligibilityInput, eligibilityQuery, navigationInput, navigationResult,
  projectEligibility, projectNavigation, scopedText, type SelfEligibilityContext } from "../src/execution-v2/self-eligibility";
import { selfProjectionPrincipalIds, NAVIGATION_ACTIONS, MAX_SELF_SOURCE_PRINCIPALS } from "../src/execution-v2/self-eligibility";

const NOW = 1_800_000_000_000, U = "TEST_ONLY:self", OWNER = "TEST_ONLY:owner", WS = "TEST_ONLY:workspace";
const PROFILE = "TEST_ONLY:profile";
const P: AccessResource = { kind: "PORTFOLIO", id: "TEST_ONLY:portfolio" };
const B: AccessResource = { kind: "BINDING", id: "TEST_ONLY:binding" };
const V: AccessResource = { kind: "ALPHA_VERSION", id: "TEST_ONLY:version" };
const domain = { profile_id: PROFILE, catalogue_sha256: "a".repeat(64), profile_sha256: "b".repeat(64),
  field_policy_sha256: "c".repeat(64) };
function ordinary(id = "TEST_ONLY:entity", resource = P, changes: Partial<ScopedAccessGrant> = {}): ScopedAccessGrant {
  return { grant_id: id, workspace_id: WS, subject_user_id: U, issued_by: OWNER,
    action: "portfolio.read", effect: "ALLOW", selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: resource.kind, ids: [resource.id] },
    environments: ["paper"], valid_from_ms: NOW - 100, valid_until_ms: NOW + 10000,
    parent_grant_id: null, revision: "TEST_ONLY:r1", policy_revision: "TEST_ONLY:policy",
    revoked_at_ms: null, delegable_actions: [], requires_ts_acceptance: true,
    ts_receipt: { receipt_id: id + ":receipt", membership_revision: "TEST_ONLY:membership",
      mapping_revision: "TEST_ONLY:mapping", effective_at_ms: NOW - 50, expires_at_ms: NOW + 10000 },
    field_policy_ref: null, ...changes };
}
function fixture() {
  const grant: ManagerDomainGrant = { schema_version: "portal.manager-domain-grant.v1", grant_id: "TEST_ONLY:domain-grant",
    workspace_id: WS, subject_user_id: U, issued_by: OWNER, parent_grant_id: null,
    revision: "TEST_ONLY:domain:r1", policy_revision: "TEST_ONLY:policy", action: "business.read_all", effect: "ALLOW",
    environment: "paper", domain: { ...domain }, field_policy_ref: "TEST_ONLY:domain-fields",
    valid_from_ms: NOW - 100, valid_until_ms: NOW + 1000, revoked_at_ms: null };
  const seal: ManagerDomainFieldSeal = { environment: "paper", domain: { ...domain },
    field_policy_ref: grant.field_policy_ref, valid_from_ms: NOW - 200, valid_until_ms: NOW + 2000 };
  // OWNER_VERIFIED is a synthetic selector vector, NOT an installed/approved
  // policy. The test deliberately has no native/source authority at all.
  const relations = new Map<string, AccessRelations>([U, OWNER].map(id => [id, { qualified: false,
    revision: "UNQUALIFIED", own_alpha_ids: [], member_portfolio_ids: [], roots: {}, membership: null }]));
  const context: SelfEligibilityContext = { principal_id: U, workspace_id: WS, now_ms: NOW,
    actor_current: true, actor_member: true, actor_role: "USER", authority_fingerprint: "TEST_ONLY:not-real-Core",
    actor_lease_until_ms: NOW + 5000, active_principals: new Set([U, OWNER]),
    policy: { workspace_id: WS, revision: "TEST_ONLY:policy", artifact_digest: accessDigest("TEST_ONLY:artifact"),
      approval_ref: "TEST_ONLY:NOT_OWNER_APPROVAL", state: "REVIEWED", qualification: "OWNER_VERIFIED",
      protected_owner_user_id: OWNER, researcher_fields: { state: "PENDING", policy_ref: null, fields: [] },
      manager_read_domains: [seal] }, grants: [], manager_domain_grants: [grant],
    relationsFor: id => relations.get(id) ?? { qualified: false, revision: "UNQUALIFIED", own_alpha_ids: [],
      member_portfolio_ids: [], roots: {}, membership: null } };
  return { context, grant, seal, relations };
}
const query = { workspace_id: WS, environment: "paper" as const };

describe("C3 captured workspace read mode / pure TEST_ONLY vectors", () => {
  it("never infers workspace routing from an enterable SCOPED_CURRENT feature", () => {
    const f = fixture(); legacy(f, ordinary());
    const result = nav(f);
    expect(result.features.some(row => row.authority_mode === "SCOPED_CURRENT")).toBe(true);
    expect(result.current_read_mode).toBe("NOT_ESTABLISHED");
  });
  it.each(["LEGACY_COMPATIBILITY", "SCOPED_V2"] as const)("%s is metadata, not a menu grant", mode => {
    const f = fixture(); f.context.manager_domain_grants = [];
    const baseline = nav(f); f.context.current_read_mode = mode;
    const result = nav(f);
    expect(result.current_read_mode).toBe(mode);
    expect(result.features).toEqual(baseline.features);
    expect(result.features.every(row => row.state === "HIDDEN")).toBe(true);
  });
  it("requires the finite output field but rejects a browser-selected mode", () => {
    const good = nav(fixture());
    expect(navigationInput.safeParse({ ...query, current_read_mode: "SCOPED_V2" }).success).toBe(false);
    expect(navigationResult.safeParse(good).success).toBe(true);
    expect(navigationResult.safeParse({ ...good, current_read_mode: undefined }).success).toBe(false);
    expect(navigationResult.safeParse({ ...good, current_read_mode: "SCOPED_CURRENT" }).success).toBe(false);
  });
});

function nav(f: ReturnType<typeof fixture>, profile: string | undefined = PROFILE) {
  return projectNavigation(f.context, query, profile);
}
function entity(f: ReturnType<typeof fixture>, action: "portfolio.read" | "binding.read" | "alpha.read" = "portfolio.read", resource = P) {
  return projectEligibility(f.context, { ...query, resource, actions: [action] }).actions[0];
}
function legacy(f: ReturnType<typeof fixture>, grant: ScopedAccessGrant) {
  f.context.grants = [grant];
  f.relations.set(U, { qualified: true, revision: "TEST_ONLY:legacy-relation", own_alpha_ids: [],
    member_portfolio_ids: [], roots: {}, membership: { receipt_id: grant.ts_receipt!.receipt_id,
      revision: grant.ts_receipt!.membership_revision, mapping_revision: grant.ts_receipt!.mapping_revision } });
}
function versioned(f: ReturnType<typeof fixture>, grant: ScopedAccessGrant, targetUntil: number) {
  const r = grant.ts_receipt!;
  const accepted: TsMembershipAcceptance = { source: "TEST_ONLY:PM", source_contract: "TEST_ONLY:contract",
    trust_profile: "TEST_ONLY:profile", receipt_id: r.receipt_id, proposal_id: "TEST_ONLY:proposal",
    proposal_digest: accessDigest("TEST_ONLY:proposal"), portal_user_id: U, ts_user_id: "TEST_ONLY:ts-self",
    mapping_revision: r.mapping_revision, human_requester_user_id: OWNER, workspace_id: WS, action: grant.action,
    selector_digest: accessDigest(canonicalSelector(grant.selector)), environments: [...grant.environments],
    previous_membership_revision: null, membership_revision: r.membership_revision,
    effective_at_ms: r.effective_at_ms, expires_at_ms: r.expires_at_ms, outcome: "ACCEPTED",
    payload_digest: accessDigest("TEST_ONLY:payload"), provenance_ref: "TEST_ONLY:NOT_INSTALLED" };
  grant.ts_acceptance_digest = accessDigest(accepted);
  const source = currentAccessRelations.parse({ schema_version: "pma.core-current-relations.v1",
    subject_user_id: U, workspace_id: WS, ts_user_id: accepted.ts_user_id, mapping_revision: r.mapping_revision,
    resources: [{ environment: "paper", revision: "TEST_ONLY:resources", own_alpha_ids: [], member_portfolio_ids: [], roots: [] }],
    grants: [{ grant_id: grant.grant_id, binding_digest: grantBindingDigest(grant), accepted,
      targets: [{ resource: P, environment: "paper", revision: "TEST_ONLY:target",
        native_reference_digest: accessDigest("TEST_ONLY:native-leg"), valid_from_ms: NOW - 10, valid_until_ms: targetUntil }] }] });
  f.context.grants = [grant];
  f.relations.set(U, { qualified: true, revision: "TEST_ONLY:observation", own_alpha_ids: [], member_portfolio_ids: [],
    roots: {}, membership: null, current_authority: source });
}
function overCap(f: ReturnType<typeof fixture>) {
  f.context.grants = Array.from({ length: 11 }, (_, batch) => ordinary("TEST_ONLY:cap:" + batch, P, {
    selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "PORTFOLIO",
      ids: Array.from({ length: batch === 10 ? 1 : 200 }, (_, i) => "TEST_ONLY:capP:" + (batch * 200 + i)) } }));
}
beforeEach(() => { vi.spyOn(Date, "now").mockReturnValue(NOW); });
afterEach(() => { vi.restoreAllMocks(); });

describe("C3 final pure proposal extras / SYNTHETIC TEST_ONLY / NOT_RUN", () => {
  it("exact current app-domain opens only three app menus without qualifying any source or entity", () => {
    const f = fixture(), result = nav(f);
    expect(result.features.map(x => x.feature)).toEqual(FEATURES);
    expect(result.features.filter(x => x.feature !== "EXECUTION_OPERATIONS")).toEqual(
      FEATURES.filter(x => x !== "EXECUTION_OPERATIONS").map(feature => ({ feature, state: "ENTERABLE", authority_mode: "APP_ONLY",
        family_check: "NOT_CHECKED", source_readiness: "NOT_CHECKED", field_readiness: "NOT_CHECKED", command_readiness: "NOT_CHECKED" })));
    expect(result.features.find(x => x.feature === "EXECUTION_OPERATIONS")).toMatchObject({ state: "HIDDEN", authority_mode: "NOT_ESTABLISHED" });
    expect(entity(f)).toMatchObject({ permission: "UNAVAILABLE", grant_ref: null, authority_mode: "NOT_ESTABLISHED", command_readiness: "NOT_CHECKED" });
    expect(f.context.relationsFor(U).qualified).toBe(false);
    const text = JSON.stringify(result);
    for (const hidden of [PROFILE, f.grant.grant_id, f.seal.field_policy_ref, ...Object.values(domain).slice(1)]) expect(text).not.toContain(hidden);
  });
  it("domain grants are not owner/ADMIN shortcuts or browser profile/hash input", () => {
    const f = fixture(); f.context.actor_role = "ADMIN";
    expect(projectNavigation(f.context, query).features.every(x => x.state === "HIDDEN")).toBe(true);
    expect(nav(f, "TEST_ONLY:wrong-profile").features.every(x => x.state === "HIDDEN")).toBe(true);
    expect(navigationInput.safeParse({ ...query, profile_id: PROFILE }).success).toBe(false);
    expect(navigationInput.safeParse({ ...query, domain }).success).toBe(false);
    f.context.manager_domain_grants = undefined;
    expect(nav(f).features.every(x => x.state === "HIDDEN")).toBe(true);
  });
  it.each(["other-user", "other-owner", "wrong-policy", "wrong-env", "wrong-hash", "wrong-field-ref",
    "revoked", "expired", "not-started", "seal-expired", "policy-pending", "test-only-policy"])("domain %s fails closed", change => {
    const f = fixture();
    if (change === "other-user") f.grant.subject_user_id = "TEST_ONLY:peer";
    if (change === "other-owner") f.grant.issued_by = U;
    if (change === "wrong-policy") f.grant.policy_revision = "TEST_ONLY:wrong-policy";
    if (change === "wrong-env") f.grant.environment = "live";
    if (change === "wrong-hash") f.grant.domain.catalogue_sha256 = "d".repeat(64);
    if (change === "wrong-field-ref") f.grant.field_policy_ref = "TEST_ONLY:wrong-fields";
    if (change === "revoked") f.grant.revoked_at_ms = NOW;
    if (change === "expired") f.grant.valid_until_ms = NOW;
    if (change === "not-started") f.grant.valid_from_ms = NOW + 1;
    if (change === "seal-expired") f.seal.valid_until_ms = NOW;
    if (change === "policy-pending") f.context.policy!.state = "PENDING";
    if (change === "test-only-policy") { f.context.policy!.qualification = "TEST_ONLY"; f.context.allow_test_only = true; }
    expect(nav(f).features.every(x => x.state === "HIDDEN")).toBe(true);
  });
  it.each(["ordinary-deny", "domain-deny"])("full %s defeats app-domain fallback", mode => {
    const f = fixture();
    if (mode === "ordinary-deny") f.context.grants = [ordinary("TEST_ONLY:deny", P, {
      action: "business.read_all", effect: "DENY", requires_ts_acceptance: false, ts_receipt: null })];
    else f.context.manager_domain_grants = [f.grant, { ...f.grant, grant_id: "TEST_ONLY:domain-deny", effect: "DENY" }];
    expect(nav(f).features.every(x => x.state === "HIDDEN")).toBe(true);
  });
  it("binding-only and version-only current scopes are represented without cross-action elevation", () => {
    const f = fixture(); f.context.manager_domain_grants = [];
    legacy(f, ordinary("TEST_ONLY:binding", B, { action: "binding.read" }));
    expect(nav(f).features.find(x => x.feature === "EXECUTION_ACCOUNTS_BINDINGS")).toMatchObject({ state: "ENTERABLE", authority_mode: "SCOPED_CURRENT" });
    expect(nav(f).features.find(x => x.feature === "EXECUTION_OPERATIONS")!.state).toBe("HIDDEN");
    legacy(f, ordinary("TEST_ONLY:version", V, { action: "alpha.read" }));
    expect(nav(f).features.find(x => x.feature === "EXECUTION_BLOTTER")).toMatchObject({ state: "ENTERABLE", authority_mode: "SCOPED_CURRENT" });
    expect(nav(f).features.find(x => x.feature === "EXECUTION_ACCOUNTS_BINDINGS")!.state).toBe("HIDDEN");
  });
  it("ordinary scoped witness takes precedence over a separate app-domain fallback", () => {
    const f = fixture(); legacy(f, ordinary());
    expect(nav(f).features.find(x => x.feature === "EXECUTION_PORTFOLIOS")!.authority_mode).toBe("SCOPED_CURRENT");
    expect(nav(f).features.find(x => x.feature === "EXECUTION_BLOTTER")!.authority_mode).toBe("APP_ONLY");
  });
  it.each(["domain-expiry", "seal-expiry", "future-domain-deny", "future-ordinary-deny"])("terminal %s causes retry, not stale menu success", transition => {
    const f = fixture(), end = NOW + 10;
    if (transition === "domain-expiry") f.grant.valid_until_ms = end;
    if (transition === "seal-expiry") { f.grant.valid_until_ms = end; f.seal.valid_until_ms = end; }
    if (transition === "future-domain-deny") f.context.manager_domain_grants = [f.grant,
      { ...f.grant, grant_id: "TEST_ONLY:future-domain-deny", effect: "DENY", valid_from_ms: end }];
    if (transition === "future-ordinary-deny") f.context.grants = [ordinary("TEST_ONLY:future-deny", P, {
      action: "business.read_all", effect: "DENY", requires_ts_acceptance: false, ts_receipt: null, valid_from_ms: end })];
    vi.mocked(Date.now).mockReturnValueOnce(NOW).mockReturnValue(end);
    expect(() => nav(f)).toThrowError(expect.objectContaining({ code: "ACCESS_RETRY_REQUIRED", status: 409 }));
  });
  it("short native target ceiling is preserved in a mixed domain+scoped response", () => {
    const f = fixture(); versioned(f, ordinary(), NOW + 10);
    vi.mocked(Date.now).mockReturnValueOnce(NOW).mockReturnValue(NOW + 10);
    expect(() => nav(f)).toThrowError(expect.objectContaining({ code: "ACCESS_RETRY_REQUIRED", status: 409 }));
  });
  it("terminal actor expiry wins403 over simultaneous domain/graph boundary409", () => {
    const f = fixture(); f.context.actor_lease_until_ms = f.grant.valid_until_ms;
    vi.mocked(Date.now).mockReturnValueOnce(NOW).mockReturnValue(f.grant.valid_until_ms);
    expect(() => nav(f)).toThrowError(expect.objectContaining({ code: "CURRENT_ACTOR_AUTHORITY_REQUIRED", status: 403 }));
  });
  it("terminal actor expiry wins403 over a held navigation cap error", () => {
    const f = fixture(); overCap(f); f.context.actor_lease_until_ms = NOW + 10;
    vi.mocked(Date.now).mockReturnValueOnce(NOW).mockReturnValue(NOW + 10);
    expect(() => nav(f)).toThrowError(expect.objectContaining({ code: "CURRENT_ACTOR_AUTHORITY_REQUIRED", status: 403 }));
  });
  it("graph transition wins409 over a held cap error; without transition cap remains503", () => {
    const f = fixture(); overCap(f);
    expect(() => nav(f)).toThrowError(expect.objectContaining({ code: "ACCESS_SCOPE_LIMIT_EXCEEDED", status: 503 }));
    f.context.grants = [...f.context.grants, ordinary("TEST_ONLY:future-deny", P, {
      effect: "DENY", requires_ts_acceptance: false, ts_receipt: null, valid_from_ms: NOW + 10 })];
    vi.mocked(Date.now).mockReturnValueOnce(NOW).mockReturnValue(NOW + 10);
    expect(() => nav(f)).toThrowError(expect.objectContaining({ code: "ACCESS_RETRY_REQUIRED", status: 409 }));
  });
  it("renewed genuine context ceiling is honored, never an absent historical lease", () => {
    const f = fixture(); f.context.now_ms = NOW + 20; f.context.actor_lease_until_ms = NOW + 200;
    vi.mocked(Date.now).mockReturnValue(NOW + 20);
    expect(nav(f).features[0].state).toBe("ENTERABLE");
    // Pure test only: actual DB renewal/confirmation remains Main's PG proof.
  });
  it.each(["\n", "x\n", "x\t", "x\u0000", "x\u007f", "\ud800", "a".repeat(257), "界".repeat(86)])("scoped UTF8 text rejects %j without normalization", invalid => {
    expect(scopedText.safeParse(invalid).success).toBe(false);
    expect(navigationInput.safeParse({ ...query, workspace_id: invalid }).success).toBe(false);
    expect(eligibilityInput.safeParse({ ...query, resource: { ...P, id: invalid }, actions: ["portfolio.read"] }).success).toBe(false);
    expect(eligibilityQuery.safeParse({ ...query, resource_kind: "PORTFOLIO", resource_id: invalid, actions: "portfolio.read" }).success).toBe(false);
  });
  it("scoped text accepts exact byte boundary and well-formed astral Unicode", () => {
    expect(scopedText.parse("a".repeat(256))).toHaveLength(256);
    expect(scopedText.parse("😀".repeat(64))).toBe("😀".repeat(64));
    expect(scopedText.safeParse("😀".repeat(65)).success).toBe(false);
  });
  it("public nav strictly rejects duplicate/reordered features, hidden positives and app-only Operations", () => {
    const good = nav(fixture());
    expect(navigationResult.safeParse({ ...good, features: [...good.features].reverse() }).success).toBe(false);
    expect(navigationResult.safeParse({ ...good, features: [good.features[0], ...good.features.slice(0, -1)] }).success).toBe(false);
    expect(navigationResult.safeParse({ ...good, features: good.features.map((x, index) => index === 0 ? { ...x, state: "HIDDEN" } : x) }).success).toBe(false);
    expect(navigationResult.safeParse({ ...good, features: good.features.map(x => x.feature === "EXECUTION_OPERATIONS" ?
      { ...x, state: "ENTERABLE", authority_mode: "APP_ONLY" } : x) }).success).toBe(false);
  });
});
describe("C3 source dependency graph / synthetic TEST_ONLY / NOT_RUN", () => {
  it("keeps the full Core graph but does not look up unrelated peer or needless root issuer source", () => {
    const f = fixture(), own = ordinary(); legacy(f, own);
    const peer = "TEST_ONLY:unrelated-peer";
    f.context.active_principals = new Set([U, OWNER, peer]);
    f.context.grants = [own, ordinary("TEST_ONLY:peer-grant", P, { subject_user_id: peer })];
    const originalGrants = f.context.grants, originalFingerprint = f.context.authority_fingerprint;
    const ids = selfProjectionPrincipalIds(f.context, "paper", ["portfolio.read"]);
    expect(ids).toEqual([U]);
    f.context.source_principal_ids = new Set(ids);
    const original = f.context.relationsFor, lookedUp: string[] = [];
    f.context.relationsFor = id => {
      lookedUp.push(id);
      if (id === peer || id === OWNER) throw new Error("UNRELATED_PROVIDER_MUST_NOT_BE_CALLED");
      return original(id);
    };
    expect(entity(f).permission).toBe("ALLOWED");
    expect(lookedUp).not.toContain(peer); expect(lookedUp).not.toContain(OWNER);
    expect(f.context.grants).toBe(originalGrants);
    expect(f.context.authority_fingerprint).toBe(originalFingerprint);
  });
  it("has zero source dependencies for a pure current app domain, preserving full ordinary DENY facts", () => {
    const f = fixture();
    f.context.grants = [ordinary("TEST_ONLY:peer", P, { subject_user_id: "TEST_ONLY:peer" })];
    expect(selfProjectionPrincipalIds(f.context, "paper", NAVIGATION_ACTIONS)).toEqual([]);
    f.context.source_principal_ids = new Set();
    f.context.relationsFor = () => { throw new Error("NO_ENTITY_SOURCE_DEPENDENCY"); };
    expect(nav(f).features.find(x => x.feature === "EXECUTION_PORTFOLIOS")!.authority_mode).toBe("APP_ONLY");
    expect(nav(f).features.find(x => x.feature === "EXECUTION_OPERATIONS")!.state).toBe("HIDDEN");
    f.context.grants = [ordinary("TEST_ONLY:ordinary-deny", P, {
      action: "business.read_all", effect: "DENY", requires_ts_acceptance: false, ts_receipt: null })];
    // No ALLOW resource candidates => the full raw ordinary DENY still blocks
    // the app-domain fallback without an entity source authority lookup.
    expect(nav(f).features.every(x => x.state === "HIDDEN")).toBe(true);
  });
  it("includes issuer DENY plus that DENY's own parent, including future start during another await", () => {
    const f = fixture(), issuer = "TEST_ONLY:issuer", reviewer = "TEST_ONLY:reviewer";
    const own = ordinary("TEST_ONLY:child", P, { issued_by: issuer, parent_grant_id: "TEST_ONLY:parent" });
    legacy(f, own); f.context.active_principals = new Set([U, OWNER, issuer, reviewer]);
    const parent = ordinary("TEST_ONLY:parent", P, { subject_user_id: issuer, action: "access.grant",
      delegable_actions: ["portfolio.read"], requires_ts_acceptance: false, ts_receipt: null });
    const denyParent = ordinary("TEST_ONLY:deny-parent", P, { subject_user_id: reviewer, action: "access.grant",
      delegable_actions: ["access.grant"], requires_ts_acceptance: false, ts_receipt: null });
    const deny = ordinary("TEST_ONLY:delegation-deny", P, { subject_user_id: issuer, issued_by: reviewer,
      parent_grant_id: denyParent.grant_id, action: "access.grant", effect: "DENY", valid_from_ms: NOW + 10,
      requires_ts_acceptance: false, ts_receipt: null });
    f.context.grants = [own, parent, deny, denyParent];
    const ids = selfProjectionPrincipalIds(f.context, "paper", ["portfolio.read"]);
    expect(ids).toEqual([U, issuer, reviewer].sort());
    expect(ids).not.toContain(OWNER);
    f.context.source_principal_ids = new Set(ids);
    expect(entity(f).permission).toBe("ALLOWED");
    // Same Core fingerprint; a start crossed while the source promise was
    // held must not create a missing-source DENY bypass at final evaluation.
    f.context.now_ms = NOW + 10;
    expect(entity(f)).toMatchObject({ permission: "UNAVAILABLE", grant_ref: null });
  });
  it("business.read_all alias and both effects remain dependency seeds", () => {
    const f = fixture(), issuer = "TEST_ONLY:deny-issuer";
    f.context.active_principals = new Set([U, OWNER, issuer]);
    const parent = ordinary("TEST_ONLY:deny-parent", P, { subject_user_id: issuer, action: "access.grant",
      delegable_actions: ["portfolio.read"], requires_ts_acceptance: false, ts_receipt: null });
    f.context.grants = [ordinary("TEST_ONLY:wide", P, { action: "business.read_all" }),
      ordinary("TEST_ONLY:narrow-deny", P, { action: "portfolio.read", effect: "DENY", issued_by: issuer,
        parent_grant_id: parent.grant_id, requires_ts_acceptance: false, ts_receipt: null }), parent];
    expect(selfProjectionPrincipalIds(f.context, "paper", ["portfolio.read"])).toEqual([U, issuer].sort());
  });
  it("checks complete source count before any fetch; exact capacity is accepted, next principal refuses without truncation", () => {
    const f = fixture(); const grants: ScopedAccessGrant[] = [], active = new Set([U, OWNER]);
    for (let i = 0; i < MAX_SELF_SOURCE_PRINCIPALS; i++) {
      const issuer = "TEST_ONLY:issuer:" + i; active.add(issuer);
      const parent = ordinary("TEST_ONLY:parent:" + i, P, { subject_user_id: issuer, action: "access.grant",
        delegable_actions: ["portfolio.read"], requires_ts_acceptance: false, ts_receipt: null });
      grants.push(ordinary("TEST_ONLY:child:" + i, P, { issued_by: issuer, parent_grant_id: parent.grant_id }), parent);
    }
    f.context.active_principals = active;
    f.context.grants = grants.slice(0, -2);
    expect(selfProjectionPrincipalIds(f.context, "paper", ["portfolio.read"])).toHaveLength(MAX_SELF_SOURCE_PRINCIPALS);
    f.context.grants = grants;
    expect(() => selfProjectionPrincipalIds(f.context, "paper", ["portfolio.read"]))
      .toThrowError(expect.objectContaining({ code: "ACCESS_SCOPE_LIMIT_EXCEEDED", status: 503 }));
  });
});
