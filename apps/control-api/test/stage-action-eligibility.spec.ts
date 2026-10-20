/** FE-068 pure projection of the stage-action eligibility. Facts are injected, so
 * this proves the rule table, the reason order (same order the producing routes
 * refuse in), the "no related grant is consulted" property and the closed schema.
 * The service wiring (session/membership fences, DB reads) is NOT run here. */
import { describe, expect, it } from "vitest";
import type { EffectiveAccess } from "../src/auth/owner-access.service";
import { STAGE_ACTIONS, STAGE_RULES, projectStageActionEligibility, stageActionEligibility,
  stageActionEligibilityQuery, type StageEligibilityFacts } from "../src/governance/stage-action-eligibility";

const WORKSPACE = "ws_TEST_ONLY";
const NOW = 1_792_300_000_000;
const access = (capabilities: string[], scopes: Record<string, Array<string | null>> = {}, isOwner = false): EffectiveAccess =>
  ({ userId: "usr_TEST_ONLY", isOwner, capabilities: capabilities as never,
    ownerState: isOwner ? "OWNER" : "NOT_OWNER", scopes: scopes as never });
const facts = (patch: Partial<StageEligibilityFacts> = {}): StageEligibilityFacts => ({ workspace_id: WORKSPACE, role: "ADMIN",
  access: access(["governance.r2.read"], { "governance.r2.read": [null] }), retained_review: false,
  paper_projection_authorized: true, step_up_until_ms: null, observed_at_ms: NOW, ...patch });
const row = (result: ReturnType<typeof projectStageActionEligibility>, action: string) =>
  result.actions.find(entry => entry.stage_action === action)!;
const NOT_COMMISSIONED = STAGE_ACTIONS.filter(action => /^(canary|live)\./.test(action));

