import { describe, expect, it } from "vitest";

import { classify, parseLimits, verdictOf } from "./edgeProbe";

describe("probe limits", () => {
  it("defaults when unset or blank", () => {
    expect(parseLimits({})).toEqual({ maxRequests: 150, delayMs: 250, timeoutMs: 15_000 });
    expect(parseLimits({ EDGE_MAX_REQUESTS: " ", EDGE_DELAY_MS: "" })).toEqual({ maxRequests: 150, delayMs: 250, timeoutMs: 15_000 });
  });

  it("accepts finite non-negative values, zero delay and zero requests included", () => {
    expect(parseLimits({ EDGE_MAX_REQUESTS: "0", EDGE_DELAY_MS: "0", EDGE_TIMEOUT_MS: "1" })).toEqual({ maxRequests: 0, delayMs: 0, timeoutMs: 1 });
    expect(parseLimits({ EDGE_DELAY_MS: "12.5" }).delayMs).toBe(12.5);
  });

  it.each([
    ["EDGE_MAX_REQUESTS", "abc"], ["EDGE_MAX_REQUESTS", "-1"], ["EDGE_MAX_REQUESTS", "Infinity"], ["EDGE_MAX_REQUESTS", "NaN"],
    ["EDGE_MAX_REQUESTS", "1.5"], ["EDGE_MAX_REQUESTS", "1001"], ["EDGE_DELAY_MS", "-5"], ["EDGE_DELAY_MS", "Infinity"],
    ["EDGE_DELAY_MS", "60001"], ["EDGE_TIMEOUT_MS", "0"], ["EDGE_TIMEOUT_MS", "-1"], ["EDGE_TIMEOUT_MS", "x"], ["EDGE_TIMEOUT_MS", "120001"],
  ])("refuses %s=%s instead of running with a limit it cannot honour", (name, value) => {
    expect(() => parseLimits({ [name]: value })).toThrow(name);
  });
});

describe("one answer", () => {
  const ok = () => ({ schemaViolations: 0, readerAccepted: true });

  it("a status other than 200 is NOT_200 and is never judged", () => {
    let judged = false;
    expect(classify({ status: 503, body: { a: 1 }, nonJson: false }, () => { judged = true; return ok(); })).toBe("NOT_200");
    expect(judged).toBe(false);
  });

  it("a 200 that is not JSON is a finding and does not dereference a missing schema verdict", () => {
    let judged = false;
    const judge = () => { judged = true; return ok(); };
    expect(classify({ status: 200, body: null, nonJson: true }, judge)).toBe("NON_JSON_BODY");
    expect(classify({ status: 200, body: null, nonJson: false }, judge)).toBe("NON_JSON_BODY");
    expect(judged).toBe(false);
  });

  it("schema violations outrank the reader; a reader refusal outranks OK", () => {
    expect(classify({ status: 200, body: {}, nonJson: false }, () => ({ schemaViolations: 2, readerAccepted: false }))).toBe("SCHEMA_VIOLATIONS");
    expect(classify({ status: 200, body: {}, nonJson: false }, () => ({ schemaViolations: 0, readerAccepted: false }))).toBe("READER_REFUSED");
    expect(classify({ status: 200, body: {}, nonJson: false }, () => ({ schemaViolations: 0, readerAccepted: null }))).toBe("OK");
    expect(classify({ status: 200, body: {}, nonJson: false }, ok)).toBe("OK");
  });
});

describe("run verdict", () => {
  it("is PASS only when something was sent and every sent route is OK", () => {
    expect(verdictOf(["OK", "OK", "SKIPPED_NO_REAL_ID"]).verdict).toBe("PASS");
    expect(verdictOf(["OK", "SCHEMA_VIOLATIONS"]).verdict).toBe("FAIL");
    expect(verdictOf(["OK", "NOT_200"]).verdict).toBe("FAIL");
    expect(verdictOf(["OK", "TIMEOUT"]).verdict).toBe("FAIL");
  });

  it("a run that sent nothing is not a pass", () => {
    expect(verdictOf([]).verdict).toBe("NOTHING_SENT");
    expect(verdictOf(["SKIPPED_NO_REAL_ID", "SKIPPED_REQUEST_CAP"]).verdict).toBe("NOTHING_SENT");
  });

  it("counts each result", () => {
    expect(verdictOf(["OK", "OK", "NOT_200"]).counts).toEqual({ OK: 2, NOT_200: 1 });
  });
});
