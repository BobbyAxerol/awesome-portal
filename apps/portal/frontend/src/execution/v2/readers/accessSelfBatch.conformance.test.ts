/**
 * Reader conformance for `accessSelfBatch.ts` (FE-068, Rules 9.8.3).
 *
 * Oracle: `execution-access.openapi.json#/components/schemas/AccessEligibilityBatch` through the testkit checker, and the two
 * canonical `batch_cases` (STEP_UP_REQUIRED_NOT_ACTIVE, STEP_UP_ACTIVE) of `execution-access.synthetic.valid.json`, digest-checked.
 * The single-resource reader (`accessSelf.ts`) is untouched and keeps its own suite; this file proves the second reader, not the first.
 * Lane: FIXTURE_LAB (synthetic TEST_ONLY bodies; not a runtime read).
 */
import { afterAll, describe, expect, it } from "vitest";

import { canonicalDigest, loadCanonical, schemaEnum } from "../testkit/loadCanonical";
import { getPath, type Draft } from "../testkit/matrix";
import { enumCases, integerCases, leaked, pollutionCases, prototypeIsClean, requiredCases, rootCases, schemaVersionCases, stringCases } from "../testkit/negative";
import { validateAgainst } from "../testkit/schema";
import {
  ACCESS_ELIGIBILITY_BATCH_SCHEMA, ELIGIBILITY_STEP_UP_STATES, accessEligibilityBatchUrl, batchResult, eligibilityBatchAnswers, readAccessEligibilityBatch,
  type AccessEligibilityBatch,
} from "./accessSelfBatch";

const FILE = "execution-access.synthetic";
const digestBefore = canonicalDigest(FILE);
afterAll(() => {
  expect(canonicalDigest(FILE)).toBe(digestBefore);
});

const OA = "../openapi/execution-access.openapi.json";
const PTR = "/components/schemas/AccessEligibilityBatch";
const ROW = "/components/schemas/AccessEligibilityBatchRow";
const violations = (value: unknown) => validateAgainst(OA, PTR, value);
const clone = <T,>(value: T): T => structuredClone(value);
const file = loadCanonical<{ batch_cases: { type: string; case_name: string; value: Draft }[] }>(FILE);
const BY_NAME: Record<string, Draft> = Object.fromEntries(file.batch_cases.map((c) => [c.case_name, c.value]));
const REQUIRED: Draft = BY_NAME.STEP_UP_REQUIRED_NOT_ACTIVE;
const ACTIVE: Draft = BY_NAME.STEP_UP_ACTIVE;

const batchOf = (raw: unknown): AccessEligibilityBatch | null => {
  const read = readAccessEligibilityBatch(raw);
  return read !== null && read.kind === "eligibility_batch" ? read.batch : null;
};
const edit = (base: Draft, change: (b: Draft) => void): Draft => {
  const copy = clone(base);
  change(copy);
  return copy;
};

