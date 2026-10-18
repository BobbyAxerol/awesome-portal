/** TEST_ONLY pure synthetic compatibility vectors, not installed authority.
 * No DB, adapter, provider, installed receipt, source qualification or HTTP proof.
 */
import { describe, expect, it, vi } from "vitest";
import { AccessPolicyError, accessText, scopedAccessGrant, tsBusinessAction, type AccessResource, type ScopedAccessGrant,
  type TsMembershipAcceptance } from "../src/execution-v2/access.contract";
import { accessDigest, canonicalSelector, grantCurrent, type AccessEvaluationContext,
  unqualifiedAccessRelations, type AccessRelations } from "../src/execution-v2/access-policy";
import { currentAccessRelations, grantBindingDigest,
  type CurrentAccessRelations } from "../src/execution-v2/access-current-relations";
import { FEATURES, ROW_ACTIONS, RULES, eligibilityInput, eligibilityQuery, eligibilityResult, navigationInput,
  projectEligibility, projectNavigation, type RowAction } from "../src/execution-v2/self-eligibility";

const NOW = 1_800_000_000_000;
const U = "TEST_ONLY:manager", OWNER = "TEST_ONLY:owner", WS = "TEST_ONLY:workspace", MAP = "TEST_ONLY:mapping";
const P: AccessResource = { kind: "PORTFOLIO", id: "TEST_ONLY:P" };
const Q: AccessResource = { kind: "PORTFOLIO", id: "TEST_ONLY:Q" };
const A: AccessResource = { kind: "ALPHA", id: "TEST_ONLY:A" };
const ACCOUNT: AccessResource = { kind: "ACCOUNT", id: "TEST_ONLY:account" };
const ENV = ["paper", "sandbox", "live"] as const;
function fact(g: ScopedAccessGrant): TsMembershipAcceptance {
  const r = g.ts_receipt!;
  return { source: "TEST_ONLY:PM", source_contract: "TEST_ONLY:contract", trust_profile: "TEST_ONLY:profile",
    receipt_id: r.receipt_id, proposal_id: g.grant_id + ":proposal", proposal_digest: accessDigest([g.grant_id, "proposal"]),
    portal_user_id: g.subject_user_id, ts_user_id: "TEST_ONLY:ts:" + g.subject_user_id, mapping_revision: MAP,
    human_requester_user_id: g.issued_by, workspace_id: g.workspace_id, action: g.action,
    selector_digest: accessDigest(canonicalSelector(g.selector)), environments: [...g.environments],
    previous_membership_revision: null, membership_revision: r.membership_revision,
    effective_at_ms: r.effective_at_ms, expires_at_ms: r.expires_at_ms, outcome: "ACCEPTED",
    payload_digest: accessDigest([g.grant_id, "payload"]), provenance_ref: "TEST_ONLY:NOT_NATIVE_INSTALLED" };
}
function grant(id = "TEST_ONLY:g", changes: Partial<ScopedAccessGrant> = {}): ScopedAccessGrant {
  const action = changes.action ?? "portfolio.read";
  const required = changes.requires_ts_acceptance ?? tsBusinessAction(action);
  const value: ScopedAccessGrant = { grant_id: id, subject_user_id: U, workspace_id: WS, action, effect: "ALLOW",
    selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "PORTFOLIO", ids: [P.id, Q.id] },
    environments: [...ENV], valid_from_ms: NOW - 200, valid_until_ms: NOW + 10000,
    delegable_actions: [], issued_by: OWNER, parent_grant_id: null, revision: "TEST_ONLY:grant:r1",
    policy_revision: "TEST_ONLY:policy:r1", revoked_at_ms: null, requires_ts_acceptance: required,
    ts_receipt: required ? { receipt_id: id + ":receipt", membership_revision: id + ":membership",
      mapping_revision: MAP, effective_at_ms: NOW - 100, expires_at_ms: NOW + 10000 } : null,
    field_policy_ref: null, ...changes };
  return value.ts_receipt ? { ...value, ts_acceptance_digest: accessDigest(fact(value)) } : value;
}
function fixture(gs: ScopedAccessGrant[] = [grant()]) {
  const subjects = new Set([U, OWNER, ...gs.flatMap(g => [g.subject_user_id, g.issued_by])]);
  const sources = new Map<string, CurrentAccessRelations>();
  for (const subject of subjects) {
    const source: CurrentAccessRelations = { schema_version: "pma.core-current-relations.v1", subject_user_id: subject,
      workspace_id: WS, ts_user_id: "TEST_ONLY:ts:" + subject, mapping_revision: MAP,
      resources: ENV.map(environment => ({ environment, revision: "TEST_ONLY:cut", own_alpha_ids: [A.id],
        member_portfolio_ids: [P.id, Q.id], roots: [{ root_id: "TEST_ONLY:R", revision: "TEST_ONLY:root", complete: true, resources: [P, Q] }] })),
      grants: gs.filter(g => g.subject_user_id === subject && g.ts_receipt).map(g => {
        const resources = g.selector.kind === "EXPLICIT_RESOURCE_SET" ?
          g.selector.ids.map(id => ({ kind: g.selector.kind === "EXPLICIT_RESOURCE_SET" ? g.selector.resource_kind : "ROOT" as const, id })) :
          g.selector.kind === "OWN_ALPHA" ? [A] : g.selector.kind === "PORTFOLIO_MEMBERSHIP" ?
            g.selector.portfolio_ids.map(id => ({ kind: "PORTFOLIO" as const, id })) : [{ kind: "ROOT" as const, id: g.selector.root_id }, P, Q];
        return { grant_id: g.grant_id, binding_digest: grantBindingDigest(g), accepted: fact(g),
          targets: g.environments.flatMap(environment => resources.map(resource => ({ environment, resource,
            revision: "TEST_ONLY:target", native_reference_digest: accessDigest([g.grant_id, environment, resource]),
            valid_from_ms: NOW - 50, valid_until_ms: NOW + 5000 }))) };
      }) };
    // Exercise the real current-relation ingress schema even for test vectors.
    sources.set(subject, currentAccessRelations.parse(source));
  }
  const relationMap = new Map<string, AccessRelations>([...sources].map(([id, source]) => [id, {
    qualified: true, revision: "TEST_ONLY:observation", own_alpha_ids: [], member_portfolio_ids: [], roots: {},
    membership: null, current_authority: source,
  }]));
  const context: AccessEvaluationContext = { principal_id: U, workspace_id: WS, now_ms: NOW, actor_current: true,
    actor_member: true, actor_role: "USER", actor_lease_until_ms: NOW + 20000, allow_test_only: true,
    policy: { workspace_id: WS, revision: "TEST_ONLY:policy:r1", artifact_digest: accessDigest("TEST_ONLY:policy"),
      approval_ref: "TEST_ONLY:NOT_OWNER_APPROVAL", state: "REVIEWED", qualification: "TEST_ONLY",
      protected_owner_user_id: OWNER, researcher_fields: { state: "QUALIFIED", policy_ref: "TEST_ONLY:fields", fields: [] } },
    grants: gs, active_principals: subjects, relationsFor: id => relationMap.get(id) ?? unqualifiedAccessRelations() };
  return { context, gs, sources, relationMap };
}
const input = (action: RowAction = "portfolio.read", resource = P, environment: typeof ENV[number] = "paper") =>
  ({ workspace_id: WS, environment, resource, actions: [action] });
