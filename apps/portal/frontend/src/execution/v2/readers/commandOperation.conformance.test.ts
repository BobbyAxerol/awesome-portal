/**
 * Reader conformance for `commandOperation.ts` (Rules 9.8.3, tiers L0 to L3), UXM-09 fixture lane.
 *
 * Published schemas (the testkit checker reads them, so every oracle below is the published schema itself):
 *   `execution-operations.v1.schema.json#/$defs/{ExecutionCommandPlan,ExecutionCommandOperation,F0BlockedOperationRead,RelayDenied,F0CommandCollection}`
 *   `execution-trusted-commands.openapi.json#/components/schemas/{CommandPreview,CommandProblem}`
 *
 * BE-P13 additions (consumer integration): `F0ApplyDeniedProblem`, `F0ApplyKeyConflictProblem`, `F0ApplyAttemptLookup`, plan `current_primitive` +
 * `cost_impact`, preview `cost_impact`. The closed readers of those are held to the schema as oracle exactly like the others.
 *
 * L0  the canonical files, verbatim and digest-checked:
 *       execution-command-plan / -plan.emergency-close / -operation / -relay-denied      (valid, read)
 *       execution-command-apply-denied / -denied.replayed / -key-conflict, execution-command-apply-attempt.none|found|conflict
 *       execution-f0-command-collection.synthetic                (the `response` body)
 *       execution-command-catalog                                (its 64 keys are the reader's F0 key list)
 *     Closed words (risk tiers, F0 blocker words, F0 keys, reason codes, gates, next actions) are compared with the schemas' enums.
 * L1  state matrices against oracles written from the contract text, not from the reader:
 *       A plan: constants x flags x counts        B operation: constants x chronology x F0 refinement
 *       C relay decision: the four constants      D collection: count x limit x cursor x order
 *       E preview: allowed x reason x digest x gate       F problem: code forms x optional keys
 * L2  100 collection items, 128 blockers, 70,000 character fields refused fast, 2,000 reads inside a budget.
 * L3  generated negatives (enum, required, string, array, integer, schema swap, pollution, bad roots): every case is refused (or is the typed
 *     `unsupported_shape`), never throws, never leaks its probe, and nothing the schema refuses is read.
 */
import { afterAll, describe, expect, it } from "vitest";

import { canonicalDigest, loadCanonical, loadSchema, schemaEnum } from "../testkit/loadCanonical";
import { ABSENT, cartesian, coverage, describeCoverage, dimensionOf, getPath, setPath, type Dimension, type Draft, type Path } from "../testkit/matrix";
import {
  arrayCases, enumCases, integerCases, leaked, pollutionCases, prototypeIsClean, requiredCases, rootCases, schemaVersionCases, stringCases,
} from "../testkit/negative";
import { MIB, serializedBytes, timed } from "../testkit/scale";
import { validateAgainst } from "../testkit/schema";
import {
  APPROVAL_GATES,
  F0_APPLY_ATTEMPT_SCHEMA,
  F0_APPLY_ATTEMPT_STATES,
  F0_APPLY_CONFLICT_CODE,
  F0_APPLY_DENIED_CODE,
  COMMAND_OPERATION_SCHEMA,
  COMMAND_PLAN_SCHEMA,
  COMMAND_PREVIEW_SCHEMA,
  COMMAND_REASON_CODES,
  F0_BLOCKER_WORDS,
  F0_COLLECTION_SCHEMA,
  F0_COMMAND_KEYS,
  F0_ENVIRONMENTS,
  F0_RESOURCE_KINDS,
  RELAY_DECISION_SCHEMA,
  SAFE_NEXT_ACTIONS,
  readCommandOperationV1,
  readCommandPlanV1,
  readCommandPreviewV1,
  readCommandProblemV1,
  readF0ApplyAnswerV1,
  readF0ApplyAttemptLookupV1,
  readF0ApplyDeniedV1,
  readF0ApplyKeyConflictV1,
  readF0BlockedOperationV1,
  readF0CommandCollectionV1,
  readRelayDecisionV1,
} from "./commandOperation";
import { RISK_TIERS_V2 } from "./operationalQueue";

const BUDGET_2000_READS_MS = 600;
const BUDGET_WIDEST_MS = 150;

const FILES = [
  "execution-command-plan", "execution-command-plan.emergency-close", "execution-command-operation", "execution-command-relay-denied",
  "execution-f0-command-collection.synthetic", "execution-command-catalog", "execution-trusted-commands.synthetic",
  "execution-command-apply-denied", "execution-command-apply-denied.replayed", "execution-command-apply-key-conflict",
  "execution-command-apply-attempt.none", "execution-command-apply-attempt.found", "execution-command-apply-attempt.conflict",
];
const digestsBefore = FILES.map(canonicalDigest);
afterAll(() => {
  expect(FILES.map(canonicalDigest)).toEqual(digestsBefore);
});

const OPS = "execution-operations.v1";
const TRUSTED = "../openapi/execution-trusted-commands.openapi.json";
const planViolations = (v: unknown) => validateAgainst(OPS, "/$defs/ExecutionCommandPlan", v);
const opViolations = (v: unknown) => validateAgainst(OPS, "/$defs/ExecutionCommandOperation", v);
const f0Violations = (v: unknown) => validateAgainst(OPS, "/$defs/F0BlockedOperationRead", v);
const denyViolations = (v: unknown) => validateAgainst(OPS, "/$defs/RelayDenied", v);
const collectionViolations = (v: unknown) => validateAgainst(OPS, "/$defs/F0CommandCollection", v);
const deniedApplyViolations = (v: unknown) => validateAgainst(OPS, "/$defs/F0ApplyDeniedProblem", v);
const conflictApplyViolations = (v: unknown) => validateAgainst(OPS, "/$defs/F0ApplyKeyConflictProblem", v);
const lookupViolations = (v: unknown) => validateAgainst(OPS, "/$defs/F0ApplyAttemptLookup", v);
const previewViolations = (v: unknown) => validateAgainst(TRUSTED, "/components/schemas/CommandPreview", v);
const problemViolations = (v: unknown) => validateAgainst(TRUSTED, "/components/schemas/CommandProblem", v);
const clone = <T,>(value: T): T => structuredClone(value);

const PLAN: Draft = loadCanonical("execution-command-plan");
const PLAN_EC: Draft = loadCanonical("execution-command-plan.emergency-close");
const APPLY_DENIED: Draft = loadCanonical("execution-command-apply-denied");
const APPLY_REPLAYED: Draft = loadCanonical("execution-command-apply-denied.replayed");
const APPLY_CONFLICT: Draft = loadCanonical("execution-command-apply-key-conflict");
const LOOKUP_NONE: Draft = loadCanonical("execution-command-apply-attempt.none");
const LOOKUP_FOUND: Draft = loadCanonical("execution-command-apply-attempt.found");
const LOOKUP_CONFLICT: Draft = loadCanonical("execution-command-apply-attempt.conflict");
const COST_ABSENT = { state: "NOT_PUBLISHED", reason: "NO_COST_OR_IMPACT_SOURCE" } as const;
const OPERATION: Draft = loadCanonical("execution-command-operation");
const DENIED: Draft = loadCanonical("execution-command-relay-denied");
const COLLECTION_FILE = loadCanonical<{ lane: string; runtime_qualified: boolean; response: Draft }>("execution-f0-command-collection.synthetic");
const COLLECTION: Draft = COLLECTION_FILE.response;
const CATALOG = loadCanonical<{ entries: { key: string }[] }>("execution-command-catalog");
const PREVIEW_BLOCKED: Draft = loadCanonical<Draft>("execution-trusted-commands.synthetic").preview_blocked;
const PREVIEW_FIXTURE_ALLOWED: Draft = loadCanonical<Draft>("execution-trusted-commands.synthetic").preview_allowed;
const PROBLEM: Draft = {
  error: { code: "COMMAND_STATUS_UNVERIFIED", message: "The receipt could not be verified." },
  request_id: "req_01J2K3M4N5P6Q7R8S9T0A1B2C3",
  public_copy_key: "command.status.unverified",
  safe_next_action: "QUERY_SAME_INTENT",
};
/** A schema-valid preview that allows the action: the shape a connected relay would publish (synthetic, TEST_ONLY). */
const PREVIEW_ALLOWED: Draft = {
  schema_version: COMMAND_PREVIEW_SCHEMA, allowed: true, reason_code: null, preview_digest: `sha256:${"a".repeat(64)}`, expires_at_ms: 1792100060000,
  profile_ref: "TEST_ONLY:paper", approval_required: true, approval_gate: "CAPITAL", cost_impact: { ...COST_ABSENT }, business_applied: false, reserved: false,
};

