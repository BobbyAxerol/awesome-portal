/**
 * Self-access readers against the canonical contract fixture
 * (`execution-access.synthetic.valid.json`, cases `AccessEligibility` x2 and
 * `AccessSelfNavigation` x4, Codex e19ad906).
 *
 * The fixture is the only source of bodies; negative cases are mutations of
 * it, never a second hand-written copy. The conformance suite
 * (`accessSelf.conformance.test.ts`) does the schema-driven breadth.
 */
import { describe, expect, it } from "vitest";

import { loadCanonical } from "../testkit/loadCanonical";
import {
  ACCESS_ELIGIBILITY_PATH,
  ACCESS_ELIGIBILITY_SCHEMA,
  ACCESS_SELF_NAVIGATION_PATH,
  ACCESS_SELF_NAVIGATION_SCHEMA,
  accessEligibilityUrl,
  accessSelfNavigationUrl,
  eligibilityAnswers,
  eligibilityRow,
  enterableSelfNavFeatures,
  navigationAnswers,
  readAccessEligibility,
  readAccessSelfNavigation,
  selfNavItem,
  type AccessEligibility,
  type AccessSelfNavigation,
  type EligibilityRequest,
} from "./accessSelf";
import { readAccessEffective } from "./accessEffective";

type Draft = any;
const FIXTURE = loadCanonical<{ cases: { type: string; case_name: string; value: Draft }[] }>("execution-access.synthetic");
const caseOf = (type: string, name: string): Draft => FIXTURE.cases.find((entry) => entry.type === type && entry.case_name === name)!.value;
const POSITIVE = caseOf("AccessEligibility", "POSITIVE_SHAPE_NOT_INSTALLED_AUTHORITY");
const ABSENT = caseOf("AccessEligibility", "ABSENT_PERMISSION");
const NAV_APP_ONLY = caseOf("AccessSelfNavigation", "APP_ONLY_NOT_SOURCE_AUTHORITY");
const NAV_HIDDEN = caseOf("AccessSelfNavigation", "ABSENT_PERMISSION");
const NAV_LEGACY = caseOf("AccessSelfNavigation", "ROUTING_LEGACY_COMPATIBILITY_NOT_A_GRANT");
const NAV_V2 = caseOf("AccessSelfNavigation", "ROUTING_SCOPED_V2_NOT_A_GRANT");

const clone = <T,>(value: T): T => structuredClone(value);
const edit = (body: Draft, change: (b: Draft) => void): Draft => {
  const copy = clone(body);
  change(copy);
  return copy;
};

function eligibility(raw: unknown): AccessEligibility {
  const read = readAccessEligibility(raw);
  expect(read?.kind).toBe("eligibility");
  return (read as { eligibility: AccessEligibility }).eligibility;
}
function navigation(raw: unknown): AccessSelfNavigation {
  const read = readAccessSelfNavigation(raw);
  expect(read?.kind).toBe("navigation");
  return (read as { navigation: AccessSelfNavigation }).navigation;
}