describe("FE-068 stage-action eligibility", () => {
  it("returns all ten actions in a fixed order, advisory and current-only, with no grant material", () => {
    const result = projectStageActionEligibility(facts());
    expect(result.actions.map(entry => entry.stage_action)).toEqual([...STAGE_ACTIONS]);
    expect(STAGE_ACTIONS).toHaveLength(10);
    expect(result).toMatchObject({ schema_version: "portal.stage-action-eligibility.v1", workspace_id: WORKSPACE,
      current_only: true, advisory_only: true, observed_at_ms: NOW });
    expect(JSON.stringify(result)).not.toMatch(/grant_ref|usr_TEST_ONLY|capabilit/);
    expect(stageActionEligibility.safeParse(result).success).toBe(true);
  });
  it("an ADMIN with the R2 read grant and an authorized projection can proceed to the submit checks on the three live routes", () => {
    const result = projectStageActionEligibility(facts());
    for (const action of ["approval.create", "sandbox.review_note", "paper.exit_review_request"]) {
      expect(row(result, action)).toMatchObject({ verdict: "ELIGIBLE", eligible: true, reason_class: "SUBMIT_CHECKS_REQUIRED",
        public_copy_key: "SUBMIT_CHECKS_REQUIRED", step_up_required: false, step_up_state: "NOT_REQUIRED" });
    }
    expect(row(result, "approval.create")).toMatchObject({ basis: "WORKSPACE_MEMBERSHIP", alpha_scope: "WORKSPACE_ALL_COMPLETED_RUNS" });
    expect(row(result, "sandbox.review_note").basis).toBe("ADMIN_ROLE");
    expect(row(result, "paper.exit_review_request").basis).toBe("ADMIN_ROLE_AND_GOVERNANCE_R2_READ");
  });
  it("opening a request needs membership only (the route has no role/capability gate), so a plain USER is eligible for approval.create but not the ADMIN captures", () => {
    const result = projectStageActionEligibility(facts({ role: "USER", access: access([]) }));
    expect(row(result, "approval.create")).toMatchObject({ verdict: "ELIGIBLE", reason_class: "SUBMIT_CHECKS_REQUIRED" });
    for (const action of ["sandbox.review_note", "paper.exit_review_request"])
      expect(row(result, action)).toMatchObject({ verdict: "NOT_ELIGIBLE", eligible: false, reason_class: "ADMIN_ROLE_REQUIRED" });
  });
  it("paper exit needs the gate authority after the role: capability vs workspace-scope refusals stay distinct, owner passes", () => {
    expect(row(projectStageActionEligibility(facts({ access: access([]) })), "paper.exit_review_request"))
      .toMatchObject({ verdict: "NOT_ELIGIBLE", reason_class: "GOVERNANCE_CAPABILITY_REQUIRED" });
    expect(row(projectStageActionEligibility(facts({ access: access(["governance.r2.read"], { "governance.r2.read": ["ws_OTHER"] }) })),
      "paper.exit_review_request")).toMatchObject({ reason_class: "GOVERNANCE_SCOPE_MISMATCH" });
    // role is checked BEFORE the gate authority, exactly as capture() does
    expect(row(projectStageActionEligibility(facts({ role: "USER", access: access([]) })), "paper.exit_review_request").reason_class)
      .toBe("ADMIN_ROLE_REQUIRED");
    expect(row(projectStageActionEligibility(facts({ access: access([], {}, true) })), "paper.exit_review_request").verdict).toBe("ELIGIBLE");
    // sandbox note is ADMIN-only and independent of the R2 grant
    expect(row(projectStageActionEligibility(facts({ access: access([]) })), "sandbox.review_note").verdict).toBe("ELIGIBLE");
  });
  it("an unconfigured paper projection closes only the paper-exit request", () => {
    const result = projectStageActionEligibility(facts({ paper_projection_authorized: false }));
    expect(row(result, "paper.exit_review_request")).toMatchObject({ verdict: "NOT_ELIGIBLE", reason_class: "CAPTURE_PROJECTION_NOT_AUTHORIZED" });
    expect(row(result, "sandbox.review_note").verdict).toBe("ELIGIBLE");
    expect(row(result, "approval.create").verdict).toBe("ELIGIBLE");
  });
  it("a retained-review build is read-only for every route, even for the owner, and is told apart from a missing grant", () => {
    const result = projectStageActionEligibility(facts({ retained_review: true, access: access([], {}, true) }));
    for (const action of ["approval.create", "sandbox.review_note", "paper.exit_review_request"])
      expect(row(result, action)).toMatchObject({ verdict: "NOT_ELIGIBLE", eligible: false, reason_class: "RETAINED_REVIEW_READ_ONLY" });
    for (const action of NOT_COMMISSIONED) expect(row(result, action).reason_class).toBe("COMMAND_FAMILY_NOT_COMMISSIONED");
  });
  it("canary and live commands have no Portal route: NOT_COMMISSIONED whatever grants the caller holds, with an undetermined (never false) step-up", () => {
    const everything = access(["governance.canary.decide", "governance.live.decide", "governance.r2.decide"],
      { "governance.live.decide": [null], "governance.canary.decide": [null] }, true);
    for (const result of [projectStageActionEligibility(facts({ access: everything })),
      projectStageActionEligibility(facts({ role: "USER", access: access([]) }))]) {
      expect(NOT_COMMISSIONED).toHaveLength(7);
      for (const action of NOT_COMMISSIONED) expect(row(result, action)).toMatchObject({ verdict: "NOT_COMMISSIONED", eligible: false,
        reason_class: "COMMAND_FAMILY_NOT_COMMISSIONED", basis: "NONE_PUBLISHED", step_up_required: null, step_up_state: "NOT_DETERMINED", alpha_scope: null });
    }
  });
  it("reports this session's step-up fact separately and never lets an expired or equal-instant step-up count", () => {
    expect(projectStageActionEligibility(facts()).session_step_up).toEqual({ state: "NOT_ACTIVE", valid_until_ms: null });
    expect(projectStageActionEligibility(facts({ step_up_until_ms: NOW + 1000 })).session_step_up).toEqual({ state: "ACTIVE", valid_until_ms: NOW + 1000 });
    for (const until of [NOW, NOW - 1]) expect(projectStageActionEligibility(facts({ step_up_until_ms: until })).session_step_up)
      .toEqual({ state: "NOT_ACTIVE", valid_until_ms: null });
    // an active step-up never changes a verdict or makes a not-required action "required"
    expect(projectStageActionEligibility(facts({ step_up_until_ms: NOW + 1000 })).actions)
      .toEqual(projectStageActionEligibility(facts()).actions);
  });
  it("the rule table is the producer's current truth", () => {
    expect(Object.fromEntries(STAGE_ACTIONS.map(action => [action, STAGE_RULES[action].stepUp]))).toEqual({
      "approval.create": false, "sandbox.review_note": false, "paper.exit_review_request": false,
      "canary.hold": null, "canary.reduce": null, "canary.rollback": null, "canary.request_scale": null,
      "live.halt": null, "live.reduce": null, "live.emergency_close": null });
  });
  it("the schema refuses inconsistent rows, extra keys, reordered actions and a lying step-up block", () => {
    const good = projectStageActionEligibility(facts());
    const mutate = (change: (value: any) => void) => { const copy = structuredClone(good) as any; change(copy);
      return stageActionEligibility.safeParse(copy).success; };
    expect(mutate(() => {})).toBe(true);
    expect(mutate(v => { v.actions[1].eligible = false; })).toBe(false);
    expect(mutate(v => { v.actions[1].reason_class = "ADMIN_ROLE_REQUIRED"; })).toBe(false);
    expect(mutate(v => { v.actions[1].public_copy_key = "ADMIN_ROLE_REQUIRED"; })).toBe(false);
    expect(mutate(v => { v.actions[3].verdict = "ELIGIBLE"; v.actions[3].eligible = true; v.actions[3].reason_class = "SUBMIT_CHECKS_REQUIRED"; v.actions[3].public_copy_key = "SUBMIT_CHECKS_REQUIRED"; })).toBe(false);
    expect(mutate(v => { v.actions[0].step_up_required = true; })).toBe(false);
    expect(mutate(v => { v.actions[0].alpha_scope = null; })).toBe(false);
    expect(mutate(v => { v.actions[2].alpha_scope = "WORKSPACE_ALL_COMPLETED_RUNS"; })).toBe(false);
    expect(mutate(v => { v.actions[0].grant_ref = "acg_1"; })).toBe(false);
    expect(mutate(v => { v.actions.reverse(); })).toBe(false);
    expect(mutate(v => { v.actions.pop(); })).toBe(false);
    expect(mutate(v => { v.session_step_up = { state: "ACTIVE", valid_until_ms: null }; })).toBe(false);
    expect(mutate(v => { v.session_step_up = { state: "ACTIVE", valid_until_ms: NOW }; })).toBe(false);
    expect(mutate(v => { v.session_step_up = { state: "NOT_ACTIVE", valid_until_ms: NOW + 5 }; })).toBe(false);
    expect(mutate(v => { v.extra = 1; })).toBe(false);
  });
  it("the query grammar takes at most a workspace id: no actor, role, action list or as-of selector", () => {
    expect(stageActionEligibilityQuery.safeParse({}).success).toBe(true);
    expect(stageActionEligibilityQuery.safeParse({ workspace_id: "ws_1" }).success).toBe(true);
    for (const bad of [{ workspace_id: "ab" }, { user_id: "x" }, { role: "ADMIN" }, { actions: "live.halt" }, { as_of_ms: "1" }, { workspace_id: "x".repeat(97) }])
      expect(stageActionEligibilityQuery.safeParse(bad).success).toBe(false);
  });
});