const planOf = (raw: unknown) => { const r = readCommandPlanV1(raw); return r !== null && r.kind === "command_plan" ? r.plan : null; };
const opOf = (raw: unknown) => { const r = readCommandOperationV1(raw); return r !== null && r.kind === "command_operation" ? r.operation : null; };
const f0Of = (raw: unknown) => { const r = readF0BlockedOperationV1(raw); return r !== null && r.kind === "command_operation" ? r.operation : null; };
const denyOf = (raw: unknown) => { const r = readRelayDecisionV1(raw); return r !== null && r.kind === "relay_decision" ? r.decision : null; };
const collOf = (raw: unknown) => { const r = readF0CommandCollectionV1(raw); return r !== null && r.kind === "f0_collection" ? r.collection : null; };
const deniedOf = (raw: unknown) => readF0ApplyDeniedV1(raw);
const conflictOf = (raw: unknown) => readF0ApplyKeyConflictV1(raw);
const lookupOf = (raw: unknown) => { const r = readF0ApplyAttemptLookupV1(raw); return r !== null && r.kind === "f0_apply_attempt" ? r.attempt : null; };
const previewOf = (raw: unknown) => { const r = readCommandPreviewV1(raw); return r !== null && r.kind === "command_preview" ? r.preview : null; };

/* ═════════════════════════ L0 ═════════════════════════ */
describe("L0 · canonical, verbatim", () => {
  it("every published body passes its schema through the testkit checker and reads", () => {
    expect(planViolations(PLAN)).toEqual([]);
    expect(opViolations(OPERATION)).toEqual([]);
    expect(f0Violations(OPERATION)).toEqual([]);
    expect(denyViolations(DENIED)).toEqual([]);
    expect(collectionViolations(COLLECTION)).toEqual([]);
    expect(previewViolations(PREVIEW_BLOCKED)).toEqual([]);
    expect(previewViolations(PREVIEW_ALLOWED)).toEqual([]);
    expect(problemViolations(PROBLEM)).toEqual([]);
    expect(planOf(PLAN)).not.toBeNull();
    expect(opOf(OPERATION)).not.toBeNull();
    expect(f0Of(OPERATION)).not.toBeNull();
    expect(denyOf(DENIED)).not.toBeNull();
    expect(collOf(COLLECTION)).not.toBeNull();
    expect(previewOf(PREVIEW_BLOCKED)).not.toBeNull();
    expect(previewOf(PREVIEW_ALLOWED)).not.toBeNull();
    expect(readCommandProblemV1(PROBLEM)).not.toBeNull();
  });

  it("the collection file is the synthetic, unqualified lane", () => {
    expect(COLLECTION_FILE.lane).toBe("TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT");
    expect(COLLECTION_FILE.runtime_qualified).toBe(false);
  });

  it("the plan, operation and denial all name the same operation, and every constant is read, not assumed", () => {
    const plan = planOf(PLAN)!;
    expect(plan.operationId).toBe(OPERATION.operation_id);
    expect(plan.operationId).toBe(DENIED.operation_id);
    expect(plan).toMatchObject({
      status: "BLOCKED", applyToken: null, relayCapability: "DISABLED", sourceSideEffectRequested: false, payloadStoragePolicy: "HASH_ONLY_NO_RAW",
      replayed: false, blockers: ["COMMAND_RELAY_DISABLED"], warnings: [], riskTier: "R2_SANDBOX", commandKey: "account/sync",
    });
    expect(opOf(OPERATION)).toMatchObject({ status: "BLOCKED", verificationResult: "NOT_STARTED", relayReceipt: null, sourceSideEffectRequested: false });
    expect(denyOf(DENIED)).toEqual({ operationId: DENIED.operation_id, decision: "DENIED", reason: "COMMAND_RELAY_DISABLED", retryAllowed: false, sourceRequestSent: false });
  });

  it("hashes and instants come back byte for byte; the instant keeps its text beside ms", () => {
    const plan = planOf(PLAN)!;
    expect(plan.payloadHash).toBe(PLAN.payload_hash);
    expect(plan.planDigest).toBe(PLAN.plan_digest);
    expect(plan.expiresAt).toEqual({ iso: "2026-08-22T12:05:00Z", ms: Date.parse("2026-08-22T12:05:00Z") });
    expect(opOf(OPERATION)!.createdAt.iso).toBe("2026-08-22T12:00:00Z");
  });

  it("the collection's one item is the operation fixture, and it keeps the page facts", () => {
    expect(COLLECTION.items[0]).toEqual(OPERATION);
    expect(collOf(COLLECTION)).toMatchObject({
      resource: { kind: "ACCOUNT", id: "acc_TEST_ONLY_f0" }, environment: "paper",
      page: { limit: 25, returnedCount: 1, hasMore: false, nextCursor: null },
    });
  });

  it("the closed words the reader holds are the schemas', word for word", () => {
    expect([...RISK_TIERS_V2]).toEqual([...schemaEnum(`${OPS}.schema.json`, "/$defs/RiskTier")]);
    const f0Schema = schemaNode("/$defs/F0BlockedOperationRead/allOf/1/properties/command_key") as { enum: string[] };
    expect([...F0_COMMAND_KEYS]).toEqual(f0Schema.enum);
    expect([...F0_COMMAND_KEYS]).toEqual(CATALOG.entries.map((e) => e.key).sort());
    const blockers = schemaNode("/$defs/F0BlockedOperationRead/allOf/1/properties/blockers/items") as { enum: string[] };
    expect([...F0_BLOCKER_WORDS]).toEqual(blockers.enum);
    expect([...F0_RESOURCE_KINDS]).toEqual(schemaNode("/$defs/F0CommandCollection/properties/resource/properties/kind/enum"));
    expect([...F0_ENVIRONMENTS]).toEqual(schemaNode("/$defs/F0CommandCollection/properties/environment/enum"));
    const preview = (field: string) => schemaEnum(TRUSTED, `/components/schemas/CommandPreview/properties/${field}/anyOf/0`);
    expect([...COMMAND_REASON_CODES]).toEqual([...preview("reason_code")]);
    expect([...APPROVAL_GATES]).toEqual([...preview("approval_gate")]);
    expect([...SAFE_NEXT_ACTIONS]).toEqual([...schemaEnum(TRUSTED, "/components/schemas/CommandProblem/properties/safe_next_action")]);
  });

  it("BE-P13: every apply, lookup and emergency-close plan fixture passes its published schema, and reads", () => {
    expect(planViolations(PLAN_EC)).toEqual([]);
    expect(deniedApplyViolations(APPLY_DENIED)).toEqual([]);
    expect(deniedApplyViolations(APPLY_REPLAYED)).toEqual([]);
    expect(conflictApplyViolations(APPLY_CONFLICT)).toEqual([]);
    for (const body of [LOOKUP_NONE, LOOKUP_FOUND, LOOKUP_CONFLICT]) expect(lookupViolations(body)).toEqual([]);
    expect(previewViolations(PREVIEW_FIXTURE_ALLOWED)).toEqual([]);
    expect(planOf(PLAN_EC)).not.toBeNull();
    expect(deniedOf(APPLY_DENIED)).not.toBeNull();
    expect(deniedOf(APPLY_REPLAYED)).not.toBeNull();
    expect(conflictOf(APPLY_CONFLICT)).not.toBeNull();
    for (const body of [LOOKUP_NONE, LOOKUP_FOUND, LOOKUP_CONFLICT]) expect(lookupOf(body)).not.toBeNull();
    expect(previewOf(PREVIEW_FIXTURE_ALLOWED)).not.toBeNull();
  });

  it("BE-P13: the plan carries current_primitive (null, or the N16B object) and a typed cost_impact absence, read verbatim", () => {
    expect(planOf(PLAN)).toMatchObject({ currentPrimitive: null, costImpact: COST_ABSENT });
    expect(planOf(PLAN_EC)).toMatchObject({
      commandKey: "ops/emergency-close", costImpact: COST_ABSENT,
      currentPrimitive: { id: "live.emergency-close", sourceEnvironment: "LIVE_FULL", targetTypes: ["ACCOUNT"], runtimeActive: false, sourceSideEffectRequested: false },
    });
    expect(previewOf(PREVIEW_BLOCKED)!.costImpact).toEqual(COST_ABSENT);
    expect(previewOf(PREVIEW_FIXTURE_ALLOWED)!.costImpact).toEqual(COST_ABSENT);
  });

  it("BE-P13: the apply 409 is the wire envelope, not the RelayDenied body; the three bodies read to their own facts", () => {
    expect(deniedOf(APPLY_DENIED)).toEqual({
      code: "COMMAND_RELAY_DISABLED", requestId: "req_apply_first_0001", operationId: "op_01K3COMMANDPLAN000000000000", decision: "DENIED",
      reason: "COMMAND_RELAY_DISABLED", retryAllowed: false, sourceRequestSent: false, requestKey: "ui:apply:0001", replayed: false,
    });
    expect(deniedOf(APPLY_REPLAYED)).toMatchObject({ requestId: "req_apply_replay_0002", replayed: true, requestKey: "ui:apply:0001" });
    expect(conflictOf(APPLY_CONFLICT)).toEqual({ code: "REQUEST_KEY_PAYLOAD_CONFLICT", requestId: "req_apply_conflict_0003", requestKey: "ui:apply:0001", sourceRequestSent: false });
    // The old stand-alone RelayDenied body was never the 409 body: neither apply reader reads it, and the stand-alone reader does not read the envelope.
    expect(readF0ApplyAnswerV1(DENIED)).toBeNull();
    expect(readRelayDecisionV1(APPLY_DENIED)).toEqual({ kind: "unsupported_shape", schemaVersion: null });
    // Each reader reads only its own code; the combined reader tells them apart by `error.code`.
    expect(deniedOf(APPLY_CONFLICT)).toBeNull();
    expect(conflictOf(APPLY_DENIED)).toBeNull();
    expect(readF0ApplyAnswerV1(APPLY_DENIED)).toMatchObject({ kind: "f0_apply_denied" });
    expect(readF0ApplyAnswerV1(APPLY_CONFLICT)).toMatchObject({ kind: "f0_apply_key_conflict" });
    expect(F0_APPLY_DENIED_CODE).toBe(APPLY_DENIED.error.code);
    expect(F0_APPLY_CONFLICT_CODE).toBe(APPLY_CONFLICT.error.code);
  });

  it("BE-P13: the lookup reads NONE, FOUND (with the decision a replay returns) and CONFLICT, and a FOUND decision is the RelayDenied body", () => {
    expect(lookupOf(LOOKUP_NONE)).toEqual({ state: "NONE", operationId: "op_01K3COMMANDPLAN000000000000", requestKey: "ui:apply:0001" });
    expect(lookupOf(LOOKUP_CONFLICT)).toEqual({ state: "CONFLICT", operationId: "op_01K3COMMANDPLAN000000000000", requestKey: "ui:apply:0001" });
    const found = lookupOf(LOOKUP_FOUND)!;
    expect(found).toMatchObject({ state: "FOUND", firstRecordedAt: { iso: "2026-08-22T12:00:05Z" } });
    expect(found.state === "FOUND" && found.relayDecision).toEqual(denyOf(DENIED));
    expect([...F0_APPLY_ATTEMPT_STATES]).toEqual(["NONE", "FOUND", "CONFLICT"]);
    expect(F0_APPLY_ATTEMPT_SCHEMA).toBe("portal.execution.f0-apply-attempt.v1");
  });

  it("the reader and the schemas agree on schema_version, and none reads another's body", () => {
    expect(readCommandPlanV1(OPERATION)).toEqual({ kind: "unsupported_shape", schemaVersion: COMMAND_OPERATION_SCHEMA });
    expect(readCommandOperationV1(PLAN)).toEqual({ kind: "unsupported_shape", schemaVersion: COMMAND_PLAN_SCHEMA });
    expect(readRelayDecisionV1(PLAN)).toEqual({ kind: "unsupported_shape", schemaVersion: COMMAND_PLAN_SCHEMA });
    expect(readF0CommandCollectionV1(DENIED)).toEqual({ kind: "unsupported_shape", schemaVersion: RELAY_DECISION_SCHEMA });
    expect(readCommandPreviewV1(COLLECTION)).toEqual({ kind: "unsupported_shape", schemaVersion: F0_COLLECTION_SCHEMA });
  });
});

