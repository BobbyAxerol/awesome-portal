/** FE-068 multi-resource eligibility with a typed step-up state. TEST_ONLY pure synthetic vectors,
 * not installed authority; no DB, adapter, HTTP or provider. The service's DB read of the session's
 * step-up expiry is injected as a fact here and is NOT exercised. */
import { describe, expect, it } from "vitest";
import { tsBusinessAction, type AccessResource, type ScopedAccessGrant, type TsMembershipAcceptance } from "../src/execution-v2/access.contract";
import { accessDigest, canonicalSelector, type AccessEvaluationContext, unqualifiedAccessRelations,
  type AccessRelations } from "../src/execution-v2/access-policy";
import { currentAccessRelations, grantBindingDigest, type CurrentAccessRelations } from "../src/execution-v2/access-current-relations";
import { MAX_BATCH_RESOURCES, eligibilityBatchInput, eligibilityBatchQuery, eligibilityBatchResult,
  projectEligibility, projectEligibilityBatch, stepUpPreconditionMet, type RowAction } from "../src/execution-v2/self-eligibility";

import { NOW, U, OWNER, WS, MAP, P, Q, A, ENV, grant, fixture } from "./support/access-fixture";
const reads = [grant("TEST_ONLY:read", { action: "portfolio.read" }), grant("TEST_ONLY:fund", { action: "capital.fund" })];
const stepUpGrant = (action: "access.grant" | "access.revoke" = "access.grant", changes: Partial<ScopedAccessGrant> = {}) =>
  grant("TEST_ONLY:stepup:" + action, { action, requires_ts_acceptance: false, ts_receipt: null,
    delegable_actions: action === "access.grant" ? ["portfolio.read"] : [], ...changes });
const none = { active_until_ms: null };
const request = (resources: AccessResource[] = [P, Q], actions: RowAction[] = ["portfolio.read", "capital.fund", "governance.r2.decide"]) =>
  ({ workspace_id: WS, environment: "paper", resources, actions });

