/**
 * Reader conformance for `accessSelfContext.ts` (FE-057/058/038, Rules 9.8.3).
 *
 * Oracle: `execution-access.openapi.json#/components/schemas/AccessSelfContext` through the testkit checker, and the six canonical
 * `self_context_cases` of `execution-access.synthetic.valid.json`, digest-checked. The reader is never looser than the schema
 * (every body it accepts is schema-valid); it is stricter exactly where the schema text hands a rule to the runtime
 * (`valid_until_ms > observed_at_ms`, candidates unique and sorted, one basis, NONE <=> the self entry UNAVAILABLE).
 * Lane: FIXTURE_LAB (synthetic TEST_ONLY bodies; not a runtime read).
 */
import { afterAll, describe, expect, it } from "vitest";

import { canonicalDigest, loadCanonical, schemaEnum } from "../testkit/loadCanonical";
import { getPath, type Draft } from "../testkit/matrix";
import { enumCases, integerCases, leaked, pollutionCases, prototypeIsClean, requiredCases, rootCases, schemaVersionCases, stringCases } from "../testkit/negative";
import { validateAgainst } from "../testkit/schema";
import {
  ACCESS_SELF_CONTEXT_SCHEMA, SELF_CONTEXT_ACCESS_BASES, SELF_CONTEXT_RESOLVED_RULES, SELF_ENTRY_ROUTE, readAccessSelfContext, type AccessSelfContext,
} from "./accessSelfContext";

const FILE = "execution-access.synthetic";
const digestBefore = canonicalDigest(FILE);
afterAll(() => {
  expect(canonicalDigest(FILE)).toBe(digestBefore);
});

const OA = "../openapi/execution-access.openapi.json";
const PTR = "/components/schemas/AccessSelfContext";
const violations = (value: unknown) => validateAgainst(OA, PTR, value);
const clone = <T,>(value: T): T => structuredClone(value);
const file = loadCanonical<{ self_context_cases: { type: string; case_name: string; value: Draft }[] }>(FILE);
const BY_NAME: Record<string, Draft> = Object.fromEntries(file.self_context_cases.map((c) => [c.case_name, c.value]));
const RESOLVED: Draft = BY_NAME.RESOLVED_SOLE_WORKSPACE_WITH_CURRENT_GRANT_RECORD;
const AMBIGUOUS: Draft = BY_NAME.AMBIGUOUS_SEVERAL_WITH_GRANT_RECORDS;
const NONE: Draft = BY_NAME.ABSENT_NO_MEMBERSHIP;

const contextOf = (raw: unknown): AccessSelfContext | null => {
  const read = readAccessSelfContext(raw);
  return read !== null && read.kind === "self_context" ? read.context : null;
};
const edit = (base: Draft, change: (b: Draft) => void): Draft => {
  const copy = clone(base);
  change(copy);
  return copy;
};

