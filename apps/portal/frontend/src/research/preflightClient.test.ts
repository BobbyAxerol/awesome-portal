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