const challenges = (gs: ScopedAccessGrant[], patch: (c: AccessEvaluationContext) => AccessEvaluationContext = c => c) => {
  const result = projectEligibilityBatch(patch(fixture(gs).context), request([P]), none).session_step_up.challenges;
  expect(result.map(c => c.family)).toEqual(["CAPITAL_COMMAND", "ACCESS_ADMIN"]);
  return Object.fromEntries(result.map(c => [c.family, c.precondition_met])) as Record<"CAPITAL_COMMAND" | "ACCESS_ADMIN", boolean>;
};
describe("FE-068 batch eligibility: rows are exactly the single-resource rows", () => {
  it("every resource returns the same permission/reason/grant facts as the single projection, plus a step-up state", () => {
    const { context } = fixture(reads);
    const batch = projectEligibilityBatch(context, request(), none);
    expect(batch.schema_version).toBe("portal.self-eligibility-batch.v2");
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
  it("reports, per proof family, whether the step-up route's own precondition holds, nothing more", () => {
    const first = projectEligibilityBatch(fixture(reads).context, request([P]), none).session_step_up.challenges;
    expect(first).toEqual([
      { family: "CAPITAL_COMMAND", mechanism: "PASSWORD_REAUTH", route: "/api/admin/profile-access/v2/step-up",
        precondition: "CURRENT_OWN_STEP_UP_ACTION_ALLOW", precondition_met: true },
      { family: "ACCESS_ADMIN", mechanism: "PASSWORD_REAUTH", route: "/api/admin/profile-access/v2/step-up",
        precondition: "CURRENT_OWN_ACCESS_GRANT_OR_REVOKE_ALLOW", precondition_met: false }]);
    expect(challenges([...reads, stepUpGrant("access.grant")]).ACCESS_ADMIN).toBe(true);
    expect(challenges([...reads, stepUpGrant("access.revoke")]).ACCESS_ADMIN).toBe(true);
    // expired / revoked / DENY / someone else's grant do not count
    expect(challenges([...reads, stepUpGrant("access.grant", { valid_until_ms: NOW - 1 })]).ACCESS_ADMIN).toBe(false);
    expect(challenges([...reads, stepUpGrant("access.grant", { revoked_at_ms: NOW - 1 })]).ACCESS_ADMIN).toBe(false);
    expect(challenges([...reads, stepUpGrant("access.grant", { effect: "DENY" })]).ACCESS_ADMIN).toBe(false);
    expect(challenges([...reads, stepUpGrant("access.grant", { subject_user_id: OWNER })]).ACCESS_ADMIN).toBe(false);
    // having the precondition grants no capital permission
    const withStepUp = projectEligibilityBatch(fixture([stepUpGrant("access.grant")]).context, request([P], ["capital.fund"]), none);
    expect(withStepUp.results[0].actions[0]).toMatchObject({ permission: "UNAVAILABLE", reason_class: "NO_CURRENT_PERMISSION" });
  });
});

describe("FE-015/060/068 the capital step-up challenge: a delegated capital actor needs no access.grant", () => {
  const capital = (changes: Partial<ScopedAccessGrant> = {}) => grant("TEST_ONLY:cap", { action: "capital.top_up", ...changes });
  it("capital-only actor: the capital challenge is available, the access-admin one is not, and an ALLOWED capital row is consistent with it", () => {
    const gs = [capital()];
    expect(challenges(gs)).toEqual({ CAPITAL_COMMAND: true, ACCESS_ADMIN: false });
    const batch = projectEligibilityBatch(fixture(gs).context, request([P], ["capital.top_up", "capital.fund"]), none);
    expect(batch.results[0].actions.map(row => [row.action, row.permission, row.step_up_state])).toEqual([
      ["capital.top_up", "ALLOWED", "REQUIRED"], ["capital.fund", "UNAVAILABLE", "REQUIRED"]]);
    expect(eligibilityBatchResult.safeParse(batch).success).toBe(true);
  });
  it("the capital challenge is met EXACTLY when some capital row would be ALLOWED for a covered resource (shared witness search)", () => {
    // Every vector: precondition_met must equal "some step-up action row is ALLOWED on some resource".
    const vectors: Array<[string, ScopedAccessGrant[], (c: AccessEvaluationContext) => AccessEvaluationContext, boolean]> = [
      ["no capital grant", [grant("TEST_ONLY:read")], c => c, false],
      ["capital grant", [capital()], c => c, true],
      ["expired", [capital({ valid_until_ms: NOW - 1 })], c => c, false],
      ["not yet valid", [capital({ valid_from_ms: NOW + 1 })], c => c, false],
      ["revoked", [capital({ revoked_at_ms: NOW - 1 })], c => c, false],
      ["peer's grant", [capital({ subject_user_id: OWNER })], c => c, false],
      ["DENY only", [capital({ effect: "DENY" })], c => c, false],
      ["ALLOW overridden by a current DENY", [capital(), grant("TEST_ONLY:deny", { action: "capital.top_up", effect: "DENY",
        requires_ts_acceptance: false, ts_receipt: null })], c => c, false],
      ["grant of another policy revision", [capital({ policy_revision: "TEST_ONLY:policy:r0" })], c => c, false],
      ["grantor no longer an active principal", [capital()], c => ({ ...c, active_principals: new Set([U]) }), false],
      ["TS acceptance missing", [capital({ ts_receipt: null, ts_acceptance_digest: undefined })], c => c, false],
      ["resource kind the action cannot target", [capital({ selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "ACCOUNT", ids: ["TEST_ONLY:acct"] } })], c => c, false],
      ["a non-step-up action only", [grant("TEST_ONLY:gov", { action: "governance.r2.read" })], c => c, false],
    ];
    for (const [name, gs, patch, expected] of vectors) {
      const context = patch(fixture(gs).context);
      const batch = projectEligibilityBatch(context, request([P, Q], ["capital.top_up", "capital.fund"]), none);
      expect(batch.session_step_up.challenges[0].precondition_met, name).toBe(expected);
      // parity with the row reading: ALLOWED capital row on P or Q <=> challenge met
      const rows = batch.results.flatMap(r => r.actions).filter(row => row.permission === "ALLOWED");
      expect(rows.length > 0, name + " (row parity)").toBe(expected);
    }
  });
  it("the shared predicate fails closed without a policy or a current actor, and never answers from a truncated search", () => {
    const { context } = fixture([capital()]);
    expect(stepUpPreconditionMet(context, "CAPITAL_COMMAND")).toBe(true);
    expect(stepUpPreconditionMet({ ...context, policy: null }, "CAPITAL_COMMAND")).toBe(false);
    expect(stepUpPreconditionMet({ ...context, actor_current: false }, "CAPITAL_COMMAND")).toBe(false);
    expect(stepUpPreconditionMet({ ...context, policy: null }, "ACCESS_ADMIN")).toBe(false);
    expect(stepUpPreconditionMet(context, "OWNER" as any)).toBe(false); // unknown family
    const many = capital({ selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "ACCOUNT", ids: Array.from({ length: 200 }, (_, i) => "TEST_ONLY:a" + i) } });
    const bigContext = { ...context, grants: Array.from({ length: 120 }, (_, i) => ({ ...many, grant_id: "TEST_ONLY:cap:" + i })) };
    expect(() => stepUpPreconditionMet(bigContext, "CAPITAL_COMMAND")).toThrowError(expect.objectContaining({ code: "ACCESS_SCOPE_LIMIT_EXCEEDED", status: 503 }));
  });
  it("the access-admin rule is byte-for-byte the historical one (grantCurrent on a current own access.grant/revoke ALLOW)", () => {
    const { context } = fixture([stepUpGrant("access.grant")]);
    expect(stepUpPreconditionMet(context, "ACCESS_ADMIN")).toBe(true);
    expect(stepUpPreconditionMet(fixture([capital()]).context, "ACCESS_ADMIN")).toBe(false);
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
    expect(bad(v => { v.session_step_up.challenges[0].route = "/other"; })).toBe(false);
    expect(bad(v => { v.session_step_up.challenges[0].precondition_met = false; })).toBe(false); // ALLOWED capital row beside "not met"
    expect(bad(v => { v.results.push(structuredClone(v.results[0])); })).toBe(false); // duplicate resource
    expect(bad(v => { v.results[0].actions[0].reason_class = "ACTION_TARGET_UNSUPPORTED"; v.results[0].actions[0].public_copy_key = "ACTION_TARGET_UNSUPPORTED"; })).toBe(false);
    expect(bad(v => { v.extra = 1; })).toBe(false);
  });
});
