/**
 * V2 access reader against the canonical contract fixture and the e2e double.
 *
 * The shipped fixture (`execution-access.synthetic.valid.json`, case
 * `AccessEffective`) is POLICY_PENDING with no grants; the AVAILABLE case is the
 * double's synthetic grants. Negative cases are mutations of those bodies,
 * never a second hand-written copy.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { ACCESS_DOUBLE_WORKSPACES, answerAccessEffective } from "../../../../e2e/bffDoubleAccess";
import {
  ACCESS_EFFECTIVE_PATH,
  ACCESS_EFFECTIVE_SCHEMA,
  accessEffectiveUrl,
  MAX_GRANTS,
  readAccessEffective,
  type AccessEffective,
} from "./accessEffective";

const FIXTURE = JSON.parse(
  readFileSync(join(__dirname, "../../../../../../../packages/contracts/fixtures/execution-access.synthetic.valid.json"), "utf8"),
) as { cases: { type: string; value: Record<string, any> }[] };
const PENDING = FIXTURE.cases.find((entry) => entry.type === "AccessEffective")!.value;

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const pendingWith = (edit: (body: Record<string, any>) => void) => {
  const body = clone(PENDING);
  edit(body);
  return body;
};

function granted(): Record<string, any> {
  const answer = answerAccessEffective(
    "GET",
    "/api/admin/profile-access/v2/effective",
    new URLSearchParams({ workspace_id: ACCESS_DOUBLE_WORKSPACES.available }),
  );
  return clone(answer!.body as Record<string, any>);
}

function effective(raw: unknown): AccessEffective {
  const read = readAccessEffective(raw);
  expect(read?.kind).toBe("effective");
  return (read as { effective: AccessEffective }).effective;
}

describe("the contract fixture", () => {
  it("reads as POLICY_PENDING with no grants, its reason and the constant owner recovery", () => {
    const body = effective(PENDING);
    expect(body.availability).toBe("POLICY_PENDING");
    expect(body.reasonCode).toBe("POLICY_PENDING");
    expect(body.policyRevision).toBeNull();
    expect(body.grants).toEqual([]);
    expect(body.researcherFieldPolicy).toEqual({ state: "PENDING", policyRef: null });
    expect(body.ownerRecovery).toEqual({ enabled: false, reasonCode: "OWNER_RECOVERY_NOT_APPROVED" });
    expect(body.userId).toBe("usr_TEST_ONLY");
  });

  it("the double's pending answer is the fixture, with only the ids swapped", () => {
    const answer = answerAccessEffective("GET", "/api/admin/profile-access/v2/effective", new URLSearchParams({ workspace_id: "ws_anything" }), { userId: "u_me" });
    expect(answer?.status).toBe(200);
    expect(answer?.body).toEqual({ ...PENDING, workspace_id: "ws_anything", user_id: "u_me" });
  });
});

describe("AVAILABLE with grants", () => {
  it("reads four grants with typed selectors, environments, validity and authority", () => {
    const body = effective(granted());
    expect(body.availability).toBe("AVAILABLE");
    expect(body.reasonCode).toBeNull();
    expect(body.policyRevision).toBe("p1_TEST_ONLY");
    expect(body.grants.map((grant) => grant.selector.kind)).toEqual([
      "EXPLICIT_RESOURCE_SET", "OWN_ALPHA", "PORTFOLIO_MEMBERSHIP", "ROOT_SCOPE",
    ]);
    const [first, , third, fourth] = body.grants;
    expect(first.environments).toEqual(["paper", "sandbox"]);
    expect(first.validUntil).toBeNull();
    expect(third.current).toBe(false);
    expect(third.tsAuthority).toBe("PENDING");
    expect(fourth.effect).toBe("DENY");
  });
});

describe("strict at the boundary", () => {
  it.each([null, undefined, "text", 7, [], true])("a non-object body (%s) is malformed", (raw) => {
    expect(readAccessEffective(raw)).toBeNull();
  });

  it("another schema is unsupported_shape and its fields are never read", () => {
    expect(readAccessEffective({ ...PENDING, schema_version: "portal.access-effective.v2" })).toEqual({
      kind: "unsupported_shape", schemaVersion: "portal.access-effective.v2",
    });
    expect(readAccessEffective({ grants: [] })).toEqual({ kind: "unsupported_shape", schemaVersion: null });
    expect(readAccessEffective({ schema_version: 1 })).toEqual({ kind: "unsupported_shape", schemaVersion: null });
    expect(ACCESS_EFFECTIVE_SCHEMA).toBe("portal.access-effective.v1");
  });

  it.each<[string, (b: Record<string, any>) => void]>([
    ["missing workspace_id", (b) => { delete b.workspace_id; }],
    ["empty user_id", (b) => { b.user_id = ""; }],
    ["unknown availability", (b) => { b.availability = "DEGRADED"; }],
    ["POLICY_PENDING without a reason", (b) => { b.reason_code = null; }],
    ["AVAILABLE that still carries a reason", (b) => { b.availability = "AVAILABLE"; }],
    ["a reason that is not a token", (b) => { b.reason_code = "not a token"; }],
    ["grants that are not an array", (b) => { b.grants = {}; }],
    ["policy_revision as a number", (b) => { b.policy_revision = 3; }],
    ["researcher policy in an unknown state", (b) => { b.researcher_field_policy.state = "DRAFT"; }],
    ["QUALIFIED without a policy_ref", (b) => { b.researcher_field_policy.state = "QUALIFIED"; }],
    ["researcher_field_policy missing", (b) => { delete b.researcher_field_policy; }],
    ["owner recovery enabled", (b) => { b.owner_recovery.enabled = true; }],
    ["owner recovery with another reason", (b) => { b.owner_recovery.reason_code = "OWNER_RECOVERY_APPROVED"; }],
    ["owner_recovery missing", (b) => { delete b.owner_recovery; }],
  ])("%s voids the read", (_name, edit) => {
    expect(readAccessEffective(pendingWith(edit))).toBeNull();
  });

  it("QUALIFIED with a reference is read as published", () => {
    const body = effective(pendingWith((b) => { b.researcher_field_policy = { state: "QUALIFIED", policy_ref: "pol_TEST_ONLY" }; }));
    expect(body.researcherFieldPolicy).toEqual({ state: "QUALIFIED", policyRef: "pol_TEST_ONLY" });
  });

  it.each<[string, (g: Record<string, any>) => void]>([
    ["an action outside the dotted grammar", (g) => { g.action = "NOT A TOKEN"; }],
    ["a one-word action", (g) => { g.action = "read"; }],
    ["an unknown effect", (g) => { g.effect = "ALLOW_ALL"; }],
    ["an unknown selector kind", (g) => { g.selector = { kind: "EVERYTHING" }; }],
    ["an explicit set with no ids", (g) => { g.selector = { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "PORTFOLIO", ids: [] }; }],
    ["an explicit set of an unknown resource kind", (g) => { g.selector = { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "GALAXY", ids: ["x"] }; }],
    ["duplicate ids", (g) => { g.selector.ids = ["a", "a"]; }],
    ["no environments", (g) => { g.environments = []; }],
    ["an unknown environment", (g) => { g.environments = ["staging"]; }],
    ["a repeated environment", (g) => { g.environments = ["paper", "paper"]; }],
    ["an ISO instant instead of epoch ms", (g) => { g.valid_from_ms = "2026-09-01T09:14:00Z"; }],
    ["a fractional instant", (g) => { g.valid_from_ms = 1.5; }],
    ["an end before the start", (g) => { g.valid_until_ms = g.valid_from_ms - 1; }],
    ["an empty interval", (g) => { g.valid_until_ms = g.valid_from_ms; }],
    ["current as a string", (g) => { g.current = "true"; }],
    ["an unknown ts_authority", (g) => { g.ts_authority = "MAYBE"; }],
    ["no revision", (g) => { delete g.revision; }],
  ])("a grant with %s voids the whole read", (_name, edit) => {
    const body = granted();
    edit(body.grants[0]);
    expect(readAccessEffective(body)).toBeNull();
  });

  it("one bad grant among good ones is not dropped quietly", () => {
    const body = granted();
    body.grants[2].effect = "MAYBE";
    expect(readAccessEffective(body)).toBeNull();
  });

  it("a repeated grant_id voids the read", () => {
    const body = granted();
    body.grants[1].grant_id = body.grants[0].grant_id;
    expect(readAccessEffective(body)).toBeNull();
  });

  it(`more than ${MAX_GRANTS} grants is refused`, () => {
    const body = granted();
    body.grants = Array.from({ length: MAX_GRANTS + 1 }, (_, i) => ({ ...body.grants[0], grant_id: `g${i}` }));
    expect(readAccessEffective(body)).toBeNull();
  });

  it("the double's malformed answer is refused by this reader", () => {
    const answer = answerAccessEffective("GET", "/api/admin/profile-access/v2/effective", new URLSearchParams({ workspace_id: ACCESS_DOUBLE_WORKSPACES.malformed }));
    expect(readAccessEffective(answer!.body)).toBeNull();
  });
});

describe("the request", () => {
  it("names workspace_id only, encoded", () => {
    expect(accessEffectiveUrl("ws a/b")).toBe(`${ACCESS_EFFECTIVE_PATH}?workspace_id=ws%20a%2Fb`);
  });
});

describe("the double", () => {
  const route = "/api/admin/profile-access/v2/effective";
  const ask = (workspace: string) => answerAccessEffective("GET", route, new URLSearchParams({ workspace_id: workspace }));

  it("answers the denied and unavailable states as the server would", () => {
    expect(ask(ACCESS_DOUBLE_WORKSPACES.denied)?.status).toBe(403);
    expect(ask(ACCESS_DOUBLE_WORKSPACES.unavailable)?.status).toBe(503);
  });

  it("holds the strict query: none, extra or repeated workspace_id is 400", () => {
    expect(answerAccessEffective("GET", route, new URLSearchParams())?.status).toBe(400);
    expect(answerAccessEffective("GET", route, new URLSearchParams("workspace_id=a&x=1"))?.status).toBe(400);
    expect(answerAccessEffective("GET", route, new URLSearchParams("workspace_id=a&workspace_id=b"))?.status).toBe(400);
  });

  it("does not answer another path or a non-GET", () => {
    expect(answerAccessEffective("GET", "/api/admin/profile-access", new URLSearchParams("workspace_id=a"))).toBeNull();
    expect(answerAccessEffective("POST", route, new URLSearchParams("workspace_id=a"))).toBeNull();
  });

  it("an empty AVAILABLE answer is a real shape, not the pending one", () => {
    const body = effective(ask(ACCESS_DOUBLE_WORKSPACES.empty)!.body);
    expect(body.availability).toBe("AVAILABLE");
    expect(body.grants).toEqual([]);
  });
});