describe("L0 · canonical, verbatim", () => {
  it("the six cases are schema-valid and read", () => {
    expect(file.self_context_cases.map((c) => c.type)).toEqual(Array(6).fill("AccessSelfContext"));
    expect(Object.keys(BY_NAME)).toEqual([
      "RESOLVED_SOLE_WORKSPACE_WITH_CURRENT_GRANT_RECORD", "RESOLVED_SOLE_MEMBERSHIP", "AMBIGUOUS_SEVERAL_WITH_GRANT_RECORDS",
      "AMBIGUOUS_MEMBER_ONLY", "ABSENT_NO_MEMBERSHIP", "UNAVAILABLE_TOO_MANY_MEMBERSHIPS",
    ]);
    for (const [name, body] of Object.entries(BY_NAME)) {
      expect(violations(body), name).toEqual([]);
      expect(contextOf(body), name).not.toBeNull();
    }
  });

  it("RESOLVED: one workspace, the rule that named it, and the self-only entry route", () => {
    const context = contextOf(RESOLVED)!;
    expect(context.defaultWorkspace).toEqual({ state: "RESOLVED", workspaceId: "ws_TEST_ONLY_shared", rule: "SOLE_WORKSPACE_WITH_CURRENT_GRANT_RECORD" });
    expect(context.selfEntry).toEqual({ permission: "ALLOWED", route: "/administration/my-access", reasonClass: null });
    expect(contextOf(BY_NAME.RESOLVED_SOLE_MEMBERSHIP)!.defaultWorkspace).toMatchObject({ state: "RESOLVED", rule: "SOLE_MEMBERSHIP" });
  });

  it("AMBIGUOUS: the candidates in the order published, with their basis; never one picked", () => {
    expect(contextOf(AMBIGUOUS)!.defaultWorkspace).toEqual({
      state: "AMBIGUOUS",
      candidates: [{ workspaceId: "ws_TEST_ONLY_a", accessBasis: "OWN_CURRENT_GRANT_RECORD" }, { workspaceId: "ws_TEST_ONLY_b", accessBasis: "OWN_CURRENT_GRANT_RECORD" }],
    });
    expect(contextOf(BY_NAME.AMBIGUOUS_MEMBER_ONLY)!.defaultWorkspace).toMatchObject({ state: "AMBIGUOUS", candidates: [{ accessBasis: "MEMBER_ONLY" }, { accessBasis: "MEMBER_ONLY" }] });
  });

  it("NONE and UNAVAILABLE are typed absences; NONE has no entry route, UNAVAILABLE keeps the page but names no workspace", () => {
    const none = contextOf(NONE)!;
    expect(none.defaultWorkspace).toEqual({ state: "NONE", reasonClass: "NO_WORKSPACE_MEMBERSHIP" });
    expect(none.selfEntry).toEqual({ permission: "UNAVAILABLE", route: null, reasonClass: "NO_WORKSPACE_MEMBERSHIP" });
    const many = contextOf(BY_NAME.UNAVAILABLE_TOO_MANY_MEMBERSHIPS)!;
    expect(many.defaultWorkspace).toEqual({ state: "UNAVAILABLE", reasonClass: "TOO_MANY_MEMBERSHIPS" });
    expect(many.selfEntry.permission).toBe("ALLOWED");
  });

  it("account_operations is the typed ABSENCE of rotation: the same for every case, step_up_required null (never false)", () => {
    for (const body of Object.values(BY_NAME)) {
      expect(contextOf(body)!.accountOperations).toEqual([{
        operation: "REVISE_BINDING", scope: "CREDENTIAL_ONLY", targetKind: "BINDING", availability: "NOT_COMMISSIONED",
        reasonClass: "COMMAND_FAMILY_NOT_COMMISSIONED", basis: "NONE_PUBLISHED", stepUpRequired: null,
      }]);
    }
  });

  it("the times travel: observed and valid_until, the ceiling after the evaluation", () => {
    const context = contextOf(RESOLVED)!;
    expect(context).toMatchObject({ currentOnly: true, advisoryOnly: true, observedAtMs: 1792094400000, validUntilMs: 1792094405000 });
  });

  it("the closed words are the schema's, word for word", () => {
    const one = `${PTR}/properties/default_workspace/oneOf`;
    expect([...SELF_CONTEXT_RESOLVED_RULES].sort()).toEqual([...schemaEnum(OA, `${one}/0/properties/rule`)].sort());
    expect([...SELF_CONTEXT_ACCESS_BASES].sort()).toEqual([...schemaEnum(OA, `${one}/1/properties/candidates/items/properties/access_basis`)].sort());
    expect(ACCESS_SELF_CONTEXT_SCHEMA).toBe("portal.self-context.v1");
    expect(SELF_ENTRY_ROUTE).toBe("/administration/my-access");
  });

  it("another schema_version is typed unsupported_shape", () => {
    expect(readAccessSelfContext(edit(RESOLVED, (b) => { b.schema_version = "portal.self-context.v2"; }))).toEqual({ kind: "unsupported_shape", schemaVersion: "portal.self-context.v2" });
    expect(readAccessSelfContext(edit(RESOLVED, (b) => { b.schema_version = "portal.self-navigation.v1"; }))).toEqual({ kind: "unsupported_shape", schemaVersion: "portal.self-navigation.v1" });
  });
});

