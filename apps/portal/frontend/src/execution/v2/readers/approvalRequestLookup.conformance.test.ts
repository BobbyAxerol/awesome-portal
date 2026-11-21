/**
 * Reader conformance for `approvalRequestLookup.ts` (FE-069, Rules 9.8.3).
 *
 * Oracle: `execution-governance.openapi.json#/components/schemas/ApprovalRequestLookup` through the testkit checker, and the four
 * canonical cases of `governance-requester-reads.synthetic.valid.json#approval_request_lookup` (none, found_not_compared,
 * found_payload_match, key_payload_conflict) plus `approval_request_lookup_payload_example`, digest-checked.
 * Lane: FIXTURE_LAB (synthetic TEST_ONLY bodies; not a runtime read).
 */
import { afterAll, describe, expect, it } from "vitest";

import { canonicalDigest, loadCanonical, schemaEnum } from "../testkit/loadCanonical";
import { getPath, type Draft } from "../testkit/matrix";
import { enumCases, leaked, pollutionCases, prototypeIsClean, requiredCases, rootCases, schemaVersionCases, stringCases } from "../testkit/negative";
import { validateAgainst } from "../testkit/schema";
import {
  APPROVAL_REQUEST_LOOKUP_SCHEMA, LOOKUP_STATES, PAYLOAD_CHECKS, approvalRequestLookupAnswers, approvalRequestLookupUrl, lookupSentence, readApprovalRequestLookupV1,
  type ApprovalRequestLookup,
} from "./approvalRequestLookup";

const FILE = "governance-requester-reads.synthetic";
const digestBefore = canonicalDigest(FILE);
afterAll(() => {
  expect(canonicalDigest(FILE)).toBe(digestBefore);
});

const OA = "../openapi/execution-governance.openapi.json";
const PTR = "/components/schemas/ApprovalRequestLookup";
const violations = (value: unknown) => validateAgainst(OA, PTR, value);
const clone = <T,>(value: T): T => structuredClone(value);
const file = loadCanonical<{ approval_request_lookup: Record<string, Draft>; approval_request_lookup_payload_example: Draft }>(FILE);
const C = file.approval_request_lookup;
const PAYLOAD = file.approval_request_lookup_payload_example;
const lookupOf = (raw: unknown): ApprovalRequestLookup | null => {
  const read = readApprovalRequestLookupV1(raw);
  return read !== null && read.kind === "approval_request_lookup" ? read.lookup : null;
};
const edit = (base: Draft, change: (b: Draft) => void): Draft => {
  const copy = clone(base);
  change(copy);
  return copy;
};

describe("L0 · canonical, verbatim", () => {
  it("the four cases are schema-valid and read", () => {
    expect(Object.keys(C)).toEqual(["none", "found_not_compared", "found_payload_match", "key_payload_conflict"]);
    for (const [name, body] of Object.entries(C)) {
      expect(violations(body), name).toEqual([]);
      expect(lookupOf(body), name).not.toBeNull();
    }
  });

  it("NONE / FOUND / KEY_PAYLOAD_CONFLICT with payload_check as published", () => {
    expect(lookupOf(C.none)).toMatchObject({ state: "NONE", payloadCheck: "NOT_COMPARED", result: null });
    expect(lookupOf(C.found_not_compared)).toMatchObject({ state: "FOUND", payloadCheck: "NOT_COMPARED" });
    expect(lookupOf(C.found_payload_match)).toMatchObject({ state: "FOUND", payloadCheck: "MATCH" });
    expect(lookupOf(C.key_payload_conflict)).toMatchObject({ state: "KEY_PAYLOAD_CONFLICT", payloadCheck: "MISMATCH", result: null });
  });

  it("FOUND carries the same body a replay would: the replayed outcome of the create route", () => {
    const found = lookupOf(C.found_payload_match)!;
    expect(found.result).toMatchObject({ kind: "replayed", approvalId: "apr_01J6N29PRODUCT", status: "PENDING", policyVersion: "approval.v3", quorumRequired: 1, requester: "stan" });
  });

  it("the closed words are the schema's, word for word", () => {
    expect([...LOOKUP_STATES]).toEqual([...schemaEnum(OA, `${PTR}/properties/state`)]);
    expect([...PAYLOAD_CHECKS]).toEqual([...schemaEnum(OA, `${PTR}/properties/payload_check`)]);
    expect(APPROVAL_REQUEST_LOOKUP_SCHEMA).toBe("governance.approval-request-lookup.v1");
  });

  it("another schema_version is a typed unsupported_shape", () => {
    expect(readApprovalRequestLookupV1(edit(C.none, (b) => { b.schema_version = "governance.approval-create.v1"; }))).toEqual({
      kind: "unsupported_shape", schemaVersion: "governance.approval-create.v1",
    });
  });
});