/** A node of the operations schema by JSON pointer. */
function schemaNode(pointer: string): unknown {
  let node: unknown = loadSchema(`${OPS}.schema.json`);
  for (const part of pointer.split("/").filter((p) => p.length > 0)) node = (node as Record<string, unknown>)[part];
  return node;
}

/* ═════════════════════════ L1 ═════════════════════════ */
/** One axis over labelled values: a label names the VALUE (so the string "true" and the boolean true are different picks). */
const pick = (id: string, path: Path, entries: readonly (readonly [string, unknown])[]): Dimension =>
  dimensionOf(id, entries.map(([label, value]) => ({ label, apply: (d: Draft) => setPath(d, path, value === ABSENT ? ABSENT : structuredClone(value)) })));
const words = (...values: string[]): (readonly [string, unknown])[] => values.map((v) => [v, v] as const);

describe("L1 · matrix A · plan: constants x flags x counts", () => {
  const DIMS = [
    pick("tier", ["risk_tier"], [...RISK_TIERS_V2.map((t) => [t, t] as const), ["made up", "R5_MADE_UP"]]),
    pick("status", ["status"], [["BLOCKED", "BLOCKED"], ["READY", "READY"], ["lower", "blocked"]]),
    pick("token", ["apply_token"], [["null", null], ["token", "tok_1"], ["empty", ""]]),
    pick("relay", ["relay_capability"], words("DISABLED", "ENABLED")),
    pick("effect", ["source_side_effect_requested"], [["false", false], ["true", true], ["null", null], ["string false", "false"], ["absent", ABSENT]]),
    pick("replayed", ["replayed"], [["false", false], ["true", true], ["string true", "true"], ["null", null]]),
    dimensionOf("blockers", [
      { label: "0", apply: (d: Draft) => { d.blockers = []; } },
      { label: "1", apply: (d: Draft) => { d.blockers = ["COMMAND_RELAY_DISABLED"]; } },
      { label: "dup", apply: (d: Draft) => { d.blockers = ["COMMAND_RELAY_DISABLED", "COMMAND_RELAY_DISABLED"]; } },
    ]),
  ];
  const states = cartesian(PLAN, DIMS);
  const accept = (p: Record<string, string>) =>
    p.tier !== "made up" && p.status === "BLOCKED" && p.token === "null" && p.relay === "DISABLED" && p.effect === "false"
    && (p.replayed === "true" || p.replayed === "false") && p.blockers === "1";

  it("prints the matrix size", () => {
    console.info(describeCoverage("commandOperation A (plan) cartesian", coverage(DIMS, states)));
    expect(states).toHaveLength(8 * 3 * 3 * 2 * 5 * 4 * 3);
    expect(states.filter((s) => accept(s.picks))).toHaveLength(7 * 2);
  });
  it.each(states.map((s) => [s.name, s] as const))("%s", (_name, s) => {
    const read = planOf(s.value);
    expect(read !== null).toBe(accept(s.picks));
    // The schema agrees wherever the reader reads (the reader is never looser).
    if (read !== null) expect(planViolations(s.value)).toEqual([]);
  });
});

describe("L1 · matrix B · operation: constants x chronology x F0 refinement", () => {
  const T = (n: number) => `2026-08-22T12:00:0${n}Z`;
  const DIMS = [
    pick("status", ["status"], words("BLOCKED", "SUCCEEDED")),
    pick("verification", ["verification_result"], words("NOT_STARTED", "SUCCEEDED")),
    pick("receipt", ["relay_receipt"], [["null", null], ["receipt", "rcpt_1"]]),
    pick("effect", ["source_side_effect_requested"], [["false", false], ["true", true], ["absent", ABSENT]]),
    dimensionOf("chronology", [
      { label: "same", apply: (d: Draft) => { d.created_at = T(0); d.updated_at = T(0); } },
      { label: "later", apply: (d: Draft) => { d.created_at = T(0); d.updated_at = T(5); } },
      { label: "before", apply: (d: Draft) => { d.created_at = T(5); d.updated_at = T(0); } },
      { label: "date rolled over", apply: (d: Draft) => { d.created_at = "2026-02-30T12:00:00Z"; d.updated_at = "2026-03-02T12:00:00Z"; } },
      { label: "offset", apply: (d: Draft) => { d.created_at = "2026-08-22T19:00:00+07:00"; d.updated_at = "2026-08-22T19:00:00+07:00"; } },
    ]),
    pick("key", ["command_key"], words("account/sync", "ops/emergency-close", "zzz/made-up")),
    dimensionOf("blockers", [
      { label: "relay", apply: (d: Draft) => { d.blockers = ["COMMAND_RELAY_DISABLED"]; } },
      { label: "no relay word", apply: (d: Draft) => { d.blockers = ["OWNER_REVIEW_REQUIRED"]; } },
      { label: "4", apply: (d: Draft) => { d.blockers = ["COMMAND_RELAY_DISABLED", "OWNER_REVIEW_REQUIRED", "N16B_RUNTIME_ACTIVATION_PENDING", "N16B_TARGET_SCOPE_UNSUPPORTED"]; } },
      { label: "free text", apply: (d: Draft) => { d.blockers = ["COMMAND_RELAY_DISABLED", "SOMETHING_ELSE"]; } },
    ]),
    dimensionOf("warnings", [
      { label: "none", apply: (d: Draft) => { d.warnings = []; } },
      { label: "one", apply: (d: Draft) => { d.warnings = ["W1"]; } },
    ]),
  ];
  const states = cartesian(OPERATION, DIMS);
  /** The base operation schema (and reader): constants and chronology. An offset is valid date-time but the reader is stricter (UTC only). */
  const baseOk = (p: Record<string, string>) =>
    p.status === "BLOCKED" && p.verification === "NOT_STARTED" && p.receipt === "null" && p.effect === "false" && (p.chronology === "same" || p.chronology === "later");
  const f0Ok = (p: Record<string, string>) => baseOk(p) && p.key !== "zzz/made-up" && p.blockers === "relay" && p.warnings === "none";

  it("prints the matrix size", () => {
    console.info(describeCoverage("commandOperation B (operation) cartesian", coverage(DIMS, states)));
    expect(states).toHaveLength(2 * 2 * 2 * 3 * 5 * 3 * 4 * 2);
  });
  it.each(states.map((s) => [s.name, s] as const))("%s", (_name, s) => {
    const base = opOf(s.value);
    const f0 = f0Of(s.value);
    expect(base !== null, "base").toBe(baseOk(s.picks));
    expect(f0 !== null, "f0").toBe(f0Ok(s.picks));
    // Never looser than the schemas, in either family.
    if (base !== null) expect(opViolations(s.value)).toEqual([]);
    if (f0 !== null) expect(f0Violations(s.value)).toEqual([]);
  });
});