describe("L1 · runtime rules and cross-field rules", () => {
  it.each<[string, Draft, (b: Draft) => void, boolean]>([
    ["valid_until_ms equal to observed_at_ms", RESOLVED, (b) => { b.valid_until_ms = b.observed_at_ms; }, false],
    ["valid_until_ms before observed_at_ms", RESOLVED, (b) => { b.valid_until_ms = b.observed_at_ms - 1; }, false],
    ["candidates not sorted", AMBIGUOUS, (b) => { b.default_workspace.candidates.reverse(); }, false],
    ["candidates repeated", AMBIGUOUS, (b) => { b.default_workspace.candidates[1] = clone(b.default_workspace.candidates[0]); }, false],
    ["candidates of mixed basis", AMBIGUOUS, (b) => { b.default_workspace.candidates[1].access_basis = "MEMBER_ONLY"; }, false],
    ["one candidate only", AMBIGUOUS, (b) => { b.default_workspace.candidates.pop(); }, true],
    ["seventeen candidates", AMBIGUOUS, (b) => {
      b.default_workspace.candidates = Array.from({ length: 17 }, (_, n) => ({ workspace_id: `ws_${String(n).padStart(2, "0")}`, access_basis: "MEMBER_ONLY" }));
    }, true],
    ["NONE with an ALLOWED self entry", NONE, (b) => { b.self_entry = clone(RESOLVED.self_entry); }, true],
    ["RESOLVED with an UNAVAILABLE self entry", RESOLVED, (b) => { b.self_entry = clone(NONE.self_entry); }, true],
    ["a self entry route that is the admin matrix", RESOLVED, (b) => { b.self_entry.route = "/administration/profile-access"; }, true],
    ["a self entry route with a query", RESOLVED, (b) => { b.self_entry.route = "/administration/my-access?workspace_id=x"; }, true],
    ["a self entry route with a fragment", RESOLVED, (b) => { b.self_entry.route = "/administration/my-access#x"; }, true],
    ["a self entry route under the matrix", RESOLVED, (b) => { b.self_entry.route = "/administration/profile-access/my"; }, true],
    ["a route on an UNAVAILABLE entry", NONE, (b) => { b.self_entry.route = "/administration/my-access"; }, true],
    ["consumer_state something else", RESOLVED, (b) => { b.self_entry.consumer_state = "ROUTED"; }, true],
    ["account_operations empty", RESOLVED, (b) => { b.account_operations = []; }, true],
    ["account_operations twice", RESOLVED, (b) => { b.account_operations.push(clone(b.account_operations[0])); }, true],
    ["rotation AVAILABLE", RESOLVED, (b) => { b.account_operations[0].availability = "AVAILABLE"; }, true],
    ["rotation step_up_required false (undetermined must stay null)", RESOLVED, (b) => { b.account_operations[0].step_up_required = false; }, true],
    ["rotation step_up_required true", RESOLVED, (b) => { b.account_operations[0].step_up_required = true; }, true],
    ["a capability name smuggled into the operation", RESOLVED, (b) => { b.account_operations[0].capability = "execution.accounts.manage"; }, true],
    ["a peer / role key added", RESOLVED, (b) => { b.role = "ADMIN"; }, true],
    ["advisory_only false", RESOLVED, (b) => { b.advisory_only = false; }, true],
    ["current_only false", RESOLVED, (b) => { b.current_only = false; }, true],
    ["RESOLVED carrying candidates", RESOLVED, (b) => { b.default_workspace.candidates = []; }, true],
    ["a workspace id of control characters", RESOLVED, (b) => { b.default_workspace.workspace_id = "ws\u0000x"; }, true],
    ["a workspace id longer than 256", RESOLVED, (b) => { b.default_workspace.workspace_id = "w".repeat(257); }, true],
  ])("%s voids the read", (name, base, change, schemaSays) => {
    const body = edit(base, change);
    expect(readAccessSelfContext(body), name).toBeNull();
    // `schemaSays`: whether the published schema can express the rule. Where it cannot, the reader is stricter by design.
    if (schemaSays) expect(violations(body).length, name).toBeGreaterThan(0);
  });
});

/* ═════════════════ L3 · generated negatives ═════════════════ */
interface Case { name: string; category: string; value: unknown; probe: string | null }
const enumsOf = (base: Draft, path: readonly (string | number)[], valid: readonly unknown[]): Case[] =>
  enumCases(base, path, valid.map(String)).filter((c) => !valid.includes(getPath(c.value, path)));
