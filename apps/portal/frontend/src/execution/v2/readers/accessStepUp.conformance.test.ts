/**
 * Reader conformance for `accessStepUp.ts` (FE-015/060, Rules 9.8.3).
 *
 * Oracle: `execution-access.openapi.json#/components/schemas/AccessStepUp` (response) and `#/AccessStepUpRequest` (request) through the
 * testkit checker. The contract package publishes no canonical fixture for this route, so the two canonical bodies are the ones
 * `packages/contracts/test/execution-access.spec.ts` itself validates (one per family), restated here and checked against the schema
 * first, so a drift fails here rather than on a screen. Lane: FIXTURE_LAB (synthetic TEST_ONLY bodies; not a runtime read).
 */
import { describe, expect, it } from "vitest";

import { schemaEnum } from "../testkit/loadCanonical";
import { enumCases, integerCases, leaked, pollutionCases, prototypeIsClean, requiredCases, rootCases, schemaVersionCases } from "../testkit/negative";
import { validateAgainst } from "../testkit/schema";
import { STEP_UP_FAMILIES } from "./accessSelfBatch";
import {
  ACCESS_STEP_UP_SCHEMA, accessStepUpAnswers, accessStepUpBody, readAccessStepUp, STEP_UP_REFUSAL_CODES,
} from "./accessStepUp";

const OA = "../openapi/execution-access.openapi.json";
const RESPONSE = "/components/schemas/AccessStepUp";
const REQUEST = "/components/schemas/AccessStepUpRequest";
const response = (value: unknown) => validateAgainst(OA, RESPONSE, value);
const request = (value: unknown) => validateAgainst(OA, REQUEST, value);

const CAPITAL = { schema_version: "portal.access-step-up.v1", state: "ACTIVE", family: "CAPITAL_COMMAND", expires_at_ms: 1792094400000 };
const ACCESS = { ...CAPITAL, family: "ACCESS_ADMIN" };

describe("L0 · the response, canonical", () => {
  it("both canonical bodies are schema-valid and read", () => {
    for (const body of [CAPITAL, ACCESS]) {
      expect(response(body)).toEqual([]);
      const read = readAccessStepUp(body);
      expect(read).toEqual({ kind: "step_up", stepUp: { state: "ACTIVE", family: body.family, expiresAtMs: 1792094400000 } });
    }
  });

  it("the family is REQUIRED: the old family-less body is refused by the schema and the reader", () => {
    const { family: _family, ...old } = CAPITAL;
    expect(response(old).length).toBeGreaterThan(0);
    expect(readAccessStepUp(old)).toBeNull();
  });

  it("the closed words are the schema's, word for word", () => {
    expect([...STEP_UP_FAMILIES].sort()).toEqual([...schemaEnum(OA, `${RESPONSE}/properties/family`)].sort());
    expect([...STEP_UP_FAMILIES].sort()).toEqual([...schemaEnum(OA, `${REQUEST}/properties/family`)].sort());
    expect(ACCESS_STEP_UP_SCHEMA).toBe("portal.access-step-up.v1");
  });

  it("a proof for the other family does not answer this request", () => {
    const capital = (readAccessStepUp(CAPITAL) as { stepUp: Parameters<typeof accessStepUpAnswers>[0] }).stepUp;
    expect(accessStepUpAnswers(capital, "CAPITAL_COMMAND")).toBe(true);
    expect(accessStepUpAnswers(capital, "ACCESS_ADMIN")).toBe(false);
  });

  it("another schema_version is typed unsupported_shape", () => {
    expect(readAccessStepUp({ ...CAPITAL, schema_version: "portal.access-step-up.v2" })).toEqual({ kind: "unsupported_shape", schemaVersion: "portal.access-step-up.v2" });
    expect(readAccessStepUp({ state: "ACTIVE" })).toEqual({ kind: "unsupported_shape", schemaVersion: null });
  });

  it("the three refusal words are the ones BE-P7 names", () => {
    expect([...STEP_UP_REFUSAL_CODES]).toEqual(["STEP_UP_REJECTED", "ACCESS_DENIED", "CURRENT_ACTOR_AUTHORITY_REQUIRED"]);
  });
});

