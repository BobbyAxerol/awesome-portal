/**
 * BR-EX-29 — typed conditions on the wire.
 *
 * The server's rules are read out of `TypedConditionSchema` in the Control API
 * rather than copied here, so a bound that moves upstream fails in this file
 * instead of reaching a reviewer as a 422 with a field path.
 *
 * The rules only matter because a flattened string made all of them impossible:
 * you cannot check prose for a missing owner, compare its expiry against its
 * deadline, or notice that two of them are the same condition twice.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { MAX_CONDITIONS, MIN_CONDITION_TEXT, toConditionWire } from "./conditionWire";
import { createHttpApi } from "./api/httpApi";
import type { DeliveryPolicy } from "./profile";
import type { TypedCondition } from "./components/conditions";

const OPS_CONTRACTS = join(
  __dirname,
  "../../../../../apps/control-api/src/operations/contracts.ts",
);
const GOV_CONTRACTS = join(
  __dirname,
  "../../../../../apps/control-api/src/governance/contracts.ts",
);

const OPEN: DeliveryPolicy = {
  policyRevision: 4,
  queryEnabled: true,
  projectionIngestionEnabled: true,
  sseEnabled: true,
  governanceWriteEnabled: true,
  paperCommandsEnabled: true,
  sandboxCommandsEnabled: true,
  liveProtectiveCommandsEnabled: true,
  liveRiskIncreasingCommandsEnabled: true,
};

const cond = (over: Partial<TypedCondition> = {}): TypedCondition => ({
  text: "cap capacity at 50,000.00 until evidence is extended",
  owner: "Lan",
  deadline: "2026-09-01",
  expiry: "2026-10-01",
  blocking: true,
  ...over,
});

describe("the bounds are the server's", () => {
  it("matches the text floor and the array cap the Control API declares", () => {
    const ops = readFileSync(OPS_CONTRACTS, "utf8");
    const gov = readFileSync(GOV_CONTRACTS, "utf8");
    const textMin = /text: z\.string\(\)\.trim\(\)\.min\((\d+)\)/.exec(ops)?.[1];
    const arrayMax = /conditions: z\.array\(TypedConditionSchema\)\.max\((\d+)\)/.exec(gov)?.[1];
    // Guards the extraction itself.
    expect(textMin, "text floor not found in operations/contracts.ts").toBeTruthy();
    expect(arrayMax, "array cap not found in governance/contracts.ts").toBeTruthy();
    expect(MIN_CONDITION_TEXT).toBe(Number(textMin));
    expect(MAX_CONDITIONS).toBe(Number(arrayMax));
  });

  it("confirms the server still requires a non-empty owner", () => {
    // If owner ever becomes nullable upstream, the refusal below is no longer
    // correct and this says so.
    expect(readFileSync(OPS_CONTRACTS, "utf8")).toMatch(
      /owner: z\.string\(\)\.trim\(\)\.min\(1\)/,
    );
  });
});

describe("converting to the wire", () => {
  it("uses the schema's spelling, not the screen's", () => {
    const out = toConditionWire([cond()]);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value[0]).toEqual({
        text: "cap capacity at 50,000.00 until evidence is extended",
        owner: "Lan",
        deadline: "2026-09-01",
        expires_at: "2026-10-01",
        blocking: true,
      });
      // `expiry` is the screen's word; the wire has none.
      expect(out.value[0]).not.toHaveProperty("expiry");
    }
  });

  it("refuses a condition nobody owes, and says which one", () => {
    const out = toConditionWire([cond(), cond({ owner: null })]);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.reason).toMatch(/Condition 2/);
      expect(out.reason).toMatch(/no owner/);
    }
  });

  it("refuses an expiry that falls before its deadline", () => {
    const out = toConditionWire([cond({ deadline: "2026-10-01", expiry: "2026-09-01" })]);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toMatch(/could never be met/);
  });

  it("refuses text under the floor", () => {
    const out = toConditionWire([cond({ text: "cap" })]);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toMatch(new RegExp(`${MIN_CONDITION_TEXT} characters`));
  });

  it("refuses duplicates rather than sending the same condition twice", () => {
    const out = toConditionWire([cond(), cond()]);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toMatch(/identical/);
  });

  it("refuses more than the cap, with the count", () => {
    const many = Array.from({ length: MAX_CONDITIONS + 1 }, (_, i) => cond({ text: `condition number ${i}` }));
    const out = toConditionWire(many);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toMatch(String(MAX_CONDITIONS + 1));
  });

  it("never drops a bad condition and sends the rest", () => {
    // A reviewer who attached four and had one silently discarded has approved
    // something they did not intend.
    const out = toConditionWire([cond(), cond({ owner: null, text: "second condition here" })]);
    expect(out.ok).toBe(false);
  });

  it("carries a null deadline and expiry through as nulls", () => {
    const out = toConditionWire([cond({ deadline: null, expiry: null })]);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.value[0]).toMatchObject({ deadline: null, expires_at: null });
  });
});

describe("the plan payload sends conditions[] and never the singular string", () => {
  function serving() {
    const bodies: string[] = [];
    vi.stubGlobal("fetch", async (_u: string, init: RequestInit) => {
      bodies.push(String(init.body));
      return new Response(JSON.stringify({ operation_id: "op_1", apply_token: "t" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("document", { cookie: "__Host-portal_csrf=tok" });
    return bodies;
  }

  it("sends the typed array for approve-with-condition", async () => {
    const bodies = serving();
    const result = await createHttpApi({ policy: OPEN }).planDecision({
      approvalId: "AP-201",
      workspaceId: "ws",
      decision: "APPROVE_WITH_CONDITION",
      reason: "approved with a capacity cap",
      conditions: [cond()],
      expectedApprovalVersion: 3,
      requestKey: "rk",
    });
    expect(result.ok).toBe(true);
    const payload = JSON.parse(bodies[0]).payload;
    expect(payload.conditions).toHaveLength(1);
    expect(payload.conditions[0].owner).toBe("Lan");
    // The deprecated alias is mutually exclusive with the array upstream, so
    // sending both would be a 422 on every conditioned approval.
    expect(payload).not.toHaveProperty("condition");
    vi.unstubAllGlobals();
  });

  it("refuses a conditioned approval with no conditions", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await createHttpApi({ policy: OPEN }).planDecision({
      approvalId: "AP-201",
      workspaceId: "ws",
      decision: "APPROVE_WITH_CONDITION",
      reason: "approved with a capacity cap",
      conditions: [],
      expectedApprovalVersion: 3,
      requestKey: "rk",
    });
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("refuses conditions on a decision that may not carry them", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    for (const decision of ["APPROVE", "DENY", "REJECT"] as const) {
      const result = await createHttpApi({ policy: OPEN }).planDecision({
        approvalId: "AP-201",
        workspaceId: "ws",
        decision,
        reason: "eight or more characters",
        conditions: [cond()],
        expectedApprovalVersion: 3,
        requestKey: "rk",
      });
      expect(result.ok, decision).toBe(false);
    }
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("surfaces the conversion failure rather than a field path", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await createHttpApi({ policy: OPEN }).planDecision({
      approvalId: "AP-201",
      workspaceId: "ws",
      decision: "APPROVE_WITH_CONDITION",
      reason: "approved with a capacity cap",
      conditions: [cond({ owner: null })],
      expectedApprovalVersion: 3,
      requestKey: "rk",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/no owner/);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
