/**
 * The story's bodies are what they say they are (UXM-09, fixture lane).
 *
 * PUBLISHED copies equal the canonical files on disk, byte for byte after parsing, so a change to a published fixture fails here. SYNTHETIC
 * bodies pass the published schema through the testkit checker and read through the strict readers, so the fake can never script a state the
 * readers refuse. Every scenario's script is answered, and no capital status claims to be a product receipt.
 */
import { describe, expect, it } from "vitest";

import { readCommandStatusV1, readCommandSubmitResultV1 } from "../../readers/commandCurrency";
import {
  readCommandOperationV1,
  readCommandPlanV1,
  readCommandPreviewV1,
  readCommandProblemV1,
  readF0ApplyAnswerV1,
  readF0ApplyAttemptLookupV1,
  readRelayDecisionV1,
} from "../../readers/commandOperation";
import { loadCanonical } from "../../testkit/loadCanonical";
import { validateAgainst } from "../../testkit/schema";
import { createFakeCommandPort } from "./fakePort";
import {
  COMMAND_ID_APPLIED,
  COMMAND_ID_DELIVERY_UNKNOWN,
  COMMAND_ID_LANDED,
  COMMAND_ID_REJECTED,
  F0_APPLY_CONFLICT_BODY,
  F0_APPLY_DENIED_BODY,
  F0_APPLY_REPLAYED_BODY,
  F0_ATTEMPT_CONFLICT_BODY,
  F0_ATTEMPT_FOUND_BODY,
  F0_ATTEMPT_NONE_BODY,
  F0_DENIED_BODY,
  F0_OPERATION_BODY,
  F0_PLAN_BODY,
  SCENARIOS,
  SCENARIO_IDS,
  STORY_NOW_MS,
  ackOnlyStatus,
  appliedLaggingStatus,
  capitalPreviewBody,
  deliveryUnknownSettledStatus,
  deliveryUnknownStatus,
  f0ApplyAnswer,
  problemBody,
  rejectedBusinessStatus,
  submitResultBody,
} from "./storyData";

const OPS = "execution-operations.v1";
const TRUSTED = "../openapi/execution-trusted-commands.openapi.json";

