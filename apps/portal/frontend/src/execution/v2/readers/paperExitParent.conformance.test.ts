/**
 * Reader conformance for `paperExitParent.ts` (RV-10 follow-up, Rules 9.8.3).
 *
 * Oracle: `execution-governance.openapi.json#/components/schemas/PaperExitParent` through the testkit checker, and the five canonical cases
 * of `governance-requester-reads.synthetic.valid.json#paper_exit_parent`, digest-checked.
 * Lane: FIXTURE_LAB (synthetic TEST_ONLY bodies; not a runtime read).
 */
import { afterAll, describe, expect, it } from "vitest";

import { canonicalDigest, loadCanonical } from "../testkit/loadCanonical";
import { getPath, type Draft } from "../testkit/matrix";
import { enumCases, integerCases, leaked, pollutionCases, prototypeIsClean, requiredCases, rootCases, schemaVersionCases, stringCases } from "../testkit/negative";
import { validateAgainst } from "../testkit/schema";
import {
  PAPER_EXIT_PARENT_SCHEMA, paperExitParentAnswers, paperExitParentUrl, readPaperExitParentV1, type PaperExitParent,
} from "./paperExitParent";

const FILE = "governance-requester-reads.synthetic";
const digestBefore = canonicalDigest(FILE);
afterAll(() => {
  expect(canonicalDigest(FILE)).toBe(digestBefore);
});

const OA = "../openapi/execution-governance.openapi.json";
const PTR = "/components/schemas/PaperExitParent";
const violations = (value: unknown) => validateAgainst(OA, PTR, value);
const clone = <T,>(value: T): T => structuredClone(value);
const CASES = loadCanonical<{ paper_exit_parent: Record<string, Draft> }>(FILE).paper_exit_parent;
const parentOf = (raw: unknown): PaperExitParent | null => {
  const read = readPaperExitParentV1(raw);
  return read !== null && read.kind === "paper_exit_parent" ? read.parent : null;
};
const edit = (base: Draft, change: (b: Draft) => void): Draft => {
  const copy = clone(base);
  change(copy);
  return copy;
};
const FOUND: Draft = CASES.found_available;

describe("L0 · canonical, verbatim", () => {
  it("the five canonical cases are schema-valid and read", () => {
    expect(Object.keys(CASES)).toEqual(["none", "found_available", "found_blocked_r2_not_approved", "found_blocked_not_admin", "found_blocked_expired"]);
    for (const [name, body] of Object.entries(CASES)) {
      expect(violations(body), name).toEqual([]);
      expect(parentOf(body), name).not.toBeNull();
    }
  });

  it("NONE has no context; FOUND carries the PAPER_EXIT_CREATE context the R2 review publishes, available or blocked with its reason", () => {
    expect(parentOf(CASES.none)).toMatchObject({ state: "NONE", context: { kind: "absent" } });
    const available = parentOf(FOUND)!;
    expect(available.state).toBe("FOUND");
    expect(available.context).toMatchObject({
      kind: "ok",
      value: { action: "PAPER_EXIT_CREATE", parentApprovalId: "apr_TEST_ONLY_r2", expectedParentVersion: 3, availability: { available: true, reasonCode: null }, projectionDigest: `sha256:${"c".repeat(64)}` },
    });
    for (const [name, code] of [["found_blocked_r2_not_approved", "R2_APPROVAL_REQUIRED"], ["found_blocked_not_admin", "ADMIN_ROLE_REQUIRED"], ["found_blocked_expired", "APPROVAL_EXPIRED"]] as const) {
      expect(parentOf(CASES[name])!.context, name).toMatchObject({ kind: "ok", value: { availability: { available: false, reasonCode: code }, projectionDigest: null, candidates: [] } });
    }
  });

  it("the schema version is the published one", () => {
    expect(PAPER_EXIT_PARENT_SCHEMA).toBe("governance.paper-exit-parent.v1");
    expect(FOUND.schema_version).toBe(PAPER_EXIT_PARENT_SCHEMA);
  });
});

describe("L1 · the reader and the schema agree on what is not a parent", () => {
  const BAD: Array<[string, (b: Draft) => void]> = [
    ["FOUND with no context", (b) => { b.capture_context = null; }],
    ["state NONE with a context", (b) => { b.state = "NONE"; }],
    ["a state outside the vocabulary", (b) => { b.state = "CREATED"; }],
    ["the R2 capture's context", (b) => { b.capture_context.action = "R2_CREATE"; b.capture_context.candidates[0].risk_grant_id = "risk_1"; }],
    ["a side effect asked", (b) => { b.source_side_effect_requested = true; }],
    ["another record authority", (b) => { b.record_authority = "SOURCE"; }],
    ["a missing deployment", (b) => { delete b.deployment_id; }],
    ["an available context with no digest", (b) => { b.capture_context.expected_projection_digest = null; }],
    ["an unknown member", (b) => { b.approval_id = "apr_other"; }],
  ];
  it.each(BAD)("%s: refused by the schema and by the reader", (_name, change) => {
    const body = edit(FOUND, change);
    expect(violations(body).length).toBeGreaterThan(0);
    expect(readPaperExitParentV1(body)).toBeNull();
  });

  it("the cross-field rules the schema cannot say are enforced by the reader: another workspace, another deployment, a second choice", () => {
    for (const change of [
      (b: Draft) => { b.capture_context.workspace_id = "ws_OTHER"; },
      (b: Draft) => { b.capture_context.candidates[0].deployment_id = "deployment_OTHER"; },
      (b: Draft) => { b.capture_context.candidates.push({ ...b.capture_context.candidates[0], deployment_id: "deployment_OTHER" }); },
    ]) expect(readPaperExitParentV1(edit(FOUND, change)), String(change)).toBeNull();
  });

  it("another schema version is unsupported_shape, not a parent; a non-object is null", () => {
    expect(readPaperExitParentV1(edit(FOUND, (b) => { b.schema_version = "governance.paper-exit-parent.v2"; }))).toEqual({ kind: "unsupported_shape", schemaVersion: "governance.paper-exit-parent.v2" });
    for (const bad of [null, undefined, 3, "x", [], true]) expect(readPaperExitParentV1(bad)).toBeNull();
  });
});