describe("self-eligibility, the canonical bodies", () => {
  it("the positive shape reads as an ALLOWED row that still says nothing else was checked", () => {
    const body = eligibility(POSITIVE);
    expect(body).toMatchObject({
      workspaceId: "ws_TEST_ONLY", environment: "paper", resource: { kind: "PORTFOLIO", id: "portfolio_TEST_ONLY" }, currentOnly: true, advisoryOnly: true,
    });
    expect(body.actions).toEqual([{
      action: "portfolio.read", familyCheck: "BUSINESS_READ_SCOPE", stepUpRequired: false,
      unchecked: { stepUpFreshness: "NOT_CHECKED", challengeAvailability: "NOT_CHECKED", commandReadiness: "NOT_CHECKED" },
      permission: "ALLOWED", reasonClass: "FAMILY_CHECK_REQUIRED", publicCopyKey: "FAMILY_CHECK_REQUIRED",
      grantRef: "acg_TEST_ONLY_OWN_SYNTHETIC", authorityMode: "VERSIONED_CURRENT",
    }]);
  });

  it("the absent permission reads as UNAVAILABLE with its reason, no grant and NOT_ESTABLISHED", () => {
    const row = eligibility(ABSENT).actions[0]!;
    expect(row).toMatchObject({
      action: "portfolio.read", permission: "UNAVAILABLE", reasonClass: "NO_CURRENT_PERMISSION", publicCopyKey: "NO_CURRENT_PERMISSION",
      grantRef: null, authorityMode: "NOT_ESTABLISHED", stepUpRequired: false,
    });
  });

  it("a row is found by action; an action nobody asked about is undefined, not 'not allowed'", () => {
    const body = eligibility(POSITIVE);
    expect(eligibilityRow(body, "portfolio.read")?.permission).toBe("ALLOWED");
    expect(eligibilityRow(body, "account.read")).toBeUndefined();
  });

  it("the governance decide actions have no step-up answer: null stays null, never false", () => {
    const body = edit(POSITIVE, (b) => { b.actions[0] = { ...b.actions[0], action: "governance.r1.decide", family_check: "GOVERNANCE_PLAN", step_up_required: null }; });
    expect(eligibility(body).actions[0]!.stepUpRequired).toBeNull();
    // ...and the reader will not accept `false` there, because the contract pins null.
    expect(readAccessEligibility(edit(body, (b) => { b.actions[0].step_up_required = false; }))).toBeNull();
  });

  it("capital actions require a step-up the projection did not check", () => {
    const body = edit(POSITIVE, (b) => { b.actions[0] = { ...b.actions[0], action: "capital.top_up", family_check: "CAPITAL_PREVIEW", step_up_required: true }; });
    const row = eligibility(body).actions[0]!;
    expect(row.stepUpRequired).toBe(true);
    expect(row.unchecked.stepUpFreshness).toBe("NOT_CHECKED");
    expect(row.unchecked.commandReadiness).toBe("NOT_CHECKED");
  });
});

