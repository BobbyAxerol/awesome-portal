/**
 * FG-08 (FE-A1-03): the preflight refusal carries a fixed client sentence per
 * contract code. The server's `error.message` stays on the object for
 * diagnostics only; the sentence the screen prints never comes from it.
 */
import { describe, expect, it } from "vitest";

import { PortalApiError } from "../lib/api";
import {
  PREFLIGHT_PROBLEM_CODES,
  PREFLIGHT_REFUSAL_GENERIC_COPY,
  PREFLIGHT_TRANSPORT_COPY,
  PreflightApiError,
  toPreflightRefusal,
  previewLimitCopy,
  PREFLIGHT_QUOTA_GATE,
} from "./preflightClient";

const SENTINEL = "zq_SERVER_PROSE_SENTINEL alice@example.invalid";

describe("FG-08 — preflight refusal copy is client-owned", () => {
  it("gives every contract code its own fixed sentence that is not the server message", () => {
    expect(PREFLIGHT_PROBLEM_CODES).toHaveLength(20);
    for (const code of PREFLIGHT_PROBLEM_CODES) {
      const refusal = toPreflightRefusal(new PreflightApiError(SENTINEL, 422, code, "req_1", null));
      expect(refusal.copy, code).toMatch(/\S/);
      expect(refusal.copy, code).not.toContain(SENTINEL);
      expect(refusal.copy, code).not.toBe(PREFLIGHT_REFUSAL_GENERIC_COPY);
    }
  });

  it("keeps the server message on the object for diagnostics without using it as copy", () => {
    const refusal = toPreflightRefusal(
      new PreflightApiError(SENTINEL, 422, "RESEARCH_PREFLIGHT_DATA_UNAVAILABLE", "req_1", { gate: "DATA", field_path: ["data", "symbol"] }),
    );
    expect(refusal.message).toBe(SENTINEL);
    expect(refusal.copy).toBe("The historical source has no data for this request.");
    expect(refusal).toMatchObject({ gate: "DATA", fieldPath: ["data", "symbol"], requestId: "req_1" });
  });

  it("uses the generic sentence for an unknown code and for a refusal without a code", () => {
    expect(toPreflightRefusal(new PortalApiError(SENTINEL, 422, "RESEARCH_PREFLIGHT_SOMETHING_NEW", null)).copy).toBe(
      PREFLIGHT_REFUSAL_GENERIC_COPY,
    );
    expect(toPreflightRefusal(new PortalApiError(SENTINEL, 500, null, null)).copy).toBe(PREFLIGHT_REFUSAL_GENERIC_COPY);
  });

  it("says the request did not reach the server for a transport failure", () => {
    const refusal = toPreflightRefusal(new TypeError("Failed to fetch"));
    expect(refusal.copy).toBe(PREFLIGHT_TRANSPORT_COPY);
    expect(refusal.code).toBeNull();
  });
});

describe("the active-preview limit is a wait, not a fault in the declaration", () => {
  it("503 with the quota gate: retryable, says how long, never blames the form", () => {
    const refusal = toPreflightRefusal(new PreflightApiError("m", 503, "RESEARCH_PREFLIGHT_UNAVAILABLE", "req_9", { gate: PREFLIGHT_QUOTA_GATE, retry_after_seconds: 270 } as never));
    expect(refusal).toMatchObject({ state: "failed-retryable", mayRetry: true, highlightsInput: false, retryAfterSeconds: 270, gate: PREFLIGHT_QUOTA_GATE });
    expect(refusal.copy).toBe("Preview limit reached: you hold the maximum number of active previews. A slot frees in about 5 min.");
  });
  it("without a wait it still says so; any other 503 keeps the generic sentence", () => {
    expect(previewLimitCopy(null)).toMatch(/Try again in a few minutes/);
    expect(previewLimitCopy(20)).toMatch(/about 1 min/);
    const other = toPreflightRefusal(new PreflightApiError("m", 503, "RESEARCH_PREFLIGHT_UNAVAILABLE", "req_9", null));
    expect(other.copy).toBe("Preflight is unavailable right now. Try again.");
    expect(other.retryAfterSeconds).toBeNull();
  });
});