function row(f: ReturnType<typeof fixture>, action: RowAction = "portfolio.read", resource = P, env: typeof ENV[number] = "paper") {
  return projectEligibility(f.context, input(action, resource, env)).actions[0];
}
function nav(f: ReturnType<typeof fixture>, env: typeof ENV[number] = "paper") {
  return projectNavigation(f.context, { workspace_id: WS, environment: env });
}
function feature(f: ReturnType<typeof fixture>, name: typeof FEATURES[number], env: typeof ENV[number] = "paper") {
  return nav(f, env).features.find(item => item.feature === name)!.state;
}

describe("C3 self projection PRIVATE synthetic pure proposal / NOT_RUN", () => {
  it("publishes only own matching grant and explicitly NOT_CHECKED command readiness", () => {
    const f = fixture(), before = JSON.stringify([f.gs, [...f.sources]]);
    expect(row(f)).toMatchObject({ permission: "ALLOWED", grant_ref: f.gs[0].grant_id,
      authority_mode: "VERSIONED_CURRENT", command_readiness: "NOT_CHECKED",
      reason_class: "FAMILY_CHECK_REQUIRED", step_up_freshness: "NOT_CHECKED", challenge_availability: "NOT_CHECKED" });
    expect(JSON.stringify([f.gs, [...f.sources]])).toBe(before);
  });
  it.each([{ label: "86 BMP codepoints / 258 UTF8 bytes", id: "界".repeat(86) },
    { label: "256 astral codepoints / 1024 UTF8 bytes", id: "😀".repeat(256) }])(
    "preserves a legitimate opaque own grant ID unchanged: $label", ({ id }) => {
      // App-only technical read avoids inventing any native receipt. The actual
      // stored-grant ingress, evaluator and output schema all see this exact ID.
      const own = scopedAccessGrant.parse(grant(id, { action: "governance.r1.read" }));
      expect(accessText.parse(own.grant_id)).toBe(id);
      const f = fixture([own]), before = JSON.stringify([f.gs, [...f.sources]]);
      const result = projectEligibility(f.context, input("governance.r1.read"));
      expect(result.actions[0]).toMatchObject({ permission: "ALLOWED", grant_ref: id, authority_mode: "APP_ONLY" });
      expect(eligibilityResult.parse(result).actions[0].grant_ref).toBe(id);
      expect(JSON.stringify([f.gs, [...f.sources]])).toBe(before);
    });
  it.each(["界", "😀"])("rejects 257 canonical own-ID codepoints: %s", character => {
    const id = character.repeat(257);
    expect(accessText.safeParse(id).success).toBe(false);
    expect(scopedAccessGrant.safeParse(grant(id, { action: "governance.r1.read" })).success).toBe(false);
  });
  it("one missing native leg does not hide a surviving exact target/environment", () => {
    const f = fixture(), source = f.sources.get(U)!;
    source.grants[0].targets = source.grants[0].targets.filter(t => !(t.resource.id === P.id && t.environment === "paper"));
    expect(grantCurrent(f.gs[0], f.context)).toBe(false);
    expect(row(f).permission).toBe("UNAVAILABLE");
    expect(row(f, "portfolio.read", Q).permission).toBe("ALLOWED");
    expect(row(f, "portfolio.read", P, "live").permission).toBe("ALLOWED");
    expect(feature(f, "EXECUTION_PORTFOLIOS")).toBe("ENTERABLE");
    source.grants[0].targets = source.grants[0].targets.filter(t => t.environment !== "paper");
    expect(feature(f, "EXECUTION_PORTFOLIOS")).toBe("HIDDEN");
    expect(feature(f, "EXECUTION_PORTFOLIOS", "live")).toBe("ENTERABLE");
  });
  it("narrow DENY defeats read_all without disclosing its grant_ref", () => {
    const f = fixture([grant("TEST_ONLY:wide", { action: "business.read_all" }), grant("TEST_ONLY:deny", {
      effect: "DENY", requires_ts_acceptance: false, ts_receipt: null,
      selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "PORTFOLIO", ids: [P.id] } })]);
    expect(row(f)).toMatchObject({ permission: "UNAVAILABLE", grant_ref: null, reason_class: "NO_CURRENT_PERMISSION" });
    expect(row(f, "portfolio.read", Q).permission).toBe("ALLOWED");
  });
  it.each(["revoked", "expired", "not-started", "issuer-inactive", "subject-inactive"])("%s closes the exact permission", change => {
    const f = fixture();
    if (change === "revoked") f.gs[0].revoked_at_ms = NOW;
    if (change === "expired") f.gs[0].valid_until_ms = NOW;
    if (change === "not-started") f.gs[0].valid_from_ms = NOW + 1;
    if (change === "issuer-inactive") f.context.active_principals = new Set([U]);
    if (change === "subject-inactive") f.context.active_principals = new Set([OWNER]);
    if (change === "subject-inactive") expect(() => row(f)).toThrow(AccessPolicyError);
    else expect(row(f)).toMatchObject({ permission: "UNAVAILABLE", grant_ref: null });
  });
  it.each(["missing-receipt", "missing-native", "mapping", "binding", "accepted-payload", "expired-native", "unqualified"])("TS %s never becomes app permission or readiness", change => {
    const f = fixture(), s = f.sources.get(U)!;
    if (change === "missing-receipt") f.gs[0].ts_receipt = null;
    if (change === "missing-native") s.grants = [];
    if (change === "mapping") s.mapping_revision = "TEST_ONLY:wrong";
    if (change === "binding") s.grants[0].binding_digest = accessDigest("wrong");
    if (change === "accepted-payload") s.grants[0].accepted.payload_digest = accessDigest("wrong");
    if (change === "expired-native") for (const t of s.grants[0].targets) t.valid_until_ms = NOW;
    if (change === "unqualified") f.relationMap.get(U)!.qualified = false;
    expect(row(f)).toMatchObject({ permission: "UNAVAILABLE", grant_ref: null, authority_mode: "NOT_ESTABLISHED", command_readiness: "NOT_CHECKED" });
  });
  it("legacy matching tuple is explicitly compatibility, never versioned/native-installed proof", () => {
    const f = fixture(), r = f.relationMap.get(U)!, g = f.gs[0]; delete r.current_authority;
    r.membership = { receipt_id: g.ts_receipt!.receipt_id, revision: g.ts_receipt!.membership_revision, mapping_revision: MAP };
    expect(row(f)).toMatchObject({ permission: "ALLOWED", authority_mode: "LEGACY_COMPATIBILITY" });
    r.qualified = false;
    expect(row(f).permission).toBe("UNAVAILABLE");
  });
  it.each([null, undefined, {}, { schema_version: "UNKNOWN" }])("present invalid versioned authority never falls back (%j)", invalid => {
    const f = fixture(), r = f.relationMap.get(U)!, g = f.gs[0];
    r.membership = { receipt_id: g.ts_receipt!.receipt_id, revision: g.ts_receipt!.membership_revision, mapping_revision: MAP };
    (r as unknown as Record<string, unknown>).current_authority = invalid;
    expect(row(f).permission).toBe("UNAVAILABLE");
  });
  it("no owner/ADMIN shortcut and no owner membership exception for new self projection", () => {
    const f = fixture([]); f.context.actor_role = "ADMIN";
    expect(row(f).permission).toBe("UNAVAILABLE");
    expect(nav(f).self_entry).toMatchObject({ permission: "ALLOWED", route: null, consumer_state: "AWAITING_CONSUMER_ROUTER" });
    f.context.actor_member = false;
    expect(() => nav(f)).toThrow(AccessPolicyError);
    f.context.principal_id = OWNER;
    expect(() => nav(f)).toThrow(AccessPolicyError);
  });
  it.each([false, undefined])("genuine own member flag must be literal true (%j)", member => {
    const f = fixture(); f.context.actor_member = member;
    expect(() => row(f)).toThrow(AccessPolicyError);
  });
  it("wrong workspace and expired exact session refuse even harmless self navigation", () => {
    const f = fixture();
    expect(() => projectNavigation(f.context, { workspace_id: "TEST_ONLY:other", environment: "paper" })).toThrow(AccessPolicyError);
    f.context.actor_lease_until_ms = NOW;
    expect(() => nav(f)).toThrow(AccessPolicyError);
  });
  it("other user's only grant cannot authorize or leak via grant_ref", () => {
    const f = fixture([grant("TEST_ONLY:peer-g", { subject_user_id: "TEST_ONLY:peer" })]);
    expect(row(f)).toMatchObject({ permission: "UNAVAILABLE", grant_ref: null });
    expect(feature(f, "EXECUTION_PORTFOLIOS")).toBe("HIDDEN");
  });
  it("delegation ancestor and current issuer DENY remain in the full graph", () => {
    const parent = grant("TEST_ONLY:ceiling", { action: "access.grant", subject_user_id: "TEST_ONLY:issuer",
      requires_ts_acceptance: false, ts_receipt: null, delegable_actions: ["portfolio.read"] });
    const child = grant("TEST_ONLY:child", { issued_by: "TEST_ONLY:issuer", parent_grant_id: parent.grant_id });
    const deny = grant("TEST_ONLY:issuer-deny", { action: "access.grant", subject_user_id: "TEST_ONLY:issuer",
      effect: "DENY", requires_ts_acceptance: false, ts_receipt: null });
    const f = fixture([parent, child]);
    expect(row(f)).toMatchObject({ permission: "ALLOWED", grant_ref: child.grant_id });
    f.context.grants = [parent, child, deny];
    expect(row(f).permission).toBe("UNAVAILABLE");
    f.context.grants = [child];
    expect(row(f).permission).toBe("UNAVAILABLE");
  });
  it("Operations nav needs actual current audit purpose, not generic app-only audit or read_all", () => {
    const wide = grant("TEST_ONLY:wide", { action: "business.read_all" });
    const weak = grant("TEST_ONLY:weak-audit", { action: "audit.read", requires_ts_acceptance: false, ts_receipt: null });
    const f = fixture([wide, weak]);
    expect(feature(f, "EXECUTION_PORTFOLIOS")).toBe("ENTERABLE");
    expect(feature(f, "EXECUTION_OPERATIONS")).toBe("HIDDEN");
    const audit = grant("TEST_ONLY:real-purpose-vector", { action: "audit.read", requires_ts_acceptance: true });
    const positive = fixture([audit]);
    expect(feature(positive, "EXECUTION_OPERATIONS")).toBe("ENTERABLE");
    expect(row(positive, "audit.read").grant_ref).toBe(audit.grant_id);
    const denial = grant("TEST_ONLY:audit-deny", { action: "audit.read", effect: "DENY", requires_ts_acceptance: false, ts_receipt: null });
    positive.context.grants = [audit, denial];
    expect(feature(positive, "EXECUTION_OPERATIONS")).toBe("HIDDEN");
  });
  it("Alpha/Blotter permission never implies account or audit permission", () => {
    const f = fixture([grant("TEST_ONLY:alpha", { action: "alpha.read",
      selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "ALPHA", ids: [A.id] } })]);
    expect(feature(f, "EXECUTION_BLOTTER")).toBe("ENTERABLE");
    expect(feature(f, "EXECUTION_ACCOUNTS_BINDINGS")).toBe("HIDDEN");
    expect(feature(f, "EXECUTION_OPERATIONS")).toBe("HIDDEN");
    expect(row(f, "account.read", ACCOUNT).permission).toBe("UNAVAILABLE");
    expect(JSON.stringify(nav(f))).not.toContain(A.id);
  });
  it("Accounts needs its own exact current leg", () => {
    const f = fixture([grant("TEST_ONLY:account", { action: "account.read",
      selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "ACCOUNT", ids: [ACCOUNT.id] } })]);
    expect(feature(f, "EXECUTION_ACCOUNTS_BINDINGS")).toBe("ENTERABLE");
    expect(feature(f, "EXECUTION_BLOTTER")).toBe("HIDDEN");
  });
  it.each([
    { action: "binding.read" as const, resource: { kind: "BINDING" as const, id: "TEST_ONLY:binding" }, feature: "EXECUTION_ACCOUNTS_BINDINGS" as const },
    { action: "portfolio.discover_linked" as const, resource: P, feature: "EXECUTION_PORTFOLIOS" as const },
    { action: "alpha.read" as const, resource: { kind: "ALPHA_VERSION" as const, id: "TEST_ONLY:alpha-version" }, feature: "EXECUTION_BLOTTER" as const },
  ])("$action exact leg opens only its existing entry advisory", ({ action, resource, feature: selectedFeature }) => {
    const f = fixture([grant("TEST_ONLY:entry", { action, selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: resource.kind, ids: [resource.id] } })]);
    expect(feature(f, selectedFeature)).toBe("ENTERABLE");
    expect(feature(f, "EXECUTION_OPERATIONS")).toBe("HIDDEN");
  });
  it("POLICY_PENDING keeps self entry but does not enable business menus", () => {
    const f = fixture(); f.context.policy!.state = "PENDING";
    expect(row(f)).toMatchObject({ permission: "UNAVAILABLE", reason_class: "POLICY_PENDING" });
    expect(feature(f, "EXECUTION_PORTFOLIOS")).toBe("HIDDEN");
    expect(nav(f).self_entry.permission).toBe("ALLOWED");
  });
  it("researcher field policy remains pending instead of becoming allow-all", () => {
    const f = fixture([grant("TEST_ONLY:restricted", { action: "portfolio.read_restricted" })]);
    f.context.policy!.researcher_fields.state = "PENDING";
    expect(row(f, "portfolio.read_restricted")).toMatchObject({ permission: "UNAVAILABLE", reason_class: "FIELD_POLICY_PENDING" });
  });
  it.each(["portfolio.read_restricted", "business.read_all"] as const)(
    "current %s DENY wins over the pending-field omission classifier", action => {
      const f = fixture([grant("TEST_ONLY:restricted", { action: "portfolio.read_restricted" }),
        grant("TEST_ONLY:deny", { action, effect: "DENY" })]);
      f.context.policy!.researcher_fields.state = "PENDING";
      expect(row(f, "portfolio.read_restricted")).toMatchObject({ permission: "UNAVAILABLE",
        reason_class: "NO_CURRENT_PERMISSION", grant_ref: null });
    });
  it.each(["missing", "revoked", "native-target-missing"] as const)(
    "%s restricted grant does not masquerade as a pending field policy", state => {
      const f = fixture(state === "missing" ? [] : [grant("TEST_ONLY:restricted", {
        action: "portfolio.read_restricted", ...(state === "revoked" ? { revoked_at_ms: NOW - 1 } : {}),
      })]);
      f.context.policy!.researcher_fields.state = "PENDING";
      if (state === "native-target-missing") f.sources.get(U)!.grants[0].targets = [];
      expect(row(f, "portfolio.read_restricted")).toMatchObject({ permission: "UNAVAILABLE",
        reason_class: "NO_CURRENT_PERMISSION", grant_ref: null });
    });
  it("valid broader business read stays allowed when restricted field policy is pending", () => {
    const f = fixture([grant("TEST_ONLY:restricted", { action: "portfolio.read_restricted" }),
      grant("TEST_ONLY:broad", { action: "business.read_all" })]);
    f.context.policy!.researcher_fields.state = "PENDING";
    expect(row(f, "portfolio.read_restricted")).toMatchObject({ permission: "ALLOWED",
      reason_class: "FAMILY_CHECK_REQUIRED", grant_ref: "TEST_ONLY:broad" });
  });
  it.each(ROW_ACTIONS.filter(action => RULES[action].stepUp === true))("%s never equates app permission with command readiness", action => {
    const f = fixture([grant("TEST_ONLY:mutation", { action })]);
    expect(row(f, action)).toMatchObject({ permission: "ALLOWED", step_up_required: true,
      command_readiness: "NOT_CHECKED", step_up_freshness: "NOT_CHECKED", challenge_availability: "NOT_CHECKED" });
  });
  it("unknown family step-up policy is null, never guessed from ADMIN", () => {
    const f = fixture([grant("TEST_ONLY:decide", { action: "governance.r2.decide", requires_ts_acceptance: false, ts_receipt: null })]);
    f.context.actor_role = "ADMIN";
    expect(row(f, "governance.r2.decide")).toMatchObject({ permission: "ALLOWED", step_up_required: null, command_readiness: "NOT_CHECKED" });
  });
  it("wrong public action/kind is unavailable without looking up target existence", () => {
    const f = fixture();
    expect(row(f, "deployment.register", ACCOUNT)).toMatchObject({ permission: "UNAVAILABLE", reason_class: "ACTION_TARGET_UNSUPPORTED", grant_ref: null });
    expect(row(f, "portfolio.read", { ...P, id: "TEST_ONLY:nonexistent" })).toEqual(
      row(f, "portfolio.read", { ...P, id: "TEST_ONLY:existing-but-not-granted" }));
  });
  it.each(["as_of_ms", "subject_user_id", "actor", "grant", "scope", "source_url"])("rejects caller-supplied %s", field => {
    expect(eligibilityInput.safeParse({ ...input(), [field]: "TEST_ONLY:untrusted" }).success).toBe(false);
    expect(navigationInput.safeParse({ workspace_id: WS, environment: "paper", [field]: "TEST_ONLY:untrusted" }).success).toBe(false);
  });
  it("rejects unknown action/environment, duplicate and over-limit action sets", () => {
    for (const actions of [["owner.recovery"], ["capital.return_capital"], ["execution.accounts.read"],
      ["portfolio.read", "portfolio.read"], ROW_ACTIONS.slice(0, 17), []])
      expect(eligibilityInput.safeParse({ ...input(), actions }).success).toBe(false);
    expect(eligibilityInput.safeParse({ ...input(), environment: "all" }).success).toBe(false);
  });
  it("actual strict GET query normalizes one exact target and finite actions", () => {
    expect(eligibilityQuery.parse({ workspace_id: WS, environment: "paper", resource_kind: "PORTFOLIO",
      resource_id: P.id, actions: "capital.fund,capital.top_up" })).toEqual({ ...input(), actions: ["capital.fund", "capital.top_up"] });
  });
  it.each(["", "portfolio.read,", "portfolio.read,portfolio.read", "portfolio.read, capital.fund", "*",
    "execution.portfolios.read", "portfolio.read\n"])("GET action grammar rejects %j without interpreting it as authority", actions => {
    expect(eligibilityQuery.safeParse({ workspace_id: WS, environment: "paper", resource_kind: "PORTFOLIO",
      resource_id: P.id, actions }).success).toBe(false);
  });
  it("GET query rejects array/repeated actions and historical/subject selectors", () => {
    const query = { workspace_id: WS, environment: "paper", resource_kind: "PORTFOLIO", resource_id: P.id, actions: "portfolio.read" };
    expect(eligibilityQuery.safeParse({ ...query, actions: ["portfolio.read", "account.read"] }).success).toBe(false);
    expect(eligibilityQuery.safeParse({ ...query, as_of_ms: NOW }).success).toBe(false);
    expect(eligibilityQuery.safeParse({ ...query, subject_user_id: U }).success).toBe(false);
  });
  it("bounded nav never truncates into a misleading complete HIDDEN result", () => {
    const f = fixture([]);
    f.context.grants = Array.from({ length: 11 }, (_, batch) => grant("TEST_ONLY:large:" + batch, {
      selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "PORTFOLIO",
        ids: Array.from({ length: batch === 10 ? 1 : 200 }, (_, index) => "TEST_ONLY:P:" + (batch * 200 + index)) } }));
    expect(() => nav(f)).toThrow(AccessPolicyError);
  });
  it("129 candidates fit the existing finite 2000 bound, not an artificial 128 limit", () => {
    const f = fixture([]);
    f.context.grants = [grant("TEST_ONLY:129", { selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "PORTFOLIO",
      ids: Array.from({ length: 129 }, (_, index) => "TEST_ONLY:P:" + index) } })];
    // No native proof exists for these synthetic candidates: still HIDDEN, not a false scope-limit.
    expect(feature(f, "EXECUTION_PORTFOLIOS")).toBe("HIDDEN");
  });
  it.each(["revoked", "expired", "future", "wrong-workspace", "old-policy", "inactive-issuer"])("irrelevant %s selectors cannot create false nav capacity failure", change => {
    const f = fixture();
    const garbage = Array.from({ length: 11 }, (_, batch) => grant("TEST_ONLY:garbage:" + batch, {
      selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "PORTFOLIO",
        ids: Array.from({ length: 200 }, (_, index) => "TEST_ONLY:G:" + (batch * 200 + index)) } }));
    for (const g of garbage) {
      if (change === "revoked") g.revoked_at_ms = NOW;
      if (change === "expired") g.valid_until_ms = NOW;
      if (change === "future") g.valid_from_ms = NOW + 1;
      if (change === "wrong-workspace") g.workspace_id = "TEST_ONLY:other-workspace";
      if (change === "old-policy") g.policy_revision = "TEST_ONLY:old-policy";
      if (change === "inactive-issuer") g.issued_by = "TEST_ONLY:inactive";
    }
    f.context.grants = [...f.gs, ...garbage];
    expect(feature(f, "EXECUTION_PORTFOLIOS")).toBe("ENTERABLE");
  });
  it.each([undefined, NaN, Infinity, -1, NOW])("captured authority requires a valid unexpired session ceiling (%j)", lease => {
    const f = fixture(); f.context.authority_fingerprint = "TEST_ONLY:not-a-production-fingerprint";
    f.context.actor_lease_until_ms = lease;
    expect(() => row(f)).toThrow(AccessPolicyError);
    expect(() => nav(f)).toThrow(AccessPolicyError);
  });
  it("all non-audit eligibility and nav use the physical clock, not an earlier capture", () => {
    const f = fixture();
    const clock = vi.spyOn(Date, "now").mockReturnValue(NOW + 5000);
    try {
      expect(row(f).permission).toBe("UNAVAILABLE");
      expect(feature(f, "EXECUTION_PORTFOLIOS")).toBe("HIDDEN");
    } finally { clock.mockRestore(); }
  });
  it.each(["native-expiry", "future-deny", "session-expiry"])("%s crossing synchronous row projection refuses stale output", transition => {
    const f = fixture(); let end = NOW + 5000;
    if (transition === "future-deny") {
      const deny = grant("TEST_ONLY:future-deny", { effect: "DENY", requires_ts_acceptance: false, ts_receipt: null,
        valid_from_ms: NOW + 100 });
      f.context.grants = [...f.gs, deny]; end = NOW + 100;
    }
    if (transition === "session-expiry") { f.context.actor_lease_until_ms = NOW + 10; end = NOW + 10; }
    const clock = vi.spyOn(Date, "now").mockReturnValueOnce(NOW).mockReturnValue(end);
    try { expect(() => row(f)).toThrowError(expect.objectContaining({ code: transition === "session-expiry" ? "CURRENT_ACTOR_AUTHORITY_REQUIRED" : "ACCESS_RETRY_REQUIRED" })); }
    finally { clock.mockRestore(); }
  });
  it("native expiry during the nav loop cannot return earlier ENTERABLE flags", () => {
    const f = fixture([grant("TEST_ONLY:alpha-clock", { action: "alpha.read",
      selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "ALPHA", ids: [A.id] } })]);
    const clock = vi.spyOn(Date, "now").mockReturnValueOnce(NOW).mockReturnValue(NOW + 5000);
    try { expect(() => nav(f)).toThrowError(expect.objectContaining({ code: "ACCESS_RETRY_REQUIRED" })); }
    finally { clock.mockRestore(); }
  });
  it("public schema rejects spoofed enabled/qualified flags and inconsistent reason/ref", () => {
    const f = fixture(), good = projectEligibility(f.context, input());
    expect(eligibilityResult.safeParse({ ...good, enabled: true }).success).toBe(false);
    const bad = { ...good, actions: [{ ...good.actions[0], permission: "UNAVAILABLE", grant_ref: "TEST_ONLY:peer" }] };
    expect(eligibilityResult.safeParse(bad).success).toBe(false);
  });
});
