import { describe, expect, it } from "vitest";

import { PortalApiError } from "../lib/api";
import { cloneFailureState } from "./runCloneClient";

const SENTINEL = "zq_SERVER_PROSE_SENTINEL alice@example.invalid";

describe("FG-08 — clone read failure copy is client-owned", () => {
  it("keeps the server sentence out of the reason and the detail for every refused status", () => {
    for (const status of [400, 401, 403, 404, 409, 422, 500, 503]) {
      const state = cloneFailureState("rrun_1", new PortalApiError(SENTINEL, status, "RESEARCH_X", "req_1"));
      expect(JSON.stringify(state), String(status)).not.toContain("zq_SERVER_PROSE_SENTINEL");
    }
  });

  it("reads a 403 and a 404 as the same denial", () => {
    const denied = cloneFailureState("rrun_1", new PortalApiError(SENTINEL, 403, null, null));
    const missing = cloneFailureState("rrun_1", new PortalApiError(SENTINEL, 404, null, null));
    expect(missing).toEqual(denied);
    expect(denied.state).toBe("denied");
  });

  it("prints the typed code and request id as the only facts of an unavailable read", () => {
    const state = cloneFailureState("rrun_1", new PortalApiError(SENTINEL, 503, "RESEARCH_UNAVAILABLE", "req_9"));
    expect(state.state).toBe("unavailable");
    expect(state.mayRetry).toBe(true);
    expect(state.detail).toBe("RESEARCH_UNAVAILABLE · request req_9");
  });
});