describe("self-eligibility, the boundary", () => {
  it.each([null, undefined, "text", 7, [], true])("a non-object body (%s) is malformed", (raw) => {
    expect(readAccessEligibility(raw)).toBeNull();
    expect(readAccessSelfNavigation(raw)).toBeNull();
  });

  it("another schema is unsupported_shape, whichever reader meets it, and its fields are never read", () => {
    expect(readAccessEligibility(NAV_APP_ONLY)).toEqual({ kind: "unsupported_shape", schemaVersion: ACCESS_SELF_NAVIGATION_SCHEMA });
    expect(readAccessSelfNavigation(POSITIVE)).toEqual({ kind: "unsupported_shape", schemaVersion: ACCESS_ELIGIBILITY_SCHEMA });
    expect(readAccessEligibility({ ...POSITIVE, schema_version: "portal.self-eligibility.v2" })).toEqual({ kind: "unsupported_shape", schemaVersion: "portal.self-eligibility.v2" });
    expect(readAccessEligibility({ actions: [] })).toEqual({ kind: "unsupported_shape", schemaVersion: null });
    expect(readAccessSelfNavigation({ schema_version: 1 })).toEqual({ kind: "unsupported_shape", schemaVersion: null });
    // The effective-access reader and these two never read each other's bodies.
    expect(readAccessEffective(POSITIVE)).toEqual({ kind: "unsupported_shape", schemaVersion: ACCESS_ELIGIBILITY_SCHEMA });
    expect(readAccessEffective(NAV_APP_ONLY)).toEqual({ kind: "unsupported_shape", schemaVersion: ACCESS_SELF_NAVIGATION_SCHEMA });
  });

  it.each<[string, (b: Draft) => void]>([
    ["an extra top-level key", (b) => { b.grants = []; }],
    ["an extra key on a row", (b) => { b.actions[0].can_submit = true; }],
    ["an extra key on the resource", (b) => { b.resource.name = "Portfolio"; }],
    ["current_only false", (b) => { b.current_only = false; }],
    ["advisory_only false", (b) => { b.advisory_only = false; }],
    ["advisory_only missing", (b) => { delete b.advisory_only; }],
    ["no actions", (b) => { b.actions = []; }],
    ["an unknown action", (b) => { b.actions[0].action = "portfolio.write"; }],
    ["an unknown environment", (b) => { b.environment = "prod"; }],
    ["an unknown resource kind", (b) => { b.resource.kind = "EXECUTION"; }],
    ["ALLOWED with a reason other than FAMILY_CHECK_REQUIRED", (b) => { b.actions[0].reason_class = "NO_CURRENT_PERMISSION"; b.actions[0].public_copy_key = "NO_CURRENT_PERMISSION"; }],
    ["ALLOWED without a grant_ref", (b) => { b.actions[0].grant_ref = null; }],
    ["ALLOWED with NOT_ESTABLISHED authority", (b) => { b.actions[0].authority_mode = "NOT_ESTABLISHED"; }],
    ["a copy key that is not the reason", (b) => { b.actions[0].public_copy_key = "POLICY_PENDING"; }],
    ["a step-up flag that contradicts the action", (b) => { b.actions[0].step_up_required = true; }],
    ["a family that contradicts the action", (b) => { b.actions[0].family_check = "CAPITAL_PREVIEW"; }],
    ["a step-up freshness that was 'checked'", (b) => { b.actions[0].step_up_freshness = "FRESH"; }],
    ["a command readiness that was 'checked'", (b) => { b.actions[0].command_readiness = "READY"; }],
    ["a challenge availability that was 'checked'", (b) => { b.actions[0].challenge_availability = "AVAILABLE"; }],
    ["the same action twice", (b) => { b.actions.push(clone(b.actions[0])); }],
  ])("%s voids the read", (_name, change) => {
    expect(readAccessEligibility(edit(POSITIVE, change))).toBeNull();
  });

  it.each<[string, (b: Draft) => void]>([
    ["UNAVAILABLE with a grant_ref", (b) => { b.actions[0].grant_ref = "acg_x"; }],
    ["UNAVAILABLE with an authority", (b) => { b.actions[0].authority_mode = "APP_ONLY"; }],
    ["UNAVAILABLE that says FAMILY_CHECK_REQUIRED", (b) => { b.actions[0].reason_class = "FAMILY_CHECK_REQUIRED"; b.actions[0].public_copy_key = "FAMILY_CHECK_REQUIRED"; }],
  ])("%s voids the read", (_name, change) => {
    expect(readAccessEligibility(edit(ABSENT, change))).toBeNull();
  });

  it("every unavailable reason in the contract reads, with its own copy key", () => {
    for (const reason of ["NO_CURRENT_PERMISSION", "POLICY_PENDING", "FIELD_POLICY_PENDING", "ACTION_TARGET_UNSUPPORTED"]) {
      const row = eligibility(edit(ABSENT, (b) => { b.actions[0].reason_class = reason; b.actions[0].public_copy_key = reason; })).actions[0]!;
      expect(row.reasonClass).toBe(reason);
      expect(row.publicCopyKey).toBe(reason);
    }
  });

  it("text that can reverse or hide what is printed is refused whole (bidi override, zero width, whitespace-only)", () => {
    const rlo = String.fromCharCode(0x202e);
    const zwsp = String.fromCharCode(0x200b);
    for (const value of [`ws${rlo}evil`, `ws${zwsp}x`, "   ", "ws\u0001x", "a".repeat(257)]) {
      expect(readAccessEligibility(edit(POSITIVE, (b) => { b.workspace_id = value; })), value).toBeNull();
      expect(readAccessEligibility(edit(POSITIVE, (b) => { b.resource.id = value; })), value).toBeNull();
    }
    expect(readAccessEligibility(edit(POSITIVE, (b) => { b.actions[0].grant_ref = `acg${rlo}x`; }))).toBeNull();
    // 129 two-byte characters are 129 codepoints but 258 UTF-8 bytes: over the server's selector limit.
    expect(readAccessEligibility(edit(POSITIVE, (b) => { b.workspace_id = "é".repeat(129); }))).toBeNull();
    expect(readAccessEligibility(edit(POSITIVE, (b) => { b.workspace_id = "é".repeat(128); }))).not.toBeNull();
    // A lone surrogate is not text.
    expect(readAccessEligibility(edit(POSITIVE, (b) => { b.workspace_id = `ws${String.fromCharCode(0xd800)}`; }))).toBeNull();
  });

  it("an opaque grant_ref may be longer than the selector byte limit: it is held to 256 codepoints, not 256 bytes", () => {
    expect(readAccessEligibility(edit(POSITIVE, (b) => { b.actions[0].grant_ref = "é".repeat(256); }))).not.toBeNull();
    expect(readAccessEligibility(edit(POSITIVE, (b) => { b.actions[0].grant_ref = "é".repeat(257); }))).toBeNull();
  });
});