describe("L1 · matrix C · relay decision: the four constants", () => {
  const DIMS = [
    pick("decision", ["decision"], words("DENIED", "ALLOWED")),
    pick("reason", ["reason"], words("COMMAND_RELAY_DISABLED", "OTHER")),
    pick("retry", ["retry_allowed"], [["false", false], ["true", true], ["null", null], ["string false", "false"]]),
    pick("sent", ["source_request_sent"], [["false", false], ["true", true], ["null", null], ["string false", "false"], ["absent", ABSENT]]),
  ];
  const states = cartesian(DENIED, DIMS);
  const accept = (p: Record<string, string>) => p.decision === "DENIED" && p.reason === "COMMAND_RELAY_DISABLED" && p.retry === "false" && p.sent === "false";
  it("prints the matrix size", () => {
    console.info(describeCoverage("commandOperation C (relay) cartesian", coverage(DIMS, states)));
    expect(states).toHaveLength(2 * 2 * 4 * 5);
    expect(states.filter((s) => accept(s.picks))).toHaveLength(1);
  });
  it.each(states.map((s) => [s.name, s] as const))("%s", (_name, s) => {
    const read = denyOf(s.value);
    expect(read !== null).toBe(accept(s.picks));
    if (read !== null) expect(denyViolations(s.value)).toEqual([]);
  });
});

describe("L1 · matrix D · F0 collection: count x limit x cursor x order", () => {
  const item = (id: string, created: string): Draft => ({ ...clone(OPERATION), operation_id: id, created_at: created, updated_at: created });
  const A = item("op_a", "2026-08-22T12:00:05Z");
  const B = item("op_b", "2026-08-22T12:00:05Z");
  const C = item("op_c", "2026-08-22T12:00:01Z");
  const orders: Record<string, Draft[]> = {
    "newest first, id ascending": [A, B, C], "oldest first": [C, B, A], "ties id descending": [B, A, C], "duplicate id": [A, A, C], none: [], one: [A],
  };
  const DIMS = [
    dimensionOf("items", Object.entries(orders).map(([label, items]) => ({ label, apply: (d: Draft) => { d.items = clone(items); } }))),
    pick("returned", ["page", "returned_count"], [["0", 0], ["1", 1], ["3", 3]]),
    pick("limit", ["page", "limit"], [["1", 1], ["2", 2], ["25", 25], ["101", 101]]),
    pick("more", ["page", "has_more"], [["false", false], ["true", true], ["string true", "true"]]),
    pick("cursor", ["page", "next_cursor"], [["null", null], ["c1", "c1"], ["empty", ""]]),
  ];
  const states = cartesian(COLLECTION, DIMS);
  const accept = (p: Record<string, string>) => {
    const items = orders[p.items!]!;
    const ordered = p.items === "newest first, id ascending" || p.items === "none" || p.items === "one";
    const returned = Number(p.returned);
    const limit = Number(p.limit);
    return ordered && returned === items.length && items.length <= limit && limit <= 100
      && ((p.more === "false" && p.cursor === "null") || (p.more === "true" && p.cursor === "c1"));
  };
  it("prints the matrix size", () => {
    console.info(describeCoverage("commandOperation D (collection) cartesian", coverage(DIMS, states)));
    expect(states).toHaveLength(6 * 3 * 4 * 3 * 3);
    expect(states.filter((s) => accept(s.picks)).length).toBeGreaterThan(5);
  });
  it.each(states.map((s) => [s.name, s] as const))("%s", (_name, s) => {
    const read = collOf(s.value);
    expect(read !== null).toBe(accept(s.picks));
    if (read !== null) expect(collectionViolations(s.value)).toEqual([]);
  });
});

describe("L1 · matrix E · preview: allowed x reason x digest x gate", () => {
  const DIMS = [
    pick("allowed", ["allowed"], [["true", true], ["false", false], ["null", null], ["string true", "true"]]),
    pick("reason", ["reason_code"], [["null", null], ...COMMAND_REASON_CODES.slice(0, 2).map((c) => [c, c] as const), ["made up", "MADE_UP"]]),
    pick("digest", ["preview_digest"], [["null", null], ["lower", `sha256:${"a".repeat(64)}`], ["upper", `sha256:${"A".repeat(64)}`], ["short", "sha256:abc"]]),
    pick("gate", ["approval_gate"], [["null", null], ["R1", "R1"], ["CAPITAL", "CAPITAL"], ["lower", "r1"]]),
    pick("applied", ["business_applied"], [["false", false], ["true", true], ["null", null]]),
    pick("reserved", ["reserved"], [["false", false], ["true", true]]),
  ];
  const states = cartesian(PREVIEW_ALLOWED, DIMS);
  const accept = (p: Record<string, string>) =>
    (p.allowed === "true" || p.allowed === "false") && p.reason !== "made up" && (p.digest === "null" || p.digest === "lower") && p.gate !== "lower"
    && p.applied === "false" && p.reserved === "false";
  it("prints the matrix size", () => {
    console.info(describeCoverage("commandOperation E (preview) cartesian", coverage(DIMS, states)));
    expect(states).toHaveLength(4 * 4 * 4 * 4 * 3 * 2);
  });
  it.each(states.map((s) => [s.name, s] as const))("%s", (_name, s) => {
    const read = previewOf(s.value);
    expect(read !== null).toBe(accept(s.picks));
    if (read !== null) expect(previewViolations(s.value)).toEqual([]);
  });
});

describe("L1 · matrix F · problem: code forms x optional keys", () => {
  const DIMS = [
    pick("code", ["error", "code"], [["unverified", "COMMAND_STATUS_UNVERIFIED"], ["retry", "ACCESS_RETRY_REQUIRED"], ["lower", "lower_case"], ["one letter", "A"], ["space", "WITH SPACE"], ["121 chars", "X".repeat(121)]]),
    pick("copy", ["public_copy_key"], [["key", "command.status.unverified"], ["absent", ABSENT], ["null", null], ["empty", ""]]),
    pick("next", ["safe_next_action"], [["query", "QUERY_SAME_INTENT"], ["review", "REVIEW_BLOCKER"], ["absent", ABSENT], ["new key", "RETRY_NEW_KEY"]]),
  ];
  const states = cartesian(PROBLEM, DIMS);
  const accept = (p: Record<string, string>) => (p.code === "unverified" || p.code === "retry") && (p.copy === "key" || p.copy === "absent") && p.next !== "new key";
  it("prints the matrix size", () => {
    console.info(describeCoverage("commandOperation F (problem) cartesian", coverage(DIMS, states)));
    expect(states).toHaveLength(6 * 4 * 4);
  });
  it.each(states.map((s) => [s.name, s] as const))("%s", (_name, s) => {
    const read = readCommandProblemV1(s.value);
    expect(read !== null).toBe(accept(s.picks));
  });
  it("the server's free text is validated and then dropped: it is nowhere in the answer", () => {
    const body = clone(PROBLEM);
    body.error.message = "PROBE_FREE_TEXT_FROM_SERVER";
    const answer = readCommandProblemV1(body);
    expect(answer).not.toBeNull();
    expect(JSON.stringify(answer)).not.toContain("PROBE_FREE_TEXT_FROM_SERVER");
    expect(answer).toEqual({ code: "COMMAND_STATUS_UNVERIFIED", requestId: PROBLEM.request_id, publicCopyKey: "command.status.unverified", safeNextAction: "QUERY_SAME_INTENT" });
  });
});

/* ═════════════ BE-P13 matrices (G to J): the schema is the oracle, the contract text is the rest ═════════════ */
const KEY_OK = "ui:apply:0001";
const detailPick = (id: string, field: string, entries: readonly (readonly [string, unknown])[]): Dimension => pick(id, ["details", field], entries);