describe("PUBLISHED: the copies equal the canonical files", () => {
  it("the F0 plan, operation and denial", () => {
    expect(F0_PLAN_BODY).toEqual(loadCanonical("execution-command-plan"));
    expect(F0_OPERATION_BODY).toEqual(loadCanonical("execution-command-operation"));
    expect(F0_DENIED_BODY).toEqual(loadCanonical("execution-command-relay-denied"));
  });

  it("they pass their schemas and read", () => {
    expect(validateAgainst(OPS, "/$defs/ExecutionCommandPlan", F0_PLAN_BODY)).toEqual([]);
    expect(validateAgainst(OPS, "/$defs/F0BlockedOperationRead", F0_OPERATION_BODY)).toEqual([]);
    expect(validateAgainst(OPS, "/$defs/RelayDenied", F0_DENIED_BODY)).toEqual([]);
    expect(readCommandPlanV1(F0_PLAN_BODY)?.kind).toBe("command_plan");
    expect(readCommandOperationV1(F0_OPERATION_BODY)?.kind).toBe("command_operation");
    expect(readRelayDecisionV1(F0_DENIED_BODY)?.kind).toBe("relay_decision");
  });

  it("the acknowledged status equals the published ack_only fixture", () => {
    expect(ackOnlyStatus()).toEqual(loadCanonical<Record<string, unknown>>("execution-trusted-commands.synthetic").ack_only);
  });

  it("BE-P13: the three F0 apply 409 bodies and the three apply-attempt lookups equal the canonical files, pass their schemas and read", () => {
    expect(F0_APPLY_DENIED_BODY).toEqual(loadCanonical("execution-command-apply-denied"));
    expect(F0_APPLY_REPLAYED_BODY).toEqual(loadCanonical("execution-command-apply-denied.replayed"));
    expect(F0_APPLY_CONFLICT_BODY).toEqual(loadCanonical("execution-command-apply-key-conflict"));
    expect(F0_ATTEMPT_NONE_BODY).toEqual(loadCanonical("execution-command-apply-attempt.none"));
    expect(F0_ATTEMPT_FOUND_BODY).toEqual(loadCanonical("execution-command-apply-attempt.found"));
    expect(F0_ATTEMPT_CONFLICT_BODY).toEqual(loadCanonical("execution-command-apply-attempt.conflict"));
    for (const body of [F0_APPLY_DENIED_BODY, F0_APPLY_REPLAYED_BODY]) expect(validateAgainst(OPS, "/$defs/F0ApplyDeniedProblem", body)).toEqual([]);
    expect(validateAgainst(OPS, "/$defs/F0ApplyKeyConflictProblem", F0_APPLY_CONFLICT_BODY)).toEqual([]);
    for (const body of [F0_ATTEMPT_NONE_BODY, F0_ATTEMPT_FOUND_BODY, F0_ATTEMPT_CONFLICT_BODY]) {
      expect(validateAgainst(OPS, "/$defs/F0ApplyAttemptLookup", body)).toEqual([]);
      expect(readF0ApplyAttemptLookupV1(body)?.kind).toBe("f0_apply_attempt");
    }
    expect(readF0ApplyAnswerV1(F0_APPLY_DENIED_BODY)).toMatchObject({ kind: "f0_apply_denied", denial: { replayed: false } });
    expect(readF0ApplyAnswerV1(F0_APPLY_REPLAYED_BODY)).toMatchObject({ kind: "f0_apply_denied", denial: { replayed: true } });
    expect(readF0ApplyAnswerV1(F0_APPLY_CONFLICT_BODY)).toMatchObject({ kind: "f0_apply_key_conflict" });
  });

  it("an apply answer for a send carries that send's request key and nothing else changes", () => {
    const answer = f0ApplyAnswer(F0_APPLY_DENIED_BODY, "command_apply:abc-123");
    expect(validateAgainst(OPS, "/$defs/F0ApplyDeniedProblem", answer)).toEqual([]);
    expect(readF0ApplyAnswerV1(answer)).toMatchObject({ denial: { requestKey: "command_apply:abc-123", replayed: false } });
    expect({ ...answer, details: { ...(answer.details as object), request_key: "ui:apply:0001" } }).toEqual(F0_APPLY_DENIED_BODY);
  });
});

describe("SYNTHETIC (TEST_ONLY): schema-valid, readable, and never a product receipt", () => {
  const statuses: [string, Record<string, unknown>][] = [
    ["acknowledged", ackOnlyStatus()],
    ["applied, lagging", appliedLaggingStatus()],
    ["rejected by the source", rejectedBusinessStatus()],
    ["delivery unknown", deliveryUnknownStatus()],
    ["delivery settled", deliveryUnknownSettledStatus()],
  ];

  it.each(statuses)("%s passes CommandStatus and reads, and says TEST_ONLY", (_label, body) => {
    expect(validateAgainst(TRUSTED, "/components/schemas/CommandStatus", body)).toEqual([]);
    const read = readCommandStatusV1(body);
    expect(read?.kind).toBe("command_status");
    expect(body.authority).toBe("TEST_ONLY");
  });

  it("the preview passes CommandPreview in its allowed, refused and expired forms, and reads", () => {
    for (const options of [{}, { allowed: false }, { expired: true }]) {
      const body = capitalPreviewBody({ now: STORY_NOW_MS, ...options });
      expect(validateAgainst(TRUSTED, "/components/schemas/CommandPreview", body)).toEqual([]);
      expect(readCommandPreviewV1(body)?.kind).toBe("command_preview");
    }
    expect(capitalPreviewBody({ now: STORY_NOW_MS, expired: true }).expires_at_ms).toBeLessThan(STORY_NOW_MS);
    expect(capitalPreviewBody({ now: STORY_NOW_MS }).expires_at_ms).toBeGreaterThan(STORY_NOW_MS);
  });

  it("BE-P13: every capital status carries the typed absences the server's projection derives, and a submit result adds only `replayed`", () => {
    for (const [, body] of statuses) {
      expect((body.source_rejection as { state: string }).state === "NOT_PUBLISHED").toBe((body.business as { state: string }).state === "REJECTED");
      expect((body.venue_fill as { state: string }).state === "NOT_APPLICABLE").toBe(body.venue === "NOT_APPLICABLE");
      expect((body.venue_fill as { quantities: unknown }).quantities).toBeNull();
      for (const replayed of [false, true]) {
        const result = submitResultBody(body, replayed);
        expect(validateAgainst(TRUSTED, "/components/schemas/CommandSubmitResult", result)).toEqual([]);
        expect(readCommandSubmitResultV1(result)).toMatchObject({ kind: "command_submit_result", result: { replayed } });
        // The status reader refuses the bit: a GET can never claim "this call did not send".
        expect(readCommandStatusV1(result)).toBeNull();
      }
    }
    const fixtures = loadCanonical<Record<string, unknown>>("execution-trusted-commands.synthetic");
    expect(submitResultBody(ackOnlyStatus(), false)).toEqual(fixtures.submit_first);
    expect(submitResultBody(ackOnlyStatus(), true)).toEqual(fixtures.submit_replayed);
  });

  it("the problem envelope passes CommandProblem and reads", () => {
    const body = problemBody("COMMAND_PREVIEW_CHANGED");
    expect(validateAgainst(TRUSTED, "/components/schemas/CommandProblem", body)).toEqual([]);
    expect(readCommandProblemV1(body)?.code).toBe("COMMAND_PREVIEW_CHANGED");
  });

  it("the command ids are distinct and well formed", () => {
    const ids = [COMMAND_ID_LANDED, COMMAND_ID_APPLIED, COMMAND_ID_DELIVERY_UNKNOWN, COMMAND_ID_REJECTED];
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^ecm_[a-f0-9]{32}$/);
  });
});

