/**
 * RF01-F4 · one Research refusal mapper (audit F-05), with F1/F3 behaviour.
 */
import { afterEach, describe, expect, it } from "vitest";

import { onSessionExpired } from "../auth/sessionExpiry";
import { PortalApiError } from "../lib/api";
import { toEvidenceRefusal } from "./evidenceClient";
import { toFreezeRefusal } from "./freezeClient";
import { REFUSAL_COPY, RESEARCH_SURFACE_CODES, refusalState, toResearchRefusal } from "./researchRefusal";
import { toLibraryRefusal } from "./runLibraryClient";
import { toSearchRefusal } from "./searchClient";
import { toSplitRefusal } from "./splitClient";

const api = (status: number, code: string | null = null, message = "server words", requestId: string | null = "rq-1") =>
  new PortalApiError(message, status, code, requestId);

let unsubscribe: (() => void) | null = null;
afterEach(() => {
  unsubscribe?.();
  unsubscribe = null;
});

describe("RF01-F4 — one mapper behind the five historical names", () => {
  it("keeps every old name, all pointing at the shared mapper", () => {
    for (const mapper of [toEvidenceRefusal, toSplitRefusal, toSearchRefusal, toFreezeRefusal, toLibraryRefusal]) {
      expect(mapper).toBe(toResearchRefusal);
    }
  });

  it("puts fixed copy on screen and the server's text only in detail", () => {
    const refusal = toResearchRefusal(api(500, null, "psycopg2 OperationalError at /srv"));
    expect(refusal.message).toBe(REFUSAL_COPY.unavailable);
    expect(refusal.message).not.toContain("psycopg2");
    expect(refusal.detail).toBe("psycopg2 OperationalError at /srv");
    const state = refusalState(refusal, false);
    expect(state.reason).toBe(REFUSAL_COPY.unavailable);
    expect(state.detail).toContain("psycopg2");
    expect(state.detail).toContain("request_id rq-1");
  });

  it("lets a P03 code win over the status: saturation is failed-retryable, not unavailable", () => {
    const saturated = toResearchRefusal(api(503, "RESEARCH_ADMISSION_SATURATED"));
    expect(saturated.state).toBe("failed-retryable");
    expect(saturated.mayRetry).toBe(true);
    const forbidden = toResearchRefusal(api(404, "RESEARCH_WORKSPACE_FORBIDDEN"));
    expect(forbidden.state).toBe("denied");
    expect(forbidden.mayRetry).toBe(false);
  });

  it("lets a published surface code win over the status", () => {
    expect(toResearchRefusal(api(400, "RESEARCH_SPLIT_CONFLICT")).state).toBe("stale");
    expect(toResearchRefusal(api(500, "RESEARCH_SEARCH_NOT_FOUND")).state).toBe("empty");
    expect(toResearchRefusal(api(400, "RESEARCH_EVIDENCE_UNAVAILABLE")).state).toBe("unavailable");
    expect(toResearchRefusal(api(503, "RESEARCH_FREEZE_INVALID")).state).toBe("terminal");
    expect(RESEARCH_SURFACE_CODES).toHaveLength(34);
  });

  it("says a retained source that does not exist yet is pending, never that it changed", () => {
    const refusal = toResearchRefusal(
      api(409, "RESEARCH_CURRENT_SOURCE_CONFLICT", "Current QuantBT output is PENDING_RETENTION; a sealed retained artifact is required."),
    );
    expect(refusal.state).toBe("unavailable");
    expect(refusal.message).toMatch(/pending retention/);
    expect(refusal.message).not.toMatch(/changed since/);
    expect(refusal.detail).toContain("PENDING_RETENTION");
  });

  it.each([
    [401, "denied", false, true],
    [403, "denied", false, true],
    [404, "empty", false, true],
    [409, "stale", true, false],
    [422, "terminal", false, false],
    [503, "unavailable", true, false],
  ])("falls back to status %i", (status, state, mayRetry, stops) => {
    const refusal = toResearchRefusal(api(status, "SOMETHING_UNPUBLISHED"));
    expect(refusal.state).toBe(state);
    expect(refusal.mayRetry).toBe(mayRetry);
    expect(refusal.stopsPolling).toBe(stops);
    expect(refusal.terminal).toBe(stops);
  });

  it("reports a transport failure without naming the transport", () => {
    const refusal = toResearchRefusal(new TypeError("Failed to fetch"));
    expect(refusal).toMatchObject({ state: "failed-retryable", mayRetry: true, status: 0, detail: null });
    expect(refusal.message).toBe(REFUSAL_COPY.transport);
  });
});

describe("RF01-F1/F3 — denied is neutral, 401 is the session", () => {
  it("never confirms existence or ownership on 403", () => {
    const refusal = toResearchRefusal(api(403, "RESEARCH_EVIDENCE_FORBIDDEN"));
    expect(refusal.message).toBe("You don't have access to this in your current workspace, or it doesn't exist.");
    expect(refusal.message).not.toMatch(/member|belongs|owner/i);
  });

  it("reports session expiry on 401 and only on 401", () => {
    let reports = 0;
    unsubscribe = onSessionExpired(() => {
      reports += 1;
    });
    const expired = toResearchRefusal(api(401));
    expect(expired.sessionExpired).toBe(true);
    expect(expired.message).toBe(REFUSAL_COPY.session);
    expect(reports).toBe(1);
    toResearchRefusal(api(403));
    toResearchRefusal(api(503));
    expect(reports).toBe(1);
  });
});