describe("L0 · canonical, verbatim", () => {
  it("both batch cases are schema-valid and read", () => {
    expect(file.batch_cases.map((c) => c.type)).toEqual(["AccessEligibilityBatch", "AccessEligibilityBatch"]);
    expect(Object.keys(BY_NAME)).toEqual(["STEP_UP_REQUIRED_NOT_ACTIVE", "STEP_UP_ACTIVE"]);
    for (const [name, body] of Object.entries(BY_NAME)) {
      expect(violations(body), name).toEqual([]);
      expect(batchOf(body), name).not.toBeNull();
    }
  });

  it("REQUIRED: a true rule with no active session step-up is REQUIRED, and a dead step-up button is told before the click", () => {
    const batch = batchOf(REQUIRED)!;
    expect(batch.sessionStepUp).toMatchObject({ state: "NOT_ACTIVE", validUntilMs: null, challenge: { preconditionMet: false, mechanism: "PASSWORD_REAUTH" } });
    const portfolio = batchResult(batch, "PORTFOLIO", "portfolio_TEST_ONLY")!;
    expect(portfolio.actions.map((a) => [a.action, a.stepUpRequired, a.stepUpState])).toEqual([
      ["portfolio.read", false, "NOT_REQUIRED"], ["capital.top_up", true, "REQUIRED"],
    ]);
  });

  it("ACTIVE: the same rule is ACTIVE while this session holds a step-up, which ends before the session ceiling", () => {
    const batch = batchOf(ACTIVE)!;
    expect(batch.sessionStepUp).toMatchObject({ state: "ACTIVE", validUntilMs: 1792094403000, challenge: { preconditionMet: true } });
    expect(batch.sessionStepUp.validUntilMs!).toBeLessThanOrEqual(batch.validUntilMs);
    expect(batchResult(batch, "DEPLOYMENT", "deployment_TEST_ONLY")!.actions[1]).toMatchObject({ action: "capital.top_up", stepUpState: "ACTIVE" });
  });

  it("an action one resource cannot take is a per-resource ACTION_TARGET_UNSUPPORTED, not a batch failure", () => {
    const deployment = batchResult(batchOf(REQUIRED)!, "DEPLOYMENT", "deployment_TEST_ONLY")!;
    expect(deployment.actions[0]).toMatchObject({ action: "portfolio.read", permission: "UNAVAILABLE", reasonClass: "ACTION_TARGET_UNSUPPORTED", grantRef: null });
    expect(deployment.actions[1]!.permission).toBe("ALLOWED");
  });

  it("the v1 constants still travel with every row: the three checks nobody made are NOT_CHECKED", () => {
    for (const body of Object.values(BY_NAME)) {
      for (const result of batchOf(body)!.results) {
        for (const row of result.actions) expect(row.unchecked).toEqual({ stepUpFreshness: "NOT_CHECKED", challengeAvailability: "NOT_CHECKED", commandReadiness: "NOT_CHECKED" });
      }
    }
  });

  it("the closed words are the schema's, word for word", () => {
    expect([...ELIGIBILITY_STEP_UP_STATES]).toEqual([...schemaEnum(OA, `${ROW}/properties/step_up_state`)]);
    expect(ACCESS_ELIGIBILITY_BATCH_SCHEMA).toBe("portal.self-eligibility-batch.v1");
  });

  it("the v1 single-resource body is another schema: typed unsupported_shape", () => {
    expect(readAccessEligibilityBatch(edit(REQUIRED, (b) => { b.schema_version = "portal.self-eligibility.v1"; }))).toEqual({
      kind: "unsupported_shape", schemaVersion: "portal.self-eligibility.v1",
    });
  });
});