describe("L1 · matrix G · plan: current_primitive x command key x cost_impact", () => {
  const PRIMITIVE = PLAN_EC.current_primitive as Draft;
  const DIMS = [
    dimensionOf("primitive", [
      { label: "null", apply: (d: Draft) => { d.current_primitive = null; } },
      { label: "n16b", apply: (d: Draft) => { d.current_primitive = clone(PRIMITIVE); } },
      { label: "other id", apply: (d: Draft) => { d.current_primitive = { ...clone(PRIMITIVE), id: "live.other" }; } },
      { label: "other env", apply: (d: Draft) => { d.current_primitive = { ...clone(PRIMITIVE), source_environment: "PAPER" }; } },
      { label: "no targets", apply: (d: Draft) => { d.current_primitive = { ...clone(PRIMITIVE), target_types: [] }; } },
      { label: "two targets", apply: (d: Draft) => { d.current_primitive = { ...clone(PRIMITIVE), target_types: ["ACCOUNT", "ACCOUNT"] }; } },
      { label: "portfolio target", apply: (d: Draft) => { d.current_primitive = { ...clone(PRIMITIVE), target_types: ["PORTFOLIO"] }; } },
      { label: "runtime active", apply: (d: Draft) => { d.current_primitive = { ...clone(PRIMITIVE), runtime_active: true }; } },
      { label: "effect requested", apply: (d: Draft) => { d.current_primitive = { ...clone(PRIMITIVE), source_side_effect_requested: true }; } },
      { label: "extra key", apply: (d: Draft) => { d.current_primitive = { ...clone(PRIMITIVE), extra: 1 }; } },
      { label: "missing key", apply: (d: Draft) => { const p = clone(PRIMITIVE); delete p.runtime_active; d.current_primitive = p; } },
      { label: "absent", apply: (d: Draft) => { delete d.current_primitive; } },
    ]),
    pick("key", ["command_key"], words("account/sync", "ops/emergency-close")),
    dimensionOf("cost", [
      { label: "absence", apply: (d: Draft) => { d.cost_impact = { ...COST_ABSENT }; } },
      { label: "available", apply: (d: Draft) => { d.cost_impact = { state: "AVAILABLE", reason: "NO_COST_OR_IMPACT_SOURCE" }; } },
      { label: "other reason", apply: (d: Draft) => { d.cost_impact = { state: "NOT_PUBLISHED", reason: "COMPUTED_LOCALLY" }; } },
      { label: "a figure", apply: (d: Draft) => { d.cost_impact = { state: "NOT_PUBLISHED", reason: "NO_COST_OR_IMPACT_SOURCE", amount: "1.5" }; } },
      { label: "null", apply: (d: Draft) => { d.cost_impact = null; } },
      { label: "absent", apply: (d: Draft) => { delete d.cost_impact; } },
    ]),
  ];
  const states = cartesian(PLAN, DIMS);
  /** Schema: null or the exact object; cost the exact absence. Named group `primitive-identity`: the object only beside ops/emergency-close. */
  const schemaOk = (p: Record<string, string>) => (p.primitive === "null" || p.primitive === "n16b") && p.cost === "absence";
  const readerOk = (p: Record<string, string>) => schemaOk(p) && (p.primitive === "null" || p.key === "ops/emergency-close");

  it("prints the matrix size and the stricter group's count", () => {
    console.info(describeCoverage("commandOperation G (plan primitive/cost) cartesian", coverage(DIMS, states)));
    expect(states).toHaveLength(12 * 2 * 6);
    expect(states.filter((s) => schemaOk(s.picks))).toHaveLength(2 * 2);
    // primitive-identity: the one schema-valid cell the reader refuses (the N16B object beside account/sync).
    expect(states.filter((s) => schemaOk(s.picks) && !readerOk(s.picks))).toHaveLength(1);
    expect(states.filter((s) => readerOk(s.picks))).toHaveLength(3);
  });
  it.each(states.map((s) => [s.name, s] as const))("%s", (_name, s) => {
    const read = planOf(s.value);
    expect(read !== null).toBe(readerOk(s.picks));
    if (read !== null) expect(planViolations(s.value)).toEqual([]);
    expect(planViolations(s.value).length === 0).toBe(schemaOk(s.picks));
  });
});

describe("L1 · matrix H · F0 apply denied: decision constants x key x replayed x top-level leftovers", () => {
  const DIMS = [
    detailPick("decision", "decision", words("DENIED", "ALLOWED")),
    detailPick("retry", "retry_allowed", [["false", false], ["true", true], ["null", null]]),
    detailPick("sent", "source_request_sent", [["false", false], ["true", true], ["null", null], ["absent", ABSENT]]),
    detailPick("key", "request_key", [["ui", KEY_OK], ["empty", ""], ["leading dash", "-x"], ["193 chars", `a${"b".repeat(192)}`], ["absent", ABSENT]]),
    detailPick("replayed", "replayed", [["false", false], ["true", true], ["string true", "true"], ["null", null], ["absent", ABSENT]]),
    dimensionOf("top", [
      { label: "envelope", apply: () => undefined },
      { label: "legacy source_request_sent at the top", apply: (d: Draft) => { d.source_request_sent = false; } },
      { label: "public_copy_key", apply: (d: Draft) => { d.public_copy_key = "x"; } },
    ]),
  ];
  const states = cartesian(APPLY_DENIED, DIMS);
  const accept = (p: Record<string, string>) =>
    p.decision === "DENIED" && p.retry === "false" && p.sent === "false" && p.key === "ui"
    && (p.replayed === "false" || p.replayed === "true") && p.top === "envelope";
  it("prints the matrix size", () => {
    console.info(describeCoverage("commandOperation H (apply denied) cartesian", coverage(DIMS, states)));
    expect(states).toHaveLength(2 * 3 * 4 * 5 * 5 * 3);
    expect(states.filter((s) => accept(s.picks))).toHaveLength(2);
  });
  it.each(states.map((s) => [s.name, s] as const))("%s", (_name, s) => {
    const read = deniedOf(s.value);
    expect(read !== null).toBe(accept(s.picks));
    if (read !== null) expect(deniedApplyViolations(s.value)).toEqual([]);
    // The combined reader agrees, and the key-conflict reader never reads a denial.
    expect(readF0ApplyAnswerV1(s.value) !== null).toBe(accept(s.picks));
    expect(conflictOf(s.value)).toBeNull();
  });
});

describe("L1 · matrix I · F0 apply key conflict: code x flag x key x extra detail", () => {
  const DIMS = [
    pick("code", ["error", "code"], words("REQUEST_KEY_PAYLOAD_CONFLICT", "COMMAND_RELAY_DISABLED", "COMMAND_IDEMPOTENCY_CONFLICT")),
    detailPick("sent", "source_request_sent", [["false", false], ["true", true], ["null", null], ["absent", ABSENT]]),
    detailPick("key", "request_key", [["ui", KEY_OK], ["empty", ""], ["space", "a b"], ["absent", ABSENT]]),
    dimensionOf("extra", [
      { label: "none", apply: () => undefined },
      { label: "the other operation's id", apply: (d: Draft) => { d.details.operation_id = "op_OTHER"; } },
    ]),
  ];
  const states = cartesian(APPLY_CONFLICT, DIMS);
  const accept = (p: Record<string, string>) => p.code === "REQUEST_KEY_PAYLOAD_CONFLICT" && p.sent === "false" && p.key === "ui" && p.extra === "none";
  it("prints the matrix size", () => {
    console.info(describeCoverage("commandOperation I (apply key conflict) cartesian", coverage(DIMS, states)));
    expect(states).toHaveLength(3 * 4 * 4 * 2);
    expect(states.filter((s) => accept(s.picks))).toHaveLength(1);
  });
  it.each(states.map((s) => [s.name, s] as const))("%s", (_name, s) => {
    const read = conflictOf(s.value);
    expect(read !== null).toBe(accept(s.picks));
    if (read !== null) expect(conflictApplyViolations(s.value)).toEqual([]);
    expect(readF0ApplyAnswerV1(s.value) !== null).toBe(accept(s.picks));
    expect(deniedOf(s.value)).toBeNull();
  });
});

