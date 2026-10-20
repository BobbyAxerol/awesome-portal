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
  readCommandProblemV1,
  readF0BlockedOperationV1,
  readF0CommandCollectionV1,
  readRelayDecisionV1,
} from "./commandOperation";

const plan = (): Draft => loadCanonical("execution-command-plan");
const operation = (): Draft => loadCanonical("execution-command-operation");
const denied = (): Draft => loadCanonical("execution-command-relay-denied");

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