describe("L1 · the three states and their words", () => {
  it.each<[string, Draft, (b: Draft) => void]>([
    ["NONE with a body", C.none, (b) => { b.result = clone(C.found_not_compared.result); }],
    ["NONE with MATCH", C.none, (b) => { b.payload_check = "MATCH"; }],
    ["NONE with MISMATCH", C.none, (b) => { b.payload_check = "MISMATCH"; }],
    ["FOUND without a body", C.found_not_compared, (b) => { b.result = null; }],
    ["FOUND with MISMATCH", C.found_not_compared, (b) => { b.payload_check = "MISMATCH"; }],
    ["CONFLICT with a body", C.key_payload_conflict, (b) => { b.result = clone(C.found_not_compared.result); }],
    ["CONFLICT with MATCH", C.key_payload_conflict, (b) => { b.payload_check = "MATCH"; }],
    ["CONFLICT with NOT_COMPARED", C.key_payload_conflict, (b) => { b.payload_check = "NOT_COMPARED"; }],
    ["FOUND whose body is not a replay", C.found_not_compared, (b) => { b.result.replayed = false; }],
    ["FOUND whose body is another schema", C.found_not_compared, (b) => { b.result.schema_version = "governance.approval-create.v2"; }],
    ["FOUND whose body has an extra key", C.found_not_compared, (b) => { b.result.extra = 1; }],
    ["FOUND whose approval has no id", C.found_not_compared, (b) => { delete b.result.approval.approval_id; }],
    ["FOUND whose approval has no status", C.found_not_compared, (b) => { delete b.result.approval.status; }],
    ["a request key with a space", C.none, (b) => { b.request_key = "req 1"; }],
    ["a request key of 193 characters", C.none, (b) => { b.request_key = `a${"b".repeat(192)}`; }],
    ["a workspace id of two characters", C.none, (b) => { b.workspace_id = "ws"; }],
    ["a body key added", C.none, (b) => { b.request_id = "x"; }],
  ])("%s voids the read", (name, base, change) => {
    const body = edit(base, change);
    expect(readApprovalRequestLookupV1(body), name).toBeNull();
  });

  it("the words: NONE is the only state that makes a same-key retry safe, and NOT_COMPARED never reads as a match", () => {
    expect(lookupSentence(lookupOf(C.none)!)).toMatchObject({ safeToRetrySameKey: true, exists: false, sameRequest: null });
    expect(lookupSentence(lookupOf(C.found_not_compared)!)).toMatchObject({ safeToRetrySameKey: false, exists: true, sameRequest: null });
    expect(lookupSentence(lookupOf(C.found_payload_match)!)).toMatchObject({ safeToRetrySameKey: false, exists: true, sameRequest: true });
    expect(lookupSentence(lookupOf(C.key_payload_conflict)!)).toMatchObject({ safeToRetrySameKey: false, exists: true, sameRequest: false });
    expect(lookupSentence(lookupOf(C.found_not_compared)!).text).toMatch(/not compared/);
    expect(lookupSentence(lookupOf(C.found_not_compared)!).text).not.toMatch(/same fields/);
    expect(lookupSentence(lookupOf(C.none)!).text).toMatch(/No request exists under this key/);
  });

  it("the request URL: the key alone, or the key with all four payload fields, or refused", () => {
    expect(approvalRequestLookupUrl({ requestKey: "req-TEST_ONLY-0001" })).toBe("/api/v1/execution/governance/approvals/request-lookup?request_key=req-TEST_ONLY-0001");
    const withPayload = approvalRequestLookupUrl({
      requestKey: PAYLOAD.request_key, workspaceId: "ws_TEST_ONLY",
      payload: { alphaId: PAYLOAD.alpha_id, evidenceRunId: PAYLOAD.evidence_run_id, methodologyClaimId: PAYLOAD.methodology_claim_id, summary: PAYLOAD.summary },
    })!;
    expect(withPayload).toBe(
      "/api/v1/execution/governance/approvals/request-lookup?request_key=req-TEST_ONLY-0001&workspace_id=ws_TEST_ONLY&alpha_id=alpha_n29"
      + "&evidence_run_id=run_TEST_ONLY&methodology_claim_id=claim_TEST_ONLY&summary=Synthetic%20summary",
    );
    const payload = { alphaId: "a", evidenceRunId: "r", methodologyClaimId: "c", summary: "Long enough summary" };
    expect(approvalRequestLookupUrl({ requestKey: "bad key" })).toBeNull();
    expect(approvalRequestLookupUrl({ requestKey: "k1", payload: { ...payload, summary: "short" } })).toBeNull();
    expect(approvalRequestLookupUrl({ requestKey: "k1", payload: { ...payload, alphaId: "" } })).toBeNull();
    expect(approvalRequestLookupUrl({ requestKey: "k1", payload: { ...payload, summary: "x".repeat(2001) } })).toBeNull();
    expect(approvalRequestLookupUrl({ requestKey: "k1", workspaceId: "ws" })).toBeNull();
  });

  it("a body answers only the question asked", () => {
    const none = lookupOf(C.none)!;
    const notCompared = lookupOf(C.found_not_compared)!;
    const match = lookupOf(C.found_payload_match)!;
    const payload = { alphaId: "alpha_n29", evidenceRunId: "run_TEST_ONLY", methodologyClaimId: "claim_TEST_ONLY", summary: "Synthetic summary" };
    expect(approvalRequestLookupAnswers(none, { requestKey: "req-TEST_ONLY-0001" })).toBe(true);
    expect(approvalRequestLookupAnswers(none, { requestKey: "other" })).toBe(false);
    expect(approvalRequestLookupAnswers(none, { requestKey: "req-TEST_ONLY-0001", workspaceId: "ws_OTHER" })).toBe(false);
    expect(approvalRequestLookupAnswers(notCompared, { requestKey: "req-TEST_ONLY-0001" })).toBe(true);
    // A payload was sent but nothing was compared: that is not an answer to the question.
    expect(approvalRequestLookupAnswers(notCompared, { requestKey: "req-TEST_ONLY-0001", payload })).toBe(false);
    expect(approvalRequestLookupAnswers(match, { requestKey: "req-TEST_ONLY-0001", payload })).toBe(true);
    // No payload was sent but the body claims a comparison.
    expect(approvalRequestLookupAnswers(match, { requestKey: "req-TEST_ONLY-0001" })).toBe(false);
    expect(approvalRequestLookupAnswers(none, { requestKey: "req-TEST_ONLY-0001", payload })).toBe(true);
  });
});