const TOP = ["schema_version", "current_only", "advisory_only", "observed_at_ms", "valid_until_ms", "default_workspace", "self_entry", "account_operations"];
const ENTRY = ["feature", "mode", "permission", "route", "workspace_scope", "reason_class", "consumer_state"];
const OP = ["operation", "scope", "target_kind", "availability", "reason_class", "basis", "step_up_required"];

const NEG: Case[] = [
  ...requiredCases(RESOLVED, TOP.map((k) => [k] as const)),
  ...requiredCases(RESOLVED, ["state", "workspace_id", "rule"].map((k) => ["default_workspace", k] as const)),
  ...requiredCases(AMBIGUOUS, ["state", "candidates"].map((k) => ["default_workspace", k] as const)),
  ...requiredCases(AMBIGUOUS, [["default_workspace", "candidates", 0, "workspace_id"], ["default_workspace", "candidates", 0, "access_basis"]]),
  ...requiredCases(NONE, ["state", "reason_class"].map((k) => ["default_workspace", k] as const)),
  ...requiredCases(RESOLVED, ENTRY.map((k) => ["self_entry", k] as const)),
  ...requiredCases(NONE, ENTRY.map((k) => ["self_entry", k] as const)),
  ...requiredCases(RESOLVED, OP.map((k) => ["account_operations", 0, k] as const)),
  ...enumsOf(RESOLVED, ["default_workspace", "rule"], [...SELF_CONTEXT_RESOLVED_RULES]),
  ...enumsOf(AMBIGUOUS, ["default_workspace", "candidates", 0, "access_basis"], [...SELF_CONTEXT_ACCESS_BASES]),
  ...enumsOf(RESOLVED, ["default_workspace", "state"], ["RESOLVED", "AMBIGUOUS", "NONE", "UNAVAILABLE"]),
  ...enumsOf(RESOLVED, ["self_entry", "permission"], ["ALLOWED", "UNAVAILABLE"]),
  ...integerCases(RESOLVED, ["observed_at_ms"]),
  ...integerCases(RESOLVED, ["valid_until_ms"]),
  ...stringCases(RESOLVED, ["default_workspace", "workspace_id"]),
  ...stringCases(AMBIGUOUS, ["default_workspace", "candidates", 0, "workspace_id"]),
  ...schemaVersionCases(RESOLVED, ["schema_version"], ACCESS_SELF_CONTEXT_SCHEMA, ["portal.self-context.v2", "portal.self-navigation.v1"]),
  ...pollutionCases(RESOLVED, [[], ["default_workspace"], ["self_entry"], ["account_operations", 0]]),
  ...pollutionCases(AMBIGUOUS, [["default_workspace", "candidates", 0]]),
];

describe("L3 · negative · AccessSelfContext", () => {
  it("has a substantial case count", () => {
    console.info(`accessSelfContext L3: ${NEG.length} cases`);
    expect(NEG.length).toBeGreaterThan(150);
  });

  it.each(NEG.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    expect(() => readAccessSelfContext(c.value)).not.toThrow();
    const answer = readAccessSelfContext(c.value) as { kind: string } | null;
    expect(leaked(answer, c.probe)).toBe(false);
    expect(prototypeIsClean()).toBe(true);
    const accepted = answer !== null && answer.kind !== "unsupported_shape";
    if (accepted && c.category !== "prototype-pollution") expect(violations(c.value), `accepted though schema-invalid: ${c.name}`).toEqual([]);
  });

  it("an unknown word is never a state", () => {
    for (const c of NEG.filter((x) => x.category === "unknown-enum")) {
      const answer = readAccessSelfContext(c.value) as { kind: string } | null;
      expect(answer === null || answer.kind === "unsupported_shape", c.name).toBe(true);
    }
  });

  it.each(rootCases().map((c) => [c.name, c] as const))("%s reads as nothing", (_name, c) => {
    expect(() => readAccessSelfContext(c.value)).not.toThrow();
    const answer = readAccessSelfContext(c.value);
    if (answer !== null) expect(answer).toEqual({ kind: "unsupported_shape", schemaVersion: null });
  });
});