describe("L1 · matrix J · apply-attempt lookup: state x relay_decision x first_recorded_at x operation", () => {
  const OP = LOOKUP_FOUND.operation_id as string;
  const DIMS = [
    pick("state", ["state"], words("NONE", "FOUND", "CONFLICT", "SENT")),
    dimensionOf("decision", [
      { label: "null", apply: (d: Draft) => { d.relay_decision = null; } },
      { label: "this operation", apply: (d: Draft) => { d.relay_decision = clone(LOOKUP_FOUND.relay_decision); } },
      { label: "another operation", apply: (d: Draft) => { d.relay_decision = { ...clone(LOOKUP_FOUND.relay_decision), operation_id: "op_OTHER" }; } },
      { label: "retry allowed", apply: (d: Draft) => { d.relay_decision = { ...clone(LOOKUP_FOUND.relay_decision), retry_allowed: true }; } },
      { label: "request sent", apply: (d: Draft) => { d.relay_decision = { ...clone(LOOKUP_FOUND.relay_decision), source_request_sent: true }; } },
      { label: "apply envelope", apply: (d: Draft) => { d.relay_decision = clone(APPLY_DENIED); } },
    ]),
    dimensionOf("at", [
      { label: "null", apply: (d: Draft) => { d.first_recorded_at = null; } },
      { label: "utc", apply: (d: Draft) => { d.first_recorded_at = "2026-08-22T12:00:05Z"; } },
      { label: "offset", apply: (d: Draft) => { d.first_recorded_at = "2026-08-22T19:00:05+07:00"; } },
      { label: "not a date", apply: (d: Draft) => { d.first_recorded_at = "yesterday"; } },
      { label: "absent", apply: (d: Draft) => { delete d.first_recorded_at; } },
    ]),
    pick("key", ["request_key"], [["ui", KEY_OK], ["empty", ""], ["absent", ABSENT]]),
  ];
  const states = cartesian(LOOKUP_NONE, DIMS);
  /** The schema's three variants. A date-time is any string to the testkit checker (no `format` support), so the schema cannot tell `offset` from `utc`. */
  const schemaOk = (p: Record<string, string>) => {
    if (p.key !== "ui") return false;
    if (p.state === "FOUND") return p.decision === "this operation" || p.decision === "another operation" ? p.at === "utc" || p.at === "offset" || p.at === "not a date" : false;
    if (p.state === "NONE" || p.state === "CONFLICT") return p.decision === "null" && p.at === "null";
    return false;
  };
  /** Stricter, named: `lookup-identity` (the FOUND decision names the operation looked up) and `utc-instant` (an offset or a non-date is not an instant). */
  const readerOk = (p: Record<string, string>) => schemaOk(p) && (p.state !== "FOUND" || (p.decision === "this operation" && p.at === "utc"));
  it("prints the matrix size and the stricter groups' counts", () => {
    console.info(describeCoverage("commandOperation J (lookup) cartesian", coverage(DIMS, states)));
    expect(states).toHaveLength(4 * 6 * 5 * 3);
    expect(states.filter((s) => schemaOk(s.picks))).toHaveLength(2 + 2 * 3);
    expect(states.filter((s) => readerOk(s.picks))).toHaveLength(2 + 1);
    expect(OP).toBe("op_01K3COMMANDPLAN000000000000");
  });
  it.each(states.map((s) => [s.name, s] as const))("%s", (_name, s) => {
    const read = lookupOf(s.value);
    expect(read !== null).toBe(readerOk(s.picks));
    if (read !== null) expect(lookupViolations(s.value)).toEqual([]);
    expect(lookupViolations(s.value).length === 0, "schema oracle agrees with the hand-written one").toBe(schemaOk(s.picks));
  });
});

/* ═════════════════════════ L2 ═════════════════════════ */
describe("L2 · scale", () => {
  it("a collection of 100 items (the schema's maximum) reads inside the budget", () => {
    const body = clone(COLLECTION);
    body.items = Array.from({ length: 100 }, (_v, i) => {
      const at = `2026-08-22T12:${String(59 - Math.floor(i / 60)).padStart(2, "0")}:${String(59 - (i % 60)).padStart(2, "0")}Z`;
      return { ...clone(OPERATION), operation_id: `op_${String(i).padStart(5, "0")}`, created_at: at, updated_at: at };
    });
    body.page = { limit: 100, returned_count: 100, has_more: true, next_cursor: "cursor_after_100" };
    expect(collectionViolations(body)).toEqual([]);
    const { value, ms } = timed(() => collOf(body));
    console.info(`commandOperation 100-item collection (${(serializedBytes(body) / 1024).toFixed(1)} KiB): ${ms.toFixed(1)} ms (budget ${BUDGET_WIDEST_MS} ms)`);
    expect(value!.items).toHaveLength(100);
    expect(ms).toBeLessThan(BUDGET_WIDEST_MS);
  });

  it("128 blockers of 128 characters read; the 129th voids the read", () => {
    const body = clone(PLAN);
    body.blockers = Array.from({ length: 128 }, (_v, i) => `${String(i).padStart(3, "0")}${"B".repeat(125)}`);
    expect(planViolations(body)).toEqual([]);
    const { value, ms } = timed(() => planOf(body));
    expect(value!.blockers).toHaveLength(128);
    expect(ms).toBeLessThan(BUDGET_WIDEST_MS);
    expect(serializedBytes(body)).toBeLessThan(MIB);
    body.blockers.push("one more");
    expect(planOf(body)).toBeNull();
  });

  it("2,000 reads of each body inside the budget", () => {
    const t = timed(() => {
      for (let n = 0; n < 2000; n += 1) {
        readCommandPlanV1(PLAN); readCommandOperationV1(OPERATION); readRelayDecisionV1(DENIED); readF0CommandCollectionV1(COLLECTION); readCommandPreviewV1(PREVIEW_ALLOWED); readCommandProblemV1(PROBLEM);
      }
    });
    console.info(`commandOperation 2,000 x 6 reads: ${t.ms.toFixed(0)} ms (budget ${BUDGET_2000_READS_MS} ms)`);
    expect(t.ms).toBeLessThan(BUDGET_2000_READS_MS);
  });

  it("BE-P13: 2,000 reads of each new body inside the budget", () => {
    const t = timed(() => {
      for (let n = 0; n < 2000; n += 1) {
        readF0ApplyDeniedV1(APPLY_REPLAYED); readF0ApplyKeyConflictV1(APPLY_CONFLICT); readF0ApplyAttemptLookupV1(LOOKUP_FOUND); readCommandPlanV1(PLAN_EC);
      }
    });
    console.info(`commandOperation 2,000 x 4 BE-P13 reads: ${t.ms.toFixed(0)} ms (budget ${BUDGET_2000_READS_MS} ms)`);
    expect(t.ms).toBeLessThan(BUDGET_2000_READS_MS);
  });

  it("a 70,000 character id, key, blocker, digest or cursor is refused fast, not scanned", () => {
    const text = "a".repeat(70_000);
    const edits: [() => unknown][] = [
      [() => planOf({ ...clone(PLAN), operation_id: text })], [() => planOf({ ...clone(PLAN), command_key: text })], [() => planOf({ ...clone(PLAN), blockers: [text] })],
      [() => planOf({ ...clone(PLAN), plan_digest: `sha256:${text}` })], [() => opOf({ ...clone(OPERATION), warnings: [text] })],
      [() => denyOf({ ...clone(DENIED), operation_id: text })], [() => collOf({ ...clone(COLLECTION), page: { ...clone(COLLECTION.page), has_more: true, next_cursor: text } })],
      [() => readCommandProblemV1({ ...clone(PROBLEM), request_id: text })],
      [() => deniedOf({ ...clone(APPLY_DENIED), request_id: text })], [() => deniedOf({ ...clone(APPLY_DENIED), details: { ...clone(APPLY_DENIED.details), request_key: text } })],
      [() => conflictOf({ ...clone(APPLY_CONFLICT), error: { code: "REQUEST_KEY_PAYLOAD_CONFLICT", message: text } })], [() => lookupOf({ ...clone(LOOKUP_NONE), request_key: text })],
    ];
    for (const [run] of edits) {
      const { value, ms } = timed(run);
      expect(value).toBeNull();
      expect(ms).toBeLessThan(50);
    }
  });
});

/* ═════════════════════════ L3 ═════════════════════════ */
interface Case { name: string; category: string; value: unknown; probe: string | null }
const enumsOf = (base: Draft, path: readonly (string | number)[], valid: readonly unknown[]): Case[] =>
  enumCases(base, path, valid.map(String)).filter((c) => !valid.includes(getPath(c.value, path)));