/* ═════════════════ L3 · generated negatives ═════════════════ */
interface Case { name: string; category: string; value: unknown; probe: string | null }
const enumsOf = (base: Draft, path: readonly (string | number)[], valid: readonly unknown[]): Case[] =>
  enumCases(base, path, valid.map(String)).filter((c) => !valid.includes(getPath(c.value, path)));
const FOUND = C.found_payload_match;
const NEG: Case[] = [
  ...requiredCases(FOUND, ["schema_version", "workspace_id", "request_key", "state", "payload_check", "result"].map((k) => [k] as const)),
  ...requiredCases(FOUND, ["schema_version", "replayed", "approval"].map((k) => ["result", k] as const)),
  ...enumsOf(FOUND, ["state"], [...LOOKUP_STATES]),
  ...enumsOf(FOUND, ["payload_check"], [...PAYLOAD_CHECKS]),
  ...stringCases(FOUND, ["workspace_id"]),
  ...stringCases(FOUND, ["request_key"]),
  ...schemaVersionCases(FOUND, ["schema_version"], APPROVAL_REQUEST_LOOKUP_SCHEMA, ["governance.approval-create.v1", "governance.approval-request-lookup.v2"]),
  ...pollutionCases(FOUND, [[], ["result"], ["result", "approval"]]),
];

describe("L3 · negative · ApprovalRequestLookup", () => {
  it("has a substantial case count", () => {
    console.info(`approvalRequestLookup L3: ${NEG.length} cases`);
    expect(NEG.length).toBeGreaterThan(40);
  });

  it.each(NEG.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    expect(() => readApprovalRequestLookupV1(c.value)).not.toThrow();
    const answer = readApprovalRequestLookupV1(c.value) as { kind: string } | null;
    expect(leaked(answer, c.probe)).toBe(false);
    expect(prototypeIsClean()).toBe(true);
    const accepted = answer !== null && answer.kind !== "unsupported_shape";
    if (accepted) expect(getPath(c.value, ["schema_version"])).toBe(APPROVAL_REQUEST_LOOKUP_SCHEMA);
    if (accepted && c.category !== "prototype-pollution") expect(violations(c.value), `accepted though schema-invalid: ${c.name}`).toEqual([]);
  });

  it("an unknown word is never a state", () => {
    for (const c of NEG.filter((x) => x.category === "unknown-enum")) {
      const answer = readApprovalRequestLookupV1(c.value) as { kind: string } | null;
      expect(answer === null || answer.kind === "unsupported_shape", c.name).toBe(true);
    }
  });

  it.each(rootCases().map((c) => [c.name, c] as const))("%s reads as nothing", (_name, c) => {
    expect(() => readApprovalRequestLookupV1(c.value)).not.toThrow();
    const answer = readApprovalRequestLookupV1(c.value);
    if (answer !== null) expect(answer).toEqual({ kind: "unsupported_shape", schemaVersion: null });
  });
});
