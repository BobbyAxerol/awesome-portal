/**
 * FG-08 (FE-A1-01): a failed dataset catalog read is described by client copy
 * chosen by status class, followed only by typed facts (code, request id).
 */
import { describe, expect, it } from "vitest";

import { PortalApiError } from "../lib/api";
import { onSessionExpired } from "../auth/sessionExpiry";
import { CATALOG_FAILURE_COPY, catalogFailureState, splitCatalogReason } from "./datasetClient";

const SENTINEL = "zq_SERVER_PROSE_SENTINEL alice@example.invalid";
const failed = (status: number, code: string | null, requestId: string | null = "req_1") =>
  catalogFailureState(new PortalApiError(SENTINEL, status, code, requestId));

describe("FG-08 — dataset catalog failure copy", () => {
  it("never puts the server message in the reason or the detail", () => {
    for (const [status, code] of [
      [401, "SESSION_REQUIRED"],
      [403, "RESEARCH_WORKSPACE_FORBIDDEN"],
      [404, "RESEARCH_PREFLIGHT_NOT_FOUND"],
      [404, null],
      [400, "RESEARCH_PREFLIGHT_INVALID"],
      [502, "RESEARCH_PREFLIGHT_REJECTED"],
      [503, "RESEARCH_PREFLIGHT_UNAVAILABLE"],
    ] as const) {
      const state = failed(status, code);
      expect(state.reason, `${status}`).not.toContain(SENTINEL);
      expect(state.detail ?? "", `${status}`).not.toContain(SENTINEL);
    }
  });

  it("reads a 403 and a RESEARCH_-coded 404 as the same denial", () => {
    const denied403 = failed(403, "RESEARCH_WORKSPACE_FORBIDDEN", null);
    const denied404 = failed(404, "RESEARCH_WORKSPACE_FORBIDDEN", null);
    expect(denied403.state).toBe("denied");
    expect(denied404).toEqual(denied403);
    /* The code is not printed for a denial: it would tell a 403 from a 404. */
    expect(denied403.reason).toBe(CATALOG_FAILURE_COPY.denied);
    expect(failed(404, "RESEARCH_PREFLIGHT_NOT_FOUND")).toEqual(failed(403, "RESEARCH_WORKSPACE_FORBIDDEN"));
    expect(splitCatalogReason(failed(404, "RESEARCH_PREFLIGHT_NOT_FOUND").reason).sentence).toBe(CATALOG_FAILURE_COPY.denied);
  });

  it("treats 5xx as unavailable and retryable, and other 4xx as terminal", () => {
    expect(failed(503, "RESEARCH_PREFLIGHT_UNAVAILABLE")).toMatchObject({
      state: "unavailable",
      mayRetry: true,
      reason: `${CATALOG_FAILURE_COPY.unavailable} RESEARCH_PREFLIGHT_UNAVAILABLE · request req_1`,
      detail: "RESEARCH_PREFLIGHT_UNAVAILABLE · request req_1",
    });
    expect(failed(400, "RESEARCH_PREFLIGHT_INVALID")).toMatchObject({
      state: "terminal",
      mayRetry: false,
      reason: `${CATALOG_FAILURE_COPY.terminal} RESEARCH_PREFLIGHT_INVALID · request req_1`,
    });
  });

  it("prints the sentence alone when the refusal carried no code and no request id", () => {
    expect(failed(503, null, null).reason).toBe(CATALOG_FAILURE_COPY.unavailable);
  });

  it("keeps the older-server note for a 404 without a RESEARCH_ code", () => {
    expect(failed(404, null)).toMatchObject({
      state: "unavailable",
      reason: "this server does not publish the dataset catalog yet — type the dataset id; preflight checks it.",
    });
  });

  it("raises the session signal on a 401 and reads it as denied", () => {
    let reports = 0;
    const stop = onSessionExpired(() => {
      reports += 1;
    });
    const state = failed(401, "SESSION_REQUIRED");
    stop();
    expect(reports).toBe(1);
    expect(state.state).toBe("denied");
  });

  it("splits a note into its fixed sentence and its facts, and returns free text whole", () => {
    expect(splitCatalogReason(`${CATALOG_FAILURE_COPY.terminal} X_CODE · request r`)).toEqual({
      sentence: CATALOG_FAILURE_COPY.terminal,
      facts: "X_CODE · request r",
    });
    expect(splitCatalogReason("some other reason")).toEqual({ sentence: "some other reason", facts: null });
  });

  it("keeps a transport failure as client copy", () => {
    expect(catalogFailureState(new TypeError("Failed to fetch")).reason).toBe(
      "The dataset catalog request did not reach the server.",
    );
  });
});
