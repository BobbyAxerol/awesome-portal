/**
 * Reader conformance for `stageActionEligibility.ts` (FE-068, Rules 9.8.3).
 *
 * Oracle: `execution-governance.openapi.json#/components/schemas/StageActionEligibility` through the testkit checker, and the seven
 * canonical cases of `governance-requester-reads.synthetic.valid.json#stage_action_eligibility`, digest-checked.
 * Lane: FIXTURE_LAB (synthetic TEST_ONLY bodies; not a runtime read).
 */
import { afterAll, describe, expect, it } from "vitest";

import { canonicalDigest, loadCanonical, schemaEnum } from "../testkit/loadCanonical";
import { getPath, type Draft } from "../testkit/matrix";
import { enumCases, integerCases, leaked, pollutionCases, prototypeIsClean, requiredCases, rootCases, schemaVersionCases, stringCases } from "../testkit/negative";
import { validateAgainst } from "../testkit/schema";
import {
  STAGE_ACTIONS, STAGE_ACTION_ELIGIBILITY_SCHEMA, STAGE_ALPHA_SCOPES, STAGE_BASES, STAGE_REASON_CLASSES, STAGE_STEP_UP_STATES, STAGE_VERDICTS,
  readStageActionEligibilityV1, stageActionEligibilityUrl, stageActionRow, type StageActionEligibility,
} from "./stageActionEligibility";

const FILE = "governance-requester-reads.synthetic";
const digestBefore = canonicalDigest(FILE);
afterAll(() => {
  expect(canonicalDigest(FILE)).toBe(digestBefore);
});

const OA = "../openapi/execution-governance.openapi.json";
const PTR = "/components/schemas/StageActionEligibility";
const ROW = "/components/schemas/StageActionEligibilityRow";
const violations = (value: unknown) => validateAgainst(OA, PTR, value);
const clone = <T,>(value: T): T => structuredClone(value);
const CASES = loadCanonical<{ stage_action_eligibility: Record<string, Draft> }>(FILE).stage_action_eligibility;
const BASE: Draft = CASES.admin_with_r2_read;

const eligibilityOf = (raw: unknown): StageActionEligibility | null => {
  const read = readStageActionEligibilityV1(raw);
  return read !== null && read.kind === "stage_action_eligibility" ? read.eligibility : null;
};
const edit = (base: Draft, change: (b: Draft) => void): Draft => {
  const copy = clone(base);
  change(copy);
  return copy;
};

