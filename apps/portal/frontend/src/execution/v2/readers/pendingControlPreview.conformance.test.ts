/**
 * Reader conformance for `pendingControlPreview.ts` (RV-10, Rules 9.8.3).
 *
 * Oracle: `execution-pending-control.openapi.json#/components/schemas/PendingControlPreview` (and `PendingControlProblem`) read through
 * the testkit checker, and the canonical bodies `preview_allowed`, `preview_cancel`, `preview_blocked` of
 * `execution-pending-control.synthetic.valid.json`, digest-checked so a test cannot edit what it reads.
 *
 * L0  the fixtures are schema-valid, read, and are not changed by reading;
 * L1  what the schema cannot say but the server enforces: the amount partition and the settled shape of the predicted state;
 * L3  generated negatives: the reader is never looser than the schema, never throws, never leaks.
 * Lane: FIXTURE_LAB (synthetic TEST_ONLY bodies; nothing here is a runtime read).
 */
import { afterAll, describe, expect, it } from "vitest";

import { canonicalDigest, loadCanonical, schemaEnum } from "../testkit/loadCanonical";
import { getPath, type Draft } from "../testkit/matrix";
import {
  decimalCases, enumCases, integerCases, leaked, pollutionCases, prototypeIsClean, requiredCases, rootCases, schemaVersionCases, stringCases,
} from "../testkit/negative";
import { validateAgainst } from "../testkit/schema";
import { PENDING_OPERATIONS, PENDING_VERSION_KEYS } from "./commandCurrency";
import {
  MAX_PREVIEW_BLOCKERS, PENDING_CONTROL_PREVIEW_SCHEMA, PENDING_PROBLEM_CODES, PREDICTED_STATES, PREVIEW_REASON_CODES,
  pendingControlWords, previewAnswers, readPendingControlPreviewV1, readPendingControlProblemV1, type PendingControlPreview,
} from "./pendingControlPreview";

const FILE = "execution-pending-control.synthetic";
const digestBefore = canonicalDigest(FILE);
afterAll(() => {
  expect(canonicalDigest(FILE)).toBe(digestBefore);
});

const OA = "../openapi/execution-pending-control.openapi.json";
const PTR = "/components/schemas/PendingControlPreview";
const violations = (value: unknown) => validateAgainst(OA, PTR, value);
const clone = <T,>(value: T): T => structuredClone(value);
const file = loadCanonical<Record<string, Draft>>(FILE);
const ALLOWED: Draft = file.preview_allowed;
const CANCEL: Draft = file.preview_cancel;
const BLOCKED: Draft = file.preview_blocked;
const UNIT = "USDT";

function previewOf(raw: unknown, unit = UNIT): PendingControlPreview | null {
  const read = readPendingControlPreviewV1(raw, unit);
  return read !== null && read.kind === "pending_control_preview" ? read.preview : null;
}
const edit = (base: Draft, change: (b: Draft) => void): Draft => {
  const copy = clone(base);
  change(copy);
  return copy;
};