describe("L1 · runtime rules and cross-field rules", () => {
  it.each<[string, Draft, (b: Draft) => void, boolean]>([
    ["a step_up_state that contradicts a false rule", REQUIRED, (b) => { b.results[0].actions[0].step_up_state = "REQUIRED"; }, true],
    ["a true rule shown NOT_REQUIRED", REQUIRED, (b) => { b.results[0].actions[1].step_up_state = "NOT_REQUIRED"; }, true],
    ["a true rule PLAN_DEPENDENT", REQUIRED, (b) => { b.results[0].actions[1].step_up_state = "PLAN_DEPENDENT"; }, true],
    ["ACTIVE row while the session step-up is NOT_ACTIVE", REQUIRED, (b) => { b.results[0].actions[1].step_up_state = "ACTIVE"; }, false],
    ["REQUIRED row while the session step-up is ACTIVE", ACTIVE, (b) => { b.results[0].actions[1].step_up_state = "REQUIRED"; }, false],
    ["a step_up_state missing", REQUIRED, (b) => { delete b.results[0].actions[0].step_up_state; }, true],
    ["session step-up ACTIVE ending after the session ceiling", ACTIVE, (b) => { b.session_step_up.valid_until_ms = b.valid_until_ms + 1; }, false],
    ["session step-up ACTIVE ending at the evaluation time", ACTIVE, (b) => { b.session_step_up.valid_until_ms = b.observed_at_ms; }, false],
    ["session step-up NOT_ACTIVE with an end", REQUIRED, (b) => { b.session_step_up.valid_until_ms = b.valid_until_ms; }, true],
    ["a challenge route that is not the step-up route", REQUIRED, (b) => { b.session_step_up.challenge.route = "/api/admin/profile-access/v2/other"; }, true],
    ["a challenge mechanism that is not PASSWORD_REAUTH", REQUIRED, (b) => { b.session_step_up.challenge.mechanism = "TOTP"; }, true],
    ["precondition_met as text", REQUIRED, (b) => { b.session_step_up.challenge.precondition_met = "false"; }, true],
    ["challenge dropped", REQUIRED, (b) => { delete b.session_step_up.challenge; }, true],
    ["the same resource twice", REQUIRED, (b) => { b.results[1].resource = clone(b.results[0].resource); }, false],
    ["resources answering different actions", REQUIRED, (b) => { b.results[1].actions.pop(); }, false],
    ["resources answering the actions in another order", REQUIRED, (b) => { b.results[1].actions.reverse(); }, false],
    ["nine resources", REQUIRED, (b) => { b.results = Array.from({ length: 9 }, (_, n) => ({ ...clone(b.results[0]), resource: { kind: "PORTFOLIO", id: `p${n}` } })); }, true],
    ["no resources", REQUIRED, (b) => { b.results = []; }, true],
    ["an action repeated inside one resource", REQUIRED, (b) => { b.results[0].actions[1] = clone(b.results[0].actions[0]); b.results[1].actions[1] = clone(b.results[1].actions[0]); }, false],
    ["a granted action carrying no grant", REQUIRED, (b) => { b.results[0].actions[0].grant_ref = null; }, true],
    ["a compatible kind answered ACTION_TARGET_UNSUPPORTED", REQUIRED, (b) => {
      Object.assign(b.results[0].actions[0], { permission: "UNAVAILABLE", reason_class: "ACTION_TARGET_UNSUPPORTED", public_copy_key: "ACTION_TARGET_UNSUPPORTED", grant_ref: null, authority_mode: "NOT_ESTABLISHED" });
    }, false],
    ["valid_until_ms equal to observed_at_ms", REQUIRED, (b) => { b.valid_until_ms = b.observed_at_ms; }, false],
    ["a key added", REQUIRED, (b) => { b.ttl_ms = 1; }, true],
    ["advisory_only false", REQUIRED, (b) => { b.advisory_only = false; }, true],
  ])("%s voids the read", (name, base, change, schemaSays) => {
    const body = edit(base, change);
    expect(readAccessEligibilityBatch(body), name).toBeNull();
    // `schemaSays`: whether the published schema can express the rule. Where it cannot, the reader is stricter by design.
    if (schemaSays) expect(violations(body).length, name).toBeGreaterThan(0);
  });

  it("the request URL: one comma-separated resources value, canonical tokens, or refused", () => {
    const request = {
      workspaceId: "ws_TEST_ONLY", environment: "paper",
      resources: [{ kind: "PORTFOLIO", id: "portfolio_TEST_ONLY" }, { kind: "DEPLOYMENT", id: "dep,with comma/and space" }],
      actions: ["portfolio.read", "capital.top_up"],
    } as const;
    expect(accessEligibilityBatchUrl(request)).toBe(
      "/api/admin/profile-access/v2/eligibility/batch?workspace_id=ws_TEST_ONLY&environment=paper"
      + "&resources=PORTFOLIO:portfolio_TEST_ONLY,DEPLOYMENT:dep%252Cwith%2520comma%252Fand%2520space&actions=portfolio.read,capital.top_up",
    );
    const bad = (patch: object) => accessEligibilityBatchUrl({ ...request, ...patch } as never);
    expect(bad({ resources: [] })).toBeNull();
    expect(bad({ resources: Array.from({ length: 9 }, (_, n) => ({ kind: "PORTFOLIO", id: `p${n}` })) })).toBeNull();
    expect(bad({ resources: [request.resources[0], request.resources[0]] })).toBeNull();
    expect(bad({ resources: [{ kind: "WALLET", id: "x" }] })).toBeNull();
    expect(bad({ actions: [] })).toBeNull();
    expect(bad({ actions: ["portfolio.read", "portfolio.read"] })).toBeNull();
    expect(bad({ actions: ["canary.hold"] })).toBeNull();
    expect(bad({ environment: "prod" })).toBeNull();
  });

  it("a body answers only the question asked", () => {
    const batch = batchOf(REQUIRED)!;
    const request = {
      workspaceId: "ws_TEST_ONLY", environment: "paper",
      resources: [{ kind: "PORTFOLIO", id: "portfolio_TEST_ONLY" }, { kind: "DEPLOYMENT", id: "deployment_TEST_ONLY" }],
      actions: ["portfolio.read", "capital.top_up"],
    } as const;
    expect(eligibilityBatchAnswers(batch, request)).toBe(true);
    expect(eligibilityBatchAnswers(batch, { ...request, environment: "live" })).toBe(false);
    expect(eligibilityBatchAnswers(batch, { ...request, resources: [request.resources[0]] })).toBe(false);
    expect(eligibilityBatchAnswers(batch, { ...request, actions: ["portfolio.read"] })).toBe(false);
    expect(eligibilityBatchAnswers(batch, { ...request, workspaceId: "other" })).toBe(false);
  });
});