describe("L0 · canonical, verbatim", () => {
  it("the seven canonical cases are schema-valid and read", () => {
    expect(Object.keys(CASES)).toEqual([
      "admin_with_r2_read", "plain_user", "admin_without_r2_grant", "admin_other_workspace_grant", "projection_not_authorized",
      "retained_review_read_only", "session_step_up_active",
    ]);
    for (const [name, body] of Object.entries(CASES)) {
      expect(violations(body), name).toEqual([]);
      const read = eligibilityOf(body);
      expect(read, name).not.toBeNull();
      expect(read!.actions.map((a) => a.action), name).toEqual([...STAGE_ACTIONS]);
      expect(read!.advisoryOnly && read!.currentOnly, name).toBe(true);
    }
  });

  it("the closed words the reader holds are the schema's, word for word", () => {
    expect([...STAGE_ACTIONS]).toEqual([...schemaEnum(OA, `${ROW}/properties/stage_action`)]);
    expect([...STAGE_VERDICTS]).toEqual([...schemaEnum(OA, `${ROW}/properties/verdict`)]);
    expect([...STAGE_REASON_CLASSES]).toEqual([...schemaEnum(OA, `${ROW}/properties/reason_class`)]);
    expect([...STAGE_REASON_CLASSES]).toEqual([...schemaEnum(OA, `${ROW}/properties/public_copy_key`)]);
    expect([...STAGE_BASES]).toEqual([...schemaEnum(OA, `${ROW}/properties/basis`)]);
    expect([...STAGE_STEP_UP_STATES]).toEqual([...schemaEnum(OA, `${ROW}/properties/step_up_state`)]);
    expect([...STAGE_ALPHA_SCOPES]).toEqual([...schemaEnum(OA, `${ROW}/properties/alpha_scope/anyOf/0`)]);
    expect(STAGE_ACTION_ELIGIBILITY_SCHEMA).toBe("portal.stage-action-eligibility.v1");
  });

  it("canary and live are NOT_COMMISSIONED in every case, with the basis NONE_PUBLISHED and step-up not determined (null, not false)", () => {
    for (const [name, body] of Object.entries(CASES)) {
      const read = eligibilityOf(body)!;
      for (const action of STAGE_ACTIONS.filter((a) => a.startsWith("canary.") || a.startsWith("live."))) {
        expect(stageActionRow(read, action), `${name} ${action}`).toMatchObject({
          verdict: "NOT_COMMISSIONED", eligible: false, reasonClass: "COMMAND_FAMILY_NOT_COMMISSIONED", basis: "NONE_PUBLISHED", stepUpRequired: null, stepUpState: "NOT_DETERMINED",
        });
      }
    }
  });

  it("each case says what the server said", () => {
    const rows = (name: string) => Object.fromEntries(eligibilityOf(CASES[name])!.actions.slice(0, 3).map((a) => [a.action, `${a.verdict}/${a.reasonClass}`]));
    expect(rows("admin_with_r2_read")).toEqual({
      "approval.create": "ELIGIBLE/SUBMIT_CHECKS_REQUIRED", "sandbox.review_note": "ELIGIBLE/SUBMIT_CHECKS_REQUIRED", "paper.exit_review_request": "ELIGIBLE/SUBMIT_CHECKS_REQUIRED",
    });
    expect(rows("plain_user")).toMatchObject({ "sandbox.review_note": "NOT_ELIGIBLE/ADMIN_ROLE_REQUIRED", "paper.exit_review_request": "NOT_ELIGIBLE/ADMIN_ROLE_REQUIRED" });
    expect(rows("admin_without_r2_grant")["paper.exit_review_request"]).toBe("NOT_ELIGIBLE/GOVERNANCE_CAPABILITY_REQUIRED");
    expect(rows("admin_other_workspace_grant")["paper.exit_review_request"]).toBe("NOT_ELIGIBLE/GOVERNANCE_SCOPE_MISMATCH");
    expect(rows("projection_not_authorized")["paper.exit_review_request"]).toBe("NOT_ELIGIBLE/CAPTURE_PROJECTION_NOT_AUTHORIZED");
    expect(rows("retained_review_read_only")).toEqual({
      "approval.create": "NOT_ELIGIBLE/RETAINED_REVIEW_READ_ONLY", "sandbox.review_note": "NOT_ELIGIBLE/RETAINED_REVIEW_READ_ONLY", "paper.exit_review_request": "NOT_ELIGIBLE/RETAINED_REVIEW_READ_ONLY",
    });
  });

  it("approval.create carries the server's alpha scope WORKSPACE_ALL_COMPLETED_RUNS and no other action carries one", () => {
    const read = eligibilityOf(BASE)!;
    expect(stageActionRow(read, "approval.create")!.alphaScope).toBe("WORKSPACE_ALL_COMPLETED_RUNS");
    expect(read.actions.filter((a) => a.alphaScope !== null).map((a) => a.action)).toEqual(["approval.create"]);
  });

  it("the session step-up is the session's own fact, and changes no verdict", () => {
    expect(eligibilityOf(CASES.session_step_up_active)!.sessionStepUp).toEqual({ state: "ACTIVE", validUntilMs: 1792300120000 });
    expect(eligibilityOf(BASE)!.sessionStepUp).toEqual({ state: "NOT_ACTIVE", validUntilMs: null });
    const verdicts = (c: Draft) => eligibilityOf(c)!.actions.map((a) => a.verdict);
    expect(verdicts(CASES.session_step_up_active)).toEqual(verdicts(BASE));
  });

  it("another schema_version is a typed unsupported_shape", () => {
    expect(readStageActionEligibilityV1(edit(BASE, (b) => { b.schema_version = "portal.stage-action-eligibility.v2"; }))).toEqual({
      kind: "unsupported_shape", schemaVersion: "portal.stage-action-eligibility.v2",
    });
  });
});