describe("L0 · canonical, verbatim", () => {
  it("the three preview bodies are schema-valid and read", () => {
    for (const [name, body] of Object.entries({ ALLOWED, CANCEL, BLOCKED })) {
      expect(violations(body), name).toEqual([]);
      expect(previewOf(body), name).not.toBeNull();
    }
  });

  it("ALLOWED: the digest, expiry and profile as published; amounts and counters exact", () => {
    const p = previewOf(ALLOWED)!;
    expect(p).toMatchObject({
      allowed: true, operation: "APPLY_PENDING", originalRecallId: "TEST_ONLY:original-recall", businessApplied: false, reserved: false,
      previewDigest: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", profileRef: "TEST_ONLY:pending-paper",
    });
    if (!p.allowed) throw new Error("unreachable");
    expect(p.prediction.state).toBe("WAITING_ENCUMBRANCE");
    expect(p.prediction.delta.fullText).toBe("25 USDT");
    expect(p.prediction.amounts.pending.fullText).toBe("75 USDT");
    expect(p.prediction.versions).toEqual({ budget: "9007199254740993", source: "11", parent: "12", book: "13", command: "14" });
    expect(p.prediction.blockers).toEqual(["TEST_ONLY:encumbrance-open"]);
  });

  it("BLOCKED: one typed reason and every other member null", () => {
    expect(previewOf(BLOCKED)).toEqual({
      allowed: false, operation: "APPLY_PENDING", originalRecallId: "TEST_ONLY:original-recall", reasonCode: "PENDING_CONTROL_NOT_QUALIFIED",
      businessApplied: false, reserved: false,
    });
  });

  it("CANCEL is read as its own operation", () => {
    expect(previewOf(CANCEL)).toMatchObject({ operation: "CANCEL_REMAINING" });
  });

  it("the closed words the reader holds are the schema's, word for word", () => {
    expect([...PENDING_OPERATIONS]).toEqual([...schemaEnum(OA, `${PTR}/properties/operation`)]);
    expect([...PREVIEW_REASON_CODES]).toEqual([...schemaEnum(OA, `${PTR}/properties/reason_code/anyOf/0`)]);
    expect([...PREDICTED_STATES]).toEqual([...schemaEnum(OA, "/components/schemas/PendingControlPrediction/properties/state")]);
    expect([...PENDING_PROBLEM_CODES]).toEqual([...schemaEnum(OA, "/components/schemas/PendingControlProblem/properties/error/properties/code")]);
    expect(PENDING_CONTROL_PREVIEW_SCHEMA).toBe("portal.execution.pending-recall-preview.v1");
    expect(MAX_PREVIEW_BLOCKERS).toBe(128);
  });

  it("a discovery or status body is another schema: typed unsupported_shape, never read as a preview", () => {
    expect(readPendingControlPreviewV1(file.statuses?.waiting ?? { schema_version: "portal.execution.pending-recall-status.v1" }, UNIT))
      .toEqual({ kind: "unsupported_shape", schemaVersion: "portal.execution.pending-recall-status.v1" });
  });
});

describe("L1 · what the schema cannot say and the server enforces", () => {
  it.each<[string, Draft, (b: Draft) => void]>([
    ["amounts that do not add up", ALLOWED, (b) => { b.prediction.amounts.pending = "76"; }],
    ["WAITING with nothing pending", ALLOWED, (b) => { b.prediction.amounts = { requested: "100", applied: "100", pending: "0", cancelled: "0", rejected: "0" }; }],
    ["APPLIED with a pending part", ALLOWED, (b) => { b.prediction.state = "APPLIED"; }],
    ["business_applied true", ALLOWED, (b) => { b.business_applied = true; }],
    ["reserved true", ALLOWED, (b) => { b.reserved = true; }],
    ["business_applied as text", ALLOWED, (b) => { b.business_applied = "false"; }],
    ["allowed without a digest", ALLOWED, (b) => { b.preview_digest = null; }],
    ["allowed carrying a reason", ALLOWED, (b) => { b.reason_code = "PENDING_CONTROL_UNAVAILABLE"; }],
    ["allowed without a prediction", ALLOWED, (b) => { b.prediction = null; }],
    ["a digest with upper-case hex", ALLOWED, (b) => { b.preview_digest = `sha256:${"B".repeat(64)}`; }],
    ["a digest of another algorithm", ALLOWED, (b) => { b.preview_digest = `md5:${"b".repeat(64)}`; }],
    ["not allowed without a reason", BLOCKED, (b) => { b.reason_code = null; }],
    ["not allowed carrying a digest", BLOCKED, (b) => { b.preview_digest = ALLOWED.preview_digest; }],
    ["not allowed carrying a prediction", BLOCKED, (b) => { b.prediction = clone(ALLOWED.prediction); }],
    ["129 blockers", ALLOWED, (b) => { b.prediction.blockers = Array.from({ length: 129 }, (_, n) => `TEST_ONLY:blocker-${n}`); }],
    ["a blocker with a control character", ALLOWED, (b) => { b.prediction.blockers = ["bad\u0007text"]; }],
    ["a counter above int64", ALLOWED, (b) => { b.prediction.versions.budget = "9223372036854775808"; }],
    ["a delta with an exponent", ALLOWED, (b) => { b.prediction.delta = "2.5e1"; }],
  ])("%s voids the read", (_name, base, change) => {
    expect(readPendingControlPreviewV1(edit(base, change), UNIT)).toBeNull();
  });

  it("amounts and delta stay exact strings above 2^53 and with their scale", () => {
    const big = edit(ALLOWED, (b) => {
      b.prediction.amounts = { requested: "9007199254740993.10", applied: "0", pending: "9007199254740993.10", cancelled: "0", rejected: "0" };
      b.prediction.delta = "0.10";
    });
    const p = previewOf(big)!;
    if (!p.allowed) throw new Error("unreachable");
    expect(p.prediction.amounts.pending.fullText).toBe("9007199254740993.10 USDT");
    expect(p.prediction.delta.fullText).toBe("0.10 USDT");
  });

  it("a read needs the unit of the recall: an empty unit voids it", () => {
    expect(readPendingControlPreviewV1(ALLOWED, "")).toBeNull();
  });

  it("a body answers only the question asked: another operation or recall is not an answer", () => {
    const p = previewOf(ALLOWED)!;
    expect(previewAnswers(p, { operation: "APPLY_PENDING", originalRecallId: "TEST_ONLY:original-recall" })).toBe(true);
    expect(previewAnswers(p, { operation: "CANCEL_REMAINING", originalRecallId: "TEST_ONLY:original-recall" })).toBe(false);
    expect(previewAnswers(p, { operation: "APPLY_PENDING", originalRecallId: "other" })).toBe(false);
  });
});

