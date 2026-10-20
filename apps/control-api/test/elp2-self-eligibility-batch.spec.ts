/** FE-068 multi-resource eligibility with a typed step-up state. TEST_ONLY pure synthetic vectors,
 * not installed authority; no DB, adapter, HTTP or provider. The service's DB read of the session's
 * step-up expiry is injected as a fact here and is NOT exercised. */
import { describe, expect, it } from "vitest";
import { tsBusinessAction, type AccessResource, type ScopedAccessGrant, type TsMembershipAcceptance } from "../src/execution-v2/access.contract";
import { accessDigest, canonicalSelector, type AccessEvaluationContext, unqualifiedAccessRelations,
  type AccessRelations } from "../src/execution-v2/access-policy";
import { currentAccessRelations, grantBindingDigest, type CurrentAccessRelations } from "../src/execution-v2/access-current-relations";
import { MAX_BATCH_RESOURCES, eligibilityBatchInput, eligibilityBatchQuery, eligibilityBatchResult,
  projectEligibility, projectEligibilityBatch, type RowAction } from "../src/execution-v2/self-eligibility";

const NOW = 1_800_000_000_000;
const U = "TEST_ONLY:manager", OWNER = "TEST_ONLY:owner", WS = "TEST_ONLY:workspace", MAP = "TEST_ONLY:mapping";
const P: AccessResource = { kind: "PORTFOLIO", id: "TEST_ONLY:P" };
const Q: AccessResource = { kind: "PORTFOLIO", id: "TEST_ONLY:Q" };
const A: AccessResource = { kind: "ALPHA", id: "TEST_ONLY:A" };
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
function grant(id: string, changes: Partial<ScopedAccessGrant> = {}): ScopedAccessGrant {
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
function fixture(gs: ScopedAccessGrant[]) {
  const subjects = new Set([U, OWNER, ...gs.flatMap(g => [g.subject_user_id, g.issued_by])]);
  const relationMap = new Map<string, AccessRelations>();
  for (const subject of subjects) {
    const source: CurrentAccessRelations = { schema_version: "pma.core-current-relations.v1", subject_user_id: subject,
      workspace_id: WS, ts_user_id: "TEST_ONLY:ts:" + subject, mapping_revision: MAP,
      resources: ENV.map(environment => ({ environment, revision: "TEST_ONLY:cut", own_alpha_ids: [A.id],
        member_portfolio_ids: [P.id, Q.id], roots: [{ root_id: "TEST_ONLY:R", revision: "TEST_ONLY:root", complete: true, resources: [P, Q] }] })),
      grants: gs.filter(g => g.subject_user_id === subject && g.ts_receipt).map(g => ({ grant_id: g.grant_id,
        binding_digest: grantBindingDigest(g), accepted: fact(g),
        targets: g.environments.flatMap(environment => [P, Q].map(resource => ({ environment, resource,
          revision: "TEST_ONLY:target", native_reference_digest: accessDigest([g.grant_id, environment, resource]),
          valid_from_ms: NOW - 50, valid_until_ms: NOW + 5000 }))) })) };
    relationMap.set(subject, { qualified: true, revision: "TEST_ONLY:observation", own_alpha_ids: [], member_portfolio_ids: [],
      roots: {}, membership: null, current_authority: currentAccessRelations.parse(source) });
  }
  const context: AccessEvaluationContext = { principal_id: U, workspace_id: WS, now_ms: NOW, actor_current: true,
    actor_member: true, actor_role: "USER", actor_lease_until_ms: NOW + 20000, allow_test_only: true,
    policy: { workspace_id: WS, revision: "TEST_ONLY:policy:r1", artifact_digest: accessDigest("TEST_ONLY:policy"),
      approval_ref: "TEST_ONLY:NOT_OWNER_APPROVAL", state: "REVIEWED", qualification: "TEST_ONLY",
      protected_owner_user_id: OWNER, researcher_fields: { state: "QUALIFIED", policy_ref: "TEST_ONLY:fields", fields: [] } },
    grants: gs, active_principals: subjects, relationsFor: id => relationMap.get(id) ?? unqualifiedAccessRelations() };
  return { context, gs };
}
const reads = [grant("TEST_ONLY:read", { action: "portfolio.read" }), grant("TEST_ONLY:fund", { action: "capital.fund" })];
const stepUpGrant = (action: "access.grant" | "access.revoke" = "access.grant", changes: Partial<ScopedAccessGrant> = {}) =>
  grant("TEST_ONLY:stepup:" + action, { action, requires_ts_acceptance: false, ts_receipt: null,
    delegable_actions: action === "access.grant" ? ["portfolio.read"] : [], ...changes });
const none = { active_until_ms: null };
const request = (resources: AccessResource[] = [P, Q], actions: RowAction[] = ["portfolio.read", "capital.fund", "governance.r2.decide"]) =>
  ({ workspace_id: WS, environment: "paper", resources, actions });

describe("FE-068 batch eligibility: rows are exactly the single-resource rows", () => {
  it("every resource returns the same permission/reason/grant facts as the single projection, plus a step-up state", () => {
    const { context } = fixture(reads);
    const batch = projectEligibilityBatch(context, request(), none);
    expect(batch.schema_version).toBe("portal.self-eligibility-batch.v1");
    expect(batch.results.map(r => r.resource)).toEqual([P, Q]);
    for (const result of batch.results) {
      const single = projectEligibility(context, { workspace_id: WS, environment: "paper", resource: result.resource,
        actions: ["portfolio.read", "capital.fund", "governance.r2.decide"] });
      expect(result.actions.map(({ step_up_state: _s, ...row }) => row)).toEqual(single.actions);
    }
    expect(batch).toMatchObject({ observed_at_ms: NOW, valid_until_ms: NOW + 20000, current_only: true, advisory_only: true });
    expect(eligibilityBatchResult.safeParse(batch).success).toBe(true);
  });
  it("one resource of a kind an action does not support is a typed per-resource refusal, not a batch failure", () => {
    const { context } = fixture(reads);
    const batch = projectEligibilityBatch(context, request([P, A], ["portfolio.read", "capital.fund"]), none);
    const forAlpha = batch.results[1].actions;
    expect(forAlpha.map(row => [row.action, row.permission, row.reason_class])).toEqual([
      ["portfolio.read", "UNAVAILABLE", "ACTION_TARGET_UNSUPPORTED"], ["capital.fund", "UNAVAILABLE", "ACTION_TARGET_UNSUPPORTED"]]);
    expect(batch.results[0].actions[0].permission).toBe("ALLOWED");
  });
});

describe("FE-068 typed step-up state (reported, never enforced or granted)", () => {
  const states = (batch: ReturnType<typeof projectEligibilityBatch>) =>
    Object.fromEntries(batch.results[0].actions.map(row => [row.action, row.step_up_state]));
  it("separates rule (NOT_REQUIRED / PLAN_DEPENDENT / REQUIRED) and shows ALLOWED+REQUIRED together", () => {
    const { context } = fixture(reads);
    const batch = projectEligibilityBatch(context, request([P]), none);
    expect(states(batch)).toEqual({ "portfolio.read": "NOT_REQUIRED", "capital.fund": "REQUIRED", "governance.r2.decide": "PLAN_DEPENDENT" });
    const fund = batch.results[0].actions.find(row => row.action === "capital.fund")!;
    expect(fund).toMatchObject({ permission: "ALLOWED", step_up_required: true, step_up_freshness: "NOT_CHECKED" });
    expect(batch.session_step_up).toMatchObject({ state: "NOT_ACTIVE", valid_until_ms: null });
  });
  it("an active session step-up turns REQUIRED into ACTIVE and changes nothing else", () => {
    const { context } = fixture(reads);
    const idle = projectEligibilityBatch(context, request([P]), none);
    const active = projectEligibilityBatch(context, request([P]), { active_until_ms: NOW + 5000 });
    expect(active.session_step_up).toMatchObject({ state: "ACTIVE", valid_until_ms: NOW + 5000 });
    expect(states(active)).toEqual({ "portfolio.read": "NOT_REQUIRED", "capital.fund": "ACTIVE", "governance.r2.decide": "PLAN_DEPENDENT" });
    const strip = (b: typeof idle) => b.results.map(r => r.actions.map(({ step_up_state: _s, ...row }) => row));
    expect(strip(active)).toEqual(strip(idle));
  });
  it("an expired, equal-instant or session-ending step-up is clipped: never later than the session ceiling", () => {
    const { context } = fixture(reads);
    for (const until of [NOW, NOW - 1, 0])
      expect(projectEligibilityBatch(context, request([P]), { active_until_ms: until }).session_step_up.state).toBe("NOT_ACTIVE");
    const clipped = projectEligibilityBatch(context, request([P]), { active_until_ms: NOW + 999_999 });
    expect(clipped.session_step_up).toMatchObject({ state: "ACTIVE", valid_until_ms: NOW + 20000 });
    expect(clipped.valid_until_ms).toBe(NOW + 20000);
  });
  it("reports whether the step-up route's own precondition holds (current own access.grant/revoke ALLOW), nothing more", () => {
    const met = (gs: ScopedAccessGrant[]) => projectEligibilityBatch(fixture(gs).context, request([P]), none).session_step_up.challenge;
    expect(met(reads)).toEqual({ mechanism: "PASSWORD_REAUTH", route: "/api/admin/profile-access/v2/step-up",
      precondition: "CURRENT_OWN_ACCESS_GRANT_OR_REVOKE_ALLOW", precondition_met: false });
    expect(met([...reads, stepUpGrant("access.grant")]).precondition_met).toBe(true);
    expect(met([...reads, stepUpGrant("access.revoke")]).precondition_met).toBe(true);
    // expired / revoked / DENY / someone else's grant do not count
    expect(met([...reads, stepUpGrant("access.grant", { valid_until_ms: NOW - 1 })]).precondition_met).toBe(false);
    expect(met([...reads, stepUpGrant("access.grant", { revoked_at_ms: NOW - 1 })]).precondition_met).toBe(false);
    expect(met([...reads, stepUpGrant("access.grant", { effect: "DENY" })]).precondition_met).toBe(false);
    expect(met([...reads, stepUpGrant("access.grant", { subject_user_id: OWNER })]).precondition_met).toBe(false);
    // having the precondition grants no capital permission
    const withStepUp = projectEligibilityBatch(fixture([stepUpGrant("access.grant")]).context, request([P], ["capital.fund"]), none);
    expect(withStepUp.results[0].actions[0]).toMatchObject({ permission: "UNAVAILABLE", reason_class: "NO_CURRENT_PERMISSION" });
  });
});

describe("FE-068 batch bounds, authority and grammar", () => {
  it("is bounded: 1..8 unique resources, 1..16 unique actions, strict keys", () => {
    const ok = request();
    expect(eligibilityBatchInput.safeParse(ok).success).toBe(true);
    const many = Array.from({ length: MAX_BATCH_RESOURCES + 1 }, (_, i) => ({ kind: "PORTFOLIO" as const, id: "TEST_ONLY:p" + i }));
    expect(eligibilityBatchInput.safeParse({ ...ok, resources: many.slice(0, MAX_BATCH_RESOURCES) }).success).toBe(true);
    for (const bad of [{ ...ok, resources: many }, { ...ok, resources: [] }, { ...ok, resources: [P, P] }, { ...ok, actions: [] },
      { ...ok, actions: ["portfolio.read", "portfolio.read"] }, { ...ok, actions: ["not.an.action"] }, { ...ok, subject: "usr_x" },
      { ...ok, resources: [{ kind: "PORTFOLIO", id: "bad\nid" }] }])
      expect(eligibilityBatchInput.safeParse(bad).success).toBe(false);
  });
  it("keeps the single-resource refusals: other workspace and non-member are indistinguishable 404, expired actor 403", () => {
    const { context } = fixture(reads);
    expect(() => projectEligibilityBatch(context, { ...request(), workspace_id: "TEST_ONLY:other" }, none)).toThrowError(expect.objectContaining({ code: "ACCESS_RESOURCE_NOT_FOUND", status: 404 }));
    expect(() => projectEligibilityBatch({ ...context, actor_member: false }, request(), none)).toThrowError(expect.objectContaining({ status: 404 }));
    expect(() => projectEligibilityBatch({ ...context, actor_lease_until_ms: NOW - 1 }, request(), none)).toThrowError(expect.objectContaining({ status: 403 }));
  });
  it("publishes no peer grant, issuer or other-actor identifier", () => {
    const { context } = fixture([...reads, stepUpGrant("access.grant")]);
    const text = JSON.stringify(projectEligibilityBatch(context, request(), { active_until_ms: NOW + 10 }));
    expect(text).not.toContain(OWNER);
    expect(text).not.toMatch(/issued_by|parent_grant|delegable|policy_revision/);
  });
  it("the GET grammar round-trips ids containing commas and percent signs, and accepts only the canonical encoding", () => {
    const tricky = [{ kind: "PORTFOLIO", id: "a,b" }, { kind: "DEPLOYMENT", id: "100% café/ü" }, { kind: "ACCOUNT", id: "TEST_ONLY:acct" }];
    const csv = tricky.map(r => `${r.kind}:${encodeURIComponent(r.id)}`).join(",");
    const parsed = eligibilityBatchQuery.parse({ workspace_id: WS, environment: "paper", resources: csv, actions: "portfolio.read,account.read" });
    expect(parsed.resources).toEqual(tricky);
    expect(parsed.actions).toEqual(["portfolio.read", "account.read"]);
    const query = (resources: string, extra: Record<string, string> = {}) => eligibilityBatchQuery.safeParse(
      { workspace_id: WS, environment: "paper", resources, actions: "portfolio.read", ...extra });
    expect(query("PORTFOLIO:p%2C1").success).toBe(true);
    for (const bad of ["", ",", "PORTFOLIO:", "portfolio:p", "PORTFOLIO:a,b", "PORTFOLIO:%zz", "PORTFOLIO:%2c", "PORTFOLIO:a%41", "PORTFOLIO:café",
      "PORTFOLIO:p,PORTFOLIO:p", "PORTFOLIO:p,", "PORTFOLIO:p%0A", "PORTFOLIO:" + "a".repeat(769), "NOPE:p"])
      expect(query(bad).success, bad).toBe(false);
    expect(query("PORTFOLIO:p", { resource_kind: "PORTFOLIO" }).success).toBe(false);
  });
  it("the result schema refuses contradictory step-up facts", () => {
    const { context } = fixture(reads);
    const good = projectEligibilityBatch(context, request([P]), none);
    const bad = (change: (v: any) => void) => { const c = structuredClone(good) as any; change(c); return eligibilityBatchResult.safeParse(c).success; };
    expect(bad(() => {})).toBe(true);
    expect(bad(v => { v.results[0].actions[1].step_up_state = "ACTIVE"; })).toBe(false); // ACTIVE row, session NOT_ACTIVE
    expect(bad(v => { v.results[0].actions[0].step_up_state = "REQUIRED"; })).toBe(false); // required=false rule
    expect(bad(v => { v.results[0].actions[2].step_up_state = "NOT_REQUIRED"; })).toBe(false);
    expect(bad(v => { v.session_step_up.state = "ACTIVE"; })).toBe(false);
    expect(bad(v => { v.session_step_up.valid_until_ms = NOW + 1; })).toBe(false);
    expect(bad(v => { v.session_step_up.challenge.route = "/other"; })).toBe(false);
    expect(bad(v => { v.results.push(structuredClone(v.results[0])); })).toBe(false); // duplicate resource
    expect(bad(v => { v.results[0].actions[0].reason_class = "ACTION_TARGET_UNSUPPORTED"; v.results[0].actions[0].public_copy_key = "ACTION_TARGET_UNSUPPORTED"; })).toBe(false);
    expect(bad(v => { v.extra = 1; })).toBe(false);
  });
});