describe("L1 · cross-field rules (schema and reader agree)", () => {
  it.each<[string, Draft, (b: Draft) => void]>([
    ["a canary action turned ELIGIBLE", BASE, (b) => { Object.assign(b.actions[3], { verdict: "ELIGIBLE", eligible: true, reason_class: "SUBMIT_CHECKS_REQUIRED", public_copy_key: "SUBMIT_CHECKS_REQUIRED" }); }],
    ["a live action with step_up_required false", BASE, (b) => { b.actions[7].step_up_required = false; }],
    ["a live action with a basis", BASE, (b) => { b.actions[8].basis = "ADMIN_ROLE"; }],
    ["a live action with step_up_state NOT_REQUIRED", BASE, (b) => { b.actions[9].step_up_state = "NOT_REQUIRED"; }],
    ["approval.create NOT_COMMISSIONED", BASE, (b) => { Object.assign(b.actions[0], { verdict: "NOT_COMMISSIONED", eligible: false, reason_class: "COMMAND_FAMILY_NOT_COMMISSIONED", public_copy_key: "COMMAND_FAMILY_NOT_COMMISSIONED" }); }],
    ["approval.create without its alpha scope", BASE, (b) => { b.actions[0].alpha_scope = null; }],
    ["sandbox.review_note with an alpha scope", BASE, (b) => { b.actions[1].alpha_scope = "WORKSPACE_ALL_COMPLETED_RUNS"; }],
    ["a YOUR ALPHAS scope", BASE, (b) => { b.actions[0].alpha_scope = "YOUR_ALPHAS"; }],
    ["ELIGIBLE with eligible false", BASE, (b) => { b.actions[0].eligible = false; }],
    ["NOT_ELIGIBLE with eligible true", CASES.plain_user, (b) => { b.actions[1].eligible = true; }],
    ["ELIGIBLE carrying a refusal reason", BASE, (b) => { b.actions[1].reason_class = "ADMIN_ROLE_REQUIRED"; b.actions[1].public_copy_key = "ADMIN_ROLE_REQUIRED"; }],
    ["NOT_ELIGIBLE carrying SUBMIT_CHECKS_REQUIRED", CASES.plain_user, (b) => { b.actions[1].reason_class = "SUBMIT_CHECKS_REQUIRED"; b.actions[1].public_copy_key = "SUBMIT_CHECKS_REQUIRED"; }],
    ["NOT_ELIGIBLE carrying COMMAND_FAMILY_NOT_COMMISSIONED", CASES.plain_user, (b) => { b.actions[1].reason_class = "COMMAND_FAMILY_NOT_COMMISSIONED"; b.actions[1].public_copy_key = "COMMAND_FAMILY_NOT_COMMISSIONED"; }],
    ["public_copy_key differing from reason_class", CASES.plain_user, (b) => { b.actions[1].public_copy_key = "GOVERNANCE_SCOPE_MISMATCH"; }],
    ["two rows swapped", BASE, (b) => { [b.actions[3], b.actions[4]] = [b.actions[4], b.actions[3]]; }],
    ["nine rows", BASE, (b) => { b.actions.pop(); }],
    ["eleven rows", BASE, (b) => { b.actions.push(clone(b.actions[9])); }],
    ["an eleventh action name", BASE, (b) => { b.actions[9].stage_action = "live.resume"; }],
    ["ACTIVE with a null end", CASES.session_step_up_active, (b) => { b.session_step_up.valid_until_ms = null; }],
    ["ACTIVE ending at the evaluation time", CASES.session_step_up_active, (b) => { b.session_step_up.valid_until_ms = b.observed_at_ms; }],
    ["NOT_ACTIVE with an end", BASE, (b) => { b.session_step_up.valid_until_ms = 1792300120000; }],
    ["advisory_only false", BASE, (b) => { b.advisory_only = false; }],
    ["current_only false", BASE, (b) => { b.current_only = false; }],
    ["a row key added", BASE, (b) => { b.actions[0].capability = "approval.create"; }],
    ["a body key added", BASE, (b) => { b.valid_until_ms = 1; }],
    ["a workspace id of two characters", BASE, (b) => { b.workspace_id = "ws"; }],
  ])("%s voids the read", (_name, base, change) => {
    const body = edit(base, change);
    expect(readStageActionEligibilityV1(body)).toBeNull();
    // Where the schema can express the rule it agrees (the 'ACTIVE ending at the evaluation time' invariant is the reader's own).
    if (!["ACTIVE ending at the evaluation time"].includes(_name)) expect(violations(body).length, _name).toBeGreaterThan(0);
  });

  it("the request URL: no workspace is the caller's own; a malformed one is refused", () => {
    expect(stageActionEligibilityUrl()).toBe("/api/v1/execution/governance/stage-action-eligibility");
    expect(stageActionEligibilityUrl("ws_TEST_ONLY")).toBe("/api/v1/execution/governance/stage-action-eligibility?workspace_id=ws_TEST_ONLY");
    expect(stageActionEligibilityUrl("ws")).toBeNull();
  });
});