describe("L1 · the refusal envelope", () => {
  const body = (code: string, extra: Record<string, unknown> = {}) => ({ error: { code, message: "free text the Portal never shows" }, request_id: "req-1", ...extra });

  it("every code of the closed vocabulary reads, and the free text is dropped", () => {
    for (const code of PENDING_PROBLEM_CODES) {
      const read = readPendingControlProblemV1(body(code));
      expect(read, code).toEqual({ code, requestId: "req-1", safeNextAction: null });
      expect(JSON.stringify(read)).not.toContain("free text");
    }
  });

  it("the schema accepts what the reader accepts", () => {
    const problem = (value: unknown) => validateAgainst(OA, "/components/schemas/PendingControlProblem", value);
    expect(problem(body("ACCESS_DENIED", { safe_next_action: "REVIEW_BLOCKER", public_copy_key: "k" }))).toEqual([]);
    expect(readPendingControlProblemV1(body("ACCESS_DENIED", { safe_next_action: "REVIEW_BLOCKER", public_copy_key: "k" })))
      .toEqual({ code: "ACCESS_DENIED", requestId: "req-1", safeNextAction: "REVIEW_BLOCKER" });
  });

  it.each<[string, unknown]>([
    ["a code outside the vocabulary", body("SOMETHING_NEW")],
    ["a code as a number", { error: { code: 7, message: "m" }, request_id: "r" }],
    ["an unknown key", body("ACCESS_DENIED", { details: {} })],
    ["a safe_next_action outside the vocabulary", body("ACCESS_DENIED", { safe_next_action: "RETRY" })],
    ["no request id", { error: { code: "ACCESS_DENIED", message: "m" } }],
    ["no message", { error: { code: "ACCESS_DENIED" }, request_id: "r" }],
    ["an array", []],
    ["null", null],
  ])("%s voids the envelope", (_name, value) => {
    expect(readPendingControlProblemV1(value)).toBeNull();
  });

  it("every code has Portal words, and an unlisted code is the generic refusal, never the server's text", () => {
    for (const code of PENDING_PROBLEM_CODES) expect(pendingControlWords(code).length).toBeGreaterThan(10);
    expect(pendingControlWords("SOMETHING_NEW")).toBe("The Portal did not accept this request.");
  });
});

/* ═════════════════════ L3 · generated negatives ═════════════════════ */
interface Case { name: string; category: string; value: unknown; probe: string | null }
const TOP_PATHS = ["schema_version", "operation", "original_recall_id", "allowed", "reason_code", "preview_digest", "expires_at_ms", "profile_ref", "prediction", "business_applied", "reserved"];
const enumsOf = (base: Draft, path: readonly (string | number)[], valid: readonly unknown[]): Case[] =>
  enumCases(base, path, valid.map(String)).filter((c) => !valid.includes(getPath(c.value, path)));