const PLAN_NEG: Case[] = [
  ...enumsOf(PLAN, ["risk_tier"], [...RISK_TIERS_V2]),
  ...enumsOf(PLAN, ["status"], ["BLOCKED"]),
  ...enumsOf(PLAN, ["command_type"], ["EXECUTION_COMMAND"]),
  ...enumsOf(PLAN, ["relay_capability"], ["DISABLED"]),
  ...enumsOf(PLAN, ["payload_storage_policy"], ["HASH_ONLY_NO_RAW"]),
  ...enumsOf(PLAN, ["source_side_effect_requested"], [false]),
  ...enumsOf(PLAN, ["apply_token"], [null]),
  ...requiredCases(PLAN, Object.keys(PLAN).map((k) => [k] as const)),
  ...integerCases(PLAN, ["command_version"]).filter((c) => getPath(c.value, ["command_version"]) !== 1),
  ...stringCases(PLAN, ["operation_id"]), ...stringCases(PLAN, ["command_key"]), ...stringCases(PLAN, ["payload_hash"]), ...stringCases(PLAN, ["plan_digest"]),
  ...stringCases(PLAN, ["expires_at"]),
  ...arrayCases(PLAN, ["blockers"]), ...arrayCases(PLAN, ["warnings"]),
  ...schemaVersionCases(PLAN, ["schema_version"], COMMAND_PLAN_SCHEMA, [COMMAND_OPERATION_SCHEMA, RELAY_DECISION_SCHEMA, "execution.command-plan.v2"]),
  ...pollutionCases(PLAN, [[]]),
];
const OP_NEG: Case[] = [
  ...enumsOf(OPERATION, ["status"], ["BLOCKED"]),
  ...enumsOf(OPERATION, ["verification_result"], ["NOT_STARTED"]),
  ...enumsOf(OPERATION, ["command_type"], ["EXECUTION_COMMAND"]),
  ...enumsOf(OPERATION, ["relay_receipt"], [null]),
  ...enumsOf(OPERATION, ["source_side_effect_requested"], [false]),
  ...requiredCases(OPERATION, Object.keys(OPERATION).map((k) => [k] as const)),
  ...stringCases(OPERATION, ["operation_id"]), ...stringCases(OPERATION, ["command_key"]), ...stringCases(OPERATION, ["created_at"]), ...stringCases(OPERATION, ["updated_at"]),
  ...arrayCases(OPERATION, ["blockers"]), ...arrayCases(OPERATION, ["warnings"]),
  ...schemaVersionCases(OPERATION, ["schema_version"], COMMAND_OPERATION_SCHEMA, [COMMAND_PLAN_SCHEMA, RELAY_DECISION_SCHEMA, "execution.command-operation.v2"]),
  ...pollutionCases(OPERATION, [[]]),
];
const DENY_NEG: Case[] = [
  ...enumsOf(DENIED, ["decision"], ["DENIED"]),
  ...enumsOf(DENIED, ["reason"], ["COMMAND_RELAY_DISABLED"]),
  ...enumsOf(DENIED, ["retry_allowed"], [false]),
  ...enumsOf(DENIED, ["source_request_sent"], [false]),
  ...requiredCases(DENIED, Object.keys(DENIED).map((k) => [k] as const)),
  ...stringCases(DENIED, ["operation_id"]),
  ...schemaVersionCases(DENIED, ["schema_version"], RELAY_DECISION_SCHEMA, [COMMAND_PLAN_SCHEMA, COMMAND_OPERATION_SCHEMA, "execution.command-relay-decision.v2"]),
  ...pollutionCases(DENIED, [[]]),
];
const COLL_NEG: Case[] = [
  ...enumsOf(COLLECTION, ["family"], ["F0_BLOCKED_INTENTS_ONLY"]),
  ...enumsOf(COLLECTION, ["coverage"], ["CURRENT_ACTOR_EXACT_RESOURCE_ONLY"]),
  ...enumsOf(COLLECTION, ["resource", "kind"], [...F0_RESOURCE_KINDS]),
  ...enumsOf(COLLECTION, ["environment"], [...F0_ENVIRONMENTS]),
  ...requiredCases(COLLECTION, [...Object.keys(COLLECTION).map((k) => [k] as const), ["resource", "kind"], ["resource", "id"], ["page", "limit"], ["page", "returned_count"], ["page", "has_more"], ["page", "next_cursor"]]),
  ...integerCases(COLLECTION, ["page", "limit"]), ...integerCases(COLLECTION, ["page", "returned_count"]),
  ...stringCases(COLLECTION, ["resource", "id"]),
  ...arrayCases(COLLECTION, ["items"], { idKey: "operation_id" }),
  ...schemaVersionCases(COLLECTION, ["schema_version"], F0_COLLECTION_SCHEMA, [COMMAND_OPERATION_SCHEMA, "portal.execution.f0-command-collection.v2"]),
  ...pollutionCases(COLLECTION, [[], ["resource"], ["page"], ["items", 0]]),
];
const COST_PATHS = [["cost_impact", "state"], ["cost_impact", "reason"]] as const;
const PRIMITIVE_PATHS = ["id", "source_environment", "target_types", "runtime_active", "source_side_effect_requested"].map((k) => ["current_primitive", k] as const);
const PLAN_EC_NEG: Case[] = [
  ...enumsOf(PLAN_EC, ["current_primitive", "id"], ["live.emergency-close"]),
  ...enumsOf(PLAN_EC, ["current_primitive", "source_environment"], ["LIVE_FULL"]),
  ...enumsOf(PLAN_EC, ["current_primitive", "runtime_active"], [false]),
  ...enumsOf(PLAN_EC, ["current_primitive", "source_side_effect_requested"], [false]),
  ...enumsOf(PLAN_EC, ["cost_impact", "state"], ["NOT_PUBLISHED"]),
  ...enumsOf(PLAN_EC, ["cost_impact", "reason"], ["NO_COST_OR_IMPACT_SOURCE"]),
  ...requiredCases(PLAN_EC, [["cost_impact"], ["current_primitive"], ...COST_PATHS, ...PRIMITIVE_PATHS]),
  ...arrayCases(PLAN_EC, ["current_primitive", "target_types"]),
  ...pollutionCases(PLAN_EC, [[], ["current_primitive"], ["cost_impact"]]),
];
const APPLY_DETAIL_PATHS = ["schema_version", "operation_id", "decision", "reason", "retry_allowed", "source_request_sent", "request_key", "replayed"].map((k) => ["details", k] as const);
const APPLY_DENIED_NEG: Case[] = [
  ...enumsOf(APPLY_DENIED, ["error", "code"], ["COMMAND_RELAY_DISABLED"]),
  ...enumsOf(APPLY_DENIED, ["details", "schema_version"], [RELAY_DECISION_SCHEMA]),
  ...enumsOf(APPLY_DENIED, ["details", "decision"], ["DENIED"]),
  ...enumsOf(APPLY_DENIED, ["details", "reason"], ["COMMAND_RELAY_DISABLED"]),
  ...enumsOf(APPLY_DENIED, ["details", "retry_allowed"], [false]),
  ...enumsOf(APPLY_DENIED, ["details", "source_request_sent"], [false]),
  ...requiredCases(APPLY_DENIED, [["error"], ["request_id"], ["details"], ["error", "code"], ["error", "message"], ...APPLY_DETAIL_PATHS]),
  ...stringCases(APPLY_DENIED, ["error", "message"]), ...stringCases(APPLY_DENIED, ["request_id"]),
  ...stringCases(APPLY_DENIED, ["details", "operation_id"]), ...stringCases(APPLY_DENIED, ["details", "request_key"]),
  ...pollutionCases(APPLY_DENIED, [[], ["error"], ["details"]]),
];
const APPLY_CONFLICT_NEG: Case[] = [
  ...enumsOf(APPLY_CONFLICT, ["error", "code"], ["REQUEST_KEY_PAYLOAD_CONFLICT"]),
  ...enumsOf(APPLY_CONFLICT, ["details", "source_request_sent"], [false]),
  ...requiredCases(APPLY_CONFLICT, [["error"], ["request_id"], ["details"], ["error", "code"], ["error", "message"], ["details", "request_key"], ["details", "source_request_sent"]]),
  ...stringCases(APPLY_CONFLICT, ["error", "message"]), ...stringCases(APPLY_CONFLICT, ["request_id"]), ...stringCases(APPLY_CONFLICT, ["details", "request_key"]),
  ...pollutionCases(APPLY_CONFLICT, [[], ["error"], ["details"]]),
];
const LOOKUP_NEG: Case[] = [
  ...enumsOf(LOOKUP_FOUND, ["state"], [...F0_APPLY_ATTEMPT_STATES]),
  ...enumsOf(LOOKUP_FOUND, ["relay_decision", "decision"], ["DENIED"]),
  ...enumsOf(LOOKUP_FOUND, ["relay_decision", "reason"], ["COMMAND_RELAY_DISABLED"]),
  ...enumsOf(LOOKUP_FOUND, ["relay_decision", "retry_allowed"], [false]),
  ...enumsOf(LOOKUP_FOUND, ["relay_decision", "source_request_sent"], [false]),
  ...requiredCases(LOOKUP_FOUND, [...Object.keys(LOOKUP_FOUND).map((k) => [k] as const), ["relay_decision", "operation_id"], ["relay_decision", "retry_allowed"], ["relay_decision", "source_request_sent"]]),
  ...requiredCases(LOOKUP_NONE, Object.keys(LOOKUP_NONE).map((k) => [k] as const)),
  ...requiredCases(LOOKUP_CONFLICT, Object.keys(LOOKUP_CONFLICT).map((k) => [k] as const)),
  ...stringCases(LOOKUP_FOUND, ["operation_id"]), ...stringCases(LOOKUP_FOUND, ["request_key"]), ...stringCases(LOOKUP_FOUND, ["first_recorded_at"]),
  ...schemaVersionCases(LOOKUP_FOUND, ["schema_version"], F0_APPLY_ATTEMPT_SCHEMA, [COMMAND_PLAN_SCHEMA, RELAY_DECISION_SCHEMA, "portal.execution.f0-apply-attempt.v2"]),
  ...pollutionCases(LOOKUP_FOUND, [[], ["relay_decision"]]), ...pollutionCases(LOOKUP_NONE, [[]]),
];
const PREVIEW_NEG: Case[] = [
  ...enumsOf(PREVIEW_ALLOWED, ["approval_gate"], [...APPROVAL_GATES, null]),
  ...enumsOf(PREVIEW_ALLOWED, ["reason_code"], [...COMMAND_REASON_CODES, null]),
  ...enumsOf(PREVIEW_ALLOWED, ["business_applied"], [false]),
  ...enumsOf(PREVIEW_ALLOWED, ["reserved"], [false]),
  ...enumsOf(PREVIEW_ALLOWED, ["cost_impact", "state"], ["NOT_PUBLISHED"]),
  ...enumsOf(PREVIEW_ALLOWED, ["cost_impact", "reason"], ["NO_COST_OR_IMPACT_SOURCE"]),
  ...requiredCases(PREVIEW_ALLOWED, [["cost_impact", "state"], ["cost_impact", "reason"]]),
  ...pollutionCases(PREVIEW_ALLOWED, [["cost_impact"]]),
  ...requiredCases(PREVIEW_ALLOWED, Object.keys(PREVIEW_ALLOWED).map((k) => [k] as const)),
  ...integerCases(PREVIEW_ALLOWED, ["expires_at_ms"]).filter((c) => getPath(c.value, ["expires_at_ms"]) !== null),
  ...stringCases(PREVIEW_ALLOWED, ["preview_digest"]).filter((c) => getPath(c.value, ["preview_digest"]) !== null),
  ...stringCases(PREVIEW_ALLOWED, ["profile_ref"]).filter((c) => getPath(c.value, ["profile_ref"]) !== null),
  ...schemaVersionCases(PREVIEW_ALLOWED, ["schema_version"], COMMAND_PREVIEW_SCHEMA, [COMMAND_PLAN_SCHEMA, "portal.execution.command-preview.v2"]),
  ...pollutionCases(PREVIEW_ALLOWED, [[]]),
];
const PROBLEM_NEG: Case[] = [
  ...requiredCases(PROBLEM, [["error"], ["request_id"], ["error", "code"], ["error", "message"]]),
  ...stringCases(PROBLEM, ["error", "code"]), ...stringCases(PROBLEM, ["error", "message"]), ...stringCases(PROBLEM, ["request_id"]),
  ...enumsOf(PROBLEM, ["safe_next_action"], [...SAFE_NEXT_ACTIONS]),
  ...pollutionCases(PROBLEM, [[], ["error"]]),
];