describe("the scenarios", () => {
  it("every id has one scenario, in one lane, with a summary", () => {
    expect(SCENARIOS.map((s) => s.id)).toEqual([...SCENARIO_IDS]);
    for (const s of SCENARIOS) {
      expect(s.summary.length, s.id).toBeGreaterThan(20);
      expect(s.id.startsWith("f0-"), s.id).toBe(s.lane === "F0");
    }
  });

  it("every scenario answers a plan and a send with a body, never nothing, except where silence is the scenario", async () => {
    for (const s of SCENARIOS) {
      const port = createFakeCommandPort({ scenario: s.id });
      const plan = await port.plan({ lane: s.lane, planKey: "command_plan:t" });
      expect(plan.kind, s.id).toBe("response");
      const send = await port.submit({ lane: s.lane, idempotencyKey: "command_apply:t", operationId: s.lane === "F0" ? F0_PLAN_BODY.operation_id : null, digest: "sha256:x", reason: "a reason" });
      if (s.id === "f0-timeout-then-denied" || s.id === "timeout-then-landed") expect(send.kind, s.id).toBe("no_response");
      else expect(send.kind, s.id).toBe("response");
    }
  });

  it("BE-P13: the F0 scenarios answer with the wire bodies: denied, denied-replayed and key conflict, each echoing the key that was sent", async () => {
    const send = (scenario: (typeof SCENARIO_IDS)[number]) =>
      createFakeCommandPort({ scenario }).submit({ lane: "F0", idempotencyKey: "command_apply:k1", operationId: F0_PLAN_BODY.operation_id, digest: "sha256:x", reason: "a reason" });
    const body = async (scenario: (typeof SCENARIO_IDS)[number]) => ((await send(scenario)) as { status: number; body: unknown });
    expect(await body("f0-denied")).toMatchObject({ status: 409 });
    expect(readF0ApplyAnswerV1((await body("f0-denied")).body)).toMatchObject({ kind: "f0_apply_denied", denial: { replayed: false, requestKey: "command_apply:k1" } });
    expect(readF0ApplyAnswerV1((await body("f0-denied-replayed")).body)).toMatchObject({ kind: "f0_apply_denied", denial: { replayed: true, requestKey: "command_apply:k1" } });
    expect(readF0ApplyAnswerV1((await body("f0-key-conflict")).body)).toMatchObject({ kind: "f0_apply_key_conflict", conflict: { requestKey: "command_apply:k1", sourceRequestSent: false } });
  });

  it("BE-P13: a retry after a lost answer finds the stored denial, replayed; the apply-attempt lookup agrees (NONE before, FOUND after; CONFLICT for a reused key)", async () => {
    const port = createFakeCommandPort({ scenario: "f0-timeout-then-denied" });
    const input = { lane: "F0" as const, idempotencyKey: "command_apply:k2", operationId: F0_PLAN_BODY.operation_id, digest: "sha256:x", reason: "a reason" };
    const lookup = async () => readF0ApplyAttemptLookupV1(((await port.lookup({ id: F0_PLAN_BODY.operation_id, requestKey: "command_apply:k2" })) as { body: unknown }).body);
    expect(await lookup()).toMatchObject({ attempt: { state: "NONE", requestKey: "command_apply:k2" } });
    expect((await port.submit(input)).kind).toBe("no_response");
    expect(await lookup()).toMatchObject({ attempt: { state: "FOUND", relayDecision: { operationId: F0_PLAN_BODY.operation_id, sourceRequestSent: false } } });
    const retry = (await port.submit(input)) as { body: unknown };
    expect(readF0ApplyAnswerV1(retry.body)).toMatchObject({ denial: { replayed: true } });
    const conflict = createFakeCommandPort({ scenario: "f0-key-conflict" });
    expect(readF0ApplyAttemptLookupV1(((await conflict.lookup({ id: F0_PLAN_BODY.operation_id, requestKey: "command_apply:k3" })) as { body: unknown }).body)).toMatchObject({ attempt: { state: "CONFLICT" } });
  });

  it("BE-P13: the capital submit answers a CommandSubmitResult, replayed false for the originating call and true for the same key again", async () => {
    const port = createFakeCommandPort({ scenario: "delivery-unknown" });
    const input = { lane: "CAPITAL" as const, idempotencyKey: "command_apply:k4", operationId: null, digest: "sha256:x", reason: "a reason" };
    const first = readCommandSubmitResultV1(((await port.submit(input)) as { body: unknown }).body);
    const again = readCommandSubmitResultV1(((await port.submit(input)) as { body: unknown }).body);
    expect(first).toMatchObject({ kind: "command_submit_result", result: { replayed: false } });
    expect(again).toMatchObject({ kind: "command_submit_result", result: { replayed: true } });
  });

  it("BE-P13: a same-key different-payload F0 send is the typed REQUEST_KEY_PAYLOAD_CONFLICT envelope, not the capital CommandProblem", async () => {
    const port = createFakeCommandPort({ scenario: "f0-denied" });
    const base = { lane: "F0" as const, idempotencyKey: "command_apply:k5", operationId: F0_PLAN_BODY.operation_id, digest: "sha256:x" };
    await port.submit({ ...base, reason: "first reason" });
    const conflict = (await port.submit({ ...base, reason: "another reason" })) as { status: number; body: unknown };
    expect(conflict.status).toBe(409);
    expect(readF0ApplyAnswerV1(conflict.body)).toMatchObject({ kind: "f0_apply_key_conflict" });
  });

  it("the fake port emulates an idempotency key: the same key with another payload is refused with the typed conflict", async () => {
    const port = createFakeCommandPort({ scenario: "accepted" });
    const base = { lane: "CAPITAL" as const, idempotencyKey: "command_apply:k", operationId: null, digest: "sha256:x" };
    expect((await port.submit({ ...base, reason: "first reason" })).kind).toBe("response");
    const conflict = await port.submit({ ...base, reason: "another reason" });
    expect(conflict).toMatchObject({ kind: "response", status: 409 });
    expect(readCommandProblemV1((conflict as { body: unknown }).body)?.code).toBe("COMMAND_IDEMPOTENCY_CONFLICT");
  });

  it("a lookup of an id the port never issued is a 404, the same as one the reader may not see", async () => {
    const port = createFakeCommandPort();
    expect(await port.lookup({ id: "ecm_00000000000000000000000000000fff" })).toMatchObject({ kind: "response", status: 404 });
  });
});