/* ═════════════════ L3 · generated negatives ═════════════════ */
interface Case { name: string; category: string; value: unknown; probe: string | null }
const enumsOf = (base: Draft, path: readonly (string | number)[], valid: readonly unknown[]): Case[] =>
  enumCases(base, path, valid.map(String)).filter((c) => !valid.includes(getPath(c.value, path)));
const ROW_FIELDS = ["action", "permission", "reason_class", "public_copy_key", "grant_ref", "authority_mode", "step_up_required", "step_up_freshness", "challenge_availability", "command_readiness", "family_check", "step_up_state"];

const NEG: Case[] = [
  ...requiredCases(REQUIRED, ["schema_version", "workspace_id", "environment", "current_only", "advisory_only", "observed_at_ms", "valid_until_ms", "session_step_up", "results"].map((k) => [k] as const)),
  ...requiredCases(REQUIRED, ["state", "valid_until_ms", "challenge"].map((k) => ["session_step_up", k] as const)),
  ...requiredCases(REQUIRED, ["mechanism", "route", "precondition", "precondition_met"].map((k) => ["session_step_up", "challenge", k] as const)),
  ...requiredCases(REQUIRED, [["results", 0, "resource"], ["results", 0, "actions"], ["results", 0, "resource", "kind"], ["results", 0, "resource", "id"]]),
  ...requiredCases(REQUIRED, ROW_FIELDS.flatMap((k) => [["results", 0, "actions", 0, k] as const, ["results", 1, "actions", 1, k] as const])),
  ...enumsOf(REQUIRED, ["environment"], ["paper", "sandbox", "live"]),
  ...enumsOf(REQUIRED, ["results", 0, "actions", 1, "step_up_state"], [...ELIGIBILITY_STEP_UP_STATES]),
  ...enumsOf(REQUIRED, ["session_step_up", "state"], ["ACTIVE", "NOT_ACTIVE"]),
  ...integerCases(REQUIRED, ["observed_at_ms"]),
  ...integerCases(REQUIRED, ["valid_until_ms"]),
  ...integerCases(ACTIVE, ["session_step_up", "valid_until_ms"]),
  ...stringCases(REQUIRED, ["workspace_id"]),
  ...stringCases(REQUIRED, ["results", 0, "resource", "id"]),
  ...schemaVersionCases(REQUIRED, ["schema_version"], ACCESS_ELIGIBILITY_BATCH_SCHEMA, ["portal.self-eligibility.v1", "portal.self-eligibility-batch.v2"]),
  ...pollutionCases(REQUIRED, [[], ["session_step_up"], ["session_step_up", "challenge"], ["results", 0], ["results", 0, "resource"], ["results", 0, "actions", 0]]),
];

describe("L3 · negative · AccessEligibilityBatch", () => {
  it("has a substantial case count", () => {
    console.info(`accessSelfBatch L3: ${NEG.length} cases`);
    expect(NEG.length).toBeGreaterThan(150);
  });

  it.each(NEG.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    expect(() => readAccessEligibilityBatch(c.value)).not.toThrow();
    const answer = readAccessEligibilityBatch(c.value) as { kind: string } | null;
    expect(leaked(answer, c.probe)).toBe(false);
    expect(prototypeIsClean()).toBe(true);
    const accepted = answer !== null && answer.kind !== "unsupported_shape";
    if (accepted) expect(getPath(c.value, ["schema_version"])).toBe(ACCESS_ELIGIBILITY_BATCH_SCHEMA);
    if (accepted && c.category !== "prototype-pollution") expect(violations(c.value), `accepted though schema-invalid: ${c.name}`).toEqual([]);
  });

  it("an unknown word is never a state", () => {
    for (const c of NEG.filter((x) => x.category === "unknown-enum")) {
      const answer = readAccessEligibilityBatch(c.value) as { kind: string } | null;
      expect(answer === null || answer.kind === "unsupported_shape", c.name).toBe(true);
    }
  });

  it.each(rootCases().map((c) => [c.name, c] as const))("%s reads as nothing", (_name, c) => {
    expect(() => readAccessEligibilityBatch(c.value)).not.toThrow();
    const answer = readAccessEligibilityBatch(c.value);
    if (answer !== null) expect(answer).toEqual({ kind: "unsupported_shape", schemaVersion: null });
  });
});