/* ═════════════════ L3 · generated negatives ═════════════════ */
interface Case { name: string; category: string; value: unknown; probe: string | null }
const ONE_CHOICE = ["capture_context", "candidates", 0] as const;
const NEG: Case[] = [
  ...requiredCases(FOUND, ["schema_version", "record_authority", "workspace_id", "deployment_id", "state", "capture_context", "source_side_effect_requested"].map((k) => [k] as const)),
  ...requiredCases(FOUND, ["action", "workspace_id", "parent_approval_id", "expected_parent_version", "expected_projection_digest", "availability", "candidates", "candidates_truncated", "currency_semantics", "source_side_effect_requested"].map((k) => ["capture_context", k] as const)),
  ...requiredCases(FOUND, ["deployment_id", "portfolio_id", "risk_grant_id", "currency"].map((k) => [...ONE_CHOICE, k] as const)),
  ...enumCases(FOUND, ["state"], ["NONE", "FOUND"]),
  ...enumCases(FOUND, ["capture_context", "action"], ["R2_CREATE", "PAPER_EXIT_CREATE"]),
  ...enumCases(FOUND, ["capture_context", "availability", "state"], ["AVAILABLE", "BLOCKED"]),
  ...stringCases(FOUND, ["workspace_id"]),
  ...stringCases(FOUND, ["deployment_id"]),
  ...integerCases(FOUND, ["capture_context", "expected_parent_version"]),
  ...schemaVersionCases(FOUND, ["schema_version"], PAPER_EXIT_PARENT_SCHEMA, ["governance.approval-request-lookup.v1", "portal.stage-action-eligibility.v1", "governance.paper-exit-parent.v2"]),
  ...pollutionCases(FOUND, [[], ["capture_context"], ONE_CHOICE]),
];

describe("L3 · negative · PaperExitParent", () => {
  it("has a substantial case count", () => {
    expect(NEG.length).toBeGreaterThan(60);
  });

  it.each(NEG.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    expect(() => readPaperExitParentV1(c.value)).not.toThrow();
    const answer = readPaperExitParentV1(c.value) as { kind: string } | null;
    expect(leaked(answer, c.probe)).toBe(false);
    expect(prototypeIsClean()).toBe(true);
    const accepted = answer !== null && answer.kind !== "unsupported_shape";
    if (accepted) expect(getPath(c.value, ["schema_version"])).toBe(PAPER_EXIT_PARENT_SCHEMA);
    if (accepted && c.category !== "prototype-pollution") expect(violations(c.value), `accepted though schema-invalid: ${c.name}`).toEqual([]);
  });

  it("an unknown word is never a state or an action", () => {
    for (const c of NEG.filter((x) => x.category === "unknown-enum")) {
      const answer = readPaperExitParentV1(c.value) as { kind: string } | null;
      expect(answer === null || answer.kind === "unsupported_shape", c.name).toBe(true);
    }
  });

  it.each(rootCases().map((c) => [c.name, c] as const))("%s reads as nothing", (_name, c) => {
    expect(() => readPaperExitParentV1(c.value)).not.toThrow();
    const answer = readPaperExitParentV1(c.value);
    if (answer !== null) expect(answer).toEqual({ kind: "unsupported_shape", schemaVersion: null });
  });
});

describe("the request and the question it answers", () => {
  it("the URL names the deployment and, when given, the workspace; a malformed one is refused before any request", () => {
    expect(paperExitParentUrl({ deploymentId: "dep_1" })).toBe("/api/v1/execution/governance/paper-exit/parent?deployment_id=dep_1");
    expect(paperExitParentUrl({ deploymentId: "dep_1", workspaceId: "ws_1" })).toBe("/api/v1/execution/governance/paper-exit/parent?deployment_id=dep_1&workspace_id=ws_1");
    expect(paperExitParentUrl({ deploymentId: "dep:1.a-b_c", workspaceId: "" })).toBe("/api/v1/execution/governance/paper-exit/parent?deployment_id=dep%3A1.a-b_c");
    for (const bad of [{ deploymentId: "" }, { deploymentId: "a b" }, { deploymentId: "a/b" }, { deploymentId: "x".repeat(193) }, { deploymentId: "dep_1", workspaceId: "ab" }, { deploymentId: "dep_1", workspaceId: "x".repeat(97) }]) {
      expect(paperExitParentUrl(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it("a body answers the question only for the same deployment and, when named, the same workspace", () => {
    const parent = parentOf(FOUND)!;
    expect(paperExitParentAnswers(parent, { deploymentId: parent.deploymentId })).toBe(true);
    expect(paperExitParentAnswers(parent, { deploymentId: parent.deploymentId, workspaceId: parent.workspaceId })).toBe(true);
    expect(paperExitParentAnswers(parent, { deploymentId: "deployment_OTHER" })).toBe(false);
    expect(paperExitParentAnswers(parent, { deploymentId: parent.deploymentId, workspaceId: "ws_OTHER" })).toBe(false);
  });
});