describe("L1 · the request body", () => {
  it("always names the family, in a fixed key order, and the body is schema-valid", () => {
    for (const family of STEP_UP_FAMILIES) {
      const body = accessStepUpBody({ workspaceId: "ws_TEST_ONLY", family, password: "TEST_ONLY_pw" });
      expect(body).toBe(JSON.stringify({ workspace_id: "ws_TEST_ONLY", password: "TEST_ONLY_pw", family }));
      expect(request(JSON.parse(body!))).toEqual([]);
    }
  });

  it("is refused (nothing to send) when the strict schema would refuse it", () => {
    const ok = { workspaceId: "ws_TEST_ONLY", family: "CAPITAL_COMMAND", password: "x" } as const;
    expect(accessStepUpBody(ok)).not.toBeNull();
    expect(accessStepUpBody({ ...ok, password: "" })).toBeNull();
    expect(accessStepUpBody({ ...ok, password: "p".repeat(257) })).toBeNull();
    expect(accessStepUpBody({ ...ok, password: "p".repeat(256) })).not.toBeNull();
    expect(accessStepUpBody({ ...ok, workspaceId: "" })).toBeNull();
    expect(accessStepUpBody({ ...ok, workspaceId: "ws\u0000x" })).toBeNull();
    expect(accessStepUpBody({ ...ok, family: "OWNER" as never })).toBeNull();
    expect(accessStepUpBody({ ...ok, password: 12 as never })).toBeNull();
  });

  it("a password with spaces is sent as typed (never trimmed or normalised)", () => {
    const body = accessStepUpBody({ workspaceId: "ws", family: "ACCESS_ADMIN", password: "  a b  " });
    expect(JSON.parse(body!).password).toBe("  a b  ");
  });
});

/* ═════════════════ L3 · generated negatives ═════════════════ */
interface Case { name: string; category: string; value: unknown; probe: string | null }
const NEG: Case[] = [
  ...requiredCases(CAPITAL, ["schema_version", "state", "family", "expires_at_ms"].map((k) => [k] as const)),
  ...enumCases(CAPITAL, ["family"], ["ACCESS_ADMIN", "CAPITAL_COMMAND"]).filter((c) => !STEP_UP_FAMILIES.includes((c.value as { family: never }).family)),
  ...enumCases(CAPITAL, ["state"], ["ACTIVE"]).filter((c) => (c.value as { state: unknown }).state !== "ACTIVE"),
  ...integerCases(CAPITAL, ["expires_at_ms"]),
  ...schemaVersionCases(CAPITAL, ["schema_version"], ACCESS_STEP_UP_SCHEMA, ["portal.access-step-up.v2", "portal.self-context.v1"]),
  ...pollutionCases(CAPITAL, [[]]),
];

describe("L3 · negative · AccessStepUp", () => {
  it("has a substantial case count", () => {
    console.info(`accessStepUp L3: ${NEG.length} cases`);
    expect(NEG.length).toBeGreaterThan(30);
  });

  it.each(NEG.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    expect(() => readAccessStepUp(c.value)).not.toThrow();
    const answer = readAccessStepUp(c.value) as { kind: string } | null;
    expect(leaked(answer, c.probe)).toBe(false);
    expect(prototypeIsClean()).toBe(true);
    const accepted = answer !== null && answer.kind !== "unsupported_shape";
    if (accepted && c.category !== "prototype-pollution") expect(response(c.value), `accepted though schema-invalid: ${c.name}`).toEqual([]);
  });

  it("a key the schema does not name voids the read", () => {
    expect(readAccessStepUp({ ...CAPITAL, token: "TEST_ONLY" })).toBeNull();
  });

  it.each(rootCases().map((c) => [c.name, c] as const))("%s reads as nothing", (_name, c) => {
    expect(() => readAccessStepUp(c.value)).not.toThrow();
    const answer = readAccessStepUp(c.value);
    if (answer !== null) expect(answer).toEqual({ kind: "unsupported_shape", schemaVersion: null });
  });
});