describe("self-navigation, the canonical bodies", () => {
  it("APP_ONLY: three features enterable by app-domain permission, Operations hidden, and every readiness NOT_CHECKED", () => {
    const body = navigation(NAV_APP_ONLY);
    expect(body.features.map((item) => [item.feature, item.state, item.authorityMode])).toEqual([
      ["EXECUTION_PORTFOLIOS", "ENTERABLE", "APP_ONLY"],
      ["EXECUTION_ACCOUNTS_BINDINGS", "ENTERABLE", "APP_ONLY"],
      ["EXECUTION_OPERATIONS", "HIDDEN", "NOT_ESTABLISHED"],
      ["EXECUTION_BLOTTER", "ENTERABLE", "APP_ONLY"],
    ]);
    for (const item of body.features) {
      expect(item.unchecked).toEqual({ familyCheck: "NOT_CHECKED", sourceReadiness: "NOT_CHECKED", fieldReadiness: "NOT_CHECKED", commandReadiness: "NOT_CHECKED" });
    }
    expect(enterableSelfNavFeatures(body)).toEqual(["EXECUTION_PORTFOLIOS", "EXECUTION_ACCOUNTS_BINDINGS", "EXECUTION_BLOTTER"]);
    expect(selfNavItem(body, "EXECUTION_OPERATIONS").state).toBe("HIDDEN");
  });

  it("no permission: all four hidden, and the Profile & Access entry is still SELF_ONLY with no route", () => {
    const body = navigation(NAV_HIDDEN);
    expect(enterableSelfNavFeatures(body)).toEqual([]);
    expect(body.selfEntry).toEqual({ feature: "PROFILE_ACCESS", mode: "SELF_ONLY", route: null, consumerState: "AWAITING_CONSUMER_ROUTER" });
  });

  it("the read mode is routing metadata: it moves nothing about what is enterable", () => {
    for (const [body, mode] of [[NAV_HIDDEN, "NOT_ESTABLISHED"], [NAV_LEGACY, "LEGACY_COMPATIBILITY"], [NAV_V2, "SCOPED_V2"]] as const) {
      const read = navigation(body);
      expect(read.currentReadMode).toBe(mode);
      expect(enterableSelfNavFeatures(read)).toEqual([]);
    }
    // The same enterable set under every read mode.
    for (const mode of ["NOT_ESTABLISHED", "LEGACY_COMPATIBILITY", "SCOPED_V2"]) {
      expect(enterableSelfNavFeatures(navigation(edit(NAV_APP_ONLY, (b) => { b.current_read_mode = mode; })))).toHaveLength(3);
    }
  });

  it.each<[string, (b: Draft) => void]>([
    ["an extra key", (b) => { b.route = "/profile"; }],
    ["an extra key on an item", (b) => { b.features[0].route = "/portfolios"; }],
    ["three features", (b) => { b.features.pop(); }],
    ["five features", (b) => { b.features.push(clone(b.features[0])); }],
    ["features out of order", (b) => { b.features.reverse(); }],
    ["a repeated feature", (b) => { b.features[3] = clone(b.features[0]); }],
    ["an unknown feature", (b) => { b.features[0].feature = "EXECUTION_FLEET"; }],
    ["ENTERABLE with NOT_ESTABLISHED", (b) => { b.features[0].authority_mode = "NOT_ESTABLISHED"; }],
    ["HIDDEN with APP_ONLY", (b) => { b.features[2].authority_mode = "APP_ONLY"; }],
    ["Operations ENTERABLE by APP_ONLY", (b) => { b.features[2].state = "ENTERABLE"; b.features[2].authority_mode = "APP_ONLY"; }],
    ["a family check that ran", (b) => { b.features[0].family_check = "PASSED"; }],
    ["a source readiness that ran", (b) => { b.features[0].source_readiness = "READY"; }],
    ["a field readiness that ran", (b) => { b.features[0].field_readiness = "READY"; }],
    ["a command readiness that ran", (b) => { b.features[0].command_readiness = "READY"; }],
    ["an unknown read mode", (b) => { b.current_read_mode = "SCOPED_V3"; }],
    ["a route on the self entry", (b) => { b.self_entry.route = "/profile"; }],
    ["a self entry that is not SELF_ONLY", (b) => { b.self_entry.mode = "ALL"; }],
    ["a self entry that is a router", (b) => { b.self_entry.consumer_state = "ROUTED"; }],
    ["a missing self entry", (b) => { delete b.self_entry; }],
    ["current_only false", (b) => { b.current_only = false; }],
    ["advisory_only false", (b) => { b.advisory_only = false; }],
  ])("%s voids the read", (_name, change) => {
    expect(readAccessSelfNavigation(edit(NAV_APP_ONLY, change))).toBeNull();
  });
});