const NEG: Case[] = [
  ...requiredCases(ALLOWED, TOP_PATHS.map((k) => [k] as const)),
  ...requiredCases(BLOCKED, TOP_PATHS.map((k) => [k] as const)),
  ...requiredCases(ALLOWED, ["state", "amounts", "delta", "versions", "blockers"].map((k) => ["prediction", k] as const)),
  ...requiredCases(ALLOWED, PENDING_VERSION_KEYS.map((k) => ["prediction", "versions", k] as const)),
  ...enumsOf(ALLOWED, ["operation"], [...PENDING_OPERATIONS]),
  ...enumsOf(ALLOWED, ["prediction", "state"], [...PREDICTED_STATES]),
  ...enumsOf(BLOCKED, ["reason_code"], [...PREVIEW_REASON_CODES]),
  ...(["requested", "applied", "pending", "cancelled", "rejected"] as const).flatMap((key) => decimalCases(ALLOWED, ["prediction", "amounts", key]).filter((c) => c.category !== "huge-string")),
  ...decimalCases(ALLOWED, ["prediction", "delta"]).filter((c) => c.category !== "huge-string"),
  ...PENDING_VERSION_KEYS.flatMap((key) => decimalCases(ALLOWED, ["prediction", "versions", key]).filter((c) => c.category !== "huge-string")),
  ...integerCases(ALLOWED, ["expires_at_ms"]),
  ...stringCases(ALLOWED, ["original_recall_id"]),
  ...stringCases(ALLOWED, ["profile_ref"]),
  ...stringCases(ALLOWED, ["preview_digest"]),
  ...schemaVersionCases(ALLOWED, ["schema_version"], PENDING_CONTROL_PREVIEW_SCHEMA, ["portal.execution.pending-recall-status.v1", "portal.execution.pending-recall-preview.v2"]),
  ...pollutionCases(ALLOWED, [[], ["prediction"], ["prediction", "amounts"], ["prediction", "versions"]]),
];

describe("L3 · negative · PendingControlPreview", () => {
  it("has a substantial case count", () => {
    console.info(`pendingControlPreview L3: ${NEG.length} cases`);
    expect(NEG.length).toBeGreaterThan(150);
  });

  it.each(NEG.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    expect(() => readPendingControlPreviewV1(c.value, UNIT)).not.toThrow();
    const answer = readPendingControlPreviewV1(c.value, UNIT) as { kind: string } | null;
    expect(leaked(answer, c.probe)).toBe(false);
    expect(prototypeIsClean()).toBe(true);
    const accepted = answer !== null && answer.kind !== "unsupported_shape";
    if (accepted) expect(getPath(c.value, ["schema_version"])).toBe(PENDING_CONTROL_PREVIEW_SCHEMA);
    // Accepted though the schema refuses it: never.
    if (accepted && c.category !== "prototype-pollution") expect(violations(c.value), `accepted though schema-invalid: ${c.name}`).toEqual([]);
  });

  it("an unknown word is never a state: no enum case yields a read", () => {
    for (const c of NEG.filter((x) => x.category === "unknown-enum")) {
      const answer = readPendingControlPreviewV1(c.value, UNIT) as { kind: string } | null;
      expect(answer === null || answer.kind === "unsupported_shape", c.name).toBe(true);
    }
  });

  it.each(rootCases().map((c) => [c.name, c] as const))("%s reads as nothing", (_name, c) => {
    expect(() => readPendingControlPreviewV1(c.value, UNIT)).not.toThrow();
    const answer = readPendingControlPreviewV1(c.value, UNIT);
    if (answer !== null) expect(answer).toEqual({ kind: "unsupported_shape", schemaVersion: null });
  });

  it("the reader is never looser than the schema", () => {
    let looser = 0;
    for (const c of NEG) {
      if (c.category === "prototype-pollution" || c.category === "schema-swapped") continue;
      const answer = readPendingControlPreviewV1(c.value, UNIT) as { kind: string } | null;
      if (violations(c.value).length > 0 && answer !== null && answer.kind !== "unsupported_shape") looser += 1;
    }
    expect(looser).toBe(0);
  });
});
