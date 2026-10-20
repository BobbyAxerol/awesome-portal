/**
 * The story's bodies are what they say they are (UXM-09, fixture lane).
 *
 * PUBLISHED copies equal the canonical files on disk, byte for byte after parsing, so a change to a published fixture fails here. SYNTHETIC
 * bodies pass the published schema through the testkit checker and read through the strict readers, so the fake can never script a state the
 * readers refuse. Every scenario's script is answered, and no capital status claims to be a product receipt.
 */
import { describe, expect, it } from "vitest";

import { readCommandStatusV1 } from "../../readers/commandCurrency";
import {
  readCommandOperationV1,
  readCommandPlanV1,
  readCommandPreviewV1,
  readCommandProblemV1,
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
  problemBody,
  rejectedBusinessStatus,
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
