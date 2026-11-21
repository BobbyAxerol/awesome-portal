/**
 * Named behaviours of `commandOperation.ts`, one claim each. The published fixtures are loaded from disk (L0), never rebuilt by hand;
 * the generated matrices and negatives live in `commandOperation.conformance.test.ts`.
 */
import { describe, expect, it } from "vitest";

import { loadCanonical } from "../testkit/loadCanonical";
import type { Draft } from "../testkit/matrix";
import {
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

const plan = (): Draft => loadCanonical("execution-command-plan");
const operation = (): Draft => loadCanonical("execution-command-operation");
const denied = (): Draft => loadCanonical("execution-command-relay-denied");
const emergencyPlan = (): Draft => loadCanonical("execution-command-plan.emergency-close");
const applyDenied = (): Draft => loadCanonical("execution-command-apply-denied");
const applyReplayed = (): Draft => loadCanonical("execution-command-apply-denied.replayed");
const applyConflict = (): Draft => loadCanonical("execution-command-apply-key-conflict");
const lookupFound = (): Draft => loadCanonical("execution-command-apply-attempt.found");
const lookupNone = (): Draft => loadCanonical("execution-command-apply-attempt.none");
const previewBlocked = (): Draft => loadCanonical<Draft>("execution-trusted-commands.synthetic").preview_blocked;

describe("fail closed: an unreadable danger flag is never the reassuring answer", () => {
  it("a plan whose source_side_effect_requested is missing, null or the string 'false' is not read (nothing is assumed to be untouched)", () => {
    for (const value of [undefined, null, "false", 0, "no"]) {
      const body = plan();
      if (value === undefined) delete body.source_side_effect_requested;
      else body.source_side_effect_requested = value;
      expect(readCommandPlanV1(body)).toBeNull();
    }
  });

  it("a denial whose source_request_sent is not exactly false is not read: it is never 'nothing reached the Trading System'", () => {
    for (const value of [undefined, null, "false", 0, true]) {
      const body = denied();
      if (value === undefined) delete body.source_request_sent;
      else body.source_request_sent = value;
      expect(readRelayDecisionV1(body)).toBeNull();
    }
  });

  it("a denial that says a retry is allowed is not read: the F0 relay never invites one", () => {
    expect(readRelayDecisionV1({ ...denied(), retry_allowed: true })).toBeNull();
    expect(readRelayDecisionV1({ ...denied(), retry_allowed: "false" })).toBeNull();
  });

  it("a plan with an apply token is not an F0 plan: there is no token to apply with", () => {
    expect(readCommandPlanV1({ ...plan(), apply_token: "tok_1" })).toBeNull();
    expect(readCommandPlanV1({ ...plan(), status: "READY", apply_token: "tok_1", blockers: [] })).toBeNull();
  });

  it("an operation with a relay receipt is not an F0 operation: nothing was relayed", () => {
    expect(readCommandOperationV1({ ...operation(), relay_receipt: "rcpt_1" })).toBeNull();
  });
});

describe("text and instants", () => {
  it.each([
    ["a bidi override in a blocker", (b: Draft) => { b.blockers = ["COMMAND_RELAY_DISABLED‮"]; }],
    ["a zero-width space in a blocker", (b: Draft) => { b.blockers = ["COMMAND​_RELAY_DISABLED"]; }],
    ["a NUL in the command key", (b: Draft) => { b.command_key = "account/\u0000sync"; }],
    ["a lone surrogate in a warning", (b: Draft) => { b.warnings = ["\ud800"]; }],
    ["an operation id with a space", (b: Draft) => { b.operation_id = "op 1"; }],
    ["a non-UTC offset on expiry", (b: Draft) => { b.expires_at = "2026-08-22T19:05:00+07:00"; }],
    ["a day that does not exist", (b: Draft) => { b.expires_at = "2026-02-30T12:05:00Z"; }],
    ["a payload hash in upper case", (b: Draft) => { b.payload_hash = `sha256:${"A".repeat(64)}`; }],
  ])("%s voids the plan", (_label, edit) => {
    const body = plan();
    edit(body);
    expect(readCommandPlanV1(body)).toBeNull();
  });

  it("an update before its creation voids an operation (the schema cannot say it; the runtime does)", () => {
    expect(readCommandOperationV1({ ...operation(), created_at: "2026-08-22T12:00:05Z", updated_at: "2026-08-22T12:00:00Z" })).toBeNull();
  });

  it("an unknown key voids every body (closed objects)", () => {
    for (const [read, body] of [[readCommandPlanV1, plan()], [readCommandOperationV1, operation()], [readRelayDecisionV1, denied()]] as const) {
      expect(read({ ...body, extra: 1 })).toBeNull();
    }
  });
});

describe("F0 refinements", () => {
  it("the F0 operation read refuses a key outside the 64 catalogue keys, which the base read allows", () => {
    const body = { ...operation(), command_key: "zzz/made-up" };
    expect(readCommandOperationV1(body)).toMatchObject({ kind: "command_operation" });
    expect(readF0BlockedOperationV1(body)).toBeNull();
  });

  it("a collection page that says more without a cursor, or a cursor without more, is not read", () => {
    const file = loadCanonical<{ response: Draft }>("execution-f0-command-collection.synthetic");
    const more = structuredClone(file.response);
    more.page.has_more = true;
    expect(readF0CommandCollectionV1(more)).toBeNull();
    const cursor = structuredClone(file.response);
    cursor.page.next_cursor = "c1";
    expect(readF0CommandCollectionV1(cursor)).toBeNull();
  });
});

describe("problem", () => {
  it("an envelope with an extra key, or a code that is not an upper-case word, is not read", () => {
    const ok = { error: { code: "COMMAND_STATUS_UNVERIFIED", message: "x" }, request_id: "req_1" };
    expect(readCommandProblemV1(ok)).toMatchObject({ code: "COMMAND_STATUS_UNVERIFIED", requestId: "req_1", publicCopyKey: null, safeNextAction: null });
    expect(readCommandProblemV1({ ...ok, extra: 1 })).toBeNull();
    expect(readCommandProblemV1({ ...ok, error: { code: "status unverified", message: "x" } })).toBeNull();
  });
});

describe("BE-P13: cost and impact are a typed absence, never a figure", () => {
  it("a plan and a preview without cost_impact are not read (the key is required, not defaulted)", () => {
    const body = plan();
    delete body.cost_impact;
    expect(readCommandPlanV1(body)).toBeNull();
    const preview = previewBlocked();
    delete preview.cost_impact;
    expect(readCommandPreviewV1(preview)).toBeNull();
  });

  it("a cost_impact that carries anything but the one absence is refused, so a figure can never reach a screen through it", () => {
    for (const value of [{ state: "NOT_PUBLISHED", reason: "NO_COST_OR_IMPACT_SOURCE", amount: "1.5" }, { state: "PUBLISHED", reason: "NO_COST_OR_IMPACT_SOURCE" }, { state: "NOT_PUBLISHED", reason: "OTHER" }, "1.5", 1.5, null, []]) {
      expect(readCommandPlanV1({ ...plan(), cost_impact: value })).toBeNull();
      expect(readCommandPreviewV1({ ...previewBlocked(), cost_impact: value })).toBeNull();
    }
  });
});

describe("BE-P13: current_primitive is described, never activated", () => {
  it("the emergency-close plan reads with its dark primitive; the same primitive beside another command key is refused (primitive-identity)", () => {
    expect(readCommandPlanV1(emergencyPlan())).toMatchObject({ kind: "command_plan", plan: { currentPrimitive: { id: "live.emergency-close", runtimeActive: false } } });
    expect(readCommandPlanV1({ ...emergencyPlan(), command_key: "account/sync" })).toBeNull();
  });

  it("a primitive that says it is active, or that a source side effect was requested, is not read: it is never an activation", () => {
    for (const edit of [{ runtime_active: true }, { source_side_effect_requested: true }, { runtime_active: "false" }, { source_side_effect_requested: null }]) {
      const body = emergencyPlan();
      body.current_primitive = { ...body.current_primitive, ...edit };
      expect(readCommandPlanV1(body)).toBeNull();
    }
  });
});

describe("BE-P13: the F0 apply 409 is read from its wire envelope", () => {
  it("the legacy top-level source_request_sent is not the wire: the real body has none there, and a body that has one is refused", () => {
    expect(applyDenied().source_request_sent).toBeUndefined();
    expect(readF0ApplyDeniedV1(applyDenied())).toMatchObject({ sourceRequestSent: false, retryAllowed: false, replayed: false });
    expect(readF0ApplyDeniedV1({ ...applyDenied(), source_request_sent: false })).toBeNull();
  });

  it("a denial whose details say a request was sent, or a retry is allowed, is not read", () => {
    for (const edit of [{ source_request_sent: true }, { source_request_sent: "false" }, { source_request_sent: undefined }, { retry_allowed: true }, { retry_allowed: "false" }]) {
      const body = applyDenied();
      body.details = { ...body.details, ...edit };
      if (edit.source_request_sent === undefined && "source_request_sent" in edit) delete body.details.source_request_sent;
      expect(readF0ApplyDeniedV1(body)).toBeNull();
      expect(readF0ApplyAnswerV1(body)).toBeNull();
    }
  });

  it("replayed is a read boolean: the first answer is false, the stored repeat is true, anything else voids the body", () => {
    expect(readF0ApplyDeniedV1(applyDenied())!.replayed).toBe(false);
    expect(readF0ApplyDeniedV1(applyReplayed())!.replayed).toBe(true);
    for (const value of [undefined, null, "true", 1]) {
      const body = applyDenied();
      if (value === undefined) delete body.details.replayed;
      else body.details.replayed = value;
      expect(readF0ApplyDeniedV1(body)).toBeNull();
    }
  });

  it("the server's free text is validated and then dropped, in both 409 bodies", () => {
    for (const [body, read] of [[applyDenied(), readF0ApplyDeniedV1], [applyConflict(), readF0ApplyKeyConflictV1]] as const) {
      body.error.message = "PROBE_FREE_TEXT_FROM_SERVER";
      const answer = read(body);
      expect(answer).not.toBeNull();
      expect(JSON.stringify(answer)).not.toContain("PROBE_FREE_TEXT_FROM_SERVER");
      body.error.message = "bidi \u202e override";
      expect(read(body)).toBeNull();
    }
  });

  it("a key conflict names no other operation and says nothing was sent; one that carries an operation id is refused", () => {
    expect(readF0ApplyKeyConflictV1(applyConflict())).toEqual({ code: "REQUEST_KEY_PAYLOAD_CONFLICT", requestId: "req_apply_conflict_0003", requestKey: "ui:apply:0001", sourceRequestSent: false });
    const named = applyConflict();
    named.details.operation_id = "op_OTHER";
    expect(readF0ApplyKeyConflictV1(named)).toBeNull();
    const sent = applyConflict();
    sent.details.source_request_sent = true;
    expect(readF0ApplyKeyConflictV1(sent)).toBeNull();
  });
});

describe("BE-P13: the apply-attempt lookup", () => {
  it("FOUND carries the decision a replay returns, and that decision must name the operation that was looked up", () => {
    expect(readF0ApplyAttemptLookupV1(lookupFound())).toMatchObject({ kind: "f0_apply_attempt", attempt: { state: "FOUND", relayDecision: { decision: "DENIED", sourceRequestSent: false } } });
    const other = lookupFound();
    other.relay_decision.operation_id = "op_OTHER";
    expect(readF0ApplyAttemptLookupV1(other)).toBeNull();
  });

  it("NONE and CONFLICT carry no decision and no instant; one that does is refused (CONFLICT never names the other operation)", () => {
    const none = lookupNone();
    expect(readF0ApplyAttemptLookupV1(none)).toMatchObject({ kind: "f0_apply_attempt", attempt: { state: "NONE" } });
    expect(readF0ApplyAttemptLookupV1({ ...none, first_recorded_at: "2026-08-22T12:00:05Z" })).toBeNull();
    expect(readF0ApplyAttemptLookupV1({ ...none, state: "CONFLICT", relay_decision: lookupFound().relay_decision })).toBeNull();
    expect(readF0ApplyAttemptLookupV1({ ...none, other_operation_id: "op_OTHER" })).toBeNull();
  });

  it("a FOUND body without its instant, or with an offset instant, is not read", () => {
    const missing = lookupFound();
    missing.first_recorded_at = null;
    expect(readF0ApplyAttemptLookupV1(missing)).toBeNull();
    expect(readF0ApplyAttemptLookupV1({ ...lookupFound(), first_recorded_at: "2026-08-22T19:00:05+07:00" })).toBeNull();
  });

  it("another schema_version is the typed unsupported_shape, not a lookup", () => {
    expect(readF0ApplyAttemptLookupV1({ ...lookupNone(), schema_version: "portal.execution.f0-apply-attempt.v2" })).toEqual({ kind: "unsupported_shape", schemaVersion: "portal.execution.f0-apply-attempt.v2" });
  });
});