/* ═════════════════ L3 · generated negatives ═════════════════ */
interface Case { name: string; category: string; value: unknown; probe: string | null }
const enumsOf = (base: Draft, path: readonly (string | number)[], valid: readonly unknown[]): Case[] =>
  enumCases(base, path, valid.map(String)).filter((c) => !valid.includes(getPath(c.value, path)));
const ROW_FIELDS = ["stage_action", "verdict", "eligible", "reason_class", "public_copy_key", "basis", "step_up_required", "step_up_state", "alpha_scope"];

const NEG: Case[] = [
  ...requiredCases(BASE, ["schema_version", "workspace_id", "current_only", "advisory_only", "observed_at_ms", "session_step_up", "actions"].map((k) => [k] as const)),
  ...requiredCases(BASE, [["session_step_up", "state"], ["session_step_up", "valid_until_ms"]]),
  ...requiredCases(BASE, ROW_FIELDS.flatMap((k) => [["actions", 0, k] as const, ["actions", 3, k] as const])),
  ...enumsOf(BASE, ["actions", 0, "verdict"], [...STAGE_VERDICTS]),
  ...enumsOf(BASE, ["actions", 0, "reason_class"], [...STAGE_REASON_CLASSES]),
  ...enumsOf(BASE, ["actions", 3, "basis"], [...STAGE_BASES]),
  ...enumsOf(BASE, ["actions", 3, "step_up_state"], [...STAGE_STEP_UP_STATES]),
  ...enumsOf(BASE, ["session_step_up", "state"], ["ACTIVE", "NOT_ACTIVE"]),
  ...integerCases(BASE, ["observed_at_ms"]),
  ...integerCases(CASES.session_step_up_active, ["session_step_up", "valid_until_ms"]),
  ...stringCases(BASE, ["workspace_id"]),
  ...schemaVersionCases(BASE, ["schema_version"], STAGE_ACTION_ELIGIBILITY_SCHEMA, ["portal.self-eligibility.v1", "portal.stage-action-eligibility.v2"]),
  ...pollutionCases(BASE, [[], ["session_step_up"], ["actions", 0]]),
];

describe("L3 · negative · StageActionEligibility", () => {
  it("has a substantial case count", () => {
    console.info(`stageActionEligibility L3: ${NEG.length} cases`);
    expect(NEG.length).toBeGreaterThan(100);
  });

  it.each(NEG.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    expect(() => readStageActionEligibilityV1(c.value)).not.toThrow();
    const answer = readStageActionEligibilityV1(c.value) as { kind: string } | null;
    expect(leaked(answer, c.probe)).toBe(false);
    expect(prototypeIsClean()).toBe(true);
    const accepted = answer !== null && answer.kind !== "unsupported_shape";
    if (accepted) expect(getPath(c.value, ["schema_version"])).toBe(STAGE_ACTION_ELIGIBILITY_SCHEMA);
    if (accepted && c.category !== "prototype-pollution") expect(violations(c.value), `accepted though schema-invalid: ${c.name}`).toEqual([]);
  });

  it("an unknown word is never a verdict", () => {
    for (const c of NEG.filter((x) => x.category === "unknown-enum")) {
      const answer = readStageActionEligibilityV1(c.value) as { kind: string } | null;
      expect(answer === null || answer.kind === "unsupported_shape", c.name).toBe(true);
    }
  });

  it.each(rootCases().map((c) => [c.name, c] as const))("%s reads as nothing", (_name, c) => {
    expect(() => readStageActionEligibilityV1(c.value)).not.toThrow();
    const answer = readStageActionEligibilityV1(c.value);
    if (answer !== null) expect(answer).toEqual({ kind: "unsupported_shape", schemaVersion: null });
  });
});