function runNegatives(label: string, version: string | null, cases: Case[], read: (v: unknown) => unknown, violations: (v: unknown) => string[], min: number) {
  describe(`L3 · negative · ${label}`, () => {
    it("reports the case counts", () => {
      const by = new Map<string, number>();
      for (const c of cases) by.set(c.category, (by.get(c.category) ?? 0) + 1);
      console.info(`commandOperation L3 ${label}: ${cases.length} cases (${[...by.entries()].map(([k, v]) => `${k} ${v}`).join(", ")})`);
      expect(cases.length).toBeGreaterThan(min);
    });

    it.each(cases.map((c) => [c.name, c] as const))("%s", (_name, c) => {
      expect(() => read(c.value)).not.toThrow();
      const answer = read(c.value) as { kind: string } | null;
      expect(leaked(answer, c.probe)).toBe(false);
      expect(prototypeIsClean()).toBe(true);
      const accepted = answer !== null && answer.kind !== "unsupported_shape";
      if (version !== null) {
        // The only non-null refusal is the typed unsupported_shape, for a body that is not this schema_version.
        if (answer !== null && !accepted) expect(getPath(c.value, ["schema_version"])).not.toBe(version);
        if (accepted) expect(getPath(c.value, ["schema_version"])).toBe(version);
      }
      if (accepted && c.category !== "prototype-pollution") expect(violations(c.value), `accepted though schema-invalid: ${c.name}`).toEqual([]);
    });

    it("an unknown word is never a state: no enum case yields a read", () => {
      for (const c of cases.filter((x) => x.category === "unknown-enum")) {
        const answer = read(c.value) as { kind: string } | null;
        expect(answer === null || answer.kind === "unsupported_shape", c.name).toBe(true);
      }
    });

    it("prints what the reader refuses that the schema accepts (the reader is stricter on purpose: control and bidi characters, offsets, cross-field rules)", () => {
      let stricter = 0;
      let looser = 0;
      for (const c of cases) {
        if (c.category === "prototype-pollution") continue;
        const answer = read(c.value) as { kind: string } | null;
        const accepted = answer !== null && answer.kind !== "unsupported_shape";
        const valid = violations(c.value).length === 0;
        if (accepted && !valid) looser += 1;
        if (!accepted && valid && !(answer !== null && answer.kind === "unsupported_shape")) stricter += 1;
      }
      console.info(`commandOperation L3 ${label} gap: reader accepts ${looser} schema-invalid payloads; refuses ${stricter} schema-valid ones`);
      expect(looser).toBe(0);
    });
  });
}

runNegatives("plan", COMMAND_PLAN_SCHEMA, PLAN_NEG, readCommandPlanV1, planViolations, 100);
runNegatives("operation (base)", COMMAND_OPERATION_SCHEMA, OP_NEG, readCommandOperationV1, opViolations, 80);
runNegatives("operation (F0)", COMMAND_OPERATION_SCHEMA, OP_NEG, readF0BlockedOperationV1, f0Violations, 80);
runNegatives("relay decision", RELAY_DECISION_SCHEMA, DENY_NEG, readRelayDecisionV1, denyViolations, 40);
runNegatives("F0 collection", F0_COLLECTION_SCHEMA, COLL_NEG, readF0CommandCollectionV1, collectionViolations, 60);
runNegatives("plan (emergency close, BE-P13)", COMMAND_PLAN_SCHEMA, PLAN_EC_NEG, readCommandPlanV1, planViolations, 60);
runNegatives("F0 apply denied (BE-P13)", null, APPLY_DENIED_NEG, readF0ApplyDeniedV1, deniedApplyViolations, 80);
runNegatives("F0 apply key conflict (BE-P13)", null, APPLY_CONFLICT_NEG, readF0ApplyKeyConflictV1, conflictApplyViolations, 50);
runNegatives("F0 apply attempt lookup (BE-P13)", F0_APPLY_ATTEMPT_SCHEMA, LOOKUP_NEG, readF0ApplyAttemptLookupV1, lookupViolations, 100);
runNegatives("preview", COMMAND_PREVIEW_SCHEMA, PREVIEW_NEG, readCommandPreviewV1, previewViolations, 60);
runNegatives("problem", null, PROBLEM_NEG, readCommandProblemV1, problemViolations, 30);

describe("L3 · bad roots", () => {
  const readers: [string, (v: unknown) => unknown][] = [
    ["plan", readCommandPlanV1], ["operation", readCommandOperationV1], ["f0 operation", readF0BlockedOperationV1], ["relay decision", readRelayDecisionV1],
    ["collection", readF0CommandCollectionV1], ["preview", readCommandPreviewV1], ["problem", readCommandProblemV1],
    ["apply denied", readF0ApplyDeniedV1], ["apply key conflict", readF0ApplyKeyConflictV1], ["apply answer", readF0ApplyAnswerV1], ["apply lookup", readF0ApplyAttemptLookupV1],
  ];
  it.each(rootCases().flatMap((c) => readers.map(([name, read]) => [`${name} <- ${c.name}`, read, c.value] as const)))("%s", (_label, read, value) => {
    expect(() => read(value)).not.toThrow();
    const answer = read(value) as { kind?: string } | null;
    expect(answer === null || answer.kind === "unsupported_shape").toBe(true);
  });
});

/* ═════════════ mutation control: the "never looser than the schema" counter must be able to bite ═════════════ */
describe("mutation control · the looser-than-schema counter is not vacuous", () => {
  /** Deliberately loose stand-ins for the BE-P13 readers: they check the code and the shape of the key, and nothing else. */
  const looseDenied = (v: unknown) => ((v as Draft)?.error?.code === "COMMAND_RELAY_DISABLED" && typeof (v as Draft)?.details === "object" ? {} : null);
  const looseLookup = (v: unknown) => ((v as Draft)?.schema_version === F0_APPLY_ATTEMPT_SCHEMA ? {} : null);
  const looserThanSchema = (read: (v: unknown) => unknown, cases: Case[], violations: (v: unknown) => string[]) =>
    cases.filter((c) => {
      const answer = read(c.value) as { kind?: string } | null;
      return c.category !== "prototype-pollution" && answer !== null && answer.kind !== "unsupported_shape" && violations(c.value).length > 0;
    }).length;

  it("a loose apply-denied reader accepts schema-invalid bodies that the real reader refuses (counter > 0 for the stand-in, 0 for the reader)", () => {
    expect(looserThanSchema(looseDenied, APPLY_DENIED_NEG, deniedApplyViolations)).toBeGreaterThan(20);
    expect(looserThanSchema(readF0ApplyDeniedV1, APPLY_DENIED_NEG, deniedApplyViolations)).toBe(0);
  });
  it("a loose lookup reader accepts schema-invalid bodies that the real reader refuses (counter > 0 for the stand-in, 0 for the reader)", () => {
    expect(looserThanSchema(looseLookup, LOOKUP_NEG, lookupViolations)).toBeGreaterThan(20);
    expect(looserThanSchema(readF0ApplyAttemptLookupV1, LOOKUP_NEG, lookupViolations)).toBe(0);
  });
});