describe("requests", () => {
  const request: EligibilityRequest = {
    workspaceId: "ws_TEST_ONLY", environment: "paper", resource: { kind: "PORTFOLIO", id: "portfolio_TEST_ONLY" }, actions: ["portfolio.read", "audit.read"],
  };

  it("builds the strict five-key query with one comma-separated actions value", () => {
    expect(accessEligibilityUrl(request)).toBe(
      `${ACCESS_ELIGIBILITY_PATH}?workspace_id=ws_TEST_ONLY&environment=paper&resource_kind=PORTFOLIO&resource_id=portfolio_TEST_ONLY&actions=portfolio.read,audit.read`,
    );
    const url = new URL(accessEligibilityUrl(request)!, "https://portal.test");
    expect([...url.searchParams.keys()]).toEqual(["workspace_id", "environment", "resource_kind", "resource_id", "actions"]);
    expect(url.searchParams.get("actions")).toBe("portfolio.read,audit.read");
  });

  it("encodes selectors that need it", () => {
    const url = accessEligibilityUrl({ ...request, workspaceId: "ws a&b=c", resource: { kind: "ACCOUNT", id: "acct/1?x" } })!;
    const parsed = new URL(url, "https://portal.test");
    expect(parsed.searchParams.get("workspace_id")).toBe("ws a&b=c");
    expect(parsed.searchParams.get("resource_id")).toBe("acct/1?x");
  });

  it.each<[string, EligibilityRequest]>([
    ["no actions", { ...request, actions: [] }],
    ["17 actions", { ...request, actions: Array(17).fill("portfolio.read") }],
    ["a repeated action", { ...request, actions: ["portfolio.read", "portfolio.read"] }],
    ["an unknown action", { ...request, actions: ["portfolio.write" as never] }],
    ["an unknown environment", { ...request, environment: "prod" as never }],
    ["an unknown resource kind", { ...request, resource: { kind: "FUND" as never, id: "x" } }],
    ["an empty workspace", { ...request, workspaceId: "" }],
    ["a control character in the resource id", { ...request, resource: { kind: "ROOT", id: "a\nb" } }],
  ])("%s gives no URL, so no request the server would refuse is ever sent", (_name, bad) => {
    expect(accessEligibilityUrl(bad)).toBeNull();
  });

  it("sixteen distinct actions are the most one request may carry", () => {
    const sixteen: EligibilityRequest = { ...request, actions: ["alpha.read", "portfolio.read", "portfolio.read_restricted", "portfolio.discover_linked", "account.read", "binding.read", "audit.read", "governance.r1.read", "governance.r2.read", "governance.canary.read", "governance.live.read", "governance.r1.decide", "governance.r2.decide", "governance.canary.decide", "governance.live.decide", "maintenance.read"] };
    expect(accessEligibilityUrl(sixteen)).not.toBeNull();
    expect(accessEligibilityUrl({ ...sixteen, actions: [...sixteen.actions, "development.read"] })).toBeNull();
  });

  it("the navigation query is exactly workspace_id and environment", () => {
    expect(accessSelfNavigationUrl({ workspaceId: "ws_TEST_ONLY", environment: "live" })).toBe(`${ACCESS_SELF_NAVIGATION_PATH}?workspace_id=ws_TEST_ONLY&environment=live`);
    expect(accessSelfNavigationUrl({ workspaceId: "", environment: "live" })).toBeNull();
    expect(accessSelfNavigationUrl({ workspaceId: "ws", environment: "prod" as never })).toBeNull();
  });

  it("an answer is for the question that was asked, or it is not shown", () => {
    const body = eligibility(POSITIVE);
    expect(eligibilityAnswers(body, { ...request, actions: ["portfolio.read"] })).toBe(true);
    expect(eligibilityAnswers(body, request)).toBe(false);
    expect(eligibilityAnswers(body, { ...request, actions: ["portfolio.read"], resource: { kind: "PORTFOLIO", id: "portfolio_other" } })).toBe(false);
    expect(eligibilityAnswers(body, { ...request, actions: ["portfolio.read"], environment: "live" })).toBe(false);
    expect(eligibilityAnswers(body, { ...request, actions: ["portfolio.read"], workspaceId: "ws_other" })).toBe(false);
    const nav = navigation(NAV_APP_ONLY);
    expect(navigationAnswers(nav, { workspaceId: "ws_TEST_ONLY", environment: "paper" })).toBe(true);
    expect(navigationAnswers(nav, { workspaceId: "ws_TEST_ONLY", environment: "live" })).toBe(false);
  });
});
