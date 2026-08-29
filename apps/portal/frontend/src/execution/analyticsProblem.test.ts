/**
 * C-PI04-05 gates.
 *
 * The thirteen 422/503 codes are read from the edge service source rather than copied into
 * this file, so a rename or a reclassification upstream fails here instead of
 * reaching an operator as a wrong instruction.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  ANALYTICS_CORRECTABLE,
  ANALYTICS_UNAVAILABLE_CODE,
  analyticsFailureReason,
  readAnalyticsFailure,
} from "./analyticsProblem";

const EDGE = join(
  __dirname,
  "../../../../../services/portal-execution-edge-rs/crates/edge-service/src/main.rs",
);

/**
 * Pull each `(StatusCode::X, "ANALYTICS_Y")` pair out of `analytics_error_contract`.
 * Reading the mapping, not just the names — a code moved from 422 to 503 would
 * change what the UI must offer, and a list of names alone would not notice.
 */
function edgeCodes(): Map<string, number> {
  const source = readFileSync(EDGE, "utf8");
  const out = new Map<string, number>();
  const re = /StatusCode::(UNPROCESSABLE_ENTITY|SERVICE_UNAVAILABLE),\s*\n\s*"(ANALYTICS_[A-Z_]+)"/g;
  for (const m of source.matchAll(re)) {
    out.set(m[2], m[1] === "UNPROCESSABLE_ENTITY" ? 422 : 503);
  }
  return out;
}

describe("the frontend's code list matches the edge service", () => {
  it("finds the mapping at all", () => {
    // Guards the regex: if it stops matching, every assertion below passes
    // vacuously.
    expect(edgeCodes().size).toBe(13);
  });

  it("classifies exactly the twelve 422 codes as correctable", () => {
    const edge = edgeCodes();
    const correctable = [...edge].filter(([, status]) => status === 422).map(([code]) => code);
    expect([...ANALYTICS_CORRECTABLE].sort()).toEqual(correctable.sort());
  });

  it("classifies the one 503 code as infrastructure", () => {
    const edge = edgeCodes();
    const infra = [...edge].filter(([, status]) => status === 503).map(([code]) => code);
    expect(infra).toEqual([ANALYTICS_UNAVAILABLE_CODE]);
  });
});

describe("a correctable failure offers the operator something to do", () => {
  for (const code of ANALYTICS_CORRECTABLE) {
    it(`${code} is actionable and keeps last known data as stale`, () => {
      const f = readAnalyticsFailure({ error: { code, message: "internal detail" } }, 422);
      expect(f.kind).toBe("correctable");
      expect(f.panelStatus).toBe("insufficient_data");
      expect(f.action).toBeTruthy();
      expect(f.keepLastKnownAsStale).toBe(true);
    });
  }

  it("says what to change rather than what went wrong", () => {
    const f = readAnalyticsFailure({ error: { code: "ANALYTICS_INPUT_LIMIT_EXCEEDED" } }, 422);
    expect(analyticsFailureReason(f)).toMatch(/Narrow the selection/);
    expect(analyticsFailureReason(f)).toMatch(/64/);
  });
});

describe("an infrastructure failure does not invite a pointless correction", () => {
  it("offers no action and keeps no stale data", () => {
    const f = readAnalyticsFailure({ error: { code: ANALYTICS_UNAVAILABLE_CODE } }, 503);
    expect(f.kind).toBe("infrastructure");
    expect(f.panelStatus).toBe("unavailable");
    expect(f.action).toBeNull();
    expect(f.keepLastKnownAsStale).toBe(false);
  });

  it("carries retry_after_seconds when the server supplies one", () => {
    const f = readAnalyticsFailure(
      { error: { code: ANALYTICS_UNAVAILABLE_CODE, retry_after_seconds: 30 } },
      503,
    );
    expect(f.retryAfterSeconds).toBe(30);
    expect(readAnalyticsFailure({ error: { code: ANALYTICS_UNAVAILABLE_CODE } }, 503).retryAfterSeconds).toBeNull();
  });
});

describe("unknown codes fail closed", () => {
  it("does not treat an unrecognised code as correctable", () => {
    const f = readAnalyticsFailure({ error: { code: "ANALYTICS_SOMETHING_NEW" } }, 422);
    expect(f.kind).toBe("unknown");
    expect(f.panelStatus).toBe("unavailable");
    expect(f.action).toBeNull();
    expect(f.keepLastKnownAsStale).toBe(false);
  });

  it("handles a body with no error object at all", () => {
    const f = readAnalyticsFailure(null, 500);
    expect(f.code).toBe("HTTP_500");
    expect(f.kind).toBe("unknown");
  });

  it("reads through an envelope wrapper as well as a bare body", () => {
    const wrapped = readAnalyticsFailure(
      { envelope: { error: { code: "ANALYTICS_INVALID_CURRENCY" } } },
      422,
    );
    expect(wrapped.kind).toBe("correctable");
  });
});

describe("nothing from the server's own text reaches the operator", () => {
  it("never repeats the server message, a source id or a path", () => {
    const f = readAnalyticsFailure(
      {
        error: {
          code: "ANALYTICS_SCOPE_MISMATCH",
          message: "entity alpha_id=alp_77 not in /v1/admin/portfolios/pf_3 scope",
        },
      },
      422,
    );
    const text = analyticsFailureReason(f);
    expect(text).not.toContain("alp_77");
    expect(text).not.toContain("/v1/admin");
    expect(text).not.toContain("entity alpha_id");
  });

  it("does not leak an exception string from an unknown failure either", () => {
    const f = readAnalyticsFailure(
      { error: { code: "BOOM", message: "thread 'main' panicked at src/lib.rs:41" } },
      500,
    );
    expect(analyticsFailureReason(f)).not.toContain("panicked");
    expect(analyticsFailureReason(f)).not.toContain("src/lib.rs");
  });
});
